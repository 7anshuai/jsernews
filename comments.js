const {commentEditTime, commentReplyShift, deleteUser} = require('./config');
const {getUserById} = require('./user');
const {hexdigest, numElapsed, strElapsed} = require('./utils');

class Comment {
  constructor (redis, namespace, sort=null){
    this.r = redis;
    this.namespace = namespace;
    this.sort = sort;
  }

  threadKey (thread_id){
    return `thread:${this.namespace}:${thread_id}`;
  }

  async fetch (thread_id, comment_id){
    let key = this.threadKey(thread_id);
    let json = await this.r.hget(key, comment_id);
    if (!json) return null;
    json = JSON.parse(json);
    json.thread_id = + thread_id;
    json.id = + comment_id;
    return json;
  }

  async insert(thread_id, comment) {
    if (!comment.hasOwnProperty('parent_id')) throw Error('no parent_id field');
    let key = this.threadKey(thread_id);
    if (comment.parent_id != -1) {
      let parent = await this.r.hget(key, comment.parent_id);
      if (!parent) return false;
    }
    let id = this.r.hincrby(key, 'nextid', 1);
    await this.r.hset(key, id, comment);
    return + id;
  }

  async edit(thread_id, comment_id, updates) {
    let key = this.threadKey(thread_id);
    let old = this.r.hget(key, comment_id);
    if (!old) return false;
    let comment = Object.assign(JSON.parse(old), updates);
    await this.r.hset(key, comment_id, comment);
    return true;
  }

  async removeThread(thread_id) {
    return await this.r.del(this.threadKey(thread_id));
  }

  async commentsInThread(thread_id) {
    return (parseInt(await this.r.hlen(this.threadKey(thread_id))) - 1);
  }

  async delComment(thread_id) {
    return await this.edit(thread_id, comment_id, {del: 1});
  }

  async fetchThread(thread_id) {
    let byparent = {};
    let threads = await this.r.hgetall(this.threadKey(thread_id));
    for (let id in threads) {
      let comment = threads[id];
      if (id == 'nextid') continue;
      let c = JSON.parse(comment);
      c.id = + id;
      c.thread_id = + thread_id;
      let parent_id = + c.parent_id;
      if (!byparent.hasOwnProperty(parent_id)) byparent[parent_id] = [];
      byparent[parent_id].push(c);
    }
    return byparent;
  }

  async renderComments(thread_id, root = -1, block) {
    let byparent = await this.fetchThread(thread_id);
    if (byparent[-1]) await this.renderCommentsRec(byparent, root, 0, block);
  }

  async renderCommentsRec(byparent, parent_id, level, block) {
    let thislevel = byparent[parent_id];
    if (!thislevel) return '';
    if(this.sort) thislevel = this.sort.call(this, thislevel, level);
    for (let c of thislevel) {
      c.level = level;
      let parents = byparent[c.id];
      // Render the comment if not deleted, or if deleted but
      // has replies.
      if (!c.del || + c.del == 0 || parents) await block.call(this, c);
      if (parents)
        await this.renderCommentsRec(byparent, c.id, level+1, block);
    }
  }
}

// Compute the comment score
function computeCommentScore(c) {
  let upcount = c.up ? c.up.length : 0;
  let downcount = c.down ? c.down.length : 0;
  return upcount - downcount;
}

