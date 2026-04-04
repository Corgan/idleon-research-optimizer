// ===== DIVINITY SYSTEM (W5) =====
// God assignment / major bonus checks.

import { saveData } from '../../../state.js';
import { divinityData, optionsListData } from '../../../save/data.js';
import { godsType } from '../../data/w4/gods.js';

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
