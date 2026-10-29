import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { spelunkCaves, spelunkTools, spelunkElixirs } from '../stats/data/w7/spelunking.js';
import { shopUpgBonus } from '../stats/systems/w7/spelunking.js';
import { createSpelunkExpedition, normalizeSpelunkConfig, simulateSpelunkExpedition, spelunkRockStats, spelunkActiveBuffs, spelunkRewardImage } from '../stats/systems/w7/spelunk-expedition.js';
import { createSpelunkComparison, createSpelunkSearch, normalizeSpelunkSearchScope, spelunkSearchSpace, spelunkRunMetric } from '../stats/systems/w7/spelunk-planner.js';
import { SpelunkRocks } from '../stats/data/game/customlists.js';
import { SPELUNK_SPRITES } from '../stats/data/game/spelunk-sprites.js';
import { spelunkReplayTile } from '../ui/spelunk-replay.js';

function fixture() {
  const shop = Array(80).fill(0);
  shop[7] = 80; shop[19] = 50; shop[25] = 1; shop[38] = 20;
  return {
    charIdx: 0, caves: spelunkCaves().slice(0, 2), tools: spelunkTools(), elixirs: spelunkElixirs(),
    pow: 1e30, amber: 10, regen: 5, grand: 0, shop,
    characters: [8, 12, 16].map((max, id) => ({ id, name: `Character ${id + 1}`, max, stamina: max })),
    elixirOwned: 12, slots: 5, memorySlots: 0, dupes: 2, nonconsume: 0, holesBonus: 0,
    auto: true, speedMax: 4, overuse: false, manic: true, shortcut: false, depths: [0, 0],
    manicDepths: [0, 0], grands: [0, 0], discoveries: [], memorized: [],
    savedElixirs: [-1, -1, -1, -1, -1], savedManic: false, fullClear: false,
    prisma: 0, exalt: 0, bags: 0, notes: [],
  };
}
const input = fixture(), original = structuredClone(input);
const config = { party: [2, 0], policy: 'dive', elixirs: [-1, 0, -1, 2, -1] };
const normal = simulateSpelunkExpedition(input, config, { seed: 934 });
const recorded = simulateSpelunkExpedition(input, config, { seed: 934, replay: true, maxFrames: 8 });
const { frames, replayEvents, frameIntervalSeconds: recordedInterval, ...withoutFrames } = recorded;
const { frames: ignored, replayEvents: ignoredEvents, frameIntervalSeconds: plainInterval, ...plain } = normal;
assert.deepEqual(withoutFrames, plain, 'recording cannot change mechanics, events or RNG');
assert.deepEqual(input, original, 'runs never mutate their input snapshot');
assert.ok(frames.length > 9, 'obsolete frame caps cannot discard hits or later actions');
assert.equal(recordedInterval, .1);
assert.equal(replayEvents.filter(e => e.type === 'hit').length, recorded.hits);
assert.equal(replayEvents.filter(e => e.type === 'miss').length, recorded.misses);
assert.equal(replayEvents.filter(e => ['dig', 'elixir'].includes(e.type)).length, recorded.actions);
const recordedTimes = new Set(frames.map(f => f.seconds));
assert.ok(replayEvents.every(e => recordedTimes.has(e.seconds)), 'every event tick retains its post-action state');
assert.ok(frames.every(frame => frame.tool == null || input.tools.some(tool => tool.id === frame.tool)));
for (const event of replayEvents.filter(e => e.type === 'dig'))
  assert.equal(frames.find(frame => frame.seconds === event.seconds).tool, event.tool,
    'manual replay selection captures the actual chosen tool without reading current controls');
assert.ok(replayEvents.filter(e => e.type === 'hit').every(e => e.damage > 0 && Number.isFinite(e.x) && e.source));
assert.ok(frames.every(f => f.rocks.every(r => !('hidden' in r) && !('potion' in r))));
assert.deepEqual(recorded.config.elixirs, [-1, 0, -1, 2, -1]);
assert.deepEqual(recorded.frames[0].charges, [0, 2, 0, 2, 0]);
const detailed = simulateSpelunkExpedition(input, config, { seed: 934, replay: true });
assert.equal(detailed.frames[1].seconds - detailed.frames[0].seconds, .1, 'short replays retain hit-scale animation detail');
assert.ok(detailed.frames.every((f, i) => i === 0 || f.seconds > detailed.frames[i - 1].seconds),
  'terminal recording does not duplicate its preceding timestamp');
assert.equal(detailed.frames.at(-1).seconds, detailed.seconds);
assert.deepEqual(detailed.frames.flatMap(f => f.lastAction?.type === 'dig' ? [f.lastAction] : [])
  .every(a => Number.isFinite(a.seconds) && Number.isInteger(a.depth)), true, 'action markers are time and floor scoped');
assert.ok(recorded.events.filter(e => e.type === 'elixir').every(e => e.slot === 1 || e.slot === 3));
assert.throws(() => normalizeSpelunkConfig(input, { party: [0, 0] }), /unique/);
assert.throws(() => normalizeSpelunkConfig(input, { elixirs: [0, 0, 0] }), /duplicate/);
assert.throws(() => simulateSpelunkExpedition(input, {}, { seed: NaN }), /seed/);
const tired = structuredClone(input);
tired.characters[0].stamina = 0;
assert.throws(() => normalizeSpelunkConfig(tired, { party: [0] }), /half/);
assert.equal(normalizeSpelunkConfig(tired, { party: [0], stamina: 'full' }).party[0], 0);

