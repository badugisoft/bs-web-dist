if (!String.prototype.startsWith) {
    String.prototype.startsWith = function(searchString, position) {
        position = position || 0;
        return this.indexOf(searchString, position) === position;
    };
}

if (!String.prototype.format) {
    String.prototype.format = function(params) {
        params = params || {};
        var str = this;
        for (var name in params) {
            str = str.replace(new RegExp('\\{\\{' + name + '\\}\\}', 'g'), params[name]);
        }
        return str;
    };
}
