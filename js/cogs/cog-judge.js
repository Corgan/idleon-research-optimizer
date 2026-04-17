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
 * Convert a raw stat value into a contribution for a given stat mode.
 * conexp (d): max(floor(v^0.4 + 10*log(v)/ln10 - 5), 2)
 * flaggy (c): round(v^0.8)
 * build  (a): round(v)
 */
function _statFromVal(v, statMode) {
  if (statMode === 'build') return Math.round(v);
  if (statMode === 'flaggy') return Math.round(Math.pow(v, 0.8));
  // conexp
  if (v <= 0) return 2;
  return Math.max(
    Math.floor(Math.pow(v, 0.4) + 10 * Math.log(v) / 2.30259 - 5),
    2
  );
}

/**
 * Per-roll probability that a roll goes to the given stat.
 * Game: randomInt(1,100) → <69 = build(a), <89 && tier!=4 = flaggy(c), else = conexp(d)
 */
function _pStatPerRoll(tier, statMode) {
  if (statMode === 'build') return 0.68; // 68 out of 100 (1..68)
  if (statMode === 'flaggy') return tier === 4 ? 0 : 0.20; // 69..88 = 20; crystal skips c
  // conexp: 89..100 for standard = 0.12; crystal: 69..100 = 0.32
  return tier === 4 ? 0.32 : 0.12;
}

/**
 * Standard normal CDF approximation (Abramowitz & Stegun 26.2.17).
 */
