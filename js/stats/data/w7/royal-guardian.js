// ===== ROYAL GUARDIAN STATIC DATA (W7) =====
import { ArmoryUpg, MapDetails, OrbletMarket, Research, RoyalResources, StatueInfo } from '../game/customlists.js';
import { ITEMS } from '../game/items.js';
import { NonAFKscreens, RG_KillReq } from '../game/custommaps.js';

const n = value => Number(value) || 0;
const text = value => String(value ?? '').replace(/_/g, ' ').replace(/\\'/g, "'");

// ArmoryUpg columns: name, max level, cost growth, currency slot, max level,
// bonus per level, research order, and two currently-unused game columns.
// The duplicate max-level-looking column is retained as maxLevelRaw2 until the
// game source exposes a distinct meaning for it.
export const ARMORY_UPGRADES = ArmoryUpg.map((row, index) => ({
  index, name: text(row[0]), baseCost: n(row[1]), costGrowth: n(row[2]),
  currencySlot: n(row[3]), maxLevel: n(row[4]), bonusPerLevel: n(row[5]),
  researchOrder: n(row[6]), metadataA: n(row[7]), metadataB: n(row[8]),
  description: text(row[9]), raw: row.slice(),
}));

// RoyalResources rows are [map x, map y, base capacity, currency slot].
export const ROYAL_RESOURCES = RoyalResources.map((row, index) => ({
  index, x: n(row[0]), y: n(row[1]), baseCapacity: n(row[2]), currencySlot: n(row[3]),
}));

export const ROYAL_MARBLES = Array.from({ length: 7 }, (_, index) => {
  const itemId = `RGshard${index}`;
  return { index, itemId, name: text(ITEMS[itemId]?.displayName) };
});

export const STATUE_FLAIR_MARBLE_CATEGORIES = StatueInfo.map(row => n(row?.[4]));
export const STATUE_FLAIR_SHARDS = STATUE_FLAIR_MARBLE_CATEGORIES.map(String);
export const STATUE_FLAIR_MATERIALS = STATUE_FLAIR_MARBLE_CATEGORIES.map(category => {
  const marble = ROYAL_MARBLES[category];
  return { category, itemId: marble?.itemId, name: marble?.name };
});

export const ORBLET_MARKET = OrbletMarket.map((row, index) => ({
  index, name: text(row[0]), baseCost: n(row[1]), costGrowth: n(row[2]),
  maxLevel: n(row[3]), bonusPerLevel: n(row[4]), metadata: row[5],
  description: text(row[6]), raw: row.slice(),
}));

export const ROYAL_STATUE_DESCRIPTIONS = (Research[40] || []).map(text);
export const ROYAL_STATUES = Array.from({ length: 7 }, (_, index) => ({
  index,
  name: ['Total Damage', 'Drop Rate', 'Extra Kills', 'Class EXP'][index] || `Unreleased Royal Statue ${index + 1}`,
  description: index < 4 ? ROYAL_STATUE_DESCRIPTIONS[index] : 'Effect not defined in current game source.',
}));

export const OUTPOST_RANK_REQUIREMENTS = (Research[41] || []).map(n);
export const OUTPOST_RANK_COSTS = (Research[42] || []).map(n);
export const ARMORY_ORDER = (Research[43] || []).map(n);
export const ROYAL_KILL_REQUIREMENTS = Object.fromEntries(
  Object.entries(RG_KillReq).map(([mapId, requirement]) => [Number(mapId), n(requirement)])
);

export function armoryUpgrade(index) { return ARMORY_UPGRADES[index]; }
export function royalMarble(index) { return ROYAL_MARBLES[Number(index)]; }
export function statueFlairMaterial(statueIdx) { return STATUE_FLAIR_MATERIALS[Number(statueIdx)] || null; }
export function royalResource(index) { return ROYAL_RESOURCES[index]; }
export function orbletUpgrade(index) { return ORBLET_MARKET[index]; }
export function royalStatueInfo(index) { return ROYAL_STATUES[Number(index)] || null; }
export function royalKillRequirement(mapId) { return ROYAL_KILL_REQUIREMENTS[Number(mapId)] || 0; }
export function royalMapBaseKillRequirement(mapId) { return n(MapDetails[Number(mapId)]?.[0]?.[0]); }
export function royalMapEligible(mapId) {
  var idx = Number(mapId);
  return ![120, 216, 306, 41, 39, 43, 8, 9].includes(idx)
    && idx % 50 !== 0
    && !Object.prototype.hasOwnProperty.call(NonAFKscreens, String(idx))
    && n(MapDetails[idx]?.[2]?.[0]) !== 9999;
}
export function royalMapNonAFKScreen(mapId) {
  return Object.prototype.hasOwnProperty.call(NonAFKscreens, String(Number(mapId)));
}
export function royalResourceMapDetails(index) {
  var resource = royalResource(index);
  return resource ? { index: resource.index, position: { x: resource.x, y: resource.y }, capacity: resource.baseCapacity, currencySlot: resource.currencySlot } : null;
}
