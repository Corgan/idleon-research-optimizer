// ===== ROYAL GUARDIAN OPTIMIZER (W7) =====
// Bounded, deterministic search over serializable Royal Guardian snapshots.
import { ARMORY_UPGRADES, ARMORY_ORDER, ROYAL_RESOURCES, royalMapEligible } from '../../data/w7/royal-guardian.js';
import * as R from './royal-guardian.js';

const n = value => Number(value) || 0;
const types = new Set([0, 1, 2]);
const DEFAULTS = { maxIterations: 12, candidateCap: 500, beamWidth: 4, resourceCandidateCap: 80 };
const BAR_ARMORY = [27, 29, 73, 74, 75];

function _row(S, mapIdx) { return R.outpostBuilt(S, mapIdx) ? S.royalMapsData[mapIdx] : null; }
function _royalMissing(S) { return [!R.hasRoyalGData(S) ? 'RoyalG' : null, !R.hasRoyalMapsData(S) ? 'RoyalMaps' : null].filter(Boolean); }
function _endpoint(value) { return typeof value === 'object' ? value : R.parseConnectionEndpoint(value); }
function _rawResourceEndpoint(S, mapIdx, slot) {
	const row = _row(S, mapIdx); const rawValue = row?.[8 + slot];
	if (rawValue === undefined || rawValue === null) return { endpoint: { kind: 'empty', id: -1 } };
	const numeric = typeof rawValue === 'number' ? rawValue : typeof rawValue === 'string' && rawValue.trim() !== '' ? Number(rawValue) : NaN;
	if (!Number.isFinite(numeric)) return { malformed: true, rawValue };
	return { endpoint: R.parseConnectionEndpoint(numeric) };
}
function _encodedEndpoint(endpoint) {
	if (!endpoint || endpoint.kind === 'empty') return -1;
	return endpoint.kind === 'map' ? 1000 + n(endpoint.id) : n(endpoint.id);
}
function _opts(options) { return options || {}; }
function _finiteCap(value, fallback, maximum) { return Number.isFinite(Number(value)) ? Math.max(1, Math.min(maximum, Math.floor(Number(value)))) : fallback; }
function _armoryUnlocked(S, index) { return R.armoryLevel(S, index) >= 1; }
function _explicitGate(options, key) { return options?.allowLockedSimulation === true && options?.[key] === true; }
function _world(mapIdx) { return Math.max(0, Math.floor(n(mapIdx) / 50)); }
function _allowedTypes(S, options) {
	const configured = options?.unlockedTypes ?? options?.allowedTypes;
	const derived = [0]; if (_supportLimit(S, 0) > 0) derived.push(1); if (_savageLimit(S, 0) > 0) derived.push(2);
	const selected = Array.isArray(configured) ? configured.map(n).filter(type => types.has(type)) : derived;
	return new Set((_explicitGate(options, 'unlockTypes') ? selected : selected.filter(type => derived.includes(type))));
}
function _unitTypes(S, options) {
	const count = Math.min(4, 1 + Math.min(1, R.armoryLevel(S, 27)) + Math.min(1, R.armoryLevel(S, 28)) + Math.min(1, R.armoryLevel(S, 29)));
	const configured = options?.unlockedUnitTypes;
	const derived = Array.from({ length: count }, (_, type) => type);
	return (Array.isArray(configured) ? configured.map(n).filter(type => type >= 0 && type < 4) : derived).filter(type => _explicitGate(options, 'unlockUnitTypes') || derived.includes(type));
}
function _slotCap(S, mapIdx, options) { return Math.max(0, Math.min(6, 1 + n(_row(S, mapIdx)?.[0]), _finiteCap(options?.activeSlotCap ?? options?.slotCaps?.[mapIdx], 6, 6))); }
function _unitPool(S, options) {
	if (Array.isArray(options?._unitPool)) return options._unitPool.slice(0, 4);
	if (Array.isArray(options?.unitPool)) return options.unitPool.reduce((pool, type) => { type = n(type); if (type >= 0 && type <= 3) pool[type]++; return pool; }, [0, 0, 0, 0]);
	return (S?.royalMapsData || []).reduce((pool, row, mapIdx) => { if (R.outpostBuilt(S, mapIdx)) for (const unit of R.outpostUnits(S, mapIdx)) pool[unit.type]++; return pool; }, [0, 0, 0, 0]);
}
function _assignedUnits(S) {
	const assigned = [0, 0, 0, 0];
	for (let mapIdx = 0; mapIdx < (S?.royalMapsData || []).length; mapIdx++) if (R.outpostBuilt(S, mapIdx)) for (const unit of R.outpostUnits(S, mapIdx)) assigned[unit.type]++;
	return assigned;
}
function _sameUnitCounts(a, b) { return a.every((count, type) => count === b[type]); }
function _poolAllows(S, pool) {
	const assigned = _assignedUnits(S);
	return assigned.every((count, type) => count <= n(pool[type]));
}
function _unitsWithPositions(S, mapIdx) { return Array.from({ length: 9 }, (_, slot) => R.outpostUnits(S, mapIdx).find(unit => unit.slot === slot) || { slot, type: -1 }); }
function _resourceGate(S) { return _armoryUnlocked(S, 30); }
function _mapGate(S) { return _armoryUnlocked(S, 31); }
function _outpostUpgradeGate(S) { return _armoryUnlocked(S, 32); }
function _supportLimit(S, mapIdx) { return Math.max(0, Math.round(R.armoryBonus(S, 42))); }
function _savageLimit(S, mapIdx) { return Math.max(0, Math.round(R.armoryBonus(S, 44))); }
function _barUnlocked(S, bar) { return _armoryUnlocked(S, BAR_ARMORY[bar]); }
function _maxPoints(S, mapIdx) {
	const row = _row(S, mapIdx);
	if (!row) return 0;
	return Math.max(0, R.outpostPointsLeft(S, mapIdx) + n(row[0]) * 12 + n(row[1]) * 2 + n(row[2]));
}

export function cloneRoyalState(S) {
	const copy = { ...(S || {}) };
	copy.royalGData = Array.isArray(S?.royalGData) ? S.royalGData.map(value => Array.isArray(value) ? value.slice() : value) : [];
	copy.royalMapsData = Array.isArray(S?.royalMapsData) ? S.royalMapsData.map(value => Array.isArray(value) ? value.slice() : value) : [];
	return copy;
}
export function royalSandbox(S) { return cloneRoyalState(S); }

export function encodePackedUnits(units, slotCap = 9) {
	const values = Array.isArray(units) ? units : [];
	const cap = Math.max(0, Math.min(9, n(slotCap)));
	const hasPositions = values.some(value => typeof value === 'object');
	return Number(Array.from({ length: 9 }, (_, slot) => {
		if (slot >= cap) return '0';
		const positioned = values.find(value => typeof value === 'object' && n(value.slot) === slot);
		const value = positioned ? positioned.type : (hasPositions ? -1 : values[slot]);
		const type = n(value);
		return Number.isInteger(Number(value)) && type >= 0 && type <= 3 ? String(type + 2) : '0';
	}).join(''));
}

