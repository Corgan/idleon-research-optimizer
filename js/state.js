// ===== MUTABLE STATE MODULE =====
// Single state object replaces 60+ let exports.
// All modules import saveData and access properties: saveData.gridLevels, saveData.researchLevel, etc.
// assignState() for partial updates, restoreState() for full snapshot restore.

import { GRID_SIZE } from './game-data.js';

// Keys whose arrays are mutated by simulation and must be deep-cloned for snapshots
const _SIM_CLONE_KEYS = [
  'gridLevels', 'shapeOverlay', 'occFound', 'insightLvs',
  'insightProgress', 'shapePositions', 'stateR7',
];

export const saveData = {
  research: null,
  gridLevels: new Array(GRID_SIZE).fill(0),
  shapeOverlay: new Array(GRID_SIZE).fill(-1),
  occFound: new Array(80).fill(0),
  insightLvs: new Array(80).fill(0),
  insightProgress: new Array(80).fill(0),
  magData: [],
  shapePositions: [],
  stateR7: new Array(20).fill(0),
  mineheadUpgLevels: [],
  researchLevel: 0,
  magMaxPerSlot: 1,
  externalResearchPct: 0,
  comp52TrueMulti: 1,
  allBonusMulti: 1,
  magnifiersOwned: 0,
  olaData: [],
  towerData: [],
  spelunkData: [],
  arcadeUpgData: [],
  cards0Data: {},
  cards1Data: [],
  sailingData: [],
  lv0Data: [],
  totemInfoData: [],
  gamingData: [],
  ninjaData: [],
  ribbonData: [],
  mealsData: [],
  farmCropCount: 0,
  grimoireData: [],
  vaultData: [],
  farmUpgData: [],
  totalTomePoints: 0,
  holesData: [],
  riftData: [],
  breedingData: [],
  summonData: [],
  atomsData: [],
  arcaneData: [],
  compassData: [],
  gemItemsData: [],
  achieveRegData: [],
  bribeStatusData: [],
  cauldronP2WData: [],
  tasksGlobalData: [],
  lv0AllData: [],
  labBonusConnected: [],
  labJewelConnected: [],
  labMainBonusFull: [],
  companionIds: new Set(),
  extBonusOverrides: {},
  serverVarResXP: 1.01,
  serverVarMineHP: 1,
  serverVarMineCost: 1,
  activeVoteIdx: -1,
  starSignsUnlocked: {},
  cachedEventShopStr: '',
  cachedResearchExp: 0,
  cachedSpelunkyUpg7: 0,
  cachedFailedRolls: 0,
  cachedComp0DivOk: false,
  cachedStickerFixed: 0,
  cachedBoonyCount: 0,
  cachedEvShop37: 0,
  cachedExtPctExSticker: 0,
  guildData: [],
  prayOwnedData: [],
  shrineData: [],
  bundlesData: {},
  farmRankData: {},
  forgeLvData: [],
  sushiData: [],
  questCompleteData: [],
  totalQuestsComplete: 0,
  cachedUniqueSushi: 0,
  cachedSailingArt37: 0,
  shapeTiers: { above: [], below: [] },
  _covLUTCache: null,
  _covLUTCacheN: -1,
};

// Partial update — only touches keys present in u.
export function assignState(u) {
  for (const k in u) {
    if (k === 'companionIds') {
      saveData.companionIds = u.companionIds instanceof Set ? u.companionIds : new Set(u.companionIds || []);
    } else if (k === 'shapeTiers') {
      saveData.shapeTiers.above = u.shapeTiers.above || [];
      saveData.shapeTiers.below = u.shapeTiers.below || [];
    } else {
      saveData[k] = u[k];
    }
  }
}

