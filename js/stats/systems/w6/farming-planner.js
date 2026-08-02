// ===== FARMING PLANNER (W6) =====
// Source-backed Farming formulas and optimization primitives.

import { createStatContext } from '../../stat-context.js';
import { gbWith } from '../w7/research-math.js';
import { optionsListData } from '../../../save/data.js';
import { getLOG } from '../../../formulas.js';
import { computeFreshTalentCalcBubbleCache, computeAllSkillxpMULTI } from '../../defs/skill-helpers.js';
import { computeWinBonus } from './summoning.js';
import { computeExoticBonus, computeStickerBonus } from './farming.js';
import { farmRankUpgBonusAtLevel } from './farmRank.js';
import { computeStarSignBonus } from '../common/starSign.js';
import { maxTalentBonus } from '../common/talent.js';
import { guild } from '../common/guild.js';
import { computeCardLv } from '../common/cards.js';
import { computeMealBonus, computeStatueBonusGiven } from '../common/stats.js';
import { achieveStatus } from '../common/achievement.js';
import { vaultUpgBonus } from '../common/vault.js';
import { computeVialByKey, finalBubbleValByKey } from '../w2/alchemy.js';
import { arcadeBonus } from '../w2/arcade.js';
import { votingBonusz } from '../w2/voting.js';
import { computeMSABonus } from '../w4/gaming.js';
import { mainframeBonus } from '../w4/lab.js';
import { computeRiftSkillBonus, computeKillroyBonus } from '../w4/rift.js';
import { computeShinyBonusS } from '../w4/breeding.js';
import { computeStampBonusOfTypeX } from '../w1/stamp.js';
import { computeMonumentROGbonus, computeLampBonus } from '../w5/hole.js';
import { pristineBon } from '../w5/pristine.js';
import { computeButtonBonus, mineheadBonusQTY } from '../w7/minehead.js';
import { rogBonusQTY } from '../w7/sushi.js';
import { legendPTSbonus } from '../w7/spelunking.js';
import { computeEmperorBon } from './emperor.js';
import { grimoireUpgPerLevel } from '../../data/mc/grimoire.js';
import { GRIMOIRE_NO_MULTI } from '../../data/game-constants.js';
import { eventShopOwned, emporiumBonus, superBitType, cloudBonus } from '../../../game-helpers.js';
import { exoticUpgrade, marketUpgrade, seedFamily, seedFamilyCount } from '../../data/w5/farming.js';

var GMO_THRESHOLDS = [200, 1000, 2500, 10000, 100000];
var RANK_NAMES = [
  'Evolution Boost', 'Production Boost', 'Soil EXP Boost', 'Evolution Megaboost', 'Seed of Stealth',
  'Farmtastic Boost', 'Soil EXP Megaboost', 'Overgrowth Boost', 'Production Megaboost', 'Seed of Loot',
  'Evolution Superboost', 'Overgrowth Megaboost', 'Farmtastic Megaboost', 'Soil EXP Superboost', 'Seed of Damage',
  'Evolution Ultraboost', 'Farmtastic Superboost', 'Production Superboost', 'Overgrowth Superboost', 'Seed of Stats',
];
var RANK_UNLOCKS = [1, 5, 20, 30, 60, 80, 125, 180, 250, 400, 500, 600, 700, 900, 1200, 1300, 1500, 1750, 2000, 3500];

function _num(value) {
  if (value && typeof value === 'object' && value.val != null) return Number(value.val) || 0;
  return Number(value) || 0;
}

function _safe(fn) {
  try {
    var args = [];
    for (var i = 1; i < arguments.length; i++) args.push(arguments[i]);
    return _num(fn.apply(null, args));
  } catch (e) {
    return 0;
  }
}

function _product(values) {
  var result = 1;
  for (var i = 0; i < values.length; i++) result *= values[i];
  return result;
}

export function atLeastOneChance(probabilities) {
  var logMiss = 0;
  for (var i = 0; i < probabilities.length; i++) {
    var chance = Math.max(0, Math.min(1, Number(probabilities[i]) || 0));
    logMiss += Math.log1p(-chance);
  }
  return -Math.expm1(logMiss);
}

function _ctx(saveData, activeCharIdx) {
  return createStatContext({ charIdx: activeCharIdx || 0, saveData: saveData });
}

function _grimoireBonus(idx, saveData) {
  var level = Number(saveData.grimoireData && saveData.grimoireData[idx]) || 0;
  if (level <= 0) return 0;
  var value = level * grimoireUpgPerLevel(idx);
  if (!GRIMOIRE_NO_MULTI.has(idx)) value *= 1 + _grimoireBonus(36, saveData) / 100;
  return value;
}

function _guild14(ctx) {
  try { return _num(guild.resolve(14, ctx)); }
  catch (e) { return 0; }
}

export function cropThresholdCounts(saveData, quantities) {
  var crops = quantities || saveData.farmCropData || {};
  var result = new Array(GMO_THRESHOLDS.length).fill(0);
  var keys = Object.keys(crops);
  for (var k = 0; k < keys.length; k++) {
    var quantity = Number(crops[keys[k]]) || 0;
    for (var i = 0; i < GMO_THRESHOLDS.length; i++) {
      if (quantity >= GMO_THRESHOLDS[i]) result[i]++;
    }
  }
  return result;
}

export function basketUpgrade(page, idx, saveData, counts, levelOverride) {
  var upgrades = levelOverride || saveData.farmUpgData || [];
  var data = marketUpgrade(page === 99 ? 1 : page, idx);
  if (!data) return 0;
  counts = counts || cropThresholdCounts(saveData);
  if (page === 0) return (Number(upgrades[2 + idx]) || 0) * data.effectPerLevel;
  if (page === 1) {
    var level = Number(upgrades[10 + idx]) || 0;
    if (idx === 1 || idx === 3) return 1 + level * data.effectPerLevel / 100;
    return level * data.effectPerLevel;
  }
  if (page !== 99) return 0;
  var nightLevel = Number(upgrades[10 + idx]) || 0;
  if (idx === 7) return 1 + nightLevel * data.effectPerLevel * counts[4] / 100;
  if (idx === 1) {
    return Math.max(1, basketUpgrade(99, 7, saveData, counts, upgrades))
      * Math.pow(1 + nightLevel * data.effectPerLevel / 100, counts[0]);
  }
  if (idx === 5) return nightLevel >= 1 ? 1 : 0;
  var countIdx = Math.round(Math.floor(idx / 2) + Math.floor(idx / 7));
  return Math.max(1, basketUpgrade(99, 7, saveData, counts, upgrades))
    * (1 + nightLevel * data.effectPerLevel * (counts[countIdx] || 0) / 100);
}

export function totalLandRank(saveData) {
  var ranks = saveData.farmRankData && saveData.farmRankData[0] || [];
  var total = 0;
  for (var i = 0; i < 36; i++) total += Number(ranks[i]) || 0;
  return total;
}

export function landRankPointsLeft(saveData, levels) {
  levels = levels || saveData.farmRankData && saveData.farmRankData[2] || [];
  var spent = 0;
  for (var i = 0; i < 20; i++) spent += Number(levels[i]) || 0;
  return totalLandRank(saveData) - spent;
}

export function landRankFifthColumnMax(saveData) {
  return Math.round(1 + _grimoireBonus(9, saveData)
    + Math.ceil(computeExoticBonus(15, saveData)) + legendPTSbonus(3, saveData));
}

export function landRankResetStatus(saveData) {
  var lockActive = Number(optionsListData[307]) === 1;
  var extraDays = Number(optionsListData[39]) || 0;
  var seconds = Math.max(0, (Number(saveData.timeAwayData && saveData.timeAwayData.ShopRestock) || 0)
    + 86400 * extraDays);
  return { available: !lockActive, lockActive: lockActive, secondsRemaining: lockActive ? seconds : 0 };
}

export function landRankBonuses(saveData, activeCharIdx, levels) {
  levels = levels || saveData.farmRankData && saveData.farmRankData[2] || [];
  var bonuses = new Array(20);
  for (var i = 0; i < bonuses.length; i++) {
    bonuses[i] = farmRankUpgBonusAtLevel(i, levels[i], activeCharIdx || 0, saveData);
  }
  return bonuses;
}

export function landRankTotals(saveData, activeCharIdx, levels) {
  var b = landRankBonuses(saveData, activeCharIdx, levels);
  return {
    bonuses: b,
    evolution: (1 + b[3] / 100) * (1 + b[10] / 100) * (1 + b[15] / 100),
    cropValue: b[8] + b[17],
    rankXp: b[6] + b[13],
    overgrowth: b[7] + b[11] + b[18],
    farmingExp: b[5] + b[12] + b[16],
  };
}

export function landRankUpgradeRows(saveData, activeCharIdx, levels) {
  levels = levels || saveData.farmRankData && saveData.farmRankData[2] || [];
  var bonuses = landRankBonuses(saveData, activeCharIdx, levels);
  var total = totalLandRank(saveData);
  var fifthMax = landRankFifthColumnMax(saveData);
  var rows = [];
  for (var i = 0; i < 20; i++) {
    rows.push({
      id: i,
      name: RANK_NAMES[i],
      level: Number(levels[i]) || 0,
      bonus: bonuses[i],
      unlockRank: RANK_UNLOCKS[i],
      unlocked: total >= RANK_UNLOCKS[i],
      maxLevel: i % 5 === 4 ? fifthMax : Infinity,
    });
  }
  return rows;
}

function _farmingLevel(saveData, activeCharIdx) {
  return Number(saveData.lv0AllData && saveData.lv0AllData[activeCharIdx || 0]
    && saveData.lv0AllData[activeCharIdx || 0][16]) || 0;
}

