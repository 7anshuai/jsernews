/* eslint-disable no-unused-vars */
const should = require('should');
const {isValidEmail} = require('../mail');

describe('Mail', function () {
  it('should get a truthy value', function (done) {
    isValidEmail('7anshuai@gmail.com').should.true();
    done();
  });

  it('should start or end with alpha or num', function (done) {
    isValidEmail('tanshuai@gmail.com').should.true();
    isValidEmail('_tanshuai@gmail.com').should.false();
    isValidEmail('tanshuai@gmail.com_').should.false();
    done();
  });

  it('Mail name must end with alpha or num', function (done) {
    isValidEmail('tanshuai_@gmail.com').should.false();
    done();
  });

  it('Host name must start with alpha or num', function (done) {
    isValidEmail('tanshuai@_gmail.com').should.false();
    done();
  });

  it('Host name must end with "." plus 2 or 3 or 4 alpha for TopLevelDomain', function (done) {
    isValidEmail('7anshuai@gmail.coms').should.true();
    isValidEmail('7anshuai@gmail.comss').should.false();
    done();
  });
});
