#!/usr/bin/env node
// Test suite for analysis.js functions: computeMagTypeBalance,
// _computeInsightCellValues, computeInsightROI, computeObsUnlockPriority.
//
// Usage:  node js/test-analysis.js

import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

import { loadSaveData } from '../save/loader.js';
import { buildSaveContext } from '../save/context.js';
import {  S  } from '../state.js';
import { GRID_SIZE } from '../game-data.js';
import {
  computeMagTypeBalance,
  computeInsightCellValues,
  computeInsightROI,
  computeObsUnlockPriority,
} from '../analysis.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SAVES_DIR = resolve(__dirname, '..', '..', 'saves');

let pass = 0, fail = 0;
function eq(a, b, label) {
  if (JSON.stringify(a) === JSON.stringify(b)) { pass++; }
  else { fail++; console.error(`FAIL: ${label}\n  got:      ${JSON.stringify(a)}\n  expected: ${JSON.stringify(b)}`); }
}
function ok(cond, label) {
  if (cond) { pass++; }
  else { fail++; console.error(`FAIL: ${label}`); }
}
function approx(a, b, tol, label) {
  if (Math.abs(a - b) < tol) { pass++; }
  else { fail++; console.error(`FAIL: ${label}\n  got: ${a}, expected: ${b} (tol=${tol})`); }
}

// ===== Load save =====
let _state, _saveCtx;
async function loadSave() {
  const raw = JSON.parse(await readFile(resolve(SAVES_DIR, 'it.json'), 'utf-8'));
  loadSaveData(raw);
  _saveCtx = buildSaveContext();
  _state = {
    gl: S.gridLevels, so: S.shapeOverlay, il: S.insightLvs,
    occ: S.occFound, rLv: S.researchLevel, mMax: S.magMaxPerSlot,
    mOwned: S.magnifiersOwned, md: S.magData, ip: S.insightProgress,
    failedRolls: S.cachedFailedRolls,
  };
}

// ===== computeMagTypeBalance =====
async function testMagTypeBalance() {
  console.log('--- computeMagTypeBalance ---');
  const t0 = performance.now();
  const results = await computeMagTypeBalance(_state, _saveCtx);
  const elapsed = ((performance.now() - t0) / 1000).toFixed(2);
  console.log(`  (${elapsed}s)`);

  // Structure: array of exactly 3 items
  eq(results.length, 3, 'magTypeBalance returns 3 results');

  // Each has required fields
  const typeNames = new Set();
  for (const r of results) {
    ok(typeof r.type === 'number' && r.type >= 0 && r.type <= 2, `type ${r.type} in [0,2]`);
    ok(['Magnifier', 'Monocle', 'Kaleidoscope'].includes(r.typeName), `typeName '${r.typeName}' valid`);
    ok(typeof r.count === 'number' && r.count >= 0, `count ${r.count} >= 0`);
    ok(typeof r.immediateExpHr === 'number' && r.immediateExpHr > 0, `immediateExpHr ${r.immediateExpHr} > 0`);
    ok(typeof r.deltaImmediate === 'number', `deltaImmediate is number`);
    typeNames.add(r.typeName);
  }
  // All three types present
  eq(typeNames.size, 3, 'all 3 mag types represented');

  // Results sorted by deltaImmediate descending
  ok(results[0].deltaImmediate >= results[1].deltaImmediate, 'sorted: [0] >= [1]');
  ok(results[1].deltaImmediate >= results[2].deltaImmediate, 'sorted: [1] >= [2]');

  // Deltas should all be positive (adding a mag always helps)
  for (const r of results) {
    ok(r.deltaImmediate > 0, `delta > 0 for ${r.typeName}`);
  }
}