function _summoningLevel(saveData, activeCharIdx) {
  return Number(saveData.lv0AllData && saveData.lv0AllData[activeCharIdx || 0]
    && saveData.lv0AllData[activeCharIdx || 0][18]) || 0;
}

function _votingBonus29(ctx, saveData) {
  var multi = 1;
  try { multi = Number(ctx.resolve('voting-multi').val) || 1; } catch (e) {}
  return votingBonusz(29, multi, saveData);
}

function _bubble(key, activeCharIdx, saveData, bubbleCache) {
  return _num(finalBubbleValByKey(key, activeCharIdx || 0, saveData, bubbleCache));
}

export function farmingAccountSnapshot(saveData, options) {
  options = options || {};
  var activeCharIdx = Number(options.activeCharIdx) || 0;
  var rankLevels = options.rankLevels || saveData.farmRankData && saveData.farmRankData[2] || [];
  var marketLevels = options.marketLevels || saveData.farmUpgData || [];
  var counts = options.cropCounts || cropThresholdCounts(saveData, options.cropQuantities);
  var ctx = options.ctx || _ctx(saveData, activeCharIdx);
  var bubbleStages = computeFreshTalentCalcBubbleCache(activeCharIdx, ctx);
  var bubbleInputs = {
    playerHPmax: bubbleStages.playerHPmax,
    playerMPmax: bubbleStages.playerMPmax,
  };
  var ranks = landRankTotals(saveData, activeCharIdx, rankLevels);
  var farmLevel = _farmingLevel(saveData, activeCharIdx);
  var summonLevel = _summoningLevel(saveData, activeCharIdx);
  var taskMerit = Number(saveData.tasksGlobalData && saveData.tasksGlobalData[2]
    && saveData.tasksGlobalData[2][5] && saveData.tasksGlobalData[2][5][2]) || 0;
  var voting29 = _votingBonus29(ctx, saveData);
  var star65 = _num(computeStarSignBonus('CropEvoPerFarmLv', activeCharIdx, saveData));
  var star66 = _num(computeStarSignBonus('FarmingEXP', activeCharIdx, saveData));
  var star67 = _num(computeStarSignBonus('OGChance', activeCharIdx, saveData));
  var evoLevelExotics = 0;
  for (var i = 4; i <= 8; i++) evoLevelExotics += Math.max(0, farmLevel - 50 * (i - 3)) * computeExoticBonus(i, saveData);

  var nextCropCommon = _product([
    1 + basketUpgrade(0, 4, saveData, counts, marketLevels) / 100,
    1 + computeWinBonus(10, { charIdx: activeCharIdx }, saveData) / 100,
    1 + computeLampBonus(2, 0, saveData) / 100,
    1 + rogBonusQTY(35, saveData.cachedUniqueSushi || 0) / 100,
    1 + _bubble('W10AllCharz', activeCharIdx, saveData, bubbleInputs) / 100,
    1 + _bubble('Y6', activeCharIdx, saveData, bubbleInputs) / 100,
    1 + _safe(computeVialByKey, '6FarmEvo', saveData, activeCharIdx) / 100,
    1 + 50 * computeCardLv('w7b5', saveData) / 100,
    1 + _safe(computeMealBonus, 'zCropEvo', saveData, activeCharIdx) / 100,
    1 + vaultUpgBonus(78, saveData) / 100,
    1 + computeMonumentROGbonus(2, 4, saveData) / 100,
    1 + _safe(computeStampBonusOfTypeX, 'CropEvo', saveData, activeCharIdx) / 100,
    1 + _grimoireBonus(14, saveData) / 100,
    1 + _safe(computeMealBonus, 'zCropEvoSumm', saveData, activeCharIdx) * Math.ceil((summonLevel + 1) / 50) / 100,
    1 + 5 * achieveStatus(355, saveData) / 100,
    Math.max(1, computeKillroyBonus(1, saveData)),
    Math.max(1, basketUpgrade(99, 1, saveData, counts, marketLevels)),
    1 + 15 * computeRiftSkillBonus(15, 1, saveData) / 100,
    1 + star65 * farmLevel / 100,
    Math.max(1, ranks.evolution),
    Math.max(1, maxTalentBonus(205, activeCharIdx, saveData)),
    1 + computeExoticBonus(0, saveData) / 100,
    1 + computeButtonBonus(5, saveData) / 100,
    1 + computeExoticBonus(1, saveData) / 100,
    1 + computeStickerBonus(4, saveData) / 100,
    1 + computeExoticBonus(2, saveData) / 100,
    1 + computeExoticBonus(3, saveData) / 100,
    1 + evoLevelExotics / 100,
  ]);

  var growthRate = Math.max(1, basketUpgrade(99, 2, saveData, counts, marketLevels))
    * (1 + (basketUpgrade(0, 2, saveData, counts, marketLevels)
      + _safe(computeVialByKey, '6FarmSpd', saveData, activeCharIdx)
      + computeExoticBonus(30, saveData)) / 100)
    * (1 + computeWinBonus(2, { charIdx: activeCharIdx }, saveData) / 100);

  var overgrowthCommon = Math.max(1, basketUpgrade(1, 3, saveData, counts, marketLevels))
    * (1 + pristineBon(11, saveData) / 100)
    * (1 + star67 / 100)
    * (1 + 2 * taskMerit / 100)
    * (1 + 15 * achieveStatus(365, saveData) / 100)
    * (1 + ranks.overgrowth / 100)
    * (1 + computeExoticBonus(26, saveData) / 100)
    * (1 + computeExoticBonus(27, saveData) / 100);

  var farmingExp = Math.max(1, basketUpgrade(99, 4, saveData, counts, marketLevels))
    * computeAllSkillxpMULTI(ctx)
    * (1 + (basketUpgrade(0, 3, saveData, counts, marketLevels) + computeMSABonus(6, saveData)
      + 25 * computeRiftSkillBonus(15, 0, saveData)
      + _safe(computeMealBonus, 'zFarmExp', saveData, activeCharIdx)
      + _num(arcadeBonus(36, saveData)) + computeExoticBonus(21, saveData)
      + vaultUpgBonus(77, saveData)) / 100)
    * (1 + computeExoticBonus(22, saveData) / 100)
    * (1 + computeWinBonus(8, { charIdx: activeCharIdx }, saveData) / 100)
    * (1 + (_safe(computeVialByKey, '6FarmEXP', saveData, activeCharIdx)
      + _safe(computeStatueBonusGiven, 25, activeCharIdx, saveData)
      + 2 * computeCardLv('w6b2', saveData) + pristineBon(9, saveData)
      + mainframeBonus(16, saveData) + star66 + _guild14(ctx)
      + 10 * achieveStatus(360, saveData) + 15 * achieveStatus(356, saveData)
      + voting29) / 100)
    * (1 + (computeShinyBonusS(24, saveData) + 2 * taskMerit) / 100)
    * (1 + ranks.farmingExp / 100)
    * (1 + maxTalentBonus(206, activeCharIdx, saveData) / 100);

  var beanMultiplier = (1 + basketUpgrade(0, 6, saveData, counts, marketLevels) / 100)
    * (1 + (25 * emporiumBonus(15, saveData.ninjaData && saveData.ninjaData[102] && saveData.ninjaData[102][9])
      + 5 * achieveStatus(363, saveData) + computeExoticBonus(16, saveData)
      + computeExoticBonus(17, saveData) + computeExoticBonus(18, saveData)
      + vaultUpgBonus(85, saveData)) / 100)
    * (1 + computeExoticBonus(19, saveData) / 100)
    * (1 + computeExoticBonus(20, saveData) / 100);

  var cropValueCap = 10000 * (1 + (computeExoticBonus(23, saveData)
    + computeExoticBonus(24, saveData) + computeExoticBonus(25, saveData)) / 100);
  var productBonus = basketUpgrade(0, 5, saveData, counts, marketLevels)
    + computeExoticBonus(28, saveData) + computeExoticBonus(29, saveData);
  var vineBonus = basketUpgrade(0, 1, saveData, counts, marketLevels)
    + 20 * (Number(saveData.gemItemsData && saveData.gemItemsData[139]) || 0)
    + computeExoticBonus(31, saveData) + computeExoticBonus(32, saveData)
    + computeExoticBonus(33, saveData);

  return {
    activeCharIdx: activeCharIdx,
    ctx: ctx,
    cropCounts: counts,
    farmLevel: farmLevel,
    summonLevel: summonLevel,
    taskMerit: taskMerit,
    voting29: voting29,
    rankLevels: rankLevels.slice ? rankLevels.slice() : Array.from(rankLevels),
    marketLevels: marketLevels.slice ? marketLevels.slice() : Array.from(marketLevels),
    rank: ranks,
    nextCropCommon: nextCropCommon,
    growthRate: growthRate,
    overgrowthCommon: overgrowthCommon,
    farmingExp: farmingExp,
    beanMultiplier: beanMultiplier,
    cropValueCap: cropValueCap,
    productBonus: productBonus,
    vineBonus: vineBonus,
    expectedVines: 1 + vineBonus / 100,
    plotRankDisplay: (1 + maxTalentBonus(206, activeCharIdx, saveData) / 100)
      * (1 + (basketUpgrade(0, 7, saveData, counts, marketLevels) + computeExoticBonus(9, saveData)
        + computeExoticBonus(10, saveData) + computeExoticBonus(11, saveData)) / 100)
      * (1 + computeExoticBonus(12, saveData) / 100)
      * (1 + computeExoticBonus(13, saveData) / 100),
  };
}

