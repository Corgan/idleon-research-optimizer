// ===== SHAPE OPTIMIZATION =====

// All functions require saveCtx — no global S fallback.
import {
  GRID_COLS,
  GRID_INDICES,
  GRID_ROWS,
  GRID_SIZE,
  NODE_GOAL,
  NODE_GOAL_COLORS,
  RES_GRID_RAW,
  SHAPE_BONUS_PCT,
  SHAPE_DIMS,
  SHAPE_NAMES,
  SHAPE_VERTICES,
} from '../game-data.js';
import {
  computeOccurrencesToBeFound,
  computeShapesOwnedAt,
  getMonoObsSet,
  insightExpRate,
  insightExpReqAt,
  obsBaseExp,
  simForwardProjection,
  simTotalExpWith,
} from '../sim-math.js';
import { buildCoverageLUT } from './shapes-geo.js';
import {
  getResearchCurrentExp,
  makeCtx,
  simTotalExp,
} from '../save/context.js';

function simExpOverHorizon(config) {
  // Lightweight sim: total EXP earned over a time horizon.
  // Tracks insight level-ups and their cascading effect on research EXP rate,
  // but does NOT re-optimize shapes, mags, or grid points (avoids recursion).
  // Uses event-driven jumps (jumps directly to next level-up or insight-up).
  const maxHrs = config.target.type === 'hours' ? config.target.value : 1e8;

  const _sc = config.saveCtx;
  const gl = config.gridLevels ? config.gridLevels.slice() : _sc.gridLevels.slice();
  const so = config.shapeOverlay ? config.shapeOverlay.slice() : _sc.shapeOverlay.slice();
  const md = config.magData ? config.magData.map(m => ({...m})) : _sc.magData.map(m => ({...m}));
  const il = config.insightLvs ? config.insightLvs.slice() : _sc.insightLvs.slice();
  const ip = config.insightProgress ? config.insightProgress.slice() : _sc.insightProgress.slice();
  const occ = config.occFound ? config.occFound.slice() : _sc.occFound.slice();
  let rLv = config.researchLevel !== undefined ? config.researchLevel : _sc.researchLevel;
  let rExp = config.currentExp !== undefined ? config.currentExp : getResearchCurrentExp(_sc);
  const ctx = makeCtx(gl, _sc);

  const monoObsArr = Array.from(getMonoObsSet(md));
  const targetLevel = config.target.type === 'level' ? config.target.value : undefined;

  const result = simForwardProjection({
    monoSlots: monoObsArr, md, il, ip, gl, so, occ, rLv, rExp, ctx,
    maxHrs, maxJumps: 50000, targetLevel,
  });

  return { totalExp: result.totalExp, totalTime: result.time, finalLevel: result.rLv };
}

export function computeCellValues(simOpts) {
  // Compute the value of putting a 25% shape bonus on each cell.
  // If simOpts.target provided, uses sim-over-horizon scoring to capture
  // insight cascading effects (insight EXP → insight levels → research EXP).
  const values = new Array(GRID_SIZE).fill(0);
  const bareSO = new Array(GRID_SIZE).fill(-1); // no shapes
  const _sc = simOpts.saveCtx;
  const gl = simOpts.gridLevels || _sc.gridLevels;
  const md = simOpts.magData || _sc.magData;
  const il = simOpts.insightLvs || _sc.insightLvs;
  const ip = simOpts.insightProgress || _sc.insightProgress;
  const occ = simOpts.occFound || _sc.occFound;
  const rLv = simOpts.researchLevel !== undefined ? simOpts.researchLevel : _sc.researchLevel;

  if (simOpts.target) {
    const baseCfg = {
      target: simOpts.target,
      gridLevels: gl.slice(),
      magData: md.map(m => ({...m})),
      insightLvs: il.slice(),
      insightProgress: ip.slice(),
      occFound: occ.slice(),
      researchLevel: rLv,
      currentExp: simOpts.currentExp !== undefined ? simOpts.currentExp : getResearchCurrentExp(_sc),
      saveCtx: _sc,
    };
    // For level mode: find bare time first, then use fixed-hours scoring
    // so all cell tests run the same duration and totalExp is comparable
    let effectiveTarget = simOpts.target;
    if (simOpts.target.type === 'level') {
      const barePreRun = simExpOverHorizon({ ...baseCfg, shapeOverlay: bareSO });
      effectiveTarget = { type: 'hours', value: Math.max(1, barePreRun.totalTime) };
    }
    const scoreCfg = { ...baseCfg, target: effectiveTarget };
    const bareResult = simExpOverHorizon({ ...scoreCfg, shapeOverlay: bareSO });

    const testSO = bareSO.slice();
    for (const idx of GRID_INDICES) {
      if ((gl[idx] || 0) === 0) continue;
      testSO[idx] = 0; // 25% shape
      const testResult = simExpOverHorizon({ ...scoreCfg, shapeOverlay: testSO });
      values[idx] = testResult.totalExp - bareResult.totalExp;
      testSO[idx] = -1; // restore
    }
  } else {
    // Static scoring (original: instantaneous EXP/hr delta)
    const stOpts = { gridLevels: gl, magData: md, insightLvs: il, occFound: occ, researchLevel: rLv };
    const bareTotal = simTotalExp({ ...stOpts, shapeOverlay: bareSO }, _sc).total;
    const testSO2 = bareSO.slice();
    for (const idx of GRID_INDICES) {
      if ((gl[idx] || 0) === 0) continue;
      testSO2[idx] = 0; // 25% shape
      const withShape = simTotalExp({ ...stOpts, shapeOverlay: testSO2 }, _sc).total;
      values[idx] = withShape - bareTotal;
      testSO2[idx] = -1; // restore
    }
  }
  return values;
}

