// ===== FARMING DATA =====
import { MarketExoticInfo, MarketInfo, NinjaInfo, SeedInfo } from '../game/customlists.js';

export function seedFamily(idx) {
  var row = SeedInfo[idx];
  if (!row) return null;
  return {
    id: idx,
    name: String(row[0] || '').replace(/_/g, ' '),
    start: Number(row[2]) || 0,
    end: Number(row[3]) || 0,
    unlockLevel: Number(row[4]) || 0,
    listedBaseChance: Number(row[5]) || 0,
    evolutionDenom: Number(row[6]) || 0,
  };
}

export function seedFamilyCount() { return SeedInfo.length; }

export function marketUpgrade(page, idx) {
  var rowIdx = idx + 8 * page;
  var row = MarketInfo[rowIdx];
  if (!row) return null;
  return {
    page: page,
    id: idx,
    rowIdx: rowIdx,
    name: String(row[0] || '').replace(/_/g, ' '),
    description: String(row[1] || '').replace(/_/g, ' '),
    cropBase: Number(row[2]) || 0,
    cropRate: Number(row[3]) || 0,
    costBase: Number(row[4]) || 0,
    costGrowth: Number(row[5]) || 0,
    cropsRequired: Number(row[6]) || 0,
    maxLevel: Number(row[7]) || 0,
    effectPerLevel: Number(row[8]) || 0,
  };
}

export function exoticUpgrade(idx) {
  var row = MarketExoticInfo[idx];
  if (!row) return null;
  return {
    id: idx,
    name: String(row[0] || '').replace(/_/g, ' '),
    description: String(row[1] || '').replace(/_/g, ' '),
    cropId: Number(row[2]) || 0,
    base: Number(row[3]) || 0,
    decay: Number(row[4]) === 1,
    purchaseType: Number(row[5]) || 0,
    farmSlot: idx + 20,
  };
}

export function exoticUpgradeCount() { return MarketExoticInfo.length; }

export function exoticParams(idx) {
  var e = MarketExoticInfo[idx];
  return e ? { base: Number(e[3]), farmSlot: idx + 20, type: Number(e[4]) === 1 ? 'decay' : 'linear', denom: 1000 } : null;
}

export function ninjaInfo(row) { return NinjaInfo[row] ? NinjaInfo[row].map(Number) : []; }
