#!/usr/bin/env node
// CLI tool for running the research optimizer sim from the command line.
// Usage:
//   node js/cli-sim.js <save.json> --level 55
//   node js/cli-sim.js <save.json> --hours 120
//   node js/cli-sim.js <save.json> --level 55 --no-grind
//   node js/cli-sim.js <save.json> --level 55 --assume-obs
//
// Flags:
//   --level N       Target research level (default: current + 5)
//   --hours N       Target hours to simulate
//   --no-grind      Disable insight grind planner (greedy monocle spread only)
//   --assume-obs    Assume all observations unlock at their required level
//   --quiet         Only print final summary, not per-phase details

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { RES_GRID_RAW, gridCoord, obsName } from './game-data.js';
import { unifiedSim } from './sim-engine.js';
import { buildSaveContext } from './save/context.js';
import { fmtTime, fmtExp, fmtVal } from './renderers/format.js';
import { loadSaveData } from './save/loader.js';
import { diffPhaseConfigs, diffMDLayouts } from './phase-diff.js';

// ===== Arg parsing =====
const args = process.argv.slice(2);
let savePath = null;
let targetLevel = null;
let targetHours = null;
let enableGrind = true;
let assumeObs = false;
let quiet = false;
let verbose = false;

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--level' && args[i + 1]) { targetLevel = Number(args[++i]); }
  else if (a === '--hours' && args[i + 1]) { targetHours = Number(args[++i]); }
  else if (a === '--no-grind') { enableGrind = false; }
  else if (a === '--assume-obs') { assumeObs = true; }
  else if (a === '--quiet') { quiet = true; }
  else if (a === '--verbose' || a === '-v') { verbose = true; }
  else if (a === '--help' || a === '-h') { printUsage(); process.exit(0); }
  else if (!a.startsWith('-')) { savePath = a; }
  else { console.error(`Unknown flag: ${a}`); printUsage(); process.exit(1); }
}

function printUsage() {
  console.log(`Usage: node js/cli-sim.js <save.json|it.json> [options]

Options:
  --level N       Target research level
  --hours N       Simulate for N hours
  --no-grind      Disable insight grind planner (greedy spread only)
  --assume-obs    Assume unrolled observations unlock at their level req
  --verbose, -v   Print detailed diffs per phase (grid, mags, monos, insight)
  --quiet         Only print final summary
  --help          Show this help`);
}

if (!savePath) {
  console.error('Error: No save file specified.');
  printUsage();
  process.exit(1);
}

// ===== Load save =====
async function loadSave(filePath) {
  const text = await readFile(resolve(filePath), 'utf-8');
  const raw = JSON.parse(text);
  loadSaveData(raw);
  return buildSaveContext();
}

// ===== Phase detail printing (text-based, for --verbose) =====

function fmtMove(slot, delta) {
  const name = obsName(slot);
  return delta > 0 ? `+${delta} → ${name}` : `-${-delta} from ${name}`;
}

function printPhaseDetails(diff, p, prev) {
  const indent = '      ';

  if (diff.rLv) console.log(`${indent}Research LV ${diff.rLv.from} → ${diff.rLv.to}`);
  if (diff.magCap) console.log(`${indent}Max mags/slot: ${diff.magCap.from} → ${diff.magCap.to}`);

  // Grid
  for (const goal of Object.keys(diff.grid)) {
    const nodes = diff.grid[goal].map(n =>
      `${gridCoord(n.idx)} ${RES_GRID_RAW[n.idx][0].replace(/_/g, ' ')} ${n.from}→${n.to}`
    ).join(', ');
    console.log(`${indent}Grid [${goal}]: ${nodes}`);
  }

  // Shapes
  if (diff.shapes) console.log(`${indent}Shapes: ${diff.shapes.count} cells changed`);

  // Mags
  if (diff.mags.moves.length > 0) {
    console.log(`${indent}Mags: ${diff.mags.moves.map(m => fmtMove(m.slot, m.delta)).join('  ')}`);
  }

  // Kals
  if (diff.kals.moves.length > 0) {
    console.log(`${indent}Kaleido: ${diff.kals.moves.map(m => fmtMove(m.slot, m.delta)).join('  ')}`);
  }

  // Monos
  if (diff.monos.changed && diff.monos.moves.length > 0) {
    console.log(`${indent}Monocle: ${diff.monos.moves.map(m => fmtMove(m.slot, m.delta)).join('  ')}`);
  } else if (diff.monos.changed && p.event === 'start') {
    const targets = Object.entries(diff.monos.curGroups).map(([s, c]) => c > 1 ? `${c}× ${obsName(s)}` : obsName(s)).join(', ');
    console.log(`${indent}Monocle → ${targets}`);
  }

  // Insight
  if (diff.insight.length > 0) {
    console.log(`${indent}Insight: ${diff.insight.map(c => `${obsName(c.obs)} ${c.from}→${c.to}`).join(', ')}`);
  }

  // Grind info
  if (p.grindInfo) {
    const gi = p.grindInfo;
    console.log(`${indent}Insight Grind: ${gi.obsName} → LV ${gi.newInsightLv}  (${fmtTime(gi.grindHrs)}, break-even ${fmtTime(gi.breakEvenHrs)})`);
    const baseMD = prev.activeConfig ? prev.activeConfig.md : prev.config.md;
    const gd = diffMDLayouts(baseMD, gi.grindMD);
    if (gd.mags.length) console.log(`${indent}  Grind mags: ${gd.mags.map(m => fmtMove(m.slot, m.delta)).join('  ')}`);
    if (gd.kals.length) console.log(`${indent}  Grind kaleido: ${gd.kals.map(m => fmtMove(m.slot, m.delta)).join('  ')}`);
    if (gd.monos.length) console.log(`${indent}  Grind monocle: ${gd.monos.map(m => fmtMove(m.slot, m.delta)).join('  ')}`);
  }
}

