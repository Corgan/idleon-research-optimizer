// ===== DIVINITY SYSTEM (W5) =====
// God assignment / major bonus checks.

import { saveData } from '../../../state.js';
import { divinityData, optionsListData, numCharacters, cauldronInfoData, cauldronBubblesData } from '../../../save/data.js';
import { godsType } from '../../data/w4/gods.js';
import { GodsInfo } from '../../data/game/customlists.js';
import { bubbleParams } from '../../data/w2/alchemy.js';
import { isBubblePrismad, getPrismaBonusMult } from '../w2/alchemy.js';
import { formulaEval } from '../../../formulas.js';

export function hasBonusMajor(playerIdx, godType) {
  // Companions(0): Ballthezar = all gods, requires divinity lv >= 2
  if (saveData.companionIds.has(0) && (saveData.lv0AllData[0] && saveData.lv0AllData[0][14] || 0) >= 2) return true;
  // Holes PocketDivOwned: cosmic pocket slots
  var hole29 = saveData.holesData && saveData.holesData[11] && saveData.holesData[11][29];
  var hole30 = saveData.holesData && saveData.holesData[11] && saveData.holesData[11][30];
  if (hole29 == null) hole29 = -1;
  if (hole30 == null) hole30 = -1;
  if (hole29 >= 0 && godsType(hole29) === godType) return true;
  if (hole30 >= 0 && godsType(hole30) === godType) return true;
  // W7divChosen
  var w7chosen = optionsListData[425] || 0;
  if (w7chosen > 0) {
    var chosenGodIdx = Math.max(0, w7chosen - 1);
    if (chosenGodIdx >= 0 && godsType(chosenGodIdx) === godType) return true;
  }
  // Research grid 173  type 2 only
  if (godType === 2 && (saveData.gridLevels[173] || 0) >= 1) return true;
  // Normal: player's assigned god from Divinity[playerIdx + 12]
  var assignedGod = divinityData[playerIdx + 12];
  if (assignedGod == null) assignedGod = -1;
  if (assignedGod >= 0 && godsType(assignedGod) === godType) return true;
  return false;
}

// ==================== DIVINITY MINOR ====================
// Divinity("Bonus_Minor", charIdx, style): divine bonus for given god style.

export function computeDivinityMinor(ci, style) {
  var s = saveData;
  var targetGod = -1;
  for (var g = 0; g < GodsInfo.length; g++) {
    if (GodsInfo[g] && Number(GodsInfo[g][13]) === style) { targetGod = g; break; }
  }
  if (targetGod < 0) return 0;
  // Game uses double-indexed base: GodsInfo[GodsInfo[godIdx][13]][3]
  function godBaseForIdx(godIdx) {
    var st = Number(GodsInfo[godIdx] && GodsInfo[godIdx][13]);
    return Number(GodsInfo[st] && GodsInfo[st][3]) || 0;
  }
  var _y2bp = bubbleParams(3, 21);
  var y2Lv = Number(cauldronInfoData && cauldronInfoData[3] && cauldronInfoData[3][21]) || 0;
  var y2Raw = (y2Lv > 0 && _y2bp) ? formulaEval(_y2bp.formula, _y2bp.x1, _y2bp.x2, y2Lv) : 0;
  var y2Prisma = isBubblePrismad(3, 21) ? Math.max(1, getPrismaBonusMult()) : 1;
  var y2Value = y2Raw * y2Prisma;
  var allBub = s.companionIds && s.companionIds.has(4);
  var coralKid3 = Math.round(Number(optionsListData && optionsListData[430]) || 0);

  function divMinorBonus(charIdx, godIdx) {
    var divLv = Number(s.lv0AllData && s.lv0AllData[charIdx] && s.lv0AllData[charIdx][14]) || 0;
    if (divLv <= 0) return 0;
    var y2Active = (allBub || (cauldronBubblesData && (cauldronBubblesData[charIdx] || []).includes('d21'))) ? y2Value : 0;
    return Math.max(1, y2Active) * (1 + coralKid3 / 100) * divLv / (60 + divLv) * godBaseForIdx(godIdx);
  }

  if (style === 3 || style === 5) {
    var total = 0;
    for (var c = 0; c < numCharacters; c++) {
      total += divMinorBonus(c, targetGod);
    }
    return total;
  }
  if (ci < 0) return 0;
  // Universal condition: Companion(0) active → all gods' minor bonuses available
  var hasUniversal = s.companionIds && s.companionIds.has(0);
  if (hasUniversal) {
    return divMinorBonus(ci, targetGod);
  }
  var linkedGod = Number(divinityData && divinityData[ci]) || -1;
  if (linkedGod < 0) return 0;
  var linkedStyle = Number(GodsInfo[linkedGod] && GodsInfo[linkedGod][13]);
  if (linkedStyle !== style) return 0;
  return divMinorBonus(ci, linkedGod);
}

// ==================== DIVINITY MAJOR ====================

export function computeDivinityMajor(ci, style) {
  var s = saveData;
  var targetGod = -1;
  for (var g = 0; g < GodsInfo.length; g++) {
    if (GodsInfo[g] && Number(GodsInfo[g][13]) === style) { targetGod = g; break; }
  }
  if (targetGod < 0) return 0;
  var linkedGod = Number(divinityData && divinityData[ci]) || -1;
  var hasMajor = (linkedGod === targetGod);
  if (s.companionIds && s.companionIds.has(0)) hasMajor = true;
  if (!hasMajor) return 0;
  return Number(GodsInfo[targetGod][12]) || 0;
}

// ==================== DIVINITY BLESS ====================

// Game's Number2Letter alphabet for EmporiumBonus checks
var N2L = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';

export function computeDivinityBless(blessIdx) {
  var blessLv = Number(divinityData && divinityData[28 + blessIdx]) || 0;
  if (blessLv <= 0) return 0;
  var basePerLv = Number(GodsInfo[blessIdx] && GodsInfo[blessIdx][14]) || 0;
  if (basePerLv <= 0) basePerLv = 1;
  // Emporium scaling: 1 + 0.05 * EmporiumBonus(33) * max(0, Divinity[25] - 10)
  // Game: EmporiumBonus(t) = Ninja[102][9].indexOf(Number2Letter[t]) != -1 ? 1 : 0
  var div25 = Number(divinityData && divinityData[25]) || 0;
  var ninjaData = saveData.ninjaData || [];
  var empStr = String(ninjaData[102] && ninjaData[102][9] || '');
  var emp33 = (N2L[33] && empStr.indexOf(N2L[33]) !== -1) ? 1 : 0;
  var empScale = 1 + 0.05 * emp33 * Math.max(0, div25 - 10);
  return blessLv * basePerLv * empScale;
}
