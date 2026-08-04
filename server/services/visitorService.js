/**
 * server/services/visitorService.js
 * Beast AI — Visitor persistence service
 * Uses Firebase Realtime Database.
 * Each visitor is stored at /visitors/{visitorId} — upserts are idempotent.
 */

'use strict';

const { setRecord, getRecord, getRecords, getAllRecords, PATHS } = require('../../firebase/database');
const { nowIso, truncate } = require('../utils/helpers');

// A visitor is considered "live" if their lastSeen was within this window
const LIVE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Create or update a visitor record.
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

  // Fetch existing record to preserve firstSeen
  const existing = await getRecord(PATHS.VISITORS, visitorId);

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

  // setRecord uses the visitorId as the key so subsequent calls overwrite (upsert)
  await setRecord(PATHS.VISITORS, visitorId, data);
}

/**
 * Get a list of visitors, newest-first by lastSeen.
 * @param {{ siteId?, limit? }} options
 */
async function getVisitors({ siteId, limit = 100 } = {}) {
  const all = await getRecords(PATHS.VISITORS, {
    orderByField: 'lastSeen',
    limit: Math.min(limit * 4, 500),
  });

  let results = siteId ? all.filter(v => v.siteId === siteId) : all;
  return results.slice(0, Math.min(limit, 200));
}

/**
 * Get a single visitor by ID.
 * @param {string} visitorId
 */
async function getVisitorById(visitorId) {
  return getRecord(PATHS.VISITORS, visitorId);
}

/**
 * Count "live" visitors for a site.
 * A visitor is live if their lastSeen timestamp is within LIVE_WINDOW_MS.
 * @param {string|undefined} siteId
 * @returns {Promise<number>}
 */
async function getLiveVisitorCount(siteId) {
  const all = await getAllRecords(PATHS.VISITORS);
  const cutoff = new Date(Date.now() - LIVE_WINDOW_MS).toISOString();

  return all.filter(v =>
    v.lastSeen >= cutoff &&
    (!siteId || v.siteId === siteId)
  ).length;
}

module.exports = {
  upsertVisitor,
  getVisitors,
  getVisitorById,
  getLiveVisitorCount,
};
