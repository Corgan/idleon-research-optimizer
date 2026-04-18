// ===== PRISTINE CHARMS (W5) =====
// Pristine charm bonus checks — returns bonus value if the charm is unlocked.

import { pristineCharmBonus } from '../../data/common/sigils.js';

export function pristineBon(idx, saveData) {
  if ((saveData.ninjaData[107] || [])[idx] !== 1) return 0;
  return pristineCharmBonus(idx);
}