export function validateRoyalSandbox(S, options) {
	const errors = [];
	if (!R.hasCompleteRoyalData(S)) errors.push(..._royalMissing(S).map(key => `${key} unavailable`));
	const allowedTypes = _allowedTypes(S, _opts(options));
	const opts = _opts(options); const unitTypes = new Set(_unitTypes(S, opts)); const pool = _unitPool(S, opts); const assigned = [0, 0, 0, 0];
	const typeCounts = [0, 0, 0];
	for (let mapIdx = 0; mapIdx < (S?.royalMapsData || []).length; mapIdx++) {
		const row = _row(S, mapIdx); if (!row) continue;
		const type = R.outpostType(S, mapIdx); if (!allowedTypes.has(type)) errors.push(`map ${mapIdx}: type is locked`); typeCounts[type]++;
		const typeLimit = options?.typeLimits?.[type]; if (typeLimit !== undefined && typeCounts[type] > n(typeLimit)) errors.push(`type ${type} count exceeds allowed limit`);
		if (R.outpostPointsLeft(S, mapIdx) < 0) errors.push(`map ${mapIdx}: negative points`);
		for (const unit of R.outpostUnits(S, mapIdx)) { if (unit.slot >= _slotCap(S, mapIdx, opts)) errors.push(`map ${mapIdx}: unit slot ${unit.slot} is inactive`); assigned[unit.type]++; if (!unitTypes.has(unit.type)) errors.push(`map ${mapIdx}: unit type ${unit.type} is locked`); }
		for (const connection of R.outpostConnections(S, mapIdx)) {
			if (connection.kind === 'empty') continue;
			if (connection.kind === 'map') {
				if (!_mapGate(S) && !_explicitGate(opts, 'mapConnections')) errors.push(`map ${mapIdx}: map connection tool is locked`);
				if (type !== 1) errors.push(`map ${mapIdx}: map endpoint requires a support outpost`);
				if (!R.outpostReachable(S, mapIdx, connection.id, options)) errors.push(`map ${mapIdx}: map endpoint is ineligible, unbuilt, or out of range`);
				if (connection.id === mapIdx) errors.push(`map ${mapIdx}: self-link`);
			} else if (!ROYAL_RESOURCES[connection.id]) errors.push(`map ${mapIdx}: resource endpoint is invalid`);
			else if (!_resourceGate(S) && !_explicitGate(opts, 'resourceConnections')) errors.push(`map ${mapIdx}: resource connection tool is locked`);
			else if (type === 1) errors.push(`map ${mapIdx}: resource endpoint requires a collecting outpost`);
			if (connection.kind === 'resource' && !opts._ignoreResourceGeometry && !R.resourceReachable(S, mapIdx, connection.id, options)) errors.push(`map ${mapIdx}: resource endpoint is out of range`);
			if (type === 1 && connection.kind !== 'map') errors.push(`map ${mapIdx}: support requires map endpoints`);
		}
	}
	for (let world = 0; world <= 7; world++) {
		const support = (S?.royalMapsData || []).filter((row, mapIdx) => R.outpostBuilt(S, mapIdx) && _world(mapIdx) === world && n(row[10]) === 1).length;
		const savage = (S?.royalMapsData || []).filter((row, mapIdx) => R.outpostBuilt(S, mapIdx) && _world(mapIdx) === world && n(row[10]) === 2).length;
		if (support > Math.min(_supportLimit(S, world * 50), n(opts.supportLimit ?? Infinity))) errors.push(`world ${world}: support count exceeds allowed limit`);
		if (savage > Math.min(_savageLimit(S, world * 50), n(opts.savageLimit ?? Infinity))) errors.push(`world ${world}: savage count exceeds allowed limit`);
	}
	if (!opts.allowPoolEdit) for (let type = 0; type < assigned.length; type++) if (assigned[type] > n(pool[type])) errors.push(`unit type ${type} exceeds global pool`);
	return { valid: errors.length === 0, errors };
}

export function applyRoyalMove(S, move, options) {
	const next = cloneRoyalState(S); const row = _row(next, move?.kind === 'unit-transfer' ? move.fromMap : move?.mapIdx); options = { ..._opts(options), _unitPool: options?._unitPool || _unitPool(S, _opts(options)) };
	if (!row) return { ok: false, state: next, errors: [`map ${move?.kind === 'unit-transfer' ? move.fromMap : move?.mapIdx} is not built`] };
	const errors = [];
	if (move.kind === 'type') { if (!_allowedTypes(S, _opts(options)).has(n(move.type))) errors.push('outpost type is locked'); else row[10] = n(move.type); }
	else if (move.kind === 'connection') {
		if (![0, 1].includes(n(move.slot))) errors.push('endpoint slot must be 0 or 1');
		else {
			const endpoint = _endpoint(move.endpoint);
			if (endpoint.kind === 'resource') { const reason = _resourceEndpointIssue(next, move.mapIdx, endpoint, options); if (reason) errors.push(`map ${move.mapIdx}: ${reason}`); }
			row[8 + n(move.slot)] = _encodedEndpoint(endpoint);
		}
	}
	else if (move.kind === 'unit-transfer') {
		const fromRow = _row(next, move.fromMap); const toRow = _row(next, move.toMap); const fromCap = _slotCap(next, move.fromMap, options); const toCap = _slotCap(next, move.toMap, options);
		const fromUnit = R.outpostUnits(next, move.fromMap).find(unit => unit.slot === n(move.fromSlot)); const toUnit = R.outpostUnits(next, move.toMap).find(unit => unit.slot === n(move.toSlot));
		if (!fromRow || !toRow) errors.push('unit transfer endpoint is not built');
		else if (n(move.fromSlot) >= fromCap || n(move.toSlot) >= toCap) errors.push('unit transfer slot is inactive');
		else if (!fromUnit || toUnit) errors.push('unit transfer requires an occupied source and empty target');
		else if (!_unitTypes(next, options).includes(fromUnit.type)) errors.push('unit type is locked');
		else {
			const fromUnits = R.outpostUnits(next, move.fromMap).map(unit => ({ ...unit }));
			const toUnits = R.outpostUnits(next, move.toMap).map(unit => ({ ...unit }));
			fromUnits.find(unit => unit.slot === n(move.fromSlot)).type = -1;
			toUnits.push({ slot: n(move.toSlot), type: fromUnit.type });
			fromRow[11] = encodePackedUnits(fromUnits, 9); toRow[11] = encodePackedUnits(toUnits, 9);
		}
	}
	else if (move.kind === 'units') {
		row[11] = encodePackedUnits(move.units, move.slotCap === undefined ? 9 : move.slotCap);
		if (!options.allowPoolEdit && !_sameUnitCounts(_assignedUnits(S), _assignedUnits(next))) errors.push('units move must preserve the global unit pool');
	}
	else if (move.kind === 'levels') { const levels = move.levels || []; if (!_outpostUpgradeGate(S) && !_explicitGate(options, 'outpostUpgrade')) errors.push('outpost upgrade tool is locked'); else if (n(levels[2]) !== n(row[2]) && !_armoryUnlocked(S, 57) && !_explicitGate(options, 'thirdOutpostUpgrade')) errors.push('third outpost upgrade is locked'); else { row[0] = Math.max(0, Math.floor(n(levels[0]))); row[1] = Math.max(0, Math.floor(n(levels[1]))); row[2] = Math.max(0, Math.floor(n(levels[2]))); } }
	else if (move.kind === 'resource') { if (!options?.simulationBudget && !options?.simulationResources) errors.push('resource changes require a simulation budget or resources'); else { if (!Array.isArray(next.royalGData[5])) next.royalGData[5] = []; next.royalGData[5][n(move.resourceIdx)] = Math.max(0, n(move.grade)); } }
	else errors.push(`unknown move kind ${move?.kind}`);
	if (!errors.length && (move.kind === 'unit-transfer' || (move.kind === 'units' && !options.allowPoolEdit)) && !_poolAllows(next, options._unitPool)) errors.push('unit assignments exceed global pool');
	const validation = errors.length ? { valid: false, errors } : validateRoyalSandbox(next, { ...options, _ignoreResourceGeometry: true });
	return { ok: validation.valid, state: next, errors: validation.errors, partial: move.kind === 'units' && options.allowPoolEdit === true, executable: !(move.kind === 'units' && options.allowPoolEdit === true) };
}
export function diffRoyalSandbox(before, after) {
	const moves = [];
	const max = Math.max(before?.royalMapsData?.length || 0, after?.royalMapsData?.length || 0);
	for (let i = 0; i < max; i++) if (JSON.stringify(before?.royalMapsData?.[i]) !== JSON.stringify(after?.royalMapsData?.[i])) moves.push({ kind: 'row', mapIdx: i });
	if (JSON.stringify(before?.royalGData) !== JSON.stringify(after?.royalGData)) moves.push({ kind: 'royalG' });
	return moves;
}

