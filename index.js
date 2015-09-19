#!/usr/bin/env node

var path = require('path');
var async = require('async');
var fs = require('fs-extra');
var extend = require('extend');
var unzip = require('unzip');
var temp = require('temp');

require(path.resolve(__dirname, 'lib/polyfill'));

var download = require(path.resolve(__dirname, 'lib/download'));
var config = require(path.resolve(__dirname, 'lib/config.json'));

temp.track();

var setting = require(path.resolve(process.argv[2]));
var force = process.argv[3] ?
        process.argv[3] === 'force' :
        setting.install.force === true;

function getSource(name) {
    try {
        var source = require(path.resolve(__dirname, 'sources', name + '.json'));
        source.defaultParams = source.defaultParams || {};

        if (source.cdn) {
            if (config.cdns[source.cdn]) {
                source.cdn = config.cdns[source.cdn];
            }
            source.defaultParams.cdnName = source.cdnName || name;
        }
        return source;
    }
    catch (e) {
        console.error(e);
    }
    return null;
}

var scripts = extend(true, config.scripts, setting.generate.scripts || {} );

function processSettingList(list) {
    var newList = [];

    for (var name in list) {
        var data = list[name].split(',');
        var newElem = { params: { name: name, version: data[0].trim() }, plugins: [] };

        for (var i = 1; i < data.length; ++i) {
            if (data[i].indexOf('=') !== -1) {
                var nameVal = data[i].split('=');
                newElem.params[nameVal[0].trim()] = nameVal[1].trim();
            }
            else {
                newElem.plugins.push(data[i].trim());
            }
        }

        newList.push(newElem);
    }

    return newList;
}

setting.common = processSettingList(setting.common || {});
setting.optional = processSettingList(setting.optional || {});

function install(data, callback) {
    var source = getSource(data.params.name);
    if (!source) {
        return callback('unknown package: ' + data.params.name);
    }

    if (data.params.version === "*") {
        data.params.version = source.lastVersion;
    }

    var params = extend(true, source.defaultParams, data.params);

    console.log('+ {{name}}-{{version}}'.format(params));

    var targetDir = path.join(path.resolve(setting.install.dir), setting.install.name).format(params);
    if (force === false && fs.existsSync(targetDir)) {
        console.log('  -', 'skipped');
        return callback();
    }

    fs.removeSync(targetDir);

    if (source.download) {
        var filters = [];
        for (var src in source.download.copy) {
            filters.push({
                regexp: new RegExp('^' + src.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*') + '$'),
                target: source.download.copy[src]
            });
        }

        var tempPath = temp.path();
        download(source.download.url.format(params), tempPath, function(err){
            if (err) {
                return callback(err);
            }

            fs.createReadStream(tempPath)
                .pipe(unzip.Parse())
                .on('error', callback)
                .on('finish', callback)
                .on('entry', function(entry) {
                    if (entry.type !== 'File') {
                        entry.autodrain();;
                        return;
                    }

                    if (!filters.some(function(filter){
                        if (!entry.path.match(filter.regexp)) {
                            return false;
                        }

                        filePath = path.join(targetDir, filter.target, path.basename(entry.path)).format(params);
                        console.log('  -', filePath.substr(targetDir.length + 1));
                        fs.ensureDir(path.dirname(filePath), function(err){
                            if (err) {
                                throw Error(err);
                            }
                            entry.pipe(fs.createWriteStream(filePath));
                        });

                        return true;
                    })) {
                        entry.autodrain();;
                    }
                });
        });
    }
    else if (source.cdn) {
        async.forEachOfSeries(source.files, function(kinds, filePath, callback){
            var url = (source.cdn + filePath).format(params);
            var target = path.join(targetDir, filePath).format(params);
            download(url, target, function(err){
                if (err) {
                    return callback(err);
                }
                console.log('  -', target.substr(targetDir.length + 1));
                callback();
            });
        }, function(err){
            if (err) {
                return callback(err);
            }

            callback();
        });
    }
    else {
        callback('invalid package: ' + data.params.name);
    }
}

function generate(typeInfo, data) {
    var source = getSource(data.params.name);
    if (!source) {
        throw Error('unknown package: ' + data.params.name);
    }

    if (data.params.version === "*") {
        version = source.lastVersion;
    }

    var params = extend(true, source.defaultParams, data.params);

    var result = '';
    for (var filePath in source.files) {
        var typeNames =  source.files[filePath] || [];
        if (!Array.isArray(typeNames)) {
            typeNames = [typeNames];
        }

        if (typeNames.indexOf(typeInfo.name) !== -1) {
            var url = typeInfo.isCdn && source.cdn ?
                (source.cdn + filePath).format(params) :
                (setting.install.url + '/' + setting.install.name + '/' + filePath).format(params);

            result += scripts[typeInfo.type].format({ url: url }) + '\n';
        }
    }
    return result;
}

function installPackages(name, packages, callback) {
    console.info('* install ' + name + ' packages');

    async.eachSeries(packages, function(data, callback){
        install(data, callback);
    }, callback);
}

function generateScripts(name, packages, callback) {
    console.info('* generate scripts for ' + name + ' packages');

    async.eachSeries(config.typeInfos, function(typeInfo, callback){
        var typeName = name + '.' + ( typeInfo.isCdn ? 'cdn.' : '' ) + typeInfo.name;
        var filePath = path.resolve(setting.generate.dir, setting.generate.name.format({ type: typeName }));
        var fileContent = packages.map(function(data){ return generate(typeInfo, data); }).join('');
        fs.ensureDir(path.dirname(filePath), function(err){
            if (err) {
                return callback(err);
            }
            fs.writeFile(filePath, fileContent, callback);
        });
    }, callback);
}

async.series([
    function(cb) { installPackages('common', setting.common, cb); },
    function(cb) { installPackages('optional', setting.optional, cb); },
    function(cb) { generateScripts('common', setting.common, cb); },
    function(cb) { generateScripts('optional', setting.optional, cb); }
], function(err){
    if (err) {
        console.error(err);
    }
});
