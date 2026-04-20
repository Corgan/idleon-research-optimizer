// ===== GAME MECHANIC HELPERS =====
// Pure lookup functions for game mechanics (event shop, superbits, emporium, ribbons).
// No save-data dependency — all inputs passed as parameters.

import { N2L } from './game-data.js';
import { EMPEROR_SET_BONUS_VAL } from './stats/data/common/emperor.js';

export function eventShopOwned(t, eventShopStr) {
  if (t < 0 || t >= N2L.length || !eventShopStr) return 0;
  return eventShopStr.includes(N2L[t]) ? 1 : 0;
}

/** Precompute all event shop owned flags into an array. */
export function buildEventShopArray(eventShopStr) {
  var arr = new Array(N2L.length);
  for (var i = 0; i < arr.length; i++) arr[i] = eventShopStr && eventShopStr.includes(N2L[i]) ? 1 : 0;
  return arr;
}

export function superBitType(t, gamingData12) {
  if (t < 0 || t >= N2L.length) return 0;
  return String(gamingData12 || '').includes(N2L[t]) ? 1 : 0;
}

/** Precompute all superbit flags into an array. */
export function buildSuperBitArray(gamingData12) {
  var s = String(gamingData12 || '');
  var arr = new Array(N2L.length);
  for (var i = 0; i < arr.length; i++) arr[i] = s.includes(N2L[i]) ? 1 : 0;
  return arr;
}

export function emporiumBonus(t, ninjaData102_9) {
  if (t < 0 || t >= N2L.length) return 0;
  return String(ninjaData102_9 || '').includes(N2L[t]) ? 1 : 0;
}

/** Precompute all emporium bonus flags into an array. */
export function buildEmporiumArray(ninjaData102_9) {
  var s = String(ninjaData102_9 || '');
  var arr = new Array(N2L.length);
  for (var i = 0; i < arr.length; i++) arr[i] = s.includes(N2L[i]) ? 1 : 0;
  return arr;
}

export function ribbonBonusAt(index, ribbonData, olaStr379, weeklyBossData) {
  const t = ribbonData[index] || 0;
  if (t <= 0) return 1;
  const hasEmperorSet = String(olaStr379 || '').includes('EMPEROR_SET');
  const empTerm = hasEmperorSet ? Math.floor(t / 4) * (EMPEROR_SET_BONUS_VAL / 4) : 0;
  const cb73 = weeklyBossData ? Math.floor(t / 10) * cloudBonus(73, weeklyBossData) : 0;
  return 1 + (Math.floor(5 * t + Math.floor(t / 2) * (4 + 6.5 * Math.floor(t / 5))) + empTerm + cb73) / 100;
}

// CloudBonus(n): returns 1 if dream challenge n is completed, 0 otherwise.
// Game: -1 == WeeklyBoss.h["d_" + n] ? 1 : 0
export function cloudBonus(n, weeklyBossData) {
  return (Number(weeklyBossData && weeklyBossData['d_' + n]) === -1) ? 1 : 0;
}
