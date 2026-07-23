// ===== SAILING CHESTS (W5) =====
// Chest generation, route cadence, loot value, rarity, and artifact odds.

import {
  artifactBaseOdds,
  artifactCount,
  artifactName,
  artifactTierBonus,
  islandArtifactCount,
  islandArtifactOffset,
  islandCaptainExp,
  islandCloudRequired,
  islandCount,
  islandDistance,
  zenithMarketPerLevel,
} from '../../data/w5/sailing.js';
import { computeArtifactBonus } from './sailing.js';
import { sigilBonus, bubbleValByKey, computeVialByKey } from '../w2/alchemy.js';
import { arcadeBonus } from '../w2/arcade.js';
import { votingBonusz } from '../w2/voting.js';
import { vaultUpgBonus } from '../common/vault.js';
import { maxTalentBonus } from '../common/talent.js';
import { computeCardLv } from '../common/cards.js';
import { computeFamBonusQTYs, computeMealBonus, computeStatueBonusGiven } from '../common/stats.js';
import { computeStampBonusOfTypeX } from '../w1/stamp.js';
import { computeStarSignBonus } from '../common/starSign.js';
import { companions } from '../common/companions.js';
import { legendPTSbonus, computeLoreEpisodeBonus, computePaletteBonus } from '../w7/spelunking.js';
import { computeButtonBonus } from '../w7/minehead.js';
import { rogBonusQTY } from '../w7/sushi.js';
import { gbWith } from '../w7/research-math.js';
import { computeShinyBonusS } from '../w4/breeding.js';
import { computeKillroyBonus, computeRiftSkillBonus } from '../w4/rift.js';
import { mainframeBonus } from '../w4/lab.js';
import { computeMSABonus } from '../w4/gaming.js';
import { computeDivinityMinor, computeDivinityBless } from './divinity.js';
import { getBribeBonus } from '../w3/bribe.js';
import { computeStickerBonus, computeExoticBonus } from '../w6/farming.js';
import { computeWinBonus } from '../w6/summoning.js';
import { computeMonumentROGbonus } from './hole.js';
import { pristineBon } from './pristine.js';
import { bonTOT as fountainBonTOT } from './fountain.js';
import { eventShopOwned, superBitType } from '../../../game-helpers.js';
import { getLOG } from '../../../formulas.js';
import { achieveStatus } from '../common/achievement.js';

export var CHEST_TIER_NAMES = ['Tier 0', 'Tier 1', 'Tier 2', 'Tier 3', 'Tier 4', 'Tier 5'];
export var CHEST_LOOT_MULTIS = [1, 1.85, Math.pow(1.85, 2), Math.pow(1.85, 3), Math.pow(1.85, 4), 20];
export var CHEST_ARTIFACT_MULTIS = [1, 1.4, Math.pow(1.4, 2), Math.pow(1.4, 3), Math.pow(1.4, 4), 30];
var CHEST_CUMULATIVE_THRESHOLDS = [1, 0.2, 0.04, 0.006, 0.00023, 0.00000001];

function _num(value) { return Number(value) || 0; }
function _treeVal(value) { return value && typeof value === 'object' ? _num(value.val) : _num(value); }

function _gridBonus(idx, saveData) {
  return gbWith(saveData.gridLevels || [], saveData.shapeOverlay || [], idx, {
    abm: _num(saveData.allBonusMulti) || 1,
    c52: _num(saveData.comp52TrueMulti) || 1,
  });
}

function _fountainBonus(saveData, water, upgrade) {
  var holes = saveData.holesData || [];
  var levels = holes[31] || [];
  var marbles = holes[32] || [];
  if (!levels[water] || !marbles[water]) return 0;
  return fountainBonTOT(levels, marbles, water, upgrade);
}

function _lampBonus(t, i, saveData) {
  var grid = [[25, 10, 8], [15, 40, 10], [20, 35, 12], [5, 1, 1], [2, 2, 2]];
  var lampLv = _num(saveData.holesData && saveData.holesData[21]
    && saveData.holesData[21][Math.min(11, 4 + 2 * t)]);
  var zenithLv = _num(saveData.spelunkData && saveData.spelunkData[45]
    && saveData.spelunkData[45][t]);
  var zenith = Math.floor(zenithMarketPerLevel(t) * zenithLv);
  return _num(grid[t] && grid[t][i]) * lampLv * (1 + zenith / 100);
}

function _bUpg55(saveData) {
  if (!_num(saveData.holesData && saveData.holesData[13] && saveData.holesData[13][55])) return 0;
  var resource = _num(saveData.holesData && saveData.holesData[9] && saveData.holesData[9][11]);
  return 10 * Math.floor(getLOG(resource));
}

export function legendaryCaptainCount(saveData) {
  var captains = saveData.captainsData || [];
  var count = 0;
  for (var i = 0; i < Math.min(30, captains.length); i++) {
    if (_num(captains[i] && captains[i][0]) === 6) count++;
  }
  return count;
}

export function captainBonus(captainIdx, bonusType, saveData) {
  if (captainIdx < 0) return 0;
  var captain = saveData.captainsData && saveData.captainsData[captainIdx];
  if (!captain) return 0;
  var level = _num(captain[3]);
  var total = 0;
  if (_num(captain[1]) === bonusType) total += level * _num(captain[5]);
  if (_num(captain[2]) === bonusType) total += level * _num(captain[6]);
  return total;
}

