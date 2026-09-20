// ===== MAGNIFIER OPTIMIZER - pure enumeration =====
// _enumKalMags: given available observation slots, counts of each mag type,
// and scoring parameters, finds the optimal kaleidoscope + regular magnifier
// assignment by exhaustive enumeration.

import { obsBaseExp } from '../sim-math.js';

const _enumCache = new Map();
const MAX_ENUM_CACHE = 256;

function _enumCacheKey(availSlots, numKalei, numRegular, kalBase, gd101, il, maxPerSlot) {
  let key = numKalei + '|' + numRegular + '|' + kalBase + '|' + gd101 + '|' + maxPerSlot + '|';
  for (let i = 0; i < availSlots.length; i++) {
    const slot = availSlots[i];
    key += slot + ':' + (il[slot] || 0) + ',';
  }
  return key;
}

function _cloneAssignments(assignments) {
  return assignments.map(function(m) {
    return { type: m.type, slot: m.slot, x: m.x, y: m.y };
  });
}

/**
 * Enumerate all kaleidoscope placements and greedily assign regular mags.
 * Pure function - all inputs via params, no global state.
 *
 * @param {number[]} availSlots  - observation indices that are usable
 * @param {number}   numKalei    - kaleidoscope magnifiers to place
 * @param {number}   numRegular  - regular magnifiers to place
 * @param {number}   kalBase     - kaleidoscope base multiplier
 * @param {number}   gd101       - Game Design 101 grid bonus value
 * @param {number[]} il          - insight levels per observation
 * @param {number}   maxPerSlot  - max magnifiers per observation slot
 * @returns {Array<{type,slot,x,y}>} optimal magnifier assignments
 */