export function cropType(plotIdx, saveData, plotOverride) {
  var plot = plotOverride || saveData.farmPlotData && saveData.farmPlotData[plotIdx] || [];
  var family = seedFamily(Number(plot[0]));
  return family ? family.start + (Number(plot[2]) || 0) : -1;
}

export function growthRequirement(plotIdx, saveData, snapshot, plotOverride) {
  var plot = plotOverride || saveData.farmPlotData && saveData.farmPlotData[plotIdx] || [];
  var familyId = Number(plot[0]);
  if (familyId < 0) return 0;
  snapshot = snapshot || farmingAccountSnapshot(saveData);
  return familyId === 6 ? 25200 * snapshot.growthRate : 14400 * Math.pow(1.5, familyId);
}

export function growthSeconds(plotIdx, saveData, snapshot, plotOverride) {
  var plot = plotOverride || saveData.farmPlotData && saveData.farmPlotData[plotIdx] || [];
  var required = growthRequirement(plotIdx, saveData, snapshot, plot);
  if (required <= 0) return Infinity;
  snapshot = snapshot || farmingAccountSnapshot(saveData);
  return Math.max(0, required - (Number(plot[1]) || 0)) / snapshot.growthRate;
}

export function nextCropChance(plotIdx, saveData, snapshot, plotOverride) {
  var plot = plotOverride || saveData.farmPlotData && saveData.farmPlotData[plotIdx] || [];
  var family = seedFamily(Number(plot[0]));
  if (!family || snapshot && snapshot.farmLevel < 2) return 0;
  var evolution = Number(plot[2]) || 0;
  if (family.start + evolution >= family.end) return 0;
  snapshot = snapshot || farmingAccountSnapshot(saveData);
  if (snapshot.farmLevel < 2) return 0;
  var rank = Number(saveData.farmRankData && saveData.farmRankData[0]
    && saveData.farmRankData[0][plotIdx]) || 0;
  var denom = family.evolutionDenom === 0.00006942 ? Math.pow(10, -110) : family.evolutionDenom;
  return 0.3 * Math.pow(denom, evolution) * snapshot.nextCropCommon
    * (1 + (snapshot.rank.bonuses[0] * rank + snapshot.voting29) / 100);
}

export function nextOvergrowthChance(plotIdx, saveData, snapshot, plotOverride) {
  var plot = plotOverride || saveData.farmPlotData && saveData.farmPlotData[plotIdx] || [];
  snapshot = snapshot || farmingAccountSnapshot(saveData);
  return Math.pow(0.4, (Number(plot[5]) || 0) + 1) * snapshot.overgrowthCommon;
}

export function overgrowthMultiplier(og) {
  return Math.min(1e9, Math.max(1, Math.pow(2, Number(og) || 0)));
}

export function landRankRequirement(rank) {
  rank = Number(rank) || 0;
  return (7 * rank + 25 * Math.floor(rank / 5) + 10) * Math.pow(1.11, rank);
}

export function cropValueDetails(plotIdx, saveData, snapshot, plotOverride) {
  var plot = plotOverride || saveData.farmPlotData && saveData.farmPlotData[plotIdx] || [];
  snapshot = snapshot || farmingAccountSnapshot(saveData);
  var rank = Number(saveData.farmRankData && saveData.farmRankData[0]
    && saveData.farmRankData[0][plotIdx]) || 0;
  var base = (1 + snapshot.rank.cropValue / 100)
    * Math.max(1, basketUpgrade(99, 6, saveData, snapshot.cropCounts, snapshot.marketLevels))
    * (1 + (snapshot.rank.bonuses[1] * rank + snapshot.voting29) / 100);
  var displayRaw = Math.round(base);
  var displayValue = Math.min(snapshot.cropValueCap, displayRaw);
  var product = Math.max(0, snapshot.productBonus / 100);
  var lowProduct = 1 + Math.floor(product);
  var highChance = product - Math.floor(product);
  var low = Math.min(snapshot.cropValueCap, Math.round(lowProduct * base));
  var high = Math.min(snapshot.cropValueCap, Math.round((lowProduct + 1) * base));
  return {
    base: base,
    raw: displayRaw,
    cap: snapshot.cropValueCap,
    value: displayValue,
    capped: displayRaw >= snapshot.cropValueCap,
    expected: low * (1 - highChance) + high * highChance,
    productLow: lowProduct,
    productHigh: lowProduct + 1,
    productHighChance: highChance,
    expectedVines: snapshot.expectedVines,
    expectedHarvest: snapshot.expectedVines * overgrowthMultiplier(plot[5])
      * (low * (1 - highChance) + high * highChance),
  };
}

export function farmingExpPerHarvest(plotIdx, saveData, snapshot, plotOverride) {
  var plot = plotOverride || saveData.farmPlotData && saveData.farmPlotData[plotIdx] || [];
  snapshot = snapshot || farmingAccountSnapshot(saveData);
  var family = Number(plot[0]);
  var evolution = Number(plot[2]) || 0;
  if (family < 0) return 0;
  return (5 + 25 * family * Math.pow(2, family) * Math.pow(1.25, evolution))
    * snapshot.farmingExp * overgrowthMultiplier(plot[5]);
}

export function rankXpPerHarvest(plotIdx, saveData, snapshot, plotOverride) {
  var plot = plotOverride || saveData.farmPlotData && saveData.farmPlotData[plotIdx] || [];
  snapshot = snapshot || farmingAccountSnapshot(saveData);
  if (basketUpgrade(99, 5, saveData, snapshot.cropCounts, snapshot.marketLevels) < 1) return 0;
  var ranks = saveData.farmRankData && saveData.farmRankData[0] || [];
  var previousRank = Number(ranks[Math.max(0, plotIdx - 1)]) || 0;
  if (plotIdx > 0 && previousRank < 1) return 0;
  return (1 + basketUpgrade(0, 7, saveData, snapshot.cropCounts, snapshot.marketLevels) / 100)
    * (1 + snapshot.rank.bonuses[2] * previousRank / 100)
    * ((Number(plot[0]) || 0) + 1)
    * overgrowthMultiplier(plot[5])
    * (1 + snapshot.rank.rankXp / 100);
}

export function beanRawContributions(saveData, quantities) {
  var crops = quantities || saveData.farmCropData || {};
  var result = [];
  var raw = 0;
  var keys = Object.keys(crops);
  for (var k = 0; k < keys.length; k++) {
    var cropId = Number(keys[k]);
    var quantity = Number(crops[keys[k]]) || 0;
    var family = null;
    for (var i = 0; i < seedFamilyCount(); i++) {
      var candidate = seedFamily(i);
      if (cropId <= candidate.end) { family = candidate; break; }
    }
    if (!family) continue;
    var weight = Math.pow(2.5, family.id) * Math.pow(1.08, cropId - family.start);
    var contribution = quantity * weight;
    raw += contribution;
    result.push({ cropId: cropId, quantity: quantity, familyId: family.id, weight: weight, raw: contribution });
  }
  result.sort(function(a, b) { return b.raw - a.raw; });
  for (var j = 0; j < result.length; j++) result[j].share = raw > 0 ? result[j].raw / raw : 0;
  return { raw: raw, rows: result };
}

export function beanTradeValue(saveData, snapshot, quantities) {
  snapshot = snapshot || farmingAccountSnapshot(saveData, { cropQuantities: quantities });
  var contributions = beanRawContributions(saveData, quantities);
  return {
    value: Math.sqrt(contributions.raw) * snapshot.beanMultiplier,
    raw: contributions.raw,
    multiplier: snapshot.beanMultiplier,
    contributions: contributions.rows,
  };
}

export function plotMetrics(plotIdx, saveData, snapshot) {
  snapshot = snapshot || farmingAccountSnapshot(saveData);
  var plot = saveData.farmPlotData && saveData.farmPlotData[plotIdx] || [];
  var value = cropValueDetails(plotIdx, saveData, snapshot, plot);
  var rank = Number(saveData.farmRankData && saveData.farmRankData[0]
    && saveData.farmRankData[0][plotIdx]) || 0;
  var rankProgress = Number(saveData.farmRankData && saveData.farmRankData[1]
    && saveData.farmRankData[1][plotIdx]) || 0;
  return {
    plotIdx: plotIdx,
    seedFamily: Number(plot[0]),
    cropId: cropType(plotIdx, saveData, plot),
    growthProgress: Number(plot[1]) || 0,
    evolution: Number(plot[2]) || 0,
    evolutionBlocked: Number(plot[3]) === 1,
    cropsOnVine: Number(plot[4]) || 0,
    overgrowth: Number(plot[5]) || 0,
    overflowProgress: Number(plot[6]) || 0,
    growthRequirement: growthRequirement(plotIdx, saveData, snapshot, plot),
    growthSeconds: growthSeconds(plotIdx, saveData, snapshot, plot),
    nextCropChance: nextCropChance(plotIdx, saveData, snapshot, plot),
    nextOvergrowthChance: nextOvergrowthChance(plotIdx, saveData, snapshot, plot),
    cropValue: value,
    farmingExp: farmingExpPerHarvest(plotIdx, saveData, snapshot, plot),
    rank: rank,
    rankProgress: rankProgress,
    rankRequirement: landRankRequirement(rank),
    rankXp: rankXpPerHarvest(plotIdx, saveData, snapshot, plot),
  };
}

export function allPlotMetrics(saveData, snapshot) {
  snapshot = snapshot || farmingAccountSnapshot(saveData);
  var rows = [];
  for (var i = 0; i < 36; i++) rows.push(plotMetrics(i, saveData, snapshot));
  return rows;
}

