/**
 * firebase/database.js
 * Beast AI — Firebase Realtime Database helpers
 * Drop-in replacement for firebase/firestore.js — no composite indexes needed.
 */

'use strict';

const { getRtdb } = require('./admin');

// ── Path names (mirror the old COLLECTIONS constant) ──────────
const PATHS = {
  EVENTS:   'events',
  VISITORS: 'visitors',
  ALERTS:   'alerts',
  SETTINGS: 'settings',
};

// Keep COLLECTIONS as an alias so any file that still imports it doesn't break
const COLLECTIONS = PATHS;

// ── Helpers ────────────────────────────────────────────────────

/**
 * Push a new record under a path (Firebase auto-generates the key).
 * @param {string} path  — e.g. 'events'
 * @param {object} data
 * @returns {Promise<string>} The new Firebase push key
 */
async function pushRecord(path, data) {
  const db  = getRtdb();
  const ref = await db.ref(path).push({
    ...data,
    createdAt: new Date().toISOString(),
  });
  return ref.key;
}

/**
 * Set a record with a known key (creates or overwrites).
 * @param {string} path
 * @param {string} key
 * @param {object} data
 */
async function setRecord(path, key, data) {
  const db = getRtdb();
  await db.ref(`${path}/${key}`).set({
    ...data,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Merge-update specific fields on an existing record.
 * @param {string} path
 * @param {string} key
 * @param {object} updates
 */
async function updateRecord(path, key, updates) {
  const db = getRtdb();
  await db.ref(`${path}/${key}`).update({
    ...updates,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Get a single record by key.
 * @param {string} path
 * @param {string} key
 * @returns {Promise<object|null>}
 */
async function getRecord(path, key) {
  const db   = getRtdb();
  const snap = await db.ref(`${path}/${key}`).once('value');
  if (!snap.exists()) return null;
  return { id: snap.key, ...snap.val() };
}

/**
 * Fetch records ordered by a child field, newest-first.
 * Returns at most `limit` records.
 * All additional filtering (siteId, type, resolved, etc.) is done in-memory
 * — no composite indexes required.
 *
 * @param {string} path
 * @param {object} [options]
 * @param {string} [options.orderByField='timestamp']
 * @param {number} [options.limit=200]
 * @returns {Promise<object[]>}  newest-first
 */
async function getRecords(path, { orderByField = 'timestamp', limit = 200 } = {}) {
  const db   = getRtdb();
  const snap = await db.ref(path)
    .orderByChild(orderByField)
    .limitToLast(limit)   // limitToLast on ascending order → most recent
    .once('value');

  if (!snap.exists()) return [];

  const items = [];
  snap.forEach(child => {
    items.push({ id: child.key, ...child.val() });
  });

  // Firebase returns limitToLast results in ascending order → reverse for newest-first
  return items.reverse();
}

/**
 * Fetch ALL records under a path (no ordering, no limit).
 * Use for counting or full in-memory aggregation.
 * @param {string} path
 * @returns {Promise<object[]>}
 */
async function getAllRecords(path) {
  const db   = getRtdb();
  const snap = await db.ref(path).once('value');
  if (!snap.exists()) return [];

  const items = [];
  snap.forEach(child => {
    items.push({ id: child.key, ...child.val() });
  });
  return items;
}

// ── Compatibility shims for old firestore.js callers ──────────
// These allow the stats controller (which still imports countDocs / queryDocs)
// to work without rewriting its query logic.

/**
 * Count records matching optional field filters.
 * Filters: array of [field, '==', value] tuples.
 */
async function countDocs(path, filters = []) {
  const all = await getAllRecords(path);
  return _applyFilters(all, filters).length;
}

/**
 * Query records with optional filters and ordering.
 * options: { orderBy, orderDir, limit }
 * Filters: array of [field, op, value] — only '==' is supported.
 */
async function queryDocs(path, filters = [], options = {}) {
  const limit        = options.limit ? Math.min(options.limit, 500) : 200;
  const orderField   = options.orderBy || 'timestamp';

  // Fetch a generous window ordered by the requested field
  const records = await getRecords(path, { orderByField: orderField, limit: Math.max(limit * 3, 500) });

  // Apply in-memory filters
  let result = _applyFilters(records, filters);

  // Apply sort direction (getRecords returns newest-first by default)
  if (options.orderDir === 'asc') {
    result = result.reverse();
  }

  return result.slice(0, limit);
}

/** Internal: apply an array of [field, '==', value] filters to an array */
function _applyFilters(items, filters) {
  if (!filters || filters.length === 0) return items;
  return items.filter(item =>
    filters.every(([field, op, value]) => {
      if (op === '==') return item[field] === value;
      return true; // unsupported ops are ignored (pass-through)
    })
  );
}

module.exports = {
  PATHS,
  COLLECTIONS,   // alias
  pushRecord,
  setRecord,
  updateRecord,
  getRecord,
  getRecords,
  getAllRecords,
  // Firestore-compat shims used by statsController
  countDocs,
  queryDocs,
  // Legacy addDoc / setDoc / getDoc / updateDoc aliases
  addDoc:    (path, data) => pushRecord(path, data),
  setDoc:    (path, key, data) => setRecord(path, key, data),
  getDoc:    (path, key) => getRecord(path, key),
  updateDoc: (path, key, updates) => updateRecord(path, key, updates),
};
