// ===== MONUMENTS (W5) =====
import { getLOG } from '../../../formulas.js';
import { superBitType } from '../../../game-helpers.js';
import { klaData } from '../../../save/data.js';
import { holesBolaiaPerLv, monumentBonusText, monumentTrainingMilestones } from '../../data/w5/hole.js';
import { companionBonusForSave } from '../../data/common/companions.js';
import { computeBUpg, computeMonumentROGbonus } from './hole.js';
import { collectibleBonus, computeMeasurementBonus } from './jar.js';
import { computeWinBonus } from '../w6/summoning.js';
import { legendPTSbonus } from '../w7/spelunking.js';
import { computeMeritocBonusz } from '../w7/meritoc.js';
import { mineheadBonusQTY } from '../w7/minehead.js';
import { computeCompassBonus } from '../w7/compass.js';
import { arcadeBonus } from '../w2/arcade.js';
import { achieveStatus } from '../common/achievement.js';

const NAMES = ['Bravery', 'Justice', 'Wisdom'];
function _h(S, row, col) { return Number(S.holesData?.[row]?.[col]) || 0; }
function _study(S, idx) {
  const level = _h(S, 26, idx);
  if (idx === 9) return level >= 1 ? 50 + level * holesBolaiaPerLv(idx) : 0;
  if (idx === 3) return level >= 1 ? Math.min(32, 12 + level * holesBolaiaPerLv(idx)) : 0;
  return level * holesBolaiaPerLv(idx);
}
function _runtime(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(name + ' must be a nonnegative integer.');
  return value;
}

export function monumentTraining(S, charIdx = 0) {
  const sources = NAMES.map((name, t) => ({ name: name + ': All Monument AFK Gain', val: computeMonumentROGbonus(t, 8, S) }));
  sources.push(
    { name: 'Summoning victories', val: computeWinBonus(25, { charIdx }, S) },
    { name: 'Jar collectible: Monument AFK gain', val: collectibleBonus(S, 19, legendPTSbonus(29, S)) },
    { name: 'Rock Smart', val: computeBUpg(81, 20, S) },
    { name: 'Monument AFK measurement', val: computeMeasurementBonus(S, 11) },
    { name: 'Arcade: Monument AFK gain', val: arcadeBonus(42, S).val },
    { name: 'Hug from Timmy', val: 10 * achieveStatus(311, S) },
    { name: 'Compass: Monument AFK gain', val: computeCompassBonus(55, S) },
  );
  const v = sources.map(s => s.val);
  const pct = v[0] + (v[1] + v[2] + (v[3] + (v[4] + (v[5] + (v[6] + (v[7] + (v[8] + v[9])))))));
  const multi = 1 + mineheadBonusQTY(19, Number(S.stateR7?.[4]) || 0) / 100;
  const rate = (1 + pct / 100) * multi;
  return { sources, pct, multi, rate, perDay: Math.floor(24 * rate) };
}

export function monumentRewardCharge(S, t, charIdx = 0, extraSeconds = 0) {
  if (!Number.isInteger(t) || t < 0 || t > 2 || !Number.isFinite(extraSeconds) || extraSeconds < 0)
    throw new Error('Invalid monument or additional waiting time.');
  const legend = legendPTSbonus(27, S), meritoc = computeMeritocBonusz(7, S, charIdx);
  const b70 = computeBUpg(70, 2, S), b96 = computeBUpg(96, 2, S);
  const gaming = 10 * superBitType(31, S.gamingData?.[12]);
  const maxLinear = 86400 * (t === 1
    ? 2 + (b70 + b96 + gaming) + (14 * (_h(S, 26, 9) >= 1 ? 1 : 0) + legend / 24)
    : 2 + (b70 + b96 + (gaming + legend / 24)));
  const seconds = _h(S, 11, 11 + t) + extraSeconds;
  const base = Math.min(seconds, maxLinear) / 72000 + (Math.pow(1 + Math.max(0, seconds - maxLinear) / 72000, .3) - 1);
  const multi = base * (1 + meritoc / 100) * (1 + legend / 100);
  return { seconds, maxLinear, base, meritoc, legend, multi, canStart: multi >= 1 };
}

export function monumentRunStats(S, t, runtime = {}) {
  const hours = _h(S, 14, 2 * t), milestones = _h(S, 14, 1 + 2 * t);
  const hr = i => milestones > i ? 1 : 0;
  const opalChance = Math.min(.5, Math.pow(.5, _h(S, 7, [3, 9, 12][t]))
    * (1 + computeMonumentROGbonus(t, 5, S) / 100) * (t === 1 ? 1 + _study(S, 9) / 100 : 1));
  const common = { hours, milestones, opalChance };
  if (t === 0) {
    const maxRerolls = Math.round(5 * hr(2) + 10 * hr(6));
    const rerolls = _runtime(runtime.rerolls ?? maxRerolls, 'Remaining rethrows');
    const boosts = _runtime(runtime.boosts ?? 0, 'Damage boosts');
    if (rerolls > maxRerolls) throw new Error('Remaining rethrows exceed the saved maximum.');
    const maxDmg = (25 + 10 * Math.floor(hours / 6) * computeBUpg(24, 1, S))
      * (1 + computeMeasurementBonus(S, 1) / 100)
      * (1 + computeBUpg(40, 10, S) * rerolls / 100) * (1 + 10 * boosts / 100);
    const minDmg = 3 + Math.floor(hours / 6) * computeBUpg(24, 1, S) + _study(S, 3) / 100 * maxDmg;
    return { ...common, minDmg, maxDmg, rerolls, maxRerolls, boosts,
      swords: Math.round(Math.min(9, 3 + 2 * hr(1) + hr(3) + hr(5) + hr(7))),
      retellings: hr(4), rightmost: computeBUpg(25, 1, S) === 1, autoKill: _h(S, 26, 3) >= 1 };
  }
  if (t === 1) return { ...common,
    coins: Math.round((5 + Math.log2(Math.max(1, hours)) * computeBUpg(61, 1, S)) * (.5 * hr(3) + 1.5 * hr(6) + 1)),
    health: Math.round(1 + hr(1) + hr(4) + 2 * hr(7)),
    popularity: Math.round(3 + 7 * hr(5)), dismissals: Math.round(hr(2) + hr(4) + 2 * hr(7)) };
  if (t === 2) return { ...common, attempts: Math.round(5 + _study(S, 12) + (4 * hr(4) + Math.floor(2 * getLOG(hours)))),
    attemptsPerBoard: Math.round(2 * hr(1) + hr(6)), instamatches: Math.round(4 * hr(3) + 5 * hr(7)),
    revealRow: hr(2) === 1, revealSquare: hr(5) === 1, secondsPerMatch: 12.6 };
  throw new Error('Unknown monument.');
}

