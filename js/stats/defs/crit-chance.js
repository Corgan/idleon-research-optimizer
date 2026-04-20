// ===== CRIT CHANCE DESCRIPTOR =====
// _customBlock_CritChance formula.

import { computeTotalStat } from '../systems/common/stats.js';
import { computeStatueBonusGiven, computeCardBonusByType, computeBoxReward } from '../systems/common/stats.js';
import { computeStarSignBonus } from '../systems/common/starSign.js';
import { talent } from '../systems/common/talent.js';
import { etcBonus } from '../systems/common/etcBonus.js';
import { cardSet } from '../systems/common/cards.js';
import { computeCardLv } from '../systems/common/cards.js';
import { computeMealBonus } from '../systems/common/stats.js';
import { computePrayerReal } from '../systems/w3/prayer.js';
import { bubbleValByKey } from '../systems/w2/alchemy.js';
import { achieveStatus } from '../systems/common/achievement.js';
import { currentMapData } from '../../save/data.js';
import { MapAFKtarget } from '../data/game/customlists.js';
import { MONSTERS } from '../data/game/monsters.js';
import { getLOG } from '../../formulas.js';
import { safe, rval, safeTree, getBuffBonus, createDescriptor } from './helpers.js';

function lukCurve(v) {
  if (v < 1000) return (Math.pow(v + 1, 0.37) - 1) / 40;
  return (v - 1000) / (v + 2500) * 0.5 + 0.255;
}

export default createDescriptor({
  id: 'crit-chance',
  name: 'Crit Chance',
  scope: 'character',
  category: 'stat',

  combine: function(pools, ctx) {
    var s = ctx.saveData;
    var ci = ctx.charIdx || 0;

    var agiResult = computeTotalStat('AGI', ci, ctx);
    var totalAGI = agiResult.computed;
    var agiBonus = lukCurve(totalAGI);
    var agiBubblePart = agiBonus / 2.3 * 100;

    var base = 5;
    var cardSetBonus9 = rval(cardSet, 9, ctx);
    var _cardBonus13T = safeTree(computeCardBonusByType, 13, ci, s);
    var cardBonus13 = _cardBonus13T.val;
    var w4c3lv = safe(computeCardLv, 'w4c3', s);
    var cardW4c3 = Math.min(1.5 * w4c3lv, 50);

    // TalentCalc(645): GetTalentNumber(1,645) * getLOG(accuracy - 1.5*monsterDefence)
    var talent645raw = rval(talent, 645, ctx); // decay(8, 70, lv)
    var talentCalc645 = 0;
    if (talent645raw > 0) {
      // Get accuracy from ctx.resolve
      var accTree = ctx.resolve && ctx.resolve('accuracy');
      var playerAcc = 0;
      if (accTree && accTree.val != null) playerAcc = accTree.val;
      else if (typeof accTree === 'number') playerAcc = accTree;
      // Get monster defence from current map
      var mapIdx = (currentMapData && currentMapData[ci]) || 0;
      var monKey = MapAFKtarget[mapIdx] || 'Nothing';
      var monDef = (MONSTERS[monKey] && Number(MONSTERS[monKey].Defence)) || 0;
      var accOverflow = Math.floor(playerAcc) - 1.5 * monDef;
      if (accOverflow > 0) {
        talentCalc645 = talent645raw * getLOG(accOverflow);
      }
    }
    var talent267 = rval(talent, 267, ctx);
    var talent447 = rval(talent, 447, ctx);
    var talent640 = rval(talent, 640, ctx);
    var etc23 = rval(etcBonus, '23', ctx);
    var prayer11 = computePrayerReal(11, 0, ci, s);
    var _mealCritT = safeTree(computeMealBonus, 'Crit', s);
    var mealCrit = _mealCritT.val;
    var _statue13T = safeTree(computeStatueBonusGiven, 13, ci, s);
    var statue13 = _statue13T.val;
    var _bubbleCritT = safeTree(bubbleValByKey, 'CritChance', ci, s);
    var bubbleCrit = _bubbleCritT.val;
    var achieve184 = 5 * safe(achieveStatus, 184, s);
    var _br = safe(computeBoxReward, ci, 'critchance');
    var boxCrit = (typeof _br === 'object') ? (_br.val || 0) : Number(_br) || 0;

    var _starSignCritT = safeTree(computeStarSignBonus, 'CritChance', ci, s);
    var starSignCrit = _starSignCritT.val;

    var val = base + cardSetBonus9
      + (cardBonus13 + cardW4c3 + talent640 + etc23
         + prayer11 + mealCrit + statue13 + starSignCrit)
      + (talent267 + talent447 + achieve184 + boxCrit + talentCalc645
         + agiBubblePart + bubbleCrit);

    var children = [
      { name: 'Base', val: base, fmt: 'raw' },
      { name: 'AGI Scaling', val: agiBubblePart, fmt: 'raw', note: 'AGI=' + Math.round(totalAGI) + ' curve/' + (2.3).toFixed(1) + '×100' },
    ];
    if (cardSetBonus9) children.push({ name: 'Card Set 9', val: cardSetBonus9, fmt: 'raw' });
    if (cardBonus13) children.push({ name: 'Card Bonus 13', val: cardBonus13, fmt: 'raw', children: _cardBonus13T.children });
    if (cardW4c3) children.push({ name: 'Card w4c3', val: cardW4c3, fmt: 'raw', note: 'min(1.5×' + w4c3lv + ', 50)' });
    if (talent267) children.push({ name: 'Talent 267', val: talent267, fmt: 'raw' });
    if (talent447) children.push({ name: 'Talent 447', val: talent447, fmt: 'raw' });
    if (talent640) children.push({ name: 'Talent 640', val: talent640, fmt: 'raw' });
    if (talentCalc645) children.push({ name: 'TalentCalc 645', val: talentCalc645, fmt: 'raw', note: 'AccOverflow: t645×log₁₀(acc-1.5×monDef)' });
    if (etc23) children.push({ name: 'EtcBonus 23', val: etc23, fmt: 'raw' });
    if (prayer11) children.push({ name: 'Prayer 11', val: prayer11, fmt: 'raw' });
    if (mealCrit) children.push({ name: 'Meal Crit', val: mealCrit, fmt: 'raw', children: _mealCritT.children });
    if (statue13) children.push({ name: 'Statue 13', val: statue13, fmt: 'raw', children: _statue13T.children });
    if (starSignCrit) children.push({ name: 'Star Signs', val: starSignCrit, fmt: 'raw', children: _starSignCritT.children });
    if (bubbleCrit) children.push({ name: 'Bubble CritChance', val: bubbleCrit, fmt: 'raw', children: _bubbleCritT.children });
    if (achieve184) children.push({ name: 'Achievement 184', val: achieve184, fmt: 'raw' });
    if (boxCrit) children.push({ name: 'Box Rewards', val: boxCrit, fmt: 'raw' });

    return { val: val, children: children };
  },
});
