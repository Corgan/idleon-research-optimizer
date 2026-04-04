// ===== FARMING DATA =====
import { MarketExoticInfo, NinjaInfo } from '../game/customlists.js';

export function exoticParams(idx) {
  var e = MarketExoticInfo[idx];
  return e ? { base: Number(e[3]), farmSlot: idx + 20, type: 'decay', denom: 1000 } : null;
}

export function ninjaInfo(row) { return NinjaInfo[row] ? NinjaInfo[row].map(Number) : []; }
