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
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';

  try {
    const body = req.body;

    // ── Detailed logging for pipeline debugging ─────────────────
    const token = req.headers['x-beast-site-token'] || req.headers['x-beast-site-id'] || '';

    logger.info('Event received', {
      type:        body?.type     || '(none)',
      visitorId:   body?.visitorId ? body.visitorId.slice(0, 20) + '…' : '(none)',
      siteIdBody:  body?.siteId   || '(none)',
      hasToken:    !!token,
      tokenPrefix: token ? token.slice(0, 16) + '…' : '(none)',
      ip,
      origin:      req.headers.origin || '(none)',
      referer:     req.headers.referer || '(none)',
    });

    // Validate that body was parsed (Content-Type: application/json required)
    if (!body || typeof body !== 'object') {
      logger.warn('Event rejected: body not parsed — check Content-Type header', { ip });
      return res.status(400).json(errorResponse('Request body must be JSON with Content-Type: application/json', 'INVALID_BODY'));
    }

    // Resolve siteId from token header or body
    let siteId = body.siteId || null;

    if (token) {
      const site = await getSiteByToken(token);
      if (site) {
        if (!site.active) {
          logger.warn('Event rejected: site inactive', { token: token.slice(0, 16) });
          return res.status(403).json(errorResponse('Site is inactive', 'SITE_INACTIVE'));
        }
        siteId = site.siteId;
        logger.debug('Site resolved from token', { siteId, domain: site.domain });
      } else {
        logger.warn('Event rejected: token not found', { token: token.slice(0, 16) });
        return res.status(400).json(errorResponse('Invalid site token', 'INVALID_TOKEN'));
      }
    }

    if (!siteId) {
      logger.warn('Event rejected: no siteId and no valid token', {
        ip,
        origin: req.headers.origin || '(none)',
        tokenPresent: !!token,
      });
      return res.status(400).json(errorResponse(
        'Missing siteId or X-Beast-Site-Token header. ' +
        'Use the script tag from your dashboard which includes ?token=tok_xxx',
        'NO_SITE'
      ));
    }

    const event = { ...body, siteId, userAgent: req.headers['user-agent'] || body.userAgent || '' };
    const result = await processEvent(event, ip);

    // Upsert visitor record (fire-and-forget on error)
    upsertVisitor(event, ip).catch(err =>
      logger.error('Visitor upsert failed', { message: err.message })
    );

    logger.info('Event stored', { eventId: result.id, siteId, type: body.type, riskLevel: result.riskLevel });

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
