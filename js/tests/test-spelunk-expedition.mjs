import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { spelunkCaves, spelunkTools, spelunkElixirs } from '../stats/data/w7/spelunking.js';
import { shopUpgBonus } from '../stats/systems/w7/spelunking.js';
import { createSpelunkExpedition, normalizeSpelunkConfig, simulateSpelunkExpedition, spelunkRockStats, spelunkActiveBuffs, spelunkRewardImage } from '../stats/systems/w7/spelunk-expedition.js';
import { createSpelunkComparison, createSpelunkCaveComparison, createSpelunkSearch, createSpelunkAmberSearch, createSpelunkPartyAnalysis, normalizeSpelunkSearchScope, spelunkSearchSpace, spelunkRunMetric } from '../stats/systems/w7/spelunk-planner.js';
import { SpelunkRocks, SpelunkUpg } from '../stats/data/game/customlists.js';
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
assert.deepEqual(ordered.diagnostics.members.map(c => c.id), [2, 0]);
for (const key of ['hits', 'misses', 'broken', 'grands'])
  assert.equal(ordered.diagnostics.members.reduce((sum, c) => sum + c[key], 0), ordered[key],
    `${key} activity partitions across members without duplicating delayed effects`);
for (let key = 0; key < 12; key++)
  assert.ok(Math.abs(ordered.diagnostics.members.reduce((sum, c) => sum + c.rewards[key], 0) - ordered.grossRewards[key]) < 1e-8);
assert.equal(ordered.diagnostics.members.reduce((sum, c) => sum + c.descents, 0),
  ordered.events.filter(e => e.type === 'descend').length);
const duringTurn = createSpelunkExpedition(input, { party: [2, 0], policy: 'dive' }, { seed: 32 });
const midTurn = advanceUntil(duringTurn, r => r.actions > 0);
assert.equal(midTurn.diagnostics.members[1].unused, true);
midTurn.diagnostics.members[0].rewards[0] = -999;
assert.ok(duringTurn.result().diagnostics.members[0].rewards[0] >= 0, 'diagnostic arrays are detached');
const wallInput = { ...input, pow: 1e-100 };
const wallConfig = { party: [2, 0], policy: 'dive', tool: 0 };
const wall = simulateSpelunkExpedition(wallInput, wallConfig, { seed: 32 });
assert.equal(wall.status, 'exhausted');
assert.equal(wall.hits, 0);
assert.equal(wall.diagnostics.resistStall, true);
assert.equal(wall.diagnostics.unused, 0, 'members consumed against resists are not classified as unused');
assert.ok(wall.diagnostics.members.every(c => c.noAdvance && c.noFurtherFloor && c.resistStall
  && c.resistedStamina === c.spent && c.spent > 0));
const toughInput = structuredClone(input);
toughInput.caves.forEach(c => c.rocks.forEach(r => { r.hp = 1e20; }));
const tough = simulateSpelunkExpedition(toughInput, wallConfig, { seed: 32 });
assert.equal(tough.broken, 0);
assert.ok(tough.hits > 0);
assert.equal(tough.diagnostics.resistStall, false, 'ordinary damage without resists is not a resist stall');
assert.ok(tough.diagnostics.members.some(c => c.damage > 0 && c.noAdvance),
  'partial damage is retained even without a break or descent');
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
const refillInput = structuredClone(abundant);
refillInput.shop[36] = 1;
const refillConfig = { party: [0], policy: 'clear-fifth', entry: 'surface', elixirs: [11] };
const refillRun = createSpelunkExpedition(refillInput, refillConfig, { seed: 75, replay: true });
let refillResult = refillRun.result();
for (let i = 0; i < 200 && !refillRun.done && refillResult.depth < 11; i++) {
  refillRun.step(200); refillResult = refillRun.result();
}
assert.ok(refillResult.depth >= 11, 'the fifth-depth strategy reaches both refill floors in this fixture');
const refillDescents = refillResult.frames.filter(f => f.lastAction?.type === 'descend'
  && f.lastAction.seconds === f.seconds && f.depth <= 10);
assert.equal(refillDescents.length, 10);
for (const f of refillDescents.filter(f => f.depth % 5 === 0)) {
  assert.ok(f.rocks.every(r => r.type < 0), `depth ${f.depth} is fully cleared before descent`);
  assert.equal(f.charges[0], refillInput.elixirs[11].charges + f.depth / 5,
    'hidden fifth-depth objects grant real charge refills, carried across floors');
}
assert.ok(refillDescents.filter(f => f.depth % 5 !== 0).every(f => f.rocks.some(r => r.type >= 0)),
  'other depths descend at the first revealed exit instead of full-clearing');
const firstRefillDescent = refillDescents[0];
const efficientStart = advanceUntil(createSpelunkExpedition(refillInput, { ...refillConfig, policy: 'efficient' },
  { seed: 75 }), r => r.events.some(e => e.type === 'descend'));
assert.equal(firstRefillDescent.seconds, efficientStart.events.find(e => e.type === 'descend').time,
  'ordinary floors retain the existing stamina-efficient manual behavior');
