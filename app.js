/**
 * Module dependencies.
 */

'use strict';

const path = require('path');

const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const favicon = require('serve-favicon');
const logger = require('morgan');
const _ = require('underscore');
const debug = require('debug')('jsernews:app');
const fetch = require('node-fetch');
const h = require('hyperscript');
const reds = require('reds');

const {Comment, commentToHtml, computeCommentScore, getUserComments, insertComment, voteComment, renderCommentsForNews, renderCommentSubthread} = require('./comments');
const {deletedUser, footerTwitterLink, keyboardNavigation, latestNewsPerPage, passwordMinLength, passwordResetDelay, savedNewsPerPage, siteName, siteDescription, siteUrl, subthreadsInRepliesPage, userCommentsPerPage, usernameRegexp} = require('./config');
const {authUser, checkUserCredentials, createUser, createGitHubUser, getUserById, getUserByUsername, hashPassword, incrementKarmaIfNeeded, isAdmin, sendResetPasswordEmail, updateAuthToken} = require('./user');
const {computeNewsRank, computeNewsScore, getLatestNews, getTopNews, getNewsById, getNewsDomain, getNewsText, getPostedNews, getSavedNews, delNews, editNews, insertNews, voteNews, newsToHTML, newsListToHTML, newsListToRSS} = require('./news');
const {checkParams, hexdigest, numElapsed, strElapsed} = require('./utils');
global.$r = require('./redis');
const version = require('./package').version;

const app = express();