export function captainRollBounds(captainType, bonusType) {
  var rarity = Math.max(0, Math.round(_num(captainType)));
  if (bonusType < 0 || bonusType > 4) return { min: 0, max: 0 };
  var minBase = [10, 30, 30, 10, 10][bonusType];
  var maxBase = [60, 100, 100, 50, 40][bonusType];
  var max = Math.floor(0.15 * Math.floor((0.5 + 0.8 * rarity) * maxBase));
  var min = rarity === 6
    ? Math.floor(0.15 * Math.floor((0.5 + 0.8 * rarity) * maxBase * 0.65))
    : Math.floor(0.15 * minBase);
  return { min: min, max: max };
}

export function captainRollQuality(captainIdx, slot, saveData) {
  var captain = saveData.captainsData && saveData.captainsData[captainIdx] || [];
  var bonusType = Math.round(_num(captain[1 + slot]));
  if (bonusType < 0) return { bonusType: -1, roll: 0, min: 0, max: 0, quality: 0 };
  var bounds = captainRollBounds(captain[0], bonusType);
  var roll = _num(captain[5 + slot]);
  var span = Math.max(1, bounds.max - bounds.min);
  return { bonusType: bonusType, roll: roll, min: bounds.min, max: bounds.max,
    quality: Math.max(0, Math.min(1, (roll - bounds.min) / span)) };
}

export function captainExpRequirement(level) {
  level = Math.max(0, _num(level));
  return (9 + Math.pow(level, 3)) * Math.pow(1.5, level)
    * Math.pow(1.5, Math.max(level - 10, 0));
}

export function captainExpPerTrip(islandIdx, saveData, activeCharIdx) {
  var davey = daveyJonesBonus(0, saveData);
  var vote = votingBonusz(24, null, saveData);
  var sushi = rogBonusQTY(45, saveData.cachedUniqueSushi || 0);
  var talent = maxTalentBonus(327, activeCharIdx || 0, saveData);
  var achievement = 20 * achieveStatus(301, saveData) + 3 * achieveStatus(310, saveData);
  var shiny = computeShinyBonusS(17, saveData);
  var vault = vaultUpgBonus(75, saveData);
  return islandCaptainExp(islandIdx) * davey * (1 + vote / 100) * (1 + sushi / 100)
    * (1 + (talent + achievement + shiny + vault) / 100);
}

export function captainLevelTime(captainIdx, boatIdx, islandIdx, saveData, options) {
  var captain = saveData.captainsData && saveData.captainsData[captainIdx] || [];
  var level = _num(captain[3]);
  var progress = _num(captain[4]);
  var requirement = captainExpRequirement(level);
  var trips = routeTiming(boatIdx, islandIdx, saveData, Object.assign({}, options, { captainIdx: captainIdx })).tripsPerHour;
  var expPerTrip = captainExpPerTrip(islandIdx, saveData, options && options.activeCharIdx);
  var perHour = trips * expPerTrip;
  return { level: level, progress: progress, requirement: requirement,
    remaining: Math.max(0, requirement - progress), expPerTrip: expPerTrip,
    expPerHour: perHour, hours: perHour > 0 ? Math.max(0, requirement - progress) / perHour : Infinity };
}

export function boatTargetIsland(boatIdx, saveData) {
  var boat = saveData.boatsData && saveData.boatsData[boatIdx];
  if (!boat) return -1;
  var island = Math.round(_num(boat[1]));
  if (island >= 0) return island;
  var state = _num(boat[2]);
  return state >= 2 && state < 2.25 ? Math.round(100 * (state - 2)) : -1;
}

export function boatBaseLoot(level) {
  level = Math.max(0, _num(level));
  return 5 + (2 + Math.pow(Math.floor(level / 8), 2)) * level;
}

export function boatBaseSpeed(level) {
  level = Math.max(0, _num(level));
  return 10 + (5 + Math.pow(Math.floor(level / 7), 2)) * level;
}

export function boatUpgradeCostType(boatIdx, stat) {
  if (stat === 'loot' || stat === 0) return boatIdx < 4 ? 0 : Math.min(30, 1 + 2 * (boatIdx - 4));
  if (boatIdx < 2) return boatIdx;
  if (boatIdx < 5) return 1 + 2 * (boatIdx - 2);
  return Math.min(30, 2 * (boatIdx - 4));
}

export function boatUpgradeCost(boatIdx, stat, saveData) {
  var boat = saveData.boatsData && saveData.boatsData[boatIdx] || [];
  var isLoot = stat === 'loot' || stat === 0;
  var level = _num(boat[isLoot ? 3 : 5]);
  var type = boatUpgradeCostType(boatIdx, stat);
  var raw;
  if (type === 0) {
    raw = (5 + 4 * level) * Math.pow(1.17 - 0.12 * level / (level + 200), level);
  } else if (type % 2 === 1) {
    raw = (5 + 2 * level) * Math.pow(1.15 - 0.10 * level / (level + 200), level);
  } else {
    raw = (2 + level) * Math.pow(1.12 - 0.07 * level / (level + 200), level);
  }
  return { boatIdx: boatIdx, stat: isLoot ? 'loot' : 'speed', level: level, type: type,
    cost: raw < 1e6 ? Math.floor(raw) : raw,
    balance: _num(saveData.sailingData && saveData.sailingData[1] && saveData.sailingData[1][type]) };
}

export function sailingCurrencyMeta(type) {
  type = Math.max(0, Math.round(_num(type)));
  if (type === 0) return { type: 0, name: 'Gold Bars', islandIdx: -1, share: 'gold' };
  var islandIdx = Math.floor((type - 1) / 2);
  return { type: type, name: 'Island ' + (islandIdx + 1) + (type % 2 ? ' Primary' : ' Rare'),
    islandIdx: islandIdx, share: type % 2 ? 'primary' : 'rare' };
}

