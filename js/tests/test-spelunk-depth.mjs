import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { spelunkCaves, spelunkElixirs } from '../stats/data/w7/spelunking.js';
import { spelunkDepthProfile, spelunkRockProbabilities } from '../stats/systems/w7/spelunk-depth.js';

function fixture() {
  const rock = { name: 'Easy_rock', pow: 1, hp: 5, base: 1, scaled: false, growth: 1, depth: 0, amber: 1 };
  return {
    caves: [{ id: 0, name: 'Test cave', capacity: 2, bossDepth: 6, rocks: [
      rock, { ...rock, name: 'Hard_rock', pow: 100, hp: 2, depth: 2 },
      { ...rock, name: 'Boss', pow: 10000, hp: 1000 },
    ] }],
    tools: [{ id: 0, name: 'Hammer', cost: 1, damage: 1 }, { id: 1, name: 'Mace', cost: 2, damage: 2 }],
    elixirs: spelunkElixirs(), shop: Array(80).fill(0), pow: 100, holesBonus: 0,
    characters: [{ id: 0, name: 'A', stamina: 10, max: 20 }, { id: 1, name: 'B', stamina: 15, max: 15 }],
    savedElixirs: [], memorized: [], slots: 1, memorySlots: 5, elixirOwned: 12, dupes: 1,
    savedManic: false, manic: true, speedMax: 0, auto: true, fullClear: false, depths: [0], manicDepths: [0],
  };
}
const input = fixture(), original = structuredClone(input), config = { party: [0], policy: 'dive' };
const profile = (options = {}, requested = config, captured = input) =>
  spelunkDepthProfile(captured, requested, { from: 7, to: 7, tool: 0, ...options });
const one = profile(), row = one.rows[0];
assert.equal(one.budget, 10);
assert.equal(row.depth, 7, 'visible depth is one-based');
assert.equal(row.objects[0].expected, 5, 'five guaranteed successful hits cost five stamina');
const hard = row.objects.find(r => r.type === 1);
assert.equal(hard.hits, 2);
assert.equal(hard.hitChance, .01 ** .6);
assert.equal(hard.expected, 2 / (.01 ** .6), 'expected attempts include resists, not merely object HP');
assert.equal(hard.probability, .75);
assert.equal(row.hard, .75);
assert.equal(row.blockedExits, .75);
assert.ok(row.objects.find(r => r.boss).overBudget);
assert.equal(row.objects.find(r => r.boss).probability, 1, 'boss is present only on its native floor');
assert.ok(!profile({ from: 6, to: 6 }).rows[0].objects.some(r => r.boss));
for (const [bonus, expected] of [[50, .5 * .75 + .5 * .75 ** 2], [100, .75 ** 2],
  [150, .5 * .75 ** 2 + .5 * .75 ** 3], [200, .75 ** 3], [900, .75 ** 3]]) {
  const captured = fixture(); captured.holesBonus = bonus;
  assert.equal(profile({}, config, captured).rows[0].blockedExits, expected, 'mix native one/two/three-hole counts');
  captured.shop[18] = bonus; captured.holesBonus = 0;
  assert.equal(profile({}, config, captured).rows[0].blockedExits, expected, 'shop and bubble extra holes share the native pool');
}
let withoutReplacement = 0;
for (let mask = 0; mask < 16; mask++) {
  const count = Array.from({ length: 4 }, (_, i) => (mask >> i) & 1).reduce((a, b) => a + b);
  withoutReplacement += .75 ** count * .25 ** (4 - count) * count * (count - 1) / 12;
}
assert.ok(Math.abs(withoutReplacement - .75 ** 2) < 1e-14,
  'averaging distinct-hole sampling over independent generated rock types gives q^H, not the any-bad-hole probability');