function advanceUntil(run, predicate, steps = 100000) {
  let result = run.result();
  for (let i = 0; i < steps && !run.done && !predicate(result); i++) {
    run.step(1); result = run.result();
  }
  assert.ok(predicate(result), 'expected expedition event within the test fixture');
  return result;
}
const basic = { party: [2], policy: 'dive', tool: 0 };
const ordinary = advanceUntil(createSpelunkExpedition(input, basic, { seed: 55 }), r => r.actions > 0);
const manic = advanceUntil(createSpelunkExpedition(input, { ...basic, manic: true }, { seed: 55 }), r => r.actions > 0);
assert.equal(manic.spent, Math.min(16, 30 * ordinary.spent));
assert.equal(manic.stamina[0].end, Math.max(0, 16 - 30 * ordinary.spent));
assert.equal(ordinary.status, 'running');
assert.equal(ordinary.settled, false);
assert.equal(spelunkRunMetric(ordinary, input, 'amber'), 0, 'uncollected Amber is never income');
assert.equal(spelunkRunMetric(ordinary, input, 'depth'), ordinary.depth);

const exhausted = simulateSpelunkExpedition(input, { party: [0], policy: 'dive' }, { seed: 32 });
assert.equal(exhausted.status, 'exhausted');
assert.equal(exhausted.settled, true);
assert.ok(exhausted.grossRewards[0] > 0);
assert.equal(exhausted.rewards[0], exhausted.grossRewards[0] / 2);
const lootInput = structuredClone(input);
lootInput.shop[28] = lootInput.shop[27] = lootInput.shop[29] = lootInput.shop[30] = 1e9;
lootInput.shop[42] = 200;
lootInput.bags = 1e6;
const lootConfig = { party: [2, 0], policy: 'dive' };
const loot = simulateSpelunkExpedition(lootInput, lootConfig, { seed: 328, replay: true });
const plainLoot = simulateSpelunkExpedition(lootInput, lootConfig, { seed: 328 });
const { frames: lootFrames, replayEvents: lootEvents, ...lootRest } = loot;
const { frames: plainLootFrames, replayEvents: plainLootEvents, ...plainLootRest } = plainLoot;
assert.deepEqual(lootRest, plainLootRest, 'drop recording reuses cosmetic draws without changing any run output');
const drops = lootEvents.filter(e => e.type === 'drop');
assert.ok(drops.some(e => e.reward === -1), 'Amber bags have their own visual, not a collected reward');
assert.ok(drops.filter(e => e.reward === 0).length > loot.broken, 'extra Amber stacks record individually');
const dropTotals = Array(12).fill(0);
for (const d of drops) {
  if (d.reward >= 0) dropTotals[d.reward] += d.quantity;
  assert.ok(SPELUNK_SPRITES[d.name], `native drop art exists: ${d.name}`);
  assert.ok(d.moveSeconds >= .6 && d.moveSeconds <= .8 && d.fadeSeconds >= 2.5 && d.fadeSeconds <= 2.8);
}
assert.deepEqual(dropTotals, loot.grossRewards, 'every gross reward has a positioned individual drop event');
assert.ok(lootEvents.every((e, i) => !i || e.seconds >= lootEvents[i - 1].seconds));
assert.ok(drops.every(e => lootFrames.some(f => f.seconds === e.seconds)), 'every drop tick has a replay frame');
assert.deepEqual(loot.exit.items.map(i => i.reward), [...new Set(drops.filter(d => d.reward >= 0).map(d => d.reward))]);
for (const item of loot.exit.items) {
  assert.equal(item.expected, item.gross * loot.exit.retained);
  assert.equal(item.collected, item.reward === 0 ? item.expected : item.roundedUp ? Math.ceil(item.expected) : Math.floor(item.expected));
}
for (let i = 0; i < 12; i++) assert.ok(SPELUNK_SPRITES[spelunkRewardImage(lootInput, i)]);
for (const [upgrade, tier] of [[20, 1], [41, 2], [51, 3], [66, 4]]) {
  lootInput.shop[upgrade] = 1;
  assert.equal(spelunkRewardImage(lootInput, 0), `CaveAmber${tier}`);
}
const ordered = simulateSpelunkExpedition(input, { party: [2, 0], policy: 'dive' }, { seed: 32 });
assert.equal(ordered.events.find(e => e.type === 'dig').character, 2);
assert.equal(ordered.events.find(e => e.type === 'switch').character, 0);
const withoutNovaBonus = structuredClone(input);
withoutNovaBonus.shop[38] = 0;
assert.deepEqual(simulateSpelunkExpedition(withoutNovaBonus, { party: [2, 0], policy: 'dive' }, { seed: 32 }),
  ordered, 'processed baseline does not unlock switch Novas');
