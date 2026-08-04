/**
 * server/controllers/visitorsController.js
 * Beast AI v2 — Visitors controller
 */

'use strict';

const { getVisitors, getVisitor, getLiveVisitors } = require('../services/visitorService');
const logger = require('../utils/logger');
const { errorResponse, successResponse } = require('../utils/helpers');

async function getVisitorsHandler(req, res) {
  try {
    const { siteId, limit = 100 } = req.query;
    if (!siteId) return res.status(400).json(errorResponse('siteId required', 'MISSING_PARAM'));
    const visitors = await getVisitors({ siteId, limit: Number(limit) });
    res.json(successResponse({ visitors, count: visitors.length }));
  } catch (err) {
    logger.error('getVisitors error', { message: err.message });
    res.status(500).json(errorResponse('Failed to fetch visitors', 'FETCH_ERROR'));
  }
}

async function getLiveVisitorsHandler(req, res) {
  try {
    const { siteId } = req.query;
    if (!siteId) return res.status(400).json(errorResponse('siteId required', 'MISSING_PARAM'));
    const visitors = await getLiveVisitors(siteId);
    res.json(successResponse({ visitors, count: visitors.length }));
  } catch (err) {
    logger.error('getLiveVisitors error', { message: err.message });
    res.status(500).json(errorResponse('Failed to fetch live visitors', 'FETCH_ERROR'));
  }
}

async function getVisitorHandler(req, res) {
  try {
    const { siteId } = req.query;
    if (!siteId) return res.status(400).json(errorResponse('siteId required', 'MISSING_PARAM'));
    const visitor = await getVisitor(siteId, req.params.id);
    if (!visitor) return res.status(404).json(errorResponse('Visitor not found', 'NOT_FOUND'));
    res.json(successResponse({ visitor }));
  } catch (err) {
    logger.error('getVisitor error', { message: err.message });
    res.status(500).json(errorResponse('Failed to fetch visitor', 'FETCH_ERROR'));
  }
}

module.exports = { getVisitors: getVisitorsHandler, getLiveVisitors: getLiveVisitorsHandler, getVisitor: getVisitorHandler };
