// Tests for js/minehead/ — formulas, game data, and simulation.
import {
  MINEHEAD_UPG, GRID_DIMS, TILE_MULTIPLIERS, MINEHEAD_BONUS_QTY as FLOOR_REWARD_QTY,
  MINEHEAD_UNLOCK_ORDER
} from '../stats/data/w7/minehead.js';
import {
  upgLvReq, upgradeQTY, upgCost, canBuyUpg,
  gridDims, totalTiles, maxHPYou, floorHP, minesOnFloor, dailyTries,
  baseDMG, bonusDMGperTilePCT, bluecrownMulti, bluecrownOdds,
  jackpotOdds, jackpotTiles, currentOutgoingDMG, currencyPerHour,
  glimboCost, goldTilesTotal, blocksTotal, flagsTotal, instaRevealsTotal,
} from '../stats/systems/w7/minehead.js';
import { simulateGame, monteCarloFloor, generateGrid, DEFAULT_PARAMS, greedyUpgradePath } from '../minehead/sim.js';

let _pass = 0, _fail = 0;
function eq(a, b, label) {
  if (typeof a === 'number' && typeof b === 'number') {
    if (Math.abs(a - b) < 1e-6 || (Math.abs(a - b) / Math.max(1, Math.abs(b))) < 1e-6) {
      _pass++; return;
    }
  } else if (a === b) { _pass++; return; }
  _fail++;
  console.error(`FAIL: ${label}  got=${a}  expected=${b}`);
}
function approx(a, b, tol, label) {
  if (Math.abs(a - b) <= tol) { _pass++; return; }
  _fail++;
  console.error(`FAIL: ${label}  got=${a}  expected≈${b}  tol=${tol}`);
}
function ok(cond, label) {
  if (cond) { _pass++; return; }
  _fail++;
  console.error(`FAIL: ${label}`);
}

// ============ game-data sanity checks ============
console.log('--- game-data ---');
eq(MINEHEAD_UPG.length, 30, '30 upgrades');
eq(MINEHEAD_UPG[0].name, 'Base_Damage_I', 'first upgrade name');
eq(MINEHEAD_UPG[29].name, "Rift_Guy's_Upgrade", 'last upgrade name');
eq(MINEHEAD_UPG[6].maxLv, 7, 'Extra_Lives maxLv=7');
eq(GRID_DIMS.length, 17, '17 grid dimension entries');
eq(GRID_DIMS[0], '3,3', 'first grid = 3x3');
eq(GRID_DIMS[16], '12,6', 'last grid = 12x6');
eq(TILE_MULTIPLIERS[0], 1.2, 'tile multi for value 20 = 1.2');
eq(TILE_MULTIPLIERS[3], 2.0, 'tile multi for value 23 = 2.0');
eq(FLOOR_REWARD_QTY.length, 32, '32 reward QTY entries');
eq(FLOOR_REWARD_QTY[0], 10, 'reward[0] = 10');
eq(MINEHEAD_UNLOCK_ORDER.length, 32, '32 unlock order entries');

// ============ formulas ============
console.log('--- formulas ---');

// upgLvReq
eq(upgLvReq(0), 1, 'upgLvReq(0)=1');
eq(upgLvReq(1), 4, 'upgLvReq(1)=4');
eq(upgLvReq(3), 11, 'upgLvReq(3)=1+9+1+0=11');
eq(upgLvReq(11), 38, 'upgLvReq(11)=1+33+3+1=38');

// upgradeQTY
eq(upgradeQTY(0, 5), 5, 'qty(0, lv5) = 1*5 = 5');
eq(upgradeQTY(4, 10), 50, 'qty(4, lv10) = 5*10 = 50');

// gridDims
const g0 = gridDims(0);
eq(g0.cols, 3, 'grid lv0 cols=3');
eq(g0.rows, 3, 'grid lv0 rows=3');
const g16 = gridDims(16);
eq(g16.cols, 12, 'grid lv16 cols=12');
eq(g16.rows, 6, 'grid lv16 rows=6');
eq(totalTiles(0), 9, 'totalTiles(0)=9');
eq(totalTiles(16), 72, 'totalTiles(16)=72');

// HP / lives
const zeroLvs = new Array(30).fill(0);
eq(maxHPYou(zeroLvs), 3, 'maxHP with no upgrades = 3');
const withLives = zeroLvs.slice();
withLives[6] = 5;
eq(maxHPYou(withLives), 8, 'maxHP with 5 lives upgrades = 8');

