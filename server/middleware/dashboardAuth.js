/**
 * server/middleware/dashboardAuth.js
 * Beast AI — Simple token-based dashboard protection
 *
 * Checks for a Bearer token in the Authorization header,
 * or a ?token= query parameter (useful for direct browser access).
 * The expected token is set via the DASHBOARD_TOKEN env var.
 *
 * This protects GET /dashboard and GET /api/* from unauthorised access
 * in production deployments. It is intentionally lightweight — for
 * enterprise use, replace with a full authentication system.
 */

'use strict';

const path   = require('path');
const logger = require('../utils/logger');

/**
 * Returns the dashboard auth middleware.
 * Skips auth if DASHBOARD_TOKEN is not set (dev convenience).
 */
function dashboardAuth(req, res, next) {
  const expected = process.env.DASHBOARD_TOKEN;

  // Skip auth if token is not configured (dev mode)
  if (!expected || expected === 'change-me-to-a-strong-secret') {
    if (process.env.NODE_ENV === 'production') {
      logger.warn('DASHBOARD_TOKEN is not set in production — dashboard is unprotected');
    }
    return next();
  }

  // Extract token from Authorization header or query param
  const authHeader = req.headers['authorization'] || '';
  const tokenFromHeader = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : null;
  const tokenFromQuery = req.query.token || null;

  const provided = tokenFromHeader || tokenFromQuery;

  if (!provided) {
    // For browser requests to /dashboard, serve the login prompt HTML
    if (req.path === '/' || req.path === '/dashboard' || req.path.startsWith('/dashboard/')) {
      return _serveDashboardLogin(res);
    }
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required.' },
    });
  }

  if (provided !== expected) {
    logger.warn('Dashboard auth: invalid token', { ip: req.ip });
    if (req.path === '/' || req.path === '/dashboard' || req.path.startsWith('/dashboard/')) {
      return _serveDashboardLogin(res, true);
    }
    return res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Invalid token.' },
    });
  }

  // Valid token — allow through
  next();
}

/** Serve a minimal HTML login page for browser access */
function _serveDashboardLogin(res, invalid = false) {
  res.status(invalid ? 403 : 401).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Beast AI — Dashboard Login</title>
  <style>
    body{font-family:system-ui,sans-serif;background:#0a0c10;color:#e8eaf0;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
    .card{background:#141820;border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:36px 32px;width:100%;max-width:380px}
    h1{font-size:1.2rem;margin-bottom:6px;color:#fff}
    p{font-size:.82rem;color:#8892a4;margin-bottom:24px}
    input{width:100%;background:#0f1117;border:1px solid rgba(255,255,255,.12);border-radius:7px;padding:10px 14px;color:#e8eaf0;font-size:.9rem;margin-bottom:14px;box-sizing:border-box}
    input:focus{outline:none;border-color:#4f8ef7}
    button{width:100%;background:#4f8ef7;color:#fff;border:none;border-radius:7px;padding:11px;font-size:.9rem;font-weight:600;cursor:pointer}
    button:hover{background:#3b7ef0}
    .err{background:rgba(247,79,79,.12);border:1px solid rgba(247,79,79,.3);border-radius:7px;padding:10px 14px;font-size:.8rem;color:#f77;margin-bottom:14px;display:${invalid ? 'block' : 'none'}}
    .icon{font-size:2rem;margin-bottom:12px;display:block;text-align:center}
  </style>
</head>
<body>
  <div class="card">
    <span class="icon">🛡</span>
    <h1>Beast AI Dashboard</h1>
    <p>Enter your dashboard token to continue.</p>
    <div class="err">Invalid token — try again.</div>
    <form id="f">
      <input type="password" id="tok" placeholder="Dashboard token" autofocus>
      <button type="submit">Sign In</button>
    </form>
  </div>
  <script>
    document.getElementById('f').addEventListener('submit',function(e){
      e.preventDefault();
      var t=document.getElementById('tok').value.trim();
      if(t) window.location.href='/dashboard?token='+encodeURIComponent(t);
    });
  </script>
</body>
</html>`);
}

module.exports = dashboardAuth;
