// ===== MONOCLE OPTIMIZATION =====

import { OCC_DATA } from '../game-data.js';
import {
  _gbWith,
  computeOccurrencesToBeFound,
  countMagTypes,
  getMonoObsSet,
  insightAffectsExp,
  insightExpRate,
  insightExpReqAt,
  isObsUsable,
  simForwardProjection,
  simTotalExpWith,
} from '../sim-math.js';
import { makeCtx } from '../save/context.js';
import { _evalMagScoreWith } from './magnifiers.js';
import { _reoptRegularMags } from '../sim-engine.js';

export function chooseMonoTargets(s, ctx, lookAheadHrs) {
  var gl = s.gl, so = s.so, md = s.md, il = s.il, ip = s.ip, occ = s.occ, rLv = s.rLv, maxPerSlot = s.mMax;
  if (!ctx) ctx = makeCtx(gl);
  // Monocle targeting: assign each monocle to the best observation for insight gain.
  // Monocles can now be spread across multiple observations when maxPerSlot is too small
  // to fit them all on one obs.
  const monoCount = countMagTypes(md).mono;
  if (monoCount === 0) return md;

  const occTBF = computeOccurrencesToBeFound(rLv, occ);
  const gd101 = _gbWith(gl, so, 93, ctx);
  const gd94 = _gbWith(gl, so, 94, ctx);

  // Identify obs with regular mags placed
  const magObsSet = new Set();
  for (const m of md) { if (m.type === 0 && m.slot >= 0) magObsSet.add(m.slot); }

  // Build candidates - any usable obs with room for at least 1 monocle
  const candidates = [];
  for (let i = 0; i < Math.min(occTBF, OCC_DATA.length); i++) {
    if (!isObsUsable(i, rLv, occ)) continue;
    const inSlotNonMono = md.filter(m => m.slot === i && m.type !== 1).length;
    const monoRoom = maxPerSlot - inSlotNonMono;
    if (monoRoom < 1) continue;
    // Compute insight rate assuming 1 monocle placed here
    const testMD = md.map(m => m.type === 1 ? {...m} : {...m});
    // Place 1 test monocle
    const oneMonoMD = [...testMD.filter(m => m.type !== 1), {type: 1, slot: i, x:0, y:0}];
    const iRate = insightExpRate(i, oneMonoMD, il, gl, so, ctx);
    const req = insightExpReqAt(i, il[i] || 0);
    const remaining = Math.max(0, req - (ip[i] || 0));
    const hrsToLv = iRate > 0 ? remaining / iRate : Infinity;
    const hasMag = magObsSet.has(i);
    candidates.push({ obs: i, hrsToLv, monoRoom, hasMag, iRate });
  }

  // Also scan beyond occTBF for any usable obs (fallback for edge cases)
  for (let i = Math.min(occTBF, OCC_DATA.length); i < OCC_DATA.length; i++) {
    if (!isObsUsable(i, rLv, occ)) continue;
    const inSlotNonMono = md.filter(m => m.slot === i && m.type !== 1).length;
    const monoRoom = maxPerSlot - inSlotNonMono;
    if (monoRoom < 1) continue;
    const oneMonoMD = [...md.filter(m => m.type !== 1), {type: 1, slot: i, x:0, y:0}];
    const iRate = insightExpRate(i, oneMonoMD, il, gl, so, ctx);
    const req = insightExpReqAt(i, il[i] || 0);
    const remaining = Math.max(0, req - (ip[i] || 0));
    const hrsToLv = iRate > 0 ? remaining / iRate : Infinity;
    candidates.push({ obs: i, hrsToLv, monoRoom, hasMag: false, iRate });
  }

  if (candidates.length === 0) return md;

  // Greedy assignment: assign monocles one at a time to the best obs
  // Score by: insight EXP value (gd101 recoup for mag obs, or fastest level-up for banking)
  const insightHelps = gd101 > 0 || gd94 > 0;
  const baseTotRate = insightHelps ? simTotalExpWith(gl, so, md, il, occ, rLv, ctx) : 0;

  // Pre-compute projected rate gains for all candidates.
  // When gd101 is active, projects what the rate gain would be if mags
  // redistributed optimally after insight levels up.  This fixes the
  // chicken-and-egg problem where new obs get no mags (because insight=0)
  // and then get no monocles (because no mags → no rate gain from insight).
  const candidateScores = {};
  if (insightHelps) {
    for (const c of candidates) {
      const tempIL = il.slice();
      tempIL[c.obs] = (tempIL[c.obs] || 0) + 1;
      if (gd101 > 0) {
        const projMD = _reoptRegularMags({gl, so, md, il: tempIL, occ, rLv, mMax: maxPerSlot}, ctx);
        candidateScores[c.obs] = simTotalExpWith(gl, so, projMD, tempIL, occ, rLv, ctx) - baseTotRate;
      } else {
        candidateScores[c.obs] = simTotalExpWith(gl, so, md, tempIL, occ, rLv, ctx) - baseTotRate;
      }
    }
  }

  // Strip all monocles from md, then assign them greedily
  var result = _spreadMonos(md, candidates, monoCount, insightHelps, candidateScores);
  return result;
}

