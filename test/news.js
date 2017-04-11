const should = require('should');
const redis = require('../redis');
const {getNewsById, insertNews} = require('../news');
const {createUser} = require('../user');

describe('News', () => {
  before(async () => {
    await createUser('ts', '123456', {ip: '127.0.0.1'});
  });

  after(async () => {
    await redis.flushdb();
  });

  it('should insert a news with url', async () => {
    let newsId = await insertNews('JSER NEWS', 'https://jsernews.com/', '', 1);
    newsId.should.equal(1);
  });

  it('should insert a new with text', async () => {
    let newsId = await insertNews('JSer News', '', 'An LN(lamer news) style social news site written in Node/Express/Redis/jQuery', 1);
    newsId.should.equal(2);
  });

  it('should get news by id', async () => {
    let news = await getNewsById(1);
    news.should.ok();
    news.id.should.equal('1');
    news.title.should.equal('JSER NEWS');
    news.url.should.equal('https://jsernews.com/');
    news.up.should.equal('1');
    news.down.should.equal('0');
    news.user_id.should.equal('1');
    news.username.should.equal('ts');
  });

  it('should get news by id list', async () => {
    let news = await getNewsById([1, 2]);
    news.should.ok();
    news.length.should.equal(2);
    news[1].id.should.equal('2');
    news[1].title.should.equal('JSer News');
    news[1].url.should.equal('text://An LN(lamer news) style social news site written in Node/Express/Redis/jQuery');
    news[1].up.should.equal('1');
    news[1].down.should.equal('0');
    news[1].user_id.should.equal('1');
    news[1].username.should.equal('ts');
  });
});
