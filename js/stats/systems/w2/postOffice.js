// ===== POST OFFICE SYSTEM (W2) =====
// Post Office box rewards through decay formula.

import { node } from '../../node.js';
import { postOfficeData } from '../../../save/data.js';
import { formulaEval } from '../../../save/engine.js';

var PO_DATA = {
  '11,0': { box: 11, slot: 0, x1: 50, x2: 200, formula: 'decay', name: 'Utilitarian Mailbox (DR)' },
};

export var postOffice = {
  resolve: function(id, ctx) {
    var key = Array.isArray(id) ? id.join(',') : String(id);
    var data = PO_DATA[key];
    if (!data) return node('Post Office ' + key, 0, null, { note: 'post office ' + key });
    var points = Number((postOfficeData && postOfficeData[ctx.charIdx] && postOfficeData[ctx.charIdx][data.box]) || 0);
    if (points <= 0) return node(data.name, 0, null, { note: 'post office ' + key });
    var val = formulaEval(data.formula, data.x1, data.x2, points);
    return node(data.name, val, [
      node('Points Invested', points, null, { fmt: 'raw' }),
      node('Formula Result', val, null, { fmt: 'raw', note: data.formula + '(' + data.x1 + ',' + data.x2 + ',' + points + ')' }),
    ], { fmt: '+', note: 'post office ' + key });
  },
};
