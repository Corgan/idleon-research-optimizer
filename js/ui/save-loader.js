// ===== SAVE-LOADER.JS — Self-contained save import UI for calculator pages =====
// Injects HTML, CSS, and event handlers. Each page just provides a container
// element and a callback.
//
// Primary: file upload + JSON paste (always available).
// Optional: Google sign-in via device code flow (lazy-loaded on click).
//
// Usage:
//   import { initSaveLoader } from './js/ui/save-loader.js';
//   initSaveLoader({
//     target: '#save-area',
//     onLoad(saveData) { render(); },
//     statusText(sd) { return 'Bubble = 42%'; },  // optional extra status
//     auth: true,  // show Google sign-in button (optional, default false)
//   });

import { saveData } from '../state.js';
import { loadSaveData } from '../save/loader.js';

var _injectedCSS = false;

function _injectCSS() {
  if (_injectedCSS) return;
  _injectedCSS = true;
  var s = document.createElement('style');
  s.textContent = [
    '.sl-area{padding:16px;display:flex;gap:12px;align-items:center;background:var(--bg2);border-bottom:1px solid #333;flex-wrap:wrap}',
    '.sl-area label{font-weight:600}',
    '.sl-area input[type="file"]{color:var(--text2)}',
    '.sl-btn{padding:6px 16px;background:var(--accent);color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:.85em}',
    '.sl-btn:hover{filter:brightness(1.2)}',
    '.sl-btn-sm{padding:4px 10px;font-size:.8em}',
    '.sl-msg{font-size:.82em;margin-left:8px}',
    '.sl-msg.ok{color:var(--green)}',
    '.sl-msg.err{color:var(--red)}',
    '.sl-paste-wrap{display:none;padding:0 16px 12px;background:var(--bg2);gap:8px;align-items:flex-start}',
    '.sl-paste{flex:1;min-width:0;background:#111;border:1px solid #444;border-radius:4px;padding:6px 8px;color:var(--text);font-size:.8em;font-family:monospace;resize:vertical}',
    // Auth UI
    '.sl-auth-sep{color:var(--text2);margin:0 4px}',
    '.sl-auth-btn{background:#4285f4}',
    '.sl-auth-btn:hover{background:#5a95f5}',
    '.sl-auth-overlay{display:none;padding:12px 16px;background:var(--bg2);border-bottom:1px solid #333;font-size:.85em;color:var(--text2);align-items:center;gap:12px}',
    '.sl-auth-overlay code{background:#111;padding:4px 12px;border-radius:4px;font-size:1.3em;font-weight:700;color:var(--gold);letter-spacing:2px}',
    '.sl-auth-overlay a{color:var(--cyan)}',
    '.sl-auth-status{font-size:.82em;color:var(--text2);display:flex;align-items:center;gap:6px}',
    '.sl-cached-btn{background:#333;border:1px solid #555;color:var(--text2);font-size:.78em}',
    '.sl-cached-btn:hover{background:#444;color:var(--text)}',
    '.sl-signout{background:transparent;border:1px solid #555;color:var(--text2);font-size:.75em;padding:2px 8px}',
    '.sl-signout:hover{border-color:var(--red);color:var(--red)}',
  ].join('\n');
  document.head.appendChild(s);
}

/**
 * Inject save-import UI into the page and wire all events.
 *
 * @param {object}   opts
 * @param {string}   opts.target      — CSS selector for the container to inject into.
 *                                      A sibling paste-wrap div is created after it.
 * @param {function} opts.onLoad      — callback(saveData, parsedJSON) after successful load.
 * @param {function} [opts.statusText]— optional (saveData) => string for extra status info.
 * @param {boolean}  [opts.skipLoad]  — if true, don't call loadSaveData; let the page handle it.
 * @param {boolean}  [opts.auth]      — if true, show Google sign-in button (requires device-auth module).
 */
