// Depth Charge (Minehead) — Monte Carlo floor simulation.
//
// Game mechanics (validated against N.formatted.js lines 99118-99640):
//
// PER-GAME INIT:
//   goldens = GoldTilesTotal  (consumed on CLICK, not placement)
//   blocks  = BlocksTotal     (consumed on mine hit)
//   instas  = InstaRevealsTotal  (target MINES specifically, immune to penalty)
//   lives   = MaxHP_You
//
// PER-ROUND (fresh grid each time):
//   1. Generate tile values: base roll + 17 increment attempts (bettah skew)
//   2. Separately place multiplier tiles (20-29), jackpot (30), currency tiles (40-49)
//   3. Place mines by overwriting random tiles with 0
//   4. Place golden tiles randomly on safe tiles, up to remaining budget
//   5. Assign blue crowns randomly to safe tiles
//
// PLAYER ACTIONS:
//   - Click golden tiles (safe, highlighted) → consume from per-game budget
//   - Click unknown tiles → mine check
//   - Use insta-reveal: finds a random unrevealed MINE and safely reveals it
//     (with escalating lockout chance per use per round)
//   - Press Attack: commit damage, end round
//
// MINE HIT:
//   - If block available: consume block, CONTINUE playing same grid
//   - Else: lose 1 life, 0 damage committed, trigger round end
//   - Revival (upg 19): when lives drop to 1, gain 1 block
//
// DAMAGE: 7-stage pipeline in formulas.currentOutgoingDMG
//   Stage 4 uses GenINFO[39] which accumulates from currency bonus tiles (40-49)
//   Blue crown multiplier uses GenINFO[50] = completed 3-match sets, NOT individual tiles
//
// JACKPOT TILE (value 30): cascade-reveals random safe unrevealed tiles

import { TILE_MULTIPLIERS } from './game-data.js';
import {
  minesOnFloor, floorHP, maxHPYou,
  bluecrownOdds, jackpotOdds, jackpotTiles, upgradeQTY,
  gridDims, goldTilesTotal, blocksTotal, instaRevealsTotal,
  currentOutgoingDMG, bonusDMGperTilePCT,
  WIGGLE_CHANCE, wiggleMaxPerGame,
} from './formulas.js';

// ===== STRATEGIES =====

/**
 * Strategy function signature: (ctx) => 'reveal' | 'attack' | 'golden'
 *   'reveal'  — click a random unrevealed tile (risky)
 *   'attack'  — commit damage, end turn
 *   'golden'  — click a golden tile (safe, consumes from per-game budget)
 *
 * ctx fields:
 *   safeRevealedThisTurn  — safe tiles revealed so far this turn
 *   minesTotal            — total mines on this floor
 *   minesRemaining        — mines not yet revealed this grid
 *   unrevealedCount       — tiles remaining (mines + safe unrevealed)
 *   livesLeft             — remaining lives
 *   totalDmgSoFar         — cumulative damage committed in prior turns
 *   bossHP                — total boss HP for this floor
 *   turnsPlayed           — turns elapsed (including current)
 *   blocksLeft            — blocks remaining (per-game)
 *   goldensOnGrid         — unclicked golden tiles this grid
 *   currentTurnDmg        — damage if you attacked RIGHT NOW
 *   remainingHP           — boss HP still needed (bossHP - totalDmgSoFar)
 *   perTilePct            — bonusDMGperTilePCT (for EV calcs)
 *   tileCount             — damage-contributing tiles revealed so far
 */

// --- Tunable: parameterized EV strategy for optimizer sweep ---

/**
 * Fully parameterized strategy with continuous knobs for grid search.
 *
 * @param {object} p
 * @param {number}  [p.evMultiplier=1.0]   EV edge required: >1 = conservative, <1 = aggressive
 * @param {number}  [p.minReveal=0]        minimum safe reveals before allowing attack
 * @param {number}  [p.mineCapPct=1.0]     hard mine-probability cap — always attack above this
 * @param {number}  [p.goldenMinePct=1.0]  mine% threshold for preferring golden over reveal
 *                                          1.0 = save goldens for end; 0 = use immediately
 * @param {number}  [p.hpThreshold=1.0]    attack when dmg >= N × remainingHP (0 = disabled)
 * @param {boolean} [p.blockAggro=true]    factor blocks into EV (mine hit = block, not death)
 * @param {number}  [p.commitMin=0]        min dmg/remainingHP fraction before allowing commit
 * @param {number}  [p.lifeAggro=1.0]      evMultiplier modifier when livesLeft > 1
 * @param {number}  [p.turn1EvMul=0]       separate EV multiplier for turn 1 (0 = use evMultiplier)
 * @param {number}  [p.crownChase=0]       EV reduction factor when 2/3 crowns matched (0–1)
 * @param {number}  [p.commitTurns=0]      force attack after N turns (0 = no limit)
 * @param {number}  [p.instaMode=0]        mine% threshold for using insta-reveals (0 = always)
 *
 * Human-behavior knobs (for playstyle inference):
 * @param {number}  [p.postMinePanic=0]    inflate EV threshold on turn after mine hit (0–1)
 * @param {number}  [p.lastTurnAggro=0]    halve EV when remainingHP/bossHP < val (0=off)
 * @param {number}  [p.targetReveals=0]    soft reveal cap per turn (0=disabled)
 * @param {boolean} [p.goldenFirst=false]  always prefer golden over risky reveal
 * @param {number}  [p.crownOrDie=0]       max mine% for reveals with 2/3 crowns (0=disabled)
 * @param {number}  [p.hotStreak=0]        reduce EV threshold after 3+ safe reveals (0–1)
 * @param {number}  [p.blockHoard=0]       inflate EV threshold when blocks ≤ 1 (0–1)
 *
 * Spatial click-pattern knobs (for tile selection):
 * @param {number}  [p.cornerBias=1]       weight multiplier for corner tiles (>1 = prefer corners)
 * @param {number}  [p.edgeBias=1]         weight multiplier for edge tiles (>1 = prefer edges)
 * @param {number}  [p.clusterBias=1]      weight multiplier for tiles adjacent to known safe (>1 = cluster)
 */
