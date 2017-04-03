const should = require('should');
const {strElapsed} = require('../utils');

describe('Utils', function () {
  it('should get a string stating how much time has elapsed from the specified time', done => {
    const now = parseInt(new Date().getTime() / 1000);

    const oneSecondAgo = strElapsed(now - 1);
    const tenSecondsAgo = strElapsed(now - 10);
    const oneMinuteAgo = strElapsed(now - 60);
    const oneHourAgo = strElapsed(now - 3600);
    const oneDayAgo = strElapsed(now - (3600 * 24));

    oneSecondAgo.should.equal('now');
    tenSecondsAgo.should.equal('10 seconds ago');
    oneMinuteAgo.should.equal('1 minute ago');
    oneHourAgo.should.equal('1 hour ago');
    oneDayAgo.should.equal('1 day ago');
    done();
  });
});