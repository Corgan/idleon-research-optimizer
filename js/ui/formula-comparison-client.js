import { compareFormulaSnapshots, formulaSnapshot } from '../stats/formula-comparison.js';

export function createFormulaComparisonClient() {
  let worker = null, snapshot = null, nextId = 0, failure = null;
  const pending = new Map(), cached = new Map();
  function fail(error) {
    failure = error;
    worker?.terminate(); worker = null;
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  }
  return {
    reset(next) {
      worker?.terminate(); worker = null; snapshot = next; failure = null;
      for (const request of pending.values()) request.resolve(null);
      pending.clear(); cached.clear();
    },
    load(target, root) {
      if (!snapshot?.edits.length) return Promise.resolve(null);
      if (failure) return Promise.reject(failure);
      const key = JSON.stringify(target);
      if (!cached.has(key) && cached.size >= 16) cached.delete(cached.keys().next().value);
      if (!cached.has(key)) cached.set(key, new Promise((resolve, reject) => {
        try {
          if (!worker) {
            worker = new Worker(new URL('../workers/formula-comparison-worker.js', import.meta.url), { type: 'module' });
            worker.onmessage = ({ data }) => {
              const request = pending.get(data.id);
              if (!request) return;
              pending.delete(data.id);
              if (data.error) request.reject(new Error(data.error));
              else request.resolve(data.result);
            };
            worker.onerror = event => fail(new Error(event.message || 'Formula comparison worker failed.'));
            worker.onmessageerror = () => fail(new Error('Formula comparison worker returned unreadable data.'));
            worker.postMessage({ type: 'init', snapshot });
          }
          const id = ++nextId;
          pending.set(id, { resolve, reject });
          worker.postMessage({ id, target });
        } catch (error) { fail(error); reject(error); }
      }));
      return cached.get(key).then(result => {
        if (!result) return null;
        const current = formulaSnapshot(root);
        const measured = new Map(result.current.map(entry => [entry.key, entry]));
        if (current.length !== result.current.length || current.some(entry => {
          const other = measured.get(entry.key);
          return !other || !Object.is(entry.val, other.val) || entry.unavailable !== other.unavailable
            || entry.notApplicable !== other.notApplicable || entry.partial !== other.partial || entry.nonNumeric !== other.nonNumeric;
        })) throw new Error('Comparison context differs from the displayed formula; no attribution was applied.');
        return compareFormulaSnapshots(current, result.baseline, result.variants);
      });
    },
  };
}
