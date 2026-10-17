// ===== ACTIVE COMBAT SIMULATOR — PLAYER (AUTO MODE) =====
// Player module for combat-sim-core.js (`options.player`). Ports the own-player
// ActorEvents_20 behaviour, the EveryScene cast pipeline and the skill bullets
// (ActorEvents_7 "Bullet", ActorEvents_575 "Bullet2") from src/N.new.formatted.js.
// Specs: _combat-src/spec-player.md (SP) and _combat-src/spec-skills.md (SK).
//
// TIMERS (registration order = firing order inside one 10 ms step):
//   AE20  NodeChangeSec 10000, FindNewNode 150, Movement 50, ActionsAttacks 50,
//         Results 50, StopMoving 150, TakeDamage 150            (SP §0/§1/§3)
//   ES    Every005 50 (AttackQueue decrement), Every1sec 1000 (cooldowns, MP
//         regen, buff tick, respawn countdown), AutoCastAttacks 1000
//   ES    AttackQueue loop — sceneUpdater (every step)          (SK §1.4)
//   AE20  per step: JumpingS3NPC then Die                         (SP §1.5/§6)
//
// MODELLED
//   * FindNewNode / Movement (path recompute, traversal windows, jump, ladder,
//     drop) / JumpingS3NPC gravity+landing / StopMoving / literal BFS
//     Pathfinder (Visited-on-dequeue and Parent-overwrite quirks).
//   * ActionsAttacks trigger and ActionTimer cadence for FISTICUFF, SPEAR, BOW
//     and WAND, ActionWaitTime per weapon, PlayerReach (+Buff 288).
//   * Results: fist Line lists (T18/T33/T48), spear up to 7 targets with T93/
//     T139 multi-hit and T169/T197 procs, bow arrows (T274/T304/T364, anim 6
//     travel), wand multi-hit (T528), T454 mark, T499/T587 procs, inputReq-2
//     attack-move casts with RAW cooldown.
//   * CreateDmgPixel: crit / super crit (SL640, T2_640 clamp), DamageDealed RNG
//     (<1e9 integer path and float path), Line lists, boss multiplier, accuracy
//     miss, StatusMark, StatusBlockFull.
//   * AutoCastAttacks (row-major loadout scan, AFKactivity gate, auto/buff/
//     line/target/circle with the BuffsActive index quirk), AttackQueue exact
//     zero test with float residue, ceil(cd/AtkCooldownDEC) and the 490/315/
//     362/168/498 specials, MP cost, 1 s cooldown/MP/buff tick.
//   * Buffs: AddBuffType refresh semantics, durations per SK §5, mirrored into
//     sim.buffs[id] = TN(1,id) and sim.buffs[id+':2'] = TN(2,id) while active.
//   * Bullets (kind 'bullet', tasks bound to the actor, integrated by the core
//     at 0.1*v px per step): melee-area anims 7/10/18/23/24, piercing waves
//     25/15 (+anim 14 launcher), Daggerang 102 (velocity schedule, catch → cd 2,
//     SmolD), bow arrow 6, Fireball 11, Knightly/Guardian Disciple WT7/WT20,
//     Orb totem WT8/21, Combustion 136, Concoction-free skills listed in
//     SKILL_HANDLERS. Everything else emits `unmodelled` with its AE148 line.
//   * Taking damage (world.contactDamage every 150 ms), invulnerability timer,
//     Die, AutoRespawn countdown (+900 ms revive).
// Food/potions: ConsumeFoodNEW health eating (150 ms), kill/mana/
//   movement ConsumeFoods triggers, cooldowns, Lab storage refill. When a
//   boost food runs out, the live (uncached) max HP, move speed, MP regen and
//   kill EXP are rebuilt without it; damage/TotalStats stay TotStatMAP-cached.
// NOT MODELLED (emit unmodelled once): inputReq-1 thrown items (auto mode
//   never clicks), the Arcane Crystal failure popup actor, dungeon branches.
// Modelled elsewhere in this file: type-2 portal scene transitions, summons
// 361/363/526 (Pet2/Pet5/pghost), and Tempest/Arcanist form ActionWaitTime.
// Spawn skills Graveyard 198, Reindeer 423, Wormhole 498 and Arcane Crystal
// 588 create their ActorEvents_575 actors (WT16/17, WT18, WT13, WT19) and feed
// PixelHelperActor[8] _event_025sec (every 330 ms), all in source RNG order.
// ---------------------------------------------------------------------------

import { ATTACKS } from '../../data/game/attacks.js';
import { TalentIconNames, NonAFKmonsters, MapAFKtarget, MapType, NonDMGLinemonsterTypes, SceneTransitions, MapName, NinjaInfo, RANDOlist } from '../../data/game/customlists.js';
import { BULLET_ANIMS, SPRITE_DEFAULTS, CODE_IMAGES } from '../../data/game/combat-sprites.js';
import { formActionWaitTime } from './combat-forms.js';
import { computeHitChance } from './combat-outcomes.js';
import { ITEMS } from '../../data/game/items.js';
import { buildLiveFoodInputs, LIVE_FOOD_KEYS } from './combat-sim-inputs.js';
import { SCENE_GEOMETRY, SCENE_SPAWNS } from '../../data/game/scenes.js';
// DungonMapzz (src DungAction): dungeon map index -> dungeon id.
const DUNGON = { 39: 0, 70: 0, 118: 0, 40: 1, 71: 2, 119: 3 };

const N = (v) => Number(v) || 0;

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

// _customBlock_DistanceEqn — octagonal distance approximation.
export function distanceEqn(x1, y1, x2, y2) {
  const dx = Math.abs(x1 - x2), dy = Math.abs(y1 - y2);
  return 0.9604339 * Math.max(dx, dy) + 0.397824735 * Math.min(dx, dy);
}

export function attackDef(id) {
  const name = TalentIconNames[Number(id)];
  return name ? ATTACKS[name] || null : null;
}

// _customBlock_Pathfinder (stats12:957) — literal BFS. Returns neighbor-index
// path, [] when start == goal and null when unreachable.
export function pathfinder(nodes, start, goal) {
  if (start === goal) return [];
  const visited = [start];
  const queue = [start];
  const parent = {};
  let found = false;
  while (queue.length) {
    const cur = queue.shift();
    if (!visited.includes(cur)) visited.push(cur);
    if (cur === goal) { found = true; break; }
    const nbs = nodes[cur]?.neighbors || [];
    for (let j = 0; j < nbs.length; j++) {
      const nb = Number(nbs[j]);
      if (!visited.includes(nb)) { parent[nb] = cur; queue.push(nb); }
    }
  }
  if (!found) return null;
  const path = [];
  let cur = goal, guard = 0;
  while (cur !== start && guard++ < 1000) {
    const par = parent[cur];
    if (par === undefined) return null;
    const nbs = nodes[par]?.neighbors || [];
    for (let j = 0; j < nbs.length; j++) if (Number(nbs[j]) === cur) path.splice(0, 0, j);
    cur = par;
  }
  return path;
}

// _customBlock_ActionWaitTime (src 66370) for the active weapon types.
export function actionWaitTime(type, { weaponSpeed = 0, level = 999, attackSpeedPct = 0, buff135 = 0, buff468 = 0 } = {}) {
  let wts = N(weaponSpeed);
  if (N(level) < 25) wts = Math.min(13, (75 - N(level)) / 25 * 1.8 + wts);
  else if (N(buff135) > 0) wts = Math.min(13, 2 + wts);
  const S = N(attackSpeedPct);
  switch (type) {
    case 'FISTICUFF':
    case 'SPEAR': return (0.6 + (10 - wts) / 5 + 0.35) / (1 + S / 100);
    case 'BOW': return Math.max(0.05, (0.7 + (10 - wts) / 5 + 0.1) / (1 + S / 100));
    case 'WAND': return 0.16 + (1.2 + (10 - wts) / 5) / (1 + (N(buff468) + S) / 100);
    case 'AFK': return Math.max(0.1, (1 + (10 - wts) / 5) / (1 + S / 100));
    default: return 2;
  }
}

// DamageDealed("RNG") given the cached Max and Mastery (SP §4.2).
export function rollDamage(rng, max, mastery, crit) {
  if (max < 1e9) {
    const M = Math.ceil(max);
    if (crit) return Math.max(rng.randomInt((M * Math.min(mastery + 0.35, 1)) | 0, M | 0), 1);
    return Math.max(rng.randomInt(Math.ceil(M * mastery), Math.ceil(M)), 1);
  }
  return max * rng.randomFloatBetween(mastery, 1);
}

// ---------------------------------------------------------------------------
// Accessors
// ---------------------------------------------------------------------------

function _v(sim) { return sim.inputs.values; }
// HitChancePCT (src 65943 / 66736): accuracy against the hit monster's live
// def Defence (the Den rewrites caveA Defence each frame). Uses the
// precomputed AFK-target value when the def matches it or it is overridden.
function _hitChance(sim, mon) {
  const v = _v(sim);
  if (v.hitChancePct == null) return 100;
  const def = mon ? sim.world.getDef(sim, mon.type) : null;
  if (!def || v.accuracy == null || sim.inputs.entries?.hitChancePct?.overridden) return N(v.hitChancePct);
  const d = N(def.Defence), type = def.Type || 'Monster';
  if (d === N(v.hitChanceDefence) && type === (v.hitChanceType || 'Monster')) return N(v.hitChancePct);
  return computeHitChance(v.accuracy, d, type);
}
export { _hitChance as hitChanceFor };
function TN(sim, k, id) { return N(_v(sim).talentN?.[k]?.[id]); }
function _nodes(sim) { return sim.scene.nodes; }
// getValueForScene(SceneEvents_n, "_NumberOfNodes"); may be smaller than the
// geometry node array, whose trailing entries can be portal-only nodes.
function _nodeCount(sim) { return N(sim.scene.numberOfNodes) || sim.scene.nodes.length; }
function _node(sim, i) { return sim.scene.nodes[i | 0]; }
function _xc(p) { return p.x + p.width / 2; }
function _yc(p) { return p.y + p.height / 2; }
function _mxc(m) { return m.x + m.width / 2; }
function _myc(m) { return m.y + m.height / 2; }
function _mox(m) { return m.x + N(m.offX); }
function _sgn(p) { return p.dir === 1 ? 1 : -1; }
function _isMonsterType(sim, m) { return String(sim.world.getDef(sim, m.type)?.Type || 'Monster') === 'Monster'; }
function _unm(sim, key, detail) { sim.world.unmodelled(sim, key, detail); }
function _hasStatus(m, name) { return (m.statusList || []).some((s) => s.name === name); }

function _buffActive(sim, id) { return (sim.state.buffsActive || []).some((b) => b[0] === id); }
// Cast target: AE148 reads DummyActor when set (proc chains), else the player's target.
function _castTarget(sim) { return sim.state.dummyActor || sim.player.target; }
function _buffBonus(sim, id, k = 1) { return _buffActive(sim, id) ? TN(sim, k, id) : 0; }

// ---------------------------------------------------------------------------
// Buffs — AddBuffType (DMG:1804)
// ---------------------------------------------------------------------------
export function addBuff(sim, id, seconds) {
  const list = sim.state.buffsActive;
  const t = Number(seconds) || 0;
  const b = list.find((e) => e[0] === id);
  if (b) { b[1] = t; b[2] = t; } else list.push([id, t, t]);
  _mirrorBuff(sim, id);
  sim.emit('buff', { id, seconds: t, t: sim.timeMs });
}

function _mirrorBuff(sim, id) {
  sim.buffs[id] = id === 615 ? 1 : TN(sim, 1, id);
  sim.buffs[id + ':2'] = TN(sim, 2, id);
}

function _unmirrorBuff(sim, id) { delete sim.buffs[id]; delete sim.buffs[id + ':2']; }

// Forced form inputs (`wraith`/`tempest`/`arcanist` = 1/0) start the run as if
// the form had been toggled before entering the map: the source keeps the form
// buff at 999999999 s (src 67497/67542/67603), so NONdummies[67]/[68], the form flags,
// custom stats, and the buff-gated form drops (src 63689-63705) all derive from it.
const FORM_BUFFS = { wraith: 195, tempest: 420, arcanist: 585 };
function _applyFormOverrides(sim) {
  const v = sim.inputs.values, st = sim.state;
  for (const [key, id] of Object.entries(FORM_BUFFS)) {
    const at = st.buffsActive.findIndex((b) => b[0] === id);
    if (v[key] === 1 && at === -1 && TN(sim, 1, id) > 0) {
      st.buffsActive.push([id, 999999999, 999999999]);
      _mirrorBuff(sim, id);
    } else if (v[key] === 0 && at !== -1) {
      st.buffsActive.splice(at, 1);
      _unmirrorBuff(sim, id);
    }
  }
}

const BUFF_DURATIONS = {
  19: (s) => 60 * TN(s, 2, 19), 40: () => 600, 45: (s) => Math.round(1 + TN(s, 1, 45)), 94: (s) => 60 * TN(s, 2, 94),
  107: (s) => TN(s, 2, 107), 108: () => 120, 122: () => 10, 124: () => 240, 135: (s) => TN(s, 1, 135), 167: () => 60,
  273: (s) => 60 * TN(s, 2, 273), 288: (s) => 120 + 60 * TN(s, 2, 288) / 7, 302: (s) => Math.ceil(30 * (1 + TN(s, 1, 424) / 100)),
  370: (s) => 60 * TN(s, 1, 370), 460: (s) => 60 * TN(s, 1, 460), 469: () => 90, 475: () => 60,
};

// ---------------------------------------------------------------------------
// CreateDmgPixel (DMG:1899) — list entries are numbers or { line, v }.
// ---------------------------------------------------------------------------
// Pets and NonDMGLinemonsterTypes (Ore/Tree/Fish/Bug) return before any RNG
// draw (src 66715); area loops without a type check still spend hit slots.
export function isNonDamageable(sim, mon) {
  return !mon || N(mon.pet) !== 0 || (NonDMGLinemonsterTypes || []).includes(String(sim.world.getDef(sim, mon.type)?.Type || 'Monster'));
}

// Tempest monster weakness (src 66736 / 69852): while CompassTempest,
// damage gains EffectAmount(CurrentEffect)% when CurrentEffect equals the
// latched map weakness GenINFO[15]. The DeathFrame -1 (Titan) branch needs
// GenINFO[10][0] > 0, which only Titan fights set.
function _wwWeakness(sim, def, dmg) {
  if (N(sim.state.tempest) !== 1) return dmg;
  if (N(def?.DeathFrame) === -1) return dmg;
  const fs = _v(sim).formStats?.tempest;
  const cur = fs ? N(fs.currentEffect ?? -1) : -1;
  if (cur !== N(sim.state.wwWeakness ?? -1)) return dmg;
  return dmg * (1 + (cur >= 0 ? N(fs.effectAmounts?.[cur]) : 0) / 100);
}

export function createDmgPixel(sim, mon, list = [], hits = 1, source = 'player') {
  if (isNonDamageable(sim, mon)) return 0;
  const v = _v(sim), rng = sim.rng;
  const L = list.slice();
  if (_hasStatus(mon, 'StatusMark')) L.push(1 + TN(sim, 2, 454) / 100);
  const def = sim.world.getDef(sim, mon.type);
  const boss = String(def?.SpecialType ?? '').includes('a');
  const CC = N(v.critChance), CD = N(v.critDamage);
  const max = N(v.damageMax), mastery = N(v.damageMastery);
  let total = 0;
  for (let r = 0; r < hits; r++) {
    let crit = 1;
    if (rng.randomInt(0, 1000) / 10 < CC) {
      crit = CD;
      if (rng.randomInt(0, 1000) / 10 < CC - 100 && N(v.skillLevels?.[640]) > 0.5) {
        crit = CD + Math.min(Math.max(TN(sim, 2, 640) / 100, 2), 6);
      }
    }
    let dmg = rollDamage(rng, max, mastery, crit !== 1) * crit;
    for (const m of L) {
      if (m && typeof m === 'object') { if (m.line === r) dmg *= m.v; } else dmg *= Number(m);
    }
    if (boss) dmg *= N(v.bossMulti) || 1;
    dmg = _wwWeakness(sim, def, dmg);
    const hc = _hitChance(sim, mon);
    const missed = hc < rng.randomInt(1, 100);
    if (missed) dmg = 0;
    if (_hasStatus(mon, 'StatusBlockFull')) dmg = 10;
    _dmgNumber(sim);
    sim.emit('playerDmg', { uid: mon.uid, dmg, crit, missed, source, t: sim.timeMs });
    if (dmg > 0) sim.world.damageMonster(sim, mon, dmg, { markWillDie: false, source });
    total += dmg;
  }
  return total;
}

// ---------------------------------------------------------------------------
// Bullets
// ---------------------------------------------------------------------------
// Damage-number actor (ActorEvents_10 init, src 63941): every CreateDmgPixel
// hit spawns one, and with dummyCritDmgMulti >= 1 its init consumes
// randomInt(-4,4) then randomInt(-2,2) from the shared RNG (src 66728-66740).
function _dmgNumber(sim) { sim.rng.randomInt(-4, 4); sim.rng.randomInt(-2, 2); }

// Unscaled collision box = frame size from resources.mbs (combat-sprites.js).
// Animation ids >= 100 use the code-drawn "100" 2x2 animation (AE7 init 639).
export function bulletSize(anim) {
  const k = typeof anim === 'number' && anim >= 100 ? '100' : String(anim);
  const s = BULLET_ANIMS[k] || (k.startsWith('WT') ? SPRITE_DEFAULTS.bullet2 : SPRITE_DEFAULTS.bullet);
  return { width: N(s.fw) || 25, height: N(s.fh) || 25 };
}

function _spawnBullet(sim, anim, skill, x, y, extra = {}) {
  const b = Object.assign({ kind: 'bullet', uid: 'b' + (sim.state.bulletUid = (sim.state.bulletUid || 0) + 1), anim, skill, x, y, vx: 0, vy: 0, dir: 1, hitList: [] }, bulletSize(anim), extra);
  sim.addActor(b);
  sim.emit('bullet', { uid: b.uid, anim, skill, x, y, t: sim.timeMs });
  return b;
}
function _bxc(b) { return b.x + b.width / 2; }
function _byc(b) { return b.y + b.height / 2; }
// Linear fadeImageTo / actor.fadeTo; the snapshot evaluates b.fade at sample time.
function _alphaAt(b, t) {
  const f = b.fade;
  if (!f) return b.alpha ?? null;
  return f.ms > 0 ? f.from + (f.to - f.from) * Math.max(0, Math.min(1, (t - f.t0) / f.ms)) : f.to;
}
function _fade(sim, b, to, ms) {
  const from = _alphaAt(b, sim.timeMs);
  b.fade = { from: from ?? 1, to, t0: sim.timeMs, ms };
}
// Stencyl OriginCentered: round(w/2), round(h/2) in unscaled image pixels.
function _originCentered(img) {
  const c = CODE_IMAGES[img];
  return c ? { imgOX: Math.round(c.w / 2), imgOY: Math.round(c.h / 2) } : {};
}

// Hitscanning (src 69317): also excludes map 216 monsters below yCenter 950.
export function hitscanning(sim, m, x, y, r) {
  return m.alive === 1 && distanceEqn(x, y, _mxc(m), _myc(m)) < r && m.hp > 0 && N(m.pet) === 0 && _isMonsterType(sim, m)
    && !(Number(sim.mapIdx) === 216 && _myc(m) > 950);
}

// Single-pass melee areas (AE7 _event_7/_10/_18/_23/_24, src 97671-97691).
// The source loop checks only alive/distance/HP, so ores and pets in range
// consume a _MultiArrow slot while CreateDmgPixel deals them no damage.
const MELEE_AREAS = {
  7: { delay: 280, recycle: 900, max: (s) => (TN(s, 1, 138) > 0 ? 12 : 5), R: (s) => (N(_v(s).charClass) === 14 ? 300 : 125), mult: (s) => TN(s, 2, 105) / 100 },
  10: { delay: 200, recycle: 600, max: () => 2, R: (s) => Math.min(Math.max(60, playerReach(s)), 95), mult: (s) => TN(s, 1, 90) / 100 },
  18: { delay: 200, recycle: 600, max: () => 1, R: () => 48, mult: (s) => TN(s, 2, 271) / 100 },
  23: { delay: 630, recycle: 1260, max: (s) => TN(s, 2, 15), R: () => 98, mult: (s) => TN(s, 1, 15) / 100 },
  24: { delay: 800, recycle: 2300, max: (s) => TN(s, 2, 120), R: () => 34, mult: (s) => TN(s, 1, 120) / 100 },
};

function _meleeArea(sim, anim, skill, x, y, dir) {
  const cfg = MELEE_AREAS[anim];
  const b = _spawnBullet(sim, anim, skill, x, y, { dir });
  sim.later(cfg.delay, () => {
    const max = cfg.max(sim), R = cfg.R(sim), mult = cfg.mult(sim);
    let count = 0;
    const list = sim.world.monsters(sim), byId = _byId(sim);
    for (let r = 0; r < list.length; r++) {
      const m = list[r];
      if (count >= max) break;
      // Alive uses the MonsterAlive[r + 1] quirk (src 97676).
      if (_aliveAt(byId, r) && distanceEqn(_bxc(b), _byc(b) + 18, _mxc(m), _myc(m)) < R && m.hp > 0) {
        count++;
        const t138 = anim === 7 ? TN(sim, 1, 138) : 0;
        const hits = t138 > 0 ? Math.ceil(sim.rng.randomFloatBetween(0, 1 + t138 / 100)) : 1;
        createDmgPixel(sim, m, [mult], hits, 'skill' + skill);
        // Knockback/pull (src 97686-97691): 0.4 s quadOut moveBy on moving,
        // non-MultiCombat monsters; anim 23 additionally requires HP > 0.
        if ((anim === 18 || anim === 23) && N(sim.world.getDef(sim, m.type)?.MonsterMoving) === 1 && !m.statusList.some((s) => s.name === 'StatusMultiCombat')) {
          if (anim === 18) sim.moveBy(m, TN(sim, 1, 271) * _sgn(sim.player), 0, 0.4, 'quadOut');
          else if (m.hp > 0) sim.moveBy(m, Math.round(0.64 * (_xc(sim.player) - m.x - m.width / 2)), 0, 0.4, 'quadOut');
        }
      }
    }
  }, b);
  sim.later(cfg.recycle, () => sim.recycleActor(b), b);
  return b;
}

// Frame a non-looping frLo..frHi segment shows at time t (Stencyl setCurrentFrame restarts the frame timer).
function _segFrame(b, t) {
  const a = BULLET_ANIMS[String(b.anim)];
  if (!a || b.frT == null) return b.frame ?? 0;
  let ms = t - b.frT;
  for (let f = b.frLo; f < b.frAt; f++) ms += a.ms[f] || 100;
  for (let f = b.frLo; f <= Math.min(a.frames - 1, b.frHi); f++) { ms -= a.ms[f] || 100; if (ms < 0) return f; }
  return Math.min(a.frames - 1, b.frHi);
}
// Piercing waves anim 25 (Shockwave) / 15 (Piercing Arrow) — AE7 init (src 97779-97791) and
// _event_1525 (src 97600-97625). Created with DummyNumber = ±1: anim 25 growTo(2·dir, 2), anim 15
// growTo(1.5·dir, 1.5). Each 100 ms tick, while pierces remain, anim 25 resets frame 5 (1000 ms) to
// frame 1; once pierces are spent, the next in-range monster or the next tick ends the wave (anim 25:
// frame 6 then recycle after 420 ms; anim 15: fade over 150 ms). Natural end at (anim - 6)/10 s (+ the
// arrow's Range buff delay) fades over 200 ms.
function _pierceWave(sim, anim, skill, x, y, dir) {
  const isArrow = anim === 15;
  const pierce = isArrow ? TN(sim, 2, 270) : Math.max(3, TN(sim, 2, 120));
  const mult = isArrow ? Math.max(10, TN(sim, 1, 270)) / 100 : Math.max(25, TN(sim, 1, 120)) / 100;
  const life = isArrow ? 900 + 10 + 1000 * _buffBonus(sim, 288) / 120 : 1900;
  const b = _spawnBullet(sim, anim, skill, x, y, { dir, vx: 30 * dir, pierce });
  const frames = (at) => Object.assign(b, { frame: null, frLo: 0, frHi: 11, frAt: at, frT: sim.timeMs, frLoop: false });
  if (!isArrow) frames(0);
  const end = () => {
    b.pierce = -50;
    if (isArrow) { _fade(sim, b, 0, 150); sim.later(150, () => sim.recycleActor(b), b); }
    else { frames(6); sim.later(420, () => sim.recycleActor(b), b); }
  };
  sim.every(100, () => {
    if (b.pierce > 0) {
      if (!isArrow && _segFrame(b, sim.timeMs) === 5) frames(1);
      for (const m of sim.world.monsters(sim)) {
        if (b.hitList.includes(m.uid)) continue;
        if (m.alive === 1 && m.hp > 0 && distanceEqn(_bxc(b), _byc(b), _mxc(m), _myc(m)) < 75) {
          if (b.pierce > 0) {
            b.pierce--;
            b.hitList.push(m.uid);
            createDmgPixel(sim, m, [mult], 1, 'skill' + skill);
          } else { end(); break; }
        }
      }
    } else if (b.pierce > -5) end();
  }, b);
  sim.later(life, () => {
    if (b.pierce > -5) { _fade(sim, b, 0, 200); sim.later(200, () => sim.recycleActor(b), b); }
  }, b);
  return b;
}

