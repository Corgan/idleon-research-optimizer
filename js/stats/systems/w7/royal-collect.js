// ===== ROYAL COLLECT ALL (W7) =====
// Exact port of the native `_customEvent_CollectAll`. The game runs it about every 41 frames while
// the Royal menu is open; otherwise elapsed seconds bank in RoyalG[3][0] (Armory 30) until the next pass.
// Rates are evaluated live per outpost exactly as the source does. DNSM unit/stat caches are assumed fresh.
import * as R from './royal-guardian.js';
import { ROYAL_RESOURCES } from '../../data/w7/royal-guardian.js';

const n = value => Number(value) || 0;
const ASSIGNMENT_WORLDS = 8;

export function royalCollectExt(S, ext) {
	ext = ext || {};
	const derived = ext.derivedInputs || ext._royalDerived;
	if (derived && ext.talent231Multi != null && ext.spelunkBigFish6 != null) return ext;
	const inputs = derived || R.royalGuardianDerivedInputs(S);
	// XtraClearKillz reads these two at the top level; lifting them avoids rebuilding derived inputs per call.
	return { ...ext, derivedInputs: inputs, talent231Multi: ext.talent231Multi ?? inputs.talent231Multi, spelunkBigFish6: ext.spelunkBigFish6 ?? inputs.spelunkBigFish6 };
}

// Account-wide inputs fixed for one native pass: the cached TotalStatz-based multiplier and Support link counts.
function _passExt(S, ext) {
	if (ext._globalResourceRate && ext._supportCounts) return ext;
	const counts = [];
	const maps = S?.royalMapsData || [];
	for (let mapIdx = 0; mapIdx < maps.length; mapIdx++) {
		if (!R.outpostBuilt(S, mapIdx) || R.outpostType(S, mapIdx) !== 1) continue;
		for (const connection of R.outpostConnections(S, mapIdx)) if (connection.kind === 'map') counts[connection.id] = (counts[connection.id] || 0) + 1;
	}
	return { ...ext, _globalResourceRate: R.globalResourceRateBreakdown(S, ext), _supportCounts: counts };
}

// Time banks only while Armory 30 is owned; otherwise collection happens only with the menu open.
export function royalBanksTime(S) { return n(S?.royalGData?.[2]?.[30]) > 0; }
export function royalBankedHours(S) { return Math.max(0, n(S?.royalGData?.[3]?.[0])) / 3600; }

function _row(S, mapIdx) { const row = S?.royalMapsData?.[mapIdx]; return Array.isArray(row) ? row : null; }
function _collecting(S, mapIdx) { const row = _row(S, mapIdx); return !!row && row.length > 2 && R.outpostBuilt(S, mapIdx); }
function _highestBar(S, mapIdx) { let bar = 0, best = -1; for (let index = 0; index < 5; index++) { const rank = R.outpostRank(S, mapIdx, index); if (rank > best) { best = rank; bar = index; } } return bar; }

// Resource streams in native processing order: map order, then link slot 0/1. Support outposts are skipped.
export function royalCollectStreams(S, ext) {
	ext = _passExt(S, royalCollectExt(S, ext));
	const streams = [];
	const savage = R.savageCollection(S);
	const maps = S?.royalMapsData || [];
	for (let mapIdx = 0; mapIdx < maps.length; mapIdx++) {
		if (!_collecting(S, mapIdx)) continue;
		const row = maps[mapIdx]; const type = n(row[10]);
		if (type === 1) continue;
		let base = null;
		for (let slot = 0; slot < 2; slot++) {
			const endpoint = R.parseConnectionEndpoint(row[8 + slot]);
			if (endpoint.kind !== 'resource' || !ROYAL_RESOURCES[endpoint.id]) continue;
			base ??= R.outpostResourceRateBreakdown(S, mapIdx, ext).value;
			const resourceIdx = endpoint.id;
			const rate = base * (1 + 25 * n(S?.royalGData?.[5]?.[resourceIdx]) / 100);
			streams.push({ mapIdx, slot, resourceIdx, type, rate, drainRate: type === 2 ? savage * rate : type === 0 ? rate : 0, savage: type === 2 ? savage : 0, capacity: R.resourceCapacity(S, resourceIdx), currencySlot: type === 0 ? ROYAL_RESOURCES[resourceIdx].currencySlot : -1 });
		}
	}
	return streams;
}

