/**
 * dashboard/js/dashboard.js
 * Beast AI v2 — Main dashboard application
 * Handles: auth guard, site management, real-time Socket.IO, data fetching,
 *          charts, visitor/event/alert rendering, search/filter.
 *
 * Auth: uses Firebase Identity Toolkit REST API via sessionStorage tokens.
 * No Firebase JS SDK dependency.
 */

(function () {
  'use strict';

  // ── Auth config (token refresh proxied through server) ───────
  const API = (window.BEAST_AI_URL || '').replace(/\/$/, '');

  // ── App state ─────────────────────────────────────────────────
  const state = {
    idToken:      null,
    userEmail:    null,
    sites:        [],
    currentSite:  null,
    stats:        null,
    events:       [],
    visitors:     [],
    alerts:       [],
    liveVisitors: [],
    socket:       null,
  };

  // ── Auth guard (sessionStorage-based) ────────────────────────
  async function _initAuth() {
    const token   = sessionStorage.getItem('beast_id_token');
    const expiry  = parseInt(sessionStorage.getItem('beast_token_expiry') || '0', 10);
    const refresh = sessionStorage.getItem('beast_refresh_token');

    if (!token) {
      window.location.href = 'index.html';
      return;
    }

    // Refresh token if expired or close to expiry
    if (Date.now() >= expiry && refresh) {
      const refreshed = await _refreshToken(refresh);
      if (!refreshed) {
        _clearSession();
        window.location.href = 'index.html';
        return;
      }
    }

    state.idToken   = sessionStorage.getItem('beast_id_token');
    state.userEmail = sessionStorage.getItem('beast_user_email') || '';

    _updateUserUI();
    _connectSocket();
    await _loadSites();
    _bindNav();
    _bindEvents();
    _bindSiteSelector();
    _bindSiteManagement();
  }

  _initAuth();

  // ── Token refresh via server proxy ───────────────────────────
  async function _refreshToken(refreshToken) {
    try {
      const res = await fetch(`${API}/api/auth/refresh`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      const expiresAt = Date.now() + (parseInt(data.expires_in, 10) - 60) * 1000;
      sessionStorage.setItem('beast_id_token',      data.id_token);
      sessionStorage.setItem('beast_refresh_token', data.refresh_token);
      sessionStorage.setItem('beast_token_expiry',  String(expiresAt));
      return true;
    } catch (_) {
      return false;
    }
  }

  function _clearSession() {
    ['beast_id_token','beast_refresh_token','beast_user_email',
     'beast_user_uid','beast_token_expiry'].forEach(k => sessionStorage.removeItem(k));
  }

  // Proactive token refresh every 50 minutes
  setInterval(async () => {
    const refresh = sessionStorage.getItem('beast_refresh_token');
    if (refresh) {
      const ok = await _refreshToken(refresh);
      if (ok) state.idToken = sessionStorage.getItem('beast_id_token');
    }
  }, 50 * 60 * 1000);

  // ── API helper ────────────────────────────────────────────────
  async function api(path, opts = {}) {
    const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
    if (state.idToken) headers['Authorization'] = 'Bearer ' + state.idToken;

    const res = await fetch(API + path, { ...opts, headers });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error?.message || `HTTP ${res.status}`);
    return json;
  }

  // ── User UI ───────────────────────────────────────────────────
  function _updateUserUI() {
    const email   = state.userEmail || '';
    const initial = email[0]?.toUpperCase() || '?';
    document.getElementById('user-email').textContent  = email;
    document.getElementById('user-avatar').textContent = initial;
  }

  document.getElementById('logout-btn').addEventListener('click', () => {
    _clearSession();
    window.location.href = 'index.html';
  });

  // ── Socket.IO ─────────────────────────────────────────────────
  function _connectSocket() {
    if (typeof io === 'undefined') { _setConnection('offline'); return; }
    _setConnection('connecting');

    const sock = io(API, { transports: ['websocket', 'polling'] });
    state.socket = sock;

    sock.on('connect', () => {
      _setConnection('connected');
      // Join current site room
      if (state.currentSite) sock.emit('join:site', state.currentSite.siteId);
    });

    sock.on('disconnect', () => _setConnection('offline'));
    sock.on('connect_error', () => _setConnection('offline'));

    // Real-time events
    sock.on('event:new',       ev   => _onNewEvent(ev));
    sock.on('visitor:new',     v    => _onNewVisitor(v));
    sock.on('visitor:update',  v    => _onVisitorUpdate(v));
    sock.on('visitor:offline', data => _onVisitorOffline(data.visitorId));
    sock.on('alert:new',       a    => _onNewAlert(a));
    sock.on('alert:resolved',  data => _onAlertResolved(data.id));
  }

  function _setConnection(status) {
    const pill  = document.getElementById('connection-pill');
    const label = document.getElementById('connection-label');
    pill.className = 'connection-pill' + (status === 'connected' ? ' connected' : '');
    label.textContent = status === 'connected' ? 'Live'
                      : status === 'connecting' ? 'Connecting…' : 'Offline';
  }

  // ── Site management ───────────────────────────────────────────
  async function _loadSites() {
    try {
      const res   = await api('/api/sites');
      state.sites = res.sites || [];
      _renderSiteSelector();
      _renderSitesList();

      // Auto-select first site
      if (state.sites.length > 0 && !state.currentSite) {
        _selectSite(state.sites[0]);
      } else if (state.sites.length === 0) {
        _showNoSite();
      }
    } catch (err) {
      _toast('Failed to load sites: ' + err.message, 'error');
    }
  }

  function _renderSiteSelector() {
    const list = document.getElementById('site-list');
    if (!state.sites.length) {
      list.innerHTML = '<div class="site-list-item" style="color:var(--text-muted);font-size:12px">No websites yet</div>';
      return;
    }
    list.innerHTML = state.sites.map(site => `
      <div class="site-list-item ${state.currentSite?.siteId === site.siteId ? 'active' : ''}"
           data-site-id="${site.siteId}">
        <span>🌐</span> ${_esc(site.name)}
      </div>
    `).join('');

    list.querySelectorAll('.site-list-item[data-site-id]').forEach(el => {
      el.addEventListener('click', () => {
        const site = state.sites.find(s => s.siteId === el.dataset.siteId);
        if (site) { _selectSite(site); _closeSiteDropdown(); }
      });
    });
  }

  function _selectSite(site) {
    // Leave old site room
    if (state.socket && state.currentSite) {
      state.socket.emit('leave:site', state.currentSite.siteId);
    }

    state.currentSite = site;
    document.getElementById('selected-site-name').textContent = site.name;

    // Join new site room
    if (state.socket) state.socket.emit('join:site', site.siteId);

    // Hide no-site state
    document.getElementById('no-site-state').style.display = 'none';
    document.getElementById('stats-grid').style.display = '';

    // Reload data for this site
    _loadOverviewData();
    _renderSiteSelector();
  }

  function _showNoSite() {
    document.getElementById('no-site-state').style.display = '';
    document.getElementById('stats-grid').style.display    = 'none';
  }

  function _bindSiteSelector() {
    const btn      = document.getElementById('site-dropdown-btn');
    const dropdown = document.getElementById('site-dropdown');

    btn.addEventListener('click', e => {
      e.stopPropagation();
      dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
    });

    document.addEventListener('click', () => _closeSiteDropdown());
    dropdown.addEventListener('click', e => e.stopPropagation());

    document.getElementById('add-site-btn').addEventListener('click', () => {
      _closeSiteDropdown();
      _showAddSiteModal();
    });
    document.getElementById('ov-add-site-btn')?.addEventListener('click', _showAddSiteModal);
  }

  function _closeSiteDropdown() {
    document.getElementById('site-dropdown').style.display = 'none';
  }

  // ── Site CRUD ─────────────────────────────────────────────────
  function _bindSiteManagement() {
    // Add site form
    document.getElementById('add-site-form').addEventListener('submit', async e => {
      e.preventDefault();
      const name   = document.getElementById('site-name-input').value.trim();
      const domain = document.getElementById('site-domain-input').value.trim();
      const errEl  = document.getElementById('add-site-error');
      errEl.classList.add('hidden');

      try {
        const res  = await api('/api/sites', { method: 'POST', body: JSON.stringify({ name, domain }) });
        state.sites.push(res.site);
        _renderSiteSelector();
        _renderSitesList();
        _hideModal('add-site-modal');
        document.getElementById('add-site-form').reset();
        _selectSite(res.site);
        _toast('Website registered!', 'success');
      } catch (err) {
        errEl.textContent = err.message;
        errEl.classList.remove('hidden');
      }
    });

    document.getElementById('add-site-modal-close').addEventListener('click', () => _hideModal('add-site-modal'));
    document.getElementById('install-modal-close').addEventListener('click', () => _hideModal('install-modal'));
    document.getElementById('sites-add-btn').addEventListener('click', _showAddSiteModal);
    document.getElementById('visitor-modal-close').addEventListener('click', () => _hideModal('visitor-modal'));

    // Alert banner close
    document.getElementById('alert-banner-close').addEventListener('click', () => {
      document.getElementById('alert-banner').classList.add('hidden');
    });

    // Refresh button
    document.getElementById('refresh-btn').addEventListener('click', () => {
      if (state.currentSite) _loadOverviewData();
    });
  }

  function _showAddSiteModal() {
    _showModal('add-site-modal');
  }

  function _renderSitesList() {
    const container = document.getElementById('sites-list');
    if (!state.sites.length) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">🌐</div><h3>No websites yet</h3><p>Register your first website to start monitoring it.</p></div>';
      return;
    }

    container.innerHTML = state.sites.map(site => `
      <div class="site-card" data-site-id="${site.siteId}">
        <div class="site-card-icon">🌐</div>
        <div class="site-card-info">
          <div class="site-card-name">${_esc(site.name)}</div>
          <div class="site-card-domain">${_esc(site.domain)}</div>
          <div class="site-token-row">
            <span class="site-token">${_esc(site.token || '')}</span>
          </div>
        </div>
        <div class="site-card-actions">
          <button class="btn-primary-sm" onclick="window.__showInstall('${site.siteId}')">Install Script</button>
          <button class="btn-outline" onclick="window.__rotateTok('${site.siteId}')">Rotate Token</button>
          <button class="btn-outline danger" onclick="window.__deleteSite('${site.siteId}')">Delete</button>
        </div>
      </div>
    `).join('');
  }

  // Expose site actions to inline onclick
  window.__showInstall = (siteId) => {
    const site = state.sites.find(s => s.siteId === siteId);
    if (!site) return;
    const specificScript = `<script src="${API}/beast.js?token=${site.token}"><\/script>`;
    const universalScript = `<script>window.BEAST_SITE_TOKEN = '${site.token}';<\/script>\n<script src="${API}/beast.js"><\/script>`;
    const codeBlock     = document.getElementById('install-code-block');
    const univBlock     = document.getElementById('install-code-universal');
    codeBlock.textContent = specificScript;
    univBlock.textContent = universalScript;
    codeBlock.onclick = () => { navigator.clipboard?.writeText(specificScript); _toast('Copied!', 'success'); };
    univBlock.onclick = () => { navigator.clipboard?.writeText(universalScript); _toast('Copied!', 'success'); };
    _showModal('install-modal');
  };

  window.__rotateTok = async (siteId) => {
    if (!confirm('Rotate the token? The old token will stop working immediately.')) return;
    try {
      const res = await api(`/api/sites/${siteId}/rotate-token`, { method: 'POST' });
      const site = state.sites.find(s => s.siteId === siteId);
      if (site) site.token = res.token;
      _renderSitesList();
      _renderSiteSelector();
      _toast('Token rotated successfully.', 'success');
    } catch (err) {
      _toast('Failed to rotate token: ' + err.message, 'error');
    }
  };

  window.__deleteSite = async (siteId) => {
    if (!confirm('Delete this website and ALL its data? This cannot be undone.')) return;
    try {
      await api(`/api/sites/${siteId}`, { method: 'DELETE' });
      state.sites = state.sites.filter(s => s.siteId !== siteId);
      if (state.currentSite?.siteId === siteId) {
        state.currentSite = null;
        _showNoSite();
      }
      _renderSiteSelector();
      _renderSitesList();
      _toast('Website deleted.', 'info');
    } catch (err) {
      _toast('Failed to delete: ' + err.message, 'error');
    }
  };

  // ── Navigation ────────────────────────────────────────────────
  function _bindNav() {
    const titles = {
      overview: 'Overview', visitors: 'Visitors', events: 'Events',
      security: 'Security', alerts: 'Alerts', sites: 'My Websites',
    };

    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', e => {
        e.preventDefault();
        const view = item.dataset.view;
        _switchView(view, titles[view] || view);
      });
    });

    // Mobile menu toggle
    document.getElementById('menu-toggle').addEventListener('click', () => {
      document.getElementById('sidebar').classList.toggle('open');
    });
  }

  function _switchView(viewId, title) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    const view = document.getElementById(`view-${viewId}`);
    const nav  = document.querySelector(`.nav-item[data-view="${viewId}"]`);
    if (view) view.classList.add('active');
    if (nav)  nav.classList.add('active');

    document.getElementById('view-title').textContent = title || viewId;

    // Lazy load view data
    if (!state.currentSite) return;
    if (viewId === 'visitors') _loadVisitors();
    if (viewId === 'events')   _loadEvents();
    if (viewId === 'security') _loadSecurity();
    if (viewId === 'alerts')   _loadAlerts();
    if (viewId === 'sites')    _renderSitesList();

    // Close mobile sidebar
    document.getElementById('sidebar').classList.remove('open');
  }

  // ── Event bindings ────────────────────────────────────────────
  function _bindEvents() {
    document.getElementById('load-visitors-btn').addEventListener('click', _loadVisitors);
    document.getElementById('load-events-btn').addEventListener('click', _loadEvents);
    document.getElementById('load-security-btn').addEventListener('click', _loadSecurity);
    document.getElementById('load-alerts-btn').addEventListener('click', _loadAlerts);

    document.getElementById('visitor-search').addEventListener('input', e => {
      _filterVisitors(e.target.value);
    });
    document.getElementById('event-search').addEventListener('input', e => {
      _filterEvents(e.target.value, document.getElementById('event-type-filter').value);
    });
    document.getElementById('event-type-filter').addEventListener('change', e => {
      _filterEvents(document.getElementById('event-search').value, e.target.value);
    });
    document.getElementById('security-risk-filter').addEventListener('change', () => {
      _renderSecurityTable(state.events);
    });
    document.getElementById('show-resolved').addEventListener('change', () => {
      _loadAlerts();
    });
  }

  // ── Overview / Stats ──────────────────────────────────────────
  async function _loadOverviewData() {
    if (!state.currentSite) return;
    const siteId = state.currentSite.siteId;

    try {
      const [statsRes, liveRes] = await Promise.all([
        api(`/api/stats?siteId=${siteId}`),
        api(`/api/visitors/live?siteId=${siteId}`),
      ]);

      state.stats        = statsRes;
      state.liveVisitors = liveRes.visitors || [];

      _renderStats(statsRes);
      _renderCharts(statsRes);
      _renderLiveVisitors(state.liveVisitors);
      _renderThreatList(state.stats.threats || []);

      // Update badges
      const alertCount = statsRes.summary?.activeAlerts || 0;
      const liveCount  = state.liveVisitors.length;
      _setBadge('badge-alerts', alertCount, alertCount > 0);
      _setBadge('badge-live',   liveCount,  liveCount > 0);
    } catch (err) {
      _toast('Failed to load stats: ' + err.message, 'error');
    }
  }

  function _renderStats(data) {
    const s = data.summary || {};
    _setText('val-live',     s.liveVisitors    || 0);
    _setText('val-visitors', s.totalVisitors   || 0);
    _setText('val-events',   s.totalEvents     || 0);
    _setText('val-alerts',   s.activeAlerts    || 0);
    _setText('val-critical', s.criticalAlerts  || 0);
    _setText('val-new-v',    s.newVisitors     || 0);
  }

  function _renderCharts(data) {
    _renderBarChart('chart-browsers',    data.browsers    || []);
    _renderBarChart('chart-os',          data.oses        || []);
    _renderBarChart('chart-threats',     data.threats     || []);
    _renderBarChart('chart-devices',     data.devices     || []);
    _renderBarChart('chart-event-types', data.eventTypes  || []);
    _renderRiskDonut('chart-risks',      data.riskLevels  || {});
    _renderAttackTimeline('attack-timeline', data.attackTimeline || []);
  }

  function _renderBarChart(elId, items) {
    const el  = document.getElementById(elId);
    if (!el) return;
    const max = Math.max(...items.map(i => i.count), 1);

    if (!items.length) {
      el.innerHTML = '<div class="empty-row">No data</div>';
      return;
    }

    el.innerHTML = items.map(item => `
      <div class="bar-item">
        <span class="bar-label" title="${_esc(item.name)}">${_esc(item.name)}</span>
        <div class="bar-track">
          <div class="bar-fill" style="width:${Math.round(item.count / max * 100)}%"></div>
        </div>
        <span class="bar-count">${item.count}</span>
      </div>
    `).join('');
  }

  function _renderRiskDonut(elId, levels) {
    const el = document.getElementById(elId);
    if (!el) return;
    const items = [
      { key: 'critical', label: 'Critical', count: levels.critical || 0 },
      { key: 'high',     label: 'High',     count: levels.high     || 0 },
      { key: 'medium',   label: 'Medium',   count: levels.medium   || 0 },
      { key: 'low',      label: 'Low',      count: levels.low      || 0 },
    ];
    el.innerHTML = items.map(i => `
      <div class="risk-item">
        <span class="risk-dot ${i.key}"></span>
        <span class="risk-label">${i.label}</span>
        <span class="risk-count">${i.count}</span>
      </div>
    `).join('');
  }

  function _renderAttackTimeline(elId, timeline) {
    const el = document.getElementById(elId);
    if (!el || !timeline.length) return;
    const max = Math.max(...timeline.map(t => t.count), 1);
    const maxH = 56;

    el.innerHTML = timeline.map(item => `
      <div class="timeline-bar-wrap" title="${item.hour}: ${item.count} attacks">
        <div class="timeline-bar" style="height:${Math.max(2, Math.round(item.count / max * maxH))}px"></div>
        <div class="timeline-hour">${item.hour.slice(0, 2)}</div>
      </div>
    `).join('');
  }

  // ── Live visitors ─────────────────────────────────────────────
  function _renderLiveVisitors(visitors) {
    const el = document.getElementById('live-visitor-list');
    if (!visitors.length) {
      el.innerHTML = '<div class="empty-row">No active visitors</div>';
      return;
    }
    el.innerHTML = visitors.slice(0, 20).map(v => `
      <div class="visitor-live-item" onclick="window.__showVisitorDetail('${v.visitorId}')">
        <div class="visitor-live-dot"></div>
        <div class="visitor-live-info">
          <div class="visitor-live-id">${_esc(v.visitorId)}</div>
          <div class="visitor-live-page">${_esc(_shortUrl(v.currentPage || ''))}</div>
        </div>
        <span class="visitor-live-badge">${_esc(v.browser || '')} / ${_esc(v.os || '')}</span>
      </div>
    `).join('');
  }

  function _renderThreatList(threats) {
    const el = document.getElementById('threat-list');
    if (!threats.length) {
      el.innerHTML = '<div class="empty-row">No threats detected</div>';
      return;
    }
    const icons = {
      sql_injection: '💉', xss_attempt: '🪄', path_traversal: '📂',
      suspicious_url: '🔗', bot_detected: '🤖', headless_browser: '👻',
      selenium_detected: '🎭', playwright_detected: '🎭', puppeteer_detected: '🤹',
      devtools_open: '🔧', request_flood: '🌊', brute_force: '🔨',
      js_tampering: '⚠️',
    };
    el.innerHTML = threats.slice(0, 10).map(t => `
      <div class="threat-item">
        <span>${icons[t.name] || '⚡'}</span>
        <span style="flex:1;font-size:12px">${_esc(t.name.replace(/_/g, ' '))}</span>
        <span class="badge badge-critical">${t.count}</span>
      </div>
    `).join('');
  }

  // ── Visitors view ─────────────────────────────────────────────
  async function _loadVisitors() {
    if (!state.currentSite) return;
    const tbody = document.getElementById('visitors-tbody');
    tbody.innerHTML = '<tr><td colspan="11" class="empty-row">Loading…</td></tr>';

    try {
      const res      = await api(`/api/visitors?siteId=${state.currentSite.siteId}&limit=200`);
      state.visitors = res.visitors || [];
      _renderVisitorsTable(state.visitors);
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="11" class="empty-row">Error: ${_esc(err.message)}</td></tr>`;
    }
  }

  function _renderVisitorsTable(visitors) {
    const tbody = document.getElementById('visitors-tbody');
    if (!visitors.length) {
      tbody.innerHTML = '<tr><td colspan="11" class="empty-row">No visitors recorded yet</td></tr>';
      return;
    }
    tbody.innerHTML = visitors.map(v => `
      <tr onclick="window.__showVisitorDetail('${v.visitorId}')" style="cursor:pointer">
        <td><span class="mono" title="${_esc(v.visitorId)}">${_esc(v.visitorId.slice(0, 20))}…</span></td>
        <td><span class="badge badge-${v.online ? 'online' : 'offline'}">${v.online ? 'Online' : 'Offline'}</span></td>
        <td><span class="badge badge-${v.isNew ? 'new' : 'offline'}">${v.isNew ? 'New' : 'Returning'}</span></td>
        <td>${_esc(v.browser || '')} ${_esc(v.browserVersion || '')}</td>
        <td>${_esc(v.os || '')}</td>
        <td>${_esc(v.device || '')}</td>
        <td>${_esc(v.language || '')}</td>
        <td>${_esc(v.timezone || '')}</td>
        <td>${v.pageCount || 0}</td>
        <td>${_timeAgo(v.lastSeen)}</td>
        <td>${_timeAgo(v.firstSeen)}</td>
      </tr>
    `).join('');
  }

  function _filterVisitors(query) {
    if (!query.trim()) { _renderVisitorsTable(state.visitors); return; }
    const q = query.toLowerCase();
    const filtered = state.visitors.filter(v =>
      (v.visitorId || '').toLowerCase().includes(q) ||
      (v.browser   || '').toLowerCase().includes(q) ||
      (v.os        || '').toLowerCase().includes(q) ||
      (v.device    || '').toLowerCase().includes(q) ||
      (v.timezone  || '').toLowerCase().includes(q)
    );
    _renderVisitorsTable(filtered);
  }

  window.__showVisitorDetail = (visitorId) => {
    const v = state.visitors.find(x => x.visitorId === visitorId)
           || state.liveVisitors.find(x => x.visitorId === visitorId);
    if (!v) return;

    const body = document.getElementById('visitor-modal-body');
    const pages = Array.isArray(v.pagesVisited) ? v.pagesVisited : [];
    body.innerHTML = `
      <div class="detail-grid">
        <div class="detail-item"><div class="detail-label">Visitor ID</div><div class="detail-value mono" style="font-size:11px">${_esc(v.visitorId)}</div></div>
        <div class="detail-item"><div class="detail-label">Session ID</div><div class="detail-value mono" style="font-size:11px">${_esc(v.sessionId || '—')}</div></div>
        <div class="detail-item"><div class="detail-label">Status</div><div class="detail-value"><span class="badge badge-${v.online ? 'online' : 'offline'}">${v.online ? 'Online' : 'Offline'}</span></div></div>
        <div class="detail-item"><div class="detail-label">Visitor Type</div><div class="detail-value">${v.isNew ? '🆕 New' : '🔄 Returning'}</div></div>
        <div class="detail-item"><div class="detail-label">Browser</div><div class="detail-value">${_esc(v.browser || '—')} ${_esc(v.browserVersion || '')}</div></div>
        <div class="detail-item"><div class="detail-label">OS</div><div class="detail-value">${_esc(v.os || '—')}</div></div>
        <div class="detail-item"><div class="detail-label">Device</div><div class="detail-value">${_esc(v.device || '—')}</div></div>
        <div class="detail-item"><div class="detail-label">Screen</div><div class="detail-value">${_esc(v.screen || '—')}</div></div>
        <div class="detail-item"><div class="detail-label">Language</div><div class="detail-value">${_esc(v.language || '—')}</div></div>
        <div class="detail-item"><div class="detail-label">Timezone</div><div class="detail-value">${_esc(v.timezone || '—')}</div></div>
        <div class="detail-item"><div class="detail-label">IP Address</div><div class="detail-value">${_esc(v.ip || '—')}</div></div>
        <div class="detail-item"><div class="detail-label">Sessions</div><div class="detail-value">${v.sessionCount || 1}</div></div>
        <div class="detail-item"><div class="detail-label">Pages Visited</div><div class="detail-value">${v.pageCount || 0}</div></div>
        <div class="detail-item"><div class="detail-label">First Seen</div><div class="detail-value">${_fmtDate(v.firstSeen)}</div></div>
        <div class="detail-item"><div class="detail-label">Last Seen</div><div class="detail-value">${_fmtDate(v.lastSeen)}</div></div>
        <div class="detail-item"><div class="detail-label">Referrer</div><div class="detail-value" style="font-size:11px">${_esc(_shortUrl(v.referrer || '—'))}</div></div>
        <div class="detail-item"><div class="detail-label">User Agent</div><div class="detail-value" style="font-size:10px;word-break:break-all">${_esc((v.userAgent || '—').slice(0, 200))}</div></div>
      </div>
      ${pages.length ? `
        <div style="margin-top:16px">
          <div class="detail-label" style="margin-bottom:6px">Pages Visited (${pages.length})</div>
          <div class="pages-list">${pages.map(p => `<span>${_esc(_shortUrl(p))}</span>`).join('')}</div>
        </div>
      ` : ''}
    `;
    _showModal('visitor-modal');
  };

  // ── Events view ───────────────────────────────────────────────
  async function _loadEvents() {
    if (!state.currentSite) return;
    const tbody = document.getElementById('events-tbody');
    tbody.innerHTML = '<tr><td colspan="9" class="empty-row">Loading…</td></tr>';
    const type = document.getElementById('event-type-filter').value;

    try {
      const url = `/api/events?siteId=${state.currentSite.siteId}&limit=200${type ? '&type=' + type : ''}`;
      const res  = await api(url);
      state.events = res.events || [];
      _filterEvents(document.getElementById('event-search').value, type);
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="9" class="empty-row">Error: ${_esc(err.message)}</td></tr>`;
    }
  }

  function _filterEvents(query, typeFilter) {
    let filtered = state.events;
    if (typeFilter) filtered = filtered.filter(e => e.type === typeFilter);
    if (query.trim()) {
      const q = query.toLowerCase();
      filtered = filtered.filter(e =>
        (e.type      || '').toLowerCase().includes(q) ||
        (e.visitorId || '').toLowerCase().includes(q) ||
        (e.page      || '').toLowerCase().includes(q) ||
        (e.browser   || '').toLowerCase().includes(q) ||
        (e.riskLevel || '').toLowerCase().includes(q)
      );
    }
    _renderEventsTable(filtered);
  }

  function _renderEventsTable(events) {
    const tbody = document.getElementById('events-tbody');
    if (!events.length) {
      tbody.innerHTML = '<tr><td colspan="9" class="empty-row">No events found</td></tr>';
      return;
    }
    tbody.innerHTML = events.map(ev => `
      <tr>
        <td>${_timeAgo(ev.timestamp)}</td>
        <td><code style="font-size:11px">${_esc(ev.type || '')}</code></td>
        <td><span class="badge badge-${_esc(ev.riskLevel || 'low')}">${_esc(ev.riskLevel || 'low')}</span></td>
        <td>${ev.riskScore || 0}</td>
        <td style="max-width:140px">${(ev.detectedThreats || []).map(t => `<span class="badge badge-high" style="margin-right:2px;font-size:9px">${_esc(t.replace(/_/g,''))}</span>`).join('') || '—'}</td>
        <td title="${_esc(ev.visitorId || '')}">${_esc((ev.visitorId || '').slice(0, 18))}…</td>
        <td title="${_esc(ev.page || '')}">${_esc(_shortUrl(ev.page || ''))}</td>
        <td>${_esc(ev.browser || '')}</td>
        <td>${_esc(ev.os || '')}</td>
      </tr>
    `).join('');
  }

  // ── Security view ─────────────────────────────────────────────
  async function _loadSecurity() {
    if (!state.currentSite) return;
    const tbody = document.getElementById('security-tbody');
    tbody.innerHTML = '<tr><td colspan="8" class="empty-row">Loading…</td></tr>';

    try {
      const res    = await api(`/api/events?siteId=${state.currentSite.siteId}&limit=200`);
      state.events = res.events || [];
      _renderSecurityTable(state.events);
      _renderCharts(state.stats || {});
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="8" class="empty-row">Error: ${_esc(err.message)}</td></tr>`;
    }
  }

  function _renderSecurityTable(events) {
    const tbody      = document.getElementById('security-tbody');
    const riskFilter = document.getElementById('security-risk-filter').value;

    const SECURITY_TYPES = [
      'sql_injection', 'xss_attempt', 'path_traversal', 'suspicious_url',
      'brute_force', 'request_flood', 'bot_detected', 'headless_browser',
      'devtools_open', 'js_tampering', 'selenium_detected', 'playwright_detected',
      'puppeteer_detected', 'csrf_attempt', 'suspicious_input',
    ];

    let filtered = events.filter(e =>
      SECURITY_TYPES.includes(e.type) ||
      (e.detectedThreats && e.detectedThreats.length > 0) ||
      e.riskLevel === 'high' || e.riskLevel === 'critical'
    );

    if (riskFilter) filtered = filtered.filter(e => e.riskLevel === riskFilter);

    if (!filtered.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="empty-row">No security events found</td></tr>';
      return;
    }

    tbody.innerHTML = filtered.map(ev => `
      <tr>
        <td>${_timeAgo(ev.timestamp)}</td>
        <td><code style="font-size:11px">${_esc(ev.type || '')}</code></td>
        <td><span class="badge badge-${_esc(ev.riskLevel || 'low')}">${_esc(ev.riskLevel || 'low')}</span></td>
        <td>${ev.riskScore || 0}</td>
        <td title="${_esc(ev.visitorId || '')}">${_esc((ev.visitorId || '').slice(0, 18))}…</td>
        <td>${_esc(ev.ip || '—')}</td>
        <td title="${_esc(ev.page || '')}">${_esc(_shortUrl(ev.page || ''))}</td>
        <td style="font-size:11px;max-width:160px">${_esc((ev.recommendedAction || '').slice(0, 80))}</td>
      </tr>
    `).join('');
  }

  // ── Alerts view ───────────────────────────────────────────────
  async function _loadAlerts() {
    if (!state.currentSite) return;
    const container = document.getElementById('alerts-list');
    container.innerHTML = '<div class="empty-row">Loading…</div>';
    const resolved = document.getElementById('show-resolved').checked;

    try {
      const res     = await api(`/api/alerts?siteId=${state.currentSite.siteId}&resolved=${resolved}&limit=100`);
      state.alerts  = res.alerts || [];
      _renderAlertsList(state.alerts);
    } catch (err) {
      container.innerHTML = `<div class="empty-row">Error: ${_esc(err.message)}</div>`;
    }
  }

  function _renderAlertsList(alerts) {
    const container = document.getElementById('alerts-list');
    if (!alerts.length) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">✅</div><h3>No alerts</h3><p>Your site is clean — no active threats.</p></div>';
      return;
    }

    const icons = { critical: '🚨', high: '⚠️', medium: 'ℹ️', low: '✅' };
    container.innerHTML = alerts.map(a => `
      <div class="alert-card ${a.riskLevel || ''} ${a.resolved ? 'resolved' : ''}" data-alert-id="${a.id}">
        <div class="alert-icon">${icons[a.riskLevel] || '⚡'}</div>
        <div class="alert-body">
          <div class="alert-title">
            <span class="badge badge-${_esc(a.riskLevel || 'low')}">${_esc(a.riskLevel || 'low').toUpperCase()}</span>
            &nbsp;${_esc(a.type?.replace(/_/g, ' ') || 'Unknown event')}
          </div>
          <div class="alert-meta">
            ${_timeAgo(a.timestamp)} · Visitor: ${_esc((a.visitorId || '').slice(0, 20))}…
            ${a.ip ? ` · IP: ${_esc(a.ip)}` : ''}
            ${a.page ? ` · Page: ${_esc(_shortUrl(a.page))}` : ''}
          </div>
          <div class="alert-meta" style="margin-top:4px">${_esc(a.reason || '')}</div>
        </div>
        ${!a.resolved ? `
          <div class="alert-actions">
            <button class="btn-resolve" onclick="window.__resolveAlert('${a.id}')">✓ Resolve</button>
          </div>
        ` : '<div class="alert-actions"><span style="font-size:11px;color:var(--success)">✓ Resolved</span></div>'}
      </div>
    `).join('');
  }

  window.__resolveAlert = async (alertId) => {
    if (!state.currentSite) return;
    try {
      await api(`/api/alerts/${alertId}/resolve?siteId=${state.currentSite.siteId}`, { method: 'PATCH' });
      _toast('Alert resolved.', 'success');
      _loadAlerts();
      _loadOverviewData();
    } catch (err) {
      _toast('Failed to resolve: ' + err.message, 'error');
    }
  };

  // ── Real-time event handlers ──────────────────────────────────
  function _onNewEvent(ev) {
    state.events.unshift(ev);
    if (state.events.length > 500) state.events.pop();

    // Update stats
    if (state.stats?.summary) {
      state.stats.summary.totalEvents = (state.stats.summary.totalEvents || 0) + 1;
      _renderStats(state.stats);
    }

    // If on events view, prepend to table
    const tbody = document.getElementById('events-tbody');
    if (document.getElementById('view-events').classList.contains('active')) {
      _filterEvents(document.getElementById('event-search').value,
                    document.getElementById('event-type-filter').value);
    }
  }

  function _onNewVisitor(v) {
    state.visitors.unshift(v);
    state.liveVisitors.unshift(v);
    if (state.stats?.summary) {
      state.stats.summary.totalVisitors = (state.stats.summary.totalVisitors || 0) + 1;
      state.stats.summary.liveVisitors  = state.liveVisitors.length;
      _renderStats(state.stats);
    }
    _renderLiveVisitors(state.liveVisitors);
    _setBadge('badge-live', state.liveVisitors.length, true);
  }

  function _onVisitorUpdate(v) {
    const idx = state.liveVisitors.findIndex(x => x.visitorId === v.visitorId);
    if (idx >= 0) state.liveVisitors[idx] = { ...state.liveVisitors[idx], ...v };
    else state.liveVisitors.unshift(v);
    _renderLiveVisitors(state.liveVisitors);
  }

  function _onVisitorOffline(visitorId) {
    state.liveVisitors = state.liveVisitors.filter(v => v.visitorId !== visitorId);
    if (state.stats?.summary) {
      state.stats.summary.liveVisitors = state.liveVisitors.length;
      _renderStats(state.stats);
    }
    _renderLiveVisitors(state.liveVisitors);
    _setBadge('badge-live', state.liveVisitors.length, state.liveVisitors.length > 0);
  }

  function _onNewAlert(a) {
    state.alerts.unshift(a);
    if (state.stats?.summary) {
      state.stats.summary.activeAlerts = (state.stats.summary.activeAlerts || 0) + 1;
      if (a.riskLevel === 'critical') state.stats.summary.criticalAlerts = (state.stats.summary.criticalAlerts || 0) + 1;
      _renderStats(state.stats);
    }
    _setBadge('badge-alerts', state.alerts.filter(x => !x.resolved).length, true);

    // Show alert banner for Critical/High
    if (a.riskLevel === 'critical' || a.riskLevel === 'high') {
      const banner = document.getElementById('alert-banner');
      document.getElementById('alert-banner-text').textContent =
        `${a.riskLevel.toUpperCase()} alert: ${(a.type || '').replace(/_/g, ' ')} detected`;
      banner.classList.remove('hidden');
      setTimeout(() => banner.classList.add('hidden'), 8000);
    }

    _toast(`🚨 ${a.riskLevel?.toUpperCase()} alert: ${(a.type || '').replace(/_/g, ' ')}`, 'error');
  }

  function _onAlertResolved(alertId) {
    const alert = state.alerts.find(a => a.id === alertId);
    if (alert) alert.resolved = true;
    if (state.stats?.summary) {
      state.stats.summary.activeAlerts = Math.max(0, (state.stats.summary.activeAlerts || 1) - 1);
      _renderStats(state.stats);
    }
    _setBadge('badge-alerts', state.alerts.filter(x => !x.resolved).length, true);
  }

  // ── Modal helpers ─────────────────────────────────────────────
  function _showModal(id) { document.getElementById(id).style.display = 'flex'; }
  function _hideModal(id) { document.getElementById(id).style.display = 'none'; }

  // Close modals on overlay click
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.style.display = 'none';
    });
  });

  // ── Toast ─────────────────────────────────────────────────────
  function _toast(msg, type = 'info') {
    const container = document.getElementById('toast-container');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  }

  // ── Utility ───────────────────────────────────────────────────
  function _esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function _setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  function _setBadge(id, count, show) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = count;
    el.style.display = show && count > 0 ? '' : 'none';
  }

  function _timeAgo(iso) {
    if (!iso) return '—';
    const diff = Date.now() - new Date(iso).getTime();
    const s = Math.floor(diff / 1000);
    if (s < 10)  return 'just now';
    if (s < 60)  return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60)  return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24)  return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  function _fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString();
  }

  function _shortUrl(url) {
    if (!url || url === '—') return url;
    try {
      const u = new URL(url);
      return u.pathname + (u.search ? u.search.slice(0, 20) : '');
    } catch (_) {
      return url.slice(0, 50);
    }
  }

  // mono class for tables
  const style = document.createElement('style');
  style.textContent = '.mono { font-family: "JetBrains Mono", monospace; font-size: 11px; }';
  document.head.appendChild(style);

})();
