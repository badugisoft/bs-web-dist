var path = require('path'),
    fs = require('fs-extra'),
    request = require('request');

module.exports = function(url, target, callback) {
    fs.ensureDir(path.dirname(target), function(err){
        if (err) {
            return callback(err);
        }

        if (url.startsWith('//')) {
            url = 'https:' + url;
        }

        request.get(url)
            .on('error', callback)
            .on('end', callback)
            .pipe(fs.createWriteStream(target));
    });
};
