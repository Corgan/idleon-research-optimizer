// ===== SPELUNKING STRATEGY COMPARISONS (W7) =====
import { normalizeSpelunkConfig, SPELUNK_POLICIES } from './spelunk-expedition.js?v=depth-limits-1';

export const SPELUNK_OBJECTIVES = ['depth', 'amber', 'amber-per-stamina', 'sustainable-amber', 'grand'];
const _dimensions = ['party', 'modes', 'clears', 'speeds', 'elixirs', 'memorized', 'tools', 'entry'];
function _enabled(scope, key) { return scope.enabled?.[key] !== false; }
function _mean(values) { return values.reduce((a, b) => a + b, 0) / values.length; }
function _seed(seed, index, final) { return ((seed >>> 0) + Math.imul(index + 1, 0x9e3779b9) + (final ? 0x4f1bbcdc : 0)) >>> 0; }
function _count(value, fallback, lo, hi, name) {
  const n = value ?? fallback;
  if (!Number.isInteger(n) || n < lo || n > hi) throw new Error(`Invalid ${name}.`);
  return n;
}
export function normalizeSpelunkSearchScope(input, baseline, requested = {}) {
  const capacity = input.caves[baseline.cave].capacity;
  if (requested.enabled != null && (typeof requested.enabled !== 'object' || Array.isArray(requested.enabled)
    || Object.entries(requested.enabled).some(([key, value]) => !_dimensions.includes(key) || typeof value !== 'boolean')))
    throw new Error('Invalid search section toggles.');
  const enabled = key => _enabled(requested, key);
  const select = (key, available, empty = false) => {
    const values = requested[key] ?? available;
    if (!Array.isArray(values) || (!empty && !values.length) || values.some(v => !available.includes(v)))
      throw new Error(`Invalid search ${key} selection.`);
    return [...new Set(values)];
  };
  const modes = enabled('modes') ? select('modes', input.auto ? ['auto', 'manual'] : ['manual'])
    : [baseline.policy === 'auto' ? 'auto' : 'manual'];
  const clears = enabled('clears') ? select('clears', [false, true])
    : [baseline.policy === 'auto' ? baseline.fullClear : baseline.policy === 'clear'];
  const speeds = enabled('speeds') ? select('speeds', Array.from({ length: input.speedMax + 1 }, (_, i) => i), !modes.includes('auto'))
    : [baseline.speed];
  const ids = Array.from({ length: input.elixirOwned }, (_, i) => i);
  const partyMin = enabled('party') ? _count(requested.partyMin, 1, 1, capacity, 'minimum party size') : baseline.party.length;
  const partyMax = enabled('party') ? _count(requested.partyMax, capacity, partyMin, capacity, 'maximum party size') : baseline.party.length;
  const characters = enabled('party') ? select('characters', input.characters.map(c => c.id), true).sort((a, b) => a - b)
    : [...baseline.party];
  if (enabled('party') && requested.ignoreOrder != null && typeof requested.ignoreOrder !== 'boolean')
    throw new Error('Invalid party order search option.');
  const ignoreOrder = enabled('party') && requested.ignoreOrder === true;
  if (_eligible(input, baseline, { characters, ignoreOrder }).length < partyMin)
    throw new Error('Not enough selected characters have the required starting stamina for this party range.');
  return { partyMin, partyMax, characters, ignoreOrder, modes, clears, speeds,
    elixirs: enabled('elixirs') ? select('elixirs', ids, true) : [...new Set(baseline.elixirs.filter(id => id >= 0))],
    memorized: enabled('memorized') ? select('memorized', ids, true) : [...baseline.memorized],
    ...(requested.enabled == null ? {} : { enabled: { ...requested.enabled } }) };
}
function _beltOccupancy(input, scope) { return Math.min(input.slots, scope.elixirs.length * input.dupes); }
function _inScope(config, scope, occupancy, base) {
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  return config.party.length >= scope.partyMin && config.party.length <= scope.partyMax
    && (_enabled(scope, 'party') || same(config.party, base.party))
    && config.party.every(id => scope.characters.includes(id))
    && (!scope.ignoreOrder || config.party.every((id, i) => !i || config.party[i - 1] < id))
    && _policies(scope, base).includes(config.policy)
    && scope.clears.includes(config.policy === 'auto' ? config.fullClear : config.policy === 'clear')
    && (config.policy !== 'auto' || scope.speeds.includes(config.speed))
    && (_enabled(scope, 'speeds') || config.speed === base.speed)
    && (_enabled(scope, 'tools') || config.tool === base.tool)
    && (_enabled(scope, 'entry') || config.entry === base.entry)
    && config.elixirs.every(id => id === -1 || scope.elixirs.includes(id))
    && (_enabled(scope, 'elixirs') ? config.elixirs.filter(id => id >= 0).length === occupancy : same(config.elixirs, base.elixirs))
    && (_enabled(scope, 'memorized') ? config.memorized.every(id => scope.memorized.includes(id)) : same(config.memorized, base.memorized));
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
      startDepth: r.startDepth, depth: r.depth, rewards: r.rewards, grossRewards: r.grossRewards,
      spent: r.spent, grands: r.grands, stamina: r.stamina, diagnostics: r.diagnostics,
      metric: spelunkRunMetric(r, input, objective) })),
    score, se: sd / Math.sqrt(metrics.length), depth: _mean(runs.map(r => r.depth)),
    startDepth: _mean(runs.map(r => r.startDepth)),
    amber: _mean(runs.map(r => r.settled ? r.rewards[0] : 0)), seconds: _mean(runs.map(r => r.seconds)),
    settled: runs.filter(r => r.settled).length, total: runs.length,
    recoveryHours: _mean(runs.map(r => Math.max(0, ...r.stamina.map(c => (c.start - c.end) / input.regen)))),
    diagnostics: _diagnostics(config, runs),
  };
}
function _diagnostics(config, runs) {
  if (!runs.every(r => r.diagnostics
    && config.party.every(id => r.diagnostics.members.some(c => c.id === id)))) return null;
  const mean = fn => _mean(runs.map(fn));
  const rate = fn => ({ count: runs.filter(fn).length, total: runs.length });
  return {
    resistStall: rate(r => r.diagnostics.resistStall),
    blocked: rate(r => r.diagnostics.blocked),
    unused: mean(r => r.diagnostics.unused),
    noAdvance: mean(r => r.diagnostics.noAdvance),
    resistedStamina: mean(r => r.diagnostics.resistedStamina),
    members: config.party.map(id => {
      const members = runs.map(r => r.diagnostics.members.find(c => c.id === id));
      const average = key => _mean(members.map(c => c[key]));
      return { id, digs: average('digs'), hits: average('hits'), misses: average('misses'),
        spent: average('spent'), resistedStamina: average('resistedStamina'),
        damage: average('damage'), broken: average('broken'), descents: average('descents'),
        amber: _mean(members.map(c => c.rewards[0])),
        unused: members.filter(c => c.unused).length,
        noAdvance: members.filter(c => c.noAdvance).length,
        noFurtherFloor: members.filter(c => c.noFurtherFloor).length,
        resistStall: members.filter(c => c.resistStall).length, total: members.length };
    }),
  };
}
function _pairedParty(larger, smaller) {
  const differences = larger.runs.map((r, i) => r.metric - smaller.runs[i].metric);
  const mean = _mean(differences), n = differences.length;
  const se = n > 1 ? Math.sqrt(differences.reduce((sum, d) => sum + (d - mean) ** 2, 0) / (n - 1) / n) : null;
  return { objective: mean, interval: se == null ? null : [mean - 1.96 * se, mean + 1.96 * se],
    depth: larger.depth - smaller.depth, amber: larger.amber - smaller.amber,
    grands: _mean(larger.runs.map((r, i) => r.grands - smaller.runs[i].grands)),
    extraDepth: larger.runs.filter((r, i) => r.depth > smaller.runs[i].depth).length,
    total: n,
    rewards: Array.from({ length: 12 }, (_, key) => _mean(larger.runs.map((r, i) =>
      (r.settled ? r.rewards[key] || 0 : 0) - (smaller.runs[i].settled ? smaller.runs[i].rewards[key] || 0 : 0)))) };
}
function _partySummary(candidates, objective, allowed) {
  const eligible = candidates.filter(r => !allowed || allowed(r.config));
  // Depth efficiency compares gained floors, not the shortcut's starting depth.
  const value = row => objective === 'depth' ? row.score - row.startDepth : row.score;
  const best = Math.max(...eligible.map(value));
  const recommended = eligible.find(row => value(row) >= best - .01 * Math.abs(best));
  return {
    objective, retention: .99, recommendedSize: recommended?.config.party.length ?? null,
    trials: candidates[0].total,
    rows: candidates.map((row, i) => ({
      config: row.config, score: row.score, depth: row.depth, amber: row.amber, settled: row.settled,
      diagnostics: row.diagnostics, allowed: !allowed || allowed(row.config),
      marginal: i ? _pairedParty(row, candidates[i - 1]) : null,
    })),
  };
}
function* _measurePartyFamilies(input, rows, options) {
  const objective = options.objective ?? 'depth';
  if (!SPELUNK_OBJECTIVES.includes(objective)) throw new Error('Invalid expedition objective.');
  const batchSize = _count(options.batchSize, 1, 1, 4, 'worker batch size');
  if (!Array.isArray(rows) || !rows.length || rows.some(r => !r.runs?.length))
    throw new Error('Party analysis requires completed expedition trials.');
  const key = (config, seeds) => JSON.stringify([config, seeds]);
  const measured = new Map(), pending = new Map(), families = [];
  for (const row of rows) {
    const config = normalizeSpelunkConfig(input, row.config), seeds = row.runs.map(r => r.seed);
    if (new Set(seeds).size !== seeds.length) throw new Error('Party analysis requires distinct paired trial seeds.');
    measured.set(key(config, seeds), _summary(config, row.runs, input, objective));
  }
  for (const row of rows) {
    const config = normalizeSpelunkConfig(input, row.config), seeds = row.runs.map(r => r.seed), family = [];
    for (let size = 1; size <= config.party.length; size++) {
      const prefix = { ...config, party: config.party.slice(0, size) }, id = key(prefix, seeds);
      family.push(id);
      if (!measured.has(id) && !pending.has(id)) pending.set(id, { config: prefix, seeds, runs: [] });
    }
    families.push(family);
  }
  const requests = [];
  for (const [id, entry] of pending) for (const seed of entry.seeds)
    requests.push({ config: entry.config, seed, id });
  const from = options.progressFrom ?? .9;
  const runs = yield* _measure(requests.map((r, i) => ({
    config: r.config, seed: r.seed, progress: from + (1 - from) * i / requests.length,
    phase: 'Measuring shorter parties on paired seeds',
  })), batchSize);
  runs.forEach((run, i) => pending.get(requests[i].id).runs.push(run));
  for (const [id, entry] of pending) measured.set(id, _summary(entry.config, entry.runs, input, objective));
  return families.map(family => family.map(id => measured.get(id)));
}
export function* createSpelunkPartyAnalysis(input, rows, options = {}) {
  const families = yield* _measurePartyFamilies(input, rows, options);
  return families.map(family => _partySummary(family, options.objective ?? 'depth', options.allowed));
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
      progress: .8 * (trial * rows.length + i) / (trials * rows.length), phase: 'Comparing configurations' });
  }
  const runs = yield* _measure(requests, batchSize);
  runs.forEach((run, i) => rows[i % rows.length].runs.push(run));
  const summaries = rows.map(r => ({ label: r.label, ..._summary(r.config, r.runs, input, objective) }));
  const parties = yield* createSpelunkPartyAnalysis(input, summaries, { objective, batchSize, progressFrom: .8 });
  return { kind: 'comparison', objective, rows: summaries.map((row, i) => ({ ...row, partyAnalysis: parties[i] })) };
}

