/**
 * server/controllers/visitorsController.js
 * Beast AI — Visitors controller
 */

'use strict';

const visitorService = require('../services/visitorService');
const logger         = require('../utils/logger');
const { successResponse, errorResponse } = require('../utils/helpers');

/**
 * GET /api/visitors
 * Returns a paginated list of visitors.
 */
async function getVisitors(req, res) {
  try {
    const { siteId, limit = 100 } = req.query;
    const visitors = await visitorService.getVisitors({ siteId, limit });
    return res.json(successResponse(visitors, { count: visitors.length }));
  } catch (err) {
    logger.error('getVisitors error', { message: err.message });
    return res.status(500).json(errorResponse('Failed to fetch visitors', 'FETCH_ERROR'));
  }
}

/**
 * GET /api/visitors/:id
 * Returns a single visitor profile with their recent events.
 */
async function getVisitor(req, res) {
  try {
    const { id } = req.params;
    const visitor = await visitorService.getVisitorById(id);

    if (!visitor) {
      return res.status(404).json(errorResponse('Visitor not found', 'NOT_FOUND'));
    }

    return res.json(successResponse(visitor));
  } catch (err) {
    logger.error('getVisitor error', { message: err.message });
    return res.status(500).json(errorResponse('Failed to fetch visitor', 'FETCH_ERROR'));
  }
}

module.exports = { getVisitors, getVisitor };
