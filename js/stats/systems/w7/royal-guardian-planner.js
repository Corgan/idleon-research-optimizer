// ===== ROYAL GUARDIAN PLANNER (W7) =====
import * as R from './royal-guardian.js';
import * as O from './royal-guardian-optimizer.js';
import { ARMORY_UPGRADES, ROYAL_RESOURCES } from '../../data/w7/royal-guardian.js';
import { optionsListData } from '../../../save/data.js';

const n = value => Number(value) || 0;
const PLANNER_LIMITS = { horizonHours: [0, 8760, 168], maxEvents: [1, 5000, 500], maxPurchases: [0, 50, 12], beamWidth: [1, 30, 8], sequenceCap: [1, 2000, 250] };
function _boundedOption(value, [minimum, maximum, fallback], integer = false) {
	const numeric = Number(value);
	if (Number.isNaN(numeric)) return fallback;
	const bounded = numeric === Infinity ? maximum : numeric === -Infinity ? minimum : Math.min(maximum, Math.max(minimum, numeric));
	return integer ? Math.floor(bounded) : bounded;
}
function _normalizedControls(options) {
	return {
		horizonHours: _boundedOption(options.horizonHours ?? options.horizon ?? PLANNER_LIMITS.horizonHours[2], PLANNER_LIMITS.horizonHours),
		maxEvents: _boundedOption(options.maxEvents ?? PLANNER_LIMITS.maxEvents[2], PLANNER_LIMITS.maxEvents, true),
		maxPurchases: _boundedOption(options.maxPurchases ?? PLANNER_LIMITS.maxPurchases[2], PLANNER_LIMITS.maxPurchases, true),
		candidateCap: _boundedOption(options.candidateCap ?? 100, [1, 5000, 100], true),
		beamWidth: _boundedOption(options.beamWidth ?? PLANNER_LIMITS.beamWidth[2], PLANNER_LIMITS.beamWidth, true),
		sequenceCap: _boundedOption(options.sequenceCap ?? PLANNER_LIMITS.sequenceCap[2], PLANNER_LIMITS.sequenceCap, true)
	};
}
const EPSILON = 1e-9;
const BOUNDARY_EPSILON = 1e-7;
function _clone(value) { if (typeof structuredClone === 'function') { try { return structuredClone(value); } catch {} } if (Array.isArray(value)) return value.map(_clone); if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, _clone(item)])); return value; }
function _royalSnapshot(S) { return { royalGData: _clone(S?.royalGData || []), royalMapsData: _clone(S?.royalMapsData || []), royalGDataAvailable: S?.royalGDataAvailable ?? true, royalMapsDataAvailable: S?.royalMapsDataAvailable ?? true, royalDataAvailable: S?.royalDataAvailable ?? true }; }
function _save(plan) { return plan.saveData || plan.state || plan.S; }
function _setSave(plan, save) { plan.saveData = save; plan.state = save; plan.S = save; }
function _planningOptions(S, options) {
	const sourceExt = options.ext || {};
	const supplied = sourceExt.derivedInputs || sourceExt._royalDerived;
	const derivedInputs = Object.freeze({ ...(supplied || R.royalGuardianDerivedInputs(S)) });
	return { ...options, ext: Object.freeze({ ...sourceExt, derivedInputs }), _derivedInputEvaluations: supplied ? 0 : 1 };
}
function _reportProgress(options, phase, completed, total, detail = {}) {
	if (typeof options?.onProgress !== 'function') return;
	options.onProgress({ phase, completed: Math.max(0, n(completed)), total: Math.max(1, n(total)), ...detail });
}
function _push(plan, event) { plan.events.push({ timeHours: plan.elapsedHours, ...event }); }
function _missing(plan, values) { for (const value of values || []) if (value && !plan.missing.includes(value)) plan.missing.push(value); }
function _releasedResource(index) { const resource = ROYAL_RESOURCES[index]; return !!resource && resource.baseCapacity > 0 && resource.currencySlot >= 0; }
function _ledgerKey(mapIdx, resourceIdx, slot) { return `${mapIdx}:${resourceIdx}:${slot}`; }
function _targetCurrency(options) { const target = options.targetCurrency ?? options.currencyTarget; if (target && typeof target === 'object') return { slot: n(target.slot ?? target.currencySlot ?? target.index), amount: n(target.amount ?? target.balance ?? target.value) }; if (target !== undefined && options.targetCurrencyAmount !== undefined) return { slot: n(target), amount: n(options.targetCurrencyAmount) }; return null; }
function _armoryGoal(S, options) { const target = options.targetArmory ?? options.armoryTarget; if (target === undefined || target === null) return null; const index = n(target?.index ?? target); const row = R.armoryRows(S).find(item => item.index === index); const cost = R.armoryUpgradeCost(S, row?.orderIndex ?? index, { optionsList480: options.optionsList480 }); const currencySlot = target?.currencySlot ?? cost.currencySlot; return { index, currencySlot, cost: cost.value, balance: n(S?.royalGData?.[1]?.[currencySlot]) }; }
function _streams(plan) { const allocation = O.resourceAllocationMetrics(_save(plan), { hours: 0, ext: plan.options.ext }); _missing(plan, allocation.missing); return allocation.details || []; }
function _rankDetails(plan) { const S = _save(plan); const details = []; for (let mapIdx = 0; mapIdx < (S?.royalMapsData || []).length; mapIdx++) if (R.outpostBuilt(S, mapIdx)) for (let bar = 0; bar < 5; bar++) { const info = R.outpostRankInfo(S, mapIdx, bar); details.push({ mapIdx, bar, ...info, rate: R.outpostRankExpPerHour(S, mapIdx, bar, plan.options.ext) }); } return details; }

export function createRoyalPlanState(S, options = {}) {
	const controls = _normalizedControls(options); const opts = _planningOptions(S, { ...options, ...controls }); const save = O.cloneRoyalState(_clone(S || {})); const reset = R.royalResetTiming(save); const horizonHours = controls.horizonHours;
	const complete = R.hasCompleteRoyalData(save); const plan = { saveData: save, state: save, S: save, options: opts, derivedInputEvaluations: opts._derivedInputEvaluations, elapsedHours: 0, horizonHours, events: [], actionLog: [], eventCount: 0, maxEvents: Math.max(1, Math.floor(n(opts.maxEvents ?? 500))), truncated: false, partial: !complete, missing: [], reset, nextResetHours: complete && reset.available ? reset.hoursRemaining : null, affordabilityEmitted: new Set(), ledger: { streams: {}, totals: { drain: 0, currency: {} } }, pointBalances: {}, done: horizonHours === 0 };
	if (!complete) { if (!R.hasRoyalGData(save)) _missing(plan, ['RoyalG']); if (!R.hasRoyalMapsData(save)) _missing(plan, ['RoyalMaps']); }
	if (!reset.available) { plan.partial = true; _missing(plan, reset.missing); } return plan;
}
export function royalPlanRates(plan, options) { if (options) plan.options = { ...plan.options, ...options }; const S = _save(plan); if (!R.hasCompleteRoyalData(S)) return { resources: [], currencyRates: {}, currencyIncome: {}, ranks: [], points: {}, permanentUnits: {}, balances: Array.isArray(S?.royalGData?.[1]) ? S.royalGData[1].slice() : [], partial: true, missing: plan.missing.slice() }; const resources = _streams(plan); const currencyRates = {}; for (const detail of resources) if (detail.currencySlot >= 0) currencyRates[detail.currencySlot] = (currencyRates[detail.currencySlot] || 0) + n(detail.currencyRate); const ranks = _rankDetails(plan); const points = {}; const permanentUnits = {}; for (const rank of ranks) points[rank.mapIdx] = R.outpostPointsLeft(S, rank.mapIdx); for (let mapIdx = 0; mapIdx < (S?.royalMapsData || []).length; mapIdx++) if (R.outpostBuilt(S, mapIdx)) permanentUnits[mapIdx] = R.permanentUnitDetails(S, mapIdx); return { resources, currencyRates, currencyIncome: currencyRates, ranks, points, permanentUnits, balances: Array.isArray(S?.royalGData?.[1]) ? S.royalGData[1].slice() : [], partial: plan.partial, missing: plan.missing.slice() }; }
function _nextRank(rates) { return rates.ranks.filter(item => item.rate > 0 && item.nextReq > item.exp).map(item => ({ hours: (item.nextReq - item.exp) / item.rate, kind: 'rank', mapIdx: item.mapIdx, bar: item.bar })).filter(item => item.hours > EPSILON).sort((a, b) => a.hours - b.hours || a.mapIdx - b.mapIdx || a.bar - b.bar)[0]; }
function _nextDepletion(rates) { return rates.resources.filter(item => item.rate > 0 && item.remaining > 0).map(item => ({ hours: item.remaining / item.rate, kind: 'depletion', resourceIdx: item.resourceIdx })).filter(item => item.hours > EPSILON).sort((a, b) => a.hours - b.hours || a.resourceIdx - b.resourceIdx)[0]; }
function _affordabilityKey(item) { return item.kind === 'currency-affordable' ? `currency:${item.currencySlot}:${item.amount}` : `armory:${item.index}:${item.currencySlot}:${item.cost}`; }
function _affordabilityCandidates(plan) { const S = _save(plan); const rates = royalPlanRates(plan); const candidates = []; const target = _targetCurrency(plan.options); if (target) { const balance = n(S?.royalGData?.[1]?.[target.slot]); const key = `currency:${target.slot}:${target.amount}`; if (!plan.affordabilityEmitted.has(key) && balance >= target.amount) candidates.push({ hours: 0, kind: 'currency-affordable', currencySlot: target.slot, amount: target.amount }); else if (!plan.affordabilityEmitted.has(key) && rates.currencyRates[target.slot] > 0 && balance < target.amount) candidates.push({ hours: (target.amount - balance) / rates.currencyRates[target.slot], kind: 'currency-affordable', currencySlot: target.slot, amount: target.amount }); }
	const armory = _armoryGoal(S, plan.options); if (armory && armory.currencySlot >= 0 && Number.isFinite(armory.cost)) { const key = `armory:${armory.index}:${armory.currencySlot}:${armory.cost}`; if (!plan.affordabilityEmitted.has(key) && armory.balance >= armory.cost) candidates.push({ hours: 0, kind: 'armory-affordable', index: armory.index, currencySlot: armory.currencySlot, cost: armory.cost }); else if (!plan.affordabilityEmitted.has(key) && armory.balance < armory.cost && rates.currencyRates[armory.currencySlot] > 0) candidates.push({ hours: (armory.cost - armory.balance) / rates.currencyRates[armory.currencySlot], kind: 'armory-affordable', index: armory.index, currencySlot: armory.currencySlot, cost: armory.cost }); }
	return candidates.sort((a, b) => a.hours - b.hours || a.kind.localeCompare(b.kind)); }
