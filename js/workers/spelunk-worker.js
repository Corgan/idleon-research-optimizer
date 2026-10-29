import { loadSaveData } from '../save/loader.js';
import { saveData } from '../state.js';
import { buildSpelunkInputs } from '../stats/systems/w7/spelunk-inputs.js';
import { createSpelunkExpedition } from '../stats/systems/w7/spelunk-expedition.js';
import { createSpelunkComparison, createSpelunkSearch } from '../stats/systems/w7/spelunk-planner.js?v=full-belts-1';

let cachedInput = null;
export async function executeSpelunkJob(message, report = () => {}, batch = null) {
  if (message.raw) {
    loadSaveData(message.raw);
    cachedInput = buildSpelunkInputs(saveData, message.charIdx ?? 0);
  }
  const input = cachedInput;
  if (!input) throw new Error('Load expedition inputs before running trials.');
  if (message.type === 'inputs' || message.type === 'load') return { input };
  let last = 0;
  const progress = (fraction, phase) => {
    const now = performance.now();
    if (now - last >= 100 || fraction === 1) { last = now; report({ fraction, phase }); }
  };
  async function simulate(config, seed, replay, fraction = 0, span = 1, phase = 'Simulating expedition') {
    const run = createSpelunkExpedition(input, config, { seed, replay });
    while (!run.done) {
      run.step(2000);
      if (replay) progress(run.progress, phase);
      else progress(fraction, phase);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    progress(fraction + span, phase);
    const result = run.result();
    if (replay) return result;
    const { seed: runSeed, status, settled, seconds, depth, rewards, grossRewards, spent, grands, stamina } = result;
    return { seed: runSeed, status, settled, seconds, depth, rewards, grossRewards, spent, grands, stamina };
  }
  if (message.type === 'trial') return { result: await simulate(message.config, message.seed, false) };
  if (message.type === 'run') {
    const result = await simulate(message.config, message.seed, true);
    progress(1, 'Complete');
    return { input, result };
  }
  if (!['compare', 'optimize'].includes(message.type)) throw new Error('Unknown expedition operation.');
  const iterator = message.type === 'compare'
    ? createSpelunkComparison(input, message.configurations, { ...message.options, seed: message.seed })
    : createSpelunkSearch(input, message.config, { ...message.options, seed: message.seed });
  let next = iterator.next();
  while (!next.done) {
    const request = next.value;
    const measure = r => simulate(r.config, r.seed, false, r.progress, 0, r.phase);
    const result = request.requests
      ? batch ? await batch(request.requests, measure) : await Promise.all(request.requests.map(measure))
      : await measure(request);
    next = iterator.next(result);
  }
  progress(1, 'Complete');
  return { input, result: next.value };
}
if (typeof self !== 'undefined' && typeof self.postMessage === 'function') {
  let pending = null, batchId = 0, busy = false;
  self.onmessage = async ({ data }) => {
    if (data.type === 'resume') {
      if (!pending || data.id !== pending.id || data.batchId !== pending.batchId) {
        self.postMessage({ type: 'error', id: data.id, error: 'Invalid expedition continuation.' });
        return;
      }
      const { resolve } = pending; pending = null; resolve(data.results);
      return;
    }
    if (busy) {
      self.postMessage({ type: 'error', id: data.id, error: 'Expedition worker is already running.' });
      return;
    }
    busy = true;
    try {
      const batch = data.parallel ? async (requests, measure) => {
        if (requests.length === 1) return [await measure(requests[0])];
        const delegated = new Promise(resolve => {
          pending = { id: data.id, batchId: ++batchId, resolve };
          self.postMessage({ type: 'batch', id: data.id, batchId, requests: requests.slice(1) });
        });
        return [await measure(requests[0]), ...await delegated];
      } : null;
      const result = await executeSpelunkJob(data,
        value => self.postMessage({ type: 'progress', id: data.id, ...value }), batch);
      self.postMessage({ type: 'done', id: data.id, ...result });
    } catch (error) {
      self.postMessage({ type: 'error', id: data.id, error: error.message || String(error) });
    } finally { busy = false; }
  };
}