export function expectedCurrencyPerHour(routes, currencyType) {
  var meta = sailingCurrencyMeta(currencyType);
  var total = 0;
  for (var i = 0; i < routes.length; i++) {
    var route = routes[i];
    if (currencyType !== 0 && route.islandIdx !== meta.islandIdx) continue;
    total += route.treasurePerHour * route.treasureShares[meta.share];
  }
  return total;
}

export function boatUpgradeEta(boatIdx, stat, routes, saveData) {
  var upgrade = boatUpgradeCost(boatIdx, stat, saveData);
  var rate = expectedCurrencyPerHour(routes, upgrade.type);
  var remaining = Math.max(0, upgrade.cost - upgrade.balance);
  return Object.assign({}, upgrade, { currency: sailingCurrencyMeta(upgrade.type), rate: rate,
    remaining: remaining, hours: remaining <= 0 ? 0 : rate > 0 ? remaining / rate : Infinity });
}

export function daveyJonesBonus(boatIdx, saveData) {
  var boat = saveData.boatsData && saveData.boatsData[boatIdx] || [];
  var gem = _num(saveData.gemItemsData && saveData.gemItemsData[8]);
  var legend = legendPTSbonus(11, saveData);
  var totalBoatLv = _num(boat[3]) + _num(boat[5]);
  var daveyUnlocked = _gridBonus(105, saveData) > 0 ? 1 : 0;
  var davey = totalBoatLv >= 400 ? daveyUnlocked : 0;
  return (1 + (50 * gem + legend) / 100) * (1 + 2 * davey);
}

export function boatLootValue(boatIdx, saveData, options) {
  options = options || {};
  var boat = saveData.boatsData && saveData.boatsData[boatIdx] || [];
  var captainIdx = options.captainIdx != null ? options.captainIdx : Math.round(_num(boat[0]));
  var activeCharIdx = options.activeCharIdx != null ? options.activeCharIdx : 0;
  var level = options.lootLevel != null ? options.lootLevel : _num(boat[3]);
  var sigil = sigilBonus(21, saveData);
  var captain = captainBonus(captainIdx, 1, saveData);
  var artifact = computeArtifactBonus(5, activeCharIdx, { saveData: saveData });
  var legendary = 25 * Math.min(30, legendaryCaptainCount(saveData));
  var arcade = _num(arcadeBonus(33, saveData));
  var vault = vaultUpgBonus(67, saveData);
  var talent = maxTalentBonus(325, activeCharIdx, saveData);
  var davey = daveyJonesBonus(boatIdx, saveData);
  var lamp = _lampBonus(1, 0, saveData);
  var sushi = rogBonusQTY(57, saveData.cachedUniqueSushi || 0);
  var fountain = _fountainBonus(saveData, 0, 17);
  var additive = sigil + captain + artifact + legendary + arcade + vault;
  var value = boatBaseLoot(level) * (1 + additive / 100) * (1 + talent / 100)
    * davey * (1 + lamp / 100) * (1 + sushi / 100) * (1 + fountain / 100);

  return {
    value: value,
    base: boatBaseLoot(level),
    additive: additive,
    factors: { sigil: sigil, captain: captain, artifact: artifact, legendary: legendary,
      arcade: arcade, vault: vault, talent: talent, davey: davey, lamp: lamp,
      sushi: sushi, fountain: fountain },
  };
}

export function minimumTravelDetails(saveData, activeCharIdx) {
  var family = _num(computeFamBonusQTYs(activeCharIdx == null ? 0 : activeCharIdx, saveData)[44]);
  var shiny = computeShinyBonusS(18, saveData);
  var legend = legendPTSbonus(11, saveData);
  var gem = _num(saveData.gemItemsData && saveData.gemItemsData[8]);
  var totalPercent = family + shiny + legend;
  var beforeGem = 120 / (1 + totalPercent / 100);
  var gemMinutes = 4 * gem;
  return { minutes: Math.round(Math.max(15, beforeGem - gemMinutes)), family: family,
    shiny: shiny, legend: legend, totalPercent: totalPercent, gemPurchases: gem,
    gemMinutes: gemMinutes, beforeGem: beforeGem, floor: 15 };
}

export function minimumTravelMinutes(saveData, activeCharIdx) {
  return minimumTravelDetails(saveData, activeCharIdx).minutes;
}

export function boatSpeed(boatIdx, saveData, options) {
  options = options || {};
  var boat = saveData.boatsData && saveData.boatsData[boatIdx] || [];
  var captainIdx = options.captainIdx != null ? options.captainIdx : Math.round(_num(boat[0]));
  var activeCharIdx = options.activeCharIdx != null ? options.activeCharIdx : 0;
  var level = options.speedLevel != null ? options.speedLevel : _num(boat[5]);
  var divMinor = _treeVal(computeDivinityMinor(activeCharIdx, 6, saveData));
  var card1 = 4 * computeCardLv('w5c1', saveData);
  var cardBoss = 6 * computeCardLv('Boss5A', saveData);
  var bubble = _treeVal(bubbleValByKey('Y1', activeCharIdx, saveData));
  var first = 1 + (divMinor + card1 + cardBoss + bubble) / 125;
  var bless4 = computeDivinityBless(4, saveData);
  var bless6 = computeDivinityBless(6, saveData);
  var vote = votingBonusz(24, null, saveData);
  var bless9 = computeDivinityBless(9, saveData);
  var artifact = computeArtifactBonus(10, activeCharIdx, { saveData: saveData });
  var stamp = _treeVal(computeStampBonusOfTypeX('SailSpd', saveData));
  var statue = computeStatueBonusGiven(24, activeCharIdx, saveData);
  var meal = _num(computeMealBonus('Sailing', saveData));
  var vial = _num(computeVialByKey('SailSpd', saveData));
  var rift = 17 * computeRiftSkillBonus(12, 1, saveData);
  var msa = computeMSABonus(2, saveData);
  var star = _treeVal(computeStarSignBonus('SailingSpd', activeCharIdx, saveData));
  var vault = vaultUpgBonus(62, saveData);
  var second = 1 + (bless9 + artifact + stamp + statue + meal + vial + rift + msa + star + vault) / 125;
  var captain = captainBonus(captainIdx, 0, saveData);
  var speed = boatBaseSpeed(level) * (1 + captain / 100) * first * daveyJonesBonus(boatIdx, saveData)
    * (1 + bless4 / 100) * (1 + bless6 / 100) * (1 + vote / 100) * second;
  return { value: speed, base: boatBaseSpeed(level), captain: captain, first: first,
    davey: daveyJonesBonus(boatIdx, saveData), bless4: bless4, bless6: bless6,
    vote: vote, second: second, factors: { divMinor: divMinor, card1: card1,
      cardBoss: cardBoss, bubble: bubble, bless9: bless9, artifact: artifact,
      stamp: stamp, statue: statue, meal: meal, vial: vial, rift: rift,
      msa: msa, star: star, vault: vault } };
}

