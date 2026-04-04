// ===== SPELUNKING SYSTEM (W7) =====
// Spelunking shop upgrade bonuses and legend talent bonuses.

import { node } from '../../node.js';
import { label } from '../../entity-names.js';
import { saveData } from '../../../state.js';
import { legendTalentPerPt } from '../../data/w7/legendTalent.js';
import { spelunkUpgPerLevel } from '../../data/w7/spelunking.js';

export function legendPTSbonus(idx) {
  var lv = (saveData.spelunkData && saveData.spelunkData[18] && saveData.spelunkData[18][idx]) || 0;
  var perPt = legendTalentPerPt(idx);
  return Math.round(lv * perPt);
}

var SPELUNK_DATA = {
  50: {},
};

export var spelunkShop = {
  resolve: function(id, ctx) {
    var data = SPELUNK_DATA[id];
    var name = label('Spelunking', id);
    if (!data) return node(name, 0, null, { note: 'spelunk ' + id });
    var saveData = ctx.saveData;
    var shopLv = Number((saveData.spelunkData && saveData.spelunkData[5] && saveData.spelunkData[5][id]) || 0);
    if (shopLv <= 0) return node(name, 0, null, { note: 'spelunk ' + id });
    var perLevel = spelunkUpgPerLevel(id);
    var val = perLevel * shopLv;
    return node(name, val, [
      node('Shop Level', shopLv, null, { fmt: 'raw' }),
      node('Per Level', perLevel, null, { fmt: 'raw' }),
    ], { fmt: '+', note: 'spelunk ' + id });
  },
};
