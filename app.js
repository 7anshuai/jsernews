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

const {latestNewsPerPage, siteName, siteDescription} = require('./config');
const {authUser} = require('./user');
const {getLatestNews, getTopNews, newsToHTML, newsListToHTML} = require('./news');
const version = require('./package').version;

const app = express();

// uncomment after placing your favicon in /public
app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

let $h, $user;

// before do block
app.use(async (req, res, next) => {
  if (!$h) {
    $h = global.$h = new HTMLGen();
    $h.append(() => {
      return $h.link({href: '/css/style.css?v0.0.1', rel: 'stylesheet'}) +
        $h.link({href: '/favicon.ico', rel: 'shortcut icon'})
    });
    $h.append(applicationHeader(), 'header');
    $h.append(applicationFooter, 'footer');
    $h.append(() => {
      return $h.script({src: '//code.jquery.com/jquery-3.1.1.min.js'}) +
        $h.script({src: '/js/app.js?v0.0.1'})
    }, 'body');
  }
  $user = global.$user = await authUser(req.cookies.auth);
  // if ($user) increment_karma_if_needed
  next();
});

app.get('/', async (req, res) => {
  let [news, numitems] = await getTopNews();
  $h.setTitle(`${siteName} - ${siteDescription}`);
  res.send($h.page($h.h2('Top News') + newsListToHTML(news)));
});

app.get('/latest', (req, res) => {
  res.redirect('/latest/0');
});

app.get('/latest/:start', async (req, res) => {
  let {start} = req.params;
  $h.setTitle(`Latest News - ${siteName}`);
  let paginate = {
    get: async (start, count) => {
      return await getLatestNews(start, count);
    },
    render: (item) => {
      return newsToHTML(item);
    },
    start: start,
    perpage: latestNewsPerPage,
    link: '/latest/$'
  }
  let newslist = await listItems(paginate);
  res.send($h.page(() => {
    return $h.h2('Latest News') +
      $h.section({id: 'newslist'}, newslist);
  }));
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
    res.send({
      message: err.message,
      error: err
    });
  });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
  res.status(err.status || 500);
  res.send({
    message: err.message,
    err: {}
  });
});

// Navigation, header and footer
function applicationHeader() {
  let navitems = [
    ['top', '/'],
    ['latest', '/latest/0'],
    ['random', '/random'],
    ['submit', '/submit']
  ];

  let navbar = $h.nav(navitems.map((ni) => {
    return $h.a({href: ni[1]}, $h.entities(ni[0]));
  }).join(''));

  let rnavbar = $h.nav({id: 'account'}, () => {
    return $user ?
      $h.a(
        {href: `/user/${$h.urlencode($user.username)}`},
        $h.entities($user.username + ` (${$user.karma})`)
      ) + ' | ' +
      $h.a({href: `/logout?apisecret=${$user.apisecret}`}, 'logout') :
      $h.a({href: '/login'}, 'login / register');
  });

  let mobile_menu = $h.a({href: '#', id: 'link-menu-mobile'}, '<~>');

  return $h.header(
    $h.h1(
      $h.a({href: '/'}, $h.entities(siteName) + ' ' + $h.small(version))
    ) + navbar + rnavbar + mobile_menu
  );
}

function applicationFooter() {
  let apisecret = $user ? $h.script(`var apisecret = '${$user.apisecret}';`) : '';
  return $h.footer(() => {
    let links = [
      ['about', '/about'],
      ['source code', 'https://github.com/7anshuai/jsernews'],
      ['rss feed', '/rss'],
      // ['twitter', footerTwitterLink]
    ];

    return links.map((l) => {
      return l[1] ? $h.a({href: l[1]}, $h.entities(l[0])) : null;
    }).filter((l) => {
      return l;
    }).join(' | ');
  }) + apisecret;
}

// Generic API limiting function
// function rate_limit_by_ip(delay, *tags){
//   let key = "limit:"+tags.join(".");
//   if ($r.exists(key)) return true;
//   $r.setex(key,delay,1);
//   return false
// }

// Show list of items with show-more style pagination.
//
// The function sole argument is an hash with the following fields:
//
// :get     A function accepinng start/count that will return two values:
//          1) A list of elements to paginate.
//          2) The total amount of items of this type.
//
// :render  A function that given an element obtained with :get will turn
//          in into a suitable representation (usually HTML).
//
// :start   The current start (probably obtained from URL).
//
// :perpage Number of items to show per page.
//
// :link    A string that is used to obtain the url of the [more] link
//          replacing '$' with the right value for the next page.
//
// Return value: the current page rendering.
async function listItems(o){
  let aux = "";
  if (o.start < 0) o.start = 0;
  let [items, count] = await o.get.call(o, o.start, o.perpage);

  items.forEach((n) => {
    aux += o.render.call(o, n);
  })

  let last_displayed = parseInt(o.start + o.perpage);
  if (last_displayed < count) {
      let nextpage = o.link.replace("$", last_displayed);
      aux += $h.a({href: nextpage, class: "more"}, '[more]');
  }
  return aux;
}

module.exports = app;