// ===== SKILL EXP MULTIPLIER DESCRIPTOR =====
// Covers all skill EXP multipliers dispatched from ExpMulti(e).
// Each skill calls SkillStats("XyzEXPmulti") which uses AllSkillxpz + AllSkillxpMULTI
// plus per-skill stamps, talents, cards, etc.
// Scope: character + skill type.

import { goldFoodBonuses } from '../systems/common/goldenFood.js';
import { companions } from '../systems/common/companions.js';
import { vault } from '../systems/common/vault.js';
import { cardLv } from '../systems/common/cards.js';
import { votingBonusz } from '../systems/w2/voting.js';
import { getBribeBonus } from '../systems/w3/bribe.js';
import { label } from '../entity-names.js';
import { etcBonus } from '../systems/common/etcBonus.js';
import { talent } from '../systems/common/talent.js';
import { arcade } from '../systems/w2/arcade.js';
import {
  computeCardBonusByType, computeBoxReward, computeMealBonus,
  computeStatueBonusGiven, computeTotalStat
} from '../systems/common/stats.js';
import {
  computeBonusLineWidth, computeBubonicGreen, computeChipBonus, mainframeBonus
} from '../systems/w4/lab.js';
import { fishingToolkitDataAvailable, klaData } from '../../save/data.js';
import { HolesInfo, MapAFKtarget, MapDetails } from '../data/game/customlists.js';
import { MONSTERS } from '../data/game/monsters.js';
import {
  rval, safe, computeAllBaseSkillEff, computeAllEfficiencies,
  computeAllSkillxpz, computeAllSkillxpMULTI
} from './skill-helpers.js';
import { computeCalcTalent, computeFishingToolkitStat } from '../systems/common/calcTalent.js';
import { computeStampBonusOfTypeX } from '../systems/w1/stamp.js';
import { computeKillroyBonus, computeRiftSkillBonus } from '../systems/w4/rift.js';
import { computeTrapMGBonus } from '../systems/w3/trapping.js';
import { computeVialByKey, bubbleValByKey, sigilBonus } from '../systems/w2/alchemy.js';
import { achieveStatus } from '../systems/common/achievement.js';
import { computeRooBonus, rogBonusQTY } from '../systems/w7/sushi.js';
import {
  computePositiveStarSignMultiplier, computeStarSignBonus,
  getEnabledStarSigns, isStarSignActive
} from '../systems/common/starSign.js';
import { computeExoticBonus } from '../systems/w6/farming.js';
import {
  chapterBonus, computePaletteBonus, legendPTSbonus, shopUpgBonus
} from '../systems/w7/spelunking.js';
import { getSetBonus } from '../systems/w3/setBonus.js';
import { gambitPTSmulti } from '../systems/w5/hole.js';
import { zenithMarketPerLevel } from '../data/w5/sailing.js';
import { getLOG } from '../../formulas.js';
import { computeDivinityExpPerHour } from '../systems/w5/divinity-rate.js';
import { createDescriptor } from './helpers.js';

function _num(value) {
  if (value && typeof value === 'object') {
    if (value.val != null) return Number(value.val) || 0;
    if (value.total != null) return Number(value.total) || 0;
    if (value.computed != null) return Number(value.computed) || 0;
  }
  return Number(value) || 0;
}

function _cardBonus(typeId, ci, saveData, options) {
  return _num(safe(computeCardBonusByType, typeId, ci, saveData, options));
}

function _skillCardBonus(typeId, skillIdx, ci, saveData) {
  var passive = safe(computeRiftSkillBonus, skillIdx, 2, saveData) > 0;
  return _cardBonus(typeId, ci, saveData, passive ? { passive: true } : undefined);
}

function _boxReward(ci, key) {
  return _num(safe(computeBoxReward, ci, key));
}

function _stampBonus(type, ci, saveData) {
  return _num(safe(computeStampBonusOfTypeX, type, saveData, ci));
}

function _vote(voteIdx, ctx) {
  var votingMulti = 1;
  try { votingMulti = Number(ctx.resolve('voting-multi').val) || 1; } catch(e) {}
  return safe(votingBonusz, voteIdx, votingMulti, ctx.saveData);
}

function _activeStarSignBonus(signIdx, base, ci, saveData) {
  var enabled = getEnabledStarSigns(saveData);
  if (!isStarSignActive(signIdx, ci, enabled, saveData)) return 0;
  return base * computePositiveStarSignMultiplier(ci, saveData);
}

