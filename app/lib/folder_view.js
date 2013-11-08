"use strict";
var events = require('events');
var fs = require('fs');
var path = require('path');
var jade = require('jade');
var util = require('util');
var mime = require('./mime');
var assert = require('assert');
var async = require('async');

var client = require('./mantaClient.js');

function fileDialog(filename, callback) {
    var chooser = $('<input type="file" nwsaveas="' + filename + '">');
    chooser.change(function (evt) {
        console.log('Choose:', $(this).val());
        if (callback) {
            callback($(this).val());
        }
    });

    chooser.trigger('click');
}


// Template engine
var gen_files_view = jade.compile([
    '- each file in files',
    '  .file(data-path="#{file.path}", data-type="#{file.type}")',
    '    .icon',
    '      img(src="icons/#{file.type}.png")',
    '    .name #{file.name}'
].join('\n'));

// Our type
function Folder(jquery_element) {
    var self = this,
        holder = window.document.getElementById('holder');

    events.EventEmitter.call(this);
    this.element = jquery_element;

    // Click on blank
    this.element.parent().on('click', function () {
        self.element.children('.focus').removeClass('focus');
    });
    // Keypress on blank
    $(window.document).keydown(function (e) {
        switch (e.keyCode) {
            case 46:
                if (window.confirm('are you sure to want to delete this item(s)?')) {
                    self.element.children('.focus')
                        .get()
                        .forEach(function (e) {
                            self.remove($(e).data('path'));
                        });
                }
                break;
        }
        console.log(this, e);
        e.stopPropagation();
    });
    // Click on file
    this.element.delegate('.file', 'click', function (e) {
        self.element.children('.focus').removeClass('focus');
        $(this).addClass('focus');
        e.stopPropagation();
    });
    // Double click on file
    this.element.delegate('.file', 'dblclick', function () {
        var file_path = $(this).attr('data-path'),
            type = $(this).attr('data-type');

        if (type === 'folder') {
            self.emit('navigate', file_path, type);
        } else {
            fileDialog(path.basename(file_path), function (saveAsPath) {
                self.save(file_path, saveAsPath);
            });
        }
    });
    window.ondragover = function (e) {
        e.preventDefault();
        return false;
    };
    window.ondrop = function (e) {
        e.preventDefault();
        return false;
    };

    holder.ondragover = function () {
        this.className = 'hover';
        return false;
    };
    holder.ondragend = function () {
        this.className = '';
        return false;
    };
    function findFolder(e, i) {
        i = i | 0;
        if (e.data('type') === 'folder') {
            return e.data('path');
        }
        if (e.is('#files, #holder')) {
            return $('#addressbar li.active').data('path');
        }
        if (i > 5) {
            return '/';
        }
        return findFolder(e.parent(), ++i);
    }

    holder.ondrop = function (e) {
        console.log(e);
        e.preventDefault();

        var folder = findFolder($(e.target));

        for (var i = 0; i < e.dataTransfer.files.length; ++i) {
            console.log('Copy:', e.dataTransfer.files[i].path, folder);
            self.copy(e.dataTransfer.files[i].path, folder);
        }
        return false;
    };
}

util.inherits(Folder, events.EventEmitter);

Folder.prototype.open = function (dir) {
    var self = this;

    var opts = {
        offset: 0,
        limit: 256,
        type: 'object'
    };

    client.ls(dir, opts, function (err, res) {

        assert.ifError(err);

        var files = [];

        res.on('object', function (obj) {
            files.push(obj);
        });

        res.on('directory', function (dir) {
            files.push(dir);
        });

        res.once('error', function (err) {
            console.error(err.stack);
            window.alert(err);
        });

        res.once('end', function () {

            for (var i = 0; i < files.length; ++i) {
                files[i] = {
                    name: files[i].name,
                    path: dir + '/' + files[i].name,
                    type: files[i].type === 'directory' ? 'folder' : 'text'
                }
            }

            self.element.html(gen_files_view({ files: files }));
        });
    });
};

Folder.prototype.mkdir = function (dst, name, cb) {
    client.info(path.resolve(dst, name), function (error) {
        console.error(error);
        if (error && error.statusCode !== 404) return window.alert(error.message);
        client.mkdir(path.resolve(dst, name), function (error) {
            console.log('mkdir ', path.resolve(dst, name));
            if (error) window.alert(error.message);
            if (cb) cb();
        })
    })
};

function scanDir(dir, basePath, result) {
    basePath = basePath || path.basename(dir);
    result = result || {
        files: [],
        directories: [path.basename(dir)]
    };
    fs.readdirSync(dir).forEach(function (f) {
        var fullPath = path.resolve(dir, f),
            stat = fs.lstatSync(fullPath);
        if (stat.isDirectory()) {
            result.directories.push(basePath + '/' + f);
            return scanDir(fullPath, basePath + '/' + f, result);
        }
        result.files.push({
            fullPath: fullPath,
            path: basePath + '/' + f,
            size: stat.size
        });

    });
    return result;
}

Folder.prototype.copy = function (src, dst, cb) {
    var self = this;
    var stat = fs.lstatSync(src);
    if (stat.isDirectory()) {
        var dirName = path.basename(src),
            dirContent = scanDir(src);

        console.log(dirContent);

        async.waterfall(dirContent.directories.map(function (d) {
            return function (cb) {
                self.mkdir(dst, d, cb);
            }
        }), function (error) {
            console.log('dirs are created');
            async.parallel(dirContent.files.map(function (f) {
                return function (cb) {
                    self.copy(f.fullPath, path.basename(path.resolve(dst, f.path)), cb);
                }
            }), function () {
                console.log('All files copied');
            });
        });

        return;
    }

    var stream = fs.createReadStream(src),
        filename = path.basename(src),
        options = {

        };

    client.put(path.resolve(dst, filename), stream, options, function (error) {
        console.log(error);
        if (error) return window.alert(error.message);
        self.open(dst);
        if (cb) cb();
    })
};

Folder.prototype.remove = function (dst) {
    var self = this;
    client.unlink(dst, {}, function (error) {
        if (error) return window.alert(error.message);
        console.log('Delete', dst, error);
        self.open($('#addressbar li.active').data('path'));
    });
};

Folder.prototype.save = function (src, dst) {
    var dstStream = fs.createWriteStream(dst);
    client.get(src, function (error, stream) {
        if (error) return window.alert(error.message);
        stream.pipe(dstStream);
    });
};

exports.Folder = Folder;

