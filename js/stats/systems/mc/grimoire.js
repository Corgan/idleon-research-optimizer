// ===== GRIMOIRE SYSTEM (MC) =====
// Grimoire upgrade bonuses.

import { node } from '../../node.js';
import { S } from '../../../state.js';

export function grimoireUpgBonus22() {
  var g22 = (S.grimoireData && S.grimoireData[22]) || 0;
  var g36 = (S.grimoireData && S.grimoireData[36]) || 0;
  return g22 * (1 + g36 / 100);
}

var GRIMOIRE_DATA = {
  44: { perLevel: 1, name: 'Grimoire 44 (DR)' },
};

export var grimoire = {
  resolve: function(id, ctx) {
    var data = GRIMOIRE_DATA[id];
    if (!data) return node('Grimoire ' + id, 0, null, { note: 'grimoire ' + id });
    var S = ctx.S;
    var lv = Number((S.grimoireData && S.grimoireData[id]) || 0);
    if (lv <= 0) return node(data.name, 0, null, { note: 'grimoire ' + id });

    // Grimoire 36 boosts most other grimoire upgrades
    var lv36 = Number((S.grimoireData && S.grimoireData[36]) || 0);
    var multi36 = lv36 > 0 ? lv36 * 1 : 0;
    var val = lv * data.perLevel * (1 + multi36 / 100);

    return node(data.name, val, [
      node('Level', lv, null, { fmt: 'raw' }),
      node('Per Level', data.perLevel, null, { fmt: 'raw' }),
      node('Grimoire 36 Boost', 1 + multi36 / 100, null, { fmt: 'x', note: 'Level ' + lv36 }),
    ], { fmt: '+', note: 'grimoire ' + id });
  },
};
