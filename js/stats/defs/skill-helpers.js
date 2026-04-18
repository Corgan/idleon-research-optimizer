// ===== SHARED SKILL STAT HELPERS =====
// Implements the shared SkillStats functions used across all skill efficiency/EXP descriptors:
// - AllEfficiencies: shared multiplier for all skill efficiencies
// - AllBaseSkillEff: flat base efficiency shared across skills
// - AllSkillxpz: additive skill EXP shared pool
// - AllSkillxpMULTI: multiplicative skill EXP shared pool

import { goldFoodBonuses } from '../systems/common/goldenFood.js';
import { companions } from '../systems/common/companions.js';
import { vaultUpgBonus } from '../systems/common/vault.js';
import { cardLv } from '../systems/common/cards.js';
import { getSetBonus } from '../systems/w3/setBonus.js';
import { votingBonusz } from '../systems/w2/voting.js';
import { label } from '../entity-names.js';
import { mainframeBonus } from '../systems/w4/lab.js';
import { tome } from '../systems/w4/tome.js';
import { guild } from '../systems/common/guild.js';
import { friend } from '../systems/common/friend.js';
import { arcadeBonus } from '../systems/w2/arcade.js';
import { achieveStatus } from '../systems/common/achievement.js';
import { legendPTSbonus } from '../systems/w7/spelunking.js';
import { computeCardBonusByType, computeBoxReward, computeTotalStat } from '../systems/common/stats.js';
import { computeShinyBonusS } from '../systems/w4/breeding.js';
import { computeWinBonus } from '../systems/w6/summoning.js';
import { computeMeritocBonusz } from '../systems/w7/meritoc.js';
import { etcBonus } from '../systems/common/etcBonus.js';
import { talent } from '../systems/common/talent.js';
import { prayersPerCharData, optionsListData } from '../../save/data.js';
import { prayerBaseBonus } from '../data/w3/prayer.js';
import { saveData } from '../../state.js';
import { holes } from '../systems/w5/hole.js';
import { computeFamBonusQTY, computeStatueBonusGiven, computeMealBonus } from '../systems/common/stats.js';
import { computeVialByKey, bubbleValByKey } from '../systems/w2/alchemy.js';
import { computeArtifactBonus } from '../systems/w5/sailing.js';
import { computeMSABonus } from '../systems/w4/gaming.js';
import { computeChipBonus } from '../systems/w4/lab.js';
import { computePaletteBonus } from '../systems/w7/spelunking.js';
import { computeRiftSkillETC } from '../systems/w4/rift.js';
import { computeCardSetBonus } from '../systems/common/cards.js';
import { computeShrine, computeSaltLick } from '../systems/w3/construction.js';
import { computeFlurboShop } from '../systems/w2/dungeon.js';
import { computeDivinityMinor, computeDivinityBless } from '../systems/w5/divinity.js';
import { computeOwlBonus } from '../systems/w1/owl.js';
import { computeStarSignBonus } from '../systems/common/starSign.js';
import { computeStampBonusOfTypeX } from '../systems/w1/stamp.js';
import { computeAllShimmerBonuses } from '../systems/w3/equinox.js';

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

export function computePrayerReal(prayerIdx, costIdx, ci) {
  var s = saveData;
  var prayerLv = Number(s.prayOwnedData && s.prayOwnedData[prayerIdx]) || 0;
  if (prayerLv <= 0) return 0;
  var equipped = false;
  try { equipped = (prayersPerCharData[ci] || []).includes(prayerIdx); } catch(e) {}
  if (!equipped) return 0;
  var base = safe(prayerBaseBonus, prayerIdx, costIdx);
  var scale = Math.max(1, 1 + (prayerLv - 1) / 10);
  return Math.round(base * scale);
}

// AllEfficiencies: shared multiplier for ALL skill efficiencies
// 6 multiplicative groups
export function computeAllEfficiencies(ci, ctx) {
  var famBonus42 = safe(computeFamBonusQTY, 42);
  var etc48 = rval(etcBonus, '48', ctx);
  var vial6SkillEff = safe(computeVialByKey, '6SkillEff');
  var artifactBonus15 = safe(computeArtifactBonus, 15);
  var talent617 = rval(talent, 617, ctx);
  var questEff = Math.min(0.1 * (ctx.saveData ? ctx.saveData.totalQuestsComplete || 0 : 0), talent617);

  var g1 = 1 + (famBonus42 + etc48 + vial6SkillEff + artifactBonus15 + Math.min(questEff, talent617)) / 100;

  var mealSeff = safe(computeMealBonus, 'Seff');
  var talent646 = rval(talent, 646, ctx);
  var tomeBonus1 = rval(tome, 1, ctx);
  var paletteBonus10 = safe(computePaletteBonus, 10);
  var chipToteff = safe(computeChipBonus, 'toteff');
  var cardCrystal4 = 3 * safe(cardLv, 'Crystal4');
  var friendStatz2 = rval(friend, 2, ctx);
  var riftSkillETC2 = safe(computeRiftSkillETC, 2);
  var holesB49_15 = rval(holes, 49, ctx);
  var ola422 = Number(optionsListData[422]) || 0;
  var shimmerOla180 = Number(optionsListData[180]) || 0;
  var shimmerBonus = safe(computeAllShimmerBonuses);

  var g2 = 1 + (mealSeff + talent646 + tomeBonus1 + paletteBonus10 + chipToteff
    + cardCrystal4 + friendStatz2 + riftSkillETC2 + holesB49_15
    + ola422 + shimmerOla180 * shimmerBonus) / 100;

  var _cb84 = safe(computeCardBonusByType, 84, ci);
  var card84 = (typeof _cb84 === 'object' && _cb84) ? (_cb84.val || 0) : Number(_cb84) || 0;
  var comp5 = safe(companions, 5);
  var g3 = 1 + (card84 + comp5) / 100;

  var winBonus14 = safe(computeWinBonus, 14);
  var g4 = 1 + winBonus14 / 100;

  var guild6 = rval(guild, 6, ctx);
  var cardSet2 = safe(computeCardSetBonus, ci, '2');
  var prayer1 = computePrayerReal(1, 0, ci, ctx.saveData);
  var g5 = 1 + (guild6 + cardSet2 + prayer1) / 100;

  // Negative group: max(1 - (BuffBonus(40,2) + prayer17curse)/100, 0.01)
  var buffBonus40_2 = 0; // GetBuffBonuses(40, 2) [NOT COMPUTED]
  var prayer17curse = computePrayerReal(17, 1, ci, ctx.saveData);
  var g6 = Math.max(1 - (buffBonus40_2 + prayer17curse) / 100, 0.01);

  return g1 * g2 * g3 * g4 * g5 * g6;
}

