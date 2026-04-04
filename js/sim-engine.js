// ===== SIMULATION ENGINE =====
// unifiedSim + orchestration helpers.

import { buildSaveContext } from './save/context.js';
import { OCC_DATA } from './game-data.js';
import {
  buildKalMap,
  gbWith,
  advanceInsightLevels,
  advanceResearchLevel,
  computeMagnifiersOwnedWith,
  computeOccurrencesToBeFound,
  countMagTypes,
  getKaleiMultiBase,
  getMonoObsSet,
  hrsToNextInsightLv,
  insightAffectsExp,
  insightExpRate,
  insightExpReqAt,
  isObsUsable,
  magMaxForLevel,
  obsBaseExp,
  researchExpReq,
  simForwardProjection,
  simTotalExpWith,
} from './sim-math.js';
import { cloneSimState } from './sim-state.js';
import { growMagPoolTyped } from './optimizers/mags.js';
import { getResearchCurrentExp, makeSimCtx } from './save/context.js';
import { optimizeShapePlacement } from './optimizers/shapes.js';
import { optimizeMagsFor } from './optimizers/magnifiers.js';
import { chooseMonoTargets, buildConcentratedLayout } from './optimizers/monos.js';
import { beamSpendAtLevel } from './optimizers/grid-spend.js';

export function optimizeShapesFor(s, simOpts, precomputedCellValues, saveCtx) {
  const gl = s.gl, so = s.so, md = s.md, il = s.il, occ = s.occ, rLv = s.rLv;
  const _sc = saveCtx || buildSaveContext();
  const opts = Object.assign({}, simOpts || {},
    { gridLevels: gl, shapeOverlay: so, magData: md || _sc.magData, insightLvs: il || _sc.insightLvs, occFound: occ || _sc.occFound });
  if (rLv !== undefined) opts.researchLevel = rLv;
  if (saveCtx) opts.saveCtx = saveCtx;
  const result = optimizeShapePlacement(opts, undefined, precomputedCellValues);
  // Keep existing overlay if no improvement - avoids cosmetic churn
  if (result.currentTotal > 0 && result.improvPct <= 0) {
    return { overlay: so.slice(), positions: result.optimizedPositions };
  }
  return { overlay: result.optimizedOverlay, positions: result.optimizedPositions };
}

// Centralized post-grind optimization: re-optimize mags + monocles + shapes for new insight levels.
// Returns { md, so, expHr }.
export async function optimizePostGrind(state, newIL, ctx, monoLookahead, saveCtx) {
  const { gl, so, md, ip, occ, rLv, mOwned, mMax } = state;
  const postMD = await optimizeMagsFor({gl, so, md, il: newIL, occ, rLv, mOwned, mMax}, ctx);
  const postMDFull = chooseMonoTargets({gl, so, md: postMD, il: newIL, ip, occ, rLv, mMax}, ctx, monoLookahead);
  const postShapes = optimizeShapesFor({gl, so, md: postMDFull, il: newIL, occ, rLv}, undefined, undefined, saveCtx);
  const expHr = simTotalExpWith(gl, postShapes.overlay, postMDFull, newIL, occ, rLv, ctx);
  return { md: postMDFull, so: postShapes.overlay, expHr };
}

function _estimateRemainingHrs(config, currentTime, rLv, rExp, expHr, ctx) {
  if (config.target.type === 'hours') return Math.max(1, config.target.value - currentTime);
  if (rLv >= config.target.value) return 1;
  let expNeeded = -rExp;
  const svrxp = ctx.serverVarResXP;
  for (let lv = rLv; lv < config.target.value; lv++) expNeeded += researchExpReq(lv, svrxp);
  return expHr > 0 ? Math.max(1, expNeeded / expHr) : 72;
}

