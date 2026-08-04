# Beast AI v2

> Multi-site website security monitoring platform — install with one `<script>` tag.

---

## What's New in v2

| Feature | v1 | v2 |
|---|---|---|
| Multi-site support | ❌ | ✅ Per-site dashboards & tokens |
| Firebase Authentication | ❌ | ✅ Email/password auth |
| Real-time updates | ❌ | ✅ Socket.IO live push |
| SQL Injection detection | ❌ | ✅ |
| XSS detection | ❌ | ✅ |
| Path traversal detection | ❌ | ✅ |
| Selenium/Playwright/Puppeteer | ❌ | ✅ |
| DevTools detection | ❌ | ✅ |
| Request flood detection | ❌ | ✅ |
| New vs. returning visitors | ❌ | ✅ |
| Pages visited tracking | ❌ | ✅ |
| Browser version tracking | ❌ | ✅ |
| Attack timeline chart | ❌ | ✅ |
| Visitor detail modal | ❌ | ✅ |
| Live visitor count | ❌ | ✅ |
| Real-time alert banner | ❌ | ✅ |
| Site token rotation | ❌ | ✅ |

---

## Quick Start

### 1. Register an account

Visit your dashboard, create an account, and register your website to get a **site token**.

### 2. Install on your website

**Option A — Token baked into the URL (recommended):**
```html
<script src="https://YOUR_RENDER_DOMAIN/beast.js?token=tok_YOUR_TOKEN"></script>
```

**Option B — Universal script with explicit token:**
```html
<script>window.BEAST_SITE_TOKEN = 'tok_YOUR_TOKEN';</script>
<script src="https://YOUR_RENDER_DOMAIN/beast.js"></script>
```

Place the script before `</body>` on every page you want to monitor.

---

## What Beast AI Tracks

### Visitor Data
- Unique Visitor ID and Session ID
- Browser name and version
- Operating system
- Device type (Mobile / Tablet / Desktop)
- Screen resolution
- Language and timezone
- Current page and referrer
- Pages visited in this session
- New vs. returning visitor
- Time of visit

### Security Detections

| Threat | Risk Level | Description |
|---|---|---|
| SQL Injection | Critical | SQL patterns in form inputs |
| XSS Attempt | Critical | Cross-site scripting in inputs |
| Path Traversal | High | Directory traversal in URLs/inputs |
| Selenium Detected | High | Selenium WebDriver signatures |
| Playwright Detected | High | Playwright automation signatures |
| Puppeteer Detected | High | Puppeteer/CDP signatures |
| Headless Browser | High | Headless Chrome/PhantomJS signals |
| Brute Force | High | Rapid form submission patterns |
| Request Flood | High | Abnormal HTTP request volume |
| Bot Detected | Medium | Bot user-agent signatures |
| Suspicious URL | Medium | Admin panels, sensitive path access |
| DevTools Open | Medium | Browser DevTools opened |
| JS Tampering | High | JavaScript environment manipulation |
| Rapid Clicks | Medium | Unusual rapid clicking patterns |

---

## Architecture

```
beast-ai/
├── client/
│   └── beast.js              ← SDK source (injected with backend URL at serve time)
├── dashboard/
│   ├── index.html            ← Login / register page
│   ├── app.html              ← Main dashboard SPA
│   ├── config.js             ← Firebase config + backend URL
│   ├── css/
│   │   ├── auth.css          ← Auth page styles
│   │   └── dashboard.css     ← Dashboard styles
│   └── js/
│       ├── auth.js           ← Firebase auth
│       └── dashboard.js      ← Main dashboard app
├── firebase/
│   ├── admin.js              ← Firebase Admin SDK init
│   └── database.js           ← RTDB helpers + path constants
├── server/
│   ├── app.js                ← Express app setup
│   ├── index.js              ← Entry point + Socket.IO init
│   ├── controllers/          ← Route controllers
│   ├── middleware/           ← Auth, CORS, rate limiting, validation
│   ├── routes/               ← Express routers
│   ├── services/             ← Business logic
│   └── utils/                ← Logger, helpers
├── .env.example              ← Environment variable reference
├── render.yaml               ← Render deployment config
└── package.json
```

---

## Firebase RTDB Structure (v2)

```
/users/{uid}/               → user profile
/sites/{siteId}/            → site registration & token
/sitesByToken/{token}/      → token → siteId lookup index
/events/{siteId}/{key}/     → events per site
/visitors/{siteId}/{vid}/   → visitor profiles per site
/alerts/{siteId}/{key}/     → alerts per site
```

---

## API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/events` | Site token | Receive event from beast.js |
| `GET` | `/api/events` | Firebase Auth | Event history |
| `GET` | `/api/stats` | Firebase Auth | Dashboard stats |
| `GET` | `/api/visitors` | Firebase Auth | Visitor list |
| `GET` | `/api/visitors/live` | Firebase Auth | Currently online visitors |
| `GET` | `/api/visitors/:id` | Firebase Auth | Single visitor detail |
| `GET` | `/api/alerts` | Firebase Auth | Active alerts |
| `PATCH` | `/api/alerts/:id/resolve` | Firebase Auth | Resolve an alert |
| `GET` | `/api/sites` | Firebase Auth | List user's sites |
| `POST` | `/api/sites` | Firebase Auth | Register new site |
| `GET` | `/api/sites/:id` | Firebase Auth | Site details |
| `PUT` | `/api/sites/:id` | Firebase Auth | Update site |
| `DELETE` | `/api/sites/:id` | Firebase Auth | Delete site |
| `POST` | `/api/sites/:id/rotate-token` | Firebase Auth | Rotate site token |
| `GET` | `/beast.js` | None | Serve client SDK |
| `GET` | `/health` | None | Health check |

---

## Environment Variables

See `.env.example` for the full list. Key variables:

| Variable | Description |
|---|---|
| `FIREBASE_PROJECT_ID` | Firebase project ID |
| `FIREBASE_PRIVATE_KEY` | Service account private key |
| `FIREBASE_CLIENT_EMAIL` | Service account email |
| `FIREBASE_DATABASE_URL` | RTDB URL |
| `RENDER_URL` | Your Render deployment URL |
| `ALLOWED_ORIGINS` | Comma-separated allowed CORS origins |
| `PORT` | Server port (default 3000) |

---

## Deployment

### Render (Backend)

1. Push this repo to GitHub
2. Create a new Web Service on Render
3. Connect your GitHub repo — Render auto-detects `render.yaml`
4. Set the Firebase env vars in Render's Dashboard → Environment
5. Deploy

### GitHub Pages (Dashboard)

The `dashboard/` folder is served statically. You can:
- Serve it from Render at `/dashboard/` (already configured)
- Or host it on GitHub Pages by enabling it on this repo

Update `dashboard/config.js` with your Render URL and Firebase config after deployment.

---

## Risk Levels

| Level | Score | Meaning |
|---|---|---|
| Low | 0–24 | Normal activity |
| Medium | 25–49 | Unusual — worth reviewing |
| High | 50–74 | Suspicious — investigate |
| Critical | 75–100 | Immediate action required |

---

## License

MIT
