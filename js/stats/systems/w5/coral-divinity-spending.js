// ===== CLAIMED DIVINITY SPENDING / SINGULARITY (W5) =====

import { getLOG } from '../../../formulas.js';
import { cauldronInfoData, divinityData, optionsListData } from '../../../save/data.js';
import { finalBubbleValByKey } from '../w2/alchemy.js';
import { rowValues } from '../common/combat-sim-setup.js';
import { coralKidUpgradeCost, coralKidUpgradeEffect, CORAL_KID_UNLOCK_LEVELS, CORAL_KID_SINGULARITY_UNLOCK_LEVELS, offeringCost } from './coral-god-rank.js';

const ODDS = [0.01, 0.05, 0.1, 0.25, 0.5, 1];
const LOW = [[0, .76 * .94], [1, .24 * .94], [2, .06]];
const HIGH = [[3, .83 * .965], [4, .17 * .965], [5, .035]];

function _number(value) {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? (n === 0 ? 0 : n) : null;
}

function _require(value, name, integer = false) {
  const n = _number(value);
  if (n == null || integer && !Number.isInteger(n)) throw new Error(name + ' is missing or invalid.');
  return n;
}

export function singularityTransmute({ points, kills, hours, valueLevel }) {
  points = _require(points, 'Claimed Divinity points');
  kills = _require(kills, 'Banked kill credit');
  hours = _require(hours, 'Banked hours');
  valueLevel = _require(valueLevel, 'Transmute value upgrade level', true);
  const base = (getLOG(points) + Math.max(0, 5 * (getLOG(points) - 12)))
    * (1 + coralKidUpgradeEffect(7, valueLevel) / 100);
  const killMulti = 1 + (5 * Math.max(0, Math.log(Math.max(kills, 1)) / Math.log(2) - 16)
    + Math.max(0, 25 * Math.floor(getLOG(kills) - 5))) / 100;
  const timeMulti = .1 + (5 * Math.min(120, hours) + 5 * Math.pow(Math.max(0, hours - 120), .5)) / 100;
  const raw = Math.min(1e9, base * killMulti * timeMulti);
  if (![base, killMulti, timeMulti, raw].every(Number.isFinite)) throw new Error('Transmute arithmetic exceeds the supported numeric range.');
  return { base, killMulti, timeMulti, raw, spirals: Math.floor(raw), canTransmute: raw >= 1 };
}

export function singularityPointReserve(input, spirals) {
  spirals = _require(spirals, 'Minimum Spiral payout', true);
  if (spirals > 1e9) throw new Error('The native Spiral payout cap is one billion.');
  singularityTransmute(input);
  if (spirals === 0) return { available: true, points: 0, spirals };
  if (singularityTransmute({ ...input, points: Number.MAX_VALUE }).spirals < spirals)
    return { available: false, points: null, spirals, reason: 'That payout cannot be reached with these frozen kill/hour banks.' };
  // Positive IEEE doubles are ordered by their bits. Search actual representable
  // balances, including the native floor, instead of trusting an inverse-log boundary.
  const data = new DataView(new ArrayBuffer(8));
  data.setFloat64(0, Number.MAX_VALUE);
  let lo = 0n, hi = data.getBigUint64(0);
  while (lo < hi) {
    const mid = (lo + hi) >> 1n;
    data.setBigUint64(0, mid);
    if (singularityTransmute({ ...input, points: data.getFloat64(0) }).spirals >= spirals) hi = mid;
    else lo = mid + 1n;
  }

  data.setBigUint64(0, lo);
  return { available: true, points: data.getFloat64(0), spirals };
}

export function singularityBreakpoints(input) {
    input = { ...input, ...Object.fromEntries(['points', 'kills', 'hours'].map(key => [key, _require(input[key], key)])) };
    const now = singularityTransmute(input), target = Math.min(1e9, now.spirals + 1);
    const thresholds = {};
    for (const key of ['points', 'kills', 'hours']) {
      const reaches = value => singularityTransmute({ ...input, [key]: value }).spirals >= target;
      if (reaches(input[key])) { thresholds[key] = input[key]; continue; }
      if (!reaches(Number.MAX_VALUE)) { thresholds[key] = null; continue; }
      const bits = new DataView(new ArrayBuffer(8));
      bits.setFloat64(0, input[key]);
      let lo = bits.getBigUint64(0);
      bits.setFloat64(0, Number.MAX_VALUE);
      let hi = bits.getBigUint64(0);
      while (lo < hi) {
        const mid = (lo + hi) >> 1n;
        bits.setBigUint64(0, mid);
        if (reaches(bits.getFloat64(0))) hi = mid; else lo = mid + 1n;
      }
      bits.setBigUint64(0, lo);
      thresholds[key] = bits.getFloat64(0);
    }
    return { target, capped: now.spirals === 1e9, thresholds,
      additional: Object.fromEntries(Object.entries(thresholds).map(([key, value]) => [key, value == null ? null : value - input[key]])) };
  }

export function divinityClaimOutcome({ seconds, pointsPerHour, expPerHour, capped, hourMultiplier, tranqiPerHour = 0 }) {
    seconds = _require(seconds, 'Pending AFK seconds');
    if (typeof capped !== 'boolean') throw new Error('The saved ten-hour prayer cap is unavailable.');
    if (hourMultiplier != null) hourMultiplier = _require(hourMultiplier, 'Singularity hour credit multiplier');
    const creditedSeconds = seconds > 120 ? Math.min(Math.round(seconds), capped ? 36000 : Infinity) : 0;
    const wholeHours = Math.floor(creditedSeconds / 3600);
    const result = { creditedSeconds, wholeHours,
      points: pointsPerHour == null ? null : creditedSeconds / 3600 * _require(pointsPerHour, 'Divinity point rate'),
      baseExp: expPerHour == null ? null : creditedSeconds / 3600 * _require(expPerHour, 'Divinity EXP rate'),
      tranqiExp: tranqiPerHour == null ? null : wholeHours * _require(tranqiPerHour, 'TranQi EXP rate'),
      hours: hourMultiplier == null ? null : wholeHours * hourMultiplier,
      lostSeconds: seconds > 120 ? Math.max(0, Math.round(seconds) - creditedSeconds) : 0,
      nextWholeHourSeconds: capped && creditedSeconds >= 36000 ? 0 : Math.max(0, (wholeHours + 1) * 3600 - seconds),
    };
    if (Object.values(result).some(value => value != null && !Number.isFinite(value)))
      throw new Error('Divinity claim arithmetic exceeds the supported numeric range.');
    return result;
  }

