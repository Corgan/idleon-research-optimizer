// ===== SUSHI STATION - FORMULAS =====
// Pure computation functions — no side effects, no global state.
// Mirrors the _customBlock_SushiStuff function from the game source.

import {
  SUSHI_UPG, SLOT_TO_UPG, TIER_TO_KNOWLEDGE_CAT,
  KNOWLEDGE_CAT_VALUE, MAX_TIER, MAX_SLOTS,
  currencyPerTier, fuelCostPerTier,
} from './game-data.js';

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
  const lv = Number(upgLevels[upgIdx]) || 0;
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
  const upgIdx = SLOT_TO_UPG[slot];
  const upg = SUSHI_UPG[upgIdx];
  if (!upg) return Infinity;
  const costDN = upg[4] !== 0 ? Math.max(0.1, upg[4]) : 1;
  const t = slot;
  const wholesaleReduction = 1 / (1 + upgradeQTY(36, upgLevels) / 100);
  const rogCheaper = Math.max(0.1, 1 - Math.max(_rogBonusQTYLocal(26, upgLevels), _rogBonusQTYLocal(44, upgLevels)) / 100);
  const knowledgeCheaper = 1 / (1 + (knowledgeTotals?.[6] || 0) / 100);
  const costBase = upg[2];
  const currentLv = Number(upgLevels[upgIdx]) || 0;
  return costDN
    * (5 + t + Math.pow(Math.max(0, t - 1), 2))
    * Math.pow(1.5 + Math.max(0, t - 3) / 16, Math.max(0, t - 4))
    * Math.pow(1.3, Math.max(0, t - 20))
    * wholesaleReduction * rogCheaper * knowledgeCheaper
    * Math.pow(costBase, currentLv);
}

// Local helper — RoG bonus from upgrade 44 (Sushi Service Bonuses, which unlocks RoG).
// For cost reduction we just need RoG[26] and RoG[44] values if unique sushi is high enough.
function _rogBonusQTYLocal(idx, upgLevels) {
  // RoG[26] = 25% cheaper sushi (requires 27 unique), RoG[44] = 50% (requires 45 unique)
  // In formula context we don't have uniqueSushi — caller should pass it or we approximate.
  // For now return 0; the UI will use the proper rogBonusQTY from game-data.
  return 0;
}

// ===== KNOWLEDGE =====

/**
 * Knowledge bonus for a specific sushi tier.
 * Game: Research[35][cat] * Sushi[7][tier] * min(2, 1 + Sushi[5][tier]) * (1 + tier/30)
 */
export function knowledgeBonusSpecific(tier, sushiData) {
  const cat = TIER_TO_KNOWLEDGE_CAT[tier];
  if (cat === undefined) return 0;
  const baseVal = KNOWLEDGE_CAT_VALUE[cat] || 0;
  const knowledgeLv = Number(sushiData?.[7]?.[tier]) || 0;
  const discoveryMult = Math.min(2, 1 + (Number(sushiData?.[5]?.[tier]) || 0));
  return Math.max(0, baseVal * knowledgeLv * discoveryMult * (1 + tier / 30));
}

/**
 * Knowledge bonus totals per category (11 categories).
 * Game: sum of knowledgeBonusSpecific for all tiers in that category.
 */
export function knowledgeBonusTotals(sushiData) {
  const totals = new Array(11).fill(0);
  for (let tier = 0; tier <= MAX_TIER; tier++) {
    const cat = TIER_TO_KNOWLEDGE_CAT[tier];
    totals[cat] += knowledgeBonusSpecific(tier, sushiData);
  }
  return totals;
}

// ===== FUEL =====

/**
 * Fuel generation rate (per hour, units/hr).
 * Game: FuelGen formula
 */
