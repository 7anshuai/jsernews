module.exports = {
  // General
  siteName: 'jsernews',
  siteUrl: 'https://jsernews.com',
  siteDescription: 'JavaScript 开发者新闻',

  // Redis config
  redisURL: 'redis://127.0.0.1:6379',

  // Security
  PBKDF2Iterations: 1000, // Set this to 5000 to improve security. But it is slow.
  useOpenSSL: false,
  passwordMinLength: 8,

  // Comments
  commentMaxLength: 4096,
  commentEditTime: 3600*2,
  commentReplyShift: 60,
  userCommentsPerPage: 10,
  subthreadsInRepliesPage: 10,

  // Karma
  userInitialKarma: 1,
  karmaIncrementInterval: 3600,
  karmaIncrementAmount: 1,
  newsDownvoteMinKarma: 30,
  newsDownvoteKarmaCost: 6,
  newsUpvoteMinKarma: 1,
  newsUpvoteKarmaCost: 1,
  newsUpvoteKarmaTransfered: 1,
  karmaIncrementComment: 1,

  // UI Elements
  keyboardNavigation: 1,

  // User
  deletedUser: {'username': 'deleted_user', 'email': '', 'id': -1},
  userCreationDelay: 3600*24,
  passwordResetDelay: 3600*24,
  usernameRegexp: /^[a-zA-Z][a-zA-Z0-9_-]+$/,

  // News and ranking
  newsAgePadding: 3600*8,
  topNewsPerPage: 30,
  latestNewsPerPage: 100,
  newsEditTime: 60*15,
  newsScoreLogStart: 10,
  newsScoreLogBooster: 2,
  rankAgingFactor: 1.1,
  preventRepostTime: 3600*48,
  newsSubmissionBreak: 60*15,
  savedNewsPerPage: 10,
  topNewsAgeLimit: 3600*24*30,
  topNewsMaxLength: 65536,

  // Footer links
  footerTwitterLink: 'https://twitter.com/jsernews',
  footerGoogleGroupLink: false,

  // API
  APIMaxNewsCount: 32,

  // Email service. Set MailRelay to false to disable this functionality
  // (this will prevent users from recovery accounts if the password gets lost).
  mailRelay: 'localhost',
  mailFrom: 'noreply@jsernews.com'
};
