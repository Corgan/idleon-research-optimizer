// ===== ARCADE SYSTEM (W2) =====
// Arcade shop bonus values.

import { node } from '../../node.js';
import { S } from '../../../state.js';
import { ARCADE_SHOP } from '../../../game-data.js';

export function arcadeBonus(idx) {
  var params = ARCADE_SHOP[idx];
  if (!params) return 0;
  var lv = S.arcadeUpgData[idx] || 0;
  if (lv <= 0) return 0;
  var type = params[0], base = params[1], denom = params[2];
  var raw = type === 'add' ? (denom !== 0 ? ((base + denom) / denom + 0.5 * (lv - 1)) / (base / denom) * lv * base : base * lv) : base * lv / (lv + denom);
  var maxedM = lv >= 101 ? 2 : 1;
  var comp27M = S.companionIds.has(27) ? 2 : 1;
  return maxedM * comp27M * raw;
}

export var arcade = {
  resolve: function(id, ctx) {
    var params = ARCADE_SHOP[id];
    if (!params) return node('Arcade Shop ' + id, 0, null, { note: 'arcade ' + id });
    var lv = S.arcadeUpgData[id] || 0;
    if (lv <= 0) return node('Arcade Shop ' + id, 0, null, { note: 'arcade ' + id });
    var type = params[0], base = params[1], denom = params[2];
    var raw = type === 'add' ? (denom !== 0 ? ((base + denom) / denom + 0.5 * (lv - 1)) / (base / denom) * lv * base : base * lv) : base * lv / (lv + denom);
    var maxedM = lv >= 101 ? 2 : 1;
    var comp27M = S.companionIds.has(27) ? 2 : 1;
    var val = maxedM * comp27M * raw;
    return node('Arcade Shop ' + id, val, [
      node('Level', lv, null, { fmt: 'raw' }),
      node('Raw Value', raw, null, { fmt: 'raw' }),
      node('Maxed Bonus', maxedM, null, { fmt: 'x', note: lv >= 101 ? 'Level 101+' : 'Not maxed' }),
      node('Gold Ball Companion', comp27M, null, { fmt: 'x', note: 'companion 27' }),
    ], { fmt: '+', note: 'arcade ' + id });
  },
};
