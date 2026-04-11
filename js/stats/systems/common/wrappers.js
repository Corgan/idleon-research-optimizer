// ===== GLIMBO & WORKSHOP WRAPPERS =====
// Thin system wrappers for clarity in descriptors.
// "glimbo" = GlimboDRmulti, wraps grid 168 trade logic.
// "workshop" = Archlord of the Pirates (talent 328), plunderous kills multiplier.

import { grid } from '../w4/lab.js';
import { talent } from './talent.js';

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
