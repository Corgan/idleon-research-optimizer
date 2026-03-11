// ===== LAB CONNECTIVITY & BFS =====

import {
  achieveRegData,
  arcaneData,
  assignState,
  breedingData,
  companionIds,
  gemItemsData,
  gridLevels,
  grimoireData,
  holesData,
  labBonusConnected,
  labJewelConnected,
  labMainBonusFull,
  lv0AllData,
  mealsData,
  spelunkData,
  tasksGlobalData,
} from './state.js';
import {
  cauldronBubblesData,
  cauldronInfoData,
  charClassData,
  divinityData,
  dreamData,
  labData,
  numCharacters,
  optionsListData,
  playerStuffData,
  skillLvData,
} from './save/data.js';
import {
  ARENA_THRESHOLDS,
  GODS_TYPE,
  JEWEL_DESC,
  LAB_BONUS_BASE,
  LAB_BONUS_DYNAMIC,
} from './game-data.js';
import {
  emporiumBonus,
  labJewelUnlocked,
  ribbonBonusAt,
  superBitType,
} from './save/helpers.js';
import { computeCardLv, computeShinyBonusS, computeWinBonus } from './save/external.js';

export function euclidDist(x1, y1, x2, y2) {
  const dx = Math.abs(x2 - x1), dy = Math.abs(y2 - y1);
  return 0.9604339 * Math.max(dx, dy) + 0.397824735 * Math.min(dx, dy);
}

export function computePetArenaBonus(idx) {
  const waves = optionsListData[89] || 0;
  let tier = 0;
  for (let s = 0; s < 16; s++) {
    if (waves >= ARENA_THRESHOLDS[s]) tier = s + 1;
    else break;
  }
  return tier > idx ? 1 : 0;
}

export function hasBonusMajor(playerIdx, godType) {
  // Companions(0): Ballthezar = all gods, requires divinity lv >= 2
  if (companionIds.has(0) && (lv0AllData[0]?.[14] || 0) >= 2) return true;
  // Holes PocketDivOwned: cosmic pocket slots
  const hole29 = holesData?.[11]?.[29] ?? -1;
  const hole30 = holesData?.[11]?.[30] ?? -1;
  if (hole29 >= 0 && hole29 < GODS_TYPE.length && GODS_TYPE[hole29] === godType) return true;
  if (hole30 >= 0 && hole30 < GODS_TYPE.length && GODS_TYPE[hole30] === godType) return true;
  // W7divChosen
  const w7chosen = optionsListData[425] || 0;
  if (w7chosen > 0) {
    const chosenGodIdx = Math.max(0, w7chosen - 1);
    if (chosenGodIdx < GODS_TYPE.length && GODS_TYPE[chosenGodIdx] === godType) return true;
  }
  // Research grid 173  type 2 only
  if (godType === 2 && (gridLevels[173] || 0) >= 1) return true;
  // Normal: player's assigned god from Divinity[playerIdx + 12]
  const assignedGod = divinityData[playerIdx + 12] ?? -1;
  if (assignedGod >= 0 && assignedGod < GODS_TYPE.length && GODS_TYPE[assignedGod] === godType) return true;
  return false;
}

export function computeBonusLineWidth(playerIdx) {
  const gemSlots = 2 * (gemItemsData[123] || 0);
  if (playerIdx >= gemSlots) return 0;
  return hasBonusMajor(playerIdx, 2) ? 30 : 0;
}

export function computeChip6Count(playerIdx) {
  const chipSlots = labData?.[1 + playerIdx];
  if (!chipSlots) return 0;
  let count = 0;
  for (let s = 0; s < 7; s++) {
    if (chipSlots[s] === 6) count++;
  }
  return count;
}

export function computeCookingMealMulti() {
  const mfb116 = mainframeBonus(116);
  const shinyS20 = computeShinyBonusS(20);
  const winBon26 = computeWinBonus(26);
  return (1 + (mfb116 + shinyS20) / 100) * (1 + winBon26 / 100);
}

