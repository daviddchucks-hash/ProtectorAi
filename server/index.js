/**
 * server/index.js
 * Beast AI v2 — Server entry point
 */

'use strict';

require('dotenv').config();

const { initFirebase } = require('../firebase/admin');
const { createServer } = require('http');
const app    = require('./app');
const { initSocket } = require('./services/socketService');
const logger = require('./utils/logger');

const PORT = parseInt(process.env.PORT, 10) || 3000;

async function start() {
  try {
    initFirebase();

    const httpServer = createServer(app);
    initSocket(httpServer);

    httpServer.listen(PORT, '0.0.0.0', () => {
      logger.info(`Beast AI v2 running`, {
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

process.on('SIGTERM', () => { logger.info('SIGTERM — shutting down'); process.exit(0); });
process.on('SIGINT',  () => { logger.info('SIGINT — shutting down');  process.exit(0); });
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', { reason: String(reason) });
});
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { message: err.message, stack: err.stack });
  process.exit(1);
});

start();