function _allProwess(ci, ctx) {
  var saveData = ctx.saveData;
  var prowessMulti = _num(safe(bubbleValByKey, 'ProwessMulti', ci, saveData));
  var skillProw = _activeStarSignBonus(25, 2, ci, saveData);
  var mealProwess = _num(safe(computeMealBonus, 'Sprow', saveData, ci));
  return Math.max(0, Math.min(0.1,
    (prowessMulti - 1) / 10 + 0.001 * skillProw + 0.0005 * mealProwess));
}

function _talentCalc146(ci, ctx) {
  var saveData = ctx.saveData;
  var perMob = rval(talent, 146, ctx);
  if (perMob <= 0) return 0;
  var cap = rval(talent, 146, ctx, { tab: 2 });
  var killsLeft = klaData[ci] || [];
  var mobsAtMillion = 0;
  var mapCount = Math.min(MapAFKtarget.length, killsLeft.length);
  for (var mapIdx = 0; mapIdx < mapCount; mapIdx++) {
    var monster = MONSTERS[MapAFKtarget[mapIdx]];
    if (!monster || monster.AFKtype !== 'FIGHTING') continue;
    var killReq = Number(MapDetails[mapIdx] && MapDetails[mapIdx][0] && MapDetails[mapIdx][0][0]) || 0;
    var row = killsLeft[mapIdx];
    var remaining = Number(Array.isArray(row) ? row[0] : row) || 0;
    if (killReq - remaining >= 1e6) mobsAtMillion++;
  }
  return perMob * Math.min(mobsAtMillion, cap);
}

function _cookingEfficiency(ci, ctx, talentCalc146) {
  var saveData = ctx.saveData;
  var totalSTR = computeTotalStat('STR', ci, ctx).computed;
  var allEfficiencies = computeAllEfficiencies(ci, ctx);
  var allBaseSkillEff = computeAllBaseSkillEff(ci, ctx);
  var talent85 = rval(talent, 85, ctx);
  var talent142 = rval(talent, 142, ctx);
  var etc62 = rval(etcBonus, '62', ctx);
  var etc67 = rval(etcBonus, '67', ctx);
  var stampCookingEff = _stampBonus('CookingEff', ci, saveData);
  var riftProwess = 10 * safe(computeRiftSkillBonus, 9, 1, saveData);
  var box19a = _boxReward(ci, '19a');
  return allEfficiencies * (1 + (talentCalc146 + talent85 + etc67) / 100) * (
    250 + Math.pow(totalSTR, 0.6) * (1 + talent142 / 100)
      + stampCookingEff + etc62 + riftProwess + box19a + allBaseSkillEff
  );
}

function _laboratoryEfficiency(ci, ctx) {
  var saveData = ctx.saveData;
  var totalWIS = computeTotalStat('WIS', ci, ctx).computed;
  var allEfficiencies = computeAllEfficiencies(ci, ctx);
  var allBaseSkillEff = computeAllBaseSkillEff(ci, ctx);
  var talent532 = rval(talent, 532, ctx);
  var talent538 = rval(talent, 538, ctx);
  var talent445 = rval(talent, 445, ctx);
  var etc63 = rval(etcBonus, '63', ctx);
  var etc66 = rval(etcBonus, '66', ctx);
  var box15a = _boxReward(ci, '15a');
  var riftProwess = 10 * safe(computeRiftSkillBonus, 11, 1, saveData);
  return allEfficiencies * (
    200 + Math.pow(totalWIS, 0.6) * (1 + talent532 / 100)
      + etc63 + allBaseSkillEff + box15a
  ) * (1 + (talent538 + etc66 + riftProwess) / 100)
    * (1 + talent445 / 100);
}

function _resolvedSkillEfficiency(ci, ctx, fallback, fallbackArg) {
  try {
    if (ctx.resolve) {
      var result = ctx.resolve('skill-efficiency');
      if (!result.unavailable && Number.isFinite(Number(result.val))) return Number(result.val);
    }
  } catch(e) {}
  return fallback(ci, ctx, fallbackArg);
}

function _lampBonus(tier, bonusIdx, saveData) {
  var bases = [[25, 10, 8], [15, 40, 10], [20, 35, 12], [5, 1, 1], [2, 2, 2]];
  var lampLv = Number(saveData.holesData && saveData.holesData[21]
    && saveData.holesData[21][Math.min(11, 4 + 2 * tier)]) || 0;
  var zenithLv = Number(saveData.spelunkData && saveData.spelunkData[45]
    && saveData.spelunkData[45][2]) || 0;
  var zenith = Math.floor(zenithMarketPerLevel(2) * zenithLv);
  return (Number(bases[tier] && bases[tier][bonusIdx]) || 0) * lampLv * (1 + zenith / 100);
}

