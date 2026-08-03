/**
 * server/middleware/security.js
 * Beast AI — Security middleware stack
 * Applies Helmet, CORS, and rate limiting.
 */

'use strict';

const helmet    = require('helmet');
const cors      = require('cors');
const rateLimit = require('express-rate-limit');
const logger    = require('../utils/logger');

// ── Helmet (secure HTTP headers) ──────────────────────────────
const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'", "'unsafe-inline'"],   // dashboard inline scripts
      styleSrc:    ["'self'", "'unsafe-inline'"],
      imgSrc:      ["'self'", 'data:'],
      connectSrc:  ["'self'"],
      fontSrc:     ["'self'"],
      objectSrc:   ["'none'"],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false, // beast.js needs to be embeddable cross-origin
});

// ── CORS ──────────────────────────────────────────────────────
function buildCorsMiddleware() {
  // Always allow the GitHub Pages dashboard origin so it can reach the Render backend
  const GITHUB_PAGES_ORIGIN = 'https://daviddchucks-hash.github.io';
  const rawOrigins = process.env.ALLOWED_ORIGINS || '';
  const whitelist  = [GITHUB_PAGES_ORIGIN, ...rawOrigins
    .split(',')
    .map(o => o.trim())
    .filter(Boolean)];

  const corsOptions = {
    origin(origin, callback) {
      // Allow requests with no origin (server-to-server, curl) or whitelisted
      if (!origin || whitelist.length === 0 || whitelist.includes(origin)) {
        callback(null, true);
      } else {
        logger.warn('CORS blocked', { origin });
        callback(new Error(`Origin ${origin} not allowed by CORS`));
      }
    },
    methods:          ['GET', 'POST', 'OPTIONS'],
    allowedHeaders:   ['Content-Type', 'Authorization', 'X-Beast-Site-Id'],
    exposedHeaders:   ['X-Request-Id'],
    credentials:      true,
    optionsSuccessStatus: 204,
  };

  return cors(corsOptions);
}

// ── Rate limiters ─────────────────────────────────────────────

/** General API limiter */
const apiLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60_000,
  max:      parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
  standardHeaders: true,
  legacyHeaders:   false,
  handler(req, res) {
    logger.warn('Rate limit exceeded', { ip: req.ip, path: req.path });
    res.status(429).json({
      success: false,
      error: { code: 'RATE_LIMITED', message: 'Too many requests — slow down.' },
    });
  },
});

/** Stricter limiter for event ingestion endpoint */
const eventLimiter = rateLimit({
  windowMs: 10_000,   // 10-second window
  max:      50,        // max 50 events per 10s per IP
  standardHeaders: true,
  legacyHeaders:   false,
  keyGenerator: req => req.headers['x-beast-site-id'] || req.ip,
  handler(req, res) {
    logger.warn('Event rate limit exceeded', {
      ip: req.ip,
      siteId: req.headers['x-beast-site-id'],
    });
    res.status(429).json({
      success: false,
      error: { code: 'EVENT_RATE_LIMITED', message: 'Event rate limit exceeded.' },
    });
  },
});

module.exports = {
  helmetMiddleware,
  buildCorsMiddleware,
  apiLimiter,
  eventLimiter,
};
