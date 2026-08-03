# Beast AI v1

> Lightweight website security monitoring platform — install with one `<script>` tag.

---

## What It Does

Beast AI monitors your website in real time:
- Tracks visitors and their browser/device/OS fingerprint
- Captures JS errors, failed resource loads, rapid click patterns, and form submissions
- Measures page load performance
- Calculates a per-event **risk score** (Low / Medium / High / Critical)
- Streams everything to a live dashboard

---

## Quick Start

### 1. Install on your website

Paste this before `</body>` on every page you want to monitor:

```html
<script src="https://YOUR_RENDER_DOMAIN/beast.js"></script>
```

Beast AI initialises automatically — no configuration needed.

### 2. View your dashboard

Open `https://YOUR_RENDER_DOMAIN/dashboard` in a browser.

---

## Project Structure

```
beast-ai/
├── client/           # beast.js — the embeddable SDK
├── server/           # Express API
│   ├── middleware/   # Helmet, CORS, rate-limit, validation
│   ├── routes/       # Route definitions
│   ├── controllers/  # Request handlers
│   ├── services/     # Business logic (Firestore, risk engine)
│   └── utils/        # Helpers (logger, ID generator)
├── dashboard/        # HTML/CSS/JS live dashboard
│   ├── css/
│   └── js/
├── firebase/         # Firebase Admin SDK init
├── public/           # Served static files (beast.js bundle)
└── docs/             # Guides
```

---

## Setup

### Prerequisites

- Node.js ≥ 18
- A [Firebase project](https://console.firebase.google.com) with Firestore enabled
- A [Render](https://render.com) account for hosting

### Local Development

```bash
# 1. Clone
git clone https://github.com/daviddchucks-hash/ProtectorAi.git
cd ProtectorAi

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env with your Firebase credentials

# 4. Start dev server
npm run dev
```

The API will be available at `http://localhost:3000`.

---

## Environment Variables

See [`.env.example`](.env.example) for a full list with descriptions.

| Variable | Required | Description |
|---|---|---|
| `PORT` | No | Server port (default: 3000) |
| `FIREBASE_PROJECT_ID` | Yes | Firebase project ID |
| `FIREBASE_PRIVATE_KEY` | Yes | Firebase Admin private key |
| `FIREBASE_CLIENT_EMAIL` | Yes | Firebase Admin client email |
| `ALLOWED_ORIGINS` | Yes | Comma-separated allowed CORS origins |
| `DASHBOARD_TOKEN` | Yes | Auth token for dashboard access |

---

## Firestore Collections

| Collection | Purpose |
|---|---|
| `events` | All security events from the SDK |
| `visitors` | Unique visitor profiles |
| `alerts` | High/Critical events surfaced as alerts |
| `settings` | Per-site configuration |

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/events` | Receive events from beast.js |
| `GET` | `/api/stats` | Dashboard summary stats |
| `GET` | `/api/visitors` | Visitor list |
| `GET` | `/api/events` | Event history |
| `GET` | `/api/alerts` | Active alerts |
| `GET` | `/health` | Health check |

---

## Risk Levels

| Level | Score | Meaning |
|---|---|---|
| Low | 0–24 | Normal activity |
| Medium | 25–49 | Unusual but not alarming |
| High | 50–74 | Suspicious — review recommended |
| Critical | 75–100 | Immediate attention required |

---

## Deployment (Render)

See [`docs/render-deploy.md`](docs/render-deploy.md) for a step-by-step guide.

---

## Firebase Setup

See [`docs/firebase-setup.md`](docs/firebase-setup.md) for Firestore configuration.

---

## License

MIT
