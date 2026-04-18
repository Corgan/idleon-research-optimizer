// ===== PRAYER SYSTEM (W3) =====
// Prayer bonuses for equipped prayers.

import { node } from '../../node.js';
import { label } from '../../entity-names.js';
import { prayersPerCharData } from '../../../save/data.js';
import { prayerBaseBonus } from '../../data/w3/prayer.js';

var PRAYER_DATA = {
  7: { baseBonus: prayerBaseBonus(7) },
};

export var prayer = {
  resolve: function(id, ctx) {
    var data = PRAYER_DATA[id];
    if (!data) return node(label('Prayer', id), 0, null, { note: 'prayer ' + id });
    var name = label('Prayer', id);
    var prayerLv = Number((ctx.saveData.prayOwnedData && ctx.saveData.prayOwnedData[id]) || 0);
    var equipped = prayersPerCharData[ctx.charIdx] || [];
    var isEquipped = equipped.includes(id);
    if (prayerLv <= 0 || !isEquipped) return node(name, 0, [
      node('Prayer Level', prayerLv, null, { fmt: 'raw' }),
      node(isEquipped ? 'Equipped' : 'NOT Equipped', 0, null, { fmt: 'raw' }),
    ], { note: 'prayer ' + id });
    var scaling = Math.max(1, 1 + (prayerLv - 1) / 10);
    var val = Math.round(data.baseBonus * scaling);
    return node(name, val, [
      node('Prayer Level', prayerLv, null, { fmt: 'raw' }),
      node('Equipped', 1, null, { fmt: 'raw' }),
      node('Base Bonus', data.baseBonus, null, { fmt: 'raw' }),
      node('Level Scaling', scaling, null, { fmt: 'x' }),
    ], { fmt: '+', note: 'prayer ' + id });
  },
};

// ==================== PRAYER REAL (save-based aggregation) ====================

export function computePrayerReal(prayerIdx, costIdx, ci, saveData) {
  var prayerLv = Number(saveData.prayOwnedData && saveData.prayOwnedData[prayerIdx]) || 0;
  if (prayerLv <= 0) return 0;
  var equipped = false;
  try { equipped = (prayersPerCharData[ci] || []).includes(prayerIdx); } catch(e) {}
  if (!equipped) return 0;
  var base = 0;
  try { base = prayerBaseBonus(prayerIdx, costIdx) || 0; } catch(e) {}
  var scale = Math.max(1, 1 + (prayerLv - 1) / 10);
  return Math.round(base * scale);
}
