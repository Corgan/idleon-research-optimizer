// ===== ROYAL UNIT EXP PLANNER (W7) =====
import * as R from './royal-guardian.js';

const n = value => Number(value) || 0;
const MAX_HOURS = 87600;
const MAX_EVENTS = 50000;
const TARGET_BARS = { trading: 0, command: 2, military: 3 };
// Purity targets and purification changes are intentionally excluded; saved purified states stay fixed.
const TRANSIENT_TYPES = [4, 5, 6];
const EPSILON = 1e-9;
const CHART_SAMPLES = 240;
const JOINT_LIMIT = 400;

function _req(rank, bar) { return R.outpostExpFormula(rank, bar); }
function _rankFrom(exp, bar, rank) { while (exp >= _req(rank, bar)) rank++; return rank; }
function _highest(ranks) { let bar = 0; for (let index = 1; index < 5; index++) if (ranks[index] > ranks[bar]) bar = index; return bar; }
function _same(a, b) { return Math.abs(a - b) <= EPSILON * Math.max(1, Math.abs(a), Math.abs(b)); }

function _targets(S, raw = {}) {
	const unlocked = R.outpostUnlockedBars(S);
	const targets = {};
	for (const [key, bar] of Object.entries(TARGET_BARS)) {
		const value = raw?.[key];
		if (value === null || value === undefined || value === '') { targets[key] = null; continue; }
		const rank = Number(value);
		if (!Number.isInteger(rank) || rank < 1 || rank > 500) throw new RangeError(`${R.outpostRankName(bar)} target must be an integer between 1 and 500.`);
		if (!unlocked[bar]) throw new RangeError(`${R.outpostRankName(bar)} is locked.`);
		targets[key] = rank;
	}
	if (Object.values(targets).every(value => value === null)) throw new RangeError('Set at least one target rank.');
	return targets;
}

function _model(S, mapIdx, ext) {
	const a72 = R.armoryBonus(S, 72) / 100;
	const mult = 1 + R.outpostRank(S, mapIdx, 1) * a72;
	const units = R.outpostUnits(S, mapIdx);
	const order = R.militiaAssignments(S).filter(item => item.mapIdx === mapIdx && item.type >= 4 && item.type <= 7).map(item => item.type);
	const counts = [0, 0, 0, 0, 0, 0, 0, 0];
	for (const type of order) counts[type]++;
	const unlocked = Math.min(4, 1 + [27, 28, 29].reduce((sum, index) => sum + Math.min(1, R.armoryLevel(S, index)), 0)) === 4;
	const pool = units.filter(unit => unit.type === 1 || unit.type === 3).length;
	const current = units.filter(unit => unit.type === 1).length;
	return {
		a72, unlocked, pool, current, order, counts, feed: R.armoryLevel(S, 17) >= 1,
		K: [0, 1, 2, 3, 4].map(bar => R.barExpRate(S, bar, mapIdx, ext) / mult),
		legal: unlocked ? Array.from({ length: pool + 1 }, (_, traders) => traders) : [...new Set([current, pool])].sort((a, b) => a - b),
	};
}

function _rates(m, ranks, traders, counts, out) {
	const mult = 1 + ranks[1] * m.a72;
	out[0] = m.K[0] * mult * (traders + Math.ceil(Math.max(0, ranks[2] - 1) / 4));
	out[1] = m.K[1] * mult * (m.pool - traders + Math.ceil(Math.max(0, ranks[2] - 3) / 4));
	out[2] = m.K[2] * mult * counts[5];
	out[3] = m.K[3] * mult * counts[6];
	out[4] = m.K[4] * mult * counts[7];
	if (m.feed && counts[4]) out[_highest(ranks)] += m.K[3] * mult / 2 * counts[4];
	return out;
}

function _add(state, bar, amount) {
	const next = state.exp[bar] + amount;
	if (!Number.isFinite(next)) throw new RangeError('Rank projection exceeded the supported numeric range.');
	state.exp[bar] = next;
	state.ranks[bar] = _rankFrom(next, bar, state.ranks[bar]);
}

