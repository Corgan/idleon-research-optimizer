// ===== DEFENCE DESCRIPTOR =====
// _customBlock_TotalStats("Defence"): Equipment DN × pct, + stamps/cards/etc,
// then × shrine/prayer/goldfood/talent/chip/set multipliers.

import { computeEquipBaseStat, computeObolBaseStat, computeGalleryBaseStat,
  computeStatueBonusGiven, computeCardBonusByType, computeBoxReward,
  computeMealBonus } from '../systems/common/stats.js';
import { computeStampBonusOfTypeX } from '../systems/w1/stamp.js';
import { computeStarSignBonus } from '../systems/common/starSign.js';
import { computePrayerReal } from '../systems/w3/prayer.js';
import { computeChipBonus } from '../systems/w4/lab.js';
import { bubbleValByKey } from '../systems/w2/alchemy.js';
import { goldFoodBonuses } from '../systems/common/goldenFood.js';
import { computeCardSetBonus, computeCardLv } from '../systems/common/cards.js';
import { getSetBonus } from '../systems/w3/setBonus.js';
import { computeFlurboShop } from '../systems/w2/dungeon.js';
import { computeRooBonus } from '../systems/w7/sushi.js';
import { vaultUpgBonus } from '../systems/common/vault.js';
import { votingBonusz } from '../systems/w2/voting.js';
import { computeDivinityMinor } from '../systems/w5/divinity.js';
import { companion } from '../systems/common/companions.js';
import { getBribeBonus } from '../systems/w3/bribe.js';
import { shrine } from '../systems/w3/construction.js';
import { talent } from '../systems/common/talent.js';
import { etcBonus } from '../systems/common/etcBonus.js';
import { arcade } from '../systems/w2/arcade.js';
import { charClassData } from '../../save/data.js';
import { label } from '../entity-names.js';
import { safe, rval, safeTree, getBuffBonus, createDescriptor } from './helpers.js';

