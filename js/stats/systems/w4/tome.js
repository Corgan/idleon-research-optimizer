// ===== TOME SYSTEM (W4) =====
// Tome bonuses scaling with Tome Score (totalTomePoints) and grimoire multiplier.

import { node } from '../../node.js';
import { label } from '../../entity-names.js';
import { optionsListData } from '../../../save/data.js';
import { eventShopOwned } from '../../../game-helpers.js';
import { equipSetBonus } from '../../data/common/equipment.js';
import { TOME_DATA } from '../../data/game-constants.js';

export var tome = {
  resolve: function(id, ctx) {
    var data = TOME_DATA[id];
    if (!data) return node(label('Tome', id), 0, null, { note: 'tome ' + id });
    var saveData = ctx.saveData;

    var unlocked;
    if (data.unlockType === 'eventShop') {
      var evStr = saveData.cachedEventShopStr || '';
      unlocked = eventShopOwned(data.unlockIdx, evStr) >= 1;
    } else {
      unlocked = Number((optionsListData && optionsListData[data.unlockIdx]) || 0) >= 1;
    }
    if (!unlocked) return node(label('Tome', id), 0, [
      node('Not Unlocked', 0, null, { fmt: 'raw' }),
    ], { note: 'tome ' + id });

    var tomeScore = saveData.totalTomePoints || 0;
    var scaled = Math.floor(Math.max(0, tomeScore - data.threshold) / data.divisor);
    var base = data.base * Math.pow(scaled, data.exp);

    var grim17 = Number((saveData.grimoireData && saveData.grimoireData[17]) || 0);
    var trollSet = String((optionsListData && optionsListData[379]) || '').includes('TROLL_SET') ? equipSetBonus('TROLL_SET') : 0;
    var multi = 1 + (grim17 + trollSet) / 100;

    var val = base <= 0 ? 0 : base * multi;
    return node(label('Tome', id), val, [
      node('Tome Score', tomeScore, null, { fmt: 'raw' }),
      node('Scaled', scaled, null, { fmt: 'raw', note: 'floor((pts' + (data.threshold ? '-' + data.threshold : '') + ')/' + data.divisor + ')' }),
      node('Base', base, null, { fmt: 'raw' }),
      node('Tome Multi', multi, [
        node(label('Grimoire', 17), grim17, null, { fmt: 'raw' }),
        node('Troll Set', trollSet, null, { fmt: 'raw' }),
      ], { fmt: 'x' }),
    ], { fmt: '+', note: 'tome ' + id });
  },
};
