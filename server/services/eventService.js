/**
 * server/services/eventService.js
 * Beast AI v2 — Event storage service
 */

'use strict';

const { pushRecord, getRecords, PATHS } = require('../../firebase/database');
const { scoreEvent } = require('./riskEngine');
const { broadcastToSite } = require('./socketService');
const alertService = require('./alertService');
const { incrementSiteStat } = require('./siteService');
const logger = require('../utils/logger');

/**
 * Process and store an incoming event from beast.js.
 */
async function processEvent(rawEvent, clientIp) {
  const { riskScore, riskLevel, riskReason, recommendedAction, detectedThreats } =
    scoreEvent(rawEvent);

  const eventDoc = {
    // Identity
    siteId:    rawEvent.siteId,
    visitorId: rawEvent.visitorId,
    sessionId: rawEvent.sessionId || null,
    type:      rawEvent.type,

    // Page context
    page:     rawEvent.page     || '',
    referrer: rawEvent.referrer || '',
    title:    rawEvent.title    || '',

    // Fingerprint
    browser:      rawEvent.browser      || 'unknown',
    browserVersion: rawEvent.browserVersion || '',
    os:           rawEvent.os           || 'unknown',
    device:       rawEvent.device       || 'unknown',
    screen:       rawEvent.screen       || '',
    language:     rawEvent.language     || '',
    timezone:     rawEvent.timezone     || '',
    platform:     rawEvent.platform     || '',
    userAgent:    rawEvent.userAgent    || '',

    // Network
    ip: clientIp || 'unknown',

    // Risk
    riskScore,
    riskLevel,
    riskReason,
    recommendedAction,
    detectedThreats: detectedThreats || [],

    // Payload
    data: rawEvent.data || {},

    // Timestamps
    timestamp: new Date().toISOString(),
  };

  const eventId = await pushRecord(PATHS.events(rawEvent.siteId), eventDoc);
  const fullEvent = { ...eventDoc, id: eventId };

  // Broadcast live event to dashboard
  broadcastToSite(rawEvent.siteId, 'event:new', fullEvent);

  // Increment site event counter
  try { await incrementSiteStat(rawEvent.siteId, 'totalEvents'); } catch (_) {}

  // Create alert for High/Critical events
  if (riskLevel === 'high' || riskLevel === 'critical') {
    try {
      await alertService.createAlert({
        siteId:    rawEvent.siteId,
        eventId,
        visitorId: rawEvent.visitorId,
        type:      rawEvent.type,
        riskScore,
        riskLevel,
        reason:    riskReason,
        recommendedAction,
        detectedThreats,
        ip:        clientIp,
        page:      rawEvent.page || '',
      });
    } catch (alertErr) {
      logger.error('Failed to create alert', { message: alertErr.message });
    }
  }

  return fullEvent;
}

/**
 * Fetch events for a site, with optional type filter.
 */
async function getEvents({ siteId, limit = 100, type } = {}) {
  const all = await getRecords(PATHS.events(siteId), {
    orderByField: 'timestamp',
    limit: Math.min(limit * 3, 500),
  });

  let results = siteId ? all.filter(e => e.siteId === siteId) : all;
  if (type) results = results.filter(e => e.type === type);

  return results.slice(0, Math.min(limit, 200));
}

module.exports = { processEvent, getEvents };
