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
  SUMMON_VICTORY_MOBS,
} from '../../data/w7/summon.js';
import { achieveStatus } from '../common/achievement.js';
import { computeEmperorBon } from './emperor.js';
import { maxTalentBonus } from '../common/talent.js';
import { getSetBonus } from '../w3/setBonus.js';
import { optionsListData } from '../../../save/data.js';
import { createStatContext } from '../../stat-context.js';
import { finalBubbleValByKey, computeVialByKey } from '../w2/alchemy.js';
import { computeLampBonus, computeGambitBonus, computeMonumentROGbonus } from '../w5/hole.js';
import { menagerieBoostQTY } from '../w7/menagerie.js';
import { pristineBon } from '../w5/pristine.js';
import { bonTOT } from '../w5/fountain.js';
import { computeRiftSkillBonus } from '../w4/rift.js';
import { computeMealBonus, computeStatueBonusGiven } from '../common/stats.js';
import { computeMSABonus, computeSlabboBonus } from '../w4/gaming.js';
import { votingBonusz } from '../w2/voting.js';
import { arcadeBonus } from '../w2/arcade.js';
import { vaultUpgBonus } from '../common/vault.js';
import { computeStampBonusOfTypeX } from '../w1/stamp.js';

export function summoningEssencePerHour(S, color, charIdx = 0) {
  if (S.olaData !== optionsListData) S = { ...S, olaData: optionsListData };
  if (!Number.isInteger(color) || color < 0 || color > 7) throw new Error('Choose a valid essence color.');
  if (!Array.isArray(S.summonData?.[0]) || !Array.isArray(S.summonData?.[1]))
    throw new Error('Saved Summoning upgrades or victories are missing.');
  const unlocks = [null, 4, 13, 23, 33, 44, 53];
  if (color > 0 && color < 7 && !(Number(S.summonData[0][unlocks[color]]) >= 1)) return 0;
  if (color === 7) {
    if (S.spelunkData?.[0]?.[4] == null) throw new Error('Saved black-essence lore unlock is missing.');
    if (!(Number(S.spelunkData[0][4]) >= 1)) return 0;
  }
  const level = S.lv0AllData?.[charIdx]?.[18];
  if (level == null || level === '' || !Number.isFinite(Number(level)) || Number(level) < 0)
    throw new Error('Character Summoning level is missing or invalid.');
  const endless = optionsListData[319];
  if (endless == null || endless === '' || !Number.isFinite(Number(endless)) || Number(endless) < 0)
    throw new Error('Saved endless Summoning victories are missing or invalid.');
  const victories = Array(9).fill(0);
  for (const mob of S.summonData[1]) {
    if (typeof mob !== 'string') throw new Error('Saved Summoning victory is invalid.');
    if (mob.startsWith('Pet')) victories[0]++;
    else for (let world = 0; world < SUMMON_VICTORY_MOBS.length; world++) {
      if (SUMMON_VICTORY_MOBS[world].includes(mob)) victories[world + 1]++;
    }
  }
  let total = 0;
  for (const count of victories) total = Math.round(total + count);
  total = Math.round(total + Number(endless));
  const upgrade = id => Number(computeSummUpgBonus(id, S));
  const bubble = key => Number(finalBubbleValByKey(key, charIdx, S));
  const vote = S.activeVoteIdx === 28
    ? createStatContext({ saveData: S, charIdx }).resolve('voting-multi').val : 1;
  if (!S.holesData?.[31]?.[1] || typeof S.holesData[31][1] !== 'object'
      || !S.holesData?.[32]?.[1] || typeof S.holesData[32][1] !== 'object')
    throw new Error('Saved Fountain upgrades for Summoning essence are missing.');
  const common = (1 + computeWinBonus(5, { charIdx, accountOptions: optionsListData }, S) / 100)
    * (1 + computeLampBonus(2, 2, S) / 100)
    * (1 + computeGambitBonus(5, S) / 100)
    * (1 + menagerieBoostQTY(S, 14) / 100)
    * Math.pow(1.4, Number(S.gemItemsData?.[137]) || 0)
    * (1 + pristineBon(12, S) / 100)
    * (1 + bonTOT(S.holesData?.[31] || [], S.holesData?.[32] || [], 1, 17) / 100)
    * (1 + computeMonumentROGbonus(1, 4, S) / 100)
    * (1 + 10 * computeRiftSkillBonus(17, 1, S) / 100)
    * (1 + upgrade(62) * Number(endless) / 100)
    * (1 + (bubble('M10AllCharz') + (computeMealBonus('zSumEss', S, charIdx)
      + (computeMSABonus(8, S) + computeSlabboBonus(5, S)))) / 100)
    * (1 + (5 * achieveStatus(372, S) + 5 * achieveStatus(374, S)) / 100)
    * (1 + votingBonusz(28, vote, S) / 100);
  let rate = 10 * common * (1 + upgrade([65, 66, 67, 30, 40, 52, 58, 80][color]) * Number(level) / 100);
  const colorBubble = { 1: 'A7AllCharz', 2: 'Y7', 4: 'M8AllCharz', 5: 'W9AllCharz' }[color];
  if (colorBubble) rate *= 1 + bubble(colorBubble) / 100;
  rate *= 1 + (color === 0 ? total : victories[color]) * upgrade([0, 11, 18, 27, 38, 46, 54, 73][color]) / 100;
  if (color > 0 && color < 7) rate *= 1 + upgrade(unlocks[color]) / 100;
  if (color === 0) return rate * (1 + (Number(computeVialByKey('6WhiteEss', S, charIdx))
    + (computeStatueBonusGiven(27, charIdx, S) + (arcadeBonus(34, S) + vaultUpgBonus(83, S)))) / 100)
    * (1 + computeStampBonusOfTypeX('WhiteEss', S) / 100);
  return rate * (1 + (color === 7 ? vaultUpgBonus(87, S)
    : computeStampBonusOfTypeX(color < 4 ? '123Ess' : '456Ess', S) + vaultUpgBonus(87, S)) / 100);
}

