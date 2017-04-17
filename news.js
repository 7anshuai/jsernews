const _ = require('underscore');
const debug = require('debug')('jsernews:news');

const {commentMaxLength, newsEditTime, newsAgePadding, newsScoreLogStart, newsScoreLogBooster, newsSubmissionBreak, newsUpvoteMinKarma, newsDownvoteMinKarma, newsUpvoteKarmaCost, newsDownvoteKarmaCost, newsUpvoteKarmaTransfered, preventRepostTime, rankAgingFactor, siteUrl, topNewsAgeLimit, latestNewsPerPage, topNewsPerPage} = require('./config');
const $r = require('./redis');
const {getUserById, getUserKarma, incrementUserKarmaBy, isAdmin} = require('./user');
const {numElapsed, strElapsed} = require('./utils');

// News
// Fetch one or more (if an Array is passed) news from Redis by id.
// Note that we also load other informations about the news like
// the username of the poster and other informations needed to render
// the news into HTML.
//
// Doing this in a centralized way offers us the ability to exploit
// Redis pipelining.
async function getNewsById(news_ids, opt={}) {
  let $user = global.$user;
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
  for (let n of news) {
  // Adjust rank if too different from the real-time value.
    if (opt.update_rank) await updateNewsRankIfNeeded(n[1]);
    result.push(n[1]);
  }

  // Get the associated users information
  let usernames = await $r.pipeline(result.map((n) => {
    return ['hget', `user:${n.user_id}`, 'username'];
  })).exec();

  result.forEach((n, i) => {
    n["username"] = usernames[i][1];
  });

  // Load $User vote information if we are in the context of a
  // registered user.
  if ($user) {
    let commands = _.flatten(result.map((n) => {
      return [
        ['zscore', `news.up:${n.id}`, $user.id],
        ['zscore', `news.down:${n.id}`, $user.id]
      ];
    }), true);

    let votes = await $r.pipeline(commands).exec();
    result.forEach((n, i) => {
      if (votes[i*2][1])
        n["voted"] = 'up';
      else if (votes[(i*2)+1][1])
        n["voted"] = 'down';
    });
  }

  // Return an array if we got an array as input, otherwise
  // the single element the caller requested.
  return opt['single'] ? result[0] : result;

}

// Given the news compute its score.
// No side effects.
async function computeNewsScore(news){
  let upvotes = await $r.zrange(`news.up:${news.id}`, 0, -1, 'withscores');
  let downvotes = await $r.zrange(`news.down:${news.id}`, 0, -1, 'withscores');
  // FIXME: For now we are doing a naive sum of votes, without time-based
  // filtering, nor IP filtering.
  // We could use just ZCARD here of course, but I'm using ZRANGE already
  // since this is what is needed in the long term for vote analysis.
  let score = upvotes.length - downvotes.length;
  // Now let's add the logarithm of the sum of all the votes, since
  // something with 5 up and 5 down is less interesting than something
  // with 50 up and 50 donw.
  let votes = upvotes.length / 2 + downvotes.length / 2;
  if (votes > newsScoreLogStart)
    score += Math.log(votes- newsScoreLogStart) * newsScoreLogBooster;
  
  return score;
}

// Given the news compute its rank, that is function of time and score.
//
// The general forumla is RANK = SCORE / (AGE ^ AGING_FACTOR)
function computeNewsRank(news){
  let age = numElapsed() - (+ news.ctime);
  let rank = (parseFloat(news.score)*1000000) / ((age+ newsAgePadding) ** rankAgingFactor);
  if (age > topNewsAgeLimit) rank = -age;
  return rank;
}

