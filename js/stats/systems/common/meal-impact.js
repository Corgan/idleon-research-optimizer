// ===== MEAL IMPACT MODULE =====
// Computes the full impact of meal mastery (yellow point) allocation
// on game stats by implementing the formula chains meals feed into.
//
// Each goal defines which meal categories matter and a value(mealBonuses)
// function the optimizer maximizes via greedy numerical differentiation.

import { MealINFO } from '../../data/game/customlists.js';
import { ribbonBonusAt } from '../../../game-helpers.js';
import { cookingMealMulti } from './cooking.js';

// ========== CORE: MealBonusesS computation ==========

export function bonusMultiCook(lv) {
  return 1 + lv / (lv + 5);
}

/** Compute a single meal's contribution to its category total. */
export function mealContribution(idx, masteryLv, saveData, _cookMulti) {
  var mealLv = Number(saveData.mealsData && saveData.mealsData[0] && saveData.mealsData[0][idx]) || 0;
  if (mealLv <= 0) return 0;
  var base = Number(MealINFO[idx][2]) || 0;
  if (base === 0) return 0;
  var cat = MealINFO[idx][5];
  if (cat === 'PxLine') return mealLv * base; // no mastery/ribbon
  var rib = ribbonBonusAt(28 + idx, saveData.ribbonData || [],
    String((saveData.olaData && saveData.olaData[379]) || ''), saveData.weeklyBossData);
  var cm = _cookMulti != null ? _cookMulti : cookingMealMulti(saveData).val;
  return bonusMultiCook(masteryLv) * cm * rib * mealLv * base;
}

/**
 * Compute MealBonusesS for all categories.
 * masteryOverrides: { mealIdx: level } — override mastery levels for specific meals.
 * Returns { category: totalBonus }
 */
export function computeAllMealBonuses(saveData, masteryOverrides) {
  var bonuses = {};
  var cm0 = saveData.cookMasterData && saveData.cookMasterData[0] || [];
  var cmVal = cookingMealMulti(saveData).val;
  for (var i = 0; i < MealINFO.length; i++) {
    var cat = MealINFO[i][5];
    var lv = masteryOverrides && masteryOverrides[i] != null ? masteryOverrides[i] : (Number(cm0[i]) || 0);
    bonuses[cat] = (bonuses[cat] || 0) + mealContribution(i, lv, saveData, cmVal);
  }
  return bonuses;
}

// ========== NON-MEAL POOL COMPUTATION ==========
// For each formula, compute the non-meal portion of the additive pool
// the meal sits in, using existing save data and system functions.
// This lets us compute the FULL pool total = nonMeal + mealBonus.

function _n(v) { return Number(v) || 0; }
function _s(fn) { try { return fn() || 0; } catch(e) { return 0; } }

/**
 * Compute non-meal additive pool for a formula from save data.
 * Uses whatever cached values are available.
 */
function computeNonMealPool(formulaKey, saveData) {
  // Many sub-components are hard to compute independently.
  // We read what we can from save data caches; the rest stays at 0.
  // This underestimates the pool slightly, making marginals slightly too high,
  // but the RELATIVE marginals between meals are still correct.
  return 0; // Will be overridden per-goal where we have data
}

// ========== GOAL DEFINITIONS ==========

/**
 * Each goal has:
 *   id: string
 *   name: string
 *   categories: string[] — meal categories that affect this goal
 *   value(mealBonuses, saveData): number — goal metric given meal bonuses
 *
 * The value function should be monotonically increasing with relevant meal bonuses.
 * It doesn't need to compute the exact game value — it just needs to preserve
 * the relative marginal gains so the optimizer makes correct allocation decisions.
 */

// For simple single-category goals, value = mealBonuses[cat].
// This is optimal because within a single (1+pool/100) multiplier,
// the relative marginal is the same regardless of non-meal pool size.
function simpleGoal(id, name, cats) {
  var catArr = typeof cats === 'string' ? [cats] : cats;
  return {
    id: id, name: name, categories: catArr,
    value: function(mb) {
      var sum = 0;
      for (var i = 0; i < catArr.length; i++) sum += mb[catArr[i]] || 0;
      return sum;
    },
  };
}

