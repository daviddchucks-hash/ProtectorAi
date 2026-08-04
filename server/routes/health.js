/**
 * server/routes/health.js
 * Beast AI v2 — Health check
 */

'use strict';

const express = require('express');
const router  = express.Router();

router.get('/', (req, res) => {
  res.json({ success: true, status: 'ok', version: '2.0.0', timestamp: new Date().toISOString() });
});

module.exports = router;
