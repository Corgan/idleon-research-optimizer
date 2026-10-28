import { loadSaveData } from '../save/loader.js';
import { saveData } from '../state.js';
import { optimizeSneakingLoadout } from '../stats/systems/w6/sneaking-loadout-search.js';

self.onmessage = ({ data }) => {
  let last = 0;
  try {
    loadSaveData(data.rawSave);
    const result = optimizeSneakingLoadout(saveData, data.options, progress => {
      if (performance.now() - last < 100) return;
      last = performance.now();
      self.postMessage({ type: 'progress', progress });
    });
    result.names = Array.from({ length: saveData.charNames?.length || saveData.lv0AllData?.length || 0 },
      (_, i) => saveData.charNames?.[i] || 'Twin ' + (i + 1));
    self.postMessage({ type: 'done', result });
  } catch (error) {
    self.postMessage({ type: 'error', message: error.message || String(error) });
  }
};
