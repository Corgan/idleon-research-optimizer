// ===== SUSHI STATION SYSTEM =====
// All sushi station formulas and calculations.
// Pure computation functions - no side effects, no global state.

import { node } from '../../node.js';
import {
  SUSHI_UPG, SLOT_TO_UPG, TIER_TO_KNOWLEDGE_CAT,
  KNOWLEDGE_CAT_VALUE, MAX_TIER, MAX_SLOTS,
  CURRENCY_PER_TIER, ROG_BONUS_QTY,
} from '../../data/w7/sushi.js';
import { legendPTSbonus } from '../w7/spelunking.js';
import { companions } from '../common/companions.js';
import { optionsListData } from '../../../save/data.js';
import { getLOG } from '../../../formulas.js';

// ===== ROG & UNIQUE SUSHI =====

export function rogBonusQTY(idx, uniqueSushi) {
  if (uniqueSushi > idx) return ROG_BONUS_QTY[idx] || 0;
  return 0;
}

// System resolver for RoG bonuses (used by drop-rate descriptor)
export var sushiRoG = {
  resolve: function(id, ctx) {
    var saveData = ctx.saveData;
    var us = saveData.cachedUniqueSushi || 0;
    var val = rogBonusQTY(id, us);
    return node('RoG Bonus ' + id, val, [
      node('Unique Sushi', us, null, { fmt: 'raw' }),
      node('RoG Value', ROG_BONUS_QTY[id] || 0, null, { fmt: 'raw', note: us > id ? 'Unlocked' : 'Locked (need ' + (id + 1) + ')' }),
    ], { fmt: '+', note: 'sushi RoG ' + id });
  },
};

/** Count consecutive sushi tiers with value >= 0 in Sushi[5]. */
export function computeUniqueSushi(sushiData) {
  var tiers = sushiData?.[5];
  if (!Array.isArray(tiers)) return 0;
  var count = 0;
  for (var i = 0; i < tiers.length; i++) {
    if ((Number(tiers[i]) || 0) >= 0) count = i + 1;
    else break;
  }
  return count;
}

// ===== CURRENCY PER TIER / FUEL COST =====

export function currencyPerTier(tier) {
  if (tier < 10) return CURRENCY_PER_TIER[tier] || 0;
  if (tier < 16) return Math.pow(2.46 - tier / 100, tier) + 5 * tier + Math.pow(tier, 2);
  return Math.pow(2.31, tier);
}

export function fuelCostPerTier(tier) {
  if (tier === 5) return 176;
  return 10 * Math.pow(1.83, tier) - Math.pow(tier, 2);
}

// ===== UPGRADES =====

/**
 * Tier required to unlock upgrade slot index `t` (0-44).
 * Game formula: UpgLvREQ(t)
 */
export function upgLvReq(t) {
  return Math.floor(1 + Math.min(3, t) + Math.min(6, t)
    + (3 * t - Math.max(0, t - 4) - Math.max(0, t - 8)
    + Math.floor(t / 6) + Math.floor(t / 17)));
}

/**
 * Upgrade quantity (bonus) for SushiUPG[upgIdx] at its current level.
 * Game formula: SushiUPG[upgIdx][3] * Sushi[2][upgIdx]
 */
export function upgradeQTY(upgIdx, upgLevels) {
  var lv = Number(upgLevels[upgIdx]) || 0;
  return (SUSHI_UPG[upgIdx]?.[3] || 0) * lv;
}

/**
 * Get the SushiUPG index for a given slot position.
 */
export function slotUpgIdx(slot) {
  return SLOT_TO_UPG[slot];
}

/**
 * Cost to buy the next level of a given slot (0-44).
 * Game formula: UpgCost(slot)
 */
