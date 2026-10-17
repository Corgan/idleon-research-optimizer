// ===== ACTIVE COMBAT SIMULATOR — ENGINE CORE =====
// Frame-accurate headless recreation of the Stencyl engine loop that drives
// active combat. World/monster logic lives in combat-sim-world.js, kill rewards
// and loot in combat-sim-rewards.js, save-derived scalars in combat-sim-inputs.js.
//
// ---------------------------------------------------------------------------
// ENGINE MODEL (src/N.new.formatted.js)
// ---------------------------------------------------------------------------
// * Fixed 10 ms step. Stencyl accumulates real frame time and runs fixed 10 ms
//   updates; the 200 ms per-frame catch-up cap only matters for a live client
//   that stalls and is NOT modelled (a headless sim never stalls). Render-only
//   drift (tweens, alpha fades) is not modelled.
// * Per step, in this order:
//     1. Timed tasks (TimedTask, src 11917; loop src 9189) in insertion order.
//        Each task: timer -= 10; if timer <= 0 fire, done = !repeats, and a
//        repeating task adds its interval back. The loop re-reads the task
//        list length, so tasks created by a firing task during this phase are
//        decremented in the same step. Tasks bound to a recycled actor are
//        marked done without firing. Done tasks are removed after the phase.
//     2. Scene "whenUpdated" listeners (sim.sceneUpdaters).
//     3. Actors in creation order: x += 0.1*vx, y += 0.1*vy (1 velocity unit
//        = 10 px/s), then that actor's own update handlers.
// * Render frames. Monster Respawn, NodeBoundary and KILL are "whenDrawing"
//   handlers (ActorEvents_1 registration order 3308-3316: HPbars, Respawn,
//   FRAME, NodeBoundary, KILL, Corrections), so they run once per rendered
//   frame AFTER that frame's batch of 10 ms steps, not every step. The core
//   accumulates options.frameMs (default 1000/60) and runs steps while the
//   accumulator is strictly greater than 10, so 60 FPS alternates 1 and 2
//   steps per frame; a frame with zero steps is still drawn. world.drawFrame
//   runs once per frame; sim.frameCount counts drawn frames.
// * One shared random stream. Stencyl randomInt(lo,hi) is inclusive:
//   lo + floor(r*(hi-lo+1)) with bounds swapped when hi < lo (src 11220);
//   randomFloat() = r; randomFloatBetween(a,b) = min + r*|b-a|.
//   The live game uses Math.random(), so a seed cannot reproduce
//   one live run; it reproduces call order and distributions.
//
// ---------------------------------------------------------------------------
// PLAYER-MODULE CONTRACT
// ---------------------------------------------------------------------------
// options.player = { init(sim), step(sim), name? , integrate? }
//   init(sim)  — called once after the scene is built and before step 0. It
//                must populate sim.player (fields below) and may register
//                timers with sim.every / sim.later (bound to sim.player via
//                the `actor` argument so they die with it).
//   step(sim)  — called once per 10 ms step in the actor phase at the
//                player's slot (the player actor is created before monsters,
//                so it updates first). The core integrates player x/y from
//                vx/vy immediately before step() unless integrate === false.
//
// sim.player fields read by world/rewards:
//   x, y            top-left position (px)       vx, vy   velocity (units)
//   width, height   collision box (px)           node     current NodeX index
//   xCenter(), yCenter()  optional; default x+width/2, y+height/2
//   hp, hpMax, mp, mpMax  numbers (DealDmgToPlayer mutates hp/mp)
//   takeDmgTimer    seconds; DealDmgToPlayer requires < .01 and sets it to
//                   invulnSeconds (the player module ticks it down)
//   invulnSeconds   ActionWaitTime("Invuln") result supplied by the player
//   animation       string; "4" suppresses contact damage (source gate)
//   dead            boolean; world never kills the player itself
//   defence         TotalStats("Defence") used by MonsterDamage
//   target          monster object | null; the KILL handler clears it when
//                   that monster dies and autoMove is falsy (source
//                   PlayerTargetMonster reset, emits targetCleared)
//   autoMove        boolean; Auto mode on (keeps target through the kill)
//   menuOpen        boolean; manual (non-auto-loot) pickups are refused
//                   while a menu is open
// Rewards also mutate sim.player.hp: Talent 627 heals on every kill
// (KilledMonsterType) when hp > .01.
//
// sim.buffs[id] — runtime GetBuffBonuses(id,1) values. Defaults are 0 and are
//   reported as unavailable by combat-sim-inputs.js. Read by world/rewards:
//   19 (extra drop roll), 45 (crystal block class 4/5), 107 (chase), 108/122
//   (monster damage), 168 (royal statue), 195/420/585 (Wraith/Tempest/
//   Arcanist forms), 198/302 (respawn), 318 (plunder), 319, 469 (MP shield),
//   490. sim.state.wraith / tempest / arcanist = GrimoireWraith /
//   CompassTempest / TesseractArcanist form flags (0/1).
//
// Functions the player calls:
//   sim.world.damageMonster(sim, mon, amount, meta)  -> { dealt, willDie }
//   sim.world.contactTarget(sim)                     -> monster | null
//   sim.world.monsterDamage(sim, rawDamage)          -> MonsterDamage(e)
//   sim.world.dealDmgToPlayer(sim, mon)              -> damage applied | 0
//   sim.world.raiseDead(sim, distance)               -> T529 counter reset
//   sim.world.addStatusToMonster(sim, mon, name, durationSeconds)
//   sim.world.monsters(sim, filter?)                 -> live monster list
//   sim.rewards.tryPickup(sim, item, { autoLoot })    -> ItemPickupInTheFirstPlace
//
// Events (sim.on(name, fn) / sim.emit(name, payload)):
//   world:   spawn, tempSpawn, damage, statusAdded, statusExpired,
//            monsterKilled, targetCleared, respawn, despawn, playerHit,
//            tenteyecle, castAttack
//   rewards: lootReset, exp, crystalSpawn, crystalRespawn, giantSpawn, dropRoll, drop,
//            itemLanded, filtered, newItemFound, pickup, inventoryFull,
//            cardFound, itemExpired
//   both:    unmodelled { key, detail } for source paths not simulated
//   session: sceneTransition { reason, from, node, scene, target } when the
//            player takes a type-2 portal (src 69766-69776); sessionEnded
//            fires SCENE_FADE_MS later, after which step() returns false and
//            summary().ended records why the map session stopped.
//   stop:    options.stopOn = [{ event, match?, count = 1, label? }] ends the
//            run at once (no fade) when `event` has fired `count` times with a
//            payload whose fields equal every `match` field; summary().ended
//            is then { reason: 'stopOn', event, label, count, t, payload }.
//            Spawn skills emit spawnSkillExpired { skill, anim, uid } when
//            their Graveyard (198) / Reindeer (423) / Wormhole (498) recycles.
// Every payload carries t = sim.timeMs at the START of the 10 ms step in
// which it happened (a timer completing at 500 ms reports t = 490).
//
// Shared state: sim.state (inventory, cards0, wraith/tempest/arcanist),
// sim.rewardsState { monsterDrops, dropTables, sampleDT, dn2, ldorRuns,
// ledger }, sim.inputs { values, entries } from buildCombatInputs.
// ---------------------------------------------------------------------------

