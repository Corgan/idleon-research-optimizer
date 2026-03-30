// ===== EMPEROR SYSTEM (W6) =====
// Emperor kills DR bonus.

import { node } from '../../node.js';
import { S } from '../../../state.js';
import { EMPEROR_BON_TYPE, EMPEROR_BON_VAL_BY_TYPE } from '../../../game-data.js';
import { arcadeBonus } from '../w2/arcade.js';
import { arcaneUpgBonus } from '../mc/tesseract.js';

export function computeEmperorBon(bonusIdx) {
  var emperorCount = Number(S.olaData[369]) || 0;
  var sum = 0;
  for (var r = 0; r < emperorCount; r++) {
    var slot = r % 48;
    if (EMPEROR_BON_TYPE[slot] === bonusIdx) sum += Number(EMPEROR_BON_VAL_BY_TYPE[bonusIdx]) || 0;
  }
  var mult = 1 + (arcaneUpgBonus(48) + arcadeBonus(51)) / 100;
  return Math.floor(sum * mult);
}

export var emperor = {
  resolve: function(id, ctx) {
    var emperorCount = Number(S.olaData[369]) || 0;
    var sum = 0;
    var slotMatches = 0;
    for (var r = 0; r < emperorCount; r++) {
      var slot = r % 48;
      if (EMPEROR_BON_TYPE[slot] === id) {
        sum += Number(EMPEROR_BON_VAL_BY_TYPE[id]) || 0;
        slotMatches++;
      }
    }
    var arcane48 = arcaneUpgBonus(48);
    var arcade51val = arcadeBonus(51);
    var mult = 1 + (arcane48 + arcade51val) / 100;
    var val = Math.floor(sum * mult);
    if (val <= 0) return node('Emperor Bonus ' + id, 0, null, { note: 'emperor ' + id });
    return node('Emperor Bonus ' + id, val, [
      node('Emperor Kills', emperorCount, null, { fmt: 'raw' }),
      node('Slot Matches', slotMatches, null, { fmt: 'raw' }),
      node('Raw Sum', sum, null, { fmt: 'raw' }),
      node('Arcane 48 Bonus', arcane48, null, { fmt: 'raw', note: 'arcane 48' }),
      node('Arcade 51 Bonus', arcade51val, null, { fmt: 'raw', note: 'arcade 51' }),
      node('Multi', mult, null, { fmt: 'x' }),
    ], { fmt: '+', note: 'emperor ' + id });
  },
};
