// ===== MAX MP DESCRIPTOR =====
// _customBlock_PlayerMPmax: LIST[0] × LIST[1]

import { computeTotalStat, computeCardBonusByType, computeBoxReward } from '../systems/common/stats.js';
import { computeStampBonusOfTypeX } from '../systems/w1/stamp.js';
import { talent } from '../systems/common/talent.js';
import { bubbleValByKey } from '../systems/w2/alchemy.js';
import { entityName, label } from '../entity-names.js';
import { safe, rval, safeTree, createDescriptor } from './helpers.js';

export default createDescriptor({
  id: 'max-mp',
  name: 'Max MP',
  scope: 'character',
  category: 'stat',

  combine: function(pools, ctx) {
    var s = ctx.saveData;
    var ci = ctx.charIdx || 0;

    var wisResult = computeTotalStat('WIS', ci, ctx);
    var totalWIS = wisResult.computed;

    // LIST[0] — Base MP
    var _cardBonus3T = safeTree(computeCardBonusByType, 3, ci, s);
    var cardBonus3 = _cardBonus3T.val;
    var _bubbleBaseMPT = safeTree(bubbleValByKey, 'BaseMP', ci, s);
    var bubbleBaseMP = _bubbleBaseMPT.val;
    var _stampBaseMPT = safeTree(computeStampBonusOfTypeX, 'BaseMP', s);
    var stampBaseMP = _stampBaseMPT.val;
    var talent1 = rval(talent, 1, ctx);
    var _brMP = safe(computeBoxReward, ci, 'baseMP');
    var boxBaseMP = (typeof _brMP === 'object') ? (_brMP.val || 0) : Number(_brMP) || 0;

    var list0 = 10 + cardBonus3 + bubbleBaseMP + stampBaseMP + talent1 + totalWIS + boxBaseMP;

    // LIST[1] — Pct multiplier
    var talent452 = rval(talent, 452, ctx);
    var talent272 = rval(talent, 272, ctx);
    var _brPctMP = safe(computeBoxReward, ci, 'pctMP');
    var boxPctMP = (typeof _brPctMP === 'object') ? (_brPctMP.val || 0) : Number(_brPctMP) || 0;
    var _cardBonus29T = safeTree(computeCardBonusByType, 29, ci, s);
    var cardBonus29 = _cardBonus29T.val;

    var list1 = (1 + (talent452 + talent272) / 100)
      * (1 + (boxPctMP + cardBonus29) / 100);

    var val = list0 * list1;

    var children = [
      { name: 'Base MP Sources', val: list0, fmt: 'raw', children: [
        { name: 'Constant', val: 10, fmt: 'raw' },
        { name: 'Total WIS', val: totalWIS, fmt: 'raw' },
        { name: 'Cards: Base MP', val: cardBonus3, fmt: 'raw', children: _cardBonus3T.children },
        { name: 'Alchemy Bubble: Base MP', val: bubbleBaseMP, fmt: 'raw', children: _bubbleBaseMPT.children },
        { name: 'Stamps: Base MP', val: stampBaseMP, fmt: 'raw', children: _stampBaseMPT.children },
        { name: label('Talent', 1), val: talent1, fmt: 'raw' },
        { name: 'Box Rewards', val: boxBaseMP, fmt: 'raw' },
      ]},
      { name: 'MP Multipliers', val: list1, fmt: 'x', children: [
        { name: label('Talent', 452) + ' + ' + entityName('Talent', 272), val: talent452 + talent272, fmt: 'raw' },
        { name: 'Box Rewards: Total MP', val: boxPctMP, fmt: 'raw' },
        { name: 'Cards: Total MP', val: cardBonus29, fmt: 'raw', children: _cardBonus29T.children },
      ]},
    ];

    return { val: val, children: children };
  },
});
