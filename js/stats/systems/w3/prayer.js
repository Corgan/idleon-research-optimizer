// ===== PRAYER SYSTEM (W3) =====
// Prayer bonuses for equipped prayers.

import { node } from '../../node.js';
import { prayersPerCharData } from '../../../save/data.js';

var PRAYER_DATA = {
  7: { baseBonus: 20, name: 'Beefy For Real' },
};

export var prayer = {
  resolve: function(id, ctx) {
    var data = PRAYER_DATA[id];
    if (!data) return node('Prayer ' + id, 0, null, { note: 'prayer ' + id });
    var prayerLv = Number((ctx.S.prayOwnedData && ctx.S.prayOwnedData[id]) || 0);
    var equipped = prayersPerCharData[ctx.charIdx] || [];
    var isEquipped = equipped.includes(id);
    if (prayerLv <= 0 || !isEquipped) return node(data.name, 0, [
      node('Prayer Level', prayerLv, null, { fmt: 'raw' }),
      node(isEquipped ? 'Equipped' : 'NOT Equipped', 0, null, { fmt: 'raw' }),
    ], { note: 'prayer ' + id });
    var scaling = Math.max(1, 1 + (prayerLv - 1) / 10);
    var val = Math.round(data.baseBonus * scaling);
    return node(data.name, val, [
      node('Prayer Level', prayerLv, null, { fmt: 'raw' }),
      node('Equipped', 1, null, { fmt: 'raw' }),
      node('Base Bonus', data.baseBonus, null, { fmt: 'raw' }),
      node('Level Scaling', scaling, null, { fmt: 'x' }),
    ], { fmt: '+', note: 'prayer ' + id });
  },
};