import { buildCombatInputs } from './combat-sim-inputs.js';
import * as world from './combat-sim-world.js';
import * as rewards from './combat-sim-rewards.js';
import * as special from './combat-sim-special.js'; // class/mode kill mechanics (combat-sim-special.js)

export const STEP_MS = 10;
export const SCENE_FADE_MS = 200;

// mulberry32 with a call counter. All engine random calls share this stream.
export function createRng(seed) {
  let s = (Number(seed) >>> 0) || 0x9e3779b9;
  const rng = {
    calls: 0,
    next() {
      rng.calls++;
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    randomFloat() { return rng.next(); },
    // Literal Stencyl (src 11216-11221): no integer coercion, swapped bounds.
    randomInt(e, t) {
      return e <= t ? e + Math.floor(rng.next() * (t - e + 1)) : t + Math.floor(rng.next() * (e - t + 1));
    },
    randomFloatBetween(e, t) { return e <= t ? e + rng.next() * (t - e) : t + rng.next() * (e - t); },
    state() { return s >>> 0; },
  };
  return rng;
}

// Stencyl TimedTask semantics. Each update(dt) pass walks tasks in creation
// order, drops tasks whose non-player actor is recycled/dead, decrements
// timer by dt, and fires when timer <= 0 (repeats add interval). Tasks
// created during a pass are appended and decremented in that same pass.
//
// Equivalent due-pass form: instead of decrementing every task every pass, a
// task's firing pass and post-decrement timer are computed when it is
// (re)armed, and only due tasks are visited, in id order. This reproduces the
// literal loop exactly because (a) every update uses the same dt, (b) integer
// timers make timer - k*dt exact and fractional timers replay the literal
// float subtraction sequence, and (c) actor recycled/dead flags never revert,
// so checking them only when a task is due gives the same outcome as checking
// them every pass.
export function createScheduler(dt = STEP_MS) {
  const buckets = new Map();
  let nextId = 1;
  let pass = 0; // index of the current pass during update(), else of the next one
  let live = 0;
  let updating = false, curList = null, curIdx = -1;
  function arm(task, firstPass) {
    let tm = task.timer, k;
    // NaN/+Infinity never reach timer <= 0 in the literal loop: never due.
    if (Number.isNaN(tm) || tm === Infinity) { task._due = -1; return; }
    if (Number.isInteger(tm) && Math.abs(tm) < 4e15) {
      k = tm <= dt ? 1 : Math.ceil(tm / dt);
      tm -= k * dt;
    } else {
      k = 0;
      do { tm -= dt; k++; } while (tm > 0);
    }
    task._due = firstPass + k - 1;
    task._post = tm;
    const b = buckets.get(task._due);
    if (b) b.push(task); else buckets.set(task._due, [task]);
  }
  function add(fn, ms, repeats, actor) {
    const task = { id: nextId++, fn, interval: ms, timer: ms, repeats: !!repeats, actor: actor || null, done: false, _due: 0, _post: 0, _parked: false, _lastPass: 0 };
    live++;
    arm(task, pass);
    return task;
  }
  function fire(t) {
    if (t.done) return;
    if (t.actor && (t.actor.recycled || t.actor.dead === true && t.actor.kind !== 'player')) { t.done = true; live--; return; }
    t.timer = t._post;
    t.fn(t);
    if (t.repeats) {
      t.timer += t.interval;
      if (t.done) return; // cancelled itself; its done-decrement already ran
      if (t._parked) { t._lastPass = pass; return; }
      arm(t, pass + 1);
    } else if (!t.done) { t.done = true; live--; }
  }
  // Parking: a repeating task whose handler just proved itself a no-op calls
  // park(task) from inside that handler; its timer keeps the post-fire value
  // but it is not re-armed. While parked every literal fire would be the same
  // no-op, so they are skipped. The owner must call wake(task) before any
  // write that could change the handler's outcome; wake replays the exact
  // due-pass sequence from the last real fire and arms the first fire not yet
  // reached. During update(), a pass-P fire is still pending only when its id
  // is above the task currently firing; it is inserted into the running list.
  function wake(t) {
    if (!t._parked) return;
    t._parked = false;
    if (t.done) return;
    const curId = updating ? curList[curIdx].id : 0;
    const pending = (d) => d > pass || (d === pass && (!updating || t.id > curId));
    let first = t._lastPass + 1;
    for (;;) {
      let tm = t.timer, k;
      if (Number.isNaN(tm) || tm === Infinity) { t._due = -1; return; }
      if (Number.isInteger(tm) && Math.abs(tm) < 4e15) { k = tm <= dt ? 1 : Math.ceil(tm / dt); tm -= k * dt; }
      else { k = 0; do { tm -= dt; k++; } while (tm > 0); }
      let d = first + k - 1;
      const next = tm + t.interval;
      if (!pending(d) && next === t.timer) {
        // Stationary cycle: every later fire is k passes apart with the same timer.
        d += Math.ceil((pass - d) / k) * k;
        if (!pending(d)) d += k;
      }
      if (pending(d)) {
        t._due = d; t._post = tm;
        if (updating && d === pass) {
          let j = curIdx + 1;
          while (j < curList.length && curList[j].id < t.id) j++;
          curList.splice(j, 0, t);
        } else {
          const b = buckets.get(d);
          if (b) b.push(t); else buckets.set(d, [t]);
        }
        return;
      }
      t.timer = next;
      first = d + 1;
    }
  }
  return {
    park(task) { if (task && task.repeats && !task.done) task._parked = true; },
    wake,
    // Debug view of armed tasks in Stencyl list order.
    get tasks() {
      const out = [];
      for (const b of buckets.values()) for (const t of b) if (!t.done) out.push(t);
      return out.sort((a, b) => a.id - b.id);
    },
    get size() { return live; },
    later(ms, fn, actor) { return add(fn, ms, false, actor); },
    every(ms, fn, actor) { return add(fn, ms, true, actor); },
    cancel(task) { if (task && !task.done) { task.done = true; live--; } },
    // Literal `task.timer = ms` for a task that has not yet been updated.
    setTimer(task, ms) {
      if (!task || task.done) return;
      task._parked = false;
      const b = buckets.get(task._due);
      if (b) { const i = b.indexOf(task); if (i >= 0) b.splice(i, 1); if (!b.length) buckets.delete(task._due); }
      task.timer = ms;
      arm(task, pass);
    },
    update(stepDt) {
      if (stepDt !== dt) throw new Error('scheduler dt ' + stepDt + ' != ' + dt);
      const P = pass;
      let list = buckets.get(P);
      if (list) {
        buckets.delete(P);
        if (list.length > 1) list.sort((a, b) => a.id - b.id);
      }
      // Tasks armed for P while P runs were created during it: higher ids, so
      // they run after the current list, matching the appended-array walk.
      updating = true;
      while (list) {
        curList = list;
        for (let i = 0; i < list.length; i++) { curIdx = i; fire(list[i]); }
        list = buckets.get(P);
        if (list) buckets.delete(P);
      }
      updating = false; curList = null; curIdx = -1;
      pass = P + 1;
    },
  };
}

// Stand-still player: no damage, never moves.
export function idlePlayer(node = 0, opts = {}) {
  return {
    name: 'idle',
    init(sim) {
      const nd = sim.scene.nodes[node] || sim.scene.nodes[0];
      const width = opts.width ?? 40, height = opts.height ?? 60;
      const x = opts.x ?? Math.round((Number(nd.x) + Number(nd.length)) / 2 - width / 2);
      Object.assign(sim.player, {
        x, y: Number(nd.y) - height, vx: 0, vy: 0, width, height, node: nd === sim.scene.nodes[node] ? node : 0,
        hp: opts.hp ?? sim.inputs.values.playerMaxHp ?? 1, hpMax: opts.hp ?? sim.inputs.values.playerMaxHp ?? 1,
        mp: 0, mpMax: 0, takeDmgTimer: 0, invulnSeconds: opts.invulnSeconds ?? 1, animation: '0', dead: false,
        defence: opts.defence ?? sim.inputs.values.playerDefence ?? 0,
      });
    },
    step() {},
  };
}

// Test-only scripted player: stands on a node; kill(sim, mon) or a schedule of
// { atMs, pick } entries deals exactly the monster's remaining HP.
export function scriptedPlayer(node = 0, opts = {}) {
  const base = idlePlayer(node, opts);
  const api = {
    name: 'scripted',
    init(sim) {
      base.init(sim);
      if (opts.killEveryMs > 0) {
        sim.every(opts.killEveryMs, () => {
          const target = (opts.pick || _firstKillable)(sim);
          if (target) api.kill(sim, target);
        }, sim.player);
      }
      if (typeof opts.init === 'function') opts.init(sim);
    },
    step(sim) { if (typeof opts.step === 'function') opts.step(sim); },
    kill(sim, mon) { return sim.world.damageMonster(sim, mon, Math.max(mon.hp, 0) + 1, { source: 'scripted' }); },
  };
  return api;
}

function _firstKillable(sim) {
  for (const m of sim.monsters) if (m.alive === 1 && m.hp > 0 && !m.recycled && m.willDie === 0) return m;
  return null;
}

export function createCombatSim({ saveData, charIdx = 0, mapIdx, seed = 1, options = {} } = {}) {
  const rng = createRng(seed);
  const sched = createScheduler();
  const listeners = new Map();
  const inputs = options.inputs || buildCombatInputs(saveData, charIdx, mapIdx, { rawSave: options.rawSave, overrides: options.inputOverrides });
  const sim = {
    saveData, charIdx, mapIdx, seed, options, rng, sched, inputs,
    world, rewards,
    timeMs: 0, stepCount: 0, frameCount: 0,
    frameMs: Number(options.frameMs) > 0 ? Number(options.frameMs) : 1000 / 60,
    _frameAcc: 0, _frameStepsLeft: 0, _recycledDirty: false, _actorSeq: 0, _hot: [], _hotIdx: -1, _xyTweens: [],
    actors: [], monsters: [], items: [],
    sceneUpdaters: [],
    player: { kind: 'player', recycled: false },
    buffs: Object.assign({}, inputs.values.runtimeBuffs || {}, options.buffs || {}),
    state: {},
    unsupported: null,
    later(ms, fn, actor) { return sched.later(ms, fn, actor); },
    every(ms, fn, actor) { return sched.every(ms, fn, actor); },
    cancel(task) { sched.cancel(task); },
    on(name, fn) {
      if (!listeners.has(name)) listeners.set(name, []);
      listeners.get(name).push(fn);
      return () => { const l = listeners.get(name); const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); };
    },
    emit(name, payload) {
      const l = listeners.get(name);
      if (l) for (const fn of l.slice()) fn(payload, sim);
      const any = listeners.get('*');
      if (any) for (const fn of any.slice()) fn(name, payload, sim);
    },
    addActor(actor) {
      actor.recycled = false; actor.createdAt = sim.timeMs; actor._seq = sim._actorSeq++; actor._dormant = false;
      sim.actors.push(actor); sim._hot.push(actor); return actor;
    },
    // Re-admit a dormant actor to the step loop at its actor-order position.
    // Inserting before the loop cursor shifts the cursor, so the actor is
    // visited this step exactly when the original full loop would reach it.
    _wakeActor(actor) {
      if (!actor._dormant) return;
      actor._dormant = false;
      if (actor.recycled) return;
      const hot = sim._hot, seq = actor._seq;
      let lo = 0, hi = hot.length;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (hot[mid]._seq < seq) lo = mid + 1; else hi = mid; }
      hot.splice(lo, 0, actor);
      if (lo <= sim._hotIdx) sim._hotIdx++;
    },
    // Actor.moveBy -> moveTo (src 18042-18049): one TweenFloat2 per actor;
    // restarting an active tween keeps its TweenManager slot (src 22370).
    moveBy(actor, dx, dy, seconds = 1, ease = 'linear') {
      const ms = 1e3 * seconds | 0;
      let tw = actor._xyTw;
      if (!tw) tw = actor._xyTw = { actor, active: false };
      Object.assign(tw, { x0: actor.x, x1: actor.x + dx, y0: actor.y, y1: actor.y + dy, ease, time: 0, duration: ms });
      if (!tw.active) { tw.active = true; sim._xyTweens.push(tw); }
      if (ms === 0) { tw.duration = 1; _finishXyTween(sim, tw); }
    },
    recycleActor(actor) { if (actor && !actor.recycled) { if (actor._xyTw?.active) _cancelXyTween(sim, actor._xyTw); actor.recycled = true; actor.recycledAt = sim.timeMs; sim._recycledDirty = true; } },
    step() { return _step(sim); },
    // Scene switch (portal): Stencyl keeps updating the old scene through the
    // 0.2 s fade-out (ActorEvents_20 _SceneTransition, src 70083) and
    // isTransitioning() blocks repeat triggers; the session then ends.
    // `info.fadeMs` overrides the 0.2 s fade (Tempest/Arcanist reloads use 1.5/2 s).
    leaving: null, ended: null,
    endSession(info) {
      if (sim.leaving || sim.ended) return;
      sim.leaving = Object.assign({}, info, { t: sim.timeMs, endAt: sim.timeMs + (Number(info?.fadeMs) > 0 ? Number(info.fadeMs) : SCENE_FADE_MS) });
      sim.emit('sceneTransition', Object.assign({}, info, { t: sim.timeMs }));
    },
    run(seconds, opts = {}) { return _run(sim, seconds, opts); },
    snapshot() { return _snapshot(sim); },
    summary() { return _summary(sim); },
  };

  _installStopOn(sim, options.stopOn);
  const player = options.player || idlePlayer(options.playerNode ?? _defaultNode(mapIdx));
  sim.playerModule = player;
  sim.addActor(sim.player);

  const built = world.buildScene(sim);
  if (!built.ok) {
    sim.unsupported = built.reason;
    return sim;
  }
  rewards.initRewards(sim);
  special.initSpecial(sim); // installs sim.special hooks; before startScene so clam HP applies to initial spawns
  player.init(sim);
  world.startScene(sim);
  return sim;
}

