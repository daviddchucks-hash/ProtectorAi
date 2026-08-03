/**
 * dashboard/js/dashboard.js
 * Beast AI v1 — Dashboard frontend
 * Vanilla JS — zero dependencies.
 * Polls the Beast AI API for stats, events, visitors, and alerts.
 */

'use strict';

// ── Config ────────────────────────────────────────────────────
var API_BASE       = window.BEAST_AI_URL || '';   // same origin by default
var REFRESH_SECS   = 30;
var _refreshTimer;
var _countdown     = REFRESH_SECS;
var _currentView   = 'overview';
var _siteId        = '';

// ── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function () {
  _bindNav();
  _bindTopbar();
  _startClock();
  _loadOverview();
  _startAutoRefresh();
});

// ── Navigation ────────────────────────────────────────────────
function _bindNav() {
  document.querySelectorAll('.nav-item[data-view]').forEach(function (el) {
    el.addEventListener('click', function () {
      var view = this.getAttribute('data-view');
      _switchView(view);
    });
  });
}

function _switchView(view) {
  _currentView = view;

  // Update nav
  document.querySelectorAll('.nav-item').forEach(function (el) {
    el.classList.toggle('active', el.getAttribute('data-view') === view);
  });

  // Update views
  document.querySelectorAll('.view').forEach(function (el) {
    el.classList.toggle('active', el.id === 'view-' + view);
  });

  // Update page title
  var titles = { overview: 'Overview', events: 'Events', visitors: 'Visitors', alerts: 'Alerts' };
  document.getElementById('page-title').textContent = titles[view] || view;

  // Load data for the view
  if (view === 'overview')  _loadOverview();
  if (view === 'events')    _loadEvents();
  if (view === 'visitors')  _loadVisitors();
  if (view === 'alerts')    _loadAlerts();
}

// ── Topbar bindings ───────────────────────────────────────────
function _bindTopbar() {
  document.getElementById('refresh-btn').addEventListener('click', function () {
    _refreshCurrentView();
    _resetCountdown();
  });

  document.getElementById('theme-btn').addEventListener('click', function () {
    var html  = document.documentElement;
    var isDark = html.getAttribute('data-theme') === 'dark';
    html.setAttribute('data-theme', isDark ? 'light' : 'dark');
    this.textContent = isDark ? '🌑' : '🌙';
  });

  document.getElementById('site-id-input').addEventListener('change', function () {
    _siteId = this.value.trim();
    _refreshCurrentView();
  });

  document.getElementById('load-events-btn').addEventListener('click', _loadEvents);
  document.getElementById('load-visitors-btn').addEventListener('click', _loadVisitors);
  document.getElementById('load-alerts-btn').addEventListener('click', _loadAlerts);

  document.getElementById('show-resolved').addEventListener('change', _loadAlerts);
}

// ── Auto-refresh ──────────────────────────────────────────────
function _startAutoRefresh() {
  _refreshTimer = setInterval(function () {
    _countdown--;
    var el = document.getElementById('refresh-countdown');
    if (el) el.textContent = _countdown;

    if (_countdown <= 0) {
      _resetCountdown();
      _refreshCurrentView();
    }
  }, 1000);
}

function _resetCountdown() {
  _countdown = REFRESH_SECS;
  var el = document.getElementById('refresh-countdown');
  if (el) el.textContent = _countdown;
}

function _refreshCurrentView() {
  if (_currentView === 'overview')  _loadOverview();
  if (_currentView === 'events')    _loadEvents();
  if (_currentView === 'visitors')  _loadVisitors();
  if (_currentView === 'alerts')    _loadAlerts();
}

// ── Clock ─────────────────────────────────────────────────────
function _startClock() {
  function _tick() {
    var el = document.getElementById('topbar-time');
    if (el) el.textContent = new Date().toLocaleString();
  }
  _tick();
  setInterval(_tick, 1000);
}

// ── API helpers ───────────────────────────────────────────────
function _apiGet(path, params) {
  var url = API_BASE + path;
  var qs  = _buildQs(params);
  if (qs) url += '?' + qs;
  return fetch(url)
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function (body) {
      if (!body.success) throw new Error(body.error && body.error.message || 'API error');
      return body.data;
    });
}

function _apiPatch(path) {
  return fetch(API_BASE + path, { method: 'PATCH' })
    .then(function (r) { return r.json(); });
}

function _buildQs(params) {
  if (!params) return '';
  return Object.entries(params)
    .filter(function (e) { return e[1] !== undefined && e[1] !== ''; })
    .map(function (e) { return encodeURIComponent(e[0]) + '=' + encodeURIComponent(e[1]); })
    .join('&');
}

