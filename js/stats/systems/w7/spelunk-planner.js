// ===== SPELUNKING STRATEGY COMPARISONS (W7) =====
import { normalizeSpelunkConfig, SPELUNK_POLICIES } from './spelunk-expedition.js';

export const SPELUNK_OBJECTIVES = ['depth', 'amber', 'amber-per-stamina', 'sustainable-amber', 'grand'];
function _mean(values) { return values.reduce((a, b) => a + b, 0) / values.length; }
function _seed(seed, index, final) { return ((seed >>> 0) + Math.imul(index + 1, 0x9e3779b9) + (final ? 0x4f1bbcdc : 0)) >>> 0; }
function _count(value, fallback, lo, hi, name) {
  const n = value ?? fallback;
  if (!Number.isInteger(n) || n < lo || n > hi) throw new Error(`Invalid ${name}.`);
  return n;
}
export function normalizeSpelunkSearchScope(input, baseline, requested = {}) {
  const capacity = input.caves[baseline.cave].capacity;
  const select = (key, available, empty = false) => {
    const values = requested[key] ?? available;
    if (!Array.isArray(values) || (!empty && !values.length) || values.some(v => !available.includes(v)))
      throw new Error(`Invalid search ${key} selection.`);
    return [...new Set(values)];
  };
  const modes = select('modes', input.auto ? ['auto', 'manual'] : ['manual']);
  const clears = select('clears', [false, true]);
  const speeds = select('speeds', Array.from({ length: input.speedMax + 1 }, (_, i) => i), !modes.includes('auto'));
  const ids = Array.from({ length: input.elixirOwned }, (_, i) => i);
  const partyMin = _count(requested.partyMin, 1, 1, capacity, 'minimum party size');
  const partyMax = _count(requested.partyMax, capacity, partyMin, capacity, 'maximum party size');
  if (input.characters.filter(c => baseline.stamina === 'full' || c.stamina >= c.max / 2).length < partyMin)
    throw new Error('Not enough characters have the required starting stamina for this party range.');
  return { partyMin, partyMax, modes, clears, speeds,
    elixirs: select('elixirs', ids, true), memorized: select('memorized', ids, true) };
}
function _inScope(config, scope) {
  return config.party.length >= scope.partyMin && config.party.length <= scope.partyMax
    && scope.modes.includes(config.policy === 'auto' ? 'auto' : 'manual')
    && scope.clears.includes(config.policy === 'auto' ? config.fullClear : config.policy === 'clear')
    && (config.policy !== 'auto' || scope.speeds.includes(config.speed))
    && config.elixirs.every(id => id === -1 || scope.elixirs.includes(id))
    && config.memorized.every(id => scope.memorized.includes(id));
}
function* _measure(requests, batchSize) {
  const runs = [];
  for (let i = 0; i < requests.length; i += batchSize) {
    const batch = requests.slice(i, i + batchSize);
    if (batchSize === 1) runs.push(yield batch[0]);
    else {
      const results = yield { requests: batch, progress: batch[0].progress, phase: batch[0].phase };
      if (!Array.isArray(results) || results.length !== batch.length
        || results.some((run, j) => !run || run.seed !== batch[j].seed))
        throw new Error('Invalid ordered expedition trial batch.');
      runs.push(...results);
    }
  }
  return runs;
}
export function spelunkRunMetric(run, input, objective) {
  if (!SPELUNK_OBJECTIVES.includes(objective)) throw new Error('Invalid expedition objective.');
  if (objective === 'depth') return run.depth;
  if (objective === 'grand') return run.grands;
  if (!run.settled) return 0;
  if (objective === 'amber') return run.rewards[0];
  if (objective === 'amber-per-stamina') return run.rewards[0] / Math.max(1, run.spent);
  const recovery = Math.max(0, ...run.stamina.map(c => (c.start - c.end) / input.regen));
  return run.rewards[0] / Math.max(1 / 3600, run.seconds / 3600 + recovery);
}
function _summary(config, runs, input, objective) {
  const metrics = runs.map(r => spelunkRunMetric(r, input, objective));
  const score = _mean(metrics);
  const sd = metrics.length > 1 ? Math.sqrt(metrics.reduce((n, v) => n + (v - score) ** 2, 0) / (metrics.length - 1)) : 0;
  return {
    config, runs: runs.map(r => ({ seed: r.seed, status: r.status, settled: r.settled, seconds: r.seconds,
      depth: r.depth, rewards: r.rewards, grossRewards: r.grossRewards, spent: r.spent, grands: r.grands, metric: spelunkRunMetric(r, input, objective) })),
    score, se: sd / Math.sqrt(metrics.length), depth: _mean(runs.map(r => r.depth)),
    amber: _mean(runs.map(r => r.settled ? r.rewards[0] : 0)), seconds: _mean(runs.map(r => r.seconds)),
    settled: runs.filter(r => r.settled).length, total: runs.length,
    recoveryHours: _mean(runs.map(r => Math.max(0, ...r.stamina.map(c => (c.start - c.end) / input.regen)))),
  };
}
export function* createSpelunkComparison(input, configurations, options = {}) {
  if (!Array.isArray(configurations) || !configurations.length || configurations.length > 32)
    throw new Error('Choose between one and 32 expedition configurations.');
  const trials = _count(options.trials, 8, 1, 64, 'trial count');
  const batchSize = _count(options.batchSize, 1, 1, 4, 'worker batch size');
  const objective = options.objective ?? 'depth';
  if (!SPELUNK_OBJECTIVES.includes(objective)) throw new Error('Invalid expedition objective.');
  const rows = configurations.map((c, i) => ({ label: c.label || `Configuration ${i + 1}`,
    config: normalizeSpelunkConfig(input, c.config), runs: [] }));
  const requests = [];
  for (let trial = 0; trial < trials; trial++) for (let i = 0; i < rows.length; i++) {
    requests.push({ config: rows[i].config, seed: _seed(options.seed ?? 1, trial, true),
      progress: (trial * rows.length + i) / (trials * rows.length), phase: 'Comparing configurations' });
  }
  const runs = yield* _measure(requests, batchSize);
  runs.forEach((run, i) => rows[i % rows.length].runs.push(run));
  return { kind: 'comparison', objective, rows: rows.map(r => ({ label: r.label, ..._summary(r.config, r.runs, input, objective) })) };
}

