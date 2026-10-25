// ===== CLAMWORKS SCURGE ALLOCATION COMPARISONS (W7) =====
import { scurgeUpgradeInfo } from './clamworks.js';
import { buildClamworksCombatPlan, summarizeClamworksCombat } from './clamworks-combat.js';
import { applyCombatSetup, readRawKey, upsertPatch } from '../common/combat-sim-setup.js';

function _level(value, name) {
  if (value == null || value === '' || !Number.isSafeInteger(Number(value)) || Number(value) < 0) throw new Error('Missing or invalid ' + name);
  return Number(value);
}

function _allocate(levels, points, rank, otherPlayers) {
  const factors = [0, 4, 7].map(index => {
    const info = scurgeUpgradeInfo(index);
    const coefficient = info.perLevel * (index === 0 ? 1 : index === 7 ? otherPlayers / 100 : 1 / 100);
    return { index, offset: 1 / coefficient, coefficient, unlocked: rank >= info.unlockLevel };
  }).filter(f => f.unlocked && f.coefficient > 0);
  if (!points || !factors.length) return levels;
  // Equal-cost logarithmic marginal gains decrease with level: water-fill, then settle integer leftovers.
  let low = 0, high = Math.max(...factors.map(f => levels[f.index] + f.offset)) + points;
  for (let i = 0; i < 64; i++) {
    const mid = (low + high) / 2;
    const used = factors.reduce((sum, f) => sum + Math.max(0, mid - levels[f.index] - f.offset), 0);
    if (used <= points) low = mid; else high = mid;
  }
  let left = points;
  for (const f of factors) {
    const add = Math.min(left, Math.floor(Math.max(0, low - levels[f.index] - f.offset)));
    levels[f.index] += add; left -= add;
  }
  while (left > 0) {
    const best = factors.reduce((a, b) => 1 / (levels[b.index] + b.offset) > 1 / (levels[a.index] + a.offset) ? b : a);
    levels[best.index]++; left--;
  }
  return levels;
}

function _expPerKill(levels, otherPlayers) {
  const bonus = i => scurgeUpgradeInfo(i).perLevel * levels[i];
  return (1 + bonus(0)) * (1 + bonus(4) / 100) * (1 + bonus(2) / 100) * (1 + bonus(7) * otherPlayers / 100);
}

export function buildClamworksScurgePlan(raw, {
  charIdx, setup, seeds, seconds, mode = 'affliction', maxAffliction = 12, otherPlayers = 0, useSavedBuffs = false, unlimitedInventory = false,
}) {
  if (mode !== 'affliction' && mode !== 'upgrades') throw new Error('Unknown Scurge comparison mode');
  if (!Number.isInteger(maxAffliction) || maxAffliction < 0 || maxAffliction > 150) throw new Error('Choose a maximum Self Affliction level from 0 to 150');
  if (!Number.isInteger(otherPlayers) || otherPlayers < 0 || otherPlayers > 50) throw new Error('Enter 0-50 other real players on the map');
  const base = buildClamworksCombatPlan(raw, { charIdx, setup, seeds, seconds, useSavedBuffs, unlimitedInventory, upgrades: false });
  const captured = base.rows[0].setup;
  const menagerie = readRawKey(applyCombatSetup(raw, captured), 'Menagerie');
  if (Number(menagerie?.[2]?.[4]) !== 1) throw new Error('Scurge is not unlocked in this loadout');
  const rank = _level(menagerie?.[0]?.[8], 'Scurge level');
  const levels = Array.from({ length: 9 }, (_, i) => _level(menagerie?.[5]?.[i], scurgeUpgradeInfo(i).name + ' level'));
  const available = rank - levels.reduce((sum, n) => sum + n, 0);
  if (available < 0) throw new Error('Saved Scurge upgrades spend more points than the saved Scurge level provides');
  const selfBudget = available + levels[2];
  const maximum = rank >= scurgeUpgradeInfo(2).unlockLevel ? Math.min(selfBudget, maxAffliction) : 0;
  const rows = [{ ...base.rows[0], levels, selfAffliction: levels[2], changes: [], pointsLeft: available, expPerKill: _expPerKill(levels, otherPlayers) }];
  const afflictionLevels = mode === 'upgrades' ? [levels[2]] : Array.from({ length: maximum + 1 }, (_, i) => i);
  for (const self of afflictionLevels) {
    const allocation = levels.slice();
    allocation[2] = self;
    if (mode === 'upgrades') _allocate(allocation, available, rank, otherPlayers);
    const changes = allocation.flatMap((to, i) => to === levels[i] ? [] : [{ index: i, name: scurgeUpgradeInfo(i).name, from: levels[i], to }]);
    if (!changes.length) continue;
    let candidate = captured;
    for (const change of changes) candidate = upsertPatch(candidate, { system: 'raw', key: 'Menagerie', path: [5, change.index], value: change.to });
    rows.push({
      key: mode === 'upgrades' ? 'allocation:exp' : 'affliction:' + self,
      label: mode === 'upgrades' ? 'Optimized EXP upgrades' : 'Self Affliction ' + self, cost: null, setup: candidate,
      selfAffliction: self, levels: allocation, changes, pointsLeft: rank - allocation.reduce((sum, n) => sum + n, 0),
      expPerKill: _expPerKill(allocation, otherPlayers),
    });
  }
  const jobs = seeds.flatMap(seed => rows.map(row => ({
    key: row.key, charIdx, mapIdx: 306, seconds, seed, setup: row.setup,
    inputOverrides: { unlimitedInventory, useSavedBuffs: base.keepBuffs, otherPlayersCount: otherPlayers + 1 },
  })));
  return { ...base, rows, jobs, mode, rank, available, maxAffliction, maximum, otherPlayers, selfBudget };
}

export function summarizeClamworksScurge(plan, records) {
  const rows = summarizeClamworksCombat(plan, records);
  const byKey = new Map(rows.map(row => [row.key, row]));
  for (const row of rows) row.scurgeExp = 0;
  for (const record of records) {
    if (record.error) continue;
    const exp = record.result?.summary?.progress?.scurgeExp;
    if (!Number.isFinite(exp) || exp < 0) throw new Error('Scurge worker result is missing earned EXP');
    byKey.get(record.job.key).scurgeExp += exp;
  }
  for (const row of rows) {
    row.expPerHour = row.timeMs > 0 ? row.scurgeExp * 3.6e6 / row.timeMs : null;
    row.expGainPerHour = row.complete && rows[0].complete ? row.expPerHour - rows[0].expPerHour : null;
    row.pearlGainPerHour = row.complete && rows[0].complete ? row.pearlsPerHour - rows[0].pearlsPerHour : null;
  }
  return rows;
}
