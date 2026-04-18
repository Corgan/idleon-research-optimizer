// ===== FLAGGY SPEED STAT DEFINITION =====
// ExtraFlaggyRatemulti — account-wide flaggy rate multiplier from cog board + grid + cards.
// Scope: account.

import {
  computeExtraFlaggyRatemulti,
  computeSmallCogBonusTOTAL,
  computeCogBoardTotals,
} from '../systems/w3/construction.js';
import { computeCardLv } from '../systems/common/cards.js';
import { safe, createDescriptor, gridBonusFinal } from './helpers.js';

export default createDescriptor({
  id: 'flaggy-speed',
  name: 'Flaggy Rate Multiplier',
  scope: 'account',
  category: 'construction',

  combine: function(pools, ctx) {
    var saveData = ctx.saveData;
    if (!saveData) return { val: 0, children: null };

    var smallCogFlaggy = computeSmallCogBonusTOTAL(0, ctx.saveData);
    var grid89 = gridBonusFinal(saveData, 89);
    var cardW7b3 = safe(computeCardLv, 'w7b3');

    var total = computeExtraFlaggyRatemulti(ctx.saveData);
    var cogTotals = computeCogBoardTotals(ctx.saveData);

    return {
      val: total,
      children: [
        { name: 'Small Cog Flaggy', val: 1 + smallCogFlaggy / 100, fmt: 'x', note: 'total=' + smallCogFlaggy },
        { name: 'Grid 89', val: 1 + grid89 / 100, fmt: 'x', note: 'raw=' + grid89.toFixed(1) },
        { name: 'Card w7b3', val: 1 + 10 * cardW7b3 / 100, fmt: 'x', note: 'lv=' + cardW7b3 + ' → 10×' + cardW7b3 + '%' },
        { name: 'Cog Board Flat Flaggy/HR', val: cogTotals.flatFlaggy, note: 'from big cogs' },
        { name: 'Cog Board % Flaggy Rate', val: cogTotals.pctFlaggyRate, note: 'from big cogs' },
      ],
      _debug: {
        smallCogFlaggy: smallCogFlaggy,
        grid89: grid89,
        cardW7b3: cardW7b3,
        extraFlaggyMulti: total,
        cogBoardFlatFlaggy: cogTotals.flatFlaggy,
        cogBoardPctFlaggy: cogTotals.pctFlaggyRate,
      },
    };
  },
});
