/**
 * server/services/riskEngine.js
 * Beast AI v2 — Enhanced risk scoring engine
 *
 * Returns: { riskScore, riskLevel, riskReason, recommendedAction, detectedThreats[] }
 */

'use strict';

const LEVELS = [
  { min: 75, level: 'critical', label: 'Critical' },
  { min: 50, level: 'high',     label: 'High' },
  { min: 25, level: 'medium',   label: 'Medium' },
  { min: 0,  level: 'low',      label: 'Low' },
];

const BASE_SCORES = {
  // Standard telemetry
  page_view:          5,
  session_start:      5,
  heartbeat:          5,
  page_visible:       5,
  page_hidden:        5,
  online:             5,
  offline:            5,

  // Errors
  js_error:           30,
  console_error:      20,
  failed_resource:    15,

  // Behavioural
  rapid_clicks:       40,
  rapid_form_submit:  55,
  performance:        10,

  // Security detections (v2)
  sql_injection:      90,
  xss_attempt:        85,
  path_traversal:     80,
  suspicious_url:     60,
  brute_force:        85,
  request_flood:      70,
  bot_detected:       65,
  headless_browser:   75,
  devtools_open:      50,
  js_tampering:       70,
  selenium_detected:  85,
  playwright_detected:85,
  puppeteer_detected: 85,
  csrf_attempt:       80,
  suspicious_input:   60,
};

// ── Threat detection patterns ──────────────────────────────────