// One native CollectAll for this outpost: Trading, Intel, then saved transient order.
function _collectOnce(m, state, hours) {
	const rate = _rates(m, state.ranks, m.current, [0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0]);
	_add(state, 0, rate[0] * hours);
	_add(state, 1, rate[1] * hours);
	for (const type of m.order) {
		const mult = 1 + state.ranks[1] * m.a72;
		if (type >= 5) _add(state, type - 3, m.K[type - 3] * mult * hours);
		else if (m.feed) _add(state, _highest(state.ranks), m.K[3] * mult / 2 * hours);
	}
}

function _met(targets, ranks) {
	return (targets.trading === null || ranks[0] >= targets.trading) && (targets.command === null || ranks[2] >= targets.command) && (targets.military === null || ranks[3] >= targets.military);
}

function _reachable(m, targets, ranks, counts) {
	const feed = m.feed && counts[4] > 0;
	if (targets.command !== null && ranks[2] < targets.command && !counts[5] && !(feed && _highest(ranks) === 2)) return 'command';
	if (targets.military !== null && ranks[3] < targets.military && !counts[6] && !(feed && _highest(ranks) === 3)) return 'military';
	if (targets.trading !== null && ranks[0] < targets.trading && !m.pool && !feed && ranks[2] < 2 && !counts[5]) return 'trading';
	return null;
}

function _policy(m, targets, spec) {
	return ranks => {
		const switched = ranks[1] >= spec.switchRank;
		if (m.unlocked && targets.trading !== null && ranks[0] >= targets.trading) return spec.after;
		if (m.unlocked && targets.trading === null) return spec.after;
		return switched ? spec.second : spec.first;
	};
}

function _run(m, start, targets, counts, spec, cutoff = Infinity, record = false) {
	const exp = start.exp.slice(), ranks = start.ranks.slice(), rate = [0, 0, 0, 0, 0];
	const policy = _policy(m, targets, spec);
	const reachedAt = {};
	const steps = record ? [] : null;
	const trace = record ? [{ h: 0, e: exp.slice() }] : null;
	let hours = 0, events = 0, traders = m.current, changes = 0, switchedAt = ranks[1] >= spec.switchRank ? 0 : null;
	const mark = () => {
		for (const [key, bar] of Object.entries(TARGET_BARS)) if (targets[key] !== null && reachedAt[key] === undefined && ranks[bar] >= targets[key]) reachedAt[key] = hours;
		if (switchedAt === null && ranks[1] >= spec.switchRank) switchedAt = hours;
	};
	const done = (status, blocked = null) => ({ status, blocked, etaHours: status === 'reached' || status === 'already' ? hours : null, elapsedHours: hours, changes, switchedAt, reachedAt, finalRanks: ranks.slice(), finalExp: exp.slice(), steps, trace });
	mark();
	const unreachable = _reachable(m, targets, ranks, counts);
	if (unreachable && !_met(targets, ranks)) return done('no-progress', unreachable);
	for (;;) {
		if (_met(targets, ranks)) {
			if (record && !steps.length) steps.push({ hours, traders, surveyors: m.pool - traders, ranks: ranks.slice(), reason: 'start' });
			return done(hours === 0 ? 'already' : 'reached');
		}
		const next = policy(ranks);
		if (next !== traders || (record && !steps.length)) {
			if (next !== traders) changes++;
			if (record) steps.push({ hours, traders: next, surveyors: m.pool - next, ranks: ranks.slice(), reason: !steps.length ? 'start' : targets.trading !== null && ranks[0] >= targets.trading ? 'trading-target' : 'intel-rank' });
			traders = next;
		}
		_rates(m, ranks, traders, counts, rate);
		// A zero-rate bar keeps its rank, so it can never become the militia-fed highest bar.
		for (const [key, bar] of [['command', 2], ['military', 3]]) if (targets[key] !== null && ranks[bar] < targets[key] && !(rate[bar] > 0)) return done('no-progress', key);
		let dt = Infinity, bar = -1;
		for (let index = 0; index < 5; index++) if (rate[index] > 0) {
			const need = Math.max(0, (_req(ranks[index], index) - exp[index]) / rate[index]);
			if (need < dt) { dt = need; bar = index; }
		}
		if (bar < 0) return done('no-progress', ['trading', 'command', 'military'].find(key => targets[key] !== null && ranks[TARGET_BARS[key]] < targets[key]) || null);
		if (hours + dt > cutoff && cutoff < MAX_HOURS) return done('cutoff');
		if (hours + dt > MAX_HOURS) { hours = MAX_HOURS; return done('limit'); }
		if (++events > MAX_EVENTS) return done('limit');
		for (let index = 0; index < 5; index++) {
			exp[index] += rate[index] * dt;
			if (!Number.isFinite(exp[index])) throw new RangeError('Rank projection exceeded the supported numeric range.');
		}
		exp[bar] = Math.max(exp[bar], _req(ranks[bar], bar));
		hours += dt;
		for (let index = 0; index < 5; index++) ranks[index] = _rankFrom(exp[index], index, ranks[index]);
		if (trace) trace.push({ h: hours, e: exp.slice() });
		mark();
	}
}