// ===== Main =====
async function main() {
  console.log(`Loading save: ${savePath}`);
  const saveCtx = await loadSave(savePath);

  console.log(`Research LV ${saveCtx.researchLevel}, ${saveCtx.magnifiersOwned} magnifiers, ext bonus ${saveCtx.externalResearchPct.toFixed(1)}%`);

  const target = targetLevel != null
    ? { type: 'level', value: targetLevel }
    : targetHours != null
      ? { type: 'hours', value: targetHours }
      : { type: 'level', value: saveCtx.researchLevel + 5 };

  const label = target.type === 'level' ? `LV ${target.value}` : `${target.value}h`;
  const grindLabel = enableGrind ? 'grind ON' : 'grind OFF';
  console.log(`\nTarget: ${label} | ${grindLabel} | assume-obs: ${assumeObs}`);
  console.log('─'.repeat(70));

  const t0 = performance.now();
  const sim = await unifiedSim({
    target,
    reoptimize: true,
    enableGrind,
    assumeObsUnlocked: assumeObs,
    extendInsightLA: true,
    onProgress: !quiet ? (p) => {
      if (p.subStage) process.stdout.write(`\r  ${p.subStage.replace(/[\u2026]/g, '...').padEnd(50)}`);
    } : undefined,
  }, saveCtx);
  const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
  if (!quiet) process.stdout.write('\r' + ' '.repeat(55) + '\r');

  const { phases, totalTime, finalLevel, finalExp } = sim;

  if (!quiet) {
    console.log('');
    console.log(`  ${'Time'.padEnd(12)} ${'Event'.padEnd(22)} ${'Rate'.padEnd(14)} ${'Delta'.padEnd(18)} ${'Grind'.padEnd(0)}`);
    console.log('  ' + '─'.repeat(68));

    for (let i = 0; i < phases.length; i++) {
      const p = phases[i];
      const prev = i > 0 ? phases[i - 1] : null;
      const displayRate = p.grindInfo ? p.grindInfo.grindExpHr : p.expHr;
      const prevRate = prev ? (prev.grindInfo ? prev.grindInfo.grindExpHr : prev.expHr) : displayRate;
      const delta = prev ? displayRate - prevRate : 0;
      const deltaPct = prevRate > 0 ? (delta / prevRate * 100) : 0;
      const deltaStr = Math.abs(delta) > 0.5
        ? `${delta > 0 ? '+' : ''}${fmtVal(delta)}/hr (${delta > 0 ? '+' : ''}${deltaPct.toFixed(1)}%)`
        : '';

      let eventLabel = p.event;
      if (p.event === 'start') eventLabel = 'Initial Optimization';
      else if (p.event === 'level-up') eventLabel = `Level Up (LV ${p.rLv})`;
      else if (p.event === 'insight-up') eventLabel = 'Insight Level Up';
      else if (p.event === 'level+insight') eventLabel = `Level+Insight (${p.rLv})`;
      else if (p.event === 'end') eventLabel = 'End State';

      const grindStr = p.grindInfo
        ? `grind ${p.grindInfo.obsName} → LV ${p.grindInfo.newInsightLv} (${fmtTime(p.grindInfo.grindHrs)} / be ${fmtTime(p.grindInfo.breakEvenHrs)})`
        : '';

      const timeStr = fmtTime(p.time).padEnd(12);
      const evStr = eventLabel.padEnd(22);
      const rateStr = (fmtVal(displayRate) + '/hr').padEnd(14);

      console.log(`  ${timeStr} ${evStr} ${rateStr} ${deltaStr.padEnd(18)} ${grindStr}`);

      if (verbose && prev) {
        const diff = diffPhaseConfigs(prev, p);
        printPhaseDetails(diff, p, prev);
      }
    }
  }

  // Summary
  console.log('');
  console.log('═'.repeat(70));
  const lastRate = phases.length > 0 ? (phases[phases.length - 1].event === 'end' ? (phases[phases.length - 2]?.expHr || 0) : phases[phases.length - 1].expHr) : 0;
  console.log(`  Final: LV ${finalLevel} at ${fmtTime(totalTime)}  |  ${fmtVal(lastRate)}/hr`);

  let totalExp = 0;
  for (let i = 0; i < phases.length - 1; i++) {
    const dur = phases[i + 1].time - phases[i].time;
    const rate = phases[i].grindInfo ? phases[i].grindInfo.grindExpHr : phases[i].expHr;
    totalExp += rate * dur;
  }
  const avgRate = totalTime > 0 ? totalExp / totalTime : 0;
  const grindPhases = phases.filter(p => p.grindInfo).length;
  console.log(`  Total EXP: ${fmtExp(totalExp)}  |  Avg: ${fmtVal(avgRate)}/hr  |  Grinds: ${grindPhases}  |  Sim: ${elapsed}s`);
  console.log('═'.repeat(70));
}

main().catch(err => {
  console.error('Fatal:', err.message);
  console.error(err.stack);
  process.exit(1);
});
