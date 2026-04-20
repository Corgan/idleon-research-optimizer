// ===== CARDS SYSTEM =====
// Card bonus by type (equipped cards), card set bonuses, and single-card capped bonuses.

import { node, treeResult } from '../../node.js';
import { label } from '../../entity-names.js';
import { cardEquipData, csetEqData } from '../../../save/data.js';
import { CARD_BASE_REQ, CARD_DR_BONUS, CARD_DR_MULTI } from '../../data/common/cards.js';
import { IDforCardSETbonus } from '../../data/game/custommaps.js';
import { legendPTSbonus } from '../w7/spelunking.js';
import { charHasChip } from '../w4/lab.js';
import { RANDOlist } from '../../data/game/customlists.js';

export function computeCardLv(cardKey, saveData) {
  if (!saveData || !saveData.cards0Data) return 0;
  var qty = saveData.cards0Data[cardKey] || 0;
  if (qty <= 0) return 0;
  var rift5star = (saveData.riftData[0] || 0) >= 45 ? 1 : 0;
  var spelunk6star = (saveData.spelunkData && saveData.spelunkData[0] && saveData.spelunkData[0][2] || 0) >= 1 ? 1 : 0;
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
  var ola155 = String(saveData.olaData[155] || '');
  if (ola155.split(',').includes(cardKey) && lv < 6) lv = 6;
  return lv;
}

export function cardLv(cardId, saveData) {
  return computeCardLv(cardId, saveData);
}

export function computeCardLvDetail(cardKey, saveData) {
  var qty = saveData.cards0Data[cardKey] || 0;
  if (qty <= 0) return { lv: 0, qty: 0, maxStars: 0, rift5: false, spelunk6: false };
  var rift5star = (saveData.riftData[0] || 0) >= 45 ? 1 : 0;
  var spelunk6star = (saveData.spelunkData && saveData.spelunkData[0] && saveData.spelunkData[0][2] || 0) >= 1 ? 1 : 0;
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
  var ola155 = String(saveData.olaData[155] || '');
  if (ola155.split(',').includes(cardKey) && lv < 6) lv = 6;
  return { lv: lv, qty: qty, maxStars: maxStars, rift5: !!rift5star, spelunk6: !!spelunk6star };
}

// Map bonus type ID to card bonus table
var CARD_BONUS_TABLES = {
  10: CARD_DR_BONUS,
  101: CARD_DR_MULTI,
};

var CARD_SET_KEYS = {
  5: '{%_Dmg,_Drop,_and_EXP',
  6: '{%_Drop_Rate',
};

