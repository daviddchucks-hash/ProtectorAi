/**
 * server/services/alertService.js
 * Beast AI v2 — Alert service
 */

'use strict';

const { v4: uuidv4 } = require('uuid');
const { pushRecord, updateRecord, getRecords, PATHS, nowIso } = require('../../firebase/database');
const { broadcastToSite } = require('./socketService');
const { incrementSiteStat } = require('./siteService');

async function createAlert(data) {
  const alertId = 'alert_' + uuidv4().replace(/-/g, '').slice(0, 12);

  const doc = {
    alertId,
    siteId:            data.siteId    || 'unknown',
    eventId:           data.eventId   || 'unknown',
    visitorId:         data.visitorId || 'unknown',
    type:              data.type      || 'unknown',
    detectedThreats:   data.detectedThreats || [],
    riskScore:         data.riskScore || 0,
    riskLevel:         data.riskLevel || 'high',
    reason:            data.reason    || '',
    recommendedAction: data.recommendedAction || '',
    ip:                data.ip        || 'unknown',
    page:              data.page      || '',
    resolved:          false,
    timestamp:         nowIso(),
  };

  const key = await pushRecord(PATHS.alerts(data.siteId), doc);
  const fullAlert = { ...doc, id: key };

  broadcastToSite(data.siteId, 'alert:new', fullAlert);

  try { await incrementSiteStat(data.siteId, 'totalAlerts'); } catch (_) {}

  return { alertId, key };
}

async function getAlerts({ siteId, resolved = false, limit = 100 } = {}) {
  if (!siteId) return [];
  const all = await getRecords(PATHS.alerts(siteId), {
    orderByField: 'timestamp',
    limit: Math.min(limit * 3, 500),
  });

  let results = all.filter(a => a.resolved === resolved);
  return results.slice(0, Math.min(limit, 200));
}

async function resolveAlert(siteId, firebaseKey) {
  await updateRecord(PATHS.alerts(siteId), firebaseKey, {
    resolved:   true,
    resolvedAt: nowIso(),
  });
  broadcastToSite(siteId, 'alert:resolved', { id: firebaseKey });
}

module.exports = { createAlert, getAlerts, resolveAlert };
