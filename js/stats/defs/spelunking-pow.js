// ===== SPELUNKING POW DESCRIPTOR =====
// Spelunk("POW") = POW_base * POW_multi * elixir_modifier
// Scope: account (not per-character).

import { companions } from '../systems/common/goldenFood.js';
import { label } from '../entity-names.js';
import { computeWinBonus } from '../systems/w6/summoning.js';
import { rogBonusQTY } from '../systems/w7/sushi.js';
import { optionsListData } from '../../save/data.js';
import { saveData } from '../../state.js';
import { computeCropSC, computeStickerBonus, computeExoticBonus } from '../systems/w6/farming.js';
import { computeMealBonus } from '../systems/common/stats.js';
import { computePaletteBonus } from '../systems/w7/spelunking.js';
import { cardLv } from '../systems/common/goldenFood.js';
import { SpelunkChapters, SpelunkUpg } from '../data/game/customlists.js';
import { formulaEval } from '../../formulas.js';
import { computeButtonBonus } from './helpers.js';
import { computeArtifactBonus } from '../systems/w5/sailing.js';
import { computeMSABonus, computeSlabboBonus } from '../systems/w4/gaming.js';
import { dancingCoralBase } from '../data/w7/research.js';

function safe(fn) {
  try {
    var args = [];
    for (var i = 1; i < arguments.length; i++) args.push(arguments[i]);
    var v = fn.apply(null, args);
    return (v !== v || v == null) ? 0 : v;
  } catch(e) { return 0; }
}

// ShopUpgBonus(idx): Spelunk shop upgrade bonus
// Game: SpelunkUpg[idx][4] * Spelunk[5][idx]
function shopUpgBonus(idx) {
  var s = saveData;
  if (!s.spelunkData || !s.spelunkData[5]) return 0;
  var lv = Number(s.spelunkData[5][idx]) || 0;
  if (lv <= 0) return 0;
  if (!SpelunkUpg || !SpelunkUpg[idx]) return 0;
  return Number(SpelunkUpg[idx][4]) * lv;
}

// ChapterBonus(chapterIdx, bonusIdx)
// DN = 1; if SpelunkChapters[ch][bi][4]==1, DN = 1+ArtifactBonus(35)/100
// return DN * formulaEval(type, x1, x2, level)
function chapterBonus(chapterIdx, bonusIdx) {
  var s = saveData;
  var spelunk = s.spelunkData;
  if (!spelunk || !spelunk[8]) return 0;
  var lv = Number(spelunk[8][4 * chapterIdx + bonusIdx]) || 0;
  if (lv <= 0) return 0;
  var chData = SpelunkChapters[chapterIdx];
  if (!chData || !chData[bonusIdx]) return 0;
  var row = chData[bonusIdx];
  var dn = 1;
  if (Number(row[4]) === 1) {
    dn = 1 + safe(computeArtifactBonus, 35) / 100;
  }
  return dn * formulaEval(row[3], Number(row[1]) || 0, Number(row[2]) || 0, lv);
}

export default {
  id: 'spelunking-pow',
  name: 'Spelunking Power',
  scope: 'account',
  category: 'stat',

  pools: {},

  combine: function(pools, ctx) {
    var s = ctx.saveData;
    if (!s) return { val: 2, children: null };

    // POW_base = 1 + ShopUpgBonus(0)
    var shop0 = shopUpgBonus(0);
    var powBase = 1 + shop0;

    // POW_multi: massive multiplicative chain
    var winBonus27 = safe(computeWinBonus, 27);
    var rog20 = rogBonusQTY(20, s.cachedUniqueSushi || 0);
    var bb6 = computeButtonBonus(6, s);
    var gemPurchase43 = Number(s.gemItemsData && s.gemItemsData[43]) || 0;
    var gemMulti = Math.max(1, Math.pow(2, gemPurchase43));

    // Chapter bonuses (multiplicative, each max(1, ...))
    var chapter1_2 = Math.max(1, chapterBonus(1, 2));
    var chapter5_0 = Math.max(1, chapterBonus(5, 0));
    var chapter4_2 = Math.max(1, chapterBonus(4, 2));
    var comp143 = Math.max(1, safe(companions, 143));

    // GenINFO[107][10] / (1 + min(99, 99*GenINFO[107][9])) — server state
    var genRatio = 1; // Default when server state unavailable

    var chapterComps = chapter1_2 * chapter5_0 * chapter4_2 * comp143 * genRatio;

    var shop1 = shopUpgBonus(1);
    var dancingCoral1 = dancingCoralBase(1);

    // CropSCbonus(8) + SlabboBonus(6) + MSA_Bonus(9) + MealBonuses.SplkPOW
    var cropSC8 = safe(computeCropSC, 8);
    var slabbo6 = safe(computeSlabboBonus, 6);
    var msaBonus9 = safe(computeMSABonus, 9);
    var mealSplkPOW = safe(computeMealBonus, 'SplkPOW');
    var addGroup1 = cropSC8 + slabbo6 + msaBonus9 + mealSplkPOW;

    var shop2 = shopUpgBonus(2);
    var ola500 = Number(optionsListData[500]) || 0;
    var shop3 = shopUpgBonus(3);
    var stickerBonus6 = safe(computeStickerBonus, 6);
    var paletteBonus13 = safe(computePaletteBonus, 13);

    var powMulti = (1 + winBonus27 / 100) * (1 + rog20 / 100) * (1 + bb6 / 100) * gemMulti
      * chapterComps * (1 + shop1 / 100) * (1 + dancingCoral1 / 100)
      * (1 + addGroup1 / 100) * (1 + shop2 / 100)
      * (1 + ola500 / 100) * (1 + shop3 / 100)
      * (1 + stickerBonus6 / 100) * (1 + paletteBonus13 / 100)
      * (1 + shopUpgBonus(46) / 100)
      * (1 + (safe(computeExoticBonus, 42) + Math.min(4 * safe(cardLv, 'w7a5'), 30)) / 100)
      * (1 + (shopUpgBonus(14) + shopUpgBonus(15) + shopUpgBonus(16) + shopUpgBonus(17)) / 100);

    // Elixir modifier (SpelunkyDNpow)
    // If GenINFO[107][4] > 0.5: 5 / pow(1 + ElixirEffectQTY(4)/100, GenINFO[107][4]-1)
    var elixirMod = 1; // Default when no elixir data

    // OLA[478] < 8 → just returns 2 (haven't unlocked spelunking fully)
    var ola478 = Number(optionsListData[478]) || 0;
    var val;
    if (ola478 < 8) {
      val = 2;
    } else {
      val = powBase * powMulti * elixirMod;
    }

    if (val !== val || val == null) val = 2;

    var children = [];
    children.push({ name: 'POW Base', val: powBase, fmt: 'raw',
      note: 'ShopUpg(0)=' + shop0 });
    if (ola478 >= 8) {
      children.push({ name: 'POW Multi', val: powMulti, fmt: 'x' });
      if (elixirMod !== 1) children.push({ name: 'Elixir Modifier', val: elixirMod, fmt: 'x' });
    } else {
      children.push({ name: 'Not fully unlocked', val: 2, fmt: 'raw', note: 'OLA[478]=' + ola478 });
    }

    return { val: val, children: children };
  }
};
