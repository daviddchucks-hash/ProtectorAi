/**
 * server/middleware/logger.js
 * Beast AI — HTTP request logger (Morgan wrapper)
 * Logs every request with method, path, status, and response time.
 */

'use strict';

const morgan = require('morgan');
const logger = require('../utils/logger');

// Custom Morgan token for request body summary (safe, no secrets)
morgan.token('body-summary', req => {
  const body = req.body;
  if (!body || typeof body !== 'object') return '-';
  const { type, siteId } = body;
  return JSON.stringify({ type, siteId });
});

// Log format: METHOD /path HTTP/1.1 STATUS ms - body
const FORMAT =
  ':method :url :status :response-time ms — :body-summary';

const requestLogger = morgan(FORMAT, {
  stream: {
    write(message) {
      logger.info(message.trim(), { source: 'http' });
    },
  },
  skip(req) {
    // Skip health-check spam in production
    return process.env.NODE_ENV === 'production' && req.path === '/health';
  },
});

module.exports = requestLogger;
