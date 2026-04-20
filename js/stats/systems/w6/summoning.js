// ===== SUMMONING SYSTEM (W6) =====
// Summoning win bonuses.

import { node, treeResult } from '../../node.js';
import { label } from '../../entity-names.js';
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
import { maxTalentBonus } from '../common/talent.js';

export function computeSummWinBonus(saveData) {
  var bonus = new Array(32).fill(0);
  if (!saveData || !saveData.summonData) return bonus;
  var normalWins = saveData.summonData[1] || [];
  for (var i = 0; i < normalWins.length; i++) {
    var name = normalWins[i];
    if (typeof name !== 'string' || name.startsWith('rift')) continue;
    var entry = SUMMON_NORMAL_BONUS[name];
    if (!entry) continue;
    var bonusIdx = Math.round(entry[0] - 1);
    if (bonusIdx >= 0 && bonusIdx < 32) bonus[bonusIdx] += entry[1];
  }
  var endlessWins = Number(saveData.olaData && saveData.olaData[319]) || 0;
  for (var i = 0; i < endlessWins; i++) {
    var idx = i % 40;
    var type = SUMMON_ENDLESS_TYPE[idx] - 1;
    if (type >= 0 && type < 32) bonus[type] += SUMMON_ENDLESS_VAL[idx];
  }
  return bonus;
}

function _winBonusParts(idx, swb, saveData) {
  var raw = swb[idx] || 0;
  if (raw <= 0) return { val: 0, raw: 0 };
  if (idx === 20 || idx === 22 || idx === 24 || idx === 31) return { val: raw, raw: raw, simple: true };
  var pristine8 = (saveData.ninjaData && saveData.ninjaData[107] && saveData.ninjaData[107][8] === 1) ? 30 : 0;
  var gemItems11 = Number(saveData.gemItemsData && saveData.gemItemsData[11]) || 0;
  var artRarity = Number(saveData.sailingData && saveData.sailingData[3] && saveData.sailingData[3][32]) || 0;
  var artBonus32 = artRarity > 0 ? artifactBase(32) * artRarity : 0;
  var taskVal = Math.min(10, Number(saveData.tasksGlobalData && saveData.tasksGlobalData[2] && saveData.tasksGlobalData[2][5] && saveData.tasksGlobalData[2][5][4]) || 0);
  var wb31 = swb[31] || 0;
  var empBon8 = computeEmperorBon(8, saveData);
  var godshardSet = String(saveData.olaData && saveData.olaData[379] || '').includes('GODSHARD_SET') ? equipSetBonus('GODSHARD_SET') : 0;
  var ach379 = achieveStatus(379, saveData);
  var ach373 = achieveStatus(373, saveData);
  var baseMult = (idx >= 20 && idx <= 33) ? 1 : 3.5;
  var pristineMult = 1 + pristine8 / 100;
  var gemMult = 1 + 10 * gemItems11 / 100;
  var winnerSum = artBonus32 + taskVal + ach379 + ach373 + godshardSet;
  if (idx !== 19) winnerSum += wb31 + empBon8;
  var winnerMult = 1 + winnerSum / 100;
  var val = baseMult * raw * pristineMult * gemMult * winnerMult;
  return {
    val: val, raw: raw, baseMult: baseMult, pristine8: pristine8, pristineMult: pristineMult,
    gemItems11: gemItems11, gemMult: gemMult, artBonus32: artBonus32, artRarity: artRarity,
    taskVal: taskVal, ach379: ach379, ach373: ach373, wb31: wb31, empBon8: empBon8,
    godshardSet: godshardSet, winnerSum: winnerSum, winnerMult: winnerMult, idx: idx,
  };
}

export function computeWinBonus(idx, opts, saveData) {
  var swb = computeSummWinBonus(saveData);
  var p = _winBonusParts(idx, swb, saveData);
  if (opts && opts.noArt32 && p.artBonus32 > 0) {
    var ws = p.winnerSum - p.artBonus32;
    return p.baseMult * p.raw * p.pristineMult * p.gemMult * (1 + ws / 100);
  }
  return p.val;
}