// uncomment after placing your favicon in /public
app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(logger(app.get('env') === 'production' ? 'combined' : 'dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// before do block
app.use(async (req, res, next) => {

  global.$user = await authUser(req.cookies.auth);
  if ($user) await incrementKarmaIfNeeded();

  // Create a global `HTMLElement`
  let head = h('head',
    h('meta', {charset: 'utf-8'}),
    h('meta', {content: 'width=device-width, initial-scale=1, maximum-scale=1', name: 'viewport'}),
    h('meta', {content: 'index', name: 'robots'}),
    h('title', `${siteName} - ${siteDescription}`),
    h('link', {href: '/favicon.ico', rel: 'shortcut icon'}),
    h('link', {href: '/apple-touch-icon.png', rel: 'apple-touch-icon'}),
    h('link', {rel: 'stylesheet', href: `/css/lit.css?v=${version}`}),
    h('link', {href: `/css/style.css?v=${version}`, rel: 'stylesheet'}),
    h('link', {rel: 'stylesheet', href: '//cdn.jsdelivr.net/gh/highlightjs/cdn-release@9.12.0/build/styles/default.min.css'}));
  let content = h('section#content');
  global.$doc = h('html',
    head,
    h('body',
      h('.c',
        applicationHeader(),
        h('hr'),
        content,
        h('hr'),
        applicationFooter()),
      h('script', {src: '//cdn.jsdelivr.net/npm/zepto@1.2.0/dist/zepto.min.js'}),
      h('script', {src: '//cdn.jsdelivr.net/npm/zepto@1.2.0/src/fx.js'}),
      h('script', {src: `/js/app.js?v=${version}`}),
      $user ? h('script', `var apisecret = '${$user.apisecret}';`) : '',
      keyboardNavigation == 1 ? h('script', 'setKeyboardNavigation();') : '')
  );
  $doc.head = head;
  $doc.title = head.childNodes[3];
  $doc.body = $doc.childNodes[1];
  $doc.content = content;

  if (!global.comment) global.comment = new Comment($r, 'comment', (c) => {
    return c.sort((a, b) => {
      let ascore = computeCommentScore(a);
      let bscore = computeCommentScore(b);
      if (ascore == bscore) {
        // If score is the same favor newer comments
        return (+b.ctime > +a.ctime) - (+b.ctime < +a.ctime);
      } else {
        // If score is different order by score.
        // FIXME: do something smarter favouring newest comments
        // but only in the short time.
        return (bscore > ascore) - (bscore < ascore);
      }
    });
  });

  next();
});

app.get('/', async (req, res) => {
  let [news] = await getTopNews();

  $doc.content.appendChild(h('h2', 'Top News'));
  $doc.content.appendChild(newsListToHTML(news, req.query));
  res.send($doc.outerHTML);
});

app.get('/latest', (req, res) => {
  res.redirect('/latest/0');
});

app.get('/latest/:start', async (req, res, next) => {
  let {start} = req.params;
  start = parseInt(start);
  if (isNaN(start)) return next();

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
  };
  let newslist = await listItems(paginate);
  $doc.title.textContent = `Latest News - ${siteName}`;
  $doc.content.appendChild(h('h2', 'Latest News'));
  $doc.content.appendChild(h('#newslist', newslist));
  res.send($doc.outerHTML);
});

app.get('/random', async (req, res) => {
  let counter = await $r.get('news.count');
  let random = 1 + _.random(parseInt(counter));

  res.redirect(await $r.exists(`news:${random}`) ? `/news/${random}` : `/news/${counter}`);
});

app.get('/replies', async (req, res) => {
  if (!$user) return res.redirect('/login');
  let [comments] = await getUserComments($user.id, 0, subthreadsInRepliesPage);

  $doc.title.textContent = `Your threads - ${siteName}`;
  $doc.content.appendChild(h('h2', 'Your threads'));
  $doc.content.appendChild(h('#comments', await (async () => {
    let aux = [];
    for (let c of comments) {
      aux.push(await renderCommentSubthread(c));
    }
    await $r.hset(`user:${$user.id}`, 'replies', 0);
    return aux;
  })()));
  res.send($doc.outerHTML);
});

app.get('/rss', async (req, res) => {
  let [news] = await getLatestNews();
  let rss = `<rss xmlns:atom="http://www.w3.org/2005/Atom" version="2.0">
      <channel>
        <title>${siteName}</title>
        <link>${siteUrl}</link>
        <description>${siteDescription}</description>
        ${newsListToRSS(news)}
      </channel>
    </rss>`;

  res.type('xml').send(rss);
});

app.get('/search', (req, res, next) => {
  let {q, t} = req.query;
  t = t || 'news';

  let placeholders = ['CSS', 'ES6', 'HTTP', 'HTML5', 'JavaScript', 'Node.js', 'Webpack'];
  let random = _.random(parseInt(placeholders.length - 1));
  let placeholder = placeholders[random];
  let searchtips = h('.searchtips', 'Simple full text search by ', h('a', {href: 'https://github.com/tj/reds'}, 'reds'),', only support English now.');

  $doc.title.textContent = `Search News - ${siteName}`;
  if (!q) {
    $doc.content.appendChild(h('h2', 'Search News 🔍'));
    $doc.content.appendChild(h('#searchform', h('form', {name: 'f', action: '/search'},
      h('input', {type: 'hidden', name: 't', value: 'news'}),
      h('input.card.w-100', {type: 'text', name: 'q', placeholder: placeholder, required: true}),
      h('input.btn.btn-small.primary', {type: 'submit', value: 'Search'}),
      searchtips
    )));

    return res.send($doc.outerHTML);
  } else {
    let search = reds.createSearch(t);
    search.query(q).end(async (err, ids) => {
      if (err) return next(err);
      if (!ids.length) {
        $doc.content.appendChild(h('h2', 'Search News 🔍'));
        $doc.content.appendChild(h('#searchform', h('form', {name: 'f', action: '/search'},
          h('input', {type: 'hidden', name: 't', value: 'news'}),
          h('input.card.w-100', {type: 'text', name: 'q', placeholder: placeholder, required: true, value: q}),
          h('input.btn.btn-small.primary', {type: 'submit', value: 'Search'}),
          searchtips,
          h('#errormsg', h('span', '"Nothing for you, JSer."'), h('br'), h('span', '0 result'))
        )));

        return res.send($doc.outerHTML);
      } else {
        let news = await getNewsById(ids);
        $doc.content.appendChild(h('h2', 'Search News 🔍'));
        $doc.content.appendChild(h('#searchform', h('form', {name: 'f', action: '/search'},
          h('input', {type: 'hidden', name: 't', value: 'news'}),
          h('input.card.w-100', {type: 'text', name: 'q', placeholder: placeholder, required: true, value: q}),
          h('input.btn.btn-small.primary', {type: 'submit', value: 'Search'}),
          searchtips,
          h('#successmsg', `Found ${ids.length} result${ids.length > 1 ? 's': ''} for "${q}":`)
        )));
        $doc.content.appendChild(newsListToHTML(news, req.query));

        return res.send($doc.outerHTML);
      }
    });
  }

});

app.get('/news/:news_id', async (req, res, next) => {
  let {news_id} = req.params;
  let news = await getNewsById(parseInt(news_id));
  if (!news || !news.id) {
    let err = new Error('This news does not exist.');
    err.status = 404;
    return next(err);
  }

  // Show the news text if it is a news without URL.
  let user, top_comment;
  if (!getNewsDomain(news) && !news.del) {
    let c = {
      body: getNewsText(news),
      ctime: news.ctime,
      user_id: news.user_id,
      thread_id: news.id,
      topcomment: true
    };
    user = await getUserById(news.user_id) || deletedUser;
    top_comment = h('.topcomment', commentToHtml(c, user));
  }

  $doc.title.textContent = `${news.title} - ${siteName}`;
  $doc.body.appendChild(h('script', '$(function() {$("input[name=post_comment]").click(post_comment);});'));

  $doc.content.appendChild(newsToHTML(news));
  if (top_comment) $doc.content.appendChild(top_comment);
  let comments = await renderCommentsForNews(news.id);
  if (comments) $doc.content.appendChild(comments);
  if ($user && !news.del) {
    $doc.content.appendChild(h('form', {name: 'f'}, h('input', {name: 'news_id', type: 'hidden', value: news.id}),
      h('input', {name: 'comment_id', type: 'hidden', value: -1}),
      h('input', {name: 'parent_id', type: 'hidden', value: -1}),
      h('textarea.card.w-100', {name: 'comment', placeholder: 'You can write comment here in Markdown or HTML', rows: 6}),
      h('input.btn.btn-small.primary', {name: 'post_comment', type: 'submit', value: 'Send comment'})));
    $doc.content.appendChild(h('#errormsg'));
  }

  res.send($doc.outerHTML);
});

app.get('/editnews/:news_id', async (req, res, next) => {
  if (!$user) return res.redirect('/login');
  let news_id = req.params.news_id;
  let news = await getNewsById(news_id);
  if (!news) {
    let err = new Error('This news does not exist.');
    err.status = 404;
    return next(err);
  }
  if (parseInt($user.id) != parseInt(news.user_id) && !isAdmin($user)) {
    let err = new Error('Permission denied.');
    err.status = 403;
    return next(err);
  }

  let text;
  if (getNewsDomain(news)) {
    text = '';
  } else {
    text = getNewsText(news);
    news.url = '';
  }

  $doc.title.textContent = `Edit news - ${siteName}`;
  $doc.body.appendChild(h('script', '$(function() {$("input[name=edit_news]").click(submit);});'));
  let form = h('div', {id: 'submitform'},
    h('form', {name: 'f'},
      h('input', {name: 'news_id', value: news.id, type: 'hidden'}),
      h('label', {for: 'title'}, 'title'),
      h('input.card.w-100', {id: 'title', name: 'title', placeholder: 'Type your news title here', value: news.title, type: 'text'}),
      h('label', {for: 'url'}, 'url'),
      h('input.card.w-100', {id: 'url', name: 'url', placeholder: 'Type your news url here', value: _.escape(news.url), type: 'text'}),
      h('label', {for: 'text'}, 'text'),
      h('textarea.card.w-100', {id: 'text', name: 'text', placeholder: 'If you don\'t have an url, type some text here in Markdown or HTML', rows: 6}, text),
      h('input', {id: 'del', name: 'del', value: '1', type: 'checkbox'}), ' ', h('label', {for: 'del'}, 'delete this news'), h('br'),
      h('input.btn.btn-small.primary', {name: 'edit_news', value: 'Edit news', type: 'submit'})
    ));

  [newsToHTML(news), form, h('#errormsg')].forEach(node => {
    $doc.content.appendChild(node);
  });

  res.send($doc.outerHTML);
});

app.get('/user/:username', async (req, res, next) => {
  let username = req.params.username;
  let user = await getUserByUsername(username);
  if (!user) {
    let err = new Error('Non existing user.');
    err.status = 404;
    return next(err);
  }
  let [posted_news, posted_comments] = await $r.pipeline([
    ['zcard', `user.posted:${user.id}`],
    ['zcard', `user.comments:${user.id}`]
  ]).exec();

  let owner = $user && ($user.id == user.id);
  $doc.title.textContent = `${user.username} - ${siteName}`;
  $doc.content.appendChild(h('.userinfo',
    h('span', {class: 'avatar'}, (() => {
      let email = user.email || '';
      let digest = hexdigest(email);
      return h('img', {src: `//gravatar.com/avatar/${digest}?s=48&d=mm`});
    })()),
    h('h2', _.escape(user.username)),
    h('pre', _.escape(user.about)),
    h('ul',
      h('li', h('b', 'created '), strElapsed(+ user.ctime)),
      h('li', h('b', 'karma '), `${user.karma} points`),
      h('li', h('b', 'posted news '), `${posted_news[1]}`),
      h('li', h('b', 'posted comments '), `${posted_comments[1]}`),
      (owner ? h('li', h('a', {href: '/saved/0'}, 'saved news')) : ''),
      h('li', h('a', {href: `/usercomments/${encodeURIComponent(user.username)}/0`}, 'user comments')),
      h('li', h('a', {href: `/usernews/${encodeURIComponent(user.username)}/0`}, 'user news'))),
    (owner ? $doc.body.appendChild(h('script', '$(function(){$("input[name=update_profile]").click(update_profile);});')) &&
      [h('br'), h('form', {name: 'f'},
        h('label', {for: 'email'}, 'email (not visible, used for gravatar)'),
        h('input.card.w-100', {id: 'email', name: 'email', type: 'text', value: _.escape(user.email)}),
        h('label', {for: 'password'}, 'change password (optional)'),
        h('input.card.w-100', {name: 'password', type: 'password'}),
        h('label', {for: 'about'}, 'about'),
        h('textarea.card.w-100', {id: 'about', name: 'about', rows: 6}, _.escape(user.about)),
        h('input.btn.btn-small.primary', {name: 'update_profile', type: 'submit', value: 'Update profile'})
      ), h('div', {id: 'errormsg'})] : '')));

  res.send($doc.outerHTML);
});

app.get('/usernews/:username/:start', async (req, res, next) => {
  let start = + req.params.start;
  let user = await getUserByUsername(req.params.username);
  if (typeof start != 'number' || isNaN(start)) return next();
  if (!user) {
    let err = new Error('Non existing user.');
    err.status = 404;
    return next(err);
  }

  let paginate = {
    get: async (start, count) => {
      return await getPostedNews(user.id, start, count);
    },
    render: (item) => {
      return newsToHTML(item);
    },
    start: start,
    perpage: savedNewsPerPage,
    link: `/usernews/${_.escape(user.username)}/$`
  };
  let newslist = await listItems(paginate);

  $doc.title.textContent = `News posted by ${user.username} - ${siteName}`;
  $doc.content.appendChild(h('h2', `News posted by ${user.username}`));
  $doc.content.appendChild(h('#newslist', newslist));
  res.send($doc.outerHTML);
});

app.get('/saved/:start', async (req, res, next) => {
  let start = + req.params.start;
  if (!$user) return res.redirect('/login');
  if (typeof start != 'number' || isNaN(start)) return next();

  let paginate = {
    get: async (start, count) => {
      return await getSavedNews($user.id, start, count);
    },
    render: (item) => {
      return newsToHTML(item);
    },
    start: start,
    perpage: savedNewsPerPage,
    link: '/saved/$'
  };
  let newslist = await listItems(paginate);
  $doc.title.textContent = `Saved news - ${siteName}`;
  $doc.content.appendChild(h('h2', 'You saved News'));
  $doc.content.appendChild(h('#newslist', newslist));
  res.send($doc.outerHTML);
});

app.get('/usercomments/:username/:start', async (req, res, next) => {
  let start = + req.params.start;
  let user = await getUserByUsername(req.params.username);
  if (typeof start != 'number' || isNaN(start)) return next();
  if (!user) {
    let err = new Error('Non existing user.');
    err.status = 404;
    return next(err);
  }

  let paginate = {
    get: async (start, count) => {
      return await getUserComments(user.id, start, count);
    },
    render: async (comment) => {
      let u = await getUserById(comment.user_id) || deletedUser;
      return commentToHtml(comment, u);
    },
    start: start,
    perpage: userCommentsPerPage,
    link: `/usercomments/${_.escape(user.username)}/$`
  };

  $doc.title.textContent = `${user.username} comments - ${siteName}`;
  $doc.content.appendChild(h('h2', `${_.escape(user.username)} comments`));
  $doc.content.appendChild(h('#comments', await listItems(paginate)));
  res.send($doc.outerHTML);
});

app.get('/comment/:news_id/:comment_id', async (req, res, next) => {
  let {news_id, comment_id} = req.params;
  let news = await getNewsById(news_id);
  if (!news) {
    let err = new Error('This news does not exist.');
    err.status = 404;
    return next(err);
  }

  let comment = await global.comment.fetch(news_id, comment_id);
  if (!comment) {
    let err = new Error('This news does not exist.');
    err.status = 404;
    return next(err);
  }

  $doc.title.textContent = `${news.title} - ${siteName}`;
  $doc.content.appendChild(h('section#newslist', newsToHTML(news)));
  let comments = await renderCommentSubthread(comment, h('h4', 'Replies'));
  if (comments.length) {
    for (let c of comments) {
      if (c) $doc.content.appendChild(c);
    }
  }
  res.send($doc.outerHTML);
});

app.get('/reply/:news_id/:comment_id', async (req, res, next) => {
  if (!$user) return res.redirect('/login');
  let {news_id, comment_id} = req.params;
  let news = await getNewsById(news_id);
  if (!news) {
    let err = new Error('This news does not exist.');
    err.status = 404;
    return next(err);
  }

  let comment = await global.comment.fetch(news_id, comment_id);
  if(!comment) {
    let err = new Error('This comment does not exist.');
    err.status = 404;
    return next(err);
  }
  let user = await getUserById(comment.user_id) || deletedUser;

  $doc.title.textContent = `Reply to comment - ${siteName}`;
  $doc.body.appendChild(h('script', '$(function() {$("input[name=post_comment]").click(post_comment);});'));
  $doc.content.appendChild(h('div',
    newsToHTML(news),
    commentToHtml(comment, user),
    h('form', {name: 'f'},
      h('input', {type: 'hidden', name: 'news_id', value: news.id}),
      h('input', {type: 'hidden', name: 'comment_id', value: -1}),
      h('input', {type: 'hidden', name: 'parent_id', value: comment_id}),
      h('textarea.card.w-100', {name: 'comment', placeholder: 'You can write comment here in Markdown or HTML', rows: 6}), h('br'),
      h('input.btn.btn-small.primary', {type: 'submit', name: 'post_comment', value: 'Reply'})
    ), h('div', {id: 'errormsg'})
  ));
  res.send($doc.outerHTML);
});

app.get('/editcomment/:news_id/:comment_id', async (req, res, next) => {
  if (!$user) return res.redirect('/login');

  let {news_id, comment_id} = req.params;
  let news = await getNewsById(news_id);
  if (!news) {
    let err = new Error('This news does not exist.');
    err.status = 404;
    return next(err);
  }

  let comment = await global.comment.fetch(news_id, comment_id);
  if (!comment) {
    let err = new Error('This comment does not exist.');
    err.status = 404;
    return next(err);
  }

  let user = await getUserById(comment.user_id) || deletedUser;
  if (+$user.id != +user.id) {
    let err = new Error('Permission denied.');
    err.status = 403;
    return next(err);
  }

  $doc.title.textContent = `Edit comment - ${siteName}`;
  $doc.body.appendChild(h('script', '$(function() {$("input[name=post_comment]").click(post_comment);});'));
  [ newsToHTML(news),
    commentToHtml(comment, user),
    h('form', {name: 'f'},
      h('input', {type: 'hidden', name: 'news_id', value: news.id}),
      h('input', {type: 'hidden', name: 'comment_id',value: comment_id}),
      h('input', {type: 'hidden', name: 'parent_id', value: -1}),
      h('textarea.card.w-100', {name: 'comment', placeholder: 'You can write comment here in Markdown or HTML', rows: 6}, comment.body), h('br'),
      h('input.btn.btn-small.primary', {name: 'post_comment', type: 'submit', value: 'Edit'})),
    h('#errormsg'),
    h('.note', 'Note: to remove the comment, remove all the text and press Edit.')
  ].forEach( node => {
    $doc.content.appendChild(node);
  });
  res.send($doc.outerHTML);
});

app.get('/about', (req, res) => {
  $doc.title.textContent = `About - ${siteName}`;
  $doc.content.appendChild(h('#about',
    h('h2', `${siteName} 是什么？`),
    h('p', `${siteName} 是一个社区驱动的 JavaScript 中文新闻网站，完全专注于 JavaScript 开发，HTML5，前端和 Node.js`),
    h('h3', '成员'),
    h('p', '创立与维护者: ', h('a', {href: '/user/ts'}, '@ts')),
    h('h3','发帖规则：'),
    h('ul',
      h('li', '编辑标题：只允许文章标题，不带博客名，不带日期等其他信息'),
      h('li', '编辑 URLs：不带跟踪代码'),
      h('li', '尊重惯例：JavaScript，不用 javascript 或 javaScript 或 Javascript'),
      h('li', '标记超过一年的文章。例如： Welcome to JSer News! (2015)'),
      h('li', '不链接到摘要，仅链接到原始内容'),
      h('li', '不使用短地址，只允许到页面的真实链接'),
      h('li', '仅发布 JavaScript 相关内容'),
      h('li', '仅发布中文内容')
    )));

  res.send($doc.outerHTML);
});

app.get('/admin', async (req, res) => {
  if(!$user || !isAdmin($user)) return res.redirect('/');
  let user_count = await $r.get('users.count');
  let news_count = await $r.zcard('news.cron');
  let used_memory = await $r.info('memory');

  $doc.title.textContent = `Admin section - ${siteName}`;
  $doc.content.appendChild(h('div', {id: 'adminlinks'},
    h('h2', 'Admin'),
    h('h3', 'Site stats'),
    h('ul',
      h('li', `${user_count} users`),
      h('li', `${news_count} news posted`),
      h('li', `${used_memory.match(/used_memory_human:(\S*)/)[1]} of memory used`)),
    h('h3', 'Developer tools'),
    h('ul',
      h('li', h('a', {href: '/recompute'}, 'Recompute news score and rank (may be slow!)')),
      h('li', h('a', {href: '/?debug=1'}, 'Show annotated home page'))
    )));
  res.send($doc.outerHTML);
});

app.get('/recompute', async (req, res) => {
  if (!$user || !isAdmin($user)) return res.redirect('/');
  let range = await $r.zrange('news.cron', 0, -1);
  for (let news_id of range) {
    let news = await getNewsById(news_id);
    let score = await computeNewsScore(news);
    let rank = computeNewsRank(news);
    await $r.hmset(`news:${news_id}`, 'score', score, 'rank', rank);
    await $r.zadd('news.top', rank, news_id);
  }

  $doc.content.appendChild(h('p', 'Done.'));
  res.send($doc.outerHTML);
});

app.get('/submit', (req, res) => {
  let {t, u} = req.query;
  let bl = `javascript:window.location=%22${siteUrl}/submit?u=%22+encodeURIComponent(document.location)+%22&t=%22+encodeURIComponent(document.title)`;
  if (!$user) return res.redirect(`/login?redirect=${encodeURIComponent(req.originalUrl)}`);
  $doc.title.textContent = `Submit a new story - ${siteName}`;
  $doc.body.appendChild(h('script', '$(function() {$("input[name=do_submit]").click(submit);});'));
  [ h('h2', 'Submit a new story'),
    h('div', {id: 'submitform'},
      h('form', {name: 'f'},
        h('input', {name: 'news_id', type: 'hidden', value: -1}),
        h('label', {for: 'title'}, 'title'),
        h('input.card.w-100', {id: 'title', name: 'title', type: 'text', placeholder: 'Type your story title here', value: (t ? _.escape(t) : '')}), h('br'),
        h('label', {for: 'url'}, 'url'),
        h('input.card.w-100', {id: 'url', name: 'url', type: 'text', placeholder: 'Type your story url here', value: (u ? _.escape(u) : '')}), h('br'),
        h('label', {for: 'text'}, 'text'),
        h('textarea.card.w-100', {id: 'text', name: 'text', rows: 6, placeholder: 'If you don\'t have an url, type some text here in Markdown or HTML'}), h('br'),
        h('input.btn.btn-small.primary', {name: 'do_submit', type: 'submit', value: 'Submit'})
      )
    ),
    h('div', {id: 'errormsg'}),
    h('p', 'Submitting news is simpler using the ', h('a', {href: bl}, 'bookmarklet'),
      ' (drag the link to your browser toolbar)')
  ].forEach(node => {
    $doc.content.appendChild(node);
  });
  res.send($doc.outerHTML);
});

app.get('/login', (req, res) => {
  if ($user) return res.redirect('/');
  $doc.title.textContent = `Login - ${siteName}`;
  $doc.body.appendChild(h('script', '$(function() {$("form[name=f]").submit(login);});'));
  $doc.content.appendChild(h('#login',
    h('form', {name: 'f'},
      h('label', {for: 'username'}, 'username'),
      h('input.card.w-100', {id: 'username', name: 'username', type: 'text', required: true}),
      h('label', {for: 'password'}, 'password'),
      h('input.card.w-100', {id: 'password', name: 'password', type:'password', required: true}),
      h('input', {id: 'register', name: 'register', type: 'checkbox', value: 1}), ' ',
      h('label', {for: 'register', style: {display: 'inline'}}, 'create account'), h('br'),
      h('input.btn.btn-small.primary', {name: 'do_login', type: 'submit', value: 'Login'})),
    h('#errormsg'),
    h('a', {href: '/reset-password'}, 'reset password')
  ));

  res.send($doc.outerHTML);
});

app.get('/logout', async (req, res) => {
  let {apisecret} = req.query;
  if ($user && checkApiSecret(apisecret)) {
    await updateAuthToken($user);
  }
  res.redirect('/');
});

app.get('/reset-password', (req, res) => {
  $doc.title.textContent = `Reset Password - ${siteName}`;
  $doc.body.appendChild(h('script', '$(function() {$("form[name=f]").submit(reset_password);});'));
  [ h('p', 'Welcome to the password reset procedure. Please specify the username and the email address you used to register to the site. ', h('br'),
    h('b', 'Note that if you did not specify an email it is impossible for you to recover your password.')),
  h('div', {id: 'login'},
    h('form', {name: 'f'},
      h('label', {for: 'username'}, 'username'),
      h('input.card.w-100', {id: 'username', name:'username', type: 'text', required: true}),
      h('label', {for: 'email'}, 'email'),
      h('input.card.w-100', {id: 'email', name: 'email', type: 'email', required: true}), h('br'),
      h('input.btn.btn-small.primary', {name: 'do_reset', type: 'submit', value: 'Reset password'})
    )
  ), h('div', {id: 'errormsg'})
  ].forEach(node => {
    $doc.content.appendChild(node);
  });

  res.send($doc.outerHTML);
});

app.get('/reset-password-ok', (req, res) => {
  $doc.title.textContent = 'Reset link sent to your inbox';
  [ h('p', 'We sent an email to your inbox with a link that will let you reset your password.'),
    h('p', 'Please make sure to check the spam folder if the email does not appear in your inbox in a few minutes.'),
    h('p', 'The email contains a link that will automatically log into your account where you can set a new password in the account preferences.')
  ].forEach(node => {
    $doc.content.appendChild(node);
  });

  res.send($doc.outerHTML);
});

app.get('/set-new-password', async (req, res) => {
  if(!checkParams(req.query, 'username', 'auth')) return res.redirect('/');

  let {username, auth} = req.query;
  let user = await getUserByUsername(username);
  if (!user || user.auth != auth) {
    $doc.content.appendChild(h('p', 'Link invalid or expired.'));
    return res.send($doc.outerHTML);
  }

  // Login the user and bring him to preferences to set a new password.
  // Note that we update the auth token so this reset link will not
  // work again.
  await updateAuthToken(user.id);
  user = await getUserById(user.id);
  $doc.body.appendChild(h('script', `$(function() { document.cookie = 'auth=${user.auth}' +
    '; expires=Thu, 1 Aug 2030 20:00:00 UTC; path=/';
    window.location.href = '/user/${user.username}';
    });`
  ));
  res.send($doc.outerHTML);
});

app.get('/auth/github', (req, res) => {
  res.redirect(`https://github.com/login/oauth/authorize?client_id=${process.env.GITHUB_CLIENT_ID}`);
});

app.get('/auth/github/callback', async (req, res, next) => {
  if (!checkParams(req.query, 'code')) return next(Error('Error happens, please retry a later.'));
  let code = req.query.code;
  let headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };


  let {access_token} = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: headers,
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code: code
    })
  }).then(res => {
    if (res.ok) return res.json();
    let error = new Error('HTTP Exception[POST]');
    error.status = res.status;
    error.statusText = res.statusText;
    error.url = res.url;
    throw error;
  }).catch(err => {
    debug(err);
    return next(err);
  });

  let user = await fetch(`https://api.github.com/user?access_token=${access_token}`).then(res => {
    if (res.ok) return res.json();
    let error = new Error('HTTP Exception[POST]');
    error.status = res.status;
    error.statusText = res.statusText;
    error.url = res.url;
    throw error;
  }).catch(err => {
    debug(err);
    return next(err);
  });

  /* eslint-disable no-unused-vars */
  let [auth, apisecret, errmsg] = await createGitHubUser(user);
  /* eslint-enable no-unused-vars */
  if (auth)
    return res.cookie('auth', auth, {expires: new Date('Thu, 1 Aug 2030 20:00:00 UTC'), path: '/'}).redirect('/');
  next(Error(errmsg));
});

