// ===== STAR SIGN SYSTEM =====
// Sum of all star sign bonuses for a given type.
// All star signs are active (enabledStarSigns covers all indices).
// Applies Seraph_Cosmos multiplier: chipMulti × meritocMulti × seraphMulti.

import { node, treeResult } from '../../node.js';
import { label } from '../../entity-names.js';
import { labData } from '../../../save/data.js';
import { starSignDropVal } from '../../data/common/starSign.js';
import { computeMeritocBonusz } from '../w7/meritoc.js';
import { computeShinyBonusS } from '../w4/breeding.js';
import { StarSigns } from '../../data/game/customlists.js';

// Map bonus type → sign indices and accessor
var SIGN_TABLES = {
  drop: { indices: [14, 76], val: starSignDropVal },
};


// Silkrode Nanochip = chip ID 15, key "star", value 1
var STAR_CHIP_ID = 15;

function hasStarChip(charIdx) {
  var chipSlots = labData && labData[1 + charIdx];
  if (!chipSlots) return false;
  for (var slot = 0; slot < 7; slot++) {
    if (Number(chipSlots[slot]) === STAR_CHIP_ID) return true;
  }
  return false;
}

/**
 * Compute the Seraph_Cosmos multiplier for all star sign bonuses.
 * Game: chipMulti × meritocMulti × min(5, pow(1.1 + min(Arcane[40],10)/100, ceil((summonLv+1)/20)))
 * Only applies when Seraph_Cosmos is unlocked in StarSignsUnlocked.
 * @param {number} charIdx - character index (for chip lookup)
 * @returns {number} total multiplier (>= 1)
 */
export function computeSeraphMulti(charIdx, saveData) {
  if (!saveData.starSignsUnlocked || !('Seraph_Cosmos' in saveData.starSignsUnlocked)) return 1;

  var arcane40 = Number(saveData.arcaneData && saveData.arcaneData[40]) || 0;
  // Summoning level = Lv0[18] for current char (game uses Lv0, not SL_)
  var lv0 = saveData.lv0AllData && saveData.lv0AllData[charIdx];
  var summonLv = Number(lv0 && lv0[18]) || 0;
  var seraphBase = 1.1 + Math.min(arcane40, 10) / 100;
  var seraphExp = Math.ceil((summonLv + 1) / 20);
  var seraphMulti = Math.min(5, Math.pow(seraphBase, seraphExp));

  // chipBonuses("star"): Silkrode Nanochip (chip 15) equipped on this char?
  var starChip = hasStarChip(charIdx);
  // enabledStarSigns: rift[0]>=10 → at least 5; else 0
  // chipMulti = max(1, min(2, 1 + chipBon * floor((999+enabled)/1000)))
  var riftLv = Number(saveData.riftData && saveData.riftData[0]) || 0;
  var enabledSS = riftLv >= 10 ? 5 : 0; // base 5; ShinyBonusS(3) adds more but floor((999+5)/1000)=1 already
  var chipMulti = (starChip && enabledSS >= 1) ? 2 : 1;

  // MeritocBonusz(22): star sign multi from voting
  var meritoc22 = computeMeritocBonusz(22, saveData, charIdx);
  var meritocMulti = 1 + meritoc22 / 100;

  return chipMulti * meritocMulti * seraphMulti;
}

export var starSign = {
  resolve: function(id, ctx) {
    var saveData = ctx.saveData;
    var effectKey = id === 'drop' ? 'Drop' : id;
    var result = computeStarSignBonus(effectKey, ctx.charIdx, saveData);
    return node('Active Star Signs: Drop Rate', Number(result) || 0, result.children || null, { fmt: '+' });
  },
};

// ==================== STAR SIGN BONUS (aggregated) ====================

import { starSignData as starSignCharData, numCharacters as _ssNumChars } from '../../../save/data.js';

