const {pbkdf2} = require('crypto');
const _ = require('underscore');
const debug = require('debug')('jsernews:user');

const {karmaIncrementAmount, karmaIncrementInterval, mailRelay, mailFrom, PBKDF2Iterations, userCreationDelay, userInitialKarma} = require('./config');
const {sendMail} = require('./mail');
const $r = require('./redis');
const {getRand, numElapsed} = require('./utils');

// User and authentication

// Try to authenticate the user, if the credentials are ok we assign the
// $user global with the user information.
// Otherwise $user is set to null, so you can test for authenticated user
// just with: if ($user) ...
//
// Return value: user or null
async function authUser(auth){
  if (!auth) return;
  let id = await $r.get(`auth:${auth}`);
  if (!id) return;
  let user = await $r.hgetall(`user:${id}`);
  return user && user.id ? user : null;
}

// Update the specified user authentication token with a random generated
// one. This in other words means to logout all the sessions open for that
// user.
//
// Return value: on success the new token is returned. Otherwise nil.
// Side effect: the auth token is modified.
async function updateAuthToken(user){
  let new_auth_token = await getRand();
  try {
    await $r.del(`auth:${user.auth}`);
    await $r.hmset(`user:${user.id}`, 'auth', new_auth_token);
    await $r.set(`auth:${new_auth_token}`, user.id);
  } catch (err) {
    debug(err);
    return null;
  }
  return new_auth_token;
}

// Create a new user with the specified username/password
//
// Return value: the function returns two values, the first is the
//               auth token if the registration succeeded, otherwise
//               is nil. The second is the error message if the function
//               failed (detected testing the first return value).
async function createUser(username, password, opt){
  let isExists = await $r.exists(`username.to.id:${username.toLowerCase()}`);
  if (isExists)
    return [null, null, 'Username is already taken, please try a different one.'];

  if (await rateLimitByIP(userCreationDelay, 'create_user', opt.ip))
    return [null, null, 'Please wait some time before creating a new user.'];

  let id = await $r.incr('users.count');
  let auth_token = await getRand();
  let apisecret = await getRand();
  let salt = await getRand();
  await $r.hmset(`user:${id}`, {
    'id': id,
    'username': username,
    'salt': salt,
    'password': await hashPassword(password, salt),
    'ctime': numElapsed(),
    'karma': userInitialKarma,
    'about': '',
    'email': '',
    'auth': auth_token,
    'apisecret': apisecret,
    'flags': id == 1 ? 'a' : '', // First user ever created (id = 1) is an admin
    'karma_incr_time': numElapsed()
  });
  await $r.set(`username.to.id:${username.toLowerCase()}`, id);
  await $r.set(`auth:${auth_token}`, id);

  return [auth_token, apisecret, null];
}

// In Lamer News users get karma visiting the site.
// Increment the user karma by KarmaIncrementAmount if the latest increment
// was performed more than KarmaIncrementInterval seconds ago.
//
// Return value: none.
//
// Notes: this function must be called only in the context of a logged in
//        user.
//
// Side effects: the user karma is incremented and the $user hash updated.
async function incrementKarmaIfNeeded(){
  if ((+ $user['karma_incr_time']) < (numElapsed() - karmaIncrementInterval)){
    let userkey = `user:${$user.id}`;
    await $r.hset(userkey, 'karma_incr_time', numElapsed());
    await incrementUserKarmaBy($user.id, karmaIncrementAmount);
  }
}

// Increment the user karma by the specified amount and make sure to
// update $user to reflect the change if it is the same user id.
async function incrementUserKarmaBy(user_id, increment){
  let userkey = `user:${user_id}`;
  await $r.hincrby(userkey, 'karma', increment);
  if ($user && ($user.id == user_id))
    $user.karma = parseInt($user.karma) + increment;
}

// Return the specified user karma.
async function getUserKarma(user_id){
  if ($user && (user_id == $user.id)) return $user.karma;
  let userkey = `user:${user_id}`;
  let karma = await $r.hget(userkey, 'karma');
  return karma ? karma : 0;
}

// Turn the password into an hashed one, using PBKDF2 with HMAC-SHA1
// and 160 bit output.
async function hashPassword(password, salt){
  let p = new Promise((resolve, reject) => {
    pbkdf2(password, salt, PBKDF2Iterations, 160/8, 'sha1', (err, key) => {
      if (err) reject(err);
      resolve(key.toString('hex'));
    });
  });
  return await p;
}

// Return the user from the ID.
async function getUserById(id) {
  let user = await $r.hgetall(`user:${id}`);
  return _.isEmpty(user) ? null : user;
}

// Return the user from the username.
async function getUserByUsername(username){
  let id = await $r.get(`username.to.id:${username.toLowerCase()}`);
  if (!id) return null;
  return await getUserById(id);
}

// Check if the username/password pair identifies an user.
// If so the auth token and form secret are returned, otherwise nil is returned.
async function checkUserCredentials(username, password){
  let user = await getUserByUsername(username);
  if (!user) return null;
  let hp = await hashPassword(password, user['salt']);
  return (user.password == hp) ? [user.auth, user.apisecret] : null;
}

// Add the specified set of flags to the user.
// Returns false on error (non existing user), otherwise true is returned.
//
// Current flags:
// 'a'   Administrator.
// 'k'   Karma source, can transfer more karma than owned.
// 'n'   Open links to new windows.
async function addFlags(user_id, flags){
  let user = await getUserById(user_id);
  if (!user) return false;
  let newflags = user.flags;
  for (let flag of flags) {
    if (!hasFlags(user, flag)) newflags += flag;
  }
  // Note: race condition here if somebody touched the same field
  // at the same time: very unlkely and not critical so not using WATCH.
  await $r.hset(`user:${user.id}`, 'flags', newflags);
  return true;
}

// Check if the user has all the specified flags at the same time.
// Returns true or false.
function hasFlags(user, flags){
  for (let flag of flags){
    if (user.flags.indexOf(flag) == -1) return false;
  }
  return true;
}

function isAdmin(user){
  return hasFlags(user, 'a');
}

// Generic API limiting function
async function rateLimitByIP(delay, ...tags) {
  let key = 'limit:' + tags.join('.');
  if (await $r.exists(key)) return true;
  await $r.setex(key, delay, 1);
  return false;
}

async function sendResetPasswordEmail(user, url){
  if (!mailRelay || !mailFrom) return false;
  let aux = url.split('/');
  if (aux.length < 3) return false;
  let current_domain = aux[0] + '//' + aux[2];

  let reset_link = `${current_domain}/set-new-password?username=${encodeURIComponent(user.username)}&auth=${encodeURIComponent(user.auth)}`;

  let subject = `${aux[2]} password reset`;
  let message = `You can reset your password here: ${reset_link}`;
  return await sendMail(mailRelay, mailFrom, user.email, subject, message);
}

module.exports = {
  addFlags,
  authUser,
  createUser,
  updateAuthToken,
  checkUserCredentials,
  getUserById,
  getUserByUsername,
  getUserKarma,
  hashPassword,
  hasFlags,
  isAdmin,
  incrementKarmaIfNeeded,
  incrementUserKarmaBy,
  sendResetPasswordEmail
};
