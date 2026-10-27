// ===== COVE SEQUENTIAL PROGRESSION (W5) =====
import { getLOG } from '../../../formulas.js';
import { drBonusAt, purchaseCostAt, upgName, upgPerLvVal } from './cglunko.js';
import { buildCoveCombatPlan, COVE_STONE_NAMES } from './cglunko-combat.js';
import { applyCombatSetup, readRawKey, upsertPatch } from '../common/combat-sim-setup.js';
import { farmingNumber } from '../common/combat-farming.js';

const PURCHASES = [1, 2, 3, 4, 6, 7, 9, 10, 12, 15, 16, 17, 18, 19, 21, 22];
const LIMITS = { depth: [1, 24], width: [1, 12], measurements: [2, 512], horizonHours: [1, 8760] };

export function buildCoveProgressionPlan(raw, options) {
  const base = buildCoveCombatPlan(raw, { ...options, upgrades: false, focuses: false });
  const patched = applyCombatSetup(raw, base.setup), values = readRawKey(patched, base.optionKey);
  const time = readRawKey(patched, 'TimeAway');
  if (time?.ShopRestock == null || time.ShopRestock === '' || !Number.isFinite(Number(time.ShopRestock))) {
    throw new Error('Daily reset timing (TimeAway.ShopRestock) is required for purchase planning');
  }
  const settings = { depth: 8, width: 6, measurements: 128, horizonHours: 168, ...options };
  for (const [key, [min, max]] of Object.entries(LIMITS)) {
    if (!Number.isInteger(settings[key]) || settings[key] < min || settings[key] > max) throw new Error(key + ' must be ' + min + '-' + max);
  }
  const initial = {
    levels: base.levels, balances: base.balances, focuses: base.focuses,
    purchases: base.purchases, normalDR: farmingNumber(values[200], 'saved best normal DR'),
    kills: farmingNumber(values[668], 'Cove kills'), resetHours: Math.max(0, Number(time.ShopRestock)) / 3600,
    hours: 0, bought: 0, steps: [], first: null, intent: null, reference: false,
  };
  initial.dr = drBonusAt(initial);
  if (!Number.isFinite(initial.dr) || initial.dr <= 0) throw new Error('Cove DR is not representable');
  return { ...base, jobs: undefined, rows: undefined, rawSave: structuredClone(raw),
    settings: Object.fromEntries(Object.keys(LIMITS).map(k => [k, settings[k]])),
    initial, startDR: initial.dr };
}

export function coveProgressionSetup(plan, state) {
  let setup = plan.setup;
  const entries = [
    ...state.levels.map((v, i) => [630 + i, v]), ...state.balances.map((v, i) => [654 + i, v]),
    [666, state.focuses[0]], [667, state.focuses[1]], [668, state.kills], [604, state.purchases],
  ];
  for (const [index, value] of entries) setup = upsertPatch(setup, { system: 'raw', key: plan.optionKey, path: [index], value });
  return setup;
}

export function coveProgressionJobs(plan, state) {
  const setup = coveProgressionSetup(plan, state);
  return plan.seeds.map((seed, i) => ({
    key: 'sample:' + i, charIdx: plan.charIdx, mapIdx: 216, seconds: plan.seconds, seed, setup,
    inputOverrides: { holeCavern: 17, useSavedBuffs: plan.keepBuffs, unlimitedInventory: plan.unlimitedInventory },
  }));
}

