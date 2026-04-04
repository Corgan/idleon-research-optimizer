// ===== ARCADE DATA =====
import { ArcadeShopInfo } from '../game/customlists.js';

// ArcadeShopInfo[idx]: [desc, base, denom, formula, ...]
export function arcadeShopParams(idx) {
  var s = ArcadeShopInfo[idx];
  return s ? [s[3], Number(s[1]), Number(s[2])] : null;
}
