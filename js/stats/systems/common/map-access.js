// ===== MAP ACCESS / CLASSIFICATION =====

import {
  isColosseumMap,
  mapAFKType,
  mapCount,
  mapDisplayName,
  mapIndexByInternalName,
  mapInternalName,
  mapKillReq,
  mapMultiCharRequirement,
  mapPrimaryTarget,
  mapSideTargets,
  mapTransitions,
} from '../../data/common/maps.js';
import { isDungeonMap } from '../w2/dungeon.js';

var TOWN_MAPS = new Set([0, 50, 100, 150, 200, 250, 300]);
var BOSS_MAPS = new Set([29, 66, 114, 165, 214, 266]);
var FEATURE_MAPS = new Set([41, 42, 73, 120, 166, 216]);
var RUNTIME_MAPS = new Set([37, 69]);
var INTERNAL_MAPS = new Set([3, 4, 5, 20, 21, 22, 23, 25, 34, 35, 56, 313, 314, 323, 324]);
var WORLD_STARTERS = [
  { gate: -1, maps: [0, 6] },
  { gate: 0, maps: [50, 51, 54] },
  { gate: 50, maps: [100, 101, 102] },
  { gate: 100, maps: [150] },
  { gate: 150, maps: [200] },
  { gate: 200, maps: [250] },
  { gate: 250, maps: [300] },
];

function _cleanName(name) { return String(name || '').replace(/_/g, ' '); }

function _worldForMap(mapIdx) {
  var idx = Number(mapIdx);
  return Number.isInteger(idx) && idx >= 0 ? Math.floor(idx / 50) + 1 : 0;
}

function _isInternalName(displayName, internalName) {
  var display = String(displayName || '').toLowerCase();
  var internal = String(internalName || '').toLowerCase();
  return !displayName
    || display === 'z'
    || display === 'playerselect'
    || display === 'filler'
    || display === 'unused'
    || display === 'fillername'
    || internal === 'z'
    || internal === 'playerselect'
    || internal === 'nothinglol';
}

export function classifyMap(mapIdx) {
  var idx = Number(mapIdx);
  var displayName = mapDisplayName(idx);
  var internalName = mapInternalName(idx);
  var target = mapPrimaryTarget(idx);
  var sideTargets = mapSideTargets(idx).filter(function(value) {
    return value && value !== '_' && value !== 'Z';
  });
  var category = 'map';
  var visibility = 'default';
  var warning = '';

  if (!Number.isInteger(idx) || idx < 0 || INTERNAL_MAPS.has(idx)
      || _isInternalName(displayName, internalName)) {
    category = 'internal';
    visibility = 'hidden';
    warning = 'Internal or non-gameplay scene.';
  } else if (TOWN_MAPS.has(idx)) {
    category = 'town';
  } else if (isDungeonMap(idx)) {
    category = 'dungeon';
    visibility = 'advanced';
    warning = 'Dungeon results require live run-state inputs.';
  } else if (isColosseumMap(idx)) {
    category = 'colosseum';
    visibility = 'advanced';
    warning = 'Colosseum enemy state is runtime-only.';
  } else if (BOSS_MAPS.has(idx)) {
    category = 'boss';
    visibility = 'advanced';
    warning = 'Boss maps do not use their representative AFK target as boss HP.';
  } else if (RUNTIME_MAPS.has(idx)) {
    category = 'runtime';
    visibility = 'advanced';
    warning = 'This scene does not provide a normal AFK map context.';
  } else if (FEATURE_MAPS.has(idx)) {
    category = 'feature';
    visibility = 'advanced';
  } else if (mapAFKType(idx) === 'FIGHTING') {
    category = 'combat';
  } else if (target && target !== 'Nothing' && target !== 'Z') {
    category = 'skill';
  } else if (sideTargets.length > 0) {
    category = 'skill';
  }

  return {
    mapIdx: idx,
    name: displayName ? _cleanName(displayName) : 'Map ' + idx,
    internalName: internalName,
    target: target,
    sideTargets: sideTargets,
    afkType: mapAFKType(idx),
    category: category,
    visibility: visibility,
    world: _worldForMap(idx),
    warning: warning,
  };
}

