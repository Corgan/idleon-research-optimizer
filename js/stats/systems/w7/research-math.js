// ===== RESEARCH MATH - pure calculation functions =====
// Every function here is pure: depends only on parameters and game-data constants.
// No global mutable state. Safe to call from workers and Node.js tests.
// Canonical home: stats/systems/w7/research-math.js

import {
  RES_GRID_RAW, GRID_INDICES, SHAPE_BONUS_PCT, OCC_DATA,
  GRID_COLS, GRID_ROWS, GRID_SIZE,
} from '../../data/w7/research.js';

// ----- Grid bonus helpers -----

/**
 * Compute raw grid bonus for a cell with shape overlay and allBonusMulti.
 * ctx = { abm: number, c52: number }
 */
export function gbWith(gl, so, idx, ctx) {
  const info = RES_GRID_RAW[idx];
  if (!info) return 0;
  const lv = gl[idx] || 0;
  if (lv === 0) return 0;
  let val = info[2] * lv;
  const si = so[idx];
  if (si >= 0 && si < SHAPE_BONUS_PCT.length) val *= (1 + SHAPE_BONUS_PCT[si] / 100);
  val *= ctx.abm;
  return val;
}

// ----- Kaleidoscope adjacency map -----

/**
 * Build adjacency map from kaleidoscope magnifiers.
 * Observation grid: 8 columns (not 20). slot = observation index.
 */
export function buildKalMap(mags) {
  const km = {};
  for (const m of mags) {
    if (m.type === 2 && m.slot >= 0) {
      const s = m.slot;
      if (s % 8 !== 7) km[s+1] = (km[s+1] || 0) + 1;
      if (s % 8 !== 0) km[s-1] = (km[s-1] || 0) + 1;
      if (s > 7) km[s-8] = (km[s-8] || 0) + 1;
      if (s < 72) km[s+8] = (km[s+8] || 0) + 1;
    }
  }
  return km;
}

/** Set of observation indices that have at least one monocle assigned. */
export function getMonoObsSet(md) {
  const s = new Set();
  for (const m of md) { if (m.type === 1 && m.slot >= 0) s.add(m.slot); }
  return s;
}

/** Count magnifiers by type in a single pass. */
export function countMagTypes(pool) {
  let regular = 0, mono = 0, kalei = 0;
  for (const m of pool) {
    if (m.type === 0) regular++;
    else if (m.type === 1) mono++;
    else if (m.type === 2) kalei++;
  }
  return { regular, mono, kalei };
}

/** Count magnifiers of a specific type assigned to a specific slot. */
export function countMagsOfType(md, type, slot) {
  let c = 0;
  for (const m of md) if (m.type === type && m.slot === slot) c++;
  return c;
}

/** Compute Grid_Bonus mode 2 (total/scaled values for $ and ^ placeholders).
 *  Pure function — callers adapt their data source to these primitives. */
export function gridBonusMode2(nodeIdx, curBonus, gl31, il, occ, boonyCount, opts500) {
  switch (nodeIdx) {
    case 31: return 25 * gl31;
    case 67: case 68: case 107: return curBonus * boonyCount;
    case 94: {
      let t = 0; for (let i = 0; i < il.length; i++) t += il[i] || 0;
      return curBonus * t;
    }
    case 112: {
      let f = 0; for (let i = 0; i < occ.length; i++) if (occ[i] >= 1) f++;
      return curBonus * f;
    }
    case 151: return Number(opts500) || 0;
    case 168: return curBonus;
    default: return curBonus;
  }
}

/** Observation indices that are usable for magnifier placement. */
export function getAvailableSlots(rLv, occ) {
  const n = computeOccurrencesToBeFound(rLv, occ);
  const slots = [];
  for (let i = 0; i < n; i++) {
    if (isObsUsable(i, rLv, occ)) slots.push(i);
  }
  return slots;
}

// ----- Observation / Insight -----

/** Per-observation base EXP with 1 magnifier - precomputed. */
export const OBS_BASE_EXP = new Float64Array(43);
for (let _t = 0; _t < 43; _t++) {
  OBS_BASE_EXP[_t] = (4 + (_t/2 + Math.floor(_t/4))) * (1 + Math.pow(_t, 1 + _t/15*0.4) / 10) + (Math.pow(_t, 1.5) + 1.5*_t);
}

export function obsBaseExp(t) { return OBS_BASE_EXP[t] || 0; }