// For multi-pool goals where categories enter different multiplier terms,
// we model the formula structure so the optimizer allocates between them correctly.

export var GOALS = [
  // ---- Skill & Lab ----
  simpleGoal('seff', 'Skill Efficiency (all skills)', 'Seff'),
  simpleGoal('lexp', 'Lab EXP (direct only)', 'Lexp'),
  {
    id: 'labexp_full',
    name: 'Lab EXP (Lexp + Seff + GFood)',
    categories: ['Lexp', 'Seff', 'zGoldFood'],
    // LabEXPmulti ∝ pow(AllEff, exponent) * (1 + (lexp + AllSkillxpz)/100)
    // AllEff includes (1 + Seff/100) as one multiplier term.
    // AllSkillxpz includes GoldFoodBonuses("SkillExp") which scales with zGoldFood via GfoodBonusMULTI.
    // zGoldFood enters GfoodBonusMULTI as (1 + (zGoldFood+others)/100), so it's multiplicative on gfood.
    // For allocation: seff goes through pow(,0.25), lexp & gfood are additive in the exp pool.
    value: function(mb) {
      var seff = mb['Seff'] || 0;
      var lexp = mb['Lexp'] || 0;
      var gfood = mb['zGoldFood'] || 0;
      // GfoodBonusMULTI is (1 + (gfood + nonMeal)/100). The SkillExp golden food
      // bonus scales linearly with GfoodBonusMULTI, so gfood enters the skill EXP
      // additive pool proportionally. Model as additive with lexp, scaled down
      // since gfood multiplies the gfood amount (not the full lexp pool).
      return Math.pow(1 + seff / 100, 0.25) * (1 + lexp / 100) * (1 + gfood / 100);
    },
  },
  simpleGoal('pxline', 'Lab Line Width', 'PxLine'),
  simpleGoal('linepct', 'Lab Line %', 'LinePct'),

  // ---- Combat ----
  simpleGoal('totdmg', 'Total Damage', 'TotDmg'),
  simpleGoal('crit', 'Crit Damage', 'Crit'),
  simpleGoal('atkspd', 'Attack Speed', 'AtkSpd'),
  simpleGoal('totacc', 'Total Accuracy', 'TotAcc'),
  simpleGoal('def', 'Defence', 'Def'),
  {
    id: 'combat',
    name: 'Combat (Dmg + Crit + AtkSpd)',
    categories: ['TotDmg', 'Crit', 'AtkSpd'],
    // Damage ∝ (1 + dmg/100) * (1 + crit/100) / (1 - atkspd_reduction)
    // AtkSpd meal reduces attack cooldown, modeled as multiplicative benefit
    value: function(mb) {
      return (1 + (mb['TotDmg'] || 0) / 100) * (1 + (mb['Crit'] || 0) / 100)
        * (1 + (mb['AtkSpd'] || 0) / 100);
    },
  },

  // ---- Cooking ----
  {
    id: 'cooking_speed',
    name: 'Cooking Speed',
    categories: ['Mcook', 'KitchenEff', 'zMealFarm'],
    // CookingSPEED has Mcook and KitchenEff in separate multiplier terms
    // CookingFIRE has KitchenEff and Rcook
    value: function(mb) {
      return (1 + (mb['Mcook'] || 0) / 100) * (1 + (mb['KitchenEff'] || 0) / 100)
        * (1 + (mb['zMealFarm'] || 0) / 100);
    },
  },
  simpleGoal('rcook', 'Cooking Fire Speed', 'Rcook'),
  simpleGoal('kitchc', 'Kitchen Capacity', 'KitchC'),
  simpleGoal('cookexp', 'Cooking EXP', 'CookExp'),

  // ---- Breeding & Pets ----
  simpleGoal('brexp', 'Breeding EXP', 'BrExp'),
  simpleGoal('breed', 'Breedability Speed', 'Breed'),
  simpleGoal('npet', 'New Pet Chance', 'Npet'),
  simpleGoal('petdmg', 'Pet Damage', 'PetDmg'),
  simpleGoal('tppete', 'TP Pets', 'TPpete'),
  simpleGoal('timeegg', 'Time Egg Speed', 'TimeEgg'),

  // ---- Alchemy ----
  {
    id: 'liquid_all',
    name: 'Liquid Capacity (1-4)',
    categories: ['Liquid12', 'Liquid34'],
    value: function(mb) {
      return (mb['Liquid12'] || 0) + (mb['Liquid34'] || 0);
    },
  },
  simpleGoal('liquid12', 'Liquid 1+2 Cap', 'Liquid12'),
  simpleGoal('liquid34', 'Liquid 3+4 Cap', 'Liquid34'),

  // ---- Sailing ----
  simpleGoal('sailing', 'Boat Speed', 'Sailing'),

  // ---- Gaming ----
  simpleGoal('gamingbits', 'Gaming Bits', 'GamingBits'),
  simpleGoal('gamingexp', 'Gaming EXP', 'GamingExp'),
  simpleGoal('sprow', 'Sprout Growth', 'Sprow'),

  // ---- Divinity ----
  simpleGoal('divexp', 'Divinity EXP', 'DivExp'),

  // ---- Library ----
  simpleGoal('lib', 'Library Speed', 'Lib'),
  simpleGoal('vip', 'VIP Bonus', 'VIP'),

  // ---- Farming ----
  simpleGoal('farmexp', 'Farming EXP', 'zFarmExp'),
  simpleGoal('cropevo', 'Crop Evolution Chance', ['zCropEvo', 'zCropEvoSumm']),
  simpleGoal('mealfarm', 'Meal from Farming', 'zMealFarm'),
  simpleGoal('goldfood', 'Golden Food Bonus', 'zGoldFood'),

  // ---- Sneaking ----
  simpleGoal('sneakexp', 'Sneaking EXP', 'zSneakExp'),
  simpleGoal('jade', 'Jade', 'zJade'),

  // ---- Summoning ----
  simpleGoal('sumess', 'Summoning Essence', 'zSumEss'),
  simpleGoal('sumexp', 'Summoning EXP', 'zSummonExp'),

  // ---- Spelunking / W7 ----
  simpleGoal('splkexp', 'Spelunking EXP', 'SplkExp'),
  simpleGoal('splkupg', 'Spelunking Upgrades', 'SplkUpg'),
  simpleGoal('splkpow', 'Spelunking Power', 'SplkPOW'),
  simpleGoal('splkamb', 'Spelunking Ambush', 'SplkAmb'),
  simpleGoal('researchxp', 'Research EXP', 'ResearchXP'),
  simpleGoal('minecurr', 'Mine Currency', 'MineCurr'),
  simpleGoal('polyref', 'Poly Refine Speed', 'PolyRefSpd'),

  // ---- Cash & misc ----
  simpleGoal('cash', 'Cash/Money', 'Cash'),
  simpleGoal('critter', 'Critter', 'Critter'),
  simpleGoal('tdpts', 'TD Points', 'TDpts'),
  simpleGoal('clexp', 'Class EXP (combat)', 'Clexp'),
  simpleGoal('allstat', 'All Stats', 'Stat'),
];

