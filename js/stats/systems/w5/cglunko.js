// ========== CGLUNKO UPGRADES (C18) ==========
// Save data: OLA[630+i] = upgrade levels (i=0..23, two pages of 12)
//            OLA[654+i] = blue stone counts (i=0..5)
//            OLA[660+i] = purple stone counts (i=0..5)
// Game data: RandoListo2[12] = descriptions, [13] = perLvVal, [14] = costBase

import { getLOG } from '../../../formulas.js';
import { RandoListo2 } from '../../data/game/customlists.js';
import { optionsListData } from '../../../save/data.js';

var _descs = RandoListo2[12];   // 24 description strings
var _perLv = RandoListo2[13];   // 24 per-level bonus values
var _costB = RandoListo2[14];   // 24 cost bases

export var UPGRADE_COUNT = 24;
export var PAGE_SIZE = 12;

// ========== SAVE HELPERS ==========
function _ola(idx) {
  return Number(optionsListData[idx]) || 0;
}

// ========== UPGRADE DATA ==========
export function upgLevel(saveData, idx) {
  return _ola(630 + idx);
}

export function upgPerLvVal(idx) {
  return Number(_perLv[idx]) || 0;
}

export function upgCostBase(idx) {
  return Number(_costB[idx]) || 0;
}

export function upgDescription(idx) {
  return (_descs[idx] || '').replace(/_/g, ' ');
}

// ========== UPGRADE BONUS ==========
// Cglunko_upgBon(i) = OLA[630+i] * RandoListo2[13][i]
export function upgBonus(saveData, idx) {
  return upgLevel(saveData, idx) * upgPerLvVal(idx);
}

// ========== UPGRADE COST ==========
// base = (pow(costBase, level) + level) * (1 / (1 + upgBon(7)/100))
// if odd index: base *= 5
// if OLA[604] < StudyBolaiaBonuses(17): base *= 0.85  (ext.bolaia17discount)
// final rounding for display
export function upgCost(saveData, idx, ext) {
  ext = ext || {};
  var lv = upgLevel(saveData, idx);
  var base = (Math.pow(upgCostBase(idx), lv) + lv) * (1 / (1 + upgBonus(saveData, 7) / 100));
  if (idx % 2 === 1) base *= 5;
  if (ext.bolaia17discount) base *= 0.85;
  return base < 1e6 ? Math.round(base) : base;
}

// Cost for the NEXT level (what it costs to buy one more)
export function upgNextCost(saveData, idx, ext) {
  ext = ext || {};
  var lv = upgLevel(saveData, idx) + 1;
  var base = (Math.pow(upgCostBase(idx), lv) + lv) * (1 / (1 + upgBonus(saveData, 7) / 100));
  if (idx % 2 === 1) base *= 5;
  if (ext.bolaia17discount) base *= 0.85;
  return base < 1e6 ? Math.round(base) : base;
}

// ========== STONE COUNTS ==========
// Blue stones: OLA[654..659]
export function blueStone(saveData, idx) {
  return _ola(654 + idx);
}
// Purple stones: OLA[660..665]
export function purpleStone(saveData, idx) {
  return _ola(660 + idx);
}

// Bdig = sum of ceil(log10(blueStones[0..5]))
export function bdig(saveData) {
  var sum = 0;
  for (var i = 0; i < 6; i++) sum += Math.ceil(getLOG(blueStone(saveData, i)));
  return sum;
}

// Pdig = sum of ceil(log10(purpleStones[0..5]))
export function pdig(saveData) {
  var sum = 0;
  for (var i = 0; i < 6; i++) sum += Math.ceil(getLOG(purpleStone(saveData, i)));
  return sum;
}

// ========== DERIVED BONUSES ==========

// Cglunko_DR — complex drop rate formula
export function drBonus(saveData) {
  var b = upgBonus;
  var s = saveData;
  return (1 + (b(s,1) + (b(s,17) + b(s,21))) / 100)
    * (1 + b(s,3) / 100)
    * (1 + b(s,12) / 100)
    * (1 + b(s,10) * bdig(s) / 100)
    * (1 + b(s,22) * pdig(s) / 100)
    * (1 + b(s,4) * Math.ceil(getLOG(_ola(668))) / 100)
    * (1 + b(s,18) * Math.ceil(getLOG(_ola(200))) / 100);
}

// Cglunko_AFKgains
export function afkGains(saveData) {
  return (10 + upgBonus(saveData, 8) + upgBonus(saveData, 13)) / 100;
}

// Cglunko_MKtier
export function mkTier(saveData) {
  return upgBonus(saveData, 6);
}

// Cglunko_MKbase
export function mkBase(saveData) {
  return upgBonus(saveData, 15);
}

// Cglunko_Respawn
export function respawnBonus(saveData) {
  return upgBonus(saveData, 2);
}

// Cglunko_DoublePickup (from B_UPG, not Cglunko upgrades directly)
// min((B101*10 + B103*10 + B105*10)/100, 3)
// This is a B_UPG formula, not Cglunko upgrade, but included for reference

