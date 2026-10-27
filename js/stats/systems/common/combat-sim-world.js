// ===== ACTIVE COMBAT SIMULATOR — WORLD / MONSTERS =====
// Literal port of the monster side of active combat (src/N.new.formatted.js):
//   * scene spawn loop (src 152980) from SCENE_GEOMETRY + SCENE_SPAWNS
//   * ActorEvents_1 init (AE1 2895-3305), Movement (2 s), whenDrawing Respawn,
//     NodeBoundary and KILL (registration order AE1 3308-3316)
//   * global 1-second respawn tick (src 75410), SineTimes (75407), crystal
//     lock reset (~101670)
//   * CreateMonster temp spawns (67134), AddStatusToMonster (66740),
//     T529 raise dead (67600), contact damage (69939), DealDmgToPlayer (66943),
//     MonsterDamage (69109)
// Kill rewards are delegated to combat-sim-rewards.js (`onKill`) from inside
// the KILL handler at exactly the source position.
//
// Per-monster fields replace the source's id-indexed MonsterHP / MonsterAlive /
// MonsterWillDie arrays. Temp-monster death splices those arrays and
// decrements every later _MonsterID, which keeps `id == listIndex + 1`; the
// per-monster representation is therefore equivalent. MonsterRespawnTime is
// NOT spliced in the source, so respawn counters live in the sparse
// sim.state.respawn map keyed by `id + _NumberOfEnemies`.

import { SCENE_GEOMETRY, SCENE_SPAWNS } from '../../data/game/scenes.js';
import { MapDetails, NinjaInfo, RANDOlist, RiftStuff } from '../../data/game/customlists.js';
import { MonsterDrops } from '../../data/game/custommaps.js';
import { MONSTERS } from '../../data/game/monsters.js';
import { MOB_SPRITES } from '../../data/game/combat-sprites.js';
import { createDmgPixel as sharedCreateDmgPixel, distanceEqn } from './combat-sim-player.js';

// ---------------------------------------------------------------------------
// Monster Type (MonsterDefinitionsGET[x].Type). The extractor now emits the
// source G.*_TYPE constants; these name families remain a fallback only.
// ---------------------------------------------------------------------------
const ORE_NAMES = new Set(['Cooking', 'Laboratory', 'Divinity', 'Copper', 'Iron', 'Gold', 'Plat', 'Dementia', 'Void', 'Lustre',
  'Starfire', 'Dreadlo', 'Godshard', 'Prehistrium', 'Marble', 'Motherlode', 'Spelunking0', 'Spelunking1', 'Spelunking2',
  'Spelunking3', 'Spelunking4', 'Spelunking5', 'Starlight']);
const TREE_NAMES = new Set(['OakTree', 'BirchTree', 'JungleTree', 'ForestTree', 'PalmTree', 'ToiletTree', 'StumpTree', 'SaharanFoal',
  'Tree7', 'AlienTree', 'Tree8', 'Tree9', 'Tree10', 'Tree11', 'Tree12', 'Tree13', 'Tree14', 'MotherlodeTREE', 'AlienTreetutorial']);
const FISH_NAMES = new Set(['FishSmall', 'FishMed', 'FishBig', 'FishEquinox', 'MotherlodeFISH']);

export function monsterTypeOf(name) {
  const n = String(name || '');
  // MonsterDefinitionsGET[n].Type (G.MONSTER_TYPE/ORE_TYPE/...); name fallback for unknown keys.
  if (MONSTERS[n] && MONSTERS[n].Type) return MONSTERS[n].Type;
  if (/^Bug([1-9]|1[0-5])$/.test(n)) return 'Bug';
  if (FISH_NAMES.has(n) || /^Fish([1-9]|1[0-4])$/.test(n)) return 'Fish';
  if (ORE_NAMES.has(n)) return 'Ore';
  if (TREE_NAMES.has(n)) return 'Tree';
  return 'Monster';
}

const N_CACHE = new Map();
// SceneEvents_n._NumberOfEnemies = Σ MonstersOnScreen of every earlier map.
export function numberOfEnemies(mapIdx) {
  const m = Number(mapIdx) || 0;
  if (N_CACHE.has(m)) return N_CACHE.get(m);
  let n = 0;
  for (let i = 0; i < m; i++) n += Number(MapDetails[i]?.[1]?.[0]) || 0;
  N_CACHE.set(m, n);
  return n;
}

function _clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }

function _buff(sim, id, col = 1) {
  if (col !== 1) return Number(sim.buffs[id + ':' + col]) || 0;
  return Number(sim.buffs[id]) || 0;
}

function _unmodelled(sim, key, detail) {
  const u = sim.state.unmodelled || (sim.state.unmodelled = {});
  u[key] = (u[key] || 0) + 1;
  sim.emit('unmodelled', { key, detail, t: sim.timeMs });
}

// ---------------------------------------------------------------------------
// Defs: MonsterRespawnTimeReset (src 74344) re-derives every def once per
// scene. The sim clones lazily and applies the save-derived ratios from
// combat-sim-inputs.js (respawnRescale, monsterHpRescale). Crystal spawning
// later overwrites the Crystal def in place, as the source does.
// ---------------------------------------------------------------------------
const RESPAWN_BASE_ALIAS = { caveC: 'caveD' };
export function getDef(sim, type) {
  const defs = sim.scene.defs;
  if (defs[type]) return defs[type];
  const base = MONSTERS[type];
  if (!base) return null;
  const d = _clone(base);
  d.Type = monsterTypeOf(type);
  const pctMap = sim.inputs.values.respawnBonusPct;
  const ratResp = sim.inputs.values.ratRespawnSeconds;
  if (type === 'fm_rat' && ratResp != null) {
    d.RespawnTime = Number(ratResp) || 0; // src 74353: fm_rat RespawnTime = RoyalG("RatResp")
  } else if (pctMap && typeof pctMap === 'object') {
    const pct = pctMap[type];
    // src 74353 caveD branch writes caveC: its value derives from caveD's base.
    const alias = RESPAWN_BASE_ALIAS[type];
    const raw = Number((alias && pct != null ? MONSTERS[alias] : base)?.RespawnTime) || 0;
    d.RespawnTime = pct == null ? raw : raw / (1 + pct / 100);
  } else {
    d.RespawnTime = (Number(base.RespawnTime) || 0) * (Number(sim.inputs.values.respawnRescale) || 1);
  }
  d.MonsterHPTotal = (Number(base.MonsterHPTotal) || 0) * (Number(sim.inputs.values.monsterHpRescale) || 1);
  defs[type] = d;
  return d;
}

function _spawnY(def, node) {
  const H = Number(def.HeightOfMonster) || 0;
  if (def.Type === 'Tree') return node.y - 100 + (H - 50) / 2;
  if (def.Type === 'Fish') return node.y + 60;
  return node.y - H + (H - 50) / 2;
}

