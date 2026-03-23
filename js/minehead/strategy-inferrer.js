// Strategy Inferrer — infer tunableStrategy knobs from Play tab decisions.
//
// Two-phase approach:
//   Phase 1: Sweep existing OPTIMIZE_GRID (6,144 combos) for best base fit
//   Phase 2: Iterative greedy over 7 human-behavior knobs (~70 evals)
// Total: ~6,214 evaluations × ~100–300 decisions ≈ <50ms.

import { tunableStrategy, OPTIMIZE_GRID, expandGrid } from './sim.js';

/** Grid of human-behavior knob values for iterative greedy refinement. */
const NEW_KNOB_GRID = {
  postMinePanic:  [0, 0.2, 0.5, 0.8],
  lastTurnAggro:  [0, 0.2, 0.5],
  targetReveals:  [0, 3, 5, 8],
  goldenFirst:    [false, true],
  crownOrDie:     [0, 0.3, 0.6],
  hotStreak:      [0, 0.2, 0.5],
  blockHoard:     [0, 0.3, 0.6],
  // Spatial knobs (1 = neutral, >1 = prefer that zone/pattern)
  cornerBias:     [1, 1.5, 2.5],
  edgeBias:       [1, 1.3, 2.0],
  clusterBias:    [1, 1.5, 2.5, 4.0],
};

/**
 * Score a parameter set against a list of recorded decisions.
 * Returns the number of decisions where the strategy agrees with the player.
 */
function _scoreParams(params, decisions) {
  const strat = tunableStrategy(params);
  let agree = 0;
  for (let i = 0; i < decisions.length; i++) {
    if (strat(decisions[i]) === decisions[i].choice) agree++;
  }
  return agree;
}

/**
 * Infer the best tunableStrategy parameters from recorded play decisions.
 *
 * @param {object[]} decisions  Array of { ...ctx fields, choice } snapshots
 * @returns {{ params, agreement, totalDecisions, profile }}
 */
export function inferStrategy(decisions) {
  if (!decisions || decisions.length === 0) {
    return { params: null, agreement: 0, totalDecisions: 0, profile: 'none' };
  }

  // Phase 1: Sweep base 12 knobs
  const baseCombos = expandGrid(OPTIMIZE_GRID);
  let bestParams = null;
  let bestScore = -1;

  for (const p of baseCombos) {
    const score = _scoreParams(p, decisions);
    if (score > bestScore) { bestScore = score; bestParams = { ...p }; }
  }

  // Phase 2: Iterative greedy over 7 new knobs (3 passes)
  for (let pass = 0; pass < 3; pass++) {
    for (const [key, values] of Object.entries(NEW_KNOB_GRID)) {
      let bestVal = bestParams[key] ?? values[0];
      let bestKnobScore = _scoreParams(bestParams, decisions);
      for (const v of values) {
        const candidate = { ...bestParams, [key]: v };
        const score = _scoreParams(candidate, decisions);
        if (score > bestKnobScore) {
          bestKnobScore = score;
          bestVal = v;
        }
      }
      bestParams[key] = bestVal;
    }
  }

  const finalScore = _scoreParams(bestParams, decisions);
  const spatial = analyzeSpatial(decisions);
  const profile = _classifyProfile(bestParams, spatial);
  return {
    params: bestParams,
    agreement: finalScore / decisions.length,
    totalDecisions: decisions.length,
    profile,
    spatial,
  };
}

/**
 * Generate a human-readable profile label from inferred knobs.
 */
