/**
 * firebase/admin.js
 * Beast AI — Firebase Admin SDK initialisation
 * Uses Firebase Realtime Database (not Firestore).
 * Singleton pattern — safe to import from multiple modules.
 */

'use strict';

const admin = require('firebase-admin');

let _initialized = false;

/**
 * Initialise Firebase Admin SDK using environment variables.
 * Called once at server startup from server/index.js.
 * Requires FIREBASE_DATABASE_URL in addition to the service-account vars.
 */
function initFirebase() {
  if (_initialized) {
    return admin.app();
  }

  const {
    FIREBASE_PROJECT_ID,
    FIREBASE_PRIVATE_KEY,
    FIREBASE_CLIENT_EMAIL,
    FIREBASE_DATABASE_URL,
  } = process.env;

  if (!FIREBASE_PROJECT_ID || !FIREBASE_PRIVATE_KEY || !FIREBASE_CLIENT_EMAIL || !FIREBASE_DATABASE_URL) {
    const msg =
      'Missing Firebase credentials. Set FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, ' +
      'FIREBASE_CLIENT_EMAIL, and FIREBASE_DATABASE_URL in your environment.';
    if (process.env.NODE_ENV === 'production') {
      throw new Error(msg);
    }
    console.warn(`[Firebase] WARNING: ${msg}`);
    console.warn('[Firebase] Running without Firebase — database endpoints will fail.');
    return null;
  }

  // Render stores env vars with literal \\n — convert to real newlines
  const privateKey = FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');

  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId:   FIREBASE_PROJECT_ID,
        privateKey,
        clientEmail: FIREBASE_CLIENT_EMAIL,
      }),
      databaseURL: FIREBASE_DATABASE_URL,
    });
  } catch (err) {
    if (process.env.NODE_ENV === 'production') throw err;
    console.warn(`[Firebase] WARNING: Failed to initialize — ${err.message}`);
    console.warn('[Firebase] Running without Firebase — database endpoints will fail.');
    return null;
  }

  _initialized = true;
  console.log(`[Firebase] Initialized — project: ${FIREBASE_PROJECT_ID}`);
  return admin.app();
}

/**
 * Return the Firebase Realtime Database instance.
 * Requires initFirebase() to have been called first.
 */
function getRtdb() {
  if (!_initialized) {
    throw new Error('[Firebase] getRtdb() called before initFirebase()');
  }
  return admin.database();
}

module.exports = { initFirebase, getRtdb };
