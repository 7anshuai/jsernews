const debug = require('debug')('jsernews:user');

const $r = require('./redis');

// Try to authenticate the user, if the credentials are ok we populate the
// $user global with the user information.
// Otherwise $user is set to nil, so you can test for authenticated user
// just with: if $user ...
//
// Return value: none, the function works by side effect.
async function authUser(auth){
  if (!auth) return;
  let id = await $r.get("auth:#{auth}");
  if (!id) return;
  let user = await $r.hgetall("user:#{id}")
  return user.length > 0 ? user : null;
}

module.exports = {
  authUser: authUser
}