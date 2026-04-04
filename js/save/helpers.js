// ===== SAVE DATA HELPERS =====

import { labData } from './data.js';

export function parseSaveKey(save, key) {
  const raw = save[key];
  if (raw == null) return null;
  if (typeof raw === 'string') { try { return JSON.parse(raw); } catch(e) { console.warn('parseSaveKey JSON error for key', key, e); return raw; } }
  return raw;
}

export function labJewelUnlocked(idx) {
  return (labData?.[14]?.[idx] || 0) === 1;
}

