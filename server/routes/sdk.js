/**
 * server/routes/sdk.js
 * Beast AI v2 — Serves beast.js with the backend URL injected at request time.
 * GET /beast.js?token=<siteToken>  (optional token param for explicit site binding)
 */

'use strict';

const express = require('express');
const path    = require('path');
const fs      = require('fs');
const router  = express.Router();
const logger  = require('../utils/logger');

const SDK_SOURCE_PATH = path.join(__dirname, '..', '..', 'client', 'beast.js');
let _sdkSource = null;

function _getSource() {
  if (!_sdkSource) _sdkSource = fs.readFileSync(SDK_SOURCE_PATH, 'utf8');
  return _sdkSource;
}

router.get('/', (req, res) => {
  try {
    const source = _getSource();
    const backendUrl = process.env.RENDER_URL
      ? process.env.RENDER_URL.replace(/\/$/, '')
      : (req.protocol + '://' + req.get('host'));

    let served = source.replace(/%%BEAST_BACKEND_URL%%/g, backendUrl);

    // If a token is passed as query param, inject it into the script
    const token = req.query.token;
    if (token && typeof token === 'string' && token.startsWith('tok_')) {
      served = served.replace(/%%BEAST_SITE_TOKEN%%/g, token);
    } else {
      served = served.replace(/%%BEAST_SITE_TOKEN%%/g, '');
    }

    const cacheControl = process.env.NODE_ENV === 'production'
      ? 'public, max-age=3600'
      : 'no-cache, no-store';

    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', cacheControl);
    res.setHeader('X-Beast-Version', '2.0.0');
    // Allow any origin to load beast.js
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(served);
  } catch (err) {
    logger.error('Failed to serve beast.js', { message: err.message });
    res.status(500).send('// Beast AI SDK: failed to load');
  }
});

module.exports = router;