const SQL_PATTERNS = [
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE|TRUNCATE|EXEC|EXECUTE)\b)/i,
  /(--|;|\/\*|\*\/|xp_|sp_)/,
  /(\bOR\b\s+['"]?\d+['"]?\s*=\s*['"]?\d+['"]?)/i,
  /(\bAND\b\s+['"]?\d+['"]?\s*=\s*['"]?\d+['"]?)/i,
  /'.*\bOR\b.*'|"\s*OR\s*"/i,
  /SLEEP\s*\(|BENCHMARK\s*\(/i,
  /INFORMATION_SCHEMA|SYS\.TABLES|SYSOBJECTS/i,
];

const XSS_PATTERNS = [
  /<script[\s\S]*?>[\s\S]*?<\/script>/i,
  /<[^>]+\s+on\w+\s*=/i,
  /javascript\s*:/i,
  /data\s*:\s*text\/html/i,
  /vbscript\s*:/i,
  /<iframe[\s\S]*?>/i,
  /<object[\s\S]*?>/i,
  /document\.(cookie|write|location)/i,
  /eval\s*\(/i,
  /alert\s*\(|prompt\s*\(|confirm\s*\(/i,
  /&#x[0-9a-f]+;|&#\d+;/i,
  /expression\s*\(/i,
];

const PATH_TRAVERSAL_PATTERNS = [
  /\.\.\//,
  /\.\.%2F/i,
  /%2e%2e%2f/i,
  /\.\.\\/,
  /%252e%252e/i,
  /\/etc\/passwd/i,
  /\/etc\/shadow/i,
  /\/proc\/self/i,
  /\/windows\/system32/i,
  /\/boot\.ini/i,
];

const SUSPICIOUS_URL_PATTERNS = [
  /\/admin(?:\/|$)/i,
  /\/wp-admin/i,
  /\/\.git\//,
  /\/\.env/,
  /\/config\.(php|json|xml|yml)/i,
  /\/(shell|cmd|exec|command)\./i,
  /phpmyadmin/i,
  /\/xmlrpc\.php/i,
  /\/cgi-bin\//i,
];

const HEADLESS_UA_PATTERNS = [
  /headlesschrome/i,
  /phantomjs/i,
  /selenium/i,
  /webdriver/i,
  /puppeteer/i,
  /playwright/i,
  /nightmarejs/i,
  /casperjs/i,
  /zombie/i,
  /jsdom/i,
];

const BOT_UA_PATTERNS = [
  /googlebot|bingbot|slurp|duckduckbot|baiduspider|yandexbot/i,
  /crawler|spider|scraper|bot\b/i,
  /wget|curl\/|python-requests|go-http|java\/|libwww/i,
  /\bbot\b|\bscanner\b|\bscan\b/i,
];

// ── Detection functions ────────────────────────────────────────

function detectSqlInjection(text) {
  if (!text || typeof text !== 'string') return false;
  return SQL_PATTERNS.some(p => p.test(text));
}

function detectXss(text) {
  if (!text || typeof text !== 'string') return false;
  return XSS_PATTERNS.some(p => p.test(text));
}

function detectPathTraversal(text) {
  if (!text || typeof text !== 'string') return false;
  return PATH_TRAVERSAL_PATTERNS.some(p => p.test(text));
}

function detectSuspiciousUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return SUSPICIOUS_URL_PATTERNS.some(p => p.test(url));
}

function detectHeadlessBrowser(ua) {
  if (!ua || typeof ua !== 'string') return false;
  return HEADLESS_UA_PATTERNS.some(p => p.test(ua));
}

function detectBot(ua) {
  if (!ua || typeof ua !== 'string') return true; // no UA = likely bot
  return BOT_UA_PATTERNS.some(p => p.test(ua));
}

function detectSelenium(ua, data) {
  if (!ua) return false;
  if (/selenium|webdriver/i.test(ua)) return true;
  if (data?.webdriverPresent) return true;
  return false;
}

function detectPlaywright(ua, data) {
  if (!ua) return false;
  if (/playwright/i.test(ua)) return true;
  if (data?.playwrightDetected) return true;
  return false;
}

function detectPuppeteer(ua, data) {
  if (!ua) return false;
  if (/puppeteer/i.test(ua)) return true;
  if (data?.puppeteerDetected) return true;
  return false;
}

// ── Modifiers ──────────────────────────────────────────────────

const MODIFIERS = [
  {
    name: 'error_on_sensitive_path',
    apply(event) {
      if (event.type !== 'js_error') return 0;
      const page = (event.page || '').toLowerCase();
      const sensitive = ['/login', '/checkout', '/payment', '/admin', '/account', '/password', '/signup'];
      return sensitive.some(p => page.includes(p)) ? 20 : 0;
    },
  },
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
  {
    name: 'very_slow_load',
    apply(event) {
      if (event.type !== 'performance') return 0;
      const t = event.data?.loadTime || 0;
      if (t > 8000) return 25;
      if (t > 4000) return 10;
      return 0;
    },
  },
  {
    name: 'missing_user_agent',
    apply(event) {
      const ua = event.userAgent || event.data?.userAgent || '';
      return (!ua || ua === 'unknown') ? 25 : 0;
    },
  },
  {
    name: 'headless_ua',
    apply(event) {
      const ua = event.userAgent || event.data?.userAgent || '';
      return detectHeadlessBrowser(ua) ? 40 : 0;
    },
  },
  {
    name: 'bot_ua',
    apply(event) {
      const ua = event.userAgent || event.data?.userAgent || '';
      if (!ua) return 0; // handled by missing_user_agent
      return detectBot(ua) ? 30 : 0;
    },
  },
  {
    name: 'suspicious_page_url',
    apply(event) {
      const url = event.page || '';
      return detectSuspiciousUrl(url) ? 25 : 0;
    },
  },
  {
    name: 'suspicious_referrer',
    apply(event) {
      const ref = event.referrer || '';
      if (!ref) return 0;
      const suspiciousDomains = ['pastebin.com', 'pastecode.io', 'hastebin.com'];
      return suspiciousDomains.some(d => ref.includes(d)) ? 15 : 0;
    },
  },
  {
    name: 'input_threats',
    apply(event) {
      const inputs = (event.data?.inputs || []).concat([
        event.data?.value || '',
        event.data?.query || '',
      ]);
      let delta = 0;
      for (const input of inputs) {
        if (typeof input !== 'string') continue;
        if (detectSqlInjection(input)) { delta += 50; break; }
        if (detectXss(input))           { delta += 45; break; }
        if (detectPathTraversal(input)) { delta += 40; break; }
      }
      return delta;
    },
  },
];

const ACTIONS = {
  low:      'No action required — monitor normally.',
  medium:   'Review this event in the dashboard.',
  high:     "Investigate this visitor's activity. Consider adding a CAPTCHA or rate-limit.",
  critical: 'Immediate action required. Consider blocking this visitor or IP address.',
};

// ── Main scoring function ──────────────────────────────────────

function scoreEvent(event) {
  const ua   = event.userAgent || event.data?.userAgent || '';
  const data = event.data || {};
  const page = event.page || '';

  // ── Automatic threat detection from event type ──
  const detectedThreats = [];

  // Check for known security event types first
  const securityTypes = [
    'sql_injection', 'xss_attempt', 'path_traversal', 'suspicious_url',
    'brute_force', 'request_flood', 'bot_detected', 'headless_browser',
    'devtools_open', 'js_tampering', 'selenium_detected',
    'playwright_detected', 'puppeteer_detected', 'csrf_attempt', 'suspicious_input',
  ];

  if (securityTypes.includes(event.type)) {
    detectedThreats.push(event.type);
  }

  // Auto-detect from UA and page
  if (detectSelenium(ua, data))   detectedThreats.push('selenium_detected');
  if (detectPlaywright(ua, data)) detectedThreats.push('playwright_detected');
  if (detectPuppeteer(ua, data))  detectedThreats.push('puppeteer_detected');
  if (detectHeadlessBrowser(ua))  detectedThreats.push('headless_browser');
  if (detectBot(ua) && ua)        detectedThreats.push('bot_detected');
  if (detectSuspiciousUrl(page))  detectedThreats.push('suspicious_url');

  // Check inputs for injection attacks
  const inputs = (data.inputs || []).concat([data.value || '', data.query || '']);
  for (const input of inputs) {
    if (typeof input !== 'string') continue;
    if (detectSqlInjection(input)) { detectedThreats.push('sql_injection'); break; }
    if (detectXss(input))           { detectedThreats.push('xss_attempt');  break; }
    if (detectPathTraversal(input)) { detectedThreats.push('path_traversal'); break; }
  }

  // ── Base score ──
  // Use the highest base score from detected threats + event type
  let base = BASE_SCORES[event.type] || 10;
  for (const threat of detectedThreats) {
    const threatBase = BASE_SCORES[threat] || 0;
    if (threatBase > base) base = threatBase;
  }

  // ── Apply modifiers ──
  let delta = 0;
  for (const mod of MODIFIERS) {
    delta += mod.apply(event);
  }

  const rawScore = base + delta;
  const riskScore = Math.min(100, Math.max(0, rawScore));

  // ── Determine level ──
  const { level: riskLevel, label: riskLabel } = LEVELS.find(l => riskScore >= l.min);

  // ── Human-readable reason ──
  let riskReason;
  if (detectedThreats.length > 0) {
    const threatNames = [...new Set(detectedThreats)]
      .map(t => t.replace(/_/g, ' '))
      .join(', ');
    riskReason = `Detected: ${threatNames}.`;
  } else {
    riskReason = `Event type "${event.type}" scored ${riskScore}/100 (base: ${base}, modifiers: ${delta > 0 ? '+' : ''}${delta}).`;
  }

  return {
    riskScore,
    riskLevel,
    riskLabel,
    riskReason,
    recommendedAction: ACTIONS[riskLevel],
    detectedThreats: [...new Set(detectedThreats)],
  };
}

module.exports = {
  scoreEvent,
  detectSqlInjection,
  detectXss,
  detectPathTraversal,
  detectSuspiciousUrl,
  detectHeadlessBrowser,
  detectBot,
};
