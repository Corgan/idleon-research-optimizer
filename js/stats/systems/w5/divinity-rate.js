// ===== DIVINITY RATES (W5) =====
// Divinity panel points/hour and EXP/hour calculations.

import { node, treeResult } from '../../node.js';
import { label } from '../../entity-names.js';
import { divinityData, optionsListData } from '../../../save/data.js';
import { legendPTSbonus } from '../w7/spelunking.js';
import { computeMeritocBonusz } from '../w7/meritoc.js';
import { rogBonusQTY } from '../w7/sushi.js';
import { computeDivinityBless, computeDivinityMajor } from './divinity.js';
import { computeArtifactBonus } from './sailing.js';
import { zenithMarketPerLevel } from '../../data/w5/sailing.js';
import { maxTalentBonus, talent } from '../common/talent.js';
import { companions } from '../common/companions.js';
import { achieveStatus } from '../common/achievement.js';
import {
  computeBoxReward,
  computeMealBonus,
  computeStatueBonusGiven,
} from '../common/stats.js';
import { computeCardLv } from '../common/cards.js';
import { computeStampBonusOfTypeX } from '../w1/stamp.js';
import { bubbleValByKey, computeVialByKey, sigilBonus } from '../w2/alchemy.js';
import { computeRiftSkillBonus } from '../w4/rift.js';
import { computeStarSignBonus } from '../common/starSign.js';
import { guild } from '../common/guild.js';
import { arcadeBonus } from '../w2/arcade.js';
import { etcBonus } from '../common/etcBonus.js';
import { votingBonusz } from '../w2/voting.js';
import { getBribeBonus } from '../w3/bribe.js';
import { getSetBonus } from '../w3/setBonus.js';
import { vaultUpgBonus } from '../common/vault.js';

var STYLE_EXP_PER_HOUR = [1, 2, 1, 1, 7, 3, 8, 10];
var STYLE_POINTS_PER_HOUR = [1, 2, 4, 0, 2, 0, 8, 15];

function _num(value) {
  if (value && typeof value === 'object') {
    if (value.val != null) return Number(value.val) || 0;
    if (value.total != null) return Number(value.total) || 0;
    if (value.computed != null) return Number(value.computed) || 0;
  }
  return Number(value) || 0;
}

function _coralKidBonus(idx) {
  var level = Number(optionsListData[427 + idx]) || 0;
  if (idx === 0) return 10 * level;
  if (idx === 1) return Math.round(2 * level);
  if (idx === 2) return level / (25 + level) * 20;
  if (idx === 3) return Math.round(level);
  if (idx === 4) return Math.round(2 * level);
  return level / (40 + level) * 100;
}

function _allSkillXpMulti(charIdx, saveData) {
  var meritoc10 = computeMeritocBonusz(10, saveData, charIdx);
  var legend20 = legendPTSbonus(20, saveData);
  var companion32 = companions(32, saveData);
  return (1 + meritoc10 / 100) * (1 + legend20 / 100) * (1 + companion32);
}

function _votingBonus(voteIdx, ctx) {
  var votingMulti = 1;
  try { votingMulti = Number(ctx.resolve('voting-multi').val) || 1; } catch(e) {}
  return votingBonusz(voteIdx, votingMulti, ctx.saveData);
}

function _lampBonus(tier, bonusIdx, saveData) {
  var base = [[25, 10, 8], [15, 40, 10], [20, 35, 12], [5, 1, 1], [2, 2, 2]];
  var lampLevel = Number(saveData.holesData && saveData.holesData[21]
    && saveData.holesData[21][Math.min(11, 4 + 2 * tier)]) || 0;
  var zenithLevel = Number(saveData.spelunkData && saveData.spelunkData[45]
    && saveData.spelunkData[45][2]) || 0;
  var zenithBonus = Math.floor(zenithMarketPerLevel(2) * zenithLevel);
  return (Number(base[tier] && base[tier][bonusIdx]) || 0)
    * lampLevel * (1 + zenithBonus / 100);
}