export function routeTiming(boatIdx, islandIdx, saveData, options) {
  options = options || {};
  var raw = boatSpeed(boatIdx, saveData, options);
  var distance = islandDistance(islandIdx);
  var minimumDetails = minimumTravelDetails(saveData, options.activeCharIdx);
  var minimumMinutes = minimumDetails.minutes;
  var cap = minimumMinutes > 0 ? 60 * distance / minimumMinutes : Infinity;
  var effective = Math.min(raw.value, cap);
  var tripSeconds = effective > 0 ? 3600 * distance / effective : Infinity;
  return { distance: distance, rawSpeed: raw.value, effectiveSpeed: effective,
    capped: raw.value >= cap, minimumMinutes: minimumMinutes,
    minimumBreakdown: minimumDetails,
    tripSeconds: tripSeconds, tripsPerHour: isFinite(tripSeconds) && tripSeconds > 0 ? 3600 / tripSeconds : 0,
    speedBreakdown: raw };
}

export function chestRarityScale(captainIdx, saveData) {
  var captain = captainBonus(captainIdx, 4, saveData);
  var artifactTier = _num(saveData.sailingData && saveData.sailingData[3] && saveData.sailingData[3][9]);
  var artifact = artifactTierBonus(9, artifactTier);
  return { value: 1 + (captain + artifact) / 200, captain: captain, artifact: artifact };
}

export function chestTierDistribution(captainIdx, saveData) {
  var rarity = chestRarityScale(captainIdx, saveData);
  var cumulative = [];
  for (var tier = 0; tier < 6; tier++) cumulative[tier] = Math.min(1, CHEST_CUMULATIVE_THRESHOLDS[tier] * rarity.value);
  var rows = [];
  for (var t = 0; t < 6; t++) {
    var probability = t === 5 ? cumulative[5] : cumulative[t] - cumulative[t + 1];
    rows.push({ tier: t, name: CHEST_TIER_NAMES[t], probability: Math.max(0, probability),
      cumulative: cumulative[t], lootMultiplier: CHEST_LOOT_MULTIS[t],
      artifactMultiplier: CHEST_ARTIFACT_MULTIS[t] });
  }
  return { rarityScale: rarity.value, captain: rarity.captain, artifact: rarity.artifact, tiers: rows };
}

export function chestLootRolls(tier, saveData) {
  return 1 + Math.min(4, tier) + achieveStatus(300, saveData);
}

export function chestReplacementThreshold(incomingRoute, referenceRoute, referenceTier) {
  incomingRoute = incomingRoute || {};
  referenceRoute = referenceRoute || {};
  referenceTier = Math.max(0, Math.min(5, Math.round(_num(referenceTier))));
  var sameIsland = incomingRoute.islandIdx === referenceRoute.islandIdx;
  var incomingBase = _num(incomingRoute.loot && incomingRoute.loot.value);
  var referenceBase = _num(referenceRoute.loot && referenceRoute.loot.value);
  var referenceValue = referenceBase * CHEST_LOOT_MULTIS[referenceTier];
  var sameTierValue = incomingBase * CHEST_LOOT_MULTIS[referenceTier];
  var requiredTier = -1;
  var replacementValue = 0;

  if (sameIsland) {
    for (var tier = referenceTier + 1; tier < CHEST_LOOT_MULTIS.length; tier++) {
      var candidateValue = incomingBase * CHEST_LOOT_MULTIS[tier];
      if (candidateValue > referenceValue) {
        requiredTier = tier;
        replacementValue = candidateValue;
        break;
      }
    }
  }

  var maxValue = incomingBase * CHEST_LOOT_MULTIS[CHEST_LOOT_MULTIS.length - 1];
  return {
    sameIsland: sameIsland,
    sameTierEligible: sameIsland && sameTierValue >= referenceValue,
    referenceTier: referenceTier,
    referenceValue: referenceValue,
    requiredTier: requiredTier,
    replacementValue: replacementValue,
    margin: requiredTier >= 0 && referenceValue > 0 ? replacementValue / referenceValue - 1 : 0,
    maxValue: maxValue,
    shortfall: requiredTier < 0 && referenceValue > 0 ? Math.max(0, 1 - maxValue / referenceValue) : 0,
  };
}

