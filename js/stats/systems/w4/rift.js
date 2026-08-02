// ===== RIFT SYSTEM (W4) =====
// Rift skill bonuses, eclipseSkulls, KillroyDMG.

import { numCharacters, klaData } from '../../../save/data.js';
import { DeathNoteMobs, MapAFKtarget, MapDetails } from '../../data/game/customlists.js';

// ==================== DEATH NOTE RANK ====================
// Game: WorkbenchStuff("DeathNoteRank", totalKills, 0)
function deathNoteRank(kills, saveData) {
  if (kills < 25000) return 0;
  if (kills < 100000) return 1;
  if (kills < 250000) return 2;
  if (kills < 500000) return 3;
  if (kills < 1e6) return 4;
  if (kills < 5e6) return 5;
  if (kills < 1e8) return 7;
  var s = saveData;
  var riftLv = Number(s.riftData && s.riftData[0]) || 0;
  if (kills > 1e9 && riftLv >= 20) return 20;
  return 10;
}

// ==================== ECLIPSE SKULLS ====================
// Game: RiftStuff("eclipseSkulls") — counts DN mobs with rank >= 15 across 6 worlds.
// Returns 5 * count.
export function computeEclipseSkulls(saveData) {
  var s = saveData;
  var nChars = numCharacters || (s.lv0AllData ? s.lv0AllData.length : 0);
  if (!klaData || klaData.length === 0 || nChars === 0) return 0;
  var count = 0;
  // Iterate worlds 0-5 (6 world groups, NOT world 7)
  var worldCount = Math.min(6, DeathNoteMobs.length);
  for (var w = 0; w < worldCount; w++) {
    var mobs = DeathNoteMobs[w];
    if (!mobs) continue;
    for (var m = 0; m < mobs.length; m++) {
      var mob = mobs[m];
      var mapIdx = MapAFKtarget.indexOf(mob);
      if (mapIdx < 0) continue;
      var killReq = Number(MapDetails[mapIdx] && MapDetails[mapIdx][0] && MapDetails[mapIdx][0][0]) || 0;
      var totalKills = 0;
      for (var ci = 0; ci < nChars; ci++) {
        var kla = klaData[ci];
        var klaEntry = kla && kla[mapIdx];
        var remaining = Number(Array.isArray(klaEntry) ? klaEntry[0] : klaEntry) || 0;
        totalKills += killReq - remaining;
      }
      if (deathNoteRank(totalKills, saveData) >= 15) count++;
    }
  }
  return 5 * count;
}

// ==================== KILLROY DMG ====================
// Game: RiftStuff("KillroyDMG") — sums best killroy kills, returns floor(pow(total, 0.4))
export function computeKillroyDMG(saveData) {
  var s = saveData;
  var krBest = s.krBestData;
  if (!krBest) return 0;
  var total = 0;
  var worldCount = DeathNoteMobs.length;
  for (var w = 0; w < worldCount; w++) {
    var mobs = DeathNoteMobs[w];
    if (!mobs) continue;
    for (var m = 0; m < mobs.length; m++) {
      total += Number(krBest[mobs[m]]) || 0;
    }
  }
  return Math.floor(Math.pow(total, 0.4));
}

// ==================== RIFT SKILL ETC ====================
// Game: RiftStuff("RiftSkillETC", t)
// For t=0: start=7, loop s=0..17, for non-excluded indices add 5 * RiftSkillBonus(s, 2)
// RiftSkillBonus(s, threshold) = (riftLv >= 15 && skillLvRanks[s] > threshold) ? 1 : 0
// skillLvRanks: sum all players' skill levels for each skill, then rank the total

function computeSkillLvRanks(saveData) {
  var s = saveData;
  var nChars = numCharacters || (s.lv0AllData ? s.lv0AllData.length : 0);
  var ranks = [];
  for (var skill = 0; skill < 24; skill++) {
    var total = 0;
    for (var ci = 0; ci < nChars; ci++) {
      var lv0 = s.lv0AllData && s.lv0AllData[ci];
      total += Number(lv0 && lv0[skill + 1]) || 0;
    }
    // Rank thresholds (from game)
    var rank;
    if (total < 150) rank = 0;
    else if (total < 200) rank = 1;
    else if (total < 300) rank = 2;
    else if (total < 400) rank = 3;
    else if (total < 500) rank = 4;
    else if (total < 750) rank = 5;
    else if (total < 1000) rank = 6;
    else rank = 7;
    ranks.push(rank);
  }
  return ranks;
}

// Game: RiftSkillBonus(skillIdx, threshold)
// Returns 1 when Rift 15 is unlocked and the account-wide skill rank exceeds
// the requested threshold, otherwise 0.
export function computeRiftSkillBonus(skillIdx, threshold, saveData) {
  var riftLv = Number(saveData.riftData && saveData.riftData[0]) || 0;
  if (riftLv < 15) return 0;
  var ranks = computeSkillLvRanks(saveData);
  return (Number(ranks[skillIdx]) || 0) > threshold ? 1 : 0;
}

// Game: RandomEvent("KillroyBonuses", idx, 0)
export function computeKillroyBonus(idx, saveData) {
  var ola = saveData.olaData || [];
  var value;
  if (idx === 0) {
    value = Number(ola[228]) || 0;
    return 1 + value / (300 + value);
  }
  if (idx === 1) {
    value = Number(ola[229]) || 0;
    return 1 + value / (300 + value) * 9;
  }
  if (idx === 2) {
    value = Number(ola[230]) || 0;
    return 1 + value / (300 + value) * 2;
  }
  if (idx === 3) {
    value = Number(ola[467]) || 0;
    return value / (200 + value) * 10;
  }
  if (idx === 4) {
    value = Number(ola[468]) || 0;
    return 1 + value / (200 + value) * 1.3;
  }
  if (idx === 5) {
    value = Number(ola[469]) || 0;
    return 1 + value / (150 + value) * 0.8;
  }
  if (idx === 6) {
    value = Number(ola[470]) || 0;
    return value / (250 + value) * 25;
  }
  if (idx === 7) {
    value = Number(ola[471]) || 0;
    return 1 + value / (200 + value) * 2;
  }
  return 1;
}

export function computeRiftSkillETC(idx, saveData) {
  if (idx < 0 || idx > 4) return 0;

  var ranks = computeSkillLvRanks(saveData);
  var threshold = Math.round(idx + 2);
  var increment = idx === 1 ? 10 : idx === 3 ? 1 : idx === 4 ? 25 : 5;
  var excluded = new Set([0, 2, 3, 5, 6, 8]);
  var result = 7;

  for (var skillIdx = 0; skillIdx < 18; skillIdx++) {
    if (idx !== 1 && idx !== 3 && idx !== 4 && excluded.has(skillIdx)) continue;
    result += increment * computeRiftSkillBonus(skillIdx, threshold, saveData);
  }
  return result;
}
