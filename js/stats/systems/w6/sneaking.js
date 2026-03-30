// ===== SNEAKING SYSTEM (W6) =====
// Pristine charm bonuses.

import { node } from '../../node.js';

var PRISTINE_DATA = {
  3: { bonus: 15, name: 'Pristine Charm 3 (DR)' },  // NjEQ.NjTrP3[3] = 15
};

export var pristine = {
  resolve: function(id, ctx) {
    var data = PRISTINE_DATA[id];
    if (!data) return node('Pristine Charm ' + id, 0, null, { note: 'pristine ' + id });
    var S = ctx.S;
    var equipped = (S.ninjaData && S.ninjaData[107] && S.ninjaData[107][id]) === 1;
    return node(data.name, equipped ? data.bonus : 0, [
      node(equipped ? 'Equipped' : 'Not equipped', 0, null, { fmt: 'raw' }),
    ], { fmt: '+', note: 'pristine ' + id });
  },
};
