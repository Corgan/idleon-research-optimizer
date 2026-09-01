// CookingMealBonusMultioo — shared cooking meal multiplier.
// Game formula: (1 + (MF116 + ShinyS20)/100) × (1 + WinBon26/100) × (1 + 25*Comp162/100)
// Single source of truth — all meal bonus computations import this.

import { mainframeBonus } from '../w4/lab.js';
import { computeShinyBonusS } from '../w4/breeding.js';
import { computeWinBonus } from '../w6/summoning.js';
import { companionBonusForSave } from '../../data/common/companions.js';

export function cookingMealMulti(saveData, charIdx) {
  var mfb116 = mainframeBonus(116, saveData);
  var shinyS20 = computeShinyBonusS(20, saveData);
  var winBon26 = computeWinBonus(26, { charIdx: charIdx }, saveData);
  var comp162 = 25 * companionBonusForSave(162, saveData);
  var val = (1 + (mfb116 + shinyS20) / 100) * (1 + winBon26 / 100) * (1 + comp162 / 100);
  return { val: val, mfb116: mfb116, shinyS20: shinyS20, winBon26: winBon26, comp162: comp162 };
}
