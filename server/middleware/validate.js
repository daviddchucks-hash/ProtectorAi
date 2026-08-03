/**
 * server/middleware/validate.js
 * Beast AI — Request validation middleware
 * Uses express-validator to check incoming payloads.
 */

'use strict';

const { validationResult, body, query, param } = require('express-validator');
const { errorResponse } = require('../utils/helpers');

/**
 * Run validation rules and return 422 if any fail.
 * Place after your check() array in the route definition.
 */
function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json(
      errorResponse('Validation failed', 'VALIDATION_ERROR', errors.array())
    );
  }
  next();
}

// ── Reusable validation rule sets ────────────────────────────

/** Rules for POST /api/events */
const eventRules = [
  body('type')
    .isString().withMessage('type must be a string')
    .notEmpty().withMessage('type is required')
    .isLength({ max: 100 }).withMessage('type too long'),

  body('siteId')
    .isString().withMessage('siteId must be a string')
    .notEmpty().withMessage('siteId is required')
    .isLength({ max: 128 }).withMessage('siteId too long'),

  body('visitorId')
    .isString().withMessage('visitorId must be a string')
    .notEmpty().withMessage('visitorId is required')
    .isLength({ max: 128 }).withMessage('visitorId too long'),

  body('page')
    .optional()
    .isString()
    .isLength({ max: 2048 }).withMessage('page URL too long'),

  body('data')
    .optional()
    .isObject().withMessage('data must be an object'),

  handleValidationErrors,
];

/** Rules for GET /api/events with query params */
const eventQueryRules = [
  query('siteId').optional().isString().isLength({ max: 128 }),
  query('limit').optional().isInt({ min: 1, max: 200 }).toInt(),
  query('type').optional().isString().isLength({ max: 100 }),
  handleValidationErrors,
];

/** Rules for GET /api/visitors with query params */
const visitorQueryRules = [
  query('siteId').optional().isString().isLength({ max: 128 }),
  query('limit').optional().isInt({ min: 1, max: 200 }).toInt(),
  handleValidationErrors,
];

module.exports = {
  handleValidationErrors,
  eventRules,
  eventQueryRules,
  visitorQueryRules,
};
