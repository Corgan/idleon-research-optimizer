// ===== SIGIL & CHARM DATA =====
import { SigilDesc } from '../game/customlists.js';
import { NjEQ } from '../game/custommaps.js';

// SigilDesc tier bonuses at fields [3], [4], [8], [10], [12]
export function sigilTiers(idx) {
  var s = SigilDesc[idx];
  return s ? [Number(s[3]), Number(s[4]), Number(s[8]), Number(s[10]), Number(s[12])] : null;
}

// NjEQ.NjTrP{idx}[3]: Pristine Charm bonus for any index
export function pristineCharmBonus(idx) {
  var key = 'NjTrP' + idx;
  return NjEQ[key] ? Number(NjEQ[key][3]) || 0 : 0;
}
