// ===== SAVE LOADER - shared raw-JSON → state population =====
// Used by both app.js (web) and cli-sim.js (Node.js CLI).
// Takes a parsed JSON object (it.json or save.json format) and populates
// mutable state via assignState().  Does NOT perform any UI operations.

import {  saveData, assignState  } from '../state.js';
import { assignSaveData, dreamData } from './data.js';
import { parseSaveKey } from './helpers.js';
import { eventShopOwned, buildEventShopArray, superBitType, cloudBonus } from '../game-helpers.js';
import { buildMhqArray } from '../stats/systems/w7/minehead.js';
import { computeLabConnectivity } from '../stats/systems/w4/lab.js';
import { SceneNPCquestOrder } from '../stats/data/game/customlists.js';
import { rogBonusQTY, buildRogArray, computeUniqueSushi } from '../stats/systems/w7/sushi.js';
import { stickerBase } from '../stats/data/w7/research.js';
import { computeMagnifiersOwnedWith, magMaxForLevel, gbWith } from '../sim-math.js';
import { computeTomeScore } from '../stats/systems/w4/tome-score.js';
import { companionBonus } from '../stats/data/common/companions.js';
import resExpDesc from '../stats/defs/research-exp.js';
import afkGainsDesc from '../stats/defs/research-afk-gains.js';
import { buildTree } from '../stats/tree-builder.js';
import { getCatalog } from '../stats/registry.js';

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
  assignState({ mineheadUpgLevels: R[8] ? R[8].slice() : [] });

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
  assignState({ gamingSproutData: parseSaveKey(save, 'GamingSprout') || [] });
  assignState({ ninjaData: parseSaveKey(save, 'Ninja') || [] });
  assignState({ ribbonData: parseSaveKey(save, 'Ribbon') || [] });
  assignState({ mealsData: parseSaveKey(save, 'Meals') || [] });
  const farmCrop = parseSaveKey(save, 'FarmCrop') || {};
  assignState({ farmCropCount: typeof farmCrop === 'object' ? Object.keys(farmCrop).length : 0 });
  assignState({ grimoireData: parseSaveKey(save, 'Grimoire') || [] });
  assignState({ vaultData: parseSaveKey(save, 'UpgVault') || [] });
  assignSaveData({ labData: parseSaveKey(save, 'Lab') || [] });
  assignState({ farmUpgData: parseSaveKey(save, 'FarmUpg') || [] });
  assignState({ holesData: parseSaveKey(save, 'Holes') || [] });
  assignState({ riftData: parseSaveKey(save, 'Rift') || [] });
  assignState({ breedingData: parseSaveKey(save, 'Breeding') || [] });
  assignState({ summonData: parseSaveKey(save, 'Summon') || [] });
  assignState({ arcaneData: parseSaveKey(save, 'Arcane') || [] });
  assignState({ sushiData: parseSaveKey(save, 'Sushi') || [] });
  assignState({ dungUpgData: parseSaveKey(save, 'DungUpg') || [] });
  assignState({ cogOrderData: parseSaveKey(save, 'CogO') || [] });
  assignState({ cogMapData: parseSaveKey(save, 'CogM') || {} });
  assignState({ flagUnlockData: parseSaveKey(save, 'FlagU') || [] });

  // Tome score computation — additional save fields
  assignState({ weeklyBossData: parseSaveKey(save, 'WeeklyBoss') || {} });
  assignState({ refineryData: parseSaveKey(save, 'Refinery') || [] });
  assignState({ boatsData: parseSaveKey(save, 'Boats') || [] });
  assignState({ cookingData: parseSaveKey(save, 'Cooking') || [] });
  assignState({ petsData: parseSaveKey(save, 'Pets') || [] });
  assignState({ petsStoredData: parseSaveKey(save, 'PetsStored') || [] });
  assignState({ captainsData: parseSaveKey(save, 'Captains') || [] });
  assignState({ bubbaData: parseSaveKey(save, 'Bubba') || [] });
  assignState({ currenciesData: parseSaveKey(save, 'CurrenciesOwned') || {} });
  assignState({ deliveryBoxComplete: Number(save.CYDeliveryBoxComplete) || 0 });
  assignState({ deliveryBoxStreak: Number(save.CYDeliveryBoxStreak) || 0 });
  assignState({ deliveryBoxMisc: Number(save.CYDeliveryBoxMisc) || 0 });
  assignState({ familyValuesData: parseSaveKey(save, 'FamilyValuesMap') || {} });
  assignState({ colosseumHighscores: parseSaveKey(save, 'FamValColosseumHighscores') || [] });
  assignState({ minigameHiscores: parseSaveKey(save, 'FamValMinigameHiscores') || [] });
  assignState({ chestOrderData: parseSaveKey(save, 'ChestOrder') || [] });
  assignState({ chestQuantityData: parseSaveKey(save, 'ChestQuantity') || [] });
  assignState({ krBestData: parseSaveKey(save, 'KRbest') || {} });

  // StarSg: stored as a char-by-char object {0:'{',1:'"',...} — reconstruct and parse
  const starSgRaw = save.StarSg;
  if (starSgRaw && typeof starSgRaw === 'object' && !Array.isArray(starSgRaw)) {
    const starSgStr = Object.keys(starSgRaw).sort((a,b) => Number(a) - Number(b)).map(k => starSgRaw[k]).join('');
    try { assignState({ starSignsUnlocked: JSON.parse(starSgStr) }); } catch(e) { assignState({ starSignsUnlocked: {} }); }
  } else if (typeof starSgRaw === 'string') {
    try { assignState({ starSignsUnlocked: JSON.parse(starSgRaw) }); } catch(e) { assignState({ starSignsUnlocked: {} }); }
  }
  // SSprog: array of [name, status] pairs for constellation completion
  assignState({ starSignProgData: parseSaveKey(save, 'SSprog') || [] });
  assignState({ compassData: parseSaveKey(save, 'Compass') || [] });
  assignState({ atomsData: parseSaveKey(save, 'Atoms') || [] });
  assignState({ gemItemsData: parseSaveKey(save, 'GemItemsPurchased') || [] });
  assignState({ achieveRegData: parseSaveKey(save, 'AchieveReg') || [] });
  assignState({ bribeStatusData: parseSaveKey(save, 'BribeStatus') || [] });
  assignState({ cauldronP2WData: parseSaveKey(save, 'CauldronP2W') || [] });
  assignSaveData({ tasksW7Data: parseSaveKey(save, 'TaskZZ5') || [] });
  const tasksGlobal = [];
  for (let tz = 0; tz <= 5; tz++) tasksGlobal.push(parseSaveKey(save, 'TaskZZ' + tz) || []);
  assignState({ tasksGlobalData: tasksGlobal });
  assignSaveData({ dreamData: parseSaveKey(save, 'Dream') || [] });
  assignSaveData({ divinityData: parseSaveKey(save, 'Divinity') || [] });
  const optionsRaw = parseSaveKey(save, 'OptionsListAccount') || olaRaw;
  assignSaveData({ optionsListData: optionsRaw });
  assignState({ guildData: parseSaveKey(save, 'Guild') || [] });
  assignState({ prayOwnedData: parseSaveKey(save, 'PrayOwned') || [] });
  assignState({ shrineData: parseSaveKey(save, 'Shrine') || [] });
  assignState({ saltLickData: parseSaveKey(save, 'SaltLick') || [] });
  assignState({ bundlesData: parseSaveKey(save, 'BundlesReceived') || {} });
  assignState({ farmRankData: parseSaveKey(save, 'FarmRank') || {} });
  assignState({ forgeLvData: parseSaveKey(save, 'ForgeLV') || [] });

  const nChars = raw.charNames ? raw.charNames.length : 10;
  assignSaveData({ numCharacters: nChars });
  assignState({ charNames: raw.charNames || [] });

  // Per-character data
  const lv0All = [], exp0All = [], charClass = [], skillLv = [], skillLvMax = [], playerStuff = [], statueLvAll = [];
  for (let ci = 0; ci < nChars; ci++) {
    lv0All.push(parseSaveKey(save, 'Lv0_' + ci) || []);
    exp0All.push(parseSaveKey(save, 'Exp0_' + ci) || []);
    charClass.push(Number(parseSaveKey(save, 'CharacterClass_' + ci)) || 0);
    skillLv.push(parseSaveKey(save, 'SL_' + ci) || {});
    skillLvMax.push(parseSaveKey(save, 'SM_' + ci) || {});
    playerStuff.push(parseSaveKey(save, 'PlayerStuff_' + ci) || []);
    statueLvAll.push(parseSaveKey(save, 'StatueLevels_' + ci) || []);
  }
  // Statue levels: each char's array is [[level, exp], [level, exp], ...]. Extract level-only flat array from char 0.
  const statueLevels = (statueLvAll[0] || []).map(s => Number(Array.isArray(s) ? s[0] : s) || 0);
  assignState({ statueData: statueLevels });
  assignState({ statueLvAllData: statueLvAll });
  // Statue tiers (Onyx/Zenith): StuG is a JSON array "[3,3,3,...]"
  const stuGRaw = parseSaveKey(save, 'StuG');
  assignState({ statueGData: Array.isArray(stuGRaw) ? stuGRaw : (typeof stuGRaw === 'string' ? JSON.parse(stuGRaw) : []) });
  assignState({ lv0AllData: lv0All });
  assignState({ cyTalentPointsData: parseSaveKey(save, 'CYTalentPoints') || [] });
  assignSaveData({ charClassData: charClass });
  assignSaveData({ skillLvData: skillLv });
  assignSaveData({ skillLvMaxData: skillLvMax });
  assignSaveData({ playerStuffData: playerStuff });
  assignSaveData({ cauldronInfoData: parseSaveKey(save, 'CauldronInfo') || [] });
  assignSaveData({ cauldronBubblesData: parseSaveKey(save, 'CauldronBubbles') || [] });
  assignSaveData({ stampLvData: parseSaveKey(save, 'StampLv') || {} });

  // Per-character star sign strings (plain strings like "69,52,24,", not JSON)
  const starSigns = [];
  for (let ci = 0; ci < nChars; ci++) {
    const key = 'PVtStarSign_' + ci;
    const raw = save[key];
    starSigns.push(typeof raw === 'string' ? raw : String(raw || ''));
  }
  assignSaveData({ starSignData: starSigns });

  const kla = [];
  for (let ci = 0; ci < nChars; ci++) {
    kla.push(parseSaveKey(save, 'KLA_' + ci) || []);
  }
  assignSaveData({ klaData: kla });

  // Per-character equipment (food bags needed for golden food bonuses)
  const equipOrders = [], equipQtys = [], emmAll = [];
  for (let ci = 0; ci < nChars; ci++) {
    equipOrders.push(parseSaveKey(save, 'EquipOrder_' + ci) || []);
    equipQtys.push(parseSaveKey(save, 'EquipQTY_' + ci) || []);
    // Equipment stat maps: EMm0=gear(16 slots), EMm1=tools(8 slots)
    emmAll.push([
      parseSaveKey(save, 'EMm0_' + ci) || {},
      parseSaveKey(save, 'EMm1_' + ci) || {},
    ]);
  }
  assignSaveData({ equipOrderData: equipOrders });
  assignSaveData({ equipQtyData: equipQtys });
  assignSaveData({ emmData: emmAll });

  // Per-character obols + family obols
  const obolNames = [], obolMaps = [];
  for (let ci = 0; ci < nChars; ci++) {
    obolNames.push(parseSaveKey(save, 'ObolEqO0_' + ci) || []);
    obolMaps.push(parseSaveKey(save, 'ObolEqMAP_' + ci) || {});
  }
  assignSaveData({ obolNamesData: obolNames });
  assignSaveData({ obolMapsData: obolMaps });
  assignSaveData({ obolFamilyNames: parseSaveKey(save, 'ObolEqO1') || [] });
  assignSaveData({ obolFamilyMaps: parseSaveKey(save, 'ObolEqMAPz1') || {} });

  // Per-character prayers, post office, card equip, currentMap
  const prayersPerChar = [], postOffice = [], cardEquip = [], csetEq = [], currentMapData = [], buffsActive = [];
  for (let ci = 0; ci < nChars; ci++) {
    prayersPerChar.push(parseSaveKey(save, 'Prayers_' + ci) || []);
    postOffice.push(parseSaveKey(save, 'POu_' + ci) || []);
    cardEquip.push(parseSaveKey(save, 'CardEquip_' + ci) || []);
    csetEq.push(parseSaveKey(save, 'CSetEq_' + ci) || {});
    currentMapData.push(Number(parseSaveKey(save, 'CurrentMap_' + ci)) || 0);
    buffsActive.push(parseSaveKey(save, 'BuffsActive_' + ci) || []);
  }
  assignSaveData({ prayersPerCharData: prayersPerChar });
  assignSaveData({ postOfficeData: postOffice });
  assignSaveData({ cardEquipData: cardEquip });
  assignSaveData({ csetEqData: csetEq });
  assignSaveData({ currentMapData: currentMapData });
  assignSaveData({ buffsActiveData: buffsActive });

  // MapBon — account-wide per-map kill counts (arcane map bonus)
  const mapBonRaw = parseSaveKey(save, 'MapBon');
  const mapBonData = mapBonRaw ? (typeof mapBonRaw === 'string' ? JSON.parse(mapBonRaw) : mapBonRaw) : [];
  assignSaveData({ mapBonData: mapBonData });

  // Companion ownership from it.json
  if (companionRaw && Array.isArray(companionRaw.l)) {
    const ids = new Set();
    for (const entry of companionRaw.l) {
      const id = parseInt(String(entry).split(',')[0]);
      if (!isNaN(id)) ids.add(id);
    }
    assignState({ companionIds: ids });
  }

  // Per-character quest completion
  const questComplete = [];
  for (let ci = 0; ci < nChars; ci++) {
    questComplete.push(parseSaveKey(save, 'QuestComplete_' + ci) || {});
  }
  assignState({ questCompleteData: questComplete });

  if (raw.serverVars?.A_ResXP != null) assignState({ serverVarResXP: Number(raw.serverVars.A_ResXP) || 1.01 });
  if (raw.serverVars?.A_MineHP != null) assignState({ serverVarMineHP: Number(raw.serverVars.A_MineHP) || 1 });
  if (raw.serverVars?.A_MineCost != null) assignState({ serverVarMineCost: Number(raw.serverVars.A_MineCost) || 1 });
  if (raw.serverVars?.voteCategories) assignState({ activeVoteIdx: Number(raw.serverVars.voteCategories[0]) || -1 });

  const timeAwayRaw = parseSaveKey(save, 'TimeAway');
  if (timeAwayRaw) {
    const ta = typeof timeAwayRaw === 'string' ? JSON.parse(timeAwayRaw) : timeAwayRaw;
    if (ta?.GlobalTime) assignSaveData({ saveGlobalTime: Number(ta.GlobalTime) || 0 });
  }

  // Tournament day number (game's internal counter, NOT derived from GlobalTime)
  if (raw.tournament?.global?.T != null) assignSaveData({ tournamentDay: Number(raw.tournament.global.T) || 0 });

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

  assignState({ magMaxPerSlot: magMaxForLevel(rLv) });
  assignState({ cachedEventShopStr: String(olaRaw[311] || '') });
  assignState({ cachedSpelunkyUpg7: spelunkRaw?.[0]?.[7] || 0 });
  assignState({ cachedFailedRolls: Number(optionsRaw[514]) || 0 });
  assignState({ cachedComp0DivOk: (lv0All[0]?.[14] || 0) >= 2 });

  const uniqueSushi = computeUniqueSushi(saveData.sushiData);
  assignState({ cachedUniqueSushi: uniqueSushi });

  // Compute Tome Score from save data instead of stale extraData snapshot.
  // Must be after cachedUniqueSushi (slot 116) and cachedEventShopStr (unlocks).
  assignState({ totalTomePoints: computeTomeScore(saveData) });

  // Sailing artifact 37 bonus (capped at 10) — flat grid PTS
  const sailArt37 = Math.min(10, Math.round(Number(saveData.sailingData?.[3]?.[37]) || 0));
  assignState({ cachedSailingArt37: sailArt37 });

  const _eventShopStr = saveData.cachedEventShopStr;
  const _mineFloor = saveData.stateR7[4] || 0;
  assignState({ magnifiersOwned: computeMagnifiersOwnedWith(saveData.gridLevels, rLv, {
    evShop: buildEventShopArray(_eventShopStr),
    mhq: buildMhqArray(_mineFloor),
    companionHas153: saveData.companionIds.has(153),
    rog: buildRogArray(uniqueSushi),
  }) });

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

  // Compute total unique quests completed (TomeQTY[4])
  let totalQC = 0;
  for (let qi = 0; qi < SceneNPCquestOrder.length; qi++) {
    const qName = SceneNPCquestOrder[qi];
    for (let ci = 0; ci < questComplete.length; ci++) {
      if (questComplete[ci][qName] === 1) { totalQC++; break; }
    }
  }
  assignState({ totalQuestsComplete: totalQC });

  // Compute lab connectivity BFS (needed for MainframeBonus)
  assignState(computeLabConnectivity(saveData));

  recomputeDerivedBonuses();

  assignSaveData({ loadedSaveFormat: raw.data ? 'it.json' : 'save.json' });
}