export function fuelGenPerHr(upgLevels, sushiData, knowledgeTotals, orangeFireSum, hasBundleV) {
  const bundleMult = 1 + Math.min(1, hasBundleV ? 1 : 0);
  const upgFuel = upgradeQTY(8, upgLevels) + upgradeQTY(9, upgLevels)
    + upgradeQTY(10, upgLevels) + upgradeQTY(11, upgLevels) + upgradeQTY(12, upgLevels);
  const knowledgeFuel = knowledgeTotals?.[4] || 0;
  const knowledgeSpec27 = knowledgeBonusSpecific(27, sushiData);
  const knowledgeSpec36 = knowledgeBonusSpecific(36, sushiData);
  const knowledgeSpec45 = knowledgeBonusSpecific(45, sushiData);
  // Unique fuel gen multi from Fastburn II-V: game uses (1 + Sushi[2][9..12] / 100)
  const fbMulti9  = 1 + (Number(upgLevels[9]) || 0) / 100;
  const fbMulti10 = 1 + (Number(upgLevels[10]) || 0) / 100;
  const fbMulti11 = 1 + (Number(upgLevels[11]) || 0) / 100;
  const fbMulti12 = 1 + (Number(upgLevels[12]) || 0) / 100;
  return 50 * bundleMult
    * (1 + upgFuel / 100)
    * (1 + orangeFireSum / 100)
    * (1 + knowledgeFuel / 100)
    * (1 + knowledgeSpec27 / 100) * (1 + knowledgeSpec36 / 100) * (1 + knowledgeSpec45 / 100)
    * fbMulti9 * fbMulti10 * fbMulti11 * fbMulti12;
}

/**
 * Fuel capacity.
 * Game: FuelCap formula
 */
export function fuelCapacity(upgLevels, knowledgeTotals, hasBundleV) {
  const bundleMult = 1 + Math.min(1, hasBundleV ? 1 : 0);
  const upgCap = upgradeQTY(1, upgLevels) + upgradeQTY(2, upgLevels)
    + upgradeQTY(3, upgLevels) + upgradeQTY(4, upgLevels) + upgradeQTY(5, upgLevels);
  const knowledgeCap = knowledgeTotals?.[3] || 0;
  // Unique cap multi from Fuel Cap II-V: Sushi[2][2..5]
  const capMulti2 = 1 + (Number(upgLevels[2]) || 0) / 100;
  const capMulti3 = 1 + (Number(upgLevels[3]) || 0) / 100;
  const capMulti4 = 1 + (Number(upgLevels[4]) || 0) / 100;
  const capMulti5 = 1 + (Number(upgLevels[5]) || 0) / 100;
  return (200 + knowledgeCap) * bundleMult
    * (1 + upgCap / 100)
    * capMulti2 * capMulti3 * capMulti4 * capMulti5;
}

// ===== CURRENCY (BUCKS) =====

/**
 * Compute orange fire sum: for each active slot with red fireplace (Sushi[3][slot%15]==0),
 * adds (tierOfSlot + 1) * FireplaceEffect(0).
 */
export function computeOrangeFireSum(sushiData, fireplaceEffectBase) {
  let sum = 0;
  for (let s = 0; s < MAX_SLOTS; s++) {
    const tier = Number(sushiData?.[0]?.[s]);
    const fireRaw = sushiData?.[3]?.[s % 15];
    if (tier >= 0 && fireRaw !== undefined && fireRaw !== null && Number(fireRaw) === 0) {
      sum += (tier + 1) * fireplaceEffectBase;
    }
  }
  return sum;
}

/**
 * Fireplace effect base multiplier.
 * FireplaceEffect(99) = (1 + knowledgeTotals[9]/100) * (1 + FireplaceSparkMulti/100)
 * FireplaceSparkMulti = 0.2 * Log2(sparks) + getLOG(sparks)
 * Game Log2/getLOG clamp input to max(e, 1).
 */
export function fireplaceEffectBase(knowledgeTotals, sparks) {
  const s = Math.max(sparks, 1);
  const sparkMulti = sparks > 0
    ? 0.2 * Math.log2(s) + Math.log10(s)
    : 0;
  return (1 + (knowledgeTotals?.[9] || 0) / 100) * (1 + sparkMulti / 100);
}

/**
 * Slot effect base multiplier.
 * SlotEffect(99) = 1 + knowledgeTotals[8] / 100
 */
export function slotEffectBase(knowledgeTotals) {
  return 1 + (knowledgeTotals?.[8] || 0) / 100;
}

/**
 * Currency per slot per hour.
 * For a given slot, compute how many Bucks/hr it generates.
 */
