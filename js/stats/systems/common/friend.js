// ===== FRIEND SYSTEM =====
// Friend bonus stats from the Thingies system.

import { node } from '../../node.js';
import { optionsListData } from '../../../save/data.js';

export var friend = {
  resolve: function(id, ctx) {
    // id = stat type (3 = DR)
    var friendStr = String((optionsListData && optionsListData[476]) || '');
    if (!friendStr) return node('Friend Bonus', 0, null, { note: 'friend ' + id });
    var entries = friendStr.split(';');
    var total = 0;
    var children = [];
    for (var i = 0; i < entries.length; i++) {
      var parts = entries[i].split(',');
      var type = parseInt(parts[0]);
      var count = parseInt(parts[1]);
      if (type === id && count > 0) {
        var c = Math.min(12000, Math.max(0, count));
        var contrib = 25 * Math.min(1, 0.2 + c / (c + 3000));
        children.push(node(parts[2] || '?', contrib, [
          node('Score', count, null, { fmt: 'raw' }),
        ], { fmt: '+' }));
        total += contrib;
      }
    }
    if (total <= 0) return node('Friend Bonus', 0, null, { note: 'friend ' + id });
    // Companion 30 doubles friend bonuses
    var comp30 = ctx.S.companionIds ? ctx.S.companionIds.has(30) : false;
    if (comp30) {
      total *= 2;
      children.push(node('bigFish Companion', 2, null, { fmt: 'x', note: 'companion 30' }));
    }
    return node('Friend Bonus', total, children, { fmt: '+', note: 'friend ' + id });
  },
};
