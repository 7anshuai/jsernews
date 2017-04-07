const should = require('should');
const {getUserById, getUserByUsername, hashPassword, hasFlags, isAdmin} = require('../user');

describe('User', () => {
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