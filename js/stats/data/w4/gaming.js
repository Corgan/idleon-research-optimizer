// ===== GAMING PALETTE DATA =====
import { GamingPalette } from '../game/customlists.js';

export function paletteParams(idx) {
  var p = GamingPalette[idx];
  return p ? { base: Number(p[4]), denom: 25, type: 'decay' } : null;
}
