// ===== COMPANIONS SYSTEM =====
// Companion ownership checks with flat bonus and capped-multiplier variants.

import { node } from '../../node.js';

var COMPANION_NAMES = {
  0: 'dung0 (Grid All Multi)',
  3: 'cat3a',
  8: 'jarSand (Base All Stats)',
  22: 'dog5a',
  26: 'Pet3',
  30: 'bigFish (Friend Multi)',
  50: 'snakeR',
  51: 'Owl Companion',
  55: 'comp55 (Grid All Multi)',
  111: 'comp111',
  155: 'comp155',
  158: 'slugG (Drop Rate)',
  160: 'slimeB (3x Dmg, 5x Exp, 1.5x DR)',
};

// Flat bonus values per companion for additive pools
var COMPANION_BONUS = {
  3: 100, 22: 15, 26: 0.3, 50: 25, 111: 100, 158: 15, 160: 1,
};

export var companion = {
  resolve: function(id, ctx) {
    var name = COMPANION_NAMES[id] || 'Companion ' + id;
    var owned = ctx.S.companionIds ? ctx.S.companionIds.has(id) : false;
    var bonusVal = COMPANION_BONUS[id] || 0;
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
    var name = COMPANION_NAMES[id] || 'Companion ' + id;
    var owned = ctx.S.companionIds ? ctx.S.companionIds.has(id) : false;
    var bonusVal = owned ? (COMPANION_BONUS[id] || 0) : 0;
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