export function tunableStrategy(p = {}) {
  const {
    evMultiplier = 1.0,
    minReveal = 0,
    mineCapPct = 1.0,
    goldenMinePct = 1.0,
    hpThreshold = 1.0,
    blockAggro = true,
    commitMin = 0,
    lifeAggro = 1.0,
    turn1EvMul = 0,
    crownChase = 0,
    commitTurns = 0,
    instaMode = 0,
    // Human-behavior knobs
    postMinePanic = 0,
    lastTurnAggro = 0,
    targetReveals = 0,
    goldenFirst = false,
    crownOrDie = 0,
    hotStreak = 0,
    blockHoard = 0,
    // Spatial knobs
    cornerBias = 1,
    edgeBias = 1,
    clusterBias = 1,
  } = p;

  // Helper: prefer golden over reveal when mine% >= goldenMinePct
  function _revealOrGolden(ctx, pMine) {
    if (goldenFirst && ctx.goldensOnGrid > 0) return 'golden';
    if (ctx.goldensOnGrid > 0 && pMine >= goldenMinePct) return 'golden';
    return 'reveal';
  }
  // Helper: spend goldens before attacking (always beneficial)
  function _goldenOrAttack(ctx) {
    return ctx.goldensOnGrid > 0 ? 'golden' : 'attack';
  }

  const fn = (ctx) => {
    // Commit turns: force attack after N turns
    if (commitTurns > 0 && ctx.turnsPlayed >= commitTurns
        && ctx.safeRevealedThisTurn > 0 && ctx.currentTurnDmg > 0) {
      return _goldenOrAttack(ctx);
    }
    // HP threshold: attack if damage meets fraction of remaining HP
    if (hpThreshold > 0 && ctx.currentTurnDmg >= hpThreshold * ctx.remainingHP
        && ctx.currentTurnDmg > 0) {
      return _goldenOrAttack(ctx);
    }
    // targetReveals: soft cap on reveals per turn
    if (targetReveals > 0 && ctx.safeRevealedThisTurn >= targetReveals
        && ctx.currentTurnDmg > 0) {
      return _goldenOrAttack(ctx);
    }
    // Must reveal at least once — commit with 0 tiles = 0 damage
    const pMine = ctx.unrevealedCount > 0
      ? ctx.minesRemaining / ctx.unrevealedCount : 0;
    if (ctx.safeRevealedThisTurn === 0 && ctx.unrevealedCount > 0) {
      return _revealOrGolden(ctx, pMine);
    }
    if (ctx.unrevealedCount === 0) {
      return _goldenOrAttack(ctx);
    }
    // crownOrDie: override mine cap when 2/3 crowns — keep revealing
    if (crownOrDie > 0 && (ctx.crownProgress || 0) >= 2 && pMine <= crownOrDie) {
      return _revealOrGolden(ctx, pMine);
    }
    // Hard mine cap
    if (pMine >= mineCapPct) {
      return _goldenOrAttack(ctx);
    }
    // Minimum reveals
    if (ctx.safeRevealedThisTurn < minReveal) {
      return _revealOrGolden(ctx, pMine);
    }
    // EV calc with multiplier (adjusted for spare lives)
    const pSafe = 1 - pMine;
    const tc = ctx.tileCount || 1;
    const ptp = ctx.perTilePct || 0;
    const currentStage5 = 1 + tc * ptp / 100;
    const nextStage5 = 1 + (tc + 1) * ptp / 100;
    const dmgAfterOneTile = currentStage5 > 0
      ? ctx.currentTurnDmg * (nextStage5 / currentStage5)
      : ctx.currentTurnDmg;

    // Base EV multiplier: turn1 override, then lifeAggro
    let baseEv = (turn1EvMul > 0 && ctx.totalDmgSoFar === 0)
      ? turn1EvMul : evMultiplier;
    let effEvMul = ctx.livesLeft > 1 ? baseEv * lifeAggro : baseEv;

    // Crown chase: reduce threshold when 2/3 crowns matched
    if (crownChase > 0 && (ctx.crownProgress || 0) >= 2) {
      effEvMul *= (1 - crownChase);
    }
    // postMinePanic: conservative after previous turn mine hit
    if (postMinePanic > 0 && ctx.lastTurnMineHit) {
      effEvMul *= (1 + postMinePanic);
    }
    // lastTurnAggro: aggressive near kill
    if (lastTurnAggro > 0 && ctx.bossHP > 0
        && ctx.remainingHP / ctx.bossHP < lastTurnAggro) {
      effEvMul *= 0.5;
    }
    // hotStreak: aggressive after many safe reveals this turn
    if (hotStreak > 0 && ctx.safeRevealedThisTurn >= 3) {
      effEvMul *= (1 - hotStreak);
    }
    // blockHoard: cautious when few blocks left
    if (blockHoard > 0 && ctx.blocksLeft <= 1) {
      effEvMul *= (1 + blockHoard);
    }

    let evReveal;
    if (blockAggro && ctx.blocksLeft > 0) {
      evReveal = pSafe * dmgAfterOneTile + pMine * ctx.currentTurnDmg;
    } else {
      evReveal = pSafe * dmgAfterOneTile;
    }
    if (evReveal > effEvMul * ctx.currentTurnDmg) return 'reveal';

    // Commit minimum: keep revealing if damage is too small to be worth committing
    if (commitMin > 0 && ctx.remainingHP > 0 && ctx.currentTurnDmg / ctx.remainingHP < commitMin) {
      return _revealOrGolden(ctx, pMine);
    }

    return _goldenOrAttack(ctx);
  };
  fn.instaMode = instaMode;
  fn.cornerBias = cornerBias;
  fn.edgeBias = edgeBias;
  fn.clusterBias = clusterBias;
  return fn;
}

