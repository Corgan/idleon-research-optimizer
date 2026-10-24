// ===== COMBAT SIM SETUP COMPARISON (common) =====
// Pure helpers for running characters/maps under several setup variants
// (the imported save, the editor's current edits, named saved loadouts) on
// shared seeds, then aggregating paired hourly rates (Omega: run totals). No DOM, no workers.

import { applyCombatSetup, diffCombatSetup, normalizeCombatSetup } from './combat-sim-setup.js';
import { combatSimMap } from './combat-sim-maps.js';

// Resolved combat inputs worth showing next to each variant's outcome.
export const SETUP_COMPARE_INPUTS = [
  ['dropRate', 'Drop rate'], ['damageMin', 'Damage (min)'], ['damageMax', 'Damage (max)'],
  ['critChance', 'Crit chance'], ['critDamage', 'Crit damage'], ['accuracy', 'Accuracy'],
  ['hitChancePct', 'Hit chance %'], ['attackSpeedPct', 'Attack speed %'], ['playerSpeed', 'Move speed'],
  ['playerMaxHp', 'Max HP'], ['playerDefence', 'Defence'], ['multikillTotal', 'Multikill'],
  ['killPerKill', 'Kill credit per kill'], ['expMulti', 'EXP multiplier'], ['monsterCash', 'Coin multiplier'],
  ['cardChanceMulti', 'Card chance multiplier'], ['crystalSpawnRaw', 'Crystal spawn chance'],
  ['crystalEmbiggener', 'Crystal embiggener'], ['marbleDropChance', 'Marble chance'],
  ['printerSampleSize', 'Printer sample size'], ['filterSlots', 'Filter slots'],
];

// Outcome columns read from summary.rewards (all reported per hour).
export const SETUP_COMPARE_METRICS = [
  ['kills', 'Kills / hr'], ['klaCredit', 'Kill credit / hr'], ['exp', 'EXP / hr'],
  ['coins', 'Coins / hr'], ['cards', 'Cards / hr'],
];

/**
 * Build the variants to compare. `named` is `[{ name, setup }]`. Named setups
 * are retargeted to `charIdx` (a saved loadout applies to the selected
 * character). Variants with identical patches and override maps are kept but
 * flagged `duplicateOf`.
 */
export function setupCompareVariants(rawSave, opts) {
  opts = opts || {};
  const ci = Number(opts.charIdx) || 0;
  const out = [];
  const add = (id, label, kind, setup) => {
    const s = setup ? normalizeCombatSetup(Object.assign({}, setup, { charIdx: ci })) : null;
    let raw = rawSave, lines = [], changed = 0, warnings = [];
    if (s && s.patches.length) {
      try {
        raw = applyCombatSetup(rawSave, s);
        const d = diffCombatSetup(rawSave, s);
        lines = d.lines || []; changed = d.changed || 0; warnings = d.warnings || [];
      } catch (e) { warnings = [String(e && e.message || e)]; raw = null; }
    }
    const toggles = s?.toggles || {}, termOverrides = s?.termOverrides || {};
    const sorted = obj => Object.keys(obj).sort().map(k => [k, obj[k]]);
    const sig = JSON.stringify([s?.patches || [], sorted(toggles), sorted(termOverrides)]);
    const dup = out.find(v => v.sig === sig);
    out.push({ id, label, kind, setup: s, raw, changed, lines, warnings, sig, toggles, termOverrides, duplicateOf: dup ? dup.id : null, editsBuffs: setupEditsBuffs(s) });
  };
  if (opts.includeSaved !== false) add('saved', 'Imported save', 'saved', null);
  if (opts.edited && (opts.edited.patches?.length || Object.keys(opts.edited.toggles || {}).length || Object.keys(opts.edited.termOverrides || {}).length)) add('edited', (opts.edited.label || 'Current edits') + ' (editor)', 'edited', opts.edited);
  (opts.named || []).forEach(n => { if (n && n.setup) add('named:' + n.name, n.name, 'named', n.setup); });
  return out;
}

/**
 * True when a setup deliberately edits BuffsActive_X. Sims normally start with
 * only form-toggle buffs; an explicit buff edit implies the user wants those
 * saved buffs kept (inputOverrides.useSavedBuffs).
 */
export function setupEditsBuffs(setup) {
  return !!(setup && Array.isArray(setup.patches) && setup.patches.some(p => p && p.system === 'buffs'));
}

/** Jobs interleaved by seed so partial results stay paired across variants. Duplicates and failed variants are skipped. */
export function setupCompareJobs(variants, seeds) {
  const jobs = [];
  (seeds || []).forEach(seed => (variants || []).forEach(v => { if (v.raw && !v.duplicateOf) jobs.push({ variantId: v.id, seed }); }));
  return jobs;
}

/** Each character owns its variants and eligible maps. Never merge equal patches across characters. */
export function characterMapComparePlan(characters, seeds) {
  const rows = [], jobs = [];
  for (const ch of characters) for (const variant of ch.variants) for (const mapId of [...new Set(ch.maps)]) {
    const map = typeof mapId === 'number' ? { id: mapId, mapIdx: mapId } : combatSimMap(mapId);
    if (!map) throw new Error('Unknown combat comparison map: ' + mapId);
    const mapIdx = map.mapIdx, id = JSON.stringify([ch.charIdx, variant.id, map.id]);
    rows.push({ id, charIdx: ch.charIdx, character: ch.label, variantId: JSON.stringify([ch.charIdx, variant.id]),
      loadout: variant.label, mapIdx, mapId: map.id, holeCavern: map.holeCavern, variant });
  }
  for (const seed of seeds) for (const row of rows) if (row.variant.raw) jobs.push({ rowId: row.id, mapIdx: row.mapIdx, seed });
  return { rows, jobs };
}

