const should = require('should');
const redis = require('../redis');
const {addFlags, getUserById, getUserByUsername, hashPassword, hasFlags, isAdmin} = require('../user');

describe('User', () => {
  after(async () => {
    await redis.flushdb();
  });

  it('should get a user by id', async () => {
    let user = await getUserById(1);
    user.id.should.equal('1');
    user.username.should.equal('ts');
  });

  it('should get a user by username', async () => {
    let user = await getUserByUsername('ts');
    user.id.should.equal('1');
    user.username.should.equal('ts');
  });

  it('should add the specified set of flags to the user', async () => {
    let ok = await addFlags(1, 'ak');
    let user = await getUserById(1);
    ok.should.equal(true);
    user.flags.should.equal('ak');
  });

  it('should check a user has flags', async () => {
    let user = {flags: 'a'};
    hasFlags(user, 'a').should.equal(true);
  });

  it('should check a user is admin', async () => {
    let user = {flags: 'a'};
    isAdmin(user).should.equal(true);
  });

  // it('should get a hash password', async () => {
  //   let user = await getUserById(1);
  //   let p = await hashPassword('password', user.salt);
  //   p.should.equal(user.password);
  //   p.length.should.equal(40);
  // });
});