for (const withElixirs of [false, true]) {
  const noRefills = { ...refillInput, shop: [...refillInput.shop], shortcut: true, depths: [50, 0] };
  noRefills.shop[36] = withElixirs ? 0 : 1;
  const run = createSpelunkExpedition(noRefills, { ...refillConfig, entry: 'shortcut',
    elixirs: withElixirs ? [11] : [] }, { seed: 75, replay: true });
  const result = advanceUntil(run, r => r.events.some(e => e.type === 'descend'));
  const f = result.frames.find(f => f.lastAction?.type === 'descend' && f.lastAction.seconds === f.seconds);
  assert.equal(f.depth, 50, 'shortcut entry uses the absolute depth, not five floors since entry');
  assert.ok(f.rocks.every(r => r.type < 0));
  assert.equal(f.charges[0], withElixirs ? noRefills.elixirs[11].charges : 0,
    'the strategy cannot invent refills without both Hidden Elixirs and an equipped elixir');
}
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
  const rockTable = source.match(/\.SpelunkRocks = function\(\) \{([\s\S]*?)\n\s*\},/);
  assert.ok(rockTable, 'native object definitions are available independently of extracted tables');
  const nativeRocks = new Function(rockTable[1])();
  assert.deepEqual(SpelunkRocks, nativeRocks, 'object coefficients, growth and depth gates match the current source');
  const shopStart = source.indexOf('if ("ShopUpgBonus" == e) {');
  const shopEnd = source.indexOf('if ("ExaltDropChance" == e)', shopStart);
  assert.ok(shopStart > 0 && shopEnd > shopStart);
  const nativeShop = new Function('a', 'c', 'k', 'm', 'h', `
    var e = 'ShopUpgBonus', t = 3, i = 0, _, s, o, r, u;
    ${source.slice(shopStart, shopEnd)}
  `);
  const haulSave = { spelunkData: Array.from({ length: 48 }, () => []) };
  haulSave.spelunkData[5][3] = 10;
  for (const hauls of [[0, .1, .99999, 1], [1.000001, 10.00001], [10, 100, 1e30], [1e30 * 1.00001]]) {
    haulSave.spelunkData[2] = hauls;
    const attributes = {
      Spelunk: haulSave.spelunkData, DNSM: { h: {} }, GetPlayersUsernames: [],
      CustomLists: { h: { SpelunkUpg } },
    };
    const nativeBonus = nativeShop(
      { engine: { getGameAttribute: key => attributes[key] } }, { asNumber: Number },
      { _customBlock_getLOG: v => Math.log(Math.max(v, 1)) / 2.30259 },
      { _customBlock_Spelunk: (name, id, mode) => {
        if (name === 'GrandDiscoveries_Total') return 0;
        assert.equal(name, 'ShopUpgBonus'); assert.equal(mode, 1);
        return Number(SpelunkUpg[id][4]) * Math.max(0, Number(haulSave.spelunkData[5][id]) || 0);
      } }, { string: String });
    assert.equal(shopUpgBonus(3, haulSave), nativeBonus, 'haul POW uses native clamped/approximate getLOG');
  }
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
    OptionsListAccount: Array(500).fill(20), CustomLists: { h: { SpelunkRocks: nativeRocks } },
    PixelHelperActor: Array.from({ length: 27 }, () => ({ behaviors: { getBehavior: () => actor } })),
  };
  for (const cave of spelunkCaves()) for (let type = 0; type < cave.rocks.length; type++)
    for (const depth of new Set([0, Math.max(0, cave.rocks[type].depth - 1), cave.rocks[type].depth,
      cave.rocks[type].depth + 1, cave.bossDepth, 100, 300])) {
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
const amberInput = { ...fixture(), dupes: 3 };
const amberBase = { ...config, elixirs: [3, 3, 3, 6, 6], entry: 'surface', tool: 0 };
const amberBefore = structuredClone({ amberInput, amberBase });
const amberOptions = { screening: 1, trials: 2, maxTrials: 2, seed: 33, from: 2, to: 6, minRopePct: 100 };
function amberMeasure(request) {
  const a = request.config.amber, safe = a?.reservePct === 100, blocked = a?.harvestDepths === 3;
  return { ...normal, seed: request.seed, settled: !blocked, status: blocked ? 'blocked' : safe ? 'rope' : 'exhausted',
    depth: 20, rewards: [!a ? 99999 : blocked ? 99999 : safe ? a.dumpDepth : 1000],
    exit: blocked ? null : { type: safe ? 'rope' : 'toll' },
    amber: a ? { phase: 'rope-search', dumpDigs: 2, dumpSpent: 20, activations: [],
      transitions: [], activationDepth: a.dumpDepth } : undefined };
}
const amberRequests = [];
const amberSearch = driveBatches(createSpelunkAmberSearch(amberInput, amberBase, amberOptions), amberRequests, amberMeasure);
assert.equal(amberSearch.kind, 'amber-search');
assert.equal(amberSearch.amberSearch.coarse, 170);
assert.ok(amberSearch.amberSearch.refined > 0);
assert.equal(amberSearch.winner.config.amber.reservePct, 100, 'the sampled rope requirement excludes higher-yield toll strategies');
assert.equal(amberSearch.winner.config.amber.dumpDepth, 6);
assert.ok(amberSearch.delta < 0, 'a worse qualifying Amber strategy is reported honestly against the reference');
assert.ok(amberSearch.baseline.referenceOnly, 'an ordinary reference cannot masquerade as an optimized phased strategy');
assert.ok(amberSearch.rows.some(r => !r.riskEligible));
assert.ok(amberSearch.rows.every(r => r.rope + r.toll + r.blocked === r.total));
assert.ok(amberRequests.every(r => r.config.party.join() === amberBase.party.join()
  && r.config.elixirs.join() === amberBase.elixirs.join()
  && r.config.entry === amberBase.entry && r.config.tool === amberBase.tool));
assert.deepEqual(driveBatches(createSpelunkAmberSearch(amberInput, amberBase, { ...amberOptions, batchSize: 4 }),
  [], amberMeasure), amberSearch, 'phase selection and paired differences retain ordered-batch parity');
const amberTrainingSeeds = new Set(amberRequests.filter(r => !r.phase.startsWith('Fresh-seed')).map(r => r.seed));
assert.ok(amberRequests.filter(r => r.phase.startsWith('Fresh-seed')).every(r => !amberTrainingSeeds.has(r.seed)),
  'fresh finalists never reuse discovery seeds');
assert.ok(amberRequests.every((r, i) => !i || r.progress >= amberRequests[i - 1].progress),
  'dependent discovery, refinement and comparison phases preserve monotonic progress');
assert.equal(new Set(amberRequests.map(r => `${JSON.stringify(r.config)}:${r.seed}`)).size, amberRequests.length,
  'training extensions reuse prior samples instead of simulating the same configuration and seed again');
const infeasibleAmber = driveBatches(createSpelunkAmberSearch(amberInput, amberBase, amberOptions), [],
  r => ({ ...amberMeasure(r), exit: { type: 'toll' } }));
assert.equal(infeasibleAmber.winner, null);
assert.equal(infeasibleAmber.delta, null);
const noRiskLimit = driveBatches(createSpelunkAmberSearch(amberInput, amberBase, { ...amberOptions, minRopePct: 0 }),
  [], amberMeasure);
assert.equal(noRiskLimit.winner.score, 1000, 'zero minimum permits real toll payouts, never uncollected gross Amber');
assert.equal(driveBatches(createSpelunkAmberSearch(amberInput, amberBase, { ...amberOptions, to: null }),
  [], amberMeasure).amberSearch.to, 20, 'automatic upper depth comes from measured baseline runs');
for (const options of [{ minRopePct: 101 }, { from: 0 }, { from: 7, to: 6 }, { objective: 'depth' },
  { trials: 12, maxTrials: 8 }, { maxTrials: 257 }])
  assert.throws(() => createSpelunkAmberSearch(amberInput, amberBase, options).next(), /Invalid|Choose/);
assert.throws(() => createSpelunkAmberSearch(amberInput, config).next(), /equipped orange/);
const refinedRequests = [];
const refinedSearch = driveBatches(createSpelunkAmberSearch(amberInput, amberBase,
  { ...amberOptions, from: 2, to: 10, minRopePct: 0 }), refinedRequests, request => {
    const a = request.config.amber;
    return { ...amberMeasure(request), settled: true, status: 'rope', exit: { type: 'rope' },
      rewards: [a ? 200 - (a.dumpDepth - 7) ** 2 - (a.reservePct - 65) ** 2 / 10 : 10] };
  });
assert.ok(!refinedSearch.amberSearch.depths.includes(7));
assert.equal(refinedSearch.winner.config.amber.dumpDepth, 7, 'refinement discovers the optimum between coarse dump depths');
assert.equal(refinedSearch.winner.config.amber.reservePct, 65, 'fine reserve refinement is not limited to 50% or 100%');
assert.ok(refinedRequests.some(r => r.config.amber?.ropeReservePct === 40),
  'emergency rope thresholds are refined as well as dump depths');
const portfolioRequests = [];
const firstTrainingSeed = amberRequests[0].seed;
function portfolioMeasure(request) {
  const a = request.config.amber, distinct = a?.ropeReservePct === 75;
  return { ...normal, seed: request.seed, settled: true, status: 'rope', exit: { type: 'rope' },
    rewards: [!a ? 10 : distinct ? request.seed === firstTrainingSeed ? 98 : 120 : 99],
    amber: a ? { phase: 'rope-search', dumpDigs: 2, dumpSpent: 20, activations: [],
      transitions: [], activationDepth: 10 } : undefined };
}
const portfolioSearch = driveBatches(createSpelunkAmberSearch(amberInput, amberBase,
  { ...amberOptions, minRopePct: 0 }), portfolioRequests, portfolioMeasure);
assert.equal(portfolioSearch.winner.config.amber.ropeReservePct, 75,
  'identical initial leaders cannot crowd out a distinct initially lower-scoring challenger');
assert.equal(portfolioSearch.winner.score, 120, 'additional discovery seeds overcome an unlucky initial sample');
assert.ok(portfolioRequests.some(r => !r.phase.startsWith('Fresh-seed') && r.seed !== firstTrainingSeed),
  'promising behavior families receive additional shared training trials before selection');
assert.ok(portfolioSearch.rows.some(r => r.matchingStrategies > 0));
assert.ok(portfolioSearch.rows.length < portfolioSearch.amberSearch.finalistStrategies,
  'settings with identical captured outcomes share a row instead of suggesting false variety');
assert.ok(portfolioSearch.rows.includes(portfolioSearch.baseline));
const shortcutRequests = [];
const shortcutSearch = driveBatches(createSpelunkAmberSearch(amberInput, amberBase,
  { ...amberOptions, from: 1, to: null, minRopePct: 0 }), shortcutRequests,
  r => ({ ...portfolioMeasure(r), startDepth: 330, depth: 350 }));
assert.equal(shortcutSearch.amberSearch.effectiveFrom, 330);
assert.deepEqual(shortcutSearch.amberSearch.depths, [330, 335, 340, 345, 350]);
assert.ok(shortcutRequests.every(r => !r.config.amber || r.config.amber.dumpDepth >= 330),
  'shortcut entry no longer wastes most depth choices on behaviorally identical pre-entry thresholds');
const finalSeedIndices = new Map(Array.from({ length: 16 }, (_, i) =>
  [((33 >>> 0) + Math.imul(i + 1, 0x9e3779b9) + 0x4f1bbcdc) >>> 0, i]));
const rareRopeRequests = [];
function rareRopeMeasure(request) {
  const result = portfolioMeasure(request), rope = finalSeedIndices.get(request.seed) === 10;
  return { ...result, status: rope ? 'rope' : 'exhausted', exit: { type: rope ? 'rope' : 'toll' } };
}
const rareOptions = { ...amberOptions, minRopePct: 5, maxTrials: 16 };
const rareRopeSearch = driveBatches(createSpelunkAmberSearch(amberInput, amberBase, rareOptions),
  rareRopeRequests, rareRopeMeasure);
assert.equal(rareRopeSearch.amberSearch.initialTrials, 2);
assert.equal(rareRopeSearch.amberSearch.trials, 16, 'uncertain rope rates extend shared fresh-seed prefixes to the declared cap');
assert.ok(rareRopeSearch.amberSearch.adaptiveRounds > 0);
assert.ok(rareRopeSearch.winner && rareRopeSearch.winner.rope === 1,
  'zero ropes in the initial sample need not prematurely eliminate all strategies');
assert.ok(rareRopeSearch.amberSearch.riskUncertain, 'a rare observed rope does not become a guaranteed safety claim');
assert.ok(rareRopeSearch.rows.every(r => r.total === 16));
assert.equal(new Set(rareRopeRequests.map(r => `${JSON.stringify(r.config)}:${r.seed}`)).size, rareRopeRequests.length);
assert.deepEqual(driveBatches(createSpelunkAmberSearch(amberInput, amberBase, { ...rareOptions, batchSize: 4 }),
  [], rareRopeMeasure), rareRopeSearch, 'adaptive extension restores original seed order in batched execution');
const capturedAmber = normalizeSpelunkConfig(amberInput, { ...amberBase, policy: 'amber-farm', fullClear: false,
  amber: { dumpDepth: 7, finishers: 2, reservePct: 75, harvestDepths: 2, ropeReservePct: 10 } });
assert.equal(capturedAmber.fullClear, true);
assert.deepEqual(normalizeSpelunkConfig(amberInput, JSON.parse(JSON.stringify(capturedAmber))), capturedAmber);
const frozenAmberScope = { enabled: Object.fromEntries(
  ['party', 'modes', 'clears', 'speeds', 'elixirs', 'memorized', 'tools', 'entry'].map(key => [key, false])) };
assert.equal(spelunkSearchSpace(amberInput, capturedAmber, frozenAmberScope).configurations, 1);
const frozenAmberSearch = createSpelunkSearch(amberInput, capturedAmber, { scope: frozenAmberScope, screening: 1, trials: 2 });
assert.deepEqual(frozenAmberSearch.next().value.config, capturedAmber,
  'ordinary searches with frozen Play/Descend preserve the exact phased policy and settings');
frozenAmberSearch.return();
assert.equal(normalizeSpelunkConfig(amberInput, { ...capturedAmber, policy: 'dive' }).amber, undefined);
for (const amber of [{ dumpDepth: 0 }, { finishers: 3 }, { reservePct: 0 }, { harvestDepths: -1 }, { ropeReservePct: 0 }])
  assert.throws(() => normalizeSpelunkConfig(amberInput, { ...capturedAmber, amber }), /Invalid Amber/);
const actualAmber = simulateSpelunkExpedition(amberInput, capturedAmber, { seed: 934 });
const actualAmberReplay = simulateSpelunkExpedition(amberInput, capturedAmber, { seed: 934, replay: true });
assert.deepEqual({ ...actualAmberReplay, frames: [], replayEvents: [] }, actualAmber,
  'Amber phase recording cannot change actions, settlement or the RNG stream');
assert.ok(actualAmber.amber.activations.length > 0);
assert.ok(actualAmberReplay.frames.some(frame => frame.amberPhase === 'dump' || frame.amberPhase === 'buildup'));
assert.deepEqual({ amberInput, amberBase }, amberBefore, 'phase optimization never changes imported inputs or the baseline');
const ropeAmberInput = structuredClone(amberInput);
ropeAmberInput.characters = [60, 300].map((max, id) => ({ id, name: `Finisher ${id}`, max, stamina: max }));
ropeAmberInput.bosses = [1, 1]; ropeAmberInput.shop[22] = 25;
const generatedAmberRope = simulateSpelunkExpedition(ropeAmberInput, { ...amberBase, party: [0, 1],
  policy: 'amber-farm', amber: { dumpDepth: 1, reservePct: 100, harvestDepths: 0 } }, { seed: 1, replay: true });
assert.equal(generatedAmberRope.status, 'rope', 'the real generator and decision loop can complete the phased rope strategy');
assert.ok(generatedAmberRope.amber.activations.length > 0);
assert.ok(generatedAmberRope.stamina.some(c => c.end > 0));
assert.ok(!generatedAmberRope.events.some(e => e.type === 'dig' && e.depth === generatedAmberRope.depth),
  'the exit is chosen before the first dig removes the floor rope');
assert.equal(generatedAmberRope.rewards[0], generatedAmberRope.grossRewards[0] * 1.25);
assert.deepEqual(generatedAmberRope.rewards.slice(1), generatedAmberRope.grossRewards.slice(1));
const caveInput = { ...input, memorySlots: 1, shortcut: true,
  caves: [3, 1, 2, 5, 1].map((capacity, id) => ({ ...input.caves[0], id, name: `Cave ${id}`, capacity })),
  depths: [99, 9, 29, 39], manicDepths: [0, 20, 30, 40] };
const caveConfig = { ...config, party: [2, 0, 1], policy: 'auto', speed: 4, fullClear: true,
  memorized: [7], entry: 'shortcut', stamina: 'full', reactionMs: 480, tool: 1 };
const caveBefore = structuredClone({ caveInput, caveConfig });
const caveDepths = [[99, 103], [14, 10], [31, 31], [40, 40], [200, 200]];
function caveMeasurement() {
  const counts = Array(5).fill(0);
  return request => ({ ...normal, seed: request.seed, depth: caveDepths[request.config.cave][counts[request.config.cave]++] });
}
const caveRequests = [];
const cavesCompared = driveBatches(createSpelunkCaveComparison(caveInput, caveConfig, { trials: 2, seed: 33 }),
  caveRequests, caveMeasurement());
assert.deepEqual(cavesCompared.rows.map(row => row.config.cave), [1, 0, 2, 3, 4],
  'rank by positive record gains, not absolute reached depth; unknown records come last');
assert.equal(cavesCompared.winner.newDepths, 2);
const caveZero = cavesCompared.rows.find(row => row.config.cave === 0);
assert.equal(caveZero.recordDepth, 100, 'native saved counter is one below the in-run floor label');
assert.equal(caveZero.newDepths, 1.5, 'clamp negative gains per trial before averaging');
assert.equal(caveZero.newDepthsSe, 1.5);
assert.equal(caveZero.recordBeaten, 1);
assert.deepEqual(caveZero.runs.map(run => run.newDepths), [0, 3]);
for (const row of cavesCompared.rows) {
  const capacity = caveInput.caves[row.config.cave].capacity;
  assert.deepEqual(row.config.party, caveConfig.party.slice(0, capacity), 'keep the first ordered members that fit');
  assert.deepEqual(row.excluded, caveConfig.party.slice(capacity), 'report only excess members, never fill a larger cave');
  assert.deepEqual({ ...row.config, cave: 0, party: caveConfig.party }, normalizeSpelunkConfig(caveInput, caveConfig),
    'every setting other than cave and capacity-limited party remains unchanged');
}
assert.equal(cavesCompared.rows[3].newDepths, 0, 'matching the old floor is not a new depth');
assert.equal(cavesCompared.rows[4].newDepths, null, 'missing records must not become verified zero');
assert.equal(cavesCompared.rows[4].recordBeaten, null);
assert.equal(caveRequests.length, 10, 'measure one fixed configuration per cave, with no extra party search');
assert.ok(caveRequests.slice(0, 5).every(request => request.seed === caveRequests[0].seed));
assert.ok(caveRequests.slice(5).every(request => request.seed === caveRequests[5].seed));
assert.notEqual(caveRequests[0].seed, caveRequests[5].seed);
assert.deepEqual(driveBatches(createSpelunkCaveComparison(caveInput, caveConfig,
  { trials: 2, seed: 33, batchSize: 4 }), [], caveMeasurement()), cavesCompared);
const manicCompared = driveBatches(createSpelunkCaveComparison(caveInput, { ...caveConfig, manic: true },
  { trials: 2 }), [], caveMeasurement());
assert.equal(manicCompared.winner.config.cave, 0, 'Manic ranks against its own cave records');
assert.equal(manicCompared.rows.find(row => row.config.cave === 1).recordDepth, 21);
const noNewDepths = driveBatches(createSpelunkCaveComparison(caveInput, caveConfig, { trials: 1 }), [],
  request => ({ ...normal, seed: request.seed, depth: 1 }));
assert.equal(noNewDepths.winner, null);
assert.ok(noNewDepths.rows.every(row => row.newDepthsSe == null), 'one trial has no gain uncertainty estimate');
assert.deepEqual({ caveInput, caveConfig }, caveBefore);
assert.throws(() => createSpelunkCaveComparison(caveInput, caveConfig, { trials: 0 }).next(), /Invalid/);
const actualCaves = driveBatches(createSpelunkCaveComparison(input, config, { trials: 1 }), [],
  request => simulateSpelunkExpedition(input, request.config, { seed: request.seed }));
for (const row of actualCaves.rows)
  assert.equal(row.newDepths, Math.max(0, row.runs[0].depth - 1 - input.depths[row.config.cave]),
    'actual expedition floors compare against native zero-based records');
const pooledRequests = [];
assert.deepEqual(driveBatches(createSpelunkSearch(input, basic, { ...options, batchSize: 4 }), pooledRequests), broad,
  'batching cannot change candidate decisions, aggregate arithmetic or winner');
assert.deepEqual(pooledRequests, broadRequests, 'parallel requests retain sequential config/seed order');
const pooledComparison = driveBatches(createSpelunkComparison(input, [
  { label: 'Normal', config: { ...basic, ...legacyLimits } }, { label: 'Manic', config: { ...basic, manic: true } },
], { trials: 2, seed: 12, objective: 'amber', batchSize: 4 }), []);
assert.deepEqual(pooledComparison, comparison, 'comparison batches restore original trial order');

const wallRequests = [];
const wallComparison = driveBatches(createSpelunkComparison(wallInput, [{ config: wallConfig }],
  { trials: 3, seed: 12, batchSize: 4 }), wallRequests,
  request => simulateSpelunkExpedition(wallInput, request.config, { seed: request.seed }));
const wallRow = wallComparison.rows[0];
assert.deepEqual(wallRow.diagnostics.resistStall, { count: 3, total: 3 });
assert.deepEqual(wallRow.diagnostics.blocked, { count: 0, total: 3 });
assert.ok(wallRow.diagnostics.members.every(c => c.noFurtherFloor === 3 && c.resistStall === 3));
assert.equal(wallRow.partyAnalysis.recommendedSize, 1, 'shorter parties are actually measured against a resist wall');
assert.equal(wallRow.partyAnalysis.rows[1].marginal.extraDepth, 0);
assert.deepEqual(wallRow.partyAnalysis.rows[1].marginal.interval, [0, 0]);
assert.equal(wallRequests.length, 6, 'existing full-party measurements are reused rather than rerun');
assert.deepEqual(wallRequests.slice(3).map(r => r.seed), wallRequests.slice(0, 3).map(r => r.seed));
assert.ok(wallRequests.slice(3).every(r => r.config.party.join() === '2'
  && r.config.tool === wallRow.config.tool && r.config.policy === wallRow.config.policy
  && JSON.stringify(r.config.elixirs) === JSON.stringify(wallRow.config.elixirs)));
const knownPrefixRequests = [];
driveBatches(createSpelunkComparison(wallInput, [{ config: { ...wallConfig, party: [2] } }, { config: wallConfig }],
  { trials: 3, seed: 12 }), knownPrefixRequests,
  request => simulateSpelunkExpedition(wallInput, request.config, { seed: request.seed }));
assert.equal(knownPrefixRequests.length, 6, 'matching existing rows supply prefixes on identical trial seeds');
function measuredPartyAdvice(objective, small, full) {
  const config = normalizeSpelunkConfig(input, wallConfig);
  const runs = [11, 12].map(seed => ({ ...wall, seed, ...full }));
  return driveBatches(createSpelunkPartyAnalysis(input, [{ config, runs }], { objective }), [],
    request => ({ ...wall, ...small, seed: request.seed, stamina: wall.stamina.slice(0, 1) }))[0];
}
assert.equal(measuredPartyAdvice('amber', { rewards: [10] }, { rewards: [100] }).recommendedSize, 2,
  'no extra floor does not make additional collected loot worthless');
assert.equal(measuredPartyAdvice('amber', { rewards: [99.5] }, { rewards: [100] }).recommendedSize, 1,
  'the explicitly labeled one-percent allowance can recommend a smaller sampled party');
assert.equal(measuredPartyAdvice('amber', { rewards: [98] }, { rewards: [100] }).recommendedSize, 2);
assert.equal(measuredPartyAdvice('depth', { startDepth: 500, depth: 505 },
  { startDepth: 500, depth: 506 }).recommendedSize, 2,
  'a deep shortcut cannot disguise a substantial loss of gained floors');
const absent = measuredPartyAdvice('depth', { diagnostics: undefined }, { diagnostics: undefined });
assert.ok(absent.rows.every(r => r.diagnostics === null), 'missing diagnostics are unavailable, never invented zeros');
const oneTrial = driveBatches(createSpelunkPartyAnalysis(input, [{
  config: normalizeSpelunkConfig(input, wallConfig), runs: [wall],
}]), [], request => simulateSpelunkExpedition(input, request.config, { seed: request.seed }))[0];
assert.equal(oneTrial.rows[1].marginal.interval, null, 'one replay cannot supply a probability uncertainty interval');
assert.throws(() => createSpelunkPartyAnalysis(input, [{ config: wallConfig, runs: [wall, wall] }]).next(),
  /distinct paired trial seeds/);

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
assert.ok(scopedRequests.filter(r => r.phase !== 'Measuring shorter parties on paired seeds')
  .every(r => JSON.stringify(r.config) === JSON.stringify(normalizedBase) || inScope(r.config)),
  'all generated and refined candidates obey every selected restriction; shorter diagnostic prefixes cannot win');
assert.ok(scoped.winner.partyAnalysis.rows.filter(row => row.config.party.length < 2).every(row => !row.allowed));
assert.ok(scoped.winner.partyAnalysis.recommendedSize >= 2, 'party advice respects the captured minimum');
assert.deepEqual([...new Set(scopedRequests.filter(r => inScope(r.config)).map(r => r.config.speed))].sort(), [0, 1, 4]);
assert.deepEqual([...new Set(scopedRequests.filter(r => inScope(r.config)).map(r => r.config.party.length))].sort(), [2, 3]);
assert.deepEqual(scoped.searchScope, { ...scopedOptions.scope, characters: [0, 1, 2], ignoreOrder: false },
  'results capture exact allowed choices, including the default full character pool and ordered search');
const scopedPooledRequests = [];
assert.deepEqual(driveBatches(createSpelunkSearch(scopeInput, normalizedBase, { ...scopedOptions, batchSize: 4 }),
  scopedPooledRequests, measureScope), scoped);
assert.deepEqual(scopedPooledRequests, scopedRequests);
const fixedSections = Object.fromEntries(['party', 'modes', 'clears', 'speeds', 'elixirs', 'memorized', 'tools', 'entry']
  .map(key => [key, false]));
const latePrefix = driveBatches(createSpelunkSearch(input, wallConfig, {
  screening: 1, trials: 2, scope: { partyMin: 1, partyMax: 2, enabled: { ...fixedSections, party: true } },
}), [], request => ({ ...normal, seed: request.seed,
  depth: request.phase.startsWith('Screening')
    ? request.config.party.length === 2 ? 10 : 1
    : request.config.party.length === 1 ? 100 : 10 }));
assert.equal(latePrefix.winner.label, 'Measured shorter party',
  'an eligible paired prefix that beats the original finalists must compete on the real objective');
assert.equal(latePrefix.winner.config.party.length, 1);
assert.equal(latePrefix.winner.score, 100);
const fixedParty = driveBatches(createSpelunkSearch(input, wallConfig, {
  screening: 1, trials: 2, scope: { enabled: fixedSections },
}), [], request => ({ ...normal, seed: request.seed, depth: request.config.party.length === 1 ? 100 : 10 }));
assert.equal(fixedParty.winner.config.party.length, 2, 'diagnostic prefixes never override a frozen party');
assert.equal(fixedParty.winner.partyAnalysis.recommendedSize, 2);
const fixedBase = normalizeSpelunkConfig(scopeInput, { ...basic, policy: 'auto', speed: 4,
  elixirs: [2, -1], memorized: [4], entry: 'shortcut' });
const fixedMeasure = request => ({ ...normal, seed: request.seed, depth: request.config.party.length });
const fixedScope = { ...scopedOptions.scope, partyMin: 1, partyMax: 2, enabled: fixedSections };
const fixedRequests = [];
const fixedSearch = driveBatches(createSpelunkSearch(scopeInput, fixedBase, { ...options, scope: fixedScope }),
  fixedRequests, fixedMeasure);
assert.equal(fixedSearch.configurations, 1, 'all sections off measures the exact current setup once');
assert.equal(fixedSearch.baseline.referenceOnly, false, 'a fixed underfilled belt remains eligible');
assert.ok(fixedRequests.every(r => JSON.stringify(r.config) === JSON.stringify(fixedBase)));
for (const key of Object.keys(fixedSections)) {
  const enabled = { ...fixedSections, [key]: true };
  const scope = { ...fixedScope, enabled };
  const records = [];
  const result = driveBatches(createSpelunkSearch(scopeInput, fixedBase, { ...options, scope }), records, fixedMeasure);
  const training = records.filter(r => r.progress < .75);
  const candidates = training.filter(r => key !== 'elixirs' || JSON.stringify(r.config) !== JSON.stringify(fixedBase));
  assert.equal(result.configurations, spelunkSearchSpace(scopeInput, fixedBase, scope).configurations, key);
  assert.equal(training.length, Number(result.configurations) + (result.baseline.referenceOnly ? 1 : 0), key);
  assert.equal(new Set(training.map(r => JSON.stringify(r.config))).size, training.length, key);
  for (const { config } of candidates) {
    if (key !== 'party') assert.deepEqual(config.party, fixedBase.party, key);
    if (!['modes', 'clears'].includes(key)) assert.equal(config.policy, fixedBase.policy, key);
    if (key !== 'clears') assert.equal(config.fullClear, fixedBase.fullClear, key);
    if (key !== 'speeds') assert.equal(config.speed, fixedBase.speed, key);
    if (key !== 'elixirs') assert.deepEqual(config.elixirs, fixedBase.elixirs, key);
    if (key !== 'memorized') assert.deepEqual(config.memorized, fixedBase.memorized, key);
    if (key !== 'tools') assert.equal(config.tool, fixedBase.tool, key);
    if (key !== 'entry') assert.equal(config.entry, fixedBase.entry, key);
  }
  if (key === 'party') {
    assert.equal(result.configurations, 9, 'party-only search tests three singles and six ordered pairs');
    assert.deepEqual([...new Set(candidates.map(r => r.config.party.length))].sort(), [1, 2]);
    assert.equal(result.winner.config.party.length, 2);
  }
}
for (const policy of ['dive', 'efficient', 'clear-fifth', 'clear']) for (const modes of [false, true]) for (const clears of [false, true]) {
  const base = { ...fixedBase, policy };
  const scope = { ...fixedScope, modes: ['auto', 'manual'], clears: [false, true, 'fifth'],
    enabled: { ...fixedSections, modes, clears, tools: true } };
  const records = [];
  const result = driveBatches(createSpelunkSearch(scopeInput, base, { ...options, scope }), records, fixedMeasure);
  assert.equal(result.configurations, spelunkSearchSpace(scopeInput, base, scope).configurations);
  assert.equal(records.filter(r => r.progress < .75).length, result.configurations);
  if (!modes && !clears) assert.ok(records.every(r => r.config.policy === policy));
}
const fifthBase = { ...fixedBase, policy: 'clear-fifth' };
const fifthScope = { enabled: { ...fixedSections, clears: true }, clears: ['fifth'] };
assert.equal(spelunkSearchSpace(scopeInput, fifthBase, fifthScope).configurations, 1);
const fifthRequests = [];
const fifthSearch = driveBatches(createSpelunkSearch(scopeInput, fifthBase, { ...options, scope: fifthScope }),
  fifthRequests, fixedMeasure);
assert.ok(fifthRequests.every(r => r.config.policy === 'clear-fifth'));
assert.equal(fifthSearch.winner.config.policy, 'clear-fifth');
const mixedFifthScope = { ...fifthScope, modes: ['auto', 'manual'],
  enabled: { ...fifthScope.enabled, modes: true } };
const mixedFifth = driveBatches(createSpelunkSearch(scopeInput, fixedBase, { ...options, scope: mixedFifthScope }),
  [], fixedMeasure);
assert.equal(mixedFifth.configurations, 1, 'a fifth-only mixed-mode scope enumerates manual play only');
assert.equal(mixedFifth.winner.config.policy, 'clear-fifth', 'an excluded Auto baseline cannot win');
assert.equal(spelunkSearchSpace(scopeInput, fixedBase, {
  enabled: { ...fixedSections, clears: true }, clears: [false, true, 'fifth'],
}).configurations, 2, 'the manual-only choice never creates a third Auto full-clear value');
assert.throws(() => spelunkSearchSpace(scopeInput, fixedBase, fifthScope), /requires manual play/);
const fixedReference = driveBatches(createSpelunkSearch(scopeInput, fixedBase, {
  ...options, scope: fixedScope, configurations: [{ label: 'Different belt', config: { ...fixedBase, elixirs: [0, 2] } }],
}), [], request => ({ ...normal, seed: request.seed, depth: request.config.elixirs[0] === 0 ? 1000 : 1 }));
assert.ok(fixedReference.rows.find(row => row.label === 'Different belt').referenceOnly);
assert.deepEqual(fixedReference.winner.config, fixedBase, 'a submitted setup cannot change a disabled section');
assert.equal(spelunkSearchSpace(scopeInput, fixedBase, {
  enabled: fixedSections, partyMin: -1, modes: [], clears: [], speeds: [], elixirs: [999], memorized: [-1],
}).configurations, 1, 'disabled choices are ignored rather than validated as active search restrictions');
assert.throws(() => spelunkSearchSpace(scopeInput, fixedBase, { enabled: { party: 'false' } }), /Invalid search section/);
const partyScope = { partyMin: 1, partyMax: 2, characters: [2, 0],
  enabled: { ...fixedSections, party: true } };
const partyBase = { ...fixedBase, party: [2, 0] };
assert.equal(spelunkSearchSpace(scopeInput, partyBase, partyScope).configurations, 4,
  'a two-character pool has two singles and two ordered pairs');
const orderedPoolRequests = [];
driveBatches(createSpelunkSearch(scopeInput, partyBase, { ...options, scope: partyScope }),
  orderedPoolRequests, fixedMeasure);
assert.deepEqual(orderedPoolRequests.filter(r => r.progress < .75).map(r => r.config.party),
  [[2, 0], [0], [0, 2], [2]], 'ordered mode tests only the selected characters, including both entry orders');
const groupScope = { ...partyScope, characters: [2, 0, 2], ignoreOrder: true };
const groupScopeBefore = structuredClone(groupScope);
assert.deepEqual(spelunkSearchSpace(scopeInput, partyBase, groupScope).scope.characters, [0, 2]);
assert.equal(spelunkSearchSpace(scopeInput, partyBase, groupScope).configurations, 3,
  'combination search tests each selected group once');
const groupRequests = [];
const groupOptions = { ...options, scope: groupScope,
  configurations: [{ label: 'Excluded character', config: { ...partyBase, party: [1] } }] };
const groupMeasure = request => ({ ...normal, seed: request.seed,
  depth: request.config.party.includes(1) || request.config.party.join() === '2,0' ? 1000 : request.config.party.length });
const grouped = driveBatches(createSpelunkSearch(scopeInput, partyBase, groupOptions), groupRequests, groupMeasure);
assert.deepEqual(groupScope, groupScopeBefore, 'normalizing a pool never mutates the caller selections');
assert.deepEqual(grouped.winner.config.party, [0, 2]);
assert.ok(grouped.baseline.referenceOnly, 'an unsearched baseline order is diagnostic only');
assert.ok(grouped.rows.find(row => row.label === 'Excluded character').referenceOnly);
assert.ok(grouped.rows.filter(row => !row.referenceOnly).every(row => row.config.party.every(id => [0, 2].includes(id))
  && row.config.party.every((id, i, ids) => !i || ids[i - 1] < id)),
  'neither references nor their measured prefixes can bypass character and canonical-order restrictions');
assert.deepEqual(groupRequests.filter(r => r.progress < .75 && groupMeasure(r).depth !== 1000)
  .map(r => r.config.party), [[0], [0, 2], [2]]);
assert.equal(grouped.screened, 5, 'three groups plus the reversed baseline and excluded reference');
assert.deepEqual(driveBatches(createSpelunkSearch(scopeInput, partyBase, { ...groupOptions, batchSize: 4 }),
  [], groupMeasure), grouped, 'selected-pool combinations retain ordered-batch parity');
assert.deepEqual(spelunkSearchSpace(scopeInput, partyBase, { ...groupScope,
  enabled: fixedSections }).scope.characters, [2, 0], 'a disabled party section preserves the captured party');
assert.equal(spelunkSearchSpace(scopeInput, partyBase, { ...groupScope,
  characters: [], ignoreOrder: 'invalid but inactive', enabled: fixedSections }).configurations, 1);
for (const characters of [[], [99], ['0'], '0,2']) {
  assert.throws(() => spelunkSearchSpace(scopeInput, fixedBase, { ...partyScope, characters }), /Invalid search characters|Not enough/);
}
assert.throws(() => spelunkSearchSpace(scopeInput, fixedBase, { ...partyScope, characters: [0], partyMin: 2 }), /Not enough/);
assert.throws(() => spelunkSearchSpace(scopeInput, fixedBase, { ...partyScope, ignoreOrder: 'true' }), /Invalid party order/);
const tiredPool = { ...scopeInput, characters: scopeInput.characters.map(c => c.id === 2 ? { ...c, stamina: 0 } : c) };
assert.throws(() => spelunkSearchSpace(tiredPool, { ...fixedBase, party: [0] }, { ...partyScope, characters: [2] }), /Not enough/);
assert.equal(spelunkSearchSpace(tiredPool, { ...fixedBase, party: [0], stamina: 'full' },
  { ...partyScope, characters: [2] }).configurations, 1, 'full-stamina assumptions restore selected tired characters');
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
const presetInput = { ...fixture(), memorySlots: 3, dupes: 3 };
let presetFocus;
const presetOriginal = structuredClone(presetInput), presetHost = {
  innerHTML: '', querySelector(selector) { return { focus() { presetFocus = selector; } }; },
};
let presetEquipped = [7, -1, 0, -1, 2], presetMemorized = [9], presetChanges = 0;
const presetContext = {
  input: presetInput, $: () => presetHost, esc: String, art: name => `<img src="${name}.png">`,
  document: { querySelectorAll: selector => (selector === '[data-elixir]' ? presetEquipped : presetMemorized)
    .map(value => ({ value: String(value) })) },
  renderElixirs(equipped, memorized) { presetEquipped = Array.from(equipped); presetMemorized = Array.from(memorized); },
  invalidate() { presetChanges++; }, error() {},
};
vm.createContext(presetContext);
vm.runInContext(ui.slice(ui.indexOf('const elixirNames ='), ui.indexOf('const policyNames ='))
  + ui.slice(ui.indexOf('function elixirPresetIssues('), ui.indexOf('function syncElixirOptions('))
  + '\nrenderElixirPresets();', presetContext);
assert.equal(presetChanges, 0, 'previewing built-ins never applies them');
assert.equal((presetHost.innerHTML.match(/data-elixir-preset=/g) || []).length, 6);
assert.ok(!presetHost.innerHTML.includes(' disabled'));
vm.runInContext('applyElixirPreset("memorized");', presetContext);
assert.deepEqual(presetMemorized, [0, 2, 7], 'pictured memories use refund, shield and Shadow Strikes');
assert.deepEqual(presetEquipped, [7, -1, 0, -1, 2], 'applying memories preserves the exact belt including holes');
const picturedBelts = {
  depth: [0, 2, 7, 7, 10], 'depth-shortcut': [2, 7, 7, 7, 10],
  manic: [0, 2, 7, 7, 7], amber: [3, 3, 3, 6, 6], grand: [2, 7, 7, 7, 9],
};
for (const [id, belt] of Object.entries(picturedBelts)) {
  vm.runInContext(`applyElixirPreset("${id}");`, presetContext);
  assert.deepEqual(presetEquipped, belt, `${id} preserves the pictured physical slot order`);
  assert.deepEqual(presetMemorized, [0, 2, 7], 'belt presets do not replace memories');
  const applied = normalizeSpelunkConfig(presetInput, {
    party: [2, 0], elixirs: presetEquipped, memorized: presetMemorized, manic: false, entry: 'surface',
  });
  assert.deepEqual(applied.elixirs, belt, 'pictured belts feed the existing simulator/compare/search configuration');
  assert.deepEqual(applied.party, [2, 0]);
  assert.equal(applied.manic, false, 'the Manic belt name must not silently change expedition mode');
  assert.equal(presetFocus, `[data-elixir-preset="${id}"]`, 'Apply restores keyboard focus after replacing the belt');
}
assert.equal(presetChanges, 6, 'every explicit application uses the existing persistence/invalidation flow');
assert.deepEqual(presetInput, presetOriginal, 'presets never edit save-derived input or unlocks');
presetInput.dupes = 2;
const equippedBeforeRejection = [...presetEquipped];
assert.throws(() => vm.runInContext('applyElixirPreset("amber");', presetContext), /3 copies of Amber boost.*limit 2/);
assert.deepEqual(presetEquipped, equippedBeforeRejection, 'unavailable presets are rejected without partial application');
assert.equal(presetChanges, 6);
vm.runInContext('renderElixirPresets();', presetContext);
assert.match(presetHost.innerHTML, /data-elixir-preset="amber"[^>]*disabled/);
assert.match(presetHost.innerHTML, /Requires 3 copies of Amber boost/);
presetInput.dupes = 3; presetInput.slots = 4;
assert.throws(() => vm.runInContext('applyElixirPreset("depth");', presetContext), /5 belt slots; 4 unlocked/);
presetInput.slots = 5; presetInput.memorySlots = 2;
assert.throws(() => vm.runInContext('applyElixirPreset("memorized");', presetContext), /3 memorization slots; 2 unlocked/);
presetInput.memorySlots = 3; presetInput.elixirOwned = 10;
assert.throws(() => vm.runInContext('applyElixirPreset("depth");', presetContext), /Overdrive is locked/);
vm.runInContext('applyElixirPreset("manic");', presetContext);
assert.deepEqual(presetEquipped, picturedBelts.manic, 'presets need only the elixirs they actually contain');
assert.throws(() => vm.runInContext('applyElixirPreset("unknown");', presetContext), /Unknown elixir preset/);
presetContext.input = null;
assert.throws(() => vm.runInContext('applyElixirPreset("depth");', presetContext), /Load a valid save/);
vm.runInContext('renderElixirPresets();', presetContext);
assert.equal((presetHost.innerHTML.match(/ disabled/g) || []).length, 6);
const presetHtml = fs.readFileSync(new URL('../../spelunking-calc.html', import.meta.url), 'utf8');
assert.match(presetHtml, /Built-in elixir presets/);
assert.match(presetHtml, /value="clear-fifth">Manual clear every 5 depths/);
assert.match(presetHtml, /Party, expedition mode, entry and strategy stay unchanged/);
assert.match(ui, /if \(b.dataset.elixirPreset != null\) applyElixirPreset\(b.dataset.elixirPreset\)/,
  'preset buttons route through the guarded explicit-apply handler');
const scopeHost = { innerHTML: '' }, scopeWorkload = { textContent: '', dataset: {} };
const scopeRows = {}, scopeToggles = Object.keys(fixedSections).map(key => {
  const row = { dataset: {}, querySelector: () => row.fieldset, fieldset: { disabled: false } };
  scopeRows[key] = row;
  return { dataset: { scopeSection: key }, checked: key === 'party', closest: () => row };
});
let chosenCharacters = [{ value: '2' }, { value: '0' }], chosenClears = [{ value: 'fifth' }];
const orderControl = { checked: true };
const scopeContext = {
  input: scopeInput, searchSettings: { ...fixedScope, enabled: { ...fixedSections, party: true } },
  $: id => id === 'search-scope' ? scopeHost : id === 'search-workload' ? scopeWorkload
    : id === 'search-ignore-order' ? orderControl
      : { value: id === 'search-party-min' || id === 'screen-trials' ? '1' : id === 'search-party-max' ? '2' : '0' },
  document: { querySelectorAll: selector => selector === '[data-scope-section]' ? scopeToggles
    : selector === '[data-scope="characters"]:checked' ? chosenCharacters
      : selector === '[data-scope="clears"]:checked' ? chosenClears : [] },
  esc: String, art: String, updateSearchWorkload() {}, syncOptimizerMode() {},
};
vm.createContext(scopeContext);
vm.runInContext(ui.slice(ui.indexOf('const elixirNames ='), ui.indexOf('const policyNames ='))
  + ui.slice(ui.indexOf('const searchSections ='), ui.indexOf('let searchSettings ='))
  + ui.slice(ui.indexOf('function readSearchScope('), ui.indexOf('function updateSearchWorkload('))
  + '\nrenderSearchScope(); globalThis.capturedScope = readSearchScope();', scopeContext);
assert.equal((scopeHost.innerHTML.match(/data-scope-section=/g) || []).length, 8);
assert.equal((scopeHost.innerHTML.match(/<fieldset/g) || []).length, 8);
assert.equal(scopeRows.party.fieldset.disabled, false);
assert.ok(Object.entries(scopeRows).filter(([key]) => key !== 'party').every(([, row]) => row.fieldset.disabled));
assert.deepEqual(JSON.parse(JSON.stringify(scopeContext.capturedScope.enabled)), { ...fixedSections, party: true });
assert.deepEqual(Array.from(scopeContext.capturedScope.characters), [2, 0]);
assert.equal(scopeContext.capturedScope.ignoreOrder, true);
assert.deepEqual(Array.from(scopeContext.capturedScope.clears), ['fifth'],
  'the descent control preserves the third choice instead of coercing it to first-exit');
assert.match(scopeHost.innerHTML, /data-scope="clears" value="fifth"/);
assert.match(scopeHost.innerHTML, /Expedition outcomes can still depend on that order/);
assert.equal((scopeHost.innerHTML.match(/data-scope="characters"/g) || []).length, scopeInput.characters.length);
assert.equal((scopeHost.innerHTML.match(/data-scope="characters"[^>]*checked/g) || []).length, scopeInput.characters.length,
  'all characters are checked for older stored scopes without a character pool');
chosenCharacters = [];
vm.runInContext('searchSettings = JSON.parse(JSON.stringify(readSearchScope())); renderSearchScope();', scopeContext);
assert.deepEqual(Array.from(scopeContext.searchSettings.characters), [], 'an explicitly empty pool survives persistence');
assert.ok(!/data-scope="characters"[^>]*checked/.test(scopeHost.innerHTML));
assert.match(scopeHost.innerHTML, /id="search-ignore-order" type="checkbox" checked/);
scopeToggles.find(toggle => toggle.dataset.scopeSection === 'party').checked = false;
vm.runInContext('syncSearchSections();', scopeContext);
assert.equal(scopeRows.party.fieldset.disabled, true, 'the entire character and order fieldset freezes with Party size');
assert.equal(orderControl.checked, true, 'freezing the section does not lose its order preference');
scopeToggles.find(toggle => toggle.dataset.scopeSection === 'elixirs').checked = true;
vm.runInContext('syncSearchSections();', scopeContext);
assert.equal(scopeRows.elixirs.fieldset.disabled, false, 'reenabling a section unlocks its existing choices without replacing them');
assert.match(scopeHost.innerHTML, /Party size uses only checked characters/);
scopeContext.spelunkSearchSpace = spelunkSearchSpace;
scopeContext.readConfig = () => fixedBase;
scopeToggles.find(toggle => toggle.dataset.scopeSection === 'party').checked = true;
scopeToggles.find(toggle => toggle.dataset.scopeSection === 'elixirs').checked = false;
vm.runInContext(ui.slice(ui.indexOf('function updateSearchWorkload('), ui.indexOf('function renderParty('))
  + '\nupdateSearchWorkload();', scopeContext);
assert.match(scopeWorkload.textContent, /Not enough selected characters/);
assert.equal(scopeWorkload.dataset.configurations, undefined, 'an empty pool is visibly invalid, not silently reset to all');
chosenCharacters = [{ value: '2' }, { value: '0' }];
vm.runInContext('updateSearchWorkload();', scopeContext);
assert.equal(scopeWorkload.dataset.configurations, '3', 'the displayed count uses combinations for the selected pool');
orderControl.checked = false;
vm.runInContext('updateSearchWorkload();', scopeContext);
assert.equal(scopeWorkload.dataset.configurations, '4', 'reenabling permutations updates the displayed count');
scopeToggles.find(toggle => toggle.dataset.scopeSection === 'party').checked = false;
chosenCharacters = [];
vm.runInContext('updateSearchWorkload();', scopeContext);
assert.equal(scopeWorkload.dataset.configurations, '1', 'freezing Party size ignores an inactive empty pool');
const host = { innerHTML: '' };
const comparisonUi = ui.slice(ui.indexOf('const elixirNames ='), ui.indexOf('const storageKey ='))
  + ui.slice(ui.indexOf('const searchSections ='), ui.indexOf('let searchSettings ='))
  + ui.slice(ui.indexOf('function configurationText('), ui.indexOf('function renderConfigurations('))
  + ui.slice(ui.indexOf('function sampleRate('), ui.indexOf('function start('))
  + '\nrenderComparison(bundle, "result");';
vm.runInNewContext(comparisonUi, {
    bundle: { result: duplicateSearch, input: duplicateInput }, $: () => host,
    esc: String, num: String, text: String, art: String, portrait: c => `Character ${c.id}`,
  });
const cells = [...host.innerHTML.matchAll(/<td data-label="Configuration">([\s\S]*?)<\/td>/g)];
assert.equal(cells.length, duplicateSearch.rows.length);
assert.ok(cells.every(([, cell]) => cell.includes('Native Auto') && cell.includes('captured-party')
  && cell.includes('captured-belt') && cell.includes('Memory') && cell.includes('Auto tools')),
  'every comparison row visibly describes its captured strategy, party, belt, memories and tools');
assert.ok(!host.innerHTML.includes('Screened strategy'), 'internal search-origin labels are not primary configurations');
assert.match(host.innerHTML, /Resist stalls/);
assert.match(host.innerHTML, /No later descent/);
assert.match(host.innerHTML, /not proven equivalence/);
assert.match(host.innerHTML, /outside search scope; diagnostic only/);
vm.runInNewContext(comparisonUi, {
  bundle: { result: fifthSearch, input: scopeInput }, $: () => host,
  esc: String, num: String, text: String, art: String, portrait: c => `Character ${c.id}`,
});
assert.match(host.innerHTML, /Manual clear every 5 depths/, 'captured configurations show the new policy');
assert.match(host.innerHTML, /manual; every 5 depths;/,
  'captured scope details do not mislabel fifth-depth clearing as full-clearing every floor');
vm.runInNewContext(comparisonUi, {
  bundle: { result: infeasibleAmber, input: amberInput }, $: () => host,
  esc: String, num: String, text: String, art: String, portrait: c => `Character ${c.id}`,
});
assert.match(host.innerHTML, /No fresh finalist met/);
assert.match(host.innerHTML, /Rope \/ toll \/ blocked/);
assert.ok(!host.innerHTML.includes('data-use="'), 'a risk-infeasible Amber search offers no winner to apply');
vm.runInNewContext(comparisonUi, {
  bundle: { result: amberSearch, input: amberInput }, $: () => host,
  esc: String, num: String, text: String, art: String, portrait: c => `Character ${c.id}`,
});
assert.match(host.innerHTML, /Drink available oranges after the burn/);
assert.match(host.innerHTML, /manually descend through a revealed exit/);
assert.match(host.innerHTML, /Planned:/);
assert.match(host.innerHTML, /Measured \(/);
assert.ok(!host.innerHTML.includes('harvest 8 depths'), 'planned rope-search offsets are not described as measured harvest');
assert.match(host.innerHTML, /Run 1: D\d+/, 'replay buttons include actual final depth');
vm.runInNewContext(comparisonUi, {
  bundle: { result: rareRopeSearch, input: amberInput }, $: () => host,
  esc: String, num: String, text: String, art: String, portrait: c => `Character ${c.id}`,
});
assert.match(host.innerHTML, /16 fresh trials each/);
assert.match(host.innerHTML, /Sampled rope rates remain uncertain/);
assert.match(host.innerHTML, /other tested settings matched these captured outcomes; not proven equivalent/);
const amberDisplayRuns = [
  { startDepth: 330, depth: 350, status: 'rope', exit: { type: 'rope' },
    amber: { dumpDigs: 12, dumpSpent: 120, activations: [
      { depth: 349, spent: 120, effect: 120 }, { depth: 349, spent: 120, effect: 240 },
      { depth: 350, spent: 150, effect: 390 },
    ], transitions: [{ phase: 'rope-search', depth: 350, reason: 'Low finishing stamina' }] } },
  { startDepth: 330, depth: 354, status: 'exhausted', exit: { type: 'toll' },
    amber: { dumpDigs: 10, dumpSpent: 100, activations: [
      { depth: 351, spent: 100, effect: 100 }, { depth: 351, spent: 100, effect: 200 },
    ], transitions: [{ phase: 'rope-search', depth: 354, reason: 'Harvest depth target reached' }] } },
];
const amberDisplayBefore = JSON.stringify(amberDisplayRuns);
const amberDisplayContext = vm.createContext({ num: String, esc: String, runs: amberDisplayRuns,
  amberPhaseNames: { 'rope-search': 'Seek untouched rope' },
  config: { party: [0], amber: { dumpDepth: 20, finishers: 1, reservePct: 100, harvestDepths: 8, ropeReservePct: 25 } },
  captured: { characters: [{ name: 'Finisher' }] } });
vm.runInContext(ui.slice(ui.indexOf('function amberInstructions('), ui.indexOf('function renderConfigurations(')),
  amberDisplayContext);
const measuredAmber = vm.runInContext('amberOutcomeSummary(runs)', amberDisplayContext);
assert.match(measuredAmber, /Entry D330 &rarr; Finish D352/);
assert.match(measuredAmber, /\(\+22 floors overall\)/, 'total expedition advances are separate from post-orange advances');
assert.match(measuredAmber, /First orange at D350 \(2\/2 runs\)/);
assert.match(measuredAmber, /Advanced \+2 floors after first orange/,
  'actual descents use the first drink, not the configured eight-floor target or later refill drinks');
assert.match(measuredAmber, /range 1&ndash;3/);
assert.match(measuredAmber, /Orange drinks: 2.5\/run/);
assert.match(measuredAmber, /Began seeking rope at D352 \(2\/2 runs\)/);
const firstAmberDetails = vm.runInContext('amberRunDetails(runs[0])', amberDisplayContext);
assert.match(firstAmberDetails, /D350: rope exit &middot; \+1 floor after first orange at D349/);
assert.match(firstAmberDetails, /Low finishing stamina/, 'early seeking retains the measured reason');
assert.match(vm.runInContext('amberRunDetails(runs[1])', amberDisplayContext), /D354: exhaustion \/ toll/);
assert.match(vm.runInContext('amberInstructions(config, captured)', amberDisplayContext), /Try to advance 8 more floors/);
vm.runInContext('config.amber.harvestDepths = 0', amberDisplayContext);
assert.match(vm.runInContext('amberInstructions(config, captured)', amberDisplayContext),
  /immediately seek the next visible untouched rope, including on the same floor/);
const sameFloorAmber = { ...amberDisplayRuns[0], depth: 349,
  amber: { ...amberDisplayRuns[0].amber, activations: [amberDisplayRuns[0].amber.activations[0]] } };
amberDisplayContext.sameFloorAmber = sameFloorAmber;
assert.match(vm.runInContext('amberRunDetails(sameFloorAmber)', amberDisplayContext),
  /\+0 floors after first orange at D349/, 'same-floor rope exits do not invent a harvested depth');
amberDisplayContext.noOrangeRun = { startDepth: 330, depth: 340, status: 'blocked',
  amber: { activations: [], transitions: [], dumpDigs: 0, dumpSpent: 0 } };
const noOrangeSummary = vm.runInContext('amberOutcomeSummary([runs[0], noOrangeRun])', amberDisplayContext);
assert.match(noOrangeSummary, /First orange at D349 \(1\/2 runs\)/);
assert.match(noOrangeSummary, /Advanced \+1 floors after first orange/,
  'runs without orange activation are not treated as zero-depth boosted harvests');
assert.match(vm.runInContext('amberOutcomeSummary([noOrangeRun])', amberDisplayContext), /No oranges consumed/);
assert.ok(!vm.runInContext('amberOutcomeSummary([noOrangeRun])', amberDisplayContext).includes('Advanced +'));
assert.match(vm.runInContext('amberOutcomeSummary([{ depth: 340 }])', amberDisplayContext), /measurements unavailable/);
assert.match(vm.runInContext('amberRunDetails({ amber: {} })', amberDisplayContext), /timing unavailable/);
assert.equal(JSON.stringify(amberDisplayRuns), amberDisplayBefore, 'outcome rendering does not mutate captured trials');
const amberControls = Object.fromEntries(['optimizer-mode', 'amber-search', 'search-scope', 'configuration-search-help', 'objective']
  .map(id => [id, { value: id === 'optimizer-mode' ? 'amber' : 'depth' }]));
amberControls.objective.options = ['depth', 'amber', 'grand'].map(value => ({ value, disabled: false }));
vm.runInNewContext(ui.slice(ui.indexOf('function syncOptimizerMode('), ui.indexOf('function populate('))
  + '\nsyncOptimizerMode();', { $: id => amberControls[id] });
assert.equal(amberControls.objective.value, 'amber');
assert.equal(amberControls['amber-search'].hidden, false);
assert.equal(amberControls['search-scope'].hidden, true);
assert.deepEqual(amberControls.objective.options.map(o => o.disabled), [true, false, true]);
amberControls['optimizer-mode'].value = 'configuration';
vm.runInNewContext(ui.slice(ui.indexOf('function syncOptimizerMode('), ui.indexOf('function populate('))
  + '\nsyncOptimizerMode();', { $: id => amberControls[id] });
assert.equal(amberControls['search-scope'].hidden, false);
assert.ok(amberControls.objective.options.every(o => !o.disabled));
vm.runInNewContext(ui.slice(ui.indexOf('function renderCaveComparison('), ui.indexOf('function renderComparison('))
  + '\nrenderCaveComparison(bundle, "caves-result");', {
    bundle: { result: cavesCompared, input: caveInput }, $: () => host,
    esc: String, num: String, portrait: c => `Character ${c.id}`,
    layout: () => 'Captured configuration', renderContributions: () => '',
    sampleRate: (count, total) => `${count}/${total}`,
  });
assert.match(host.innerHTML, /Most new depths observed: Cave 1, \+2/);
assert.match(host.innerHTML, /Over party limit: Character 1, Character 2/);
assert.match(host.innerHTML, /Missing saved record; excluded from ranking/);
assert.equal((host.innerHTML.match(/data-use-cave=/g) || []).length, 5);
assert.equal((host.innerHTML.match(/data-replay-trial=/g) || []).length, 10);
assert.match(host.innerHTML, /data-owner="caves-result"/, 'actions and replays use their captured cave result');
const largeInput = { ...memoryInput, caves: [{ ...memoryInput.caves[0], capacity: 6 }],
  characters: Array.from({ length: 12 }, (_, id) => ({ id, name: `Character ${id + 1}`, max: 8, stamina: 8 })) };
const largeSpace = spelunkSearchSpace(largeInput, basic);
const elevenSpace = { ...largeInput, characters: largeInput.characters.slice(0, 11) };
assert.equal(spelunkSearchSpace(elevenSpace, basic, { partyMin: 1, partyMax: 5, ignoreOrder: true,
  enabled: { ...fixedSections, party: true } }).configurations, 1023,
  'eleven characters over sizes one to five reduce from 64,471 orders to 1,023 groups');
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