// Applies one resource pass to quantity/currency arrays. Normal streams clamp to the remaining amount and
// credit currency; Savage streams drain unclamped. Any stream that fills a node writes the -1 drained marker.
export function applyRoyalCollectStreams(streams, quantities, currencies, hours, out) {
	for (const stream of streams) {
		const index = stream.resourceIdx;
		const quantity = n(quantities[index]);
		if (!(quantity > -1)) continue;
		let amount = stream.rate * hours;
		if (stream.type === 0) {
			if (amount > stream.capacity - quantity) amount = stream.capacity - quantity;
			quantities[index] = quantity + amount;
			if (stream.currencySlot >= 0) currencies[stream.currencySlot] = n(currencies[stream.currencySlot]) + amount;
			if (out) { out.currency[stream.currencySlot] = (out.currency[stream.currencySlot] || 0) + amount; out.drain[index] = (out.drain[index] || 0) + amount; }
		} else if (stream.type === 2) {
			quantities[index] = quantity + stream.savage * amount;
			if (out) out.drain[index] = (out.drain[index] || 0) + stream.savage * amount;
		}
		if (n(quantities[index]) >= stream.capacity) { quantities[index] = -1; if (out && !out.drained.includes(index)) out.drained.push(index); }
	}
}

function _ranks(S, mapIdx) { return [0, 1, 2, 3, 4].map(bar => R.outpostRank(S, mapIdx, bar)); }

// Mutates S exactly like one native CollectAll over `hours` of banked time and returns what it committed.
export function royalCollectAll(S, hours, ext) {
	ext = _passExt(S, royalCollectExt(S, ext));
	hours = Math.max(0, n(hours));
	const out = { hours, currency: {}, drain: {}, drained: [], exp: [], rankUps: [], clears: [] };
	S.royalGData ||= []; S.royalGData[4] ||= []; S.royalGData[1] ||= [];
	const maps = S.royalMapsData || [];
	const before = new Map();
	for (let mapIdx = 0; mapIdx < maps.length; mapIdx++) if (_collecting(S, mapIdx)) before.set(mapIdx, { ranks: _ranks(S, mapIdx), exp: [3, 4, 5, 6, 7].map(index => n(maps[mapIdx][index])), points: R.outpostPointsLeft(S, mapIdx) });
	if (hours > 0) {
		applyRoyalCollectStreams(royalCollectStreams(S, ext), S.royalGData[4], S.royalGData[1], hours, out);
		for (let mapIdx = 0; mapIdx < maps.length; mapIdx++) {
			if (!_collecting(S, mapIdx)) continue;
			const row = maps[mapIdx]; const units = R.totalUnitsByType(S, mapIdx);
			row[3] = n(row[3]) + R.barExpRate(S, 0, mapIdx, ext) * units[1] * hours;
			row[4] = n(row[4]) + R.barExpRate(S, 1, mapIdx, ext) * units[3] * hours;
		}
		const feed = R.armoryBonus(S, 17) >= 1;
		for (let world = 0; world < ASSIGNMENT_WORLDS; world++) {
			const types = S.royalGData[6 + 2 * world]; const targets = S.royalGData[7 + 2 * world];
			if (!Array.isArray(types)) continue;
			for (let index = 0; index < types.length; index++) {
				const type = n(types[index]); const mapIdx = n(targets?.[index]); const row = _row(S, mapIdx);
				if (!row) continue;
				if (type >= 5 && type <= 7) row[type] = n(row[type]) + R.barExpRate(S, type - 3, mapIdx, ext) * hours;
				else if (type === 4) {
					if (row.length === 1) { const gain = R.unitSpecEffect(S, 4, ext) * hours; row[0] = n(row[0]) + gain; out.clears.push({ mapIdx, gain }); }
					else if (feed && row.length > 2) { const bar = _highestBar(S, mapIdx); row[3 + bar] = n(row[3 + bar]) + R.barExpRate(S, 3, mapIdx, ext) / 2 * hours; }
				}
			}
		}
	}
	for (const [mapIdx, prior] of before) {
		const ranks = _ranks(S, mapIdx); const row = maps[mapIdx];
		const gained = [3, 4, 5, 6, 7].map((index, bar) => n(row[index]) - prior.exp[bar]);
		out.exp.push({ mapIdx, gained });
		for (let bar = 0; bar < 5; bar++) if (ranks[bar] > prior.ranks[bar]) out.rankUps.push({ mapIdx, bar, from: prior.ranks[bar], to: ranks[bar], pointsBefore: prior.points, pointsAfter: R.outpostPointsLeft(S, mapIdx) });
	}
	if (S.royalGData[3]) S.royalGData[3][0] = 0;
	return out;
}