export function defaultPlayerNode(mapIdx, cavern) {
  // SceneEvents_135 (map 216) init (src 157424): node 1 inside an open cavern
  // (Holes[0][char] != -1), else the surface node 0. Its mobs stage on node 3.
  if (Number(mapIdx) === 216) return cavern != null && Number(cavern) !== -1 ? 1 : 0;
  const sp = SCENE_SPAWNS[mapIdx];
  if (sp?.mobs?.length) return Number(sp.mobs[0][1]) || 0;
  return 0;
}

// Live (unrecycled) MapMonstersList in list order.
export function monsters(sim, filter) {
  const out = [];
  for (const m of sim.monsters) if (!m.recycled && (!filter || filter(m))) out.push(m);
  return out;
}

export function respawnCounter(sim, mon) {
  return Number(sim.state.respawn[mon.id + sim.scene.N]) || 0;
}

function _setCounter(sim, mon, v) { sim.state.respawn[mon.id + sim.scene.N] = v; }
export { _setCounter as setRespawnCounter };

// RiftStuff("Mob") / RiftStuff("mobHP") (src 91483-91484) from Rift[0].
function _rift0(sim) { return Number(sim.state.special?.rift?.rift0 ?? sim.saveData?.riftData?.[0]) || 0; }
export function riftMobIdx(sim) { const r = _rift0(sim); return r - 70 * Math.floor(r / 70); }
export function riftMobHP(sim) {
  const r = _rift0(sim);
  return 5e6 * Math.pow(1.11 + 0.02 * Math.min(1, r / 10) + (0.08 * Math.min(1, Math.max(0, r - 10) / 20) + 0.18 * Math.min(1, Math.max(0, r - 20) / 23)), r);
}

// ActionBlock("WormholeMob", t, i) (src 80340): queue `i` wormhole spawns of type t.
export function wormholeMob(sim, type, n) {
  const gi = sim.state.gi;
  gi[84] = (Number(gi[84]) || 0) + n;
  gi[85] = type;
  if (sim.scene.map === 166) gi[85] = String(RiftStuff[2]?.[riftMobIdx(sim) | 0] ?? '');
}

// ActionBlock KillWormholeMobs/KillGraveyardMobs/KillArcaneMobs/KillReindeer
// (src 80318-80325): reverse scan, MonsterHP = -69.42069 (no-reward temp kill).
export function killFlaggedMobs(sim, pred) {
  const list = monsters(sim);
  for (let i = list.length - 1; i >= 0; i--) if (pred(list[i])) list[i].hp = -69.42069;
}

const xCenter = (a) => a.x + a.width / 2;
const yCenter = (a) => a.y + a.height / 2;
function _playerXC(p) { return typeof p.xCenter === 'function' ? p.xCenter() : p.x + (p.width || 0) / 2; }
function _playerYC(p) { return typeof p.yCenter === 'function' ? p.yCenter() : p.y + (p.height || 0) / 2; }

// ---------------------------------------------------------------------------
// Scene build
// ---------------------------------------------------------------------------
export function buildScene(sim) {
  const map = Number(sim.mapIdx);
  const geo = SCENE_GEOMETRY[map];
  const sp = SCENE_SPAWNS[map];
  if (!geo) return { ok: false, reason: sp ? `map ${map} has spawns but no extracted scene geometry` : `map ${map} has no extracted scene geometry` };
  if (!sp || !Array.isArray(sp.mobs) || sp.mobs.length === 0) return { ok: false, reason: `map ${map} (${geo.scene}) spawns no monsters in its scene script` };
  const v = sim.inputs.values;
  const nodes = geo.nodes.map((n) => ({
    x: Number(n.x) || 0, length: Number(n.length) || 0, y: Number(n.y) || 0,
    neighbors: n.neighbors || [], neighborType: n.neighborType || [], connectorX: n.connectorX || [],
  }));
  let mobs = sp.mobs;
  const partial = [];
  if (sp.dynamicCount === 'Clam_Mobs') {
    const count = Math.min(25, Math.round(Math.min(25, 2 + (Number(v.ola456) || 0))));
    mobs = mobs.slice(0, count);
  }
  for (const [type] of mobs) {
    if (!MONSTERS[type]) return { ok: false, reason: `map ${map} spawns unknown monster ${type}` };
  }
  sim.scene = {
    // SceneEvents _NumberOfNodes: spawn skills clamp/roll nodes against this,
    // excluding trailing portal-only nodes that NodeX/NodeNeighbors still hold.
    numberOfNodes: Number(geo.numberOfNodes) > 0 ? Math.min(Number(geo.numberOfNodes), nodes.length) : nodes.length,
    map, name: geo.scene, nodes, portals: geo.portals || [], idlePlatforms: geo.idlePlatforms || [],
    N: numberOfEnemies(map), onScreen: mobs.length, mobs, defs: {}, partial,
  };
  const st = _clone(v.state || {});
  Object.assign(st, {
    gi: {
      71: 0, 74: 0, 77: Number(v.gi77) || 0, 79: Number(v.gi79) || 0, 80: Number(v.gi80) || 0, 81: 0,
      83: Number(v.gi83) || 0, 84: Number(v.gi84) || 0, 85: v.gi85 == null ? '' : String(v.gi85),
      87: 0, 125: 0, 126: 0, 127: 0, 129: 0, 132: 0, 133: 0,
    },
    // PixelHelperActor[26] ActorEvents_713 GenINFO: 20 Tempest weapon/ring
    // allowance, 40 next Arcane crystal type, 43 Prisma bubble count, 44 crystal
    // charge reset flag (41/141 kept as gi41/gi141).
    gi26: { 20: Number(v.gi26_20) || 0, 40: 0, 43: Number(v.gi43) || 0, 44: 0 },
    generalInfo19: Number(v.gi19) || 0, // PixelHelperActor[2] ActorEvents_167 GeneralInfo[19] (T490 accumulator)
    gi1_100: Number(v.gi1_100) || 0, // PixelHelperActor[1] GenINFO[100] form-drop suppression
    nd58: Number(v.nd58) || 0, nd67: 0, nd68: 0, // NONdummies[67]/[68] set at scene start from buff 420/585
    crystalLock: 0, // ActorEvents_741._GenINFO[130]
    nd3: Number(v.nonDummies3) || 0, nd46: Number(v.nonDummies46) || 0, gi7_8: v.gi7_8 ?? -1,
    TEMP: 0,
    respawn: {},
    sine: { el: Number(v.sintimeElapsed) || 0, S0: 0, S1: 0, S2: 0, S4: 0 },
    attackCooldowns: {}, attackSelected: -1,
    generalInfo9: 0, gi41: 0, gi141: 0, money: 0,
    afkTarget: String(v.afkTarget || ''), // AFKtarget; updated live by _event_TakeDamage (src 69953)
    wraith: Number(v.wraith) || 0, tempest: Number(v.tempest) || 0, arcanist: Number(v.arcanist) || 0,
    wwWeakness: -1, // PixelHelperActor[26]._GenINFO[15]: latched AFK-target MobWeakness (src 99895)
    killroyRoom: Number(v.killroyRoom) || 0,
    questStatus: {},
    unmodelled: {},
  });
  if (Array.isArray(v.initialRespawnCounters)) {
    const N = sim.scene.N;
    v.initialRespawnCounters.forEach((c, i) => { if (c != null) st.respawn[i + 1 + N] = Number(c) || 0; });
  }
  if (sim.options.initialRespawnCounters && typeof sim.options.initialRespawnCounters === 'object') {
    for (const [k, c] of Object.entries(sim.options.initialRespawnCounters)) st.respawn[Number(k) + sim.scene.N] = Number(c) || 0;
  }
  sim.state = st;
  if (map === 166) partial.push('Rift kill tasks are not modelled');
  if (map === 216) partial.push('Cavern (Holes) menu mechanics other than Monarch/Centurion golems, The Cove and The Den hound run are not modelled');
  return { ok: true };
}

