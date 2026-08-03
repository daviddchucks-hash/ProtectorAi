/**
 * firebase/firestore.js
 * Beast AI — Low-level Firestore helpers
 * Wraps common CRUD operations with error handling and logging.
 */

'use strict';

const { getDb } = require('./admin');

// ── Collection names ───────────────────────────────────────────
const COLLECTIONS = {
  EVENTS:   'events',
  VISITORS: 'visitors',
  ALERTS:   'alerts',
  SETTINGS: 'settings',
};

// ── Generic helpers ────────────────────────────────────────────

/**
 * Add a new document to a collection.
 * @param {string} collection
 * @param {object} data
 * @returns {Promise<string>} The new document ID
 */
async function addDoc(collection, data) {
  const db  = getDb();
  const ref = await db.collection(collection).add({
    ...data,
    createdAt: new Date(),
  });
  return ref.id;
}

/**
 * Set (create or overwrite) a document with a known ID.
 * @param {string} collection
 * @param {string} docId
 * @param {object} data
 * @param {boolean} [merge=false] — merge instead of overwrite
 */
async function setDoc(collection, docId, data, merge = false) {
  const db = getDb();
  await db.collection(collection).doc(docId).set(
    { ...data, updatedAt: new Date() },
    { merge }
  );
}

/**
 * Get a single document by ID.
 * @param {string} collection
 * @param {string} docId
 * @returns {Promise<object|null>}
 */
async function getDoc(collection, docId) {
  const db   = getDb();
  const snap = await db.collection(collection).doc(docId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() };
}

/**
 * Update specific fields on an existing document.
 * @param {string} collection
 * @param {string} docId
 * @param {object} updates
 */
async function updateDoc(collection, docId, updates) {
  const db = getDb();
  await db.collection(collection).doc(docId).update({
    ...updates,
    updatedAt: new Date(),
  });
}

/**
 * Query a collection with optional filters and ordering.
 * @param {string} collection
 * @param {Array<[field, op, value]>} filters
 * @param {object} options — { orderBy, orderDir, limit }
 * @returns {Promise<object[]>}
 */
async function queryDocs(collection, filters = [], options = {}) {
  const db = getDb();
  let query = db.collection(collection);

  for (const [field, op, value] of filters) {
    query = query.where(field, op, value);
  }

  if (options.orderBy) {
    query = query.orderBy(options.orderBy, options.orderDir || 'desc');
  }

  if (options.limit) {
    query = query.limit(options.limit);
  }

  const snap = await query.get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Count documents matching optional filters.
 * Falls back to full fetch if AggregateQuery is unavailable.
 * @param {string} collection
 * @param {Array<[field, op, value]>} filters
 * @returns {Promise<number>}
 */
async function countDocs(collection, filters = []) {
  const db = getDb();
  let query = db.collection(collection);

  for (const [field, op, value] of filters) {
    query = query.where(field, op, value);
  }

  try {
    const snapshot = await query.count().get();
    return snapshot.data().count;
  } catch (_) {
    // Fallback: fetch docs and count in-memory
    const snap = await query.get();
    return snap.size;
  }
}

/**
 * Delete a document by ID.
 * @param {string} collection
 * @param {string} docId
 */
async function deleteDoc(collection, docId) {
  const db = getDb();
  await db.collection(collection).doc(docId).delete();
}

module.exports = {
  COLLECTIONS,
  addDoc,
  setDoc,
  getDoc,
  updateDoc,
  queryDocs,
  countDocs,
  deleteDoc,
};
