/**
 * server/utils/logger.js
 * Beast AI — Simple structured logger
 * Prefixes all output with timestamp and level tag.
 */

'use strict';

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const ENV_LEVEL = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');
const CURRENT_LEVEL = LEVELS[ENV_LEVEL] ?? LEVELS.info;

function timestamp() {
  return new Date().toISOString();
}

function log(level, message, meta = {}) {
  if ((LEVELS[level] ?? 99) > CURRENT_LEVEL) return;

  const entry = {
    ts:    timestamp(),
    level: level.toUpperCase(),
    msg:   message,
    ...meta,
  };

  const line = JSON.stringify(entry);

  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

const logger = {
  error: (msg, meta)  => log('error', msg, meta),
  warn:  (msg, meta)  => log('warn',  msg, meta),
  info:  (msg, meta)  => log('info',  msg, meta),
  debug: (msg, meta)  => log('debug', msg, meta),
};

module.exports = logger;
