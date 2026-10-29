// One search owner plus up to three independent trial helpers.
export function startSpelunkWorkers(message, {
  onMessage, onError,
  concurrency = Math.min(4, Math.max(1, globalThis.navigator?.hardwareConcurrency || 2)),
  workerFactory = () => new Worker(new URL('./spelunk-worker.js', import.meta.url), { type: 'module' }),
}) {
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4)
    throw new Error('Use one to four expedition workers.');
  const count = ['compare', 'optimize'].includes(message.type) ? concurrency : 1;
  const slots = [];
  let stopped = false, ready = 0, batch = null;
  const terminate = () => {
    stopped = true;
    for (const slot of slots) slot.worker.terminate();
    batch = null;
  };
  const fail = error => {
    if (stopped) return;
    terminate(); onError(error instanceof Error ? error : new Error(String(error)));
  };
  try {
    for (let i = 0; i < count; i++) {
      const worker = workerFactory(), slot = { worker, loaded: false, index: null };
      slots.push(slot);
      worker.onerror = event => fail(new Error(event.message || 'Expedition worker failed.'));
      worker.onmessageerror = () => fail(new Error('Could not receive an expedition worker result.'));
      worker.onmessage = ({ data }) => {
        if (stopped) return;
        try {
          if (data.type === 'error') throw new Error(data.error || 'Expedition trial failed.');
          if (!slot.loaded) {
            if (data.type !== 'done' || data.id !== 'load') return;
            if (!data.input) throw new Error('Expedition worker returned no loaded inputs.');
            slot.loaded = true; ready++;
            if (ready === count) {
              const { raw, ...job } = message;
              slots[0].worker.postMessage({ ...job, parallel: count > 1,
                options: { ...job.options, batchSize: count } });
            }
            return;
          }
          if (i === 0) {
            if (data.id !== message.id) return;
            if (data.type === 'batch') {
              if (batch || !Array.isArray(data.requests) || !data.requests.length || data.requests.length >= count)
                throw new Error('Invalid expedition helper batch.');
              batch = { id: data.batchId, results: Array(data.requests.length), remaining: data.requests.length };
              data.requests.forEach((request, j) => {
                const helper = slots[j + 1]; helper.index = j;
                helper.worker.postMessage({ type: 'trial', id: data.batchId, config: request.config, seed: request.seed });
              });
            } else if (data.type === 'done') {
              terminate(); onMessage({ ...data, workers: count });
            } else if (data.type === 'progress') onMessage(data);
          } else if (data.type === 'done') {
            if (!batch || slot.index == null || data.id !== batch.id || !data.result)
              throw new Error('Unexpected expedition helper result.');
            batch.results[slot.index] = data.result; slot.index = null;
            if (--batch.remaining === 0) {
              const completed = batch; batch = null;
              slots[0].worker.postMessage({ type: 'resume', id: message.id,
                batchId: completed.id, results: completed.results });
            }
          }
        } catch (error) { fail(error); }
      };
    }
    for (const slot of slots)
      slot.worker.postMessage({ type: 'load', id: 'load', raw: message.raw, charIdx: message.charIdx });
  } catch (error) { terminate(); throw error; }
  return { terminate };
}