/** Default tunable params (EV-optimal with all awareness on). */
export const DEFAULT_PARAMS = {
  evMultiplier: 1.0,
  minReveal: 0,
  mineCapPct: 1.0,
  goldenMinePct: 1.0,
  hpThreshold: 1.0,
  blockAggro: true,
  commitMin: 0,
  lifeAggro: 1.0,
  turn1EvMul: 0,
  crownChase: 0,
  commitTurns: 0,
  instaMode: 0,
  // Human-behavior knobs (all off = EV-optimal)
  postMinePanic: 0,
  lastTurnAggro: 0,
  targetReveals: 0,
  goldenFirst: false,
  crownOrDie: 0,
  hotStreak: 0,
  blockHoard: 0,
  // Spatial knobs (1 = neutral/random)
  cornerBias: 1,
  edgeBias: 1,
  clusterBias: 1,
};

// ===== GRID GENERATION (matches game code at line 99604) =====

/**
 * Generate a full grid of tile values matching the game's algorithm.
 * Returns array of length numTiles. Value 0 = mine.
 */
export function generateGrid(numTiles, mines, upgLevels, crownOdds, rng) {
  const numbahs = upgradeQTY(1, upgLevels[1]);
  const bettah = upgradeQTY(3, upgLevels[3]);
  const multiUpg = upgradeQTY(12, upgLevels[12]);   // Multiplier_Madness
  const multiSkew = upgradeQTY(13, upgLevels[13]);   // Multiplier_Boost
  const addUpg = upgradeQTY(17, upgLevels[17]);      // Awesome_Additives
  const addSkew = upgradeQTY(18, upgLevels[18]);     // Additive_Boost
  const jpOdds = jackpotOdds(upgLevels);

  const grid = new Array(numTiles);
  const crowns = new Array(numTiles).fill(false);

  // Step 1: Generate base tile values (game lines 99582-99593)
  for (let s = 0; s < 72; s++) {
    // base value: floor(1 + min(min(12, bettah/150) + random(), numbahs))
    let val = Math.floor(1 + Math.min(Math.min(12, bettah / 150) + rng(), numbahs));
    // 17 increment attempts
    const incrProb = 0.14 + Math.min(0.06, bettah / 2000)
                   + Math.min(0.5, bettah / (bettah + 1500) * 0.5);
    for (let n = 0; n < 17; n++) {
      if (Math.round(val) > Math.round(numbahs)) break;
      if (rng() >= incrProb) break;
      val = Math.round(val + 1);
    }
    grid[s] = val;
    // Rare subtract tile (1/5000 if bettah > 10)
    if (bettah > 10 && Math.floor(1 + rng() * 5000) === 1) {
      grid[s] = 19;
    }
  }

  // Step 2: Place special tiles on TotalTiles positions (game lines 99594-99610)
  let hasJackpot = false;
  for (let s = 0; s < numTiles; s++) {
    // Multiplier tiles (20-29)
    const multiChance = 0.05 + multiSkew / (multiSkew + 1000) * 0.08;
    if (rng() < multiChance && multiUpg > 0) {
      let mv = Math.floor(Math.min(3, multiSkew / 400) + rng());
      const mvIncrProb = 0.18 + Math.min(0.07, multiSkew / 2000)
                       + multiSkew / (multiSkew + 1200) * 0.3;
      for (let k = 0; k < 9; k++) {
        if (Math.round(mv + 1) >= Math.round(multiUpg)) break;
        if (rng() >= mvIncrProb) break;
        mv = Math.round(mv + 1);
      }
      grid[s] = Math.round(Math.min(29, 20 + mv));
    }
    // Jackpot tile (30) — max 1 per grid
    if (!hasJackpot && rng() < jpOdds) {
      grid[s] = 30;
      hasJackpot = true;
    }
    // Currency bonus tiles (40-49) — give currency, NOT damage
    const addChance = 0.07 + addSkew / (addSkew + 1000) * 0.1;
    if (rng() < addChance && addUpg > 0) {
      let av = Math.floor(Math.min(3, addSkew / 400) + rng());
      const avIncrProb = 0.14 + Math.min(0.06, addSkew / 2000)
                       + addSkew / (addSkew + 1200) * 0.25;
      for (let k = 0; k < 9; k++) {
        if (Math.round(av + 1) >= Math.round(addUpg)) break;
        if (rng() >= avIncrProb) break;
        av = Math.round(av + 1);
      }
      grid[s] = Math.round(Math.min(49, 40 + av));
    }
  }

  // Step 3: Place mines (overwrite random positions with 0)
  const mineCount = Math.min(mines, numTiles);
  for (let i = 0; i < mineCount; i++) {
    let pos;
    do { pos = Math.floor(rng() * numTiles); } while (grid[pos] === 0);
    grid[pos] = 0;
  }

  // Step 4: Assign blue crowns to safe tiles
  for (let s = 0; s < numTiles; s++) {
    if (grid[s] !== 0 && rng() < crownOdds) {
      crowns[s] = true;
    }
  }

  return { grid, crowns };
}

