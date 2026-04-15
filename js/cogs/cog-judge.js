// ===== COG JUDGE =====
// Grades cog rolls against a "perfect" cog at the player's max construction level.
// Con EXP % (d) is the most important stat — it levels divine knights,
// whose construction level drives player cog build speed.
//
// KEY: Crystal cogs (CogCry0-5) ALL use tier 4 for stat rolls.
// The CogCry number is the crystal upgrade level (surround stats only).

/**
 * Game formula for rawMag before random scaling.
 */
function _rawMag(tier, conLv) {
  return Math.pow(3, Math.min(3.4, tier)) + 0.25 * Math.pow(conLv / 3 + 0.7, 1.4 + 0.05 * tier);
}

/**
 * Max number of stat rolls for a tier.
 * tier 0-1: 3, tier 2-3: 4, tier 4: 4
 */
function _maxRolls(tier) {
  return tier < 2 ? 3 : 4;
}

function _minRolls(tier) {
  return tier < 2 ? 2 : 3;
}

/**
 * Simulate one full cog generation at a given tier and conLv.
 * Returns { d, dirE, cryLevel } matching the game's complete generation logic.
 * Used only as fallback when worker cache isn't ready (shouldn't normally happen).
 */
function _simFullRoll(tier, conLv) {
  var base = _rawMag(tier, conLv);
  var nRolls = _minRolls(tier) + (Math.random() < 0.5 ? 1 : 0);
  var a = 0, c = 0, d = 0;
  var maxBucket = 100 + 40 * Math.floor(tier / 4);
  for (var r = 0; r < nRolls; r++) {
    var bucket = Math.floor(Math.random() * maxBucket) + 1;
    var mult;
    if (bucket < 50) mult = 0.4 + Math.random() * 1.1;
    else if (bucket < 75) mult = 0.4 + Math.random() * 1.6;
    else mult = 0.4 + Math.random() * 2.6;
    var val = Math.floor(mult * base);
    var statRoll = Math.floor(Math.random() * 100) + 1;
    if (statRoll < 69) {
      a += Math.round(val);
    } else if (statRoll < 89 && tier !== 4) {
      c += Math.round(Math.pow(val, 0.8));
    } else {
      d += Math.max(Math.floor(Math.pow(val, 0.4) + 10 * Math.log(Math.max(val, 1)) / 2.30259 - 5), 2);
    }
  }
  var dirE = 0;
  var cryLevel = 0;
  if (tier >= 4) {
    for (var s = 0; s < 5; s++) {
      if (Math.random() >= 0.35) break;
      cryLevel = s + 1;
      dirE = 0;
      var gotDir = Math.random() < 0.25 || Math.random() < 0.334;
      if (gotDir && Math.random() < 0.5) {
        dirE = Math.floor(Math.random() * 11) + 30 + 23 * (s + 1);
      }
    }
  } else {
    var dirChance = tier === 1 ? 0.25 : 0.1;
    if (Math.random() < dirChance) {
      var eChance, eMin, eMax;
      if (tier === 0) { eChance = 1; eMin = 5; eMax = 10; }
      else if (tier === 1) { eChance = 0.7; eMin = 8; eMax = 15; }
      else if (tier === 2) { eChance = 0.65; eMin = 12; eMax = 40; }
      else { eChance = 0.5; eMin = 20; eMax = 65; }
      if (Math.random() < eChance) {
        dirE = Math.floor(Math.random() * (eMax - eMin + 1)) + eMin;
      }
    }
  }
  return { a: a, c: c, d: d, dirE: dirE, cryLevel: cryLevel };
}

/**
 * Build sim data synchronously (fallback when worker cache not ready).
 */
function _buildSimDataSync(tier, conLv, n) {
  // Sample 1M tuples (a,c,d,surr) for joint odds queries
  var PAIR_N = Math.min(n, 1000000);
  var sampleRate = Math.max(1, Math.floor(n / PAIR_N));
  var pairA = new Float32Array(PAIR_N);
  var pairC = new Float32Array(PAIR_N);
  var pairD = new Float32Array(PAIR_N);
  var pairS = new Float32Array(PAIR_N);
  var pi = 0;
  for (var i = 0; i < n; i++) {
    var sim = _simFullRoll(tier, conLv);
    if (i % sampleRate === 0 && pi < PAIR_N) {
      pairA[pi] = sim.a;
      pairC[pi] = sim.c;
      pairD[pi] = sim.d;
      pairS[pi] = sim.dirE;
      pi++;
    }
  }
  return { pairA: pairA, pairC: pairC, pairD: pairD, pairS: pairS, pairN: pi };
}

