const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

require('@babel/register')({
  presets: [['@babel/preset-env', { targets: { node: 'current' } }]],
  extensions: ['.js'],
  ignore: [/node_modules/],
});

const app = require('../src/app').default;

module.exports = (req, res) => {
  return app(req, res);
};
