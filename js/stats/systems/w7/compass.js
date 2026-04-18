// ===== COMPASS / SNEAKING SYSTEM (W7) =====
// CompassBonus(idx) and TotalTitanKills from the Windwalker system.

import { CompassUpg } from '../../data/game/customlists.js';

// CompassBonus(idx):
// Game formula from Windwalker("CompassBonus", t):
//   if CompassUpg[t][9] == 1:
//     (1 + (CompassBonus(39) + CompassBonus(80)) / 100) * Compass[0][t] * CompassUpg[t][5]
//   else if t == 45:
//     Compass[0][t] * CompassUpg[t][5] * 2^floor(Compass[0][t]/50)
//   else:
//     Compass[0][t] * CompassUpg[t][5]
export function computeCompassBonus(idx, saveData) {
  var s = saveData;
  var compass0 = s.compassData && s.compassData[0];
  if (!compass0) return 0;
  var level = Number(compass0[idx]) || 0;
  if (level <= 0) return 0;
  var upg = CompassUpg[idx];
  if (!upg) return 0;
  var perLv = Number(upg[5]) || 0;
  var type = Number(upg[9]) || 0;
  if (type === 1) {
    var multi = 1 + (computeCompassBonus(39, saveData) + computeCompassBonus(80, saveData)) / 100;
    return multi * level * perLv;
  }
  if (idx === 45) {
    return level * perLv * Math.pow(2, Math.floor(level / 50));
  }
  return level * perLv;
}

// TotalTitanKills: count entries in Compass[1] that equal 1
export function computeTotalTitanKills(saveData) {
  var s = saveData;
  var compass1 = s.compassData && s.compassData[1];
  if (!compass1) return 0;
  var total = 0;
  for (var i = 0; i < compass1.length; i++) {
    if (compass1[i] === 1) total++;
  }
  return total;
}
