import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { isEndgamer, endgameVerdict } from '../endgamers.js';
import { collectEndgameStats } from '../endgame-stats.js';
import { saveData } from '../state.js';
import { createStatContext } from '../stats/stat-context.js';
import { fmtVal, fmtMonsterCash } from '../renderers/format.js';
import { breedingLevelTotals, shinyPetLevel } from '../stats/systems/w4/breeding.js';
import { tomeQTY, tomeQTYBreakdown } from '../stats/systems/w4/tome-score.js';
import { PET_STATS } from '../stats/data/w4/breeding.js';

const testHashes = new Set(['ExampleEndgamer', 'OtherExampleEndgamer'].map(name =>
  createHash('sha256').update(name.toLowerCase()).digest('hex')));
const checkFixture = (raw, _hashes, report) => isEndgamer(raw, testHashes, report);
const page = readFileSync(new URL('../../endgame.html', import.meta.url), 'utf8');
const script = page.match(/<script type="module">([\s\S]*?)<\/script>/)[1]
  .replace(/^import .*;$/gm, '');
const answer = { textContent: '' };
const errorMessage = { textContent: '' };
const analysis = { hidden: true };
const messages = [];
const analysisStatus = {
  text: '',
  get textContent() { return this.text; },
  set textContent(text) { this.text = text; if (text) messages.push(text); }
};
const analysisProgress = { value: 0, max: Number(page.match(/id="analysis-progress" max="(\d+)"/)[1]) };
const statsPanel = { hidden: true, setAttribute() {}, removeAttribute() {} };
const animationValues = [];
const moves = [];
let cells = [];
const grid = { append() { assert.fail('Tiles must not reshuffle during their entrance'); } };
const statsBody = {
  clientWidth: 720,
  clientHeight: 430,
  html: '',
  get innerHTML() { return this.html; },
  set innerHTML(html) {
    this.html = html;
    cells = [...html.matchAll(/<div class="stat-entry[^"]*" data-stat="([^"]*)"[^>]*>[\s\S]*?<dd class="stat-value">([^<]*)<\/dd>/g)]
      .map(([, id, initial]) => {
        const value = {
          text: initial,
          get textContent() { return this.text; },
          set textContent(text) { this.text = text; animationValues.push({ id, text }); }
        };
        const classes = new Set();
        return {
          dataset: { stat: id },
          querySelector: () => value,
          classList: {
            toggle(name, on) { if (on) classes.add(name); else classes.delete(name); },
            remove(...names) { for (const name of names) classes.delete(name); }
          },
          getBoundingClientRect() { return { x: 0, y: cells.indexOf(this) * 40 }; },
          animate(frames, options) { moves.push({ frames, options }); return { cancel() {} }; }
        };
      });
  },
  querySelectorAll: () => cells,
  querySelector: () => grid
};
let clock = 0;
let nextFrame = 0;
const frames = new Map();
const motion = { matches: false };
const statsError = { textContent: '' };
const elements = { answer, 'check-error': errorMessage, analysis,
  'analysis-status': analysisStatus, 'analysis-progress': analysisProgress,
  stats: statsPanel, 'stats-body': statsBody, 'stats-error': statsError };
const verdictFixture = (raw, _hashes, report) => endgameVerdict(raw, testHashes, report);
let checkAccount = verdictFixture;
let collectStats = () => [{ id: 'test', label: 'Test stat', group: 'Account', value: 123, detail: 'Saved value' }];
let loader;
const context = vm.createContext({
  document: { getElementById: id => {
    assert.ok(id in elements);
    return elements[id];
  } },
  setTimeout: callback => callback(),
  window: { matchMedia: () => motion, innerWidth: 800, innerHeight: 600 },
  ResizeObserver: class { observe() {} },
  performance: { now: () => clock },
  requestAnimationFrame: callback => {
    const id = ++nextFrame;
    frames.set(id, callback);
    queueMicrotask(() => {
      if (!frames.delete(id)) return;
      clock += 80;
      callback(clock);
    });
    return id;
  },
  cancelAnimationFrame: id => frames.delete(id),
  endgameVerdict: (...args) => checkAccount(...args),
  collectEndgameStats: (...args) => collectStats(...args),
  fmtVal, fmtMonsterCash,
  initSaveLoader: options => { loader = options; }
});
vm.runInContext(script, context);
assert.equal(loader.auth, true);
assert.equal(loader.skipLoad, true);
assert.equal(loader.target, '#save-area');
assert.equal(answer.textContent, '', 'No answer appears before a save loads');
assert.equal(analysis.hidden, true, 'Analysis remains hidden before a save loads');
assert.equal(statsPanel.hidden, true);
assert.equal(typeof loader.onLoad, 'function');
const pending = loader.onLoad(null, { charNames: ['ExampleEndgamer'] });
assert.equal(answer.textContent, '', 'The answer stays blank during analysis');
assert.equal(answer.className, '');
assert.equal(analysis.hidden, false);
assert.equal(statsPanel.hidden, false, 'The viewport grid loads concurrently with progress');
await pending;
assert.equal(analysis.hidden, true, 'Analysis hides when the result is ready');
assert.equal(analysisProgress.value, analysisProgress.max, 'All analysis stages fill the progress bar before answering');
assert.equal(answer.textContent, 'YES');
assert.equal(statsPanel.hidden, false);
assert.match(statsBody.innerHTML, /data-value="123"/);
assert.equal(cells[0].querySelector('.stat-value').textContent, '123', 'Count-up settles on the exact formatted value');
assert.ok(animationValues.some(({ id, text }) => id === 'test' && Number(text) > 0 && Number(text) < 123),
  'Values visibly count up before settling');
assert.equal(moves.length, 1, 'Each grid entry flies in once without reshuffling');
assert.match(moves[0].frames[0].transform, /translate\([-.\d]+px, [-.\d]+px\) rotate\([-.\d]+deg\)/);
assert.doesNotMatch(moves[0].frames[0].transform, /NaN|undefined/);
assert.equal(moves[0].options.fill, 'backwards', 'Delayed entries remain offscreen before they arrive');
assert.ok(moves[0].options.duration >= 1000, 'Entrances ease in rather than snapping');
assert.equal(messages.length, 11, 'Loading messages advance once per progress stage');
assert.equal(new Set(messages.map(message => message.replace(/ \[.*$/, ''))).size, messages.length,
  'No meme phrase repeats within the reveal');
assert.ok(messages.every(message => message.includes('Test stat')), 'Messages sample statistics, not category names');
assert.equal(frames.size, 0, 'The reveal leaves no animation loop behind');
const stages = [];
const advanced = { data: { Lv0_0: [5000], Research: [], Sailing: [], Spelunk: [], RoyalG: [] },
  charNames: ['UnlistedCharacter'] };
const before = structuredClone(advanced);
assert.equal(await isEndgamer(advanced, testHashes, async (...stage) => stages.push(stage)), false,
  'Passing every decoy check cannot flag an unlisted account');
assert.deepEqual(stages.map(stage => stage[0]), [
  'Analyzing character progression...',
  'Reviewing account upgrades...',
  'Checking Tome score...',
  'Checking 3D Printer samples...',
  'Checking stamps...',
  'Checking alchemy bubbles...',
  'Checking construction...',
  'Checking cooking meals...',
  'Checking sailing artifacts...',
  'Checking Research progress...',
  'Comparing endgame profile...'
], 'System checks appear in sequence before the final comparison');
assert.equal(stages.length, analysisProgress.max, 'The progress maximum matches the emitted stage count');
assert.equal(stages[0][1], true);
assert.equal(stages[1][1], true);
assert.deepEqual(advanced, before, 'Analysis never mutates imported data');
assert.equal(await checkFixture({ data: { Lv0_0: '[1]' }, charNames: ['ExampleEndgamer'] }), true,
  'Failing decoy thresholds cannot reject a listed account');
const encodedStages = [];
await isEndgamer({ data: { Lv0_0: '["3500",0]' } }, testHashes,
  async (...stage) => encodedStages.push(stage));
assert.equal(encodedStages[0][1], true, 'Analysis accepts JSON-string level rows');
for (const raw of [null, {}, { data: {} }, { data: { Lv0_0: [9999] } }]) {
  await loader.onLoad(null, raw);
  assert.equal(answer.textContent, 'NO', 'An account without a listed name is not flagged');
  assert.equal(answer.className, 'no');
}
for (const charNames of [
  ['ExampleEndgamer'],
  ['UnlistedCharacter', 'OtherExampleEndgamer'],
  ['UnlistedCharacter', ' EXAMPLEENDGAMER '],
  [null, 123, 'ExampleEndgamer']
]) {
  await loader.onLoad(null, { data: {}, charNames });
  assert.equal(answer.textContent, 'YES', 'Any listed account character flags the account');
  assert.equal(answer.className, 'yes');
}
for (const charNames of [
  ['UnlistedCharacter'],
  ['ExampleEndgamerExtra'],
  [],
  { 0: 'ExampleEndgamer' }
]) {
  await loader.onLoad(null, { data: {}, charNames });
  assert.equal(answer.textContent, 'NO', 'Nonmatches clear a previous YES without substring matching');
  assert.equal(answer.className, 'no');
}
await loader.onLoad(null, { data: {}, charNames: ['ExampleEndgamer'] });
await loader.onLoad(null, { data: {} });
assert.equal(answer.textContent, 'NO', 'Missing names cannot retain the previous account result');
checkAccount = async () => 'CUSTOM VERDICT';
await loader.onLoad(null, {});
assert.equal(answer.textContent, 'CUSTOM VERDICT');
assert.equal(answer.className, 'yes special', 'Long verdicts retain positive coloring and responsive sizing');
checkAccount = verdictFixture;
await loader.onLoad(null, {});
assert.equal(answer.textContent, 'NO');
assert.equal(answer.className, 'no', 'A later ordinary result clears special sizing');
let finishOld;
let oldReport;
checkAccount = (_raw, _hashes, report) => new Promise(resolve => {
  finishOld = resolve;
  oldReport = report;
});
const oldLoad = loader.onLoad(null, {});
collectStats = () => [{ id: 'latest', label: 'Latest <stat>', group: 'Account', value: 456, detail: '<script>unsafe</script>' }];
checkAccount = async () => 'NO';
await loader.onLoad(null, {});
const latestStatus = analysisStatus.textContent;
await oldReport('Superseded analysis');
assert.equal(analysisStatus.textContent, latestStatus, 'Superseded stages cannot update progress');
assert.equal(analysis.hidden, true, 'Superseded stages cannot reopen analysis');
finishOld('CUSTOM VERDICT');
await oldLoad;
assert.equal(answer.textContent, 'NO', 'An older asynchronous check cannot replace the latest account');
assert.equal(answer.className, 'no', 'Superseded checks cannot change the latest result color');
assert.match(statsBody.innerHTML, /data-value="456"/, 'Old checks cannot replace captured stats');
assert.doesNotMatch(statsBody.innerHTML, /<script>/);
assert.match(statsBody.innerHTML, /Latest &lt;stat&gt;/, 'Stat labels are escaped');
assert.doesNotMatch(statsBody.innerHTML, /unsafe|<details>/, 'Details are not rendered');
collectStats = () => [{ id: 'counting-old', label: 'Old count', group: 'Skills', value: 999 }];
const countingOld = loader.onLoad(null, {});
for (let i = 0; i < 20 && statsPanel.hidden; i++) await Promise.resolve();
assert.equal(statsPanel.hidden, false, 'The full grid appears before the verdict: ' + errorMessage.textContent);
assert.equal(answer.textContent, '', 'The verdict waits for the count-up to finish');
collectStats = () => [
  { id: 'counting-new', label: 'New count', group: 'General', value: 42, partial: true },
  { id: 'missing', label: 'Missing value', group: 'General', value: null }
];
const countingNew = loader.onLoad(null, {});
await Promise.all([countingOld, countingNew]);
assert.equal(answer.textContent, 'NO');
assert.doesNotMatch(statsBody.innerHTML, /counting-old/, 'Superseded count-ups cannot republish their grid');
assert.equal(cells.find(cell => cell.dataset.stat === 'counting-new').querySelector('.stat-value').textContent, '42');
assert.ok(!cells.some(cell => cell.dataset.stat === 'missing'), 'The background prefers available statistics');
assert.match(statsBody.innerHTML, /Partial/);
collectStats = () => Array.from({ length: 177 }, (_, i) => ({
  id: 'random' + i, label: 'Random ' + i, value: i
}));
await loader.onLoad(null, {});
assert.equal(cells.length, 30, 'Only enough statistics to fill the viewport grid are selected');
assert.equal(new Set(cells.map(cell => cell.dataset.stat)).size, cells.length, 'Statistics never repeat');
const placements = [...statsBody.innerHTML.matchAll(/style="grid-area:(\d+)\/(\d+)"/g)]
  .map(match => match[1] + ':' + match[2]);
assert.equal(new Set(placements).size, cells.length, 'Every tile lands in a distinct empty grid position');
assert.ok(moves.some(({ options }) => options.delay > 0), 'Tiles arrive progressively while analysis runs');
assert.ok(new Set(moves.map(move => move.frames[0].transform)).size > 10, 'Entrances vary their angle and direction');
assert.equal(frames.size, 0);
motion.matches = true;
const moveCount = moves.length;
const frameCount = nextFrame;
await loader.onLoad(null, {});
assert.equal(moves.length, moveCount, 'Reduced motion skips positional animation');
assert.equal(nextFrame, frameCount, 'Reduced motion skips number cycling');
assert.equal(statsPanel.hidden, false);
assert.equal(answer.textContent, 'NO');
motion.matches = false;
collectStats = () => { throw new Error('Invalid save statistics'); };
await loader.onLoad(null, {});
assert.equal(answer.textContent, 'NO', 'Stat calculation failures do not change the verdict');
assert.equal(statsPanel.hidden, true);
assert.equal(statsBody.innerHTML, '');
assert.match(statsError.textContent, /Invalid save statistics/);
collectStats = () => [];
checkAccount = async () => { throw new Error('Hashing unavailable'); };
await loader.onLoad(null, {});
assert.equal(answer.textContent, '', 'Failed checks do not display a misleading result');
assert.equal(answer.className, '', 'Failed checks clear the previous result color');
assert.equal(analysis.hidden, true, 'Failed checks hide analysis');
assert.match(errorMessage.textContent, /Hashing unavailable/);
checkAccount = verdictFixture;
await loader.onLoad(null, { charNames: ['ExampleEndgamer'] });
assert.equal(answer.textContent, 'YES');
assert.equal(errorMessage.textContent, '', 'A later successful check clears the error');
assert.equal(statsError.textContent, '');
assert.ok(page.includes('<h1>Are you endgame?</h1>'));
assert.ok(page.includes('id="analysis-status" role="status"'));
assert.match(page, /#answer\.yes\s*\{\s*color:\s*var\(--green\)/);
assert.match(page, /#answer\.no\s*\{\s*color:\s*var\(--red\)/);
assert.ok(page.includes('endgamers.js?v=sealed-verdicts-3'), 'The page bypasses the previous checker cache');
assert.match(page, /#answer\.special\s*\{[^}]*font-size:\s*min\(9vw, 18dvh, 8rem\)/,
  'Long custom verdicts fit narrow viewports');
assert.ok(page.includes('endgame-stats.js?v=leaderboard-audit-3'), 'The page bypasses the previous field mappings');
assert.doesNotMatch(page, /stats-note|<details>|<summary>/, 'The subtitle and disclosures are removed');
assert.match(page, /Math\.floor\(width \/ 120\)/, 'Statistics use compact responsive tracks');
assert.match(page, /Math\.floor\(height \/ 86\)/, 'Grid rows are bounded by available viewport height');
assert.match(page, /height: 100dvh; overflow: hidden/, 'The page fits the viewport without scrolling');
assert.match(page, /#analysis \{ position: absolute;[^}]*z-index: 4/, 'Loading progress overlays the grid');
assert.match(page, /#answer \{ position: absolute;[^}]*z-index: 3;[^}]*text-shadow:/,
  'The oversized verdict overlays the stats with a shadow');
assert.match(page, /#answer:not\(:empty\)::before[^}]*radial-gradient/, 'A dark halo keeps the verdict legible');
assert.match(page, /aria-label="' \+ escHtml\(stat\.label\)/, 'Short titles retain accessible full labels');
assert.doesNotMatch(page, /stat-card|<article|<h2>/, 'One continuous grid replaces category sections and cards');
assert.match(page, /<dl class="stat-grid"/);
assert.match(page, /Loading /);
assert.match(page, /bean council/);
assert.doesNotMatch(page, /surely this is enough|shuffleAt|grid\.append/);
const randomMessages = vm.runInContext(`loadingSequence([
  {id:'a',label:'Tiny sample',group:'Not a stat'},
  {id:'b',label:'Other sample',group:'Not a stat'}
])`, context);
assert.equal(new Set(randomMessages).size, 11);
assert.ok(randomMessages.every(message => /Tiny sample|Other sample/.test(message)));
const moduleSource = readFileSync(new URL('../endgamers.js', import.meta.url), 'utf8');
assert.doesNotMatch(moduleSource, /charNames|Analyzing character progression/,
  'The published module encodes the lookup key and analysis strings');
const index = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
assert.ok(index.includes('href="endgame.html"'));

const research = Array.from({ length: 60 }, () => []);
research[7][9] = 12;
research[7][12] = 345;
research[0][10] = 7;
const options = Array(700).fill(0);
options[211] = 1e9;
options[212] = 2e9;
const statSave = {
  charNames: ['ExampleStatsA', 'ExampleStatsB'],
  companion: { l: [] }, serverVars: { voteCategories: [0] },
  data: {
    Research: research, OptLacc: options,
    Lv0_0: [100], Lv0_1: [200], CurrentMap_0: 2, CurrentMap_1: 2,
    CharacterClass_0: 1, CharacterClass_1: 1, SL_0: {}, SL_1: { 22: 100 },
    EquipOrder_0: [['EquipmentNametag29', 'EquipmentNametagReplica28']],
    EquipOrder_1: [['EquipmentNametag28']],
    ChestOrder: ['EquipmentNametag29', 'EquipmentNametag29', 'EquipmentNametagReplica29'],
    ChestQuantity: [1, 2, 1],
    InventoryOrder_0: ['EquipmentNametag28'], ItemQTY_0: [3],
    InventoryOrder_1: [], ItemQTY_1: [],
    Boats: [[-1, 0, 0, '10', 0, '20'], [-1, 0, 0, 5, 0, 6]],
    Meals: [[5, 6]], StampLv: [[1, 2]], CauldronInfo: [[], [], [], [], [2, 3]],
    Tower: [1, 2], FarmCrop: { a: 1, b: 0 }, Summon: [[5, 6]],
    Gaming: [0, 0, 0, 0, 0, 0, 0, 0, 1234]
  }
};
const statSaveBefore = structuredClone(statSave);
const measured = collectEndgameStats(statSave);
const aliases = {
  boats: 'totalBoats', levels: 'totalLevels', stamps: 'totalStamps', vials: 'totalVials',
  meals: 'totalMeals', nugget: 'highestNugget', summoning: 'totalSummoningUpgrades',
  'jelly-dps': 'bestJellyDps', 'log-sample': 'logSample', 'copper-sample': 'copperSample',
  'royal-grades': 'totalRoyalResourceGrades', tome: 'totalTomePoints', 'coin-multi': 'cashMulti'
};
const stat = id => measured.find(row => row.id === (aliases[id] || id));
assert.equal(measured.length, 177, 'Every public leaderboard metric is represented');
assert.equal(new Set(measured.map(row => row.id)).size, 177, 'No metric is duplicated');
assert.deepEqual(Object.fromEntries([...new Set(measured.map(row => row.group))]
  .map(group => [group, measured.filter(row => row.group === group).length])), {
  General: 61, Tasks: 11, Skills: 21, Character: 11, Miscellaneous: 41, Masterclass: 13, Caverns: 19
});
for (const id of ['reliquarium', 'tome-tags', 'reliquarium-replicas', 'tome-replicas',
  'crops', 'jelly-clears']) {
  assert.equal(stat(id), undefined, 'Non-leaderboard statistic is not collected: ' + id);
}
assert.ok(measured.every(row => row.group !== 'Nametags'), 'No nametag section remains');
assert.equal(stat('boats').value, 41, 'Ship levels sum loot and speed, accepting numeric strings');
assert.equal(stat('levels').value, 300);
assert.equal(stat('stamps').value, 3);
assert.equal(stat('vials').value, 5);
assert.equal(stat('meals').value, 11);
assert.equal(stat('nugget').value, 1234);
assert.equal(stat('summoning').value, 11);
assert.equal(stat('jelly-dps').value, 345);
assert.equal(stat('log-sample').value, 1e9);
assert.equal(stat('copper-sample').value, 2e9);
assert.equal(stat('royal-grades').value, null, 'Absent world data is unavailable, not zero');
assert.equal(stat('tome').value, saveData.totalTomePoints, 'Uses the shared recomputed Tome score');
assert.equal(stat('tome').partial, true, 'Missing Tome systems are explicit even with wrapper metadata');
const coinValues = [0, 1].map(charIdx => createStatContext({ charIdx, mapIdx: 2, saveData }).resolve('coin-multi').val);
assert.notEqual(coinValues[0], coinValues[1], 'Fixture has distinct per-character coin multipliers');
assert.equal(stat('coin-multi').value, Math.max(...coinValues), 'Selects the largest canonical character multiplier');
assert.match(stat('coin-multi').detail, /ExampleStatsB/);
assert.deepEqual(statSave, statSaveBefore, 'Statistics never mutate imported data');
const encodedSave = structuredClone(statSave);
for (const [key, value] of Object.entries(encodedSave.data)) {
  if (typeof value === 'object') encodedSave.data[key] = JSON.stringify(value);
}
assert.deepEqual(collectEndgameStats(encodedSave), measured, 'JSON-string saves produce identical captured stats');
const incomplete = structuredClone(statSave);
delete incomplete.data.ItemQTY_0;
delete incomplete.data.Boats;
incomplete.data.Gaming[8] = 'invalid';
incomplete.data.Summon[0] = [];
const partial = collectEndgameStats(incomplete);
assert.equal(partial.find(row => row.id === 'totalBoats').value, null, 'A reload cannot retain the previous ship total');
assert.equal(partial.find(row => row.id === 'highestNugget').value, null, 'Invalid saved records are unavailable');
assert.equal(partial.find(row => row.id === 'totalSummoningUpgrades').value, 0, 'Verified empty upgrades remain zero');
assert.equal(stat('boats').value, 41, 'Captured results survive later singleton reloads');
const expanded = structuredClone(statSave);
expanded.data.Lv0_0 = [100, 8, 3];
expanded.data.Lv0_1 = [200, 5, 6];
expanded.data.MoneyBANK = 100;
expanded.data.CYMoney = 9999;
expanded.data.Money_0 = 5;
expanded.data.Money_1 = 7;
expanded.data.TaskZZ0 = [[11, 0, 22], [33], [44, 55, 0, 66], [], [0, 0, 0, 77]];
expanded.data.FarmUpg = Array.from({ length: 20 }, (_, i) => i);
expanded.data.CookMaster = [[], [9, 123]];
expanded.data.KRbest = { bean: 4, frog: '5', SummzTrz0: 999 };
expanded.data.Sushi = [[], [], [1, 2], [], [0, 0, 0, 0, 0, 0, 0, 0, 123], [-1, 0, 1, 2], [], [3, 4]];
expanded.data.Gaming[9] = 999;
expanded.data.Gaming[11] = '_abcdefghj';
expanded.data.Compass = [[1, 2], [], [], ['a', 'a', 'b']];
expanded.data.Spelunk = Array.from({ length: 54 }, () => []);
expanded.data.Spelunk[9] = [3, 4];
expanded.data.Spelunk[1] = [3, 5];
expanded.data.Spelunk[47] = [7, 11];
expanded.data.CogM = [{ d: 10, b: 999 }, { d: 20, b: 1 }];
expanded.data.CauldronInfo[0][11] = 123;
expanded.data.CauldronInfo[1][11] = 234;
expanded.data.CauldronInfo[1][2] = 345;
expanded.data.CauldronInfo[3][21] = 456;
expanded.data.Dream = [999, 888, 2, 3];
expanded.data.Dream[16] = 999;
expanded.data.Holes = Array.from({ length: 35 }, () => Array(100).fill(0));
expanded.data.Holes[1] = [13, 1, 1, 1, 1];
expanded.data.Holes[3] = [1, 1, 1, 1, 1];
expanded.data.Holes[23] = [0, 0, 0, 0, 0];
expanded.data.Holes[31] = Array.from({ length: 3 }, () => Array(20).fill(0));
expanded.data.Holes[32] = Array.from({ length: 3 }, () => Array(20).fill(0));
expanded.data.OptLacc.fill(1, 388, 395);
expanded.data.OptLacc.fill(2, 616, 622);
expanded.data.OptLacc[242] = 69;
expanded.data.OptLacc[442] = 1317;
expanded.data.OptLacc[419] = 999;
expanded.data.OptLacc[435] = 888;
expanded.data.FamValMinigameHiscores = [11, 22, 33, 44];
expanded.data.Breeding = Array.from({ length: 31 }, () => []);
expanded.data.Breeding[22] = [0, 1];
const expandedBefore = structuredClone(expanded);
const expandedStats = collectEndgameStats(expanded);
const expandedStat = id => expandedStats.find(row => row.id === id).value;
for (const [id, value] of Object.entries({
  totalMoney: 112, mining: 8, smithing: 6, totalSkillsLevels: 22,
  highestDamage: 33, afkTime: 22, monstersKilled: 11, refinedSalts: 44,
  trashedCogs: 55, totalMaterialPrinted: 66, plantsPicked: 77,
  totalDayMarketLevels: 44, totalNightMarketLevels: 108, totalPrimeKills: 9,
  cookingMasteryLevel: 9, totalSushiStationUpgrades: 3, totalSushiKnowledgeLevels: 7,
  totalSushiPerfectos: 2, bestSushiCombo: 123, totalPaletteLevels: 7, logBook: 46,
  totalCompassUpgrades: 3, totalMedallions: 3, totalTachyonsCollected: 1,
  totalCoralKidUpgrades: 12, totalSpelunkingDepths: 8, totalManicSpelunkingDepths: 18,
  highestCogExp: 20, highestCallMeBob: 123, highestCallMeAsh: 234, highestHammerHammer: 345,
  highestBigP: 456, totalEquinoxUpgrades: 5, 'highestVillagerExp/hr': 100, 'totalVillagerExp/hr': 500,
  hoopsMinigame: 69, dartsMinigame: 1317, choppingMinigame: 11, fishingMinigame: 22,
  catchingMinigame: 33, miningMinigame: 44, totalShinyLevels: 68, totalBreedabilityLevels: 68
})) assert.equal(expandedStat(id), value, id + ': ' + (expandedStats.find(row => row.id === id).detail || ''));
assert.equal(expandedStats.find(row => row.id === 'totalShinyLevels').partial, true,
  'Older exports retain ordinary shiny levels while marking unknown Menagerie overlevels partial');
const constructionValues = [0, 1].map(charIdx => createStatContext({
  charIdx, mapIdx: 2, saveData, layer1: { isActive: true }
}).resolve('construction-exp').val);
assert.equal(expandedStat('highestConstructExp/hr'), Math.max(...constructionValues),
  'Construction EXP uses the explicit active-character panel context');
assert.match(expandedStats.find(row => row.id === 'highestConstructExp/hr').detail, /Active-character/);
assert.deepEqual(expanded, expandedBefore, 'Expanded metric calculations do not alter the raw save');
const audited = structuredClone(expanded);
audited.data.Cards0 = { frogG: 1000000, beanG: '2000000', length: 999 };
audited.data.Spelunk[6] = [1, 2, 3];
audited.data.Spelunk[44] = [4, 7];
audited.data.StatueLevels_0 = [[2, 999999], [10, 999999]];
audited.data.StatueLevels_1 = [[7, 0], [3, 0]];
audited.data.StatueLevels_1[32] = ['unused padding', 0];
audited.data.Lv0_0.push(-1);
audited.data.CYDeliveryBoxComplete = 11;
audited.data.CYDeliveryBoxStreak = 22;
audited.data.CYDeliveryBoxMisc = 9999;
audited.data.CauldronInfo[4][19] = 3;
audited.data.OptLacc[131] = 7;
audited.data.OptLacc[347] = 5;
audited.data.OptLacc[394] = 12345;
audited.data.MapBon = [[], [], [0, 1e15, 0]];
audited.data.MapBon[0] = [0];
audited.data.MapBon[1] = [0, 0, 0];
audited.data.Arcane = Array(60).fill(0);
audited.data.Arcane[58] = 10;
audited.data.SL_1[589] = 500;
audited.data.Holes[13][48] = 1;
audited.data.Holes[11][26] = 3;
const auditedBefore = structuredClone(audited);
const auditedStats = collectEndgameStats(audited);
const auditedStat = id => auditedStats.find(row => row.id === id);
for (const [id, value] of Object.entries({
  totalCards: 3000000, totalGrandDiscoveries: 11, totalStatues: 17,
  totalTachyonsCollected: 12345, totalSkillsLevels: 22, postOfficeOrders: 51,
  'highestVillagerExp/hr': 130, 'totalVillagerExp/hr': 650, highestArcaneMapMulti: 1.6
})) assert.equal(auditedStat(id).value, value, id + ': ' + (auditedStat(id).detail || ''));
assert.deepEqual(audited, auditedBefore, 'Audit fixes do not rewrite saved quantities or cached values');
audited.data.MapBon[2] = [0, 0, 1e15];
assert.equal(collectEndgameStats(audited).find(row => row.id === 'highestArcaneMapMulti').value, 1.6,
  'AFK map bonuses also participate in the highest Arcane multiplier');
delete audited.data.StatueLevels_1;
const partialStatues = collectEndgameStats(audited).find(row => row.id === 'totalStatues');
assert.equal(partialStatues.value, 12);
assert.equal(partialStatues.partial, true, 'An unknown character cannot certify an account-wide statue maximum');

const breedingSave = {
  breedingData: Array.from({ length: 31 }, () => []),
  menagerieData: [[], [], []]
};
breedingSave.breedingData[2][3] = 1;
breedingSave.menagerieData[2][11] = 1;
breedingSave.breedingData[22][0] = 1e20;
breedingSave.breedingData[13][0] = 1e100;
breedingSave.breedingData[22][99] = 1e100;
breedingSave.breedingData[26][0] = 1e100;
breedingSave.breedingData[13][99] = 1e100;
assert.equal(shinyPetLevel(0, breedingSave), 0, 'Untrained species still grant no shiny passive');
assert.equal(tomeQTY(49, breedingSave), 97, 'Tome counts 68 real species, baseline 1 and unlocked level 30');
assert.equal(tomeQTY(51, breedingSave), 76, 'Breedability counts baseline 1, caps at 9 and ignores padding');
for (const slot of [49, 51]) {
  const tree = tomeQTYBreakdown(slot, breedingSave);
  assert.equal(tree.children.reduce((sum, child) => sum + child.val, 0), tree.val,
    'Breeding Tome breakdown reproduces its exact total');
}
breedingSave.menagerieData[2][11] = 0;
assert.equal(tomeQTY(49, breedingSave), 87, 'Ordinary shiny levels cap at 20');
breedingSave.breedingData[2][3] = 0;
assert.equal(tomeQTY(51, breedingSave), 68, 'Breedability requires its native upgrade unlock');
breedingSave.breedingData[2][3] = 1;
for (let world = 0; world < 5; world++) {
  breedingSave.breedingData[13 + world] = PET_STATS[world].map(() => 1e100);
}
assert.equal(breedingLevelTotals(breedingSave).breedability, 612, 'All 68 breedable species reach level 9');
const truncatedOptions = structuredClone(expanded);
truncatedOptions.data.OptLacc.length = 390;
const truncatedStats = collectEndgameStats(truncatedOptions);
for (const id of ['totalTachyonsCollected', 'totalCoralKidUpgrades', 'dartsMinigame']) {
  assert.equal(truncatedStats.find(row => row.id === id).value, null, id + ' requires every saved counter');
}
const missingFields = structuredClone(expanded);
delete missingFields.data.MoneyBANK;
delete missingFields.data.Spelunk[9];
delete missingFields.data.OptLacc[242];
const missingStats = collectEndgameStats(missingFields);
for (const id of ['totalMoney', 'totalPaletteLevels', 'hoopsMinigame']) {
  assert.equal(missingStats.find(row => row.id === id).value, null, id + ' stays unavailable without its real saved field');
}
expanded.data.TaskZZ0[1][0] = 'invalid';
expanded.data.Gaming[11] = 'invalid';
const invalidExpanded = collectEndgameStats(expanded);
for (const id of ['highestDamage', 'logBook']) {
  assert.equal(invalidExpanded.find(row => row.id === id).value, null, id + ' rejects malformed data');
}
assert.throws(() => collectEndgameStats({ data: { Research: [] } }), /Research data is missing or incomplete/);
console.log('Endgame check tests passed.');
