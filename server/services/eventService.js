/**
 * server/services/eventService.js
 * Beast AI — Event persistence service
 * Wraps Firestore operations for the events collection.
 */

'use strict';

const { addDoc, queryDocs, COLLECTIONS } = require('../../firebase/firestore');
const { generateEventId, nowIso, truncate } = require('../utils/helpers');

/**
 * Persist a new event to Firestore.
 * @param {object} payload — enriched event from the controller
 * @returns {Promise<{ eventId: string }>}
 */
async function createEvent(payload) {
  const eventId = generateEventId();

  const doc = {
    eventId,
    timestamp:         nowIso(),

    // Identity
    siteId:            payload.siteId    || 'unknown',
    visitorId:         payload.visitorId || 'unknown',

    // Event classification
    type:              payload.type      || 'unknown',

    // Risk assessment
    riskScore:         payload.riskScore         || 0,
    riskLevel:         payload.riskLevel         || 'low',
    riskReason:        payload.riskReason        || '',
    recommendedAction: payload.recommendedAction || '',

    // Request metadata
    ip:                payload.ip        || 'unknown',
    userAgent:         truncate(payload.userAgent || '', 300),

    // Browser fingerprint (from SDK)
    browser:           payload.browser   || 'unknown',
    os:                payload.os        || 'unknown',
    device:            payload.device    || 'unknown',
    screen:            payload.screen    || null,
    language:          payload.language  || 'unknown',
    timezone:          payload.timezone  || 'unknown',

    // Page context
    page:              truncate(payload.page      || '', 2048),
    referrer:          truncate(payload.referrer  || '', 2048),

    // Event-specific data (safe, size-capped)
    data: _sanitizeData(payload.data),
  };

  await addDoc(COLLECTIONS.EVENTS, doc);
  return { eventId };
}

/**
 * Query recent events with optional filters.
 * @param {{ siteId?, limit?, type? }} options
 */
async function getEvents({ siteId, limit = 100, type } = {}) {
  const filters = [];
  if (siteId) filters.push(['siteId', '==', siteId]);
  if (type)   filters.push(['type',   '==', type]);

  const events = await queryDocs(COLLECTIONS.EVENTS, filters, {
    orderBy:  'timestamp',
    orderDir: 'desc',
    limit:    Math.min(limit, 200),
  });

  return events;
}

/**
 * Sanitise event-specific data:
 * - Must be a plain object
 * - String values truncated to 500 chars
 * - No nested objects deeper than 2 levels
 */
function _sanitizeData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};

  const clean = {};
  for (const [k, v] of Object.entries(data)) {
    if (typeof v === 'string')  clean[k] = truncate(v, 500);
    else if (typeof v === 'number' || typeof v === 'boolean') clean[k] = v;
    else if (v && typeof v === 'object' && !Array.isArray(v)) {
      // One level deep allowed
      const nested = {};
      for (const [nk, nv] of Object.entries(v)) {
        if (typeof nv === 'string')  nested[nk] = truncate(nv, 200);
        else if (typeof nv === 'number' || typeof nv === 'boolean') nested[nk] = nv;
      }
      clean[k] = nested;
    }
  }
  return clean;
}

module.exports = { createEvent, getEvents };