/** Sim cache — populated by workers or sync fallback */
var _simCache = {};

/**
 * Warm up the sim cache for all 5 tiers using Web Workers.
 * Returns a Promise that resolves when all tiers are done.
 * onProgress(done, total) is called as each tier completes.
 */
export function warmSimCache(conLv, onProgress) {
  _simCache = {};
  var N = 50000000;
  var tiers = [3, 4]; // only sim ulti + crystal
  var done = 0;
  var total = tiers.length;

  return new Promise(function(resolve) {
    // Try Web Workers first
    var workerUrl;
    try {
      if (typeof Worker === 'undefined') throw new Error('no Worker');
      workerUrl = new URL('./cog-sim-worker.js', import.meta.url).href;
    } catch (e) {
      // Fallback: run sync
      for (var t = 0; t < total; t++) {
        _simCache[tiers[t] + ',' + conLv] = _buildSimDataSync(tiers[t], conLv, N);
        done++;
        if (onProgress) onProgress(done, total);
      }
      resolve();
      return;
    }

    var pending = total;
    for (var t = 0; t < total; t++) {
      (function(tier) {
        var w = new Worker(workerUrl);
        w.onmessage = function(ev) {
          _simCache[tier + ',' + conLv] = {
            pairA: ev.data.pairA,
            pairC: ev.data.pairC,
            pairD: ev.data.pairD,
            pairS: ev.data.pairS,
            pairN: ev.data.pairN
          };
          done++;
          if (onProgress) onProgress(done, total);
          w.terminate();
          pending--;
          if (pending === 0) resolve();
        };
        w.onerror = function(err) {
          // Worker failed — fallback to sync for this tier
          console.warn('Sim worker failed for tier ' + tier + ', falling back to sync', err);
          _simCache[tier + ',' + conLv] = _buildSimDataSync(tier, conLv, N);
          done++;
          if (onProgress) onProgress(done, total);
          w.terminate();
          pending--;
          if (pending === 0) resolve();
        };
        w.postMessage({ tier: tier, conLv: conLv, n: N });
      })(tiers[t]);
    }
  });
}

function _getSimData(tier, conLv) {
  var key = tier + ',' + conLv;
  if (_simCache[key]) return _simCache[key];
  // Fallback: build sync (shouldn't happen if warmSimCache was awaited)
  console.warn('Sim cache miss for tier=' + tier + ' conLv=' + conLv + ', running sync fallback');
  _simCache[key] = _buildSimDataSync(tier, conLv, 10000000);
  return _simCache[key];
}

/**
 * Count how many sampled sims match all stat thresholds simultaneously.
 * Returns { prob, pairN } where prob = P(a >= minA AND c >= minC AND d >= minD AND surr >= minS).
 */
function _jointOddsProb(tier, conLv, minA, minC, minD, minS) {
  var data = _getSimData(tier, conLv);
  if (!data.pairA || !data.pairN) return { prob: 0, pairN: 0 };
  var count = 0;
  var pA = data.pairA, pC = data.pairC, pD = data.pairD, pS = data.pairS, pN = data.pairN;
  for (var i = 0; i < pN; i++) {
    if (pA[i] >= minA && pC[i] >= minC && pD[i] >= minD && pS[i] >= minS) count++;
  }
  return { prob: count / pN, pairN: pN };
}

/**
 * Clear the odds cache (call when conLv changes).
 */
export function clearOddsCache() {
  _simCache = {};
}

/**
 * Compute the perfect cog stats at a given tier and conLv.
 * Perfect = max rolls, 3.0× multiplier every roll, all rolls go to the desired stat.
 */
export function perfectCogStats(tier, conLv) {
  var mag = 3.0 * _rawMag(tier, conLv);
  var rolls = _maxRolls(tier);

  // Perfect build: all rolls → a (game uses round(mag))
  var perfectA = Math.round(mag) * rolls;
  // Perfect conExp: all rolls → d (game uses mag as float)
  var perD = Math.max(Math.floor(Math.pow(mag, 0.4) + 10 * Math.log(Math.max(mag, 1)) / 2.30259 - 5), 2);
  var perfectD = perD * rolls;

  // Surround max for crystal cogs (CogCry tier 1-5)
  // e/f range: randomInt(30,40) + 23*(cryTier), max = 40 + 23*cryTier
  var perfectSurr = 40 + 23 * Math.min(tier, 5);

  return { perfectA: perfectA, perfectD: perfectD, perfectSurr: perfectSurr, mag: mag, rolls: rolls };
}