function _nextAffordable(plan) { return _affordabilityCandidates(plan)[0]; }
export function nextRoyalPlanEvent(plan, options) { if (options) plan.options = { ...plan.options, ...options }; const remaining = Math.max(0, plan.horizonHours - plan.elapsedHours); if (remaining <= EPSILON) return { hours: 0, kind: 'horizon' }; const rates = royalPlanRates(plan); const candidates = [{ hours: remaining, kind: 'horizon' }]; for (const item of [_nextDepletion(rates), _nextRank(rates), _nextAffordable(plan)]) if (item) candidates.push(item); if (plan.nextResetHours !== null) { const hours = plan.nextResetHours - plan.elapsedHours; if (hours >= -BOUNDARY_EPSILON && hours <= remaining + BOUNDARY_EPSILON) candidates.push({ hours: Math.max(0, Math.min(hours, remaining)), kind: 'reset' }); } const order = { depletion: 0, rank: 1, 'currency-affordable': 2, 'armory-affordable': 2, reset: 3, horizon: 4 }; return candidates.filter(item => item.hours >= 0).sort((a, b) => a.hours - b.hours || (order[a.kind] ?? 9) - (order[b.kind] ?? 9))[0]; }
function _advanceTime(plan, hours) {
	if (hours <= EPSILON) return;
	const S = _save(plan); const rates = royalPlanRates(plan); S.royalGData[4] ||= []; S.royalGData[1] ||= [];
	for (const detail of rates.resources) if (detail.rate > 0 && detail.remaining > 0) {
		const drained = Math.min(detail.remaining, detail.rate * hours);
		S.royalGData[4][detail.resourceIdx] = Math.max(0, n(R.resourceRawProgress(S, detail.resourceIdx))) + drained;
		for (const stream of detail.streams || []) {
			const share = drained * n(stream.drainRate) / detail.rate; const key = _ledgerKey(stream.mapIdx, detail.resourceIdx, stream.slot);
			const entry = plan.ledger.streams[key] ||= { mapIdx: stream.mapIdx, resourceIdx: detail.resourceIdx, slot: stream.slot, currencySlot: detail.currencySlot, drain: 0, currency: 0, savage: !!stream.savage };
			entry.drain += share; plan.ledger.totals.drain += share;
			if (!stream.savage && detail.currencySlot >= 0) { const currency = share * n(stream.currencyRate) / Math.max(EPSILON, n(stream.drainRate)); entry.currency += currency; plan.ledger.totals.currency[detail.currencySlot] = (plan.ledger.totals.currency[detail.currencySlot] || 0) + currency; S.royalGData[1][detail.currencySlot] = n(S.royalGData[1][detail.currencySlot]) + currency; }
		}
	}
	for (const rank of rates.ranks) if (rank.rate > 0) S.royalMapsData[rank.mapIdx][3 + rank.bar] = n(S.royalMapsData[rank.mapIdx][3 + rank.bar]) + rank.rate * hours;
	plan.elapsedHours += hours;
}
function _processReset(plan) { const S = _save(plan); const refill = R.armoryBonus(S, 70) >= 1; const grade = R.armoryBonus(S, 0) >= 1; const quantities = S.royalGData[4] || []; for (let index = 0; index < ROYAL_RESOURCES.length; index++) if (_releasedResource(index) && n(quantities[index]) === -1 && refill) { quantities[index] = 0; if (grade) { S.royalGData[5] ||= []; S.royalGData[5][index] = n(S.royalGData[5][index]) + 1; } _push(plan, { kind: 'refill', resourceIdx: index, gradeGain: grade ? 1 : 0 }); } S.olaData ||= []; S.olaData[480] = 0; _push(plan, { kind: 'reset', refilled: refill, armoryPurchasesReset: true }); plan.nextResetHours = plan.elapsedHours + Math.max(EPSILON, n(plan.options.resetIntervalHours ?? 24)); }
export function projectRoyalStateAfterReset(S, options = {}) {
	const reset = R.royalResetTiming(S); const state = O.cloneRoyalState(_clone(S || {}));
	if (!R.hasCompleteRoyalData(state)) return { available: false, state: null, elapsedHours: null, events: [], partial: true, missing: [...(R.hasRoyalGData(state) ? [] : ['RoyalG']), ...(R.hasRoyalMapsData(state) ? [] : ['RoyalMaps'])] };
	if (!reset.available) return { available: false, state: null, elapsedHours: null, events: [], partial: true, missing: reset.missing.slice() };
	const plan = createRoyalPlanState(state, { ...options, horizonHours: reset.hoursRemaining, autoCollectBeforeReset: true });
	_advanceTime(plan, reset.hoursRemaining);
	applyRoyalPlanAction(plan, { kind: 'collect', all: true, automatic: true });
	_processReset(plan);
	plan.saveData.timeAwayData = { ...(plan.saveData.timeAwayData || {}), ShopRestock: Math.max(EPSILON, n(options.resetIntervalHours ?? 24)) * 3600 };
	return { available: true, state: _clone(plan.saveData), elapsedHours: reset.hoursRemaining, events: plan.events.map(_clone), partial: plan.partial, missing: plan.missing.slice(), assumptions: { collectBeforeReset: true } };
}
function _emitReachedAffordability(plan) { for (const affordable of _affordabilityCandidates(plan).filter(item => item.hours <= EPSILON)) { plan.affordabilityEmitted.add(_affordabilityKey(affordable)); _push(plan, affordable); } }
function _processBoundary(plan, event) { const S = _save(plan); const rates = royalPlanRates(plan); if (event.kind === 'depletion') { _push(plan, { kind: 'depletion', resourceIdx: event.resourceIdx, committed: false }); if (plan.options.autoCollectBeforeReset === true && plan.nextResetHours !== null && Math.abs(plan.nextResetHours - plan.elapsedHours) <= EPSILON) applyRoyalPlanAction(plan, { kind: 'collect', all: true, automatic: true }); } const rankEvents = []; if (event.kind === 'rank') rankEvents.push(event); for (const rank of rates.ranks.filter(item => item.rate > 0 && item.nextReq <= item.exp + EPSILON).sort((a, b) => a.mapIdx - b.mapIdx || a.bar - b.bar)) if (!rankEvents.some(item => item.mapIdx === rank.mapIdx && item.bar === rank.bar)) rankEvents.push(rank); for (const rank of rankEvents.sort((a, b) => a.mapIdx - b.mapIdx || a.bar - b.bar)) { const points = R.outpostPointsLeft(S, rank.mapIdx); const before = n(plan.pointBalances[rank.mapIdx]); const delta = Math.max(0, points - before); _push(plan, { kind: 'rank', mapIdx: rank.mapIdx, bar: rank.bar, rank: R.outpostRank(S, rank.mapIdx, rank.bar), points, pointsEarned: delta }); plan.pointBalances[rank.mapIdx] = points; } _emitReachedAffordability(plan); if (event.kind === 'reset' || (plan.nextResetHours !== null && Math.abs(plan.nextResetHours - plan.elapsedHours) <= EPSILON)) { if (plan.options.autoCollectBeforeReset === true && event.kind === 'reset') applyRoyalPlanAction(plan, { kind: 'collect', all: true, automatic: true }); _processReset(plan); } if (event.kind === 'horizon') plan.done = true; }
export function advanceRoyalPlan(plan, options) { if (options) plan.options = { ...plan.options, ...options }; if (plan.done || plan.truncated) return { plan, event: { kind: plan.truncated ? 'event-cap' : 'horizon', hours: 0 } }; if (plan.eventCount >= plan.maxEvents) { plan.truncated = true; plan.partial = true; _push(plan, { kind: 'event-cap', maxEvents: plan.maxEvents }); return { plan, event: { kind: 'event-cap', hours: 0 } }; } const event = nextRoyalPlanEvent(plan); const hours = Math.max(0, Math.min(event.hours, plan.horizonHours - plan.elapsedHours)); plan.pointBalances = Object.fromEntries(Array.from({ length: (_save(plan).royalMapsData || []).length }, (_, mapIdx) => [mapIdx, _points(_save(plan), mapIdx)])); _advanceTime(plan, hours); plan.eventCount++; _processBoundary(plan, event); if (plan.elapsedHours >= plan.horizonHours - EPSILON) plan.done = true; return { plan, event: { ...event, hours } }; }
export function simulateRoyalPlan(S, options = {}) { const plan = createRoyalPlanState(S, options); while (!plan.done && !plan.truncated) advanceRoyalPlan(plan); return plan; }
function _armoryShelfCandidates(plan) {
	const S = _save(plan); const unlocked = R.armoryUnlockedCount(S); const candidates = []; const rates = {}; for (const detail of royalPlanRates(plan).resources) if (detail.currencySlot >= 0 && detail.remaining > 0) rates[detail.currencySlot] = (rates[detail.currencySlot] || 0) + n(detail.currencyRate);
	for (let orderIndex = 0; orderIndex < unlocked; orderIndex++) {
		const index = R.armoryUnlockOrder()[orderIndex]; const upgrade = ARMORY_UPGRADES[index];
		if (!upgrade || R.armoryLevel(S, index) >= upgrade.maxLevel || index === 68) continue;
		const cost = R.armoryUpgradeCost(S, orderIndex);
		if (!Number.isFinite(cost.value) || cost.currencySlot < 0) continue;
		const balance = n(S.royalGData?.[1]?.[cost.currencySlot]); const rate = n(rates[cost.currencySlot]); const productionHours = rate > 0 ? cost.value / rate : Infinity;
		candidates.push({ index, orderIndex, name: upgrade.name, currencySlot: cost.currencySlot, cost: cost.value, balance, rate, productionHours, currencyEfficiency: cost.value > EPSILON ? rate / cost.value : Infinity, hours: balance >= cost.value ? 0 : rate > 0 ? (cost.value - balance) / rate : Infinity });
	}
	return candidates.sort((a, b) => a.hours - b.hours || b.currencyEfficiency - a.currencyEfficiency || a.cost - b.cost || a.orderIndex - b.orderIndex);
}
function _applyArmoryShelfPurchase(plan, candidate) {
	const S = _save(plan); const upgrade = ARMORY_UPGRADES[candidate.index]; const levelBefore = R.armoryLevel(S, candidate.index); const totalBefore = R.armoryTotalLevels(S); const balanceBefore = n(S.royalGData?.[1]?.[candidate.currencySlot]); const dailyPurchasesBefore = n(S.olaData?.[480]); const discount = R.allMasterclassCostReduxDetail(S);
	S.royalGData[1] ||= []; S.royalGData[2] ||= []; S.royalGData[3] ||= [];
	S.royalGData[1][candidate.currencySlot] = n(S.royalGData[1][candidate.currencySlot]) - candidate.cost; S.royalGData[2][candidate.index] = levelBefore + 1;
	S.olaData ||= []; S.olaData[480] = n(S.olaData[480]) + 1;
	if (candidate.index === 30 && n(S.royalGData[3][3]) === 0) S.royalGData[3][3] = 1;
	if (candidate.index === 80) { S.olaData[383] = n(S.olaData[383]) + 1; }
	if (candidate.index >= 60 && candidate.index <= 67) { const world = candidate.index - 60; S.royalGData[6 + 2 * world] ||= []; S.royalGData[7 + 2 * world] ||= []; S.royalGData[6 + 2 * world].push(4); S.royalGData[7 + 2 * world].push(1 + 50 * world); }
	const action = { kind: 'armory-purchase', decisionStep: plan.actionLog.filter(item => item.kind === 'armory-purchase').length + 1, orderIndex: candidate.orderIndex, index: candidate.index, name: upgrade.name, currencySlot: candidate.currencySlot, cost: candidate.cost, currencyRate: candidate.rate, currencyEfficiency: candidate.currencyEfficiency, productionHours: candidate.productionHours, balanceBefore, balanceAfter: n(S.royalGData[1][candidate.currencySlot]), discountMultiplier: discount.value, dailyPurchaseLimit: discount.dailyPurchaseLimit, dailyDiscountActive: discount.dailyDiscountActive, dailyPurchasesBefore, dailyPurchasesAfter: n(S.olaData[480]), timeHours: plan.elapsedHours, levelBefore, levelAfter: levelBefore + 1, totalLevelsAfter: totalBefore + 1, unlockedCountAfter: R.armoryUnlockedCount(S) };
	plan.actionLog.push(action); _push(plan, action); return action;
}
function _assignIdleOutpostsToRanks(S, ext, options, currencySlots) {
	let state = O.cloneRoyalState(S); const moves = []; const changedSlots = new Set(); const occupiedSlots = (state.royalMapsData || []).reduce((sum, _, mapIdx) => sum + (R.outpostBuilt(state, mapIdx) ? R.outpostUnits(state, mapIdx).length : 0), 0); const cap = options.idleRankMoveCap === undefined ? occupiedSlots : Math.max(0, Math.min(occupiedSlots, Math.floor(n(options.idleRankMoveCap))));
	while (moves.length < cap) {
		const idleMaps = new Set((state.royalMapsData || []).map((_, mapIdx) => mapIdx).filter(mapIdx => R.outpostBuilt(state, mapIdx) && [0, 2].includes(R.outpostType(state, mapIdx)) && !R.outpostConnections(state, mapIdx).some(connection => connection.kind === 'resource' && R.resourceRemaining(state, connection.id) > 0 && (!currencySlots || currencySlots.has(R.resourceCurrency(connection.id))))));
		if (!idleMaps.size) break;
		const baseline = O.rankObjective(state, { aggregate: true }, ext).value; const candidates = O.generateRoyalCandidates(state, { objective: 'rank-target', ext, candidateCap: 500, resourceCandidateCap: 80, _allowProfessionChange: true, returnResults: true }).filter(item => item.move.kind === 'profession' && idleMaps.has(item.move.mapIdx) && [1, 3].includes(n(item.move.type)) && !changedSlots.has(`${item.move.mapIdx}:${item.move.slot}`)).map(item => ({ ...item, rankRate: O.rankObjective(item.result.state, { aggregate: true }, ext).value })).filter(item => item.rankRate > baseline + EPSILON).sort((a, b) => b.rankRate - a.rankRate || a.move.mapIdx - b.move.mapIdx || a.move.slot - b.move.slot || a.move.type - b.move.type);
		if (!candidates.length) break;
		const best = candidates[0]; state = best.result.state; moves.push(best.move); changedSlots.add(`${best.move.mapIdx}:${best.move.slot}`);
	}
	return { state, moves };
}
function _resourceProfessionState(S, mapIdx, guardCount, ext) {
	let state = O.cloneRoyalState(S); const moves = []; const units = R.outpostUnits(state, mapIdx).sort((a, b) => a.slot - b.slot);
	for (let index = 0; index < units.length; index++) {
		const type = index < guardCount ? 2 : 0; if (units[index].type === type) continue;
		const move = { kind: 'profession', mapIdx, slot: units[index].slot, type }; const result = O.applyRoyalMove(state, move, { ext });
		if (!result.ok || !result.executable) return null;
		state = result.state; moves.push(move);
	}
	return { state, moves };
}
function _connectPortfolioOutposts(S, portfolioTargets, focusCurrencySlot, ext) {
	let state = O.cloneRoyalState(S); const moves = []; const targets = new Map(portfolioTargets.map(item => [item.currencySlot, item]));
	for (let mapIdx = 0; mapIdx < (state.royalMapsData || []).length; mapIdx++) {
		if (!R.outpostBuilt(state, mapIdx) || R.outpostType(state, mapIdx) !== 0) continue;
		const choices = [];
		for (let guardCount = 0; guardCount <= R.outpostUnits(state, mapIdx).length; guardCount++) {
			const professions = _resourceProfessionState(state, mapIdx, guardCount, ext); if (!professions) continue;
			const allocation = O.resourceAllocationMetrics(professions.state, { hours: 0, ext }); const income = allocation.incomeByCurrency || {};
			for (const item of R.reachableResourcesForOutpost(professions.state, mapIdx, ext)) {
				if (!item.reachable || R.resourceRemaining(professions.state, item.resourceIdx) <= 0 || !targets.has(R.resourceCurrency(item.resourceIdx))) continue;
				const currencySlot = R.resourceCurrency(item.resourceIdx); const target = targets.get(currencySlot); const rate = R.resourceProductionWithGrade(professions.state, mapIdx, item.resourceIdx, ext).value; const currentRate = n(income[currencySlot]); const detail = allocation.details?.[item.resourceIdx]; const projectedDrainHours = R.resourceRemaining(professions.state, item.resourceIdx) / Math.max(EPSILON, n(detail?.drainRate) + rate);
				choices.push({ resourceIdx: item.resourceIdx, currencySlot, rate, guardCount, professionState: professions.state, professionMoves: professions.moves, focused: currencySlot === focusCurrencySlot ? 1 : 0, activatesCurrency: currentRate <= EPSILON ? 1 : 0, projectedDrainHours, scoreGain: target.weight * (Math.log1p((currentRate + rate) / target.targetCost) - Math.log1p(currentRate / target.targetCost)) });
			}
		}
		choices.sort((a, b) => b.focused - a.focused || (a.focused ? b.scoreGain - a.scoreGain || b.rate - a.rate : a.projectedDrainHours - b.projectedDrainHours || b.activatesCurrency - a.activatesCurrency || b.scoreGain - a.scoreGain) || a.guardCount - b.guardCount || a.resourceIdx - b.resourceIdx);
		if (!choices.length) continue;
		const best = choices[0]; state = best.professionState; moves.push(...best.professionMoves); const current = R.outpostConnections(state, mapIdx)[0];
		if (current.kind === 'resource' && current.id === best.resourceIdx) continue;
		const move = { kind: 'connection', mapIdx, slot: 0, endpoint: { kind: 'resource', id: best.resourceIdx } }; const result = O.applyRoyalMove(state, move, { ext });
		if (result.ok && result.executable) { state = result.state; moves.push(move); }
	}
	return { state, moves };
}
function _shelfLayoutStrategy(plan, candidates, options) {
	const S = _save(plan); const perCurrency = new Map();
	for (const candidate of candidates) { const current = perCurrency.get(candidate.currencySlot); if (!current || candidate.hours < current.hours || candidate.hours === current.hours && candidate.currencyEfficiency > current.currencyEfficiency) perCurrency.set(candidate.currencySlot, candidate); }
	const currencyCap = options.layoutCurrencyCap === undefined ? perCurrency.size : Math.max(1, Math.min(64, Math.floor(n(options.layoutCurrencyCap))));
	const portfolioTargets = [...perCurrency.values()].sort((a, b) => a.currencySlot - b.currencySlot).slice(0, currencyCap).map(seed => ({ currencySlot: seed.currencySlot, targetCost: seed.cost, weight: 1 + Math.log1p(candidates.filter(item => item.currencySlot === seed.currencySlot).length - 1) }));
	const focusCurrencySlot = candidates[0]?.currencySlot; const connected = _connectPortfolioOutposts(S, portfolioTargets, focusCurrencySlot, plan.options.ext); const fallback = _assignIdleOutpostsToRanks(connected.state, plan.options.ext, options, new Set(portfolioTargets.map(item => item.currencySlot))); const state = fallback.state; const moves = [...connected.moves, ...fallback.moves]; const allocation = O.resourceAllocationMetrics(state, { hours: 0, ext: plan.options.ext }); const income = {}; for (const detail of allocation.details || []) if (detail.remaining > 0 && detail.currencyRate > 0) income[detail.currencySlot] = (income[detail.currencySlot] || 0) + detail.currencyRate;
	const ranked = candidates.map(item => { const balance = n(state.royalGData?.[1]?.[item.currencySlot]); const rate = n(income[item.currencySlot]); return { ...item, balance, rate, productionHours: rate > 0 ? item.cost / rate : Infinity, currencyEfficiency: item.cost > EPSILON ? rate / item.cost : Infinity, hours: balance >= item.cost ? 0 : rate > 0 ? (item.cost - balance) / rate : Infinity }; }).sort((a, b) => a.hours - b.hours || b.currencyEfficiency - a.currencyEfficiency || a.cost - b.cost || a.orderIndex - b.orderIndex);
	const portfolio = portfolioTargets.map(item => ({ ...item, rate: n(income[item.currencySlot]), balance: n(state.royalGData?.[1]?.[item.currencySlot]), eligibleUpgrades: candidates.filter(candidate => candidate.currencySlot === item.currencySlot).length }));
	if (ranked[0] && (ranked[0].hours <= EPSILON || portfolio.some(item => item.rate > 0))) return { mode: 'currency-portfolio', state, moves, candidate: ranked[0], portfolio };
	return { mode: 'rank', state, moves, candidate: candidates[0], portfolio };
}
function _shelfTimeline(events) {
	const visible = new Set(['armory-purchase', 'layout-change', 'collect', 'reset', 'banked-time', 'depletion', 'check-in', 'rank-breakpoint']); const refills = events.filter(item => item.kind === 'refill'); const timeline = [];
	for (const source of events.filter(item => visible.has(item.kind))) { const event = source.kind === 'reset' ? { ...source, refills: refills.filter(item => Math.abs(n(item.timeHours) - n(source.timeHours)) <= EPSILON).map(_clone) } : source; if (event.kind === 'reset') { event.refilledNodes = event.refills.length; event.gradeGains = event.refills.reduce((sum, item) => sum + n(item.gradeGain), 0); } timeline.push(_clone(event)); }
	return timeline;
}
function _resetLayoutActions(before, after) {
	const actions = [];
	for (let mapIdx = 0; mapIdx < Math.max(before?.royalMapsData?.length || 0, after?.royalMapsData?.length || 0); mapIdx++) {
		if (!R.outpostBuilt(after, mapIdx)) continue;
		if (R.outpostType(before, mapIdx) !== R.outpostType(after, mapIdx)) actions.push({ kind: 'type', mapIdx, type: R.outpostType(after, mapIdx) });
		const beforeUnits = new Map(R.outpostUnits(before, mapIdx).map(unit => [unit.slot, unit.type]));
		for (const unit of R.outpostUnits(after, mapIdx)) if (beforeUnits.get(unit.slot) !== unit.type) actions.push({ kind: 'profession', mapIdx, slot: unit.slot, type: unit.type });
		const beforeConnection = n(before?.royalMapsData?.[mapIdx]?.[8], -1); const afterConnection = n(after?.royalMapsData?.[mapIdx]?.[8], -1);
		if (beforeConnection !== afterConnection) actions.push({ kind: 'connection', mapIdx, slot: 0, endpoint: R.parseConnectionEndpoint(afterConnection) });
	}
	return actions;
}
function _resetTypeState(S, mapIdx, targetType, ext) {
	let state = O.cloneRoyalState(S); const originalTypes = (state.royalMapsData || []).map((_, index) => R.outpostType(state, index));
	while (R.outpostType(state, mapIdx) !== targetType) {
		const current = R.outpostType(state, mapIdx); const direction = targetType > current ? 1 : -1;
		const result = O.applyRoyalMove(state, { kind: 'type', mapIdx, direction }, { ext });
		if (!result.ok || !result.executable) return null;
		state = result.state;
		if ((state.royalMapsData || []).some((_, index) => index !== mapIdx && R.outpostType(state, index) !== originalTypes[index])) return null;
	}
	return state;
}
function _resetProfessionState(S, mapIdx, guardCount, workerCount, ext) {
	let state = O.cloneRoyalState(S); const units = R.outpostUnits(state, mapIdx).sort((a, b) => a.slot - b.slot); const moves = [];
	for (let index = 0; index < units.length; index++) {
		const type = index < guardCount ? 2 : index < guardCount + workerCount ? 0 : 1; if (units[index].type === type) continue;
		const move = { kind: 'profession', mapIdx, slot: units[index].slot, type }; const result = O.applyRoyalMove(state, move, { ext });
		if (!result.ok || !result.executable) return null;
		state = result.state; moves.push(move);
	}
	return { state, moves };
}
function _resetMapChoices(S, mapIdx, hoursLeft, ext, mode, pinnedTypes = {}) {
	const choices = [];
	for (const targetType of pinnedTypes[mapIdx] === undefined ? [0, 2] : [pinnedTypes[mapIdx]]) {
		if (targetType === 1) continue;
		const typed = _resetTypeState(S, mapIdx, targetType, ext); if (!typed) continue;
		for (let guardCount = 0; guardCount <= R.outpostUnits(typed, mapIdx).length; guardCount++) {
			const movable = R.outpostUnits(typed, mapIdx).length; const workerCounts = mode === 'least-wasteful' ? Array.from({ length: movable - guardCount + 1 }, (_, count) => count) : [movable - guardCount];
			for (const workerCount of workerCounts) {
			const professions = _resetProfessionState(typed, mapIdx, guardCount, workerCount, ext); if (!professions) continue;
			for (const resource of R.reachableResourcesForOutpost(professions.state, mapIdx, ext)) {
				if (!resource.reachable || R.resourceRemaining(professions.state, resource.resourceIdx) <= EPSILON) continue;
				let state = professions.state; const current = R.outpostConnections(state, mapIdx)[0];
				if (current.kind !== 'resource' || current.id !== resource.resourceIdx) { const result = O.applyRoyalMove(state, { kind: 'connection', mapIdx, slot: 0, endpoint: { kind: 'resource', id: resource.resourceIdx } }, { ext }); if (!result.ok || !result.executable) continue; state = result.state; }
				const baseRate = R.resourceProductionWithGrade(state, mapIdx, resource.resourceIdx, ext).value; const drainRate = targetType === 2 ? R.savageCollection(state) * baseRate : baseRate;
				choices.push({ mapIdx, resourceIdx: resource.resourceIdx, state, drainRate, currencyRate: targetType === 0 ? baseRate : 0, guardCount, workerCount, possibleDrain: Math.min(R.resourceRemaining(state, resource.resourceIdx), drainRate * hoursLeft) });
			}
			}
		}
	}
	return choices;
}
function _resetDrainLayout(S, mode, hoursLeft, ext, pinnedTypes = {}) {
	let state = O.cloneRoyalState(S); const maps = new Set();
	for (let mapIdx = 0; mapIdx < (state.royalMapsData || []).length; mapIdx++) {
		if (pinnedTypes[mapIdx] === 1) continue;
		if (!R.outpostBuilt(state, mapIdx)) continue;
		maps.add(mapIdx);
		if (R.outpostConnections(state, mapIdx)[0].kind === 'resource') { const result = O.applyRoyalMove(state, { kind: 'connection', mapIdx, slot: 0, endpoint: { kind: 'empty', id: -1 } }, { ext }); if (result.ok && result.executable) state = result.state; }
	}
	while (maps.size) {
		const allChoices = [...maps].flatMap(mapIdx => _resetMapChoices(state, mapIdx, hoursLeft, ext, mode, pinnedTypes)); if (!allChoices.length) break;
		const byResource = new Map();
		for (const choice of allChoices) { const best = byResource.get(`${choice.mapIdx}:${choice.resourceIdx}`); if (!best || choice.drainRate > best.drainRate || choice.drainRate === best.drainRate && choice.currencyRate > best.currencyRate) byResource.set(`${choice.mapIdx}:${choice.resourceIdx}`, choice); }
		const allocation = O.resourceAllocationMetrics(state, { hours: 0, ext }); const feasible = new Set();
		for (const resourceIdx of new Set(allChoices.map(choice => choice.resourceIdx))) { const currentRate = n(allocation.details?.[resourceIdx]?.drainRate); const remaining = R.resourceRemaining(state, resourceIdx); const possibleRate = [...maps].reduce((sum, mapIdx) => sum + n(byResource.get(`${mapIdx}:${resourceIdx}`)?.drainRate), currentRate); if (currentRate * hoursLeft + EPSILON < remaining && possibleRate * hoursLeft + EPSILON >= remaining) feasible.add(resourceIdx); }
		const candidates = allChoices.filter(choice => mode === 'drain-before-reset' ? feasible.size === 0 || feasible.has(choice.resourceIdx) : feasible.has(choice.resourceIdx)).map(choice => {
			const detail = allocation.details?.[choice.resourceIdx]; const beforeRate = n(detail?.drainRate); const remaining = R.resourceRemaining(state, choice.resourceIdx); const afterRate = beforeRate + choice.drainRate; const completesBefore = beforeRate * hoursLeft + EPSILON >= remaining; const completesAfter = afterRate * hoursLeft + EPSILON >= remaining; const completionGain = !completesBefore && completesAfter ? 1 : 0; const drainHours = remaining / Math.max(EPSILON, afterRate); const excess = Math.max(0, afterRate * hoursLeft - remaining); const currencyGain = Math.min(remaining, choice.currencyRate * hoursLeft);
			const otherRate = [...maps].filter(mapIdx => mapIdx !== choice.mapIdx).reduce((sum, mapIdx) => sum + n(byResource.get(`${mapIdx}:${choice.resourceIdx}`)?.drainRate), 0); const preservesCompletion = (afterRate + otherRate) * hoursLeft + EPSILON >= remaining;
			return { ...choice, preservesCompletion, score: mode === 'least-wasteful' ? [completionGain, -choice.workerCount, -choice.guardCount, -excess, choice.currencyRate] : [completionGain, completesAfter ? -drainHours : 0, currencyGain, choice.drainRate] };
		}).filter(choice => mode !== 'least-wasteful' || choice.preservesCompletion).sort((left, right) => _compareScore(right.score, left.score) || left.mapIdx - right.mapIdx || left.resourceIdx - right.resourceIdx || left.guardCount - right.guardCount || left.workerCount - right.workerCount);
		if (!candidates.length) break;
		const selected = candidates[0]; state = selected.state; maps.delete(selected.mapIdx);
	}
	if (mode === 'least-wasteful') {
		for (const mapIdx of maps) if (R.outpostConnections(state, mapIdx)[0].kind !== 'empty') { const result = O.applyRoyalMove(state, { kind: 'connection', mapIdx, slot: 0, endpoint: { kind: 'empty', id: -1 } }, { ext }); if (result.ok && result.executable) state = result.state; }
	}
	const rankFallback = _assignIdleOutpostsToRanks(state, ext, { idleRankMoveCap: Infinity });
	return rankFallback.state;
}
function _projectRefilledState(S) {
	const state = O.cloneRoyalState(S); const refill = R.armoryBonus(state, 70) >= 1; const grade = R.armoryBonus(state, 0) >= 1;
	if (!refill) return state;
	state.royalGData[4] ||= []; state.royalGData[5] ||= [];
	for (let index = 0; index < ROYAL_RESOURCES.length; index++) if (_releasedResource(index) && n(state.royalGData[4][index]) === -1) { state.royalGData[4][index] = 0; if (grade) state.royalGData[5][index] = n(state.royalGData[5][index]) + 1; }
	return state;
}
function _bankIdleTimeAcrossReset(plan, hours, options = {}) {
	const durationHours = Math.max(0, n(hours)); if (durationHours <= EPSILON) return { applied: false, durationHours: 0, currency: 0, layoutChanges: 0 };
	applyRoyalPlanAction(plan, { kind: 'collect', all: true, automatic: true });
	const before = O.cloneRoyalState(_save(plan)); const projected = _projectRefilledState(before); const pinnedTypes = {};
	for (let mapIdx = 0; mapIdx < (projected.royalMapsData || []).length; mapIdx++) if (R.outpostBuilt(projected, mapIdx)) pinnedTypes[mapIdx] = options.pinnedTypes?.[mapIdx] ?? (R.outpostType(projected, mapIdx) === 1 ? 1 : 0);
	const projectedLayout = _resetDrainLayout(projected, 'drain-before-reset', durationHours, options.ext, pinnedTypes); const prepared = O.cloneRoyalState(before);
	prepared.royalMapsData = _clone(projectedLayout.royalMapsData); const actions = _resetLayoutActions(before, prepared);
	if (actions.length) { _setSave(plan, prepared); _push(plan, { kind: 'layout-change', mode: 'banked-post-reset', actions, layoutBeforeState: _royalSnapshot(before), layoutState: _royalSnapshot(prepared), reason: 'At the final collection, preserve pinned and Support outposts and prepare Normal production for the banked post-reset window.' }); }
	_save(plan).royalGData[3] ||= []; _save(plan).royalGData[3][0] = durationHours * 3600;
	_advanceTime(plan, durationHours); _processReset(plan);
	const balancesBefore = (_save(plan).royalGData?.[1] || []).map(n); const resetElapsed = plan.elapsedHours;
	_advanceTime(plan, durationHours); plan.elapsedHours = resetElapsed;
	const balancesAfter = (_save(plan).royalGData?.[1] || []).map(n); const currency = balancesAfter.reduce((sum, value, slot) => sum + Math.max(0, value - n(balancesBefore[slot])), 0);
	_save(plan).royalGData[3][0] = 0; _push(plan, { kind: 'banked-time', durationHours, currency });
	return { applied: true, durationHours, currency, layoutChanges: actions.length };
}
export function planResetDrainSchedule(S, mode = 'drain-before-reset', options = {}) {
	const supported = ['drain-before-reset', 'least-wasteful']; const initial = O.cloneRoyalState(_clone(S || {})); const reset = R.royalResetTiming(initial);
	if (!supported.includes(mode)) return { available: false, mode, timelineActions: [], finalState: initial, partial: true, missing: [`unsupported reset schedule mode: ${mode}`] };
	if (!R.hasCompleteRoyalData(initial) || !reset.available) return { available: false, mode, timelineActions: [], finalState: initial, partial: true, missing: [..._kingdomMissing(initial), ...(reset.missing || [])] };
	const opts = _planningOptions(initial, options); const plan = createRoyalPlanState(initial, { ...opts, horizonHours: reset.hoursRemaining, maxEvents: options.maxEvents ?? 5000, autoCollectBeforeReset: true }); const completed = new Set(); let layouts = 0; let iterations = 0; let bankedPostResetHours = 0; let bankedPostResetCurrency = 0;
	_reportProgress(options, 'setup', 0, Math.max(EPSILON, reset.hoursRemaining));
	while (plan.elapsedHours < reset.hoursRemaining - EPSILON && iterations < plan.maxEvents) {
		iterations++;
		const before = O.cloneRoyalState(_save(plan)); const hoursLeft = reset.hoursRemaining - plan.elapsedHours; const layout = _resetDrainLayout(before, mode, hoursLeft, opts.ext, opts.pinnedTypes || {}); const actions = _resetLayoutActions(before, layout);
		if (actions.length) { _setSave(plan, layout); layouts++; _push(plan, { kind: 'layout-change', mode, actions, layoutBeforeState: _royalSnapshot(before), layoutState: _royalSnapshot(layout), reason: mode === 'least-wasteful' ? 'Complete the most nodes with the least excess staffing; move unused outposts to rank EXP.' : 'Complete the most nodes before reset; use remaining capacity for the highest currency gain.' }); }
		const rates = royalPlanRates(plan); const remainingBefore = new Map(rates.resources.filter(detail => detail.remaining > EPSILON).map(detail => [detail.resourceIdx, detail.remaining])); const depletion = _nextDepletion(rates); const advance = Math.min(hoursLeft, depletion?.hours ?? Infinity);
		if (!Number.isFinite(advance) || advance >= hoursLeft - EPSILON) {
			if (options.bankedTimePostReset === true && !depletion && hoursLeft > EPSILON) {
				const banked = _bankIdleTimeAcrossReset(plan, hoursLeft, opts); bankedPostResetHours = banked.durationHours; bankedPostResetCurrency = banked.currency; layouts += banked.layoutChanges; break;
			}
			_advanceTime(plan, hoursLeft); break;
		}
		_advanceTime(plan, advance);
		for (const [resourceIdx] of remainingBefore) if (R.resourceRemaining(_save(plan), resourceIdx) <= EPSILON) { completed.add(resourceIdx); _push(plan, { kind: 'depletion', resourceIdx, committed: false }); }
		_reportProgress(options, 'schedule', plan.elapsedHours, Math.max(EPSILON, reset.hoursRemaining), { completedNodes: completed.size, layouts });
	}
	if (iterations >= plan.maxEvents && plan.elapsedHours < reset.hoursRemaining - EPSILON) { plan.truncated = true; plan.partial = true; _push(plan, { kind: 'event-cap', maxEvents: plan.maxEvents }); }
	if (!plan.truncated && bankedPostResetHours <= EPSILON) { applyRoyalPlanAction(plan, { kind: 'collect', all: true, automatic: true }); _processReset(plan); }
	const timelineActions = _shelfTimeline(plan.events); const finalState = _clone(_save(plan)); const allocation = O.resourceAllocationMetrics(finalState, { hours: 0, ext: opts.ext });
	_reportProgress(options, 'finalize', Math.max(EPSILON, reset.hoursRemaining), Math.max(EPSILON, reset.hoursRemaining), { completedNodes: completed.size, layouts });
	return _jsonSafe({ available: true, mode, complete: !plan.truncated, elapsedHours: plan.elapsedHours, completedNodes: completed.size, timelineActions, finalState, stateNotApplied: true, partial: plan.partial || plan.truncated, missing: plan.missing.slice(), metrics: { completedNodes: completed.size, layoutChanges: layouts, currencyCollected: _sumCurrency(plan.ledger.totals.currency), bankedPostResetHours, bankedPostResetCurrency, rankExpPerHour: O.rankObjective(finalState, { aggregate: true }, opts.ext).value, activeStreamsAfterReset: allocation.details.filter(detail => detail.remaining > 0 && detail.rate > 0).length }, metadata: { bounded: true, deterministic: true, eventDriven: true, reevaluatesAfterEachDepletion: true, banksIdleTimePostReset: options.bankedTimePostReset === true, allowsTypeChanges: true, spendsOutpostPoints: false, iterations, maxEvents: plan.maxEvents, derivedInputEvaluations: opts._derivedInputEvaluations, approximation: 'deterministic resource-centric greedy scheduling; no global-optimum claim' } });
}
function _relocateTransientAssignments(S, assignmentType, targetMap) {
	const state = O.cloneRoyalState(S); const worldIdx = R.outpostWorld(targetMap); const types = state.royalGData?.[6 + 2 * worldIdx] || []; const maps = state.royalGData?.[7 + 2 * worldIdx] || []; const actions = [];
	for (let assignmentIdx = 0; assignmentIdx < Math.min(types.length, maps.length); assignmentIdx++) {
		if (n(types[assignmentIdx]) !== assignmentType || n(maps[assignmentIdx]) === targetMap) continue;
		actions.push({ kind: 'assignment', assignmentType, worldIdx, assignmentIdx, fromMapIdx: n(maps[assignmentIdx]), mapIdx: targetMap }); maps[assignmentIdx] = targetMap;
	}
	return { state, actions };
}
function _breakpointTarget(S, mapIdx, mode) {
	if (mode === 'command-breakpoint') { const next = R.nextCommandRankUnit(S, mapIdx); return { bar: 2, rank: next.rank, rewardType: next.type, rewardName: next.name }; }
	return { bar: 4, rank: 1, rewardType: null, rewardName: 'Purified map' };
}
export function planRankBreakpoint(S, mode = 'command-breakpoint', options = {}) {
	const assignmentType = mode === 'command-breakpoint' ? 5 : mode === 'purification' ? 7 : -1; const initial = O.cloneRoyalState(_clone(S || {}));
	if (assignmentType < 0) return { available: false, mode, timelineActions: [], finalState: initial, partial: true, missing: [`unsupported rank breakpoint mode: ${mode}`] };
	if (!R.hasCompleteRoyalData(initial)) return { available: false, mode, timelineActions: [], finalState: initial, partial: true, missing: _kingdomMissing(initial) };
	const opts = _planningOptions(initial, options); const assignments = R.militiaAssignments(initial).filter(item => item.type === assignmentType); const worlds = new Set(assignments.map(item => item.worldIdx));
	if (!assignments.length) return { available: false, mode, timelineActions: [], finalState: initial, partial: true, missing: [`No saved ${R.transientUnitName(assignmentType)} assignments`] };
	const preliminary = [];
	for (let mapIdx = 0; mapIdx < (initial.royalMapsData || []).length; mapIdx++) {
		if (!R.outpostBuilt(initial, mapIdx) || !worlds.has(R.outpostWorld(mapIdx)) || mode === 'purification' && R.outpostIsPurified(initial, mapIdx)) continue;
		const target = _breakpointTarget(initial, mapIdx, mode); const relocated = _relocateTransientAssignments(initial, assignmentType, mapIdx); const info = R.outpostRankInfo(relocated.state, mapIdx, target.bar); const rate = R.outpostRankExpPerHour(relocated.state, mapIdx, target.bar, opts.ext); const requirement = R.outpostExpFormula(target.rank - 1, target.bar); const etaHours = rate > 0 ? Math.max(0, requirement - info.exp) / rate : Infinity;
		preliminary.push({ mapIdx, target, relocated, etaHours, rate });
	}
	preliminary.sort((left, right) => left.etaHours - right.etaHours || right.rate - left.rate || left.mapIdx - right.mapIdx); const finalistCap = Math.max(1, Math.min(10, Math.floor(n(options.finalistCap) || 4))); const finalists = [];
	_reportProgress(options, 'targets', 0, Math.max(1, Math.min(finalistCap, preliminary.length)));
	for (const seed of preliminary.slice(0, finalistCap)) {
		const layout = planKingdomLayout(seed.relocated.state, 'rank-target', { ...opts, rankTarget: { mapIdx: seed.mapIdx, bar: seed.target.bar, rank: seed.target.rank }, maxActions: options.maxActions ?? 4, beamWidth: options.beamWidth ?? 4, candidateCap: options.candidateCap ?? 120, totalCandidateCap: options.totalCandidateCap ?? 240, finalistCap: 3 });
		const state = layout.recommendation?.state || seed.relocated.state; const rate = R.outpostRankExpPerHour(state, seed.mapIdx, seed.target.bar, opts.ext); const info = R.outpostRankInfo(state, seed.mapIdx, seed.target.bar); const requirement = R.outpostExpFormula(seed.target.rank - 1, seed.target.bar); const etaHours = rate > 0 ? Math.max(0, requirement - info.exp) / rate : Infinity; const actions = [...seed.relocated.actions, ...(layout.recommendation?.actions || [])];
		finalists.push({ ...seed, state, actions, rate, etaHours, resourcesPerHour: O.resourceIncomeByCurrency(state, opts.ext).total }); _reportProgress(options, 'targets', finalists.length, Math.max(1, Math.min(finalistCap, preliminary.length)));
	}
	finalists.sort((left, right) => left.etaHours - right.etaHours || right.resourcesPerHour - left.resourcesPerHour || left.mapIdx - right.mapIdx); const best = finalists[0];
	if (!best || !Number.isFinite(best.etaHours)) return { available: false, mode, timelineActions: [], finalState: initial, partial: true, missing: [`No eligible ${R.transientUnitName(assignmentType)} breakpoint has a finite rate`] };
	const layoutEvent = { kind: 'layout-change', mode, actions: best.actions, layoutBeforeState: _royalSnapshot(initial), layoutState: _royalSnapshot(best.state), reason: `Relocate same-world ${R.transientUnitName(assignmentType)} assignments and optimize support layout for the fastest account-wide breakpoint.` };
	const breakpointEvent = { kind: 'rank-breakpoint', mode, timeHours: best.etaHours, mapIdx: best.mapIdx, bar: best.target.bar, targetRank: best.target.rank, rewardType: best.target.rewardType, rewardName: best.target.rewardName, rate: best.rate };
	return _jsonSafe({ available: true, complete: true, mode, etaHours: best.etaHours, target: { mapIdx: best.mapIdx, ...best.target, rate: best.rate }, timelineActions: [layoutEvent, breakpointEvent], finalState: _clone(best.state), stateNotApplied: true, partial: false, missing: [], alternatives: finalists.slice(1).map(item => ({ mapIdx: item.mapIdx, etaHours: item.etaHours, rate: item.rate, rewardName: item.target.rewardName })), metadata: { bounded: true, deterministic: true, assignmentType, targetsEvaluated: preliminary.length, finalistsEvaluated: finalists.length, relocatesTransientAssignments: true, spendsOutpostPoints: false, derivedInputEvaluations: opts._derivedInputEvaluations, approximation: 'bounded target shortlist plus layout beam search; no global-optimum claim' } });
}
function _checkInIntervals(value) {
	const source = Array.isArray(value) ? value : String(value ?? '').split(/[\s,;]+/); return source.map(Number).filter(item => Number.isFinite(item) && item > 0).slice(0, 24);
}
function _lowAttentionLayout(plan, subgoal, hours, options) {
	const S = _save(plan);
	if (subgoal === 'next-shelf') { const candidates = _armoryShelfCandidates(plan); if (!candidates.length) return O.cloneRoyalState(S); return _shelfLayoutStrategy(plan, candidates, options).state; }
	return _resetDrainLayout(S, subgoal === 'least-wasteful' ? 'least-wasteful' : 'drain-before-reset', hours, plan.options.ext);
}
function _lowAttentionPurchases(plan, startUnlocked, options) {
	if (options.subgoal !== 'next-shelf') return 0; let count = 0; const cap = Math.max(0, Math.min(50, Math.floor(n(options.maxPurchasesPerCheckIn) || 50)));
	while (count < cap && R.armoryUnlockedCount(_save(plan)) === startUnlocked) { const candidate = _armoryShelfCandidates(plan)[0]; if (!candidate || candidate.hours > EPSILON) break; _applyArmoryShelfPurchase(plan, candidate); count++; }
	return count;
}
function _advanceLowAttentionWindow(plan, duration, completed) {
	const end = plan.elapsedHours + duration; const banking = { hours: 0, currency: 0, phases: 0, layoutChanges: 0 };
	while (plan.elapsedHours < end - EPSILON) {
		const rates = royalPlanRates(plan); const remainingBefore = new Map(rates.resources.filter(detail => detail.remaining > EPSILON).map(detail => [detail.resourceIdx, detail.remaining])); const depletion = _nextDepletion(rates); const resetHours = plan.nextResetHours === null ? Infinity : Math.max(0, plan.nextResetHours - plan.elapsedHours); const advance = Math.min(end - plan.elapsedHours, depletion?.hours ?? Infinity, resetHours);
		if (!Number.isFinite(advance)) break;
		if (plan.options.bankedTimePostReset === true && !depletion && resetHours > EPSILON && resetHours <= end - plan.elapsedHours + BOUNDARY_EPSILON) { const banked = _bankIdleTimeAcrossReset(plan, resetHours, plan.options); banking.hours += banked.durationHours; banking.currency += banked.currency; banking.phases++; banking.layoutChanges += banked.layoutChanges; continue; }
		_advanceTime(plan, advance);
		for (const [resourceIdx] of remainingBefore) if (R.resourceRemaining(_save(plan), resourceIdx) <= EPSILON && !completed.has(resourceIdx)) { completed.add(resourceIdx); _push(plan, { kind: 'depletion', resourceIdx, committed: false }); }
		if (resetHours <= advance + BOUNDARY_EPSILON) _processReset(plan);
		if (advance <= EPSILON && resetHours > BOUNDARY_EPSILON) break;
	}
	return banking;
}
export function planLowAttention(S, intervals, subgoal = 'drain-before-reset', options = {}) {
	const schedule = _checkInIntervals(intervals); const supported = ['next-shelf', 'drain-before-reset', 'least-wasteful']; const initial = O.cloneRoyalState(_clone(S || {}));
	if (!supported.includes(subgoal)) return { available: false, mode: 'low-attention', subgoal, timelineActions: [], finalState: initial, partial: true, missing: [`unsupported low-attention subgoal: ${subgoal}`] };
	if (!schedule.length) return { available: false, mode: 'low-attention', subgoal, timelineActions: [], finalState: initial, partial: true, missing: ['At least one positive check-in interval is required'] };
	if (!R.hasCompleteRoyalData(initial)) return { available: false, mode: 'low-attention', subgoal, timelineActions: [], finalState: initial, partial: true, missing: _kingdomMissing(initial) };
	const opts = _planningOptions(initial, { ...options, subgoal }); const totalHours = schedule.reduce((sum, value) => sum + value, 0); const plan = createRoyalPlanState(initial, { ...opts, horizonHours: totalHours, maxEvents: options.maxEvents ?? 5000, autoCollectBeforeReset: false }); const completed = new Set(); const startUnlocked = R.armoryUnlockedCount(initial); let purchases = 0; const banking = { hours: 0, currency: 0, phases: 0, layoutChanges: 0 };
	_reportProgress(options, 'setup', 0, totalHours);
	for (let checkIn = 0; checkIn < schedule.length; checkIn++) {
		if (checkIn > 0) { applyRoyalPlanAction(plan, { kind: 'collect', all: true, automatic: false }); _push(plan, { kind: 'check-in', checkIn, nextIntervalHours: schedule[checkIn] }); }
		purchases += _lowAttentionPurchases(plan, startUnlocked, opts); const before = O.cloneRoyalState(_save(plan)); const layout = _lowAttentionLayout(plan, subgoal, schedule[checkIn], opts); const actions = _resetLayoutActions(before, layout);
		if (actions.length) { _setSave(plan, layout); _push(plan, { kind: 'layout-change', mode: 'low-attention', subgoal, checkIn, intervalHours: schedule[checkIn], actions, layoutBeforeState: _royalSnapshot(before), layoutState: _royalSnapshot(layout), reason: `Keep this ${subgoal} layout unchanged for the next ${schedule[checkIn]} hours.` }); }
		const windowBanking = _advanceLowAttentionWindow(plan, schedule[checkIn], completed); for (const key of Object.keys(banking)) banking[key] += windowBanking[key]; _reportProgress(options, 'schedule', plan.elapsedHours, totalHours, { checkIn: checkIn + 1, checkIns: schedule.length, completedNodes: completed.size });
	}
	applyRoyalPlanAction(plan, { kind: 'collect', all: true, automatic: false }); _push(plan, { kind: 'check-in', checkIn: schedule.length, complete: true }); purchases += _lowAttentionPurchases(plan, startUnlocked, opts);
	_reportProgress(options, 'finalize', totalHours, totalHours, { completedNodes: completed.size, purchases });
	return _jsonSafe({ available: true, complete: true, mode: 'low-attention', subgoal, intervals: schedule, elapsedHours: plan.elapsedHours, completedNodes: completed.size, purchases, timelineActions: _shelfTimeline(plan.events), finalState: _clone(_save(plan)), stateNotApplied: true, partial: plan.partial, missing: plan.missing.slice(), metrics: { completedNodes: completed.size, currencyCollected: _sumCurrency(plan.ledger.totals.currency), bankedPostResetHours: banking.hours, bankedPostResetCurrency: banking.currency, purchases, checkIns: schedule.length + 1 }, metadata: { bounded: true, deterministic: true, staticBetweenCheckIns: options.bankedTimePostReset !== true, collectionOnlyAtCheckIns: options.bankedTimePostReset !== true, purchasesOnlyAtCheckIns: true, banksIdleTimePostReset: options.bankedTimePostReset === true, bankingPhases: banking.phases, bankedLayoutChanges: banking.layoutChanges, spendsOutpostPoints: false, derivedInputEvaluations: opts._derivedInputEvaluations } });
}
function _placementTypeState(S, mapIdx, targetType, ext) {
	let state = O.cloneRoyalState(S);
	while (R.outpostType(state, mapIdx) !== targetType) {
		const direction = targetType > R.outpostType(state, mapIdx) ? 1 : -1; const result = O.applyRoyalMove(state, { kind: 'type', mapIdx, direction }, { ext });
		if (!result.ok || !result.executable) return null;
		state = result.state;
	}
	return state;
}
function _placementSeeds(S, targetType, options) {
	const seeds = []; const ext = options.ext; const cap = Math.max(1, Math.min(80, Math.floor(n(options.placementCandidateCap) || 24)));
	for (let mapIdx = 0; mapIdx < (S?.royalMapsData || []).length && seeds.length < cap; mapIdx++) {
		if (!R.outpostBuilt(S, mapIdx)) continue;
		const typed = _placementTypeState(S, mapIdx, targetType, ext); if (!typed) continue;
		if (targetType === 2) { seeds.push({ mapIdx, linkedMapIdx: null, state: typed }); continue; }
		for (let linkedMapIdx = 0; linkedMapIdx < (typed?.royalMapsData || []).length && seeds.length < cap; linkedMapIdx++) {
			if (linkedMapIdx === mapIdx || !R.outpostBuilt(typed, linkedMapIdx) || !R.outpostReachable(typed, mapIdx, linkedMapIdx, ext)) continue;
			const result = O.applyRoyalMove(typed, { kind: 'connection', mapIdx, slot: 0, endpoint: { kind: 'map', id: linkedMapIdx } }, { ext });
			if (result.ok && result.executable) seeds.push({ mapIdx, linkedMapIdx, state: result.state });
		}
	}
	return seeds;
}
function _placementScore(result, subgoal) {
	if (!result?.available) return [-1e30];
	if (subgoal === 'next-shelf') return [result.complete ? 1 : 0, -(result.etaHours ?? 1e30), result.shelvesUnlocked || 0, -(result.purchases?.length || 0)];
	const metrics = result.metrics || {}; return subgoal === 'least-wasteful' ? [result.completedNodes || 0, -n(metrics.movableWorkers), n(metrics.currencyCollected)] : [result.completedNodes || 0, n(metrics.currencyCollected), -n(result.elapsedHours)];
}
function _placementCorePlan(state, subgoal, targetType, mapIdx, options) {
	const child = { ...options, pinnedTypes: { ...(options.pinnedTypes || {}), [mapIdx]: targetType }, onProgress: undefined };
	return subgoal === 'next-shelf' ? planNextArmoryShelf(state, child) : planResetDrainSchedule(state, subgoal, child);
}
export function planSpecialPlacement(S, mode, subgoal = 'drain-before-reset', options = {}) {
	const targetType = mode === 'support-network' ? 1 : mode === 'savage-placement' ? 2 : -1; const supported = ['next-shelf', 'drain-before-reset', 'least-wasteful']; const initial = O.cloneRoyalState(_clone(S || {}));
	if (targetType < 0 || !supported.includes(subgoal)) return { available: false, mode, subgoal, timelineActions: [], finalState: initial, partial: true, missing: ['Unsupported placement mode or core goal'] };
	if (!R.hasCompleteRoyalData(initial)) return { available: false, mode, subgoal, timelineActions: [], finalState: initial, partial: true, missing: _kingdomMissing(initial) };
	const opts = _planningOptions(initial, options); const seeds = _placementSeeds(initial, targetType, opts); let best = null;
	_reportProgress(options, 'placements', 0, Math.max(1, seeds.length));
	for (let index = 0; index < seeds.length; index++) {
		const seed = seeds[index]; const result = _placementCorePlan(seed.state, subgoal, targetType, seed.mapIdx, opts); const score = _placementScore(result, subgoal); const item = { ...seed, result, score };
		if (!best || _compareScore(item.score, best.score) > 0 || _compareScore(item.score, best.score) === 0 && (item.mapIdx < best.mapIdx || item.mapIdx === best.mapIdx && n(item.linkedMapIdx, Infinity) < n(best.linkedMapIdx, Infinity))) best = item;
		_reportProgress(options, 'placements', index + 1, Math.max(1, seeds.length), { mapIdx: seed.mapIdx });
	}
	if (!best) return { available: false, mode, subgoal, timelineActions: [], finalState: initial, partial: true, missing: [`No legal ${targetType === 1 ? 'Support network' : 'Savage'} placement is available`] };
	const actions = _resetLayoutActions(initial, best.state); const placement = { kind: 'layout-change', mode, subgoal, timeHours: 0, actions, layoutBeforeState: _royalSnapshot(initial), layoutState: _royalSnapshot(best.state), reason: targetType === 1 ? `Place Support at this outpost and link it to map ${best.linkedMapIdx}.` : 'Place Savage here and preserve it while optimizing the surrounding layout.' };
	return _jsonSafe({ ...best.result, available: true, mode, coreMode: subgoal, subgoal, placement: { mapIdx: best.mapIdx, linkedMapIdx: best.linkedMapIdx, type: targetType }, timelineActions: [placement, ...(best.result.timelineActions || [])], finalState: _clone(best.result.finalState || best.state), stateNotApplied: true, metadata: { ...(best.result.metadata || {}), placementCandidates: seeds.length, pinsSelectedType: true, spendsOutpostPoints: false, approximation: `bounded ${targetType === 1 ? 'Support network' : 'Savage placement'} enumeration plus ${subgoal} planning; no global-optimum claim` } });
}
export function planNextArmoryShelf(S, options = {}) {
	const controls = _normalizedControls(options); const initial = O.cloneRoyalState(_clone(S || {})); const startUnlocked = R.armoryUnlockedCount(initial);
	const resolved480 = options.optionsList480 !== undefined ? n(options.optionsList480) : initial.olaData?.[480] !== undefined ? n(initial.olaData[480]) : n(optionsListData?.[480]);
	initial.olaData ||= []; initial.olaData[480] = resolved480;
	const currentTotal = R.armoryTotalLevels(initial);
	const effectiveThresholds = ARMORY_UPGRADES.map(upgrade => n(upgrade?.researchOrder)).filter(Number.isFinite).sort((a, b) => a - b).slice(0, R.armoryUnlockOrder().length);
	const nextThreshold = startUnlocked >= effectiveThresholds.length ? undefined : effectiveThresholds[startUnlocked];
	const levelsToNextThreshold = nextThreshold === undefined ? 0 : nextThreshold - currentTotal;
	const requestedCap = options.maxPurchases === undefined ? levelsToNextThreshold : Math.max(0, Math.floor(n(options.maxPurchases)));
	const purchaseCap = Math.min(levelsToNextThreshold, requestedCap, Math.max(1, Math.floor(n(options.operationCap) || 10000)));
	_reportProgress(options, 'setup', 0, Math.max(1, purchaseCap));
	const metadata = { bounded: true, deterministic: true, approximation: 'fixed-depth event-aware scheduler with deterministic all-outpost reconnection, local profession reassignment, multi-currency portfolio scoring, and rank fallback; no global-optimum claim', objective: 'unlock the next shelf while reconnecting every Normal outpost to a reachable eligible-currency resource without spending outpost points', automaticCurrencyPriority: true, concurrentCurrencyAccumulation: true, reconnectionsOnly: true, professionPolicy: 'minimum Guards for reach, remaining movable units as Workers, stranded units as Trader or Surveyor', secondaryDrainPriority: 'shortest projected drain time', currencySlotsConsidered: [], reevaluatesAfterEachPurchase: true, reevaluatesAfterEachEvent: true, banksIdleTimePostReset: options.bankedTimePostReset === true, bankedPostResetHours: 0, bankedPostResetCurrency: 0, bankingPhases: 0, layoutEvaluations: 0, layoutChanges: 0, rankFallbacks: 0, excludedPurchaseIndices: [68], excludedReasons: { 68: 'Kingdom Sovereignty changes account assignments and outpost effects; excluded until modeled.' }, caps: { purchaseCap, operationCap: Math.max(1, Math.floor(n(options.operationCap) || 10000)), maxEvents: controls.maxEvents, layoutCurrencyCap: options.layoutCurrencyCap === undefined ? null : Math.max(1, Math.min(64, Math.floor(n(options.layoutCurrencyCap)))), layoutCandidateCap: null }, evaluated: 0, events: 0, resetEvents: 0, depletionEvents: 0, collectionEvents: 0, truncated: purchaseCap < levelsToNextThreshold };
	const finish = result => { _reportProgress(options, 'finalize', Math.max(1, purchaseCap), Math.max(1, purchaseCap), { evaluated: metadata.evaluated }); return _jsonSafe(result); };
	const unavailable = (missing, reason) => finish({ available: false, complete: false, startUnlocked, nextUnlocked: startUnlocked, nextShelf: null, purchasesNeeded: null, levelsToNextThreshold: null, shelvesUnlocked: 0, etaHours: null, purchases: [], alternatives: [], finalState: initial, stateNotApplied: true, partial: true, missing: [...new Set(missing)], metadata: { ...metadata, reason } });
	if (!R.hasCompleteRoyalData(initial)) return unavailable([...(R.hasRoyalGData(initial) ? [] : ['RoyalG']), ...(R.hasRoyalMapsData(initial) ? [] : ['RoyalMaps'])], 'complete Royal data required');
	if (startUnlocked >= R.armoryUnlockOrder().length) {
		const banked = options.bankedTimePostReset === true ? planResetDrainSchedule(initial, 'drain-before-reset', { ...options, onProgress: undefined }) : null;
		if (banked?.available) { metadata.bankedPostResetHours = n(banked.metrics?.bankedPostResetHours); metadata.bankedPostResetCurrency = n(banked.metrics?.bankedPostResetCurrency); metadata.bankingPhases = metadata.bankedPostResetHours > EPSILON ? 1 : 0; }
		return finish({ available: true, complete: true, startUnlocked, nextUnlocked: startUnlocked, nextShelf: null, purchasesNeeded: 0, levelsToNextThreshold, shelvesUnlocked: 0, etaHours: banked?.elapsedHours ?? 0, purchases: [], alternatives: [], requiredActions: (banked?.timelineActions || []).filter(event => ['collect', 'reset'].includes(event.kind)), timelineActions: banked?.timelineActions || [], finalState: banked?.finalState || initial, stateNotApplied: true, partial: banked?.partial || false, missing: banked?.missing || [], metadata });
	}
	const plan = createRoyalPlanState(initial, { ...options, ...controls, horizonHours: PLANNER_LIMITS.horizonHours[1], optionsList480: resolved480, autoCollectBeforeReset: options.autoCollectBeforeReset !== false });
	plan.horizonHours = Number.MAX_SAFE_INTEGER; plan.done = false;
	const purchases = []; let reason = null; let resetsWithoutAffordableIncome = 0; let terminalBankTimeline = [];
	while (purchases.length < purchaseCap && R.armoryUnlockedCount(_save(plan)) === startUnlocked) {
		if (plan.nextResetHours !== null && plan.nextResetHours <= plan.elapsedHours + EPSILON) {
			const result = advanceRoyalPlan(plan); metadata.events++; metadata.resetEvents++;
			if (result.event.kind === 'event-cap' || plan.truncated) { reason = 'event cap reached before the shelf unlocked'; metadata.truncated = true; break; }
			continue;
		}
		const candidates = _armoryShelfCandidates(plan); metadata.evaluated += candidates.length;
		if (!candidates.length) {
			reason = R.armoryLevel(_save(plan), 68) < (ARMORY_UPGRADES[68]?.maxLevel ?? 0) ? 'required purchase is excluded: Kingdom Sovereignty' : 'no eligible Armory upgrades remain';
			if (options.bankedTimePostReset === true && plan.nextResetHours !== null && plan.nextResetHours > plan.elapsedHours + EPSILON) {
				const source = O.cloneRoyalState(_save(plan)); source.timeAwayData = { ...(source.timeAwayData || {}), ShopRestock: (plan.nextResetHours - plan.elapsedHours) * 3600 };
				const banked = planResetDrainSchedule(source, 'drain-before-reset', { ...options, onProgress: undefined });
				if (banked.available) { const offset = plan.elapsedHours; terminalBankTimeline = (banked.timelineActions || []).map(event => ({ ...event, timeHours: n(event.timeHours) + offset })); _setSave(plan, banked.finalState); plan.elapsedHours += n(banked.elapsedHours); metadata.bankedPostResetHours += n(banked.metrics?.bankedPostResetHours); metadata.bankedPostResetCurrency += n(banked.metrics?.bankedPostResetCurrency); if (n(banked.metrics?.bankedPostResetHours) > EPSILON) metadata.bankingPhases++; }
			}
			break;
		}
		metadata.currencySlotsConsidered = [...new Set([...metadata.currencySlotsConsidered, ...candidates.map(item => item.currencySlot)])].sort((a, b) => a - b);
		const strategy = _shelfLayoutStrategy(plan, candidates, options); metadata.layoutEvaluations++; if (strategy.mode === 'rank') metadata.rankFallbacks++;
		if (strategy.moves.length) { const layoutBeforeState = _royalSnapshot(_save(plan)); _setSave(plan, O.cloneRoyalState(strategy.state)); metadata.layoutChanges += strategy.moves.length; _push(plan, { kind: 'layout-change', mode: strategy.mode, currencySlot: strategy.mode === 'currency-portfolio' ? strategy.candidate.currencySlot : null, portfolio: strategy.portfolio?.map(_clone) || [], actions: strategy.moves.map(_clone), layoutBeforeState, layoutState: _royalSnapshot(strategy.state), reason: strategy.mode === 'currency-portfolio' ? `Focus currency slot ${strategy.candidate.currencySlot}; use the minimum Guards needed for range, fill remaining slots with Workers, and clear other reachable nodes by shortest projected drain time.` : 'No eligible upgrade currency has productive reachable nodes; assign stranded occupied slots to Trader or Surveyor rank EXP.' }); }
		const candidate = strategy.mode === 'currency-portfolio' ? strategy.candidate : _armoryShelfCandidates(plan)[0];
		const productiveResource = !!_nextDepletion(royalPlanRates(plan));
		if (options.bankedTimePostReset === true && !productiveResource && plan.nextResetHours !== null && plan.nextResetHours > plan.elapsedHours + EPSILON) {
			const banked = _bankIdleTimeAcrossReset(plan, plan.nextResetHours - plan.elapsedHours, options); metadata.events++; metadata.resetEvents++; metadata.layoutChanges += banked.layoutChanges; metadata.bankedPostResetHours += banked.durationHours; metadata.bankedPostResetCurrency += banked.currency; metadata.bankingPhases++;
			resetsWithoutAffordableIncome = banked.currency > EPSILON ? 0 : resetsWithoutAffordableIncome + 1; if (resetsWithoutAffordableIncome > 1) { reason = 'unachievable with current currency income'; break; } continue;
		}
		if (candidate.hours <= EPSILON) {
			purchases.push(_applyArmoryShelfPurchase(plan, candidate)); resetsWithoutAffordableIncome = 0;
			_reportProgress(options, 'schedule', purchases.length, Math.max(1, purchaseCap), { evaluated: metadata.evaluated });
			continue;
		}
		if (plan.nextResetHours === null) { reason = 'missing TimeAway.ShopRestock'; _missing(plan, ['TimeAway.ShopRestock']); break; }
		plan.options.targetArmory = { index: candidate.index, currencySlot: candidate.currencySlot };
		const before = plan.elapsedHours; const result = advanceRoyalPlan(plan); metadata.events++;
		if (result.event.kind === 'reset') { metadata.resetEvents++; resetsWithoutAffordableIncome = Number.isFinite(candidate.hours) ? 0 : resetsWithoutAffordableIncome + 1; }
		if (result.event.kind === 'depletion') metadata.depletionEvents++;
		if (result.event.kind === 'event-cap' || plan.truncated) { reason = 'event cap reached before the shelf unlocked'; metadata.truncated = true; break; }
		if (result.event.kind === 'horizon' || (plan.elapsedHours <= before + EPSILON && result.event.kind !== 'reset')) { reason = 'scheduler could not advance to the next purchase'; break; }
		if (resetsWithoutAffordableIncome > 1) { reason = 'unachievable with current currency income'; break; }
	}
	const finalState = _clone(_save(plan)); const nextUnlocked = R.armoryUnlockedCount(finalState); const complete = nextUnlocked > startUnlocked;
	if (!complete && !reason) reason = purchaseCap < levelsToNextThreshold ? 'purchase cap reached before the shelf unlocked' : 'next shelf could not be unlocked';
	const next = _armoryShelfCandidates(plan)[0]; const timelineActions = [..._shelfTimeline(plan.events), ...terminalBankTimeline]; const requiredActions = timelineActions.filter(event => ['collect', 'reset'].includes(event.kind)).map(_clone);
	metadata.collectionEvents = requiredActions.filter(event => event.kind === 'collect' || event.kind === 'refill').length;
	return finish({ available: true, complete, startUnlocked, nextUnlocked, nextShelf: next ? { index: next.index, orderIndex: next.orderIndex, name: next.name, currencySlot: next.currencySlot, cost: next.cost } : null, purchasesNeeded: purchases.length, levelsToNextThreshold, shelvesUnlocked: nextUnlocked - startUnlocked, etaHours: complete ? plan.elapsedHours : null, purchases, alternatives: [], assumptions: { autoCollectBeforeReset: plan.options.autoCollectBeforeReset === true, dailyPurchaseCounterResets: true }, requiredActions, timelineActions, finalState, stateNotApplied: true, partial: !complete || plan.partial, missing: plan.missing.slice(), metadata: { ...metadata, reason: complete ? null : reason, finalBalances: (finalState.royalGData?.[1] || []).slice(), totalLevels: R.armoryTotalLevels(finalState), resetTiming: R.royalResetTiming(finalState) } });
}
export function applyRoyalPlanAction(plan, action, options) { const move = action || {}; const S = _save(plan); if (move.kind === 'collect') { const indices = (move.all ? ROYAL_RESOURCES.map((_, index) => index) : move.resourceIdx === undefined ? [] : [n(move.resourceIdx)]).filter(_releasedResource); const collected = []; for (const index of indices) if (R.resourceRawProgress(S, index) >= R.resourceCapacity(S, index) && R.resourceRawProgress(S, index) !== -1) { S.royalGData[4][index] = -1; collected.push(index); } _push(plan, { kind: 'collect', resources: collected, automatic: move.automatic === true }); plan.actionLog.push({ ...move, resources: collected }); return { ok: true, state: S, plan, collected }; } const result = O.applyRoyalMove(S, move, { ...(plan.options.optimizerOptions || {}), ...(options || {}) }); if (!result.ok) return { ...result, plan }; _setSave(plan, result.state); const cost = move.kind === 'outpost-upgrade' ? [12, 2, 1][n(move.upgrade ?? move.level)] || 0 : 0; const actionRecord = { ...move, pointsSpentGross: cost }; plan.actionLog.push(actionRecord); _push(plan, { kind: 'action', action: actionRecord, executable: result.executable, pointsSpentGross: cost }); return { ...result, plan }; }
export const royalPlanAction = applyRoyalPlanAction;

