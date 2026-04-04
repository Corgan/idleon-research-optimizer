import { ShrineInfo } from '../game/customlists.js';

// ===== SHRINE DATA =====
// ShrineInfo[idx][2] = base bonus, ShrineInfo[idx][3] = bonus per level
export function shrineBase(idx) { return Number(ShrineInfo[idx]?.[2]) || 0; }
export function shrinePerLevel(idx) { return Number(ShrineInfo[idx]?.[3]) || 0; }