// Lightweight per-outpost EXP model for previews: K excludes the Intel multiplier, which can change mid-pass.
// It ignores the source's cross-map isMapPurified(bar) refresh, which royalCollectAll applies exactly.
export function royalCollectExpModels(S, ext) {
	ext = _passExt(S, royalCollectExt(S, ext));
	const a72 = R.armoryBonus(S, 72) / 100; const feed = R.armoryBonus(S, 17) >= 1;
	const order = new Map();
	for (let world = 0; world < ASSIGNMENT_WORLDS; world++) {
		const types = S?.royalGData?.[6 + 2 * world]; const targets = S?.royalGData?.[7 + 2 * world];
		if (Array.isArray(types)) for (let index = 0; index < types.length; index++) { const type = n(types[index]); const mapIdx = n(targets?.[index]); if (type >= 4 && type <= 7) { if (!order.has(mapIdx)) order.set(mapIdx, []); order.get(mapIdx).push(type); } }
	}
	const models = []; const clears = [];
	const maps = S?.royalMapsData || [];
	for (let mapIdx = 0; mapIdx < maps.length; mapIdx++) {
		const row = maps[mapIdx];
		if (Array.isArray(row) && row.length === 1) { const militia = (order.get(mapIdx) || []).filter(type => type === 4).length; if (militia) clears.push({ mapIdx, rate: militia * R.unitSpecEffect(S, 4, ext), progress: n(row[0]), requirement: R.outpostKillRequirement(mapIdx) }); continue; }
		if (!_collecting(S, mapIdx)) continue;
		const mult = 1 + R.outpostRank(S, mapIdx, 1) * a72; const units = R.totalUnitsByType(S, mapIdx);
		models.push({ mapIdx, a72, feed, traders: units[1], surveyors: units[3], order: order.get(mapIdx) || [], K: [0, 1, 2, 3, 4].map(bar => R.barExpRate(S, bar, mapIdx, ext) / mult), exp: [3, 4, 5, 6, 7].map(index => n(row[index])), ranks: _ranks(S, mapIdx) });
	}
	return { models, clears };
}

function _rankFrom(exp, bar, rank) { while (exp >= R.outpostExpFormula(rank, bar)) rank++; return rank; }

// EXP and ranks after one native pass of `hours` for one outpost model.
export function previewRoyalCollectExp(model, hours) {
	const exp = model.exp.slice(); const ranks = model.ranks.slice();
	const add = (bar, amount) => { exp[bar] += amount; ranks[bar] = _rankFrom(exp[bar], bar, ranks[bar]); };
	const mult0 = 1 + ranks[1] * model.a72;
	add(0, model.K[0] * mult0 * model.traders * hours);
	add(1, model.K[1] * mult0 * model.surveyors * hours);
	for (const type of model.order) {
		const mult = 1 + ranks[1] * model.a72;
		if (type >= 5) add(type - 3, model.K[type - 3] * mult * hours);
		else if (model.feed) { let bar = 0; for (let index = 1; index < 5; index++) if (ranks[index] > ranks[bar]) bar = index; add(bar, model.K[3] * mult / 2 * hours); }
	}
	return { exp, ranks };
}

// First-order continuous rates per bar (used to step menu-open windows between threshold events).
export function royalCollectExpRates(model) {
	const mult = 1 + model.ranks[1] * model.a72; const rates = [0, 0, 0, 0, 0];
	rates[0] = model.K[0] * mult * model.traders; rates[1] = model.K[1] * mult * model.surveyors;
	let bar = 0; for (let index = 1; index < 5; index++) if (model.ranks[index] > model.ranks[bar]) bar = index;
	for (const type of model.order) { if (type >= 5) rates[type - 3] += model.K[type - 3] * mult; else if (model.feed) rates[bar] += model.K[3] * mult / 2; }
	return rates;
}
