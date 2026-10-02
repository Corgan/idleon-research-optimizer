// ===== ROYAL FORECAST (W7) =====
// Event projection over native collections. State changes only at user-placed collects, menu-open windows
// (continuous collection), and daily resets; between them time banks and "ghost" markers show what a collect
// at that moment would commit. Layout, points, and currency are never spent.
import * as R from './royal-guardian.js';
import * as C from './royal-collect.js';
import { cloneRoyalState } from './royal-guardian-optimizer.js';
import { ARMORY_UPGRADES, ROYAL_RESOURCES } from '../../data/w7/royal-guardian.js';
import { optionsListData } from '../../../save/data.js';

const n = value => Number(value) || 0;
const EPSILON = 1e-9;
const RESET_INTERVAL = 24;
const RANK_GHOSTS = 3;
const GHOST_TOLERANCE = 1 / 240;
const MAX_WINDOW_STEPS = 4000;
export const FORECAST_LIMITS = { horizonHours: [1, 336, 72] };

function _clamp(value, [min, max, fallback]) { const v = Number(value); return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback; }
function _times(list, horizon) { return [...new Set((list || []).map(Number).filter(t => Number.isFinite(t) && t >= 0 && t <= horizon).map(t => Math.round(t * 1e6) / 1e6))].sort((a, b) => a - b); }
function _windows(list, horizon) {
	const items = (list || []).map(w => ({ start: Math.max(0, Number(w?.start)), end: Math.min(horizon, Number(w?.end)) })).filter(w => Number.isFinite(w.start) && Number.isFinite(w.end) && w.end - w.start > EPSILON).sort((a, b) => a.start - b.start);
	const merged = [];
	for (const w of items) { const last = merged[merged.length - 1]; if (last && w.start <= last.end + EPSILON) last.end = Math.max(last.end, w.end); else merged.push({ ...w }); }
	return merged;
}
function _inside(t, windows) { return windows.some(w => t > w.start - EPSILON && t < w.end + EPSILON); }
function _strictlyInside(t, windows) { return windows.some(w => t > w.start + EPSILON && t < w.end - EPSILON); }
function _counter(S) { return n(S?.olaData?.[480] ?? optionsListData?.[480]); }
function _released(index) { const r = ROYAL_RESOURCES[index]; return !!r && r.baseCapacity > 0 && r.currencySlot >= 0; }

function _armoryCandidates(S, counter) {
	const unlocked = R.armoryUnlockedCount(S); const order = R.armoryUnlockOrder(); const list = [];
	for (let orderIndex = 0; orderIndex < unlocked; orderIndex++) {
		const index = order[orderIndex]; const upgrade = ARMORY_UPGRADES[index];
		if (!upgrade || R.armoryLevel(S, index) >= n(upgrade.maxLevel)) continue;
		const cost = R.armoryUpgradeCost(S, orderIndex, { optionsList480: counter });
		if (!Number.isFinite(cost.value) || !(cost.currencySlot >= 0)) continue;
		list.push({ index, orderIndex, name: upgrade.name, level: R.armoryLevel(S, index), cost: cost.value, currencySlot: cost.currencySlot });
	}
	return list;
}

function _model(S, ext) {
	const streams = C.royalCollectStreams(S, ext);
	const { models, clears } = C.royalCollectExpModels(S, ext);
	const quantities = S.royalGData?.[4] || [];
	const nodes = new Map();
	for (const stream of streams) {
		let node = nodes.get(stream.resourceIdx);
		if (!node) nodes.set(stream.resourceIdx, node = { resourceIdx: stream.resourceIdx, quantity: n(quantities[stream.resourceIdx]), capacity: stream.capacity, grade: n(S.royalGData?.[5]?.[stream.resourceIdx]), drainRate: 0, currencyRate: 0, maps: [] });
		node.drainRate += stream.drainRate; if (stream.type === 0) node.currencyRate += stream.rate;
		if (!node.maps.includes(stream.mapIdx)) node.maps.push(stream.mapIdx);
	}
	return { streams, models, clears, nodes: [...nodes.values()] };
}
function _fillW(node) { return node.quantity <= -1 || node.drainRate <= 0 ? null : Math.max(0, (node.capacity - node.quantity) / node.drainRate); }
function _gains(model, w) {
	const quantities = []; const currencies = [];
	for (const node of model.nodes) quantities[node.resourceIdx] = node.quantity;
	C.applyRoyalCollectStreams(model.streams, quantities, currencies, w, null);
	return currencies;
}
function _balances(S) { return (S.royalGData?.[1] || []).map(n); }

