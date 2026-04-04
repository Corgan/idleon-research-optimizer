// ===== OBOL SYSTEM =====
// Sums obol UQ stat bonuses from personal and family obols.
// Personal obols: ObolEqO0_{charIdx} + ObolEqMAP_{charIdx} (21 slots per char)
// Family obols:   ObolEqO1 + ObolEqMAPz1 (24 slots, shared across all chars)

import { node } from '../../node.js';
import { entityName } from '../../entity-names.js';
import { obolNamesData, obolMapsData, obolFamilyNames, obolFamilyMaps } from '../../../save/data.js';
import { ETC_STAT_NAMES, itemUqMatch } from '../../data/common/equipment.js';

function scanObols(names, maps, statNames) {
  var results = [];
  var len = names ? names.length : 0;
  for (var i = 0; i < len; i++) {
    var name = names[i];
    if (!name || name === 'Blank' || name === 'Null') continue;
    var mapData = maps ? (maps[i] || maps[String(i)]) : null;
    var val = 0;
    var builtIn = itemUqMatch(name, statNames);
    // Game logic: value = ItemDef.UQval + MAP.UQval (same slot, ignoring MAP txt).
    // Only contributes if item definition has a matching stat.
    if (builtIn) {
      val += builtIn.val;
      // Add rolled upgrade from MAP for the same UQ slot
      if (mapData) {
        var uqValKey = 'UQ' + builtIn.uq + 'val';
        val += Number(mapData[uqValKey]) || 0;
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
      pChildren.push(node(entityName('Item', personal[i].name) || personal[i].name, personal[i].val, null, { fmt: '+', note: 'slot ' + personal[i].idx }));
    }
    if (pTotal > 0) {
      children.push(node('Personal', pTotal, pChildren, { fmt: '+' }));
      total += pTotal;
    }
    var fTotal = 0;
    var fChildren = [];
    for (var j = 0; j < family.length; j++) {
      fTotal += family[j].val;
      fChildren.push(node(entityName('Item', family[j].name) || family[j].name, family[j].val, null, { fmt: '+', note: 'slot ' + family[j].idx }));
    }
    if (fTotal > 0) {
      children.push(node('Family', fTotal, fChildren, { fmt: '+' }));
      total += fTotal;
    }
    return node('Obol Bonuses', total, children, { fmt: '+', note: 'obol ' + id });
  },
};