export function reoptRegularMags(s, ctx) {
  const gl = s.gl, so = s.so, md = s.md, il = s.il, occ = s.occ, rLv = s.rLv, maxPerSlot = s.mMax;
  const kalEntries = [], monoEntries = [];
  let numRegular = 0;
  for (const m of md) {
    if (m.type === 2) kalEntries.push({...m});
    else if (m.type === 1) monoEntries.push({...m});
    else if (m.type === 0) numRegular++;
  }
  const occTBF = computeOccurrencesToBeFound(rLv, occ);
  const kalMap = buildKalMap(md);
  const kalBase = getKaleiMultiBase(gl, so, ctx);
  const gd101 = gbWith(gl, so, 93, ctx);
  const slotUsed = {};
  for (const m of kalEntries) { if (m.slot >= 0) slotUsed[m.slot] = (slotUsed[m.slot] || 0) + 1; }
  for (const m of monoEntries) { if (m.slot >= 0) slotUsed[m.slot] = (slotUsed[m.slot] || 0) + 1; }
  const cands = [];
  for (let i = 0; i < occTBF; i++) {
    if (!isObsUsable(i, rLv, occ)) continue;
    const room = maxPerSlot - (slotUsed[i] || 0);
    if (room <= 0) continue;
    const v = obsBaseExp(i) * (1 + gd101 * (il[i] || 0) / 100) * (1 + (kalMap[i] || 0) * kalBase);
    for (let c = 0; c < room; c++) cands.push({ slot: i, val: v });
  }
  cands.sort((a, b) => b.val - a.val);
  const regEntries = [];
  for (let i = 0; i < Math.min(numRegular, cands.length); i++) {
    regEntries.push({ type: 0, slot: cands[i].slot, x: 0, y: 0 });
  }
  return [...kalEntries, ...regEntries, ...monoEntries];
}

// Compute the max hours to next insight level-up across all monocle-targeted observations
function _insightBreakEvenHrs(md, il, ip, gl, so, ctx) {
  const monoObs = getMonoObsSet(md);
  let maxHrs = 0;
  for (const obs of monoObs) {
    const iRate = insightExpRate(obs, md, il, gl, so, ctx);
    if (iRate <= 0) continue;
    const req = insightExpReqAt(obs, il[obs] || 0);
    const remaining = Math.max(0, req - (ip[obs] || 0));
    const hrs = remaining / iRate;
    if (hrs > maxHrs) maxHrs = hrs;
  }
  return maxHrs;
}

