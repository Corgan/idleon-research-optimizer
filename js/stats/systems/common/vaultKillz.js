// VaultKillzTotal — shared computation for vault kill tracking
// Indices 0-3: raw kills on maps [14, 24, 13, 8]
// Indices 4-7: floor(LOG(rawKills)) for those maps
// Index 8: completed tasks
// Index 9: sum of min(100, bubbleLevel)

import { getLOG } from '../../../formulas.js';
import { numCharacters, klaData, cauldronInfoData } from '../../../save/data.js';

var _cache = null;

export function resetVaultKillzCache() { _cache = null; }

export function computeVaultKillzTotal(idx, saveData) {
  if (_cache) return _cache[idx] || 0;
  var s = saveData;
  var result = [];
  var mapIdxs = [14, 24, 13, 8];
  for (var mi = 0; mi < 4; mi++) {
    var mapIdx = mapIdxs[mi];
    var totalKills = 0;
    for (var ci = 0; ci < numCharacters; ci++) {
      var kla = klaData && klaData[ci];
      if (!kla || !kla[mapIdx]) continue;
      var killsLeft = Number(Array.isArray(kla[mapIdx]) ? kla[mapIdx][0] : kla[mapIdx]) || 0;
      totalKills += Math.max(0, -killsLeft);
    }
    result.push(totalKills);
  }
  for (var i = 0; i < 4; i++) {
    result.push(result[i] < 10 ? 0 : Math.floor(getLOG(result[i])));
  }
  var totalTasks = 0;
  var tg = s.tasksGlobalData;
  if (tg && tg[3]) {
    for (var w = 0; w < Math.min(4, tg[3].length); w++) {
      var tasks = tg[3][w];
      if (!tasks) continue;
      for (var t = 0; t < tasks.length; t++) {
        if (Number(tasks[t]) === 1) totalTasks++;
      }
    }
  }
  result.push(totalTasks);
  var totalBubbles = 0;
  for (var c = 0; c < 4; c++) {
    var cauldron = cauldronInfoData && cauldronInfoData[c];
    if (!cauldron) continue;
    for (var b = 0; b < cauldron.length; b++) {
      totalBubbles += Math.min(100, Number(cauldron[b]) || 0);
    }
  }
  result.push(totalBubbles);
  // Indices 10-11: map 101 kills (same pattern as indices 0-3/4-7)
  var map101Kills = 0;
  for (var ci2 = 0; ci2 < numCharacters; ci2++) {
    var kla2 = klaData && klaData[ci2];
    if (!kla2 || !kla2[101]) continue;
    var kl101 = Number(Array.isArray(kla2[101]) ? kla2[101][0] : kla2[101]) || 0;
    map101Kills += Math.max(0, -kl101);
  }
  result.push(map101Kills);
  result.push(map101Kills < 10 ? 0 : Math.floor(getLOG(map101Kills)));
  _cache = result;
  return result[idx] || 0;
}