/** Insight EXP required to reach the next level for observation obsIdx at level lv. */
export function insightExpReqAt(obsIdx, lv) {
  const t = obsIdx;
  return (2 + 0.7*t) * Math.pow(1.75 + t/200, lv) * (1 + Math.pow(t, 2)/100) + lv;
}

/**
 * Insight EXP/hr for a specific obs given full param set.
 * Returns 0 if no monocles assigned.
 */
export function insightExpRate(obsIdx, md, il, gl, so, ctx) {
  const count = countMagsOfType(md, 1, obsIdx);
  if (count === 0) return 0;
  const insightBonus = gbWith(gl, so, 92, ctx) + gbWith(gl, so, 91, ctx);
  const emp46 = ctx.emp46 || 0;
  const kalMap = buildKalMap(md);
  const kalBase = getKaleiMultiBase(gl, so, ctx);
  const kalMulti = 1 + (kalMap[obsIdx] || 0) * kalBase;
  return 3 * count * (1 + insightBonus / 100) * (1 + 35 * emp46 / 100) * kalMulti;
}

/** Whether insight levels affect EXP (gd93 or gd94 > 0). */
export function insightAffectsExp(gl, so, ctx) {
  return gbWith(gl, so, 93, ctx) > 0 || gbWith(gl, so, 94, ctx) > 0;
}

/** Kaleidoscope base multiplier from grid bonuses + EmporiumBonus(46). */
export function getKaleiMultiBase(gl, so, ctx) {
  return (30 + gbWith(gl, so, 52, ctx) + gbWith(gl, so, 72, ctx) + 6 * (ctx.emp46 || 0)) / 100;
}

// ----- Magnifier slot cap -----

/** Max magnifiers per observation slot at research level rLv. */
export function magMaxForLevel(rLv) {
  return Math.min(4, Math.round(1 + Math.min(1, Math.floor(rLv/40)) + Math.min(1, Math.floor(rLv/70)) + Math.min(1, Math.floor(rLv/120))));
}

// ----- Observation availability -----

/** Is observation i usable (found AND research level high enough)? */
export function isObsUsable(i, rLv, occ) {
  if (occ[i] < 1) return false;
  return rLv >= (OCC_DATA[i] ? OCC_DATA[i].roll : Infinity);
}

/**
 * Number of observations that can be found at research level rLv.
 * rLv and occ are required parameters.
 */
export function computeOccurrencesToBeFound(rLv, occ) {
  if (rLv < 1) return 0;
  if (occ[0] === 0) return 1;
  return Math.min(43, 5 * Math.floor((rLv + 10) / 10)
    - Math.floor(rLv / 20)
    - Math.floor(rLv / 30)
    - Math.floor(rLv / 50));
}

// ----- Grid adjacency / unlock -----

/**
 * Is a grid cell unlocked (leveled, seed, or adjacent to a leveled cell)?
 * Pure - only needs RES_GRID_RAW + GRID_COLS + GRID_SIZE constants.
 */
export function isGridCellUnlocked(idx, gl) {
  if (!RES_GRID_RAW[idx]) return false;
  if ((gl[idx] || 0) >= 1) return true;
  const col = idx % GRID_COLS;
  // Seed cells (always selectable)
  if ((col === 9 || col === 10) && idx >= 100 && idx <= 140) return true;
  // Adjacent check
  if (idx >= GRID_COLS  && (gl[idx - GRID_COLS] || 0) >= 1) return true;
  if (idx < GRID_SIZE - GRID_COLS && (gl[idx + GRID_COLS] || 0) >= 1) return true;
  if (col > 0             && (gl[idx - 1] || 0) >= 1) return true;
  if (col < GRID_COLS - 1 && (gl[idx + 1] || 0) >= 1) return true;
  return false;
}

/**
 * Find grid nodes adjacent to idx that would become unlockable after gl[idx] >= 1.
 */
export function findNewlyUnlockable(idx, gl) {
  const col = idx % GRID_COLS, row = Math.floor(idx / GRID_COLS);
  const adj = [];
  if (row > 0) adj.push(idx - GRID_COLS);
  if (row < GRID_ROWS - 1) adj.push(idx + GRID_COLS);
  if (col > 0) adj.push(idx - 1);
  if (col < GRID_COLS - 1) adj.push(idx + 1);
  const result = [];
  for (const n of adj) {
    if (!RES_GRID_RAW[n]) continue;
    if ((gl[n] || 0) >= 1) continue;
    if (isGridCellUnlocked(n, gl)) continue;
    result.push(n);
  }
  return result;
}

