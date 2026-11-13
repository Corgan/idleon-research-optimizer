// ===== MERITOC DATA =====
import { NinjaInfo } from '../game/customlists.js';

// NinjaInfo[41]: triplets [desc, value, ?]; extract value at every 3rd pos
export const MERITOC_BASE = [];
for (let i = 1; i < NinjaInfo[41].length; i += 3)
  MERITOC_BASE.push(Number(NinjaInfo[41][i]));
export function meritocBonusName(idx) { return String(NinjaInfo[41]?.[idx * 3] ?? '').replace(/_/g, ' '); }
