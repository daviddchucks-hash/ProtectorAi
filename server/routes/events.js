/**
 * server/routes/events.js
 * Beast AI v2 — Event routes
 * POST /api/events  — receive event from beast.js SDK
 * GET  /api/events  — fetch event history (dashboard)
 */

'use strict';

const express    = require('express');
const router     = express.Router();
const controller = require('../controllers/eventsController');
const { eventRules, eventQueryRules } = require('../middleware/validate');
const { eventLimiter } = require('../middleware/security');
const { requireAuth } = require('../middleware/auth');

// Receive an event from the SDK (no auth — open to all sites)
router.post('/', eventLimiter, eventRules, controller.receiveEvent);

// Fetch event history (requires Firebase Auth)
router.get('/', requireAuth, eventQueryRules, controller.getEvents);

module.exports = router;