export function singularityCadence(input, { pointsPerHour, killCreditPerHour, hoursPerHour, claimers, maxHours = 168 }) {
    singularityTransmute(input);
    pointsPerHour = _require(pointsPerHour, 'Projected Divinity point rate');
    killCreditPerHour = _require(killCreditPerHour, 'Observed net kill-credit rate');
    hoursPerHour = _require(hoursPerHour, 'Projected banked hours per hour');
    maxHours = _require(maxHours, 'Cadence comparison horizon', true);
    if (maxHours < 1 || maxHours > 168) throw new Error('Compare one through 168 whole-hour transmutation intervals.');
    if (claimers != null) {
      if (!Array.isArray(claimers) || !claimers.length) throw new Error('Other-character claim inputs are required.');
      const characters = claimers.map(c => {
        if (typeof c.capped !== 'boolean') throw new Error('A character prayer cap is unavailable.');
        return { ...c, ci: _require(c.ci, 'Character index', true), pointsPerHour: _require(c.pointsPerHour, 'Character Divinity point rate'),
          hourMultiplier: _require(c.hourMultiplier, 'Character hour credit multiplier') };
      });
      if (new Set(characters.map(c => c.ci)).size !== characters.length) throw new Error('Claim characters must be unique.');
      const pointRate = characters.reduce((sum, c) => sum + c.pointsPerHour, 0);
      const hourRate = characters.reduce((sum, c) => sum + c.hourMultiplier, 0);
      if (pointRate !== pointsPerHour || hourRate !== hoursPerHour) throw new Error('Cycle rates do not match the character claims.');
      const hasCapped = characters.some(c => c.capped);
      const cappedCharacters = characters.filter(c => c.capped);
      const rows = [];
      let best = null, largestClaim = null;
      // Integer-second cycles keep claims safely beyond the native rounding boundaries.
      for (let seconds = 121; seconds <= maxHours * 3600; seconds++) {
        const tail = seconds % 36000;
        if (hasCapped && seconds > 36000 && tail > 0 && tail <= 120) continue;
        let points = 0, bankedHours = 0;
        const priorClaims = Math.floor((seconds - 1) / 36000);
        for (let i = 0; i < priorClaims; i++) {
          for (const c of cappedCharacters) {
            points += 10 * c.pointsPerHour;
            bankedHours += 10 * c.hourMultiplier;
          }
        }
        for (const c of characters) {
          const credited = c.capped ? seconds - priorClaims * 36000 : seconds;
          points += (credited / 3600) * c.pointsPerHour;
          bankedHours += Math.floor(credited / 3600) * c.hourMultiplier;
        }
        const kills = killCreditPerHour * (seconds / 3600);
        const cycle = singularityTransmute({ points, kills, hours: bankedHours, valueLevel: input.valueLevel });
        const row = { seconds, hours: seconds / 3600, points, kills, bankedHours,
          spirals: cycle.spirals, perHour: cycle.spirals / (seconds / 3600) };
        if (!best || row.perHour > best.perHour) best = row;
        if (!largestClaim || row.spirals > largestClaim.spirals) largestClaim = row;
        if (seconds % 3600 === 0) rows.push(row);
      }
      if (best.spirals <= 0) return { best: null, rows, resolutionSeconds: 1 };
      if (!rows.includes(best)) rows.push(best);
      if (!rows.includes(largestClaim)) rows.push(largestClaim);
      rows.sort((a, b) => a.seconds - b.seconds);
      const claims = characters.map(c => {
        const intervalSeconds = c.capped ? Math.min(36000, best.seconds) : best.seconds;
        const count = Math.floor(best.seconds / intervalSeconds);
        const remainderSeconds = best.seconds % intervalSeconds;
        return { ci: c.ci, intervalSeconds, count, finalSeconds: remainderSeconds > 120 ? remainderSeconds : 0,
          unclaimedSeconds: remainderSeconds > 0 && remainderSeconds <= 120 ? remainderSeconds : 0 };
      });
      return { best, rows, claims, largestClaims: [{ ...largestClaim, ci: null }], resolutionSeconds: 1 };
    }
    const rows = [];
    for (let hours = 1; hours <= maxHours; hours++) {
      const cycle = singularityTransmute({ points: pointsPerHour * hours, kills: killCreditPerHour * hours,
        hours: hoursPerHour * hours, valueLevel: input.valueLevel });
      rows.push({ hours, spirals: cycle.spirals, perHour: cycle.spirals / hours });
    }
    const best = rows.reduce((best, row) => row.perHour > best.perHour ? row : best, rows[0]);
    return { best: best.spirals > 0 ? best : null, rows };
  }

export function planSingularityCycle(input, rates) {
  const cadence = singularityCadence(input, rates);
  if (!cadence.best) return { ...cadence, spending: null };
  const hours = cadence.best.hours;
  const cycle = { ...input, points: cadence.best.points ?? rates.pointsPerHour * hours,
    kills: cadence.best.kills ?? rates.killCreditPerHour * hours, hours: cadence.best.bankedHours ?? rates.hoursPerHour * hours };
  const spending = planCoralDivinitySpending(cycle, {
    targets: input.levels.map(level => _require(level, 'Saved Coral level', true) + 1000),
    minimumSpirals: cadence.best.spirals,
  });
  return { ...cadence, spending };
}

export function planSingularityStrategies(input, rates) {
  singularityTransmute(input);
  const maxHours = _require(rates.maxHours ?? 168, 'Timing horizon', true);
  const visitSeconds = _require(rates.visitSeconds ?? 0, 'Seconds away per claim', true);
  const killRate = _require(rates.killCreditPerHour, 'Active kill-credit rate');
  if (maxHours < 1 || maxHours > 168 || visitSeconds > 3600)
    throw new Error('Timing supports one through 168 hours and at most 3600 seconds away per claim.');
  if (!Array.isArray(rates.claimers) || !rates.claimers.length) throw new Error('Other-character claim inputs are required.');
  const characters = rates.claimers.map(c => {
    if (typeof c.capped !== 'boolean') throw new Error('A character prayer cap is unavailable.');
    return { ...c, ci: _require(c.ci, 'Character index', true), pointsPerHour: _require(c.pointsPerHour, 'Character Divinity point rate'),
      hourMultiplier: _require(c.hourMultiplier, 'Character hour credit multiplier') };
  });
  if (new Set(characters.map(c => c.ci)).size !== characters.length) throw new Error('Claim characters must be unique.');
  const productive = characters.filter(c => c.pointsPerHour > 0);
  const search = rotating => {
    const roster = rotating ? productive : characters;
    if (!roster.length) return { strategy: 'rotating', best: null, rows: [] };
    const rows = [];
    let best = null;
    const largestClaims = [];
    const limit = Math.floor(maxHours * 3600 / (rotating ? roster.length : 1));
    for (let seconds = Math.max(1, visitSeconds + 1); seconds <= limit; seconds++) {
      const lapSeconds = rotating ? seconds * roster.length : seconds;
      const offlineSeconds = lapSeconds - visitSeconds;
      const fightSeconds = seconds - (rotating ? visitSeconds : roster.length * visitSeconds);
      if (offlineSeconds <= 120 || fightSeconds <= 0) continue;
      const kills = killRate * (fightSeconds / 3600);
      let points = 0, bankedHours = 0, spirals = 0, executable = true;
      const payouts = [];
      for (const c of roster) {
        const credited = Math.min(offlineSeconds, c.capped ? 36000 : Infinity);
        const claimPoints = (credited / 3600) * c.pointsPerHour;
        const claimHours = Math.floor(credited / 3600) * c.hourMultiplier;
        if (rotating) {
          const payout = singularityTransmute({ points: claimPoints, kills, hours: claimHours, valueLevel: input.valueLevel });
          if (!payout.canTransmute) { executable = false; break; }
          spirals += payout.spirals;
          payouts.push(payout.spirals);
        }
        points += claimPoints;
        bankedHours += claimHours;
      }
      if (!executable) continue;
      if (!rotating) spirals = singularityTransmute({ points, kills, hours: bankedHours, valueLevel: input.valueLevel }).spirals;
      const row = { seconds: lapSeconds, hours: lapSeconds / 3600, gapSeconds: rotating ? seconds : lapSeconds,
        fightSeconds, offlineSeconds, points, kills, bankedHours, spirals, perHour: spirals / (lapSeconds / 3600) };
      if (!best || row.perHour > best.perHour) best = row;
      for (let i = 0; i < (rotating ? roster.length : 1); i++) {
        const payout = rotating ? payouts[i] : spirals;
        if (!largestClaims[i] || payout > largestClaims[i].claimSpirals)
          largestClaims[i] = { ...row, ci: rotating ? roster[i].ci : null, claimSpirals: payout };
      }
      if (lapSeconds % 3600 === 0) rows.push(row);
    }
    if (best?.spirals > 0 && !rows.includes(best)) rows.push(best);
    for (const largest of largestClaims) {
      if (!rows.some(row => row.seconds === largest.seconds)) rows.push(largest);
    }
    rows.sort((a, b) => a.seconds - b.seconds);
    return { strategy: rotating ? 'rotating' : 'grouped', best: best?.spirals > 0 ? best : null, rows, largestClaims };
  };
  const grouped = search(false), rotating = search(true);
  // Retain the earlier cap-aware grouped scope when visits are explicitly free.
  if (visitSeconds === 0) {
    const capped = singularityCadence(input, { ...rates, maxHours,
      pointsPerHour: characters.reduce((sum, c) => sum + c.pointsPerHour, 0),
      hoursPerHour: characters.reduce((sum, c) => sum + c.hourMultiplier, 0) });
    if (capped.best && (!grouped.best || capped.best.perHour > grouped.best.perHour))
      Object.assign(grouped, capped, { capAware: true });
  }
  const selected = rotating.best && (!grouped.best || rotating.best.perHour > grouped.best.perHour) ? rotating : grouped;
  const comparisons = [grouped, rotating].map(({ strategy, best, rows }) => ({ strategy, best, rows }));
  if (!selected.best) return { ...selected, comparisons, visitSeconds, spending: null, visits: [] };
  const b = selected.best;
  const roster = selected.strategy === 'rotating' ? productive : characters;
  const curves = (selected.strategy === 'rotating' ? roster : [null]).map(c => {
    const rows = selected.rows.map(row => {
      const claim = c ? divinityClaimOutcome({ seconds: row.offlineSeconds, capped: c.capped,
        pointsPerHour: c.pointsPerHour, hourMultiplier: c.hourMultiplier }) : null;
      const points = c ? claim.points : row.points, bankedHours = c ? claim.hours : row.bankedHours;
      return { seconds: row.seconds, hours: row.hours, points, kills: row.kills, bankedHours,
        ...singularityTransmute({ points, kills: row.kills, hours: bankedHours, valueLevel: input.valueLevel }),
        perHour: row.perHour };
    });
    const largest = selected.largestClaims.find(row => row.ci === (c?.ci ?? null));
    return { ci: c?.ci ?? null, rows, bestRateSeconds: b.seconds, largestClaimSeconds: largest.seconds };
  });
  const visits = roster.map(c => {
    const claim = divinityClaimOutcome({ seconds: b.offlineSeconds ?? b.seconds, capped: c.capped,
      pointsPerHour: c.pointsPerHour, hourMultiplier: c.hourMultiplier });
    const payout = selected.strategy === 'rotating' ? singularityTransmute({
      points: claim.points, kills: b.kills, hours: claim.hours, valueLevel: input.valueLevel }).spirals : null;
    return { ci: c.ci, ...claim, spirals: payout };
  });
  const targets = input.levels.map(level => _require(level, 'Saved Coral level', true) + 1000);
  let spending = null;
  if (selected.strategy === 'grouped') {
    spending = planCoralDivinitySpending({ ...input, points: b.points, kills: b.kills, hours: b.bankedHours },
      { targets, minimumSpirals: b.spirals });
  } else {
    let levels = input.levels.slice();
    for (const visit of visits) {
      visit.spending = planCoralDivinitySpending({ ...input, levels, points: visit.points, kills: b.kills, hours: visit.hours },
        { targets, minimumSpirals: visit.spirals });
      levels = visit.spending.levels.slice();
    }
  }
  return { ...selected, comparisons, curves, visitSeconds, visits, spending, resolutionSeconds: 1,
    excludedClaimers: characters.filter(c => !productive.includes(c)).map(c => c.ci) };
}