function _gambitBonus(idx, saveData) {
  var scores = saveData.holesData && saveData.holesData[11];
  if (!Array.isArray(scores)) return 0;
  var rawPoints = 0;
  for (var scoreIdx = 0; scoreIdx < 6; scoreIdx++) {
    var score = Number(scores[65 + scoreIdx]) || 0;
    var base = score + 3 * Math.floor(score / 10) + 10 * Math.floor(score / 60);
    rawPoints += (scoreIdx === 0 ? 100 : 200) * base;
  }
  var totalPoints = rawPoints * gambitPTSmulti(saveData, saveData);
  var required = 2000 + 1000 * (idx + 1) * (1 + idx / 5) * Math.pow(1.26, idx);
  if (totalPoints < required) return 0;
  var parts = String(HolesInfo[71] && HolesInfo[71][idx] || '0|0').split('|');
  var bonus = Number(parts[0]) || 0;
  return Number(parts[1]) === 1 ? bonus * getLOG(totalPoints) : bonus;
}

function _computeCookingExp(ci, ctx) {
  var saveData = ctx.saveData;
  var allSkillxpz = computeAllSkillxpz(ci, ctx);
  var allSkillxpMULTI = computeAllSkillxpMULTI(ctx);
  var talentCalc146 = _talentCalc146(ci, ctx);
  var cookingEfficiency = _resolvedSkillEfficiency(
    ci, ctx, _cookingEfficiency, talentCalc146
  );
  var cookingDefence = Number(MONSTERS.Cooking && MONSTERS.Cooking.Defence) || 0;
  var prowess = _allProwess(ci, ctx);
  var efficiencyTerm = Math.min(Math.pow(
    cookingEfficiency / (10 * cookingDefence), 0.25 + prowess
  ), 1);
  var calcTalent = safe(computeCalcTalent, 42, 9, ci, saveData);
  var mealCookExp = _num(safe(computeMealBonus, 'CookExp', saveData, ci));
  var box19b = _boxReward(ci, '19b');
  var card85 = _skillCardBonus(85, 9, ci, saveData);
  var talent104 = rval(talent, 104, ctx);
  var statue20 = _num(safe(computeStatueBonusGiven, 20, ci, saveData));
  var riftBonus9 = 25 * safe(computeRiftSkillBonus, 9, 0, saveData);
  var voting13 = _vote(13, ctx);
  var vault60 = rval(vault, 60, ctx);
  var perSkill = mealCookExp + box19b + card85 + talentCalc146 + talent104
    + statue20 + riftBonus9 + voting13;
  var val = Math.max(0.1, allSkillxpMULTI * (1 + vault60 / 100) * (
    efficiencyTerm + (allSkillxpz + calcTalent + perSkill) / 100
  ));
  return {
    val: val,
    children: [
      { name: 'Cooking Efficiency', val: cookingEfficiency, fmt: 'raw' },
      { name: 'Efficiency Term', val: efficiencyTerm, fmt: 'raw' },
      { name: 'Skill EXP Multi (all)', val: allSkillxpMULTI, fmt: 'x' },
      { name: label('Vault', 60), val: 1 + vault60 / 100, fmt: 'x' },
      { name: 'Shared Skill EXP', val: allSkillxpz, fmt: 'raw' },
      { name: 'Cooking sources', val: perSkill + calcTalent, fmt: 'raw' },
    ],
  };
}