// Game hardcodes per-sign bonuses by index. Description strings don't match keys.
// Map: effectKey → { signIndex: baseValue }
var SIGN_BONUSES = {
  FightAFK: { 19: 2, 28: 6, 29: -6, 56: 4 },
  SkillAFK: { 20: 2, 25: 1, 29: -6, 55: 4 },
  SkillEXP: { 30: 3, 50: 6 },
  MainXP:   { 2: 1, 24: 3, 52: 6 },
  WorshExp: { 46: 15 },
  Drop:     { 14: 5, 76: 12 },
  PctDmg:   { 0: 1, 32: 2, 51: 20, 53: 6, 54: 15, 70: 25 },
  WepPow:   { 12: 2 },
  AccPct:   { 13: 4, 35: 10 },
  CritChance: { 27: 4 },
  DivExp:   { 62: 30 },
  MoveSpd:  { 1: 2, 8: 4, 13: 2, 32: -3, 51: -12 },
  TotalHP:  { 28: -80 },
  DefPct:   { 12: 6, 28: -50, 32: 5, 36: 10 },
  FoodEffect: { 22: 15 },
  GFood: { 69: 20 },
  Jade:     { 75: 10 },
  Stealth:  { 73: 12 },
  ArtifactFind: { 61: 15 },
  SailingSpd: { 63: 20 },
  CropEvoPerFarmLv: { 65: 3 },
  FarmingEXP: { 66: 20 },
  OGChance: { 67: 15 },
  MobRespawn: { 26: 2, 49: 4 },
  pctCardDrop: { 41: 15 },
  CarryCap: { 11: 10, 25: 5, 29: 30 },
};

// Game accumulates star sign bonuses from ALL unlocked signs (via RiftStuff enabledStarSigns)
// AND equipped signs, then multiplies by the seraph multi for the current char.
// Infinite Star Signs (Rift): if signIndex < enabledStarSigns, negative bonuses are removed.
export function getEnabledStarSigns(saveData) {
  var riftLv = Number(saveData.riftData && saveData.riftData[0]) || 0;
  return riftLv >= 10 ? 5 + computeShinyBonusS(3, saveData) : 0;
}

export function isStarSignActive(signIdx, charIdx, enabled, saveData) {
  var equipped = String(starSignCharData[charIdx] || '').split(',');
  if (equipped.indexOf(String(signIdx)) !== -1) return true;
  if (signIdx >= enabled) return false;
  var signName = StarSigns[signIdx] && StarSigns[signIdx][0];
  return !!(signName && saveData.starSignsUnlocked
    && Object.prototype.hasOwnProperty.call(saveData.starSignsUnlocked, signName));
}

// Positive equipped signs are processed a second time by Silkrode Nanochip when
// infinite signs are unavailable. With infinite signs, the chip multiplier is
// applied in Seraph Cosmos instead.
export function computePositiveStarSignMultiplier(charIdx, saveData) {
  var enabled = getEnabledStarSigns(saveData);
  var equippedPass = hasStarChip(charIdx) && enabled < 1 ? 2 : 1;
  return equippedPass * computeSeraphMulti(charIdx, saveData);
}

export function computeStarSignBonus(key, ci, saveData) {
  var bonusMap = SIGN_BONUSES[key];
  if (!bonusMap) return treeResult(0, null);
  var enabled = getEnabledStarSigns(saveData);
  var total = 0;
  var children = [];
  var signIndices = Object.keys(bonusMap);
  for (var i = 0; i < signIndices.length; i++) {
    var sigIdx = Number(signIndices[i]);
    var val = bonusMap[sigIdx];
    if (key === 'MobRespawn' && sigIdx === 49
      && (Number(saveData.lv0AllData?.[ci]?.[0]) || 0) < 60) continue;
    if (!isStarSignActive(sigIdx, ci, enabled, saveData)) continue;
    if (val < 0 && sigIdx < enabled) continue;
    total += val;
    children.push(node('Sign ' + sigIdx, val, null, { fmt: 'raw' }));
  }
  var seraphMulti = 1;
  if (total > 0) {
    seraphMulti = computePositiveStarSignMultiplier(ci, saveData);
    total *= seraphMulti;
  }
  if (seraphMulti !== 1 && children.length) children.push(node('Seraph Multi', seraphMulti, null, { fmt: 'x' }));
  return treeResult(total, children);
}
