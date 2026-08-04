/**
 * server/services/alertService.js
 * Beast AI — Alert persistence service
 * Creates alerts for High/Critical risk events and manages their lifecycle.
 */

'use strict';

const { addDoc, updateDoc, queryDocs, COLLECTIONS } = require('../../firebase/firestore');
const { generateAlertId, nowIso } = require('../utils/helpers');

/**
 * Create a new alert document.
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

  await addDoc(COLLECTIONS.ALERTS, doc);
  return { alertId };
}

/**
 * Fetch alerts with optional filters.
 * @param {{ siteId?, resolved?, limit? }} options
 */
async function getAlerts({ siteId, resolved = false, limit = 100 } = {}) {
  const filters = [['resolved', '==', resolved]];
  if (siteId) filters.push(['siteId', '==', siteId]);

  // No orderBy in the Firestore query — combining where() + orderBy() on different
  // fields requires a composite index that may not exist. Sort in memory instead.
  const docs = await queryDocs(COLLECTIONS.ALERTS, filters, {
    limit: Math.min(limit, 200),
  });

  // Sort newest-first by timestamp string (ISO 8601 sorts lexicographically)
  return docs.sort((a, b) => {
    const ta = a.timestamp || a.createdAt || '';
    const tb = b.timestamp || b.createdAt || '';
    return tb < ta ? -1 : tb > ta ? 1 : 0;
  });
}

/**
 * Mark an alert as resolved.
 * @param {string} firestoreDocId — the Firestore document ID
 */
async function resolveAlert(firestoreDocId) {
  await updateDoc(COLLECTIONS.ALERTS, firestoreDocId, {
    resolved:   true,
    resolvedAt: nowIso(),
  });
}

module.exports = { createAlert, getAlerts, resolveAlert };