export function emptySetupCompareRow(variant) {
  return { id: variant.id, label: variant.label, runs: {}, errors: [], inputs: null };
}

function _rewardValues(m) {
  const R = (m && m.summary && m.summary.rewards) || {};
  const v = { kills: R.kills || 0, klaCredit: R.klaCredit || 0, exp: R.expTotal || 0, coins: R.coinsDropped || 0, cards: 0, items: {}, invFull: R.inventoryFullAt != null };
  for (const c in R.cards || {}) v.cards += Number(R.cards[c]) || 0;
  for (const k in R.byItem || {}) { if (k !== 'COIN') v.items[k] = (R.byItem[k].qtyDropped || 0); }
  // Cumulative special-mechanic counters; `state` holds end-of-run values, not counts.
  v.metrics = {};
  const sp = m && m.summary && m.summary.special;
  if (sp && typeof sp === 'object') Object.keys(sp).forEach(k => {
    if (k === 'state') return;
    if (typeof sp[k] === 'number') { if (isFinite(sp[k])) v.metrics[k] = sp[k]; }
    else _flatten(sp[k], k, v.metrics, 0);
  });
  return v;
}

function _flatten(obj, prefix, out, depth) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj) || depth > 3) return;
  for (const k of Object.keys(obj)) {
    const val = obj[k], key = prefix ? prefix + '.' + k : k;
    if (typeof val === 'number' && isFinite(val)) out[key] = (out[key] || 0) + val;
    else _flatten(val, key, out, depth + 1);
  }
}

function _numInputs(entries) {
  const out = {};
  SETUP_COMPARE_INPUTS.forEach(([k]) => {
    const e = entries && entries[k];
    const val = e && typeof e === 'object' && 'value' in e ? e.value : e;
    if (typeof val === 'number' && isFinite(val)) out[k] = val;
  });
  return out;
}

/** Record one finished worker run (`done` message) for a seed. */
export function addSetupCompareRun(row, seed, m) {
  const v = _rewardValues(m);
  v.hours = (Number(m && m.timeMs) || 0) / 3.6e6;
  row.runs[seed] = v;
  if (!row.inputs && m && m.inputs && Object.keys(m.inputs).length) row.inputs = _numInputs(m.inputs);
  return row;
}

/** Omega odds diminish after each drop, so compare finite-run totals, not a stationary rate. */
export function setupCompareUnit(key) {
  return key === 'item:ArcBallOmega' || key === 'metric:combatProgress.omegaBalls' ? 'run' : 'hr';
}

function _runValue(run, key) {
  if (!run || !(run.hours > 0)) return null;
  const q = key.indexOf('item:') === 0 ? (run.items[key.slice(5)] || 0)
    : key.indexOf('metric:') === 0 ? ((run.metrics || {})[key.slice(7)] || 0) : (run[key] || 0);
  return setupCompareUnit(key) === 'run' ? q : q / run.hours;
}

/** Items that dropped in any finished run, most common first. */
export function setupCompareItems(rows) {
  const tot = {};
  (rows || []).forEach(r => Object.values(r.runs).forEach(run => { for (const k in run.items) if (run.items[k] > 0) tot[k] = (tot[k] || 0) + run.items[k] / Math.max(1e-9, run.hours); }));
  return Object.keys(tot).sort((a, b) => tot[b] - tot[a]);
}

/** Special-mechanic counters that were nonzero in any finished run. */
export function setupCompareMetricKeys(rows) {
  const seen = {};
  (rows || []).forEach(r => Object.values(r.runs).forEach(run => { for (const k in run.metrics || {}) if (run.metrics[k]) seen[k] = 1; }));
  return Object.keys(seen).sort();
}

/**
 * Mean in setupCompareUnit(key) units, plus the paired difference versus the
 * baseline row over seeds both finished: `{ mean, n, delta, deltaPct, se }`.
 * `se` is the standard error of the mean paired difference (null below 2 pairs).
 */
export function setupCompareCell(row, baseRow, key) {
  const seeds = Object.keys(row.runs);
  const vals = seeds.map(s => _runValue(row.runs[s], key)).filter(x => x != null);
  const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  const cell = { mean, n: vals.length, delta: null, deltaPct: null, se: null, baseMean: null };
  if (!baseRow || baseRow === row) return cell;
  const diffs = [], bases = [];
  seeds.forEach(s => {
    const a = _runValue(row.runs[s], key), b = _runValue(baseRow.runs[s], key);
    if (a != null && b != null) { diffs.push(a - b); bases.push(b); }
  });
  if (!diffs.length) return cell;
  const d = diffs.reduce((x, y) => x + y, 0) / diffs.length;
  const bm = bases.reduce((x, y) => x + y, 0) / bases.length;
  cell.delta = d; cell.baseMean = bm;
  cell.deltaPct = bm !== 0 ? d / bm : (d === 0 ? 0 : null);
  if (diffs.length >= 2) {
    const varr = diffs.reduce((s, x) => s + (x - d) * (x - d), 0) / (diffs.length - 1);
    cell.se = Math.sqrt(varr / diffs.length);
  }
  return cell;
}

/** True when the paired difference is at least ~2 standard errors from zero. */
export function setupCompareSignificant(cell) {
  return !!(cell && cell.se != null && cell.delta != null && Math.abs(cell.delta) > 2 * cell.se && cell.se >= 0);
}
