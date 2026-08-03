/**
 * firebase/admin.js
 * Beast AI — Firebase Admin SDK initialisation
 * Singleton pattern — safe to import from multiple modules.
 */

'use strict';

const admin = require('firebase-admin');

let _initialized = false;

/**
 * Initialise Firebase Admin SDK using environment variables.
 * Called once at server startup from server/index.js.
 * @returns {admin.app.App}
 */
function initFirebase() {
  if (_initialized) {
    return admin.app();
  }

  const { FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL } = process.env;

  if (!FIREBASE_PROJECT_ID || !FIREBASE_PRIVATE_KEY || !FIREBASE_CLIENT_EMAIL) {
    const msg = 'Missing Firebase credentials. Set FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, and FIREBASE_CLIENT_EMAIL in .env';
    if (process.env.NODE_ENV === 'production') {
      throw new Error(msg);
    }
    // In development, warn but don't crash — API endpoints that touch Firestore
    // will return errors, but the server and health check will still start.
    console.warn(`[Firebase] WARNING: ${msg}`);
    console.warn('[Firebase] Running in dev mode without Firebase — database endpoints will fail.');
    return null;
  }

  // Render stores env vars with literal \n — convert to real newlines
  const privateKey = FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');

  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId:   FIREBASE_PROJECT_ID,
        privateKey,
        clientEmail: FIREBASE_CLIENT_EMAIL,
      }),
    });
  } catch (err) {
    if (process.env.NODE_ENV === 'production') throw err;
    console.warn(`[Firebase] WARNING: Failed to initialize — ${err.message}`);
    console.warn('[Firebase] Running in dev mode without Firebase — database endpoints will fail.');
    return null;
  }

  _initialized = true;
  console.log(`[Firebase] Initialized — project: ${FIREBASE_PROJECT_ID}`);
  return admin.app();
}

/**
 * Return the Firestore database instance.
 * Requires initFirebase() to have been called first.
 */
function getDb() {
  if (!_initialized) {
    throw new Error('[Firebase] getDb() called before initFirebase()');
  }
  return admin.firestore();
}

module.exports = { initFirebase, getDb };
