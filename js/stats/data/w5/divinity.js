import { GodsInfo, DivStyle } from '../game/customlists.js';

// ===== DIVINITY DATA =====
// GodsInfo[godIdx][3] = x1 parameter for minor linked bonus
export function godMinorX1(godIdx) { return Number(GodsInfo[godIdx]?.[3]) || 0; }

export function divinityStyles() {
  return DivStyle.map((row, index) => ({
    index, name: String(row[0]).replaceAll('_', ' '),
    level: Math.round(5 * index + 5 * Math.floor(index / 4) + 10 * Math.floor(index / 5) + Math.max(0, 15 * (index - 5))),
  }));
}
