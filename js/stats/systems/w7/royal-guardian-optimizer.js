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
function _resourceCapacityAtGrade(resourceIdx, grade) { const resource = ROYAL_RESOURCES[resourceIdx]; return 5 * (resource?.baseCapacity || 0) * 1.5 ** n(grade) * 5 ** Math.floor(resourceIdx / 20); }
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

export function decodePackedUnitDigits(packed) {
	return String(Math.max(0, Math.floor(n(packed)))).padStart(9, '0').slice(-9).split('').map(Number);
}

export function encodePackedUnitDigits(digits) {
	const values = Array.isArray(digits) ? digits : [];
	return Number(Array.from({ length: 9 }, (_, slot) => {
		const digit = n(values[slot]);
		return Number.isInteger(digit) && digit >= 0 && digit <= 9 ? String(digit) : '0';
	}).join(''));
}

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

function _setProfession(row, slot, type) {
	const digits = decodePackedUnitDigits(row[11]); digits[slot] = type + 2; row[11] = encodePackedUnitDigits(digits);
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
		if (R.outpostPointsLeft(S, mapIdx) + n(opts._outpostPointCredit) < 0) errors.push(`map ${mapIdx}: negative points`);
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
	if (!opts.allowPoolEdit && !opts._allowProfessionChange && !opts._allowBarracksActivation) for (let type = 0; type < assigned.length; type++) if (assigned[type] > n(pool[type])) errors.push(`unit type ${type} exceeds global pool`);
	return { valid: errors.length === 0, errors };
}