function _spreadMonos(md, candidates, monoCount, insightHelps, candidateScores) {
  var result = md.map(m => m.type === 1 ? {...m, slot: -1} : {...m});
  const monoIndices = [];
  for (let i = 0; i < result.length; i++) {
    if (result[i].type === 1) monoIndices.push(i);
  }

  const assigned = {}; // obs -> count of monocles assigned
  for (let m = 0; m < monoCount; m++) {
    let bestObs = -1, bestScore = -Infinity;
    for (const c of candidates) {
      const curAssigned = assigned[c.obs] || 0;
      if (curAssigned >= c.monoRoom) continue;
      let score;
      if (insightHelps) {
        const rateGain = candidateScores[c.obs] || 0;
        score = rateGain > 0 ? rateGain / Math.max(0.01, c.hrsToLv) : 1 / Math.max(0.01, c.hrsToLv);
      } else {
        score = 1 / Math.max(0.01, c.hrsToLv);
      }
      if (score > bestScore) { bestScore = score; bestObs = c.obs; }
    }
    if (bestObs >= 0) {
      result[monoIndices[m]] = {...result[monoIndices[m]], slot: bestObs};
      assigned[bestObs] = (assigned[bestObs] || 0) + 1;
    }
  }

  // If any monocles still unassigned, force them to first available obs
  for (const mi of monoIndices) {
    if (result[mi].slot >= 0) continue;
    for (const c of candidates) {
      const curAssigned = assigned[c.obs] || 0;
      if (curAssigned < c.monoRoom) {
        result[mi] = {...result[mi], slot: c.obs};
        assigned[c.obs] = curAssigned + 1;
        break;
      }
    }
  }
  return result;
}

function _simMonoForward(layoutMD, s, ctx, hrs) {
  var il = s.il.slice(), ip = s.ip.slice();
  var monoArr = Array.from(getMonoObsSet(layoutMD));
  var result = simForwardProjection({
    monoSlots: monoArr, md: layoutMD, il, ip,
    gl: s.gl, so: s.so, occ: s.occ, rLv: s.rLv, rExp: s.rExp, ctx,
    maxHrs: hrs, maxJumps: 2000,
  });
  return result.totalExp;
}

