// ===== SET BONUS SYSTEM (W3) =====
// Permanent set unlock checks + active equip fallback.

import { node } from '../../node.js';
import { label } from '../../entity-names.js';
import { optionsListData, equipOrderData } from '../../../save/data.js';
import { equipSetBonus, SET_BONUS_VALUES } from '../../data/common/equipment.js';
import { EquipmentSets } from '../../data/game/custommaps.js';

export function getSetBonus(setName) {
  var perma = String(optionsListData[379] || '');
  if (!perma.includes(setName)) return 0;
  return SET_BONUS_VALUES[setName] || 0;
}

var SET_DATA = {
  efaunt: { key: 'EFAUNT_SET', bonus: equipSetBonus('EFAUNT_SET') },
};

// Check if enough set pieces are actively equipped on this character
function checkSetEquipped(setName, charIdx) {
  var setDef = EquipmentSets[setName];
  if (!setDef) return false;
  var armorPieces = setDef[0] || [];
  var toolsCap = Number(setDef[3]?.[0]) || 0;
  var specialCap = Number(setDef[3]?.[1]) || 0;
  var partsReq = armorPieces.length + toolsCap + specialCap;
  var partsOn = 0;
  var eq = equipOrderData[charIdx];
  if (!eq) return false;
  // Check armor row (row 0)
  var row0 = eq[0] || {};
  for (var s = 0; s < 16; s++) {
    var item = row0[s];
    if (item && armorPieces.indexOf(item) !== -1) partsOn++;
  }
  // Check tools row (row 1) if toolsCap > 0
  if (toolsCap > 0) {
    var toolPieces = setDef[1] || [];
    var toolsFound = 0;
    var row1 = eq[1] || {};
    for (var s = 0; s < 8; s++) {
      var item = row1[s];
      if (item && toolPieces.indexOf(item) !== -1 && toolsFound < toolsCap) {
        partsOn++;
        toolsFound++;
      }
    }
  }
  return partsOn >= partsReq;
}

export var setBonus = {
  resolve: function(id, ctx) {
    var data = SET_DATA[id];
    if (!data) return node(label('Smithing', id), 0, null, { note: 'set ' + id });
    var name = label('Smithing', id);
    var perma = String((optionsListData && optionsListData[379]) || '');
    var unlocked = perma.includes(data.key);
    if (!unlocked) {
      unlocked = checkSetEquipped(data.key, ctx.charIdx);
    }
    return node(name, unlocked ? data.bonus : 0, [
      node(unlocked ? 'Unlocked' : 'Not unlocked', 0, null, { fmt: 'raw' }),
    ], { fmt: '+', note: 'set ' + id });
  },
};
