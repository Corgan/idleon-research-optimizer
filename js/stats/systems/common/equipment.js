// ===== EQUIPMENT SYSTEM =====
// Sums equipment UQ stat bonuses across all gear slots.
// Handles pendant ×2 and grid 172 multiplier.

import { node } from '../../node.js';
import { emmData, equipOrderData } from '../../../save/data.js';
import { gbWith } from '../../../sim-math.js';
import { SHAPE_BONUS_PCT } from '../../../game-data.js';
import { S } from '../../../state.js';

// Some items store the stat as %_DROP_CHANCE in save data while others
// use %_DROP_RATE — both map to the same EtcBonuses(2) in-game.
var ETC_STAT_NAMES = {
  2: ['%_DROP_RATE'],
  17: ['%_LUK'],
  46: ['%_ALL_STATS'],
  54: ['_LUK'],
  91: ['%_DROP_RATE_MULTI'],
  99: ['%_BONUS_DROP_RATE'],
  102: ['%_DROP_CHANCE'],
};

// Built-in UQ stats for equipment items (from item definitions in game source).
// EMm only stores random-roll upgrades; items with hardcoded UQ stats need this
// lookup so the built-in value is counted AND the stone upgrade (EMm val without
// txt) is also added.  Keyed by item name → { stat, val, uq }.
// Only DR-relevant stats are tracked.  Excludes hats (premhat system) and
// trophies (trophy system).  Generated from N.formatted.js.
var ITEM_BUILT_IN_DR = {
  // Weapons — DR is UQ2 on all god-tier weapons
  EquipmentSword9:     { stat: '%_DROP_RATE', val: 20, uq: 2 },  // Massive Godbreaker
  EquipmentBows14:     { stat: '%_DROP_RATE', val: 20, uq: 2 },  // Doublestring Godshooter
  EquipmentWands13:    { stat: '%_DROP_RATE', val: 20, uq: 2 },  // Magnifique Godcaster
  EquipmentPunching11: { stat: '%_DROP_RATE', val: 40, uq: 2 },  // Mittens of the Gods
  // Helmets (head slot, non-premium)
  EquipmentHats52:     { stat: '%_DROP_RATE', val: 5, uq: 1 },   // Efaunt Helmet
  EquipmentHats83:     { stat: '%_DROP_RATE', val: 10, uq: 2 },  // Skulled Helmet of the Divine
  EquipmentHats106:    { stat: '%_DROP_RATE', val: 15, uq: 1 },  // Crown of the Gods
  EquipmentHats119:    { stat: '%_DROP_RATE', val: 25, uq: 1 },  // Emperor Kabuto
  // Shirts (body) — DR is UQ1
  EquipmentShirts38:   { stat: '%_DROP_RATE', val: 30, uq: 1 },  // Robe of the Gods
  EquipmentShirts39:   { stat: '%_DROP_RATE', val: 40, uq: 1 },  // Emperor Sokutai Ho
  // Pants — DR is UQ1
  EquipmentPants30:    { stat: '%_DROP_RATE', val: 25, uq: 1 },  // Tatters of the Gods
  EquipmentPants31:    { stat: '%_DROP_RATE', val: 35, uq: 1 },  // Emperor Zubon
  // Shoes — DR is UQ1
  EquipmentShoes36:    { stat: '%_DROP_RATE', val: 15, uq: 1 },  // Devious Slippers
  EquipmentShoes38:    { stat: '%_DROP_RATE', val: 30, uq: 1 },  // Drip of the Gods
  EquipmentShoes40:    { stat: '%_DROP_RATE', val: 40, uq: 1 },  // Emperor Geta
  // Pendants
  EquipmentPendant17:  { stat: '%_DROP_RATE', val: 5, uq: 2 },   // Chaotic Amarok Pendant (DR=UQ2)
  EquipmentPendant18:  { stat: '%_DROP_RATE', val: 3, uq: 1 },   // Strung Steamy (DR=UQ1)
  // Capes
  EquipmentCape7:      { stat: '%_DROP_RATE', val: 30, uq: 1 },  // Molten Cloak (DR=UQ1)
  EquipmentCape17:     { stat: '%_DROP_RATE', val: 10, uq: 2 },  // Gilded Emperor Wings (DR=UQ2)
  EquipmentCape18:     { stat: '%_DROP_RATE_MULTI', val: 40, uq: 2 },  // Chains of the Gilded Vaultguard (DR=UQ2)
  // Gowns / Attire
  EquipmentGown1:      { stat: '%_DROP_RATE', val: 60, uq: 2 },  // Cobalt Robe (DR=UQ2)
  EquipmentGown3:      { stat: '%_DROP_RATE', val: 75, uq: 2 },  // Evergreen Robe (DR=UQ2)
  EquipmentGown5:      { stat: '%_BONUS_DROP_RATE', val: 50, uq: 1 },  // Corsair Uniform (DR=UQ1)
  // Tools — DR is UQ2 on all god-tier tools
  EquipmentTools15:    { stat: '%_DROP_RATE', val: 10, uq: 2 },  // Destroyer of the Mollo Gomme
  EquipmentToolsHatchet10: { stat: '%_DROP_RATE', val: 10, uq: 2 },  // Annihilator of the Yggdrasil
  FishingRod12:        { stat: '%_DROP_RATE', val: 10, uq: 2 },  // Angler of the Iliunne
  CatchingNet12:       { stat: '%_DROP_RATE', val: 10, uq: 2 },  // Wrangler of the Qoxzul
  TrapBoxSet10:        { stat: '%_DROP_RATE', val: 10, uq: 2 },  // Containment of the Zrgyios
  WorshipSkull11:      { stat: '%_DROP_RATE', val: 10, uq: 2 },  // Crystal Skull of Esquire Vnoze
};

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
    var builtIn = ITEM_BUILT_IN_DR[itemName];
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
      for (var si2 = 0; si2 < statNames.length; si2++) {
        if (builtIn.stat === statNames[si2]) {
          val += builtIn.val;
          // Also add EMm stone upgrade for same UQ slot (val without txt).
          // Game: value = itemDef.UQx_val + EMm.UQx_val
          var uqTxtKey = 'UQ' + builtIn.uq + 'txt';
          var uqValKey = 'UQ' + builtIn.uq + 'val';
          if (sd && !sd[uqTxtKey] && (Number(sd[uqValKey]) || 0) > 0) {
            val += Number(sd[uqValKey]);
          }
          break;
        }
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
    var ids = Array.isArray(id) ? id : [id];
    var statNames = [];
    for (var i = 0; i < ids.length; i++) {
      var names = ETC_STAT_NAMES[ids[i]];
      if (names) for (var j = 0; j < names.length; j++) statNames.push(names[j]);
    }
    if (!statNames.length) return node('Equipment ' + id, 0, null, { note: 'equipment ' + id });
    var label = statNames[0]; // display name
    var emm = emmData[ctx.charIdx];
    if (!emm) return node('Equipment Bonuses', 0, null, { note: 'equipment ' + id });

    var grid172Bonus = gbWith(ctx.S.gridLevels, ctx.S.shapeOverlay || [], 172,
      { abm: ctx.S.allBonusMulti || 1 });
    var grid172Multi = grid172Bonus > 0 ? (1 + grid172Bonus / 100) : 1;

    // Game skips gallery/premhat-managed slots in equipment scan.
    // Gallery ON: skip slot 10 (trophy), 14 (nametag) — they use Gallery resolvers
    // PremHat ON: skip slot 8 (head) — uses Hatrack resolver
    // Detect via spelunkData: [16]=trophies, [17]=nametags, [46]=premhats
    var sp = S.spelunkData || [];
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
        var grid172Lv = ctx.S.gridLevels[172] || 0;
        var si172 = ctx.S.shapeOverlay[172];
        var shapePct172 = (si172 >= 0 && si172 < SHAPE_BONUS_PCT.length) ? SHAPE_BONUS_PCT[si172] : 0;
        var gridChildren = [
          node('Grid 172 Lv', grid172Lv, null, { fmt: 'raw' }),
          node('Shape ×', 1 + shapePct172 / 100, null, { fmt: 'x', note: 'shape=' + si172 }),
          node('All Multi ×', ctx.S.allBonusMulti || 1, null, { fmt: 'x' }),
        ];
        slotChildren = [
          node('Base', s.rawVal, null, { fmt: 'raw' }),
          node('Grid 172 Bonus', grid172Multi, gridChildren, { fmt: 'x', note: 'grid 172' }),
        ];
      }
      children.push(node(s.itemName || ('Row ' + s.row + ' Slot ' + s.slot), s.val, slotChildren, {
        fmt: '+', note: 'R' + s.row + ' S' + s.slot,
      }));
    }
    return node('Equipment Bonuses', total, children, { fmt: '+', note: 'equipment ' + id });
  },
};
