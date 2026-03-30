// ===== OBOL SYSTEM =====
// Sums obol UQ stat bonuses from personal and family obols.
// Personal obols: ObolEqO0_{charIdx} + ObolEqMAP_{charIdx} (21 slots per char)
// Family obols:   ObolEqO1 + ObolEqMAPz1 (24 slots, shared across all chars)

import { node } from '../../node.js';
import { obolNamesData, obolMapsData, obolFamilyNames, obolFamilyMaps } from '../../../save/data.js';

// Stat-type lookup — obols contribute to EtcBonuses pools.
var ETC_STAT_NAMES = {
  2: ['%_DROP_RATE'],
  17: ['%_LUK'],
  46: ['%_ALL_STATS'],
  54: ['_LUK'],
  91: ['%_DROP_RATE_MULTI'],
  99: ['%_BONUS_DROP_RATE'],
  102: ['%_DROP_CHANCE'],
};

// Built-in UQ stats for obol items (from item definitions in game source).
// Game displays built-in + rolled as a single combined value under the item
// definition's stat name.  MAP txt is irrelevant — the game just adds MAP UQval
// to the built-in UQval for the same UQ slot.  Keyed by item name → { stat, val, uq }.
var OBOL_BUILT_IN_DR = {
  ObolFrog:         { stat: '%_DROP_RATE', val: 1, uq: 1 },
  ObolBronzePop:    { stat: '%_DROP_RATE', val: 2, uq: 1 },
  ObolSilverPop:    { stat: '%_DROP_RATE', val: 3, uq: 1 },
  ObolGoldPop:      { stat: '%_DROP_RATE', val: 4, uq: 1 },
  ObolHyper0:       { stat: '%_DROP_RATE', val: 4, uq: 1 },
  ObolSilverLuck:   { stat: '%_DROP_RATE', val: 5, uq: 1 },
  ObolPlatinumPop:  { stat: '%_DROP_RATE', val: 6, uq: 1 },
  ObolGoldLuck:     { stat: '%_DROP_RATE', val: 7, uq: 1 },
  ObolKnight:       { stat: '%_DROP_RATE', val: 8, uq: 1 },
  ObolPinkPop:      { stat: '%_DROP_RATE', val: 9, uq: 1 },
  ObolHyperB0:      { stat: '%_DROP_RATE', val: 10, uq: 1 },
  ObolPlatinumLuck: { stat: '%_DROP_RATE', val: 10, uq: 1 },
  ObolLava:         { stat: '%_DROP_RATE', val: 14, uq: 1 },
  ObolPinkLuck:     { stat: '%_DROP_RATE', val: 15, uq: 1 },
};

function scanObols(names, maps, statNames) {
  var results = [];
  var len = names ? names.length : 0;
  for (var i = 0; i < len; i++) {
    var name = names[i];
    if (!name || name === 'Blank' || name === 'Null') continue;
    var mapData = maps ? (maps[i] || maps[String(i)]) : null;
    var val = 0;
    var builtIn = OBOL_BUILT_IN_DR[name];
    // Game logic: value = ItemDef.UQval + MAP.UQval (same slot, ignoring MAP txt).
    // Only contributes if item definition has a matching stat.
    if (builtIn) {
      for (var si = 0; si < statNames.length; si++) {
        if (builtIn.stat === statNames[si]) {
          val += builtIn.val;
          // Add rolled upgrade from MAP for the same UQ slot
          if (mapData) {
            var uqValKey = 'UQ' + builtIn.uq + 'val';
            val += Number(mapData[uqValKey]) || 0;
          }
          break;
        }
      }
    }
    if (val > 0) results.push({ idx: i, name: name, val: val });
  }
  return results;
}

export var obol = {
  resolve: function(id, ctx) {
    var ids = Array.isArray(id) ? id : [id];
    var statNames = [];
    for (var i = 0; i < ids.length; i++) {
      var names = ETC_STAT_NAMES[ids[i]];
      if (names) for (var j = 0; j < names.length; j++) statNames.push(names[j]);
    }
    if (!statNames.length) return node('Obols ' + id, 0, null, { note: 'obol ' + id });

    // Personal obols for this character
    var charNames = obolNamesData[ctx.charIdx] || [];
    var charMaps = obolMapsData[ctx.charIdx] || {};
    var personal = scanObols(charNames, charMaps, statNames);

    // Family obols (shared)
    var family = scanObols(obolFamilyNames, obolFamilyMaps, statNames);

    var total = 0;
    var children = [];
    var pTotal = 0;
    var pChildren = [];
    for (var i = 0; i < personal.length; i++) {
      pTotal += personal[i].val;
      pChildren.push(node(personal[i].name, personal[i].val, null, { fmt: '+', note: 'slot ' + personal[i].idx }));
    }
    if (pTotal > 0) {
      children.push(node('Personal', pTotal, pChildren, { fmt: '+' }));
      total += pTotal;
    }
    var fTotal = 0;
    var fChildren = [];
    for (var j = 0; j < family.length; j++) {
      fTotal += family[j].val;
      fChildren.push(node(family[j].name, family[j].val, null, { fmt: '+', note: 'slot ' + family[j].idx }));
    }
    if (fTotal > 0) {
      children.push(node('Family', fTotal, fChildren, { fmt: '+' }));
      total += fTotal;
    }
    return node('Obol Bonuses', total, children, { fmt: '+', note: 'obol ' + id });
  },
};
