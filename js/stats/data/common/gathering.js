import { MONSTERS } from '../game/monsters.js';
import { SCENE_SPAWNS } from '../game/scenes.js';
import { MapAFKtarget, MapAFKtargetSide } from '../game/customlists.js';

const SKILLS = { MINING: 'Mining', CHOPPIN: 'Choppin', CATCHING: 'Catching' };

export function gatheringResources() {
  const rows = [], located = new Set();
  for (let map = 0; map < Math.max(MapAFKtarget.length, MapAFKtargetSide.length); map++) {
    const keys = [...(SCENE_SPAWNS[map]?.mobs || []).map(row => row[0]),
      MapAFKtarget[map], ...(MapAFKtargetSide[map] || [])];
    // Equinox's purchased skilling spawns are not ordinary scene-init actors.
    if (map === 120) keys.push('Marble', 'Tree11', 'Bug11');
    for (const key of new Set(keys)) {
      const def = MONSTERS[key], skill = SKILLS[def?.AFKtype];
      if (!skill) continue;
      rows.push({ key, skill, mapIdx: Number(map), name: def.Name.replaceAll('_', ' '),
        equinoxLevel: map === 120 ? ({ Marble: 1, Tree11: 2, Bug11: 4 }[key] || null) : null,
        defence: Number(def.Defence), exp: Number(def.ExpGiven) });
      located.add(key);
    }
  }
  for (const [key, def] of Object.entries(MONSTERS)) {
    if (SKILLS[def.AFKtype] && !located.has(key))
      rows.push({ key, skill: SKILLS[def.AFKtype], mapIdx: null,
        name: def.Name.replaceAll('_', ' '), defence: Number(def.Defence), exp: Number(def.ExpGiven) });
  }
  return rows;
}