function _fracRank(exp, bar) {
	const rank = _rankFrom(exp, bar, 0);
	const previous = rank ? _req(rank - 1, bar) : 0, next = _req(rank, bar);
	return rank + Math.max(0, Math.min(1, (exp - previous) / Math.max(1e-12, next - previous)));
}

// Rates are constant between recorded events, so linear EXP interpolation between them is exact.
function _chart(trace, extraTimes = [], count = CHART_SAMPLES) {
	const end = trace[trace.length - 1].h;
	const times = new Set();
	for (let k = 0; k < count; k++) times.add(count > 1 ? end * k / (count - 1) : 0);
	for (const time of extraTimes) if (Number.isFinite(time) && time >= 0 && time <= end) times.add(time);
	const chart = { hours: [], ranks: [[], [], [], []], exp: [[], [], [], []] };
	let i = 0;
	for (const time of [...times].sort((a, b) => a - b)) {
		while (i < trace.length - 2 && trace[i + 1].h < time) i++;
		const a = trace[i], b = trace[Math.min(i + 1, trace.length - 1)], span = b.h - a.h;
		const w = span > 0 ? Math.max(0, Math.min(1, (time - a.h) / span)) : 1;
		chart.hours.push(time);
		for (let bar = 0; bar < 4; bar++) {
			const exp = a.e[bar] + (b.e[bar] - a.e[bar]) * w;
			chart.exp[bar].push(exp);
			chart.ranks[bar].push(_fracRank(exp, bar));
		}
	}
	return chart;
}

function _rankUps(trace, bar, limit = 300) {
	const out = [];
	let rank = _rankFrom(trace[0].e[bar], bar, 0);
	for (const point of trace) {
		const next = _rankFrom(point.e[bar], bar, rank);
		if (next > rank && out.length < limit) out.push({ hours: point.h, rank: next });
		rank = next;
	}
	return out;
}

function _better(result, best) {
	if (result.etaHours === null) return false;
	if (!best || best.result.etaHours === null) return true;
	if (!_same(result.etaHours, best.result.etaHours)) return result.etaHours < best.result.etaHours;
	return result.changes < best.result.changes;
}

function _optimize(m, start, targets, counts) {
	const fixed = traders => ({ first: traders, second: traders, after: traders, switchRank: Infinity });
	const after = m.unlocked ? 0 : m.current;
	let best = null;
	const consider = spec => {
		const cutoff = best ? best.result.etaHours * (1 + 1e-9) + 1e-9 : Infinity;
		const result = _run(m, start, targets, counts, spec, cutoff);
		if (_better(result, best)) best = { spec, result };
		return result;
	};
	const baseSpec = fixed(m.current), base = consider(baseSpec);
	if (base.status === 'already' || base.status === 'no-progress') return { spec: baseSpec, result: base };
	for (const traders of m.legal) consider({ ...fixed(traders), after: m.unlocked ? after : traders });
	if (targets.trading !== null) {
		const firsts = m.unlocked ? m.legal : [m.current];
		for (const first of firsts) for (const second of m.legal) {
			if (second <= first) continue;
			for (let switchRank = start.ranks[1] + 1; switchRank < start.ranks[1] + 1000; switchRank++) {
				const result = consider({ first, second, after: m.unlocked ? after : second, switchRank });
				if (result.switchedAt === null) break;
			}
		}
	}
	return best || { spec: baseSpec, result: base };
}

