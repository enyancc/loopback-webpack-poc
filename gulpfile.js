var gulp = require('gulp');
var webpack = require('webpack');
var path = require('path');
var fs = require('fs');
var DeepMerge = require('deep-merge');
var nodemon = require('nodemon');
var WebpackDevServer = require('webpack-dev-server');
var StringReplacePlugin = require("string-replace-webpack-plugin");

var deepmerge = DeepMerge(function(target, source, key) {
  if (target instanceof Array) {
    return [].concat(target, source);
  }
  return source;
});

// generic

var defaultConfig = {
  module: {
    loaders: [
      { test: /\.json$/, loaders: ['json'] },
      {
        test: /compiler\.js$/,
        include: [
          path.resolve(__dirname, "node_modules/loopback-boot/lib")
        ],
        loader: StringReplacePlugin.replace({
          replacements: [
            {
              pattern: /require.extensions/g,
              replacement: function(/*match, p1, offset, string*/) {
                return '{".js": function(){}}';
              }
            },
            {
              pattern: /require\(jsonFile\)/g,
              replacement: function(/*match, p1, offset, string*/) {

                console.log('replacement');

                return 'require(jsonFile.replace(__dirname, \'\').replace(__dirname, \'.\'))'
                  .replace('__dirname', "'" + __dirname + path.sep + "node_modules" + path.sep + "'")
                  .replace('__dirname', "'" + __dirname + "'");
              }
            }
          ]
        })
      },
      {
        test: /executor\.js$/,
        include: [
          path.resolve(__dirname, "node_modules/loopback-boot/lib")
        ],
        loader: StringReplacePlugin.replace({
          replacements: [
            {
              pattern: /require\(data\.sourceFile\)/g,
              replacement: function(/*match, p1, offset, string*/) {
                return 'require(data.sourceFile.replace(__dirname, \'\').replace(__dirname, \'.\'))'
                  .replace('__dirname', "'" + __dirname + path.sep + "node_modules" + path.sep + "'")
                  .replace('__dirname', "'" + __dirname + "'");
              }
            },
            {
              pattern: 'var exports = require(filepath)',
              replacement: function(/*match, p1, offset, string*/) {
                return 'var exports = require(filepath.replace(__dirname, \'\').replace(__dirname, \'.\'))'
                  .replace('__dirname', "'" + __dirname + path.sep + "node_modules" + path.sep + "'")
                  .replace('__dirname', "'" + __dirname + "'");
              }
            }
          ]
        })
      },
      {
        test: /\.js$/,
        include: [
          path.resolve(__dirname, "server/models"),
          path.resolve(__dirname, "node_modules/loopback/common/models")
        ],
        loader: StringReplacePlugin.replace({
          replacements: [
            {
              pattern: /require\('\.\.\/\.\./g,
              replacement: function(match/*, p1, offset, string*/) {
                return 'require(' + match[8] + 'loopback';
              }
            }
          ]
        })
      },
      {
        test: /config-loader\.js$/,
        include: [
          path.resolve(__dirname, "node_modules/loopback-boot/lib")
        ],
        loader: StringReplacePlugin.replace({
          replacements: [
            {
              pattern: 'var filepath = path.resolve(appRootDir, fileName);',
              replacement: function(/*match, p1, offset, string*/) {
                return 'var filepath = \'./\' + path.join(appRootDir, fileName);';
              }
            }
          ]
        })
      },
      { test: /\.js$/, exclude: /node_modules/, loaders: ['monkey-hot', 'babel'] }
    ]
  }
};

if (process.env.NODE_ENV !== 'production') {
  //defaultConfig.devtool = '#eval-source-map';
  defaultConfig.devtool = 'source-map';
  defaultConfig.debug = true;
}

function config(overrides) {
  return deepmerge(defaultConfig, overrides || {});
}

// frontend

var frontendConfig = config({
  entry: [
    'webpack-dev-server/client?http://localhost:3000',
    'webpack/hot/only-dev-server',
    './static/js/main.js'
  ],
  output: {
    path: path.join(__dirname, 'static/build'),
    publicPath: 'http://localhost:3000/build',
    filename: 'frontend.js'
  },
  plugins: [
    new webpack.HotModuleReplacementPlugin({ quiet: true })
  ]
});

// backend

var nodeModules = {};

fs.readdirSync('node_modules')
  .filter(function(x) {
    return ['.bin', 'loopback-boot'].indexOf(x) === -1;
  })
  .forEach(function(mod) {
    nodeModules[mod] = 'commonjs ' + mod;
  });

var backendConfig = config({
  entry: [
    'webpack/hot/signal.js',
    './server/server.js'
  ],
  target: 'node',
  output: {
    path: path.join(__dirname, 'build'),
    filename: 'backend.js'
  },
  node: {
    __dirname: true,
    __filename: true
  },
  externals: [
    nodeModules,
    /loopback$/,
    /loopback\/lib/
  ],
  recordsPath: path.join(__dirname, 'build/_records'),
  plugins: [
    new StringReplacePlugin(),
    new webpack.IgnorePlugin(/\.(css|less)$/),
    new webpack.BannerPlugin('console.log(\'started\');require("source-map-support").install();',
      { raw: true, entryOnly: false }),

    //new webpack.PrefetchPlugin(path.resolve(__dirname), './server/server.js'),
    new webpack.ContextReplacementPlugin(/loopback[\/\\]common/, '.', true, /\.+js(on)?$/),
    new webpack.ContextReplacementPlugin(/loopback-boot[\/\\]lib$/, path.resolve(__dirname), true, /(\.[\\\/](server|common)|loopback\/common\/models).+js(on)?$/),
    new webpack.HotModuleReplacementPlugin({ quiet: true })
  ]
});

// tasks

function onBuild(done) {
  return function(err, stats) {
    if (err) {
      console.log('Error', err);
    }
    else {
      console.log(stats.toString());
    }

    if (done) {
      done();
    }
  }
}

gulp.task('frontend-build', function(done) {
  webpack(frontendConfig).run(onBuild(done));
});

gulp.task('frontend-watch', function() {
  //webpack(frontendConfig).watch(100, onBuild());

  new WebpackDevServer(webpack(frontendConfig), {
    publicPath: frontendConfig.output.publicPath,
    hot: true
  }).listen(4000, 'localhost', function(err, result) {
      if (err) {
        console.log(err);
      }
      else {
        console.log('webpack dev server listening at localhost:3000');
      }
    });

});

gulp.task('backend-build', function(done) {
  webpack(backendConfig).run(onBuild(done));
});

gulp.task('backend-watch', function(done) {
  var firedDone = false;
  webpack(backendConfig).watch(100, function(err, stats) {
    if (!firedDone) {
      firedDone = true;
      done();
    }

    nodemon.restart();
  });
});

gulp.task('build', ['frontend-build', 'backend-build']);
gulp.task('watch', ['frontend-watch', 'backend-watch']);

gulp.task('run', ['backend-watch'], function() {
  nodemon({
    execMap: {
      js: 'node'
    },
    script: path.join(__dirname, 'build/backend'),
    ignore: ['*'],
    watch: ['foo/'],
    ext: 'noop'
  }).on('restart', function() {
    console.log('Patched!');
  });
});