// Render a comment into HTML.
// 'c' is the comment representation as a Ruby hash.
// 'u' is the user, obtained from the user_id by the caller.
// 'show_parent' flag to show link to parent comment.
function commentToHtml (c, u, show_parent = false) {
  let $h = global.$h;
  let indent = c.level ? `margin-left:${(+ c.level) * commentReplyShift}px` : '';
  let score = computeCommentScore(c);
  let news_id = c.thread_id;

  if (c.del && +c.del == 1)
    return $h.article({style: indent, class: 'commented deleted'}, 'comment deleted');

  let show_edit_link = !c.topcomment &&
      ($user && (+$user.id == +c.user_id)) &&
      (+c.ctime > (numElapsed() - commentEditTime));

  let comment_id = c.id ? `${news_id}-${c.id}` : '';
  return $h.article({class: 'comment', style: indent, 'data-comment-id': comment_id, id: comment_id}, () => {
    return $h.span({class: "avatar"}, () => {
      let email = u.email || "";
      let digest = hexdigest(email);
      return $h.img({src: `//gravatar.com/avatar/${digest}?s=48&d=mm`});
    }) + $h.span({class: 'info'}, () => {
      return $h.span({class: 'username'}, 
          $h.a({href: '/user/' + encodeURIComponent(u.username)}, $h.entities(u.username))
        ) + ' ' + 
        strElapsed(+c.ctime) + '. ' + 
        (!c.topcomment ? $h.a({href: `/comment/${news_id}/${c.id}`, class: 'reply'}, 'link ') : '') +
        (show_parent && c.parent_id > -1 ? $h.a({href: `/comment/${news_id}/${c.parent_id}`, class: 'reply'}, 'parent ') : '') +
        ($user && !c.topcomment ? $h.a({href: `/reply/${news_id}/${c.id}`, class: 'reply'}, 'reply ') : ' ') +
        (!c.topcomment ? (() => {
          let upclass = 'uparrow';
          let downclass = 'downarrow';
          if ($user && c.up && c.up.indexOf(+$user.id)) {
            upclass += ' voted';
            downclass += ' disabled';
          } else if ($user && c.down && c.down.indexOf(+$user.id)) {
            downclass += ' voted';
            upclass += ' disabled';
          }
          return `${score} point` + `${Math.abs(+score) > 1 ? 's' : ''}` + ' ' +
            $h.a({href: '#up', class: upclass}, '&#9650; ') +
            $h.a({href: '#down', class: downclass}, '&#9660; ');
        })() : ' ') +
        (show_edit_link ?
          $h.a({href: `/editcomment/${news_id}/${c.id}`, class: 'reply'}, 'edit') +
            ` (${
                (commentEditTime - (numElapsed() - parseInt(c.ctime))) / 60
            } minutes left)`
        : "");
    }) + $h.pre(urlsToLinks($h.entities(c.body.trim())));
  });
}

async function renderCommentsForNews(news_id, root = -1) {
  let comment = global.comment;
  let $h = global.$h;
  let html = '';
  let user = {};
  await comment.renderComments(news_id, root, async (c) => {
    if (!user[c.id]) user[c.id] = await getUserById(c.user_id);
    if (!user[c.id]) user[c.id] = deletedUser;
    let u = user[c.id];
    html += commentToHtml(c, u);
  });
  return $h.div({'id': 'comments'}, html);
}

// Given a string returns the same string with all the urls converted into
// HTML links. We try to handle the case of an url that is followed by a period
// Like in "I suggest http://google.com." excluding the final dot from the link.
function urlsToLinks(s) {
  let urls = /((https?:\/\/|www\.)([-\w\.]+)+(:\d+)?(\/([\w\/_#:\.\-\%]*(\?\S+)?)?)?)/;
  return s.replace(urls, (match, $1, $2) => {
    let url = text = $1;
    if ($2 == 'www.') url = `http://${url}`;
    if ($1.substr(-1, 1) == '.') {
      url = url.slice(0, url.length-1);
      text = text.slice(0, url.length-1);
      return `<a rel="nofollow" href="${url}">${text}</a>.`;
    } else {
      return `<a rel="nofollow" href="${url}">${text}</a>`;
    }
  });
}

module.exports = {
  Comment: Comment,
  commentToHtml: commentToHtml,
  computeCommentScore: computeCommentScore,
  renderCommentsForNews: renderCommentsForNews,
  urlsToLinks: urlsToLinks
};