assert.equal(profile({}, { ...config, party: [0, 1] }).budget, 25);
assert.equal(profile({}, { ...config, stamina: 'full' }).budget, 20);
const equal = fixture(); equal.characters[0] = { ...equal.characters[0], stamina: 5, max: 10 };
assert.equal(profile({}, config, equal).rows[0].objects[0].overBudget, false, 'equal cost is not above the cutoff');
assert.equal(profile({ tool: 1 }).rows[0].objects[0].expected, 6, 'damage rounds successful hits up before multiplying attempts');
assert.equal(profile({ tool: 'best' }).rows[0].objects[0].tool, 0, 'isolated-cost selection can prefer the smaller tool');
const damaged = fixture(); damaged.shop[33] = 50;
assert.equal(profile({}, config, damaged).rows[0].objects[0].expected, 4);
damaged.pow = 1e8; damaged.shop[34] = 1;
assert.equal(profile({}, config, damaged).rows[0].objects[0].expected, 1, 'source getLOG over-Power damage bonus is included');
assert.equal(profile({}, { ...config, manic: true }).rows[0].objects[0].expected, 150);
assert.equal(profile({}, { ...config, manic: true }).rows[0].objects[0].requirement, 100,
  'Manic changes stamina rather than requirements');
assert.equal(profile({}, { ...config, memorized: [4] }).power, 500);
assert.equal(profile({}, { ...config, memorized: [9] }).power, 1);
assert.equal(profile({}, { ...config, memorized: [9] }).rows[0].objects[0].cost, 3);
const overdrive = fixture(); overdrive.shop[58] = 100;
assert.equal(profile({}, { ...config, memorized: [10] }, overdrive).power, 20000);
assert.equal(profile({}, { ...config, memorized: [10] }, overdrive).rows[0].objects[0].cost, 8);
const refunded = fixture(); refunded.elixirs[2].quantity = 25;
assert.equal(profile({}, { ...config, memorized: [0] }, refunded).rows[0].objects[0].expected, 3.75);
refunded.elixirs[2].quantity = 100;
assert.equal(profile({}, { ...config, memorized: [0] }, refunded).rows[0].objects[0].expected, 0);
assert.equal(profile({}, { ...config, elixirs: [4] }).power, input.pow, 'belt drinks are not silently assumed active');
const scaled = fixture();
Object.assign(scaled.caves[0].rocks[1], { scaled: true, growth: 2 });
const scaledRock = profile({}, config, scaled).rows[0].objects.find(r => r.type === 1);
assert.equal(scaledRock.hp, 6);
assert.equal(scaledRock.requirement, 160000, 'scaling uses native depth six, not visible depth seven');
assert.deepEqual(spelunkRockProbabilities(input.caves[0], 2), [1, 0], 'new types have zero chance at their threshold');
assert.deepEqual(spelunkRockProbabilities(input.caves[0], 10), [0, 1], 'source probabilities above one clamp to certainty');
for (const cave of spelunkCaves()) for (let depth = 0; depth <= 250; depth++) {
  const probabilities = spelunkRockProbabilities(cave, depth);
  assert.ok(probabilities.every(p => p >= 0 && p <= 1));
  assert.ok(Math.abs(probabilities.reduce((a, b) => a + b) - 1) < 1e-12);
}
assert.throws(() => profile({ from: 0 }), /Choose depths/);
assert.throws(() => profile({ from: 1, to: 1002 }), /1,001/);
assert.throws(() => profile({ tool: 99 }), /unlocked/);
assert.throws(() => profile({}, config, { ...input, pow: NaN }), /Power/);
assert.throws(() => profile({}, config, { ...input, pow: 0 }), /Power/);
const overflow = fixture(); overflow.caves[0].rocks[1].scaled = true; overflow.caves[0].rocks[1].growth = 100;
assert.throws(() => profile({ from: 1000, to: 1000 }, config, overflow), /Power requirement/,
  'unsupported native numeric ranges stay explicit rather than becoming zero risk');
assert.deepEqual(input, original, 'depth estimates do not change saves, configs, stamina or source tables');

const ui = fs.readFileSync(new URL('../ui/spelunking.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../../spelunking-calc.html', import.meta.url), 'utf8');
const nodes = new Map(), node = id => {
  if (!nodes.has(id)) nodes.set(id, { innerHTML: '', textContent: '', value: '',
    replaceChildren() { this.innerHTML = ''; }, append(child) { this.child = child; } });
  return nodes.get(id);
};
node('depth-inspect').value = '7';
let current = input, currentConfig = config, invalidations = 0;
const context = {
  $: node, get input() { return current; }, spelunkDepthProfile,
  readConfig: () => currentConfig, num: String, text: String,
  option: (v, label) => `<option value="${v}">${label}</option>`,
  esc: value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;'),
  hideTip() {}, invalidate() { invalidations++; },
};
vm.createContext(context);
vm.runInContext(ui.slice(ui.indexOf('let depthProfile ='), ui.indexOf('function selectTab('))
  + '\nrenderDepthLimits();', context);
