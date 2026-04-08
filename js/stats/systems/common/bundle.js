// ===== BUNDLE SYSTEM =====
// Checks if a bundle has been received and returns its fixed bonus value.

import { node } from '../../node.js';

var BUNDLE_DATA = {
  bun_v: { name: 'Bundle V', val: 2, off: 0 },
  bun_p: { name: 'Bundle P', val: 1.2, off: 1 },
};

export var bundle = {
  resolve: function(id, ctx) {
    var info = BUNDLE_DATA[id];
    if (!info) return node('Bundle ' + id, 0, null, { note: 'bundle:' + id });
    var owned = (ctx.saveData.bundlesData || {})[id] === 1;
    // When not owned: return identity value (0 for additive, 1 for multiplicative)
    var offVal = owned ? info.val : info.off;
    return node(info.name, offVal, [
      node(owned ? 'Owned' : 'Not owned', owned ? 1 : 0, null, { fmt: 'raw' }),
    ], { note: 'bundle:' + id });
  },
};
