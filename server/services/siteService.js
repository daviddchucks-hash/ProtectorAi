/**
 * server/services/siteService.js
 * Beast AI v2 — Site management service
 */

'use strict';

const { v4: uuidv4 } = require('uuid');
const { pushRecord, setRecord, updateRecord, getRecord, getRecords, deleteRecord, PATHS, nowIso } = require('../../firebase/database');
const { getRtdb } = require('../../firebase/admin');
const logger = require('../utils/logger');

/**
 * Register a new website for a user.
 */
async function createSite({ ownerId, name, domain }) {
  const siteId = 'site_' + uuidv4().replace(/-/g, '').slice(0, 16);
  const token  = 'tok_' + uuidv4().replace(/-/g, '');

  const siteData = {
    siteId,
    name,
    domain: domain.toLowerCase().trim(),
    ownerId,
    token,
    active: true,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    stats: { totalVisitors: 0, totalEvents: 0, totalAlerts: 0 },
  };

  await setRecord(PATHS.SITES, siteId, siteData);

  // Index: token → siteId (for fast SDK lookups)
  const db = getRtdb();
  await db.ref(`${PATHS.SITES_BY_TOKEN}/${token}`).set(siteId);

  // Add siteId to user's site list
  await db.ref(`${PATHS.USERS}/${ownerId}/sites/${siteId}`).set(true);

  return siteData;
}

/**
 * Get a site by its ID.
 */
async function getSiteById(siteId) {
  return await getRecord(PATHS.SITES, siteId);
}

/**
 * Get a site by its token (for SDK authentication).
 *
 * Primary: reads the sitesByToken index for O(1) lookup.
 * Fallback: if the index is missing (rare — transient Firebase write failure
 * during createSite), scans the sites collection by token field and
 * auto-repairs the index so the next lookup is fast again.
 */
async function getSiteByToken(token) {
  const db   = getRtdb();
  const snap = await db.ref(`${PATHS.SITES_BY_TOKEN}/${token}`).once('value');

  if (snap.exists()) {
    const siteId = snap.val();
    return await getSiteById(siteId);
  }

  // Index miss — fall back to a direct field query on /sites/
  logger.warn('sitesByToken index miss — falling back to field scan', {
    token: token ? token.slice(0, 12) + '…' : 'none',
  });

  const fallback = await db.ref(PATHS.SITES)
    .orderByChild('token')
    .equalTo(token)
    .once('value');

  if (!fallback.exists()) return null;

  let site = null;
  fallback.forEach(child => {
    site = { id: child.key, ...child.val() };
  });

  if (site) {
    // Repair the index so future lookups are fast
    await db.ref(`${PATHS.SITES_BY_TOKEN}/${token}`).set(site.siteId);
    logger.info('sitesByToken index repaired', { siteId: site.siteId });
  }

  return site;
}

/**
 * Get all sites belonging to a user.
 */
async function getSitesByOwner(ownerId) {
  const db   = getRtdb();
  const snap = await db.ref(`${PATHS.USERS}/${ownerId}/sites`).once('value');
  if (!snap.exists()) return [];

  const siteIds = Object.keys(snap.val() || {});
  const sites = await Promise.all(siteIds.map(id => getSiteById(id)));
  return sites.filter(Boolean);
}

/**
 * Update site metadata.
 */
async function updateSite(siteId, updates) {
  const allowed = ['name', 'domain', 'active'];
  const filtered = {};
  for (const key of allowed) {
    if (updates[key] !== undefined) filtered[key] = updates[key];
  }
  await updateRecord(PATHS.SITES, siteId, filtered);
}

/**
 * Rotate a site's token.
 */
async function rotateSiteToken(siteId) {
  const site = await getSiteById(siteId);
  if (!site) throw new Error('Site not found');

  const newToken = 'tok_' + uuidv4().replace(/-/g, '');
  const db = getRtdb();

  // Remove old token index
  if (site.token) {
    await db.ref(`${PATHS.SITES_BY_TOKEN}/${site.token}`).remove();
  }

  // Set new token
  await updateRecord(PATHS.SITES, siteId, { token: newToken });
  await db.ref(`${PATHS.SITES_BY_TOKEN}/${newToken}`).set(siteId);

  return newToken;
}

/**
 * Delete a site and all its data.
 */
async function deleteSite(siteId, ownerId) {
  const site = await getSiteById(siteId);
  if (!site) throw new Error('Site not found');

  const db = getRtdb();

  // Remove token index
  if (site.token) {
    await db.ref(`${PATHS.SITES_BY_TOKEN}/${site.token}`).remove();
  }

  // Remove from user's list
  await db.ref(`${PATHS.USERS}/${ownerId}/sites/${siteId}`).remove();

  // Remove site record
  await deleteRecord(PATHS.SITES, siteId);
}

/**
 * Increment a site's counter.
 */
async function incrementSiteStat(siteId, field) {
  const db  = getRtdb();
  const ref = db.ref(`${PATHS.SITES}/${siteId}/stats/${field}`);
  const snap = await ref.once('value');
  const current = snap.val() || 0;
  await ref.set(current + 1);
}

/**
 * Ensure a user profile exists.
 */
async function ensureUserProfile(uid, email) {
  const db  = getRtdb();
  const ref = db.ref(`${PATHS.USERS}/${uid}`);
  const snap = await ref.once('value');
  if (!snap.exists()) {
    await ref.set({ uid, email, createdAt: nowIso(), sites: {} });
  }
}

module.exports = {
  createSite,
  getSiteById,
  getSiteByToken,
  getSitesByOwner,
  updateSite,
  rotateSiteToken,
  deleteSite,
  incrementSiteStat,
  ensureUserProfile,
};