// Daggerang anim 102 (AE7:2548-2766).
function _daggerang(sim, x, y, dir, smol = 0, skill = 121) {
  const b = _spawnBullet(sim, 102, skill, x, y, { dir, vx: 13 * dir, vy: 35, armed: 0, smol });
  for (let o = 0; o < 12; o++) sim.later(110 * (o + 1), () => { b.vy -= 5.7; b.vx += 2.3 * dir; }, b);
  for (const t of [799.99, 899.99, 1000, 1100, 1200]) sim.later(t, () => { b.vy -= 1.5; }, b);
  for (let t = 1300; t <= 1900; t += 100) sim.later(t, () => { b.vx -= 3 * dir; }, b);
  for (let o = 0; o < 8; o++) sim.later(1000 * (1.3 + 0.14 * (o + 1)), () => { b.vy += 6; b.vx -= 9 * dir; }, b);
  for (let o = 0; o < 10; o++) sim.later(1000 * (1.8 + 0.14 * (o + 1)), () => { b.vy += 2; b.vx += 2 * dir; }, b);
  sim.later(500, () => { b.armed = 1; }, b);
  // Swordrang(2).png attached at (0,0), OriginCentered, width 100*MA% (T166 > 90 non-smol: MA*T166% x T166%).
  const t166 = TN(sim, 1, 166), big = t166 > 90 && !smol;
  b.img = big ? 'Swordrang2' : 'Swordrang';
  Object.assign(b, _originCentered(b.img), { angle: 0, imgOffX: 0, imgOffY: 0,
    imgSX: big ? dir * t166 / 100 : dir, imgSY: big ? t166 / 100 : 1 });
  const t0 = sim.timeMs;
  b.onFrame = () => { b.angle = 3600 * dir * Math.min(1, (sim.timeMs - t0) / 5000); };
  sim.later(4000, () => _fade(sim, b, 0, 300), b);
  const radius = 50 * Math.max(1, (TN(sim, 1, 166) - 100) / 100 * (1 - smol));
  const maxHits = TN(sim, 2, 121) + TN(sim, 2, 166);
  const mult = TN(sim, 1, 121) / 100;
  for (let o = 0; o < 41; o++) {
    sim.later(100 * (o + 1), () => {
      const p = sim.player;
      if (b.armed === 1 && !b.smol && distanceEqn(_bxc(b), _byc(b), _xc(p), _yc(p)) < 50) {
        sim.state.attackCooldowns['121'] = 2;
        sim.emit('daggerangCatch', { uid: b.uid, t: sim.timeMs });
        sim.recycleActor(b);
        return;
      }
      for (const m of sim.world.monsters(sim)) {
        if (b.hitList.includes(m.uid)) continue;
        if (hitscanning(sim, m, _bxc(b) + 20, _byc(b) + 20, radius) && b.hitList.length <= maxHits) {
          createDmgPixel(sim, m, [mult], 1, 'skill' + skill);
          b.hitList.push(m.uid);
        }
      }
    }, b);
  }
  sim.later(4300, () => sim.recycleActor(b), b);
  return b;
}

// Bow arrow anim 6 (AE7 _event_6): locked target, pre-rolled damage.
function _arrow(sim, target, dmg, x, y, dir, crit = 1) {
  const b = _spawnBullet(sim, 6, 'bow', x, y, { dir, vx: 29 * dir });
  sim.every(100, () => {
    const tx = _mox(target);
    if (Math.abs(_bxc(b) - tx) > 40) {
      if (target.hp <= 0 || target.recycled) sim.recycleActor(b);
      return;
    }
    if ((b.vx > 0 && _bxc(b) > tx - 20) || (b.vx < 0 && _bxc(b) < tx + 20)) {
      _applyPreRolled(sim, target, dmg, 'bow', crit);
      sim.recycleActor(b);
    }
  }, b);
  sim.later(5000, () => sim.recycleActor(b), b);
}

// Arrow contact (AE7 _event_6, src 97547-97557): no alive or damage-line gate.
// Only Type "Monster" with DeathFrame != -1 loses MonsterHP; DeathFrame -1
// bosses write BossHP / Titan GenINFO, which normal maps never reach. The
// damage-number actor spawns for every type.
function _applyPreRolled(sim, mon, dmg, source, crit = 1) {
  let d = dmg;
  if (_hasStatus(mon, 'StatusBlockFull')) d = 10;
  const def = sim.world.getDef(sim, mon.type);
  if (_isMonsterType(sim, mon)) {
    if (N(def?.DeathFrame) === -1) _unm(sim, 'bossHpArrow', 'DeathFrame -1 arrow damage (BossHP/Titan HP)');
    else sim.world.damageMonster(sim, mon, d, { markWillDie: false, source });
  }
  _dmgNumber(sim);
  sim.emit('playerDmg', { uid: mon.uid, dmg: d, crit, source, t: sim.timeMs });
}

// Fireball anim 11 (AE7 _event_113433, src 97560): on the first contact tick
// it scans every monster with Hitscanning (radius 50, then 60 after a hit),
// shifts 24px forward and stops on the first hit, damages up to four
// targets, then recycles 560ms later.
function _fireball(sim, x, y, dir) {
  const b = _spawnBullet(sim, 11, 451, x, y, { dir, vx: 15 * dir });
  let crit = 0;
  sim.every(100, () => {
    if (crit !== 0) return;
    for (const m of sim.world.monsters(sim)) {
      if (!hitscanning(sim, m, _bxc(b), _byc(b), 50 + 10 * Math.ceil(crit / 10))) continue;
      if (crit === 0) {
        b.x += 24 * (2 * Math.ceil(b.vx / 100) - 1);
        b.vx = 0; b.vy = 0;
        sim.later(560, () => sim.recycleActor(b), b);
      }
      crit++;
      createDmgPixel(sim, m, [Math.max(20, TN(sim, 1, 451)) / 100], 1, 'skill451');
      if (crit >= 4) break;
    }
  }, b);
  sim.later(2000, () => sim.recycleActor(b), b);
}

// ---------------------------------------------------------------------------
// Proc / spell actors (AE7 bullets, AE575 WT actors, AE114 thrown actors,
// summoned pets). Every RNG draw follows the source order.
// ---------------------------------------------------------------------------
const _DEG = 57.29577951308402;
function _atan2deg(y, x) { return _DEG * Math.atan2(y, x); }
// atan2convert (RunCodeOfTypeXforThingY): t >= 0 ? 360 - t : -t.
function _atan2convert(t) { return t >= 0 ? 360 - t : -t; }
// Stencyl setVelocity(angleDeg, speed).
function _setVel(b, deg, speed) { const r = deg / _DEG; b.vx = speed * Math.cos(r); b.vy = speed * Math.sin(r); }
// MonsterAlive[i + 1] quirk: the flag of the monster whose ID is list index + 1.
function _byId(sim) { const m = new Map(); for (const x of sim.monsters) if (!x.recycled) m.set(x.id, x); return m; }
function _aliveAt(byId, i) { return byId.get(i + 1)?.alive === 1; }
function _noArc(m) { return !_hasStatus(m, 'StatusArc0') && !_hasStatus(m, 'StatusArc1') && !_hasStatus(m, 'StatusArc2'); }
function _low216(sim, m) { return Number(sim.mapIdx) === 216 && _myc(m) > 950; }
function _dmgType(sim, m) { return !(NonDMGLinemonsterTypes || []).includes(String(sim.world.getDef(sim, m.type)?.Type || 'Monster')); }
function _recycleIn(sim, b, ms) { sim.later(ms, () => sim.recycleActor(b), b); }
function _setXc(b, xc) { b.x = xc - b.width / 2; }
// Purely visual effect actor (WT3 explosion, WT5 splash, WT28 root, ...).
function _cosmetic(sim, anim, skill, x, y, life) { const b = _spawnBullet(sim, anim, skill, x, y); _recycleIn(sim, b, life); return b; }

// ---------------------------------------------------------------------------
// Buff fx — actor 209 (ActorEvents_209, src 71196-71370). createRecycledActor
// runs init synchronously, so gameplay side effects (Cauldron cooldown, Gift,
// Print and dice RNG) occur in CastAttackofID1 order.
// ---------------------------------------------------------------------------
const BF_NO_RECYCLE = new Set(['Dice', 'DivPray', 'Wraith', 'Arcanist', 'Fire']);
// Updating: `frame X → setCurrentFrame(Y)` loops (cosmetic).
const BF_FRAME_LOOPS = { Qnew: [31, 16], PotChoice: [7, 3], Worm: [4, 0], Tempest: [15, 10] };
// [Xoffset, Yoffset, fade-at ms, fade seconds]
const BF_LAYOUT = {
  Log: [0, -52, 890, 0.3], Pig: [25, -53, 820, 0.3], Doubler: [20, -58, 2300, 0.3], Tempest: [24, 36],
  Soul: [26, -72], Ref: [37, -62, 880, 0.4], Bag: [37, -56, 1250, 0.3], Wall: [36, 6, 1300, 0.5],
  Wolf: [36, -75, 1000, 0.35], DungFail: [24, -51, 2900, 0.35], DungPass: [15, -50, 3650, 0.35],
  DungWazam: [15, -50, 3350, 0.35], DungPort: [-48, -54, 3350, 1.35], Print: [22, -69, 1000, 0.35],
  MPHP: [36, -45, 1400, 0.35], Gift: [34, -48, 890, 0.4], Shout: [19, -52, 1200, 0.25],
  Tongue: [30, -52, 1500, 0.25], PotChoice: [37, -44], Zombie: [37, -44, 1700, 0.25],
  Heart: [37, -44, 1200, 0.2], Range: [37, -44, 1200, 0.5], Cauldron: [28, -83, 1300, 0.2],
  Fire: [34, -5], ROLL_DA_DICE: [24, -57, 2140, 0.3], Worm: [23, -66, 1700, 0.2],
  Qnew: [7, -54], Qnew2: [7, -73], TT1: [7, -70], Tele: [0, 14],
};
const GIFT_TABLE = [[4, 'ResetFrag'], [10, 'Timecandy1'], [13, 'Timecandy2'], [14.5, 'Timecandy3'], [15, 'Timecandy4'],
  [30, 'FoodPotYe2'], [40, 'ExpBalloon1'], [46, 'ExpBalloon2'], [Infinity, 'PremiumGem']];

function _expoOut(t) { return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t); }
function _tweenAt(tw, t) {
  const u = tw.ms > 0 ? Math.max(0, Math.min(1, (t - tw.t0) / tw.ms)) : 1;
  return tw.from + (tw.to - tw.from) * (tw.ease === 'expoOut' ? _expoOut(u) : u);
}

function _buffFx(sim, ani, skill) {
  const p = sim.player, key = 'BF' + ani;
  const scale = ani === 'Qnew' || ani === 'Qnew2' || ani === 'TT1' ? 1 : ani === 'Tempest' ? 3 : 2;
  const b = _spawnBullet(sim, key, skill, 0, 0, { scale, xOff: 0, yOff: 0, yTw: null });
  const follow = () => {
    const yo = b.yTw ? _tweenAt(b.yTw, sim.timeMs) : b.yOff;
    b.x = p.dir === 1 ? p.x + b.xOff : p.x - 5 + b.xOff;
    b.y = p.y + yo;
  };
  b.onFrame = follow;
  const ms = BULLET_ANIMS[key]?.ms || [];
  if (!BF_NO_RECYCLE.has(ani)) _recycleIn(sim, b, ms.reduce((a, x) => a + N(x), 0));
  const loop = BF_FRAME_LOOPS[ani];
  if (loop) {
    let at = 0;
    for (let f = 0; f < loop[0] && f < ms.length; f++) at += N(ms[f]);
    sim.later(at, () => _playFrames(sim, b, loop[1], loop[0] - 1, loop[1]), b);
  }
  const L = BF_LAYOUT[ani];
  if (L) { b.xOff = L[0]; b.yOff = L[1]; if (L[2] != null) sim.later(L[2], () => _fade(sim, b, 0, 1000 * L[3]), b); }
  if (ani === 'Vman') {
    b.xOff = 29; b.yOff = -40;
    b.yTw = { from: -40, to: -56, t0: sim.timeMs, ms: 1200, ease: 'expoOut' };
  } else if (ani === 'Wraith') {
    b.alpha = 0; _fade(sim, b, 1, 400);
    b.xOff = 0; b.yOff = -65;
    b.yTw = { from: -65, to: -75, t0: sim.timeMs, ms: 2000 };
    sim.later(1800, () => _fade(sim, b, 0, 600), b);
    _recycleIn(sim, b, 2500);
  } else if (ani === 'Arcanist') {
    b.alpha = 0; _fade(sim, b, 1, 150);
    b.xOff = 20; b.yOff = -95;
    _recycleIn(sim, b, 8000);
  } else if (ani === 'Print') {
    // TimeAway.Printer -= 3601*TN(1,32) is a non-combat save edit.
    sim.later(420, () => {
      if (Math.min(TN(sim, 2, 32), 70) > sim.rng.randomFloatBetween(0.05, 100)) sim.state.attackCooldowns['32'] = 1;
    }, b);
  } else if (ani === 'Gift') {
    sim.later(450, () => {
      const rng = sim.rng, r = rng.randomFloatBetween(0, 100);
      const item = GIFT_TABLE.find((g) => r < g[0])[1];
      const count = rng.randomFloatBetween(0, 100) < 20 ? 2 : 1;
      // DropSomething writes DummyNumber = 1, so only the first drop sees itemM = count - 1.
      let dn = count;
      for (let i = 0; i < count; i++) {
        sim.rewards.dropSomething(sim, item, 1, 0, i, Math.round(dn - 1), p.node, 0, _xc(p) - 16, 'skill25');
        dn = 1;
      }
      if (TN(sim, 1, 25) > rng.randomFloatBetween(0.05, 100)) sim.state.attackCooldowns['25'] = 1;
    }, b);
  } else if (ani === 'PotChoice') {
    sim.later(8000, () => Object.assign(b, { frame: 8, frT: null }), b);
  } else if (ani === 'Cauldron') {
    const cd = sim.state.attackCooldowns;
    cd['490'] = N(cd['490']) * Math.max(1 - N(_v(sim).alchemyActive) / 100, 0.2);
  } else if (ani === 'Fire') {
    b.alpha = 0.6;
    sim.later(100, () => { b.scaleTw = { from: _scaleAt(b, sim.timeMs), to: 4, t0: sim.timeMs, ms: 200000 }; }, b);
    sim.every(500, () => { if (!(_buffBonus(sim, 135) > 0)) sim.recycleActor(b); }, b);
  } else if (ani === 'ROLL_DA_DICE') {
    sim.later(1040, () => {
      const rng = sim.rng, cap = TN(sim, 1, 623);
      const roll = cap <= 100 ? rng.randomInt(1, 1e4) : rng.randomInt(1, cap | 0);
      sim.state.diceRoll = roll;
      if (roll < 1.5) sim.rewards.dropSomething(sim, 'Trophy5', 1, 0, 0, 0, p.node, 0, _xc(p) - 16, 'skill623');
      _dmgNumber(sim);
      sim.emit('diceRoll', { roll, t: sim.timeMs });
    }, b);
  } else if (ani === 'Worm') {
    if (N(p.actionTimer) <= -N(_v(sim).fishingSpeed) + 0.7 && p.animation === '7') sim.later(300, () => Object.assign(b, { frame: 5, frT: null }), b);
  }
  follow();
  return b;
}
// growTo tween state (mirrored by combat-sim-core's snapshot).
function _scaleAt(b, t) {
  const s = b.scaleTw;
  if (!s) return b.scale ?? null;
  return s.from + (s.to - s.from) * (s.ms > 0 ? Math.max(0, Math.min(1, (t - s.t0) / s.ms)) : 1);
}
// AE7 "follow the target" velocity copies at the listed offsets.
function _follow(sim, b, t, offsets) { for (const ms of offsets) sim.later(ms, () => { b.vx = N(t.vx); }, b); }

// Anim 8 — Arrow Rain hit marker (286 / bow proc 287).
function _anim8(sim, t, x, y, skill) {
  const rng = sim.rng;
  const L0 = 20 * rng.randomInt(0, 18), L1 = 1.1 * t.height;
  const b = _spawnBullet(sim, 8, skill, Math.round(x - L1 * Math.cos(L0 / _DEG)), Math.round(y - L1 * Math.sin(L0 / _DEG)));
  sim.later(720, () => createDmgPixel(sim, t, [Math.max(TN(sim, 2, 286), 20) / 100], 1, 'skill' + skill), b);
  _recycleIn(sim, b, 1050);
  return b;
}

// Anim 12 (450) — follows the target, hits it once at 400 ms.
function _anim12(sim, t, x, y) {
  const b = _spawnBullet(sim, 12, 450, x, y);
  _follow(sim, b, t, [0, 250, 500]);
  sim.later(400, () => createDmgPixel(sim, t, [TN(sim, 1, 450) / 100], 1, 'skill450'), b);
  _recycleIn(sim, b, 1200);
}

// Anim 13 (91) — same-node area, VaultUpg 7 adds targets and doubles reach at 2.
function _anim13(sim, x, y) {
  const b = _spawnBullet(sim, 13, 91, x, y);
  const v7 = N(_v(sim).vaultUpg7);
  const MA = TN(sim, 2, 91) + v7, R = v7 === 2 ? 192 : 96;
  sim.later(240, () => {
    let hits = 0;
    for (const m of sim.world.monsters(sim)) {
      if (!(hits < MA)) break;
      if (m.alive === 1 && m.node === sim.player.node && Math.abs(_bxc(b) - _mxc(m)) < R && m.hp > 0) {
        hits++;
        createDmgPixel(sim, m, [TN(sim, 1, 91) / 100], 1, 'skill91');
      }
    }
  }, b);
  _recycleIn(sim, b, 700);
}

// Anim 21 (481) — healing totem: heals the player and pulses its cast node.
function _anim21(sim, x, y, node) {
  const b = _spawnBullet(sim, 21, 481, x, y);
  const t1 = TN(sim, 1, 481);
  for (let o = 0; o < 30; o++) {
    sim.later(200 + 1100 * o, () => {
      const p = sim.player;
      if (Math.abs(_bxc(b) - _xc(p)) < 26) p.hp = Math.min(p.hp + (1 + Math.pow(t1 / 100, 0.32)) / 100 * p.hpMax, p.hpMax);
      const mult = Math.max(0.1, Math.min(0.1 + 0.25 * Math.pow(t1 / 100, 0.8), 1.25));
      for (const m of sim.world.monsters(sim)) {
        if (m.node === node && m.alive === 1 && m.hp > 0 && Math.abs(_bxc(b) - _mxc(m)) < 25 + m.width / 2 && _noArc(m)) {
          createDmgPixel(sim, m, [mult], 1, 'skill481');
        }
      }
    }, b);
  }
  _recycleIn(sim, b, 1000 * (2 + Math.pow(t1 / 13, 0.6)) + 200);
}

// Anim 22 (482) — bouncing skull. With T587 it patrols the cast node instead.
function _anim22(sim, x, y, dir) {
  const p = sim.player, rng = sim.rng;
  const t587 = TN(sim, 1, 587);
  const b = _spawnBullet(sim, 22, 482, x, y, { dir });
  let dmage = TN(sim, 2, 482), MA = dir, DN1 = -1, LIST0 = -1;
  b.vx = 15 * MA; b.vy = -10;
  if (t587 >= 1) { DN1 = p.node; b.y += rng.randomInt(0, 33); b.vy = 0; dmage = 100; }
  _playFrames(sim, b, 0, 15, DN1 === -1 ? 0 : 8);
  b.frLoop = false;
  for (let o = 0; o < 320; o++) {
    sim.later(50 * o, () => {
      const frame = _segFrame(b, sim.timeMs);
      if (frame === 7 || frame === 15) _playFrames(sim, b, 0, 15, frame === 7 ? 0 : 8);
    }, b);
  }
  const ticks = Math.ceil(70 * (1 + t587 / 100));
  for (let o = 0; o < ticks; o++) {
    sim.later(100 + 100 * o, () => {
      if (DN1 === -1) b.vy += 4;
      if (dmage > 0) {
        const list = sim.world.monsters(sim);
        for (let i = 0; i < list.length; i++) {
          const m = list[i];
          if (i === LIST0 || !hitscanning(sim, m, _bxc(b) + 20, _byc(b) + 20, 40) || !(DN1 !== -1 || _noArc(m))) continue;
          LIST0 = i;
          b.x += 3 * MA;
          if (DN1 === -1) { b.vx = -b.vx; MA *= -1; b.dir = MA; sim.later(350, () => { LIST0 = -1; }, b); }
          else sim.later(150, () => { LIST0 = -1; }, b);
          createDmgPixel(sim, m, [TN(sim, 1, 482) / 100], 1, 'skill482');
          dmage--;
          if (dmage <= 0) _recycleIn(sim, b, 400);
          break;
        }
      }
      if (DN1 !== -1) {
        const nd = _node(sim, DN1), xc = _bxc(b);
        if (xc < N(nd.x) || xc > N(nd.length)) {
          _setXc(b, xc >= N(nd.length) ? N(nd.length) - 1 : N(nd.x) - 1);
          b.vx = -b.vx; MA *= -1; b.dir = MA;
        }
      }
    }, b);
  }
  if (DN1 === -1) {
    for (let o = 0; o < 70; o++) {
      sim.later(90 + 90 * o, () => {
        if (!(b.vy > 0)) return;
        for (let s = 0; s < _nodeCount(sim); s++) {
          const nd = _node(sim, s), xc = _bxc(b);
          if (xc >= N(nd.x) && xc <= N(nd.length) && b.y + 40 <= N(nd.y) && b.y + 40 + b.vy >= N(nd.y)) {
            b.y = N(nd.y) - 46;
            b.vy = Math.min(-b.vy, -12);
          }
        }
      }, b);
    }
  }
  sim.later(6000 * (DN1 !== -1 ? 1 + t587 / 100 : 1), () => { if (dmage > 0) _recycleIn(sim, b, 400); }, b);
}

// Anim 26 (300) — same-height cone; damage splits as count^1.35.
function _anim26(sim, x, y, dir) {
  const b = _spawnBullet(sim, 26, 300, x, y, { dir });
  sim.later(720, () => {
    const list = sim.world.monsters(sim), byId = _byId(sim);
    const py = N(_node(sim, sim.player.node)?.y);
    const ok = (m, i) => _aliveAt(byId, i) && Math.abs(py - N(_node(sim, m.node)?.y)) < 10
      && ((dir === -1 && _bxc(b) > _mxc(m)) || (dir === 1 && _bxc(b) < _mxc(m))) && m.hp > 0;
    let MA = 0;
    for (let i = 0; i < list.length; i++) if (ok(list[i], i)) MA++;
    if (MA > 1) MA++;
    for (let i = 0; i < list.length; i++) {
      if (ok(list[i], i)) createDmgPixel(sim, list[i], [TN(sim, 1, 300) / 100 / Math.pow(Math.max(MA, 1), 1.35)], 1, 'skill300');
    }
  }, b);
  _recycleIn(sim, b, 1120);
}

