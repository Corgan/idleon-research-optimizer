// Depth Charge (Minehead) — pure formula functions.
// All formulas extracted from _customBlock_Minehead in N.formatted.js.
// Every function is pure: no save state, no side effects.

import { MINEHEAD_UPG, GRID_DIMS, TILE_MULTIPLIERS } from './game-data.js';

// ---------- upgrade helpers ----------

/** Minimum research level required to unlock upgrade index `t`. */
export function upgLvReq(t) {
  return 1 + 3 * t + Math.floor(t / 3) + Math.floor(t / 11);
}

/**
 * upgradeQTY(t, level) — total bonus from upgrade `t` at `level`.
 * Game code: MineheadUPG[t][3] * Research[8][t]
 */
export function upgradeQTY(t, level) {
  return MINEHEAD_UPG[t].bonus * level;
}

/**
 * Cost of upgrade `t` at current level.
 *   (5 + t + max(0, t-2)^1.3) × 2^max(0, t-4)
 *   × serverVar^max(0, t-9) × (1/(1 + qty26/100)) × costExp^currentLv
 *
 * @param {number} t       upgrade index (0–29)
 * @param {number} lv      current level of upgrade t (Research[8][t])
 * @param {number} qty26   upgradeQTY(26, upgLevels[26])  — "El' Cheapo" discount
 * @param {number} [svar=1] server variable A_MineCost (default 1)
 */
export function upgCost(t, lv, qty26, svar = 1) {
  const basePart = 5 + t + Math.pow(Math.max(0, t - 2), 1.3);
  const pow2Part = Math.pow(2, Math.max(0, t - 4));
  const svarPart = Math.pow(Math.max(1, svar), Math.max(0, t - 9));
  const cheapo   = 1 / (1 + qty26 / 100);
  const expPart  = Math.pow(MINEHEAD_UPG[t].costExp, lv);
  return basePart * pow2Part * svarPart * cheapo * expPart;
}

/**
 * Whether upgrade `t` can be bought.
 * mineCurrency >= cost AND (currentLv < maxLv OR maxLv > 998)
 */
export function canBuyUpg(t, lv, mineCurrency, qty26, svar = 1) {
  const max = MINEHEAD_UPG[t].maxLv;
  return mineCurrency >= upgCost(t, lv, qty26, svar) && (lv < max || max > 998);
}

// ---------- grid ----------

/**
 * Parse grid dimensions from upgrade level (upg #2 = Grid_Expansion).
 * Returns { cols, rows }.
 */
export function gridDims(gridExpLv) {
  const idx = Math.min(gridExpLv, GRID_DIMS.length - 1);
  const [c, r] = GRID_DIMS[Math.max(0, idx)].split(',').map(Number);
  return { cols: c, rows: r };
}

/** Total tiles on the grid. */
export function totalTiles(gridExpLv) {
  const { cols, rows } = gridDims(gridExpLv);
  return cols * rows;
}

/** Number of golden (guaranteed-safe) tiles. */
export function goldTilesTotal(upgLevels) {
  return upgradeQTY(8, upgLevels[8]);
}

/** Number of blocks (Boom Blocker). */
export function blocksTotal(upgLevels) {
  return upgradeQTY(10, upgLevels[10]);
}

/** Number of flags (Classic Flags). */
export function flagsTotal(upgLevels) {
  return Math.round(upgradeQTY(20, upgLevels[20]));
}

/** Number of "insta-reveal" uses (Legal Cheating). */
export function instaRevealsTotal(upgLevels) {
  return Math.round(upgradeQTY(16, upgLevels[16]));
}

// ---------- HP / tries ----------

/** Daily attempts. gridBonus147_1 = Grid_Bonus(147, mode 1). */
export function dailyTries(gridBonus147_1) {
  return Math.round(3 + gridBonus147_1);
}

/** Your starting HP (lives). */
export function maxHPYou(upgLevels) {
  return Math.round(3 + upgradeQTY(6, upgLevels[6]));
}

/**
 * Floor HP (health of the "opponent" = damage you must deal to win).
 * @param {number} floor  0-indexed floor number
 * @param {number} [svar=1] server variable A_MineHP
 */
