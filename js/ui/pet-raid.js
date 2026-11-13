import { initSaveLoader } from './save-loader.js';
import { petRaidRoster, petRaidLineups } from '../stats/systems/common/pet-raid.js?v=pet-raid-2';
import { PET_RAID_LINEUPS, PET_RAID_LINEUP_DATE } from '../stats/data/common/pet-raid.js?v=pet-raid-2';
import { entityName } from '../stats/entity-names.js';
import { loadUiAssets, iconHtml, installIconFallback } from './combat-sim-picker.js';

const $ = id => document.getElementById(id);
let roster = null, worker = null, revision = 0, hasResults = false;
const lineups = petRaidLineups(PET_RAID_LINEUPS);
const number = value => value.toLocaleString(undefined, { maximumFractionDigits: 2 });
const percent = value => value > 0 && value < 0.0001 ? (value * 100).toPrecision(3) + '%' :
	value > 0.9999 && value < 1 ? '>99.99%' : (value * 100).toFixed(2) + '%';
const resultCells = new Map();

function petTile(pet, count = 1) {
	const item = document.createElement('div');
	item.className = 'pet' + (pet.enhanced ? ' pet-plus' : '');
	item.dataset.petId = String(pet.id);
	item.dataset.enhanced = String(pet.enhanced);
	const kind = document.createElement('span');
	kind.className = 'pet-kind';
	kind.textContent = pet.enhanced ? 'Pet+' : 'Pet';
	const art = document.createElement('span');
	const label = entityName('Companion', pet.id) || 'Companion ' + pet.id;
	art.innerHTML = iconHtml('companions', pet.id, label, { size: 32 });
	art.setAttribute('aria-hidden', 'true');
	const name = document.createElement('span');
	name.className = 'pet-name';
	name.textContent = label;
	const power = document.createElement('span');
	power.className = 'pet-power';
	power.dataset.power = String(pet.power);
	power.append(document.createTextNode(number(pet.power) + ' '));
	const unit = document.createElement('small');
	unit.textContent = 'POW';
	power.append(unit);
	item.append(kind, art, name, power);
	if (count > 1) {
		const quantity = document.createElement('span');
		quantity.className = 'pet-count';
		quantity.textContent = 'x' + count;
		quantity.setAttribute('aria-label', count + ' pets');
		item.append(quantity);
	}
	return item;
}

function collectionSummary(pets) {
	const stats = document.createElement('div');
	stats.className = 'collection-stats';
	const enhanced = pets.filter(pet => pet.enhanced).length;
	for (const [label, value, plus] of [
		['Raid pets', pets.length], ['Normal', pets.length - enhanced],
		['Pet+', enhanced, true], ['Pet Power', pets.reduce((sum, pet) => sum + pet.power, 0)]
	]) {
		const card = document.createElement('div');
		card.className = 'stat' + (plus ? ' stat-plus' : '');
		const heading = document.createElement('span');
		heading.className = 'stat-label';
		heading.textContent = label;
		const amount = document.createElement('span');
		amount.className = 'stat-value';
		amount.dataset.value = String(value);
		amount.textContent = number(value);
		card.append(heading, amount);
		stats.append(card);
	}
	return stats;
}

function status(text, error = false) {
	$('job-status').textContent = text;
	$('job-status').className = error ? 'error' : '';
}

function readiness() {
	$('run').disabled = !!worker || !roster || !lineups.some(row => row.pets);
	$('cancel').disabled = !worker;
}

function stop() {
	revision++;
	worker?.terminate();
	worker = null;
	$('progress').hidden = true;
	for (const tr of resultCells.values()) {
		if (tr.cells[3].textContent === 'Pending') tr.cells[3].textContent = 'Unfinished';
	}
	readiness();
}

function renderRows() {
	$('results').replaceChildren();
	resultCells.clear();
	hasResults = false;
	$('stale').hidden = true;
	for (const row of lineups) {
		const tr = document.createElement('tr');
		const label = document.createElement('td');
		const details = document.createElement('details');
		const summary = document.createElement('summary');
		summary.textContent = 'Difficulty ' + (row.difficulty + 1);
		details.append(summary);
		if (row.pets) {
			const list = document.createElement('div');
			list.className = 'pets enemy-pets';
			const groups = new Map();
			for (const pet of row.pets) {
				const key = pet.id + ':' + pet.enhanced;
				if (groups.has(key)) groups.get(key).count++;
				else groups.set(key, { pet, count: 1 });
			}
			for (const { pet, count } of groups.values()) list.append(petTile(pet, count));
			details.append(list);
		}
		label.append(details);
		tr.append(label);
		const labels = ['Enemy pets', 'Pet Power', 'Estimated win chance', '95% interval', 'Survivors per win'];
		for (const [index, text] of [
			row.pets ? number(row.pets.length) : '-',
			row.pets ? number(row.pets.reduce((sum, pet) => sum + pet.power, 0)) : '-',
			row.error || 'Not run', '-', '-'
		].entries()) {
			const td = document.createElement('td');
			td.textContent = text;
			td.dataset.label = labels[index];
			tr.append(td);
		}
		if (row.error) tr.cells[3].className = 'error';
		$('results').append(tr);
		resultCells.set(row.difficulty, tr);
	}
}

