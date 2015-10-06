var path = require('path');

require.context('../', true, /\.[\\\/](server|common).+js(on)?$/);
require.context('loopback/common', true);

var loopback = require('loopback');
var boot = require('loopback-boot');


var app = module.exports = loopback();

app.start = function() {
  // start the web server
  return app.listen(function() {
    app.emit('started');
    console.log('Web server listening at: %s', app.get('url'));
  });
};

// Bootstrap the application, configure models, datasources and middleware.
// Sub-apps like REST API are mounted via boot scripts.
boot(app, {
  appRootDir: './server',
  //appConfigRootDir: './server',
  middleware: require('./middleware')
}, function(err) {
  if (err) throw err;

  // start the server if `$ node server.js`
  //if (require.main === module)
    app.start();
});