export function computeDivinityPointsPerHour(charIdx, ctx) {
  var saveData = ctx.saveData;
  var style = Math.max(0, Math.round(Number(divinityData[charIdx]) || 0));
  var styleBase = Number(STYLE_POINTS_PER_HOUR[style]) || 0;
  var gemMulti = 1 + (Number(saveData.gemItemsData && saveData.gemItemsData[130]) || 0) / 4;
  var rog46 = rogBonusQTY(46, saveData.cachedUniqueSushi || 0);
  var rogMulti = 1 + rog46 / 100;

  var divinityMultipliers = [
    1 + computeDivinityBless(0, saveData) / 100,
    1 + computeDivinityBless(1, saveData) / 100,
    1 + computeArtifactBonus(11, -1, ctx) / 100,
    1 + computeDivinityBless(3, saveData) / 100,
    1 + computeDivinityBless(5, saveData) / 100,
    1 + computeArtifactBonus(18, -1, ctx) / 100,
  ];
  var divinityMulti = 1;
  for (var multiIdx = 0; multiIdx < divinityMultipliers.length; multiIdx++) {
    divinityMulti *= divinityMultipliers[multiIdx];
  }
  divinityMulti = Math.max(1, divinityMulti);

  var talent505 = maxTalentBonus(505, charIdx, saveData);
  var talentMulti = 1 + talent505 / 100;
  var purrmepMulti = Math.max(1, 1 + computeDivinityMajor(0, 6, saveData));
  var voting23 = _votingBonus(23, ctx);
  var votingMulti = 1 + voting23 / 100;
  var lamp12 = _lampBonus(1, 2, saveData);
  var lampMulti = 1 + lamp12 / 100;

  var spelunkStyles = 0;
  var styleCounts = saveData.spelunkData && saveData.spelunkData[13] || [];
  for (var styleIdx = 0; styleIdx < 6; styleIdx++) {
    spelunkStyles += Number(styleCounts[styleIdx]) || 0;
  }
  var coralKid4 = _coralKidBonus(4);
  var spelunkMulti = 1 + spelunkStyles * coralKid4 / 100;

  var box22c = _num(computeBoxReward(charIdx, '22c'));
  var achievement298 = 10 * _num(achieveStatus(298, saveData));
  var achievement304 = 10 * _num(achieveStatus(304, saveData));
  var rift13 = 15 * computeRiftSkillBonus(13, 1, saveData);
  var bribe38 = _num(getBribeBonus('38', saveData));
  var vault71 = vaultUpgBonus(71, saveData);
  var additive = box22c + achievement298 + achievement304 + rift13 + bribe38 + vault71;
  var additiveMulti = 1 + additive / 100;

  var value = styleBase * gemMulti * rogMulti * divinityMulti * talentMulti
    * purrmepMulti * votingMulti * lampMulti * spelunkMulti * additiveMulti;
  return treeResult(value, [
    node('Divinity Style Base Points/hr', styleBase, [
      node('Style Index', style, null, { fmt: 'raw' }),
    ], { fmt: 'raw' }),
    node('Gem Shop Divinity Sparkie', gemMulti, null, { fmt: 'x' }),
    node(label('RoG', 46), rogMulti, null, { fmt: 'x' }),
    node('Divinity Blessing Multiplier', divinityMulti, [
      node(label('Divinity Blessing', 0), divinityMultipliers[0], null, { fmt: 'x' }),
      node(label('Divinity Blessing', 1), divinityMultipliers[1], null, { fmt: 'x' }),
      node(label('Artifact', 11), divinityMultipliers[2], null, { fmt: 'x' }),
      node(label('Divinity Blessing', 3), divinityMultipliers[3], null, { fmt: 'x' }),
      node(label('Divinity Blessing', 5), divinityMultipliers[4], null, { fmt: 'x' }),
      node(label('Artifact', 18), divinityMultipliers[5], null, { fmt: 'x' }),
    ], { fmt: 'x' }),
    node(label('Talent', 505), talentMulti, null, { fmt: 'x' }),
    node('Purrmep Major Bonus', purrmepMulti, null, { fmt: 'x' }),
    node(label('Voting', 23), votingMulti, null, { fmt: 'x' }),
    node('Lamp Bonus', lampMulti, null, { fmt: 'x' }),
    node('Spelunking Divinity Styles', spelunkMulti, [
      node('Style Count', spelunkStyles, null, { fmt: 'raw' }),
      node('Coral Kid Divinity Gain', coralKid4, null, { fmt: 'raw' }),
    ], { fmt: 'x' }),
    node('Divinity Gain Sources', additiveMulti, [
      node('Post Office: Box of Gosh', box22c, null, { fmt: 'raw' }),
      node(label('Achievement', 298), achievement298, null, { fmt: 'raw' }),
      node(label('Achievement', 304), achievement304, null, { fmt: 'raw' }),
      node('Rift Skill Bonus', rift13, null, { fmt: 'raw' }),
      node(label('Bribe', 38), bribe38, null, { fmt: 'raw' }),
      node(label('Vault', 71), vault71, null, { fmt: 'raw' }),
    ], { fmt: 'x' }),
  ]);
}