// Global timers then the spawn loop. Called after the player module's init.
export function startScene(sim) {
  // ActorEvents_713 init (src 99770): NONdummies[67]/[68] = Tempest/Arcanist
  // buff active at scene load (read by the form flags in combat-sim-rewards).
  sim.state.nd67 = 0.1 <= (Number(sim.buffs?.[420]) || 0) ? 1 : 0;
  sim.state.nd68 = 0.1 <= (Number(sim.buffs?.[585]) || 0) ? 1 : 0;
  // Form flags are evaluated on demand in the source; rewards recomputes them
  // at each use, and this refresh keeps sim.state current for other readers.
  if (sim.rewards?.updateFormState) {
    sim.rewards.updateFormState(sim);
    sim.every(1000, () => sim.rewards.updateFormState(sim));
  }
  // ActorEvents_713 (src 99895-99905): 100 ms after load, only while
  // CompassTempest, poll every 500 ms until the live AFK target is a FIGHTING
  // monster, then latch MobWeakness(MonsterDrops[target][0][2]) = round(x/17)%4.
  sim.later(100, () => {
    if (Number(sim.state.tempest) !== 1) return;
    const h = sim.every(500, () => {
      if (sim.state.wwWeakness !== -1) { sim.cancel(h); return; }
      const afk = sim.state.afkTarget;
      if (afk && getDef(sim, afk)?.AFKtype === 'FIGHTING') {
        sim.state.wwWeakness = Math.round((Number(MonsterDrops[afk]?.[0]?.[2]) || 0) / 17) % 4;
      }
    });
  });
  // _event_1second (UI actor, src 75410): decrement the whole respawn array.
  const phase = Number(sim.options.respawnTickPhaseMs);
  const tick = () => {
    const r = sim.state.respawn;
    for (const k in r) if (-1 < r[k]) r[k] -= 1;
    // Same event's tail (src 75425): FoodCooldowns tick down.
    const f = sim.state.food;
    if (f) for (let i = 0; i < 8; i++) f.cd[i] = 0 < Number(f.cd[i]) ? Number(f.cd[i]) - 1 : 0;
  };
  if (phase > 0 && phase !== 1000) {
    // First decrement after phase ms, then every 1000 ms.
    const t = sim.every(1000, tick);
    sim.sched.setTimer(t, phase);
  } else {
    sim.every(1000, tick);
  }
  // SineTimes (src 75407): clamp HP/MP to their maxima (ScrollCircleINFO[68]
  // is 0 outside the Scroll Circle UI), then advance the sine phases.
  sim._itemSine = { pass: -1, S0: 0, S1: 0, S2: 0 };
  sim.every(100, () => {
    const p = sim.player;
    if (p) {
      if (Number(p.hp) > Number(p.hpMax)) p.hp = Number(p.hpMax);
      if (Number(p.mp) > Number(p.mpMax)) p.mp = Number(p.mpMax);
    }
    const s = sim.state.sine;
    const previous = sim._itemSine;
    previous.pass = sim.stepCount;
    previous.S0 = s.S0; previous.S1 = s.S1; previous.S2 = s.S2;
    s.el += 11;
    if (s.el > 35903) s.el = 0;
    s.S0 = Math.round(100 * Math.sin(0.01745329251994278 * s.el)) / 100;
    s.S1 = Math.round(100 * Math.sin(0.01745329251994278 * (s.el + 120))) / 100;
    s.S2 = Math.round(100 * Math.sin(0.01745329251994278 * (s.el + 240))) / 100;
    s.S4 = Math.round(100 * Math.sin(0.03490658503988556 * s.el)) / 100;
  });
  // Crystal lock (ActorEvents_741 GenINFO[130]) reset every 200 ms after 1 s.
  // A task created while tasks are firing is decremented in the same step, as
  // in Stencyl, so the first reset lands at 1190 ms.
  sim.later(1000, () => { sim.every(200, () => { sim.state.crystalLock = 0; }); });

  const { nodes, mobs, N } = sim.scene;
  const cavernScene = sim.scene.map === 216;
  for (let e = 0; e < mobs.length; e++) {
    const [type, nodeIdx] = mobs[e];
    const node = nodes[nodeIdx];
    const def = getDef(sim, type);
    let x, y;
    if (cavernScene) ({ x, y } = _cavernSpawnPos(sim, e, def, node));
    else { x = sim.rng.randomInt(node.x | 0, node.length | 0); y = _spawnY(def, node); }
    const mon = _newMonster(sim, type, nodeIdx, x, y);
    mon.id = e + 1;
    _init(sim, mon, { temp: 0, flag: '' });
    sim.monsters.push(mon);
    mon.hp = Number(def.MonsterHPTotal) || 0;
    mon.alive = 0;
    if ((Number(sim.state.respawn[e + 1 + N]) || 0) <= 0) mon.alive = 1;
    sim.emit('spawn', { id: mon.id, uid: mon.uid, type, node: nodeIdx, x: mon.x, y: mon.y, t: sim.timeMs });
  }
  if (cavernScene) _cavernLayout(sim);
}

// SceneEvents_135 init spawn positions (src 157400-157415). Every mob stages on
// node 3 (NodeY 2500, off-screen); only indices >= 4 consume randomInt(130, 830).
function _cavernSpawnPos(sim, e, def, node) {
  const ny = Number(node.y) || 0, H = Number(def.HeightOfMonster) || 0;
  if (e === 0) return { x: 446, y: ny - H + (H - 50) / 2 };
  if (e === 1) return { x: 446, y: ny - 78 };
  if (e === 2) return { x: 446, y: ny - 100 + (H - 50) / 2 };
  if (e === 3) return { x: 454, y: ny - 78 };
  const x = sim.rng.randomInt(130, 830);
  return { x, y: ny - H + (H - 50) / 2 };
}

