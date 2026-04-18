// ===== GLIMBO, WORKSHOP & EVENT SHOP WRAPPERS =====
// Thin system wrappers for clarity in descriptors.
// "glimbo" = GlimboDRmulti, wraps grid 168 trade logic.
// "workshop" = Archlord of the Pirates (talent 328), plunderous kills multiplier.
// "eventShop" = EventShopOwned(idx) — 0 or 1 based on the event shop string.

import { grid } from '../w4/lab.js';
import { talent } from './talent.js';
import { node } from '../../node.js';
import { eventShopOwned } from '../../../game-helpers.js';

export var glimbo = {
  resolve: function(id, ctx, args) {
    return grid.resolve(168, ctx, args);
  },
};

export var workshop = {
  resolve: function(id, ctx, args) {
    return talent.resolve(328, ctx, args);
  },
};

export var eventShop = {
  resolve: function(id, ctx, args) {
    var owned = eventShopOwned(id, ctx.saveData.cachedEventShopStr || '');
    var coeff = (args && args[0]) || 1;
    var val = coeff * owned;
    return node('Event Shop ' + id, val, coeff !== 1 ? [
      node('Owned', owned, null, { fmt: 'raw' }),
      node('Coefficient', coeff, null, { fmt: 'x' }),
    ] : null, { fmt: '+', note: 'eventShop ' + id });
  },
};