export function floorHP(floor, svar = 1) {
  const t = floor;
  return (5 + 2 * t + t * t)
    * Math.pow(1.8, t)
    * Math.pow(1.85, Math.floor(Math.max(0, t - 4) / 3))
    * Math.pow(4, Math.floor(Math.max(0, t - 5) / 7))
    * Math.pow(Math.max(1, svar), Math.max(0, t - 9));
}

/** Number of mines (depth charges) on a given floor. */
export function minesOnFloor(floor) {
  const t = floor;
  return Math.round(Math.min(40,
    1 + Math.floor(t / 3) + Math.floor(t / 7) + Math.floor(t / 13)
      + Math.min(1, Math.floor(t / 15)) + Math.floor(t / 17)
  ));
}

// ---------- damage pipeline ----------

/**
 * Base damage (before any turn-specific multipliers).
 * (1 + qty0 + qty7 + qty25) × (1 + (qty4 + qty21 + qty27)/100) × (1 + gridBonus167/100)
 */
export function baseDMG(upgLevels, gridBonus167 = 0) {
  const flat = 1 + upgradeQTY(0, upgLevels[0])
                 + upgradeQTY(7, upgLevels[7])
                 + upgradeQTY(25, upgLevels[25]);
  const pctMega = 1 + (upgradeQTY(4, upgLevels[4])
                      + upgradeQTY(21, upgLevels[21])
                      + upgradeQTY(27, upgLevels[27])) / 100;
  const gridMulti = 1 + gridBonus167 / 100;
  return flat * pctMega * gridMulti;
}

/**
 * Bonus damage % per tile revealed (Big_Hit_Combos + grid 146).
 * Applied as: dmg × (1 + tilesRevealed × bonusDMGperTilePCT / 100)
 */
export function bonusDMGperTilePCT(upgLevels, gridBonus146 = 0) {
  return upgradeQTY(9, upgLevels[9]) + gridBonus146;
}

/** Blue Crown triple-match multiplier: 1.5 + qty14/100 */
export function bluecrownMulti(upgLevels) {
  return 1.5 + upgradeQTY(14, upgLevels[14]) / 100;
}

/** Blue Crown reveal odds. 0 if upgrade 14 not purchased. Max 10%. */
export function bluecrownOdds(upgLevels) {
  if (upgradeQTY(14, upgLevels[14]) === 0) return 0;
  return Math.min(0.1, (1 / 15) * (1 + upgradeQTY(15, upgLevels[15]) / 100));
}

/** Jackpot odds. 0 if upgrade 23 not purchased. */
export function jackpotOdds(upgLevels) {
  if (upgradeQTY(23, upgLevels[23]) === 0) return 0;
  return 0.01 * (1 + upgradeQTY(23, upgLevels[23]) / 100);
}

/** Number of tiles a jackpot reveals. */
export function jackpotTiles(upgLevels) {
  return Math.round(3 + upgradeQTY(24, upgLevels[24]));
}

/**
 * Compute full outgoing damage for one turn, given revealed tile state.
 *
 * The damage pipeline (7 stages):
 *  1. Sum additive contributions from all revealed tiles this turn
 *     - tiles 1–9:   add their face value
 *     - tiles 10–18: add (face + 1)
 *     - tile  19:    subtract 1
 *     - tiles 20–28: multiply running product by TILE_MULTIPLIERS[face-20]
 *  2. Multiply additive sum by BaseDMG
 *  3. Multiply by the tile-multiplier product
 *  4. Multiply by (1 + WepPowDmgPCT / 100)  — GenINFO[39] bonus
 *  5. Multiply by (1 + tilesRevealed × BonusDMGperTilePCT / 100)
 *  6. Multiply by bluecrownMulti ^ bluecrownCount
 *  7. If last life: multiply by (1 + qty11/100)  "Final Round Fury"
 *
 * @param {number[]} revealedValues  face values of tiles revealed this turn
 * @param {number}   bluecrownCount  how many blue-crown tiles were hit
 * @param {boolean}  isLastLife      whether you're on your last life
 * @param {number[]} upgLevels       upgrade levels array (30 entries)
 * @param {number}   gridBonus167    Grid_Bonus(167, 0) — damage grid bonus %
 * @param {number}   gridBonus146    Grid_Bonus(146, 0) — per-tile bonus %
 * @param {number}   wepPowDmgPCT   GenINFO[39] weapon power bonus (usually 0 for sim)
 */
