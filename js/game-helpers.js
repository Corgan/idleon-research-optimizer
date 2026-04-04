// ===== GAME MECHANIC HELPERS =====
// Pure lookup functions for game mechanics (event shop, superbits, emporium, ribbons).
// No save-data dependency — all inputs passed as parameters.

import { N2L } from './game-data.js';
import { EMPEROR_SET_BONUS_VAL } from './stats/data/common/emperor.js';

export function eventShopOwned(t, eventShopStr) {
  if (t < 0 || t >= N2L.length) return 0;
  return eventShopStr.includes(N2L[t]) ? 1 : 0;
}

export function superBitType(t, gamingData12) {
  if (t < 0 || t >= N2L.length) return 0;
  return String(gamingData12 || '').includes(N2L[t]) ? 1 : 0;
}

export function emporiumBonus(t, ninjaData102_9) {
  if (t < 0 || t >= N2L.length) return 0;
  return String(ninjaData102_9 || '').includes(N2L[t]) ? 1 : 0;
}

export function ribbonBonusAt(index, ribbonData, olaStr379) {
  const t = ribbonData[index] || 0;
  if (t <= 0) return 1;
  const hasEmperorSet = String(olaStr379 || '').includes('EMPEROR_SET');
  const empTerm = hasEmperorSet ? Math.floor(t / 4) * (EMPEROR_SET_BONUS_VAL / 4) : 0;
  return 1 + (Math.floor(5 * t + Math.floor(t / 2) * (4 + 6.5 * Math.floor(t / 5))) + empTerm) / 100;
}