export function resourceIncomeByCurrency(S, ext) {
	const royalMissing = _royalMissing(S);
	if (royalMissing.length) return { income: {}, details: [], invalid: [], total: 0, available: false, partial: true, missing: royalMissing };
	const income = {}; const details = []; const invalid = [];
	for (let mapIdx = 0; mapIdx < (S?.royalMapsData || []).length; mapIdx++) {
		if (!R.outpostBuilt(S, mapIdx)) continue;
		for (let slot = 0; slot < 2; slot++) { const rawEndpoint = _rawResourceEndpoint(S, mapIdx, slot); if (rawEndpoint.malformed) { invalid.push({ mapIdx, slot, rawValue: rawEndpoint.rawValue, reason: 'resource endpoint value is malformed' }); continue; } const endpoint = rawEndpoint.endpoint; if (endpoint.kind !== 'resource') continue;
			const reason = _savedResourceEndpointIssue(S, mapIdx, endpoint); if (reason) { invalid.push({ mapIdx, slot, resourceIdx: endpoint.id, reason }); continue; }
			if (R.outpostType(S, mapIdx) === 1) continue;
			const currency = R.resourceCurrency(endpoint.id); const baseRate = R.resourceProductionWithGrade(S, mapIdx, endpoint.id, ext).value; const savage = R.outpostType(S, mapIdx) === 2; const drainRate = savage ? R.savageCollection(S) * baseRate : baseRate; const currencyRate = savage ? 0 : baseRate;
			if (currencyRate > 0) income[currency] = (income[currency] || 0) + currencyRate;
			details.push({ mapIdx, slot, resourceIdx: endpoint.id, currencySlot: currency, rate: drainRate, drainRate, currencyRate, savage });
		}
	}
	return { income, details, invalid, total: Object.values(income).reduce((sum, value) => sum + value, 0), ...( !_resourceGate(S) ? { available: false, missing: ['Armory30 resource connection tool'] } : {} ) };
}
export function validCurrencySlots() {
	return [...new Set(ROYAL_RESOURCES.map(resource => n(resource.currencySlot)).filter(slot => Number.isInteger(slot) && slot >= 0))].sort((a, b) => a - b);
}
function _resourceTargetIndex(target) {
	const value = typeof target === 'object' ? target?.resourceIdx ?? target?.index : target;
	return Number.isInteger(Number(value)) ? Number(value) : -1;
}
function _currencyTargetIndex(target) {
	const value = typeof target === 'object' ? target?.currencyTarget ?? target?.currencySlot ?? target?.index : target;
	return Number.isInteger(Number(value)) ? Number(value) : -1;
}
function _validResourceTarget(target) { const index = _resourceTargetIndex(target); return index >= 0 && index < ROYAL_RESOURCES.length ? index : -1; }
function _validCurrencyTarget(target) { const index = _currencyTargetIndex(target); return index >= 0 && ROYAL_RESOURCES.some(resource => resource.currencySlot === index) ? index : -1; }
function _resourceEndpointIssue(S, mapIdx, endpoint, ext) {
	if (_validResourceTarget(endpoint.id) < 0 || !ROYAL_RESOURCES[endpoint.id]) return 'resource endpoint is invalid';
	if (R.outpostType(S, mapIdx) === 1) return 'resource endpoint requires a collecting outpost';
	if (R.outpostWorld(mapIdx) !== R.resourceWorld(endpoint.id)) return 'resource endpoint is cross-world';
	if (!R.resourceReachable(S, mapIdx, endpoint.id, ext)) return 'resource endpoint is out of range';
	return undefined;
}
function _savedResourceEndpointIssue(S, mapIdx, endpoint) {
	if (_validResourceTarget(endpoint.id) < 0 || !ROYAL_RESOURCES[endpoint.id]) return 'resource endpoint is invalid';
	if (R.outpostType(S, mapIdx) === 1) return 'resource endpoint requires a collecting outpost';
}
export function normalizeInvalidResourceConnections(S, ext) {
	const state = cloneRoyalState(S); const moves = []; const invalid = [];
	for (let mapIdx = 0; mapIdx < (state.royalMapsData || []).length; mapIdx++) {
		if (!R.outpostBuilt(state, mapIdx)) continue;
		for (let slot = 0; slot < 2; slot++) {
			const rawEndpoint = _rawResourceEndpoint(state, mapIdx, slot); if (rawEndpoint.malformed) { invalid.push({ mapIdx, slot, rawValue: rawEndpoint.rawValue, reason: 'resource endpoint value is malformed' }); state.royalMapsData[mapIdx][8 + slot] = -1; moves.push({ kind: 'connection', mapIdx, slot, endpoint: { kind: 'empty', id: -1 }, reason: 'Remove malformed saved connection' }); continue; } const endpoint = rawEndpoint.endpoint;
			if (endpoint.kind === 'map' && R.outpostType(state, mapIdx) !== 1) { const reason = 'map endpoint requires a support outpost'; invalid.push({ mapIdx, slot, targetMapIdx: endpoint.id, reason }); state.royalMapsData[mapIdx][8 + slot] = -1; moves.push({ kind: 'connection', mapIdx, slot, endpoint: { kind: 'empty', id: -1 }, reason: 'Remove invalid saved connection' }); continue; }
			if (endpoint.kind !== 'resource') continue;
			const reason = _savedResourceEndpointIssue(state, mapIdx, endpoint); if (!reason) continue;
			invalid.push({ mapIdx, slot, resourceIdx: endpoint.id, reason });
			state.royalMapsData[mapIdx][8 + slot] = -1;
			moves.push({ kind: 'connection', mapIdx, slot, endpoint: { kind: 'empty', id: -1 }, reason: 'Remove invalid saved connection' });
		}
	}
	return { state, moves, invalid };
}
function _resourceCandidateIndices(options, mapIdx) {
	const cap = Math.min(ROYAL_RESOURCES.length, _finiteCap(options?.resourceCandidateCap, DEFAULTS.resourceCandidateCap, 80));
	const required = new Set(Array.from({ length: cap }, (_, index) => index));
	const resourceTarget = _validResourceTarget(options?.resourceTarget);
	if (resourceTarget >= 0) required.add(resourceTarget);
	const currencyTarget = _validCurrencyTarget(options?.currencyTarget);
	if (currencyTarget >= 0) for (let index = 0; index < ROYAL_RESOURCES.length; index++) if (ROYAL_RESOURCES[index].currencySlot === currencyTarget) required.add(index);
	return [...required].filter(index => index < 80 && R.resourceWorld(index) === R.outpostWorld(mapIdx)).sort((a, b) => a - b);
}

