// ===== LEGEND SYSTEM (W7) =====
// Legend talent point bonuses.

import { node } from '../../node.js';
import { legendPTSbonus } from './spelunking.js';

import { LEGEND_TALENT_PER_PT } from '../../../game-data.js';
import { S } from '../../../state.js';

export var legendPTS = {
  resolve: function(id, ctx) {
    var lv = (S.spelunkData && S.spelunkData[18] && S.spelunkData[18][id]) || 0;
    var perPt = LEGEND_TALENT_PER_PT[id] || 0;
    var val = legendPTSbonus(id);
    if (val <= 0) return node('Legend Talent ' + id, 0, null, { note: 'legend ' + id });
    return node('Legend Talent ' + id, val, [
      node('Points', lv, null, { fmt: 'raw' }),
      node('Per Point', perPt, null, { fmt: 'raw' }),
    ], { fmt: '+', note: 'legend ' + id });
  },
};
