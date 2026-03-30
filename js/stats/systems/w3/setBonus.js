// ===== SET BONUS SYSTEM (W3) =====
// Permanent set unlock checks.

import { node } from '../../node.js';
import { optionsListData } from '../../../save/data.js';

var SET_DATA = {
  efaunt: { key: 'EFAUNT_SET', bonus: 25, name: 'Efaunt Set Bonus' },  // EquipmentSets.EFAUNT_SET[3][2] = 25
};

export var setBonus = {
  resolve: function(id, ctx) {
    var data = SET_DATA[id];
    if (!data) return node('Set ' + id, 0, null, { note: 'set ' + id });
    var perma = String((optionsListData && optionsListData[379]) || '');
    var unlocked = perma.includes(data.key);
    return node(data.name, unlocked ? data.bonus : 0, [
      node(unlocked ? 'Unlocked' : 'Not unlocked', 0, null, { fmt: 'raw' }),
    ], { fmt: '+', note: 'set ' + id });
  },
};