function _plannerOptions(options) {
	return { ...options, ..._normalizedControls(options) };
}
function _mapRow(S, mapIdx) { return S?.royalMapsData?.[Math.floor(n(mapIdx))]; }
function _points(S, mapIdx) { return Math.max(0, R.outpostPointsLeft(S, mapIdx)); }
function _currencyDelta(before, after, slot) { return n(after?.royalGData?.[1]?.[slot]) - n(before?.royalGData?.[1]?.[slot]); }
function _selectedResource(options) {
	const target = options.targetResource ?? options.resourceIdx ?? options.resource;
	if (target && typeof target === 'object') return n(target.resourceIdx ?? target.index);
	return target === undefined ? null : n(target);
}
function _rangeTarget(S, mapIdx, options) {
	const target = options.rangeTarget;
	if (!target || typeof target !== 'object') return null;
	const hasDistance = Object.prototype.hasOwnProperty.call(target, 'distance'); const hasResource = Object.prototype.hasOwnProperty.call(target, 'resourceIdx');
	if (hasDistance === hasResource) return null;
	if (hasDistance) { const distance = Number(target.distance); return Number.isFinite(distance) && distance > 0 ? { resourceIdx: null, distance } : null; }
	const resourceIdx = Number(target.resourceIdx); const resource = ROYAL_RESOURCES[resourceIdx]; const distance = Number.isInteger(resourceIdx) && resource ? R.resourceDistance(mapIdx, resourceIdx) : Infinity;
	return Number.isFinite(distance) ? { resourceIdx, distance } : null;
}
function _rangeTargetIssue(S, mapIdx, options) { const target = options.rangeTarget; if (!target || typeof target !== 'object') return 'explicit rangeTarget is required'; const hasDistance = Object.prototype.hasOwnProperty.call(target, 'distance'); const hasResource = Object.prototype.hasOwnProperty.call(target, 'resourceIdx'); if (hasDistance === hasResource) return 'rangeTarget must specify exactly one of distance or resourceIdx'; if (hasDistance) return Number.isFinite(Number(target.distance)) && Number(target.distance) > 0 ? null : 'rangeTarget distance must be finite and positive'; const resourceIdx = Number(target.resourceIdx); if (!Number.isInteger(resourceIdx) || !ROYAL_RESOURCES[resourceIdx]) return 'rangeTarget resource does not exist'; if (R.resourceWorld(resourceIdx) !== R.outpostWorld(mapIdx)) return 'rangeTarget resource is cross-world'; if (!Number.isFinite(R.resourceDistance(mapIdx, resourceIdx))) return 'rangeTarget geometry is unavailable'; return null; }
function _nextRankEta(plan, mapIdx, bar) {
	const rank = royalPlanRates(plan).ranks.find(item => item.mapIdx === mapIdx && item.bar === bar);
	if (!rank) return { eta: null, reason: 'rank unavailable', status: 'unavailable' };
	if (rank.nextReq <= rank.exp + EPSILON) return { eta: 0, reason: null, status: 'ready' };
	if (rank.rate <= 0) return { eta: null, reason: 'no rate', status: 'unavailable' };
	return { eta: (rank.nextReq - rank.exp) / rank.rate, reason: null, status: 'available' };
}
function _resourceRate(plan, mapIdx, options) {
	const resourceIdx = _selectedResource(options);
	const details = royalPlanRates(plan).resources.filter(item => resourceIdx === null || item.resourceIdx === resourceIdx);
	return details.reduce((sum, item) => sum + (item.streams || []).filter(stream => stream.mapIdx === mapIdx).reduce((subtotal, stream) => subtotal + n(stream.currencyRate), 0), 0);
}
function _barracksSlot(S, mapIdx) { const level = n(_mapRow(S, mapIdx)?.[0]); const oldCap = Math.min(6, 1 + level); const newCap = Math.min(6, 1 + level + 1); return newCap > oldCap ? oldCap : null; }
function _metrics(plan, baseline, mapIdx, goal, options) {
	const S = _save(plan); const row = _mapRow(S, mapIdx); const selectedResource = _selectedResource(options);
	const currencySlot = selectedResource === null ? null : R.resourceCurrency(selectedResource);
	const rate = _resourceRate(plan, mapIdx, options); const range = R.outpostRange(S, mapIdx, options.ext);
	const rangeTarget = _rangeTarget(S, mapIdx, options); const rangeRequired = rangeTarget ? rangeTarget.distance - 15 : null;
	const reachable = rangeTarget ? range >= rangeRequired : null;
	const nextTrading = _nextRankEta(plan, mapIdx, 0); const nextTradingEta = nextTrading.eta; const nextCommand = R.nextCommandRankUnit(S, mapIdx);
	const commandReq = R.outpostExpFormula(nextCommand.rank - 1, 2); const commandExp = n(row?.[5]); const commandRate = royalPlanRates(plan).ranks.find(item => item.mapIdx === mapIdx && item.bar === 2)?.rate || 0;
	const commandEta = commandRate > 0 && Number.isFinite(commandReq) ? Math.max(0, commandReq - commandExp) / commandRate : null;
	const commandEtaReason = !Number.isFinite(commandReq) ? 'rank requirement overflow' : commandEta === null ? 'no rate' : !Number.isFinite(commandEta) ? 'rank requirement overflow' : null;
	const scoped = Object.values(plan.ledger.streams).filter(stream => stream.mapIdx === mapIdx && (selectedResource === null || stream.resourceIdx === selectedResource)); const integrated = scoped.reduce((sum, stream) => sum + (stream.savage ? stream.drain : stream.currency), 0);
	const pointsSpentGross = plan.actionLog.reduce((sum, action) => sum + n(action.pointsSpentGross), 0); const pointsEarned = plan.events.reduce((sum, event) => sum + n(event.pointsEarned), 0); const pointsRetained = _points(S, mapIdx);
	const professionAction = plan.actionLog.slice().reverse().find(action => action.kind === 'profession' && n(action.mapIdx) === mapIdx); const selectedUnit = professionAction ? R.outpostUnits(S, mapIdx).find(unit => unit.slot === n(professionAction.slot)) : R.outpostUnits(S, mapIdx)[0];
	const rangeEta = reachable === true ? 0 : rangeTarget && R.logisticsUpgradesToReach(S, mapIdx, rangeTarget.distance, 15, options.ext).possible ? null : null;
	const rangeEtaReason = reachable === true ? null : rangeTarget ? 'requires upgrade' : 'no target';
	return { pointsSpent: pointsSpentGross, pointsSpentGross, pointsEarned, pointsRetained, rate, integratedCollection: integrated, ledger: { streams: scoped, drain: scoped.reduce((sum, stream) => sum + stream.drain, 0), currency: scoped.reduce((out, stream) => { if (stream.currency) out[stream.currencySlot ?? -1] = (out[stream.currencySlot ?? -1] || 0) + stream.currency; return out; }, {}) }, currencyRate: rate, range, rangeTarget: rangeRequired, rangeDistance: rangeTarget?.distance ?? null, reachable, etaHours: rangeEta, etaReason: rangeEtaReason, etaStatus: reachable === true ? 'ready' : 'unavailable', nextTradingPointEta: nextTradingEta, nextTradingPointReason: nextTrading.reason, nextTradingPointStatus: nextTrading.status, nextCommandUnitEta: commandEta, nextCommandUnitReason: commandEtaReason, nextCommandUnitStatus: commandEta === null ? 'unavailable' : 'available', nextCommandUnit: nextCommand, barracksEtaHours: null, barracksEtaReason: 'no barracks action', barracksEtaStatus: 'unavailable', levels: { barracks: n(row?.[0]), logistics: n(row?.[1]), education: n(row?.[2]) }, selectedProfession: selectedUnit?.type ?? null, goal };
}
function _etaBenefit(before, after) { if (before === null && after === null) return 0; if (before === null) return after === null ? 0 : 1; if (after === null) return -1; return Math.max(-1, Math.min(1, (before - after) / Math.max(1, Math.abs(before)))); }
function _goalValue(metrics, baseline, goal, options) {
	if (goal === 'collection') return metrics.integratedCollection * 1e-6 + metrics.rate * 1e-9;
	if (goal === 'range') return (metrics.reachable ? 1 : 0) - (metrics.reachable ? metrics.pointsSpent * 1e-6 : Math.max(0, (metrics.rangeTarget || 0) - metrics.range) / Math.max(1, metrics.rangeTarget || 1));
	if (goal === 'trading-points') return _etaBenefit(baseline.nextTradingPointEta, metrics.nextTradingPointEta);
	if (goal === 'command-units') return _etaBenefit(baseline.nextCommandUnitEta, metrics.nextCommandUnitEta);
	const weights = { collection: 1, range: 1, 'trading-points': 1, 'command-units': 1, ...(options.weights || {}) };
	const pct = (value, base) => base === 0 ? (value > 0 ? 1 : 0) : (value - base) / Math.abs(base);
	return weights.collection * pct(metrics.integratedCollection, baseline.integratedCollection) + weights.range * (metrics.reachable === baseline.reachable ? 0 : metrics.reachable ? 1 : -1) + weights['trading-points'] * _etaBenefit(baseline.nextTradingPointEta, metrics.nextTradingPointEta) + weights['command-units'] * _etaBenefit(baseline.nextCommandUnitEta, metrics.nextCommandUnitEta);
}
function _advanceToPoints(plan, mapIdx, points, actions) {
	while (_points(_save(plan), mapIdx) < points && !plan.done && !plan.truncated) {
		const before = plan.elapsedHours; advanceRoyalPlan(plan); if (plan.elapsedHours <= before + EPSILON) break;
	}
	if (_points(_save(plan), mapIdx) >= points) return true;
	return false;
}
function _evaluateCandidate(S, mapIdx, goal, options, purchases, profession, baseline, baselinePlan) {
	const plan = !purchases.length && profession === undefined && baselinePlan ? baselinePlan : createRoyalPlanState(S, options); const actions = []; let reason = null;
	for (const action of purchases) { const result = applyRoyalPlanAction(plan, action, options.optimizerOptions); if (!result.ok) { reason = result.errors?.join('; ') || 'action rejected'; break; } actions.push(action); }
	if (!reason && profession !== undefined) { const action = { kind: 'profession', mapIdx, slot: profession.slot, type: profession.type }; const result = applyRoyalPlanAction(plan, action, options.optimizerOptions); if (!result.ok) reason = result.errors?.join('; '); else actions.push(action); }
	if (reason) return { invalid: true, reason };
	while (!plan.done && !plan.truncated) advanceRoyalPlan(plan);
	const metrics = _metrics(plan, S, mapIdx, goal, options);
	metrics.goalImprovement = _goalValue(metrics, baseline, goal, options) - _goalValue(baseline, baseline, goal, options);
	const barracksCost = 12; const retained = metrics.pointsRetained; metrics.breakEven = metrics.pointsSpent > 0 && metrics.goalImprovement > 0 ? metrics.pointsSpent / metrics.goalImprovement : null;
	const barracksEvent = plan.events.find(event => event.kind === 'action' && event.action?.upgrade === 0);
	if (barracksEvent) { metrics.barracksEtaHours = barracksEvent.timeHours; metrics.barracksEtaReason = null; metrics.barracksEtaStatus = 'purchased'; }
	return { kind: actions.length ? 'purchase' : 'save', actions, timeline: plan.events, ledger: plan.ledger, elapsedHours: plan.elapsedHours, metrics, opportunityCost: metrics.pointsSpentGross, barracksEtaHours: barracksEvent ? barracksEvent.timeHours : null, barracksEtaReason: barracksEvent ? null : 'no barracks action', barracksEtaStatus: barracksEvent ? 'purchased' : 'unavailable', partial: plan.partial, missing: plan.missing };
}
function _evaluateDeferredBarracks(S, mapIdx, goal, options, purchases, profession, baseline) {
	const plan = createRoyalPlanState(S, options); const actions = [];
	for (const action of purchases) { const result = applyRoyalPlanAction(plan, action, options.optimizerOptions); if (!result.ok) return null; actions.push(action); }
	if (!_advanceToPoints(plan, mapIdx, 12, actions)) return null;
	const barracks = { kind: 'outpost-upgrade', mapIdx, upgrade: 0 }; const result = applyRoyalPlanAction(plan, barracks, options.optimizerOptions); if (!result.ok) return null; actions.push(barracks);
	if (profession !== undefined) { const professionAction = { kind: 'profession', mapIdx, slot: profession.slot, type: profession.type }; const professionResult = applyRoyalPlanAction(plan, professionAction, options.optimizerOptions); if (!professionResult.ok) return null; actions.push(professionAction); }
	while (!plan.done && !plan.truncated) advanceRoyalPlan(plan);
	const metrics = _metrics(plan, S, mapIdx, goal, options);
	metrics.goalImprovement = _goalValue(metrics, baseline, goal, options) - _goalValue(baseline, baseline, goal, options);
	const barracksEvent = plan.events.find(event => event.kind === 'action' && event.action?.upgrade === 0);
	if (barracksEvent) { metrics.barracksEtaHours = barracksEvent.timeHours; metrics.barracksEtaReason = null; metrics.barracksEtaStatus = 'purchased'; }
	return { kind: 'save-then-purchase', actions, timeline: plan.events, ledger: plan.ledger, elapsedHours: plan.elapsedHours, metrics, opportunityCost: metrics.pointsSpentGross, barracksEtaHours: barracksEvent ? barracksEvent.timeHours : null, barracksEtaReason: barracksEvent ? null : 'no barracks action', barracksEtaStatus: barracksEvent ? 'purchased' : 'unavailable', partial: plan.partial, missing: plan.missing };
}
function _candidateKey(purchases, profession) { return JSON.stringify({ purchases, profession }); }

