// ===== CRYSTAL MOB SPAWN DESCRIPTOR =====
// ArbitraryCode("CrystalSpawn"): composite formula / 2000
// Also computes CrystalEmbiggener = max(1, CrystalSpawn / 0.1)

import { computeCardBonusByType, computeBoxReward } from '../systems/common/stats.js';
import { computeStampBonusOfTypeX } from '../systems/w1/stamp.js';
import { talent } from '../systems/common/talent.js';
import { shrine } from '../systems/w3/construction.js';
import { eventShopOwned } from '../../game-helpers.js';
import { safe, rval, safeTree, createDescriptor } from './helpers.js';

export default createDescriptor({
  id: 'crystal-spawn',
  name: 'Crystal Mob Chance',
  scope: 'character',
  category: 'combat',

  combine: function(pools, ctx) {
    var s = ctx.saveData;
    var ci = ctx.charIdx || 0;

    var evStr = s.cachedEventShopStr;
    var evShop42 = 5 * safe(eventShopOwned, 42, evStr);

    var talent26 = rval(talent, 26, ctx);
    var talent619 = rval(talent, 619, ctx);
    var _brCrys = safe(computeBoxReward, ci, 'CrystalSpawn');
    var boxCrystal = (typeof _brCrys === 'object') ? (_brCrys.val || 0) : Number(_brCrys) || 0;
    var shrine6 = rval(shrine, 6, ctx);
    var _stampCryT = safeTree(computeStampBonusOfTypeX, 'CrySpawn', s);
    var stampCry = _stampCryT.val;
    var _cardBonus14T = safeTree(computeCardBonusByType, 14, ci, s);
    var cardBonus14 = _cardBonus14T.val;

    var raw = evShop42
      + (1 + talent26 / 100)
      * (1 + (boxCrystal + shrine6) / 100)
      * (1 + talent619 / 100)
      * (1 + stampCry / 100)
      * (1 + cardBonus14 / 100);

    var crystalSpawn = raw / 2000;
    var cap = 0.1;
    var embiggener = Math.max(1, crystalSpawn / cap);
    var effectiveChance = Math.min(cap, crystalSpawn);
    var oneIn = effectiveChance > 0 ? Math.round(1 / effectiveChance) : Infinity;

    var children = [
      { name: 'Raw Numerator', val: raw, fmt: 'raw', children: [
        { name: 'EventShop 42 (×5)', val: evShop42, fmt: 'raw' },
        { name: 'Talent 26', val: talent26, fmt: 'raw' },
        { name: 'Talent 619', val: talent619, fmt: 'raw' },
        { name: 'Box CrystalSpawn', val: boxCrystal, fmt: 'raw' },
        { name: 'Shrine 6', val: shrine6, fmt: 'raw' },
        { name: 'Stamp CrySpawn', val: stampCry, fmt: 'raw', children: _stampCryT.children },
        { name: 'Card Bonus 14', val: cardBonus14, fmt: 'raw', children: _cardBonus14T.children },
      ]},
      { name: '÷ 2000', val: crystalSpawn, fmt: 'raw' },
      { name: 'Cap (10%)', val: cap, fmt: 'raw' },
      { name: 'Effective Chance', val: effectiveChance, fmt: 'raw', note: '1 in ' + oneIn },
      { name: 'Crystal Embiggener', val: embiggener, fmt: 'x', note: 'max(1, spawn/cap)' },
    ];

    return { val: effectiveChance, children: children };
  },
});
