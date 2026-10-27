// ===== WEEKLY KILLROY PLANNING (W2) =====
import { gameRandom } from '../../../formulas.js';
import { KILLROY_FAMILIES, KILLROY_UPGRADES, killroyRoom } from '../../data/w2/killroy.js';
import { readRawKey, rowValues, characterOptions, upsertPatch } from './combat-sim-setup.js';
import { captureCombatFarming, combatFarmingOptions, farmingNumber } from './combat-farming.js';

function _number(v) {
  return v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v);
}
function _required(v, label) {
  const n = _number(v);
  if (n == null) throw new Error('Missing or invalid ' + label);
  return n;
}
function _form(raw, ci, id) {
  return rowValues(readRawKey(raw, 'BuffsActive_' + ci)).some(b => Number(b?.[0]) === id && Number(b?.[1]) > 100);
}
function _world3(raw, ci) {
  if (_form(raw, ci, 585)) {
    const tess = readRawKey(raw, 'Tess');
    return tess?.[0] && typeof tess[0] === 'object' ? [100, 150, 200].some(m => rowValues(tess[0]).includes(m + '_0')) : null;
  }
  const kla = readRawKey(raw, 'KLA_' + ci);
  const gates = [100, 150, 200, 250].map(m => _number(kla?.[m]?.[0]));
  return gates.some(n => n != null && n <= 0) ? true : gates.every(n => n != null) ? false : null;
}

export function killroyClassMatches(classId, family) {
  const n = _number(classId);
  return n != null && (family === 0 ? n < 6 : family === 1 ? n >= 7 && n < 18
    : family === 2 ? n >= 19 && n < 30 : family === 3 ? n >= 31 && n < 41 : false);
}

export function killroyUpgradeChoices(raw) {
  const ola = combatFarmingOptions(raw).values;
  const completed = _number(ola?.[112]), dream = _number(readRawKey(raw, 'Dream')?.[4]);
  return KILLROY_UPGRADES.map((u, id) => {
    const runsRequired = id === 0 ? 0 : Math.pow(2 * id, Math.min(id, 2));
    return { ...u, id, level: _number(ola?.[106 + id]), runsRequired,
      unlocked: completed == null || dream == null ? null : id < Math.round(3 + dream) && completed >= runsRequired };
  });
}

function _weekOffset(n) {
  if (!Number.isInteger(n) || n < 0 || n > 52) throw new Error('Choose a week from 0 to 52 weeks ahead');
  return n;
}
function _rotation(raw) {
  const ola = combatFarmingOptions(raw).values, time = readRawKey(raw, 'TimeAway');
  const global = _required(time?.GlobalTime, 'save snapshot time');
  const restock = _required(time?.ShopRestock, 'weekly reset countdown');
  const day = _required(ola?.[39], 'weekly day counter');
  const swap = _required(readRawKey(raw, 'serverVars')?.KillroySwap, 'server Killroy rotation (import a wrapped save)');
  const resetAt = global + Math.round(restock + 86400 * day);
  return { week: Math.floor(resetAt / 604800), resetAt, swap };
}

export function killroyWeek(raw, ci, { weekOffset = 0 } = {}) {
  _weekOffset(weekOffset);
  if (!characterOptions(raw).some(c => c.ci === ci)) throw new Error('Choose a saved character');
  const ola = combatFarmingOptions(raw).values, rotation = _rotation(raw);
  const week = rotation.week + weekOffset, swap = rotation.swap;
  const world3 = _world3(raw, ci), extra = _number(ola?.[227]), used = _number(ola?.[113]);
  const klass = readRawKey(raw, 'CharacterClass_' + ci), krBest = readRawKey(raw, 'KRbest');
  const tempest = _form(raw, ci, 420);
  return [0, 1, 2].map(slot => {
    const seed = Math.round(week + (50 * slot + swap)), r = gameRandom(seed)();
    const family = Math.max(0, Math.min(3, Math.ceil(3 * r - Math.floor(slot / 2))));
    const roll = Math.floor(1000 * r);
    let pool = 68 + slot, reason = '';
    if (roll >= 300 && slot !== 0) {
      const w5 = _number(readRawKey(raw, 'KLA_' + ci)?.[200]?.[0]);
      const summon = _number(readRawKey(raw, 'Summon')?.[3]?.[2]);
      if (roll < 400 && w5 == null) reason = 'World 5 portal progress is unavailable';
      else if (roll < 400 && w5 <= 0) pool = 72;
      else if (roll < 500 && summon == null) reason = 'Summoning world unlock is unavailable';
      else if (roll < 500 && summon >= 4) pool = 99;
      else pool = 69 + slot;
    }
    const room = reason ? { mapIdx: null, mapName: 'Unavailable', monster: null } : killroyRoom(pool, roll);
    const available = slot === 0 ? true : world3 == null ? null : !world3 ? false
      : slot === 1 ? true : extra == null ? null : extra === 1;
    const matches = killroyClassMatches(klass, family);
    if (!reason && available == null) reason = 'Encounter unlock data is unavailable';
    if (!reason && !available) reason = slot === 1 ? 'Reach World 3 to unlock' : 'Third encounter is locked';
    if (!reason && !matches) reason = 'Requires ' + KILLROY_FAMILIES[family];
    if (!reason && tempest) reason = 'Leave Tempest form before entering Killroy';
    return { ...room, slot, seed, weekOffset, week, family, familyName: KILLROY_FAMILIES[family], available,
      eligible: !reason, reason, used: weekOffset > 0 ? false : used == null ? null : String(used).includes(String(slot + 1)),
      best: krBest && typeof krBest === 'object' && room.monster ? _number(krBest[room.monster] ?? 0) : null,
      familyBest: family ? _number(ola?.[203 + family]) : null };
  });
}