function _classifyProfile(p, spatial) {
  const traits = [];

  // Risk level
  if (p.evMultiplier <= 0.8) traits.push('Daredevil');
  else if (p.evMultiplier >= 2.0) traits.push('Cautious');
  else if (p.evMultiplier >= 1.3) traits.push('Conservative');

  // Behavioral quirks
  if (p.postMinePanic >= 0.5) traits.push('Panic-Prone');
  if (p.hotStreak >= 0.3) traits.push('Momentum-Rider');
  if (p.crownChase >= 0.3 || p.crownOrDie >= 0.3) traits.push('Crown-Chaser');
  if (p.goldenFirst) traits.push('Golden-First');
  if (p.blockHoard >= 0.3) traits.push('Block-Hoarder');
  if (p.lastTurnAggro >= 0.3) traits.push('Finisher');
  if (p.targetReveals >= 5) traits.push('Methodical');
  else if (p.targetReveals > 0 && p.targetReveals <= 3) traits.push('Quick-Draw');
  if (p.lifeAggro <= 0.6) traits.push('YOLO');
  if (p.turn1EvMul > 0 && p.turn1EvMul < 0.8) traits.push('Fast-Starter');
  if (p.commitMin > 0) traits.push('Greedy');

  // Spatial knob traits (prefer these over raw analyzeSpatial traits to avoid dupes)
  if (p.cornerBias >= 2) traits.push('Corner-Hugger');
  else if (p.cornerBias >= 1.5) traits.push('Corner-Leaner');
  if (p.edgeBias >= 1.5) traits.push('Edge-Walker');
  if (p.clusterBias >= 2.5) traits.push('Clusterer');
  else if (p.clusterBias >= 1.5) traits.push('Near-Safe');

  // Additional spatial traits from observation (skip dupes with knob traits)
  if (spatial && spatial.traits) {
    const knobTraits = new Set(traits);
    for (const t of spatial.traits) {
      if (!knobTraits.has(t)) traits.push(t);
    }
  }

  if (traits.length === 0) traits.push('EV-Optimal');
  return traits.join(' / ');
}

/**
 * Analyze spatial click tendencies from decision data.
 *
 * Returns an object with:
 *   - zoneBias: { corner, edge, center } as ratios (how often each zone is picked
 *     vs the fraction of tiles in that zone — >1 means overrepresented)
 *   - firstClickZone: same ratios but only for the first click of each turn
 *   - adjMineBias: how often clicked tiles are adjacent to known mines vs expected
 *   - adjSafeBias: how often clicked tiles neighbor known safe tiles vs expected
 *   - heatmap: normalized click frequency per grid cell (cols × rows)
 *   - traits: string[] of human-readable spatial tendencies
 */
