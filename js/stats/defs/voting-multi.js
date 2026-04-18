// ===== VOTING MULTI DESCRIPTOR =====
// Replaces dnsm.votingBonuszMulti computation.
// Formula: (1 + comp161/100) * (1 + meritoc9/100) * (1 + innerSum/100)

import { createDescriptor } from './helpers.js';

export default createDescriptor({
  id: 'voting-multi',
  name: 'Voting Multiplier',
  scope: 'account',
  category: 'multiplier',

  pools: {
    mult1: [
      { system: 'companion', id: 161 },
    ],
    mult2: [
      { system: 'meritoc', id: 9 },
    ],
    inner: [
      { system: 'companion', id: 41 },
      { system: 'dream', id: 13, args: [1] },
      { system: 'cosmo', id: '2_3' },
      { system: 'winBonus', id: 22 },
      { system: 'eventShop', id: 7, args: [17] },
      { system: 'eventShop', id: 16, args: [13] },
      { system: 'companion', id: 19 },
      { system: 'palette', id: 32 },
      { system: 'legendPTS', id: 22 },
      { system: 'sushiRoG', id: 50 },
    ],
  },

  combine: function(pools) {
    var comp161 = pools.mult1.items[0] ? pools.mult1.items[0].val : 0;
    var meritoc9 = pools.mult2.items[0] ? pools.mult2.items[0].val : 0;
    var innerSum = pools.inner.sum;
    var val = (1 + comp161 / 100) * (1 + meritoc9 / 100) * (1 + innerSum / 100);

    var children = [
      { name: 'Companion 161 \u00d7', val: 1 + comp161 / 100, children: pools.mult1.items, fmt: 'x' },
      { name: 'Meritoc 9 \u00d7', val: 1 + meritoc9 / 100, children: pools.mult2.items, fmt: 'x' },
      { name: 'Additive Pool \u00d7', val: 1 + innerSum / 100, children: pools.inner.items, fmt: 'x' },
    ];

    return { val: val, children: children };
  },
});
