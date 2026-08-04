/**
 * firebase/admin.js
 * Beast AI v2 — Firebase Admin SDK initialisation
 */

'use strict';

const admin = require('firebase-admin');

let _initialized = false;

function initFirebase() {
  if (_initialized) return admin.app();

  const {
    FIREBASE_PROJECT_ID,
    FIREBASE_PRIVATE_KEY,
    FIREBASE_CLIENT_EMAIL,
    FIREBASE_DATABASE_URL,
  } = process.env;

  if (!FIREBASE_PROJECT_ID || !FIREBASE_PRIVATE_KEY || !FIREBASE_CLIENT_EMAIL || !FIREBASE_DATABASE_URL) {
    const msg = 'Missing Firebase credentials. Set FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, ' +
      'FIREBASE_CLIENT_EMAIL, and FIREBASE_DATABASE_URL.';
    if (process.env.NODE_ENV === 'production') throw new Error(msg);
    console.warn(`[Firebase] WARNING: ${msg}`);
    console.warn('[Firebase] Running without Firebase — database endpoints will fail.');
    return null;
  }

  const privateKey = FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');

  try {
    admin.initializeApp({
      credential: admin.credential.cert({ projectId: FIREBASE_PROJECT_ID, privateKey, clientEmail: FIREBASE_CLIENT_EMAIL }),
      databaseURL: FIREBASE_DATABASE_URL,
    });
  } catch (err) {
    if (process.env.NODE_ENV === 'production') throw err;
    console.warn(`[Firebase] WARNING: Failed to initialize — ${err.message}`);
    return null;
  }

  _initialized = true;
  console.log(`[Firebase] Initialized — project: ${FIREBASE_PROJECT_ID}`);
  return admin.app();
}

function getRtdb() {
  if (!_initialized) throw new Error('[Firebase] getRtdb() called before initFirebase()');
  return admin.database();
}

function getAuth() {
  if (!_initialized) throw new Error('[Firebase] getAuth() called before initFirebase()');
  return admin.auth();
}

module.exports = { initFirebase, getRtdb, getAuth };