/**
 * Get the stat-roll tier for a cog name.
 * Standard cogs: Cog0→0, Cog1→1, Cog2→2, Cog3→3
 * Crystal cogs: CogCry0-5 → ALL tier 4 (crystal number is upgrade level, not stat tier)
 * @returns {number} tier 0-4, or -1 if not a rollable cog
 */
export function cogStatTier(name) {
  if (!name) return -1;
  if (name.indexOf('CogCry') === 0) return 4; // ALL crystal cogs are rolled at tier 4
  if (name.indexOf('Cog') === 0) {
    var ch = name.charAt(3);
    if (ch >= '0' && ch <= '3') return parseInt(ch);
  }
  return -1;
}

/**
 * Given a cog's d value, tier, and roll count, back-calculate what effective
 * construction level would make that d the perfect roll.
 * Uses binary search since the formula isn't easily invertible.
 */
function _inferConLvFromD(d, tier, rolls) {
  if (!d || d <= 0) return 0;
  var perRoll = d / rolls;
  // Binary search for conLv where perfectD-per-roll >= perRoll
  var lo = 1, hi = 100000;
  for (var i = 0; i < 50; i++) {
    var mid = (lo + hi) / 2;
    var mag = 3.0 * _rawMag(tier, mid);
    var dPer = Math.max(Math.floor(Math.pow(mag, 0.4) + 10 * Math.log(Math.max(mag, 1)) / 2.30259 - 5), 2);
    if (dPer < perRoll) lo = mid;
    else hi = mid;
  }
  return Math.ceil(hi);
}

/**
 * Find the effective max construction level by scanning actual cog data.
 * Uses the base level from save, then checks if any cog's d value implies
 * a higher effective level (from talents, stamps, star signs, etc.).
 * @param {Object} save - raw save object
 * @param {Array} cogOrder - CogO array
 * @param {Object} cogMap - CogM object
 * @returns {number}
 */
export function findMaxConLevel(save, cogOrder, cogMap) {
  // Start with base level from save
  var maxCon = 0;
  for (var i = 0; i < 10; i++) {
    var key = 'Lv0_' + i;
    var lv = save[key];
    if (!lv) continue;
    if (typeof lv === 'string') { try { lv = JSON.parse(lv); } catch(e) { continue; } }
    if (lv && lv[8] && lv[8] > maxCon) maxCon = lv[8];
  }
  if (!maxCon) maxCon = 100;

  // Infer effective level from actual cog rolls — the best d value
  // reveals the true effective con level including all bonuses
  if (cogOrder && cogMap) {
    for (var slot = 0; slot < 252; slot++) {
      var name = cogOrder[slot];
      if (!name || name === 'Blank') continue;
      var m = cogMap[slot];
      if (!m || !m.d) continue;

      var tier = cogStatTier(name);
      if (tier < 0) continue;

      var rolls = _maxRolls(tier);
      var inferred = _inferConLvFromD(m.d, tier, rolls);
      if (inferred > maxCon) maxCon = inferred;
    }
  }

  return maxCon;
}

/**
 * Extract the crystal upgrade level from a cog name.
 * CogCry0 → 0, CogCry5 → 5. Returns -1 if not a crystal cog.
 */
export function crystalLevel(name) {
  if (!name || name.indexOf('CogCry') !== 0) return -1;
  return parseInt(name.charAt(6)) || 0;
}

/**
 * Judge a single cog's quality.
 * - Shelf cogs (isShelf=true) are not rated.
 * - Directional cogs affecting a player: graded on surround value / max surround.
 * - All others: graded on d / perfectD (con exp % ratio).
 * Odds (oneInN) still come from Monte Carlo for t3+t4.
 *
 * @param {{ a, c, d, e, f, g, h, name }} cogStats
 * @param {number} tier - Cog tier (0-4)
 * @param {number} maxConLv - Highest construction level
 * @param {Object} [opts] - { isShelf, affectsPlayer }
 */
