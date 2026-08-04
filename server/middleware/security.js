/**
 * server/middleware/security.js
 * Beast AI v2 — Security middleware stack
 */

'use strict';

const helmet    = require('helmet');
const cors      = require('cors');
const rateLimit = require('express-rate-limit');
const logger    = require('../utils/logger');

const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'", "'unsafe-inline'", 'https://www.gstatic.com', 'https://apis.google.com'],
      styleSrc:    ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc:     ["'self'", 'https://fonts.gstatic.com'],
      imgSrc:      ["'self'", 'data:', 'https:'],
      connectSrc:  ["'self'", 'https://identitytoolkit.googleapis.com', 'https://*.firebaseio.com', 'wss://*.firebaseio.com'],
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

  return cors(function (req, callback) {
    // Event ingestion: accept from any website (beast.js is embedded everywhere)
    if (req.path.startsWith('/api/events')) {
      return callback(null, {
        origin:              true,
        methods:             ['POST', 'OPTIONS'],
        allowedHeaders:      ['Content-Type', 'X-Beast-Site-Token', 'X-Beast-Site-Id'],
        optionsSuccessStatus: 204,
      });
    }

    // SDK route: must be loadable by any origin
    if (req.path === '/' && req.originalUrl.includes('beast.js')) {
      return callback(null, { origin: true, methods: ['GET', 'OPTIONS'] });
    }

    callback(null, {
      origin(origin, cb) {
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

module.exports = { helmetMiddleware, buildCorsMiddleware, apiLimiter, eventLimiter, strictLimiter };
