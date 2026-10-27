// ===== COVE ACTIVE-FARMING COMPARISONS (W5) =====
import { upgName, purchaseCostAt } from './cglunko.js';
import { holesBolaiaPerLv } from '../../data/w5/hole.js';
import { readRawKey, upsertPatch } from '../common/combat-sim-setup.js';
import { captureCombatFarming, combatFarmingOptions, combatFarmingMaps, combatFarmingJobs, farmingNumber, summarizeCombatFarming } from '../common/combat-farming.js';

const PRODUCTIVE = [1, 2, 3, 4, 6, 9, 10, 12, 15, 16, 17, 18, 19, 21, 22];
export const COVE_STONE_NAMES = Array.from({ length: 12 }, (_, i) => (i < 6 ? 'Blue' : 'Purple') + ' #' + (i % 6 + 1));

export function buildCoveCombatPlan(raw, options) {
  const base = captureCombatFarming(raw, options);
  if (!combatFarmingMaps(raw, base.charIdx).some(m => m.id === '216:17')) throw new Error('The Cove is not unlocked in this character snapshot');
  const { key, values } = combatFarmingOptions(base.raw);
  const levels = Array.from({ length: 24 }, (_, i) => farmingNumber(values?.[630 + i], upgName(i) + ' level', true));
  const balances = COVE_STONE_NAMES.map((_, i) => farmingNumber(values?.[654 + i], COVE_STONE_NAMES[i] + ' balance'));
  const focuses = [666, 667].map((i, n) => {
    const f = farmingNumber(values?.[i], (n ? 'Purple' : 'Blue') + ' focus', true);
    if (f > 6) throw new Error('Stone focus must be None or a stone from 1 to 6');
    return f;
  });
  const purchases = farmingNumber(values?.[604], 'daily cavern purchases', true);
  const holes = readRawKey(base.raw, 'Holes');
  const study17 = farmingNumber(holes?.[26]?.[17], 'Bolaia discount study level', true) * holesBolaiaPerLv(17);
  const rows = [{ key: 'current', label: 'Current loadout', setup: base.setup, mapIdx: 216, holeCavern: 17, cost: null }];
  if (options.upgrades !== false) for (const index of PRODUCTIVE) {
    const cost = purchaseCostAt(index, { levels, purchases, study17 });
    if (!Number.isFinite(cost) || cost <= 0) { base.warnings.push(upgName(index) + ': purchase cost is not representable; skipped.'); continue; }
    const stone = Math.floor(index / 2);
    rows.push({ key: 'upgrade:' + index, label: upgName(index), index, from: levels[index], to: levels[index] + 1,
      cost, stone, affordable: balances[stone] >= cost, mapIdx: 216, holeCavern: 17,
      setup: upsertPatch(base.setup, { system: 'raw', key, path: [630 + index], value: levels[index] + 1 }) });
  }
  if (options.focuses) for (let color = 0; color < 2; color++) for (let focus = 1; focus <= 6; focus++) {
    if (focus === focuses[color]) continue;
    if (levels[color ? 16 : 9] < 1 || (!color && balances[Math.floor((focus - 1) / 2)] < 0.1)) continue;
    rows.push({ key: 'focus:' + color + ':' + focus, label: (color ? 'Purple' : 'Blue') + ' focus #' + focus,
      setup: upsertPatch(base.setup, { system: 'raw', key, path: [666 + color], value: focus }),
      mapIdx: 216, holeCavern: 17, cost: null });
  }
  return { ...base, raw: undefined, rows, levels, purchases, study17, optionKey: key, balances, focuses, jobs: combatFarmingJobs(base, rows) };
}

export function summarizeCoveCombat(plan, records) {
  const rows = summarizeCombatFarming(plan, records, r => {
    const special = r.summary.special;
    const gains = special?.holeShapesByType;
    if (!gains) throw new Error('Cove result is missing collected stone gains');
    return { ...Object.fromEntries(COVE_STONE_NAMES.map((_, i) => ['stone' + i, gains[i] ?? 0])),
      total: farmingNumber(special.holeShapesGained, 'collected stones'), coveKills: farmingNumber(special.coveKills, 'Glunko kills') };
  });
  const baseline = rows[0];
  for (const row of rows) {
    row.gainPerHour = row.complete && baseline.complete ? row.rates.total - baseline.rates.total : null;
    const rateGain = row.stone != null && row.complete && baseline.complete ? row.rates['stone' + row.stone] - baseline.rates['stone' + row.stone] : null;
    row.paybackHours = rateGain > 0 ? row.cost / rateGain : null;
  }
  return rows;
}