function _computeLaboratoryExp(ci, ctx) {
  var saveData = ctx.saveData;
  var laboratoryEfficiency = _resolvedSkillEfficiency(
    ci, ctx, _laboratoryEfficiency
  );
  var laboratoryDefence = Number(MONSTERS.Laboratory && MONSTERS.Laboratory.Defence) || 0;
  var prowess = _allProwess(ci, ctx);
  var ratio = laboratoryEfficiency / (10 * laboratoryDefence);
  var prowessYield = Math.pow(ratio, 0.25 + prowess);
  var belowProwessCap = prowessYield < 1;
  var yieldFactor = belowProwessCap
    ? Math.pow(ratio, 0.25)
    : Math.floor(Math.max(prowessYield, 1));

  var box15b = _boxReward(ci, '15b');
  var card79 = _skillCardBonus(79, 11, ci, saveData);
  var chipLabExp = safe(computeChipBonus, 'labexp', ci);
  var bubonicGreen = safe(computeBubonicGreen, ci, saveData);
  var talent538 = rval(talent, 538, ctx);
  var talent464 = belowProwessCap ? 0 : rval(talent, 464, ctx);
  var mainframe102 = safe(mainframeBonus, 102, saveData);
  var mealLabExp = _num(safe(computeMealBonus, 'Lexp', saveData, ci));
  var stampLabExp = _stampBonus('LabExp', ci, saveData);
  var vialLabXP = _num(safe(computeVialByKey, 'LabXP', saveData, ci));
  var bubbleLabXP = _num(safe(bubbleValByKey, 'LabXpACTIVE', ci, saveData));
  var bonusLineWidth = Math.min(100, 4 * safe(computeBonusLineWidth, ci, saveData));
  var etc65 = rval(etcBonus, '65', ctx);
  var sigil19 = safe(sigilBonus, 19, saveData, ci);
  var riftBonus11 = 25 * safe(computeRiftSkillBonus, 11, 0, saveData);
  var starSign60 = _activeStarSignBonus(60, 20, ci, saveData);
  var arcade29 = rval(arcade, 29, ctx);
  var voting31 = _vote(31, ctx);
  var lamp02 = _lampBonus(0, 2, saveData);
  var vault55 = rval(vault, 55, ctx);
  var magmaSet = _num(safe(getSetBonus, 'MAGMA_SET', ci));
  var palette27 = safe(computePaletteBonus, 27, saveData);
  var sources = box15b + card79 + chipLabExp + bubonicGreen + talent538 + talent464
    + mainframe102 + mealLabExp + stampLabExp + vialLabXP + bubbleLabXP
    + bonusLineWidth + etc65 + sigil19 + riftBonus11 + starSign60
    + arcade29 + voting31 + lamp02 + vault55 + magmaSet + palette27;

  var allSkillxpMULTI = computeAllSkillxpMULTI(ctx);
  var companion16 = safe(companions, 16, saveData);
  var legend15 = safe(legendPTSbonus, 15, saveData);
  var roo43 = safe(rogBonusQTY, 43, Number(saveData.cachedUniqueSushi) || 0);
  var sourceMultiplier = (1 + companion16) * (1 + legend15 / 100)
    * (1 + roo43 / 100) * (1 + sources / 100);
  var val = Math.max(0.1, yieldFactor * allSkillxpMULTI * sourceMultiplier);
  return {
    val: val,
    children: [
      { name: 'Laboratory Efficiency', val: laboratoryEfficiency, fmt: 'raw' },
      { name: belowProwessCap ? 'Fourth-root efficiency gate' : 'Prowess yield (floored)', val: yieldFactor, fmt: 'raw' },
      { name: 'Skill EXP Multi (all)', val: allSkillxpMULTI, fmt: 'x' },
      { name: 'Laboratory sources', val: sources, fmt: 'raw' },
    ],
  };
}

function _computeSpelunkingExp(ci, ctx) {
  var saveData = ctx.saveData;
  var gambit14 = _gambitBonus(14, saveData);
  var rift18 = 25 * safe(computeRiftSkillBonus, 18, 0, saveData);
  var exotic47 = safe(computeExoticBonus, 47, saveData);
  var passiveCard97 = _cardBonus(97, ci, saveData, { passive: true });
  var chapter11 = safe(chapterBonus, 1, 1, saveData);
  var chapter31 = safe(chapterBonus, 3, 1, saveData);
  var skillSources = rift18 + exotic47 + passiveCard97 + chapter11 + chapter31;

  var killroy5 = safe(computeKillroyBonus, 5, saveData);
  var arcade56 = rval(arcade, 56, ctx);
  var allSkillxpMULTI = computeAllSkillxpMULTI(ctx);
  var shop45 = safe(shopUpgBonus, 45, saveData);
  var goldenFood = _num(safe(goldFoodBonuses, 'SpelunkEXPz', ci, undefined, saveData));
  var mealSplkExp = _num(safe(computeMealBonus, 'SplkExp', saveData, ci));
  var stampSpelunk = _stampBonus('spelunkxp', ci, saveData);
  var statue30 = _num(safe(computeStatueBonusGiven, 30, ci, saveData));
  var spelunkSources = shop45 + goldenFood + mealSplkExp + stampSpelunk + statue30;
  var allSkillxpz = computeAllSkillxpz(ci, ctx);
  var prehistoric = _num(safe(getSetBonus, 'PREHISTORIC_SET', ci));

  var product = (1 + skillSources / 100)
    * (1 + (killroy5 + arcade56) / 100)
    * allSkillxpMULTI
    * (1 + spelunkSources / 100)
    * (1 + allSkillxpz / 1000)
    * (1 + Math.min(1, prehistoric / 100));
  var val = Math.max(1, gambit14 / 100 + product);
  return {
    val: val,
    children: [
      { name: 'Gambit 14', val: gambit14 / 100, fmt: 'raw' },
      { name: 'Spelunking skill sources', val: skillSources, fmt: 'raw' },
      { name: 'Killroy and Arcade', val: 1 + (killroy5 + arcade56) / 100, fmt: 'x' },
      { name: 'Skill EXP Multi (all)', val: allSkillxpMULTI, fmt: 'x' },
      { name: 'Spelunking EXP sources', val: spelunkSources, fmt: 'raw' },
      { name: 'Shared Skill EXP', val: allSkillxpz, fmt: 'raw' },
    ],
  };
}

