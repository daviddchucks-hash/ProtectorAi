/**
 * server/controllers/statsController.js
 * Beast AI v2 — Stats controller
 */

'use strict';

const { getEvents }       = require('../services/eventService');
const { getVisitors, getLiveVisitors } = require('../services/visitorService');
const { getAlerts }       = require('../services/alertService');
const logger = require('../utils/logger');
const { errorResponse, successResponse } = require('../utils/helpers');

async function getStats(req, res) {
  try {
    const { siteId } = req.query;
    if (!siteId) return res.status(400).json(errorResponse('siteId required', 'MISSING_PARAM'));

    const [events, visitors, alerts, liveVisitors] = await Promise.all([
      getEvents({ siteId, limit: 200 }),
      getVisitors({ siteId, limit: 500 }),
      getAlerts({ siteId, resolved: false, limit: 200 }),
      getLiveVisitors(siteId),
    ]);

    // Aggregate browser stats
    const browsers = {};
    const oses     = {};
    const devices  = {};
    const eventTypes = {};
    const riskLevels = { low: 0, medium: 0, high: 0, critical: 0 };

    for (const ev of events) {
      if (ev.browser) browsers[ev.browser] = (browsers[ev.browser] || 0) + 1;
      if (ev.os)      oses[ev.os]          = (oses[ev.os]          || 0) + 1;
      if (ev.device)  devices[ev.device]   = (devices[ev.device]   || 0) + 1;
      if (ev.type)    eventTypes[ev.type]  = (eventTypes[ev.type]  || 0) + 1;
      if (ev.riskLevel) riskLevels[ev.riskLevel] = (riskLevels[ev.riskLevel] || 0) + 1;
    }

    // Attack timeline — last 24h, bucketed by hour
    const now       = Date.now();
    const oneDayMs  = 24 * 60 * 60 * 1000;
    const timeline  = {};
    for (let h = 23; h >= 0; h--) {
      const label = new Date(now - h * 3600000).toISOString().slice(11, 13) + ':00';
      timeline[label] = 0;
    }
    for (const ev of events) {
      const ts = new Date(ev.timestamp || ev.createdAt).getTime();
      if (now - ts <= oneDayMs && (ev.riskLevel === 'high' || ev.riskLevel === 'critical')) {
        const label = new Date(ts).toISOString().slice(11, 13) + ':00';
        if (label in timeline) timeline[label]++;
      }
    }

    // Threat type breakdown
    const threats = {};
    for (const ev of events) {
      for (const t of (ev.detectedThreats || [])) {
        threats[t] = (threats[t] || 0) + 1;
      }
    }

    const stats = {
      siteId,
      summary: {
        totalEvents:      events.length,
        totalVisitors:    visitors.length,
        liveVisitors:     liveVisitors.length,
        activeAlerts:     alerts.length,
        criticalAlerts:   alerts.filter(a => a.riskLevel === 'critical').length,
        newVisitors:      visitors.filter(v => v.isNew).length,
        returningVisitors: visitors.filter(v => !v.isNew).length,
      },
      browsers:    _topN(browsers, 8),
      oses:        _topN(oses, 8),
      devices:     _topN(devices, 5),
      eventTypes:  _topN(eventTypes, 10),
      riskLevels,
      threats:     _topN(threats, 10),
      attackTimeline: Object.entries(timeline).map(([hour, count]) => ({ hour, count })),
    };

    res.json(successResponse(stats));
  } catch (err) {
    logger.error('getStats error', { message: err.message });
    res.status(500).json(errorResponse('Failed to fetch stats', 'FETCH_ERROR'));
  }
}

function _topN(obj, n) {
  return Object.entries(obj)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([name, count]) => ({ name, count }));
}

module.exports = { getStats };
