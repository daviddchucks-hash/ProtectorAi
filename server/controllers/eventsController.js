/**
 * server/controllers/eventsController.js
 * Beast AI — Event controller
 * Handles ingesting SDK events and querying event history.
 */

'use strict';

const eventService   = require('../services/eventService');
const visitorService = require('../services/visitorService');
const alertService   = require('../services/alertService');
const riskEngine     = require('../services/riskEngine');
const logger         = require('../utils/logger');
const { successResponse, errorResponse, getClientIp } = require('../utils/helpers');

/** Return true when the error is a Firebase-not-configured error */
function isFirebaseNotConfigured(err) {
  return err && err.message && (
    err.message.includes('getRtdb() called before initFirebase') ||
    err.message.includes('getDb() called before initFirebase') ||
    err.message.includes('Missing Firebase credentials')
  );
}

/**
 * POST /api/events
 * Receive a security event from beast.js SDK.
 */
async function receiveEvent(req, res) {
  try {
    const ip       = getClientIp(req);
    const ua       = req.headers['user-agent'] || 'unknown';
    const siteId   = req.headers['x-beast-site-id'] || req.body.siteId;
    const payload  = { ...req.body, siteId, ip, userAgent: ua };

    // 1. Score the event
    const risk = riskEngine.score(payload);

    // 2. Persist event
    const event = await eventService.createEvent({ ...payload, ...risk });

    // 3. Upsert visitor record
    await visitorService.upsertVisitor({
      visitorId: payload.visitorId,
      siteId,
      ip,
      userAgent: ua,
      browser:   payload.browser,
      os:        payload.os,
      device:    payload.device,
      country:   payload.country,
      language:  payload.language,
      timezone:  payload.timezone,
    });

    // 4. Create alert for High/Critical events
    if (risk.riskLevel === 'high' || risk.riskLevel === 'critical') {
      await alertService.createAlert({
        eventId:           event.eventId,
        siteId,
        visitorId:         payload.visitorId,
        type:              payload.type,
        riskScore:         risk.riskScore,
        riskLevel:         risk.riskLevel,
        reason:            risk.riskReason,
        recommendedAction: risk.recommendedAction,
        ip,
      });
    }

    logger.info('Event received', {
      eventId:   event.eventId,
      type:      payload.type,
      siteId,
      riskLevel: risk.riskLevel,
      riskScore: risk.riskScore,
    });

    return res.status(201).json(
      successResponse({ eventId: event.eventId, riskLevel: risk.riskLevel })
    );
  } catch (err) {
    logger.error('receiveEvent error', { message: err.message });
    if (isFirebaseNotConfigured(err)) {
      return res.status(503).json(errorResponse(
        'Database not configured. Set FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, and FIREBASE_CLIENT_EMAIL in your Render environment variables.',
        'DB_NOT_CONFIGURED'
      ));
    }
    return res.status(500).json(errorResponse('Failed to process event', 'EVENT_ERROR'));
  }
}

/**
 * GET /api/events
 * Fetch event history for the dashboard.
 */
async function getEvents(req, res) {
  try {
    const { siteId, limit = 100, type } = req.query;
    const events = await eventService.getEvents({ siteId, limit, type });
    return res.json(successResponse(events, { count: events.length }));
  } catch (err) {
    logger.error('getEvents error', { message: err.message });
    if (isFirebaseNotConfigured(err)) {
      return res.status(503).json(errorResponse(
        'Database not configured. Set FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, and FIREBASE_CLIENT_EMAIL in your Render environment variables.',
        'DB_NOT_CONFIGURED'
      ));
    }
    return res.status(500).json(errorResponse('Failed to fetch events', 'FETCH_ERROR'));
  }
}

module.exports = { receiveEvent, getEvents };
