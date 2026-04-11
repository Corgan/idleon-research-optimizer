// ===== MONOCLE OPTIMIZATION =====

import { OCC_DATA } from '../game-data.js';
import {
  gbWith,
  computeOccurrencesToBeFound,
  countMagTypes,
  insightExpRate,
  insightExpReqAt,
  isObsUsable,
  simTotalExpWith,
} from '../sim-math.js';
import { evalMagScoreWith } from './magnifiers.js';
import { reoptRegularMags } from '../sim-engine.js';

export function chooseMonoTargets(s, ctx, lookAheadHrs) {
  const gl = s.gl, so = s.so, md = s.md, il = s.il, ip = s.ip, occ = s.occ, rLv = s.rLv, maxPerSlot = s.mMax;
  // Monocle targeting: assign each monocle to the best observation for insight gain.
  // Monocles can now be spread across multiple observations when maxPerSlot is too small
  // to fit them all on one obs.
  const monoCount = countMagTypes(md).mono;
  if (monoCount === 0) return md;

  const occTBF = computeOccurrencesToBeFound(rLv, occ);
  const gd101 = gbWith(gl, so, 93, ctx);
  const gd94 = gbWith(gl, so, 94, ctx);

  // Identify obs with regular mags placed
  const magObsSet = new Set();
  for (const m of md) { if (m.type === 0 && m.slot >= 0) magObsSet.add(m.slot); }

  // Pre-compute non-monocle counts per slot and the non-mono mag list in one pass
  const nonMonoCountBySlot = new Int32Array(OCC_DATA.length);
  const nonMonoMD = [];
  for (const m of md) {
    if (m.type !== 1) {
      if (m.slot >= 0 && m.slot < nonMonoCountBySlot.length) nonMonoCountBySlot[m.slot]++;
      nonMonoMD.push(m);
    }
  }

  // Build candidates - any usable obs with room for at least 1 monocle
  const candidates = [];
  for (let i = 0; i < Math.min(occTBF, OCC_DATA.length); i++) {
    if (!isObsUsable(i, rLv, occ)) continue;
    const monoRoom = maxPerSlot - nonMonoCountBySlot[i];
    if (monoRoom < 1) continue;
    // Compute insight rate assuming 1 monocle placed here
    const oneMonoMD = [...nonMonoMD, {type: 1, slot: i, x:0, y:0}];
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
    const monoRoom = maxPerSlot - nonMonoCountBySlot[i];
    if (monoRoom < 1) continue;
    const oneMonoMD = [...nonMonoMD, {type: 1, slot: i, x:0, y:0}];
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
        const projMD = reoptRegularMags({gl, so, md, il: tempIL, occ, rLv, mMax: maxPerSlot}, ctx);
        candidateScores[c.obs] = simTotalExpWith(gl, so, projMD, tempIL, occ, rLv, ctx) - baseTotRate;
      } else {
        candidateScores[c.obs] = simTotalExpWith(gl, so, md, tempIL, occ, rLv, ctx) - baseTotRate;
      }
    }
  }

  // Strip all monocles from md, then assign them greedily
  const result = _spreadMonos(md, candidates, monoCount, insightHelps, candidateScores);
  return result;
}

