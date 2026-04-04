// ===== EQUIPMENT SYSTEM =====
// Sums equipment UQ stat bonuses across all gear slots.
// Handles pendant ×2 and grid 172 multiplier.

import { node } from '../../node.js';
import { label, entityName } from '../../entity-names.js';
import { emmData, equipOrderData } from '../../../save/data.js';
import { gbWith } from '../../../sim-math.js';
import { SHAPE_BONUS_PCT } from '../../../game-data.js';
import { saveData } from '../../../state.js';
import { ETC_STAT_NAMES, itemUqMatch } from '../../data/common/equipment.js';

function scanSlots(emm, equipOrder, row, statNames, grid172Multi, skipSlots) {
  var data = emm[row] || {};
  var eqRow = (equipOrder && equipOrder[row]) || {};
  var results = [];
  var maxSlot = row === 0 ? 15 : 7;
  for (var slot = 0; slot <= maxSlot; slot++) {
    // Skip gallery/premhat-managed slots (they have dedicated resolvers)
    if (skipSlots && skipSlots[slot]) continue;
    var sd = data[slot] || data[String(slot)];
    var val = 0;
    var itemName = eqRow[slot] || eqRow[String(slot)] || '';
    var builtIn = itemUqMatch(itemName, statNames);
    // EMm random-roll UQ stats (when EMm has explicit txt)
    if (sd) {
      for (var si = 0; si < statNames.length; si++) {
        var statName = statNames[si];
        if (sd.UQ1txt === statName) val += Number(sd.UQ1val) || 0;
        if (sd.UQ2txt === statName) val += Number(sd.UQ2val) || 0;
      }
    }
    // Built-in UQ stats from item definitions
    if (builtIn) {
      val += builtIn.val;
      // Also add EMm stone upgrade for same UQ slot (val without txt).
      // Game: value = itemDef.UQx_val + EMm.UQx_val
      var uqTxtKey = 'UQ' + builtIn.uq + 'txt';
      var uqValKey = 'UQ' + builtIn.uq + 'val';
      if (sd && !sd[uqTxtKey] && (Number(sd[uqValKey]) || 0) > 0) {
        val += Number(sd[uqValKey]);
      }
    }
    if (val <= 0) continue;
    var rawVal = val;
    // Pendant(3), keychain(9), trophy(10) get 2× from chip bonuses
    if (row === 0 && (slot === 3 || slot === 9 || slot === 10)) val *= 2;
    // Clothing slot 15 gets grid 172 multiplier
    if (row === 0 && slot === 15) val *= grid172Multi;
    results.push({ row: row, slot: slot, rawVal: rawVal, val: val, itemName: itemName });
  }
  return results;
}

export var equipment = {
  resolve: function(id, ctx) {
    var saveData = ctx.saveData;
    var ids = Array.isArray(id) ? id : [id];
    var statNames = [];
    for (var i = 0; i < ids.length; i++) {
      var names = ETC_STAT_NAMES[ids[i]];
      if (names) for (var j = 0; j < names.length; j++) statNames.push(names[j]);
    }
    if (!statNames.length) return node('Equipment ' + id, 0, null, { note: 'equipment ' + id });
    var statLabel = statNames[0]; // display name
    var emm = emmData[ctx.charIdx];
    if (!emm) return node('Equipment Bonuses', 0, null, { note: 'equipment ' + id });

    var grid172Bonus = gbWith(ctx.saveData.gridLevels, ctx.saveData.shapeOverlay || [], 172,
      { abm: ctx.saveData.allBonusMulti || 1 });
    var grid172Multi = grid172Bonus > 0 ? (1 + grid172Bonus / 100) : 1;

    // Game skips gallery/premhat-managed slots in equipment scan.
    // Gallery ON: skip slot 10 (trophy), 14 (nametag) — they use Gallery resolvers
    // PremHat ON: skip slot 8 (head) — uses Hatrack resolver
    // Detect via spelunkData: [16]=trophies, [17]=nametags, [46]=premhats
    var sp = saveData.spelunkData || [];
    var galleryOn = (sp[16] && sp[16].length > 0) || (sp[17] && sp[17].length > 0);
    var premhatOn = sp[46] && sp[46].length > 0;
    var skipSlots = null;
    if (galleryOn || premhatOn) {
      skipSlots = {};
      if (galleryOn) { skipSlots[10] = true; skipSlots[14] = true; }
      if (premhatOn) { skipSlots[8] = true; }
    }

    var equipOrder = equipOrderData[ctx.charIdx];
    var slots0 = scanSlots(emm, equipOrder, 0, statNames, grid172Multi, skipSlots);
    var slots1 = scanSlots(emm, equipOrder, 1, statNames, grid172Multi, null);
    var allSlots = slots0.concat(slots1);

    var total = 0;
    var children = [];
    for (var i = 0; i < allSlots.length; i++) {
      var s = allSlots[i];
      total += s.val;
      var slotChildren = null;
      // Show grid 172 as a child of the attire slot it multiplies
      if (s.row === 0 && s.slot === 15 && grid172Bonus > 0) {
        var grid172Lv = ctx.saveData.gridLevels[172] || 0;
        var si172 = ctx.saveData.shapeOverlay[172];
        var shapePct172 = (si172 >= 0 && si172 < SHAPE_BONUS_PCT.length) ? SHAPE_BONUS_PCT[si172] : 0;
        var gridChildren = [
          node(label('Grid', 172, ' Lv'), grid172Lv, null, { fmt: 'raw' }),
          node('Shape ×', 1 + shapePct172 / 100, null, { fmt: 'x', note: 'shape=' + si172 }),
          node('All Multi ×', ctx.saveData.allBonusMulti || 1, null, { fmt: 'x' }),
        ];
        slotChildren = [
          node('Base', s.rawVal, null, { fmt: 'raw' }),
          node(label('Grid', 172, ' Bonus'), grid172Multi, gridChildren, { fmt: 'x', note: 'grid 172' }),
        ];
      }
      children.push(node(entityName('Item', s.itemName) || s.itemName || ('Row ' + s.row + ' Slot ' + s.slot), s.val, slotChildren, {
        fmt: '+', note: 'R' + s.row + ' saveData' + s.slot,
      }));
    }
    return node('Equipment Bonuses', total, children, { fmt: '+', note: 'equipment ' + id });
  },
};
