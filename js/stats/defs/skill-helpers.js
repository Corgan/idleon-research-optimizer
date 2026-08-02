// ===== SHARED SKILL STAT HELPERS =====
// Implements the shared SkillStats functions used across all skill efficiency/EXP descriptors:
// - AllEfficiencies: shared multiplier for all skill efficiencies
// - AllBaseSkillEff: flat base efficiency shared across skills
// - AllSkillxpz: additive skill EXP shared pool
// - AllSkillxpMULTI: multiplicative skill EXP shared pool

import { goldFoodBonuses } from '../systems/common/goldenFood.js';
import { companion } from '../systems/common/companions.js';
import { cardLv } from '../systems/common/cards.js';
import { getSetBonus } from '../systems/w3/setBonus.js';
import { computeBubonicGreen, computeChipBonus, mainframeBonus } from '../systems/w4/lab.js';
import { tome } from '../systems/w4/tome.js';
import { guild } from '../systems/common/guild.js';
import { friend } from '../systems/common/friend.js';
import { arcade } from '../systems/w2/arcade.js';
import { achieveStatus } from '../systems/common/achievement.js';
import { legendPTSbonus } from '../systems/w7/spelunking.js';
import { computeCardBonusByType, computeBoxReward, computeTotalStat } from '../systems/common/stats.js';
import { computeShinyBonusS } from '../systems/w4/breeding.js';
import { winBonus } from '../systems/w6/summoning.js';
import { computeMeritocBonusz } from '../systems/w7/meritoc.js';
import { etcBonus } from '../systems/common/etcBonus.js';
import { maxTalentBonus, talent } from '../systems/common/talent.js';
import { optionsListData } from '../../save/data.js';
import { AlchemyDescription } from '../data/game/customlists.js';
import { computeBUpg } from '../systems/w5/hole.js';
import { computeFamBonusQTYs, computeStatueBonusGiven, computeMealBonus } from '../systems/common/stats.js';
import { computeVialByKey, bubbleValByKey } from '../systems/w2/alchemy.js';
import { computeArtifactBonus } from '../systems/w5/sailing.js';
import { computeMSABonus } from '../systems/w4/gaming.js';
import { computePaletteBonus } from '../systems/w7/spelunking.js';
import { computeRiftSkillETC } from '../systems/w4/rift.js';
import { computeCardSetBonus } from '../systems/common/cards.js';
import { shrine, computeSaltLick } from '../systems/w3/construction.js';
import { computeFlurboShop } from '../systems/w2/dungeon.js';
import { computeDivinityMinor, computeDivinityBless } from '../systems/w5/divinity.js';
import { owl } from '../systems/w1/owl.js';
import { computeStarSignBonus } from '../systems/common/starSign.js';
import { computeStampBonusOfTypeX } from '../systems/w1/stamp.js';
import { computeAllShimmerBonuses } from '../systems/w3/equinox.js';
import { computePrayerReal as computePrayerRealSystem } from '../systems/w3/prayer.js';
import { getBuffBonus } from './helpers.js';
import maxHPDescriptor from './max-hp.js';
import maxMPDescriptor from './max-mp.js';

export function rval(resolver, id, ctx, args) {
  try { return resolver.resolve(id, ctx, args).val || 0; }
  catch(e) { return 0; }
}

export function safe(fn) {
  try {
    var args = [];
    for (var i = 1; i < arguments.length; i++) args.push(arguments[i]);
    var v = fn.apply(null, args);
    return (v !== v || v == null) ? 0 : v;
  } catch(e) { return 0; }
}

function num(value) {
  if (value && typeof value === 'object' && value.val != null) return Number(value.val) || 0;
  return Number(value) || 0;
}

export function computeCachedSkillBubble(key, ci, ctx) {
  var cache = computeFreshTalentCalcBubbleCache(ci, ctx);
  return num(bubbleValByKey(key, ci, ctx.saveData, {
    playerHPmax: cache.playerHPmax,
    playerMPmax: cache.playerMPmax,
  }));
}

function _stageContext(ctx, alchBubbles) {
  var staged = Object.create(ctx);
  staged.dnsmCache = {
    alchBubbles: alchBubbles,
    alchBubblesGFoodz: Object.prototype.hasOwnProperty.call(alchBubbles, 'GFoodz')
      ? Number(alchBubbles.GFoodz) || 0 : 0,
  };
  return staged;
}

