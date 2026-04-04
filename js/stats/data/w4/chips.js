import { ChipDesc } from '../game/customlists.js';

// ===== CHIP DATA =====
// ChipDesc[idx][11] = bonus value for chip type idx
export function chipBonusValue(idx) { return Number(ChipDesc[idx]?.[11]) || 0; }
