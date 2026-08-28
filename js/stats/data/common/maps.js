import {
  ColosseumInfo,
  MapAFKtarget,
  MapAFKtargetSide,
  MapDetails,
  MapDispName,
  MapName,
  SceneTransitions,
} from '../game/customlists.js';
import { MapMulticharReq, NonAFKscreens } from '../game/custommaps.js';
import { MONSTERS } from '../game/monsters.js';

// ===== MAP / COMBAT DATA =====

export function mapKillReq(idx) { return Number(MapDetails[idx]?.[0]?.[0]) || 0; }

export function mapMonsterCount(idx) { return Number(MapDetails[idx]?.[1]?.[0]) || 0; }

export function mapTravelDistance(idx) { return Number(MapDetails[idx]?.[1]?.[1]) || 0; }

export function mapIncomingAttacksPerHour(idx) { return Number(MapDetails[idx]?.[1]?.[2]) || 0; }

export function mapCount() { return Math.max(MapDispName.length, MapName.length); }

export function mapDisplayName(idx) { return String(MapDispName[idx] || ''); }

export function mapInternalName(idx) { return String(MapName[idx] || ''); }

export function mapPrimaryTarget(idx) { return String(MapAFKtarget[idx] || ''); }

export function mapSideTargets(idx) {
  return Array.isArray(MapAFKtargetSide[idx]) ? MapAFKtargetSide[idx].slice() : [];
}

export function mapAFKType(idx) {
  var target = mapPrimaryTarget(idx);
  return String(MONSTERS[target]?.AFKtype || '');
}

export function mapTransitions(idx) {
  return Array.isArray(SceneTransitions[idx]) ? SceneTransitions[idx] : [];
}

var _mapNameIndex = null;
export function mapIndexByInternalName(name) {
  if (!_mapNameIndex) {
    _mapNameIndex = new Map();
    for (var idx = 0; idx < MapName.length; idx++) {
      var internalName = String(MapName[idx] || '');
      if (internalName && !_mapNameIndex.has(internalName)) _mapNameIndex.set(internalName, idx);
    }
  }
  return _mapNameIndex.has(String(name)) ? _mapNameIndex.get(String(name)) : -1;
}

export function mapMultiCharRequirement(idx) { return Number(MapMulticharReq[idx]) || 0; }

export function isNonAFKMap(idx) {
  return Object.prototype.hasOwnProperty.call(NonAFKscreens, String(idx));
}

var _colosseumMaps = new Set(ColosseumInfo.map(function(row) { return Number(row[2]); }));
export function isColosseumMap(idx) { return _colosseumMaps.has(Number(idx)); }

var _MAP_AFK = MapAFKtarget;

export function isFightingMap(mapIdx) {
  var mob = _MAP_AFK[mapIdx];
  return mob && mob !== 'Nothing' && mob !== 'Z';
}
