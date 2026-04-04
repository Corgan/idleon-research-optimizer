// ===== FRIEND SYSTEM =====
// Friend bonus stats from the Thingies system.

import { node } from '../../node.js';
import { label } from '../../entity-names.js';
import { optionsListData } from '../../../save/data.js';
import { FRIEND_DR, COMPANION_BONUS } from '../../data/game-constants.js';

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
        var c = Math.min(FRIEND_DR.cap, Math.max(0, count));
        var contrib = FRIEND_DR.scale * Math.min(1, FRIEND_DR.base + c / (c + FRIEND_DR.half));
        children.push(node(parts[2] || '?', contrib, [
          node('Score', count, null, { fmt: 'raw' }),
        ], { fmt: '+' }));
        total += contrib;
      }
    }
    if (total <= 0) return node('Friend Bonus', 0, null, { note: 'friend ' + id });
    // Companion 30 doubles friend bonuses
    var comp30 = ctx.saveData.companionIds ? ctx.saveData.companionIds.has(30) : false;
    if (comp30) {
      total *= COMPANION_BONUS[30];
      children.push(node(label('Companion', 30), COMPANION_BONUS[30], null, { fmt: 'x', note: 'companion 30' }));
    }
    return node('Friend Bonus', total, children, { fmt: '+', note: 'friend ' + id });
  },
};
