var mapEachResource = require('plumber').mapEachResource;
var mercator = require('mercator');
var SourceMap = mercator.SourceMap;

var q = require('q');
var less = require('less');
var extend = require('extend');


// Recursively extract "importedFilename" properties
function collectFilenames(node) {
    // FIXME: flaky way of doing this
    var files = (node.rules || []).reduce(function(files, rule) {
        if (rule.importedFilename) {
            files = files.concat(rule.importedFilename);
        }
        return files.concat(collectFilenames(rule));
    }, []);

    return files;
}


module.exports = function(options) {
    return mapEachResource(function(resource, supervisor) {
        // TODO: map extra options (filename, paths, yuicompress, etc)?
        var resourcePath = resource.path();
        var parser = new less.Parser(extend({}, options, {
            filename: resourcePath && resourcePath.absolute()
        }));
        var parse = q.denodeify(parser.parse.bind(parser));
        return parse(resource.data()).then(function(tree) {
            // Tell supervisor about all @imported files
            collectFilenames(tree).forEach(function(dependencyFile) {
                supervisor.dependOn(dependencyFile);
            });

            var sourceMapData;
            var compiledCss = resource.withType('css');
            var cssData = tree.toCSS({
                sourceMap: true,
                sourceMapFilename: compiledCss.sourceMapFilename(),
                writeSourceMap: function writeSourceMap(data) {
                    // this whole pseudo async is somewhat ridiculous
                    sourceMapData = data;
                }
            });

            var data = mercator.stripSourceMappingComment(cssData);
            var sourceMap = SourceMap.fromMapData(sourceMapData);
            // FIXME: apply previous source map if any
            return compiledCss.withData(data, sourceMap);
        });
    });
};
