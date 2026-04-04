// ===== GUILD SYSTEM =====
// Guild bonus from guild points through decay formula.

import { node } from '../../node.js';
import { label } from '../../entity-names.js';
import { formulaEval } from '../../../formulas.js';
import { guildBonusParams } from '../../data/common/guild.js';

export var guild = {
  resolve: function(id, ctx) {
    var data = guildBonusParams(id);
    if (!data) return node(label('Guild', id), 0, null, { note: 'guild ' + id });
    var name = label('Guild', id);
    var gd = ctx.saveData.guildData;
    var lv = gd ? (Number((gd[0] || {})[id]) || 0) : 0;
    if (lv <= 0) return node(name, 0, null, { note: 'guild ' + id });
    var val = formulaEval(data.formula, data.x1, data.x2, lv);
    return node(name, val, [
      node('Guild Points', lv, null, { fmt: 'raw' }),
      node('Formula Result', val, null, { fmt: 'raw', note: data.formula + '(' + data.x1 + ',' + data.x2 + ',' + lv + ')' }),
    ], { fmt: '+', note: 'guild ' + id });
  },
};
