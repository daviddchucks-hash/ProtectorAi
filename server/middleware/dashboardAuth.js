/**
 * server/middleware/dashboardAuth.js
 * Beast AI v2 — Dashboard auth middleware
 *
 * In v2 the dashboard uses Firebase Authentication on the frontend.
 * The backend API routes are protected by requireAuth (firebase token verification).
 * This middleware is kept for the static HTML route (no-op in v2).
 */

'use strict';

// The /dashboard route serves static HTML — auth is handled client-side via Firebase.
// API routes use server/middleware/auth.js (Firebase token verification).
module.exports = function dashboardAuth(req, res, next) {
  next();
};