export function _buildConcentratedLayout(s, targetObs, ctx) {
  var md = s.md, mMax = s.mMax, gl = s.gl, so = s.so, il = s.il, occ = s.occ, rLv = s.rLv;
  var result = md.map(function(m) { return {type:m.type, slot:m.slot, x:m.x, y:m.y}; });
  var monoCount = 0;
  for (var i = 0; i < result.length; i++) if (result[i].type === 1) monoCount++;
  if (monoCount === 0) return result;

  var nonMonoOnTarget = 0;
  for (var i2 = 0; i2 < result.length; i2++) if (result[i2].type !== 1 && result[i2].slot === targetObs) nonMonoOnTarget++;
  var roomForMonos = Math.max(0, mMax - nonMonoOnTarget);
  var wantMonosOnTarget = Math.min(monoCount, mMax);

  var evictedIndices = [];
  if (wantMonosOnTarget > roomForMonos) {
    var needToEvict = wantMonosOnTarget - roomForMonos;
    for (var ei = 0; ei < result.length && evictedIndices.length < needToEvict; ei++) {
      if (result[ei].type !== 1 && result[ei].slot === targetObs) {
        result[ei].slot = -1;
        evictedIndices.push(ei);
      }
    }
  }
  var actualMonosOnTarget = Math.min(wantMonosOnTarget, roomForMonos + evictedIndices.length);

  var placed = 0;
  var overflowMonoIndices = [];
  for (var mi2 = 0; mi2 < result.length; mi2++) {
    if (result[mi2].type !== 1) continue;
    if (placed < actualMonosOnTarget) { result[mi2].slot = targetObs; placed++; }
    else { result[mi2].slot = -1; overflowMonoIndices.push(mi2); }
  }

  // Reassign overflow monocles to best alternate obs (respect mMax)
  if (overflowMonoIndices.length > 0) {
    var occTBF2 = computeOccurrencesToBeFound(rLv, occ);
    for (var oi = 0; oi < overflowMonoIndices.length; oi++) {
      var omi = overflowMonoIndices[oi];
      var bestSlot2 = -1, bestRate = -1;
      for (var si = 0; si < Math.min(occTBF2, OCC_DATA.length); si++) {
        if (si === targetObs) continue;
        if (!isObsUsable(si, rLv, occ)) continue;
        var slotCount2 = 0;
        for (var ci2 = 0; ci2 < result.length; ci2++) if (result[ci2].slot === si) slotCount2++;
        if (slotCount2 >= mMax) continue;
        result[omi].slot = si;
        var rate = insightExpRate(si, result, il, gl, so, ctx);
        if (rate > bestRate) { bestRate = rate; bestSlot2 = si; }
      }
      result[omi].slot = bestSlot2 >= 0 ? bestSlot2 : -1;
    }
  }

  // Reassign evicted mags to best available slots
  if (evictedIndices.length > 0) {
    var occTBF = computeOccurrencesToBeFound(rLv, occ);
    for (var evi = 0; evi < evictedIndices.length; evi++) {
      var m2 = result[evictedIndices[evi]];
      var bestSlot = -1, bestScore = -Infinity;
      for (var oi3 = 0; oi3 < Math.min(occTBF, OCC_DATA.length); oi3++) {
        if (!isObsUsable(oi3, rLv, occ)) continue;
        var slotCount = 0;
        for (var ci = 0; ci < result.length; ci++) if (result[ci].slot === oi3) slotCount++;
        if (slotCount >= mMax) continue;
        m2.slot = oi3;
        var score = _evalMagScoreWith(result, gl, so, il, occ, rLv);
        if (score > bestScore) { bestScore = score; bestSlot = oi3; }
      }
      m2.slot = bestSlot >= 0 ? bestSlot : -1;
    }
  }
  return result;
}

export function optimizeMonoLayout(s, ctx, lookAheadHrs) {
  if (!ctx) ctx = makeCtx(s.gl);
  var gl = s.gl, so = s.so, md = s.md, il = s.il, ip = s.ip, occ = s.occ, rLv = s.rLv;
  var monoCount = 0;
  for (var i = 0; i < md.length; i++) if (md[i].type === 1) monoCount++;
  if (monoCount === 0) return md;

  // Generate spread layout (greedy assignment)
  var spreadMD = chooseMonoTargets(s, ctx, lookAheadHrs);

  // If insight doesn't affect EXP at all, skip forward sim
  if (!insightAffectsExp(gl, so, ctx)) return spreadMD;
  // If horizon is too short for any grind, skip
  if (lookAheadHrs < 1) return spreadMD;

  // Score spread layout via forward sim
  var spreadExp = _simMonoForward(spreadMD, s, ctx, lookAheadHrs);

  // Evaluate concentrated layouts for each viable obs
  var occTBF = computeOccurrencesToBeFound(rLv, occ);
  var bestMD = spreadMD, bestExp = spreadExp;

  for (var ci = 0; ci < Math.min(occTBF, OCC_DATA.length); ci++) {
    if (!isObsUsable(ci, rLv, occ)) continue;

    // Build concentrated layout and compute grind time
    var concMD = _buildConcentratedLayout(s, ci, ctx);
    var monoOnTarget = 0;
    for (var mi3 = 0; mi3 < concMD.length; mi3++) {
      if (concMD[mi3].type === 1 && concMD[mi3].slot === ci) monoOnTarget++;
    }
    if (monoOnTarget === 0) continue;

    var iRate = insightExpRate(ci, concMD, il, gl, so, ctx);
    if (iRate <= 0) continue;
    var iReq = insightExpReqAt(ci, il[ci] || 0);
    var grindHrs = Math.max(0, iReq - (ip[ci] || 0)) / iRate;
    if (grindHrs <= 0 || grindHrs > lookAheadHrs * 0.8) continue;

    // Quick check: does leveling this insight produce a rate gain?
    var newIL = il.slice(); newIL[ci] = (il[ci] || 0) + 1;
    var curRate = simTotalExpWith(gl, so, md, il, occ, rLv, ctx);
    var postRate = simTotalExpWith(gl, so, md, newIL, occ, rLv, ctx);
    if (postRate <= curRate) continue;

    // Two-phase forward sim: concentrate for grindHrs, then spread for remainder
    // Phase 1: grind
    var grindExp = _simMonoForward(concMD, s, ctx, grindHrs);
    // Phase 2: post-grind with new insight
    var postS = {gl:gl, so:so, md:md, il:newIL, ip:ip.slice(), occ:occ, rLv:rLv, rExp:s.rExp + grindExp, mOwned:s.mOwned, mMax:s.mMax};
    // Correct ip for insight spent during grind
    postS.ip[ci] = 0;
    // Re-optimize mags with new insight, then spread monocles
    var postMD = _reoptRegularMags({gl:gl, so:so, md:md, il:newIL, occ:occ, rLv:rLv, mMax:s.mMax}, ctx);
    var postSpreadMD = chooseMonoTargets({gl:gl, so:so, md:postMD, il:newIL, ip:postS.ip, occ:occ, rLv:rLv, mMax:s.mMax}, ctx, Math.max(1, lookAheadHrs - grindHrs));
    var postExp = _simMonoForward(postSpreadMD, postS, ctx, lookAheadHrs - grindHrs);

    var totalConc = grindExp + postExp;
    if (totalConc > bestExp) {
      bestExp = totalConc;
      bestMD = concMD;
    }
  }

  return bestMD;
}

