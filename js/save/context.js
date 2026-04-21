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
import { SHAPE_BONUS_PCT } from '../stats/data/w7/research.js';
import { buildEventShopArray, buildSuperBitArray, buildEmporiumArray, ribbonBonusAt, cloudBonus } from '../game-helpers.js';
import { buildMhqArray } from '../stats/systems/w7/minehead.js';
import { buildRogArray } from '../stats/systems/w7/sushi.js';
import { saveData } from '../state.js';
import { saveGlobalTime, tournamentDay, optionsListData } from './data.js';

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
    // Pre-computed lookup arrays (avoid per-call string searches)
    evShop: buildEventShopArray(eventShopStr),
    sb: buildSuperBitArray(gamingData12),
    emp: buildEmporiumArray(ninjaData102_9),
    cbGridAll: cloudBonus(71, saveData.weeklyBossData) + cloudBonus(72, saveData.weeklyBossData) + cloudBonus(76, saveData.weeklyBossData),
    ribbon100: ribbonBonusAt(100, saveData.ribbonData, olaStr379, saveData.weeklyBossData),
    mhq: buildMhqArray(mineFloor),

    // Button & Killroy research multipliers
    button0: saveData.cachedButtonBonus0,
    btnBaseNoGrid: saveData.cachedBtnBaseNoGrid,
    killroy5: saveData.cachedKillroy5,
    dream14: saveData.cachedDream14,

    // Sushi RoG bonuses (full precomputed array)
    rog: buildRogArray(saveData.cachedUniqueSushi),
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

    // Best shape bonus % the player owns (for F6 button snapshot)
    bestShapePct: (() => {
      const nShapes = computeShapesOwnedAt(saveData.researchLevel, { evShop: buildEventShopArray(eventShopStr), hasComp54: saveData.companionIds.has(54), spelunkyUpg7: saveData.cachedSpelunkyUpg7 });
      let best = 0;
      for (let i = 0; i < nShapes && i < SHAPE_BONUS_PCT.length; i++) if (SHAPE_BONUS_PCT[i] > best) best = SHAPE_BONUS_PCT[i];
      return best;
    })(),

    // Display-only (not used by sim math, but handy for callers)
    externalResearchPct: saveData.externalResearchPct,

    // Server time (Unix epoch seconds) — used to compute tournament reset offset
    saveGlobalTime: saveGlobalTime,

    // Tournament: OLA[511] = last registered tournament day + 1
    tourneyLastDay: Number(optionsListData?.[511]) || 0,
    // OLA[496] = client-cached getTournamentDay() (updated when tournament menu opens)
    tourneyCachedDay: Number(optionsListData?.[496]) || 0,
    // Game's internal tournament day counter (from tournament.global.T) — can be stale
    tournamentDay: tournamentDay,
  };
}

// ===== Sim context factory =====
// When sc (saveCtx) is provided, builds from it instead of the global saveData.
// This is required for Web Workers where saveData is a separate, unpopulated module.

export function makeSimCtx(gl, sc) {
  if (sc) {
    const hasComp55 = sc.companionHas55;
    const hasComp0DivOk = sc.companionHas0 && sc.cachedComp0DivOk;
    return {
      abm: calcAllBonusMultiWith(gl, hasComp55, hasComp0DivOk, sc.cbGridAll, (sc.rog && sc.rog[53]) || 0),
      c52:            sc.comp52TrueMulti,
      stickerFixed:   sc.cachedStickerFixed,
      boonyCount:     sc.cachedBoonyCount,
      evShop37:       sc.cachedEvShop37,
      extPctExSticker:sc.cachedExtPctExSticker,
      hasComp55,
      hasComp0DivOk,
      hasComp54:      sc.companionHas54,
      companionHas153: sc.companionHas153,
      evShop:         sc.evShop || [],
      sb:             sc.sb || [],
      emp:            sc.emp || [],
      cbGridAll:      sc.cbGridAll,
      rog:            sc.rog || [],
      mhq:           sc.mhq || [],
      spelunkyUpg7:   sc.cachedSpelunkyUpg7,
      serverVarResXP: sc.serverVarResXP,
      button0:        sc.button0 || 0,
      btnBaseNoGrid:  sc.btnBaseNoGrid || 0,
      killroy5:       sc.killroy5 || 0,
      dream14:        sc.dream14 || 0,
      bestShapePct:   sc.bestShapePct || 0,
    };
  }

  const mineFloor = saveData.stateR7[4] || 0;
  const eventShopStr = saveData.cachedEventShopStr;
  const gamingData12 = saveData.gamingData[12];
  const ninjaData102_9 = saveData.ninjaData?.[102]?.[9];

  const hasComp55 = saveData.companionIds.has(55);
  const hasComp0DivOk = saveData.companionIds.has(0) && saveData.cachedComp0DivOk;
  const _cbGridAll = cloudBonus(71, saveData.weeklyBossData) + cloudBonus(72, saveData.weeklyBossData) + cloudBonus(76, saveData.weeklyBossData);
  const _rog = buildRogArray(saveData.cachedUniqueSushi);
  return {
    abm: calcAllBonusMultiWith(gl, hasComp55, hasComp0DivOk, _cbGridAll, _rog[53] || 0),
    c52:            saveData.comp52TrueMulti,
    stickerFixed:   saveData.cachedStickerFixed,
    boonyCount:     saveData.cachedBoonyCount,
    evShop37:       saveData.cachedEvShop37,
    extPctExSticker:saveData.cachedExtPctExSticker,
    hasComp55,
    hasComp0DivOk,
    hasComp54:      saveData.companionIds.has(54),
    companionHas153: saveData.companionIds.has(153),
    evShop:         buildEventShopArray(eventShopStr),
    sb:             buildSuperBitArray(gamingData12),
    emp:            buildEmporiumArray(ninjaData102_9),
    cbGridAll:      _cbGridAll,
    rog:            _rog,
    mhq:           buildMhqArray(mineFloor),
    spelunkyUpg7:   saveData.cachedSpelunkyUpg7,
    serverVarResXP: saveData.serverVarResXP,
    dream14:        saveData.cachedDream14 || 0,
    button0:        saveData.cachedButtonBonus0 || 0,
    btnBaseNoGrid:  saveData.cachedBtnBaseNoGrid || 0,
    killroy5:       saveData.cachedKillroy5 || 0,
    bestShapePct:   0,  // not available in this code path; always 0
  };
}

export function getResearchCurrentExp(_saveCtx) {
  if (_saveCtx && _saveCtx.cachedResearchExp !== undefined) return _saveCtx.cachedResearchExp;
  return saveData.cachedResearchExp;
}

export function computeShapesOwned(rLv, gl, _saveCtx) {
  return computeShapesOwnedAt(rLv, makeSimCtx(gl, _saveCtx));
}

export function computeGridPointsAvailable(rLv, gl, bonusPts) {
  return Math.max(0, computeGridPointsEarned(rLv, gl[50] || 0, bonusPts) - computeGridPointsSpent(gl));
}

export function simTotalExp(opts, _saveCtx) {
  const { gridLevels: gl, shapeOverlay: so, magData: md, insightLvs: il, occFound: occ, researchLevel: rLv } = opts;
  const ctx = makeSimCtx(gl, _saveCtx);
  return simTotalExpWith(gl, so, md, il, occ, rLv, ctx, true);
}
