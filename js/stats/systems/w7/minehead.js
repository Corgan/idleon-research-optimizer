// ===== MINEHEAD (DEPTH CHARGE) SYSTEM =====
// All minehead formulas, calculations, and resolvers.
// Pure computation functions - no side effects, no global state.

import { node } from '../../node.js';
import { label } from '../../entity-names.js';
import { MINEHEAD_BONUS_QTY, MINEHEAD_UPG, GRID_DIMS, TILE_MULTIPLIERS } from '../../data/w7/minehead.js';
import { ribbonBonusAt, eventShopOwned } from '../../../game-helpers.js';
import { arcadeBonus } from '../w2/arcade.js';
import { cookingMealMulti } from '../common/cooking.js';
import { getLOG } from '../../../formulas.js';
import { companionBonus } from '../../data/common/companions.js';

// ===== FLOOR REWARD BONUS =====

export function mineheadBonusQTY(t, mineFloor) {
  return mineFloor > t ? (MINEHEAD_BONUS_QTY[t] || 0) : 0;
}

/** Precompute all minehead floor reward bonuses into an array. */
export function buildMhqArray(mineFloor) {
  var arr = new Array(MINEHEAD_BONUS_QTY.length);
  for (var i = 0; i < arr.length; i++) arr[i] = mineFloor > i ? (MINEHEAD_BONUS_QTY[i] || 0) : 0;
  return arr;
}

// ===== MINEHEAD CURRENCY SOURCES =====

export function computeMineheadCurrSources(saveData) {
  var comp143 = saveData.companionIds.has(143) ? companionBonus(143) : 0;
  var atom13 = Number(saveData.atomsData && saveData.atomsData[13]) || 0;
  var eventShop44 = eventShopOwned(44, saveData.cachedEventShopStr);
  var arcade62tree = arcadeBonus(62, saveData);
  var arcade62val = (arcade62tree && arcade62tree.val) || 0;
  var arcade62lv = saveData.arcadeUpgData[62] || 0;
  var mealLv = (saveData.mealsData && saveData.mealsData[0] && saveData.mealsData[0][73]) || 0;
  var olaStr379 = String(saveData.olaData[379] || '');
  var mealMineCurr = 0;
  var mealRibBon = 0;
  var mealCookMulti = 1;
  var mealMfb116 = 0;
  var mealShinyS20 = 0;
  var mealWinBon26 = 0;
  var mealComp162 = 0;
  var mealRibT = 0;
  if (mealLv > 0) {
    mealRibT = saveData.ribbonData[101] || 0;
    mealRibBon = ribbonBonusAt(101, saveData.ribbonData, olaStr379, saveData.weeklyBossData);
    var cm = cookingMealMulti(saveData);
    mealCookMulti = cm.val;
    mealMfb116 = cm.mfb116;
    mealShinyS20 = cm.shinyS20;
    mealWinBon26 = cm.winBon26;
    mealComp162 = cm.comp162;
    mealMineCurr = mealCookMulti * mealRibBon * mealLv * 0.02;
  }
  return {
    comp143: comp143, atom13: atom13, eventShop44: eventShop44,
    arcade62: arcade62val, arcade62lv: arcade62lv,
    mealMineCurr: mealMineCurr, mealLv: mealLv, mealRibBon: mealRibBon, mealRibT: mealRibT,
    mealCookMulti: mealCookMulti, mealMfb116: mealMfb116, mealShinyS20: mealShinyS20, mealWinBon26: mealWinBon26, mealComp162: mealComp162,
  };
}

// ===== MINEHEAD RESOLVER =====

export var minehead = {
  resolve: function(id, ctx) {
    var sd = ctx.saveData;
    var mineFloor = (sd.stateR7 && sd.stateR7[4]) || 0;
    var bonusVal = MINEHEAD_BONUS_QTY[id] || 0;
    var val = mineFloor > id ? bonusVal : 0;
    if (val <= 0) return node(label('Minehead Floor', id), 0, [
      node('Mine Floor', mineFloor, null, { fmt: 'raw' }),
      node('Required Floor', id, null, { fmt: 'raw' }),
    ], { note: 'minehead ' + id });
    return node(label('Minehead Floor', id), val, [
      node('Mine Floor', mineFloor, null, { fmt: 'raw' }),
      node('Bonus Value', bonusVal, null, { fmt: 'raw' }),
    ], { fmt: '+', note: 'minehead ' + id });
  },
};

// ===== UPGRADE HELPERS =====

/** Minimum research level required to unlock upgrade index `t`. */
export function upgLvReq(t) {
  return 1 + 3 * t + Math.floor(t / 3) + Math.floor(t / 11);
}

/**
 * upgradeQTY(t, level) - total bonus from upgrade `t` at `level`.
 */
