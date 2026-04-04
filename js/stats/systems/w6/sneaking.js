// ===== SNEAKING SYSTEM (W6) =====
// Pristine charm bonuses.

import { node } from '../../node.js';
import { label } from '../../entity-names.js';
import { pristineCharmBonus } from '../../data/common/sigils.js';

export var pristine = {
  resolve: function(id, ctx) {
    var bonus = pristineCharmBonus(id);
    if (!bonus) return node(label('Pristine', id), 0, null, { note: 'pristine ' + id });
    var saveData = ctx.saveData;
    var equipped = (saveData.ninjaData && saveData.ninjaData[107] && saveData.ninjaData[107][id]) === 1;
    return node(label('Pristine', id), equipped ? bonus : 0, [
      node(equipped ? 'Equipped' : 'Not equipped', 0, null, { fmt: 'raw' }),
    ], { fmt: '+', note: 'pristine ' + id });
  },
};
