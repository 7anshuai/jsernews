const {createHash} = require('crypto');
const fs = require('fs');
const util = require('util');

// Utility functions

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

function hexdigest(str, algorithm = 'md5') {
  return createHash(algorithm).update(str).digest('hex');
}

// Return a Number representing the seconds elapsed since the UNIX epoch.
function numElapsed(t) {
  let ms = t && new Date(t).getTime();
  if (typeof ms != 'number' || isNaN(ms)) ms = Date.now();
  return parseInt(ms / 1000);
}

// Given an unix time in the past returns a string stating how much time
// has elapsed from the specified time, in the form "2 hours ago".
function strElapsed(t){
  let seconds = parseInt(numElapsed() - t);
  if (seconds <= 1) return 'now';

  let time_lengths = [[86400, "day"], [3600, "hour"], [60, "minute"], [1, "second"]];
  let [length, label] = time_lengths.filter((item) => {
    return seconds >= item[0];
  })[0];
  let units = parseInt(seconds / length);
  return `${units} ${label}${units > 1 ? 's' : ''} ago`;
}

// Combined Comparison / "Spaceship" Operator (<=>) in JavaScript
// See http://stackoverflow.com/questions/34852855/combined-comparison-spaceship-operator-in-javascript
function spaceship(a, b) {
  if ((a === null || b === null) || (typeof a != typeof b)) {
    return null;
  }
  if (typeof a === 'string') {
    return (a).localeCompare(b);
  } else {
    if (a > b) {
      return 1;
    } else if (a < b) {
      return -1;
    }
    return 0;
  }
}

module.exports = {
  checkParams: checkParams,
  getRand: getRand,
  hexdigest: hexdigest,
  numElapsed: numElapsed,
  strElapsed: strElapsed,
  spaceship: spaceship
}