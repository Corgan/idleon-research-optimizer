// ===== OWL SYSTEM (W1) =====
// Summoning owl bonuses with legend/companion/megafeather multipliers.

import { node } from '../../node.js';
import { label } from '../../entity-names.js';
import { optionsListData } from '../../../save/data.js';
import { legendPTSbonus } from '../w7/spelunking.js';
import { companionBonus } from '../../data/common/companions.js';
import { OWL_BASE } from '../../data/game-constants.js';

export var owl = {
  resolve: function(id, ctx) {
    // id = owl bonus index (4 = DR, 5 = LUK)
    var base = OWL_BASE[id] || 1;
    var ola255 = Number((optionsListData && optionsListData[255]) || 0);
    var rawCount = Math.max(0, Math.ceil((ola255 - id) / 6));
    if (rawCount <= 0) return node('Summoning Owl', 0, null, { note: 'owl ' + id });

    var legend26 = legendPTSbonus(26, ctx.saveData);
    var legendMulti = 1 + legend26 / 100;
    // CompanionDB[51] = w6c2b "3x bonuses from Orion, Poppy, and Bubba"
    var comp51 = ctx.saveData.companionIds && ctx.saveData.companionIds.has(51) ? companionBonus(51) : 0;

    var ola262 = Number((optionsListData && optionsListData[262]) || 0);
    function owlMF(t) { return ola262 > t ? (t === 9 ? ola262 - 9 : 1) : 0; }
    var mf1 = 100 * owlMF(1), mf3 = 100 * owlMF(3), mf5 = 100 * owlMF(5);
    var mf7 = 100 * owlMF(7), mf9a = 100 * Math.min(1, owlMF(9)), mf9b = 50 * Math.max(0, owlMF(9) - 1);
    var owlAll = mf1 + mf3 + mf5 + mf7 + mf9a + mf9b;
    var mfChildren = [];
    if (mf1 > 0) mfChildren.push(node('Feather 1', mf1, null, { fmt: 'raw' }));
    if (mf3 > 0) mfChildren.push(node('Feather 3', mf3, null, { fmt: 'raw' }));
    if (mf5 > 0) mfChildren.push(node('Feather 5', mf5, null, { fmt: 'raw' }));
    if (mf7 > 0) mfChildren.push(node('Feather 7', mf7, null, { fmt: 'raw' }));
    if (mf9a > 0) mfChildren.push(node('Feather 9', mf9a, null, { fmt: 'raw' }));
    if (mf9b > 0) mfChildren.push(node('Feather 9+ (×50 ea)', mf9b, null, { fmt: 'raw' }));

    var val = base * legendMulti * (1 + comp51) * (1 + owlAll / 100) * rawCount;
    return node('Summoning Owl', val, [
      node('Base Per Owl', base, null, { fmt: 'raw', note: 'OWL_BASE[' + id + ']' }),
      node('Owl Count', rawCount, null, { fmt: 'raw', note: 'OLA[255]=' + ola255 }),
      node(label('Legend', 26), legendMulti, null, { fmt: 'x', note: 'legend 26' }),
      node(label('Companion', 51), 1 + comp51, null, { fmt: 'x', note: 'companion 51' }),
      node('Megafeather Bonus', 1 + owlAll / 100, mfChildren.length ? mfChildren : null, { fmt: 'x', note: 'OLA[262]=' + ola262 }),
    ], { fmt: '+', note: 'owl ' + id });
  },
};

// ==================== OWL BONUS (aggregated) ====================

export function computeOwlBonus(idx, saveData) {
  var owlLv = Number(saveData.owlData && saveData.owlData[idx]) || 0;
  if (owlLv <= 0) return 0;
  var base = Number(OWL_BASE[idx]) || 1;
  return base * owlLv;
}