// Anim 27 (301) — bear trap: arms after 80 ms, snaps on contact (2 victims max).
function _anim27(sim, x, y) {
  const b = _spawnBullet(sim, 27, 301, x, y);
  let dmage = 0;
  sim.later(80, () => { dmage = 1; }, b);
  sim.every(100, () => {
    if (dmage !== 1) return;
    for (const m of sim.world.monsters(sim)) {
      const h = N(sim.world.getDef(sim, m.type)?.HeightOfMonster);
      if (!hitscanning(sim, m, _bxc(b), _byc(b) - h / 1.5, 44)) continue;
      if (dmage < 3) createDmgPixel(sim, m, [TN(sim, 2, 301) / 100], 1, 'skill301');
      if (dmage === 1) _recycleIn(sim, b, 1700);
      dmage += 1.1;
    }
  }, b);
  sim.later(30000, () => { if (dmage === 1) { dmage = 4; _recycleIn(sim, b, 1700); } }, b);
}

// Anim 29 (466) — delayed ground burst, four hits.
function _anim29(sim, x, y, D) {
  const b = _spawnBullet(sim, 29, 466, x, y);
  sim.later(500 * D + 500, () => {
    let DD = 0;
    for (const m of sim.world.monsters(sim)) {
      if (!(DD < 4)) break;
      if (hitscanning(sim, m, _bxc(b), _byc(b), 50)) { DD += 1.1; createDmgPixel(sim, m, [Math.max(20, TN(sim, 2, 466)) / 100], 1, 'skill466'); }
    }
  }, b);
  _recycleIn(sim, b, 500 * D + 1600);
}

// Anim 30 (465) — freezes nearby monsters, hits the target three times.
function _anim30(sim, t, x, y) {
  const PD = sim.player.dir === 1 ? 1 : 0;
  const b = _spawnBullet(sim, 30, 465, x - 20 * PD, y);
  sim.later(350, () => {
    let hits = 0;
    for (const m of sim.world.monsters(sim)) {
      if (!(hits < 8)) break;
      if (!hitscanning(sim, m, _bxc(b) + 20, _byc(b) + 20, 70)) continue;
      if (m === t) { hits++; createDmgPixel(sim, t, [TN(sim, 1, 465) / 100], 3, 'skill465'); }
      m.vx = m.vx > 0 ? Math.ceil(0.6 * m.vx) : Math.floor(0.6 * m.vx);
      m.moveSpeed = m.vx;
      if (!_hasStatus(m, 'StatusMultiCombat')) sim.world.addStatusToMonster(sim, m, 'StatusFreeze', 10);
    }
  }, b);
  _recycleIn(sim, b, 1130);
}

// Anim 31 (467) — wandering tornado on the cast node.
function _anim31(sim, x, y, dir, node) {
  const rng = sim.rng;
  const b = _spawnBullet(sim, 31, 467, x, y, { dir, vx: 10 * dir });
  for (let o = 0; o < 200; o++) {
    sim.later(200 + 100 * o, () => {
      for (const m of sim.world.monsters(sim)) {
        if (hitscanning(sim, m, _bxc(b), _byc(b), 50)) { createDmgPixel(sim, m, [Math.max(10, TN(sim, 1, 467)) / 100], 1, 'skill467'); break; }
      }
    }, b);
    sim.later(950 + 400 * o, () => {
      if (rng.randomFloat() < 0.16) b.vx = -b.vx * rng.randomFloatBetween(0.9, 1.25);
      else {
        const nd = _node(sim, node), xc = _bxc(b);
        if (xc < N(nd.x) + 10) { _setXc(b, N(nd.x) + 10); b.vx = -b.vx; }
        else if (xc > N(nd.length) - 20) { _setXc(b, N(nd.length) - 20); b.vx = -b.vx; }
      }
    }, b);
  }
  _recycleIn(sim, b, 1000 * Math.max(TN(sim, 2, 467), 0.2) + 400);
}

// Anims 33 (316 shard) / 34 (360 bomb): the first contact bounces and hits;
// anim 34 also explodes for up to five nearby monsters.
function _anim3334(sim, anim, x, y, DD) {
  const rng = sim.rng, sgn = 2 * DD - 1;
  const b = _spawnBullet(sim, anim, anim === 33 ? 316 : 360, x, y, { dir: sgn, vx: (anim === 33 ? 20 : 8) * sgn });
  if (anim === 33) b.vy = rng.randomFloatBetween(-0.8, 0.8);
  _recycleIn(sim, b, anim === 33 ? 5000 : 7000);
  let crit = 0;
  sim.every(100, () => {
    if (crit !== 0) return;
    const list = sim.world.monsters(sim);
    for (const m of list) {
      if (!hitscanning(sim, m, _bxc(b), _byc(b), 30)) continue;
      if (anim === 34) {
        _cosmetic(sim, 'WT3', 360, b.x - 20, b.y - 3, 700);
        let n = 0;
        for (const o of list) {
          if (n >= 5) break;
          if (o.alive === 1 && N(o.pet) === 0 && Math.abs(_myc(o) - _byc(b)) < 65 && distanceEqn(_mxc(o), _myc(o), _bxc(b), _byc(b)) < 150) {
            createDmgPixel(sim, o, [1], 1, 'skill360');
            n++;
          }
        }
      }
      b.vx *= -0.33;
      b.vy = rng.randomInt(-5, -7);
      crit = 1;
      createDmgPixel(sim, m, [TN(sim, 1, anim === 34 ? 360 : 316) / 100], 1, anim === 34 ? 'skill360' : 'skill316');
      _recycleIn(sim, b, 560);
      break;
    }
  }, b);
}

// Anim 35 (496) — per-monster strike that follows its monster.
function _anim35(sim, m, x, y) {
  const b = _spawnBullet(sim, 35, 496, x, y);
  _follow(sim, b, m, [0, 250, 500]);
  sim.later(300, () => createDmgPixel(sim, m, [TN(sim, 1, 496) / 100], 1, 'skill496'), b);
  _recycleIn(sim, b, 1000);
}

// AE7 anim 100 (T106/T197 axe) and 104 (Pet5 cheese). 2x2 code-drawn box;
// MA is the throw direction (Pet5: randomFloatBetween(-1.5, 1.5)).
function _axe(sim, anim, x, y, MA) {
  const rng = sim.rng, w104 = anim === 104;
  const skill = w104 ? 363 : 106;
  const b = _spawnBullet(sim, anim, skill, x, y, { dir: MA >= 0 ? 1 : -1, img: w104 ? 'CheeseChip' : 'AxeToss', angle: 0 });
  b.vx = 10 * MA; b.vy = w104 ? -23 : -30;
  for (let o = 0; o < 17; o++) sim.later(140 * (o + 1), () => { b.vy += 6; }, b);
  for (const ms of [560, 700, 840, 980]) sim.later(ms, () => { b.vy += 2; }, b);
  const t197 = w104 ? 0 : TN(sim, 1, 197);
  if (!w104 && t197 > 0) {
    b.vx = MA * rng.randomInt(8, 23);
    b.vy = rng.randomInt(-15, -46);
    b.img = 'AxeTossB';
  }
  // Attached at (0,0), OriginCentered, then anim 100 sets width 100*MA (x1+T197/100 height/width).
  Object.assign(b, _originCentered(b.img), { imgOffX: 0, imgOffY: 0,
    imgSX: w104 ? 1 : MA * (t197 > 0 ? 1 + t197 / 100 : 1), imgSY: t197 > 0 ? 1 + t197 / 100 : 1 });
  const t0 = sim.timeMs;
  b.onFrame = () => { b.angle = 3600 * MA * Math.min(1, (sim.timeMs - t0) / 5000); };
  sim.later(4000, () => _fade(sim, b, 0, 300), b);
  _recycleIn(sim, b, 4300);
  const list = b.hitList;
  for (let o = 0; o < 30; o++) {
    sim.later(150 * (o + 1), () => {
      const R = Math.round(60 * (1 + TN(sim, 1, 197) / 100));
      for (const m of sim.world.monsters(sim)) {
        if (list.includes(m) || !hitscanning(sim, m, _bxc(b) + 20, _byc(b) + 20, R)) continue;
        if (!(list.length <= TN(sim, 2, 106) + TN(sim, 2, 197) || (w104 && list.length <= 3))) continue;
        createDmgPixel(sim, m, [TN(sim, 1, w104 ? 363 : 106) / 100], 1, 'skill' + skill);
        list.push(m);
      }
    }, b);
  }
  return b;
}

// AE7 anim 101 (285) — homing arrow (src 98020-98064).
function _homingArrow(sim, D) {
  const p = sim.player, rng = sim.rng;
  const b = _spawnBullet(sim, 101, 285, _xc(p) - 36, p.y - 60, Object.assign({ img: 'ArrowHM', alpha: 0, angle: 0, imgOffX: 0, imgOffY: 0 }, _originCentered('ArrowHM')));
  sim.later(400 * (D + 1), () => {
    _fade(sim, b, 1, 150); b.angle = 270; _setVel(b, 270, 9);
    sim.later(300, () => {
      let target = null, best = 425 + _buffBonus(sim, 288, 1);
      const list = sim.world.monsters(sim), byId = _byId(sim);
      for (let o = 0; o < list.length; o++) {
        const m = list[o];
        if (!(m.hp > 0 && _aliveAt(byId, o) && _dmgType(sim, m)) || _low216(sim, m)) continue;
        const d = Math.round(distanceEqn(_bxc(b), _byc(b), _mxc(m), _myc(m)));
        if (d < best) { best = d; target = m; }
      }
      const L = [270, target ? 90 - _atan2deg(_byc(b) - _myc(target), _mxc(target) - _bxc(b)) : 200];
      b.angle = L[0];
      for (let t = 0; t < 25; t++) {
        sim.later(20 * (t + 1), () => {
          const ang = t <= 19
            ? L[0] + (t + 1) / 17 * L[1]
            : L[0] + (t - 19 + 2 * (t - 20) - 4 * Math.floor(t / 23) * (t - 22)) / 5 * L[1];
          b.angle = Math.round(ang);
          _setVel(b, ang, 15 + 2 * t);
          if (t === 19) {
            L[0] = b.angle;
            const m360 = L[0] - 360 * Math.floor(L[0] / 360);
            L[1] = target
              ? 17 + _atan2convert(Math.round(_atan2deg(_byc(b) - _myc(target), _mxc(target) - _bxc(b)))) - m360
              : rng.randomInt(115, 155) - m360;
            if (Math.abs(L[1]) > 180) L[1] = L[1] > 0 ? 360 - L[1] : 360 + L[1];
          }
        }, b);
      }
      if (target) {
        sim.later(500, () => {
          const d = distanceEqn(_bxc(b), _byc(b), _mxc(target), _myc(target));
          const delay = d < 40 ? 0.01 : Math.floor(d / 6.5) / 100 - 0.04;
          sim.later(1000 * delay, () => {
            createDmgPixel(sim, target, [TN(sim, 2, 285) / 100], 1, 'skill285');
            sim.recycleActor(b);
          }, b);
        }, b);
      } else {
        sim.later(1000, () => { _fade(sim, b, 0, 200); _recycleIn(sim, b, 200); }, b);
      }
    }, b);
  }, b);
  return b;
}

// AE114 Bow2 — the ballista body drawn behind each bolt (src 64067 frame, 64137-64147 init).
// Purely visual: AttackBow(B) with origin (18,42), attached at (-16,-44) when its aim point
// moves, stretched to round(200 + N2/2.05)% x floor(200 - N2/3.25)%; at 1200 ms it fades
// over 250 ms, pulses to 120x250% (60 ms expoOut) then 200x200% (80 ms quadIn), recycles at 250 ms.
const _EASE = { expoOut: (k) => (k >= 1 ? 1 : 1 - Math.pow(2, -10 * k)), quadIn: (k) => k * k };
function _ballistaBow(sim, x, y, id, ang, DN3, blue) {
  const b = _spawnBullet(sim, 'Bow2', id, x, y, { width: 2, height: 2, img: blue ? 'AttackBowB' : 'AttackBow', angle: ang,
    alpha: 0, imgOX: 18, imgOY: 42, imgSX: 2, imgSY: 2, imgOffX: -16, imgOffY: -44 });
  const S = { N0: x, N1: y, N6: x, N7: y, active: -1, grow: null };
  sim.later(300 * DN3, () => sim.every(20, () => { S.N6 += 3 * Math.cos(ang / _DEG); S.N7 += 3 * Math.sin(ang / _DEG); }, b), b);
  const grow = (w, h, ms, ease) => { S.grow = { w0: b.imgSX, h0: b.imgSY, w: w / 100, h: h / 100, t0: sim.timeMs, ms, ease }; };
  b.onFrame = () => {
    if (S.active !== 0) {
      const d3 = Math.max(-120, Math.min(120, S.N6 - S.N0)), d4 = Math.max(-120, Math.min(120, S.N7 - S.N1));
      const a3 = Math.abs(d3), a4 = Math.abs(d4), m = Math.max(a3, a4) + Math.min(a3, a4) / 2;
      if (S.active === -1 && m > 2) { S.active = 1; _fade(sim, b, 1, 150); }
      if (S.active === 1) {
        const N2 = Math.min(113, m);
        b.angle = _atan2deg(d4, d3);
        b.imgSX = Math.round(200 + N2 / 2.05) / 100;
        b.imgSY = Math.floor(200 - N2 / 3.25) / 100;
      }
    } else if (S.grow) {
      const g = S.grow, k = g.ease(Math.min(1, (sim.timeMs - g.t0) / g.ms));
      b.imgSX = g.w0 + (g.w - g.w0) * k;
      b.imgSY = g.h0 + (g.h - g.h0) * k;
    }
  };
  sim.later(1200, () => {
    S.active = 0;
    _fade(sim, b, 0, 250);
    grow(120, 250, 60, _EASE.expoOut);
    sim.later(60, () => grow(200, 200, 80, _EASE.quadIn), b);
    _recycleIn(sim, b, 250);
  }, b);
  return b;
}

// AE114 Arrow2 — ballista bolt (315 / bow-swing 3150).
function _ballista(sim, id) {
  const p = sim.player, rng = sim.rng;
  const PD = p.dir === 1 ? 1 : 0, dir = _sgn(p);
  const t422 = TN(sim, 1, 422);
  const DN4 = id === 315 && t422 > 0.1 ? 3 : 1;
  for (let r = 0; r < DN4; r++) {
    const DN3 = r === 0 ? 1 : r === 1 ? (PD === 1 ? 0 : 2) : (PD === 0 ? 0 : 2);
    // src 67448: the 65..115 reroll happens only for single-bolt casts.
    let ang = 20 * DN3 + 65 + rng.randomInt(85, 95) + 180 * (1 - PD);
    if (DN4 === 1) ang = 20 * DN3 + 65 + (rng.randomInt(65, 115) + 180 * (1 - PD));
    _ballistaBow(sim, p.x + 37 + 75 * dir, PD === 0 ? p.y - 15 - 20 * (DN3 - 2) : p.y - 15 + 20 * DN3, id, ang, DN3, t422 > 0.1);
    const x = p.x + 37 + 75 * dir + 30;
    const y = PD === 0 ? p.y - 30 - 20 * (DN3 - 2) : p.y - 30 + 20 * DN3;
    const b = _spawnBullet(sim, 'Arrow2', id, x, y, { width: 2, height: 2, img: t422 > 0.1 ? 'AttackArrowB' : 'AttackArrow', angle: ang,
      alpha: 0, imgOX: 77, imgOY: 8, imgSX: 2, imgSY: 2, imgOffX: 0, imgOffY: 0 });
    const S = { N0: x, N1: y, N11: x, N12: y, N2: 0, N5: ang, N8: 0, N9: 0, hits: 0, max: TN(sim, 2, 315), active: -1 };
    sim.later(300 * DN3, () => sim.every(20, () => { S.N11 += 3 * Math.cos(ang / _DEG); S.N12 += 3 * Math.sin(ang / _DEG); }, b), b);
    b.onFrame = () => {
      if (S.active === -1) {
        const d3 = Math.max(-120, Math.min(120, S.N11 - S.N0)), d4 = Math.max(-120, Math.min(120, S.N12 - S.N1));
        const a3 = Math.abs(d3), a4 = Math.abs(d4);
        if (Math.max(a3, a4) + Math.min(a3, a4) / 2 > 2) { S.active = 1; _fade(sim, b, 1, 150); }
      }
      if (S.active === 1) {
        const d3 = S.N11 - S.N0, d4 = S.N12 - S.N1, a3 = Math.abs(d3), a4 = Math.abs(d4);
        S.N2 = Math.min(113, Math.max(a3, a4) + Math.min(a3, a4) / 2);
        S.N5 = _atan2deg(d4, d3);
        b.angle = S.N5;
        b.imgOffX = Math.cos(S.N5 / _DEG) * S.N2 - 106;
        b.imgOffY = Math.sin(S.N5 / _DEG) * S.N2 + 2;
      } else if (S.active === 0 && S.hits < S.max) {
        const list = sim.world.monsters(sim), byId = _byId(sim);
        for (let i = 0; i < list.length; i++) {
          const m = list[i];
          if (b.hitList.includes(m) || !_aliveAt(byId, i)) continue;
          const hx = b.x + S.N8, hy = b.y + S.N9;
          if (hx > m.x - 40 && hx < m.x + m.width + 40 && hy > m.y - 45 && hy < m.y + m.height + 45 && !_low216(sim, m)) {
            S.hits++;
            createDmgPixel(sim, m, [TN(sim, 1, 315) / 100], 1, 'skill' + id);
            b.hitList.push(m);
          }
        }
      }
    };
    sim.later(1200, () => {
      S.active = 0;
      _setVel(b, S.N5 + 180, Math.round(0.55 * (S.N2 + 55)));
      S.N8 = Math.cos((S.N5 + 180) / _DEG) * (150 - S.N2);
      S.N9 = Math.sin((S.N5 + 180) / _DEG) * (150 - S.N2);
      sim.later(1000, () => _fade(sim, b, 0, 250), b);
      _recycleIn(sim, b, 1250);
    }, b);
  }
}

// AE114 FireBomb (317) / PoisonVial (525): lobbed, lands on the first node below.
function _throwVial(sim, kind) {
  const p = sim.player, rng = sim.rng;
  const fire = kind === 'FireBomb';
  const b = _spawnBullet(sim, 114, fire ? 317 : 525, _xc(p), _yc(p) - 22, { width: 2, height: 2, img: kind, imgOffX: -20, imgOffY: -20 });
  b.vx = 8 * rng.randomInt(-3, 3);
  b.vy = -25 - 9 * rng.randomInt(1, 3);
  // spinImageBy(-/+1080 over 3 s) and fadeImageTo(0, .3) at tick 26 (src 64169-64171).
  const spin = b.vx > 0 ? -1080 : 1080, t0 = sim.timeMs;
  Object.assign(b, { angle: 0, imgOX: 0, imgOY: 0 });
  b.onFrameSpin = () => { b.angle = spin * Math.min(1, (sim.timeMs - t0) / 3000); };
  let active = 0;
  const pn = _node(sim, p.node);
  const Z = [p.node, N(pn.x), N(pn.length), N(pn.y)];
  for (let s = 0; s < 30; s++) {
    sim.later(50 + 100 * s, () => {
      if (s === 4) active = 1;
      if (s === 26) _fade(sim, b, 0, 300);
      b.vy += 7;
      if (s === 29) sim.recycleActor(b);
    }, b);
  }
  b.onFrame = () => {
    b.onFrameSpin();
    if (active === -1) return;
    for (let s = 0; s < _nodeCount(sim); s++) {
      const nd = _node(sim, s), ny = N(nd.y);
      if (b.x >= N(nd.x) && b.x <= N(nd.length) && b.y < ny && (ny < Z[3] || b.x >= Z[2] || b.x <= Z[1])) {
        Z[0] = s; Z[1] = N(nd.x); Z[2] = N(nd.length); Z[3] = ny;
      }
    }
    if (b.y + 8 > Z[3] && b.vy > 0) {
      b.y = Z[3] - 8;
      active = -1;
      if (!fire) {
        _cosmetic(sim, 'WT5', 525, b.x - 53, b.y - 23, 1100);
        _wt6(sim, b.x - 53, b.y - 15, 40, Z[0]);
      } else {
        _cosmetic(sim, 'WT3', 317, b.x - 53, b.y - 32, 700);
        const list = sim.world.monsters(sim), byId = _byId(sim);
        const cap = Math.ceil(TN(sim, 2, 317));
        let count = 0;
        for (let s = 0; s < list.length && count < cap; s++) {
          const m = list[s];
          if (_aliveAt(byId, s) && N(m.pet) === 0 && Math.abs(_myc(m) - _byc(b)) < 65 && distanceEqn(_mxc(m), _myc(m), _bxc(b), _byc(b)) < 150) {
            const hits = rng.randomInt(2, 3);
            createDmgPixel(sim, m, [TN(sim, 1, 317) / 250], hits, 'skill317');
            count++;
          }
        }
      }
      sim.recycleActor(b);
    }
  };
}

// AE575 WT1 (362) — falling strike locked onto one monster.
function _wt1(sim, m, x, y, node) {
  const rng = sim.rng;
  const b = _spawnBullet(sim, 'WT1', 362, x, y);
  for (const ms of [10, 90, 170, 250, 330]) sim.later(ms, () => { b.vy += 4; }, b);
  let done = false;
  sim.every(50, () => {
    if (done) return;
    const ny = N(_node(sim, node)?.y);
    if (b.y > ny - 36) {
      done = true;
      b.y = ny - 36; b.vy = 0;
      const hits = rng.randomInt(2, 3);
      createDmgPixel(sim, m, [TN(sim, 2, 362) / 100], hits, 'skill362');
      _recycleIn(sim, b, 700);
    }
  }, b);
}

// AE575 WT2 (137) — ground slam.
function _wt2(sim, x, y) {
  const b = _spawnBullet(sim, 'WT2', 137, x, y);
  sim.later(400, () => {
    let DD = 0;
    for (const m of sim.world.monsters(sim)) {
      if (!(DD < TN(sim, 2, 137))) break;
      if (m.alive === 1 && distanceEqn(_bxc(b), _byc(b) + 18, _mxc(m), _myc(m)) < 105 && m.hp > 0) {
        DD++;
        createDmgPixel(sim, m, [TN(sim, 1, 137) / 100], 1, 'skill137');
      }
    }
  }, b);
  _recycleIn(sim, b, 3000);
}

// AE575 WT4 (527) — consumes GenINFO[81] poison stacks for extra hits.
function _wt4(sim, t, x, y) {
  const b = _spawnBullet(sim, 'WT4', 527, x, y);
  _follow(sim, b, t, [0, 250]);
  sim.later(500, () => { b.vx = 0; }, b);
  sim.later(950, () => {
    const gi = sim.state.gi;
    createDmgPixel(sim, t, [TN(sim, 1, 527) / 100], Math.max(1, Math.min(10, Math.pow(N(gi[81]), 0.3))), 'skill527');
    gi[81] = 0;
  }, b);
  _recycleIn(sim, b, 1550);
}

// AE575 WT6 — poison cloud: stacks GenINFO[81] and StatusPoison.
function _wt6(sim, x, y, DN2, DN3) {
  const b = _spawnBullet(sim, 'WT6', 525, x, y);
  sim.every(2000, () => {
    const gi = sim.state.gi;
    for (const m of sim.world.monsters(sim)) {
      if (m.node === DN3 && N(m.pet) === 0 && m.alive === 1 && Math.abs(_bxc(b) - _mxc(m)) < 92 && _noArc(m)) {
        gi[81] = N(gi[81]) + 1;
        sim.world.addStatusToMonster(sim, m, 'StatusPoison', 10);
      }
    }
  }, b);
  _recycleIn(sim, b, 1000 * DN2 + 700);
}

