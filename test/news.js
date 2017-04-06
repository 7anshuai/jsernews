const should = require('should');

const {getNewsById} = require('../news');

describe('News', () => {
  it('should get news by id', async () => {
    let news = await getNewsById(1);
    news.should.ok();
  });

  it('should get news by id list', async () => {
    let news = await getNewsById([1, 2]);
    news.should.ok();
    news.length.should.equal(2);
  });
});