export function upgradeQTY(t, level) {
  return MINEHEAD_UPG[t].bonus * level;
}

/**
 * Cost of upgrade `t` at current level.
 */
export function upgCost(t, lv, qty26, svar, rogCostPct) {
  if (svar === undefined) svar = 1;
  var basePart = 5 + t + Math.pow(Math.max(0, t - 2), 1.3);
  var pow2Part = Math.pow(2, Math.max(0, t - 4));
  var svarPart = Math.pow(Math.max(1, svar), Math.max(0, t - 9));
  var cheapo   = 1 / (1 + qty26 / 100);
  var rogDisc  = Math.max(0.1, 1 - (rogCostPct || 0) / 100);
  var expPart  = Math.pow(MINEHEAD_UPG[t].costExp, lv);
  return basePart * pow2Part * svarPart * cheapo * rogDisc * expPart;
}

/**
 * Whether upgrade `t` can be bought.
 */
export function canBuyUpg(t, lv, mineCurrency, qty26, svar, rogCostPct) {
  if (svar === undefined) svar = 1;
  var max = MINEHEAD_UPG[t].maxLv;
  return mineCurrency >= upgCost(t, lv, qty26, svar, rogCostPct) && (lv < max || max > 998);
}

// ===== GRID =====

export function gridDims(gridExpLv) {
  var idx = Math.min(gridExpLv, GRID_DIMS.length - 1);
  var parts = GRID_DIMS[Math.max(0, idx)].split(',').map(Number);
  return { cols: parts[0], rows: parts[1] };
}

export function totalTiles(gridExpLv) {
  var d = gridDims(gridExpLv);
  return d.cols * d.rows;
}

export function goldTilesTotal(upgLevels) {
  return upgradeQTY(8, upgLevels[8]);
}

export function blocksTotal(upgLevels) {
  return upgradeQTY(10, upgLevels[10]);
}

export function flagsTotal(upgLevels) {
  return Math.round(upgradeQTY(20, upgLevels[20]));
}

export function instaRevealsTotal(upgLevels) {
  return Math.round(upgradeQTY(16, upgLevels[16]));
}

// ===== HP / TRIES =====

export function dailyTries(gridBonus147_1) {
  return Math.round(3 + gridBonus147_1);
}

export function maxHPYou(upgLevels) {
  return Math.round(3 + upgradeQTY(6, upgLevels[6]));
}

export function floorHP(floor, svar) {
  if (svar === undefined) svar = 1;
  var t = floor;
  return (5 + 2 * t + t * t)
    * Math.pow(1.8, t)
    * Math.pow(1.85, Math.floor(Math.max(0, t - 4) / 3))
    * Math.pow(4, Math.floor(Math.max(0, t - 5) / 7))
    * Math.pow(Math.max(1, svar), Math.max(0, t - 9));
}

export function minesOnFloor(floor, reduction) {
  var t = floor;
  var red = reduction || 0;  // sum of SuperBit(66) + CB(41) + EmporiumBonus(45), each 0 or 1
  return Math.round(Math.min(40,
    Math.max(1, 1 - red + Math.floor(t / 3) + Math.floor(t / 7) + Math.floor(t / 13)
      + Math.min(1, Math.floor(t / 15)) + Math.floor(t / 17))
  ));
}

// ===== DAMAGE PIPELINE =====

export function baseDMG(upgLevels, gridBonus167, sailing38) {
  if (gridBonus167 === undefined) gridBonus167 = 0;
  if (sailing38 === undefined) sailing38 = 0;
  var flat = 1 + upgradeQTY(0, upgLevels[0])
               + upgradeQTY(7, upgLevels[7])
               + upgradeQTY(25, upgLevels[25]);
  var pctMega = 1 + (upgradeQTY(4, upgLevels[4])
                    + upgradeQTY(21, upgLevels[21])
                    + upgradeQTY(27, upgLevels[27])) / 100;
  var gridMulti = 1 + gridBonus167 / 100;
  var sailMulti = 1 + 50 * sailing38 / 100;
  return flat * pctMega * gridMulti * sailMulti;
}

export function bonusDMGperTilePCT(upgLevels, gridBonus146) {
  if (gridBonus146 === undefined) gridBonus146 = 0;
  return upgradeQTY(9, upgLevels[9]) + gridBonus146;
}

export function bluecrownMulti(upgLevels) {
  return 1.5 + upgradeQTY(14, upgLevels[14]) / 100;
}

export function bluecrownOdds(upgLevels) {
  if (upgradeQTY(14, upgLevels[14]) === 0) return 0;
  return Math.min(0.1, (1 / 15) * (1 + upgradeQTY(15, upgLevels[15]) / 100));
}

