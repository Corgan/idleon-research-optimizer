// ===== ALCHEMY DATA =====
import { AlchemyDescription } from '../game/customlists.js';

export function bubbleParams(cauldron, idx) {
  var b = AlchemyDescription[cauldron]?.[idx];
  return b ? { cauldron: cauldron, index: idx, x1: Number(b[1]), x2: Number(b[2]), formula: b[3], name: b[0] } : null;
}
