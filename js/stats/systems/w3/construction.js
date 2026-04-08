// ===== CONSTRUCTION SYSTEM (W3) =====
// Shrine bonuses with card multiplier.

import { node } from '../../node.js';
import { label } from '../../entity-names.js';
import { computeCardLv, computeCardLvDetail } from '../common/cards.js';
import { shrineBase, shrinePerLevel } from '../../data/w3/shrine.js';
import { SaltLicks } from '../../data/game/customlists.js';
import { BOSS3B_CARD_PCT } from '../../data/game-constants.js';

var SHRINE_DATA = {
  4: { base: shrineBase(4), perLevel: shrinePerLevel(4) },
};

export var shrine = {
  resolve: function(id, ctx) {
    var data = SHRINE_DATA[id];
    if (!data) return node(label('Shrine', id), 0, null, { note: 'shrine ' + id });
    var name = label('Shrine', id);
    var saveData = ctx.saveData;
    var shrineArr = saveData.shrineData && saveData.shrineData[id];
    if (!shrineArr) return node(name, 0, null, { note: 'shrine ' + id });
    var shrineLv = Number(shrineArr[3]) || 0;
    if (shrineLv <= 0) return node(name, 0, null, { note: 'shrine ' + id });

    var cd = computeCardLvDetail('Boss3B');
    var boss3bLv = cd.lv;
    var cardMulti = 1 + BOSS3B_CARD_PCT * boss3bLv / 100;
    var baseBonus = (shrineLv - 1) * data.perLevel + data.base;
    var val = cardMulti * baseBonus;

    var cardChildren = boss3bLv > 0 ? [
      node('Card Qty', cd.qty, null, { fmt: 'raw' }),
      node('Card Lv', cd.lv, null, { fmt: 'raw' }),
      node('Max Stars', cd.maxStars, null, { fmt: 'raw' }),
    ] : null;

    return node(name, val, [
      node('Shrine Level ' + shrineLv, baseBonus, null, { fmt: '+', note: data.base + ' base + ' + data.perLevel + '/level' }),
      node('Boss3B Card Bonus', cardMulti, cardChildren, { fmt: 'x', note: BOSS3B_CARD_PCT + '% per level' }),
    ], { fmt: '+', note: 'shrine ' + id });
  },
};

// ==================== SHRINE BY INDEX ====================
// Simplified shrine value lookup by index (no breakdown tree).

import { saveData as _consSaveData } from '../../../state.js';
import { cardLv as _consCardLv } from '../common/goldenFood.js';

export function computeShrine(idx) {
  var shrineLv = Number(_consSaveData.shrineData && _consSaveData.shrineData[idx] && _consSaveData.shrineData[idx][0]) || 0;
  if (shrineLv <= 0) return 0;
  var base = shrineBase(idx);
  var perLv = shrinePerLevel(idx);
  var rawVal = base + perLv * shrineLv;
  var boss3bLv = _consCardLv('Boss3B') || 0;
  var boss3bMulti = boss3bLv >= 6 ? 2 : 1;
  return rawVal * boss3bMulti;
}

// ==================== SALT LICK ====================

export function computeSaltLick(idx) {
  if (!_consSaveData.saltLickData) return 0;
  var purchased = Number(_consSaveData.saltLickData[idx]) || 0;
  if (purchased <= 0) return 0;
  if (!SaltLicks[idx]) return 0;
  return Number(SaltLicks[idx][2]) || 0;
}
