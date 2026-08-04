/**
 * server/routes/alerts.js
 * Beast AI v2 — Alert routes
 */

'use strict';

const express    = require('express');
const router     = express.Router();
const controller = require('../controllers/alertsController');
const { query }  = require('express-validator');
const { handleValidationErrors } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');

router.get(
  '/',
  requireAuth,
  [
    query('siteId').optional().isString().isLength({ max: 128 }),
    query('resolved').optional().isBoolean().toBoolean(),
    query('limit').optional().isInt({ min: 1, max: 200 }).toInt(),
    handleValidationErrors,
  ],
  controller.getAlerts
);

router.patch('/:id/resolve', requireAuth, controller.resolveAlert);

module.exports = router;