// ----- Death note -----

export function deathNoteRank(kills, mode, riftLv) {
  if (mode === 7842) {
    if (kills < 100) return 0;
    if (kills < 250) return 1;
    if (kills < 1000) return 2;
    if (kills < 5000) return 3;
    if (kills < 25000) return 4;
    if (kills < 100000) return 5;
    if (kills < 1000000) return 7;
    return 10;
  }
  if (kills < 25000) return 0;
  if (kills < 100000) return 1;
  if (kills < 250000) return 2;
  if (kills < 500000) return 3;
  if (kills < 1000000) return 4;
  if (kills < 5000000) return 5;
  if (kills < 100000000) return 7;
  if (kills > 1000000000 && (riftLv || 0) >= 20) return 20;
  return 10;
}

// ----- Research EXP curve -----

// ----- Total EXP rate -----

/**
 * Compute total research EXP/hr from full simulation state.
 * Pure - all mutable state comes through params + ctx.
 * ctx = { abm, c52, stickerFixed, boonyCount, evShop37, extPctExSticker }
 */
export function simTotalExpWith(gl, so, md, il, occ, rLv, ctx, _detail) {
  const _c52 = ctx.c52;
  const kalMap = buildKalMap(md);
  const kalBase = getKaleiMultiBase(gl, so, ctx);
  const gd101 = gbWith(gl, so, 93, ctx);
  const occTBF = computeOccurrencesToBeFound(rLv, occ);
  // Pre-compute regular magnifier counts per slot in a single pass
  const magCounts = new Int32Array(occTBF);
  for (const m of md) { if (m.type === 0 && m.slot >= 0 && m.slot < occTBF) magCounts[m.slot]++; }
  let obsTotal = 0;
  for (let i = 0; i < occTBF; i++) {
    const count = magCounts[i];
    if (count === 0) continue;
    const base = obsBaseExp(i);
    const kalMulti = 1 + (kalMap[i] || 0) * kalBase;
    obsTotal += count * base * (1 + gd101 * (il[i] || 0) / 100) * kalMulti;
  }
  const dynSticker = ctx.stickerFixed > 0
    ? (1 + (gbWith(gl, so, 68, ctx) * ctx.boonyCount + 30 * ctx.evShop37) / 100) * ctx.stickerFixed
    : 0;
  let additive = gbWith(gl, so, 50, ctx) + gbWith(gl, so, 90, ctx) + gbWith(gl, so, 110, ctx) + gbWith(gl, so, 31, ctx) + ctx.extPctExSticker + dynSticker;
  let occFoundCount = 0;
  for (let i = 0; i < occTBF; i++) if ((occ[i] || 0) >= 1) occFoundCount++;
  additive += gbWith(gl, so, 112, ctx) * occFoundCount;
  let totalObsLV = 0;
  for (let i = 0; i < occTBF; i++) if ((il[i] || 0) >= 1) totalObsLV += il[i];
  additive += gbWith(gl, so, 94, ctx) * totalObsLV;
  const takinNotes = gbWith(gl, so, 70, ctx);
  // Compute button0 dynamically from grid 125 so optimizer sees changes to gl[125]
  const button0 = ctx.btnBaseNoGrid > 0
    ? ctx.btnBaseNoGrid * (1 + gbWith(gl, so, 125, ctx) / 100)
    : (ctx.button0 || 0);
  const multi = (1 + additive / 100) * (1 + takinNotes / 100) * (1 + button0 / 100) * (1 + (ctx.killroy5 || 0) / 100) * _c52 * (1 + (ctx.rog0 || 0) / 100);
  const total = obsTotal * multi;
  if (_detail) return { total, obsBase: obsTotal, multi };
  return total;
}

// ----- Research EXP curve -----

/**
 * EXP required to go from level lv to lv+1.
 * serverVarResXP is a save-data constant (default 1).
 */
export function researchExpReq(lv, serverVarResXP) {
  const t = lv;
  const A = Math.max(1, serverVarResXP || 1);
  return 10 * Math.max(0, t - 1)
    + 10 * (1 + Math.pow(t, 1 + t / 10 * 0.4) / 10)
        * Math.pow(1.1, t)
        * Math.pow(A, Math.max(0, t - 20));
}

/**
 * Advance research level as many times as accumulated EXP allows.
 * Mutates nothing - returns new values.
 */