// End of SceneEvents_135 init (src 157424): inside an open cavern the scene
// shouts HoleStuffz "b" (src 96618-96644), which moves that cavern's staged
// mobs from node 3 to node 1; then the player actor is created at
// x = OptionsList[6] - 24 (150 in a cavern, 900 on the surface),
// y = NodeY[node] - 49, with PlayerMoveMaps[2] = node.
function _cavernLayout(sim) {
  const cavern = Number(sim.inputs.values.holeCavern ?? -1);
  const inCavern = cavern !== -1;
  const nodeY = (n) => Number(sim.scene.nodes[n]?.y) || 0;
  if (inCavern) {
    const dn = Math.max(0, cavern);
    const set = dn === 1 ? [0] : dn === 7 ? [1] : dn === 8 ? [4, 11] : dn === 11 ? [2]
      : dn === 14 ? [12, 19] : dn === 16 ? [3] : dn === 17 ? [20, 27] : null;
    if (set) {
      const lo = set[0], hi = set.length > 1 ? set[1] : set[0];
      for (let i = lo; i <= hi; i++) {
        const mon = sim.monsters[i];
        if (!mon || mon.node !== 3) continue;
        mon.node = 1;
        const H = Number(getDef(sim, mon.type).HeightOfMonster) || 0;
        const ny = nodeY(1);
        // cd101/cd102/cd103 groups: NodeY - H; single cd0-cd3: the spawn
        // formula, with the extra -60 for MotherlodeTREE (index 2).
        if (set.length > 1) mon.y = ny - H;
        else mon.y = (i === 2 ? -60 : 0) + (ny - H + (H - 50) / 2);
        sim.emit('nodeMove', { id: mon.id, uid: mon.uid, node: 1, x: mon.x, y: mon.y, t: sim.timeMs });
      }
    }
  }
  const p = sim.player;
  const node = defaultPlayerNode(216, cavern);
  const oldY = nodeY(Number(p.node) || 0);
  p.node = node;
  p.x = (inCavern ? 150 : 900) - 24;
  p.y = (Number(p.y) || 0) + (nodeY(node) - oldY);
  if (Array.isArray(p.pmm)) p.pmm[2] = node;
}

function _newMonster(sim, type, nodeIdx, x, y) {
  const def = getDef(sim, type);
  // Actor width and getNumFrames come from the type's own animation; the map
  // target's sprite is only a fallback for types without extracted art.
  const sp = MOB_SPRITES[type];
  const mon = {
    kind: 'monster', uid: 'm' + (sim._uidSeq = (sim._uidSeq || 0) + 1), id: 0, type, monType: def.Type, temp: 0, node: Number(nodeIdx) || 0,
    x, y, vx: 0, vy: 0,
    width: Number(sp?.fw) || Number(sim.inputs.values.monsterWidth) || 60,
    height: Number(def.HeightOfMonster) || 0,
    hp: 0, hpTot: 0, alive: 0, willDie: 0,
    moving: 0, movingFrame: 0, deathFrame: 0, offX: 0, offY: 0, rt: 0, moveSpeed: 0, moveSpeedInitial: 0,
    sizeMulti: 2, persNum: 0, statusList: [], frozen: 0, cardDisp: 0, pet: 0, worship: 0,
    numFrames: Number(sp?.frames) || Number(sim.inputs.values.monsterNumFrames) || 28, flag: '', drops: 1,
    kills: 0,
  };
  sim.addActor(mon);
  return mon;
}

// AE1 init (2895-3305). `flag` is the caller's DummyText3.
function _init(sim, mon, { temp, flag, onInit }) {
  const def = getDef(sim, mon.type);
  const v = sim.inputs.values;
  mon.cardDisp = 0; mon.worship = 0; mon.frozen = 0; mon.statusList = [];
  // HpBarImgInst [2]/[3]/[4] = shown/fill px/timer; RANDOlist[65] bosses and temp caveB/caveC use DungHP/PetTotalHP ([5] = 1).
  mon.hpBar = { att: 0, shown: 0, px: -1, timer: 0, ax: 0, ay: 0 };
  mon.hpBarBig = (RANDOlist[65] || []).includes(mon.type) || ((mon.type === 'caveB' || mon.type === 'caveC') && temp === 1) ? 1 : 0;
  if (mon.pet !== 4) mon.persNum = 0;
  mon.temp = temp;
  mon.flag = flag || '';
  if (mon.id === 1) { /* performETCaction("MonsterRespawnTimeReset") — defs are rescaled lazily by getDef */ }
  const key = mon.id + sim.scene.N;
  if ((Number(sim.state.respawn[key]) || 0) < -1e5) sim.state.respawn[key] = -10;
  mon.moving = Number(def.MonsterMoving) || 0;
  mon.movingFrame = Number(def.MovingFrame) || 0;
  mon.deathFrame = Number(def.DeathFrame) || 0;
  mon.hpTot = Number(def.MonsterHPTotal) || 0;
  mon.offX = Math.round(mon.width / 2);
  mon.offY = Number(def.MonsterOffsetY) || 0;
  mon.rt = Number(def.RespawnTime) || 0;
  mon.moveSpeed = Number(def.MoveSPEED) || 0;
  mon.moveSpeedInitial = mon.moveSpeed;
  mon.sizeMulti = 2;
  if (mon.pet === 2 || (mon.pet !== 0 && mon.pet !== 4)) mon.sizeMulti = 1;
  switch (mon.flag) {
    case 'BigBadGiantMonster': mon.sizeMulti = 5; mon.hpTot = 40 * (Number(def.MonsterHPTotal) || 0); break;
    case 'PiratePlunderMonster': mon.persNum = 176; mon.sizeMulti = 3; mon.hpTot = Math.max(10, Number(v.talent318_1) || 0) * (Number(def.MonsterHPTotal) || 0); break;
    case 'WormholeMobSpawn': mon.persNum = 177; break;
    case 'ArcaneMobSpawn': mon.sizeMulti = 3; break;
    case 'PartyOutsideDungMob': mon.persNum = 178; mon.moving = 0; break;
    case 'SuperBigBadGiantMonster': mon.sizeMulti = 8; mon.hpTot = 100 * (Number(def.MonsterHPTotal) || 0); break;
    case 'RiftMonsterz93z': _unmodelled(sim, 'riftMonster', mon.type); break;
    default: break;
  }
  // Pet (PetStatus 4) timers are registered early in the AE1 init pet branch
  // (src 63794), before the Bug images, velocity roll, and post-init hooks.
  if (onInit) onInit(mon);
  if (mon.monType === 'Bug') _bugImagesInit(sim, mon);
  if (mon.pet === 4) {
    // MonsterHPtot = PersNum (DummyNumber2), then the summoned-pet velocity branch.
    mon.hpTot = Number(mon.persNum) || 0;
    if (mon.type === 'Pet2') mon.vx = Math.pow(-1, 1 + (Number(sim.player.dir) || 0)) * mon.moveSpeed;
    else if (mon.type === 'Pet5') mon.moveSpeed = 0;
    else mon.vx = Math.pow(-1, sim.rng.randomInt(1, 2)) * mon.moveSpeed;
  } else if (mon.pet !== 3 && mon.moving === 1) mon.vx = sim.rng.randomInt(-1, 1) * mon.moveSpeed;
  if ((Number(sim.state.respawn[key]) || 0) > 0 && mon.temp === 0) { mon.willDie = 1; mon.alive = 0; }
  // Post-init hooks.
  if (mon.type === 'caveA') sim.special?.caveAInit?.(mon); // src 63882 Den hound timers
  if (mon.type === 'mini4a') {
    // runLater(5e3*randomFloat()) → runPeriodically(5e3) projectile (src 63894).
    sim.later(5e3 * sim.rng.randomFloat(), () => sim.every(5e3, () => _mini4aShot(sim, mon), mon), mon);
  }
  if (mon.type === 'rockS' && sim.scene.name === 'ColosseumC') {
    sim.later(15e3, () => { if (mon.hp > 0) mon.hp = -69.42; }, mon);
  }
  if (Array.isArray(NinjaInfo[30]) && NinjaInfo[30].includes(mon.type) && mon.pet === 0) {
    sim.later(100, () => {
      const inv = sim.state.inventory || { order: [], quantity: [] };
      let q = 0;
      for (let i = 0; i < inv.order.length; i++) if (inv.order[i] === 'BoneJoePickle') q = Number(inv.quantity[i]) || 0;
      mon.persNum = 0.81 + q;
      mon.hpTot *= Math.pow(1.1, Math.floor(mon.persNum));
      mon.hp = mon.hpTot;
    }, mon);
  }
  // Periodic handlers in registration order: Movement (2 s), then 1sec. The
  // 1sec worship/StatusBuffHeal branch only runs for worship mobs (not
  // simulated); its Bug branch drives the swarm images and consumes RNG.
  sim.every(2000, () => _movement(sim, mon), mon);
  if (mon.monType === 'Bug') sim.every(1000, () => _oneSec(sim, mon), mon);
}

