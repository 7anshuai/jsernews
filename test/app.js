const supertest = require('supertest');
const app = require('../app');
const agent = supertest(app);

describe('APP Routes', function () {

  it('should get the home page', done => {
    agent.get('/').expect(200, done);
  });

  it('should get a 404 error', done => {
    agent.get('/404-not-found').expect(404, done);
  })
})