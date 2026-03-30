// ===== MERITOC SYSTEM (W7) =====
// Voting/meritoc bonuses.

import { node } from '../../node.js';
import { S } from '../../../state.js';
import { MERITOC_BASE } from '../../../game-data.js';
import { eventShopOwned } from '../../../save/helpers.js';
import { arcadeBonus } from '../w2/arcade.js';
import { legendPTSbonus } from './spelunking.js';

export function computeMeritocBonusz(optionIdx) {
  var activeVote = Number(S.olaData[453]) || 0;
  if (optionIdx !== activeVote) return 0;
  var baseVal = MERITOC_BASE[optionIdx] || 0;
  if (baseVal <= 0) return 0;
  var canVote = Number(S.olaData[472]) === 1;
  var clamWork3 = (Number(S.olaData[464]) || 0) > 3 ? 1 : 0;
  var comp39 = S.companionIds.has(39) ? 50 : 0;
  var legend24 = legendPTSbonus(24);
  var arcade59 = arcadeBonus(59);
  var eventShop23 = eventShopOwned(23, S.cachedEventShopStr);
  var multi;
  if (canVote) {
    multi = 1 + (5 * clamWork3 + comp39 + legend24 + arcade59 + 20 * eventShop23) / 100;
  } else {
    multi = 0.25 + (5 * clamWork3 + comp39 + legend24 + arcade59) / 100;
  }
  return baseVal * multi;
}

export var meritoc = {
  resolve: function(id, ctx) {
    var activeVote = Number(S.olaData[453]) || 0;
    if (id !== activeVote) return node('Meritoc Vote ' + id, 0, [node('Not active vote', 0)], { note: 'meritoc ' + id });
    var baseVal = MERITOC_BASE[id] || 0;
    if (baseVal <= 0) return node('Meritoc Vote ' + id, 0, null, { note: 'meritoc ' + id });
    var canVote = Number(S.olaData[472]) === 1;
    var clamWork3 = (Number(S.olaData[464]) || 0) > 3 ? 1 : 0;
    var comp39 = S.companionIds.has(39) ? 50 : 0;
    var legend24 = legendPTSbonus(24);
    var arcade59 = arcadeBonus(59);
    var eventShop23 = eventShopOwned(23, S.cachedEventShopStr);
    var multi;
    if (canVote) {
      multi = 1 + (5 * clamWork3 + comp39 + legend24 + arcade59 + 20 * eventShop23) / 100;
    } else {
      multi = 0.25 + (5 * clamWork3 + comp39 + legend24 + arcade59) / 100;
    }
    var val = baseVal * multi;
    var multiCh = [];
    if (clamWork3) multiCh.push(node('ClamWork 3 Bonus', 5 * clamWork3, null, { fmt: 'raw' }));
    if (comp39 > 0) multiCh.push(node('Orbo Companion', comp39, null, { fmt: 'raw', note: 'companion 39' }));
    if (legend24 > 0) multiCh.push(node('Legend Talent 24', legend24, null, { fmt: 'raw', note: 'legend 24' }));
    if (arcade59 > 0) multiCh.push(node('Arcade Shop 59', arcade59, null, { fmt: 'raw', note: 'arcade 59' }));
    if (canVote && eventShop23 > 0) multiCh.push(node('Event Shop 23 Bonus', 20 * eventShop23, null, { fmt: 'raw' }));
    return node('Meritoc Vote ' + id, val, [
      node('Base', baseVal, null, { fmt: 'raw' }),
      node(canVote ? 'Can Vote' : 'Cannot Vote', multi, multiCh, { fmt: 'x' }),
    ], { fmt: '+', note: 'meritoc ' + id });
  },
};
