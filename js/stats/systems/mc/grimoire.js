// ===== GRIMOIRE SYSTEM (MC) =====
// Grimoire upgrade bonuses.

import { node } from '../../node.js';
import { label } from '../../entity-names.js';
import { saveData } from '../../../state.js';
import { grimoireUpgPerLevel } from '../../data/mc/grimoire.js';

export function grimoireUpgBonus22() {
  var g22 = (saveData.grimoireData && saveData.grimoireData[22]) || 0;
  var g36 = (saveData.grimoireData && saveData.grimoireData[36]) || 0;
  return g22 * (1 + g36 / 100);
}

var GRIMOIRE_DATA = {
  44: { perLevel: grimoireUpgPerLevel(44), name: label('Grimoire', 44) },
};

export var grimoire = {
  resolve: function(id, ctx) {
    var data = GRIMOIRE_DATA[id];
    if (!data) return node(label('Grimoire', id), 0, null, { note: 'grimoire ' + id });
    var saveData = ctx.saveData;
    var lv = Number((saveData.grimoireData && saveData.grimoireData[id]) || 0);
    if (lv <= 0) return node(data.name, 0, null, { note: 'grimoire ' + id });

    // Grimoire 36 boosts most other grimoire upgrades
    var lv36 = Number((saveData.grimoireData && saveData.grimoireData[36]) || 0);
    var multi36 = lv36 > 0 ? lv36 * 1 : 0;
    var val = lv * data.perLevel * (1 + multi36 / 100);

    return node(data.name, val, [
      node('Level', lv, null, { fmt: 'raw' }),
      node('Per Level', data.perLevel, null, { fmt: 'raw' }),
      node(label('Grimoire', 36), 1 + multi36 / 100, null, { fmt: 'x', note: 'Level ' + lv36 }),
    ], { fmt: '+', note: 'grimoire ' + id });
  },
};
