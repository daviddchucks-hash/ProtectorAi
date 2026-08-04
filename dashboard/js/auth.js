/**
 * dashboard/js/auth.js
 * Beast AI v2 — Firebase Auth via REST API (no SDK dependency)
 *
 * Uses Firebase Identity Toolkit REST API directly, which is more reliable
 * than the Firebase JS SDK in environments with strict CSP or network
 * restrictions. Tokens are stored in sessionStorage.
 */

(function () {
  'use strict';

  // Guard: ensure config was loaded
  if (!window.BEAST_FIREBASE_CONFIG || !window.BEAST_FIREBASE_CONFIG.apiKey) {
    console.error('[auth] BEAST_FIREBASE_CONFIG not found — is config.js loaded?');
    document.body.innerHTML = '<p style="color:red;padding:2rem">Configuration error. Please reload.</p>';
    return;
  }

  const API_KEY   = window.BEAST_FIREBASE_CONFIG.apiKey;
  const AUTH_BASE = 'https://identitytoolkit.googleapis.com/v1/accounts';

  // ── Redirect if already logged in ───────────────────────────
  if (sessionStorage.getItem('beast_id_token')) {
    window.location.href = 'app.html';
    return;
  }

  // ── DOM refs ─────────────────────────────────────────────────
  const loginForm   = document.getElementById('login-form');
  const regForm     = document.getElementById('register-form');
  const loginError  = document.getElementById('login-error');
  const regError    = document.getElementById('reg-error');
  const tabs        = document.querySelectorAll('.tab-btn');

  // ── Tab switching ─────────────────────────────────────────────
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const which = tab.dataset.tab;
      loginForm.classList.toggle('hidden', which !== 'login');
      regForm.classList.toggle('hidden', which !== 'register');
      loginError.classList.add('hidden');
      regError.classList.add('hidden');
    });
  });

  // ── Login ─────────────────────────────────────────────────────
  loginForm.addEventListener('submit', async e => {
    e.preventDefault();
    const email    = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const btn      = document.getElementById('login-btn');
    _setLoading(btn, true);
    loginError.classList.add('hidden');

    try {
      const { idToken, refreshToken, expiresIn, email: userEmail, localId } =
        await _firebasePost(':signInWithPassword', { email, password, returnSecureToken: true });
      _saveSession({ idToken, refreshToken, expiresIn, email: userEmail, localId });
      window.location.href = 'app.html';
    } catch (err) {
      _setLoading(btn, false);
      _showError(loginError, err);
    }
  });

  // ── Register ──────────────────────────────────────────────────
  regForm.addEventListener('submit', async e => {
    e.preventDefault();
    const email    = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const confirm  = document.getElementById('reg-confirm').value;
    const btn      = document.getElementById('reg-btn');
    regError.classList.add('hidden');

    if (password !== confirm) {
      regError.textContent = 'Passwords do not match.';
      regError.classList.remove('hidden');
      return;
    }
    if (password.length < 6) {
      regError.textContent = 'Password must be at least 6 characters.';
      regError.classList.remove('hidden');
      return;
    }

    _setLoading(btn, true);
    try {
      const { idToken, refreshToken, expiresIn, email: userEmail, localId } =
        await _firebasePost(':signUp', { email, password, returnSecureToken: true });
      _saveSession({ idToken, refreshToken, expiresIn, email: userEmail, localId });
      window.location.href = 'app.html';
    } catch (err) {
      _setLoading(btn, false);
      _showError(regError, err);
    }
  });

  // ── Core Firebase REST helper ─────────────────────────────────
  /**
   * POST to Firebase Identity Toolkit REST API.
   * Always throws an object with { code, rawMessage } on failure.
   */
  async function _firebasePost(endpoint, body) {
    let res, data;
    try {
      res = await fetch(`${AUTH_BASE}${endpoint}?key=${API_KEY}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
    } catch (networkErr) {
      // fetch() itself threw — offline, DNS failure, CORS hard-block, etc.
      console.error('[auth] Network error reaching Firebase:', networkErr);
      throw {
        code:       'auth/network-request-failed',
        rawMessage: networkErr.message || 'Failed to fetch',
      };
    }

    try {
      data = await res.json();
    } catch (parseErr) {
      console.error('[auth] Could not parse Firebase response:', parseErr, 'HTTP', res.status);
      throw {
        code:       'auth/network-request-failed',
        rawMessage: `HTTP ${res.status} — non-JSON response`,
      };
    }

    if (!res.ok) {
      const rawMessage = data?.error?.message || `HTTP ${res.status}`;
      console.error('[auth] Firebase error:', rawMessage, data);
      throw {
        code:       _mapCode(rawMessage),
        rawMessage,
      };
    }

    return data;
  }

  // ── Helpers ───────────────────────────────────────────────────
  function _saveSession(data) {
    const expiresIn = parseInt(data.expiresIn, 10) || 3600;
    const expiresAt = Date.now() + (expiresIn - 60) * 1000;
    sessionStorage.setItem('beast_id_token',      data.idToken);
    sessionStorage.setItem('beast_refresh_token', data.refreshToken);
    sessionStorage.setItem('beast_user_email',    data.email || '');
    sessionStorage.setItem('beast_user_uid',      data.localId || '');
    sessionStorage.setItem('beast_token_expiry',  String(expiresAt));
  }

  function _showError(el, err) {
    // err may be our custom { code, rawMessage } OR a native Error
    const code       = err.code || 'auth/unknown';
    const rawMessage = err.rawMessage || err.message || 'unknown';
    const friendly   = _friendlyError(code);
    el.textContent   = `${friendly} [${rawMessage}]`;
    el.classList.remove('hidden');
    console.error('[auth] Displayed error:', code, rawMessage, err);
  }

  function _setLoading(btn, loading) {
    btn.disabled = loading;
    btn.querySelector('.btn-text').style.display = loading ? 'none' : '';
    btn.querySelector('.btn-spinner').classList.toggle('hidden', !loading);
  }

  /**
   * Map Firebase REST API error message strings to SDK-style codes.
   * REST API returns uppercase strings like "EMAIL_EXISTS", "WEAK_PASSWORD".
   */
  function _mapCode(msg) {
    if (!msg) return 'auth/unknown';
    const m = msg.toUpperCase();
    if (m.includes('EMAIL_NOT_FOUND') || m.includes('INVALID_LOGIN_CREDENTIALS') ||
        m.includes('USER_NOT_FOUND'))               return 'auth/user-not-found';
    if (m.includes('INVALID_PASSWORD') ||
        m.includes('WRONG_PASSWORD'))               return 'auth/wrong-password';
    if (m.includes('INVALID_EMAIL'))                return 'auth/invalid-email';
    if (m.includes('EMAIL_EXISTS') ||
        m.includes('EMAIL_ALREADY'))                return 'auth/email-already-in-use';
    if (m.includes('WEAK_PASSWORD') ||
        m.includes('PASSWORD_TOO_SHORT') ||
        m.includes('PASSWORD_DOES_NOT'))            return 'auth/weak-password';
    if (m.includes('TOO_MANY_ATTEMPTS') ||
        m.includes('TOO_MANY_REQUESTS'))            return 'auth/too-many-requests';
    if (m.includes('USER_DISABLED'))                return 'auth/user-disabled';
    if (m.includes('OPERATION_NOT_ALLOWED'))        return 'auth/operation-not-allowed';
    if (m.includes('ADMIN_ONLY'))                   return 'auth/admin-restricted';
    if (m.includes('BLOCKED') ||
        m.includes('REFERER'))                      return 'auth/unauthorized-domain';
    if (m.includes('API KEY') ||
        m.includes('API_KEY'))                      return 'auth/invalid-api-key';
    // Generic fallback
    return 'auth/' + msg.toLowerCase().replace(/[^a-z0-9_-]/g, '-').slice(0, 40);
  }

  function _friendlyError(code) {
    const map = {
      'auth/user-not-found':        'No account found with this email.',
      'auth/wrong-password':        'Incorrect password.',
      'auth/invalid-email':         'Invalid email address.',
      'auth/email-already-in-use':  'An account with this email already exists.',
      'auth/weak-password':         'Password must be at least 6 characters.',
      'auth/too-many-requests':     'Too many attempts. Please try again later.',
      'auth/user-disabled':         'This account has been disabled.',
      'auth/network-request-failed':'Network error. Check your connection.',
      'auth/operation-not-allowed': 'Email/password sign-in is not enabled. Enable it in Firebase Console → Authentication → Sign-in method.',
      'auth/admin-restricted':      'Sign-ups are restricted to admin invites.',
      'auth/unauthorized-domain':   'This domain is not authorised in Firebase. Add it under Firebase Console → Authentication → Settings → Authorised domains.',
      'auth/invalid-api-key':       'Invalid Firebase API key. Check dashboard/config.js.',
    };
    return map[code] || `Authentication error (${code}).`;
  }
})();
