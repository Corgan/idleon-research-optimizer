// ===== POST OFFICE SYSTEM (W2) =====
// Post Office box rewards through decay formula.

import { node } from '../../node.js';
import { label } from '../../entity-names.js';
import { postOfficeData } from '../../../save/data.js';
import { formulaEval } from '../../../formulas.js';
import { postOfficeSlotParams } from '../../data/w2/postOffice.js';
import { formulaEvalDetail } from '../../../formula-details.js';
import { formulaInput, formulaOperation } from '../../formula-tree.js';

export var postOffice = {
  resolve: function(id, ctx) {
    var key = Array.isArray(id) ? id.join(',') : String(id);
    var parts = key.split(',');
    var boxIdx = Number(parts[0]) || 0;
    var slotIdx = Number(parts[1]) || 0;
    var data = postOfficeSlotParams(boxIdx, slotIdx);
    var name = label('Post Office', boxIdx);
    if (!data) return node(name, 0, null, { note: 'post office ' + key });
    var points = Math.round(Number((postOfficeData && postOfficeData[ctx.charIdx] && postOfficeData[ctx.charIdx][boxIdx]) || 0));
    if (ctx.formulaDetails) {
      const level = formulaOperation('Rounded invested points', 'round', formulaInput('Saved points',
        Number(postOfficeData?.[ctx.charIdx]?.[boxIdx]) || 0,
        'POu_' + ctx.charIdx + '[' + boxIdx + ']'));
      if (points <= 0) return {
        name, val: 0, kind: 'formula', formulaTerm: true,
        formula: 'Rounded invested points <= 0: return 0', children: [level],
      };
      return {
        ...formulaEvalDetail(data.formula, data.x1, data.x2, points, {
          x1: formulaInput('First coefficient', data.x1, 'PostOffUpgradeInfo[' + boxIdx + '][' + (1 + slotIdx * 4) + ']'),
          x2: formulaInput('Second coefficient', data.x2, 'PostOffUpgradeInfo[' + boxIdx + '][' + (2 + slotIdx * 4) + ']'),
          lv: level,
        }),
        name, formulaTerm: true,
      };
    }
    if (points <= 0) return node(name, 0, null, { note: 'post office ' + key });
    var val = formulaEval(data.formula, data.x1, data.x2, points);
    return node(name, val, [
      node('Points Invested', points, null, { fmt: 'raw' }),
      node('Formula Result', val, null, { fmt: 'raw', note: data.formula + '(' + data.x1 + ',' + data.x2 + ',' + points + ')' }),
    ], { fmt: '+', note: 'post office ' + key });
  },
};
