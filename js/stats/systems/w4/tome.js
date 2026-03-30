// ===== TOME SYSTEM (W4) =====
// Tome bonuses scaling with Tome Score (totalTomePoints) and grimoire multiplier.

import { node } from '../../node.js';
import { optionsListData } from '../../../save/data.js';
import { eventShopOwned } from '../../../save/helpers.js';

// TomeBonus(2): additive DR%, unlock OLA[197]
//   2 * pow(floor(max(0, TomeScore - 8000) / 100), 0.7) * grimoireMult
// TomeBonus(7): DR multi%, unlock EventShopOwned(27)
//   3 * pow(floor(TomeScore / 1000), 0.3) * grimoireMult
var TOME_DATA = {
  2: { unlockType: 'ola', unlockIdx: 197, threshold: 8000, divisor: 100, base: 2, exp: 0.7, name: 'Tome 2 (DR)' },
  7: { unlockType: 'eventShop', unlockIdx: 27, threshold: 0, divisor: 1000, base: 3, exp: 0.3, name: 'Tome 7 (DR Multi)' },
};

export var tome = {
  resolve: function(id, ctx) {
    var data = TOME_DATA[id];
    if (!data) return node('Tome ' + id, 0, null, { note: 'tome ' + id });
    var S = ctx.S;

    var unlocked;
    if (data.unlockType === 'eventShop') {
      var evStr = S.cachedEventShopStr || '';
      unlocked = eventShopOwned(data.unlockIdx, evStr) >= 1;
    } else {
      unlocked = Number((optionsListData && optionsListData[data.unlockIdx]) || 0) >= 1;
    }
    if (!unlocked) return node(data.name, 0, [
      node('Not Unlocked', 0, null, { fmt: 'raw' }),
    ], { note: 'tome ' + id });

    var tomeScore = S.totalTomePoints || 0;
    var scaled = Math.floor(Math.max(0, tomeScore - data.threshold) / data.divisor);
    var base = data.base * Math.pow(scaled, data.exp);

    var grim17 = Number((S.grimoireData && S.grimoireData[17]) || 0);
    var trollSet = String((optionsListData && optionsListData[379]) || '').includes('TROLL_SET') ? 25 : 0;
    var multi = 1 + (grim17 + trollSet) / 100;

    var val = base <= 0 ? 0 : base * multi;
    return node(data.name, val, [
      node('Tome Score', tomeScore, null, { fmt: 'raw' }),
      node('Scaled', scaled, null, { fmt: 'raw', note: 'floor((pts' + (data.threshold ? '-' + data.threshold : '') + ')/' + data.divisor + ')' }),
      node('Base', base, null, { fmt: 'raw' }),
      node('Tome Multi', multi, [
        node('Grimoire 17', grim17, null, { fmt: 'raw' }),
        node('Troll Set', trollSet, null, { fmt: 'raw' }),
      ], { fmt: 'x' }),
    ], { fmt: '+', note: 'tome ' + id });
  },
};