// Cavern currency multi from upgrade 14
export function cavernCurrencyBonus(saveData) {
  return upgBonus(saveData, 14);
}

// Total damage from upgrade 19
export function totalDmgBonus(saveData) {
  return upgBonus(saveData, 19);
}

// Research EXP from upgrade 11
export function researchExpBonus(saveData) {
  return upgBonus(saveData, 11);
}

// Grand Discovery chance from upgrade 20
export function grandDiscoveryBonus(saveData) {
  return upgBonus(saveData, 20);
}

// ========== UPGRADE CATEGORIES ==========
export var UPGRADE_CATEGORIES = [
  'opal',          // 0: +1 opal
  'dr-add',        // 1: +% DR additive
  'respawn',       // 2: +% respawn rate
  'dr-mult',       // 3: ×DR multiplier
  'dr-kills',      // 4: +% DR per pow10 glunko kills
  'ribbon',        // 5: rank 15 cooking ribbon
  'mk-tier',       // 6: MK per dmg tier
  'cost-reduce',   // 7: -% cost all upgrades
  'afk',           // 8: +% AFK gains
  'stone-value',   // 9: ×drop value for blue shape
  'dr-bdig',       // 10: +% DR per blue digit
  'research',      // 11: ×research EXP
  'dr-mult2',      // 12: ×DR multiplier
  'afk2',          // 13: +% AFK gains
  'cavern-multi',  // 14: ×cavern resources
  'mk-base',       // 15: +% MK base
  'stone-value2',  // 16: ×drop value for purp shape
  'dr-add2',       // 17: +% DR additive
  'dr-pow10dr',    // 18: +% DR per pow10 normal DR
  'total-dmg',     // 19: ×total damage
  'grand-disc',    // 20: ×grand discovery chance
  'dr-flat',       // 21: +% DR flat (additive with 1,17)
  'dr-pdig',       // 22: +% DR per purp digit
  'locked',        // 23: not yet
];

// ========== OPTIMIZER ==========

// DR indices and which factor each upgrade affects
var _DR_INDICES = {
  1: 'add', 17: 'add', 21: 'add',  // additive group
  3: 'mult3', 12: 'mult12',         // standalone multipliers
  10: 'bdig', 22: 'pdig',           // digit multipliers
  4: 'kills', 18: 'normdr',         // log-scaled multipliers
};

// Compute marginal DR improvement from +1 level of upgrade idx
export function drMarginalGain(saveData, idx) {
  if (!(idx in _DR_INDICES)) return 0;
  var curDR = drBonus(saveData);
  if (curDR <= 0) return 0;

  var plv = upgPerLvVal(idx);
  var b = upgBonus;
  var s = saveData;
  var group = _DR_INDICES[idx];

  // Current factor values
  var curAdd = b(s,1) + b(s,17) + b(s,21);
  var factors = {
    add: 1 + curAdd / 100,
    mult3: 1 + b(s,3) / 100,
    mult12: 1 + b(s,12) / 100,
    bdig: 1 + b(s,10) * bdig(s) / 100,
    pdig: 1 + b(s,22) * pdig(s) / 100,
    kills: 1 + b(s,4) * Math.ceil(getLOG(_ola(668))) / 100,
    normdr: 1 + b(s,18) * Math.ceil(getLOG(_ola(200))) / 100,
  };

  // New factor after +1 level
  var newFactor;
  if (group === 'add') {
    newFactor = 1 + (curAdd + plv) / 100;
  } else if (group === 'mult3') {
    newFactor = 1 + (b(s,3) + plv) / 100;
  } else if (group === 'mult12') {
    newFactor = 1 + (b(s,12) + plv) / 100;
  } else if (group === 'bdig') {
    newFactor = 1 + (b(s,10) + plv) * bdig(s) / 100;
  } else if (group === 'pdig') {
    newFactor = 1 + (b(s,22) + plv) * pdig(s) / 100;
  } else if (group === 'kills') {
    newFactor = 1 + (b(s,4) + plv) * Math.ceil(getLOG(_ola(668))) / 100;
  } else if (group === 'normdr') {
    newFactor = 1 + (b(s,18) + plv) * Math.ceil(getLOG(_ola(200))) / 100;
  }

  var curFactor = factors[group];
  if (curFactor <= 0) return 0;
  return newFactor / curFactor - 1;  // fractional DR increase
}

// Rank upgrades by DR improvement per cost
export function rankUpgrades(saveData, ext) {
  var rows = [];
  for (var i = 0; i < UPGRADE_COUNT; i++) {
    if (i === 23) continue;  // locked
    var nextCost = upgNextCost(saveData, i, ext);
    var drGain = drMarginalGain(saveData, i);
    var drEfficiency = nextCost > 0 ? drGain / nextCost : 0;

    rows.push({
      idx: i,
      page: Math.floor(i / PAGE_SIZE),
      level: upgLevel(saveData, i),
      bonus: upgBonus(saveData, i),
      nextCost: nextCost,
      perLv: upgPerLvVal(i),
      drGain: drGain,
      drEfficiency: drEfficiency,
      desc: upgDescription(i),
      cat: UPGRADE_CATEGORIES[i],
      isDR: i in _DR_INDICES,
    });
  }
  rows.sort(function(a, b) { return b.drEfficiency - a.drEfficiency; });
  return rows;
}

