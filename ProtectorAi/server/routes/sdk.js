/**
 * server/routes/sdk.js
 * Beast AI — Serves beast.js with the backend URL injected at request time.
 * Registered BEFORE the express.static middleware so it takes priority.
 *
 * GET /beast.js
 *   → reads client/beast.js, replaces %%BEAST_BACKEND_URL%%
 *     with the configured RENDER_URL (or the request origin as fallback),
 *     and serves it as application/javascript with long-lived cache headers.
 */

'use strict';

const express = require('express');
const path    = require('path');
const fs      = require('fs');
const router  = express.Router();
const logger  = require('../utils/logger');

const SDK_SOURCE_PATH = path.join(__dirname, '..', '..', 'client', 'beast.js');

// Cache the SDK source in memory after first read
let _sdkSource = null;

function _getSource() {
  if (!_sdkSource) {
    _sdkSource = fs.readFileSync(SDK_SOURCE_PATH, 'utf8');
  }
  return _sdkSource;
}

router.get('/', (req, res) => {
  try {
    const source = _getSource();

    // Determine the backend URL to inject:
    // Priority: RENDER_URL env var → request origin → relative (same origin)
    const backendUrl = process.env.RENDER_URL
      ? process.env.RENDER_URL.replace(/\/$/, '')
      : (req.protocol + '://' + req.get('host'));

    const served = source.replace(/%%BEAST_BACKEND_URL%%/g, backendUrl);

    // Cache for 1 hour in production, no-cache in dev
    const cacheControl = process.env.NODE_ENV === 'production'
      ? 'public, max-age=3600'
      : 'no-cache, no-store';

    res.setHeader('Content-Type',  'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', cacheControl);
    res.setHeader('X-Beast-Version', '1.0.0');
    res.send(served);
  } catch (err) {
    logger.error('Failed to serve beast.js', { message: err.message });
    res.status(500).send('// Beast AI SDK: failed to load');
  }
});

module.exports = router;