function _snapshotArray(snapshot, key, fallback) {
  return snapshot && Array.isArray(snapshot[key]) ? snapshot[key] : fallback;
}

function _klaRow(snapshot, charIdx, mapIdx) {
  var allKla = _snapshotArray(snapshot, 'klaData', []);
  var charKla = Array.isArray(allKla[charIdx]) ? allKla[charIdx] : [];
  return Array.isArray(charKla[mapIdx]) ? charKla[mapIdx] : null;
}

function _counterCleared(snapshot, charIdx, mapIdx, counterIdx) {
  var row = _klaRow(snapshot, charIdx, mapIdx);
  if (!row || row[counterIdx] == null) return false;
  var value = Number(row[counterIdx]);
  return Number.isFinite(value) && value < 1;
}

function _isVisited(snapshot, charIdx, mapIdx) {
  var row = _klaRow(snapshot, charIdx, mapIdx);
  if (!row || row[0] == null) return false;
  var remaining = Number(row[0]);
  return Number.isFinite(remaining) && mapKillReq(mapIdx) - remaining > 0;
}

function _hasMultiCharClear(snapshot, sourceMapIdx) {
  var required = mapMultiCharRequirement(sourceMapIdx);
  if (required <= 1) return true;
  var allKla = _snapshotArray(snapshot, 'klaData', []);
  var cleared = 0;
  for (var charIdx = 0; charIdx < allKla.length; charIdx++) {
    if (_counterCleared(snapshot, charIdx, sourceMapIdx, 0)) cleared++;
  }
  return cleared >= required;
}

function _specialAccess(snapshot) {
  var result = new Map();
  var saveData = snapshot && snapshot.saveData ? snapshot.saveData : {};
  var options = _snapshotArray(snapshot, 'optionsListData', saveData.optionsListData || []);
  var dreams = _snapshotArray(snapshot, 'dreamData', []);

  if ((Number(saveData.lv0AllData?.[0]?.[0]) || 0) > 16) result.set(41, 'Pet Park level unlock');
  if (Number(options[265]) === 1) result.set(42, 'Grand Owl unlock');
  if (Number(options[266]) === 1) result.set(73, 'Oasis unlock');
  if ((Number(dreams[2]) || 0) >= 1) result.set(120, 'Equinox unlock');
  if ((saveData.questCompleteData || []).some(function(quests) {
    return Number(quests && quests.Rift_Ripper1) === 1;
  })) result.set(166, 'Rift quest unlock');
  if ((Number(saveData.holesData?.[1]?.[0]) || 0) >= 1) result.set(216, 'Hole unlock');
  return result;
}

function _buildAccess(charIdx, snapshot) {
  var accessible = new Set();
  var reasons = new Map();

  function add(mapIdx, reason) {
    var idx = Number(mapIdx);
    if (!Number.isInteger(idx) || idx < 0 || accessible.has(idx)) return false;
    accessible.add(idx);
    reasons.set(idx, reason);
    return true;
  }

  for (var worldIdx = 0; worldIdx < WORLD_STARTERS.length; worldIdx++) {
    var world = WORLD_STARTERS[worldIdx];
    if (world.gate >= 0 && !_counterCleared(snapshot, charIdx, world.gate, 0)) continue;
    for (var seedIdx = 0; seedIdx < world.maps.length; seedIdx++) {
      add(world.maps[seedIdx], worldIdx === 0 ? 'World 1 starter' : 'World ' + (worldIdx + 1) + ' unlocked');
    }
  }

  for (var mapIdx = 0; mapIdx < mapCount(); mapIdx++) {
    if (_isVisited(snapshot, charIdx, mapIdx)) add(mapIdx, 'Recorded map progress');
  }

  var currentMaps = _snapshotArray(snapshot, 'currentMapData', []);
  var currentAvailable = _snapshotArray(snapshot, 'currentMapDataAvailable', []);
  if (currentAvailable[charIdx]) add(Number(currentMaps[charIdx]), 'Current map');

  _specialAccess(snapshot).forEach(function(reason, specialMapIdx) {
    add(specialMapIdx, reason);
  });

  var changed = true;
  while (changed) {
    changed = false;
    var sources = Array.from(accessible);
    for (var sourceIdx = 0; sourceIdx < sources.length; sourceIdx++) {
      var sourceMapIdx = sources[sourceIdx];
      var row = _klaRow(snapshot, charIdx, sourceMapIdx);
      if (!row) continue;
      var transitions = mapTransitions(sourceMapIdx);
      for (var portalIdx = 0; portalIdx < row.length; portalIdx++) {
        if (!_counterCleared(snapshot, charIdx, sourceMapIdx, portalIdx)) continue;
        if (!_hasMultiCharClear(snapshot, sourceMapIdx)) continue;
        var transition = transitions[portalIdx + 1];
        var destinationName = Array.isArray(transition) ? transition[1] : '';
        if (!destinationName || destinationName === 'Z' || destinationName === 'PREVIOUSMAP') continue;
        var destinationIdx = mapIndexByInternalName(destinationName);
        if (destinationIdx >= 0 && add(destinationIdx, 'Cleared portal from ' + classifyMap(sourceMapIdx).name)) {
          changed = true;
        }
      }
    }
  }

  return { accessible: accessible, reasons: reasons };
}

