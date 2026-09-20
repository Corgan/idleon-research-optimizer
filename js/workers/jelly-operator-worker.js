import {
  optimizeJellyLayout,
  optimizeJellyOperationPolicy,
  planJellySections,
  planJellyUpgradePurchases,
  simulateJellyOperation,
} from '../stats/systems/w7/jelly-operator.js';

const operations = {
  policy: message => optimizeJellyOperationPolicy(message.layout, message.saveData, message.options),
  layout: message => optimizeJellyLayout(message.saveData, message.options),
  sections: message => planJellySections(message.saveData, message.options),
  purchases: message => planJellyUpgradePurchases(message.saveData, message.options),
  simulate: message => simulateJellyOperation(message.layout, message.saveData, message.options),
};

self.onmessage = event => {
  const message = event.data || {};
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
    self.postMessage({ type: 'progress', requestId: message.requestId, progress });
  };
  try {
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
