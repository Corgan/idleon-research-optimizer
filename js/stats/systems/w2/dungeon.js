// ===== DUNGEON SYSTEM (W2) =====
// Flurbo shop (dungeon passive) bonuses.

import { formulaEval } from '../../../formulas.js';
import { treeResult } from '../../node.js';
import { DungPassiveStats2 } from '../../data/game/customlists.js';

// ==================== FLURBO SHOP ====================

export function computeFlurboShop(idx, saveData) {
  var s = saveData;
  var dungUpg5 = s.dungUpgData && s.dungUpgData[5];
  if (!dungUpg5) return treeResult(0);
  var lv = Number(dungUpg5[idx]) || 0;
  if (lv <= 0) return treeResult(0);
  var info = DungPassiveStats2[idx];
  if (!info) return treeResult(0);
  var val = formulaEval(info[3], Number(info[1]) || 0, Number(info[2]) || 0, lv);
  return treeResult(val, [
    { name: 'Passive Lv', val: lv, fmt: 'raw' },
    { name: 'Formula Result', val: val, fmt: 'raw', note: info[3] + '(' + info[1] + ',' + info[2] + ',' + lv + ')' },
  ]);
}