export function getCharacterMapEvidence(charIdx, mapIdx, snapshot) {
  var idx = Number(mapIdx);
  var currentMaps = _snapshotArray(snapshot, 'currentMapData', []);
  var currentAvailable = _snapshotArray(snapshot, 'currentMapDataAvailable', []);
  var current = Boolean(currentAvailable[charIdx]) && Number(currentMaps[charIdx]) === idx;
  var visited = _isVisited(snapshot, charIdx, idx);
  var access = _buildAccess(charIdx, snapshot);
  return {
    current: current,
    visited: visited,
    accessible: access.accessible.has(idx),
    evidence: access.reasons.get(idx) || '',
  };
}

export function buildCharacterMapOptions(charIdx, snapshot, options) {
  options = options || {};
  var level = options.level || 'accessible';
  var access = _buildAccess(charIdx, snapshot);
  var currentMaps = _snapshotArray(snapshot, 'currentMapData', []);
  var currentAvailable = _snapshotArray(snapshot, 'currentMapDataAvailable', []);
  var currentMap = currentAvailable[charIdx] ? Number(currentMaps[charIdx]) : null;
  var candidates = [];
  for (var mapIdx = 0; mapIdx < mapCount(); mapIdx++) candidates.push(mapIdx);
  if (currentMap != null && candidates.indexOf(currentMap) === -1) candidates.push(currentMap);

  var result = [];
  for (var candidateIdx = 0; candidateIdx < candidates.length; candidateIdx++) {
    var idx = candidates[candidateIdx];
    var classification = classifyMap(idx);
    var current = currentMap === idx;
    var visited = _isVisited(snapshot, charIdx, idx);
    var accessible = access.accessible.has(idx);
    var worldTown = TOWN_MAPS.has((classification.world - 1) * 50)
      && access.accessible.has((classification.world - 1) * 50);
    var include = current;

    if (!include && classification.visibility === 'hidden') include = level === 'debug';
    else if (!include && level === 'all') include = classification.visibility !== 'hidden';
    else if (!include && classification.visibility === 'advanced') {
      include = level === 'advanced' && (accessible || visited || worldTown);
    } else if (!include && classification.visibility === 'default') {
      include = accessible || visited;
    }

    if (!include) continue;
    result.push(Object.assign({}, classification, {
      current: current,
      visited: visited,
      accessible: accessible,
      locked: !accessible && !visited && !current,
      evidence: access.reasons.get(idx) || '',
    }));
  }

  result.sort(function(first, second) {
    if (first.current !== second.current) return first.current ? -1 : 1;
    if (first.world !== second.world) return first.world - second.world;
    return first.mapIdx - second.mapIdx;
  });
  return result;
}

export function selectedMapTarget(mapIdx) {
  var target = mapPrimaryTarget(Number(mapIdx));
  return target && target !== 'Z' && target !== 'Filler' ? target : '';
}