export function resourceAllocationMetrics(S, options) {
	options = _opts(options); const hours = Math.max(0, n(options.hours ?? 24)); const ext = options.ext || {};
	const royalMissing = _royalMissing(S);
	if (royalMissing.length) return { available: false, hours, projection: 'Fixed current node state; no refill or grade rollover', details: [], invalid: [], resourcesPerHour: 0, collectedWithinWindow: 0, nodesEmptied: 0, nodesEmptiedWithinWindow: 0, alreadyEmpty: 0, slowestDrainHours: 0, drainSumHours: 0, incomeByCurrency: {}, drainScope: 'unavailable', resourceTarget: undefined, partial: true, missing: royalMissing };
	const streams = Array.from({ length: ROYAL_RESOURCES.length }, () => []);
	const invalid = []; const missing = new Set();
	for (let mapIdx = 0; mapIdx < (S?.royalMapsData || []).length; mapIdx++) {
		if (!R.outpostBuilt(S, mapIdx)) continue;
		for (let slot = 0; slot < 2; slot++) { const rawEndpoint = _rawResourceEndpoint(S, mapIdx, slot); if (rawEndpoint.malformed) { invalid.push({ mapIdx, slot, rawValue: rawEndpoint.rawValue, reason: 'resource endpoint value is malformed' }); continue; } const endpoint = rawEndpoint.endpoint; if (endpoint.kind !== 'resource') continue;
			const reason = _savedResourceEndpointIssue(S, mapIdx, endpoint); if (reason) { invalid.push({ mapIdx, slot, resourceIdx: endpoint.id, reason }); continue; }
			const production = R.resourceProductionWithGrade(S, mapIdx, endpoint.id, ext); const baseRate = production.value; const savage = R.outpostType(S, mapIdx) === 2; const drainRate = savage ? R.savageCollection(S) * baseRate : baseRate;
			for (const source of production.missing || []) missing.add(source);
			streams[endpoint.id].push({ mapIdx, slot, rate: drainRate, drainRate, currencyRate: savage ? 0 : baseRate, savage, partial: !!production.partial, missing: production.missing || [] });
		}
	}
	const target = _validResourceTarget(options.resourceTarget); const details = streams.map((resourceStreams, resourceIdx) => {
		const rate = resourceStreams.reduce((sum, stream) => sum + n(stream.rate), 0);
		const window = R.resourceWindowMetrics(S, resourceIdx, rate, hours); const alreadyEmpty = window.alreadyEmpty;
		const currencyRate = resourceStreams.reduce((sum, stream) => sum + n(stream.currencyRate), 0);
		return { resourceIdx, rate, drainRate: rate, currencyRate, remaining: window.remaining, drainHours: window.drainHours, collectedWithinWindow: window.collected, emptied: !alreadyEmpty && window.emptied, alreadyEmpty, drained: window.drained, currencySlot: R.resourceCurrency(resourceIdx), streams: resourceStreams, partial: resourceStreams.some(stream => stream.partial), missing: [...new Set(resourceStreams.flatMap(stream => stream.missing || []))] };
	});
	const scoped = target >= 0 ? details.filter(detail => detail.resourceIdx === target) : details.filter(detail => detail.remaining > 0 && detail.rate > 0);
	const zeroRateTarget = target >= 0 && details[target].remaining > 0 && details[target].rate <= 0;
	const drainHours = scoped.map(detail => detail.drainHours);
	const slowestDrainHours = zeroRateTarget ? Infinity : drainHours.reduce((slowest, value) => Math.max(slowest, value), 0);
	const drainSumHours = zeroRateTarget ? Infinity : drainHours.reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);
	const incomeByCurrency = {}; for (const detail of details) if (detail.currencySlot >= 0 && detail.currencyRate > 0) incomeByCurrency[detail.currencySlot] = (incomeByCurrency[detail.currencySlot] || 0) + detail.currencyRate;
	return {
		available: R.hasCompleteRoyalData(S), hours, projection: 'Fixed current node state; no refill or grade rollover', details, invalid,
		resourcesPerHour: details.reduce((sum, detail) => sum + detail.currencyRate, 0),
		collectedWithinWindow: details.reduce((sum, detail) => sum + detail.collectedWithinWindow, 0),
		nodesEmptied: details.reduce((sum, detail) => sum + (detail.emptied ? 1 : 0), 0),
		nodesEmptiedWithinWindow: details.reduce((sum, detail) => sum + (detail.emptied ? 1 : 0), 0),
		alreadyEmpty: details.reduce((sum, detail) => sum + (detail.alreadyEmpty ? 1 : 0), 0),
		slowestDrainHours, drainSumHours, incomeByCurrency,
		drainScope: target >= 0 ? `resource ${target}` : 'nodes with remaining > 0 and rate > 0; zero-rate nodes are excluded unless selected',
		resourceTarget: target >= 0 ? target : undefined,
		partial: !R.hasCompleteRoyalData(S) || invalid.length > 0 || missing.size > 0,
		missing: Array.from(missing),
	};
}
function _resetUnavailable(reset, missing) {
	return { available: false, resetProjectionAvailable: false, partial: true, reset, resetLabel: 'before reset', hoursToReset: null, collectableBeforeReset: null, nodesEmptyingByReset: null, projectedRefillsAtReset: null, projectedGradeGainsAtReset: null, details: [], invalid: [], missing: missing || reset.missing, projection: 'Reset-boundary projection unavailable; no zero-hour exact result' };
}
export function resourceAllocationToReset(S, options) {
	options = _opts(options); const reset = R.royalResetTiming(S);
	const royalMissing = _royalMissing(S);
	if (royalMissing.length) return _resetUnavailable(reset, royalMissing);
	const projectionAvailable = reset.available;
	const allocation = resourceAllocationMetrics(S, { ...options, hours: projectionAvailable ? reset.hoursRemaining : 0 });
	if (!projectionAvailable) {
		const details = allocation.details.map(detail => ({ ...detail, collectableBeforeReset: null, emptiesByReset: null, refillsAtReset: false, refillAtReset: false, refillBoundary: null, gradeGainAtReset: null, projectedGradeAtReset: null, resetProjectionAvailable: false }));
		return { ...allocation, available: true, resetProjectionAvailable: false, partial: true, reset, resetLabel: 'before reset', hoursToReset: null, collectableBeforeReset: null, nodesEmptyingByReset: null, projectedRefillsAtReset: null, projectedGradeGainsAtReset: null, details, missing: [...new Set([...(allocation.missing || []), ...reset.missing])], projection: 'Reset-boundary projection unavailable; current node state preserved without reset claims' };
	}
	const armory70 = R.armoryBonus(S, 70) >= 1; const armory0 = R.armoryBonus(S, 0) >= 1;
	const details = allocation.details.map(detail => {
		const initiallyDrained = detail.drained;
		const initiallyEmpty = detail.alreadyEmpty;
		const emptiesByReset = !initiallyEmpty && detail.emptied;
		const refillsAtReset = (initiallyDrained || emptiesByReset) && armory70;
		const gradeGainAtReset = refillsAtReset && armory0 ? 1 : 0;
		return { ...detail, collectableBeforeReset: detail.collectedWithinWindow, emptiesByReset, initiallyDrained, initiallyEmpty, refillsAtReset, refillAtReset: refillsAtReset, refillRequiresCollection: !initiallyDrained && emptiesByReset && armory70, refillBoundary: initiallyDrained ? 'saved-drained' : emptiesByReset ? 'collect-before-reset' : 'none', gradeGainAtReset, projectedGradeAtReset: R.resourceGrade(S, detail.resourceIdx) + gradeGainAtReset, resetProjectionAvailable: true };
	});
	return { ...allocation, available: true, resetProjectionAvailable: true, reset, resetLabel: 'before reset', hoursToReset: reset.hoursRemaining, collectableBeforeReset: allocation.collectedWithinWindow, nodesEmptyingByReset: allocation.nodesEmptiedWithinWindow, projectedRefillsAtReset: details.filter(detail => detail.refillsAtReset).length, projectedGradeGainsAtReset: details.reduce((sum, detail) => sum + detail.gradeGainAtReset, 0), details, projection: 'Projection through daily reset; projected-to-empty nodes refill only if collection commits the drained sentinel before reset; post-reset collection is not simulated' };
}
function _currencyBreakdownUnavailable(currencySlot, hours, reason, available = false) {
	return { currencySlot, valid: false, available, balance: 0, hours, projection: 'Fixed current node state; no refill or grade rollover', nominalCurrencyPerHour: 0, collectableWithinWindow: 0, activeStreams: 0, activeNodes: 0, nodes: [], invalid: [], partial: true, missing: [reason] };
}
export function currencyIncomeBreakdown(S, currencySlot, options) {
	options = _opts(options); const hours = Math.max(0, n(options.hours ?? 24)); const ext = options.ext || {};
	if (!Number.isInteger(currencySlot) || !validCurrencySlots().includes(currencySlot)) return _currencyBreakdownUnavailable(currencySlot, hours, 'currency slot is invalid');
	const balance = n(S?.royalGData?.[1]?.[currencySlot]);
	const royalMissing = _royalMissing(S);
	if (royalMissing.length) return { ..._currencyBreakdownUnavailable(currencySlot, hours, royalMissing[0]), balance, missing: royalMissing };
	const allocation = resourceAllocationMetrics(S, { hours, ext }); const nodes = [];
	for (let resourceIdx = 0; resourceIdx < ROYAL_RESOURCES.length; resourceIdx++) {
		const resource = ROYAL_RESOURCES[resourceIdx]; if (resource.currencySlot !== currencySlot) continue;
		const detail = allocation.details[resourceIdx]; const grade = R.resourceGrade(S, resourceIdx); const gradeMultiplier = 1 + grade * 0.25;
		const streams = detail.streams.map(stream => ({ mapIdx: stream.mapIdx, slot: stream.slot, outpostType: R.outpostType(S, stream.mapIdx), savage: !!stream.savage, drainRate: stream.drainRate, currencyRate: stream.currencyRate, persisted: true, currentlyReachable: R.resourceReachable(S, stream.mapIdx, resourceIdx, ext) }));
		const normalRate = streams.reduce((sum, stream) => sum + (stream.savage ? 0 : n(stream.drainRate)), 0);
		const collectableWithinWindow = detail.remaining > 0 && detail.rate > 0 ? Math.min(detail.currencyRate * hours, detail.remaining * normalRate / detail.rate) : 0;
		const connectableOutposts = R.reachableOutpostsForResource(S, resourceIdx, ext).filter(outpost => outpost.reachable).map(outpost => {
			const type = R.outpostType(S, outpost.mapIdx); const rate = R.outpostResourceRateBreakdown(S, outpost.mapIdx, ext); const potentialCurrencyRate = type === 2 ? 0 : rate.value * gradeMultiplier;
			return { ...outpost, type, baseRate: rate.value, gradeMultiplier, potentialCurrencyRate, potentialDrainRate: type === 2 ? R.savageCollection(S) * rate.value * gradeMultiplier : potentialCurrencyRate, factorBreakdown: rate.factors, factors: rate.factors, partial: rate.partial, missing: rate.missing, drainOnly: type === 2 };
		});
		const currentBreakdowns = streams.map(stream => R.outpostResourceRateBreakdown(S, stream.mapIdx, ext));
		const missing = [...new Set(currentBreakdowns.flatMap(rate => rate.missing || []).concat(connectableOutposts.flatMap(outpost => outpost.missing || [])))];
		const partial = currentBreakdowns.some(rate => rate.partial) || connectableOutposts.some(outpost => outpost.partial);
		const state = detail.drained ? 'drained' : detail.remaining === 0 ? 'empty' : detail.rate > 0 ? 'active' : 'inactive';
		nodes.push({ resourceIdx, currencySlot, tier: Math.floor(resourceIdx / 20), grade, gradeMultiplier, capacity: R.resourceCapacity(S, resourceIdx), collected: R.resourceCollected(S, resourceIdx), remaining: detail.remaining, state, drained: detail.drained, alreadyEmpty: detail.alreadyEmpty, drainRate: detail.rate, nominalCurrencyPerHour: detail.currencyRate, currencyRate: detail.currencyRate, collectableWithinWindow, streams, connectableOutposts, partial, missing });
	}
	return { currencySlot, valid: true, available: true, balance, hours, projection: 'Fixed current node state; no refill or grade rollover', nominalCurrencyPerHour: nodes.reduce((sum, node) => sum + node.nominalCurrencyPerHour, 0), collectableWithinWindow: nodes.reduce((sum, node) => sum + node.collectableWithinWindow, 0), activeStreams: nodes.reduce((sum, node) => sum + node.streams.filter(stream => stream.currencyRate > 0).length, 0), activeNodes: nodes.filter(node => node.nominalCurrencyPerHour > 0).length, nodes, invalid: allocation.invalid, partial: allocation.invalid.length > 0 || nodes.some(node => node.partial), missing: [...new Set(nodes.flatMap(node => node.missing || []))] };
}
export function currencyIncomeToReset(S, currencySlot, options) {
	options = _opts(options); const reset = R.royalResetTiming(S); const royalMissing = _royalMissing(S);
	if (royalMissing.length) return { ..._currencyBreakdownUnavailable(currencySlot, null, royalMissing[0]), resetProjectionAvailable: false, reset, resetLabel: 'before reset', collectableBeforeReset: null, projectedRefillsAtReset: null, projectedGradeGainsAtReset: null };
	const projectionAvailable = reset.available;
	const breakdown = currencyIncomeBreakdown(S, currencySlot, { ...options, hours: projectionAvailable ? reset.hoursRemaining : 0 });
	if (!breakdown.valid) return { ...breakdown, resetProjectionAvailable: false, reset, resetLabel: 'before reset', hoursToReset: projectionAvailable ? reset.hoursRemaining : null, collectableBeforeReset: null, projectedRefillsAtReset: null, projectedGradeGainsAtReset: null };
	const allocation = resourceAllocationToReset(S, options); const resetDetails = new Map(allocation.details.filter(detail => detail.currencySlot === currencySlot).map(detail => [detail.resourceIdx, detail]));
	const nodes = breakdown.nodes.map(node => { const detail = resetDetails.get(node.resourceIdx); return projectionAvailable ? { ...node, collectableBeforeReset: node.collectableWithinWindow, emptiesByReset: detail?.emptiesByReset || false, initiallyDrained: detail?.initiallyDrained || false, initiallyEmpty: detail?.initiallyEmpty || false, refillsAtReset: detail?.refillsAtReset || false, refillAtReset: detail?.refillAtReset || false, refillRequiresCollection: detail?.refillRequiresCollection || false, refillBoundary: detail?.refillBoundary || 'none', gradeGainAtReset: detail?.gradeGainAtReset || 0, projectedGradeAtReset: detail?.projectedGradeAtReset ?? node.grade, resetProjectionAvailable: true } : { ...node, collectableBeforeReset: null, emptiesByReset: null, initiallyDrained: node.drained, initiallyEmpty: node.alreadyEmpty, refillsAtReset: false, refillAtReset: false, refillRequiresCollection: false, refillBoundary: null, gradeGainAtReset: null, projectedGradeAtReset: null, resetProjectionAvailable: false }; });
	return projectionAvailable ? { ...breakdown, resetProjectionAvailable: true, reset, resetLabel: 'before reset', hoursToReset: reset.hoursRemaining, collectableBeforeReset: nodes.reduce((sum, node) => sum + node.collectableBeforeReset, 0), nodes, projectedRefillsAtReset: nodes.filter(node => node.refillsAtReset).length, projectedGradeGainsAtReset: nodes.reduce((sum, node) => sum + node.gradeGainAtReset, 0), projection: 'Projection through daily reset; projected-to-empty nodes refill only if collection commits the drained sentinel before reset; post-reset collection is not simulated' } : { ...breakdown, resetProjectionAvailable: false, partial: true, reset, resetLabel: 'before reset', hoursToReset: null, collectableBeforeReset: null, nodes, projectedRefillsAtReset: null, projectedGradeGainsAtReset: null, missing: [...new Set([...(breakdown.missing || []), ...reset.missing])], projection: 'Reset-boundary projection unavailable; current node state preserved without reset claims' };
}
export function armoryTargetEta(S, target, ext, options) {
	const targetIndex = n(target?.index ?? target); const orderIndex = ARMORY_ORDER.indexOf(targetIndex); const cost = R.armoryUpgradeCost(S, orderIndex >= 0 ? orderIndex : targetIndex, ext);
	const currencySlot = cost.currencySlot ?? ARMORY_UPGRADES[targetIndex]?.currencySlot ?? -1; const balance = n(S?.royalGData?.[1]?.[currencySlot]);
	const resources = resourceIncomeByCurrency(S, options?.resourceExt ?? ext); const income = resources.income[currencySlot] || 0; const remaining = Math.max(0, cost.value - balance);
	const missing = [...(resources.missing || [])]; if (currencySlot < 0) missing.push('armory currency slot');
	return { index: targetIndex, currencySlot, cost: cost.value, balance, income, remaining, etaHours: remaining === 0 ? 0 : income > 0 ? remaining / income : Infinity, impossible: remaining > 0 && income <= 0, available: missing.length === 0, missing };
}
export function rankObjective(S, target, ext) {
	const normalized = target?.purification ? { ...target, bar: 4 } : target;
	const targets = normalized?.aggregate ? [0, 1, 2, 3, 4].flatMap(bar => (S?.royalMapsData || []).map((_, mapIdx) => ({ mapIdx, bar })).filter(value => R.outpostBuilt(S, value.mapIdx))) : [{ mapIdx: n(normalized?.mapIdx ?? normalized?.map), bar: n(normalized?.bar ?? 0) }];
	const details = targets.filter(value => _row(S, value.mapIdx)).map(value => ({ ...value, unlocked: _barUnlocked(S, value.bar), rate: _barUnlocked(S, value.bar) ? R.outpostRankExpPerHour(S, value.mapIdx, value.bar, ext) : 0, reason: _barUnlocked(S, value.bar) ? undefined : `bar ${value.bar} requires Armory${BAR_ARMORY[value.bar]}` }));
	const selectedMissing = !normalized?.aggregate && !details.length;
	const unavailable = selectedMissing || (!normalized?.aggregate && details[0] && !details[0].unlocked);
	const reason = selectedMissing ? `map ${targets[0].mapIdx} is not built` : unavailable ? details[0].reason : undefined;
	return { value: details.reduce((sum, value) => sum + value.rate, 0), details, aggregate: !!normalized?.aggregate, bar: normalized?.aggregate ? undefined : targets[0]?.bar, available: !unavailable, unavailable, reason };
}
export function kingdomMetrics(S, ext, options) {
	options = _opts(options); const resources = resourceIncomeByCurrency(S, ext); const allocation = resourceAllocationMetrics(S, { ...options, ext }); const ranks = rankObjective(S, options.rankTarget || { aggregate: true }, ext);
	const range = (S?.royalMapsData || []).reduce((sum, row, mapIdx) => sum + (R.outpostBuilt(S, mapIdx) ? R.outpostRange(S, mapIdx, ext) : 0), 0);
	const armory = options.armoryTarget === undefined ? null : armoryTargetEta(S, options.armoryTarget, ext, options);
	const resourceTarget = _validResourceTarget(options.resourceTarget); const currencyTarget = _validCurrencyTarget(options.currencyTarget);
	const resetAllocation = resourceAllocationToReset(S, options); const resetCurrency = currencyTarget >= 0 ? currencyIncomeToReset(S, currencyTarget, options) : null;
	return { available: R.hasCompleteRoyalData(S), resourcesPerHour: resources.total, resourceIncome: resources.income, rankExpPerHour: ranks.value, range, armoryEtaHours: armory?.etaHours ?? null, armory, resources, ranks, resourceAllocation: allocation, collectedWithinWindow: allocation.collectedWithinWindow, nodesEmptiedWithinWindow: allocation.nodesEmptiedWithinWindow, slowestDrainHours: allocation.slowestDrainHours, selectedResourceDrainHours: resourceTarget >= 0 ? allocation.details[resourceTarget]?.drainHours ?? null : null, selectedCurrencyPerHour: currencyTarget >= 0 ? allocation.incomeByCurrency[currencyTarget] || 0 : null, resetAllocation, resetCurrency, reset: resetAllocation.reset, collectableBeforeReset: resetAllocation.collectableBeforeReset, nodesEmptyingByReset: resetAllocation.nodesEmptyingByReset, selectedCurrencyBeforeReset: resetCurrency?.collectableBeforeReset ?? null };
}

