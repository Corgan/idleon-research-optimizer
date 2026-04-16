// Web Worker for cog board optimization.
// Runs the sync optimizer off the main thread so the UI stays responsive.

import { optimize } from './cog-optimizer.js';

self.onmessage = function(e) {
  var d = e.data;
  var result = optimize(d.board, d.shelfCogs, d.playerCogs, d.goal, {
    iterations: d.iterations || 500000,
    onProgress: function(p) {
      self.postMessage({ type: 'progress', iter: p.iter, score: p.score, best: p.best });
    },
    onPhase: function(p) {
      self.postMessage({ type: 'phase', phase: p.phase, label: p.label, progress: p.progress });
    }
  });
  self.postMessage({ type: 'done', result: result });
};
