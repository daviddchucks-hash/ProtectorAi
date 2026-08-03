/**
 * server/controllers/statsController.js
 * Beast AI — Stats controller
 * Returns aggregated dashboard summary data.
 */

'use strict';

const eventService   = require('../services/eventService');
const visitorService = require('../services/visitorService');
const alertService   = require('../services/alertService');
const logger         = require('../utils/logger');
const { successResponse, errorResponse } = require('../utils/helpers');
const { countDocs, queryDocs, COLLECTIONS } = require('../../firebase/firestore');

/**
 * GET /api/stats
 * Returns a full dashboard summary.
 */
async function getStats(req, res) {
  try {
    const { siteId } = req.query;
    const filters    = siteId ? [['siteId', '==', siteId]] : [];

    // Run all counts in parallel for speed
    const [
      totalEvents,
      totalVisitors,
      totalAlerts,
      criticalAlerts,
      highAlerts,
      jsErrors,
      recentEvents,
      liveVisitors,
    ] = await Promise.all([
      countDocs(COLLECTIONS.EVENTS, filters),
      countDocs(COLLECTIONS.VISITORS, filters),
      countDocs(COLLECTIONS.ALERTS, filters),
      countDocs(COLLECTIONS.ALERTS, [...filters, ['riskLevel', '==', 'critical']]),
      countDocs(COLLECTIONS.ALERTS,  [...filters, ['riskLevel', '==', 'high']]),
      countDocs(COLLECTIONS.EVENTS, [...filters, ['type', '==', 'js_error']]),
      queryDocs(COLLECTIONS.EVENTS, filters, { orderBy: 'timestamp', limit: 10 }),
      visitorService.getLiveVisitorCount(siteId),
    ]);

    // Browser/OS breakdown from recent 200 events
    const sample = await queryDocs(COLLECTIONS.EVENTS, filters, {
      orderBy: 'timestamp',
      limit:   200,
    });

    const browserBreakdown = _breakdown(sample, 'browser');
    const osBreakdown      = _breakdown(sample, 'os');
    const eventTypeBreakdown = _breakdown(sample, 'type');

    // Average threat score
    const avgThreatScore = sample.length
      ? Math.round(sample.reduce((acc, e) => acc + (e.riskScore || 0), 0) / sample.length)
      : 0;

    // Performance stats
    const perfEvents = sample.filter(e => e.type === 'performance' && e.data);
    const avgLoadTime = perfEvents.length
      ? Math.round(
          perfEvents.reduce((acc, e) => acc + (e.data.loadTime || 0), 0) / perfEvents.length
        )
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
          browsers: browserBreakdown,
          os:       osBreakdown,
          eventTypes: eventTypeBreakdown,
        },
        recentEvents: recentEvents.slice(0, 10),
      })
    );
  } catch (err) {
    logger.error('getStats error', { message: err.message });
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
