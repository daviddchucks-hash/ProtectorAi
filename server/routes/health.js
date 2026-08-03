/**
 * server/routes/health.js
 * Beast AI — Health check endpoint
 * GET /health — used by Render for liveness probes
 */

'use strict';

const express = require('express');
const router  = express.Router();

router.get('/', (req, res) => {
  res.json({
    status:    'ok',
    service:   'Beast AI v1',
    timestamp: new Date().toISOString(),
    uptime:    Math.floor(process.uptime()),
    env:       process.env.NODE_ENV || 'development',
  });
});

module.exports = router;
