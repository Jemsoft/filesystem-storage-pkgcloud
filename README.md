## Filesystem provider [![Build Status](https://travis-ci.org/Jemsoft/filesystem-storage-pkgcloud.svg?branch=master)](https://travis-ci.org/Jemsoft/filesystem-storage-pkgcloud) [![NPM download count](https://img.shields.io/npm/v/filesystem-storage-pkgcloud.svg)](https://www.npmjs.com/package/filesystem-storage-pkgcloud)

Filesystem storage provider for [pkgcloud](https://www.npmjs.com/package/pkgcloud) based on [loopback-storage-service](https://www.npmjs.com/package/loopback-storage-service) 

You can either use the client on its own:

```javascript
const filesystem = require('filesystem-storage-pkgcloud');
const client = filesystem.createClient({ root: '_PATH_TO_LOCAL_STORAGE_DIRECTORY_' });
```

or add it to pkgcloud providers:

```javascript
const pkgcloud = require('pkgcloud');
pkgcloud.providers.filesystem = {};
pkgcloud.providers.filesystem.storage = require('filesystem-storage-pkgcloud');
const client = pkgcloud.storage.createClient({
  provider: 'filesystem',
  root: '_PATH_TO_LOCAL_STORAGE_DIRECTORY_',
});
```

#### Author: [Jemsoft Pty Ltd.](http://www.jemsoftsecurity.com/)
#### License: MIT


