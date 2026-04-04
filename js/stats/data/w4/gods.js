// ===== GODS DATA =====
import { GodsInfo } from '../game/customlists.js';

export function godsType(idx) { return GodsInfo[idx] != null ? Number(GodsInfo[idx][13]) || 0 : -1; }