function _pointRateMetrics(S, mapIdx, options, linkedGrades = false) {
	const metrics = { selectedNormal: 0, accountNormal: 0, selectedSavageDrain: 0, accountSavageDrain: 0, normalByCurrency: {} };
	const missing = new Set(); let partial = false;
	for (let index = 0; index < (S?.royalMapsData || []).length; index++) {
		if (!R.outpostBuilt(S, index) || R.outpostType(S, index) === 1) continue;
		const selected = index === mapIdx; const type = R.outpostType(S, index);
		if (linkedGrades) {
			for (let slot = 0; slot < 2; slot++) {
				const link = R.resourceLinkBreakdown(S, index, slot, options.ext); if (!link.available) continue;
				partial ||= link.preGrade.partial; for (const source of link.preGrade.missing || []) missing.add(source);
				if (type === 2) { metrics.accountSavageDrain += link.drainRate; if (selected) metrics.selectedSavageDrain += link.drainRate; }
				else { metrics.accountNormal += link.gradedRate; metrics.normalByCurrency[link.currencySlot] = (metrics.normalByCurrency[link.currencySlot] || 0) + link.gradedRate; if (selected) metrics.selectedNormal += link.gradedRate; }
			}
			continue;
		}
		const production = R.outpostResourceRateBreakdown(S, index, options.ext);
		partial ||= production.partial; for (const source of production.missing || []) missing.add(source);
		if (type === 2) { const drain = production.value * R.savageCollection(S); metrics.accountSavageDrain += drain; if (selected) metrics.selectedSavageDrain += drain; }
		else { metrics.accountNormal += production.value; if (selected) metrics.selectedNormal += production.value; }
	}
	return { ...metrics, linkedGrades, invalid: [], partial, missing: [...missing] };
}
function _pointProfessionState(S, mode) {
	const state = O.cloneRoyalState(S);
	if (mode === 'current') return state;
	for (let mapIdx = 0; mapIdx < (state.royalMapsData || []).length; mapIdx++) {
		if (!R.outpostBuilt(state, mapIdx)) continue;
		const digits = O.decodePackedUnitDigits(state.royalMapsData[mapIdx][11]);
		for (let slot = 0; slot < digits.length; slot++) {
			if (mode === 'no-workers' && digits[slot] === 2) digits[slot] = 3;
			else if (mode === 'all-workers' && digits[slot] >= 2 && digits[slot] <= 5) digits[slot] = 2;
		}
		state.royalMapsData[mapIdx][11] = O.encodePackedUnitDigits(digits);
	}
	return state;
}
function _pointScenarioMetrics(baseline, current) {
	const delta = {}; const deltaPerPoint = {};
	for (const key of ['selectedNormal', 'accountNormal', 'selectedSavageDrain', 'accountSavageDrain']) { delta[key] = current[key] - baseline[key]; deltaPerPoint[key] = delta[key] / 12; }
	return { rates: current, delta, deltaPerPoint };
}
function _pointUnavailable(name, actions, reason) { return { name, package: name, available: false, reason, actions, points: 12, delta: null, deltaPerPoint: null }; }

