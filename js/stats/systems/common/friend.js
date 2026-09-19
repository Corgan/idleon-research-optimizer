// ===== FRIEND SYSTEM =====
// Friend bonus stats from the Thingies system.

import { node } from '../../node.js';
import { label } from '../../entity-names.js';
import { optionsListData } from '../../../save/data.js';
import { FRIEND_DR } from '../../data/game-constants.js';
import { eventShopOwned } from '../../../game-helpers.js';
import { companionBonusForSave, companionLevel2 } from '../../data/common/companions.js';

// Per-type FriendBonusQTY scales from game source
var FRIEND_SCALE = { 0: 100, 1: 30, 2: 50, 3: 25, 4: 30, 5: 40, 6: 10 };

function computeFriendBonusSlots(saveData) {
  var comp44 = companionBonusForSave(44, saveData);
  var comp30 = companionBonusForSave(30, saveData);
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
      var c = Math.min(FRIEND_DR.cap, Math.max(0, count));
      lastContrib = scale * Math.min(FRIEND_DR.max, FRIEND_DR.base + c / (c + FRIEND_DR.half) * FRIEND_DR.max);
      lastChild = node(parts[2] || '?', lastContrib, [
        node('Score', count, null, { fmt: 'raw' }),
      ], { fmt: '+' });
    }
    if (lastContrib <= 0) return node('Friend Bonus', 0, null, { note: 'friend ' + id });
    var total = lastContrib;
    var children = [];
    if (lastChild) children.push(lastChild);
    // Companion 30 doubles friend bonuses (FriendBonusXtraMulti = 1 + Companions(30))
    var comp30 = companionBonusForSave(30, ctx.saveData);
    var comp44Level2 = companionLevel2(44, ctx.saveData);
    var companionMulti = 1 + comp30 + 0.25 * comp44Level2;
    if (companionMulti > 1) {
      total *= companionMulti;
      if (comp30 > 0) children.push(node(label('Companion', 30), 100 * comp30, null, { fmt: 'raw' }));
      if (comp44Level2) children.push(node(label('Companion', 44, ' Pet+'), 25, null, { fmt: 'raw' }));
      children.push(node('Companion Multiplier', companionMulti, null, { fmt: 'x' }));
    }
    return node('Friend Bonus', total, children, { fmt: '+', note: 'friend ' + id });
  },
};
