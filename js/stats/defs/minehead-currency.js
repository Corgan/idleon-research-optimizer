// ===== MINEHEAD CURRENCY DESCRIPTOR =====
// Computes minehead currency sources (additive % bonus).
// Replaces computeMineheadCurrSources() from systems/w7/research.js.

import { mainframeBonus } from '../systems/w4/lab.js';
import { arcadeBonus } from '../systems/w2/arcade.js';
import { computeShinyBonusS } from '../systems/w4/breeding.js';
import { computeWinBonus } from '../systems/w6/summoning.js';
import { ribbonBonusAt } from '../../game-helpers.js';
import { companionBonus } from '../data/common/companions.js';
import { label } from '../entity-names.js';

export default {
  id: 'minehead-currency',
  name: 'Minehead Currency Bonus',
  scope: 'account',
  category: 'currency',

  pools: {},

  combine: function(pools, ctx) {
    var saveData = ctx.saveData;
    if (!saveData) return { val: 0, children: null };

    var items = [];

    // Companion 143
    var comp143 = saveData.companionIds && saveData.companionIds.has(143) ? companionBonus(143) : 0;
    items.push({ name: label('Companion', 143), val: comp143, fmt: 'raw' });

    // Atom 13
    var atom13 = Number(saveData.atomsData && saveData.atomsData[13]) || 0;
    items.push({ name: label('Atom', 13), val: atom13, fmt: 'raw' });

    // Arcade 62
    var arcade62 = arcadeBonus(62);
    items.push({ name: label('Arcade', 62), val: arcade62, fmt: 'raw', note: 'Lv ' + ((saveData.arcadeUpgData && saveData.arcadeUpgData[62]) || 0) });

    // Meal 73 (mine currency meal)
    var mealLv = (saveData.mealsData && saveData.mealsData[0] && saveData.mealsData[0][73]) || 0;
    var mealVal = 0;
    var mealCh = null;
    if (mealLv > 0) {
      var olaStr379 = String(saveData.olaData[379] || '');
      var ribBon = ribbonBonusAt(101, saveData.ribbonData, olaStr379);
      var mfb116 = mainframeBonus(116);
      var shinyS20 = computeShinyBonusS(20);
      var winBon26 = computeWinBonus(26);
      var cookMulti = (1 + (mfb116 + shinyS20) / 100) * (1 + winBon26 / 100);
      mealVal = cookMulti * ribBon * mealLv * 0.02;
      mealCh = [
        { name: 'Meal Lv', val: mealLv, fmt: 'raw' },
        { name: 'Per Lv', val: 0.02, fmt: 'raw' },
        { name: 'Ribbon', val: ribBon, fmt: 'x' },
        { name: 'Cook Multi', val: cookMulti, fmt: 'x', children: [
          { name: label('Mainframe', 116), val: mfb116, fmt: 'raw' },
          { name: 'Shiny S20', val: shinyS20, fmt: 'raw' },
          { name: label('WinBonus', 26), val: winBon26, fmt: 'raw' },
        ] },
      ];
    }
    items.push({ name: label('Meal', 73), val: mealVal, children: mealCh, fmt: 'raw' });

    var total = 0;
    for (var i = 0; i < items.length; i++) total += items[i].val;

    // Only include non-zero in children
    var children = [];
    for (var i = 0; i < items.length; i++) {
      if (items[i].val > 0) children.push(items[i]);
    }

    return { val: total, children: children };
  },
};
