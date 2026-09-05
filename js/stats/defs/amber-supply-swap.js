// ===== AMBERY SUPPLY SWAP DESCRIPTOR =====
// Isolated Supply Swap effect on expected primary Amber yield.

import {
  amberSupplySwapDropDivisor,
  amberSupplySwapGainMultiplier,
  amberSupplySwapSecondaryDropDivisor,
  shopUpgBonus,
} from '../systems/w7/spelunking.js';
import { createDescriptor } from './helpers.js';

function finiteLevel(saveData) {
  var value = Number(saveData && saveData.spelunkData && saveData.spelunkData[5]
    && saveData.spelunkData[5][67]);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export default createDescriptor({
  id: 'amber-supply-swap',
  name: 'Ambery Supply Swap: Expected Primary Amber Yield',
  scope: 'account',
  category: 'stat',

  combine: function(pools, ctx) {
    var saveData = ctx.saveData || {};
    var level = finiteLevel(saveData);
    var supplySwapBonus = Number(shopUpgBonus(67, saveData));
    if (!Number.isFinite(supplySwapBonus) || supplySwapBonus < 0) supplySwapBonus = 0;

    var quantityMultiplier = amberSupplySwapGainMultiplier(supplySwapBonus);
    var primaryDivisor = amberSupplySwapDropDivisor(supplySwapBonus);
    var primaryFrequency = 1 / primaryDivisor;
    var secondaryDivisor = amberSupplySwapSecondaryDropDivisor(supplySwapBonus);
    var secondaryFrequency = 1 / secondaryDivisor;
    var expectedYield = quantityMultiplier * primaryFrequency;

    return {
      val: expectedYield,
      children: [
        { name: 'Supply Swap Upgrade Provenance', val: supplySwapBonus, fmt: 'raw',
          note: 'Shop Upgrade 67 bonus; saved level ' + level, children: [
          { name: 'Shop Upgrade 67 Level', val: level, fmt: 'raw' },
          { name: 'Shop Upgrade 67 Bonus', val: supplySwapBonus, fmt: 'raw' },
        ] },
        { name: 'Supply Swap-only Expected Primary Amber Yield', val: expectedYield, fmt: 'x',
          note: 'Quantity multiplier * primary drop frequency; excludes absolute Amber/hour and the 0.8 cap/base formula', children: [
          { name: 'Amber Quantity Multiplier', val: quantityMultiplier, fmt: 'x',
            note: '1 + 14L' },
          { name: 'Primary Amber Drop Frequency Multiplier', val: primaryFrequency, fmt: 'x',
            note: 'inverse of the raw primary drop divisor; 1 / (1 + 9L)' },
        ] },
        { name: 'Primary Amber Drop Divisor (raw, informational)', val: primaryDivisor, fmt: 'raw',
          note: 'Informational raw divisor; its inverse is used above' },
        { name: 'Secondary Amber Drop Effects (informational)', val: secondaryDivisor, fmt: 'raw',
          note: 'Not multiplied into primary expected yield', children: [
          { name: 'Secondary Amber Drop Divisor (raw)', val: secondaryDivisor, fmt: 'raw',
            note: '1 + 19L' },
          { name: 'Secondary Amber Drop Frequency Multiplier', val: secondaryFrequency, fmt: 'x',
            note: 'inverse of secondary divisor; informational only' },
        ] },
      ],
    };
  },
});