const withNova = structuredClone(input);
withNova.switchNova = true;
withNova.shop[38] = 100;
assert.ok(simulateSpelunkExpedition(withNova, { party: [2, 0], policy: 'dive' }, { seed: 32 }).hits > ordered.hits);
const novaReplay = simulateSpelunkExpedition(withNova, { party: [2, 0], policy: 'dive' }, { seed: 32, replay: true });
assert.ok(novaReplay.replayEvents.some(e => e.type === 'hit' && e.source === 'nova'),
  'delayed Nova hits are recorded separately from the last dig');
const hitsByTick = new Map();
for (const e of novaReplay.replayEvents) if (e.type === 'hit')
  hitsByTick.set(e.seconds, (hitsByTick.get(e.seconds) || 0) + 1);
assert.ok([...hitsByTick.values()].some(count => count > 1), 'area hits retain every target at the same timestamp');
assert.equal(novaReplay.replayEvents.filter(e => e.type === 'hit').length, novaReplay.hits);
const oneSlot = structuredClone(input);
oneSlot.slots = 1;
assert.deepEqual(normalizeSpelunkConfig(oneSlot, { elixirs: [0, -1, -1, -1, -1] }).elixirs, [0]);
assert.throws(() => normalizeSpelunkConfig(oneSlot, { elixirs: [0, 1] }), /elixir/);

const memoryInput = structuredClone(input);
memoryInput.memorySlots = memoryInput.shop[57] = 5;
memoryInput.shop[58] = 199;
memoryInput.memorized = [4];
const memoryBefore = structuredClone(memoryInput);
const selectedMemory = [10, 7, 5, 3, 0];
const memoryRun = createSpelunkExpedition(memoryInput, { ...basic, memorized: selectedMemory },
  { seed: 32, replay: true }).result();
assert.deepEqual(memoryRun.config.memorized, [0, 3, 5, 7, 10], 'memorization is an unordered unique set');
assert.deepEqual(memoryRun.frames[0].effects, [1, 0, 0, 2, 0, 4, 0, 2, 0, 0, 2, 0, 0],
  'selected memorization applies native entry stacks, not the saved selection');
assert.deepEqual(memoryRun.frames[0].charges, [0, 0, 0, 0, 0], 'memorization needs no equipped copy or charge');
const equippedMemory = createSpelunkExpedition(memoryInput, { ...basic, elixirs: [6], memorized: [6] },
  { replay: true }).result();
assert.equal(equippedMemory.frames[0].charges[0], memoryInput.elixirs[6].charges,
  'memorizing an equipped elixir preserves every starting charge');
const oldMemoryInput = structuredClone(memoryInput);
delete oldMemoryInput.memorySlots;
assert.deepEqual(normalizeSpelunkConfig(oldMemoryInput, { memorized: selectedMemory }).memorized,
  memoryRun.config.memorized, 'older input snapshots derive capacity from shop 57');
const noMemory = createSpelunkExpedition(memoryInput, { ...basic, memorized: [] }, { seed: 32, replay: true }).result();
const noOpMemory = createSpelunkExpedition(memoryInput, { ...basic, memorized: [1, 8, 11] },
  { seed: 32, replay: true }).result();
assert.equal(noOpMemory.rngCalls, noMemory.rngCalls, 'entry-only no-op memories consume no RNG');
assert.deepEqual(noOpMemory.frames, noMemory.frames, 'no-op memories trigger no radar or Nova actions');
assert.equal(createSpelunkExpedition(memoryInput, basic, { replay: true }).result().frames[0].effects[4], 1,
  'older configurations inherit the saved memory');
assert.ok(createSpelunkExpedition(memoryInput, { ...basic, memorized: [] }, { replay: true })
  .result().frames[0].effects.every(v => v === 0), 'explicit empty memory overrides saved effects');
assert.throws(() => normalizeSpelunkConfig(memoryInput, { memorized: [0, 0] }), /different/);
assert.throws(() => normalizeSpelunkConfig(memoryInput, { memorized: [0, 1, 2, 3, 4, 5] }), /Too many/);
assert.throws(() => normalizeSpelunkConfig(memoryInput, { memorized: [12] }), /memorized elixir/);
assert.throws(() => normalizeSpelunkConfig(memoryInput, { memorized: [-1] }), /memorized elixir/);
assert.throws(() => normalizeSpelunkConfig(memoryInput, { memorized: '4' }), /memorized elixirs/);
assert.throws(() => normalizeSpelunkConfig(input, { memorized: [0] }), /Too many/);
const memoryLockedType = { ...memoryInput, elixirOwned: 4, memorized: [] };
assert.throws(() => normalizeSpelunkConfig(memoryLockedType, { memorized: [4] }), /memorized elixir/);
assert.deepEqual(memoryInput, memoryBefore, 'memorization choices never change captured account state');

const abundant = structuredClone(input);
abundant.characters.forEach(c => { c.max = c.stamina = 10000; });
const transitions = createSpelunkExpedition(abundant, basic, { seed: 934, replay: true });
transitions.step(2000);
const transitionFrames = transitions.result().frames;
assert.ok(transitionFrames.some(f => f.floorAnimation.leavingAt != null), 'fixture captures floor departure');
assert.ok(transitionFrames.some(f => f.depth > 1), 'fixture captures next-floor entry');
assert.ok(transitionFrames[0].rocks.every(r => r.alpha === 0), 'new objects start invisible');
assert.ok(transitionFrames.some(f => f.rocks.some(r => r.type === -1 && r.alpha === 1)),
  'revealed exits remain visible without an entry tween');