export function initSaveLoader(opts) {
  _injectCSS();

  var container = document.querySelector(opts.target);
  if (!container) { console.warn('save-loader: target not found:', opts.target); return; }

  // Build the import bar
  container.className = (container.className ? container.className + ' ' : '') + 'sl-area';

  var html =
    '<label>Load save:</label>' +
    '<input type="file" class="sl-file" accept=".json">' +
    '<span style="color:var(--text2);margin:0 4px">or</span>' +
    '<button class="sl-btn sl-btn-sm sl-paste-toggle">Paste JSON</button>';

  if (opts.auth) {
    html += '<span class="sl-auth-sep">or</span>' +
            '<button class="sl-btn sl-btn-sm sl-auth-btn sl-google-btn">\u{1F512} Google Sign\u2011in</button>' +
            '<span class="sl-auth-status"></span>';
  }

  html += '<span class="sl-msg"></span>';
  container.innerHTML = html;

  // Build the paste wrap (sibling after container)
  var wrap = document.createElement('div');
  wrap.className = 'sl-paste-wrap';
  wrap.innerHTML =
    '<textarea class="sl-paste" rows="3" placeholder="Paste it.json or save.json contents here..."></textarea>' +
    '<button class="sl-btn sl-paste-load">Load</button>';
  container.parentNode.insertBefore(wrap, container.nextSibling);

  // Build the auth overlay (sibling after paste wrap, hidden by default)
  var authOverlay = null;
  if (opts.auth) {
    authOverlay = document.createElement('div');
    authOverlay.className = 'sl-auth-overlay';
    wrap.parentNode.insertBefore(authOverlay, wrap.nextSibling);
  }

  // Element refs
  var fileInput = container.querySelector('.sl-file');
  var pasteBtn  = container.querySelector('.sl-paste-toggle');
  var msgEl     = container.querySelector('.sl-msg');
  var textarea  = wrap.querySelector('.sl-paste');
  var loadBtn   = wrap.querySelector('.sl-paste-load');

  function doLoad(raw) {
    try {
      var save = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!opts.skipLoad) loadSaveData(save);
      msgEl.className = 'sl-msg ok';
      var extra = opts.statusText ? opts.statusText(saveData) : '';
      msgEl.textContent = '\u2713 Loaded!' + (extra ? ' ' + extra : '');
      if (opts.onLoad) opts.onLoad(saveData, save);
    } catch (e) {
      msgEl.className = 'sl-msg err';
      msgEl.textContent = '\u2717 ' + e.message;
    }
  }

  fileInput.addEventListener('change', function(e) {
    var f = e.target.files[0]; if (!f) return;
    var r = new FileReader();
    r.onload = function(ev) {
      textarea.value = ev.target.result;
      doLoad(ev.target.result);
    };
    r.readAsText(f);
  });

  pasteBtn.addEventListener('click', function() {
    wrap.style.display = wrap.style.display === 'flex' ? 'none' : 'flex';
  });

  loadBtn.addEventListener('click', function() {
    var txt = textarea.value.trim();
    if (txt) doLoad(txt);
  });

  // ── Auth integration (optional, lazy-loaded) ─────────────────────────
  if (opts.auth) {
    var googleBtn  = container.querySelector('.sl-google-btn');
    var authStatus = container.querySelector('.sl-auth-status');

    // Check for cached save on load
    _checkCachedSave(authStatus, doLoad);

    googleBtn.addEventListener('click', function() {
      _handleGoogleSignIn(googleBtn, authStatus, authOverlay, msgEl, doLoad);
    });
  }
}

// ── Auth helpers (lazy-import the auth modules) ────────────────────────

var AUTO_REFRESH_MS = 5 * 60 * 1000; // 5 minutes
var _refreshTimer = null;
var _countdownTimer = null;
var _countdownEnd = 0;

/** Build the signed-in status bar: age label + Refresh (with countdown) + Sign out */
function _renderAuthStatus(authStatus, doLoad, ageLabel) {
  var parts = '<span style="color:var(--green)">\u2713 ' + (ageLabel || 'Signed in') + '</span>' +
    '<button class="sl-btn sl-btn-sm sl-cached-btn sl-refresh-btn">Refresh</button>' +
    '<button class="sl-btn sl-signout sl-signout-btn">Sign out</button>';
  authStatus.innerHTML = parts;
  authStatus.querySelector('.sl-refresh-btn').addEventListener('click', function() {
    _fetchAndLoad(authStatus, doLoad);
  });
  authStatus.querySelector('.sl-signout-btn').addEventListener('click', function() {
    _stopAutoRefresh();
    Promise.all([
      import('../auth/device-auth.js'),
      import('../auth/firestore-fetch.js')
    ]).then(function(modules) {
      modules[0].signOut();
      modules[1].clearCachedSave();
      authStatus.innerHTML = '';
    });
  });
}

function _ageStr(ts) {
  var age = Date.now() - ts;
  if (age < 60000) return '<1m ago';
  if (age < 3600000) return Math.round(age / 60000) + 'm ago';
  if (age < 86400000) return Math.round(age / 3600000) + 'h ago';
  return Math.round(age / 86400000) + 'd ago';
}

function _startAutoRefresh(authStatus, doLoad) {
  _stopAutoRefresh();
  _countdownEnd = Date.now() + AUTO_REFRESH_MS;
  _refreshTimer = setInterval(function() {
    _fetchAndLoad(authStatus, doLoad, true);
    _countdownEnd = Date.now() + AUTO_REFRESH_MS;
  }, AUTO_REFRESH_MS);
  _countdownTimer = setInterval(function() {
    var btn = authStatus.querySelector('.sl-refresh-btn');
    if (!btn) return;
    var sec = Math.max(0, Math.ceil((_countdownEnd - Date.now()) / 1000));
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    btn.textContent = 'Refresh (' + m + ':' + (s < 10 ? '0' : '') + s + ')';
  }, 1000);
}

function _stopAutoRefresh() {
  if (_refreshTimer) { clearInterval(_refreshTimer); _refreshTimer = null; }
  if (_countdownTimer) { clearInterval(_countdownTimer); _countdownTimer = null; }
}

