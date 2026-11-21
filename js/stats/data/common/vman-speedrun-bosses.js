import { BossDetails } from '../game/customlists.js';

const BOSSES = [
  ['Amarok', 29, null],
  ['Efaunt', 66, null],
  ['Chizoar', 114, null],
  ['Troll', 165, null],
  ['Kattlekruk', 214, null],
  ['Emperor', 266, null],
];

export function vmanBossDefinition(bossId, difficulty) {
  if (!Number.isInteger(bossId) || !BOSSES[bossId]) throw new Error('Unknown Vman world boss.');
  if (!Number.isInteger(difficulty) || difficulty < 0 || difficulty > 2) throw new Error('Unknown boss difficulty.');
  const [name, mapIdx, unavailable] = BOSSES[bossId];
  const door = [[27, 14], [65, 6], [113, 12], [163, 10], [211, 12], [264, 9]][bossId];
  return {
    bossId, name, mapIdx, difficulty, label: ['Normal', 'Chaotic', 'Nightmare'][difficulty],
    hp: Number(BossDetails[bossId][0][difficulty]),
    defence: Number(BossDetails[bossId][1][difficulty]),
    doorMap: door[0], doorNode: door[1],
    entryKeyCost: bossId < 5 ? Number(BossDetails[bossId][3][difficulty]) : null,
    unavailable,
  };
}