export function computeSummWinBonus(saveData, accountOptions = saveData?.olaData) {
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
  var endlessWins = Number(accountOptions && accountOptions[319]) || 0;
  for (var i = 0; i < endlessWins; i++) {
    var idx = i % 40;
    var type = SUMMON_ENDLESS_TYPE[idx] - 1;
    if (type >= 0 && type < 32) bonus[type] += SUMMON_ENDLESS_VAL[idx];
  }
  return bonus;
}

function _winBonusParts(idx, swb, saveData, charIdx) {
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
  var godshardSet = Number(getSetBonus('GODSHARD_SET', charIdx));
  var ach379 = achieveStatus(379, saveData);
  var ach373 = achieveStatus(373, saveData);
  var banIBundle = saveData.bundlesData && saveData.bundlesData.ban_i ? 50 : 0;
  var baseMult = (idx >= 20 && idx <= 33) ? 1 : 3.5;
  var pristineMult = 1 + pristine8 / 100;
  var gemMult = 1 + 10 * gemItems11 / 100;
  var winnerSum = artBonus32 + taskVal + ach379 + ach373 + godshardSet + banIBundle;
  if (idx !== 19) winnerSum += wb31 + empBon8;
  var winnerMult = 1 + winnerSum / 100;
  var val = baseMult * raw * pristineMult * gemMult * winnerMult;
  return {
    val: val, raw: raw, baseMult: baseMult, pristine8: pristine8, pristineMult: pristineMult,
    gemItems11: gemItems11, gemMult: gemMult, artBonus32: artBonus32, artRarity: artRarity,
    taskVal: taskVal, ach379: ach379, ach373: ach373, banIBundle: banIBundle, wb31: wb31, empBon8: empBon8,
    godshardSet: godshardSet, winnerSum: winnerSum, winnerMult: winnerMult, idx: idx,
  };
}

export function computeWinBonus(idx, opts, saveData) {
  var swb = computeSummWinBonus(saveData, opts && opts.accountOptions);
  var p = _winBonusParts(idx, swb, saveData, opts && opts.charIdx);
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
    if (tal597Add > 0) moltozChildren.push({ name: label('Talent', 597), val: tal597Add, fmt: 'raw' });
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
    var p = _winBonusParts(id, swb, saveData, ctx.charIdx);
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