function _spreadMonos(md, candidates, monoCount, insightHelps, candidateScores) {
  const result = md.map(m => m.type === 1 ? {...m, slot: -1} : {...m});
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

export function buildConcentratedLayout(s, targetObs, ctx) {
  const md = s.md, mMax = s.mMax, gl = s.gl, so = s.so, il = s.il, occ = s.occ, rLv = s.rLv;
  let result = md.map(function(m) { return {type:m.type, slot:m.slot, x:m.x, y:m.y}; });
  let monoCount = 0;
  for (let i = 0; i < result.length; i++) if (result[i].type === 1) monoCount++;
  if (monoCount === 0) return result;

  // Guard: target obs must be usable (found + research level met)
  if (!isObsUsable(targetObs, rLv, occ)) return result;

  let nonMonoOnTarget = 0;
  for (let i2 = 0; i2 < result.length; i2++) if (result[i2].type !== 1 && result[i2].slot === targetObs) nonMonoOnTarget++;
  const roomForMonos = Math.max(0, mMax - nonMonoOnTarget);
  const wantMonosOnTarget = Math.min(monoCount, mMax);

  const evictedIndices = [];
  if (wantMonosOnTarget > roomForMonos) {
    const needToEvict = wantMonosOnTarget - roomForMonos;
    for (let ei = 0; ei < result.length && evictedIndices.length < needToEvict; ei++) {
      if (result[ei].type !== 1 && result[ei].slot === targetObs) {
        result[ei].slot = -1;
        evictedIndices.push(ei);
      }
    }
  }
  const actualMonosOnTarget = Math.min(wantMonosOnTarget, roomForMonos + evictedIndices.length);

  let placed = 0;
  const overflowMonoIndices = [];
  for (let mi2 = 0; mi2 < result.length; mi2++) {
    if (result[mi2].type !== 1) continue;
    if (placed < actualMonosOnTarget) { result[mi2].slot = targetObs; placed++; }
    else { result[mi2].slot = -1; overflowMonoIndices.push(mi2); }
  }

  // Reassign overflow monocles to best alternate obs (respect mMax)
  if (overflowMonoIndices.length > 0) {
    const occTBF2 = computeOccurrencesToBeFound(rLv, occ);
    // Pre-compute slot counts once
    const slotCounts = new Int32Array(Math.min(occTBF2, OCC_DATA.length));
    for (let ci2 = 0; ci2 < result.length; ci2++) {
      const s2 = result[ci2].slot;
      if (s2 >= 0 && s2 < slotCounts.length) slotCounts[s2]++;
    }
    for (let oi = 0; oi < overflowMonoIndices.length; oi++) {
      const omi = overflowMonoIndices[oi];
      let bestSlot2 = -1, bestRate = -1;
      for (let si = 0; si < slotCounts.length; si++) {
        if (si === targetObs) continue;
        if (!isObsUsable(si, rLv, occ)) continue;
        if (slotCounts[si] >= mMax) continue;
        result[omi].slot = si;
        const rate = insightExpRate(si, result, il, gl, so, ctx);
        if (rate > bestRate) { bestRate = rate; bestSlot2 = si; }
      }
      if (bestSlot2 >= 0) {
        result[omi].slot = bestSlot2;
        slotCounts[bestSlot2]++;
      } else {
        result[omi].slot = -1;
      }
    }
  }

  // Reassign evicted mags to best available slots
  if (evictedIndices.length > 0) {
    const occTBF = computeOccurrencesToBeFound(rLv, occ);
    // Pre-compute slot counts once
    const slotCountsE = new Int32Array(Math.min(occTBF, OCC_DATA.length));
    for (let ci = 0; ci < result.length; ci++) {
      const se = result[ci].slot;
      if (se >= 0 && se < slotCountsE.length) slotCountsE[se]++;
    }
    for (let evi = 0; evi < evictedIndices.length; evi++) {
      const m2 = result[evictedIndices[evi]];
      let bestSlot = -1, bestScore = -Infinity;
      for (let oi3 = 0; oi3 < slotCountsE.length; oi3++) {
        if (!isObsUsable(oi3, rLv, occ)) continue;
        if (slotCountsE[oi3] >= mMax) continue;
        m2.slot = oi3;
        const score = evalMagScoreWith(result, gl, so, il, occ, rLv, ctx);
        if (score > bestScore) { bestScore = score; bestSlot = oi3; }
      }
      m2.slot = bestSlot >= 0 ? bestSlot : -1;
      if (bestSlot >= 0) slotCountsE[bestSlot]++;
    }
  }

  // Re-optimize kaleidoscope placement for the grind layout.
  // Goal: minimize total EXP lost during grind = grindHrs * (normalExpHr - grindExpHr).
  // Since grindHrs ∝ 1/insightRate, this means minimizing (normalExpHr - grindExpHr) / insightRate.
  // Compute pre-grind normal EXP rate from the original (non-concentrated) md.
  const normalExpHr = simTotalExpWith(gl, so, md, il, occ, rLv, ctx);
  result = _reoptKaleidsForGrind(result, targetObs, normalExpHr, gl, so, il, occ, rLv, mMax, ctx);

  return result;
}

/**
 * Re-optimize kaleidoscope positions for a grind layout.
 * Minimizes total EXP lost during the grind by balancing EXP/hr retention
 * against insight rate gain.  A kaleido move is only adopted if the faster
 * grind more than compensates for the EXP/hr drop.
 */
function _reoptKaleidsForGrind(md, targetObs, normalExpHr, gl, so, il, occ, rLv, mMax, ctx) {
  // Collect kaleido indices
  const kalIndices = [];
  for (let i = 0; i < md.length; i++) {
    if (md[i].type === 2) kalIndices.push(i);
  }
  if (kalIndices.length === 0) return md;

  const occTBF = computeOccurrencesToBeFound(rLv, occ);
  const usableSlots = [];
  for (let si = 0; si < Math.min(occTBF, OCC_DATA.length); si++) {
    if (isObsUsable(si, rLv, occ)) usableSlots.push(si);
  }
  if (usableSlots.length === 0) return md;

  // Score = negative total EXP lost per insight gained.
  // totalExpLost ∝ (normalExpHr - grindExpHr) / insightRate
  // We MAXIMIZE the negative (= minimize EXP cost).
  // When normalExpHr ≈ grindExpHr (little loss), even small insight gains win.
  // When grindExpHr tanks, need proportionally larger insight gains to justify.
  function scoreLayout(trial) {
    const expHr = simTotalExpWith(gl, so, trial, il, occ, rLv, ctx);
    const iRate = insightExpRate(targetObs, trial, il, gl, so, ctx);
    if (iRate <= 0) return -Infinity;
    const expLoss = Math.max(0, normalExpHr - expHr);
    // Negative cost: higher = less EXP lost per insight gained
    return -(expLoss / iRate);
  }

  let best = md;
  let bestScore = scoreLayout(md);

  // Greedy single-kaleido moves: try moving each kaleido to each usable slot
  for (let ki = 0; ki < kalIndices.length; ki++) {
    const idx = kalIndices[ki];
    const origSlot = md[idx].slot;
    for (let ui = 0; ui < usableSlots.length; ui++) {
      const trySlot = usableSlots[ui];
      if (trySlot === origSlot) continue;
      // Check slot capacity
      let slotCount = 0;
      for (let ci = 0; ci < best.length; ci++) {
        if (best[ci].slot === trySlot) slotCount++;
      }
      if (slotCount >= mMax) continue;
      const trial = best.map(function(m) { return {type:m.type, slot:m.slot, x:m.x, y:m.y}; });
      trial[idx].slot = trySlot;
      const score = scoreLayout(trial);
      if (score > bestScore) {
        bestScore = score;
        best = trial;
      }
    }
  }

  return best;
}

export function monoAssignBestQuick(s, ctx) {
  const gl = s.gl, so = s.so, md = s.md, il = s.il, ip = s.ip, occ = s.occ, rLv = s.rLv, maxPerSlot = s.mMax;
  const monoCount = countMagTypes(md).mono;
  if (monoCount === 0) return md;
  const occTBF = computeOccurrencesToBeFound(rLv, occ);
  const gd101 = gbWith(gl, so, 93, ctx);
  const insightHelps = gd101 > 0 || gbWith(gl, so, 94, ctx) > 0;
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
        const projMD = reoptRegularMags({gl, so, md, il: tempIL, occ, rLv, mMax: maxPerSlot}, ctx);
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
  const result = md.map(m => m.type === 1 ? {...m, slot: -1} : {...m});
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