// AE575 100 ms stack counters (src 88879-88900): while _DummyDistanceBEST == 1, WT9/13/16/18
// mirror GenINFO[79]/[83]/[125]/[132] into _DummyDistance, drawn as digit images above the totem.
function _trackCount(sim, b, idx) {
  sim.every(100, () => {
    const v = N(sim.state.gi[idx]);
    if (b.DDB === 1 && b._DD !== v) b._DD = v;
  }, b);
}

// AE575 WT9 (318) — spends GenINFO[79] charges on respawn-zero scans.
function _wt9(sim, x, y) {
  const b = _spawnBullet(sim, 'WT9', 318, x, y, { DDB: 1, _DD: 0 });
  sim.every(380, () => {
    const gi = sim.state.gi;
    if (b.DDB === 1 && N(gi[79]) > 0.5 && _respawnZeroScan(sim)) gi[79] = Math.max(0, Math.round(N(gi[79]) - 1));
  }, b);
  _trackCount(sim, b, 79);
  // runLater(1000 * DummyNumber2) fadeTo(0, 2) then runLater(2050): DDB = 0, GenINFO[77]
  // (the orb kill counter, literally index 77) = 0, recycle (src 89088-89095).
  sim.later(358000, () => {
    _fade(sim, b, 0, 2000);
    sim.later(2050, () => { b.DDB = 0; sim.state.gi[77] = 0; sim.recycleActor(b); }, b);
  }, b);
}

// AE575 WT10 (360) — launcher for the anim 34 bomb.
function _wt10(sim, x, y, dir, PD) {
  const b = _spawnBullet(sim, 'WT10', 360, x, y, { dir });
  sim.later(530, () => _anim3334(sim, 34, _bxc(b) - 10 + 38 * dir, _byc(b) - 17, PD), b);
  _recycleIn(sim, b, 920);
}

// AE575 WT11 (316) — fires ceil(max(1, T316_2)) anim 33 shards (src 89122).
function _wt11(sim, x, y, PD) {
  const b = _spawnBullet(sim, 'WT11', 316, x, y, { dir: 2 * PD - 1 });
  sim.later(510, () => {
    const n = Math.ceil(Math.max(1, TN(sim, 2, 316)));
    for (let k = 0; k < n; k++) {
      sim.later(1000 * (0.01 + 0.06 * k), () => _anim3334(sim, 33, _bxc(b) + 5 + 40 * (PD - 1), _byc(b) - 13, PD), b);
    }
  }, b);
  _recycleIn(sim, b, 3410);
}

// AE575 WT12 (495) — staggered meteor.
function _wt12(sim, x, y, idx, dir) {
  const rng = sim.rng;
  const b = _spawnBullet(sim, 'WT12', 495, x, y, { dir, hidden: true });
  const Num1 = rng.randomInt(2, 3);
  sim.later(1000 * (0.1 + 0.15 * idx), () => {
    b.hidden = false;
    sim.later(400, () => {
      for (const m of sim.world.monsters(sim)) {
        if (hitscanning(sim, m, _bxc(b) + 15 * Num1 * dir, _byc(b) - 20, 26 * Num1)) createDmgPixel(sim, m, [TN(sim, 1, 495) / 100], 1, 'skill495');
      }
      _recycleIn(sim, b, 1300);
    }, b);
  }, b);
}

// AE575 WT14 (497) — chaining orb (src 89134-89153).
function _wt14(sim, x, y, target) {
  const rng = sim.rng;
  const b = _spawnBullet(sim, 'WT14', 497, x, y);
  let tgt = target, DD = 0;
  const list = [];
  const fade = () => { tgt = null; _fade(sim, b, 0, 500); _recycleIn(sim, b, 500); };
  if (!tgt || _low216(sim, tgt)) {
    const a = rng.randomInt(0, 360);
    _setVel(b, a, 18); b.angle = 45 + a;
    _fade(sim, b, 0, 500); _recycleIn(sim, b, 500);
    return;
  }
  const steer = () => {
    const a = _atan2deg(_myc(tgt) - _byc(b), _mxc(tgt) - _bxc(b));
    _setVel(b, a, 23 + 0.7 * DD); b.angle = 45 + a;
  };
  { const a = _atan2deg(_myc(tgt) - _byc(b), _mxc(tgt) - _bxc(b)); _setVel(b, a, 21); b.angle = 45 + a; }
  sim.every(40, () => {
    if (!tgt) return;
    if (!(distanceEqn(_mxc(tgt), _myc(tgt), _bxc(b), _byc(b)) < 25)) { steer(); return; }
    createDmgPixel(sim, tgt, [TN(sim, 1, 497) / 100 * Math.pow(0.75 + 0.1 * N(_v(sim).talentEnh497), DD)], 1, 'skill497');
    list.push(tgt);
    if (!(DD < TN(sim, 2, 497) + 1)) { fade(); return; }
    if (list.length > 8) list.splice(0, 7);
    let best = 1e5;
    const mons = sim.world.monsters(sim);
    for (let i = 0; i < mons.length; i++) {
      const m = mons[i];
      if (hitscanning(sim, m, _bxc(b), _byc(b), 900) && !(list.includes(m) || _low216(sim, m))) {
        const d = distanceEqn(_bxc(b), _byc(b), _mxc(m), _myc(m));
        if (d < best) { best = d; tgt = m; }
      }
      if (i + 1 === mons.length) {
        DD += 1;
        steer();
        if (best === 1e5) fade();
      }
    }
  }, b);
}

// Summoned pets (PetSummonSpawn, AE1 init src 63794-63830).
function _petInit(sim, mon) {
  sim.later(100, () => { mon.persNum = -1; }, mon);
  sim.later(120000, () => { mon.hp = 0; }, mon);
  if (mon.type === 'Pet5') {
    sim.every(60 / Math.max(1, TN(sim, 1, 363)) * 1000, () => {
      if (mon.hp > 0) _axe(sim, 104, mon.x + 30, mon.y - 30, sim.rng.randomFloatBetween(-1.5, 1.5));
    }, mon);
  } else if (mon.type === 'pghost') {
    sim.every(1000, () => { mon.hp -= 1; }, mon);
    sim.every(2000, () => {
      if (sim.rng.randomInt(1, 3) === 3) _wt6(sim, _mxc(mon) - 20, mon.y + 21, 40, mon.node);
    }, mon);
    sim.every(8000, () => {
      if (Number(sim.mapIdx) === 216) return;
      const pn = sim.player.node;
      const n = Math.max(0, Math.min(_nodeCount(sim) - 1, sim.rng.randomInt((pn - 2) | 0, (pn + 2) | 0)));
      mon.node = n;
      const nd = _node(sim, n);
      _setXc(mon, sim.rng.randomInt((N(nd.x) + 40) | 0, (N(nd.length) - 40) | 0));
      const h = N(sim.world.getDef(sim, mon.type)?.HeightOfMonster);
      mon.y = N(nd.y) - h + (h - 50) / 2;
    }, mon);
  }
  sim.every(50, () => {
    if (!(mon.persNum === -1 && mon.alive === 1)) return;
    for (const m of sim.world.monsters(sim)) {
      if (!(N(m.pet) === 0 && m.node === mon.node && m !== mon && m.alive === 1 && Math.abs(_mxc(m) - _mxc(mon)) < 25)) continue;
      if (mon.type !== 'pghost' && mon.persNum === -1) {
        // src 63816: ActorEvents_10 at (xCenter, y-5) with dummyCritDmgMulti -1
        // ("_p" pet text, damage 1); its init skips sound and offset RNG.
        mon.hp -= 1;
        mon.petHitT = sim.timeMs; mon.petHitX = _mxc(mon); mon.petHitY = mon.y - 5;
        sim.emit('petHit', { uid: mon.uid, dmg: 1, x: mon.petHitX, y: mon.petHitY, t: sim.timeMs });
      }
      mon.persNum = 0.2;
      if (mon.type === 'Pet2') createDmgPixel(sim, m, [TN(sim, 2, 361) / 100], 1, 'skill361');
      else if (mon.type === 'pghost' && _hasStatus(m, 'StatusPoison')) createDmgPixel(sim, m, [TN(sim, 2, 526) / 100], 1, 'skill526');
    }
    if (mon.persNum === 0.2 && mon.hp > 0) {
      mon.persNum = 0.3;
      // src 63831-63853: non-pghost pets dip to alpha .6 for 150 ms at
      // 150 + 300k ms (k = 0..6), restored to 1 at 2200 ms; renderer-only.
      if (mon.type !== 'pghost') mon.flickerT = sim.timeMs;
      sim.later(2200, () => { mon.persNum = -1; }, mon);
    }
  }, mon);
}
function _summonPet(sim, type, hp, x) {
  return sim.world.createMonster(sim, type, sim.player.node, x, 'PetSummonSpawn', { pet: 4, hp, onInit: (mon) => _petInit(sim, mon) });
}
function _summonWithExtras(sim, type, hp, pad, spread) {
  const p = sim.player, rng = sim.rng;
  _summonPet(sim, type, hp, _xc(p));
  for (let r = 0; r < 2; r++) {
    if (rng.randomFloat() < TN(sim, 2, 424) / 100 - r) {
      const nd = _node(sim, p.node);
      const u = Math.max(N(nd.x) + pad, N(nd.length) - pad);
      const off = rng.randomInt(-spread, spread);
      _summonPet(sim, type, hp, Math.min(u, off + _xc(p)));
    }
  }
}

// ---------------------------------------------------------------------------
// CastAttackofID1 (AE148) — skill effects
// ---------------------------------------------------------------------------
export const SKILL_HANDLERS = {
  15: (sim, p) => _meleeArea(sim, 23, 15, p.x + 37 + 75 * _sgn(p), p.y + 15, _sgn(p)),
  90: (sim, p) => _meleeArea(sim, 10, 90, p.x + 37 + 30 * _sgn(p), p.y - 20, _sgn(p)),
  105: (sim, p) => _meleeArea(sim, 7, 105, p.x + 37 + 30 * _sgn(p), p.y - 50, _sgn(p)),
  120: (sim, p) => {
    const s = _sgn(p);
    const b = _meleeArea(sim, 24, 120, p.x + 37 + 40 * s, p.y + 10, s);
    sim.later(750, () => _pierceWave(sim, 25, 120, b.x + 35 + 35 * s, b.y + 25, s), b);
  },
  121: (sim, p) => _daggerang(sim, p.x + 10 + 10 * _sgn(p), p.y + 20, _sgn(p), 0, 121),
  136: (sim, p) => {
    if (!_buffActive(sim, 135)) return;
    const R = 400 * (1 + TN(sim, 2, 199) / 100);
    let n = 0;
    // src 67482: distance from the monster's top-left; map 216 yCenter > 950
    // excluded; no type check, so ores spend the 15-target cap. The per-target
    // anim-11 actor starts on frame 11, which the fireball damage gate skips.
    // Alive uses the MonsterAlive[r + 1] quirk; each hit sets dummyActor.
    const list = sim.world.monsters(sim), byId = _byId(sim);
    for (let r = 0; r < list.length; r++) {
      const m = list[r];
      if (n >= 15) break;
      if (_aliveAt(byId, r) && N(m.pet) === 0 && distanceEqn(m.x, m.y, _xc(p), _yc(p)) < R
        && !(Number(sim.mapIdx) === 216 && _myc(m) > 950)) {
        n++;
        sim.state.dummyActor = m;
        createDmgPixel(sim, m, [TN(sim, 1, 136) / 500], sim.rng.randomInt(4, 6), 'skill136');
      }
    }
  },
  165: (sim, p) => _disciple(sim, p, 165),
  168: (sim, p) => {
    // src 67496: whole branch gated on non-BOSS scenes; resets the orb kill counter GenINFO[77]
    // (read live by rewards for EXP/drop multipliers at src 63654/63684).
    if (String(sim.scene.name || '').indexOf('BOSS') !== -1) return;
    if (!sim.state.gi) sim.state.gi = {};
    sim.state.gi[77] = 0;
    // The orb actor (Bullet2 WT8/WT21 at playerX + 8, NodeY - 38/-53) is owned by rewards.orbCast:
    // it fades after max(3, DN2 - 2) s and is recycled 2050 ms later (src 89222), and the replay
    // draws it with its kill counter. Spawning a second bullet here drew a duplicate orb.
    sim.emit('orbReset', { t: sim.timeMs });
    addBuff(sim, 168, Math.round(TN(sim, 1, 168) + TN(sim, 1, 228) + 12));
  },
  198: (sim, p) => _castGraveyard(sim, p),
  423: (sim, p) => _castReindeer(sim, p),
  498: (sim, p) => _castWormhole(sim, p),
  588: (sim, p) => _castArcaneCrystal(sim, p),
  227: (sim, p) => _disciple(sim, p, 227),
  270: (sim, p) => {
    const s = _sgn(p);
    const b = _spawnBullet(sim, 14, 270, p.x + 35 + 24 * s, p.y + 6, { dir: s });
    // src 97733: the wave starts at (xCenter - 11 + 10*MultiArrow, yCenter - 12).
    sim.later(780, () => { _pierceWave(sim, 15, 270, _bxc(b) - 11 + 10 * s, _byc(b) - 12, s); sim.recycleActor(b); }, b);
    if (N(_v(sim).vaultUpg8) === 1) {
      // src 67506 VaultUpg 8 == 1: a second Piercing Arrow, same direction, at (x+35+11*dir, y+21).
      const b2 = _spawnBullet(sim, 14, 270, p.x + 35 + 11 * s, p.y + 21, { dir: s });
      sim.later(780, () => { _pierceWave(sim, 15, 270, _bxc(b2) - 11 + 10 * s, _byc(b2) - 12, s); sim.recycleActor(b2); }, b2);
    }
  },
  271: (sim, p) => _meleeArea(sim, 18, 271, p.x + 35 + 42 * _sgn(p), p.y + 23, _sgn(p)),
  451: (sim, p) => {
    _fireball(sim, p.x + 37 + 12 * _sgn(p), p.y + 5, _sgn(p));
    if (N(_v(sim).vaultUpg9) > 0) _fireball(sim, p.x + 37 - 12 * _sgn(p), p.y + 5, -_sgn(p));
  },
  46: (sim, p) => {
    // src 67472: conditional buff, Vman fx and the hitscan loop are unconditional.
    if (_buffBonus(sim, 45) > 0) addBuff(sim, 46, 20);
    _buffFx(sim, 'Vman', 46);
    let DN5 = 1;
    if (TN(sim, 1, 18) > 0) { DN5 = 2; if (TN(sim, 1, 33) > 0) { DN5 = 3; if (TN(sim, 1, 48) > 0) DN5 = 4; } }
    let n = 0;
    for (const m of sim.world.monsters(sim)) {
      if (n >= 100) break;
      if (hitscanning(sim, m, _xc(p), _yc(p), TN(sim, 1, 46))) { n++; createDmgPixel(sim, m, [], DN5, 'skill46'); }
    }
  },
  91: (sim, p) => _anim13(sim, p.x + 32, p.y + 15),
  106: (sim, p) => {
    const n = Math.min(3, Math.round(1 + 3 * TN(sim, 1, 197)));
    for (let i = 0; i < n; i++) _axe(sim, 100, p.x + 30 + 37 * _sgn(p), p.y - 30, _sgn(p));
  },
  137: (sim, p) => _wt2(sim, p.x + 8, p.y + 15),
  285: (sim) => { for (let d = 0; d < TN(sim, 1, 285); d++) _homingArrow(sim, d); },
  286: (sim, p) => {
    // src 67512: TargetEnemy (not a stale dummyActor) seeds the chain.
    const t = sim.player.target;
    if (!t || t.node !== p.node) return;
    const st = sim.state;
    st.dummyActor = t;
    _anim8(sim, t, t.x + N(t.offX), t.y + N(t.offY), 286);
    let c = 0;
    const list = sim.world.monsters(sim), byId = _byId(sim);
    for (let r = 0; r < list.length; r++) {
      const m = list[r];
      if (m !== st.dummyActor && c < TN(sim, 1, 286) && _aliveAt(byId, r) && distanceEqn(m.x, m.y, t.x, t.y) < 50) {
        st.dummyActor = m;
        _anim8(sim, m, m.x + N(m.offX), m.y + N(m.offY), 286);
        c++;
      }
    }
  },
  300: (sim, p) => _anim26(sim, p.x + 37 + 40 * _sgn(p), p.y + 10, _sgn(p)),
  301: (sim, p) => {
    const rng = sim.rng, pn = p.node, pny = N(_node(sim, pn).y);
    _anim27(sim, _xc(p) - 9, pny - 26);
    const extra = Math.round(TN(sim, 1, 301) - 1);
    for (let k = 0; k < extra; k++) {
      let DN = rng.randomInt(0, _nodeCount(sim) - 1);
      for (let d = 0; d < 20; d++) {
        const nd = _node(sim, DN);
        if (distanceEqn(N(nd.length), N(nd.y), _xc(p), pny) < 275 || distanceEqn(N(nd.x), N(nd.y), _xc(p), pny) < 275 || DN === pn) {
          if (sim.world.monsters(sim).some((m) => m.node === DN)) break;
        }
        if (d === 19) DN = pn;
        else DN = rng.randomInt(0, _nodeCount(sim) - 1);
      }
      const nd = _node(sim, DN);
      const x = Math.min(Math.max(rng.randomInt(N(nd.x), N(nd.length) - 38), _xc(p) - 300), _xc(p) + 300);
      _anim27(sim, x, N(nd.y) - 26);
    }
  },
  315: (sim) => _ballista(sim, 315),
  3150: (sim) => _ballista(sim, 3150),
  316: (sim, p) => _wt11(sim, p.x + 13 - 61 * _sgn(p), p.y + 5, p.dir === 1 ? 1 : 0),
  317: (sim) => { addBuff(sim, 317, 18); _throwVial(sim, 'FireBomb'); },
  318: (sim, p) => {
    sim.state.gi[79] = 0;
    const nd = _node(sim, p.node);
    _wt9(sim, Math.max(N(nd.x) + 10, p.x + 8), N(nd.y) - 45);
    addBuff(sim, 318, 360);
  },
  360: (sim, p) => _wt10(sim, p.x + 13 - 73 * _sgn(p), p.y + 5, _sgn(p), p.dir === 1 ? 1 : 0),
  361: (sim) => _summonWithExtras(sim, 'Pet2', TN(sim, 1, 361), 50, 150),
  362: (sim, p) => {
    const enh = N(_v(sim).talentEnh362) > 0 ? 1 : 0;
    const list = sim.world.monsters(sim), byId = _byId(sim);
    let c = 0;
    for (let r = 0; r < list.length; r++) {
      const m = list[r];
      if (c < TN(sim, 1, 362) + 25 * enh && _aliveAt(byId, r) && N(m.pet) === 0
        && 420 + 500 * enh > distanceEqn(m.x, m.y, _xc(p), _yc(p)) && !_low216(sim, m)) {
        _wt1(sim, m, _mxc(m) - 40, N(_node(sim, m.node).y) - sim.rng.randomInt(80, 125), m.node);
        c++;
      }
    }
  },
  363: (sim) => _summonWithExtras(sim, 'Pet5', 2, 75, 250),
  450: (sim, p) => { const t = _castTarget(sim); if (t) _anim12(sim, t, t.x + N(t.offX) - 14, N(_node(sim, p.node).y) - 40); },
  465: (sim, p) => { const t = _castTarget(sim); if (t) _anim30(sim, t, t.x + N(t.offX) - 14, N(_node(sim, p.node).y) - 40); },
  466: (sim, p) => {
    const ny = N(_node(sim, p.node).y), n = Math.round(2 * TN(sim, 1, 466));
    for (let d = 0; d < n; d++) {
      const D = Math.floor(d / 2);
      _anim29(sim, _xc(p) - 10 + 73 * (1 + D) * (2 * (d % 2) - 1), ny - 28, D);
    }
  },
  467: (sim, p) => _anim31(sim, p.x + 37 + 40 * _sgn(p), N(_node(sim, p.node).y) - 41, _sgn(p), p.node),
  481: (sim, p) => {
    const ny = N(_node(sim, p.node).y), n = Math.floor(TN(sim, 2, 481));
    for (let d = 0; d < n; d++) _anim21(sim, Math.round(63 + p.x + 56 * (d - n / 2) + 9 * _sgn(p)), ny - 29, p.node);
  },
  482: (sim, p) => _anim22(sim, p.x + 30 + 37 * _sgn(p), N(_node(sim, p.node).y) - 70, _sgn(p)),
  490: (sim) => {
    const v = _v(sim);
    addBuff(sim, 490, (TN(sim, 2, 490) + N(v.cookTimeBox)) * (1 + Math.min(N(v.alchemyActive), 75) / 100));
    _buffFx(sim, 'Cauldron', 490);
  },
  // src 67445: Pig fx first, then every ground coin stack is multiplied.
  16: (sim) => { _buffFx(sim, 'Pig', 16); sim.rewards.multiplyGroundCoins(sim, TN(sim, 1, 16)); },
  25: (sim) => { _buffFx(sim, 'Gift', 25); },
  32: (sim) => { _buffFx(sim, 'Print', 32); },
  // src 67517: the RNG draw happens only while fishing (animation '7').
  115: (sim, p) => {
    if (p.animation === '7' && sim.rng.randomFloat() < TN(sim, 1, 115) / 100) p.actionTimer = -N(_v(sim).fishingSpeed) + 0.5;
    _buffFx(sim, 'Worm', 115);
  },
  // Refinery cycle edit is non-combat; the fx remains.
  130: (sim) => { _buffFx(sim, 'Ref', 130); },
  135: (sim) => {
    if (!(0.5 < _buffBonus(sim, 135))) _buffFx(sim, 'Fire', 135);
    addBuff(sim, 135, TN(sim, 1, 135));
  },
  // Cooking recipe roll is non-combat; the Tongue fx remains.
  145: (sim) => { _buffFx(sim, 'Tongue', 145); },
  623: (sim) => { _buffFx(sim, 'ROLL_DA_DICE', 623); },
  626: (sim) => { sim.state.genInfo68 = 1; },
  495: (sim, p) => {
    const rng = sim.rng, n = Math.floor(TN(sim, 2, 495));
    for (let d = 0; d < n; d++) {
      const nodes = [p.node, p.node, p.node];
      for (let s = 0; s < _nodeCount(sim); s++) {
        const nd = _node(sim, s);
        if (distanceEqn((N(nd.x) + N(nd.length)) / 2, N(nd.y), _xc(p), _yc(p)) < 400) nodes.push(s);
      }
      const nd = _node(sim, nodes[rng.randomInt(0, nodes.length - 1)]);
      const x = rng.randomInt(Math.trunc(Math.min(N(nd.x) + 45, N(nd.length) - 46)), Math.trunc(N(nd.length) - 45));
      _wt12(sim, x, N(nd.y) - 39, d, _sgn(p));
    }
  },
  496: (sim) => {
    const t = _castTarget(sim);
    if (!t) return;
    let c = 0;
    for (const m of sim.world.monsters(sim)) {
      if (c < TN(sim, 2, 496) && hitscanning(sim, m, _mxc(t), _myc(t), 100)) {
        c++;
        _anim35(sim, m, m.x + N(m.offX) - 14, N(_node(sim, m.node).y) - 51);
      }
    }
  },
  497: (sim, p) => {
    let best = 799, tgt = null;
    for (const m of sim.world.monsters(sim)) {
      if (hitscanning(sim, m, _xc(p), _yc(p), 900)) {
        const d = distanceEqn(_mxc(m), _myc(m), _xc(p), _yc(p));
        if (d < best) { best = d; tgt = m; }
      }
    }
    sim.state.dummyActor = tgt;
    _wt14(sim, p.x + 37 + 12 * _sgn(p), p.y + 5, tgt);
  },
  525: (sim) => { addBuff(sim, 525, TN(sim, 1, 525)); _throwVial(sim, 'PoisonVial'); },
  526: (sim, p) => _summonPet(sim, 'pghost', TN(sim, 1, 526), _xc(p)),
  527: (sim, p) => { const t = _castTarget(sim); if (t) _wt4(sim, t, t.x + N(t.offX) - 37, N(_node(sim, p.node).y) - 59); },
  499: (sim, p) => {
    if (sim.rng.randomFloat() < 0.45) castAttackofID1(sim, 451);
    else if (sim.rng.randomFloat() < 0.6) castAttackofID1(sim, 466);
    else castAttackofID1(sim, 467);
  },
  529: (sim) => { sim.world.raiseDead(sim, TN(sim, 1, 529)); _buffFx(sim, 'Zombie', 529); },
  303: (sim, p) => {
    // AE148:886 — top-left distance; pets skipped; WT28 root cosmetic per target.
    const list = sim.world.monsters(sim), byId = _byId(sim);
    for (let r = 0; r < list.length; r++) {
      const m = list[r];
      if (_aliveAt(byId, r) && distanceEqn(m.x, m.y, _xc(p), _yc(p)) < TN(sim, 1, 303) && N(m.pet) === 0) {
        _cosmetic(sim, 'WT28', 303, _mxc(m) - 14, N(_node(sim, m.node).y) - 18, 1200);
        sim.world.addStatusToMonster(sim, m, 'StatusNoMove', TN(sim, 2, 303));
        m.vx = 0;
      }
    }
  },
};

