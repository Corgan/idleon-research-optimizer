#!/usr/bin/env node
// CLI for Depth Charge Monte Carlo simulation.
//
// Usage:
//   node js/minehead/cli-sim.js [options]
//
// Options:
//   --floor N          floor number (default 0)
//   --trials N         number of simulations (default 1000)
//   --seed N           RNG seed (default 42)
//   --verbose          show per-turn breakdown for first 3 games
//   --optimize         find best tunable strategy params via grid search
//   --path N           find best N-step upgrade path via greedy search
//   --upg INDEX=LEVEL  set upgrade level (repeatable, e.g. --upg 0=10 --upg 2=5)
//   --svar N           server var A_MineHP (default 1)

import {
  simulateGame, monteCarloFloor, tunableStrategy,
  optimizeStrategy, OPTIMIZE_GRID, expandGrid,
  greedyUpgradePath, DEFAULT_PARAMS,
} from './sim.js';
import {
  minesOnFloor, floorHP, maxHPYou, gridDims, totalTiles,
  goldTilesTotal, blocksTotal, instaRevealsTotal, baseDMG,
  bonusDMGperTilePCT, bluecrownOdds, jackpotOdds, jackpotTiles,
  upgradeQTY,
} from './formulas.js';
import { MINEHEAD_UPG, MINEHEAD_NAMES } from './game-data.js';

// ---------- parse args ----------
const args = process.argv.slice(2);
function flag(name) { return args.includes('--' + name); }
function argVal(name, def) {
  const i = args.indexOf('--' + name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : def;
}
function allOpt(name) {
  const vals = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--' + name && i + 1 < args.length) vals.push(args[++i]);
  }
  return vals;
}

const floor    = Number(argVal('floor', 0));
const trials   = Number(argVal('trials', 1000));
const seed     = Number(argVal('seed', 42));
const svarHP   = Number(argVal('svar', 1));
const maxTurns = Number(argVal('maxturns', 200));
const verbose  = flag('verbose');
const doOptimize = flag('optimize');
const pathSteps = flag('path') ? Number(argVal('path', 10)) : 0;

// Build upgrade levels
const upgLevels = new Array(30).fill(0);
for (const pair of allOpt('upg')) {
  const [idx, lv] = pair.split('=').map(Number);
  if (idx >= 0 && idx < 30 && !isNaN(lv)) upgLevels[idx] = lv;
}

// ---------- print setup ----------
const bossName = (MINEHEAD_NAMES[floor] || `Boss ${floor}`).replace(/_/g, ' ');
const { cols, rows } = gridDims(upgLevels[2]);
const nTiles = cols * rows;
const mines = minesOnFloor(floor);
const hp = floorHP(floor, svarHP);
const lives = maxHPYou(upgLevels);
const goldens = goldTilesTotal(upgLevels);
const blocks = blocksTotal(upgLevels);
const instas = instaRevealsTotal(upgLevels);
const base = baseDMG(upgLevels, 0);
const perTile = bonusDMGperTilePCT(upgLevels, 0);

console.log('╔══════════════════════════════════════════════════════════╗');
console.log('║           DEPTH CHARGE — MONTE CARLO SIM               ║');
console.log('╚══════════════════════════════════════════════════════════╝');
console.log();
console.log(`  Floor:       ${floor} — ${bossName}`);
console.log(`  Boss HP:     ${Math.round(hp).toLocaleString()}`);
console.log(`  Grid:        ${cols}×${rows} = ${nTiles} tiles`);
console.log(`  Mines:       ${mines} (${(mines/nTiles*100).toFixed(1)}% of grid)`);
console.log(`  Lives:       ${lives}`);
console.log(`  Goldens:     ${goldens} / game (consumed on click)`);
console.log(`  Blocks:      ${blocks} / game`);
console.log(`  Instas:      ${instas} / game`);
console.log(`  Base DMG:    ${base.toFixed(2)}`);
console.log(`  Per-Tile %:  ${perTile.toFixed(1)}`);
console.log(`  Crown Odds:  ${(bluecrownOdds(upgLevels)*100).toFixed(2)}%`);
console.log(`  JP Odds:     ${(jackpotOdds(upgLevels)*100).toFixed(2)}%`);
console.log(`  Seed:        ${seed}`);
console.log(`  Max Turns:   ${maxTurns} (per game)`);
console.log(`  Trials:      ${trials}`);
console.log();

// Non-zero upgrades
const activeUpgs = upgLevels
  .map((lv, i) => lv > 0 ? `  [${i}] ${MINEHEAD_UPG[i].name} = ${lv}` : null)
  .filter(Boolean);
if (activeUpgs.length) {
  console.log('  Active Upgrades:');
  activeUpgs.forEach(s => console.log(s));
  console.log();
}

