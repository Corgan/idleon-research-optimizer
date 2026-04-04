import { SpelunkUpg } from '../game/customlists.js';

// ===== SPELUNKING DATA =====
// SpelunkUpg[idx][4] = per-level bonus value for shop upgrade idx
export function spelunkUpgPerLevel(idx) { return Number(SpelunkUpg[idx]?.[4]) || 0; }
