// Minehead Monte Carlo Web Worker
// Receives tasks:
//   { type: 'mc', id, floor, upgLevels, params, nTrials, seed }
//   { type: 'optimize', id, floor, upgLevels, params, nTrials, seed }
// Posts back: { type: 'done', id, result [, params] }
// Also handles: { type: 'ping' } → { type: 'pong' }

import { monteCarloFloor, tunableStrategy, evaluateTunableParams } from '../minehead/sim.js';

onmessage = function(e) {
  const d = e.data;

  if (d.type === 'ping') {
    postMessage({ type: 'pong' });
    return;
  }

  if (d.type === 'mc') {
    try {
      const strat = tunableStrategy(d.params || {});
      const result = monteCarloFloor({
        floor: d.floor,
        upgLevels: d.upgLevels,
        strategy: strat,
        nTrials: d.nTrials,
        seed: d.seed,
        svarHP: d.svarHP || 1,
        maxTurns: d.maxTurns || 200,
        mineReduction: d.mineReduction || 0,
      });
      postMessage({ type: 'done', id: d.id, result });
    } catch (err) {
      postMessage({ type: 'error', id: d.id, message: err.message });
    }
    return;
  }

  if (d.type === 'optimize') {
    try {
      const result = evaluateTunableParams({
        params: d.params,
        floor: d.floor,
        upgLevels: d.upgLevels,
        nTrials: d.nTrials,
        seed: d.seed,
        svarHP: d.svarHP || 1,
        maxTurns: d.maxTurns || 200,
      });
      postMessage({ type: 'done', id: d.id, result, params: d.params });
    } catch (err) {
      postMessage({ type: 'error', id: d.id, message: err.message });
    }
    return;
  }
};