// AE1 init Bug branch (src 63856-63864): eight swarm images at
// (x + randomInt(0,70), y + randomInt(-55,15)); Bug3/Bug4/Bug15 first roll a
// randomInt(1,4) image letter. Seven jitter timers then move every image by
// randomInt(-6,6) twice. Positions are kept relative to the (static) actor.
function _bugImagesInit(sim, mon) {
  const rng = sim.rng;
  const lettered = mon.type === 'Bug3' || mon.type === 'Bug4' || mon.type === 'Bug15';
  const imgs = mon.bugImgs = [];
  for (let i = 0; i < 8; i++) {
    const letter = lettered ? rng.randomInt(1, 4) : 0;
    const rx = rng.randomInt(0, 70);
    const ry = rng.randomInt(-55, 15);
    imgs.push({ rx, ry, letter, fadeTo: 1, fadeEnd: 0, flip: 1 });
  }
  for (let s = 0; s < 7; s++) {
    sim.later(1e3 * (0.14 + 0.14 * s), () => {
      for (const img of imgs) { img.rx += rng.randomInt(-6, 6); img.ry += rng.randomInt(-6, 6); }
    }, mon);
  }
}

// AE1 _event_1sec (src 63564-63578). Every tween (0.13 s / 0.18 s) completes
// before the next 0.14 s / 0.19 s check, so moves apply immediately. Alpha is
// exactly 0 only after a completed 0.5 s fade-out (Actuate overwrites tweens).
function _oneSec(sim, mon) {
  if (mon.cardDisp !== 0 || mon.pet !== 0 || mon.monType !== 'Bug' || !mon.bugImgs) return;
  const rng = sim.rng;
  for (let s = 0; s < 5; s++) {
    sim.later(1e3 * (0.2 + 0.19 * s), () => {
      if ((Number(sim.state.genInfo4) || 0) === 1) return;
      const now = sim.timeMs;
      for (const img of mon.bugImgs) {
        let d1 = -7, d2 = 7, d3 = -7, d4 = 7;
        if (4 > rng.randomInt(0, 4)) {
          if (img.rx < 0) d1 = 0; else if (img.rx > 70) d2 = 0;
          if (img.ry < -55) d3 = 0; else if (img.ry > 15) d4 = 0;
          if (img.ry > 400) {
            img.ry -= 515; img.fadeTo = 1; img.fadeEnd = now + 500;
            img.flip = Math.pow(-1, rng.randomInt(1, 2));
          } else if (img.ry < -400) img.ry += 500;
          img.rx += rng.randomInt(d1, d2);
          img.ry += rng.randomInt(d3, d4);
        }
        if (1 > rng.randomInt(0, 15)) {
          if (img.fadeTo === 0 && now >= img.fadeEnd) { img.fadeTo = 1; img.fadeEnd = now + 500; }
          else if (1 > rng.randomInt(0, 3)) { img.fadeTo = 0; img.fadeEnd = now + 500; }
        }
        if (1 > rng.randomInt(0, 5)) img.flip = 1 > rng.randomInt(0, 1) ? -1 : 1;
      }
    }, mon);
  }
}

// ---------------------------------------------------------------------------
// Per-step update: no per-step monster handlers exist (all are timers or
// whenDrawing). Kept for the core's actor phase.
// ---------------------------------------------------------------------------
export function updateMonster() {}

// whenDrawing: Respawn → (FRAME, cosmetic) → NodeBoundary → KILL, per monster
// in MapMonstersList order.
export function drawFrame(sim) {
  const list = sim.monsters.slice();
  for (const mon of list) {
    if (mon.recycled) continue;
    _hpBars(mon);
    _respawnHandler(sim, mon);
    _nodeBoundary(sim, mon);
    _killHandler(sim, mon);
  }
  // Per-frame "when drawing" events on skill actors (AE114 Arrow2/FireBomb/PoisonVial).
  for (const a of sim._frameActors.slice()) if (a.onFrame && !a.recycled) {
    if (sim.telemetry) sim.telemetry.frame(a, a.onFrame);
    else a.onFrame(sim, a);
  }
}

// _event_HPbars (src 63514) with OptionsList[27] = 1. Cosmetic only (no RNG).
// Two sequential statements: (1) a damaged, unshown bar is attached and shown
// while its Movement timer is below 20; (2) when the fill differs from
// round(hp/tot*33) the fill is rewritten and the timer reset, re-attaching
// a timed-out bar's images WITHOUT setting shown. Unshown attached images are
// never repositioned (they stay at their attach point and use no size term);
// the reset timer lets statement (1) show the bar again on the next frame.
// Big bars compare against the 33-px scale, so their timer resets every frame.
function _hpBars(mon) {
  if (mon.cardDisp !== 0 || (mon.pet !== 0 && mon.pet !== 4) || mon.monType !== 'Monster' || !mon.hpBar) return;
  const b = mon.hpBar, tot = Number(mon.hpTot) || 0;
  const hpNow = () => Number(mon.hp) || 0;
  const px = () => Math.round((mon.hpBarBig ? 153 : 33) * Math.min(1, Math.max(hpNow() / (tot + 0.01), 0)));
  const attach = () => { b.att = 1; b.ax = mon.x; b.ay = mon.y; };
  if (mon.alive === 1 && tot - hpNow() > 0.6 && b.shown === 0 && hpNow() > 0.05) {
    if (b.timer < 20) { attach(); b.px = px(); b.shown = 1; b.timer = 0; }
  }
  if (mon.alive === 1) {
    if (b.px !== Math.round(hpNow() / (tot + 0.01) * 33)) {
      if (tot - hpNow() > 0.6 && b.shown === 0 && hpNow() > 0.05) attach();
      b.px = px(); b.timer = 0;
    }
  } else if (b.shown === 1) { b.att = 0; b.shown = 0; }
}