export function growthCycleSeconds(plotIdx, saveData, snapshot, plotOverride, activeCadence) {
  var required = growthRequirement(plotIdx, saveData, snapshot, plotOverride);
  snapshot = snapshot || farmingAccountSnapshot(saveData);
  if (required <= 0 || snapshot.growthRate <= 0) return Infinity;
  var seconds = required / snapshot.growthRate;
  return activeCadence === false ? seconds : Math.max(1, seconds);
}

export function probabilityPlan(chance, cycleSeconds) {
  var p = Math.max(0, Math.min(1, Number(chance) || 0));
  var cycle = Math.max(0, Number(cycleSeconds) || 0);
  function attemptsFor(q) {
    if (p <= 0) return Infinity;
    if (p >= 1) return 1;
    return Math.ceil(Math.log1p(-q) / Math.log1p(-p));
  }
  var expectedAttempts = p > 0 ? 1 / p : Infinity;
  return {
    chance: p,
    cycleSeconds: cycle,
    expectedAttempts: expectedAttempts,
    expectedSeconds: expectedAttempts * cycle,
    medianAttempts: attemptsFor(0.5),
    medianSeconds: attemptsFor(0.5) * cycle,
    p90Attempts: attemptsFor(0.9),
    p90Seconds: attemptsFor(0.9) * cycle,
    p95Attempts: attemptsFor(0.95),
    p95Seconds: attemptsFor(0.95) * cycle,
  };
}

export function growthBreakpointRows(saveData, snapshot) {
  snapshot = snapshot || farmingAccountSnapshot(saveData);
  var rows = [];
  for (var familyId = 0; familyId < seedFamilyCount(); familyId++) {
    var family = seedFamily(familyId);
    var requirement = familyId === 6 ? 25200 * snapshot.growthRate : 14400 * Math.pow(1.5, familyId);
    var rawSeconds = requirement / snapshot.growthRate;
    rows.push({
      familyId: familyId,
      name: family.name,
      requirement: requirement,
      rawSeconds: rawSeconds,
      activeSeconds: Math.max(1, rawSeconds),
      oneSecondRate: familyId === 6 ? Infinity : requirement,
      atActiveCap: familyId !== 6 && rawSeconds <= 1,
      medalFixed: familyId === 6,
    });
  }
  return rows;
}

export function evolutionStepPlan(targetCropId, saveData, snapshot, options) {
  options = options || {};
  snapshot = snapshot || farmingAccountSnapshot(saveData, options);
  var target = Number(targetCropId);
  var family = null;
  for (var familyId = 0; familyId < seedFamilyCount(); familyId++) {
    var candidate = seedFamily(familyId);
    if (target >= candidate.start && target <= candidate.end) { family = candidate; break; }
  }
  if (!family || target <= family.start) return null;
  var predecessorDepth = target - family.start - 1;
  var probabilities = [];
  for (var plotIdx = 0; plotIdx < 36; plotIdx++) {
    var plot = saveData.farmPlotData && saveData.farmPlotData[plotIdx] || [];
    if (Number(plot[0]) !== family.id || Number(plot[3]) === 1) continue;
    var simulated = plot.slice ? plot.slice() : Array.from(plot);
    simulated[2] = predecessorDepth;
    probabilities.push(nextCropChance(plotIdx, saveData, snapshot, simulated));
  }
  var chance = atLeastOneChance(probabilities);
  var cycleSeconds = family.id === 6 ? 25200
    : Math.max(options.activeCadence === false ? 0 : 1, 14400 * Math.pow(1.5, family.id) / snapshot.growthRate);
  return Object.assign(probabilityPlan(chance, cycleSeconds), {
    targetCropId: target,
    familyId: family.id,
    predecessorDepth: predecessorDepth,
    plotCount: probabilities.length,
    perPlotMin: probabilities.length ? Math.min.apply(null, probabilities) : 0,
    perPlotMax: probabilities.length ? Math.max.apply(null, probabilities) : 0,
  });
}

export function overgrowthStepPlan(plotIdx, saveData, snapshot) {
  snapshot = snapshot || farmingAccountSnapshot(saveData);
  var plot = saveData.farmPlotData && saveData.farmPlotData[plotIdx] || [];
  var chance = nextOvergrowthChance(plotIdx, saveData, snapshot, plot);
  var cycleSeconds = growthCycleSeconds(plotIdx, saveData, snapshot, plot, true);
  var result = probabilityPlan(chance, cycleSeconds);
  var storedCycles = Math.min(10000, Math.floor((Number(plot[6]) || 0)
    / Math.max(1, growthRequirement(plotIdx, saveData, snapshot, plot))));
  var batchSize = storedCycles > 1000 && chance < 0.001 ? 1000
    : storedCycles > 50 && chance < 0.02 ? 50 : 1;
  return Object.assign(result, {
    plotIdx: plotIdx,
    currentOg: Number(plot[5]) || 0,
    nextOg: (Number(plot[5]) || 0) + 1,
    storedCycles: storedCycles,
    batchSize: batchSize,
    batchChance: Math.min(1, chance * batchSize),
  });
}

export function marketUnlockCount(page, saveData) {
  if (page === 3) return 8;
  var cropsFound = Number(saveData.farmCropCount) || Object.keys(saveData.farmCropData || {}).length;
  for (var idx = 0; idx < 8; idx++) {
    var data = marketUpgrade(page, idx);
    if (data && cropsFound < data.cropsRequired) return idx;
  }
  return 8;
}

export function marketMaxLevel(page, idx, saveData) {
  var data = marketUpgrade(page, idx);
  if (!data) return 0;
  if (idx === 0 || page === 1 && idx === 5) return Math.floor(data.maxLevel);
  var grid171 = gbWith(saveData.gridLevels || [], saveData.shapeOverlay || [], 171, {
    abm: Number(saveData.allBonusMulti) || 1,
  });
  return Math.floor(data.maxLevel + grid171);
}

export function marketCostType(page, idx, saveData, levelOverride) {
  var levels = levelOverride || saveData.farmUpgData || [];
  var data = marketUpgrade(page, idx);
  if (!data || page === 1) return -1;
  var level = Number(levels[2 + idx + 8 * page]) || 0;
  if (page === 0 && idx === 0) {
    return data.cropBase + data.cropRate * (level + 2 * Math.floor(level / 3) + Math.floor(level / 4));
  }
  return Math.floor(data.cropBase + data.cropRate * level);
}

export function marketCostQuantity(page, idx, saveData, levelOverride) {
  var levels = levelOverride || saveData.farmUpgData || [];
  var data = marketUpgrade(page, idx);
  if (!data) return Infinity;
  var level = Number(levels[2 + idx + 8 * page]) || 0;
  var emperor = computeEmperorBon(2, saveData);
  var quantity = Math.max(0.001, 1 - emperor / (emperor + 100))
    * data.costBase * Math.pow(data.costGrowth, level);
  if (page === 0) {
    quantity *= Math.max(0.1, 1 - computeExoticBonus(34, saveData) / 100)
      * Math.max(0.1, 1 - computeExoticBonus(35, saveData) / 100);
  } else if (page === 1) {
    quantity *= Math.max(0.1, 1 - computeExoticBonus(36, saveData) / 100)
      * Math.max(0.1, 1 - computeExoticBonus(37, saveData) / 100);
  }
  return quantity < 1e8 ? Math.floor(quantity) : quantity;
}

export function marketUpgradeRows(page, saveData, options) {
  options = options || {};
  var levels = options.marketLevels || saveData.farmUpgData || [];
  var counts = options.cropCounts || cropThresholdCounts(saveData, options.cropQuantities);
  var unlockedCount = marketUnlockCount(page, saveData);
  var rows = [];
  for (var idx = 0; idx < 8; idx++) {
    var data = marketUpgrade(page, idx);
    var level = Number(levels[2 + idx + 8 * page]) || 0;
    var costType = marketCostType(page, idx, saveData, levels);
    var cost = marketCostQuantity(page, idx, saveData, levels);
    var owned = page === 1 ? Number(levels[1]) || 0
      : Number((options.cropQuantities || saveData.farmCropData || {})[costType]) || 0;
    var maxLevel = marketMaxLevel(page, idx, saveData);
    rows.push({
      page: page,
      id: idx,
      name: data.name,
      description: data.description,
      level: level,
      effect: basketUpgrade(page === 1 ? 99 : page, idx, saveData, counts, levels),
      effectPerLevel: data.effectPerLevel,
      costType: costType,
      cost: cost,
      owned: owned,
      affordable: owned >= cost,
      unlocked: idx < unlockedCount,
      maxLevel: maxLevel,
      maxed: level >= maxLevel,
      cropsRequired: data.cropsRequired,
    });
  }
  return rows;
}

function _cropWeight(cropId) {
  cropId = Number(cropId);
  for (var familyId = 0; familyId < seedFamilyCount(); familyId++) {
    var family = seedFamily(familyId);
    if (cropId >= family.start && cropId <= family.end) {
      return Math.pow(2.5, family.id) * Math.pow(1.08, cropId - family.start);
    }
  }
  return 0;
}

