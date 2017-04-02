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
const HTMLGen = require('html5-gen');
const _ = require('underscore');
const debug = require('debug')('jsernews:app');

const {siteName} = require('./config');
const version = require('./package').version;

const app = express();

// uncomment after placing your favicon in /public
app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

let $h;

// before do block
app.use((req, res, next) => {
  if (!$h) {
    $h = new HTMLGen();
    $h.append(() => {
      return $h.link({href: '/css/style.css?v0.0.1', rel: 'stylesheet'}) +
        $h.link({href: '/favicon.ico', rel: 'shortcut icon'})
    });
    $h.append(applicationHeader(), 'header');
    $h.append(() => {
      return $h.script({src: '//code.jquery.com/jquery-3.1.1.min.js'}) +
        $h.script({src: '/js/app.js?v0.0.1'})
    }, 'body');
  }
  next();
});

app.get('/', (req, res) => {
  $h.setTitle(siteName);
  res.send($h.page('Hello World!'));
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
    }));
  });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
  res.status(err.status || 500);
  res.send(JSON.stringify({
    message: err.message,
    err: {}
  }));
});

// Navigation, header and footer
function applicationHeader(argument) {
  let navitems = [
    ['top', '/'],
    ['latest', '/latest/0'],
    ['random', '/random'],
    ['submit', '/submit']
  ];

  let navbar = $h.nav(navitems.map((ni) => {
    return $h.a({href: ni[1]}, $h.entities(ni[0]));
  }).join(''));

  debug(navbar)
  return $h.header(
    $h.h1(
      $h.a({href: '/'}, $h.entities(siteName) + ' ' + $h.small(version))
    ) + navbar
  );
}

module.exports = app;