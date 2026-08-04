/**
 * server/controllers/statsController.js
 * Beast AI — Stats controller
 * Returns aggregated dashboard summary data.
 * Uses Firebase Realtime Database — all counts done in-memory.
 */

'use strict';

const visitorService = require('../services/visitorService');
const logger         = require('../utils/logger');
const { successResponse, errorResponse } = require('../utils/helpers');
const { getAllRecords, getRecords, PATHS } = require('../../firebase/database');

/**
 * GET /api/stats
 * Returns a full dashboard summary.
 */
async function getStats(req, res) {
  try {
    const { siteId } = req.query;

    // Fetch all data in parallel
    const [allEvents, allVisitors, allAlerts, liveVisitors] = await Promise.all([
      getAllRecords(PATHS.EVENTS),
      getAllRecords(PATHS.VISITORS),
      getAllRecords(PATHS.ALERTS),
      visitorService.getLiveVisitorCount(siteId),
    ]);

    // Apply siteId filter if provided
    const events   = siteId ? allEvents.filter(e => e.siteId === siteId)   : allEvents;
    const visitors = siteId ? allVisitors.filter(v => v.siteId === siteId) : allVisitors;
    const alerts   = siteId ? allAlerts.filter(a => a.siteId === siteId)   : allAlerts;

    // Counts
    const totalEvents    = events.length;
    const totalVisitors  = visitors.length;
    const totalAlerts    = alerts.filter(a => !a.resolved).length;
    const criticalAlerts = alerts.filter(a => !a.resolved && a.riskLevel === 'critical').length;
    const highAlerts     = alerts.filter(a => !a.resolved && a.riskLevel === 'high').length;
    const jsErrors       = events.filter(e => e.type === 'js_error').length;

    // Recent events (last 10, newest-first)
    const recentEvents = events
      .slice()
      .sort((a, b) => (b.timestamp || '') < (a.timestamp || '') ? -1 : 1)
      .slice(0, 10);

    // Sample for breakdowns (last 200 events)
    const sample = recentEvents.length === events.length
      ? events
      : events
          .slice()
          .sort((a, b) => (b.timestamp || '') < (a.timestamp || '') ? -1 : 1)
          .slice(0, 200);

    const browserBreakdown   = _breakdown(sample, 'browser');
    const osBreakdown        = _breakdown(sample, 'os');
    const eventTypeBreakdown = _breakdown(sample, 'type');

    // Average threat score
    const avgThreatScore = sample.length
      ? Math.round(sample.reduce((acc, e) => acc + (e.riskScore || 0), 0) / sample.length)
      : 0;

    // Average page load time
    const perfEvents  = sample.filter(e => e.type === 'performance' && e.data);
    const avgLoadTime = perfEvents.length
      ? Math.round(perfEvents.reduce((acc, e) => acc + (e.data.loadTime || 0), 0) / perfEvents.length)
      : null;

    return res.json(
      successResponse({
        summary: {
          totalEvents,
          totalVisitors,
          liveVisitors,
          totalAlerts,
          criticalAlerts,
          highAlerts,
          jsErrors,
          avgThreatScore,
          avgLoadTime,
        },
        breakdowns: {
          browsers:   browserBreakdown,
          os:         osBreakdown,
          eventTypes: eventTypeBreakdown,
        },
        recentEvents,
      })
    );
  } catch (err) {
    logger.error('getStats error', { message: err.message });
    if (err.message && (
      err.message.includes('getRtdb() called before initFirebase') ||
      err.message.includes('Missing Firebase credentials')
    )) {
      return res.status(503).json(errorResponse(
        'Database not configured. Set FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL, and FIREBASE_DATABASE_URL in your Render environment variables.',
        'DB_NOT_CONFIGURED'
      ));
    }
    return res.status(500).json(errorResponse('Failed to fetch stats', 'STATS_ERROR'));
  }
}

/** Count occurrences of a field value across an array of objects */
function _breakdown(items, field) {
  const counts = {};
  for (const item of items) {
    const val = item[field] || 'unknown';
    counts[val] = (counts[val] || 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));
}

module.exports = { getStats };