function _legacyPlanOutpostPointSpending(S, mapIdx, goal = 'collection', options = {}) {
	let opts = _plannerOptions(options); const index = Math.floor(n(mapIdx)); const supported = ['collection', 'range', 'trading-points', 'command-units', 'balanced'];
	_reportProgress(options, 'setup', 0, opts.candidateCap);
	if (!supported.includes(goal)) throw new RangeError(`unsupported outpost point goal: ${goal}`);
	if (!R.hasCompleteRoyalData(S) || !_mapRow(S, index) || !R.outpostBuilt(S, index)) {
		const missing = [...new Set([...(R.hasRoyalGData(S) ? [] : ['RoyalG']), ...(R.hasRoyalMapsData(S) ? [] : ['RoyalMaps']), ...(!_mapRow(S, index) || !R.outpostBuilt(S, index) ? [`map ${index} outpost`] : []), ...(goal === 'range' && !_rangeTarget(S, index, opts) ? ['range target'] : [])])];
		return { recommendation: null, alternatives: [], baseline: null, metadata: { bounded: true, candidatesEvaluated: 0, candidatesReturned: 0, truncated: false, generationCapped: false, caps: { maxPurchases: opts.maxPurchases, candidateCap: opts.candidateCap, horizonHours: opts.horizonHours, maxEvents: opts.maxEvents }, approximation: 'unavailable input data' }, partial: true, missing };
	}
	const rangeIssue = goal === 'range' ? _rangeTargetIssue(S, index, opts) : null;
	if (rangeIssue) return { recommendation: null, alternatives: [], baseline: null, metadata: { bounded: true, candidatesEvaluated: 0, candidatesReturned: 0, truncated: false, generationCapped: false, caps: { maxPurchases: opts.maxPurchases, candidateCap: opts.candidateCap, horizonHours: opts.horizonHours, maxEvents: opts.maxEvents }, approximation: 'invalid range target' }, partial: true, missing: [rangeIssue] };
	opts = _planningOptions(S, opts);
	const baselinePlan = simulateRoyalPlan(S, opts); const baseline = _metrics(baselinePlan, S, index, goal, opts); const candidates = []; const seen = new Set();
	_reportProgress(options, 'baseline', 0, opts.candidateCap);
	const add = (purchases, profession, kind) => { if (purchases.length > opts.maxPurchases) return; const key = _candidateKey(purchases, profession); if (seen.has(key)) return; seen.add(key); const candidate = _evaluateCandidate(S, index, goal, opts, purchases, profession, baseline, baselinePlan); if (!candidate.invalid) { candidate.strategy = kind || (profession ? 'barracks-profession' : purchases.length ? 'immediate' : 'save'); candidates.push(candidate); } _reportProgress(options, 'candidates', candidates.length, opts.candidateCap); };
	add([], undefined);
	const currentPoints = _points(S, index); const maxLogistics = Math.min(opts.maxPurchases, Math.floor(currentPoints / 2));
	for (let count = 1; count <= maxLogistics; count++) add(Array.from({ length: count }, () => ({ kind: 'outpost-upgrade', mapIdx: index, upgrade: 1 })), undefined, 'immediate-logistics');
	if (currentPoints >= 12) {
		const professions = opts.unlockedProfessions || [0, 1, 2, 3]; const slot = _barracksSlot(S, index); add([{ kind: 'outpost-upgrade', mapIdx: index, upgrade: 0 }], undefined, 'immediate-barracks'); if (slot !== null) for (const profession of professions) add([{ kind: 'outpost-upgrade', mapIdx: index, upgrade: 0 }], { slot, type: n(profession) }, 'barracks-profession');
	}
	if (opts.maxPurchases >= 1) {
		const professions = opts.unlockedProfessions || [0, 1, 2, 3];
		const maxDeferredLogistics = Math.min(maxLogistics, opts.maxPurchases - 1);
		for (let count = 0; count <= maxDeferredLogistics; count++) {
			const purchases = Array.from({ length: count }, () => ({ kind: 'outpost-upgrade', mapIdx: index, upgrade: 1 }));
			const deferredSlot = _barracksSlot(S, index); const key = _candidateKey([...purchases, { kind: 'outpost-upgrade', mapIdx: index, upgrade: 0, deferred: true }], undefined); if (!seen.has(key)) { seen.add(key); const candidate = _evaluateDeferredBarracks(S, index, goal, opts, purchases, undefined, baseline); if (candidate) { candidate.strategy = 'deferred-barracks'; candidates.push(candidate); } }
			if (deferredSlot !== null) for (const profession of professions) { const professionKey = _candidateKey([...purchases, { kind: 'outpost-upgrade', mapIdx: index, upgrade: 0, deferred: true }], { slot: deferredSlot, type: n(profession) }); if (seen.has(professionKey)) continue; seen.add(professionKey); const candidate = _evaluateDeferredBarracks(S, index, goal, opts, purchases, { slot: deferredSlot, type: n(profession) }, baseline); if (candidate) { candidate.strategy = 'deferred-barracks-profession'; candidates.push(candidate); } }
		}
	}
	if (currentPoints >= 1) add([{ kind: 'outpost-upgrade', mapIdx: index, upgrade: 2 }], undefined, 'education');
	const education = candidates.find(candidate => candidate.actions.some(action => action.upgrade === 2));
	const saveForBarracks = candidates.find(candidate => candidate.strategy === 'save') || _evaluateCandidate(S, index, goal, opts, [], undefined, baseline, baselinePlan); saveForBarracks.kind = 'save'; saveForBarracks.strategy = 'save'; saveForBarracks.target = 'Expanded Barracks'; saveForBarracks.pointsNeeded = Math.max(0, 12 - currentPoints); saveForBarracks.etaHours = null; saveForBarracks.etaReason = saveForBarracks.pointsNeeded <= 0 ? 'already affordable' : 'no future points';
	const saveProbe = createRoyalPlanState(S, opts); if (saveForBarracks.pointsNeeded > 0 && _advanceToPoints(saveProbe, index, 12, [])) { saveForBarracks.etaHours = saveProbe.elapsedHours; saveForBarracks.etaReason = null; saveForBarracks.timeline = saveProbe.events; }
	for (const candidate of candidates) { candidate.score = Number.isFinite(_goalValue(candidate.metrics, baseline, goal, opts)) ? _goalValue(candidate.metrics, baseline, goal, opts) : 0; candidate.metrics.goalImprovement = Number.isFinite(candidate.score) ? candidate.score : 0; }
	const ranked = candidates.sort((a, b) => b.metrics.goalImprovement - a.metrics.goalImprovement || a.metrics.pointsSpentGross - b.metrics.pointsSpentGross || JSON.stringify(a.actions).localeCompare(JSON.stringify(b.actions)));
	let best = ranked.find(candidate => !candidate.actions.some(action => action.upgrade === 2)) || ranked[0] || saveForBarracks;
	if (saveForBarracks.etaHours !== null && best.metrics.goalImprovement <= 0) { saveForBarracks.score = 0; ranked.unshift(saveForBarracks); best = saveForBarracks; }
	const reservedStrategies = ['save', 'immediate-logistics', 'immediate-barracks', 'barracks-profession', 'deferred-barracks', 'deferred-barracks-profession'];
	const alternatives = [best]; const selected = new Set(alternatives);
	for (const strategy of reservedStrategies) { const candidate = ranked.find(item => item.strategy === strategy); if (candidate && alternatives.length < opts.candidateCap && !selected.has(candidate)) { alternatives.push(candidate); selected.add(candidate); } }
	for (const candidate of ranked) if (alternatives.length < opts.candidateCap && !selected.has(candidate)) alternatives.push(candidate);
	_reportProgress(options, 'finalize', opts.candidateCap, opts.candidateCap, { evaluated: candidates.length });
	return { recommendation: best, alternatives, baseline, metadata: { bounded: true, candidatesEvaluated: candidates.length, candidatesReturned: alternatives.length, baselineSimulations: 1, derivedInputEvaluations: opts._derivedInputEvaluations, truncated: candidates.length > alternatives.length, generationCapped: false, caps: { maxPurchases: opts.maxPurchases, candidateCap: opts.candidateCap, horizonHours: opts.horizonHours, maxEvents: opts.maxEvents }, approximation: 'deterministic bounded action candidates; no global-optimum claim' }, partial: baselinePlan.partial, missing: baselinePlan.missing };
}

