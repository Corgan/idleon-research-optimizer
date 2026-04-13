// ===== FORMAT HELPERS - pure display formatting =====
// No DOM or global state references.

export function fmtTime(hrs) {
  if (!isFinite(hrs) || hrs <= 0) return '\u2014';
  if (hrs < 1) return Math.round(hrs * 60) + 'm';
  if (hrs < 24) return hrs.toFixed(1) + 'h';
  const d = Math.floor(hrs / 24);
  const h = Math.round(hrs % 24);
  if (d > 365) return (d / 365).toFixed(1) + 'y';
  return d + 'd ' + h + 'h';
}

// Precise time: includes minutes and seconds (for decision tree nodes).
export function fmtTimePrecise(hrs) {
  if (!isFinite(hrs) || hrs <= 0) return '\u2014';
  const totalSec = Math.round(hrs * 3600);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (d > 365) return (d / 365).toFixed(1) + 'y';
  if (d > 0) return d + 'd ' + h + 'h ' + m + 'm ' + s + 's';
  if (h > 0) return h + 'h ' + m + 'm ' + s + 's';
  if (m > 0) return m + 'm ' + s + 's';
  return s + 's';
}

export function fmtExp(n) {
  if (n >= 1e24) return n.toExponential(2);
  if (n >= 1e21) return (n / 1e21).toFixed(2) + 'QQQ';
  if (n >= 1e18) return (n / 1e18).toFixed(2) + 'QQ';
  if (n >= 1e15) return (n / 1e15).toFixed(2) + 'Q';
  if (n >= 1e12) return (n / 1e12).toFixed(2) + 'T';
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n.toFixed(0);
}

export function fmtVal(v) {
  const a = Math.abs(v);
  if (a >= 1e24) return v.toExponential(2);
  if (a >= 1e21) return (v / 1e21).toFixed(2) + 'QQQ';
  if (a >= 1e18) return (v / 1e18).toFixed(2) + 'QQ';
  if (a >= 1e15) return (v / 1e15).toFixed(2) + 'Q';
  if (a >= 1e12) return (v / 1e12).toFixed(2) + 'T';
  if (a >= 1e9) return (v / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (a >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return v.toFixed(1);
}

export function fmtExact(v) {
  return Math.round(v).toLocaleString();
}

/**
 * Damage display tiers matching the game's character sheet.
 * Each entry: [maxThreshold, divisor, postDiv, prefix, suffix]
 *   - Values are divided by divisor, then by postDiv
 *   - prefix is prepended to the whole string, suffix appended to each number
 */
export const DMG_TIERS = [
  // max <        divisor  postDiv  prefix  suffix
  [1e7,           1,       1,       '',     '' ],   // raw integers
  [1e9,           1e3,     1e3,     '',     'M'],   // thousands
  [1e11,          1e5,     10,      '',     'M'],
  [1e13,          1e6,     1,       '',     'M'],
  [1e15,          1e9,     1e3,     '',     'T'],   // billions
  [1e17,          1e11,    10,      '',     'T'],
  [1e19,          1e12,    1,       '',     'T'],
  [1e21,          1e15,    1e3,     '💎',    '' ],   // quadrillions
  [1e23,          1e17,    10,      '💎',    '' ],
  [1e25,          1e18,    1,       '💎',    '' ],
  [1e27,          1e21,    1e3,     '💎',    'M'],  // 棘
  [1e28,          1e23,    10,      '💎',    'M'],
  [Infinity,      1e24,    1,       '💎',    'M'],
];

/**
 * Format Min~Max damage exactly like the game's character sheet.
 * Uses DMG_TIERS for notation — modify that array to change symbols.
 */
export function fmtDmgRange(min, max) {
  for (var t of DMG_TIERS) {
    if (max < t[0] || t[0] === Infinity) {
      var lo = Math.ceil(min / t[1]) / t[2];
      var hi = Math.ceil(max / t[1]) / t[2];
      return t[3] + lo + t[4] + '~' + hi + t[4];
    }
  }
}

/**
 * Format a number exactly like the game's MonsterCash vault display.
 * Game uses NotateNumber(MC, "Big") for MC > 1e16, with floor-truncation
 * rather than standard rounding. Matches the in-game Monster Tax tooltip.
 */
export function fmtMonsterCash(e) {
  if (e > 1e16) {
    // NotateNumber(e, "Big") — generic chain
    if (e < 100) return Math.floor(e) + '';
    if (e < 1e3) return Math.floor(e) + '';
    if (e < 1e4) return Math.ceil(e / 10) / 100 + 'K';
    if (e < 1e5) return Math.ceil(e / 100) / 10 + 'K';
    if (e < 1e6) return Math.ceil(e / 1e3) + 'K';
    if (e < 1e7) return Math.ceil(e / 1e4) / 100 + 'M';
    if (e < 1e8) return Math.ceil(e / 1e5) / 10 + 'M';
    if (e < 1e10) return Math.ceil(e / 1e6) + 'M';
    if (e < 1e13) return Math.ceil(e / 1e9) + 'B';
    if (e < 1e16) return Math.ceil(e / 1e12) + 'T';
    if (e < 1e19) return Math.ceil(e / 1e15) + 'Q';
    if (e < 1e22) return Math.ceil(e / 1e18) + 'QQ';
    if (e < 1e24) return Math.ceil(e / 1e21) + 'QQQ';
    var lg = Math.floor(Math.log10(e));
    return Math.floor(e / Math.pow(10, lg) * 100) / 100 + 'E' + lg;
  }
  if (e > 1e10) return Math.floor(e / 1e8) / 10 + 'B';
  if (e > 1e7) return Math.floor(e / 1e5) / 10 + 'M';
  // NotateNumber(e, "MultiplierInfo")
  if (e > 1e6) {
    if (Math.round(e / 1e6 * 100) % 100 === 0) return Math.round(e / 1e6) + '.00M';
    if (Math.round(e / 1e6 * 100) % 10 === 0) return Math.round(e / 1e6 * 10) / 10 + '0M';
    return Math.round(e / 1e6 * 100) / 100 + 'M';
  }
  if (Math.round(100 * e) % 100 === 0) return Math.round(e) + '.00';
  if (Math.round(100 * e) % 10 === 0) return Math.round(10 * e) / 10 + '0';
  return Math.round(100 * e) / 100 + '';
}

/** General-purpose number formatter with guards and finer precision for small values. */
export function fmtNum(n) {
  if (n === 0) return '0';
  if (typeof n !== 'number' || !isFinite(n)) return String(n);
  const a = Math.abs(n);
  if (a >= 1e24) return n.toExponential(2);
  if (a >= 1e21) return (n / 1e21).toFixed(2) + 'QQQ';
  if (a >= 1e18) return (n / 1e18).toFixed(2) + 'QQ';
  if (a >= 1e15) return (n / 1e15).toFixed(2) + 'Q';
  if (a >= 1e12) return (n / 1e12).toFixed(2) + 'T';
  if (a >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (a >= 1e4) return (n / 1e3).toFixed(1) + 'K';
  if (a >= 100) return Math.round(n).toLocaleString();
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}
