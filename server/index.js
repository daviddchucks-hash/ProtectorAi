/**
 * server/index.js
 * Beast AI — Server entry point
 * Initialises Firebase, then starts the Express HTTP server.
 */

'use strict';

// Load environment variables from .env (local dev only — Render injects them)
require('dotenv').config();

const { initFirebase } = require('../firebase/admin');
const app    = require('./app');
const logger = require('./utils/logger');

const PORT = parseInt(process.env.PORT, 10) || 3000;

async function start() {
  try {
    // 1. Boot Firebase Admin SDK
    initFirebase();

    // 2. Start HTTP server
    app.listen(PORT, '0.0.0.0', () => {
      logger.info(`Beast AI v1 running`, {
        port: PORT,
        env:  process.env.NODE_ENV || 'development',
        url:  `http://0.0.0.0:${PORT}`,
      });
    });
  } catch (err) {
    logger.error('Failed to start Beast AI', { message: err.message });
    process.exit(1);
  }
}

// ── Graceful shutdown ─────────────────────────────────────────
process.on('SIGTERM', () => {
  logger.info('SIGTERM received — shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received — shutting down');
  process.exit(0);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { reason: String(reason) });
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { message: err.message, stack: err.stack });
  process.exit(1);
});

start();