// options.stopOn: end the run when an event has fired `count` matching times.
function _installStopOn(sim, rules) {
  for (const r of Array.isArray(rules) ? rules : []) {
    if (!r || typeof r.event !== 'string' || !r.event) continue;
    const need = Math.max(1, Math.floor(Number(r.count) || 1)), match = r.match && typeof r.match === 'object' ? r.match : null;
    let n = 0;
    sim.on(r.event, (payload) => {
      if (sim.ended || sim.leaving) return;
      if (match && !Object.keys(match).every((k) => payload && payload[k] === match[k])) return;
      if (++n < need) return;
      sim.ended = { reason: 'stopOn', event: r.event, label: r.label || r.event, count: need, t: sim.timeMs, endAt: sim.timeMs, payload: payload ? Object.assign({}, payload) : null };
      sim.emit('sessionEnded', Object.assign({}, sim.ended));
    });
  }
}

function _defaultNode(mapIdx) {
  return world.defaultPlayerNode(mapIdx);
}

// Plan the next render frame's step batch; frames with no steps are drawn
// immediately (Stencyl still renders them).
function _beginFrame(sim) {
  let guard = 0;
  while (sim._frameStepsLeft === 0 && guard++ < 1000) {
    sim._frameAcc += sim.frameMs;
    let n = 0;
    while (sim._frameAcc > STEP_MS) { sim._frameAcc -= STEP_MS; n++; }
    if (n === 0) _drawFrame(sim);
    else sim._frameStepsLeft = n;
  }
}

