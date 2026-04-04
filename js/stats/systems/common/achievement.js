// ===== ACHIEVEMENT SYSTEM =====
// Returns a fixed bonus if an achievement is completed.

import { node } from '../../node.js';
import { label } from '../../entity-names.js';
import { saveData } from '../../../state.js';

// Simple achieveStatus: returns 1 if completed, 0 otherwise
export function achieveStatus(idx) {
  return saveData.achieveRegData[idx] === -1 ? 1 : 0;
}

export var achievement = {
  resolve: function(id, ctx, args) {
    var bonus = args ? args[0] : 0;
    var reg = ctx.saveData.achieveRegData;
    var completed = reg ? reg[id] === -1 : false;
    if (!completed) return node(label('Achievement', id), 0, [
      node('Not completed', 0, null, { fmt: 'raw' }),
    ], { note: 'achievement ' + id });
    return node(label('Achievement', id), bonus, [
      node('Completed', 1, null, { fmt: 'raw' }),
      node('Bonus', bonus, null, { fmt: '+' }),
    ], { fmt: '+', note: 'achievement ' + id });
  },
};