export function upgCost(slot, upgLevels, knowledgeTotals) {
  var upgIdx = SLOT_TO_UPG[slot];
  var upg = SUSHI_UPG[upgIdx];
  if (!upg) return Infinity;
  var costDN = upg[4] !== 0 ? Math.max(0.1, upg[4]) : 1;
  var t = slot;
  var wholesaleReduction = 1 / (1 + upgradeQTY(36, upgLevels) / 100);
  var rogCheaper = Math.max(0.1, 1 - Math.max(_rogBonusQTYLocal(26, upgLevels), _rogBonusQTYLocal(44, upgLevels)) / 100);
  var knowledgeCheaper = 1 / (1 + (knowledgeTotals?.[6] || 0) / 100);
  var costBase = upg[2];
  var currentLv = Number(upgLevels[upgIdx]) || 0;
  return costDN
    * (5 + t + Math.pow(Math.max(0, t - 1), 2))
    * Math.pow(1.5 + Math.max(0, t - 3) / 16, Math.max(0, t - 4))
    * Math.pow(1.3, Math.max(0, t - 20))
    * wholesaleReduction * rogCheaper * knowledgeCheaper
    * Math.pow(costBase, currentLv);
}

function _rogBonusQTYLocal(idx, upgLevels) {
  return 0;
}

// ===== KNOWLEDGE =====

/**
 * Knowledge bonus for a specific sushi tier.
 */
export function knowledgeBonusSpecific(tier, sushiData) {
  var cat = TIER_TO_KNOWLEDGE_CAT[tier];
  if (cat === undefined) return 0;
  var baseVal = KNOWLEDGE_CAT_VALUE[cat] || 0;
  var knowledgeLv = Number(sushiData?.[7]?.[tier]) || 0;
  var discoveryMult = Math.min(2, 1 + (Number(sushiData?.[5]?.[tier]) || 0));
  return Math.max(0, baseVal * knowledgeLv * discoveryMult * (1 + tier / 30));
}

/**
 * Knowledge bonus totals per category (11 categories).
 */
export function knowledgeBonusTotals(sushiData) {
  var totals = new Array(11).fill(0);
  for (var tier = 0; tier <= MAX_TIER; tier++) {
    var cat = TIER_TO_KNOWLEDGE_CAT[tier];
    totals[cat] += knowledgeBonusSpecific(tier, sushiData);
  }
  return totals;
}

// ===== FUEL =====

/**
 * Fuel generation rate (per hour).
 */
export function fuelGenPerHr(upgLevels, sushiData, knowledgeTotals, orangeFireSum, hasBundleV) {
  var bundleMult = 1 + Math.min(1, hasBundleV ? 1 : 0);
  var upgFuel = upgradeQTY(8, upgLevels) + upgradeQTY(9, upgLevels)
    + upgradeQTY(10, upgLevels) + upgradeQTY(11, upgLevels) + upgradeQTY(12, upgLevels);
  var knowledgeFuel = knowledgeTotals?.[4] || 0;
  var knowledgeSpec27 = knowledgeBonusSpecific(27, sushiData);
  var knowledgeSpec36 = knowledgeBonusSpecific(36, sushiData);
  var knowledgeSpec45 = knowledgeBonusSpecific(45, sushiData);
  var fbMulti9  = 1 + (Number(upgLevels[9]) || 0) / 100;
  var fbMulti10 = 1 + (Number(upgLevels[10]) || 0) / 100;
  var fbMulti11 = 1 + (Number(upgLevels[11]) || 0) / 100;
  var fbMulti12 = 1 + (Number(upgLevels[12]) || 0) / 100;
  return 50 * bundleMult
    * (1 + upgFuel / 100)
    * (1 + orangeFireSum / 100)
    * (1 + knowledgeFuel / 100)
    * (1 + knowledgeSpec27 / 100) * (1 + knowledgeSpec36 / 100) * (1 + knowledgeSpec45 / 100)
    * fbMulti9 * fbMulti10 * fbMulti11 * fbMulti12;
}

/**
 * Fuel capacity.
 */
