/**
 * server/routes/visitors.js
 * Beast AI v2 — Visitor routes
 */

'use strict';

const express    = require('express');
const router     = express.Router();
const controller = require('../controllers/visitorsController');
const { visitorQueryRules } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');

router.get('/',      requireAuth, visitorQueryRules, controller.getVisitors);
router.get('/live',  requireAuth, visitorQueryRules, controller.getLiveVisitors);
router.get('/:id',   requireAuth, controller.getVisitor);

module.exports = router;