export function coveProgressionMeasurement(plan, state, records) {
  if (records.length !== plan.seeds.length) throw new Error('Incomplete Cove income measurement');
  const rates = Array(12).fill(0), samples = [], warnings = [];
  const seeds = new Set();
  let hours = 0, kills = 0;
  for (const record of records) {
    if (record.error) throw new Error(record.error);
    if (!plan.seeds.includes(record.job?.seed) || seeds.has(record.job.seed)) throw new Error('Unexpected or duplicate Cove sample');
    seeds.add(record.job.seed);
    const r = record.result, gains = r?.summary?.special?.holeShapesByType;
    if (!gains || !Number.isFinite(r.timeMs) || Math.abs(r.timeMs - plan.seconds * 1000) > 10 || r.cancelled) {
      throw new Error('Cove income sample ended early or is missing pickup counters');
    }
    const h = r.timeMs / 3600000;
    hours += h;
    kills += farmingNumber(r.summary.special.coveKills, 'sampled Cove kills');
    const sample = rates.map((_, i) => farmingNumber(gains[i] ?? 0, 'sampled ' + COVE_STONE_NAMES[i]));
    sample.forEach((v, i) => { rates[i] += v; });
    samples.push(sample.map(v => v / h));
    for (const issue of r.inputIssues || []) warnings.push(issue.status + ': ' + issue.source + (issue.note ? ' - ' + issue.note : ''));
    if (r.player?.deaths) warnings.push('Income samples include player deaths.');
    if (r.summary.rewards?.inventoryFullAt != null) warnings.push('Income samples reached a full inventory.');
    if (Object.keys(r.unmodelled || {}).length) warnings.push('Income sample includes unmodelled combat mechanics.');
  }
  const factors = rates.map((_, i) => _focusFactor(state, i));
  return { rates: rates.map((v, i) => v / hours / factors[i]), kills: kills / hours,
    samples: samples.map(s => s.map((v, i) => v / factors[i])), warnings: [...new Set(warnings)] };
}

function _focusFactor(state, i) {
  const color = i < 6 ? 0 : 1;
  return state.focuses[color] === i % 6 + 1 ? Math.max(1, state.levels[color ? 16 : 9] * upgPerLvVal(color ? 16 : 9)) : 1;
}

function _focusChoices(state, color) {
  const saved = state.focuses[color], choices = [saved];
  if (state.levels[color ? 16 : 9] >= 1) for (let f = 1; f <= 6; f++) {
    if (f !== saved && (color || state.balances[Math.floor((f - 1) / 2)] >= 0.1)) choices.push(f);
  }
  return choices;
}

function _digitTime(value, rate) {
  if (!(rate > 0)) return Infinity;
  // getLOG's divisor is deliberately 2.30259, not Math.LN10; cross its strict ceil boundary.
  const edge = Math.exp(Math.ceil(getLOG(value)) * 2.30259) * (1 + 1e-12);
  return Math.max(0, edge - value) / rate;
}

export function advanceCoveProgression(plan, state, measurement, upgrade, focuses) {
  if (upgrade != null && !PURCHASES.includes(upgrade)) throw new Error('Unsupported Cove progression purchase');
  if (!Array.isArray(focuses) || focuses.length !== 2 || focuses.some((f, c) => !_focusChoices(state, c).includes(f))) throw new Error('Unavailable Cove stone focus');
  if (!Array.isArray(measurement.rates) || measurement.rates.length !== 12 || measurement.rates.some(n => !Number.isFinite(n) || n < 0)
    || !Number.isFinite(measurement.kills) || measurement.kills < 0) throw new Error('Invalid Cove income measurement');
  const next = { ...state, focuses: [...focuses], levels: [...state.levels], balances: [...state.balances], steps: [...state.steps] };
  const rates = measurement.rates.map((r, i) => r * _focusFactor(next, i));
  let hours = plan.settings.horizonHours - state.hours, kind = 'horizon';
  let cost = null, stone = null;
  const event = (h, name) => { if (h >= 0 && h <= hours) { hours = h; kind = name; } };
  if (state.levels[10] > 0) for (let i = 0; i < 6; i++) event(_digitTime(state.balances[i], rates[i]), 'digits');
  if (state.levels[22] > 0) for (let i = 6; i < 12; i++) event(_digitTime(state.balances[i], rates[i]), 'digits');
  if (state.levels[4] > 0) event(_digitTime(state.kills, measurement.kills), 'kills');
  event(state.resetHours - state.hours, 'reset');
  if (upgrade != null) {
    cost = purchaseCostAt(upgrade, { ...state, study17: plan.study17 });
    if (!Number.isFinite(cost) || cost <= 0) return null;
    stone = Math.floor(upgrade / 2);
    const deficit = Math.max(0, cost - state.balances[stone]);
    event(deficit === 0 ? 0 : rates[stone] > 0 ? deficit / rates[stone] : Infinity, 'purchase');
  }
  if (!(hours >= 0) || !Number.isFinite(hours)) return null;
  next.hours += hours;
  next.balances = next.balances.map((q, i) => q + rates[i] * hours);
  next.kills += measurement.kills * hours;
  if (!next.balances.every(Number.isFinite) || !Number.isFinite(next.kills)) throw new Error('Projected Cove balances exceed numeric limits');
  if (kind === 'reset' || next.hours >= next.resetHours) {
    next.purchases = 0;
    next.resetHours += 24;
    if (kind === 'purchase') {
      cost = purchaseCostAt(upgrade, { ...next, study17: plan.study17 });
      if (next.balances[stone] < cost) throw new Error('Purchase became unaffordable at reset');
    }
  }
  const farmDR = drBonusAt(next);
  if (kind === 'purchase') {
    next.balances[stone] = Math.max(0, next.balances[stone] - cost);
    if (next.balances[stone] <= 0) next.balances[stone] = 0.1;
    next.levels[upgrade]++; next.purchases++; next.bought++;
  }
  next.first = state.first ?? upgrade;
  next.intent = kind === 'purchase' ? null : upgrade;
  next.dr = drBonusAt(next);
  if (!Number.isFinite(next.dr)) throw new Error('Projected Cove DR exceeds numeric limits');
  next.steps.push({ hours: next.hours, duration: hours, kind, focuses: [...focuses], upgrade: kind === 'purchase' ? upgrade : null,
    cost: kind === 'purchase' ? cost : null, stone, to: kind === 'purchase' ? next.levels[upgrade] : null,
    drBefore: state.dr, drFarm: farmDR, dr: next.dr });
  return next;
}