export function enumKalMags(availSlots, numKalei, numRegular, kalBase, gd101, il, maxPerSlot) {
  const cacheKey = _enumCacheKey(availSlots, numKalei, numRegular, kalBase, gd101, il, maxPerSlot);
  const cached = _enumCache.get(cacheKey);
  if (cached) return _cloneAssignments(cached);

  const S = availSlots.length;

  if (numKalei === 0) {
    const cands = [];
    for (const s of availSlots) {
      const v = obsBaseExp(s) * (1 + gd101 * (il[s] || 0) / 100);
      for (let c = 0; c < maxPerSlot; c++) cands.push({ s, v });
    }
    cands.sort((a, b) => b.v - a.v);
    const result = [];
    for (let i = 0; i < Math.min(numRegular, cands.length); i++) {
      result.push({type: 0, slot: cands[i].s, x:0, y:0});
    }
    if (_enumCache.size >= MAX_ENUM_CACHE) _enumCache.delete(_enumCache.keys().next().value);
    _enumCache.set(cacheKey, result);
    return _cloneAssignments(result);
  }

  let bestScore = -Infinity, bestKal = null, bestReg = null;
  const slotCounts = new Array(S).fill(0);
  const slotLookup = new Int16Array(80);
  slotLookup.fill(-1);
  for (let i = 0; i < S; i++) slotLookup[availSlots[i]] = i;
  const baseValues = new Float64Array(S);
  for (let i = 0; i < S; i++) {
    const slot = availSlots[i];
    baseValues[i] = obsBaseExp(slot) * (1 + gd101 * (il[slot] || 0) / 100);
  }
  const kaleiNeighbors = new Array(S);
  const kaleiSources = Array.from({ length: S }, () => []);
  for (let i = 0; i < S; i++) {
    const slot = availSlots[i];
    const neighbors = [];
    if (slot % 8 !== 7 && slotLookup[slot + 1] >= 0) neighbors.push(slotLookup[slot + 1]);
    if (slot % 8 !== 0 && slotLookup[slot - 1] >= 0) neighbors.push(slotLookup[slot - 1]);
    if (slot > 7 && slotLookup[slot - 8] >= 0) neighbors.push(slotLookup[slot - 8]);
    if (slot < 72 && slotLookup[slot + 8] >= 0) neighbors.push(slotLookup[slot + 8]);
    kaleiNeighbors[i] = neighbors;
    for (let n = 0; n < neighbors.length; n++) kaleiSources[neighbors[n]].push(i);
  }
  const neighborCounts = new Int16Array(S);

  function scoreRegulars(optimisticRemaining, minSourceIdx) {
    const cands = [];
    for (let i = 0; i < S; i++) {
      const regRoom = maxPerSlot - slotCounts[i];
      if (regRoom <= 0) continue;
      let extraNeighbors = 0;
      if (optimisticRemaining > 0) {
        const sources = kaleiSources[i];
        for (let n = 0; n < sources.length; n++) {
          const sourceIdx = sources[n];
          if (sourceIdx < minSourceIdx) continue;
          extraNeighbors += maxPerSlot - slotCounts[sourceIdx];
        }
        if (extraNeighbors > optimisticRemaining) extraNeighbors = optimisticRemaining;
      }
      const v = baseValues[i] * (1 + (neighborCounts[i] + extraNeighbors) * kalBase);
      cands.push({ i, room: regRoom, v });
    }
    cands.sort((a, b) => (b.v - a.v) || (a.i - b.i));
    let total = 0;
    let regsLeft = numRegular;
    const regs = optimisticRemaining === 0 ? [] : null;
    for (let i = 0; i < cands.length && regsLeft > 0; i++) {
      const take = Math.min(regsLeft, cands[i].room);
      total += take * cands[i].v;
      if (regs) {
        const slot = availSlots[cands[i].i];
        for (let count = 0; count < take; count++) regs.push(slot);
      }
      regsLeft -= take;
    }
    return { total, regs };
  }

  const enumerate = (si, remaining) => {
    if (remaining === 0) {
      const scored = scoreRegulars(0, S);
      if (scored.total > bestScore) {
        bestScore = scored.total;
        bestKal = slotCounts.slice();
        bestReg = scored.regs;
      }
      return;
    }
    let roomLeft = 0;
    for (let i = si; i < S; i++) roomLeft += maxPerSlot - slotCounts[i];
    if (roomLeft < remaining) return;
    if (bestScore > -Infinity && kalBase >= 0) {
      const upper = scoreRegulars(remaining, si).total;
      if (upper <= bestScore + 1e-12) return;
    }

    for (let i = si; i < S; i++) {
      const maxAdd = Math.min(remaining, maxPerSlot - slotCounts[i]);
      for (let add = 1; add <= maxAdd; add++) {
        slotCounts[i] += add;
        const neighbors = kaleiNeighbors[i];
        for (let n = 0; n < neighbors.length; n++) neighborCounts[neighbors[n]] += add;
        enumerate(i + 1, remaining - add);
        for (let n = 0; n < neighbors.length; n++) neighborCounts[neighbors[n]] -= add;
        slotCounts[i] -= add;
      }
    }
  };

  enumerate(0, numKalei);

  const result = [];
  for (let i = 0; i < S; i++) {
    for (let c = 0; c < bestKal[i]; c++) result.push({type: 2, slot: availSlots[i], x:0, y:0});
  }
  for (const s of bestReg) result.push({type: 0, slot: s, x:0, y:0});
  if (_enumCache.size >= MAX_ENUM_CACHE) _enumCache.delete(_enumCache.keys().next().value);
  _enumCache.set(cacheKey, result);
  return _cloneAssignments(result);
}

/**
 * Grow md array to targetCount, adding mags with correct types (kalei/mono/regular)
 * based on grid levels and research level state.
 * ctx must provide: evShop[33].
 * Mutates md in-place (pushes new entries).
 */
export function growMagPoolTyped(md, gl, rLv, targetCount, ctx) {
  if (md.length >= targetCount) return;
  const expectedK = Math.round((gl[72] || 0) + (ctx.evShop[33]||0));
  const expectedM = Math.round(gl[91] || 0);
  let curK = 0, curM = 0;
  for (const m of md) { if (m.type === 2) curK++; if (m.type === 1) curM++; }
  while (md.length < targetCount) {
    let type = 0;
    if (curK < expectedK) { type = 2; curK++; }
    else if (curM < expectedM) { type = 1; curM++; }
    md.push({ x: 0, y: 0, slot: -1, type });
  }
}
