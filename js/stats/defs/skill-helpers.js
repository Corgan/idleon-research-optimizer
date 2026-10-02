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
import { label } from '../entity-names.js';
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

// ---------- Breakdown term helpers ----------
// Terms are plain tree nodes { name, val, fmt, note?, children? }. Sums and
// products iterate left to right so they reproduce the source's evaluation order.

function _rawChildren(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (Array.isArray(raw.children) && raw.children.length) return raw.children;
  if (raw.tree && Array.isArray(raw.tree.children) && raw.tree.children.length) return raw.tree.children;
  return null;
}

// Compact number text for breakdown notes.
export function noteNum(value) {
  var v = Number(value) || 0;
  if (Math.abs(v) >= 1e6) return v.toExponential(3).replace('e+', 'e');
  return String(Math.round(v * 1e4) / 1e4);
}

export function sourceTerm(name, raw, opts) {
  opts = opts || {};
  var node = { name: name, val: opts.val != null ? opts.val : num(raw), fmt: opts.fmt || '%' };
  var children = opts.children || _rawChildren(raw);
  if (children) node.children = children;
  if (opts.note) node.note = opts.note;
  return node;
}

export function resolverTerm(resolver, id, ctx, args, name, fmt) {
  try {
    var result = resolver.resolve(id, ctx, args);
    var node = { name: name || result.name || String(id), val: result.val || 0, fmt: fmt || '%' };
    if (Array.isArray(result.children) && result.children.length) node.children = result.children;
    if (result.note) node.note = result.note;
    return node;
  } catch(e) {
    return { name: name || String(id), val: 0, fmt: fmt || '%' };
  }
}

export function sumTerms(terms) {
  var total = 0;
  for (var i = 0; i < terms.length; i++) total += terms[i].val;
  return total;
}

export function productTerms(terms) {
  var total = 1;
  for (var i = 0; i < terms.length; i++) total *= terms[i].val;
  return total;
}