// API implementation
app.post('/api/login', async (req, res) => {
  if (!checkParams(req.body, 'username', 'password'))
    return res.json({status: 'err', error: 'Username and password are two required fields.'});

  let {username, password} = req.body;
  let [auth, apisecret] = await checkUserCredentials(username, password) || [];
  res.json(auth ? {status: 'ok', auth: auth, apisecret: apisecret} : {status: 'err', error: 'No match for the specified username / password pair.'});
});

app.post('/api/logout', async (req, res) => {
  if ($user && checkApiSecret(req.body.apisecret)) {
    await updateAuthToken($user);
    return res.send({status: 'ok'});
  }
  return res.send({
    status: 'err',
    error: 'Wrong auth credentials or API secret.'
  });
});

app.post('/api/create_account', async (req, res) => {
  let {username, password} = req.body;
  if (!checkParams(req.body, 'username', 'password'))
    return res.json({status: 'err', error: 'Username and password are two required fields.'});
  if (!usernameRegexp.test(username))
    return res.json({status: 'err', error: `Username must match /${usernameRegexp.source}/`});
  if(password.length < passwordMinLength)
    return res.json({status: 'err', error: `Password is too short. Min length: ${passwordMinLength}`});

  let [auth, apisecret, errmsg] = await createUser(username, password, {ip: req.ip});
  if (auth)
    return res.json({status: 'ok', auth: auth, apisecret: apisecret});
  res.json({status: 'err', error: errmsg});
});

