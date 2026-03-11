// ===== MUTABLE STATE MODULE =====
// Worker-shared state variables for the sim/optimizer engine.
// Main-thread-only save data lives in save-data.js.
// restoreState() is the ONLY function that writes to scalar state vars.
// Other modules import these via ES module live bindings.

import { GRID_SIZE } from './game-data.js';

// ===== STATE =====
export let research = null; // parsed Research array from save
export let gridLevels = new Array(GRID_SIZE).fill(0);
export let shapeOverlay = new Array(GRID_SIZE).fill(-1);
export let occFound = new Array(80).fill(0);
export let insightLvs = new Array(80).fill(0);
export let insightProgress = new Array(80).fill(0);
export let magData = []; // [{x,y,slot,type}]
export let shapePositions = []; // [{x,y,rot,?}]
export let stateR7 = new Array(20).fill(0);
export let researchLevel = 0;
export let magMaxPerSlot = 1;
export let externalResearchPct = 0;
export let comp52TrueMulti = 1; // Companion(52) TRUE multiplier
export let allBonusMulti = 1;   // Grid_Bonus_Allmulti
export let magnifiersOwned = 0;
// Save data for external bonus computation
export let olaData = [];
export let towerData = [];
export let spelunkData = [];
export let arcadeUpgData = [];
export let cards0Data = {};
export let cards1Data = [];
export let sailingData = [];
export let lv0Data = [];
export let totemInfoData = [];
export let gamingData = [];
export let ninjaData = [];
export let ribbonData = [];
export let mealsData = [];
export let farmCropCount = 0;
export let grimoireData = [];
export let farmUpgData = [];
export let totalTomePoints = 0;
export let holesData = [];
export let riftData = [];
export let breedingData = [];
export let summonData = [];
export let arcaneData = [];
export let gemItemsData = [];
export let achieveRegData = [];
export let tasksGlobalData = [];

export let lv0AllData = []; // lv0AllData[charIdx] = Lv0 array for each character
export let labBonusConnected = []; // connectivity for chip bonuses (indices 0..LMB.length-1)
export let labJewelConnected = []; // connectivity for jewels (indices 0..23)
export let labMainBonusFull = [];  // built LAB_BONUS_BASE + dynamic entries
export let companionIds = new Set(); // owned companion DB indices from it.json
export let extBonusOverrides = {}; // manual overrides for runtime-only bonuses
export let extBonuses = null; // cached result of computeExternalBonuses()
export let serverVarResXP = 1.01; // A_ResXP server variable for Research EXP curve

// Cached scalars extracted from raw save arrays (so raw arrays aren't needed after load)
export let cachedEventShopStr = ''; // String(olaData[311]) - used by eventShopOwned()
export let cachedResearchExp = 0;   // exp0Data[20] - current research EXP
export let cachedSpelunkyUpg7 = 0;  // spelunkData[0][7] - used by computeShapesOwned()
export let cachedFailedRolls = 0;   // optionsListData[514] - obs roller pity counter

export let cachedComp0DivOk = false; // lv0AllData[0][14] >= 2 - for calcAllBonusMulti
// Sticker bonus components for dynamic recalculation in sim (node I9 = grid 68)
export let cachedStickerFixed = 0;  // stkSuperbit62 * stkLv * stkBase (constant during sim)
export let cachedBoonyCount = 0;    // research[11].length (rat king crown count)
export let cachedEvShop37 = 0;      // eventShopOwned(37) (constant during sim)
export let cachedExtPctExSticker = 0; // externalResearchPct minus sticker bonus


// Additional module-level state
export let shapeTiers   = { above: [], below: [] };
export let _covLUTCache = null, _covLUTCacheN = -1;

