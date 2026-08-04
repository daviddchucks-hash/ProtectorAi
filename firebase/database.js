/**
 * firebase/database.js
 * Beast AI v2 — Firebase Realtime Database helpers
 *
 * RTDB structure (v2):
 *   /users/{uid}/               — user profile
 *   /sites/{siteId}/            — site registration
 *   /sitesByToken/{token}/      — token → siteId lookup index
 *   /events/{siteId}/{pushKey}/ — events per site
 *   /visitors/{siteId}/{visitorId}/ — visitor profiles per site
 *   /alerts/{siteId}/{pushKey}/ — alerts per site
 *   /security/{siteId}/{pushKey}/ — security events per site
 */

'use strict';

const { getRtdb } = require('./admin');

const nowIso = () => new Date().toISOString();

// ── Generic helpers ────────────────────────────────────────────

async function pushRecord(path, data) {
  const db  = getRtdb();
  const ref = await db.ref(path).push({ ...data, createdAt: nowIso() });
  return ref.key;
}

async function setRecord(path, key, data) {
  const db = getRtdb();
  await db.ref(`${path}/${key}`).set({ ...data, updatedAt: nowIso() });
}

async function updateRecord(path, key, updates) {
  const db = getRtdb();
  await db.ref(`${path}/${key}`).update({ ...updates, updatedAt: nowIso() });
}

async function getRecord(path, key) {
  const db   = getRtdb();
  const snap = await db.ref(`${path}/${key}`).once('value');
  if (!snap.exists()) return null;
  return { id: key, ...snap.val() };
}

async function getRecords(path, { orderByField, limit = 100, equalTo } = {}) {
  const db  = getRtdb();
  let query = db.ref(path);
  if (orderByField) query = query.orderByChild(orderByField);
  if (equalTo !== undefined) query = query.equalTo(equalTo);
  query = query.limitToLast(limit);

  const snap = await query.once('value');
  if (!snap.exists()) return [];

  const results = [];
  snap.forEach(child => results.push({ id: child.key, ...child.val() }));
  return results.reverse();
}

async function deleteRecord(path, key) {
  const db = getRtdb();
  await db.ref(`${path}/${key}`).remove();
}

// ── Path constants ─────────────────────────────────────────────

const PATHS = {
  USERS:          'users',
  SITES:          'sites',
  SITES_BY_TOKEN: 'sitesByToken',
  events:         (siteId) => `events/${siteId}`,
  visitors:       (siteId) => `visitors/${siteId}`,
  alerts:         (siteId) => `alerts/${siteId}`,
  security:       (siteId) => `security/${siteId}`,
};

module.exports = {
  pushRecord,
  setRecord,
  updateRecord,
  getRecord,
  getRecords,
  deleteRecord,
  PATHS,
  nowIso,
};
