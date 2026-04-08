// ===== CALC TALENT MAP =====
// CalcTalentMAP is built during DNSM. It computes the Journeyman's talent bonus
// for talent 42 (skill EXP) and talent 43 (skill efficiency) that applies to all
// characters whose skill level is lower than the Journeyman's.
//
// CalcTalentMAP[42] = array of 9 values (skill EXP bonus per skill slot)
// CalcTalentMAP[43] = array of 9 values (skill efficiency bonus per skill slot)

import { saveData } from '../../../state.js';
import { TalentDescriptions } from '../../data/game/customlists.js';
import { formulaEval } from '../../../formulas.js';

var _cache = null;
var _cacheKey = null;

function buildCalcTalentMAP() {
  // Check if we can use cache (same save data reference)
  if (_cache && _cacheKey === saveData) return _cache;

  var result = { 42: [0,0,0,0,0,0,0,0,0], 43: [0,0,0,0,0,0,0,0,0] };

  var lv0All = saveData.lv0AllData;
  var classAll = saveData.charClassAllData;
  if (!lv0All || !classAll) { _cache = result; _cacheKey = saveData; return result; }

  // Find first Journeyman character (class 3, 4, or 5)
  var jmanIdx = -1;
  for (var c = 0; c < classAll.length; c++) {
    var cls = Number(classAll[c]) || 0;
    if (cls >= 3 && cls < 6) { jmanIdx = c; break; }
  }
  if (jmanIdx < 0) { _cache = result; _cacheKey = saveData; return result; }

  var jmanLv0 = lv0All[jmanIdx];
  if (!jmanLv0) { _cache = result; _cacheKey = saveData; return result; }

  // Talent formula params
  var t42 = TalentDescriptions[42] && TalentDescriptions[42][1];
  var t43 = TalentDescriptions[43] && TalentDescriptions[43][1];
  if (!t42 || !t43) { _cache = result; _cacheKey = saveData; return result; }

  var t42type = String(t42[2]);
  var t42x1 = Number(t42[0]);
  var t42x2 = Number(t42[1]);
  var jmanSk42 = Number(jmanLv0[42]) || 0;

  var t43type = String(t43[2]);
  var t43x1 = Number(t43[0]);
  var t43x2 = Number(t43[1]);
  var jmanSk43 = Number(jmanLv0[43]) || 0;

  // Compute base values from jman's skill levels
  var base42 = formulaEval(t42type, t42x1, t42x2, jmanSk42);
  var base43 = formulaEval(t43type, t43x1, t43x2, jmanSk43);

  // Check if jman IS the current character (self-buff: 2x if TalentEnh)
  // For save-based computation, we check if the jman has the talent enhanced
  // TalentEnh for talent 42/43 means the jman's class is Maestro or higher (class 4+)
  var jmanCls = Number(classAll[jmanIdx]) || 0;
  var isSelfEnhanced = jmanCls >= 4; // Maestro+ can self-enhance

  _cache = result;
  _cacheKey = saveData;
  return result;
}

// computeCalcTalent(talentIdx, skillSlotIdx, charIdx)
// talentIdx: 42 (EXP) or 43 (efficiency)
// skillSlotIdx: 0-8 (Mining=0, Smithing=1, Choppin=2, Fishing=3, Alchemy=4, Catching=5, ...)
// charIdx: which character to check
export function computeCalcTalent(talentIdx, skillSlotIdx, charIdx) {
  var lv0All = saveData.lv0AllData;
  var classAll = saveData.charClassAllData;
  if (!lv0All || !classAll) return 0;

  // Find first Journeyman character (class 3-5)
  var jmanIdx = -1;
  for (var c = 0; c < classAll.length; c++) {
    var cls = Number(classAll[c]) || 0;
    if (cls >= 3 && cls < 6) { jmanIdx = c; break; }
  }
  if (jmanIdx < 0) return 0;

  var jmanLv0 = lv0All[jmanIdx];
  var charLv0 = lv0All[charIdx];
  if (!jmanLv0 || !charLv0) return 0;

  // Check if current char's skill level < journeyman's for this skill slot
  var charSkill = Number(charLv0[skillSlotIdx + 1]) || 0;
  var jmanSkill = Number(jmanLv0[skillSlotIdx + 1]) || 0;
  if (charSkill >= jmanSkill && charIdx !== jmanIdx) return 0;

  // Get talent desc
  var td = TalentDescriptions[talentIdx] && TalentDescriptions[talentIdx][1];
  if (!td) return 0;

  var talentSkillLv = Number(jmanLv0[talentIdx]) || 0;
  var val = formulaEval(String(td[2]), Number(td[0]), Number(td[1]), talentSkillLv);

  // Self-buff: if jman IS the current char, check TalentEnh (2x)
  // TalentEnh is 1 when the character has the talent points invested
  // A Maestro (class 4+) gets 2x if they have the talent enhanced
  if (charIdx === jmanIdx) {
    var jmanCls = Number(classAll[jmanIdx]) || 0;
    if (jmanCls >= 4) val *= 2;
  }

  return val;
}
