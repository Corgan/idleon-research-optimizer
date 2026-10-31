import { AnvilProductionInfo } from '../game/customlists.js';

export function anvilProducts() {
  return AnvilProductionInfo.map(([key, seconds, level, exp], index) =>
    ({ index, key, seconds: Number(seconds), level: Number(level), exp: Number(exp) }));
}
