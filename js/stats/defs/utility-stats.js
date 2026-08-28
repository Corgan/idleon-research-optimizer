// ===== CHARACTER UTILITY STAT DESCRIPTORS =====

import { createDescriptor } from './helpers.js';
import { label } from '../entity-names.js';
import { talent } from '../systems/common/talent.js';
import { etcBonus } from '../systems/common/etcBonus.js';
import { guild } from '../systems/common/guild.js';
import { computeFamBonusQTYs, computeBoxReward, computeCardBonusByType } from '../systems/common/stats.js';
import { computeSaltLick } from '../systems/w3/construction.js';
import { achieveStatus } from '../systems/common/achievement.js';
import {
  bubbleValByKey,
  computeVialByKey,
  isBubbleKeyPrismad,
} from '../systems/w2/alchemy.js';
import { computePrayerReal } from '../systems/w3/prayer.js';
import { computeStampBonusOfTypeX } from '../systems/w1/stamp.js';
import { arcadeBonus } from '../systems/w2/arcade.js';
import { getBribeBonus } from '../systems/w3/bribe.js';
import { computeStarSignBonus } from '../systems/common/starSign.js';
import {
  cardChanceMultiplierFromPool,
  printerSampleSizeFromPool,
} from '../systems/common/utility-stats.js';

function _value(result) {
  if (result && typeof result === 'object' && result.val != null) return Number(result.val) || 0;
  return Number(result) || 0;
}

function _resolved(resolver, id, ctx, args) {
  try { return _value(resolver.resolve(id, ctx, args)); } catch(e) { return 0; }
}

function _companionStatus(saveData, required) {
  return saveData.companionDataAvailable === false && required ? {
    partial: true,
    reason: 'Partial total: the imported JSON does not include companion ownership metadata.',
  } : { partial: false, reason: '' };
}

export const printerSampleSize = createDescriptor({
  id: 'printer-sample-size',
  name: 'Printer Sample Size',
  scope: 'character',
  category: 'progression',
  combine: function(pools, ctx) {
    var saveData = ctx.saveData;
    var charIdx = Number(ctx.charIdx) || 0;
    var talent635 = _resolved(talent, 635, ctx);
    var salt0 = _value(computeSaltLick(0, saveData));
    var etc60 = _resolved(etcBonus, '60', ctx);
    var bubble = bubbleValByKey('SampleSize', charIdx, saveData);
    var talent133 = _resolved(talent, 133, ctx);
    var achievement158 = Math.min(1, achieveStatus(158, saveData));
    var vial = computeVialByKey('SampleSize', saveData, charIdx);
    var prayer9 = computePrayerReal(9, 0, charIdx, saveData);
    var stamp = computeStampBonusOfTypeX('SampleRate', saveData, charIdx);
    var task = Math.min(5, 0.5 * (Number(saveData.tasksGlobalData?.[2]?.[2]?.[4]) || 0));
    var familyBonuses = computeFamBonusQTYs(charIdx, saveData);
    var family6 = Math.min(5, Number(familyBonuses[6]) || 0);
    var arcade5 = arcadeBonus(5, saveData);
    var box13a = computeBoxReward(charIdx, '13a');
    var additive = talent635 + salt0 + etc60 + _value(bubble) + talent133
      + achievement158 + _value(vial) + _value(prayer9) + _value(stamp)
      + task + family6 + _value(arcade5) + _value(box13a);
    var status = _companionStatus(saveData,
      isBubbleKeyPrismad('SampleSize') || (Number(saveData.arcadeUpgData?.[5]) || 0) > 0);
    return {
      val: printerSampleSizeFromPool(additive),
      additivePct: additive,
      children: [
        { name: label('Talent', 635), val: talent635, fmt: 'raw' },
        { name: label('SaltLick', 0), val: salt0, fmt: 'raw', children: salt0.children },
        { name: label('EtcBonus', 60), val: etc60, fmt: 'raw' },
        { name: 'Bubble: Sample Size', val: _value(bubble), fmt: 'raw', children: bubble.children },
        { name: label('Talent', 133), val: talent133, fmt: 'raw' },
        { name: label('Achievement', 158), val: achievement158, fmt: 'raw', note: 'capped at 1' },
        { name: 'Vial: Sample Size', val: _value(vial), fmt: 'raw', children: vial.children },
        { name: label('Prayer', 9), val: _value(prayer9), fmt: 'raw', children: prayer9.children },
        { name: 'Stamps: Sample Size', val: _value(stamp), fmt: 'raw', children: stamp.children },
        { name: 'W3 Task Bonus', val: task, fmt: 'raw', note: 'capped at 5' },
        { name: 'Family Bonus: Sample Size', val: family6, fmt: 'raw', note: 'capped at 5' },
        { name: label('Arcade', 5), val: _value(arcade5), fmt: 'raw', children: arcade5.children },
        { name: 'Post Office: Sample Size', val: _value(box13a), fmt: 'raw', children: box13a.children },
        { name: 'Additive Pool', val: additive, fmt: 'raw' },
        { name: 'Sample Size Cap', val: 0.9, fmt: 'raw', note: '90%' },
      ],
      partial: status.partial,
      reason: status.reason,
    };
  },
});

