import { vmanSpeedrunRoster, createVmanSpeedrunSearch } from '../stats/vman-speedrun-evaluator.js?v=vman-speedrun-5';

let busy = false;
self.onmessage = async ({ data }) => {
  const { type, id } = data || {};
  let ownsRun = false;
  try {
    if (busy) throw new Error('A speedrun calculation is already active.');
    if (type === 'roster') {
      self.postMessage({ type: 'roster', id, roster: vmanSpeedrunRoster(data.rawSave) });
      return;
    }
    if (type !== 'run') throw new Error('Unknown speedrun worker request.');
    busy = true;
    ownsRun = true;
    const search = createVmanSpeedrunSearch(data.rawSave, {
      charIdx: data.charIdx, seed: data.seed, routeBudget: data.routeBudget ?? 12,
    });
    for (;;) {
      const step = search.next();
      if (step.done) {
        if (!step.value || typeof step.value !== 'object') throw new Error('Speedrun evaluator returned no result.');
        self.postMessage({ type: 'done', id, result: step.value });
        break;
      }
      self.postMessage({ type: 'progress', id, progress: step.value });
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  } catch (error) {
    self.postMessage({ type: 'error', id, error: error?.message || String(error) });
  } finally {
    if (ownsRun) busy = false;
  }
};
