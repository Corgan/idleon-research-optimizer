import { runCombatBatch } from './combat-sim-client.js';
import { coveProgressionJobs, coveProgressionMeasurement } from '../stats/systems/w5/cglunko-progression.js';

export function runCoveProgression({ plan, signal, onProgress,
  workerFactory = () => new Worker(new URL('./cglunko-planner-worker.js', import.meta.url), { type: 'module' }),
  runBatch = runCombatBatch, concurrency = 4 }) {
  return new Promise((resolve, reject) => {
    let worker, settled = false, partial = null, fraction = 0;
    const batchController = new AbortController();
    const cleanup = () => { signal?.removeEventListener('abort', cancel); batchController.abort(); worker?.terminate(); };
    const finish = (result, error) => {
      if (settled) return;
      settled = true; cleanup();
      if (error) reject(error); else resolve(result);
    };
    function cancel() { finish({ result: partial, cancelled: true }); }
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) { cancel(); return; }
    try {
      worker = workerFactory();
      worker.onerror = event => finish(null, new Error(event.message || 'Cove planner worker failed'));
      worker.onmessageerror = () => finish(null, new Error('Could not read the Cove planner response'));
      worker.onmessage = async event => {
        const m = event.data;
        if (settled || m?.id !== 1) return;
        try {
          if (m.type === 'error') throw new Error(m.message);
          if (m.type === 'done') {
            if (!m.result?.initialMeasurement) throw new Error('Cove planner returned no income measurement');
            onProgress?.({ fraction: 1, completed: m.result.measured, total: m.result.measured });
            finish({ result: m.result, cancelled: false }); return;
          }
          if (m.type !== 'measure') return;
          if (!Array.isArray(m.states) || !m.states.length) throw new Error('Cove planner requested an empty measurement');
          partial = m.partial;
          const jobs = m.states.flatMap((state, index) => coveProgressionJobs(plan, state).map(j => ({ ...j, key: index + ':' + j.key })));
          const batch = await runBatch({
            rawSave: plan.rawSave, jobs, signal: batchController.signal, concurrency,
            onProgress: p => {
              if (settled) return;
              fraction = Math.max(fraction, (m.completed + m.states.length * p.fraction) / m.total);
              onProgress?.({ fraction, completed: m.completed + p.completed / plan.seeds.length, total: m.total });
            },
          });
          if (settled) return;
          if (batch.cancelled) { cancel(); return; }
          const measurements = m.states.map((state, index) =>
            coveProgressionMeasurement(plan, state, batch.results.filter(r => r.job.key.startsWith(index + ':'))));
          worker.postMessage({ type: 'resume', id: 1, measurements });
        } catch (error) { finish(null, error); }
      };
      worker.postMessage({ type: 'start', id: 1, plan });
    } catch (error) { finish(null, error); }
  });
}