export function killroyForecast(raw, { weeks = 12 } = {}) {
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > 52) throw new Error('Choose 1-52 upcoming weeks');
  const chars = characterOptions(raw), rotation = _rotation(raw);
  if (!chars.length) throw new Error('Load a save with characters');
  const familyCounts = KILLROY_FAMILIES.map((name, family) => ({ family, name, count: 0 }));
  const maps = new Map();
  const forecast = Array.from({ length: weeks + 1 }, (_, weekOffset) => {
    const characters = chars.map(c => ({ ...c, encounters: killroyWeek(raw, c.ci, { weekOffset }) }));
    if (weekOffset > 0) for (const slot of [0, 1, 2]) {
      const encounters = characters.map(c => c.encounters[slot]).filter(e => e.available === true);
      if (!encounters.length) continue;
      familyCounts[encounters[0].family].count++;
      for (const mapIdx of new Set(encounters.map(e => e.mapIdx).filter(m => m != null))) {
        const e = encounters.find(e => e.mapIdx === mapIdx);
        const count = maps.get(mapIdx) || { mapIdx, name: e.mapName, count: 0 };
        count.count++; maps.set(mapIdx, count);
      }
    }
    return { weekOffset, week: rotation.week + weekOffset,
      startsAt: rotation.resetAt + (weekOffset - 1) * 604800,
      endsAt: rotation.resetAt + weekOffset * 604800, characters };
  });
  return { weeks: forecast, familyCounts, mapCounts: [...maps.values()].sort((a, b) => b.count - a.count || a.mapIdx - b.mapIdx) };
}

export function buildKillroyPlan(raw, { selections, seeds, upgrades = true, useSavedBuffs = false, unlimitedInventory = false }) {
  if (!Array.isArray(selections) || !selections.length) throw new Error('Select at least one character and encounter');
  if (typeof upgrades !== 'boolean' && !Array.isArray(upgrades)) throw new Error('Choose upgrade IDs or a comparison toggle');
  if (Array.isArray(upgrades) && upgrades.some(id => !Number.isInteger(id) || id < 0 || id >= KILLROY_UPGRADES.length)) {
    throw new Error('Invalid Killroy upgrade choice');
  }
  const upgradeIds = Array.isArray(upgrades) ? new Set(upgrades) : null;
  const compareUpgrades = upgradeIds ? upgradeIds.size > 0 : upgrades;
  const rows = [], seen = new Set(), warnings = [];
  for (const selection of selections) {
    const { charIdx, slot, setup, label, weekOffset = 0 } = selection;
    _weekOffset(weekOffset);
    const key = (weekOffset ? 'w' + weekOffset + ':' : '') + charIdx + ':' + slot;
    if (seen.has(key)) throw new Error('Duplicate character/encounter selection');
    seen.add(key);
    const encounter = killroyWeek(raw, charIdx, { weekOffset })[slot];
    if (!encounter?.eligible) throw new Error(encounter?.reason || 'Invalid encounter');
    const c = captureCombatFarming(raw, { charIdx, setup, seeds, seconds: 1, useSavedBuffs, unlimitedInventory });
    if (!killroyClassMatches(readRawKey(c.raw, 'CharacterClass_' + charIdx), encounter.family)) {
      throw new Error('The selected loadout changes this character to an ineligible class');
    }
    const options = combatFarmingOptions(c.raw), time = farmingNumber(options.values?.[106], 'Killroy time upgrade');
    warnings.push(...c.warnings);
    const choices = killroyUpgradeChoices(c.raw);
    const base = { charIdx, slot, weekOffset, encounter, label: label || characterOptions(raw)[charIdx].name, keepBuffs: c.keepBuffs,
      unlimitedInventory, warnings: c.warnings, choices };
    rows.push({ ...base, key, baseline: key, upgrade: null, setup: c.setup, seconds: Math.ceil(103 + time) });
    if (compareUpgrades) for (const u of choices.filter(u => (!upgradeIds || upgradeIds.has(u.id)) && u.unlocked && u.level != null)) {
      rows.push({ ...base, key: key + ':' + u.id, baseline: key, upgrade: u,
        setup: upsertPatch(c.setup, { system: 'raw', key: options.key, path: [106 + u.id], value: u.level + 1 }),
        seconds: Math.ceil(103 + time + (u.id === 0 ? 1 : 0)) });
    }
    if (compareUpgrades && choices.some(u => (!upgradeIds || upgradeIds.has(u.id)) && (u.unlocked == null || u.level == null))) {
      warnings.push('Some selected upgrade choices are unavailable in this save.');
    }
    if (upgradeIds) for (const id of upgradeIds) if (!choices[id].unlocked || choices[id].level == null) {
      warnings.push(base.label + ': +1 ' + choices[id].name + ' is locked or unavailable in the selected loadout.');
    }
  }
  if (rows.some(r => r.seconds > 86400)) throw new Error('Killroy duration exceeds the 24-hour simulation limit');
  const jobs = seeds.flatMap(seed => rows.map(r => ({ key: r.key, charIdx: r.charIdx, mapIdx: r.encounter.mapIdx,
    weekOffset: r.weekOffset, setup: r.setup, seconds: r.seconds, seed, inputOverrides: {
      killroy: true, useSavedBuffs: r.keepBuffs, unlimitedInventory: r.unlimitedInventory,
    } })));
  const rotation = _rotation(raw);
  const weeks = [...new Set(rows.map(r => r.weekOffset))].sort((a, b) => a - b).map(weekOffset => ({
    weekOffset, week: rotation.week + weekOffset, startsAt: rotation.resetAt + (weekOffset - 1) * 604800,
    endsAt: rotation.resetAt + weekOffset * 604800,
  }));
  if (weeks.some(w => w.weekOffset > 0)) warnings.push('Forecast assumes unchanged server rotation, unlocks, loadouts, upgrades and records. Each attempt starts independently from the captured save; no weekly progression is applied.');
  return { raw: structuredClone(raw), seeds: seeds.slice(), rows, jobs, weeks, warnings: [...new Set(warnings)] };
}

