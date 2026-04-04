// ===== SAVE CONTEXT =====
// Captures all save-derived constants needed by the sim path into a single
// passable object.  When provided to makeCtx / unifiedSim / optimizers, they
// no longer read global mutable state from state.js.
//
// Usage:
//   import { buildSaveContext } from './save/context.js';
//   const saveCtx = buildSaveContext();      // capture once after loading save
//   const result  = await unifiedSim(config, saveCtx);  // fully deterministic

import {
  calcAllBonusMultiWith,
  computeGridPointsEarned,
  computeGridPointsSpent,
  computeShapesOwnedAt,
  simTotalExpWith,
} from '../sim-math.js';
import { eventShopOwned, superBitType, emporiumBonus, ribbonBonusAt } from '../game-helpers.js';
import { mineheadBonusQTY } from '../stats/systems/w7/research.js';
import { rogBonusQTY } from '../stats/systems/w7/sushi.js';
import { saveData } from '../state.js';

/**
 * Snapshot every save-derived value the sim path needs.
 * The returned object is safe to store and reuse for multiple sim runs
 * against the same save data.
 */
export function buildSaveContext() {
  const eventShopStr = saveData.cachedEventShopStr;
  const gamingData12 = saveData.gamingData[12];
  const ninjaData102_9 = saveData.ninjaData?.[102]?.[9];
  const olaStr379 = saveData.olaData[379];
  const mineFloor = saveData.stateR7[4] || 0;

  return {
    // Server variable for research EXP curve
    serverVarResXP: saveData.serverVarResXP,

    // Companion booleans
    companionHas55: saveData.companionIds.has(55),
    companionHas54: saveData.companionIds.has(54),
    companionHas0:  saveData.companionIds.has(0),
    companionHas153: saveData.companionIds.has(153),
    cachedComp0DivOk: saveData.cachedComp0DivOk,

    // Cached scalars used by makeCtx
    comp52TrueMulti: saveData.comp52TrueMulti,
    cachedStickerFixed: saveData.cachedStickerFixed,
    cachedBoonyCount: saveData.cachedBoonyCount,
    cachedEvShop37: saveData.cachedEvShop37,
    cachedExtPctExSticker: saveData.cachedExtPctExSticker,
    cachedSpelunkyUpg7: saveData.cachedSpelunkyUpg7,
    cachedResearchExp: saveData.cachedResearchExp,

    // Pre-computed shop/minehead constants (avoid global-reading functions)
    evShop33: eventShopOwned(33, eventShopStr),
    evShop34: eventShopOwned(34, eventShopStr),
    evShop35: eventShopOwned(35, eventShopStr),
    evShop36: eventShopOwned(36, eventShopStr),
    sb34: superBitType(34, gamingData12),
    sb44: superBitType(44, gamingData12),
    sb62: superBitType(62, gamingData12),
    emp44: emporiumBonus(44, ninjaData102_9),
    ribbon100: ribbonBonusAt(100, saveData.ribbonData, olaStr379),
    mhq2:  mineheadBonusQTY(2, mineFloor),
    mhq12: mineheadBonusQTY(12, mineFloor),
    mhq20: mineheadBonusQTY(20, mineFloor),

    // Sushi RoG bonuses affecting research
    rog0:  rogBonusQTY(0, saveData.cachedUniqueSushi),
    rog3:  rogBonusQTY(3, saveData.cachedUniqueSushi),
    rog8:  rogBonusQTY(8, saveData.cachedUniqueSushi),
    rog13: rogBonusQTY(13, saveData.cachedUniqueSushi),
    sailingArt37: saveData.cachedSailingArt37,
    cachedUniqueSushi: saveData.cachedUniqueSushi,

    // Mutable-array defaults (used as fallbacks in unifiedSim when config
    // doesn't override).  Stored as references - callers .slice() before mutation.
    gridLevels: saveData.gridLevels,
    insightLvs: saveData.insightLvs,
    insightProgress: saveData.insightProgress,
    occFound: saveData.occFound,
    shapeOverlay: saveData.shapeOverlay,
    magData: saveData.magData,
    magnifiersOwned: saveData.magnifiersOwned,
    researchLevel: saveData.researchLevel,
    magMaxPerSlot: saveData.magMaxPerSlot,
    shapePositions: saveData.shapePositions,
    cachedFailedRolls: saveData.cachedFailedRolls,

    // Shape cache (mutable - updated in-place during sim)
    shapeTiers: saveData.shapeTiers,
    covLUTCache:  saveData._covLUTCache,
    covLUTCacheN: saveData._covLUTCacheN,

    // Display-only (not used by sim math, but handy for callers)
    externalResearchPct: saveData.externalResearchPct,
  };
}

// ===== Sim context factory — reads saveData directly =====

export function makeSimCtx(gl) {
  const mineFloor = saveData.stateR7[4] || 0;
  const eventShopStr = saveData.cachedEventShopStr;
  const gamingData12 = saveData.gamingData[12];
  const ninjaData102_9 = saveData.ninjaData?.[102]?.[9];

  const hasComp55 = saveData.companionIds.has(55);
  const hasComp0DivOk = saveData.companionIds.has(0) && saveData.cachedComp0DivOk;
  return {
    abm: calcAllBonusMultiWith(gl, hasComp55, hasComp0DivOk),
    c52:            saveData.comp52TrueMulti,
    stickerFixed:   saveData.cachedStickerFixed,
    boonyCount:     saveData.cachedBoonyCount,
    evShop37:       saveData.cachedEvShop37,
    extPctExSticker:saveData.cachedExtPctExSticker,
    hasComp55,
    hasComp0DivOk,
    hasComp54:      saveData.companionIds.has(54),
    companionHas153: saveData.companionIds.has(153),
    evShop33:       eventShopOwned(33, eventShopStr),
    evShop34:       eventShopOwned(34, eventShopStr),
    evShop36:       eventShopOwned(36, eventShopStr),
    mhq2:          mineheadBonusQTY(2, mineFloor),
    mhq12:         mineheadBonusQTY(12, mineFloor),
    mhq20:         mineheadBonusQTY(20, mineFloor),
    spelunkyUpg7:   saveData.cachedSpelunkyUpg7,
    serverVarResXP: saveData.serverVarResXP,
    rog0:           rogBonusQTY(0, saveData.cachedUniqueSushi) || 0,
    rog8:           rogBonusQTY(8, saveData.cachedUniqueSushi) || 0,
  };
}

export function getResearchCurrentExp(_saveCtx) {
  return saveData.cachedResearchExp;
}

export function computeShapesOwned(rLv, gl, _saveCtx) {
  return computeShapesOwnedAt(rLv, makeSimCtx(gl));
}

export function computeGridPointsAvailable(rLv, gl, spelunkyUpg7, bonusPts) {
  return Math.max(0, computeGridPointsEarned(rLv, spelunkyUpg7, bonusPts) - computeGridPointsSpent(gl));
}

export function simTotalExp(opts, _saveCtx) {
  const { gridLevels: gl, shapeOverlay: so, magData: md, insightLvs: il, occFound: occ, researchLevel: rLv } = opts;
  const ctx = makeSimCtx(gl);
  return simTotalExpWith(gl, so, md, il, occ, rLv, ctx, true);
}
