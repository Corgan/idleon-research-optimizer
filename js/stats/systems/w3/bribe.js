// ===== BRIBE SYSTEM (W3) =====
// Bribe bonus checks — returns bonus value if the bribe is active.

import { bribeValue } from '../../data/common/bribes.js';
import { treeResult } from '../../node.js';

export function getBribeBonus(idx, saveData) {
  var i = typeof idx === 'string' ? parseInt(idx) : Math.round(idx);
  if (!saveData.bribeStatusData || (saveData.bribeStatusData[i] || 0) !== 1) return treeResult(0);
  var val = bribeValue(i);
  return treeResult(val, [
    { name: 'Bribe ' + i + ' Active', val: 1, fmt: 'raw' },
    { name: 'Bribe Value', val: val, fmt: 'raw' },
  ]);
}
