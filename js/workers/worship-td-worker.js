// Worship Tower Defense module worker.
// Receives { type: 'simulate' | 'trials' | 'optimize' | 'layout', id, inputs, plan, opts, seeds }
// and posts { type: 'progress' | 'done' | 'error', id, ... }.

import { simulateWorshipTdRun, simulateWorshipTdTrials, optimizeWorshipTd, optimizeWorshipTdLayout } from '../stats/systems/w3/worship-td.js';

self.onmessage = function(event) {
  var msg = event.data || {};
  var id = msg.id;
  try {
    var result;
    if (msg.type === 'simulate') {
      result = simulateWorshipTdRun(msg.inputs, msg.plan, msg.opts || {});
    } else if (msg.type === 'trials') {
      result = simulateWorshipTdTrials(msg.inputs, msg.plan, msg.opts || {}, msg.seeds || [1]);
    } else if (msg.type === 'optimize') {
      result = optimizeWorshipTd(msg.inputs, msg.opts || {}, function(p) {
        self.postMessage({ type: 'progress', id: id, phase: p.phase, completed: p.completed, total: p.total, restart: p.restart, restarts: p.restarts, bestWave: p.bestWave });
      });
    } else if (msg.type === 'layout') {
      result = optimizeWorshipTdLayout(msg.inputs, msg.opts || {}, function(p) {
        self.postMessage({ type: 'progress', id: id, phase: p.phase, completed: p.completed, total: p.total, bestWave: p.bestWave, label: p.label });
      });
    } else {
      return;
    }
    self.postMessage({ type: 'done', id: id, result: result });
  } catch (error) {
    self.postMessage({ type: 'error', id: id, message: error && error.message ? error.message : String(error) });
  }
};