function _checkCachedSave(authStatus, doLoad, msgEl) {
  Promise.all([
    import('../auth/device-auth.js'),
    import('../auth/firestore-fetch.js')
  ]).then(function(modules) {
    var auth = modules[0];
    var store = modules[1];
    var signedIn = auth.isSignedIn();
    var cached = store.getCachedSave();

    if (cached) {
      // Auto-load cached save immediately — works even if session expired
      doLoad(cached.save);
      if (signedIn) {
        _renderAuthStatus(authStatus, doLoad, 'Loaded (' + _ageStr(cached.timestamp) + ')');
        _startAutoRefresh(authStatus, doLoad);
      } else {
        // Cache exists but session expired — show what we loaded, no refresh
        authStatus.innerHTML = '<span style="color:var(--text2)">Cached (' + _ageStr(cached.timestamp) + ') \u2014 sign in to refresh</span>';
      }
    } else if (signedIn) {
      // Signed in but no cache — fetch now
      _fetchAndLoad(authStatus, doLoad);
    }
  }).catch(function() {
    // Auth modules not available — silently skip
  });
}

function _handleGoogleSignIn(googleBtn, authStatus, overlay, msgEl, doLoad) {
  Promise.all([
    import('../auth/device-auth.js'),
    import('../auth/firestore-fetch.js')
  ]).then(function(modules) {
    var auth = modules[0];
    var store = modules[1];

    googleBtn.disabled = true;
    googleBtn.textContent = 'Starting\u2026';

    auth.startSignIn().then(function(pending) {
      // Show the device code overlay
      overlay.style.display = 'flex';
      overlay.innerHTML =
        'Go to <a href="' + pending.verificationUrl + '" target="_blank" rel="noopener">' +
        pending.verificationUrl + '</a> and enter code: ' +
        '<code>' + pending.userCode + '</code> ' +
        '<button class="sl-btn sl-btn-sm" style="background:#555" onclick="this.closest(\'.sl-auth-overlay\').style.display=\'none\'">Cancel</button>' +
        '<span style="margin-left:8px;color:var(--text2)">Waiting for authorization\u2026</span>';

      pending.complete.then(function(session) {
        overlay.style.display = 'none';
        googleBtn.disabled = false;
        googleBtn.textContent = '\u{1F512} Google Sign\u2011in';
        authStatus.innerHTML = '<span style="color:var(--green)">\u2713 Signed in</span> <span style="color:var(--text2)">Fetching save\u2026</span>';

        // Fetch save from Firestore
        return store.fetchSave(session.uid, session.idToken).then(function(saveObj) {
          store.cacheSave(saveObj);
          authStatus.innerHTML =
            '<span style="color:var(--green)">\u2713 Signed in</span>' +
            '<button class="sl-btn sl-btn-sm sl-cached-btn sl-refresh-btn">Refresh</button>' +
            '<button class="sl-btn sl-signout sl-signout-btn">Sign out</button>';
          authStatus.querySelector('.sl-refresh-btn').addEventListener('click', function() {
            _fetchAndLoad(authStatus, doLoad);
          });
          authStatus.querySelector('.sl-signout-btn').addEventListener('click', function() {
            auth.signOut();
            store.clearCachedSave();
            authStatus.innerHTML = '';
          });
          doLoad(saveObj);
        });
      }).catch(function(e) {
        overlay.style.display = 'none';
        googleBtn.disabled = false;
        googleBtn.textContent = '\u{1F512} Google Sign\u2011in';
        msgEl.className = 'sl-msg err';
        msgEl.textContent = '\u2717 ' + e.message;
      });
    }).catch(function(e) {
      googleBtn.disabled = false;
      googleBtn.textContent = '\u{1F512} Google Sign\u2011in';
      msgEl.className = 'sl-msg err';
      msgEl.textContent = '\u2717 ' + e.message;
    });
  }).catch(function(e) {
    msgEl.className = 'sl-msg err';
    msgEl.textContent = '\u2717 Auth module not available';
  });
}

function _fetchAndLoad(authStatus, doLoad, silent) {
  Promise.all([
    import('../auth/device-auth.js'),
    import('../auth/firestore-fetch.js')
  ]).then(function(modules) {
    var auth = modules[0];
    var store = modules[1];

    if (!silent) authStatus.innerHTML = '<span style="color:var(--text2)">Refreshing\u2026</span>';
    auth.getSession().then(function(session) {
      if (!session) {
        _stopAutoRefresh();
        authStatus.innerHTML = '<span style="color:var(--red)">Session expired — sign in again</span>';
        return;
      }
      return store.fetchSave(session.uid, session.idToken).then(function(saveObj) {
        store.cacheSave(saveObj);
        _renderAuthStatus(authStatus, doLoad, 'Refreshed');
        _startAutoRefresh(authStatus, doLoad);
        doLoad(saveObj);
      });
    }).catch(function(e) {
      authStatus.innerHTML = '<span style="color:var(--red)">\u2717 ' + e.message + '</span>';
    });
  });
}
