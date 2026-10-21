// ===== WORSHIP TOWER DEFENSE DATA (W3) =====
// Static Worship TD tables: trials, paths, waves, towers, traits, skulls,
// mobs, and scene geometry. Every value comes from the game's N.js runtime.
import { TDtraits, TowerInfo, WorshipBASEinfos, WorshipInfo, WorshipNODESnETC } from '../game/customlists.js';
import { WorshipMapType } from '../game/custommaps.js';
import { SCENE_GEOMETRY } from '../game/scenes.js';
import { MONSTERS } from '../game/monsters.js';
import { ITEMS } from '../game/items.js';

export var TD_TRIAL_COUNT = WorshipBASEinfos.length;
export var TD_TOWER_COUNT = 9;
// NewTowerCost base per tower type.
export var TD_TOWER_BASE_COST = [2, 4, 7, 13, 20, 10, 40, 70, 125];
// ActorEvents_340._GenINFO[62]: rows per wave cycle.
export var TD_WAVE_CYCLE = 30;
export var TD_TOWER_SPRITE = { w: 54, h: 55 };
export var TD_WIZARD_SPRITE = { w: 51, h: 73 };

// Monster sprite frame sizes for the eight trial mobs.
var MOB_FRAMES = {
  goblinG: [65, 50], moonman: [52, 54], acorn: [80, 44], snowball: [60, 50],
  w4b2: [50, 50], w5b3: [45, 45], w6b4: [68, 66], w7a8: [60, 60],
};

function _text(raw) {
  return String(raw || '').replace(/_/g, ' ').replace(/\s*@\s*/g, '\n').trim();
}

var _trialMaps = (function() {
  var maps = [];
  Object.keys(WorshipMapType).forEach(function(mapId) {
    maps[Number(WorshipMapType[mapId])] = Number(mapId);
  });
  return maps;
})();

export function tdTrialMap(trial) {
  return _trialMaps[Number(trial) || 0];
}

export function tdTrialForMap(mapId) {
  var t = WorshipMapType[String(mapId)];
  return t == null ? -1 : Number(t);
}

export function tdTrialBase(trial) {
  var row = WorshipBASEinfos[trial];
  if (!row) return null;
  return {
    trial: trial,
    map: tdTrialMap(trial),
    hpBase: Number(row[0]) || 0,
    hue: Number(row[1]) || 0,
    mob: String(row[2]),
    totemX: Number(row[4]) || 0,
    totemY: Number(row[5]) || 0,
    charge: Number(row[6]) || 0,
    effReq: Number(row[7]) || 0,
    row: row.slice(),
  };
}

export function tdTrialPath(trial) {
  var row = WorshipNODESnETC[trial];
  if (!row) return null;
  return { path: row[0].map(Number), flags: row[1].map(Number) };
}

export function tdMob(trial) {
  var base = tdTrialBase(trial);
  if (!base) return null;
  var m = MONSTERS[base.mob] || {};
  var frame = MOB_FRAMES[base.mob] || [50, 50];
  return {
    key: base.mob,
    name: _text(m.Name) || base.mob,
    moveSpeed: Number(m.MoveSPEED) || 0,
    height: Number(m.HeightOfMonster) || 50,
    frameW: frame[0],
    frameH: frame[1],
  };
}

// waveAdjustment / waveAdjustmentTIER for a zero-based wave row index.
export function tdWaveAdjust(t) {
  return Math.round(t - TD_WAVE_CYCLE * Math.floor(Math.max(t, 0) / TD_WAVE_CYCLE));
}

export function tdWaveTier(t) {
  return Math.floor(Math.max(t, 0) / TD_WAVE_CYCLE);
}

export function tdWaveRawRow(trial, idx) {
  var rows = WorshipInfo[trial] || [];
  var r = rows[Math.max(0, Math.min(rows.length - 1, idx))] || [0, 0, 1, 0];
  return { count: Number(r[0]) || 0, skull: Number(r[1]) || 0, size: Number(r[2]) || 1, mod: Number(r[3]) || 0 };
}