export function planOutpostPointSpending(S, mapIdx, goal = 'collection', options = {}) {
	const opts = _planningOptions(S, _plannerOptions(options)); const index = Math.floor(n(mapIdx));
	_reportProgress(options, 'setup', 0, 3);
	if (!R.hasCompleteRoyalData(S) || !_mapRow(S, index) || !R.outpostBuilt(S, index)) {
		const missing = [...new Set([...(R.hasRoyalGData(S) ? [] : ['RoyalG']), ...(R.hasRoyalMapsData(S) ? [] : ['RoyalMaps']), ...(!_mapRow(S, index) || !R.outpostBuilt(S, index) ? [`map ${index} outpost`] : [])])];
		return { recommendation: null, alternatives: [], baseline: null, metadata: { comparison: true, candidatesEvaluated: 0, candidatesReturned: 0 }, partial: true, missing };
	}
	const scenarioBaselines = {
		current: _pointRateMetrics(S, index, opts, true),
		currentUngraded: _pointRateMetrics(S, index, opts),
		normalized: _pointRateMetrics(_pointProfessionState(S, 'no-workers'), index, opts),
		allWorkers: _pointRateMetrics(_pointProfessionState(S, 'all-workers'), index, opts),
	};
	const baseline = scenarioBaselines.current; _reportProgress(options, 'baseline', 1, 3);
	const packages = [
		{ name: 'Expanded Barracks', upgrade: 0, count: 1 },
		{ name: 'Advanced Logistics', upgrade: 1, count: 6 },
		{ name: 'Greater Education', upgrade: 2, count: 12 },
	];
	const pointCredit = Math.max(0, 12 - R.outpostPointsLeft(S, index));
	const alternatives = packages.map((spec, packageIndex) => {
		const actions = Array.from({ length: spec.count }, () => ({ kind: 'outpost-upgrade', mapIdx: index, upgrade: spec.upgrade }));
		const beforeUnits = R.outpostUnits(S, index); let state = O.cloneRoyalState(S);
		for (const action of actions) { const result = O.applyRoyalMove(state, action, { ...opts.optimizerOptions, _outpostPointCredit: pointCredit }); if (!result.ok) return _pointUnavailable(spec.name, actions, result.errors?.join('; ') || 'upgrade rejected'); state = result.state; }
		const scenarios = {
			current: _pointScenarioMetrics(scenarioBaselines.current, _pointRateMetrics(state, index, opts, true)),
			currentUngraded: _pointScenarioMetrics(scenarioBaselines.currentUngraded, _pointRateMetrics(state, index, opts)),
			normalized: _pointScenarioMetrics(scenarioBaselines.normalized, _pointRateMetrics(_pointProfessionState(state, 'no-workers'), index, opts)),
			allWorkers: _pointScenarioMetrics(scenarioBaselines.allWorkers, _pointRateMetrics(_pointProfessionState(state, 'all-workers'), index, opts)),
		};
		const result = { name: spec.name, package: spec.name, available: true, reason: null, actions, points: 12, ...scenarios.current, scenarios, levels: { before: { barracks: n(_mapRow(S, index)?.[0]), logistics: n(_mapRow(S, index)?.[1]), education: n(_mapRow(S, index)?.[2]) }, after: { barracks: n(_mapRow(state, index)?.[0]), logistics: n(_mapRow(state, index)?.[1]), education: n(_mapRow(state, index)?.[2]) } } };
		if (spec.upgrade === 0) { const afterUnits = R.outpostUnits(state, index); result.workerAdded = afterUnits.length > beforeUnits.length; result.workerAddedType = result.workerAdded ? 0 : null; result.workerNote = result.workerAdded ? 'Added Worker to the new assignable slot.' : 'No Worker added; assignable Barracks slots are capped at 6.'; }
		_reportProgress(options, 'scenario', packageIndex + 1, 3, { package: spec.name }); return result;
	});
	const available = alternatives.filter(item => item.available);
	available.sort((a, b) => b.deltaPerPoint.accountNormal - a.deltaPerPoint.accountNormal || b.deltaPerPoint.selectedNormal - a.deltaPerPoint.selectedNormal || packages.findIndex(item => item.name === a.name) - packages.findIndex(item => item.name === b.name));
	const recommendation = available[0] || null; _reportProgress(options, 'finalize', 3, 3, { evaluated: alternatives.length });
	return { recommendation, alternatives, baseline, scenarioBaselines, metadata: { comparison: true, fixedPoints: 12, assumedPoints: 12, candidatesEvaluated: alternatives.length, candidatesReturned: alternatives.length, baselineSimulations: 0, derivedInputEvaluations: opts._derivedInputEvaluations, order: packages.map(item => item.name), scenarios: ['current', 'currentUngraded', 'normalized', 'allWorkers'], approximation: 'current assignments use saved resource links and current node grades; comparison scenarios use theoretical pre-grade outpost rates and exclude node drain state' }, partial: baseline.partial, missing: [...new Set([...baseline.missing, ...baseline.invalid.map(item => item.reason)])] };
}