export function applyRoyalMove(S, move, options) {
	const pristine = cloneRoyalState(S); const next = cloneRoyalState(S); const row = _row(next, move?.kind === 'unit-transfer' ? move.fromMap : move?.mapIdx); options = { ..._opts(options), _unitPool: options?._unitPool || _unitPool(S, _opts(options)) };
	if (!row) return { ok: false, state: pristine, errors: [`map ${move?.kind === 'unit-transfer' ? move.fromMap : move?.mapIdx} is not built`] };
	const errors = [];
	if (move.kind === 'type') {
		const adjacent = _adjacentType(S, move.mapIdx, move, options); const targetType = adjacent.type; const displacement = targetType === undefined ? null : _typeDisplacement(S, move.mapIdx, targetType, options);
		if (adjacent.error) errors.push(adjacent.error);
		else if (!_allowedTypes(S, _opts(options)).has(targetType)) errors.push('outpost type is locked');
		else if (displacement?.error) errors.push(displacement.error);
		else {
			const connectionLosses = [0, 1].filter(slot => row[8 + slot] !== undefined && row[8 + slot] !== null && n(row[8 + slot]) >= 0).map(slot => ({ mapIdx: move.mapIdx, slot, endpoint: _endpoint(row[8 + slot]) }));
			if (displacement?.mapIdx !== undefined) next.royalMapsData[displacement.mapIdx][10] = 0;
			row[10] = targetType; row[8] = -1; row[9] = -1;
			move = { ...move, type: targetType, ...(displacement?.mapIdx !== undefined ? { displaced: { mapIdx: displacement.mapIdx, type: targetType }, displacedMapIdx: displacement.mapIdx, displacedType: targetType } : {}), clearedConnections: connectionLosses.map(loss => loss.slot), connectionLosses, connectionLoss: connectionLosses.length > 0 };
		}
	}
	else if (move.kind === 'connection') {
		if (n(move.slot) !== 0) errors.push('new connections may only target endpoint slot 0');
		else {
			const endpoint = _endpoint(move.endpoint);
			if (endpoint.kind === 'resource') { const reason = _resourceEndpointIssue(next, move.mapIdx, endpoint, options); if (reason) errors.push(`map ${move.mapIdx}: ${reason}`); }
			else if (endpoint.kind === 'map') { const reason = _mapEndpointIssue(next, move.mapIdx, endpoint, options); if (reason) errors.push(`map ${move.mapIdx}: ${reason}`); }
			if (!errors.length) row[8] = _encodedEndpoint(endpoint);
		}
	}
	else if (move.kind === 'profession') {
		const slot = n(move.slot); const cap = _slotCap(next, move.mapIdx, options); const digits = decodePackedUnitDigits(row[11]);
		const currentRaw = digits[slot]; const unlocked = _unitTypes(next, options); let type = move.type === undefined ? undefined : n(move.type);
		if (!Number.isInteger(slot) || slot < 0 || slot >= cap) errors.push('profession slot is inactive');
		else if (currentRaw < 2 || currentRaw > 5) errors.push('profession slot is unoccupied');
		else if (type === undefined && move.cycle !== false) type = unlocked[(unlocked.indexOf(currentRaw - 2) + 1) % unlocked.length];
		if (type === undefined || !unlocked.includes(type)) errors.push('profession is locked');
		else _setProfession(row, slot, type);
	}
	else if (move.kind === 'unit-transfer') {
		errors.push('unit transfers are unsupported; units are stationary per outpost');
	}
	else if (move.kind === 'units') {
		row[11] = encodePackedUnits(move.units, move.slotCap === undefined ? 9 : move.slotCap);
		if (!options.allowPoolEdit && !_sameUnitCounts(_assignedUnits(S), _assignedUnits(next))) errors.push('units move must preserve the global unit pool');
	}
	else if (move.kind === 'outpost-upgrade') {
		const kind = n(move.upgrade ?? move.level); const costs = [12, 2, 1];
		const availablePoints = R.outpostPointsLeft(S, move.mapIdx) + n(options?._outpostPointCredit);
		if (![0, 1, 2].includes(kind)) errors.push('outpost upgrade kind must be 0, 1, or 2');
		else if (!_outpostUpgradeGate(S) && !_explicitGate(options, 'outpostUpgrade')) errors.push('outpost upgrade tool is locked');
		else if (kind === 2 && !_armoryUnlocked(S, 57) && !_explicitGate(options, 'thirdOutpostUpgrade')) errors.push('third outpost upgrade is locked');
		else if (availablePoints < costs[kind]) errors.push('not enough outpost points');
		else {
			const previousLevel = n(row[kind]); row[kind] = Math.floor(previousLevel) + 1;
			if (kind === 0) {
				const oldCap = Math.min(6, 1 + previousLevel); const newCap = Math.min(6, 1 + row[0]);
				if (newCap > oldCap) { const digits = decodePackedUnitDigits(row[11]); if (digits[oldCap] === 1) { digits[oldCap] = 2; row[11] = encodePackedUnitDigits(digits); } }
			}
		}
	}
	else if (move.kind === 'levels') { const levels = move.levels || []; if (!_outpostUpgradeGate(S) && !_explicitGate(options, 'outpostUpgrade')) errors.push('outpost upgrade tool is locked'); else if (n(levels[2]) !== n(row[2]) && !_armoryUnlocked(S, 57) && !_explicitGate(options, 'thirdOutpostUpgrade')) errors.push('third outpost upgrade is locked'); else { row[0] = Math.max(0, Math.floor(n(levels[0]))); row[1] = Math.max(0, Math.floor(n(levels[1]))); row[2] = Math.max(0, Math.floor(n(levels[2]))); } }
	else if (move.kind === 'resource') { if (!options?.simulationBudget && !options?.simulationResources) errors.push('resource changes require a simulation budget or resources'); else { if (!Array.isArray(next.royalGData[5])) next.royalGData[5] = []; next.royalGData[5][n(move.resourceIdx)] = Math.max(0, n(move.grade)); } }
	else errors.push(`unknown move kind ${move?.kind}`);
	if (!errors.length && (move.kind === 'unit-transfer' || (move.kind === 'units' && !options.allowPoolEdit)) && !_poolAllows(next, options._unitPool)) errors.push('unit assignments exceed global pool');
	const validation = errors.length ? { valid: false, errors } : validateRoyalSandbox(next, { ...options, _ignoreResourceGeometry: true, _allowProfessionChange: move.kind === 'profession', _allowBarracksActivation: move.kind === 'outpost-upgrade' && n(move.upgrade ?? move.level) === 0 });
	if (!validation.valid) return { ok: false, state: pristine, errors: validation.errors, partial: move.kind === 'units' && options.allowPoolEdit === true, executable: false };
	return { ok: true, state: next, errors: [], partial: move.kind === 'units' && options.allowPoolEdit === true, executable: !['levels', 'unit-transfer'].includes(move.kind) && !(move.kind === 'units' && options.allowPoolEdit === true), move: move.kind === 'type' ? move : undefined };
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
function _mapEndpointIssue(S, mapIdx, endpoint, ext) {
	if (!_mapGate(S) && !_explicitGate(ext, 'mapConnections')) return 'map connection tool is locked';
	if (R.outpostType(S, mapIdx) !== 1) return 'map endpoint requires a support outpost';
	if (!R.outpostBuilt(S, endpoint.id)) return 'map endpoint is unbuilt';
	if (R.outpostWorld(mapIdx) !== R.outpostWorld(endpoint.id)) return 'map endpoint is cross-world';
	if (endpoint.id === mapIdx) return 'map endpoint cannot self-link';
	if (!R.outpostReachable(S, mapIdx, endpoint.id, ext)) return 'map endpoint is out of range';
}
function _typeDisplacement(S, mapIdx, type, options) {
	const configuredLimit = options?.typeLimits?.[type] ?? (type === 1 ? _supportLimit(S, mapIdx) : type === 2 ? _savageLimit(S, mapIdx) : undefined);
	if (configuredLimit === undefined || !Number.isFinite(Number(configuredLimit))) return null;
	const limit = Math.floor(n(configuredLimit));
	if (limit <= 0) return { error: 'outpost type has no available capacity' };
	const worldStart = _world(mapIdx) * 50;
	let count = 0;
	for (let candidate = worldStart; candidate < worldStart + 50; candidate++) {
		if (!R.outpostBuilt(S, candidate) || R.outpostType(S, candidate) !== type) continue;
		count++;
		if (count >= limit) return { mapIdx: candidate, type };
	}
	return null;
}
function _adjacentType(S, mapIdx, move, options) {
	const unlocked = [..._allowedTypes(S, options)].sort((a, b) => a - b);
	const current = R.outpostType(S, mapIdx); const currentIndex = unlocked.indexOf(current);
	if (currentIndex < 0) return { error: 'current outpost type is not unlocked' };
	const direction = move?.direction === undefined ? undefined : Number(move.direction);
	if (direction !== undefined && ![-1, 1].includes(direction)) return { error: 'outpost type direction must be -1 or 1' };
	const target = move?.type === undefined ? undefined : Number(move.type);
	const targetIndex = target === undefined ? currentIndex + direction : unlocked.indexOf(target);
	if (!Number.isInteger(targetIndex) || Math.abs(targetIndex - currentIndex) !== 1) return { error: 'outpost type must change by one adjacent step' };
	if (direction !== undefined && targetIndex !== currentIndex + direction) return { error: 'outpost type target does not match direction' };
	return { type: unlocked[targetIndex] };
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
			const rawEndpoint = _rawResourceEndpoint(state, mapIdx, slot); if (rawEndpoint.malformed) { invalid.push({ mapIdx, slot, rawValue: rawEndpoint.rawValue, reason: 'resource endpoint value is malformed' }); if (slot === 0) moves.push({ kind: 'connection', mapIdx, slot, endpoint: { kind: 'empty', id: -1 }, reason: 'Remove malformed saved connection' }); continue; } const endpoint = rawEndpoint.endpoint;
			if (endpoint.kind === 'map' && R.outpostType(state, mapIdx) !== 1) { const reason = 'map endpoint requires a support outpost'; invalid.push({ mapIdx, slot, targetMapIdx: endpoint.id, reason }); if (slot === 0) moves.push({ kind: 'connection', mapIdx, slot, endpoint: { kind: 'empty', id: -1 }, reason: 'Remove invalid saved connection' }); continue; }
			if (endpoint.kind !== 'resource') continue;
			const reason = _savedResourceEndpointIssue(state, mapIdx, endpoint); if (!reason) continue;
			invalid.push({ mapIdx, slot, resourceIdx: endpoint.id, reason });
			if (slot === 0) moves.push({ kind: 'connection', mapIdx, slot, endpoint: { kind: 'empty', id: -1 }, reason: 'Remove invalid saved connection' });
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
	return { available: false, resetProjectionAvailable: false, partial: true, reset, resetLabel: 'before reset', hoursToReset: null, collectableBeforeReset: null, projectedRemainingAtReset: null, nodesEmptyingByReset: null, projectedRefillsAtReset: null, projectedGradeGainsAtReset: null, details: [], invalid: [], missing: missing || reset.missing, projection: 'Reset-boundary projection unavailable; no zero-hour exact result' };
}
export function resourceAllocationToReset(S, options) {
	options = _opts(options); const reset = R.royalResetTiming(S);
	const royalMissing = _royalMissing(S);
	if (royalMissing.length) return _resetUnavailable(reset, royalMissing);
	const projectionAvailable = reset.available;
	const allocation = resourceAllocationMetrics(S, { ...options, hours: projectionAvailable ? reset.hoursRemaining : 0 });
	if (!projectionAvailable) {
		const details = allocation.details.map(detail => ({ ...detail, collectableBeforeReset: null, emptiesByReset: null, refillsAtReset: false, refillAtReset: false, refillBoundary: null, gradeGainAtReset: null, projectedGradeAtReset: null, projectedRemainingAtReset: null, resetProjectionAvailable: false }));
		return { ...allocation, available: true, resetProjectionAvailable: false, partial: true, reset, resetLabel: 'before reset', hoursToReset: null, collectableBeforeReset: null, projectedRemainingAtReset: null, nodesEmptyingByReset: null, projectedRefillsAtReset: null, projectedGradeGainsAtReset: null, details, missing: [...new Set([...(allocation.missing || []), ...reset.missing])], projection: 'Reset-boundary projection unavailable; current node state preserved without reset claims' };
	}
	const armory70 = R.armoryBonus(S, 70) >= 1; const armory0 = R.armoryBonus(S, 0) >= 1;
	const details = allocation.details.map(detail => {
		const initiallyDrained = detail.drained;
		const initiallyEmpty = detail.alreadyEmpty;
		const emptiesByReset = !initiallyEmpty && detail.emptied;
		const refillsAtReset = (initiallyDrained || emptiesByReset) && armory70;
		const gradeGainAtReset = refillsAtReset && armory0 ? 1 : 0;
		const projectedGradeAtReset = R.resourceGrade(S, detail.resourceIdx) + gradeGainAtReset;
		const projectedRemainingAtReset = refillsAtReset ? _resourceCapacityAtGrade(detail.resourceIdx, projectedGradeAtReset) : Math.max(0, detail.remaining - detail.collectedWithinWindow);
		return { ...detail, collectableBeforeReset: detail.collectedWithinWindow, emptiesByReset, initiallyDrained, initiallyEmpty, refillsAtReset, refillAtReset: refillsAtReset, refillRequiresCollection: !initiallyDrained && emptiesByReset && armory70, refillBoundary: initiallyDrained ? 'saved-drained' : emptiesByReset ? 'collect-before-reset' : 'none', gradeGainAtReset, projectedGradeAtReset, projectedRemainingAtReset, resetProjectionAvailable: true };
	});
	return { ...allocation, available: true, resetProjectionAvailable: true, reset, resetLabel: 'before reset', hoursToReset: reset.hoursRemaining, collectableBeforeReset: allocation.collectedWithinWindow, projectedRemainingAtReset: details.reduce((sum, detail) => sum + detail.projectedRemainingAtReset, 0), nodesEmptyingByReset: allocation.nodesEmptiedWithinWindow, projectedRefillsAtReset: details.filter(detail => detail.refillsAtReset).length, projectedGradeGainsAtReset: details.reduce((sum, detail) => sum + detail.gradeGainAtReset, 0), details, projection: 'Projection through daily reset; projected-to-empty nodes refill only if collection commits the drained sentinel before reset; post-reset collection is not simulated' };
}
function _bankedProfessionAssignment(units, guardCount, workerCount) {
	const desired = new Map(); const remaining = { 0: workerCount, 1: units.length - guardCount - workerCount, 2: guardCount };
	for (const type of [0, 1, 2]) for (const unit of units) if (!desired.has(unit.slot) && unit.type === type && remaining[type] > 0) { desired.set(unit.slot, type); remaining[type]--; }
	for (const type of [2, 0, 1]) for (const unit of units) if (!desired.has(unit.slot) && remaining[type] > 0) { desired.set(unit.slot, type); remaining[type]--; }
	return units.map(unit => ({ mapIdx: null, slot: unit.slot, fromType: unit.type, toType: desired.get(unit.slot) }));
}
function _bankedOutpostCandidates(S, resourceIdx, streams, projectedGrade, ext) {
	const mapIdx = streams[0].mapIdx; const units = R.outpostUnits(S, mapIdx).sort((left, right) => left.slot - right.slot); const multiplicity = streams.length;
	const currentWorkerCount = units.filter(unit => unit.type === 0).length; const currentTraderCount = units.filter(unit => unit.type === 1).length;
	const traderUnlocked = _unitTypes(S, {}).includes(1); const guardUnlocked = _unitTypes(S, {}).includes(2); const candidates = [];
	if (!traderUnlocked) return { mapIdx, candidates, reason: 'Trader profession is locked' };
	for (let guardCount = 0; guardCount <= (guardUnlocked ? units.length : 0); guardCount++) for (let workerCount = 0; workerCount <= units.length - guardCount; workerCount++) {
		const assignments = _bankedProfessionAssignment(units, guardCount, workerCount).map(change => ({ ...change, mapIdx })); const changes = assignments.filter(change => change.fromType !== change.toType); const state = cloneRoyalState(S);
		if (!Array.isArray(state.royalGData[5])) state.royalGData[5] = [];
		state.royalGData[5][resourceIdx] = projectedGrade;
		for (const change of assignments) _setProfession(state.royalMapsData[mapIdx], change.slot, change.toType);
		if (!R.resourceReachable(state, mapIdx, resourceIdx, ext)) continue;
		const baseRate = R.resourceProductionWithGrade(state, mapIdx, resourceIdx, ext).value; const savage = R.outpostType(state, mapIdx) === 2;
		const rate = multiplicity * (savage ? R.savageCollection(state) * baseRate : baseRate);
		candidates.push({ mapIdx, rate, currentWorkerCount, currentTraderCount, workerCount, guardCount, traderCount: units.length - guardCount - workerCount, units: assignments.map(change => ({ slot: change.slot, type: change.toType })), changes });
	}
	return { mapIdx, candidates, reason: candidates.length ? null : 'No legal Worker/Trader/Guard assignment preserves this connection' };
}
function _bankedStaffingRecommendation(S, detail, hoursToPop, ext) {
	const grouped = new Map(); for (const stream of detail.streams) { const streams = grouped.get(stream.mapIdx) || []; streams.push(stream); grouped.set(stream.mapIdx, streams); }
	if (!grouped.size) return { available: false, reason: 'No connected outposts', changes: [], outposts: [] };
	const candidateGroups = [...grouped.values()].map(streams => _bankedOutpostCandidates(S, detail.resourceIdx, streams, detail.projectedGrade, ext));
	const unavailable = candidateGroups.find(group => !group.candidates.length); if (unavailable) return { available: false, mapIdx: unavailable.mapIdx, reason: unavailable.reason, changes: [], outposts: [] };
	let states = [{ rate: 0, workers: 0, traders: 0, guards: 0, changes: [], outposts: [] }];
	for (const group of candidateGroups) {
		const byWorkers = new Map();
		for (const state of states) for (const candidate of group.candidates) {
			const combined = { rate: state.rate + candidate.rate, workers: state.workers + candidate.workerCount, traders: state.traders + candidate.traderCount, guards: state.guards + candidate.guardCount, changes: [...state.changes, ...candidate.changes], outposts: [...state.outposts, candidate] };
			const current = byWorkers.get(combined.workers); if (!current || combined.rate > current.rate || (combined.rate === current.rate && combined.changes.length < current.changes.length)) byWorkers.set(combined.workers, combined);
		}
		states = [...byWorkers.values()];
	}
	const availableDrain = detail.refillsAtReset ? detail.projectedCapacity : detail.resetEligible ? 0 : detail.remaining; const activeHours = detail.activeHours;
	const scored = states.map(state => ({ ...state, gain: Math.min(availableDrain, state.rate * activeHours) })).sort((left, right) => right.gain - left.gain || left.workers - right.workers || left.changes.length - right.changes.length || left.rate - right.rate);
	const best = scored[0]; const currentWorkers = [...grouped.keys()].reduce((sum, mapIdx) => sum + R.outpostUnits(S, mapIdx).filter(unit => unit.type === 0).length, 0);
	return { available: true, reason: null, currentGain: detail.bankedGain, recommendedGain: best.gain, currentRate: detail.projectedRate, recommendedRate: best.rate, currentWorkers, recommendedWorkers: best.workers, recommendedTraders: best.traders, requiredGuards: best.guards, workerHours: best.workers * hoursToPop, traderHours: best.traders * hoursToPop, changes: best.changes, outposts: best.outposts };
}
export function bankedResourceProjection(S, options) {
	options = _opts(options); const reset = R.royalResetTiming(S); const royalMissing = _royalMissing(S);
	const mode = options.mode === 'current' ? 'current' : 'post-reset'; const hoursAfterReset = mode === 'post-reset' ? Math.max(0, n(options.hoursAfterReset)) : 0;
	const currentBankedHours = Math.max(0, n(S?.royalGData?.[3]?.[0]) / 3600); const resetRequired = mode === 'post-reset';
	if (royalMissing.length || (resetRequired && !reset.available)) return { available: false, resetProjectionAvailable: false, partial: true, reset, mode, currentBankedHours, postResetBankedHours: null, hoursToReset: reset.available ? reset.hoursRemaining : null, hoursAfterReset, hoursToPop: null, bankedHoursAtPop: null, bankedGain: null, currencyGain: null, projectedRefillsAtReset: null, projectedGradeGainsAtReset: null, details: [], invalid: [], missing: [...new Set([...royalMissing, ...(resetRequired ? reset.missing || [] : [])])], projection: 'Post-reset banked-time projection unavailable without the saved daily reset countdown' };
	const hoursToReset = reset.available ? reset.hoursRemaining : null; const postResetBankedHours = reset.available ? currentBankedHours + reset.hoursRemaining : null;
	const hoursToPop = mode === 'post-reset' ? reset.hoursRemaining + hoursAfterReset : 0; const bankedHoursAtPop = currentBankedHours + hoursToPop;
	const allocation = resourceAllocationMetrics(S, { ...options, hours: bankedHoursAtPop });
	const replenish = R.armoryBonus(S, 70) >= 1; const gradeIncrease = R.armoryBonus(S, 0) >= 1;
	const projected = allocation.details.map(detail => {
		const currentGrade = R.resourceGrade(S, detail.resourceIdx); const currentCapacity = R.resourceCapacity(S, detail.resourceIdx);
		const resetEligible = detail.drained; const refillsAtReset = mode === 'post-reset' && resetEligible && replenish; const gradeGainAtReset = refillsAtReset && gradeIncrease ? 1 : 0;
		const projectedGrade = currentGrade + gradeGainAtReset; const projectedCapacity = refillsAtReset ? _resourceCapacityAtGrade(detail.resourceIdx, projectedGrade) : currentCapacity;
		const gradeFactor = 1 + currentGrade * 0.25; const projectedRate = refillsAtReset ? detail.rate / gradeFactor * (1 + projectedGrade * 0.25) : detail.rate;
		const activeHours = bankedHoursAtPop; const bankedGain = refillsAtReset ? Math.min(projectedCapacity, projectedRate * activeHours) : resetEligible ? 0 : detail.collectedWithinWindow;
		const projectedCollected = refillsAtReset ? bankedGain : Math.min(projectedCapacity, R.resourceCollected(S, detail.resourceIdx) + bankedGain);
		const projectedRemaining = Math.max(0, projectedCapacity - projectedCollected); const currencyShare = detail.rate > 0 ? detail.currencyRate / detail.rate : 0;
		return { ...detail, currentGrade, currentCapacity, resetEligible, refillsAtReset, gradeGainAtReset, projectedGrade, projectedCapacity, projectedRate, activeHours, bankedGain, currencyGain: bankedGain * currencyShare, projectedCollected, projectedRemaining, readyAtPop: projectedRemaining <= 0, resetProjectionAvailable: true };
	});
	const details = projected.map(detail => ({ ...detail, staffingRecommendation: _bankedStaffingRecommendation(S, detail, bankedHoursAtPop, options.ext || {}) }));
	return { ...allocation, available: true, resetProjectionAvailable: true, reset, mode, currentBankedHours, postResetBankedHours, hoursToReset, hoursAfterReset, hoursToPop, bankedHoursAtPop, bankedGain: details.reduce((sum, detail) => sum + detail.bankedGain, 0), currencyGain: details.reduce((sum, detail) => sum + detail.currencyGain, 0), projectedRefillsAtReset: details.filter(detail => detail.refillsAtReset).length, projectedGradeGainsAtReset: details.reduce((sum, detail) => sum + detail.gradeGainAtReset, 0), details, projection: mode === 'current' ? 'Current saved banked-time projection with no reset or grade rollover' : 'Post-reset projection uses current banked time plus time to reset plus the selected delay; only nodes already saved as drained refill and gain grade at reset' };
}
function _currencyBreakdownUnavailable(currencySlot, hours, reason, available = false) {
	return { currencySlot, valid: false, available, balance: 0, hours, projection: 'Fixed current node state; no refill or grade rollover', nominalCurrencyPerHour: 0, collectableWithinWindow: 0, activeStreams: 0, activeNodes: 0, nodes: [], invalid: [], partial: true, missing: [reason] };
}
function _currencyCapacityUnavailable() { return { currentFullCapacity: 0, nextResetProjectedFullCapacity: null, allNodesPlusOneCapacity: 0, capacityNodes: [] }; }
function _currencyCapacityProjection(S, currencySlot, resetAllocation, projectionAvailable) {
	const capacityNodes = ROYAL_RESOURCES.map((resource, resourceIdx) => ({ resource, resourceIdx })).filter(({ resource }) => resource.currencySlot === currencySlot).map(({ resourceIdx }) => {
		const currentGrade = R.resourceGrade(S, resourceIdx); const currentCapacity = _resourceCapacityAtGrade(resourceIdx, currentGrade); const detail = resetAllocation?.details?.[resourceIdx];
		const gradeGainAtReset = projectionAvailable ? (detail?.gradeGainAtReset || 0) : null; const projectedGradeAtReset = projectionAvailable ? (detail?.projectedGradeAtReset ?? currentGrade) : null;
		return { resourceIdx, currentGrade, currentCapacity, projectedGradeAtReset, nextResetProjectedCapacity: projectionAvailable ? _resourceCapacityAtGrade(resourceIdx, projectedGradeAtReset) : null, allNodesPlusOneCapacity: _resourceCapacityAtGrade(resourceIdx, currentGrade + 1), gradeGainAtReset, refillBoundary: projectionAvailable ? (detail?.refillBoundary || 'none') : null, refillRequiresCollection: projectionAvailable ? !!detail?.refillRequiresCollection : false };
	});
	return { currentFullCapacity: capacityNodes.reduce((sum, node) => sum + node.currentCapacity, 0), nextResetProjectedFullCapacity: projectionAvailable ? capacityNodes.reduce((sum, node) => sum + node.nextResetProjectedCapacity, 0) : null, allNodesPlusOneCapacity: capacityNodes.reduce((sum, node) => sum + node.allNodesPlusOneCapacity, 0), capacityNodes };
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
	if (royalMissing.length) return { ..._currencyBreakdownUnavailable(currencySlot, null, royalMissing[0]), ..._currencyCapacityUnavailable(), resetProjectionAvailable: false, reset, resetLabel: 'before reset', remainingNow: null, projectedAvailableAtReset: null, collectableBeforeReset: null, projectedRefillsAtReset: null, projectedGradeGainsAtReset: null };
	const projectionAvailable = reset.available;
	const breakdown = currencyIncomeBreakdown(S, currencySlot, { ...options, hours: projectionAvailable ? reset.hoursRemaining : 0 });
	if (!breakdown.valid) return { ...breakdown, ..._currencyCapacityUnavailable(), resetProjectionAvailable: false, reset, resetLabel: 'before reset', hoursToReset: projectionAvailable ? reset.hoursRemaining : null, remainingNow: null, projectedAvailableAtReset: null, collectableBeforeReset: null, projectedRefillsAtReset: null, projectedGradeGainsAtReset: null };
	const allocation = resourceAllocationToReset(S, options); const resetDetails = new Map(allocation.details.filter(detail => detail.currencySlot === currencySlot).map(detail => [detail.resourceIdx, detail]));
	const nodes = breakdown.nodes.map(node => { const detail = resetDetails.get(node.resourceIdx); return projectionAvailable ? { ...node, collectableBeforeReset: node.collectableWithinWindow, emptiesByReset: detail?.emptiesByReset || false, initiallyDrained: detail?.initiallyDrained || false, initiallyEmpty: detail?.initiallyEmpty || false, refillsAtReset: detail?.refillsAtReset || false, refillAtReset: detail?.refillAtReset || false, refillRequiresCollection: detail?.refillRequiresCollection || false, refillBoundary: detail?.refillBoundary || 'none', gradeGainAtReset: detail?.gradeGainAtReset || 0, projectedGradeAtReset: detail?.projectedGradeAtReset ?? node.grade, projectedRemainingAtReset: detail?.projectedRemainingAtReset ?? 0, resetProjectionAvailable: true } : { ...node, collectableBeforeReset: null, emptiesByReset: null, initiallyDrained: node.drained, initiallyEmpty: node.alreadyEmpty, refillsAtReset: false, refillAtReset: false, refillRequiresCollection: false, refillBoundary: null, gradeGainAtReset: null, projectedGradeAtReset: null, projectedRemainingAtReset: null, resetProjectionAvailable: false }; });
	const capacity = _currencyCapacityProjection(S, currencySlot, allocation, projectionAvailable);
	return projectionAvailable ? { ...breakdown, ...capacity, resetProjectionAvailable: true, reset, resetLabel: 'before reset', hoursToReset: reset.hoursRemaining, remainingNow: nodes.reduce((sum, node) => sum + node.remaining, 0), projectedAvailableAtReset: nodes.reduce((sum, node) => sum + node.projectedRemainingAtReset, 0), collectableBeforeReset: nodes.reduce((sum, node) => sum + node.collectableBeforeReset, 0), nodes, projectedRefillsAtReset: nodes.filter(node => node.refillsAtReset).length, projectedGradeGainsAtReset: nodes.reduce((sum, node) => sum + node.gradeGainAtReset, 0), projection: 'Projection through daily reset; projected-to-empty nodes refill only if collection commits the drained sentinel before reset; post-reset collection is not simulated' } : { ...breakdown, ...capacity, resetProjectionAvailable: false, partial: true, reset, resetLabel: 'before reset', hoursToReset: null, remainingNow: nodes.reduce((sum, node) => sum + node.remaining, 0), projectedAvailableAtReset: null, collectableBeforeReset: null, nodes, projectedRefillsAtReset: null, projectedGradeGainsAtReset: null, missing: [...new Set([...(breakdown.missing || []), ...reset.missing])], projection: 'Reset-boundary projection unavailable; current node state preserved without reset claims' };
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
	const details = targets.filter(value => _row(S, value.mapIdx)).map(value => ({ ...value, unlocked: _barUnlocked(S, value.bar), rate: R.outpostRankExpPerHour(S, value.mapIdx, value.bar, ext), reason: _barUnlocked(S, value.bar) ? undefined : `bar ${value.bar} requires Armory${BAR_ARMORY[value.bar]}` }));
	const selectedMissing = !normalized?.aggregate && !details.length;
	const unavailable = selectedMissing || (!normalized?.aggregate && details[0] && !details[0].unlocked);
	const reason = selectedMissing ? `map ${targets[0].mapIdx} is not built` : unavailable ? details[0].reason : undefined;
	return { value: details.reduce((sum, value) => sum + value.rate, 0), details, aggregate: !!normalized?.aggregate, bar: normalized?.aggregate ? undefined : targets[0]?.bar, available: !unavailable, unavailable, reason };
}
function _currencyPortfolioMetrics(S, ext, options) {
	const resources = resourceIncomeByCurrency(S, ext); const activeIncome = {};
	for (const detail of resources.details || []) if (detail.currencyRate > 0 && R.resourceRemaining(S, detail.resourceIdx) > 0) activeIncome[detail.currencySlot] = (activeIncome[detail.currencySlot] || 0) + detail.currencyRate;
	const currencyPortfolio = options.currencyPortfolio.map(item => { const currencySlot = n(item.currencySlot ?? item.slot); const targetCost = Math.max(1e-9, n(item.targetCost ?? item.cost)); const rate = n(activeIncome[currencySlot]); const weight = Math.max(1e-9, n(item.weight) || 1); return { currencySlot, targetCost, rate, weight, normalizedRate: rate / targetCost }; });
	return { resourcesPerHour: Object.values(activeIncome).reduce((sum, value) => sum + value, 0), resourceIncome: activeIncome, currencyPortfolio, currencyPortfolioActive: currencyPortfolio.filter(item => item.rate > 1e-9).length, currencyPortfolioScore: currencyPortfolio.reduce((sum, item) => sum + item.weight * Math.log1p(item.normalizedRate), 0), rankExpPerHour: 0, range: 0, armoryEtaHours: null, partial: !!resources.partial, missing: resources.missing || [] };
}
export function kingdomMetrics(S, ext, options) {
	options = _opts(options); const resources = resourceIncomeByCurrency(S, ext); const allocation = resourceAllocationMetrics(S, { ...options, ext }); const ranks = rankObjective(S, options.rankTarget || { aggregate: true }, ext);
	const activeCurrencyIncome = {}; for (const detail of allocation.details || []) if (detail.remaining > 0 && detail.currencyRate > 0) activeCurrencyIncome[detail.currencySlot] = (activeCurrencyIncome[detail.currencySlot] || 0) + detail.currencyRate;
	const currencyPortfolio = (Array.isArray(options.currencyPortfolio) ? options.currencyPortfolio : []).map(item => { const currencySlot = n(item.currencySlot ?? item.slot); const targetCost = Math.max(1e-9, n(item.targetCost ?? item.cost)); const rate = n(activeCurrencyIncome[currencySlot]); const weight = Math.max(1e-9, n(item.weight) || 1); return { currencySlot, targetCost, rate, weight, normalizedRate: rate / targetCost }; });
	const currencyPortfolioActive = currencyPortfolio.filter(item => item.rate > 1e-9).length; const currencyPortfolioScore = currencyPortfolio.reduce((sum, item) => sum + item.weight * Math.log1p(item.normalizedRate), 0);
	const range = (S?.royalMapsData || []).reduce((sum, row, mapIdx) => sum + (R.outpostBuilt(S, mapIdx) ? R.outpostRange(S, mapIdx, ext) : 0), 0);
	const armory = options.armoryTarget === undefined ? null : armoryTargetEta(S, options.armoryTarget, ext, options);
	const resourceTarget = _validResourceTarget(options.resourceTarget); const currencyTarget = _validCurrencyTarget(options.currencyTarget);
	const resetAllocation = resourceAllocationToReset(S, options); const resetCurrency = currencyTarget >= 0 ? currencyIncomeToReset(S, currencyTarget, options) : null;
	const missing = [...new Set([...(resources.missing || []), ...(allocation.missing || []), ...(ranks.missing || []), ...(resetAllocation.missing || []), ...(resetCurrency?.missing || []), ...(armory?.missing || [])])];
	const partial = !!(resources.partial || allocation.partial || ranks.partial || resetAllocation.partial || resetCurrency?.partial || armory?.partial || missing.length);
	return { available: R.hasCompleteRoyalData(S), resourcesPerHour: resources.total, resourceIncome: resources.income, currencyPortfolio, currencyPortfolioActive, currencyPortfolioScore, rankExpPerHour: ranks.value, range, armoryEtaHours: armory?.etaHours ?? null, armory, resources, ranks, resourceAllocation: allocation, collectedWithinWindow: allocation.collectedWithinWindow, nodesEmptiedWithinWindow: allocation.nodesEmptiedWithinWindow, slowestDrainHours: allocation.slowestDrainHours, selectedResourceDrainHours: resourceTarget >= 0 ? allocation.details[resourceTarget]?.drainHours ?? null : null, selectedCurrencyPerHour: currencyTarget >= 0 ? allocation.incomeByCurrency[currencyTarget] || 0 : null, resetAllocation, resetCurrency, reset: resetAllocation.reset, collectableBeforeReset: resetAllocation.collectableBeforeReset, nodesEmptyingByReset: resetAllocation.nodesEmptyingByReset, selectedCurrencyBeforeReset: resetCurrency?.collectableBeforeReset ?? null, partial, missing };
}

function _candidateMoves(S, options) {
	const buckets = []; const maps = (S?.royalMapsData || []).map((row, mapIdx) => R.outpostBuilt(S, mapIdx) ? mapIdx : -1).filter(mapIdx => mapIdx >= 0);
	for (const mapIdx of maps) {
		const moves = [];
		const row = _row(S, mapIdx); const levels = [n(row[0]), n(row[1]), n(row[2])];
		if (_outpostUpgradeGate(S) || _explicitGate(options, 'outpostUpgrade')) for (let level = 0; level < 3; level++) if ((level !== 2 || _armoryUnlocked(S, 57) || _explicitGate(options, 'thirdOutpostUpgrade')) && R.outpostPointsLeft(S, mapIdx) >= [12, 2, 1][level]) moves.push({ kind: 'outpost-upgrade', mapIdx, upgrade: level });
		const unlockedTypes = [..._allowedTypes(S, options)].sort((a, b) => a - b); const currentType = R.outpostType(S, mapIdx); const currentTypeIndex = unlockedTypes.indexOf(currentType);
		for (const direction of [-1, 1]) if (currentTypeIndex >= 0 && unlockedTypes[currentTypeIndex + direction] !== undefined) moves.push({ kind: 'type', mapIdx, direction, type: unlockedTypes[currentTypeIndex + direction], clearsConnections: R.outpostConnections(S, mapIdx).some(connection => connection.kind !== 'empty') });
		const slot = 0;
		if ([0, 2].includes(R.outpostType(S, mapIdx)) && _resourceGate(S)) for (const resourceIdx of _resourceCandidateIndices(options, mapIdx)) if (R.resourceReachable(S, mapIdx, resourceIdx, options) && _encodedEndpoint({ kind: 'resource', id: resourceIdx }) !== n(row[8])) moves.push({ kind: 'connection', mapIdx, slot, endpoint: { kind: 'resource', id: resourceIdx } });
		if (R.outpostType(S, mapIdx) === 1 && _mapGate(S)) for (const targetMap of maps) if (targetMap !== mapIdx && R.outpostWorld(targetMap) === R.outpostWorld(mapIdx) && royalMapEligible(targetMap) && R.outpostReachable(S, mapIdx, targetMap, options) && _encodedEndpoint({ kind: 'map', id: targetMap }) !== n(row[8])) moves.push({ kind: 'connection', mapIdx, slot, endpoint: { kind: 'map', id: targetMap } });
		if (n(row[8]) !== -1) moves.push({ kind: 'connection', mapIdx, slot, endpoint: { kind: 'empty', id: -1 } });
		const current = _unitsWithPositions(S, mapIdx);
		for (const unit of current.filter(unit => unit.slot < _slotCap(S, mapIdx, options) && unit.type >= 0)) for (const type of _unitTypes(S, options)) if (type !== unit.type) moves.push({ kind: 'profession', mapIdx, slot: unit.slot, type });
		buckets.push(moves);
	}
	const moves = []; let added = true; for (let index = 0; added; index++) { added = false; for (const bucket of buckets) if (bucket[index]) { moves.push(bucket[index]); added = true; } }
	const objective = options?.objective;
	const filtered = objective ? moves.filter(move => _objectiveMoveAllowed(S, move, objective, options)) : moves;
	const rawLimit = _finiteCap(options?.candidateCap, DEFAULTS.candidateCap, 5000);
	const pool = objective ? filtered.slice(0, rawLimit) : filtered;
	return pool.map(move => { const result = applyRoyalMove(S, move, options); if (options?._validationStats) options._validationStats.applications++; return { move, result }; }).filter(item => item.result.ok && item.result.executable).slice(0, rawLimit);
}
function _objectiveMoveAllowed(S, move, objective, options) {
	if (objective === 'rank-target' || objective === 'rank-purification') {
		if (move.kind === 'profession') return [1, 3].includes(n(move.type));
		if (move.kind === 'connection') return move.endpoint?.kind === 'map' || move.endpoint?.kind === 'resource';
		return move.kind === 'type' || (move.kind === 'outpost-upgrade' && move.upgrade === 0);
	}
	if (['grade-gains', 'drain-then-income', 'currency', 'currency-income', 'currency-portfolio', 'currency-before-reset', 'max-income', 'resources', 'resource-income', 'collect-window', 'collect-before-reset', 'empty-by-reset', 'empty-most-window', 'no-waste'].includes(objective)) {
		if (move.kind === 'profession') return [0, 2].includes(n(move.type));
		if (move.kind === 'connection') return move.endpoint?.kind === 'resource';
		return move.kind === 'type' || (move.kind === 'outpost-upgrade' && [0, 1].includes(n(move.upgrade)));
	}
	if (objective === 'balanced') {
		if (move.kind === 'profession') return [0, 1, 2, 3].includes(n(move.type));
		return move.kind === 'connection' ? move.endpoint?.kind === 'resource' : move.kind === 'type' || move.kind === 'outpost-upgrade';
	}
	return true;
}
export function generateRoyalCandidates(S, options) { const opts = _opts(options); const candidates = _candidateMoves(S, opts).slice(0, _finiteCap(opts.candidateCap, DEFAULTS.candidateCap, 5000)); return opts.returnResults === true ? candidates : candidates.map(item => item.move); }

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
	if (objective === 'currency-portfolio') return [metrics.currencyPortfolioActive, metrics.currencyPortfolioScore];
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
function _optimizerMetrics(S, ext, options, objective) { return objective === 'currency-portfolio' ? _currencyPortfolioMetrics(S, ext, options) : kingdomMetrics(S, ext, options); }

export function optimizeRoyalGuardian(S, objective = 'resources', options) {
	const requestedObjective = objective; const normalizedObjective = objective === 'resource-income' ? 'resources' : objective;
	options = _opts(options); const maxIterations = _finiteCap(options.maxIterations, DEFAULTS.maxIterations, 50); const candidateCap = _finiteCap(options.candidateCap, DEFAULTS.candidateCap, 5000); const beamWidth = _finiteCap(options.beamWidth, DEFAULTS.beamWidth, 50); const resourceCandidateCap = _finiteCap(options.resourceCandidateCap, DEFAULTS.resourceCandidateCap, 80); const unitPool = _unitPool(S, options); options = { ...options, resourceCandidateCap, _unitPool: unitPool }; const ext = options.ext || {};
	const royalMissing = _royalMissing(S);
	if (royalMissing.length) return { objective, available: false, candidates: [], best: null, metadata: { bounded: true, iterations: 0, candidatesEvaluated: 0, truncated: false, approximation: 'Royal data unavailable', missing: royalMissing } };
	if (normalizedObjective === 'armory-target' && options.armoryTarget === undefined) return _unavailableObjective(requestedObjective, 'armory-target requires options.armoryTarget');
	if (normalizedObjective === 'currency-portfolio' && (!Array.isArray(options.currencyPortfolio) || !options.currencyPortfolio.length)) return _unavailableObjective(requestedObjective, 'currency-portfolio requires options.currencyPortfolio');
	if (normalizedObjective === 'resource-drain' && _validResourceTarget(options.resourceTarget) < 0) return _unavailableObjective(requestedObjective, 'resource-drain requires a valid options.resourceTarget');
	if (normalizedObjective === 'currency-income' && _validCurrencyTarget(options.currencyTarget) < 0) return _unavailableObjective(requestedObjective, 'currency-income requires a valid options.currencyTarget');
	if (normalizedObjective === 'currency-before-reset' && _validCurrencyTarget(options.currencyTarget) < 0) return _unavailableObjective(requestedObjective, 'currency-before-reset requires a valid options.currencyTarget');
	const initialMetrics = _optimizerMetrics(S, ext, options, normalizedObjective);
	if (['collect-before-reset', 'empty-by-reset', 'currency-before-reset'].includes(normalizedObjective) && !initialMetrics.resetAllocation.resetProjectionAvailable) return { ..._unavailableObjective(requestedObjective, 'reset timing unavailable'), metadata: { ..._unavailableObjective(requestedObjective, 'reset timing unavailable').metadata, missing: initialMetrics.resetAllocation.missing } };
	if (normalizedObjective === 'armory-target' && !initialMetrics.armory.available) return { ..._unavailableObjective(requestedObjective, 'armory target is unavailable'), metadata: { ..._unavailableObjective(requestedObjective, 'armory target is unavailable').metadata, missing: initialMetrics.armory.missing } };
	if (normalizedObjective === 'rank-purification' && !initialMetrics.ranks.available) return _unavailableObjective(requestedObjective, initialMetrics.ranks.reason || 'rank target is unavailable');
	const normalized = normalizeInvalidResourceConnections(S, ext); const repairMoves = normalized.moves;
	let beam = [{ state: normalized.state, moves: repairMoves.slice(), metrics: _optimizerMetrics(normalized.state, ext, options, normalizedObjective) }]; let archive = [beam[0]]; let evaluated = 0; let truncated = false; let iterations = 0;
	for (let iteration = 0; iteration < maxIterations; iteration++) {
		iterations++;
		const pool = []; for (const item of beam) for (const { move, result } of _candidateMoves(item.state, options)) { if (evaluated >= candidateCap) { truncated = true; break; } if (!result.ok) continue; const metrics = _optimizerMetrics(result.state, ext, options, normalizedObjective); pool.push({ state: result.state, moves: item.moves.concat(move), metrics }); evaluated++; }
		if (!pool.length) break; for (const item of pool) archive = _archiveAdd(archive, item, normalizedObjective); pool.sort((a, b) => _compareObjectives(b.metrics, a.metrics, normalizedObjective) || JSON.stringify(a.moves).localeCompare(JSON.stringify(b.moves))); beam = pool.slice(0, beamWidth); if (pool.length > beamWidth) truncated = true;
		if (evaluated >= candidateCap) break;
	}
	const all = archive.map(item => ({ ...item, exactMetrics: item.metrics }));
	let candidates = all.sort((a, b) => _compareObjectives(b.metrics, a.metrics, normalizedObjective) || JSON.stringify(a.moves).localeCompare(JSON.stringify(b.moves))).slice(0, 10);
	return { objective: requestedObjective, available: true, candidates, best: candidates[0] || null, metadata: { bounded: true, iterations, candidatesEvaluated: evaluated, truncated: truncated || evaluated >= candidateCap, caps: { maxIterations, candidateCap, beamWidth, resourceCandidateCap }, archiveSize: archive.length, archivePruned: false, archiveApproximation: 'All nondominated evaluated states retained; final display is limited to 10', approximation: 'Deterministic bounded coordinate/beam search; not globally optimal' } };
}