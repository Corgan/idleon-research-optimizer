// Sailing pile simulation module worker.
// Receives { type: 'run', config } and posts progress/done/error messages.

import { runSailingPileSimulation } from '../stats/systems/w5/sailing-sim.js';

self.onmessage = function(event) {
  var message = event.data || {};
  if (message.type !== 'run') return;
  try {
    var result = runSailingPileSimulation(message.config, function(done, total) {
      self.postMessage({ type: 'progress', done: done, total: total });
    });
    self.postMessage({ type: 'done', result: result });
  } catch (error) {
    self.postMessage({ type: 'error', message: error && error.message ? error.message : String(error) });
  }
};