function _candidateMoves(S, options) {
	const buckets = []; const maps = (S?.royalMapsData || []).map((row, mapIdx) => R.outpostBuilt(S, mapIdx) ? mapIdx : -1).filter(mapIdx => mapIdx >= 0);
	for (const mapIdx of maps) {
		const moves = [];
		const row = _row(S, mapIdx); const levels = [n(row[0]), n(row[1]), n(row[2])];
		if (_outpostUpgradeGate(S) || _explicitGate(options, 'outpostUpgrade')) for (let level = 0; level < 3; level++) for (const delta of [-1, 1]) { const next = levels.slice(); next[level] += delta; if (next[level] >= 0 && (level !== 2 || _armoryUnlocked(S, 57) || _explicitGate(options, 'thirdOutpostUpgrade'))) moves.push({ kind: 'levels', mapIdx, levels: next }); }
		for (const type of _allowedTypes(S, options)) if (type !== R.outpostType(S, mapIdx)) moves.push({ kind: 'type', mapIdx, type });
		for (let slot = 0; slot < 2; slot++) {
			if ([0, 2].includes(R.outpostType(S, mapIdx)) && _resourceGate(S)) for (const resourceIdx of _resourceCandidateIndices(options, mapIdx)) moves.push({ kind: 'connection', mapIdx, slot, endpoint: { kind: 'resource', id: resourceIdx } });
			if (R.outpostType(S, mapIdx) === 1 && _mapGate(S)) for (const targetMap of maps) if (targetMap !== mapIdx && R.outpostWorld(targetMap) === R.outpostWorld(mapIdx) && royalMapEligible(targetMap)) moves.push({ kind: 'connection', mapIdx, slot, endpoint: { kind: 'map', id: targetMap } });
			moves.push({ kind: 'connection', mapIdx, slot, endpoint: { kind: 'empty', id: -1 } });
		}
		const current = _unitsWithPositions(S, mapIdx);
		for (const targetMap of maps) for (const target of _unitsWithPositions(S, targetMap).filter(unit => unit.slot < _slotCap(S, targetMap, options) && unit.type < 0)) for (const source of current.filter(unit => unit.slot < _slotCap(S, mapIdx, options) && unit.type >= 0)) if (targetMap !== mapIdx || target.slot !== source.slot) moves.push({ kind: 'unit-transfer', fromMap: mapIdx, fromSlot: source.slot, toMap: targetMap, toSlot: target.slot });
		buckets.push(moves);
	}
	const moves = []; let added = true; for (let index = 0; added; index++) { added = false; for (const bucket of buckets) if (bucket[index]) { moves.push(bucket[index]); added = true; } }
	return moves.slice(0, _finiteCap(options?.candidateCap, DEFAULTS.candidateCap, 5000));
}
export function generateRoyalCandidates(S, options) { const opts = _opts(options); return _candidateMoves(S, opts).slice(0, _finiteCap(opts.candidateCap, DEFAULTS.candidateCap, 5000)); }