export function _monoAssignBestQuick(s, ctx) {
  var gl = s.gl, so = s.so, md = s.md, il = s.il, ip = s.ip, occ = s.occ, rLv = s.rLv, maxPerSlot = s.mMax;
  const monoCount = countMagTypes(md).mono;
  if (monoCount === 0) return md;
  const occTBF = computeOccurrencesToBeFound(rLv, occ);
  const gd101 = _gbWith(gl, so, 93, ctx);
  const insightHelps = gd101 > 0 || _gbWith(gl, so, 94, ctx) > 0;
  const baseTotRate = insightHelps ? simTotalExpWith(gl, so, md, il, occ, rLv, ctx) : 0;

  // Build scored candidates with room for at least 1 monocle
  const candidates = [];
  for (let i = 0; i < Math.min(occTBF, OCC_DATA.length); i++) {
    if (!isObsUsable(i, rLv, occ)) continue;
    const inSlotNonMono = md.filter(m => m.slot === i && m.type !== 1).length;
    const monoRoom = maxPerSlot - inSlotNonMono;
    if (monoRoom < 1) continue;
    const oneMonoMD = [...md.filter(m => m.type !== 1), {type: 1, slot: i, x:0, y:0}];
    const iRate = insightExpRate(i, oneMonoMD, il, gl, so, ctx);
    const req = insightExpReqAt(i, il[i] || 0);
    const remaining = Math.max(0, req - (ip[i] || 0));
    const hrsToLv = iRate > 0 ? remaining / iRate : Infinity;
    if (hrsToLv === Infinity) continue;
    let value;
    if (insightHelps) {
      const tempIL = il.slice(); tempIL[i] = (tempIL[i] || 0) + 1;
      let rateGain;
      if (gd101 > 0) {
        const projMD = _reoptRegularMags({gl, so, md, il: tempIL, occ, rLv, mMax: maxPerSlot}, ctx);
        rateGain = simTotalExpWith(gl, so, projMD, tempIL, occ, rLv, ctx) - baseTotRate;
      } else {
        rateGain = simTotalExpWith(gl, so, md, tempIL, occ, rLv, ctx) - baseTotRate;
      }
      value = rateGain > 0 ? rateGain / hrsToLv : 1 / hrsToLv;
    } else {
      value = 1 / hrsToLv;
    }
    candidates.push({ obs: i, value, monoRoom });
  }
  candidates.sort((a, b) => b.value - a.value);

  // Greedy assign monocles across obs respecting per-slot room
  let result = md.map(m => m.type === 1 ? {...m, slot: -1} : {...m});
  const monoIndices = [];
  for (let i = 0; i < result.length; i++) {
    if (result[i].type === 1) monoIndices.push(i);
  }
  const assigned = {};
  for (let m = 0; m < monoCount; m++) {
    for (const c of candidates) {
      const cur = assigned[c.obs] || 0;
      if (cur < c.monoRoom) {
        result[monoIndices[m]] = {...result[monoIndices[m]], slot: c.obs};
        assigned[c.obs] = cur + 1;
        break;
      }
    }
  }
  return result;
}

