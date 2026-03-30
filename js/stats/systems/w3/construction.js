// ===== CONSTRUCTION SYSTEM (W3) =====
// Shrine bonuses with card multiplier.

import { node } from '../../node.js';
import { computeCardLv, computeCardLvDetail } from '../common/cards.js';

var SHRINE_DATA = {
  4: { base: 15, perLevel: 3, name: 'Clover Shrine' },
};

export var shrine = {
  resolve: function(id, ctx) {
    var data = SHRINE_DATA[id];
    if (!data) return node('Shrine ' + id, 0, null, { note: 'shrine ' + id });
    var S = ctx.S;
    var shrineArr = S.shrineData && S.shrineData[id];
    if (!shrineArr) return node(data.name, 0, null, { note: 'shrine ' + id });
    var shrineLv = Number(shrineArr[3]) || 0;
    if (shrineLv <= 0) return node(data.name, 0, null, { note: 'shrine ' + id });

    var cd = computeCardLvDetail('Boss3B');
    var boss3bLv = cd.lv;
    var cardMulti = 1 + 5 * boss3bLv / 100;
    var baseBonus = (shrineLv - 1) * data.perLevel + data.base;
    var val = cardMulti * baseBonus;

    var cardChildren = boss3bLv > 0 ? [
      node('Card Qty', cd.qty, null, { fmt: 'raw' }),
      node('Card Lv', cd.lv, null, { fmt: 'raw' }),
      node('Max Stars', cd.maxStars, null, { fmt: 'raw' }),
    ] : null;

    return node(data.name, val, [
      node('Shrine Level ' + shrineLv, baseBonus, null, { fmt: '+', note: data.base + ' base + ' + data.perLevel + '/level' }),
      node('Boss3B Card Bonus', cardMulti, cardChildren, { fmt: 'x', note: '5% per level' }),
    ], { fmt: '+', note: 'shrine ' + id });
  },
};