export function optimizeShapePlacement(simOpts, progressCb, precomputedCellValues) {
  const useTiers = simOpts && simOpts.useTiers;
  const _sc = simOpts.saveCtx;
  const gl = simOpts.gridLevels || _sc.gridLevels;
  const md = simOpts.magData || _sc.magData;
  const il = simOpts.insightLvs || _sc.insightLvs;
  const occ = simOpts.occFound || _sc.occFound;
  const rLv = simOpts.researchLevel !== undefined ? simOpts.researchLevel : _sc.researchLevel;
  const cellValues = precomputedCellValues || computeCellValues(simOpts);

  // Use computed ShapesOwned (matches game formula) capped by available shape definitions
  const ctx = makeCtx(gl, _sc);
  const numShapes = Math.min(computeShapesOwnedAt(rLv, ctx), SHAPE_VERTICES.length);
  if (numShapes === 0) return { placements: [], cellValues, pureExpTotal: 0, message: 'No shapes unlocked.' };

  // Sort cells by value descending - these are our target cells
  let valuedCells = [];
  function _rebuildValuedCells() {
    valuedCells = [];
    for (let i = 0; i < GRID_SIZE; i++) {
      if (cellValues[i] > 0 && RES_GRID_RAW[i] && (gl[i] || 0) > 0) {
        valuedCells.push({ idx: i, value: cellValues[i] });
      }
    }
    valuedCells.sort((a, b) => b.value - a.value);
  }
  _rebuildValuedCells();

  // Sort shapes by bonus% descending, then by bounding-box area descending.
  // Larger shapes are harder to position, so among equal-bonus shapes they go
  // first while the grid is still open; smaller shapes adapt more easily.
  const shapeOrder = [];
  for (let s = 0; s < numShapes; s++) shapeOrder.push(s);
  shapeOrder.sort((a, b) => {
    const d = SHAPE_BONUS_PCT[b] - SHAPE_BONUS_PCT[a];
    if (d !== 0) return d;
    const areaA = SHAPE_DIMS[a] ? SHAPE_DIMS[a][0] * SHAPE_DIMS[a][1] : 0;
    const areaB = SHAPE_DIMS[b] ? SHAPE_DIMS[b][0] * SHAPE_DIMS[b][1] : 0;
    return areaB - areaA;
  });

  const coveredCells = new Set();
  const placements = [];
  const canRotate = rLv >= 90;
  const rotations = canRotate ? Array.from({length: 72}, (_, i) => i * 5) : [0];
  // LUT cache on saveCtx
  let _lutN = _sc.covLUTCacheN;
  let _lut  = _sc.covLUTCache;
  if (_lutN !== numShapes) {
    if (progressCb) progressCb(0, numShapes + 1, 'Building coverage LUT\u2026');
    _lut = buildCoverageLUT(numShapes);
    _lutN = numShapes;
    _sc.covLUTCache = _lut; _sc.covLUTCacheN = _lutN;
  }
  const covLUT = _lut;
  if (progressCb) progressCb(1, numShapes + 1, 'LUT built. Placing shapes\u2026');

  function _placeShape(si) {
    const dims = SHAPE_DIMS[si];
    if (!dims) return null;

    let bestExpScore = -Infinity;
    let bestNodeCount = -1;
    let bestCenterDist = Infinity;
    let bestPlacement = null;
    let bestCells = [];

    const uncovered = valuedCells.filter(c => !coveredCells.has(c.idx));
    if (uncovered.length === 0) return null;

    // Pre-index uncovered valued cells by (col, row) for fast anchor lookup
    const uncoveredByPos = new Map();
    for (const u of uncovered) {
      const col = u.idx % GRID_COLS;
      const row = Math.floor(u.idx / GRID_COLS);
      uncoveredByPos.set(row * GRID_COLS + col, u);
    }

    for (const rot of rotations) {
      const ri = Math.round(((rot % 360) + 360) % 360 / 5) % 72;
      const entry = covLUT[si * 72 + ri];
      if (!entry) continue;

      // Group the 900 phase offsets by their relative-cell pattern
      const patterns = new Map(); // relKey -> { relPairs, phases }
      for (let s = 0; s < 30; s++) {
        for (let r = 0; r < 30; r++) {
          const pk = s * 30 + r;
          const start = entry.starts[pk];
          const end = entry.starts[pk + 1];
          if (start === end) continue;
          let key = '';
          for (let i = start; i < end; i += 2) {
            if (i > start) key += ',';
            key += entry.data[i] + ',' + entry.data[i + 1];
          }
          let pat = patterns.get(key);
          if (!pat) {
            const relPairs = [];
            for (let i = start; i < end; i += 2) {
              relPairs.push(entry.data[i], entry.data[i + 1]);
            }
            pat = { relPairs, phases: [] };
            patterns.set(key, pat);
          }
          pat.phases.push(r, s); // flat pairs for speed
        }
      }

      // For each unique pattern, try all valid base positions
      for (const pat of patterns.values()) {
        const relPairs = pat.relPairs;
        const nRel = relPairs.length >> 1;
        const triedBases = new Set();

        // Anchor: for each uncovered valued cell, each relative pair could
        // align the pattern so that pair lands on that cell
        for (const u of uncovered) {
          const aCol = u.idx % GRID_COLS;
          const aRow = Math.floor(u.idx / GRID_COLS);
          for (let k = 0; k < nRel; k++) {
            const baseCol = aCol - relPairs[k * 2];
            const baseRow = aRow - relPairs[k * 2 + 1];
            const bk = (baseCol + 20) * 50 + (baseRow + 20);
            if (triedBases.has(bk)) continue;
            triedBases.add(bk);

            // Score: which uncovered valued cells does this pattern hit?
            const newCells = [];
            let expScore = 0;
            for (let j = 0; j < nRel; j++) {
              const col = baseCol + relPairs[j * 2];
              const row = baseRow + relPairs[j * 2 + 1];
              if (col < 0 || col >= GRID_COLS || row < 0 || row >= GRID_ROWS) continue;
              const idx = row * GRID_COLS + col;
              if (!RES_GRID_RAW[idx]) continue;
              if (coveredCells.has(idx)) continue;
              newCells.push(idx);
              expScore += cellValues[idx] * (SHAPE_BONUS_PCT[si] / 25);
            }
            if (newCells.length === 0) continue;

            // Quick reject: can't beat current best on score/nodes
            if (expScore < bestExpScore) continue;
            if (expScore === bestExpScore && newCells.length < bestNodeCount) continue;

            // Compute centroid of covered cells
            let ccx = 0, ccy = 0;
            for (const c of newCells) {
              ccx += 30 + 30 * (c % GRID_COLS);
              ccy += 39 + 30 * Math.floor(c / GRID_COLS);
            }
            ccx /= newCells.length;
            ccy /= newCells.length;

            // Find the phase that centers the shape best over these cells
            let bestPDist = Infinity, bestR = pat.phases[0], bestS = pat.phases[1];
            const pLen = pat.phases.length;
            for (let pi = 0; pi < pLen; pi += 2) {
              const pr = pat.phases[pi], ps = pat.phases[pi + 1];
              const scx = baseCol * 30 + pr + dims[0] / 2;
              const scy = baseRow * 30 + ps + dims[1] / 2;
              const d = (scx - ccx) ** 2 + (scy - ccy) ** 2;
              if (d < bestPDist) { bestPDist = d; bestR = pr; bestS = ps; }
            }

            if (expScore > bestExpScore ||
                (expScore === bestExpScore && newCells.length > bestNodeCount) ||
                (expScore === bestExpScore && newCells.length === bestNodeCount && bestPDist < bestCenterDist)) {
              bestExpScore = expScore;
              bestNodeCount = newCells.length;
              bestCenterDist = bestPDist;
              bestPlacement = { shapeIdx: si, x: baseCol * 30 + bestR, y: baseRow * 30 + bestS, rot, expScore };
              bestCells = newCells;
            }
          }
        }
      }
    }

    if (bestPlacement) {
      for (const c of bestCells) coveredCells.add(c);
      return {
        ...bestPlacement,
        cells: bestCells,
        shapeName: SHAPE_NAMES[si],
        bonusPct: SHAPE_BONUS_PCT[si],
      };
    }
    return null;
  }

  // ── Phase 1: EXP + "above" nodes ──
  // Boost "above" tier nodes so shapes actively target them alongside EXP.
  // Zero out "below" nodes - they can still get hit incidentally
  // by shapes positioned for nearby EXP/above cells.
  const st = useTiers ? _sc.shapeTiers : null;
  if (useTiers) {
    const maxExpVal = Math.max(0.001, ...cellValues.filter(v => v > 0));
    const aboveSet = new Set(st.above);
    // Boost EXP nodes in "above" tier (e.g., Insight preset)
    for (const idx of st.above) {
      const goal = NODE_GOAL[idx];
      if (goal && NODE_GOAL_COLORS[goal] && (gl[idx] || 0) > 0) {
        const rank = st.above.indexOf(idx);
        cellValues[idx] = maxExpVal * (2 + (st.above.length - rank) * 0.5);
      }
    }
    // Handle non-EXP nodes: boost above, zero out below
    for (const idx of GRID_INDICES) {
      const lv = gl[idx] || 0;
      if (lv === 0) continue;
      const goal = NODE_GOAL[idx];
      if (!goal || NODE_GOAL_COLORS[goal]) continue; // skip EXP-related nodes (handled above if in tier)
      if (aboveSet.has(idx)) {
        const rank = st.above.indexOf(idx);
        cellValues[idx] = maxExpVal * (2 + (st.above.length - rank) * 0.5);
      } else {
        cellValues[idx] = 0; // below: don't target, but may hit incidentally
      }
    }
    _rebuildValuedCells();
  }

  const placedSet = new Set();
  let _shapesPlaced = 0;
  for (const si of shapeOrder) {
    const p = _placeShape(si);
    if (p) { placements.push(p); placedSet.add(si); }
    _shapesPlaced++;
    if (progressCb) progressCb(1 + _shapesPlaced, numShapes + 1, `Placed ${_shapesPlaced}/${numShapes} shapes\u2026`);
  }

  // Record phase-1 EXP total (includes "above" influence)
  const pureExpSO = new Array(GRID_SIZE).fill(-1);
  for (const p of placements) for (const c of p.cells) pureExpSO[c] = p.shapeIdx;
  const stOpts = { gridLevels: gl, magData: md, insightLvs: il, occFound: occ, researchLevel: rLv };
  const phase1ExpTotal = simTotalExp({ ...stOpts, shapeOverlay: pureExpSO }, _sc).total;

  // ── Phase 2: Place leftover shapes on "below" tier nodes ──
  if (useTiers) {
    const leftover = shapeOrder.filter(s => !placedSet.has(s));
    if (leftover.length > 0) {
      // Give "below" nodes ordered values so leftover shapes cover them by priority
      for (let i = 0; i < st.below.length; i++) {
        const idx = st.below[i];
        if ((gl[idx] || 0) > 0) {
          cellValues[idx] = 1000 * (st.below.length - i);
        }
      }
      _rebuildValuedCells();
      for (const si of leftover) {
        const p = _placeShape(si);
        if (p) { placements.push(p); placedSet.add(si); }
      }
    }
  }

  // Compare with current placement
  const so = simOpts.shapeOverlay || _sc.shapeOverlay;
  const currentTotal = simTotalExp({ ...stOpts, shapeOverlay: so }, _sc).total;
  const optimizedSO = new Array(GRID_SIZE).fill(-1);
  for (const p of placements) {
    for (const c of p.cells) optimizedSO[c] = p.shapeIdx;
  }
  const optimizedTotal = simTotalExp({ ...stOpts, shapeOverlay: optimizedSO }, _sc).total;
  const improvement = optimizedTotal - currentTotal;
  const improvPct = currentTotal > 0 ? improvement / currentTotal * 100 : 0;

  // Build shape positions array for SVG rendering
  const optimizedPositions = [];
  for (const p of placements) {
    optimizedPositions[p.shapeIdx] = { x: p.x, y: p.y, rot: p.rot };
  }

  return {
    placements,
    cellValues,
    currentTotal,
    optimizedTotal,
    improvement,
    improvPct,
    optimizedOverlay: optimizedSO,
    optimizedPositions,
    phase1ExpTotal,
  };
}

