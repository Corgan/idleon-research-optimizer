// ===== SIM WORKER - Web Worker entry point (type: module) =====
// Receives state snapshots + task commands from the main thread.
// Imports from split engine modules.

import {  restoreState  } from '../state.js';
import { unifiedSim } from '../sim-engine.js';
import { optimizeShapePlacement } from '../optimizers/shapes.js';
import { computeInsightROI, computeObsUnlockPriority } from '../analysis.js';
import { buildSaveContext } from '../save/context.js';

let _baseState = null;

onmessage = async function(e) {
  const d = e.data;

  if (d.type === 'init') {
    _baseState = d.state;
    restoreState(_baseState);
    postMessage({ type: 'ready' });
    return;
  }

  if (d.type === 'runSim') {
    if (_baseState) restoreState(_baseState);
    const saveCtx = buildSaveContext();
    const simId = d.simId;
    const simProgressFn = function(sub) {
      postMessage({ type: 'simProgress', simId: simId, sub: sub });
    };
    try {
      const cfg = d.config;
      cfg.onProgress = simProgressFn;
      const result = await unifiedSim(cfg, saveCtx);
      postMessage({ type: 'simDone', simId: simId, result: result });
    } catch (err) {
      postMessage({ type: 'simError', simId: simId, message: err.message, stack: err.stack });
    }
    return;
  }

  restoreState(d.state);
  const saveCtx = buildSaveContext();
  const state = {
    gl: saveCtx.gridLevels, so: saveCtx.shapeOverlay, il: saveCtx.insightLvs,
    occ: saveCtx.occFound, rLv: saveCtx.researchLevel, mMax: saveCtx.magMaxPerSlot,
    mOwned: saveCtx.magnifiersOwned, md: saveCtx.magData, ip: saveCtx.insightProgress,
    failedRolls: saveCtx.cachedFailedRolls,
  };
  const progressFn = function(done, total, msg, detail) {
    postMessage({ type: 'progress', done: done, total: total, msg: msg, detail: detail || '' });
  };

  if (d.type === 'shapeOpt') {
    try {
      const r1 = optimizeShapePlacement(d.args.opts || {}, progressFn);
      let r2 = null;
      if (d.args.needPure) {
        r2 = optimizeShapePlacement({}, progressFn);
      }
      postMessage({ type: 'done', result: { primary: r1, pure: r2 } });
    } catch (err) {
      postMessage({ type: 'error', message: err.message, stack: err.stack });
    }
  }
  else if (d.type === 'insightROI') {
    try {
      const result = await computeInsightROI(progressFn, state, saveCtx);
      postMessage({ type: 'done', result: result });
    } catch (err) {
      postMessage({ type: 'error', message: err.message, stack: err.stack });
    }
  }
  else if (d.type === 'obsUnlock') {
    try {
      const result = await computeObsUnlockPriority(progressFn, state, saveCtx);
      postMessage({ type: 'done', result: result });
    } catch (err) {
      postMessage({ type: 'error', message: err.message, stack: err.stack });
    }
  }
};
