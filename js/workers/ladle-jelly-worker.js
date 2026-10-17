import { optimizeBlueJellyfish } from '../stats/systems/w4/cooking-ladle.js';

self.onmessage = function(event) {
  try {
    var last = 0;
    var result = optimizeBlueJellyfish(event.data.save, event.data.options, function(progress) {
      var now = performance.now();
      if (now - last < 100 && progress.fraction < 1) return;
      last = now;
      self.postMessage({ type: 'progress', progress: progress });
    });
    self.postMessage({ type: 'done', result: result });
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};
