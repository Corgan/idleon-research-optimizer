#!/usr/bin/env node
// Regression test suite for unifiedSim.
// Runs multiple scenarios against saves/, compares to golden snapshots.
//
// Usage:
//   node js/test-regression.js            - run all scenarios, compare to snapshots
//   node js/test-regression.js --update   - regenerate golden snapshot files
//   node js/test-regression.js --update scenario-name  - update one snapshot only
//
// Each scenario loads a save, runs unifiedSim with specific flags, and compares
// the output (phase count, events, rates, times, grind decisions) against a
// stored golden .json in js/snapshots/.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

import { loadSaveData } from '../save/loader.js';
import { unifiedSim } from '../sim-engine.js';
import { buildSaveContext } from '../save/context.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAP_DIR = resolve(__dirname, '..', 'snapshots');
const SAVES_DIR = resolve(__dirname, '..', '..', 'saves');

// ===== Scenario definitions =====
const SCENARIOS = [
  {
    name: 'it-lv50-grind',
    save: 'it.json',
    desc: 'LV 50, grind ON',
    simConfig: {
      target: { type: 'level', value: 50 },
      reoptimize: true,
      enableGrind: true,
      assumeObsUnlocked: false,
      extendInsightLA: true,
    },
  },
  {
    name: 'it-lv50-nogrind',
    save: 'it.json',
    desc: 'LV 50, grind OFF',
    simConfig: {
      target: { type: 'level', value: 50 },
      reoptimize: true,
      enableGrind: false,
      assumeObsUnlocked: false,
      extendInsightLA: true,
    },
  },
  {
    name: 'it-lv55-grind',
    save: 'it.json',
    desc: 'LV 55, grind ON',
    simConfig: {
      target: { type: 'level', value: 55 },
      reoptimize: true,
      enableGrind: true,
      assumeObsUnlocked: false,
      extendInsightLA: true,
    },
  },
  {
    name: 'it-hrs48',
    save: 'it.json',
    desc: '48h time-bound',
    simConfig: {
      target: { type: 'hours', value: 48 },
      reoptimize: true,
      enableGrind: true,
      assumeObsUnlocked: false,
      extendInsightLA: true,
    },
  },
  {
    name: 'it-lv50-assume',
    save: 'it.json',
    desc: 'LV 50, assume obs unlocked',
    simConfig: {
      target: { type: 'level', value: 50 },
      reoptimize: true,
      enableGrind: true,
      assumeObsUnlocked: true,
      extendInsightLA: true,
    },
  },
];

// ===== Extract comparable summary from sim result =====
function extractSummary(result) {
  const { phases, totalTime, finalLevel, finalExp } = result;
  return {
    phaseCount: phases.length,
    finalLevel,
    totalTime: round6(totalTime),
    finalExp: round6(finalExp),
    phases: phases.map(p => ({
      time:    round6(p.time),
      event:   p.event,
      rLv:     p.rLv,
      expHr:   round6(p.expHr),
      grind:   p.grindInfo ? {
        obsIdx:       p.grindInfo.obsIdx,
        obsName:      p.grindInfo.obsName,
        newInsightLv: p.grindInfo.newInsightLv,
        grindHrs:     round6(p.grindInfo.grindHrs),
        breakEvenHrs: round6(p.grindInfo.breakEvenHrs),
        grindExpHr:   round6(p.grindInfo.grindExpHr),
      } : null,
    })),
  };
}

function round6(n) {
  return Math.round(n * 1e6) / 1e6;
}