// ── Overview ──────────────────────────────────────────────────
function _loadOverview() {
  _apiGet('/api/stats', _siteId ? { siteId: _siteId } : null)
    .then(function (data) {
      var s = data.summary;

      _setText('stat-total-visitors', s.totalVisitors);
      _setText('stat-live-visitors',  s.liveVisitors);
      _setText('stat-total-events',   s.totalEvents);
      _setText('stat-total-alerts',   s.totalAlerts);
      _setText('stat-critical',        s.criticalAlerts);
      _setText('stat-js-errors',       s.jsErrors);
      _setText('stat-avg-threat',      s.avgThreatScore !== null ? s.avgThreatScore : '—');
      _setText('stat-avg-load',
        s.avgLoadTime !== null ? s.avgLoadTime + 'ms' : '—');

      // Update nav badges
      _setText('events-badge', s.totalEvents || '');
      _setText('alerts-badge', (s.criticalAlerts || 0) + (s.highAlerts || 0) || '');

      // Charts
      _renderBarChart('chart-browsers',     data.breakdowns.browsers,    'var(--accent)');
      _renderBarChart('chart-os',           data.breakdowns.os,          '#7c3aed');
      _renderBarChart('chart-event-types',  data.breakdowns.eventTypes,  '#4ff79c');

      // Timeline
      _renderTimeline(data.recentEvents);

      _setConnectionStatus(true);
    })
    .catch(function (err) {
      _toast('Failed to load stats: ' + err.message, 'error');
      _setConnectionStatus(false);
    });
}

// ── Events ────────────────────────────────────────────────────
function _loadEvents() {
  var type  = document.getElementById('event-type-filter').value;
  var params = {};
  if (_siteId) params.siteId = _siteId;
  if (type)   params.type   = type;
  params.limit = 100;

  _apiGet('/api/events', params)
    .then(function (events) {
      var tbody = document.getElementById('events-tbody');
      if (!events || !events.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty-row">No events found.</td></tr>';
        return;
      }
      tbody.innerHTML = events.map(function (e) {
        return '<tr>' +
          '<td>' + _relTime(e.timestamp) + '</td>' +
          '<td><code>' + _esc(e.type) + '</code></td>' +
          '<td><span class="risk-badge ' + (e.riskLevel||'low') + '">' + _esc(e.riskLevel||'low') + '</span></td>' +
          '<td>' + (e.riskScore || 0) + '</td>' +
          '<td title="' + _esc(e.visitorId) + '">' + _esc(_short(e.visitorId, 12)) + '</td>' +
          '<td title="' + _esc(e.page) + '">' + _esc(_short(e.page, 40)) + '</td>' +
          '<td>' + _esc(e.browser || '—') + '</td>' +
          '<td>' + _esc(e.os     || '—') + '</td>' +
          '</tr>';
      }).join('');
    })
    .catch(function (err) { _toast('Failed to load events: ' + err.message, 'error'); });
}

// ── Visitors ──────────────────────────────────────────────────
function _loadVisitors() {
  var params = { limit: 100 };
  if (_siteId) params.siteId = _siteId;

  _apiGet('/api/visitors', params)
    .then(function (visitors) {
      var tbody = document.getElementById('visitors-tbody');
      if (!visitors || !visitors.length) {
        tbody.innerHTML = '<tr><td colspan="9" class="empty-row">No visitors found.</td></tr>';
        return;
      }
      tbody.innerHTML = visitors.map(function (v) {
        var cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        var live   = v.lastSeen >= cutoff;
        return '<tr>' +
          '<td title="' + _esc(v.visitorId) + '">' + _esc(_short(v.visitorId, 14)) + '</td>' +
          '<td>' + (live ? '<span class="risk-badge low">Live</span>' : '<span class="risk-badge" style="background:var(--bg);">Offline</span>') + '</td>' +
          '<td>' + _esc(v.browser   || '—') + '</td>' +
          '<td>' + _esc(v.os        || '—') + '</td>' +
          '<td>' + _esc(v.device    || '—') + '</td>' +
          '<td>' + _esc(v.language  || '—') + '</td>' +
          '<td title="' + _esc(v.timezone) + '">' + _esc(_short(v.timezone || '—', 22)) + '</td>' +
          '<td>' + _relTime(v.lastSeen)  + '</td>' +
          '<td>' + _relTime(v.firstSeen) + '</td>' +
          '</tr>';
      }).join('');
    })
    .catch(function (err) { _toast('Failed to load visitors: ' + err.message, 'error'); });
}

