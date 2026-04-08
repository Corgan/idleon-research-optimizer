// ===== PHASE DIFF - pure config-comparison utilities =====
// Shared by app.js (web) and cli-sim.js (Node.js CLI).
// Computes structured diffs between sim phase configs.
// No DOM, no HTML - consumers format the output for their platform.

import { GRID_INDICES, RES_GRID_RAW, NODE_GOAL, GRID_SIZE, OCC_DATA } from './game-data.js';
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
  for (const idx of GRID_INDICES) {
    const pgl = prev.config.gl[idx] || 0, cgl = cur.config.gl[idx] || 0;
    if (cgl > pgl) {
      const goal = NODE_GOAL[idx] || 'Path';
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

  // Magnifier / Kaleidoscope / Monocle moves - delegate to diffMDLayouts
  const mdMoves = diffMDLayouts(prev.config.md, cur.config.md);

  diff.mags = { moves: mdMoves.mags, netNew: mdMoves.mags.reduce((s, m) => s + m.delta, 0) };
  diff.kals = { moves: mdMoves.kals, netNew: mdMoves.kals.reduce((s, m) => s + m.delta, 0) };

  if (mdMoves.monos.length > 0) {
    const curGroups = {}, prevGroups = {};
    for (const m of cur.config.md)  { if (m.type === 1 && m.slot >= 0) curGroups[m.slot]  = (curGroups[m.slot]  || 0) + 1; }
    for (const m of prev.config.md) { if (m.type === 1 && m.slot >= 0) prevGroups[m.slot] = (prevGroups[m.slot] || 0) + 1; }
    const totalCur = Object.values(curGroups).reduce((s, c) => s + c, 0);
    diff.monos = {
      changed: true, curGroups, prevGroups,
      moves: mdMoves.monos.sort((a, b) => a.slot - b.slot),
      netNew: mdMoves.monos.reduce((s, m) => s + m.delta, 0),
      totalCur,
    };
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