function _firstPassBubble(key, ci, saveData, extra) {
  var options = Object.assign({ skipBigBubble: true }, extra || {});
  return num(bubbleValByKey(key, ci, saveData, options));
}

export function computeFreshTalentCalcBubbleCache(ci, ctx) {
  if (ctx._freshTalentCalcBubbleCache) return ctx._freshTalentCalcBubbleCache;
  var saveData = ctx.saveData;
  var hpBubbles = {
    TotalSTR: _firstPassBubble('TotalSTR', ci, saveData),
    Opassz: _firstPassBubble('Opassz', ci, saveData),
    MinEff: _firstPassBubble('MinEff', ci, saveData, { skipClassPass: true }),
  };
  var hpStage = maxHPDescriptor.combine({}, _stageContext(ctx, hpBubbles));
  var playerHPmax = Number(hpStage.val) || 0;

  var mpBubbles = {};
  for (var cauldron = 0; cauldron < 2; cauldron++) {
    var rows = AlchemyDescription[cauldron] || [];
    for (var index = 0; index < rows.length; index++) {
      var bubbleKey = rows[index] && rows[index][15];
      if (!bubbleKey) continue;
      var dynamic = bubbleKey === 'MinEff' ? { playerHPmax: playerHPmax } : null;
      mpBubbles[bubbleKey] = _firstPassBubble(bubbleKey, ci, saveData, dynamic);
    }
  }
  var purpleRows = AlchemyDescription[2] || [];
  for (var purpleIndex = 0; purpleIndex <= 2; purpleIndex++) {
    var purpleKey = purpleRows[purpleIndex] && purpleRows[purpleIndex][15];
    if (!purpleKey) continue;
    mpBubbles[purpleKey] = _firstPassBubble(purpleKey, ci, saveData,
      purpleIndex === 2 ? { skipClassPass: true } : null);
  }
  var mpStage = maxMPDescriptor.combine({}, _stageContext(ctx, mpBubbles));
  var playerMPmax = Number(mpStage.val) || 0;

  ctx._freshTalentCalcBubbleCache = {
    playerHPmax: playerHPmax,
    playerMPmax: playerMPmax,
    hpBubbles: hpBubbles,
    mpBubbles: mpBubbles,
  };
  return ctx._freshTalentCalcBubbleCache;
}

export function computePrayerReal(prayerIdx, costIdx, ci, saveData) {
  return num(computePrayerRealSystem(prayerIdx, costIdx, ci, saveData));
}

// AllEfficiencies: shared multiplier for ALL skill efficiencies
// 6 multiplicative groups
export function computeAllEfficiencies(ci, ctx) {
  var saveData = ctx.saveData;
  var familyBonuses = safe(computeFamBonusQTYs, ci, saveData);
  var famBonus42 = Number(familyBonuses && familyBonuses[42]) || 0;
  var etc48 = rval(etcBonus, '48', ctx);
  var vial6SkillEff = num(safe(computeVialByKey, '6SkillEff', saveData, ci));
  var artifactBonus15 = safe(computeArtifactBonus, 15, ci, ctx);
  var talent617 = rval(talent, 617, ctx);
  var questEff = Math.min(0.1 * (Number(saveData.totalQuestsComplete) || 0), talent617);
  var group1 = 1 + (famBonus42 + etc48 + vial6SkillEff + artifactBonus15 + questEff) / 100;

  var mealSeff = num(safe(computeMealBonus, 'Seff', saveData, ci));
  var talent646 = rval(talent, 646, ctx);
  var tomeBonus1 = rval(tome, 1, ctx);
  var paletteBonus10 = safe(computePaletteBonus, 10, saveData);
  var chipToteff = safe(computeChipBonus, 'toteff', ci);
  var cardCrystal4 = 3 * safe(cardLv, 'Crystal4', saveData);
  var friendStatz2 = rval(friend, 2, ctx);
  var riftSkillETC2 = safe(computeRiftSkillETC, 2, saveData);
  var holesB49_15 = computeBUpg(49, 15, saveData);
  var ola422 = Number(optionsListData[422]) || 0;
  var shimmerOla180 = Number(optionsListData[180]) || 0;
  var shimmerBonus = safe(computeAllShimmerBonuses, saveData);

  var group2 = 1 + (mealSeff + talent646 + tomeBonus1 + paletteBonus10 + chipToteff
    + cardCrystal4 + friendStatz2 + riftSkillETC2 + holesB49_15
    + ola422 + shimmerOla180 * shimmerBonus) / 100;

  var card84 = num(safe(computeCardBonusByType, 84, ci, saveData));
  var comp5 = rval(companion, 5, ctx);
  var group3 = 1 + (card84 + comp5) / 100;

  var winBonus14 = rval(winBonus, 14, ctx);
  var group4 = 1 + winBonus14 / 100;

  var guild6 = rval(guild, 6, ctx);
  var cardSet2 = num(safe(computeCardSetBonus, ci, '2'));
  var prayer1 = computePrayerReal(1, 0, ci, saveData);
  var group5 = 1 + (guild6 + cardSet2 + prayer1) / 100;

  var buffBonus40_2 = getBuffBonus(40, 2, ci, ctx);
  var prayer17curse = computePrayerReal(17, 1, ci, saveData);
  var group6 = Math.max(1 - (buffBonus40_2 + prayer17curse) / 100, 0.01);

  return group1 * group2 * group3 * group4 * group5 * group6;
}

