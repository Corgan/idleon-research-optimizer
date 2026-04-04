// ===== SET BONUS SYSTEM (W3) =====
// Permanent set unlock checks.

import { node } from '../../node.js';
import { label } from '../../entity-names.js';
import { optionsListData } from '../../../save/data.js';
import { equipSetBonus } from '../../data/common/equipment.js';

var SET_DATA = {
  efaunt: { key: 'EFAUNT_SET', bonus: equipSetBonus('EFAUNT_SET') },
};

export var setBonus = {
  resolve: function(id, ctx) {
    var data = SET_DATA[id];
    if (!data) return node(label('Smithing', id), 0, null, { note: 'set ' + id });
    var name = label('Smithing', id);
    var perma = String((optionsListData && optionsListData[379]) || '');
    var unlocked = perma.includes(data.key);
    return node(name, unlocked ? data.bonus : 0, [
      node(unlocked ? 'Unlocked' : 'Not unlocked', 0, null, { fmt: 'raw' }),
    ], { fmt: '+', note: 'set ' + id });
  },
};
