// ===== MAGNIFIER OPTIMIZER - pure enumeration =====
// _enumKalMags: given available observation slots, counts of each mag type,
// and scoring parameters, finds the optimal kaleidoscope + regular magnifier
// assignment by exhaustive enumeration.

import { obsBaseExp } from '../sim-math.js';

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
export function _enumKalMags(availSlots, numKalei, numRegular, kalBase, gd101, il, maxPerSlot) {
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
    return result;
  }

  let bestScore = -Infinity, bestKal = null, bestReg = null;
  const slotCounts = new Array(S).fill(0);

  const enumerate = (si, remaining) => {
    if (remaining === 0) {
      const km = {};
      for (let i = 0; i < S; i++) {
        const cnt = slotCounts[i];
        if (cnt === 0) continue;
        const s = availSlots[i];
        if (s % 8 !== 7) km[s+1] = (km[s+1] || 0) + cnt;
        if (s % 8 !== 0) km[s-1] = (km[s-1] || 0) + cnt;
        if (s > 7) km[s-8] = (km[s-8] || 0) + cnt;
        if (s < 72) km[s+8] = (km[s+8] || 0) + cnt;
      }
      const cands = [];
      for (let i = 0; i < S; i++) {
        const s = availSlots[i];
        const regRoom = maxPerSlot - slotCounts[i];
        if (regRoom <= 0) continue;
        const v = obsBaseExp(s) * (1 + gd101 * (il[s] || 0) / 100) * (1 + (km[s] || 0) * kalBase);
        for (let c = 0; c < regRoom; c++) cands.push({ s, v });
      }
      cands.sort((a, b) => b.v - a.v);
      let total = 0;
      const regs = [];
      for (let i = 0; i < Math.min(numRegular, cands.length); i++) {
        total += cands[i].v;
        regs.push(cands[i].s);
      }
      if (total > bestScore) {
        bestScore = total;
        bestKal = slotCounts.slice();
        bestReg = regs;
      }
      return;
    }
    let roomLeft = 0;
    for (let i = si; i < S; i++) roomLeft += maxPerSlot - slotCounts[i];
    if (roomLeft < remaining) return;

    for (let i = si; i < S; i++) {
      const maxAdd = Math.min(remaining, maxPerSlot - slotCounts[i]);
      for (let add = 1; add <= maxAdd; add++) {
        slotCounts[i] += add;
        enumerate(i + 1, remaining - add);
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
  return result;
}

/**
 * Grow md array to targetCount, adding mags with correct types (kalei/mono/regular)
 * based on grid levels and research level state.
 * ctx must provide: evShop33.
 * Mutates md in-place (pushes new entries).
 */
export function _growMagPoolTyped(md, gl, rLv, targetCount, ctx) {
  if (md.length >= targetCount) return;
  const expectedK = Math.round((gl[72] || 0) + ctx.evShop33);
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
