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
  cachedBoonyCount,
  cachedComp0DivOk,
  cachedEvShop37,
  cachedExtPctExSticker,
  cachedResearchExp,
  cachedSpelunkyUpg7,
  cachedStickerFixed,
  comp52TrueMulti,
  companionIds,
  externalResearchPct,
  gridLevels,
  insightLvs,
  insightProgress,
  magData,
  magMaxPerSlot,
  magnifiersOwned,
  occFound,
  researchLevel,
  serverVarResXP,
  shapeOverlay,
  shapeTiers,
  _covLUTCache,
  _covLUTCacheN,
} from '../state.js';
import {
  OBS_BASE_EXP,
  _buildKalMap,
  calcAllBonusMultiWith,
  computeGridPointsEarned,
  computeGridPointsSpent,
  computeOccurrencesToBeFound,
  computeShapesOwnedAt,
  _gbWith,
  getKaleiMultiBase as _getKaleiMultiBasePure,
  simTotalExpWith,
} from '../sim-math.js';
import { eventShopOwned } from './helpers.js';
import { mineheadBonusQTY } from './external.js';

/**
 * Snapshot every save-derived value the sim path needs.
 * The returned object is safe to store and reuse for multiple sim runs
 * against the same save data.
 */
export function buildSaveContext() {
  return {
    // Server variable for research EXP curve
    serverVarResXP,

    // Companion booleans
    companionHas55: companionIds.has(55),
    companionHas54: companionIds.has(54),
    companionHas0:  companionIds.has(0),
    cachedComp0DivOk,

    // Cached scalars used by makeCtx
    comp52TrueMulti,
    cachedStickerFixed,
    cachedBoonyCount,
    cachedEvShop37,
    cachedExtPctExSticker,
    cachedSpelunkyUpg7,
    cachedResearchExp,

    // Pre-computed shop/minehead constants (avoid global-reading functions)
    evShop33: eventShopOwned(33),
    evShop34: eventShopOwned(34),
    evShop36: eventShopOwned(36),
    mhq2:  mineheadBonusQTY(2),
    mhq12: mineheadBonusQTY(12),
    mhq20: mineheadBonusQTY(20),

    // Mutable-array defaults (used as fallbacks in unifiedSim when config
    // doesn't override).  Stored as references - callers .slice() before mutation.
    gridLevels,
    insightLvs,
    insightProgress,
    occFound,
    shapeOverlay,
    magData,
    magnifiersOwned,
    researchLevel,
    magMaxPerSlot,

    // Shape cache (mutable - updated in-place during sim)
    shapeTiers,
    covLUTCache:  _covLUTCache,
    covLUTCacheN: _covLUTCacheN,

    // Display-only (not used by sim math, but handy for callers)
    externalResearchPct,
  };
}

// ===== Stateful wrappers - read module-level state, delegate to pure sim-math =====

export function makeCtx(gl, saveCtx) {
  const hasComp55     = saveCtx ? saveCtx.companionHas55 : companionIds.has(55);
  const hasComp0DivOk = saveCtx ? (saveCtx.companionHas0 && saveCtx.cachedComp0DivOk) : (companionIds.has(0) && cachedComp0DivOk);
  return {
    abm: calcAllBonusMultiWith(gl, hasComp55, hasComp0DivOk),
    c52:            saveCtx ? saveCtx.comp52TrueMulti      : comp52TrueMulti,
    stickerFixed:   saveCtx ? saveCtx.cachedStickerFixed   : cachedStickerFixed,
    boonyCount:     saveCtx ? saveCtx.cachedBoonyCount     : cachedBoonyCount,
    evShop37:       saveCtx ? saveCtx.cachedEvShop37       : cachedEvShop37,
    extPctExSticker:saveCtx ? saveCtx.cachedExtPctExSticker: cachedExtPctExSticker,
    hasComp55,
    hasComp0DivOk,
    hasComp54:      saveCtx ? saveCtx.companionHas54       : companionIds.has(54),
    evShop33:       saveCtx ? saveCtx.evShop33  : eventShopOwned(33),
    evShop34:       saveCtx ? saveCtx.evShop34  : eventShopOwned(34),
    evShop36:       saveCtx ? saveCtx.evShop36  : eventShopOwned(36),
    mhq2:          saveCtx ? saveCtx.mhq2   : mineheadBonusQTY(2),
    mhq12:         saveCtx ? saveCtx.mhq12  : mineheadBonusQTY(12),
    mhq20:         saveCtx ? saveCtx.mhq20  : mineheadBonusQTY(20),
    spelunkyUpg7:   saveCtx ? saveCtx.cachedSpelunkyUpg7   : cachedSpelunkyUpg7,
    serverVarResXP: saveCtx ? saveCtx.serverVarResXP       : serverVarResXP,
  };
}

export function ctxFrom(s, saveCtx) {
  return makeCtx(s.gl, saveCtx);
}

export function getResearchCurrentExp(saveCtx) {
  return saveCtx ? saveCtx.cachedResearchExp : cachedResearchExp;
}

export function computeShapesOwned() {
  return computeShapesOwnedAt(researchLevel, makeCtx(gridLevels));
}

export function computeGridPointsAvailable() {
  return Math.max(0, computeGridPointsEarned(researchLevel, cachedSpelunkyUpg7) - computeGridPointsSpent(gridLevels));
}

export function simTotalExp(opts = {}, saveCtx) {
  const gl = opts.gridLevels || gridLevels;
  const so = opts.shapeOverlay || shapeOverlay;
  const md = opts.magData || magData;
  const il = opts.insightLvs || insightLvs;
  const occ = opts.occFound || occFound;
  const rLv = opts.researchLevel !== undefined ? opts.researchLevel : researchLevel;
  const ctx = makeCtx(gl, saveCtx);

  const total = simTotalExpWith(gl, so, md, il, occ, rLv, ctx);

  const kalMap = _buildKalMap(md);
  const kalBase = _getKaleiMultiBasePure(gl, so, ctx);
  const gd101 = _gbWith(gl, so, 93, ctx);
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
