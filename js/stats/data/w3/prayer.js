import { PrayerInfo } from '../game/customlists.js';

// ===== PRAYER DATA =====
// PrayerInfo[idx][3] = base bonus per level for prayer idx
export function prayerBaseBonus(idx, costIdx) {
  var col = costIdx === 1 ? 4 : 3;
  return Number(PrayerInfo[idx]?.[col]) || 0;
}
