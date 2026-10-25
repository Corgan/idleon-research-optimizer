// ===== SHARED ACTIVE-FARMING MEASUREMENTS =====
import { applyCombatSetupDetailed, characterOptions, normalizeCombatSetup, readRawKey } from './combat-sim-setup.js';
import { setupEditsBuffs } from './combat-sim-setup-compare.js';
import { combatSimMaps, reachableCombatSimMapIds } from './combat-sim-maps.js';

export function farmingNumber(value, label, integer = false) {
  const n = Number(value);
  if (value == null || value === '' || !Number.isFinite(n) || n < 0 || (integer && !Number.isSafeInteger(n))) {
    throw new Error('Missing or invalid ' + label);
  }
  return n;
}

export function captureCombatFarming(raw, { charIdx, setup, seeds, seconds, useSavedBuffs = false, unlimitedInventory = false }) {
  if (!Number.isInteger(charIdx) || !characterOptions(raw).some(c => c.ci === charIdx)) throw new Error('Choose a saved character');
  if (setup && Number(setup.charIdx) !== charIdx) throw new Error('This loadout belongs to another character');
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 86400) throw new Error('Choose a duration up to 24 hours');
  if (!Array.isArray(seeds) || !seeds.length || new Set(seeds).size !== seeds.length
    || seeds.some(s => !Number.isInteger(s) || s < 1 || s > 0xffffffff)) throw new Error('Distinct nonzero 32-bit seeds are required');
  const captured = normalizeCombatSetup(structuredClone(setup || { charIdx, patches: [] }));
  const applied = applyCombatSetupDetailed(raw, captured);
  return { charIdx, setup: captured, raw: applied.raw, warnings: applied.warnings.slice(), seeds: seeds.slice(), seconds,
    keepBuffs: useSavedBuffs || setupEditsBuffs(captured), unlimitedInventory };
}

export function combatFarmingOptions(raw) {
  const key = readRawKey(raw, 'OptionsListAccount') != null ? 'OptionsListAccount' : 'OptLacc';
  return { key, values: readRawKey(raw, key) };
}

export function combatFarmingMaps(raw, charIdx) {
  const chars = characterOptions(raw);
  const snapshot = {
    saveData: { holesData: readRawKey(raw, 'Holes') || [], lv0AllData: chars.map(c => readRawKey(raw, 'Lv0_' + c.ci) || []),
      questCompleteData: chars.map(c => readRawKey(raw, 'QuestComplete_' + c.ci) || {}) },
    klaData: chars.map(c => readRawKey(raw, 'KLA_' + c.ci) || []),
    currentMapData: chars.map(c => readRawKey(raw, 'CurrentMap_' + c.ci)),
    currentMapDataAvailable: chars.map(c => readRawKey(raw, 'CurrentMap_' + c.ci) != null),
    optionsListData: combatFarmingOptions(raw).values || [], dreamData: readRawKey(raw, 'Dream') || [],
  };
  const reachable = reachableCombatSimMapIds(charIdx, snapshot);
  return combatSimMaps().filter(m => reachable.has(m.id) && m.id !== '216:2');
}

export function combatFarmingJobs(base, rows) {
  return base.seeds.flatMap(seed => rows.map(row => ({
    key: row.key, charIdx: base.charIdx, mapIdx: row.mapIdx, seconds: base.seconds, seed, setup: row.setup,
    inputOverrides: { unlimitedInventory: base.unlimitedInventory, useSavedBuffs: base.keepBuffs,
      ...(row.holeCavern != null ? { holeCavern: row.holeCavern } : {}) },
  })));
}

export function summarizeCombatFarming(plan, records, readGains) {
  const rows = plan.rows.map(row => ({ ...row, runs: 0, timeMs: 0, kills: 0, deaths: 0, gains: {}, rates: {},
    errors: [], warnings: [], inputIssues: [], seeds: [], complete: false, killsPerHour: null }));
  const byKey = new Map(rows.map(r => [r.key, r]));
  for (const record of records) {
    const row = byKey.get(record.job.key);
    if (!row || !plan.seeds.includes(record.job.seed) || row.seeds.includes(record.job.seed)) throw new Error('Unexpected or duplicate farming result');
    row.seeds.push(record.job.seed);
    if (record.error) { row.errors.push(record.error); continue; }
    const r = record.result;
    if (!r?.summary || !Number.isFinite(r.timeMs) || r.timeMs <= 0) throw new Error('Farming result is missing its summary or duration');
    const gains = readGains(r, row);
    for (const [key, value] of Object.entries(gains)) row.gains[key] = (row.gains[key] || 0) + farmingNumber(value, key + ' gains');
    row.kills += farmingNumber(r.summary.rewards?.kills, 'kill count');
    row.deaths += farmingNumber(r.player?.deaths, 'player deaths');
    row.timeMs += r.timeMs;
    row.runs++;
    if (r.ended || r.summary.ended || r.timeMs < plan.seconds * 1000) row.warnings.push('Run ended early; comparison is incomplete.');
    if (r.summary.rewards.inventoryFullAt != null) row.warnings.push('Inventory filled during farming.');
    for (const key of Object.keys(r.unmodelled || {})) row.warnings.push('Unmodelled mechanic: ' + key);
    row.inputIssues.push(...(r.inputIssues || []));
  }
  for (const row of rows) {
    row.warnings = [...new Set(row.warnings)];
    row.inputIssues = [...new Map(row.inputIssues.map(i => [i.key, i])).values()];
    row.complete = row.runs === plan.seeds.length && !row.errors.length && !row.warnings.some(w => w.startsWith('Run ended early'));
    if (row.timeMs > 0) {
      row.killsPerHour = row.kills * 3.6e6 / row.timeMs;
      row.rates = Object.fromEntries(Object.entries(row.gains).map(([k, n]) => [k, n * 3.6e6 / row.timeMs]));
    }
  }
  return rows;
}