// ===== Diff two summaries =====
// Returns array of { path, expected, actual } differences
function diffSummaries(expected, actual) {
  const diffs = [];

  function check(path, exp, act, tolerance) {
    if (typeof exp === 'number' && typeof act === 'number') {
      if (tolerance != null) {
        if (Math.abs(exp - act) > tolerance) {
          diffs.push({ path, expected: exp, actual: act, tolerance });
        }
      } else if (exp !== act) {
        diffs.push({ path, expected: exp, actual: act });
      }
    } else if (exp !== act) {
      diffs.push({ path, expected: exp, actual: act });
    }
  }

  check('phaseCount', expected.phaseCount, actual.phaseCount);
  check('finalLevel', expected.finalLevel, actual.finalLevel);
  check('totalTime', expected.totalTime, actual.totalTime, 0.02);
  check('finalExp', expected.finalExp, actual.finalExp, actual.finalExp * 0.01);

  const maxPhases = Math.max(expected.phases.length, actual.phases.length);
  for (let i = 0; i < maxPhases; i++) {
    const ep = expected.phases[i];
    const ap = actual.phases[i];
    const pre = `phases[${i}]`;

    if (!ep) { diffs.push({ path: `${pre}`, expected: 'missing', actual: ap.event }); continue; }
    if (!ap) { diffs.push({ path: `${pre}`, expected: ep.event, actual: 'missing' }); continue; }

    check(`${pre}.event`, ep.event, ap.event);
    check(`${pre}.rLv`, ep.rLv, ap.rLv);
    check(`${pre}.time`, ep.time, ap.time, 0.02);
    check(`${pre}.expHr`, ep.expHr, ap.expHr, Math.max(Math.abs(ep.expHr) * 0.001, 1));

    // Grind presence must match
    if (!!ep.grind !== !!ap.grind) {
      diffs.push({ path: `${pre}.grind`, expected: ep.grind ? 'present' : 'absent', actual: ap.grind ? 'present' : 'absent' });
    } else if (ep.grind && ap.grind) {
      check(`${pre}.grind.obsIdx`, ep.grind.obsIdx, ap.grind.obsIdx);
      check(`${pre}.grind.newInsightLv`, ep.grind.newInsightLv, ap.grind.newInsightLv);
      check(`${pre}.grind.grindHrs`, ep.grind.grindHrs, ap.grind.grindHrs, 0.1);
      check(`${pre}.grind.breakEvenHrs`, ep.grind.breakEvenHrs, ap.grind.breakEvenHrs, 0.2);
      check(`${pre}.grind.grindExpHr`, ep.grind.grindExpHr, ap.grind.grindExpHr, Math.max(Math.abs(ep.grind.grindExpHr) * 0.001, 1));
    }
  }

  return diffs;
}

// ===== Run a single scenario =====
async function runScenario(scenario) {
  // Load save fresh (populates global state)
  const saveText = await readFile(resolve(SAVES_DIR, scenario.save), 'utf-8');
  loadSaveData(JSON.parse(saveText));
  const saveCtx = buildSaveContext();

  const result = await unifiedSim(scenario.simConfig, saveCtx);
  return extractSummary(result);
}

// ===== Main =====
async function main() {
  const args = process.argv.slice(2);
  const updateMode = args.includes('--update');
  const updateOnly = updateMode && args.length > 1
    ? args.find(a => a !== '--update')
    : null;

  await mkdir(SNAP_DIR, { recursive: true });

  let pass = 0, fail = 0, updated = 0;
  const t0 = performance.now();

  for (const scenario of SCENARIOS) {
    if (updateOnly && scenario.name !== updateOnly) continue;

    const snapPath = resolve(SNAP_DIR, scenario.name + '.json');
    process.stdout.write(`  ${scenario.name.padEnd(22)} `);

    try {
      const st = performance.now();
      const actual = await runScenario(scenario);
      const elapsed = ((performance.now() - st) / 1000).toFixed(1);

      if (updateMode) {
        await writeFile(snapPath, JSON.stringify(actual, null, 2) + '\n');
        console.log(`UPDATED  (${elapsed}s) - ${actual.phaseCount} phases, LV ${actual.finalLevel}`);
        updated++;
      } else {
        let expected;
        try {
          expected = JSON.parse(await readFile(snapPath, 'utf-8'));
        } catch {
          console.log(`SKIP - no snapshot (run --update to create)`);
          continue;
        }

        const diffs = diffSummaries(expected, actual);
        if (diffs.length === 0) {
          console.log(`PASS  (${elapsed}s)`);
          pass++;
        } else {
          console.log(`FAIL  (${elapsed}s) - ${diffs.length} difference(s):`);
          for (const d of diffs.slice(0, 10)) {
            const tolStr = d.tolerance != null ? ` (tol=${d.tolerance})` : '';
            console.log(`         ${d.path}: expected ${d.expected}, got ${d.actual}${tolStr}`);
          }
          if (diffs.length > 10) console.log(`         ... and ${diffs.length - 10} more`);
          fail++;
        }
      }
    } catch (err) {
      console.log(`ERROR - ${err.message}`);
      fail++;
    }
  }

  const totalElapsed = ((performance.now() - t0) / 1000).toFixed(1);
  console.log('');

  if (updateMode) {
    console.log(`Updated ${updated} snapshot(s) in ${totalElapsed}s`);
  } else {
    console.log(`${pass} passed, ${fail} failed (${totalElapsed}s)`);
    process.exit(fail > 0 ? 1 : 0);
  }
}

main().catch(err => {
  console.error('Fatal:', err.message);
  console.error(err.stack);
  process.exit(1);
});