export function judgeCog(cogStats, tier, maxConLv, opts) {
  if (tier < 0) return { grade: '?', percentile: -1 };

  var isShelf = opts && opts.isShelf;
  var affectsPlayer = opts && opts.affectsPlayer;

  // Shelf cogs don't get graded
  if (isShelf) return { grade: '-', percentile: -1 };

  // Only grade ulti (tier 3) and crystal (tier 4) cogs — lower tiers get F
  if (tier < 3) return { grade: 'F', ratio: 0, percentile: 0, hasSurround: false, affectsPlayer: false, perfect: perfectCogStats(tier, maxConLv), odds: { oneInN: 1 } };

  var perfect = perfectCogStats(tier, maxConLv);
  var hasSurround = !!(cogStats.h && (cogStats.e || cogStats.f || cogStats.g || cogStats.j));

  // Roll odds: fully from sim — joint P(a >= X AND c >= Y AND d >= Z AND surr >= W)
  var bestSurr = Math.max(cogStats.e || 0, cogStats.f || 0, cogStats.g || 0, cogStats.j || 0);
  var oddsResult = _jointOddsProb(tier, maxConLv, cogStats.a || 0, cogStats.c || 0, cogStats.d || 0, bestSurr);
  var jointP = oddsResult.prob;
  var jointOneInN = jointP > 0 ? Math.round(1 / jointP) : (oddsResult.pairN > 0 ? oddsResult.pairN : 1);
  if (jointOneInN < 1) jointOneInN = 1;
  var odds = { oneInN: jointOneInN };

  // Grade calculation — ratio of actual / perfect
  // total = sum(all base d) × (1 + sum(player surround) / 100)
  // Marginal value of +1 surround = totalBaseD / 100
  // Marginal value of +1 base d   = 1 + totalSurround / 100
  var ratio, grade;
  if (affectsPlayer && hasSurround) {
    var surrRatio = perfect.perfectSurr > 0 ? bestSurr / perfect.perfectSurr : 0;
    var baseRatio = perfect.perfectD > 0 ? (cogStats.d || 0) / perfect.perfectD : 0;
    var totalBaseD = (opts && opts.totalBaseD) || 1;
    var totalSurround = (opts && opts.totalSurround) || 0;
    var margSurr = totalBaseD / 100;
    var margBase = 1 + totalSurround / 100;
    var wTotal = margSurr + margBase;
    var wS = wTotal > 0 ? margSurr / wTotal : 0.5;
    var wB = wTotal > 0 ? margBase / wTotal : 0.5;
    ratio = wS * surrRatio + wB * baseRatio;
  } else {
    // Non-directional or not affecting player: grade on d vs perfectD
    ratio = perfect.perfectD > 0 ? (cogStats.d || 0) / perfect.perfectD : 0;
  }

  if (ratio >= 0.85) grade = 'S';
  else if (ratio >= 0.70) grade = 'A';
  else if (ratio >= 0.50) grade = 'B';
  else if (ratio >= 0.30) grade = 'C';
  else grade = 'D';

  return {
    grade: grade,
    ratio: Math.round(ratio * 10000) / 100, // pct of perfect (= percentile)
    percentile: Math.round(ratio * 10000) / 100,
    hasSurround: hasSurround,
    affectsPlayer: !!affectsPlayer,
    perfect: perfect,
    odds: odds,
  };
}

/**
 * Compute small cog bonus value.
 * type: 0=flaggy (2×), 1=build (4×), 2=exp (1×)
 */
export function smallCogBonus(type, level) {
  var base = (25 + 25 * level * level) * (1 + level / 5);
  if (type === 0) return Math.round(2 * base);
  if (type === 1) return Math.round(4 * base);
  return Math.round(base);
}

/**
 * Parse a small cog name into type + level.
 * e.g. "CogSma3" → { type: 0, level: 3 }, "CogSmb5" → { type: 1, level: 5 }
 */
export function parseSmallCog(name) {
  if (!name || name.indexOf('CogSm') !== 0) return null;
  var N2L = '_abcdefghijklmnopqrstuvwxyz';
  var typeChar = name.charAt(5);
  var type = N2L.indexOf(typeChar);
  var level = parseInt(name.substring(6)) || 0;
  return { type: type, level: level, bonus: smallCogBonus(type, level) };
}

/**
 * Judge whether a small cog should be kept or replaced.
 * Expected level after N days ≈ geometric distribution mean.
 */
export function judgeSmallCog(type, level) {
  // Small cog level probability: base 0 + up to 9 coin flips (50% each)
  // P(level >= L) = 0.5^L for L >= 1 (geometric)
  // P(exactly L) = 0.5^(L+1) for L < 9, P(9) = 0.5^9
  var oneInN = level <= 0 ? 1 : Math.round(Math.pow(2, level));
  var grade;
  if (oneInN >= 128) grade = 'S';
  else if (oneInN >= 32) grade = 'A';
  else if (oneInN >= 8) grade = 'B';
  else if (oneInN >= 4) grade = 'C';
  else grade = 'D';

  return {
    grade: grade,
    bonus: smallCogBonus(type, level),
    oneInN: oneInN,
    suggestion: level <= 1 ? 'Replace when possible' : null,
  };
}
