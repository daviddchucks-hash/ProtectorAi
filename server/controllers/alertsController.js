/**
 * server/controllers/alertsController.js
 * Beast AI — Alerts controller
 */

'use strict';

const alertService = require('../services/alertService');
const logger       = require('../utils/logger');
const { successResponse, errorResponse } = require('../utils/helpers');

/** Return true when the error is a Firebase-not-configured error */
function isFirebaseNotConfigured(err) {
  return err && err.message && (
    err.message.includes('getDb() called before initFirebase') ||
    err.message.includes('Missing Firebase credentials')
  );
}

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
    if (isFirebaseNotConfigured(err)) {
      return res.status(503).json(errorResponse(
        'Database not configured. Set FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, and FIREBASE_CLIENT_EMAIL in your Render environment variables.',
        'DB_NOT_CONFIGURED'
      ));
    }
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
    if (isFirebaseNotConfigured(err)) {
      return res.status(503).json(errorResponse(
        'Database not configured. Set FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, and FIREBASE_CLIENT_EMAIL in your Render environment variables.',
        'DB_NOT_CONFIGURED'
      ));
    }
    return res.status(500).json(errorResponse('Failed to resolve alert', 'UPDATE_ERROR'));
  }
}

module.exports = { getAlerts, resolveAlert };