// AllBaseSkillEff: flat base efficiency shared across skills
export function computeAllBaseSkillEff(ci, ctx) {
  var shiny22 = safe(computeShinyBonusS, 22);
  var stampBaseAllEff = safe(computeStampBonusOfTypeX, 'BaseAllEff');
  var divBless2 = safe(computeDivinityBless, 2);
  var _br20b = safe(computeBoxReward, ci, '20b');
  var boxReward20b = (typeof _br20b === 'object' && _br20b) ? (_br20b.val || 0) : Number(_br20b) || 0;
  var chipEff = safe(computeChipBonus, 'eff');
  var talent636 = rval(talent, 636, ctx);
  var mf112 = safe(mainframeBonus, 112);

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
  var starSignSkillEXP = safe(computeStarSignBonus, 'SkillEXP', ci);
  var cardSpringEvent2 = 2 * safe(cardLv, 'springEvent2');
  var _cb50 = safe(computeCardBonusByType, 50, ci);
  var card50 = (typeof _cb50 === 'object' && _cb50) ? (_cb50.val || 0) : Number(_cb50) || 0;
  var arcade18 = safe(arcadeBonus, 18);
  var gfoodSkillExp = 0;
  try {
    var gf = goldFoodBonuses('SkillExp', ci, ctx.saveData);
    gfoodSkillExp = (gf && typeof gf === 'object') ? (Number(gf.total) || 0) : (Number(gf) || 0);
  } catch(e) {}

  var bubonicGreen = 0; // lab bonus — runtime context-dependent, not available from save
  var cardSet3 = safe(computeCardSetBonus, ci, '3');
  var cardW5a4 = 5 * safe(cardLv, 'w5a4');
  var talent35capped = Math.min(150, rval(talent, 35, ctx));
  var shrine5 = safe(computeShrine, 5);
  var statue17 = safe(computeStatueBonusGiven, 17);
  var prayer2 = computePrayerReal(2, 0, ci, ctx.saveData);
  var prayer17 = computePrayerReal(17, 0, ci, ctx.saveData);
  var prayer1curse = computePrayerReal(1, 1, ci, ctx.saveData);
  var prayer9curse = computePrayerReal(9, 1, ci, ctx.saveData);
  var etc27 = rval(etcBonus, '27', ctx);
  var buffBonus40_1 = 0; // GetBuffBonuses(40, 1) — session-only state
  var saltLick3 = safe(computeSaltLick, 3);
  var flurbo2 = safe(computeFlurboShop, 2);
  var _br20c = safe(computeBoxReward, ci, '20c');
  var boxReward20c = (typeof _br20c === 'object' && _br20c) ? (_br20c.val || 0) : Number(_br20c) || 0;
  var divMinor1 = safe(computeDivinityMinor, ci, 1);
  var ach283 = 10 * safe(achieveStatus, 283);
  var ach284 = 25 * safe(achieveStatus, 284);
  var ach294 = 10 * safe(achieveStatus, 294);
  var ach359 = 15 * safe(achieveStatus, 359);
  var riftSkillETC1 = safe(computeRiftSkillETC, 1);
  var riftSkillETC4 = safe(computeRiftSkillETC, 4);
  var shiny2 = safe(computeShinyBonusS, 2);
  var gamingMSA5 = safe(computeMSABonus, 5);
  var comp9 = safe(companions, 9);
  var winBonus12 = safe(computeWinBonus, 12);
  var guild14 = rval(guild, 14, ctx);
  var owlBonus3 = safe(computeOwlBonus, 3);
  var holesB49_10 = rval(holes, 49, ctx);
  var chizoarSet = safe(getSetBonus, 'CHIZOAR_SET');
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
export function computeAllSkillxpMULTI() {
  var meritoc10 = safe(computeMeritocBonusz, 10);
  var legend20 = safe(legendPTSbonus, 20);
  var comp32 = safe(companions, 32);
  return (1 + meritoc10 / 100) * (1 + legend20 / 100) * (1 + comp32);
}