function _choose(n, k) {
  let count = 1n;
  for (let i = 1; i <= k; i++) count = count * BigInt(n - i + 1) / BigInt(i);
  return count;
}
function _publicCount(count) { return count <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(count) : String(count); }
function _eligible(input, base, scope) {
  const ids = input.characters.filter(c => (base.stamina === 'full' || c.stamina >= c.max / 2)
    && scope.characters.includes(c.id)).map(c => c.id);
  return scope.ignoreOrder ? ids.sort((a, b) => a - b) : ids;
}
function _policies(scope, base) {
  if (!_enabled(scope, 'modes')) {
    if (base.policy === 'auto') return ['auto'];
    return scope.clears.map(clear => clear ? 'clear' : base.policy === 'clear' ? 'efficient' : base.policy);
  }
  return SPELUNK_POLICIES.filter(policy => scope.modes.includes(policy === 'auto' ? 'auto' : 'manual')
    && (policy === 'auto' || scope.clears.includes(policy === 'clear')));
}
function _configurationCount(input, base, scope) {
  const n = _eligible(input, base, scope).length;
  let parties = 0n, ordered = 1n;
  for (let k = 1; k <= Math.min(scope.partyMax, n); k++) {
    ordered *= BigInt(n - k + 1);
    if (k >= scope.partyMin) parties += scope.ignoreOrder ? _choose(n, k) : ordered;
  }
  if (!_enabled(scope, 'party')) parties = 1n;
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
  const policies = _policies(scope, base).reduce((sum, policy) => sum + (policy === 'auto'
    ? scope.speeds.length * scope.clears.length : _enabled(scope, 'tools') ? input.tools.length + 1 : 1), 0);
  return parties * (_enabled(scope, 'elixirs') ? belts[_beltOccupancy(input, scope)] : 1n)
    * (_enabled(scope, 'memorized') ? memories : 1n) * BigInt(policies) * (_enabled(scope, 'entry') ? 2n : 1n);
}
export function spelunkSearchSpace(input, baseline, requested = {}) {
  const base = normalizeSpelunkConfig(input, baseline), scope = normalizeSpelunkSearchScope(input, base, requested);
  return { configurations: _publicCount(_configurationCount(input, base, scope)), scope };
}
function* _parties(ids, min, max, ignoreOrder, party = [], start = 0) {
  if (party.length >= min) yield [...party];
  if (party.length === max) return;
  for (let i = start; i < ids.length; i++) if (!party.includes(ids[i])) {
    party.push(ids[i]); yield* _parties(ids, min, max, ignoreOrder, party, ignoreOrder ? i + 1 : 0); party.pop();
  }
}
function* _belts(ids, slots, dupes, remaining, belt = [], counts = new Map()) {
  if (belt.length === slots) { yield [...belt]; return; }
  for (const id of [-1, ...ids]) {
    const used = counts.get(id) || 0;
    if (id === -1 ? slots - belt.length === remaining : !remaining || used >= dupes) continue;
    belt.push(id); counts.set(id, used + 1);
    yield* _belts(ids, slots, dupes, remaining - (id >= 0 ? 1 : 0), belt, counts);
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
  const eligible = _eligible(input, base, scope), memoryIds = [...scope.memorized].sort((a, b) => a - b);
  for (const policy of _policies(scope, base))
    for (const speed of policy === 'auto' ? scope.speeds : [base.speed])
      for (const fullClear of policy === 'auto' ? scope.clears : [base.fullClear])
        for (const tool of policy === 'auto' || !_enabled(scope, 'tools') ? [base.tool] : ['adaptive', ...input.tools.map(t => t.id)])
          for (const entry of _enabled(scope, 'entry') ? ['surface', 'shortcut'] : [base.entry])
            for (const party of _enabled(scope, 'party') ? _parties(eligible, scope.partyMin, Math.min(scope.partyMax, eligible.length), scope.ignoreOrder) : [base.party])
              for (const elixirs of _enabled(scope, 'elixirs') ? _belts(scope.elixirs, input.slots, input.dupes, _beltOccupancy(input, scope)) : [base.elixirs])
                for (const memorized of _enabled(scope, 'memorized') ? _memories(memoryIds, input.memorySlots ?? Math.round(input.shop[57] || 0)) : [base.memorized])
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
  const occupancy = _beltOccupancy(input, searchScope);
  const allowed = config => _inScope(config, searchScope, occupancy, base) && config.stamina === base.stamina && config.reactionMs === base.reactionMs;
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
      progress: .75 + .15 * (t * final.length + i) / (finalTrials * final.length),
      phase: 'Fresh-seed finalist comparison' });
  }
  const finalRuns = yield* _measure(finalRequests, batchSize);
  finalRuns.forEach((run, i) => final[i % final.length].runs.push(run));
  const rows = final.map(e => ({ label: e.label, referenceOnly: e.referenceOnly, ..._summary(e.config, e.runs, input, objective) }));
  const families = yield* _measurePartyFamilies(input, rows, { objective, batchSize });
  rows.forEach((row, i) => { row.partyAnalysis = _partySummary(families[i], objective, allowed); });
  const measuredConfigs = new Set(rows.map(row => JSON.stringify(row.config)));
  for (const family of families) for (const [i, candidate] of family.entries()) {
    const key = JSON.stringify(candidate.config);
    if (!allowed(candidate.config) || measuredConfigs.has(key)) continue;
    measuredConfigs.add(key);
    rows.push({ label: 'Measured shorter party', referenceOnly: false, ...candidate,
      partyAnalysis: _partySummary(family.slice(0, i + 1), objective, allowed) });
  }
  const baseRow = rows[0], ranked = rows.filter(e => !e.referenceOnly).sort((a, b) => b.score - a.score);
  const winner = ranked[0], differences = winner.runs.map((r, i) => r.metric - baseRow.runs[i].metric);
  const delta = _mean(differences);
  const se = Math.sqrt(differences.reduce((sum, d) => sum + (d - delta) ** 2, 0) / (differences.length - 1) / differences.length);
  return {
    kind: 'search', objective, rows, winner, baseline: baseRow, screened: _publicCount(screened),
    configurations: _publicCount(configurationCount), exhaustive: true, searchScope,
    delta, interval: [delta - 1.96 * se, delta + 1.96 * se],
    claim: 'Every allowed configuration screened under the experimental model; fresh-seed finalists are sampled, not a proof of the stochastic optimum.',
    scope: 'Eligible parties from the selected character pool within the selected size range are screened. With Order doesn\'t matter, each group is tested once in character-slot order; expedition outcomes can still depend on that order. Otherwise every party permutation is screened. Permitted policies/clear choices/Auto speeds, every maximally filled physical belt arrangement (including unlocked duplicates), unique memorized subsets, manual tools and both entry choices are screened. Empty belt slots are allowed only when the selected pool and duplicate limit cannot fill them. Cave, Normal/Manic mode, starting-stamina mode, reaction time and account upgrades stay fixed. Auto tool choice is automatic; unused manual Auto settings do not multiply the search. References outside the selected scope, including underfilled belts and unsearched party orders, cannot win. The strongest five screening setups and reference configurations receive fresh finalist trials, followed by paired shorter-prefix measurements. Eligible measured prefixes also compete on the original objective; out-of-scope prefixes are diagnostic only. Separate party efficiency advice retains 99% of the best observed prefix objective (gained floors for Depth), not proven equivalence, and never lowers the highest-objective winner. Intervals are descriptive, not selection-adjusted guarantees.',
  };
}