app.post('/api/updateprofile', async (req, res) => {
  if (!$user) return res.json({status: 'err', error: 'Not authenticated.'});
  if (!checkApiSecret(req.body.apisecret)) return res.json({status: 'err', error: 'Wrong form secret.'});
  let {about, email, password} = _.mapObject(req.body, v => v.trim());
  if (password.length > 0) {
    if (password.length < passwordMinLength) return res.json({status: 'err', error: 'Password is too short. ' +
      `Min length: ${passwordMinLength}`});
    await $r.hmset(`user:${$user.id}`, 'password', await hashPassword(password, $user.salt));
  }
  await $r.hmset(`user:${$user.id}`, {
    'about': about.substring(0, 4095),
    'email': email.substring(0, 255)
  });
  res.json({status: 'ok'});
});

app.get('/api/reset-password', async (req, res) => {
  if (!checkParams(req.query, 'username', 'email')) return res.json({status: 'err', error: 'Username and email are two required fields.'});

  let {username, email} = req.query;
  let url = req.protocol + '://' + req.get('host') + req.originalUrl;
  let user = await getUserByUsername(username);
  if (user && user.email && user.email == email) {
    let id = user.id;
    // Rate limit password reset attempts.
    if (user.pwd_reset && (numElapsed() - parseInt(user.pwd_reset)) < passwordResetDelay) {
      return res.json({status: 'err', error: 'Sorry, not enough time elapsed since last password reset request.'});
    }
    if (await sendResetPasswordEmail(user, url)) {
      // All fine, set the last password reset time to the current time
      // for rate limiting purposes, and send the email with the reset
      // link.
      await $r.hset(`user:${id}`, 'pwd_reset', numElapsed());
      return res.json({status: 'ok'});
    } else {
      return res.json({status: 'err', error: 'Problem sending the email, please contact the site admin.'});
    }
  }
  res.json({status: 'err', error: 'No match for the specified username / email pair.'});
});