export const cardDropChanceMultiplier = createDescriptor({
  id: 'card-drop-chance-multiplier',
  name: 'Card Drop Chance Multiplier',
  scope: 'character',
  category: 'multiplier',
  combine: function(pools, ctx) {
    var saveData = ctx.saveData;
    var charIdx = Number(ctx.charIdx) || 0;
    var bribe10 = getBribeBonus(10, saveData);
    var starSign = computeStarSignBonus('pctCardDrop', charIdx, saveData);
    var cards = computeCardBonusByType(12, charIdx, saveData);
    var vial = computeVialByKey('CardDrop', saveData, charIdx);
    var stamp = computeStampBonusOfTypeX('CardDrop', saveData, charIdx);
    var talent28 = _resolved(talent, 28, ctx);
    var guild12 = _resolved(guild, 12, ctx);
    var etc26 = _resolved(etcBonus, '26', ctx);
    var bubble = bubbleValByKey('CardDropz', charIdx, saveData);
    var talent628 = _resolved(talent, 628, ctx);
    var additive = _value(bribe10) + _value(starSign) + _value(cards) + _value(vial)
      + _value(stamp) + talent28 + guild12 + etc26 + _value(bubble);
    var talentMultiplier = 1 + talent628 / 100;
    var status = _companionStatus(saveData, isBubbleKeyPrismad('CardDropz'));
    return {
      val: cardChanceMultiplierFromPool(additive, talent628),
      additivePct: additive,
      talentMultiplier: talentMultiplier,
      children: [
        { name: 'Base Multiplier', val: 1.2, fmt: 'x' },
        { name: label('Bribe', 10), val: _value(bribe10), fmt: 'raw', children: bribe10.children },
        { name: 'Star Signs: Card Drop', val: _value(starSign), fmt: 'raw', children: starSign.children },
        { name: 'Cards: Card Drop', val: _value(cards), fmt: 'raw', children: cards.children },
        { name: 'Vial: Card Drop', val: _value(vial), fmt: 'raw', children: vial.children },
        { name: 'Stamps: Card Drop', val: _value(stamp), fmt: 'raw', children: stamp.children },
        { name: label('Talent', 28), val: talent28, fmt: 'raw' },
        { name: label('Guild', 12), val: guild12, fmt: 'raw' },
        { name: label('EtcBonus', 26), val: etc26, fmt: 'raw' },
        { name: 'Bubble: Card Drop', val: _value(bubble), fmt: 'raw', children: bubble.children },
        { name: 'Additive Pool', val: additive, fmt: 'raw' },
        { name: label('Talent', 628) + ' Pool Multiplier', val: talentMultiplier, fmt: 'x' },
      ],
      partial: status.partial,
      reason: status.reason,
    };
  },
});