function _key(s) {
  return JSON.stringify([s.reference, s.first, s.intent, s.hours, s.levels, s.balances, s.focuses, s.kills, s.purchases, s.resetHours]);
}

function _coast(plan, state, measurement) {
  let end = state;
  for (let events = 0; end.hours < plan.settings.horizonHours; events++) {
    if (events >= 4096) throw new Error('Cove forecast exceeded its event safety limit');
    end = advanceCoveProgression(plan, end, measurement, null, end.focuses);
    if (!end) throw new Error('Unable to complete the Cove farming forecast');
  }
  return { ...end, intent: null, sampledThrough: state.hours };
}

function _nextUpgrade(plan, measurement) {
  const extended = { ...plan, settings: { ...plan.settings, horizonHours: 8760 } };
  let best = null;
  for (const blue of _focusChoices(plan.initial, 0)) for (const purple of _focusChoices(plan.initial, 1)) {
    const start = _coast(plan, { ...plan.initial, focuses: [blue, purple] }, measurement);
    for (const upgrade of PURCHASES) {
      let state = start;
      for (let events = 0; state.hours < 8760 && (!best || state.hours <= best.hours); events++) {
        if (events >= 4096) throw new Error('Cove next-upgrade forecast exceeded its event safety limit');
        const next = advanceCoveProgression(extended, state, measurement, upgrade, state.focuses);
        if (!next) break;
        const step = next.steps.at(-1);
        if (step.kind === 'purchase') {
          if (next.dr > step.drFarm) {
            if (!best || next.hours < best.hours || (next.hours === best.hours && next.dr > best.dr)) {
              best = { ...next, drWithoutPurchase: step.drFarm };
            }
            break;
          }
          // Keep the stones and wait for another event rather than buy a digit-losing level.
          state = advanceCoveProgression(extended, state, measurement, null, state.focuses);
        } else state = next;
        if (!state) break;
      }
    }
  }
  return best;
}

function _select(plan, candidates, count) {
  if (count <= 0) return [];
  candidates.sort((a, b) => b.projectedDR - a.projectedDR || b.dr - a.dr || a.bought - b.bought);
  const picked = [], families = new Set(), keys = new Set();
  for (const s of candidates) {
    const family = s.first;
    if (families.has(family)) continue;
    families.add(family); keys.add(_key(s)); picked.push(s);
    if (picked.length === count) return picked;
  }
  for (const s of candidates) if (!keys.has(_key(s))) {
    keys.add(_key(s)); picked.push(s);
    if (picked.length === count) break;
  }
  return picked;
}