export function farmingObjectiveScore(saveData, snapshot, objective, options) {
  options = options || {};
  snapshot = snapshot || farmingAccountSnapshot(saveData, options);
  var score = 0;
  if (objective === 'account') {
    return snapshot.rank.bonuses[4] + snapshot.rank.bonuses[9]
      + snapshot.rank.bonuses[14] + snapshot.rank.bonuses[19];
  }
  if (objective === 'evolution') {
    var target = Number(options.targetCropId);
    var step = Number.isFinite(target) ? evolutionStepPlan(target, saveData, snapshot, options) : null;
    return step ? step.chance : snapshot.nextCropCommon;
  }
  for (var plotIdx = 0; plotIdx < 36; plotIdx++) {
    var plot = saveData.farmPlotData && saveData.farmPlotData[plotIdx] || [];
    if ((Number(plot[0]) || 0) < 0) continue;
    var cycle = growthCycleSeconds(plotIdx, saveData, snapshot, plot, options.activeCadence !== false);
    if (!Number.isFinite(cycle) || cycle <= 0) continue;
    if (objective === 'growth') score += 1 / cycle;
    else if (objective === 'overgrowth') score += nextOvergrowthChance(plotIdx, saveData, snapshot, plot) / cycle;
    else if (objective === 'farmingExp') score += farmingExpPerHarvest(plotIdx, saveData, snapshot, plot) / cycle;
    else if (objective === 'rankXp') score += rankXpPerHarvest(plotIdx, saveData, snapshot, plot) / cycle;
    else if (objective === 'cropValue' || objective === 'beans') {
      var value = cropValueDetails(plotIdx, saveData, snapshot, plot).expectedHarvest / cycle;
      score += objective === 'beans' ? value * _cropWeight(cropType(plotIdx, saveData, plot)) : value;
    }
  }
  return score;
}

function _rankBonusFactory(saveData, activeCharIdx) {
  var atOne = new Array(20);
  for (var idx = 0; idx < 20; idx++) atOne[idx] = farmRankUpgBonusAtLevel(idx, 1, activeCharIdx, saveData);
  return function(levels) {
    var bonuses = new Array(20);
    for (var i = 0; i < 20; i++) {
      var level = Number(levels[i]) || 0;
      bonuses[i] = i % 5 === 4 ? atOne[i] * level : atOne[i] * 81 * level / (level + 80);
    }
    return bonuses;
  };
}

function _rankTotalsFromBonuses(b) {
  return {
    bonuses: b,
    evolution: (1 + b[3] / 100) * (1 + b[10] / 100) * (1 + b[15] / 100),
    cropValue: b[8] + b[17],
    rankXp: b[6] + b[13],
    overgrowth: b[7] + b[11] + b[18],
    farmingExp: b[5] + b[12] + b[16],
  };
}

function _snapshotWithRank(snapshot, rank) {
  var result = Object.assign({}, snapshot, { rank: rank });
  result.nextCropCommon = snapshot.nextCropCommon / Math.max(1, snapshot.rank.evolution)
    * Math.max(1, rank.evolution);
  result.overgrowthCommon = snapshot.overgrowthCommon / (1 + snapshot.rank.overgrowth / 100)
    * (1 + rank.overgrowth / 100);
  result.farmingExp = snapshot.farmingExp / (1 + snapshot.rank.farmingExp / 100)
    * (1 + rank.farmingExp / 100);
  return result;
}

var RANK_OBJECTIVE_IDS = {
  evolution: [0, 3, 10, 15],
  cropValue: [1, 8, 17],
  beans: [1, 8, 17],
  rankXp: [2, 6, 13],
  farmingExp: [5, 12, 16],
  overgrowth: [7, 11, 18],
  account: [4, 9, 14, 19],
  growth: [],
};

function _rankObjectiveEvaluator(saveData, baseSnapshot, objective, options) {
  options = options || {};
  var plots = saveData.farmPlotData || [];
  var plotRanks = saveData.farmRankData && saveData.farmRankData[0] || [];
  var cycles = new Array(36);
  for (var plotIdx = 0; plotIdx < 36; plotIdx++) {
    cycles[plotIdx] = growthCycleSeconds(plotIdx, saveData, baseSnapshot, plots[plotIdx],
      options.activeCadence !== false);
  }

  if (objective === 'account') {
    return function(rank) {
      return rank.bonuses[4] + rank.bonuses[9] + rank.bonuses[14] + rank.bonuses[19];
    };
  }

  if (objective === 'growth') {
    var growthScore = 0;
    for (var growthIdx = 0; growthIdx < 36; growthIdx++) {
      if (Number.isFinite(cycles[growthIdx]) && cycles[growthIdx] > 0) growthScore += 1 / cycles[growthIdx];
    }
    return function() { return growthScore; };
  }

  if (objective === 'evolution') {
    var target = Number(options.targetCropId);
    var family = null;
    for (var familyIdx = 0; familyIdx < seedFamilyCount(); familyIdx++) {
      var candidateFamily = seedFamily(familyIdx);
      if (target >= candidateFamily.start && target <= candidateFamily.end) {
        family = candidateFamily;
        break;
      }
    }
    if (!family || target <= family.start) {
      var evolutionBase = baseSnapshot.nextCropCommon / Math.max(1, baseSnapshot.rank.evolution);
      return function(rank) { return evolutionBase * Math.max(1, rank.evolution); };
    }
    var predecessorDepth = target - family.start - 1;
    var denom = family.evolutionDenom === 0.00006942 ? Math.pow(10, -110) : family.evolutionDenom;
    var chanceBase = 0.3 * Math.pow(denom, predecessorDepth)
      * baseSnapshot.nextCropCommon / Math.max(1, baseSnapshot.rank.evolution);
    var eligibleRanks = [];
    for (var evoPlot = 0; evoPlot < 36; evoPlot++) {
      var evoState = plots[evoPlot] || [];
      if (Number(evoState[0]) === family.id && Number(evoState[3]) !== 1) {
        eligibleRanks.push(Number(plotRanks[evoPlot]) || 0);
      }
    }
    return function(rank) {
      var common = chanceBase * Math.max(1, rank.evolution);
      var probabilities = new Array(eligibleRanks.length);
      for (var i = 0; i < eligibleRanks.length; i++) {
        probabilities[i] = common
          * (1 + (rank.bonuses[0] * eligibleRanks[i] + baseSnapshot.voting29) / 100);
      }
      return atLeastOneChance(probabilities);
    };
  }

  if (objective === 'overgrowth') {
    var overgrowthWeight = 0;
    for (var ogPlot = 0; ogPlot < 36; ogPlot++) {
      if (!Number.isFinite(cycles[ogPlot]) || cycles[ogPlot] <= 0) continue;
      overgrowthWeight += Math.pow(0.4, (Number(plots[ogPlot] && plots[ogPlot][5]) || 0) + 1) / cycles[ogPlot];
    }
    var overgrowthBase = baseSnapshot.overgrowthCommon / (1 + baseSnapshot.rank.overgrowth / 100);
    return function(rank) { return overgrowthWeight * overgrowthBase * (1 + rank.overgrowth / 100); };
  }

  if (objective === 'farmingExp') {
    var farmingExpWeight = 0;
    for (var expPlot = 0; expPlot < 36; expPlot++) {
      var expState = plots[expPlot] || [];
      var expFamily = Number(expState[0]);
      if (expFamily < 0 || !Number.isFinite(cycles[expPlot]) || cycles[expPlot] <= 0) continue;
      var evolution = Number(expState[2]) || 0;
      farmingExpWeight += (5 + 25 * expFamily * Math.pow(2, expFamily) * Math.pow(1.25, evolution))
        * overgrowthMultiplier(expState[5]) / cycles[expPlot];
    }
    var farmingExpBase = baseSnapshot.farmingExp / (1 + baseSnapshot.rank.farmingExp / 100);
    return function(rank) { return farmingExpWeight * farmingExpBase * (1 + rank.farmingExp / 100); };
  }

  if (objective === 'rankXp') {
    var rankRows = [];
    var rankUnlocked = basketUpgrade(99, 5, saveData, baseSnapshot.cropCounts, baseSnapshot.marketLevels) >= 1;
    var rankMarket = 1 + basketUpgrade(0, 7, saveData, baseSnapshot.cropCounts, baseSnapshot.marketLevels) / 100;
    if (rankUnlocked) {
      for (var rankPlot = 0; rankPlot < 36; rankPlot++) {
        var rankState = plots[rankPlot] || [];
        var previousRank = Number(plotRanks[Math.max(0, rankPlot - 1)]) || 0;
        if (rankPlot > 0 && previousRank < 1) continue;
        if (!Number.isFinite(cycles[rankPlot]) || cycles[rankPlot] <= 0) continue;
        rankRows.push({
          previousRank: previousRank,
          base: rankMarket * ((Number(rankState[0]) || 0) + 1)
            * overgrowthMultiplier(rankState[5]) / cycles[rankPlot],
        });
      }
    }
    return function(rank) {
      var sum = 0;
      for (var i = 0; i < rankRows.length; i++) {
        sum += rankRows[i].base * (1 + rank.bonuses[2] * rankRows[i].previousRank / 100);
      }
      return sum * (1 + rank.rankXp / 100);
    };
  }

  if (objective === 'cropValue' || objective === 'beans') {
    var valueRows = [];
    var basketValue = Math.max(1, basketUpgrade(99, 6, saveData,
      baseSnapshot.cropCounts, baseSnapshot.marketLevels));
    var product = Math.max(0, baseSnapshot.productBonus / 100);
    var lowProduct = 1 + Math.floor(product);
    var highChance = product - Math.floor(product);
    for (var valuePlot = 0; valuePlot < 36; valuePlot++) {
      var valueState = plots[valuePlot] || [];
      if (!Number.isFinite(cycles[valuePlot]) || cycles[valuePlot] <= 0) continue;
      var cropId = cropType(valuePlot, saveData, valueState);
      valueRows.push({
        plotRank: Number(plotRanks[valuePlot]) || 0,
        factor: baseSnapshot.expectedVines * overgrowthMultiplier(valueState[5]) / cycles[valuePlot]
          * (objective === 'beans' ? _cropWeight(cropId) : 1),
      });
    }
    return function(rank) {
      var score = 0;
      for (var i = 0; i < valueRows.length; i++) {
        var base = (1 + rank.cropValue / 100) * basketValue
          * (1 + (rank.bonuses[1] * valueRows[i].plotRank + baseSnapshot.voting29) / 100);
        var low = Math.min(baseSnapshot.cropValueCap, Math.round(lowProduct * base));
        var high = Math.min(baseSnapshot.cropValueCap, Math.round((lowProduct + 1) * base));
        score += valueRows[i].factor * (low * (1 - highChance) + high * highChance);
      }
      return score;
    };
  }

  return function(rank) {
    return farmingObjectiveScore(saveData, _snapshotWithRank(baseSnapshot, rank), objective, options);
  };
}

