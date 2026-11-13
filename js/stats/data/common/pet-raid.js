// Native cached getRaidLineupList snapshot; entries are [species, Pet+, count].
export const PET_RAID_LINEUP_DATE = '2026-11-13';
export const PET_RAID_LINEUPS = Object.freeze([
	[[45, 0, 29]],
	[[45, 0, 19], [45, 1, 6], [39, 0, 26], [39, 1, 5], [37, 1, 3]],
	[[45, 1, 43], [39, 1, 59], [37, 1, 14], [178, 1, 1]],
].map(groups => groups.flatMap(([id, enhanced, count]) => Array(count).fill(id + ',' + enhanced)).join(';')));
