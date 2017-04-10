const url = require('url');
const Redis = require('ioredis');

const {redisURL} = require('./config');

function setupRedis(uri=redisURL || 'redis://127.0.0.1:6379') {
  uri = url.parse(uri);
  return new Redis({
    port: uri.port,
    host: uri.hostname,
    password: uri.password,
    db: process.env.NODE_ENV === 'test' ? 1 : 0
  });
}

module.exports = setupRedis(redisURL);