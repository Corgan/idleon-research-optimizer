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
import { computeSummUpgBonus } from '../systems/w6/summoning.js';
import { winBonus } from '../systems/w6/summoning.js';
import { computeDivinityMinor } from '../systems/w5/divinity.js';
import { companion } from '../systems/common/companions.js';
import { getBribeBonus } from '../systems/w3/bribe.js';
import { shrine } from '../systems/w3/construction.js';
import { talent } from '../systems/common/talent.js';
import { etcBonus } from '../systems/common/etcBonus.js';
import { arcade } from '../systems/w2/arcade.js';
import { charClassData } from '../../save/data.js';
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
    var charLevel = Number(charClassData && charClassData[ci + '_lv']) || 0;
    // TryFallback: character level might be stored differently
    if (!charLevel && s.charLvData) charLevel = Number(s.charLvData[ci]) || 0;

    var _fmjBubbleT = safeTree(bubbleValByKey, 'DefPct', ci, s);
    var fmjBubble = _fmjBubbleT.val;
    var _summVault46T = safeTree(computeSummUpgBonus, 46, s);
    var summVault46 = _summVault46T.val;
    var _cardBonus15T = safeTree(computeCardBonusByType, 15, ci, s);
    var cardBonus15 = _cardBonus15T.val;
    var comp21 = rval(companion, 21, ctx);
    var w6a2lv = safe(computeCardLv, 'w6a2', ci, s);
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
    var _mealDefT = safeTree(computeMealBonus, 'Def', s);
    var mealDef = _mealDefT.val;
    var talent122 = rval(talent, 122, ctx);
    var _summVault5T = safeTree(computeSummUpgBonus, 5, s);
    var summVault5 = _summVault5T.val;
    var _rooBonus1T = safeTree(computeRooBonus, 1, s);
    var rooBonus1 = _rooBonus1T.val;

    var flatSum = boxDef + cardBonus26 + defPctBase + stampBaseDef + etc50
      + arcade1 + statue7 + mealDef + talent122;

    // ---- Main base ----
    var baseVal = totalStatsDN * equipPctMult + flatSum;

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
    var _chipDefT = safeTree(computeChipBonus, 'def');
    var chipDef = _chipDefT.val;
    var _amarokSetT = safeTree(getSetBonus, 'AMAROK_SET');
    var amarokSet = _amarokSetT.val;
    var buff124 = getBuffBonus(124, 1, ci, ctx);

    var pctMult = 1 + (gfDef + talent9 + etc7 + starDefPct + buff124 + cardSet4
      + flurbo6 + chipDef + amarokSet) / 100;

    var _divinityMinorT = safeTree(computeDivinityMinor, ci, 0, s);
    var divinityMinor = _divinityMinorT.val;
    var _wb3 = rval(winBonus, 3, ctx);
    var votingBonus3 = (typeof _wb3 === 'object') ? (_wb3.val || 0) : Number(_wb3) || 0;
    var divMult = 1 + (divinityMinor + votingBonus3) / 100;

    var val = Math.floor(baseVal * shrineMult * prayerMult * pctMult * divMult
      + rooBonus1 + summVault5);

    var children = [
      { name: 'Equipment DN', val: totalStatsDN, fmt: 'raw', children: [
        { name: 'Equip Base', val: equipDef, fmt: 'raw', children: _equipDefT.children },
        { name: 'Gallery', val: galleryDef, fmt: 'raw', children: _galleryDefT.children },
        { name: 'Obols', val: obolDef, fmt: 'raw', children: _obolDefT.children },
      ]},
      { name: 'Equip % Multi', val: equipPctMult, fmt: 'x', children: [
        { name: 'FMJ Bubble', val: fmjBubble, fmt: 'raw', children: _fmjBubbleT.children },
        { name: 'Summon Vault 46', val: summVault46, fmt: 'raw', children: _summVault46T.children },
        { name: 'Cards (type 15)', val: cardBonus15, fmt: 'raw', children: _cardBonus15T.children },
        { name: 'Companion 21', val: comp21, fmt: 'raw' },
        { name: 'Card w6a2 (×3)', val: w6a2bonus, fmt: 'raw' },
      ]},
      { name: 'Flat Adds', val: flatSum, fmt: 'raw', children: [
        { name: 'Box Rewards', val: boxDef, fmt: 'raw' },
        { name: 'Cards (type 26)', val: cardBonus26, fmt: 'raw', children: _cardBonus26T.children },
        { name: 'FMJ base (min LV, bubble)', val: defPctBase, fmt: 'raw' },
        { name: 'Stamp BaseDef', val: stampBaseDef, fmt: 'raw', children: _stampBaseDefT.children },
        { name: 'EtcBonus 50', val: etc50, fmt: 'raw' },
        { name: 'Arcade 1', val: arcade1, fmt: 'raw' },
        { name: 'Statue 7', val: statue7, fmt: 'raw', children: _statue7T.children },
        { name: 'Meal Def', val: mealDef, fmt: 'raw', children: _mealDefT.children },
        { name: 'Talent 122', val: talent122, fmt: 'raw' },
      ]},
      { name: 'Base Value', val: baseVal, fmt: 'raw', note: 'DN×equip% + flat' },
      { name: 'Shrine Multi', val: shrineMult, fmt: 'x', children: [
        { name: 'Shrine 1', val: shrine1, fmt: 'raw' },
        { name: 'Bribe 22', val: bribe22, fmt: 'raw', children: _bribe22T.children },
      ] },
      { name: 'Prayer Multi', val: prayerMult, fmt: 'x', children: [
        { name: 'Prayer 15 (penalty)', val: -prayer15pen, fmt: 'raw', children: _prayer15penT.children },
        { name: 'Prayer 16 (penalty)', val: -prayer16pen, fmt: 'raw', children: _prayer16penT.children },
      ]},
      { name: 'Pct Multi', val: pctMult, fmt: 'x', children: [
        { name: 'Golden Food Def', val: gfDef, fmt: 'raw', children: _gfDefT.children },
        { name: 'Talent 9', val: talent9, fmt: 'raw' },
        { name: 'EtcBonus 7', val: etc7, fmt: 'raw' },
        { name: 'Star Sign DefPct', val: starDefPct, fmt: 'raw', children: _starDefPctT.children },
        { name: 'CardSet 4', val: cardSet4, fmt: 'raw', children: _cardSet4T.children },
        { name: 'Flurbo Shop 6', val: flurbo6, fmt: 'raw', children: _flurbo6T.children },
        { name: 'Chip def', val: chipDef, fmt: 'raw', children: _chipDefT.children },
        { name: 'Amarok Set', val: amarokSet, fmt: 'raw', children: _amarokSetT.children },
        { name: 'Buff 124 (DefPct)', val: buff124, fmt: 'raw' },
      ]},
      { name: 'Divinity Multi', val: divMult, fmt: 'x', children: _divinityMinorT.children },
    ];

    return { val: val, children: children };
  },
});