// Bulk state setter for individual writes from any module.
// Unlike restoreState (which overwrites everything from a snapshot),
// assignState only touches keys present in the update object.
export function assignState(u) {
  if ('research' in u) research = u.research;
  if ('gridLevels' in u) gridLevels = u.gridLevels;
  if ('shapeOverlay' in u) shapeOverlay = u.shapeOverlay;
  if ('occFound' in u) occFound = u.occFound;
  if ('insightLvs' in u) insightLvs = u.insightLvs;
  if ('insightProgress' in u) insightProgress = u.insightProgress;
  if ('magData' in u) magData = u.magData;
  if ('shapePositions' in u) shapePositions = u.shapePositions;
  if ('stateR7' in u) stateR7 = u.stateR7;
  if ('researchLevel' in u) researchLevel = u.researchLevel;
  if ('magMaxPerSlot' in u) magMaxPerSlot = u.magMaxPerSlot;
  if ('externalResearchPct' in u) externalResearchPct = u.externalResearchPct;
  if ('comp52TrueMulti' in u) comp52TrueMulti = u.comp52TrueMulti;
  if ('allBonusMulti' in u) allBonusMulti = u.allBonusMulti;
  if ('magnifiersOwned' in u) magnifiersOwned = u.magnifiersOwned;
  if ('olaData' in u) olaData = u.olaData;
  if ('towerData' in u) towerData = u.towerData;
  if ('spelunkData' in u) spelunkData = u.spelunkData;
  if ('arcadeUpgData' in u) arcadeUpgData = u.arcadeUpgData;
  if ('cards0Data' in u) cards0Data = u.cards0Data;
  if ('cards1Data' in u) cards1Data = u.cards1Data;
  if ('sailingData' in u) sailingData = u.sailingData;
  if ('lv0Data' in u) lv0Data = u.lv0Data;
  if ('totemInfoData' in u) totemInfoData = u.totemInfoData;
  if ('gamingData' in u) gamingData = u.gamingData;
  if ('ninjaData' in u) ninjaData = u.ninjaData;
  if ('ribbonData' in u) ribbonData = u.ribbonData;
  if ('mealsData' in u) mealsData = u.mealsData;
  if ('farmCropCount' in u) farmCropCount = u.farmCropCount;
  if ('grimoireData' in u) grimoireData = u.grimoireData;
  if ('farmUpgData' in u) farmUpgData = u.farmUpgData;
  if ('totalTomePoints' in u) totalTomePoints = u.totalTomePoints;
  if ('holesData' in u) holesData = u.holesData;
  if ('riftData' in u) riftData = u.riftData;
  if ('breedingData' in u) breedingData = u.breedingData;
  if ('summonData' in u) summonData = u.summonData;
  if ('arcaneData' in u) arcaneData = u.arcaneData;
  if ('gemItemsData' in u) gemItemsData = u.gemItemsData;
  if ('achieveRegData' in u) achieveRegData = u.achieveRegData;
  if ('tasksGlobalData' in u) tasksGlobalData = u.tasksGlobalData;
  if ('lv0AllData' in u) lv0AllData = u.lv0AllData;
  if ('labBonusConnected' in u) labBonusConnected = u.labBonusConnected;
  if ('labJewelConnected' in u) labJewelConnected = u.labJewelConnected;
  if ('labMainBonusFull' in u) labMainBonusFull = u.labMainBonusFull;
  if ('companionIds' in u) companionIds = u.companionIds instanceof Set ? u.companionIds : new Set(u.companionIds || []);
  if ('extBonusOverrides' in u) extBonusOverrides = u.extBonusOverrides;
  if ('extBonuses' in u) extBonuses = u.extBonuses;
  if ('serverVarResXP' in u) serverVarResXP = u.serverVarResXP;
  if ('cachedEventShopStr' in u) cachedEventShopStr = u.cachedEventShopStr;
  if ('cachedResearchExp' in u) cachedResearchExp = u.cachedResearchExp;
  if ('cachedSpelunkyUpg7' in u) cachedSpelunkyUpg7 = u.cachedSpelunkyUpg7;
  if ('cachedFailedRolls' in u) cachedFailedRolls = u.cachedFailedRolls;
  if ('cachedComp0DivOk' in u) cachedComp0DivOk = u.cachedComp0DivOk;
  if ('cachedStickerFixed' in u) cachedStickerFixed = u.cachedStickerFixed;
  if ('cachedBoonyCount' in u) cachedBoonyCount = u.cachedBoonyCount;
  if ('cachedEvShop37' in u) cachedEvShop37 = u.cachedEvShop37;
  if ('cachedExtPctExSticker' in u) cachedExtPctExSticker = u.cachedExtPctExSticker;
  if ('_covLUTCache' in u) _covLUTCache = u._covLUTCache;
  if ('_covLUTCacheN' in u) _covLUTCacheN = u._covLUTCacheN;
  if ('shapeTiers' in u) { shapeTiers.above = u.shapeTiers.above || []; shapeTiers.below = u.shapeTiers.below || []; }
}

