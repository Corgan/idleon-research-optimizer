import { estimatePetRaid } from '../stats/systems/common/pet-raid.js?v=pet-raid-2';

self.onmessage = ({ data }) => {
	const { id, ours, rows, trials, seed } = data;
	try {
		const available = rows.filter(row => row.pets);
		if (!available.length) throw new Error('No valid raid lineups to estimate.');
		for (let i = 0; i < available.length; i++) {
			const row = available[i];
			const result = estimatePetRaid(ours.map(pet => pet.power), row.pets.map(pet => pet.power), {
				trials, seed,
				onProgress(fraction) {
					self.postMessage({ type: 'progress', id, fraction: (i + fraction) / available.length });
				}
			});
			self.postMessage({ type: 'row', id, difficulty: row.difficulty, result });
		}
		self.postMessage({ type: 'done', id });
	} catch (error) {
		self.postMessage({ type: 'error', id, message: error.message });
	}
};