export function computeMealBonusPxLine() {
  // PxLine: level * base, NO ribbon, NO cook multi. Meals 11 (Pancakes, base 2) + 25 (Wild_Boar, base 2)
  return (mealsData?.[0]?.[11] || 0) * 2 + (mealsData?.[0]?.[25] || 0) * 2;
}

export function computeMealBonusLinePct() {
  // LinePct: cookMulti * ribbon * level * base. Only meal 40 (Eel, base 1)
  const eelLv = mealsData?.[0]?.[40] || 0;
  if (eelLv <= 0) return 0;
  const cookMulti = computeCookingMealMulti();
  const ribbon = ribbonBonusAt(28 + 40);
  return cookMulti * ribbon * eelLv * 1;
}

export function computeAllTalentLVz(talentLv, slotIdx) {
  // Replicates AllTalentLVz from the game. The argument is the player's talent LEVEL
  // (passed as-is from getbonus2 due to game code design).
  // Banned check: if level value falls in banned range, return 0
  if ((talentLv >= 49 && talentLv <= 59) || talentLv === 149 || talentLv === 374
      || talentLv === 539 || talentLv === 505 || talentLv > 614) return 0;

  // Spelunk super talent: Spelunk[20+slot+12*preset].indexOf(talentLv)
  let spelunkBonus = 0;
  if (slotIdx >= 0) {
    const preset = Number(playerStuffData[slotIdx]?.[1]) || 0;
    const superArr = spelunkData?.[20 + slotIdx + 12 * preset];
    if (Array.isArray(superArr) && superArr.indexOf(talentLv) !== -1) {
      spelunkBonus = Math.round(50 + (Number(spelunkData?.[18]?.[7]) || 0) * 10 + (Number(spelunkData?.[45]?.[5]) || 0));
    }
  }

  // GetTalentNumber(1, 149/374/539): intervalAdd(1, 20, lv) = 1 + floor(lv/20)
  // Uses the "current player" context. We take max across all characters.
  function intervalAddMax(talId) {
    let maxLv = 0;
    for (let ci = 0; ci < numCharacters; ci++) {
      const sl = skillLvData[ci];
      const lv = Number(sl?.[talId] || sl?.[String(talId)]) || 0;
      if (lv > maxLv) maxLv = lv;
    }
    return maxLv > 0 ? 1 + Math.floor(maxLv / 20) : 0;
  }
  const tal149 = intervalAddMax(149);
  const tal374 = intervalAddMax(374);
  const tal539 = intervalAddMax(539);
  const achieve291 = achieveRegData[291] === -1 ? 1 : 0;

  // FamBonusQTYs[68]: ClassFamilyBonuses[34], decay(20, 350, max(0, round(charLv-69)))
  // Only classes whose ReturnClasses chain includes 34 contribute: classes 34, 35.
  let maxMageCharLv = 0;
  for (let ci = 0; ci < numCharacters; ci++) {
    const cls = charClassData[ci];
    if (cls === 34 || cls === 35) {
      const lv = lv0AllData[ci]?.[0] || 0;
      if (lv > maxMageCharLv) maxMageCharLv = lv;
    }
  }
  const famN = Math.max(0, Math.round(maxMageCharLv - 69));
  const famBonus68 = famN > 0 ? 20 * famN / (famN + 350) : 0;

  // Companions(1): Rift Slug = +25 talent levels if owned
  const comp1 = companionIds.has(1) ? 25 : 0;

  // Divinity("Bonus_Minor", currentPlayer, 2): ceil(minorBonus)
  // Minor bonus 2 (Arctis) = max(1,Y2ACTIVE) * (1+CoralKid(3)/100) * divLv/(60+divLv) * 15
  // Y2ACTIVE = bubble Y2 (CauldronInfo[3][21]) active if equipped or Companions(4)
  const y2BubbleLv = Number(cauldronInfoData?.[3]?.[21]) || 0;
  const y2Value = y2BubbleLv > 0 ? 1 + 0.5 * y2BubbleLv / (y2BubbleLv + 60) : 0;
  const allBubblesActive = companionIds.has(4);
  let divMinor = 0;
  const coralKid3 = Number(optionsListData?.[430]) || 0;
  for (let ci = 0; ci < numCharacters; ci++) {
    if (!hasBonusMajor(ci, 2)) continue;
    const divLv = lv0AllData[ci]?.[14] || 0;
    if (divLv <= 0) continue;
    const y2Active = (allBubblesActive || (cauldronBubblesData?.[ci] || []).includes('d21')) ? y2Value : 0;
    const val = Math.max(1, y2Active) * (1 + coralKid3 / 100) * divLv / (60 + divLv) * 15;
    if (val > divMinor) divMinor = val;
  }

  // Dream[12]
  const dream12 = Number(dreamData?.[12]) || 0;

  // 5 * floor((97 + OptionsListAccount[232]) / 100)
  const ola232 = Number(optionsListData?.[232]) || 0;
  const ola232bonus = 5 * Math.floor((97 + ola232) / 100);

  // GrimoireUpgBonus(39) = Grimoire[39] * 1 (no global multi; index 39 is exception)
  const grimoire39 = Number(grimoireData?.[39]) || 0;

  // GetSetBonus("KATTLEKRUK_SET"): +5 if permanently unlocked in OLA[379]
  const kattlekrukSet = String(optionsListData?.[379] || '').split(',').includes('KATTLEKRUK_SET') ? 5 : 0;

  // min(5, ArcaneUpgBonus(57)) = min(5, Arcane[57] * 1)
  const arcane57 = Math.min(5, Number(arcaneData?.[57]) || 0);

  // max(0, floor((Lv0[0] - 500) / 100) * SuperBitType(47))
  // Lv0[0] = current player's level
  const currentPlayerLv = (slotIdx >= 0 ? lv0AllData[slotIdx]?.[0] : 0) || 0;
  const superBit47 = superBitType(47);
  const lvBonusTerm = superBit47 ? Math.max(0, Math.floor((currentPlayerLv - 500) / 100)) : 0;

  return Math.floor(
    spelunkBonus + tal149 + tal374 + tal539 + achieve291
    + Math.floor(famBonus68)
    + comp1
    + Math.ceil(divMinor)
    + dream12
    + ola232bonus
    + grimoire39
    + kattlekrukSet
    + arcane57
    + lvBonusTerm
  );
}

