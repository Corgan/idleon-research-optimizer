import { RegAchieves } from '../game/customlists.js';

// ===== ACHIEVEMENT DATA =====
// Tier is encoded in reward text as "{N%" or "-N%"; default 1
export function achieveTier(idx) {
  var desc = RegAchieves[idx]?.[3] || '';
  var m = desc.match(/[{\-](\d+)%/);
  return m ? Number(m[1]) : 1;
}
