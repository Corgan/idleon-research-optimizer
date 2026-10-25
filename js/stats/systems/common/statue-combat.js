// ===== ACTIVE STATUE FARMING =====
import { STATUE_COUNT } from '../../data/common/statues.js';
import { upsertPatch } from './combat-sim-setup.js';
import { captureCombatFarming, combatFarmingMaps, combatFarmingOptions, combatFarmingJobs, farmingNumber, summarizeCombatFarming } from './combat-farming.js';

export function buildStatueCombatPlan(raw, options) {
  const base = captureCombatFarming(raw, options);
  const maps = combatFarmingMaps(raw, base.charIdx);
  const selected = options.allMaps ? maps : maps.filter(m => String(m.id) === String(options.mapId));
  if (!selected.length) throw new Error('Choose an accessible combat map for this character');
  const { key, values } = combatFarmingOptions(base.raw);
  const zenith = farmingNumber(values?.[487], 'automatic Zenith Cluster setting') === 1;
  const manualDeposits = options.manualDeposits !== false;
  const setup = manualDeposits && zenith ? upsertPatch(base.setup, { system: 'raw', key, path: [487], value: 0 }) : base.setup;
  const rows = selected.map(map => ({ key: 'map:' + map.id, label: map.name, mapId: map.id, mapIdx: map.mapIdx,
    holeCavern: map.holeCavern, setup }));
  const target = options.target ?? 0;
  if (!Number.isInteger(target) || target < 0 || target >= STATUE_COUNT) throw new Error('Choose a valid target statue');
  return { ...base, raw: undefined, rows, target, manualDeposits, zenith,
    canApply: manualDeposits || !zenith, jobs: combatFarmingJobs(base, rows) };
}

export function summarizeStatueCombat(plan, records) {
  return summarizeCombatFarming(plan, records, r => {
    const rewards = r.summary.rewards;
    if (!rewards?.byItem) throw new Error('Statue result is missing the item ledger');
    const gains = {};
    let total = 0;
    for (let i = 0; i < STATUE_COUNT; i++) {
      const row = rewards.byItem['EquipmentStatues' + (i + 1)];
      const picked = row ? farmingNumber(row.qtyPicked, 'picked statues') : 0;
      gains['statue' + i] = picked;
      total += picked;
    }
    return { ...gains, total };
  });
}