export function pctGroup(name, terms, note) {
  var node = { name: name, val: 1 + sumTerms(terms) / 100, fmt: 'x', children: terms };
  if (note) node.note = note;
  return node;
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
export function computeAllEfficienciesDetail(ci, ctx) {
  var saveData = ctx.saveData;
  var familyBonuses = safe(computeFamBonusQTYs, ci, saveData);
  var talent617 = rval(talent, 617, ctx);
  var quests = Number(saveData.totalQuestsComplete) || 0;
  var group1 = pctGroup('Skill Efficiency (group 1)', [
    sourceTerm('Family Bonus 42', Number(familyBonuses && familyBonuses[42]) || 0),
    resolverTerm(etcBonus, '48', ctx),
    sourceTerm('Vial: All Skill Efficiency', safe(computeVialByKey, '6SkillEff', saveData, ci)),
    sourceTerm(label('Artifact', 15), safe(computeArtifactBonus, 15, ci, ctx)),
    sourceTerm(label('Talent', 617) + ' (quests)', Math.min(0.1 * quests, talent617), {
      note: 'min(0.1 × ' + quests + ' quests completed, Talent 617 = ' + talent617 + ')',
    }),
  ]);

  var shimmerOla180 = Number(optionsListData[180]) || 0;
  var shimmerBonus = safe(computeAllShimmerBonuses, saveData);
  var group2 = pctGroup('Skill Efficiency (group 2)', [
    sourceTerm('Meal: Skill Efficiency', safe(computeMealBonus, 'Seff', saveData, ci)),
    resolverTerm(talent, 646, ctx),
    resolverTerm(tome, 1, ctx),
    sourceTerm(label('Palette', 10), safe(computePaletteBonus, 10, saveData)),
    sourceTerm('Lab Chip: Total Efficiency', safe(computeChipBonus, 'toteff', ci)),
    sourceTerm('3 × ' + label('Card', 'Crystal4') + ' level', 3 * safe(cardLv, 'Crystal4', saveData)),
    resolverTerm(friend, 2, ctx),
    sourceTerm('Rift Skill Mastery', safe(computeRiftSkillETC, 2, saveData)),
    sourceTerm('Cavern Upgrade 49', computeBUpg(49, 15, saveData)),
    sourceTerm('Account Skill Efficiency bonus', Number(optionsListData[422]) || 0, { note: 'OptionsListAccount[422]' }),
    sourceTerm('Equinox Shimmer', shimmerOla180 * shimmerBonus, { note: shimmerOla180 + ' × ' + shimmerBonus }),
  ]);

  var group3 = pctGroup('Skill Efficiency (group 3)', [
    sourceTerm('Card Bonus: All Skill Efficiency', safe(computeCardBonusByType, 84, ci, saveData)),
    resolverTerm(companion, 5, ctx),
  ]);
  var group4 = pctGroup('Summoning win bonus', [resolverTerm(winBonus, 14, ctx, undefined, 'Summoning Win Bonus: Skill Efficiency')]);
  var group5 = pctGroup('Skill Efficiency (group 5)', [
    resolverTerm(guild, 6, ctx),
    sourceTerm('Card Set: Efficiency', safe(computeCardSetBonus, ci, '2')),
    sourceTerm(label('Prayer', 1), computePrayerReal(1, 0, ci, saveData)),
  ]);
  var penalties = [
    sourceTerm('Buff 40 penalty', getBuffBonus(40, 2, ci, ctx)),
    sourceTerm(label('Prayer', 17) + ' curse', computePrayerReal(17, 1, ci, saveData)),
  ];
  var group6 = {
    name: 'Efficiency penalties',
    val: Math.max(1 - sumTerms(penalties) / 100, 0.01),
    fmt: 'x',
    note: 'max(1 − penalties / 100, 0.01)',
    children: penalties,
  };
  var groups = [group1, group2, group3, group4, group5, group6];
  return { name: 'All Skill Efficiencies', val: productTerms(groups), fmt: 'x', children: groups };
}

export function computeAllEfficiencies(ci, ctx) {
  return computeAllEfficienciesDetail(ci, ctx).val;
}

// AllBaseSkillEff: flat base efficiency shared across skills
export function computeAllBaseSkillEffDetail(ci, ctx) {
  var saveData = ctx.saveData;
  var allEfficiencies = computeAllEfficiencies(ci, ctx);
  var minEff = computeCachedSkillBubble('MinEff', ci, ctx);
  var chopEff = computeCachedSkillBubble('ChopEff', ci, ctx);
  var str = safe(computeTotalStat, 'STR', ci, ctx).computed || 0;
  var agi = safe(computeTotalStat, 'AGI', ci, ctx).computed || 0;
  var wis = safe(computeTotalStat, 'WIS', ci, ctx).computed || 0;
  var terms = [
    sourceTerm('Shiny Pet: Base Efficiency', safe(computeShinyBonusS, 22, saveData), { fmt: 'raw' }),
    sourceTerm('Stamp: Base All Efficiency', safe(computeStampBonusOfTypeX, 'BaseAllEff', saveData, ci), { fmt: 'raw' }),
    sourceTerm('Divinity Blessing 2', safe(computeDivinityBless, 2, saveData, {
      allEfficiencies: allEfficiencies,
      minEff: minEff,
      chopEff: chopEff,
      str: str,
      agi: agi,
      wis: wis,
    }), { fmt: 'raw' }),
    sourceTerm('Post Office: Base Efficiency', safe(computeBoxReward, ci, '20b'), { fmt: 'raw' }),
    sourceTerm('Lab Chip: Efficiency', safe(computeChipBonus, 'eff', ci), { fmt: 'raw' }),
    resolverTerm(talent, 636, ctx, undefined, undefined, 'raw'),
    sourceTerm(label('Mainframe', 112), safe(mainframeBonus, 112, saveData), { fmt: 'raw' }),
  ];
  return { name: 'All Base Skill Efficiency', val: sumTerms(terms), fmt: 'raw', children: terms };
}

export function computeAllBaseSkillEff(ci, ctx) {
  return computeAllBaseSkillEffDetail(ci, ctx).val;
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
export function computeAllSkillxpzDetail(ci, ctx) {
  var saveData = ctx.saveData;
  var gfoodSkillExp = 0;
  try {
    var gf = goldFoodBonuses('SkillExp', ci, undefined, saveData);
    gfoodSkillExp = (gf && typeof gf === 'object') ? (Number(gf.total) || 0) : (Number(gf) || 0);
  } catch(e) {}

  var enhancementTalent = maxTalentBonus(49, ci, saveData);
  var talentEnh536 = enhancementTalent >= 200 ? maxTalentBonus(536, -1, saveData) : 0;
  var talent35 = rval(talent, 35, ctx);
  var talentEnh35 = 0;
  if (enhancementTalent >= 250 && talent35 > 0) {
    var totalLuk = safe(computeTotalStat, 'LUK', ci, ctx).computed || 0;
    var expGainLuk = totalLuk < 1000
      ? (Math.pow(totalLuk + 1, 0.37) - 1) / 30
      : (totalLuk - 1000) / (totalLuk + 2500) * 0.8 + 0.3963;
    talentEnh35 = expGainLuk * (1 + talent35 / 100) / 1.8;
  }
  var terms = [
    sourceTerm('Star Signs: Skill EXP', safe(computeStarSignBonus, 'SkillEXP', ci, saveData)),
    sourceTerm('2 × ' + label('Card', 'springEvent2') + ' level', 2 * safe(cardLv, 'springEvent2', saveData)),
    sourceTerm('Card Bonus: Skill EXP', safe(computeCardBonusByType, 50, ci, saveData)),
    resolverTerm(arcade, 18, ctx),
    sourceTerm('Golden Food: Skill EXP', gfoodSkillExp),
    sourceTerm('Bubonic Green (enhanced)', computeBubonicGreen(ci, saveData) * Math.min(1, talentEnh536)),
    sourceTerm('Card Set: Skill EXP', safe(computeCardSetBonus, ci, '3')),
    sourceTerm('5 × ' + label('Card', 'w5a4') + ' level', 5 * safe(cardLv, 'w5a4', saveData)),
    sourceTerm(label('Talent', 35) + ' (enhanced)', Math.min(150, 100 * talentEnh35), { note: 'min(150, 100 × enhanced LUK EXP gain)' }),
    resolverTerm(shrine, 5, ctx),
    sourceTerm(label('Statue', 17), safe(computeStatueBonusGiven, 17, ci, saveData)),
    sourceTerm(label('Prayer', 2), computePrayerReal(2, 0, ci, saveData)),
    sourceTerm(label('Prayer', 17), computePrayerReal(17, 0, ci, saveData)),
    sourceTerm(label('Prayer', 1) + ' curse', -computePrayerReal(1, 1, ci, saveData)),
    sourceTerm(label('Prayer', 9) + ' curse', -computePrayerReal(9, 1, ci, saveData)),
    resolverTerm(etcBonus, '27', ctx),
    sourceTerm('Buff 40 bonus', getBuffBonus(40, 1, ci, ctx)),
    sourceTerm(label('SaltLick', 3), safe(computeSaltLick, 3, saveData)),
    sourceTerm('Flurbo Shop 2', safe(computeFlurboShop, 2, saveData)),
    sourceTerm('Post Office: Skill EXP', safe(computeBoxReward, ci, '20c')),
    sourceTerm('Divinity Minor 1', safe(computeDivinityMinor, ci, 1, saveData)),
    sourceTerm('10 × ' + label('Achievement', 283), 10 * safe(achieveStatus, 283, saveData)),
    sourceTerm('25 × ' + label('Achievement', 284), 25 * safe(achieveStatus, 284, saveData)),
    sourceTerm('10 × ' + label('Achievement', 294), 10 * safe(achieveStatus, 294, saveData)),
    sourceTerm('15 × ' + label('Achievement', 359), 15 * safe(achieveStatus, 359, saveData)),
    sourceTerm('Rift Skill Mastery 1', safe(computeRiftSkillETC, 1, saveData)),
    sourceTerm('Rift Skill Mastery 4', safe(computeRiftSkillETC, 4, saveData)),
    sourceTerm('Shiny Pet: Skill EXP', safe(computeShinyBonusS, 2, saveData)),
    sourceTerm('Gaming Superbit MSA 5', safe(computeMSABonus, 5, saveData)),
    resolverTerm(companion, 9, ctx),
    resolverTerm(winBonus, 12, ctx, undefined, 'Summoning Win Bonus: Skill EXP'),
    resolverTerm(guild, 14, ctx),
    resolverTerm(owl, 3, ctx),
    sourceTerm('Cavern Upgrade 49', computeBUpg(49, 10, saveData)),
    sourceTerm('Chizoar Set', safe(getSetBonus, 'CHIZOAR_SET', ci)),
    resolverTerm(friend, 4, ctx),
  ];
  return { name: 'Shared Skill EXP', val: sumTerms(terms), fmt: '%', children: terms };
}

export function computeAllSkillxpz(ci, ctx) {
  return computeAllSkillxpzDetail(ci, ctx).val;
}

// AllSkillxpMULTI: multiplicative skill EXP shared pool
// Game: (1 + MeritocBonusz(10)/100) * (1 + LegendPTS_bonus(20)/100) * (1 + Companions(32))
export function computeAllSkillxpMULTIDetail(ctx) {
  var s = ctx.saveData;
  var meritoc10 = safe(computeMeritocBonusz, 10, s, ctx.charIdx);
  var legend20 = safe(legendPTSbonus, 20, s);
  var comp32 = resolverTerm(companion, 32, ctx, undefined, undefined, 'raw');
  var factors = [
    { name: 'Meritocracy 10', val: 1 + meritoc10 / 100, fmt: 'x', note: '+' + meritoc10 + '%' },
    { name: label('Legend', 20), val: 1 + legend20 / 100, fmt: 'x', note: '+' + legend20 + '%' },
    { name: comp32.name, val: 1 + comp32.val, fmt: 'x', children: comp32.children },
  ];
  return { name: 'Skill EXP Multi (all)', val: productTerms(factors), fmt: 'x', children: factors };
}

export function computeAllSkillxpMULTI(ctx) {
  return computeAllSkillxpMULTIDetail(ctx).val;
}
