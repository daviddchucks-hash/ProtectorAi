/**
 * Beast AI v1 — Client SDK
 * beast.js — Embeddable security monitoring script
 *
 * Usage: <script src="https://YOUR_RENDER_DOMAIN/beast.js"></script>
 *
 * Auto-initialises on load. Zero dependencies.
 * Collects browser telemetry and sends security events to the Beast AI backend.
 */

(function (window, document) {
  'use strict';

  // ── Configuration ─────────────────────────────────────────────
  // The backend URL is injected at serve time (see server/app.js).
  // During local dev, override via: window.BEAST_AI_URL = 'http://localhost:3000'
  var BACKEND_URL = window.BEAST_AI_URL || '%%BEAST_BACKEND_URL%%';
  var ENDPOINT    = BACKEND_URL.replace(/\/$/, '') + '/api/events';
  var SITE_ID     = window.BEAST_SITE_ID || _deriveSiteId();

  // Behavioural thresholds
  var CLICK_WINDOW_MS      = 3000;   // detect rapid clicks in this window
  var CLICK_THRESHOLD      = 10;     // clicks within window = rapid
  var FORM_WINDOW_MS       = 5000;
  var FORM_THRESHOLD       = 3;
  var HEARTBEAT_INTERVAL   = 30000;  // send heartbeat every 30s
  var RETRY_DELAYS         = [1000, 3000, 8000]; // retry backoff in ms

  // ── State ──────────────────────────────────────────────────────
  var _visitorId   = _getOrCreateVisitorId();
  var _sessionId   = _generateId('ses');
  var _clickTimes  = [];
  var _formTimes   = [];
  var _sessionStart = Date.now();
  var _heartbeatTimer;

  // ── Fingerprint (collected once at init) ──────────────────────
  var _fp = _collectFingerprint();

  // ── Public API ────────────────────────────────────────────────
  window.BeastAI = {
    track:     _sendEvent,
    visitorId: _visitorId,
    sessionId: _sessionId,
    version:   '1.0.0',
  };

  // ── Initialise ────────────────────────────────────────────────
  _init();

  // ─────────────────────────────────────────────────────────────
  //  CORE: send an event
  // ─────────────────────────────────────────────────────────────

  /**
   * Build and send a security event to the backend.
   * @param {string} type    — Event type (e.g. 'js_error', 'rapid_clicks')
   * @param {object} [data]  — Event-specific payload
   */
  function _sendEvent(type, data) {
    var payload = {
      type:       type,
      siteId:     SITE_ID,
      visitorId:  _visitorId,
      sessionId:  _sessionId,

      // Page context
      page:       window.location.href,
      referrer:   document.referrer || '',
      title:      document.title    || '',

      // Browser fingerprint
      browser:    _fp.browser,
      os:         _fp.os,
      device:     _fp.device,
      screen:     _fp.screen,
      language:   _fp.language,
      timezone:   _fp.timezone,
      platform:   _fp.platform,

      // Event payload
      data: data || {},
    };

    _postWithRetry(payload, 0);
  }

  /**
   * POST payload to the backend with automatic retry on failure.
   * @param {object} payload
   * @param {number} attempt — retry attempt index
   */
  function _postWithRetry(payload, attempt) {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', ENDPOINT, true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.setRequestHeader('X-Beast-Site-Id', SITE_ID);
      xhr.timeout = 10000;

      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        if (xhr.status >= 200 && xhr.status < 300) {
          // Success — no action needed
        } else if (attempt < RETRY_DELAYS.length) {
          // Retry on server error
          setTimeout(function () {
            _postWithRetry(payload, attempt + 1);
          }, RETRY_DELAYS[attempt]);
        }
      };

      xhr.ontimeout = function () {
        if (attempt < RETRY_DELAYS.length) {
          setTimeout(function () {
            _postWithRetry(payload, attempt + 1);
          }, RETRY_DELAYS[attempt]);
        }
      };

      xhr.send(JSON.stringify(payload));
    } catch (_) {
      // Silently fail — never break the host page
    }
  }

  // ─────────────────────────────────────────────────────────────
  //  INIT: wire all monitors
  // ─────────────────────────────────────────────────────────────

  function _init() {
    // Fire session start
    _sendEvent('session_start', {
      sessionId: _sessionId,
      ts: _sessionStart,
    });

    // Wire all monitors
    _monitorJsErrors();
    _monitorConsoleErrors();
    _monitorFailedResources();
    _monitorRapidClicks();
    _monitorRapidFormSubmissions();
    _monitorPagePerformance();
    _monitorOnlineStatus();
    _monitorPageVisibility();
    _monitorPageView();
    _startHeartbeat();
  }

  // ─────────────────────────────────────────────────────────────
  //  MONITORS
  // ─────────────────────────────────────────────────────────────

  /** Capture uncaught JavaScript errors */
  function _monitorJsErrors() {
    var _prev = window.onerror;
    window.onerror = function (message, source, lineno, colno, error) {
      _sendEvent('js_error', {
        message: String(message).slice(0, 500),
        source:  String(source  || '').slice(0, 300),
        lineno:  lineno  || 0,
        colno:   colno   || 0,
        stack:   error && error.stack ? String(error.stack).slice(0, 1000) : '',
      });
      if (typeof _prev === 'function') return _prev.apply(this, arguments);
      return false;
    };

    // Unhandled promise rejections
    window.addEventListener('unhandledrejection', function (e) {
      _sendEvent('js_error', {
        message: String(e.reason || 'Unhandled Promise rejection').slice(0, 500),
        type:    'unhandled_rejection',
      });
    });
  }

  /** Intercept console.error calls */
  function _monitorConsoleErrors() {
    var _origError = console.error;
    console.error = function () {
      try {
        var args = Array.prototype.slice.call(arguments);
        var msg  = args.map(function (a) {
          return typeof a === 'object' ? JSON.stringify(a) : String(a);
        }).join(' ').slice(0, 500);
        _sendEvent('console_error', { message: msg });
      } catch (_) { /* non-fatal */ }
      return _origError.apply(console, arguments);
    };
  }

  /** Detect failed resource loads (images, scripts, stylesheets) */
  function _monitorFailedResources() {
    window.addEventListener('error', function (e) {
      var target = e.target || e.srcElement;
      if (target && target !== window && (target.src || target.href)) {
        var src  = (target.src || target.href || '').slice(0, 500);
        var kind = target.tagName ? target.tagName.toLowerCase() : 'unknown';
        _sendEvent('failed_resource', { src: src, tagName: kind });
      }
    }, true /* capture phase */);
  }

  /** Detect rapid clicking (possible bot or frustrated user) */
  function _monitorRapidClicks() {
    document.addEventListener('click', function () {
      var now = Date.now();
      _clickTimes.push(now);
      // Keep only clicks within the window
      _clickTimes = _clickTimes.filter(function (t) { return now - t < CLICK_WINDOW_MS; });

      if (_clickTimes.length >= CLICK_THRESHOLD) {
        _sendEvent('rapid_clicks', {
          count:    _clickTimes.length,
          windowMs: CLICK_WINDOW_MS,
        });
        _clickTimes = []; // reset after alert
      }
    }, true);
  }

  /** Detect rapid form submissions */
  function _monitorRapidFormSubmissions() {
    document.addEventListener('submit', function (e) {
      var now  = Date.now();
      var form = e.target;
      _formTimes.push(now);
      _formTimes = _formTimes.filter(function (t) { return now - t < FORM_WINDOW_MS; });

      if (_formTimes.length >= FORM_THRESHOLD) {
        _sendEvent('rapid_form_submit', {
          count:    _formTimes.length,
          windowMs: FORM_WINDOW_MS,
          formId:   form && form.id   ? form.id   : '',
          formName: form && form.name ? form.name : '',
          action:   form && form.action ? String(form.action).slice(0, 300) : '',
        });
        _formTimes = [];
      }
    }, true);
  }

  /** Capture page load performance metrics */
  function _monitorPagePerformance() {
    function _send() {
      try {
        var perf = window.performance;
        if (!perf || !perf.timing) return;
        var t = perf.timing;
        var nav = perf.getEntriesByType && perf.getEntriesByType('navigation')[0];

        var loadTime    = nav ? Math.round(nav.loadEventEnd - nav.startTime)
                               : (t.loadEventEnd - t.navigationStart);
        var domReady    = nav ? Math.round(nav.domContentLoadedEventEnd - nav.startTime)
                               : (t.domContentLoadedEventEnd - t.navigationStart);
        var ttfb        = nav ? Math.round(nav.responseStart - nav.startTime)
                               : (t.responseStart - t.navigationStart);

        if (loadTime < 0) return; // page not fully loaded yet

        _sendEvent('performance', {
          loadTime:  loadTime  > 0 ? loadTime  : 0,
          domReady:  domReady  > 0 ? domReady  : 0,
          ttfb:      ttfb      > 0 ? ttfb      : 0,
        });
      } catch (_) { /* non-fatal */ }
    }

    if (document.readyState === 'complete') {
      _send();
    } else {
      window.addEventListener('load', function () {
        // Slight delay to ensure timing values are populated
        setTimeout(_send, 100);
      });
    }
  }

  /** Monitor online/offline status changes */
  function _monitorOnlineStatus() {
    window.addEventListener('online',  function () { _sendEvent('online');  });
    window.addEventListener('offline', function () { _sendEvent('offline'); });
  }

  /** Monitor page visibility changes (tab switch, minimise) */
  function _monitorPageVisibility() {
    document.addEventListener('visibilitychange', function () {
      var state = document.visibilityState || document.hidden ? 'hidden' : 'visible';
      _sendEvent(document.hidden ? 'page_hidden' : 'page_visible', {
        visibilityState: state,
      });
    });
  }

  /** Send a page view event */
  function _monitorPageView() {
    _sendEvent('page_view', {
      page:     window.location.href,
      referrer: document.referrer || '',
      title:    document.title    || '',
    });
  }

  /** Periodic heartbeat to confirm the session is still active */
  function _startHeartbeat() {
    _heartbeatTimer = setInterval(function () {
      _sendEvent('heartbeat', {
        sessionDuration: Math.round((Date.now() - _sessionStart) / 1000),
      });
    }, HEARTBEAT_INTERVAL);
  }

  // ─────────────────────────────────────────────────────────────
  //  FINGERPRINT: collect browser/OS/device info
  // ─────────────────────────────────────────────────────────────

  function _collectFingerprint() {
    var ua = navigator.userAgent || '';
    return {
      browser:  _detectBrowser(ua),
      os:       _detectOs(ua),
      device:   _detectDevice(ua),
      screen:   {
        width:  screen.width,
        height: screen.height,
        dpr:    window.devicePixelRatio || 1,
      },
      language: navigator.language || navigator.userLanguage || 'unknown',
      timezone: _getTimezone(),
      platform: navigator.platform || 'unknown',
    };
  }

  function _detectBrowser(ua) {
    if (/Edg\//.test(ua))              return 'Edge';
    if (/OPR\/|Opera/.test(ua))        return 'Opera';
    if (/Firefox\//.test(ua))          return 'Firefox';
    if (/Chrome\//.test(ua))           return 'Chrome';
    if (/Safari\//.test(ua))           return 'Safari';
    if (/MSIE|Trident/.test(ua))       return 'Internet Explorer';
    return 'Unknown';
  }

  function _detectOs(ua) {
    if (/Windows NT 10/.test(ua))      return 'Windows 10/11';
    if (/Windows NT 6/.test(ua))       return 'Windows 7/8';
    if (/Windows/.test(ua))            return 'Windows';
    if (/iPhone/.test(ua))             return 'iOS (iPhone)';
    if (/iPad/.test(ua))               return 'iOS (iPad)';
    if (/Android/.test(ua))            return 'Android';
    if (/Mac OS X/.test(ua))           return 'macOS';
    if (/Linux/.test(ua))              return 'Linux';
    return 'Unknown';
  }

  function _detectDevice(ua) {
    if (/Mobile|Android|iPhone/.test(ua))  return 'Mobile';
    if (/Tablet|iPad/.test(ua))            return 'Tablet';
    return 'Desktop';
  }

  function _getTimezone() {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown';
    } catch (_) {
      return 'unknown';
    }
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
      return id;
    } catch (_) {
      return _generateId('vis');
    }
  }

  // ─────────────────────────────────────────────────────────────
  //  UTILITIES
  // ─────────────────────────────────────────────────────────────

  function _generateId(prefix) {
    var rand = Math.random().toString(36).slice(2, 10) +
               Math.random().toString(36).slice(2, 10);
    return (prefix || 'id') + '_' + Date.now() + '_' + rand;
  }

  function _deriveSiteId() {
    try {
      return window.location.hostname || 'unknown';
    } catch (_) {
      return 'unknown';
    }
  }

})(window, document);