export function monumentMilestones(S, t, rate) {
  const stats = monumentRunStats(S, t);
  return monumentTrainingMilestones(t).map((row, i) => ({
    ...row, unlocked: stats.milestones > i, ready: stats.hours >= row.hours,
    hoursNeeded: Math.max(0, row.hours - stats.hours),
    realHours: stats.hours >= row.hours ? 0 : Math.max(1, Math.ceil(row.hours - stats.hours) / rate),
  }));
}

export function monumentBonusRows(S, t) {
  return Array.from({ length: 10 }, (_, i) => {
    const slot = 10 * t + i, level = _h(S, 15, slot), text = monumentBonusText(slot);
    const h = S.holesData.slice(), levels = (h[15] || []).slice();
    levels[slot] = level + 1; h[15] = levels;
    return { level, text, value: computeMonumentROGbonus(t, i, S),
      next: computeMonumentROGbonus(t, i, { ...S, holesData: h }) };
  });
}

// Symmetry avoids cancellation near the upper tail of the Irwin-Hall CDF.
function _sumCdf(x, count, lo, hi) {
  if (count === 0) return x <= 0 ? 0 : 1;
  const low = Math.min(lo, hi), high = Math.max(lo, hi);
  if (low === high) return x <= count * low ? 0 : 1;
  const z = (x - count * low) / (high - low);
  if (z <= 0) return 0;
  if (z >= count) return 1;
  if (z > count / 2) return 1 - _sumCdf(count - z, count, 0, 1);
  let sum = 0, choose = 1, factorial = 1;
  for (let k = 2; k <= count; k++) factorial *= k;
  for (let k = 0; k <= Math.floor(z); k++) {
    if (k) choose = choose * (count - k + 1) / k;
    sum += (k % 2 ? -1 : 1) * choose * Math.pow(z - k, count);
  }
  return Math.max(0, Math.min(1, sum / factorial));
}

export function braverySwordOdds(S, { wave = 0, boosts = 0, rerolls, remainingHP = null } = {}) {
  _runtime(wave, 'Enemies defeated');
  if (wave > 1000) throw new Error('Enemies defeated must be at most 1000.');
  const stats = monumentRunStats(S, 0, { boosts, rerolls });
  const hp = (10 + 15 * wave) * Math.pow(1.3, wave);
  if (remainingHP != null && (!Number.isFinite(remainingHP) || remainingHP <= 0))
    throw new Error('Remaining HP must be greater than zero.');
  const cdf = (threshold, n) => _sumCdf(threshold, n, stats.minDmg, stats.maxDmg);
  const automatic = stats.autoKill && stats.minDmg >= hp;
  const kill = automatic ? 1 : 1 - cdf(hp, stats.swords);
  const finish = automatic ? 1 : Math.max(0, cdf(hp, stats.swords - 1) - cdf(hp, stats.swords));
  return { ...stats, wave, hp, automatic, kill,
    boostChance: automatic ? 1 : stats.rightmost ? finish : 0,
    lastSwordChance: remainingHP == null ? null : 1 - cdf(remainingHP, 1),
    nextDamageFactor: (1 + 10 * (boosts + 1) / 100) / (1 + 10 * boosts / 100) };
}

export function monumentSnapshot(S, charIdx = 0) {
  if (![11, 14, 15].every(row => Array.isArray(S.holesData?.[row]))) return { available: false };
  const notes = [];
  if (!S.companionDataAvailable) notes.push('Companion ownership is missing; reward levels and companion-dependent sources are partial.');
  if (!S.stateR7Available) notes.push('Minehead progress is missing; Clutch Overtime Block is unknown and shown without its bonus.');
  if (Number(S.olaData?.[453]) === 7 && klaData[charIdx]?.[250] == null)
    notes.push('Selected character Summoning access is missing; the active Monument Meritoc bonus is unknown.');
  return { available: true, notes, training: monumentTraining(S, charIdx),
    rewardLevelMulti: Math.max(1, 1 + companionBonusForSave(135, S) / 100),
    monuments: NAMES.map((name, t) => ({ name, stats: monumentRunStats(S, t),
      charge: monumentRewardCharge(S, t, charIdx), tomorrow: monumentRewardCharge(S, t, charIdx, 86400),
      bonuses: monumentBonusRows(S, t) })) };
}
