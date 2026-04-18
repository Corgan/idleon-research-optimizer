// ===== LEGEND SYSTEM (W7) =====
// Legend talent point bonuses.

import { node } from '../../node.js';
import { label } from '../../entity-names.js';
import { legendPTSbonus } from './spelunking.js';

import { legendTalentPerPt } from '../../data/w7/legendTalent.js';
export var legendPTS = {
  resolve: function(id, ctx) {
    var saveData = ctx.saveData;
    var lv = (saveData.spelunkData && saveData.spelunkData[18] && saveData.spelunkData[18][id]) || 0;
    var perPt = legendTalentPerPt(id);
    var val = legendPTSbonus(id, saveData);
    if (val <= 0) return node(label('Legend', id), 0, null, { note: 'legend ' + id });
    return node(label('Legend', id), val, [
      node('Points', lv, null, { fmt: 'raw' }),
      node('Per Point', perPt, null, { fmt: 'raw' }),
    ], { fmt: '+', note: 'legend ' + id });
  },
};
