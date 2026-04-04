import { GodsInfo } from '../game/customlists.js';

// ===== DIVINITY DATA =====
// GodsInfo[godIdx][3] = x1 parameter for minor linked bonus
export function godMinorX1(godIdx) { return Number(GodsInfo[godIdx]?.[3]) || 0; }
