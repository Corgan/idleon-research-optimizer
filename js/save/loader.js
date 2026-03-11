// ===== SAVE LOADER - shared raw-JSON → state population =====
// Used by both app.js (web) and cli-sim.js (Node.js CLI).
// Takes a parsed JSON object (it.json or save.json format) and populates
// mutable state via assignState().  Does NOT perform any UI operations.

import { assignState, gridLevels, researchLevel } from '../state.js';
import { assignSaveData } from './data.js';
import { parseSaveKey, eventShopOwned } from './helpers.js';
import { computeExternalBonuses, computeAFKGainsRate, mineheadBonusQTY } from './external.js';
import { computeLabConnectivity } from './lab.js';

function computeMagnifiersOwned() {
  const kaleiOwned = Math.round((gridLevels[72] || 0) + eventShopOwned(33));
  const monoOwned = Math.round(gridLevels[91] || 0);
  const lvBonus = Math.min(1, Math.floor(researchLevel / 10))
    + Math.min(1, Math.floor(researchLevel / 100))
    + Math.min(1, Math.floor(researchLevel / 130))
    + Math.min(1, Math.floor(researchLevel / 140));
  return Math.min(80, Math.round(
    1 + kaleiOwned + monoOwned
    + mineheadBonusQTY(2) + mineheadBonusQTY(12) + mineheadBonusQTY(20)
    + eventShopOwned(34)
    + lvBonus
  ));
}

