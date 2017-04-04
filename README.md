# jsernews

I have run a site [jsernews](https://jsernews.com) using [lamernews](https://github.com/antirez/lamernews) source code for a long time.

I've plan to hack on jsernews with Node.js/Express/Redis/jQuery in my free time for a long time too. The goal is to have a implementation of the Lamer News style news website written using Node.js, Express, Redis and jQuery.

This project was created in order to run https://jsernews.com - but it is just experimental right now.

## Getting Started
jsernews is a Node/Express/Redis/jQuery application. You need to install Redis and Node.js 7.x+ with the following node packages:

- express
- ioredis
- underscore
- and so on...

```
# Get the latest snapshot
git clone https://github.com/7anshuai/jsernews.git jsernews

# Change directory
cd jsernews

# Install NPM dependencies
npm install

# Then simply start it
npm start
```

## Testing
```
npm test
```

## License
[MIT](/LICENSE)
