import { HolesInfo, CosmoUpgrades } from '../game/customlists.js';

// ===== HOLE DATA =====
export function holesMeasBase(idx) { return HolesInfo[55]?.[idx]; }
export function holesMeasType(idx) { return Number(HolesInfo[52]?.[idx]) || 0; }
export function holesBolaiaPerLv(idx) { return Number(HolesInfo[70]?.[idx]) || 0; }
export function holesMonBonus(idx) { return Number(HolesInfo[37]?.[idx]) || 0; }
export function monumentBonusText(idx) { return HolesInfo[32]?.[idx] || ''; }
export function monumentTrainingMilestones(t) {
  return HolesInfo[30].slice(0, 8).map((hours, i) => ({
    hours: Number(hours), text: HolesInfo[31][8 * t + i],
  }));
}
export function justiceCases() {
  return HolesInfo[62].map((row, id) => {
    const [visitor, text, approve, reject, scaling, gate] = row.split('|');
    return { id, visitor: Number(visitor), name: HolesInfo[63][Number(visitor)].replaceAll('_', ' '),
      text: text.replaceAll('_', ' '), approve, reject, scaling, gate };
  });
}

// Jar bonus per level for DR jars (hardcoded; no single game table row maps jar→bonus)
export var HOLES_JAR_BONUS_PER_LV = { 23: 1, 30: 1 };

// Generic cosmo upgrade base accessor
export function cosmoUpgBase(tier, idx) {
  return CosmoUpgrades[tier]?.[idx] ? Number(CosmoUpgrades[tier][idx][0]) || 0 : 0;
}