export function chestReplacementOutcome(incomingRoute, referenceRoute, referenceTier, saveData, activeCharIdx) {
  var threshold = chestReplacementThreshold(incomingRoute, referenceRoute, referenceTier);
  var distribution = incomingRoute && (incomingRoute.rarity
    || chestTierDistribution(incomingRoute.captainIdx, saveData));
  var tierRows = distribution && distribution.tiers || [];
  var exactSameTierChance = _num(tierRows[threshold.referenceTier]
    && tierRows[threshold.referenceTier].probability);
  var talent = unendingLootSearch(saveData, activeCharIdx);
  var active = talent > 0;
  var ulsChance = active && threshold.sameTierEligible
    ? overflowUpgradeChance(threshold.referenceTier, saveData, activeCharIdx) : 0;
  var sameTierUpgradeChance = exactSameTierChance * ulsChance;
  var naturalReplacementChance = active && threshold.requiredTier >= 0
    ? _num(tierRows[threshold.requiredTier] && tierRows[threshold.requiredTier].cumulative) : 0;
  var totalChance = Math.min(1, sameTierUpgradeChance + naturalReplacementChance);
  var generatedRate = _num(incomingRoute && incomingRoute.generatedChestsPerHour);

  return {
    active: active,
    talent: talent,
    threshold: threshold,
    exactSameTierChance: exactSameTierChance,
    ulsChance: ulsChance,
    sameTierUpgradeChance: sameTierUpgradeChance,
    naturalReplacementChance: naturalReplacementChance,
    totalChance: totalChance,
    totalRatePerHour: generatedRate * totalChance,
  };
}

export function fleetChestPayoutBreakdown(routes, tier, saveData) {
  routes = routes || [];
  tier = Math.max(0, Math.min(5, Math.round(_num(tier))));
  var multiplier = CHEST_LOOT_MULTIS[tier];
  var payouts = chestLootRolls(tier, saveData);
  var chestRate = 0;
  var storedValueRate = 0;
  var currencyValueRates = { gold: 0, primary: 0, rare: 0 };
  var currencyPayoutRates = { gold: 0, primary: 0, rare: 0 };

  for (var i = 0; i < routes.length; i++) {
    var route = routes[i] || {};
    var distribution = route.rarity || chestTierDistribution(route.captainIdx, saveData);
    var probability = _num(distribution.tiers && distribution.tiers[tier]
      && distribution.tiers[tier].probability);
    var routeChestRate = _num(route.generatedChestsPerHour) * probability;
    var storedValue = _num(route.loot && route.loot.value) * multiplier;
    var shares = route.treasureShares || { gold: 1, primary: 0, rare: 0 };
    chestRate += routeChestRate;
    storedValueRate += routeChestRate * storedValue;
    for (var key of ['gold', 'primary', 'rare']) {
      var share = _num(shares[key]);
      currencyPayoutRates[key] += routeChestRate * payouts * share;
      currencyValueRates[key] += routeChestRate * payouts * share * storedValue;
    }
  }

  var averageStoredValue = chestRate > 0 ? storedValueRate / chestRate : 0;
  var currencies = {};
  for (var currency of ['gold', 'primary', 'rare']) {
    currencies[currency] = {
      chancePerPayout: chestRate > 0 ? currencyPayoutRates[currency] / (chestRate * payouts) : 0,
      expectedPayoutsPerChest: chestRate > 0 ? currencyPayoutRates[currency] / chestRate : 0,
      expectedValuePerChest: chestRate > 0 ? currencyValueRates[currency] / chestRate : 0,
      expectedValuePerHour: currencyValueRates[currency],
    };
  }

  return {
    tier: tier,
    multiplier: multiplier,
    payouts: payouts,
    chestRate: chestRate,
    averageStoredValue: averageStoredValue,
    totalValuePerChest: averageStoredValue * payouts,
    currencies: currencies,
  };
}

export function fleetChestValueBounds(routes, tier, saveData) {
  routes = routes || [];
  tier = Math.max(0, Math.min(5, Math.round(_num(tier))));
  var multiplier = CHEST_LOOT_MULTIS[tier];
  var rolls = chestLootRolls(tier, saveData);
  var minimum = Infinity;
  var maximum = 0;
  var minimumBoatIdx = -1;
  var maximumBoatIdx = -1;

  for (var i = 0; i < routes.length; i++) {
    var route = routes[i] || {};
    var value = _num(route.loot && route.loot.value) * multiplier;
    if (value < minimum) {
      minimum = value;
      minimumBoatIdx = route.boatIdx;
    }
    if (value > maximum) {
      maximum = value;
      maximumBoatIdx = route.boatIdx;
    }
  }

  if (!isFinite(minimum)) minimum = 0;
  return {
    tier: tier,
    multiplier: multiplier,
    rolls: rolls,
    minimum: minimum,
    maximum: maximum,
    totalMinimum: minimum * rolls,
    totalMaximum: maximum * rolls,
    minimumBoatIdx: minimumBoatIdx,
    maximumBoatIdx: maximumBoatIdx,
  };
}

function _artifactTierUnlocked(currentTier, saveData) {
  if (currentTier <= 1) return true;
  if (currentTier === 2) return _num(saveData.riftData && saveData.riftData[0]) > 29;
  if (currentTier === 3) {
    var str = String(saveData.ninjaData && saveData.ninjaData[102] && saveData.ninjaData[102][9] || '');
    var alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    return str.indexOf(alphabet[35]) !== -1;
  }
  if (currentTier === 4) return _num(saveData.spelunkData && saveData.spelunkData[0] && saveData.spelunkData[0][0]) >= 1;
  if (currentTier === 5) return _gridBonus(109, saveData) >= 1;
  return false;
}

