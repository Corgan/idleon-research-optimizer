// ===== ACCURACY DESCRIPTOR =====
// _customBlock_PlayerAccTot: secondary stat through AccPct bubbles, cards, etc.
// Then: pow(DN/4, 1.4) + DN + TotalStats("Accuracy"), × prayer/chip/meal/set multipliers.

import { computeTotalStat, computeEquipBaseStat, computeObolBaseStat,
  computeGalleryBaseStat, computeStatueBonusGiven, computeCardBonusByType,
  computeBoxReward, computeMealBonus, primaryStatForClass } from '../systems/common/stats.js';
import { computeStampBonusOfTypeX } from '../systems/w1/stamp.js';
import { computeStarSignBonus } from '../systems/common/starSign.js';
import { computePrayerReal } from '../systems/w3/prayer.js';
import { computeChipBonus } from '../systems/w4/lab.js';
import { computeVialByKey, bubbleValByKey } from '../systems/w2/alchemy.js';
import { goldFoodBonuses } from '../systems/common/goldenFood.js';
import { computeCardSetBonus } from '../systems/common/cards.js';
import { getSetBonus } from '../systems/w3/setBonus.js';
import { computeFlurboShop } from '../systems/w2/dungeon.js';
import { computeRooBonus } from '../systems/w7/sushi.js';
import { computeSummUpgBonus } from '../systems/w6/summoning.js';
import { winBonus } from '../systems/w6/summoning.js';
import { computeDivinityMinor } from '../systems/w5/divinity.js';
import { companion } from '../systems/common/companions.js';
import { getBribeBonus } from '../systems/w3/bribe.js';
import { talent } from '../systems/common/talent.js';
import { etcBonus } from '../systems/common/etcBonus.js';
import { arcade } from '../systems/w2/arcade.js';
import { safe, rval, safeTree, getBuffBonus, createDescriptor } from './helpers.js';

function secondaryStatForClass(ci) {
  var primary = primaryStatForClass(ci);
  if (primary === 'STR') return 'WIS';
  if (primary === 'AGI') return 'STR';
  if (primary === 'WIS') return 'AGI';
  return 'STR'; // journeyman/beginner
}