export function computeBubonicPurple(playerIdx) {
  // Find the Bubonic Conjuror / Arcane Cultist (class 36 or 39)
  let bcIdx = -1;
  let bestLv = 0;
  for (let ci = 0; ci < numCharacters; ci++) {
    const cls = charClassData[ci];
    if (cls !== 36 && cls !== 39) continue;
    const sl = skillLvData[ci];
    const lv = Number(sl?.[535] || sl?.['535']) || 0;
    if (lv > bestLv) { bestLv = lv; bcIdx = ci; }
  }
  if (bcIdx < 0 || bestLv <= 0) return 0;
  // Condition: player X pos >= BC X pos
  const playerX = labData?.[0]?.[2 * playerIdx] || 0;
  const bcX = labData?.[0]?.[2 * bcIdx] || 0;
  if (playerX < bcX) return 0;
  // When talent level > 0 and index >= 100: add AllTalentLVz bonus levels
  // Game passes SkillLevels[535] (the level value) to AllTalentLVz
  const allTalent = bestLv > 0 ? computeAllTalentLVz(bestLv, bcIdx) : 0;
  const effectiveLv = bestLv + allTalent;
  // Decay formula: 40 * lv / (lv + 100)
  return 40 * effectiveLv / (effectiveLv + 100);
}