// Updating the rank would require some cron job and worker in theory as
// it is time dependent and we don't want to do any sorting operation at
// page view time. But instead what we do is to compute the rank from the
// score and update it in the sorted set only if there is some sensible error.
// This way ranks are updated incrementally and "live" at every page view
// only for the news where this makes sense, that is, top news.
//
// Note: this function can be called in the context of redis.pipelined {...}
async function updateNewsRankIfNeeded(n){
  let real_rank = computeNewsRank(n);
  let delta_rank = Math.abs(real_rank - parseInt(n.rank));
  if (delta_rank > 0.000001){
    await $r.hmset(`news:${n.id}`, 'rank', real_rank);
    await $r.zadd('news.top', real_rank, n.id);
    n.rank = real_rank
  }
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
  let su = news.url.split('/');
  return (su[0] == 'text:') ? news.url.substring(7, news.url.length - 1) : null;
}

// Mark an existing news as removed.
async function delNews(news_id, user_id){
  let $user = global.$user;
  let news = await getNewsById(news_id);
  if (!news || parseInt(news.user_id) != parseInt(user_id) && !isAdmin($user)) return false;
  if (!(parseInt(news.ctime) > (numElapsed() - newsEditTime)) && !isAdmin($user)) return false;

  await $r.hmset(`news:${news_id}`, 'del', 1);
  await $r.zrem("news.top", news_id);
  await $r.zrem("news.cron", news_id);
  return true;
}

// Edit an already existing news.
//
// On success the news_id is returned.
// On success but when a news deletion is performed (empty title) -1 is returned.
// On failure (for instance news_id does not exist or does not match
//             the specified user_id) false is returned.
async function editNews(news_id, title, url, text, user_id){
  let $user = global.$user;
  let news = await getNewsById(news_id);
  if (!news || parseInt(news.user_id) != parseInt(user_id) && !isAdmin($user)) return false;
  if (!(parseInt(news.ctime) > (numElapsed() - newsEditTime)) && !isAdmin($user)) return false;

  // If we don't have an url but a comment, we turn the url into
  // text://....first comment..., so it is just a special case of
  // title+url anyway.
  let textpost = url.length == 0
  if (textpost)
    url = 'text://' + text.substring(0, commentMaxLength);
  // Even for edits don't allow to change the URL to the one of a
  // recently posted news.
  if (!textpost && url != news.url) {
      if (await $r.get('url:' + url)) return false;
      // No problems with this new url, but the url changed
      // so we unblock the old one and set the block in the new one.
      // Otherwise it is easy to mount a DOS attack.
      await $r.del('url:' + news.url);
      if (!textpost) await $r.setex('url:' + url, preventRepostTime, news_id);
  }
  // Edit the news fields.
  await $r.hmset(`news:${news_id}`,{
    title: title,
    url: url
  });
  return news_id;
}

// Add a news with the specified url or text.
//
// If an url is passed but was already posted in the latest 48 hours the
// news is not inserted, and the ID of the old news with the same URL is
// returned.
//
// Return value: the ID of the inserted news, or the ID of the news with
// the same URL recently added.
async function insertNews(title, url, text, user_id){
  // If we don't have an url but a comment, we turn the url into
  // text://....first comment..., so it is just a special case of
  // title+url anyway.
  let textpost = url.length == 0;
  if (textpost)
    url = "text://" + text.substring(0, commentMaxLength);

  // Check for already posted news with the same URL.
  let id = await $r.get(`url:` + url);
  if (!textpost && id) return parseInt(id);

  // We can finally insert the news.
  let ctime = numElapsed();
  let news_id = await $r.incr("news.count");
  await $r.hmset(`news:${news_id}`, {
    id: news_id,
    title: title,
    url: url,
    user_id: user_id,
    ctime: ctime,
    score: 0,
    rank: 0,
    up: 0,
    down: 0,
    comments: 0
  });

  // The posting user virtually upvoted the news posting it
  let [rank, error] = await voteNews(news_id, user_id, 'up');
  // Add the news to the user submitted news
  await $r.zadd(`user.posted:${user_id}`, ctime, news_id);
  // Add the news into the chronological view
  await $r.zadd('news.cron', ctime, news_id);
  // Add the news into the top view
  await $r.zadd('news.top', rank, news_id);
  // Add the news url for some time to avoid reposts in short time
  if (!textpost) await $r.setex('url:' + url, preventRepostTime, news_id);
  // Set a timeout indicating when the user may post again
  await $r.setex(`user:${user_id}:submitted_recently`, newsSubmissionBreak, '1');
  return news_id;
}

