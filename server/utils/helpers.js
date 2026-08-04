/**
 * server/utils/helpers.js
 * Beast AI v2 — Response helpers
 */

'use strict';

function successResponse(data = {}) {
  return { success: true, ...data };
}

function errorResponse(message, code = 'ERROR') {
  return { success: false, error: { code, message } };
}

module.exports = { successResponse, errorResponse };
