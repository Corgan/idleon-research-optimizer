// ===== SAVE CONTEXT =====
// Captures all save-derived constants needed by the sim path into a single
// passable object.  When provided to makeCtx / unifiedSim / optimizers, they
// no longer read global mutable state from state.js.
//
// Usage:
//   import { buildSaveContext } from './save/context.js';
//   const saveCtx = buildSaveContext();      // capture once after loading save
//   const result  = await unifiedSim(config, saveCtx);  // fully deterministic

import {  S  } from '../state.js';
import {
  OBS_BASE_EXP,
  buildKalMap,
  calcAllBonusMultiWith,
  computeGridPointsEarned,
  computeGridPointsSpent,
  computeOccurrencesToBeFound,
  computeShapesOwnedAt,
  gbWith,
  getKaleiMultiBase as _getKaleiMultiBasePure,
  simTotalExpWith,
} from '../sim-math.js';
import { eventShopOwned, superBitType, emporiumBonus, ribbonBonusAt } from './helpers.js';
import { mineheadBonusQTY } from './external.js';

/**
 * Snapshot every save-derived value the sim path needs.
 * The returned object is safe to store and reuse for multiple sim runs
 * against the same save data.
 */
export function buildSaveContext() {
  return {
    // Server variable for research EXP curve
    serverVarResXP: S.serverVarResXP,

    // Companion booleans
    companionHas55: S.companionIds.has(55),
    companionHas54: S.companionIds.has(54),
    companionHas0:  S.companionIds.has(0),
    cachedComp0DivOk: S.cachedComp0DivOk,

    // Cached scalars used by makeCtx
    comp52TrueMulti: S.comp52TrueMulti,
    cachedStickerFixed: S.cachedStickerFixed,
    cachedBoonyCount: S.cachedBoonyCount,
    cachedEvShop37: S.cachedEvShop37,
    cachedExtPctExSticker: S.cachedExtPctExSticker,
    cachedSpelunkyUpg7: S.cachedSpelunkyUpg7,
    cachedResearchExp: S.cachedResearchExp,

    // Pre-computed shop/minehead constants (avoid global-reading functions)
    evShop33: eventShopOwned(33),
    evShop34: eventShopOwned(34),
    evShop35: eventShopOwned(35),
    evShop36: eventShopOwned(36),
    sb34: superBitType(34),
    sb44: superBitType(44),
    sb62: superBitType(62),
    emp44: emporiumBonus(44),
    ribbon100: ribbonBonusAt(100),
    mhq2:  mineheadBonusQTY(2),
    mhq12: mineheadBonusQTY(12),
    mhq20: mineheadBonusQTY(20),

    // Mutable-array defaults (used as fallbacks in unifiedSim when config
    // doesn't override).  Stored as references - callers .slice() before mutation.
    gridLevels: S.gridLevels,
    insightLvs: S.insightLvs,
    insightProgress: S.insightProgress,
    occFound: S.occFound,
    shapeOverlay: S.shapeOverlay,
    magData: S.magData,
    magnifiersOwned: S.magnifiersOwned,
    researchLevel: S.researchLevel,
    magMaxPerSlot: S.magMaxPerSlot,
    shapePositions: S.shapePositions,
    cachedFailedRolls: S.cachedFailedRolls,

    // Shape cache (mutable - updated in-place during sim)
    shapeTiers: S.shapeTiers,
    covLUTCache:  S._covLUTCache,
    covLUTCacheN: S._covLUTCacheN,

    // Display-only (not used by sim math, but handy for callers)
    externalResearchPct: S.externalResearchPct,
  };
}

// ===== Stateful wrappers - delegate to pure sim-math via saveCtx =====

export function makeCtx(gl, saveCtx) {
  const hasComp55     = saveCtx.companionHas55;
  const hasComp0DivOk = saveCtx.companionHas0 && saveCtx.cachedComp0DivOk;
  return {
    abm: calcAllBonusMultiWith(gl, hasComp55, hasComp0DivOk),
    c52:            saveCtx.comp52TrueMulti,
    stickerFixed:   saveCtx.cachedStickerFixed,
    boonyCount:     saveCtx.cachedBoonyCount,
    evShop37:       saveCtx.cachedEvShop37,
    extPctExSticker:saveCtx.cachedExtPctExSticker,
    hasComp55,
    hasComp0DivOk,
    hasComp54:      saveCtx.companionHas54,
    evShop33:       saveCtx.evShop33,
    evShop34:       saveCtx.evShop34,
    evShop36:       saveCtx.evShop36,
    mhq2:          saveCtx.mhq2,
    mhq12:         saveCtx.mhq12,
    mhq20:         saveCtx.mhq20,
    spelunkyUpg7:   saveCtx.cachedSpelunkyUpg7,
    serverVarResXP: saveCtx.serverVarResXP,
  };
}

export function getResearchCurrentExp(saveCtx) {
  return saveCtx.cachedResearchExp;
}

export function computeShapesOwned(rLv, gl, saveCtx) {
  return computeShapesOwnedAt(rLv, makeCtx(gl, saveCtx));
}

export function computeGridPointsAvailable(rLv, gl, spelunkyUpg7) {
  return Math.max(0, computeGridPointsEarned(rLv, spelunkyUpg7) - computeGridPointsSpent(gl));
}

export function simTotalExp(opts, saveCtx) {
  const { gridLevels: gl, shapeOverlay: so, magData: md, insightLvs: il, occFound: occ, researchLevel: rLv } = opts;
  const ctx = makeCtx(gl, saveCtx);

  const total = simTotalExpWith(gl, so, md, il, occ, rLv, ctx);

  const kalMap = buildKalMap(md);
  const kalBase = _getKaleiMultiBasePure(gl, so, ctx);
  const gd101 = gbWith(gl, so, 93, ctx);
  const occTBF = computeOccurrencesToBeFound(rLv, occ);
  let obsTotal = 0;
  for (let i = 0; i < occTBF; i++) {
    let count = 0;
    for (const m of md) { if (m.type === 0 && m.slot === i) count++; }
    if (count === 0) continue;
    const base = OBS_BASE_EXP[i] || 0;
    const kalMulti = 1 + (kalMap[i] || 0) * kalBase;
    obsTotal += count * base * (1 + gd101 * (il[i] || 0) / 100) * kalMulti;
  }
  const multi = obsTotal > 0 ? total / obsTotal : 1;
  return { total, multi, obsBase: obsTotal };
}
