// ===== MINEHEAD CURRENCY DESCRIPTOR =====
// Computes minehead CurrencyGain multiplier.
// Game: Grid(129) × (1+Grid(148)/100) × (1+RoG(12)/100) × max(1,min(2,Comp143))
//   × min(3, 1+BonusQTY(6)/100) × (1+(UpgQTY(5)+UpgQTY(22)+UpgQTY(28)*LOG(Research[7][6])+Arcade62)/100)
//   × (1+Button_Bonuses(1)/100) × (1+Atom(13)/100) × (1+(Grid(147)+Grid(166)+MealMineCurr)/100)

import { arcadeBonus } from '../systems/w2/arcade.js';
import { companionBonus } from '../data/common/companions.js';
import { rogBonusQTY } from '../systems/w7/sushi.js';
import { mineheadBonusQTY } from '../systems/w7/minehead.js';
import { MINEHEAD_UPG } from '../data/w7/minehead.js';
import { gridBonusFinal, computeButtonBonus } from './helpers.js';
import { label } from '../entity-names.js';
import { getLOG } from '../../formulas.js';
import { computeMealBonus } from '../systems/common/stats.js';

function mhUpgradeQTY(idx, saveData) {
  var bonus = MINEHEAD_UPG[idx] ? MINEHEAD_UPG[idx].bonus : 0;
  var lv = (saveData.research && saveData.research[8] && Number(saveData.research[8][idx])) || 0;
  return bonus * lv;
}

export default {
  id: 'minehead-currency',
  name: 'Minehead Currency/hr',
  scope: 'account',
  category: 'currency',

  pools: {},

  combine: function(pools, ctx) {
    var saveData = ctx.saveData;
    if (!saveData) return { val: 0, children: null };
    var mineFloor = (saveData.stateR7 && saveData.stateR7[4]) || 0;

    var children = [];

    // 1. Grid(129) — base
    var grid129 = gridBonusFinal(saveData, 129);
    children.push({ name: label('Grid', 129), val: grid129, fmt: 'raw' });

    // 2. × (1+Grid(148)/100)
    var grid148 = gridBonusFinal(saveData, 148);
    children.push({ name: label('Grid', 148), val: 1 + grid148 / 100, fmt: 'x' });

    // 3. × (1+RoG(12)/100)
    var rog12 = rogBonusQTY(12, saveData.cachedUniqueSushi);
    children.push({ name: 'Sushi RoG(12)', val: 1 + rog12 / 100, fmt: 'x' });

    // 4. × max(1, min(2, Comp143))
    var comp143raw = saveData.companionIds && saveData.companionIds.has(143) ? companionBonus(143) : 0;
    var comp143 = Math.max(1, Math.min(2, comp143raw));
    children.push({ name: label('Companion', 143), val: comp143, fmt: 'x' });

    // 5. × min(3, 1+BonusQTY(6)/100) — floor bonus
    var bonusQTY6 = mineheadBonusQTY(6, mineFloor);
    var floorMult = Math.min(3, 1 + bonusQTY6 / 100);
    children.push({ name: label('Minehead Floor', 6), val: floorMult, fmt: 'x' });

    // 6. × (1+(UpgQTY(5)+UpgQTY(22)+UpgQTY(28)*LOG(Research[7][6])+Arcade62)/100)
    var upg5 = mhUpgradeQTY(5, saveData);
    var upg22 = mhUpgradeQTY(22, saveData);
    var research76 = (saveData.research && saveData.research[7] && Number(saveData.research[7][6])) || 0;
    var upg28 = mhUpgradeQTY(28, saveData) * getLOG(research76);
    var arcade62 = arcadeBonus(62);
    var additive6 = upg5 + upg22 + upg28 + arcade62;
    children.push({ name: 'Upgrades+Arcade', val: 1 + additive6 / 100, fmt: 'x',
      children: [
        { name: 'Upg 5', val: upg5, fmt: 'raw' },
        { name: 'Upg 22', val: upg22, fmt: 'raw' },
        { name: 'Upg 28×LOG', val: upg28, fmt: 'raw' },
        { name: label('Arcade', 62), val: arcade62, fmt: 'raw' },
      ] });

    // 7. × (1+Button_Bonuses(1)/100)
    var bb1 = computeButtonBonus(1, saveData);
    children.push({ name: 'Button Bonus', val: 1 + bb1 / 100, fmt: 'x' });

    // 8. × (1+Atom(13)/100)
    var atom13 = Number(saveData.atomsData && saveData.atomsData[13]) || 0;
    children.push({ name: label('Atom', 13), val: 1 + atom13 / 100, fmt: 'x' });

    // 8. × (1+(Grid(147)+Grid(166)+MealMineCurr)/100)
    var grid147 = gridBonusFinal(saveData, 147);
    var grid166 = gridBonusFinal(saveData, 166);
    var mealMineCurr = 0;
    try { mealMineCurr = computeMealBonus('MineCurr') || 0; } catch(e) {}
    children.push({ name: 'Grid+Meal', val: 1 + (grid147 + grid166 + mealMineCurr) / 100, fmt: 'x',
      children: [
        { name: label('Grid', 147), val: grid147, fmt: 'raw' },
        { name: label('Grid', 166), val: grid166, fmt: 'raw' },
        { name: 'Meal MineCurr', val: mealMineCurr, fmt: 'raw' },
      ] });

    // Multiply all
    var val = grid129;
    for (var i = 1; i < children.length; i++) {
      val *= children[i].val;
    }

    return { val: val, children: children };
  },
};
