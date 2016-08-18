var fs = require('fs');
var test = require('tape');
var stream = require('stream');
var pkgcloud = require('pkgcloud');
pkgcloud.providers.filesystem = {};
pkgcloud.providers.filesystem.storage = require('../');

var client = null;
var content = 'testfile!';
var containerName = 'test-container';
var fileName = 'test-file';
var basePath = 'test/storage';

var path = basePath + '/' + containerName + '/' + fileName;

test('Start up', function(t) {
  fs.mkdirSync(basePath);
  client = pkgcloud.storage.createClient({
    provider: 'filesystem',
    root: basePath,
  });
  t.end();
});

test('Create a container', function(t) {
  client.createContainer(containerName, function(err, container) {
    if (err) {
      t.fail('error!');
    }
    var stat = fs.statSync(basePath + '/' + containerName);
    t.ok(stat.isDirectory(), 'container must be a directory');
    t.end();
  });
});

test('Get a container', function(t) {
  client.getContainer(containerName, function(err, container) {
    if (err) {
      t.fail('error!');
    }
    t.ok(container, 'container must exist');
    t.end();
  });
});

test('Get containers', function(t) {
  client.getContainers(function(err, containers) {
    if (err) {
      t.fail('error!');
    }
    t.ok(containers, 'containers must exist');
    t.ok(Array.isArray(containers), 'container must be an Array');
    t.equal(containers.length, 1, 'container must exist in containers');
    t.end();
  });
});

test('Upload file', function(t) {
  var path = basePath + '/' + containerName + '/' + fileName;

  var uploadStream = client.upload({
    container: containerName,
    remote: fileName,
  });

  var file = new stream.Readable();
  file.push(content);
  file.push(null);
  file.pipe(uploadStream);

  uploadStream.on('error', function(err) {
    t.fail('error!');
  });

  uploadStream.on('success', function(file) {
    t.ok(file, 'file must exist');
    fs.readFile(path, function(err, data) {
      if (err) t.fail('error!');
      t.equal(data.toString(), content, 'content must be the same');
      t.end();
    });
  });
});


test('Upload file to subdirectory', function(t) {
  var path = basePath + '/' + containerName + '/subfolder/' + fileName;

  var uploadStream = client.upload({
    container: containerName,
    remote: 'subfolder/' + fileName,
  });

  var file = new stream.Readable();
  file.push(content);
  file.push(null);
  file.pipe(uploadStream);

  uploadStream.on('error', function(err) {
    t.fail('error!');
  });

  uploadStream.on('success', function(file) {
    t.ok(file, 'file must exist');
    fs.readFile(path, function(err, data) {
      if (err) t.fail('error!');
      t.equal(data.toString(), content, 'content must be the same');
      t.end();
    });
  });
});

test('Download file', function(t) {
  var downloadStream = client.download({
    container: containerName,
    remote: fileName,
  });

  downloadStream.on('readable', function() {
    var data = downloadStream.read();
    if (data) {
      t.equal(data.toString(), content, 'content must be the same');
    }
  });

  downloadStream.on('end', function() {
    t.end();
  });
});

test('Download File from sub directory', function(t) {
  var downloadStream = client.download({
    container: containerName,
    remote: 'subfolder/' + fileName,
  });

  downloadStream.on('readable', function() {
    var data = downloadStream.read();
    if (data) {
      t.equal(data.toString(), content, 'content must be the same');
    }
  });

  downloadStream.on('end', function() {
    t.end();
  });
});

test('Get file', function(t) {
  client.getFile(containerName, fileName, function(err, file) {
    if (err) t.fail('error!');
    t.ok(file, 'file must be found');
    t.end();
  });
});

test('Get file from sub directory', function(t) {
  client.getFile(containerName, 'subfolder/' + fileName, function(err, file) {
    if (err) t.fail('error!');
    t.ok(file, 'file must be found');
    t.end();
  });
});

test('Get files', function(t) {
  client.getFiles(containerName, function(err, files) {
    if (err) t.fail('error!');
    t.ok(files, 'files must exist');
    t.ok(Array.isArray(files), 'files must be an Array');
    t.equal(files.length, 2, 'file must exist in files');
    t.end();
  });
});

test('Get URL', function(t) {
  var url = client.getUrl({
    container: containerName,
    remote: fileName,
  });
  t.ok(url, 'file must be found');
  t.equal(url, path, 'url must be correct');
  t.end();
});

test('Remove file', function(t) {
  client.removeFile(containerName, fileName, function(err, file) {
    if (err) t.fail('error!');
    var stat = fs.stat(path, function(err, stat) {
      t.notOk(stat && !err, 'file must be deleted');
      t.end();
    });
  });
});

test('Remove file in sub directory', function(t) {
  client.removeFile(containerName, 'subfolder/' + fileName, function(err, file) {
    if (err) t.fail('error!');
    var stat = fs.stat(path, function(err, stat) {
      t.notOk(stat && !err, 'file must be deleted');
      t.end();
    });
  });
});

test('Fail to destroy container with ../', function(t) {
  client.destroyContainer('container/../', function(err, file) {
    if (err) {
      t.pass('failed with ../');
    } else {
      t.fail('accepted ../');
    }

    t.end();
  });
});

test('Destroy container', function(t) {
  client.destroyContainer(containerName, function(err) {
    if (err) t.fail('error!');
    var stat = fs.stat(basePath + '/' + containerName, function(err, stat) {
      t.notOk(stat && !err, 'folder must be removed');
      t.end();
    });
  });
});

test('Finish', function(t) {
  fs.rmdirSync('test/storage');
  t.end();
});