function _drawFrame(sim) {
  sim.frameCount++;
  world.drawFrame(sim);
  _purgeRecycled(sim);
}

// recycleActor is the only writer of recycled=true, so the dirty flag is
// exactly `actors.some(a => a.recycled)`.
function _purgeRecycled(sim) {
  if (sim._recycledDirty) {
    sim._recycledDirty = false;
    sim.actors = sim.actors.filter((a) => !a.recycled);
    sim.monsters = sim.monsters.filter((a) => !a.recycled);
    sim.items = sim.items.filter((a) => !a.recycled);
    sim._hot = sim._hot.filter((a) => !a.recycled);
  }
}

// Stencyl TweenManager (src 22419-22433), run first in Engine.update (src
// 9128) before timed tasks. Iterates from the end and swap-removes finished
// tweens. TweenFloat2.updateValue (src 22413) then Actor.updateTweenXY (src
// 17518): moveActorBy(value - current), i.e. the actor snaps to the tween
// position and its own velocity is integrated on top later in the step.
// Collision clipping inside moveActorBy is not modelled (flat nodes).
const _EASES = { linear: (u) => u, quadOut: (u) => -u * (u - 2) };
function _applyXyTween(tw) {
  const e = (_EASES[tw.ease] || _EASES.linear)(tw.time / tw.duration);
  const a = tw.actor, dx = tw.x0 * (1 - e) + tw.x1 * e - a.x, dy = tw.y0 * (1 - e) + tw.y1 * e - a.y;
  if (dx !== 0 || dy !== 0) { a.x += dx; a.y += dy; }
}
function _updateXyTweens(sim) {
  const list = sim._xyTweens;
  for (let t = list.length; t-- > 0;) {
    const tw = list[t];
    tw.time += STEP_MS;
    if (tw.time > tw.duration) tw.time = tw.duration;
    _applyXyTween(tw);
    if (tw.time === tw.duration) { tw.active = false; list[t] = list[list.length - 1]; list.pop(); }
  }
}
function _finishXyTween(sim, tw) {
  const list = sim._xyTweens, t = list.indexOf(tw);
  if (t < 0) return;
  tw.time = tw.duration; _applyXyTween(tw); tw.active = false;
  list[t] = list[list.length - 1]; list.pop();
}
function _cancelXyTween(sim, tw) {
  const list = sim._xyTweens, t = list.indexOf(tw);
  tw.active = false;
  if (t >= 0) { list[t] = list[list.length - 1]; list.pop(); }
}

