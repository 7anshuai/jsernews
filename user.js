const {pbkdf2} = require('crypto');
const {PBKDF2Iterations} = require('./config')
const debug = require('debug')('jsernews:user');

const $r = require('./redis');
const {getRand} = require('./utils');

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
  let user = await $r.hgetall(`user:${id}`)
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
  return await $r.hgetall(`user:${id}`);
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

module.exports = {
  authUser: authUser,
  updateAuthToken: updateAuthToken,
  checkUserCredentials: checkUserCredentials,
  getUserById: getUserById,
  getUserByUsername: getUserByUsername,
  hashPassword: hashPassword
}