// ── Alerts ────────────────────────────────────────────────────
function _loadAlerts() {
  var showResolved = document.getElementById('show-resolved').checked;
  var params = { resolved: showResolved, limit: 100 };
  if (_siteId) params.siteId = _siteId;

  _apiGet('/api/alerts', params)
    .then(function (alerts) {
      var list = document.getElementById('alerts-list');
      if (!alerts || !alerts.length) {
        list.innerHTML = '<div class="empty-state">' +
          (showResolved ? 'No resolved alerts.' : '✅ No active alerts — all clear!') +
          '</div>';
        return;
      }
      list.innerHTML = alerts.map(function (a) {
        var icon = a.riskLevel === 'critical' ? '🔴' : '🟠';
        return '<div class="alert-card ' + (a.riskLevel||'high') + (a.resolved ? ' resolved' : '') + '" data-id="' + _esc(a.id) + '">' +
          '<div class="alert-icon">' + icon + '</div>' +
          '<div class="alert-body">' +
            '<div class="alert-title">' +
              '<span class="risk-badge ' + (a.riskLevel||'high') + '">' + _esc(a.riskLevel||'high').toUpperCase() + '</span> ' +
              '&nbsp;' + _esc(a.type || 'Event') +
            '</div>' +
            '<div class="alert-meta">Visitor: ' + _esc(_short(a.visitorId, 16)) + ' · IP: ' + _esc(a.ip || '—') + ' · ' + _relTime(a.timestamp) + '</div>' +
            '<div class="alert-reason">' + _esc(a.reason || '') + '</div>' +
            '<div class="alert-action-hint">→ ' + _esc(a.recommendedAction || '') + '</div>' +
          '</div>' +
          '<div class="alert-actions">' +
            (!a.resolved
              ? '<button class="btn btn-sm btn-danger" onclick="resolveAlert(\'' + _esc(a.id) + '\')">Resolve</button>'
              : '<span style="font-size:.75rem;color:var(--success)">✓ Resolved</span>'
            ) +
          '</div>' +
          '</div>';
      }).join('');
    })
    .catch(function (err) { _toast('Failed to load alerts: ' + err.message, 'error'); });
}

// ── Resolve alert (called from inline onclick) ────────────────
window.resolveAlert = function (id) {
  _apiPatch('/api/alerts/' + encodeURIComponent(id) + '/resolve')
    .then(function () {
      _toast('Alert resolved.', 'success');
      _loadAlerts();
      _loadOverview();
    })
    .catch(function (err) { _toast('Could not resolve alert: ' + err.message, 'error'); });
};

// ── Bar chart renderer ────────────────────────────────────────
function _renderBarChart(containerId, items, color) {
  var el = document.getElementById(containerId);
  if (!el) return;
  if (!items || !items.length) {
    el.innerHTML = '<div class="empty-state">No data yet.</div>';
    return;
  }
  var max = Math.max.apply(null, items.map(function (i) { return i.count; }));
  el.innerHTML = items.slice(0, 8).map(function (item) {
    var pct = max > 0 ? Math.round((item.count / max) * 100) : 0;
    return '<div class="bar-item">' +
      '<div class="bar-label-row">' +
        '<span class="bar-name">' + _esc(item.name) + '</span>' +
        '<span class="bar-count">' + item.count + '</span>' +
      '</div>' +
      '<div class="bar-track">' +
        '<div class="bar-fill" style="width:' + pct + '%;background:' + color + '"></div>' +
      '</div>' +
      '</div>';
  }).join('');
}

// ── Timeline renderer ─────────────────────────────────────────
function _renderTimeline(events) {
  var el = document.getElementById('timeline');
  if (!el) return;
  if (!events || !events.length) {
    el.innerHTML = '<div class="empty-state">No recent events.</div>';
    return;
  }
  _setText('recent-count', events.length + ' events');
  el.innerHTML = events.map(function (e) {
    return '<div class="timeline-item">' +
      '<div class="timeline-dot ' + (e.riskLevel || 'low') + '"></div>' +
      '<div class="timeline-body">' +
        '<div class="timeline-type">' + _esc(e.type) + '</div>' +
        '<div class="timeline-meta">' +
          _esc(_short(e.page || '—', 60)) + ' · Visitor: ' + _esc(_short(e.visitorId, 12)) +
          (e.riskScore ? ' · Score: ' + e.riskScore : '') +
        '</div>' +
      '</div>' +
      '<div class="timeline-time">' + _relTime(e.timestamp) + '</div>' +
      '</div>';
  }).join('');
}

// ── Connection status ─────────────────────────────────────────
function _setConnectionStatus(online) {
  var dot  = document.querySelector('.status-dot');
  var text = document.querySelector('.status-text');
  if (dot)  { dot.className  = 'status-dot ' + (online ? 'online' : 'offline'); }
  if (text) { text.textContent = online ? 'Live' : 'Disconnected'; }
}

// ── Toast ─────────────────────────────────────────────────────
function _toast(msg, type) {
  var c   = document.getElementById('toast-container');
  var div = document.createElement('div');
  div.className = 'toast ' + (type || 'info');
  div.textContent = msg;
  c.appendChild(div);
  setTimeout(function () { div.remove(); }, 4000);
}

// ── Utilities ─────────────────────────────────────────────────
function _setText(id, val) {
  var el = document.getElementById(id);
  if (el) el.textContent = val !== undefined && val !== null ? val : '—';
}

function _esc(str) {
  return String(str || '').replace(/[&<>"']/g, function (c) {
    return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[c];
  });
}

function _short(str, len) {
  if (!str) return '';
  return str.length > len ? str.slice(0, len) + '…' : str;
}

function _relTime(isoStr) {
  if (!isoStr) return '—';
  try {
    var diff = Date.now() - new Date(isoStr).getTime();
    if (isNaN(diff)) return isoStr.slice(0, 16);
    var s = Math.floor(diff / 1000);
    if (s < 5)   return 'just now';
    if (s < 60)  return s + 's ago';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    return Math.floor(s / 86400) + 'd ago';
  } catch (_) {
    return isoStr ? isoStr.slice(0, 16) : '—';
  }
}
