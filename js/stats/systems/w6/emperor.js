// ===== EMPEROR SYSTEM (W6) =====
// Emperor kills DR bonus.

import { node } from '../../node.js';
import { emperorBonType, emperorBonVal } from '../../data/common/emperor.js';
import { arcadeBonus } from '../w2/arcade.js';
import { arcaneUpgBonus } from '../mc/tesseract.js';
import { label } from '../../entity-names.js';

export function computeEmperorBon(bonusIdx, saveData) {
  var emperorCount = Number(saveData.olaData && saveData.olaData[369]) || 0;
  var sum = 0;
  for (var r = 0; r < emperorCount; r++) {
    var slot = r % 48;
    if (emperorBonType(slot) === bonusIdx) sum += emperorBonVal(bonusIdx);
  }
  var mult = 1 + (arcaneUpgBonus(48, saveData) + arcadeBonus(51, saveData)) / 100;
  return Math.floor(sum * mult);
}

export var emperor = {
  resolve: function(id, ctx) {
    var saveData = ctx.saveData;
    var emperorCount = Number(saveData.olaData && saveData.olaData[369]) || 0;
    var sum = 0;
    var slotMatches = 0;
    for (var r = 0; r < emperorCount; r++) {
      var slot = r % 48;
      if (emperorBonType(slot) === id) {
        sum += emperorBonVal(id);
        slotMatches++;
      }
    }
    var arcane48 = arcaneUpgBonus(48, saveData);
    var arcade51val = arcadeBonus(51, saveData);
    var mult = 1 + (arcane48 + arcade51val) / 100;
    var val = Math.floor(sum * mult);
    if (val <= 0) return node(label('Emperor', id), 0, null, { note: 'emperor ' + id });
    return node(label('Emperor', id), val, [
      node('Emperor Kills', emperorCount, null, { fmt: 'raw' }),
      node('Slot Matches', slotMatches, null, { fmt: 'raw' }),
      node('Raw Sum', sum, null, { fmt: 'raw' }),
      node(label('Arcane', 48), arcane48, null, { fmt: 'raw' }),
      node(label('Arcade', 51), arcade51val, null, { fmt: 'raw' }),
      node('Multi', mult, null, { fmt: 'x' }),
    ], { fmt: '+', note: 'emperor ' + id });
  },
};
