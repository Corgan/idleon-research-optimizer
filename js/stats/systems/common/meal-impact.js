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

/** Total yellow points available for a full reallocation. */
export function yellowPointBudget(saveData) {
  var rank = Number(saveData.cookMasterData && saveData.cookMasterData[1]
    && saveData.cookMasterData[1][0]) || 0;
  var companion = saveData.companionIds && saveData.companionIds.has(87) ? 5 : 0;
  var grid190 = Math.round(Number(saveData.gridLevels && saveData.gridLevels[190]) || 0);
  return Math.max(0, Math.round(rank + 1 + companion + grid190));
}

// ========== GOAL DEFINITIONS ==========

/**
 * Each goal has:
 *   id: string
 *   name: string
 *   categories: string[] — meal categories that affect this goal
 *   value(mealBonuses): number — direct MealBonusesS category total
 */

function simpleGoal(id, name, category, options) {
  options = options || {};
  return {
    id: id, name: name, categories: [category], unit: options.unit || 'percent',
    note: options.note || '',
    value: function(mb) {
      return mb[category] || 0;
    },
  };
}

export function farmingMealCookingScale(saveData, activeCharIdx) {
  activeCharIdx = Math.max(0, Math.round(Number(activeCharIdx) || 0));
  var farmingLv = Number(saveData.lv0AllData && saveData.lv0AllData[activeCharIdx]
    && saveData.lv0AllData[activeCharIdx][16]) || 0;
  return { activeCharIdx: activeCharIdx, farmingLv: farmingLv,
    steps: Math.ceil((farmingLv + 1) / 50) };
}

export function kitchenCookingAggregate(saveData, mode) {
  var isRecipe = mode === 'recipe';
  var kitchens = saveData.cookingData || [];
  var gemKitchenCount = Math.max(0, Math.floor(Number(saveData.gemItemsData
    && saveData.gemItemsData[120]) || 0));
  var totalBaseWeight = 0;
  var weightedStepTotal = 0;
  var totalUpgradeLevels = 0;
  var minSteps = Infinity;
  var maxSteps = 0;
  var kitchenCount = 0;

  for (var i = 0; i < kitchens.length; i++) {
    var kitchen = kitchens[i];
    if (!kitchen || kitchen.length <= 8 || Number(kitchen[0]) === 0) continue;
    var speedLv = Number(kitchen[6]) || 0;
    var fireLv = Number(kitchen[7]) || 0;
    var luckLv = Number(kitchen[8]) || 0;
    var upgradeLevels = speedLv + fireLv + luckLv;
    var steps = Math.floor(upgradeLevels / 10);
    var upgradeLv = isRecipe ? fireLv : speedLv;
    var gemMulti = gemKitchenCount > i ? (isRecipe ? 2 : 3) : 1;
    var baseWeight = gemMulti * (1 + upgradeLv / 10);
    totalBaseWeight += baseWeight;
    weightedStepTotal += baseWeight * steps;
    totalUpgradeLevels += upgradeLevels;
    minSteps = Math.min(minSteps, steps);
    maxSteps = Math.max(maxSteps, steps);
    kitchenCount++;
  }

  return {
    mode: isRecipe ? 'recipe' : 'meal',
    kitchenCount: kitchenCount,
    totalBaseWeight: totalBaseWeight,
    totalUpgradeLevels: totalUpgradeLevels,
    averageUpgradeLevels: kitchenCount > 0 ? totalUpgradeLevels / kitchenCount : 0,
    weightedSteps: totalBaseWeight > 0 ? weightedStepTotal / totalBaseWeight : 0,
    minSteps: kitchenCount > 0 ? minSteps : 0,
    maxSteps: maxSteps,
  };
}

export function summoningCropEvolutionScale(saveData, activeCharIdx) {
  activeCharIdx = Math.max(0, Math.round(Number(activeCharIdx) || 0));
  var summoningLv = Number(saveData.lv0AllData && saveData.lv0AllData[activeCharIdx]
    && saveData.lv0AllData[activeCharIdx][18]) || 0;
  return { activeCharIdx: activeCharIdx, summoningLv: summoningLv,
    steps: Math.ceil((summoningLv + 1) / 50) };
}