export function artifactOddsDenominator(islandIdx, artifactIdx, currentTier, serverVars) {
  serverVars = serverVars || {};
  var ancientStep = _num(serverVars.AncientOddPerIsland) || 960;
  var ancientPct = _num(serverVars.AncientArtiPCT);
  var serverMulti = 1 + ancientPct / 100;
  if (currentTier === 0) return artifactBaseOdds(artifactIdx);
  if (currentTier === 1) return islandIdx < 3 ? 850 : (1000 + (islandIdx - 3) * ancientStep) / serverMulti;
  if (currentTier === 2) return islandIdx < 3 ? 900 + 250 * islandIdx
    : (1000 + (islandIdx - 3) * ancientStep) / serverMulti * 4;
  if (currentTier === 3) return islandIdx < 5 ? 9000 + 2000 * islandIdx
    : (1000 + 1.25 * (islandIdx - 3) * ancientStep) / serverMulti * 180;
  if (currentTier === 4) return islandIdx < 6 ? 120000 + 40000 * islandIdx
    : 10000 * (1 + 0.5 * (islandIdx - 5))
      * ((3000 + 3 * (islandIdx - 5) * ancientStep) / serverMulti);
  if (currentTier === 5) return islandIdx < 6 ? 40000000 + 60000000 * islandIdx
    : 1000000 * (1 + islandIdx - 5) * Math.max(1, Math.pow(1.7, Math.max(0, islandIdx - 7)))
      * (1 + 0.5 * Math.max(0, islandIdx - 9))
      * ((10000 + 5000 * (islandIdx - 5) * (ancientStep / 960)) / serverMulti);
  return Infinity;
}

export function boatArtifactMultiplier(boatIdx, saveData, options) {
  options = options || {};
  var boat = saveData.boatsData && saveData.boatsData[boatIdx] || [];
  var captainIdx = options.captainIdx != null ? options.captainIdx : Math.round(_num(boat[0]));
  var activeCharIdx = options.activeCharIdx != null ? options.activeCharIdx : 0;
  var artifact = computeArtifactBonus(3, activeCharIdx, { saveData: saveData });
  var captain = captainBonus(captainIdx, 3, saveData);
  var shiny = computeShinyBonusS(21, saveData);
  var fractal = 20 * (_num(saveData.olaData && saveData.olaData[184]) >= 2500 ? 1 : 0);
  var bribe = _treeVal(getBribeBonus(34, saveData));
  var legendary = 25 * Math.min(30, legendaryCaptainCount(saveData));
  var arcade32 = _num(arcadeBonus(32, saveData));
  var arcade66 = _num(arcadeBonus(66, saveData));
  var hole55 = _bUpg55(saveData);
  var sticker = computeStickerBonus(2, saveData);
  var grid109 = _gridBonus(109, saveData);
  var vault63 = vaultUpgBonus(63, saveData);
  var additive = artifact + captain + shiny + fractal + bribe + legendary
    + arcade32 + arcade66 + hole55 + sticker + grid109 + vault63;
  var star = _treeVal(computeStarSignBonus('ArtifactFind', activeCharIdx, saveData));
  var companion154 = companions(154, saveData);
  var killroy = computeKillroyBonus(0, saveData);
  var minehead = computeButtonBonus(3, saveData);
  var grid106 = _gridBonus(106, saveData);
  var vial = _num(computeVialByKey('6turtle', saveData));
  var purpleSlugs = eventShopOwned(48, saveData.cachedEventShopStr);
  var sushi = rogBonusQTY(7, saveData.cachedUniqueSushi || 0);
  var win = computeWinBonus(3, {}, saveData);
  var davey = daveyJonesBonus(boatIdx, saveData);
  var lab = mainframeBonus(14, saveData);
  var lore = computeLoreEpisodeBonus(3, saveData);
  var pristine = pristineBon(2, saveData);
  var vote = votingBonusz(20, null, saveData);
  var companion43 = companions(43, saveData);
  var monument = computeMonumentROGbonus(1, 2, saveData);
  var exotic = computeExoticBonus(45, saveData);
  var palette = computePaletteBonus(5, saveData);
  var spelunkCount = (saveData.spelunkData && saveData.spelunkData[6] || []).length;
  var spelunk = Math.max(1, Math.pow(1.02, spelunkCount) * superBitType(26, saveData.gamingData && saveData.gamingData[12]));
  var value = Math.max(1, 1 + additive / 100) * (1 + star / 100)
    * Math.max(1, Math.min(2, 1 + 2 * companion154)) * Math.max(1, killroy)
    * (1 + minehead / 100) * (1 + grid106 / 100) * (1 + vial / 100)
    * Math.max(1, Math.pow(1.5, purpleSlugs)) * (1 + sushi / 100) * (1 + win / 100)
    * davey * (1 + lab / 100) * (1 + lore / 100) * (1 + pristine / 100)
    * (1 + vote / 100) * (1 + companion43) * (1 + monument / 100)
    * (1 + exotic / 100) * (1 + palette / 100) * spelunk;

  return { value: value, additive: additive, factors: { artifact: artifact, captain: captain,
    shiny: shiny, fractal: fractal, bribe: bribe, legendary: legendary,
    arcade32: arcade32, arcade66: arcade66, hole55: hole55, sticker: sticker,
    grid109: grid109, vault63: vault63, star: star, companion154: companion154,
    killroy: killroy, minehead: minehead, grid106: grid106, vial: vial,
    purpleSlugs: purpleSlugs, sushi: sushi, win: win, davey: davey, lab: lab,
    lore: lore, pristine: pristine, vote: vote, companion43: companion43,
    monument: monument, exotic: exotic, palette: palette, spelunk: spelunk } };
}

