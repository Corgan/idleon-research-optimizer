// ===== ACHIEVEMENT SYSTEM =====
// Returns a fixed bonus if an achievement is completed.

import { node } from '../../node.js';
import { label } from '../../entity-names.js';
var ACHIEVEMENT_TIER_VALUE = {
  4: 5, 27: 5, 37: 5, 44: 5, 107: 5, 109: 5, 117: 5,
  108: 10,
  99: 20, 104: 20, 112: 20,
};

export function achieveStatus(idx, saveData) {
  if (!saveData || !saveData.achieveRegData) return 0;
  if (saveData.achieveRegData[idx] !== -1) return 0;
  return ACHIEVEMENT_TIER_VALUE[idx] || 1;
}

export var achievement = {
  resolve: function(id, ctx, args) {
    var bonus = args ? args[0] : 0;
    var reg = ctx.saveData.achieveRegData;
    var status = achieveStatus(id, ctx.saveData);
    if (!status) return node(label('Achievement', id), 0, [
      node('Not completed', 0, null, { fmt: 'raw' }),
    ]);
    return node(label('Achievement', id), bonus, [
      node('AchieveStatus', status, null, { fmt: 'raw' }),
      node('Bonus', bonus, null, { fmt: '+' }),
    ], { fmt: '+' });
  },
};