export function fuelCapacity(upgLevels, knowledgeTotals, hasBundleV) {
  var bundleMult = 1 + Math.min(1, hasBundleV ? 1 : 0);
  var upgCap = upgradeQTY(1, upgLevels) + upgradeQTY(2, upgLevels)
    + upgradeQTY(3, upgLevels) + upgradeQTY(4, upgLevels) + upgradeQTY(5, upgLevels);
  var knowledgeCap = knowledgeTotals?.[3] || 0;
  var capMulti2 = 1 + (Number(upgLevels[2]) || 0) / 100;
  var capMulti3 = 1 + (Number(upgLevels[3]) || 0) / 100;
  var capMulti4 = 1 + (Number(upgLevels[4]) || 0) / 100;
  var capMulti5 = 1 + (Number(upgLevels[5]) || 0) / 100;
  return (200 + knowledgeCap) * bundleMult
    * (1 + upgCap / 100)
    * capMulti2 * capMulti3 * capMulti4 * capMulti5;
}

// ===== CURRENCY (BUCKS) =====

/**
 * Orange fire sum: for each active slot with red fireplace,
 * adds (tierOfSlot + 1) * FireplaceEffect(0).
 */
export function computeOrangeFireSum(sushiData, fireplaceEffBase) {
  var sum = 0;
  for (var s = 0; s < MAX_SLOTS; s++) {
    var tier = Number(sushiData?.[0]?.[s]);
    var fireRaw = sushiData?.[3]?.[s % 15];
    if (tier >= 0 && fireRaw !== undefined && fireRaw !== null && Number(fireRaw) === 0) {
      sum += (tier + 1) * fireplaceEffBase;
    }
  }
  return sum;
}

/**
 * Fireplace effect base multiplier.
 */
export function fireplaceEffectBase(knowledgeTotals, sparks) {
  var s = Math.max(sparks, 1);
  var sparkMulti = sparks > 0
    ? 0.2 * (Math.log(s) / Math.log(2)) + getLOG(s)
    : 0;
  return (1 + (knowledgeTotals?.[9] || 0) / 100) * (1 + sparkMulti / 100);
}

/**
 * Slot effect base multiplier.
 */
export function slotEffectBase(knowledgeTotals) {
  return 1 + (knowledgeTotals?.[8] || 0) / 100;
}

/**
 * Currency per slot per hour.
 */
export function currencyPerSlot(slotIdx, sushiData, currencyMulti, knowledgeTotals) {
  var tier = Number(sushiData?.[0]?.[slotIdx]);
  if (tier < 0 || isNaN(tier)) return 0;

  var slotDN = 1;
  if (Number(sushiData?.[1]?.[slotIdx]) === 1) {
    slotDN *= (1 + 50 * slotEffectBase(knowledgeTotals) / 100);
  }
  var fireType = Number(sushiData?.[3]?.[slotIdx % 15]) || 0;
  if (fireType === 1) {
    var fpBase = fireplaceEffectBase(knowledgeTotals, Number(sushiData?.[4]?.[2]) || 0);
    slotDN *= (1 + 150 * fpBase / 100);
  }
  return slotDN * currencyMulti * currencyPerTier(tier);
}

/**
 * Currency multiplier (applied to all slots).
 */
