// ===== DEVICE-AUTH.JS — Google OAuth Device Code flow for Firebase Auth =====
// Zero dependencies — pure fetch(). Tokens cached in localStorage.
//
// Usage:
//   import { startSignIn, getSession, signOut } from './js/auth/device-auth.js';
//
//   // Returns { userCode, verificationUrl } — show these to the user
//   const pending = await startSignIn();
//   // Resolves when user completes auth, or rejects on timeout/cancel
//   const session = await pending.complete;
//   // session = { uid, idToken, refreshToken }

// ── Config ─────────────────────────────────────────────────────────────
var CLIENT_ID     = '267901585099-u6fjd75v6k9gefq7bcokcndv99riir5j';
var CLIENT_SECRET = 'HzoZF-UKUNfFwBuz4vafwsaR';

var FIREBASE_API_KEY = 'AIzaSyAU62kOE6xhSrFqoXQPv6_WHxYilmoUxDk';

var LS_KEY = 'idleon_auth';

// ── Endpoints ──────────────────────────────────────────────────────────
var DEVICE_CODE_URL = 'https://oauth2.googleapis.com/device/code';
var TOKEN_URL       = 'https://oauth2.googleapis.com/token';
var FIREBASE_IDP_URL = 'https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=' + FIREBASE_API_KEY;
var FIREBASE_REFRESH_URL = 'https://securetoken.googleapis.com/v1/token?key=' + FIREBASE_API_KEY;

var DEVICE_CODE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code';

// ── Internal state ─────────────────────────────────────────────────────
var _cancelPoll = null;

/**
 * Override default config at runtime (optional).
 */
export function configure(opts) {
  if (opts.clientId) CLIENT_ID = opts.clientId;
  if (opts.clientSecret) CLIENT_SECRET = opts.clientSecret;
}

/**
 * Start the device code sign-in flow.
 *
 * Returns an object with:
 *   .userCode       — code the user enters at the verification URL
 *   .verificationUrl — URL to open (typically https://www.google.com/device)
 *   .complete       — Promise that resolves to { uid, idToken, refreshToken }
 *                     when the user completes auth
 *   .cancel()       — abort the polling
 *
 * @returns {Promise<{userCode: string, verificationUrl: string, complete: Promise, cancel: function}>}
 */
export async function startSignIn() {
  // Cancel any in-flight poll
  if (_cancelPoll) { _cancelPoll(); _cancelPoll = null; }

  // Step 1: Request device code
  var resp = await fetch(DEVICE_CODE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'client_id=' + encodeURIComponent(CLIENT_ID) + '&scope=email%20profile'
  });
  if (!resp.ok) throw new Error('Device code request failed: ' + resp.status);

  var data = await resp.json();
  var deviceCode = data.device_code;
  var interval   = (data.interval || 5) * 1000;
  var expiresIn  = (data.expires_in || 1800) * 1000;

  var cancelled = false;
  function cancel() { cancelled = true; }
  _cancelPoll = cancel;

  // Step 2: Poll for token (returns a promise)
  var complete = _pollForToken(deviceCode, interval, expiresIn, function() { return cancelled; })
    .then(function(googleToken) {
      _cancelPoll = null;
      // Step 3: Exchange Google token for Firebase auth
      return _exchangeForFirebase(googleToken);
    })
    .then(function(session) {
      _saveSession(session);
      return session;
    });

  return {
    userCode: data.user_code,
    verificationUrl: data.verification_url || 'https://www.google.com/device',
    complete: complete,
    cancel: cancel
  };
}

/**
 * Get the current cached session, refreshing the token if expired.
 * Returns null if not signed in.
 *
 * @returns {Promise<{uid: string, idToken: string, refreshToken: string}|null>}
 */
export async function getSession() {
  var session = _loadSession();
  if (!session) return null;

  // Check if token is expired (with 5-minute buffer)
  if (session.expiresAt && Date.now() > session.expiresAt - 300000) {
    try {
      session = await _refreshFirebaseToken(session.refreshToken);
      _saveSession(session);
    } catch (e) {
      console.warn('device-auth: token refresh failed, clearing session', e);
      signOut();
      return null;
    }
  }
  return session;
}

/**
 * True if we have a cached session (may need refresh).
 */
export function isSignedIn() {
  return !!_loadSession();
}

/**
 * Clear cached session.
 */
export function signOut() {
  if (_cancelPoll) { _cancelPoll(); _cancelPoll = null; }
  try { localStorage.removeItem(LS_KEY); } catch (e) { /* ignore */ }
}

// ── Internal: poll Google token endpoint ──────────────────────────────
function _pollForToken(deviceCode, interval, expiresIn, isCancelled) {
  var deadline = Date.now() + expiresIn;

  return new Promise(function(resolve, reject) {
    function tick() {
      if (isCancelled()) return reject(new Error('Sign-in cancelled'));
      if (Date.now() > deadline) return reject(new Error('Sign-in timed out'));

      fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'client_id=' + encodeURIComponent(CLIENT_ID) +
              '&client_secret=' + encodeURIComponent(CLIENT_SECRET) +
              '&device_code=' + encodeURIComponent(deviceCode) +
              '&grant_type=' + encodeURIComponent(DEVICE_CODE_GRANT)
      })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.id_token) return resolve(data.id_token);
        if (data.error === 'authorization_pending') return setTimeout(tick, interval);
        if (data.error === 'slow_down') return setTimeout(tick, interval + 2000);
        reject(new Error(data.error_description || data.error || 'Unknown polling error'));
      })
      .catch(function(e) { reject(e); });
    }
    setTimeout(tick, interval);
  });
}

// ── Internal: exchange Google id_token for Firebase Auth ──────────────
function _exchangeForFirebase(googleIdToken) {
  return fetch(FIREBASE_IDP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      postBody: 'id_token=' + encodeURIComponent(googleIdToken) + '&providerId=google.com',
      requestUri: 'http://localhost',
      returnIdpCredential: true,
      returnSecureToken: true
    })
  })
  .then(function(r) {
    if (!r.ok) return r.json().then(function(e) { throw new Error(e.error.message || 'Firebase auth failed'); });
    return r.json();
  })
  .then(function(data) {
    return {
      uid: data.localId,
      idToken: data.idToken,
      refreshToken: data.refreshToken,
      expiresAt: Date.now() + (parseInt(data.expiresIn, 10) || 3600) * 1000
    };
  });
}

// ── Internal: refresh Firebase token ──────────────────────────────────
function _refreshFirebaseToken(refreshToken) {
  return fetch(FIREBASE_REFRESH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(refreshToken)
  })
  .then(function(r) {
    if (!r.ok) throw new Error('Token refresh failed: ' + r.status);
    return r.json();
  })
  .then(function(data) {
    return {
      uid: data.user_id,
      idToken: data.id_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + (parseInt(data.expires_in, 10) || 3600) * 1000
    };
  });
}

// ── Internal: localStorage persistence ────────────────────────────────
function _saveSession(session) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(session));
  } catch (e) { /* quota exceeded or unavailable */ }
}

function _loadSession() {
  try {
    var raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
