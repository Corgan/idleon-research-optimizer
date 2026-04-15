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

// ===== ANALYTICAL ODDS COMPUTATION =====
// d and surround are generated independently, so:
//   P(d >= D AND surr >= S) = P(d >= D) × P(surr >= S)
// Both computed exactly from the game's roll formulas — no Monte Carlo needed.

var _dSurvivalCache = {};

/**
 * CDF of the multiplier distribution: P(mult <= x) for a given tier.
 * mult is a mixture of 3 uniform distributions weighted by bucket probabilities.
 */
function _multCdf(x, tier) {
  var maxBucket = 100 + 40 * Math.floor(tier / 4);
  // bucket uniform on {1..maxBucket}; thresholds at 50 and 75
  var pLow  = 49 / maxBucket;             // mult ~ U[0.4, 1.5)
  var pMid  = 25 / maxBucket;             // mult ~ U[0.4, 2.0)
  var pHigh = (maxBucket - 74) / maxBucket; // mult ~ U[0.4, 3.0)

  function uCdf(v, a, b) {
    if (v <= a) return 0;
    if (v >= b) return 1;
    return (v - a) / (b - a);
  }

  return pLow  * uCdf(x, 0.4, 1.5) +
         pMid  * uCdf(x, 0.4, 2.0) +
         pHigh * uCdf(x, 0.4, 3.0);
}

/**
 * Convert a stat value into a d (con exp %) contribution.
 * Matches the game formula exactly.
 */
function _dFromVal(v) {
  if (v <= 0) return 2; // max(floor(0 + 0 - 5), 2) = 2
  return Math.max(
    Math.floor(Math.pow(v, 0.4) + 10 * Math.log(v) / 2.30259 - 5),
    2
  );
}

/**
 * Build survival function: result[k] = P(total_d >= k).
 * Enumerates all possible val values, maps to d, then convolves per-roll PMF.
 */
function _buildDSurvival(tier, conLv) {
  var base = _rawMag(tier, conLv);
  var pD = tier === 4 ? 0.32 : 0.12; // probability a roll goes to d stat

  // val range from mult range [0.4, 3.0)
  var minVal = Math.floor(0.4 * base);
  var maxVal = Math.floor(3.0 * base);
  if (maxVal < 0) maxVal = 0;

  var maxD1 = _dFromVal(maxVal); // max d contribution per roll

  // Build one-roll PMF: oneRoll[k] = P(d_contribution = k)
  var oneRoll = new Float64Array(maxD1 + 1);
  oneRoll[0] = 1 - pD; // roll goes to a or c instead

  for (var v = minVal; v <= maxVal; v++) {
    var pVal = _multCdf((v + 1) / base, tier) - _multCdf(v / base, tier);
    if (pVal <= 1e-15) continue;
    var dk = _dFromVal(v);
    oneRoll[dk] += pD * pVal;
  }

  // Convolve two discrete PMFs (polynomial multiplication)
  function convolve(a, b) {
    var result = new Float64Array(a.length + b.length - 1);
    for (var i = 0; i < a.length; i++) {
      if (a[i] < 1e-15) continue;
      for (var j = 0; j < b.length; j++) {
        if (b[j] < 1e-15) continue;
        result[i + j] += a[i] * b[j];
      }
    }
    return result;
  }

  // nRolls = minRolls with 50% chance of +1
  var nMin = _minRolls(tier);
  var distMin = oneRoll;
  for (var r = 1; r < nMin; r++) distMin = convolve(distMin, oneRoll);
  var distMax = convolve(distMin, oneRoll); // one extra roll

  // Mix 50/50
  var len = Math.max(distMin.length, distMax.length);
  var dist = new Float64Array(len);
  for (var i = 0; i < len; i++) {
    dist[i] = 0.5 * (i < distMin.length ? distMin[i] : 0) +
              0.5 * (i < distMax.length ? distMax[i] : 0);
  }

  // Convert to survival function: survival[k] = P(d >= k)
  var survival = new Float64Array(len);
  var cumRight = 0;
  for (var i = len - 1; i >= 0; i--) {
    cumRight += dist[i];
    survival[i] = cumRight;
  }

  return survival;
}

