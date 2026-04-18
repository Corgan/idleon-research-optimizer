// ===== OVERKILL TIER CALCULATION =====
// Computes OverkillStuffs("2") — the raw overkill tier (1-50).
// Requires max damage per character and monster HP for current map.

import { MapAFKtarget } from '../../data/game/customlists.js';
import { MONSTERS } from '../../data/game/monsters.js';
import { currentMapData } from '../../../save/data.js';
import damageDesc from '../../defs/damage.js';
import { buildTree } from '../../tree-builder.js';
import { getCatalog } from '../../registry.js';

/**
 * Compute overkill tier for a character on their current map.
 * Game logic: OverkillStuffs("2")
 *   OverkillEXPONENT = (CurrentMap >= 300) ? 5 : 2
 *   tier = 1; for s=0..49: if maxDmg >= MonsterHP * exp * exp^(s+1) then tier = s+2
 *
 * @param {number} charIdx
 * @param {object} ctx - must include saveData
 * @param {object} [opts] - optional overrides
 * @param {number} [opts.mapIdx] - override map index
 * @param {number} [opts.maxDmg] - override max damage
 * @returns {{ tier: number, maxDmg: number, monsterHP: number, mapIdx: number, exponent: number }}
 */
export function computeOverkillTier(charIdx, ctx, opts) {
  opts = opts || {};
  var mapIdx = opts.mapIdx != null ? opts.mapIdx
    : (currentMapData && currentMapData[charIdx]) || 0;
  var monsterKey = MapAFKtarget[mapIdx];
  var mon = monsterKey && MONSTERS[monsterKey];
  var monsterHP = (mon && mon.MonsterHPTotal) || 0;
  var afkType = mon && mon.AFKtype;

  // Only fighting maps have overkill
  if (afkType !== 'FIGHTING' || monsterHP <= 0) {
    return { tier: 1, maxDmg: 0, monsterHP: 0, mapIdx: mapIdx, exponent: 1 };
  }

  var maxDmg = opts.maxDmg;
  if (maxDmg == null) {
    try {
      var dmgResult = buildTree(damageDesc, getCatalog(), { charIdx: charIdx, saveData: ctx.saveData });
      maxDmg = dmgResult.val || 0;
    } catch(e) {
      maxDmg = 0;
    }
  }

  var okExp = mapIdx >= 300 ? 5 : 2;
  var tier = 1;
  for (var s = 0; s < 50; s++) {
    var threshold = monsterHP * okExp * Math.pow(okExp, s + 1);
    if (maxDmg >= threshold) {
      tier = s + 2;
    } else {
      break;
    }
  }

  return { tier: tier, maxDmg: maxDmg, monsterHP: monsterHP, mapIdx: mapIdx, exponent: okExp };
}