export function computeSummUpgBonus(t, saveData) {
  // Game: SummUpgBonus(t) = SumUpgMoltoz * Summon[0][t] * SummonUPG[t][6]
  var s = saveData;
  var level = Number(s.summonData && s.summonData[0] && s.summonData[0][t]) || 0;
  if (level <= 0) return treeResult(0);
  var perLv = Number(SummonUPG[t] && SummonUPG[t][6]) || 0;
  if (perLv <= 0) return treeResult(0);
  // SumUpgMoltoz: default 1, boosted if gilded (Holes[28])
  var moltoz = 1;
  var moltozChildren = [];
  var gilded = s.holesData && s.holesData[28];
  if (gilded && gilded.indexOf(t) !== -1) {
    moltoz = 2;
    var tal597 = maxTalentBonus(597, -1, s);
    var tal597Add = Math.max(0, tal597 / 100 - 1);
    var bonus78 = 0;
    if (t !== 78) {
      var lv78 = Number(s.summonData[0][78]) || 0;
      var pLv78 = Number(SummonUPG[78] && SummonUPG[78][6]) || 0;
      bonus78 = lv78 * pLv78;
    }
    moltoz += tal597Add + bonus78 / 100;
    moltozChildren.push({ name: 'Gilded Base', val: 2, fmt: 'raw' });
    if (tal597Add > 0) moltozChildren.push({ name: 'Talent 597', val: tal597Add, fmt: 'raw' });
    if (bonus78 > 0) moltozChildren.push({ name: 'Bonus78 (' + bonus78 + '/100)', val: bonus78 / 100, fmt: 'raw' });
  }
  // SumStoneTrialz multiplier
  var stoneEligible = Number(SummonUPG[t] && SummonUPG[t][10]) || 0;
  if (stoneEligible === 1) {
    var stoneType = Number(SummonUPG[t][2]) || 0;
    var kr = s.krBestData;
    var trialVal = kr && kr['SummzTrz' + stoneType] ? Number(kr['SummzTrz' + stoneType]) : 0;
    if (trialVal > 0) {
      moltoz *= (1 + trialVal);
      moltozChildren.push({ name: 'Stone Trial (' + stoneType + ')', val: 1 + trialVal, fmt: 'x' });
    }
  }
  var val = moltoz * level * perLv;
  return treeResult(val, [
    { name: 'Level', val: level, fmt: 'raw' },
    { name: 'Per Level', val: perLv, fmt: 'raw' },
    { name: 'Moltoz Multi', val: moltoz, fmt: 'x', children: moltozChildren.length ? moltozChildren : undefined },
  ]);
}

export var winBonus = {
  resolve: function(id, ctx) {
    var saveData = ctx.saveData;
    var swb = computeSummWinBonus(saveData);
    var p = _winBonusParts(id, swb, saveData);
    if (p.val <= 0) return node(label('Summoning', id), 0, null, { note: 'summoning win ' + id });

    if (p.simple) {
      return node(label('Summoning', id), p.val, [
        node('Win Bonus Raw', p.raw, null, { fmt: 'raw' }),
      ], { fmt: '+', note: 'summoning win ' + id });
    }

    var winnerSumParts = [
      node(label('Artifact', 32), p.artBonus32, null, { fmt: 'raw', note: 'rarity=' + p.artRarity }),
      node('Task Shop', p.taskVal, null, { fmt: 'raw' }),
      node(label('Achievement', 379), p.ach379, null, { fmt: 'raw' }),
      node(label('Achievement', 373), p.ach373, null, { fmt: 'raw' }),
    ];
    if (id !== 19) {
      winnerSumParts.push(node('Win Bonus 31', p.wb31, null, { fmt: 'raw' }));
      winnerSumParts.push(node('Emperor Bon 8', p.empBon8, null, { fmt: 'raw' }));
    }
    winnerSumParts.push(node('Godshard Set', p.godshardSet, null, { fmt: 'raw' }));
    return node(label('Summoning', id), p.val, [
      node('Win Bonus Raw', p.raw, null, { fmt: 'raw' }),
      node('Base Multiplier', p.baseMult, null, { fmt: 'x' }),
      node(label('Pristine', 8), p.pristineMult, null, { fmt: 'x', note: p.pristine8 > 0 ? 'Equipped' : 'Not equipped' }),
      node('Gem Shop Bonus', p.gemMult, null, { fmt: 'x', note: 'items=' + p.gemItems11 }),
      node('Winner Multi', p.winnerMult, winnerSumParts, { fmt: 'x' }),
    ], { fmt: '+', note: 'summoning win ' + id });
  },
};
