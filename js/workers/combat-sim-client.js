// Bounded, recording-free batches over the existing active-combat worker.
export async function runCombatBatch({
  rawSave, jobs, concurrency = 2, signal, onProgress, onResult,
  workerFactory = () => new Worker(new URL('./combat-sim-worker.js', import.meta.url), { type: 'module' }),
}) {
  if (!rawSave || typeof rawSave !== 'object') throw new Error('A raw save is required');
  if (!Array.isArray(jobs) || !jobs.length) throw new Error('At least one combat job is required');
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4) throw new Error('Use one to four combat workers');
  const captured = structuredClone({ rawSave, jobs });
  for (const job of captured.jobs) {
    if (!Number.isInteger(job.charIdx) || job.charIdx < 0 || !Number.isInteger(job.mapIdx) || job.mapIdx < 0
      || !Number.isFinite(job.seconds) || job.seconds <= 0 || job.seconds > 86400
      || !Number.isInteger(job.seed) || job.seed < 1 || job.seed > 0xffffffff) {
      throw new Error('Combat jobs need valid character, map, duration and nonzero 32-bit seed');
    }
    if (job.rawSave !== undefined) throw new Error('Batch jobs must use the captured batch save');
  }
  return new Promise((resolve, reject) => {
    const slots = [], results = [];
    let next = 0, settled = false;
    const cleanup = () => {
      signal?.removeEventListener('abort', cancel);
      for (const slot of slots) slot.worker.terminate();
    };
    const fail = error => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const report = () => onProgress?.({
      completed: results.length, total: captured.jobs.length,
      fraction: (results.length + slots.reduce((n, s) => n + (s.index == null ? 0 : s.fraction), 0)) / captured.jobs.length,
    });
    const finish = cancelled => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ results: results.sort((a, b) => a.index - b.index), cancelled, total: captured.jobs.length });
    };
    function cancel() { finish(true); }
    const dispatch = slot => {
      if (settled || next >= captured.jobs.length) return;
      slot.index = next++;
      slot.fraction = 0;
      slot.worker.postMessage({
        ...captured.jobs[slot.index], type: 'run', id: slot.index,
        player: captured.jobs[slot.index].player || 'auto',
        lite: true, telemetry: false, maxSnapshots: 0, encodeReplay: false,
        eventLogMax: 0, timelineEveryMs: Number.MAX_SAFE_INTEGER, progressEveryMs: 1000,
        inputStatus: true,
      });
    };
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) { cancel(); return; }
    try {
      for (let i = 0; i < Math.min(concurrency, captured.jobs.length); i++) {
        const worker = workerFactory();
        const slot = { worker, index: null, fraction: 0 };
        slots.push(slot);
        worker.onerror = event => fail(new Error(event.message || 'Combat worker failed to load or run'));
        worker.onmessageerror = () => fail(new Error('Could not read a combat worker response'));
        worker.onmessage = event => {
          if (settled || slot.index == null) return;
          const message = event.data;
          if (!message || message.id !== slot.index) return;
          try {
            if (message.type === 'progress') {
              if (Number.isFinite(message.pct)) slot.fraction = Math.max(slot.fraction, Math.min(0.999, Math.max(0, message.pct)));
              report();
              return;
            }
            if (message.type !== 'done' && message.type !== 'error') return;
            const job = captured.jobs[slot.index];
            const error = message.type === 'error' ? message.message || 'Combat simulation failed'
              : message.cancelled ? 'Combat run ended unexpectedly as cancelled'
              : !message.summary || !Number.isFinite(message.timeMs) || message.timeMs <= 0 ? 'Combat worker returned an empty or invalid result' : null;
            const record = { index: slot.index, job, result: error ? null : message, error };
            results.push(record);
            slot.index = null;
            slot.fraction = 0;
            onResult?.(record);
            if (settled) return;
            report();
            if (results.length === captured.jobs.length) finish(false);
            else dispatch(slot);
          } catch (error) { fail(error); }
        };
        worker.postMessage({ type: 'load', rawSave: captured.rawSave });
      }
      for (const slot of slots) dispatch(slot);
      report();
    } catch (error) { fail(error); }
  });
}
