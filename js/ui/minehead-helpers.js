// ===== MINEHEAD HELPERS — Shared state & utility functions for minehead subtabs =====
import { saveData } from '../state.js';
import { superBitType, cloudBonus, emporiumBonus } from '../game-helpers.js';
import { MINEHEAD_UPG, MINEHEAD_NAMES, GRID_DIMS } from '../stats/data/w7/minehead.js';
import { upgradeQTY, bluecrownMulti, jackpotOdds, jackpotTiles } from '../stats/systems/w7/minehead.js';

// ===== Shared mutable state =====
export const mhState = {
  inferResult: null,
  playDecisions: [],
  playGames: 0,
  showSpoiler: false,
  PLAY_RIGGED: false,
};

const _LS_KEY = 'mh_inferred_strategy';
const _LS_DECISIONS_KEY = 'mh_play_decisions';

export function saveInferred() {
  if (!mhState.inferResult || !mhState.inferResult.params) return;
  try { localStorage.setItem(_LS_KEY, JSON.stringify(mhState.inferResult)); } catch (e) { /* full */ }
}

export function saveDecisions() {
  try { localStorage.setItem(_LS_DECISIONS_KEY, JSON.stringify({ d: mhState.playDecisions, g: mhState.playGames })); } catch (e) { /* full */ }
}

export function loadInferred() {
  try {
    const raw = localStorage.getItem(_LS_KEY);
    if (raw) mhState.inferResult = JSON.parse(raw);
  } catch (e) { /* corrupt */ }
  try {
    const raw = localStorage.getItem(_LS_DECISIONS_KEY);
    if (raw) {
      const obj = JSON.parse(raw);
      if (Array.isArray(obj.d)) { mhState.playDecisions = obj.d; mhState.playGames = obj.g || 0; }
    }
  } catch (e) { /* corrupt */ }
}

export function getInferredParams() {
  return mhState.inferResult?.params ?? null;
}

export function clearInferred() {
  mhState.playDecisions.length = 0;
  mhState.playGames = 0;
  mhState.inferResult = null;
  try { localStorage.removeItem(_LS_KEY); } catch (e) { /* */ }
  try { localStorage.removeItem(_LS_DECISIONS_KEY); } catch (e) { /* */ }
}

export function mineReduction() {
  return Math.min(1, superBitType(66, saveData.gamingData?.[12]))
       + Math.min(1, cloudBonus(41, saveData.weeklyBossData))
       + Math.min(1, emporiumBonus(45, saveData.ninjaData?.[102]?.[9]));
}

// ===== Upgrade description formatter =====
const _MULTI_TILE_VALUES = [1.0,1.2,1.4,1.6,2,3,4,5,6,7,8,8,8,8];
const _ADDITIVE_PCT = [0,10,20,50,100,200,500,1000,2000,5000,10000];

export function fmtUpgDesc(i, lv, qty, lvs, highestDmg) {
  const u = MINEHEAD_UPG[i];
  let d = u.desc;

  d = d.replace(/\{/g, qty.toLocaleString());
  d = d.replace(/\}/g, (1 + qty / 100).toFixed(2));

  if (i === 1) {
    if (lv >= 17) d = 'Your max possible number is 19, the MAXIMUM!';
    else d = d.replace(/\$/g, String(Math.round(1 + (qty + 1 + Math.min(1, Math.floor((qty + 1) / 9))))));
  } else if (i === 2) {
    if (lv >= 16) d = 'Your grid is 12x6, a full grid!';
    else {
      const next = GRID_DIMS[lv + 1] || GRID_DIMS[lv];
      const [nc, nr] = next.split(',');
      const cur = GRID_DIMS[lv];
      const [cc, cr] = cur.split(',');
      d = `Expands grid to ${nc}x${nr} (${nc * nr} tiles), current ${cc}x${cr}`;
    }
  } else if (i === 12) {
    if (qty === 0) d = 'Unlocks Multiplier Tiles!';
    else d = d.replace(/\$/g, (_MULTI_TILE_VALUES[qty] || 1) + 'x');
  } else if (i === 14) {
    const bcm = bluecrownMulti(lvs);
    d = d.replace(/\$/g, bcm.toFixed(2) + 'x');
  } else if (i === 17) {
    if (qty === 0) d = 'Unlocks Additive Tiles!';
    else d = d.replace(/\$/g, (_ADDITIVE_PCT[qty] || 0) + '%');
  } else if (i === 23) {
    const jo = jackpotOdds(lvs);
    if (jo === 0) d = 'Unlocks JACKPOT Tiles!';
    else d = d.replace(/\$/g, String(Math.ceil(1 / jo)));
  } else if (i === 24) {
    d = d.replace(/\$/g, String(Math.ceil(jackpotTiles(lvs))));
  } else if (i === 26) {
    const disc = Math.round(1e4 * (1 - 1 / (1 + qty / 100))) / 100;
    d = d.replace(/\$/g, String(disc));
  } else if (i === 28) {
    const log10 = highestDmg > 0 ? Math.log10(highestDmg) : 0;
    const total = qty * log10;
    d = `+${qty.toLocaleString()}% Mine Currency per POW 10 of best hit, +${_fmt(total)}% total`;
  }

  return d;
}

// Re-export fmtNum for sub-modules
import { fmtNum as _fmt } from '../renderers/format.js';
export { _fmt };