export function summarizeKillroy(plan, records) {
  const rows = plan.rows.map(r => ({ ...r, runs: 0, seeds: [], errors: [], warnings: [], inputIssues: [], totals: {}, mean: null, complete: false }));
  const byKey = new Map(rows.map(r => [r.key, r]));
  for (const record of records) {
    const row = byKey.get(record.job.key), seed = record.job.seed;
    if (!row || !plan.seeds.includes(seed) || row.seeds.includes(seed)) throw new Error('Unexpected or duplicate Killroy result');
    row.seeds.push(seed);
    if (record.error) { row.errors.push(record.error); continue; }
    const result = record.result, summary = result?.summary, k = summary?.special?.killroy;
    const state = summary?.special?.state?.killroy;
    if (!k || !state || !Number.isFinite(result.timeMs)) throw new Error('Killroy result is missing encounter counters');
    if (result.cancelled || (result.ended || summary.ended)?.reason !== 'killroy' || !state.finished) {
      row.errors.push('Attempt did not reach the native results boundary'); continue;
    }
    const items = summary.rewards?.byItem || {};
    const gains = { kills: k.kills, skullsDropped: k.skullsDropped, skullsPicked: k.skullsPicked,
      deaths: result.player?.deaths, seconds: result.timeMs / 1000 };
    for (const [key, item] of Object.entries(items)) if (/^(TalentPoint|DungCredits|Pearl)/.test(key)) gains[key] = item.qtyPicked;
    for (const [key, n] of Object.entries(gains)) row.totals[key] = (row.totals[key] || 0) + farmingNumber(n, key);
    row.runs++;
    row.inputIssues.push(...(result.inputIssues || []));
    for (const key of Object.keys(result.unmodelled || {})) row.warnings.push('Unmodelled mechanic: ' + key);
    if (summary.rewards?.inventoryFullAt != null) row.warnings.push('Inventory filled; bonus pickups may be lost.');
  }
  for (const row of rows) {
    row.complete = row.runs === plan.seeds.length && !row.errors.length;
    if (row.runs) row.mean = Object.fromEntries(Object.entries(row.totals).map(([k, v]) => [k, v / row.runs]));
    row.inputIssues = [...new Map(row.inputIssues.map(i => [i.key, i])).values()];
    row.warnings = [...new Set(row.warnings)];
    const base = byKey.get(row.baseline);
    row.delta = row.upgrade && row.complete && base.complete ? {
      kills: row.mean.kills - base.mean.kills, skullsPicked: row.mean.skullsPicked - base.mean.skullsPicked,
    } : null;
  }
  return rows;
}
