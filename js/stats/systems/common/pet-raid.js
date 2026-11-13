// ===== PET RAID ESTIMATES (GENERAL) =====
import { companionPetPower } from '../../data/common/companions.js';

function _number(value, label) {
	if ((typeof value !== 'number' && typeof value !== 'string') ||
		String(value).trim() === '' || !Number.isFinite(Number(value))) {
		throw new Error('Invalid ' + label + '.');
	}
	return Number(value);
}

function _entries(value, label) {
	if (!value || typeof value !== 'object') throw new Error(label + ' is unavailable.');
	const keys = Object.keys(value).filter(key => key !== 'length');
	if (keys.some(key => !/^(0|[1-9]\d*)$/.test(key))) throw new Error('Invalid ' + label + '.');
	return keys.sort((a, b) => Number(a) - Number(b)).map(key => [Number(key), value[key]]);
}

function _pet(id, enhanced) {
	id = _number(id, 'companion ID');
	enhanced = _number(enhanced, 'Pet+ flag');
	if (enhanced !== 0 && enhanced !== 1) throw new Error('Invalid Pet+ flag.');
	return { id, enhanced: enhanced === 1, power: companionPetPower(id, enhanced === 1) };
}

export function petRaidRoster(raw) {
	const pets = new Map();
	const entries = _entries(raw?.companion?.l, 'Physical companion collection').map(([, entry]) => {
		if (typeof entry !== 'string') throw new Error('Invalid physical companion entry.');
		const fields = entry.split(',');
		return _pet(fields[0], fields[4]);
	});
	for (const enhanced of [true, false]) {
		for (const pet of entries) {
			if (pet.enhanced === enhanced && !pets.has(pet.id)) pets.set(pet.id, pet);
		}
	}
	return [...pets.values()];
}

export function petRaidLineups(settings) {
	const list = settings?.RL ?? settings;
	const rows = _entries(list, 'Raid lineups');
	if (!rows.length) throw new Error('Raid lineups are empty.');
	return rows.map(([difficulty, entry]) => {
		try {
			if (typeof entry !== 'string' || !entry.trim()) throw new Error('Enemy lineup is unavailable.');
			const pets = entry.split(';').map(text => {
				const fields = text.split(',');
				if (fields.length !== 2) throw new Error('Invalid enemy lineup entry.');
				return _pet(fields[0], fields[1]);
			});
			return { difficulty, pets, error: null };
		} catch (error) {
			return { difficulty, pets: null, error: error.message };
		}
	});
}

export function petRaidDuelChance(power, enemyPower) {
	power = _number(power, 'Pet Power');
	enemyPower = _number(enemyPower, 'enemy Pet Power');
	if (power <= 0 || enemyPower <= 0) throw new Error('Pet Power must be positive.');
	return 1 / (1 + enemyPower / power);
}

function _powers(values) {
	if (!Array.isArray(values) || values.length > 4096) throw new Error('Invalid raid team.');
	return Array.from(values, value => {
		value = _number(value, 'Pet Power');
		if (value <= 0) throw new Error('Pet Power must be positive.');
		return value;
	});
}

function _shuffle(values, random) {
	for (let i = values.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		[values[i], values[j]] = [values[j], values[i]];
	}
}

function _battle(ours, enemies, random) {
	const a = ours.slice(), b = enemies.slice();
	while (a.length && b.length) {
		_shuffle(a, random);
		_shuffle(b, random);
		const pairs = Math.min(a.length, b.length);
		let na = 0, nb = 0;
		for (let i = 0; i < pairs; i++) {
			if (random() < 1 / (1 + b[i] / a[i])) a[na++] = a[i];
			else b[nb++] = b[i];
		}
		for (let i = pairs; i < a.length; i++) a[na++] = a[i];
		for (let i = pairs; i < b.length; i++) b[nb++] = b[i];
		a.length = na;
		b.length = nb;
	}
	return a.length;
}

export function estimatePetRaid(ours, enemies, { trials = 20000, seed = 1, onProgress } = {}) {
	ours = _powers(ours);
	enemies = _powers(enemies);
	if (!ours.length && !enemies.length) throw new Error('Both raid teams are empty.');
	if (!Number.isInteger(trials) || trials < 1 || trials > 1000000) throw new Error('Invalid trial count.');
	if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('Invalid random seed.');
	// Calculator-only Mulberry32 stream, not the unrecoverable server RNG.
	let state = seed;
	const random = () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = Math.imul(state ^ state >>> 15, 1 | state);
		t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
		return ((t ^ t >>> 14) >>> 0) / 4294967296;
	};
	let wins = 0, survivors = 0;
	for (let i = 0; i < trials; i++) {
		const left = _battle(ours, enemies, random);
		if (left) { wins++; survivors += left; }
		if ((i + 1) % 512 === 0 || i + 1 === trials) onProgress?.((i + 1) / trials);
	}
	const chance = wins / trials;
	const z2 = 1.959963984540054 ** 2;
	const centre = (chance + z2 / (2 * trials)) / (1 + z2 / trials);
	const half = Math.sqrt(z2 * (chance * (1 - chance) / trials + z2 / (4 * trials * trials))) / (1 + z2 / trials);
	return {
		trials, seed, wins, chance,
		interval: [Math.max(0, centre - half), Math.min(1, centre + half)],
		survivorsOnWin: wins ? survivors / wins : null
	};
}
