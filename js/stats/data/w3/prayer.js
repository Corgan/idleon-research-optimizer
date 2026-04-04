import { PrayerInfo } from '../game/customlists.js';

// ===== PRAYER DATA =====
// PrayerInfo[idx][3] = base bonus per level for prayer idx
export function prayerBaseBonus(idx) { return Number(PrayerInfo[idx]?.[3]) || 0; }