export function computeDivinityExpPerHour(charIdx, ctx) {
  var saveData = ctx.saveData;
  var style = Math.max(0, Math.round(Number(divinityData[charIdx]) || 0));
  var styleBase = Number(STYLE_EXP_PER_HOUR[style]) || 0;
  var gemMulti = 1 + (Number(saveData.gemItemsData && saveData.gemItemsData[130]) || 0) / 4;
  var legendMulti = 1 + legendPTSbonus(15, saveData) / 100;
  var allSkillXpMulti = _allSkillXpMulti(charIdx, saveData);
  var coralMulti = 1 + _coralKidBonus(0) / 100;
  var purrmepMulti = Math.max(1, 1 + computeDivinityMajor(0, 6, saveData));
  var talent506 = maxTalentBonus(506, charIdx, saveData);
  var talentMulti = 1 + talent506 / 100;
  var companion16 = companions(16, saveData);
  var companionMulti = 1 + companion16;

  var divinityRank = Number(divinityData[25]) || 0;
  var rankBonus = 10 * Math.max(0, divinityRank - 10);
  var box22c = _num(computeBoxReward(charIdx, '22c'));
  var sigil22 = sigilBonus(22, saveData, charIdx);
  var cardW5a5 = 6 * computeCardLv('w5a5', saveData);
  var stampDivineExp = _num(computeStampBonusOfTypeX('DivineExp', saveData, charIdx));
  var bubbleM3 = _num(bubbleValByKey('M3ACTIVE', charIdx, saveData));
  var statue23 = _num(computeStatueBonusGiven(23, charIdx, saveData));
  var mealDivExp = _num(computeMealBonus('DivExp', saveData, charIdx));
  var vialDivXP = _num(computeVialByKey('DivXP', saveData, charIdx));
  var talent464 = _num(talent.resolve(464, ctx));
  var taskBonus = 10 * (Number(saveData.tasksGlobalData && saveData.tasksGlobalData[2]
    && saveData.tasksGlobalData[2][4] && saveData.tasksGlobalData[2][4][4]) || 0);
  var rift13 = 25 * computeRiftSkillBonus(13, 0, saveData);
  var starSign62 = _num(computeStarSignBonus('DivExp', charIdx, saveData));
  var guild14 = _num(guild.resolve(14, ctx));
  var arcade37 = _num(arcadeBonus(37, saveData));
  var etc74 = _num(etcBonus.resolve('74', ctx));
  var voting23 = _votingBonus(23, ctx);
  var magmaSet = _num(getSetBonus('MAGMA_SET', charIdx));
  var vault72 = vaultUpgBonus(72, saveData);

  var additive = rankBonus + box22c + sigil22 + cardW5a5 + stampDivineExp
    + bubbleM3 + statue23 + mealDivExp + vialDivXP + talent464 + taskBonus
    + rift13 + starSign62 + guild14 + arcade37 + etc74 + voting23
    + magmaSet + vault72;
  var additiveMulti = 1 + additive / 100;
  var value = styleBase * gemMulti * legendMulti * allSkillXpMulti * coralMulti
    * purrmepMulti * talentMulti * companionMulti * additiveMulti;

  return treeResult(value, [
    node('Divinity Style Base EXP/hr', styleBase, [
      node('Style Index', style, null, { fmt: 'raw' }),
    ], { fmt: 'raw' }),
    node('Gem Shop Divinity Sparkie', gemMulti, null, { fmt: 'x' }),
    node(label('Legend', 15), legendMulti, null, { fmt: 'x' }),
    node('All Skill EXP Multiplier', allSkillXpMulti, null, { fmt: 'x' }),
    node('Coral Kid Divinity EXP', coralMulti, null, { fmt: 'x' }),
    node('Purrmep Major Bonus', purrmepMulti, null, { fmt: 'x' }),
    node(label('Talent', 506), talentMulti, null, { fmt: 'x' }),
    node(label('Companion', 16), companionMulti, null, { fmt: 'x' }),
    node('Divinity EXP Sources', additiveMulti, [
      node('Divinity Rank', rankBonus, null, { fmt: 'raw' }),
      node('Post Office: Box of Gosh', box22c, null, { fmt: 'raw' }),
      node(label('Sigil', 22), sigil22, null, { fmt: 'raw' }),
      node(label('Card', 'w5a5'), cardW5a5, null, { fmt: 'raw' }),
      node('Stamps: Divinity EXP', stampDivineExp, null, { fmt: 'raw' }),
      node(label('Bubble', 'M3'), bubbleM3, null, { fmt: 'raw' }),
      node(label('Statue', 23), statue23, null, { fmt: 'raw' }),
      node('Meals: Divinity EXP', mealDivExp, null, { fmt: 'raw' }),
      node('Vial: Divinity EXP', vialDivXP, null, { fmt: 'raw' }),
      node(label('Talent', 464), talent464, null, { fmt: 'raw' }),
      node('W5 Task Bonus', taskBonus, null, { fmt: 'raw' }),
      node('Rift Skill Bonus', rift13, null, { fmt: 'raw' }),
      node(label('Star Sign', 62), starSign62, null, { fmt: 'raw' }),
      node(label('Guild', 14), guild14, null, { fmt: 'raw' }),
      node(label('Arcade', 37), arcade37, null, { fmt: 'raw' }),
      node(label('EtcBonus', 74), etc74, null, { fmt: 'raw' }),
      node(label('Voting', 23), voting23, null, { fmt: 'raw' }),
      node('Magma Equipment Set', magmaSet, null, { fmt: 'raw' }),
      node(label('Vault', 72), vault72, null, { fmt: 'raw' }),
    ], { fmt: 'x' }),
  ]);
}