// floorHP
ok(floorHP(0) > 0, 'floorHP(0) > 0');
ok(floorHP(5) > floorHP(0), 'floorHP(5) > floorHP(0)');
approx(floorHP(0), (5 + 0) * 1, 0.01, 'floorHP(0)=5');
// floor 1: (5+2+1) * 1.8^1 = 8*1.8 = 14.4
approx(floorHP(1), 14.4, 0.01, 'floorHP(1)≈14.4');

// minesOnFloor
eq(minesOnFloor(0), 1, 'mines floor 0 = 1');
eq(minesOnFloor(3), 2, 'mines floor 3 = 1+1 = 2');
// floor 7: 1 + floor(7/3) + floor(7/7) + floor(7/13) + min(1,floor(7/15)) + floor(7/17)
//        = 1 + 2 + 1 + 0 + 0 + 0 = 4
eq(minesOnFloor(7), 4, 'mines floor 7 = 4');

// dailyTries
eq(dailyTries(0), 3, 'dailyTries with no grid bonus = 3');
eq(dailyTries(2), 5, 'dailyTries with gridBonus147_1=2 → 5');

// baseDMG
eq(baseDMG(zeroLvs, 0), 1, 'baseDMG with no upgrades = 1');
const dmgLvs = zeroLvs.slice();
dmgLvs[0] = 10; // Base_Damage_I: qty0 = 10*1 = 10
dmgLvs[4] = 5;  // Mega_Damage_I: qty4 = 5*5 = 25
approx(baseDMG(dmgLvs, 0), (1+10) * (1+25/100), 0.001, 'baseDMG with upgrades');

// bonusDMGperTilePCT
eq(bonusDMGperTilePCT(zeroLvs, 0), 0, 'bonusDMG with nothing = 0');
const comboLvs = zeroLvs.slice();
comboLvs[9] = 10; // Big_Hit_Combos: 1*10 = 10
eq(bonusDMGperTilePCT(comboLvs, 5), 15, 'bonusDMG = 10 + 5 = 15');

// bluecrownMulti / bluecrownOdds
eq(bluecrownMulti(zeroLvs), 1.5, 'bluecrownMulti base = 1.5');
eq(bluecrownOdds(zeroLvs), 0, 'bluecrownOdds = 0 if upgrade 14 not bought');
const crownLvs = zeroLvs.slice();
crownLvs[14] = 1; // Triple_Crown_Hunter: qty14 = 1*1 = 1
ok(bluecrownOdds(crownLvs) > 0, 'bluecrownOdds > 0 with upg 14');
ok(bluecrownOdds(crownLvs) <= 0.1, 'bluecrownOdds <= 0.1');

// jackpotOdds
eq(jackpotOdds(zeroLvs), 0, 'jackpotOdds = 0 if not bought');
const jpLvs = zeroLvs.slice();
jpLvs[23] = 1; // Jackpot_Time: qty23 = 1
ok(jackpotOdds(jpLvs) > 0, 'jackpotOdds > 0');
eq(jackpotTiles(zeroLvs), 3, 'jackpotTiles base = 3');

// currentOutgoingDMG
// Simple case: reveal tiles [3, 5] with no upgrades, no crowns, not last life
const dmg1 = currentOutgoingDMG([3, 5], 0, false, zeroLvs);
// addSum = 8, baseDMG = 1, multiProd = 1, wepPow = 0, tileCount = 2, bonusPCT = 0
// = 8 * 1 * 1 * 1 * 1 * 1 = 8
eq(dmg1, 8, 'currentOutgoingDMG [3,5] no upgrades = 8');

// With a multiplier tile
const dmg2 = currentOutgoingDMG([5, 20], 0, false, zeroLvs);
// addSum=5, multiProd=1.2, base=1, tiles=2
// = 5 * 1 * 1.2 = 6
approx(dmg2, 6, 0.001, 'currentOutgoingDMG [5,20] = 6');

// upgCost
ok(upgCost(0, 0, 0) > 0, 'upgCost(0,0,0) > 0');
ok(upgCost(0, 10, 0) > upgCost(0, 0, 0), 'cost increases with level');
ok(upgCost(5, 0, 0) > upgCost(0, 0, 0), 'higher index = higher base cost');
// El' Cheapo discount
ok(upgCost(0, 5, 50) < upgCost(0, 5, 0), 'El Cheapo reduces cost');