// Build lookup
export var GOAL_MAP = {};
for (var i = 0; i < GOALS.length; i++) GOAL_MAP[GOALS[i].id] = GOALS[i];

// ========== OPTIMIZER ==========

/**
 * Greedy optimizer: distributes yellow points across ALL meals in the goal's
 * categories to maximize the goal's value function.
 *
 * Returns { alloc: {mealIdx: level}, goalValue, curGoalValue, meals: [...] }
 */
export function optimizeForGoal(goalId, budget, saveData) {
  var goal = GOAL_MAP[goalId];
  if (!goal) return null;

  // Identify all meals in the goal's categories
  var relevantMeals = [];
  var catSet = {};
  for (var ci = 0; ci < goal.categories.length; ci++) catSet[goal.categories[ci]] = true;

  var cmVal = cookingMealMulti(saveData).val;

  for (var mi = 0; mi < MealINFO.length; mi++) {
    var cat = MealINFO[mi][5];
    if (!catSet[cat]) continue;
    var mealLv = Number(saveData.mealsData && saveData.mealsData[0] && saveData.mealsData[0][mi]) || 0;
    if (mealLv <= 0) continue;
    var base = Number(MealINFO[mi][2]) || 0;
    if (base <= 0) continue;
    var rib = cat === 'PxLine' ? 1 : ribbonBonusAt(28 + mi, saveData.ribbonData || [],
      String((saveData.olaData && saveData.olaData[379]) || ''), saveData.weeklyBossData);
    var baseWeight = cat === 'PxLine' ? mealLv * base : cmVal * rib * mealLv * base;
    relevantMeals.push({ idx: mi, cat: cat, baseWeight: baseWeight, isPxLine: cat === 'PxLine' });
  }

  if (relevantMeals.length === 0) return { alloc: {}, goalValue: 0, curGoalValue: 0, meals: [] };

  // Start from zero mastery on all meals
  var alloc = {};
  for (var i = 0; i < relevantMeals.length; i++) alloc[relevantMeals[i].idx] = 0;

  // Helper: compute mealBonuses from current allocation
  function buildMealBonuses() {
    var mb = {};
    for (var i = 0; i < relevantMeals.length; i++) {
      var m = relevantMeals[i];
      var lv = alloc[m.idx];
      var mastery = m.isPxLine ? 1 : bonusMultiCook(lv);
      mb[m.cat] = (mb[m.cat] || 0) + m.baseWeight * mastery;
    }
    return mb;
  }

  // Greedy allocation
  for (var p = 0; p < budget; p++) {
    var mb = buildMealBonuses();
    var curVal = goal.value(mb);

    var bestIdx = -1;
    var bestGain = -1;

    for (var i = 0; i < relevantMeals.length; i++) {
      var m = relevantMeals[i];
      var lv = alloc[m.idx];
      if (m.isPxLine) continue; // PxLine doesn't use mastery, no point adding
      // Compute goal value if we add one point to this meal
      var oldMastery = bonusMultiCook(lv);
      var newMastery = bonusMultiCook(lv + 1);
      var delta = m.baseWeight * (newMastery - oldMastery);
      var testMb = {};
      for (var k in mb) testMb[k] = mb[k];
      testMb[m.cat] = (testMb[m.cat] || 0) + delta;
      var newVal = goal.value(testMb);
      var gain = newVal - curVal;
      if (gain > bestGain) { bestGain = gain; bestIdx = i; }
    }

    if (bestIdx >= 0) alloc[relevantMeals[bestIdx].idx]++;
  }

  // Build results
  var finalMb = buildMealBonuses();
  var goalValue = goal.value(finalMb);

  // Current value (with actual mastery levels)
  var cm0 = saveData.cookMasterData && saveData.cookMasterData[0] || [];
  var curMb = {};
  for (var i = 0; i < relevantMeals.length; i++) {
    var m = relevantMeals[i];
    var curLv = Number(cm0[m.idx]) || 0;
    var mastery = m.isPxLine ? 1 : bonusMultiCook(curLv);
    curMb[m.cat] = (curMb[m.cat] || 0) + m.baseWeight * mastery;
  }
  var curGoalValue = goal.value(curMb);

  var mealResults = [];
  for (var i = 0; i < relevantMeals.length; i++) {
    var m = relevantMeals[i];
    var optLv = alloc[m.idx];
    var curLv = Number(cm0[m.idx]) || 0;
    mealResults.push({
      idx: m.idx,
      name: (MealINFO[m.idx][0] || '').replace(/_/g, ' '),
      cat: m.cat,
      optLv: optLv,
      curLv: curLv,
      baseWeight: m.baseWeight,
      mealLv: Number(saveData.mealsData[0][m.idx]) || 0,
      base: Number(MealINFO[m.idx][2]) || 0,
    });
  }
  mealResults.sort(function(a, b) { return b.optLv - a.optLv; });

  return { alloc: alloc, goalValue: goalValue, curGoalValue: curGoalValue, meals: mealResults };
}
