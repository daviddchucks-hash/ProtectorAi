/**
 * server/controllers/alertsController.js
 * Beast AI — Alerts controller
 */

'use strict';

const alertService = require('../services/alertService');
const logger       = require('../utils/logger');
const { successResponse, errorResponse } = require('../utils/helpers');

/**
 * GET /api/alerts
 * Returns a list of alerts, optionally filtered by siteId and resolved status.
 */
async function getAlerts(req, res) {
  try {
    const { siteId, resolved = false, limit = 100 } = req.query;
    const alerts = await alertService.getAlerts({ siteId, resolved, limit });
    return res.json(successResponse(alerts, { count: alerts.length }));
  } catch (err) {
    logger.error('getAlerts error', { message: err.message });
    return res.status(500).json(errorResponse('Failed to fetch alerts', 'FETCH_ERROR'));
  }
}

/**
 * PATCH /api/alerts/:id/resolve
 * Mark an alert as resolved.
 */
async function resolveAlert(req, res) {
  try {
    const { id } = req.params;
    await alertService.resolveAlert(id);
    return res.json(successResponse({ id, resolved: true }));
  } catch (err) {
    logger.error('resolveAlert error', { message: err.message, id: req.params.id });
    return res.status(500).json(errorResponse('Failed to resolve alert', 'UPDATE_ERROR'));
  }
}

module.exports = { getAlerts, resolveAlert };
