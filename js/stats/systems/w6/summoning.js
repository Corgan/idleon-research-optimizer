// ===== SUMMONING SYSTEM (W6) =====
// Summoning win bonuses.

import { node } from '../../node.js';
import { S } from '../../../state.js';
import {
  ARTIFACT_BASE,
  GODSHARD_SET_BONUS,
  SUMMON_ENDLESS_TYPE,
  SUMMON_ENDLESS_VAL,
  SUMMON_NORMAL_BONUS,
} from '../../../game-data.js';
import { achieveStatus } from '../common/achievement.js';
import { computeEmperorBon } from './emperor.js';

export function computeSummWinBonus() {
  var bonus = new Array(32).fill(0);
  var normalWins = S.summonData[1] || [];
  for (var i = 0; i < normalWins.length; i++) {
    var name = normalWins[i];
    if (typeof name !== 'string' || name.startsWith('rift')) continue;
    var entry = SUMMON_NORMAL_BONUS[name];
    if (!entry) continue;
    var bonusIdx = Math.round(entry[0] - 1);
    if (bonusIdx >= 0 && bonusIdx < 32) bonus[bonusIdx] += entry[1];
  }
  var endlessWins = Number(S.olaData[319]) || 0;
  for (var i = 0; i < endlessWins; i++) {
    var idx = i % 40;
    var type = SUMMON_ENDLESS_TYPE[idx] - 1;
    if (type >= 0 && type < 32) bonus[type] += SUMMON_ENDLESS_VAL[idx];
  }
  return bonus;
}

export function computeWinBonus(idx) {
  var swb = computeSummWinBonus();
  if (idx === 20 || idx === 22 || idx === 24 || idx === 31) return swb[idx] || 0;
  var raw = swb[idx] || 0;
  if (raw <= 0) return 0;
  var pristine8 = (S.ninjaData && S.ninjaData[107] && S.ninjaData[107][8] === 1) ? 30 : 0;
  var gemItems11 = Number(S.gemItemsData[11]) || 0;
  var artRarity = Number(S.sailingData && S.sailingData[3] && S.sailingData[3][32]) || 0;
  var artBonus32 = artRarity > 0 ? (ARTIFACT_BASE[32] || 25) * artRarity : 0;
  var taskVal = Math.min(10, Number(S.tasksGlobalData && S.tasksGlobalData[2] && S.tasksGlobalData[2][5] && S.tasksGlobalData[2][5][4]) || 0);
  var wb31 = swb[31] || 0;
  var empBon8 = computeEmperorBon(8);
  var godshardSet = String(S.olaData[379] || '').includes('GODSHARD_SET') ? GODSHARD_SET_BONUS : 0;

  if (idx === 19) {
    return 3.5 * raw
      * (1 + pristine8 / 100)
      * (1 + 10 * gemItems11 / 100)
      * (1 + (artBonus32 + taskVal + achieveStatus(379) + achieveStatus(373) + godshardSet) / 100);
  }
  if (idx >= 20 && idx <= 33) {
    return raw
      * (1 + pristine8 / 100)
      * (1 + 10 * gemItems11 / 100)
      * (1 + (artBonus32 + taskVal + achieveStatus(379) + achieveStatus(373) + wb31 + empBon8 + godshardSet) / 100);
  }
  return 3.5 * raw
    * (1 + pristine8 / 100)
    * (1 + 10 * gemItems11 / 100)
    * (1 + (artBonus32 + taskVal + achieveStatus(379) + achieveStatus(373) + wb31 + empBon8 + godshardSet) / 100);
}

export var winBonus = {
  resolve: function(id, ctx) {
    var swb = computeSummWinBonus();
    var raw = swb[id] || 0;
    if (raw <= 0) return node('Summoning Win ' + id, 0, null, { note: 'summoning win ' + id });

    // Simple types: no multiplier chain
    if (id === 20 || id === 22 || id === 24 || id === 31) {
      return node('Summoning Win ' + id, raw, [
        node('Win Bonus Raw', raw, null, { fmt: 'raw' }),
      ], { fmt: '+', note: 'summoning win ' + id });
    }

    var pristine8 = (S.ninjaData && S.ninjaData[107] && S.ninjaData[107][8] === 1) ? 30 : 0;
    var gemItems11 = Number(S.gemItemsData[11]) || 0;
    var artRarity = Number(S.sailingData && S.sailingData[3] && S.sailingData[3][32]) || 0;
    var artBonus32 = artRarity > 0 ? (ARTIFACT_BASE[32] || 25) * artRarity : 0;
    var taskVal = Math.min(10, Number(S.tasksGlobalData && S.tasksGlobalData[2] && S.tasksGlobalData[2][5] && S.tasksGlobalData[2][5][4]) || 0);
    var wb31 = swb[31] || 0;
    var empBon8 = computeEmperorBon(8);
    var godshardSet = String(S.olaData[379] || '').includes('GODSHARD_SET') ? GODSHARD_SET_BONUS : 0;
    var ach379 = achieveStatus(379);
    var ach373 = achieveStatus(373);

    var baseMult = id === 19 ? 3.5 : 3.5;
    if (id >= 20 && id <= 33) baseMult = 1;
    var pristineMult = 1 + pristine8 / 100;
    var gemMult = 1 + 10 * gemItems11 / 100;

    var winnerSumParts = [
      node('Artifact 32', artBonus32, null, { fmt: 'raw', note: 'rarity=' + artRarity }),
      node('Task Shop', taskVal, null, { fmt: 'raw' }),
      node('Achievement 379', ach379, null, { fmt: 'raw' }),
      node('Achievement 373', ach373, null, { fmt: 'raw' }),
    ];
    var winnerSum = artBonus32 + taskVal + ach379 + ach373;
    if (id !== 19) {
      winnerSumParts.push(node('Win Bonus 31', wb31, null, { fmt: 'raw' }));
      winnerSumParts.push(node('Emperor Bon 8', empBon8, null, { fmt: 'raw' }));
      winnerSum += wb31 + empBon8;
    }
    winnerSumParts.push(node('Godshard Set', godshardSet, null, { fmt: 'raw' }));
    winnerSum += godshardSet;
    var winnerMult = 1 + winnerSum / 100;

    var val = baseMult * raw * pristineMult * gemMult * winnerMult;
    return node('Summoning Win ' + id, val, [
      node('Win Bonus Raw', raw, null, { fmt: 'raw' }),
      node('Base Multiplier', baseMult, null, { fmt: 'x' }),
      node('Pristine 8 Charm', pristineMult, null, { fmt: 'x', note: pristine8 > 0 ? 'Equipped' : 'Not equipped' }),
      node('Gem Shop Bonus', gemMult, null, { fmt: 'x', note: 'items=' + gemItems11 }),
      node('Winner Multi', winnerMult, winnerSumParts, { fmt: 'x' }),
    ], { fmt: '+', note: 'summoning win ' + id });
  },
};