function _rankGhosts(model, a, Ba, Bb) {
	const ghosts = [];
	if (Bb <= EPSILON) return ghosts;
	const rates = C.royalCollectExpRates(model);
	const atStart = C.previewRoyalCollectExp(model, Ba).ranks; const atEnd = C.previewRoyalCollectExp(model, Bb).ranks;
	for (let bar = 0; bar < 5; bar++) {
		if (!(rates[bar] > 0) && atEnd[bar] === model.ranks[bar]) continue;
		if (atStart[bar] > model.ranks[bar]) ghosts.push({ mapIdx: model.mapIdx, bar, rank: atStart[bar], from: model.ranks[bar], at: a, ready: true });
		for (let rank = atStart[bar] + 1; rank <= Math.min(atEnd[bar], atStart[bar] + RANK_GHOSTS); rank++) {
			let lo = Ba, hi = Bb;
			while (hi - lo > GHOST_TOLERANCE) { const mid = (lo + hi) / 2; if (C.previewRoyalCollectExp(model, mid).ranks[bar] >= rank) hi = mid; else lo = mid; }
			ghosts.push({ mapIdx: model.mapIdx, bar, rank, from: rank - 1, at: a + (hi - Ba) });
		}
	}
	return ghosts;
}

// Ghosts for a banked segment [a, b]: when a collect would fill nodes, commit ranks, afford upgrades, or secure clears.
function _segment(state, model, a, b, Ba, banks, counter) {
	const Bb = banks ? Ba + (b - a) : Ba;
	const segment = { start: a, end: b, bankedAtStart: Ba, bankedAtEnd: Bb, counter, ghosts: { fills: [], ranks: [], affordable: [], clears: [] }, nodes: [], currency: {} };
	const at = w => a + (w - Ba);
	const breaks = new Set([Ba, Bb]);
	for (const node of model.nodes) {
		const w = _fillW(node); const fillAt = w === null ? null : Math.max(a, at(w));
		const fraction = node.quantity <= -1 ? 1 : Math.max(0, node.quantity) / node.capacity;
		const projected = node.quantity <= -1 || node.drainRate <= 0 ? [{ t: a, f: fraction }, { t: b, f: fraction }] : fillAt !== null && fillAt <= b ? [{ t: a, f: Math.min(1, (Math.max(0, node.quantity) + node.drainRate * Ba) / node.capacity) }, { t: fillAt, f: 1 }, { t: b, f: 1 }] : [{ t: a, f: Math.min(1, (Math.max(0, node.quantity) + node.drainRate * Ba) / node.capacity) }, { t: b, f: Math.min(1, (Math.max(0, node.quantity) + node.drainRate * Bb) / node.capacity) }];
		segment.nodes.push({ resourceIdx: node.resourceIdx, maps: node.maps, capacity: node.capacity, grade: node.grade, quantity: node.quantity, drained: node.quantity <= -1, committed: fraction, projected, fillAt: fillAt !== null && fillAt <= b + EPSILON ? fillAt : null });
		if (banks && fillAt !== null && fillAt <= b + EPSILON) { segment.ghosts.fills.push({ resourceIdx: node.resourceIdx, maps: node.maps, at: fillAt }); if (w > Ba && w < Bb) breaks.add(w); }
	}
	if (!banks) return segment;
	const ws = [...breaks].sort((x, y) => x - y);
	const balances = _balances(state); const curves = ws.map(w => ({ t: at(w), gains: _gains(model, w) }));
	const slots = new Set(model.streams.filter(s => s.currencySlot >= 0).map(s => s.currencySlot));
	for (const slot of slots) segment.currency[slot] = curves.map(point => ({ t: point.t, v: n(balances[slot]) + n(point.gains[slot]) }));
	for (const candidate of _armoryCandidates(state, counter)) {
		const curve = segment.currency[candidate.currencySlot]; const balance = n(balances[candidate.currencySlot]);
		if (!curve || balance >= candidate.cost) continue;
		for (let i = 1; i < curve.length; i++) if (curve[i].v >= candidate.cost) { const p = curve[i - 1], q = curve[i]; const t = q.v === p.v ? q.t : p.t + (candidate.cost - p.v) / (q.v - p.v) * (q.t - p.t); segment.ghosts.affordable.push({ ...candidate, at: Math.max(a, t) }); break; }
	}
	for (const m of model.models) segment.ghosts.ranks.push(..._rankGhosts(m, a, Ba, Bb));
	for (const clear of model.clears) { const remaining = clear.requirement - clear.progress; if (remaining <= 0 || !(clear.rate > 0)) continue; const t = at(remaining / clear.rate); if (t <= b + EPSILON) segment.ghosts.clears.push({ mapIdx: clear.mapIdx, at: Math.max(a, t) }); }
	return segment;
}

