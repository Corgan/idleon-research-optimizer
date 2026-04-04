import { MapDetails, MapAFKtarget } from '../game/customlists.js';

// ===== MAP / COMBAT DATA =====

export function mapKillReq(idx) { return Number(MapDetails[idx]?.[0]?.[0]) || 0; }

var _MAP_AFK = MapAFKtarget;

export function isFightingMap(mapIdx) {
  var mob = _MAP_AFK[mapIdx];
  return mob && mob !== 'Nothing' && mob !== 'Z';
}
