import { compareSneakingFlowers, buildSneakingFlowerComparison } from '../stats/systems/w6/sneaking-flowers.js';
import { loadSaveData } from '../save/loader.js';
import { saveData } from '../state.js';

self.onmessage = ({ data }) => {
  let last = 0;
  try {
    self.postMessage({ type: 'preparing' });
    loadSaveData(data.rawSave);
    const plan = buildSneakingFlowerComparison(saveData, data.capture);
    const result = compareSneakingFlowers(plan, data.options, progress => {
      if (performance.now() - last < 100 && progress.completed !== progress.total) return;
      last = performance.now();
      self.postMessage({ type: 'progress', progress });
    });
    self.postMessage({ type: 'done', result });
  } catch (error) {
    self.postMessage({ type: 'error', message: error.message || String(error) });
  }
};