export function computePlayerDist(playerIdx) {
  const labLev = lv0AllData[playerIdx]?.[12] || 0;
  let baseDist = 50 + 2 * labLev;

  // Jewel 5 proximity: x1.25 if unlocked and within 150px
  const px = labData?.[0]?.[2 * playerIdx] || 0;
  const py = labData?.[0]?.[2 * playerIdx + 1] || 0;
  if (labJewelUnlocked(5) && euclidDist(px, py, JEWEL_DESC[5][0], JEWEL_DESC[5][1]) < 150) {
    baseDist *= 1.25;
  }

  // Flat: baseDist + PxLine meals + Crystal3 card
  const mealPx = computeMealBonusPxLine();
  const crystal3Lv = computeCardLv('Crystal3');
  const flat = baseDist + mealPx + Math.min(2 * crystal3Lv, 50);

  // Percent bonuses
  const bubonicPurple = computeBubonicPurple(playerIdx);
  const linePct = computeMealBonusLinePct();
  const chip6Pct = computeChip6Count(playerIdx) * 12; // ChipDesc[6][11] = 12
  const arenaPct = 20 * computePetArenaBonus(13);
  const bonusLW = computeBonusLineWidth(playerIdx);
  const shinyS19 = computeShinyBonusS(19);
  const pctTotal = bubonicPurple + linePct + chip6Pct + arenaPct + bonusLW + shinyS19;

  return Math.floor(flat * (1 + pctTotal / 100));
}

export function buildLabMainBonus() {
  // Base 14 entries always present
  const lmb = LAB_BONUS_BASE.map(e => [...e]);
  // Dynamic entries from NinjaInfo[25-28], require Emporium unlocks
  for (const dyn of LAB_BONUS_DYNAMIC) {
    if (emporiumBonus(dyn[6])) {
      lmb.push([dyn[0], dyn[1], dyn[2], dyn[3], dyn[4], dyn[5]]);
    }
  }
  return lmb;
}

