// ===== SAVE LOADER - shared raw-JSON → state population =====
// Used by both app.js (web) and cli-sim.js (Node.js CLI).
// Takes a parsed JSON object (it.json or save.json format) and populates
// mutable state via assignState().  Does NOT perform any UI operations.

import {  saveData, assignState  } from '../state.js';
import { assignSaveData, dreamData } from './data.js';
import { parseSaveKey } from './helpers.js';
import { _0x1 as _syncState } from '../ui/rv.js';
import { eventShopOwned, buildEventShopArray, superBitType, cloudBonus } from '../game-helpers.js';
import { buildMhqArray } from '../stats/systems/w7/minehead.js';
import { computeLabConnectivity } from '../stats/systems/w4/lab.js';
import { SceneNPCquestOrder, CompanionDB } from '../stats/data/game/customlists.js';
import { rogBonusQTY, buildRogArray, computeUniqueSushi } from '../stats/systems/w7/sushi.js';
import { stickerBase } from '../stats/data/w7/research.js';
import { computeMagnifiersOwnedWith, magMaxForLevel, gbWith } from '../sim-math.js';
import { computeTomeScore } from '../stats/systems/w4/tome-score.js';
import { companionBonus, companionBonusForSave, companionLevel2 } from '../stats/data/common/companions.js';
import { outpostROGBonus } from '../stats/systems/w7/royal-guardian.js';
import resExpDesc from '../stats/defs/research-exp.js';
import afkGainsDesc from '../stats/defs/research-afk-gains.js';
import { buildTree } from '../stats/tree-builder.js';
import { getCatalog } from '../stats/registry.js';
import { resetVaultKillzCache } from '../stats/systems/common/vaultKillz.js';

function parseRoyalArray(save, key) {
  const parsed = parseSaveKey(save, key);
  if (Array.isArray(parsed)) return parsed;
  if (!parsed || typeof parsed !== 'object') return [];
  const keys = Object.keys(parsed);
  if (!keys.every(k => /^\d+$/.test(k))) return [];
  const result = [];
  for (const k of keys) result[Number(k)] = parsed[k];
  return result;
}

function parseItemPair(save, orderKey, quantityKey) {
  const orderRaw = parseSaveKey(save, orderKey);
  const quantityRaw = parseSaveKey(save, quantityKey);
  const order = Array.isArray(orderRaw) ? orderRaw : [];
  const quantity = Array.isArray(quantityRaw) ? quantityRaw : [];
  return {
    order,
    quantity,
    available: Object.prototype.hasOwnProperty.call(save, orderKey)
      && Object.prototype.hasOwnProperty.call(save, quantityKey)
      && Array.isArray(orderRaw)
      && Array.isArray(quantityRaw)
      && order.length === quantity.length,
  };
}