// ========== STONE DROP RATES ==========
// Base drop rates from caveD monsters (before DR multiplier)
// Blue: direct drops, Purple: via DropTable39
export var STONE_BASE_RATES = [
  0.1, 0.02, 0.005, 0.001, 0.0002, 0.00001,       // blue 0-5
  0.000001, 0.0000001, 0.00000001, 0.000000001,     // purple 0-3
  0.0000000001, 0.00000000001,                       // purple 4-5
];

// Stone efficiency: normalized by drop rate
export function stoneEfficiency(saveData) {
  var dr = drBonus(saveData) || 1;
  var blueFocusIdx = Math.round(_ola(666)) - 1;   // blue focus (0-5 item ID)
  var purpFocusIdx = Math.round(_ola(667)) - 1;   // purple focus (0-5 relative, stored as 0-5 not 6-11)
  var blueFocusMulti = Math.max(1, upgBonus(saveData, 9));   // upgBon(9) for blue
  var purpFocusMulti = Math.max(1, upgBonus(saveData, 16));  // upgBon(16) for purple

  var rows = [];
  for (var i = 0; i < 6; i++) {
    var cur = blueStone(saveData, i);
    var curDig = Math.ceil(getLOG(cur));
    var nextPow10 = Math.pow(10, curDig);
    var deficit = Math.max(0, nextPow10 - cur);
    var baseRate = STONE_BASE_RATES[i];
    var isFocused = (i === blueFocusIdx);
    var dropsPerKill = baseRate * dr * (isFocused ? blueFocusMulti : 1);
    var killsNeeded = deficit > 0 && dropsPerKill > 0 ? deficit / dropsPerKill : 0;
    rows.push({ idx: i, color: 'blue', current: cur, digits: curDig, nextPow10: nextPow10,
      deficit: deficit, baseRate: baseRate, dropsPerKill: dropsPerKill, killsNeeded: killsNeeded,
      focused: isFocused, focusMulti: isFocused ? blueFocusMulti : 1 });
  }
  for (var i = 0; i < 6; i++) {
    var cur = purpleStone(saveData, i);
    var curDig = Math.ceil(getLOG(cur));
    var nextPow10 = Math.pow(10, curDig);
    var deficit = Math.max(0, nextPow10 - cur);
    var baseRate = STONE_BASE_RATES[6 + i];
    var isFocused = (i === purpFocusIdx);
    var dropsPerKill = baseRate * dr * (isFocused ? purpFocusMulti : 1);
    var killsNeeded = deficit > 0 && dropsPerKill > 0 ? deficit / dropsPerKill : 0;
    rows.push({ idx: i, color: 'purple', current: cur, digits: curDig, nextPow10: nextPow10,
      deficit: deficit, baseRate: baseRate, dropsPerKill: dropsPerKill, killsNeeded: killsNeeded,
      focused: isFocused, focusMulti: isFocused ? purpFocusMulti : 1 });
  }
  return rows;
}

// Best stone to focus: which stone would benefit most from focus
export function bestStoneFocus(saveData) {
  var dr = drBonus(saveData) || 1;
  var blueFocusMulti = Math.max(1, upgBonus(saveData, 9));
  var purpFocusMulti = Math.max(1, upgBonus(saveData, 16));
  var results = [];
  for (var i = 0; i < 12; i++) {
    var cur = i < 6 ? blueStone(saveData, i) : purpleStone(saveData, i - 6);
    var curDig = Math.ceil(getLOG(cur));
    var nextPow10 = Math.pow(10, curDig);
    var deficit = Math.max(0, nextPow10 - cur);
    if (deficit <= 0) continue;
    var baseRate = STONE_BASE_RATES[i];
    var focusMulti = i < 6 ? blueFocusMulti : purpFocusMulti;
    var killsWithFocus = deficit / (baseRate * dr * focusMulti);
    var killsWithout = deficit / (baseRate * dr);
    results.push({
      idx: i, color: i < 6 ? 'blue' : 'purple', stoneIdx: i < 6 ? i : i - 6,
      deficit: deficit, killsWithFocus: killsWithFocus, killsWithout: killsWithout,
      drPerDigit: i < 6 ? upgBonus(saveData, 10) : upgBonus(saveData, 22),
    });
  }
  results.sort(function(a, b) { return a.killsWithFocus - b.killsWithFocus; });
  return results;
}

// Target item
export function targetItemId(saveData) {
  return Math.round(_ola(666)) - 1;
}

// Debug helpers for DR breakdown
export function _debugOla668raw() { return _ola(668); }
export function _debugOla668() { return Math.ceil(getLOG(_ola(668))); }
export function _debugOla200raw() { return _ola(200); }
export function _debugOla200() { return Math.ceil(getLOG(_ola(200))); }
