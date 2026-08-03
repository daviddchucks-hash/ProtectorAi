# Firebase Setup for Beast AI

## 1. Create a Firebase Project

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Click **Add project**
3. Enter a project name (e.g. `beast-ai-monitor`)
4. Disable Google Analytics (optional)
5. Click **Create project**

---

## 2. Enable Firestore

1. In the left sidebar → **Build → Firestore Database**
2. Click **Create database**
3. Choose **Start in production mode**
4. Select a region close to your Render deployment
5. Click **Done**

---

## 3. Set Firestore Security Rules

In the Firestore console → **Rules**, paste:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Only server-side Admin SDK can read/write
    // Client browsers never touch Firestore directly
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

Click **Publish**.

---

## 4. Create a Service Account

1. Go to **Project Settings → Service Accounts**
2. Click **Generate new private key**
3. Download the JSON file — **keep this secret**
4. Extract these three values for your `.env`:

```
FIREBASE_PROJECT_ID      → "project_id" field
FIREBASE_CLIENT_EMAIL    → "client_email" field
FIREBASE_PRIVATE_KEY     → "private_key" field (full multiline string)
```

---

## 5. Firestore Collections

Beast AI creates these collections automatically on first use:

| Collection | Auto-created | Description |
|---|---|---|
| `events` | ✓ | Every event sent by beast.js |
| `visitors` | ✓ | Unique visitor records |
| `alerts` | ✓ | High/Critical risk events |
| `settings` | Manual | Per-site widget settings |

---

## 6. Indexes (Optional but recommended)

For better query performance, create these composite indexes in Firestore:

| Collection | Fields | Order |
|---|---|---|
| `events` | `siteId` ASC, `timestamp` DESC | Descending |
| `events` | `visitorId` ASC, `timestamp` DESC | Descending |
| `alerts` | `siteId` ASC, `resolved` ASC, `timestamp` DESC | Descending |

---

## Troubleshooting

**Error: "The caller does not have permission"**  
→ Check that `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY` are set correctly in `.env`.

**Error: "Could not load the default credentials"**  
→ Make sure `FIREBASE_PROJECT_ID` is set and the private key includes proper `\n` newlines.
