// ===== MINEHEAD CURRENCY DESCRIPTOR =====
// Computes minehead CurrencyGain/hr.
// Game: Grid(129) × (1+EventShop44) × (1+Grid(148)/100) × max(1,OutpostROGbon(3)) × (1+RoG(12)/100)
//   × (1+Jelly8/100) × (1+ban_j) × (1+10×Task[2][6][4]/100) × max(1,min(2,Comp143)+CompLV2(143))
//   × min(3, 1+BonusQTY(6)/100)
//   × (1+(UpgQTY(5)+UpgQTY(22)+UpgQTY(28)*LOG(Research[7][6])+Arcade62+DancingCoral5)/100)
//   × (1+Button_Bonuses(1)/100) × (1+Atom(13)/100) × (1+(Grid(147)+Grid(166)+MealMineCurr)/100)

import { rogBonusQTY } from '../systems/w7/sushi.js';
import {
  buttonBonusDetail,
  computeMineheadCurrSources,
  currencyPerHour,
  mineheadBonusQTY,
  mhUpgradeQTY,
} from '../systems/w7/minehead.js';
import { createDescriptor, gridBonusFinal } from './helpers.js';
import { label } from '../entity-names.js';
import { getLOG } from '../../formulas.js';
import { RES_GRID_RAW, SHAPE_BONUS_PCT, SHAPE_NAMES } from '../data/w7/research.js';

// Grid_Bonus(idx, 0) = perLevel × level × (1 + shape%/100) × AllMulti.
function _gridTerms(S, idx) {
  var info = RES_GRID_RAW[idx] || [];
  var si = S.shapeOverlay ? S.shapeOverlay[idx] : -1;
  var hasShape = si >= 0 && si < SHAPE_BONUS_PCT.length;
  return [
    { name: 'Per Level', val: Number(info[2]) || 0, fmt: 'raw' },
    { name: 'Level', val: Number(S.gridLevels && S.gridLevels[idx]) || 0, fmt: 'raw' },
    { name: hasShape ? 'Shape: ' + String(SHAPE_NAMES[si]).replace(/_/g, ' ') : 'Shape', val: 1 + (hasShape ? SHAPE_BONUS_PCT[si] : 0) / 100,
      fmt: 'x', note: hasShape ? '' : 'No shape' },
    { name: 'All Bonus Multi', val: Number(S.allBonusMulti) || 1, fmt: 'x' },
  ];
}

