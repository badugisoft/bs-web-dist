var path = require('path'),
    os = require('os'),
    fs = require('fs-extra'),
    request = require('request');

var cacheDir = path.resolve(os.tmpdir(), 'bs-web-dist-cache');
console.log(cacheDir);
var cacheIndex = path.join(cacheDir, 'index.json');
var cache = {};
if (fs.existsSync(cacheDir)) {
    if (fs.existsSync(cacheIndex)) {
        cache = require(cacheIndex);
    }
}
else {
    fs.ensureDirSync(cacheDir);
}

function getRandomString(length) {
    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz1234567890';
    var res = '';
    for(var i = 0; i < length; ++i) {
        res += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return res;
}

function getCachePath() {
    while(true) {
        var cachePath = path.join(cacheDir, getRandomString(20));
        if (!fs.existsSync(cachePath)) {
            return cachePath;
        }
    }
}

function copy(src, dst, callback) {
    fs.ensureDirSync(path.dirname(dst));
    fs.copy(src, dst, callback);
}

module.exports = function(url, target, callback) {
    if (url.startsWith('//')) {
        url = 'https:' + url;
    }

    if (!cache[url]) {
        var cachePath = getCachePath();
        request.get(url)
            .on('error', callback)
            .pipe(fs.createWriteStream(cachePath))
            .on('finish', function(){
                cache[url] = cachePath;
                fs.writeFileSync(cacheIndex, JSON.stringify(cache, null, '\t'));
                copy(cache[url], target, callback);
            });
    }
    else {
        copy(cache[url], target, callback);
    }
};
