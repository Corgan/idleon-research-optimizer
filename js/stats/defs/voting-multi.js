// ===== VOTING MULTI DESCRIPTOR =====
// Replaces dnsm.votingBonuszMulti computation.
// Formula: (1 + comp161/100) * (1 + meritoc9/100) * (1 + innerSum/100)

import { computeMeritocBonusz } from '../systems/w7/meritoc.js';
import { legendPTSbonus } from '../systems/w7/spelunking.js';
import { computeWinBonus } from '../systems/w6/summoning.js';
import { eventShopOwned } from '../../game-helpers.js';
import { cosmoUpgBase } from '../data/w5/hole.js';
import { dreamData } from '../../save/data.js';
import { companionBonus } from '../data/common/companions.js';
import { paletteParams } from '../data/w4/gaming.js';
import { rogBonusQTY } from '../systems/w7/sushi.js';
import { label } from '../entity-names.js';
import { createDescriptor } from './helpers.js';

export default createDescriptor({
  id: 'voting-multi',
  name: 'Voting Multiplier',
  scope: 'account',
  category: 'multiplier',

  combine: function(pools, ctx) {
    var saveData = ctx.saveData;
    if (!saveData) return { val: 1, children: null };

    var meritoc9 = computeMeritocBonusz(9, ctx.saveData);

    var comp161 = saveData.companionIds && saveData.companionIds.has(161) ? companionBonus(161) : 0;

    var comp41 = saveData.companionIds && saveData.companionIds.has(41) ? companionBonus(41) : 0;
    var dream13 = Number((dreamData || [])[13]) || 0;
    var comp19 = saveData.companionIds && saveData.companionIds.has(19) ? companionBonus(19) : 0;
    var legendPTS22 = legendPTSbonus(22, ctx.saveData);
    var evStr = saveData.cachedEventShopStr;
    var eventShop7 = eventShopOwned(7, evStr);
    var eventShop16 = eventShopOwned(16, evStr);

    var cosmoBase = cosmoUpgBase(2, 3);
    var holesLv = Number(saveData.holesData && saveData.holesData[6] && saveData.holesData[6][3]) || 0;
    var cosmoBonus23 = Math.floor(cosmoBase * holesLv);

    var winBonus22 = computeWinBonus(22, ctx.saveData);

    var paletteLv = Number(saveData.spelunkData && saveData.spelunkData[9] && saveData.spelunkData[9][32]) || 0;
    var paletteBonus32 = 0;
    if (paletteLv > 0) {
      var _pp32 = paletteParams(32);
      var paletteRaw = paletteLv / (paletteLv + _pp32.denom) * _pp32.coeff;
      var legendMulti = 1 + legendPTSbonus(10, ctx.saveData) / 100;
      var loreFlag8 = (Number(saveData.spelunkData && saveData.spelunkData[0] && saveData.spelunkData[0][8]) || 0) >= 1 ? 1 : 0;
      var loreMulti = 1 + 0.5 * loreFlag8;
      paletteBonus32 = paletteRaw * legendMulti * loreMulti;
    }

    var rogBonus50 = rogBonusQTY(50, saveData.cachedUniqueSushi);

    var innerSum = comp41 + dream13 + cosmoBonus23 + winBonus22
      + 17 * eventShop7 + 13 * eventShop16 + comp19 + paletteBonus32 + legendPTS22 + rogBonus50;
    var val = (1 + comp161 / 100) * (1 + meritoc9 / 100) * (1 + innerSum / 100);

    // Build breakdown tree
    var innerCh = [];
    if (comp41 > 0) innerCh.push({ name: label('Companion', 41), val: comp41, fmt: 'raw' });
    if (dream13 > 0) innerCh.push({ name: label('Dream', 13), val: dream13, fmt: 'raw' });
    if (cosmoBonus23 > 0) innerCh.push({ name: label('Cosmo', '2/3'), val: cosmoBonus23, fmt: 'raw', note: 'Holes Lv=' + holesLv });
    if (winBonus22 > 0) innerCh.push({ name: label('WinBonus', 22), val: winBonus22, fmt: 'raw' });
    if (eventShop7 > 0) innerCh.push({ name: '17\u00d7EvShop 7', val: 17 * eventShop7, fmt: 'raw' });
    if (eventShop16 > 0) innerCh.push({ name: '13\u00d7EvShop 16', val: 13 * eventShop16, fmt: 'raw' });
    if (comp19 > 0) innerCh.push({ name: label('Companion', 19), val: comp19, fmt: 'raw' });
    if (paletteBonus32 > 0) innerCh.push({ name: label('Palette', 32), val: paletteBonus32,
      children: [
        { name: 'Palette Level', val: paletteLv, fmt: 'raw' },
        { name: label('Legend', 10, ' \u00d7'), val: 1 + legendPTSbonus(10, ctx.saveData) / 100, fmt: 'x' },
      ], fmt: 'raw' });
    if (legendPTS22 > 0) innerCh.push({ name: label('Legend', 22), val: legendPTS22, fmt: 'raw' });
    if (rogBonus50 > 0) innerCh.push({ name: label('RoG', 50), val: rogBonus50, fmt: 'raw' });

    var children = [
      { name: label('Companion', 161, ' \u00d7'), val: 1 + comp161 / 100, fmt: 'x' },
      { name: label('Meritoc', 9, ' \u00d7'), val: 1 + meritoc9 / 100, fmt: 'x' },
      { name: 'Additive Pool \u00d7', val: 1 + innerSum / 100, children: innerCh.length ? innerCh : null, fmt: 'x' },
    ];

    return { val: val, children: children };
  },
});
