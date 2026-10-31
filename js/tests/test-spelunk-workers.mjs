import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { startSpelunkWorkers } from '../workers/spelunk-client.js';

const workerUrl = new URL('../workers/spelunk-worker.js', import.meta.url).href;
const Spelunk = Array.from({ length: 49 }, () => []);
Spelunk[3] = Array(10).fill(8);
Spelunk[5] = Array(80).fill(0);
Spelunk[5][12] = 1; Spelunk[5][53] = 1;
Spelunk[7] = [-1, -1, -1, -1, -1];
const OptLacc = Array(600).fill(0); OptLacc[478] = 15;
const raw = { Research: Array.from({ length: 60 }, () => []), Spelunk, OptLacc, Lv0_0: [1] };
const before = structuredClone(raw);
const adapters = [];
let active = 0, peak = 0, responses = [];
function workerFactory() {
  const native = new Worker(`
    const { parentPort } = require('node:worker_threads');
    globalThis.self = { postMessage: value => parentPort.postMessage(value) };
    (async () => {
      await import(${JSON.stringify(workerUrl)});
      parentPort.on('message', data => self.onmessage({ data }));
    })().catch(error => { throw error; });
  `, { eval: true });
  const adapter = {
    messages: [], terminated: false, trial: null,
    postMessage(message) {
      adapter.messages.push(message);
      if (message.type === 'trial') { adapter.trial = message; active++; peak = Math.max(peak, active); }
      native.postMessage(message);
    },
    terminate() {
      if (adapter.trial) { active--; adapter.trial = null; }
      adapter.terminated = true; native.terminate();
    },
  };
  native.on('message', data => {
    const deliver = () => adapter.onmessage?.({ data });
    if (data.type === 'done' && adapter.trial) {
      active--; responses.push(adapter.trial.seed); adapter.trial = null;
      // Force helper completions out of order without changing native simulation.
      setTimeout(deliver, adapters.indexOf(adapter) % 3 * 20);
    } else deliver();
  });
  native.on('error', error => adapter.onerror?.(error));
  adapters.push(adapter);
  return adapter;
}
async function run(message, concurrency, capturedRaw = raw) {
  const start = adapters.length;
  const progress = [];
  const result = await new Promise((resolve, reject) => {
    startSpelunkWorkers({ ...message, raw: capturedRaw, id: 7 }, {
      concurrency, workerFactory, onMessage: data => {
        if (data.type === 'progress') progress.push(data.fraction);
        if (data.type === 'done') resolve(data);
      }, onError: reject,
    });
  });
  const workers = adapters.slice(start);
  assert.ok(workers.every(w => w.terminated), 'completion terminates every worker');
  assert.ok(workers.every(w => w.messages.filter(m => m.raw).length === 1), 'each worker loads one captured save');
  assert.ok(workers.every(w => w.messages.filter(m => m.type === 'trial').every(m => !m.raw)));
  if (message.options?.mode === 'amber')
    assert.ok(progress.every((p, i) => p >= 0 && p <= 1 && (!i || p >= progress[i - 1])),
      'real owner/helper Amber progress is monotonic across refinement and adaptive comparison');
  return result;
}
const config = { party: [0], policy: 'dive', manic: true, elixirs: [] };
const fifthConfig = { ...config, policy: 'clear-fifth' };
const fifthOptions = { screening: 1, trials: 2, scope: { clears: ['fifth'],
  enabled: { party: false, modes: false, clears: true, speeds: false, elixirs: false,
    memorized: false, tools: false, entry: false } } };