function _respawnHandler(sim, mon) {
  if (mon.cardDisp !== 0 || mon.pet !== 0 || mon.alive !== 0) return;
  if (mon.type.indexOf('BugNest') !== -1) return;
  if (respawnCounter(sim, mon) > 0 || mon.temp !== 0) return;
  mon.willDie = 0;
  mon.hp = mon.hpTot;
  mon.alive = 1;
  if (mon.moving === 1) mon.vx = sim.rng.randomInt(-1, 1) * mon.moveSpeed;
  // Guardian Disciple aura (src 63601-63605): class 16 respawns within
  // GuardianRoyalRadius (180) of a live AE575 anim-20 actor gain StatusRoyal.
  if ((Number(sim.inputs.values.charClass) || 0) === 16) {
    for (const a of sim.actors) {
      if (a.recycled || a.kind !== 'bullet' || a.anim !== 'WT20') continue;
      if (distanceEqn(xCenter(mon), yCenter(mon), a.x + a.width / 2, a.y + a.height / 2) <= 180) { addStatusToMonster(sim, mon, 'StatusRoyal', 9999); break; }
    }
  }
  sim.emit('respawn', { id: mon.id, uid: mon.uid, type: mon.type, t: sim.timeMs });
  sim.telemetry?.spawn(mon);
}

function _nodeBoundary(sim, mon) {
  if (mon.cardDisp !== 0 || mon.pet === 1 || mon.pet === 3 || mon.moving !== 1) return;
  const node = sim.scene.nodes[mon.node];
  if (!node) return;
  if (xCenter(mon) < node.x) { mon.x = node.x + 1 - mon.width / 2; mon.vx = -mon.vx; }
  if (xCenter(mon) > node.length) { mon.x = node.length - 1 - mon.width / 2; mon.vx = -mon.vx; }
}

// _event_Movement (AE1 284).
function _movement(sim, mon) {
  if (mon.cardDisp !== 0 || mon.pet === 3 || mon.pet === 1 || mon.frozen !== 0) return;
  const has = (n) => mon.statusList.some((s) => s.name === n);
  if (has('StatusNoMove')) mon.moveSpeed = 0;
  else if (!has('StatusFreeze')) mon.moveSpeed = mon.moveSpeedInitial;
  // HP bar timeout (+2 per 2 s, removed at 20; dungeons keep it, but dungeon maps are excluded).
  if (mon.hpBar && mon.hpBar.shown === 1) { if (mon.hpBar.timer < 20) mon.hpBar.timer += 2; else { mon.hpBar.shown = 0; mon.hpBar.att = 0; } }
  if (mon.moving === 1 && mon.worship === 0 && mon.pet !== 4 && mon.alive === 1 && mon.hp > 0) {
    const b107 = _buff(sim, 107);
    if (b107 > 0) {
      for (let s = 0; s < 2; s++) {
        sim.later(1000 * (0.1 + 0.8 * s), () => {
          // alive gates both; willDie gates only the heal; hp > 0 gates the chase.
          if (mon.alive !== 1) return;
          if (mon.willDie === 0) mon.hp = Math.min(mon.hpTot, mon.hp + mon.hpTot * (_buff(sim, 107) / 100));
          if (mon.hp > 0) mon.vx = xCenter(mon) < _playerXC(sim.player) ? mon.moveSpeed : -1 * mon.moveSpeed;
        }, mon);
      }
    } else {
      let r = sim.rng.randomInt(1, 10);
      if (!(r < 7)) {
        r = sim.rng.randomInt(1, 10);
        if (mon.vx === 0) mon.vx = sim.rng.randomInt(-1, 1) * mon.moveSpeed;
        else if (r < 6) mon.vx = 0;
        else mon.vx = -1 * mon.vx;
      }
    }
  }
  if (mon.statusList.length > 0) {
    let removed = 0;
    const len = mon.statusList.length;
    for (let s = 0; s < len; s++) {
      const entry = mon.statusList[Math.round(s - removed)];
      if (!entry || !(entry.dur > 0)) continue;
      entry.dur -= 2;
      if (entry.name === 'StatusPoison') {
        const pct = (Number(sim.inputs.values.talent525_2) || 0) / 100;
        // CreateDmgPixel(1, monster, [T525_2/100]) (src 63554) uses the player's
        // damage stats regardless of which player module drives movement.
        if (typeof sim.playerModule.createDmgPixel === 'function') sim.playerModule.createDmgPixel(sim, mon, [pct]);
        else sharedCreateDmgPixel(sim, mon, [pct], 1, 'status');
      }
      if (entry.dur <= 0) {
        if (entry.name === 'StatusFreeze') {
          if (mon.moving === 1) {
            mon.moveSpeed = mon.moveSpeedInitial;
            if (mon.alive === 1) mon.vx = mon.vx > 0 ? mon.moveSpeedInitial : -1 * mon.moveSpeedInitial;
          }
        } else if (entry.name === 'StatusNoMove' && mon.moving === 1) {
          mon.moveSpeed = mon.moveSpeedInitial;
          // GenINFO[17][GenINFO[16].indexOf(node)] is a worship lookup; off
          // worship maps it is undefined, so the else branch (-speed) runs.
          if (mon.alive === 1) mon.vx = -1 * mon.moveSpeed;
        }
        removed += 1;
        const i = mon.statusList.indexOf(entry);
        if (i >= 0) mon.statusList.splice(i, 1);
        sim.emit('statusExpired', { id: mon.id, uid: mon.uid, status: entry.name, t: sim.timeMs });
      }
    }
  }
}

