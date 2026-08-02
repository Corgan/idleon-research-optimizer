// ===== DUNGEON SYSTEM (W2) =====
// Flurbo shop (dungeon passive) bonuses.

import { formulaEval } from '../../../formulas.js';
import { treeResult } from '../../node.js';
import { DungPassiveStats2 } from '../../data/game/customlists.js';

export var DUNGEON_MAPS = new Set([39, 40, 70, 71, 118, 119]);

export function isDungeonMap(mapIdx) {
  return DUNGEON_MAPS.has(Number(mapIdx));
}

export function computeDungeonDropRate(totalLuk, dungeonDropRarity) {
  return 1 + ((Number(totalLuk) || 0) + (Number(dungeonDropRarity) || 0)) / 100;
}

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