// canBuyUpg
ok(!canBuyUpg(0, 0, 0, 0), 'cant buy with 0 mine currency');
ok(canBuyUpg(0, 0, 1e9, 0), 'can buy with lots of mine currency');
ok(!canBuyUpg(29, 0, 1e9, 0), 'cant buy Rift Guy (maxLv=0)');

// glimboCost
ok(glimboCost(0, 0, 1.06) > 0, 'glimbo cost > 0');
ok(glimboCost(0, 5, 1.06) > glimboCost(0, 0, 1.06), 'glimbo cost increases with trades');

// goldTilesTotal, blocksTotal, flagsTotal, instaRevealsTotal
eq(goldTilesTotal(zeroLvs), 0, 'goldTiles with no upgrades = 0');
eq(blocksTotal(zeroLvs), 0, 'blocks with no upgrades = 0');
eq(flagsTotal(zeroLvs), 0, 'flags with no upgrades = 0');
eq(instaRevealsTotal(zeroLvs), 0, 'instaReveals with no upgrades = 0');

// ============ simulation ============
console.log('--- simulation ---');

// Seeded PRNG for deterministic tests
function mulberry32(seed) {
  let s = seed | 0;
  return () => {
    s |= 0; s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Run a single game on floor 0 with no upgrades (moderate strategy)
const result0 = simulateGame({ floor: 0, upgLevels: zeroLvs, rng: mulberry32(42) });
ok(typeof result0.won === 'boolean', 'simulateGame returns won boolean');
ok(result0.totalDmg >= 0, 'totalDmg >= 0');
ok(result0.turnsPlayed >= 1, 'turnsPlayed >= 1');
ok(result0.floorHP > 0, 'floorHP > 0');
eq(result0.floorHP, floorHP(0), 'floorHP matches formula');
ok(result0.totalCommits >= 0, 'totalCommits >= 0');

// --- Correct mechanics: mine hit = 0 damage committed ---
// With a strategy that always reveals (never attacks voluntarily),
// every mine hit should cost a life with 0 damage.
// tunableStrategy with minReveal=999 always reveals until no tiles remain.
const alwaysRevealStrat = tunableStrategy({ minReveal: 999 });
const lotsOfLives = zeroLvs.slice();
lotsOfLives[6] = 97; // 100 lives — enough to survive many mine hits
const rMech = simulateGame({
  floor: 0, upgLevels: lotsOfLives,
  strategy: alwaysRevealStrat, rng: mulberry32(123),
});
// With many lives, the game should eventually win (floor 0 HP is small)
ok(rMech.totalDmg > 0, 'alwaysReveal: accumulates damage from safe tiles');
ok(rMech.turnsPlayed >= 1, 'alwaysReveal: plays at least 1 turn');

// --- DEFAULT_PARAMS ---
ok(typeof DEFAULT_PARAMS === 'object' && DEFAULT_PARAMS !== null, 'DEFAULT_PARAMS exported');
ok('evMultiplier' in DEFAULT_PARAMS, 'DEFAULT_PARAMS has evMultiplier');
ok('hpThreshold' in DEFAULT_PARAMS, 'DEFAULT_PARAMS has hpThreshold');
ok('blockAggro' in DEFAULT_PARAMS, 'DEFAULT_PARAMS has blockAggro');

// Monte Carlo on floor 0 with upgrades strong enough to win
const strongLvs = zeroLvs.slice();
strongLvs[0] = 100; // huge base damage
strongLvs[2] = 5;   // bigger grid
const mc = monteCarloFloor({ floor: 0, upgLevels: strongLvs, nTrials: 100, seed: 42 });
ok(mc.winRate > 0.5, 'with strong upgrades, win rate > 50%');
ok(mc.avgDmg > 0, 'avgDmg > 0');
eq(mc.trials, 100, 'trials = 100');
ok(mc.avgCommits >= 0, 'avgCommits >= 0');

// Monte Carlo with seed = deterministic
const mc1 = monteCarloFloor({ floor: 0, upgLevels: strongLvs, nTrials: 50, seed: 123 });
const mc2 = monteCarloFloor({ floor: 0, upgLevels: strongLvs, nTrials: 50, seed: 123 });
eq(mc1.winRate, mc2.winRate, 'seeded MC is deterministic (winRate)');
eq(mc1.avgDmg, mc2.avgDmg, 'seeded MC is deterministic (avgDmg)');

// monteCarloFloor with tunableStrategy params variation
const mcLow = monteCarloFloor({
  floor: 0, upgLevels: strongLvs, nTrials: 50, seed: 777,
  strategy: tunableStrategy({ evMultiplier: 0.5 }),
});
const mcHigh = monteCarloFloor({
  floor: 0, upgLevels: strongLvs, nTrials: 50, seed: 777,
  strategy: tunableStrategy({ evMultiplier: 2.0 }),
});
ok(typeof mcLow.winRate === 'number', 'tunableStrategy(evMul=0.5) winRate exists');
ok(typeof mcHigh.winRate === 'number', 'tunableStrategy(evMul=2.0) winRate exists');

// greedyUpgradePath basic shape
const pathResult = greedyUpgradePath({
  floor: 0, upgLevels: strongLvs.slice(), params: DEFAULT_PARAMS,
  candidates: [0, 1, 2], steps: 2, nTrials: 20, seed: 42, svarHP: 1,
});
ok(Array.isArray(pathResult.path), 'greedyUpgradePath returns path array');
eq(pathResult.path.length, 2, 'greedyUpgradePath returns 2 steps');
ok(pathResult.path[0].upgIdx >= 0, 'path step has upgIdx');
ok(pathResult.path[0].result.winRate >= 0, 'path step has result');
ok(Array.isArray(pathResult.finalLvs), 'greedyUpgradePath returns finalLvs');
ok(pathResult.finalResult.winRate >= 0, 'greedyUpgradePath returns finalResult');

// generateGrid produces valid grid
const gtest = generateGrid(72, 5, zeroLvs, 0, mulberry32(99));
eq(gtest.grid.length, 72, 'generateGrid returns 72 tiles');
eq(gtest.crowns.length, 72, 'generateGrid returns 72 crown flags');
const mineCount = gtest.grid.filter(v => v === 0).length;
eq(mineCount, 5, 'generateGrid places 5 mines');
ok(gtest.grid.every(v => v >= 0 && v <= 49), 'all tile values in valid range');

// --- tunableStrategy ---
import { tunableStrategy, expandGrid, OPTIMIZE_GRID, optimizeStrategy } from '../minehead/sim.js';

// tunableStrategy with default params should run successfully
const tunDef = tunableStrategy();
const tunR = simulateGame({
  floor: 0, upgLevels: strongLvs, strategy: tunDef, rng: mulberry32(88),
});
ok(typeof tunR.won === 'boolean', 'tunableStrategy(default) runs');

// tunableStrategy with custom params
const tunCustom = tunableStrategy({ evMultiplier: 0.8, minReveal: 2, mineCapPct: 0.5, goldenMinePct: 0.3, blockAggro: false });
const tunR2 = simulateGame({
  floor: 0, upgLevels: strongLvs, strategy: tunCustom, rng: mulberry32(99),
});
ok(typeof tunR2.won === 'boolean', 'tunableStrategy(custom) runs');

// expandGrid produces correct number of combos
const miniGrid = { a: [1, 2], b: [10, 20, 30] };
const combos = expandGrid(miniGrid);
eq(combos.length, 6, 'expandGrid 2×3 = 6 combos');
ok(combos.every(c => 'a' in c && 'b' in c), 'expandGrid combos have all keys');

// Full OPTIMIZE_GRID gives expected count
const fullCombos = expandGrid(OPTIMIZE_GRID);
eq(fullCombos.length, 4 * 3 * 2 * 2 * 2 * 2 * 2 * 2 * 2 * 2 * 2, 'OPTIMIZE_GRID has 6144 combos');

// optimizeStrategy returns expected shape (small grid, few trials)
const optResult = optimizeStrategy({
  floor: 0, upgLevels: strongLvs, seed: 42,
  screenTrials: 10, finalTrials: 20, topN: 3,
  grid: { evMultiplier: [0.8, 1.0, 1.2], goldenMinePct: [1.0], blockAggro: [true] },
});
ok(optResult.bestParams !== null, 'optimizeStrategy returns bestParams');
ok(typeof optResult.bestResult.winRate === 'number', 'optimizeStrategy bestResult has winRate');
eq(optResult.topResults.length, 3, 'optimizeStrategy returns topN results');
eq(optResult.totalCombos, 3, 'optimizeStrategy totalCombos correct');

// ============ summary ============
console.log(`\n  Minehead tests: ${_pass} passed, ${_fail} failed`);
if (_fail > 0) process.exit(1);
