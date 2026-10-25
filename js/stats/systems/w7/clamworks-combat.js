// ===== CLAMWORKS ACTIVE-FARMING COMPARISONS (W7) =====
import { UPGRADE_COUNT, upgName, upgradeCostAt, clamHP } from './clamworks.js';
import { applyCombatSetupDetailed, normalizeCombatSetup, readRawKey, upsertPatch } from '../common/combat-sim-setup.js';
import { setupEditsBuffs } from '../common/combat-sim-setup-compare.js';
import { createStatContext } from '../../stat-context.js';
import { computeOverkillTier, computeMultiKillTotal } from '../common/overkill.js';
import { buffsActiveData, optionsListData, equipOrderData, emmData } from '../../../save/data.js';
import { getBuffBonus } from '../../defs/helpers.js';
import { getCatalog } from '../../registry.js';
import { etcBonus } from '../common/etcBonus.js';
import { wraithStats, tempestStats, arcanistStats } from '../common/combat-forms.js';

export function clamworksMultikill(S, charIdx) {
  if (!Number.isInteger(charIdx) || charIdx < 0 || !S.lv0AllData?.[charIdx]?.length) {
    throw new Error('The selected character has no saved level data');
  }
  const ctx = createStatContext({ saveData: S, charIdx, mapIdx: 306, layer1: { activeCombat: true } });
  const damage = ctx.resolve('damage');
  if (damage.unavailable) return { val: null, unavailable: true, reason: damage.reason };
  const forms = [[195, 1, wraithStats], [420, 0.1, tempestStats], [585, 0.1, arcanistStats]];
  const form = forms.find(([id, threshold]) => getBuffBonus(id, 1, charIdx, ctx) >= threshold
    && (buffsActiveData[charIdx] || []).some(b => Number(b[0]) === id && Number(b[1]) > 100));
  const deps = form && {
    tn: (tab, id) => Number(getCatalog().talent.resolve(id, ctx, { tab }).val),
    ola: optionsListData,
    etc: id => Number(etcBonus.resolve(String(id), ctx).val),
    eqOrder: equipOrderData[charIdx], emm: emmData[charIdx], lv0: S.lv0AllData[charIdx],
  };
  const maxDmg = form ? form[2](S, deps).damage : Number(damage.val), monsterHP = clamHP();
  if (!Number.isFinite(maxDmg) || maxDmg < 0 || !Number.isFinite(monsterHP) || monsterHP <= 0) {
    throw new Error('Clamworks damage or clam HP is not representable');
  }
  // The native pearl bonus uses raw MultiKillTOTAL, without the activation gate.
  const { tier } = computeOverkillTier(charIdx, ctx, { mapIdx: 306, afkTarget: 'w7a6', monsterHP, maxDmg });
  const val = computeMultiKillTotal(charIdx, ctx, { mapIdx: 306, tier });
  if (!Number.isFinite(val)) throw new Error('Clamworks Multikill is not representable');
  return { val, tier, maxDmg, monsterHP, partial: Boolean(damage.partial), reason: damage.reason || '' };
}

function _number(value, name, integer = false) {
  const n = Number(value);
  if (value == null || value === '' || !Number.isFinite(n) || n < 0 || (integer && !Number.isSafeInteger(n))) {
    throw new Error('Missing or invalid ' + name);
  }
  return n;
}

