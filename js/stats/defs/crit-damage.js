// ===== CRIT DAMAGE DESCRIPTOR =====
// _customBlock_CritDamage formula. Returns multiplier (e.g. 266.75x).

import { computeTotalStat } from '../systems/common/stats.js';
import { computeStatueBonusGiven, computeCardBonusByType } from '../systems/common/stats.js';
import { computeStampBonusOfTypeX } from '../systems/w1/stamp.js';
import { talent } from '../systems/common/talent.js';
import { etcBonus } from '../systems/common/etcBonus.js';
import { computePrayerReal } from '../systems/w3/prayer.js';
import { bubbleValByKey } from '../systems/w2/alchemy.js';
import { safe, rval, safeTree, getBuffBonus, createDescriptor } from './helpers.js';

function lukCurve(v) {
  if (v < 1000) return (Math.pow(v + 1, 0.37) - 1) / 40;
  return (v - 1000) / (v + 2500) * 0.5 + 0.255;
}

export default createDescriptor({
  id: 'crit-damage',
  name: 'Crit Damage',
  scope: 'character',
  category: 'stat',

  combine: function(pools, ctx) {
    var s = ctx.saveData;
    var ci = ctx.charIdx || 0;

    var strResult = computeTotalStat('STR', ci, ctx);
    var totalSTR = strResult.computed;
    var strBonus = lukCurve(totalSTR);
    var strScaling = 100 * strBonus / 1.8;

    var base = 1.2;
    var talent87 = rval(talent, 87, ctx);
    var talent76 = rval(talent, 76, ctx);
    var talent447t2 = rval(talent, 447, ctx, { tab: 2 });
    var _statue5T = safeTree(computeStatueBonusGiven, 5, ci, s);
    var statue5 = _statue5T.val;
    var _stampCritDmgT = safeTree(computeStampBonusOfTypeX, 'CritDmg', s);
    var stampCritDmg = _stampCritDmgT.val;
    var _bubbleCritDMGT = safeTree(bubbleValByKey, 'critDMG', ci, s);
    var bubbleCritDMG = _bubbleCritDMGT.val;
    var _cardBonus19T = safeTree(computeCardBonusByType, 19, ci, s);
    var cardBonus19 = _cardBonus19T.val;
    var prayer11pen = computePrayerReal(11, 1, ci, s);
    var etc22 = rval(etcBonus, '22', ctx);
    var buff167 = getBuffBonus(167, 1, ci, ctx);

    var pctSum = talent87 + statue5 + talent447t2 + stampCritDmg
      + strScaling + bubbleCritDMG + cardBonus19 - prayer11pen
      + talent76 + etc22 + buff167;

    var val = base + pctSum / 100;

    var children = [
      { name: 'Base', val: base, fmt: 'raw' },
      { name: 'STR Scaling', val: strScaling, fmt: 'raw', note: 'STR=' + Math.round(totalSTR) + ' curve/1.8×100' },
    ];
    if (talent87) children.push({ name: 'Talent 87', val: talent87, fmt: 'raw' });
    if (talent76) children.push({ name: 'Talent 76', val: talent76, fmt: 'raw' });
    if (talent447t2) children.push({ name: 'Talent 447 (tab2)', val: talent447t2, fmt: 'raw' });
    if (statue5) children.push({ name: 'Statue 5', val: statue5, fmt: 'raw', children: _statue5T.children });
    if (bubbleCritDMG) children.push({ name: 'Bubble critDMG', val: bubbleCritDMG, fmt: 'raw', children: _bubbleCritDMGT.children });
    if (cardBonus19) children.push({ name: 'Card Bonus 19', val: cardBonus19, fmt: 'raw', children: _cardBonus19T.children });
    if (stampCritDmg) children.push({ name: 'Stamp CritDmg', val: stampCritDmg, fmt: 'raw', children: _stampCritDmgT.children });
    if (prayer11pen) children.push({ name: 'Prayer 11 (penalty)', val: -prayer11pen, fmt: 'raw' });
    if (etc22) children.push({ name: 'EtcBonus 22', val: etc22, fmt: 'raw' });
    if (buff167) children.push({ name: 'Buff 167 (CritDmg)', val: buff167, fmt: 'raw' });
    children.push({ name: 'Pct Sum / 100', val: pctSum / 100, fmt: 'raw' });

    return { val: val, children: children };
  },
});