const fifthSerial = await run({ type: 'optimize', config: fifthConfig, seed: 33, options: fifthOptions }, 1);
const fifthPooled = await run({ type: 'optimize', config: fifthConfig, seed: 33, options: fifthOptions }, 4);
assert.deepEqual(fifthPooled.result, fifthSerial.result, 'the new manual policy and descent scope survive pooled dispatch');
assert.equal(fifthPooled.result.winner.config.policy, 'clear-fifth');
assert.equal(fifthPooled.result.configurations, 1);
const amberRaw = structuredClone(raw);
amberRaw.Spelunk[5][23] = 12; amberRaw.Spelunk[5][24] = 4; amberRaw.Spelunk[5][25] = 2;
const amberBefore = structuredClone(amberRaw);
const amberJob = { type: 'optimize', config: { ...config, party: [1, 0], elixirs: [3, 3, 3, 6, 6] },
  seed: 33, options: { mode: 'amber', objective: 'amber', screening: 1, trials: 2, maxTrials: 4, from: 1, to: 2, minRopePct: 0 } };
const amberSerial = await run(amberJob, 1, amberRaw);
const amberPooled = await run(amberJob, 4, amberRaw);
assert.deepEqual(amberPooled.result, amberSerial.result, 'real Amber owner/helper jobs preserve all measured phases and risk outcomes');
assert.equal(amberPooled.result.kind, 'amber-search');
assert.equal(amberPooled.result.amberSearch.trials, 4);
assert.ok(amberPooled.result.amberSearch.refined > 0);
assert.ok(amberPooled.result.winner);
assert.ok(amberPooled.result.rows.filter(row => !row.referenceOnly).every(row =>
  row.config.party.join() === '1,0' && row.config.elixirs.join() === '3,3,3,6,6'
  && row.runs.every(run => run.amber && run.exit)));
const amberRow = amberPooled.result.winner, amberTrial = amberRow.runs[0];
const amberReplay = await run({ type: 'run', config: amberRow.config, seed: amberTrial.seed }, 1, amberRaw);
assert.deepEqual(amberReplay.result.amber, amberTrial.amber, 'captured Amber trials replay their measured transition plan');
assert.deepEqual(amberReplay.result.exit, amberTrial.exit);
assert.deepEqual(amberRaw, amberBefore);
const options = { screening: 1, trials: 2, scope: {
  partyMin: 1, partyMax: 1, modes: ['manual'], clears: [true], speeds: [], elixirs: [], memorized: [],
} };
const serial = await run({ type: 'optimize', config, seed: 33, options }, 1);
const pooled = await run({ type: 'optimize', config, seed: 33, options }, 4);
assert.deepEqual(pooled.result, serial.result, 'real parallel search matches one-worker results exactly');
assert.equal(pooled.workers, 4);
assert.ok(peak >= 2, 'at least two real helper trials execute concurrently');
assert.ok(responses.length > 3, 'helpers are reused across dependent search stages');
const partyOptions = { ...options, scope: { partyMin: 1, partyMax: 2,
  enabled: { party: true, modes: false, clears: false, speeds: false, elixirs: false,
    memorized: false, tools: false, entry: false } } };
const partySerial = await run({ type: 'optimize', config, seed: 33, options: partyOptions }, 1);
const partyPooled = await run({ type: 'optimize', config, seed: 33, options: partyOptions }, 4);
assert.deepEqual(partyPooled.result, partySerial.result, 'party-only section toggles survive actual worker dispatch');
assert.equal(partyPooled.result.configurations, 100, 'ten singles and ninety ordered pairs, with no other variation');
assert.ok(partyPooled.result.rows.every(row => row.config.policy === 'dive'
  && row.config.entry === partyPooled.result.baseline.config.entry
  && JSON.stringify(row.config.elixirs) === JSON.stringify(partyPooled.result.baseline.config.elixirs)));
const groupOptions = { ...partyOptions, scope: { ...partyOptions.scope, characters: [3, 1], ignoreOrder: true } };
const groupSerial = await run({ type: 'optimize', config, seed: 33, options: groupOptions }, 1);
const groupPooled = await run({ type: 'optimize', config, seed: 33, options: groupOptions }, 4);
assert.deepEqual(groupPooled.result, groupSerial.result, 'selected characters and combination-only order survive real worker dispatch');
assert.equal(groupPooled.result.configurations, 3);
assert.deepEqual(groupPooled.result.searchScope.characters, [1, 3]);
assert.ok(groupPooled.result.baseline.referenceOnly);
assert.ok(groupPooled.result.rows.filter(row => !row.referenceOnly).every(row =>
  ['1', '3', '1,3'].includes(row.config.party.join())));
