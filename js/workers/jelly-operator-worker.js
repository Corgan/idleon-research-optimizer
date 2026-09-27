import {
  certifyJellyLocalOptimality,
  certifyJellyMoveNeighborhood,
  enumerateJellyLayoutsExact,
  optimizeJellyLayout,
  optimizeJellyOperationPolicy,
  planJellySections,
  planJellyUpgradePurchases,
  simulateJellyPairedAudit,
  simulateJellyOperation,
} from '../stats/systems/w7/jelly-operator.js';

const operations = {
  certify: message => enumerateJellyLayoutsExact(message.saveData, message.options),
  certifyLocal: message => certifyJellyLocalOptimality(message.layout, message.saveData, message.options),
  certifyMoves: message => certifyJellyMoveNeighborhood(message.layout, message.saveData, message.options),
  policy: message => optimizeJellyOperationPolicy(message.layout, message.saveData, message.options),
  layout: message => optimizeJellyLayout(message.saveData, message.options),
  sections: message => planJellySections(message.saveData, message.options),
  purchases: message => planJellyUpgradePurchases(message.saveData, message.options),
  audit: message => simulateJellyPairedAudit(
    message.candidateLayout,
    message.baselineLayout,
    message.saveData,
    message.options
  ),
  simulate: message => simulateJellyOperation(message.layout, message.saveData, message.options),
};

let cachedSaveData = null;
let cachedBaseLayout = null;
function unpackLayout(packed) {
  if (!packed) return null;
  const values = packed instanceof Int16Array ? packed : new Int16Array(packed);
  const layout = {};
  for (let index = 0; index + 1 < values.length; index += 2) layout[values[index]] = values[index + 1];
  return layout;
}
function packLayout(layout) {
  const entries = Object.entries(layout || {})
    .map(([anchor, type]) => [Number(anchor), Number(type)])
    .sort((a, b) => a[0] - b[0]);
  const packed = new Int16Array(entries.length * 2);
  for (let index = 0; index < entries.length; index++) {
    packed[index * 2] = entries[index][0];
    packed[index * 2 + 1] = entries[index][1];
  }
  return packed;
}
self.onmessage = event => {
  const message = event.data || {};
  if (message.type === 'initialize') {
    cachedSaveData = message.saveData || null;
    cachedBaseLayout = unpackLayout(message.packedLayout);
    self.postMessage({ type: 'initialized', requestId: message.requestId });
    return;
  }
  if (message.type !== 'run') return;
  const operation = operations[message.operation];
  if (!operation) {
    self.postMessage({ type: 'error', requestId: message.requestId, error: `Unknown Jelly operation: ${message.operation}` });
    return;
  }
  let lastProgressAt = 0;
  const onProgress = progress => {
    const now = Date.now();
    const complete = Number(progress.completed) >= Number(progress.total);
    if (!complete && now - lastProgressAt < 50) return;
    lastProgressAt = now;
    if (progress.bestSoFar?.layout) {
      const packedBestLayout = packLayout(progress.bestSoFar.layout);
      self.postMessage({
        type: 'progress',
        requestId: message.requestId,
        progress: {
          ...progress,
          bestSoFar: {
            ...progress.bestSoFar,
            layout: undefined,
            packedLayout: packedBestLayout,
          },
        },
      }, [packedBestLayout.buffer]);
      return;
    }
    self.postMessage({ type: 'progress', requestId: message.requestId, progress });
  };
  try {
    if (message.saveData) cachedSaveData = message.saveData;
    if (!message.saveData && cachedSaveData) message.saveData = cachedSaveData;
    if (!message.saveData) throw new Error('Jelly worker has no initialized save data');
    if (!message.options?.layout && cachedBaseLayout) {
      message.options = { ...(message.options || {}), layout: cachedBaseLayout };
    }
    const result = operation({
      ...message,
      options: { ...(message.options || {}), onProgress },
    });
    self.postMessage({ type: 'done', requestId: message.requestId, result });
  } catch (error) {
    self.postMessage({
      type: 'error',
      requestId: message.requestId,
      error: String(error?.message || error),
    });
  }
};
