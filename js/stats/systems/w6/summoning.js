// ===== SUMMONING SYSTEM (W6) =====
// Summoning win bonuses.

import { node } from '../../node.js';
import { label } from '../../entity-names.js';
import { saveData } from '../../../state.js';
import { artifactBase } from '../../data/w5/sailing.js';
import { equipSetBonus } from '../../data/common/equipment.js';
import { SummonUPG } from '../../data/game/customlists.js';
import {
  SUMMON_ENDLESS_TYPE,
  SUMMON_ENDLESS_VAL,
  SUMMON_NORMAL_BONUS,
} from '../../data/w7/summon.js';
import { achieveStatus } from '../common/achievement.js';
import { computeEmperorBon } from './emperor.js';

export function computeSummWinBonus() {
  var bonus = new Array(32).fill(0);
  var normalWins = saveData.summonData[1] || [];
  for (var i = 0; i < normalWins.length; i++) {
    var name = normalWins[i];
    if (typeof name !== 'string' || name.startsWith('rift')) continue;
    var entry = SUMMON_NORMAL_BONUS[name];
    if (!entry) continue;
    var bonusIdx = Math.round(entry[0] - 1);
    if (bonusIdx >= 0 && bonusIdx < 32) bonus[bonusIdx] += entry[1];
  }
  var endlessWins = Number(saveData.olaData[319]) || 0;
  for (var i = 0; i < endlessWins; i++) {
    var idx = i % 40;
    var type = SUMMON_ENDLESS_TYPE[idx] - 1;
    if (type >= 0 && type < 32) bonus[type] += SUMMON_ENDLESS_VAL[idx];
  }
  return bonus;
}

