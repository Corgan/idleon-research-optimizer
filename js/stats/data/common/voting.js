// ===== VOTING DATA =====
import { NinjaInfo } from '../game/customlists.js';

// NinjaInfo[38]: triplets of [name, value, tier]; value at stride 3 offset 1
export function votingBonusValue(idx) { return Number(NinjaInfo[38]?.[idx * 3 + 1]) || 0; }
