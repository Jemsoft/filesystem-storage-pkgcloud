/**
 * File system based on storage provider
 */

var fs = require('fs');
var path = require('path');
var async = require('async');
var File = require('./file').File;
var Container = require('./container').Container;
var mkdirp = require('mkdirp');

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
  if (name.length > 0) {
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


/*
 * Validate that the path exists and create missing folders
 */
function validatePath(targetPath, cb) {
  // Remove file name from the end of the path
  var lastIndex = targetPath.lastIndexOf('/');

  if (lastIndex != -1) {
    var folderPath = targetPath.substring(0, lastIndex);
    try {
      var stat = fs.statSync(folderPath);
      if (!stat.isDirectory()) {
        mkdirp.sync(folderPath);
      }
    } catch(e) {
      mkdirp.sync(folderPath);
    }
    var stat = fs.statSync(folderPath);
  }

  return true;
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
  if (containerName.indexOf('../') !== -1) {
    cb(new Error('FileSystemProvider: Invalid Name: Unsafe use of ../'));
    return;
  } 
  var dir = path.join(this.root, containerName);
  
  if (containerName) {
    rmdirAsync(dir, function(err) {
      if (err) {
        cb(err);
      } else {
        cb();
      }
    });
  }
};

// Asynchronous remove directory with files in it (be careful calling this);
function rmdirAsync(path, callback) {
  fs.readdir(path, function(err, files) {
    if(err) {
      //Pass the error on to callback
      callback(err, []);
      return;
    }

    var wait = files.length,
      count = 0,
      folderDone = function(err) {
      count++;
      // If we cleaned out all the files, continue
      if(count >= wait || err) {
        fs.rmdir(path, callback);
      }
    };
    
    // Empty directory to bail early
    if(!wait) {
      folderDone();
      return;
    }
        
    // Remove one or more trailing slash to keep from doubling up
    path = path.replace(/\/+$/,"");
    files.forEach(function(file) {
      var currentPath = path + "/" + file;
      fs.lstat(currentPath, function(err, stats) {
        if(err) {
          callback(err, []);
          return;
        }
        if( stats.isDirectory() ) {
          rmdirAsync(currentPath, folderDone);
        } else {
          fs.unlink(currentPath, folderDone);
        }
      });
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
      var props = { name: containerName };
      populateMetadata(stat, props);
      container = new Container(_this, props);
    }

    cb && cb(err, container);
  });
};

// File related functions
FileSystemProvider.prototype.upload = function(options) {
  var self = this;

  if (typeof arguments[arguments.length - 1] === 'function') {
    throw new Error('FileSystemProvider: storage.upload no longer supports calling with a callback');
  }

  var container = options.container;
  if (!validateName(container)) return;
  var file = options.remote;
  if (!validateName(file)) return;


  var filePath = path.join(this.root, container, file);

  validatePath(filePath);
  var fileOpts = {
    flags: options.flags || 'w+',
    encoding: options.encoding || null,
    mode: options.mode || '0666',
  };

  var stream = fs.createWriteStream(filePath, fileOpts);
  stream.on('finish', function(details) {
    stream.emit('success', new File(self, details));
  });
  return stream;
};

FileSystemProvider.prototype.download = function(options) {
  if (typeof arguments[arguments.length - 1] === 'function') {
    throw new Error('FileSystemProvider: storage.download no longer supports calling with a callback');
  }

  var container = options.container;
  if (!validateName(container)) return;
  var file = options.remote;
  if (!validateName(file)) return;

  var filePath = path.join(this.root, container, file);

  var fileOpts = {
    flags: 'r',
    autoClose: true,
  };

  return fs.createReadStream(filePath, fileOpts);
};

FileSystemProvider.prototype.getFiles = function(container, options, cb) {
  if (typeof options === 'function' && !(options instanceof RegExp)) {
    cb = options;
    options = false;
  }

  var _this = this;
  if (!validateName(container, cb)) return;
  var dir = path.join(this.root, container);
  readdirAsync(dir, container, this, cb);
};

function readdirAsync(dir, container, _this, callback) {
  var allFiles = [];
  var subPath = container;
  fs.readdir(dir, function(err, files) {
    if(err) {
      //Pass the error on to callback
      callback(err, []);
      return;
    }

    var count = 0;

    (function process() {
      var file = files[count++];
      if (!file) {
        callback(null, allFiles);
        return;
      }
      var currentPath = path.join(dir, file);
      fs.lstat(currentPath, function(err, stat) {
        if (stat && stat.isDirectory()) {
          readdirAsync(currentPath, container, _this, function(err, res) {
            allFiles = allFiles.concat(res);
            subPath = path.join(subPath, file);
            process();
          });
        } else {
          var fileName = path.basename(currentPath);
          var props = {container: container, name: fileName, location: subPath };
          populateMetadata(stat, props);
          var outFile = new File(_this, props);
          allFiles.push(outFile);
          process();
        }
      })
    })();
  });
}

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
  var filePath = path.join(this.root, options.container, options.remote);
  return filePath;
};

FileSystemProvider.prototype.removeFile = function(container, file, cb) {
  if (!validateName(container, cb)) return;
  if (!validateName(file, cb)) return;

  var filePath = path.join(this.root, container, file);
  fs.unlink(filePath, cb);
};
