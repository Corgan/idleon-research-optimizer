// ===== CRYSTAL MOB SPAWN DESCRIPTOR =====
// ArbitraryCode("CrystalSpawn"): composite formula / 2000
// Also computes CrystalEmbiggener = max(1, CrystalSpawn / 0.1)

import { computeCardBonusByType, computeBoxReward } from '../systems/common/stats.js';
import { computeStampBonusOfTypeX } from '../systems/w1/stamp.js';
import { talent } from '../systems/common/talent.js';
import { shrine } from '../systems/w3/construction.js';
import { eventShopOwned } from '../../game-helpers.js';
import { label } from '../entity-names.js';
import { safe, rval, safeTree, createDescriptor } from './helpers.js';
import { combatMapApplicability } from '../systems/common/combat-outcomes.js';
import { companions } from '../systems/common/companions.js';
import { jellyCompletionBonus } from '../systems/w7/jelly-operator.js';

export default createDescriptor({
  id: 'crystal-spawn',
  name: 'Crystal Mob Chance',
  scope: 'character+map',
  category: 'combat',
  applies: combatMapApplicability,

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
    var companion171 = Number(companions(171, s)) || 0;
    var jelly8 = jellyCompletionBonus(8, s);
    var _stampCryT = safeTree(computeStampBonusOfTypeX, 'CrySpawn', s);
    var stampCry = _stampCryT.val;
    var _cardBonus14T = safeTree(computeCardBonusByType, 14, ci, s);
    var cardBonus14 = _cardBonus14T.val;

    var raw = evShop42
      + (1 + talent26 / 100)
      * (1 + (boxCrystal + shrine6 + companion171 + jelly8) / 100)
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
        { name: 'Event Shop: Crystal Mob Spawn Chance', val: evShop42, fmt: 'raw', note: '5 per purchase' },
        { name: label('Talent', 26), val: talent26, fmt: 'raw' },
        { name: label('Talent', 619), val: talent619, fmt: 'raw' },
        { name: 'Box Rewards: Crystal Mob Spawn Chance', val: boxCrystal, fmt: 'raw' },
        { name: label('Shrine', 6), val: shrine6, fmt: 'raw' },
        { name: label('Companion', 171), val: companion171, fmt: 'raw' },
        { name: 'Jelly obstruction 9', val: jelly8, fmt: 'raw' },
        { name: 'Stamps: Crystal Mob Spawn Chance', val: stampCry, fmt: 'raw', children: _stampCryT.children },
        { name: 'Cards: Crystal Mob Spawn Chance', val: cardBonus14, fmt: 'raw', children: _cardBonus14T.children },
      ]},
      { name: '÷ 2000', val: crystalSpawn, fmt: 'raw' },
      { name: 'Cap (10%)', val: cap, fmt: 'raw' },
      { name: 'Effective Chance', val: effectiveChance, fmt: 'raw', note: '1 in ' + oneIn },
      { name: 'Crystal Embiggener', val: embiggener, fmt: 'x', note: 'max(1, spawn/cap)' },
    ];

    return { val: effectiveChance, children: children };
  },
});