export function advanceResearchLevel(rExp, rLv, svrxp) {
  let changed = false;
  while (rExp >= researchExpReq(rLv, svrxp) - 1e-9) {
    rExp -= researchExpReq(rLv, svrxp);
    if (rExp < 0) rExp = 0;
    rLv++;
    changed = true;
  }
  return { rExp, rLv, changed };
}

/**
 * Advance insight levels for all monocle-targeted observations.
 * Mutates il[] and ip[] in place. Returns true if any level-up occurred.
 * Optional onLevelUp(obsIdx) callback fires for each individual level-up.
 */
export function advanceInsightLevels(monoSlots, md, il, ip, gl, so, ctx, jumpHrs, onLevelUp) {
  let changed = false;
  for (const obsIdx of monoSlots) {
    const iRate = insightExpRate(obsIdx, md, il, gl, so, ctx);
    if (iRate <= 0) continue;
    ip[obsIdx] = (ip[obsIdx] || 0) + iRate * jumpHrs;
    let req = insightExpReqAt(obsIdx, il[obsIdx] || 0);
    while (ip[obsIdx] >= req - 1e-9) {
      ip[obsIdx] -= req;
      if (ip[obsIdx] < 0) ip[obsIdx] = 0;
      il[obsIdx] = (il[obsIdx] || 0) + 1;
      changed = true;
      if (onLevelUp) onLevelUp(obsIdx);
      req = insightExpReqAt(obsIdx, il[obsIdx] || 0);
    }
  }
  return changed;
}

/**
 * Compute hours until the next insight level-up across any monocle-targeted obs.
 * Returns Infinity if no insight progress is being made.
 */
export function hrsToNextInsightLv(monoSlots, md, il, ip, gl, so, ctx) {
  let minHrs = Infinity;
  for (const obsIdx of monoSlots) {
    const iRate = insightExpRate(obsIdx, md, il, gl, so, ctx);
    if (iRate <= 0) continue;
    const iReq = insightExpReqAt(obsIdx, il[obsIdx] || 0);
    const iHrs = (iReq - (ip[obsIdx] || 0)) / iRate;
    if (iHrs < minHrs) minHrs = iHrs;
  }
  return minHrs;
}

/**
 * Lightweight forward projection sim - event-driven jumps with no reoptimization.
 * Mutates il[] and ip[] in place. Returns { totalExp, time, rLv, rExp }.
 * Optional onInsightLevelUp(obsIdx) callback; return true to stop the loop.
 * Optional onReopt(md, il, occ, rLv) callback; called on level-up/insight events,
 *   should return a new md array (or falsy to keep current).
 */
export function simForwardProjection({
  monoSlots, md, il, ip, gl, so, occ, rLv, rExp, ctx,
  maxHrs, maxJumps = 5000,
  targetLevel,
  onInsightLevelUp,
  onReopt,
  assumeObsUnlocked = false,
}) {
  let curRate = simTotalExpWith(gl, so, md, il, occ, rLv, ctx);
  let totalExp = 0, time = 0, stop = false;
  const svrxp = ctx.serverVarResXP;

  for (let j = 0; j < maxJumps && !stop; j++) {
    if (targetLevel != null && rLv >= targetLevel) break;
    const timeLeft = maxHrs - time;
    if (timeLeft <= 1e-9 || curRate <= 0) break;

    const hrsToRes = (researchExpReq(rLv, svrxp) - rExp) / curRate;
    const hrsToIns = hrsToNextInsightLv(monoSlots, md, il, ip, gl, so, ctx);

    let jumpHrs = Math.min(hrsToRes, hrsToIns, timeLeft);
    if (jumpHrs <= 0) jumpHrs = 1e-9;

    totalExp += curRate * jumpHrs;
    rExp += curRate * jumpHrs;
    time += jumpHrs;

    const _adv = advanceResearchLevel(rExp, rLv, svrxp);
    rExp = _adv.rExp; rLv = _adv.rLv;

    if (_adv.changed && assumeObsUnlocked) {
      for (let oi = 0; oi < OCC_DATA.length; oi++) {
        if ((occ[oi] || 0) < 1 && OCC_DATA[oi].roll <= rLv) occ[oi] = 1;
      }
    }

    const insChanged = advanceInsightLevels(monoSlots, md, il, ip, gl, so, ctx, jumpHrs,
      onInsightLevelUp ? (obsIdx) => { if (onInsightLevelUp(obsIdx)) stop = true; } : undefined
    );

    if (_adv.changed || (insChanged && insightAffectsExp(gl, so, ctx))) {
      if (onReopt) {
        const newMD = onReopt(md, il, occ, rLv);
        if (newMD) md = newMD;
      }
      curRate = simTotalExpWith(gl, so, md, il, occ, rLv, ctx);
    }
  }

  return { totalExp, time, rLv, rExp };
}