function _dominates(a, b) {
	const aEta = a.metrics.armoryEtaHours ?? Infinity; const bEta = b.metrics.armoryEtaHours ?? Infinity;
	return a.metrics.resourcesPerHour >= b.metrics.resourcesPerHour && a.metrics.rankExpPerHour >= b.metrics.rankExpPerHour && a.metrics.range >= b.metrics.range && aEta <= bEta && (a.metrics.resourcesPerHour > b.metrics.resourcesPerHour || a.metrics.rankExpPerHour > b.metrics.rankExpPerHour || a.metrics.range > b.metrics.range || aEta < bEta);
}
function _archiveAdd(archive, item, objective) {
	if (archive.some(existing => _dominates(existing, item) && _compareObjectives(existing.metrics, item.metrics, objective) >= 0)) return archive;
	const next = archive.filter(existing => !(_dominates(item, existing) && _compareObjectives(item.metrics, existing.metrics, objective) >= 0)); next.push(item);
	return next;
}

function _compareValue(a, b) {
	if (a === b) return 0;
	if (a === Infinity) return 1; if (b === Infinity) return -1;
	if (a === -Infinity) return -1; if (b === -Infinity) return 1;
	return a > b ? 1 : -1;
}
function _objectiveVector(metrics, objective) {
	if (objective === 'rank-purification') return [metrics.rankExpPerHour];
	if (objective === 'armory-target') return [metrics.armoryEtaHours === 0 ? Infinity : -(metrics.armoryEtaHours === Infinity ? Infinity : metrics.armoryEtaHours)];
	if (objective === 'balanced') return [metrics.resourcesPerHour + metrics.rankExpPerHour + metrics.range];
	if (objective === 'collect-window') return [metrics.collectedWithinWindow];
	if (objective === 'empty-most-window') return [metrics.nodesEmptiedWithinWindow, metrics.collectedWithinWindow, -metrics.slowestDrainHours, -metrics.resourceAllocation.drainSumHours];
	if (objective === 'collect-before-reset') return [metrics.collectableBeforeReset];
	if (objective === 'empty-by-reset') return [metrics.nodesEmptyingByReset, metrics.collectableBeforeReset, -metrics.resetAllocation.slowestDrainHours, -metrics.resetAllocation.drainSumHours];
	if (objective === 'resource-drain') return [-(metrics.selectedResourceDrainHours ?? Infinity), metrics.resourceAllocation.details[metrics.resourceAllocation.resourceTarget]?.rate || 0];
	if (objective === 'currency-income') return [metrics.selectedCurrencyPerHour];
	if (objective === 'currency-before-reset') return [metrics.selectedCurrencyBeforeReset ?? -Infinity];
	return [metrics.resourcesPerHour];
}
function _compareObjectives(a, b, objective) {
	const left = _objectiveVector(a, objective); const right = _objectiveVector(b, objective);
	for (let index = 0; index < left.length; index++) { const comparison = _compareValue(left[index], right[index]); if (comparison) return comparison; }
	return 0;
}
function _unavailableObjective(objective, message) { return { objective, available: false, candidates: [], best: null, error: message, metadata: { bounded: true, iterations: 0, candidatesEvaluated: 0, truncated: false, error: message } }; }

