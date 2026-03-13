// Optimizer unit tests: grid-spend, magnifiers, shapes, shapes-geo, monos
// Run: node js/tests/test-optimizers.js

import { GRID_COLS, GRID_INDICES, GRID_SIZE, RES_GRID_RAW, OCC_DATA,
         SHAPE_VERTICES, SHAPE_DIMS, SHAPE_BONUS_PCT, SHAPE_NAMES,
       } from '../game-data.js';

import { enumGridCombos } from '../optimizers/grid-spend.js';
import { evalMagScoreWith } from '../optimizers/magnifiers.js';
import { isPointInPolygon, getShapePolygonAt, getShapeCellCoverage,
         buildCoverageLUT, lookupCoverage, rebuildShapeOverlay, sameShapeCell,
       } from '../optimizers/shapes-geo.js';
import { computeCellValues, optimizeShapePlacement } from '../optimizers/shapes.js';

import { gbWith, buildKalMap, obsBaseExp, computeOccurrencesToBeFound,
         simTotalExpWith, getKaleiMultiBase, calcAllBonusMultiWith,
       } from '../sim-math.js';
import { buildSaveContext, makeCtx } from '../save/context.js';
import { loadSaveData } from '../save/loader.js';
import { S } from '../state.js';

import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SAVES_DIR = resolve(__dirname, '..', '..', 'saves');

let pass = 0, fail = 0;
function eq(a, b, label) {
  if (JSON.stringify(a) === JSON.stringify(b)) { pass++; }
  else { fail++; console.error(`FAIL: ${label}\n  got:      ${JSON.stringify(a)}\n  expected: ${JSON.stringify(b)}`); }
}
function approx(a, b, tol, label) {
  if (Math.abs(a - b) < tol) { pass++; }
  else { fail++; console.error(`FAIL: ${label}\n  got: ${a}, expected: ${b} (tol=${tol})`); }
}
function ok(cond, label) {
  if (cond) { pass++; }
  else { fail++; console.error(`FAIL: ${label}`); }
}

// ============================================================
// shapes-geo.js — additional coverage
// ============================================================

// --- sameShapeCell ---
{
  const so = new Array(240).fill(-1);
  so[50] = 0;
  so[51] = 0;
  so[52] = 1;
  eq(sameShapeCell(so, 50, 51), true, 'sameShapeCell: same shape');
  eq(sameShapeCell(so, 50, 52), false, 'sameShapeCell: different shapes');
  eq(sameShapeCell(so, 50, 53), false, 'sameShapeCell: uncovered neighbor');
  eq(sameShapeCell(so, 53, 50), false, 'sameShapeCell: uncovered cell');
  eq(sameShapeCell(so, 50, -1), false, 'sameShapeCell: neighbor out of bounds low');
  eq(sameShapeCell(so, 50, 240), false, 'sameShapeCell: neighbor out of bounds high');
}

// --- rebuildShapeOverlay ---
{
  // 0 shapes → all -1
  const so0 = rebuildShapeOverlay([], 0);
  eq(so0.length, GRID_SIZE, 'rebuildShapeOverlay: 0 shapes has 240 entries');
  ok(so0.every(v => v === -1), 'rebuildShapeOverlay: 0 shapes all -1');

  // 1 shape (diamond at origin)
  const cells = getShapeCellCoverage(0, 0, 0, 0);
  const so1 = rebuildShapeOverlay([{ x: 0, y: 0, rot: 0 }], 1);
  eq(so1.length, GRID_SIZE, 'rebuildShapeOverlay: 1 shape has 240 entries');
  for (const c of cells) ok(so1[c] === 0, 'rebuildShapeOverlay: covered cell ' + c + ' = 0');
  const uncoveredSet = new Set(cells);
  let anyWrong = false;
  for (let i = 0; i < GRID_SIZE; i++) {
    if (!uncoveredSet.has(i) && so1[i] !== -1) { anyWrong = true; break; }
  }
  ok(!anyWrong, 'rebuildShapeOverlay: uncovered cells are -1');

  // Null/missing position → skipped
  const so2 = rebuildShapeOverlay([null, { x: 270, y: 150, rot: 0 }], 2);
  ok(so2.some(v => v === 1), 'rebuildShapeOverlay: skipped null, placed shape 1');
  ok(so2.every(v => v === -1 || v === 1), 'rebuildShapeOverlay: no shape 0 in overlay');
}

