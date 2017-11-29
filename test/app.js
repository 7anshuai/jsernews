const should = require('should');
const supertest = require('supertest');
const app = require('../app');
const redis = require('../redis');

const agent = supertest(app);

describe('APP Routes', function () {

  after(async () => {
    await redis.flushdb();
  });

  let auth, apisecret;

  it('should get the home page', done => {
    agent.get('/').expect(200, done);
  });

  it('should get a 404 error', done => {
    agent.get('/404-not-found').expect(404, done);
  });

  it('should redirect to the `/latest/0`', done => {
    agent.get('/latest').expect(302, 'Found. Redirecting to /latest/0', done);
  });

  it('should get the latest page', done => {
    agent.get('/latest/0').expect(200, done);
  });

  it('should redirect to a random news page', done => {
    agent.get('/random').expect(302, done);
  });

  it('should get a login page', done => {
    agent.get('/login')
      .expect(200)
      .end((err, res) => {
        if (err) return done(err);
        res.body.should.ok();
        done();
      });
  });

  it('should create a account', done => {
    agent.post('/api/create_account')
      .send({
        username: 'ts',
        password: 'password'
      })
      .set('Accept', 'application/json')
      .expect(200)
      .end((err, res) => {
        if (err) return done(err);
        res.body.status.should.equal('ok');
        res.body.auth.should.ok();
        res.body.apisecret.should.ok();
        auth = res.body.auth;
        apisecret = res.body.apisecret;
        done();
      });
  });

  it('should create a news', done => {
    agent.post('/api/submit')
      .send({
        apisecret: apisecret,
        news_id: -1,
        title: 'JSer News',
        url: 'https://jsernews.com/'
      })
      .set('cookie', `auth=${auth}`)
      .expect(200)
      .end((err, res) => {
        if (err) return done(err);
        res.body.status.should.equal('ok');
        res.body.news_id.should.equal(1);
        done();
      });
  });

  it('should get a login err', done => {
    agent.post('/api/login')
      .send({
        username: 'ts',
        password: '123456'
      })
      .set('Accept', 'application/json')
      .expect(200)
      .end((err, res) => {
        if (err) return done(err);
        res.body.status.should.equal('err');
        done();
      })
  });

it('should login successfully', done => {
    agent.post('/api/login')
      .send({
        username: 'ts',
        password: 'password'
      })
      .set('Accept', 'application/json')
      .expect(200)
      .end((err, res) => {
        if (err) return done(err);
        res.body.status.should.equal('ok');
        res.body.auth.should.ok();
        res.body.apisecret.should.ok();
        auth = res.body.auth;
        apisecret = res.body.apisecret;
        done();
      });
  });

  it('should logout successfully', done => {
    agent.post('/api/logout')
      .send({
        apisecret: apisecret
      })
      .set('cookie', `auth=${auth}`)
      .expect(200)
      .end((err, res) => {
        if (err) return done(err);
        res.body.status.should.equal('ok');
        done();
      });
  });

  it('should get a user home page', done => {
    agent.get('/user/ts').expect(200, done);
  });

  it('should get a user posted news page', done => {
    agent.get('/usernews/ts/0').expect(200, done);
  });

  it('should get a news page', done => {
    agent.get('/news/1').expect(200, done);
  });
});