// ===== _computeInsightCellValues =====
function testInsightCellValues() {
  console.log('--- _computeInsightCellValues ---');
  const t0 = performance.now();
  const gl = S.gridLevels, so = S.shapeOverlay, il = S.insightLvs;
  const pool = S.magData.slice(0, S.magnifiersOwned);
  // Find an obs slot that has at least one monocle (type=1), otherwise insight rate is 0
  const monoSlots = new Set(pool.filter(m => m.type === 1).map(m => m.slot));
  const obsIdx = monoSlots.size > 0 ? monoSlots.values().next().value : 0;
  const hasMonos = monoSlots.has(obsIdx);
  console.log(`  obsIdx=${obsIdx}, hasMonos=${hasMonos}`);
  const values = computeInsightCellValues(obsIdx, pool, il, gl, so, _saveCtx);
  const elapsed = ((performance.now() - t0) / 1000).toFixed(2);
  console.log(`  (${elapsed}s)`);

  // Structure: array of GRID_SIZE
  eq(values.length, GRID_SIZE, 'cellValues length == GRID_SIZE');

  // All values are numbers
  ok(values.every(v => typeof v === 'number' && isFinite(v)), 'all values are finite numbers');

  // If monocles target this slot, some cells should have positive insight delta
  if (hasMonos) {
    const positiveCount = values.filter(v => v > 0).length;
    ok(positiveCount > 0, `some cells have positive insight value (${positiveCount} cells)`);
  }

  // Cells with gridLevel 0 should have value 0
  for (let i = 0; i < GRID_SIZE; i++) {
    if ((gl[i] || 0) === 0) {
      eq(values[i], 0, `cell ${i} with lv0 has value 0`);
      break; // just check one
    }
  }
}

// ===== computeInsightROI =====
async function testInsightROI() {
  console.log('--- computeInsightROI ---');
  const t0 = performance.now();
  let progressCalls = 0;
  const result = await computeInsightROI(function(done, total) { progressCalls++; }, _state, _saveCtx);
  const elapsed = ((performance.now() - t0) / 1000).toFixed(2);
  console.log(`  (${elapsed}s, ${progressCalls} progress callbacks)`);

  // Structure
  ok(typeof result.monoCount === 'number', 'monoCount is number');

  if (result.monoCount === 0) {
    // No monocles → empty rows, that's fine
    eq(result.rows.length, 0, 'no rows when monoCount=0');
    console.log('  (no monocles - skipping detailed checks)');
    return;
  }

  ok(result.monoCount > 0, `monoCount ${result.monoCount} > 0`);
  ok(typeof result.baseRate === 'number' && result.baseRate > 0, `baseRate ${result.baseRate} > 0`);
  ok(Array.isArray(result.rows), 'rows is array');
  ok(result.rows.length > 0, `rows length ${result.rows.length} > 0`);
  ok(Array.isArray(result.baselineLayout), 'baselineLayout is array');
  ok(Array.isArray(result.baselineSO), 'baselineSO is array');

  // Check first row structure
  const row = result.rows[0];
  ok(typeof row.idx === 'number' && row.idx >= 0, `row.idx ${row.idx} >= 0`);
  ok(typeof row.name === 'string' && row.name.length > 0, `row.name '${row.name}' non-empty`);
  ok(typeof row.lv === 'number' && row.lv >= 0, `row.lv ${row.lv} >= 0`);
  ok(Array.isArray(row.scenarios), 'row.scenarios is array');
  ok(row.scenarios.length >= 1, `scenarios count ${row.scenarios.length} >= 1`);

  // Each scenario has required fields
  for (const s of row.scenarios) {
    ok(typeof s.grindHrs === 'number', 'scenario.grindHrs is number');
    ok(typeof s.grindRate === 'number', 'scenario.grindRate is number');
    ok(typeof s.postRate === 'number', 'scenario.postRate is number');
    ok(typeof s.breakEvenHrs === 'number', 'scenario.breakEvenHrs is number');
    ok(typeof s.lvGain === 'number' && s.lvGain >= 1, `scenario.lvGain ${s.lvGain} >= 1`);
  }

  // Rows sorted by breakEvenHrs ascending
  for (let i = 1; i < result.rows.length; i++) {
    const a = result.rows[i - 1].scenarios[0]?.breakEvenHrs ?? Infinity;
    const b = result.rows[i].scenarios[0]?.breakEvenHrs ?? Infinity;
    ok(a <= b, `rows sorted: [${i-1}] ${a} <= [${i}] ${b}`);
  }

  // Progress was called
  ok(progressCalls > 0, `progress callback fired (${progressCalls}x)`);
}

