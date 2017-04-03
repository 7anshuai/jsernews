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

module.exports = {
  strElapsed : strElapsed
}