assert.equal((node('depth-graphs').innerHTML.match(/<svg /g) || []).length, 2);
assert.match(node('depth-graphs').innerHTML, /not actual failure odds or cumulative risk/);
assert.match(node('depth-graphs').innerHTML, /not remaining stamina at that depth/);
assert.match(node('depth-values').innerHTML, /Hard rock/);
assert.match(node('depth-values').innerHTML, /Boss floor only/);
assert.ok(!/NaN|Infinity/.test(node('depth-graphs').innerHTML));
assert.equal(vm.runInContext('depthPercent(1e-12)', context), '1.00e-10%',
  'rare breakthrough chances must not round to zero and imply a literal hard Power gate');
node('depth-from').value = '7'; node('depth-to').value = '7'; node('depth-tool').value = '0';
vm.runInContext('renderDepthLimits();', context);
assert.match(node('depth-graphs').innerHTML, /<circle /, 'single-depth and boss-only series remain visible');
assert.equal(node('depth-selected').textContent, 7);
node('depth-from').value = '0';
vm.runInContext('renderDepthLimits();', context);
assert.match(node('depth-graphs').innerHTML, /role="alert"/);
assert.equal(node('depth-values').innerHTML, '', 'errors clear stale exact values');
node('depth-from').value = '7';
current = { ...input, pow: 1e10, partial: true };
vm.runInContext('renderDepthLimits();', context);
assert.match(node('depth-graphs').innerHTML, /Partial account inputs/);
assert.match(node('depth-values').innerHTML, /<strong>0%<\/strong>/, 'save refresh updates the probability rather than retaining old inputs');
currentConfig = { ...config, party: [0, 1] };
vm.runInContext('renderDepthLimits();', context);
assert.match(node('depth-graphs').innerHTML, /<strong>25<\/strong>/, 'party edits update the cutoff');
assert.equal(invalidations, 0, 'display-only graph edits do not cancel workers or invalidate comparison results');
const tabs = ['simulate', 'compare', 'optimize', 'depth', 'breakdowns']
  .map(name => ({ dataset: { tab: name }, setAttribute(key, value) { this[key] = value; } }));
Object.assign(context, { activeTab: 'simulate', pause() {}, closePicker() {},
  document: { querySelectorAll: () => tabs } });
vm.runInContext(ui.slice(ui.indexOf('function selectTab('), ui.indexOf('function renderRun('))
  + '\nselectTab("depth");', context);
assert.equal(node('depth-status-host').child, node('job-status'), 'the depth tab has the shared live-job status host');
assert.equal(tabs.find(tab => tab.dataset.tab === 'depth')['aria-selected'], 'true');
assert.equal(node('panel-depth').hidden, false);
assert.equal(node('panel-simulate').hidden, true);
assert.equal(invalidations, 0, 'switching to graphs leaves captured comparison work intact');
current = null;
vm.runInContext('renderDepthLimits();', context);
assert.match(node('depth-graphs').textContent, /Load a valid save/);
assert.equal(node('depth-values').innerHTML, '');
const events = {};
vm.runInNewContext(ui.slice(ui.indexOf("$('main-content').addEventListener('change'"), ui.indexOf("$('configurations').addEventListener('change'")), {
  $: () => ({ addEventListener(type, callback) { events[type] = callback; } }),
  renderDepthLimits() { events.rendered = true; }, renderDepthInspector() {},
  invalidate() { throw new Error('Chart settings must not invalidate simulations.'); },
});
events.change({ target: { id: 'depth-tool', closest: selector => selector === '#panel-depth' } });
assert.equal(events.rendered, true);
assert.match(html, /data-tab="depth"/);
assert.match(html, /id="depth-inspect"[^>]*type="range"/, 'keyboard users have an exact-depth inspector');
console.log('Spelunking depth costs, multi-hole risk, entry effects and graph lifecycle passed.');