const configurations = [{ label: 'One', config }, { label: 'Two', config: { ...config, party: [1, 0] } }];
const compare = { type: 'compare', config, configurations, seed: 57, options: { trials: 3 } };
const compared = (await run(compare, 4)).result;
assert.deepEqual(compared, (await run(compare, 1)).result,
  'real worker comparison preserves trial order and arithmetic');
assert.ok(compared.rows.every(row => row.diagnostics?.members.length === row.config.party.length
  && row.partyAnalysis.rows.length === row.config.party.length),
  'compact helper results retain character diagnostics and paired prefix measurements');
assert.deepEqual(compared.rows[1].partyAnalysis.rows.map(row => row.config.party), [[1], [1, 0]]);
assert.ok(partyPooled.result.winner.partyAnalysis.rows
  .some(row => row.config.party.length === partyPooled.result.winner.partyAnalysis.recommendedSize && row.allowed));
const caveRaw = structuredClone(raw);
caveRaw.Spelunk[0][0] = 1;
caveRaw.Spelunk[1] = [50, 5];
caveRaw.Spelunk[47] = [2, 0];
const caveBefore = structuredClone(caveRaw);
const caves = { type: 'caves', config: { ...config, party: [1, 0] }, seed: 57, options: { trials: 3 } };
const caveSerial = await run(caves, 1, caveRaw);
const cavePooled = await run(caves, 4, caveRaw);
assert.equal(cavePooled.workers, 4, 'all-cave comparison uses the helper pool');
assert.deepEqual(cavePooled.result, caveSerial.result, 'real all-cave workers preserve ranking, records, gains and run order');
assert.equal(cavePooled.result.rows.length, 2, 'compare exactly the unlocked caves');
assert.ok(cavePooled.result.rows.every(row => row.runs.length === 3 && row.diagnostics
  && row.recordDepth === caveRaw.Spelunk[47][row.config.cave] + 1));
const caveRow = cavePooled.result.rows[0], trial = caveRow.runs[0];
const caveReplay = await run({ type: 'run', config: caveRow.config, seed: trial.seed }, 1, caveRaw);
assert.equal(caveReplay.result.depth, trial.depth, 'captured cave trial replays at the measured depth');
assert.equal(caveReplay.result.status, trial.status);
assert.deepEqual(caveRaw, caveBefore);
const replay = await run({ type: 'run', config, seed: 57 }, 4);
assert.equal(replay.workers, 1, 'a replay stays on one dedicated worker');
assert.ok(replay.result.frames.length > 0);
assert.equal(replay.result.partyAnalysis.trials, 1);
const pairReplay = await run({ type: 'run', config: { ...config, party: [1, 0] }, seed: 57 }, 1);
assert.equal(pairReplay.result.partyAnalysis.rows.length, 2, 'single-run UI receives actual shorter-party outcomes');
assert.equal(pairReplay.result.partyAnalysis.rows[1].marginal.interval, null);
const failureStart = adapters.length;
await assert.rejects(run({ type: 'optimize', config, seed: 1, options: { scope: { modes: [] } } }, 3), /Invalid search modes/);
assert.ok(adapters.slice(failureStart).every(w => w.terminated), 'a worker-reported failure tears down the entire pool');
const cancelStart = adapters.length;
let called = false;
const job = startSpelunkWorkers({ type: 'optimize', raw, config, seed: 9, options, id: 8 }, {
  concurrency: 4, workerFactory, onMessage: () => { called = true; }, onError: () => { called = true; },
});
job.terminate();
await new Promise(resolve => setTimeout(resolve, 40));
assert.ok(adapters.slice(cancelStart).every(w => w.terminated));
assert.equal(called, false, 'cancelled jobs cannot deliver late progress or results');
assert.deepEqual(raw, before, 'workers cannot mutate the imported save');
console.log('Real Spelunking worker concurrency, ordered search/comparison parity, one-time loads, errors and cancellation passed.');
