# jsernews

I have run a site [jsernews](https://jsernews.com) using [lamernews](https://github.com/antirez/lamernews) source code for a long time.

I've plan to hack on jsernews with Node.js/Express/Redis/jQuery in my free time for a long time too.

The goal is to have a implementation of the Lamer News style news website written using Node.js, Express, Redis and jQuery.

This project was created in order to run https://jsernews.com, also is free for everybody to use, fork, and have fun with.

## Getting Started
jsernews is a Node/Express/Redis/jQuery application. You need to install Redis and Node.js 7.x+ with the following node packages:

- express
- ioredis
- html5-gen
- node-fetch
- smtp-protocol
- underscore
- and so on...

```bash
# Get the latest snapshot
git clone https://github.com/7anshuai/jsernews.git

# Change directory
cd jsernews

# Install NPM dependencies
npm install

# Then simply start it
npm start
```

Please note that Node.js 7.6 was the first version of Node to support asynchronous functions without requiring a flag. You need to use the `--harmony` flag if your Node.js version is between 7.0 to 7.5 (inclusive).

## Testing
```
npm test
```

## License
[MIT](/LICENSE)