export function* createCoveProgressionSearch(plan) {
  const warnings = new Set(plan.warnings), seen = new Set(), routes = new Map(), measurements = plan.settings.measurements;
  let count = 0, frontier = [{ ...plan.initial }], reference = { ...plan.initial, reference: true }, referenceDone = false;
  let initialMeasurement = null, baseline = null;
  const result = () => {
    const ordered = [...routes.values()].filter(s => s.bought > 0
      || s.focuses.some((f, c) => f !== plan.initial.focuses[c])).sort((a, b) => b.dr - a.dr || a.bought - b.bought);
    return { startDR: plan.startDR, horizonHours: plan.settings.horizonHours,
      routes: ordered.slice(0, 4), baseline, initialMeasurement,
      measured: count, proven: false, limited: count >= measurements || frontier.length > 0,
      warnings: [...warnings], unobserved: initialMeasurement?.rates.flatMap((r, i) => r === 0 ? [COVE_STONE_NAMES[i]] : []) || [] };
  };
  while (count < measurements && (frontier.length || !referenceDone)) {
    const requests = [];
    if (!referenceDone && count > 0) requests.push(reference);
    requests.push(...frontier.filter(s => !seen.has(_key(s))));
    if (!requests.length) break;
    const batch = requests.slice(0, measurements - count);
    const measured = yield { states: batch, completed: count, total: measurements, partial: result() };
    if (!Array.isArray(measured) || measured.length !== batch.length) throw new Error('Missing Cove planner measurements');
    const candidates = [];
    for (let k = 0; k < batch.length; k++) {
      const state = batch[k], m = measured[k];
      count++; seen.add(_key(state));
      for (const warning of m.warnings || []) warnings.add(warning);
      if (!initialMeasurement) {
        initialMeasurement = m;
        baseline = _coast(plan, reference, m);
        reference = advanceCoveProgression(plan, reference, m, null, reference.focuses);
        referenceDone = reference.hours >= plan.settings.horizonHours;
      }
      const finished = state.hours >= plan.settings.horizonHours;
      if (state.reference) {
        baseline = _coast(plan, state, m);
        reference = state;
        if (finished) referenceDone = true;
        else reference = advanceCoveProgression(plan, state, m, null, state.focuses);
        continue;
      }
      const completed = _coast(plan, state, m), prior = routes.get(state.first);
      if (!prior || completed.dr > prior.dr || (completed.dr === prior.dr && completed.bought < prior.bought)) routes.set(state.first, completed);
      if (finished) continue;
      const upgrades = state.bought >= plan.settings.depth ? [null] : state.intent != null ? [null, state.intent] : [null, ...PURCHASES];
      for (const upgrade of upgrades) for (const blue of _focusChoices(state, 0)) for (const purple of _focusChoices(state, 1)) {
        const next = advanceCoveProgression(plan, state, m, upgrade, [blue, purple]);
        if (next && !seen.has(_key(next))) {
          next.projectedDR = _coast(plan, next, m).dr;
          candidates.push(next);
        }
      }
    }
    frontier = _select(plan, candidates, count === 1 ? Math.min(PURCHASES.length + 1, measurements - count) : plan.settings.width);
    if (!frontier.length && referenceDone) break;
  }
  const final = result();
  final.nextUpgrade = null;
  if (initialMeasurement && ![...routes.values()].some(s => s.bought > 0 && s.dr > baseline.dr)) {
    const next = _nextUpgrade(plan, initialMeasurement);
    if (next?.hours === plan.settings.horizonHours) {
      // A purchase at the endpoint needs no post-purchase income extrapolation.
      final.routes = [...final.routes.filter(s => s.first !== next.first), next]
        .sort((a, b) => b.dr - a.dr || a.bought - b.bought).slice(0, 4);
    } else final.nextUpgrade = next;
  }
  return final;
}