function _digits(packed) { return String(Math.max(0, Math.floor(n(packed)))).padStart(9, '0').slice(-9).split(''); }
function _retarget(digits, traders) {
	const slots = digits.map((digit, slot) => ({ slot, type: digit === '3' ? 1 : digit === '5' ? 3 : -1 })).filter(unit => unit.type >= 0);
	const current = slots.filter(unit => unit.type === 1).length;
	const from = traders > current ? 3 : 1, to = traders > current ? 1 : 3;
	let remaining = Math.abs(traders - current);
	const next = digits.slice(), changes = [];
	for (const unit of slots) if (remaining && unit.type === from) {
		next[unit.slot] = String(to + 2);
		changes.push({ slot: unit.slot, from, to });
		remaining--;
	}
	return { digits: next, changes };
}

function _summary(m, packed, best, start, targets, counts) {
	const replay = _run(m, start, targets, counts, best.spec, Infinity, true);
	let digits = _digits(packed);
	const steps = replay.steps.map(step => {
		const next = _retarget(digits, step.traders);
		digits = next.digits;
		return { ...step, changes: next.changes, packed: Number(digits.join('')) };
	});
	const chart = _chart(replay.trace, [...steps.map(step => step.hours), ...Object.values(replay.reachedAt)]);
	return { status: replay.status, blocked: replay.blocked, etaHours: replay.etaHours, elapsedHours: replay.elapsedHours, reachedAt: replay.reachedAt, finalRanks: replay.finalRanks, spec: best.spec, steps, switches: Math.max(0, steps.length - 1), chart, intelRankUps: _rankUps(replay.trace, 1) };
}

function _transientPools(S, mapIdx, ext) {
	const all = R.militiaAssignments(S, R.outpostWorld(mapIdx));
	return TRANSIENT_TYPES.map(type => {
		const donors = all.filter(item => item.type === type && item.mapIdx !== mapIdx && (type !== 4 || R.outpostBuilt(S, item.mapIdx))).map(item => {
			const built = R.outpostBuilt(S, item.mapIdx);
			let bar = type - 3;
			if (type === 4) { bar = 0; for (let index = 1; index < 5; index++) if (R.outpostRank(S, item.mapIdx, index) > R.outpostRank(S, item.mapIdx, bar)) bar = index; }
			const lostRate = !built ? 0 : type === 4 ? (R.armoryLevel(S, 17) >= 1 ? R.barExpRate(S, 3, item.mapIdx, ext) / 2 : 0) : R.barExpRate(S, type - 3, item.mapIdx, ext);
			return { ...item, name: R.transientUnitName(type), bar, lostRate };
		}).sort((a, b) => a.lostRate - b.lostRate || a.mapIdx - b.mapIdx || a.assignmentIdx - b.assignmentIdx);
		return { type, name: R.transientUnitName(type), donors };
	});
}