/**
 * Place golden tiles on safe positions, probabilistically.
 * Returns array of golden tile indices.
 */
export function _placeGoldens(grid, numTiles, goldBudget, goldUpgTotal, rng) {
  const goldenPositions = [];
  let remaining = goldBudget;
  for (let s = 0; s < numTiles && remaining > 0; s++) {
    if (grid[s] === 0) continue; // skip mines
    // Game probability: max(2, random(.12,.4) * GoldTilesTotal) / TotalTiles
    const prob = Math.max(2, (rng() * 0.28 + 0.12) * goldUpgTotal) / numTiles;
    if (rng() < prob) {
      goldenPositions.push(s);
      remaining--;
    }
  }
  return goldenPositions;
}

// ===== SINGLE GAME SIMULATION =====

/**
 * Simulate one full game of Depth Charge on a given floor.
 *
 * @param {object} opts
 * @param {number}    opts.floor           floor number (0-indexed)
 * @param {number[]}  opts.upgLevels       upgrade levels array (30 entries)
 * @param {Function}  [opts.strategy]      strategy function; default = moderate
 * @param {number}    [opts.gridBonus167]  research grid bonus for base damage
 * @param {number}    [opts.gridBonus146]  research grid bonus per-tile %
 * @param {number}    [opts.gridBonus166_1] Minehead_Copium level (wiggles per game)
 * @param {number}    [opts.wepPowDmgPCT]  GenINFO[39] weapon power damage %
 * @param {number}    [opts.svarHP]        server var A_MineHP
 * @param {number}    [opts.maxTurns]      safety cap (default 200; 0 = unlimited)
 * @param {Function}  [opts.rng]           RNG (0–1); default = Math.random
 */
