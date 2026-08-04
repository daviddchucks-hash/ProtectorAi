/**
 * dashboard/js/auth.js
 * Beast AI v2 — Firebase Authentication for login/register page
 */

(function () {
  'use strict';

  // Init Firebase
  const config = window.BEAST_FIREBASE_CONFIG;
  if (!firebase.apps.length) firebase.initializeApp(config);
  const auth = firebase.auth();

  // ── Redirect if already logged in ───────────────────────────
  auth.onAuthStateChanged(user => {
    if (user) window.location.href = 'app.html';
  });

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
      await auth.signInWithEmailAndPassword(email, password);
      window.location.href = 'app.html';
    } catch (err) {
      _setLoading(btn, false);
      loginError.textContent = `${_friendlyError(err.code)} [${err.code}]`;
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
      await auth.createUserWithEmailAndPassword(email, password);
      window.location.href = 'app.html';
    } catch (err) {
      _setLoading(btn, false);
      regError.textContent = `${_friendlyError(err.code)} [${err.code}]`;
      regError.classList.remove('hidden');
      console.error('Register error:', err);
    }
  });

  function _setLoading(btn, loading) {
    btn.disabled = loading;
    btn.querySelector('.btn-text').style.display    = loading ? 'none' : '';
    btn.querySelector('.btn-spinner').classList.toggle('hidden', !loading);
  }

  function _friendlyError(code) {
    const map = {
      'auth/user-not-found':    'No account found with this email.',
      'auth/wrong-password':    'Incorrect password.',
      'auth/invalid-email':     'Invalid email address.',
      'auth/email-already-in-use': 'An account with this email already exists.',
      'auth/weak-password':     'Password is too weak.',
      'auth/too-many-requests': 'Too many attempts. Please try again later.',
      'auth/network-request-failed': 'Network error. Check your connection.',
    };
    return map[code] || `Authentication error (${code}).`;
  }
})();
