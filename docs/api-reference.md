# Beast AI v1 — API Reference

Base URL: `https://YOUR_APP.onrender.com`

---

## Authentication

Dashboard API endpoints do not require authentication by default.  
To protect them, set `DASHBOARD_TOKEN` in your environment and pass:

```
Authorization: Bearer YOUR_TOKEN
```

Or append `?token=YOUR_TOKEN` to any URL.

---

## Endpoints

### `GET /health`

Liveness probe. Returns server status.

**Response:**
```json
{
  "status": "ok",
  "service": "Beast AI v1",
  "timestamp": "2025-01-01T00:00:00.000Z",
  "uptime": 3600,
  "env": "production"
}
```

---

### `POST /api/events`

Receive a security event from beast.js.  
Called automatically by the SDK — you do not need to call this manually.

**Headers:**
```
Content-Type: application/json
X-Beast-Site-Id: your-site-id
```

**Body:**
```json
{
  "type":      "js_error",
  "siteId":    "yoursite.com",
  "visitorId": "vis_1234_abcd",
  "page":      "https://yoursite.com/checkout",
  "browser":   "Chrome",
  "os":        "macOS",
  "device":    "Desktop",
  "language":  "en-US",
  "timezone":  "America/New_York",
  "data": {
    "message": "TypeError: Cannot read property 'foo' of null",
    "source":  "https://yoursite.com/js/app.js",
    "lineno":  42
  }
}
```

**Response `201`:**
```json
{
  "success": true,
  "data": {
    "eventId":   "bai_evt_xxxxxxxx-xxxx-xxxx",
    "riskLevel": "medium"
  }
}
```

---

### `GET /api/stats`

Returns aggregated dashboard summary statistics.

**Query params:**
| Param | Type | Description |
|---|---|---|
| `siteId` | string | Filter to one site (optional) |

**Response:**
```json
{
  "success": true,
  "data": {
    "summary": {
      "totalEvents":    1240,
      "totalVisitors":  87,
      "liveVisitors":   3,
      "totalAlerts":    12,
      "criticalAlerts": 2,
      "highAlerts":     4,
      "jsErrors":       18,
      "avgThreatScore": 14,
      "avgLoadTime":    1240
    },
    "breakdowns": {
      "browsers":   [{ "name": "Chrome", "count": 54 }, ...],
      "os":         [{ "name": "macOS",  "count": 31 }, ...],
      "eventTypes": [{ "name": "page_view", "count": 800 }, ...]
    },
    "recentEvents": [ ... ]
  }
}
```

---

### `GET /api/events`

Returns a list of recent events.

**Query params:**
| Param | Type | Default | Description |
|---|---|---|---|
| `siteId` | string | — | Filter to one site |
| `type` | string | — | Filter by event type |
| `limit` | integer | 100 | Max results (1–200) |

---

### `GET /api/visitors`

Returns a list of visitors.

**Query params:**
| Param | Type | Default | Description |
|---|---|---|---|
| `siteId` | string | — | Filter to one site |
| `limit` | integer | 100 | Max results (1–200) |

---

### `GET /api/visitors/:id`

Returns a single visitor by their `visitorId`.

---

### `GET /api/alerts`

Returns a list of alerts.

**Query params:**
| Param | Type | Default | Description |
|---|---|---|---|
| `siteId` | string | — | Filter to one site |
| `resolved` | boolean | false | Include resolved alerts |
| `limit` | integer | 100 | Max results (1–200) |

---

### `PATCH /api/alerts/:id/resolve`

Marks an alert as resolved.

**Response:**
```json
{
  "success": true,
  "data": { "id": "bai_alt_xxxx", "resolved": true }
}
```

---

## Event Types

| Type | Trigger |
|---|---|
| `session_start` | First event in a new session |
| `page_view` | Every page navigation |
| `js_error` | `window.onerror` or unhandled rejection |
| `console_error` | `console.error()` call |
| `failed_resource` | Image/script/stylesheet fails to load |
| `rapid_clicks` | 10+ clicks within 3 seconds |
| `rapid_form_submit` | 3+ form submissions within 5 seconds |
| `performance` | Page load timing after `window.load` |
| `page_hidden` | Tab hidden or window minimised |
| `page_visible` | Tab becomes visible again |
| `online` | Browser goes online |
| `offline` | Browser goes offline |
| `heartbeat` | Session alive signal (every 30s) |

---

## Risk Levels

| Level | Score Range | Meaning |
|---|---|---|
| `low` | 0–24 | Normal activity |
| `medium` | 25–49 | Unusual — worth noting |
| `high` | 50–74 | Suspicious — review recommended |
| `critical` | 75–100 | Requires immediate attention |

---

## SDK Manual Tracking

```javascript
// After beast.js loads, you can track custom events:
window.BeastAI.track('custom_event', {
  action:  'button_click',
  element: 'signup-cta',
});
```
