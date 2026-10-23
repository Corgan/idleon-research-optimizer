import { StatueInfo } from '../game/customlists.js';

export const STATUE_COUNT = StatueInfo.length;

export function statueInfo(index) {
  const row = StatueInfo[index];
  if (!row) return null;
  return {
    index,
    name: row[0].replace(/_/g, ' '),
    effect: row[1].replace(/[%@]/g, '').replace(/_/g, ' ').trim(),
    percent: row[1].includes('%'),
    basePerLevel: Number(row[3]),
  };
}