// --- lookupCoverage vs getShapeCellCoverage consistency ---
{
  const lut = buildCoverageLUT(1);
  // Test diamond (shape 0) at a few different positions
  const testCases = [
    { x: 0, y: 0, rot: 0 },
    { x: 30, y: 30, rot: 0 },
    { x: 15, y: 24, rot: 90 },
    { x: 60, y: 60, rot: 45 },
  ];
  for (const tc of testCases) {
    const direct = getShapeCellCoverage(0, tc.x, tc.y, tc.rot).sort((a, b) => a - b);
    const fast = lookupCoverage(lut, 0, tc.x, tc.y, tc.rot).sort((a, b) => a - b);
    eq(direct, fast, `lookupCoverage matches getShapeCellCoverage at (${tc.x},${tc.y},${tc.rot})`);
  }
}

// --- getShapeCellCoverage with excludeCells ---
{
  // Use a center-grid position so the shape actually covers grid nodes
  const allCells = getShapeCellCoverage(0, 270, 150, 0);
  ok(allCells.length > 0, 'getShapeCellCoverage: diamond covers some cells');
  const exclude = new Set([allCells[0]]);
  const filtered = getShapeCellCoverage(0, 270, 150, 0, exclude);
  eq(filtered.length, allCells.length - 1, 'getShapeCellCoverage: excludeCells removes one cell');
  ok(!filtered.includes(allCells[0]), 'getShapeCellCoverage: excluded cell not in result');
}

// ============================================================
// enumGridCombos — pure algebraic
// ============================================================

{
  // Seed cells (col 9 or 10, idx 100-140) are: 109, 110, 129, 130
  // Adjacent grid nodes: 89[max=4], 90[max=4], 108[max=2], 111[max=2],
  //   128[max=1], 131[max=3], 149[max=1], 150[max=2]

  // Use seed cell 109 (max=1) and 110 (max=2) — both already "reachable" as seeds
  const baseGL = new Array(240).fill(0);
  baseGL[109] = 1; // already owned — makes this a reachable base

  // 1 point to spend on cell 110 (adjacent to 109, max=2)
  const combos1 = enumGridCombos([110], baseGL, 1);
  ok(combos1.length >= 1, 'enumGridCombos: 1pt on 1 cell yields result');
  eq(combos1[0].gl[110], 1, 'enumGridCombos: cell 110 gets +1');

  // 2 points on cell 110 (max=2)
  const combos2 = enumGridCombos([110], baseGL, 2);
  ok(combos2.length >= 1, 'enumGridCombos: 2pt on 1 cell (max=2) yields result');
  eq(combos2[0].gl[110], 2, 'enumGridCombos: cell 110 gets +2');

  // 3 points on cell 110 (max=2) → impossible
  const combos3 = enumGridCombos([110], baseGL, 3);
  eq(combos3.length, 0, 'enumGridCombos: 3pt on cell with cap 2 → no results');

  // 2 spendable cells, 2 points — all valid distributions
  // 110 (max=2), 129 (max=4, also seed → reachable)
  const combos4 = enumGridCombos([110, 129], baseGL, 2);
  ok(combos4.length > 0, 'enumGridCombos: 2pt on 2 cells yields results');
  // Distributions: (2,0), (1,1), (0,2) — all should be reachable
  const distributions = combos4.map(c => [c.gl[110], c.gl[129]]);
  ok(distributions.some(d => d[0] === 2 && d[1] === 0), 'enumGridCombos: (2,0) distribution exists');
  ok(distributions.some(d => d[0] === 1 && d[1] === 1), 'enumGridCombos: (1,1) distribution exists');
  ok(distributions.some(d => d[0] === 0 && d[1] === 2), 'enumGridCombos: (0,2) distribution exists');
  eq(combos4.length, 3, 'enumGridCombos: exactly 3 combos for 2pt/2cells');

  // Each combo spends exactly numPoints
  for (const c of combos4) {
    const spent = (c.gl[110] - baseGL[110]) + (c.gl[129] - baseGL[129]);
    eq(spent, 2, 'enumGridCombos: combo spends exactly 2 points');
  }

  // 0 points → 1 combo (do nothing)
  const combos0 = enumGridCombos([110, 129], baseGL, 0);
  eq(combos0.length, 1, 'enumGridCombos: 0 points → 1 combo (identity)');

  // steps array has correct length (one entry per point spent)
  for (const c of combos4) {
    eq(c.steps.length, 2, 'enumGridCombos: steps has 2 entries for 2pt spend');
  }

  // Reachability validation: unreachable nodes from seed are rejected
  // Cell 89 (row 4, col 9) is adjacent to seed 109 → reachable
  // But a cell that's NOT adjacent to any owned cell should be rejected
  // if it's the only spendable and no base nodes connect to it.
  const isolatedGL = new Array(240).fill(0);
  // No base owned and cell 50 (row 2, col 10) isn't adjacent to any seed
  // Seed cells: 109(r5,c9), 110(r5,c10), 129(r6,c9), 130(r6,c10)
  // Cell 50 is at row 2, col 10 — not adjacent to any seed
  if (RES_GRID_RAW[50]) {
    const isolatedCombos = enumGridCombos([50], isolatedGL, 1);
    eq(isolatedCombos.length, 0, 'enumGridCombos: isolated cell rejected by reachability');
  }
}

