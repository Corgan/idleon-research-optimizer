// BubbaRoG_Bonuses(idx) — Bubba Restaurant of Gains bonuses
// Game formula:
//   Bubba_RoG_all = 20 * sum(MegafleshOwned(1,3,6,9,11))
//   MegafleshOwned(i) = Bubba[1][8] > i ? (i==11 ? Bubba[1][8]-11 : 1) : 0
//   return max(0, (1 + Bubba_RoG_all/100) * (1+Comp(51)) * Spelunky[33][idx] * ceil((Bubba[1][3] - (idx-1)) / 7))

import { Spelunky } from '../../data/game/customlists.js';
import { companions } from '../common/companions.js';
function megafleshOwned(i, saveData) {
  var b = saveData.bubbaData;
  if (!b || !b[1]) return 0;
  var b18 = Number(b[1][8]) || 0;
  if (b18 <= i) return 0;
  return i === 11 ? b18 - 11 : 1;
}

export function bubbaRoGBonuses(idx, saveData) {
  var b = saveData.bubbaData;
  if (!b || !b[1]) return 0;

  var rogAll = 20 * (megafleshOwned(1, saveData) + megafleshOwned(3, saveData) + megafleshOwned(6, saveData)
    + megafleshOwned(9, saveData) + megafleshOwned(11, saveData));

  var comp51 = 0;
  try { comp51 = companions(51, saveData) || 0; } catch(e) {}

  var baseVal = Number(Spelunky[33] && Spelunky[33][idx]) || 0;
  var b13 = Number(b[1][3]) || 0;
  var levelFactor = Math.ceil((b13 - (idx - 1)) / 7);

  return Math.max(0, (1 + rogAll / 100) * (1 + comp51) * baseVal * levelFactor);
}