/**
 * P(total_d >= minD) — exact, cached per (tier, conLv).
 */
function _pDGE(tier, conLv, minD) {
  if (minD <= 0) return 1;
  var key = tier + ',' + conLv;
  if (!_dSurvivalCache[key]) {
    _dSurvivalCache[key] = _buildDSurvival(tier, conLv);
  }
  var surv = _dSurvivalCache[key];
  if (minD >= surv.length) return 0;
  return surv[minD];
}

/**
 * P(surround magnitude >= minS) — exact, from the surround generation formula.
 * Matches the game's directional/crystal cascade logic.
 */
function _pSurrGE(tier, minS) {
  if (minS <= 0) return 1;

  if (tier >= 4) {
    // Crystal cascade: each level k (1-5) has P(reach) = 0.35^k,
    // dirE is RESET at each level — only the final level's value matters.
    var prob = 0;
    for (var k = 1; k <= 5; k++) {
      var pReachK = Math.pow(0.35, k);
      var pStopAtK = k < 5 ? pReachK * 0.65 : pReachK;
      // P(gotDir) = 1 - (1-0.25)*(1-0.334) = 0.5005
      var pGotSurr = (1 - 0.75 * 0.666) * 0.5;
      var sMin = 30 + 23 * k, sMax = 40 + 23 * k; // 11 values
      if (minS > sMax) continue;
      var count = sMax - Math.max(minS, sMin) + 1;
      prob += pStopAtK * pGotSurr * (count / 11);
    }
    return prob;
  }

  // Standard tiers
  var dirChance = tier === 1 ? 0.25 : 0.1;
  var eChance, eMin, eMax;
  if (tier === 0) { eChance = 1; eMin = 5; eMax = 10; }
  else if (tier === 1) { eChance = 0.7; eMin = 8; eMax = 15; }
  else if (tier === 2) { eChance = 0.65; eMin = 12; eMax = 40; }
  else { eChance = 0.5; eMin = 20; eMax = 65; }

  if (minS > eMax) return 0;
  var count = eMax - Math.max(minS, eMin) + 1;
  var total = eMax - eMin + 1;
  return dirChance * eChance * (count / total);
}

/**
 * Warm up the odds cache (pre-build d survival for relevant tiers).
 * Resolves immediately — odds are now computed analytically, no sim needed.
 */
export function warmOddsCache(conLv) {
  // Pre-build d survival tables so the first judgeCog call is instant
  _dSurvivalCache = {};
  _dSurvivalCache['3,' + conLv] = _buildDSurvival(3, conLv);
  _dSurvivalCache['4,' + conLv] = _buildDSurvival(4, conLv);
}

/**
 * Clear the odds cache (call when conLv changes).
 */
export function clearOddsCache() {
  _dSurvivalCache = {};
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

  // Roll odds: exact probability from analytical d distribution × surround probability
  var conSurr = cogStats.f || 0;
  var pD = _pDGE(tier, maxConLv, cogStats.d || 0);
  var pS = _pSurrGE(tier, conSurr);
  var jointP = pD * pS;
  var jointOneInN = jointP > 0 ? Math.round(1 / jointP) : 1e9;
  if (jointOneInN < 1) jointOneInN = 1;
  var odds = { oneInN: jointOneInN };

  // Grade calculation — ratio of actual / perfect
  // total = sum(all base d) × (1 + sum(player surround) / 100)
  // Marginal value of +1 surround = totalBaseD / 100
  // Marginal value of +1 base d   = 1 + totalSurround / 100
  var ratio, grade;
  if (affectsPlayer && hasSurround) {
    var surrRatio = perfect.perfectSurr > 0 ? conSurr / perfect.perfectSurr : 0;
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