// ============================================================
// evalMagScoreWith — pure scoring function
// ============================================================

{
  // Minimal synthetic context: all zeros + just abm
  const gl = new Array(240).fill(0);
  const so = new Array(240).fill(-1);
  const il = new Array(43).fill(0);
  const occ = new Array(43).fill(0);
  const rLv = 10;
  const ctx = { abm: 1, c52: 0, stickerFixed: 0, boonyCount: 0,
                evShop37: 0, extPctExSticker: 0, hasComp55: false,
                hasComp0DivOk: false, hasComp54: false, evShop33: 0,
                evShop34: 0, evShop36: 0, mhq2: 0, mhq12: 0, mhq20: 0,
                spelunkyUpg7: 0, serverVarResXP: 0 };

  // No mags → score 0
  const score0 = evalMagScoreWith([], gl, so, il, occ, rLv, ctx);
  eq(score0, 0, 'evalMagScore: no mags → 0');

  // 1 regular mag on slot 0 but occ[0]=0 → score 0 (unmet occ)
  const mags1 = [{ type: 0, slot: 0, x: 0, y: 0 }];
  const score1 = evalMagScoreWith(mags1, gl, so, il, occ, rLv, ctx);
  eq(score1, 0, 'evalMagScore: occ not found → 0');

  // occ[0]=1, rLv >= OCC_DATA[0].roll → positive score
  const occ2 = occ.slice();
  occ2[0] = 1;
  const score2 = evalMagScoreWith(mags1, gl, so, il, occ2, rLv, ctx);
  const expectedBase = obsBaseExp(0);
  // With 0 insight and 0 kal, score = 1 * base * (1+0) * (1+0) = base
  approx(score2, expectedBase, 0.01, 'evalMagScore: 1 mag on found occ = obsBaseExp');

  // 2 regular mags on same slot → 2x score
  const mags2 = [{ type: 0, slot: 0, x: 0, y: 0 }, { type: 0, slot: 0, x: 0, y: 0 }];
  const score3 = evalMagScoreWith(mags2, gl, so, il, occ2, rLv, ctx);
  approx(score3, 2 * expectedBase, 0.01, 'evalMagScore: 2 mags → 2x score');

  // Monocle mags (type=1) don't contribute to score
  const magsM = [{ type: 1, slot: 0, x: 0, y: 0 }];
  const scoreM = evalMagScoreWith(magsM, gl, so, il, occ2, rLv, ctx);
  eq(scoreM, 0, 'evalMagScore: monocle mags → 0');

  // Kaleidoscope mags (type=2) don't directly score but boost adjacents
  const magsK = [{ type: 2, slot: 0, x: 0, y: 0 }];
  const scoreK = evalMagScoreWith(magsK, gl, so, il, occ2, rLv, ctx);
  eq(scoreK, 0, 'evalMagScore: kaleido-only → 0 (no regular mags)');

  // Insight bonus: il[0]=5, gd101 from grid node 93
  // With gl[93]=0 → gd101=0, so insight doesn't matter
  const il2 = il.slice();
  il2[0] = 5;
  const score4 = evalMagScoreWith(mags1, gl, so, il2, occ2, rLv, ctx);
  // gd101 = gbWith(gl, so, 93, ctx) = 0 (gl[93]=0)
  // score = base * (1 + 0*5/100) * (1+0) = base
  approx(score4, expectedBase, 0.01, 'evalMagScore: insight with gd101=0 → no bonus');

  // Score is non-negative for any configuration
  ok(score0 >= 0, 'evalMagScore: always non-negative (empty)');
  ok(score2 >= 0, 'evalMagScore: always non-negative (with mag)');
}

// ============================================================
// Integration tests with save data
// ============================================================

