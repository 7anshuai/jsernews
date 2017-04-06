const should = require('should');
const {getUserById, getUserByUsername, hashPassword} = require('../user');

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

  // it('should get a hash password', async () => {
  //   let user = await getUserById(1);
  //   let p = await hashPassword('password', user.salt);
  //   p.should.equal(user.password);
  //   p.length.should.equal(40);
  // });
});