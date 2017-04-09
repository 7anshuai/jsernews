const should = require('should');
const {checkParams, numElapsed, getRand, strElapsed} = require('../utils');

describe('Utils', () => {

  it('should get a truthy value from check parmas', done => {
    let params = {username: 'ts', password: '123456'};

    let result = checkParams(params, 'username', 'password');
    result.should.equal(true);
    done();
  });

  it('should get a falsy value from check parmas', done => {
    let params = {username: 'ts', password: ''};

    let result = checkParams(params, 'username', 'password');
    result.should.equal(false);
    done();
  });

  it('should get a random str', async () => {
    let rand = await getRand();
    rand.should.ok();
    rand.length.should.equal(40);
  });

  it('should get a number representing the seconds elapsed since the UNIX epoch.', async () => {
    const now = numElapsed();
    now.should.equal(parseInt(new Date().getTime() / 1000));
  });

  it('should get a string stating how much time has elapsed from the specified time', done => {
    const now = numElapsed();

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