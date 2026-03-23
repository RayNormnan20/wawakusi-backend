const path = require('path');
try {
  const dotenv = require('dotenv');
  dotenv.config({ path: path.join(__dirname, '..', '.env') });
} catch {}

let app;
let initError;
try {
  app = require('../dist/app').default;
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