export function simulateGame({
  floor, upgLevels,
  strategy = tunableStrategy(),
  gridBonus167 = 0, gridBonus146 = 0, gridBonus166_1 = 0, wepPowDmgPCT = 0, sailing38 = 0,
  svarHP = 1, maxTurns = 200, rng = Math.random,
}) {
  const { cols, rows } = gridDims(upgLevels[2]);
  const numTiles = cols * rows;
  const mines = minesOnFloor(floor);
  const hp = floorHP(floor, svarHP);
  let livesLeft = maxHPYou(upgLevels);

  // Per-game resources
  let goldensRemaining = goldTilesTotal(upgLevels);
  let blocksLeft = blocksTotal(upgLevels);
  let instaLeft = instaRevealsTotal(upgLevels);
  const crownOdds = bluecrownOdds(upgLevels);
  const jpTileCount = jackpotTiles(upgLevels);
  const goldUpgTotal = goldTilesTotal(upgLevels);
  const hasRevival = upgradeQTY(19, upgLevels[19]) >= 1;
  const maxWiggles = wiggleMaxPerGame(gridBonus166_1);

  let totalDmg = 0;
  let turnsPlayed = 0;
  let totalCommits = 0;
  let mineHitsTotal = 0;
  let blocksUsedTotal = 0;
  let wigglesUsed = 0;
  let firstClickMines = 0;
  let firstTurnDmg = 0;
  let lastTurnMineHit = false;
  const turnLog = [];
  const verbose = !!arguments[0]?.verbose;

  while (livesLeft > 0 && totalDmg < hp && (maxTurns === 0 || turnsPlayed < maxTurns)) {
    turnsPlayed++;

    // === Generate fresh grid ===
    const { grid, crowns } = generateGrid(numTiles, mines, upgLevels, crownOdds, rng);
    const revealed = new Array(numTiles).fill(false);

    // Place goldens randomly on safe tiles
    const goldenPositions = _placeGoldens(grid, numTiles, goldensRemaining, goldUpgTotal, rng);

    // Track per-turn state
    const turnValues = [];
    let crownProgress = 0;   // GenINFO[49]: counts toward 3
    let crownSets = 0;       // GenINFO[50]: completed 3-match sets
    let safeRevealed = 0;
    let manualReveals = 0;
    let instaAttempts = 0;   // GenINFO[46]
    let instaLocked = false; // GenINFO[45]
    let goldensClickedThisTurn = 0;

    // Helper: reveal a tile (handles all game logic)
    function revealTile(pos, isInsta) {
      if (revealed[pos]) return 'already';
      revealed[pos] = true;

      // Crown check
      if (crowns[pos]) {
        crownProgress++;
        if (crownProgress >= 3) {
          crownProgress = 0;
          crownSets++;
        }
      }

      // Golden check — consume from budget on click
      if (goldenPositions.includes(pos)) {
        goldensRemaining--;
        goldensClickedThisTurn++;
      }

      if (grid[pos] === 0) {
        // MINE HIT
        if (isInsta) return 'mine-insta'; // immune to penalty
        // Wiggle: first manual click on a mine, chance to save
        if (wigglesUsed < maxWiggles && manualReveals === 0 && rng() < WIGGLE_CHANCE) {
          wigglesUsed++;
          return 'mine-wiggle'; // mine dodged
        }
        mineHitsTotal++;
        if (blocksLeft > 0) {
          blocksLeft--;
          blocksUsedTotal++;
          return 'mine-blocked'; // continue playing
        }
        // Lose a life
        livesLeft--;
        // Revival: when lives drop to exactly 1, gain 1 block
        if (livesLeft === 1 && hasRevival) {
          blocksLeft = 1;
        }
        return 'mine-hit'; // turn ends, 0 damage
      }

      if (grid[pos] === 30) {
        // JACKPOT — cascade reveal safe unrevealed tiles
        let jpLeft = jpTileCount;
        for (let attempt = 0; attempt < 1000 && jpLeft > 0; attempt++) {
          const jPos = Math.floor(rng() * numTiles);
          if (grid[jPos] !== 0 && !revealed[jPos]) {
            revealTile(jPos, false); // recursive — may trigger crown, golden etc
            jpLeft--;
          }
        }
        return 'jackpot';
      }

      // Normal tile or currency tile — value recorded for damage
      if (grid[pos] >= 1 && grid[pos] <= 29) {
        turnValues.push(grid[pos]);
        safeRevealed++;
      } else if (grid[pos] >= 40 && grid[pos] < 50) {
        // Currency bonus tile — occupies space, NO damage contribution
        safeRevealed++;
      }
      return 'safe';
    }

    // 1. Use insta-reveals (target MINES, immune to penalty)
    //    Controlled by strategy.instaMode: mine% threshold for using instas (0 = always)
    const _instaThreshold = strategy.instaMode ?? 0;
    const _pMineStart = mines / numTiles;
    while (instaLeft > 0 && !instaLocked && _pMineStart >= _instaThreshold) {
      // Find a random unrevealed mine
      const unrevealed = [];
      for (let i = 0; i < numTiles; i++) {
        if (grid[i] === 0 && !revealed[i]) unrevealed.push(i);
      }
      if (unrevealed.length === 0) break; // no mines left to target

      // Random mine selection (game: random until finds unrevealed mine)
      const target = unrevealed[Math.floor(rng() * unrevealed.length)];

      // Lockout check (escalating chance after each use)
      if (rng() < Math.min(0.7, 0.2 + 0.15 * instaAttempts)) {
        instaLocked = true;
      }
      instaAttempts++;
      instaLeft--;
      revealTile(target, true); // mine revealed safely
    }

    // Count unrevealed mines, safe tiles, and unclicked goldens
    function countRemaining() {
      let minesLeft = 0, safeLeft = 0, goldensLeft = 0;
      for (let i = 0; i < numTiles; i++) {
        if (revealed[i]) continue;
        if (grid[i] === 0) minesLeft++;
        else {
          safeLeft++;
          if (goldenPositions.includes(i)) goldensLeft++;
        }
      }
      return { minesLeft, safeLeft, goldensLeft };
    }

    // 2. Decision loop: reveal, attack, or golden
    let turnEnded = false;
    let turnOutcome = 'none';
    while (!turnEnded) {
      const { minesLeft, safeLeft, goldensLeft } = countRemaining();
      const unrevealedCount = minesLeft + safeLeft;

      if (unrevealedCount === 0) {
        // All tiles revealed — auto-commit
        break;
      }

      if (safeLeft === 0) {
        // All remaining are mines — must attack
        turnOutcome = 'attack';
        turnEnded = true;
        break;
      }

      // Compute current turn damage for strategy context
      const perTilePct = bonusDMGperTilePCT(upgLevels, gridBonus146);
      const turnDmgNow = turnValues.length > 0
        ? currentOutgoingDMG(turnValues, crownSets, livesLeft <= 1,
            upgLevels, gridBonus167, gridBonus146, wepPowDmgPCT, sailing38)
        : 0;

      const decision = strategy({
        safeRevealedThisTurn: safeRevealed,
        minesTotal: mines,
        minesRemaining: minesLeft,
        unrevealedCount,
        livesLeft,
        totalDmgSoFar: totalDmg,
        bossHP: hp,
        turnsPlayed,
        blocksLeft,
        goldensOnGrid: goldensLeft,
        currentTurnDmg: turnDmgNow,
        remainingHP: hp - totalDmg,
        perTilePct,
        tileCount: turnValues.length,
        crownProgress,
        lastTurnMineHit,
      });

      if (decision === 'attack') {
        turnOutcome = 'attack';
        turnEnded = true;
      } else if (decision === 'golden') {
        // Click a golden tile (guaranteed safe)
        const gIdx = goldenPositions.find(p => !revealed[p]);
        if (gIdx !== undefined) {
          revealTile(gIdx, false);
        } else {
          // No goldens left — treat as attack
          turnOutcome = 'attack';
          turnEnded = true;
        }
      } else {
        // Pick an unrevealed NON-golden tile, weighted by spatial knobs
        manualReveals++;
        const candidates = [];
        for (let i = 0; i < numTiles; i++) {
          if (!revealed[i] && !goldenPositions.includes(i)) candidates.push(i);
        }
        if (candidates.length === 0) {
          // Only goldens + mines left — click a golden or attack
          if (goldensLeft > 0) {
            const gIdx = goldenPositions.find(p => !revealed[p]);
            if (gIdx !== undefined) revealTile(gIdx, false);
          }
          continue;
        }

        // Spatial weighting
        const hasSpatial = strategy.cornerBias !== 1 || strategy.edgeBias !== 1 || strategy.clusterBias !== 1;
        let pick;
        if (!hasSpatial || candidates.length === 1) {
          pick = candidates[Math.floor(rng() * candidates.length)];
        } else {
          const cBias = strategy.cornerBias ?? 1;
          const eBias = strategy.edgeBias ?? 1;
          const sBias = strategy.clusterBias ?? 1;
          let totalW = 0;
          const weights = new Array(candidates.length);
          for (let ci = 0; ci < candidates.length; ci++) {
            const idx = candidates[ci];
            const r = (idx / cols) | 0, c = idx % cols;
            const isEdgeR = r === 0 || r === rows - 1;
            const isEdgeC = c === 0 || c === cols - 1;
            const isCorner = isEdgeR && isEdgeC;
            const isEdge = (isEdgeR || isEdgeC) && !isCorner;
            let w = 1;
            if (isCorner) w *= cBias;
            else if (isEdge) w *= eBias;
            // Cluster: boost if adjacent to any revealed safe tile
            if (sBias !== 1) {
              let hasAdj = false;
              for (let dr = -1; dr <= 1 && !hasAdj; dr++) {
                for (let dc = -1; dc <= 1 && !hasAdj; dc++) {
                  if (dr === 0 && dc === 0) continue;
                  const nr = r + dr, nc = c + dc;
                  if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
                    const ni = nr * cols + nc;
                    if (revealed[ni] && grid[ni] !== 0) hasAdj = true;
                  }
                }
              }
              if (hasAdj) w *= sBias;
            }
            weights[ci] = w;
            totalW += w;
          }
          // Weighted random pick
          let dart = rng() * totalW;
          pick = candidates[candidates.length - 1];
          for (let ci = 0; ci < candidates.length; ci++) {
            dart -= weights[ci];
            if (dart <= 0) { pick = candidates[ci]; break; }
          }
        }
        const result = revealTile(pick, false);

        if (result === 'mine-hit') {
          if (manualReveals === 1) firstClickMines++;
          turnOutcome = 'mine';
          turnEnded = true;
        } else if (result === 'mine-blocked') {
          if (manualReveals === 1) firstClickMines++;
          // Continue playing — block absorbed it
        } else if (result === 'mine-wiggle') {
          if (manualReveals === 1) firstClickMines++;
          // Continue playing — wiggle dodged the mine
        }
        // 'safe', 'jackpot', 'mine-insta' → keep going
      }
    }

    // Commit damage (only on attack/cleared, NOT on mine hit)
    if (turnOutcome !== 'mine' && turnValues.length > 0) {
      const dmg = currentOutgoingDMG(
        turnValues, crownSets, livesLeft <= 1,
        upgLevels, gridBonus167, gridBonus146, wepPowDmgPCT, sailing38,
      );
      if (dmg > 0) {
        if (totalCommits === 0) firstTurnDmg = dmg;
        totalDmg += dmg; totalCommits++;
      }
      if (!turnOutcome) turnOutcome = 'cleared';
    }

    lastTurnMineHit = (turnOutcome === 'mine');

    if (verbose) {
      turnLog.push({
        turn: turnsPlayed,
        outcome: turnOutcome || 'cleared',
        tilesRevealed: safeRevealed,
        manualReveals,
        goldensUsed: goldensClickedThisTurn,
        instasUsed: instaAttempts,
        mineProb: mines / numTiles,
        dmgThisTurn: turnOutcome === 'mine' ? 0
          : (turnValues.length > 0
            ? currentOutgoingDMG(turnValues, crownSets, livesLeft <= 1,
                upgLevels, gridBonus167, gridBonus146, wepPowDmgPCT, sailing38)
            : 0),
        livesLeft,
        totalDmg,
      });
    }
  }

  const timedOut = maxTurns > 0 && turnsPlayed >= maxTurns && totalDmg < hp && livesLeft > 0;
  return {
    won: totalDmg >= hp,
    totalDmg,
    hpRemaining: Math.max(0, hp - totalDmg),
    livesLeft,
    turnsPlayed,
    totalCommits,
    mineHits: mineHitsTotal,
    blocksUsed: blocksUsedTotal,
    wigglesUsed,
    firstClickMines,
    firstTurnDmg,
    timedOut,
    floorHP: hp,
    ...(verbose ? { turnLog } : {}),
  };
}

