// ===== DUNGEON SYSTEM (W2) =====
// Flurbo shop (dungeon passive) bonuses.

import { formulaEval } from '../../../formulas.js';
import { treeResult } from '../../node.js';
import { DungPassiveStats2 } from '../../data/game/customlists.js';
import { DungMobs } from '../../data/game/custommaps.js';

export var DUNGEON_MAPS = new Set([39, 40, 70, 71, 118, 119]);

export function isDungeonMap(mapIdx) {
  return DUNGEON_MAPS.has(Number(mapIdx));
}

export function computeDungeonDropRate(totalLuk, dungeonDropRarity) {
  return 1 + ((Number(totalLuk) || 0) + (Number(dungeonDropRarity) || 0)) / 100;
}

export function dungeonCardTargets() {
  return Object.entries(DungMobs).filter(([, row]) => Number(row[4]) !== -1)
    .map(([key, row]) => ({ key, cardIndex: Number(row[4]), baseChance: Number(row[7]),
      tierDependent: ['frogGR', 'snakeZ', 'iceBossZ'].includes(key) }));
}

export function dungeonCardDropChance(baseChance, cardBonusPct, runCardChance, serverCardMulti) {
  const inputs = [baseChance, cardBonusPct, runCardChance, serverCardMulti].map(value => {
    if (value == null || value === '' || !Number.isFinite(Number(value)))
      throw new Error('Dungeon card chance inputs are missing or invalid.');
    return Number(value);
  });
  [baseChance, cardBonusPct, runCardChance, serverCardMulti] = inputs;
  if (baseChance < 0 || cardBonusPct < -100 || runCardChance < 0 || serverCardMulti < 0)
    throw new Error('Dungeon card chance inputs cannot be negative.');
  const threshold = (1 + cardBonusPct / 100) * baseChance
    * Math.max(1, Math.min(2, runCardChance) * Math.min(4, serverCardMulti));
  if (!Number.isFinite(threshold)) throw new Error('Dungeon card chance exceeds numeric limits.');
  return Math.min(1, threshold);
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