// ---------- mine probability analysis ----------
console.log('  First-click mine probability (after goldens):');
const safeAfterGolden = nTiles - mines - goldens;
const unknownAfterGolden = safeAfterGolden + mines;
if (unknownAfterGolden > 0) {
  console.log(`    ${mines}/${unknownAfterGolden} = ${(mines/unknownAfterGolden*100).toFixed(1)}%`);
} else {
  console.log('    0% (goldens cover all safe tiles)');
}
console.log();

// ---------- verbose: show first few games ----------
if (verbose) {
  console.log('── VERBOSE: First 3 games (turn-by-turn) ──────────────────');
  let rngV = mulberry32(seed);
  for (let g = 0; g < 3; g++) {
    const r = simulateGame({
      floor, upgLevels, svarHP, maxTurns, rng: rngV, verbose: true,
    });
    const status = r.won ? '✓ WIN' : r.timedOut ? '⏱ TIMEOUT' : '✗ LOSS';
    console.log(`\n  Game ${g+1}: ${status} | dmg=${r.totalDmg.toFixed(1)}/${Math.round(hp)} | turns=${r.turnsPlayed} | commits=${r.totalCommits} | mineHits=${r.mineHits} | 1stClkMines=${r.firstClickMines} | lives=${r.livesLeft}/${lives}`);
    if (r.turnLog) {
      const log = r.turnLog;
      const showMax = 30;
      const show = log.length <= showMax ? log : [...log.slice(0, 15), null, ...log.slice(-10)];
      for (const t of show) {
        if (t === null) {
          console.log(`    ... (${log.length - 25} turns omitted) ...`);
          continue;
        }
        const pct = (t.totalDmg / hp * 100).toFixed(0);
        const barLen = 30;
        const filled = Math.min(barLen, Math.round(t.totalDmg / hp * barLen));
        const bar = '█'.repeat(filled) + '░'.repeat(barLen - filled);
        console.log(`    T${String(t.turn).padStart(3)}  ${t.outcome.padEnd(7)} | tiles=${String(t.tilesRevealed).padStart(2)} (${t.goldensUsed}g+${t.instasUsed}i+${t.manualReveals}m) | dmg=${t.dmgThisTurn.toFixed(1).padStart(8)} | total=${t.totalDmg.toFixed(1).padStart(10)} [${bar}] ${pct}%`);
      }
    }
  }
  console.log();
}