// Find the most profitable insight grind opportunity via permutation search.
// Returns null if no grind is worth doing within remainingHrs.
async function _findBestInsightGrind(s, curExpHr, remainingHrs, ctx, assumeObsUnlocked, saveCtx) {
  const gl = s.gl, so = s.so, md = s.md, il = s.il, ip = s.ip, occ = s.occ, rLv = s.rLv, mMax = s.mMax, mOwned = s.mOwned;
  const svrxp = ctx.serverVarResXP;
  if (remainingHrs < 1) return null;
  const monoCount = countMagTypes(md).mono;
  if (monoCount === 0) return null;
  if (!insightAffectsExp(gl, so, ctx)) return null;

  const futureRLv = assumeObsUnlocked ? rLv + 10 : rLv;
  const occTBF = computeOccurrencesToBeFound(futureRLv, occ);

  let projOcc = occ;
  if (assumeObsUnlocked) {
    projOcc = occ.slice();
    for (let oi = 0; oi < OCC_DATA.length; oi++) {
      if ((projOcc[oi] || 0) < 1 && OCC_DATA[oi].roll <= futureRLv) projOcc[oi] = 1;
    }
  }
  const projCurExpHr = assumeObsUnlocked ? simTotalExpWith(gl, so, md, il, projOcc, rLv, ctx) : curExpHr;

  // Phase 1: cheap screening
  const candidates = [];
  for (let i = 0; i < Math.min(occTBF, OCC_DATA.length); i++) {
    if (assumeObsUnlocked && (occ[i] || 0) < 1 && OCC_DATA[i].roll <= futureRLv) {
      // will be unlocked soon - allow as candidate
    } else if (!isObsUsable(i, rLv, occ)) continue;
    const grindMD = buildConcentratedLayout({...s, occ: projOcc}, i, ctx);
    const iRate = insightExpRate(i, grindMD, il, gl, so, ctx);
    if (iRate <= 0) continue;
    const iReq = insightExpReqAt(i, il[i] || 0);
    const iProgress = ip[i] || 0;
    const grindHrs = Math.max(0, iReq - iProgress) / iRate;
    if (grindHrs <= 0 || grindHrs > remainingHrs * 0.8) continue;
    const grindExpHr = simTotalExpWith(gl, so, grindMD, il, projOcc, rLv, ctx);
    const newIL = il.slice(); newIL[i] = (il[i] || 0) + 1;
    const quickPostExpHr = simTotalExpWith(gl, so, md, newIL, projOcc, rLv, ctx);
    const quickRateGain = quickPostExpHr - projCurExpHr;
    if (quickRateGain <= 0) continue;
    candidates.push({ obsIdx: i, grindMD, grindHrs, grindExpHr, newIL, quickRateGain });
  }
  if (candidates.length === 0) return null;

  // Phase 2a: full mag reopt + break-even for top candidates.
  // Take top-3 by absolute rate gain (high-value grinds) PLUS top-3 by
  // efficiency (rate gain / grind time) to surface fast GD-94-only level-ups
  // that would otherwise be crowded out by high-GD-93 long grinds.
  const byGain = candidates.slice().sort((a, b) => b.quickRateGain - a.quickRateGain);
  const byEfficiency = candidates.slice().sort((a, b) =>
    (b.quickRateGain / Math.max(0.01, b.grindHrs))
    - (a.quickRateGain / Math.max(0.01, a.grindHrs)));
  const topSet = new Set();
  const topN = [];
  for (const list of [byEfficiency, byGain]) {
    for (const c of list) {
      if (topSet.has(c.obsIdx) || topN.length >= 6) continue;
      topSet.add(c.obsIdx);
      topN.push(c);
    }
  }
  const viable = [];
  for (const c of topN) {
    const obsName = OCC_DATA[c.obsIdx] ? OCC_DATA[c.obsIdx].name.replace(/_/g, ' ') : '#' + c.obsIdx;
    const post = await optimizePostGrind({gl, so, md, ip, occ: projOcc, rLv, mOwned, mMax}, c.newIL, ctx, Math.max(1, remainingHrs - c.grindHrs), saveCtx);
    const postExpHr = post.expHr;
    const rateGain = postExpHr - projCurExpHr;
    if (rateGain <= 0) continue;
    // Decompose: permanent gain (102 only) = new IL with current mag layout
    const permExpHr = simTotalExpWith(gl, so, md, c.newIL, projOcc, rLv, ctx);
    const permGain = Math.max(0, permExpHr - projCurExpHr);
    const expLostPerHr = Math.max(0, projCurExpHr - c.grindExpHr);
    const totalExpLost = expLostPerHr * c.grindHrs;
    // Use permanent gain for break-even filter (conservative; Phase 2b scores accurately)
    const recoupHrs = permGain > 0 ? totalExpLost / permGain : Infinity;
    const breakEvenHrs = c.grindHrs + recoupHrs;
    if (breakEvenHrs >= remainingHrs) continue;
    viable.push({ ...c, obsName, postExpHr, rateGain, permGain, breakEvenHrs, expLostPerHr, totalExpLost });
  }
  if (viable.length === 0) return null;

  // Phase 2b: permutation evaluation via adaptive-tick sims
  function _simGrindSequence(seq, afterMD, baseIL, baseIP, baseRLv, baseRExp, remainHrs) {
    const simIL = baseIL.slice();
    const simIP = baseIP.slice();
    const simOcc = projOcc.slice();
    let simRLv = baseRLv, simRExp = baseRExp;
    let totalExp = 0, simTime = 0;

    for (let si = 0; si < seq.length + 1; si++) {
      let phaseMD, phaseEndCondition;
      if (si < seq.length) {
        const g = seq[si];
        phaseMD = buildConcentratedLayout({gl, so, md, il: simIL, occ: simOcc, rLv: simRLv, mMax}, g.obsIdx, ctx);
        phaseEndCondition = (obsIdx) => obsIdx === g.obsIdx;
      } else {
        phaseMD = reoptRegularMags({gl, so, md: afterMD, il: simIL, occ: simOcc, rLv: simRLv, mMax}, ctx);
        phaseMD = chooseMonoTargets({gl, so, md: phaseMD, il: simIL, ip: simIP, occ: simOcc, rLv: simRLv, mMax}, ctx, Math.max(1, remainHrs - simTime));
        phaseEndCondition = null;
      }

      const monoArr = Array.from(getMonoObsSet(phaseMD));
      const isPostGrind = si >= seq.length;
      const phaseResult = simForwardProjection({
        monoSlots: monoArr, md: phaseMD, il: simIL, ip: simIP,
        gl, so, occ: simOcc, rLv: simRLv, rExp: simRExp, ctx,
        maxHrs: remainHrs - simTime, maxJumps: 5000,
        assumeObsUnlocked,
        onInsightLevelUp: phaseEndCondition ? (obsIdx) => phaseEndCondition(obsIdx) : undefined,
        onReopt: isPostGrind ? (curMD, curIL, curOcc, curRLv) => {
          return reoptRegularMags({gl, so, md: curMD, il: curIL, occ: curOcc, rLv: curRLv, mMax}, ctx);
        } : undefined,
      });
      totalExp += phaseResult.totalExp;
      simTime += phaseResult.time;
      simRLv = phaseResult.rLv;
      simRExp = phaseResult.rExp;
    }
    return totalExp;
  }

  // Enumerate all ordered subsets of viable candidates (N ≤ 5 → max 325 permutations)
  const noGrindTotal = _simGrindSequence([], md, il, ip, rLv, 0, remainingHrs);
  let bestCandidate = null;
  let bestTotalExp = noGrindTotal;

  function _permuteAndScore(seq, remaining) {
    if (seq.length > 0) {
      const seqTotal = _simGrindSequence(seq, md, il, ip, rLv, 0, remainingHrs);
      if (seqTotal > bestTotalExp) {
        bestTotalExp = seqTotal;
        bestCandidate = seq[0];
      }
    }
    for (let i = 0; i < remaining.length; i++) {
      const next = remaining[i];
      const rest = remaining.slice(0, i).concat(remaining.slice(i + 1));
      _permuteAndScore([...seq, next], rest);
    }
  }
  _permuteAndScore([], viable);

  if (bestCandidate && bestTotalExp > noGrindTotal) {
    const x = bestCandidate;
    const realGrindExpHr = simTotalExpWith(gl, so, x.grindMD, il, occ, rLv, ctx);
    return {
      obsIdx: x.obsIdx,
      obsName: x.obsName,
      grindMD: x.grindMD, grindHrs: x.grindHrs, grindExpHr: realGrindExpHr, postExpHr: x.postExpHr,
      rateGain: x.rateGain, permGain: x.permGain, breakEvenHrs: x.breakEvenHrs,
      netGain: bestTotalExp - noGrindTotal, expLostPerHr: x.expLostPerHr, totalExpLost: x.totalExpLost,
      newInsightLv: (il[x.obsIdx] || 0) + 1,
    };
  }
  return null;
}