export function islandArtifactOdds(islandIdx, artifactMultiplier, saveData, options) {
  options = options || {};
  var offset = islandArtifactOffset(islandIdx);
  var count = islandArtifactCount(islandIdx);
  var fail = 1;
  var artifacts = [];
  for (var i = 0; i < count; i++) {
    var artifactIdx = offset + i;
    var currentTier = _num(saveData.sailingData && saveData.sailingData[3]
      && saveData.sailingData[3][artifactIdx]);
    var unlocked = currentTier < 6 && _artifactTierUnlocked(currentTier, saveData);
    var denominator = unlocked
      ? artifactOddsDenominator(islandIdx, artifactIdx, currentTier, options.serverVars)
      : Infinity;
    var chance = isFinite(denominator) ? Math.min(1, artifactMultiplier / denominator) : 0;
    var exactChance = fail * chance;
    artifacts.push({ artifactIdx: artifactIdx, name: artifactName(artifactIdx), currentTier: currentTier,
      nextTier: currentTier + 1, unlocked: unlocked, denominator: denominator,
      rawChance: chance, exactChance: exactChance });
    fail *= 1 - chance;
  }
  return { anyChance: 1 - fail, artifacts: artifacts };
}

export function maxChestSlots(saveData, activeCharIdx) {
  var gem = _num(saveData.gemItemsData && saveData.gemItemsData[129]);
  var artifact = Math.min(4, computeArtifactBonus(19, activeCharIdx || 0, { saveData: saveData }));
  var task = _num(saveData.tasksGlobalData && saveData.tasksGlobalData[2]
    && saveData.tasksGlobalData[2][4] && saveData.tasksGlobalData[2][4][2]);
  return Math.min(34, Math.round(5 + gem + artifact + task
    + achieveStatus(287, saveData) + achieveStatus(290, saveData)));
}

export function unendingLootSearch(saveData, activeCharIdx) {
  return maxTalentBonus(325, activeCharIdx || 0, saveData);
}

export function overflowUpgradeChance(tier, saveData, activeCharIdx) {
  var base = [0.25, 0.05, 0.007, 0.0003, 0, 0][tier] || 0;
  var scale = Math.min(1, 0.6 + unendingLootSearch(saveData, activeCharIdx) / 100);
  return base * scale;
}

export function routeMetrics(boatIdx, islandIdx, saveData, options) {
  options = options || {};
  var boat = saveData.boatsData && saveData.boatsData[boatIdx] || [];
  var captainIdx = options.captainIdx != null ? options.captainIdx : Math.round(_num(boat[0]));
  var minTier = options.minimumTier != null ? Math.max(0, Math.min(5, Math.round(options.minimumTier))) : 0;
  var loot = boatLootValue(boatIdx, saveData, options);
  var timing = routeTiming(boatIdx, islandIdx, saveData, options);
  var distribution = chestTierDistribution(captainIdx, saveData);
  var baseArtifact = boatArtifactMultiplier(boatIdx, saveData, options);
  var keptProbability = 0;
  var chestValuePerTrip = 0;
  var treasurePerTrip = 0;
  var artifactChancePerTrip = 0;
  var tierRows = [];

  for (var t = 0; t < distribution.tiers.length; t++) {
    var tier = distribution.tiers[t];
    var kept = t >= minTier;
    var chestValue = loot.value * tier.lootMultiplier;
    var rolls = chestLootRolls(t, saveData);
    var artifactMultiplier = baseArtifact.value * tier.artifactMultiplier;
    var artifact = islandArtifactOdds(islandIdx, artifactMultiplier, saveData, options);
    if (kept) {
      keptProbability += tier.probability;
      chestValuePerTrip += tier.probability * chestValue;
      treasurePerTrip += tier.probability * chestValue * rolls;
      artifactChancePerTrip += tier.probability * artifact.anyChance;
    }
    tierRows.push(Object.assign({}, tier, { kept: kept, chestValue: chestValue, rolls: rolls,
      treasureValue: chestValue * rolls, artifactMultiplier: artifactMultiplier,
      artifactChance: artifact.anyChance }));
  }

  var trips = timing.tripsPerHour;
  var sailingLv = _num(saveData.lv0AllData && saveData.lv0AllData[options.activeCharIdx || 0]
    && saveData.lv0AllData[options.activeCharIdx || 0][13]);
  var goldShare = sailingLv < 5 ? 1 : 0.5;
  var primaryShare = sailingLv < 5 ? 0 : 0.475;
  var rareShare = sailingLv < 5 ? 0 : 0.025;

  return {
    boatIdx: boatIdx, captainIdx: captainIdx, islandIdx: islandIdx, minimumTier: minTier,
    timing: timing, loot: loot, rarity: distribution, artifactBase: baseArtifact,
    tiers: tierRows, keptProbability: keptProbability,
    generatedChestsPerHour: trips, keptChestsPerHour: trips * keptProbability,
    chestValuePerHour: trips * chestValuePerTrip,
    treasurePerHour: trips * treasurePerTrip,
    artifactChancePerTrip: artifactChancePerTrip,
    artifactFindsPerHour: trips * artifactChancePerTrip,
    treasureShares: { gold: goldShare, primary: primaryShare, rare: rareShare },
    captainExpPerHour: trips * captainExpPerTrip(islandIdx, saveData, options.activeCharIdx),
  };
}

function _assignmentScore(route, goal) {
  if (goal === 'artifact') return route.artifactFindsPerHour;
  if (goal === 'chests') return route.keptChestsPerHour;
  // Direct generated-chest value only. Near-full processing cannot be decomposed
  // into independent boat/captain weights because it depends on shared pile order.
  return route.treasurePerHour;
}

