// ===== EQUINOX SYSTEM (W3) =====
// Equinox dream upgrade bonuses.

import { node } from '../../node.js';
import { label } from '../../entity-names.js';
import { dreamData } from '../../../save/data.js';
import { DR_DREAM_COEFF } from '../../data/game-constants.js';
import { cloudBonus as _cb } from '../../../game-helpers.js';
export var dream = {
  resolve: function(id, ctx) {
    var name = label('Dream', id);
    var lv = Number((dreamData && dreamData[id]) || 0);
    var val = DR_DREAM_COEFF * lv;
    return node(name, val, [
      node('Dream Upgrade Level', lv, null, { fmt: 'raw' }),
      node('Per Level', DR_DREAM_COEFF, null, { fmt: 'raw' }),
    ], { fmt: '+', note: 'dream ' + id });
  },
};

// ==================== SHIMMER BONUSES ====================

// CloudBonus(n): 1 if dream challenge n completed, 0 otherwise.
// Game: (1 + args[0] * CloudBonus(id) / 100)
export var cloudBonusSys = {
  resolve: function(id, ctx, args) {
    var coeff = (args && args[0]) || 5;
    var completed = _cb(id, ctx.saveData.weeklyBossData);
    var val = coeff * completed;
    return node('Dream Challenge ' + id, val, [
      node('Completed', completed, null, { fmt: 'raw' }),
      node('Coefficient', coeff, null, { fmt: 'raw' }),
    ], { fmt: '+', note: 'cloudBonus ' + id });
  },
};

// ==================== SHIMMER BONUSES ====================

export function computeAllShimmerBonuses(saveData) {
  var artTier31 = Number(saveData.sailingData && saveData.sailingData[3] && saveData.sailingData[3][31]) || 0;
  var shimmerMulti = artTier31 > 0 ? Math.max(1, Math.min(4, 1 + artTier31)) : 1;
  return shimmerMulti;
}
