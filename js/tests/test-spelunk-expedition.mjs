import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { spelunkCaves, spelunkTools, spelunkElixirs } from '../stats/data/w7/spelunking.js';
import { shopUpgBonus } from '../stats/systems/w7/spelunking.js';
import { createSpelunkExpedition, normalizeSpelunkConfig, simulateSpelunkExpedition, spelunkRockStats, spelunkActiveBuffs, spelunkRewardImage } from '../stats/systems/w7/spelunk-expedition.js';
import { createSpelunkComparison, createSpelunkSearch, createSpelunkPartyAnalysis, normalizeSpelunkSearchScope, spelunkSearchSpace, spelunkRunMetric } from '../stats/systems/w7/spelunk-planner.js';
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
for (const policy of ['dive', 'efficient', 'clear']) for (const modes of [false, true]) for (const clears of [false, true]) {
  const base = { ...fixedBase, policy };
  const scope = { ...fixedScope, modes: ['auto', 'manual'], clears: [false, true],
    enabled: { ...fixedSections, modes, clears, tools: true } };
  const records = [];
  const result = driveBatches(createSpelunkSearch(scopeInput, base, { ...options, scope }), records, fixedMeasure);
  assert.equal(result.configurations, spelunkSearchSpace(scopeInput, base, scope).configurations);
  assert.equal(records.filter(r => r.progress < .75).length, result.configurations);
  if (!modes && !clears) assert.ok(records.every(r => r.config.policy === policy));
}
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
const scopeHost = { innerHTML: '' }, scopeWorkload = { textContent: '', dataset: {} };
const scopeRows = {}, scopeToggles = Object.keys(fixedSections).map(key => {
  const row = { dataset: {}, querySelector: () => row.fieldset, fieldset: { disabled: false } };
  scopeRows[key] = row;
  return { dataset: { scopeSection: key }, checked: key === 'party', closest: () => row };
});
let chosenCharacters = [{ value: '2' }, { value: '0' }];
const orderControl = { checked: true };
const scopeContext = {
  input: scopeInput, searchSettings: { ...fixedScope, enabled: { ...fixedSections, party: true } },
  $: id => id === 'search-scope' ? scopeHost : id === 'search-workload' ? scopeWorkload
    : id === 'search-ignore-order' ? orderControl
      : { value: id === 'search-party-min' || id === 'screen-trials' ? '1' : id === 'search-party-max' ? '2' : '0' },
  document: { querySelectorAll: selector => selector === '[data-scope-section]' ? scopeToggles
    : selector === '[data-scope="characters"]:checked' ? chosenCharacters : [] },
  esc: String, art: String, updateSearchWorkload() {},
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
vm.runInNewContext(ui.slice(ui.indexOf('const elixirNames ='), ui.indexOf('const storageKey ='))
  + ui.slice(ui.indexOf('function configurationText('), ui.indexOf('function renderConfigurations('))
  + ui.slice(ui.indexOf('function sampleRate('), ui.indexOf('function start('))
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
assert.match(host.innerHTML, /Resist stalls/);
assert.match(host.innerHTML, /No later descent/);
assert.match(host.innerHTML, /not proven equivalence/);
assert.match(host.innerHTML, /outside search scope; diagnostic only/);
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
