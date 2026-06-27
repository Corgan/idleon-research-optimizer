// ========== CLAMWORKS (W7) ==========
// Save data: OLA[454] = pearl balance, OLA[455+i] = upgrade levels (i=0..8)
//            OLA[456] = extra clams, OLA[464] = promotion level
// Game data: Spelunky[27] = descriptions, [28] = perLvVal, [29] = costBase

import { getLOG } from '../../../formulas.js';
import { Spelunky } from '../../data/game/customlists.js';
import { optionsListData } from '../../../save/data.js';

var _descs = Spelunky[27];   // 9 description strings
var _perLv = Spelunky[28];   // 9 per-level bonus values
var _costB = Spelunky[29];   // 9 cost bases

export var UPGRADE_COUNT = 9;

// ========== SAVE HELPERS ==========
function _ola(idx) {
  return Number(optionsListData[idx]) || 0;
}

// ========== UPGRADE DATA ==========
export function upgLevel(idx) {
  return _ola(455 + idx);
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

// ========== CORE VALUES ==========
export function pearlBalance() {
  return _ola(454);
}

export function promotionLevel() {
  return _ola(464);
}

export function clamCount() {
  return Math.min(25, 2 + _ola(456));
}

export function clamHP() {
  return 1e16 * Math.pow(30, promotionLevel());
}

export function clamRespawn() {
  return 60; // seconds
}

// ========== UPGRADE BONUSES ==========
// ClamBonuses(t) — raw bonus value for upgrade t
export function upgBonus(idx) {
  var lv = upgLevel(idx);
  var plv = upgPerLvVal(idx);
  // Index 3 is special: MK-based. We can't compute MK here, so just return the base.
  // The caller must multiply by MK/1000 for index 3.
  return plv * lv;
}

// For index 3, the actual bonus depends on multikill total
export function upgBonus3(multikillTotal) {
  return (multikillTotal || 0) / 1000 * upgPerLvVal(3) * upgLevel(3);
}

// ========== PEARL VALUE ==========
// ClamPearlValue = (1 + bonus0) * (1 + bonus3/100) * (1 + bonus7/100)
export function pearlValue(ext) {
  ext = ext || {};
  var b0 = upgBonus(0);
  var b3 = upgBonus3(ext.multikillTotal);
  var b7 = upgBonus(7);
  return (1 + b0) * (1 + b3 / 100) * (1 + b7 / 100);
}

// 10x pearl chance
export function pearl10xChance() {
  var b2 = upgBonus(2);
  return 1 - 1 / (1 + b2 / 100);
}

// Expected pearl multiplier from 10x chance
export function pearl10xExpected() {
  var chance = pearl10xChance();
  return 1 * (1 - chance) + 10 * chance;
}

// Black pearl value
export function blackPearlValue() {
  return 50 + upgBonus(5);
}

// Effective pearls per pearl drop (value × 10x expected)
export function effectivePearlsPerDrop(ext) {
  return pearlValue(ext) * pearl10xExpected();
}

// ========== COSTS ==========
// Cost reduction from upgrades 4 and 8
export function costReduction() {
  return (1 / (1 + upgBonus(4) / 100)) * (1 / (1 + upgBonus(8) / 100));
}

// Clam_PearlUpgReq(t)
export function pearlUpgReq(t) {
  return 20 * Math.pow(10 + 3 * promotionLevel(), t - 1);
}

// Clam_Cost(t) — cost for next level of upgrade t
export function upgCost(idx) {
  var lv = upgLevel(idx);
  var cr = costReduction();
  if (idx === 0) {
    return cr * (Math.pow(upgCostBase(0), lv) + 3 * lv + Math.pow(lv, 2.5));
  }
  return cr * (pearlUpgReq(idx) / 5 * Math.pow(upgCostBase(idx), lv) + 2 * lv + Math.pow(lv, 1.5));
}

// Cost for next level (+1)
export function upgNextCost(idx) {
  var lv = upgLevel(idx) + 1;
  var cr = costReduction();
  if (idx === 0) {
    return cr * (Math.pow(upgCostBase(0), lv) + 3 * lv + Math.pow(lv, 2.5));
  }
  return cr * (pearlUpgReq(idx) / 5 * Math.pow(upgCostBase(idx), lv) + 2 * lv + Math.pow(lv, 1.5));
}

// Promotion cost
export function promotionCost() {
  return 1e5 * Math.pow(10, promotionLevel());
}

// Promotion chance
export function promotionChance() {
  return 0.5 / (2 + promotionLevel());
}

// Expected pearls per promotion (cost / chance)
export function expectedPearlsPerPromotion() {
  return promotionCost() / promotionChance();
}

// ========== PEARL DROP RATE ==========
// Rates dynamically adjusted each second in-game:
// ClamPearl0: 0.005 * (1 + ClamBonuses(6)/100) * pow(0.66, promoLv)
// ClamPearl1: 0.000025 * (1 + ClamBonuses(6)/100) * pow(0.66, promoLv) [requires OLA[460]>=1]
export function pearlDropRate() {
  var promoMult = Math.pow(0.66, promotionLevel());
  return 0.005 * (1 + upgBonus(6) / 100) * promoMult;
}

export function blackPearlDropRate() {
  if (_ola(460) < 1) return 0;
  var promoMult = Math.pow(0.66, promotionLevel());
  return 0.000025 * (1 + upgBonus(6) / 100) * promoMult;
}

export function promoPenalty() {
  return Math.pow(0.66, promotionLevel());
}

// Average pearls per kill (regular + black pearls)
export function pearlsPerKill(ext) {
  var regularPerKill = pearlDropRate() * effectivePearlsPerDrop(ext);
  var blackPerKill = blackPearlDropRate() * blackPearlValue();
  return regularPerKill + blackPerKill;
}

// ========== PROMOTION BONUSES ==========
// ClamWorkBonus(t) = 1 if promotionLevel > t, else 0
export function clamWorkBonus(t) {
  return promotionLevel() > t ? 1 : 0;
}

export var PROMO_BONUS_DESCS = Spelunky[30].map(function(s) {
  return (s || '').replace(/_/g, ' ');
});

// ========== OPTIMIZER ==========

// Marginal pearl value gain from +1 level of upgrade idx
export function pearlValueMarginalGain(idx, ext) {
  ext = ext || {};
  var curVal = pearlValue(ext);
  if (curVal <= 0) return 0;

  var b0 = upgBonus(0);
  var b3 = upgBonus3(ext.multikillTotal);
  var b7 = upgBonus(7);
  var plv = upgPerLvVal(idx);

  var newVal;
  if (idx === 0) {
    newVal = (1 + b0 + plv) * (1 + b3 / 100) * (1 + b7 / 100);
  } else if (idx === 3) {
    var newB3 = (ext.multikillTotal || 0) / 1000 * plv * (upgLevel(3) + 1);
    newVal = (1 + b0) * (1 + newB3 / 100) * (1 + b7 / 100);
  } else if (idx === 7) {
    newVal = (1 + b0) * (1 + b3 / 100) * (1 + (b7 + plv) / 100);
  } else {
    return 0; // doesn't affect pearl value directly
  }
  return newVal / curVal - 1;
}

// Marginal 10x chance gain
export function pearl10xMarginalGain(idx) {
  if (idx !== 2) return 0;
  var curExpected = pearl10xExpected();
  var b2 = upgBonus(2);
  var newChance = 1 - 1 / (1 + (b2 + upgPerLvVal(2)) / 100);
  var newExpected = 1 * (1 - newChance) + 10 * newChance;
  return newExpected / curExpected - 1;
}

// Marginal drop rate gain (upgrade 6 affects both regular and black pearl rates)
export function dropRateMarginalGain(idx) {
  if (idx !== 6) return 0;
  var b6 = upgBonus(6);
  var curMult = 1 + b6 / 100;
  var newMult = 1 + (b6 + upgPerLvVal(6)) / 100;
  return newMult / curMult - 1;
}

// Marginal black pearl value gain (upgrade 5)
export function blackPearlValueMarginalGain(idx) {
  if (idx !== 5) return 0;
  var curBPV = blackPearlValue();
  var newBPV = curBPV + upgPerLvVal(5);
  // Black pearl contribution to total pearls/kill
  var bpRate = blackPearlDropRate();
  if (bpRate <= 0) return 0;
  return bpRate * (newBPV - curBPV);  // absolute gain, not fractional
}

// Combined marginal pearls/kill gain
export function pearlsPerKillMarginalGain(idx, ext) {
  var curPPK = pearlsPerKill(ext);
  if (curPPK <= 0) return 0;

  if (idx === 4 || idx === 8) {
    // Cost reduction: compute savings on the total cost of buying +1 of each pearl upgrade
    // This isn't a direct PPK gain, but we can express it as "equivalent pearls saved"
    return 0;  // handled separately in ranking
  }
  if (idx === 1) return 0;  // more clams = more kills/time, not per-kill value

  // For pearl value upgrades (0, 3, 7): affects regular pearl value
  var pvGain = pearlValueMarginalGain(idx, ext);
  // For 10x chance (2): affects expected multiplier
  var tenxGain = pearl10xMarginalGain(idx);
  // For drop rate (6): affects both regular and black pearl rates
  var drGain = dropRateMarginalGain(idx);
  // For black pearl value (5): adds absolute pearls/kill
  var bpAbsGain = blackPearlValueMarginalGain(idx);

  // Multiplicative gains (value × 10x × dropRate) affect regular pearls
  var regularPPK = pearlDropRate() * effectivePearlsPerDrop(ext);
  var newRegular = regularPPK * (1 + pvGain) * (1 + tenxGain) * (1 + drGain);
  // Black pearl gains
  var blackPPK = blackPearlDropRate() * blackPearlValue();
  var newBlack = blackPPK * (1 + drGain) + bpAbsGain;

  return (newRegular + newBlack) / curPPK - 1;
}

// Cost reduction effective value: how much you save on buying 1 more of the best pearl upgrade
export function costReductionSavings(idx, ext) {
  if (idx !== 4 && idx !== 8) return 0;
  // Find the cheapest pearl upgrade's next cost
  var bestCost = Infinity;
  for (var i = 0; i < UPGRADE_COUNT; i++) {
    if (i === 4 || i === 8 || i === 1 || i === 5) continue;
    var c = upgNextCost(i);
    if (c < bestCost) bestCost = c;
  }
  // Current cost reduction vs new
  var curCR = costReduction();
  var plv = upgPerLvVal(idx);
  var b4 = upgBonus(4), b8 = upgBonus(8);
  var newCR;
  if (idx === 4) newCR = (1 / (1 + (b4 + plv) / 100)) * (1 / (1 + b8 / 100));
  else newCR = (1 / (1 + b4 / 100)) * (1 / (1 + (b8 + plv) / 100));
  var savings = (curCR - newCR) / curCR;  // fractional cost reduction
  return savings;
}

// Rank upgrades by pearls-per-kill improvement per cost
export function rankUpgrades(ext) {
  var rows = [];
  for (var i = 0; i < UPGRADE_COUNT; i++) {
    var nextCost = upgNextCost(i);
    var ppkGain = pearlsPerKillMarginalGain(i, ext);
    var costSave = costReductionSavings(i, ext);
    var efficiency = nextCost > 0 ? ppkGain / nextCost : 0;
    var cat = i === 4 || i === 8 ? 'cost' : i === 1 ? 'clams' : i === 5 ? 'black' : 'pearl';

    rows.push({
      idx: i,
      level: upgLevel(i),
      bonus: i === 3 ? upgBonus3(ext.multikillTotal) : upgBonus(i),
      nextCost: nextCost,
      perLv: upgPerLvVal(i),
      ppkGain: ppkGain,
      costSave: costSave,
      efficiency: efficiency,
      desc: upgDescription(i),
      cat: cat,
      isPearlUpgrade: ppkGain > 0,
    });
  }
  rows.sort(function(a, b) { return b.efficiency - a.efficiency; });
  return rows;
}