export function computeWinBonus(idx, opts) {
  var swb = computeSummWinBonus();
  if (idx === 20 || idx === 22 || idx === 24 || idx === 31) return swb[idx] || 0;
  var raw = swb[idx] || 0;
  if (raw <= 0) return 0;
  var pristine8 = (saveData.ninjaData && saveData.ninjaData[107] && saveData.ninjaData[107][8] === 1) ? 30 : 0;
  var gemItems11 = Number(saveData.gemItemsData[11]) || 0;
  var artRarity = Number(saveData.sailingData && saveData.sailingData[3] && saveData.sailingData[3][32]) || 0;
  var artBonus32 = (opts && opts.noArt32) ? 0 : (artRarity > 0 ? artifactBase(32) * artRarity : 0);
  var taskVal = Math.min(10, Number(saveData.tasksGlobalData && saveData.tasksGlobalData[2] && saveData.tasksGlobalData[2][5] && saveData.tasksGlobalData[2][5][4]) || 0);
  var wb31 = swb[31] || 0;
  var empBon8 = computeEmperorBon(8);
  var godshardSet = String(saveData.olaData[379] || '').includes('GODSHARD_SET') ? equipSetBonus('GODSHARD_SET') : 0;

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

export function computeSummUpgBonus(t) {
  // Game: SummUpgBonus(t) = SumUpgMoltoz * Summon[0][t] * SummonUPG[t][6]
  var s = saveData;
  var level = Number(s.summonData && s.summonData[0] && s.summonData[0][t]) || 0;
  if (level <= 0) return 0;
  var perLv = Number(SummonUPG[t] && SummonUPG[t][6]) || 0;
  if (perLv <= 0) return 0;
  // SumUpgMoltoz: default 1, boosted if gilded (Holes[28])
  var moltoz = 1;
  var gilded = s.holesData && s.holesData[28];
  if (gilded && gilded.indexOf(t) !== -1) {
    moltoz = 2; // simplified: 2 + ( max(0, getbonus2(1,597,-1)/100 - 1) + SummUpgBonus(78)/100 )
    // Full formula: 2 + max(0, talent597_max/100 - 1) + SummUpgBonus(78)/100
    // For accuracy, add recursive SummUpgBonus(78):
    var bonus78 = 0;
    if (t !== 78) {
      var lv78 = Number(s.summonData[0][78]) || 0;
      var pLv78 = Number(SummonUPG[78] && SummonUPG[78][6]) || 0;
      bonus78 = lv78 * pLv78; // base without moltoz
    }
    moltoz += bonus78 / 100;
    // talent 597 contribution — skip for now (requires talent resolver context)
  }
  // SumStoneTrialz multiplier: if SummonUPG[t][10] == 1 and KRbest has SummzTrz+stoneType
  var stoneEligible = Number(SummonUPG[t] && SummonUPG[t][10]) || 0;
  if (stoneEligible === 1) {
    var stoneType = Number(SummonUPG[t][2]) || 0;
    var kr = s.krBestData;
    var trialVal = kr && kr['SummzTrz' + stoneType] ? Number(kr['SummzTrz' + stoneType]) : 0;
    if (trialVal > 0) moltoz *= (1 + trialVal);
  }
  return moltoz * level * perLv;
}

export var winBonus = {
  resolve: function(id, ctx) {
    var saveData = ctx.saveData;
    var swb = computeSummWinBonus();
    var raw = swb[id] || 0;
    if (raw <= 0) return node(label('Summoning', id), 0, null, { note: 'summoning win ' + id });

    // Simple types: no multiplier chain
    if (id === 20 || id === 22 || id === 24 || id === 31) {
      return node(label('Summoning', id), raw, [
        node('Win Bonus Raw', raw, null, { fmt: 'raw' }),
      ], { fmt: '+', note: 'summoning win ' + id });
    }

    var pristine8 = (saveData.ninjaData && saveData.ninjaData[107] && saveData.ninjaData[107][8] === 1) ? 30 : 0;
    var gemItems11 = Number(saveData.gemItemsData[11]) || 0;
    var artRarity = Number(saveData.sailingData && saveData.sailingData[3] && saveData.sailingData[3][32]) || 0;
    var artBonus32 = artRarity > 0 ? artifactBase(32) * artRarity : 0;
    var taskVal = Math.min(10, Number(saveData.tasksGlobalData && saveData.tasksGlobalData[2] && saveData.tasksGlobalData[2][5] && saveData.tasksGlobalData[2][5][4]) || 0);
    var wb31 = swb[31] || 0;
    var empBon8 = computeEmperorBon(8);
    var godshardSet = String(saveData.olaData[379] || '').includes('GODSHARD_SET') ? equipSetBonus('GODSHARD_SET') : 0;
    var ach379 = achieveStatus(379);
    var ach373 = achieveStatus(373);

    var baseMult = id === 19 ? 3.5 : 3.5;
    if (id >= 20 && id <= 33) baseMult = 1;
    var pristineMult = 1 + pristine8 / 100;
    var gemMult = 1 + 10 * gemItems11 / 100;

    var winnerSumParts = [
      node(label('Artifact', 32), artBonus32, null, { fmt: 'raw', note: 'rarity=' + artRarity }),
      node('Task Shop', taskVal, null, { fmt: 'raw' }),
      node(label('Achievement', 379), ach379, null, { fmt: 'raw' }),
      node(label('Achievement', 373), ach373, null, { fmt: 'raw' }),
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
    return node(label('Summoning', id), val, [
      node('Win Bonus Raw', raw, null, { fmt: 'raw' }),
      node('Base Multiplier', baseMult, null, { fmt: 'x' }),
      node(label('Pristine', 8), pristineMult, null, { fmt: 'x', note: pristine8 > 0 ? 'Equipped' : 'Not equipped' }),
      node('Gem Shop Bonus', gemMult, null, { fmt: 'x', note: 'items=' + gemItems11 }),
      node('Winner Multi', winnerMult, winnerSumParts, { fmt: 'x' }),
    ], { fmt: '+', note: 'summoning win ' + id });
  },
};