app.post('/api/submit', async (req, res) => {
  if (!$user) return res.json({status: 'err', error: 'Not authenticated.'});
  if (!checkApiSecret(req.body.apisecret)) return res.json({status: 'err', error: 'Wrong form secret.'});
  // We can have an empty url or an empty first comment, but not both.
  if(!checkParams(req.body, 'title', 'news_id') || (req.body.url.length == 0 && req.body.text.length == 0))
    return res.json({status: 'err', error: 'Please specify a news title and address or text.'});

  let {news_id, text, title, url} = req.body;

  // Make sure the URL is about an acceptable protocol, that is
  // http:// or https:// for now.
  if (url.length != 0) {
    if (url.indexOf('http://') != 0 &&
      url.indexOf('https://') != 0)
      return res.json({
        status: 'err',
        error: 'We only accept http:// and https:// news.'
      });
  }

  // insert news
  if(parseInt(news_id) == -1) {
    let seconds = await allowedToPostInSeconds();
    if (seconds > 0) {
      return res.json({status: 'err', error: 'You have submitted a story too recently, ' +
        `please wait ${seconds} seconds.`});
    }
    news_id = await insertNews(title, url, text, $user.id);
  } else {
    news_id = await editNews(news_id, title, url, text, $user.id);
    if (!news_id) return res.json({status: 'err', error: 'Invalid parameters, news too old to be modified ' +
      'or url recently posted.'});
  }

  return res.json({status: 'ok', news_id: news_id});

});