export function computeCurrencyMulti(upgLevels, sushiData, uniqueSushi, knowledgeTotals, externalSources) {
  var arcade67 = externalSources?.arcade67 || 0;
  var gridBonus189 = externalSources?.gridBonus189 || 0;
  var mineheadBonus11 = externalSources?.mineheadBonus11 || 0;
  var overtunedMulti = computeOvertunedMulti(sushiData);
  var atom14 = externalSources?.atom14 || 0;
  var sailing39 = externalSources?.sailing39 || 0;
  var hasBundleV = externalSources?.hasBundleV ? 1 : 0;
  var gamingSuperBit67 = externalSources?.gamingSuperBit67 || 0;
  var buttonBonus2 = externalSources?.buttonBonus2 || 0;

  var surchargeSum = upgradeQTY(30, upgLevels) + upgradeQTY(31, upgLevels)
    + upgradeQTY(32, upgLevels) + upgradeQTY(33, upgLevels) + upgradeQTY(34, upgLevels)
    + 100 * gamingSuperBit67;

  return (1 + arcade67 / 100)
    * Math.pow(1.1, uniqueSushi)
    * (1 + Math.min(1, hasBundleV))
    * (1 + surchargeSum / 100)
    * (1 + (knowledgeTotals?.[0] || 0) / 100)
    * (1 + buttonBonus2 / 100)
    * (1 + gridBonus189 / 100)
    * (1 + upgradeQTY(40, upgLevels) / 100)
    * Math.max(1, Math.min(1.25, 1 + mineheadBonus11 / 100))
    * (1 + (upgradeQTY(41, upgLevels) + upgradeQTY(43, upgLevels)) / 100)
    * (1 + overtunedMulti / 100)
    * (1 + atom14 / 100)
    * (1 + 100 * sailing39 / 100);
}

/**
 * Total Bucks/hr from all slots.
 */
export function totalBucksPerHr(sushiData, upgLevels, uniqueSushi, knowledgeTotals, externalSources) {
  var multi = computeCurrencyMulti(upgLevels, sushiData, uniqueSushi, knowledgeTotals, externalSources);
  var total = 0;
  for (var s = 0; s < MAX_SLOTS; s++) {
    total += currencyPerSlot(s, sushiData, multi, knowledgeTotals);
  }
  return total;
}

/**
 * Overtuned multiplier (from Sushi[4][1] = SPA amount).
 */
export function computeOvertunedMulti(sushiData) {
  var spa = Number(sushiData?.[4]?.[1]) || 0;
  if (spa <= 0) return 0;
  var x = Math.max(spa / 1e6, 1);
  return 5 * (Math.log(x) / Math.log(2)) + 10 * getLOG(x);
}

// ===== SLOTS =====

export function slotsOwned(upgLevels) {
  return Math.min(MAX_SLOTS, 10 + upgradeQTY(0, upgLevels));
}

export function countActiveSlots(sushiData) {
  var count = 0;
  for (var s = 0; s < MAX_SLOTS; s++) {
    if ((Number(sushiData?.[0]?.[s]) || 0) >= 0) count++;
  }
  return count;
}

export function maxCookTier(upgLevels) {
  return Math.round(upgradeQTY(6, upgLevels));
}

export function bonusCookTierPct(upgLevels, knowledgeTotals) {
  return upgradeQTY(7, upgLevels) + (knowledgeTotals?.[2] || 0);
}

export function freeShakerChance(upgLevels, knowledgeTotals, gridBonus188) {
  return Math.min(0.6, (upgradeQTY(21, upgLevels) + (knowledgeTotals?.[5] || 0) + (gridBonus188 || 0)) / 100);
}

export function saffronHrs(upgLevels) {
  return Math.round(1 + upgradeQTY(22, upgLevels));
}

export function perfectoOdds(tier, knowledgeTotals) {
  return 0.6 * Math.pow(0.81, tier) / (1 + tier / 8) * (1 + (knowledgeTotals?.[10] || 0) / 100);
}

// ===== KNOWLEDGE XP =====

export function knowledgeXPReq(lv) {
  return (3 + lv + Math.pow(lv, 1.5)) * Math.pow(1.5, Math.max(0, lv - 2));
}

export function knowledgeXPBase(upgLevels) {
  return 1 + upgradeQTY(37, upgLevels) / 10;
}