for (const f of transitionFrames) for (const r of f.rocks) if (r.type >= 0 && !r.boss) {
  const tile = spelunkReplayTile(f, r.slot);
  assert.ok(Math.abs(r.y - tile.y - 25) < 1e-9, 'tiles and objects retain their native relative height through transitions');
  assert.ok(Math.abs(r.alpha - tile.alpha) < 1e-9, 'tiles and objects share the same source-timed fade');
}
const legacyLimits = { farmDepth: 1, maxSeconds: 1, maxDepth: 1, maxActions: 1 };
assert.deepEqual(normalizeSpelunkConfig(input, { ...basic, ...legacyLimits }), normalizeSpelunkConfig(input, basic),
  'obsolete saved cutoffs are discarded, not hidden defaults');
assert.equal(normalizeSpelunkConfig(input, { ...basic, policy: 'push-farm' }).policy, 'efficient');
const autoBase = { party: [0], policy: 'auto', speed: 0 };
const slow = advanceUntil(createSpelunkExpedition(abundant, autoBase, { seed: 75 }), r => r.actions > 0);
const fast = advanceUntil(createSpelunkExpedition(abundant, { ...autoBase, speed: 4 }, { seed: 75 }), r => r.actions > 0);
assert.ok(fast.events.find(e => e.type === 'dig').time < slow.events.find(e => e.type === 'dig').time);
const autoEarly = advanceUntil(createSpelunkExpedition(abundant, autoBase, { seed: 75 }), r => r.events.some(e => e.type === 'descend'));
const autoClear = advanceUntil(createSpelunkExpedition(abundant, { ...autoBase, fullClear: true }, { seed: 75 }), r => r.events.some(e => e.type === 'descend'));
assert.ok(autoClear.broken >= autoEarly.broken);
assert.ok(autoClear.seconds >= autoEarly.seconds);
const uncapped = createSpelunkExpedition(abundant, { ...autoBase, ...legacyLimits }, { seed: 75, replay: true, maxFrames: 2 });
uncapped.step(12000);
const shortReplay = uncapped.result();
assert.equal(shortReplay.status, 'running');
assert.ok(shortReplay.seconds > 1 && shortReplay.actions > 1 && shortReplay.depth > 1);
assert.ok(uncapped.progress > 0 && uncapped.progress < 1, 'uncapped progress uses remaining party stamina');
assert.ok(shortReplay.frames.length > 1000, 'long recordings are not coarsened');
assert.equal(shortReplay.frameIntervalSeconds, .1);
assert.ok(shortReplay.frames.every((f, i) => !i || f.seconds - shortReplay.frames[i - 1].seconds <= .100001));
uncapped.step(100000);
const longReplay = uncapped.result();
assert.ok(longReplay.eventsDropped > 0, 'long fixture passes the diagnostic log budget');
assert.equal(longReplay.events.length, 2000, 'ordinary diagnostics retain their existing bound');
assert.equal(longReplay.replayEvents.filter(e => e.type === 'dig').length, longReplay.actions);
assert.equal(longReplay.replayEvents.filter(e => e.type === 'hit').length, longReplay.hits,
  'full replay survives the diagnostic log cap');
const buffEffects = [1, 0, 1, 200, 3, 4, 2, 3, 0, 1, 2, 0, 5];
const buffInput = structuredClone(input);
buffInput.elixirs[2].quantity = 75;
const buffs = spelunkActiveBuffs(buffInput, buffEffects);
assert.equal(buffs.find(b => b.id === 0).value, 75, 'refund uses the actual native consumer, not the description quantity');
assert.equal(buffs.find(b => b.id === 2).value, 50, 'revival share caps at half maximum stamina');
assert.equal(buffs.find(b => b.id === 3).value, 1 + .1 * input.elixirs[3].quantity * 200 / 100);
assert.equal(buffs.find(b => b.id === 4).value, 5 / (1 + input.elixirs[4].quantity / 100) ** 2);
assert.equal(buffs.find(b => b.id === 10).value, 200, 'Overdrive reflects all recorded stacks');
assert.equal(buffs.find(b => b.id === 12).value, 1.5);
assert.deepEqual(spelunkActiveBuffs(input, Array(13).fill(0)), [], 'backward seeking before buffs leaves no active rows');
assert.deepEqual(buffEffects, [1, 0, 1, 200, 3, 4, 2, 3, 0, 1, 2, 0, 5]);
const shortcut = structuredClone(abundant);
shortcut.shortcut = true; shortcut.depths[0] = 150; shortcut.shop[22] = 25;
let ropeRun = null, ropeFloor = null;
for (let seed = 0; seed < 10 && !ropeRun; seed++) {
  const run = createSpelunkExpedition(shortcut, { party: [0], policy: 'dive', ...legacyLimits }, { seed, replay: true, maxFrames: 2 });
  for (let i = 0; i < 2000 && !run.done; i++) {
    const r = run.result();
    if (r.frames.at(-1).rocks.some(rock => rock.type === -2)) { ropeRun = run; ropeFloor = r.depth; break; }
    run.step(10);
  }
}
assert.ok(ropeRun && ropeFloor > 50, 'fixture encounters an untouched rope beyond the old farm cutoff');
const continued = advanceUntil(ropeRun, r => r.events.some(e => e.depth === ropeFloor && e.type === 'dig'));
assert.equal(continued.status, 'running', 'depth diving digs instead of taking the rope');
assert.ok(!continued.events.some(e => e.type === 'rope'));
const grandElixir = simulateSpelunkExpedition(input, { ...basic, elixirs: [9] }, { seed: 32 });
assert.equal(grandElixir.events.find(e => e.type === 'elixir').id, 9, 'manual elixirs need no farming-depth gate');
const uncappedExhaustion = simulateSpelunkExpedition(input, { ...basic, ...legacyLimits }, { seed: 32 });
assert.equal(uncappedExhaustion.status, 'exhausted');
assert.equal(uncappedExhaustion.stamina[0].end, 0);

