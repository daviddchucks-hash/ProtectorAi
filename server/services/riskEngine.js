/**
 * server/services/riskEngine.js
 * Beast AI — Risk scoring engine
 *
 * Scores each incoming event and returns:
 *   riskScore        0–100 integer
 *   riskLevel        'low' | 'medium' | 'high' | 'critical'
 *   riskReason       Human-readable explanation
 *   recommendedAction  What to do about it
 */

'use strict';

// ── Risk level thresholds ─────────────────────────────────────
const LEVELS = [
  { min: 75, level: 'critical', label: 'Critical' },
  { min: 50, level: 'high',     label: 'High' },
  { min: 25, level: 'medium',   label: 'Medium' },
  { min: 0,  level: 'low',      label: 'Low' },
];

// ── Per-event-type base scores ────────────────────────────────
const BASE_SCORES = {
  // Errors
  js_error:           30,
  console_error:      20,
  failed_resource:    15,

  // Behavioural anomalies
  rapid_clicks:       40,
  rapid_form_submit:  55,

  // Performance
  performance:        10,   // adjusted further by load time

  // Session signals
  page_visible:        5,
  page_hidden:         5,
  online:              5,
  offline:             5,

  // Standard telemetry (just tracking — very low risk)
  page_view:           5,
  session_start:       5,
  heartbeat:           5,
};

// ── Modifier rules ────────────────────────────────────────────
// Each rule receives the full event payload and returns a delta (positive or negative).

const MODIFIERS = [
  // JS error on a sensitive path raises the score
  {
    name: 'error_on_sensitive_path',
    apply(event) {
      if (event.type !== 'js_error') return 0;
      const page = (event.page || '').toLowerCase();
      const sensitivePatterns = ['/login', '/checkout', '/payment', '/admin', '/account'];
      return sensitivePatterns.some(p => page.includes(p)) ? 20 : 0;
    },
  },

  // Rapid clicks with very high count (possible bot or frustration)
  {
    name: 'extreme_rapid_clicks',
    apply(event) {
      if (event.type !== 'rapid_clicks') return 0;
      const count = event.data?.count || 0;
      if (count >= 30) return 30;
      if (count >= 15) return 15;
      return 0;
    },
  },

  // Multiple rapid form submissions (brute-force / spam indicator)
  {
    name: 'extreme_rapid_forms',
    apply(event) {
      if (event.type !== 'rapid_form_submit') return 0;
      const count = event.data?.count || 0;
      if (count >= 10) return 30;
      if (count >= 5)  return 15;
      return 0;
    },
  },

  // Extremely slow page load (> 8s) may indicate large payloads / abuse
  {
    name: 'very_slow_load',
    apply(event) {
      if (event.type !== 'performance') return 0;
      const loadTime = event.data?.loadTime || 0;
      if (loadTime > 8000) return 25;
      if (loadTime > 4000) return 10;
      return 0;
    },
  },

  // Multiple JS errors in a single event (stack frames or batch)
  {
    name: 'multiple_js_errors',
    apply(event) {
      if (event.type !== 'js_error') return 0;
      const count = event.data?.count || 1;
      return count > 3 ? 15 : 0;
    },
  },

  // Unknown / missing user agent (bot signal)
  {
    name: 'missing_user_agent',
    apply(event) {
      const ua = event.userAgent || '';
      return (!ua || ua === 'unknown') ? 20 : 0;
    },
  },

  // Headless browser signals in UA
  {
    name: 'headless_browser',
    apply(event) {
      const ua = (event.userAgent || '').toLowerCase();
      const headlessPatterns = ['headless', 'phantomjs', 'selenium', 'webdriver'];
      return headlessPatterns.some(p => ua.includes(p)) ? 40 : 0;
    },
  },
];

// ── Recommended actions per level ────────────────────────────
const ACTIONS = {
  low:      'No action required — monitor normally.',
  medium:   'Review this event in the dashboard.',
  high:     "Investigate this visitor's activity. Consider adding a CAPTCHA or rate-limit on the affected page.",
  critical: 'Immediate review required. Consider blocking this visitor or alerting your security team.',
};

// ── Reason builders ───────────────────────────────────────────
const REASONS = {
  js_error:           (e) => `JavaScript error detected: ${e.data?.message || 'unknown error'}`,
  console_error:      ()  => 'Console error captured on the page.',
  failed_resource:    (e) => `Failed to load resource: ${e.data?.src || 'unknown'}`,
  rapid_clicks:       (e) => `Abnormal click rate detected (${e.data?.count || '?'} clicks in ${e.data?.windowMs || '?'}ms).`,
  rapid_form_submit:  (e) => `Rapid form submissions detected (${e.data?.count || '?'} submissions).`,
  performance:        (e) => `Page load time: ${e.data?.loadTime || '?'}ms.`,
  page_view:          ()  => 'Visitor viewed a page.',
  session_start:      ()  => 'New session started.',
  heartbeat:          ()  => 'Session heartbeat.',
  page_visible:       ()  => 'Page became visible.',
  page_hidden:        ()  => 'Page was hidden.',
  online:             ()  => 'Visitor came back online.',
  offline:            ()  => 'Visitor went offline.',
};

/**
 * Score an event payload.
 * @param {object} event — raw event from the SDK
 * @returns {{ riskScore, riskLevel, riskReason, recommendedAction }}
 */
function score(event) {
  const type = event.type || 'unknown';

  // Base score
  let total = BASE_SCORES[type] ?? 10;

  // Apply modifiers
  const appliedModifiers = [];
  for (const mod of MODIFIERS) {
    const delta = mod.apply(event);
    if (delta !== 0) {
      total += delta;
      appliedModifiers.push(mod.name);
    }
  }

  // Clamp to 0–100
  const riskScore = Math.max(0, Math.min(100, total));

  // Determine level
  const { level: riskLevel } = LEVELS.find(l => riskScore >= l.min) || LEVELS[LEVELS.length - 1];

  // Build reason
  const reasonFn   = REASONS[type] || (() => `Event type: ${type}`);
  let riskReason   = reasonFn(event);
  if (appliedModifiers.length) {
    riskReason += ` [+modifiers: ${appliedModifiers.join(', ')}]`;
  }

  const recommendedAction = ACTIONS[riskLevel];

  return { riskScore, riskLevel, riskReason, recommendedAction };
}

module.exports = { score };
