// ===== SHARED DESCRIPTOR HELPERS =====

import { gbWith } from '../../sim-math.js';

export function gridBonusFinal(S, idx) {
  return gbWith(S.gridLevels, S.shapeOverlay, idx, { abm: S.allBonusMulti });
}