function _upgradeCandidates(raw, { charIdx, setup, upgrades = true }) {
  _number(charIdx, 'character', true);
  if (setup && Number(setup.charIdx) !== charIdx) throw new Error('This loadout belongs to another character');
  const captured = normalizeCombatSetup(structuredClone(setup || { charIdx, patches: [] }));
  const applied = applyCombatSetupDetailed(raw, captured);
  const key = readRawKey(applied.raw, 'OptionsListAccount') != null ? 'OptionsListAccount' : 'OptLacc';
  const options = readRawKey(applied.raw, key);
  const balance = _number(options?.[454], 'pearl balance');
  const levels = Array.from({ length: UPGRADE_COUNT }, (_, i) => _number(options?.[455 + i], upgName(i) + ' level', true));
  const promotion = _number(options?.[464], 'promotion level', true);
  const unlocked = _number(options?.[465], 'Clamworks upgrade unlock progress', true);
  const scurgeLevels = readRawKey(applied.raw, 'Menagerie')?.[5] || [];
  const warnings = applied.warnings.slice();
  const rows = [{ key: 'current', label: 'Current loadout', setup: captured, cost: null }];
  if (upgrades) {
    for (let i = 0; i < UPGRADE_COUNT; i++) {
      if (i > unlocked || i === 4 || i === 8 || (i === 1 && levels[i] >= 23)) continue;
      const cost = upgradeCostAt(i, { levels, promotion, scurgeLevels });
      if (!Number.isFinite(cost) || cost <= 0) {
        warnings.push(upgName(i) + ': next purchase cost is not representable; comparison skipped.');
        continue;
      }
      const candidate = upsertPatch(captured, { system: 'raw', key, path: [455 + i], value: levels[i] + 1 });
      rows.push({
        key: 'upgrade:' + i, label: upgName(i), index: i, from: levels[i], to: levels[i] + 1,
        setup: candidate, cost, affordable: balance >= cost,
      });
    }
  }
  return { rows, warnings, balance, promotion };
}

export function buildClamworksCombatPlan(raw, {
  charIdx, setup, seeds, seconds, upgrades = true, unlimitedInventory = false, useSavedBuffs = false,
}) {
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 86400) throw new Error('Choose a duration up to 24 hours');
  if (!Array.isArray(seeds) || !seeds.length || new Set(seeds).size !== seeds.length
    || seeds.some(s => !Number.isInteger(s) || s < 1 || s > 0xffffffff)) throw new Error('Distinct nonzero 32-bit seeds are required');
  const candidates = _upgradeCandidates(raw, { charIdx, setup, upgrades });
  const { rows } = candidates;
  const keepBuffs = useSavedBuffs || setupEditsBuffs(rows[0].setup);
  const jobs = seeds.flatMap(seed => rows.map(row => ({
    key: row.key, charIdx, mapIdx: 306, seconds, seed, setup: row.setup,
    inputOverrides: { unlimitedInventory, useSavedBuffs: keepBuffs },
  })));
  return { ...candidates, jobs, seeds: seeds.slice(), seconds, keepBuffs, unlimitedInventory };
}

export function buildClamworksAfkPlan(raw, { charIdx, setup, hours, phase = 'entry' }) {
  if (!Number.isFinite(hours) || hours < 0 || hours * 3600 > 2e8) throw new Error('Enter AFK hours between 0 and 55,555');
  if (!['entry', 'settled'].includes(phase)) throw new Error('Unknown Clamworks claim phase');
  return { ..._upgradeCandidates(raw, { charIdx, setup }), charIdx, hours, phase };
}

