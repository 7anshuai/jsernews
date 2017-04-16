const should = require('should');
const {urlsToLinks} = require('../comments');

describe('Comments', function () {
  it('should get a string with all the urls converted into HTML links.', done => {
    const str = urlsToLinks('I suggest https://google.com/');
    str.should.equal('I suggest <a rel="nofollow" href="https://google.com/">https://google.com/</a>');
    done();
  });
});