// Build a transferable snapshot of all state for worker threads.
// Arrays that the sim mutates are cloned; read-only save data is referenced.
export function snapshotState() {
  return {
    research,
    gridLevels: gridLevels.slice(),
    shapeOverlay: shapeOverlay.slice(),
    occFound: occFound.slice(),
    insightLvs: insightLvs.slice(),
    insightProgress: insightProgress.slice(),
    magData: magData.map(function(m){ return {x:m.x,y:m.y,slot:m.slot,type:m.type}; }),
    shapePositions: shapePositions.slice(),
    stateR7: stateR7.slice(),
    researchLevel, magMaxPerSlot, externalResearchPct,
    comp52TrueMulti, allBonusMulti, magnifiersOwned,
    olaData, towerData, spelunkData, arcadeUpgData,
    cards0Data, cards1Data, sailingData, lv0Data,
    totemInfoData, gamingData, ninjaData, ribbonData,
    mealsData, farmCropCount, grimoireData, farmUpgData,
    totalTomePoints, holesData, riftData, breedingData,
    summonData, arcaneData, gemItemsData, achieveRegData,
    tasksGlobalData, lv0AllData,
    labBonusConnected, labJewelConnected, labMainBonusFull,
    companionIds: Array.from(companionIds),
    extBonusOverrides, extBonuses, serverVarResXP,
    cachedEventShopStr, cachedResearchExp, cachedSpelunkyUpg7,
    cachedFailedRolls, cachedComp0DivOk,
    cachedStickerFixed, cachedBoonyCount, cachedEvShop37, cachedExtPctExSticker,
    shapeTiers: { above: shapeTiers.above.slice(), below: shapeTiers.below.slice() },
    _covLUT: _covLUTCache, _covLUTN: _covLUTCacheN,
  };
}

export function restoreState(s) {
  research = s.research;
  gridLevels = s.gridLevels;
  shapeOverlay = s.shapeOverlay;
  occFound = s.occFound;
  insightLvs = s.insightLvs;
  insightProgress = s.insightProgress;
  magData = s.magData;
  shapePositions = s.shapePositions || [];
  stateR7 = s.stateR7 || new Array(20).fill(0);
  researchLevel = s.researchLevel;
  magMaxPerSlot = s.magMaxPerSlot;
  externalResearchPct = s.externalResearchPct;
  comp52TrueMulti = s.comp52TrueMulti;
  allBonusMulti = s.allBonusMulti;
  magnifiersOwned = s.magnifiersOwned;
  cachedStickerFixed = s.cachedStickerFixed || 0;
  cachedBoonyCount = s.cachedBoonyCount || 0;
  cachedEvShop37 = s.cachedEvShop37 || 0;
  cachedExtPctExSticker = s.cachedExtPctExSticker || 0;
  olaData = s.olaData || [];
  towerData = s.towerData || [];
  spelunkData = s.spelunkData || [];
  arcadeUpgData = s.arcadeUpgData || [];
  cards0Data = s.cards0Data || {};
  cards1Data = s.cards1Data || [];
  sailingData = s.sailingData || [];
  lv0Data = s.lv0Data || [];
  totemInfoData = s.totemInfoData || [];
  gamingData = s.gamingData || [];
  ninjaData = s.ninjaData || [];
  ribbonData = s.ribbonData || [];
  mealsData = s.mealsData || [];
  farmCropCount = s.farmCropCount || 0;
  grimoireData = s.grimoireData || [];
  farmUpgData = s.farmUpgData || [];
  totalTomePoints = s.totalTomePoints || 0;
  holesData = s.holesData || [];
  riftData = s.riftData || [];
  breedingData = s.breedingData || [];
  summonData = s.summonData || [];
  arcaneData = s.arcaneData || [];
  gemItemsData = s.gemItemsData || [];
  achieveRegData = s.achieveRegData || [];
  tasksGlobalData = s.tasksGlobalData || [];
  lv0AllData = s.lv0AllData || [];
  labBonusConnected = s.labBonusConnected || [];
  labJewelConnected = s.labJewelConnected || [];
  labMainBonusFull = s.labMainBonusFull || [];
  companionIds = new Set(s.companionIds || []);
  extBonusOverrides = s.extBonusOverrides || {};
  extBonuses = s.extBonuses;
  serverVarResXP = s.serverVarResXP;
  cachedEventShopStr = s.cachedEventShopStr || '';
  cachedResearchExp = s.cachedResearchExp || 0;
  cachedSpelunkyUpg7 = s.cachedSpelunkyUpg7 || 0;
  cachedComp0DivOk = s.cachedComp0DivOk || false;
  cachedFailedRolls = s.cachedFailedRolls || 0;
  if (s.shapeTiers) { shapeTiers.above = s.shapeTiers.above || []; shapeTiers.below = [...(s.shapeTiers.below || []), ...(s.shapeTiers.disabled || [])]; }
  if (s._covLUT && s._covLUTN >= 0) { _covLUTCache = s._covLUT; _covLUTCacheN = s._covLUTN; }
}
