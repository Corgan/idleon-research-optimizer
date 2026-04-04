import { DeathNoteMobs, MapAFKtarget, MapDetails } from '../game/customlists.js';

// ===== DEATH NOTE DATA =====
// World base indices: each world starts at a multiple of 50 in MapAFKtarget
var WORLD_BASE = [];
for (var _w = 0; _w < DeathNoteMobs.length; _w++) WORLD_BASE.push(_w * 50);
export const DN_MOB_DATA = DeathNoteMobs.map((mobs, w) =>
  mobs.map(mob => {
    var idx = MapAFKtarget.indexOf(mob, WORLD_BASE[w]);
    return [idx, Number(MapDetails[idx][0][0])];
  })
);