export function optimizeLandRank(saveData, activeCharIdx, objective, options) {
  options = options || {};
  var mode = options.mode === 'reset' ? 'reset' : 'unspent';
  var saved = saveData.farmRankData && saveData.farmRankData[2] || [];
  var levels = new Array(20).fill(0);
  if (mode === 'unspent') for (var i = 0; i < 20; i++) levels[i] = Number(saved[i]) || 0;
  var points = options.points == null
    ? (mode === 'reset' ? totalLandRank(saveData) : Math.max(0, landRankPointsLeft(saveData, levels)))
    : Math.max(0, Math.floor(Number(options.points) || 0));
  var totalRank = totalLandRank(saveData);
  var fifthMax = landRankFifthColumnMax(saveData);
  var makeBonuses = _rankBonusFactory(saveData, activeCharIdx || 0);
  var baseSnapshot = farmingAccountSnapshot(saveData, { activeCharIdx: activeCharIdx || 0 });
  var evaluate = _rankObjectiveEvaluator(saveData, baseSnapshot, objective, options);
  var candidates = RANK_OBJECTIVE_IDS[objective] || Array.from({ length: 20 }, function(_, idx) { return idx; });
  var initialLevels = levels.slice();
  var initialRank = _rankTotalsFromBonuses(makeBonuses(levels));
  var initialScore = evaluate(initialRank);
  var score = initialScore;
  var spent = 0;
  for (var point = 0; point < points; point++) {
    var bestIdx = -1;
    var bestScore = score;
    for (var candidateIdx = 0; candidateIdx < candidates.length; candidateIdx++) {
      var idx = candidates[candidateIdx];
      if (totalRank < RANK_UNLOCKS[idx]) continue;
      if (idx % 5 === 4 && levels[idx] >= fifthMax) continue;
      levels[idx]++;
      var candidateRank = _rankTotalsFromBonuses(makeBonuses(levels));
      var candidateScore = evaluate(candidateRank);
      levels[idx]--;
      if (candidateScore > bestScore) { bestScore = candidateScore; bestIdx = idx; }
    }
    if (bestIdx < 0) break;
    levels[bestIdx]++;
    score = bestScore;
    spent++;
  }
  var changes = [];
  var finalBonuses = makeBonuses(levels);
  for (var rowIdx = 0; rowIdx < 20; rowIdx++) {
    if (levels[rowIdx] !== initialLevels[rowIdx]) changes.push({
      id: rowIdx,
      name: RANK_NAMES[rowIdx],
      before: initialLevels[rowIdx],
      after: levels[rowIdx],
      delta: levels[rowIdx] - initialLevels[rowIdx],
      bonus: finalBonuses[rowIdx],
    });
  }
  changes.sort(function(a, b) { return Math.abs(b.delta) - Math.abs(a.delta); });
  return {
    objective: objective,
    mode: mode,
    initialLevels: initialLevels,
    levels: levels,
    pointsAvailable: points,
    pointsSpent: spent,
    pointsUnused: points - spent,
    initialScore: initialScore,
    finalScore: score,
    relativeGain: initialScore > 0 ? score / initialScore - 1 : score > 0 ? Infinity : 0,
    changes: changes,
  };
}

function _gameRandom(seed) {
  function hash(value, state) {
    value = Math.imul(value | 0, -862048943);
    value = Math.imul((value << 15) | (value >>> 17), 461845907);
    state = (state ^ value) | 0;
    state = (Math.imul((state << 13) | (state >>> 19), 5) - 430675100) | 0;
    state = Math.imul(state ^ (state >> 16), -2048144789);
    state = Math.imul(state ^ (state >> 13), -1028477387);
    return (state ^ (state >> 16)) | 0;
  }
  var first = seed | 0;
  var second = hash(first, 5381);
  if (first === 0) first = 1;
  if (second === 0) second = 1;
  return function() {
    first = 36969 * (65535 & first) + (first >> 16);
    second = 18000 * (65535 & second) + (second >> 16);
    return ((1073741823 & (((first << 16) + second) | 0)) % 10007) / 10007;
  };
}

export function exoticWeekInfo(saveData, globalTimeOverride) {
  var globalTime = globalTimeOverride == null
    ? Number(saveData.timeAwayData && saveData.timeAwayData.GlobalTime) || 0
    : Number(globalTimeOverride) || 0;
  var week = Math.floor(globalTime / 604800);
  var remaining = globalTime > 0 ? 604800 - globalTime % 604800 : 0;
  return { globalTime: globalTime, week: week, secondsRemaining: remaining };
}

export function exoticOfferIds(saveData, globalTimeOverride) {
  var week = exoticWeekInfo(saveData, globalTimeOverride).week;
  var result = [];
  for (var slot = 0; slot < 8; slot++) {
    var bump = 0;
    var offerId;
    do {
      var random = _gameRandom(Math.round(100 * week + slot + bump));
      offerId = Math.floor(Math.max(0, Math.min(59, 60 * random())));
      bump += 1000;
    } while (result.indexOf(offerId) !== -1);
    result.push(offerId);
  }
  return result;
}

export function exoticPurchaseLimits(saveData) {
  var minehead8 = mineheadBonusQTY(8, Number(saveData.stateR7 && saveData.stateR7[4]) || 0);
  var event43 = eventShopOwned(43, saveData.cachedEventShopStr);
  var allowed = Math.round(4 + minehead8 + 8 * event43
    + rogBonusQTY(33, saveData.cachedUniqueSushi || 0)
    + 3 * cloudBonus(66, saveData.weeklyBossData));
  var freePercent = Math.min(80, 30 * event43) + Math.min(25, 25 * minehead8);
  var week = exoticWeekInfo(saveData).week;
  var savedWeek = Number(optionsListData[481]) || 0;
  var used = savedWeek === week ? Number(optionsListData[416]) || 0 : 0;
  return {
    allowed: allowed,
    freePercent: freePercent,
    freePurchases: Math.ceil(allowed * freePercent / 100),
    used: used,
    remaining: Math.max(0, allowed - used),
    savedWeek: savedWeek,
    currentWeek: week,
    rolledOver: savedWeek !== week,
    noCountChance: Math.max(0, Math.min(1, computeExoticBonus(39, saveData) / 100)),
  };
}

export function exoticLevelGain(cropQuantity, saveData) {
  var quantity = Math.max(1, Number(cropQuantity) || 0);
  return Math.ceil((Math.log2(quantity) / 2 + getLOG(quantity))
    * (1 + computeExoticBonus(38, saveData) / 100)
    * (1 + legendPTSbonus(8, saveData) / 100));
}

function _exoticBonusAtLevel(data, level) {
  return data.decay ? data.base * level / (1000 + level) : data.base * level;
}

export function exoticOfferRows(saveData, globalTimeOverride) {
  var ids = exoticOfferIds(saveData, globalTimeOverride);
  var limits = exoticPurchaseLimits(saveData);
  var crops = saveData.farmCropData || {};
  var rows = [];
  for (var slot = 0; slot < ids.length; slot++) {
    var data = exoticUpgrade(ids[slot]);
    var quantity = Number(crops[data.cropId]) || 0;
    var level = Number(saveData.farmUpgData && saveData.farmUpgData[data.farmSlot]) || 0;
    var gain = quantity >= 1 ? exoticLevelGain(quantity, saveData) : 0;
    var before = _exoticBonusAtLevel(data, level);
    var after = _exoticBonusAtLevel(data, level + gain);
    var purchaseNumber = limits.used + slot + 1;
    rows.push({
      slot: slot,
      offerId: data.id,
      name: data.name,
      description: data.description,
      cropId: data.cropId,
      cropQuantity: quantity,
      currentLevel: level,
      levelGain: gain,
      nextLevel: level + gain,
      bonus: before,
      nextBonus: after,
      bonusGain: after - before,
      freeAtCurrentOrder: purchaseNumber <= limits.freePurchases,
      affordable: quantity >= 1,
      purchaseAvailable: limits.remaining > 0,
      capRelevant: data.id >= 23 && data.id <= 25,
    });
  }
  rows.sort(function(a, b) {
    if (a.capRelevant !== b.capRelevant) return a.capRelevant ? -1 : 1;
    return b.bonusGain - a.bonusGain;
  });
  return { week: exoticWeekInfo(saveData, globalTimeOverride), limits: limits, rows: rows };
}