const KINGDOM_GOALS = ['grade-gains', 'drain-then-income', 'currency', 'max-income', 'target-upgrade', 'next-shelf', 'rank-target', 'balanced', 'no-waste'];
const KINGDOM_LIMITS = { maxActions: [0, 8, 4], beamWidth: [1, 50, 12], candidateCap: [1, 5000, 500], finalistCap: [1, 50, 20], totalCandidateCap: [1, 5000, 500] };
function _kingdomControls(options) { const controls = {}; for (const [key, limits] of Object.entries(KINGDOM_LIMITS)) controls[key] = _boundedOption(options[key], limits, true); return controls; }
function _finite(value, fallback = 0) { return Number.isFinite(Number(value)) ? Number(value) : fallback; }
function _number(value, fallback = 0) { const numeric = Number(value); return Number.isFinite(numeric) ? numeric : fallback; }
function _jsonSafe(value) {
	if (typeof value === 'number') return Number.isFinite(value) ? value : null;
	if (Array.isArray(value)) return value.map(_jsonSafe);
	if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, _jsonSafe(item)]));
	return value;
}
function _kingdomMissing(S) { const missing = []; if (!R.hasRoyalGData(S)) missing.push('RoyalG'); if (!R.hasRoyalMapsData(S)) missing.push('RoyalMaps'); return missing; }
function _currencySlot(target) { return target && typeof target === 'object' ? Math.floor(n(target.slot ?? target.currencySlot ?? target.index)) : Math.floor(n(target)); }
function _currencyTargets(options) {
	const targets = options.currencyTargets;
	if (!Array.isArray(targets)) return [];
	return targets.map((target, index) => ({ slot: _currencySlot(target), amount: Number(target?.amount ?? target?.target ?? target?.value), weight: Number(target?.weight ?? 1), index })).filter(target => Number.isInteger(target.slot) && target.slot >= 0 && Number.isFinite(target.amount) && target.amount > 0 && Number.isFinite(target.weight) && target.weight > 0);
}
function _layout(S) {
	return (S?.royalMapsData || []).map((row, mapIdx) => {
		if (!R.outpostBuilt(S, mapIdx)) return null;
		const units = R.outpostUnits(S, mapIdx).map(unit => ({ slot: n(unit.slot), type: n(unit.type) })).sort((a, b) => a.slot - b.slot);
		return { mapIdx, type: n(row?.[10]), connections: [0, 1].map(slot => _number(row?.[8 + slot], -1)), professions: units, levels: [0, 1, 2].map(index => n(row?.[index])) };
	}).filter(Boolean);
}
function _stateSignature(S, depth) {
	const maps = (S?.royalMapsData || []).map((row, mapIdx) => R.outpostBuilt(S, mapIdx) ? [mapIdx, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(index => n(row?.[index])) : null).filter(Boolean);
	const royal = [1, 2, 3, 4, 5, 6, 7, 22, 23].map(index => [index, (S?.royalGData?.[index] || []).map(n)]);
	return JSON.stringify([depth, royal, maps]);
}
function _sumCurrency(value) { return Object.values(value || {}).reduce((sum, item) => sum + _finite(item), 0); }
function _rankTarget(options) { const target = options.rankTarget; if (!target || typeof target !== 'object') return null; const mapIdx = Math.floor(n(target.mapIdx ?? target.map)); const bar = Math.floor(n(target.bar)); const rank = Math.floor(n(target.rank ?? target.targetRank)); return Number.isInteger(mapIdx) && bar >= 0 && bar < 5 && rank >= 0 ? { mapIdx, bar, rank } : null; }
function _rankEta(S, target, options) {
	if (!target) return { etaHours: null, progress: null, reason: 'rank target is invalid' };
	const row = S?.royalMapsData?.[target.mapIdx]; if (!R.outpostBuilt(S, target.mapIdx) || !row) return { etaHours: null, progress: 0, reason: 'rank target map is not built' };
	const current = R.outpostRank(S, target.mapIdx, target.bar); if (current >= target.rank) return { etaHours: 0, progress: 1, reason: null };
	const requirement = R.outpostExpFormula(target.rank - 1, target.bar); const exp = n(row[3 + target.bar]);
	const rate = R.outpostRankExpPerHour(S, target.mapIdx, target.bar, options.ext);
	const eta = current >= target.rank ? 0 : rate > 0 && Number.isFinite(requirement) ? Math.max(0, requirement - exp) / rate : null;
	return { etaHours: Number.isFinite(eta) ? eta : null, progress: current / Math.max(1, target.rank), reason: eta === null ? 'rank target has no finite rate' : null, model: 'current-rate-static' };
}
function _kingdomMetrics(S, goal, options, actionCount = 0, mode = 'full') {
	const stats = options._metricStats; const count = key => { if (stats) stats[key] = (stats[key] || 0) + 1; };
	const ext = options.ext || {}; const targets = _currencyTargets(options); const currencies = {}; let kingdom = {};
	let reset = {}; let window = {}; let rank = { etaHours: null, progress: null, reason: 'rank target is invalid' }; let armory = null;
	if (mode === 'full') {
		count('fullMetricEvaluations'); kingdom = O.kingdomMetrics(S, ext, { ...options, currencyTarget: options.currencyTarget }); count('kingdomMetrics'); reset = kingdom.resetAllocation || {}; window = O.resourceAllocationMetrics(S, { ...options, hours: options.horizonHours, ext });
		for (const target of targets) { const detail = O.currencyIncomeToReset(S, target.slot, { ...options, ext }); currencies[target.slot] = { amount: _finite(detail.collectableBeforeReset), rate: _finite(detail.nominalCurrencyPerHour), target: target.amount, weight: target.weight }; count('currencyIncomeToReset'); }
		rank = _rankEta(S, _rankTarget(options), options); count('rankEta'); armory = kingdom.armory;
	} else if (goal === 'grade-gains' || goal === 'drain-then-income' || goal === 'no-waste') {
		reset = O.resourceAllocationToReset(S, { ...options, ext }); count('resourceAllocationToReset');
	} else if (goal === 'currency') {
		const slot = _currencySlot(options.currencyTarget); const detail = O.currencyIncomeToReset(S, slot, { ...options, ext }); count('currencyIncomeToReset'); currencies[slot] = { amount: _finite(detail.collectableBeforeReset), rate: _finite(detail.nominalCurrencyPerHour) };
	} else if (goal === 'max-income') {
		window = O.resourceAllocationMetrics(S, { ...options, hours: options.horizonHours, ext }); count('resourceAllocationMetrics');
	} else if (goal === 'target-upgrade') {
		armory = O.armoryTargetEta(S, options.armoryTarget, ext, options); count('armoryTargetEta');
	} else if (goal === 'rank-target') {
		const target = _rankTarget(options); const row = S?.royalMapsData?.[target?.mapIdx]; const current = target && row ? R.outpostRank(S, target.mapIdx, target.bar) : 0; const requirement = target ? R.outpostExpFormula(target.rank - 1, target.bar) : Infinity; const rate = target && row ? R.outpostRankExpPerHour(S, target.mapIdx, target.bar, ext) : 0; const eta = current >= (target?.rank ?? Infinity) ? 0 : rate > 0 && Number.isFinite(requirement) ? Math.max(0, requirement - n(row[3 + target.bar])) / rate : null;
		rank = { etaHours: eta, progress: target ? current / Math.max(1, target.rank) : null, reason: eta === null ? 'rank target has no finite rate' : null }; count('rankRateEvaluations');
	} else if (goal === 'balanced') {
		for (const target of targets) { const detail = O.currencyIncomeToReset(S, target.slot, { ...options, ext }); currencies[target.slot] = { amount: _finite(detail.collectableBeforeReset), rate: _finite(detail.nominalCurrencyPerHour), target: target.amount, weight: target.weight }; count('currencyIncomeToReset'); }
	}
	const drainDetails = reset.details || {}; const drainHours = _finite(reset.hoursToReset); const wasteMetric = Object.values(drainDetails).reduce((sum, detail) => sum + Math.max(0, _finite(detail.rate) * drainHours - Math.max(0, _finite(detail.remaining))), 0); const requiredDrainCompleted = Object.values(drainDetails).reduce((sum, detail) => sum + Math.min(Math.max(0, _finite(detail.remaining)), Math.max(0, _finite(detail.rate) * drainHours)), 0);
	const projectedGradeGains = _finite(reset.projectedGradeGainsAtReset); const nodesEmptying = _finite(reset.nodesEmptyingByReset); const resetCurrency = _finite(reset.collectableBeforeReset); const horizonCurrency = _sumCurrency(window.income);
	const missing = [...new Set([...(kingdom.missing || []), ...(reset.missing || []), ...(window.missing || [])])];
	const partial = !!(kingdom.partial || reset.partial || window.partial || missing.length);
	return { ...kingdom, ...(mode === 'full' ? { layout: _layout(S) } : {}), projectedGradeGainsAtReset: projectedGradeGains, nodesEmptyingByReset: nodesEmptying, collectableCurrencyBeforeReset: resetCurrency, horizonCurrency, wasteMetric, requiredDrainCompleted, rankEtaHours: rank.etaHours, rankProgress: rank.progress, rankReason: rank.reason, rankEtaModel: rank.model || 'current-rate-static', currencyOutputs: currencies, armory: armory || kingdom.armory || null, armoryEtaHours: armory?.etaHours ?? kingdom.armoryEtaHours ?? null, resourcesPerHour: _finite(window.resourcesPerHour ?? kingdom.resourcesPerHour), actions: actionCount, partial, missing };
}
function _kingdomScore(metrics, goal, options) {
	const actions = -_finite(metrics.actions);
	if (goal === 'grade-gains') return [metrics.projectedGradeGainsAtReset, metrics.nodesEmptyingByReset, metrics.collectableCurrencyBeforeReset, actions];
	if (goal === 'drain-then-income') return [metrics.nodesEmptyingByReset, metrics.collectableCurrencyBeforeReset, -metrics.wasteMetric, actions];
	if (goal === 'currency') { const slot = _currencySlot(options.currencyTarget); const output = metrics.currencyOutputs[slot]?.amount ?? metrics.selectedCurrencyBeforeReset ?? 0; return [output, metrics.currencyOutputs[slot]?.rate ?? metrics.selectedCurrencyPerHour ?? 0, actions]; }
	if (goal === 'max-income') return [metrics.horizonCurrency, metrics.resourcesPerHour, actions];
	if (goal === 'target-upgrade') return [-(metrics.armoryEtaHours ?? 1e30), -_finite(metrics.armory?.remaining, 1e30), actions];
	if (goal === 'rank-target') return [-(metrics.rankEtaHours ?? 1e30), metrics.rankProgress ?? 0, actions];
	if (goal === 'balanced') { const outputs = _currencyTargets(options).map(target => { const value = metrics.currencyOutputs[target.slot]?.amount || 0; return target.weight * value / target.amount; }); return [outputs.length ? Math.min(...outputs) : -1e30, outputs.reduce((sum, value) => sum + value, 0), actions]; }
	if (goal === 'no-waste') return [metrics.requiredDrainCompleted, -metrics.wasteMetric, actions];
	return [0];
}
function _compareScore(left, right) { for (let index = 0; index < Math.max(left.length, right.length); index++) { const a = _finite(left[index], -1e30); const b = _finite(right[index], -1e30); if (a !== b) return a > b ? 1 : -1; } return 0; }
	function _legacyWarnings(before, after, actions) {
	const warnings = []; for (const action of actions) if (action.kind === 'type') { const oldRow = before?.royalMapsData?.[action.mapIdx]; const newRow = after?.royalMapsData?.[action.mapIdx]; if (n(oldRow?.[9], -1) >= 0 || n(newRow?.[9], -1) !== n(oldRow?.[9], -1)) warnings.push({ type: 'legacy-link-cleared', mapIdx: action.mapIdx, slots: [0, 1] }); }
	if (actions.some(action => action.kind === 'type')) warnings.push({ type: 'type-change', consequence: 'type changes may displace a capped type and clear both connection slots' });
	return warnings;
}
function _kingdomUnavailable(goal, missing, caps, reason) { return { available: false, goal, baseline: null, recommendation: null, alternatives: [], metadata: { bounded: true, caps, expanded: 0, evaluated: 0, deduplicated: 0, truncated: false, approximation: reason }, partial: true, missing: missing || [reason] }; }

export function planKingdomLayout(S, goal, options = {}) {
	const requestedGoal = goal; const controls = _kingdomControls(options); let opts = { ...options, ...controls }; const caps = { ...controls };
	_reportProgress(options, 'setup', 0, controls.totalCandidateCap + controls.finalistCap);
	if (!KINGDOM_GOALS.includes(goal)) return _kingdomUnavailable(requestedGoal, [`unsupported goal: ${goal}`], caps, 'unsupported goal');
	const missing = _kingdomMissing(S); if (missing.length) return _kingdomUnavailable(goal, missing, caps, 'Royal data unavailable');
	if (goal === 'next-shelf') return _kingdomUnavailable(goal, ['next-shelf purchase sequencing is not yet supported'], caps, 'next-shelf is intentionally unavailable in this bounded slice');
	if (goal === 'currency' && (options.currencyTarget === undefined || options.currencyTarget === null || !O.validCurrencySlots().includes(_currencySlot(options.currencyTarget)))) return _kingdomUnavailable(goal, ['currency requires a valid options.currencyTarget'], caps, 'currency target required');
	if (goal === 'target-upgrade' && options.armoryTarget === undefined) return _kingdomUnavailable(goal, ['target-upgrade requires options.armoryTarget'], caps, 'armory target required');
	if (goal === 'rank-target' && !_rankTarget(options)) return _kingdomUnavailable(goal, ['rank-target requires mapIdx, bar, and rank'], caps, 'rank target required');
	if (goal === 'balanced' && !_currencyTargets(options).length) return _kingdomUnavailable(goal, ['balanced requires explicit currencyTargets'], caps, 'currency targets required');
	if (['grade-gains', 'drain-then-income', 'currency', 'balanced', 'no-waste'].includes(goal) && !R.royalResetTiming(S).available) return _kingdomUnavailable(goal, R.royalResetTiming(S).missing, caps, 'reset timing unavailable');
	if (goal === 'target-upgrade') { const armory = O.armoryTargetEta(S, options.armoryTarget, options.ext, options); if (!armory.available) return _kingdomUnavailable(goal, armory.missing, caps, 'armory target unavailable'); }
	opts = _planningOptions(S, opts);
	const metricStats = { fullMetricEvaluations: 0, kingdomMetrics: 0, resourceAllocationToReset: 0, currencyIncomeToReset: 0, resourceAllocationMetrics: 0, armoryTargetEta: 0, rankEta: 0, rankRateEvaluations: 0 }; const metricCache = new Map(); const metricOptions = { ...opts, _metricStats: metricStats };
	const cachedMetrics = (state, actionCount, mode) => { const key = `${_stateSignature(state, 'metric')}:${goal}:${mode}:${JSON.stringify({ currencyTarget: opts.currencyTarget, currencyTargets: _currencyTargets(opts), armoryTarget: opts.armoryTarget, rankTarget: opts.rankTarget })}`; const cached = metricCache.get(key); if (cached) return { ...cached, actions: actionCount }; const metrics = _kingdomMetrics(state, goal, metricOptions, actionCount, mode); if (metricCache.size < controls.totalCandidateCap + controls.finalistCap + 1) metricCache.set(key, metrics); return metrics; };
	const baseline = cachedMetrics(S, 0, 'full'); const baseItem = { state: O.cloneRoyalState(_clone(S)), actions: [], metrics: baseline, score: _kingdomScore(baseline, goal, opts) }; let beam = [baseItem]; const seen = new Set([_stateSignature(baseItem.state, 0)]); let expanded = 0; let candidateApplications = 0; let candidateResultsReused = 0; let evaluated = 0; let deduplicated = 0; let truncated = false;
	_reportProgress(options, 'baseline', 0, controls.totalCandidateCap + controls.finalistCap);
	const evaluationsByDepth = [];
	for (let depth = 0; depth < controls.maxActions; depth++) {
			const remainingDepths = controls.maxActions - depth; const remainingBudget = controls.totalCandidateCap - evaluated; if (remainingBudget <= 0) { truncated = true; break; }
			const depthBudget = Math.min(controls.candidateCap, Math.max(controls.beamWidth, Math.ceil(remainingBudget / remainingDepths))); let depthEvaluated = 0; const next = [];
			const perStateBudget = Math.max(1, Math.min(depthBudget, Math.floor(remainingBudget / Math.max(1, beam.length))));
			for (const item of beam) { const applicationBudget = controls.totalCandidateCap - candidateApplications; if (applicationBudget <= 0) { truncated = true; break; } const validationStats = { applications: 0 }; const validated = O.generateRoyalCandidates(item.state, { ...opts, objective: goal, candidateCap: Math.min(perStateBudget, applicationBudget), returnResults: true, _validationStats: validationStats }); candidateApplications += validationStats.applications; expanded += validated.length; for (const { move, result } of validated) { if (depthEvaluated >= depthBudget || evaluated >= controls.totalCandidateCap) { truncated = true; break; } candidateResultsReused++; const key = _stateSignature(result.state, depth + 1); if (seen.has(key)) { deduplicated++; continue; } seen.add(key); const metrics = cachedMetrics(result.state, item.actions.length + 1, 'search'); next.push({ state: result.state, actions: item.actions.concat(move), metrics, score: _kingdomScore(metrics, goal, opts) }); evaluated++; depthEvaluated++; } if (evaluated >= controls.totalCandidateCap) break; }
		evaluationsByDepth.push(depthEvaluated); _reportProgress(options, 'search', evaluated, controls.totalCandidateCap + controls.finalistCap, { depth: depth + 1, maxDepth: controls.maxActions }); if (!next.length) break; next.sort((a, b) => _compareScore(b.score, a.score) || JSON.stringify(a.actions).localeCompare(JSON.stringify(b.actions))); if (next.length > controls.beamWidth) truncated = true; beam = next.slice(0, controls.beamWidth);
	}
	const finalists = [baseItem, ...beam].sort((a, b) => _compareScore(b.score, a.score) || JSON.stringify(a.actions).localeCompare(JSON.stringify(b.actions))).slice(0, controls.finalistCap); let finalized = 0; for (const item of finalists) { item.metrics = cachedMetrics(item.state, item.actions.length, 'full'); item.score = _kingdomScore(item.metrics, goal, opts); finalized++; _reportProgress(options, 'finalists', controls.totalCandidateCap + finalized, controls.totalCandidateCap + controls.finalistCap); } finalists.sort((a, b) => _compareScore(b.score, a.score) || JSON.stringify(a.actions).localeCompare(JSON.stringify(b.actions))); const recommendation = finalists[0];
	const recommendationOutput = recommendation ? { state: _clone(recommendation.state), actions: recommendation.actions, metrics: recommendation.metrics, warnings: _legacyWarnings(S, recommendation.state, recommendation.actions), reason: { goal, score: recommendation.score, bounded: true } } : null;
	const alternatives = finalists.slice(1).map(item => { const metrics = { ...item.metrics }; delete metrics.layout; return { actions: item.actions, metrics, warnings: _legacyWarnings(S, item.state, item.actions), reason: { goal, score: item.score, bounded: true } }; });
	const missingOutput = [...new Set([...(baseline.missing || []), ...(recommendation?.metrics?.missing || [])])];
	_reportProgress(options, 'finalize', controls.totalCandidateCap + controls.finalistCap, controls.totalCandidateCap + controls.finalistCap, { evaluated });
	return _jsonSafe({ available: true, goal, sourceState: baseItem.state, baseline, recommendation: recommendationOutput, alternatives, metadata: { bounded: true, deterministic: true, caps, expanded, candidateApplications, candidateResultsReused, evaluated, evaluationsByDepth, reachedDepth: evaluationsByDepth.length, deduplicated, finalistCount: finalists.length, truncated: truncated || evaluated >= controls.totalCandidateCap, metricEvaluations: metricStats, metricCacheEntries: metricCache.size, derivedInputEvaluations: opts._derivedInputEvaluations, approximation: 'deterministic bounded beam search; no global-optimum claim' }, partial: !!(baseline.partial || missingOutput.length), missing: missingOutput });
}