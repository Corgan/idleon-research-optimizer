import { AtomInfo } from '../game/customlists.js';

export function atomUpgrades() {
  return AtomInfo.map((row, index) => ({ index, name: String(row[0]).replaceAll('_', ' ') }));
}
