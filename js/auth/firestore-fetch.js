// ===== FIRESTORE-FETCH.JS — Fetch + convert save data from Firebase =====
// Zero dependencies — pure fetch().
// Returns data in it.json format: { data, charNames, companion, serverVars }
//
// Usage:
//   import { fetchSave, getCachedSave, cacheSave } from './js/auth/firestore-fetch.js';
//   const saveObj = await fetchSave(session.uid, session.idToken);
//   // saveObj is ready for loadSaveData(saveObj)

var FIRESTORE_BASE = 'https://firestore.googleapis.com/v1/projects/idlemmo/databases/(default)/documents';
var RTDB_BASE      = 'https://idlemmo.firebaseio.com';

var LS_SAVE_KEY = 'idleon_save';
var LS_SAVE_TS  = 'idleon_save_ts';

/**
 * Fetch full save from Firebase (Firestore + Realtime Database).
 * Returns an object in it.json format ready for loadSaveData().
 *
 * @param {string} uid — Firebase user ID
 * @param {string} idToken — Firebase ID token
 * @returns {Promise<{data: object, charNames: string[], companion: object, serverVars: object}>}
 */
export async function fetchSave(uid, idToken) {
  // Fetch all sources in parallel
  var results = await Promise.all([
    _fetchFirestoreDoc('_data/' + uid, idToken),
    _fetchRTDB('_uid/' + uid, idToken),
    _fetchRTDB('_comp/' + uid, idToken),
    _fetchFirestoreDoc('_vars/_vars', idToken).catch(function() { return null; }),
    // Tournament Cloud Functions lack CORS headers (called via native bridge
    // in-game, not browser HTTP). RTDB gives us the player's {l, r} data.
    // The loader also reads OLA[496]/OLA[511] from main save for day/registration.
    _fetchRTDB('_tournament/' + uid, idToken).catch(function() { return null; })
  ]);

  var saveData    = results[0];
  var charNames   = results[1];
  var companion   = results[2];
  var serverVars  = results[3];
  var tourneyRaw  = results[4];

  console.log('[fetchSave] results:', {
    data: saveData ? Object.keys(saveData).length + ' keys' : null,
    charNames: charNames,
    companion: companion ? Object.keys(companion) : null,
    serverVars: serverVars,
    tournament: tourneyRaw
  });

  if (!saveData) throw new Error('No save data found for this account');

  // Compute current tournament day from wall-clock time.
  // Tournament days reset at 20:00 UTC: floor((unixSec + 14400) / 86400) - epoch.
  // Epoch offset calibrated from RTDB data: l=87 on May 16 2026 → 20502.
  var TOURNEY_EPOCH = 20502;
  var currentTourneyDay = Math.floor((Date.now() / 1000 + 14400) / 86400) - TOURNEY_EPOCH;

  // Build tournament object
  // global.T = live current day (computed), not stale player value
  // isRegistered = whether RTDB l matches the current day
  var tournament = { global: { T: currentTourneyDay } };
  if (tourneyRaw) {
    var lastRegDay = Number(tourneyRaw.l) || 0;
    tournament.isRegistered = (lastRegDay >= currentTourneyDay);
    tournament.rtdb = tourneyRaw;
  }

  console.log('[fetchSave] tournament:', {
    currentDay: currentTourneyDay,
    rtdb: tourneyRaw,
    isRegistered: tournament.isRegistered
  });

  // Return in it.json-compatible format
  return {
    data: saveData,
    charNames: charNames || [],
    companion: companion || {},
    serverVars: serverVars || {},
    tournament: tournament || {}
  };
}

/**
 * Get cached save from localStorage.
 * @returns {{ save: object, timestamp: number }|null}
 */
export function getCachedSave() {
  try {
    var raw = localStorage.getItem(LS_SAVE_KEY);
    if (!raw) return null;
    var ts = parseInt(localStorage.getItem(LS_SAVE_TS), 10) || 0;
    return { save: JSON.parse(raw), timestamp: ts };
  } catch (e) { return null; }
}

/**
 * Cache save data in localStorage.
 * @param {object} save
 */
export function cacheSave(save) {
  try {
    localStorage.setItem(LS_SAVE_KEY, JSON.stringify(save));
    localStorage.setItem(LS_SAVE_TS, String(Date.now()));
  } catch (e) { /* quota exceeded or unavailable */ }
}

/**
 * Clear cached save.
 */
export function clearCachedSave() {
  try {
    localStorage.removeItem(LS_SAVE_KEY);
    localStorage.removeItem(LS_SAVE_TS);
  } catch (e) { /* ignore */ }
}

// ── Firestore REST fetch ───────────────────────────────────────────────
function _fetchFirestoreDoc(path, idToken) {
  var url = FIRESTORE_BASE + '/' + path;
  return fetch(url, {
    headers: { 'Authorization': 'Bearer ' + idToken }
  })
  .then(function(r) {
    if (r.status === 404) return null;
    if (!r.ok) throw new Error('Firestore fetch failed: ' + r.status);
    return r.json();
  })
  .then(function(doc) {
    if (!doc || !doc.fields) return null;
    return _convertFields(doc.fields);
  });
}

// ── Realtime Database REST fetch ──────────────────────────────────────
function _fetchRTDB(path, idToken) {
  var url = RTDB_BASE + '/' + path + '.json?auth=' + encodeURIComponent(idToken);
  return fetch(url)
  .then(function(r) {
    if (!r.ok) throw new Error('RTDB fetch failed: ' + r.status);
    return r.json();
  })
  .then(function(data) {
    return data; // RTDB returns plain JSON, no conversion needed
  });
}

// ── Firestore typed format → plain JS ──────────────────────────────────
// Firestore REST API returns values wrapped in type descriptors:
//   { stringValue: "foo" }
//   { integerValue: "123" }
//   { doubleValue: 1.5 }
//   { booleanValue: true }
//   { nullValue: null }
//   { mapValue: { fields: { ... } } }
//   { arrayValue: { values: [ ... ] } }

function _convertValue(wrapped) {
  if (wrapped == null) return null;
  if ('stringValue'  in wrapped) return wrapped.stringValue;
  if ('integerValue' in wrapped) return parseInt(wrapped.integerValue, 10);
  if ('doubleValue'  in wrapped) return wrapped.doubleValue;
  if ('booleanValue' in wrapped) return wrapped.booleanValue;
  if ('nullValue'    in wrapped) return null;
  if ('mapValue'     in wrapped) return _convertFields(wrapped.mapValue.fields || {});
  if ('arrayValue'   in wrapped) return _convertArray(wrapped.arrayValue.values || []);
  // Timestamp, geopoint, reference — unlikely in game data but handle gracefully
  if ('timestampValue' in wrapped) return wrapped.timestampValue;
  return null;
}

function _convertFields(fields) {
  var out = {};
  for (var key in fields) {
    if (Object.prototype.hasOwnProperty.call(fields, key)) {
      out[key] = _convertValue(fields[key]);
    }
  }
  return out;
}

function _convertArray(values) {
  var out = [];
  for (var i = 0; i < values.length; i++) {
    out[i] = _convertValue(values[i]);
  }
  return out;
}
