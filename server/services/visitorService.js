/**
 * server/services/visitorService.js
 * Beast AI v2 — Visitor tracking service
 */

'use strict';

const { setRecord, getRecord, getRecords, PATHS, nowIso } = require('../../firebase/database');
const { getRtdb } = require('../../firebase/admin');
const { broadcastToSite } = require('./socketService');
const { incrementSiteStat } = require('./siteService');

/**
 * Upsert visitor record. Creates on first visit, updates on subsequent.
 */
async function upsertVisitor(event, clientIp) {
  const { siteId, visitorId, sessionId } = event;
  if (!siteId || !visitorId) return null;

  const db  = getRtdb();
  const ref = db.ref(`${PATHS.visitors(siteId)}/${visitorId}`);
  const snap = await ref.once('value');
  const existing = snap.exists() ? snap.val() : null;

  const page = event.page || '';
  const now  = nowIso();

  if (!existing) {
    // New visitor
    const doc = {
      visitorId,
      siteId,
      sessionId,
      ip:          clientIp || 'unknown',
      browser:     event.browser     || 'unknown',
      browserVersion: event.browserVersion || '',
      os:          event.os          || 'unknown',
      device:      event.device      || 'unknown',
      screen:      event.screen      || '',
      language:    event.language    || '',
      timezone:    event.timezone    || '',
      platform:    event.platform    || '',
      userAgent:   event.userAgent   || '',
      referrer:    event.referrer    || '',

      firstSeen:   now,
      lastSeen:    now,
      isNew:       true,
      sessionCount: 1,
      pageCount:   1,
      pagesVisited: page ? [page] : [],
      currentPage:  page,
      online:      true,
      createdAt:   now,
      updatedAt:   now,
    };

    await ref.set(doc);
    broadcastToSite(siteId, 'visitor:new', { ...doc, id: visitorId });

    try { await incrementSiteStat(siteId, 'totalVisitors'); } catch (_) {}

    return { ...doc, id: visitorId, isNew: true };
  }

  // Returning visitor — update
  const pagesVisited = Array.isArray(existing.pagesVisited) ? existing.pagesVisited : [];
  if (page && !pagesVisited.includes(page)) pagesVisited.push(page);
  if (pagesVisited.length > 50) pagesVisited.shift(); // cap at 50

  const isNewSession = sessionId && existing.sessionId !== sessionId;
  const updates = {
    lastSeen:     now,
    currentPage:  page,
    online:       true,
    pagesVisited,
    pageCount:    (existing.pageCount || 0) + 1,
    sessionCount: isNewSession ? (existing.sessionCount || 1) + 1 : (existing.sessionCount || 1),
    sessionId:    sessionId || existing.sessionId,
    isNew:        false,
    updatedAt:    now,
    // Update fingerprint with latest values
    browser:      event.browser     || existing.browser,
    os:           event.os          || existing.os,
    device:       event.device      || existing.device,
    userAgent:    event.userAgent   || existing.userAgent,
  };

  await ref.update(updates);
  broadcastToSite(siteId, 'visitor:update', { ...existing, ...updates, id: visitorId });

  return { ...existing, ...updates, id: visitorId, isNew: false };
}

/**
 * Mark a visitor as offline (from heartbeat timeout or disconnect event).
 */
async function markVisitorOffline(siteId, visitorId) {
  const db  = getRtdb();
  const ref = db.ref(`${PATHS.visitors(siteId)}/${visitorId}`);
  await ref.update({ online: false, updatedAt: nowIso() });
  broadcastToSite(siteId, 'visitor:offline', { visitorId });
}

/**
 * Get all visitors for a site.
 */
async function getVisitors({ siteId, limit = 100 } = {}) {
  if (!siteId) return [];
  return await getRecords(PATHS.visitors(siteId), {
    orderByField: 'lastSeen',
    limit: Math.min(limit, 200),
  });
}

/**
 * Get a single visitor.
 */
async function getVisitor(siteId, visitorId) {
  if (!siteId || !visitorId) return null;
  return await getRecord(PATHS.visitors(siteId), visitorId);
}

/**
 * Get currently online visitors for a site.
 */
async function getLiveVisitors(siteId) {
  const all = await getVisitors({ siteId, limit: 200 });
  // Consider online if seen in last 3 minutes
  const cutoff = Date.now() - 3 * 60 * 1000;
  return all.filter(v => new Date(v.lastSeen).getTime() > cutoff);
}

module.exports = { upsertVisitor, markVisitorOffline, getVisitors, getVisitor, getLiveVisitors };
