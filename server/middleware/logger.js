/**
 * server/middleware/logger.js
 * Beast AI v2 — HTTP request logger
 */

'use strict';

const logger = require('../utils/logger');

module.exports = function requestLogger(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    logger[level]('HTTP', {
      method: req.method,
      path:   req.path,
      status: res.statusCode,
      ms,
      ip:     req.ip,
    });
  });
  next();
};