export function loadSaveData(raw) {
  const save = raw.data ? raw.data : raw;
  const companionRaw = raw.companion;

  const R = typeof save.Research === 'string' ? JSON.parse(save.Research) : save.Research;
  assignState({ research: R });
  assignState({ gridLevels: R[0].slice() });
  assignState({ shapeOverlay: R[1].slice() });
  assignState({ occFound: R[2].slice() });
  assignState({ insightLvs: R[4].slice() });
  assignState({ insightProgress: R[3].slice() });
  assignState({ stateR7: R[7].slice() });

  // Parse additional save data
  const olaRaw = parseSaveKey(save, 'OptLacc') || [];
  assignState({ olaData: olaRaw });
  assignState({ towerData: parseSaveKey(save, 'Tower') || [] });
  const spelunkRaw = parseSaveKey(save, 'Spelunk') || [];
  assignState({ spelunkData: spelunkRaw });
  assignState({ arcadeUpgData: parseSaveKey(save, 'ArcadeUpg') || [] });
  assignState({ cards0Data: parseSaveKey(save, 'Cards0') || {} });
  assignState({ cards1Data: parseSaveKey(save, 'Cards1') || [] });
  assignState({ sailingData: parseSaveKey(save, 'Sailing') || [] });
  assignState({ lv0Data: parseSaveKey(save, 'Lv0_0') || parseSaveKey(save, 'Lv0') || [] });
  assignState({ totemInfoData: parseSaveKey(save, 'TotemInfo') || [] });
  assignState({ gamingData: parseSaveKey(save, 'Gaming') || [] });
  assignState({ ninjaData: parseSaveKey(save, 'Ninja') || [] });
  assignState({ ribbonData: parseSaveKey(save, 'Ribbon') || [] });
  assignState({ mealsData: parseSaveKey(save, 'Meals') || [] });
  const farmCrop = parseSaveKey(save, 'FarmCrop') || {};
  assignState({ farmCropCount: typeof farmCrop === 'object' ? Object.keys(farmCrop).length : 0 });
  assignState({ grimoireData: parseSaveKey(save, 'Grimoire') || [] });
  assignSaveData({ labData: parseSaveKey(save, 'Lab') || [] });
  assignState({ farmUpgData: parseSaveKey(save, 'FarmUpg') || [] });
  assignState({ holesData: parseSaveKey(save, 'Holes') || [] });
  assignState({ riftData: parseSaveKey(save, 'Rift') || [] });
  assignState({ breedingData: parseSaveKey(save, 'Breeding') || [] });
  assignState({ summonData: parseSaveKey(save, 'Summon') || [] });
  assignState({ arcaneData: parseSaveKey(save, 'Arcane') || [] });
  assignState({ gemItemsData: parseSaveKey(save, 'GemItemsPurchased') || [] });
  assignState({ achieveRegData: parseSaveKey(save, 'AchieveReg') || [] });
  assignSaveData({ tasksW7Data: parseSaveKey(save, 'TaskZZ5') || [] });
  const tasksGlobal = [];
  for (let tz = 0; tz <= 5; tz++) tasksGlobal.push(parseSaveKey(save, 'TaskZZ' + tz) || []);
  assignState({ tasksGlobalData: tasksGlobal });
  assignSaveData({ dreamData: parseSaveKey(save, 'Dream') || [] });
  assignSaveData({ divinityData: parseSaveKey(save, 'Divinity') || [] });
  const optionsRaw = parseSaveKey(save, 'OptionsListAccount') || [];
  assignSaveData({ optionsListData: optionsRaw });

  const nChars = raw.charNames ? raw.charNames.length : 10;
  assignSaveData({ numCharacters: nChars });

  // Per-character data
  const lv0All = [], exp0All = [], charClass = [], skillLv = [], playerStuff = [];
  for (let ci = 0; ci < nChars; ci++) {
    lv0All.push(parseSaveKey(save, 'Lv0_' + ci) || []);
    exp0All.push(parseSaveKey(save, 'Exp0_' + ci) || []);
    charClass.push(Number(parseSaveKey(save, 'CharacterClass_' + ci)) || 0);
    skillLv.push(parseSaveKey(save, 'SL_' + ci) || {});
    playerStuff.push(parseSaveKey(save, 'PlayerStuff_' + ci) || []);
  }
  assignState({ lv0AllData: lv0All });
  assignSaveData({ charClassData: charClass });
  assignSaveData({ skillLvData: skillLv });
  assignSaveData({ playerStuffData: playerStuff });
  assignSaveData({ cauldronInfoData: parseSaveKey(save, 'CauldronInfo') || [] });
  assignSaveData({ cauldronBubblesData: parseSaveKey(save, 'CauldronBubbles') || [] });
  const kla = [];
  for (let ci = 0; ci < nChars; ci++) {
    kla.push(parseSaveKey(save, 'KLA_' + ci) || []);
  }
  assignSaveData({ klaData: kla });

  // Companion ownership from it.json
  if (companionRaw && Array.isArray(companionRaw.l)) {
    const ids = new Set();
    for (const entry of companionRaw.l) {
      const id = parseInt(String(entry).split(',')[0]);
      if (!isNaN(id)) ids.add(id);
    }
    assignState({ companionIds: ids });
  }

  if (raw.extraData?.totalTomePoints != null) assignState({ totalTomePoints: raw.extraData.totalTomePoints });
  if (raw.serverVars?.A_ResXP != null) assignState({ serverVarResXP: Number(raw.serverVars.A_ResXP) || 1.01 });

  const timeAwayRaw = parseSaveKey(save, 'TimeAway');
  if (timeAwayRaw) {
    const ta = typeof timeAwayRaw === 'string' ? JSON.parse(timeAwayRaw) : timeAwayRaw;
    if (ta?.GlobalTime) assignSaveData({ saveGlobalTime: Number(ta.GlobalTime) || 0 });
  }

  // Derived state
  const rLv = Math.max(...lv0All.map(lv0 => lv0[20] || 0), 0);
  assignState({ researchLevel: rLv });

  let bestExp = 0;
  for (let ci = 0; ci < lv0All.length; ci++) {
    if ((lv0All[ci][20] || 0) === rLv) {
      bestExp = Math.max(bestExp, Number(exp0All[ci]?.[20]) || 0);
    }
  }
  assignState({ cachedResearchExp: bestExp });

  assignState({ magMaxPerSlot: Math.min(4, Math.round(1 + Math.min(1, Math.floor(rLv / 40)) + Math.min(1, Math.floor(rLv / 70)) + Math.min(1, Math.floor(rLv / 120)))) });
  assignState({ cachedEventShopStr: String(olaRaw[311] || '') });
  assignState({ cachedSpelunkyUpg7: spelunkRaw?.[0]?.[7] || 0 });
  assignState({ cachedFailedRolls: Number(optionsRaw[514]) || 0 });
  assignState({ cachedComp0DivOk: (lv0All[0]?.[14] || 0) >= 2 });

  assignState({ magnifiersOwned: computeMagnifiersOwned() });

  // Parse magnifiers - game iterates ALL of Research[5] without truncation
  const magArr = [];
  for (let i = 0; i < R[5].length; i += 4) {
    magArr.push({ x: R[5][i], y: R[5][i + 1], slot: R[5][i + 2], type: R[5][i + 3] });
  }
  assignState({ magData: magArr });

  // Parse shapes (groups of 4)
  const spArr = [];
  for (let i = 0; i < R[6].length; i += 4) {
    spArr.push({ x: R[6][i], y: R[6][i + 1], rot: R[6][i + 2], unk: R[6][i + 3] });
  }
  assignState({ shapePositions: spArr });

  // Compute lab connectivity BFS (needed for MainframeBonus)
  computeLabConnectivity();

  // Compute external bonuses (also sets cachedStickerFixed, cachedExtPctExSticker, etc.)
  const eb = computeExternalBonuses();
  assignState({ extBonuses: eb });
  assignState({ externalResearchPct: eb._total });
  assignState({ comp52TrueMulti: 1 + (eb._comp52?.val || 0) });
  assignState({ allBonusMulti: eb._allMulti?.val || 1 });
  assignSaveData({ cachedAFKRate: computeAFKGainsRate() });

  assignSaveData({ loadedSaveFormat: raw.data ? 'it.json' : 'save.json' });
}
