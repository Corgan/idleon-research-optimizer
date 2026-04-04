// ===== ARCADE SYSTEM (W2) =====
// Arcade shop bonus values.

import { node } from '../../node.js';
import { label } from '../../entity-names.js';
import { saveData } from '../../../state.js';
import { arcadeShopParams } from '../../data/w2/arcade.js';
import { companionBonus } from '../../data/common/companions.js';

export function arcadeBonus(idx) {
  var params = arcadeShopParams(idx);
  if (!params) return 0;
  var lv = saveData.arcadeUpgData[idx] || 0;
  if (lv <= 0) return 0;
  var type = params[0], base = params[1], denom = params[2];
  var raw = type === 'add' ? (denom !== 0 ? ((base + denom) / denom + 0.5 * (lv - 1)) / (base / denom) * lv * base : base * lv) : base * lv / (lv + denom);
  var maxedM = lv >= 101 ? 2 : 1;
  var comp27M = saveData.companionIds.has(27) ? 2 : 1;
  return maxedM * comp27M * raw;
}

export var arcade = {
  resolve: function(id, ctx) {
    var saveData = ctx.saveData;
    var params = arcadeShopParams(id);
    if (!params) return node(label('Arcade', id), 0, null, { note: 'arcade ' + id });
    var lv = saveData.arcadeUpgData[id] || 0;
    if (lv <= 0) return node(label('Arcade', id), 0, null, { note: 'arcade ' + id });
    var type = params[0], base = params[1], denom = params[2];
    var raw = type === 'add' ? (denom !== 0 ? ((base + denom) / denom + 0.5 * (lv - 1)) / (base / denom) * lv * base : base * lv) : base * lv / (lv + denom);
    var maxedM = lv >= 101 ? 2 : 1;
    var comp27M = saveData.companionIds.has(27) ? 2 : 1;
    var val = maxedM * comp27M * raw;
    return node(label('Arcade', id), val, [
      node('Level', lv, null, { fmt: 'raw' }),
      node('Raw Value', raw, null, { fmt: 'raw' }),
      node('Maxed Bonus', maxedM, null, { fmt: 'x', note: lv >= 101 ? 'Level 101+' : 'Not maxed' }),
      node(label('Companion', 27), comp27M, null, { fmt: 'x', note: 'companion 27' }),
    ], { fmt: '+', note: 'arcade ' + id });
  },
};