export function jackpotOdds(upgLevels) {
  if (upgradeQTY(23, upgLevels[23]) === 0) return 0;
  return 0.01 * (1 + upgradeQTY(23, upgLevels[23]) / 100);
}

export function jackpotTiles(upgLevels) {
  return Math.round(3 + upgradeQTY(24, upgLevels[24]));
}

export function currentOutgoingDMG(revealedValues, bluecrownCount, isLastLife,
                                    upgLevels, gridBonus167, gridBonus146,
                                    wepPowDmgPCT, sailing38) {
  if (gridBonus167 === undefined) gridBonus167 = 0;
  if (gridBonus146 === undefined) gridBonus146 = 0;
  if (wepPowDmgPCT === undefined) wepPowDmgPCT = 0;
  if (sailing38 === undefined) sailing38 = 0;
  var addSum = 0;
  var multiProd = 1;
  var tileCount = 0;

  for (var i = 0; i < revealedValues.length; i++) {
    var v = revealedValues[i];
    if (v >= 1 && v < 10) {
      addSum += v;
    } else if (v >= 10 && v < 19) {
      addSum += v + 1;
    } else if (v === 19) {
      addSum += -1;
    } else if (v >= 20 && v < 29) {
      multiProd *= TILE_MULTIPLIERS[Math.round(v - 20)];
    }
    tileCount++;
  }

  var dmg = addSum * baseDMG(upgLevels, gridBonus167, sailing38);
  dmg *= multiProd;
  dmg *= (1 + wepPowDmgPCT / 100);
  dmg *= (1 + tileCount * bonusDMGperTilePCT(upgLevels, gridBonus146) / 100);
  dmg *= Math.pow(bluecrownMulti(upgLevels), bluecrownCount);
  if (isLastLife) {
    dmg *= (1 + upgradeQTY(11, upgLevels[11]) / 100);
  }
  return dmg;
}

// ===== CURRENCY =====

export function currencyPerHour(opts) {
  var gridBonus129 = opts.gridBonus129 || 0;
  var gridBonus148 = opts.gridBonus148 || 0;
  var gridBonus147 = opts.gridBonus147 || 0;
  var gridBonus166 = opts.gridBonus166 || 0;
  var comp143 = opts.comp143 || 1;
  var bonusQTY6 = opts.bonusQTY6 || 0;
  var atom13 = opts.atom13 || 0;
  var mealMineCurr = opts.mealMineCurr || 0;
  var arcade62 = opts.arcade62 || 0;
  var rogBonus12 = opts.rogBonus12 || 0;
  var eventShop44 = opts.eventShop44 || 0;
  var upgLevels = opts.upgLevels;
  var highestDmg = opts.highestDmg || 1;

  var base = gridBonus129;
  var eventShopMulti = 1 + 100 * eventShop44 / 100;
  var multi148 = 1 + gridBonus148 / 100;
  var rogMulti = 1 + rogBonus12 / 100;
  var compMulti = Math.max(1, Math.min(2, comp143));
  var bqMulti = Math.min(3, 1 + bonusQTY6 / 100);

  var logDmg = highestDmg > 0 ? getLOG(highestDmg) : 0;
  var farmPCT = 1 + (upgradeQTY(5, upgLevels[5])
                    + upgradeQTY(22, upgLevels[22])
                    + upgradeQTY(28, upgLevels[28]) * logDmg
                    + arcade62) / 100;
  var atomMulti = 1 + atom13 / 100;
  var buttonMulti = 1 + (opts.buttonBonus1 || 0) / 100;
  var passiveMulti = 1 + (gridBonus147 + gridBonus166 + mealMineCurr) / 100;

  return base * eventShopMulti * multi148 * rogMulti * compMulti * bqMulti * farmPCT * buttonMulti * atomMulti * passiveMulti;
}

// ===== WIGGLE =====

export var WIGGLE_CHANCE = 0.6;

export function wiggleMaxPerGame(gridBonus166_1) {
  return Math.round(gridBonus166_1);
}

// ===== GLIMBO =====

export function glimboCost(t, tradeLv, costExp, eventShop38) {
  if (eventShop38 === undefined) eventShop38 = 0;
  var raw = (1 + tradeLv + 1.5 * tradeLv) * Math.pow(costExp, tradeLv)
          * Math.max(0.1, 1 - 25 * eventShop38 / 100);
  if (raw < 1e9) return Math.floor(Math.max(1, raw));
  return raw;
}

// Minehead upgrade quality: MINEHEAD_UPG[idx].bonus * upgrade level
export function mhUpgradeQTY(idx, saveData) {
  var bonus = MINEHEAD_UPG[idx] ? MINEHEAD_UPG[idx].bonus : 0;
  var lv = (saveData.research && saveData.research[8] && Number(saveData.research[8][idx])) || 0;
  return bonus * lv;
}