export function currentOutgoingDMG(revealedValues, bluecrownCount, isLastLife,
                                    upgLevels, gridBonus167 = 0, gridBonus146 = 0,
                                    wepPowDmgPCT = 0) {
  let addSum = 0;     // DN1
  let multiProd = 1;  // DN2
  let tileCount = 0;  // DN3

  for (const v of revealedValues) {
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

  let dmg = addSum * baseDMG(upgLevels, gridBonus167);      // stage 1+2
  dmg *= multiProd;                                          // stage 3
  dmg *= (1 + wepPowDmgPCT / 100);                          // stage 4
  dmg *= (1 + tileCount * bonusDMGperTilePCT(upgLevels, gridBonus146) / 100);  // stage 5
  dmg *= Math.pow(bluecrownMulti(upgLevels), bluecrownCount);                   // stage 6
  if (isLastLife) {
    dmg *= (1 + upgradeQTY(11, upgLevels[11]) / 100);       // stage 7
  }
  return dmg;
}

// ---------- currency ----------

/**
 * Minehead currency gain per hour.
 *
 * gridBonus129 × (1 + gridBonus148/100) × max(1, min(2, comp143))
 * × min(3, 1 + BonusQTY(6)/100)
 * × (1 + (qty5 + qty22 + qty28*LOG(highestDmg) + arcade62)/100)
 * × (1 + atom13/100) × (1 + (gridBonus147 + gridBonus166 + mealMineCurr)/100)
 *
 * BonusQTY(6) = 50 if mineFloor > 6, else 0 (from FLOOR_REWARD_QTY[6]).
 * LOG = base-10 log or the game's custom log.
 */
export function currencyPerHour({
  gridBonus129 = 0, gridBonus148 = 0, gridBonus147 = 0, gridBonus166 = 0,
  comp143 = 1, bonusQTY6 = 0, atom13 = 0, mealMineCurr = 0, arcade62 = 0,
  upgLevels, highestDmg = 1,
}) {
  const base = gridBonus129;
  const multi148 = 1 + gridBonus148 / 100;
  const compMulti = Math.max(1, Math.min(2, comp143));
  const bqMulti = Math.min(3, 1 + bonusQTY6 / 100);

  // getLOG = log10 in the game, clamped to positive
  const logDmg = highestDmg > 0 ? Math.log10(highestDmg) : 0;
  const farmPCT = 1 + (upgradeQTY(5, upgLevels[5])
                      + upgradeQTY(22, upgLevels[22])
                      + upgradeQTY(28, upgLevels[28]) * logDmg
                      + arcade62) / 100;
  const atomMulti = 1 + atom13 / 100;
  const passiveMulti = 1 + (gridBonus147 + gridBonus166 + mealMineCurr) / 100;

  return base * multi148 * compMulti * bqMulti * farmPCT * atomMulti * passiveMulti;
}

// ---------- wiggle (G5 research: Minehead_Copium, grid 166) ----------

/** Wiggle chance when first click hits a mine. Game code: 0.6 > randomFloat(). */
export const WIGGLE_CHANCE = 0.6;

/** Max wiggle saves per game = Grid_Bonus(166, mode 1) = research level. */
export function wiggleMaxPerGame(gridBonus166_1) {
  return Math.round(gridBonus166_1);
}

// ---------- Glimbo ----------

/**
 * Glimbo trade cost for trade slot `t`.
 * @param {number} t         trade index
 * @param {number} tradeLv   Research[12][t] — how many times this trade was done
 * @param {number} costExp   GLIMBO_COST_EXP[t]
 * @param {number} eventShop38  EventShopOwned(38) count
 */
export function glimboCost(t, tradeLv, costExp, eventShop38 = 0) {
  const raw = (1 + tradeLv + 1.5 * tradeLv) * Math.pow(costExp, tradeLv)
            * Math.max(0.1, 1 - 25 * eventShop38 / 100);
  if (raw < 1e9) return Math.floor(Math.max(1, raw));
  return raw;
}
