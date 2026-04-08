// ===== EQUINOX SYSTEM (W3) =====
// Equinox dream upgrade bonuses.

import { node } from '../../node.js';
import { label } from '../../entity-names.js';
import { dreamData } from '../../../save/data.js';
import { DR_DREAM_COEFF } from '../../data/game-constants.js';

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

import { saveData as _eqSaveData } from '../../../state.js';

export function computeAllShimmerBonuses() {
  var artTier31 = Number(_eqSaveData.sailingData && _eqSaveData.sailingData[3] && _eqSaveData.sailingData[3][31]) || 0;
  var shimmerMulti = artTier31 > 0 ? Math.max(1, Math.min(4, 1 + artTier31)) : 1;
  return shimmerMulti;
}
