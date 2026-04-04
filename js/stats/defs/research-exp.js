// ===== RESEARCH EXP DESCRIPTOR =====
// Replaces computeExternalBonuses() from save/external.js.
// Computes the additive research EXP percentage and true multipliers.
//
// Additive pool: sticker, dancingCoral, zenith, cardW7b1, cardW7b4,
//   prehistoricSet, slabbo, arcade, meal, cropSC, msa, loreEpi
// True multipliers: comp52 (1.5x), comp153 (2x), rog0 (2x), allMulti

import { dancingCoralBase, stickerBase } from '../data/w7/research.js';
import { gbWith } from '../../sim-math.js';
import { emporiumBonus, eventShopOwned, ribbonBonusAt, superBitType } from '../../game-helpers.js';
import { mainframeBonus } from '../systems/w4/lab.js';
import { arcadeBonus } from '../systems/w2/arcade.js';
import { computeCardLv } from '../systems/common/cards.js';
import { computeMeritocBonusz } from '../systems/w7/meritoc.js';
import { computeShinyBonusS } from '../systems/w4/breeding.js';
import { computeWinBonus } from '../systems/w6/summoning.js';
import { exoticBonusQTY40 } from '../systems/w6/farming.js';
import { grimoireUpgBonus22 } from '../systems/mc/grimoire.js';
import { legendPTSbonus } from '../systems/w7/spelunking.js';
import { rogBonusQTY } from '../systems/w7/sushi.js';
import { gridBonusFinal } from './helpers.js';
import { cosmoBonus, gambitBonus15 } from '../systems/w5/hole.js';
import { companionBonus } from '../data/common/companions.js';
import { equipSetBonus } from '../data/common/equipment.js';
import { label } from '../entity-names.js';

