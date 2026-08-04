/**
 * server/routes/auth.js
 * Beast AI v2 — Firebase Auth proxy
 *
 * Proxies Firebase Identity Toolkit and Secure Token requests through the
 * server so that the API key's HTTP referrer restrictions don't block
 * dashboard logins. Node.js sends no HTTP Referer header, so Google's
 * referrer-based key restriction is bypassed entirely.
 */

'use strict';

const express = require('express');
const router  = express.Router();
const logger  = require('../utils/logger');
const { errorResponse } = require('../utils/helpers');

const IDENTITY_TOOLKIT = 'https://identitytoolkit.googleapis.com/v1/accounts';
const SECURE_TOKEN     = 'https://securetoken.googleapis.com/v1/token';

function getApiKey() {
  const key = process.env.FIREBASE_API_KEY;
  if (!key) {
    throw new Error('FIREBASE_API_KEY environment variable is not set');
  }
  return key;
}

/**
 * POST /api/auth/signin
 * Body: { email, password }
 * Proxies to Firebase :signInWithPassword
 */
router.post('/signin', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json(errorResponse('email and password are required', 'MISSING_FIELDS'));
  }
  try {
    const apiKey = getApiKey();
    const fbRes  = await fetch(`${IDENTITY_TOOLKIT}:signInWithPassword?key=${apiKey}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, password, returnSecureToken: true }),
    });
    const data = await fbRes.json();
    // Forward Firebase's exact response and status code (400 for bad creds, etc.)
    res.status(fbRes.ok ? 200 : fbRes.status).json(data);
  } catch (err) {
    logger.error('Auth proxy /signin error', { message: err.message });
    res.status(502).json(errorResponse('Authentication service unavailable', 'AUTH_PROXY_ERROR'));
  }
});

/**
 * POST /api/auth/signup
 * Body: { email, password }
 * Proxies to Firebase :signUp
 */
router.post('/signup', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json(errorResponse('email and password are required', 'MISSING_FIELDS'));
  }
  try {
    const apiKey = getApiKey();
    const fbRes  = await fetch(`${IDENTITY_TOOLKIT}:signUp?key=${apiKey}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, password, returnSecureToken: true }),
    });
    const data = await fbRes.json();
    res.status(fbRes.ok ? 200 : fbRes.status).json(data);
  } catch (err) {
    logger.error('Auth proxy /signup error', { message: err.message });
    res.status(502).json(errorResponse('Authentication service unavailable', 'AUTH_PROXY_ERROR'));
  }
});

/**
 * POST /api/auth/refresh
 * Body: { refreshToken }
 * Proxies to Firebase Secure Token endpoint
 */
router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body || {};
  if (!refreshToken) {
    return res.status(400).json(errorResponse('refreshToken is required', 'MISSING_FIELDS'));
  }
  try {
    const apiKey = getApiKey();
    const fbRes  = await fetch(`${SECURE_TOKEN}?key=${apiKey}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`,
    });
    const data = await fbRes.json();
    res.status(fbRes.ok ? 200 : fbRes.status).json(data);
  } catch (err) {
    logger.error('Auth proxy /refresh error', { message: err.message });
    res.status(502).json(errorResponse('Authentication service unavailable', 'AUTH_PROXY_ERROR'));
  }
});

module.exports = router;
