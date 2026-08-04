/**
 * server/middleware/auth.js
 * Beast AI v2 — Firebase Authentication middleware
 *
 * Verifies Firebase ID tokens sent as Bearer tokens in Authorization header.
 * Attaches req.user = { uid, email } on success.
 */

'use strict';

const { getAuth } = require('../../firebase/admin');
const { errorResponse } = require('../utils/helpers');
const logger = require('../utils/logger');

/**
 * Middleware: require a valid Firebase ID token.
 */
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    return res.status(401).json(errorResponse('Missing or invalid Authorization header', 'UNAUTHORIZED'));
  }

  const token = header.slice(7);
  try {
    const auth    = getAuth();
    const decoded = await auth.verifyIdToken(token);
    req.user = { uid: decoded.uid, email: decoded.email || '' };
    next();
  } catch (err) {
    logger.warn('Auth token invalid', { message: err.message });
    res.status(401).json(errorResponse('Invalid or expired token', 'TOKEN_INVALID'));
  }
}

/**
 * Middleware: verify site token from X-Beast-Site-Token header.
 * Attaches req.site = { siteId, ... } on success.
 */
async function requireSiteToken(req, res, next) {
  const token = req.headers['x-beast-site-token'] || req.headers['x-beast-site-id'] || '';
  if (!token) {
    return res.status(401).json(errorResponse('Missing site token', 'NO_SITE_TOKEN'));
  }

  const { getSiteByToken } = require('../services/siteService');
  try {
    const site = await getSiteByToken(token);
    if (!site || !site.active) {
      return res.status(403).json(errorResponse('Invalid or inactive site token', 'INVALID_SITE_TOKEN'));
    }
    req.site    = site;
    req.siteId  = site.siteId;
    next();
  } catch (err) {
    logger.error('Site token lookup failed', { message: err.message });
    res.status(500).json(errorResponse('Authentication error', 'AUTH_ERROR'));
  }
}

module.exports = { requireAuth, requireSiteToken };
