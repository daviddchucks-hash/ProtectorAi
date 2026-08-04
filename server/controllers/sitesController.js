/**
 * server/controllers/sitesController.js
 * Beast AI v2 — Site management controller
 */

'use strict';

const siteService = require('../services/siteService');
const logger = require('../utils/logger');
const { errorResponse, successResponse } = require('../utils/helpers');

async function listSites(req, res) {
  try {
    await siteService.ensureUserProfile(req.user.uid, req.user.email);
    const sites = await siteService.getSitesByOwner(req.user.uid);
    res.json(successResponse({ sites, count: sites.length }));
  } catch (err) {
    logger.error('listSites error', { message: err.message });
    res.status(500).json(errorResponse('Failed to fetch sites', 'FETCH_ERROR'));
  }
}

async function createSite(req, res) {
  try {
    await siteService.ensureUserProfile(req.user.uid, req.user.email);
    const { name, domain } = req.body;
    const site = await siteService.createSite({ ownerId: req.user.uid, name, domain });
    res.status(201).json(successResponse({ site }));
  } catch (err) {
    logger.error('createSite error', { message: err.message });
    res.status(500).json(errorResponse('Failed to create site', 'CREATE_ERROR'));
  }
}

async function getSite(req, res) {
  try {
    const site = await siteService.getSiteById(req.params.id);
    if (!site) return res.status(404).json(errorResponse('Site not found', 'NOT_FOUND'));
    if (site.ownerId !== req.user.uid) return res.status(403).json(errorResponse('Forbidden', 'FORBIDDEN'));
    res.json(successResponse({ site }));
  } catch (err) {
    logger.error('getSite error', { message: err.message });
    res.status(500).json(errorResponse('Failed to fetch site', 'FETCH_ERROR'));
  }
}

async function updateSite(req, res) {
  try {
    const site = await siteService.getSiteById(req.params.id);
    if (!site) return res.status(404).json(errorResponse('Site not found', 'NOT_FOUND'));
    if (site.ownerId !== req.user.uid) return res.status(403).json(errorResponse('Forbidden', 'FORBIDDEN'));
    await siteService.updateSite(req.params.id, req.body);
    res.json(successResponse({ updated: true }));
  } catch (err) {
    logger.error('updateSite error', { message: err.message });
    res.status(500).json(errorResponse('Failed to update site', 'UPDATE_ERROR'));
  }
}

async function deleteSite(req, res) {
  try {
    const site = await siteService.getSiteById(req.params.id);
    if (!site) return res.status(404).json(errorResponse('Site not found', 'NOT_FOUND'));
    if (site.ownerId !== req.user.uid) return res.status(403).json(errorResponse('Forbidden', 'FORBIDDEN'));
    await siteService.deleteSite(req.params.id, req.user.uid);
    res.json(successResponse({ deleted: true }));
  } catch (err) {
    logger.error('deleteSite error', { message: err.message });
    res.status(500).json(errorResponse('Failed to delete site', 'DELETE_ERROR'));
  }
}

async function rotateToken(req, res) {
  try {
    const site = await siteService.getSiteById(req.params.id);
    if (!site) return res.status(404).json(errorResponse('Site not found', 'NOT_FOUND'));
    if (site.ownerId !== req.user.uid) return res.status(403).json(errorResponse('Forbidden', 'FORBIDDEN'));
    const newToken = await siteService.rotateSiteToken(req.params.id);
    res.json(successResponse({ token: newToken }));
  } catch (err) {
    logger.error('rotateToken error', { message: err.message });
    res.status(500).json(errorResponse('Failed to rotate token', 'UPDATE_ERROR'));
  }
}

module.exports = { listSites, createSite, getSite, updateSite, deleteSite, rotateToken };