/** Recompute allBonusMulti, sticker, research-exp, comp52, AFK rate from current saveData. */
export function recomputeDerivedBonuses() {
  const _comp55val = saveData.companionIds.has(55) ? 15 : 0;
  const _comp0val = saveData.companionIds.has(0) && saveData.cachedComp0DivOk && (saveData.gridLevels[173] || 0) > 0 ? 5 : 0;
  const _cbGridAll = cloudBonus(71, saveData.weeklyBossData) + cloudBonus(72, saveData.weeklyBossData) + cloudBonus(76, saveData.weeklyBossData);
  const _rog53 = rogBonusQTY(53, saveData.cachedUniqueSushi);
  assignState({ allBonusMulti: 1 + (_comp55val + _comp0val + _cbGridAll + _rog53) / 100 });

  const stkLv = saveData.research?.[9]?.[1] || 0;
  const stkBase = stickerBase(1) || 5;
  const stkSuperbit62 = 1 + 20 * superBitType(62, saveData.gamingData[12]) / 100;
  assignState({
    cachedStickerFixed: stkSuperbit62 * stkLv * stkBase,
    cachedBoonyCount: saveData.research?.[11]?.length || 0,
    cachedEvShop37: eventShopOwned(37, saveData.cachedEventShopStr),
  });

  const rexp = buildTree(resExpDesc, getCatalog(), { saveData: saveData });
  let _stickerVal = 0;
  if (rexp.children) {
    for (let i = 0; i < rexp.children.length; i++) {
      if (rexp.children[i].name === 'Sticker Bonus') { _stickerVal = rexp.children[i].val; break; }
    }
  }
  // simTotalExpWith adds grid bonuses dynamically (so optimizer sees changes),
  // so extPctExSticker must exclude both sticker AND grids to avoid double-counting.
  const _abmCtx = { abm: saveData.allBonusMulti };
  const _gridAdd =
    gbWith(saveData.gridLevels, saveData.shapeOverlay, 50, _abmCtx) +
    gbWith(saveData.gridLevels, saveData.shapeOverlay, 90, _abmCtx) +
    gbWith(saveData.gridLevels, saveData.shapeOverlay, 110, _abmCtx) +
    gbWith(saveData.gridLevels, saveData.shapeOverlay, 112, _abmCtx) +
    gbWith(saveData.gridLevels, saveData.shapeOverlay, 94, _abmCtx) +
    gbWith(saveData.gridLevels, saveData.shapeOverlay, 31, _abmCtx);
  assignState({
    externalResearchPct: rexp.val,
    cachedExtPctExSticker: rexp.val - _stickerVal - _gridAdd,
    comp52TrueMulti: (1 + (saveData.companionIds.has(52) ? 0.5 : 0)) * (1 + (saveData.companionIds.has(153) ? 1 : 0)),
  });

  // Button_Bonuses(0): presses rotate through 9 slots, slot 0 rate = 2
  // btnBaseNoGrid = button0 value WITHOUT grid 125 contribution (for dynamic recompute in sim)
  var _btnPresses = Number(saveData.olaData[594]) || 0;
  var _btn0 = 0, _btnBase = 0;
  if (_btnPresses > 0) {
    var _c147 = saveData.companionIds.has(147) ? companionBonus(147) : 0;
    var _g125 = gbWith(saveData.gridLevels, saveData.shapeOverlay, 125, { abm: saveData.allBonusMulti });
    var _baseMulti = 1 + _c147 / 100;
    var _btnMULTI = _baseMulti * (1 + _g125 / 100);
    var _slot0Count = Math.floor(_btnPresses / 45) * 5 + Math.min(5, _btnPresses % 45);
    _btnBase = _slot0Count * 2 * _baseMulti;
    _btn0 = _slot0Count * 2 * _btnMULTI;
  }
  assignState({ cachedButtonBonus0: _btn0, cachedBtnBaseNoGrid: _btnBase });

  // KillroyBonuses(5): 1 + OLA[469] / (150 + OLA[469]) * 0.8
  // Game uses (1 + KB(5)/100) in ResearchEXPmulti, so we store the full KB return value
  var _ola469 = Number(saveData.olaData[469]) || 0;
  assignState({ cachedKillroy5: _ola469 > 0 ? 1 + _ola469 / (150 + _ola469) * 0.8 : 0 });

  // Nonstop Studies: DreamUpg[12] → Dream[14] (offset +2). Coeff = 3.
  assignState({ cachedDream14: Number(dreamData[14]) || 0 });

  assignSaveData({ cachedAFKRate: buildTree(afkGainsDesc, getCatalog(), { saveData: saveData }) });
}