export function compareSingularityPurchases(input, cadence, upgrades, { horizonHours = 168 } = {}) {
  const now = singularityTransmute(input);
  horizonHours = _require(horizonHours, 'Purchase comparison horizon');
  if (!(horizonHours > 0) || horizonHours > 8760) throw new Error('Purchase horizon must be positive and at most one year.');
  if (!cadence.best || !Array.isArray(cadence.visits) || !cadence.visits.length)
    throw new Error('An executable captured claim schedule is required.');
  const hours = _require(cadence.best.hours, 'Captured cycle hours');
  if (!(hours > 0)) throw new Error('Captured cycle hours must be positive.');
  const future = upgrade => {
    let points = 0, bankedHours = 0, spirals = 0;
    for (const visit of cadence.visits) {
      const c = upgrade.characters?.find(c => c.ci === visit.ci);
      if (!c) throw new Error('A captured character has unavailable upgraded claim inputs.');
      let claims;
      const grouped = cadence.claims?.find(c => c.ci === visit.ci);
      if (cadence.strategy === 'grouped' && grouped) {
        claims = Array.from({ length: grouped.count }, () => grouped.intervalSeconds);
        if (grouped.finalSeconds) claims.push(grouped.finalSeconds);
      } else claims = [cadence.best.offlineSeconds ?? cadence.best.seconds];
      let claimPoints = 0, claimHours = 0;
      for (const seconds of claims) {
        const claim = divinityClaimOutcome({ seconds, capped: c.capped,
          pointsPerHour: _require(c.pointsPerHour, 'Upgraded character point rate'),
          hourMultiplier: _require(c.hourMultiplier, 'Upgraded character hour multiplier') });
        claimPoints += claim.points;
        claimHours += claim.hours;
      }
      if (cadence.strategy === 'rotating') {
        const payout = singularityTransmute({ points: claimPoints, kills: cadence.best.kills,
          hours: claimHours, valueLevel: upgrade.valueLevel });
        if (!payout.canTransmute) throw new Error('This purchase leaves a rotating visit without an executable payout.');
        spirals += payout.spirals;
      }
      points += claimPoints;
      bankedHours += claimHours;
    }
    if (cadence.strategy === 'grouped') spirals = singularityTransmute({
      points, kills: cadence.best.kills, hours: bankedHours, valueLevel: upgrade.valueLevel }).spirals;
    return spirals;
  };
  const cycles = Math.floor(horizonHours / hours);
  const rows = upgrades.map(upgrade => {
    const row = { ...upgrade, affordable: false, immediateLoss: null, immediateSpirals: null,
      futureSpirals: null, perHour: null, gainPerHour: null, netSpirals: null, paybackHours: null };
    delete row.characters;
    if (!row.unlocked) { row.reason = 'Locked'; return row; }
    if (!Number.isFinite(row.cost) || row.cost < 0 || row.error) {
      row.reason = row.error ?? 'Saved purchase cost is unavailable.'; return row;
    }
    if (!now.canTransmute) { row.reason = 'Current banks cannot fund a transmutation.'; return row; }
    if (row.currency === 'points') {
      if (input.points < row.cost) { row.reason = 'Not affordable from claimed points.'; return row; }
      const payout = singularityTransmute({ ...input, points: input.points - row.cost });
      row.immediateSpirals = payout.spirals;
      if (!payout.canTransmute) { row.reason = 'Buying leaves no executable transmutation.'; return row; }
    } else {
      if (now.spirals < row.cost) { row.reason = 'Not affordable from this new Spiral stack.'; return row; }
      // Native removeitems debits the unrounded quote, then rounds the stack left.
      row.immediateSpirals = Math.round(now.spirals - row.cost);
    }
    row.affordable = true;
    row.immediateLoss = now.spirals - row.immediateSpirals;
    try {
      row.futureSpirals = future(upgrade);
      row.perHour = row.futureSpirals / hours;
      const gain = row.futureSpirals - cadence.best.spirals;
      row.gainPerHour = gain / hours;
      row.netSpirals = cycles * gain - row.immediateLoss;
      if (!row.immediateLoss && gain >= 0) row.paybackHours = 0;
      else if (gain > 0) {
        let count = Math.ceil(row.immediateLoss / gain);
        while (count * gain < row.immediateLoss) count++;
        row.paybackHours = count * hours;
      }
    } catch (error) { row.reason = error.message; }
    return row;
  });
  const ranked = rows.filter(row => row.affordable && row.netSpirals > 0)
    .sort((a, b) => b.netSpirals - a.netSpirals || a.immediateLoss - b.immediateLoss || a.index - b.index);
  return { rows, best: ranked[0] ?? null, horizonHours, cycles, cycleHours: hours,
    baselineSpirals: now.spirals, baselinePerHour: cadence.best.perHour };
}