// AllBaseSkillEff: flat base efficiency shared across skills
export function computeAllBaseSkillEff(ci, ctx) {
  var saveData = ctx.saveData;
  var shiny22 = safe(computeShinyBonusS, 22, saveData);
  var stampBaseAllEff = num(safe(computeStampBonusOfTypeX, 'BaseAllEff', saveData, ci));
  var allEfficiencies = computeAllEfficiencies(ci, ctx);
  var minEff = computeCachedSkillBubble('MinEff', ci, ctx);
  var chopEff = computeCachedSkillBubble('ChopEff', ci, ctx);
  var str = safe(computeTotalStat, 'STR', ci, ctx).computed || 0;
  var agi = safe(computeTotalStat, 'AGI', ci, ctx).computed || 0;
  var wis = safe(computeTotalStat, 'WIS', ci, ctx).computed || 0;
  var divBless2 = safe(computeDivinityBless, 2, saveData, {
    allEfficiencies: allEfficiencies,
    minEff: minEff,
    chopEff: chopEff,
    str: str,
    agi: agi,
    wis: wis,
  });
  var _br20b = safe(computeBoxReward, ci, '20b');
  var boxReward20b = num(_br20b);
  var chipEff = safe(computeChipBonus, 'eff', ci);
  var talent636 = rval(talent, 636, ctx);
  var mf112 = safe(mainframeBonus, 112, saveData);

  return shiny22 + stampBaseAllEff + divBless2 + boxReward20b + chipEff + talent636 + mf112;
}

