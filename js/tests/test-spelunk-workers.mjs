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
async function run(message, concurrency) {
  const start = adapters.length;
  const result = await new Promise((resolve, reject) => {
    startSpelunkWorkers({ ...message, raw, id: 7 }, {
      concurrency, workerFactory, onMessage: data => { if (data.type === 'done') resolve(data); }, onError: reject,
    });
  });
  const workers = adapters.slice(start);
  assert.ok(workers.every(w => w.terminated), 'completion terminates every worker');
  assert.ok(workers.every(w => w.messages.filter(m => m.raw).length === 1), 'each worker loads one captured save');
  assert.ok(workers.every(w => w.messages.filter(m => m.type === 'trial').every(m => !m.raw)));
  return result;
}
const config = { party: [0], policy: 'dive', manic: true, elixirs: [] };
const options = { screening: 1, trials: 2, scope: {
  partyMin: 1, partyMax: 1, modes: ['manual'], clears: [true], speeds: [], elixirs: [], memorized: [],
} };
const serial = await run({ type: 'optimize', config, seed: 33, options }, 1);
const pooled = await run({ type: 'optimize', config, seed: 33, options }, 4);
assert.deepEqual(pooled.result, serial.result, 'real parallel search matches one-worker results exactly');
assert.equal(pooled.workers, 4);
assert.ok(peak >= 2, 'at least two real helper trials execute concurrently');
assert.ok(responses.length > 3, 'helpers are reused across dependent search stages');
const configurations = [{ label: 'One', config }, { label: 'Two', config: { ...config, party: [1, 0] } }];
const compare = { type: 'compare', config, configurations, seed: 57, options: { trials: 3 } };
assert.deepEqual((await run(compare, 4)).result, (await run(compare, 1)).result,
  'real worker comparison preserves trial order and arithmetic');
const replay = await run({ type: 'run', config, seed: 57 }, 4);
assert.equal(replay.workers, 1, 'a replay stays on one dedicated worker');
assert.ok(replay.result.frames.length > 0);
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