function _step(sim) {
  if (sim.unsupported || sim.ended) return false;
  _beginFrame(sim);
  if (sim._xyTweens.length) _updateXyTweens(sim);
  sim.sched.update(STEP_MS);
  for (const fn of sim.sceneUpdaters.slice()) fn(sim);
  // sim._hot is the actor-order subsequence of sim.actors minus dormant items
  // (items whose step is provably a no-op; see rewards.stepItem). Purges
  // happen outside this loop and new actors get larger _seq values, so the
  // _seq bound equals iterating a slice of sim.actors taken at step start.
  const hot = sim._hot, limit = sim._actorSeq;
  for (sim._hotIdx = 0; sim._hotIdx < hot.length; sim._hotIdx++) {
    const a = hot[sim._hotIdx];
    if (a._seq >= limit) break;
    if (a.recycled) continue;
    if (a.kind === 'player') {
      // Actor.innerUpdate (src 17481): internalUpdate moves the actor before whenUpdated behaviors run.
      if (sim.playerModule.integrate !== false) { a.x += 0.1 * (a.vx || 0); a.y += 0.1 * (a.vy || 0); }
      sim.playerModule.step(sim);
    } else if (a.kind === 'item') {
      if (rewards.stepItem(sim, a)) { a._dormant = true; hot.splice(sim._hotIdx, 1); sim._hotIdx--; }
    } else {
      // x + 0.1*±0 === x except -0 + +0 -> +0, so static actors skip the
      // write unless the coordinate is a signed zero.
      const vx = a.vx, vy = a.vy;
      if (vx !== 0 || a.x === 0) a.x += 0.1 * vx;
      if (vy !== 0 || a.y === 0) a.y += 0.1 * vy;
      if (a.kind === 'monster') world.updateMonster(sim, a);
    }
  }
  sim._hotIdx = -1;
  _purgeRecycled(sim);
  sim.timeMs += STEP_MS;
  sim.stepCount++;
  if (--sim._frameStepsLeft === 0) _drawFrame(sim);
  if (sim.leaving && sim.timeMs >= sim.leaving.endAt) {
    sim.ended = sim.leaving;
    sim.emit('sessionEnded', Object.assign({}, sim.ended, { t: sim.timeMs }));
  }
  return true;
}

