/**
 * File system based on storage provider
 */

var fs = require('fs');
var path = require('path');
var async = require('async');
var File = require('./file').File;
var Container = require('./container').Container;

module.exports.storage = module.exports; // To make it consistent with pkgcloud

module.exports.File = File;
module.exports.Container = Container;
module.exports.Client = FileSystemProvider;
module.exports.createClient = function(options) {
  return new FileSystemProvider(options);
};

function FileSystemProvider(options) {
  options = options || {};
  this.root = options.root;
  var exists = fs.existsSync(this.root);
  if (!exists) {
    console.log(this.root);
    throw new Error('FileSystemProvider: Path does not exist: ' + this.root);
  }

  var stat = fs.statSync(this.root);
  if (!stat.isDirectory()) {
    throw new Error('FileSystemProvider: Invalid directory: ' + this.root);
  }
}

var namePattern = new RegExp('[^' + path.sep + '/]+');

function validateName(name, cb) {
  if (!name) {
    cb && process.nextTick(cb.bind(null, new Error('Invalid name: ' + name)));
    if (!cb) {
      console.error('FileSystemProvider: Invalid name: ', name);
    }

    return false;
  }

  var match = namePattern.exec(name);
  if (match && match.index === 0 && match[0].length === name.length) {
    return true;
  } else {
    cb && process.nextTick(cb.bind(null,
      new Error('FileSystemProvider: Invalid name: ' + name)));
    if (!cb) {
      console.error('FileSystemProvider: Invalid name: ', name);
    }

    return false;
  }
}

/*!
 * Populate the metadata from file stat into props
 * @param {fs.Stats} stat The file stat instance
 * @param {Object} props The metadata object
 */
function populateMetadata(stat, props) {
  for (var p in stat) {
    switch (p) {
      case 'size':
      case 'atime':
      case 'mtime':
      case 'ctime':
        props[p] = stat[p];
        break;
    }
  }
}

FileSystemProvider.prototype.getContainers = function(cb) {
  var _this = this;
  fs.readdir(_this.root, function(err, files) {
    var containers = [];
    var tasks = [];
    files.forEach(function(f) {
      tasks.push(fs.stat.bind(fs, path.join(_this.root, f)));
    });

    async.parallel(tasks, function(err, stats) {
      if (err) {
        cb && cb(err);
      } else {
        stats.forEach(function(stat, index) {
          if (stat.isDirectory()) {
            var name = files[index];
            var props = {name: name};
            populateMetadata(stat, props);
            var container = new Container(_this, props);
            containers.push(container);
          }
        });

        cb && cb(err, containers);
      }
    });
  });
};

FileSystemProvider.prototype.createContainer = function(options, cb) {
  var _this = this;
  var name;
  if (options instanceof Container) {
    name = options.name;
  } else {
    name = options;
    options = {};
  }

  var dir = path.join(this.root, name);
  validateName(name, cb) && fs.mkdir(dir, options, function(err) {
    if (err) {
      return cb && cb(err);
    }

    fs.stat(dir, function(err, stat) {
      var container = null;
      if (!err) {
        var props = {name: name};
        populateMetadata(stat, props);
        container = new Container(_this, props);
      }

      cb && cb(err, container);
    });
  });
};

FileSystemProvider.prototype.destroyContainer = function(containerName, cb) {
  if (!validateName(containerName, cb)) return;

  var dir = path.join(this.root, containerName);
  fs.readdir(dir, function(err, files) {
    files = files || [];

    var tasks = [];
    files.forEach(function(f) {
      tasks.push(fs.unlink.bind(fs, path.join(dir, f)));
    });

    async.parallel(tasks, function(err) {
      if (err) {
        cb && cb(err);
      } else {
        fs.rmdir(dir, cb);
      }
    });
  });
};

FileSystemProvider.prototype.getContainer = function(containerName, cb) {
  var _this = this;
  if (!validateName(containerName, cb)) return;
  var dir = path.join(this.root, containerName);
  fs.stat(dir, function(err, stat) {
    var container = null;
    if (!err) {
      var props = {name: containerName};
      populateMetadata(stat, props);
      container = new Container(_this, props);
    }

    cb && cb(err, container);
  });
};

// File related functions
FileSystemProvider.prototype.upload = function(options, cb) {
  var container = options.container;
  if (!validateName(container, cb)) return;
  var file = options.remote;
  if (!validateName(file, cb)) return;
  var filePath = path.join(this.root, container, file);

  var fileOpts = {flags: options.flags || 'w+',
    encoding: options.encoding || null,
    mode: options.mode || 0666,
  };

  try {
    //simulate the success event in filesystem provider
    //fixes: https://github.com/strongloop/loopback-component-storage/issues/58
    // & #23 & #67
    var stream = fs.createWriteStream(filePath, fileOpts);
    stream.on('finish', function() {
      stream.emit('success');
    });

    return stream;
  } catch (e) {
    cb && cb(e);
  }
};

FileSystemProvider.prototype.download = function(options, cb) {
  var container = options.container;
  if (!validateName(container, cb)) return;
  var file = options.remote;
  if (!validateName(file, cb)) return;

  var filePath = path.join(this.root, container, file);

  var fileOpts = {
    flags: 'r',
    autoClose: true,
  };

  try {
    return fs.createReadStream(filePath, fileOpts);
  } catch (e) {
    cb && cb(e);
  }
};

FileSystemProvider.prototype.getFiles = function(container, options, cb) {
  if (typeof options === 'function' && !(options instanceof RegExp)) {
    cb = options;
    options = false;
  }

  var _this = this;
  if (!validateName(container, cb)) return;
  var dir = path.join(this.root, container);
  fs.readdir(dir, function(err, entries) {
    entries = entries || [];
    var files = [];
    var tasks = [];
    entries.forEach(function(f) {
      tasks.push(fs.stat.bind(fs, path.join(dir, f)));
    });

    async.parallel(tasks, function(err, stats) {
      if (err) {
        cb && cb(err);
      } else {
        stats.forEach(function(stat, index) {
          if (stat.isFile()) {
            var props = {container: container, name: entries[index]};
            populateMetadata(stat, props);
            var file = new File(_this, props);
            files.push(file);
          }
        });

        cb && cb(err, files);
      }
    });
  });
};

FileSystemProvider.prototype.getFile = function(container, file, cb) {
  var _this = this;
  if (!validateName(container, cb)) return;
  if (!validateName(file, cb)) return;
  var filePath = path.join(this.root, container, file);
  fs.stat(filePath, function(err, stat) {
    var f = null;
    if (!err) {
      var props = {container: container, name: file};
      populateMetadata(stat, props);
      f = new File(_this, props);
    }

    cb && cb(err, f);
  });
};

FileSystemProvider.prototype.getUrl = function(options) {
  options = options || {};
  var filePath = path.join(this.root, options.container, options.path);
  return filePath;
};

FileSystemProvider.prototype.removeFile = function(container, file, cb) {
  if (!validateName(container, cb)) return;
  if (!validateName(file, cb)) return;

  var filePath = path.join(this.root, container, file);
  fs.unlink(filePath, cb);
};