export function summarizeClamworksAfk(plan, records) {
  const byKey = new Map();
  for (const record of records) {
    if (!plan.rows.some(row => row.key === record.key) || byKey.has(record.key)) throw new Error('Unexpected or duplicate Clamworks AFK result');
    byKey.set(record.key, record);
  }
  const rows = plan.rows.map(row => {
    const record = byKey.get(row.key), result = record?.result, c = result?.clamworks;
    const error = record?.error || (record && (!result || result.unavailable || !c) ? result?.reason || 'Clamworks claim result is missing' : '');
    if (!record || error) return { ...row, complete: false, error, pending: !record };
    return {
      ...row, complete: true, partial: Boolean(result.partial || c.rerollPartial),
      expectedPearls: _number(c.expectedPearls, 'AFK pearl currency'),
      pureChance: _number(c.pure.chance, 'AFK Pure Pearl chance'),
      pureExpected: _number(c.pure.expected, 'AFK Pure Pearl quantity'),
      policyPearls: _number(c.strategy.expectedPearls, 'reroll-policy pearl currency'),
      policyPureChance: _number(c.strategy.pureChance, 'reroll-policy Pure Pearl chance'),
      effectiveHours: _number(result.effectiveHours, 'credited AFK hours'),
      warnings: [...new Set([...(result.warnings || []),
        ...(c.rerollPartial ? ['Guild data missing: reroll odds omit unknown guild bonuses.'] : []),
        ...(c.autoClaim ? ['Auto-claim hides the reroll button.'] : []),
        ...(c.foodBlocked ? ['Food loss blocks the first reroll offer.'] : []),
      ])],
    };
  });
  for (const row of rows) {
    row.gain = row.cost != null && row.complete && rows[0].complete ? row.expectedPearls - rows[0].expectedPearls : null;
    row.policyGain = row.cost != null && row.complete && rows[0].complete ? row.policyPearls - rows[0].policyPearls : null;
    row.paybackClaims = row.policyGain > 0 ? row.cost / row.policyGain : null;
    row.paybackHours = row.paybackClaims == null ? null : row.paybackClaims * plan.hours;
  }
  return rows;
}

export function summarizeClamworksCombat(plan, records) {
  const rows = plan.rows.map(row => ({
    ...row, runs: 0, timeMs: 0, pearls: 0, kills: 0, deaths: 0, drops: 0, blackDrops: 0,
    errors: [], warnings: [], inputIssues: [], seeds: [], complete: false, pearlsPerHour: null, killsPerHour: null,
  }));
  const byKey = new Map(rows.map(row => [row.key, row]));
  for (const record of records) {
    const row = byKey.get(record.job.key);
    if (!row || !plan.seeds.includes(record.job.seed) || row.seeds.includes(record.job.seed)) throw new Error('Unexpected or duplicate Clamworks combat result');
    row.seeds.push(record.job.seed);
    if (record.error) { row.errors.push(record.error); continue; }
    const r = record.result, pearls = r?.summary?.special?.clamPearls;
    if (!pearls || !Number.isFinite(r.timeMs) || r.timeMs <= 0) throw new Error('Clamworks worker result is missing pearl gains or duration');
    row.pearls += _number(pearls.pearlsGained, 'collected pearl gains');
    row.kills += _number(r.summary.rewards?.kills, 'kill count');
    row.drops += _number(pearls.dropped, 'pearl drops');
    row.blackDrops += _number(pearls.black, 'Pure Pearl drops');
    row.deaths += _number(r.player?.deaths, 'player deaths');
    row.timeMs += r.timeMs;
    row.runs++;
    if (r.ended || r.summary.ended || r.timeMs < plan.seconds * 1000) row.warnings.push('Run ended early; upgrade gain comparison unavailable.');
    if (r.summary.rewards.inventoryFullAt != null) row.warnings.push('Inventory filled during farming.');
    for (const key of Object.keys(r.unmodelled || {})) row.warnings.push('Unmodelled mechanic: ' + key);
    for (const issue of r.inputIssues || []) row.inputIssues.push(issue);
  }
  for (const row of rows) {
    row.warnings = [...new Set(row.warnings)];
    row.inputIssues = [...new Map(row.inputIssues.map(i => [i.key, i])).values()];
    row.complete = row.runs === plan.seeds.length && !row.errors.length && !row.warnings.some(w => w.startsWith('Run ended early'));
    if (row.timeMs > 0) {
      row.pearlsPerHour = row.pearls * 3.6e6 / row.timeMs;
      row.killsPerHour = row.kills * 3.6e6 / row.timeMs;
    }
  }
  const baseline = rows[0];
  for (const row of rows) {
    row.gainPerHour = row.cost != null && row.complete && baseline.complete ? row.pearlsPerHour - baseline.pearlsPerHour : null;
    row.paybackHours = row.gainPerHour > 0 ? row.cost / row.gainPerHour : null;
  }
  return rows;
}