function _commit(state, hours, ext, counter, t, kind) {
	const before = _balances(state); const candidates = _armoryCandidates(state, counter);
	const out = C.royalCollectAll(state, hours, ext);
	const after = _balances(state);
	const affordable = candidates.filter(c => n(before[c.currencySlot]) < c.cost && n(after[c.currencySlot]) >= c.cost);
	const gained = {}; for (const clear of out.clears) gained[clear.mapIdx] = (gained[clear.mapIdx] || 0) + clear.gain;
	const secured = Object.entries(gained).map(([mapIdx, gain]) => ({ mapIdx: Number(mapIdx), progress: n(state.royalMapsData[mapIdx]?.[0]), gain })).filter(c => { const requirement = R.outpostKillRequirement(c.mapIdx); return c.progress - c.gain < requirement && c.progress >= requirement; }).map(c => c.mapIdx);
	const points = {}; for (const up of out.rankUps) points[up.mapIdx] = up.pointsAfter - up.pointsBefore;
	return { at: t, kind, banked: hours, currency: out.currency, drained: out.drained, rankUps: out.rankUps, points, secured, affordable };
}

function _reset(state, model, segment, t) {
	const refill = R.armoryBonus(state, 70) >= 1; const grade = R.armoryBonus(state, 0) >= 1;
	const quantities = state.royalGData[4] ||= []; const refilled = []; const missed = [];
	const fills = new Map((segment?.ghosts.fills || []).map(g => [g.resourceIdx, g.at]));
	for (const node of model?.nodes || []) if (n(quantities[node.resourceIdx]) !== -1 && fills.has(node.resourceIdx) && fills.get(node.resourceIdx) <= t + EPSILON) missed.push({ resourceIdx: node.resourceIdx, readyAt: fills.get(node.resourceIdx), maps: node.maps });
	for (let index = 0; index < ROYAL_RESOURCES.length; index++) if (_released(index) && n(quantities[index]) === -1 && refill) {
		quantities[index] = 0;
		if (grade) { state.royalGData[5] ||= []; state.royalGData[5][index] = n(state.royalGData[5][index]) + 1; }
		refilled.push(index);
	}
	return { at: t, refills: refill, refilled, gradeGains: grade ? refilled.length : 0, missed };
}

// Continuous menu-open collection: native passes stepped exactly to each fill, rank, clear, or reset boundary.
function _active(state, ext, window, resets, counterAt, record) {
	const events = []; const total = { currency: {}, drained: [], rankUps: [], points: {}, secured: [], affordable: [], resets: [] };
	let t = window.start, steps = 0, truncated = false;
	while (t < window.end - EPSILON) {
		if (++steps > MAX_WINDOW_STEPS) { truncated = true; break; }
		const model = _model(state, ext);
		let dt = window.end - t;
		const reset = resets.find(r => r > t + EPSILON && r < window.end - EPSILON);
		if (reset !== undefined) dt = Math.min(dt, reset - t);
		for (const node of model.nodes) { const w = _fillW(node); if (w !== null) dt = Math.min(dt, w); }
		for (const m of model.models) { const rates = C.royalCollectExpRates(m); for (let bar = 0; bar < 5; bar++) if (rates[bar] > 0) dt = Math.min(dt, (R.outpostExpFormula(m.ranks[bar], bar) - m.exp[bar]) / rates[bar] * (1 + 1e-9)); }
		for (const clear of model.clears) if (clear.progress < clear.requirement && clear.rate > 0) dt = Math.min(dt, (clear.requirement - clear.progress) / clear.rate);
		dt = Math.max(dt, 1e-7);
		const commit = _commit(state, dt, ext, counterAt(t), t + dt, 'active');
		t += dt;
		for (const [slot, value] of Object.entries(commit.currency)) total.currency[slot] = (total.currency[slot] || 0) + value;
		for (const index of commit.drained) { total.drained.push(index); events.push({ kind: 'fill', at: t, resourceIdx: index }); }
		for (const up of commit.rankUps) { total.rankUps.push({ ...up, at: t }); events.push({ kind: 'rank', at: t, ...up }); }
		for (const [mapIdx, value] of Object.entries(commit.points)) total.points[mapIdx] = (total.points[mapIdx] || 0) + value;
		for (const mapIdx of commit.secured) { total.secured.push(mapIdx); events.push({ kind: 'clear', at: t, mapIdx }); }
		for (const item of commit.affordable) { total.affordable.push({ ...item, at: t }); events.push({ kind: 'affordable', at: t, ...item }); }
		record(t, model);
		if (reset !== undefined && Math.abs(t - reset) <= 1e-6) { const result = _reset(state, model, null, reset); total.resets.push(result); }
	}
	return { ...window, events, summary: total, steps, truncated };
}