app.post('/api/delnews', async (req, res) => {
  if (!$user) return res.json({status: 'err', error: 'Not authenticated.'});
  if (!req.body.apisecret) return res.json({status: 'err', error: 'Wrong form secret.'});
  if (!checkParams(req.body, 'news_id')) return res.json({status: 'err', error: 'Please specify a news title.'});
  let news_id = req.body.news_id;
  if (await delNews(news_id, $user.id)) return res.json({status: 'ok', news_id: -1});
  res.json({status: 'err', error: 'News too old or wrong ID/owner.'});
});

app.post('/api/votenews', async (req, res) => {
  if (!$user) return res.json({status: 'err', error: 'Not authenticated.'});
  if (!req.body.apisecret) return res.json({status: 'err', error: 'Wrong form secret.'});
  if (!checkParams(req.body, 'news_id', 'vote_type') ||
    (req.body.vote_type != 'up' && req.body.vote_type != 'down'))
    return res.json({status: 'err', error: 'Missing news ID or invalid vote type.'});
  let {news_id, vote_type} = req.body;
  let [rank, error] = await voteNews(parseInt(news_id), $user.id, vote_type);
  if (rank) return res.json({status: 'ok'});
  res.json({status: 'err', error: error});
});

app.post('/api/postcomment', async (req, res) => {
  if (!$user) return res.json({status: 'err', error: 'Not authenticated.'});
  if (!req.body.apisecret) return res.json({status: 'err', error: 'Wrong form secret.'});

  // Params sanity check
  if (!checkParams(req.body, 'news_id', 'comment_id', 'parent_id')) {
    return res.json({
      status: 'err',
      error: 'Missing news_id, comment_id, parent_id, or comment parameter.'
    });
  }

  let {news_id, comment_id, parent_id, comment} = req.body;
  let info = await insertComment(+news_id, $user.id, +comment_id, +parent_id, comment);
  if (!info) return res.json({
    status: 'err',
    error: 'Invalid news, comment, or edit time expired.'
  });

  res.json({
    status: 'ok',
    op: info.op,
    comment_id: info.comment_id,
    parent_id: parent_id,
    news_id: news_id
  });
});