// Scaled row spawned when the wave counter advances to `wave` (1-based).
export function tdWaveRow(trial, wave) {
  var t = wave - 1;
  var tier = tdWaveTier(t);
  var raw = tdWaveRawRow(trial, Math.max(0, Math.min(TD_WAVE_CYCLE - 1, tdWaveAdjust(t))));
  return {
    wave: wave,
    tier: tier,
    count: Math.ceil(raw.count * (1 + tier / 3)),
    skull: Math.round(raw.skull + 2 * tier),
    size: raw.size,
    mod: raw.mod,
  };
}

var _towerDefCache = new Map();
export function tdTowerDef(type) {
  if (!_towerDefCache.has(type)) _towerDefCache.set(type, _tdTowerDef(type));
  return _towerDefCache.get(type);
}

function _tdTowerDef(type) {
  var row = TowerInfo[9 + type];
  if (!row) return null;
  return {
    type: type,
    key: String(row[0]),
    name: _text(row[0]),
    desc: _text(row[1]),
    perLvA: Number(row[2]) || 0,
    perLvB: Number(row[3]) || 0,
    baseCost: TD_TOWER_BASE_COST[type],
  };
}

var _traitCache = new Map();
export function tdTrait(type) {
  if (!_traitCache.has(type)) _traitCache.set(type, _tdTrait(type));
  return _traitCache.get(type);
}

function _tdTrait(type) {
  var row = TDtraits[type];
  if (!row) return null;
  return {
    A: { desc: _text(row[0]), value: Number(row[1]) || 0, key: Number(row[2]) || 0 },
    B: { desc: _text(row[3]), value: Number(row[4]) || 0, key: Number(row[5]) || 0 },
  };
}

export function tdTraitText(desc, value) {
  return String(desc).replace('{', String(value));
}

export var TD_SKULLS = (function() {
  var list = [];
  Object.keys(ITEMS).forEach(function(key) {
    var it = ITEMS[key];
    if (!it || it.Type !== 'WORSHIP_SKULL') return;
    list.push({
      key: key,
      name: _text(it.displayName),
      speed: Number(it.Speed) || 0,
      lvReqToCraft: Number(it.lvReqToCraft) || 0,
      weaponPower: Number(it.Weapon_Power) || 0,
    });
  });
  return list;
})();

export function tdSkull(key) {
  for (var i = 0; i < TD_SKULLS.length; i++) if (TD_SKULLS[i].key === key) return TD_SKULLS[i];
  return null;
}

// Platforms[1] assigned by each trial map's SceneEvents_N init. ActorEvents_67 draws
// "Plat" + Platforms[1] + ".png" attached to the platform actor at (0,0), so scene image pixels
// share TotemInfo node coordinates. Dimensions are the native PNG sizes in assets/worship-td/.
export var TD_TRIAL_PLAT = [24, 45, 71, 61, 111, 134, 162, 187];
var TD_PLAT_SIZE = {
  24: [960, 1312], 45: [1800, 540], 71: [960, 802], 61: [1920, 540],
  111: [1300, 700], 134: [1313, 540], 162: [960, 1152], 187: [1568, 928],
};
export var TD_ASSET_DIR = 'assets/worship-td/';

export function tdTrialScene(trial) {
  var plat = TD_TRIAL_PLAT[Number(trial) || 0];
  if (plat == null) return null;
  var size = TD_PLAT_SIZE[plat];
  return { plat: plat, src: TD_ASSET_DIR + 'Plat' + plat + '.png', w: size[0], h: size[1] };
}

// Scene MBS actors 83, with scene-init animations and sprite 84 frame sizes (2026-10-16-hotfix-2).
// Animation changes preserve the default TP_Pete centre (41x33); getWidth/Height ignore growTo.
// Bloo moves off-map after his first quest; reserve his original position conservatively.
var TD_NPCS = {
  1: [{ name: 'Loominadi', x: 685, y: 76, w: 67, h: 58 }],
  6: [{ name: 'Sussy Gene', x: 506, y: 919, w: 34, h: 53 }],
  7: [{ name: 'Bloo Radley', x: 1249, y: 784, w: 29, h: 29 }],
};
export function tdTrialNpcZones(trial) {
  return (TD_NPCS[trial] || []).map(function(n) {
    return { name: n.name, left: n.x - n.w / 2 - 10, right: n.x + 3 * n.w / 2 + 10,
      top: n.y - n.h - 10, bottom: n.y + n.h + 10 };
  });
}