function _run(sim, seconds, { onSnapshot, snapshotEveryMs = 100, onStep } = {}) {
  if (sim.unsupported) return sim.summary();
  const steps = Math.round(seconds * 1000 / STEP_MS);
  const every = Math.max(STEP_MS, Math.round(snapshotEveryMs / STEP_MS) * STEP_MS);
  for (let i = 0; i < steps && !sim.ended; i++) {
    _step(sim);
    if (onStep) onStep(sim);
    if (onSnapshot && sim.timeMs % every === 0) onSnapshot(_snapshot(sim));
  }
  return sim.summary();
}

function _hud(sim) {
  const st = sim.state || {}, tot = sim.cdTotals || {}, cds = [];
  for (const k in st.attackCooldowns || {}) {
    const c = Number(st.attackCooldowns[k]) || 0;
    if (c > 0) cds.push([Number(k), c, Math.max(c, Number(tot[k]) || c)]);
  }
  if (sim._hudBar === undefined) {
    const rows = sim.inputs?.values?.attackLoadout;
    sim._hudBar = Array.isArray(rows) ? rows.filter((row) => Array.isArray(row) && row.some((x) => x != null && x !== 'Null'))
      .map((row) => row.slice(0, 6).map((x) => (x == null || x === 'Null' ? null : Number(x)))) : [];
  }
  return { mpMax: sim.player.mpMax, buffs: (st.buffsActive || []).map((b) => [Number(b[0]), b[1], b[2]]), cds, bar: sim._hudBar, cast: sim.lastCast || null };
}

