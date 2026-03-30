// ===== FARMING SYSTEM (W6) =====
// Farm rank upgrades, crop SC bonuses, exotic bonuses.

import { node } from '../../node.js';
import { S } from '../../../state.js';
import { optionsListData } from '../../../save/data.js';
import { mainframeBonus } from '../w4/lab.js';
import { vaultUpgBonus } from '../common/goldenFood.js';
import { emporiumBonus } from '../../../save/helpers.js';
import { grimoireUpgBonus22 } from '../mc/grimoire.js';
import { NINJA_INFO_36 } from '../../../game-data.js';

export function exoticBonusQTY40() {
  var lv = (S.farmUpgData && S.farmUpgData[60]) || 0;
  if (lv <= 0) return 0;
  return 20 * lv / (1000 + lv);
}

// Talent helpers (for getbonus2)
import { skillLvData, numCharacters } from '../../../save/data.js';
import { formulaEval } from '../../../save/engine.js';
import { computeAllTalentLVz } from '../common/talent.js';

function getbonus2Detail(talentIdx, data, activeCharIdx) {
  var best = 0, bestCi = -1, bestBase = 0, bestBonus = 0, bestEff = 0;
  for (var ci = 0; ci < numCharacters; ci++) {
    var sl = skillLvData[ci] || {};
    var rawLv = Number(sl[talentIdx] || sl[String(talentIdx)]) || 0;
    if (rawLv <= 0) continue;
    // Game: AllTalentLVz always uses active character's context, not per-char.
    // Game passes rawLv (not talentIdx) to AllTalentLVz — this affects the
    // Spelunk super talent lookup, which checks indexOf(rawLv) in Spelunk array.
    var bonusChar = activeCharIdx != null ? activeCharIdx : ci;
    var bonus = computeAllTalentLVz(rawLv, bonusChar);
    var effLv = rawLv + bonus;
    var val = formulaEval(data.formula, data.x1, data.x2, effLv);
    if (val > best) { best = val; bestCi = ci; bestBase = rawLv; bestBonus = bonus; bestEff = effLv; }
  }
  return { val: best, ci: bestCi, baseLv: bestBase, bonusLv: bestBonus, effLv: bestEff };
}

var TAL207 = { x1: 2, x2: 200, formula: 'decayMulti' };

export var farm = {
  resolve: function(id, ctx) {
    var S = ctx.S;

    if (id === 'rank9') {
      var ninjaVal = Number(NINJA_INFO_36[9] || 0);  // static game data, NOT Ninja save key
      var rankLv = Number((S.farmRankData && S.farmRankData['2'] && S.farmRankData['2'][9]) || 0);
      var d207 = getbonus2Detail(207, TAL207, ctx.charIdx);
      var tal207 = d207.val;
      var exotic14Lv = Number((S.farmUpgData && S.farmUpgData[34]) || 0);
      var exotic14 = exotic14Lv > 0 ? 20 * exotic14Lv / (1000 + exotic14Lv) : 0;
      if (ninjaVal <= 0 || rankLv <= 0) return node('Farm Rank 9', 0, null, { note: 'farm rank9' });
      var val = Math.max(1, tal207) * (1 + exotic14 / 100) * ninjaVal * rankLv;
      var talChildren = tal207 > 0 ? [
        node('Best Character', d207.ci, null, { fmt: 'raw' }),
        node('Base Level', d207.baseLv, null, { fmt: 'raw' }),
        node('Bonus Level', d207.bonusLv, null, { fmt: '+' }),
        node('Effective Level', d207.effLv, null, { fmt: 'raw' }),
      ] : null;
      return node('Farm Rank 9', val, [
        node('Rank Level', rankLv, null, { fmt: 'raw' }),
        node('Ninja Base', ninjaVal, null, { fmt: 'raw' }),
        node('Talent 207 Bonus', Math.max(1, tal207), talChildren, { fmt: 'x', note: 'decayMulti(2,200,' + d207.effLv + ')' }),
        node('Exotic 14 Bonus', 1 + exotic14 / 100, null, { fmt: 'x', note: 'Level ' + exotic14Lv }),
      ], { fmt: '+', note: 'farm rank9' });
    }

    if (id === 'cropSC7') {
      var empUnlocked = emporiumBonus(38, S.ninjaData && S.ninjaData[102] && S.ninjaData[102][9]);
      if (!empUnlocked) return node('Crop Scientist 7', 0, [node('Emporium not unlocked', 0, null, { fmt: 'raw' })], { note: 'farm cropSC7' });
      var cropCount = S.farmCropCount || 0;
      var excess = Math.max(0, cropCount - 100);
      var mf17 = mainframeBonus(17);
      var grim22 = grimoireUpgBonus22();
      var exotic40Lv = Number((S.farmUpgData && S.farmUpgData[60]) || 0);
      var exotic40 = exotic40Lv > 0 ? 20 * exotic40Lv / (1000 + exotic40Lv) : 0;
      var vault79 = vaultUpgBonus(79);
      var multi = (1 + mf17 / 100) * (1 + (grim22 + exotic40 + vault79) / 100);
      if (excess <= 0) return node('Crop Scientist 7', 0, null, { note: 'farm cropSC7' });
      var val = excess * multi;
      return node('Crop Scientist 7', val, [
        node('Crop Count', cropCount, null, { fmt: 'raw' }),
        node('Excess', excess, null, { fmt: 'raw', note: 'crops - 100' }),
        node('Multi', multi, [
          node('Mainframe 17', mf17, null, { fmt: 'raw' }),
          node('Grimoire 22', grim22, null, { fmt: 'raw' }),
          node('Exotic 40', exotic40, null, { fmt: 'raw', note: 'Level ' + exotic40Lv }),
          node('Vault 79', vault79, null, { fmt: 'raw' }),
        ], { fmt: 'x' }),
      ], { fmt: '+', note: 'farm cropSC7' });
    }

    if (id === 'exotic59') {
      var lv = Number((S.farmUpgData && S.farmUpgData[79]) || 0);
      if (lv <= 0) return node('Exotic Crop 59', 0, null, { note: 'farm exotic59' });
      var val = 25 * lv / (1000 + lv);
      return node('Exotic Crop 59', val, [
        node('Level', lv, null, { fmt: 'raw' }),
        node('Formula Result', val, null, { fmt: 'raw', note: '25 × lv / (1000 + lv)' }),
      ], { fmt: '+', note: 'farm exotic59' });
    }

    return node('Farm ' + id, 0, null, { note: 'farm ' + id });
  },
};