export function computeLabConnectivity() {
  assignState({ labMainBonusFull: buildLabMainBonus() });
  const lmbLen = labMainBonusFull.length;
  const jdLen = JEWEL_DESC.length; // 24
  const totalNodes = 12 + lmbLen + jdLen;

  // Initialize connectivity arrays
  assignState({
    labBonusConnected: new Array(lmbLen).fill(0),
    labJewelConnected: new Array(jdLen).fill(0),
  });

  // Player positions from Lab[0]: pairs of (x, y) for chars 0-11
  const playerPos = [];
  const lab0 = labData?.[0] || [];
  for (let i = 0; i < 12; i++) {
    playerPos.push({ x: lab0[2 * i] || 0, y: lab0[2 * i + 1] || 0 });
  }

  // Determine which players are "in lab":
  const inLab = new Array(12).fill(false);
  for (let i = 0; i < Math.min(12, numCharacters); i++) {
    if (playerPos[i].x > 0 || playerPos[i].y > 0) inLab[i] = true;
  }

  // Per-player distance thresholds (recomputed each pass as MF(116) may change)
  let playerDist = new Array(12).fill(0);

  // Bonus/Gem distance: computed iteratively
  // Game: floor(80*(1+(MF(109)+MF(13))/100) + TaskShopDesc[3][4][11]*Tasks[2][3][4] + Dream[8] + WinBonus(4))
  // TaskShopDesc[3][4][11] = 1, so it's just Tasks[2][3][4]
  const taskShopLabRange = Number(tasksGlobalData?.[2]?.[3]?.[4]) || 0;
  const dreamLabRange = Number(dreamData?.[8]) || 0;
  const winBonus4 = computeWinBonus(4);
  const bonusGemFlat = taskShopLabRange + dreamLabRange + winBonus4;
  let bonusGemDist = 80 + bonusGemFlat;

  // Iterate BFS until connectivity stabilizes (distances depend on which bonuses are connected)
  for (let pass = 0; pass < 10; pass++) {
    // Recompute per-player distances using current connectivity state
    for (let i = 0; i < 12; i++) {
      if (inLab[i]) playerDist[i] = computePlayerDist(i);
    }

    // Reset connectivity for this pass
    const bonusConn = new Array(lmbLen).fill(0);
    const jewelConn = new Array(jdLen).fill(0);
    const connected = []; // list of connected player indices
    const visited = new Set();

    // Phase 1: find first player connected to origin (43, 229)
    for (let n = 0; n < 12; n++) {
      if (!inLab[n]) continue;
      const d = euclidDist(43, 229, playerPos[n].x, playerPos[n].y);
      if (d < playerDist[n]) {
        connected.push(n);
        visited.add(n);
        break;
      }
    }

    // Phase 2: BFS expansion through connected players
    for (let ci = 0; ci < connected.length; ci++) {
      const src = connected[ci];
      const sx = playerPos[src].x;
      const sy = playerPos[src].y;

      for (let dn = 0; dn < totalNodes; dn++) {
        if (visited.has(dn)) continue;

        if (dn < 12) {
          if (!inLab[dn]) continue;
          const d = euclidDist(sx, sy, playerPos[dn].x, playerPos[dn].y);
          if (d < playerDist[dn]) {
            connected.push(dn);
            visited.add(dn);
          }
        } else if (dn < 12 + lmbLen) {
          const bi = dn - 12;
          if (bonusConn[bi]) continue;
          const bx = labMainBonusFull[bi][0];
          const by = labMainBonusFull[bi][1];
          const threshold = (bi === 13 || bi === 8) ? 80 : bonusGemDist;
          const d = euclidDist(sx, sy, bx, by);
          if (d < threshold) {
            bonusConn[bi] = 1;
            visited.add(dn);
          }
        } else {
          const ji = dn - 12 - lmbLen;
          if (jewelConn[ji]) continue;
          if (!labJewelUnlocked(ji)) continue;
          const jx = JEWEL_DESC[ji][0];
          const jy = JEWEL_DESC[ji][1];
          let threshold;
          if (ji === 9 || ji === 19) threshold = 80;
          else if (ji === 21 || ji === 22 || ji === 23) threshold = 100;
          else threshold = bonusGemDist;
          const d = euclidDist(sx, sy, jx, jy);
          if (d < threshold) {
            jewelConn[ji] = 1;
            visited.add(dn);
          }
        }
      }
    }

    // Save results so mainframeBonus() can use current connectivity
    assignState({ labBonusConnected: bonusConn, labJewelConnected: jewelConn });

    // Recompute bonusGemDist using full mainframeBonus chain
    const newDist = Math.floor(80 * (1 + (mainframeBonus(109) + mainframeBonus(13)) / 100)) + bonusGemFlat;
    if (newDist === bonusGemDist && pass > 0) break; // converged
    bonusGemDist = newDist;
  }
}

export function mainframeBonus(e) {
  const lmbLen = labMainBonusFull.length;
  if (e < 100) {
    if (e >= lmbLen) return 0;
    if (!labBonusConnected[e]) return labMainBonusFull[e][3]; // inactive value
    // Connected: return active value with chain bonuses
    const active = labMainBonusFull[e][4];
    if (e === 9) return active + mainframeBonus(113);
    if (e === 0) {
      const totPets = (breedingData?.[1] || []).reduce((s, v) => s + (Number(v) || 0), 0);
      return (active + mainframeBonus(101)) * totPets;
    }
    if (e === 3) return active + mainframeBonus(107);
    if (e === 11) return active + mainframeBonus(117);
    if (e === 13) return active; // Viral_Connection = 50
    if (e === 15) return active + mainframeBonus(118);
    if (e === 17) return active + mainframeBonus(120);
    if (e === 8) return active + mainframeBonus(119) / 100;
    return active;
  }
  // Jewel: e >= 100
  const ji = e - 100;
  if (ji < 0 || ji >= JEWEL_DESC.length) return 0;
  if (!labJewelConnected[ji]) return 0;
  const base = JEWEL_DESC[ji][2];
  if (e === 119) return base; // Pure_Opal_Navette: no MF(8) multiplier
  return base * mainframeBonus(8);
}

