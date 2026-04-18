// ===== BRIBE SYSTEM (W3) =====
// Bribe bonus checks — returns bonus value if the bribe is active.

import { bribeValue } from '../../data/common/bribes.js';

export function getBribeBonus(idx, saveData) {
  var i = typeof idx === 'string' ? parseInt(idx) : Math.round(idx);
  if ((saveData.bribeStatusData[i] || 0) !== 1) return 0;
  return bribeValue(i);
}
