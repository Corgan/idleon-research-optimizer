// ===== PHASE DIFF - pure config-comparison utilities =====
// Shared by app.js (web) and cli-sim.js (Node.js CLI).
// Computes structured diffs between sim phase configs.
// No DOM, no HTML - consumers format the output for their platform.

import { RES_GRID_RAW, NODE_GOAL, GRID_SIZE, OCC_DATA } from './game-data.js';
import { magMaxForLevel } from './sim-math.js';

/**
 * Compare two phase configs and return a structured diff object.
 * prev/cur each have { rLv, config: { gl, so, md, il, sp } }.
 */
export function diffPhaseConfigs(prev, cur) {
  const diff = {};

  // Research level
  diff.rLv = cur.rLv !== prev.rLv ? { from: prev.rLv, to: cur.rLv } : null;

  // Grid upgrades grouped by NODE_GOAL
  const grid = {};
  for (const idxStr of Object.keys(RES_GRID_RAW)) {
    const idx = Number(idxStr);
    const pgl = prev.config.gl[idx] || 0, cgl = cur.config.gl[idx] || 0;
    if (cgl > pgl) {
      const goal = NODE_GOAL[idx] || 'Other';
      if (!grid[goal]) grid[goal] = [];
      grid[goal].push({ idx, from: pgl, to: cgl });
    }
  }
  diff.grid = grid;

  // Shape changes
  let shapeChangeCount = 0;
  for (let s = 0; s < GRID_SIZE; s++) {
    if ((cur.config.so[s] ?? -1) !== (prev.config.so[s] ?? -1)) shapeChangeCount++;
  }
  if (shapeChangeCount > 0) {
    const byShape = {};
    for (let s = 0; s < GRID_SIZE; s++) {
      const si = cur.config.so[s] ?? -1;
      if (si >= 0 && RES_GRID_RAW[s]) {
        if (!byShape[si]) byShape[si] = [];
        byShape[si].push(s);
      }
    }
    diff.shapes = { count: shapeChangeCount, byShape };
  } else {
    diff.shapes = null;
  }

  // Magnifier slot cap
  const prevMax = magMaxForLevel(prev.rLv);
  const curMax = magMaxForLevel(cur.rLv);
  diff.magCap = curMax > prevMax ? { from: prevMax, to: curMax } : null;

  // Magnifier moves (type 0)
  {
    const prevSlots = {}, curSlots = {};
    for (const m of prev.config.md) { if (m.type === 0) prevSlots[m.slot] = (prevSlots[m.slot]||0)+1; }
    for (const m of cur.config.md) { if (m.type === 0) curSlots[m.slot] = (curSlots[m.slot]||0)+1; }
    const allSlots = new Set([...Object.keys(prevSlots), ...Object.keys(curSlots)]);
    const moves = [];
    for (const s of allSlots) {
      const pv = prevSlots[s] || 0, cv = curSlots[s] || 0;
      if (pv !== cv) moves.push({ slot: Number(s), delta: cv - pv });
    }
    diff.mags = { moves, netNew: cur.config.md.filter(m=>m.type===0).length - prev.config.md.filter(m=>m.type===0).length };
  }

  // Kaleidoscope moves (type 2, slot >= 0 only)
  {
    const prevSlots = {}, curSlots = {};
    for (const m of prev.config.md) { if (m.type === 2 && m.slot >= 0) prevSlots[m.slot] = (prevSlots[m.slot]||0)+1; }
    for (const m of cur.config.md) { if (m.type === 2 && m.slot >= 0) curSlots[m.slot] = (curSlots[m.slot]||0)+1; }
    const allSlots = new Set([...Object.keys(prevSlots), ...Object.keys(curSlots)]);
    const moves = [];
    for (const s of allSlots) {
      const pv = prevSlots[s] || 0, cv = curSlots[s] || 0;
      if (pv !== cv) moves.push({ slot: Number(s), delta: cv - pv });
    }
    diff.kals = { moves, netNew: cur.config.md.filter(m=>m.type===2).length - prev.config.md.filter(m=>m.type===2).length };
  }

  // Monocle diff (type 1)
  const prevMono = prev.config.md.filter(m=>m.type===1).map(m=>m.slot).sort((a,b)=>a-b);
  const curMono = cur.config.md.filter(m=>m.type===1).map(m=>m.slot).sort((a,b)=>a-b);
  const monoChanged = prevMono.length !== curMono.length || prevMono.some((s,i) => s !== curMono[i]);
  if (monoChanged) {
    const curGroups = {};
    for (const s of curMono) curGroups[s] = (curGroups[s] || 0) + 1;
    const prevGroups = {};
    for (const s of prevMono) prevGroups[s] = (prevGroups[s] || 0) + 1;
    const allObs = new Set([...Object.keys(curGroups), ...Object.keys(prevGroups)].map(Number));
    const moves = [];
    for (const obs of [...allObs].sort((a,b) => a - b)) {
      const pc = prevGroups[obs] || 0, cc = curGroups[obs] || 0;
      if (pc !== cc) moves.push({ slot: obs, delta: cc - pc });
    }
    diff.monos = { changed: true, curGroups, prevGroups, moves, netNew: curMono.length - prevMono.length, totalCur: curMono.length };
  } else {
    diff.monos = { changed: false };
  }

  // Insight level changes
  const insight = [];
  for (let o = 0; o < Math.max(prev.config.il.length, cur.config.il.length); o++) {
    const pil = prev.config.il[o] || 0, cil = cur.config.il[o] || 0;
    if (cil > pil) insight.push({ obs: o, from: pil, to: cil });
  }
  diff.insight = insight;

  return diff;
}

/**
 * Compare two magData layouts and return moves by type.
 * Returns { mags: [{slot, delta}], kals: [{slot, delta}], monos: [{slot, delta}] }.
 */
export function diffMDLayouts(baseMD, grindMD) {
  const result = { mags: [], kals: [], monos: [] };
  for (const [typeVal, arr] of [[0, result.mags], [2, result.kals], [1, result.monos]]) {
    const bs = {}, gs = {};
    for (const m of baseMD) { if (m.type === typeVal && m.slot >= 0) bs[m.slot] = (bs[m.slot] || 0) + 1; }
    for (const m of grindMD) { if (m.type === typeVal && m.slot >= 0) gs[m.slot] = (gs[m.slot] || 0) + 1; }
    for (const s of new Set([...Object.keys(bs), ...Object.keys(gs)])) {
      const pv = bs[s] || 0, cv = gs[s] || 0;
      if (pv !== cv) arr.push({ slot: Number(s), delta: cv - pv });
    }
  }
  return result;
}
