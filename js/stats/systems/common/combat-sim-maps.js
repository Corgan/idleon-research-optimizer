// ===== COMBAT SIM MAP CHOICES (common) =====
import { SCENE_SPAWNS, SCENE_GEOMETRY } from '../../data/game/scenes.js';
import { MONSTERS } from '../../data/game/monsters.js';
import { classifyMap, buildCharacterMapOptions, getCharacterMapEvidence } from './map-access.js';

export const COMBAT_HOLE_MAPS = [
  { id: '216:2', mapIdx: 216, world: 5, holeCavern: 2, target: 'caveA', name: 'The Den (Demon Hounds)' },
  { id: '216:8', mapIdx: 216, world: 5, holeCavern: 8, target: 'caveB', name: 'Grotto (Gloomie Mushrooms)' },
  { id: '216:14', mapIdx: 216, world: 5, holeCavern: 14, target: 'caveC', name: 'Temple (Ancient Golems)' },
  { id: '216:17', mapIdx: 216, world: 5, holeCavern: 17, target: 'caveD', name: 'The Cove (Crystal Glunkos)' },
];

const maps = Object.keys(SCENE_SPAWNS).map(Number).sort((a, b) => a - b).flatMap(mapIdx => {
  const map = classifyMap(mapIdx);
  if (!SCENE_GEOMETRY[mapIdx] || !SCENE_SPAWNS[mapIdx].mobs?.some(m => MONSTERS[m[0]]?.AFKtype === 'FIGHTING')) return [];
  // Feature scenes may retain stale combat actors (e.g. Equinox's old ram).
  if (!['combat', 'map'].includes(map.category) && ![166, 216].includes(mapIdx)) return [];
  return mapIdx === 216 ? COMBAT_HOLE_MAPS : [{ ...map, id: mapIdx }];
});
const byId = new Map(maps.map(map => [String(map.id), map]));

export function combatSimMaps() { return maps.slice(); }
export function combatSimMap(id) { return byId.get(String(id)) || null; }

export function reachableCombatSimMapIds(charIdx, snapshot) {
  const reachable = new Set(buildCharacterMapOptions(charIdx, snapshot, { level: 'all' }).filter(m => !m.locked).map(m => m.mapIdx));
  const holes = snapshot?.saveData?.holesData;
  const hole = getCharacterMapEvidence(charIdx, 216, snapshot);
  return new Set(maps.filter(map => map.holeCavern == null ? reachable.has(map.mapIdx)
    : (hole.accessible || hole.visited || hole.current) &&
      (Number(holes?.[1]?.[0]) > map.holeCavern || Number(holes?.[0]?.[charIdx]) === map.holeCavern)).map(map => map.id));
}
