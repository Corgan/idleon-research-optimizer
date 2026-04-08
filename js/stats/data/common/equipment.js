// ===== EQUIPMENT / ITEM DATA =====
import { ITEMS } from '../game/items.js';
import { IDforETCbonus, EquipmentSets } from '../game/custommaps.js';

// EtcBonuses stat name for any ID
export function etcStatName(id) { return IDforETCbonus[id] ? [IDforETCbonus[id]] : null; }

// All EtcBonus IDs with stat names (full scan)
export var ETC_STAT_NAMES = {};
for (var _id in IDforETCbonus) { if (IDforETCbonus[_id]) ETC_STAT_NAMES[_id] = [IDforETCbonus[_id]]; }

// Full UQ stat index: ITEMS_BY_UQ[statName] = { itemName: { uq, val } }
// Covers ALL items and ALL UQ stat types in one pass
export var ITEMS_BY_UQ = {};
for (var _iname in ITEMS) {
  var _item = ITEMS[_iname];
  if (_item.UQ1txt && _item.UQ1txt !== 'Blank' && _item.UQ1txt !== '0') {
    if (!ITEMS_BY_UQ[_item.UQ1txt]) ITEMS_BY_UQ[_item.UQ1txt] = {};
    ITEMS_BY_UQ[_item.UQ1txt][_iname] = { uq: 1, val: _item.UQ1val };
  }
  if (_item.UQ2txt && _item.UQ2txt !== 'Blank' && _item.UQ2txt !== '0') {
    if (!ITEMS_BY_UQ[_item.UQ2txt]) ITEMS_BY_UQ[_item.UQ2txt] = {};
    ITEMS_BY_UQ[_item.UQ2txt][_iname] = { uq: 2, val: _item.UQ2val };
  }
}

// Lookup: does this item have a built-in UQ stat matching any of the given stat names?
// Returns { stat, val, uq } or null
export function itemUqMatch(itemName, statNames) {
  var item = ITEMS[itemName];
  if (!item) return null;
  for (var _si = 0; _si < statNames.length; _si++) {
    if (item.UQ1txt === statNames[_si]) return { stat: item.UQ1txt, val: item.UQ1val, uq: 1 };
    if (item.UQ2txt === statNames[_si]) return { stat: item.UQ2txt, val: item.UQ2val, uq: 2 };
  }
  return null;
}

// Convenience: all items with specific UQ stat (returns the ITEMS_BY_UQ bucket)
export function itemsWithUq(statName) { return ITEMS_BY_UQ[statName] || {}; }

// Equipment set bonus for ANY set (from EquipmentSets[setName][3][2])
export function equipSetBonus(setName) {
  var set = EquipmentSets[setName];
  return set ? Number(set[3]?.[2]) || 0 : 0;
}

// Legacy named exports (computed from generic accessor)
export const GODSHARD_SET_BONUS = equipSetBonus('GODSHARD_SET');
export const SET_BONUS_VALUES = {
  GOLD_SET: equipSetBonus('GOLD_SET'),
  SECRET_SET: equipSetBonus('SECRET_SET'),
  EMPEROR_SET: equipSetBonus('EMPEROR_SET'),
};
