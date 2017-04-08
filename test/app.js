const supertest = require('supertest');
const app = require('../app');
const agent = supertest(app);

describe('APP Routes', function () {

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

  it('should get a news page', done => {
    agent.get('/news/1').expect(200, done);
  });

  it('should get a login page', done => {
    agent.get('/login').expect(200, done);
  });

  it('should get a user home page', done => {
    agent.get('/user/ts').expect(200, done);
  });
});