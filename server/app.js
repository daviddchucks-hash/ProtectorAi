/**
 * server/app.js
 * Beast AI — Express application setup
 * Wires middleware, routes, and error handling.
 */

'use strict';

const express = require('express');
const path    = require('path');

const requestLogger              = require('./middleware/logger');
const { helmetMiddleware,
        buildCorsMiddleware,
        apiLimiter }             = require('./middleware/security');
const dashboardAuth              = require('./middleware/dashboardAuth');
const logger                     = require('./utils/logger');
const { errorResponse }          = require('./utils/helpers');

// ── Route imports ─────────────────────────────────────────────
const healthRoutes   = require('./routes/health');
const eventRoutes    = require('./routes/events');
const statsRoutes    = require('./routes/stats');
const visitorRoutes  = require('./routes/visitors');
const alertRoutes    = require('./routes/alerts');
const sdkRoute       = require('./routes/sdk');

const app = express();

// ── Trust proxy (Render sits behind a load balancer) ─────────
app.set('trust proxy', 1);

// ── Security headers ──────────────────────────────────────────
app.use(helmetMiddleware);

// ── CORS ──────────────────────────────────────────────────────
app.use(buildCorsMiddleware());

// ── Body parsing ──────────────────────────────────────────────
app.use(express.json({ limit: '64kb' }));
app.use(express.urlencoded({ extended: false, limit: '64kb' }));

// ── Request logging ───────────────────────────────────────────
app.use(requestLogger);

// ── SDK route (must come before static, injects backend URL) ──
app.use('/beast.js', sdkRoute);

// ── Static files (dashboard assets) ──────────────────────────
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/dashboard', express.static(path.join(__dirname, '..', 'dashboard')));

// ── Global API rate limiter ───────────────────────────────────
app.use('/api', apiLimiter);

// ── Routes ────────────────────────────────────────────────────
app.use('/health',        healthRoutes);
app.use('/api/events',    eventRoutes);
app.use('/api/stats',     statsRoutes);
app.use('/api/visitors',  visitorRoutes);
app.use('/api/alerts',    alertRoutes);

// ── Root → redirect to dashboard ─────────────────────────────
app.get('/', (req, res) => {
  res.redirect(301, '/dashboard');
});

// ── Dashboard SPA (auth-protected) ───────────────────────────
app.get('/dashboard', dashboardAuth, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'dashboard', 'index.html'));
});

// ── 404 handler ───────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json(errorResponse('Route not found', 'NOT_FOUND'));
});

// ── Global error handler ──────────────────────────────────────
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
