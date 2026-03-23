const path = require('path');
try {
  const dotenv = require('dotenv');
  dotenv.config({ path: path.join(__dirname, '..', '.env') });
} catch {}

let app;
let initError;
try {
  const presetEnv = require('@babel/preset-env');
  const presetEnvFn = presetEnv && typeof presetEnv === 'object' && presetEnv.default ? presetEnv.default : presetEnv;
  require('@babel/register')({
    presets: [[presetEnvFn, { targets: { node: 'current' } }]],
    extensions: ['.js'],
    ignore: [/node_modules/],
  });
  app = require('../src/app').default;
} catch (err) {
  initError = err;
}

module.exports = (req, res) => {
  if (initError) {
    return res.status(500).json({
      rpta: false,
      mensaje: 'Server init failed.',
      detalle: initError?.message || String(initError),
    });
  }
  return app(req, res);
};