// ---------- run sim ----------
if (doOptimize) {
  console.log('── STRATEGY OPTIMIZER ──────────────────────────────────────');
  const combos = expandGrid(OPTIMIZE_GRID);
  console.log(`  Parameter grid: ${combos.length} combos`);
  console.log(`  Screening: 200 trials each → refining top 5 with 2000 trials`);
  console.log();

  const t0 = Date.now();
  const opt = optimizeStrategy({
    floor, upgLevels, seed, gameOpts: { svarHP },
    onProgress: (done, total, phase) => {
      if (done % 20 === 0 || done === total) {
        process.stdout.write(`\r  [${phase}] ${done}/${total}`);
      }
    },
  });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  process.stdout.write('\r' + ' '.repeat(60) + '\r');

  console.log(`  Completed in ${elapsed}s\n`);
  console.log('  ── Top Results ──');
  for (let i = 0; i < opt.topResults.length; i++) {
    const { params: p, result: r } = opt.topResults[i];
    const winStr = (r.winRate * 100).toFixed(1);
    const dmgStr = r.avgDmg.toFixed(1);
    const dmgPct = (r.avgDmg / hp * 100).toFixed(2);
    console.log(`  #${i + 1}  Win=${winStr}%  AvgDmg=${dmgStr} (${dmgPct}%)  Turns=${r.avgTurns.toFixed(1)}  Commits=${r.avgCommits.toFixed(1)}  MnHits=${r.avgMineHits.toFixed(1)}  Dmg/Cmt=${r.avgDmgPerCommit.toFixed(1)}`);
    console.log(`       evMul=${p.evMultiplier}  minRev=${p.minReveal}  mineCap=${p.mineCapPct}  goldMine%=${p.goldenMinePct}  hpThr=${p.hpThreshold}  blkAggro=${p.blockAggro}  t1EV=${p.turn1EvMul}  crown=${p.crownChase}  insta=${p.instaMode}`);
  }

  // Compare against default params
  console.log('\n  ── Optimized vs Default ──');
  const defMC = monteCarloFloor({ floor, upgLevels, nTrials: 2000, seed, svarHP });
  const entries = [
    { name: '★ OPTIMIZED', r: opt.bestResult },
    { name: 'Default (EV 1.0)', r: defMC },
  ];
  const hdr = `${'Strategy'.padEnd(24)} ${'Win%'.padStart(7)} ${'AvgDmg'.padStart(10)} ${'AvgTrn'.padStart(7)} ${'Dmg/Cmt'.padStart(10)}`;
  console.log('  ' + hdr);
  console.log('  ' + '─'.repeat(hdr.length));
  for (const { name, r } of entries) {
    const style = name.startsWith('★') ? '\x1b[33m' : '';
    const reset = name.startsWith('★') ? '\x1b[0m' : '';
    console.log(`  ${style}${name.padEnd(24)} ${(r.winRate * 100).toFixed(1).padStart(6)}% ${r.avgDmg.toFixed(1).padStart(10)} ${r.avgTurns.toFixed(1).padStart(7)} ${r.avgDmgPerCommit.toFixed(1).padStart(10)}${reset}`);
  }
} else if (pathSteps > 0) {
  console.log('── UPGRADE PATH FINDER ────────────────────────────────────');
  console.log(`  Steps: ${pathSteps} | Trials: ${trials} per candidate`);
  console.log();

  // All non-maxed upgrades are candidates
  const candidates = [];
  for (let i = 0; i < MINEHEAD_UPG.length; i++) {
    const lv = upgLevels[i] || 0;
    if (lv < MINEHEAD_UPG[i].maxLv || MINEHEAD_UPG[i].maxLv > 998) {
      candidates.push(i);
    }
  }

  const t0 = Date.now();
  const result = greedyUpgradePath({
    floor, upgLevels, candidates,
    steps: pathSteps, nTrials: trials, seed, svarHP,
    onProgress: (step, total, cDone, cTotal) => {
      process.stdout.write(`\r  Step ${step + 1}/${total}: evaluating ${cDone}/${cTotal} upgrades`);
    },
  });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  process.stdout.write('\r' + ' '.repeat(60) + '\r');

  console.log(`  Completed in ${elapsed}s\n`);

  // Baseline
  const bWin = (result.baseline.winRate * 100).toFixed(1);
  const bDmg = result.baseline.avgDmg.toFixed(1);
  console.log(`  Baseline: Win=${bWin}%  AvgDmg=${bDmg}`);
  console.log();

  // Path table
  const hdr = `${'Step'.padStart(4)} ${'Upgrade'.padEnd(24)} ${'Win%'.padStart(7)} ${'AvgDmg'.padStart(10)} ${'AvgTrn'.padStart(7)} ${'Dmg/Cmt'.padStart(10)}`;
  console.log('  ' + hdr);
  console.log('  ' + '─'.repeat(hdr.length));
  for (const s of result.path) {
    const name = MINEHEAD_UPG[s.upgIdx].name.replace(/_/g, ' ');
    const winStr = (s.result.winRate * 100).toFixed(1);
    console.log(`  ${String(s.step).padStart(4)} ${name.padEnd(24)} ${(winStr + '%').padStart(7)} ${s.result.avgDmg.toFixed(1).padStart(10)} ${s.result.avgTurns.toFixed(1).padStart(7)} ${s.result.avgDmgPerCommit.toFixed(1).padStart(10)}`);
  }

  // Final
  console.log();
  const fWin = (result.finalResult.winRate * 100).toFixed(1);
  const fDmg = result.finalResult.avgDmg.toFixed(1);
  console.log(`  \x1b[33mFinal: Win=${fWin}%  AvgDmg=${fDmg}  (${result.finalResult.trials} trials)\x1b[0m`);
} else {
  console.log('── SIMULATION (default params) ─────────────────────────────');
  const mc = monteCarloFloor({
    floor, upgLevels, nTrials: trials, seed, svarHP,
  });
  console.log(`  Win Rate:          ${(mc.winRate*100).toFixed(1)}%`);
  console.log(`  Avg Damage:        ${mc.avgDmg.toFixed(1)} / ${Math.round(hp)}`);
  console.log(`  Avg Turns:         ${mc.avgTurns.toFixed(1)}`);
  console.log(`  Avg Commits:       ${mc.avgCommits.toFixed(1)}`);
  console.log(`  Avg Mine Hits:     ${mc.avgMineHits.toFixed(2)}`);
  console.log(`  Avg 1st-Click Mines: ${mc.avgFirstClickMines.toFixed(2)}`);
  console.log(`  Avg Blocks Used:   ${mc.avgBlocksUsed.toFixed(2)}`);
  console.log(`  Avg 1st Turn Dmg:  ${mc.avgFirstTurnDmg.toFixed(1)}`);
  console.log(`  Dmg/Commit:        ${mc.avgDmgPerCommit.toFixed(1)}`);
}

console.log();

// ---------- helper ----------
function mulberry32(seed) {
  let s = seed | 0;
  return () => {
    s |= 0; s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
