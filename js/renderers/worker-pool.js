// ===== worker-pool.js - Web Worker task runner + parallel optimizer =====
// Extracted from app.js. ES module.

import {  assignState, snapshotState  } from '../state.js';
import {
  SHAPE_VERTICES,
} from '../game-data.js';
import {
  computeGridPointsEarned,
} from '../sim-math.js';
import {
  buildSaveContext,
  computeGridPointsAvailable,
  computeShapesOwned,
  makeCtx,
  simTotalExp,
} from '../save/context.js';
import {
  buildCoverageLUT,
} from '../optimizers/shapes-geo.js';
import {
  enumGridCombos,
  expandSpendable,
} from '../optimizers/grid-spend.js';

// ===== WEB WORKER HELPERS =====
const _workerTasks = {}; // key → { worker, reject }

export function cancelWorkerTask(key) {
  const t = _workerTasks[key];
  if (!t) return;
  t.worker.terminate();
  if (t.reject) t.reject(new Error('Cancelled'));
  delete _workerTasks[key];
}

export function runWorkerTask(key, type, extra, progressCb) {
  cancelWorkerTask(key);
  return new Promise(function(resolve, reject) {
    let w;
    try { w = _createOptWorker(); }
    catch(e) { reject(e); return; }
    _workerTasks[key] = { worker: w, reject: reject };
    w.onmessage = function(ev) {
      const d = ev.data;
      if (d.type === 'progress' && progressCb) {
        progressCb(d.done, d.total, d.msg, d.detail);
      } else if (d.type === 'done') {
        delete _workerTasks[key];
        w.terminate();
        resolve(d.result);
      } else if (d.type === 'error') {
        delete _workerTasks[key];
        w.terminate();
        reject(new Error(d.message));
      }
    };
    w.onerror = function(ev) {
      delete _workerTasks[key];
      w.terminate();
      reject(new Error(ev.message));
    };
    const msg = { type: type, state: _snapshotState() };
    if (extra) Object.assign(msg, extra);
    w.postMessage(msg);
  });
}

function _snapshotState() {
  // Eagerly build coverage LUT if not yet cached, so workers receive it pre-built
  const saveCtx = buildSaveContext();
  const numShapes = Math.min(computeShapesOwned(saveCtx.researchLevel, saveCtx.gridLevels, saveCtx), SHAPE_VERTICES.length);
  if (saveCtx.covLUTCacheN !== numShapes && numShapes > 0) {
    assignState({ _covLUTCache: buildCoverageLUT(numShapes), _covLUTCacheN: numShapes });
  }
  return snapshotState();
}

function _createOptWorker() {
  return new Worker('./js/workers/sim-worker.js', { type: 'module' });
}

export function cancelOptimizer() {
  if (_optWorkerPool) { _optWorkerPool.terminate(); _optWorkerPool = null; }
}

// ===== PARALLEL WORKER POOL =====
let _optWorkerPool = null;
let _optReject = null;

function _createSimWorkerPool(snapshot, poolSize, onSimProgress) {
  const workers = [];
  const idle = [];
  const queue = []; // { simId, config, resolve, reject }
  let readyCount = 0;
  let terminated = false;
  let _readyResolve = null;
  const readyPromise = new Promise(function(r) { _readyResolve = r; });

  for (let i = 0; i < poolSize; i++) {
    const w = _createOptWorker();
    w._currentTask = null;
    w._wIdx = i;
    w.onmessage = function(ev) {
      if (terminated) return;
      const d = ev.data;
      if (d.type === 'ready') {
        readyCount++;
        idle.push(w);
        if (readyCount === poolSize && _readyResolve) { _readyResolve(); _readyResolve = null; }
        return;
      }
      if (d.type === 'simDone' && w._currentTask) {
        const task = w._currentTask;
        w._currentTask = null;
        idle.push(w);
        task.resolve(d.result);
        _pumpQueue();
        return;
      }
      if (d.type === 'simError' && w._currentTask) {
        const task = w._currentTask;
        w._currentTask = null;
        idle.push(w);
        task.reject(new Error(d.message));
        _pumpQueue();
        return;
      }
      if (d.type === 'simProgress' && onSimProgress) {
        onSimProgress(d.simId, d.sub, w._wIdx);
      }
    };
    w.onerror = function(ev) {
      if (w._currentTask) {
        const task = w._currentTask;
        w._currentTask = null;
        task.reject(new Error(ev.message));
      }
    };
    w.postMessage({ type: 'init', state: snapshot });
    workers.push(w);
  }

  function _pumpQueue() {
    while (idle.length > 0 && queue.length > 0) {
      const w = idle.shift();
      const task = queue.shift();
      w._currentTask = task;
      w.postMessage({ type: 'runSim', simId: task.simId, config: task.config });
    }
  }

  return {
    ready: readyPromise,
    runSim: function(simId, config) {
      if (terminated) return Promise.reject(new Error('Cancelled'));
      return new Promise(function(resolve, reject) {
        queue.push({ simId: simId, config: config, resolve: resolve, reject: reject });
        _pumpQueue();
      });
    },
    terminate: function() {
      terminated = true;
      while (queue.length > 0) { queue.shift().reject(new Error('Cancelled')); }
      for (const w of workers) {
        if (w._currentTask) { w._currentTask.reject(new Error('Cancelled')); w._currentTask = null; }
        w.terminate();
      }
      workers.length = 0;
      idle.length = 0;
    },
    size: poolSize
  };
}

