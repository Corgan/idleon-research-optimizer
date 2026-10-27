import { createCoveProgressionSearch } from '../stats/systems/w5/cglunko-progression.js';

let search = null, id = null;
self.onmessage = event => {
  const msg = event.data;
  try {
    if (msg.type === 'start') {
      id = msg.id; search = createCoveProgressionSearch(msg.plan);
    } else if (msg.type !== 'resume' || msg.id !== id || !search) return;
    const step = search.next(msg.type === 'resume' ? msg.measurements : undefined);
    self.postMessage({ type: step.done ? 'done' : 'measure', id, ...step.done ? { result: step.value } : step.value });
    if (step.done) search = null;
  } catch (error) {
    search = null;
    self.postMessage({ type: 'error', id, message: error.message || String(error) });
  }
};