// ActorEvents_81 draws addImgInst(i + "bg.png") where i is the _AllMapsForAnimationX group
// containing CurrentMap (maps 26/63/30/107/155/208/259/308 -> groups 10/11/4/7/21/25/28/32).
// The 1200x675 image is a camera parallax layer: X = screenX - screenX / (sceneW - 960) * 240
// (sceneW > 970) and Y = screenY + Y0 - screenY / (sceneH - 540) * 135 (sceneH > 550; map 259
// uses 580 + screenY / (sceneH - 540) * 48). 11bg and 7bg have transparent skies.
export var TD_TRIAL_BG = [10, 11, 4, 7, 21, 25, 28, 32];
export function tdTrialBackground(trial) {
  var idx = TD_TRIAL_BG[Number(trial) || 0];
  if (idx == null) return null;
  return { index: idx, src: TD_ASSET_DIR + idx + 'bg.png', w: 1200, h: 675 };
}

// TowerType0..8.png are the 44x44 tower selection icons, in tower type order.
export function tdTowerIcon(type) {
  return TD_ASSET_DIR + 'TowerType' + (Number(type) || 0) + '.png';
}

// Trial mobs are ActorEvents_1 monsters: each is an animation of resources.mbs sprite 2
// ("Monster"), named by its monster key. Sheets are extracted to mob-<key>.png as an
// across x down frame grid. Idle/walk frames last 100 ms each.
var TD_MOB_SHEET = {
  goblinG: [31, 5, 5, 25], moonman: [45, 6, 5, 27], acorn: [24, 5, 5, 21], snowball: [78, 6, 5, 28],
  w4b2: [107, 6, 5, 28], w5b3: [144, 6, 5, 28], w6b4: [166, 6, 6, 35], w7a8: [193, 6, 6, 32],
};
// Animation origins from resources.mbs (Monster sprite): bottom-centre [floor(frameW/2), frameH].
// Stencyl growTo scales and mirrors about this point, so the feet stay on the walk line at any size.
var TD_MOB_ORIGIN = {
  goblinG: [32, 50], moonman: [26, 54], acorn: [40, 44], snowball: [30, 50],
  w4b2: [25, 50], w5b3: [22, 45], w6b4: [34, 66], w7a8: [30, 60],
};

// ActorEvents_1 frame selection: idle uses 0..MovingFrame-1, walking uses
// MovingFrame..DeathFrame-2, and death plays from DeathFrame-1. Sprites face right;
// the game flips them (growTo(-size)) while moving left.
export function tdMobSprite(trial) {
  var mob = tdMob(trial);
  var sheet = mob && TD_MOB_SHEET[mob.key];
  if (!sheet) return null;
  var m = MONSTERS[mob.key] || {};
  var moving = Number(m.MovingFrame) || 0, death = Number(m.DeathFrame) || sheet[3];
  return {
    key: mob.key,
    src: TD_ASSET_DIR + 'mob-' + mob.key + '.png',
    anim: sheet[0], across: sheet[1], down: sheet[2], frames: sheet[3],
    frameW: mob.frameW, frameH: mob.frameH, frameMs: 100,
    originX: (TD_MOB_ORIGIN[mob.key] || [Math.floor(mob.frameW / 2)])[0],
    originY: (TD_MOB_ORIGIN[mob.key] || [0, mob.frameH])[1],
    idle: [0, Math.max(0, moving - 1)],
    walk: [moving, Math.max(moving, death - 2)],
    death: [Math.max(0, death - 1), sheet[3] - 1],
  };
}

// Spawned TD mobs get createHueFilter(MOD_HUE[mod] - WorshipBASEinfos[trial][1]) for mods 1..5 and
// createSaturationFilter(0) otherwise; Void's mod strip also clears to saturation 0. Returned as a
// canvas/CSS filter string.
var TD_MOD_HUE = [null, 5, 220, 130, 64, 295];
export function tdMobFilter(trial, mod) {
  var h = TD_MOD_HUE[Number(mod) || 0];
  if (h == null) return 'grayscale(1)';
  var base = tdTrialBase(trial);
  return 'hue-rotate(' + (h - (base ? base.hue : 0)) + 'deg)';
}

export function tdGeometry(trial) {
  return SCENE_GEOMETRY[tdTrialMap(trial)] || null;
}