export async function runParallelOptimizer(target, progressCb, opts) {
  const assumeObs = !!(opts && opts.assumeObs);
  const extendInsightLA = !!(opts && opts.extendInsightLA);
  const snapshot = _snapshotState();
  const _saveCtx = buildSaveContext();
  const poolSize = Math.max(1, Math.min((navigator.hardwareConcurrency || 4) - 1, 8));

  // Formatting helpers (main-thread copies)
  function _fmtR(n) {
    if (n >= 1e12) return (n/1e12).toFixed(1) + 'T/hr';
    if (n >= 1e9) return (n/1e9).toFixed(1) + 'B/hr';
    if (n >= 1e6) return (n/1e6).toFixed(1) + 'M/hr';
    if (n >= 1e3) return (n/1e3).toFixed(1) + 'K/hr';
    return n.toFixed(0) + '/hr';
  }
  function _fmtHrs(h) {
    if (h < 1) return Math.round(h * 60) + 'm';
    if (h < 24) return h.toFixed(1) + 'h';
    return Math.floor(h / 24) + 'd ' + Math.round(h % 24) + 'h';
  }

  // Progress tracking
  let completedSims = 0;
  let totalEstSims = 1;
  let currentStage = 'Initializing';
  const workerSubs = new Array(poolSize).fill(null);

  function _reportProgress() {
    if (!progressCb) return;
    // Bar fill: target-oriented (levels or hours) from best worker
    let barPct;
    if (target.type === 'level') {
      let bestLv = _saveCtx.researchLevel;
      for (const sub of workerSubs) {
        if (sub && sub.rLv != null && sub.rLv > bestLv) bestLv = sub.rLv;
      }
      const span = target.value - _saveCtx.researchLevel;
      barPct = span > 0 ? Math.min((bestLv - _saveCtx.researchLevel) / span, 0.999) : 0;
    } else {
      let bestTime = 0;
      for (const sub of workerSubs) {
        if (sub && sub.currentTime > 0 && sub.currentTime > bestTime) bestTime = sub.currentTime;
      }
      barPct = target.value > 0 ? Math.min(bestTime / target.value, 0.999) : 0;
    }
    // Status text: original detailed format
    const msg = currentStage + ' \u2014 ' + completedSims + '/' + totalEstSims + (poolSize > 1 ? ' (' + poolSize + '\u00D7 parallel)' : '');
    // Per-worker detail: only show if multiple workers are active
    const lines = [];
    for (let wi = 0; wi < poolSize; wi++) {
      const sub = workerSubs[wi];
      if (!sub) continue;
      let line = 'W' + (wi + 1) + ': ';
      if (sub.rLv != null) {
        line += 'Lv ' + sub.rLv + ' | ' + _fmtR(sub.expHr || 0);
        if (sub.currentTime > 0) line += ' | ' + _fmtHrs(sub.currentTime);
      } else if (sub.subStage) {
        line += sub.subStage;
      } else {
        line += 'starting\u2026';
      }
      lines.push(line);
    }
    // If only 1 worker is active, show its status inline (no "W1:" prefix)
    let detail;
    if (lines.length === 1) {
      const sub = workerSubs.find(s => s != null);
      if (sub && sub.rLv != null) {
        detail = 'Lv ' + sub.rLv + ' | ' + _fmtR(sub.expHr || 0) + (sub.currentTime > 0 ? ' | ' + _fmtHrs(sub.currentTime) : '');
      } else if (sub && sub.subStage) {
        detail = sub.subStage;
      } else {
        detail = '';
      }
    } else {
      detail = lines.join('\n');
    }
    progressCb(Math.floor(barPct * 1000), 1000, msg, detail);
  }

  // Create pool
  const pool = _createSimWorkerPool(snapshot, poolSize, function(simId, sub, wIdx) {
    workerSubs[wIdx] = sub;
    _reportProgress();
  });
  _optWorkerPool = pool;
  _optReject = function() { pool.terminate(); };

  try {
    await pool.ready;

    const preOptRate = simTotalExp({ gridLevels: _saveCtx.gridLevels, shapeOverlay: _saveCtx.shapeOverlay, magData: _saveCtx.magData, insightLvs: _saveCtx.insightLvs, occFound: _saveCtx.occFound, researchLevel: _saveCtx.researchLevel }, _saveCtx).total;

    const availPts = computeGridPointsAvailable(_saveCtx.researchLevel, _saveCtx.gridLevels, _saveCtx.cachedSpelunkyUpg7);
    const futureEarned = target.type === 'level'
      ? Math.max(0, computeGridPointsEarned(target.value, _saveCtx.cachedSpelunkyUpg7) - computeGridPointsEarned(_saveCtx.researchLevel, _saveCtx.cachedSpelunkyUpg7))
      : Math.max(0, computeGridPointsEarned(_saveCtx.researchLevel + 20, _saveCtx.cachedSpelunkyUpg7) - computeGridPointsEarned(_saveCtx.researchLevel, _saveCtx.cachedSpelunkyUpg7));
    console.log('[Optimizer] availPts:', availPts, '| futureEarned:', futureEarned);

    if (availPts <= 0) {
      // No points to spend now - run one sim (future points handled per level-up)
      currentStage = 'Simulating';
      _reportProgress();
      const sim = await pool.runSim(0, {
        target: target, reoptimize: true, preOptExpHr: preOptRate,
        assumeObsUnlocked: assumeObs, extendInsightLA: extendInsightLA
      });
      if (progressCb) progressCb(1000, 1000, 'Simulation complete');
      pool.terminate(); _optWorkerPool = null;
      return { best: sim, paths: [{ steps: [], sim: sim }], bestSteps: [], preOptRate: preOptRate };
    }

    // Expand spendable set - only EXP-relevant nodes + gateways (only currently-available points)
    const expandResult = expandSpendable(_saveCtx.gridLevels, availPts, _saveCtx.shapeOverlay, _saveCtx.magData, _saveCtx.insightLvs, _saveCtx.occFound, _saveCtx.researchLevel, makeCtx(_saveCtx.gridLevels, _saveCtx));
    const spendable = expandResult.spendable;
    const freePoints = expandResult.freePoints;
    const freeNotice = expandResult.notice;
    console.log('[Optimizer] EXP-relevant spendable:', spendable.length, 'squares | freePoints:', freePoints);

    if (spendable.length === 0) {
      currentStage = 'Simulating';
      _reportProgress();
      const sim = await pool.runSim(0, {
        target: target, reoptimize: true, preOptExpHr: preOptRate,
        assumeObsUnlocked: assumeObs, extendInsightLA: extendInsightLA
      });
      const msg = freeNotice || 'No upgradeable grid points found.';
      if (progressCb) progressCb(1000, 1000, msg);
      pool.terminate(); _optWorkerPool = null;
      return { best: sim, paths: [{ steps: [], sim: sim }], bestSteps: [], preOptRate: preOptRate, notice: msg, freePoints: availPts };
    }

    // Only distribute currently-available points; future-earned handled by mid-sim branching
    const usefulPoints = Math.min(availPts, availPts - freePoints);
    const combos = enumGridCombos(spendable, _saveCtx.gridLevels, usefulPoints);
    console.log('[Optimizer] Exhaustive combos:', combos.length, '(' + usefulPoints + ' useful points across ' + spendable.length + ' EXP-relevant squares)');

    totalEstSims = combos.length;
    currentStage = 'Testing ' + combos.length + ' combination' + (combos.length > 1 ? 's' : '');
    _reportProgress();

    // Dispatch ALL combos to worker pool in parallel
    const comboPromises = combos.map(function(combo, ci) {
      const simId = ci;
      return pool.runSim(simId, {
        target: target, reoptimize: true, gridLevels: combo.gl, preOptExpHr: preOptRate,
        assumeObsUnlocked: assumeObs, extendInsightLA: extendInsightLA
      }).then(function(sim) {
        completedSims++;
        _reportProgress();
        return { steps: combo.steps, sim: sim, time: sim.totalTime, gl: combo.gl };
      });
    });

    const allPaths = await Promise.all(comboPromises);
    workerSubs.fill(null);

    allPaths.sort(function(a, b) {
      if (target.type === 'level') return a.time - b.time;
      if (b.sim.finalLevel !== a.sim.finalLevel) return b.sim.finalLevel - a.sim.finalLevel;
      return b.sim.finalExp - a.sim.finalExp;
    });

    const best = allPaths[0];
    const worst = allPaths[allPaths.length - 1];

    let doneMsg = 'Optimization complete! (' + combos.length + ' combos tested)';
    if (freeNotice) doneMsg += ' \u2014 ' + freeNotice;
    if (progressCb) progressCb(1000, 1000, doneMsg);
    pool.terminate(); _optWorkerPool = null; _optReject = null;
    return {
      best: best.sim,
      worst: worst.sim,
      paths: allPaths.slice(0, 10),
      bestSteps: best.steps,
      preOptRate: preOptRate,
      insightLAExtension: best.sim.insightLAExtension || 0,
      notice: freeNotice,
      freePoints: freePoints
    };
  } catch(err) {
    pool.terminate(); _optWorkerPool = null; _optReject = null;
    throw err;
  }
}
