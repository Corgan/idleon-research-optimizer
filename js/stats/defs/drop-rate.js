// ===== DROP RATE DESCRIPTOR =====
// Defines all sources, pools, and the combine() formula for Drop Rate.

export default {
  id: 'drop-rate',
  name: 'Drop Rate',
  scope: 'character+map',
  category: 'combat',

  pools: {
    base: [
      { system: 'lukScaling' },
    ],
    addMain: [
      { system: 'talent', id: 279 },
      { system: 'talent', id: 24 },
      { system: 'talent', id: 655 },
      { system: 'stamp', id: 'A38' },
      { system: 'alchemy', id: 'DROPPIN_LOADS' },
      { system: 'prayer', id: 7 },
      { system: 'shrine', id: 4 },
      { system: 'arcade', id: 27 },
      { system: 'card', id: 10 },
      { system: 'guild', id: 10 },
      { system: 'cardSet', id: 5 },
      { system: 'cardSet', id: 6 },
      { system: 'starSign', id: 'drop' },
      { system: 'postOffice', id: [11, 0] },
      { system: 'etcBonus', id: 2 },
      { system: 'etcBonus', id: 102 },
      { system: 'sigil', id: 11 },
      { system: 'shiny', id: 0 },
      { system: 'companion', id: 3 },
      { system: 'companion', id: 50 },
      { system: 'winBonus', id: 9 },
      { system: 'tome', id: 2 },
      { system: 'grid', id: 173 },
      { system: 'dream', id: 10 },
    ],
    addLUK2: [
      { system: 'cardSingle', id: 'mini5a', args: [1.5, 10] },
      { system: 'cardSingle', id: 'caveC', args: [4, 30] },
      { system: 'cardSingle', id: 'anni4Event1', args: [2, 20] },
      { system: 'cardSingle', id: 'luckEvent1', args: [3, 25] },
      { system: 'goldenFood', id: 'DropRatez' },
      { system: 'achievement', id: 377, args: [6] },
      { system: 'achievement', id: 381, args: [4] },
      { system: 'owl', id: 4 },
      { system: 'voting', id: 27 },
      { system: 'grimoire', id: 44 },
      { system: 'vault', id: 18 },
      { system: 'farm', id: 'rank9' },
      { system: 'farm', id: 'cropSC7' },
      { system: 'farm', id: 'exotic59' },
      { system: 'holes', id: 'upg46' },
      { system: 'holes', id: 'upg82' },
      { system: 'holes', id: 'meas15' },
      { system: 'holes', id: 'monument' },
      { system: 'companion', id: 22 },
      { system: 'companion', id: 158 },
      { system: 'companion', id: 111 },
      { system: 'emperor', id: 11 },
      { system: 'setBonus', id: 'efaunt' },
      { system: 'friend', id: 3 },
      { system: 'legendPTS', id: 1 },
      { system: 'spelunkShop', id: 50 },
    ],
    chipDR: [
      { system: 'chip', id: 'dr' },
    ],
    postFlat: [
      { system: 'bundle', id: 'bun_v' },
      { system: 'ola', id: 232, args: [1, 0.3] },
    ],
    postMult: [
      { system: 'talent', id: 328 },
      { system: 'bundle', id: 'bun_p' },
      { system: 'arcaneMap' },
      { system: 'card', id: 101 },
      { system: 'sushiRoG', id: 48 },
      { system: 'grid', id: 168 },
      { system: 'tome', id: 7 },
      { system: 'etcBonus', id: 99 },
      { system: 'minehead', id: 0 },
      { system: 'cloudBonus', id: 69, args: [5] },
      { system: 'pristine', id: 3 },
      { system: 'etcBonus', id: 91 },
      { system: 'compMulti', id: 26, args: [1.3] },
      { system: 'compMulti', id: 160, args: [1.5, 2] },
      { system: 'compMulti', id: 50, args: [1.01, 2500] },
    ],
  },

  combine: function(pools) {
    // Step 1: LUK scaling (base pool has one item)
    var lukVal = pools.base.items[0] ? pools.base.items[0].val : 0;
    var lukC = 1.4 * lukVal;

    // Step 2+3: additive pools
    var addSum = pools.addMain.sum + pools.addLUK2.sum;
    var base = lukC + addSum / 100 + 1;

    // Chip cap-break (only if base < 5)
    var chipPct = pools.chipDR.items[0] ? pools.chipDR.items[0].val : 0;
    var chipApplied = 0;
    if (base < 5 && chipPct > 0) {
      chipApplied = Math.min(5 - base, chipPct / 100);
      base += chipApplied;
    }

    // Step 4: Post-processing — exact game order (interleaved flats/mults)
    // postFlat[0]=bunV, postFlat[1]=ola232
    // postMult[0]=talent328, postMult[1]=bunP, [2..]=remaining
    var dr = base;
    var pf = pools.postFlat.items;
    var pm = pools.postMult.items;

    dr += pf[0] ? pf[0].val : 0;         // +bunV
    dr *= pm[0] ? pm[0].val : 1;          // ×talent328 (raw mult, fmt='x')
    dr += pf[1] ? pf[1].val : 0;          // +ola232
    dr *= pm[1] ? pm[1].val : 1;          // ×bunP (raw mult, no fmt but val=1.2)

    // Remaining multipliers
    for (var i = 2; i < pm.length; i++) {
      var item = pm[i];
      var v = item.val || 0;
      if (item.fmt === 'x') {
        dr *= v;                            // raw multiplier (glimbo, compMulti)
      } else {
        dr *= (1 + v / 100);               // percentage → multiplier
      }
    }

    // Build tree
    var postMult = base > 0 ? dr / base : 1;
    var allPostItems = pf.concat(pm);

    var children = [
      { name: 'LUK Scaling', val: lukVal,
        children: pools.base.items[0] ? pools.base.items[0].children : null, fmt: 'raw' },
      { name: '× 1.4', val: lukC, fmt: 'raw', note: '1.4 × lukScaling' },
      { name: 'Main Additive Pool', val: pools.addMain.sum,
        children: pools.addMain.items, fmt: '+' },
      { name: 'LUK2 Additive Pool', val: pools.addLUK2.sum,
        children: pools.addLUK2.items, fmt: '+' },
      { name: 'Sum / 100 + 1', val: base - chipApplied, fmt: 'raw',
        note: '(' + lukC.toFixed(2) + ' + ' + addSum.toFixed(1) + '/100 + 1)' },
    ];
    children.push({ name: 'Chip Cap-Break', val: chipApplied,
      children: pools.chipDR.items, fmt: '+', note: chipApplied > 0 ? 'Applies when base < 5×' : 'Inactive (base ≥ 5× or no chip)' });
    children.push({ name: 'Post-Processing', val: postMult,
      children: allPostItems, fmt: 'x' });

    return { val: dr, children: children };
  },
};
