import { Research, ResGridSquares, Spelunky, Occurrences } from '../game/customlists.js';

// ===== RESEARCH DATA =====

// Research[25]: sticker base bonuses
export function stickerBase(idx) { return Number(Research[25]?.[idx]) || 0; }

// Spelunky[24]: dancing coral base values
export function dancingCoralBase(idx) { return Number(Spelunky[24]?.[idx]) || 0; }

// ===== RESEARCH GRID DATA =====

export var GRID_COLS = 20;
export var GRID_ROWS = 12;
export var GRID_SIZE = 240;

// ResGridSquares: [name, maxLV, bonusPerLV, description]
export var RES_GRID_RAW = {};
ResGridSquares.forEach(function(entry, idx) {
  if (entry[0] !== 'Name') RES_GRID_RAW[idx] = [entry[0], Number(entry[1]), Number(entry[2]), entry[5]];
});

export var GRID_INDICES = Object.keys(RES_GRID_RAW).map(Number).sort(function(a, b) { return a - b; });

// RES_GRID_RAW[id][2] = bonus per level for grid node id
export function gridBonusPerLv(id) { return RES_GRID_RAW[id] ? RES_GRID_RAW[id][2] : 0; }

// Shape data from Research
export var SHAPE_NAMES = Research[3].map(function(s) { return s.replace(/_/g, ' '); });
export var SHAPE_BONUS_PCT = Research[5].map(Number);
// Manual: CSS colors not in game data
export var SHAPE_COLORS = ["#9b59b6","#3498db","#2ecc71","#00bcd4","#f1c40f","#e67e22","#800000","#ecf0f1","#ff69b4","#555"];

// Manual: optimizer node categorization
export var NODE_GOAL = {
  31:'Res EXP', 47:'Stickers', 48:'Polymer', 49:'Polymer',
  50:'Res EXP', 51:'Res EXP', 52:'Kaleido',
  67:'Crowns', 68:'Crowns', 69:'Cogs', 70:'Res True\u00d7', 71:'AFK', 72:'Kaleido',
  86:'Equinox', 87:'Gaming', 88:'Stickers', 89:'Cogs', 90:'Res EXP', 91:'Insight', 92:'Insight', 93:'Obs\u00d7Insight', 94:'Res EXP',
  107:'Crowns', 108:'Rat King', 109:'Artifacts', 110:'Res EXP', 111:'AFK', 112:'Res EXP',
  125:'Res EXP', 126:'Res EXP',
  127:'Sigils', 128:'Sigils', 129:'Minehead', 130:'Class EXP', 131:'Class EXP', 132:'Class EXP',
  146:'Minehead', 147:'Minehead', 148:'Minehead', 149:'Glimbo', 166:'Minehead', 150:'Masterclass', 151:'Spelunking', 152:'Class EXP',
  167:'Minehead', 168:'DR Multi', 169:'Glimbo', 170:'All Quick', 171:'Day/Nite', 172:'Clothing', 173:'Drop Rate',
  105:'Sailing', 106:'Artifacts', 188:'Sushi', 189:'Sushi',
};
export var NODE_GOAL_COLORS = {
  'Res EXP':'var(--green)', 'Res True\u00d7':'#ff6b6b', 'Obs\u00d7Insight':'var(--gold)',
  'Insight':'var(--purple)', 'Kaleido':'var(--cyan)', 'Rolls':'#aaa', 'AFK':'#888',
  'Path':'#888',
};

// Shape vertices from Research[0], dimensions from Research[1]
export var SHAPE_VERTICES = Research[0].map(function(s) {
  return s.split(';').map(function(p) { return p.split(',').map(Number); });
});
export var SHAPE_DIMS = Research[1].map(function(s) { return s.split(',').map(Number); });

// Observations from Occurrences (filter placeholders)
export var OCC_DATA = Occurrences
  .filter(function(o) { return o[0] !== 'Name'; })
  .map(function(o) { return {name: o[0], roll: Number(o[1]), rollReq: Number(o[6])}; });

// ===== GRID / OBS UTILITIES =====

export function gridCoord(idx) {
  var col = idx % GRID_COLS;
  var row = Math.floor(idx / GRID_COLS);
  return String.fromCharCode(65 + col) + (GRID_ROWS - row);
}

export function obsName(i) {
  return OCC_DATA[i] ? OCC_DATA[i].name.replace(/_/g, ' ') : '#' + i;
}