export function coralSpendingInputs(S, { rawSave, charIdx = 0 } = {}) {
  const div = S.divinityData ?? divinityData;
  const ola = S.optionsListData ?? optionsListData;
  const raw = rawSave?.data ?? rawSave;
  let totalLevels = null, totalLevelsError = null;
  if (raw) {
    const keys = Object.keys(raw).filter(key => /^(?:Lv0|Exp0|CharacterClass|SL|SM|PlayerStuff|PVtStarSign|PVFishingToolkit|PVStatList|FoodSlO|AttackLoadout|MaxCarryCap|InventoryOrder|ItemQTY|AnvilPAstats|AnvilPA|AnvilPAselect)_\d+$/.test(key));
    const count = Math.max(rawSave?.charNames?.length ?? 0, ...keys.map(key => Number(key.split('_').at(-1)) + 1), 0);
    if (count > 0) {
      totalLevels = 0;
      for (let ci = 0; ci < count; ci++) {
        let row = raw['Lv0_' + ci];
        if (typeof row === 'string') {
          try { row = JSON.parse(row); }
          catch (error) { totalLevelsError = 'A saved character level row is malformed: ' + error.message; }
        }
        const lv = _number(rowValues(row)[14]);
        if (lv == null || !Number.isInteger(lv)) {
          totalLevelsError ??= 'A saved character Divinity level is missing or invalid.';
          totalLevels = null; break;
        }
        totalLevels = Math.round(totalLevels + lv);
      }
    }
  }
  const activation = _number(ola?.[426]);
  const unlock = _number(S.menagerieData?.[2]?.[2]);
  let y4 = null, freeChanceError = null;
  if (cauldronInfoData?.[3]?.[32] != null) {
    try { y4 = _number(Number(finalBubbleValByKey('Y4', charIdx, S))); }
    catch (error) { freeChanceError = 'Free-cost bonus could not be evaluated: ' + error.message; }
  }
  return {
    points: _number(div?.[24]), rank: _number(div?.[25]),
    tiers: [_number(div?.[26]), _number(div?.[27])],
    levels: Array.from({ length: 6 }, (_, i) => _number(ola?.[427 + i])),
    kills: _number(ola?.[623]), hours: _number(ola?.[624]), valueLevel: _number(ola?.[617]),
    activated: activation == null ? null : activation !== 0,
    singularityUnlocked: unlock == null ? null : unlock >= 1,
    totalLevels, totalLevelsError, freeChance: y4 == null ? null : Math.min(.35, y4 / 100), freeChanceError,
    divCostAfter3: S.serverVarDivCostAfter3Available === true ? _number(S.serverVarDivCostAfter3) : null,
    freeChancePartial: y4 != null && S.companionDataAvailable !== true,
  };
}

function _rankModel(input, rank) {
  const costs = ODDS.map((_, tier) => {
    const cost = offeringCost(0, {}, { godRank: rank, tier, divCostAfter3: input.divCostAfter3 });
    if (!cost.available || !Number.isFinite(cost.value)) throw new Error('God Rank offering cost is unavailable (server cost factor or numeric overflow).');
    return cost.value;
  });
  const pairs = LOW.flatMap(([low, p]) => HIGH.map(([high, q]) => ({ tiers: [low, high], probability: p * q })));
  const choose = (tiers, future) => tiers.reduce((best, tier, slot) => {
    const value = costs[tier] + (1 - ODDS[tier]) * future;
    const tied = best != null && Math.abs(value - best.value) <= 8 * Number.EPSILON * Math.max(value, best.value);
    return best == null || !tied && value < best.value || tied && ODDS[tier] > best.chance
      ? { slot, tier, value, chance: ODDS[tier], cost: costs[tier] } : best;
  }, null);
  let lo = 0;
  let hi = costs[5] / .035;
  for (let i = 0; i < 100; i++) {
    const mid = lo + (hi - lo) / 2;
    const value = pairs.reduce((sum, pair) => sum + pair.probability * choose(pair.tiers, mid).value, 0);
    if (value > mid) lo = mid; else hi = mid;
  }
  const chance = pairs.reduce((sum, pair) => sum + pair.probability * choose(pair.tiers, hi).chance, 0);
  return { costs, future: hi, attempts: 1 / chance, choose };
}

export function godRankTargetEstimate(input, target) {
  const rank = _require(input.rank, 'Saved God / God Rank', true);
  target = _require(target, 'Target God / God Rank', true);
  if (target < rank || target - rank > 100) throw new Error('Choose a rank target from the saved rank through 100 additional ranks.');
  if (target > rank && (!Array.isArray(input.tiers) || input.tiers.length !== 2
    || !Number.isInteger(input.tiers[0]) || input.tiers[0] < 0 || input.tiers[0] > 2
    || !Number.isInteger(input.tiers[1]) || input.tiers[1] < 3 || input.tiers[1] > 5))
    throw new Error('Saved offering choices are missing or invalid.');
  let paidEstimate = 0, expectedAttempts = 0;
  const stages = [];
  for (let current = rank; current < target; current++) {
    const model = _rankModel(input, current);
    let paid = model.future, attempts = model.attempts;
    if (current === rank) {
      const choice = model.choose(input.tiers, model.future);
      paid = choice.value;
      attempts = 1 + (1 - choice.chance) * model.attempts;
    }
    stages.push({ rank: current, paidEstimate: paid, expectedAttempts: attempts });
    paidEstimate += paid;
    expectedAttempts += attempts;
  }
  if (!Number.isFinite(paidEstimate)) throw new Error('God Rank target cost exceeds the supported numeric range.');
  return { target, paidEstimate, expectedSpend: input.freeChance == null ? null : paidEstimate * (1 - input.freeChance), expectedAttempts, stages };
}

export function godRankConfidencePlan(input, target, probability = .95) {
  godRankTargetEstimate(input, target);
  probability = _require(probability, 'Rank success probability');
  if (probability <= 0 || probability >= 1) throw new Error('Rank success probability must be strictly between zero and one.');
  const count = target - input.rank, stages = [];
  const stageTarget = Math.pow(probability, 1 / Math.max(1, count));
  const rerolledChance = HIGH.reduce((sum, [tier, mass]) => sum + mass * ODDS[tier], 0);
  let budget = 0, successProbability = 1;
  for (let rank = input.rank; rank < target; rank++) {
    const model = _rankModel(input, rank), first = rank === input.rank;
    const firstChance = first ? ODDS[input.tiers[1]] : rerolledChance;
    const firstCost = first ? model.costs[input.tiers[1]] : model.costs[5];
    let attempts = 1;
    if (firstChance < stageTarget)
      attempts += Math.ceil(Math.log((1 - stageTarget) / (1 - firstChance)) / Math.log1p(-rerolledChance));
    const chance = 1 - (1 - firstChance) * Math.pow(1 - rerolledChance, attempts - 1);
    const cost = firstCost + (attempts - 1) * model.costs[5];
    if (!Number.isFinite(cost) || !Number.isFinite(budget + cost)) throw new Error('Rank confidence budget exceeds the numeric range.');
    stages.push({ rank, attempts, firstTier: first ? input.tiers[1] : null, budget: cost, chance });
    budget += cost;
    successProbability *= chance;
  }
  return { target, probability, successProbability, budget, stages,
    attempts: stages.reduce((sum, stage) => sum + stage.attempts, 0),
    policy: 'Use the saved high offering first, then the high offering after each native reroll. Stop each rank at success or its attempt limit.',
    conservative: true };
}

