// ===== LEGEND TALENT DATA =====
import { LegendTalents } from '../game/customlists.js';

export function legendTalentPerPt(idx) { return Number(LegendTalents[idx]?.[2]) || 0; }
