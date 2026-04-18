// ===== MERITOC SYSTEM (W7) =====
// Voting/meritoc bonuses.

import { node } from '../../node.js';
import { label } from '../../entity-names.js';
import { MERITOC_BASE } from '../../data/w7/meritoc.js';
import { eventShopOwned } from '../../../game-helpers.js';
import { arcadeBonus } from '../w2/arcade.js';
import { legendPTSbonus } from './spelunking.js';
import { companionBonus } from '../../data/common/companions.js';
import { rogBonusQTY } from './sushi.js';

function _meritocParts(optionIdx, saveData) {
  var activeVote = Number(saveData.olaData[453]) || 0;
  if (optionIdx !== activeVote) return { val: 0, inactive: true };
  var baseVal = MERITOC_BASE[optionIdx] || 0;
  if (baseVal <= 0) return { val: 0, noBase: true };
  var canVote = Number(saveData.olaData[472]) === 1;
  var clamWork3 = (Number(saveData.olaData[464]) || 0) > 3 ? 1 : 0;
  var comp39 = saveData.companionIds.has(39) ? companionBonus(39) : 0;
  var legend24 = legendPTSbonus(24, saveData);
  var arcade59 = arcadeBonus(59, saveData);
  var eventShop23 = eventShopOwned(23, saveData.cachedEventShopStr);
  var rog51 = rogBonusQTY(51, saveData.cachedUniqueSushi);
  var comp161 = saveData.companionIds.has(161) ? companionBonus(161) : 0;
  var addSum = 5 * clamWork3 + comp39 + legend24 + arcade59 + 20 * eventShop23 + rog51;
  var multi = (canVote ? 1 : 0.25) + addSum / 100;
  var val = baseVal * (1 + comp161 / 100) * multi;
  return {
    val: val, baseVal: baseVal, canVote: canVote, multi: multi,
    clamWork3: clamWork3, comp39: comp39, legend24: legend24, arcade59: arcade59,
    eventShop23: eventShop23, rog51: rog51, comp161: comp161,
  };
}

export function computeMeritocBonusz(optionIdx, saveData) {
  return _meritocParts(optionIdx, saveData).val;
}

export var meritoc = {
  resolve: function(id, ctx) {
    var saveData = ctx.saveData;
    var p = _meritocParts(id, saveData);
    if (p.inactive) return node(label('Meritoc', id), 0, [node('Not active vote', 0)], { note: 'meritoc ' + id });
    if (p.noBase) return node(label('Meritoc', id), 0, null, { note: 'meritoc ' + id });
    var multiCh = [];
    if (p.clamWork3) multiCh.push(node(label('ClamWork', 3), 5 * p.clamWork3, null, { fmt: 'raw' }));
    if (p.comp39 > 0) multiCh.push(node(label('Companion', 39), p.comp39, null, { fmt: 'raw', note: 'companion 39' }));
    if (p.legend24 > 0) multiCh.push(node(label('Legend', 24), p.legend24, null, { fmt: 'raw', note: 'legend 24' }));
    if (p.arcade59 > 0) multiCh.push(node(label('Arcade', 59), p.arcade59, null, { fmt: 'raw' }));
    if (p.eventShop23 > 0) multiCh.push(node(label('Event', 23), 20 * p.eventShop23, null, { fmt: 'raw' }));
    if (p.rog51 > 0) multiCh.push(node(label('RoG', 51), p.rog51, null, { fmt: 'raw' }));
    var ch = [
      node('Base', p.baseVal, null, { fmt: 'raw' }),
      node(p.canVote ? 'Can Vote' : 'Cannot Vote', p.multi, multiCh, { fmt: 'x' }),
    ];
    if (p.comp161 > 0) ch.push(node(label('Companion', 161, ' \u00d7'), 1 + p.comp161 / 100, null, { fmt: 'x' }));
    return node(label('Meritoc', id), p.val, ch, { fmt: '+', note: 'meritoc ' + id });
  },
};