export default {
  id: 'research-exp',
  name: 'Research EXP Bonus',
  scope: 'account',
  category: 'research',

  pools: {},

  combine: function(pools, ctx) {
    var saveData = ctx.saveData;
    if (!saveData) return { val: 0, children: null };
    var evStr = saveData.cachedEventShopStr;
    var gd12 = saveData.gamingData[12];
    var nd102_9 = saveData.ninjaData && saveData.ninjaData[102] && saveData.ninjaData[102][9];
    var olaStr379 = saveData.olaData[379];

    // ---- Additive sources ----
    var items = [];

    // 1. Sticker
    var stkLv = saveData.research && saveData.research[9] && saveData.research[9][1] || 0;
    var stkBase = stickerBase(1) || 5;
    var boonyCount = saveData.research && saveData.research[11] && saveData.research[11].length || 0;
    var gb68 = gridBonusFinal(saveData, 68);
    var evShop37 = eventShopOwned(37, evStr);
    var stkCrownMulti = 1 + (gb68 * boonyCount + 30 * evShop37) / 100;
    var sb62 = superBitType(62, gd12);
    var stkSb62 = 1 + 20 * sb62 / 100;
    var sticker = stkCrownMulti * stkSb62 * stkLv * stkBase;
    items.push({ name: 'Sticker Bonus', val: sticker,
      children: stkLv > 0 ? [
        { name: 'Sticker Lv', val: stkLv, fmt: 'raw' },
        { name: 'Base', val: stkBase, fmt: 'raw' },
        { name: 'Crown Multi', val: stkCrownMulti, fmt: 'x', note: 'GB68=' + gb68.toFixed(1) + ' x' + boonyCount + ' boonies + 30x' + evShop37 + ' evShop' },
        { name: label('Super Bit', 62), val: stkSb62, fmt: 'x' },
      ] : null });

    // 2. Dancing Coral
    var tower22 = saveData.towerData[22] || 0;
    var dcBase = dancingCoralBase(4) || 3;
    var dancingCoral = dcBase * Math.max(0, tower22 - 200);
    items.push({ name: 'Dancing Coral', val: dancingCoral });

    // 3. Zenith Market
    var zmLevel = saveData.spelunkData && saveData.spelunkData[45] && saveData.spelunkData[45][8] || 0;
    items.push({ name: 'Zenith Market', val: Math.floor(1 * zmLevel) });

    // 4-5. Cards
    var clvW7b1 = computeCardLv('w7b1');
    var clvW7b4 = computeCardLv('w7b4');
    items.push({ name: 'Trench Fish Card', val: Math.min(clvW7b1, 10) });
    items.push({ name: 'Eggroll Card', val: Math.min(2 * clvW7b4, 10) });

    // 6. Prehistoric Set
    var ola379 = String(saveData.olaData[379] || '');
    items.push({ name: 'Prehistoric Set', val: ola379.includes('PREHISTORIC_SET') ? equipSetBonus('PREHISTORIC_SET') : 0 });

    // 7. Slabbo
    var hasSB34 = superBitType(34, gd12);
    var c1len = saveData.cards1Data.length || 0;
    var slabboBase = Math.floor(Math.max(0, c1len - 1300) / 5);
    var slabboMF15 = mainframeBonus(15);
    var slabboMeritoc23 = computeMeritocBonusz(23);
    var slabboLegend28 = legendPTSbonus(28);
    var vub74 = saveData.vaultData[74] || 0;
    var slabboMult = (1 + slabboMF15 / 100) * (1 + slabboMeritoc23 / 100) * (1 + slabboLegend28 / 100) * (1 + vub74 / 100);
    var slabbo = hasSB34 ? 0.1 * slabboMult * slabboBase : 0;
    items.push({ name: 'Slab Bonus', val: slabbo,
      children: hasSB34 && slabboBase > 0 ? [
        { name: 'Cards Found', val: c1len, fmt: 'raw' },
        { name: 'Base', val: slabboBase, fmt: 'raw', note: 'floor((cards-1300)/5)' },
        { name: 'Multi', val: slabboMult, fmt: 'x', note: 'MF15+merit23+leg28+vub74' },
      ] : null });

    // 8. Arcade
    items.push({ name: label('Arcade', 63), val: arcadeBonus(63) });

    // 9. Meal (Giga Chip)
    var mealLv = saveData.mealsData && saveData.mealsData[0] && saveData.mealsData[0][72] || 0;
    var ribBon = ribbonBonusAt(100, saveData.ribbonData, olaStr379);
    var mealBase = ribBon * mealLv * 0.01;
    var mfb116 = mainframeBonus(116);
    var shinyS20 = computeShinyBonusS(20);
    var winBon26 = computeWinBonus(26);
    var cookMulti = (1 + (mfb116 + shinyS20) / 100) * (1 + winBon26 / 100);
    var meal = mealBase * cookMulti;
    items.push({ name: 'Meal (Giga Chip)', val: meal,
      children: mealLv > 0 ? [
        { name: 'Meal Lv', val: mealLv, fmt: 'raw' },
        { name: 'Ribbon', val: ribBon, fmt: 'x' },
        { name: 'Cook Multi', val: cookMulti, fmt: 'x' },
      ] : null });

    // 10. Crop Scientist
    var hasEmp44 = emporiumBonus(44, nd102_9);
    var cropRaw = hasEmp44 ? Math.floor(Math.max(0, (saveData.farmCropCount - 200) / 10)) : 0;
    var mf17 = mainframeBonus(17);
    var gub22 = grimoireUpgBonus22();
    var exo40 = exoticBonusQTY40();
    var vub79 = saveData.vaultData[79] || 0;
    var cropSCmulti = (1 + mf17 / 100) * (1 + (gub22 + exo40 + vub79) / 100);
    var cropSC = cropRaw * cropSCmulti;
    items.push({ name: 'Crop Scientist', val: cropSC,
      children: hasEmp44 && cropRaw > 0 ? [
        { name: 'Crops', val: saveData.farmCropCount, fmt: 'raw' },
        { name: 'Base', val: cropRaw, fmt: 'raw', note: 'floor((crops-200)/10)' },
        { name: 'Multi', val: cropSCmulti, fmt: 'x' },
      ] : null });

    // 11. MSA
    var hasSB44 = superBitType(44, gd12);
    var gamingStars = Array.isArray(saveData.totemInfoData[0]) ? saveData.totemInfoData[0].reduce(function(a, v) { return a + (Number(v) || 0); }, 0) : 0;
    var msa = hasSB44 ? 0.3 * Math.max(0, Math.floor((gamingStars - 300) / 10)) : 0;
    items.push({ name: 'MSA Bonus', val: msa });

    // 12. Lore Episode / Tome
    var loreEpisodes = saveData.spelunkData && saveData.spelunkData[13] && saveData.spelunkData[13][2] || 0;
    var loreVal = 0;
    if (loreEpisodes > 7 && saveData.totalTomePoints > 0) {
      var g17 = saveData.grimoireData && saveData.grimoireData[17] || 0;
      var trollSet = String(saveData.olaData[379] || '').includes('TROLL_SET') ? equipSetBonus('TROLL_SET') : 0;
      var loreMult = 1 + (g17 + trollSet) / 100;
      var x = Math.floor(Math.max(0, saveData.totalTomePoints - 16000) / 100);
      var xp = Math.pow(x, 0.7);
      loreVal = loreMult * 20 * Math.max(0, xp / (25 + xp));
    } else if (saveData.totalTomePoints <= 0 && saveData.extBonusOverrides && saveData.extBonusOverrides.loreEpi) {
      loreVal = parseFloat(saveData.extBonusOverrides.loreEpi) || 0;
    }
    items.push({ name: 'Tome Bonus', val: loreVal,
      children: loreVal > 0 && saveData.totalTomePoints > 0 ? [
        { name: 'Tome PTS', val: saveData.totalTomePoints, fmt: 'raw' },
      ] : null });

    // ---- Sum additive ----
    var totalAdd = 0;
    for (var i = 0; i < items.length; i++) totalAdd += items[i].val;

    // ---- True multipliers ----
    var multItems = [];

    var comp52owned = saveData.companionIds.has(52);
    var comp52val = comp52owned ? companionBonus(52) : 0;
    multItems.push({ name: label('Companion', 52, ' (1.5x)'), val: 1 + comp52val, fmt: 'x', note: comp52owned ? 'Owned' : 'Not owned' });

    var comp153owned = saveData.companionIds.has(153);
    var comp153val = comp153owned ? companionBonus(153) : 0;
    multItems.push({ name: label('Companion', 153, ' (2x)'), val: 1 + comp153val, fmt: 'x', note: comp153owned ? 'Owned' : 'Not owned' });

    var rog0val = rogBonusQTY(0, saveData.cachedUniqueSushi);
    multItems.push({ name: 'Sushi RoG (2x)', val: 1 + rog0val / 100, fmt: 'x', note: saveData.cachedUniqueSushi > 0 ? saveData.cachedUniqueSushi + ' unique sushi' : 'No sushi' });

    var comp55val = saveData.companionIds.has(55) ? companionBonus(55) : 0;
    var comp0val = saveData.companionIds.has(0) && saveData.cachedComp0DivOk && (saveData.gridLevels[173] || 0) > 0 ? 5 : 0;
    var allMulti = 1 + (comp55val + comp0val) / 100;
    multItems.push({ name: 'Grid AllBonusMulti', val: allMulti, fmt: 'x', note: 'Comp55=' + comp55val + ' Comp0=' + comp0val });

    // ---- Gambit (AFK rate contribution) ----
    var gambit15 = gambitBonus15(saveData);

    // ---- Build result ----
    var children = [];
    for (var i = 0; i < items.length; i++) {
      if (items[i].val > 0) children.push(items[i]);
    }
    if (gambit15 > 0) children.push({ name: label('Gambit', 15), val: gambit15, fmt: 'raw' });
    children.push({ name: 'True Multipliers', val: 0, children: multItems, fmt: 'raw', note: 'Applied separately in sim' });

    return { val: totalAdd, children: children };
  },
};