// _event_KILL (AE1 801).
function _killHandler(sim, mon) {
  if (mon.cardDisp !== 0 || !(mon.pet === 0 || mon.pet === 4) || sim.scene.map === 23) return;
  if (!(mon.hp <= 0) || respawnCounter(sim, mon) > 0 || mon.alive !== 1) return;
  const st = sim.state;
  const v = sim.inputs.values;
  if (st.nd46 === 1) {
    if (sim.killroy) sim.killroy.onKill(mon);
    else _unmodelled(sim, 'partyKillBlock', mon.type);
  }
  const p = sim.player;
  if (p.target === mon && !p.autoMove) {
    p.target = null;
    sim.emit('targetCleared', { id: mon.id, uid: mon.uid, t: sim.timeMs });
  }
  if (sim.scene.map === 157 && mon.type === 'w4b3' && Number(st.questComplete?.Capital_P3) === 0) {
    const q = st.questStatus.Capital_P3 = st.questStatus.Capital_P3 || [0];
    if (mon.vx === 0) q[0] = Math.max(0, q[0] + sim.rng.randomInt(-200, -1e3));
    else q[0] = q[0] + sim.rng.randomInt(5, 500);
  }
  mon.vx = 0;
  const hpAtKill = mon.hp;
  if (mon.temp === 0 || (mon.worship !== 2 && mon.pet !== 4 && mon.hp !== -69.42069)) {
    sim.rewards.onKill(sim, mon);
    if (mon.statusList.some((s) => s.name === 'StatusGrave')) {
      st.gi[127] = Math.round(st.gi[127] - 1);
      if (st.gi[127] <= 0) {
        st.gi[125] = (st.gi[125] || 0) + 1;
        st.gi[127] = 999;
        if (sim.rng.randomFloat() < (Number(v.talent199_1) || 0) / 100) sim.emit('castAttack', { attack: 136, from: mon.uid, t: sim.timeMs });
      }
    }
  }
  // Tenteyecle (src 92409), outside the reward gate.
  const t483 = Number(v.talent483_1) || 0;
  const pct = st.arcanist === 1 ? Math.min(Number(v.arcaneUpg7) || 0, t483) : t483;
  if (sim.rng.randomFloat() < pct / 100 && (st.killroyRoom === 0 || sim.rng.randomInt(1, 5) === 1)) {
    const red = Math.min(4, Number(v.talent483_2) || 0);
    for (const k of Object.keys(st.attackCooldowns)) {
      const cd = Number(st.attackCooldowns[k]) || 0;
      if (Math.round(cd) === 1 && String(st.attackSelected) === String(k)) st.attackSelected = -1;
      if (cd > 0) st.attackCooldowns[k] = Math.max(Math.round(cd - red), 1);
    }
    sim.emit('tenteyecle', { t: sim.timeMs, reduction: red });
  }
  // Death.
  if (mon.temp === 0) {
    let c = Math.max(mon.rt - _buff(sim, 302), 4);
    const b198 = _buff(sim, 198, 2);
    if (b198 > 0 && st.nd46 === 0) c = Math.max(mon.rt / (1 + b198 / 100), 2);
    _setCounter(sim, mon, c);
  }
  mon.alive = 0;
  mon.kills++;
  sim.emit('monsterKilled', { id: mon.id, uid: mon.uid, type: mon.type, temp: mon.temp, flag: mon.flag, node: mon.node, hp: hpAtKill, respawn: respawnCounter(sim, mon), t: sim.timeMs });
  const delay = (Math.round(mon.numFrames - mon.deathFrame + 1) / 10) * 1e3;
  sim.later(delay, () => {
    if (mon.moving === 1) sim.later(600, () => { if (mon.alive === 0) mon.vx = sim.rng.randomInt(-5, 5); }, mon);
    sim.later(500, () => { if (mon.temp === 1) _removeTemp(sim, mon); }, mon);
  }, mon);
  if (mon.statusList.length > 0) {
    let removed = 0;
    const len = mon.statusList.length;
    for (let s = 0; s < len; s++) {
      const entry = mon.statusList[Math.round(s - removed)];
      if (entry && entry.dur >= 0) {
        removed += 1;
        mon.statusList.splice(mon.statusList.indexOf(entry), 1);
      }
    }
  }
}

function _removeTemp(sim, mon) {
  sim.state.TEMP -= 1;
  const list = sim.monsters.filter((m) => !m.recycled);
  for (let i = mon.id; i < list.length; i++) list[i].id -= 1;
  const k = sim.monsters.indexOf(mon);
  if (k >= 0) sim.monsters.splice(k, 1);
  sim.recycleActor(mon);
  sim.emit('despawn', { uid: mon.uid, type: mon.type, flag: mon.flag, t: sim.timeMs });
}

// ---------------------------------------------------------------------------
// API for the player module and rewards
// ---------------------------------------------------------------------------
export function damageMonster(sim, mon, amount, meta = {}) {
  if (!mon || mon.recycled) return { dealt: 0, willDie: 0 };
  const a = Number(amount) || 0;
  const hpBefore = mon.hp;
  mon.hp -= a;
  sim.telemetry?.damage(mon, a, hpBefore, meta);
  if (mon.hp <= 0 && meta.markWillDie !== false) mon.willDie = 1;
  sim.emit('damage', { id: mon.id, uid: mon.uid, amount: a, hp: mon.hp, meta, t: sim.timeMs });
  return { dealt: a, willDie: mon.willDie };
}

// AddStatusToMonster (src 66740): existing name → overwrite duration.
export function addStatusToMonster(sim, mon, name, dur) {
  const e = mon.statusList.find((s) => s.name === name);
  if (e) e.dur = Number(dur) || 0;
  else mon.statusList.push({ name, dur: Number(dur) || 0 });
  sim.emit('statusAdded', { id: mon.id, uid: mon.uid, status: name, dur, t: sim.timeMs });
}

// T529 raise dead (src 67600): reset respawn counters of nearby dead mobs.
export function raiseDead(sim, distance) {
  const d = distance ?? (Number(sim.inputs.values.talent529_1) || 0);
  const p = sim.player;
  let n = 0;
  for (const m of monsters(sim)) {
    if (m.temp !== 0) continue;
    const sp = String(getDef(sim, m.type)?.SpecialType ?? '');
    if (distanceEqn(xCenter(m), yCenter(m), _playerXC(p), _playerYC(p)) < d && sp.indexOf('a') === -1) { _setCounter(sim, m, 0); n++; }
  }
  return n;
}

// Contact candidate (src 69939-69951) in list order.
export function contactTarget(sim) {
  const p = sim.player;
  if (p.dead || !(p.takeDmgTimer < 0.01)) return null;
  const list = monsters(sim);
  for (let e = 0; e < list.length; e++) {
    const m = list[e];
    if (m.node === p.node && m.pet === 0 && m.monType === 'Monster' && m.alive === 1 && m.willDie === 0
      && Math.abs(xCenter(m) - _playerXC(p)) < 25 && String(p.animation) !== '4') return m;
  }
  return null;
}

// mini4a projectile (src 63894 fire, actor 198 anim "2" src 69514). Fire:
// target x = randomInt(pX+40|0, pX-40|0) at NodeY[playerNode]. +1600 ms: two
// randomInt(5,-15) jitter tweens; +3850 ms the shell rests at (tx+dx-18 rounded,
// tY-41) and hits a player inside its square for DealDmgToPlayer(5000).
function _mini4aShot(sim, mon) {
  const p = sim.player;
  const X0 = xCenter(mon), Y0 = (Number(mon.y) || 0) - 75;
  const tx = sim.rng.randomInt((Number(p.x) + 40) | 0, (Number(p.x) - 40) | 0);
  const ty = Number(sim.scene.nodes?.[Number(p.node) | 0]?.y) || 0;
  sim.emit('monsterProjectile', { uid: mon.uid, type: mon.type, x: X0, y: Y0, tx, ty, t: sim.timeMs });
  sim.later(1600, () => {
    const dx = sim.rng.randomInt(5, -15);
    const dy = sim.rng.randomInt(5, -15);
    sim.later(2250, () => {
      const X = X0 + dx + Math.round(tx - X0 - 18);
      const Y = Y0 + dy + (ty - (Y0 + dy + 41));
      const xc = _playerXC(p), yc = _playerYC(p);
      const hit = xc + 7 > X - 18 && xc - 7 < X + 37 && yc + 30 > Y - 70 && yc - 2 < Y + 36;
      const dmg = hit ? dealDmgToPlayer(sim, mon, 1, 5e3) : 0;
      sim.emit('monsterProjectileLand', { uid: mon.uid, type: mon.type, x: X, y: Y, hit, damage: dmg, t: sim.timeMs });
    });
  });
}

