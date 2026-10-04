// ===== SHAPE OPTIMIZATION =====

// All functions require saveCtx — no global S fallback.
import {
  GRID_COLS,
  GRID_INDICES,
  GRID_ROWS,
  GRID_SIZE,
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
  makeSimCtx,
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
  const ctx = makeSimCtx(gl, _sc);

  const monoObsArr = Array.from(getMonoObsSet(md));
  const targetLevel = config.target.type === 'level' ? config.target.value : undefined;

  const result = simForwardProjection({
    monoSlots: monoObsArr, md, il, ip, gl, so, occ, rLv, rExp, ctx,
    maxHrs, maxJumps: 50000, targetLevel,
  });

  return { totalExp: result.totalExp, totalTime: result.time, finalLevel: result.rLv };
}

const _coveragePatternCache = new WeakMap();
const _cellValueCaches = new WeakMap();
const MAX_CELL_VALUE_CACHE = 64;

function _cellValueKey(simOpts, gl, md, il, ip, occ, rLv, currentExp) {
  const target = simOpts.target
    ? simOpts.target.type + ':' + simOpts.target.value
    : 'static';
  let key = target + '|' + rLv + '|' + currentExp + '|g:';
  key += gl.join(',');
  key += '|m:';
  for (let i = 0; i < md.length; i++) key += md[i].type + ':' + md[i].slot + ',';
  key += '|i:' + il.join(',');
  key += '|p:' + ip.join(',');
  key += '|o:' + occ.join(',');
  return key;
}

function _cacheCellValues(saveCtx, key, values) {
  let cache = _cellValueCaches.get(saveCtx);
  if (!cache) {
    cache = new Map();
    _cellValueCaches.set(saveCtx, cache);
  }
  if (cache.size >= MAX_CELL_VALUE_CACHE) cache.delete(cache.keys().next().value);
  cache.set(key, values.slice());
}