const UNMODELLED_SKILLS = {};

// Coin Toss (30, src 67458) and Crazy Concoctions (480, src 67576) are inputReq
// held throws: their AE114 TracerParabolaPlayer/CoinToss/Concoction actors only
// launch on a mouse release, which neither auto mode (inputReq skips
// CastAttackofID1) nor replays produce, so the cast leaves no combat effect.
// 480 still creates the PotChoice buff fx first.
function _heldThrow(sim, id) {
  if (id === 480) _buffFx(sim, 'PotChoice', 480);
  sim.emit('heldThrow', { id, t: sim.timeMs });
}

// Wraith Form (195, src 67497): toggles. Active -> AddBuffType(195, 1) so it lapses;
// otherwise GenINFO[100] = 2, AddBuffType(195, 999999999) and the Wraith fx.
// The TotStatMAP Defence cache delete is a no-op here (defence is a fixed input).
function _wraithForm(sim) {
  const st = sim.state;
  if (N(st.wraith) === 1) addBuff(sim, 195, 1);
  else { st.gi1_100 = 2; addBuff(sim, 195, 999999999); _buffFx(sim, 'Wraith', 195); }
  sim.emit('formToggle', { id: 195, on: N(st.wraith) !== 1, t: sim.timeMs });
}

// Tempest (420, src 67542) / Arcanist (585, src 67603) Form: when not transitioning,
// toggle the buff (2 s off, or GenINFO[100] = 2 and 999999999 s on), show the fx,
// then Teleport(-99 / -992) (src 69053-69060): MouseClickX = x + 55,
// PlayerMoveMaps[2] = PlayerNode and switchScene to the loader that re-enters the
// same map (fade-out 1.5 s / 2 s). The form only activates on that re-entry, when
// NONdummies[67]/[68] are set from the buff, so the simulated session ends at the
// switch like a portal; `reload` carries the re-entry state.
function _formReload(sim, p, id) {
  if (sim.leaving || sim.ended) return;
  const st = sim.state, tempest = id === 420;
  const on = N(tempest ? st.tempest : st.arcanist) !== 1;
  if (on) { st.gi1_100 = 2; addBuff(sim, id, 999999999); } else addBuff(sim, id, 2);
  _buffFx(sim, tempest ? 'Tempest' : 'Arcanist', id);
  p.mouseClickX = p.x + 55;
  p.pmm[2] = p.node;
  sim.emit('formToggle', { id, on, t: sim.timeMs });
  sim.endSession({
    reason: 'sceneReload', fadeMs: tempest ? 1500 : 2000, from: p.node, node: p.node, map: sim.mapIdx,
    reload: { form: tempest ? 'tempest' : 'arcanist', active: on, mouseClickX: p.mouseClickX, buff: on ? 999999999 : 2 },
  });
}

// Teleport (453, src 67554-67557): only while PlayerMoveMaps[0] is 0/1/5. Clamp the
// jump to [NodeX - 35, NodeLength - 54] on the current node; standing players also
// retarget MouseClickX. Dungeon room 33 keeps x (dungeons are not simulated).
function _teleport(sim, p) {
  const st = N(p.pmm[0]);
  if (!(st === 0 || st === 1 || st === 5)) return;
  const nd = _node(sim, p.node);
  const lo = N(nd.x) - 35;
  const s = Math.round(Math.max(lo, Math.min(TN(sim, 1, 453) * (2 * p.dir - 1) + p.x, N(nd.length) - 54)));
  if (p.animation === '0') p.mouseClickX = Math.round(s + 39);
  _buffFx(sim, 'Tele', 453);
  p.x = s;
  sim.emit('teleport', { x: s, t: sim.timeMs });
}
// Buff casts: AddBuffType then the actor-209 fx named by DummyText (null = no fx).
const PURE_BUFFS = { 19: 'Bag', 40: null, 45: null, 94: 'Dmg', 107: 'Shout', 108: 'Heart', 122: 'Wall', 124: null, 167: null,
  273: 'Spd', 288: 'Range', 302: 'Wolf', 370: 'Wolf', 460: 'Log', 469: 'MPHP', 475: 'Soul' };
// Non-combat / menu casts (no combat handler).
const NO_HANDLER = new Set([-1, 14, 196, 225, 226, 234, 310, 421, 429, 468, 586, 635, 639]);

// Knightly Disciple WT7 (165) / Guardian Disciple WT20 (227) — AE575.
// Renderer frame loop: play frames lo..hi (looping) starting at frame `at` from now.
function _playFrames(sim, b, lo, hi, at = lo) {
  Object.assign(b, { frame: null, frLo: lo, frHi: hi, frAt: at, frT: sim.timeMs });
}
function _disciple(sim, p, id) {
  const nd = _node(sim, p.node);
  if (id === 165) {
    // AE575 init anim 7 (src 89007-89020): frame 0 holds 100 s; each cycle replays 1..6.
    const b = _spawnBullet(sim, 'WT7', 165, p.x + 8, N(nd.y) - 46, { scale: 2 });
    const te = N(_v(sim).talentEnh165) > 0 ? 1 : 0;
    const cycles = Math.ceil((TN(sim, 1, 165) + 20 * te) / 4);
    for (let r = 0; r < cycles; r++) {
      sim.later(1000 * (0.2 + 4.3 * r), () => {
        _playFrames(sim, b, 0, 6, 1);
        sim.later(660, () => {
          const xc = _bxc(b);
          _pierceWave(sim, 25, 165, xc - 45, b.y + 25, -1);
          _pierceWave(sim, 25, 165, xc + 25, b.y + 25, 1);
        }, b);
      }, b);
    }
    sim.later(1000 * Math.round(TN(sim, 1, 165) + 20 * te), () => {
      _fade(sim, b, 0, 600);
      sim.later(650, () => sim.recycleActor(b), b);
    }, b);
    return;
  }
  // AE575 init anim 20 (src 89200-89220). L = _DummyfNumberLIST:
  // [node, direction (-1/0/1), retarget timer s, speed, facing].
  const rng = sim.rng;
  const b = _spawnBullet(sim, 'WT20', 227, p.x + 8, N(nd.y) - 70);
  const L = [p.node, rng.randomInt(-1, 1), rng.randomInt(2, 5), 2, 0];
  b.disc = L;
  b.vx = L[1] * L[3];
  if (L[1] === 0) {
    const dd = Math.pow(-1, rng.randomInt(1, 2));
    b.scale = 200 * dd / 100;
    _playFrames(sim, b, 0, 7);
    L[4] = Math.round(dd);
  } else {
    b.scale = Math.round(200 * L[1]) / 100;
    _playFrames(sim, b, 9, 20);
    L[4] = Math.round(L[1]);
  }
  sim.every(2000, () => {
    for (const m of sim.world.monsters(sim)) if (hitscanning(sim, m, _bxc(b), _byc(b), 55)) createDmgPixel(sim, m, [1], 1, 'skill227');
  }, b);
  sim.every(3000, () => {
    if (rng.randomInt(1, 3) === 1) _daggerang(sim, _bxc(b) - 19 + 15 * L[4], b.y + 15, L[4], 1, 227);
  }, b);
  sim.later(1000 * Math.ceil(TN(sim, 1, 227)), () => {
    _fade(sim, b, 0, 600);
    sim.later(650, () => sim.recycleActor(b), b);
  }, b);
  // Shared AE575 100 ms update, anim 20 (src 88909-88919). Its 20 ms frame-8/21
  // resets make the idle (0..7) and walk (9..20) loops played by _playFrames.
  sim.every(100, () => {
    let dd = 0;
    L[2] = L[2] - 0.1;
    if (0 > L[2]) {
      L[2] = rng.randomInt(5, 8);
      if (rng.randomInt(1, 4) === 1) {
        if (L[1] !== 0) dd = 1;
        L[1] = 0;
      } else {
        const best = Math.pow(-1, rng.randomInt(1, 2));
        if (L[1] !== best) dd = 1;
        L[1] = best;
      }
      b.vx = L[1] * L[3];
    }
    const n0 = _node(sim, L[0] | 0), lo = N(n0.x) + 15, hi = N(n0.length) - 15;
    if ((b.x < lo || b.x > hi) && 0.5 < Math.abs(b.vx)) {
      L[2] = rng.randomInt(6, 9);
      L[1] = -1 * L[1];
      b.vx = L[1] * L[3];
      b.x = b.x < lo ? lo : hi;
      b.x += 2 * L[1];
      dd = 1;
    }
    if (dd === 1) {
      if (L[1] === 0) _playFrames(sim, b, 0, 7);
      else {
        b.scale = Math.round(200 * L[1]) / 100;
        L[4] = Math.round(L[1]);
        _playFrames(sim, b, 9, 20);
      }
    }
  }, b);
}

// ---------------------------------------------------------------------------
// Spawn skills — CastAttackofID1 198/423/498/588 (src 67501/67542/67595/67605)
// create AE575 WT16/WT18/WT13/WT19 actors whose init (src 89087-89199) runs
// synchronously at creation, then the shared 100 ms event (src 88863).
// ---------------------------------------------------------------------------
function _afkTarget(sim) { return String(MapAFKtarget[sim.mapIdx] ?? 'Nothing'); }
function _spawnSkillPos(sim, p, dy) {
  const nd = _node(sim, p.node);
  return { x: Math.max(N(nd.x) + 10, p.x + 8), y: N(nd.y) - dy };
}
function _liveWT(sim, anim) {
  return sim.actors.filter((a) => a.kind === 'bullet' && !a.recycled && a.anim === anim);
}
// "Monster" AFK target gate shared by 198/423/498 (CanWeSpawnMobs inlined).
function _spawnSkillGate(sim, extraBlocked) {
  if (extraBlocked && String(sim.scene?.name ?? '').includes(extraBlocked)) return false;
  return canWeSpawnMobs(sim);
}
// MonsterRespawnTime zeroing scan (WT13 250 ms task src 89100, 025sec src 83347).
function _respawnZeroScan(sim) {
  for (const m of sim.world.monsters(sim)) {
    const c = sim.world.respawnCounter(sim, m);
    if (0 < c && c < N(m.rt) - 2.5) {
      if (String(sim.world.getDef(sim, m.type)?.SpecialType ?? '').indexOf('a') === -1) {
        sim.world.setRespawnCounter(sim, m, 0);
        return true;
      }
    }
  }
  return false;
}

