// ===== GAMING PALETTE DATA =====
import { GamingPalette } from '../game/customlists.js';

export function paletteParams(idx) {
  var p = GamingPalette[idx];
  if (!p) return null;
  // p[4] = coefficient, p[5] = type (1=decay, 0=linear), decay denom=25
  return { coeff: Number(p[4]), denom: 25, isDecay: Number(p[5]) === 1 };
}