export function analyzeSpatial(decisions) {
  const reveals = decisions.filter(d => d.spatial && (d.choice === 'reveal' || d.choice === 'golden'));
  if (reveals.length < 5) return null;

  // Accumulate zone counts and expected fractions
  let cornerClicks = 0, edgeClicks = 0, centerClicks = 0;
  let cornerExpected = 0, edgeExpected = 0, centerExpected = 0;
  let firstCorner = 0, firstEdge = 0, firstCenter = 0, firstTotal = 0;
  let firstCornerExp = 0, firstEdgeExp = 0, firstCenterExp = 0;
  let adjMineSum = 0, adjSafeSum = 0, adjMineExpected = 0, adjSafeExpected = 0;
  let totalAdj = 0;

  // Heatmap: use normalized (row/rows, col/cols) positions in a 6×6 bucket grid
  const HMAP_SIZE = 6;
  const heatmap = Array.from({ length: HMAP_SIZE }, () => new Array(HMAP_SIZE).fill(0));
  let heatTotal = 0;

  for (const d of reveals) {
    const s = d.spatial;
    const { rows, cols, isCorner, isEdge, isCenter, adjMines, adjSafe, adjUnrevealed, clickOrder } = s;
    const totalTiles = rows * cols;
    // Zone counts
    const corners = 4;
    const edges = 2 * (rows - 2) + 2 * (cols - 2);
    const centers = Math.max(0, totalTiles - corners - edges);

    if (isCorner) cornerClicks++;
    else if (isEdge) edgeClicks++;
    else centerClicks++;

    cornerExpected += corners / totalTiles;
    edgeExpected += edges / totalTiles;
    centerExpected += centers / totalTiles;

    // First click of turn
    if (clickOrder === 0) {
      firstTotal++;
      if (isCorner) firstCorner++;
      else if (isEdge) firstEdge++;
      else firstCenter++;
      firstCornerExp += corners / totalTiles;
      firstEdgeExp += edges / totalTiles;
      firstCenterExp += centers / totalTiles;
    }

    // Adjacency bias (only meaningful after first click when some tiles are revealed)
    if (clickOrder > 0) {
      const totalAdjs = adjMines + adjSafe + adjUnrevealed;
      if (totalAdjs > 0) {
        adjMineSum += adjMines / totalAdjs;
        adjSafeSum += adjSafe / totalAdjs;
        // Expected: proportion of all revealed tiles that are mines/safe
        // Rough baseline: if you clicked randomly, you'd see the grid-average adjacency
        totalAdj++;
      }
    }

    // Heatmap bucket
    const hr = Math.min(HMAP_SIZE - 1, Math.floor(s.r / rows * HMAP_SIZE));
    const hc = Math.min(HMAP_SIZE - 1, Math.floor(s.c / cols * HMAP_SIZE));
    heatmap[hr][hc]++;
    heatTotal++;
  }

  const n = reveals.length;
  const zoneRatio = (actual, expected) => expected > 0 ? (actual / n) / (expected / n) : 1;

  const zoneBias = {
    corner: zoneRatio(cornerClicks, cornerExpected),
    edge: zoneRatio(edgeClicks, edgeExpected),
    center: zoneRatio(centerClicks, centerExpected),
  };

  const firstClickZone = firstTotal >= 3 ? {
    corner: firstCornerExp > 0 ? (firstCorner / firstTotal) / (firstCornerExp / firstTotal) : 1,
    edge: firstEdgeExp > 0 ? (firstEdge / firstTotal) / (firstEdgeExp / firstTotal) : 1,
    center: firstCenterExp > 0 ? (firstCenter / firstTotal) / (firstCenterExp / firstTotal) : 1,
  } : null;

  // Adjacency biases (1.0 = neutral)
  const adjMineBias = totalAdj > 0 ? adjMineSum / totalAdj : 0;
  const adjSafeBias = totalAdj > 0 ? adjSafeSum / totalAdj : 0;

  // Normalize heatmap to 0-1
  const normalizedHeatmap = heatmap.map(row => row.map(v => heatTotal > 0 ? v / heatTotal : 0));

  // Derive traits
  const traits = [];

  if (zoneBias.corner > 1.5) traits.push('Corner-Hugger');
  else if (zoneBias.corner < 0.5) traits.push('Corner-Avoider');
  if (zoneBias.edge > 1.4) traits.push('Edge-Walker');
  if (zoneBias.center > 1.3) traits.push('Center-Diver');

  if (firstClickZone) {
    if (firstClickZone.corner > 2.0) traits.push('Corner-Starter');
    if (firstClickZone.edge > 1.8) traits.push('Edge-Starter');
    if (firstClickZone.center > 1.5) traits.push('Center-Starter');
  }

  if (adjSafeBias > 0.5) traits.push('Clusterer');
  if (adjMineBias > 0.15) traits.push('Mine-Adjacent');
  else if (adjMineBias < 0.03 && totalAdj > 10) traits.push('Mine-Shy');

  // Detect if heatmap is concentrated (low entropy = habitual clicking)
  const hmVals = normalizedHeatmap.flat();
  const uniform = 1 / (HMAP_SIZE * HMAP_SIZE);
  const entropy = hmVals.reduce((s, v) => v > 0 ? s - v * Math.log2(v) : s, 0);
  const maxEntropy = Math.log2(HMAP_SIZE * HMAP_SIZE);
  if (entropy < maxEntropy * 0.7 && heatTotal >= 20) traits.push('Habitual');
  if (entropy > maxEntropy * 0.95 && heatTotal >= 20) traits.push('Randomizer');

  return {
    zoneBias, firstClickZone,
    adjMineBias, adjSafeBias,
    heatmap: normalizedHeatmap,
    traits,
    totalReveals: n,
    heatmapSize: HMAP_SIZE,
  };
}
