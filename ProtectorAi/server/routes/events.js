/**
 * server/routes/events.js
 * Beast AI — Event routes
 * POST /api/events  — receive event from beast.js SDK
 * GET  /api/events  — fetch event history (dashboard)
 */

'use strict';

const express     = require('express');
const router      = express.Router();
const controller  = require('../controllers/eventsController');
const { eventRules, eventQueryRules } = require('../middleware/validate');
const { eventLimiter } = require('../middleware/security');

// Receive an event from the client SDK
router.post('/', eventLimiter, eventRules, controller.receiveEvent);

// Fetch event history (dashboard)
router.get('/', eventQueryRules, controller.getEvents);

module.exports = router;