function _hungarianMax(weights) {
  var rows = weights.length;
  var cols = rows ? weights[0].length : 0;
  if (!rows || !cols) return [];
  while (cols < rows) {
    for (var r = 0; r < rows; r++) weights[r].push(0);
    cols++;
  }
  var maxWeight = 0;
  for (var i = 0; i < rows; i++) for (var j = 0; j < cols; j++) maxWeight = Math.max(maxWeight, weights[i][j]);
  var u = new Array(rows + 1).fill(0);
  var v = new Array(cols + 1).fill(0);
  var p = new Array(cols + 1).fill(0);
  var way = new Array(cols + 1).fill(0);
  for (var row = 1; row <= rows; row++) {
    p[0] = row;
    var j0 = 0;
    var minv = new Array(cols + 1).fill(Infinity);
    var used = new Array(cols + 1).fill(false);
    do {
      used[j0] = true;
      var i0 = p[j0];
      var delta = Infinity;
      var j1 = 0;
      for (var col = 1; col <= cols; col++) {
        if (used[col]) continue;
        var cur = (maxWeight - weights[i0 - 1][col - 1]) - u[i0] - v[col];
        if (cur < minv[col]) { minv[col] = cur; way[col] = j0; }
        if (minv[col] < delta) { delta = minv[col]; j1 = col; }
      }
      for (var update = 0; update <= cols; update++) {
        if (used[update]) { u[p[update]] += delta; v[update] -= delta; }
        else minv[update] -= delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      var previous = way[j0];
      p[j0] = p[previous];
      j0 = previous;
    } while (j0 !== 0);
  }
  var assignment = new Array(rows).fill(-1);
  for (var assignedCol = 1; assignedCol <= cols; assignedCol++) {
    if (p[assignedCol] > 0 && p[assignedCol] <= rows) assignment[p[assignedCol] - 1] = assignedCol - 1;
  }
  return assignment;
}

// Maximum-weight one-captain-per-boat assignment for a fixed shared destination.
// Goals use direct generated-chest outcomes; current/future near-full pile upgrades
// and replacements are intentionally excluded from this separable assignment model.
export function optimizeCaptainAssignment(islandIdx, goal, saveData, options) {
  options = options || {};
  var boatTotal = Math.min(saveData.boatsData && saveData.boatsData.length || 0,
    1 + _num(saveData.sailingData && saveData.sailingData[2] && saveData.sailingData[2][1]));
  var captainTotal = Math.min(saveData.captainsData && saveData.captainsData.length || 0,
    1 + _num(saveData.sailingData && saveData.sailingData[2] && saveData.sailingData[2][0]));
  var candidates = [];
  for (var c = 0; c < captainTotal; c++) {
    if (_num(saveData.captainsData[c] && saveData.captainsData[c][0]) >= 0) candidates.push(c);
  }
  while (candidates.length < boatTotal) candidates.push(-1);
  var matrix = [];
  var routeMatrix = [];
  for (var b = 0; b < boatTotal; b++) {
    matrix[b] = [];
    routeMatrix[b] = [];
    for (var c = 0; c < candidates.length; c++) {
      var route = routeMetrics(b, islandIdx, saveData, Object.assign({}, options, { captainIdx: candidates[c] }));
      routeMatrix[b][c] = route;
      matrix[b][c] = _assignmentScore(route, goal);
    }
  }
  var assignment = _hungarianMax(matrix);
  var rows = [];
  for (var boatIdx = 0; boatIdx < boatTotal; boatIdx++) rows.push(routeMatrix[boatIdx][assignment[boatIdx]]);
  return rows.sort(function(a, b) { return a.boatIdx - b.boatIdx; });
}

export function allArtifactsMaxed(saveData) {
  var tiers = saveData.sailingData && saveData.sailingData[3] || [];
  for (var i = 0; i < artifactCount(); i++) if (_num(tiers[i]) < 6) return false;
  return true;
}

export function collectionWindowStats(routes, capacity, currentCount, saveData, activeCharIdx) {
  var talent = unendingLootSearch(saveData, activeCharIdx);
  var targetCount = talent > 0 ? Math.max(0, capacity - 1) : capacity;
  var free = Math.max(0, targetCount - Math.max(0, currentCount || 0));
  var keptPerHour = 0;
  for (var i = 0; i < routes.length; i++) keptPerHour += routes[i].keptChestsPerHour;
  return { capacity: capacity, targetCount: targetCount, current: Math.max(0, currentCount || 0), free: free,
    keptPerHour: keptPerHour, hoursToFill: keptPerHour > 0 ? free / keptPerHour : Infinity,
    unending: talent };
}

export function recommendMinimumTier(totalGeneratedPerHour, collectHours, capacity, captainIdx, saveData) {
  var distribution = chestTierDistribution(captainIdx, saveData);
  var arrivals = Math.max(0, totalGeneratedPerHour) * Math.max(0, collectHours);
  for (var minTier = 0; minTier <= 5; minTier++) {
    var keep = 0;
    for (var t = minTier; t < 6; t++) keep += distribution.tiers[t].probability;
    if (arrivals * keep <= capacity) return { tier: minTier, kept: arrivals * keep, generated: arrivals };
  }
  return { tier: 5, kept: arrivals * distribution.tiers[5].probability, generated: arrivals };
}

export function availableIslandCount(saveData) {
  var sailing = saveData.sailingData && saveData.sailingData[0] || [];
  var count = 0;
  for (var i = 0; i < islandCount(); i++) {
    var progress = sailing[i];
    if (i === 0 || Number(progress) < 0 || _num(progress) >= islandCloudRequired(i)) count++;
  }
  return count;
}
