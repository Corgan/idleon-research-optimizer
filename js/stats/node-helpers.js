// ===== NODE HELPERS — Breakdown tree node factories =====
// Shared between dash-breakdowns.js (UI) and tree-builder.js (stats).
// Extracted to avoid stats -> UI reverse dependency.

import {
  RES_GRID_RAW,
  SHAPE_BONUS_PCT,
  SHAPE_NAMES,
  gridCoord,
} from '../game-data.js';
import { cloudBonus } from '../game-helpers.js';
import { rogBonusQTY } from './systems/w7/sushi.js';

export function _bNode(label, val, children, opts) {
  return { label, val: val || 0, children: children || null, fmt: opts?.fmt || 'raw', note: opts?.note || '', tag: opts?.tag || '' };
}

export function _gbNode(S, idx, label, opts) {
  const info = RES_GRID_RAW[idx];
  if (!info) return _bNode(label || 'Grid #' + idx, 0, null, opts);
  const lv = S.gridLevels[idx] || 0;
  const bonusPerLv = info[2];
  const base = bonusPerLv * lv;
  const si = S.shapeOverlay[idx];
  const hasShape = si >= 0 && si < SHAPE_BONUS_PCT.length;
  const shapePct = hasShape ? SHAPE_BONUS_PCT[si] : 0;
  const shapeMult = 1 + shapePct / 100;
  const final = base * shapeMult * S.allBonusMulti;
  const coord = gridCoord(idx);
  const comp55val = S.companionIds.has(55) ? 15 : 0;
  const comp0owned = S.companionIds.has(0);
  const comp0val = comp0owned && S.cachedComp0DivOk && (S.gridLevels[173] || 0) > 0 ? 5 : 0;
  const cbGA = S.weeklyBossData ? cloudBonus(71, S.weeklyBossData) + cloudBonus(72, S.weeklyBossData) + cloudBonus(76, S.weeklyBossData) : 0;
  const rog53 = rogBonusQTY(53, S.cachedUniqueSushi);
  return _bNode(label || 'Grid ' + coord + ': ' + (info[1] || '#' + idx), final, [
    _bNode('Bonus', base, [
      _bNode('Base', bonusPerLv, null, { fmt: '%' }),
      _bNode('Level', lv, null, { fmt: 'x' })
    ], { fmt: '%' }),
    _bNode('Shape Bonus' + (hasShape ? ' (' + SHAPE_NAMES[si] + ')' : ''), shapeMult, null, { fmt: 'x', note: hasShape ? '' : 'No shape' }),
    _bNode('All Bonus Multi', S.allBonusMulti, [
      _bNode('Pirate Deckhand', comp55val, null, { fmt: '%' }),
      _bNode('Grid ' + gridCoord(173) + ': Divine Design', comp0val, null, { fmt: '%', note: comp0owned ? (S.cachedComp0DivOk ? ((S.gridLevels[173]||0) > 0 ? '' : 'Node LV 0') : 'Doot divine < 2') : 'Doot not owned' }),
      _bNode('Cloud Bonus 71+72+76', cbGA, null, { fmt: '%' }),
      _bNode('RoG 53', rog53, null, { fmt: '%', note: (S.cachedUniqueSushi || 0) + ' unique sushi' })
    ], { fmt: 'x' })
  ], opts);
}
