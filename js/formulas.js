// ===== FORMULA ENGINE =====
// Core formula evaluator functions traced from game source.
// These are pure functions with no side effects or state dependencies.

/**
 * ArbitraryCode5Inputs — the game's universal formula evaluator.
 * Used by stamps, talents, bubbles, and dozens of other systems.
 *
 * @param {string} type - Formula type: "add","decay","bigBase","reduce", etc.
 * @param {number} x1 - First parameter from data definition
 * @param {number} x2 - Second parameter from data definition
 * @param {number} lv - Effective level (the input that scales)
 * @returns {number}
 */
export function formulaEval(type, x1, x2, lv) {
  switch (type) {
    case 'add':
      return x2 !== 0
        ? ((x1 + x2) / x2 + 0.5 * (lv - 1)) / (x1 / x2) * lv * x1
        : x1 * lv;
    case 'addLower':
      return x1 + x2 * (lv + 1);
    case 'addDECAY':
      return lv < 50001
        ? x1 * lv
        : x1 * Math.min(50000, lv) + (lv - 50000) / (lv - 50000 + 150000) * x1 * 50000;
    case 'decay':
      return x1 * lv / (lv + x2);
    case 'decayLower':
      return x1 * (lv + 1) / (lv + 1 + x2) - x1 * lv / (lv + x2);
    case 'decayMulti':
      return 1 + x1 * lv / (lv + x2);
    case 'decayMultiLower':
      return x1 * (lv + 1) / (lv + 1 + x2) - x1 * lv / (lv + x2);
    case 'bigBase':
      return x1 + x2 * lv;
    case 'bigBaseLower':
      return x2;
    case 'intervalAdd':
      return x1 + Math.floor(lv / x2);
    case 'intervalAddLower':
      return Math.max(Math.floor((lv + 1) / x2), 0) - Math.max(Math.floor(lv / x2), 0);
    case 'reduce':
      return x1 - x2 * lv;
    case 'reduceLower':
      return x1 - x2 * (lv + 1);
    case 'PtsSpentOnGuildBonus':
      return ((x1 + x2) / x2 + 0.5 * (lv - 1)) / (x1 / x2) * lv * x1 - x2 * lv;
    default:
      return 0;
  }
}

/**
 * getLOG — game's log helper.  Game uses Math.log(x)/2.30259 (truncated ln10).
 */
export function getLOG(x) {
  return Math.log(Math.max(x, 1)) / 2.30259;
}

// Native Rand (src 962): weekly selections use this, not combat's seeded RNG.
export function gameRandom(seed) {
  var first = seed | 0;
  var value = Math.imul(first, -862048943);
  value = Math.imul((value << 15) | (value >>> 17), 461845907);
  var state = (5381 ^ value) | 0;
  state = (Math.imul((state << 13) | (state >>> 19), 5) - 430675100) | 0;
  state = Math.imul(state ^ (state >> 16), -2048144789);
  state = Math.imul(state ^ (state >> 13), -1028477387);
  var second = (state ^ (state >> 16)) | 0;
  if (first === 0) first = 1;
  if (second === 0) second = 1;
  return function () {
    first = 36969 * (65535 & first) + (first >> 16);
    second = 18000 * (65535 & second) + (second >> 16);
    return ((1073741823 & (((first << 16) + second) | 0)) % 10007) / 10007;
  };
}
