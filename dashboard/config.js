/**
 * dashboard/config.js
 * Beast AI v2 — Frontend Firebase + Backend configuration
 *
 * IMPORTANT: After deploying to Render, update BEAST_AI_URL below.
 * Fill in your Firebase project settings from:
 *   Firebase Console → Project Settings → General → Your apps → Web app
 */

// Backend URL (your Render deployment)
window.BEAST_AI_URL = 'https://protectorai-1.onrender.com';

// Firebase Web SDK configuration
window.BEAST_FIREBASE_CONFIG = {
  apiKey:            "YOUR_FIREBASE_API_KEY",
  authDomain:        "YOUR_PROJECT_ID.firebaseapp.com",
  databaseURL:       "https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId:             "YOUR_APP_ID",
};
