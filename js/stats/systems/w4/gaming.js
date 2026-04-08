// ===== GAMING SYSTEM (W4) =====
// MSA_Bonus (gaming superbits), SlabboBonus (card slabbo).

import { saveData } from '../../../state.js';
import { superBitType, emporiumBonus } from '../../../game-helpers.js';
import { mainframeBonus } from './lab.js';
import { computeMeritocBonusz } from '../w7/meritoc.js';
import { legendPTSbonus } from '../w7/spelunking.js';

// ==================== GAMING STARS ====================

function gamingStars() {
  var s = saveData;
  var ti = s.totemInfoData;
  if (!ti || !ti[0]) return 0;
  var sum = 0;
  for (var i = 0; i < ti[0].length; i++) sum += Number(ti[0][i]) || 0;
  return sum;
}

// ==================== MSA_BONUS ====================
// MSA_Bonus(idx) — gaming superbit milestone bonuses.
// Requires gaming stars and per-index superbit/emporium gate checks.

var MSA_CONFIG = [
  // [superBitIdx, multiplier, offset, gateType]
  // gateType: 0 = superBitType, 1 = emporiumBonus
  { gate: 0, gateIdx: 7,  mult: 1,    offset: 0 },   // 0: DMG
  { gate: 0, gateIdx: 13, mult: 13,   offset: 0 },   // 1: SPD
  { gate: 0, gateIdx: 3,  mult: 1,    offset: 0 },   // 2: SPD
  { gate: 0, gateIdx: 20, mult: 50,   offset: 0 },   // 3: BitRate
  { gate: 0, gateIdx: 11, mult: 1.12, offset: 0 },   // 4: ClassXP
  { gate: 0, gateIdx: 16, mult: 1,    offset: 0 },   // 5: SkillXP
  { gate: 1, gateIdx: 12, mult: 1.75, offset: 0 },   // 6: EXP
  { gate: 1, gateIdx: 13, mult: 2,    offset: 0 },   // 7: Jade
  { gate: 1, gateIdx: 14, mult: 1.5,  offset: 0 },   // 8: Essence
  { gate: 0, gateIdx: 27, mult: 2.5,  offset: 300 }, // 9: POW
  { gate: 0, gateIdx: 44, mult: 0.3,  offset: 300 }, // 10: ResearchXP
];

export function computeMSABonus(idx) {
  var cfg = MSA_CONFIG[idx];
  if (!cfg) return 0;
  var g12 = saveData.gamingData && saveData.gamingData[12];
  var ninja = saveData.ninjaData;
  var ninjaStr = ninja && ninja[10] && ninja[10][2] && ninja[10][2][9];
  var unlocked = cfg.gate === 0
    ? superBitType(cfg.gateIdx, g12)
    : emporiumBonus(cfg.gateIdx, ninjaStr);
  if (!unlocked) return 0;
  var stars = gamingStars();
  var base = Math.max(0, Math.floor((stars - cfg.offset) / 10));
  return cfg.mult * base;
}

// ==================== SLABBO BONUS ====================
// SlabboBonus(idx) — card collection milestones.
// AllMulti = (1+Meritoc23/100) * (1+Legend28/100) * (1+VaultUpg74/100)
// idx 6: SuperBitType(25) → 3 * (1+MF15/100) * AllMulti * floor(max(0,Cards1.length-1300)/5)
// idx 7: SuperBitType(34) → 0.1 * (1+MF15/100) * AllMulti * floor(max(0,Cards1.length-1300)/5)

function slabboAllMulti() {
  var meritoc23 = 0;
  try { meritoc23 = computeMeritocBonusz(23); } catch(e) {}
  var legend28 = 0;
  try { legend28 = legendPTSbonus(28); } catch(e) {}
  // VaultUpg(74) — from summoning vault upgrades
  // For now we skip VaultUpg since it requires summoning system wiring
  var vault74 = 0;
  return (1 + meritoc23 / 100) * (1 + legend28 / 100) * (1 + vault74 / 100);
}

export function computeSlabboBonus(idx) {
  var g12 = saveData.gamingData && saveData.gamingData[12];
  var ninja = saveData.ninjaData;
  var ninjaStr = ninja && ninja[10] && ninja[10][2] && ninja[10][2][9];
  var cards1Len = (saveData.cards1Data && saveData.cards1Data.length) || 0;

  if (idx === 4) {
    if (!emporiumBonus(17, ninjaStr)) return 0;
    var mf15 = 0; try { mf15 = mainframeBonus(15); } catch(e) {}
    return 5 * (1 + mf15 / 100) * slabboAllMulti() * Math.floor(Math.max(0, cards1Len - 1000) / 10);
  }
  if (idx === 5) {
    if (!emporiumBonus(18, ninjaStr)) return 0;
    var mf15b = 0; try { mf15b = mainframeBonus(15); } catch(e) {}
    return 3 * (1 + mf15b / 100) * slabboAllMulti() * Math.floor(Math.max(0, cards1Len - 1000) / 10);
  }
  if (idx === 6) {
    if (!superBitType(25, g12)) return 0;
    var mf15c = 0; try { mf15c = mainframeBonus(15); } catch(e) {}
    return 3 * (1 + mf15c / 100) * slabboAllMulti() * Math.floor(Math.max(0, cards1Len - 1300) / 5);
  }
  if (idx === 7) {
    if (!superBitType(34, g12)) return 0;
    var mf15d = 0; try { mf15d = mainframeBonus(15); } catch(e) {}
    return 0.1 * (1 + mf15d / 100) * slabboAllMulti() * Math.floor(Math.max(0, cards1Len - 1300) / 5);
  }
  return 0;
}
