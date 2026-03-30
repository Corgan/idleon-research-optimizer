// ===== SPELUNKING SYSTEM (W7) =====
// Spelunking shop upgrade bonuses and legend talent bonuses.

import { node } from '../../node.js';
import { S } from '../../../state.js';
import { LEGEND_TALENT_PER_PT } from '../../../game-data.js';

export function legendPTSbonus(idx) {
  var lv = (S.spelunkData && S.spelunkData[18] && S.spelunkData[18][idx]) || 0;
  var perPt = LEGEND_TALENT_PER_PT[idx] || 0;
  return Math.round(lv * perPt);
}

var SPELUNK_DATA = {
  50: { perLevel: 1, name: 'Spelunk Shop 50 (DR)' },
};

export var spelunkShop = {
  resolve: function(id, ctx) {
    var data = SPELUNK_DATA[id];
    if (!data) return node('Spelunk Shop ' + id, 0, null, { note: 'spelunk ' + id });
    var S = ctx.S;
    var shopLv = Number((S.spelunkData && S.spelunkData[5] && S.spelunkData[5][id]) || 0);
    if (shopLv <= 0) return node(data.name, 0, null, { note: 'spelunk ' + id });
    var val = data.perLevel * shopLv;
    return node(data.name, val, [
      node('Shop Level', shopLv, null, { fmt: 'raw' }),
      node('Per Level', data.perLevel, null, { fmt: 'raw' }),
    ], { fmt: '+', note: 'spelunk ' + id });
  },
};