function _snapshot(sim) {
  const p = sim.player;
  if (sim._replayEquip === undefined) {
    // Replay-only gear names from EquipOrder_X (rows are arrays or "0".."15" keyed objects).
    let eo = null;
    try {
      const raw = sim.options?.rawSave;
      eo = raw ? (raw.data?.['EquipOrder_' + sim.charIdx] ?? raw['EquipOrder_' + sim.charIdx]) : null;
      if (typeof eo === 'string') eo = JSON.parse(eo);
    } catch { eo = null; }
    const row = (r, i) => (eo?.[r]?.[i] ?? eo?.[r]?.[String(i)] ?? 'Blank');
    sim._replayEquip = eo && typeof eo === 'object' ? {
      helmet: row(0, 0), weapon: row(0, 1), premHelmet: row(0, 8), cape: row(0, 12), shirt: row(0, 15),
      tools: [0, 1, 2, 3, 4, 5, 6].map((i) => row(1, i)),
    } : null;
  }
  return {
    t: sim.timeMs,
    player: { x: p.x, y: p.y, vx: p.vx, vy: p.vy, w: p.width, h: p.height, node: p.node, hp: p.hp, hpMax: p.hpMax, mp: p.mp, anim: p.animation,
      dir: p.facing ?? (p.dir === 1 ? 1 : -1), state: p.animState ?? (p.dead ? 'dead' : 'idle'), attackAnim: p.attackAnim ?? null, srcDir: p.dir, equip: sim._replayEquip },
    // Replay HUD: buffs [id, remaining s, total s], nonzero cooldowns [id, remaining s, full s],
    // the AttackLoadout rows (constant, so the delta codec stores them once per keyframe), and the last cast.
    hud: _hud(sim),
    monsters: sim.monsters.filter((m) => !m.recycled).map((m) => ({
      uid: m.uid, id: m.id, type: m.type, monType: m.monType, x: m.x, y: m.y, vx: m.vx, w: m.width, h: m.height, node: m.node,
      hp: m.hp, hpTot: m.hpTot, alive: m.alive, willDie: m.willDie, size: m.sizeMulti, temp: m.temp, pers: m.persNum,
      pet: m.pet, frozen: m.frozen, flickT: m.flickerT ?? null, offY: m.offY,
      hpBar: m.hpBar && m.hpBar.att === 1 ? { px: m.hpBar.px, shown: m.hpBar.shown, ax: m.hpBar.ax, ay: m.hpBar.ay, big: m.hpBarBig ? 1 : 0 } : null,
      petHitT: m.petHitT ?? null, petHitX: m.petHitX ?? null, petHitY: m.petHitY ?? null,
      statuses: m.statusList.map((s) => s.name), respawn: sim.world.respawnCounter(sim, m),
    })),
    items: sim.items.filter((it) => !it.recycled).map((it) => ({ uid: it.uid, type: it.dropType, qty: it.dropAmount, x: it.x, y: it.y, status: it.collectedStatus, anim: it.coinAnim ?? null })),
    projectiles: sim.actors.filter((a) => a.kind === 'bullet' && !a.recycled).map((a) => ({
      uid: a.uid, anim: a.anim, skill: a.skill, x: a.x, y: a.y, vx: a.vx, vy: a.vy, w: a.width, h: a.height, dir: a.dir,
      frame: a.frame ?? null, scale: _scaleAt(a, sim.timeMs), img: a.img ?? null, itemImg: a.itemImg ?? null, angle: a.angle ?? null,
      alpha: _alphaAt(a, sim.timeMs), hidden: a.hidden ? 1 : 0,
      imgOffX: a.imgOffX ?? null, imgOffY: a.imgOffY ?? null, imgOX: a.imgOX ?? null, imgOY: a.imgOY ?? null,
      imgSX: a.imgSX ?? null, imgSY: a.imgSY ?? null,
      frLo: a.frLo ?? null, frHi: a.frHi ?? null, frAt: a.frAt ?? null, frT: a.frT ?? null, frLoop: a.frLoop === false ? 0 : 1,
      // Totem stack counter (_DummyDistance digit images) and WT19 Arcane Crystal meter state.
      count: a.DDB != null && a._DD != null ? a._DD : null,
      charge: a.crystal != null && a.list ? Number(a.list[5]) || 0 : null, req: a.crystal != null && a.list ? Number(a.list[6]) || 0 : null,
      crystal: a.crystal ?? null,
    })),
    orb: sim.state?.orb ? Object.assign({}, sim.state.orb) : null,
  };
}

