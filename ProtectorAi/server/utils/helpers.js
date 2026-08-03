/**
 * server/utils/helpers.js
 * Beast AI — Shared utility functions
 */

'use strict';

const { v4: uuidv4 } = require('uuid');

/**
 * Generate a Beast AI event ID.
 * Format: bai_evt_<uuid-v4>
 */
function generateEventId() {
  return `bai_evt_${uuidv4()}`;
}

/**
 * Generate a Beast AI visitor ID.
 * Format: bai_vis_<uuid-v4>
 */
function generateVisitorId() {
  return `bai_vis_${uuidv4()}`;
}

/**
 * Generate a Beast AI alert ID.
 * Format: bai_alt_<uuid-v4>
 */
function generateAlertId() {
  return `bai_alt_${uuidv4()}`;
}

/**
 * Return current UTC timestamp as ISO string.
 */
function nowIso() {
  return new Date().toISOString();
}

/**
 * Safely parse a JSON string; returns null on failure.
 * @param {string} str
 */
function safeJsonParse(str) {
  try {
    return JSON.parse(str);
  } catch (_) {
    return null;
  }
}

/**
 * Truncate a string to maxLen characters.
 * @param {string} str
 * @param {number} maxLen
 */
function truncate(str, maxLen = 500) {
  if (typeof str !== 'string') return str;
  return str.length > maxLen ? str.slice(0, maxLen) + '…' : str;
}

/**
 * Sanitise an IP address string.
 * Strips port numbers and normalises IPv6-mapped IPv4.
 * @param {string} ip
 */
function sanitizeIp(ip) {
  if (!ip) return 'unknown';
  // IPv6-mapped IPv4: ::ffff:1.2.3.4 → 1.2.3.4
  const mapped = ip.replace(/^::ffff:/, '');
  return mapped.split(':')[0] || 'unknown';
}

/**
 * Extract the real client IP from a request.
 * Respects X-Forwarded-For (set by Render's proxy).
 * @param {import('express').Request} req
 */
function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return sanitizeIp(forwarded.split(',')[0].trim());
  }
  return sanitizeIp(req.socket?.remoteAddress || req.ip || 'unknown');
}

/**
 * Build a standard API success response envelope.
 */
function successResponse(data, meta = {}) {
  return { success: true, data, ...meta };
}

/**
 * Build a standard API error response envelope.
 */
function errorResponse(message, code = 'ERROR', details = null) {
  const body = { success: false, error: { code, message } };
  if (details) body.error.details = details;
  return body;
}

module.exports = {
  generateEventId,
  generateVisitorId,
  generateAlertId,
  nowIso,
  safeJsonParse,
  truncate,
  sanitizeIp,
  getClientIp,
  successResponse,
  errorResponse,
};
