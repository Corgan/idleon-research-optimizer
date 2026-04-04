// ===== BRIBE DATA =====
import { BribeDescriptions } from '../game/customlists.js';

export function bribeValue(idx) { return Number(BribeDescriptions[idx]?.[5]) || 0; }