export function forecastRoyal(S, options = {}) {
	const horizonHours = _clamp(options.horizonHours, FORECAST_LIMITS.horizonHours);
	if (!R.hasCompleteRoyalData(S)) return { available: false, partial: true, missing: [...(R.hasRoyalGData(S) ? [] : ['RoyalG']), ...(R.hasRoyalMapsData(S) ? [] : ['RoyalMaps'])], horizonHours };
	const ext = C.royalCollectExt(S, options.ext);
	const state = cloneRoyalState(S);
	state.royalGData[3] = Array.isArray(state.royalGData[3]) ? state.royalGData[3].slice() : [];
	const banks = C.royalBanksTime(S);
	const timing = R.royalResetTiming(S);
	const resets = []; if (timing.available) for (let r = timing.hoursRemaining; r <= horizonHours + EPSILON; r += RESET_INTERVAL) resets.push(r);
	const windows = _windows(options.windows, horizonHours);
	const requested = _times(options.collects, horizonHours);
	const collects = requested.filter(t => !_inside(t, windows));
	const ignored = requested.filter(t => _inside(t, windows));
	const savedCounter = _counter(S);
	const counterAt = t => resets.length && t >= resets[0] - EPSILON ? 0 : savedCounter;
	const boundaries = [
		...collects.map(t => ({ t, kind: 'collect', order: 1 })),
		...resets.filter(t => !_strictlyInside(t, windows)).map(t => ({ t, kind: 'reset', order: 0 })),
		...windows.map(window => ({ t: window.start, kind: 'window', order: 2, window })),
		{ t: horizonHours, kind: 'horizon', order: 3 },
	].sort((x, y) => x.t - y.t || x.order - y.order);
	const result = { available: true, partial: !timing.available, missing: timing.available ? [] : timing.missing.slice(), horizonHours, banks, bankedStartHours: C.royalBankedHours(S), resets, collects: [], ignoredCollects: ignored, windows: [], resetEvents: [], segments: [], tracks: {}, currency: {}, truncated: false };
	const tracked = new Set();
	const track = (t, model) => {
		if (model) for (const node of model.nodes) tracked.add(node.resourceIdx);
		for (const index of tracked) { const quantity = n(state.royalGData[4]?.[index]); (result.tracks[index] ||= []).push({ t, f: quantity <= -1 ? 1 : Math.max(0, quantity) / R.resourceCapacity(state, index), drained: quantity <= -1 }); }
		for (const [slot, value] of _balances(state).entries()) if (value || result.currency[slot]) (result.currency[slot] ||= []).push({ t, v: value });
	};
	let t = 0; let banked = banks ? C.royalBankedHours(S) : 0; let model = _model(state, ext); track(0, model);
	for (const boundary of boundaries) {
		if (boundary.t < t - EPSILON) continue;
		const segment = boundary.t > t + EPSILON ? _segment(state, model, t, boundary.t, banked, banks, counterAt(t)) : null;
		if (segment) result.segments.push(segment);
		if (banks) banked += boundary.t - t;
		t = boundary.t;
		if (boundary.kind === 'collect') { result.collects.push(_commit(state, banked, ext, counterAt(t), t, 'collect')); banked = 0; }
		else if (boundary.kind === 'reset') result.resetEvents.push(_reset(state, model, segment, t));
		else if (boundary.kind === 'window') {
			const entry = banked > 0 ? _commit(state, banked, ext, counterAt(t), t, 'window-entry') : null; banked = 0;
			if (entry) track(t);
			const active = _active(state, ext, boundary.window, resets, counterAt, (time, stepModel) => track(time, stepModel));
			result.windows.push({ ...active, entry });
			result.resetEvents.push(...active.summary.resets);
			if (active.truncated) result.truncated = true;
			t = boundary.window.end;
		}
		model = _model(state, ext); track(t, model);
		if (boundary.kind === 'horizon') break;
	}
	result.endBankedHours = banked;
	result.summary = _summary(result);
	return result;
}