export function godRankOfferingOutcomes(input, plan, { stateLimit = 32768 } = {}) {
  const rank = _require(input.rank, 'Saved God Rank', true);
  const points = _require(input.points, 'Offering point bank');
  const free = _require(input.freeChance, 'Free offering chance');
  if (free > .35 || !Number.isInteger(stateLimit) || stateLimit < 1)
    throw new Error('Invalid offering probability-state settings.');
  godRankTargetEstimate(input, plan.target);
  if (!Array.isArray(plan.stages) || plan.stages.length !== plan.target - rank
    || plan.stages.some((stage, i) => stage.rank !== rank + i || !Number.isInteger(stage.attempts) || stage.attempts < 1))
    throw new Error('Invalid bounded God Rank offering policy.');
  let active = new Map(), terminal = new Map();
  const add = (map, state) => {
    if (state.probability === 0) return;
    const key = JSON.stringify([state.rank, state.points, state.spent, state.tier, state.used, state.attempts]);
    const prior = map.get(key);
    if (prior) prior.probability += state.probability;
    else map.set(key, state);
    if (active.size + terminal.size + (map === active || map === terminal ? 0 : map.size) > stateLimit)
      throw new Error('God Rank probability-state limit exceeded; no probability mass was discarded.');
  };
  const stop = state => add(terminal, { ...state, tier: null, used: 0 });
  add(active, { rank, points, spent: 0, tier: input.tiers[1], used: 0, attempts: 0, probability: 1 });
  while (active.size) {
    const next = new Map();
    for (const state of active.values()) {
      if (state.rank === plan.target) { stop(state); continue; }
      const stage = plan.stages[state.rank - rank];
      if (state.used >= stage.attempts) { stop(state); continue; }
      const cost = offeringCost(0, {}, { godRank: state.rank, tier: state.tier, divCostAfter3: input.divCostAfter3 });
      if (!cost.available || !Number.isFinite(cost.value)) throw new Error('God Rank offering cost is unavailable.');
      // Native affordability precedes the free roll, even when every offer is free.
      if (state.points < cost.value) { stop(state); continue; }
      for (const [paid, paymentChance] of [[false, free], [true, 1 - free]])
        for (const [success, chance] of [[true, ODDS[state.tier]], [false, 1 - ODDS[state.tier]]]) {
          const outcome = { ...state, points: state.points - (paid ? cost.value : 0),
            spent: state.spent + (paid ? cost.value : 0),
            rank: state.rank + Number(success), used: success ? 0 : state.used + 1,
            attempts: state.attempts + 1, probability: state.probability * paymentChance * chance };
          if (outcome.rank === plan.target || !success && outcome.used === stage.attempts) stop(outcome);
          else for (const [tier, mass] of HIGH)
            add(next, { ...outcome, tier, probability: outcome.probability * mass });
        }
    }
    active = next;
  }
  const outcomes = [...terminal.values()].map(state => ({ ...state,
    success: state.rank === plan.target }));
  const mass = outcomes.reduce((sum, state) => sum + state.probability, 0);
  if (!Number.isFinite(mass) || Math.abs(mass - 1) > 1e-10)
    throw new Error('God Rank offering probability mass is not conserved.');
  return { outcomes, successProbability: outcomes.reduce((sum, s) => sum + (s.success ? s.probability : 0), 0) };
}

export function projectDivinityBankClaims(input, characters, { seconds = 0, killCredit = 0 } = {}) {
  seconds = _require(seconds, 'Additional banked seconds');
  killCredit = _require(killCredit, 'Additional active kill credit');
  const claims = characters.map(c => {
    const pending = _require(c.pendingSeconds, 'Saved AFK time for ' + c.name);
    return { ci: c.ci, name: c.name, seconds: pending + seconds,
      ...divinityClaimOutcome({ seconds: pending + seconds, pointsPerHour: c.claimPointsPerHour,
        expPerHour: c.claimExpPerHour, tranqiPerHour: c.tranqiPerHour, capped: c.capped, hourMultiplier: c.hourMultiplier }) };
  });
  const total = key => {
    if (claims.some(c => c[key] == null)) return null;
    const value = claims.reduce((sum, c) => sum + c[key], 0);
    if (!Number.isFinite(value)) throw new Error('Banked claim total exceeds the numeric range.');
    return value;
  };
  const points = total('points'), hours = total('hours');
  const bank = { ...input, points: points == null || input.points == null ? null : input.points + points,
    hours: hours == null || input.hours == null ? null : input.hours + hours,
    kills: input.kills == null ? null : input.kills + killCredit };
  if (['points', 'hours', 'kills'].some(key => bank[key] != null && !Number.isFinite(bank[key])))
    throw new Error('Projected bank exceeds the numeric range.');
  return { claims, bank, generatedPoints: points, baseExp: total('baseExp'), tranqiExp: total('tranqiExp'),
    creditedHours: hours, lostSeconds: total('lostSeconds') };
}

export function singularityKillGrind(input, { killCreditPerHour, minimumGain = .01, maxSeconds = 604800 } = {}) {
  input = { ...input, kills:_require(input.kills, 'Banked kill credit') };
  const rate = _require(killCreditPerHour, 'Active kill credit/hour');
  minimumGain = _require(minimumGain, 'Minimum extra Spirals per minute');
  maxSeconds = _require(maxSeconds, 'Remaining bonus-window seconds');
  if (!(minimumGain > 0)) throw new Error('Minimum extra Spirals per minute must be positive.');
  const before = singularityTransmute(input);
  if (!rate || before.raw <= 0) return { seconds: 0, kills: 0, before: before.spirals,
    after: before.spirals, nextMinuteGain: 0, windowLimited: false };
  const payout = seconds => singularityTransmute({ ...input,
    kills: _require(input.kills + rate * (seconds / 3600), 'Projected kill bank') }).spirals;
  const jumps = [65536];
  for (let decade = 6; decade <= 308; decade++) {
    const kills = Math.exp(decade * 2.30259) * (1 + 1e-12);
    if (Number.isFinite(kills)) jumps.push(kills);
  }
  const jumpTimes = jumps.map(kills => Math.ceil((kills - input.kills) / rate * 3600))
    .filter(seconds => seconds > 0 && seconds <= maxSeconds).sort((a,b) => a-b);
  let seconds = 0, value = before.spirals || before.raw;
  while (seconds < maxSeconds) {
    const next = Math.min(maxSeconds, seconds + 60), nextValue = payout(next);
    if ((nextValue / value - 1) / ((next - seconds) / 60) >= minimumGain) {
      seconds = next; value = nextValue; continue;
    }
    // A flat minute must not hide a nearby native decade jump. Crossing it
    // must still earn the requested average gain per minute spent reaching it.
    const jump = jumpTimes.find(t => t > next
      && (payout(t) / value - 1) / ((t - seconds) / 60) >= minimumGain);
    if (jump == null) break;
    seconds = jump; value = payout(jump);
  }
  return { seconds, kills: rate * (seconds / 3600), before: before.spirals, after: payout(seconds),
    nextMinuteGain: payout(seconds + 60) / value - 1,
    windowLimited: seconds === maxSeconds };
}

