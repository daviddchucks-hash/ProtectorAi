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

/**
 * Normalise a RENDER_URL that may be a bare hostname (e.g. "beast-ai.onrender.com")
 * or a full URL (e.g. "https://beast-ai.onrender.com"). Always return a full https:// URL.
 */
function _normaliseBackendUrl(raw) {
  if (!raw) return null;
  const s = raw.trim().replace(/\/$/, '');
  if (s.startsWith('http://') || s.startsWith('https://')) return s;
  return 'https://' + s;
}

router.get('/', (req, res) => {
  try {
    const source = _getSource();

    // ── Resolve backend URL ─────────────────────────────────────────
    // Priority:
    //  1. RENDER_URL env var (normalised to ensure https:// prefix)
    //  2. Derived from the incoming request (works with trust proxy: 1)
    const rawRenderUrl = process.env.RENDER_URL;
    const backendUrl = rawRenderUrl
      ? _normaliseBackendUrl(rawRenderUrl)
      : (req.protocol + '://' + req.get('host'));

    logger.debug('Serving beast.js', { backendUrl, hasToken: !!req.query.token });

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
    res.setHeader('X-Beast-Backend', backendUrl);
    // Allow any origin to load beast.js
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(served);
  } catch (err) {
    logger.error('Failed to serve beast.js', { message: err.message });
    res.status(500).send('// Beast AI SDK: failed to load');
  }
});

module.exports = router;