// Vote the specified news in the context of a given user.
// type is either :up or :down
//
// The function takes care of the following:
// 1) The vote is not duplicated.
// 2) That the karma is decreased from voting user, accordingly to vote type.
// 3) That the karma is transfered to the author of the post, if different.
// 4) That the news score is updaed.
//
// Return value: two return values are returned: rank,error
//
// If the fucntion is successful rank is not nil, and represents the news karma
// after the vote was registered. The error is set to nil.
//
// On error the returned karma is false, and error is a string describing the
// error that prevented the vote.
async function voteNews(news_id, user_id, vote_type){
  // Fetch news and user
  let $user = global.$user;
  let user = ($user && $user.id == user_id) ? $user : await getUserById(user_id);
  let news = await getNewsById(news_id);
  if (!news || !user) return [false, 'No such news or user.'];

  // Now it's time to check if the user already voted that news, either
  // up or down. If so return now.
  if (await $r.zscore(`news.up:${news_id}`, user_id) || await $r.zscore(`news.down:${news_id}`, user_id))
    return [false, 'Duplicated vote.'];

  // Check if the user has enough karma to perform this operation
  let karma = await getUserKarma(user_id);
  if (user.id != news.user_id){
    if ((vote_type == 'up' && (karma < newsUpvoteMinKarma)) ||
      (vote_type == 'down' && (karma < newsDownvoteMinKarma)))
      return [false, `You don't have enough karma to vote ${vote_type}`];
  }

  // News was not already voted by that user. Add the vote.
  // Note that even if there is a race condition here and the user may be
  // voting from another device/API in the time between the ZSCORE check
  // and the zadd, this will not result in inconsistencies as we will just
  // update the vote time with ZADD.
  if (await $r.zadd(`news.${vote_type}:${news_id}`, numElapsed(), user_id))
    await $r.hincrby(`news:${news_id}`, vote_type, 1);

  if (vote_type == 'up')
    await $r.zadd(`user.saved:${user_id}`, numElapsed(), news_id);

  // Compute the new values of score and karma, updating the news accordingly.
  let score = await computeNewsScore(news);
  news.score = score;
  let rank = computeNewsRank(news);
  await $r.hmset(`news:${news_id}`, {
    'score': score,
    'rank': rank
  });
  await $r.zadd("news.top", rank, news_id);

  // Remove some karma to the user if needed, and transfer karma to the
  // news owner in the case of an upvote.
  if (user.id != news.user_id){
    if (vote_type == 'up') {
      await incrementUserKarmaBy(user_id, -newsUpvoteKarmaCost);
      await incrementUserKarmaBy(news['user_id'], newsUpvoteKarmaTransfered);
    } else {
      await incrementUserKarmaBy(user_id, -newsDownvoteKarmaCost);
    }
  }
  return [rank, null];
}

