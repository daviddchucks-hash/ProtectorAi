/**
 * server/services/visitorService.js
 * Beast AI — Visitor persistence service
 * Maintains a unique profile per visitorId, updated on each event.
 */

'use strict';

const { setDoc, getDoc, queryDocs, countDocs, COLLECTIONS } = require('../../firebase/firestore');
const { nowIso, truncate } = require('../utils/helpers');

// A visitor is considered "live" if their lastSeen was within this window
const LIVE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Create or update a visitor record.
 * Uses the visitorId as the Firestore document ID so upserts are idempotent.
 *
 * @param {object} info — visitor data extracted from the event
 */
async function upsertVisitor(info) {
  const {
    visitorId,
    siteId,
    ip,
    userAgent,
    browser,
    os,
    device,
    country,
    language,
    timezone,
  } = info;

  if (!visitorId) return;

  const now = nowIso();

  // Check if visitor already exists (to preserve firstSeen)
  const existing = await getDoc(COLLECTIONS.VISITORS, visitorId);

  const data = {
    visitorId,
    siteId:    siteId   || 'unknown',
    ip:        ip       || 'unknown',
    userAgent: truncate(userAgent || '', 300),
    browser:   browser  || 'unknown',
    os:        os       || 'unknown',
    device:    device   || 'unknown',
    country:   country  || 'unknown',
    language:  language || 'unknown',
    timezone:  timezone || 'unknown',
    lastSeen:  now,
    firstSeen: existing ? existing.firstSeen : now,
    isLive:    true,
  };

  await setDoc(COLLECTIONS.VISITORS, visitorId, data, true /* merge */);
}

/**
 * Get a list of visitors.
 * @param {{ siteId?, limit? }} options
 */
async function getVisitors({ siteId, limit = 100 } = {}) {
  const filters = [];
  if (siteId) filters.push(['siteId', '==', siteId]);

  return queryDocs(COLLECTIONS.VISITORS, filters, {
    orderBy:  'lastSeen',
    orderDir: 'desc',
    limit:    Math.min(limit, 200),
  });
}

/**
 * Get a single visitor by ID.
 * @param {string} visitorId
 */
async function getVisitorById(visitorId) {
  return getDoc(COLLECTIONS.VISITORS, visitorId);
}

/**
 * Count "live" visitors for a site.
 * A visitor is live if their lastSeen timestamp is within LIVE_WINDOW_MS.
 *
 * Note: Firestore does not support timestamp arithmetic in queries,
 * so we fetch the last 500 visitors and filter in-memory.
 *
 * @param {string|undefined} siteId
 * @returns {Promise<number>}
 */
async function getLiveVisitorCount(siteId) {
  const filters = [];
  if (siteId) filters.push(['siteId', '==', siteId]);

  const visitors = await queryDocs(COLLECTIONS.VISITORS, filters, {
    orderBy:  'lastSeen',
    orderDir: 'desc',
    limit:    500,
  });

  const cutoff = new Date(Date.now() - LIVE_WINDOW_MS).toISOString();
  return visitors.filter(v => v.lastSeen >= cutoff).length;
}

module.exports = {
  upsertVisitor,
  getVisitors,
  getVisitorById,
  getLiveVisitorCount,
};
