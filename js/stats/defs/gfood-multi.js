// ===== GFOOD MULTI DESCRIPTOR =====
// Wraps gfoodBonusMULTI + gfoodBonusMULTIBreakdown from goldenFood.js.
// Uses ctx.resolve('voting-multi') for the voting multiplier.

import { gfoodBonusMULTI, gfoodBonusMULTIBreakdown } from '../systems/common/goldenFood.js';

export default {
  id: 'gfood-multi',
  name: 'Golden Food Multi',
  scope: 'character',
  category: 'multiplier',

  pools: {},

  combine: function(pools, ctx) {
    // Get voting multi from descriptor
    var votingResult = ctx.resolve('voting-multi');
    var overrides = { votingBonuszMulti: votingResult.val, votingTree: votingResult };
    if (ctx.dnsmCache) overrides.dnsmCache = ctx.dnsmCache;

    var val = gfoodBonusMULTI(ctx.charIdx, overrides);
    var bd = gfoodBonusMULTIBreakdown(ctx.charIdx, overrides);

    // Build children from breakdown items
    var children = [];
    for (var i = 0; i < bd.items.length; i++) {
      var it = bd.items[i];
      if (it.val > 0) {
        children.push(it.tree || { name: it.name, val: it.val, fmt: 'raw' });
      }
    }
    if (bd.setMul !== 1) {
      children.push({ name: 'Secret Set \u00d7', val: bd.setMul, fmt: 'x' });
    }

    return { val: val, children: children };
  },
};
