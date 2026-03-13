// ===== SAVE DATA HELPERS =====

import { labData } from './data.js';
import { EMPEROR_SET_BONUS_VAL, N2L } from '../game-data.js';

export function parseSaveKey(save, key) {
  const raw = save[key];
  if (raw == null) return null;
  if (typeof raw === 'string') { try { return JSON.parse(raw); } catch(e) { console.warn('parseSaveKey JSON error for key', key, e); return raw; } }
  return raw;
}

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

export function labJewelUnlocked(idx) {
  return (labData?.[14]?.[idx] || 0) === 1;
}

