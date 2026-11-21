// ===== GLIMBO TRADE DATA (W7) =====
import { Research } from '../game/customlists.js';

export function glimboTrades() {
  return Research[27].map((material, index) => ({
    index, material, upgrade: Number(Research[26][index]),
    scale: Number(Research[28][index]),
  }));
}
