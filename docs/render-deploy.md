# Deploying Beast AI to Render

## Prerequisites

- A [Render](https://render.com) account
- Your Beast AI repository pushed to GitHub

---

## Steps

### 1. Create a new Web Service

1. Log in to [render.com](https://render.com)
2. Click **New → Web Service**
3. Connect your GitHub account and select `ProtectorAi`
4. Configure:
   - **Name:** `beast-ai` (or your choice)
   - **Region:** Closest to your users
   - **Branch:** `main`
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `node server/index.js`
   - **Instance Type:** Free (or Starter for production)

### 2. Add Environment Variables

In the Render dashboard → your service → **Environment**, add:

| Key | Value |
|---|---|
| `NODE_ENV` | `production` |
| `FIREBASE_PROJECT_ID` | Your Firebase project ID |
| `FIREBASE_PRIVATE_KEY` | Paste the full private key (include `\n` escapes) |
| `FIREBASE_CLIENT_EMAIL` | Your Firebase service account email |
| `ALLOWED_ORIGINS` | Your website URLs (comma-separated) |
| `DASHBOARD_TOKEN` | A strong random secret |

### 3. Deploy

Click **Create Web Service**. Render will build and deploy automatically.

Your SDK URL will be:
```
https://protectorai-1.onrender.com/beast.js
```

### 4. Update your website

Add the install snippet before `</body>` on every page you want to monitor:

```html
<script src="https://protectorai-1.onrender.com/beast.js"></script>
```

---

## Redeploy on Push

Render auto-deploys when you push to `main`. No manual action needed.

---

## Custom Domain (Optional)

Render dashboard → your service → **Settings → Custom Domains**.
