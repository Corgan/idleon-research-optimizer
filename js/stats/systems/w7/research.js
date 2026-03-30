// ===== RESEARCH SYSTEM (W7) =====
// Minehead research bonuses.

import { node } from '../../node.js';
import { S } from '../../../state.js';
import { MINEHEAD_BONUS_QTY } from '../../../game-data.js';
import { ribbonBonusAt } from '../../../save/helpers.js';
import { mainframeBonus } from '../w4/lab.js';
import { arcadeBonus } from '../w2/arcade.js';
import { computeShinyBonusS } from '../w4/breeding.js';
import { computeWinBonus } from '../w6/summoning.js';

export function mineheadBonusQTY(t, mineFloor) {
  return mineFloor > t ? (MINEHEAD_BONUS_QTY[t] || 0) : 0;
}

export function computeMineheadCurrSources() {
  var comp143 = S.companionIds.has(143) ? 20 : 0;
  var atom13 = Number(S.atomsData && S.atomsData[13]) || 0;
  var arcade62val = arcadeBonus(62);
  var arcade62lv = S.arcadeUpgData[62] || 0;
  var mealLv = (S.mealsData && S.mealsData[0] && S.mealsData[0][73]) || 0;
  var olaStr379 = String(S.olaData[379] || '');
  var mealMineCurr = 0;
  var mealRibBon = 0;
  var mealCookMulti = 1;
  var mealMfb116 = 0;
  var mealShinyS20 = 0;
  var mealWinBon26 = 0;
  var mealRibT = 0;
  if (mealLv > 0) {
    mealRibT = S.ribbonData[101] || 0;
    mealRibBon = ribbonBonusAt(101, S.ribbonData, olaStr379);
    mealMfb116 = mainframeBonus(116);
    mealShinyS20 = computeShinyBonusS(20);
    mealWinBon26 = computeWinBonus(26);
    mealCookMulti = (1 + (mealMfb116 + mealShinyS20) / 100) * (1 + mealWinBon26 / 100);
    mealMineCurr = mealCookMulti * mealRibBon * mealLv * 0.02;
  }
  return {
    comp143: comp143, atom13: atom13,
    arcade62: arcade62val, arcade62lv: arcade62lv,
    mealMineCurr: mealMineCurr, mealLv: mealLv, mealRibBon: mealRibBon, mealRibT: mealRibT,
    mealCookMulti: mealCookMulti, mealMfb116: mealMfb116, mealShinyS20: mealShinyS20, mealWinBon26: mealWinBon26,
  };
}

export var minehead = {
  resolve: function(id, ctx) {
    var mineFloor = (S.stateR7 && S.stateR7[4]) || 0;
    var bonusVal = MINEHEAD_BONUS_QTY[id] || 0;
    var val = mineFloor > id ? bonusVal : 0;
    if (val <= 0) return node('Minehead Bonus ' + id, 0, [
      node('Mine Floor', mineFloor, null, { fmt: 'raw' }),
      node('Required Floor', id, null, { fmt: 'raw' }),
    ], { note: 'minehead ' + id });
    return node('Minehead Bonus ' + id, val, [
      node('Mine Floor', mineFloor, null, { fmt: 'raw' }),
      node('Bonus Value', bonusVal, null, { fmt: 'raw' }),
    ], { fmt: '+', note: 'minehead ' + id });
  },
};
