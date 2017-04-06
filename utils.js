const fs = require('fs');
const util = require('util');

// Utility functions

// Given an unix time in the past returns a string stating how much time
// has elapsed from the specified time, in the form "2 hours ago".
function strElapsed(t){
  let seconds = parseInt(new Date().getTime() / 1000 - t);
  if (seconds <= 1) return 'now';

  let time_lengths = [[86400, "day"], [3600, "hour"], [60, "minute"], [1, "second"]];
  let [length, label] = time_lengths.filter((item) => {
    return seconds >= item[0];
  })[0];
  let units = parseInt(seconds/length);
  return `${units} ${label}${units > 1 ? 's' : ''} ago`;
}

// Check that the list of parameters specified exist.
// If at least one is missing false is returned, otherwise true is returned.
//
// If a parameter is specified as as symbol only existence is tested.
// If it is specified as a string the parameter must also meet the condition
// of being a non empty string.
function checkParams (params, ...required) {
  for (let p of required) {
    if (params[p] && typeof params[p] == 'string') params[p] = params[p].trim();
    if (!params[p]) return false;
  }
  return true;
}

// Return the hex representation of an unguessable 160 bit random number.
async function getRand() {
  let p = new Promise((resolve, reject) => {
    fs.open('/dev/urandom', 'r', (err, fd) => {
      if (err) return reject(err);
      let b = new Buffer(20);
      fs.read(fd, b, 0, 20, 0, (err, byteRead, buffer) => {
        if (err) reject(err);
        resolve(buffer.toString('hex'));
      });
    });
  });
  return await p;
}

module.exports = {
  checkParams: checkParams,
  getRand: getRand,
  strElapsed : strElapsed
}