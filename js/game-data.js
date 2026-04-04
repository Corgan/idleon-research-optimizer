// ===== GAME DATA - pure re-export shim =====
// All data now lives in stats/data/. This file re-exports for backward compat.

export {
  GRID_COLS, GRID_ROWS, GRID_SIZE,
  RES_GRID_RAW, GRID_INDICES,
  SHAPE_NAMES, SHAPE_BONUS_PCT, SHAPE_COLORS, SHAPE_VERTICES, SHAPE_DIMS,
  NODE_GOAL, NODE_GOAL_COLORS,
  OCC_DATA,
  gridCoord, obsName,
} from './stats/data/w7/research.js';

export { N2L } from './stats/data/common/encoding.js';
export { arenaThreshold } from './stats/data/w2/arena.js';
export { mapKillReq, isFightingMap } from './stats/data/common/maps.js';
