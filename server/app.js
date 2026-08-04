/**
 * server/app.js
 * Beast AI v2 — Express application setup
 */

'use strict';

const express  = require('express');
const path     = require('path');

const requestLogger              = require('./middleware/logger');
const { helmetMiddleware,
        buildCorsMiddleware,
        apiLimiter }             = require('./middleware/security');
const logger                     = require('./utils/logger');
const { errorResponse }          = require('./utils/helpers');

const healthRoutes   = require('./routes/health');
const authRoutes     = require('./routes/auth');
const eventRoutes    = require('./routes/events');
const statsRoutes    = require('./routes/stats');
const visitorRoutes  = require('./routes/visitors');
const alertRoutes    = require('./routes/alerts');
const siteRoutes     = require('./routes/sites');
const sdkRoute       = require('./routes/sdk');

const app = express();

app.set('trust proxy', 1);
app.use(helmetMiddleware);
app.use(buildCorsMiddleware());
app.use(express.json({ limit: '128kb' }));
app.use(express.urlencoded({ extended: false, limit: '128kb' }));
app.use(requestLogger);

// SDK — served before static
app.use('/beast.js', sdkRoute);

// Static assets
// HTML files: no-cache so browsers always re-fetch the latest HTML
// (which contains versioned JS/CSS URLs for proper cache-busting).
// JS/CSS/images: allow caching for 1 day — version query strings in HTML
// ensure browsers pick up new files after a deploy.
const noCacheSetHeaders = (_res, _path) => {
  if (_path.endsWith('.html')) {
    _res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    _res.setHeader('Pragma',        'no-cache');
    _res.setHeader('Expires',       '0');
  } else {
    _res.setHeader('Cache-Control', 'public, max-age=86400');
  }
};
app.use(express.static(path.join(__dirname, '..', 'public'), { setHeaders: noCacheSetHeaders }));
app.use('/dashboard', express.static(path.join(__dirname, '..', 'dashboard'), { setHeaders: noCacheSetHeaders }));

// API rate limiter
app.use('/api', apiLimiter);

// Routes
app.use('/health',        healthRoutes);
app.use('/api/auth',      authRoutes);
app.use('/api/events',    eventRoutes);
app.use('/api/stats',     statsRoutes);
app.use('/api/visitors',  visitorRoutes);
app.use('/api/alerts',    alertRoutes);
app.use('/api/sites',     siteRoutes);

// Root → dashboard
app.get('/', (_req, res) => res.redirect(301, '/dashboard/'));
app.get('/dashboard', (_req, res) =>
  res.sendFile(path.join(__dirname, '..', 'dashboard', 'index.html'))
);

// 404
app.use((req, res) => {
  res.status(404).json(errorResponse('Route not found', 'NOT_FOUND'));
});

// Global error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  logger.error('Unhandled error', { message: err.message, stack: err.stack });
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json(errorResponse('Invalid JSON body', 'INVALID_JSON'));
  }
  const status = err.status || err.statusCode || 500;
  res.status(status).json(
    errorResponse(
      process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
      'SERVER_ERROR'
    )
  );
});

module.exports = app;
