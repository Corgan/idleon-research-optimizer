// ===== TESSERACT / ARCANE SYSTEM (MC) =====
// Arcane map kill-count bonus and arcane upgrade bonuses.

import { node } from '../../node.js';
import { saveData } from '../../../state.js';
import { arcanePerLevel } from '../../data/common/arcane.js';
import { ARCANE_NO_MULTI } from '../../data/game-constants.js';

var arcaneNoMultiSet = ARCANE_NO_MULTI;

export function arcaneUpgBonus(idx) {
  var lv = saveData.arcaneData[idx] || 0;
  if (lv <= 0) return 0;
  var perLv = arcanePerLevel(idx) || 1;
  if (arcaneNoMultiSet.has(idx)) return lv * perLv;
  return lv * perLv * (1 + arcaneUpgBonus(39) / 100);
}

function arcaneMapBonus(kills) {
  if (kills < 1) return 0;
  var lg = Math.log10(kills), lg2 = Math.log2(kills);
  return (2 * Math.max(0, lg - 3.5) + Math.max(0, lg2 - 12)) * (lg / 2.5)
    + Math.min(2, kills / 1000) + Math.max(5 * (lg - 5), 0);
}

export var arcaneMap = {
  resolve: function(id, ctx) {
    // Arcane map bonus requires MapBon data + current map selection
    if (!ctx.mapBon || ctx.mapIdx == null) {
      return node('Arcane Map Bonus', 0, [
        node('Session-only (no map data)', 0, null, { fmt: 'raw' }),
      ], { note: 'arcane map' });
    }
    var kills = (ctx.mapBon[ctx.mapIdx] && ctx.mapBon[ctx.mapIdx][0]) || 0;
    var val = arcaneMapBonus(kills);
    return node('Arcane Map Bonus', val, [
      node('Map Kills', kills, null, { fmt: 'raw' }),
      node('Bonus Percent', val, null, { fmt: '+' }),
    ], { fmt: '+', note: 'arcane map' });
  },
};
