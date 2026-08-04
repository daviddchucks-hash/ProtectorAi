/**
 * server/services/socketService.js
 * Beast AI v2 — Socket.IO real-time event broadcasting
 */

'use strict';

const { Server } = require('socket.io');
const logger = require('../utils/logger');

let _io = null;

function initSocket(httpServer) {
  const GITHUB_PAGES_ORIGIN = 'https://daviddchucks-hash.github.io';
  const rawOrigins = process.env.ALLOWED_ORIGINS || '';
  const origins = [
    GITHUB_PAGES_ORIGIN,
    'http://localhost:3000',
    'http://localhost:8080',
    ...rawOrigins.split(',').map(o => o.trim()).filter(Boolean),
  ];

  _io = new Server(httpServer, {
    cors: {
      origin: origins,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  _io.on('connection', (socket) => {
    logger.info('Socket connected', { id: socket.id });

    // Client joins a site-specific room to receive only its events
    socket.on('join:site', (siteId) => {
      if (typeof siteId === 'string' && siteId.length <= 128) {
        socket.join(`site:${siteId}`);
        logger.info('Socket joined site room', { id: socket.id, siteId });
      }
    });

    socket.on('leave:site', (siteId) => {
      socket.leave(`site:${siteId}`);
    });

    socket.on('disconnect', () => {
      logger.info('Socket disconnected', { id: socket.id });
    });
  });

  logger.info('Socket.IO initialised');
  return _io;
}

function getIO() {
  return _io;
}

/**
 * Broadcast an event to all dashboard clients watching a specific site.
 */
function broadcastToSite(siteId, event, data) {
  if (!_io) return;
  _io.to(`site:${siteId}`).emit(event, data);
}

/**
 * Broadcast a global event (e.g., server health).
 */
function broadcastGlobal(event, data) {
  if (!_io) return;
  _io.emit(event, data);
}

module.exports = { initSocket, getIO, broadcastToSite, broadcastGlobal };
