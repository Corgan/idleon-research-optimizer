// ===== CARDS SYSTEM =====
// Card bonus by type (equipped cards), card set bonuses, and single-card capped bonuses.

import { node } from '../../node.js';
import { S } from '../../../state.js';
import { cardEquipData, csetEqData } from '../../../save/data.js';
import { CARD_BASE_REQ, CARD_DR_BONUS, CARD_DR_MULTI } from '../../../game-data.js';
import { legendPTSbonus } from '../w7/spelunking.js';

export function computeCardLv(cardKey) {
  var qty = S.cards0Data[cardKey] || 0;
  if (qty <= 0) return 0;
  var rift5star = (S.riftData[0] || 0) >= 45 ? 1 : 0;
  var spelunk6star = (S.spelunkData && S.spelunkData[0] && S.spelunkData[0][2] || 0) >= 1 ? 1 : 0;
  var maxStars = Math.round(4 + rift5star + spelunk6star);
  var lv = 1;
  if (cardKey === 'Boss3B') {
    for (var s = 0; s < maxStars; s++) {
      if (qty > 1.5 * Math.pow(s + 1 + Math.floor(s / 3), 2)) lv = s + 2;
    }
  } else {
    var baseReq = CARD_BASE_REQ[cardKey] || 10;
    for (var s = 0; s < maxStars; s++) {
      var thr = baseReq * Math.pow(s + 1 + Math.floor(s / 3) + 16 * Math.floor(s / 4) + 100 * Math.floor(s / 5), 2);
      if (qty > thr) lv = s + 2;
    }
  }
  var ola155 = String(S.olaData[155] || '');
  if (ola155.split(',').includes(cardKey) && lv < 6) lv = 6;
  return lv;
}

export function computeCardLvDetail(cardKey) {
  var qty = S.cards0Data[cardKey] || 0;
  if (qty <= 0) return { lv: 0, qty: 0, maxStars: 0, rift5: false, spelunk6: false };
  var rift5star = (S.riftData[0] || 0) >= 45 ? 1 : 0;
  var spelunk6star = (S.spelunkData && S.spelunkData[0] && S.spelunkData[0][2] || 0) >= 1 ? 1 : 0;
  var maxStars = Math.round(4 + rift5star + spelunk6star);
  var lv = 1;
  if (cardKey === 'Boss3B') {
    for (var s = 0; s < maxStars; s++) {
      if (qty > 1.5 * Math.pow(s + 1 + Math.floor(s / 3), 2)) lv = s + 2;
    }
  } else {
    var baseReq = CARD_BASE_REQ[cardKey] || 10;
    for (var s = 0; s < maxStars; s++) {
      var thr = baseReq * Math.pow(s + 1 + Math.floor(s / 3) + 16 * Math.floor(s / 4) + 100 * Math.floor(s / 5), 2);
      if (qty > thr) lv = s + 2;
    }
  }
  var ola155 = String(S.olaData[155] || '');
  if (ola155.split(',').includes(cardKey) && lv < 6) lv = 6;
  return { lv: lv, qty: qty, maxStars: maxStars, rift5: !!rift5star, spelunk6: !!spelunk6star };
}

// Map bonus type ID to card bonus table
var CARD_BONUS_TABLES = {
  10: CARD_DR_BONUS,
  101: CARD_DR_MULTI,
};

var CARD_TYPE_NAMES = {
  10: 'Card DR Bonus',
  101: 'Card DR Multi',
};

var CARD_SET_LABELS = {
  5: '{%_Dmg,_Drop,_and_EXP',
  6: '{%_Drop_Rate',
};

var CARD_SET_NAMES = {
  5: 'Card Set (Dmg+Drop+EXP)',
  6: 'Card Set (Drop Rate)',
};

export var card = {
  resolve: function(id, ctx) {
    // id = bonus type (10 = DR%, 101 = DR multi)
    var table = CARD_BONUS_TABLES[id];
    if (!table) return node('Card: #' + id, 0);
    var name = 'Card: ' + (CARD_TYPE_NAMES[id] || '#' + id);
    var equipped = cardEquipData[ctx.charIdx] || [];
    if (!equipped.length) return node(name, 0);

    var legend21 = legendPTSbonus(21);
    var legendMulti = 1 + legend21 / 100;
    var total = 0;
    var children = [];

    for (var i = 0; i < equipped.length; i++) {
      var cardKey = equipped[i];
      if (!cardKey || cardKey === 'B') continue;
      var bonusVal = table[cardKey];
      if (bonusVal == null) continue;
      var lv = computeCardLv(cardKey);
      var qty = S.cards0Data[cardKey] || 0;
      var rift5star = (S.riftData[0] || 0) >= 45 ? 1 : 0;
      var spelunk6star = (S.spelunkData && S.spelunkData[0] && S.spelunkData[0][2] || 0) >= 1 ? 1 : 0;
      var maxStars = Math.round(4 + rift5star + spelunk6star);
      var contrib = lv * bonusVal * legendMulti;
      children.push(node(cardKey + ' Lv' + lv, contrib, [
        node('Card Qty', qty, null, { fmt: 'raw' }),
        node('Star Lv', lv, null, { fmt: 'raw', note: 'max ' + maxStars + ' stars' }),
        node('Bonus/Star', bonusVal, null, { fmt: 'raw' }),
        node('Rift 5th Star', rift5star, null, { fmt: 'raw' }),
        node('Spelunk 6th Star', spelunk6star, null, { fmt: 'raw' }),
      ], {
        fmt: '+',
      }));
      total += contrib;
    }
    if (legendMulti !== 1) {
      var legend21raw = legendPTSbonus(21);
      children.push(node('Legend 21 ×', legendMulti, [
        node('Legend PTS', legend21raw, null, { fmt: 'raw' }),
      ], { fmt: 'x' }));
    }
    return node(name, total, children, { fmt: '+' });
  },
};

export var cardSet = {
  resolve: function(id, ctx) {
    var name = 'Card Set: ' + (CARD_SET_NAMES[id] || '#' + id);
    var label = CARD_SET_LABELS[id];
    if (!label) return node(name, 0);
    var eq = csetEqData[ctx.charIdx];
    if (!eq) return node(name, 0);
    var val = Number(eq[label]) || 0;
    return node(name, val, null, { fmt: '+' });
  },
};

export var cardSingle = {
  resolve: function(id, ctx, args) {
    // id = card key, args = [perStar, cap]
    var perStar = args ? args[0] : 1;
    var cap = args ? args[1] : 999;
    var lv = computeCardLv(id);
    var qty = S.cards0Data[id] || 0;
    var val = Math.min(perStar * lv, cap);
    return node('Card: ' + id, val, [
      node('Card Qty', qty, null, { fmt: 'raw' }),
      node('Card Lv', lv, null, { fmt: 'raw' }),
      node('Per Star', perStar, null, { fmt: 'raw' }),
      node('Cap', cap, null, { fmt: 'raw' }),
      node(val >= cap ? 'CAPPED' : 'Uncapped', val, null, { fmt: 'raw' }),
    ], { fmt: '+' });
  },
};