// Turn the news into its HTML representation, that is
// a linked title with buttons to up/down vote plus additional info.
// This function expects as input a news entry as obtained from
// the get_news_by_id function.
function newsToHTML (news, opt) {
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
        return (domain ? `at ${$h.entities(domain)}` : '') + (($user && $user.id == news.user_id && news.ctime > (numElapsed() - newsEditTime)) ? ' ' + $h.a({href: `/editnews/${news.id}`}, '[edit]') : '');
      }) +
      $h.a({href: '#down', class: downclass}, '&#9660;') +
      $h.p(() => {
        return $h.span({class: 'upvotes'}, `${news.up}`) + ' up and ' +
          $h.span({class: 'downvotes'}, `${news.down}`) + ' down, posted by ' +
          $h.a({href: `/user/${$h.urlencode(news.username)}`}, $h.entities(news.username)) + ' ' + strElapsed(news.ctime) + ' ' +
          $h.a({href: `/news/${news.id}`}, parseInt(news.comments) != 0 ? `${news.comments} comment${news.comments > 1 ? 's' : ''}` : 'discuss') + ($user && isAdmin($user) 
            ? ' - ' + $h.a({href: `/editnews/${news.id}`}, 'edit') + ' - ' + $h.a({href: `https://twitter.com/intent/tweet?url=${siteUrl}/news/${news.id}&text=${$h.urlencode(news.title)} - `}, 'tweet')
            : '');
      }) + (opt && opt.debug && $user && isAdmin($user) 
        ? ` id: ${news.id} score: ${news.score} rank: ${computeNewsRank(news)} zset_rank: `
        : '') + ($h.pretty ? '\n' : '');
  });
}

// Turn the news into its RSS representation
// This function expects as input a news entry as obtained from
// the get_news_by_id function.
function newsToRSS(news){
  let $h = global.$h;
  let domain = getNewsDomain(news);
  news = Object.assign({}, news); // Copy the object so we can modify it as we wish.
  news.ln_url = `${siteUrl}/news/${news.id}`;
  if (!domain) news.url = news.ln_url;

  return $h.item(() => {
    return $h.title(
      $h.entities(news.title)
    ) + ' ' +
    $h.guid(
      $h.entities(news.url)
    ) + ' ' +
    '<link>' +
      $h.entities(news.url) +
    '</link>' + ' ' +
    $h.description(
      '<![CDATA[' +
      $h.a({href: news.ln_url}, 'Comments') +
      ']]>'
    ) + ' ' +
    $h.comments(
      $h.entities(news.ln_url)
    )
  }) + '\n';
}

// If 'news' is a list of news entries (Ruby hashes with the same fields of
// the Redis hash representing the news in the DB) this function will render
// the HTML needed to show this news.
function newsListToHTML(news, opt) {
  return global.$h.section({id: 'newslist'}, () => {
    let aux = '';
    news.forEach((n) => {
      aux += newsToHTML(n, opt);
    });
    return aux;
  });
}

// If 'news' is a list of news entries (Ruby hashes with the same fields of
// the Redis hash representing the news in the DB) this function will render
// the RSS needed to show this news.
function newsListToRSS(news){
  let aux = "";
  for (let n of news) {
    aux += newsToRSS(n);
  }
  return aux;
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
async function getLatestNews(start=0, count=latestNewsPerPage){
  let numitems = await $r.zcard('news.cron');
  let news_ids = await $r.zrevrange('news.cron', start, start + (count - 1));
  return [await getNewsById(news_ids), numitems];
}

// Get saved news of current user
async function getSavedNews(user_id, start, count) {
  let numitems = + await $r.zcard(`user.saved:${user_id}`);
  let news_ids = await $r.zrevrange(`user.saved:${user_id}`, start, start + (count - 1));
  return [await getNewsById(news_ids), numitems];
}

// Get news posted by the specified user
async function getPostedNews(user_id, start, count){
    let numitems = + await $r.zcard(`user.posted:${user_id}`);
    let news_ids = await $r.zrevrange(`user.posted:${user_id}`, start, start + (count - 1));
    return [await getNewsById(news_ids), numitems];
}

module.exports = {
  computeNewsRank: computeNewsRank,
  computeNewsScore: computeNewsScore,
  getNewsById: getNewsById,
  getTopNews: getTopNews,
  getLatestNews: getLatestNews,
  getNewsDomain: getNewsDomain,
  getNewsText: getNewsText,
  getSavedNews: getSavedNews,
  getPostedNews: getPostedNews,
  delNews: delNews,
  editNews: editNews,
  insertNews: insertNews,
  voteNews: voteNews,
  newsToHTML: newsToHTML,
  newsListToHTML: newsListToHTML,
  newsListToRSS: newsListToRSS
}