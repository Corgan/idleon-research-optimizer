// ===== GRID HELPERS - pure coordinate / name utilities =====
// Shared by app.js (web) and cli-sim.js (Node.js CLI).

import { GRID_COLS, GRID_ROWS, OCC_DATA } from './game-data.js';

export function gridCoord(idx) {
  const col = idx % GRID_COLS;
  const row = Math.floor(idx / GRID_COLS);
  return String.fromCharCode(65 + col) + (GRID_ROWS - row);
}

export function obsName(i) {
  return OCC_DATA[i] ? OCC_DATA[i].name.replace(/_/g, ' ') : `#${i}`;
}
