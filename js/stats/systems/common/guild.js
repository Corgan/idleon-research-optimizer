// ===== GUILD SYSTEM =====
// Guild bonus from guild points through decay formula.

import { node } from '../../node.js';
import { formulaEval } from '../../../save/engine.js';

var GUILD_DATA = {
  10: { x1: 40, x2: 50, formula: 'decay', name: 'Guild DR Bonus' },
};

export var guild = {
  resolve: function(id, ctx) {
    var data = GUILD_DATA[id];
    if (!data) return node('Guild ' + id, 0, null, { note: 'guild ' + id });
    var gd = ctx.S.guildData;
    var lv = gd ? (Number((gd[0] || {})[id]) || 0) : 0;
    if (lv <= 0) return node(data.name, 0, null, { note: 'guild ' + id });
    var val = formulaEval(data.formula, data.x1, data.x2, lv);
    return node(data.name, val, [
      node('Guild Points', lv, null, { fmt: 'raw' }),
      node('Formula Result', val, null, { fmt: 'raw', note: data.formula + '(' + data.x1 + ',' + data.x2 + ',' + lv + ')' }),
    ], { fmt: '+', note: 'guild ' + id });
  },
};
