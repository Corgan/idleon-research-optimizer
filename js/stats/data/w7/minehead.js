// ===== MINEHEAD (DEPTH CHARGE) DATA =====
import { MineheadUPG as _RAW_UPG, Research } from '../game/customlists.js';

// Research[20]: minehead bonus quantities
export var MINEHEAD_BONUS_QTY = Research[20].map(Number);

// MineheadUPG[i] = { name, maxLv, costExp, bonus, desc }
// Fields: [0]=name, [1]=maxLv, [2]=costExp, [3]=bonus, [4]=unused, [5]=desc
export var MINEHEAD_UPG = _RAW_UPG.map(u => ({
  name: u[0],
  maxLv: Number(u[1]),
  costExp: Number(u[2]),
  bonus: Number(u[3]),
  desc: u[5].replace(/_/g, ' ').split('@')[0].trim(),
}));

// Grid dimensions per Grid_Expansion level (Research[9])
export var GRID_DIMS = Research[9].slice();

// Tile multipliers for "multiplier" tiles (game formula constants)
export var TILE_MULTIPLIERS = [1.2, 1.4, 1.6, 2.0, 3, 4, 5, 6, 7, 8, 1, 1, 1, 1];

// Minehead floor-reward unlock order (Research[10])
export var MINEHEAD_UNLOCK_ORDER = Research[10].map(Number);

// Minehead boss names per floor, mapped via Research[10] -> Research[11]
var _bossOrder = Research[10];
var _bossNames = Research[11];
export var MINEHEAD_NAMES = _bossOrder.map(function(idx) { return _bossNames[Number(idx)] || 'Boss'; });

// Floor reward descriptions (Research[19])
export var FLOOR_REWARD_DESC = Research[19].map(s =>
  s.replace(/_/g, ' ').split('@')[0].trim()
);

// Server variable defaults
export var SERVER_VAR_DEFAULTS = {
  A_MineCost: 1.01,
  A_MineHP:   1.01,
};
