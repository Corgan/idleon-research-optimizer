import {
  certifyJellyLocalOptimality,
  certifyJellyMoveNeighborhood,
  createJellyMeasurementCache,
  createJellyPolicyCache,
  createJellyLayoutSearch,
  jellyLayoutKey,
  enumerateJellyLayoutsExact,
  optimizeJellyLayout,
  optimizeJellyOperationPolicy,
  planJellySections,
  planJellyUpgradePurchases,
  simulateJellyPairedAudit,
  simulateJellyOperation,
  simulateJellyTrialBlock,
  simulateJellyPolicyGroup,
  mergeJellyTrialBlocks,
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
  trialBlock: message => simulateJellyTrialBlock(message.layout, message.saveData, message.options),
  policyScreen: message => simulateJellyPolicyGroup(message.layout, message.saveData, message.options),
};

let cachedSaveData = null;
let cachedBaseLayout = null;
let cachedMeasurements = null;
let cachedMeasurementContext = '';
let cachedMeasurementScope = null;
let cachedPolicies = null;
let cachedPolicyScope = null;
let continuation = null;
let trialRequestId = 0;
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
    continuation = null;
    cachedSaveData = message.saveData || null;
    cachedBaseLayout = unpackLayout(message.packedLayout);
    cachedMeasurements = null;
    cachedMeasurementContext = message.measurementScope || '';
    cachedMeasurementScope = null;
    cachedPolicies = null;
    cachedPolicyScope = null;
    self.postMessage({ type: 'initialized', requestId: message.requestId });
    return;
  }
  if (message.type === 'resume') {
    try {
      if (!continuation || message.requestId !== continuation.requestId
        || message.trialRequestId !== continuation.trialRequestId) throw new Error('Stale Jelly trial continuation');
      const waiting = continuation.waiting;
      if (message.policyMeasurements) {
        if (!cachedPolicies) throw new Error('Jelly policy cache is not initialized');
        cachedPolicies.merge(message.policyMeasurements);
      }
      const screening = waiting.kind === 'policyScreen';
      const result = message.result || (screening ? null : mergeJellyTrialBlocks(message.blocks, waiting.options));
      if (!result || result.trials !== waiting.options.trials || result.seed !== waiting.options.seed
        || (screening ? result.measurements?.length !== waiting.policies.length
          : waiting.options.includeTrials && !result.results)) throw new Error('Mismatched Jelly trial summary');
      if (!screening && !waiting.options.includeTrials && result.valid) {
        self.postMessage({
          type: 'trialSummary', requestId: message.requestId,
          key: JSON.stringify([jellyLayoutKey(waiting.layout), waiting.options]), result,
        });
      }
      continuation.advance(result);
    } catch (error) {
      continuation = null;
      self.postMessage({ type: 'error', requestId: message.requestId, error: String(error?.message || error) });
    }
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
    if (message.saveData && message.saveData !== cachedSaveData) {
      cachedSaveData = message.saveData;
      cachedMeasurements = null;
      cachedMeasurementContext = message.measurementScope || '';
      cachedMeasurementScope = null;
      cachedPolicies = null;
      cachedPolicyScope = null;
    }
    if (!message.saveData && cachedSaveData) message.saveData = cachedSaveData;
    if (!message.saveData) throw new Error('Jelly worker has no initialized save data');
    if (!message.options?.layout && cachedBaseLayout) {
      message.options = { ...(message.options || {}), layout: cachedBaseLayout };
    }
    if (message.options?.sharedEliteLayouts) {
      message.options = {
        ...message.options,
        sharedEliteLayouts: message.options.sharedEliteLayouts.map(row => (
          row.packedLayout ? { ...row, layout: unpackLayout(row.packedLayout), packedLayout: undefined } : row
        )),
      };
    }
    const shareMeasurements = message.operation === 'layout' && message.options?.measurementSharing !== false;
    const measurementScope = `${cachedMeasurementContext}|${Math.floor(Number(message.options?.seed) || 1)}`;
    if (shareMeasurements && cachedMeasurementScope !== measurementScope) {
      cachedMeasurements = createJellyMeasurementCache({ scope: measurementScope });
      cachedMeasurementScope = measurementScope;
    }
    const measurementStatsBefore = cachedMeasurements?.diagnostics();
    if (shareMeasurements && message.measurements) cachedMeasurements.merge(message.measurements);
    const sharePolicies = message.operation === 'layout' && message.options?.policyReuse !== false;
    if (sharePolicies && cachedPolicyScope !== measurementScope) {
      cachedPolicies = createJellyPolicyCache({ scope: `${measurementScope}|policies` });
      cachedPolicyScope = measurementScope;
    }
    const policyStatsBefore = cachedPolicies?.diagnostics();
    if (sharePolicies && message.policyMeasurements) cachedPolicies.merge(message.policyMeasurements);
    const resolvedMessage = {
      ...message,
      options: {
        ...(message.options || {}), _measurementCache: shareMeasurements ? cachedMeasurements : null,
        _policyCache: sharePolicies ? cachedPolicies : null,
        _onPolicyComplete: sharePolicies ? (key, result, priority) => self.postMessage({
          type: 'policySummary', requestId: message.requestId, key, result, priority,
        }) : undefined,
        onProgress,
      },
    };
    const complete = result => {
      if (shareMeasurements && result.search) {
        const stats = cachedMeasurements.diagnostics();
        result.search.measurements = {
          ...stats, hits: stats.hits - measurementStatsBefore.hits,
          imported: stats.imported - measurementStatsBefore.imported,
        };
      }
      if (sharePolicies && result.search) {
        const stats = cachedPolicies.diagnostics();
        result.search.policyReuse = {
          ...stats, hits: stats.hits - policyStatsBefore.hits,
          misses: stats.misses - policyStatsBefore.misses,
          warmStarts: stats.warmStarts - policyStatsBefore.warmStarts,
        };
      }
      self.postMessage({
        type: 'done', requestId: message.requestId, blockId: message.blockId, result,
        measurements: shareMeasurements ? cachedMeasurements.export() : undefined,
        policyMeasurements: sharePolicies ? cachedPolicies.export() : undefined,
      });
    };
    if (message.operation === 'layout' && message.cooperativeTrials) {
      if (continuation) throw new Error('Jelly worker already owns a suspended search');
      const search = createJellyLayoutSearch(message.saveData, {
        ...resolvedMessage.options, _cooperativeTrials: true,
      });
      continuation = {
        requestId: message.requestId,
        advance(value) {
          const step = search.next(value);
          if (step.done) { continuation = null; complete(step.value); return; }
          this.waiting = step.value;
          this.trialRequestId = ++trialRequestId;
          self.postMessage({
            type: 'trials', requestId: message.requestId, trialRequestId: this.trialRequestId,
            kind: step.value.kind, layout: step.value.layout, options: step.value.options,
            policies: step.value.policies,
          });
        },
      };
      continuation.advance();
    } else complete(operation(resolvedMessage));
  } catch (error) {
    continuation = null;
    self.postMessage({
      type: 'error',
      requestId: message.requestId,
      error: String(error?.message || error),
    });
  }
};