export function planDivinityBankRedemption(input, characters, {
  seconds = 0, killCredit = 0, maxPurchases = null, measure, rankPlan = null,
  beamWidth = 24, stateLimit = 4096, measurementLimit = 128, objective = 'spirals',
  killCreditPerHour = 0, minimumKillGain = .01, maxElapsedSeconds = 604800, farmerCi = null,
  rankRisk = false,
} = {}) {
  if (!['points', 'spirals'].includes(objective)) throw new Error('Invalid banked-claim objective.');
  seconds = _require(seconds, 'Additional banked seconds');
  killCredit = _require(killCredit, 'Additional kill bank');
  if (maxPurchases != null) maxPurchases = _require(maxPurchases, 'Maximum booster purchases', true);
  killCreditPerHour = _require(killCreditPerHour, 'Active kill credit/hour');
  minimumKillGain = _require(minimumKillGain, 'Minimum extra Spirals per minute');
  if (!(minimumKillGain > 0)) throw new Error('Minimum extra Spirals per minute must be positive.');
  maxElapsedSeconds = _require(maxElapsedSeconds, 'Remaining bonus-window seconds');
  if (farmerCi != null) farmerCi = _require(farmerCi, 'Active farmer', true);
  for (const [name, value] of Object.entries({ beamWidth, stateLimit, measurementLimit }))
    if (!Number.isInteger(value) || value < 1) throw new Error(name + ' must be a positive integer.');
  if (typeof measure !== 'function' || !Array.isArray(characters) || !characters.length
    || new Set(characters.map(c => c.ci)).size !== characters.length)
    throw new Error('Unique banked characters and a claim-rate evaluator are required.');
  if (!Array.isArray(input.levels) || input.levels.length !== 12)
    throw new Error('Twelve saved Coral/Spiral levels are required.');
  const levels = input.levels.map(level => _require(level, 'Saved upgrade level', true));
  if (rankPlan) {
    _require(rankPlan.budget, 'God Rank funding budget');
    _require(rankPlan.target, 'God Rank funding target', true);
    const chance = _require(rankPlan.successProbability, 'God Rank policy chance');
    if (chance <= 0 || chance > 1) throw new Error('God Rank policy chance must be positive and at most one.');
  }
  const rates = new Map();
  let limited = false, evaluated = 0, pruned = 0, measurements = 0;
  const measureState = state => {
    const key = JSON.stringify([state.levels, state.rank]);
    if (rates.has(key)) return rates.get(key);
    if (rates.size >= measurementLimit) {
      if (maxPurchases != null) { limited = true; return null; }
      rates.delete(rates.keys().next().value);
    }
    const rows = measure(state.levels.slice(), state.rank);
    if (!Array.isArray(rows) || rows.length !== characters.length
      || characters.some(c => rows.filter(row => row.ci === c.ci).length !== 1))
      throw new Error('Claim-rate evaluator returned mismatched characters.');
    rates.set(key, rows); measurements++;
    return rows;
  };
  const start = { levels, rank: _require(input.rank, 'Saved God Rank', true),
    points: _require(input.points, 'Saved Divinity bank'), hours: _require(input.hours, 'Saved hour bank'),
    kills: _require(input.kills, 'Saved kill bank') + killCredit, stacks: [], claimed: [],
    actions: [], purchases: 0, conditional: false, generatedPoints: 0, generatedExp: 0, convertedSpirals: 0,
    elapsedSeconds: 0 };
  const convert = state => {
    if (input.activated !== true || input.singularityUnlocked !== true) return null;
    if (killCreditPerHour > 0 && characters.some(c => c.ci === farmerCi) && !state.claimed.includes(farmerCi)) return null;
    const grind = singularityKillGrind({ ...state, valueLevel: state.levels[7] },
      { killCreditPerHour, minimumGain: minimumKillGain, maxSeconds: Math.max(0, maxElapsedSeconds - state.elapsedSeconds) });
    if (grind.seconds) state = { ...state, kills: state.kills + grind.kills,
      elapsedSeconds: state.elapsedSeconds + grind.seconds,
      actions: [...state.actions, { type: 'grind', ...grind, killCreditPerHour,
        elapsedSeconds: state.elapsedSeconds + grind.seconds }] };
    const payout = singularityTransmute({ ...state, valueLevel: state.levels[7] });
    if (!payout.canTransmute || input.activated !== true || input.singularityUnlocked !== true) return null;
    return { ...state, points: 0, hours: 0, kills: 0, stacks: [...state.stacks, payout.spirals],
      convertedSpirals: state.convertedSpirals + payout.spirals,
      actions: [...state.actions, { type: 'convert', points: state.points, hours: state.hours,
        kills: state.kills, spirals: payout.spirals, valueLevel: state.levels[7] }] };
  };
  const claim = (state, ci, rows) => {
    const c = rows.find(row => row.ci === ci);
    const pending = characters.find(row => row.ci === ci);
    const outcome = divinityClaimOutcome({ seconds: _require(pending.pendingSeconds, 'Saved AFK time') + seconds + state.elapsedSeconds,
      pointsPerHour: c.claimPointsPerHour, expPerHour: c.claimExpPerHour,
      tranqiPerHour: c.tranqiPerHour, capped: c.capped, hourMultiplier: c.hourMultiplier });
    if (outcome.points == null || outcome.hours == null)
      throw new Error('Claim inputs are unavailable for ' + pending.name + '.');
    const next = { ...state, points: state.points + outcome.points, hours: state.hours + outcome.hours,
      claimed: [...state.claimed, ci], generatedPoints: state.generatedPoints + outcome.points,
      generatedExp: outcome.baseExp == null || outcome.tranqiExp == null || state.generatedExp == null ? null
        : state.generatedExp + outcome.baseExp + outcome.tranqiExp,
      actions: [...state.actions, { type: 'claim', ci, name: pending.name, ...outcome,
        pointsPerHour: c.claimPointsPerHour, valueLevel: state.levels[7], elapsedSeconds: state.elapsedSeconds }] };
    if (['points', 'hours', 'generatedPoints', 'generatedExp'].some(key =>
      next[key] != null && !Number.isFinite(next[key]))) throw new Error('Banked claim total exceeds the numeric range.');
    return next;
  };
  const finish = (state, rows) => {
    let final = state;
    for (const c of characters) if (!final.claimed.includes(c.ci)) final = claim(final, c.ci, rows);
    final = convert(final) ?? final;
    return { ...final, retainedSpirals: final.stacks.reduce((sum, quantity) => sum + quantity, 0) };
  };
  const initialRates = measureState(start);
  const baseline = finish(start, initialRates);
  let best = baseline, beam = [start];
  const compare = (a, b) => (objective === 'points' ? b.generatedPoints - a.generatedPoints : 0)
    || b.retainedSpirals - a.retainedSpirals
    || Number(a.conditional) - Number(b.conditional) || a.purchases - b.purchases
    || a.actions.length - b.actions.length || b.points - a.points;
  if (maxPurchases == null) {
    const buy = (state, index) => {
      const threshold = index < 6 ? CORAL_KID_UNLOCK_LEVELS[index] : CORAL_KID_SINGULARITY_UNLOCK_LEVELS[index-6];
      if (input.activated !== true || index >= 6 && input.singularityUnlocked !== true
        || index !== 0 && index !== 6 && !(input.totalLevels >= threshold)) return null;
      const cost = coralKidUpgradeCost(index, state.levels[index]);
      if (!Number.isFinite(cost) || !(cost > 0)) return null;
      let points = state.points, stacks = state.stacks;
      if (index < 6) { if (cost > points) return null; points -= cost; }
      else {
        if (cost > stacks.reduce((sum,q) => sum+q,0)) return null;
        let debt = cost;
        stacks = stacks.map(q => { const used = Math.min(q,debt); debt -= used; return Math.round(q-used); }).filter(q => q>0);
      }
      const levels = state.levels.slice(); levels[index]++;
      return { ...state, levels, points, stacks, purchases: state.purchases+1,
        actions: [...state.actions, { type:'purchase', index, level:levels[index], cost,
          currency:index < 6 ? 'points' : 'spirals' }] };
    };
    const spend = (state, valueFirst) => {
      while (true) {
        const remaining = characters.filter(c => !state.claimed.includes(c.ci));
        if (remaining.length) {
          const current = measureState(state);
          const ordinary = buy(state,4);
          if (ordinary) {
            const changed = measureState(ordinary);
            if (remaining.some(c => changed.find(r => r.ci === c.ci).claimPointsPerHour
              > current.find(r => r.ci === c.ci).claimPointsPerHour)) { state = ordinary; continue; }
          }
          // Value reinvestment must repay its cost within the remaining finite
          // banked conversions, not an invented infinite future farming tail.
          const value = buy(state,7);
          if (value && valueFirst) {
            const frozen = [state, ...remaining.map(c => {
              const row = current.find(r => r.ci === c.ci);
              const reward = divinityClaimOutcome({ seconds:c.pendingSeconds+seconds+state.elapsedSeconds,
                pointsPerHour:row.claimPointsPerHour, capped:row.capped, hourMultiplier:row.hourMultiplier });
              return { points:reward.points, hours:reward.hours, kills:0 };
            })];
            const extra = frozen.reduce((sum, bank) => sum
              + singularityTransmute({ ...bank, valueLevel:value.levels[7] }).spirals
              - singularityTransmute({ ...bank, valueLevel:state.levels[7] }).spirals,0);
            if (extra >= value.actions.at(-1).cost) { state=value; continue; }
          }
          const points = buy(state,6);
          if (points) {
            const changed = measureState(points);
            if (remaining.some(c => changed.find(r => r.ci === c.ci).claimPointsPerHour
              > current.find(r => r.ci === c.ci).claimPointsPerHour)) { state=points; continue; }
          }
          const hours = buy(state,9);
          if (hours) {
            const changed = measureState(hours);
            if (remaining.some(c => changed.find(r => r.ci === c.ci).hourMultiplier
              > current.find(r => r.ci === c.ci).hourMultiplier)) { state=hours; continue; }
          }
        } else {
          const value = buy(state,7);
          if (value) {
            const before = singularityTransmute({ ...state, valueLevel:state.levels[7] }).spirals;
            const after = singularityTransmute({ ...value, valueLevel:value.levels[7] }).spirals;
            if (after-before > value.actions.at(-1).cost) { state=value; continue; }
          }
        }
        return state;
      }
    };
    const byBank = initialRates.slice().sort((a,b) =>
      a.claimPointsPerHour * characters.find(c => c.ci === a.ci).pendingSeconds
      - b.claimPointsPerHour * characters.find(c => c.ci === b.ci).pendingSeconds).map(c => c.ci);
    const orders = [...new Map([characters.map(c => c.ci), byBank, byBank.slice().reverse()]
      .map(order => farmerCi != null && order.includes(farmerCi) ? [farmerCi,...order.filter(ci => ci !== farmerCi)] : order)
      .map(order => [order.join(','),order])).values()];
    for (const order of orders) for (const valueFirst of [false,true]) for (const useRank of rankPlan && !rankRisk ? [false,true] : [false]) {
      let state = start;
      const fundRank = state => useRank && !state.conditional && state.points >= rankPlan.budget && rankPlan.target > state.rank
        ? { ...state, rank:rankPlan.target, points:state.points-rankPlan.budget, conditional:true,
          actions:[...state.actions,{ type:'rank',target:rankPlan.target,cost:rankPlan.budget,probability:rankPlan.successProbability }] }
        : state;
      for (const ci of order) {
        state = fundRank(state);
        state = spend(state,valueFirst);
        state = claim(state,ci,measureState(state));
        state = fundRank(state);
        state = spend(state,valueFirst);
        state = convert(state) ?? state;
        state = spend(state,valueFirst);
        evaluated++;
      }
      const completion = { ...state, retainedSpirals:state.stacks.reduce((sum,q) => sum+q,0) };
      if (compare(completion,best) < 0) best=completion;
    }
    let rankComparison = null, rankComparisonError = null;
    if (rankRisk && rankPlan && rankPlan.target > start.rank) {
      try {
        const reference = best;
        const net = state => state.generatedPoints - (state.offeringSpent ?? 0);
        const better = (a, b) => objective === 'points'
          ? a.netGain > b.netGain || a.netGain === b.netGain && a.spiralGain > b.spiralGain
          : a.spiralGain > b.spiralGain;
        let candidate = null, compared = 0;
        for (const order of orders) for (const valueFirst of [false, true]) {
          let prefix = start;
          // Compare one bounded attempt batch at every pre-spend boundary, both
          // before the first claim and immediately after each accepted claim.
          for (let position = 0; position < order.length; position++) {
            if (position) {
              prefix = spend(prefix, valueFirst);
              prefix = claim(prefix, order[position - 1], measureState(prefix));
            }
            const policies = [rankPlan, { ...rankPlan, stages: rankPlan.stages.map(stage => ({ ...stage, attempts: 1 })) }];
            for (const policy of new Map(policies.map(p => [p.stages.map(s => s.attempts).join(','), p])).values()) {
              const distribution = godRankOfferingOutcomes({ ...input, rank: prefix.rank, points: prefix.points }, policy);
              if (!distribution.outcomes.some(o => o.attempts > 0)) continue;
              const row = { afterClaims: order.slice(0, position), order, valueFirst, policy,
                successProbability: distribution.successProbability, expectedSpent: 0, expectedAttempts: 0,
                generatedPoints: 0, netPoints: 0, retainedSpirals: 0, netGain: 0, spiralGain: 0, branches: [] };
              const groups = new Map();
              for (const outcome of distribution.outcomes) {
                let state = { ...prefix, rank: outcome.rank, offeringSpent: outcome.spent,
                  points: outcome.points, conditional: outcome.rank !== start.rank,
                  actions: [...prefix.actions, { type: 'rank', target: policy.target, achieved: outcome.rank,
                    cost: outcome.spent, attempts: outcome.attempts, probability: outcome.probability }] };
                state = spend(state, valueFirst);
                if (position) { state = convert(state) ?? state; state = spend(state, valueFirst); }
                for (const ci of order.slice(position)) {
                  state = claim(state, ci, measureState(state));
                  state = spend(state, valueFirst);
                  state = convert(state) ?? state;
                  state = spend(state, valueFirst);
                }
                const retained = state.stacks.reduce((sum, q) => sum + q, 0), p = outcome.probability;
                row.expectedSpent += p * outcome.spent;
                row.expectedAttempts += p * outcome.attempts;
                row.generatedPoints += p * state.generatedPoints;
                row.netPoints += p * net(state);
                row.retainedSpirals += p * retained;
                row.netGain += p * (state.generatedPoints - reference.generatedPoints - outcome.spent);
                row.spiralGain += p * (retained - reference.retainedSpirals);
                const key = outcome.rank, group = groups.get(key) ?? { rank: key, probability: 0,
                  spent: 0, generatedPoints: 0, netPoints: 0, retainedSpirals: 0, representative: null };
                group.probability += p; group.spent += p * outcome.spent;
                group.generatedPoints += p * state.generatedPoints; group.netPoints += p * net(state);
                group.retainedSpirals += p * retained;
                if (!group.representative || p > group.representative.probability)
                  group.representative = { probability: p, state: { ...state, retainedSpirals: retained } };
                groups.set(key, group);
                evaluated++;
              }
              row.branches = [...groups.values()].map(group => ({ ...group,
                spent: group.spent / group.probability, generatedPoints: group.generatedPoints / group.probability,
                netPoints: group.netPoints / group.probability, retainedSpirals: group.retainedSpirals / group.probability }));
              if (['expectedSpent', 'expectedAttempts', 'generatedPoints', 'netPoints', 'retainedSpirals', 'netGain', 'spiralGain']
                .some(key => !Number.isFinite(row[key])))
                throw new Error('Expected God Rank outcomes exceed the supported numeric range.');
              if (!candidate || better(row, candidate)) candidate = row;
              compared++;
            }
            if (position) { prefix = spend(prefix, valueFirst); prefix = convert(prefix) ?? prefix; prefix = spend(prefix, valueFirst); }
          }
        }
        const skip = { generatedPoints: reference.generatedPoints, netPoints: reference.generatedPoints,
          retainedSpirals: reference.retainedSpirals, expectedSpent: 0, netGain: 0, spiralGain: 0 };
        rankComparison = { skip, candidate, worthwhile: candidate != null && better(candidate, skip),
          compared, target: rankPlan.target,
          scope: 'One high-offering batch before spending at each claim boundary; compare one attempt per rank and the selected confidence-policy limits. Stop at success, each rank limit or unaffordability. Native paid/free successes, failures and high-tier rerolls are propagated without pruning; each resulting real bank/rank gets its own remaining claim, purchase and conversion rollout. Low offerings, repeated batches and other rank targets are not searched. Net claim points deduct actual offering spend; retained Spirals include the lost alternative purchases and conversion payout. Persistent benefits after this finite roster are not valued.' };
      } catch (error) { rankComparisonError = error.message; }
    }
    return { baseline,best,objective,pointsGain:best.generatedPoints-baseline.generatedPoints,
      gain:best.retainedSpirals-baseline.retainedSpirals,evaluated,measurements,pruned:0,limited:false,maxPurchases:null,
      maxElapsedSeconds, rankComparison, rankComparisonError,
      scope:'Complete finite-roster rollouts: saved, small-bank-first and large-bank-first orders, with point-first or self-funding value reinvestment. No total purchase ceiling. Repeated useful point/hour/value boosters only; fixed EXP, blessings, Reef and combat progression. Each conversion farms to the declared per-minute diminishing-return rule or bonus-window end. Unclaimed characters accrue that elapsed AFK time. This is a bounded policy comparison, not exhaustive action-order optimization. New Spiral stacks are conditionally accessible in creation order; existing stacks, pickup capacity and travel are excluded.' };
  }
  const seen = new Set();
  // A positive conversion resets all three banks. Consecutive conversions
  // cannot pay out, but another claim may legitimately fund the next one.
  const maxSteps = characters.length * 2 + maxPurchases * 2 + 2;
  for (let step = 0; step < maxSteps && beam.length; step++) {
    const next = [];
    const admit = state => {
      if (evaluated >= stateLimit) { limited = true; return; }
      const key = JSON.stringify([state.levels, state.rank, [...state.claimed].sort((a,b) => a-b),
        state.points, state.hours, state.kills, state.stacks, state.purchases,
        objective === 'points' ? state.generatedPoints : null]);
      if (seen.has(key)) return;
      seen.add(key); evaluated++;
      const rows = state.claimed.length === characters.length ? [] : measureState(state);
      if (!rows) return;
      const completion = finish(state, rows);
      if (compare(completion, best) < 0) best = completion;
      if (state.claimed.length < characters.length || state.purchases < maxPurchases)
        next.push({ state, completion });
    };
    for (const state of beam) {
      const rows = state.claimed.length === characters.length ? [] : measureState(state);
      for (const c of characters) if (!state.claimed.includes(c.ci)) admit(claim(state, c.ci, rows));
      if (state.purchases < maxPurchases && input.activated === true) {
        for (let i = 0; i < 12; i++) {
          if (state.claimed.length === characters.length && i !== 7) continue;
          const threshold = i < 6 ? CORAL_KID_UNLOCK_LEVELS[i] : CORAL_KID_SINGULARITY_UNLOCK_LEVELS[i - 6];
          if ((i !== 0 && i !== 6 && !(input.totalLevels >= threshold))
            || i >= 6 && input.singularityUnlocked !== true) continue;
          const cost = coralKidUpgradeCost(i, state.levels[i]);
          if (!Number.isFinite(cost)) continue;
          let stacks = state.stacks, points = state.points;
          if (i < 6) { if (cost > points) continue; points -= cost; }
          else {
            if (cost > stacks.reduce((sum, quantity) => sum + quantity, 0)) continue;
            let debt = cost;
            stacks = stacks.map(quantity => {
              const spent = Math.min(quantity, debt); debt -= spent;
              return Math.round(quantity - spent);
            }).filter(quantity => quantity > 0);
          }
          const levels = state.levels.slice(); levels[i]++;
          admit({ ...state, levels, points, stacks, purchases: state.purchases + 1,
            actions: [...state.actions, { type: 'purchase', index: i, level: levels[i], cost,
              currency: i < 6 ? 'points' : 'spirals' }] });
        }
      }
      if (state.claimed.length < characters.length && state.actions.at(-1)?.type !== 'convert') {
        const converted = convert(state);
        if (converted) admit(converted);
      }
      if (!rankRisk && rankPlan && state.claimed.length < characters.length && !state.conditional
        && state.points >= rankPlan.budget && rankPlan.target > state.rank)
        admit({ ...state, rank: rankPlan.target, points: state.points - rankPlan.budget, conditional: true,
          actions: [...state.actions, { type: 'rank', target: rankPlan.target, cost: rankPlan.budget,
            probability: rankPlan.successProbability }] });
    }
    next.sort((a,b) => compare(a.completion, b.completion));
    if (next.length > beamWidth) { pruned += next.length - beamWidth; limited = true; }
    beam = next.slice(0, beamWidth).map(row => row.state);
    if (evaluated >= stateLimit) { limited = true; break; }
  }
  if (beam.length) limited = true;
  return { baseline, best, objective, pointsGain: best.generatedPoints - baseline.generatedPoints,
    gain: best.retainedSpirals - baseline.retainedSpirals,
    evaluated, measurements, pruned, limited, maxPurchases,
    rankComparison: null,
    rankComparisonError: rankRisk && rankPlan ? 'God Rank risk comparison requires the uncapped redemption policy.' : null,
    scope: 'Bounded character-order / purchase / conversion beam; finish every selected banked claim, '
      + (objective === 'points' ? 'maximize generated Divinity points, then retained new Spirals.'
        : 'maximize retained new Spirals.')
      + ' Newly converted stacks are assumed collected into shared accessible storage in creation order. Existing Spiral stacks, travel time, EXP/level/cache settlement and bonus expiry are excluded.' };
}