function _summary(result) {
	const commits = [...result.collects, ...result.windows.flatMap(w => [w.entry, { ...w.summary, at: w.end }].filter(Boolean))];
	const currency = {}; let rankUps = 0; let points = 0; const secured = new Set();
	for (const c of commits) { for (const [slot, value] of Object.entries(c.currency || {})) currency[slot] = (currency[slot] || 0) + value; rankUps += (c.rankUps || []).length; for (const value of Object.values(c.points || {})) points += value; for (const mapIdx of c.secured || []) secured.add(mapIdx); }
	const refilled = result.resetEvents.reduce((sum, r) => sum + r.refilled.length, 0); const missed = result.resetEvents.reduce((sum, r) => sum + r.missed.length, 0);
	const gradeGains = result.resetEvents.reduce((sum, r) => sum + r.gradeGains, 0);
	return { collects: result.collects.length, windows: result.windows.length, currency, rankUps, points, secured: [...secured], refilled, missed, gradeGains, bankedAtHorizon: result.endBankedHours };
}

// First ghost of each kind at or after `fromHours`, for "next useful collect" cards.
export function nextRoyalForecastGhosts(forecast, fromHours = 0) {
	const out = {};
	for (const segment of forecast?.segments || []) for (const [kind, list] of Object.entries(segment.ghosts)) for (const ghost of list) if (ghost.at >= fromHours - EPSILON && (!out[kind] || ghost.at < out[kind].at)) out[kind] = ghost;
	return out;
}

function _blocked(t, blocked) { return (blocked || []).find(b => t >= b.start - EPSILON && t < b.end - EPSILON) || null; }
function _snap(t, step) { return Math.ceil(t / step - 1e-9) * step; }

// Suggested collects. `refills`: fewest collects so every node that can fill before each reset is drained in time.
// `interval`: every N awake hours. `blocked` is a list of forecast-hour intervals (sleep) to avoid.
export function suggestRoyalCollects(S, options = {}) {
	const fromHours = Math.max(0, n(options.fromHours)); const snap = Math.max(1 / 60, n(options.snapHours) || 1 / 12); const margin = Math.max(snap, n(options.marginHours) || 1 / 12);
	const blocked = (options.blocked || []).filter(b => b.end > b.start); const mode = options.mode || 'refills';
	const kept = _times(options.collects, Infinity).filter(t => t < fromHours - EPSILON);
	let collects = kept.slice();
	const base = { ...options, collects };
	const awake = t => { let time = t; for (let guard = 0; guard < 50; guard++) { const b = _blocked(time, blocked); if (!b) return time; time = b.end; } return time; };
	if (mode === 'interval' || mode === 'both') {
		const step = Math.max(0.5, n(options.intervalHours) || 6); const horizon = _clamp(options.horizonHours, FORECAST_LIMITS.horizonHours);
		for (let t = awake(_snap(fromHours + step, snap)); t <= horizon; t = awake(_snap(t + step, snap))) collects.push(t);
	}
	if (mode === 'refills' || mode === 'both') {
		const first = forecastRoyal(S, { ...base, collects });
		for (const reset of first.resets || []) {
			if (reset <= fromHours + margin) continue;
			const forecast = forecastRoyal(S, { ...base, collects });
			const segment = forecast.segments.find(s => s.start < reset - EPSILON && s.end >= reset - EPSILON);
			if (!segment) continue;
			const ready = segment.ghosts.fills.filter(g => g.at <= reset - margin).map(g => Math.max(g.at, fromHours, segment.start));
			if (!ready.length) continue;
			const options2 = [...new Set([Math.max(...ready), ...ready, ...blocked.map(b => b.end)])].map(t => _snap(t, snap)).filter(t => t >= Math.max(fromHours, segment.start) && t <= reset - margin && !_blocked(t, blocked));
			let best = null;
			for (const t of options2) { const count = ready.filter(r => r <= t + EPSILON).length; if (!best || count > best.count || (count === best.count && t < best.t)) best = { t, count }; }
			if (best) collects.push(best.t);
		}
	}
	collects = _times(collects, Infinity);
	return { collects, added: collects.filter(t => !kept.includes(t)) };
}
