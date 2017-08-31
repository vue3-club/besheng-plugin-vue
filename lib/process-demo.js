'use strict';

var fs = require('fs');
var path = require('path');
var JsonML = require('jsonml.js/lib/utils');
var Prism = require('node-prismjs');
var nunjucks = require('nunjucks');
nunjucks.configure({ autoescape: false });

var transformer = require('bisheng-plugin-react/lib/transformer');

var tmpl = fs.readFileSync(path.join(__dirname, 'template.html')).toString();
var watchLoader = path.join(__dirname, './loader/watch');

function isStyleTag(node) {
  return node && JsonML.getTagName(node) === 'style';
}

function getCode(node) {
  return JsonML.getChildren(JsonML.getChildren(node)[0])[0];
}

function getChineseIntroStart(contentChildren) {
  return contentChildren.findIndex(function (node) {
    return JsonML.getTagName(node) === 'h2' && JsonML.getChildren(node)[0] === 'zh-CN';
  });
}

function getEnglishIntroStart(contentChildren) {
  return contentChildren.findIndex(function (node) {
    return JsonML.getTagName(node) === 'h2' && JsonML.getChildren(node)[0] === 'en-US';
  });
}

function getCodeIndex(contentChildren) {
  return contentChildren.findIndex(function (node) {
    return JsonML.getTagName(node) === 'pre' && JsonML.getAttributes(node).lang === 'jsx';
  });
}

function getCorrespondingTSX(filename) {
  return path.join(process.cwd(), filename.replace(/\.md$/i, '.tsx'));
}

function getSourceCodeObject(contentChildren, codeIndex) {
  if (codeIndex > -1) {
    return {
      isES6: true,
      code: getCode(contentChildren[codeIndex])
    };
  }

  return {
    isTS: true
  };
}

function getStyleNode(contentChildren) {
  return contentChildren.filter(function (node) {
    return isStyleTag(node) || JsonML.getTagName(node) === 'pre' && JsonML.getAttributes(node).lang === 'css';
  })[0];
}

module.exports = function (markdownData, isBuild, noPreview, babelConfig) {
  var meta = markdownData.meta;
  meta.id = meta.filename.replace(/\.md$/, '').replace(/\//g, '-');
  // Should throw debugging demo while publish.
  if (isBuild && meta.debug) {
    return { meta: {} };
  }

  // Update content of demo.
  var contentChildren = JsonML.getChildren(markdownData.content);
  var chineseIntroStart = getChineseIntroStart(contentChildren);
  var englishIntroStart = getEnglishIntroStart(contentChildren);
  var codeIndex = getCodeIndex(contentChildren);
  var introEnd = codeIndex === -1 ? contentChildren.length : codeIndex;
  if (chineseIntroStart > -1 /* equal to englishIntroStart > -1 */) {
      markdownData.content = {
        'zh-CN': contentChildren.slice(chineseIntroStart + 1, englishIntroStart),
        'en-US': contentChildren.slice(englishIntroStart + 1, introEnd)
      };
    } else {
    markdownData.content = contentChildren.slice(0, introEnd);
  }

  var sourceCodeObject = getSourceCodeObject(contentChildren, codeIndex);
  if (sourceCodeObject.isES6) {
    markdownData.highlightedCode = contentChildren[codeIndex].slice(0, 2);
    // console.log(markdownData.highlightedCode)

    function escapeWinPath(path) {
      return path.replace(/\\/g, '\\\\');
    }
  
    var isSSR = false;
    var filename = meta.filename; 
    var filePath = path.join(process.cwd(), filename.replace(/\.md$/, '.vue'));
    // if (fs.existsSync(filePath)) {
    //   var fileContent = fs.readFileSync(filePath).toString();
    //   var language = Prism.languages['jsx'] || Prism.languages.autoit;
    //   // markdownData.highlightedCode = Prism.highlight(fileContent, language);
    //   markdownData.preview = {
    //     __BISHENG_EMBEDED_CODE: true,
    //     code: '' + ('function () {\n' + '  return new Promise(function (resolve) {\n') + (isSSR ? '' : '    require.ensure([], function (require) {\n') + '      resolve(require(\'' + escapeWinPath(filePath) + '\'));\n' + (isSSR ? '' : '    });\n') + '  });\n' + '}'
    //   };
    // }
    if (fs.existsSync(filePath)){
      markdownData.preview = {
        __BISHENG_EMBEDED_CODE: true,
        // code: transformer(sourceCodeObject.code, babelConfig)
        code: '' + ('function () {\n' + '  return new Promise(function (resolve) {\n') + (isSSR ? '' : '    require.ensure([], function (require) {\n') + '      resolve(require(\'' + escapeWinPath(filePath) + '\'));\n' + (isSSR ? '' : '    });\n') + '  });\n' + '}'
      }; 
    }else if (!fs.existsSync(filePath) && !noPreview) {
      markdownData.preview = {
        __BISHENG_EMBEDED_CODE: true,
        code: transformer(sourceCodeObject.code, babelConfig)
      };
    }
  } else {
    // TODO: use loader's `this.dependencies` to watch
    var requireString = 'require(\'!!babel!' + watchLoader + '!' + getCorrespondingTSX(meta.filename) + '\')';
    markdownData.highlightedCode = {
      __BISHENG_EMBEDED_CODE: true,
      code: requireString + '.highlightedCode'
    };
    markdownData.preview = {
      __BISHENG_EMBEDED_CODE: true,
      code: requireString + '.preview'
    };
  }

  // Add style node to markdown data.
  var styleNode = getStyleNode(contentChildren);
  if (isStyleTag(styleNode)) {
    markdownData.style = JsonML.getChildren(styleNode)[0];
  } else if (styleNode) {
    var styleTag = contentChildren.filter(isStyleTag)[0];
    markdownData.style = getCode(styleNode) + (styleTag ? JsonML.getChildren(styleTag)[0] : '');
    markdownData.highlightedStyle = JsonML.getAttributes(styleNode).highlighted;
  }

  if (meta.iframe) {
    var html = nunjucks.renderString(tmpl, {
      id: meta.id,
      style: markdownData.style,
      script: markdownData.preview.code,
      reactRouter: meta.reactRouter === 'react-router' ? 'react-router@3/umd/ReactRouter' : meta.reactRouter === 'react-router-dom' ? 'react-router-dom@4/umd/react-router-dom' : false
    });
    var fileName = 'demo-' + Math.random() + '.html';
    fs.writeFile(path.join(process.cwd(), '_site', fileName), html);
    markdownData.src = path.join('/', fileName);
  }

  return markdownData;
};