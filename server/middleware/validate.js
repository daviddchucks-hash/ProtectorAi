/**
 * server/middleware/validate.js
 * Beast AI v2 — Input validation rules
 */

'use strict';

const { body, query, validationResult } = require('express-validator');

function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: errors.array() },
    });
  }
  next();
}

const eventRules = [
  body('type').isString().notEmpty().isLength({ max: 100 }),
  body('siteId').optional().isString().isLength({ max: 128 }),
  body('visitorId').isString().notEmpty().isLength({ max: 128 }),
  body('page').optional().isString().isLength({ max: 2048 }),
  body('data').optional().isObject(),
  handleValidationErrors,
];

const eventQueryRules = [
  query('siteId').optional().isString().isLength({ max: 128 }),
  query('limit').optional().isInt({ min: 1, max: 200 }).toInt(),
  query('type').optional().isString().isLength({ max: 100 }),
  handleValidationErrors,
];

const visitorQueryRules = [
  query('siteId').optional().isString().isLength({ max: 128 }),
  query('limit').optional().isInt({ min: 1, max: 200 }).toInt(),
  handleValidationErrors,
];

const siteCreateRules = [
  body('name').isString().notEmpty().isLength({ max: 100 }),
  body('domain').isString().notEmpty().isLength({ max: 255 }),
  handleValidationErrors,
];

module.exports = { handleValidationErrors, eventRules, eventQueryRules, visitorQueryRules, siteCreateRules };