export function knowledgeXPMulti(slotIdx, sushiData, upgLevels, knowledgeTotals) {
  var fireType = Number(sushiData?.[3]?.[slotIdx % 15]) || 0;
  var pinkBonus = 0;
  if (fireType === 3) {
    var fpBase = fireplaceEffectBase(knowledgeTotals, Number(sushiData?.[4]?.[2]) || 0);
    pinkBonus = 100 * fpBase;
  }
  return (1 + upgradeQTY(38, upgLevels) / 100)
    * (1 + pinkBonus / 100)
    * (1 + (knowledgeTotals?.[1] || 0) / 100);
}

/**
 * Fireplace effect values for each type.
 */
export function fireplaceEffectByType(type, knowledgeTotals, sparks) {
  var fpBase = fireplaceEffectBase(knowledgeTotals, sparks);
  if (type === 0) return fpBase;
  if (type === 1) return 150 * fpBase;
  if (type === 2) return 20 * fpBase;
  if (type === 3) return 100 * fpBase;
  return 0;
}

/**
 * Build a summary of the player's sushi station.
 */
export function buildSushiSummary(sushiData, upgLevels, uniqueSushi, knowledgeTotals, externalSources) {
  var upgLvs = {};
  for (var slot = 0; slot < SLOT_TO_UPG.length; slot++) {
    var ui = SLOT_TO_UPG[slot];
    upgLvs[slot] = { upgIdx: ui, name: SUSHI_UPG[ui]?.[0] || '?', level: Number(upgLevels[ui]) || 0, maxLv: SUSHI_UPG[ui]?.[1] || 0, tierReq: upgLvReq(slot) };
  }

  var currMulti = computeCurrencyMulti(upgLevels, sushiData, uniqueSushi, knowledgeTotals, externalSources);
  var totalBucks = totalBucksPerHr(sushiData, upgLevels, uniqueSushi, knowledgeTotals, externalSources);
  var fuelGen = fuelGenPerHr(upgLevels, sushiData, knowledgeTotals,
    computeOrangeFireSum(sushiData, fireplaceEffectBase(knowledgeTotals, Number(sushiData?.[4]?.[2]) || 0)),
    externalSources?.hasBundleV);
  var fuelCap = fuelCapacity(upgLevels, knowledgeTotals, externalSources?.hasBundleV);
  var activeSlots = countActiveSlots(sushiData);
  var maxCook = maxCookTier(upgLevels);

  return { upgLvs: upgLvs, currMulti: currMulti, totalBucks: totalBucks, fuelGen: fuelGen, fuelCap: fuelCap, activeSlots: activeSlots, maxCook: maxCook, uniqueSushi: uniqueSushi };
}

// ==================== ROO BONUS ====================

export function computeRooBonus(idx, saveData) {
  var ola271 = Number(optionsListData[271]) || 0;
  var tiers = Math.max(0, Math.ceil((ola271 - idx) / 7));
  if (tiers <= 0) return 0;
  var legend26 = legendPTSbonus(26, saveData) || 0;
  var comp51 = 0;
  try { comp51 = companions(51, saveData) || 0; } catch(e) {}
  // RooMegafeather uses ola[279] as single progress counter
  var ola279 = Number(optionsListData[279]) || 0;
  var megaIdxs = [1, 3, 6, 8, 11];
  var rooAll = 0;
  for (var mi = 0; mi < megaIdxs.length; mi++) {
    var feat = ola279 > megaIdxs[mi] ? (megaIdxs[mi] === 11 ? ola279 - 11 : 1) : 0;
    rooAll += 50 * Math.min(1, feat);
    if (mi === 4) rooAll += 25 * Math.max(0, feat - 1);
  }
  // Per-index multipliers: [3, 3, 5, 2, 2, 0.5, 3]
  var perIdx = [3, 3, 5, 2, 2, 0.5, 3];
  var multi = perIdx[idx] != null ? perIdx[idx] : 3;
  return multi * (1 + legend26 / 100) * (1 + comp51) * (1 + rooAll / 100) * tiers;
}
