import { CompanionDB } from '../game/customlists.js';

// ===== COMPANION DATA =====
export function companionBonus(idx) { return Number(CompanionDB[idx]?.[2]) || 0; }
