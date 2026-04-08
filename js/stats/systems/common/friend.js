// ===== FRIEND SYSTEM =====
// Friend bonus stats from the Thingies system.

import { node } from '../../node.js';
import { label } from '../../entity-names.js';
import { optionsListData } from '../../../save/data.js';
import { FRIEND_DR, COMPANION_BONUS } from '../../data/game-constants.js';
import { eventShopOwned } from '../../../game-helpers.js';

// Per-type FriendBonusQTY scales from game source
var FRIEND_SCALE = { 0: 100, 1: 30, 2: 50, 3: 25, 4: 30, 5: 40 };

function computeFriendBonusSlots(saveData) {
  var comp44 = saveData.companionIds && saveData.companionIds.has(44) ? 1 : 0;
  var comp30 = saveData.companionIds && saveData.companionIds.has(30) ? 1 : 0;
  var evShop22 = eventShopOwned(22, saveData.cachedEventShopStr || '');
  return Math.round(Math.min(20, 2 + comp44 + 2 * comp30 + evShop22));
}

export var friend = {
  resolve: function(id, ctx) {
    // id = stat type (0=speed, 1=?, 2=?, 3=DR, 4=?, 5=money)
    var friendStr = String((optionsListData && optionsListData[476]) || '');
    if (!friendStr || friendStr === '0') return node('Friend Bonus', 0, null, { note: 'friend ' + id });
    var entries = friendStr.split(';');
    var slots = computeFriendBonusSlots(ctx.saveData);
    var scale = FRIEND_SCALE[id] != null ? FRIEND_SCALE[id] : FRIEND_DR.scale;
    // Game assigns (overwrites) per type — last entry for this type wins
    var lastContrib = 0;
    var lastChild = null;
    var maxEntries = Math.min(slots, entries.length);
    for (var i = 0; i < maxEntries; i++) {
      var parts = entries[i].split(',');
      var type = parseInt(parts[0]);
      var count = parseInt(parts[1]);
      if (type !== id || !(type < 18)) continue;
      if (count > 0) {
        var c = Math.min(FRIEND_DR.cap, Math.max(0, count));
        lastContrib = scale * Math.min(1, FRIEND_DR.base + c / (c + FRIEND_DR.half));
        lastChild = node(parts[2] || '?', lastContrib, [
          node('Score', count, null, { fmt: 'raw' }),
        ], { fmt: '+' });
      } else {
        lastContrib = 0;
        lastChild = null;
      }
    }
    if (lastContrib <= 0) return node('Friend Bonus', 0, null, { note: 'friend ' + id });
    var total = lastContrib;
    var children = [];
    if (lastChild) children.push(lastChild);
    // Companion 30 doubles friend bonuses (FriendBonusXtraMulti = 1 + Companions(30))
    var comp30 = ctx.saveData.companionIds ? ctx.saveData.companionIds.has(30) : false;
    if (comp30) {
      total *= COMPANION_BONUS[30];
      children.push(node(label('Companion', 30), COMPANION_BONUS[30], null, { fmt: 'x', note: 'companion 30' }));
    }
    return node('Friend Bonus', total, children, { fmt: '+', note: 'friend ' + id });
  },
};