function _statusFor(skillType, ci, saveData) {
  var missing = [];
  if (saveData.companionDataAvailable === false) missing.push('companion ownership');
  if (skillType !== 'Spelunking' && saveData.activeVoteDataAvailable === false) {
    missing.push('current server vote');
  }
  if (skillType === 'Fishing' && fishingToolkitDataAvailable[ci] !== true) {
    missing.push('PVFishingToolkit_' + ci);
  }
  return missing.length ? {
    partial: true,
    reason: 'Missing required save metadata: ' + missing.join(', ') + '.',
  } : {};
}

// Per-skill EXP config. Each skill's EXP multiplier formula is:
// AllSkillxpMULTI * (1 + (perSkillSources) / 100 + (AllSkillxpz + CalcTalent) / 100)
// (with some variations per skill — see game source SkillStats("XyzEXPmulti"))
var SKILL_EXP_CONFIG = {
  Mining: {
    skillLvIdx: 1,
    calcTalentRow: [42, 0],
    sources: function(ci, ctx) {
      // Game: T104 + StampMinExp + CardBonus(25) + SkillageDN(MinFishEXP) + T75 + Arcade(3)
      //   + Achieve(27) + etc55 + 25*RiftSkill(0) + Voting(7)
      var s = ctx.saveData;
      var talent104 = rval(talent, 104, ctx);
      var stampMinExp = _stampBonus('MinExp', ci, ctx.saveData);
      var card25 = _skillCardBonus(25, 0, ci, ctx.saveData);
      // SkillageDN: MinFishEXP bubble, doubled if mining level < fishing level
      var miningLv = Number(s.lv0AllData && s.lv0AllData[ci] && s.lv0AllData[ci][1]) || 0;
      var fishingLv = Number(s.lv0AllData && s.lv0AllData[ci] && s.lv0AllData[ci][4]) || 0;
      var minFishEXP = safe(bubbleValByKey, 'MinFishEXP', ci, ctx.saveData);
      var skillageDN = miningLv < fishingLv ? 2 * minFishEXP : minFishEXP;
      var talent75 = rval(talent, 75, ctx);
      var arcade3 = rval(arcade, 3, ctx);
      var ach27 = safe(achieveStatus, 27, ctx.saveData);
      var etc55 = rval(etcBonus, '55', ctx);
      var riftBonus0 = 25 * safe(computeRiftSkillBonus, 0, 0, ctx.saveData);
      var voting7 = _vote(7, ctx);
      return talent104 + stampMinExp + card25 + skillageDN + talent75 + arcade3
        + ach27 + etc55 + riftBonus0 + voting7;
    },
  },
  Choppin: {
    skillLvIdx: 3,
    calcTalentRow: [42, 2],
    clamp: false,
    sources: function(ci, ctx) {
      // Game: T464 + StampChopExp + AlchBubbles.ChopAlchEXP + CardBonus(28) + T75
      //   + Achieve(4) + 25*RiftSkill(2) + Voting(9)
      var talent464 = rval(talent, 464, ctx);
      var stampChopExp = _stampBonus('ChopExp', ci, ctx.saveData);
      var chopAlchEXP = safe(bubbleValByKey, 'ChopAlchEXP', ci, ctx.saveData);
      var card28 = _skillCardBonus(28, 2, ci, ctx.saveData);
      var talent75 = rval(talent, 75, ctx);
      var ach4 = safe(achieveStatus, 4, ctx.saveData);
      var riftBonus2 = 25 * safe(computeRiftSkillBonus, 2, 0, ctx.saveData);
      var voting9 = _vote(9, ctx);
      return talent464 + stampChopExp + chopAlchEXP + card28 + talent75
        + ach4 + riftBonus2 + voting9;
    },
  },
  Fishing: {
    skillLvIdx: 4,
    calcTalentRow: [42, 3],
    sources: function(ci, ctx) {
      // Game: FishingToolkit("EXP") + T117 + T104 + SkillageDN(MinFishEXP, 2× if fish<mine)
      //   + CardBonus(31) + StampFishExp + T75 + Arcade(4) + Achieve(117) + etc49
      //   + 25*RiftSkill(3) + 25*Bribe(29) + Roo(2) + Voting(8) + Vault(30)
      var s = ctx.saveData;
      var fishToolkitEXP = computeFishingToolkitStat('EXP', ci);
      var talent117 = rval(talent, 117, ctx);
      var talent104 = rval(talent, 104, ctx);
      // SkillageDN: MinFishEXP bubble, doubled if fishing level < mining level
      var miningLv = Number(s.lv0AllData && s.lv0AllData[ci] && s.lv0AllData[ci][1]) || 0;
      var fishingLv = Number(s.lv0AllData && s.lv0AllData[ci] && s.lv0AllData[ci][4]) || 0;
      var minFishEXP = safe(bubbleValByKey, 'MinFishEXP', ci, ctx.saveData);
      var skillageDN = fishingLv < miningLv ? 2 * minFishEXP : minFishEXP;
      var card31 = _skillCardBonus(31, 3, ci, ctx.saveData);
      var stampFishExp = _stampBonus('FishExp', ci, ctx.saveData);
      var talent75 = rval(talent, 75, ctx);
      var arcade4 = rval(arcade, 4, ctx);
      var ach117 = safe(achieveStatus, 117, ctx.saveData);
      var etc49 = rval(etcBonus, '49', ctx);
      var riftBonus3 = 25 * safe(computeRiftSkillBonus, 3, 0, ctx.saveData);
      var bribe29 = 25 * safe(getBribeBonus, '29', ctx.saveData);
      var roo2 = safe(computeRooBonus, 2, ctx.saveData);
      var voting8 = _vote(8, ctx);
      var vault30 = rval(vault, 30, ctx);
      return fishToolkitEXP + talent117 + talent104 + skillageDN + card31 + stampFishExp
        + talent75 + arcade4 + ach117 + etc49 + riftBonus3 + bribe29 + roo2 + voting8 + vault30;
    },
  },
  Catching: {
    skillLvIdx: 6,
    calcTalentRow: [42, 5],
    sources: function(ci, ctx) {
      // Game: T265 + T297 + CardBonus(40) + StampCatchExp + T75 + Arcade(9)
      //   + Achieve(107) + 25*RiftSkill(5) + Voting(10) + Vault(29)
      var talent265 = rval(talent, 265, ctx);
      var talent297 = rval(talent, 297, ctx);
      var card40 = _skillCardBonus(40, 5, ci, ctx.saveData);
      var stampCatchExp = _stampBonus('CatchExp', ci, ctx.saveData);
      var talent75 = rval(talent, 75, ctx);
      var arcade9 = rval(arcade, 9, ctx);
      var ach107 = safe(achieveStatus, 107, ctx.saveData);
      var riftBonus5 = 25 * safe(computeRiftSkillBonus, 5, 0, ctx.saveData);
      var voting10 = _vote(10, ctx);
      var vault29 = rval(vault, 29, ctx);
      return talent265 + talent297 + card40 + stampCatchExp + talent75
        + arcade9 + ach107 + riftBonus5 + voting10 + vault29;
    },
  },
  Smithing: {
    skillLvIdx: 2,
    calcTalentRow: [42, 1],
    // Smithing has a UNIQUE formula — NOT AllSkillxpMULTI * (1 + sources/100 + ...)
    // Game: (1+(T265+StampSmithExp+T75+25*RiftSkill(1))/100) × (1+(4*CardLv(ForgeA)+7*CardLv(ForgeB))/100)
    //     × (1+BoxSmithExp/100) + (AllSkillxpz+CalcTalent[42][1])/100
    customCombine: function(ci, ctx) {
      var s = ctx.saveData;
      var talent265 = rval(talent, 265, ctx);
      var stampSmithExp = _stampBonus('SmithExp', ci, ctx.saveData);
      var talent75 = rval(talent, 75, ctx);
      var riftBonus1 = 25 * safe(computeRiftSkillBonus, 1, 0, ctx.saveData);
      var part1 = 1 + (talent265 + stampSmithExp + talent75 + riftBonus1) / 100;
      var forgeA = safe(cardLv, 'ForgeA', ctx.saveData);
      var forgeB = safe(cardLv, 'ForgeB', ctx.saveData);
      var part2 = 1 + (4 * forgeA + 7 * forgeB) / 100;
      var _brSE = safe(computeBoxReward, ci, 'SmithExp');
      var boxSmithExp = (typeof _brSE === 'object' && _brSE) ? (_brSE.val || 0) : Number(_brSE) || 0;
      var part3 = 1 + boxSmithExp / 100;
      var allSkillxpz = computeAllSkillxpz(ci, ctx);
      var calcTalent = safe(computeCalcTalent, 42, 1, ci, ctx.saveData);
      return Math.max(0.1, part1 * part2 * part3 + (allSkillxpz + calcTalent) / 100);
    },
    sources: null, // uses customCombine instead
  },
  Trapping: {
    skillLvIdx: 7,
    calcTalentRow: [42, 6],
    sources: function(ci, ctx) {
      var talent312 = rval(talent, 312, ctx);
      var talent265 = rval(talent, 265, ctx);
      var talent75 = rval(talent, 75, ctx);
      var stampTrapExp = _stampBonus('TrappingExp', ci, ctx.saveData);
      var card58 = _skillCardBonus(58, 6, ci, ctx.saveData);
      var _br16b = safe(computeBoxReward, ci, '16b');
      var boxTrap = (typeof _br16b === 'object' && _br16b) ? (_br16b.val || 0) : Number(_br16b) || 0;
      var trapMG0 = safe(computeTrapMGBonus, 0, ctx.saveData);
      var trapMG3 = safe(computeTrapMGBonus, 3, ctx.saveData);
      var arcade14 = rval(arcade, 14, ctx);
      var riftBonus6 = 25 * safe(computeRiftSkillBonus, 6, 0, ctx.saveData);
      var voting30 = _vote(30, ctx);
      return talent312 + talent265 + talent75 + stampTrapExp + card58
        + boxTrap + trapMG0 + trapMG3 + arcade14 + riftBonus6 + voting30;
    },
  },
  Worship: {
    skillLvIdx: 9,
    calcTalentRow: [42, 8],
    sources: function(ci, ctx) {
      // Game: Lv0[9]/3 + T477 + T464 + T75 + StarSigns.WorshExp + 25*RiftSkill(8) + Voting(30)
      var s = ctx.saveData;
      var worshipLv = Number(s.lv0AllData && s.lv0AllData[ci] && s.lv0AllData[ci][9]) || 0;
      var talent477 = rval(talent, 477, ctx);
      var talent464 = rval(talent, 464, ctx);
      var talent75 = rval(talent, 75, ctx);
      var starSignWorshExp = safe(computeStarSignBonus, 'WorshExp', ci, ctx.saveData);
      var riftBonus8 = 25 * safe(computeRiftSkillBonus, 8, 0, ctx.saveData);
      var voting30 = _vote(30, ctx);
      return worshipLv / 3 + talent477 + talent464 + talent75
        + starSignWorshExp + riftBonus8 + voting30;
    },
  },
  Cooking: {
    skillLvIdx: 10,
    calcTalentRow: [42, 9],
    // Game: max(0.1, AllSkillxpMULTI × (1+Vault(60)/100) × (
    //   min(pow(CookEff/(10×CookDef), 0.25+ProwessALL), 1)
    //   + (AllSkillxpz + CalcTalent[42][9] + MealCookExp + Box19b + Card85
    //      + TalentCalc(146) + T104 + Statue20 + 25*RiftSkill(9) + Voting(13)) / 100 ))
    // CookDef = 100 (MONSTERS.Cooking.Defence)
    // TalentCalc(146) = GetTalentNumber(1,146)*min(mobsWith1MKills, GetTalentNumber(2,146))
    customCombine: function(ci, ctx) {
      return _computeCookingExp(ci, ctx);
    },
    sources: null,
  },
  Laboratory: {
    skillLvIdx: 12,
    calcTalentRow: null,
    customCombine: function(ci, ctx) {
      return _computeLaboratoryExp(ci, ctx);
    },
    sources: null,
  },
  Divinity: {
    skillLvIdx: 14,
    calcTalentRow: null,
    customCombine: function(ci, ctx) {
      var result = computeDivinityExpPerHour(ci, ctx);
      return { val: Number(result) || 0, children: result.children || null };
    },
    sources: null,
  },
  Spelunking: {
    skillLvIdx: 19,
    calcTalentRow: null,
    customCombine: function(ci, ctx) {
      return _computeSpelunkingExp(ci, ctx);
    },
    sources: null,
  },
  Breeding: {
    skillLvIdx: 11,
    calcTalentRow: null, // Breeding has its own formula
    sources: function(ci, ctx) {
      var talent372 = rval(talent, 372, ctx, { mode: 'max' });
      var mf105 = safe(mainframeBonus, 105, ctx.saveData);
      var mealBrExp = safe(computeMealBonus, 'BrExp', ctx.saveData, ci);
      var breedCount = Number(ctx.saveData.breedingData && ctx.saveData.breedingData[2] && ctx.saveData.breedingData[2][0]) || 0;
      var cardW4a2 = Math.min(5 * safe(cardLv, 'w4a2', ctx.saveData), 50);
      var stampBreedExp = _stampBonus('BreedExp', ci, ctx.saveData);
      var vialBreedXP = safe(computeVialByKey, 'BreedXP', ctx.saveData, ci);
      var statue21 = safe(computeStatueBonusGiven, 21, ci, ctx.saveData);
      var riftBonus10 = 25 * safe(computeRiftSkillBonus, 10, 0, ctx.saveData);
      var voting16 = _vote(16, ctx);
      var vault59 = rval(vault, 59, ctx);
      return talent372 + mf105 + mealBrExp + 2 * breedCount + cardW4a2
        + stampBreedExp + vialBreedXP + statue21 + riftBonus10 + voting16 + vault59;
    },
  },
};

