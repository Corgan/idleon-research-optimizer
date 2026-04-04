import { GrimoireUpg } from '../game/customlists.js';

// ===== GRIMOIRE DATA =====
export function grimoireUpgPerLevel(idx) { return Number(GrimoireUpg[idx]?.[5]) || 0; }