export function optimizeRoyalGuardian(S, objective = 'resources', options) {
	const requestedObjective = objective; const normalizedObjective = objective === 'resource-income' ? 'resources' : objective;
	options = _opts(options); const maxIterations = _finiteCap(options.maxIterations, DEFAULTS.maxIterations, 50); const candidateCap = _finiteCap(options.candidateCap, DEFAULTS.candidateCap, 5000); const beamWidth = _finiteCap(options.beamWidth, DEFAULTS.beamWidth, 50); const resourceCandidateCap = _finiteCap(options.resourceCandidateCap, DEFAULTS.resourceCandidateCap, 80); const unitPool = _unitPool(S, options); options = { ...options, resourceCandidateCap, _unitPool: unitPool }; const ext = options.ext || {};
	const royalMissing = _royalMissing(S);
	if (royalMissing.length) return { objective, available: false, candidates: [], best: null, metadata: { bounded: true, iterations: 0, candidatesEvaluated: 0, truncated: false, approximation: 'Royal data unavailable', missing: royalMissing } };
	if (normalizedObjective === 'armory-target' && options.armoryTarget === undefined) return _unavailableObjective(requestedObjective, 'armory-target requires options.armoryTarget');
	if (normalizedObjective === 'resource-drain' && _validResourceTarget(options.resourceTarget) < 0) return _unavailableObjective(requestedObjective, 'resource-drain requires a valid options.resourceTarget');
	if (normalizedObjective === 'currency-income' && _validCurrencyTarget(options.currencyTarget) < 0) return _unavailableObjective(requestedObjective, 'currency-income requires a valid options.currencyTarget');
	if (normalizedObjective === 'currency-before-reset' && _validCurrencyTarget(options.currencyTarget) < 0) return _unavailableObjective(requestedObjective, 'currency-before-reset requires a valid options.currencyTarget');
	const initialMetrics = kingdomMetrics(S, ext, options);
	if (['collect-before-reset', 'empty-by-reset', 'currency-before-reset'].includes(normalizedObjective) && !initialMetrics.resetAllocation.resetProjectionAvailable) return { ..._unavailableObjective(requestedObjective, 'reset timing unavailable'), metadata: { ..._unavailableObjective(requestedObjective, 'reset timing unavailable').metadata, missing: initialMetrics.resetAllocation.missing } };
	if (normalizedObjective === 'armory-target' && !initialMetrics.armory.available) return { ..._unavailableObjective(requestedObjective, 'armory target is unavailable'), metadata: { ..._unavailableObjective(requestedObjective, 'armory target is unavailable').metadata, missing: initialMetrics.armory.missing } };
	if (normalizedObjective === 'rank-purification' && !initialMetrics.ranks.available) return _unavailableObjective(requestedObjective, initialMetrics.ranks.reason || 'rank target is unavailable');
	const normalized = normalizeInvalidResourceConnections(S, ext); const repairMoves = normalized.moves;
	let beam = [{ state: normalized.state, moves: repairMoves.slice(), metrics: kingdomMetrics(normalized.state, ext, options) }]; let archive = [beam[0]]; let evaluated = 0; let truncated = false; let iterations = 0;
	for (let iteration = 0; iteration < maxIterations; iteration++) {
		iterations++;
		const pool = []; for (const item of beam) for (const move of _candidateMoves(item.state, options)) { if (evaluated >= candidateCap) { truncated = true; break; } const result = applyRoyalMove(item.state, move, options); if (!result.ok) continue; const metrics = kingdomMetrics(result.state, ext, options); pool.push({ state: result.state, moves: item.moves.concat(move), metrics }); evaluated++; }
		if (!pool.length) break; for (const item of pool) archive = _archiveAdd(archive, item, normalizedObjective); pool.sort((a, b) => _compareObjectives(b.metrics, a.metrics, normalizedObjective) || JSON.stringify(a.moves).localeCompare(JSON.stringify(b.moves))); beam = pool.slice(0, beamWidth); if (pool.length > beamWidth) truncated = true;
		if (evaluated >= candidateCap) break;
	}
	const all = archive.map(item => ({ ...item, exactMetrics: item.metrics }));
	let candidates = all.sort((a, b) => _compareObjectives(b.metrics, a.metrics, normalizedObjective) || JSON.stringify(a.moves).localeCompare(JSON.stringify(b.moves))).slice(0, 10);
	return { objective: requestedObjective, available: true, candidates, best: candidates[0] || null, metadata: { bounded: true, iterations, candidatesEvaluated: evaluated, truncated: truncated || evaluated >= candidateCap, caps: { maxIterations, candidateCap, beamWidth, resourceCandidateCap }, archiveSize: archive.length, archivePruned: false, archiveApproximation: 'All nondominated evaluated states retained; final display is limited to 10', approximation: 'Deterministic bounded coordinate/beam search; not globally optimal' } };
}