export default createDescriptor({
  id: 'skill-exp',
  name: 'Skill EXP Multiplier',
  scope: 'character+map',
  category: 'multiplier',

  combine: function(pools, ctx) {
    var s = ctx.saveData;
    if (!s) return { val: 1, children: null };
    var ci = ctx.charIdx || 0;
    var skillType = ctx.skillType || 'Mining';

    var sk = SKILL_EXP_CONFIG[skillType];
    if (!sk) return {
      val: 0,
      children: null,
      unavailable: true,
      reason: skillType + ' EXP is not implemented in this calculator.',
    };

    // Skills with source-specific formulas bypass the standard SkillStats combine.
    if (sk.customCombine) {
      var customResult = sk.customCombine(ci, ctx);
      var status = _statusFor(skillType, ci, s);
      if (typeof customResult === 'object' && customResult && 'val' in customResult) {
        return Object.assign({}, customResult, status);
      }
      var val = customResult;
      if (val !== val || val == null) val = 1;
      return Object.assign({
        val: val,
        children: [{ name: skillType + ' EXP Multiplier', val: val, fmt: 'raw' }],
      }, status);
    }

    var allSkillxpz = computeAllSkillxpz(ci, ctx);
    var allSkillxpMULTI = computeAllSkillxpMULTI(ctx);
    var perSkillSources = sk.sources(ci, ctx);

    // CalcTalentMAP contribution
    var calcTalent = 0;
    if (sk.calcTalentRow) {
      calcTalent = safe(computeCalcTalent, sk.calcTalentRow[0], sk.calcTalentRow[1], ci, ctx.saveData);
    }

    var rawVal = allSkillxpMULTI * (1 + (perSkillSources + allSkillxpz + calcTalent) / 100);
    var val = sk.clamp === false ? rawVal : Math.max(0.1, rawVal);

    if (val !== val || val == null) val = 1;

    var children = [];
    children.push({ name: 'Skill EXP Multi (all)', val: allSkillxpMULTI, fmt: 'x' });
    children.push({ name: 'Shared Skill EXP', val: allSkillxpz, fmt: 'raw' });
    children.push({ name: skillType + ' specific sources', val: perSkillSources, fmt: 'raw' });
    if (calcTalent > 0) children.push({ name: skillType + ' Talent Bonus', val: calcTalent, fmt: 'raw' });

    return Object.assign({
      val: val,
      children: children,
    }, _statusFor(skillType, ci, s));
  }
});