export var GOALS = [
  // ---- Skill & Lab ----
  simpleGoal('seff', 'Skill Efficiency', 'Seff'),
  simpleGoal('lexp', 'Lab EXP', 'Lexp'),
  simpleGoal('linepct', 'Lab Line Width (%)', 'LinePct'),

  // ---- Combat ----
  simpleGoal('totdmg', 'Total Damage', 'TotDmg'),
  simpleGoal('crit', 'Critical Chance', 'Crit', { note: 'Mutton grants Critical Chance, not Critical Damage.' }),
  simpleGoal('atkspd', 'Basic Attack Speed', 'AtkSpd'),
  simpleGoal('totacc', 'Total Accuracy', 'TotAcc'),
  simpleGoal('def', 'Base Defence', 'Def', { unit: 'flat' }),

  // ---- Cooking ----
  {
    id: 'mcook',
    name: 'Meal Cooking Speed',
    categories: ['Mcook', 'zMealFarm', 'KitchenEff'],
    unit: 'multiplier',
    note: 'Combines direct Meal Cooking Speed, Farming-scaled Burned Mello, and the summed Cabbage benefit across all unlocked kitchens.',
    value: function(mb, saveData, options) {
      var farmScale = farmingMealCookingScale(saveData, options && options.activeCharIdx);
      var kitchenScale = kitchenCookingAggregate(saveData, 'meal');
      return (1 + (mb.Mcook || 0) / 100)
        * (1 + (mb.zMealFarm || 0) * farmScale.steps / 100)
        * (1 + (mb.KitchenEff || 0) * kitchenScale.weightedSteps / 100);
    },
  },
  {
    id: 'rcook',
    name: 'Recipe Cooking Speed',
    categories: ['Rcook', 'KitchenEff'],
    unit: 'multiplier',
    note: 'Combines direct Recipe Cooking Speed with the summed Cabbage benefit across all unlocked kitchens.',
    value: function(mb, saveData) {
      var kitchenScale = kitchenCookingAggregate(saveData, 'recipe');
      return (1 + (mb.Rcook || 0) / 100)
        * (1 + (mb.KitchenEff || 0) * kitchenScale.weightedSteps / 100);
    },
  },
  simpleGoal('kitchc', 'Lower Kitchen Upgrade Costs', 'KitchC'),
  simpleGoal('cookexp', 'Cooking EXP', 'CookExp'),

  // ---- Breeding & Pets ----
  simpleGoal('brexp', 'Breeding EXP', 'BrExp'),
  simpleGoal('breed', 'Mob Breedability Rate', 'Breed'),
  simpleGoal('npet', 'New Mob Breed Odds', 'Npet'),
  simpleGoal('petdmg', 'Mob Battle Damage', 'PetDmg'),
  simpleGoal('tppete', 'Toilet Paper Postage Max Levels', 'TPpete', { unit: 'levels' }),
  simpleGoal('timeegg', 'Lower Egg Creation Time', 'TimeEgg'),

  // ---- Alchemy ----
  simpleGoal('liquid12', 'Liquid 1+2 Max Capacity', 'Liquid12'),
  simpleGoal('liquid34', 'Liquid 3+4 Max Capacity', 'Liquid34'),

  // ---- Sailing ----
  simpleGoal('sailing', 'Sailing Speed', 'Sailing'),

  // ---- Gaming ----
  simpleGoal('gamingbits', 'Bits Gain', 'GamingBits'),
  simpleGoal('gamingexp', 'Gaming EXP', 'GamingExp'),
  simpleGoal('sprow', 'Skilling Prowess', 'Sprow',
    { note: 'Leek grants skilling prowess. It does not affect Gaming sprout growth.' }),

  // ---- Divinity ----
  simpleGoal('divexp', 'Divinity EXP', 'DivExp'),

  // ---- Library ----
  simpleGoal('lib', 'Library Checkout Speed', 'Lib'),
  simpleGoal('vip', 'VIP Library Points', 'VIP'),

  // ---- Farming ----
  simpleGoal('farmexp', 'Farming EXP', 'zFarmExp'),
  {
    id: 'cropevo',
    name: 'Crop Evolution Chance',
    categories: ['zCropEvo', 'zCropEvoSumm'],
    unit: 'multiplier',
    note: 'Combines direct Crop Evolution Chance with Nyanborgir scaled by the selected character’s Summoning level.',
    value: function(mb, saveData, options) {
      var scale = summoningCropEvolutionScale(saveData, options && options.activeCharIdx);
      return (1 + (mb.zCropEvo || 0) / 100) * (1 + (mb.zCropEvoSumm || 0) * scale.steps / 100);
    },
  },
  simpleGoal('goldfood', 'Golden Food Bonuses', 'zGoldFood'),

  // ---- Sneaking ----
  simpleGoal('sneakexp', 'Sneaking EXP', 'zSneakExp'),
  simpleGoal('jade', 'Jade Gain', 'zJade'),

  // ---- Summoning ----
  simpleGoal('sumess', 'Summoning Essence Gain', 'zSumEss'),
  simpleGoal('sumexp', 'Summoning EXP', 'zSummonExp'),

  // ---- Spelunking / W7 ----
  simpleGoal('splkexp', 'Spelunking EXP', 'SplkExp'),
  simpleGoal('splkupg', 'Lower Spelunking Costs', 'SplkUpg'),
  simpleGoal('splkpow', 'Spelunking Power', 'SplkPOW'),
  simpleGoal('splkamb', 'Amber Gain from Spelunking', 'SplkAmb'),
  simpleGoal('researchxp', 'Research EXP', 'ResearchXP'),
  simpleGoal('minecurr', 'Mine Currency Gain', 'MineCurr'),
  simpleGoal('polyref', 'Polymer Refinery Speed', 'PolyRefSpd'),

  // ---- Cash & misc ----
  simpleGoal('cash', 'Cash from Monsters', 'Cash'),
  simpleGoal('critter', 'Critters from Traps', 'Critter'),
  simpleGoal('tdpts', 'Tower Defence Points', 'TDpts'),
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
export function optimizeForGoal(goalId, budget, saveData, options) {
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
    var curVal = goal.value(mb, saveData, options);

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
      var newVal = goal.value(testMb, saveData, options);
      var gain = newVal - curVal;
      if (gain > bestGain) { bestGain = gain; bestIdx = i; }
    }

    if (bestIdx >= 0) alloc[relevantMeals[bestIdx].idx]++;
  }

  // Build results
  var finalMb = buildMealBonuses();
  var goalValue = goal.value(finalMb, saveData, options);

  // Current value (with actual mastery levels)
  var cm0 = saveData.cookMasterData && saveData.cookMasterData[0] || [];
  var curMb = {};
  for (var i = 0; i < relevantMeals.length; i++) {
    var m = relevantMeals[i];
    var curLv = Number(cm0[m.idx]) || 0;
    var mastery = m.isPxLine ? 1 : bonusMultiCook(curLv);
    curMb[m.cat] = (curMb[m.cat] || 0) + m.baseWeight * mastery;
  }
  var curGoalValue = goal.value(curMb, saveData, options);

  var mealResults = [];
  for (var i = 0; i < relevantMeals.length; i++) {
    var m = relevantMeals[i];
    var optLv = alloc[m.idx];
    var curLv = Number(cm0[m.idx]) || 0;
    mealResults.push({
      idx: m.idx,
      name: (MealINFO[m.idx][0] || '').replace(/_/g, ' '),
      effect: (MealINFO[m.idx][3] || '').replace(/_/g, ' ').replace(/[{}]/g, ''),
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
