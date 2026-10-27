import { MapName, MapDispName, MapAFKtarget, RANDOlist } from '../game/customlists.js';

export const KILLROY_FAMILIES = ['Beginner', 'Warrior', 'Archer', 'Mage'];
export const KILLROY_UPGRADES = [
  { name: 'Time', effect: '+1 second' },
  { name: 'Talent points', effect: 'Unlocks talent-point drops at level 1; +0.05 to their drop factor per level' },
  { name: 'Skulls', effect: '+1% skull drop factor (native cap still applies)' },
  { name: 'Respawns', effect: '+1% extra queued arrivals' },
  { name: 'Dungeon credits', effect: 'Unlocks credit drops at level 1; +0.01 to their drop factor per level' },
  { name: 'Pearls', effect: 'Unlocks pearl drops at level 1; +0.01 to their drop factor per level' },
];

export function killroyRoom(pool, roll) {
  const rooms = RANDOlist[pool];
  const name = rooms[Math.round(roll - Math.floor(roll / rooms.length) * rooms.length)];
  const mapIdx = MapName.indexOf(name);
  if (mapIdx < 0) throw new Error('Unknown Killroy room: ' + name);
  return { mapIdx, mapName: String(MapDispName[mapIdx]).replace(/_/g, ' '), monster: MapAFKtarget[mapIdx] };
}
