// ===== EQUINOX SYSTEM (W3) =====
// Equinox dream upgrade bonuses.

import { node } from '../../node.js';
import { dreamData } from '../../../save/data.js';

var DREAM_NAMES = {
  10: 'Loot Breakthrough',
};

export var dream = {
  resolve: function(id, ctx) {
    var name = DREAM_NAMES[id] || 'Dream ' + id;
    var lv = Number((dreamData && dreamData[id]) || 0);
    var val = 5 * lv;
    return node(name, val, [
      node('Dream Upgrade Level', lv, null, { fmt: 'raw' }),
      node('Per Level', 5, null, { fmt: 'raw' }),
    ], { fmt: '+', note: 'dream ' + id });
  },
};
