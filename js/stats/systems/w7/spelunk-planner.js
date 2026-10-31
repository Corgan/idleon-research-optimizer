// ===== SPELUNKING STRATEGY COMPARISONS (W7) =====
import { normalizeSpelunkConfig, SPELUNK_POLICIES } from './spelunk-expedition.js?v=amber-search-2';

export const SPELUNK_OBJECTIVES = ['depth', 'amber', 'amber-per-stamina', 'sustainable-amber', 'grand'];
const _dimensions = ['party', 'modes', 'clears', 'speeds', 'elixirs', 'memorized', 'tools', 'entry'];
function _enabled(scope, key) { return scope.enabled?.[key] !== false; }
function _clearMode(config) { return config.policy === 'auto' ? config.fullClear : config.policy === 'clear-fifth' ? 'fifth' : ['clear', 'amber-farm'].includes(config.policy); }
function _autoClears(scope) { return scope.clears.filter(clear => typeof clear === 'boolean'); }
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
  const clears = enabled('clears') ? select('clears', [false, true, 'fifth'])
    : [_clearMode(baseline)];
  if (!modes.includes('manual') && !clears.some(clear => typeof clear === 'boolean'))
    throw new Error('Every-fifth-depth clearing requires manual play. Allow Manual or another descent choice.');
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
    && scope.clears.includes(_clearMode(config))
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
      exit: r.exit, amber: r.amber,
      metric: spelunkRunMetric(r, input, objective) })),
    score, se: sd / Math.sqrt(metrics.length), depth: _mean(runs.map(r => r.depth)),
    startDepth: _mean(runs.map(r => r.startDepth)),
    amber: _mean(runs.map(r => r.settled ? r.rewards[0] : 0)), seconds: _mean(runs.map(r => r.seconds)),
    settled: runs.filter(r => r.settled).length, total: runs.length,
    rope: runs.filter(r => r.exit?.type === 'rope').length,
    toll: runs.filter(r => r.exit?.type === 'toll').length,
    blocked: runs.filter(r => !r.settled).length,
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

export function* createSpelunkCaveComparison(input, requested, options = {}) {
  const config = normalizeSpelunkConfig(input, requested);
  const trials = _count(options.trials, 8, 1, 64, 'trial count');
  const batchSize = _count(options.batchSize, 1, 1, 4, 'worker batch size');
  const records = config.manic ? input.manicDepths : input.depths;
  const rows = input.caves.map(cave => {
    const savedRecord = records?.[cave.id];
    return {
      label: cave.name,
      config: normalizeSpelunkConfig(input, { ...config, cave: cave.id, party: config.party.slice(0, cave.capacity) }),
      excluded: config.party.slice(cave.capacity),
      // Native records store zero-based depth; expedition results expose the floor label.
      recordDepth: Number.isInteger(savedRecord) && savedRecord >= 0 ? savedRecord + 1 : null,
      runs: [],
    };
  });
  const requests = [];
  for (let trial = 0; trial < trials; trial++) for (const row of rows)
    requests.push({ config: row.config, seed: _seed(options.seed ?? 1, trial, true),
      progress: requests.length / (trials * rows.length), phase: 'Comparing caves for new depths' });
  const runs = yield* _measure(requests, batchSize);
  runs.forEach((run, i) => rows[i % rows.length].runs.push(run));
  const summaries = rows.map(row => {
    const summary = _summary(row.config, row.runs, input, 'depth');
    const gains = row.recordDepth == null ? null : row.runs.map(run => Math.max(0, run.depth - row.recordDepth));
    const newDepths = gains == null ? null : _mean(gains);
    return { ...summary, label: row.label, excluded: row.excluded, recordDepth: row.recordDepth, newDepths,
      newDepthsSe: gains == null || trials < 2 ? null
        : Math.sqrt(gains.reduce((sum, gain) => sum + (gain - newDepths) ** 2, 0) / (trials - 1) / trials),
      recordBeaten: gains == null ? null : gains.filter(gain => gain > 0).length,
      runs: summary.runs.map((run, i) => ({ ...run, newDepths: gains?.[i] ?? null })),
    };
  }).sort((a, b) => (b.newDepths ?? -1) - (a.newDepths ?? -1) || a.config.cave - b.config.cave);
  return { kind: 'caves', config, trials, rows: summaries,
    winner: summaries.find(row => row.newDepths > 0) ?? null };
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
    return scope.clears.map(clear => clear === 'fifth' ? 'clear-fifth' : clear ? base.policy === 'amber-farm' ? 'amber-farm' : 'clear'
      : ['clear', 'clear-fifth', 'amber-farm'].includes(base.policy) ? 'efficient' : base.policy);
  }
  return SPELUNK_POLICIES.filter(policy => policy !== 'amber-farm' && scope.modes.includes(policy === 'auto' ? 'auto' : 'manual')
    && (policy === 'auto' ? _autoClears(scope).length > 0 : scope.clears.includes(_clearMode({ policy }))));
}

