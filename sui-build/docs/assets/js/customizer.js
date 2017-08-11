/*!
 * Bootstrap Customizer (http://getbootstrap.com/customize/)
 * Copyright 2011-2014 Twitter, Inc.
 *
 * Licensed under the Creative Commons Attribution 3.0 Unported License. For
 * details, see http://creativecommons.org/licenses/by/3.0/.
 */

/* global JSZip, less, saveAs, UglifyJS, __js, __less, __fonts */

window.onload = function () { // wait for load in a dumb way because B-0
  'use strict';
  var cw = '/*!\n' +
           ' * Bootstrap v3.2.0 (http://getbootstrap.com)\n' +
           ' * Copyright 2011-2014 Twitter, Inc.\n' +
           ' * Licensed under MIT (https://github.com/twbs/bootstrap/blob/master/LICENSE)\n' +
           ' */\n\n'

  function showError(msg, err) {
    window.alert(msg);
    $compileBtn.removeAttr('disabled')
    throw err
  }

  function getQueryParam(key) {
    key = key.replace(/[*+?^$.\[\]{}()|\\\/]/g, '\\$&') // escape RegEx meta chars
    var match = location.search.match(new RegExp('[?&]' + key + '=([^&]+)(&|$)'))
    return match && decodeURIComponent(match[1].replace(/\+/g, ' '))
  }

  function getCustomizerData() {
    var data = {
      css: {},
      js: {}
    }
    var put = function(v, checked) {
      if (!v) return;
      v = v.replace(/^\s+/g, '').replace(/\s+$/g, '')
      if(/\.less/.test(v)) {
        data.css[v] = checked
      } else {
        data.js[v] = checked
      }
    }
    $('#less-section input').each(function () {
      var value = this.value, checked = $(this).is(":checked")
      if(/,/.test(value)) {
        value.split(",").forEach(function(v, i) {
          put(v, checked)
        })
      } else {
        put(value, checked)
      }
    });

    if ($.isEmptyObject(data.vars) && !data.css && !data.js) return

    return data
  }


  function generateZip(css, js, fonts, config, complete) {
    if (!css && !js) return showError('请至少选择一个组件', new Error('no Bootstrap'))

    var zip = new JSZip()

    if (css) {
      var cssFolder = zip.folder('css')
      for (var fileName in css) {
        cssFolder.file(fileName, css[fileName])
      }
    }

    if (js) {
      var jsFolder = zip.folder('js')
      for (var jsFileName in js) {
        jsFolder.file(jsFileName, js[jsFileName])
      }
    }

    if (fonts) {
      var fontsFolder = zip.folder('fonts')
      for (var fontsFileName in fonts) {
        fontsFolder.file(fontsFileName, fonts[fontsFileName], { base64: true })
      }
    }

    if (config) {
      zip.file('config.json', config)
    }

    var content = zip.generate({ type: 'blob' })

    complete(content)
  }

  function generateCustomLess(vars) {
    var result = ''

    for (var key in vars) {
      result += key + ': ' + vars[key] + ';\n'
    }

    return result + '\n\n'
  }

  function generateFonts() {
    if (getCustomizerData().css["icons.less"]) {
      return __fonts
    }
  }

  // Returns an Array of @import'd filenames in the order
  // in which they appear in the file.
  function includedLessFilenames(lessFilename) {
    var IMPORT_REGEX = /^@import [\"|\'](.*?)[\"|\'];/; //\\"
    var lessLines = __less[lessFilename].split('\n')

    var imports = []
    $.each(lessLines, function (index, lessLine) {
      var match = IMPORT_REGEX.exec(lessLine)
      if (match) {
        var importee = match[1]
        var transitiveImports = includedLessFilenames(importee)
        $.each(transitiveImports, function (index, transitiveImportee) {
          if ($.inArray(transitiveImportee, imports) === -1) {
            imports.push(transitiveImportee)
          }
        })
        imports.push(importee)
      }
    })

    return imports
  }

  function generateLESS(lessFilename, lessFileIncludes, vars) {
    var lessSource = __less[lessFilename]

    var lessFilenames = includedLessFilenames(lessFilename)
    $.each(lessFilenames, function (index, filename) {
      var fileInclude = lessFileIncludes[filename]

      // Files not explicitly unchecked are compiled into the final stylesheet.
      // Core stylesheets like 'normalize.less' are not included in the form
      // since disabling them would wreck everything, and so their 'fileInclude'
      // will be 'undefined'.
      if (fileInclude || (fileInclude == null)) {
        lessSource += __less[filename]
        console && console.log('+: '+filename);
      }

      // Custom variables are added after Bootstrap variables so the custom
      // ones take precedence.
      if (('variables.less' === filename) && vars) lessSource += generateCustomLess(vars)
    })

    lessSource = lessSource.replace(/@import[^\n]*/gi, '') // strip any imports
    return lessSource
  }

  function compileLESS(lessSource, baseFilename, intoResult) {
    var parser = new less.Parser({
      paths: ['variables.less', 'mixins.less'],
      optimization: 0,
      filename: baseFilename + '.css'
    })

    parser.parse(lessSource, function (err, tree) {
      if (err) {
        return showError('<strong>Ruh roh!</strong> Could not parse less files.', err)
      }
      intoResult[baseFilename + '.css']     = cw + tree.toCSS()
      intoResult[baseFilename + '.min.css'] = cw + tree.toCSS({ compress: true })
    })
  }

  function generateCSS() {
    var lessFileIncludes = getCustomizerData().css,
        oneChecked = false;
    for(var v in lessFileIncludes) {
      if(lessFileIncludes[v]) oneChecked = true
    }

    if (!oneChecked) return false

    var result = {}
    var vars = {}

    $('#less-variables-section input')
      .each(function () {
        $(this).val() && (vars[$(this).prev().text()] = $(this).val())
      })

    var bsLessSource    = generateLESS('sui.less', lessFileIncludes, vars)
    //var themeLessSource = generateLESS('theme.less',     lessFileIncludes, vars)

    try {
      compileLESS(bsLessSource, 'sui', result)
      //compileLESS(themeLessSource, 'bootstrap-theme', result)
    } catch (err) {
      return showError('<strong>Ruh roh!</strong> Could not parse less files.', err)
    }

    return result
  }

  function uglify(js) {
    var ast = UglifyJS.parse(js)
    ast.figure_out_scope()

    var compressor = UglifyJS.Compressor()
    var compressedAst = ast.transform(compressor)

    compressedAst.figure_out_scope()
    compressedAst.compute_char_frequency()
    compressedAst.mangle_names()

    var stream = UglifyJS.OutputStream()
    compressedAst.print(stream)

    return stream.toString()
  }

  function generateJS() {
    var jqueryCheck = 'if (typeof jQuery === "undefined") { throw new Error("Bootstrap\'s JavaScript requires jQuery") }\n\n'
    var jsChecked = getCustomizerData().js
    var checkOne = false
    var js = ''
    for(var v in jsChecked) {
      if(jsChecked[v]) {
        js += __js[v];
        checkOne = true
      }
    }
    if (!checkOne) return false
    jsChecked["transition.js"] = true

    js = jqueryCheck + js

    return {
      'sui.js': js,
      'sui.min.js': uglify(js)
    }
  }

  var inputsComponent = $('#less-section input')
  var inputsPlugin    = $('#plugin-section input')
  var inputsVariables = $('#less-variables-section input')

  $('#less-section .toggle').on('click', function (e) {
    e.preventDefault()
    inputsComponent.prop('checked', !inputsComponent.is(':checked'))
  })

  $('#plugin-section .toggle').on('click', function (e) {
    e.preventDefault()
    inputsPlugin.prop('checked', !inputsPlugin.is(':checked'))
  })

  $('#less-variables-section .toggle').on('click', function (e) {
    e.preventDefault()
    inputsVariables.val('')
  })

  $('[data-dependencies]').on('click', function () {
    if (!$(this).is(':checked')) return
    var dependencies = this.getAttribute('data-dependencies')
    if (!dependencies) return
    dependencies = dependencies.split(',')
    for (var i = 0; i < dependencies.length; i++) {
      var dependency = $('[value="' + dependencies[i] + '"]')
      dependency && dependency.prop('checked', true)
    }
  })

  $('[data-dependents]').on('click', function () {
    if ($(this).is(':checked')) return
    var dependents = this.getAttribute('data-dependents')
    if (!dependents) return
    dependents = dependents.split(',')
    for (var i = 0; i < dependents.length; i++) {
      var dependent = $('[value="' + dependents[i] + '"]')
      dependent && dependent.prop('checked', false)
    }
  })

  var $compileBtn = $('#customize-download')

  $compileBtn.on('click', function (e) {
    var configData = getCustomizerData()
    var configJson = JSON.stringify(configData, null, 2)

    e.preventDefault()

    $compileBtn.attr('disabled', 'disabled')

    generateZip(generateCSS(), generateJS(), generateFonts(), configJson, function (blob) {
      $compileBtn.removeAttr('disabled')
      saveAs(blob, 'bootstrap.zip')
    })
  });
}
