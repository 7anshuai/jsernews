const _ = require('underscore');
const debug = require('debug')('jsernews:news');

const {newsEditTime, topNewsPerPage} = require('./config');
const $r = require('./redis');
const {strElapsed} = require('./utils');

// News
// Fetch one or more (if an Array is passed) news from Redis by id.
// Note that we also load other informations about the news like
// the username of the poster and other informations needed to render
// the news into HTML.
//
// Doing this in a centralized way offers us the ability to exploit
// Redis pipelining.
async function getNewsById(news_ids, opt={}) {
  let result = [];
  if (!_.isArray(news_ids)) {
    opt['single'] = true;
    news_ids = [news_ids];
  }

  let news = await $r.pipeline(news_ids.map((nid) => {
    return ['hgetall', `news:${nid}`];
  })).exec();

  if (!news.length) return [];

  // Remove empty elements
  news = news.filter((x) => {
    return x.length > 0;
  });
  if (news.length === 0) return opt['single'] ? null : [];

  // Get the all news
  // await $r.pipeline();

  // Get the associated users information
  let usernames = await $r.pipeline(news.map((n) => {
    result.push(n[1]);
    return ['hget', `user:${n[1].user_id}`, 'username'];
  })).exec();

  result.forEach((n, i) => {
    n["username"] = usernames[i][1];
  });

  // Return an array if we got an array as input, otherwise
  // the single element the caller requested.
  return opt['single'] ? result[0] : result;

}

// Return the host part of the news URL field.
// If the url is in the form text:// nil is returned.
function getNewsDomain(news){
  let su = news["url"].split("/");
  return (su[0] == "text:") ? null : su[2];
}

// Assuming the news has an url in the form text:// returns the text
// inside. Otherwise nil is returned.
function getNewsText(news){
  let su = news["url"].split("/");
  return (su[0] == "text:") ? news["url"].substring(7,-1) : null;
}

// Turn the news into its HTML representation, that is
// a linked title with buttons to up/down vote plus additional info.
// This function expects as input a news entry as obtained from
// the get_news_by_id function.
function newsToHTML (news) {
  let $h = global.$h,
    $user = global.$user;
  if (news.del) return $h.article({class: 'deleted'}, '[deleted news]');
  let domain = getNewsDomain(news);
  news = Object.assign({}, news); // Copy the object so we can modify it as we wish.
  if (!domain) news.url = `/news/${news.id}`;
  let upclass = "uparrow";
  let downclass = "downarrow";
  if (news["voted"] == 'up') {
    upclass += " voted";
    downclass += " disabled";
  } else if (news["voted"] == 'down') {
    downclass += " voted";
    upclass += " disabled";
  }
  return $h.article({'data-news-id': news.id}, () => {
    return $h.a({href: '#up', class: upclass}, '&#9650;') + ' ' +
      $h.h3($h.a({href: news.url, rel: 'nofollow'}, $h.entities(news.title))) + ' ' +
      $h.address(() => {
        return (domain ? `at ${$h.entities(domain)}` : '') + (($user && $user.id == news.user_id && news.ctime > (new Date().getTime() - newsEditTime)) ? ' ' + $h.a({href: `/editnews/${news.id}`}, '[edit]') : '');
      }) +
      $h.a({href: '#down', class: downclass}, '&#9660;') +
      $h.p(() => {
        return $h.span({class: 'upvotes'}, `${news.up} up and `) +
          $h.span({class: 'downvotes'}, `${news.down} down, posted by `) +
          $h.a({href: `/user/${$h.urlencode(news.username)}`}, $h.entities(news.username)) + ' ' + strElapsed(news.ctime) + ' ' +
          $h.a({href: `/news/${news.id}`}, parseInt(news.comments) != 0 ? `${news.comments} comment${news.comments > 1 ? 's' : ''}` : 'discuss')
          // user is admin ?
          // debug mode
      }) + ($h.pretty ? '\n' : '');
  });
}

// If 'news' is a list of news entries (Ruby hashes with the same fields of
// the Redis hash representing the news in the DB) this function will render
// the HTML needed to show this news.
function newsListToHTML(news) {
  return global.$h.section({id: 'newslist'}, () => {
    let aux = '';
    news.forEach((n) => {
      aux += newsToHTML(n);
    });
    return aux;
  });
}


// Generate the main page of the web site, the one where news are ordered by
// rank.
// 
// As a side effect thsi function take care of checking if the rank stored
// in the DB is no longer correct (as time is passing) and updates it if
// needed.
//
// This way we can completely avoid having a cron job adjusting our news
// score since this is done incrementally when there are pageviews on the
// site.
async function getTopNews(start=0, count=topNewsPerPage) {
  let numitems = await $r.zcard('news.top');
  let news_ids = await $r.zrevrange('news.top', start, start + (count -1));
  let result = await getNewsById(news_ids, {update_rank: true});
  // Sort by rank before returning, since we adjusted ranks during iteration.
  return [result, numitems];
}

// Get news in chronological order.
async function getLatestNews(start, count){
  let numitems = await $r.zcard('news.cron');
  let news_ids = await $r.zrevrange('news.cron', start, start + (count - 1));
  return [await getNewsById(news_ids), numitems];
}

module.exports = {
  getNewsById: getNewsById,
  getTopNews: getTopNews,
  getLatestNews: getLatestNews,
  getNewsDomain: getNewsDomain,
  getNewsText: getNewsText,
  newsToHTML: newsToHTML,
  newsListToHTML: newsListToHTML
}