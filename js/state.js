// ===== MUTABLE STATE MODULE =====
// Single state object replaces 60+ let exports.
// All modules import S and access properties: S.gridLevels, S.researchLevel, etc.
// assignState() for partial updates, restoreState() for full snapshot restore.

import { GRID_SIZE } from './game-data.js';

// Keys whose arrays are mutated by simulation and must be deep-cloned for snapshots
const _SIM_CLONE_KEYS = [
  'gridLevels', 'shapeOverlay', 'occFound', 'insightLvs',
  'insightProgress', 'shapePositions', 'stateR7',
];

export const S = {
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
  extBonuses: null,
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
      S.companionIds = u.companionIds instanceof Set ? u.companionIds : new Set(u.companionIds || []);
    } else if (k === 'shapeTiers') {
      S.shapeTiers.above = u.shapeTiers.above || [];
      S.shapeTiers.below = u.shapeTiers.below || [];
    } else {
      S[k] = u[k];
    }
  }
}

// Clone state for worker transfer. Sim-mutable arrays are cloned; save data is referenced.
export function snapshotState() {
  const snap = {};
  for (const k in S) snap[k] = S[k];
  // Clone sim-mutable arrays
  for (const k of _SIM_CLONE_KEYS) snap[k] = S[k].slice();
  snap.magData = S.magData.map(m => ({ x: m.x, y: m.y, slot: m.slot, type: m.type }));
  snap.companionIds = Array.from(S.companionIds);
  snap.shapeTiers = { above: S.shapeTiers.above.slice(), below: S.shapeTiers.below.slice() };
  // Rename for worker compat
  snap._covLUT = S._covLUTCache;
  snap._covLUTN = S._covLUTCacheN;
  return snap;
}

// Full restore from snapshot (with defaults for backwards compat).
export function restoreState(s) {
  for (const k in s) {
    if (k === 'companionIds') {
      S.companionIds = new Set(s.companionIds || []);
    } else if (k === 'shapeTiers') {
      S.shapeTiers.above = s.shapeTiers.above || [];
      S.shapeTiers.below = [...(s.shapeTiers.below || []), ...(s.shapeTiers.disabled || [])];
    } else if (k === '_covLUT') {
      if (s._covLUT && s._covLUTN >= 0) S._covLUTCache = s._covLUT;
    } else if (k === '_covLUTN') {
      if (s._covLUT && s._covLUTN >= 0) S._covLUTCacheN = s._covLUTN;
    } else {
      S[k] = s[k];
    }
  }
  // Defaults for optional fields (backwards compat with older snapshots)
  if (!S.shapePositions) S.shapePositions = [];
  if (!S.stateR7) S.stateR7 = new Array(20).fill(0);
  if (!S.olaData) S.olaData = [];
  if (!S.towerData) S.towerData = [];
  if (!S.spelunkData) S.spelunkData = [];
  if (!S.arcadeUpgData) S.arcadeUpgData = [];
  if (!S.cards0Data) S.cards0Data = {};
  if (!S.cards1Data) S.cards1Data = [];
  if (!S.sailingData) S.sailingData = [];
  if (!S.lv0Data) S.lv0Data = [];
  if (!S.totemInfoData) S.totemInfoData = [];
  if (!S.gamingData) S.gamingData = [];
  if (!S.ninjaData) S.ninjaData = [];
  if (!S.ribbonData) S.ribbonData = [];
  if (!S.mealsData) S.mealsData = [];
  if (!S.grimoireData) S.grimoireData = [];
  if (!S.vaultData) S.vaultData = [];
  if (!S.farmUpgData) S.farmUpgData = [];
  if (!S.holesData) S.holesData = [];
  if (!S.riftData) S.riftData = [];
  if (!S.breedingData) S.breedingData = [];
  if (!S.summonData) S.summonData = [];
  if (!S.atomsData) S.atomsData = [];
  if (!S.arcaneData) S.arcaneData = [];
  if (!S.starSignsUnlocked) S.starSignsUnlocked = {};
  if (!S.gemItemsData) S.gemItemsData = [];
  if (!S.achieveRegData) S.achieveRegData = [];
  if (!S.tasksGlobalData) S.tasksGlobalData = [];
  if (!S.lv0AllData) S.lv0AllData = [];
  if (!S.labBonusConnected) S.labBonusConnected = [];
  if (!S.labJewelConnected) S.labJewelConnected = [];
  if (!S.labMainBonusFull) S.labMainBonusFull = [];
  if (!S.extBonusOverrides) S.extBonusOverrides = {};
  if (!S.cachedEventShopStr) S.cachedEventShopStr = '';
}
