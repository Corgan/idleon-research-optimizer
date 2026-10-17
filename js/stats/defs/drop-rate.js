// ===== DROP RATE DESCRIPTOR =====
// Defines all sources, pools, and the combine() formula for Drop Rate.

import { createDescriptor, safe } from './helpers.js';
import { statueBonus } from '../systems/w7/royal-guardian.js';
import { computeFamBonusQTYs } from '../systems/common/stats.js';
import { companionLevel2 } from '../data/common/companions.js';
import { drBonus as cglunkoDropRate } from '../systems/w5/cglunko.js';
import { computeDungeonDropRate, isDungeonMap } from '../systems/w2/dungeon.js';
import { jellyRewardBonus } from '../data/w7/jelly-operator.js';
import { menagerieBoostQTY } from '../systems/w7/menagerie.js';

export default createDescriptor({
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
      { system: 'postOffice', id: [11, 0] },
      { system: 'etcBonus', id: 2 },
      { system: 'etcBonus', id: 102 },
      { system: 'alchemy', id: 'DROPPIN_LOADS' },
      { system: 'card', id: 10 },
      { system: 'talent', id: 24 },
      { system: 'starSign', id: 'drop' },
      { system: 'guild', id: 10 },
      { system: 'cardSet', id: 5 },
      { system: 'cardSet', id: 6 },
      { system: 'shrine', id: 4 },
      { system: 'prayer', id: 7 },
      { system: 'sigil', id: 11 },
      { system: 'shiny', id: 0 },
      { system: 'arcade', id: 27 },
      { system: 'companion', id: 3 },
      { system: 'companion', id: 50 },
      { system: 'stamp', id: 'A38' },
      { system: 'talent', id: 655 },
      { system: 'dream', id: 10 },
      { system: 'winBonus', id: 9 },
      { system: 'tome', id: 2 },
      { system: 'grid', id: 173 },
      { system: 'companion', id: 132 },
    ],
    addLUK2: [
      { system: 'cardSingle', id: 'mini5a', args: [1.5, 10] },
      { system: 'cardPassiveDropRate' },
      { system: 'cardSingle', id: 'anni4Event1', args: [2, 20] },
      { system: 'cardSingle', id: 'luckEvent1', args: [3, 25] },
      { system: 'goldenFood', id: 'DropRatez' },
      { system: 'achievement', id: 377, args: [6] },
      { system: 'achievement', id: 381, args: [4] },
      { system: 'owl', id: 4 },
      { system: 'farm', id: 'rank9' },
      { system: 'voting', id: 27 },
      { system: 'holes', id: 'upg46' },
      { system: 'farm', id: 'cropSC7' },
      { system: 'grimoire', id: 44 },
      { system: 'vault', id: 18 },
      { system: 'holes', id: 'meas15' },
      { system: 'companion', id: 22 },
      { system: 'companion', id: 158 },
      { system: 'holes', id: 'upg82' },
      { system: 'holes', id: 'monument' },
      { system: 'emperor', id: 11 },
      { system: 'setBonus', id: 'efaunt' },
      { system: 'farm', id: 'exotic59' },
      { system: 'friend', id: 3 },
      { system: 'legendPTS', id: 1 },
      { system: 'spelunkShop', id: 50 },
      { system: 'companion', id: 111 },
    ],
    chipDR: [
      { system: 'chip', id: 'dr' },
    ],
    postFlat: [
      { system: 'bundle', id: 'bun_v' },
      { system: 'ola', id: 232, args: [1, 0.3] },
    ],
    postMult: [
      { system: 'workshop' },
      { system: 'bundle', id: 'bun_p' },
      { system: 'arcaneMap' },
      { system: 'card', id: 101 },
      { system: 'companion', id: 168 },
      { system: 'companion', id: 132 },
      { system: 'sushiRoG', id: 48 },
      { system: 'glimbo' },
      { system: 'tome', id: 7 },
      { system: 'etcBonus', id: 99 },
      { system: 'minehead', id: 0 },
      { system: 'cloudBonus', id: 69, args: [5] },
      { system: 'pristine', id: 3 },
      { system: 'etcBonus', id: 91 },
      { system: 'vial', id: '7drMulto' },
      { system: 'companion', id: 26 },
      { system: 'companion', id: 160 },
      { system: 'companion', id: 50 },
    ],
  },

  combine: function(pools, ctx) {
    if (isDungeonMap(ctx.mapIdx)) {
      var hasDungeonLuk = Number.isFinite(ctx.dungeonLuk);
      var hasDungeonDropRate = Number.isFinite(ctx.dungeonDropRarity);
      if (!hasDungeonLuk || !hasDungeonDropRate) {
        return {
          val: 0,
          unavailable: true,
          reason: 'Dungeon Drop Rate needs live dungeon Total LUK and Dungeon Drop Rate stat values, which are not stored in save JSON.',
          children: [
            { name: 'Dungeon Runtime Inputs Required', val: 0, fmt: 'raw', note: 'Enter the two values shown in the active dungeon run.' },
          ],
        };
      }
      var dungeonDR = computeDungeonDropRate(ctx.dungeonLuk, ctx.dungeonDropRarity);
      return {
        val: dungeonDR,
        children: [
          { name: 'Base', val: 1, fmt: 'raw' },
          { name: 'Dungeon Total LUK', val: ctx.dungeonLuk, fmt: 'raw' },
          { name: 'Dungeon Drop Rate Stat', val: ctx.dungeonDropRarity, fmt: '+' },
          { name: 'Dungeon Formula', val: dungeonDR, fmt: 'x', note: '1 + (Dungeon Total LUK + Dungeon Drop Rate stat) / 100' },
        ],
      };
    }

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

    // Remaining multipliers, in TotalStats("Drop_Rarity") source order and grouping.
    var S = ctx.saveData;
    function pv(i) { return pm[i] ? Number(pm[i].val) || 0 : 0; }
    var royalStatue1 = safe(statueBonus, S, 1);
    var menagerieB24 = menagerieBoostQTY(S, 24);
    var famMap = safe(computeFamBonusQTYs, ctx.charIdx || 0, S);
    var fam32 = Number(famMap && famMap[32]) || 0;
    var compLv2_132 = companionLevel2(132, S);
    var jelly14 = jellyRewardBonus(S, 14);
    var c168 = pv(4), c132 = pv(5), c26 = pv(15), c160 = pv(16), c50 = pv(17);
    var comp168Mult = 1 + 0.3 * c168;
    var comp132Mult = 1 + (Math.min(0.5, c132) + 0.2 * compLv2_132);
    var rogJellyMult = 1 + (pv(6) + jelly14) / 100;
    var comp26x160 = Math.max(1, Math.min(1.3, 1 + c26) * (1 + 0.5 * c160));
    var comp50Mult = Math.max(1, Math.min(1.01, 1 + c50 / 2500));
    dr = dr * (1 + pv(2) / 100) * (1 + royalStatue1 / 100) * (1 + menagerieB24 / 100) * (1 + pv(3) / 100) * (1 + fam32 / 100)
      * comp168Mult * comp132Mult * rogJellyMult * Math.max(1, pv(7)) * (1 + pv(8) / 100)
      * (1 + pv(9) / 100) * (1 + pv(10) / 100) * (1 + pv(11) / 100);
    dr = dr * (1 + pv(12) / 100) * (1 + pv(13) / 100) * (1 + pv(14) / 100);
    dr = dr * comp26x160 * comp50Mult;

    // Build tree
    var postMult = base > 0 ? dr / base : 1;
    function xnode(name, val, kids, note) { return { name: name, val: val, fmt: 'x', children: kids || null, note: note }; }
    var allPostItems = [];
    if (pf[0]) allPostItems.push(pf[0]);
    if (pm[0]) allPostItems.push(pm[0]);
    if (pf[1]) allPostItems.push(pf[1]);
    if (pm[1]) allPostItems.push(pm[1]);
    allPostItems.push(pm[2]);
    allPostItems.push({ name: 'Royal Statue 1', val: royalStatue1, fmt: '+', note: 'RoyalG StatueBon(1)' });
    allPostItems.push({ name: 'Menagerie Drop Rate Boost', val: menagerieB24, fmt: '+', note: 'Menagerie Boost 24 (+1% per LV)' });
    allPostItems.push(pm[3]);
    allPostItems.push({ name: 'Family Bonus 32', val: fam32, fmt: '+' });
    allPostItems.push(xnode('Companion 168 Multiplier', comp168Mult, [pm[4]], '1 + 0.3 × Companion 168'));
    allPostItems.push(xnode('Companion 132 Multiplier', comp132Mult, [pm[5], { name: 'CompLV2(132)', val: compLv2_132, fmt: 'raw' }], '1 + (min(0.5, Comp132) + 0.2 × CompLV2(132))'));
    allPostItems.push(xnode('RoG 48 + Jelly Reward 14', rogJellyMult, [pm[6], { name: 'Jelly Reward 14', val: jelly14, fmt: '+', note: 'Gold Bangle' }], '1 + (RoG 48 + Jelly 14) / 100'));
    for (var postIdx = 7; postIdx <= 14; postIdx++) allPostItems.push(pm[postIdx]);
    allPostItems.push(xnode('Companions 26 × 160', comp26x160, [pm[15], pm[16]], 'max(1, min(1.3, 1 + Comp26) × (1 + 0.5 × Comp160))'));
    allPostItems.push(xnode('Companion 50 Multiplier', comp50Mult, [pm[17]], 'max(1, min(1.01, 1 + Comp50 / 2500))'));
    allPostItems = allPostItems.filter(Boolean);

    var children = [
      { name: 'Drop Rate from Total LUK', val: lukVal,
        children: pools.base.items[0] ? pools.base.items[0].children : null, fmt: 'raw' },
      { name: 'LUK Contribution (1.4×)', val: lukC, fmt: 'raw', note: '1.4 × Drop Rate from Total LUK' },
      { name: 'Core Drop Rate Bonuses', val: pools.addMain.sum,
        children: pools.addMain.items, fmt: '+' },
      { name: 'Additional Drop Rate Bonuses', val: pools.addLUK2.sum,
        children: pools.addLUK2.items, fmt: '+' },
      { name: 'Base Drop Rate', val: base - chipApplied, fmt: 'x',
        note: '(' + lukC.toFixed(2) + ' + ' + addSum.toFixed(1) + '/100 + 1)' },
    ];
    children.push({ name: 'Grounded Processor (Below 5×)', val: chipApplied,
      children: pools.chipDR.items, fmt: '+', note: chipApplied > 0 ? 'Applies when base < 5×' : 'Inactive (base ≥ 5× or no chip)' });
    children.push({ name: 'Final Drop Rate Modifiers (Applied in Order)', val: postMult,
      children: allPostItems, fmt: 'x' });

    var cavern = Number(ctx.holeCavern != null ? ctx.holeCavern : ctx.saveData.holesData?.[0]?.[ctx.charIdx]);
    if (ctx.mapIdx === 216 && cavern === 17) {
      var cglunko = cglunkoDropRate(ctx.saveData);
      return {
        val: cglunko,
        children: [
          { name: 'Cglunko Drop Rate Override', val: cglunko, fmt: 'x', note: 'Active in The Cove while this character is in the Cglunko cavern' },
          { name: 'Normal Drop Rate (Not Used)', val: dr, children: children, fmt: 'x' },
        ],
      };
    }

    var missingMetadata = [];
    if (ctx.saveData.companionDataAvailable === false) missingMetadata.push('companion ownership');
    if (ctx.saveData.activeVoteDataAvailable === false) missingMetadata.push('current server vote');
    return {
      val: dr,
      children: children,
      partial: missingMetadata.length > 0,
      reason: missingMetadata.length > 0
        ? 'Partial total: the imported JSON does not include ' + missingMetadata.join(' or ') + ' metadata.'
        : '',
    };
  },
});
