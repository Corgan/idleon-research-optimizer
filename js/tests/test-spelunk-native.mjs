import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spelunkCaves, spelunkTools, spelunkElixirs } from '../stats/data/w7/spelunking.js';
import { SPELUNK_SPRITES } from '../stats/data/game/spelunk-sprites.js';
import { Spelunky, SpelunkRocks } from '../stats/data/game/customlists.js';
import { spelunkReplayDrop } from '../ui/spelunk-replay.js';
import { getLOG } from '../formulas.js';

const source = fs.readFileSync(new URL('../../src/N.new.formatted.js', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
function method(className, name, environment = {}) {
  const start = source.indexOf(`${name}: function`, source.indexOf(`A["${className}"]`));
  assert.ok(start >= 0, `Native ${className}.${name}`);
  const body = source.slice(source.indexOf('function', start), source.indexOf('\n                    },', start) + 22);
  return new Function(...Object.keys(environment), `return (${body});`)(...Object.values(environment));
}
const elastic = method('com.stencyl.utils.motion.ElasticOut', 'apply');
const quad = method('com.stencyl.utils.motion.QuadOut', 'apply');
const back = method('com.stencyl.utils.motion.BackOut', 'apply');
const quadIn = method('com.stencyl.utils.motion.QuadIn', 'apply');
{
  const drop = { seconds: 1, x: 465, y: 100, dx: -16, dy: 8, moveSeconds: .7, fadeSeconds: 2.65 };
  for (const age of [0, .1, .3, .7, .75, 1, 2.6]) {
    const visual = spelunkReplayDrop(drop, drop.seconds + age);
    const actualAge = drop.seconds + age - drop.seconds;
    assert.ok(Math.abs(visual.scale - back(Math.min(1, actualAge / .75))) < 1e-12);
    assert.ok(Math.abs(visual.alpha - (1 - quadIn(actualAge / drop.fadeSeconds))) < 1e-12);
    assert.ok(Math.abs(visual.x - (drop.x + drop.dx * quad(Math.min(1, actualAge / drop.moveSeconds)))) < 1e-12);
  }
}
const moduleUrl = new URL('../stats/systems/w7/spelunk-expedition.js', import.meta.url);
let localSource = fs.readFileSync(moduleUrl, 'utf8').replaceAll('\r\n', '\n')
  .replace(/from '([^']+)'/g, (_, path) => `from '${new URL(path, moduleUrl).href}'`);
const returnPoint = 'return {\n    get done()';
assert.ok(localSource.includes(returnPoint));
localSource = localSource.replace(returnPoint, `return {
    debug: {
      hit, within, position, advanceEffects, descend, destroy, decision, refill, useElixir, settle,
      get state() { return { rocks, pending, time, transition, depth, countdown, toolId, random, charges, ready, effects, rewards, rewardOrder }; },
      set(state) {
        if ('rocks' in state) rocks = state.rocks;
        if ('pending' in state) pending = state.pending;
        if ('time' in state) time = state.time;
        if ('transition' in state) transition = state.transition;
        if ('countdown' in state) countdown = state.countdown;
        if ('found' in state) found = state.found;
        if ('toolId' in state) toolId = state.toolId;
        if (state.clearTasks) tasks.length = 0;
      },
    },
    get done()`);
const { createSpelunkExpedition } = await import(`data:text/javascript;base64,${Buffer.from(localSource).toString('base64')}`);
function fixture() {
  const shop = Array(80).fill(0);
  shop[7] = 15; shop[19] = 50; shop[25] = 1; shop[38] = 100;
  return {
    caves: spelunkCaves().slice(0, 1), tools: spelunkTools(), elixirs: spelunkElixirs(),
    shop, characters: [{ id: 0, name: 'Test', max: 10000, stamina: 10000 }],
    pow: 1e30, amber: 10, grand: 0, depths: [0], grands: [0], bosses: [1],
    memorized: [], discoveries: [], elixirOwned: 12, slots: 5, dupes: 2, nonconsume: 0,
    holesBonus: 0, auto: true, speedMax: 4, overuse: false, manic: true, savedManic: false,
    savedElixirs: [-1, -1, -1, -1, -1], fullClear: false, prisma: 0, exalt: 0, bags: 0, notes: [],
  };
}
function rock(slot, changes = {}) {
  return { slot, type: 0, boss: false, hp: 10000, maxHP: 10000, requirement: 1, amber: 1,
    riseAt: null, hitAt: null, ...changes };
}
function fresh(config = {}) {
  const input = fixture();
  const run = createSpelunkExpedition(input, { party: [0], policy: 'auto', ...config }, { seed: 782 });
  run.debug.set({ transition: false, countdown: 100000, clearTasks: true });
  return { input, run, debug: run.debug };
}
function mix(from, to, elapsed, duration, easing) {
  const q = easing(Math.min(duration, elapsed) / duration);
  return from * (1 - q) + to * q;
}
function nativeHarness(input, rows, values = [], options = {}) {
  let now = 0, cursor = 0;
  const tasks = [], trace = [], hits = [], gi = Array(180).fill(0);
  gi[47] = rows; gi[49] = -1; gi[52] = [0]; gi[76] = []; gi[80] = Array(5).fill(0);
  gi[81] = Array(5).fill(0); gi[107] = Array(13).fill(0); gi[110] = Array(12).fill(0);
  gi[100] = 0;
  const attributes = {
    MenuType2: 82, OptionsListAccount: Array(600).fill(15),
    Spelunk: [[1], [], [], [10000], [], [], [], [-1, -1, -1, -1, -1]],
    CustomLists: { h: { Spelunky, SpelunkRocks } }, Tasks: [[[], [], [], [], [], [], [Infinity]]],
  };
  const a = { SCALE: 1, engine: { getGameAttribute: key => attributes[key], isPaused: () => false } };
  const next = () => { assert.ok(cursor < values.length, 'Native RNG must match the measured local stream'); return values[cursor++]; };
  const c = {
    asNumber: v => Number(v) || 0, randomFloat: next,
    randomInt: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    randomFloatBetween: (lo, hi) => lo + next() * (hi - lo),
    fadeImageTo() {}, spinImageTo() {}, moveImageTo() {}, moveImageBy() {},
    attachImageToActor(img, actor, x, y) { img.x = x + (img.ox || 0); img.y = y + (img.oy || 0); },
    setFilterForImage() {}, createBrightnessFilter() {}, getOrderForImage: () => 0, setOrderForImage() {},
    removeImage() {}, clearFiltersForImage() {},
    runLater(ms, fn) { tasks.push({ timer: ms, interval: ms, repeats: false, actor: null, done: false, toExecute: fn }); },
  };
  const tickTask = method('com.stencyl.behavior.TimedTask', 'update', { a });
  const k = {
    _customBlock_getLOG: getLOG,
    _customBlock_addImgInst(name) {
      const art = SPELUNK_SPRITES[name.replace('.png', '')] || { w: 16, h: 16 };
      return { sx: 1, sy: 1, set_alpha() {},
        get_x() { return this.x; }, get_y() { return this.y; },
        get_width() { return art.w * this.sx; }, get_height() { return art.h * this.sy; } };
    },
    _customBlock_DistanceEqn(x, y, a, b) {
      const dx = Math.abs(x - a), dy = Math.abs(y - b);
      return .9604339 * Math.max(dx, dy) + .397824735 * Math.min(dx, dy);
    },
    _customBlock_AdjustImgInst(key, img, value) { img[key === 'width' ? 'sx' : 'sy'] = value / 100; },
    _customBlock_GrowImgInstREAL(img, x, y, seconds, easing) {
      if (easing === 'OriginLeftCenterBotCenter') {
        img.ox = Math.round(img.get_width() / 4); img.oy = Math.round(img.get_height() / 1.3);
      }
      if (easing !== 'Bounce Out') return;
      img.tween = { at: now, x: img.sx, y: img.sy, toX: x / 100, toY: y / 100, duration: seconds * 1000 };
    },
  };
  const m = { _customBlock_Spelunk(name, id, slot) {
    if (name === 'AutoFullClearNECESSARY') return Number(options.fullClear || false);
    if (name === 'GridCoord') return id === 0 ? 477 + 36 * (slot % 12) - 36 * Math.floor(slot / 12)
      : 26 + 18 * (slot % 12) + 18 * Math.floor(slot / 12);
    if (name === 'StaminaMax') return 10000;
    if (name === 'POW') return input.pow;
    if (name === 'RockPOWreq') return options.requirement ?? 1;
    if (name === 'BonusDMG') return 1 + input.shop[33] / 100;
    if (name === 'StaminaCostMulti') return 1;
    if (name === 'ShopUpgBonus') return input.shop[id];
    if (name === 'NovaBlastHitChance') return input.shop[38] / 100;
    if (name === 'ElixirEffectQTY') return input.elixirs[id].quantity;
    if (name === 'ElixirsUnlocked') return Number(options.elixirs || false);
    if (['AmberDropChance', 'PrismaDropChance', 'ExaltDropChance', 'MiscDropChance',
      'GoldPieceDropChance', 'w7itemDropChance', 'blingbagDropChance'].includes(name)) return 0;
    if (name === 'ToolUnlocked') return Number(input.tools.some(t => t.id === id));
    if (name === 'ShadowStrikeChance') return input.shop[31] / 100;
    if (name === 'ShadowStrikeQTY') return Math.floor(1 + (input.shop[32] / 100 + next()));
    if (['CanWeOveruseStamina', 'TrackometerUnlocked', 'ToolkitUnlocked'].includes(name)) return 0;
    throw new Error(`Unexpected native dependency: ${name}`);
  } };
  const env = { a, c, k, m, t: { quadOut: quad }, D: { contains: (a, v) => a.includes(v) },
    y: { replace: (s, a, b) => s.replaceAll(a, b) },
    q: { _customBlock_IsXYmouseWithinBounds: () => 0 }, h: { string: String },
    Pa: class { doOnUpdate() { return this; } tween() {} } };
  const nativeHit = method('scripts.ActorEvents_713', '_customEvent_SpelunkStuff2', env);
  const actor = {
    wrapper: { enabled: true }, _GenINFO: gi, _UIinventory16On: Array.from({ length: 24 }, () => []),
    _UIinventory16: Array.from({ length: 24 }, () => Array.from({ length: 24 }, () => ({ set_alpha() {} }))),
    attributeTweens: { h: {} }, _customEvent_SpelunkStuff() {},
    _customEvent_InsideCavernStuff() { trace.push(['elixir', this._TRIGGEREDtext]); },
    _customEvent_SpelunkStuff2() {
      const trigger = this._TRIGGEREDtext;
      if (trigger.startsWith('a')) hits.push(Number(trigger.slice(1)));
      if (trigger === 'e') { trace.push(['descend']); if (!options.transitions) return; }
      if (trigger === 'd') trace.push(['dig', gi[98], gi[99], gi[92]]);
      nativeHit.call(this);
    },
  };
  const update = method('scripts.ActorEvents_713', '_event_4', env);
  return { actor, gi, trace, hits, tasks, attributes,
    image(r) {
      const art = SPELUNK_SPRITES[`CaveRock${input.caves[0].letter}0`];
      const img = {
        sx: 1, sy: 1, tween: null,
        get_x: () => Math.round(477 - art.w / 2 + 36 * (r.slot % 12) - 36 * Math.floor(r.slot / 12)) + Math.round(art.w / 2),
        get_y: () => 45 + 18 * (r.slot % 12) + 18 * Math.floor(r.slot / 12),
        get_width() { return art.w * this.scale('x'); },
        get_height() { return art.h * this.scale('y'); },
        scale(axis) {
          if (!this.tween) return this[axis === 'x' ? 'sx' : 'sy'];
          return mix(this.tween[axis], this.tween[axis === 'x' ? 'toX' : 'toY'],
            now - this.tween.at, this.tween.duration, elastic);
        },
      };
      return img;
    },
    time(step) { now = step * 10; },
    tick(step) {
      now = step * 10;
      for (let i = 0; i < tasks.length; i++) {
        tickTask.call(tasks[i], 10);
        if (tasks[i].done) tasks.splice(i--, 1);
      }
      update.call(actor);
    },
    get draws() { return cursor; },
  };
}
function nativeRows(harness, rocks) {
  return rocks.map(r => [r.type, harness.image(r), { set_alpha() {} }, { set_alpha() {} },
    r.maxHP, r.hp, r.slot, 0, 0, 0, 0]);
}
function traceRandom(debug) {
  const values = [], rng = debug.state.random, next = rng.next.bind(rng);
  rng.next = () => { const v = next(); values.push(v); return v; };
  return values;
}

// Execute the native sparse loot/toll loop, including its original first-found order.
{
  const start = source.indexOf('if (this._GenINFO[82] = [], 1 == this._GenINFO[85])');
  const end = source.indexOf('for (i = 0, r = Math.round(this._GenINFO[78].length / 2); i < r;) s = i++, this._DN1 =', start);
  assert.ok(start > 0 && end > start);
  const nativeSettle = new Function('c', 'm', `var i,r,s; ${source.slice(start, end)}`);
  for (const order of [[], [0], [7, 0, 3, 1, 8], [8, 1, 3, 0, 7]]) {
    for (const toll of [0, 37, 50, 100]) {
      const { input, run, debug } = fresh();
      input.shop[19] = toll;
      const quantities = [13.7, 3, 0, 1, 0, 0, 0, 2, 17, 0, 0, 0];
      debug.state.rewardOrder.push(...order);
      for (const i of order) debug.state.rewards[i] = quantities[i];
      const values = traceRandom(debug);
      debug.settle('exhausted');
      const gi = [];
      gi[85] = 1; gi[78] = order.flatMap(i => ['_abcdefghijk'[i], quantities[i]]);
      let cursor = 0;
      nativeSettle.call({ _GenINFO: gi }, {
        asNumber: v => Number(v) || 0,
        randomFloat: () => { assert.ok(cursor < values.length); return values[cursor++]; },
      }, { _customBlock_Spelunk: name => { assert.equal(name, 'TollExitTax'); return 1 - toll / 100; } });
      assert.equal(cursor, values.length);
      assert.equal(cursor, order.filter(i => i !== 0).length, 'absent loot consumes no rounding draws');
      const result = run.result();
      assert.deepEqual(order.map(i => result.rewards[i]), order.map((_, n) => gi[78][2 * n + 1]));
      assert.deepEqual(result.exit.items.map(item => item.reward), order);
      assert.equal(result.exit.retained, 1 - toll / 100);
      assert.deepEqual(result.grossRewards, quantities.map((v, i) => order.includes(i) ? v : 0));
    }
  }
}

// Shadow placement uses the scaled target bounds and the tool's bottom-left-centre origin.
{
  const { input, run, debug } = fresh({ speed: 4 });
  input.shop[31] = 100;
  const rocks = [52, 53, 54, 64, 65, 66, 76, 77, 78].map(s => rock(s));
  debug.set({ rocks, toolId: 2, countdown: -35 });
  const values = traceRandom(debug), native = nativeHarness(input, [], values);
  native.gi[47] = nativeRows(native, rocks);
  native.gi[92] = native.gi[95] = 2; native.gi[96] = 1; native.gi[143] = 4; native.gi[100] = -35;
  for (let tick = 1; !run.result().actions && tick < 100; tick++) { run.step(1); native.tick(tick); }
  const shadows = native.gi[76].filter(p => p[0] === 4);
  assert.ok(shadows.length);
  assert.deepEqual(debug.state.pending.filter(p => p.type === 'shadow').map(p => [p.x, p.y, p.remaining]),
    shadows.map(p => [p[1].get_x() + 14 * (-1) ** p[8], p[1].get_y() + 7 * (1 + p[4]), p[2]]));
  assert.equal(native.draws, values.length);
}

// Execute the source hit handler and easing against every 10 ms point, including a restarted hit.
{
  const { input, run, debug } = fresh(), r = rock(65);
  debug.set({ rocks: [r] });
  const values = traceRandom(debug), native = nativeHarness(input, [], values);
  native.gi[47] = nativeRows(native, [r]);
  for (let tick = 0; tick <= 120; tick++) {
    debug.set({ time: tick }); native.time(tick);
    if (tick === 0 || tick === 37) {
      debug.hit(r, 1); native.gi[94] = 1; native.actor._TRIGGEREDtext = 'a0';
      native.actor._customEvent_SpelunkStuff2();
    }
    const p = debug.position(r), img = native.gi[47][0][1];
    assert.equal(p.w, img.get_width(), `Native width at ${tick * 10} ms`);
    assert.equal(p.h, img.get_height(), `Native height at ${tick * 10} ms`);
    assert.equal(r.hp, native.gi[47][0][5]);
    const cy = p.y - p.h / 2;
    assert.ok(debug.within(r, p.x, cy, 1));
  }
  assert.equal(native.draws, values.length);
  assert.ok(run.result().hits === 2);
}

// The native strict resist comparison includes equality; Manic changes cost, not object POW.
for (const manic of [false, true]) for (const ratio of [.01, .5, 1, 2, 100, 1000]) {
  const chance = ratio ** .6;
  for (const roll of [0, Math.min(1 - Number.EPSILON, chance - Number.EPSILON),
    chance, Math.min(1 - Number.EPSILON, chance + Number.EPSILON)].filter(v => v >= 0 && v < 1)) {
    const { input, run, debug } = fresh({ manic });
    input.pow = ratio * 100;
    input.shop[33] = 25; input.shop[34] = 1;
    const r = rock(65, { requirement: 100 });
    debug.set({ rocks: [r] });
    debug.state.random.next = () => roll;
    const native = nativeHarness(input, [], [roll], { requirement: r.requirement });
    native.gi[47] = nativeRows(native, [r]);
    debug.hit(r, 2);
    native.gi[94] = 2; native.actor._TRIGGEREDtext = 'a0';
    native.actor._customEvent_SpelunkStuff2();
    assert.equal(r.hp, native.gi[47][0][5], `native resist/damage boundary, ratio ${ratio}, roll ${roll}`);
    assert.equal(run.result().misses, Number(roll > chance));
    assert.equal(native.gi[110][4], Number(roll > chance));
    assert.equal(native.draws, 1, 'every hit attempt consumes one resist roll, including guaranteed hits');
  }
}

// Native Auto samples animated centres and preserves the 25-point draw order at every speed.
for (const speed of [0, 1, 2, 3, 4]) {
  const { input, run, debug } = fresh({ speed });
  const rocks = [52, 53, 54, 64, 65, 66, 76, 77, 78].map(s => rock(s));
  debug.set({ rocks, toolId: 2, countdown: 0 });
  const values = traceRandom(debug), native = nativeHarness(input, [], values);
  native.gi[47] = nativeRows(native, rocks);
  native.gi[92] = native.gi[95] = 2; native.gi[96] = 1; native.gi[143] = speed;
  for (let tick = 1; run.result().actions < 4 && tick < 500; tick++) {
    run.step(1); native.tick(tick);
    assert.equal(debug.state.countdown, native.gi[100]);
    assert.deepEqual(rocks.map(r => r.hp), native.gi[47].map(r => r[5]));
    assert.equal(run.result().stamina[0].end, native.attributes.Spelunk[3][0]);
  }
  const dig = run.result().events.find(e => e.type === 'dig');
  assert.ok(dig, `Auto ${speed} must eventually target the fixture`);
  assert.deepEqual(native.trace[0], ['dig', dig.x, dig.y, dig.tool]);
  assert.deepEqual(native.trace, run.result().events.filter(e => e.type === 'dig')
    .map(e => ['dig', e.x, e.y, e.tool]));
  assert.equal(native.draws, values.length);
}

// Destruction-created adjacent hits age immediately; source debris rolls precede their chance rolls.
{
  const { input, debug } = fresh();
  input.shop[7] = 0; input.elixirs[5].quantity = 100;
  const rocks = [rock(65, { hp: 0 }), rock(64)];
  debug.set({ rocks });
  debug.state.effects[5] = 2;
  const values = traceRandom(debug), native = nativeHarness(input, [], values);
  native.gi[47] = nativeRows(native, rocks);
  native.gi[107][5] = 2; native.attributes.Spelunk[6] = [input.caves[0].rocks[0].name];
  debug.destroy(); debug.advanceEffects(); native.tick(0);
  assert.equal(native.draws, values.length);
  assert.deepEqual(debug.state.pending.map(p => p.remaining),
    native.gi[76].filter(p => p[0] === 8).map(p => p[2]));
  for (let tick = 1; tick <= 16; tick++) {
    debug.set({ time: tick }); debug.advanceEffects(); native.tick(tick);
    assert.equal(rocks[0].hp, native.gi[47][0][5]);
    assert.equal(native.draws, values.length);
  }
  assert.equal(rocks[0].hp, 9999, 'First adjacent hit lands at destruction +160 ms');
}

// An emptied full-clear floor still consumes its native target scan before descending.
{
  const { input, run, debug } = fresh({ fullClear: true });
  debug.set({ rocks: [rock(65, { type: -1 })], found: true, countdown: -35 });
  const values = traceRandom(debug), native = nativeHarness(input, [], values, { fullClear: true });
  native.gi[47] = [[-1, {}, {}, {}, 1, 1, 65]];
  native.gi[73] = native.gi[96] = 1; native.gi[100] = -35;
  run.step(1); native.tick(1);
  assert.equal(values.length, 75);
  assert.equal(native.draws, values.length);
  assert.deepEqual(native.trace, [['descend']]);
  assert.equal(run.result().events.at(-1).type, 'descend');
}

// Refilled empty slots become usable only after the 800 ms appearance callback, without restarting it.
{
  const { input, run, debug } = fresh({ elixirs: [6] });
  const native = nativeHarness(input, [], [], { elixirs: true });
  debug.state.charges[0] = native.gi[80][0] = 1;
  debug.state.ready[0] = native.gi[81][0] = 2;
  for (let tick = 1; tick <= 81; tick++) {
    if (tick === 20) { debug.refill(); native.gi[80][0]++; }
    run.step(1); native.tick(tick);
    assert.equal(debug.state.ready[0], native.gi[81][0]);
    if (tick <= 80) assert.equal(debug.state.ready[0], 2.1);
  }
  assert.equal(debug.state.ready[0], 0);
}

// Persistent creation order, strict due ticks, and transition gating use the extracted update loop.
for (const blocked of [false, true]) {
  const { input, debug } = fresh();
  const rocks = [40, 52, 64, 76, 88, 100].map(s => rock(s));
  const center = debug.position(rocks[2]);
  const pending = [
    { type: 'nova', remaining: 600, start: 0, damage: 1, seen: new Set() },
    { type: 'adjacent', remaining: 202, depth: 0, slot: 64, damage: 1 },
    { type: 'shadow', remaining: 202, depth: 0, tool: 0, damage: 1, x: center.x, y: center.y - center.h / 2 },
  ];
  debug.set({ rocks, pending });
  const values = traceRandom(debug), native = nativeHarness(input, [], values);
  native.gi[47] = nativeRows(native, rocks);
  const novaImage = { get_scaleX: () => mix(.1, 2, nativeNow * 10, 1350, quad) };
  const shadowImage = { get_x: () => pending[2].x - 14, get_y: () => pending[2].y - 7 };
  native.gi[76] = [[5, novaImage, 600, 0, 1, []], [8, {}, 202, 0, 64, 0, '', 1],
    [4, shadowImage, 202, 0, 0, 0, 0, 1, 0]];
  let nativeNow = 0;
  for (let tick = 1; tick <= 150; tick++) {
    nativeNow = tick;
    const transition = blocked && tick >= 15 && tick <= 70;
    debug.set({ time: tick, transition });
    debug.advanceEffects(); native.gi[75] = Number(transition); native.tick(tick);
    assert.deepEqual(rocks.map(r => r.hp), native.gi[47].map(r => r[5]), `Effects at ${tick}`);
    assert.deepEqual([...pending[0].seen], native.gi[76][0][5]);
    assert.equal(native.draws, values.length);
  }
}

// The nested transition task gets its first update in the same pass, not one tick later.
{
  const { run, debug } = fresh({ policy: 'dive' });
  debug.descend();
  const native = nativeHarness(fixture(), [], [], { transitions: true });
  native.actor._TRIGGEREDtext = 'e'; native.actor._customEvent_SpelunkStuff2();
  for (let tick = 1; tick <= 185; tick++) {
    run.step(1); native.tick(tick);
    assert.equal(debug.state.depth, native.gi[70]);
    assert.equal(debug.state.transition, Boolean(native.gi[75]));
  }
  assert.equal(debug.state.transition, false);
  assert.equal(run.result().events.find(e => e.type === 'floor' && e.depth === 2).time, .93);
}
console.log('Spelunking native hit tweens, Auto speeds, effect ordering and nested callback assertions passed.');
