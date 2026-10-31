import { evaluatePrismaCauldron } from '../stats/prisma-evaluator.js';

let queue = Promise.resolve();
self.onmessage = ({ data }) => {
  queue = queue.then(async () => {
    try {
      const result = await evaluatePrismaCauldron(data.raw, data.options,
        progress => self.postMessage({ id: data.id, ...progress }));
      self.postMessage({ id: data.id, type: 'done', completed: result.results.length });
    } catch (error) {
      self.postMessage({ id: data.id, type: 'error', error: error.message || String(error) });
    }
  });
};
