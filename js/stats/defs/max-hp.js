// ===== MAX HP DESCRIPTOR =====
// _customBlock_PlayerHPmax: LIST[0] × LIST[1] × LIST[2]

import { computeTotalStat, computeStatueBonusGiven, computeCardBonusByType,
  computeBoxReward, computeMealBonus, computeFamBonusQTY } from '../systems/common/stats.js';
import { computeStampBonusOfTypeX } from '../systems/w1/stamp.js';
import { computeStarSignBonus } from '../systems/common/starSign.js';
import { goldFoodBonuses } from '../systems/common/goldenFood.js';
import { computeCardSetBonus } from '../systems/common/cards.js';
import { talent } from '../systems/common/talent.js';
import { etcBonus } from '../systems/common/etcBonus.js';
import { bubbleValByKey } from '../systems/w2/alchemy.js';
import { shrine } from '../systems/w3/construction.js';
import { ITEMS } from '../data/game/items.js';
import { equipOrderData, equipQtyData, currentMapData } from '../../save/data.js';
import { safe, rval, safeTree, getBuffBonus, createDescriptor } from './helpers.js';

export default createDescriptor({
  id: 'max-hp',
  name: 'Max HP',
  scope: 'character',
  category: 'stat',

  combine: function(pools, ctx) {
    var s = ctx.saveData;
    var ci = ctx.charIdx || 0;

    var strResult = computeTotalStat('STR', ci, ctx);
    var totalSTR = strResult.computed;

    // LIST[0] — Base HP
    var _cardBonus1T = safeTree(computeCardBonusByType, 1, ci, s);
    var cardBonus1 = _cardBonus1T.val;
    var _bubbleBaseHPT = safeTree(bubbleValByKey, 'BaseHP', ci, s);
    var bubbleBaseHP = _bubbleBaseHPT.val;
    var _stampBaseHPT = safeTree(computeStampBonusOfTypeX, 'BaseHP', s);
    var stampBaseHP = _stampBaseHPT.val;
    var _statue4T = safeTree(computeStatueBonusGiven, 4, ci, s);
    var statue4 = _statue4T.val;
    var talent0 = rval(talent, 0, ctx);
    var talent642 = rval(talent, 642, ctx);
    var talent95 = rval(talent, 95, ctx);
    var _brHP = safe(computeBoxReward, ci, 'baseHP');
    var boxBaseHP = (typeof _brHP === 'object') ? (_brHP.val || 0) : Number(_brHP) || 0;
    var strPortion = Math.pow(totalSTR * (1 + talent95 / 100), 1.05);

    // Food HP Base Boosts—scan food bag for HpBaseBoosts items × food effect multiplier
    // Compute boostEff once (same for all food items)
    var _bBox = safe(computeBoxReward, ci, 'PowerFoodEffect');
    var _bBoxVal = (typeof _bBox === 'object' && _bBox) ? (_bBox.val || 0) : Number(_bBox) || 0;
    var _bStatue3T = safeTree(computeStatueBonusGiven, 3, ci, s);
    var _bStatue3 = _bStatue3T.val;
    var _bStampT = safeTree(computeStampBonusOfTypeX, 'BFood', s);
    var _bStampVal = _bStampT.val;
    var _bStarT = safeTree(computeStarSignBonus, 'FoodEffect', ci, s);
    var _bStar = _bStarT.val;
    var _bCard48T = safeTree(computeCardBonusByType, 48, ci, s);
    var _bCard48 = _bCard48T.val;
    var _bT631 = rval(talent, 631, ctx);
    var _bEtc9raw = safe(etcBonus.resolve.bind(etcBonus), '9', ctx);
    var _bEtc9 = (typeof _bEtc9raw === 'object' && _bEtc9raw) ? (_bEtc9raw.val || 0) : Number(_bEtc9raw) || 0;
    var _bCardSet01T = safeTree(computeCardSetBonus, ci, '1');
    var _bCardSet01 = _bCardSet01T.val || 0;
    var boostEff = 1 + (_bBoxVal + _bStatue3 + _bEtc9 + _bStampVal + _bStar + _bCard48 + _bCardSet01 + _bT631) / 100;
    var boostEffChildren = [
      { name: 'Box PowerFoodEffect', val: _bBoxVal, fmt: 'raw' },
      { name: 'Statue 3', val: _bStatue3, fmt: 'raw', children: _bStatue3T.children },
      { name: 'Stamp BFood', val: _bStampVal, fmt: 'raw', children: _bStampT.children },
      { name: 'Star Sign FoodEffect', val: _bStar, fmt: 'raw', children: _bStarT.children },
      { name: 'Cards (type 48)', val: _bCard48, fmt: 'raw', children: _bCard48T.children },
      { name: 'Talent 631', val: _bT631, fmt: 'raw' },
      { name: 'EtcBonus 9', val: _bEtc9, fmt: 'raw' },
      { name: 'CardSet 1', val: _bCardSet01, fmt: 'raw', children: _bCardSet01T.children },
    ];

    var foodHPdn = 0;
    var foodHPchildren = [];
    try {
      var foodBag = equipOrderData && equipOrderData[ci] && equipOrderData[ci][2];
      var foodQty = equipQtyData && equipQtyData[ci] && equipQtyData[ci][2];
      for (var fi = 0; fi < 16; fi++) {
        var fn2 = foodBag && foodBag[fi];
        if (fn2 && fn2 !== 'Blank' && ITEMS[fn2] && ITEMS[fn2].Effect === 'HpBaseBoosts') {
          var qty = Number((foodQty && foodQty[fi]) || 0);
          if (qty > 0) {
            var amt = Number(ITEMS[fn2].Amount) || 0;
            var contrib = amt * boostEff;
            foodHPdn += contrib;
            foodHPchildren.push({ name: fn2, val: contrib, fmt: 'raw', note: 'base ' + amt + ' × ' + boostEff.toFixed(3) });
          }
        }
      }
    } catch(e) {}
    // Also add statue4 as part of PlayerHPmaxDN
    foodHPdn += statue4;

    var list0 = 15 + cardBonus1 + bubbleBaseHP + stampBaseHP + foodHPdn
      + boxBaseHP + talent0 + talent642 + strPortion;

    // LIST[1] — Pct multiplier
    var talent92 = rval(talent, 92, ctx);
    var talent272 = rval(talent, 272, ctx);
    var etc15 = rval(etcBonus, '15', ctx);
    var shrine1 = rval(shrine, 1, ctx);
    var _brPctHP = safe(computeBoxReward, ci, 'pctHP');
    var boxPctHP = (typeof _brPctHP === 'object') ? (_brPctHP.val || 0) : Number(_brPctHP) || 0;
    var famBonus18 = safe(computeFamBonusQTY, 18, s);
    var _cardBonus8T = safeTree(computeCardBonusByType, 8, ci, s);
    var cardBonus8 = _cardBonus8T.val;
    var _starSignHPT = safeTree(computeStarSignBonus, 'TotalHP', ci, s);
    var starSignHP = _starSignHPT.val;

    var list1 = (1 + (talent92 + talent272 + etc15) / 100)
      * (1 + shrine1 / 100);

    // GoldFoodBonuses("MaxHPpct") — golden food HP multiplier
    var _gfHPT = safeTree(goldFoodBonuses, 'MaxHPpct', ci, undefined, s);
    var gfHPpct = _gfHPT.val > 0 ? (1 + _gfHPT.val / 100) : 1;
    list1 *= gfHPpct;

    // GetBuffBonuses(108,1) — HP reduction debuff (1 - buff/100)
    var buff108 = getBuffBonus(108, 1, ci, ctx);
    list1 *= (1 - buff108 / 100);

    list1 *= (1 + boxPctHP / 100)
      * (1 + (famBonus18 + cardBonus8) / 100)
      * (1 + starSignHP / 100);

    // LIST[2] — normally 1, but 164 for maps 20-23
    var list2 = 1;
    var mapIdx = (currentMapData && currentMapData[ci]) || 0;
    if (mapIdx > 19 && mapIdx < 24) list2 = 164;

    var val = list0 * list1 * list2;

    var children = [
      { name: 'Base HP (LIST[0])', val: list0, fmt: 'raw', children: [
        { name: 'Constant', val: 15, fmt: 'raw' },
        { name: 'STR Portion', val: strPortion, fmt: 'raw', note: 'pow(STR×(1+t95/100), 1.05)' },
        { name: 'Card Bonus 1', val: cardBonus1, fmt: 'raw', children: _cardBonus1T.children },
        { name: 'Bubble BaseHP', val: bubbleBaseHP, fmt: 'raw', children: _bubbleBaseHPT.children },
        { name: 'Stamp BaseHP', val: stampBaseHP, fmt: 'raw', children: _stampBaseHPT.children },
        { name: 'Food HP + Statue 4', val: foodHPdn, fmt: 'raw', children: [
          { name: 'Boost Effect Multi', val: boostEff, fmt: 'x', children: boostEffChildren },
        ].concat(foodHPchildren).concat([
          { name: 'Statue 4 (flat add)', val: statue4, fmt: 'raw', children: _statue4T.children },
        ]) },
        { name: 'Talents 0+642', val: talent0 + talent642, fmt: 'raw' },
        { name: 'Box Rewards', val: boxBaseHP, fmt: 'raw' },
      ]},
      { name: 'Pct Multiplier (LIST[1])', val: list1, fmt: 'x', children: [
        { name: 'Talents 92+272', val: talent92 + talent272, fmt: 'raw' },
        { name: 'EtcBonus 15', val: etc15, fmt: 'raw' },
        { name: 'Shrine 1', val: shrine1, fmt: 'raw' },
        { name: 'Golden Food MaxHPpct', val: gfHPpct, fmt: 'x', children: _gfHPT.children },
        { name: 'Box pctHP', val: boxPctHP, fmt: 'raw' },
        { name: 'Family Bonus 18', val: famBonus18, fmt: 'raw' },
        { name: 'Card Bonus 8', val: cardBonus8, fmt: 'raw', children: _cardBonus8T.children },
        { name: 'Star Signs HP', val: starSignHP, fmt: 'raw', children: _starSignHPT.children },
        { name: 'Buff 108 (HP debuff)', val: buff108 ? -(buff108) : 0, fmt: 'raw', note: '×(1-buff/100)' },
      ]},
      { name: 'LIST[2]', val: list2, fmt: 'x', note: mapIdx > 19 && mapIdx < 24 ? 'Maps 20-23 override' : 'normal' },
    ];

    return { val: val, children: children };
  },
});