function _amberOutcomeKey(row, count = row.runs.length) {
  return JSON.stringify(row.runs.slice(0, count).map(r => [r.status, r.depth, r.seconds, r.spent,
    r.rewards, r.stamina.map(c => [c.id, c.end]), r.amber ?? null, r.exit?.type ?? null]));
}
function _amberLeaders(rows, limit) {
  if (!rows.length) return [];
  const ranked = [...rows].sort((a, b) => b.score - a.score || b.rope / b.total - a.rope / a.total);
  const count = Math.min(...rows.map(r => r.runs.length));
  const keys = new Map(rows.map(r => [r, _amberOutcomeKey(r, count)]));
  const selected = [], seen = new Set();
  const take = (ordered, target) => {
    for (const row of ordered) {
      if (selected.length >= target) break;
      if (seen.has(keys.get(row))) continue;
      selected.push(row); seen.add(keys.get(row));
    }
  };
  take(ranked, Math.min(3, limit));
  take([...ranked].sort((a, b) => b.rope / b.total - a.rope / a.total || b.score - a.score), Math.min(5, limit));
  const depthSpan = Math.max(1, Math.max(...rows.map(r => r.config.amber.dumpDepth))
    - Math.min(...rows.map(r => r.config.amber.dumpDepth)));
  const distance = (a, b) => {
    const x = a.config.amber, y = b.config.amber;
    return Math.abs(x.dumpDepth - y.dumpDepth) / depthSpan + Math.abs(x.finishers - y.finishers)
      + Math.abs(x.reservePct - y.reservePct) / 75 + Math.abs(x.harvestDepths - y.harvestDepths) / 16
      + Math.abs(x.ropeReservePct - y.ropeReservePct) / 75;
  };
  const spread = pool => pool.reduce((best, row) => {
    const gap = Math.min(...selected.map(s => distance(row, s)));
    return !best || gap > best.gap ? { row, gap } : best;
  }, null)?.row;
  while (selected.length < limit) {
    const row = spread(ranked.filter(r => !seen.has(keys.get(r))));
    if (!row) break;
    selected.push(row); seen.add(keys.get(row));
  }
  // Matching a few seeds is not proof of equivalence; keep two parameter-space challengers too.
  const target = Math.min(limit, selected.length + 2);
  while (selected.length < target) {
    const row = spread(ranked.filter(r => !selected.includes(r)));
    if (!row) break;
    selected.push(row);
  }
  return selected;
}
function _amberDifference(a, b) {
  const differences = a.runs.map((r, i) => r.metric - b.runs[i].metric);
  const delta = _mean(differences);
  const se = Math.sqrt(differences.reduce((sum, d) => sum + (d - delta) ** 2, 0)
    / (differences.length - 1) / differences.length);
  return { delta, interval: [delta - 1.96 * se, delta + 1.96 * se] };
}
function _amberRopeUncertain(row, minimum) {
  if (!minimum) return false;
  const n = row.total, p = row.rope / n, z2 = 1.96 ** 2;
  const center = (p + z2 / (2 * n)) / (1 + z2 / n);
  const radius = 1.96 * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n)) / (1 + z2 / n);
  return center - radius <= minimum / 100 && center + radius >= minimum / 100;
}
export function* createSpelunkAmberSearch(input, baseline, options = {}) {
  const base = normalizeSpelunkConfig(input, baseline);
  if (!base.elixirs.includes(3)) throw new Error('Amber farming needs at least one equipped orange elixir. Apply the Amber belt preset or choose a belt.');
  const objective = options.objective ?? 'amber';
  if (!['amber', 'amber-per-stamina', 'sustainable-amber'].includes(objective))
    throw new Error('Choose a collected-Amber objective for Amber farming.');
  const screening = _count(options.screening, 2, 1, 8, 'screening trials');
  const trials = _count(options.trials, 12, 2, 64, 'final trials');
  const maxTrials = _count(options.maxTrials, Math.max(128, trials), trials, 256, 'adaptive Amber trial cap');
  const batchSize = _count(options.batchSize, 1, 1, 4, 'worker batch size');
  const minRopePct = _count(options.minRopePct, 0, 0, 100, 'minimum sampled rope exit percentage');
  const from = _count(options.from, 1, 1, 10000, 'first Amber dump depth');
  const requestedTo = options.to == null ? null : _count(options.to, 100, from, 10000, 'last Amber dump depth');
  const seed = options.seed ?? 1;
  const measurements = new Map();
  function* measure(configs, count, fromProgress, toProgress, phase) {
    const pending = [], requests = [];
    for (const config of configs) {
      const key = JSON.stringify(config);
      if (!measurements.has(key)) measurements.set(key, { config, runs: [] });
      const entry = measurements.get(key);
      for (let t = entry.runs.length; t < count; t++) {
        pending.push(entry);
        requests.push({ config, seed: _seed(seed, t, false), phase });
      }
    }
    requests.forEach((r, i) => { r.progress = fromProgress + (toProgress - fromProgress) * i / requests.length; });
    const results = yield* _measure(requests, batchSize);
    results.forEach((run, i) => pending[i].runs.push(run));
    return configs.map(config => {
      const entry = measurements.get(JSON.stringify(config));
      return _summary(config, entry.runs, input, objective);
    });
  }
  const [baselineScreen] = yield* measure([base], screening, 0, .03, 'Measuring current configuration');
  const baselineRuns = baselineScreen.runs;
  const to = requestedTo ?? Math.max(from, Math.min(10000, Math.max(...baselineRuns.map(r => r.depth))));
  const effectiveFrom = Math.min(to, Math.max(from, Math.min(...baselineRuns.map(r => r.startDepth))));
  const depths = [...new Set(Array.from({ length: 5 }, (_, i) => Math.round(effectiveFrom + (to - effectiveFrom) * i / 4)))];
  const configs = new Map();
  const add = amber => {
    const config = normalizeSpelunkConfig(input, { ...base, policy: 'amber-farm', amber });
    const key = JSON.stringify(config);
    if (configs.has(key)) return null;
    configs.set(key, config); return config;
  };
  for (const dumpDepth of depths) for (const finishers of [1, 2].filter(n => n <= base.party.length))
    for (const reservePct of [25, 50, 75, 100]) for (const harvestDepths of [0, 3, 8]) {
      add({ dumpDepth, finishers, reservePct, harvestDepths, ropeReservePct: 25 });
    }
  for (const dumpDepth of depths) for (const finishers of [1, 2].filter(n => n <= base.party.length))
    for (const [reservePct, harvestDepths, ropeReservePct] of [[25, 0, 5], [50, 1, 10], [75, 3, 50], [100, 8, 75], [50, 16, 50]])
      add({ dumpDepth, finishers, reservePct, harvestDepths, ropeReservePct });
  if (base.policy === 'amber-farm') configs.set(JSON.stringify(base), base);
  const coarse = yield* measure([...configs.values()], screening, .03, .3, 'Screening diverse Amber phase strategies');
  const raceTrials = Math.max(8, screening);
  let leaders = yield* measure(_amberLeaders(coarse, 12).map(r => r.config), raceTrials, .3, .4,
    'Checking distinct Amber behaviors on more shared seeds');
  for (let round = 0; round < 2; round++) {
    const neighbors = [], step = round ? 1 : Math.max(1, Math.round((to - effectiveFrom) / 8));
    for (const row of _amberLeaders(leaders, 6)) {
      const a = row.config.amber;
      const propose = patch => {
        const c = add({ ...a, ...patch });
        if (c) neighbors.push(c);
      };
      for (const dumpDepth of [a.dumpDepth - step, a.dumpDepth + step,
        ...row.runs.flatMap(r => r.amber?.activations?.length
          ? [r.amber.activations[0].depth - 1, r.amber.activations[0].depth, r.amber.activations[0].depth + 1] : [])])
        propose({ dumpDepth: Math.max(effectiveFrom, Math.min(to, dumpDepth)) });
      for (const sign of [-1, 1]) {
        propose({ reservePct: Math.max(25, Math.min(100, a.reservePct + sign * (round ? 10 : 25))) });
        propose({ harvestDepths: Math.max(0, Math.min(100, a.harvestDepths + sign * (round ? 1 : 3))) });
        propose({ ropeReservePct: Math.max(1, Math.min(100, a.ropeReservePct + sign * (round ? 5 : 15))) });
        propose({ reservePct: Math.max(25, Math.min(100, a.reservePct + sign * 25)),
          ropeReservePct: Math.max(1, Math.min(100, a.ropeReservePct - sign * 15)) });
      }
      if (base.party.length > 1) propose({ finishers: 3 - a.finishers });
    }
    const start = .4 + round * .18;
    const screened = yield* measure(neighbors, screening, start, start + .1,
      `Refining Amber depths and reserves (${round + 1}/2)`);
    const raced = yield* measure(_amberLeaders(screened, 12).map(r => r.config), raceTrials, start + .1, start + .18,
      `Remeasuring refined Amber strategies (${round + 1}/2)`);
    leaders = _amberLeaders([...leaders, ...raced], 12);
  }
  const rank = (a, b) => b.score - a.score;
  const finalists = [...new Map([[JSON.stringify(base), base],
    ..._amberLeaders(leaders, 8).map(r => [JSON.stringify(r.config), r.config])]).values()];
  const finalRuns = finalists.map(() => []);
  let rows, count = 0, target = trials, adaptiveRounds = 0, unresolved = false, riskUncertain = false;
  while (true) {
    const requests = [];
    for (let t = count; t < target; t++) finalists.forEach((config, i) => requests.push({
      config, seed: _seed(seed, t, true), progress: .76 + .23 * (t + i / finalists.length) / maxTrials,
      phase: `Fresh-seed Amber and rope-risk comparison (${target} trials)`,
    }));
    const measured = yield* _measure(requests, batchSize);
    measured.forEach((r, i) => finalRuns[i % finalists.length].push(r));
    count = target;
    rows = finalists.map((config, i) => ({ label: i ? 'Phased Amber strategy' : 'Selected baseline',
      referenceOnly: config.policy !== 'amber-farm', ..._summary(config, finalRuns[i], input, objective) }));
    rows.forEach(row => { row.riskEligible = row.rope / row.total * 100 >= minRopePct; });
    const eligible = rows.filter(r => !r.referenceOnly && r.riskEligible).sort(rank);
    const best = eligible[0], challengers = rows.filter(r => r !== best && (r === rows[0] || !r.referenceOnly));
    let closeDifferent = false;
    unresolved = !!best && challengers.map(r => {
      const { interval } = _amberDifference(best, r);
      const overlap = interval[0] <= 0 && interval[1] >= 0;
      if (overlap && r.runs.some((run, i) => run.metric !== best.runs[i].metric)) closeDifferent = true;
      return overlap;
    }).some(Boolean);
    riskUncertain = rows.some(r => !r.referenceOnly && _amberRopeUncertain(r, minRopePct)
      && (!best || r.score + 1.96 * r.se >= best.score - 1.96 * best.se));
    if (count >= maxTrials || (!closeDifferent && !riskUncertain
      && (!unresolved || count >= Math.min(32, maxTrials)))) break;
    target = Math.min(maxTrials, Math.max(count * 2, Math.min(32, maxTrials)));
    adaptiveRounds++;
  }
  const grouped = new Map();
  const baseRow = rows[0], display = [baseRow];
  if (!baseRow.referenceOnly) grouped.set(_amberOutcomeKey(baseRow), baseRow);
  for (const row of rows.slice(1)) {
    const key = _amberOutcomeKey(row), previous = grouped.get(key);
    if (previous) { previous.matchingStrategies = (previous.matchingStrategies ?? 0) + 1; continue; }
    grouped.set(key, row); display.push(row);
  }
  rows = display;
  const winner = rows.filter(row => !row.referenceOnly && row.riskEligible).sort(rank)[0] ?? null;
  const { delta, interval } = winner ? _amberDifference(winner, baseRow) : { delta: null, interval: null };
  return { kind: 'amber-search', objective, rows, winner, baseline: baseRow, delta,
    interval, screened: configs.size, exhaustive: false,
    amberSearch: { from, to, effectiveFrom, depths, minRopePct, screening, trials: count, initialTrials: trials, maxTrials,
      coarse: coarse.length, refined: configs.size - coarse.length, racingTrials: raceTrials, adaptiveRounds,
      observedBehaviors: new Set(coarse.map(r => _amberOutcomeKey(r, screening))).size,
      finalistStrategies: finalists.length, unresolved, riskUncertain },
    claim: 'Bounded diverse phase search with two local-refinement rounds and fresh-seed adaptive comparison. Observed ties are unresolved; rope percentages and change intervals are descriptive, not guaranteed safety or a global optimum.' };
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
    ? scope.speeds.length * _autoClears(scope).length : _enabled(scope, 'tools') ? input.tools.length + 1 : 1), 0);
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
      for (const fullClear of policy === 'auto' ? _autoClears(scope) : [base.fullClear])
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