export var card = {
  resolve: function(id, ctx) {
    var saveData = ctx.saveData;
    // id = bonus type (10 = DR%, 101 = DR multi)
    var table = CARD_BONUS_TABLES[id];
    if (!table) return node('Card: #' + id, 0);
    var name = label('Card Type', id);
    var equipped = cardEquipData[ctx.charIdx] || [];
    if (!equipped.length) return node(name, 0);

    var legend21 = legendPTSbonus(21, saveData);
    var legendMulti = 1 + legend21 / 100;
    var total = 0;
    var children = [];

    for (var i = 0; i < equipped.length; i++) {
      var cardKey = equipped[i];
      if (!cardKey || cardKey === 'B') continue;
      var bonusVal = table[cardKey];
      if (bonusVal == null) continue;
      var lv = computeCardLv(cardKey, saveData);
      var qty = saveData.cards0Data[cardKey] || 0;
      var rift5star = (saveData.riftData[0] || 0) >= 45 ? 1 : 0;
      var spelunk6star = (saveData.spelunkData && saveData.spelunkData[0] && saveData.spelunkData[0][2] || 0) >= 1 ? 1 : 0;
      var maxStars = Math.round(4 + rift5star + spelunk6star);
      // Chip doubler: slot 0 + "card1" chip, slot 7 + "card2" chip
      var chipDouble = (i === 0 && charHasChip(ctx.charIdx, 'card1'))
                     || (i === 7 && charHasChip(ctx.charIdx, 'card2')) ? 2 : 1;
      var contrib = chipDouble * lv * bonusVal * legendMulti;
      var slotChildren = [
        node('Card Qty', qty, null, { fmt: 'raw' }),
        node('Star Lv', lv, null, { fmt: 'raw', note: 'max ' + maxStars + ' stars' }),
        node('Bonus/Star', bonusVal, null, { fmt: 'raw' }),
        node('Rift 5th Star', rift5star, null, { fmt: 'raw' }),
        node('Spelunk 6th Star', spelunk6star, null, { fmt: 'raw' }),
      ];
      if (chipDouble > 1) {
        slotChildren.push(node('Chip ×2', 2, null, { fmt: 'x', note: i === 0 ? 'card1' : 'card2' }));
      }
      children.push(node(label('Card', cardKey) + ' Lv' + lv, contrib, slotChildren, {
        fmt: '+',
      }));
      total += contrib;
    }
    if (legendMulti !== 1) {
      var legend21raw = legendPTSbonus(21, saveData);
      children.push(node(label('Legend', 21, ' ×'), legendMulti, [
        node('Legend PTS', legend21raw, null, { fmt: 'raw' }),
      ], { fmt: 'x' }));
    }
    return node(name, total, children, { fmt: '+' });
  },
};

export var cardSet = {
  resolve: function(id, ctx) {
    var name = label('Card Set', id);
    var setKey = CARD_SET_KEYS[id];
    if (!setKey) return node(name, 0);
    var eq = csetEqData[ctx.charIdx];
    if (!eq) return node(name, 0);
    var val = Number(eq[setKey]) || 0;
    return node(name, val, null, { fmt: '+' });
  },
};

export var cardSingle = {
  resolve: function(id, ctx, args) {
    var saveData = ctx.saveData;
    // id = card key, args = [perStar, cap]
    var perStar = args ? args[0] : 1;
    var cap = args ? args[1] : 999;
    var lv = computeCardLv(id, saveData);
    var qty = saveData.cards0Data[id] || 0;
    var val = Math.min(perStar * lv, cap);
    return node(label('Card', id), val, [
      node('Card Qty', qty, null, { fmt: 'raw' }),
      node('Card Lv', lv, null, { fmt: 'raw' }),
      node('Per Star', perStar, null, { fmt: 'raw' }),
      node('Cap', cap, null, { fmt: 'raw' }),
      node(val >= cap ? 'CAPPED' : 'Uncapped', val, null, { fmt: 'raw' }),
    ], { fmt: '+' });
  },
};

// ==================== CARD SET BONUS ====================

export function computeCardSetBonus(charIdx, setKey) {
  var csetMap = csetEqData && csetEqData[charIdx];
  if (!csetMap || typeof csetMap !== 'object') return treeResult(0);
  var key = IDforCardSETbonus[setKey];
  if (!key) return treeResult(0);
  var val = Number(csetMap[key]) || 0;
  return treeResult(val, [
    { name: 'Set ' + setKey, val: val, fmt: 'raw', note: 'key=' + key },
  ]);
}

// Raw card-set bonus lookup (account-level, not per-character)
export function computeCardSetBonusRaw(setId, saveData) {
  var cset = saveData.cardSetData;
  if (!cset) return 0;
  return Number(cset[setId]) || 0;
}

// Count discovered cards across RANDOlist sets 82-86
export function countDiscoveredCards(saveData) {
  var cards1 = saveData.cardsData && saveData.cardsData[1];
  if (!cards1) return 0;
  var count = 0;
  for (var setIdx = 82; setIdx <= 86; setIdx++) {
    var set = RANDOlist[setIdx];
    if (!set) continue;
    for (var j = 0; j < set.length; j++) {
      if (cards1[set[j]] !== undefined) count++;
    }
  }
  return count;
}
