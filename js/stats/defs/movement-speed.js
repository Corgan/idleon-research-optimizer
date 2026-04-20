// ===== MOVEMENT SPEED DESCRIPTOR =====
// PlayerSpeedBonus: food + talents + stamps + AGI curve + statue + star signs + etc.
// Extracted from damage.js lines 384-446.

import { computeTotalStat, computeStatueBonusGiven, computeCardBonusByType,
  computeBoxReward } from '../systems/common/stats.js';
import { computeStampBonusOfTypeX } from '../systems/w1/stamp.js';
import { computeStarSignBonus } from '../systems/common/starSign.js';
import { computeChipBonus } from '../systems/w4/lab.js';
import { computeSaltLick } from '../systems/w3/construction.js';
import { sigil, bubbleValByKey } from '../systems/w2/alchemy.js';
import { talent } from '../systems/common/talent.js';
import { etcBonus } from '../systems/common/etcBonus.js';
import { optionsListData, equipOrderData, equipQtyData } from '../../save/data.js';
import { computeCardSetBonus } from '../systems/common/cards.js';
import { ITEMS } from '../data/game/items.js';
import { safe, rval, safeTree, getBuffBonus, createDescriptor } from './helpers.js';

function agiScale(agiVal) {
  if (agiVal < 1000) {
    return (Math.pow(agiVal + 1, 0.4) - 1) / 40;
  }
  return (agiVal - 1000) / (agiVal + 2500) * 0.5 + 0.371;
}

export default createDescriptor({
  id: 'movement-speed',
  name: 'Movement Speed',
  scope: 'character',
  category: 'combat',

  combine: function(pools, ctx) {
    var s = ctx.saveData;
    var ci = ctx.charIdx || 0;

    // ---- Food scan: MoveSpdBoosts ----
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

    var spdFood = 0;
    var spdFoodChildren = [];
    try {
      var foodBag = equipOrderData && equipOrderData[ci] && equipOrderData[ci][2];
      var foodQty = equipQtyData && equipQtyData[ci] && equipQtyData[ci][2];
      for (var i = 0; i < 16; i++) {
        var fname = foodBag && foodBag[i];
        if (fname && fname !== 'Blank' && ITEMS[fname] && ITEMS[fname].Effect === 'MoveSpdBoosts') {
          var qty = Number((foodQty && foodQty[i]) || 0);
          if (qty > 0) {
            var amt = Number(ITEMS[fname].Amount) || 0;
            var contrib = amt * boostEff;
            spdFood += contrib;
            spdFoodChildren.push({ name: fname, val: contrib, fmt: 'raw', note: 'base ' + amt + ' × ' + boostEff.toFixed(3) });
          }
        }
      }
    } catch(e) {}

    // ---- Pct sources ----
    var talent266 = rval(talent, 266, ctx);
    var _stampSpdT = safeTree(computeStampBonusOfTypeX, 'PctMoveSpd', s);
    var stampSpd = _stampSpdT.val;
    var ola438 = Number(optionsListData && optionsListData[438]) || 0;
    var _statue1T = safeTree(computeStatueBonusGiven, 1, ci, s);
    var statue1 = _statue1T.val;
    var _starMoveSpdT = safeTree(computeStarSignBonus, 'MoveSpd', ci, s);
    var starMoveSpd = _starMoveSpdT.val;
    var etc1 = rval(etcBonus, '1', ctx);
    var _cardBonus6T = safeTree(computeCardBonusByType, 6, ci, s);
    var cardBonus6 = _cardBonus6T.val;
    var talent77 = rval(talent, 77, ctx);

    // ---- AGI scaling ----
    var agiResult = safe(computeTotalStat, 'AGI', ci, ctx);
    var agiVal = (typeof agiResult === 'object') ? (agiResult.computed || 0) : Number(agiResult) || 0;
    var _agiChildren = (agiResult && agiResult.tree) ? agiResult.tree.children : undefined;
    var _agiScale = agiScale(agiVal);

    var buff273 = getBuffBonus(273, 1, ci, ctx);

    var pctSum = spdFood + talent266 + stampSpd + ola438 + buff273;
    var preCapSpeed = (pctSum + statue1 + starMoveSpd + etc1 + cardBonus6 + talent77) / 100
      + _agiScale / 2.2 + 1;

    // ---- Post-cap bonuses ----
    var finalSpeed = preCapSpeed;
    var _saltLick7T = null, _chipMoveT = null;
    var saltLick7 = 0, chipMove = 0, talent641 = 0, sigil13 = 0;
    if (finalSpeed <= 2) {
      _saltLick7T = safeTree(computeSaltLick, 7, s);
      saltLick7 = _saltLick7T.val;
      _chipMoveT = safeTree(computeChipBonus, 'move');
      chipMove = _chipMoveT.val;
      talent641 = rval(talent, 641, ctx);
      sigil13 = rval(sigil, 13, ctx);

      if (finalSpeed > 1.75) {
        finalSpeed = Math.min(2, Math.floor(100 * (finalSpeed + talent641 / 100)) / 100);
      } else {
        finalSpeed = Math.min(1.75, Math.floor(100 * (finalSpeed + (saltLick7 + chipMove + talent641 + sigil13) / 100)) / 100);
      }
    }
    finalSpeed = Math.floor(100 * finalSpeed) / 100;

    var children = [
      { name: 'Food (MoveSpdBoosts)', val: spdFood, fmt: 'raw', children: [
        { name: 'Boost Effect Multi', val: boostEff, fmt: 'x', children: boostEffChildren },
      ].concat(spdFoodChildren) },
      { name: 'Talent 266', val: talent266, fmt: 'raw' },
      { name: 'Stamp PctMoveSpd', val: stampSpd, fmt: 'raw', children: _stampSpdT.children },
      { name: 'OLA[438]', val: ola438, fmt: 'raw' },
      { name: 'Statue 1', val: statue1, fmt: 'raw', children: _statue1T.children },
      { name: 'Star Sign MoveSpd', val: starMoveSpd, fmt: 'raw', children: _starMoveSpdT.children },
      { name: 'EtcBonus 1', val: etc1, fmt: 'raw' },
      { name: 'Cards (type 6)', val: cardBonus6, fmt: 'raw', children: _cardBonus6T.children },
      { name: 'Talent 77', val: talent77, fmt: 'raw' },
      { name: 'Buff 273 (Speed)', val: buff273, fmt: 'raw' },
      { name: 'AGI (' + Math.round(agiVal) + ')', val: _agiScale, fmt: 'raw', note: 'agiScale/2.2 added to speed', children: _agiChildren },
      { name: 'Pre-Cap Speed', val: preCapSpeed, fmt: 'raw' },
      { name: 'Post-Cap Adjustments', val: finalSpeed - preCapSpeed, fmt: 'raw', children: [
        { name: 'Salt Lick 7', val: saltLick7, fmt: 'raw', children: _saltLick7T && _saltLick7T.children },
        { name: 'Chip move', val: chipMove, fmt: 'raw', children: _chipMoveT && _chipMoveT.children },
        { name: 'Talent 641', val: talent641, fmt: 'raw' },
        { name: 'Sigil 13', val: sigil13, fmt: 'raw' },
      ] },
      { name: 'Final Speed', val: finalSpeed, fmt: 'raw' },
    ];

    return { val: finalSpeed, children: children };
  },
});
