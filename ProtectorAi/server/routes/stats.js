/**
 * server/routes/stats.js
 * Beast AI — Stats / dashboard summary route
 * GET /api/stats?siteId=xxx
 */

'use strict';

const express    = require('express');
const router     = express.Router();
const controller = require('../controllers/statsController');
const { query }  = require('express-validator');
const { handleValidationErrors } = require('../middleware/validate');

router.get(
  '/',
  [
    query('siteId').optional().isString().isLength({ max: 128 }),
    handleValidationErrors,
  ],
  controller.getStats
);

module.exports = router;
