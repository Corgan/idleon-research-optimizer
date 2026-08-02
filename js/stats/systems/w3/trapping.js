// ===== TRAPPING SYSTEM (W3) =====
// Trap minigame bonuses.

import { optionsListData } from '../../../save/data.js';
import { RANDOlist } from '../../data/game/customlists.js';

// ==================== TRAP MG BONUS ====================

export function computeTrapMGBonus(idx, saveData) {
  var highScore = Number(optionsListData[99]) || 0;
  if (highScore < 25 * (idx + 1)) return 0;
  return Number(RANDOlist[59] && RANDOlist[59][idx]) || 0;
}