export default createDescriptor({
  id: 'accuracy',
  name: 'Accuracy',
  scope: 'character',
  category: 'combat',

  combine: function(pools, ctx) {
    var s = ctx.saveData;
    var ci = ctx.charIdx || 0;

    // ---- Step 1: TotalStats("Accuracy") = flat base accuracy ----
    var _equipAccT = safeTree(computeEquipBaseStat, ci, 'Accuracy', s);
    var equipAcc = _equipAccT.val;
    var _galleryAccT = safeTree(computeGalleryBaseStat, ci, ctx, 'Accuracy');
    var galleryAcc = _galleryAccT.val;
    var _obolAccT = safeTree(computeObolBaseStat, ci, 'Accuracy');
    var obolAcc = _obolAccT.val;
    var _vialBaseACCT = safeTree(computeVialByKey, 'baseACC', s);
    var vialBaseACC = _vialBaseACCT.val;
    var boxAcc = (function(){ var v=safe(computeBoxReward, ci, 'acc'); return (typeof v==='object'&&v)?v.val||0:Number(v)||0; })();
    var _cardBonus23T = safeTree(computeCardBonusByType, 23, ci, s);
    var cardBonus23 = _cardBonus23T.val;
    var etc28 = rval(etcBonus, '28', ctx);
    var _gfBaseAccT = safeTree(goldFoodBonuses, 'BaseAcc', ci, undefined, s);
    var gfBaseAcc = _gfBaseAccT.val;
    var _stampBaseAccT = safeTree(computeStampBonusOfTypeX, 'BaseAcc', s);
    var stampBaseAcc = _stampBaseAccT.val;
    var _summVault4T = safeTree(computeSummUpgBonus, 4, s);
    var summVault4 = _summVault4T.val;

    var totalStatsAcc = 2 + vialBaseACC + boxAcc + cardBonus23 + etc28
      + gfBaseAcc + stampBaseAcc + summVault4
      + equipAcc + galleryAcc + obolAcc;

    // ---- Step 2: Secondary stat scaled by AccPct ----
    var secName = secondaryStatForClass(ci);
    var secResult = computeTotalStat(secName, ci, ctx);
    var secondaryStat = (typeof secResult === 'object') ? (secResult.computed || 0) : Number(secResult) || 0;

    var _accPctT = safeTree(bubbleValByKey, 'AccPct', ci, s);
    var accPct = _accPctT.val;
    var _cardBonus17T = safeTree(computeCardBonusByType, 17, ci, s);
    var cardBonus17 = _cardBonus17T.val;
    var _statue14T = safeTree(computeStatueBonusGiven, 14, ci, s);
    var statue14 = _statue14T.val;
    var arcade2 = rval(arcade, 2, ctx);
    var _flurbo5T = safeTree(computeFlurboShop, 5, s);
    var flurbo5 = _flurbo5T.val;
    var _bribe21T = safeTree(getBribeBonus, '21', s);
    var bribe21 = _bribe21T.val;
    var comp23 = rval(companion, 23, ctx);
    var _starAccPctT = safeTree(computeStarSignBonus, 'AccPct', ci, s);
    var starAccPct = _starAccPctT.val;

    var buff288 = getBuffBonus(288, 2, ci, ctx);
    var buff124 = getBuffBonus(124, 1, ci, ctx);

    var pctSum = cardBonus17 + starAccPct + statue14 + arcade2 + flurbo5 + bribe21 + comp23
      + buff288 + buff124;

    var playerACCDN = secondaryStat
      * (1 + accPct / 100)
      * (1 + pctSum / 100);

    // ---- Step 3: speed→accuracy talent 641 conditional ----
    var talent641 = rval(talent, 641, ctx);
    var spdTree = ctx.resolve && ctx.resolve('movement-speed');
    var playerSpeed = 1;
    if (spdTree && spdTree.val != null) playerSpeed = spdTree.val;
    else if (typeof spdTree === 'number') playerSpeed = spdTree;
    if (playerSpeed > 1.99 && talent641) {
      playerACCDN *= (1 + talent641 / 100);
    }

    // ---- Step 4: Final formula ----
    var base = Math.pow(playerACCDN / 4, 1.4) + playerACCDN + totalStatsAcc;

    var _cardSet4T = safeTree(computeCardSetBonus, ci, '4');
    var cardSet4 = _cardSet4T.val;
    var _prayer6T = safeTree(computePrayerReal, 6, 0, ci, s);
    var prayer6 = _prayer6T.val;
    var _prayer15penT = safeTree(computePrayerReal, 15, 1, ci, s);
    var prayer15pen = _prayer15penT.val;
    var _prayer16penT = safeTree(computePrayerReal, 16, 1, ci, s);
    var prayer16pen = _prayer16penT.val;
    var _chipAccT = safeTree(computeChipBonus, 'acc');
    var chipAcc = _chipAccT.val;
    var _mealTotAccT = safeTree(computeMealBonus, 'TotAcc', s);
    var mealTotAcc = _mealTotAccT.val;
    var _rooBonus3T = safeTree(computeRooBonus, 3, s);
    var rooBonus3 = _rooBonus3T.val;
    var _wb3 = rval(winBonus, 3, ctx);
    var votingBonus3 = (typeof _wb3 === 'object') ? (_wb3.val || 0) : Number(_wb3) || 0;
    var _amarokSetT = safeTree(getSetBonus, 'AMAROK_SET');
    var amarokSet = _amarokSetT.val;
    var _divinityMinorT = safeTree(computeDivinityMinor, ci, 0, s);
    var divinityMinor = _divinityMinorT.val;

    var prayerMult = Math.max(0.1, 1 + (prayer6 - prayer15pen - prayer16pen) / 100);
    var postMult1 = 1 + (playerACCDN + 2 * cardSet4) / 200;
    var postMult2 = 1 + (chipAcc + mealTotAcc + rooBonus3 + votingBonus3 + amarokSet) / 100;
    var postMult3 = 1 + divinityMinor / 100;

    var val = base * postMult1 * prayerMult * postMult2 * postMult3;

    var children = [
      { name: 'TotalStats("Accuracy")', val: totalStatsAcc, fmt: 'raw', children: [
        { name: 'Constant', val: 2, fmt: 'raw' },
        { name: 'Equipment Accuracy', val: equipAcc, fmt: 'raw', children: _equipAccT.children },
        { name: 'Gallery Accuracy', val: galleryAcc, fmt: 'raw', children: _galleryAccT.children },
        { name: 'Obol Accuracy', val: obolAcc, fmt: 'raw', children: _obolAccT.children },
        { name: 'Vial baseACC', val: vialBaseACC, fmt: 'raw', children: _vialBaseACCT.children },
        { name: 'Box Rewards acc', val: boxAcc, fmt: 'raw' },
        { name: 'Cards (type 23)', val: cardBonus23, fmt: 'raw', children: _cardBonus23T.children },
        { name: 'EtcBonus 28', val: etc28, fmt: 'raw' },
        { name: 'Golden Food BaseAcc', val: gfBaseAcc, fmt: 'raw', children: _gfBaseAccT.children },
        { name: 'Stamp BaseAcc', val: stampBaseAcc, fmt: 'raw', children: _stampBaseAccT.children },
        { name: 'Summoning Vault 4', val: summVault4, fmt: 'raw', children: _summVault4T.children },
      ]},
      { name: 'Secondary Stat (' + secName + ')', val: secondaryStat, fmt: 'raw', children: secResult.tree && secResult.tree.children },
      { name: 'Bubble AccPct', val: accPct, fmt: 'raw', children: _accPctT.children },
      { name: 'Pct Sum (×1+X/100)', val: pctSum, fmt: 'raw', children: [
        { name: 'Cards (type 17)', val: cardBonus17, fmt: 'raw', children: _cardBonus17T.children },
        { name: 'Star Sign AccPct', val: starAccPct, fmt: 'raw', children: _starAccPctT.children },
        { name: 'Statue 14', val: statue14, fmt: 'raw', children: _statue14T.children },
        { name: 'Arcade 2', val: arcade2, fmt: 'raw' },
        { name: 'Flurbo Shop 5', val: flurbo5, fmt: 'raw', children: _flurbo5T.children },
        { name: 'Bribe 21', val: bribe21, fmt: 'raw', children: _bribe21T.children },
        { name: 'Companion 23', val: comp23, fmt: 'raw' },
        { name: 'Buff 288 (AccPct)', val: buff288, fmt: 'raw' },
        { name: 'Buff 124 (AccPct)', val: buff124, fmt: 'raw' },
      ]},
      { name: 'PlayerACCDN (scaled secondary)', val: playerACCDN, fmt: 'raw' },
      { name: 'Base (pow + flat)', val: base, fmt: 'raw', note: 'pow(DN/4, 1.4) + DN + flat' },
      { name: 'CardSet 4 Multi', val: postMult1, fmt: 'x', children: [
        { name: 'CardSet 4', val: cardSet4, fmt: 'raw', children: _cardSet4T.children },
      ] },
      { name: 'Prayer Multi', val: prayerMult, fmt: 'x', children: [
        { name: 'Prayer 6', val: prayer6, fmt: 'raw', children: _prayer6T.children },
        { name: 'Prayer 15 (penalty)', val: -prayer15pen, fmt: 'raw', children: _prayer15penT.children },
        { name: 'Prayer 16 (penalty)', val: -prayer16pen, fmt: 'raw', children: _prayer16penT.children },
      ]},
      { name: 'Post Multi', val: postMult2, fmt: 'x', children: [
        { name: 'Chip acc', val: chipAcc, fmt: 'raw', children: _chipAccT.children },
        { name: 'Meal TotAcc', val: mealTotAcc, fmt: 'raw', children: _mealTotAccT.children },
        { name: 'Roo Bonus 3', val: rooBonus3, fmt: 'raw', children: _rooBonus3T.children },
        { name: 'Voting Bonus 3', val: votingBonus3, fmt: 'raw' },
        { name: 'Amarok Set', val: amarokSet, fmt: 'raw', children: _amarokSetT.children },
      ]},
      { name: 'Divinity Minor', val: postMult3, fmt: 'x', children: _divinityMinorT.children },
    ];

    return { val: val, children: children };
  },
});