// Clone state for worker transfer. Sim-mutable arrays are cloned; save data is referenced.
export function snapshotState() {
  const snap = {};
  for (const k in saveData) snap[k] = saveData[k];
  // Clone sim-mutable arrays
  for (const k of _SIM_CLONE_KEYS) snap[k] = saveData[k].slice();
  snap.magData = saveData.magData.map(m => ({ x: m.x, y: m.y, slot: m.slot, type: m.type }));
  snap.companionIds = Array.from(saveData.companionIds);
  snap.shapeTiers = { above: saveData.shapeTiers.above.slice(), below: saveData.shapeTiers.below.slice() };
  // Rename for worker compat
  snap._covLUT = saveData._covLUTCache;
  snap._covLUTN = saveData._covLUTCacheN;
  return snap;
}

// Full restore from snapshot (with defaults for backwards compat).
export function restoreState(s) {
  for (const k in s) {
    if (k === 'companionIds') {
      saveData.companionIds = new Set(s.companionIds || []);
    } else if (k === 'shapeTiers') {
      saveData.shapeTiers.above = s.shapeTiers.above || [];
      saveData.shapeTiers.below = [...(s.shapeTiers.below || []), ...(s.shapeTiers.disabled || [])];
    } else if (k === '_covLUT') {
      if (s._covLUT && s._covLUTN >= 0) saveData._covLUTCache = s._covLUT;
    } else if (k === '_covLUTN') {
      if (s._covLUT && s._covLUTN >= 0) saveData._covLUTCacheN = s._covLUTN;
    } else {
      saveData[k] = s[k];
    }
  }
  // Defaults for optional fields (backwards compat with older snapshots)
  if (!saveData.shapePositions) saveData.shapePositions = [];
  if (!saveData.stateR7) saveData.stateR7 = new Array(20).fill(0);
  if (!saveData.olaData) saveData.olaData = [];
  if (!saveData.towerData) saveData.towerData = [];
  if (!saveData.spelunkData) saveData.spelunkData = [];
  if (!saveData.arcadeUpgData) saveData.arcadeUpgData = [];
  if (!saveData.cards0Data) saveData.cards0Data = {};
  if (!saveData.cards1Data) saveData.cards1Data = [];
  if (!saveData.sailingData) saveData.sailingData = [];
  if (!saveData.lv0Data) saveData.lv0Data = [];
  if (!saveData.totemInfoData) saveData.totemInfoData = [];
  if (!saveData.gamingData) saveData.gamingData = [];
  if (!saveData.ninjaData) saveData.ninjaData = [];
  if (!saveData.ribbonData) saveData.ribbonData = [];
  if (!saveData.mealsData) saveData.mealsData = [];
  if (!saveData.grimoireData) saveData.grimoireData = [];
  if (!saveData.vaultData) saveData.vaultData = [];
  if (!saveData.farmUpgData) saveData.farmUpgData = [];
  if (!saveData.holesData) saveData.holesData = [];
  if (!saveData.riftData) saveData.riftData = [];
  if (!saveData.breedingData) saveData.breedingData = [];
  if (!saveData.summonData) saveData.summonData = [];
  if (!saveData.atomsData) saveData.atomsData = [];
  if (!saveData.arcaneData) saveData.arcaneData = [];
  if (!saveData.starSignsUnlocked) saveData.starSignsUnlocked = {};
  if (!saveData.gemItemsData) saveData.gemItemsData = [];
  if (!saveData.achieveRegData) saveData.achieveRegData = [];
  if (!saveData.tasksGlobalData) saveData.tasksGlobalData = [];
  if (!saveData.lv0AllData) saveData.lv0AllData = [];
  if (!saveData.labBonusConnected) saveData.labBonusConnected = [];
  if (!saveData.labJewelConnected) saveData.labJewelConnected = [];
  if (!saveData.labMainBonusFull) saveData.labMainBonusFull = [];
  if (!saveData.extBonusOverrides) saveData.extBonusOverrides = {};
  if (!saveData.cachedEventShopStr) saveData.cachedEventShopStr = '';
}
