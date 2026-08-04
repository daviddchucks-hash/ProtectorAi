/**
 * server/routes/stats.js
 * Beast AI v2 — Stats route
 */

'use strict';

const express    = require('express');
const router     = express.Router();
const controller = require('../controllers/statsController');
const { query }  = require('express-validator');
const { handleValidationErrors } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');

router.get(
  '/',
  requireAuth,
  [
    query('siteId').optional().isString().isLength({ max: 128 }),
    handleValidationErrors,
  ],
  controller.getStats
);

module.exports = router;
