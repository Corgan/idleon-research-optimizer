// ===== TOME SCORE DESCRIPTOR =====
// Wraps computeTomeScoreDetail from tome-score.js.
// Produces a tree of 118 slots, each with a breakdown of how its qty is computed.
// Qty → pct → pts scoring is shown per slot, with children tracing the data sources.

import { computeTomeScoreDetail, tomeQTYBreakdown, tomePCT } from '../systems/w4/tome-score.js';
import { Tome as TomeData } from '../data/game/customlists.js';

var T = TomeData.map(function(e) { return [Number(e[1]), Number(e[2]), Number(e[3])]; });
if (T.length <= 117) T.push([300, 0, 500]);

// Clean slot names from customlists Tome data
var SLOT_NAMES = TomeData.map(function(e) { return String(e[0]).replace(/_/g, ' '); });
if (SLOT_NAMES.length <= 117) SLOT_NAMES.push('Button Presses');

export default {
  id: 'tome-score',
  name: 'Tome Score',
  scope: 'account',
  category: 'progression',

  pools: {},

  combine: function(pools, ctx) {
    var S = ctx.saveData || ctx._saveData;
    var charIdx = ctx.charIdx;
    var detail = computeTomeScoreDetail(S, charIdx);
    var slots = detail.slots;

    var total = 0;
    var children = [];
    for (var i = 0; i < slots.length; i++) {
      var sl = slots[i];
      total += sl.pts;
      var slotName = SLOT_NAMES[i] || ('Slot ' + i);
      var pct = tomePCT(sl.qty, sl.mode, sl.half);

      // Get the breakdown of how qty is computed
      var bd = tomeQTYBreakdown(i, S);

      children.push({
        name: '#' + i + ' ' + slotName,
        val: sl.pts,
        fmt: 'pts',
        children: [
          { name: 'qty', val: sl.qty, fmt: 'raw', children: bd.children },
          { name: 'pct', val: pct, fmt: '%' },
          { name: 'maxPts', val: sl.maxPts, fmt: 'raw' },
        ],
      });
    }

    return { val: total, children: children };
  },
};