function _normCdf(x) {
  if (x < -8) return 0;
  if (x > 8) return 1;
  var t = 1 / (1 + 0.2316419 * Math.abs(x));
  var d = 0.3989422804014327; // 1/sqrt(2*pi)
  var p = d * Math.exp(-x * x / 2) * t *
    (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x > 0 ? 1 - p : p;
}

/**
 * Build survival function for any stat: result[k] = P(total_stat >= k).
 * For conexp (d), uses exact convolution (small arrays due to heavy compression).
 * For build/flaggy, uses normal approximation (CLT) since arrays are too large for convolution.
 * statMode: 'conexp' | 'build' | 'flaggy'
 */
function _buildStatSurvival(tier, conLv, statMode) {
  var base = _rawMag(tier, conLv);
  var pStat = _pStatPerRoll(tier, statMode);
  if (pStat <= 0) return { nMin: new Float64Array([1]), nMax: new Float64Array([1]) };

  // val range from mult range [0.4, 3.0)
  var minVal = Math.floor(0.4 * base);
  var maxVal = Math.floor(3.0 * base);
  if (maxVal < 0) maxVal = 0;

  var maxS1 = _statFromVal(maxVal, statMode); // max stat contribution per roll

  // Build one-roll PMF: oneRoll[k] = P(stat_contribution = k)
  var oneRoll = new Float64Array(maxS1 + 1);
  oneRoll[0] = 1 - pStat; // roll goes to other stats

  for (var v = minVal; v <= maxVal; v++) {
    var pVal = _multCdf((v + 1) / base, tier) - _multCdf(v / base, tier);
    if (pVal <= 1e-15) continue;
    var sk = _statFromVal(v, statMode);
    oneRoll[sk] += pStat * pVal;
  }

  // For large PMFs (build/flaggy), use normal approximation via CLT
  if (maxS1 > 500) {
    // Compute mean and variance of one-roll PMF
    var mu1 = 0, mu2 = 0;
    for (var i = 0; i < oneRoll.length; i++) {
      mu1 += i * oneRoll[i];
      mu2 += i * i * oneRoll[i];
    }
    var var1 = mu2 - mu1 * mu1;

    var nMin = _minRolls(tier);
    var nMax = nMin + 1;
    return {
      normal: true,
      muMin: nMin * mu1, sdMin: Math.sqrt(nMin * var1),
      muMax: nMax * mu1, sdMax: Math.sqrt(nMax * var1)
    };
  }

  // For small PMFs (conexp), use exact convolution — return separate nMin and nMax tables
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

  var nMin = _minRolls(tier);
  var distMin = oneRoll;
  for (var r = 1; r < nMin; r++) distMin = convolve(distMin, oneRoll);
  var distMax = convolve(distMin, oneRoll);

  // Mix 50/50 for min/max roll counts
  var mixed = new Float64Array(distMax.length);
  for (var m = 0; m < distMin.length; m++) mixed[m] += 0.5 * distMin[m];
  for (var m = 0; m < distMax.length; m++) mixed[m] += 0.5 * distMax[m];

  // Convert to survival (P >= x)
  var surv = new Float64Array(mixed.length);
  var cum = 0;
  for (var i = mixed.length - 1; i >= 0; i--) { cum += mixed[i]; surv[i] = cum; }
  return surv;
}

/**
 * P(total_stat >= minVal) — cached per (tier, conLv, statMode).
 * Uses 50/50 mix of min/max roll count distributions.
 */
function _pStatGE(tier, conLv, minVal, statMode) {
  if (minVal <= 0) return 1;
  var key = statMode + ',' + tier + ',' + conLv;
  if (!_dSurvivalCache[key]) {
    _dSurvivalCache[key] = _buildStatSurvival(tier, conLv, statMode);
  }
  var surv = _dSurvivalCache[key];
  if (surv.normal) {
    var mu = 0.5 * surv.muMin + 0.5 * surv.muMax;
    var sd = Math.sqrt(0.5 * (surv.sdMin * surv.sdMin + surv.sdMax * surv.sdMax) + 0.25 * Math.pow(surv.muMax - surv.muMin, 2));
    return sd > 0 ? 1 - _normCdf((minVal - mu) / sd) : (minVal <= mu ? 1 : 0);
  }
  // Exact survival table (already 50/50 mixed)
  return minVal < surv.length ? surv[minVal] : 0;
}

/**
 * P(directional surround of given type) — flat probability of rolling that surround type.
 * surrType: 'e' (build surr), 'f' (conexp surr), 'g' (flaggy surr)
 * Crystal: P(reached cascade level) × P(got direction) × P(type match).
 * Standard: P(got direction) × P(surround type).
 */
/**
 * P(reaching exactly crystal level N) in the cascade.
 * Each level has 35% chance to advance; you stop when you fail or hit max (5).
 */
function _pCrystalCascade(cryLv) {
  if (cryLv < 0) return 1;  // not a crystal cog
  if (cryLv >= 5) return Math.pow(0.35, 5);            // max level
  return Math.pow(0.35, cryLv) * 0.65;                 // stopped at cryLv
}

function _pSurrGE(tier, hasSurr, cryLv, surrType) {
  if (!hasSurr) return 1;

  if (tier >= 4) {
    // Crystal: only e and f, no g
    if (surrType === 'g') return 0; // crystal never rolls g surround
    if (cryLv <= 0) return 1; // CogCry0 has no cascade surround
    // P(gotDir) × P(right type) — cascade probability applied separately
    return (1 - 0.75 * 0.666) * 0.5;
  }

  // Standard tiers
  if (tier <= 0) {
    // Tier 0: only e, range [5,10]
    if (surrType === 'e') return 0.1; // P(dir)=0.1, always e
    return 1; // f/g impossible at tier 0
  }
  if (tier === 1) {
    // Tier 1: P(dir)=0.25, then 0.7→e, 0.3→g
    var dirChance1 = 0.25;
    if (surrType === 'e') return dirChance1 * 0.7;
    if (surrType === 'g') return dirChance1 * 0.3;
    return 1; // f impossible at tier 1
  }

  // Tier 2-3: P(dir)=0.1
  var dirChance = 0.1;
  if (tier === 2) {
    // .65→e, .14→g, .105→f, .105→k
    if (surrType === 'e') return dirChance * 0.65;
    if (surrType === 'g') return dirChance * 0.14;
    if (surrType === 'f') return dirChance * 0.105;
    return 1;
  }
  // tier 3 (Ulti)
  // .5→e, .15→g, .105→f, .245→j
  if (surrType === 'e') return dirChance * 0.5;
  if (surrType === 'g') return dirChance * 0.15;
  if (surrType === 'f') return dirChance * 0.105;
  return 1;
}

/**
 * Warm up the odds cache (pre-build survival tables for the default conexp mode).
 * Build/flaggy use normal approximation and are computed lazily (instant).
 */
export function warmOddsCache(conLv) {
  _dSurvivalCache = {};
  _dSurvivalCache['conexp,3,' + conLv] = _buildStatSurvival(3, conLv, 'conexp');
  _dSurvivalCache['conexp,4,' + conLv] = _buildStatSurvival(4, conLv, 'conexp');
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
  // Perfect flaggy: all rolls → c (game uses round(mag^0.8))
  var perfectC = Math.round(Math.pow(mag, 0.8)) * rolls;
  // Perfect conExp: all rolls → d (game uses mag as float)
  var perD = Math.max(Math.floor(Math.pow(mag, 0.4) + 10 * Math.log(Math.max(mag, 1)) / 2.30259 - 5), 2);
  var perfectD = perD * rolls;

  // Surround max: T3 → randomInt(20,65), crystal → randomInt(30,40)+23*cryLv
  // T3 max = 65; CogCry5 max = 40 + 23*5 = 155
  var perfectSurr = tier >= 4 ? 155 : tier === 3 ? 65 : 0;

  return { perfectA: perfectA, perfectC: perfectC, perfectD: perfectD, perfectSurr: perfectSurr, mag: mag, rolls: rolls };
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
 * opts.statMode: 'conexp' (default) | 'build' | 'flaggy'
 *   conexp → base stat d, surround f
 *   build  → base stat a, surround e
 *   flaggy → base stat c, surround g
 *
 * @param {{ a, c, d, e, f, g, h, name }} cogStats
 * @param {number} tier - Cog tier (0-4)
 * @param {number} maxConLv - Highest construction level
 * @param {Object} [opts] - { isShelf, affectsPlayer, statMode, dailyRolls }
/**
 * Estimate the weight for maxRolls (0=definitely minRolls, 1=definitely maxRolls).
 * Uses the observed stat values to guess how many rolls the cog got.
 * Each non-zero stat had at least 1 roll; divide value by expected per-roll
 * to estimate how many rolls went to each stat. Compare total to min/max.
 */
export function judgeCog(cogStats, tier, maxConLv, opts) {
  if (tier < 0) return { grade: '?', percentile: -1 };

  var isShelf = opts && opts.isShelf;
  var affectsPlayer = opts && opts.affectsPlayer;
  var statMode = (opts && opts.statMode) || 'conexp';

  // Shelf cogs don't get graded
  if (isShelf) return { grade: '-', percentile: -1 };

  // Only grade ulti (tier 3) and crystal (tier 4) cogs — lower tiers get F
  if (tier < 3) return { grade: 'F', gradeOneInN: 1, hasSurround: false, affectsPlayer: false, perfect: perfectCogStats(tier, maxConLv), odds: { oneInN: 1, dOneInN: 1 } };

  var perfect = perfectCogStats(tier, maxConLv);

  // Map stat mode to base stat key and surround key
  var baseKey = statMode === 'build' ? 'a' : statMode === 'flaggy' ? 'c' : 'd';
  var surrKey = statMode === 'build' ? 'e' : statMode === 'flaggy' ? 'g' : 'f';

  var hasSurround = !!(cogStats.h && (cogStats.e || cogStats.f || cogStats.g || cogStats.j));
  var surrVal = cogStats[surrKey] || 0;
  var hasSurrForMode = surrVal > 0 && !!cogStats.h;

  // Roll odds: exact probability from analytical stat distribution × surround probability
  var cryLv = tier >= 4 ? crystalLevel(cogStats.name) : -1;
  var pCascade = _pCrystalCascade(cryLv);  // 1.0 for non-crystal
  var baseVal = cogStats[baseKey] || 0;

  var pStatOnly = _pStatGE(tier, maxConLv, baseVal, statMode);
  var pBase = pStatOnly * pCascade;
  var pS = _pSurrGE(tier, hasSurrForMode, cryLv, surrKey);
  var jointP = pBase * pS;
  var jointOneInN = jointP > 0 ? 1 / jointP : 1e9;
  if (jointOneInN < 1) jointOneInN = 1;
  var baseOneInN = pBase > 0 ? 1 / pBase : 1e9;
  if (baseOneInN < 1) baseOneInN = 1;
  // True odds: full cascade × stat × surround — the actual probability of this exact cog
  var trueP = pCascade * pStatOnly * pS;
  var trueOneInN = trueP > 0 ? 1 / trueP : 1e9;
  if (trueOneInN < 1) trueOneInN = 1;
  var odds = { oneInN: jointOneInN, dOneInN: baseOneInN, trueOneInN: trueOneInN };

  // Grade: if directional affects player, use full joint odds (cascade + surround).
  // If crystal doesn't affect player, ignore cascade — all crystal tiers share base stat odds.
  var gradeOneInN;
  if (affectsPlayer && hasSurrForMode) {
    gradeOneInN = jointOneInN;
  } else if (cryLv >= 0 && !affectsPlayer) {
    // Crystal not affecting player: grade on base stat only (no cascade penalty)
    gradeOneInN = pStatOnly > 0 ? 1 / pStatOnly : 1e9;
    if (gradeOneInN < 1) gradeOneInN = 1;
  } else {
    gradeOneInN = baseOneInN;
  }

  var dailyRolls = (opts && opts.dailyRolls) || 1;
  var expectedDays = gradeOneInN / dailyRolls;

  var grade;
  if (tier >= 4) {
    // Crystal cogs: grade on expected days (time-gated by daily limit)
    if      (expectedDays >= 1825) grade = 'SSS'; // 5+ years
    else if (expectedDays >= 365)  grade = 'SS';  // 1-5 years
    else if (expectedDays >= 90)   grade = 'S';   // 3-12 months
    else if (expectedDays >= 30)   grade = 'A';   // 1-3 months
    else if (expectedDays >= 7)    grade = 'B';   // 1-4 weeks
    else if (expectedDays >= 1)    grade = 'C';   // 1-7 days
    else                           grade = 'D';   // < 1 day
  } else {
    // Ulti cogs: grade on raw 1-in-N odds
    if      (gradeOneInN >= 1000000) grade = 'SSS';
    else if (gradeOneInN >= 250000)  grade = 'SS';
    else if (gradeOneInN >= 50000)   grade = 'S';
    else if (gradeOneInN >= 5000)    grade = 'A';
    else if (gradeOneInN >= 2500)    grade = 'B';
    else if (gradeOneInN >= 1000)    grade = 'C';
    else                             grade = 'D';
  }

  return {
    grade: grade,
    gradeOneInN: gradeOneInN,
    expectedDays: expectedDays,
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
 * Game uses Number2Letter.indexOf(char) for type:
 *   CogSm_ → type 0 (flaggy, 2×), CogSma → type 1 (build, 4×), CogSmb → type 2 (exp, 1×)
 */
var _SM_N2L = '_abcdefghijklmnopqrstuvwxyz';
export function parseSmallCog(name) {
  if (!name || name.indexOf('CogSm') !== 0) return null;
  var type = _SM_N2L.indexOf(name.charAt(5));
  if (type < 0) return null;
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
