/**
 * server/services/alertService.js
 * Beast AI — Alert persistence service
 * Uses Firebase Realtime Database — no composite indexes required.
 */

'use strict';

const { pushRecord, updateRecord, getRecords, PATHS } = require('../../firebase/database');
const { generateAlertId, nowIso } = require('../utils/helpers');

/**
 * Create a new alert record.
 * @param {object} data — alert payload from the events controller
 * @returns {Promise<{ alertId: string }>}
 */
async function createAlert(data) {
  const alertId = generateAlertId();

  const doc = {
    alertId,
    timestamp:         nowIso(),
    resolved:          false,
    resolvedAt:        null,

    // Event reference
    eventId:           data.eventId           || 'unknown',
    siteId:            data.siteId            || 'unknown',
    visitorId:         data.visitorId         || 'unknown',
    type:              data.type              || 'unknown',

    // Risk details
    riskScore:         data.riskScore         || 0,
    riskLevel:         data.riskLevel         || 'high',
    reason:            data.reason            || '',
    recommendedAction: data.recommendedAction || '',

    // Network
    ip:                data.ip                || 'unknown',
  };

  await pushRecord(PATHS.ALERTS, doc);
  return { alertId };
}

/**
 * Fetch alerts with optional filters (all filtering done in-memory — no indexes needed).
 * @param {{ siteId?, resolved?, limit? }} options
 */
async function getAlerts({ siteId, resolved = false, limit = 100 } = {}) {
  // Fetch a generous window ordered by timestamp
  const all = await getRecords(PATHS.ALERTS, {
    orderByField: 'timestamp',
    limit: Math.min(limit * 5, 500),
  });

  // Filter in-memory — no composite index required
  let results = all.filter(a => a.resolved === resolved);
  if (siteId) results = results.filter(a => a.siteId === siteId);

  return results.slice(0, Math.min(limit, 200));
}

/**
 * Mark an alert as resolved.
 * @param {string} firebaseKey — the Firebase push key (record id)
 */
async function resolveAlert(firebaseKey) {
  await updateRecord(PATHS.ALERTS, firebaseKey, {
    resolved:   true,
    resolvedAt: nowIso(),
  });
}

module.exports = { createAlert, getAlerts, resolveAlert };