export async function unifiedSim(config, saveCtx) {
  // config: { target: {type:'level'|'hours', value}, reoptimize }
  // saveCtx: optional SaveContext - if omitted, captures current globals
  const _sc = saveCtx || buildSaveContext();
  // Build mutable sim state - gl/il/ip/occ are local aliases into s (in-place mutations sync)
  const gl = (config.gridLevels || _sc.gridLevels).slice();
  const il = (config.insightLvs || _sc.insightLvs).slice();
  const ip = (config.insightProgress || _sc.insightProgress).slice();
  const occ = (config.occFound || _sc.occFound).slice();
  const _rLv0 = config.researchLevel !== undefined ? config.researchLevel : _sc.researchLevel;
  const s = {
    gl: gl, il: il, ip: ip, occ: occ,
    so: (config.shapeOverlay || _sc.shapeOverlay).slice(),
    md: [], // set below after optimization
    rLv: _rLv0,
    rExp: config.currentExp !== undefined ? config.currentExp : getResearchCurrentExp(_sc),
    mOwned: config.magnifiersOwned !== undefined ? config.magnifiersOwned : _sc.magnifiersOwned,
    mMax: magMaxForLevel(_rLv0),
  };
  const _extendInsightLA = !!config.extendInsightLA;

  // Sync ctx to match the (possibly overridden) gl state
  // Pass _sc so the ctx can be built from saveCtx in worker environments
  const ctx = makeSimCtx(gl, _sc);

  // Recompute mOwned from (possibly overridden) gl/rLv so beam search +1 on #72/#91 is reflected
  s.mOwned = computeMagnifiersOwnedWith(gl, s.rLv, ctx);

  // Pre-optimization baseline: user's current mag assignments, same function as post-opt.
  // Avoids phantom deltas from simTotalExp() vs simTotalExpWith() discrepancies.
  const _preOptUserMD = config.magData
    ? config.magData.map(m => ({...m}))
    : _sc.magData.slice(0, s.mOwned).map(m => ({...m}));
  const _preOptBaseRate = simTotalExpWith(gl, s.so, _preOptUserMD, il, occ, s.rLv, ctx);

  // Initial mag assignment via greedy optimizer
  if (config.magData) {
    s.md = config.magData.map(m => ({...m}));
  } else {
    // Build pool from current owned types, then grow with correct types if gl increased the count
    const pool = _sc.magData.slice(0, Math.min(_sc.magnifiersOwned, s.mOwned)).map(m => ({...m}));
    growMagPoolTyped(pool, gl, s.rLv, s.mOwned, ctx);
    s.md = pool;
    s.md = await optimizeMagsFor(s, ctx);
  }

  // Initial shape optimization (sim-aware: captures insight cascading effects)
  let sp = [];
  if (config.reoptimize !== false) {
    if (config.onProgress) config.onProgress({ subStage: 'Optimizing shapes\u2026' });
    const shapeResult = optimizeShapesFor(s, {
      target: config.target,
      magData: s.md.map(m=>({...m})),
      insightLvs: il.slice(),
      insightProgress: ip.slice(),
      occFound: occ.slice(),
      researchLevel: s.rLv,
      currentExp: s.rExp,
    }, undefined, _sc);
    s.so = shapeResult.overlay;
    sp = shapeResult.positions;
  }

  let _initFreePoints = 0;
  if (config.reoptimize !== false) {
    if (config.onProgress) config.onProgress({ subStage: 'Spending grid points\u2026' });
    const _initSpend = beamSpendAtLevel(s, ctx, config.target, config.assumeObsUnlocked, _sc);
    _initFreePoints = _initSpend.freePoints || 0;
    s.mOwned = computeMagnifiersOwnedWith(gl, s.rLv, ctx);
    growMagPoolTyped(s.md, gl, s.rLv, s.mOwned, ctx);
    // Shapes first (so mag scoring sees correct shape overlay)
    if (config.onProgress) config.onProgress({ subStage: 'Re-optimizing shapes\u2026' });
    const reShapes = optimizeShapesFor(s, undefined, undefined, _sc);
    s.so = reShapes.overlay;
    sp = reShapes.positions;
  }

  // Assign monocles optimally - use full remaining sim time as lookahead
  if (config.reoptimize !== false) {
    if (config.onProgress) config.onProgress({ subStage: 'Assigning monocles\u2026' });
    const prelimRate = simTotalExpWith(gl, s.so, s.md, il, occ, s.rLv, ctx);
    let monoLA = Math.min(_estimateRemainingHrs(config, 0, s.rLv, s.rExp, prelimRate, ctx), 72);
    if (_extendInsightLA) {
      const beHrs = _insightBreakEvenHrs(s.md, il, ip, gl, s.so, ctx);
      if (beHrs > monoLA) monoLA = Math.min(beHrs * 1.25, 168);
    }
    s.md = chooseMonoTargets(s, ctx, monoLA);
  }

  let curExpHr = simTotalExpWith(gl, s.so, s.md, il, occ, s.rLv, ctx);

  // Snapshot helper: clones full sim state + adds sp
  const _snap = function(sp2) { const c = cloneSimState(s); c.sp = sp2.slice(); return c; };

  const phases = [{
    time: 0, event: 'start', expHr: curExpHr,
    config: _snap(sp),
    rLv: s.rLv, rExp: s.rExp,
    preOptExpHr: _preOptBaseRate,
    freePoints: _initFreePoints
  }];

  let currentTime = 0; // hours
  const maxTime = config.target.type === 'hours' ? config.target.value : 1e9; // hours cap
  let _activeGrindObs = -1; // obs index being insight-grinded, or -1

  // Check for initial grind opportunity
  if (config.reoptimize !== false && config.enableGrind !== false) {
    const _grindRemaining = _estimateRemainingHrs(config, 0, s.rLv, s.rExp, curExpHr, ctx);
    const _grindCandidate = await _findBestInsightGrind(s, curExpHr, _grindRemaining, ctx, config.assumeObsUnlocked, _sc);
    if (_grindCandidate) {
      _activeGrindObs = _grindCandidate.obsIdx;
      s.md = _grindCandidate.grindMD;
      curExpHr = simTotalExpWith(gl, s.so, s.md, il, occ, s.rLv, ctx);
      const lastPhase = phases[phases.length - 1];
      lastPhase.expHr = curExpHr; // use grind rate, not optimized rate
      lastPhase.grindInfo = _grindCandidate;
      lastPhase.activeConfig = _snap(sp);
    }
  }

  if (config.onProgress) config.onProgress({ subStage: 'Simulating\u2026', rLv: s.rLv, expHr: curExpHr, currentTime: 0 });

  // Event-driven simulation: instead of ticking every 10 minutes, jump directly to
  // the next event (research level-up or insight level-up) since EXP rate is constant
  // between events.  Mathematically identical to the old tick loop, but O(levels)
  // instead of O(total_minutes / 10).
  let jumpCount = 0;
  const MAX_JUMPS = 50000; // safety cap
  while (jumpCount < MAX_JUMPS) {
    // Yield periodically
    if (jumpCount % 40 === 0 && jumpCount > 0) {
      await new Promise(r => setTimeout(r, 0));
      if (config.onProgress) config.onProgress({ rLv: s.rLv, expHr: curExpHr, currentTime });
    }
    jumpCount++;

    // Check stop conditions
    if (config.target.type === 'level' && s.rLv >= config.target.value) break;
    if (config.target.type === 'hours' && currentTime >= config.target.value) break;
    if (curExpHr <= 0) break; // no progress possible

    // --- Compute time to next research level-up ---
    const expToNextLv = researchExpReq(s.rLv, ctx.serverVarResXP) - s.rExp;
    const hrsToNextLv = expToNextLv / curExpHr; // hours

    // --- Compute time to next insight level-up (across all monocle obs) ---
    const monoObs = getMonoObsSet(s.md);
    const hrsToNextInsight = hrsToNextInsightLv(monoObs, s.md, il, ip, gl, s.so, ctx);

    // --- Determine the jump: smallest of (nextLevelUp, nextInsight, remainingTime) ---
    let jumpHrs = hrsToNextLv;
    if (hrsToNextInsight < jumpHrs) jumpHrs = hrsToNextInsight;
    // Clamp to target
    const remainingTime = maxTime - currentTime;
    if (config.target.type === 'hours' && remainingTime < jumpHrs) jumpHrs = remainingTime;
    // For level target, also cap at some reasonable maximum per jump
    if (jumpHrs <= 0) jumpHrs = 1e-9; // avoid infinite loops from floating point
    if (jumpHrs > 1e8) break; // unreachable - would take forever

    // --- Advance time and accumulate EXP ---
    const jumpSec = jumpHrs * 3600;
    s.rExp += curExpHr / 3600 * jumpSec;
    currentTime += jumpHrs;

    // --- Advance insight EXP for all monocle obs ---
    let _grindTargetLeveledUp = false;
    const _insightLeveledObs = [];
    const _insightLeveledLvs = {};
    let insightLeveledUp = advanceInsightLevels(monoObs, s.md, il, ip, gl, s.so, ctx, jumpHrs, (obsIdx) => {
      if (obsIdx === _activeGrindObs) _grindTargetLeveledUp = true;
      _insightLeveledObs.push(obsIdx);
      _insightLeveledLvs[obsIdx] = il[obsIdx];
    });
    // Clear grind state when target insight levels up
    if (_grindTargetLeveledUp && _activeGrindObs >= 0) _activeGrindObs = -1;

    // --- Check research level-ups ---
    const _adv2 = advanceResearchLevel(s.rExp, s.rLv, ctx.serverVarResXP);
    s.rExp = _adv2.rExp; s.rLv = _adv2.rLv; const rLeveledUp = _adv2.changed;
    if (rLeveledUp) {
      const newMax = magMaxForLevel(s.rLv);
      if (newMax > s.mMax) s.mMax = newMax;
    }

    // --- Handle research level-up side effects ---
    let _lvFreePoints = 0;
    if (rLeveledUp && config.reoptimize !== false) {
      if (config.assumeObsUnlocked) {
        let obsChanged = false;
        for (let oi = 0; oi < OCC_DATA.length; oi++) {
          if ((occ[oi] || 0) < 1 && OCC_DATA[oi].roll <= s.rLv) {
            occ[oi] = 1;
            obsChanged = true;
          }
        }
        if (obsChanged) {
          s.mOwned = computeMagnifiersOwnedWith(gl, s.rLv, ctx);
          growMagPoolTyped(s.md, gl, s.rLv, s.mOwned, ctx);
          s.md = await optimizeMagsFor(s, ctx);
        }
      }
      if (config.onProgress) config.onProgress({ subStage: 'Level ' + s.rLv + ' \u2014 spending grid points\u2026', rLv: s.rLv, expHr: curExpHr, currentTime });
      const _spendResult = beamSpendAtLevel(s, ctx, config.target, config.assumeObsUnlocked, _sc);
      _lvFreePoints = _spendResult.freePoints || 0;
      s.mOwned = computeMagnifiersOwnedWith(gl, s.rLv, ctx);
      growMagPoolTyped(s.md, gl, s.rLv, s.mOwned, ctx);
    }

    // --- Reconfig on events ---
    const insightMatters = insightLeveledUp && insightAffectsExp(gl, s.so, ctx);
    if ((rLeveledUp || insightMatters) && config.reoptimize !== false) {
      if (config.onProgress) config.onProgress({ subStage: 'Reconfiguring (Lv ' + s.rLv + ')\u2026', rLv: s.rLv, expHr: curExpHr, currentTime });
      const midShapeResult = optimizeShapesFor(s, undefined, undefined, _sc);
      s.so = midShapeResult.overlay;
      sp = midShapeResult.positions;
      if (_activeGrindObs >= 0) {
        // During grind: re-optimize mags then force monocles back to grind target
        s.md = await optimizeMagsFor(s, ctx);
        s.md = buildConcentratedLayout(s, _activeGrindObs, ctx);
      } else {
        // Normal: full mag + monocle re-optimization
        s.md = await optimizeMagsFor(s, ctx);
        let monoLA = Math.min(_estimateRemainingHrs(config, currentTime, s.rLv, s.rExp, curExpHr, ctx), 72);
        if (_extendInsightLA) {
          const beHrs = _insightBreakEvenHrs(s.md, il, ip, gl, s.so, ctx);
          if (beHrs > monoLA) monoLA = Math.min(beHrs * 1.25, 168);
        }
        s.md = chooseMonoTargets(s, ctx, monoLA);
      }
      curExpHr = simTotalExpWith(gl, s.so, s.md, il, occ, s.rLv, ctx);
      const eventType = rLeveledUp && insightMatters ? 'level+insight' : rLeveledUp ? 'level-up' : 'insight-up';
      phases.push({
        time: currentTime, event: eventType, expHr: curExpHr,
        config: _snap(sp),
        rLv: s.rLv, rExp: s.rExp,
        freePoints: _lvFreePoints || 0,
        insightObs: _insightLeveledObs.length > 0 ? _insightLeveledObs.slice() : null,
        insightLvs: Object.keys(_insightLeveledLvs).length > 0 ? {..._insightLeveledLvs} : null
      });
    } else if (insightLeveledUp && config.reoptimize !== false) {
      if (_activeGrindObs >= 0) {
        s.md = await optimizeMagsFor(s, ctx);
        s.md = buildConcentratedLayout(s, _activeGrindObs, ctx);
      } else {
        s.md = await optimizeMagsFor(s, ctx);
        let monoLA2 = Math.min(_estimateRemainingHrs(config, currentTime, s.rLv, s.rExp, curExpHr, ctx), 72);
        if (_extendInsightLA) {
          const beHrs = _insightBreakEvenHrs(s.md, il, ip, gl, s.so, ctx);
          if (beHrs > monoLA2) monoLA2 = Math.min(beHrs * 1.25, 168);
        }
        s.md = chooseMonoTargets(s, ctx, monoLA2);
      }
      curExpHr = simTotalExpWith(gl, s.so, s.md, il, occ, s.rLv, ctx);
      phases.push({
        time: currentTime, event: 'insight-up', expHr: curExpHr,
        config: _snap(sp),
        rLv: s.rLv, rExp: s.rExp,
        insightObs: _insightLeveledObs.length > 0 ? _insightLeveledObs.slice() : null,
        insightLvs: Object.keys(_insightLeveledLvs).length > 0 ? {..._insightLeveledLvs} : null
      });
    }

    // --- Check for profitable insight grinds after events ---
    if (_activeGrindObs < 0 && config.reoptimize !== false && config.enableGrind !== false && (rLeveledUp || insightMatters)) {
      const _grindRemaining = _estimateRemainingHrs(config, currentTime, s.rLv, s.rExp, curExpHr, ctx);
      const _grindCandidate = await _findBestInsightGrind(s, curExpHr, _grindRemaining, ctx, config.assumeObsUnlocked, _sc);
      if (_grindCandidate) {
        _activeGrindObs = _grindCandidate.obsIdx;
        s.md = _grindCandidate.grindMD;
        curExpHr = simTotalExpWith(gl, s.so, s.md, il, occ, s.rLv, ctx);
        const lastPhase = phases[phases.length - 1];
        lastPhase.grindInfo = _grindCandidate;
        lastPhase.activeConfig = _snap(sp);
      }
    }
  }

  // Final phase (skip for level targets where the last phase already reached the target)
  const lastPhaseIsTarget = config.target.type === 'level' && phases.length > 0 && phases[phases.length - 1].rLv >= config.target.value;
  if (!lastPhaseIsTarget) {
    phases.push({
      time: currentTime, event: 'end', expHr: curExpHr,
      config: _snap(sp),
      rLv: s.rLv, rExp: s.rExp
    });
  }

  return { phases, totalTime: currentTime, finalLevel: s.rLv, finalExp: s.rExp, finalIL: il.slice(), insightLAExtension: 0 };
}