app.post('/api/votecomment', async (req, res) => {
  if (!$user) return res.json({status: 'err', error: 'Not authenticated.'});
  if (!req.body.apisecret) return res.json({status: 'err', error: 'Wrong form secret.'});
  if (!checkParams(req.body, 'comment_id', 'vote_type') ||
    (req.body.vote_type != 'up' && req.body.vote_type != 'down'))
    return res.json({status: 'err', error: 'Missing comment ID or invalid vote type.'});
  let {vote_type} = req.body;
  let [news_id, comment_id] = req.body.comment_id.split('-');
  if (await voteComment(+news_id, +comment_id, +$user.id, vote_type))
    return res.json({status: 'ok', comment_id: req.body.comment_id});

  res.json({status: 'err', error: 'Invalid parameters or duplicated vote.' });
});

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handler
app.use(function(err, req, res) {
  // only providing error in development
  const {stack, status, message} = err;

  // render the error page
  res.status(err.status || 500);
  $doc.content.appendChild(h('h2', status, ' - ', message));
  if (app.get('env') === 'development') $doc.content.appendChild(h('pre', stack));
  res.send($doc.outerHTML);
});

function checkApiSecret(apisecret) {
  if (!$user) return false;
  return apisecret && apisecret == $user.apisecret;
}