// WT16 Graveyard rectangle: cast 198 creates it at x = max(NodeX + 10,
// playerLeft + 8), y = NodeY - 41 (src 67501). x/y are top-left.
export function graveyardRect(nodeX, nodeY, playerLeft) {
  const { width: w, height: h } = bulletSize('WT16');
  const x = Math.max(N(nodeX) + 10, N(playerLeft) + 8), y = N(nodeY) - 41;
  return { x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
}

function _castGraveyard(sim, p) {
  if (!_spawnSkillGate(sim)) return;
  const rng = sim.rng, gi = sim.state.gi, nodes = _nodes(sim), pn = p.node;
  gi[125] = 0; gi[126] = -1;
  const pos = graveyardRect(N(_node(sim, pn).x), N(_node(sim, pn).y), p.x);
  const b = _spawnBullet(sim, 'WT16', 198, pos.x, pos.y, { scale: 2, _Num1: pn, DDB: 0, _DD: 0 });
  sim.later(285e3, () => { _fade(sim, b, 0, 2000); sim.later(2050, () => { b.DDB = 0; gi[125] = 0; gi[126] = 0; sim.recycleActor(b); sim.emit('spawnSkillExpired', { skill: 198, anim: 'WT16', uid: b.uid, t: sim.timeMs }); }, b); }, b);
  sim.world.killFlaggedMobs(sim, (m) => _hasStatus(m, 'StatusGrave'));
  sim.world.wormholeMob(sim, _afkTarget(sim), 8);
  b.DDB = 1; b._DD = 0;
  _trackCount(sim, b, 125);
  addBuff(sim, 198, 300);
  for (let i = 0, s = rng.randomInt(16, 25); i < s; i++) {
    const g = Math.min(_nodeCount(sim) - 1, Math.max(0, pn + rng.randomInt(-2, 2)));
    const X = N(nodes[g].x), L = N(nodes[g].length);
    const x = rng.randomInt((X + 15) | 0, Math.max(X + 15, L - 35) | 0);
    const t = _spawnBullet(sim, 'WT17', 198, x, N(nodes[g].y) - 32, { scale: 1 });
    t.frame = rng.randomInt(0, 3);
    sim.later(285e3, () => sim.later(2050, () => sim.recycleActor(t), t), t);
  }
}

function _castReindeer(sim, p) {
  if (!_spawnSkillGate(sim, 'Rift')) return;
  const rng = sim.rng, gi = sim.state.gi, nodes = _nodes(sim);
  gi[132] = 0;
  const pos = _spawnSkillPos(sim, p, 47);
  const b = _spawnBullet(sim, 'WT18', 423, pos.x, pos.y, { scale: 2, DDB: 0, _DD: 0 });
  sim.later(285e3, () => { _fade(sim, b, 0, 2000); sim.later(2050, () => { b.DDB = 0; gi[132] = 0; sim.recycleActor(b); sim.emit('spawnSkillExpired', { skill: 423, anim: 'WT18', uid: b.uid, t: sim.timeMs }); }, b); }, b);
  const n = rng.randomInt(0, (_nodeCount(sim) - 1) | 0);
  sim.world.killFlaggedMobs(sim, (m) => m.type === 'reindeer');
  sim.world.wormholeMob(sim, _afkTarget(sim), 8);
  sim.world.createMonster(sim, 'reindeer', n, rng.randomInt(N(nodes[n].x) | 0, N(nodes[n].length) | 0), 'reindeer');
  b._Num1 = p.node; b.DDB = 1; b._DD = 0;
  _trackCount(sim, b, 132);
  addBuff(sim, 423, 300);
}

function _castWormhole(sim, p) {
  if (!_spawnSkillGate(sim)) return;
  const gi = sim.state.gi, pn = p.node;
  gi[83] = 0;
  const dur = TN(sim, 2, 498) - 2;
  const pos = _spawnSkillPos(sim, p, 45);
  const b = _spawnBullet(sim, 'WT13', 498, pos.x, pos.y, { scale: 2, DDB: 0, _DD: 0, _Num1: pn, _Num2: 0 });
  const killWh = () => sim.world.killFlaggedMobs(sim, (m) => _hasStatus(m, 'StatusWormhole'));
  sim.later(1000 * dur, () => {
    _fade(sim, b, 0, 2000);
    sim.later(2050, () => {
      killWh();
      gi[87] = N(gi[87]) + b._DD;
      b.DDB = 0;
      sim.recycleActor(b);
      sim.emit('spawnSkillExpired', { skill: 498, anim: 'WT13', uid: b.uid, t: sim.timeMs });
    }, b);
  }, b);
  killWh();
  sim.later(500, () => sim.world.wormholeMob(sim, _afkTarget(sim), 8), b);
  b._Num1 = pn; b._Num2 = 0; b.DDB = 1; b._DD = 0;
  sim.every(250, () => {
    if (b.DDB === 1 && 0.5 < b._Num2 && _respawnZeroScan(sim)) {
      b._Num2 = Math.round(b._Num2 - 1);
      gi[87] = N(gi[87]) + 1;
    }
  }, b);
  sim.every(100, () => {
    if (b.DDB === 1 && b._DD !== N(gi[83])) {
      b._Num2 = Math.round(b._Num2 + (N(gi[83]) - b._DD));
      b._DD = N(gi[83]);
    }
  }, b);
  addBuff(sim, 498, TN(sim, 2, 498));
}

// ArcaneType("CrystalChargeReq"/"ArcaneMobSpawnQTY") (src 92409).
export function crystalChargeReq(sim) {
  const v = _v(sim);
  return Math.ceil(Math.max(50, 200 - (Math.min(100, N(v.arcane13)) + Math.min(10, TN(sim, 2, 599)))));
}
function _arcaneMobSpawnQty(sim) {
  return Math.round(TN(sim, 1, 588) + Math.floor(Math.min(3, sim.rng.randomFloat() + N(_v(sim).arcane26) / 100)));
}

// Trigg("sin"/"cos", t, i) (src 75175) reads ActorEvents_229 GenInfo[16][0], a
// runtime angle that grows 1.3 every 20 ms (_event_002seconds, src 71581/71977).
// Its phase is not saved, so the sim counts it from the run start.
export function trigSin(timeMs, t = 0, i = 0.6) {
  return Math.sin((1.3 * Math.floor(N(timeMs) / 20) + t / i * 360) * i * 0.01745329251994278);
}
// WT19 Arcane Crystal rectangle: cast 588 creates it at x = max(NodeX + 10,
// playerLeft + 8) (src 67605); its init then sets YCenter to
// round(NodeY + 5*Trigg("sin",0,.6) - 96) (src 89195), so the crystal hovers
// 96 px above the platform. AE575 re-centres it every 20 ms with the live
// Trigg bob (src 88905), so it hovers +/-5 px. x/y are top-left.
export function arcaneCrystalRect(nodeX, nodeY, playerLeft, bob = 0) {
  const { width: w, height: h } = bulletSize('WT19');
  const x = Math.max(N(nodeX) + 10, N(playerLeft) + 8), cy = Math.round(N(nodeY) + N(bob) - 96);
  return { x, y: cy - h / 2, w, h, cx: x + w / 2, cy };
}

function _castArcaneCrystal(sim, p) {
  const nodes = _nodes(sim), pn = p.node;
  const popup = (text) => sim.emit('popup', { text, skill: 588, t: sim.timeMs });
  if (N(nodes[pn].length) - N(nodes[pn].x) < 200) { popup('platform_too_small'); return; }
  const afkt = _afkTarget(sim);
  const def = sim.world.getDef(sim, afkt);
  const blocked = NinjaInfo[40] || [];
  if (!def || afkt === 'Nothing' || afkt === 'Z' || blocked.includes(String(sim.scene?.name ?? ''))) { popup('no_arcane_energy_here'); return; }
  if (String(def.AFKtype) !== 'FIGHTING') { popup('no_arcane_energy_here'); return; }
  const st = sim.state, gi = st.gi, g26 = st.gi26 || (st.gi26 = {});
  const pos = arcaneCrystalRect(N(nodes[pn].x), N(nodes[pn].y), p.x, 5 * trigSin(sim.timeMs, 0, 0.6));
  sim.world.wormholeMob(sim, afkt, 8);
  st.gi41 = 0;
  const list = [pn, -1, N(g26[40]), null, null, 0, crystalChargeReq(sim)];
  g26[40] = Math.round(N(g26[40]) + 1);
  if (g26[40] >= 3) g26[40] = 0;
  const b = _spawnBullet(sim, 'WT19', 588, pos.x, pos.y, { scale: 2, frame: list[2], list, crystal: list[2] });
  for (const o of _liveWT(sim, 'WT19')) if (o !== b && o.list && o.list[1] === 0) o.list[1] = 1;
  sim.later(100, () => { list[1] = 0; }, b);
  sim.every(100, () => {
    if (list[5] >= list[6]) {
      list[5] -= list[6];
      const n = list[0], x = _bxc(b), type = String(gi[85] ?? 'Nothing');
      if (type !== 'Nothing' && type !== 'Z' && sim.world.getDef(sim, type)?.SpecialType !== 'a'
        && N(st.gi7_8) === -1 && String(sim.scene?.name ?? '').indexOf('uAquaA6') === -1) {
        const X = N(nodes[n].x), L = N(nodes[n].length);
        for (let e = 0, q = _arcaneMobSpawnQty(sim) | 0; e < q; e++) {
          const mx = Math.max(X, Math.min(L - 30, x + sim.rng.randomInt(-100, 100) * Math.min(3, 1 + 0.5 * Math.floor(N(gi[83]) / 10))));
          const mon = sim.world.createMonster(sim, type, n, mx, 'ArcaneMobSpawn');
          if (mon) sim.world.addStatusToMonster(sim, mon, 'StatusArc' + list[2], 36e5);
        }
      }
    }
    if (N(g26[44]) === 1) { g26[44] = 0; list[5] = 0; }
    for (let r = 0; r < 5; r++) {
      sim.later(20 * r, () => {
        if (N(st.gi41) >= 1) { list[5] = N(list[5]) + N(st.gi41); st.gi41 = 0; }
        b.y = arcaneCrystalRect(N(nodes[pn].x), N(nodes[pn].y), p.x, 5 * trigSin(sim.timeMs, 0, 0.6)).y;
      }, b);
    }
    if (list[1] === 1) sim.recycleActor(b);
  }, b);
}

// _event_025sec (src 83329, ActorEvents_481 every 330 ms): drains queued
// wormhole spawns, graveyard waves, reindeer respawns and gi[87] accelerations.
export function event025sec(sim) {
  const rng = sim.rng, st = sim.state, gi = st.gi, nodes = _nodes(sim);
  const spawnable = () => {
    const type = String(gi[85] ?? 'Nothing');
    return type !== 'Nothing' && type !== 'Z' && sim.world.getDef(sim, type)?.SpecialType !== 'a' && N(st.gi7_8) === -1;
  };
  if (N(gi[84]) > 0) {
    gi[84] = N(gi[84]) - 1;
    let n = -1, x = -1;
    for (const b of _liveWT(sim, 'WT13')) { n = N(b._Num1); x = _bxc(b); }
    if (n > -1 && spawnable()) {
      const X = N(nodes[n | 0].x), L = N(nodes[n | 0].length);
      const mon = sim.world.createMonster(sim, String(gi[85]), n, Math.max(X, Math.min(L - 30, x + rng.randomInt(-40, 40) * Math.min(3, 1 + 0.5 * Math.floor(N(gi[83]) / 10)))), 'WormholeMobSpawn');
      if (mon) sim.world.addStatusToMonster(sim, mon, 'StatusWormhole', 36e5);
    }
  }
  if (gi[125] !== gi[126]) {
    gi[126] = gi[125];
    let n = -1, x = -1;
    for (const b of _liveWT(sim, 'WT16')) {
      n = Math.min(Math.max(N(b._Num1) + rng.randomInt(-2, 2), 0), _nodeCount(sim) - 1);
      const X = N(nodes[n].x);
      x = rng.randomInt((X + 25) | 0, Math.max(X + 25, N(nodes[n].length) - 40) | 0);
    }
    if (n > -1 && spawnable()) {
      gi[127] = rng.randomInt(5, 8);
      const X = N(nodes[n].x), L = N(nodes[n].length);
      for (let e = 0, t = N(gi[127]) | 0; e < t; e++) {
        const mon = sim.world.createMonster(sim, String(gi[85]), n, Math.max(Math.min(x + rng.randomInt(-80, 80), L), X), 'GraveyardMobSpawn');
        if (mon) sim.world.addStatusToMonster(sim, mon, 'StatusGrave', 36e5);
      }
    }
  }
  if (N(gi[133]) > 0) {
    gi[133] = 0;
    const n = rng.randomInt(0, (_nodeCount(sim) - 1) | 0);
    sim.world.createMonster(sim, 'reindeer', n, rng.randomInt(N(nodes[n].x) | 0, N(nodes[n].length) | 0), 'reindeer');
  }
  for (let e = 0; e < 2; e++) {
    if (0.5 < N(gi[87]) && _respawnZeroScan(sim)) gi[87] = Math.round(N(gi[87]) - 1);
  }
}

export function castAttackofID1(sim, id) {
  const p = sim.player;
  sim.emit('castEffect', { id, t: sim.timeMs });
  const h = SKILL_HANDLERS[id];
  if (h) { h(sim, p); return true; }
  if (Object.prototype.hasOwnProperty.call(PURE_BUFFS, id)) {
    addBuff(sim, id, BUFF_DURATIONS[id](sim));
    if (PURE_BUFFS[id]) _buffFx(sim, PURE_BUFFS[id], id);
    return true;
  }
  // Big Pick (src 67471) acts only while mining, which combat never enters.
  if (id === 100) return true;
  if (id === 453) { _teleport(sim, p); return true; }
  if (id === 30 || id === 480) { _heldThrow(sim, id); return true; }
  if (id === 195) { _wraithForm(sim); return true; }
  if (id === 420 || id === 585) { if (!sim.leaving) _formReload(sim, p, id); return true; }
  if (id === 634) {
    // src 67608-67610: recycle every live ground drop (actor 44) without collecting it,
    // then send inventory slots to storage (actor 38; no combat effect).
    for (const it of sim.items) if (!it.dead && !it.recycled) { sim.recycleActor(it); sim.state.itemsDiscarded = (sim.state.itemsDiscarded || 0) + 1; }
    return true;
  }
  if (NO_HANDLER.has(id)) return false;
  _unm(sim, 'skill' + id, (UNMODELLED_SKILLS[id] || 'AE148') + ' CastAttackofID1(' + id + ')');
  return false;
}

// AttackQueue CAST bookkeeping (SK §1.4).
// `effect:false` is the src 121611 branch (inputReq other than 0/2): no
// CastAttackofID1, AttackQty = 3 and AttackBuffer = 1 for later clicks.
export function castAttack(sim, id, { raw = false, effect = true } = {}) {
  const def = attackDef(id);
  const st = sim.state, v = _v(sim);
  if (effect) { castAttackofID1(sim, id); st.attackQty = 0; }
  else { st.attackQty = 3; st.attackBuffer = 1; }
  st.attackQueue = N(def?.castTime);
  let cd = N(def?.cooldown);
  if (!raw) {
    cd = Math.ceil(cd / (N(v.atkCooldownDec) || 1));
    if (id === 490) cd = Math.ceil(cd / (1 + N(v.alchemyActive) / 100));
    if (id === 315) cd = Math.ceil(cd / (1 + TN(sim, 1, 422) / 100));
    if (id === 362) cd = Math.ceil(cd / (1 + TN(sim, 1, 424) / 130));
    if (id === 168) cd = Math.ceil(Math.max(cd, TN(sim, 1, 168) + 10));
    if (id === 498) cd = Math.ceil(Math.max(cd, TN(sim, 2, 498) + 10));
  }
  st.attackCooldowns[String(id)] = cd;
  // Replay HUD only: full cooldown for the sweep and the last cast for the slot flash.
  (sim.cdTotals || (sim.cdTotals = {}))[String(id)] = cd;
  sim.lastCast = [id, sim.timeMs];
  const mp = (N(v.mpCostBoost) || 1) * N(def?.manaCost);
  sim.player.mp -= mp;
  if (N(def?.inputReq) !== 1) st.attackSelected = -1;
  sim.emit('cast', { id, cd, mp, castTime: st.attackQueue, raw, t: sim.timeMs });
}

// ---------------------------------------------------------------------------
// PlayerReach (stats12:1011)
// ---------------------------------------------------------------------------
export function playerReach(sim) {
  const p = sim.player, v = _v(sim);
  if (!p.target) return 70;
  if (v.weaponReach == null) return 200 + _buffBonus(sim, 288);
  // src 66207: CompassTempest form swaps buff 288 for Compass_Range.
  return N(v.weaponReach) + (N(sim.state.tempest) === 1 ? N(v.compassRange) : _buffBonus(sim, 288));
}

export function playerActionWaitTime(sim, type) { return _awt(sim, type); }
function _awt(sim, type) {
  const v = _v(sim), st = sim.state, fs = v.formStats;
  // src 66381: CompassTempest then TesseractArcanist overwrite WaitTimeSPD
  // (form weapon Speed + EquipmentMap Speed, or 1 for a non-form weapon);
  // the Tempest branch is selected first for FISTICUFF/SPEAR/BOW/WAND.
  const T = N(st?.tempest) === 1 ? fs?.tempest : null, A = N(st?.arcanist) === 1 ? fs?.arcanist : null;
  if (T || A) {
    const W = A ? N(A.weaponSpeed) : N(T.weaponSpeed);
    const r = T ? formActionWaitTime('tempest', type, W, N(T.atkSpdPct)) : formActionWaitTime('arcanist', type, W, N(A.atkSpdPct));
    if (r != null) return r;
    return actionWaitTime(type, { weaponSpeed: W, level: 999, attackSpeedPct: v.attackSpeedPct, buff135: 0, buff468: _buffBonus(sim, 468) });
  }
  return actionWaitTime(type, { weaponSpeed: v.weaponSpeed, level: v.level, attackSpeedPct: v.attackSpeedPct, buff135: _buffBonus(sim, 135), buff468: _buffBonus(sim, 468) });
}

// ---------------------------------------------------------------------------
// Movement (AE20 FindNewNode / Movement / JumpingS3NPC / StopMoving)
// ---------------------------------------------------------------------------
function _eligibleTarget(sim, m) {
  return m.alive === 1 && !m.willDie && N(m.pet) === 0 && _isMonsterType(sim, m);
}

// _event_FindNewNode (src 69735-69748), literal:
// - skipped while PMM[0]==2, after 4 node changes, and on MapType[0] maps
//   (towns etc.); a current Tree target pins BEST to 0, which skips the scan;
// - candidates: alive, not about to die, PetStatus 0, Type "Monster", not a
//   Nest, AutoMove on, distance < BEST (starts 5e7), excluding node-3 mobs on
//   map 216 (Cavern staging, NodeY 2500) and node-3 mobs on map 16 while
//   Lv0[0] < 50;
// - each candidate replaces _TargetEnemy; the tail (BEST != 5e7 && PMM[1]==1)
//   sets PMM[2], counts a change when the target differs from
//   _TargetEnemyTEMP, and sets PMM[0]=1 when already on that node.
function _findNewNode(sim) {
  const p = sim.player, pmm = p.pmm;
  const map = Number(sim.mapIdx);
  if (pmm[0] === 2 || !(p.nodeChanges < 4) || (MapType[0] || []).includes(map)) return;
  let bestD = 5e7;
  if (p.target != null && String(p.target.type || '').includes('Tree')) bestD = 0;
  if (bestD === 0) return;
  const XC = _xc(p), YC = _yc(p), lv = N(_v(sim).level);
  for (const m of sim.world.monsters(sim)) {
    if (!(_eligibleTarget(sim, m) && !String(m.type || '').includes('Nest') && p.autoMove)) continue;
    const d = (XC - _mox(m)) ** 2 + (1.5 * (YC - (m.y + N(m.offY)))) ** 2;
    if (d < bestD && !((map === 216 && N(m.node) === 3) || (lv < 50 && map === 16 && N(m.node) === 3))) {
      bestD = d;
      p.target = m;
    }
  }
  if (bestD !== 5e7 && pmm[1] === 1) {
    pmm[2] = p.target.node;
    if (p.targetTemp !== p.target) { p.targetTemp = p.target; p.nodeChanges++; }
    if (p.node === pmm[2] && pmm[0] === 0) pmm[0] = 1;
  }
}

// Type-2 connection (src 69766-69776): PlayerDestination = PMM[2]; the first
// SceneTransitions[CurrentMap] row whose node equals it switches scene unless
// NONdummies[46] == 1, and map 0 -> node 8 always switches to scene 6. A
// switch leaves the simulated map, so the session ends there. Without a
// matching row the player just stands still every frame, as in the source.
export function portalDestination(mapIdx, node) {
  const rows = SceneTransitions[mapIdx];
  if (Array.isArray(rows)) {
    // c.asNumber(string) is parseFloat (src 10619): placeholder rows like ["Z","Z"] are NaN and never match.
    for (const r of rows) if (Number(node) === parseFloat(r[0])) return { node: Number(node), scene: String(r[1]), map: MapName.indexOf(String(r[1])), guarded: true };
  }
  if (Number(mapIdx) === 0 && Number(node) === 8) return { node: 8, scene: 'scene 6', map: -1, guarded: false };
  return null;
}

function _portalTransition(sim) {
  const p = sim.player, dest = portalDestination(sim.mapIdx, p.pmm[2]);
  if (!dest || (dest.guarded && N(sim.state.nd46) === 1)) return;
  const target = p.target;
  sim.endSession({
    reason: 'sceneTransition', from: p.node, node: dest.node, scene: dest.scene, map: dest.map,
    target: target ? { type: target.type, node: target.node, temp: N(target.temp), flag: target.flag || null } : null,
  });
}

function _landing(sim, nb) {
  const p = sim.player, nd = _node(sim, nb);
  const from = p.node;
  p.animation = '1';
  p.vx = 0; p.vy = 0;
  p.y = N(nd.y) - 49;
  p.node = nb;
  p.pmm[0] = 1;
  p.pmm[3].splice(0, 1);
  sim.emit('nodeChange', { from, to: nb, t: sim.timeMs });
}

function _movement(sim) {
  const p = sim.player, pmm = p.pmm, nodes = _nodes(sim);
  if (p.animation === 'Da') return;
  const SPD = N(_v(sim).playerSpeed);
  const XC = () => _xc(p);
  const s = pmm[0];
  if (p.node !== pmm[2]) {
    if ((s === 0 || s === 1 || s === 5) && pmm[2] >= 0 && pmm[2] <= nodes.length - 1 && p.node >= 0 && p.node <= nodes.length - 1) {
      pmm[0] = 0;
      pmm[3] = pathfinder(nodes, p.node, pmm[2]);
    }
  } else {
    p.nodeChanges = 0;
    if (pmm[1] === 2) {
      if ([0, 1, 2, 5].includes(pmm[0])) {
        if (pmm[1] === 0 && p.autoMove) pmm[0] = 1;
        const same = 15 * Math.min(2, SPD / 13);
        const nd = _node(sim, p.node);
        if (XC() < Math.min(p.mouseClickX - same, N(nd.length) - same)) { p.dir = 1; p.animation = '1'; p.vx = SPD; }
        else if (XC() > Math.max(p.mouseClickX + same, N(nd.x) + same)) { p.dir = 0; p.animation = '1'; p.vx = -SPD; }
        else { p.vx = 0; if (!['0', 'Za', '9'].includes(p.animation)) p.animation = '0'; }
      }
    } else if (p.autoMove) pmm[1] = 1;
  }
  // (c) traversal
  if ((pmm[0] === 0 || pmm[0] === 5) && pmm[3] != null && pmm[3].length > 0) {
    const pi = pmm[3][0];
    const cur = _node(sim, p.node);
    const nb = Number(cur.neighbors[pi]);
    const typ = Number(cur.neighborType[pi]);
    const nbn = _node(sim, nb);
    if (!nbn) { _unm(sim, 'badNeighbor', 'AE20:358 neighbor ' + nb + ' undefined'); return; }
    const connX = N(cur.connectorX[pi]);
    let minX, maxX;
    if (typ === 0) {
      const k = 25 * Math.pow(Math.min(2.7, SPD / 13), 0.5);
      minX = N(nbn.x) - k; maxX = N(nbn.length) + k;
    } else if (typ === 2 || typ === 3) {
      p.dir = XC() < N(nbn.x) ? 1 : 0;
      minX = N(nbn.x) - (17 - 30 * (p.dir - 1)) * (SPD / 13);
      maxX = N(nbn.length) + (17 + 30 * p.dir) * (SPD / 13);
    } else {
      minX = connX - (11 - 30 * (p.dir - 1));
      maxX = connX + (11 + 30 * p.dir);
    }
    p.animation = '1';
    if (XC() < minX) { p.dir = 1; p.vx = SPD; }
    else if (XC() > maxX) { p.dir = 0; p.vx = -SPD; }
    else if (typ === 0) {
      pmm[0] = 3; p.animation = '3';
      const k = Math.pow(SPD / 13, 0.7);
      p.vy = N(cur.y) < N(nbn.y) ? -SPD / k : -5.5 * SPD / k;
      if (XC() < N(nbn.x)) { p.dir = 1; p.vx = SPD / k; }
      else if (XC() > N(nbn.length)) { p.dir = 0; p.vx = -SPD / k; }
      else p.vx = 0;
    } else if (typ === 1) {
      pmm[0] = 4; p.animation = '4';
      p.vy = N(cur.y) < N(nbn.y) ? 1.2 * SPD : -1.2 * SPD;
      p.y = N(cur.y) - 49;
      p.vx = 0;
      p.x = connX - 6 * p.dir - p.width / 2;
    } else if (typ === 2) {
      p.vx = 0; p.animation = '0';
      _portalTransition(sim);
    } else if (typ === 3) {
      p.vx = XC() < N(nbn.x) ? SPD : -SPD;
      pmm[0] = 6;
    }
  }
  // (d) auto-target / walk to target
  if (pmm[0] === 1) {
    let best = null, bestD = Infinity;
    for (const m of sim.world.monsters(sim)) {
      if (m.alive === 1 && !m.willDie && m.node === p.node && N(m.pet) === 0 && _isMonsterType(sim, m)) {
        const d = Math.abs(XC() - _mox(m));
        if (d < bestD) { best = m; bestD = d; }
      }
    }
    if (p.autoMove) p.target = best;
    const t = p.target;
    if (best == null && pmm[2] === p.node && pmm[1] !== 2) {
      if (p.autoMove) {
        p.vx = 0;
        if (N(p.pinfo0) === 0 && !['0', 'Za', '9'].includes(p.animation)) p.animation = '0';
      } else {
        // Manual (clicked) walk to MouseClickX, src 69784.
        const sb = Math.min(1.2, N(_v(sim).playerSpeedBonus));
        const nd = _node(sim, p.node);
        if (XC() < Math.min(p.mouseClickX - 14 * sb, N(nd.length) - 15 * sb)) { p.dir = 1; p.animation = '1'; p.vx = SPD; }
        else if (XC() > Math.max(p.mouseClickX + 15 * sb, N(nd.x) + 15 * sb)) { p.dir = 0; p.animation = '1'; p.vx = -SPD; }
        else if (p.target == null) { p.vx = 0; if (N(p.pinfo0) === 0 && !['0', 'Za', '9'].includes(p.animation)) p.animation = '0'; }
        else p.animation = '1';
      }
    } else if (best != null && !p.autoMove && t == null) {
      // AutoMove off with no _TargetEnemy walks to MouseClickX (src 69784, ±15 tolerance).
      const sb = Math.min(1.2, N(_v(sim).playerSpeedBonus));
      const nd = _node(sim, p.node);
      if (XC() < Math.min(p.mouseClickX - 15 * sb, N(nd.length) - 15 * sb)) { p.dir = 1; p.animation = '1'; p.vx = SPD; }
      else if (XC() > Math.max(p.mouseClickX + 15 * sb, N(nd.x) + 15 * sb)) { p.dir = 0; p.animation = '1'; p.vx = -SPD; }
      else { p.vx = 0; if (!['0', 'Za', '9'].includes(p.animation)) p.animation = '0'; }
    } else if ((p.autoMove || t != null) && t && t.alive === 1 && !t.willDie && t.node === p.node) {
      p.animation = '1';
      if (XC() > _mox(t)) { p.dir = 0; p.vx = -SPD; } else { p.dir = 1; p.vx = SPD; }
    } else p.animation = '0';
  }
}

function _jumping(sim) {
  const p = sim.player, pmm = p.pmm;
  const path = pmm[3];
  const nbOf = () => {
    if (!path || !path.length) return null;
    const nb = Number(_node(sim, p.node)?.neighbors?.[path[0]]);
    return _node(sim, nb) ? nb : null;
  };
  const SPD = N(_v(sim).playerSpeed);
  if (pmm[0] === 3) {
    const nb = nbOf();
    if (nb == null) return;
    if (p.y - (N(_node(sim, nb).y) - 49) > 0 && p.vy > 0) _landing(sim, nb);
    else p.vy += 0.9 * Math.pow(2 * Math.pow(SPD / 13, 0.3), 2);
  } else if (pmm[0] === 4) {
    const nb = nbOf();
    if (nb == null) return;
    const tgt = N(_node(sim, nb).y) - 49;
    if ((p.y - tgt > 0 && p.vy > 0) || (p.y - tgt < 0 && p.vy < 0)) _landing(sim, nb);
  } else if (p.vy !== 0 && sim.mapIdx !== 23) {
    const nb = nbOf();
    if (nb != null) _landing(sim, nb);
    else p.vy = 0;
  }
  if (pmm[0] === 6) {
    const nb = nbOf();
    if (nb == null) return;
    const from = p.node;
    p.node = nb; p.vx = 0; p.animation = '0';
    pmm[1] = 2; pmm[0] = 1;
    path.splice(0, 1);
    sim.emit('nodeChange', { from, to: nb, drop: true, t: sim.timeMs });
  }
}

function _stopMoving(sim) {
  const p = sim.player, pmm = p.pmm;
  const anyLive = sim.world.monsters(sim).some((m) => m.alive === 1 && _isMonsterType(sim, m));
  if (!anyLive && p.autoMove && p.target == null && pmm[0] === 1 && pmm[2] === p.node && pmm[1] !== 2) { p.vx = 0; p.animation = '0'; }
  if (p.target == null && ['5', '6', '7', '8', 'Filler'].includes(p.animation)) { p.vx = 0; p.animation = '0'; }
}

// ---------------------------------------------------------------------------
// ActionsAttacks + Results (AE20:837-1867)
// ---------------------------------------------------------------------------
function _actionsAttacks(sim) {
  const p = sim.player, pmm = p.pmm;
  if (p.actionTimer > 0) p.actionTimer += 0.05;
  else if (p.actionTimer < 0) p.actionTimer -= 0.05;
  if (p.takeDmgTimer > 0) p.takeDmgTimer -= 0.05;
  const t = p.target;
  if (!(pmm[0] === 1 && p.animation !== '0' && t != null && _isMonsterType(sim, t) && t.node === p.node)) return;
  const d = _xc(p) - _mox(t);
  if (Math.abs(d) < playerReach(sim) - 5 && ((p.dir === 0 && d > 0) || (p.dir === 1 && d < 0)) && t.alive === 1) {
    p.mouseClickX = _xc(p);
    const wt = _v(sim).weaponType;
    // AE20:900 is a FISTICUFF/SPEAR/BOW/WAND chain; any other type (only test items use SWORD) starts no attack.
    if (wt !== 'FISTICUFF' && wt !== 'SPEAR' && wt !== 'BOW' && wt !== 'WAND') return;
    p.vx = 0;
    pmm[0] = 2;
    if (wt === 'FISTICUFF') {
      p.animation = '2_';
      if (p.actionTimer >= 0) { p.actionTimer = 0.01; sim.rng.randomInt(1, 4); }
    } else if (wt === 'SPEAR') {
      p.animation = '2a';
      if (p.actionTimer >= 0) p.actionTimer = 0.01;
    } else if (wt === 'BOW') {
      p.animation = '2b';
      if (p.actionTimer >= 0) p.actionTimer = 0.01;
    } else {
      p.animation = '2c';
      if (p.actionTimer >= 0) {
        p.actionTimer = 0.01;
        sim.later(400, () => { if (p.animation === '2c') sim.rng.randomInt(0, 1); }, p);
      }
    }
    sim.emit('attackStart', { target: t.uid, t: sim.timeMs });
  } else {
    pmm[0] = 1;
    p.animation = '1';
  }
}

function _facingInReach(p, m, reach) {
  const d = _xc(p) - _mox(m);
  return ((d > -1 && p.dir === 0) || (d < 1 && p.dir === 1)) && Math.abs(d) < reach;
}

function _results(sim) {
  const p = sim.player, pmm = p.pmm, v = _v(sim), rng = sim.rng;
  const wt = v.weaponType || 'FISTICUFF';
  const reach = playerReach(sim);
  if (pmm[0] === 2 && (p.animation === '2a' || p.animation === '2_') && p.actionTimer > 0.25) {
    const spear = p.animation === '2a';
    // Fist punch sound pick consumes shared RNG (src 69807): randomInt(0,2), then randomInt(0,4) only if the first != 1.
    if (!spear && rng.randomInt(0, 2) !== 1) rng.randomInt(0, 4);
    if (spear) {
      sim.later(1100, () => { if (_buffActive(sim, 135)) addBuff(sim, 135, TN(sim, 1, 135)); }, p);
      if (rng.randomFloat() * 100 < TN(sim, 1, 169)) _pierceWave(sim, 25, 169, p.x + 35 + 25 * _sgn(p), p.y + 25, _sgn(p));
      if (TN(sim, 1, 197) > 0) _axe(sim, 100, p.x + 30 + 37 * _sgn(p), p.y - 30, _sgn(p));
    }
    p.actionTimer = -0.01;
    const cls = N(v.charClass);
    const max = spear ? ((cls > 5 && cls < 18) || cls === 1 ? 7 : 1) : 1;
    let count = 0;
    const list = sim.world.monsters(sim);
    sim.emit('playerAttack', { weapon: wt, t: sim.timeMs });
    if (!spear) {
      // src 69808-69813: target-rotated scan (DN4 = (ID - 1 + r) mod len, alive
      // read at MonsterAlive[DN4 + 1]); no Type/pet filter; one hit (DN3 < DN2 = 1).
      const t = p.target, len = list.length, byId = _byId(sim);
      for (let r = 0; r < len && t && count < 1; r++) {
        const dn4 = Math.round(N(t.id) + r - (1 + Math.floor((r + N(t.id) - 1) / len) * len));
        const m = list[dn4];
        if (!m || !_aliveAt(byId, dn4) || m.node !== p.node || !_facingInReach(p, m, reach + 20)) continue;
        count++;
        let hits = 1; let l = [];
        const t18 = TN(sim, 1, 18), t33 = TN(sim, 1, 33), t48 = TN(sim, 1, 48);
        if (t18 > 0) {
          hits++; l = [{ line: 0, v: 1 + t18 / 100 }, { line: 1, v: TN(sim, 2, 18) / 100 }];
          if (t33 > 0) {
            hits++; l[0].v = 1 + (t18 + TN(sim, 2, 33)) / 100; l[1].v = (TN(sim, 2, 18) + TN(sim, 2, 33)) / 100; l.push({ line: 2, v: t33 / 100 });
            if (t48 > 0) {
              // src 69820: right-nested sums.
              hits++;
              l[0].v = 1 + (t18 + (TN(sim, 2, 33) + TN(sim, 2, 48))) / 100;
              l[1].v = (TN(sim, 2, 18) + (TN(sim, 2, 33) + TN(sim, 2, 48))) / 100;
              l[2].v = (TN(sim, 2, 18) + (t33 + TN(sim, 2, 48))) / 100;
              l.push({ line: 3, v: t48 / 100 });
            }
          }
        }
        createDmgPixel(sim, m, l, hits, 'basic');
      }
    }
    for (const m of (spear ? list : [])) {
      if (count >= max) break;
      if (m.alive === 1 && m.node === p.node && _facingInReach(p, m, reach + 20) && _isMonsterType(sim, m) && N(m.pet) === 0) {
        count++;
        let hits = 1;
        if (rng.randomFloatBetween(0.05, 100) < TN(sim, 1, 93)) hits++;
        if (rng.randomFloatBetween(0.05, 100) < TN(sim, 1, 139)) hits++;
        createDmgPixel(sim, m, [], Math.round(hits), 'basic');
      }
    }
  } else if (pmm[0] === 2 && p.animation === '2b') {
    // src 69842: the inputReq-2 attack move fires every Results frame, outside the swing timer.
    _attackMove(sim, [300, 9999]);
    // getFrameDurations()[0]: persists the AWT<.5 rewrite below across swings.
    if (p.actionTimer > N(p.bowFrameMs ?? v.bowFrameMs ?? 100) / 1000 * 7) {
      p.actionTimer = -0.01;
      const t = p.target;
      if (t && t.alive === 1 && t.node === p.node) _bowSwing(sim, t, wt);
    }
  } else if (p.animation === '2c' && p.actionTimer > 0.54) {
    // src 69859-69866: no PlayerMoveMaps gate. DN4 = ID + r - (1 + floor((r + ID - 1) / len) * len)
    // = (ID - 1 + r) mod len: scan MapMonstersList starting at the target and
    // hit the first eligible monster, only while some target is selected.
    p.actionTimer = -0.01;
    const t = p.target;
    const list = sim.world.monsters(sim);
    const len = list.length;
    for (let r = 0; r < len && t; r++) {
      const dn4 = Math.round(N(t.id) + r - (1 + Math.floor((r + N(t.id) - 1) / len) * len));
      if (dn4 < 0) continue;
      const m = list[dn4];
      const alive = list.find((x) => N(x.id) === dn4 + 1);
      if (!m || !alive || alive.alive !== 1 || m.node !== p.node) continue;
      if (!_facingInReach(p, m, reach + 40)) continue;
      if (!(N(v.arcane20) > 0 || !['StatusArc0', 'StatusArc1', 'StatusArc2'].some((s) => _hasStatus(m, s)))) continue;
      sim.state.dummyActor = m;
      if (!_attackMove(sim, [450, 465, 527, 496, 9999])) {
        if (rng.randomFloat() < TN(sim, 1, 499) / 100) castAttackofID1(sim, 499);
        if (TN(sim, 1, 587) > 0.1) castAttackofID1(sim, 482);
        const t528 = TN(sim, 1, 528);
        let hits = 1;
        for (let k = 0; k < 4; k++) if (rng.randomFloatBetween(0, 100) < t528 - 100 * k) hits++;
        if (rng.randomFloatBetween(0.05, 100) < TN(sim, 1, 454)) sim.world.addStatusToMonster(sim, m, 'StatusMark', 10);
        sim.emit('playerAttack', { weapon: wt, hits, t: sim.timeMs });
        // Cosmetic WeaponType 9 sparks: two shared-RNG jitter draws each (AE7 init 97706).
        for (let l = 0; l < hits; l++) {
          const bx = Math.round(-7 + (_mxc(m) + rng.randomInt(-3, 3) * (m.width / 2 / 5)));
          const by = Math.round(-7 + (_myc(m) + rng.randomInt(-3, 3) * (m.height / 2 / 5)));
          const b = _spawnBullet(sim, 9, 'wand', bx, by);
          sim.later(10 + 100 * l + 500, () => sim.recycleActor(b), b);
        }
        createDmgPixel(sim, m, [], hits, 'basic');
      }
      break;
    }
  }
  // Each Results animation branch ends with its own reset check (src 69828/69838/69856/69869).
  const resetWt = { '2_': 'FISTICUFF', '2a': 'SPEAR', '2b': 'BOW', '2c': 'WAND' }[p.animation];
  if (resetWt && p.actionTimer < -_awt(sim, resetWt) && pmm[0] === 2) { pmm[0] = 1; p.actionTimer = 0; }
}

// inputReq-2 "attack move" consumed by a bow/wand swing: RAW cooldown.
function _attackMove(sim, ids) {
  const st = sim.state;
  const id = st.attackSelected;
  if (!ids.includes(id)) return false;
  const def = attackDef(id);
  if (!def || N(def.inputReq) !== 2 || st.attackQueue !== 0) return false;
  castAttack(sim, id, { raw: true });
  st.attackSelected = -1;
  return true;
}

// Bow swing (src 69843-69855). The PlayerMoveMaps gate is checked only inside
// each delayed arrow; the swing itself rolls procs and multishot first.
function _bowSwing(sim, t, wt) {
  const p = sim.player, v = _v(sim), rng = sim.rng;
  if (rng.randomFloat() < TN(sim, 1, 287) / 100) _anim8(sim, t, t.x + N(t.offX), t.y + N(t.offY), 287);
  const awt = _awt(sim, 'BOW');
  // setFrameDuration(0..6): persists on the animation, so later swings keep it.
  if (awt < 0.5) p.bowFrameMs = 0 | Math.max(50, 100 - 70 * Math.max(0, 1 - awt));
  if (TN(sim, 1, 422) > 0.1) castAttackofID1(sim, 3150);
  // ActionBlock("anyBasicAttack") only regenerates MP inside dungeons (src 80339).
  let n = 1;
  if ((DUNGON[Number(sim.mapIdx)] ?? -1) === -1) {
    if (N(sim.state.tempest) === 1) n = Math.floor(n + (N(v.formStats?.tempest?.multishotPct) / 100 + rng.randomFloat()));
    else for (const id of [274, 304, 364]) if (rng.randomFloatBetween(0, 100) < TN(sim, 1, id)) n++;
  } else _unm(sim, 'dungeonMultiHit', 'DungeonStat("MultiHitPCT") bow multishot');
  p.numberOfAttacks = n;
  p.dmgIncoming = 0;
  sim.emit('playerAttack', { weapon: wt, hits: n, t: sim.timeMs });
  for (let e = 0; e < n; e++) sim.later(50 * e, () => _bowArrow(sim, e), p);
}

// One delayed bow shot (src 69845-69852): CritChance/CritDamage, then
// DamageDealed("RNG"); no Talent 640 super crit, no DamageMultipliers or boss
// multiplier. Within 45px it damages immediately; otherwise it fires an arrow
// carrying the pre-rolled damage.
function _bowArrow(sim, e) {
  const p = sim.player, v = _v(sim), rng = sim.rng;
  const t = p.target;
  if (!t || p.pmm[0] !== 2) return;
  const crit = rng.randomInt(0, 1000) / 10 < N(v.critChance) ? N(v.critDamage) : 1;
  let dmg = rollDamage(rng, N(v.damageMax), N(v.damageMastery), crit !== 1) * crit;
  const hc = _hitChance(sim, t);
  const missed = hc < rng.randomInt(1, 100);
  if (missed) dmg = 0;
  const def = sim.world.getDef(sim, t.type);
  dmg = _wwWeakness(sim, def, dmg);
  if (_hasStatus(t, 'StatusBlockFull')) dmg = 10;
  p.dmgIncoming += dmg;
  if (Math.abs(_xc(p) - _mox(t)) < 45) {
    if (_hasStatus(t, 'StatusBlockFull')) dmg = 1;
    if (_isMonsterType(sim, t)) {
      if (N(def?.DeathFrame) === -1) _unm(sim, 'bossHpArrow', 'DeathFrame -1 arrow damage (BossHP/Titan HP)');
      else sim.world.damageMonster(sim, t, dmg, { markWillDie: false, source: 'bow' });
    }
    _dmgNumber(sim);
    sim.emit('playerDmg', { uid: t.uid, dmg, crit, missed, source: 'bow', t: sim.timeMs });
    return;
  }
  _arrow(sim, t, dmg, _xc(p) + 30 * _sgn(p), _yc(p) - (25 - 2 * e), _sgn(p), crit);
  if (e === p.numberOfAttacks - 1 && String(t.type) !== 'BossPart' && t.hp - p.dmgIncoming <= 0) t.willDie = 1;
}

// ---------------------------------------------------------------------------
// Cast pipeline timers (EveryScene)
// ---------------------------------------------------------------------------
function _attackQueueLoop(sim) {
  const st = sim.state;
  const id = st.attackSelected;
  if (id === -1 || st.attackQueue !== 0 || N(st.attackCooldowns[String(id)]) > 0) return;
  const def = attackDef(id);
  if (!def) { st.attackSelected = -1; return; }
  const ir = N(def.inputReq);
  if (ir === 0) castAttack(sim, id);
  else if (ir === 2) return;
  // src 121611: mana/cooldown are spent and the skill stays selected (only
  // inputReq 1 keeps it). Its throws come from AttackInputs mouse clicks
  // (src 121633); auto mode never clicks, so nothing is thrown and the
  // selection clears at the 1-second `round(cd) == 1` check.
  else castAttack(sim, id, { effect: false });
}

// ---------------------------------------------------------------------------
// Food / potions (EquipmentOrder[2]). FoodBonuses(*CooldownBonus) is 1 for
// every food effect (src 66105), so Cooldown is used directly.
// ---------------------------------------------------------------------------
function _foodDef(f, i) {
  const key = f.order[i];
  return key && key !== 'Blank' ? ITEMS[key] || null : null;
}

function _foodDungeonOk(sim, def) {
  const inDung = (DUNGON[Number(sim.mapIdx)] ?? -1) !== -1;
  return inDung ? def.lvReqToCraft === 'DUNGEON' : def.lvReqToCraft !== 'DUNGEON';
}

// Depleted slot: Lab[16][1] refills min(cFood cap, storage) from storage,
// otherwise the slot becomes Blank (src 64882-64887 / 69271-69275 / 121125).
function _foodDeplete(sim, f, i, refill = true) {
  const item = f.order[i];
  f.qty[i] = 0;
  if (refill && f.labRefill && N(f.storage[item]) > 0) {
    f.qty[i] = Math.min(f.cap, N(f.storage[item]));
    f.storage[item] = N(f.storage[item]) - f.qty[i];
    sim.emit('foodRefilled', { slot: i, item, qty: f.qty[i], storage: f.storage[item], t: sim.timeMs });
    return;
  }
  f.order[i] = 'Blank';
  sim.emit('foodDepleted', { slot: i, item, t: sim.timeMs });
  const def = ITEMS[item];
  if (def && def.Effect !== 'Health') _foodRecomputeLive(sim, f, item);
}

// A depleted boost food drops out of the stats the source recomputes on every
// call (LIVE_FOOD_KEYS: max HP, move speed, MP regen, kill EXP). Damage and
// TotalStats stay at their cached run-start values because food depletion never
// clears DNSM.TotStatMAP (src 66091, 66238). Active Wraith/Tempest overrides
// keep their form values; the new base is restored when the form ends.
function _foodRecomputeLive(sim, f, item) {
  const v = _v(sim);
  let next = null;
  if (!sim.options?.inputs && sim.saveData) {
    try {
      next = buildLiveFoodInputs(sim.saveData, sim.charIdx, sim.mapIdx,
        { rawSave: sim.options?.rawSave, overrides: sim.options?.inputOverrides },
        f.order.slice(0, f.count), f.qty.slice(0, f.count));
    } catch (e) { next = null; }
  }
  if (!next) {
    if (!f.boostNotice) {
      f.boostNotice = true;
      _unm(sim, 'foodBoostDepleted', 'boost food ' + item + ' ran out mid-run; prebuilt inputs cannot be recomputed, so its stat bonus stays frozen');
    }
    return;
  }
  const st = sim.state, p = sim.player, b = st.formBase;
  const before = {};
  for (const k of LIVE_FOOD_KEYS) before[k] = v[k];
  const hpForm = st.wraith || st.tempest;
  const spdForm = st.tempest && N(sim.mapIdx) !== 266;
  const oldBaseHp = b ? b.playerMaxHp : v.playerMaxHp;
  for (const k of LIVE_FOOD_KEYS) {
    if (next[k] == null || !Number.isFinite(Number(next[k]))) continue;
    if (b && Object.prototype.hasOwnProperty.call(b, k)) b[k] = next[k];
    if (k === 'playerMaxHp' && hpForm) continue;
    if ((k === 'playerSpeedBonus' || k === 'playerSpeed') && spdForm) continue;
    v[k] = next[k];
  }
  if (p && !f.fixedHp && N(next.playerMaxHp) > 0) {
    const hpMax = N(next.playerMaxHp);
    if (b && b.player && N(b.player.hpMax) === N(oldBaseHp)) b.player.hpMax = hpMax;
    if (!hpForm && N(p.hpMax) === N(oldBaseHp)) p.hpMax = hpMax;
    // _event_SineTimes clamps current HP to PlayerHPmax (src 75407).
    if (p.hp > p.hpMax) p.hp = p.hpMax;
  }
  const after = {};
  for (const k of LIVE_FOOD_KEYS) after[k] = v[k];
  sim.emit('foodStatsRecomputed', { item, before, after, cached: ['damage', 'totalStats'], t: sim.timeMs });
}

function _foodConsumeOne(sim, f, i, refill = true) {
  f.qty[i] = N(f.qty[i]) - 1;
  sim.emit('foodConsumed', { slot: i, item: f.order[i], qty: f.qty[i], t: sim.timeMs });
  if (N(f.qty[i]) <= 0) _foodDeplete(sim, f, i, refill);
}

// ConsumeFoods(e) src 69263: Trigger e foods roll Cooldown% then non-consume.
function consumeFoods(sim, trigger) {
  const f = sim.state.food;
  if (!f) return;
  const rng = sim.rng, v = _v(sim);
  for (let i = 0; i < f.count; i++) {
    const def = _foodDef(f, i);
    if (!def || !_foodDungeonOk(sim, def) || N(def.Trigger) !== trigger) continue;
    if (!(rng.randomFloatBetween(0, 100) < N(def.Cooldown) * 1)) continue;
    if (!(N(v.foodNotConsume) < rng.randomFloatBetween(0, 100))) continue;
    _foodConsumeOne(sim, f, i);
  }
}

// ActorEvents_232 _event_ConsumeFoodNEW (src 64871, every 150 ms). Gated by
// GeneralINFO[82], set by the UI init runLater(700).
function _consumeFoodNew(sim) {
  const f = sim.state.food, p = sim.player, st = sim.state;
  if (!f || sim.timeMs < 700) return;
  if (!p.dead) {
    const v = _v(sim), rng = sim.rng;
    for (let i = 0; i < f.count; i++) {
      const def = _foodDef(f, i);
      if (!def || N(f.cd[i]) !== 0 || !_foodDungeonOk(sim, def) || def.Effect !== 'Health') continue;
      if (!(p.hp / p.hpMax * 100 < N(def.Trigger)) || !(0.1 < p.hp)) continue;
      const heal = N(def.Amount) * N(v.healthFoodEffect);
      p.hp += heal;
      f.cd[i] = N(def.Cooldown) * 1;
      sim.emit('foodEaten', { slot: i, item: f.order[i], heal, hp: p.hp, cooldown: f.cd[i], t: sim.timeMs });
      if (N(v.foodNotConsume) < rng.randomFloatBetween(0, 100)) _foodConsumeOne(sim, f, i);
    }
  }
  if (N(st.generalInfo9) > 0) { consumeFoods(sim, -1); st.generalInfo9 = N(st.generalInfo9) - 1; }
}

// ActorEvents_232 _event_ConsumeFood (src 64896, every 1 s): movement potions
// (Trigger -2) roll per 400 px of x+y travel; depletion never refills.
function _consumeFoodMove(sim) {
  const f = sim.state.food, p = sim.player;
  if (!f || Number(sim.mapIdx) === 23) return;
  const g = f.move;
  if (g[0] === -1) { g[0] = p.x; g[1] = p.y; }
  g[3] = g[3] + (Math.abs(g[0] - p.x) + Math.abs(g[1] - p.y));
  g[0] = p.x; g[1] = p.y;
  if (!(400 < g[3])) return;
  const rng = sim.rng, v = _v(sim);
  for (let i = 0; i < f.count; i++) {
    const def = _foodDef(f, i);
    if (!def || N(def.Trigger) !== -2) continue;
    if (!(rng.randomFloatBetween(0, 100) < N(def.Cooldown) * 1 * (g[3] / 400))) continue;
    if (!(N(v.foodNotConsume) < rng.randomFloatBetween(0, 100))) continue;
    _foodConsumeOne(sim, f, i, false);
  }
  g[3] = 0;
}

// Mana potions (Trigger -3) in the 50 ms loop while MP < max (src 121115).
function _manaPotions(sim) {
  const f = sim.state.food, p = sim.player;
  if (!f || !(p.mp < p.mpMax)) return;
  const rng = sim.rng, v = _v(sim);
  for (let i = 0; i < f.count; i++) {
    const def = _foodDef(f, i);
    if (!def || N(def.Trigger) !== -3) continue;
    if (!(rng.randomFloatBetween(0, 100) < N(v.pctMpPerSec) / 20)) continue;
    if (!(rng.randomFloatBetween(0, 100) < N(def.Cooldown) * 1)) continue;
    if (!(N(v.foodNotConsume) < rng.randomFloatBetween(0, 100))) continue;
    _foodConsumeOne(sim, f, i);
  }
}

function _every005(sim) {
  const st = sim.state;
  if (st.attackQueue > 0) st.attackQueue -= 0.05;
  else if (st.attackQueue < 0) st.attackQueue = 0;
  _manaPotions(sim);
}

function _every1sec(sim) {
  const st = sim.state, p = sim.player, v = _v(sim);
  for (const k of Object.keys(st.attackCooldowns)) {
    const cd = N(st.attackCooldowns[k]);
    if (Math.round(cd) === 1 && String(st.attackSelected) === k) st.attackSelected = -1;
    if (cd > 0) st.attackCooldowns[k] = Math.round(Math.max(cd - 1, 0));
  }
  p.mp = Math.min(p.mp + N(v.pctMpPerSec) / 100 * p.mpMax, p.mpMax);
  const list = st.buffsActive;
  // Forward scan with a removed-count offset; 525/317 throw vials while active (AE20 1-sec loop).
  const len = list.length;
  let removed = 0;
  for (let i = 0; i < len; i++) {
    const e = list[i - removed];
    if (!e || !(e[1] > 0)) continue;
    e[1] -= 1;
    const id = e[0];
    if (Number(id) === 525) { if (sim.rng.randomInt(1, 2) === 1) _throwVial(sim, 'PoisonVial'); }
    else if (Number(id) === 317) { if (sim.rng.randomInt(1, 3) === 1) _throwVial(sim, 'FireBomb'); }
    if (e[1] <= 0) { list.splice(i - removed, 1); removed++; _unmirrorBuff(sim, id); sim.emit('buffExpired', { id, t: sim.timeMs }); }
  }
  // AutoRespawn (src 64930): GeneralINFO[8] 0 alive, 1 dying (DyingButtons),
  // 2 after 800 ms, 3 reviving. Decrement and revive start are exclusive, so
  // revive begins on the tick after RespawnTime reaches 0.
  if (N(p.gi8) !== 0) {
    if (p.respawn > 0) p.respawn -= 1;
    else if (p.gi8 === 2) {
      p.gi8 = 3; p.reviving = true;
      sim.later(900, () => {
        p.animation = '0'; p.pmm[0] = 1; p.hp = p.hpMax; p.takeDmgTimer = 5; p.dead = false; p.reviving = false; p.gi8 = 0;
        sim.emit('playerRespawn', { t: sim.timeMs });
      }, p);
    }
  } else p.respawn = 0;
}

function _autoCast(sim) {
  const st = sim.state, p = sim.player, v = _v(sim);
  if (N(v.ola25) !== 1 || !p.autoMove || !(p.hp > 0.1) || p.animation === 'Da' || st.attackSelected !== -1) return;
  // src 70389-70392: one pass in BuffsActive order; long buffs and the four
  // special ids share the list, so indexOf below can point at a different row.
  const ids = [];
  for (const b of st.buffsActive) {
    const bid = N(b[0]);
    if (N(b[1]) > 20 || bid === 168 || bid === 198 || bid === 318 || bid === 423) ids.push(bid);
  }
  // MonsterWillDie[r + 1] / MonsterAlive[r + 1] quirk (src 70407, 70427).
  const byId = _byId(sim);
  const scanOk = (r) => { const h = byId.get(r + 1); return !!h && !h.willDie && h.alive === 1; };
  const rows = v.attackLoadout || [];
  const XC = _xc(p), YC = _yc(p);
  for (let r = 0; r <= 3; r++) {
    for (let s = 0; s <= 5; s++) {
      const id = rows[r]?.[s];
      if (id == null || id === 'Null') continue;
      const def = attackDef(id);
      if (!def) continue;
      if (N(st.attackCooldowns[String(id)]) > 0 || p.mp < N(def.manaCost)) continue;
      const act = N(def.AFKactivity);
      if (!(act === N(v.expType) || act === -1 || (act === 0 && String((st.afkTarget && sim.world.getDef(sim, st.afkTarget)?.AFKtype) || '') === 'FIGHTING'))) continue;
      const t = String(def.AFKtype || '');
      const range = N(def.AFKrange);
      let sel = false;
      if (t === 'auto') sel = true;
      else if (t === 'buff') {
        const i = ids.indexOf(N(id));
        if (i >= 0) sel = N(st.buffsActive[i]?.[1]) < 10;
        else sel = true;
      } else {
        const list = sim.world.monsters(sim);
        const gate = t.includes('line') || (p.target != null && t.includes('target'));
        if (gate) {
          for (let r = 0; r < list.length; r++) {
            const m = list[r];
            if (!scanOk(r)) continue;
            if (!t.includes('multi') && m.node !== p.node) continue;
            const dx = _mxc(m) - XC;
            if ((p.dir === 1 && dx > 0 && dx < range) || (p.dir !== 1 && dx > -range && dx < 0)) { sel = true; break; }
          }
        }
        if (!sel && t.includes('circle')) {
          for (let r = 0; r < list.length; r++) {
            const m = list[r];
            if (!scanOk(r)) continue;
            const d = distanceEqn(_mxc(m), _myc(m), XC, YC);
            if (d > 0 && d < range) { sel = true; break; }
          }
        }
      }
      if (sel) { st.attackSelected = Number(id); sim.emit('autoSelect', { id: Number(id), t: sim.timeMs }); return; }
    }
  }
}

// ---------------------------------------------------------------------------
// _event_1secallMobDead (src 83268, ActorEvents_116 1000 ms timer registered
// at src 84295). World-side mechanic hosted here because it is gated by the
// player's buff 167. Literal quirk: the scan reads the actor type/temp flag of
// MapMonstersList[l] but MonsterHP[l]/MonsterAlive[l], which are 1-based by
// MonsterID, i.e. the state of the monster with ID l. Index 0 is skipped, so a
// single-actor list never triggers.
// ---------------------------------------------------------------------------
function _allMobDead(sim) {
  const st = sim.state, v = _v(sim);
  const wraith = N(st.wraith) === 1;
  if (!(_buffBonus(sim, 167) > 0 || wraith) || N(st.gi[78]) !== 0 || sim.mapIdx === 69) return;
  const list = sim.world.monsters(sim);
  const byId = new Map();
  for (const m of sim.monsters) if (!m.recycled) byId.set(m.id, m);
  for (let l = 1; l < list.length; l++) {
    const a = list[l];
    if (N(a.temp) === 0) {
      const sp = String(sim.world.getDef(sim, a.type)?.SpecialType ?? '');
      const hm = byId.get(l);
      const type = String(a.type || '');
      if (!sp.includes('a') && hm && N(hm.hp) > 0 && hm.alive === 1 && !type.includes('Bug') && !type.includes('Prehistrium') && !NonAFKmonsters.includes(type)) break;
    }
    if (l === Math.round(list.length - 1)) {
      // src 83272: Wraith elimination only advances OLA[335]/popups, then skips the respawn branch.
      if (wraith && N(v.grimoire21) >= 0.1) { sim.emit('wraithElimination', { t: sim.timeMs }); return; }
      if (!(_buffBonus(sim, 167) > 0)) return;
      st.gi[78] = 1;
      sim.emit('allMobDead', { t: sim.timeMs });
      sim.later(2400, () => {
        for (const m of sim.world.monsters(sim)) {
          if (N(m.temp) !== 0) continue;
          if (String(sim.world.getDef(sim, m.type)?.SpecialType ?? '').includes('a')) continue;
          st.respawn[m.id + sim.scene.N] = 0;
        }
        sim.later(500, () => { st.gi[78] = 0; });
        if (TN(sim, 1, 229) > 0.001) royalIntervention(sim);
      });
    }
  }
}

// CanWeSpawnMobs (src 66000): scene-name exclusions, a "Monster" AFK target,
// NONdummies[46] == 0 and PixelHelperActor[7] ActorEvents_340 GenINFO[8] == -1.
const NO_SPAWN_SCENES = ['SewerD', 'uAquaA6', 'wLavaAhole', 'Colosseum', 'zDesertMummy', 'BOSS', 'Town', 'Dungeon', 'ySnowD3'];
export function canWeSpawnMobs(sim) {
  const scene = String(sim.scene?.name ?? '');
  if (NO_SPAWN_SCENES.some((s) => scene.includes(s)) || scene.toLowerCase().includes('boss')) return false;
  const st = sim.state;
  return String(sim.world.getDef(sim, String(MapAFKtarget[sim.mapIdx] ?? ''))?.Type ?? '') === 'Monster'
    && N(st.nd46) === 0 && N(st.gi7_8) === -1;
}

// Royal Intervention (src 83283): MapAFKtarget mobs near the player node. The
// && chain draws randomFloat only after the GenINFO[8] gate and checks
// CanWeSpawnMobs after the roll. Nodes are not filtered, so on maps whose
// portal pad is a node (map 152 node 11) RI can spawn mobs on it.
export function royalIntervention(sim) {
  const v = _v(sim), rng = sim.rng, p = sim.player, st = sim.state;
  const type = String(MapAFKtarget[sim.mapIdx] ?? 'Nothing');
  st.gi[85] = type;
  if (type === 'Nothing' || type === 'Z' || String(sim.world.getDef(sim, type)?.SpecialType ?? '') === 'a') return;
  if (N(st.gi7_8) !== -1) return;
  if (!(rng.randomFloat() < N(v.riChance)) || !canWeSpawnMobs(sim)) return;
  const nodes = _nodes(sim);
  for (let e = 0, t = Math.floor(N(v.riMobs)); e < t; e++) {
    const nb = Math.min(Math.max(p.node + rng.randomInt(-4, 4), 0), _nodeCount(sim) - 1);
    const x = rng.randomInt((N(nodes[nb].x) + 30) | 0, (N(nodes[nb].length) - 30) | 0);
    const mon = sim.world.createMonster(sim, type, nb, x, 'GraveyardMobSpawn');
    if (mon) sim.world.addStatusToMonster(sim, mon, 'StatusRoyal', 300);
  }
}

// ---------------------------------------------------------------------------
// Damage taken / death
// ---------------------------------------------------------------------------
function _takeDamage(sim) {
  const p = sim.player;
  if (!(p.pmm[0] === 7 || !(p.takeDmgTimer < 0.01) || p.animation === '4')) sim.world.contactDamage(sim);
  _updateAfkTarget(sim);
}

// End of _event_TakeDamage (src 69953): while not walking/idle/jumping, the
// current non-temp (or Bug) target that is not in NonAFKmonsters becomes the
// saved AFKtarget. Overkill, gi141 and AFK-type EXP sharing read it live.
function _updateAfkTarget(sim) {
  const p = sim.player;
  const t = p.target;
  if (sim.scene.name?.includes?.('Tutorial') || t == null || t.kind !== 'monster') return;
  const a = String(p.animation);
  if (a === '0' || a === '1' || a === '3' || a === '4') return;
  if (NonAFKmonsters.includes(t.type)) return;
  if (String(sim.world.getDef(sim, t.type)?.Type) !== 'Bug' && t.temp !== 0) return;
  if (sim.state.afkTarget !== t.type) {
    sim.state.afkTarget = t.type;
    sim.emit('afkTarget', { type: t.type, t: sim.timeMs });
  }
}

function _die(sim) {
  const p = sim.player;
  if (p.hp <= 0 && p.pmm[0] !== 7) {
    const nd = _node(sim, p.node);
    p.takeDmgTimer = 0;
    sim.state.attackSelected = -1;
    p.vx = 0; p.vy = 0;
    p.y = N(nd?.y) - 49;
    p.animation = 'Da';
    p.pmm[0] = 7;
    p.dead = true;
    if (!(p.respawn > 0)) p.respawn = N(_v(sim).autoRespawnSec) + 1;
    // _event_DyingButtons (src 64748-64754): GeneralINFO[8] 0 -> 1, then 2 after 800 ms.
    if (N(p.gi8) === 0) { p.gi8 = 1; sim.later(800, () => { p.gi8 = 2; }, p); }
    sim.emit('playerDied', { respawn: p.respawn, t: sim.timeMs });
  }
}

// Replay pose: `facing` is -1/1 (source _PlayerDirection 0/1 stays in p.dir),
// `animState` is a coarse replay category, `attackAnim` the source swing anim.
const ATTACK_ANIMS = new Set(['2_', '2a', '2b', '2c']);
export function playerAnimState(p) {
  const a = String(p.animation);
  if (p.dead || a === 'Da' || p.reviving) return 'dead';
  if (ATTACK_ANIMS.has(a)) return 'attack';
  if (a === '3' || a === '4' || (p.pmm && (p.pmm[0] === 3 || p.pmm[0] === 4))) return 'jump';
  if (a === '1') return 'walk';
  if (a === 'Filler') return 'cast';
  return 'idle';
}
function _replayPose(p) {
  p.facing = p.dir === 1 ? 1 : -1;
  p.animState = playerAnimState(p);
  p.attackAnim = p.animState === 'attack' ? String(p.animation) : null;
}

// ---------------------------------------------------------------------------
// Manual skill presses (AttackLoadout hotbar click / key, src 64778). The
// source gate: a non-Null loadout slot, PlayerMoveMaps != 7 (alive), a zero
// AttackCooldowns entry, the Dungon()/RANDOlist[43] dungeon whitelist, and
// PlayerMP >= the raw manaCost. A successful press overwrites AttackSelected;
// the AttackQueue loop then casts it. Auto mode never presses AFKactivity -2
// skills, so these are scheduled explicitly: `{ id, everySec, startSec }`,
// where everySec 0 presses whenever the gate opens. A failed press is retried
// every 50 ms tick; the next press is due everySec after the skill casts.
// ---------------------------------------------------------------------------
// Optional `at` ({ node, x } or an array of them, x = the player's centre) places
// the cast: the skill spawns where the player stands (e.g. Arcane Crystal), so the
// player turns AutoMove off, click-walks there, presses, and restores AutoMove
// once the skill casts. Successive placed casts cycle through the points.
export function normalizeManualCasts(list) {
  const out = [];
  for (const e of Array.isArray(list) ? list : []) {
    const id = Number(e?.id);
    if (!Number.isInteger(id) || id < 0) continue;
    const row = { id, everySec: Math.max(0, N(e.everySec)), startSec: Math.max(0, N(e.startSec)) };
    const at = [];
    for (const pt of Array.isArray(e.at) ? e.at : e.at ? [e.at] : []) {
      const node = Number(pt?.node), x = Number(pt?.x);
      if (Number.isInteger(node) && node >= 0 && Number.isFinite(x)) at.push({ node, x });
    }
    if (at.length) row.at = at;
    if (PLACED_SKILLS[id]?.once) { row.once = true; row.everySec = 0; if (row.at) row.at = row.at.slice(0, 1); }
    const cs = Number(e.cycleStart), cyc = PLACED_SKILLS[id]?.cycle;
    if (cyc && e.cycleStart != null && Number.isInteger(cs) && cs >= 0 && cs < cyc.length) row.cycleStart = cs;
    const kt = Number(e.keepType);
    if (cyc && e.keepType != null && Number.isInteger(kt) && kt >= 0 && kt < cyc.length) row.keepType = kt;
    out.push(row);
  }
  return out;
}

// Design_23_23_EveryScene._event_MoveNodesNEW (src 121180), the mouse-release
// ground click. Ignored unless PlayerMoveMaps[0] is 0/1/2/5. PlayerSpeedBonus is
// uncapped above 2 (statues can push it into the thousands), so the same-node
// "already here" tolerance clamps it to 2.7 like the source.
function _groundClickTol(sim) { return 10 * (Math.min(2.7, N(_v(sim).playerSpeedBonus)) - 0.5); }
export function clickGround(sim, node, x) {
  const p = sim.player, pmm = p.pmm;
  if (![0, 1, 2, 5].includes(pmm[0])) return false;
  pmm[1] = 0;
  const tol = _groundClickTol(sim), xc = _xc(p);
  if (!p.autoMove && (p.node !== node || x < xc - tol || x > xc + tol)) { p.target = null; p.mouseClickX = x; }
  if (p.node !== node) { p.mouseClickX = x; pmm[0] = 5; pmm[2] = node; }
  else if (pmm[0] !== 2 || !p.autoMove) { pmm[0] = 1; pmm[2] = node; p.mouseClickX = x; }
  return true;
}
export const MANUAL_WALK_LIMIT_MS = 60000;
// Manual skills whose effect spawns where the player stands. Arcane Crystal
// (588, src 1725) needs a platform at least 200 wide; its WT19 crystal spawns per
// arcaneCrystalRect (`effectRect`). Its crystal type is runtime-only
// GenINFO[26][40] (not saved, 0 on load); each successful cast uses it, then
// advances it mod 3. StatusArc kills add to MapBon[map][type]: Drop Rate,
// Monster EXP, AFK gains. `cycleStart` seeds it. Crystals never expire, only a
// new cast replaces them, so `keepType` stops pressing while a live crystal of
// that type exists (casts needed = (keepType - cycleStart) mod 3 + 1) and every
// cast then uses the first drop point.
// Graveyard (198) is auto-cast (AFKactivity 0), so placing it is a single
// opening cast (`once`): walk there with AutoMove off at t = 0, cast, then
// AutoMove resumes and recasts it wherever the player is after it expires.
// Its waves spawn on platform index _Num1 +/- 2 (`spreadNodes`).
const PLACED_SKILLS = {
  588: { minNodeWidth: 200, edgeMargin: 15, effectName: 'crystal', effectAnim: 'WT19', effectRect: arcaneCrystalRect, cycle: ['Drop Rate', 'Monster EXP', 'AFK gains'] },
  198: { minNodeWidth: 0, edgeMargin: 15, effectName: 'graveyard', effectAnim: 'WT16', effectRect: graveyardRect, once: true, autoCast: true, spreadNodes: 2 },
};
export function manualPlacement(id) { return PLACED_SKILLS[Number(id)] || null; }
// Default drop point when the player has not placed one on a map: the centre of the
// qualifying platform (width >= minNodeWidth) with the most monster spawn slots
// (SCENE_SPAWNS rows are [type, node]); ties and spawnless maps take the widest
// platform. Clamped by edgeMargin like a clicked point. Null when no platform qualifies.
export function defaultManualPoint(id, mapIdx) {
  const pl = manualPlacement(id);
  const nodes = SCENE_GEOMETRY[Number(mapIdx)]?.nodes || [];
  if (!pl) return null;
  const spawns = {};
  for (const m of SCENE_SPAWNS[Number(mapIdx)]?.mobs || []) spawns[N(m[1])] = (spawns[N(m[1])] || 0) + 1;
  let best = null;
  nodes.forEach((n, i) => {
    const x0 = N(n?.x), x1 = N(n?.length), w = x1 - x0;
    if (!n || w < Math.max(1, pl.minNodeWidth || 0)) return;
    const c = spawns[i] || 0;
    if (!best || c > best.spawns || (c === best.spawns && w > best.w)) best = { node: i, spawns: c, w, x0, x1 };
  });
  if (!best) return null;
  const m = pl.edgeMargin || 0;
  return { node: best.node, x: Math.round(Math.max(best.x0 + m, Math.min(best.x1 - m, (best.x0 + best.x1) / 2))), spawns: best.spawns };
}
// Loadout skills that only a manual press casts (AFKactivity -2) and that have a
// combat effect here, plus auto-cast skills with a placed opening cast (Graveyard). Forms (195/420/585) are driven by the form toggles instead.
const FORM_SKILLS = new Set([195, 420, 585]);
export function manualCastSkills(loadoutRows) {
  const ids = [];
  for (const r of Array.isArray(loadoutRows) ? loadoutRows : []) {
    for (const x of Array.isArray(r) ? r : []) {
      const id = Number(x);
      if (x == null || x === 'Null' || !Number.isInteger(id) || ids.includes(id)) continue;
      const def = attackDef(id);
      if (!def || FORM_SKILLS.has(id) || NO_HANDLER.has(id)) continue;
      if (N(def.AFKactivity) !== -2 && !PLACED_SKILLS[id]?.autoCast) continue;
      ids.push(id);
    }
  }
  return ids;
}
export function manualPressGate(sim, id) {
  const st = sim.state, p = sim.player, v = _v(sim);
  const rows = v.attackLoadout || [];
  if (!rows.some((r) => (r || []).some((x) => x != null && x !== 'Null' && Number(x) === id))) return 'not-in-loadout';
  if (p.pmm[0] === 7) return 'dead';
  if (N(st.attackCooldowns[String(id)]) !== 0) return 'cooldown';
  if ((DUNGON[Number(sim.mapIdx)] ?? -1) !== -1 && !(RANDOlist[43] || []).map(String).includes(String(id))) return 'dungeon';
  const def = attackDef(id);
  if (!def) return 'no-def';
  if (!(p.mp >= N(def.manaCost))) return 'mana';
  return null;
}
function _manualCasts(sim, list) {
  const st = sim.state, p = sim.player;
  const sched = list.map((e) => ({
    ...e, due: e.startSec * 1000, presses: 0, casts: 0, blocked: {},
    ...(e.at ? { atIdx: 0, walk: null, walks: 0, walkMs: 0, placed: [] } : {}),
  }));
  st.manualCasts = sched;
  for (const e of sched) if (e.id === 588 && e.cycleStart != null) (st.gi26 || (st.gi26 = {}))[40] = e.cycleStart;
  const endWalk = (e, reason) => {
    p.autoMove = e.walk.prevAuto;
    e.walkMs += sim.timeMs - e.walk.since;
    if (reason) {
      e.blocked[reason] = (e.blocked[reason] || 0) + 1;
      sim.emit('manualWalkAbort', { id: e.id, node: e.walk.pt.node, x: e.walk.pt.x, reason, t: sim.timeMs });
      e.due = sim.timeMs + e.everySec * 1000;
      if (e.once) e.gaveUp = reason;
    }
    e.walk = null;
    if (e.keepType == null) e.atIdx = (e.atIdx + 1) % e.at.length;
  };
  // Stop-on mode: crystals persist until a newer cast replaces them, so stop
  // pressing while a live (unreplaced) crystal of the kept type exists.
  const kept = (e) => {
    if (e.keepType == null || e.id !== 588) return false;
    const on = _liveWT(sim, 'WT19').some((o) => o.list && o.list[1] !== 1 && N(o.list[2]) === e.keepType);
    if (on && e.keptAt == null) { e.keptAt = sim.timeMs; sim.emit('manualKept', { id: e.id, type: e.keepType, t: sim.timeMs }); }
    if (!on) e.keptAt = null;
    return on;
  };
  // The schedule advances when the pressed skill actually casts; a press that
  // auto-cast later overwrites is pressed again. Pressing the skill that is
  // already selected would deselect it (src 64774), so the player waits instead.
  sim.on('cast', (c) => {
    for (const e of sched) {
      if (e.id !== Number(c.id) || sim.timeMs < e.due) continue;
      if (e.once && e.casts > 0) continue;
      if (e.at && !e.walk) continue; // an auto cast elsewhere is not the placed cast
      e.casts++;
      e.due = sim.timeMs + e.everySec * 1000;
      if (e.walk) {
        const rec = { t: sim.timeMs, node: p.node, x: _xc(p), target: e.walk.pt };
        if (e.id === 588) { const b = _liveWT(sim, 'WT19').find((o) => o.list?.[1] === -1); if (b) { rec.crystalX = _bxc(b); rec.crystalY = _byc(b); rec.crystalType = b.list[2]; } }
        else { const pl = PLACED_SKILLS[e.id], b = pl && _liveWT(sim, pl.effectAnim).find((o) => o.skill === e.id && o.createdAt === sim.timeMs); if (b) { rec.effectX = _bxc(b); rec.effectY = _byc(b); } }
        e.placed.push(rec);
        sim.emit('manualPlaced', { id: e.id, ...rec });
        endWalk(e, null);
      }
    }
  });
  // Placed press: walk with AutoMove off, then press once standing at the point.
  // Returns true while the walk owns the hotbar.
  const placedStep = (e) => {
    const dead = p.pmm[0] === 7;
    if (!e.walk) {
      // Start only once the skill is pressable, so AutoMove is not left off waiting.
      const why = manualPressGate(sim, e.id);
      if (why) { e.blocked[why] = (e.blocked[why] || 0) + 1; return false; }
      const pt = e.at[e.atIdx];
      e.walk = { pt, since: sim.timeMs, aliveMs: 0, prevAuto: p.autoMove, arrived: false };
      e.walks++;
      p.autoMove = false;
      sim.emit('manualWalk', { id: e.id, node: pt.node, x: pt.x, t: sim.timeMs });
    }
    const w = e.walk, pt = w.pt, nodes = _nodes(sim);
    if (dead) return true; // keep AutoMove off; re-click after respawn
    w.aliveMs += 50;
    if (!nodes[pt.node] || (p.node !== pt.node && pathfinder(nodes, p.node, pt.node) == null)) { endWalk(e, 'unreachable'); return false; }
    if (w.aliveMs > MANUAL_WALK_LIMIT_MS) { endWalk(e, 'walk-timeout'); return false; }
    if (st.attackSelected === e.id) return true;
    // Arrived once walking stopped at the point, or when standing inside the
    // click tolerance where the source keeps the current target (re-clicking
    // cannot move the player closer); the cast does not need a cleared target.
    // Only grounded states 1/2 count: 0/5 are pathing and 3/4/6 are mid-jump/drop
    // transitions that can still land on another platform.
    // Each walk clicks at least once: a stale click from the previous walk can
    // match the point after AutoMove has since moved the player elsewhere.
    const still = p.node === pt.node && p.vx === 0 && (p.pmm[0] === 1 || p.pmm[0] === 2);
    const at = still && ((w.clicked && p.pmm[0] === 1 && p.target == null) || Math.abs(_xc(p) - pt.x) <= _groundClickTol(sim));
    if (!at) {
      if (!w.clicked || p.pmm[2] !== pt.node || p.mouseClickX !== pt.x || p.target != null) { clickGround(sim, pt.node, pt.x); w.clicked = true; }
      return true;
    }
    w.arrived = true;
    const why = manualPressGate(sim, e.id);
    if (why) { e.blocked[why] = (e.blocked[why] || 0) + 1; return true; }
    st.attackSelected = e.id;
    e.presses++;
    sim.emit('manualPress', { id: e.id, t: sim.timeMs, node: p.node, x: _xc(p) });
    return true;
  };
  sim.every(50, () => {
    const walking = sched.find((e) => e.walk);
    if (walking) { placedStep(walking); return; }
    for (const e of sched) {
      if (sim.timeMs < e.due || (e.once && (e.casts > 0 || e.gaveUp))) continue;
      if (st.attackSelected === e.id) return;
      if (kept(e)) continue;
      if (e.at) { if (placedStep(e)) return; continue; }
      const why = manualPressGate(sim, e.id);
      if (why) { e.blocked[why] = (e.blocked[why] || 0) + 1; continue; }
      st.attackSelected = e.id;
      e.presses++;
      sim.emit('manualPress', { id: e.id, t: sim.timeMs });
      return; // one hotbar press per tick; AttackSelected holds a single skill
    }
  });
}

// ---------------------------------------------------------------------------
// Player module
// ---------------------------------------------------------------------------
export function autoPlayer(opts = {}) {
  const mod = {
    name: 'auto',
    init(sim) {
      const v = _v(sim), p = sim.player;
      // Map 216 starts on node 1 inside an open cavern (src 157424).
      const node0 = opts.node ?? sim.world.defaultPlayerNode(sim.mapIdx, v.holeCavern) ?? 0;
      const nd = _node(sim, node0) || _node(sim, 0);
      const width = N(v.playerWidth) || 94, height = N(v.playerHeight) || 50;
      const hpMax = N(opts.hp ?? v.playerMaxHp) || 1, mpMax = N(v.playerMaxMp) || 1;
      Object.assign(p, {
        width, height,
        x: opts.x ?? Math.round((N(nd.x) + N(nd.length)) / 2 - width / 2),
        y: N(nd.y) - 49, vx: 0, vy: 0,
        node: nd === _node(sim, node0) ? node0 : 0,
        hp: v.initialHp != null ? N(v.initialHp) : hpMax, hpMax,
        mp: v.initialMp != null ? N(v.initialMp) : mpMax, mpMax,
        defence: N(v.playerDefence), invulnSeconds: N(v.invulnSeconds) || 2.65,
        takeDmgTimer: 0, animation: '0', dead: false, autoMove: opts.autoMove ?? true, menuOpen: false,
        target: null, dir: 1, actionTimer: 0, bowFrameMs: N(sim.inputs.values.bowFrameMs) || 100, dmgIncoming: 0, numberOfAttacks: 1, mouseClickX: 0, nodeChanges: 0, targetTemp: null, respawn: 0, reviving: false, gi8: 0, pinfo0: 0,
        pmm: [1, 1, nd === _node(sim, node0) ? node0 : 0, null],
        xCenter() { return this.x + this.width / 2; },
        yCenter() { return this.y + this.height / 2; },
      });
      Object.defineProperty(p, 'moveState', { get() { return p.pmm[0]; }, configurable: true });
      const st = sim.state;
      // All skills start off cooldown (no source map-entry delay); saved AtkCD_X is opt-in.
      st.attackCooldowns = Object.assign({}, opts.useSavedCooldowns ? v.savedCooldowns || {} : v.initialCooldowns || {});
      st.attackSelected = -1;
      st.attackQueue = 0;
      st.buffsActive = [];
      // initialBuffs already excludes saved timed buffs unless the useSavedBuffs input is set.
      for (const b of v.initialBuffs || []) { st.buffsActive.push([Number(b[0]), N(b[1]), N(b[2])]); _mirrorBuff(sim, Number(b[0])); }
      _applyFormOverrides(sim);
      const fs = v.foodSlots || { count: 0, order: [], qty: [] };
      const savedCd = opts.useSavedFoodCooldowns ? v.savedFoodCooldowns || [] : [];
      st.food = {
        count: N(fs.count), order: (fs.order || []).map(String), qty: (fs.qty || []).map(N),
        cd: Array.from({ length: 8 }, (_, i) => N(savedCd[i])),
        storage: Object.assign({}, v.foodStorage || {}),
        labRefill: !!v.labFoodRefill, cap: N(v.cFoodCap),
        move: [-1, 0, 0, 0], boostNotice: false, fixedHp: opts.hp != null,
      };

      sim.every(10000, () => { p.nodeChanges = 0; }, p);
      sim.every(150, () => _findNewNode(sim), p);
      sim.every(50, () => _movement(sim), p);
      sim.every(50, () => _actionsAttacks(sim), p);
      sim.every(50, () => _results(sim), p);
      sim.every(150, () => _stopMoving(sim), p);
      sim.every(150, () => _takeDamage(sim), p);
      sim.every(50, () => _every005(sim), p);
      sim.every(1000, () => _every1sec(sim), p);
      sim.every(1000, () => _autoCast(sim), p);
      const manual = normalizeManualCasts(opts.manualCasts);
      if (manual.length) _manualCasts(sim, manual);
      // ActorEvents_232 (UI actor) food timers.
      sim.every(150, () => _consumeFoodNew(sim));
      sim.every(1000, () => _consumeFoodMove(sim));
      if (!sim.state.gi) sim.state.gi = {};
      if (sim.state.gi[78] == null) sim.state.gi[78] = 0;
      if (sim.state.gi[81] == null) sim.state.gi[81] = N(_v(sim).gi81); // T527 poison-hit stack (WT4 power)
      sim.every(1000, () => _allMobDead(sim));
      sim.every(330, () => event025sec(sim)); // ActorEvents_481 _event_025sec cadence
      sim.sceneUpdaters.push(_attackQueueLoop);
      sim.on('castAttack', (e) => castAttackofID1(sim, Number(e.attack)));
    },
    step(sim) {
      _jumping(sim);
      _die(sim);
      // Pinfo[0] returns to 0 once the player is idle/walking/jumping (src 69984).
      if (N(sim.player.pinfo0) !== 0 && ['0', 'Za', '1', '3', '4'].includes(String(sim.player.animation))) sim.player.pinfo0 = 0;
      _replayPose(sim.player);
    },
    createDmgPixel(sim, mon, list = [], hits = 1) { return createDmgPixel(sim, mon, list, hits, 'status'); },
  };
  return mod;
}
