/**
 * server/routes/sites.js
 * Beast AI v2 — Site management routes
 *
 * GET    /api/sites           — list user's sites
 * POST   /api/sites           — register a new site
 * GET    /api/sites/:id       — get site details
 * PUT    /api/sites/:id       — update site
 * DELETE /api/sites/:id       — delete site
 * POST   /api/sites/:id/rotate-token — rotate site token
 */

'use strict';

const express    = require('express');
const router     = express.Router();
const controller = require('../controllers/sitesController');
const { siteCreateRules } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { strictLimiter } = require('../middleware/security');

router.get('/',               requireAuth, controller.listSites);
router.post('/',              requireAuth, strictLimiter, siteCreateRules, controller.createSite);
router.get('/:id',            requireAuth, controller.getSite);
router.put('/:id',            requireAuth, controller.updateSite);
router.delete('/:id',         requireAuth, controller.deleteSite);
router.post('/:id/rotate-token', requireAuth, controller.rotateToken);

module.exports = router;