function _choose(n, k) {
  let count = 1n;
  for (let i = 1; i <= k; i++) count = count * BigInt(n - i + 1) / BigInt(i);
  return count;
}
function _publicCount(count) { return count <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(count) : String(count); }
function _eligible(input, base) { return input.characters.filter(c => base.stamina === 'full' || c.stamina >= c.max / 2).map(c => c.id); }
function _policies(scope) {
  return SPELUNK_POLICIES.filter(policy => scope.modes.includes(policy === 'auto' ? 'auto' : 'manual')
    && (policy === 'auto' || scope.clears.includes(policy === 'clear')));
}
function _configurationCount(input, base, scope) {
  const n = _eligible(input, base).length;
  let parties = 0n, ordered = 1n;
  for (let k = 1; k <= Math.min(scope.partyMax, n); k++) {
    ordered *= BigInt(n - k + 1);
    if (k >= scope.partyMin) parties += ordered;
  }
  let belts = Array(input.slots + 1).fill(0n); belts[0] = 1n;
  for (let id = 0; id < scope.elixirs.length; id++) {
    const next = Array(input.slots + 1).fill(0n);
    for (let occupied = 0; occupied <= input.slots; occupied++)
      for (let copies = 0; copies <= Math.min(input.dupes, input.slots - occupied); copies++)
        next[occupied + copies] += belts[occupied] * _choose(input.slots - occupied, copies);
    belts = next;
  }
  let memories = 0n;
  for (let k = 0; k <= Math.min(input.memorySlots ?? Math.round(input.shop[57] || 0), scope.memorized.length); k++)
    memories += _choose(scope.memorized.length, k);
  const policies = _policies(scope).reduce((sum, policy) => sum + (policy === 'auto'
    ? scope.speeds.length * scope.clears.length : input.tools.length + 1), 0);
  return parties * belts.reduce((a, b) => a + b, 0n) * memories * BigInt(policies) * 2n;
}
export function spelunkSearchSpace(input, baseline, requested = {}) {
  const base = normalizeSpelunkConfig(input, baseline), scope = normalizeSpelunkSearchScope(input, base, requested);
  return { configurations: _publicCount(_configurationCount(input, base, scope)), scope };
}
function* _parties(ids, min, max, party = []) {
  if (party.length >= min) yield [...party];
  if (party.length === max) return;
  for (const id of ids) if (!party.includes(id)) {
    party.push(id); yield* _parties(ids, min, max, party); party.pop();
  }
}
function* _belts(ids, slots, dupes, belt = [], counts = new Map()) {
  if (belt.length === slots) { yield [...belt]; return; }
  for (const id of [-1, ...ids]) {
    const used = counts.get(id) || 0;
    if (id !== -1 && used >= dupes) continue;
    belt.push(id); counts.set(id, used + 1);
    yield* _belts(ids, slots, dupes, belt, counts);
    belt.pop(); counts.set(id, used);
  }
}
function* _memories(ids, slots, start = 0, memory = []) {
  yield [...memory];
  if (memory.length === slots) return;
  for (let i = start; i < ids.length; i++) {
    memory.push(ids[i]); yield* _memories(ids, slots, i + 1, memory); memory.pop();
  }
}
function* _configurations(input, base, scope) {
  const eligible = _eligible(input, base), memoryIds = [...scope.memorized].sort((a, b) => a - b);
  for (const policy of _policies(scope))
    for (const speed of policy === 'auto' ? scope.speeds : [base.speed])
      for (const fullClear of policy === 'auto' ? scope.clears : [base.fullClear])
        for (const tool of policy === 'auto' ? [base.tool] : ['adaptive', ...input.tools.map(t => t.id)])
          for (const entry of ['surface', 'shortcut'])
            for (const party of _parties(eligible, scope.partyMin, Math.min(scope.partyMax, eligible.length)))
              for (const elixirs of _belts(scope.elixirs, input.slots, input.dupes))
                for (const memorized of _memories(memoryIds, input.memorySlots ?? Math.round(input.shop[57] || 0)))
                  yield { ...base, policy, speed, fullClear, tool, entry, party, elixirs, memorized };
}
export function* createSpelunkSearch(input, baseline, options = {}) {
  const base = normalizeSpelunkConfig(input, baseline);
  const objective = options.objective ?? 'depth';
  if (!SPELUNK_OBJECTIVES.includes(objective)) throw new Error('Invalid expedition objective.');
  const screening = _count(options.screening, 2, 1, 8, 'screening trials');
  const finalTrials = _count(options.trials, 12, 2, 64, 'final trials');
  const batchSize = _count(options.batchSize, 1, 1, 4, 'worker batch size');
  const searchScope = normalizeSpelunkSearchScope(input, base, options.scope);
  const references = new Map();
  const allowed = config => _inScope(config, searchScope) && config.stamina === base.stamina && config.reactionMs === base.reactionMs;
  function add(config, label) {
    const normalized = normalizeSpelunkConfig(input, config), key = JSON.stringify(normalized);
    if (!references.has(key)) references.set(key, { config: normalized, key, label, referenceOnly: !allowed(normalized) });
    return references.get(key);
  }
  add(base, 'Selected baseline');
  if (!Array.isArray(options.configurations ?? []) || (options.configurations?.length || 0) > 31)
    throw new Error('At most 31 submitted configurations are supported.');
  const submitted = (options.configurations || []).map(c => {
    const normalized = normalizeSpelunkConfig(input, c.config);
    if (normalized.cave !== base.cave || normalized.manic !== base.manic)
      throw new Error('Optimizer baselines must use the selected cave and Normal/Manic mode. Use Compare for different modes or caves.');
    return add(normalized, c.label);
  });
  const enumerated = config => allowed(config) && (config.policy === 'auto' ? config.tool === base.tool
    : config.speed === base.speed && config.fullClear === base.fullClear);
  const configurationCount = _configurationCount(input, base, searchScope);
  const total = configurationCount + BigInt([...references.values()].filter(e => !enumerated(e.config)).length);
  function* entries() {
    yield* references.values();
    for (const config of _configurations(input, base, searchScope)) {
      const key = JSON.stringify(config);
      if (!references.has(key)) yield { config, key, label: 'Screened strategy', referenceOnly: false };
    }
  }
  const stream = entries(), measuredReferences = new Map(), top = [];
  let screened = 0n, done = false;
  while (!done) {
    const entries = [], requests = [];
    while (entries.length < batchSize) {
      const next = stream.next();
      if (next.done) { done = true; break; }
      entries.push(next.value);
    }
    if (!entries.length) break;
    for (const [i, entry] of entries.entries()) for (let t = 0; t < screening; t++) requests.push({
      config: entry.config, seed: _seed(options.seed ?? 1, t, false),
      progress: .75 * (Number(screened) + i + t / screening) / Number(total),
      phase: `Screening configuration ${screened + BigInt(i) + 1n} of ${total}`,
    });
    const runs = yield* _measure(requests, batchSize);
    entries.forEach((entry, i) => {
      const measured = { ...entry, ..._summary(entry.config, runs.slice(i * screening, (i + 1) * screening), input, objective) };
      if (references.has(entry.key)) measuredReferences.set(entry.key, measured);
      if (!entry.referenceOnly) {
        top.push(measured); top.sort((a, b) => b.score - a.score); top.length = Math.min(top.length, 5);
      }
    });
    screened += BigInt(entries.length);
  }
  if (screened !== total) throw new Error('Expedition configuration count did not match exhaustive screening.');
  const finalists = [...new Map([measuredReferences.get(JSON.stringify(base)), ...submitted.map(s => measuredReferences.get(s.key)), ...top]
    .filter(Boolean).map(e => [e.key, e])).values()];
  const final = finalists.map(e => ({ ...e, runs: [] }));
  const finalRequests = [];
  for (let t = 0; t < finalTrials; t++) for (let i = 0; i < final.length; i++) {
    finalRequests.push({ config: final[i].config, seed: _seed(options.seed ?? 1, t, true),
      progress: .75 + .25 * (t * final.length + i) / (finalTrials * final.length),
      phase: 'Fresh-seed finalist comparison' });
  }
  const finalRuns = yield* _measure(finalRequests, batchSize);
  finalRuns.forEach((run, i) => final[i % final.length].runs.push(run));
  const rows = final.map(e => ({ label: e.label, referenceOnly: e.referenceOnly, ..._summary(e.config, e.runs, input, objective) }));
  const baseRow = rows[0], ranked = rows.filter(e => !e.referenceOnly).sort((a, b) => b.score - a.score);
  const winner = ranked[0], differences = winner.runs.map((r, i) => r.metric - baseRow.runs[i].metric);
  const delta = _mean(differences);
  const se = Math.sqrt(differences.reduce((sum, d) => sum + (d - delta) ** 2, 0) / (differences.length - 1) / differences.length);
  return {
    kind: 'search', objective, rows, winner, baseline: baseRow, screened: _publicCount(screened),
    configurations: _publicCount(configurationCount), exhaustive: true, searchScope,
    delta, interval: [delta - 1.96 * se, delta + 1.96 * se],
    claim: 'Every allowed configuration screened under the experimental model; fresh-seed finalists are sampled, not a proof of the stochastic optimum.',
    scope: 'All eligible ordered parties within the selected size range, permitted policies/clear choices/Auto speeds, every legal physical belt arrangement (including empty slots and unlocked duplicates), unique memorized subsets, manual tools and both entry choices are screened. Cave, Normal/Manic mode, starting-stamina mode, reaction time and account upgrades stay fixed. Auto tool choice is automatic; unused manual Auto settings do not multiply the search. References outside the selected scope cannot win. The strongest five screening setups and reference configurations receive fresh finalist trials. Intervals are descriptive, not selection-adjusted guarantees.',
  };
}