export function currencyPerSlot(slotIdx, sushiData, currencyMulti, knowledgeTotals) {
  const tier = Number(sushiData?.[0]?.[slotIdx]);
  if (tier < 0 || isNaN(tier)) return 0;

  let slotDN = 1;
  // Hot slot effect (Sushi[1][slot] == 1)
  if (Number(sushiData?.[1]?.[slotIdx]) === 1) {
    slotDN *= (1 + 50 * slotEffectBase(knowledgeTotals) / 100);
  }
  // Green fire (Sushi[3][slot%15] == 1 → Barium fire, multiplier)
  const fireType = Number(sushiData?.[3]?.[slotIdx % 15]) || 0;
  if (fireType === 1) {
    const fpBase = fireplaceEffectBase(knowledgeTotals, Number(sushiData?.[4]?.[2]) || 0);
    slotDN *= (1 + 150 * fpBase / 100);
  }
  return slotDN * currencyMulti * currencyPerTier(tier);
}

/**
 * Currency multiplier (applied to all slots).
 * Game: CurrencyMulti formula
 */
export function computeCurrencyMulti(upgLevels, sushiData, uniqueSushi, knowledgeTotals, externalSources) {
  const arcade67 = externalSources?.arcade67 || 0;
  const gridBonus189 = externalSources?.gridBonus189 || 0;
  const mineheadBonus11 = externalSources?.mineheadBonus11 || 0;
  const overtunedMulti = computeOvertunedMulti(sushiData);
  const atom14 = externalSources?.atom14 || 0;
  const sailing39 = externalSources?.sailing39 || 0;
  const hasBundleV = externalSources?.hasBundleV ? 1 : 0;
  const gamingSuperBit67 = externalSources?.gamingSuperBit67 || 0;

  const surchargeSum = upgradeQTY(30, upgLevels) + upgradeQTY(31, upgLevels)
    + upgradeQTY(32, upgLevels) + upgradeQTY(33, upgLevels) + upgradeQTY(34, upgLevels)
    + 100 * gamingSuperBit67;

  return (1 + arcade67 / 100)
    * Math.pow(1.1, uniqueSushi)
    * (1 + Math.min(1, hasBundleV))
    * (1 + surchargeSum / 100)
    * (1 + (knowledgeTotals?.[0] || 0) / 100)
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
  const multi = computeCurrencyMulti(upgLevels, sushiData, uniqueSushi, knowledgeTotals, externalSources);
  let total = 0;
  for (let s = 0; s < MAX_SLOTS; s++) {
    total += currencyPerSlot(s, sushiData, multi, knowledgeTotals);
  }
  return total;
}

/**
 * Overtuned multiplier (from Sushi[4][1] = SPA amount).
 * Game: 5 * Log2(spa/1e6) + 10 * getLOG(spa/1e6)
 * Game Log2/getLOG clamp input to max(e, 1).
 */
export function computeOvertunedMulti(sushiData) {
  const spa = Number(sushiData?.[4]?.[1]) || 0;
  if (spa <= 0) return 0;
  const x = Math.max(spa / 1e6, 1);
  return 5 * Math.log2(x) + 10 * Math.log10(x);
}

// ===== SLOTS =====

/**
 * Total slots owned: base 10 + upgradeQTY(0)
 * (simplified; game also adds Hot/Cold/Milktoast but those are separate special slots)
 */
export function slotsOwned(upgLevels) {
  return Math.min(MAX_SLOTS, 10 + upgradeQTY(0, upgLevels));
}

/**
 * Count active (non-empty) slots from save data.
 */
export function countActiveSlots(sushiData) {
  let count = 0;
  for (let s = 0; s < MAX_SLOTS; s++) {
    if ((Number(sushiData?.[0]?.[s]) || 0) >= 0) count++;
  }
  return count;
}

/**
 * Max cook tier from Superior Sushi Skillz upgrade.
 */
export function maxCookTier(upgLevels) {
  return Math.round(upgradeQTY(6, upgLevels));
}

/**
 * Bonus cook tier % from Quality Freshness + knowledge.
 */
export function bonusCookTierPct(upgLevels, knowledgeTotals) {
  return upgradeQTY(7, upgLevels) + (knowledgeTotals?.[2] || 0);
}

/**
 * Free shaker chance.
 */
export function freeShakerChance(upgLevels, knowledgeTotals, gridBonus188) {
  return Math.min(0.6, (upgradeQTY(21, upgLevels) + (knowledgeTotals?.[5] || 0) + (gridBonus188 || 0)) / 100);
}

/**
 * Saffron hours generated.
 */
export function saffronHrs(upgLevels) {
  return Math.round(1 + upgradeQTY(22, upgLevels));
}

/**
 * Perfecto odds for a given tier.
 * Game: PerfectOdds(t) = 0.6 * 0.81^t / (1 + t/8) * (1 + knowledgeTotals[10]/100)
 */