// ----- Grid points -----

/**
 * Compute grid points earned at a given research level.
 * sq50 = grid level of node 50 (Pts Every Ten).
 * bonusPts = flat bonus points (e.g. 10 from Companion 153, RoG 3+13, Sailing Art 37).
 */
export function computeGridPointsEarned(rLv, sq50, bonusPts) {
  return Math.floor(rLv + (bonusPts || 0) + Math.floor(rLv / 10) * Math.round(1 + Math.min(1, Math.floor(rLv / 60)) + (sq50 || 0)));
}

/**
 * Compute total grid points spent from a grid levels array.
 */
export function computeGridPointsSpent(gl) {
  let total = 0;
  for (const idx of GRID_INDICES) total += gl[idx] || 0;
  return total;
}

/**
 * Compute available (unspent) grid points.
 * @param {Int32Array|number[]} gl - Grid levels
 * @param {number} rLv - Research level
 * @param {object} [saveCtx] - Save context with bonus fields
 */
export function gridPointsAvail(gl, rLv, saveCtx) {
  var sq50 = gl[50] || 0;
  var bonusPts = (saveCtx && saveCtx.companionHas153 ? 10 : 0) +
    ((saveCtx && saveCtx.rog3) || 0) +
    ((saveCtx && saveCtx.rog13) || 0) +
    ((saveCtx && saveCtx.sailingArt37) || 0);
  var earned = computeGridPointsEarned(rLv, sq50, bonusPts);
  return Math.max(0, earned - computeGridPointsSpent(gl));
}

// ----- All-bonus multiplier -----

/**
 * Compute allBonusMulti from explicit companion booleans.
 * Pure - no globals.
 */
export function calcAllBonusMultiWith(gl, hasComp55, hasComp0DivOk, cbGridAll) {
  const comp55val = hasComp55 ? 15 : 0;
  const comp0val = hasComp0DivOk && (gl[173] || 0) > 0 ? 5 : 0;
  return 1 + (comp55val + comp0val + (cbGridAll || 0)) / 100;
}

/** Recompute ctx.abm from gl. Mutates ctx in place. */
export function refreshAbm(ctx, gl) {
  ctx.abm = calcAllBonusMultiWith(gl, ctx.hasComp55, ctx.hasComp0DivOk, ctx.cbGridAll);
}

// ----- Magnifiers owned -----

/**
 * Compute how many magnifiers are owned at a given research level + grid state.
 * ctx must provide: evShop33, evShop34, mhq2, mhq12, mhq20.
 */
export function computeMagnifiersOwnedWith(gl, rLv, ctx) {
  const kaleiOwned = Math.round((gl[72] || 0) + ctx.evShop33);
  const monoOwned = Math.round(gl[91] || 0);
  const lvBonus = Math.min(1, Math.floor(rLv / 10))
    + Math.min(1, Math.floor(rLv / 100))
    + Math.min(1, Math.floor(rLv / 130))
    + Math.min(1, Math.floor(rLv / 140));
  const comp153 = ctx.companionHas153 ? 1 : 0;
  const rog8 = ctx.rog8 || 0;
  return Math.min(80, Math.round(
    1 + kaleiOwned + monoOwned
    + ctx.mhq2 + ctx.mhq12 + ctx.mhq20
    + ctx.evShop34
    + lvBonus + comp153 + rog8
  ));
}

// ----- Shapes owned -----

/**
 * Compute how many shapes are owned at a given research level.
 * ctx must provide: evShop36, hasComp54, spelunkyUpg7.
 */
export function computeShapesOwnedAt(lv, ctx) {
  return Math.min(10, Math.round(
    ctx.evShop36
    + Math.min(1, Math.max(0, Math.floor(lv / 20) * (ctx.hasComp54 ? 1 : 0)))
    + Math.min(1, Math.floor(lv / 20) * (ctx.spelunkyUpg7 >= 1 ? 1 : 0))
    + Math.min(1, Math.floor(lv / 20))
    + Math.min(1, Math.floor(lv / 30))
    + Math.min(1, Math.floor(lv / 50))
    + Math.min(1, Math.floor(lv / 80))
    + Math.min(1, Math.floor(lv / 110))
  ));
}
