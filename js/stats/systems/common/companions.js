// ===== COMPANIONS SYSTEM =====
// Companion ownership checks with flat bonus and capped-multiplier variants.

import { node } from '../../node.js';
import { label } from '../../entity-names.js';
import { companionBonus } from '../../data/common/companions.js';

export var companion = {
  resolve: function(id, ctx) {
    var name = label('Companion', id);
    var owned = ctx.saveData.companionIds ? ctx.saveData.companionIds.has(id) : false;
    var bonusVal = companionBonus(id);
    var val = owned ? bonusVal : 0;
    if (!owned) return node(name, 0, [node('Not owned', 0, null, { fmt: 'raw' })], { note: 'companion ' + id });
    return node(name, val, [
      node('Owned', 1, null, { fmt: 'raw' }),
      node('Bonus', bonusVal, null, { fmt: '+' }),
    ], { fmt: '+', note: 'companion ' + id });
  },
};

export var compMulti = {
  resolve: function(id, ctx, args) {
    var cap = args ? args[0] : 1;
    var divisor = args ? args[1] : 1;
    var name = label('Companion', id);
    var owned = ctx.saveData.companionIds ? ctx.saveData.companionIds.has(id) : false;
    var bonusVal = owned ? companionBonus(id) : 0;
    var raw = divisor > 1 ? bonusVal / divisor : bonusVal;
    var val = Math.max(1, Math.min(cap, 1 + raw));
    return node(name, val, [
      node(owned ? 'Owned' : 'Not owned', 0, null, { fmt: 'raw' }),
      node('Raw bonus', bonusVal, null, { fmt: '+' }),
      node('Cap', cap, null, { fmt: 'x' }),
      node('Result', val, null, { fmt: 'x' }),
    ], { fmt: 'x', note: 'compMulti ' + id });
  },
};
