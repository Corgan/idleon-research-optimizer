// ===== DUNGEON SYSTEM (W2) =====
// Flurbo shop (dungeon passive) bonuses.

import { saveData } from '../../../state.js';
import { formulaEval } from '../../../formulas.js';
import { DungPassiveStats2 } from '../../data/game/customlists.js';

// ==================== FLURBO SHOP ====================

export function computeFlurboShop(idx) {
  var s = saveData;
  var dungUpg5 = s.dungUpgData && s.dungUpgData[5];
  if (!dungUpg5) return 0;
  var lv = Number(dungUpg5[idx]) || 0;
  if (lv <= 0) return 0;
  var info = DungPassiveStats2[idx];
  if (!info) return 0;
  return formulaEval(info[3], Number(info[1]) || 0, Number(info[2]) || 0, lv);
}