export default createDescriptor({
  id: 'minehead-currency',
  name: 'Minehead Currency/hr',
  scope: 'account',
  category: 'currency',

  combine: function(pools, ctx) {
    var saveData = ctx.saveData;
    if (!saveData) return { val: 0, children: null };
    var mineFloor = (saveData.stateR7 && saveData.stateR7[4]) || 0;

    var children = [];

    // 1. Grid(129) — base
    var grid129 = gridBonusFinal(saveData, 129);
    children.push({ name: label('Grid', 129), val: grid129, fmt: 'raw', children: _gridTerms(saveData, 129) });

    // 2. × (1+Grid(148)/100)
    var grid148 = gridBonusFinal(saveData, 148);
    children.push({ name: label('Grid', 148), val: 1 + grid148 / 100, fmt: 'x', note: 'Grid bonus ' + grid148.toFixed(2) + '%',
      children: _gridTerms(saveData, 148) });

    var sources = computeMineheadCurrSources(saveData, ctx.charIdx);

    // 3. × (1+RoG(12)/100)
    var rog12 = rogBonusQTY(12, saveData.cachedUniqueSushi);
    children.push({ name: label('RoG', 12), val: 1 + rog12 / 100, fmt: 'x' });

    // 4. × max(1, min(2, Comp143))
    var comp143 = Math.max(1, Math.min(2, sources.comp143) + sources.comp143Level2);
    children.push({ name: label('Companion', 143), val: comp143, fmt: 'x' });
    children.push({ name: 'Royal Guardian: Minehead Currency', val: sources.royalCurrencyMulti, fmt: 'x' });
    children.push({ name: 'Jelly Operator: Minehead Currency', val: 1 + sources.jellyCurrency8 / 100, fmt: 'x' });
    children.push({ name: 'Jelly Operator Bundle', val: 1 + sources.bundleJ, fmt: 'x' });

    // 5. × min(3, 1+BonusQTY(6)/100) — floor bonus
    var bonusQTY6 = mineheadBonusQTY(6, mineFloor);
    var floorMult = Math.min(3, 1 + bonusQTY6 / 100);
    children.push({ name: label('Minehead Floor', 6), val: floorMult, fmt: 'x' });

    // 6. × (1+(UpgQTY(5)+UpgQTY(22)+UpgQTY(28)*LOG(Research[7][6])+Arcade62)/100)
    var upg5 = mhUpgradeQTY(5, saveData);
    var upg22 = mhUpgradeQTY(22, saveData);
    var research76 = (saveData.research && saveData.research[7] && Number(saveData.research[7][6])) || 0;
    var upg28 = mhUpgradeQTY(28, saveData) * getLOG(research76);
    var arcade62 = sources.arcade62;
    var dancingCoral5 = sources.dancingCoral5;
    var additive6 = upg5 + upg22 + upg28 + arcade62 + dancingCoral5;
    children.push({ name: 'Minehead Upgrades and Arcade', val: 1 + additive6 / 100, fmt: 'x',
      children: [
        { name: label('Minehead', 5), val: upg5, fmt: 'raw' },
        { name: label('Minehead', 22), val: upg22, fmt: 'raw' },
        { name: label('Minehead', 28), val: upg28, fmt: 'raw', note: 'scaled by Research progress' },
        { name: label('Arcade', 62), val: arcade62, fmt: 'raw' },
        { name: 'Dancing Coral 5: Minehead Currency', val: dancingCoral5, fmt: 'raw',
          note: 'Spelunky[24][5], Tower 23' },
      ] });

    // 7. × (1+Button_Bonuses(1)/100), Button_BonusMULTI = (1+Comp147/100) × (1+Grid(125)/100)
    var bd1 = buttonBonusDetail(1, saveData);
    var bb1 = bd1.val;
    children.push({ name: label('Button', 1), val: 1 + bb1 / 100, fmt: 'x',
      children: [
        { name: 'Slot Hits', val: bd1.hits, fmt: 'raw', note: bd1.presses + ' presses (OLA 594)' },
        { name: 'Rate per Hit', val: bd1.rate, fmt: 'raw' },
        { name: label('Companion', 147), val: bd1.comp147Multi, fmt: 'x' },
        { name: label('Grid', 125), val: bd1.grid125Multi, fmt: 'x', note: 'Grid bonus ' + bd1.grid125.toFixed(2) + '%' },
      ] });

    // 8. × (1+Atom(13)/100)
    var atom13 = sources.atom13;
    children.push({ name: label('Atom', 13), val: 1 + atom13 / 100, fmt: 'x' });

    var eventShop44 = sources.eventShop44;
    children.push({ name: 'Event Shop: Minehead Currency', val: 1 + eventShop44, fmt: 'x' });
    children.push({ name: 'W7 Task: Minehead Currency', val: sources.taskCurrencyMulti, fmt: 'x',
      note: 'Level ' + sources.taskCurrencyLevel });

    // 9. × (1+(Grid(147)+Grid(166)+MealMineCurr)/100)
    var grid147 = gridBonusFinal(saveData, 147);
    var grid166 = gridBonusFinal(saveData, 166);
    var mealMineCurr = sources.mealMineCurr;
    children.push({ name: 'Research Grid and Meals', val: 1 + (grid147 + grid166 + mealMineCurr) / 100, fmt: 'x',
      children: [
        { name: label('Grid', 147), val: grid147, fmt: 'raw', children: _gridTerms(saveData, 147) },
        { name: label('Grid', 166), val: grid166, fmt: 'raw', children: _gridTerms(saveData, 166) },
        { name: 'Meals: Minehead Currency', val: mealMineCurr, fmt: 'raw' },
      ] });

    var upgLevels = saveData.mineheadUpgLevels || saveData.research && saveData.research[8] || [];
    var highestDmg = Number(saveData.stateR7 && saveData.stateR7[6]) || 1;
    var val = currencyPerHour({
      gridBonus129: grid129,
      gridBonus148: grid148,
      gridBonus147: grid147,
      gridBonus166: grid166,
      comp143: sources.comp143,
      comp143Level2: sources.comp143Level2,
      bonusQTY6: bonusQTY6,
      atom13: atom13,
      mealMineCurr: mealMineCurr,
      arcade62: arcade62,
      rogBonus12: rog12,
      buttonBonus1: bb1,
      eventShop44: eventShop44,
      royalCurrencyMulti: sources.royalCurrencyMulti,
      jellyCurrency8: sources.jellyCurrency8,
      bundleJ: sources.bundleJ,
      taskCurrencyLevel: sources.taskCurrencyLevel,
      dancingCoral5: sources.dancingCoral5,
      upgLevels: upgLevels,
      highestDmg: highestDmg,
    });
    var missingMetadata = [];
    if (saveData.companionDataAvailable === false) missingMetadata.push('companion ownership');
    return {
      val: val,
      children: children,
      partial: missingMetadata.length > 0,
      reason: missingMetadata.length > 0
        ? 'Partial total: the imported JSON does not include ' + missingMetadata.join(' or ') + ' metadata.'
        : '',
    };
  },
});
