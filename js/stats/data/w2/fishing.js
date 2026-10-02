// ===== FISHING DATA (W2) =====
import { FishPools } from '../game/custommaps.js';
import { FishToolkitInfo, MapDispName } from '../game/customlists.js';
import { MONSTERS } from '../game/monsters.js';
import { ITEMS } from '../game/items.js';

export var FISHING_POOL_KEYS = ['FishSmall', 'FishMed', 'FishBig', 'FishEquinox', 'MotherlodeFISH'];

// FishToolkitInfo rows are [name, D0, D1, D2, D3, EXP, SPEED, POW].
export var FISHING_TOOLKIT_STATS = ['D0', 'D1', 'D2', 'D3', 'EXP', 'SPEED', 'POW'];

function _name(raw) {
  return String(raw || '').replace(/\|/g, ' ').replace(/_/g, ' ').trim();
}

export function fishingPool(key) {
  var row = FishPools[key];
  if (!row) return null;
  var monster = MONSTERS[key] || {};
  var fish = [];
  for (var t = 0; t < 4; t++) {
    var itemKey = row[0][t];
    fish.push({
      slot: t,
      itemKey: itemKey,
      name: _name(ITEMS[itemKey] && ITEMS[itemKey].displayName) || itemKey,
      expPerCatch: Number(row[1][t]) || 0,
      bonusItem: row[4][t],
      bonusOdds: Number(row[5][t]) || 0,
    });
  }
  return {
    key: key,
    name: _name(monster.Name) || key,
    panelExpPerCatch: Number(monster.ExpGiven) || 0,
    expType: Number(monster.ExpType) || 0,
    effReqs: [Number(row[3][0]) || 0, Number(row[3][1]) || 0, Number(row[3][2]) || 0],
    fish: fish,
  };
}

export function fishingToolkitOptions(type) {
  var rows = FishToolkitInfo[type] || [];
  return rows.map(function(row, idx) {
    var stats = {};
    for (var i = 0; i < FISHING_TOOLKIT_STATS.length; i++) {
      stats[FISHING_TOOLKIT_STATS[i]] = Number(row[i + 1]) || 0;
    }
    return { idx: idx, name: _name(row[0]), stats: stats };
  });
}

// FishingToolkit FishTKdl2: depth bonuses keyed by CurrentMap and FishingSpotIndex.
var SPOT_DEPTH_BONUS = {
  54: { 0: [0, 25, 5, 0], 1: [30, 5, 0, 0] },
  55: { 0: [0, 0, 0, 40], 1: [0, 0, 15, 30], 2: [0, 0, 35, 0] },
  61: { 0: [0, 0, 0, 70], 1: [0, 0, 0, 54], 2: [0, 0, 45, 0] },
};

export function fishingSpotDepthBonus(mapIdx, spotIdx) {
  var map = SPOT_DEPTH_BONUS[Number(mapIdx)];
  var bonus = map && map[Number(spotIdx)];
  return bonus ? bonus.slice() : [0, 0, 0, 0];
}

export function fishingSpotOptions() {
  var options = [];
  Object.keys(SPOT_DEPTH_BONUS).forEach(function(mapKey) {
    var spots = SPOT_DEPTH_BONUS[mapKey];
    Object.keys(spots).forEach(function(spotKey) {
      options.push({
        mapIdx: Number(mapKey),
        spotIdx: Number(spotKey),
        mapName: _name(MapDispName[Number(mapKey)]),
        bonus: spots[spotKey].slice(),
      });
    });
  });
  return options;
}

// Every place a character can AFK fish. Normal fishing maps spawn their pools
// from scene scripts in MapMonstersList order, and that order is the saved
// FishingSpotIndex: zFishingA (54) has two Small spots, zFishingB (55) three
// Small spots, zFishingC (61) three Medium spots. zFishingD (72) is the World 2
// islands map; its RoomID picks the island (0 Trash, 1 Rando, 2 Crystal,
// 3 Seasalt, 4 Shimmer, 5 Fractal). Seasalt spawns three Large Fish spots, and
// FishTKdl2 only checks maps 54/55/61, so all three are equivalent. Other
// islands only push an offscreen FishMed placeholder, which is not modeled.
// Equinox and Trench fish are AFK targets outside the normal fishing maps.
var LOCATION_SPAWNS = [
  { mapIdx: 54, poolKey: 'FishSmall', spots: 2 },
  { mapIdx: 55, poolKey: 'FishSmall', spots: 3 },
  { mapIdx: 61, poolKey: 'FishMed', spots: 3 },
  { mapIdx: 72, poolKey: 'FishBig', spots: 0, label: 'Seasalt Island — any of 3 spots', mapName: 'Seasalt Island' },
  { mapIdx: null, poolKey: 'FishEquinox', spots: 0 },
  { mapIdx: null, poolKey: 'MotherlodeFISH', spots: 0 },
];

export function fishingLocations() {
  var out = [];
  LOCATION_SPAWNS.forEach(function(entry) {
    var pool = fishingPool(entry.poolKey);
    var mapName = entry.mapName || (entry.mapIdx == null ? pool.name : _name(MapDispName[entry.mapIdx]));
    var count = Math.max(entry.spots, 1);
    for (var s = 0; s < count; s++) {
      var spotIdx = entry.spots > 0 ? s : null;
      out.push({
        id: (entry.mapIdx == null ? 'x' : entry.mapIdx) + ':' + (spotIdx == null ? entry.poolKey : spotIdx),
        mapIdx: entry.mapIdx,
        spotIdx: spotIdx,
        poolKey: entry.poolKey,
        poolName: pool.name,
        mapName: mapName,
        label: entry.label || mapName + (spotIdx == null ? (entry.mapIdx == null ? '' : ' — ' + pool.name) : ' — spot ' + (spotIdx + 1)),
        bonus: spotIdx == null ? [0, 0, 0, 0] : fishingSpotDepthBonus(entry.mapIdx, spotIdx),
      });
    }
  });
  return out;
}

// Location a character is saved at, from CurrentMap, FishingSpotIndex, and AFKtarget.
export function savedFishingLocationId(mapIdx, spotIdx, afkTarget) {
  var locations = fishingLocations();
  var map = Number(mapIdx);
  var spot = Number(spotIdx);
  var match = locations.find(function(l) { return l.mapIdx === map && l.spotIdx === spot && l.poolKey === afkTarget; })
    || locations.find(function(l) { return l.mapIdx === map && l.spotIdx == null && l.poolKey === afkTarget; })
    || locations.find(function(l) { return l.mapIdx == null && l.poolKey === afkTarget; });
  return match ? match.id : null;
}

export function fishingRodSpeed(itemKey) {
  var item = ITEMS[itemKey && itemKey !== 'Blank' ? itemKey : 'Blank'];
  return Number(item && item.Speed) || 0;
}

export function fishingRodName(itemKey) {
  var item = ITEMS[itemKey];
  return item ? _name(item.displayName) : '';
}
