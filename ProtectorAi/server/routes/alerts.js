/**
 * server/routes/alerts.js
 * Beast AI — Alert routes
 * GET   /api/alerts           — active alerts list
 * PATCH /api/alerts/:id/resolve — resolve an alert
 */

'use strict';

const express    = require('express');
const router     = express.Router();
const controller = require('../controllers/alertsController');
const { query }  = require('express-validator');
const { handleValidationErrors } = require('../middleware/validate');

router.get(
  '/',
  [
    query('siteId').optional().isString().isLength({ max: 128 }),
    query('resolved').optional().isBoolean().toBoolean(),
    query('limit').optional().isInt({ min: 1, max: 200 }).toInt(),
    handleValidationErrors,
  ],
  controller.getAlerts
);

router.patch('/:id/resolve', controller.resolveAlert);

module.exports = router;