export function planRoyalUnitExp(S, mapIdx, options = {}) {
	if (!Number.isInteger(mapIdx) || mapIdx < 0) throw new RangeError('Select a valid outpost.');
	if (!R.hasCompleteRoyalData(S) || !R.outpostBuilt(S, mapIdx)) return { available: false, reason: 'Complete Royal save data and a built outpost are required.' };
	const unlocked = R.outpostUnlockedBars(S);
	if (!Object.values(TARGET_BARS).some(bar => unlocked[bar])) return { available: false, reason: 'Unlock Trading, Command, or Military Rank to plan.' };
	const targets = _targets(S, options.targets);
	const row = S.royalMapsData[mapIdx];
	if (row.slice(3, 8).some(value => !Number.isFinite(Number(value ?? 0)))) throw new RangeError('Saved rank EXP must contain finite numbers.');
	if (!Number.isFinite(Number(S.royalGData?.[3]?.[0] ?? 0))) throw new RangeError('Saved banked time must be finite.');
	const ext = { ...(options.ext || {}) };
	ext.derivedInputs ||= R.royalGuardianDerivedInputs(S);
	const m = _model(S, mapIdx, ext);
	const saved = { exp: [0, 1, 2, 3, 4].map(bar => n(row[3 + bar])), ranks: [0, 1, 2, 3, 4].map(bar => R.outpostRank(S, mapIdx, bar)) };
	const start = { exp: saved.exp.slice(), ranks: saved.ranks.slice() };
	const bankedHours = Math.max(0, n(S.royalGData?.[3]?.[0])) / 3600;
	if (bankedHours > 0) _collectOnce(m, start, bankedHours);
	const pools = options.moveTransients ? _transientPools(S, mapIdx, ext) : [];
	const cells = pools.reduce((sum, pool) => sum + pool.donors.length + 1, 0);
	const combos = pools.reduce((product, pool) => product * (pool.donors.length + 1), 1);
	const joint = combos <= JOINT_LIMIT;
	const total = 2 + (pools.length ? (joint ? combos : cells * 4) + cells : 0);
	let completed = 0;
	const tick = phase => options.onProgress?.({ phase, completed: Math.min(total, ++completed), total });
	const cache = new Map();
	const solve = counts => {
		const key = counts.join(',');
		if (!cache.has(key)) { cache.set(key, _optimize(m, start, targets, counts)); tick(pools.length ? 'transients' : 'planning'); }
		return cache.get(key);
	};
	const currentRun = _run(m, start, targets, m.counts, { first: m.current, second: m.current, after: m.current, switchRank: Infinity }, Infinity, true);
	tick('current');
	const stay = solve(m.counts);
	let bestCounts = m.counts.slice(), transients = null;
	if (pools.length) {
		const moved = counts => TRANSIENT_TYPES.reduce((sum, type) => sum + counts[type] - m.counts[type], 0);
		const better = (a, b) => {
			const ea = solve(a).result.etaHours, eb = solve(b).result.etaHours;
			if (ea === null) return false;
			if (eb === null) return true;
			return _same(ea, eb) ? moved(a) < moved(b) : ea < eb;
		};
		const withExtras = extras => { const counts = m.counts.slice(); pools.forEach((pool, index) => { counts[pool.type] += extras[index]; }); return counts; };
		// Targets often need several unit types at once, so single-type changes from the saved counts are not enough.
		if (joint) {
			const extras = pools.map(() => 0);
			for (let index = 0; index < combos; index++) {
				let rest = index;
				pools.forEach((pool, slot) => { extras[slot] = rest % (pool.donors.length + 1); rest = Math.floor(rest / (pool.donors.length + 1)); });
				const counts = withExtras(extras);
				if (better(counts, bestCounts)) bestCounts = counts;
			}
		} else {
			for (const seed of [m.counts.slice(), withExtras(pools.map(pool => pool.donors.length))]) {
				let local = seed;
				for (let round = 0; round < 8; round++) {
					let changed = false;
					for (const pool of pools) for (let extra = 0; extra <= pool.donors.length; extra++) {
						const counts = local.slice();
						counts[pool.type] = m.counts[pool.type] + extra;
						if (better(counts, local)) { local = counts; changed = true; }
					}
					if (!changed) break;
				}
				if (better(local, bestCounts)) bestCounts = local;
			}
		}
		const table = pools.map(pool => ({
			type: pool.type, name: pool.name, current: m.counts[pool.type], available: m.counts[pool.type] + pool.donors.length, best: bestCounts[pool.type],
			options: Array.from({ length: pool.donors.length + 1 }, (_, extra) => {
				const counts = bestCounts.slice();
				counts[pool.type] = m.counts[pool.type] + extra;
				const result = solve(counts).result;
				return { count: counts[pool.type], status: result.status, etaHours: result.etaHours, blocked: result.blocked };
			}),
		}));
		const moves = pools.flatMap(pool => pool.donors.slice(0, bestCounts[pool.type] - m.counts[pool.type]));
		transients = { table, counts: Object.fromEntries(TRANSIENT_TYPES.map(type => [type, bestCounts[type]])), moves, stayEtaHours: stay.result.etaHours, stayStatus: stay.result.status };
	}
	const best = solve(bestCounts);
	const plan = _summary(m, row[11], best, start, targets, bestCounts);
	options.onProgress?.({ phase: 'complete', completed: total, total });
	return {
		available: true, mapIdx, targets, pool: m.pool, currentTraders: m.current, surveyorsUnlocked: m.unlocked,
		bankedHours, startRanks: start.ranks.slice(), savedRanks: saved.ranks, startExp: start.exp.slice(),
		targetExp: Object.fromEntries(Object.entries(TARGET_BARS).map(([key, bar]) => [key, targets[key] === null ? null : _req(targets[key] - 1, bar)])),
		counts: Object.fromEntries([4, 5, 6, 7].map(type => [type, m.counts[type]])),
		plan,
		current: { status: currentRun.status, blocked: currentRun.blocked, etaHours: currentRun.etaHours, elapsedHours: currentRun.elapsedHours, reachedAt: currentRun.reachedAt, finalRanks: currentRun.finalRanks, chart: _chart(currentRun.trace, Object.values(currentRun.reachedAt)) },
		savedHours: plan.etaHours !== null && currentRun.etaHours !== null ? currentRun.etaHours - plan.etaHours : null,
		transients,
		limits: { hours: MAX_HOURS, events: MAX_EVENTS },
	};
}