export function planCoralDivinitySpending(input, { targets = input.levels, rankTarget = input.rank, minimumSpirals } = {}) {
  const points = _require(input.points, 'Claimed Divinity points');
  const now = singularityTransmute(input);
  minimumSpirals ??= now.spirals;
  const reserve = singularityPointReserve(input, minimumSpirals);
  const warnings = [];
  let remaining = points;
  const levels = input.levels.slice(), actions = [], blocked = [];
  const safe = cost => Number.isFinite(cost) && remaining >= cost && reserve.available
    && remaining - cost >= reserve.points
    && singularityTransmute({ ...input, points: remaining - cost }).spirals >= minimumSpirals;
  if (!Array.isArray(targets) || targets.length !== 6) throw new Error('Six ordinary Coral targets are required.');
  targets = targets.map((value, i) => {
    const target = _require(value, 'Coral target ' + (i + 1), true);
    const current = _require(levels[i], 'Saved Coral level ' + (i + 1), true);
    if (target < current || target - current > 1000) throw new Error('Coral targets must retain saved levels and add at most 1000 per upgrade.');
    return target;
  });
  if (!reserve.available || now.spirals < minimumSpirals) warnings.push(reserve.reason ?? 'The claimed balance does not yet fund the requested Spiral payout. No spending is recommended.');
  if (input.activated !== true) warnings.push(input.activated == null ? 'Coral Kid activation is unavailable.' : 'Coral Kid is not activated: each unlock attempt costs 20M points and succeeds with 10% chance. Reload after an attempt; upgrade targets remain blocked.');
  if (input.singularityUnlocked !== true) warnings.push(input.singularityUnlocked == null ? 'Singularity unlock metadata is unavailable; payout is formula-only.' : 'Singularity transmutation is locked in the saved Menagerie.');
  const eligible = levels.map((_, i) => input.activated === true
    && (i === 0 || input.totalLevels != null && input.totalLevels >= CORAL_KID_UNLOCK_LEVELS[i]));
  for (;;) {
    const candidates = levels.map((level, i) => ({ i, cost: coralKidUpgradeCost(i, level) }))
      .filter(row => eligible[row.i] && levels[row.i] < targets[row.i] && safe(row.cost))
      .sort((a, b) => a.cost - b.cost || a.i - b.i);
    if (!candidates.length) break;
    const { i, cost } = candidates[0], before = remaining;
    remaining -= cost;
    levels[i]++;
    actions.push({ index: i, level: levels[i], cost, before, remaining, spirals: singularityTransmute({ ...input, points: remaining }).spirals });
  }
  for (let i = 0; i < 6; i++) if (levels[i] < targets[i]) blocked.push({ index: i, target: targets[i], level: levels[i],
    reason: !eligible[i] ? 'Activation or total account Divinity level gate' : 'Next cost would exceed the claimed balance or Spiral reserve' });
  const afterCoral = singularityTransmute({ ...input, points: remaining });
  let rankEstimate = null, offers = [], offeringError = null;
  try {
    rankEstimate = godRankTargetEstimate(input, rankTarget);
    if (rankTarget > input.rank) {
      const model = _rankModel(input, input.rank);
      offers = input.tiers.map((tier, slot) => {
        if (!Number.isInteger(tier) || tier < 0 || tier > 5) throw new Error('Saved offering choices are missing or invalid.');
        const cost = model.costs[tier], affordable = safe(cost);
        return { slot, tier, cost, chance: ODDS[tier], affordable,
          expectedPaidToSuccess: cost + (1 - ODDS[tier]) * model.future,
          paidRemaining: affordable ? remaining - cost : null,
          paidSpirals: affordable ? singularityTransmute({ ...input, points: remaining - cost }).spirals : null };
      });
      const available = offers.filter(offer => offer.affordable).sort((a, b) => a.expectedPaidToSuccess - b.expectedPaidToSuccess || b.chance - a.chance);
      if (available.length) available[0].recommended = true;
    }
  } catch (error) {
    offeringError = error.message;
  }
  const activationOffer = input.activated === false ? { cost: 2e7, chance: .1, affordable: safe(2e7) } : null;
  return { points, now, reserve, minimumSpirals, remaining, spent: points - remaining, levels, targets, actions, blocked, afterCoral,
    rankEstimate, offers, offeringError, activationOffer, warnings,
    canTransmute: input.activated === true && input.singularityUnlocked === true && afterCoral.canTransmute
      && reserve.available && afterCoral.spirals >= minimumSpirals };
}