const zeroShop = { spelunkData: Array.from({ length: 48 }, () => []) };
for (const [id, value] of [[7, 15], [19, 50], [25, 1], [38, 20]]) {
  zeroShop.spelunkData[5][id] = 0;
  assert.equal(shopUpgBonus(id, zeroShop), value, `native processed shop baseline ${id}`);
  zeroShop.spelunkData[5][id] = -1;
  assert.equal(shopUpgBonus(id, zeroShop), value, 'unbought levels retain the processed baseline');
}

const sourcePath = new URL('../../src/N.new.formatted.js', import.meta.url);
if (fs.existsSync(sourcePath)) {
  const source = fs.readFileSync(sourcePath, 'utf8');
  const memoryLoop = source.match(/for \(var r = Math.floor\(1 \+[^\r\n]+ShopUpgBonus", 58[^\r\n]+/)[0];
  const nativeMemory = new Function('id', 'bonus', `
    const c = { asNumber: Number }, D = { contains: (a, v) => a.includes(v) };
    const m = { _customBlock_Spelunk: () => bonus };
    this._DN1 = id; this._GenINFO = []; this._GenINFO[107] = Array(13).fill(0);
    let s = 0; ${memoryLoop}
    return this._GenINFO[107];
  `);
  for (let id = 0; id < input.elixirOwned; id++) {
    const initial = createSpelunkExpedition(memoryInput, { ...basic, memorized: [id] }, { replay: true }).result();
    assert.deepEqual(initial.frames[0].effects, nativeMemory.call({}, id, memoryInput.shop[58]),
      `native memorized entry effect ${id}, including no-op types`);
  }
  const parameters = source.match(/\._customBlock_Spelunk = function\(([^)]+)\)/)[1].split(',').map(p => p.trim());
  const expressions = ['RockPOWreq', 'RockHP', 'RockAmber'].map(name =>
    source.match(new RegExp(`if \\("${name}" == ${parameters[0]}\\)[^\\r\\n]+`))[0]).join('\n')
    .replace(/\b\w+\.engine\b/g, 'scope.engine')
    .replace(/\b\w+\.asNumber\b/g, 'helpers.asNumber')
    .replace(/\b\w+\.__cast\b/g, 'helpers.__cast')
    .replace(/,\s*\w+\)\._GenINFO/g, ',null)._GenINFO');
  const native = new Function(...parameters, 'scope', 'helpers', expressions);
  const actor = { _GenINFO: [] }, attributes = {
    OptionsListAccount: Array(500).fill(20), CustomLists: { h: { SpelunkRocks } },
    PixelHelperActor: Array.from({ length: 27 }, () => ({ behaviors: { getBehavior: () => actor } })),
  };
  for (const cave of spelunkCaves()) for (let type = 0; type < cave.rocks.length; type++)
    for (const depth of [Math.max(0, cave.rocks[type].depth), 100, 300]) {
      actor._GenINFO[70] = depth;
      const local = spelunkRockStats(cave, type, depth);
      for (const [name, key] of [['RockPOWreq', 'requirement'], ['RockHP', 'hp'], ['RockAmber', 'amber']])
        assert.equal(local[key], native(name, type, cave.id, { engine: { getGameAttribute: k => attributes[k] } },
          { asNumber: Number, __cast: a => a }), `${name}, cave ${cave.id}, type ${type}, depth ${depth}`);
    }
}

function drive(iterator, requests) {
  let next = iterator.next();
  while (!next.done) {
    requests.push(next.value);
    next = iterator.next(simulateSpelunkExpedition(input, next.value.config, { seed: next.value.seed }));
  }
  return next.value;
}
const requests = [];
const comparison = drive(createSpelunkComparison(input, [
  { label: 'Normal', config: { ...basic, ...legacyLimits } }, { label: 'Manic', config: { ...basic, manic: true } },
], { trials: 2, seed: 12, objective: 'amber' }), requests);
assert.equal(comparison.rows.length, 2);
assert.equal(requests[0].seed, requests[1].seed, 'candidate trials use shared seeds');
assert.ok(comparison.rows[0].amber > 0, 'old named-configuration limits cannot suppress settlement');
const searchRequests = [];
const narrowScope = { partyMin: 1, partyMax: 1, modes: ['manual'], clears: [false],
  speeds: [], elixirs: [], memorized: [] };
const searched = drive(createSpelunkSearch(input, { ...basic, ...legacyLimits }, {
  scope: narrowScope, screening: 1, trials: 2, seed: 12, objective: 'grand',
  configurations: [{ label: 'Submitted', config: { ...basic, party: [1], ...legacyLimits } }],
}), searchRequests);
assert.ok(searched.rows.some(r => r.label === 'Selected baseline'));
assert.ok(searched.rows.some(r => r.label === 'Submitted'));
const trainingSeeds = new Set(searchRequests.filter(r => r.progress < .75).map(r => r.seed));
assert.ok(searchRequests.filter(r => r.progress >= .75).every(r => !trainingSeeds.has(r.seed)));
assert.equal(searched.winner, searched.baseline, 'ties retain the selected baseline');
assert.throws(() => createSpelunkSearch(input, basic, {
  configurations: [{ config: { ...basic, manic: true } }],
}).next(), /Normal\/Manic/);
const broadRequests = [], repeatedRequests = [];
const options = { scope: narrowScope, screening: 1, trials: 2, seed: 12 };
const broad = drive(createSpelunkSearch(input, basic, options), broadRequests);
assert.equal(broad.screened, 72, 'every party, manual policy, tool and entry is screened');
assert.equal(broad.exhaustive, true);
assert.equal(spelunkSearchSpace(input, basic, narrowScope).configurations, broad.configurations);
assert.deepEqual(drive(createSpelunkSearch(input, basic, options), repeatedRequests), broad);
assert.deepEqual(repeatedRequests, broadRequests, 'candidate order and seeds are repeatable');
assert.ok(broadRequests.every((r, i) => !i || r.progress >= broadRequests[i - 1].progress));
assert.ok([...requests, ...searchRequests, ...broadRequests].every(r =>
  Object.keys(legacyLimits).every(key => !(key in r.config))),
  'comparisons, submitted configurations and optimizer candidates have no expedition cutoffs');
for (const [name, art] of Object.entries(SPELUNK_SPRITES)) {
  const bytes = fs.readFileSync(new URL(`../../assets/spelunking/${name}.png`, import.meta.url));
  assert.equal(bytes.readUInt32BE(16), art.w);
  assert.equal(bytes.readUInt32BE(20), art.h);
  assert.equal(createHash('sha256').update(bytes).digest('hex').toUpperCase(), art.sha256, name);
}
const memoryRequests = [];
const memoryScope = { partyMin: 1, partyMax: 1, modes: ['auto'], clears: [false],
  speeds: [0], elixirs: [0], memorized: [4, 6] };
const memorySearch = createSpelunkSearch(memoryInput, { ...basic, memorized: [4] },
  { scope: memoryScope, screening: 1, trials: 2, seed: 12, objective: 'amber' });
let memoryNext = memorySearch.next();
while (!memoryNext.done) {
  const request = memoryNext.value;
  memoryRequests.push(request);
  assert.deepEqual(normalizeSpelunkConfig(memoryInput, request.config), request.config);
  const run = { ...normal, seed: request.seed, rewards: [request.config.memorized.includes(6) ? 100 : 0] };
  memoryNext = memorySearch.next(run);
}
assert.ok(memoryNext.value.winner.config.memorized.includes(6), 'search can recommend a different memorized set');
assert.deepEqual(memoryNext.value.baseline.config.memorized, [4], 'selected baseline memory stays mandatory');
assert.equal(memoryNext.value.configurations, 240, 'all maximally filled duplicate-limited belts and memory subsets are combined');
assert.equal(memoryNext.value.screened, 241, 'an excluded reference is measured in addition to the complete scope');
assert.ok(memoryRequests.slice(1).every(r => r.config.elixirs.filter(id => id === 0).length === 2
  || JSON.stringify(r.config) === JSON.stringify(memoryRequests[0].config)),
  'insufficient pools use every available duplicate without exceeding the native cap');
assert.ok(memoryRequests.some(r => !r.config.memorized.length), 'search tests removing all memories');
assert.ok(memoryRequests.some(r => r.config.memorized.length === memoryScope.memorized.length),
  'search tests the whole allowed memory pool when it fits unlocked capacity');
assert.ok(memoryRequests.some(r => r.config.memorized.length > 0
  && JSON.stringify(r.config.elixirs) !== JSON.stringify(memoryRequests[0].config.elixirs)),
  'search varies equipped and memorized choices jointly');
assert.deepEqual(memoryInput, memoryBefore);
function driveBatches(iterator, record, measure = r => simulateSpelunkExpedition(input, r.config, { seed: r.seed })) {
  let next = iterator.next();
  while (!next.done) {
    const batch = next.value.requests || [next.value];
    record.push(...batch);
    const runs = batch.map(measure);
    next = iterator.next(next.value.requests ? runs : runs[0]);
  }
  return next.value;
}
const pooledRequests = [];
assert.deepEqual(driveBatches(createSpelunkSearch(input, basic, { ...options, batchSize: 4 }), pooledRequests), broad,
  'batching cannot change candidate decisions, aggregate arithmetic or winner');
assert.deepEqual(pooledRequests, broadRequests, 'parallel requests retain sequential config/seed order');
const pooledComparison = driveBatches(createSpelunkComparison(input, [
  { label: 'Normal', config: { ...basic, ...legacyLimits } }, { label: 'Manic', config: { ...basic, manic: true } },
], { trials: 2, seed: 12, objective: 'amber', batchSize: 4 }), []);
assert.deepEqual(pooledComparison, comparison, 'comparison batches restore original trial order');

const scopeInput = { ...memoryInput, slots: 2, dupes: 1 };
const scopedOptions = { ...options, scope: {
  partyMin: 2, partyMax: 3, modes: ['auto'], clears: [false, true], speeds: [0, 1, 4],
  elixirs: [0, 2], memorized: [6],
} };
const scopedRequests = [], normalizedBase = normalizeSpelunkConfig(scopeInput, { ...basic, memorized: [4] });
const inScope = c => c.policy === 'auto' && c.party.length >= 2 && c.party.length <= 3
  && [0, 1, 4].includes(c.speed) && c.elixirs.every(id => [0, 2].includes(id))
  && c.memorized.every(id => id === 6);
const measureScope = request => ({ ...normal, seed: request.seed, depth: inScope(request.config) ? 5 : 1000 });
const scoped = driveBatches(createSpelunkSearch(scopeInput, normalizedBase, scopedOptions), scopedRequests, measureScope);
assert.ok(scoped.baseline.referenceOnly);
assert.equal(scoped.baseline.score, 1000);
assert.equal(scoped.winner.score, 5, 'an excluded reference cannot win even with the highest score');
assert.ok(inScope(scoped.winner.config));
assert.ok(scopedRequests.every(r => JSON.stringify(r.config) === JSON.stringify(normalizedBase) || inScope(r.config)),
  'all generated and refined candidates obey every selected restriction');
assert.deepEqual([...new Set(scopedRequests.filter(r => inScope(r.config)).map(r => r.config.speed))].sort(), [0, 1, 4]);
assert.deepEqual([...new Set(scopedRequests.filter(r => inScope(r.config)).map(r => r.config.party.length))].sort(), [2, 3]);
assert.deepEqual(scoped.searchScope, scopedOptions.scope, 'results capture exact allowed choices');
const scopedPooledRequests = [];
assert.deepEqual(driveBatches(createSpelunkSearch(scopeInput, normalizedBase, { ...scopedOptions, batchSize: 4 }),
  scopedPooledRequests, measureScope), scoped);
assert.deepEqual(scopedPooledRequests, scopedRequests);
const screenedConfigs = scopedRequests.filter(r => r.progress < .75 && inScope(r.config));
assert.equal(scoped.configurations, 576, '12 ordered parties x 6 Auto settings x 2 full belts x 2 memories x 2 entries');
assert.equal(screenedConfigs.length, 576, 'coverage is not capped at the old 48 or 256 configurations');
assert.equal(new Set(screenedConfigs.map(r => JSON.stringify(r.config))).size, 576, 'each legal setup is screened exactly once');
assert.ok(screenedConfigs.every(r => JSON.stringify(normalizeSpelunkConfig(scopeInput, r.config)) === JSON.stringify(r.config)),
  'every exhaustive candidate respects native capacities, duplicate limits and unique party/memory rules');
assert.ok(screenedConfigs.some(r => r.config.party.join() === '1,2,0' && r.config.speed === 4
  && r.config.fullClear && r.config.elixirs.join() === '2,0' && r.config.memorized.join() === '6'
  && r.config.entry === 'shortcut'), 'late joint combinations cannot be pruned');
assert.deepEqual(spelunkSearchSpace(scopeInput, normalizedBase, scopedOptions.scope).configurations, 576);
assert.deepEqual(driveBatches(createSpelunkSearch(scopeInput, normalizedBase, { ...scopedOptions, budget: 8 }),
  [], measureScope), scoped, 'obsolete budget options cannot truncate exhaustive coverage');
const duplicateInput = { ...memoryInput, dupes: 3 };
const duplicateScope = { partyMin: 1, partyMax: 1, modes: ['auto'], clears: [false],
  speeds: [0], elixirs: [0, 2, 7], memorized: [7] };
const duplicateBase = normalizeSpelunkConfig(duplicateInput, { ...basic, policy: 'auto',
  elixirs: [0, 2, 7], memorized: [7] });
const duplicateRequests = [];
const duplicateSearch = driveBatches(createSpelunkSearch(duplicateInput, duplicateBase,
  { ...options, scope: duplicateScope }), duplicateRequests, request => ({
    ...normal, seed: request.seed, depth: request.config.elixirs.includes(-1) ? 1000
      : request.config.elixirs.filter(id => id === 7).length,
  }));
assert.equal(duplicateSearch.configurations, 2520, '210 full belts x 3 parties x 2 memories x 2 entries');
assert.equal(spelunkSearchSpace(duplicateInput, duplicateBase, duplicateScope).configurations, 2520);
assert.ok(duplicateSearch.baseline.referenceOnly, 'an underfilled baseline cannot win even with a higher score');
assert.equal(duplicateSearch.winner.score, 3, 'three purple elixirs remain eligible for recommendation');
assert.ok(duplicateSearch.winner.config.elixirs.every(id => id >= 0));
const fullBelts = duplicateRequests.filter(r => r.progress < .75
  && JSON.stringify(r.config) !== JSON.stringify(duplicateBase));
assert.equal(fullBelts.length, 2520);
assert.equal(new Set(fullBelts.map(r => JSON.stringify(r.config))).size, 2520);
assert.ok(fullBelts.every(r => r.config.elixirs.every(id => id >= 0)
  && duplicateScope.elixirs.every(id => r.config.elixirs.filter(v => v === id).length <= 3)));
const purpleInput = { ...input, slots: 3, dupes: 3, shop: [...input.shop] };
purpleInput.shop[31] = 20;
const purpleRun = simulateSpelunkExpedition(purpleInput,
  { ...basic, elixirs: [7, 7, 7] }, { seed: 12, replay: true });
assert.deepEqual(purpleRun.replayEvents.filter(e => e.type === 'elixir').slice(0, 3).map(e => e.slot), [0, 1, 2],
  'each duplicate purple supplies an additional native stack');
const purpleBuff = spelunkActiveBuffs(purpleInput, [0, 0, 0, 0, 0, 0, 0, 3]).find(b => b.id === 7);
assert.equal(purpleBuff.value, .9, 'three doses each add 30% to extra-strike quantity');
assert.match(purpleBuff.detail, /30%/, 'the chance bonus caps at 1.5x the base chance, independently of extra strikes');
const ui = fs.readFileSync(new URL('../ui/spelunking.js', import.meta.url), 'utf8');
const host = { innerHTML: '' };
vm.runInNewContext(ui.slice(ui.indexOf('const elixirNames ='), ui.indexOf('const storageKey ='))
  + ui.slice(ui.indexOf('function configurationText('), ui.indexOf('function renderConfigurations('))
  + ui.slice(ui.indexOf('function renderComparison('), ui.indexOf('function start('))
  + '\nrenderComparison(bundle, "result");', {
    bundle: { result: duplicateSearch, input: duplicateInput }, $: () => host,
    esc: String, num: String, text: String, art: String, portrait: c => `Character ${c.id}`,
  });
const cells = [...host.innerHTML.matchAll(/<td data-label="Configuration">([\s\S]*?)<\/td>/g)];
assert.equal(cells.length, duplicateSearch.rows.length);
assert.ok(cells.every(([, cell]) => cell.includes('Native Auto') && cell.includes('captured-party')
  && cell.includes('captured-belt') && cell.includes('Memory') && cell.includes('Auto tools')),
  'every comparison row visibly describes its captured strategy, party, belt, memories and tools');
assert.ok(!host.innerHTML.includes('Screened strategy'), 'internal search-origin labels are not primary configurations');
const largeInput = { ...memoryInput, caves: [{ ...memoryInput.caves[0], capacity: 6 }],
  characters: Array.from({ length: 12 }, (_, id) => ({ id, name: `Character ${id + 1}`, max: 8, stamina: 8 })) };
const largeSpace = spelunkSearchSpace(largeInput, basic);
assert.equal(typeof largeSpace.configurations, 'string', 'huge exact workload counts cannot lose integer precision');
assert.ok(BigInt(largeSpace.configurations) > BigInt(Number.MAX_SAFE_INTEGER));
const hugeSearch = createSpelunkSearch(largeInput, basic);
assert.ok(hugeSearch.next().value.config, 'huge searches yield immediately instead of materializing their configuration space');
hugeSearch.return();
const emptyRequests = [];
const emptyScope = { partyMin: 1, partyMax: 1, modes: ['manual'], clears: [true],
  speeds: [], elixirs: [], memorized: [] };
const empty = driveBatches(createSpelunkSearch(scopeInput, normalizedBase, { ...options, scope: emptyScope }),
  emptyRequests, measureScope);
assert.equal(empty.winner.config.policy, 'clear', 'manual full-clear excludes the other manual policies');
assert.ok(empty.winner.config.elixirs.every(id => id === -1));
assert.deepEqual(empty.winner.config.memorized, []);
assert.ok(emptyRequests.every(r => r.config.policy === 'clear' || JSON.stringify(r.config) === JSON.stringify(normalizedBase)));
for (const scope of [{ modes: [] }, { clears: [] }, { speeds: [] }, { speeds: [5] },
  { partyMin: 3, partyMax: 2 }, { elixirs: [12] }, { memorized: [-1] }])
  assert.throws(() => normalizeSpelunkSearchScope(input, normalizeSpelunkConfig(input, basic), scope), /Invalid/);
assert.throws(() => normalizeSpelunkSearchScope(tired, normalizeSpelunkConfig(tired, basic),
  { partyMin: 3, partyMax: 3 }), /Not enough/);
const badBatch = createSpelunkComparison(input, [{ config: basic }], { batchSize: 4 });
badBatch.next();
assert.throws(() => badBatch.next([]), /Invalid ordered/);
assert.deepEqual(input, original);
console.log('Spelunking expedition, native rock formulas, settlement, recording and search assertions passed.');