// ===== computeObsUnlockPriority =====
async function testObsUnlockPriority() {
  console.log('--- computeObsUnlockPriority ---');
  const t0 = performance.now();
  let progressCalls = 0;
  const result = await computeObsUnlockPriority(function(done, total) { progressCalls++; }, _state, _saveCtx);
  const elapsed = ((performance.now() - t0) / 1000).toFixed(2);
  console.log(`  (${elapsed}s, ${progressCalls} progress callbacks)`);

  // Structure
  ok(typeof result.currentTotal === 'number' && result.currentTotal > 0, `currentTotal ${result.currentTotal} > 0`);
  ok(typeof result.maxRoll === 'number' && result.maxRoll > 0, `maxRoll ${result.maxRoll} > 0`);
  ok(typeof result.rollsPerDay === 'number' && result.rollsPerDay >= 3, `rollsPerDay ${result.rollsPerDay} >= 3`);
  ok(typeof result.failedRolls === 'number' && result.failedRolls >= 0, `failedRolls ${result.failedRolls} >= 0`);
  ok(typeof result.smartEyeLv === 'number', 'smartEyeLv is number');
  ok(typeof result.smartEyeCap === 'number', 'smartEyeCap is number');
  ok(Array.isArray(result.results), 'results is array');

  // Should have some undiscovered observations
  const undiscoveredCount = S.occFound.filter((v, i) => (v || 0) < 1).length;
  // results.length should match undiscovered count (minus any OCC_DATA boundary)
  ok(result.results.length > 0, `results count ${result.results.length} > 0`);
  ok(result.results.length <= undiscoveredCount, `results count <= undiscovered obs`);

  // Check first result structure
  const r = result.results[0];
  ok(typeof r.idx === 'number' && r.idx >= 0, `result.idx ${r.idx} >= 0`);
  ok(typeof r.name === 'string' && r.name.length > 0, `result.name '${r.name}' non-empty`);
  ok(typeof r.rollThreshold === 'number', 'rollThreshold is number');
  ok(typeof r.requiredRLv === 'number', 'requiredRLv is number');
  ok(typeof r.canUseNow === 'boolean', 'canUseNow is boolean');
  ok(typeof r.pUnlockToday === 'number' && r.pUnlockToday >= 0 && r.pUnlockToday <= 1, `pUnlockToday ${r.pUnlockToday} in [0,1]`);
  ok(typeof r.expectedDays === 'number' && r.expectedDays > 0, `expectedDays ${r.expectedDays} > 0`);
  ok(typeof r.expGain === 'number', 'expGain is number');
  ok(typeof r.newRate === 'number', 'newRate is number');
  ok(typeof r.score === 'number', 'score is number');

  // canUseNow items should come before cannotUseNow (sort order)
  let seenCantUse = false;
  for (const r of result.results) {
    if (!r.canUseNow) seenCantUse = true;
    if (seenCantUse) ok(!r.canUseNow, `after canUseNow=false, no more canUseNow=true`);
  }

  // Within canUseNow group, sorted by score descending
  for (let i = 1; i < result.results.length; i++) {
    const a = result.results[i - 1], b = result.results[i];
    if (a.canUseNow && b.canUseNow) {
      ok(a.score >= b.score, `canUseNow group sorted by score: ${a.score} >= ${b.score}`);
    }
  }

  // Progress was called
  ok(progressCalls > 0, `progress callback fired (${progressCalls}x)`);
}

// ===== Main =====
async function main() {
  const t0 = performance.now();
  console.log('Loading save it.json...');
  await loadSave();
  console.log(`  S.researchLevel=${S.researchLevel}, S.magnifiersOwned=${S.magnifiersOwned}`);
  console.log('');

  await testMagTypeBalance();
  console.log('');
  testInsightCellValues();
  console.log('');
  await testInsightROI();
  console.log('');
  await testObsUnlockPriority();
  console.log('');

  const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
  console.log(`${pass} passed, ${fail} failed (${elapsed}s)`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  console.error(err.stack);
  process.exit(1);
});