$('run').addEventListener('click', () => {
	stop();
	const id = revision;
	const trials = Number($('trials').value);
	try {
		const seed = crypto.getRandomValues(new Uint32Array(1))[0];
		const current = new Worker(new URL('../workers/pet-raid-worker.js?v=pet-raid-2', import.meta.url), { type: 'module' });
		worker = current;
		for (const row of lineups.filter(row => row.pets)) {
			const tr = resultCells.get(row.difficulty);
			for (let i = 3; i < 6; i++) tr.cells[i].textContent = i === 3 ? 'Pending' : '-';
			delete tr.cells[3].dataset.probability;
			delete tr.dataset.result;
		}
		hasResults = false;
		$('stale').hidden = true;
		current.onmessage = ({ data }) => {
			if (worker !== current || data.id !== id) return;
			try {
				if (data.type === 'progress') $('progress').value = data.fraction;
				else if (data.type === 'row') {
					const tr = resultCells.get(data.difficulty), r = data.result;
					tr.cells[3].textContent = r.wins === 0 ? 'No wins observed' : r.wins === r.trials ? 'All trials won' : percent(r.chance);
					tr.cells[3].dataset.probability = String(r.chance);
					tr.dataset.result = JSON.stringify(r);
					tr.cells[4].textContent = percent(r.interval[0]) + ' - ' + percent(r.interval[1]);
					tr.cells[5].textContent = r.survivorsOnWin === null ? '-' : number(r.survivorsOnWin);
					hasResults = true;
					status('Measured ' + number(r.trials) + ' trials per completed difficulty.');
				} else if (data.type === 'done') {
					stop();
					status('Completed ' + number(trials) + ' trials per difficulty.');
				} else if (data.type === 'error') {
					stop();
					status(data.message + ' Completed rows retained.', true);
				}
			} catch (error) {
				stop();
				status('Could not display simulation results: ' + error.message, true);
			}
		};
		current.onerror = event => {
			if (worker !== current) return;
			stop();
			status('Simulation failed: ' + event.message, true);
		};
		current.onmessageerror = () => {
			if (worker !== current) return;
			stop();
			status('Could not receive simulation results.', true);
		};
		$('progress').value = 0;
		$('progress').hidden = false;
		status('Estimating all available difficulties...');
		readiness();
		current.postMessage({ id, ours: roster, rows: lineups, trials, seed });
	} catch (error) {
		stop();
		status(error.message, true);
	}
});

$('cancel').addEventListener('click', () => {
	stop();
	status('Cancelled. Completed rows retained; remaining rows are unfinished.');
});
$('trials').addEventListener('change', () => {
	stop();
	renderRows();
	status('Trial count changed. Recalculate to estimate.');
});

const assets = await loadUiAssets();
$('art-status').hidden = !!assets;
installIconFallback($('main-content'));
$('lineup-status').textContent = 'Fixed lineups / ' + PET_RAID_LINEUP_DATE;
renderRows();
readiness();

initSaveLoader({
	target: '#save-area', auth: true, skipLoad: true,
	onLoad(_save, raw, metadata) {
		const preserve = metadata?.source === 'auto-refresh' && (worker || hasResults);
		if (!preserve) {
			stop();
			renderRows();
		} else {
			$('stale').hidden = false;
		}
		roster = null;
		$('roster').replaceChildren();
		try {
			const parsed = petRaidRoster(raw);
			const fragment = document.createDocumentFragment();
			for (const pet of [...parsed].sort((a, b) => b.power - a.power)) fragment.append(petTile(pet));
			roster = parsed;
			$('collection').className = '';
			$('collection').replaceChildren(collectionSummary(roster));
			if (!roster.length) $('collection').append(document.createTextNode('An empty team cannot win under this model.'));
			$('roster').append(fragment);
			if (!preserve) status('Ready to estimate.');
		} catch (error) {
			roster = null;
			$('collection').textContent = error.message;
			$('collection').className = 'error';
			status('A valid physical companion collection is required.', true);
		}
		readiness();
	}
});
