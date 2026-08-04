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

  const API_KEY        = window.BEAST_FIREBASE_CONFIG.apiKey;
  const AUTH_BASE      = 'https://identitytoolkit.googleapis.com/v1/accounts';
  const TOKEN_URL      = 'https://securetoken.googleapis.com/v1/token';

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
      const res  = await fetch(`${AUTH_BASE}:signInWithPassword?key=${API_KEY}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, password, returnSecureToken: true }),
      });
      const data = await res.json();
      if (!res.ok) throw { code: _mapCode(data.error?.message) };
      _saveSession(data);
      window.location.href = 'app.html';
    } catch (err) {
      _setLoading(btn, false);
      loginError.textContent = `${_friendlyError(err.code)} [${err.code || 'unknown'}]`;
      loginError.classList.remove('hidden');
      console.error('Login error:', err);
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
      const res  = await fetch(`${AUTH_BASE}:signUp?key=${API_KEY}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, password, returnSecureToken: true }),
      });
      const data = await res.json();
      if (!res.ok) throw { code: _mapCode(data.error?.message) };
      _saveSession(data);
      window.location.href = 'app.html';
    } catch (err) {
      _setLoading(btn, false);
      regError.textContent = `${_friendlyError(err.code)} [${err.code || 'unknown'}]`;
      regError.classList.remove('hidden');
      console.error('Register error:', err);
    }
  });

  // ── Helpers ───────────────────────────────────────────────────
  function _saveSession(data) {
    const expiresAt = Date.now() + (parseInt(data.expiresIn, 10) - 60) * 1000;
    sessionStorage.setItem('beast_id_token',      data.idToken);
    sessionStorage.setItem('beast_refresh_token', data.refreshToken);
    sessionStorage.setItem('beast_user_email',    data.email);
    sessionStorage.setItem('beast_user_uid',      data.localId);
    sessionStorage.setItem('beast_token_expiry',  String(expiresAt));
  }

  function _setLoading(btn, loading) {
    btn.disabled = loading;
    btn.querySelector('.btn-text').style.display = loading ? 'none' : '';
    btn.querySelector('.btn-spinner').classList.toggle('hidden', !loading);
  }

  function _mapCode(msg) {
    if (!msg) return 'auth/unknown';
    const m = msg.toUpperCase();
    if (m.includes('EMAIL_NOT_FOUND') || m.includes('INVALID_LOGIN_CREDENTIALS') ||
        m.includes('USER_NOT_FOUND'))   return 'auth/user-not-found';
    if (m.includes('INVALID_PASSWORD') || m.includes('WRONG_PASSWORD'))
                                        return 'auth/wrong-password';
    if (m.includes('INVALID_EMAIL'))    return 'auth/invalid-email';
    if (m.includes('EMAIL_EXISTS') || m.includes('EMAIL_ALREADY_IN_USE'))
                                        return 'auth/email-already-in-use';
    if (m.includes('WEAK_PASSWORD') || m.includes('PASSWORD_TOO_SHORT') ||
        m.includes('PASSWORD_DOES_NOT'))return 'auth/weak-password';
    if (m.includes('TOO_MANY_ATTEMPTS')|| m.includes('TOO_MANY_REQUESTS'))
                                        return 'auth/too-many-requests';
    if (m.includes('USER_DISABLED'))    return 'auth/user-disabled';
    return 'auth/' + msg.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  }

  function _friendlyError(code) {
    const map = {
      'auth/user-not-found':       'No account found with this email.',
      'auth/wrong-password':       'Incorrect password.',
      'auth/invalid-email':        'Invalid email address.',
      'auth/email-already-in-use': 'An account with this email already exists.',
      'auth/weak-password':        'Password must be at least 6 characters.',
      'auth/too-many-requests':    'Too many attempts. Please try again later.',
      'auth/user-disabled':        'This account has been disabled.',
      'auth/network-request-failed': 'Network error. Check your connection.',
    };
    return map[code] || `Authentication error (${code}).`;
  }
})();