// Continuous-collection projection with a fixed split; exported for verification and UI previews.
export function projectRoyalUnitExp(S, mapIdx, traders, hours, ext = {}) {
	ext = { ...ext };
	ext.derivedInputs ||= R.royalGuardianDerivedInputs(S);
	const m = _model(S, mapIdx, ext), row = S.royalMapsData[mapIdx];
	const state = { exp: [0, 1, 2, 3, 4].map(bar => n(row[3 + bar])), ranks: [0, 1, 2, 3, 4].map(bar => R.outpostRank(S, mapIdx, bar)) };
	const rate = [0, 0, 0, 0, 0];
	let elapsed = 0;
	while (elapsed < hours) {
		_rates(m, state.ranks, traders, m.counts, rate);
		let dt = hours - elapsed, bar = -1;
		for (let index = 0; index < 5; index++) if (rate[index] > 0) {
			const need = Math.max(0, (_req(state.ranks[index], index) - state.exp[index]) / rate[index]);
			if (need < dt) { dt = need; bar = index; }
		}
		for (let index = 0; index < 5; index++) state.exp[index] += rate[index] * dt;
		if (bar >= 0) state.exp[bar] = Math.max(state.exp[bar], _req(state.ranks[bar], bar));
		for (let index = 0; index < 5; index++) state.ranks[index] = _rankFrom(state.exp[index], index, state.ranks[index]);
		elapsed += dt;
	}
	return state;
}

// Native single collection of the saved banked time, for verification.
export function collectRoyalUnitExpOnce(S, mapIdx, hours, ext = {}) {
	ext = { ...ext };
	ext.derivedInputs ||= R.royalGuardianDerivedInputs(S);
	const m = _model(S, mapIdx, ext), row = S.royalMapsData[mapIdx];
	const state = { exp: [0, 1, 2, 3, 4].map(bar => n(row[3 + bar])), ranks: [0, 1, 2, 3, 4].map(bar => R.outpostRank(S, mapIdx, bar)) };
	_collectOnce(m, state, hours);
	return state;
}
