'use strict';

var path = require('path');
var processDoc = require('./process-doc');
var processDemo = require('./process-demo');

module.exports = function (markdownData, _ref, isBuild) {
  var noPreview = _ref.noPreview,
      babelConfig = _ref.babelConfig;

  var isDemo = /\/demo$/i.test(path.dirname(markdownData.meta.filename));
  if (isDemo) {
    return processDemo(markdownData, isBuild, noPreview, babelConfig);
  }
  return processDoc(markdownData);
};