export function loadSaveData(raw) {
  resetVaultKillzCache();
  const save = raw.data ? raw.data : raw;
  const companionRaw = raw.companion;

  const parsedResearch = typeof save.Research === 'string' ? JSON.parse(save.Research) : save.Research;
  const R = Array.isArray(parsedResearch) ? parsedResearch : [];
  const researchRows = R.map(row => Array.isArray(row) ? row : []);
  assignState({ research: R });
  assignState({ gridLevels: researchRows[0].slice() });
  assignState({ shapeOverlay: researchRows[1].slice() });
  assignState({ occFound: researchRows[2].slice() });
  assignState({ insightLvs: researchRows[4].slice() });
  assignState({ insightProgress: researchRows[3].slice() });
  assignState({ stateR7: researchRows[7].slice(), stateR7Available: Array.isArray(R[7]) });
  assignState({ mineheadUpgLevels: researchRows[8].slice() });

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
  assignState({ sailChestsData: parseSaveKey(save, 'SailChests') || [] });
  assignState({ lv0Data: parseSaveKey(save, 'Lv0_0') || parseSaveKey(save, 'Lv0') || [] });
  assignState({ totemInfoData: parseSaveKey(save, 'TotemInfo') || [] });
  assignState({ gamingData: parseSaveKey(save, 'Gaming') || [] });
  assignState({ gamingSproutData: parseSaveKey(save, 'GamingSprout') || [] });
  assignState({ ninjaData: parseSaveKey(save, 'Ninja') || [] });
  assignState({ ribbonData: parseSaveKey(save, 'Ribbon') || [] });
  assignState({ mealsData: parseSaveKey(save, 'Meals') || [] });
  const farmCrop = parseSaveKey(save, 'FarmCrop') || {};
  assignState({
    farmPlotData: parseSaveKey(save, 'FarmPlot') || [],
    farmCropData: farmCrop,
    farmCropCount: typeof farmCrop === 'object' ? Object.keys(farmCrop).length : 0,
  });
  assignState({ grimoireData: parseSaveKey(save, 'Grimoire') || [] });
  assignState({ vaultData: parseSaveKey(save, 'UpgVault') || [] });
  assignSaveData({ labData: parseSaveKey(save, 'Lab') || [] });
  assignState({ farmUpgData: parseSaveKey(save, 'FarmUpg') || [] });
  assignState({ holesData: parseSaveKey(save, 'Holes') || [] });
  assignState({
    royalGData: parseRoyalArray(save, 'RoyalG'),
    royalMapsData: parseRoyalArray(save, 'RoyalMaps'),
    royalGDataAvailable: Object.prototype.hasOwnProperty.call(save, 'RoyalG'),
    royalMapsDataAvailable: Object.prototype.hasOwnProperty.call(save, 'RoyalMaps'),
    royalDataAvailable: Object.prototype.hasOwnProperty.call(save, 'RoyalG')
      || Object.prototype.hasOwnProperty.call(save, 'RoyalMaps'),
  });
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
  assignState({ cookMasterData: parseSaveKey(save, 'CookMaster') || [] });
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
  assignState({ itemQuantityData: {
    chest: parseItemPair(save, 'ChestOrder', 'ChestQuantity'),
    inventories: [],
  } });
  assignState({ greenStacksData: parseSaveKey(save, 'GreenStacks') || [] });
  assignState({ krBestData: parseSaveKey(save, 'KRbest') || {} });

  // StarSg: stored as a char-by-char object {0:'{',1:'"',...} — reconstruct and parse
  const starSgRaw = save.StarSg;
  if (starSgRaw && typeof starSgRaw === 'object' && !Array.isArray(starSgRaw)) {
    const starSgStr = Object.keys(starSgRaw).sort((a,b) => Number(a) - Number(b)).map(k => starSgRaw[k]).join('');
    try { assignState({ starSignsUnlocked: JSON.parse(starSgStr) }); } catch(e) { assignState({ starSignsUnlocked: {} }); }
  } else if (typeof starSgRaw === 'string') {
    try { assignState({ starSignsUnlocked: JSON.parse(starSgRaw) }); } catch(e) { assignState({ starSignsUnlocked: {} }); }
  } else {
    assignState({ starSignsUnlocked: {} });
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

  let inferredChars = 0;
  for (const key of Object.keys(save)) {
    const match = /^(?:Lv0|Exp0|CharacterClass|SL|SM|PlayerStuff|PVtStarSign|PVFishingToolkit|FoodSlO|AttackLoadout|MaxCarryCap|InventoryOrder|ItemQTY)_(\d+)$/.exec(key);
    if (match) inferredChars = Math.max(inferredChars, Number(match[1]) + 1);
  }
  const loadedNames = Array.isArray(raw.charNames) ? raw.charNames : [];
  const nChars = Math.max(loadedNames.length, inferredChars, 10);
  assignSaveData({ numCharacters: nChars });
  assignState({ charNames: loadedNames });
  _syncState(raw);

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
  const equipOrders = [], equipQtys = [], inventoryOrders = [], itemInventories = [], foodSlotsOwned = [], emmAll = [];
  for (let ci = 0; ci < nChars; ci++) {
    equipOrders.push(parseSaveKey(save, 'EquipOrder_' + ci) || []);
    equipQtys.push(parseSaveKey(save, 'EquipQTY_' + ci) || []);
    const inventoryPair = parseItemPair(save, 'InventoryOrder_' + ci, 'ItemQTY_' + ci);
    inventoryOrders.push(inventoryPair.order);
    itemInventories.push(inventoryPair);
    foodSlotsOwned.push(Number(parseSaveKey(save, 'FoodSlO_' + ci)) || 0);
    // Equipment stat maps: EMm0=gear(16 slots), EMm1=tools(8 slots)
    emmAll.push([
      parseSaveKey(save, 'EMm0_' + ci) || {},
      parseSaveKey(save, 'EMm1_' + ci) || {},
    ]);
  }
  assignSaveData({ equipOrderData: equipOrders });
  assignSaveData({ equipQtyData: equipQtys });
  assignSaveData({ inventoryOrderData: inventoryOrders });
  assignState({ itemQuantityData: {
    chest: saveData.itemQuantityData.chest,
    inventories: itemInventories,
  } });
  assignSaveData({ foodSlotsOwnedData: foodSlotsOwned });
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
  const prayersPerChar = [], postOffice = [], cardEquip = [], csetEq = [], currentMapData = [], currentMapDataAvailable = [], afkTargetData = [], attackLoadoutData = [], attackLoadoutDataAvailable = [], combatAfkInputDataAvailable = [], maxCarryCapData = [], maxCarryCapDataAvailable = [], fishingToolkitData = [], fishingToolkitDataAvailable = [], buffsActive = [];
  for (let ci = 0; ci < nChars; ci++) {
    prayersPerChar.push(parseSaveKey(save, 'Prayers_' + ci) || []);
    postOffice.push(parseSaveKey(save, 'POu_' + ci) || []);
    cardEquip.push(parseSaveKey(save, 'CardEquip_' + ci) || []);
    csetEq.push(parseSaveKey(save, 'CSetEq_' + ci) || {});
    const currentMapKey = 'CurrentMap_' + ci;
    currentMapData.push(Number(parseSaveKey(save, currentMapKey)) || 0);
    currentMapDataAvailable.push(Object.prototype.hasOwnProperty.call(save, currentMapKey));
    afkTargetData.push(String(save['AFKtarget_' + ci] || ''));
    const attackLoadoutKey = 'AttackLoadout_' + ci;
    const attackLoadout = parseSaveKey(save, attackLoadoutKey);
    attackLoadoutData.push(Array.isArray(attackLoadout)
      ? attackLoadout.map(function(row) { return Array.isArray(row) ? row.slice() : []; })
      : []);
    attackLoadoutDataAvailable.push(Object.prototype.hasOwnProperty.call(save, attackLoadoutKey));
    combatAfkInputDataAvailable.push({
      skillLevels: Object.prototype.hasOwnProperty.call(save, 'SL_' + ci),
      equipment: Object.prototype.hasOwnProperty.call(save, 'EquipOrder_' + ci),
      equipmentQty: Object.prototype.hasOwnProperty.call(save, 'EquipQTY_' + ci),
      foodSlots: Object.prototype.hasOwnProperty.call(save, 'FoodSlO_' + ci),
      buffs: Object.prototype.hasOwnProperty.call(save, 'BuffsActive_' + ci),
      postOffice: Object.prototype.hasOwnProperty.call(save, 'POu_' + ci),
    });
    const maxCarryCapKey = 'MaxCarryCap_' + ci;
    const maxCarryCap = parseSaveKey(save, maxCarryCapKey);
    maxCarryCapData.push(maxCarryCap && typeof maxCarryCap === 'object' ? { ...maxCarryCap } : {});
    maxCarryCapDataAvailable.push(Object.prototype.hasOwnProperty.call(save, maxCarryCapKey));
    const toolkitKey = 'PVFishingToolkit_' + ci;
    const toolkit = parseSaveKey(save, toolkitKey);
    fishingToolkitData.push(Array.isArray(toolkit)
      ? [Number(toolkit[0]) || 0, Number(toolkit[1]) || 0]
      : [0, 0]);
    fishingToolkitDataAvailable.push(Object.prototype.hasOwnProperty.call(save, toolkitKey));
    buffsActive.push(parseSaveKey(save, 'BuffsActive_' + ci) || []);
  }
  assignSaveData({ prayersPerCharData: prayersPerChar });
  assignSaveData({ postOfficeData: postOffice });
  assignSaveData({ cardEquipData: cardEquip });
  assignSaveData({ csetEqData: csetEq });
  assignSaveData({ currentMapData: currentMapData });
  assignSaveData({ currentMapDataAvailable: currentMapDataAvailable });
  assignSaveData({ afkTargetData: afkTargetData });
  assignSaveData({ attackLoadoutData: attackLoadoutData });
  assignSaveData({ attackLoadoutDataAvailable: attackLoadoutDataAvailable });
  assignSaveData({ combatAfkInputDataAvailable: combatAfkInputDataAvailable });
  assignSaveData({ maxCarryCapData: maxCarryCapData });
  assignSaveData({ maxCarryCapDataAvailable: maxCarryCapDataAvailable });
  assignSaveData({ fishingToolkitData: fishingToolkitData });
  assignSaveData({ fishingToolkitDataAvailable: fishingToolkitDataAvailable });
  assignSaveData({ buffsActiveData: buffsActive });

  // MapBon — account-wide per-map kill counts (arcane map bonus)
  const mapBonRaw = parseSaveKey(save, 'MapBon');
  const mapBonData = mapBonRaw ? (typeof mapBonRaw === 'string' ? JSON.parse(mapBonRaw) : mapBonRaw) : [];
  assignSaveData({ mapBonData: mapBonData });

  // Companion ownership from it.json plus account-level Pet Bonus Tokens.
  const companionIds = new Set();
  const enhancedCompanionIds = new Set();
  const companionListRaw = companionRaw && companionRaw.l;
  const companionList = Array.isArray(companionListRaw)
    ? companionListRaw
    : companionListRaw && typeof companionListRaw === 'object'
      ? Object.keys(companionListRaw).sort((a, b) => Number(a) - Number(b)).map(key => companionListRaw[key])
      : null;
  const companionDataAvailable = Array.isArray(companionList);
  if (companionDataAvailable) {
    for (const entry of companionList) {
      const fields = String(entry).split(',');
      const id = parseInt(fields[0]);
      if (!isNaN(id)) {
        companionIds.add(id);
        if ((Number(fields[4]) || 0) >= 1) enhancedCompanionIds.add(id);
      }
    }
  }
  const tokenStr = String(olaRaw[606] || '');
  if (tokenStr && tokenStr !== '0') {
    const tokenEntries = tokenStr.split(',');
    for (const entry of tokenEntries) {
      const tokenId = Number(entry);
      if (Number.isInteger(tokenId) && tokenId >= 0 && tokenId < CompanionDB.length) {
        companionIds.add(tokenId);
        continue;
      }
      for (let ci = 0; ci < CompanionDB.length; ci++) {
        if (CompanionDB[ci][0] === entry) { companionIds.add(ci); break; }
      }
    }
  }
  assignState({ companionIds: companionIds, enhancedCompanionIds: enhancedCompanionIds, companionDataAvailable: companionDataAvailable });

  // Per-character quest completion
  const questComplete = [];
  for (let ci = 0; ci < nChars; ci++) {
    questComplete.push(parseSaveKey(save, 'QuestComplete_' + ci) || {});
  }
  assignState({ questCompleteData: questComplete });

  assignState({
    serverVarResXP: raw.serverVars?.A_ResXP != null ? Number(raw.serverVars.A_ResXP) || 1.01 : 1.01,
    serverVarMineHP: raw.serverVars?.A_MineHP != null ? Number(raw.serverVars.A_MineHP) || 1 : 1,
    serverVarMineCost: raw.serverVars?.A_MineCost != null ? Number(raw.serverVars.A_MineCost) || 1 : 1,
    serverVarDivCostAfter3: raw.serverVars?.DivCostAfter3 != null ? Number(raw.serverVars.DivCostAfter3) || 0 : 0,
    serverVarDivCostAfter3Available: raw.serverVars?.DivCostAfter3 != null && Number.isFinite(Number(raw.serverVars.DivCostAfter3)),
  });
  const activeVoteRaw = raw.serverVars?.voteCategories?.[0];
  const activeVote = Number(activeVoteRaw);
  assignState({
    activeVoteIdx: activeVoteRaw == null || !Number.isFinite(activeVote) ? -1 : activeVote,
    activeVoteDataAvailable: activeVoteRaw != null && Number.isFinite(activeVote),
  });

  const timeAwayRaw = parseSaveKey(save, 'TimeAway');
  if (timeAwayRaw) {
    const ta = typeof timeAwayRaw === 'string' ? JSON.parse(timeAwayRaw) : timeAwayRaw;
    assignState({ timeAwayData: ta || {} });
    if (ta?.GlobalTime) assignSaveData({ saveGlobalTime: Number(ta.GlobalTime) || 0 });
  } else {
    assignState({ timeAwayData: {} });
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
  for (let i = 0; i < researchRows[5].length; i += 4) {
    magArr.push({ x: researchRows[5][i], y: researchRows[5][i + 1], slot: researchRows[5][i + 2], type: researchRows[5][i + 3] });
  }
  assignState({ magData: magArr });

  // Parse shapes (groups of 4)
  const spArr = [];
  for (let i = 0; i < researchRows[6].length; i += 4) {
    spArr.push({ x: researchRows[6][i], y: researchRows[6][i + 1], rot: researchRows[6][i + 2], unk: researchRows[6][i + 3] });
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
  const _comp55val = companionBonusForSave(55, saveData);
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
  const _researchAdditivePct = Number(rexp.additivePct) || 0;
  const _stickerVal = Number(rexp.stickerBonus) || 0;
  // simTotalExpWith adds grid bonuses dynamically (so optimizer sees changes),
  // so extPctExSticker must exclude both sticker AND grids to avoid double-counting.
  // Grid(112) and Grid(94) are added by the sim with i=2 multipliers (×occFound, ×obsLVs),
  // so we must subtract those same scaled values here.
  const _abmCtx = { abm: saveData.allBonusMulti };
  const R = saveData.research || [];
  const _rLv = saveData.researchLevel || 0;
  const _occCount = _rLv < 1 ? 0 : ((R[2] || [])[0] === 0 ? 1 :
    Math.min(43, 5 * Math.floor((_rLv + 10) / 10) - Math.floor(_rLv / 20) - Math.floor(_rLv / 30) - Math.floor(_rLv / 50)));
  let _occFound = 0, _obsLVs = 0;
  const _resObs = R[2] || [], _resObsLv = R[4] || [];
  for (let oi = 0; oi < _occCount; oi++) {
    if ((Number(_resObs[oi]) || 0) >= 1) _occFound++;
    const olv = Number(_resObsLv[oi]) || 0;
    if (olv >= 1) _obsLVs += olv;
  }
  const _gridAdd =
    gbWith(saveData.gridLevels, saveData.shapeOverlay, 50, _abmCtx) +
    gbWith(saveData.gridLevels, saveData.shapeOverlay, 90, _abmCtx) +
    gbWith(saveData.gridLevels, saveData.shapeOverlay, 110, _abmCtx) +
    gbWith(saveData.gridLevels, saveData.shapeOverlay, 112, _abmCtx) * _occFound +
    gbWith(saveData.gridLevels, saveData.shapeOverlay, 94, _abmCtx) * _obsLVs +
    gbWith(saveData.gridLevels, saveData.shapeOverlay, 31, _abmCtx) +
    gbWith(saveData.gridLevels, saveData.shapeOverlay, 51, _abmCtx);
  assignState({
    externalResearchPct: _researchAdditivePct,
    cachedExtPctExSticker: _researchAdditivePct - _stickerVal - _gridAdd,
    comp52TrueMulti: (1 + companionBonusForSave(52, saveData)) * (1 + companionBonusForSave(153, saveData) + companionLevel2(153, saveData)),
    cachedRoyalResearch: Math.max(1, outpostROGBonus(saveData, 1)),
  });

  // Button_Bonuses(0): presses rotate through 9 slots, slot 0 rate = 2
  // btnBaseNoGrid = button0 value WITHOUT grid 125 contribution (for dynamic recompute in sim)
  var _btnPresses = Number(saveData.olaData[594]) || 0;
  var _btn0 = 0, _btnBase = 0;
  if (_btnPresses > 0) {
    var _c147 = companionBonusForSave(147, saveData);
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
  assignState({ cachedKillroy5: 1 + _ola469 / (150 + _ola469) * 0.8 });

  // Nonstop Studies: DreamUpg[12] → Dream[14] (offset +2). Coeff = 3.
  assignState({ cachedDream14: Number(dreamData[14]) || 0 });

  // Cglunko_upgBon(11): OLA[641] * perLv(1). Applied as (1+val/100) true multiplier.
  var _cg11 = (Number(saveData.olaData[641]) || 0) * 1;
  assignState({ cachedCglunko11: _cg11 });

  // Fountain_BonTOT(2,16): MarbleBon(2,16) * Holes[31][2][16] * perLv(1).
  var _fLv = Number(saveData.holesData?.[31]?.[2]?.[16]) || 0;
  var _fMLv = Number(saveData.holesData?.[32]?.[2]?.[16]) || 0;
  var _fMB = _fMLv <= 0 ? 1 : 1.5 + 0.5 * _fMLv;
  assignState({ cachedFountain2_16: Math.round(_fMB * _fLv * 1) });

  assignSaveData({ cachedAFKRate: buildTree(afkGainsDesc, getCatalog(), { saveData: saveData }) });
}
