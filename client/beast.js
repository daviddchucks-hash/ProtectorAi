/**
 * Beast AI v2 — Client SDK
 * beast.js — Embeddable security monitoring and visitor tracking script
 *
 * Usage:
 *   Option A (simple):
 *     <script src="https://YOUR_RENDER_DOMAIN/beast.js"></script>
 *
 *   Option B (site-specific token):
 *     <script src="https://YOUR_RENDER_DOMAIN/beast.js?token=tok_xxx"></script>
 *
 *   Option C (manual):
 *     <script>window.BEAST_SITE_TOKEN = 'tok_xxx';</script>
 *     <script src="https://YOUR_RENDER_DOMAIN/beast.js"></script>
 *
 * Auto-initialises on load. Zero dependencies.
 * Beast AI v2.0.0
 */

(function (window, document, navigator) {
  'use strict';

  // ── Configuration ─────────────────────────────────────────────
  var BACKEND_URL  = window.BEAST_AI_URL    || '%%BEAST_BACKEND_URL%%';
  var SITE_TOKEN   = window.BEAST_SITE_TOKEN || '%%BEAST_SITE_TOKEN%%' || '';
  var API_ENDPOINT = BACKEND_URL.replace(/\/$/, '') + '/api/events';
  var VERSION      = '2.0.0';

  // Behavioural thresholds
  var CLICK_WINDOW_MS    = 3000;
  var CLICK_THRESHOLD    = 10;
  var FORM_WINDOW_MS     = 5000;
  var FORM_THRESHOLD     = 3;
  var HEARTBEAT_INTERVAL = 30000;
  var RETRY_DELAYS       = [1000, 3000, 8000];
  var MAX_PAGES_TRACKED  = 50;

  // ── State ──────────────────────────────────────────────────────
  var _visitorId    = _getOrCreateVisitorId();
  var _sessionId    = _generateId('ses');
  var _clickTimes   = [];
  var _formTimes    = [];
  var _sessionStart = Date.now();
  var _heartbeatTimer;
  var _pagesVisited = _loadPagesVisited();
  var _requestCount = 0;
  var _requestWindow = Date.now();
  var _devtoolsOpen = false;

  // ── Fingerprint ───────────────────────────────────────────────
  var _fp = _collectFingerprint();

  // ── Public API ────────────────────────────────────────────────
  window.BeastAI = {
    track:     _sendEvent,
    visitorId: _visitorId,
    sessionId: _sessionId,
    version:   VERSION,
  };

  // ── Initialise ────────────────────────────────────────────────
  _init();

  // ─────────────────────────────────────────────────────────────
  //  CORE
  // ─────────────────────────────────────────────────────────────

  function _init() {
    _trackCurrentPage();
    _attachEventListeners();
    _startHeartbeat();
    _detectDevTools();
    _detectHeadlessBrowser();
    _detectAutomation();
    _trackRequestFlood();
    _sendEvent('session_start', { sessionStart: new Date(_sessionStart).toISOString() });
  }

  function _sendEvent(type, data) {
    var payload = {
      type:      type,
      visitorId: _visitorId,
      sessionId: _sessionId,

      // Page context
      page:     _safeHref(),
      referrer: document.referrer || '',
      title:    document.title   || '',

      // Fingerprint
      browser:        _fp.browser,
      browserVersion: _fp.browserVersion,
      os:             _fp.os,
      device:         _fp.device,
      screen:         _fp.screen,
      language:       _fp.language,
      timezone:       _fp.timezone,
      platform:       _fp.platform,
      userAgent:      _fp.userAgent,

      // Session context
      pagesVisited: _pagesVisited,
      isNew:        _isNewVisitor(),

      // Payload
      data: data || {},
    };

    // Attach site token if available
    _postWithRetry(payload, 0);
  }

  function _postWithRetry(payload, attempt) {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', API_ENDPOINT, true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      if (SITE_TOKEN) xhr.setRequestHeader('X-Beast-Site-Token', SITE_TOKEN);
      xhr.timeout = 10000;

      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        if (xhr.status < 200 || xhr.status >= 300) {
          if (attempt < RETRY_DELAYS.length) {
            setTimeout(function () { _postWithRetry(payload, attempt + 1); }, RETRY_DELAYS[attempt]);
          }
        }
      };
      xhr.ontimeout = function () {
        if (attempt < RETRY_DELAYS.length) {
          setTimeout(function () { _postWithRetry(payload, attempt + 1); }, RETRY_DELAYS[attempt]);
        }
      };

      xhr.send(JSON.stringify(payload));
    } catch (_) { /* swallow */ }
  }

  // ─────────────────────────────────────────────────────────────
  //  PAGE TRACKING
  // ─────────────────────────────────────────────────────────────

  function _trackCurrentPage() {
    var page = _safeHref();
    if (!page) return;
    if (_pagesVisited.indexOf(page) === -1) {
      _pagesVisited.push(page);
      if (_pagesVisited.length > MAX_PAGES_TRACKED) _pagesVisited.shift();
      _savePagesVisited(_pagesVisited);
    }
    _sendEvent('page_view', { page: page });
  }

  function _loadPagesVisited() {
    try {
      var stored = localStorage.getItem('_bai_pages');
      return stored ? JSON.parse(stored) : [];
    } catch (_) { return []; }
  }

  function _savePagesVisited(pages) {
    try { localStorage.setItem('_bai_pages', JSON.stringify(pages)); } catch (_) {}
  }

  function _isNewVisitor() {
    try { return !localStorage.getItem('_bai_seen'); } catch (_) { return true; }
  }

  // ─────────────────────────────────────────────────────────────
  //  EVENT LISTENERS
  // ─────────────────────────────────────────────────────────────

  function _attachEventListeners() {
    // Rapid click detection
    document.addEventListener('click', function () {
      var now = Date.now();
      _clickTimes = _clickTimes.filter(function (t) { return now - t < CLICK_WINDOW_MS; });
      _clickTimes.push(now);
      if (_clickTimes.length >= CLICK_THRESHOLD) {
        _sendEvent('rapid_clicks', { count: _clickTimes.length, window: CLICK_WINDOW_MS });
        _clickTimes = [];
      }
    }, true);

    // Form submission flood detection
    document.addEventListener('submit', function (e) {
      var now = Date.now();
      _formTimes = _formTimes.filter(function (t) { return now - t < FORM_WINDOW_MS; });
      _formTimes.push(now);

      // Scan form inputs for injection patterns
      var form = e.target;
      if (form && form.elements) {
        var inputs = [];
        for (var i = 0; i < form.elements.length; i++) {
          var el = form.elements[i];
          if (el.value && typeof el.value === 'string') inputs.push(el.value);
        }
        if (inputs.length) {
          _checkInputsForThreats(inputs);
        }
      }

      if (_formTimes.length >= FORM_THRESHOLD) {
        _sendEvent('rapid_form_submit', { count: _formTimes.length, window: FORM_WINDOW_MS });
        _formTimes = [];
      }
    }, true);

    // JS error tracking
    window.addEventListener('error', function (e) {
      _sendEvent('js_error', {
        message:  e.message || 'unknown error',
        filename: e.filename || '',
        line:     e.lineno  || 0,
        column:   e.colno   || 0,
        stack:    (e.error && e.error.stack) ? e.error.stack.slice(0, 500) : '',
      });
    });

    // Unhandled promise rejections
    window.addEventListener('unhandledrejection', function (e) {
      _sendEvent('js_error', {
        message: 'Unhandled promise rejection: ' + (e.reason ? String(e.reason).slice(0, 200) : 'unknown'),
        type:    'unhandledrejection',
      });
    });

    // Resource load failures
    window.addEventListener('error', function (e) {
      if (e.target && e.target.tagName && e.target !== window) {
        _sendEvent('failed_resource', {
          tag:  e.target.tagName,
          src:  (e.target.src || e.target.href || '').slice(0, 500),
        });
      }
    }, true);

    // Page visibility
    document.addEventListener('visibilitychange', function () {
      _sendEvent(document.hidden ? 'page_hidden' : 'page_visible', {});
    });

    // Online/offline
    window.addEventListener('online',  function () { _sendEvent('online',  {}); });
    window.addEventListener('offline', function () { _sendEvent('offline', {}); });

    // Suspicious URL navigation (path traversal, suspicious paths)
    window.addEventListener('hashchange', function () { _checkUrlForThreats(_safeHref()); });
    window.addEventListener('popstate',   function () { _checkUrlForThreats(_safeHref()); });

    // Performance
    window.addEventListener('load', function () {
      setTimeout(function () {
        try {
          var perf = window.performance;
          if (perf && perf.timing) {
            var t      = perf.timing;
            var loadTime = t.loadEventEnd - t.navigationStart;
            if (loadTime > 0) {
              _sendEvent('performance', {
                loadTime: loadTime,
                dnsTime:  t.domainLookupEnd - t.domainLookupStart,
                ttfb:     t.responseStart   - t.navigationStart,
                domReady: t.domContentLoadedEventEnd - t.navigationStart,
              });
            }
          }
        } catch (_) {}
      }, 100);
    });

    // Track visited history after first pageview
    try {
      var original_pushState = history.pushState;
      history.pushState = function () {
        original_pushState.apply(history, arguments);
        _trackCurrentPage();
      };
    } catch (_) {}
  }

  // ─────────────────────────────────────────────────────────────
  //  THREAT DETECTION
  // ─────────────────────────────────────────────────────────────

  function _checkInputsForThreats(inputs) {
    var sqlPattern = /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|EXEC)\b|--|'.*OR.*'|SLEEP\s*\(|BENCHMARK\s*\()/i;
    var xssPattern = /(<script|javascript:|data:text\/html|on\w+\s*=|<iframe|<object|eval\s*\(|document\.cookie)/i;
    var pathPattern = /(\.\.\/)|(\.\.%2F)|(%2e%2e)|\/etc\/passwd|\/windows\/system32/i;

    for (var i = 0; i < inputs.length; i++) {
      var val = inputs[i];
      if (sqlPattern.test(val)) {
        _sendEvent('sql_injection', { value: val.slice(0, 200), source: 'form_input' });
        return;
      }
      if (xssPattern.test(val)) {
        _sendEvent('xss_attempt', { value: val.slice(0, 200), source: 'form_input' });
        return;
      }
      if (pathPattern.test(val)) {
        _sendEvent('path_traversal', { value: val.slice(0, 200), source: 'form_input' });
        return;
      }
    }
  }

  function _checkUrlForThreats(url) {
    if (!url) return;
    var suspiciousUrlPattern = /(\/admin|\/wp-admin|\/\.git\/|\/\.env|phpmyadmin|\/cgi-bin\/|\/xmlrpc\.php)/i;
    var pathPattern = /(\.\.\/)|(\.\.%2F)|\/etc\/passwd/i;

    if (pathPattern.test(url)) {
      _sendEvent('path_traversal', { value: url.slice(0, 300), source: 'url' });
    } else if (suspiciousUrlPattern.test(url)) {
      _sendEvent('suspicious_url', { value: url.slice(0, 300), source: 'url' });
    }
  }

  // ─────────────────────────────────────────────────────────────
  //  BOT / AUTOMATION DETECTION
  // ─────────────────────────────────────────────────────────────

  function _detectHeadlessBrowser() {
    try {
      var ua = navigator.userAgent || '';
      var headlessSignals = [
        /headlesschrome/i,
        /phantomjs/i,
        /selenium/i,
      ];
      for (var i = 0; i < headlessSignals.length; i++) {
        if (headlessSignals[i].test(ua)) {
          _sendEvent('headless_browser', { ua: ua.slice(0, 300), signal: 'user_agent' });
          return;
        }
      }

      // Chrome without plugins is often headless
      if (/chrome/i.test(ua) && navigator.plugins && navigator.plugins.length === 0) {
        _sendEvent('headless_browser', { ua: ua.slice(0, 300), signal: 'no_plugins' });
      }
    } catch (_) {}
  }

  function _detectAutomation() {
    try {
      var signals = [];

      // WebDriver flag
      if (navigator.webdriver) signals.push('webdriver');

      // Selenium detection
      if (window.__selenium_unwrapped || window._selenium || window.callSelenium || window._Selenium_IDE_Recorder) {
        signals.push('selenium');
      }

      // Playwright detection
      if (window.__playwright || window.__pw_manual) signals.push('playwright');

      // Puppeteer / CDP
      if (window.__puppeteer_evaluation_script) signals.push('puppeteer');

      // Phantom
      if (window.callPhantom || window._phantom) signals.push('phantom');

      if (signals.length > 0) {
        var type = signals.includes('selenium')   ? 'selenium_detected'
                 : signals.includes('playwright') ? 'playwright_detected'
                 : signals.includes('puppeteer')  ? 'puppeteer_detected'
                 : 'headless_browser';
        _sendEvent(type, { signals: signals, webdriverPresent: !!navigator.webdriver });
      }
    } catch (_) {}
  }

  function _detectDevTools() {
    // DevTools width/height threshold detection
    var threshold = 160;
    var check = function () {
      var widthDiff  = window.outerWidth  - window.innerWidth;
      var heightDiff = window.outerHeight - window.innerHeight;
      var isOpen = widthDiff > threshold || heightDiff > threshold;
      if (isOpen && !_devtoolsOpen) {
        _devtoolsOpen = true;
        _sendEvent('devtools_open', { widthDiff: widthDiff, heightDiff: heightDiff });
      } else if (!isOpen && _devtoolsOpen) {
        _devtoolsOpen = false;
      }
    };
    setInterval(check, 1000);

    // Console timing trick
    var el = new Image();
    Object.defineProperty(el, 'id', {
      get: function () {
        _sendEvent('devtools_open', { method: 'console_timing' });
      }
    });
    // Only trigger when devtools console is actually open
    try { console.log('%c', el); } catch (_) {}
  }

  function _trackRequestFlood() {
    var originalXHR = window.XMLHttpRequest;
    var originalFetch = window.fetch;

    // Wrap XHR
    try {
      window.XMLHttpRequest = function () {
        var xhr = new originalXHR();
        var _originalOpen = xhr.open;
        xhr.open = function (method, url) {
          _countRequest(url);
          return _originalOpen.apply(xhr, arguments);
        };
        return xhr;
      };
      window.XMLHttpRequest.prototype = originalXHR.prototype;
    } catch (_) {}

    // Wrap fetch
    try {
      window.fetch = function (url) {
        _countRequest(url);
        return originalFetch.apply(window, arguments);
      };
    } catch (_) {}
  }

  function _countRequest(url) {
    var now = Date.now();
    if (now - _requestWindow > 10000) {
      _requestCount = 0;
      _requestWindow = now;
    }
    _requestCount++;
    if (_requestCount > 50) {
      _sendEvent('request_flood', { count: _requestCount, window: 10000, url: String(url || '').slice(0, 200) });
      _requestCount = 0; // Reset to avoid spamming
    }
  }

  // ─────────────────────────────────────────────────────────────
  //  HEARTBEAT
  // ─────────────────────────────────────────────────────────────

  function _startHeartbeat() {
    _heartbeatTimer = setInterval(function () {
      _sendEvent('heartbeat', {
        sessionDuration: Math.floor((Date.now() - _sessionStart) / 1000),
        pagesVisited: _pagesVisited.length,
      });
    }, HEARTBEAT_INTERVAL);
  }

  // ─────────────────────────────────────────────────────────────
  //  FINGERPRINT
  // ─────────────────────────────────────────────────────────────

  function _collectFingerprint() {
    var ua = navigator.userAgent || '';
    return {
      browser:        _detectBrowser(ua),
      browserVersion: _detectBrowserVersion(ua),
      os:             _detectOS(ua),
      device:         _detectDevice(ua),
      screen:         screen.width + 'x' + screen.height,
      language:       navigator.language || navigator.userLanguage || 'unknown',
      timezone:       _getTimezone(),
      platform:       navigator.platform || 'unknown',
      userAgent:      ua,
    };
  }

  function _detectBrowser(ua) {
    if (/Edg\//.test(ua))          return 'Edge';
    if (/OPR\/|Opera/.test(ua))   return 'Opera';
    if (/Firefox\//.test(ua))     return 'Firefox';
    if (/SamsungBrowser/.test(ua)) return 'Samsung';
    if (/Chrome\//.test(ua))      return 'Chrome';
    if (/Safari\//.test(ua))      return 'Safari';
    if (/MSIE|Trident\//.test(ua)) return 'IE';
    return 'Unknown';
  }

  function _detectBrowserVersion(ua) {
    var m = ua.match(/(Chrome|Firefox|Safari|Edge|OPR|MSIE|rv)[\/: ]([\d.]+)/i);
    return m ? m[2] : 'unknown';
  }

  function _detectOS(ua) {
    if (/Windows NT 10/.test(ua))  return 'Windows 10';
    if (/Windows NT 11/.test(ua))  return 'Windows 11';
    if (/Windows/.test(ua))        return 'Windows';
    if (/Mac OS X/.test(ua))       return 'macOS';
    if (/iPhone|iPad/.test(ua))    return 'iOS';
    if (/Android/.test(ua))        return 'Android';
    if (/Linux/.test(ua))          return 'Linux';
    if (/CrOS/.test(ua))           return 'Chrome OS';
    return 'Unknown';
  }

  function _detectDevice(ua) {
    if (/Mobile|Android|iPhone/.test(ua)) return 'Mobile';
    if (/Tablet|iPad/.test(ua))           return 'Tablet';
    return 'Desktop';
  }

  function _getTimezone() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown'; }
    catch (_) { return 'unknown'; }
  }

  // ─────────────────────────────────────────────────────────────
  //  VISITOR ID
  // ─────────────────────────────────────────────────────────────

  function _getOrCreateVisitorId() {
    try {
      var stored = localStorage.getItem('_bai_vid');
      if (stored) return stored;
      var id = _generateId('vis');
      localStorage.setItem('_bai_vid', id);
      localStorage.setItem('_bai_seen', '1');
      return id;
    } catch (_) { return _generateId('vis'); }
  }

  // ─────────────────────────────────────────────────────────────
  //  UTILITIES
  // ─────────────────────────────────────────────────────────────

  function _generateId(prefix) {
    var rand = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
    return (prefix || 'id') + '_' + Date.now() + '_' + rand;
  }

  function _safeHref() {
    try { return window.location.href; } catch (_) { return ''; }
  }

})(window, document, navigator);
