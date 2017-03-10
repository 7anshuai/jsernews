/**
 * Module dependencies.
 */

'use strict';

const path = require('path');
const url = require('url');

const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const favicon = require('serve-favicon');
const logger = require('morgan');
const Redis = require('ioredis');
const HTMLGen = require('HTMLGen');

const config = require('./config');

const app = express();

const version = require('./package').version;

for (let name in config) {
  global[name] = config[name];
}

// uncomment after placing your favicon in /public
app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

var $r, $user, $h;

function setupRedis(uri=RedisURL || 'redis://127.0.0.1:6379') {
  var uri = url.parse(uri);
  if (!$r) $r = new Redis({port: uri.port, host: uri.hostname, password: uri.password });
}

// before do block
app.use((req, res, next) => {
  if (!$h) $h = new HTMLGen();
  setupRedis();
  next();
});

app.get('/', (req, res) => {
  $h.setTitle(SiteName);
  res.send($h.page('Hello World!'))
});

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
  app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.send(JSON.stringify({
      message: err.message,
      error: err
    }))
  });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
  res.status(err.status || 500);
  res.send(JSON.stringify({
    message: err.message,
    err: {}
  }))
});


module.exports = app;