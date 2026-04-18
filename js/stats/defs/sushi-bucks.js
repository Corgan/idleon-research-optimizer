// ===== SUSHI BUCKS DESCRIPTOR =====
// Computes Sushi Station Bucks/hr with detailed breakdown.
// Delegates to sushi/formulas.js for the actual math;
// gathers external sources from ctx.saveData.

import { gbWith } from '../../sim-math.js';
import { arcadeBonus } from '../systems/w2/arcade.js';
import { superBitType } from '../../game-helpers.js';
import { MINEHEAD_BONUS_QTY } from '../data/w7/minehead.js';
import { MAX_SLOTS, MAX_TIER } from '../data/w7/sushi.js';
import { label } from '../entity-names.js';
import { createDescriptor, computeButtonBonus } from './helpers.js';
import {
  totalBucksPerHr, computeCurrencyMulti, currencyPerTier,
  knowledgeBonusTotals, computeOrangeFireSum, fireplaceEffectBase,
  fuelGenPerHr, fuelCapacity, slotsOwned, countActiveSlots,
  upgradeQTY, computeOvertunedMulti,
  currencyPerSlot, slotEffectBase,
} from '../systems/w7/sushi.js';

function _gatherExternal(S) {
  var mf = (S.stateR7 && S.stateR7[4]) || 0;
  var gbCtx = { abm: S.allBonusMulti || 1 };
  return {
    gridBonus189: gbWith(S.gridLevels, S.shapeOverlay, 189, gbCtx),
    gridBonus188: gbWith(S.gridLevels, S.shapeOverlay, 188, gbCtx),
    arcade67: arcadeBonus(67, ctx.saveData),
    mineheadBonus11: mf > 11 ? (MINEHEAD_BONUS_QTY[11] || 0) : 0,
    atom14: Number(S.atomsData && S.atomsData[14]) || 0,
    sailing39: Number(S.sailingData && S.sailingData[3] && S.sailingData[3][39]) || 0,
    hasBundleV: !!(S.bundlesData && S.bundlesData.bon_v),
    gamingSuperBit67: superBitType(67, S.gamingData && S.gamingData[12]),
    buttonBonus2: computeButtonBonus(2, S),
  };
}

export default createDescriptor({
  id: 'sushi-bucks',
  name: 'Sushi Bucks/hr',
  scope: 'account',
  category: 'currency',

  combine: function(pools, ctx) {
    var saveData = ctx.saveData;
    if (!saveData || !saveData.sushiData) return { val: 0, children: null };

    var sd = saveData.sushiData;
    var ul = sd[2] || [];
    var us = saveData.cachedUniqueSushi || 0;
    var kt = knowledgeBonusTotals(sd);
    var ext = _gatherExternal(saveData);

    var bucks = totalBucksPerHr(sd, ul, us, kt, ext);
    var multi = computeCurrencyMulti(ul, sd, us, kt, ext);

    // Build children
    var children = [];

    // Currency multi breakdown
    var surchargeSum = upgradeQTY(30, ul) + upgradeQTY(31, ul) + upgradeQTY(32, ul) + upgradeQTY(33, ul) + upgradeQTY(34, ul) + 100 * (ext.gamingSuperBit67 || 0);
    var overtunedMulti = computeOvertunedMulti(sd);
    var multiCh = [
      { name: label('Arcade', 67), val: ext.arcade67, fmt: 'raw' },
      { name: '1.1^' + us + ' unique sushi', val: Math.pow(1.1, us), fmt: 'x' },
      { name: 'Bundle: Sushi V', val: ext.hasBundleV ? 2 : 1, fmt: 'x' },
      { name: 'Surcharge Total', val: surchargeSum, fmt: 'raw' },
      { name: 'Knowledge: Sushi Bucks', val: kt[0] || 0, fmt: 'raw' },
      { name: 'Button Bonus: Sushi', val: ext.buttonBonus2, fmt: 'raw' },
      { name: label('Grid', 189), val: ext.gridBonus189, fmt: 'raw' },
      { name: label('Sushi', 40), val: upgradeQTY(40, ul), fmt: 'raw' },
      { name: label('Minehead Floor', 11), val: ext.mineheadBonus11, fmt: 'raw', note: 'min(1.25x)' },
      { name: label('Sushi', 41) + '+' + label('Sushi', 43), val: upgradeQTY(41, ul) + upgradeQTY(43, ul), fmt: 'raw' },
      { name: 'Overtuned', val: overtunedMulti, fmt: 'raw' },
      { name: label('Atom', 14), val: ext.atom14, fmt: 'raw' },
      { name: label('Artifact', 39), val: 100 * (ext.sailing39 || 0), fmt: 'raw' },
    ];
    children.push({ name: 'Currency Multi', val: multi, children: multiCh, fmt: 'x' });

    // Slot summary
    var activeSlots = countActiveSlots(sd);
    var totalSlots = slotsOwned(ul);
    children.push({ name: 'Active Slots', val: activeSlots, fmt: 'raw', note: 'of ' + totalSlots + ' owned' });

    // Top slots
    var slotVals = [];
    for (var s = 0; s < MAX_SLOTS; s++) {
      var sv = currencyPerSlot(s, sd, multi, kt);
      if (sv > 0) slotVals.push({ slot: s, val: sv, tier: Number(sd[0] && sd[0][s]) || 0 });
    }
    slotVals.sort(function(a, b) { return b.val - a.val; });
    var topCh = [];
    for (var i = 0; i < Math.min(5, slotVals.length); i++) {
      var sv = slotVals[i];
      topCh.push({ name: 'Slot ' + sv.slot + ' (T' + sv.tier + ')', val: sv.val, fmt: 'raw' });
    }
    if (topCh.length) children.push({ name: 'Top Slots', val: 0, children: topCh, fmt: 'raw' });

    // Fuel info
    var fpBase = fireplaceEffectBase(kt, Number(sd[4] && sd[4][2]) || 0);
    var orangeFire = computeOrangeFireSum(sd, fpBase);
    var fuelGen = fuelGenPerHr(ul, sd, kt, orangeFire, ext.hasBundleV);
    var fuelCap = fuelCapacity(ul, kt, ext.hasBundleV);
    children.push({ name: 'Fuel Gen/hr', val: fuelGen, fmt: 'raw' });
    children.push({ name: 'Fuel Cap', val: fuelCap, fmt: 'raw' });

    return { val: bucks, children: children };
  },
});