export default createDescriptor({
  id: 'defence',
  name: 'Defence',
  scope: 'character',
  category: 'combat',

  combine: function(pools, ctx) {
    var s = ctx.saveData;
    var ci = ctx.charIdx || 0;

    // ---- Equipment DN for Defence ----
    var _equipDefT = safeTree(computeEquipBaseStat, ci, 'Defence', s);
    var equipDef = _equipDefT.val;
    var _galleryDefT = safeTree(computeGalleryBaseStat, ci, ctx, 'Defence');
    var galleryDef = _galleryDefT.val;
    var _obolDefT = safeTree(computeObolBaseStat, ci, 'Defence');
    var obolDef = _obolDefT.val;

    var totalStatsDN = equipDef + galleryDef + obolDef;

    // ---- Equipment % multiplier (FMJ bubble + cards + companions) ----
    var charLevel = Number(s.lv0AllData && s.lv0AllData[ci] && s.lv0AllData[ci][0]) || 0;

    var _fmjBubbleT = safeTree(bubbleValByKey, 'DefPct', ci, s);
    var fmjBubble = _fmjBubbleT.val;
    var _summVault46T = safeTree(vaultUpgBonus, 46, s);
    var summVault46 = _summVault46T.val;
    var _cardBonus15T = safeTree(computeCardBonusByType, 15, ci, s);
    var cardBonus15 = _cardBonus15T.val;
    var comp21 = rval(companion, 21, ctx);
    var w6a2lv = safe(computeCardLv, 'w6a2', s);
    var w6a2bonus = 3 * (Number(w6a2lv) || 0);

    var equipPctMult = 1 + (fmjBubble + summVault46 + cardBonus15 + comp21 + w6a2bonus) / 100;

    // ---- Flat adds ----
    var boxDef = (function(){ var v=safe(computeBoxReward, ci, 'def'); return (typeof v==='object'&&v)?v.val||0:Number(v)||0; })();
    var _cardBonus26T = safeTree(computeCardBonusByType, 26, ci, s);
    var cardBonus26 = _cardBonus26T.val;
    var defPctBase = Math.min(charLevel, fmjBubble); // FMJ also gives +1 base def per class LV (capped at bubble val)
    var _stampBaseDefT = safeTree(computeStampBonusOfTypeX, 'BaseDef', s);
    var stampBaseDef = _stampBaseDefT.val;
    var etc50 = rval(etcBonus, '50', ctx);
    var arcade1 = rval(arcade, 1, ctx);
    var _statue7T = safeTree(computeStatueBonusGiven, 7, ci, s);
    var statue7 = _statue7T.val;
    var _mealDefT = safeTree(computeMealBonus, 'Def', s, ci);
    var mealDef = _mealDefT.val;
    var talent122 = rval(talent, 122, ctx, { tab: 2 });
    var _summVault5T = safeTree(vaultUpgBonus, 5, s);
    var summVault5 = _summVault5T.val;
    var _rooBonus1T = safeTree(computeRooBonus, 1, s);
    var rooBonus1 = _rooBonus1T.val;

    var flatSum = boxDef + cardBonus26 + defPctBase + stampBaseDef + etc50
      + arcade1 + statue7 + mealDef + talent122;

    // ---- Main base ----
    var baseVal = Math.floor(totalStatsDN * equipPctMult + flatSum);

    // ---- Multiplicative bonuses ----
    var shrine1 = rval(shrine, 1, ctx);
    var _bribe22T = safeTree(getBribeBonus, '22', s);
    var bribe22 = _bribe22T.val;
    var shrineMult = 1 + (shrine1 + bribe22) / 100;

    var _prayer15penT = safeTree(computePrayerReal, 15, 1, ci, s);
    var prayer15pen = _prayer15penT.val;
    var _prayer16penT = safeTree(computePrayerReal, 16, 1, ci, s);
    var prayer16pen = _prayer16penT.val;
    var prayerMult = Math.max(0.05, 1 - (prayer15pen + prayer16pen) / 100);

    var _gfDefT = safeTree(goldFoodBonuses, 'Defence', ci, undefined, s);
    var gfDef = _gfDefT.val;
    var talent9 = rval(talent, 9, ctx);
    var etc7 = rval(etcBonus, '7', ctx);
    var _starDefPctT = safeTree(computeStarSignBonus, 'DefPct', ci, s);
    var starDefPct = _starDefPctT.val;
    var _cardSet4T = safeTree(computeCardSetBonus, ci, '4');
    var cardSet4 = _cardSet4T.val;
    var _flurbo6T = safeTree(computeFlurboShop, 6, s);
    var flurbo6 = _flurbo6T.val;
    var _chipDefT = safeTree(computeChipBonus, 'def', ci);
    var chipDef = _chipDefT.val;
    var _amarokSetT = safeTree(getSetBonus, 'AMAROK_SET', ci);
    var amarokSet = _amarokSetT.val;
    var buff124 = getBuffBonus(124, 1, ci, ctx);

    var pctMult = 1 + (gfDef + talent9 + etc7 + starDefPct + buff124 + cardSet4
      + flurbo6 + chipDef + amarokSet) / 100;

    var _divinityMinorT = safeTree(computeDivinityMinor, ci, 0, s);
    var divinityMinor = _divinityMinorT.val;
    var votingBonus3 = safe(votingBonusz, 3, ctx.resolve ? ctx.resolve('voting-multi').val : 1, s);
    var divMult = 1 + (divinityMinor + votingBonus3) / 100;

    var val = baseVal * shrineMult * prayerMult * pctMult * divMult
      + rooBonus1 + summVault5;

    var children = [
      { name: 'Equipment Defence', val: totalStatsDN, fmt: 'raw', children: [
        { name: 'Equipment Base Defence', val: equipDef, fmt: 'raw', children: _equipDefT.children },
        { name: 'Gallery Defence', val: galleryDef, fmt: 'raw', children: _galleryDefT.children },
        { name: 'Obol Defence', val: obolDef, fmt: 'raw', children: _obolDefT.children },
      ]},
      { name: 'Equipment Defence Multiplier', val: equipPctMult, fmt: 'x', children: [
        { name: 'FMJ Bubble', val: fmjBubble, fmt: 'raw', children: _fmjBubbleT.children },
        { name: 'Summoning Upgrade: Equipment Defence', val: summVault46, fmt: 'raw', children: _summVault46T.children },
        { name: 'Cards: Defence from Equipment', val: cardBonus15, fmt: 'raw', children: _cardBonus15T.children },
        { name: label('Companion', 21), val: comp21, fmt: 'raw' },
        { name: 'Card: Ricecake', val: w6a2bonus, fmt: 'raw', note: '3 per card level' },
      ]},
      { name: 'Flat Adds', val: flatSum, fmt: 'raw', children: [
        { name: 'Box Rewards', val: boxDef, fmt: 'raw' },
        { name: 'Cards: Base Defence', val: cardBonus26, fmt: 'raw', children: _cardBonus26T.children },
        { name: 'FMJ Base Defence', val: defPctBase, fmt: 'raw', note: 'minimum of class level and bubble value' },
        { name: 'Stamps: Base Defence', val: stampBaseDef, fmt: 'raw', children: _stampBaseDefT.children },
        { name: label('EtcBonus', 50), val: etc50, fmt: 'raw' },
        { name: label('Arcade', 1), val: arcade1, fmt: 'raw' },
        { name: label('Statue', 7), val: statue7, fmt: 'raw', children: _statue7T.children },
        { name: 'Meals: Defence', val: mealDef, fmt: 'raw', children: _mealDefT.children },
        { name: label('Talent', 122), val: talent122, fmt: 'raw' },
      ]},
      { name: 'Base Value', val: baseVal, fmt: 'raw', note: 'equipment defence × equipment multiplier + flat sources' },
      { name: 'Shrine Multi', val: shrineMult, fmt: 'x', children: [
        { name: label('Shrine', 1), val: shrine1, fmt: 'raw' },
        { name: label('Bribe', 22), val: bribe22, fmt: 'raw', children: _bribe22T.children },
      ] },
      { name: 'Prayer Multi', val: prayerMult, fmt: 'x', children: [
        { name: label('Prayer', 15) + ' Penalty', val: -prayer15pen, fmt: 'raw', children: _prayer15penT.children },
        { name: label('Prayer', 16) + ' Penalty', val: -prayer16pen, fmt: 'raw', children: _prayer16penT.children },
      ]},
      { name: 'Pct Multi', val: pctMult, fmt: 'x', children: [
        { name: 'Golden Food: Defence', val: gfDef, fmt: 'raw', children: _gfDefT.children },
        { name: label('Talent', 9), val: talent9, fmt: 'raw' },
        { name: label('EtcBonus', 7), val: etc7, fmt: 'raw' },
        { name: 'Star Signs: Defence', val: starDefPct, fmt: 'raw', children: _starDefPctT.children },
        { name: 'Defence Card Set', val: cardSet4, fmt: 'raw', children: _cardSet4T.children },
        { name: label('Flurbo Shop', 6), val: flurbo6, fmt: 'raw', children: _flurbo6T.children },
        { name: 'Lab Chip: Defence', val: chipDef, fmt: 'raw', children: _chipDefT.children },
        { name: 'Amarok Set', val: amarokSet, fmt: 'raw', children: _amarokSetT.children },
        { name: 'Active Buff: Defence', val: buff124, fmt: 'raw' },
      ]},
      { name: 'Divinity Multi', val: divMult, fmt: 'x', children: _divinityMinorT.children },
    ];

    return { val: val, children: children };
  },
});