// Indicates when the user is allowed to submit another story after the last.
async function allowedToPostInSeconds(){
  if (isAdmin($user)) return 0;
  return await $r.ttl(`user:${$user.id}:submitted_recently`);
}

// Navigation, header and footer
function applicationHeader () {
  let navitems = [
    ['top', '/'],
    ['latest', '/latest/0'],
    ['random', '/random'],
    ['search', '/search'],
    ['submit', '/submit']
  ];

  let navbar_replies_link = $user ? h('a.replies', {href: '/replies'}, (() => {
    let count = $user.replies || 0;
    return ['replies ', (parseInt(count) > 0 ? h('sup', count) : '')];
  })()) : '';

  let navbar_admin_link = $user && isAdmin($user) ? h('a', {href: '/admin'}, h('b', 'admin')) : '';

  let navbar = h('nav', navitems.map((ni) => {
    return h('a', {href: ni[1]}, _.escape(ni[0]));
  }), navbar_replies_link, navbar_admin_link);

  let rnavbar = h('nav.col', {id: 'account'}, $user ?
    [h('a', {href: `/user/${encodeURIComponent($user.username)}`},
      _.escape($user.username + ` (${$user.karma})`)
    ), ' | ',
    h('a', {href: `/logout?apisecret=${$user.apisecret}`}, 'logout')] :
    h('a', {href: '/login'}, 'login / register')
  );

  let mobile_menu = h('a', {href: '#', id: 'link-menu-mobile'}, '<~>');

  return h('header.row',
    h('h1',
      h('a', {href: '/'}, _.escape(siteName) + ' ', h('small', version))
    ), navbar, rnavbar, mobile_menu
  );
}

function applicationFooter() {
  let links = [
    ['about', '/about'],
    ['source code', 'https://github.com/7anshuai/jsernews'],
    ['rss feed', '/rss'],
    ['twitter', footerTwitterLink]
  ];

  return [
    h('footer',
      _.zip(links.map((l) => {
        return l[1] ? h('a', {href: l[1]}, _.escape(l[0])) : null;
      }).filter((l) => {
        return l;
      }), Array(links.length - 1).fill(' | '))),
    keyboardNavigation == 1 ?
      h('#keyboard-help', {style: 'display: none'},
        h('.keyboard-help-banner.banner-background.banner'),
        h('.keyboard-help-banner.banner-foreground.banner',
          h('.primary-message', 'Keyboard shortcuts'),
          h('.secondary-message',
            h('p', h('strong.key', 'j/k:'), h('span.desc', 'next/previous item')),
            h('p', h('strong.key', 'enter:'), h('span.desc', 'open link')),
            h('p', h('strong.key', 'a/z:'), h('span.desc', 'up/down vote item'))
          )
        )
      ) : ''
  ];
}

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
  let aux = [];
  if (o.start < 0) o.start = 0;
  let [items, count] = await o.get.call(o, o.start, o.perpage);

  for (let n of items) {
    aux.push(await o.render.call(o, n));
  }

  let last_displayed = parseInt(o.start + o.perpage);
  if (last_displayed < count) {
    let nextpage = o.link.replace('$', last_displayed);
    aux.push(h('a', {href: nextpage, class: 'more'}, '[more]'));
  }
  return aux;
}

module.exports = app;