// ===== SEEDED PRNG =====

/** Mulberry32 — fast seeded 32-bit PRNG. */
function mulberry32(seed) {
  let s = seed | 0;
  return () => {
    s |= 0; s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// ===== MONTE CARLO =====

/**
 * Run `nTrials` simulations and return aggregate statistics.
 *
 * @param {object} opts             same as simulateGame, plus:
 * @param {number} [opts.nTrials]   number of games to simulate (default 1000)
 * @param {number} [opts.seed]      optional seed for deterministic results
 *
 * @returns {{ winRate, avgDmg, avgTurns, avgCommits, trials }}
 */
export function monteCarloFloor({ nTrials = 1000, seed, ...gameOpts }) {
  const rng = seed !== undefined ? mulberry32(seed) : Math.random;

  let wins = 0, totalDmg = 0, totalTurns = 0, totalCommits = 0;
  let totalMineHits = 0, totalBlocksUsed = 0, totalFirstClickMines = 0;
  let totalFirstTurnDmg = 0;
  let timeouts = 0;
  for (let i = 0; i < nTrials; i++) {
    const r = simulateGame({ ...gameOpts, rng });
    if (r.won) wins++;
    if (r.timedOut) timeouts++;
    totalDmg += r.totalDmg;
    totalTurns += r.turnsPlayed;
    totalCommits += r.totalCommits;
    totalMineHits += r.mineHits;
    totalBlocksUsed += r.blocksUsed;
    totalFirstClickMines += r.firstClickMines;
    totalFirstTurnDmg += r.firstTurnDmg;
  }

  return {
    winRate: wins / nTrials,
    avgDmg: totalDmg / nTrials,
    avgTurns: totalTurns / nTrials,
    avgCommits: totalCommits / nTrials,
    avgMineHits: totalMineHits / nTrials,
    avgBlocksUsed: totalBlocksUsed / nTrials,
    avgFirstClickMines: totalFirstClickMines / nTrials,
    avgFirstTurnDmg: totalFirstTurnDmg / nTrials,
    avgDmgPerCommit: totalCommits > 0 ? totalDmg / totalCommits : 0,
    timeoutRate: timeouts / nTrials,
    trials: nTrials,
  };
}

// ===== STRATEGY OPTIMIZER =====

/** Default parameter grid for optimizeStrategy. */
export const OPTIMIZE_GRID = {
  evMultiplier:   [0.8, 1.0, 1.3, 2.0],
  minReveal:      [0, 1, 3],
  mineCapPct:     [0.5, 1.0],
  goldenMinePct:  [0.3, 1.0],
  hpThreshold:    [0.8, 1.0],
  blockAggro:     [true, false],
  commitMin:      [0, 0.02],
  lifeAggro:      [0.6, 1.0],
  turn1EvMul:     [0, 0.7],
  crownChase:     [0, 0.4],
  instaMode:      [0, 0.3],
  // Human-behavior knobs
  commitTurns:    [0],
  postMinePanic:  [0],
  lastTurnAggro:  [0],
  targetReveals:  [0],
  goldenFirst:    [false],
  crownOrDie:     [0],
  hotStreak:      [0],
  blockHoard:     [0],
  // Spatial knobs
  cornerBias:     [1],
  edgeBias:       [1],
  clusterBias:    [1],
};

/**
 * Generate all parameter combos from a grid object.
 * @param {object} grid  keys → arrays of values
 * @returns {object[]}   flat array of param objects
 */
export function expandGrid(grid) {
  const keys = Object.keys(grid);
  const combos = [{}];
  for (const key of keys) {
    const next = [];
    for (const combo of combos) {
      for (const val of grid[key]) {
        next.push({ ...combo, [key]: val });
      }
    }
    combos.length = 0;
    combos.push(...next);
  }
  return combos;
}

/**
 * Run a grid search over tunableStrategy parameters to find the best
 * configuration for a specific floor + upgrade state.
 *
 * Scoring: winRate first (if any combo has winRate > 0), then avgDmg/floorHP.
 *
 * @param {object}  opts
 * @param {number}  opts.floor
 * @param {number[]} opts.upgLevels
 * @param {number}  [opts.screenTrials=200]   trials per candidate in screening pass
 * @param {number}  [opts.finalTrials=2000]   trials for top-N re-evaluation
 * @param {number}  [opts.topN=5]             how many top candidates to re-evaluate
 * @param {number}  [opts.seed=42]
 * @param {object}  [opts.grid]               custom grid (default OPTIMIZE_GRID)
 * @param {object}  [opts.gameOpts]           extra simulateGame opts (svarHP, etc.)
 * @param {Function} [opts.onProgress]        callback(completed, total) for progress
 *
 * @returns {{ bestParams, bestResult, topResults: {params, result, score}[], totalCombos }}
 */
export function optimizeStrategy({
  floor, upgLevels,
  screenTrials = 200, finalTrials = 2000, topN = 5,
  seed = 42, grid, gameOpts = {},
  onProgress,
}) {
  const combos = expandGrid(grid || OPTIMIZE_GRID);
  const totalCombos = combos.length;
  const baseGameOpts = { floor, upgLevels, ...gameOpts };
  const hp = floorHP(floor, gameOpts.svarHP || 1);

  // --- Pass 1: screen all combos with few trials ---
  const scored = [];
  for (let i = 0; i < combos.length; i++) {
    const params = combos[i];
    const strat = tunableStrategy(params);
    const r = monteCarloFloor({ ...baseGameOpts, strategy: strat, nTrials: screenTrials, seed });
    const score = _optimizerScore(r, hp);
    scored.push({ params, result: r, score });
    if (onProgress) onProgress(i + 1, totalCombos, 'screen');
  }

  // --- Pass 2: re-evaluate top N with more trials ---
  scored.sort((a, b) => b.score - a.score);
  const topCandidates = scored.slice(0, topN);
  for (let i = 0; i < topCandidates.length; i++) {
    const c = topCandidates[i];
    const strat = tunableStrategy(c.params);
    c.result = monteCarloFloor({ ...baseGameOpts, strategy: strat, nTrials: finalTrials, seed });
    c.score = _optimizerScore(c.result, hp);
    if (onProgress) onProgress(totalCombos + i + 1, totalCombos + topN, 'final');
  }

  topCandidates.sort((a, b) => b.score - a.score);
  const best = topCandidates[0];
  return {
    bestParams: best.params,
    bestResult: best.result,
    topResults: topCandidates,
    totalCombos,
  };
}

/**
 * Score a MC result for optimizer ranking.
 * Win rate dominates if any trials win; otherwise use damage fraction.
 */
function _optimizerScore(r, hp) {
  // Primary: win rate. Secondary: avg damage as fraction of boss HP.
  return r.winRate + (r.avgDmg / (hp || 1)) * 0.001;
}

/**
 * Worker-friendly: evaluate a single tunableStrategy param set.
 * Called from the worker with a serialized params object.
 */
export function evaluateTunableParams({ params, floor, upgLevels, nTrials, seed, ...extra }) {
  const strat = tunableStrategy(params);
  return monteCarloFloor({ floor, upgLevels, strategy: strat, nTrials, seed, ...extra });
}

// ===== GREEDY UPGRADE PATH =====

/**
 * Find the best sequence of upgrade purchases via greedy search.
 *
 * At each step, evaluates all candidates and picks the one with
 * the best score (win rate first, then avg damage).
 *
 * @param {object}   opts
 * @param {number}   opts.floor
 * @param {number[]} opts.upgLevels           starting upgrade levels
 * @param {object}   [opts.params]            tunableStrategy params (default DEFAULT_PARAMS)
 * @param {number[]} opts.candidates          upgrade indices to consider
 * @param {number}   [opts.steps=10]          max upgrades to buy
 * @param {number}   [opts.nTrials=500]       trials per candidate eval
 * @param {number}   [opts.seed=42]
 * @param {number}   [opts.svarHP=1]
 * @param {Function} [opts.canBuy]            (idx, currentLvs) => boolean; filters at each step
 * @param {Function} [opts.onBuy]             (idx, currentLvs) => void; called after each purchase
 * @param {Function} [opts.onProgress]        (step, totalSteps, candidatesDone, candidatesTotal)
 *
 * @returns {{ path: {step,upgIdx,result}[], finalLvs, baseline, finalResult }}
 */
export function greedyUpgradePath({
  floor, upgLevels, params,
  candidates, steps = 10, nTrials = 500,
  seed = 42, svarHP = 1,
  canBuy, onBuy, onProgress,
}) {
  const strat = tunableStrategy(params || DEFAULT_PARAMS);
  const hp = floorHP(floor, svarHP);
  const currentLvs = [...upgLevels];

  // Baseline
  const baseline = monteCarloFloor({
    floor, upgLevels: currentLvs, strategy: strat, nTrials, seed, svarHP,
  });

  const path = [];
  for (let step = 0; step < steps; step++) {
    // Filter candidates that are still valid
    const viable = candidates.filter(idx => !canBuy || canBuy(idx, currentLvs));
    if (viable.length === 0) break;

    let bestIdx = -1, bestScore = -Infinity, bestResult = null;
    for (let c = 0; c < viable.length; c++) {
      const idx = viable[c];
      const modLvs = [...currentLvs];
      modLvs[idx] = (modLvs[idx] || 0) + 1;
      const r = monteCarloFloor({
        floor, upgLevels: modLvs, strategy: strat, nTrials, seed, svarHP,
      });
      const score = _optimizerScore(r, hp);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = idx;
        bestResult = r;
      }
      if (onProgress) onProgress(step, steps, c + 1, viable.length);
    }

    if (bestIdx < 0) break;
    currentLvs[bestIdx] = (currentLvs[bestIdx] || 0) + 1;
    path.push({ step: step + 1, upgIdx: bestIdx, result: bestResult });
    if (onBuy) onBuy(bestIdx, currentLvs);
  }

  // Final evaluation with more trials
  const finalResult = monteCarloFloor({
    floor, upgLevels: currentLvs, strategy: strat, nTrials: nTrials * 2, seed, svarHP,
  });

  return { path, finalLvs: currentLvs, baseline, finalResult };
}