console.log('\nLoading save it.json...');
{
  const raw = await readFile(resolve(SAVES_DIR, 'it.json'), 'utf8');
  loadSaveData(JSON.parse(raw));
  console.log(`  S.researchLevel=${S.researchLevel}, S.magnifiersOwned=${S.magnifiersOwned}`);

  const saveCtx = buildSaveContext();
  const ctx = makeCtx(S.gridLevels, saveCtx);

  // --- computeCellValues ---
  console.log('\n--- computeCellValues ---');
  {
    const simOpts = {
      saveCtx,
      gridLevels: S.gridLevels,
      magData: saveCtx.magData,
      insightLvs: saveCtx.insightLvs,
      occFound: saveCtx.occFound,
      researchLevel: S.researchLevel,
    };
    const cv = computeCellValues(simOpts);
    eq(cv.length, GRID_SIZE, 'computeCellValues: returns 240 values');
    ok(cv.every(v => v >= 0), 'computeCellValues: all values non-negative');

    // Non-grid-node cells should be 0
    let nonNodeZero = true;
    for (let i = 0; i < GRID_SIZE; i++) {
      if (!RES_GRID_RAW[i] && cv[i] !== 0) { nonNodeZero = false; break; }
    }
    ok(nonNodeZero, 'computeCellValues: non-grid-node cells are 0');

    // At least some grid nodes with level > 0 should have >0 cell values
    let hasPositive = false;
    for (const idx of GRID_INDICES) {
      if ((S.gridLevels[idx] || 0) > 0 && cv[idx] > 0) { hasPositive = true; break; }
    }
    ok(hasPositive, 'computeCellValues: some owned grid nodes have positive value');
  }

  // --- optimizeShapePlacement ---
  console.log('\n--- optimizeShapePlacement ---');
  {
    const simOpts = {
      saveCtx,
      gridLevels: S.gridLevels,
      shapeOverlay: saveCtx.shapeOverlay,
      magData: saveCtx.magData,
      insightLvs: saveCtx.insightLvs,
      occFound: saveCtx.occFound,
      researchLevel: S.researchLevel,
    };
    const result = optimizeShapePlacement(simOpts);
    ok(result.placements !== undefined, 'optimizeShapePlacement: has placements');
    ok(result.cellValues !== undefined, 'optimizeShapePlacement: has cellValues');
    ok(result.optimizedOverlay !== undefined, 'optimizeShapePlacement: has optimizedOverlay');
    ok(typeof result.improvement === 'number', 'optimizeShapePlacement: improvement is number');
    ok(typeof result.optimizedTotal === 'number', 'optimizeShapePlacement: optimizedTotal is number');
    ok(typeof result.currentTotal === 'number', 'optimizeShapePlacement: currentTotal is number');

    // Placements should have required fields
    for (const p of result.placements) {
      ok(typeof p.shapeIdx === 'number', 'placement has shapeIdx');
      ok(typeof p.x === 'number', 'placement has x');
      ok(typeof p.y === 'number', 'placement has y');
      ok(typeof p.rot === 'number', 'placement has rot');
      ok(Array.isArray(p.cells), 'placement has cells array');
      ok(typeof p.bonusPct === 'number', 'placement has bonusPct');
    }

    // No cell overlap between placements
    const allCoveredCells = new Set();
    let hasOverlap = false;
    for (const p of result.placements) {
      for (const c of p.cells) {
        if (allCoveredCells.has(c)) { hasOverlap = true; break; }
        allCoveredCells.add(c);
      }
      if (hasOverlap) break;
    }
    ok(!hasOverlap, 'optimizeShapePlacement: no cell overlap between placements');

    // optimizedOverlay matches declared cells
    const ov = result.optimizedOverlay;
    eq(ov.length, GRID_SIZE, 'optimizeShapePlacement: overlay has 240 entries');
    for (let pi = 0; pi < result.placements.length; pi++) {
      for (const c of result.placements[pi].cells) {
        eq(ov[c], result.placements[pi].shapeIdx, `overlay[${c}] matches placement shapeIdx`);
      }
    }

    // improvement = optimizedTotal - currentTotal
    approx(result.improvement, result.optimizedTotal - result.currentTotal, 0.01,
      'optimizeShapePlacement: improvement = optimized - current');
  }

  // --- evalMagScoreWith with real data ---
  console.log('\n--- evalMagScoreWith (real data) ---');
  {
    const score = evalMagScoreWith(
      saveCtx.magData, S.gridLevels, saveCtx.shapeOverlay,
      saveCtx.insightLvs, saveCtx.occFound, S.researchLevel, ctx
    );
    ok(score > 0, 'evalMagScoreWith(real data): positive score');
    ok(typeof score === 'number' && isFinite(score), 'evalMagScoreWith(real data): finite number');
  }
}

// ============================================================
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
