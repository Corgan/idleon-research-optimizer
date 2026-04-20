// ===== GIANT MOB ODDS DESCRIPTOR =====
// ArbitraryCode("GiantMob"): two-branch formula based on giant kill count.

import { computePrayerReal } from '../systems/w3/prayer.js';
import { shrine } from '../systems/w3/construction.js';
import { computeVialByKey } from '../systems/w2/alchemy.js';
import { optionsListData } from '../../save/data.js';
import { safe, safeTree, rval, createDescriptor } from './helpers.js';

export default createDescriptor({
  id: 'giant-mob',
  name: 'Giant Mob Odds',
  scope: 'character',
  category: 'combat',

  combine: function(pools, ctx) {
    var s = ctx.saveData;
    var ci = ctx.charIdx || 0;

    // Prayer(5,0) > 5 is the gate — "Big Ol' Giant" must be active
    var _prayer5T = safeTree(computePrayerReal, 5, 0, ci, s);
    var prayer5 = _prayer5T.val;
    if (prayer5 <= 5) {
      return { val: 0, children: [
        { name: 'Prayer 5 (Big Ol\' Giant)', val: prayer5, fmt: 'raw', note: 'Need >5 to enable', children: _prayer5T.children },
      ]};
    }

    var killCount = Number(optionsListData[57]) || 0;
    var _prayer18penT = safeTree(computePrayerReal, 18, 1, ci, s);
    var prayer18pen = _prayer18penT.val;
    var shrine6 = rval(shrine, 6, ctx);
    var _vialGiantT = safeTree(computeVialByKey, 'GiantMob', s);
    var vialGiant = _vialGiantT.val;

    var boostMult = 1 + (shrine6 + vialGiant) / 100;
    var penaltyMult = 1 + prayer18pen / 100;

    var odds;
    if (killCount < 5) {
      odds = 1 / ((100 + 50 * Math.pow(killCount + 1, 2)) * penaltyMult) * boostMult;
    } else {
      odds = 1 / (2 * Math.pow(killCount + 1, 1.95) * penaltyMult
        * Math.pow(killCount + 1, 1.5 + killCount / 15)) * boostMult;
    }

    var oneIn = odds > 0 ? Math.round(1 / odds) : Infinity;

    var children = [
      { name: 'Prayer 5 (gate)', val: prayer5, fmt: 'raw', children: _prayer5T.children },
      { name: 'Giant Kill Count', val: killCount, fmt: 'raw', note: 'OLA[57]' },
      { name: 'Prayer 18 (penalty)', val: prayer18pen, fmt: 'raw', children: _prayer18penT.children },
      { name: 'Shrine 6', val: shrine6, fmt: 'raw' },
      { name: 'Vial GiantMob', val: vialGiant, fmt: 'raw', children: _vialGiantT.children },
      { name: 'Boost Multi', val: boostMult, fmt: 'x' },
      { name: 'Penalty Multi', val: penaltyMult, fmt: 'x' },
      { name: 'Odds', val: odds, fmt: 'raw', note: '1 in ' + oneIn },
    ];

    return { val: odds, children: children };
  },
});
