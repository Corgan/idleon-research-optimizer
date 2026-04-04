// ===== COMPASS DATA =====
import { CompassUpg } from '../game/customlists.js';

export function compassUpgPerLevel(idx) { return Number(CompassUpg[idx]?.[5]) || 0; }