// The player's 150 ms TakeDamage timer calls this: find the first candidate and
// apply DealDmgToPlayer with HurtPlayerDN (StatusBuffDmg ×2, ×10 on map 216).
export function contactDamage(sim) {
  const m = contactTarget(sim);
  if (!m) return 0;
  let hdn = 1;
  if (m.statusList.some((s) => s.name === 'StatusBuffDmg')) hdn = sim.scene.map === 216 ? 10 : 2;
  return dealDmgToPlayer(sim, m, hdn);
}

// MonsterDamage(e) (src 69109).
export function monsterDamage(sim, e) {
  const D = Number(sim.player.defence) || 0;
  let r = (e - 2.5 * Math.pow(D, 0.8)) / Math.max(1 + (D / Math.max(e, 1)) * (Math.pow(D, 1.5) / 100), 1);
  if (_buff(sim, 108) !== 0) r = 2 * r;
  if (_buff(sim, 122) !== 0) r = r * Math.max(0.05, 1 - (Number(sim.inputs.values.talent122_1) || 0) / 100);
  if (r < 0.5) r = 0;
  return r < 1e6 ? Math.max(Math.ceil(r), 0) : r;
}

// DealDmgToPlayer (src 66943), non-dungeon branch. Returns damage applied.
// `rawDamage` overrides the monster's Damages[0] (projectiles pass their own e).
export function dealDmgToPlayer(sim, mon, hurtPlayerDN = 1, rawDamage) {
  const p = sim.player;
  if (p.moveState === 7 || !(p.takeDmgTimer < 0.01)) return 0;
  const def = getDef(sim, mon.type);
  const raw = (rawDamage !== undefined ? Number(rawDamage) || 0 : Number(def?.Damages?.[0]) || 0) * hurtPlayerDN;
  const d = monsterDamage(sim, raw);
  if (!(d > 0)) return 0;
  p.takeDmgTimer = Number(p.invulnSeconds) || 0;
  const b469 = _buff(sim, 469);
  let hpLoss;
  if (b469 !== 0) {
    hpLoss = d - Math.min(d * (b469 / 100), Number(p.mp) || 0);
    p.mp = Math.max((Number(p.mp) || 0) - d * (b469 / 100), 0);
  } else hpLoss = d;
  p.hp -= hpLoss;
  if (p.hp < 0) p.hp = 0;
  sim.emit('playerHit', { from: mon.uid, type: mon.type, damage: Math.min(d, 9999999), hpLoss, hp: p.hp, t: sim.timeMs });
  return hpLoss;
}

// CreateMonster(type, node, x) (src 67134). `flag` is DummyText3. `opts.pet`
// marks a summoned pet (PetStatus 4: Pet2/Pet5/pghost) whose HP and PersNum
// are the caster's DummyNumber2 (`opts.hp`); `opts.onInit(mon)` registers
// the pet's AE1 init timers.
export function createMonster(sim, type, nodeIdx, x, flag = '', opts = {}) {
  const def = getDef(sim, type);
  if (!def) { _unmodelled(sim, 'createMonsterUnknown', type); return null; }
  const node = sim.scene.nodes[nodeIdx] || sim.scene.nodes[0];
  const st = sim.state;
  const mon = _newMonster(sim, type, nodeIdx, x, _spawnY(def, node));
  mon.id = sim.scene.onScreen + st.TEMP + 1;
  st.TEMP += 1;
  if (opts.pet) { mon.pet = opts.pet; mon.persNum = Number(opts.hp) || 0; }
  _init(sim, mon, { temp: 1, flag, onInit: opts.onInit });
  let hp = Number(def.MonsterHPTotal) || 0;
  const rift = sim.scene.map === 166;
  switch (flag) {
    case 'BigBadGiantMonster': hp *= 40; break;
    case 'PiratePlunderMonster':
      hp *= Math.max(10, Number(sim.inputs.values.talent318_1) || 0);
      if (rift) { hp = riftMobHP(sim) * Math.max(10, Number(sim.inputs.values.talent318_1) || 0); mon.type = 'riftAll'; }
      break;
    case 'SuperBigBadGiantMonster': hp *= 100; break;
    case 'ArcaneMobSpawn': {
      // 10 × MapMonstersList[0]._MonsterHPtot (the new actor only when the list was empty).
      const first = monsters(sim)[0] || mon;
      hp = 10 * (Number(first.hpTot) || 0);
      mon.hpTot = hp;
      break;
    }
    case 'reindeer': {
      const first = monsters(sim)[0] || mon;
      hp = 3 * (Number(first.hpTot) || 0) * Math.pow(1.13, Number(st.gi[132]) || 0);
      if (hp < 1) hp = 1e9;
      mon.hpTot = hp;
      break;
    }
    case 'WormholeMobSpawn': {
      const g = Number(st.gi[83]) || 0;
      const k = Math.pow(Math.min(1.11, 1.04 + 0.01 * Math.floor(g / 20)), g);
      hp = 3 * hp * k;
      if (rift) { hp = 3 * riftMobHP(sim) * k; mon.type = 'riftAll'; }
      mon.hpTot = hp;
      mon.sizeMulti = Math.min(4.5, 1 + 0.5 * Math.floor(g / 20));
      break;
    }
    case 'GraveyardMobSpawn':
      hp *= 2;
      if (rift) { hp = 2 * riftMobHP(sim); mon.type = 'riftAll'; }
      mon.hpTot = hp; mon.sizeMulti = 2; break;
    case 'PartyOutsideDungMob': hp *= 10; mon.hpTot = hp; mon.sizeMulti = 3; break;
    case 'CaveHound': // src 67146 (The Den)
      if (sim.special?.caveHound) hp = sim.special.caveHound(mon, hp);
      mon.hpTot = hp;
      break;
    default: break;
  }
  if (opts.pet) { hp = Number(opts.hp) || 0; mon.hpTot = hp; }
  mon.hp = hp;
  sim.monsters.push(mon);
  mon.alive = 1;
  mon.willDie = 0;
  sim.emit('tempSpawn', { id: mon.id, uid: mon.uid, type, flag, node: mon.node, x: mon.x, y: mon.y, hp, t: sim.timeMs });
  return mon;
}

export function sine(sim) { return sim.state.sine; }

export function worldSummary(sim) {
  const live = monsters(sim);
  return {
    scene: sim.scene.name, N: sim.scene.N, onScreen: sim.scene.onScreen,
    alive: live.filter((m) => m.alive === 1).length,
    temp: live.filter((m) => m.temp === 1).length,
    tempCounter: sim.state.TEMP,
    partial: sim.scene.partial.slice(),
    unmodelled: Object.assign({}, sim.state.unmodelled),
    counters: { gi: Object.assign({}, sim.state.gi), nd3: sim.state.nd3, generalInfo9: sim.state.generalInfo9, crystalLock: sim.state.crystalLock },
  };
}

export { _unmodelled as unmodelled, _buff as buffValue };
