// ===== BASE STAT DESCRIPTORS (STR/AGI/WIS/LUK) =====
// Thin wrappers around computeTotalStat() to expose as descriptors.

import { computeTotalStat } from '../systems/common/stats.js';
import { createDescriptor } from './helpers.js';

function makeStatDescriptor(statName) {
  return createDescriptor({
    id: 'total-' + statName.toLowerCase(),
    name: 'Total ' + statName,
    scope: 'character',
    category: 'stat',

    combine: function(pools, ctx) {
      var result = computeTotalStat(statName, ctx.charIdx || 0, ctx);
      return {
        val: result.computed,
        children: result.tree ? result.tree.children : null,
      };
    },
  });
}

export var totalSTR = makeStatDescriptor('STR');
export var totalAGI = makeStatDescriptor('AGI');
export var totalWIS = makeStatDescriptor('WIS');
export var totalLUK = makeStatDescriptor('LUK');