export function perfectoOdds(tier, knowledgeTotals) {
  return 0.6 * Math.pow(0.81, tier) / (1 + tier / 8) * (1 + (knowledgeTotals?.[10] || 0) / 100);
}

/**
 * Knowledge XP required for a given knowledge level.
 * Game: KnowledgeXP_req(lv) = (3 + lv + lv^1.5) * 1.5^max(0, lv-2)
 */
export function knowledgeXPReq(lv) {
  return (3 + lv + Math.pow(lv, 1.5)) * Math.pow(1.5, Math.max(0, lv - 2));
}

/**
 * Knowledge XP base per sushi created.
 * Game: KnowledgeXP_base = 1 + upgradeQTY(37) / 10
 */
export function knowledgeXPBase(upgLevels) {
  return 1 + upgradeQTY(37, upgLevels) / 10;
}

/**
 * Knowledge XP multiplier for a specific slot.
 * Game: KnowledgeXP_multi(slotIdx) = (1 + upgQTY(38)/100) * (1 + pinkFireBonus/100) * (1 + knowledgeTotals[1]/100)
 * where pinkFireBonus = FireplaceEffect(3) if Sushi[3][slot%15] == 3, else 0
 */
export function knowledgeXPMulti(slotIdx, sushiData, upgLevels, knowledgeTotals) {
  const fireType = Number(sushiData?.[3]?.[slotIdx % 15]) || 0;
  let pinkBonus = 0;
  if (fireType === 3) {
    const fpBase = fireplaceEffectBase(knowledgeTotals, Number(sushiData?.[4]?.[2]) || 0);
    pinkBonus = 100 * fpBase; // FireplaceEffect(3) = 100 * fpBase
  }
  return (1 + upgradeQTY(38, upgLevels) / 100)
    * (1 + pinkBonus / 100)
    * (1 + (knowledgeTotals?.[1] || 0) / 100);
}

/**
 * Fireplace effect values for each type.
 * type 0 (red/charcoal): +fpBase per sushi tier in column -> fuel gen
 * type 1 (green/barium): 150*fpBase % -> bucks multi per slot
 * type 2 (blue/copper): (unused in formulas, +2 tier chance)
 * type 3 (pink/lithium): 100*fpBase % -> knowledge XP multi per slot
 */
export function fireplaceEffectByType(type, knowledgeTotals, sparks) {
  const fpBase = fireplaceEffectBase(knowledgeTotals, sparks);
  if (type === 0) return fpBase;           // per tier of sushi above
  if (type === 1) return 150 * fpBase;     // green: bucks %
  if (type === 2) return 20 * fpBase;      // blue: +tier % chance
  if (type === 3) return 100 * fpBase;     // pink: knowledge XP %
  return 0;
}

/**
 * Build a summary of the player's sushi station.
 */
export function buildSushiSummary(sushiData, upgLevels, uniqueSushi, knowledgeTotals, externalSources) {
  // Upgrade levels via the slot mapping
  const upgLvs = {};
  for (let slot = 0; slot < SLOT_TO_UPG.length; slot++) {
    const ui = SLOT_TO_UPG[slot];
    upgLvs[slot] = { upgIdx: ui, name: SUSHI_UPG[ui]?.[0] || '?', level: Number(upgLevels[ui]) || 0, maxLv: SUSHI_UPG[ui]?.[1] || 0, tierReq: upgLvReq(slot) };
  }

  const currMulti = computeCurrencyMulti(upgLevels, sushiData, uniqueSushi, knowledgeTotals, externalSources);
  const totalBucks = totalBucksPerHr(sushiData, upgLevels, uniqueSushi, knowledgeTotals, externalSources);
  const fuelGen = fuelGenPerHr(upgLevels, sushiData, knowledgeTotals,
    computeOrangeFireSum(sushiData, fireplaceEffectBase(knowledgeTotals, Number(sushiData?.[4]?.[2]) || 0)),
    externalSources?.hasBundleV);
  const fuelCap = fuelCapacity(upgLevels, knowledgeTotals, externalSources?.hasBundleV);
  const activeSlots = countActiveSlots(sushiData);
  const maxCook = maxCookTier(upgLevels);

  return { upgLvs, currMulti, totalBucks, fuelGen, fuelCap, activeSlots, maxCook, uniqueSushi };
}
