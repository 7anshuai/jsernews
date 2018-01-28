# jsernews [![Build Status](https://travis-ci.org/7anshuai/jsernews.svg?branch=1.x)](https://travis-ci.org/7anshuai/jsernews)

jsernews is a Node.js port of the [lamernews](https://github.com/antirez/lamernews) - an HN style social news site.

## Getting Started
jsernews is a Node/Express/Redis/jQuery application. You need to install Redis and Node.js 7.x+ with the following node packages:

- express
- ioredis
- reds
- ~~html5-gen~~ hyperscript
- highlight.js
- marked
- node-fetch
- smtp-protocol
- underscore
- and so on...

```bash
# Get the latest snapshot
$ git clone https://github.com/7anshuai/jsernews.git

# Change directory
$ cd jsernews

# Install NPM dependencies
$ npm install

# Then simply start it
$ npm start
```

Please note that Node.js 7.6 was the first version of Node to support asynchronous functions without requiring a flag. You need to use the `--harmony` flag if your Node.js version is between 7.0 to 7.5 (inclusive).

## Data Layout

The 1.x branch have some difference with the redis structure used by [Lamer News](https://github.com/antirez/lamernews#data-layout) 0.11.0.

### Users

If a user sign in with GitHub, the redis hash `user:<user id>` will add more the following fields:

```
blog -> blog address
github_html_url -> github html url address
github_id -> github id of the user
```

Additionally for every user there is the following key:

```
username.to.id:<github_login> -> User ID
```

This is used to lookup users by name.

## Docker

You will need docker and docker-compose installed to build the application.

- [Docker installation](https://docs.docker.com/engine/installation/)

- [Common problems setting up docker](https://docs.docker.com/toolbox/faqs/troubleshoot/)

After installing docker, start the application with the following commands:

```
# To build the project for the first time or when you add dependencies
$ docker-compose build web

# To start the application (or to restart after making changes to the source code)
$ docker-compose up web

```

To view the app, find your docker ip address + port 3000 ( this will typically be http://192.168.99.100:3000/ ).

## Testing
```
$ npm test
```

## Website using this code

- [https://jsernews.com](https://jsernews.com/) - JavaScript News (In Chinese).

## License
[MIT](/LICENSE)
