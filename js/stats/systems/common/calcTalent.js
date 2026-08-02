// ===== CALC TALENT MAP =====
// CalcTalentMAP is built during DNSM. It computes the Journeyman's talent bonus
// for talent 42 (skill EXP) and talent 43 (skill efficiency) that applies to all
// characters whose skill level is lower than the Journeyman's.
//
// CalcTalentMAP[42] = array of 9 values (skill EXP bonus per skill slot)
// CalcTalentMAP[43] = array of 9 values (skill efficiency bonus per skill slot)

import { charClassData, fishingToolkitData, fishingToolkitDataAvailable, skillLvData } from '../../../save/data.js';
import { FishToolkitInfo, TalentDescriptions } from '../../data/game/customlists.js';
import { formulaEval } from '../../../formulas.js';
import { maxTalentBonus } from './talent.js';

export function computeCalcTalentMAP(charIdx, saveData) {
  var result = { 42: [0,0,0,0,0,0,0,0,0], 43: [0,0,0,0,0,0,0,0,0] };
  var lv0All = saveData && saveData.lv0AllData;
  if (!lv0All || !charClassData.length) return result;

  // PlayerDATABASE iteration overwrites the candidate, so the last
  // Journeyman-family character in player order owns the cache rows.
  var jmanIdx = -1;
  for (var c = 0; c < charClassData.length; c++) {
    var cls = Number(charClassData[c]) || 0;
    if (cls >= 3 && cls < 6) jmanIdx = c;
  }
  if (jmanIdx < 0 || !lv0All[jmanIdx] || !lv0All[charIdx]) return result;

  var t42 = TalentDescriptions[42] && TalentDescriptions[42][1];
  var t43 = TalentDescriptions[43] && TalentDescriptions[43][1];
  if (!t42 || !t43) return result;

  var jmanSkills = skillLvData[jmanIdx] || {};
  var base42 = formulaEval(String(t42[2]), Number(t42[0]), Number(t42[1]), Number(jmanSkills[42]) || 0);
  var base43 = formulaEval(String(t43[2]), Number(t43[0]), Number(t43[1]), Number(jmanSkills[43]) || 0);

  if (charIdx !== jmanIdx) {
    for (var skillIdx = 0; skillIdx < 9; skillIdx++) {
      if ((Number(lv0All[charIdx][skillIdx + 1]) || 0) < (Number(lv0All[jmanIdx][skillIdx + 1]) || 0)) {
        result[42][skillIdx] = base42;
        result[43][skillIdx] = base43;
      }
    }
    return result;
  }

  var enhancementTalent = maxTalentBonus(49, charIdx, saveData);
  var enhance42 = enhancementTalent >= 25;
  var enhance43 = enhancementTalent >= 175;
  for (var selfSkillIdx = 0; selfSkillIdx < 9; selfSkillIdx++) {
    if (enhance42) result[42][selfSkillIdx] = 2 * base42;
    if (enhance43) result[43][selfSkillIdx] = 2 * base43;
  }
  return result;
}

// computeCalcTalent(talentIdx, skillSlotIdx, charIdx, saveData)
// talentIdx: 42 (EXP) or 43 (efficiency)
// skillSlotIdx: 0-8 (Mining=0, Smithing=1, Choppin=2, Fishing=3, Alchemy=4, Catching=5, ...)
// charIdx: which character to check
export function computeCalcTalent(talentIdx, skillSlotIdx, charIdx, saveData) {
  var row = computeCalcTalentMAP(charIdx, saveData)[talentIdx];
  return row ? Number(row[skillSlotIdx]) || 0 : 0;
}

var FISHING_TOOLKIT_STAT_INDEX = {
  D0: 0,
  D1: 1,
  D2: 2,
  D3: 3,
  EXP: 4,
  SPEED: 5,
  POW: 6,
};

export function computeFishingToolkitStat(statKey, charIdx) {
  var statIdx = FISHING_TOOLKIT_STAT_INDEX[statKey];
  if (statIdx == null || !fishingToolkitDataAvailable[charIdx]) return 0;
  var selected = fishingToolkitData[charIdx] || [0, 0];
  var total = 0;
  for (var toolkitType = 0; toolkitType < 2; toolkitType++) {
    var row = FishToolkitInfo[toolkitType] && FishToolkitInfo[toolkitType][Number(selected[toolkitType]) || 0];
    total += Number(row && row[statIdx + 1]) || 0;
  }
  return total;
}