// Linear fadeImageTo/fadeTo state written by combat-sim-player's _fade.
function _alphaAt(a, t) {
  const f = a.fade;
  if (!f) return a.alpha ?? null;
  return f.ms > 0 ? f.from + (f.to - f.from) * Math.max(0, Math.min(1, (t - f.t0) / f.ms)) : f.to;
}
// Linear growTo state (a.scaleTw) written by combat-sim-player's buff fx.
function _scaleAt(a, t) {
  const s = a.scaleTw;
  if (!s) return a.scale ?? null;
  return s.from + (s.to - s.from) * (s.ms > 0 ? Math.max(0, Math.min(1, (t - s.t0) / s.ms)) : 1);
}

function _summary(sim) {
  return {
    mapIdx: sim.mapIdx, charIdx: sim.charIdx, seed: sim.seed,
    unsupported: sim.unsupported,
    ended: sim.ended ? Object.assign({}, sim.ended) : null,
    timeMs: sim.timeMs, steps: sim.stepCount, frames: sim.frameCount, rngCalls: sim.rng.calls,
    world: sim.unsupported ? null : world.worldSummary(sim),
    rewards: sim.unsupported ? null : rewards.ledgerSummary(sim),
    special: sim.unsupported ? null : (sim.special?.summary?.() ?? null), // combat-sim-special.js
  };
}
