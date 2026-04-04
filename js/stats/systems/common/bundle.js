// ===== BUNDLE SYSTEM =====
// Checks if a bundle has been received and returns its fixed bonus value.

import { node } from '../../node.js';

var BUNDLE_DATA = {
  bun_v: { name: 'Bundle V', val: 2 },
  bun_p: { name: 'Bundle P', val: 1.2 },
};

export var bundle = {
  resolve: function(id, ctx) {
    var info = BUNDLE_DATA[id];
    if (!info) return node('Bundle ' + id, 0, null, { note: 'bundle:' + id });
    var owned = (ctx.saveData.bundlesData || {})[id] === 1;
    return node(info.name, owned ? info.val : 0, [
      node(owned ? 'Owned' : 'Not owned', owned ? 1 : 0, null, { fmt: 'raw' }),
    ], { note: 'bundle:' + id });
  },
};