export function farmingDiagnostics(saveData, snapshot) {
  snapshot = snapshot || farmingAccountSnapshot(saveData);
  var plots = allPlotMetrics(saveData, snapshot);
  var cappedPlots = 0;
  var ordinaryAtCap = true;
  var guaranteedEvolution = 0;
  for (var i = 0; i < plots.length; i++) {
    if (plots[i].cropValue.capped) cappedPlots++;
    if (plots[i].seedFamily >= 0 && plots[i].seedFamily < 6
      && growthCycleSeconds(i, saveData, snapshot) > 1) ordinaryAtCap = false;
    if (plots[i].nextCropChance >= 1) guaranteedEvolution++;
  }
  return {
    cropCount: Number(saveData.farmCropCount) || Object.keys(saveData.farmCropData || {}).length,
    cropValueCap: snapshot.cropValueCap,
    cappedPlots: cappedPlots,
    allPlotsCapped: cappedPlots === plots.length,
    ordinaryGrowthAtActiveCap: ordinaryAtCap,
    medalPlotCount: plots.filter(function(row) { return row.seedFamily === 6; }).length,
    guaranteedEvolutionPlots: guaranteedEvolution,
    unspentRankPoints: Math.max(0, landRankPointsLeft(saveData)),
    fifthColumnMax: landRankFifthColumnMax(saveData),
    gmoCounts: snapshot.cropCounts.slice(),
  };
}

export function beanResetPlan(saveData, snapshot, options) {
  options = options || {};
  snapshot = snapshot || farmingAccountSnapshot(saveData);
  var trade = beanTradeValue(saveData, snapshot, options.cropQuantities);
  var currentBeans = Number(saveData.farmUpgData && saveData.farmUpgData[1]) || 0;
  var previousBest = Number(optionsListData[221]) || 0;
  var resetSnapshot = farmingAccountSnapshot(saveData, {
    activeCharIdx: snapshot.activeCharIdx,
    cropCounts: [0, 0, 0, 0, 0],
    cropQuantities: {},
  });
  var harvestRawPerSecond = 0;
  var initialRaw = 0;
  var plots = [];
  for (var plotIdx = 0; plotIdx < 36; plotIdx++) {
    var plot = saveData.farmPlotData && saveData.farmPlotData[plotIdx] || [];
    var cropId = cropType(plotIdx, saveData, plot);
    if (cropId < 0) continue;
    var weight = _cropWeight(cropId);
    var initialHarvest = cropValueDetails(plotIdx, saveData, resetSnapshot, plot).expectedHarvest;
    initialRaw += initialHarvest * weight;
    var ogPlan = optimalOvergrowthTarget(plotIdx, saveData, resetSnapshot);
    var repeatPlot = plot.slice ? plot.slice() : Array.from(plot);
    repeatPlot[5] = ogPlan.best.targetOg;
    var repeatHarvest = cropValueDetails(plotIdx, saveData, resetSnapshot, repeatPlot).expectedHarvest;
    var rawRate = repeatHarvest * weight / ogPlan.best.repeatSeconds;
    harvestRawPerSecond += rawRate;
    plots.push({
      plotIdx: plotIdx,
      cropId: cropId,
      initialHarvest: initialHarvest,
      repeatHarvest: repeatHarvest,
      repeatOg: ogPlan.best.targetOg,
      repeatSeconds: ogPlan.best.repeatSeconds,
      beanRawPerSecond: rawRate,
    });
  }
  var targetRaw = previousBest > 0 ? Math.pow(previousBest / snapshot.beanMultiplier, 2) : 0;
  var currentRaw = trade.raw;
  return {
    tradeValue: trade.value,
    currentBeans: currentBeans,
    beansAfterTrade: currentBeans + trade.value,
    previousBest: previousBest,
    newRecord: trade.value > previousBest,
    recordGain: previousBest > 0 ? trade.value / previousBest - 1 : Infinity,
    gmoCountsBefore: snapshot.cropCounts.slice(),
    gmoCountsAfter: [0, 0, 0, 0, 0],
    contributions: trade.contributions,
    harvestRawPerSecond: harvestRawPerSecond,
    initialRawAfterReset: initialRaw,
    estimatedSecondsToPreviousBest: harvestRawPerSecond > 0
      ? Math.max(0, targetRaw - initialRaw) / harvestRawPerSecond : Infinity,
    estimatedSecondsToCurrentTrade: harvestRawPerSecond > 0
      ? Math.max(0, currentRaw - initialRaw) / harvestRawPerSecond : Infinity,
    plots: plots,
  };
}

export function stickerOddsMultiplier(saveData, activeCharIdx) {
  var found = Number(optionsListData[607]) || 0;
  var base = Math.max(1, Math.pow(2, Math.min(12, found)) + 1500 * Math.max(0, found - 11));
  var grid67 = gbWith(saveData.gridLevels || [], saveData.shapeOverlay || [], 67, {
    abm: Number(saveData.allBonusMulti) || 1,
  });
  var grid88 = gbWith(saveData.gridLevels || [], saveData.shapeOverlay || [], 88, {
    abm: Number(saveData.allBonusMulti) || 1,
  });
  var boonyCount = saveData.research && saveData.research[11] ? saveData.research[11].length : 0;
  grid67 *= boonyCount;
  var farmLevel = Number(saveData.lv0AllData && saveData.lv0AllData[activeCharIdx || 0]
    && saveData.lv0AllData[activeCharIdx || 0][16]) || 0;
  return base
    * (1 + grid67 / 100)
    * (1 + grid88 / 100)
    * (1 + computeStickerBonus(5, saveData) / 100)
    * (1 + _num(arcadeBonus(64, saveData)) / 100)
    * (1 + 0.02 * superBitType(55, saveData.gamingData && saveData.gamingData[12])
      * Math.max(0, farmLevel - 300))
    * (1 + rogBonusQTY(55, saveData.cachedUniqueSushi || 0) / 100);
}

export function stickerRows(saveData, activeCharIdx) {
  var multiplier = stickerOddsMultiplier(saveData, activeCharIdx);
  var unlocked = gbWith(saveData.gridLevels || [], saveData.shapeOverlay || [], 88, {
    abm: Number(saveData.allBonusMulti) || 1,
  }) >= 1;
  var levels = saveData.research && saveData.research[9] || [];
  var rows = [];
  for (var seedType = 0; seedType < Math.min(7, seedFamilyCount()); seedType++) {
    var level = Number(levels[seedType]) || 0;
    var odds = multiplier / (5000 * Math.pow(7, seedType)
      * Math.pow(Math.max(10 - level, 5), level));
    var plotOg = 0;
    var plotCount = 0;
    for (var plotIdx = 0; plotIdx < 36; plotIdx++) {
      var plot = saveData.farmPlotData && saveData.farmPlotData[plotIdx] || [];
      if (Number(plot[0]) === seedType) {
        plotCount++;
        plotOg = Math.max(plotOg, Number(plot[5]) || 0);
      }
    }
    rows.push({
      seedType: seedType,
      name: seedFamily(seedType).name,
      level: level,
      unlocked: unlocked,
      baseChance: odds,
      plotCount: plotCount,
      bestOg: plotOg,
      bestAttemptChance: plotCount > 0 ? Math.min(1, odds * overgrowthMultiplier(plotOg + 1)) : 0,
      expectedAttempts: odds > 0 ? 1 / odds : Infinity,
    });
  }
  return rows;
}

export function evolutionChainPlan(targetCropId, saveData, snapshot, options) {
  options = options || {};
  snapshot = snapshot || farmingAccountSnapshot(saveData, options);
  var target = Number(targetCropId);
  var family = null;
  for (var familyId = 0; familyId < seedFamilyCount(); familyId++) {
    var candidate = seedFamily(familyId);
    if (target >= candidate.start && target <= candidate.end) { family = candidate; break; }
  }
  if (!family) return null;
  var currentDepth = -1;
  for (var plotIdx = 0; plotIdx < 36; plotIdx++) {
    var plot = saveData.farmPlotData && saveData.farmPlotData[plotIdx] || [];
    if (Number(plot[0]) === family.id && Number(plot[3]) !== 1) {
      currentDepth = Math.max(currentDepth, Number(plot[2]) || 0);
    }
  }
  var targetDepth = target - family.start;
  var steps = [];
  var totals = { expectedSeconds: 0, medianSeconds: 0, p90Seconds: 0, p95Seconds: 0 };
  for (var depth = Math.max(0, currentDepth); depth < targetDepth; depth++) {
    var step = evolutionStepPlan(family.start + depth + 1, saveData, snapshot, options);
    if (!step) continue;
    steps.push(step);
    totals.expectedSeconds += step.expectedSeconds;
    totals.medianSeconds += step.medianSeconds;
    totals.p90Seconds += step.p90Seconds;
    totals.p95Seconds += step.p95Seconds;
  }
  return {
    targetCropId: target,
    familyId: family.id,
    currentDepth: currentDepth,
    targetDepth: targetDepth,
    plotCount: steps.length ? steps[0].plotCount : 0,
    stepCount: steps.length,
    expectedSeconds: totals.expectedSeconds,
    medianSeconds: totals.medianSeconds,
    p90Seconds: totals.p90Seconds,
    p95Seconds: totals.p95Seconds,
    steps: steps,
    assumption: 'All eligible plots advance in parallel; percentile times are summed stage estimates.',
  };
}

function _hypotheticalPlot(cropId, og) {
  cropId = Number(cropId);
  for (var familyId = 0; familyId < seedFamilyCount(); familyId++) {
    var family = seedFamily(familyId);
    if (cropId >= family.start && cropId <= family.end) {
      return [family.id, 0, cropId - family.start, 1, 1, Number(og) || 0, 0];
    }
  }
  return null;
}

