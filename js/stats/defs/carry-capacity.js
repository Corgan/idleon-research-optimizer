// ===== CARRY CAPACITY DESCRIPTORS =====

import { createDescriptor } from './helpers.js';
import { computeMaxCapacity } from '../systems/common/carry-capacity.js';
import { label } from '../entity-names.js';

var CAPACITY_ROWS = [
  ['carry-capacity-mining', 'Mining Carry Capacity', 'bOre'],
  ['carry-capacity-chopping', 'Chopping Carry Capacity', 'bLog'],
  ['carry-capacity-fishing', 'Fishing Carry Capacity', 'dFish'],
  ['carry-capacity-catching', 'Catching Carry Capacity', 'dBugs'],
  ['carry-capacity-food', 'Food Carry Capacity', 'cFood'],
  ['carry-capacity-critters', 'Critter Carry Capacity', 'dCritters'],
  ['carry-capacity-souls', 'Soul Carry Capacity', 'dSouls'],
  ['carry-capacity-materials', 'Material Carry Capacity', 'bCraft'],
];

function _descriptor(id, name, itemType) {
  return createDescriptor({
    id: id,
    name: name,
    scope: 'character+map',
    category: 'capacity',
    combine: function(pools, ctx) {
      var result = computeMaxCapacity(ctx.saveData, Number(ctx.charIdx) || 0, itemType, ctx);
      if (result.unavailable) return result;
      var common = result.commonSources || {};
      return {
        val: result.val,
        children: [
          { name: 'Saved Bag Capacity', val: result.savedBase, fmt: 'raw' },
          { name: 'Account Flat Capacity', val: result.allCapBase, fmt: 'raw', children: [
            { name: 'Vault Capacity', val: result.vault11, fmt: 'raw' },
            { name: 'Bundle Capacity', val: result.bundleBase, fmt: 'raw' },
          ] },
          { name: 'Category Stamp', val: Number(result.categoryStamp) || 0, fmt: 'raw',
            children: result.categoryStamp && result.categoryStamp.children },
          { name: 'Gem Shop Multiplier', val: 1 + 0.25 * result.gemPurchases, fmt: 'x',
            note: result.gemPurchases + ' purchases' },
          { name: 'All Carry Sources', val: 1 + ((Number(result.allCarryStamp) || 0) + (Number(result.carryStars) || 0)) / 100, fmt: 'x', children: [
            { name: 'All Carry Stamp', val: Number(result.allCarryStamp) || 0, fmt: 'raw',
              children: result.allCarryStamp && result.allCarryStamp.children },
            { name: 'Carry Capacity Star Signs', val: Number(result.carryStars) || 0, fmt: 'raw',
              children: result.carryStars && result.carryStars.children },
          ] },
          { name: 'Material Talent Multiplier', val: 1 + result.materialTalent / 100, fmt: 'x' },
          { name: 'Common Carry Multiplier', val: result.commonMultiplier, fmt: 'x', children: [
            { name: label('Guild', 2) + ' and ' + label('Talent', 634), val: 1 + (common.guild2 + common.talent634) / 100, fmt: 'x' },
            { name: label('Companion', 18), val: 1 + common.companion18 / 100, fmt: 'x' },
            { name: 'Pantheon Shrine', val: 1 + common.shrine3 / 100, fmt: 'x' },
            { name: label('Prayer', 4) + ' Curse', val: Math.max(1 - common.prayer4 / 100, 0.4), fmt: 'x' },
            { name: label('Prayer', 12) + ' and ' + label('Bribe', 23), val: 1 + (common.prayer12 + common.bribe23) / 100, fmt: 'x' },
          ] },
          { name: 'Hard Cap', val: 2050000000, fmt: 'raw' },
        ],
        partial: Boolean(result.partial),
        reason: result.reason || '',
      };
    },
  });
}

export var carryCapacityDescriptors = CAPACITY_ROWS.map(function(row) {
  return _descriptor(row[0], row[1], row[2]);
});