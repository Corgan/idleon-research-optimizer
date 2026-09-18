// ===== JELLY OPERATOR DATA (W7) =====

import { JellyUPG, Research } from '../game/customlists.js';

export const JELLY_COLS = 18;
export const JELLY_ROWS = 10;
export const JELLY_SIZE = JELLY_COLS * JELLY_ROWS;
export const JELLY_OBSTRUCTION_SLOTS = [61, 62, 63, 64, 79, 80, 81, 82, 97, 98, 99, 100, 115, 116, 117, 118];

export const CELL_NAMES = [
  'Amoeba',
  'Plasmid',
  'Ribosome',
  'Organelle',
  'Immunoid',
  'Virus',
  'Mitochondria',
  'Gigacyst',
  'Unused',
];

export const CELL_BASE_COOLDOWNS = [145, 60, 400, 160, 750, 200, 10, 20, 30].map(value => value * 1.5);
export const CELL_BASE_DAMAGE = [1, 1.2, 12, 6, 20, 1, 2, 4, 1].map(value => value * 5);

const REWARD_TARGETS = {
  0: 'Research EXP', 1: 'Royal Guardian rank EXP and slots', 2: 'Royal Guardian clearing',
  3: 'W1 Royal outpost points', 4: 'Research Grid points', 5: 'Yellow Cooking Mastery points',
  6: 'Royal Guardian talent points', 7: 'Kaleidoscope observation EXP', 8: 'Crystal spawns and Minehead currency',
  9: 'Minehead damage', 10: 'Golden Food bonuses', 11: 'Early Royal Armory costs',
  12: 'Observation maximum roll', 13: 'Purple Cooking Mastery points', 14: 'Drop Rate',
  15: 'W2 Royal outpost points', 16: 'Sneaking stealth', 17: 'Atom Collider unlocks',
  18: 'Sushi upgrade costs', 19: 'Sailing artifact find odds', 20: 'Poppy fish output',
  21: 'Spelunking power', 22: 'Spelunking shop costs', 23: 'Research EXP',
  24: 'Jelly Bloodcell gain', 25: 'Kaleidoscope strength', 26: 'Early Royal Armory costs',
  27: 'Summoning upgrade costs', 28: 'Emperor bonuses', 29: 'Tiny Cog tier chance',
  30: 'Class EXP', 31: 'Spelunking Grand Discovery chance', 32: 'W3 Royal outpost points',
  33: 'Meritocracy bonuses', 34: 'Farming Exotic purchases', 35: 'Royal Intervention mobs',
  36: 'Prisma Bubble effects', 37: 'Total Damage', 38: 'Spelunking power',
  39: 'Poppy fish requirement', 40: 'Parchment drops', 41: 'Royal Support strength',
  42: 'Rat Crown odds', 43: 'W4 Royal outpost points', 44: 'Jelly board plot unlock',
  45: 'Minehead golden tiles', 46: 'Research EXP', 47: 'Spelunking multi-page ore',
  48: 'W5 Royal outpost points', 49: 'Divinity blessing maximum level', 50: 'Exalted Stamp multiplier',
  51: 'Golden Food bonuses', 52: 'W6 Royal outpost points', 53: 'Sneaking symbol chance',
  54: 'Research EXP', 55: 'Burger system', 56: 'Royal Intervention chance',
  57: 'Research Grid points', 58: 'Bubba meat slices', 59: 'Royal Guardian talent points',
  60: 'Ribbon bonuses', 61: 'W7 Royal outpost points', 62: 'Class EXP',
  63: 'Divinity blessing maximum level',
};

export function jellyUpgradeData(id) {
  const row = JellyUPG?.[id];
  if (!row) return null;
  return {
    id,
    name: String(row[0] || '').replace(/_/g, ' '),
    maxLevel: Number(row[1]) || 0,
    costScale: Number(row[2]) || 1,
    perLevel: Number(row[3]) || 0,
    baseCost: Number(row[4]) || 0,
    description: String(row[5] || '').replace(/_/g, ' '),
  };
}

export function jellyUpgradeOrder() {
  return (Research?.[44] || []).map(Number);
}

export function jellyRewardData(index) {
  return {
    index,
    name: String(Research?.[45]?.[index] || '').replace(/_/g, ' '),
    description: String(Research?.[46]?.[index] || '').replace(/_/g, ' '),
    value: Number(Research?.[47]?.[index]) || 0,
  };
}

export function jellyRewards() {
  return (Research?.[45] || []).map((_, index) => jellyRewardData(index));
}

export function jellyRewardBonus(S, index, includeLocked = false) {
  const obstruction = Number(S?.research?.[7]?.[9]) || 0;
  return includeLocked || obstruction > index ? jellyRewardData(index).value : 0;
}

export function jellyRewardTarget(index) {
  return REWARD_TARGETS[index] || 'Account unlock or bonus described by the reward text';
}

export function cellFootprint(type) {
  return String(Research?.[49]?.[type] || '0').split(',').map(Number);
}

export function jellyProjectileData(type) {
  const values = String(Research?.[51]?.[type] || '0,0,0').split(',').map(Number);
  return {
    offsetX: Number.isFinite(values[0]) ? values[0] : 0,
    offsetY: Number.isFinite(values[1]) ? values[1] : 0,
    spread: Number.isFinite(values[2]) ? values[2] : 0,
  };
}

export function jellySlotPlot(plotId) {
  const values = String(Research?.[50]?.[plotId] || '').split(',').map(Number);
  if (values.length !== 3 || values.some(value => !Number.isFinite(value))) return null;
  return { plotId, start: values[0], width: values[1], height: values[2] };
}

export function jellySlotPlots() {
  return (Research?.[50] || []).map((_, plotId) => jellySlotPlot(plotId)).filter(Boolean);
}
