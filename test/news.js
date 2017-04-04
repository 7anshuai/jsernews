const assert = require('assert');
const should = require('should');

const {getNewsById} = require('../news');

describe('News', () => {
  it('should get news by id', async () => {
    let news = await getNewsById(1);
    assert.ok(news);
  });

  it('should get news by id list', async () => {
    let news = await getNewsById([1, 2]);
    assert.ok(news);
    assert.equal(news.length, 2);
  });
});
