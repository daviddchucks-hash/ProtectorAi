/**
 * server/controllers/eventsController.js
 * Beast AI v2 — Events controller
 */

'use strict';

const { processEvent, getEvents } = require('../services/eventService');
const { upsertVisitor } = require('../services/visitorService');
const { getSiteByToken } = require('../services/siteService');
const logger = require('../utils/logger');
const { errorResponse, successResponse } = require('../utils/helpers');

/**
 * POST /api/events
 * Receive an event from beast.js. No auth required — token in header identifies site.
 */
async function receiveEvent(req, res) {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';

  try {
    const body = req.body;

    // Resolve siteId from token header or body
    let siteId = body.siteId;
    const token = req.headers['x-beast-site-token'];
    if (token) {
      const site = await getSiteByToken(token);
      if (site && site.active) {
        siteId = site.siteId;
      }
    }

    if (!siteId) {
      return res.status(400).json(errorResponse('Missing siteId or valid site token', 'NO_SITE'));
    }

    const event = { ...body, siteId, userAgent: req.headers['user-agent'] || body.userAgent || '' };
    const result = await processEvent(event, ip);

    // Upsert visitor record (fire-and-forget on error)
    upsertVisitor(event, ip).catch(err =>
      logger.error('Visitor upsert failed', { message: err.message })
    );

    res.status(202).json(successResponse({ eventId: result.id, riskLevel: result.riskLevel }));
  } catch (err) {
    logger.error('receiveEvent error', { message: err.message, stack: err.stack });
    res.status(500).json(errorResponse('Failed to process event', 'PROCESS_ERROR'));
  }
}

/**
 * GET /api/events?siteId=&limit=&type=
 */
async function getEventsHandler(req, res) {
  try {
    const { siteId, limit = 100, type } = req.query;
    if (!siteId) return res.status(400).json(errorResponse('siteId required', 'MISSING_PARAM'));

    const events = await getEvents({ siteId, limit: Number(limit), type });
    res.json(successResponse({ events, count: events.length }));
  } catch (err) {
    logger.error('getEvents error', { message: err.message });
    res.status(500).json(errorResponse('Failed to fetch events', 'FETCH_ERROR'));
  }
}

module.exports = { receiveEvent, getEvents: getEventsHandler };
