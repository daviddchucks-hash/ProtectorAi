/**
 * server/middleware/security.js
 * Beast AI v2 — Security middleware stack
 */

'use strict';

const helmet    = require('helmet');
const cors      = require('cors');
const rateLimit = require('express-rate-limit');
const logger    = require('../utils/logger');

// ── Helper: normalise a URL/hostname to a full https:// URL ────
function _normaliseUrl(raw) {
  if (!raw) return null;
  const s = raw.trim().replace(/\/$/, '');
  if (s.startsWith('http://') || s.startsWith('https://')) return s;
  return 'https://' + s;
}

const _renderUrl  = _normaliseUrl(process.env.RENDER_URL);
const _renderHost = _renderUrl ? _renderUrl.replace(/^https?:\/\//, '') : null;

// ── CSP connectSrc: include WSS for Socket.IO WebSocket transport
const _connectSrc = [
  "'self'",
  'https://identitytoolkit.googleapis.com',
  'https://securetoken.googleapis.com',
  'https://firebaseinstallations.googleapis.com',
  'https://firebase.googleapis.com',
  'https://www.googleapis.com',
  'https://apis.google.com',
  'https://*.firebaseio.com',
  'wss://*.firebaseio.com',
  'https://*.googleapis.com',
  // Socket.IO WebSocket transport on the same Render host
  'ws://localhost:3000',
  'wss://localhost:3000',
  'ws://localhost:8080',
  'wss://localhost:8080',
];

// Add production Render wss:// origin so Socket.IO WebSocket is not blocked
if (_renderHost) {
  _connectSrc.push('https://' + _renderHost);
  _connectSrc.push('wss://' + _renderHost);
}

const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'", "'unsafe-inline'", 'https://www.gstatic.com', 'https://apis.google.com', 'https://cdn.socket.io'],
      styleSrc:    ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc:     ["'self'", 'https://fonts.gstatic.com'],
      imgSrc:      ["'self'", 'data:', 'https:'],
      connectSrc:  _connectSrc,
      frameSrc:    ["'none'"],
      objectSrc:   ["'none'"],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false,
});

function buildCorsMiddleware() {
  const GITHUB_PAGES_ORIGIN = 'https://daviddchucks-hash.github.io';
  const rawOrigins = process.env.ALLOWED_ORIGINS || '';
  const whitelist = [
    GITHUB_PAGES_ORIGIN,
    'http://localhost:3000',
    'http://localhost:8080',
    ...rawOrigins.split(',').map(o => o.trim()).filter(Boolean),
  ];

  // Add the Render deployment origin so dashboard API calls are not blocked
  if (_renderUrl) whitelist.push(_renderUrl);

  return cors(function (req, callback) {
    // Event ingestion via beast.js: accept POST from any website.
    // Only apply open CORS to POST (and its OPTIONS preflight) — NOT to the
    // dashboard's GET /api/events, which must fall through to the whitelist below.
    const isEventsPost =
      req.path.startsWith('/api/events') &&
      (req.method === 'POST' ||
        (req.method === 'OPTIONS' &&
          (req.headers['access-control-request-method'] || '').toUpperCase() === 'POST'));

    if (isEventsPost) {
      return callback(null, {
        origin:              true,
        methods:             ['POST', 'OPTIONS'],
        allowedHeaders:      ['Content-Type', 'X-Beast-Site-Token', 'X-Beast-Site-Id'],
        optionsSuccessStatus: 204,
      });
    }

    // SDK route: must be loadable by any origin
    if (req.originalUrl.includes('beast.js')) {
      return callback(null, { origin: true, methods: ['GET', 'OPTIONS'] });
    }

    callback(null, {
      origin(origin, cb) {
        // Allow same-origin (no Origin header) or whitelisted origins
        if (!origin || whitelist.includes(origin)) {
          cb(null, true);
        } else {
          logger.warn('CORS blocked', { origin });
          cb(new Error(`Origin ${origin} not allowed by CORS`));
        }
      },
      methods:          ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders:   ['Content-Type', 'Authorization', 'X-Beast-Site-Token', 'X-Beast-Site-Id'],
      exposedHeaders:   ['X-Request-Id'],
      credentials:      true,
      optionsSuccessStatus: 204,
    });
  });
}

const apiLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60_000,
  max:      parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 200,
  standardHeaders: true,
  legacyHeaders:   false,
  handler(req, res) {
    logger.warn('Rate limit exceeded', { ip: req.ip, path: req.path });
    res.status(429).json({ success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests.' } });
  },
});

const eventLimiter = rateLimit({
  windowMs: 10_000,
  max:      100,
  standardHeaders: true,
  legacyHeaders:   false,
  keyGenerator: req => req.headers['x-beast-site-token'] || req.headers['x-beast-site-id'] || req.ip,
  handler(req, res) {
    logger.warn('Event rate limit exceeded', { ip: req.ip });
    res.status(429).json({ success: false, error: { code: 'RATE_LIMITED', message: 'Event flood detected.' } });
  },
});

const strictLimiter = rateLimit({
  windowMs: 60_000,
  max:      20,
  standardHeaders: true,
  legacyHeaders:   false,
  handler(req, res) {
    res.status(429).json({ success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests.' } });
  },
});

module.exports = { helmetMiddleware, buildCorsMiddleware, apiLimiter, eventLimiter, strictLimiter, _normaliseUrl };
