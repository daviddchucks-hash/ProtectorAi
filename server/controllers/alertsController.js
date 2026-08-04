/**
 * server/controllers/alertsController.js
 * Beast AI v2 — Alerts controller
 */

'use strict';

const alertService = require('../services/alertService');
const logger = require('../utils/logger');
const { errorResponse, successResponse } = require('../utils/helpers');

async function getAlerts(req, res) {
  try {
    const { siteId, resolved = false, limit = 100 } = req.query;
    if (!siteId) return res.status(400).json(errorResponse('siteId required', 'MISSING_PARAM'));
    const alerts = await alertService.getAlerts({ siteId, resolved, limit: Number(limit) });
    res.json(successResponse({ alerts, count: alerts.length }));
  } catch (err) {
    logger.error('getAlerts error', { message: err.message });
    res.status(500).json(errorResponse('Failed to fetch alerts', 'FETCH_ERROR'));
  }
}

async function resolveAlert(req, res) {
  try {
    const { siteId } = req.query;
    if (!siteId) return res.status(400).json(errorResponse('siteId required', 'MISSING_PARAM'));
    await alertService.resolveAlert(siteId, req.params.id);
    res.json(successResponse({ resolved: true }));
  } catch (err) {
    logger.error('resolveAlert error', { message: err.message });
    res.status(500).json(errorResponse('Failed to resolve alert', 'UPDATE_ERROR'));
  }
}

module.exports = { getAlerts, resolveAlert };
