// ===== STAR SIGN DATA =====
import { StarSigns } from '../game/customlists.js';

export function starSignDropVal(idx) {
  var m = StarSigns[idx]?.[1]?.match(/\+(\d+)/);
  return m ? Number(m[1]) : 0;
}