export function bestCropForObjective(saveData, snapshot, objective, plotIdx) {
  snapshot = snapshot || farmingAccountSnapshot(saveData);
  plotIdx = Math.max(0, Math.min(35, Number(plotIdx) || 0));
  var cropIds = Object.keys(saveData.farmCropData || {}).map(Number).filter(Number.isFinite);
  var best = null;
  for (var i = 0; i < cropIds.length; i++) {
    var cropId = cropIds[i];
    var plot = _hypotheticalPlot(cropId, 0);
    if (!plot) continue;
    var cycle = growthCycleSeconds(plotIdx, saveData, snapshot, plot, true);
    var value;
    if (objective === 'farmingExp') value = farmingExpPerHarvest(plotIdx, saveData, snapshot, plot) / cycle;
    else if (objective === 'rankXp') value = rankXpPerHarvest(plotIdx, saveData, snapshot, plot) / cycle;
    else if (objective === 'overgrowth') value = nextOvergrowthChance(plotIdx, saveData, snapshot, plot) / cycle;
    else {
      value = cropValueDetails(plotIdx, saveData, snapshot, plot).expectedHarvest / cycle;
      if (objective === 'beans') value *= _cropWeight(cropId);
    }
    if (!best || value > best.score) best = {
      cropId: cropId,
      familyId: plot[0],
      evolution: plot[2],
      cycleSeconds: cycle,
      score: value,
    };
  }
  return best;
}

export function plotAssignmentPlan(saveData, snapshot, objective, options) {
  options = options || {};
  snapshot = snapshot || farmingAccountSnapshot(saveData, options);
  var targetCropId = Number(options.targetCropId);
  var target = null;
  if (objective === 'evolution' && Number.isFinite(targetCropId)) {
    var targetPlot = _hypotheticalPlot(targetCropId - 1, 0);
    if (targetPlot) target = {
      cropId: targetCropId - 1,
      familyId: targetPlot[0],
      evolution: targetPlot[2],
      score: evolutionStepPlan(targetCropId, saveData, snapshot, options)?.chance || 0,
    };
  }
  var rows = [];
  for (var plotIdx = 0; plotIdx < 36; plotIdx++) {
    var current = saveData.farmPlotData && saveData.farmPlotData[plotIdx] || [];
    var best = target || bestCropForObjective(saveData, snapshot, objective, plotIdx);
    rows.push({
      plotIdx: plotIdx,
      currentCropId: cropType(plotIdx, saveData, current),
      currentFamilyId: Number(current[0]),
      targetCropId: best ? best.cropId : -1,
      targetFamilyId: best ? best.familyId : -1,
      targetEvolution: best ? best.evolution : 0,
      score: best ? best.score : 0,
      changeNeeded: best ? cropType(plotIdx, saveData, current) !== best.cropId : false,
    });
  }
  return { objective: objective, targetCropId: target ? target.cropId : rows[0]?.targetCropId, rows: rows };
}

export function optimalOvergrowthTarget(plotIdx, saveData, snapshot, options) {
  options = options || {};
  snapshot = snapshot || farmingAccountSnapshot(saveData, options);
  var plot = saveData.farmPlotData && saveData.farmPlotData[plotIdx] || [];
  var currentOg = Number(plot[5]) || 0;
  var cycleSeconds = growthCycleSeconds(plotIdx, saveData, snapshot, plot, true);
  var rows = [];
  var repeatSeconds = cycleSeconds;
  var currentEta = 0;
  for (var targetOg = 0; targetOg <= 30; targetOg++) {
    if (targetOg > 0) {
      var chanceFromReset = Math.min(1, Math.pow(0.4, targetOg) * snapshot.overgrowthCommon);
      repeatSeconds += cycleSeconds / Math.max(Number.MIN_VALUE, chanceFromReset);
    }
    if (targetOg > currentOg) {
      var currentChance = Math.min(1, Math.pow(0.4, targetOg) * snapshot.overgrowthCommon);
      currentEta += cycleSeconds / Math.max(Number.MIN_VALUE, currentChance);
    }
    var reward = overgrowthMultiplier(targetOg);
    rows.push({
      targetOg: targetOg,
      rewardMultiplier: reward,
      repeatSeconds: repeatSeconds,
      longRunRate: reward / repeatSeconds,
      etaFromCurrent: targetOg <= currentOg ? 0 : currentEta,
    });
  }
  var best = rows[0];
  for (var i = 1; i < rows.length; i++) if (rows[i].longRunRate > best.longRunRate) best = rows[i];
  return { plotIdx: plotIdx, currentOg: currentOg, cycleSeconds: cycleSeconds, best: best, rows: rows };
}

export function marketMarginalRows(page, saveData, activeCharIdx, objective, options) {
  options = options || {};
  var levels = (options.marketLevels || saveData.farmUpgData || []).slice();
  var quantities = Object.assign({}, options.cropQuantities || saveData.farmCropData || {});
  var counts = cropThresholdCounts(saveData, quantities);
  var beforeSnapshot = farmingAccountSnapshot(saveData, {
    activeCharIdx: activeCharIdx || 0,
    marketLevels: levels,
    cropQuantities: quantities,
    cropCounts: counts,
  });
  var beforeScore = farmingObjectiveScore(saveData, beforeSnapshot, objective, options);
  var rows = marketUpgradeRows(page, saveData, { marketLevels: levels, cropQuantities: quantities, cropCounts: counts });
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    if (!row.unlocked || row.maxed) {
      row.scoreGain = 0;
      row.relativeGain = 0;
      continue;
    }
    var candidate = levels.slice();
    candidate[2 + row.id + 8 * page] = row.level + 1;
    var afterSnapshot = farmingAccountSnapshot(saveData, {
      activeCharIdx: activeCharIdx || 0,
      marketLevels: candidate,
      cropQuantities: quantities,
      cropCounts: counts,
    });
    var afterScore = farmingObjectiveScore(saveData, afterSnapshot, objective, options);
    row.scoreGain = afterScore - beforeScore;
    row.relativeGain = beforeScore > 0 ? afterScore / beforeScore - 1 : afterScore > 0 ? Infinity : 0;
    row.efficiency = row.cost > 0 ? row.relativeGain / row.cost : row.relativeGain;
  }
  rows.sort(function(a, b) {
    if (a.maxed !== b.maxed) return a.maxed ? 1 : -1;
    return b.relativeGain - a.relativeGain;
  });
  return { page: page, objective: objective, beforeScore: beforeScore, rows: rows };
}

export function optimizeMarketPurchases(page, saveData, activeCharIdx, objective, options) {
  options = options || {};
  var maxSteps = Math.max(1, Math.min(500, Math.floor(Number(options.maxSteps) || 100)));
  var levels = (options.marketLevels || saveData.farmUpgData || []).slice();
  var quantities = Object.assign({}, options.cropQuantities || saveData.farmCropData || {});
  var beans = options.beans == null ? Number(levels[1]) || 0 : Math.max(0, Number(options.beans) || 0);
  var sequence = [];
  var initialScore = null;
  var score = 0;
  for (var step = 0; step < maxSteps; step++) {
    var counts = cropThresholdCounts(saveData, quantities);
    var beforeSnapshot = farmingAccountSnapshot(saveData, {
      activeCharIdx: activeCharIdx || 0,
      marketLevels: levels,
      cropQuantities: quantities,
      cropCounts: counts,
    });
    score = farmingObjectiveScore(saveData, beforeSnapshot, objective, options);
    if (initialScore == null) initialScore = score;
    var rows = marketUpgradeRows(page, saveData, {
      marketLevels: levels,
      cropQuantities: quantities,
      cropCounts: counts,
    });
    var best = null;
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (!row.unlocked || row.maxed) continue;
      var owned = page === 1 ? beans : Number(quantities[row.costType]) || 0;
      if (owned < row.cost) continue;
      var candidateLevels = levels.slice();
      candidateLevels[2 + row.id + 8 * page] = row.level + 1;
      var candidateQuantities = quantities;
      var candidateBeans = beans;
      if (page === 0) {
        candidateQuantities = Object.assign({}, quantities);
        candidateQuantities[row.costType] = Math.max(0, owned - row.cost);
      } else {
        candidateBeans = beans - row.cost;
      }
      var candidateCounts = cropThresholdCounts(saveData, candidateQuantities);
      var afterSnapshot = farmingAccountSnapshot(saveData, {
        activeCharIdx: activeCharIdx || 0,
        marketLevels: candidateLevels,
        cropQuantities: candidateQuantities,
        cropCounts: candidateCounts,
      });
      var afterScore = farmingObjectiveScore(saveData, afterSnapshot, objective, options);
      var gain = afterScore - score;
      if (!(gain > 0)) continue;
      var budgetFraction = row.cost / Math.max(row.cost, owned);
      var priority = page === 1 ? gain / Math.max(row.cost, Number.MIN_VALUE)
        : gain / Math.max(budgetFraction, Number.MIN_VALUE);
      if (!best || priority > best.priority) best = {
        row: row,
        levels: candidateLevels,
        quantities: candidateQuantities,
        beans: candidateBeans,
        score: afterScore,
        gain: gain,
        priority: priority,
      };
    }
    if (!best) break;
    levels = best.levels;
    quantities = best.quantities;
    beans = best.beans;
    sequence.push({
      step: sequence.length + 1,
      id: best.row.id,
      name: best.row.name,
      fromLevel: best.row.level,
      toLevel: best.row.level + 1,
      costType: best.row.costType,
      cost: best.row.cost,
      scoreGain: best.gain,
      relativeGain: score > 0 ? best.score / score - 1 : Infinity,
      beansRemaining: beans,
    });
    score = best.score;
  }
  if (initialScore == null) initialScore = score;
  return {
    page: page,
    objective: objective,
    initialScore: initialScore,
    finalScore: score,
    relativeGain: initialScore > 0 ? score / initialScore - 1 : score > 0 ? Infinity : 0,
    sequence: sequence,
    finalLevels: levels,
    finalQuantities: quantities,
    beansRemaining: beans,
    truncated: sequence.length >= maxSteps,
  };
}