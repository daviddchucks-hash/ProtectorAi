/**
 * server/routes/visitors.js
 * Beast AI — Visitor routes
 * GET /api/visitors       — visitor list
 * GET /api/visitors/:id   — single visitor detail
 */

'use strict';

const express    = require('express');
const router     = express.Router();
const controller = require('../controllers/visitorsController');
const { visitorQueryRules } = require('../middleware/validate');

router.get('/',    visitorQueryRules, controller.getVisitors);
router.get('/:id', controller.getVisitor);

module.exports = router;