// AllSkillxpz: additive skill EXP shared pool (used by all skill EXP multipliers)
// Game: StarSigns.SkillEXP + 2*CardLv(springEvent2) + CardBonusREAL(50) + ArcadeBonus(18)
//   + GoldFoodBonuses("SkillExp") + BubonicGreen*min(1,TalentEnh(536))
//   + CardSetBonuses(0,"3") + 5*CardLv("w5a4") + min(150,100*TalentEnh(35)) + Shrine(5)
//   + StatueBonusGiven(17) + prayersReal(2,0) + prayersReal(17,0) - prayersReal(1,1) - prayersReal(9,1)
//   + EtcBonuses("27") + BuffBonuses(40,1) + SaltLick(3) + FlurboShop(2) + BoxRewards("20c")
//   + DivinityMinor(ci,1) + 10*Achieve(283) + 25*Achieve(284) + 10*Achieve(294) + 15*Achieve(359)
//   + RiftSkillETC(1) + RiftSkillETC(4) + ShinyBonusS(2) + MSA_Bonus(5) + Companions(9)
//   + WinBonus(12) + GuildBonuses(14) + OwlBonuses(3) + B_UPG(49,10) + CHIZOAR_SET + FriendBonusStatz(4)
export function computeAllSkillxpz(ci, ctx) {
  var saveData = ctx.saveData;
  var starSignSkillEXP = num(safe(computeStarSignBonus, 'SkillEXP', ci, saveData));
  var cardSpringEvent2 = 2 * safe(cardLv, 'springEvent2', saveData);
  var card50 = num(safe(computeCardBonusByType, 50, ci, saveData));
  var arcade18 = rval(arcade, 18, ctx);
  var gfoodSkillExp = 0;
  try {
    var gf = goldFoodBonuses('SkillExp', ci, undefined, saveData);
    gfoodSkillExp = (gf && typeof gf === 'object') ? (Number(gf.total) || 0) : (Number(gf) || 0);
  } catch(e) {}

  var enhancementTalent = maxTalentBonus(49, ci, saveData);
  var talentEnh536 = enhancementTalent >= 200 ? maxTalentBonus(536, -1, saveData) : 0;
  var bubonicGreen = computeBubonicGreen(ci, saveData) * Math.min(1, talentEnh536);
  var cardSet3 = num(safe(computeCardSetBonus, ci, '3'));
  var cardW5a4 = 5 * safe(cardLv, 'w5a4', saveData);
  var talent35 = rval(talent, 35, ctx);
  var talentEnh35 = 0;
  if (enhancementTalent >= 250 && talent35 > 0) {
    var totalLuk = safe(computeTotalStat, 'LUK', ci, ctx).computed || 0;
    var expGainLuk = totalLuk < 1000
      ? (Math.pow(totalLuk + 1, 0.37) - 1) / 30
      : (totalLuk - 1000) / (totalLuk + 2500) * 0.8 + 0.3963;
    talentEnh35 = expGainLuk * (1 + talent35 / 100) / 1.8;
  }
  var talent35capped = Math.min(150, 100 * talentEnh35);
  var shrine5 = rval(shrine, 5, ctx);
  var statue17 = num(safe(computeStatueBonusGiven, 17, ci, saveData));
  var prayer2 = computePrayerReal(2, 0, ci, saveData);
  var prayer17 = computePrayerReal(17, 0, ci, saveData);
  var prayer1curse = computePrayerReal(1, 1, ci, saveData);
  var prayer9curse = computePrayerReal(9, 1, ci, saveData);
  var etc27 = rval(etcBonus, '27', ctx);
  var buffBonus40_1 = getBuffBonus(40, 1, ci, ctx);
  var saltLick3 = safe(computeSaltLick, 3, saveData);
  var flurbo2 = safe(computeFlurboShop, 2, saveData);
  var _br20c = safe(computeBoxReward, ci, '20c');
  var boxReward20c = num(_br20c);
  var divMinor1 = num(safe(computeDivinityMinor, ci, 1, saveData));
  var ach283 = 10 * safe(achieveStatus, 283, saveData);
  var ach284 = 25 * safe(achieveStatus, 284, saveData);
  var ach294 = 10 * safe(achieveStatus, 294, saveData);
  var ach359 = 15 * safe(achieveStatus, 359, saveData);
  var riftSkillETC1 = safe(computeRiftSkillETC, 1, saveData);
  var riftSkillETC4 = safe(computeRiftSkillETC, 4, saveData);
  var shiny2 = safe(computeShinyBonusS, 2, saveData);
  var gamingMSA5 = safe(computeMSABonus, 5, saveData);
  var comp9 = rval(companion, 9, ctx);
  var winBonus12 = rval(winBonus, 12, ctx);
  var guild14 = rval(guild, 14, ctx);
  var owlBonus3 = rval(owl, 3, ctx);
  var holesB49_10 = computeBUpg(49, 10, saveData);
  var chizoarSet = safe(getSetBonus, 'CHIZOAR_SET', ci);
  var friendStatz4 = rval(friend, 4, ctx);

  return starSignSkillEXP + cardSpringEvent2 + card50 + arcade18 + gfoodSkillExp
    + bubonicGreen + cardSet3 + cardW5a4 + talent35capped + shrine5
    + statue17 + prayer2 + prayer17 - prayer1curse - prayer9curse
    + etc27 + buffBonus40_1 + saltLick3 + flurbo2 + boxReward20c
    + divMinor1 + ach283 + ach284 + ach294 + ach359
    + riftSkillETC1 + riftSkillETC4 + shiny2 + gamingMSA5
    + comp9 + winBonus12 + guild14 + owlBonus3
    + holesB49_10 + chizoarSet + friendStatz4;
}

// AllSkillxpMULTI: multiplicative skill EXP shared pool
// Game: (1 + MeritocBonusz(10)/100) * (1 + LegendPTS_bonus(20)/100) * (1 + Companions(32))
export function computeAllSkillxpMULTI(ctx) {
  var s = ctx.saveData;
  var meritoc10 = safe(computeMeritocBonusz, 10, s, ctx.charIdx);
  var legend20 = safe(legendPTSbonus, 20, s);
  var comp32 = rval(companion, 32, ctx);
  return (1 + meritoc10 / 100) * (1 + legend20 / 100) * (1 + comp32);
}