function _coveragePatterns(entry) {
  let cached = _coveragePatternCache.get(entry);
  if (cached) return cached;

  const patterns = new Map();
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
      pat.phases.push(r, s);
    }
  }

  cached = Array.from(patterns.values());
  _coveragePatternCache.set(entry, cached);
  return cached;
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
  const currentExp = simOpts.currentExp !== undefined ? simOpts.currentExp : getResearchCurrentExp(_sc);
  const cacheKey = _cellValueKey(simOpts, gl, md, il, ip, occ, rLv, currentExp);
  const cache = _cellValueCaches.get(_sc);
  const cached = cache && cache.get(cacheKey);
  if (cached) return cached.slice();

  if (simOpts.target) {
    const baseCfg = {
      target: simOpts.target,
      gridLevels: gl.slice(),
      magData: md.map(m => ({...m})),
      insightLvs: il.slice(),
      insightProgress: ip.slice(),
      occFound: occ.slice(),
      researchLevel: rLv,
      currentExp,
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
  _cacheCellValues(_sc, cacheKey, values);
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
  // Copy: callers may pass a shared/cached array, and it must never be mutated.
  const cellValues = (precomputedCellValues || computeCellValues(simOpts)).slice();

  // Use computed ShapesOwned (matches game formula) capped by available shape definitions
  const ctx = makeSimCtx(gl, _sc);
  const numShapes = Math.min(computeShapesOwnedAt(rLv, ctx), SHAPE_VERTICES.length);
  if (numShapes === 0) return { placements: [], cellValues, pureExpTotal: 0, message: 'No shapes unlocked.' };

  // Placement priority is lexicographic: Above tier (strict rank) > Res EXP value > Below tier rank.
  // Rank weights are 2^(n-1-rank), so covering a higher-ranked node beats covering every lower one.
  // EXP value counts for every node with a real EXP effect (e.g. Boony Crowns), whatever its tier.
  const st = useTiers ? _sc.shapeTiers : null;
  const isLive = (i) => !!RES_GRID_RAW[i] && (gl[i] || 0) > 0;
  const aboveW = new Float64Array(GRID_SIZE);
  const belowW = new Float64Array(GRID_SIZE);
  // Strict Above rank over the bonus each node receives: 13^(n-1-rank) per 5% step, so one extra
  // 5% step on a higher rank outweighs a full 60% on every lower rank.
  const aboveLex = new Float64Array(GRID_SIZE);
  if (st) {
    const above = [...new Set(st.above)].filter(isLive);
    above.forEach((idx, r) => {
      aboveW[idx] = Math.pow(2, above.length - 1 - r);
      aboveLex[idx] = Math.pow(13, above.length - 1 - r);
    });
    const aboveSet = new Set(above);
    const below = [...new Set(st.below)].filter(i => isLive(i) && !aboveSet.has(i));
    below.forEach((idx, r) => { belowW[idx] = Math.pow(2, below.length - 1 - r); });
  }
  const maxExp = Math.max(0, ...cellValues);
  const expNoise = maxExp * 1e-12; // ignore float residue from the bare-vs-shape delta
  const expOf = (i) => (cellValues[i] > expNoise ? cellValues[i] : 0);
  const expTie = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(Math.abs(a), Math.abs(b));

  let anchorCells = [];
  function _setAnchors(weightFn) {
    anchorCells = [];
    for (let i = 0; i < GRID_SIZE; i++) {
      if (isLive(i) && weightFn(i) > 0) anchorCells.push({ idx: i, value: weightFn(i) });
    }
    anchorCells.sort((a, b) => b.value - a.value);
  }

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

  const progressTotal = 2 * numShapes + 2;
  const coveredCells = new Set();
  const placements = [];
  const canRotate = rLv >= 90;
  const rotations = canRotate ? Array.from({length: 72}, (_, i) => i * 5) : [0];
  // LUT cache on saveCtx
  let _lutN = _sc.covLUTCacheN;
  let _lut  = _sc.covLUTCache;
  if (_lutN !== numShapes) {
    if (progressCb) progressCb(0, progressTotal, 'Building coverage LUT\u2026');
    _lut = buildCoverageLUT(numShapes);
    _lutN = numShapes;
    _sc.covLUTCache = _lut; _sc.covLUTCacheN = _lutN;
  }
  const covLUT = _lut;
  if (progressCb) progressCb(1, progressTotal, 'LUT built. Placing shapes\u2026');

  // Returns >0 when placement A beats B: [above, EXP (float-tolerant), below, node count, centering].
  function _cmp(a, b) {
    if (a.above !== b.above) return a.above - b.above;
    if (!expTie(a.exp, b.exp)) return a.exp - b.exp;
    if (a.below !== b.below) return a.below - b.below;
    if (a.nodes !== b.nodes) return a.nodes - b.nodes;
    return b.dist - a.dist;
  }

  function _placeShape(si) {
    const dims = SHAPE_DIMS[si];
    if (!dims) return null;
    const pctScale = SHAPE_BONUS_PCT[si] / 25;

    let best = null;
    let bestCells = [];

    const uncovered = anchorCells.filter(c => !coveredCells.has(c.idx));
    if (uncovered.length === 0) return null;

    for (const rot of rotations) {
      const ri = Math.round(((rot % 360) + 360) % 360 / 5) % 72;
      const entry = covLUT[si * 72 + ri];
      if (!entry) continue;

      // For each unique pattern, try all valid base positions
      for (const pat of _coveragePatterns(entry)) {
        const relPairs = pat.relPairs;
        const nRel = relPairs.length >> 1;
        const triedBases = new Set();

        // Anchor: for each uncovered target cell, each relative pair could
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

            // Score the uncovered nodes this pattern hits
            const newCells = [];
            let above = 0, exp = 0, below = 0;
            for (let j = 0; j < nRel; j++) {
              const col = baseCol + relPairs[j * 2];
              const row = baseRow + relPairs[j * 2 + 1];
              if (col < 0 || col >= GRID_COLS || row < 0 || row >= GRID_ROWS) continue;
              const idx = row * GRID_COLS + col;
              if (!RES_GRID_RAW[idx]) continue;
              if (coveredCells.has(idx)) continue;
              newCells.push(idx);
              above += aboveW[idx];
              exp += expOf(idx) * pctScale;
              below += belowW[idx];
            }
            if (newCells.length === 0) continue;

            // Quick reject before the centering search
            const cand = { above, exp, below, nodes: newCells.length, dist: -Infinity };
            if (best && _cmp(cand, best) < 0) continue;

            const ph = _centerPhase(pat, dims, baseCol, baseRow, newCells);
            cand.dist = ph.dist;

            if (!best || _cmp(cand, best) > 0) {
              best = cand;
              best.placement = { shapeIdx: si, x: baseCol * 30 + ph.r, y: baseRow * 30 + ph.s, rot, expScore: exp };
              bestCells = newCells;
            }
          }
        }
      }
    }

    if (best) {
      for (const c of bestCells) coveredCells.add(c);
      return {
        ...best.placement,
        cells: bestCells,
        shapeName: SHAPE_NAMES[si],
        bonusPct: SHAPE_BONUS_PCT[si],
      };
    }
    return null;
  }

  // Phase that best centers the shape over the cells it owns (cosmetic tiebreak).
  function _centerPhase(pat, dims, baseCol, baseRow, cells) {
    let ccx = 0, ccy = 0;
    for (const c of cells) {
      ccx += 30 + 30 * (c % GRID_COLS);
      ccy += 39 + 30 * Math.floor(c / GRID_COLS);
    }
    ccx /= cells.length;
    ccy /= cells.length;
    let dist = Infinity, r = pat.phases[0], s = pat.phases[1];
    for (let pi = 0; pi < pat.phases.length; pi += 2) {
      const pr = pat.phases[pi], ps = pat.phases[pi + 1];
      const scx = baseCol * 30 + pr + dims[0] / 2;
      const scy = baseRow * 30 + ps + dims[1] / 2;
      const d = (scx - ccx) ** 2 + (scy - ccy) ** 2;
      if (d < dist) { dist = d; r = pr; s = ps; }
    }
    return { dist, r, s };
  }

  function _aboveScore(overlay) {
    let score = 0;
    for (let i = 0; i < GRID_SIZE; i++) {
      if (aboveLex[i] > 0 && overlay[i] >= 0) score += aboveLex[i] * SHAPE_BONUS_PCT[overlay[i]] / 5;
    }
    return score;
  }

  // Every distinct set of primary nodes shape `si` can cover, with all placements realizing it.
  function _enumeratePrimary(si, prim, primIdx, words) {
    const byKey = new Map();
    for (const rot of rotations) {
      const ri = Math.round(((rot % 360) + 360) % 360 / 5) % 72;
      const entry = covLUT[si * 72 + ri];
      if (!entry) continue;
      const pats = _coveragePatterns(entry);
      for (let pi = 0; pi < pats.length; pi++) {
        const rel = pats[pi].relPairs;
        const nRel = rel.length >> 1;
        const tried = new Set();
        for (const a of prim) {
          const aCol = a % GRID_COLS, aRow = Math.floor(a / GRID_COLS);
          for (let k = 0; k < nRel; k++) {
            const baseCol = aCol - rel[k * 2], baseRow = aRow - rel[k * 2 + 1];
            const bk = (baseCol + 20) * 50 + (baseRow + 20);
            if (tried.has(bk)) continue;
            tried.add(bk);
            const hit = [];
            for (let j = 0; j < nRel; j++) {
              const col = baseCol + rel[j * 2], row = baseRow + rel[j * 2 + 1];
              if (col < 0 || col >= GRID_COLS || row < 0 || row >= GRID_ROWS) continue;
              const q = primIdx[row * GRID_COLS + col];
              if (q >= 0) hit.push(q);
            }
            hit.sort((x, y) => x - y);
            const key = hit.join(',');
            let g = byKey.get(key);
            if (!g) {
              const bits = new Uint32Array(words);
              for (const q of hit) bits[q >>> 5] |= 1 << (q & 31);
              g = { prims: Int32Array.from(hit), bits, reps: [] };
              byKey.set(key, g);
            }
            g.reps.push(rot, pi, baseCol, baseRow);
          }
        }
      }
    }
    return [...byKey.values()];
  }

  // Place shape `si` covering exactly `group.prims` among primary nodes; best Below tiebreak.
  function _realize(si, group) {
    const dims = SHAPE_DIMS[si];
    let best = null;
    for (let r = 0; r < group.reps.length; r += 4) {
      const rot = group.reps[r], pi = group.reps[r + 1], baseCol = group.reps[r + 2], baseRow = group.reps[r + 3];
      const ri = Math.round(((rot % 360) + 360) % 360 / 5) % 72;
      const pat = _coveragePatterns(covLUT[si * 72 + ri])[pi];
      const rel = pat.relPairs;
      const cells = [];
      let below = 0;
      for (let j = 0; j < rel.length; j += 2) {
        const col = baseCol + rel[j], row = baseRow + rel[j + 1];
        if (col < 0 || col >= GRID_COLS || row < 0 || row >= GRID_ROWS) continue;
        const idx = row * GRID_COLS + col;
        if (!RES_GRID_RAW[idx] || coveredCells.has(idx)) continue;
        cells.push(idx);
        below += belowW[idx];
      }
      if (cells.length === 0) continue;
      if (best && (below < best.below || (below === best.below && cells.length < best.cells.length))) continue;
      const ph = _centerPhase(pat, dims, baseCol, baseRow, cells);
      if (best && below === best.below && cells.length === best.cells.length && ph.dist >= best.dist) continue;
      best = { below, cells, dist: ph.dist, rot, x: baseCol * 30 + ph.r, y: baseRow * 30 + ph.s };
    }
    for (const c of best.cells) coveredCells.add(c);
    let exp = 0;
    for (const c of best.cells) exp += expOf(c) * SHAPE_BONUS_PCT[si] / 25;
    return {
      shapeIdx: si, x: best.x, y: best.y, rot: best.rot, expScore: exp,
      cells: best.cells, shapeName: SHAPE_NAMES[si], bonusPct: SHAPE_BONUS_PCT[si],
    };
  }

  // Branch and bound over one primary-node set per shape, maximizing (Above lex score, linear EXP).
  function _exactPrimarySearch() {
    const t0 = Date.now();
    const order = shapeOrder.slice();
    const S = order.length;
    const prim = [];
    const primIdx = new Int32Array(GRID_SIZE).fill(-1);
    for (let i = 0; i < GRID_SIZE; i++) {
      if (isLive(i) && (aboveLex[i] > 0 || expOf(i) > 0)) { primIdx[i] = prim.length; prim.push(i); }
    }
    const P = prim.length;
    const res = { improved: false, proven: false, order, masks: [], choice: null, nodes: 0, ms: 0, primaryNodes: P };
    if (P === 0) { res.proven = true; return res; }
    const words = (P + 31) >>> 5;
    const pA = new Float64Array(P), pE = new Float64Array(P);
    for (let j = 0; j < P; j++) { pA[j] = aboveLex[prim[j]] / 5; pE[j] = expOf(prim[j]) / 25; }

    // Candidate sets per shape; drop any set strictly contained in another (never better).
    for (let k = 0; k < S; k++) {
      const groups = _enumeratePrimary(order[k], prim, primIdx, words);
      groups.sort((a, b) => b.prims.length - a.prims.length);
      const kept = [];
      outer: for (const g of groups) {
        for (const h of kept) {
          if (h.prims.length <= g.prims.length) continue;
          let sub = true;
          for (let w = 0; w < words; w++) if (g.bits[w] & ~h.bits[w]) { sub = false; break; }
          if (sub) continue outer;
        }
        kept.push(g);
      }
      res.masks.push(kept);
      if (progressCb) progressCb(1 + S + k + 1, progressTotal, `Enumerating shape ${k + 1}/${S}\u2026`);
    }

    const pct = order.map(si => SHAPE_BONUS_PCT[si]);
    const sufA = new Float64Array(S + 1), sufE = new Float64Array(S + 1);
    for (let k = S - 1; k >= 0; k--) {
      let ba = 0, be = 0;
      for (const g of res.masks[k]) {
        let a = 0, e = 0;
        for (const q of g.prims) { a += pA[q]; e += pE[q]; }
        if (a > ba) ba = a;
        if (e > be) be = e;
      }
      sufA[k] = sufA[k + 1] + ba * pct[k];
      sufE[k] = sufE[k + 1] + be * pct[k];
    }

    // Incumbent: the greedy placement scored under the same model.
    let bestA = 0, bestE = 0;
    for (const p of placements) {
      for (const c of p.cells) {
        const q = primIdx[c];
        if (q >= 0) { bestA += pA[q] * p.bonusPct; bestE += pE[q] * p.bonusPct; }
      }
    }
    const beats = (a, e) => a > bestA || (a === bestA && e > bestE * (1 + 1e-9) + 1e-9);

    const covered = new Uint8Array(P);
    const choice = new Int32Array(S).fill(-1);
    const NODE_LIMIT = simOpts.exactNodeLimit || 5e6;
    const TIME_LIMIT = simOpts.exactTimeLimitMs || 20000;
    let aborted = false;

    function rec(k, curA, curE) {
      if (aborted) return;
      if ((++res.nodes & 4095) === 0) {
        if (res.nodes > NODE_LIMIT || Date.now() - t0 > TIME_LIMIT) { aborted = true; return; }
        if (progressCb) progressCb(progressTotal - 1, progressTotal, `Exact search\u2026 ${res.nodes.toLocaleString()} nodes`);
      }
      if (k === S) {
        if (beats(curA, curE)) { bestA = curA; bestE = curE; res.choice = Int32Array.from(choice); res.improved = true; }
        return;
      }
      const groups = res.masks[k];
      const n = groups.length;
      const gA = new Float64Array(n), gE = new Float64Array(n);
      const idx = [];
      for (let i = 0; i < n; i++) {
        let a = 0, e = 0;
        for (const q of groups[i].prims) if (!covered[q]) { a += pA[q]; e += pE[q]; }
        if (a === 0 && e === 0) continue; // same as leaving this shape for the Below phase
        gA[i] = a * pct[k]; gE[i] = e * pct[k];
        idx.push(i);
      }
      idx.sort((x, y) => (gA[y] - gA[x]) || (gE[y] - gE[x]));
      for (const i of idx) {
        if (!beats(curA + gA[i] + sufA[k + 1], curE + gE[i] + sufE[k + 1])) break;
        const flipped = [];
        for (const q of groups[i].prims) if (!covered[q]) { covered[q] = 1; flipped.push(q); }
        choice[k] = i;
        rec(k + 1, curA + gA[i], curE + gE[i]);
        for (const q of flipped) covered[q] = 0;
        choice[k] = -1;
        if (aborted) return;
      }
      if (beats(curA + sufA[k + 1], curE + sufE[k + 1])) rec(k + 1, curA, curE);
    }
    rec(0, 0, 0);
    res.proven = !aborted;
    res.ms = Date.now() - t0;
    return res;
  }

  // ── Phase 1a: greedy Above-tier and Res EXP placement (incumbent for the exact search) ──
  // Shapes go out largest-bonus first, so Above rank 1 receives the biggest shape, rank 2 the next
  // biggest uncovered one, and so on; Below nodes only break ties among equal-EXP placements.
  _setAnchors(i => aboveW[i] + expOf(i));

  let _shapesPlaced = 0;
  for (const si of shapeOrder) {
    const p = _placeShape(si);
    if (p) placements.push(p);
    _shapesPlaced++;
    if (progressCb) progressCb(1 + _shapesPlaced, progressTotal, `Greedy ${_shapesPlaced}/${numShapes} shapes\u2026`);
  }

  // ── Phase 1b: exact joint search ──
  // Greedy placement cannot trade nodes between shapes (e.g. a 25% shape giving up a node so another
  // 25% shape can take it). Enumerate every distinct set of valued ("primary") nodes each shape can
  // cover and branch-and-bound over one set per shape. Shapes are placed largest-bonus first and the
  // game's ownership is first-come, so each node receives the bonus of the first shape covering it.
  const exact = simOpts.exactSearch === false
    ? { improved: false, proven: false, nodes: 0, ms: 0, primaryNodes: 0 }
    : _exactPrimarySearch();
  const greedyPlacements = placements.slice();
  const greedyCovered = new Set(coveredCells);
  let exactPlacements = null, exactCovered = null;
  if (exact.improved) {
    coveredCells.clear();
    exactPlacements = [];
    for (let k = 0; k < exact.order.length; k++) {
      const choice = exact.choice[k];
      if (choice < 0) continue;
      exactPlacements.push(_realize(exact.order[k], exact.masks[k][choice]));
    }
    exactCovered = new Set(coveredCells);
  }

  const stOpts = { gridLevels: gl, magData: md, insightLvs: il, occFound: occ, researchLevel: rLv };
  // Phase 2: leftover shapes cover Below-tier nodes in rank order.
  function _finish(primaryPlacements, covered) {
    coveredCells.clear();
    for (const c of covered) coveredCells.add(c);
    const list = primaryPlacements.slice();
    const placedSet = new Set(list.map(p => p.shapeIdx));
    const phase1SO = new Array(GRID_SIZE).fill(-1);
    for (const p of list) for (const c of p.cells) phase1SO[c] = p.shapeIdx;
    const phase1 = simTotalExp({ ...stOpts, shapeOverlay: phase1SO }, _sc).total;
    if (st) {
      const leftover = shapeOrder.filter(s => !placedSet.has(s));
      if (leftover.length > 0) {
        _setAnchors(i => belowW[i]);
        for (const si of leftover) {
          const p = _placeShape(si);
          if (p) list.push(p);
        }
      }
    }
    const overlay = new Array(GRID_SIZE).fill(-1);
    for (const p of list) for (const c of p.cells) overlay[c] = p.shapeIdx;
    const total = simTotalExp({ ...stOpts, shapeOverlay: overlay }, _sc).total;
    return { list, overlay, total, phase1, above: _aboveScore(overlay) };
  }

  let chosen = _finish(greedyPlacements, greedyCovered);
  let exactUsed = false;
  if (exactPlacements) {
    const alt = _finish(exactPlacements, exactCovered);
    // Above rank is exact; EXP is re-checked with the full simulation (cell values are linearized).
    if (alt.above > chosen.above || (alt.above === chosen.above && alt.total > chosen.total)) { chosen = alt; exactUsed = true; }
  }
  placements.length = 0;
  placements.push(...chosen.list);
  const phase1ExpTotal = chosen.phase1;

  // Compare with current placement
  const so = simOpts.shapeOverlay || _sc.shapeOverlay;
  const currentTotal = simTotalExp({ ...stOpts, shapeOverlay: so }, _sc).total;
  const optimizedSO = chosen.overlay;
  const optimizedTotal = chosen.total;
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
    // Exact joint search metadata: `used` means its layout beat the greedy one.
    exactSearch: { proven: exact.proven, used: exactUsed, nodes: exact.nodes, ms: exact.ms, primaryNodes: exact.primaryNodes },
  };
}
