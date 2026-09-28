// ===== JELLY OPERATOR (W7) =====

import { AtomInfo } from '../../data/game/customlists.js';
import {
  CELL_BASE_COOLDOWNS,
  CELL_BASE_DAMAGE,
  CELL_NAMES,
  JELLY_COLS,
  JELLY_OBSTRUCTION_SLOTS,
  JELLY_SIZE,
  cellFootprint,
  jellyProjectileData,
  jellyRewardBonus,
  jellyRewards,
  jellySlotPlot,
  jellySlotPlots,
  jellyUpgradeData,
  jellyUpgradeOrder,
} from '../../data/w7/jelly-operator.js';
import { gbWith } from './research-math.js';
import { computePaletteBonus } from './spelunking.js';
import { rogBonusQTY } from './sushi.js';
import { arcadeBonus } from '../w2/arcade.js';
import { fmtVal } from '../../../renderers/format.js';

const STARTING_SLOTS = [77, 95, 78, 96];
const FIRST_CLEAR_SLOTS = [76, 94];
const SECOND_CLEAR_SLOTS = [75, 93];
const PROXIMITY_ANCHORS = new Set([43, 44, 45, 46, 60, 65, 78, 83, 96, 101, 114, 119, 133, 134, 135, 136]);
const FEVER_MODE_NAMES = ['COLD', 'RASH', 'SEPSIS', 'NAUSEA', 'RABIES', 'PLAGUE'];

function n(value) {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

function valueOf(result) {
  return n(result && typeof result === 'object' ? result.val : result);
}

function displayNumber(value) {
  const number = n(value);
  if (Math.abs(number) >= 1000) return fmtVal(number);
  if (Number.isInteger(number)) return String(number);
  return String(parseFloat(number.toFixed(2)));
}

function feverModeName(fever) {
  return FEVER_MODE_NAMES[Math.floor(n(fever))] || `Fever ${Math.floor(n(fever)) + 1}`;
}

function researchRow(S, index) {
  return Array.isArray(S?.research?.[index]) ? S.research[index] : [];
}

export function hasJellyData(S) {
  return Array.isArray(S?.research?.[14]) && Array.isArray(S?.research?.[17]);
}

export function jellyProgress(S) {
  const state = researchRow(S, 7);
  return {
    obstruction: Math.max(0, Math.floor(n(state[9]))),
    tries: Math.max(0, Math.floor(n(state[10]))),
    bloodcells: Math.max(0, n(state[11])),
    bestDps: Math.max(0, n(state[12])),
    fever: Math.max(0, Math.floor(n(state[13]))),
    bestBloodcells: Math.max(0, n(state[14])),
  };
}

export function jellyUpgradeLevel(S, id) {
  return Math.max(0, Math.floor(n(researchRow(S, 17)[id])));
}

export function jellyUpgradeQuantity(S, id) {
  return n(jellyUpgradeData(id)?.perLevel) * jellyUpgradeLevel(S, id);
}

export function jellyUpgradeAtOrder(order) {
  return jellyUpgradeOrder()[Math.max(0, Math.floor(n(order)))];
}

export function jellyUpgradeResearchLevelRequirement(order) {
  order = Math.max(0, Math.floor(n(order)));
  return 15 + 2 * order + Math.floor(order / 15) - Math.floor(order / 11);
}

export function jellyUpgradeCost(S, order) {
  order = Math.max(0, Math.floor(n(order)));
  if (order === 0) return 0;
  const id = jellyUpgradeAtOrder(order);
  const data = jellyUpgradeData(id);
  if (!data) return Infinity;
  const baseCost = data.baseCost || 1;
  return Math.max(0.1, baseCost)
    * (1 + order / 7)
    * (6 + 5 * order + order ** 2)
    * (1.4 + Math.max(0, order - 3) / 30) ** Math.max(0, order - 4)
    * 1.3 ** Math.max(0, order - 20)
    / (1 + jellyUpgradeQuantity(S, 34) / 100)
    * data.costScale ** jellyUpgradeLevel(S, id);
}

export function jellyUpgradeCanBuy(S, order) {
  order = Math.max(0, Math.floor(n(order)));
  const id = jellyUpgradeAtOrder(order);
  const data = jellyUpgradeData(id);
  if (!data) return false;
  const previousId = jellyUpgradeAtOrder(Math.max(0, order - 1));
  const prerequisite = order === 0 || jellyUpgradeLevel(S, previousId) >= 1;
  const belowMax = data.maxLevel > 998 || jellyUpgradeLevel(S, id) < data.maxLevel;
  return prerequisite && belowMax && jellyProgress(S).bloodcells >= jellyUpgradeCost(S, order);
}

export function jellyUpgradeStatus(S, order) {
  order = Math.max(0, Math.floor(n(order)));
  const id = jellyUpgradeAtOrder(order);
  const data = jellyUpgradeData(id);
  const requiredResearchLevel = jellyUpgradeResearchLevelRequirement(order);
  const researchLevel = Math.max(0, Math.floor(n(S?.researchLevel)));
  const previousId = jellyUpgradeAtOrder(Math.max(0, order - 1));
  const prerequisiteMet = order === 0 || jellyUpgradeLevel(S, previousId) >= 1;
  const belowMax = Boolean(data) && (data.maxLevel > 998 || jellyUpgradeLevel(S, id) < data.maxLevel);
  const levelVisible = researchLevel >= requiredResearchLevel;
  const affordable = Boolean(data) && jellyProgress(S).bloodcells >= jellyUpgradeCost(S, order);
  return {
    id,
    requiredResearchLevel,
    researchLevel,
    levelVisible,
    prerequisiteMet,
    belowMax,
    affordable,
    canBuy: levelVisible && prerequisiteMet && belowMax && affordable,
  };
}

export function jellyUpgradeDisplay(S, id) {
  id = Math.max(0, Math.floor(n(id)));
  const data = jellyUpgradeData(id);
  if (!data) return null;
  const quantity = jellyUpgradeQuantity(S, id);
  const level = jellyUpgradeLevel(S, id);
  let perLevelText = `+${data.perLevel} per level`;
  if (data.maxLevel === 1 && data.perLevel === 1) perLevelText = 'One-time unlock';
  else if (id === 16) perLevelText = `+${data.perLevel} Fever mode${data.perLevel === 1 ? '' : 's'} per level`;
  else if ([8, 9, 15, 35].includes(id)) perLevelText = `+${data.perLevel} use${data.perLevel === 1 ? '' : 's'} per level`;
  else if (id === 17) perLevelText = `+${data.perLevel} percentage point per cell level`;
  else if (id === 29) perLevelText = '+0.01x Stronkroid speed per level, starting at 1.51x';
  else if (id === 34) perLevelText = '+1 cost-divisor point per level; effective reduction is diminishing';
  else if (id === 38) perLevelText = `+${data.perLevel}% of best operation Bloodcells daily per level`;
  else if (data.description.includes('{') || data.description.includes('}')) perLevelText = `+${data.perLevel}% per level`;

  let description = data.description
    .replace('{', String(quantity))
    .replace('}', `${(1 + quantity / 100).toFixed(2)}`);
  let dollarValue = quantity;
  if (id === 9) dollarValue = jellySlotPurchasesLeft(S);
  else if (id === 10) dollarValue = Math.floor(100 * jellyCellExpMultiplier(S)) / 100;
  else if (id === 15) dollarValue = Math.round(1 + quantity);
  else if (id === 17) dollarValue = Math.round(1 + quantity);
  else if (id === 23) dollarValue = Math.round(100 * jellyCurrencyMultiplier(S)) / 100;
  else if (id === 29) dollarValue = 1 + (50 + quantity) / 100;
  else if (id === 32) dollarValue = quantity * Math.floor(jellyTotalCellLevel(S) / 10);
  else if (id === 33) dollarValue = quantity * jellyTotalCellLevel(S);
  else if (id === 34) dollarValue = Math.round(1e4 * (1 - 1 / (1 + quantity / 100))) / 100;
  else if (id === 38) dollarValue = displayNumber(jellyDailyBloodcells(S));
  description = description
    .replace('$', String(dollarValue))
    .replace(/@/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (id === 10 && jellyUpgradeQuantity(S, 17) >= 1) {
    description = description.replace('1.01x', `1.0${Math.round(1 + jellyUpgradeQuantity(S, 17))}x`);
  }
  let sourceNote = '';
  if (id === 5) {
    sourceNote = 'Runtime correction: infected slots add to one global damage multiplier; they do not multiply damage by 1.10x independently.';
  } else if (id === 32) {
    sourceNote = 'Runtime correction: the operation formula uses every 100 combined cell levels, although the game description and displayed total use every 10.';
  } else if (id === 37) {
    sourceNote = 'No Research[17][37] formula consumer exists in this build, so the modeled immediate gain is zero.';
  } else if (id === 39) {
    sourceNote = 'This unlocks the obstruction-bonus interface/tutorial; reward formulas themselves are gated by cleared obstructions.';
  }
  let effectText = `+${quantity}`;
  if (id >= 0 && id <= 7) effectText = level >= 1 ? 'Unlocked' : 'Locked';
  else if ([12, 14, 28, 36].includes(id)) effectText = level >= 1 ? 'Active' : 'Locked';
  else if ([5, 37, 39].includes(id)) effectText = level >= 1 ? 'Unlocked; no scalable value' : 'Locked';
  else if ([10, 17, 18, 19, 20, 23, 24, 25, 30, 31, 32, 33, 38].includes(id)) effectText = `+${quantity}%`;
  else if ([11, 13, 21, 22, 26, 27].includes(id)) effectText = `${(1 + quantity / 100).toFixed(2)}x`;
  else if (id === 8) effectText = `${Math.round(quantity)} plot token${Math.round(quantity) === 1 ? '' : 's'}`;
  else if (id === 9) effectText = `${jellySlotPurchasesLeft(S)} unused plot token${jellySlotPurchasesLeft(S) === 1 ? '' : 's'}`;
  else if (id === 15) effectText = `${Math.round(1 + quantity)} Virus maximum`;
  else if (id === 16) effectText = `${Math.round(quantity)} Fever type${Math.round(quantity) === 1 ? '' : 's'}`;
  else if (id === 29) effectText = `${(1 + (50 + quantity) / 100).toFixed(2)}x attack speed`;
  else if (id === 34) effectText = `${(1 + quantity / 100).toFixed(2)}x cost divisor`;
  else if (id === 35) effectText = `${Math.round(quantity)} revival${Math.round(quantity) === 1 ? '' : 's'}`;
  if (id === 10) effectText = `${jellyCellExpMultiplier(S).toFixed(2)}x EXP per hit`;
  else if (id === 12) effectText = `${jellyBestDpsMultiplier(S).toFixed(3)}x Bloodcells`;
  else if (id === 17) effectText = `+${1 + quantity}% damage per cell level`;
  else if (id === 32) effectText = `+${quantity * Math.floor(jellyTotalCellLevel(S) / 100)}% total damage`;
  else if (id === 33) effectText = `+${quantity * jellyTotalCellLevel(S)}% total Bloodcells`;
  else if (id === 38) effectText = `${displayNumber(jellyDailyBloodcells(S))} Bloodcells per day`;
  return { ...data, level, quantity, effectText, perLevelText, description, sourceNote };
}

export function jellyCompletionBonus(index, S, includeLocked = false) {
  return hasJellyData(S) || includeLocked ? jellyRewardBonus(S, index, includeLocked) : 0;
}

export function jellyCellLevel(S, type) {
  return Math.max(0, Math.floor(n(researchRow(S, 16)[type])));
}

export function jellyCellExp(S, type) {
  return Math.max(0, n(researchRow(S, 15)[type]));
}

export function jellyCellExpRequirement(S, type) {
  return 20 * 1.3 ** jellyCellLevel(S, type);
}

export function jellyTotalCellLevel(S) {
  let total = 0;
  for (let type = 0; type < 9; type++) total += jellyCellLevel(S, type);
  return total;
}

export function jellyUnitsOwned(S) {
  let total = 0;
  for (let id = 0; id < 8; id++) total += jellyUpgradeQuantity(S, id);
  return Math.min(8, Math.round(total));
}

export function jellyUnlockedSlots(S) {
  const slots = new Set(STARTING_SLOTS);
  const obstruction = jellyProgress(S).obstruction;
  if (obstruction > 0) FIRST_CLEAR_SLOTS.forEach(slot => slots.add(slot));
  if (obstruction > 1) SECOND_CLEAR_SLOTS.forEach(slot => slots.add(slot));
  for (const rawPlot of researchRow(S, 18)) {
    const plot = jellySlotPlot(Math.floor(n(rawPlot)));
    if (!plot) continue;
    for (let y = 0; y < plot.height; y++) {
      for (let x = 0; x < plot.width; x++) slots.add(plot.start + x + JELLY_COLS * y);
    }
  }
  JELLY_OBSTRUCTION_SLOTS.forEach(slot => slots.delete(slot));
  return slots;
}

export function jellySlotPurchasesLeft(S) {
  const bundle = S?.bundlesData?.ban_j ? 1 : 0;
  return Math.round(
    jellyUpgradeQuantity(S, 8)
    + jellyUpgradeQuantity(S, 9)
    + jellyCompletionBonus(44, S)
    + bundle
    - researchRow(S, 18).length
  );
}

export function jellyFootprintSlots(anchor, type) {
  anchor = Math.floor(n(anchor));
  const slots = [];
  for (const offset of cellFootprint(type)) {
    const slot = anchor + offset;
    if (slot < 0 || slot >= JELLY_SIZE) return null;
    if (offset > -3 && offset < 3) {
      const column = anchor % JELLY_COLS + offset % JELLY_COLS;
      if (column < 0 || column >= JELLY_COLS) return null;
    }
    slots.push(slot);
  }
  return slots;
}

export function jellyLayoutFromSave(S) {
  const grid = researchRow(S, 14);
  const layout = {};
  for (let anchor = 0; anchor < JELLY_SIZE; anchor++) {
    const raw = grid[anchor];
    const type = Number(raw);
    if (raw !== undefined && raw !== null && raw !== '' && Number.isFinite(type) && Number.isInteger(type) && type >= 0 && type <= 8) layout[anchor] = type;
  }
  return layout;
}

export function jellyLayoutKey(layout) {
  return Object.keys(layout).map(Number).sort((a, b) => a - b).map(anchor => `${anchor}:${layout[anchor]}`).join('|');
}

export function jellyLayoutOccupancy(layout) {
  const occupied = new Map();
  for (const [rawAnchor, rawType] of Object.entries(layout || {})) {
    const anchor = Number(rawAnchor);
    const type = Number(rawType);
    const slots = jellyFootprintSlots(anchor, type);
    if (!slots) continue;
    for (const slot of slots) occupied.set(slot, { anchor, type });
  }
  return occupied;
}

export function jellyValidateLayout(layout, S) {
  const unlocked = jellyUnlockedSlots(S);
  const occupied = new Set();
  let viruses = 0;
  for (const [rawAnchor, rawType] of Object.entries(layout || {})) {
    const anchor = Number(rawAnchor);
    const type = Number(rawType);
    if (!Number.isInteger(anchor) || anchor < 0 || anchor >= JELLY_SIZE) return { valid: false, reason: `Invalid anchor ${rawAnchor}` };
    if (!Number.isInteger(type) || type < 0 || type >= jellyUnitsOwned(S)) return { valid: false, reason: `Cell ${type} is locked` };
    const slots = jellyFootprintSlots(anchor, type);
    if (!slots) return { valid: false, reason: `${CELL_NAMES[type]} wraps outside the grid` };
    for (const slot of slots) {
      if (!unlocked.has(slot)) return { valid: false, reason: `Slot ${slot} is locked` };
      if (occupied.has(slot)) return { valid: false, reason: `Cells overlap at slot ${slot}` };
      occupied.add(slot);
    }
    if (type === 5) viruses++;
  }
  if (viruses > 1 + jellyUpgradeQuantity(S, 15)) return { valid: false, reason: 'Virus limit exceeded' };
  return { valid: true, reason: '' };
}

export function jellyPlaceCell(layout, anchor, type, S) {
  anchor = Math.floor(n(anchor));
  type = Math.floor(n(type));
  if (type < 0 || type >= jellyUnitsOwned(S)) return null;
  const slots = jellyFootprintSlots(anchor, type);
  const unlocked = jellyUnlockedSlots(S);
  if (!slots || slots.some(slot => !unlocked.has(slot))) return null;
  const next = { ...(layout || {}) };
  const targetSlots = new Set(slots);
  for (const [rawOtherAnchor, otherType] of Object.entries(next)) {
    const otherAnchor = Number(rawOtherAnchor);
    const otherSlots = jellyFootprintSlots(otherAnchor, Number(otherType)) || [];
    if (otherSlots.some(slot => targetSlots.has(slot))) delete next[otherAnchor];
  }
  next[anchor] = type;
  const validation = jellyValidateLayout(next, S);
  return validation.valid ? next : null;
}

export function jellyRemoveCell(layout, anchor) {
  const next = { ...(layout || {}) };
  delete next[Math.floor(n(anchor))];
  return next;
}

export function jellyBossHp(index) {
  index = Math.max(0, Math.floor(n(index)));
  const early = [100, 200, 400, 1000, 2000, 4000, 6000, 10000, 15000, 30000, 50000, 100000];
  return index < early.length ? early[index] : 100000 * 1.65 ** (index - 11) * (1 + 0.9 * Math.floor((index - 11) / 12));
}

export function jellyBossTime(index) {
  return 30 + 5 * Math.floor(Math.max(0, n(index)) / 12);
}

export function jellyBossAttackCooldown(index) {
  return Math.max(10, 120 - 20 * Math.floor(Math.max(0, n(index)) / 6));
}

export function jellyDailyTries(S) {
  return Math.round(2 + n(S?.gridLevels?.[186]));
}

export function jellyBestDpsMultiplierFromValue(value) {
  const dps = Math.max(0, n(value));
  const log10 = Math.log(Math.max(dps, 1)) / 2.30259;
  const log2Term = Math.min(2, Math.log(Math.max(dps / 100, 1)) / Math.log(2) / 20);
  return 1 + (log2Term + log10 / 50 * 15 / (Math.log(Math.max(dps / 50, 1)) / 2.30259 + 20));
}

export function jellyBestDpsMultiplier(S) {
  return jellyBestDpsMultiplierFromValue(jellyProgress(S).bestDps);
}

export function jellyFeverBonus(S, effect, part = 0, rampPct = 0, selectedOverride) {
  const selected = selectedOverride == null ? jellyProgress(S).fever : Math.floor(n(selectedOverride));
  if (jellyUpgradeQuantity(S, 16) <= effect) return 0;
  if (selected !== effect) return 0;
  if (effect === 0) return n(rampPct);
  if (effect === 1 || effect === 2 || effect === 3) return 100;
  if (effect === 4) return part === 1 ? 25 : 50;
  if (effect === 5) return 40;
  return 0;
}

export function jellyCellDamageMultiplier(S, options = {}) {
  const fever = options.fever;
  const grid185 = gbWith(S?.gridLevels || [], S?.shapeOverlay || [], 185, { abm: n(S?.allBonusMulti) || 1 });
  const additive = jellyUpgradeQuantity(S, 18)
    + (jellyUpgradeQuantity(S, 19)
      + (jellyUpgradeQuantity(S, 20)
        + computePaletteBonus(1, S)));
  return (1 + additive / 100)
    * (1 + jellyUpgradeQuantity(S, 21) / 100)
    * (1 + jellyUpgradeQuantity(S, 22) / 100)
    * (1 + grid185 / 100)
    * (1 + jellyUpgradeQuantity(S, 32) * Math.floor(n(options.totalCellLevel ?? jellyTotalCellLevel(S)) / 100) / 100)
    * (1 + (
      jellyFeverBonus(S, 0, 0, options.feverRampPct, fever)
      + (jellyFeverBonus(S, 1, 0, 0, fever)
        + jellyFeverBonus(S, 4, 0, 0, fever))
    ) / 100);
}

export function jellyCellSpeedMultiplier(S, fever) {
  return 1 + (jellyFeverBonus(S, 4, 1, 0, fever) + jellyFeverBonus(S, 5, 0, 0, fever)) / 100;
}

export function jellyAttackCadence(baseCooldown, options = {}) {
  const globalSpeed = Math.max(1e-12, n(options.globalSpeed) || 1);
  const localSpeed = Math.max(1e-12, n(options.localSpeed) || 1);
  const cooldownProgress = options.cooldownProgress == null
    ? Math.max(0, n(baseCooldown)) / globalSpeed
    : Math.max(0, n(options.cooldownProgress));
  const progressPerFrame = options.progressPerFrame == null
    ? 0.65 * localSpeed
    : Math.max(1e-12, n(options.progressPerFrame));
  const framesPerAttack = Math.max(1, Math.ceil(cooldownProgress / progressPerFrame));
  return {
    cooldownProgress,
    progressPerFrame,
    framesPerAttack,
    secondsPerAttack: framesPerAttack / 60,
    attacksPerSecond: 60 / framesPerAttack,
  };
}

export function jellyCellExpMultiplier(S, fever) {
  return (1 + jellyFeverBonus(S, 3, 0, 0, fever) / 100)
    * (1 + (jellyUpgradeQuantity(S, 30) + (jellyUpgradeQuantity(S, 31) + jellyUpgradeQuantity(S, 10))) / 100)
    * (1 + jellyUpgradeQuantity(S, 11) / 100);
}

function _jellyCurrencyRuntimeFactors(S, fever, totalCellLevel) {
  const grid187 = gbWith(S?.gridLevels || [], S?.shapeOverlay || [], 187, { abm: n(S?.allBonusMulti) || 1 });
  const atom15 = n(S?.atomsData?.[15]) * n(AtomInfo?.[15]?.[4]);
  const beforeDps = (1 + (
    jellyUpgradeQuantity(S, 23)
    + (jellyUpgradeQuantity(S, 24)
      + (jellyUpgradeQuantity(S, 25)
        + jellyUpgradeQuantity(S, 33) * totalCellLevel))
  ) / 100)
    * (1 + valueOf(arcadeBonus(72, S)) / 100)
    * (1 + grid187 / 100)
    * (1 + jellyFeverBonus(S, 2, 0, 0, fever) / 100)
    * (1 + (S?.bundlesData?.ban_j ? 1 : 0))
    * (1 + jellyCompletionBonus(24, S) / 100);
  return {
    beforeDps,
    upgrade26: 1 + jellyUpgradeQuantity(S, 26) / 100,
    upgrade27: 1 + jellyUpgradeQuantity(S, 27) / 100,
    atom15: 1 + atom15 / 100,
  };
}

function _jellyCurrencyMultiplierFromFactors(factors, bestDps) {
  return factors.beforeDps
    * jellyBestDpsMultiplierFromValue(bestDps)
    * factors.upgrade26
    * factors.upgrade27
    * factors.atom15;
}

export function jellyCurrencyMultiplier(S, fever, options = {}) {
  const totalCellLevel = n(options.totalCellLevel ?? jellyTotalCellLevel(S));
  const bestDps = n(options.bestDps ?? jellyProgress(S).bestDps);
  return _jellyCurrencyMultiplierFromFactors(_jellyCurrencyRuntimeFactors(S, fever, totalCellLevel), bestDps);
}

export function jellyCellDamageBreakdown(S, options = {}) {
  const fever = options.fever;
  const feverIndex = Math.floor(n(fever));
  const totalCellLevel = n(options.totalCellLevel ?? jellyTotalCellLevel(S));
  const gridBonus = gbWith(S?.gridLevels || [], S?.shapeOverlay || [], 185, { abm: n(S?.allBonusMulti) || 1 });
  const additive = [
    { label: jellyUpgradeData(18)?.name || 'Cell Destruction I', value: jellyUpgradeQuantity(S, 18), unit: '%', unlockId: 18 },
    { label: jellyUpgradeData(19)?.name || 'Cell Destruction II', value: jellyUpgradeQuantity(S, 19), unit: '%', unlockId: 19 },
    { label: jellyUpgradeData(20)?.name || 'Cell Destruction III', value: jellyUpgradeQuantity(S, 20), unit: '%', unlockId: 20 },
    { label: 'Spelunking Palette bonus', value: computePaletteBonus(1, S), unit: '%' },
  ];
  const feverValue = jellyFeverBonus(S, 0, 0, options.feverRampPct, fever)
    + jellyFeverBonus(S, 1, 0, 0, fever)
    + jellyFeverBonus(S, 4, 0, 0, fever);
  const factors = [
    { label: 'Additive Cell Damage', value: 1 + additive.reduce((sum, row) => sum + row.value, 0) / 100, unit: 'x', children: additive },
    { label: jellyUpgradeData(21)?.name || 'Cell Desolation I', value: 1 + jellyUpgradeQuantity(S, 21) / 100, unit: 'x', unlockId: 21 },
    { label: jellyUpgradeData(22)?.name || 'Cell Desolation II', value: 1 + jellyUpgradeQuantity(S, 22) / 100, unit: 'x', unlockId: 22 },
    { label: 'Research Grid Cell Damage', value: 1 + gridBonus / 100, unit: 'x', children: [{ label: 'Grid bonus', value: gridBonus, unit: '%' }] },
    {
      label: jellyUpgradeData(32)?.name || 'Cell Metabolism',
      value: 1 + jellyUpgradeQuantity(S, 32) * Math.floor(totalCellLevel / 100) / 100,
      unit: 'x',
      unlockId: 32,
      children: [
        { label: 'Combined cell levels', value: totalCellLevel, unit: '' },
        { label: 'Runtime groups of 100 levels', value: Math.floor(totalCellLevel / 100), unit: '' },
        { label: 'Damage per group', value: jellyUpgradeQuantity(S, 32), unit: '%' },
      ],
    },
    {
      label: 'Selected Fever damage',
      value: 1 + feverValue / 100,
      unit: 'x',
      unlockId: 16,
      children: [{
        label: feverIndex === 0
          ? 'COLD Fever at operation start (+1% each elapsed second)'
          : `${feverModeName(fever)} Fever`,
        value: feverValue,
        unit: '%',
      }],
    },
  ];
  return { value: jellyCellDamageMultiplier(S, options), factors };
}

export function jellyCellSpeedBreakdown(S, fever) {
  const rabies = jellyFeverBonus(S, 4, 1, 0, fever);
  const plague = jellyFeverBonus(S, 5, 0, 0, fever);
  return {
    value: jellyCellSpeedMultiplier(S, fever),
    factors: [{
      label: 'Selected Fever speed',
      value: 1 + (rabies + plague) / 100,
      unit: 'x',
      unlockId: 16,
      children: [{ label: `${feverModeName(fever)} Fever`, value: rabies + plague, unit: '%' }],
    }],
  };
}

export function jellyCellExpBreakdown(S, fever) {
  const additive = [
    { label: jellyUpgradeData(30)?.name || 'Cell Adaptation I', value: jellyUpgradeQuantity(S, 30), unit: '%', unlockId: 30 },
    { label: jellyUpgradeData(31)?.name || 'Cell Adaptation II', value: jellyUpgradeQuantity(S, 31), unit: '%', unlockId: 31 },
    { label: jellyUpgradeData(10)?.name || 'Cell Biology', value: jellyUpgradeQuantity(S, 10), unit: '%', unlockId: 10 },
  ];
  const feverValue = jellyFeverBonus(S, 3, 0, 0, fever);
  return {
    value: jellyCellExpMultiplier(S, fever),
    available: jellyUpgradeQuantity(S, 10) >= 1,
    factors: [
      { label: 'Selected Fever EXP', value: 1 + feverValue / 100, unit: 'x', unlockId: 16, children: [{ label: `${feverModeName(fever)} Fever`, value: feverValue, unit: '%' }] },
      { label: 'Additive Cell EXP', value: 1 + additive.reduce((sum, row) => sum + row.value, 0) / 100, unit: 'x', children: additive },
      { label: jellyUpgradeData(11)?.name || 'Cell Evolution', value: 1 + jellyUpgradeQuantity(S, 11) / 100, unit: 'x', unlockId: 11 },
    ],
  };
}

export function jellyBloodcellBreakdown(S, fever, options = {}) {
  const totalCellLevel = n(options.totalCellLevel ?? jellyTotalCellLevel(S));
  const bestDps = n(options.bestDps ?? jellyProgress(S).bestDps);
  const gridBonus = gbWith(S?.gridLevels || [], S?.shapeOverlay || [], 187, { abm: n(S?.allBonusMulti) || 1 });
  const arcade = valueOf(arcadeBonus(72, S));
  const atom = n(S?.atomsData?.[15]) * n(AtomInfo?.[15]?.[4]);
  const additive = [
    { label: jellyUpgradeData(23)?.name || 'Bloodcell Coagulation', value: jellyUpgradeQuantity(S, 23), unit: '%', unlockId: 23 },
    { label: jellyUpgradeData(24)?.name || 'Bloodletting I', value: jellyUpgradeQuantity(S, 24), unit: '%', unlockId: 24 },
    { label: jellyUpgradeData(25)?.name || 'Bloodletting II', value: jellyUpgradeQuantity(S, 25), unit: '%', unlockId: 25 },
    {
      label: jellyUpgradeData(33)?.name || 'Cell Dialysis',
      value: jellyUpgradeQuantity(S, 33) * totalCellLevel,
      unit: '%',
      unlockId: 33,
      children: [
        { label: 'Combined cell levels', value: totalCellLevel, unit: '' },
        { label: 'Bloodcell gain per level', value: jellyUpgradeQuantity(S, 33), unit: '%' },
      ],
    },
  ];
  const factors = [
    { label: 'Additive Bloodcell Gain', value: 1 + additive.reduce((sum, row) => sum + row.value, 0) / 100, unit: 'x', children: additive },
    { label: 'Arcade bonus', value: 1 + arcade / 100, unit: 'x', children: [{ label: 'Arcade contribution', value: arcade, unit: '%' }] },
    { label: 'Research Grid Bloodcells', value: 1 + gridBonus / 100, unit: 'x', children: [{ label: 'Grid bonus', value: gridBonus, unit: '%' }] },
    {
      label: 'Selected Fever Bloodcells',
      value: 1 + jellyFeverBonus(S, 2, 0, 0, fever) / 100,
      unit: 'x',
      unlockId: 16,
      children: [{ label: `${feverModeName(fever)} Fever`, value: jellyFeverBonus(S, 2, 0, 0, fever), unit: '%' }],
    },
    { label: 'Jelly bundle', value: 1 + (S?.bundlesData?.ban_j ? 1 : 0), unit: 'x' },
    { label: 'Apol obstruction reward', value: 1 + jellyCompletionBonus(24, S) / 100, unit: 'x', rewardIndex: 24 },
    {
      label: jellyUpgradeData(12)?.name || 'DPS Biometrics',
      value: jellyBestDpsMultiplierFromValue(bestDps),
      unit: 'x',
      unlockId: 12,
      children: [{ label: 'Best DPS', value: bestDps, unit: '' }],
    },
    { label: jellyUpgradeData(26)?.name || 'Blood Tribunal I', value: 1 + jellyUpgradeQuantity(S, 26) / 100, unit: 'x', unlockId: 26 },
    { label: jellyUpgradeData(27)?.name || 'Blood Tribunal II', value: 1 + jellyUpgradeQuantity(S, 27) / 100, unit: 'x', unlockId: 27 },
    { label: 'Sulfur atom', value: 1 + atom / 100, unit: 'x', children: [{ label: 'Atom contribution', value: atom, unit: '%' }] },
  ];
  return { value: jellyCurrencyMultiplier(S, fever, options), available: jellyUpgradeQuantity(S, 23) >= 1, factors };
}

export function jellyLayoutBreakdown(layout, S, options = {}) {
  const metrics = jellyLayoutMetrics(layout, S, options);
  if (!metrics.valid) return { available: false, reason: metrics.reason, metrics };
  return {
    available: true,
    metrics,
    layoutDamageMultiplier: metrics.damagePassive * metrics.virusMultiplier,
    layoutSpeedMultiplier: metrics.speedPassive,
    damageFactors: [
      {
        label: 'Additive damage passive',
        value: 1 + 0.5 * metrics.counts[2] + 0.1 * metrics.counts[0],
        unit: 'x',
        children: [
          { label: 'Effective Amoebas', value: metrics.counts[0], unit: '', unlockId: 0 },
          { label: 'Effective Ribosomes', value: metrics.counts[2], unit: '', unlockId: 2 },
        ],
      },
      {
        label: 'Gigacyst passive',
        value: 1 + 2 * metrics.counts[7],
        unit: 'x',
        unlockId: 7,
        children: [{ label: 'Effective Gigacysts', value: metrics.counts[7], unit: '' }],
      },
      { label: 'Virus infected slots', value: metrics.virusMultiplier, unit: 'x', unlockId: 5, children: [{ label: 'Unique infected slots', value: metrics.infectedSlots, unit: '' }] },
    ],
    speedFactors: [
      {
        label: 'Additive speed passive',
        value: 1 + 0.25 * metrics.counts[3] + 0.15 * metrics.counts[1],
        unit: 'x',
        children: [
          { label: 'Effective Plasmids', value: metrics.counts[1], unit: '', unlockId: 1 },
          { label: 'Effective Organelles', value: metrics.counts[3], unit: '', unlockId: 3 },
        ],
      },
      {
        label: 'Mitochondria passive',
        value: 1 + 0.5 * metrics.counts[6],
        unit: 'x',
        unlockId: 6,
        children: [{ label: 'Effective Mitochondria', value: metrics.counts[6], unit: '' }],
      },
    ],
  };
}

export function jellyDailyBloodcells(S) {
  return jellyProgress(S).bestBloodcells * jellyUpgradeQuantity(S, 38) / 100;
}

export function jellyDailyResetOutcome(S) {
  const progress = jellyProgress(S);
  const dailyTries = jellyDailyTries(S);
  const dailyBloodcells = jellyDailyBloodcells(S);
  return {
    triesBefore: progress.tries,
    dailyTries,
    triesAfter: Math.max(dailyTries, progress.tries),
    bloodcellsBefore: progress.bloodcells,
    dailyBloodcells,
    bloodcellsAfter: progress.bloodcells + dailyBloodcells,
  };
}

export function jellyLayoutMetrics(layout, S, options = {}) {
  if (!options.assumeValid) {
    const validation = jellyValidateLayout(layout, S);
    if (!validation.valid) return { valid: false, reason: validation.reason, dps: 0, cells: [] };
  }
  const context = options._metricContext || {};
  const entries = Object.entries(layout)
    .map(([anchor, type]) => ({ anchor: Number(anchor), type: Number(type) }))
    .sort((a, b) => a.anchor - b.anchor);
  const rawCounts = new Array(9).fill(0);
  for (const cell of entries) rawCounts[cell.type]++;
  const counts = rawCounts.slice();
  const countBonusUnlocked = context.countBonusUnlocked ?? jellyUpgradeQuantity(S, 14) >= 1;
  if (countBonusUnlocked) {
    for (let type = 0; type < counts.length; type++) if (type !== 5) counts[type] += Math.floor(counts[type] / 3);
  }

  const damagePassive = (1 + 200 * counts[7] / 100) * (1 + (50 * counts[2] + 10 * counts[0]) / 100);
  const mitochondriaSpeed = 1 + 50 * counts[6] / 100;
  const organellePlasmidSpeed = 1 + (25 * counts[3] + 15 * counts[1]) / 100;
  const speedPassive = mitochondriaSpeed * organellePlasmidSpeed;
  const unitCooldownMultiplier = 1 / mitochondriaSpeed * (1 / organellePlasmidSpeed);
  const organelleReach = new Set();
  for (const cell of entries) {
    if (cell.type !== 3) continue;
    _organelleReachSlots(cell.anchor).forEach(slot => organelleReach.add(slot));
  }

  const virusReach = new Set();
  for (const cell of entries) {
    if (cell.type !== 5) continue;
    const anchor = cell.anchor;
    virusReach.add(anchor - JELLY_COLS);
    virusReach.add(anchor + JELLY_COLS);
    if (anchor % JELLY_COLS > 0) virusReach.add(anchor - 1);
    if (anchor % JELLY_COLS < JELLY_COLS - 1) virusReach.add(anchor + 1);
  }

  const infectedSlots = new Set();
  for (const cell of entries) {
    const slots = jellyFootprintSlots(cell.anchor, cell.type) || [];
    if (slots.some(slot => virusReach.has(slot))) slots.forEach(slot => infectedSlots.add(slot));
  }
  const virusMultiplier = 1 + infectedSlots.size / 10;
  const cellDamage = context.cellDamage ?? jellyCellDamageMultiplier(S, options);
  const cellSpeed = context.cellSpeed ?? jellyCellSpeedMultiplier(S, options.fever);
  const proximityLevel = context.proximityLevel ?? jellyUpgradeQuantity(S, 13);
  const proximityMultiplier = 1 + proximityLevel / 100;
  const organelleMultiplier = context.organelleMultiplier
    ?? 1.5 + Math.min(0.25, Math.max(0, rogBonusQTY(63, S?.cachedUniqueSushi || 0) / 100));
  const roidLevel = context.roidLevel ?? jellyUpgradeQuantity(S, 29);
  const roidMultiplier = options.roidActive && roidLevel >= 1
    ? 1 + (50 + roidLevel) / 100
    : 1;
  const cellLevelDamage = context.cellLevelDamage ?? (1 + jellyUpgradeQuantity(S, 17));

  const cells = entries.map(cell => {
    const slots = jellyFootprintSlots(cell.anchor, cell.type) || [];
    const organelle = slots.some(slot => organelleReach.has(slot)) ? organelleMultiplier : 1;
    const proximity = proximityLevel >= 1 && PROXIMITY_ANCHORS.has(cell.anchor) ? proximityMultiplier : 1;
    const level = Math.max(0, Math.floor(n(options.cellLevels?.[cell.type] ?? jellyCellLevel(S, cell.type))));
    const damage = CELL_BASE_DAMAGE[cell.type]
      * cellDamage
      * damagePassive
      * (1 + level * cellLevelDamage / 100)
      * (1 + n(options.amoebaStacks) / 100)
      * virusMultiplier
      * proximity;
    const cooldownProgress = CELL_BASE_COOLDOWNS[cell.type] * (1 / cellSpeed) * unitCooldownMultiplier;
    const progressPerFrame = 0.65 * roidMultiplier * organelle * proximity;
    const cadence = jellyAttackCadence(CELL_BASE_COOLDOWNS[cell.type], {
      cooldownProgress,
      progressPerFrame,
    });
    return {
      ...cell,
      name: CELL_NAMES[cell.type],
      slots,
      organelle,
      proximity,
      damage,
      cooldownProgress: cadence.cooldownProgress,
      progressPerFrame: cadence.progressPerFrame,
      framesPerAttack: cadence.framesPerAttack,
      attacksPerSecond: cadence.attacksPerSecond,
      dps: damage * cadence.attacksPerSecond,
    };
  });
  return {
    valid: true,
    reason: '',
    counts,
    rawCounts,
    infectedSlots: infectedSlots.size,
    damagePassive,
    speedPassive,
    virusMultiplier,
    cells,
    dps: cells.reduce((sum, cell) => sum + cell.dps, 0),
    attacksPerSecond: cells.reduce((sum, cell) => sum + cell.attacksPerSecond, 0),
    amoebaAttacksPerSecond: cells.filter(cell => cell.type === 0).reduce((sum, cell) => sum + cell.attacksPerSecond, 0),
  };
}

function _organelleReachSlots(anchor) {
  const candidates = [anchor - 36, anchor - 19, anchor - 17, anchor + 17, anchor + 19, anchor + 36];
  if (anchor % JELLY_COLS > 1) candidates.push(anchor - 2);
  if (anchor % JELLY_COLS < 16) candidates.push(anchor + 2);
  return candidates;
}

export function jellyOrganelleConnectionProfile(layout) {
  const entries = Object.entries(layout || {}).map(([anchor, type]) => ({
    anchor: Number(anchor),
    type: Number(type),
  }));
  const contactsByTarget = new Map();
  const linksByTarget = new Map();
  for (const source of entries) {
    if (source.type !== 3) continue;
    const reach = new Set(_organelleReachSlots(source.anchor));
    for (const target of entries) {
      const slots = jellyFootprintSlots(target.anchor, target.type) || [];
      const contacts = slots.reduce((sum, slot) => sum + Number(reach.has(slot)), 0);
      if (!contacts) continue;
      contactsByTarget.set(target.anchor, (contactsByTarget.get(target.anchor) || 0) + contacts);
      linksByTarget.set(target.anchor, (linksByTarget.get(target.anchor) || 0) + 1);
    }
  }
  const contacts = Array.from(contactsByTarget.values()).reduce((sum, value) => sum + value, 0);
  const links = Array.from(linksByTarget.values()).reduce((sum, value) => sum + value, 0);
  return {
    buffedCells: contactsByTarget.size,
    links,
    contacts,
    redundantContacts: Math.max(0, contacts - contactsByTarget.size),
    multiplyLinkedCells: Array.from(linksByTarget.values()).filter(value => value > 1).length,
  };
}

export function jellyOrganelleReanchorCandidates(layout, S, options = {}) {
  const organelleAnchors = Object.keys(layout || {})
    .map(Number)
    .filter(anchor => Number(layout[anchor]) === 3)
    .sort((a, b) => a - b);
  if (organelleAnchors.length < 2) return { layouts: [], nodes: 0 };
  const unlocked = jellyUnlockedSlots(S);
  const placements = Array.from(unlocked)
    .sort((a, b) => a - b)
    .filter(anchor => {
      const slots = jellyFootprintSlots(anchor, 3);
      return slots && slots.every(slot => unlocked.has(slot));
    });
  const nodeBudget = Math.max(1, Math.min(100000, Math.floor(n(options.nodeBudget) || 12000)));
  const retainLimit = Math.max(1, Math.min(100, Math.floor(n(options.retainLimit) || 24)));
  const structural = [];
  const structuralKeys = new Set();
  let nodes = 0;
  const addWithoutReplacement = (current, anchor) => {
    const next = jellyPlaceCell(current, anchor, 3, S);
    if (!next || Object.keys(next).length !== Object.keys(current).length + 1) return null;
    for (const [existingAnchor, type] of Object.entries(current)) {
      if (Number(next[existingAnchor]) !== Number(type)) return null;
    }
    return next;
  };
  const retain = candidate => {
    const key = jellyLayoutKey(candidate);
    if (structuralKeys.has(key)) return;
    structuralKeys.add(key);
    const profile = jellyOrganelleConnectionProfile(candidate);
    structural.push({ layout: candidate, profile, key });
    structural.sort((a, b) => (
      b.profile.buffedCells - a.profile.buffedCells
      || a.profile.redundantContacts - b.profile.redundantContacts
      || b.profile.links - a.profile.links
      || a.key.localeCompare(b.key)
    ));
    if (structural.length > retainLimit) {
      const removed = structural.pop();
      structuralKeys.delete(removed.key);
    }
  };
  for (let first = 0; first < organelleAnchors.length && nodes < nodeBudget; first++) {
    for (let second = first + 1; second < organelleAnchors.length && nodes < nodeBudget; second++) {
      let base = jellyRemoveCell(layout, organelleAnchors[first]);
      base = jellyRemoveCell(base, organelleAnchors[second]);
      for (let firstPlacement = 0; firstPlacement < placements.length && nodes < nodeBudget; firstPlacement++) {
        const withFirst = addWithoutReplacement(base, placements[firstPlacement]);
        nodes++;
        if (!withFirst) continue;
        for (let secondPlacement = firstPlacement + 1; secondPlacement < placements.length && nodes < nodeBudget; secondPlacement++) {
          const complete = addWithoutReplacement(withFirst, placements[secondPlacement]);
          nodes++;
          if (complete) retain(complete);
        }
      }
    }
  }
  return { layouts: structural.map(row => row.layout), nodes };
}

function seededRandom(seed) {
  let state = Math.floor(n(seed)) >>> 0;
  return function random() {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function randomInt(random, min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return min + Math.floor(random() * Math.max(1, max - min + 1));
}

function backIn(value) {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value * value * (2.70158 * value - 1.70158);
}

export function jellyProjectileHitDelay(anchor, type, random = () => 0.5) {
  const anchorX = 171 + 37 * (anchor % JELLY_COLS);
  const anchorY = 61 + 37 * Math.floor(anchor / JELLY_COLS);
  const duration = Math.trunc(1000 * (0.6 + Math.hypot(501 - anchorX, 245 - anchorY) / 400)) / 1000;
  const visual = jellyProjectileData(type);
  const startX = Math.round(anchorX + 18 * visual.offsetX + visual.spread * (2 * random() - 1));
  const startY = Math.round(anchorY + 18 * visual.offsetY + visual.spread * (2 * random() - 1));
  const hit = (x, y) => Math.abs(504 - x) < 25 && Math.abs(243 - y) < 25;
  if (hit(startX, startY)) return 0;
  const frames = Math.max(1, Math.ceil(duration * 60));
  for (let frame = 1; frame <= frames; frame++) {
    const eased = backIn(Math.min(1, frame / 60 / duration));
    const x = startX + (484 - startX) * eased;
    const y = startY + (228 - startY) * eased;
    if (hit(x, y)) return frame / 60;
  }
  return frames / 60;
}

function roidActivationTime(options) {
  if (options.useRoid === false || options.roidTiming === 'none') return Infinity;
  if (options.roidTiming == null || options.roidTiming === 'immediate') return 0;
  if (options.roidTiming === 'five-seconds') return 5;
  if (options.roidTiming === 'critical') {
    const obstruction = options.obstruction == null ? 0 : Math.max(0, Math.floor(n(options.obstruction)));
    return jellyBossTime(obstruction);
  }
  return Math.max(0, n(options.roidTiming));
}

function reviveTarget(policy, deadSlots, cells) {
  if (policy === 'none' || deadSlots.length === 0) return null;
  const details = deadSlots.map(slot => {
    const cell = cells.find(entry => entry.slots.includes(slot));
    return {
      slot,
      cell,
      immunoid: cell?.type === 4,
      anchor: cell?.anchor === slot,
      dps: cell?.dps || 0,
    };
  });
  if (policy === 'immunoid-first') {
    details.sort((a, b) => Number(b.immunoid) - Number(a.immunoid) || Number(b.anchor) - Number(a.anchor) || b.dps - a.dps || a.slot - b.slot);
  } else if (policy === 'anchor-first') {
    details.sort((a, b) => Number(b.anchor) - Number(a.anchor) || Number(b.immunoid) - Number(a.immunoid) || a.slot - b.slot);
  } else if (policy === 'dps-first') {
    details.sort((a, b) => Number(b.anchor) - Number(a.anchor) || b.dps - a.dps || Number(b.immunoid) - Number(a.immunoid) || a.slot - b.slot);
  } else {
    details.sort((a, b) => Number(b.immunoid) - Number(a.immunoid) || Number(a.anchor) - Number(b.anchor) || a.slot - b.slot);
  }
  return details[0]?.slot ?? null;
}

function quantile(values, fraction) {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function standardError(values) {
  if (values.length < 2) return 0;
  const average = mean(values);
  const variance = values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance / values.length);
}

function wilsonInterval(successes, trials, z = 1.959963984540054) {
  if (trials <= 0) return { low: 0, high: 0 };
  const probability = successes / trials;
  const z2 = z * z;
  const denominator = 1 + z2 / trials;
  const center = (probability + z2 / (2 * trials)) / denominator;
  const margin = z * Math.sqrt(probability * (1 - probability) / trials + z2 / (4 * trials * trials)) / denominator;
  return {
    low: Math.max(0, center - margin),
    high: Math.min(1, center + margin),
  };
}

function prepareJellyOperation(layout, S, options) {
  const progress = jellyProgress(S);
  const validation = jellyValidateLayout(layout, S);
  const obstruction = options.obstruction == null ? progress.obstruction : Math.max(0, Math.floor(n(options.obstruction)));
  const fever = options.fever == null ? progress.fever : Math.floor(n(options.fever));
  const hp = jellyBossHp(obstruction);
  const standardTime = jellyBossTime(obstruction);
  if (!validation.valid) return { validation, progress, obstruction, fever, hp, standardTime };

  const initialTotalCellLevel = options.cachedTotalCellLevel == null
    ? jellyTotalCellLevel(S)
    : Math.max(0, n(options.cachedTotalCellLevel));
  const levels = Array.from({ length: 9 }, (_, type) => jellyCellLevel(S, type));
  const exp = Array.from({ length: 9 }, (_, type) => jellyCellExp(S, type));
  const expMultiplier = jellyCellExpMultiplier(S, fever);
  const cellLevelPercent = 1 + jellyUpgradeQuantity(S, 17);
  const currencyFactors = _jellyCurrencyRuntimeFactors(S, fever, initialTotalCellLevel);
  const cellDamageBase = jellyCellDamageMultiplier(S, { fever, totalCellLevel: initialTotalCellLevel });
  const canLevel = jellyUpgradeQuantity(S, 10) >= 1;
  const criticalUnlocked = jellyUpgradeQuantity(S, 36) === 1;
  const amoebaUnlocked = jellyUpgradeQuantity(S, 28) >= 1;
  const dpsUnlocked = jellyUpgradeQuantity(S, 12) >= 1;
  const roidUnlocked = jellyUpgradeQuantity(S, 29) >= 1;
  const roidStart = roidUnlocked ? roidActivationTime(options) : Infinity;
  const initialMetrics = jellyLayoutMetrics(layout, S, { fever, totalCellLevel: initialTotalCellLevel });
  const cells = initialMetrics.cells.map(cell => ({
    ...cell,
    cooldown: cell.cooldownProgress,
  }));
  const allSlots = cells.flatMap(cell => cell.slots);
  return {
    validation, progress, obstruction, fever, hp, standardTime, initialTotalCellLevel,
    levels, exp, expMultiplier, cellLevelPercent, currencyFactors, cellDamageBase, canLevel,
    criticalUnlocked, amoebaUnlocked, dpsUnlocked, roidStart, initialMetrics, cells,
    allSlots, immunoidSlots: cells.filter(cell => cell.type === 4).flatMap(cell => cell.slots),
    revives: Math.max(0, Math.floor(jellyUpgradeQuantity(S, 35))),
  };
}

export function simulateJellyOperation(layout, S, options = {}) {
  const prepared = options._preparedSimulation || prepareJellyOperation(layout, S, options);
  const {
    validation, progress, obstruction, fever, hp, standardTime, initialTotalCellLevel,
    expMultiplier, cellLevelPercent, currencyFactors, cellDamageBase, canLevel, criticalUnlocked,
    amoebaUnlocked, dpsUnlocked, roidStart, initialMetrics, allSlots,
  } = prepared;
  if (!validation.valid) {
    return { valid: false, reason: validation.reason, obstruction, fever, hp, standardTime, success: false, time: 0, damage: 0, damagePct: 0 };
  }

  const seed = Math.floor(n(options.seed ?? 1));
  const generatedRandom = seededRandom(seed);
  let gameplayRandomCalls = 0;
  const random = () => {
    gameplayRandomCalls++;
    return generatedRandom();
  };
  const timerPhaseRandom = seededRandom(seed ^ 0x51ed270b);
  const frameSeconds = 1 / 60;
  const levels = prepared.levels.slice();
  const exp = prepared.exp.slice();
  const levelsBefore = levels.slice();
  const expBefore = exp.slice();
  const expGained = new Array(9).fill(0);
  const revivePolicy = options.revivePolicy || 'immunoid-first';
  let revivesRemaining = prepared.revives;
  let timerRemaining = standardTime;
  let feverSeconds = 0;
  let amoebaStacks = 0;
  let amoebaStacksAtCriticalStart = null;
  let maxAmoebaStacksAtFire = 0;
  let damageAtCriticalStart = null;
  let hitsAtCriticalStart = null;
  let bestDps = progress.bestDps;
  let displayedDps = 0;
  let peakDisplayedDps = 0;
  let damageBuckets = [0];
  let nextSecondTick = options.secondTickOffset == null ? timerPhaseRandom() : Math.max(0, n(options.secondTickOffset));
  let roidRemaining = 0;
  let roidUsed = false;
  let bossCounter = 0;
  let time = 0;
  let frameIndex = 0;
  let damage = 0;
  let remainingHp = hp;
  let bloodcells = 0;
  let hits = 0;
  let shots = 0;
  let deaths = 0;
  let revivesUsed = 0;
  let bossAttacks = 0;
  let immunoidHits = 0;
  let immunoidFocusTime = 0;
  let endedBy = 'running';
  const projectiles = [];
  const deathLog = [];
  const contribution = new Array(9).fill(0).map((_, type) => ({ type, name: CELL_NAMES[type], shots: 0, hits: 0, damage: 0, bloodcells: 0, exp: 0 }));

  const cells = prepared.cells.map(cell => ({
    ...cell,
    progress: 0,
  }));
  const cellsByAnchor = new Map(cells.map(cell => [cell.anchor, cell]));
  for (let anchor = 0; anchor < JELLY_SIZE; anchor++) {
    const cell = cellsByAnchor.get(anchor);
    if (cell) {
      const maximumOpeningProgress = Math.floor(Math.max(5, cell.cooldown - 1));
      const suppliedProgress = options.openingProgressByAnchor?.[cell.anchor];
      const sampledProgress = randomInt(random, 0, maximumOpeningProgress);
      cell.progress = suppliedProgress == null
        ? sampledProgress
        : Math.max(0, Math.min(maximumOpeningProgress, Math.floor(n(suppliedProgress))));
    }
    randomInt(random, 0, 140);
  }
  const openingProgressByAnchor = Object.fromEntries(cells.map(cell => [cell.anchor, cell.progress]));
  const alive = new Set(allSlots);
  const immunoidSlotOrder = prepared.immunoidSlots.slice();
  const slotOwners = new Map();
  for (const cell of cells) for (const slot of cell.slots) slotOwners.set(slot, cell);
  const sourceCriticalLimit = (3 * jellyBossAttackCooldown(obstruction) * (allSlots.length + prepared.revives + 1) + 1) / 60;
  const maxCriticalSeconds = options.maxCriticalSeconds == null
    ? sourceCriticalLimit
    : Math.max(0, n(options.maxCriticalSeconds));
  const maxTime = standardTime + maxCriticalSeconds;

  while (time < maxTime && endedBy === 'running') {
    const frameEnd = time + frameSeconds;
    while (dpsUnlocked && nextSecondTick < frameEnd) {
      damageBuckets.unshift(0);
      if (damageBuckets.length >= 6) damageBuckets.splice(4, 1);
      feverSeconds++;
      nextSecondTick += 1;
    }
    if (!roidUsed && time >= roidStart) {
      roidUsed = true;
      roidRemaining = 300;
    }
    roidRemaining--;
    const roidActive = roidRemaining > 0;
    const roidMultiplier = roidActive ? 1 + (50 + jellyUpgradeQuantity(S, 29)) / 100 : 1;

    for (const cell of cells) {
      if (!alive.has(cell.anchor)) continue;
      cell.progress += 0.65 * roidMultiplier * cell.organelle * cell.proximity;
      if (cell.progress >= cell.cooldown) {
        cell.progress = 0;
        maxAmoebaStacksAtFire = Math.max(maxAmoebaStacksAtFire, amoebaStacks);
        const levelFactor = 1 + levelsBefore[cell.type] * cellLevelPercent / 100;
        const coldFactor = fever === 0 && jellyUpgradeQuantity(S, 16) >= 1
          ? 1 + feverSeconds / 100
          : 1;
        const projectile = {
          arrivalFrame: frameIndex + Math.round(jellyProjectileHitDelay(cell.anchor, cell.type, random) * 60),
          damage: CELL_BASE_DAMAGE[cell.type]
            * (cellDamageBase * coldFactor)
            * initialMetrics.damagePassive
            * levelFactor
            * (1 + amoebaStacks / 100)
            * initialMetrics.virusMultiplier
            * cell.proximity,
          type: cell.type,
          anchor: cell.anchor,
        };
        projectiles.push(projectile);
        shots++;
        contribution[cell.type].shots++;
      }
    }

    for (let index = projectiles.length - 1; index >= 0; index--) {
      const projectile = projectiles[index];
      if (projectile.arrivalFrame > frameIndex) continue;
      projectiles.splice(index, 1);
      damage += projectile.damage;
      remainingHp -= projectile.damage;
      damageBuckets[0] += projectile.damage;
      const currencyMultiplier = _jellyCurrencyMultiplierFromFactors(currencyFactors, bestDps);
      const gainedBloodcells = projectile.damage * currencyMultiplier;
      bloodcells += gainedBloodcells;
      hits++;
      contribution[projectile.type].hits++;
      contribution[projectile.type].damage += projectile.damage;
      contribution[projectile.type].bloodcells += gainedBloodcells;
      if (amoebaUnlocked && projectile.type === 0) amoebaStacks++;
      if (canLevel) {
        exp[projectile.type] += expMultiplier;
        expGained[projectile.type] += expMultiplier;
        contribution[projectile.type].exp += expMultiplier;
      }
    }

    if (dpsUnlocked && damageBuckets.length > 3) {
      displayedDps = (damageBuckets[1] + damageBuckets[2] + damageBuckets[3]) / 3;
      peakDisplayedDps = Math.max(peakDisplayedDps, displayedDps);
      bestDps = Math.max(bestDps, displayedDps);
    }

    timerRemaining -= frameSeconds;
    time = frameEnd;
    if (amoebaStacksAtCriticalStart == null && timerRemaining < 0) {
      amoebaStacksAtCriticalStart = amoebaStacks;
      damageAtCriticalStart = damage;
      hitsAtCriticalStart = hits;
    }
    if (remainingHp <= 0) {
      endedBy = 'clear';
      break;
    }

    if (timerRemaining < 0) {
      const liveImmunoidSlots = immunoidSlotOrder.filter(slot => alive.has(slot));
      if (liveImmunoidSlots.length) immunoidFocusTime += frameSeconds;
      if (!criticalUnlocked) {
        endedBy = 'timer';
        break;
      }
      bossCounter++;
      const bossCooldown = jellyBossAttackCooldown(obstruction);
      if (bossCounter >= bossCooldown) {
        const liveSlots = allSlots.filter(slot => alive.has(slot));
        if (!liveSlots.length) {
          endedBy = 'all-slots-dead';
          break;
        }
        const focused = liveImmunoidSlots.length > 0;
        const pool = focused ? liveImmunoidSlots : liveSlots;
        const target = pool[randomInt(random, 0, pool.length - 1)];
        alive.delete(target);
        deaths++;
        bossAttacks++;
        const targetCell = slotOwners.get(target);
        deathLog.push({
          time,
          slot: target,
          anchor: targetCell?.anchor ?? null,
          type: targetCell?.type ?? null,
          focused,
          disabledAnchor: targetCell?.anchor === target,
          revived: false,
        });
        if (focused) {
          immunoidHits++;
          bossCounter = -2 * bossCooldown;
        } else {
          bossCounter = 0;
        }
        if (revivesRemaining > 0 && revivePolicy !== 'none') {
          const deadSlots = allSlots.filter(slot => !alive.has(slot));
          const revived = reviveTarget(revivePolicy, deadSlots, initialMetrics.cells);
          if (revived != null) {
            alive.add(revived);
            revivesRemaining--;
            revivesUsed++;
            for (let logIndex = deathLog.length - 1; logIndex >= 0; logIndex--) {
              if (deathLog[logIndex].slot === revived && !deathLog[logIndex].revived) {
                deathLog[logIndex].revived = true;
                break;
              }
            }
          }
        }
      }
    }
    if (endedBy === 'running' && timerRemaining < 0 && criticalUnlocked) {
      randomInt(random, -4, 4);
      randomInt(random, -2, 2);
    }
    frameIndex++;
  }

  if (endedBy === 'running') endedBy = 'simulation-cap';
  const levelsAtOperationEnd = levels.slice();
  const expAtOperationEnd = exp.slice();
  if (canLevel) {
    let leveled = true;
    while (leveled) {
      leveled = false;
      for (let type = 0; type < 9; type++) {
        const requirement = 20 * 1.3 ** levels[type];
        if (exp[type] >= requirement) {
          exp[type] -= requirement;
          levels[type]++;
          leveled = true;
          break;
        }
      }
    }
  }
  const success = endedBy === 'clear';
  const attemptSpent = obstruction > 1 ? 1 : 0;
  const obstructionAfter = success ? Math.min(obstruction + 1, jellyRewards().length - 1) : obstruction;
  const triesAfter = Math.max(0, progress.tries + (success ? 1 : 0) - attemptSpent);
  const bloodcellsAfter = progress.bloodcells + bloodcells;
  const bestBloodcellsAfter = Math.max(progress.bestBloodcells, bloodcells);
  return {
    valid: true,
    reason: '',
    seed,
    obstruction,
    fever,
    hp,
    standardTime,
    criticalUnlocked,
    time,
    normalTime: Math.min(time, standardTime),
    criticalTime: Math.max(0, time - standardTime),
    success,
    endedBy,
    damage,
    damagePct: hp > 0 ? damage / hp : 0,
    shots,
    hits,
    attacks: hits,
    openingProgressByAnchor,
    gameplayRandomCalls,
    projectilesRemaining: projectiles.length,
    bloodcells,
    bloodcellsGained: bloodcells,
    bloodcellsBefore: progress.bloodcells,
    bloodcellsAfter,
    bestBloodcellsBefore: progress.bestBloodcells,
    bestBloodcellsAfter,
    cellExp: expGained.reduce((sum, value) => sum + value, 0),
    expByType: expGained,
    expBefore,
    expAtOperationEnd,
    expAfter: exp,
    levelsBefore,
    levelsAtOperationEnd,
    levelsAfter: levels,
    cachedTotalCellLevel: initialTotalCellLevel,
    cachedTotalCellLevelRefreshesDuringOperation: false,
    amoebaStacks,
    amoebaStacksAtCriticalStart: amoebaStacksAtCriticalStart ?? amoebaStacks,
    maxAmoebaStacksAtFire,
    damageAtCriticalStart: damageAtCriticalStart ?? damage,
    hitsAtCriticalStart: hitsAtCriticalStart ?? hits,
    feverSeconds,
    displayedDps,
    peakDps: peakDisplayedDps,
    bestDpsBefore: progress.bestDps,
    bestDpsAfter: bestDps,
    deaths,
    bossAttacks,
    immunoidHits,
    immunoidFocusTime,
    liveSlots: alive.size,
    revivesUsed,
    revivesRemaining,
    roidUsed,
    roidStart: Number.isFinite(roidStart) ? roidStart : null,
    contribution,
    deathLog,
    attemptDelta: (success ? 1 : 0) - attemptSpent,
    triesBefore: progress.tries,
    triesAfter,
    obstructionBefore: obstruction,
    obstructionAfter,
    note: 'Seeded nominal-60-FPS source simulation. It reproduces operation mechanics and random distributions, but a save cannot recover the live client\'s global RNG state, one-second callback phase, frame stalls, or manual input timing.',
  };
}

function summarizeJellyTrials(results, trials, seed, includeTrials) {
  const valid = results.every(result => result.valid);
  if (!valid) return { valid: false, reason: results.find(result => !result.valid)?.reason || 'Invalid layout', trials, results: [] };
  const successes = results.filter(result => result.success);
  const times = successes.map(result => result.time);
  const damages = results.map(result => result.damage);
  const bloodcells = results.map(result => result.bloodcells);
  const cellExp = results.map(result => result.cellExp);
  const cellExpByType = Array.from({ length: 9 }, (_, type) => results.map(result => n(result.expByType?.[type])));
  const criticalTimes = results.map(result => result.criticalTime);
  const deaths = results.map(result => result.deaths);
  const revives = results.map(result => result.revivesUsed);
  const bestDps = results.map(result => result.bestDpsAfter);
  const bestDpsMultipliers = bestDps.map(jellyBestDpsMultiplierFromValue);
  const peakDps = results.map(result => result.peakDps);
  const normalDamage = results.map(result => n(result.damageAtCriticalStart));
  const criticalDamage = results.map(result => Math.max(0, n(result.damage) - n(result.damageAtCriticalStart)));
  const shots = results.map(result => n(result.shots));
  const hits = results.map(result => n(result.hits));
  const bossAttacks = results.map(result => n(result.bossAttacks));
  const immunoidFocusTime = results.map(result => n(result.immunoidFocusTime));
  const liveSlots = results.map(result => n(result.liveSlots));
  const attemptDelta = results.map(result => n(result.attemptDelta));
  const amoebaStacksAtCriticalStart = results.map(result => n(result.amoebaStacksAtCriticalStart));
  const amoebaStacksAtCriticalEnd = results.map(result => n(result.amoebaStacks));
  const meanCellTypeContribution = Array.from({ length: 9 }, (_, type) => ({
    type,
    name: CELL_NAMES[type],
    shots: mean(results.map(result => n(result.contribution?.[type]?.shots))),
    hits: mean(results.map(result => n(result.contribution?.[type]?.hits))),
    damage: mean(results.map(result => n(result.contribution?.[type]?.damage))),
    bloodcells: mean(results.map(result => n(result.contribution?.[type]?.bloodcells))),
    exp: mean(results.map(result => n(result.contribution?.[type]?.exp))),
  }));
  const clearInterval = wilsonInterval(successes.length, trials);
  return {
    valid: true,
    trials,
    seed,
    successCount: successes.length,
    clearProbability: successes.length / trials,
    clearProbabilityLow: clearInterval.low,
    clearProbabilityHigh: clearInterval.high,
    meanTime: mean(times),
    medianTime: quantile(times, 0.5),
    p90Time: quantile(times, 0.9),
    meanDamage: mean(damages),
    meanDamageStandardError: standardError(damages),
    medianDamage: quantile(damages, 0.5),
    meanBloodcells: mean(bloodcells),
    meanBloodcellsStandardError: standardError(bloodcells),
    medianBloodcells: quantile(bloodcells, 0.5),
    meanCellExp: mean(cellExp),
    meanCellExpStandardError: standardError(cellExp),
    meanCellExpByType: cellExpByType.map(mean),
    meanCellExpByTypeStandardError: cellExpByType.map(standardError),
    meanCriticalTime: mean(criticalTimes),
    meanCriticalTimeStandardError: standardError(criticalTimes),
    meanDeaths: mean(deaths),
    meanRevives: mean(revives),
    meanBestDps: mean(bestDps),
    meanBestDpsMultiplier: mean(bestDpsMultipliers),
    meanPeakDps: mean(peakDps),
    minPeakDps: Math.min(...peakDps),
    maxPeakDps: Math.max(...peakDps),
    meanNormalDamage: mean(normalDamage),
    meanNormalPhaseDamage: mean(normalDamage),
    meanCriticalDamage: mean(criticalDamage),
    meanCriticalPhaseDamage: mean(criticalDamage),
    meanShots: mean(shots),
    meanHits: mean(hits),
    meanBossAttacks: mean(bossAttacks),
    meanImmunoidFocusTime: mean(immunoidFocusTime),
    meanLiveSlots: mean(liveSlots),
    meanAttemptDelta: mean(attemptDelta),
    meanAmoebaStacksAtCriticalStart: mean(amoebaStacksAtCriticalStart),
    meanAmoebaStacksAtCriticalEnd: mean(amoebaStacksAtCriticalEnd),
    meanCellTypeContribution,
    meanCellContributionByType: meanCellTypeContribution,
    meanContributionByType: meanCellTypeContribution,
    minDamage: Math.min(...damages),
    maxDamage: Math.max(...damages),
    representative: results[0],
    results: includeTrials ? results : undefined,
    note: 'Monte Carlo aggregate of deterministic seeded runtime trials.',
  };
}

export function simulateJellyTrials(layout, S, options = {}) {
  const trials = Math.max(1, Math.min(8192, Math.floor(n(options.trials) || 64)));
  const seed = Math.floor(n(options.seed) || 1);
  const results = [];
  for (let index = 0; index < trials; index++) {
    results.push(simulateJellyOperation(layout, S, { ...options, seed: seed + index * 2654435761 }));
  }
  return summarizeJellyTrials(results, trials, seed, options.includeTrials);
}

function jellyProxySimulationSignature(options) {
  return JSON.stringify([
    options.objective ?? null,
    options.expCellType ?? null,
    options.obstruction ?? null,
    options.fever ?? null,
    options.roidTiming ?? null,
    options.useRoid ?? null,
    options.revivePolicy ?? null,
    options.maxCriticalSeconds ?? null,
    options.travelScale ?? null,
    options.openingFraction ?? null,
    options.anchorAttritionBias ?? null,
  ]);
}

function createJellyProxyRunner() {
  const cacheBySave = new WeakMap();
  return (layout, S, options = {}) => {
    let saveCache = cacheBySave.get(S);
    if (!saveCache) {
      saveCache = new Map();
      cacheBySave.set(S, saveCache);
    }
    const key = `${jellyLayoutKey(layout)}\u0000${jellyProxySimulationSignature(options)}`;
    if (!saveCache.has(key)) saveCache.set(key, proxyObjectiveScore(layout, S, options));
    return saveCache.get(key);
  };
}

function evaluateJellyProxy(layout, S, options) {
  return typeof options._proxyScore === 'function'
    ? options._proxyScore(layout, S, options)
    : proxyObjectiveScore(layout, S, options);
}

function jellyTrialSimulationSignature(options) {
  return JSON.stringify([
    options.obstruction ?? null,
    options.fever ?? null,
    options.roidTiming ?? null,
    options.useRoid ?? null,
    options.revivePolicy ?? null,
    options.cachedTotalCellLevel ?? null,
    options.secondTickOffset ?? null,
    options.openingProgressByAnchor ?? null,
    options.maxCriticalSeconds ?? null,
  ]);
}

function createJellyTrialRunner() {
  const cacheBySave = new WeakMap();
  return (layout, S, options = {}) => {
    const trials = Math.max(1, Math.min(8192, Math.floor(n(options.trials) || 64)));
    const seed = Math.floor(n(options.seed) || 1);
    let saveCache = cacheBySave.get(S);
    if (!saveCache) {
      saveCache = new Map();
      cacheBySave.set(S, saveCache);
    }
    const stateKey = `${jellyLayoutKey(layout)}\u0000${jellyTrialSimulationSignature(options)}`;
    let cachedState = saveCache.get(stateKey);
    if (!cachedState) {
      cachedState = {
        prepared: prepareJellyOperation(layout, S, options),
        trials: new Map(),
        summaries: new Map(),
      };
      saveCache.set(stateKey, cachedState);
    }
    const summaryKey = `${seed}|${trials}|${options.includeTrials === true ? 1 : 0}`;
    const cachedSummary = cachedState.summaries.get(summaryKey);
    if (cachedSummary) return cachedSummary;
    const results = new Array(trials);
    for (let index = 0; index < trials; index++) {
      const trialSeed = seed + index * 2654435761;
      let result = cachedState.trials.get(trialSeed);
      if (!result) {
        result = simulateJellyOperation(layout, S, {
          ...options,
          seed: trialSeed,
          _preparedSimulation: cachedState.prepared,
        });
        cachedState.trials.set(trialSeed, result);
      }
      results[index] = result;
    }
    const summary = summarizeJellyTrials(results, trials, seed, options.includeTrials);
    cachedState.summaries.set(summaryKey, summary);
    return summary;
  };
}

export function jellyOperationEstimate(layout, S, options = {}) {
  return simulateJellyTrials(layout, S, { trials: options.trials || 64, ...options });
}

function finiteOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

function clearProbabilityProxy(damageRatio) {
  const ratio = Math.max(0, n(damageRatio));
  if (ratio < 1) return Math.min(0.5, 0.5 * ratio * ratio);
  return Math.min(0.999, 0.5 + 0.5 * (1 - Math.exp(-(ratio - 1))));
}

export function jellyOperationInsights(operation, S, options = {}) {
  const valid = Boolean(operation?.valid);
  const clearProbability = valid ? Math.max(0, Math.min(1, n(operation.clearProbability))) : 0;
  const dailyAttempts = Math.max(0, Math.floor(n(options.dailyAttempts ?? jellyDailyTries(S))));
  const expectedAttemptsToClear = clearProbability > 0 ? 1 / clearProbability : null;
  const probabilityWithinDailyAttempts = dailyAttempts > 0
    ? 1 - (1 - clearProbability) ** dailyAttempts
    : 0;
  const expectedDaysToClear = expectedAttemptsToClear != null && dailyAttempts > 0
    ? expectedAttemptsToClear / dailyAttempts
    : null;
  const expectedDailyCyclesToClear = probabilityWithinDailyAttempts > 0
    ? 1 / probabilityWithinDailyAttempts
    : null;
  const savedDailyPassiveBloodcells = options.includeDailyPassive === false ? 0 : jellyDailyBloodcells(S);
  const expectedBloodcellsPerAttempt = valid ? n(operation.meanBloodcells) : 0;
  const expectedBloodcellsPerDailyCycle = expectedBloodcellsPerAttempt * dailyAttempts + savedDailyPassiveBloodcells;
  const expectedNetAttemptDeltaPerAttempt = valid ? n(operation.meanAttemptDelta) : 0;
  const expectedNetAttemptDeltaPerDailyCycle = expectedNetAttemptDeltaPerAttempt * dailyAttempts;
  const normalDamage = valid ? n(operation.meanNormalDamage ?? operation.meanNormalPhaseDamage) : 0;
  const criticalDamage = valid ? n(operation.meanCriticalDamage ?? operation.meanCriticalPhaseDamage) : 0;
  const totalPhaseDamage = normalDamage + criticalDamage;
  const expRows = [];
  for (let type = 0; type < jellyUnitsOwned(S); type++) {
    const currentLevel = jellyCellLevel(S, type);
    const currentExp = jellyCellExp(S, type);
    const requirement = jellyCellExpRequirement(S, type);
    const remainingExp = Math.max(0, requirement - currentExp);
    const meanExpPerAttempt = valid ? n(operation.meanCellExpByType?.[type]) : 0;
    const attemptsToNextLevel = remainingExp <= 0
      ? 0
      : meanExpPerAttempt > 0 ? remainingExp / meanExpPerAttempt : null;
    const daysToNextLevel = attemptsToNextLevel == null || dailyAttempts <= 0
      ? null
      : attemptsToNextLevel / dailyAttempts;
    expRows.push({
      type,
      name: CELL_NAMES[type],
      currentLevel,
      currentExp,
      requirement,
      remainingExp,
      meanExpPerAttempt,
      attemptsToNextLevel: finiteOrNull(attemptsToNextLevel),
      daysToNextLevel: finiteOrNull(daysToNextLevel),
    });
  }
  const currentObstruction = Math.max(0, Math.floor(n(
    options.obstruction
    ?? operation?.representative?.obstruction
    ?? operation?.obstruction
    ?? jellyProgress(S).obstruction
  )));
  const sourceTime = Math.max(1e-12, n(
    operation?.representative?.standardTime
    ?? jellyBossTime(currentObstruction)
  ));
  const sourceDamage = valid ? n(operation.meanDamage) : 0;
  const outlookLayout = options.layout;
  const useSurrogateOutlook = outlookLayout != null && jellyValidateLayout(outlookLayout, S).valid;
  const obstructionOutlookCount = Math.max(0, Math.min(6, 72 - currentObstruction));
  const obstructionOutlook = Array.from({ length: obstructionOutlookCount }, (_, offset) => {
    const obstruction = currentObstruction + offset;
    const hp = jellyBossHp(obstruction);
    const time = jellyBossTime(obstruction);
    let damageRatio;
    if (useSurrogateOutlook) {
      const surrogate = jellyOperationSurrogate(outlookLayout, S, {
        ...options,
        objective: 'clear',
        obstruction,
        fever: options.fever ?? operation?.fever ?? operation?.representative?.fever,
        roidTiming: options.roidTiming ?? operation?.roidTiming,
        revivePolicy: options.revivePolicy ?? operation?.revivePolicy,
      });
      damageRatio = surrogate.valid ? n(surrogate.damageRatio) : 0;
    } else {
      const estimatedDamage = sourceDamage * time / sourceTime;
      damageRatio = hp > 0 ? estimatedDamage / hp : 0;
    }
    const estimatedClearProbability = offset === 0 && valid
      ? clearProbability
      : clearProbabilityProxy(damageRatio);
    const expectedAttempts = estimatedClearProbability > 0 ? 1 / estimatedClearProbability : null;
    return {
      obstruction,
      hp,
      time,
      estimatedClearProbability,
      damageRatio,
      expectedAttempts: finiteOrNull(expectedAttempts),
      clearWithinDailyAttempts: dailyAttempts > 0
        ? 1 - (1 - estimatedClearProbability) ** dailyAttempts
        : 0,
    };
  });
  return {
    valid,
    trials: Math.max(0, Math.floor(n(operation?.trials))),
    clearProbability,
    dailyAttempts,
    expectedAttemptsToClear: finiteOrNull(expectedAttemptsToClear),
    probabilityWithinDailyAttempts,
    expectedDaysToClear: finiteOrNull(expectedDaysToClear),
    expectedDailyCyclesToClear: finiteOrNull(expectedDailyCyclesToClear),
    expectedBloodcellsPerAttempt,
    savedDailyPassiveBloodcells,
    expectedBloodcellsPerDailyCycle,
    expectedDailyBloodcells: expectedBloodcellsPerDailyCycle,
    expectedNetAttemptDeltaPerAttempt,
    expectedNetAttemptDelta: expectedNetAttemptDeltaPerAttempt,
    expectedNetAttemptDeltaPerDailyCycle,
    normalDamage,
    criticalDamage,
    normalDamageShare: totalPhaseDamage > 0 ? normalDamage / totalPhaseDamage : null,
    criticalDamageShare: totalPhaseDamage > 0 ? criticalDamage / totalPhaseDamage : null,
    expRows,
    cellExpRows: expRows,
    obstructionOutlook,
    obstructionOutlookEstimate: {
      method: useSurrogateOutlook ? 'layout-surrogate' : 'scaled-current-operation',
      probability: 'Current obstruction uses the simulated clear probability. Later rows convert deterministic damage ratio into a bounded probability proxy.',
      note: useSurrogateOutlook
        ? 'Each row uses the deterministic Jelly operation surrogate for the supplied options.layout; no per-obstruction Monte Carlo is run.'
        : 'Without options.layout, mean current-operation damage is scaled by the obstruction time limit before comparison with each obstruction HP; no per-obstruction Monte Carlo is run.',
    },
  };
}

function availableFeverTypes(S, requested) {
  if (requested != null && requested !== 'auto') return [Math.max(0, Math.floor(n(requested)))];
  const count = Math.max(0, Math.min(6, Math.floor(jellyUpgradeQuantity(S, 16))));
  if (count <= 0) return [jellyProgress(S).fever];
  return Array.from({ length: count }, (_, fever) => fever);
}

function availableRoidTimings(S, obstruction, requested) {
  if (requested != null && requested !== 'auto' && requested !== 'optimize') return [requested];
  if (jellyUpgradeQuantity(S, 29) < 1) return ['none'];
  const standardTime = jellyBossTime(obstruction);
  const timings = [];
  for (let second = 0; second <= standardTime; second += 5) timings.push(second);
  timings.push(Math.max(0, standardTime - 5), standardTime);
  return Array.from(new Set(timings));
}

function availableRevivePolicies(S, requested) {
  if (requested != null && requested !== 'auto' && requested !== 'optimize') return [requested];
  if (jellyUpgradeQuantity(S, 35) < 1) return ['none'];
  return ['immunoid-first', 'anchor-first', 'dps-first', 'soak-first'];
}

function normalizeExpCellType(S, value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return -1;
  return Math.max(0, Math.min(jellyUnitsOwned(S) - 1, Math.floor(parsed)));
}

function operationExpValue(operation, expCellType) {
  return expCellType < 0 ? n(operation?.meanCellExp) : n(operation?.meanCellExpByType?.[expCellType]);
}

export function optimizeJellyOperationPolicy(layout, S, options = {}) {
  const objective = options.objective || 'clear';
  const expCellType = normalizeExpCellType(S, options.expCellType);
  const obstruction = options.obstruction == null ? jellyProgress(S).obstruction : Math.max(0, Math.floor(n(options.obstruction)));
  const trials = Math.max(4, Math.min(8192, Math.floor(n(options.trials) || 32)));
  const defaultScreeningTrials = Math.min(32, Math.max(4, Math.ceil(Math.sqrt(trials))));
  const screeningTrials = Math.max(2, Math.min(trials, Math.floor(
    options.screeningTrials == null ? defaultScreeningTrials : n(options.screeningTrials)
  )));
  const feverTypes = availableFeverTypes(S, options.fever);
  const roidTimings = availableRoidTimings(S, obstruction, options.roidTiming);
  const revivePolicies = availableRevivePolicies(S, options.revivePolicy);
  const simulate = typeof options._simulateTrials === 'function' ? options._simulateTrials : simulateJellyTrials;
  const screened = [];
  const maximumFinalists = trials >= 128 ? 8 : trials >= 32 ? 5 : 3;
  const progressTotal = Math.max(1, feverTypes.length + 2 * roidTimings.length + 18 + 4 * revivePolicies.length + maximumFinalists);
  let policyIndex = 0;
  const reportProgress = (phase, completed) => options.onProgress?.({ phase, completed, total: progressTotal });
  function screen(fever, roidTiming, revivePolicy) {
    const key = `${fever}|${roidTiming}|${revivePolicy}`;
    if (screened.some(candidate => candidate.key === key)) return;
    const simulation = simulate(layout, S, {
      ...options,
      obstruction,
      fever,
      roidTiming,
      revivePolicy,
      trials: screeningTrials,
      seed: Math.floor(n(options.seed) || 1),
    });
    screened.push({
      key,
      fever,
      roidTiming,
      revivePolicy,
      screening: simulation,
      score: simulatedObjectiveScore(simulation, objective, expCellType),
      index: policyIndex++,
    });
    reportProgress('Screening operation policies', screened.length);
  }
  const defaultRoid = roidTimings[0];
  const defaultRevive = revivePolicies[0];
  for (const fever of feverTypes) screen(fever, defaultRoid, defaultRevive);
  const bestFevers = screened.slice().sort((a, b) => b.score - a.score || a.index - b.index).slice(0, 2).map(candidate => candidate.fever);
  for (const fever of bestFevers) {
    for (const roidTiming of roidTimings) screen(fever, roidTiming, defaultRevive);
  }
  const coarseTimingLeaders = screened.slice().sort((a, b) => b.score - a.score || a.index - b.index).slice(0, 2);
  for (const candidate of coarseTimingLeaders) {
    if (!Number.isFinite(candidate.roidTiming)) continue;
    const start = Math.max(0, Math.floor(candidate.roidTiming) - 4);
    const end = Math.min(jellyBossTime(obstruction), Math.ceil(candidate.roidTiming) + 4);
    for (let second = start; second <= end; second++) screen(candidate.fever, second, defaultRevive);
  }
  const bestTimings = screened.slice().sort((a, b) => b.score - a.score || a.index - b.index).slice(0, 4);
  for (const candidate of bestTimings) {
    for (const revivePolicy of revivePolicies) {
      screen(candidate.fever, candidate.roidTiming, revivePolicy);
    }
  }
  screened.sort((a, b) => b.score - a.score || a.index - b.index);
  const leaderBounds = operationConfidenceBounds(screened[0]?.screening, objective, expCellType);
  const finalistCandidates = screened.filter(candidate => {
    const bounds = operationConfidenceBounds(candidate.screening, objective, expCellType);
    return bounds[0] <= leaderBounds[1] && leaderBounds[0] <= bounds[1];
  }).slice(0, maximumFinalists);
  for (const candidate of screened.slice(0, Math.min(3, screened.length))) {
    if (!finalistCandidates.includes(candidate)) finalistCandidates.push(candidate);
  }
  finalistCandidates.sort((a, b) => b.score - a.score || a.index - b.index);
  if (finalistCandidates.length > maximumFinalists) finalistCandidates.length = maximumFinalists;
  const finalists = finalistCandidates.map((candidate, finalistIndex) => {
    const simulation = simulate(layout, S, {
      ...options,
      obstruction,
      fever: candidate.fever,
      roidTiming: candidate.roidTiming,
      revivePolicy: candidate.revivePolicy,
      trials,
      seed: Math.floor(n(options.seed) || 1),
    });
    reportProgress('Confirming best policies', progressTotal - finalistCandidates.length + finalistIndex + 1);
    return {
      ...candidate,
      simulation,
      score: simulatedObjectiveScore(simulation, objective, expCellType),
    };
  }).sort((a, b) => b.score - a.score || a.index - b.index);
  const best = finalists[0];
  reportProgress('Operation policy complete', progressTotal);
  return {
    ...best.simulation,
    objective,
    expCellType,
    fever: best.fever,
    roidTiming: best.roidTiming,
    revivePolicy: best.revivePolicy,
    policiesEvaluated: screened.length,
    screeningTrials,
    note: `${best.simulation.note} Fever, Stronkroid timing, and revival policy were selected by bounded policy search.`,
  };
}

const JELLY_QUALITY_PROFILES = {
  fast: [8, 32, 128],
  balanced: [16, 64, 256],
  thorough: [32, 128, 512],
};

const JELLY_STRATEGY_PROFILES = {
  conservative: { candidateCap: 8, beamWidth: 6, confidenceWeight: -1 },
  balanced: { candidateCap: 12, beamWidth: 8, confidenceWeight: 0 },
  aggressive: { candidateCap: 16, beamWidth: 10, confidenceWeight: 1 },
  progression: { candidateCap: 12, beamWidth: 8, confidenceWeight: 0 },
  bloodcells: { candidateCap: 12, beamWidth: 8, confidenceWeight: 0 },
  exp: { candidateCap: 12, beamWidth: 8, confidenceWeight: 0 },
  critical: { candidateCap: 12, beamWidth: 8, confidenceWeight: 0 },
  'long-term': { candidateCap: 16, beamWidth: 10, confidenceWeight: 1 },
  'low-risk': { candidateCap: 8, beamWidth: 6, confidenceWeight: -1 },
};

function jellyQualityOptions(options = {}) {
  const quality = Object.hasOwn(JELLY_QUALITY_PROFILES, options.quality) ? options.quality : 'balanced';
  const nominal = JELLY_QUALITY_PROFILES[quality];
  if (options.trials == null) {
    return {
      quality,
      screeningTrials: nominal[0],
      racingTrials: nominal[1],
      finalTrials: nominal[2],
      stages: nominal.slice(),
    };
  }
  const finalTrials = Math.max(1, Math.min(8192, Math.floor(n(options.trials) || nominal[2])));
  const screeningTrials = Math.max(1, Math.min(
    finalTrials,
    Math.floor(n(options.screeningTrials) || Math.min(nominal[0], finalTrials))
  ));
  const racingTrials = Math.max(screeningTrials, Math.min(
    finalTrials,
    Math.floor(n(options.racingTrials) || Math.min(nominal[1], finalTrials))
  ));
  return {
    quality,
    screeningTrials,
    racingTrials,
    finalTrials,
    stages: Array.from(new Set([screeningTrials, racingTrials, finalTrials])),
  };
}

function jellyStrategyOptions(options = {}) {
  const strategy = Object.hasOwn(JELLY_STRATEGY_PROFILES, options.strategy) ? options.strategy : 'balanced';
  const preset = JELLY_STRATEGY_PROFILES[strategy];
  return {
    strategy,
    candidateCap: Math.max(2, Math.min(24, Math.floor(n(options.candidateCap) || preset.candidateCap))),
    beamWidth: Math.max(2, Math.min(20, Math.floor(n(options.sectionBeamWidth ?? options.beamWidth) || preset.beamWidth))),
    confidenceWeight: preset.confidenceWeight,
  };
}

function operationObjectiveValue(operation, objective, expCellType) {
  if (!operation?.valid) return 0;
  if (objective === 'clear') return n(operation.clearProbability);
  if (objective === 'bloodcells') return n(operation.meanBloodcells);
  if (objective === 'exp') return operationExpValue(operation, expCellType);
  if (objective === 'survival') return n(operation.meanCriticalTime);
  return n(operation.meanDamage);
}

function trialObjectiveValue(result, objective, expCellType) {
  if (objective === 'clear') return result?.success ? 1 : 0;
  if (objective === 'bloodcells') return n(result?.bloodcells);
  if (objective === 'exp') {
    return expCellType < 0
      ? n(result?.cellExp)
      : n(result?.expByType?.[expCellType]);
  }
  if (objective === 'survival') return n(result?.criticalTime);
  return n(result?.damage);
}

function pairedOperationConfidence(candidate, baseline, objective, expCellType) {
  const candidateResults = candidate?.results;
  const baselineResults = baseline?.results;
  if (!Array.isArray(candidateResults) || !Array.isArray(baselineResults)) return null;
  const count = Math.min(candidateResults.length, baselineResults.length);
  if (!count) return null;
  const differences = [];
  let wins = 0;
  let ties = 0;
  for (let index = 0; index < count; index++) {
    const difference = trialObjectiveValue(candidateResults[index], objective, expCellType)
      - trialObjectiveValue(baselineResults[index], objective, expCellType);
    differences.push(difference);
    if (difference > 0) wins++;
    else if (difference === 0) ties++;
  }
  const meanDifference = mean(differences);
  const margin = 1.96 * standardError(differences);
  return {
    trials: count,
    chanceBeatsBaseline: (wins + 0.5 * ties) / count,
    meanDifference,
    low: meanDifference - margin,
    high: meanDifference + margin,
  };
}

export function simulateJellyPairedAudit(candidateLayout, baselineLayout, S, options = {}) {
  const trials = Math.max(1, Math.min(8192, Math.floor(n(options.trials) || 512)));
  const seed = Math.floor(n(options.seed) || 1);
  const seedOffset = Math.max(0, Math.floor(n(options.seedOffset)));
  const objective = options.objective || 'clear';
  const expCellType = normalizeExpCellType(S, options.expCellType);
  const candidatePolicy = options.candidatePolicy || {};
  const baselinePolicy = options.baselinePolicy || {};
  let sum = 0;
  let sumSquares = 0;
  let normalizedSum = 0;
  let normalizedSumSquares = 0;
  let wins = 0;
  let ties = 0;
  let minDifference = Infinity;
  let maxDifference = -Infinity;
  for (let index = 0; index < trials; index++) {
    const trialSeed = seed + (seedOffset + index) * 2654435761;
    const candidate = simulateJellyOperation(candidateLayout, S, {
      ...options,
      ...candidatePolicy,
      seed: trialSeed,
    });
    const baseline = simulateJellyOperation(baselineLayout, S, {
      ...options,
      ...baselinePolicy,
      seed: trialSeed,
    });
    if (!candidate.valid || !baseline.valid) {
      return {
        valid: false,
        reason: candidate.reason || baseline.reason || 'Invalid paired-audit layout',
        trials: index,
      };
    }
    const difference = trialObjectiveValue(candidate, objective, expCellType)
      - trialObjectiveValue(baseline, objective, expCellType);
    const candidateValue = trialObjectiveValue(candidate, objective, expCellType);
    const baselineValue = trialObjectiveValue(baseline, objective, expCellType);
    const normalizedDifference = objective === 'clear'
      ? difference
      : Math.max(-1, Math.min(1, difference / (1 + Math.abs(candidateValue) + Math.abs(baselineValue))));
    sum += difference;
    sumSquares += difference * difference;
    normalizedSum += normalizedDifference;
    normalizedSumSquares += normalizedDifference * normalizedDifference;
    minDifference = Math.min(minDifference, difference);
    maxDifference = Math.max(maxDifference, difference);
    if (difference > 0) wins++;
    else if (difference === 0) ties++;
  }
  return {
    valid: true,
    objective,
    expCellType,
    seed,
    seedOffset,
    trials,
    sum,
    sumSquares,
    normalizedSum,
    normalizedSumSquares,
    wins,
    ties,
    minDifference,
    maxDifference,
  };
}

export function mergeJellyPairedAudit(chunks, options = {}) {
  const validChunks = (chunks || []).filter(chunk => chunk?.valid && chunk.trials > 0);
  const trials = validChunks.reduce((total, chunk) => total + chunk.trials, 0);
  if (!trials) return { valid: false, reason: 'No paired audit trials were completed', trials: 0 };
  const sum = validChunks.reduce((total, chunk) => total + n(chunk.sum), 0);
  const sumSquares = validChunks.reduce((total, chunk) => total + n(chunk.sumSquares), 0);
  const hasNormalizedMoments = validChunks.every(chunk => (
    Number.isFinite(Number(chunk.normalizedSum))
    && Number.isFinite(Number(chunk.normalizedSumSquares))
  ));
  const normalizedSum = hasNormalizedMoments
    ? validChunks.reduce((total, chunk) => total + n(chunk.normalizedSum), 0)
    : 0;
  const normalizedSumSquares = hasNormalizedMoments
    ? validChunks.reduce((total, chunk) => total + n(chunk.normalizedSumSquares), 0)
    : 0;
  const wins = validChunks.reduce((total, chunk) => total + Math.floor(n(chunk.wins)), 0);
  const ties = validChunks.reduce((total, chunk) => total + Math.floor(n(chunk.ties)), 0);
  const meanDifference = sum / trials;
  const variance = trials > 1
    ? Math.max(0, (sumSquares - sum * sum / trials) / (trials - 1))
    : 0;
  const alpha = Math.max(1e-9, Math.min(0.5, n(options.alpha) || 0.05));
  const minDifference = Math.min(...validChunks.map(chunk => n(chunk.minDifference)));
  const maxDifference = Math.max(...validChunks.map(chunk => n(chunk.maxDifference)));
  const observedRange = Math.max(0, maxDifference - minDifference);
  const logTerm = Math.log(3 / alpha);
  const empiricalMargin = trials > 1
    ? Math.sqrt(2 * variance * logTerm / trials) + 3 * observedRange * logTerm / trials
    : Infinity;
  const meanDifferenceLow = meanDifference - empiricalMargin;
  const meanDifferenceHigh = meanDifference + empiricalMargin;
  const chanceBeatsBaseline = (wins + 0.5 * ties) / trials;
  const winRateMargin = Math.sqrt(Math.log(2 / alpha) / (2 * trials));
  const winRateLow = Math.max(0, chanceBeatsBaseline - winRateMargin);
  const winRateHigh = Math.min(1, chanceBeatsBaseline + winRateMargin);
  const objective = validChunks[0]?.objective || options.objective || 'clear';
  const normalizedMeanDifference = objective === 'clear' && !hasNormalizedMoments
    ? meanDifference
    : normalizedSum / trials;
  const normalizedVariance = objective === 'clear' && !hasNormalizedMoments
    ? variance
    : (trials > 1
    ? Math.max(0, (normalizedSumSquares - normalizedSum * normalizedSum / trials) / (trials - 1))
    : 0);
  const normalizedMargin = Math.sqrt(2 * Math.log(2 / alpha) / trials);
  const rigorousMetric = objective === 'clear'
    ? 'mean-clear-difference'
    : (hasNormalizedMoments ? 'normalized-objective-difference' : 'paired-win-rate');
  const low = objective !== 'clear' && !hasNormalizedMoments
    ? winRateLow - 0.5
    : normalizedMeanDifference - normalizedMargin;
  const high = objective !== 'clear' && !hasNormalizedMoments
    ? winRateHigh - 0.5
    : normalizedMeanDifference + normalizedMargin;
  return {
    valid: true,
    trials,
    wins,
    ties,
    objective,
    chanceBeatsBaseline,
    meanDifference,
    variance,
    standardError: Math.sqrt(variance / trials),
    minDifference,
    maxDifference,
    normalizedMeanDifference,
    normalizedVariance,
    normalizedLow: low,
    normalizedHigh: high,
    alpha,
    low,
    high,
    meanDifferenceLow,
    meanDifferenceHigh,
    winRateLow,
    winRateHigh,
    rigorousMetric,
    classificationTarget: objective === 'clear'
      ? 'clear-probability advantage'
      : (hasNormalizedMoments ? 'normalized paired-objective advantage' : 'paired win-rate advantage'),
    classification: low > 0
      ? 'confirmed-better'
      : (high < 0 ? 'confirmed-worse' : 'statistically-unresolved'),
    method: objective === 'clear'
      ? 'alpha-spending-hoeffding-paired-clear-difference'
      : (hasNormalizedMoments
        ? 'alpha-spending-hoeffding-normalized-objective-difference'
        : 'alpha-spending-hoeffding-paired-win-rate'),
    note: objective === 'clear'
      ? 'The sequential claim uses a bounded [-1,1] paired clear-outcome difference with alpha spending.'
      : (hasNormalizedMoments
        ? 'The sequential claim uses a bounded signed objective difference divided by 1 + both absolute trial values; win rate and the raw objective-difference interval remain descriptive.'
        : 'Legacy chunks lack normalized moments, so the sequential claim conservatively falls back to the bounded paired win score.'),
  };
}

function stripTrialResults(operation) {
  if (!operation) return operation;
  const { results, ...summary } = operation;
  return summary;
}

function saveWithJellyPlots(S, plotIds) {
  let result = S;
  for (const plotId of plotIds) result = saveWithJellyPlot(result, plotId);
  return result;
}

const jellySearchStaticContextCache = new WeakMap();
function jellySearchStaticContext(S) {
  const unlockedSet = jellyUnlockedSlots(S);
  const signature = JSON.stringify([
    jellyUnitsOwned(S),
    Array.from(unlockedSet).sort((a, b) => a - b),
  ]);
  const cached = jellySearchStaticContextCache.get(S);
  if (cached?.signature === signature) return { ...cached, reused: true };
  const types = Array.from({ length: jellyUnitsOwned(S) }, (_, type) => type);
  const unlocked = Array.from(unlockedSet).sort((a, b) => a - b);
  const placements = [];
  const placementByType = types.map(() => []);
  for (const anchor of unlocked) {
    for (const type of types) {
      const slots = jellyFootprintSlots(anchor, type);
      if (!slots || !slots.every(slot => unlockedSet.has(slot))) continue;
      const placement = { anchor, type, slots };
      placements.push(placement);
      placementByType[type].push(placement);
    }
  }
  const context = { signature, types, unlockedSet, unlocked, placements, placementByType, reused: false };
  jellySearchStaticContextCache.set(S, context);
  return context;
}

function jellyLegalPlacementAnchors(S, type) {
  const unlocked = jellyUnlockedSlots(S);
  const anchors = [];
  for (let anchor = 0; anchor < JELLY_SIZE; anchor++) {
    const slots = jellyFootprintSlots(anchor, type);
    if (slots && slots.every(slot => unlocked.has(slot))) anchors.push(anchor);
  }
  return anchors;
}

function jellySectionGeometry(S, plotIds) {
  const baseSlots = jellyUnlockedSlots(S);
  const expandedSave = saveWithJellyPlots(S, plotIds);
  const expandedSlots = jellyUnlockedSlots(expandedSave);
  const newSlots = Array.from(expandedSlots).filter(slot => !baseSlots.has(slot)).sort((a, b) => a - b);
  const newlyLegalFootprintPlacements = [];
  const placementAnchorsByType = [];
  for (let type = 0; type < jellyUnitsOwned(S); type++) {
    const before = new Set(jellyLegalPlacementAnchors(S, type));
    const anchors = jellyLegalPlacementAnchors(expandedSave, type).filter(anchor => !before.has(anchor));
    placementAnchorsByType[type] = anchors;
    newlyLegalFootprintPlacements.push({
      type,
      name: CELL_NAMES[type],
      count: anchors.length,
    });
  }
  return {
    plotIds: plotIds.slice(),
    newUsableSlots: newSlots.length,
    newSlots,
    proximitySlots: newSlots.filter(slot => PROXIMITY_ANCHORS.has(slot)).length,
    newlyLegalFootprintPlacements,
    placementAnchorsByType,
    expandedSave,
  };
}

function jellyCompleteLayout(layout, S, options = {}, geometry = null) {
  const unlocked = Array.from(jellyUnlockedSlots(S)).sort((a, b) => a - b);
  const types = Array.from({ length: jellyUnitsOwned(S) }, (_, type) => type);
  const oneSlotTypes = types.filter(type => cellFootprint(type).length === 1);
  let completed = jellyValidateLayout(layout, S).valid ? { ...(layout || {}) } : {};
  const score = candidate => evaluateJellyProxy(candidate, S, options);
  const occupied = jellyLayoutOccupancy(completed);
  for (const slot of unlocked) {
    if (occupied.has(slot)) continue;
    let bestLayout = null;
    let bestScore = -Infinity;
    for (const type of oneSlotTypes) {
      const candidate = jellyPlaceCell(completed, slot, type, S);
      if (!candidate || Object.keys(candidate).length !== Object.keys(completed).length + 1) continue;
      const candidateScore = score(candidate);
      if (candidateScore > bestScore) {
        bestLayout = candidate;
        bestScore = candidateScore;
      }
    }
    if (bestLayout) {
      completed = bestLayout;
      occupied.set(slot, { anchor: slot, type: Number(completed[slot]) });
    }
  }

  const placementRows = [];
  if (geometry) {
    for (let type = 0; type < geometry.placementAnchorsByType.length; type++) {
      if (cellFootprint(type).length <= 1) continue;
      for (const anchor of geometry.placementAnchorsByType[type]) placementRows.push({ type, anchor });
    }
  }
  let currentScore = score(completed);
  for (const placement of placementRows.slice(0, Math.max(0, Math.min(48, Math.floor(n(options.localPlacementCap) || 24))))) {
    const placed = jellyPlaceCell(completed, placement.anchor, placement.type, S);
    if (!placed) continue;
    const candidate = jellyCompleteLayout(placed, S, { ...options, localPlacementCap: 0 }, null);
    const candidateScore = score(candidate);
    if (candidateScore > currentScore) {
      completed = candidate;
      currentScore = candidateScore;
    }
  }
  return completed;
}

function sectionStrategyScore(row, strategy) {
  const confidence = row.confidence;
  if (!confidence || strategy.confidenceWeight === 0) return row.objectiveGain;
  return strategy.confidenceWeight < 0
    ? confidence.low
    : row.objectiveGain + Math.max(0, confidence.high - row.objectiveGain) * 0.25;
}

function sectionSimulationTieBreak(row, objective, expCellType) {
  if (!row.operation) return -Infinity;
  if (objective === 'clear') return -n(row.operation.meanTime) * 1e9 + n(row.operation.meanDamage);
  return simulatedObjectiveScore(row.operation, objective, expCellType);
}

function compareSectionRows(a, b, strategy, objective, expCellType) {
  const finalistDifference = Number(b.finalist) - Number(a.finalist);
  if (finalistDifference) return finalistDifference;
  if (objective === 'clear' && a.operation && b.operation) {
    const aLow = n(a.operation.clearProbabilityLow);
    const aHigh = n(a.operation.clearProbabilityHigh);
    const bLow = n(b.operation.clearProbabilityLow);
    const bHigh = n(b.operation.clearProbabilityHigh);
    if (aLow > bHigh) return -1;
    if (bLow > aHigh) return 1;
    const secondaryDifference = sectionSimulationTieBreak(b, objective, expCellType)
      - sectionSimulationTieBreak(a, objective, expCellType);
    if (secondaryDifference) return secondaryDifference;
  }
  return sectionStrategyScore(b, strategy) - sectionStrategyScore(a, strategy)
    || sectionSimulationTieBreak(b, objective, expCellType) - sectionSimulationTieBreak(a, objective, expCellType)
    || b.proxyGain - a.proxyGain
    || a.plotIds.join(',').localeCompare(b.plotIds.join(','));
}

function simulateSectionCandidates(rows, baselineLayout, S, options, quality, strategy, reportProgress) {
  if (!rows.length) {
    const baseline = simulateJellyTrials(baselineLayout, S, {
      ...options,
      trials: quality.finalTrials,
      seed: Math.floor(n(options.seed) || 1),
    });
    return { rows, baseline: stripTrialResults(baseline) };
  }
  for (const row of rows) row.finalist = false;
  let active = rows.slice();
  let finalBaseline = null;
  for (let stageIndex = 0; stageIndex < quality.stages.length; stageIndex++) {
    const trials = quality.stages[stageIndex];
    const seed = Math.floor(n(options.seed) || 1);
    const baseline = simulateJellyTrials(baselineLayout, S, {
      ...options,
      trials,
      seed,
      includeTrials: true,
    });
    finalBaseline = baseline;
    for (let index = 0; index < active.length; index++) {
      const row = active[index];
      const simulation = simulateJellyTrials(row.layout, row._save, {
        ...options,
        trials,
        seed,
        includeTrials: true,
      });
      const confidence = pairedOperationConfidence(simulation, baseline, options.objective, options.expCellType);
      row.operation = simulation;
      row.objectiveValue = operationObjectiveValue(simulation, options.objective, options.expCellType);
      row.objectiveGain = upgradeMarginalScore(baseline, simulation, options.objective, options.expCellType);
      row.gainPerSlot = row.newUsableSlots > 0 ? row.objectiveGain / row.newUsableSlots : 0;
      row.confidence = confidence;
      row.chanceBeatsBaseline = confidence?.chanceBeatsBaseline ?? null;
      row.simulationTrials = trials;
      row.finalist = stageIndex === quality.stages.length - 1;
      reportProgress?.(`Simulating section candidates (${trials} trials)`, index + 1, active.length);
    }
    active.sort((a, b) => compareSectionRows(a, b, strategy, options.objective, options.expCellType));
    if (stageIndex < quality.stages.length - 1) {
      const nextLimit = stageIndex === 0
        ? Math.min(strategy.candidateCap, Math.max(4, Math.ceil(active.length / 3)))
        : Math.min(4, active.length);
      active = active.slice(0, nextLimit);
    }
  }
  for (const row of rows) row.operation = stripTrialResults(row.operation);
  return { rows, baseline: stripTrialResults(finalBaseline) };
}

export function planJellySections(S, options = {}) {
  const objective = options.objective || 'clear';
  const expCellType = normalizeExpCellType(S, options.expCellType);
  const quality = jellyQualityOptions(options);
  const strategy = jellyStrategyOptions(options);
  const baselineLayout = options.layout || jellyLayoutFromSave(S);
  const purchased = new Set(researchRow(S, 18).map(value => Math.floor(n(value))));
  const availablePlots = jellySlotPlots().filter(plot => !purchased.has(plot.plotId));
  const availableTokens = Math.max(0, jellySlotPurchasesLeft(S));
  const requestedTokens = Math.max(0, Math.min(40, Math.floor(n(options.tokens ?? Math.min(1, availableTokens)))));
  const tokenBudget = options.allowHypotheticalTokens ? requestedTokens : Math.min(requestedTokens, availableTokens);
  const tokens = Math.min(tokenBudget, availablePlots.length);
  const plannerOptions = {
    ...options,
    objective,
    expCellType,
    seed: Math.floor(n(options.seed) || 1),
    onProgress: undefined,
  };
  let progressCompleted = 0;
  const progressTotal = Math.max(1, availablePlots.length + strategy.candidateCap * Math.max(1, tokens) * quality.stages.length);
  const reportProgress = (phase, completedIncrement = 0, localTotal = 1) => {
    progressCompleted = Math.min(progressTotal, progressCompleted + completedIncrement / Math.max(1, localTotal));
    options.onProgress?.({
      phase,
      completed: progressCompleted,
      total: progressTotal,
      overallPercent: 100 * progressCompleted / progressTotal,
    });
  };
  const baselineProxy = proxyObjectiveScore(baselineLayout, S, plannerOptions);
  const plotRows = availablePlots.map(plot => {
    const geometry = jellySectionGeometry(S, [plot.plotId]);
    const layout = jellyCompleteLayout(baselineLayout, geometry.expandedSave, plannerOptions, geometry);
    const proxyScore = proxyObjectiveScore(layout, geometry.expandedSave, plannerOptions);
    reportProgress('Screening section geometry', 1);
    return {
      plotId: plot.plotId,
      start: plot.start,
      width: plot.width,
      height: plot.height,
      plotIds: [plot.plotId],
      newUsableSlots: geometry.newUsableSlots,
      newSlots: geometry.newSlots,
      proximitySlots: geometry.proximitySlots,
      newlyLegalFootprintPlacements: geometry.newlyLegalFootprintPlacements,
      layout,
      proxyScore,
      proxyGain: proxyScore - baselineProxy,
      _save: geometry.expandedSave,
    };
  });

  let baselineOperation = null;
  if (tokens > 0) {
    const simulatedPlots = simulateSectionCandidates(
      plotRows,
      baselineLayout,
      S,
      plannerOptions,
      quality,
      strategy,
      (phase, completed, total) => reportProgress(phase, completed === total ? 1 : 0, 1)
    );
    baselineOperation = simulatedPlots.baseline;
  }

  let sequenceRows = tokens === 1 ? plotRows.slice() : [];
  if (tokens > 1) {
    let frontier = plotRows
      .slice()
      .sort((a, b) => b.proxyGain - a.proxyGain || a.plotId - b.plotId)
      .slice(0, strategy.beamWidth)
      .map(row => row.plotIds);
    for (let depth = 2; depth <= tokens; depth++) {
      const keys = new Set();
      const sequences = [];
      if (depth === 2) {
        for (let first = 0; first < availablePlots.length; first++) {
          for (let second = first + 1; second < availablePlots.length; second++) {
            sequences.push([availablePlots[first].plotId, availablePlots[second].plotId]);
          }
        }
      } else {
        for (const sequence of frontier) {
          for (const plot of availablePlots) {
            if (sequence.includes(plot.plotId)) continue;
            sequences.push([...sequence, plot.plotId].sort((a, b) => a - b));
          }
        }
      }
      const screened = [];
      for (const plotIds of sequences) {
        const key = plotIds.join(',');
        if (keys.has(key)) continue;
        keys.add(key);
        const geometry = jellySectionGeometry(S, plotIds);
        const layout = jellyCompleteLayout(baselineLayout, geometry.expandedSave, plannerOptions, geometry);
        const proxyScore = proxyObjectiveScore(layout, geometry.expandedSave, plannerOptions);
        screened.push({
          plotIds,
          newUsableSlots: geometry.newUsableSlots,
          newSlots: geometry.newSlots,
          proximitySlots: geometry.proximitySlots,
          newlyLegalFootprintPlacements: geometry.newlyLegalFootprintPlacements,
          layout,
          proxyScore,
          proxyGain: proxyScore - baselineProxy,
          _save: geometry.expandedSave,
        });
      }
      screened.sort((a, b) => b.proxyGain - a.proxyGain || a.plotIds.join(',').localeCompare(b.plotIds.join(',')));
      frontier = screened.slice(0, strategy.beamWidth).map(row => row.plotIds);
      if (depth === tokens) {
        sequenceRows = screened.slice(0, strategy.candidateCap);
        const simulated = simulateSectionCandidates(
          sequenceRows,
          baselineLayout,
          S,
          plannerOptions,
          quality,
          strategy,
          (phase, completed, total) => reportProgress(phase, completed === total ? 1 : 0, 1)
        );
        baselineOperation = simulated.baseline;
      }
    }
  }

  sequenceRows.sort((a, b) => compareSectionRows(a, b, strategy, objective, expCellType));
  plotRows.sort((a, b) => compareSectionRows(a, b, strategy, objective, expCellType)
    || a.plotId - b.plotId);
  const recommendedSequence = sequenceRows[0] || null;
  const cleanRow = row => {
    if (!row) return null;
    const { _save, ...clean } = row;
    return clean;
  };
  const cleanedPlots = plotRows.map(cleanRow);
  const cleanedSequences = sequenceRows.map(cleanRow);
  const recommendation = cleanRow(recommendedSequence);
  options.onProgress?.({ phase: 'Section plan complete', completed: progressTotal, total: progressTotal, overallPercent: 100 });
  return {
    objective,
    expCellType,
    quality: quality.quality,
    qualityProfile: quality,
    strategy: strategy.strategy,
    tokens,
    requestedTokens,
    availableTokens,
    baselineLayout,
    baselineUnlockedSlots: Array.from(jellyUnlockedSlots(S)),
    baselineObstruction: jellyProgress(S).obstruction,
    baselineOperation,
    plots: cleanedPlots,
    sequences: cleanedSequences,
    rankedCandidates: cleanedSequences,
    recommendedSequence: recommendation,
    recommendedPlotIds: recommendation?.plotIds || [],
    finalLayout: recommendation?.layout || baselineLayout,
    finalOperation: recommendation?.operation || baselineOperation,
    note: 'Every unpurchased section is geometry-screened. Multi-token candidates use bounded non-greedy beam search, shared seeds, adaptive simulation, and a fully occupied legal final layout. Statistically overlapping clear results prefer faster clears, then higher damage.',
  };
}

function saveWithJellyUpgrade(S, id) {
  const research = (S?.research || []).map(row => Array.isArray(row) ? row.slice() : row);
  while (research.length <= 18) research.push([]);
  research[17] = Array.isArray(research[17]) ? research[17].slice() : [];
  research[17][id] = jellyUpgradeLevel(S, id) + 1;
  return { ...S, research };
}

function saveWithJellyPlot(S, plotId) {
  const research = (S?.research || []).map(row => Array.isArray(row) ? row.slice() : row);
  while (research.length <= 18) research.push([]);
  research[18] = Array.isArray(research[18]) ? research[18].slice() : [];
  if (!research[18].includes(plotId)) research[18].push(plotId);
  return { ...S, research };
}

function saveAfterJellyPurchase(S, id, cost, plotId, respectBudget) {
  let result = saveWithJellyUpgrade(S, id);
  if (plotId != null) result = saveWithJellyPlot(result, plotId);
  if (!respectBudget) return result;
  const research = result.research.map(row => Array.isArray(row) ? row.slice() : row);
  research[7] = Array.isArray(research[7]) ? research[7].slice() : [];
  research[7][11] = Math.max(0, n(research[7][11]) - cost);
  return { ...result, research };
}

function saveWithJellyBloodcells(S, bloodcells) {
  const research = (S?.research || []).map(row => Array.isArray(row) ? row.slice() : row);
  while (research.length <= 7) research.push([]);
  research[7] = Array.isArray(research[7]) ? research[7].slice() : [];
  research[7][11] = Math.max(0, n(bloodcells));
  return { ...S, research };
}

function upgradeMarginalDetail(baseline, candidate, objective, expCellType) {
  if (objective === 'bloodcells') {
    const before = n(baseline.meanBloodcells);
    const after = n(candidate.meanBloodcells);
    return { score: after - before, metric: 'bloodcells', before, after, gain: after - before };
  }
  if (objective === 'exp') {
    const before = operationExpValue(baseline, expCellType);
    const after = operationExpValue(candidate, expCellType);
    return { score: after - before, metric: 'exp', before, after, gain: after - before };
  }
  if (objective === 'survival') {
    const before = n(baseline.meanCriticalTime);
    const after = n(candidate.meanCriticalTime);
    return { score: after - before, metric: 'survival', before, after, gain: after - before };
  }
  if (objective === 'damage' || objective === 'dps') {
    const before = n(baseline.meanDamage);
    const after = n(candidate.meanDamage);
    return { score: after - before, metric: 'damage', before, after, gain: after - before };
  }
  const probabilityGain = candidate.clearProbability - baseline.clearProbability;
  if (Math.abs(probabilityGain) > 1e-12) {
    return {
      score: probabilityGain,
      metric: 'clear-probability',
      before: n(baseline.clearProbability),
      after: n(candidate.clearProbability),
      gain: probabilityGain,
    };
  }
  if (candidate.clearProbability > 0 && baseline.meanTime && candidate.meanTime) {
    const gain = n(baseline.meanTime) - n(candidate.meanTime);
    return {
      score: gain / Math.max(1, n(baseline.representative?.standardTime)) / 100,
      metric: 'clear-time',
      before: n(baseline.meanTime),
      after: n(candidate.meanTime),
      gain,
    };
  }
  const hp = Math.max(1, n(baseline.representative?.hp));
  const before = n(baseline.meanDamage) / hp;
  const after = n(candidate.meanDamage) / hp;
  return {
    score: (after - before) / 1000,
    metric: 'boss-damage-progress',
    before,
    after,
    gain: after - before,
  };
}

function upgradeMarginalScore(baseline, candidate, objective, expCellType) {
  return upgradeMarginalDetail(baseline, candidate, objective, expCellType).score;
}

function evaluateUpgradeState(S, layout, options) {
  if (!options.reoptimize) {
    return {
      layout,
      operation: optimizeJellyOperationPolicy(layout, S, {
        ...options,
        trials: options.trials,
      }),
    };
  }
  const optimized = optimizeJellyLayout(S, {
    ...options,
    layout,
    beamWidth: options.beamWidth,
    iterations: options.iterations,
    simulationTrials: options.trials,
  });
  return { layout: optimized.layout, operation: optimized.operation };
}

function layoutWithUnlockedJellyCell(layout, S, type, options) {
  let best = null;
  for (const anchor of jellyUnlockedSlots(S)) {
    const placed = jellyPlaceCell(layout, anchor, type, S);
    if (!placed) continue;
    const filled = jellyCompleteLayout(placed, S, options);
    const score = evaluateJellyProxy(filled, S, options);
    if (!best || score > best.score) best = { layout: filled, score };
  }
  return best?.layout || layout;
}

function jellyEligibleUpgradeOrders(S, requestedIds, respectBudget, allowHoarding = false) {
  const orders = [];
  for (let order = 0; order < 40; order++) {
    const status = jellyUpgradeStatus(S, order);
    if (requestedIds && !requestedIds.has(status.id)) continue;
    if (!status.levelVisible || !status.prerequisiteMet || !status.belowMax) continue;
    if (respectBudget && !allowHoarding && !status.affordable) continue;
    orders.push(order);
  }
  return orders;
}

function bestFutureUpgradeProxyGain(S, layout, options, depth, memo) {
  if (depth <= 0) return 0;
  const memoKey = JSON.stringify([
    depth,
    jellyLayoutKey(layout),
    researchRow(S, 17),
    researchRow(S, 18).slice().sort((a, b) => n(a) - n(b)),
    n(researchRow(S, 7)[11]),
  ]);
  if (memo?.has(memoKey)) return memo.get(memoKey);
  const baselineScore = evaluateJellyProxy(layout, S, options);
  let bestGain = 0;
  const orders = jellyEligibleUpgradeOrders(S, options.requestedIds, options.respectBudget, true)
    .slice(0, Math.max(2, Math.min(8, Math.floor(n(options.lookaheadBranchWidth) || 6))));
  for (const order of orders) {
    const id = jellyUpgradeAtOrder(order);
    const cost = jellyUpgradeCost(S, order);
    const upgraded = saveWithJellyUpgrade(S, id);
    let candidateSave = upgraded;
    let candidateLayout = layout;
    let selectedPlotId = null;
    if ((id === 8 || id === 9) && jellySlotPurchasesLeft(upgraded) > jellySlotPurchasesLeft(S)) {
      let bestPlot = null;
      for (const plot of jellySlotPlots()) {
        if (researchRow(upgraded, 18).includes(plot.plotId)) continue;
        const geometry = jellySectionGeometry(upgraded, [plot.plotId]);
        const filled = jellyCompleteLayout(layout, geometry.expandedSave, options, geometry);
        const score = evaluateJellyProxy(filled, geometry.expandedSave, options);
        if (!bestPlot || score > bestPlot.score) bestPlot = { plotId: plot.plotId, layout: filled, score };
      }
      if (bestPlot) {
        selectedPlotId = bestPlot.plotId;
        candidateLayout = bestPlot.layout;
      }
    }
    candidateSave = saveAfterJellyPurchase(S, id, cost, selectedPlotId, options.respectBudget);
    const candidateScore = evaluateJellyProxy(candidateLayout, candidateSave, options);
    const immediateGain = Math.max(0, candidateScore - baselineScore);
    const futureGain = bestFutureUpgradeProxyGain(candidateSave, candidateLayout, options, depth - 1, memo);
    bestGain = Math.max(bestGain, immediateGain + 0.5 * futureGain);
  }
  memo?.set(memoKey, bestGain);
  return bestGain;
}

function evaluateUpgradeStateWithPolicy(S, layout, options, policy) {
  const simulate = typeof options._simulateTrials === 'function' ? options._simulateTrials : simulateJellyTrials;
  return {
    layout,
    operation: simulate(layout, S, {
      ...options,
      fever: policy?.fever,
      roidTiming: policy?.roidTiming,
      revivePolicy: policy?.revivePolicy,
      trials: options.trials,
    }),
  };
}

export function planJellyUpgradePurchases(S, options = {}) {
  const objective = options.objective || 'clear';
  const expCellType = normalizeExpCellType(S, options.expCellType);
  const initialLayout = options.layout || jellyLayoutFromSave(S);
  const quality = jellyQualityOptions(options);
  const strategy = jellyStrategyOptions(options);
  const trials = quality.finalTrials;
  const lookahead = Math.max(1, Math.min(3, Math.floor(n(options.lookahead) || 1)));
  const purchaseLimit = Math.max(1, Math.min(50, Math.floor(n(options.purchases) || 10)));
  const respectBudget = options.respectBudget !== false;
  const planningDays = Math.max(1, Math.min(365, n(options.planningDays) || 30));
  const simulateTrials = createJellyTrialRunner();
  const scoreProxy = createJellyProxyRunner();
  const lookaheadMemo = new Map();
  const analysisOptions = {
    ...options,
    objective,
    expCellType,
    trials,
    seed: Math.floor(n(options.seed) || 1),
    reoptimize: options.reoptimize !== false,
    beamWidth: Math.max(1, Math.min(8, Math.floor(n(options.beamWidth) || 3))),
    iterations: Math.max(1, Math.min(30, Math.floor(n(options.iterations) || 10))),
    _simulateTrials: simulateTrials,
    _proxyScore: scoreProxy,
    onProgress: undefined,
  };
  const requestedIds = Array.isArray(options.upgradeIds) ? new Set(options.upgradeIds.map(value => Math.floor(n(value)))) : null;
  let workingSave = S;
  let workingLayout = initialLayout;
  let initialState = null;
  let finalState = null;
  let totalCost = 0;
  let elapsedDays = 0;
  const totals = new Map();
  const sequence = [];

  for (let purchaseIndex = 0; purchaseIndex < purchaseLimit; purchaseIndex++) {
    const stepOptions = {
      ...analysisOptions,
      seed: (analysisOptions.seed + Math.imul(purchaseIndex + 1, 0x9e3779b1)) >>> 0,
    };
    const baselineState = evaluateUpgradeState(workingSave, workingLayout, {
      ...stepOptions,
      trials: quality.screeningTrials,
      reoptimize: false,
      onProgress: progress => options.onProgress?.({
        phase: `Purchase ${purchaseIndex + 1}: baseline ${progress.phase}`,
        completed: purchaseIndex + 0.15 * Number(progress.completed) / Math.max(1, Number(progress.total)),
        total: purchaseLimit,
      }),
    });
    if (!initialState) initialState = baselineState;
    finalState = baselineState;

    const remainingPlanningDays = Math.max(0, planningDays - elapsedDays);
    const dailyTries = Math.max(0, jellyDailyTries(workingSave));
    const bloodcellsPerAttempt = Math.max(0, n(baselineState.operation.meanBloodcells));
    const passiveBloodcellsPerDay = Math.max(0, jellyDailyBloodcells(workingSave));
    const bloodcellsPerDay = dailyTries * bloodcellsPerAttempt + passiveBloodcellsPerDay;
    const currentBloodcells = jellyProgress(workingSave).bloodcells;
    const eligibleOrders = jellyEligibleUpgradeOrders(workingSave, requestedIds, respectBudget, true);
    if (!eligibleOrders.length) break;

    const candidateSpecs = [];
    for (let eligibleIndex = 0; eligibleIndex < eligibleOrders.length; eligibleIndex++) {
      const order = eligibleOrders[eligibleIndex];
      const status = jellyUpgradeStatus(workingSave, order);
      const id = status.id;
      const cost = jellyUpgradeCost(workingSave, order);
      const deficit = respectBudget ? Math.max(0, cost - currentBloodcells) : 0;
      const waitDays = deficit > 0
        ? (bloodcellsPerDay > 0 ? deficit / bloodcellsPerDay : Infinity)
        : 0;
      if (!Number.isFinite(waitDays) || waitDays > remainingPlanningDays) continue;
      const fundedSave = waitDays > 0
        ? saveWithJellyBloodcells(workingSave, currentBloodcells + deficit)
        : workingSave;
      const upgradedSave = saveWithJellyUpgrade(fundedSave, id);
      const candidateSaves = [];
      if ((id === 8 || id === 9) && jellySlotPurchasesLeft(upgradedSave) > jellySlotPurchasesLeft(workingSave)) {
        const purchased = new Set(researchRow(upgradedSave, 18).map(value => Math.floor(n(value))));
        for (const plot of jellySlotPlots().filter(row => !purchased.has(row.plotId))) {
          const geometry = jellySectionGeometry(upgradedSave, [plot.plotId]);
          const expandedLayout = jellyCompleteLayout(baselineState.layout, geometry.expandedSave, stepOptions, geometry);
          candidateSaves.push({
            save: geometry.expandedSave,
            layout: expandedLayout,
            plotId: plot.plotId,
            geometry,
          });
        }
      } else {
        const unlocksCell = id >= 0 && id <= 7 && jellyUpgradeLevel(workingSave, id) <= 0;
        const candidateLayout = unlocksCell
          ? layoutWithUnlockedJellyCell(baselineState.layout, upgradedSave, id, stepOptions)
          : baselineState.layout;
        candidateSaves.push({ save: upgradedSave, layout: candidateLayout, plotId: null, geometry: null });
      }
      for (let candidateIndex = 0; candidateIndex < candidateSaves.length; candidateIndex++) {
        const candidate = candidateSaves[candidateIndex];
        const purchasedSave = saveAfterJellyPurchase(fundedSave, id, cost, candidate.plotId, respectBudget);
        const proxyScore = evaluateJellyProxy(candidate.layout, purchasedSave, stepOptions);
        candidateSpecs.push({
          order,
          id,
          cost,
          waitDays,
          waitAttempts: waitDays * dailyTries,
          bloodcellsPerDay,
          plotId: candidate.plotId,
          selectedPlotIds: candidate.plotId == null ? [] : [candidate.plotId],
          save: purchasedSave,
          layout: candidate.layout,
          geometry: candidate.geometry,
          proxyScore,
        });
      }
    }
    if (!candidateSpecs.length) break;

    const bestByUpgrade = new Map();
    for (const candidate of candidateSpecs) {
      const current = bestByUpgrade.get(candidate.id);
      if (!current || candidate.proxyScore > current.proxyScore) bestByUpgrade.set(candidate.id, candidate);
    }
    const shortlist = Array.from(bestByUpgrade.values());
    const extras = candidateSpecs
      .filter(candidate => bestByUpgrade.get(candidate.id) !== candidate)
      .sort((a, b) => b.proxyScore - a.proxyScore || a.order - b.order);
    shortlist.push(...extras.slice(0, Math.max(0, strategy.candidateCap - shortlist.length)));
    let active = shortlist;
    let stageBaseline = baselineState;
    for (let stageIndex = 0; stageIndex < quality.stages.length; stageIndex++) {
      const stageTrials = quality.stages[stageIndex];
      const optimizePolicies = stageIndex === Math.max(0, quality.stages.length - 2);
      stageBaseline = optimizePolicies
        ? evaluateUpgradeState(workingSave, baselineState.layout, {
          ...stepOptions,
          trials: stageTrials,
          reoptimize: false,
          includeTrials: true,
        })
        : evaluateUpgradeStateWithPolicy(workingSave, baselineState.layout, {
          ...stepOptions,
          trials: stageTrials,
          includeTrials: true,
        }, stageBaseline.operation);
      for (let candidateIndex = 0; candidateIndex < active.length; candidateIndex++) {
        const candidate = active[candidateIndex];
        const progressOptions = {
          ...stepOptions,
          trials: stageTrials,
          reoptimize: false,
          includeTrials: true,
          onProgress: progress => options.onProgress?.({
            phase: `Purchase ${purchaseIndex + 1}: ${jellyUpgradeData(candidate.id)?.name || `Upgrade ${candidate.id}`}`,
            completed: purchaseIndex + 0.15 + 0.85 * (
              candidateIndex + Number(progress.completed) / Math.max(1, Number(progress.total))
            ) / Math.max(1, active.length),
            total: purchaseLimit,
          }),
        };
        const state = optimizePolicies
          ? evaluateUpgradeState(candidate.save, candidate.layout, progressOptions)
          : evaluateUpgradeStateWithPolicy(candidate.save, candidate.layout, progressOptions, candidate.state?.operation || stageBaseline.operation);
        const score = upgradeMarginalScore(stageBaseline.operation, state.operation, objective, expCellType);
        const efficiency = candidate.cost > 0 ? score / candidate.cost : score > 0 ? Infinity : 0;
        candidate.productiveDays = Math.max(0, remainingPlanningDays - candidate.waitDays);
        candidate.productiveAttempts = candidate.productiveDays * Math.max(0, jellyDailyTries(candidate.save));
        candidate.state = state;
        candidate.score = score;
        candidate.efficiency = efficiency;
        candidate.horizonGain = score * candidate.productiveAttempts;
        candidate.confidence = pairedOperationConfidence(state.operation, stageBaseline.operation, objective, expCellType);
        candidate.simulationTrials = stageTrials;
      }
      active.sort((a, b) => {
        const rankedHorizonGain = candidate => {
          if (!candidate.confidence || strategy.confidenceWeight === 0) return candidate.horizonGain;
          if (strategy.confidenceWeight < 0) return candidate.confidence.low * candidate.productiveAttempts;
          const upside = Math.max(0, candidate.confidence.high - candidate.score);
          return candidate.horizonGain + 0.25 * upside * candidate.productiveAttempts;
        };
        const aRank = rankedHorizonGain(a);
        const bRank = rankedHorizonGain(b);
        return bRank - aRank || b.score - a.score || a.order - b.order;
      });
      if (stageIndex < quality.stages.length - 1) {
        const limit = stageIndex === 0
          ? Math.min(strategy.candidateCap, Math.max(3, Math.ceil(active.length / 2)))
          : Math.min(3, active.length);
        active = active.slice(0, limit);
      }
    }
    if (!active.length) break;
    for (const candidate of active) {
      candidate.productiveDays = Math.max(0, remainingPlanningDays - candidate.waitDays);
      candidate.productiveAttempts = candidate.productiveDays * Math.max(0, jellyDailyTries(candidate.save));
      candidate.horizonGain = candidate.score * candidate.productiveAttempts;
      candidate.lookaheadGain = lookahead > 1
        ? bestFutureUpgradeProxyGain(candidate.save, candidate.state.layout, {
          ...stepOptions,
          requestedIds,
          respectBudget,
        }, lookahead - 1, lookaheadMemo)
        : 0;
      const relativeFuture = candidate.lookaheadGain / Math.max(1, Math.abs(candidate.proxyScore));
      candidate.selectionScore = candidate.horizonGain
        * (1 + 0.25 * Math.min(3, Math.max(0, relativeFuture)));
      if (objective === 'bloodcells') candidate.selectionScore -= candidate.cost;
    }
    if (purchaseIndex === 0) initialState = stageBaseline;
    active.sort((a, b) => b.selectionScore - a.selectionScore
      || a.waitDays - b.waitDays
      || b.efficiency - a.efficiency
      || b.score - a.score
      || a.order - b.order);
    const best = active[0];
    if (analysisOptions.reoptimize) {
      const reoptimized = evaluateUpgradeState(best.save, best.state.layout, {
        ...stepOptions,
        trials: quality.finalTrials,
        reoptimize: true,
        includeTrials: true,
        onProgress: progress => options.onProgress?.({
          phase: `Purchase ${purchaseIndex + 1}: reoptimizing selected layout`,
          completed: purchaseIndex + 0.95 + 0.05 * Number(progress.completed) / Math.max(1, Number(progress.total)),
          total: purchaseLimit,
        }),
      });
      best.state = reoptimized;
      best.score = upgradeMarginalScore(stageBaseline.operation, reoptimized.operation, objective, expCellType);
      best.efficiency = best.cost > 0 ? best.score / best.cost : best.score > 0 ? Infinity : 0;
      best.horizonGain = best.score * best.productiveAttempts;
      best.confidence = pairedOperationConfidence(reoptimized.operation, stageBaseline.operation, objective, expCellType);
    }

    const before = jellyUpgradeDisplay(workingSave, best.id);
    const beforeObjective = operationObjectiveValue(stageBaseline.operation, objective, expCellType);
    const afterObjective = operationObjectiveValue(best.state.operation, objective, expCellType);
    const marginalDetail = upgradeMarginalDetail(stageBaseline.operation, best.state.operation, objective, expCellType);
    const bloodcellGain = n(best.state.operation.meanBloodcells) - n(stageBaseline.operation.meanBloodcells);
    const paybackAttempts = bloodcellGain > 0 ? best.cost / bloodcellGain : null;
    const triesPerDay = Math.max(0, jellyDailyTries(best.save));
    const passiveGainPerDay = jellyDailyBloodcells(best.save) - jellyDailyBloodcells(workingSave);
    const bloodcellGainPerDay = bloodcellGain * triesPerDay + passiveGainPerDay;
    const paybackDays = bloodcellGainPerDay > 0 ? best.cost / bloodcellGainPerDay : null;
    const totalPaybackDays = paybackDays == null ? null : best.waitDays + paybackDays;
    const elapsedDaysBefore = elapsedDays;
    elapsedDays += best.waitDays;
    workingSave = best.save;
    workingLayout = best.state.layout;
    finalState = best.state;
    totalCost += best.cost;
    sequence.push({
      step: purchaseIndex + 1,
      order: best.order,
      id: best.id,
      name: before.name,
      cost: best.cost,
      beforeObjective,
      afterObjective,
      gain: best.score,
      decisionMetric: marginalDetail.metric,
      decisionBefore: marginalDetail.before,
      decisionAfter: marginalDetail.after,
      decisionGain: marginalDetail.gain,
      efficiency: best.efficiency,
      selectedPlotIds: best.selectedPlotIds,
      bloodcellGain,
      bloodcellGainPerDay,
      waitDays: best.waitDays,
      waitAttempts: best.waitAttempts,
      bloodcellsPerDay: best.bloodcellsPerDay,
      productiveDays: best.productiveDays,
      productiveAttempts: best.productiveAttempts,
      horizonGain: best.horizonGain,
      elapsedDaysBefore,
      elapsedDaysAfter: elapsedDays,
      paybackAttempts: finiteOrNull(paybackAttempts),
      paybackDays: finiteOrNull(paybackDays),
      totalPaybackDays: finiteOrNull(totalPaybackDays),
      confidence: best.confidence,
      chanceBeatsBaseline: best.confidence?.chanceBeatsBaseline ?? null,
      simulationTrials: best.simulationTrials,
      lookaheadGain: best.lookaheadGain,
    });
    const total = totals.get(best.id) || {
      order: best.order,
      id: best.id,
      name: before.name,
      startingLevel: before.level,
      purchases: 0,
      totalCost: 0,
    };
    total.purchases++;
    total.totalCost += best.cost;
    totals.set(best.id, total);
    options.onProgress?.({
      phase: `Selected ${before.name} for purchase ${purchaseIndex + 1}`,
      completed: purchaseIndex + 1,
      total: purchaseLimit,
    });
  }

  if (!initialState) {
    initialState = evaluateUpgradeState(S, initialLayout, analysisOptions);
    finalState = initialState;
  }
  const rows = Array.from(totals.values()).map(total => {
    const display = jellyUpgradeDisplay(workingSave, total.id);
    return {
      ...total,
      finalLevel: display.level,
      effectText: display.effectText,
      description: display.description,
      sourceNote: display.sourceNote,
    };
  }).sort((a, b) => a.order - b.order);
  const completedPurchases = rows.reduce((sum, row) => sum + row.purchases, 0);
  const startingBloodcellsPerDay = n(initialState.operation.meanBloodcells) * Math.max(0, jellyDailyTries(S))
    + Math.max(0, jellyDailyBloodcells(S));
  const finalBloodcellsPerDay = n(finalState.operation.meanBloodcells) * Math.max(0, jellyDailyTries(workingSave))
    + Math.max(0, jellyDailyBloodcells(workingSave));
  options.onProgress?.({ phase: 'Purchase plan complete', completed: purchaseLimit, total: purchaseLimit });
  return {
    objective,
    expCellType,
    quality: quality.quality,
    qualityProfile: quality,
    strategy: strategy.strategy,
    lookahead,
    planningDays,
    elapsedDays,
    trials,
    reoptimized: analysisOptions.reoptimize,
    requestedPurchases: purchaseLimit,
    completedPurchases,
    respectBudget,
    startingBloodcells: jellyProgress(S).bloodcells,
    remainingBloodcells: jellyProgress(workingSave).bloodcells,
    startingBloodcellsPerDay,
    finalBloodcellsPerDay,
    totalCost,
    baselineLayout: initialState.layout,
    baseline: stripTrialResults(initialState.operation),
    finalLayout: finalState.layout,
    final: stripTrialResults(finalState.operation),
    rows,
    sequence,
    sequenceRows: sequence,
    confidence: sequence.length === 1
      ? pairedOperationConfidence(finalState.operation, initialState.operation, objective, expCellType)
      : null,
    note: analysisOptions.reoptimize
      ? 'Purchases may save until an upgrade is affordable, using limited daily attempts and passive Bloodcells to estimate calendar time. Candidates are ranked by benefit delivered over the planning horizon, with proxy screening, shared-seed adaptive simulation, bounded lookahead, and final bounded layout re-optimization. Slot-token upgrades automatically select their best screened section.'
      : 'Purchases may save until an upgrade is affordable, using limited daily attempts and passive Bloodcells to estimate calendar time. Candidates are ranked by benefit delivered over the planning horizon, with proxy screening, shared-seed adaptive simulation, bounded lookahead, and the current layout. Slot-token upgrades still automatically select and fill their best screened section.',
  };
}

export function jellyOperationSurrogate(layout, S, options = {}) {
  const obstruction = options.obstruction == null ? jellyProgress(S).obstruction : options.obstruction;
  const duration = jellyBossTime(obstruction);
  const fever = options.fever == null ? jellyProgress(S).fever : Math.floor(n(options.fever));
  const metrics = jellyLayoutMetrics(layout, S, {
    fever,
    feverRampPct: fever === 0 ? duration / 2 : 0,
    assumeValid: options.assumeValid,
    _metricContext: options._metricContext,
  });
  if (!metrics.valid) return { valid: false, reason: metrics.reason, score: -Infinity };
  const hp = jellyBossHp(obstruction);
  const roidStart = jellyUpgradeQuantity(S, 29) >= 1 ? roidActivationTime(options) : Infinity;
  const roidEnd = roidStart + 5;
  const roidFactor = 1 + (50 + jellyUpgradeQuantity(S, 29)) / 100;
  const coldAverage = fever === 0 ? 1 + duration / 200 : 1;
  const amoebaUnlocked = jellyUpgradeQuantity(S, 28) >= 1;
  const bossInterval = jellyBossAttackCooldown(obstruction) / 60;
  const cells = metrics.cells.map(cell => {
    const travel = jellyProjectileHitDelay(cell.anchor, cell.type, () => 0.5) * Math.max(0.8, Math.min(1.2, n(options.travelScale) || 1));
    const openingFraction = options.openingFraction == null ? 0.5 : Math.max(0, Math.min(1, n(options.openingFraction)));
    const firstShot = openingFraction / Math.max(1e-12, cell.attacksPerSecond);
    const activeSeconds = Math.max(0, duration - travel - firstShot);
    const roidOverlap = Math.max(0, Math.min(duration, roidEnd) - Math.max(0, roidStart, travel + firstShot));
    const roidAttacksPerSecond = jellyAttackCadence(CELL_BASE_COOLDOWNS[cell.type], {
      globalSpeed: jellyCellSpeedMultiplier(S, fever) * metrics.speedPassive,
      localSpeed: cell.organelle * cell.proximity * roidFactor,
    }).attacksPerSecond;
    const attacks = activeSeconds * cell.attacksPerSecond
      + roidOverlap * (roidAttacksPerSecond - cell.attacksPerSecond);
    return {
      ...cell,
      travel,
      survival: 1,
      expectedAttacks: attacks,
      expectedDamage: attacks * cell.damage * coldAverage,
    };
  });
  let expectedAmoebaHits = cells.filter(cell => cell.type === 0).reduce((sum, cell) => sum + cell.expectedAttacks, 0);
  const normalRamp = amoebaUnlocked ? 1 + expectedAmoebaHits / 200 : 1;
  let projectedDamage = cells.reduce((sum, cell) => sum + cell.expectedDamage, 0) * normalRamp;
  const projectedAttacksByType = Array(9).fill(0);
  for (const cell of cells) projectedAttacksByType[cell.type] += cell.expectedAttacks;
  let projectedAttacks = projectedAttacksByType.reduce((sum, value) => sum + value, 0);
  const criticalUnlocked = jellyUpgradeQuantity(S, 36) === 1;
  let aliveSlots = cells.reduce((sum, cell) => sum + cell.slots.length, 0);
  let liveImmunoidSlots = cells.filter(cell => cell.type === 4).reduce((sum, cell) => sum + cell.slots.length, 0);
  let revives = Math.max(0, Math.floor(jellyUpgradeQuantity(S, 35)));
  let criticalSeconds = 0;
  let previousEvent = 0;
  let nextEvent = bossInterval;
  let criticalEvents = 0;
  const maxCriticalSeconds = Math.max(10, n(options.maxCriticalSeconds) || 600);
  const integrate = seconds => {
    if (seconds <= 0) return;
    let attacks = 0;
    for (const cell of cells) {
      const cellAttacks = cell.attacksPerSecond * cell.survival * seconds;
      attacks += cellAttacks;
      projectedAttacksByType[cell.type] += cellAttacks;
    }
    const damage = cells.reduce((sum, cell) => sum + cell.dps * cell.survival, 0) * seconds;
    const amoebaHits = cells.filter(cell => cell.type === 0).reduce((sum, cell) => (
      sum + cell.attacksPerSecond * cell.survival
    ), 0) * seconds;
    const ramp = amoebaUnlocked ? 1 + (expectedAmoebaHits + amoebaHits / 2) / 100 : 1;
    projectedDamage += damage * ramp;
    projectedAttacks += attacks;
    expectedAmoebaHits += amoebaHits;
  };
  while (criticalUnlocked && aliveSlots > 0 && nextEvent <= maxCriticalSeconds && projectedDamage < hp) {
    integrate(nextEvent - previousEvent);
    criticalSeconds = nextEvent;
    previousEvent = nextEvent;
    criticalEvents++;
    const focused = liveImmunoidSlots > 0;
    const targetSlots = focused ? liveImmunoidSlots : aliveSlots;
    for (const cell of cells) {
      if ((focused && cell.type !== 4) || cell.survival <= 0) continue;
      const attritionBias = Math.max(0.5, Math.min(1.5, n(options.anchorAttritionBias) || 1));
      cell.survival *= Math.max(0, 1 - attritionBias / Math.max(1, targetSlots));
    }
    if (focused) liveImmunoidSlots--;
    if (revives > 0) revives--;
    else aliveSlots--;
    nextEvent += bossInterval * (focused ? 3 : 1);
  }
  if (criticalUnlocked && projectedDamage < hp && aliveSlots > 0 && previousEvent < maxCriticalSeconds) {
    integrate(Math.min(maxCriticalSeconds, nextEvent) - previousEvent);
    criticalSeconds = Math.min(maxCriticalSeconds, nextEvent);
  }
  const projectedBloodcells = projectedDamage * jellyCurrencyMultiplier(S, fever);
  const expMultiplier = jellyCellExpMultiplier(S, fever);
  const projectedExpByType = projectedAttacksByType.map(value => value * expMultiplier);
  const projectedExp = projectedExpByType.reduce((sum, value) => sum + value, 0);
  const damageRatio = hp > 0 ? projectedDamage / hp : 0;
  const clearTime = projectedDamage > 0
    ? Math.min(duration + criticalSeconds, (duration + criticalSeconds) / Math.max(1e-12, damageRatio))
    : Infinity;
  const objective = options.objective || 'dps';
  let score = metrics.dps;
  if (objective === 'clear') {
    score = Math.min(1, damageRatio) * 1e12
      + Math.max(0, damageRatio - 1) * 1e10
      + (damageRatio >= 1 ? Math.max(0, duration + criticalSeconds - clearTime) * 1e7 : 0);
  } else if (objective === 'dps') score = projectedDamage;
  else if (objective === 'bloodcells') score = projectedBloodcells;
  else if (objective === 'exp') {
    const expCellType = Number(options.expCellType);
    score = expCellType < 0 || !Number.isFinite(expCellType)
      ? projectedExp
      : projectedExpByType[Math.max(0, Math.min(8, Math.floor(expCellType)))];
  }
  else if (objective === 'survival') score = criticalSeconds * 1e9 + projectedDamage;
  return {
    valid: true,
    obstruction,
    fever,
    hp,
    normalSeconds: duration,
    criticalSeconds,
    projectedDamage,
    projectedBloodcells,
    projectedExp,
    projectedExpByType,
    projectedAttacks,
    damageRatio,
    clearTime,
    criticalEvents,
    score,
  };
}

export function jellyOperationScenarioSurrogate(layout, S, options = {}) {
  const scenarios = [
    { openingFraction: 0.1, travelScale: 0.96, anchorAttritionBias: 0.8 },
    { openingFraction: 0.25, travelScale: 1.04, anchorAttritionBias: 1.2 },
    { openingFraction: 0.4, travelScale: 0.99, anchorAttritionBias: 1 },
    { openingFraction: 0.55, travelScale: 1.08, anchorAttritionBias: 0.9 },
    { openingFraction: 0.7, travelScale: 0.94, anchorAttritionBias: 1.1 },
    { openingFraction: 0.85, travelScale: 1.02, anchorAttritionBias: 1.35 },
    { openingFraction: 0.95, travelScale: 1.1, anchorAttritionBias: 0.7 },
    { openingFraction: 0.5, travelScale: 1, anchorAttritionBias: 1 },
  ].map(scenario => jellyOperationSurrogate(layout, S, { ...options, ...scenario }));
  if (scenarios.some(scenario => !scenario.valid)) {
    return { valid: false, score: -Infinity, scenarios };
  }
  const ratios = scenarios.map(scenario => scenario.damageRatio).sort((a, b) => a - b);
  const clearFrequency = ratios.filter(ratio => ratio >= 1).length / ratios.length;
  const lowerDamageRatio = quantile(ratios, 0.25) || 0;
  const meanDamageRatio = mean(ratios);
  const objective = options.objective || 'dps';
  let score;
  if (objective === 'clear') {
    score = clearFrequency * 1e12 + Math.min(1, lowerDamageRatio) * 1e10 + meanDamageRatio * 1e8;
  } else if (objective === 'bloodcells') {
    score = mean(scenarios.map(scenario => scenario.projectedBloodcells));
  } else if (objective === 'exp') {
    const expCellType = Number(options.expCellType);
    score = expCellType < 0 || !Number.isFinite(expCellType)
      ? mean(scenarios.map(scenario => scenario.projectedExp))
      : mean(scenarios.map(scenario => scenario.projectedExpByType[Math.max(0, Math.min(8, Math.floor(expCellType)))]));
  } else if (objective === 'survival') {
    score = quantile(scenarios.map(scenario => scenario.criticalSeconds), 0.25) * 1e9
      + mean(scenarios.map(scenario => scenario.projectedDamage));
  } else {
    score = mean(scenarios.map(scenario => scenario.projectedDamage / Math.max(1e-12, scenario.normalSeconds + scenario.criticalSeconds)));
  }
  return {
    valid: true,
    scenarios,
    clearFrequency,
    lowerDamageRatio,
    meanDamageRatio,
    score,
  };
}

export function jellyPolicySensitivity(layout, S, options = {}) {
  const objective = options.objective || 'clear';
  const expCellType = normalizeExpCellType(S, options.expCellType);
  const obstruction = options.obstruction == null
    ? jellyProgress(S).obstruction
    : Math.max(0, Math.floor(n(options.obstruction)));
  const criticalStart = jellyBossTime(obstruction);
  const feverTypes = availableFeverTypes(S, 'auto');
  const roidUnlocked = jellyUpgradeQuantity(S, 29) >= 1;
  const bestTimingCandidates = roidUnlocked
    ? Array.from(new Set([0, 0.25, 0.5, 0.75, 1].map(fraction => Math.round(criticalStart * fraction))))
    : ['none'];
  const rows = [];
  const matrix = [];
  const totalRows = Math.max(1, feverTypes.length * 3);
  let completed = 0;

  const evaluate = (fever, timingKey, roidTiming, autoSelected = false) => {
    const surrogate = jellyOperationSurrogate(layout, S, {
      ...options,
      objective,
      expCellType,
      obstruction,
      fever,
      roidTiming,
      useRoid: roidUnlocked,
    });
    const expProxy = expCellType < 0
      ? n(surrogate.projectedExp)
      : n(surrogate.projectedExpByType?.[expCellType]);
    const row = {
      fever,
      feverName: feverModeName(fever),
      timing: timingKey,
      roidTiming: roidUnlocked && Number.isFinite(Number(roidTiming)) ? Number(roidTiming) : null,
      roidUnlocked,
      autoSelected,
      valid: Boolean(surrogate.valid),
      objectiveScore: n(surrogate.score),
      clearProxy: n(surrogate.damageRatio),
      damageProxy: n(surrogate.projectedDamage),
      bloodcellsProxy: n(surrogate.projectedBloodcells),
      expProxy,
      totalExpProxy: n(surrogate.projectedExp),
      expByTypeProxy: Array.from({ length: 9 }, (_, type) => n(surrogate.projectedExpByType?.[type])),
      survivalProxy: n(surrogate.criticalSeconds),
      clearLikely: n(surrogate.damageRatio) >= 1,
      proxies: {
        clear: n(surrogate.damageRatio),
        damage: n(surrogate.projectedDamage),
        bloodcells: n(surrogate.projectedBloodcells),
        exp: expProxy,
        survival: n(surrogate.criticalSeconds),
      },
    };
    completed++;
    options.onProgress?.({
      phase: 'Evaluating policy sensitivity',
      completed: Math.min(completed, totalRows),
      total: totalRows,
    });
    return row;
  };

  for (const fever of feverTypes) {
    const bestCandidates = bestTimingCandidates.map(roidTiming => {
      const surrogate = jellyOperationSurrogate(layout, S, {
        ...options,
        objective,
        expCellType,
        obstruction,
        fever,
        roidTiming,
        useRoid: roidUnlocked,
      });
      return { roidTiming, score: n(surrogate.score) };
    }).sort((a, b) => b.score - a.score || n(a.roidTiming) - n(b.roidTiming));
    const bestTiming = bestCandidates[0]?.roidTiming ?? 'none';
    const timingRows = [
      evaluate(fever, 'immediate', 0),
      evaluate(fever, 'critical', criticalStart),
      evaluate(fever, 'best', bestTiming, true),
    ];
    rows.push(...timingRows);
    matrix.push({
      fever,
      feverName: feverModeName(fever),
      timings: timingRows,
    });
  }
  const recommended = rows.slice().sort((a, b) => b.objectiveScore - a.objectiveScore
    || a.fever - b.fever
    || a.timing.localeCompare(b.timing))[0] || null;
  options.onProgress?.({ phase: 'Policy sensitivity complete', completed: totalRows, total: totalRows });
  return {
    valid: rows.every(row => row.valid),
    objective,
    expCellType,
    obstruction,
    roidUnlocked,
    feverTypes,
    timingProfiles: [
      { key: 'immediate', label: 'Immediate', roidTiming: roidUnlocked ? 0 : null },
      { key: 'critical', label: 'Critical start', roidTiming: roidUnlocked ? criticalStart : null },
      { key: 'best', label: 'Auto-selected best', roidTiming: null },
    ],
    rows,
    matrix,
    recommended,
    note: 'Deterministic bounded surrogate matrix across every unlocked Fever and immediate, Critical-start, and best-of-five Stronkroid timings.',
  };
}

function proxyObjectiveScore(layout, S, options) {
  if (options.objective === 'dps') {
    const metrics = jellyLayoutMetrics(layout, S, {
      fever: options.fever,
      assumeValid: options.assumeValid,
      _metricContext: options._metricContext,
    });
    return metrics.valid ? metrics.dps : -Infinity;
  }
  const surrogate = jellyOperationSurrogate(layout, S, options);
  if (!surrogate.valid) return -Infinity;
  return surrogate.score;
}

function simulatedObjectiveScore(simulation, objective, expCellType = -1) {
  if (!simulation?.valid) return -Infinity;
  if (objective === 'clear') {
    const clearTime = simulation.meanTime || 1e9;
    return simulation.clearProbability * 1e15 - clearTime * 1e6 + simulation.meanDamage;
  }
  if (objective === 'bloodcells') return simulation.meanBloodcells;
  if (objective === 'exp') return operationExpValue(simulation, expCellType);
  if (objective === 'survival') return simulation.meanCriticalTime * 1e9 + simulation.meanDamage;
  return simulation.meanDamage;
}

function operationConfidenceBounds(simulation, objective, expCellType = -1) {
  if (!simulation?.valid) return [-Infinity, -Infinity];
  if (objective === 'clear') return [simulation.clearProbabilityLow, simulation.clearProbabilityHigh];
  if (objective === 'bloodcells') {
    const margin = 1.96 * n(simulation.meanBloodcellsStandardError);
    return [simulation.meanBloodcells - margin, simulation.meanBloodcells + margin];
  }
  if (objective === 'exp') {
    const value = operationExpValue(simulation, expCellType);
    const standardError = expCellType < 0
      ? n(simulation.meanCellExpStandardError)
      : n(simulation.meanCellExpByTypeStandardError?.[expCellType]);
    const margin = 1.96 * standardError;
    return [value - margin, value + margin];
  }
  if (objective === 'survival') {
    const margin = 1.96 * n(simulation.meanCriticalTimeStandardError);
    return [simulation.meanCriticalTime - margin, simulation.meanCriticalTime + margin];
  }
  const margin = 1.96 * n(simulation.meanDamageStandardError);
  return [simulation.meanDamage - margin, simulation.meanDamage + margin];
}

function proxyFeverType(layout, S, objective, obstruction, requested, expCellType) {
  const candidates = availableFeverTypes(S, requested);
  let best = candidates[0];
  let bestScore = -Infinity;
  for (const fever of candidates) {
    const rampPct = fever === 0 ? jellyBossTime(obstruction) / 2 : 0;
    const metrics = jellyLayoutMetrics(layout, S, { fever, feverRampPct: rampPct });
    let score = metrics.dps;
    if (objective === 'bloodcells') score *= jellyCurrencyMultiplier(S, fever);
    if (objective === 'exp') {
      score = metrics.cells
        .filter(cell => expCellType < 0 || cell.type === expCellType)
        .reduce((sum, cell) => sum + cell.attacksPerSecond, 0)
        * jellyCellExpMultiplier(S, fever);
    }
    if (score > bestScore) {
      best = fever;
      bestScore = score;
    }
  }
  return best;
}

// Steady-DPS is a product of board-global multipliers and a sum of per-cell terms:
//   dps = damagePassive * speedPassive * virusMultiplier * sum(base(type) * proximity^2 * organelle)
// Each factor can be bounded independently from a partial layout, so the product of those
// maxima never understates any completion. That makes it an admissible branch-and-bound bound.
function jellySteadyBoundContext(S, options = {}) {
  const fever = options.fever == null ? jellyProgress(S).fever : Math.max(0, Math.floor(n(options.fever)));
  const unitsOwned = jellyUnitsOwned(S);
  const cellDamage = jellyCellDamageMultiplier(S, { fever });
  const cellSpeed = jellyCellSpeedMultiplier(S, fever);
  const proximityLevel = jellyUpgradeQuantity(S, 13);
  const proximityMultiplier = proximityLevel >= 1 ? 1 + proximityLevel / 100 : 1;
  const organelleMultiplier = 1.5 + Math.min(0.25, Math.max(0, rogBonusQTY(63, S?.cachedUniqueSushi || 0) / 100));
  const cellLevelDamage = 1 + jellyUpgradeQuantity(S, 17);
  const countBonusUnlocked = jellyUpgradeQuantity(S, 14) >= 1;
  const virusLimit = 1 + jellyUpgradeQuantity(S, 15);
  const baseTerm = new Array(9).fill(0);
  const footprintSize = new Array(9).fill(1);
  let maxFootprint = 1;
  for (let type = 0; type < 9; type++) {
    const size = (cellFootprint(type) || []).length || 1;
    footprintSize[type] = size;
    if (type < unitsOwned && size > maxFootprint) maxFootprint = size;
    const level = Math.max(0, Math.floor(n(jellyCellLevel(S, type))));
    baseTerm[type] = (CELL_BASE_DAMAGE[type] || 0)
      * cellDamage
      * (1 + level * cellLevelDamage / 100)
      * (39 / (CELL_BASE_COOLDOWNS[type] || 1))
      * cellSpeed;
  }
  const proxSq = anchor => (proximityLevel >= 1 && PROXIMITY_ANCHORS.has(anchor))
    ? proximityMultiplier * proximityMultiplier
    : 1;
  const maxProxSq = proximityMultiplier * proximityMultiplier;
  return {
    fever,
    unitsOwned,
    footprintSize,
    maxFootprint,
    organelleMultiplier,
    countBonusUnlocked,
    virusLimit,
    // Optimistic because a later Organelle can still buff an already-placed cell.
    optimisticTerm: (anchor, type) => baseTerm[type] * proxSq(anchor) * organelleMultiplier,
    maxOptimisticTerm: type => baseTerm[type] * maxProxSq * organelleMultiplier,
    // Each Virus infects at most its four orthogonal neighbours' whole footprints.
    virusMultiplierCap: (slotCap, virusCount = virusLimit) => (virusCount <= 0
      ? 1
      : 1 + Math.min(Math.max(0, slotCap), virusCount * 4 * maxFootprint) / 10),
    passiveBounds(counts, extraByType) {
      const cap = type => {
        const value = (counts[type] || 0) + (extraByType ? (extraByType(type) || 0) : 0);
        return (countBonusUnlocked && type !== 5) ? value + Math.floor(value / 3) : value;
      };
      const c0 = cap(0);
      const c1 = cap(1);
      const c2 = cap(2);
      const c3 = cap(3);
      const c6 = cap(6);
      const c7 = cap(7);
      return {
        damage: (1 + 2 * c7) * (1 + (0.5 * c2 + 0.1 * c0)),
        speed: (1 + 0.5 * c6) * (1 + (0.25 * c3 + 0.15 * c1)),
      };
    },
  };
}

export function enumerateJellyLayoutsExact(S, options = {}) {
  const startedAt = Date.now();
  const unlocked = Array.from(jellyUnlockedSlots(S)).sort((a, b) => a - b);
  const unlockedSet = new Set(unlocked);
  const slotBit = new Map(unlocked.map((slot, index) => [slot, 1n << BigInt(index)]));
  const fullMask = unlocked.length ? (1n << BigInt(unlocked.length)) - 1n : 0n;
  const unitsOwned = jellyUnitsOwned(S);
  const allowedTypes = Array.isArray(options.allowedTypes)
    ? Array.from(new Set(options.allowedTypes.map(value => Math.floor(n(value)))))
      .filter(type => type >= 0 && type < unitsOwned)
    : Array.from({ length: unitsOwned }, (_, type) => type);
  const requireFullCoverage = options.requireFullCoverage !== false;
  const scoreModel = options.scoreModel === 'transient-surrogate-v1' ? 'transient-surrogate-v1' : 'steady-dps';
  const fever = options.fever == null ? jellyProgress(S).fever : Math.max(0, Math.floor(n(options.fever)));
  const obstruction = options.obstruction == null
    ? jellyProgress(S).obstruction
    : Math.max(0, Math.floor(n(options.obstruction)));
  const nodeBudget = Math.max(1, Math.min(50000000, Math.floor(n(options.nodeBudget) || 1000000)));
  const timeBudgetMs = Math.max(1, Math.min(3600000, Math.floor(n(options.timeBudgetMs) || 10000)));
  const deterministicNodeBudget = options.deterministicNodeBudget === true;
  const virusLimit = 1 + jellyUpgradeQuantity(S, 15);
  const placements = [];
  const placementsBySlot = new Map(unlocked.map(slot => [slot, []]));
  for (const anchor of unlocked) {
    for (const type of allowedTypes) {
      const slots = jellyFootprintSlots(anchor, type);
      if (!slots || slots.some(slot => !unlockedSet.has(slot))) continue;
      let mask = 0n;
      for (const slot of slots) mask |= slotBit.get(slot);
      const placement = { anchor, type, slots, mask };
      placements.push(placement);
      for (const slot of slots) placementsBySlot.get(slot).push(placement);
    }
  }
  const standaloneScore = placement => {
    const layout = { [placement.anchor]: placement.type };
    return jellyLayoutMetrics(layout, S, { fever, assumeValid: true }).dps;
  };
  const placementScores = new Map(placements.map(placement => [placement, standaloneScore(placement)]));
  for (const rows of placementsBySlot.values()) {
    rows.sort((a, b) => placementScores.get(b) - placementScores.get(a)
      || a.slots.length - b.slots.length
      || a.type - b.type
      || a.anchor - b.anchor);
  }
  const scoreLayout = layout => {
    if (scoreModel === 'transient-surrogate-v1') {
      return jellyOperationScenarioSurrogate(layout, S, {
        obstruction,
        fever,
        objective: 'dps',
      }).score;
    }
    return jellyLayoutMetrics(layout, S, { fever, assumeValid: true }).dps;
  };
  const boundCtx = scoreModel === 'steady-dps' ? jellySteadyBoundContext(S, { fever }) : null;
  const boundEnabled = !!boundCtx && options.branchAndBound !== false && unlocked.length > 0;
  const allowedSet = new Set(allowedTypes);
  const workingCounts = new Array(9).fill(0);
  let workingSum = 0;
  let nodesPruned = 0;
  let maxDensity = 0;
  if (boundEnabled) {
    for (const type of allowedTypes) {
      const density = boundCtx.maxOptimisticTerm(type) / boundCtx.footprintSize[type];
      if (density > maxDensity) maxDensity = density;
    }
    for (const placement of placements) {
      placement.optimisticTerm = boundCtx.optimisticTerm(placement.anchor, placement.type);
    }
  }
  const virusFactorCap = boundEnabled
    ? boundCtx.virusMultiplierCap(unlocked.length, allowedSet.has(5) ? virusLimit : 0)
    : 1;
  // The damage passives, speed passives and per-cell sum all compete for the same remaining
  // slots, so bounding each independently is hopelessly loose. Relaxing the integral slot
  // split into a shared continuous budget and water-filling the product of linear factors
  // gives a far tighter value that still never understates any real completion.
  const waterFillProduct = (bases, rates, budget) => {
    let product = 1;
    let pool = [];
    for (let index = 0; index < bases.length; index++) {
      if (rates[index] > 0 && budget > 0) pool.push(index);
      else product *= bases[index];
    }
    while (pool.length) {
      let ratioSum = 0;
      for (const index of pool) ratioSum += bases[index] / rates[index];
      const lambda = pool.length / (budget + ratioSum);
      let worst = -1;
      let worstValue = 0;
      for (const index of pool) {
        const share = 1 / lambda - bases[index] / rates[index];
        if (share < worstValue) {
          worstValue = share;
          worst = index;
        }
      }
      if (worst < 0) {
        for (const index of pool) product *= rates[index] / lambda;
        return product;
      }
      product *= bases[worst];
      pool = pool.filter(index => index !== worst);
    }
    return product;
  };
  // A run of m added cells of one type yields at most m * 4/3 counted cells once the
  // every-third-cell bonus is unlocked.
  const bonusScale = boundEnabled && boundCtx.countBonusUnlocked ? 4 / 3 : 1;
  const effCount = type => {
    const raw = workingCounts[type] || 0;
    return (boundEnabled && boundCtx.countBonusUnlocked && type !== 5) ? raw * 4 / 3 : raw;
  };
  const slotRate = type => (allowedSet.has(type) ? bonusScale / boundCtx.footprintSize[type] : 0);
  let slotRates = null;
  const upperBound = decidedCount => {
    const remaining = unlocked.length - decidedCount;
    if (!slotRates) slotRates = Array.from({ length: 9 }, (_, type) => slotRate(type));
    const bases = [
      1 + 2 * effCount(7),
      1 + 0.5 * effCount(2) + 0.1 * effCount(0),
      1 + 0.5 * effCount(6),
      1 + 0.25 * effCount(3) + 0.15 * effCount(1),
      workingSum,
    ];
    const rates = [
      2 * slotRates[7],
      Math.max(0.5 * slotRates[2], 0.1 * slotRates[0]),
      0.5 * slotRates[6],
      Math.max(0.25 * slotRates[3], 0.15 * slotRates[1]),
      maxDensity,
    ];
    return virusFactorCap * waterFillProduct(bases, rates, remaining);
  };
  const working = {};
  let bestLayout = null;
  let bestScore = -Infinity;
  let tiedOptima = 0;
  let nodesExpanded = 0;
  let leavesEvaluated = 0;
  let termination = 'complete';
  let stopped = false;
  const progressInterval = 512;
  const reportProgress = force => {
    if (!force && nodesExpanded % progressInterval !== 0) return;
    const elapsedMs = Date.now() - startedAt;
    const budgetUsed = Math.min(0.999, deterministicNodeBudget
      ? nodesExpanded / nodeBudget
      : Math.max(nodesExpanded / nodeBudget, elapsedMs / timeBudgetMs));
    options.onProgress?.({
      phase: 'Enumerating exact layouts',
      completed: Math.min(nodesExpanded, nodeBudget),
      total: nodeBudget,
      overallPercent: stopped ? budgetUsed * 100 : Math.max(0.1, budgetUsed * 100),
      nodesExpanded,
      leavesEvaluated,
      elapsedMs,
      timeBudgetMs,
      incumbentScore: Number.isFinite(bestScore) ? bestScore : null,
    });
  };
  const shouldStop = () => {
    if (nodesExpanded >= nodeBudget) {
      termination = 'node-budget';
      stopped = true;
      return true;
    }
    if (!deterministicNodeBudget && Date.now() - startedAt >= timeBudgetMs) {
      termination = 'time-budget';
      stopped = true;
      return true;
    }
    return false;
  };
  const firstUndecidedIndex = decidedMask => {
    for (let index = 0; index < unlocked.length; index++) {
      if ((decidedMask & (1n << BigInt(index))) === 0n) return index;
    }
    return -1;
  };
  const evaluateLeaf = () => {
    leavesEvaluated++;
    const score = scoreLayout(working);
    const key = jellyLayoutKey(working);
    const bestKey = bestLayout ? jellyLayoutKey(bestLayout) : '';
    if (score > bestScore + 1e-9) {
      bestScore = score;
      bestLayout = { ...working };
      tiedOptima = 1;
    } else if (Math.abs(score - bestScore) <= 1e-9) {
      tiedOptima++;
      if (!bestLayout || key < bestKey) bestLayout = { ...working };
    }
  };
  const search = (occupiedMask, decidedMask, virusCount, decidedCount) => {
    if (stopped || shouldStop()) return;
    nodesExpanded++;
    reportProgress(false);
    if (boundEnabled && Number.isFinite(bestScore) && upperBound(decidedCount) <= bestScore + 1e-9) {
      nodesPruned++;
      return;
    }
    if (decidedMask === fullMask) {
      evaluateLeaf();
      return;
    }
    const undecidedIndex = firstUndecidedIndex(decidedMask);
    if (undecidedIndex < 0) {
      evaluateLeaf();
      return;
    }
    const slot = unlocked[undecidedIndex];
    for (const placement of placementsBySlot.get(slot) || []) {
      if ((placement.mask & decidedMask) !== 0n) continue;
      if (placement.type === 5 && virusCount >= virusLimit) continue;
      working[placement.anchor] = placement.type;
      if (boundEnabled) {
        workingCounts[placement.type]++;
        workingSum += placement.optimisticTerm;
      }
      search(
        occupiedMask | placement.mask,
        decidedMask | placement.mask,
        virusCount + Number(placement.type === 5),
        decidedCount + placement.slots.length
      );
      if (boundEnabled) {
        workingCounts[placement.type]--;
        workingSum -= placement.optimisticTerm;
      }
      delete working[placement.anchor];
      if (stopped) return;
    }
    if (!requireFullCoverage) {
      const bit = 1n << BigInt(undecidedIndex);
      search(occupiedMask, decidedMask | bit, virusCount, decidedCount + 1);
    }
  };
  search(0n, 0n, 0, 0);
  const elapsedMs = Date.now() - startedAt;
  const complete = !stopped;
  const feasible = leavesEvaluated > 0 && bestLayout !== null;
  options.onProgress?.({
    phase: complete ? 'Exact layout enumeration complete' : 'Exact layout budget reached',
    completed: complete ? nodeBudget : Math.min(nodesExpanded, nodeBudget),
    total: nodeBudget,
    overallPercent: 100,
    nodesExpanded,
    leavesEvaluated,
    elapsedMs,
    timeBudgetMs,
    incumbentScore: Number.isFinite(bestScore) ? bestScore : null,
  });
  const savedLayout = options.layout || jellyLayoutFromSave(S);
  const savedScore = scoreLayout(savedLayout);
  return {
    layout: bestLayout || {},
    score: bestScore,
    metrics: bestLayout ? jellyLayoutMetrics(bestLayout, S, { fever }) : null,
    savedLayout,
    savedScore,
    savedMetrics: jellyLayoutMetrics(savedLayout, S, { fever }),
    certificate: {
      complete,
      feasible,
      claim: complete
        ? (feasible ? 'optimal-within-declared-scope-and-score-model' : 'scope-exhausted-no-feasible-layout')
        : 'best-incumbent-within-budget',
      scoreModel,
      scope: {
        kind: 'full-board',
        unlockedSlots: unlocked,
        requireFullCoverage,
        fixedFever: fever,
        obstruction,
        allowedTypes,
      },
      termination,
      budgetMode: deterministicNodeBudget ? 'deterministic-node-budget' : 'node-or-time-budget',
      nodesExpanded,
      nodesPruned,
      branchAndBound: boundEnabled,
      leavesEvaluated,
      legalPlacements: placements.length,
      elapsedMs,
      nodeBudget,
      timeBudgetMs,
      bestLayoutKey: bestLayout ? jellyLayoutKey(bestLayout) : '',
      tiedOptima,
    },
  };
}

export function enumerateJellyRegionRepairsExact(layout, S, options = {}) {
  const startedAt = Date.now();
  const requestedRegion = new Set(Array.from(options.regionSlots || [])
    .map(value => Math.floor(n(value)))
    .filter(slot => slot >= 0 && slot < JELLY_SIZE));
  const unlocked = jellyUnlockedSlots(S);
  for (const slot of Array.from(requestedRegion)) if (!unlocked.has(slot)) requestedRegion.delete(slot);
  const region = new Set(requestedRegion);
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const [rawAnchor, rawType] of Object.entries(layout || {})) {
      const slots = jellyFootprintSlots(Number(rawAnchor), Number(rawType)) || [];
      if (!slots.some(slot => region.has(slot))) continue;
      for (const slot of slots) {
        if (!unlocked.has(slot) || region.has(slot)) continue;
        region.add(slot);
        expanded = true;
      }
    }
  }
  const outside = { ...(layout || {}) };
  const removedTypes = [];
  for (const [rawAnchor, rawType] of Object.entries(layout || {})) {
    const anchor = Number(rawAnchor);
    const type = Number(rawType);
    const slots = jellyFootprintSlots(anchor, type) || [];
    if (!slots.some(slot => region.has(slot))) continue;
    delete outside[anchor];
    removedTypes.push(type);
  }
  const mode = options.mode === 'one-substitution' ? 'one-substitution' : 'preserve-composition';
  const objective = options.objective || 'dps';
  const fever = options.fever == null ? jellyProgress(S).fever : Math.max(0, Math.floor(n(options.fever)));
  const obstruction = options.obstruction == null
    ? jellyProgress(S).obstruction
    : Math.max(0, Math.floor(n(options.obstruction)));
  const expCellType = normalizeExpCellType(S, options.expCellType);
  const nodeBudget = Math.max(1, Math.min(5000000, Math.floor(n(options.nodeBudget) || 5000)));
  const timeBudgetMs = Math.max(1, Math.min(60000, Math.floor(n(options.timeBudgetMs) || 250)));
  const deterministicNodeBudget = options.deterministicNodeBudget === true;
  const resultLimit = Math.max(1, Math.min(32, Math.floor(n(options.resultLimit) || 4)));
  const allowedTypes = Array.isArray(options.allowedTypes)
    ? Array.from(new Set(options.allowedTypes.map(value => Math.floor(n(value)))))
      .filter(type => type >= 0 && type < jellyUnitsOwned(S))
    : Array.from({ length: jellyUnitsOwned(S) }, (_, type) => type);
  const outsideOccupied = jellyLayoutOccupancy(outside);
  const outsideVirusCount = Object.values(outside).filter(type => Number(type) === 5).length;
  const virusLimit = 1 + jellyUpgradeQuantity(S, 15);
  const staticPlacements = jellySearchStaticContext(S).placements;
  const placementsByType = new Map(allowedTypes.map(type => [
    type,
    staticPlacements.filter(placement => placement.type === type
      && region.has(placement.anchor)
      && placement.slots.every(slot => region.has(slot))
      && !placement.slots.some(slot => outsideOccupied.has(slot))),
  ]));
  const variantMap = new Map();
  const addVariant = types => {
    const sorted = types.slice().sort((a, b) => (
      cellFootprint(b).length - cellFootprint(a).length || a - b
    ));
    const key = sorted.join(',');
    if (!variantMap.has(key)) variantMap.set(key, sorted);
  };
  addVariant(removedTypes);
  if (mode === 'one-substitution') {
    for (let index = 0; index < removedTypes.length; index++) {
      for (const type of allowedTypes) {
        if (type === removedTypes[index]) continue;
        const variant = removedTypes.slice();
        variant[index] = type;
        addVariant(variant);
      }
    }
  }
  const variants = Array.from(variantMap.values());
  const candidateMap = new Map();
  let nodesExpanded = 0;
  let leavesEvaluated = 0;
  let variantsCompleted = 0;
  let termination = 'complete';
  let stopped = false;
  const scoreLayout = typeof options._scoreLayout === 'function'
    ? options._scoreLayout
    : candidate => proxyObjectiveScore(candidate, S, {
      ...options,
      objective,
      fever,
      obstruction,
      expCellType,
      assumeValid: true,
    });
  const shouldStop = () => {
    if (nodesExpanded >= nodeBudget) {
      termination = 'node-budget';
      stopped = true;
      return true;
    }
    if (!deterministicNodeBudget && Date.now() - startedAt >= timeBudgetMs) {
      termination = 'time-budget';
      stopped = true;
      return true;
    }
    return false;
  };
  // Per-variant the cell multiset is fixed, so the global damage/speed passives are exact and only
  // the placement-dependent organelle/proximity/virus factors need optimistic bounding.
  const boundCtx = (objective === 'dps' && options.branchAndBound !== false)
    ? jellySteadyBoundContext(S, { fever })
    : null;
  const boundEnabled = !!boundCtx
    && (typeof options._scoreLayout !== 'function' || options.boundModel === 'steady-dps');
  const shapeAwareBound = boundEnabled && options.shapeAwareBound !== false;
  const topScores = [];
  let nodesPruned = 0;
  let nodesPrunedByCapacity = 0;
  let shapeBoundEvaluations = 0;
  const outsideCounts = new Array(9).fill(0);
  let outsideOptimisticSum = 0;
  let outsideVirusTotal = 0;
  if (boundEnabled) {
    for (const [rawAnchor, rawType] of Object.entries(outside)) {
      const anchor = Number(rawAnchor);
      const type = Number(rawType);
      outsideCounts[type]++;
      if (type === 5) outsideVirusTotal++;
      outsideOptimisticSum += boundCtx.optimisticTerm(anchor, type);
    }
  }
  const maxTermByType = new Map();
  if (boundEnabled) {
    for (const [type, rows] of placementsByType.entries()) {
      let best = 0;
      for (const placement of rows) {
        const term = boundCtx.optimisticTerm(placement.anchor, type);
        if (term > best) best = term;
      }
      maxTermByType.set(type, best);
    }
  }
  const record = working => {
    leavesEvaluated++;
    const key = jellyLayoutKey(working);
    const score = scoreLayout(working);
    const current = candidateMap.get(key);
    if (!current || score > current.score) candidateMap.set(key, { layout: { ...working }, score });
    if (candidateMap.size > resultLimit * 4) {
      const retained = Array.from(candidateMap.entries())
        .sort((a, b) => b[1].score - a[1].score || a[0].localeCompare(b[0]))
        .slice(0, resultLimit);
      candidateMap.clear();
      for (const [retainedKey, candidate] of retained) candidateMap.set(retainedKey, candidate);
    }
    if (boundEnabled) {
      let index = topScores.length;
      while (index > 0 && topScores[index - 1] < score) index--;
      topScores.splice(index, 0, score);
      if (topScores.length > resultLimit) topScores.length = resultLimit;
    }
  };
  for (let variantIndex = 0; variantIndex < variants.length && !stopped; variantIndex++) {
    const items = variants[variantIndex];
    const working = { ...outside };
    const occupied = new Set(outsideOccupied.keys());
    const lastAnchorByType = new Array(8).fill(-1);
    let variantBoundFactor = 0;
    let workingSum = outsideOptimisticSum;
    const suffixMax = new Array(items.length + 1).fill(0);
    const suffixRequiredSlots = new Array(items.length + 1).fill(0);
    if (boundEnabled) {
      const finalCounts = outsideCounts.slice();
      let occupiedSlots = outsideOccupied.size;
      let virusTotal = outsideVirusTotal;
      for (const type of items) {
        finalCounts[type]++;
        occupiedSlots += boundCtx.footprintSize[type];
        if (type === 5) virusTotal++;
      }
      const passives = boundCtx.passiveBounds(finalCounts, null);
      variantBoundFactor = passives.damage
        * passives.speed
        * boundCtx.virusMultiplierCap(occupiedSlots, virusTotal);
      for (let index = items.length - 1; index >= 0; index--) {
        suffixMax[index] = suffixMax[index + 1] + (maxTermByType.get(items[index]) || 0);
        suffixRequiredSlots[index] = suffixRequiredSlots[index + 1] + boundCtx.footprintSize[items[index]];
      }
    }
    const compatibleSuffixMax = index => {
      shapeBoundEvaluations++;
      let result = 0;
      for (let itemIndex = index; itemIndex < items.length; itemIndex++) {
        const type = items[itemIndex];
        const previousAnchor = lastAnchorByType[type];
        let best = -Infinity;
        for (const placement of placementsByType.get(type) || []) {
          if (placement.anchor <= previousAnchor) continue;
          if (placement.slots.some(slot => occupied.has(slot))) continue;
          best = Math.max(best, boundCtx.optimisticTerm(placement.anchor, type));
        }
        if (!Number.isFinite(best)) return -Infinity;
        result += best;
      }
      return result;
    };
    const search = (index, virusCount, placedSlots) => {
      if (stopped || shouldStop()) return;
      nodesExpanded++;
      if (shapeAwareBound && suffixRequiredSlots[index] > region.size - placedSlots) {
        nodesPruned++;
        nodesPrunedByCapacity++;
        return;
      }
      if (boundEnabled && topScores.length >= resultLimit) {
        const shapeMax = shapeAwareBound ? compatibleSuffixMax(index) : suffixMax[index];
        if (!Number.isFinite(shapeMax)
          || variantBoundFactor * (workingSum + Math.min(suffixMax[index], shapeMax)) <= topScores[resultLimit - 1] + 1e-9) {
          nodesPruned++;
          return;
        }
      }
      if (index >= items.length) {
        record(working);
        return;
      }
      const type = items[index];
      const previousAnchor = lastAnchorByType[type];
      for (const placement of placementsByType.get(type) || []) {
        if (placement.anchor <= previousAnchor) continue;
        if (type === 5 && virusCount >= virusLimit) continue;
        if (placement.slots.some(slot => occupied.has(slot))) continue;
        const term = boundEnabled ? boundCtx.optimisticTerm(placement.anchor, type) : 0;
        working[placement.anchor] = type;
        for (const slot of placement.slots) occupied.add(slot);
        lastAnchorByType[type] = placement.anchor;
        workingSum += term;
        search(index + 1, virusCount + Number(type === 5), placedSlots + placement.slots.length);
        workingSum -= term;
        lastAnchorByType[type] = previousAnchor;
        for (const slot of placement.slots) occupied.delete(slot);
        delete working[placement.anchor];
        if (stopped) return;
      }
    };
    search(0, outsideVirusCount, 0);
    if (!stopped) variantsCompleted++;
    options.onProgress?.({
      phase: 'Enumerating exact regional repairs',
      completed: variantsCompleted,
      total: variants.length,
      overallPercent: 100 * variantsCompleted / Math.max(1, variants.length),
      nodesExpanded,
      leavesEvaluated,
    });
  }
  const candidates = Array.from(candidateMap.values())
    .sort((a, b) => b.score - a.score || jellyLayoutKey(a.layout).localeCompare(jellyLayoutKey(b.layout)))
    .slice(0, resultLimit);
  const complete = !stopped;
  return {
    candidates,
    best: candidates[0] || null,
    certificate: {
      complete,
      feasible: leavesEvaluated > 0,
      claim: complete
        ? (leavesEvaluated > 0 ? 'optimal-repairs-within-declared-region-and-compositions' : 'region-scope-exhausted-no-feasible-repair')
        : 'best-regional-incumbents-within-budget',
      scope: {
        kind: 'fixed-outside-region',
        requestedRegionSlots: Array.from(requestedRegion).sort((a, b) => a - b),
        regionSlots: Array.from(region).sort((a, b) => a - b),
        boundaryExpansionSlots: Array.from(region).filter(slot => !requestedRegion.has(slot)).sort((a, b) => a - b),
        mode,
        removedTypes: removedTypes.slice(),
        variants: variants.length,
        fixedFever: fever,
        obstruction,
        objective,
      },
      termination,
      budgetMode: deterministicNodeBudget ? 'deterministic-node-budget' : 'node-or-time-budget',
      nodesExpanded,
      nodesPruned,
      nodesPrunedByCapacity,
      branchAndBound: boundEnabled,
      shapeAwareBound,
      shapeBoundEvaluations,
      leavesEvaluated,
      variantsCompleted,
      elapsedMs: Date.now() - startedAt,
      nodeBudget,
      timeBudgetMs,
    },
  };
}

export function enumerateJellyRegionFreeExact(layout, S, options = {}) {
  const startedAt = Date.now();
  const requestedRegion = new Set(Array.from(options.regionSlots || [])
    .map(value => Math.floor(n(value)))
    .filter(slot => slot >= 0 && slot < JELLY_SIZE));
  const unlocked = jellyUnlockedSlots(S);
  for (const slot of Array.from(requestedRegion)) if (!unlocked.has(slot)) requestedRegion.delete(slot);
  const region = new Set(requestedRegion);
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const [rawAnchor, rawType] of Object.entries(layout || {})) {
      const slots = jellyFootprintSlots(Number(rawAnchor), Number(rawType)) || [];
      if (!slots.some(slot => region.has(slot))) continue;
      for (const slot of slots) {
        if (!unlocked.has(slot) || region.has(slot)) continue;
        region.add(slot);
        expanded = true;
      }
    }
  }
  const outside = { ...(layout || {}) };
  for (const [rawAnchor, rawType] of Object.entries(layout || {})) {
    const slots = jellyFootprintSlots(Number(rawAnchor), Number(rawType)) || [];
    if (slots.some(slot => region.has(slot))) delete outside[rawAnchor];
  }
  const regionSlots = Array.from(region).sort((a, b) => a - b);
  const slotBit = new Map(regionSlots.map((slot, index) => [slot, 1n << BigInt(index)]));
  const fullMask = regionSlots.length ? (1n << BigInt(regionSlots.length)) - 1n : 0n;
  const allowedTypes = Array.isArray(options.allowedTypes)
    ? Array.from(new Set(options.allowedTypes.map(value => Math.floor(n(value)))))
      .filter(type => type >= 0 && type < jellyUnitsOwned(S))
    : Array.from({ length: jellyUnitsOwned(S) }, (_, type) => type);
  const allowedTypeSet = new Set(allowedTypes);
  const placementsBySlot = new Map(regionSlots.map(slot => [slot, []]));
  const allPlacements = [];
  let legalPlacements = 0;
  const staticPlacements = jellySearchStaticContext(S).placements;
  for (const source of staticPlacements) {
    if (!allowedTypeSet.has(source.type) || !region.has(source.anchor)
      || !source.slots.every(slot => region.has(slot))) continue;
    let mask = 0n;
    for (const slot of source.slots) mask |= slotBit.get(slot);
    const placement = { ...source, mask };
    allPlacements.push(placement);
    for (const slot of source.slots) placementsBySlot.get(slot).push(placement);
    legalPlacements++;
  }
  const objective = options.objective || 'dps';
  const fever = options.fever == null ? jellyProgress(S).fever : Math.max(0, Math.floor(n(options.fever)));
  const obstruction = options.obstruction == null
    ? jellyProgress(S).obstruction
    : Math.max(0, Math.floor(n(options.obstruction)));
  const expCellType = normalizeExpCellType(S, options.expCellType);
  const nodeBudget = Math.max(1, Math.min(5000000, Math.floor(n(options.nodeBudget) || 100000)));
  const timeBudgetMs = Math.max(1, Math.min(60000, Math.floor(n(options.timeBudgetMs) || 1000)));
  const deterministicNodeBudget = options.deterministicNodeBudget === true;
  const resultLimit = Math.max(1, Math.min(32, Math.floor(n(options.resultLimit) || 4)));
  const virusLimit = 1 + jellyUpgradeQuantity(S, 15);
  const outsideVirusCount = Object.values(outside).filter(type => Number(type) === 5).length;
  const scoreLayout = typeof options._scoreLayout === 'function'
    ? options._scoreLayout
    : candidate => proxyObjectiveScore(candidate, S, {
      ...options,
      objective,
      fever,
      obstruction,
      expCellType,
      assumeValid: true,
    });
  const boundRequested = options.branchAndBound;
  const boundAutoEnabled = regionSlots.length >= 8 && legalPlacements >= 24;
  const boundEnabled = boundRequested === true || (boundRequested !== false && boundAutoEnabled);
  const boundCtx = objective === 'dps'
    && (typeof options._scoreLayout !== 'function' || options.boundModel === 'steady-dps')
    && boundEnabled
    ? jellySteadyBoundContext(S, { fever })
    : null;
  if (boundCtx) {
    for (const rows of placementsBySlot.values()) {
      for (const placement of rows) {
        if (placement.optimisticTerm == null) {
          placement.optimisticTerm = boundCtx.optimisticTerm(placement.anchor, placement.type);
        }
      }
      rows.sort((a, b) => b.optimisticTerm / b.slots.length - a.optimisticTerm / a.slots.length
        || a.anchor - b.anchor || a.type - b.type);
    }
  }
  const globalMaxDensity = boundCtx
    ? allPlacements.reduce((best, placement) => (
      Math.max(best, placement.optimisticTerm / placement.slots.length)
    ), 0)
    : 0;
  const scopeKey = `${jellyLayoutKey(outside)}|${regionSlots.join(',')}|${allowedTypes.join(',')}|${objective}|${fever}`;
  const resumeToken = options.resumeToken?.scopeKey === scopeKey ? options.resumeToken : null;
  const candidateMap = new Map((resumeToken?.candidates || []).map(candidate => [
    jellyLayoutKey(candidate.layout),
    candidate,
  ]));
  let nodesExpanded = 0;
  let nodesExpandedTotal = Math.max(0, Math.floor(n(resumeToken?.nodesExpandedTotal)));
  let leavesEvaluated = Math.max(0, Math.floor(n(resumeToken?.leavesEvaluated)));
  let nodesPruned = Math.max(0, Math.floor(n(resumeToken?.nodesPruned)));
  let termination = 'complete';
  let stopped = false;
  const shouldStop = () => {
    if (nodesExpanded >= nodeBudget) {
      termination = 'node-budget';
      stopped = true;
      return true;
    }
    if (!deterministicNodeBudget && Date.now() - startedAt >= timeBudgetMs) {
      termination = 'time-budget';
      stopped = true;
      return true;
    }
    return false;
  };
  const firstUndecidedIndex = decidedMask => {
    for (let index = 0; index < regionSlots.length; index++) {
      if ((decidedMask & (1n << BigInt(index))) === 0n) return index;
    }
    return -1;
  };
  const record = working => {
    leavesEvaluated++;
    const key = jellyLayoutKey(working);
    const score = scoreLayout(working);
    const current = candidateMap.get(key);
    if (!current || score > current.score) candidateMap.set(key, { layout: { ...working }, score });
    if (candidateMap.size > resultLimit) {
      const worst = Array.from(candidateMap.entries())
        .sort((a, b) => a[1].score - b[1].score
          || jellyLayoutKey(b[1].layout).localeCompare(jellyLayoutKey(a[1].layout)))[0];
      if (worst) candidateMap.delete(worst[0]);
    }
  };
  const outsideCounts = new Array(9).fill(0);
  let outsideOptimisticSum = 0;
  if (boundCtx) {
    for (const [rawAnchor, rawType] of Object.entries(outside)) {
      const anchor = Number(rawAnchor);
      const type = Number(rawType);
      outsideCounts[type]++;
      outsideOptimisticSum += boundCtx.optimisticTerm(anchor, type);
    }
  }
  const occupiedCount = mask => {
    let count = 0;
    for (let index = 0; index < regionSlots.length; index++) {
      if ((mask & (1n << BigInt(index))) !== 0n) count++;
    }
    return count;
  };
  const outsideOccupiedSlots = jellyLayoutOccupancy(outside).size;
  const scoreThreshold = () => {
    if (candidateMap.size < resultLimit) return -Infinity;
    return Math.min(...Array.from(candidateMap.values(), candidate => candidate.score));
  };
  const transpositionSeen = options.transposition !== false
    ? new Set()
    : null;
  let transpositionHits = 0;
  const upperBound = (state, workingCounts, workingSum) => {
    if (!boundCtx) return Infinity;
    const remainingSlots = regionSlots.length - (state.decidedCount ?? occupiedCount(state.decidedMask));
    const passives = boundCtx.passiveBounds(workingCounts, type => (
      allowedTypeSet.has(type) ? Math.floor(remainingSlots / boundCtx.footprintSize[type]) : 0
    ));
    const virusCountCap = state.virusCount + (allowedTypeSet.has(5)
      ? Math.floor(remainingSlots / boundCtx.footprintSize[5])
      : 0);
    return passives.damage
      * passives.speed
      * boundCtx.virusMultiplierCap(outsideOccupiedSlots + regionSlots.length, virusCountCap)
      * (workingSum + remainingSlots * globalMaxDensity);
  };
  const stack = resumeToken
    ? resumeToken.stack.map(state => ({
      decidedMask: BigInt(state.decidedMask),
      virusCount: state.virusCount,
      placements: state.placements,
      decidedCount: state.decidedCount == null
        ? occupiedCount(BigInt(state.decidedMask))
        : state.decidedCount,
    }))
    : [{ decidedMask: 0n, virusCount: outsideVirusCount, placements: [], decidedCount: 0 }];
  while (stack.length && !shouldStop()) {
    const state = stack.pop();
    nodesExpanded++;
    nodesExpandedTotal++;
    const working = { ...outside };
    const workingCounts = outsideCounts.slice();
    let workingSum = outsideOptimisticSum;
    for (const [anchor, type] of state.placements) {
      working[anchor] = type;
      if (boundCtx) {
        workingCounts[type]++;
        workingSum += boundCtx.optimisticTerm(anchor, type);
      }
    }
    if (transpositionSeen) {
      const canonicalPlacements = state.placements.slice()
        .sort((a, b) => a[0] - b[0] || a[1] - b[1])
        .map(row => row.join(':'))
        .join(',');
      const transpositionKey = `${state.decidedMask}|${state.virusCount}|${canonicalPlacements}`;
      if (transpositionSeen.has(transpositionKey)) {
        transpositionHits++;
        nodesPruned++;
        continue;
      }
      transpositionSeen.add(transpositionKey);
    }
    if (boundCtx && upperBound(state, workingCounts, workingSum) < scoreThreshold() - 1e-9) {
      nodesPruned++;
      continue;
    }
    if (state.decidedMask === fullMask) {
      record(working);
      continue;
    }
    const undecidedIndex = firstUndecidedIndex(state.decidedMask);
    if (undecidedIndex < 0) {
      record(working);
      continue;
    }
    const slot = regionSlots[undecidedIndex];
    stack.push({
      decidedMask: state.decidedMask | (1n << BigInt(undecidedIndex)),
      virusCount: state.virusCount,
      placements: state.placements,
      decidedCount: state.decidedCount + 1,
    });
    const placements = placementsBySlot.get(slot) || [];
    for (let index = placements.length - 1; index >= 0; index--) {
      const placement = placements[index];
      if ((placement.mask & state.decidedMask) !== 0n) continue;
      if (placement.type === 5 && state.virusCount >= virusLimit) continue;
      stack.push({
        decidedMask: placement.mask | state.decidedMask,
        virusCount: state.virusCount + Number(placement.type === 5),
        placements: [...state.placements, [placement.anchor, placement.type]],
        decidedCount: state.decidedCount + placement.slots.length,
      });
    }
  }
  if (stack.length && termination === 'complete') {
    termination = 'node-budget';
    stopped = true;
  }
  const candidates = Array.from(candidateMap.values())
    .sort((a, b) => b.score - a.score || jellyLayoutKey(a.layout).localeCompare(jellyLayoutKey(b.layout)))
    .slice(0, resultLimit);
  return {
    candidates,
    best: candidates[0] || null,
    certificate: {
      complete: !stopped,
      feasible: leavesEvaluated > 0,
      claim: !stopped
        ? 'optimal-free-composition-repairs-within-declared-region'
        : 'best-free-composition-regional-incumbents-within-budget',
      scope: {
        kind: 'fixed-outside-free-composition-region',
        requestedRegionSlots: Array.from(requestedRegion).sort((a, b) => a - b),
        regionSlots,
        boundaryExpansionSlots: regionSlots.filter(slot => !requestedRegion.has(slot)),
        fixedFever: fever,
        obstruction,
        objective,
        allowedTypes,
      },
      termination,
      budgetMode: deterministicNodeBudget ? 'deterministic-node-budget' : 'node-or-time-budget',
      nodesExpanded,
      nodesExpandedTotal,
      nodesPruned,
      branchAndBound: Boolean(boundCtx),
      branchAndBoundMode: boundRequested === true ? 'forced' : (boundRequested === false ? 'disabled' : 'auto'),
      leavesEvaluated,
      legalPlacements,
      boundDensityStates: boundCtx ? 1 : 0,
      transpositionStates: transpositionSeen?.size || 0,
      transpositionHits,
      elapsedMs: Date.now() - startedAt,
      nodeBudget,
      timeBudgetMs,
      resumable: stack.length > 0,
    },
    resumeToken: stack.length ? {
      scopeKey,
      nodesExpandedTotal,
      leavesEvaluated,
      nodesPruned,
      candidates,
      stack: stack.map(state => ({
        decidedMask: state.decidedMask.toString(),
        virusCount: state.virusCount,
        placements: state.placements,
        decidedCount: state.decidedCount,
      })),
    } : null,
  };
}

function jellyCertificateScoreFunction(S, options = {}) {
  const objective = options.objective || 'dps';
  const fever = options.fever == null ? jellyProgress(S).fever : Math.max(0, Math.floor(n(options.fever)));
  const obstruction = options.obstruction == null
    ? jellyProgress(S).obstruction
    : Math.max(0, Math.floor(n(options.obstruction)));
  const expCellType = normalizeExpCellType(S, options.expCellType);
  if (options.scoreModel !== 'sampled-operation') {
    return {
      scoreModel: 'deterministic-proxy',
      scoreLayout: candidate => proxyObjectiveScore(candidate, S, {
        ...options,
        objective,
        fever,
        obstruction,
        expCellType,
        assumeValid: true,
      }),
    };
  }
  const sampledJointPolicy = options.sampledJointPolicy === true;
  const sampledTrials = Math.max(sampledJointPolicy ? 4 : 1, Math.min(256, Math.floor(n(options.sampledTrials) || 16)));
  const sampledSeed = Math.floor(n(options.sampledSeed) || 1);
  const sampledPolicy = {
    fever,
    roidTiming: options.sampledPolicy?.roidTiming ?? options.roidTiming,
    revivePolicy: options.sampledPolicy?.revivePolicy ?? options.revivePolicy,
  };
  const cache = new Map();
  return {
    scoreModel: 'sampled-operation',
    sampledTrials,
    sampledSeed,
    sampledPolicy,
    sampledJointPolicy,
    sampledPolicyScope: sampledJointPolicy ? 'bounded-per-layout-policy-portfolio' : 'fixed-policy',
    scoreLayout(candidate) {
      const key = jellyLayoutKey(candidate);
      if (cache.has(key)) return cache.get(key);
      const simulation = sampledJointPolicy
        ? optimizeJellyOperationPolicy(candidate, S, {
          ...options,
          objective,
          expCellType,
          obstruction,
          trials: sampledTrials,
          screeningTrials: Math.min(4, sampledTrials),
          seed: sampledSeed,
          includeTrials: false,
          onProgress: undefined,
        })
        : simulateJellyTrials(candidate, S, {
          ...options,
          ...sampledPolicy,
          objective,
          expCellType,
          obstruction,
          trials: sampledTrials,
          seed: sampledSeed,
          includeTrials: false,
        });
      const score = simulation.valid
        ? simulatedObjectiveScore(simulation, objective, expCellType)
        : -Infinity;
      cache.set(key, score);
      return score;
    },
  };
}

export function certifyJellyMoveNeighborhood(layout, S, options = {}) {
  const startedAt = Date.now();
  const baseLayout = { ...(layout || jellyLayoutFromSave(S)) };
  const moveResume = options.resumeToken?.baseLayoutKey === jellyLayoutKey(baseLayout)
    ? options.resumeToken
    : null;
  const objective = options.objective || 'dps';
  const fever = options.fever == null ? jellyProgress(S).fever : Math.max(0, Math.floor(n(options.fever)));
  const obstruction = options.obstruction == null
    ? jellyProgress(S).obstruction
    : Math.max(0, Math.floor(n(options.obstruction)));
  const expCellType = normalizeExpCellType(S, options.expCellType);
  const deterministicNodeBudget = options.deterministicNodeBudget === true
    && options.scoreModel !== 'sampled-operation';
  const nodeBudget = Math.max(100, Math.min(50000000, Math.floor(n(options.nodeBudget) || 2000000)));
  const timeBudgetMs = Math.max(100, Math.min(3600000, Math.floor(n(options.timeBudgetMs) || 60000)));
  const perRegionNodeBudget = Math.max(100, Math.min(5000000, Math.floor(n(options.perRegionNodeBudget) || 100000)));
  const maxRepackCells = Math.max(0, Math.min(3, Math.floor(
    options.maxRepackCells == null ? 3 : n(options.maxRepackCells)
  )));
  const repackPadding = Math.max(0, Math.min(2, Math.floor(n(options.repackPadding) || 1)));
  const unlocked = jellyUnlockedSlots(S);
  const scoreContext = jellyCertificateScoreFunction(S, {
    ...options,
    objective,
    fever,
    obstruction,
    expCellType,
  });
  const scoreLayout = scoreContext.scoreLayout;
  const baselineScore = scoreLayout(baseLayout);
  const cells = Object.entries(baseLayout).map(([rawAnchor, rawType]) => ({
    anchor: Number(rawAnchor),
    type: Number(rawType),
    slots: jellyFootprintSlots(Number(rawAnchor), Number(rawType)) || [],
  })).sort((a, b) => a.anchor - b.anchor);
  const placementsByType = Array.from({ length: jellyUnitsOwned(S) }, (_, type) => {
    const placements = [];
    for (let anchor = 0; anchor < JELLY_SIZE; anchor++) {
      const slots = jellyFootprintSlots(anchor, type);
      if (slots?.every(slot => unlocked.has(slot))) placements.push({ anchor, type, slots });
    }
    return placements;
  });
  const seenLayouts = new Set(moveResume?.seenLayoutKeys || [jellyLayoutKey(baseLayout)]);
  seenLayouts.add(jellyLayoutKey(baseLayout));
  const familyCounts = moveResume?.familyCounts || {
    relocation: 0,
    swap: 0,
    replacement: 0,
    repack: 0,
  };
  let nodesExpanded = 0;
  let exactRepackScopes = Math.max(0, Math.floor(n(moveResume?.exactRepackScopes)));
  let exactRepackCompleteScopes = Math.max(0, Math.floor(n(moveResume?.exactRepackCompleteScopes)));
  let exactRepackBudgetLimitedScopes = 0;
  let termination = 'complete';
  let bestImprovement = moveResume?.bestImprovement || null;
  const shouldStop = () => {
    if (nodesExpanded >= nodeBudget) {
      termination = 'node-budget';
      return true;
    }
    if (!deterministicNodeBudget && Date.now() - startedAt >= timeBudgetMs) {
      termination = 'time-budget';
      return true;
    }
    return false;
  };
  const record = (candidate, family, detail = {}) => {
    if (!candidate || shouldStop()) return;
    const key = jellyLayoutKey(candidate);
    if (seenLayouts.has(key)) return;
    seenLayouts.add(key);
    nodesExpanded++;
    familyCounts[family]++;
    const score = scoreLayout(candidate);
    if (score > baselineScore + 1e-9
      && (!bestImprovement || score > bestImprovement.score + 1e-9
        || (Math.abs(score - bestImprovement.score) <= 1e-9 && key < jellyLayoutKey(bestImprovement.layout)))) {
      bestImprovement = {
        family,
        score,
        gain: score - baselineScore,
        gainPercent: baselineScore > 0 ? 100 * (score - baselineScore) / baselineScore : 0,
        layout: candidate,
        ...detail,
      };
    }
  };
  const originalCount = cells.length;
  if (!moveResume) {
    for (const cell of cells) {
      if (shouldStop()) break;
      const removed = jellyRemoveCell(baseLayout, cell.anchor);
      for (const placement of placementsByType[cell.type]) {
        if (shouldStop()) break;
        const candidate = jellyPlaceCell(removed, placement.anchor, cell.type, S);
        if (!candidate || Object.keys(candidate).length !== originalCount) continue;
        record(candidate, 'relocation', { fromAnchor: cell.anchor, toAnchor: placement.anchor, type: cell.type });
      }
      for (let type = 0; type < placementsByType.length; type++) {
        for (const placement of placementsByType[type]) {
          if (shouldStop()) break;
          const candidate = jellyPlaceCell(removed, placement.anchor, type, S);
          if (!candidate || Object.keys(candidate).length !== originalCount) continue;
          record(candidate, 'replacement', {
            removedAnchor: cell.anchor,
            removedType: cell.type,
            addedAnchor: placement.anchor,
            addedType: type,
          });
        }
        if (shouldStop()) break;
      }
    }
    for (let firstIndex = 0; firstIndex < cells.length && !shouldStop(); firstIndex++) {
      for (let secondIndex = firstIndex + 1; secondIndex < cells.length && !shouldStop(); secondIndex++) {
        const first = cells[firstIndex];
        const second = cells[secondIndex];
        if (first.type === second.type) continue;
        const candidate = {
          ...jellyRemoveCell(jellyRemoveCell(baseLayout, first.anchor), second.anchor),
          [first.anchor]: second.type,
          [second.anchor]: first.type,
        };
        if (!jellyValidateLayout(candidate, S).valid) continue;
        record(candidate, 'swap', {
          firstAnchor: first.anchor,
          secondAnchor: second.anchor,
          firstType: first.type,
          secondType: second.type,
        });
      }
    }
  }
  const adjacent = (first, second) => first.slots.some(firstSlot => second.slots.some(secondSlot => {
    const firstRow = Math.floor(firstSlot / JELLY_COLS);
    const secondRow = Math.floor(secondSlot / JELLY_COLS);
    return Math.abs(firstRow - secondRow) + Math.abs(firstSlot % JELLY_COLS - secondSlot % JELLY_COLS) <= 1;
  }));
  const connectedGroups = [];
  if (maxRepackCells >= 2) {
    for (let first = 0; first < cells.length; first++) {
      for (let second = first + 1; second < cells.length; second++) {
        if (!adjacent(cells[first], cells[second])) continue;
        connectedGroups.push([cells[first], cells[second]]);
        if (maxRepackCells < 3) continue;
        for (let third = second + 1; third < cells.length; third++) {
          if (!adjacent(cells[first], cells[third]) && !adjacent(cells[second], cells[third])) continue;
          connectedGroups.push([cells[first], cells[second], cells[third]]);
        }
      }
    }
  }
  let repackResumeToken = null;
  for (let groupIndex = Math.max(0, Math.floor(n(moveResume?.groupIndex)));
    groupIndex < connectedGroups.length;
    groupIndex++) {
    const group = connectedGroups[groupIndex];
    if (shouldStop()) break;
    const region = new Set(group.flatMap(cell => cell.slots));
    for (let padding = 0; padding < repackPadding; padding++) {
      for (const slot of Array.from(region)) {
        const row = Math.floor(slot / JELLY_COLS);
        const col = slot % JELLY_COLS;
        for (const [dy, dx] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const nextRow = row + dy;
          const nextCol = col + dx;
          const next = nextRow * JELLY_COLS + nextCol;
          if (nextRow >= 0 && nextRow < JELLY_SIZE / JELLY_COLS
            && nextCol >= 0 && nextCol < JELLY_COLS && unlocked.has(next)) region.add(next);
        }
      }
    }
    const remainingBudget = nodeBudget - nodesExpanded;
    const resumingGroup = groupIndex === moveResume?.groupIndex && Boolean(moveResume.freeResumeToken);
    const result = enumerateJellyRegionFreeExact(baseLayout, S, {
      ...options,
      regionSlots: Array.from(region),
      objective,
      fever,
      obstruction,
      expCellType,
      nodeBudget: Math.min(perRegionNodeBudget, remainingBudget),
      deterministicNodeBudget,
      resultLimit: 1,
      resumeToken: resumingGroup ? moveResume.freeResumeToken : null,
      _scoreLayout: scoreLayout,
      boundModel: scoreContext.scoreModel === 'deterministic-proxy' && objective === 'dps'
        ? 'steady-dps'
        : undefined,
      onProgress: undefined,
    });
    if (!resumingGroup) exactRepackScopes++;
    nodesExpanded += result.certificate.nodesExpanded || 0;
    if (result.certificate.complete) exactRepackCompleteScopes++;
    else exactRepackBudgetLimitedScopes++;
    if (result.best) {
      const key = jellyLayoutKey(result.best.layout);
      if (!seenLayouts.has(key)) {
        seenLayouts.add(key);
        familyCounts.repack++;
        if (result.best.score > baselineScore + 1e-9
          && (!bestImprovement || result.best.score > bestImprovement.score + 1e-9
            || (Math.abs(result.best.score - bestImprovement.score) <= 1e-9
              && key < jellyLayoutKey(bestImprovement.layout)))) {
          bestImprovement = {
            family: 'repack',
            score: result.best.score,
            gain: result.best.score - baselineScore,
            gainPercent: baselineScore > 0 ? 100 * (result.best.score - baselineScore) / baselineScore : 0,
            layout: result.best.layout,
            sourceAnchors: group.map(cell => cell.anchor),
            regionSlots: result.certificate.scope.regionSlots,
          };
        }
      }
    }
    if (!result.certificate.complete) {
      termination = result.certificate.termination || 'node-budget';
      repackResumeToken = {
        baseLayoutKey: jellyLayoutKey(baseLayout),
        groupIndex,
        freeResumeToken: result.resumeToken,
        familyCounts,
        exactRepackScopes,
        exactRepackCompleteScopes,
        bestImprovement,
        seenLayoutKeys: Array.from(seenLayouts),
      };
      break;
    }
  }
  const complete = termination === 'complete' && !repackResumeToken;
  return {
    baselineLayout: baseLayout,
    baselineScore,
    bestImprovement,
    certificate: {
      complete,
      claim: bestImprovement
        ? 'not-locally-optimal-improvement-found'
        : (complete ? 'certified-move-neighbourhood-optimum' : 'move-neighbourhood-unproven-within-budget'),
      scope: {
        kind: 'global-move-neighbourhood',
        objective,
        fixedFever: fever,
        obstruction,
        families: [
          'same-type-relocation',
          'two-cell-type-swap',
          'one-remove-one-place',
          ...(maxRepackCells >= 2 ? [`connected-up-to-${maxRepackCells}-cell-repack`] : []),
        ],
        maxRepackCells,
        repackPadding,
        scoreModel: scoreContext.scoreModel,
        sampledTrials: scoreContext.sampledTrials || 0,
        sampledSeed: scoreContext.sampledSeed ?? null,
        sampledPolicy: scoreContext.sampledPolicy || null,
        sampledJointPolicy: Boolean(scoreContext.sampledJointPolicy),
        sampledPolicyScope: scoreContext.sampledPolicyScope || null,
      },
      termination,
      budgetMode: deterministicNodeBudget ? 'deterministic-node-budget' : 'node-or-time-budget',
      nodesExpanded,
      layoutsEvaluated: seenLayouts.size - 1,
      familyCounts,
      exactRepackScopes,
      exactRepackCompleteScopes,
      exactRepackBudgetLimitedScopes,
      elapsedMs: Date.now() - startedAt,
      nodeBudget,
      timeBudgetMs,
      resumable: Boolean(repackResumeToken),
    },
    resumeToken: repackResumeToken,
  };
}

export function jellyLocalCertificateRegions(S, options = {}) {
  const windowWidth = Math.max(1, Math.min(6, Math.floor(n(options.windowWidth) || 4)));
  const windowHeight = Math.max(1, Math.min(6, Math.floor(n(options.windowHeight) || windowWidth)));
  const stride = Math.max(1, Math.min(6, Math.floor(n(options.stride) || 1)));
  const coordinationDepth = Math.max(1, Math.min(2, Math.floor(n(options.coordinationDepth) || 1)));
  const nonlocalPairLimit = Math.max(0, Math.min(64, Math.floor(n(options.nonlocalPairLimit))));
  const unlocked = jellyUnlockedSlots(S);
  const rows = Math.max(1, Math.floor(JELLY_SIZE / JELLY_COLS));
  const baseWindows = [];
  const seenWindows = new Set();
  for (let row = 0; row + windowHeight <= rows; row += stride) {
    for (let col = 0; col + windowWidth <= JELLY_COLS; col += stride) {
      const slots = [];
      for (let dy = 0; dy < windowHeight; dy++) {
        for (let dx = 0; dx < windowWidth; dx++) {
          const slot = (row + dy) * JELLY_COLS + col + dx;
          if (unlocked.has(slot)) slots.push(slot);
        }
      }
      if (!slots.length) continue;
      const key = slots.join(',');
      if (seenWindows.has(key)) continue;
      seenWindows.add(key);
      baseWindows.push({ row, col, slots });
    }
  }
  const regions = baseWindows.map(window => ({
    ...window,
    kind: 'single-window',
    members: [{ row: window.row, col: window.col }],
  }));
  let adjacentRegions = 0;
  if (coordinationDepth >= 2) {
    const byOrigin = new Map(baseWindows.map(window => [`${window.row},${window.col}`, window]));
    const seenRegions = new Set(regions.map(window => window.slots.join(',')));
    for (const window of baseWindows) {
      for (const [row, col] of [
        [window.row, window.col + stride],
        [window.row + stride, window.col],
      ]) {
        const neighbor = byOrigin.get(`${row},${col}`);
        if (!neighbor) continue;
        const slots = Array.from(new Set([...window.slots, ...neighbor.slots])).sort((a, b) => a - b);
        const key = slots.join(',');
        if (seenRegions.has(key)) continue;
        seenRegions.add(key);
        regions.push({
          row: Math.min(window.row, neighbor.row),
          col: Math.min(window.col, neighbor.col),
          slots,
          kind: 'coordinated-window-pair',
          members: [
            { row: window.row, col: window.col },
            { row: neighbor.row, col: neighbor.col },
          ],
        });
        adjacentRegions++;
      }
    }
  }
  let nonlocalRegions = 0;
  if (nonlocalPairLimit > 0) {
    const seenRegions = new Set(regions.map(window => window.slots.join(',')));
    const candidates = [];
    for (let firstIndex = 0; firstIndex < baseWindows.length; firstIndex++) {
      for (let secondIndex = firstIndex + 1; secondIndex < baseWindows.length; secondIndex++) {
        const first = baseWindows[firstIndex];
        const second = baseWindows[secondIndex];
        if (first.slots.some(slot => second.slots.includes(slot))) continue;
        const rowDistance = Math.abs(first.row - second.row);
        const colDistance = Math.abs(first.col - second.col);
        if (rowDistance < windowHeight && colDistance < windowWidth) continue;
        const slots = Array.from(new Set([...first.slots, ...second.slots])).sort((a, b) => a - b);
        const key = slots.join(',');
        if (seenRegions.has(key)) continue;
        candidates.push({
          first,
          second,
          slots,
          key,
          distance: rowDistance + colDistance,
        });
      }
    }
    candidates.sort((a, b) => b.distance - a.distance
      || a.first.row - b.first.row
      || a.first.col - b.first.col
      || a.second.row - b.second.row
      || a.second.col - b.second.col);
    for (const candidate of candidates.slice(0, nonlocalPairLimit)) {
      if (seenRegions.has(candidate.key)) continue;
      seenRegions.add(candidate.key);
      regions.push({
        row: Math.min(candidate.first.row, candidate.second.row),
        col: Math.min(candidate.first.col, candidate.second.col),
        slots: candidate.slots,
        kind: 'nonlocal-window-pair',
        distance: candidate.distance,
        members: [
          { row: candidate.first.row, col: candidate.first.col },
          { row: candidate.second.row, col: candidate.second.col },
        ],
      });
      nonlocalRegions++;
    }
  }
  const adaptiveRegionLimit = Math.max(0, Math.min(32, Math.floor(n(options.adaptiveRegionLimit))));
  let adaptiveRegions = 0;
  if (adaptiveRegionLimit > 0 && options.layout) {
    const seenRegions = new Set(regions.map(window => window.slots.join(',')));
    const anchors = [];
    const anchorSeen = new Set();
    const addAnchor = anchor => {
      anchor = Math.floor(n(anchor));
      if (anchor < 0 || anchor >= JELLY_SIZE || anchorSeen.has(anchor)) return;
      anchorSeen.add(anchor);
      anchors.push(anchor);
    };
    const layout = options.layout || {};
    const structuralAnchors = Object.entries(layout)
      .filter(([, rawType]) => [3, 4, 5].includes(Number(rawType)))
      .map(([rawAnchor]) => Number(rawAnchor));
    structuralAnchors.forEach(addAnchor);
    jellyAnchorContributions(layout, S, { fever: options.fever })
      .slice()
      .sort((a, b) => a.marginalDps - b.marginalDps || a.anchor - b.anchor)
      .slice(0, adaptiveRegionLimit)
      .forEach(row => addAnchor(row.anchor));
    for (const comparison of options.comparisonLayouts || []) {
      const occupied = jellyLayoutOccupancy(comparison || {});
      const baselineOccupied = jellyLayoutOccupancy(layout);
      for (const slot of unlocked) {
        const left = baselineOccupied.get(slot);
        const right = occupied.get(slot);
        if (left?.anchor !== right?.anchor || left?.type !== right?.type) addAnchor(slot);
      }
    }
    for (const anchor of anchors) {
      if (adaptiveRegions >= adaptiveRegionLimit) break;
      const anchorRow = Math.floor(anchor / JELLY_COLS);
      const anchorCol = anchor % JELLY_COLS;
      const row = Math.max(0, Math.min(rows - windowHeight, anchorRow - Math.floor(windowHeight / 2)));
      const col = Math.max(0, Math.min(JELLY_COLS - windowWidth, anchorCol - Math.floor(windowWidth / 2)));
      const slots = [];
      for (let dy = 0; dy < windowHeight; dy++) {
        for (let dx = 0; dx < windowWidth; dx++) {
          const slot = (row + dy) * JELLY_COLS + col + dx;
          if (unlocked.has(slot)) slots.push(slot);
        }
      }
      const key = slots.join(',');
      if (!slots.length || seenRegions.has(key)) continue;
      seenRegions.add(key);
      regions.push({
        row,
        col,
        slots,
        kind: 'adaptive-structural-window',
        focusAnchor: anchor,
        members: [{ row, col }],
      });
      adaptiveRegions++;
    }
  }
  const dependencyRegionLimit = Math.max(0, Math.min(32, Math.floor(n(options.dependencyRegionLimit))));
  let dependencyRegions = 0;
  if (dependencyRegionLimit > 0 && options.layout) {
    const layout = options.layout || {};
    const occupancy = jellyLayoutOccupancy(layout);
    const seenRegions = new Set(regions.map(region => region.slots.join(',')));
    const maxDependencySlots = Math.max(8, Math.min(48, Math.floor(
      n(options.maxDependencySlots) || windowWidth * windowHeight * 2
    )));
    const addDependencyRegion = (kind, focusAnchor, rawSlots) => {
      if (dependencyRegions >= dependencyRegionLimit) return;
      const slots = Array.from(new Set(rawSlots))
        .filter(slot => unlocked.has(slot))
        .sort((a, b) => a - b);
      if (!slots.length || slots.length > maxDependencySlots) return;
      const key = slots.join(',');
      if (seenRegions.has(key)) return;
      seenRegions.add(key);
      regions.push({
        row: Math.min(...slots.map(slot => Math.floor(slot / JELLY_COLS))),
        col: Math.min(...slots.map(slot => slot % JELLY_COLS)),
        slots,
        kind,
        focusAnchor,
        members: [],
      });
      dependencyRegions++;
    };
    for (const [rawAnchor, rawType] of Object.entries(layout)) {
      if (dependencyRegions >= dependencyRegionLimit) break;
      const anchor = Number(rawAnchor);
      const type = Number(rawType);
      if (type === 5) {
        const neighborSlots = [
          anchor - JELLY_COLS,
          anchor + JELLY_COLS,
          ...(anchor % JELLY_COLS > 0 ? [anchor - 1] : []),
          ...(anchor % JELLY_COLS < JELLY_COLS - 1 ? [anchor + 1] : []),
        ];
        const anchors = new Set([anchor]);
        for (const slot of neighborSlots) {
          const cell = occupancy.get(slot);
          if (cell) anchors.add(cell.anchor);
        }
        addDependencyRegion(
          'virus-dependency-component',
          anchor,
          Array.from(anchors).flatMap(cellAnchor => jellyFootprintSlots(cellAnchor, Number(layout[cellAnchor])) || [])
        );
      } else if (type === 3) {
        const reach = new Set(_organelleReachSlots(anchor));
        const anchors = new Set([anchor]);
        for (const [slot, cell] of occupancy) if (reach.has(slot)) anchors.add(cell.anchor);
        addDependencyRegion(
          'organelle-dependency-component',
          anchor,
          Array.from(anchors).flatMap(cellAnchor => jellyFootprintSlots(cellAnchor, Number(layout[cellAnchor])) || [])
        );
      }
    }
    const immunoidAnchors = Object.entries(layout)
      .filter(([, rawType]) => Number(rawType) === 4)
      .map(([rawAnchor]) => Number(rawAnchor));
    if (immunoidAnchors.length) {
      addDependencyRegion(
        'immunoid-target-pool',
        immunoidAnchors[0],
        immunoidAnchors.flatMap(anchor => jellyFootprintSlots(anchor, 4) || [])
      );
    }
    for (const comparison of options.comparisonLayouts || []) {
      if (dependencyRegions >= dependencyRegionLimit) break;
      const comparisonOccupancy = jellyLayoutOccupancy(comparison || {});
      const differing = new Set();
      for (const slot of unlocked) {
        const left = occupancy.get(slot);
        const right = comparisonOccupancy.get(slot);
        if (left?.anchor !== right?.anchor || left?.type !== right?.type) differing.add(slot);
      }
      while (differing.size && dependencyRegions < dependencyRegionLimit) {
        const first = differing.values().next().value;
        const queue = [first];
        const component = new Set();
        differing.delete(first);
        while (queue.length) {
          const slot = queue.pop();
          component.add(slot);
          const row = Math.floor(slot / JELLY_COLS);
          const col = slot % JELLY_COLS;
          for (const next of [
            slot - JELLY_COLS,
            slot + JELLY_COLS,
            ...(col > 0 ? [slot - 1] : []),
            ...(col < JELLY_COLS - 1 ? [slot + 1] : []),
          ]) {
            if (next < 0 || next >= JELLY_SIZE || Math.abs(Math.floor(next / JELLY_COLS) - row) > 1) continue;
            if (!differing.has(next)) continue;
            differing.delete(next);
            queue.push(next);
          }
        }
        const expanded = new Set(component);
        for (const slot of component) {
          for (const cell of [occupancy.get(slot), comparisonOccupancy.get(slot)]) {
            if (!cell) continue;
            for (const footprintSlot of jellyFootprintSlots(cell.anchor, cell.type) || []) expanded.add(footprintSlot);
          }
        }
        addDependencyRegion('layout-disagreement-component', first, expanded);
      }
    }
  }
  return {
    regions,
    singleWindows: baseWindows.length,
    coordinatedRegions: adjacentRegions,
    nonlocalRegions,
    adaptiveRegions,
    dependencyRegions,
    windowWidth,
    windowHeight,
    stride,
    coordinationDepth,
    nonlocalPairLimit,
    adaptiveRegionLimit,
    dependencyRegionLimit,
  };
}

// Sliding-window local-optimality certificate. Every window is exactly enumerated with its
// outside fixed, so an exhausted sweep with no improvement is a genuine proof that no change
// confined to any window of the declared size improves the layout under the declared score.
function certifyJellyLocalOptimalityPass(layout, S, options = {}) {
  const startedAt = Date.now();
  const baseLayout = { ...(layout || options.layout || jellyLayoutFromSave(S)) };
  const objective = options.objective || 'dps';
  const fever = options.fever == null ? jellyProgress(S).fever : Math.max(0, Math.floor(n(options.fever)));
  const obstruction = options.obstruction == null
    ? jellyProgress(S).obstruction
    : Math.max(0, Math.floor(n(options.obstruction)));
  const expCellType = normalizeExpCellType(S, options.expCellType);
  const windowWidth = Math.max(1, Math.min(6, Math.floor(n(options.windowWidth) || 4)));
  const windowHeight = Math.max(1, Math.min(6, Math.floor(n(options.windowHeight) || windowWidth)));
  const stride = Math.max(1, Math.min(6, Math.floor(n(options.stride) || 1)));
  const coordinationDepth = Math.max(1, Math.min(2, Math.floor(n(options.coordinationDepth) || 1)));
  const mode = options.mode === 'preserve-composition' ? 'preserve-composition' : 'one-substitution';
  const stopOnFirstImprovement = options.stopOnFirstImprovement !== false;
  const timeBudgetMs = Math.max(100, Math.min(3600000, Math.floor(n(options.timeBudgetMs) || 60000)));
  const deterministicNodeBudget = options.deterministicNodeBudget === true
    && options.scoreModel !== 'sampled-operation';
  const totalNodeBudget = Math.max(100, Math.min(50000000, Math.floor(n(options.totalNodeBudget) || 5000000)));
  const windowNodeBudget = Math.max(100, Math.min(5000000, Math.floor(n(options.windowNodeBudget) || 200000)));
  const windowTimeBudgetMs = Math.max(10, Math.min(60000, Math.floor(n(options.windowTimeBudgetMs) || 1500)));
  const scoreContext = jellyCertificateScoreFunction(S, {
    ...options,
    objective,
    fever,
    obstruction,
    expCellType,
  });
  const scoreLayout = scoreContext.scoreLayout;
  const baselineScore = scoreLayout(baseLayout);
  const regionPlan = jellyLocalCertificateRegions(S, { ...options, layout: baseLayout });
  const windows = regionPlan.regions;
  const regionStartIndex = Math.max(0, Math.min(windows.length, Math.floor(n(options.regionStartIndex))));
  const regionEndIndex = Math.max(regionStartIndex, Math.min(
    windows.length,
    options.regionEndIndex == null ? windows.length : Math.floor(n(options.regionEndIndex))
  ));
  const selectedWindows = windows.slice(regionStartIndex, regionEndIndex);
  const improvements = [];
  let windowsChecked = 0;
  let windowsComplete = 0;
  let windowsBudgetLimited = 0;
  let nodesExpanded = 0;
  let nodesPruned = 0;
  let termination = 'complete';
  for (const window of selectedWindows) {
    if (nodesExpanded >= totalNodeBudget) {
      termination = 'node-budget';
      break;
    }
    if (!deterministicNodeBudget && Date.now() - startedAt >= timeBudgetMs) {
      termination = 'time-budget';
      break;
    }
    const remainingNodeBudget = totalNodeBudget - nodesExpanded;
    const result = enumerateJellyRegionRepairsExact(baseLayout, S, {
      regionSlots: window.slots,
      mode,
      objective,
      fever,
      obstruction,
      expCellType,
      nodeBudget: Math.min(windowNodeBudget, remainingNodeBudget),
      timeBudgetMs: windowTimeBudgetMs,
      deterministicNodeBudget,
      resultLimit: 1,
      _scoreLayout: scoreLayout,
      boundModel: scoreContext.scoreModel === 'deterministic-proxy' && objective === 'dps'
        ? 'steady-dps'
        : undefined,
      onProgress: undefined,
    });
    windowsChecked++;
    nodesExpanded += result.certificate.nodesExpanded || 0;
    nodesPruned += result.certificate.nodesPruned || 0;
    if (result.certificate.complete) windowsComplete++;
    else windowsBudgetLimited++;
    if (result.best && result.best.score > baselineScore + 1e-9) {
      improvements.push({
        row: window.row,
        col: window.col,
        kind: window.kind,
        members: window.members,
        regionSlots: result.certificate.scope.regionSlots,
        score: result.best.score,
        gain: result.best.score - baselineScore,
        gainPercent: baselineScore > 0 ? 100 * (result.best.score - baselineScore) / baselineScore : 0,
        layout: result.best.layout,
      });
    }
    options.onProgress?.({
      phase: 'Certifying local optimality',
      completed: windowsChecked,
      total: selectedWindows.length,
      overallPercent: 100 * windowsChecked / Math.max(1, selectedWindows.length),
      windowsComplete,
      windowsBudgetLimited,
      improvementsFound: improvements.length,
    });
    if (improvements.length && stopOnFirstImprovement) {
      termination = 'improvement-found';
      break;
    }
  }
  improvements.sort((a, b) => b.gain - a.gain);
  const exhausted = windowsChecked === selectedWindows.length && windowsBudgetLimited === 0;
  const locallyOptimal = exhausted && improvements.length === 0;
  return {
    locallyOptimal,
    baselineScore,
    baselineLayout: baseLayout,
    bestImprovement: improvements[0] || null,
    improvements: improvements.slice(0, 8),
    certificate: {
      complete: exhausted,
      claim: locallyOptimal
        ? 'certified-local-optimum-within-declared-window-family'
        : (improvements.length
          ? 'not-locally-optimal-improvement-found'
          : 'local-optimality-unproven-within-budget'),
      scope: {
        kind: 'sliding-window-neighbourhood',
        windowWidth,
        windowHeight,
        stride,
        coordinationDepth,
        mode,
        objective,
        fixedFever: fever,
        obstruction,
        unlockedSlots: Array.from(jellyUnlockedSlots(S)).sort((a, b) => a - b),
        windowsPlanned: selectedWindows.length,
        totalRegionsInFamily: windows.length,
        regionStartIndex,
        regionEndIndex,
        singleWindowsPlanned: regionPlan.singleWindows,
        coordinatedRegionsPlanned: regionPlan.coordinatedRegions,
        nonlocalRegionsPlanned: regionPlan.nonlocalRegions,
        adaptiveRegionsPlanned: regionPlan.adaptiveRegions || 0,
        dependencyRegionsPlanned: regionPlan.dependencyRegions || 0,
        scoreModel: scoreContext.scoreModel,
        sampledTrials: scoreContext.sampledTrials || 0,
        sampledSeed: scoreContext.sampledSeed ?? null,
        sampledPolicy: scoreContext.sampledPolicy || null,
        sampledJointPolicy: Boolean(scoreContext.sampledJointPolicy),
        sampledPolicyScope: scoreContext.sampledPolicyScope || null,
      },
      termination,
      budgetMode: deterministicNodeBudget ? 'deterministic-node-budget' : 'node-or-time-budget',
      windowsChecked,
      windowsComplete,
      windowsBudgetLimited,
      nodesExpanded,
      nodesPruned,
      elapsedMs: Date.now() - startedAt,
      timeBudgetMs,
      totalNodeBudget,
      windowNodeBudget,
      windowTimeBudgetMs,
    },
  };
}

export function certifyJellyLocalOptimality(layout, S, options = {}) {
  const iterateToFixedPoint = options.iterateToFixedPoint === true;
  const includeMoveNeighborhood = options.includeMoveNeighborhood === true;
  if (!iterateToFixedPoint && !includeMoveNeighborhood) {
    return certifyJellyLocalOptimalityPass(layout, S, options);
  }
  const initialLayout = { ...(layout || jellyLayoutFromSave(S)) };
  const maxRepairPasses = Math.max(1, Math.min(20, Math.floor(n(options.maxRepairPasses) || 8)));
  let currentLayout = initialLayout;
  const passes = [];
  const appliedRepairs = [];
  let finalLocal = null;
  let finalMoves = null;
  let termination = 'fixed-point';
  for (let passIndex = 0; passIndex < maxRepairPasses; passIndex++) {
    finalLocal = certifyJellyLocalOptimalityPass(currentLayout, S, {
      ...options,
      stopOnFirstImprovement: false,
      onProgress: progress => options.onProgress?.({
        ...progress,
        phase: `Certification pass ${passIndex + 1}: ${progress.phase}`,
        overallPercent: 100 * (passIndex + Math.min(1, n(progress.overallPercent) / 100)) / maxRepairPasses,
      }),
    });
    finalMoves = includeMoveNeighborhood
      ? certifyJellyMoveNeighborhood(currentLayout, S, {
        ...options,
        onProgress: undefined,
      })
      : null;
    const improvements = [
      finalLocal.bestImprovement,
      finalMoves?.bestImprovement,
    ].filter(Boolean).sort((a, b) => b.gain - a.gain
      || jellyLayoutKey(a.layout).localeCompare(jellyLayoutKey(b.layout)));
    const selected = improvements[0] || null;
    passes.push({
      pass: passIndex + 1,
      startingLayoutKey: jellyLayoutKey(currentLayout),
      localClaim: finalLocal.certificate.claim,
      moveClaim: finalMoves?.certificate.claim || 'not-requested',
      localComplete: finalLocal.certificate.complete,
      moveComplete: finalMoves?.certificate.complete ?? true,
      selectedFamily: selected?.family || selected?.kind || null,
      gain: selected?.gain || 0,
      localNodes: finalLocal.certificate.nodesExpanded || 0,
      moveNodes: finalMoves?.certificate.nodesExpanded || 0,
      nodesPruned: finalLocal.certificate.nodesPruned || 0,
      elapsedMs: (finalLocal.certificate.elapsedMs || 0) + (finalMoves?.certificate.elapsedMs || 0),
    });
    if (!selected) {
      const fixedPoint = finalLocal.certificate.complete && (finalMoves?.certificate.complete ?? true);
      if (!fixedPoint) termination = 'budget-limited';
      options.onProgress?.({
        phase: fixedPoint ? 'Certification fixed point complete' : 'Certification budget reached',
        completed: maxRepairPasses,
        total: maxRepairPasses,
        overallPercent: 100,
      });
      return {
        ...finalLocal,
        locallyOptimal: fixedPoint,
        initialLayout,
        baselineLayout: currentLayout,
        finalLayout: currentLayout,
        bestImprovement: null,
        moveCertificate: finalMoves,
        repairPasses: passes,
        appliedRepairs,
        fixedPoint,
        certificate: {
          ...finalLocal.certificate,
          complete: fixedPoint,
          claim: fixedPoint
            ? 'certified-fixed-point-within-declared-neighbourhoods'
            : 'fixed-point-unproven-within-budget',
          termination,
          fixedPointPasses: passes.length,
          moveNeighbourhoodIncluded: includeMoveNeighborhood,
          nodesExpanded: passes.reduce((sum, pass) => sum + pass.localNodes + pass.moveNodes, 0),
          nodesPruned: passes.reduce((sum, pass) => sum + pass.nodesPruned, 0),
          elapsedMs: passes.reduce((sum, pass) => sum + pass.elapsedMs, 0),
        },
      };
    }
    appliedRepairs.push({
      pass: passIndex + 1,
      family: selected.family || selected.kind || 'window-region',
      gain: selected.gain,
      gainPercent: selected.gainPercent,
      fromLayoutKey: jellyLayoutKey(currentLayout),
      toLayoutKey: jellyLayoutKey(selected.layout),
      layout: selected.layout,
    });
    currentLayout = selected.layout;
    if (!iterateToFixedPoint) {
      termination = 'improvement-found';
      break;
    }
  }
  if (iterateToFixedPoint && appliedRepairs.length >= maxRepairPasses) termination = 'repair-pass-budget';
  options.onProgress?.({
    phase: 'Certification repair-pass budget reached',
    completed: maxRepairPasses,
    total: maxRepairPasses,
    overallPercent: 100,
  });
  return {
    ...(finalLocal || certifyJellyLocalOptimalityPass(currentLayout, S, options)),
    locallyOptimal: false,
    initialLayout,
    baselineLayout: currentLayout,
    finalLayout: currentLayout,
    bestImprovement: null,
    moveCertificate: finalMoves,
    repairPasses: passes,
    appliedRepairs,
    fixedPoint: false,
    certificate: {
      ...(finalLocal?.certificate || {}),
      complete: false,
      claim: 'fixed-point-unproven-within-budget',
      termination,
      fixedPointPasses: passes.length,
      moveNeighbourhoodIncluded: includeMoveNeighborhood,
      nodesExpanded: passes.reduce((sum, pass) => sum + pass.localNodes + pass.moveNodes, 0),
      nodesPruned: passes.reduce((sum, pass) => sum + pass.nodesPruned, 0),
      elapsedMs: passes.reduce((sum, pass) => sum + pass.elapsedMs, 0),
    },
  };
}

export function optimizeJellyLayout(S, options = {}) {
  let liveSearchUpdate = null;
  let liveDiversitySnapshot = () => null;
  const reportLayoutProgress = (phase, overallPercent, completed = overallPercent, total = 100) => {
    options.onProgress?.({
      phase,
      completed,
      total,
      overallPercent,
      bestSoFar: liveSearchUpdate,
      diversity: liveDiversitySnapshot(),
    });
  };
  reportLayoutProgress('Initializing layout search', 0.1);
  const objective = options.objective || 'dps';
  const expCellType = normalizeExpCellType(S, options.expCellType);
  const obstruction = options.obstruction == null ? jellyProgress(S).obstruction : Math.max(0, Math.floor(n(options.obstruction)));
  const saved = options.layout || jellyLayoutFromSave(S);
  const layoutKeyCache = new WeakMap();
  const keyOf = layout => {
    if (layoutKeyCache.has(layout)) return layoutKeyCache.get(layout);
    const key = jellyLayoutKey(layout);
    layoutKeyCache.set(layout, key);
    return key;
  };
  const savedKey = keyOf(saved);
  const fever = proxyFeverType(saved, S, objective, obstruction, options.fever, expCellType);
  const metricContext = {
    countBonusUnlocked: jellyUpgradeQuantity(S, 14) >= 1,
    cellSpeed: jellyCellSpeedMultiplier(S, fever),
    proximityLevel: jellyUpgradeQuantity(S, 13),
    organelleMultiplier: 1.5 + Math.min(0.25, Math.max(0, rogBonusQTY(63, S?.cachedUniqueSushi || 0) / 100)),
    roidLevel: jellyUpgradeQuantity(S, 29),
    cellLevelDamage: 1 + jellyUpgradeQuantity(S, 17),
  };
  if (objective === 'dps') metricContext.cellDamage = jellyCellDamageMultiplier(S, { fever });
  const staticSearchContext = jellySearchStaticContext(S);
  const { types, unlockedSet, unlocked, placements, placementByType } = staticSearchContext;
  const searchRandom = seededRandom(Math.floor(n(options.seed) || 1) ^ 0x7f4a7c15);
  const shuffled = values => {
    const result = values.slice();
    for (let index = result.length - 1; index > 0; index--) {
      const swap = Math.floor(searchRandom() * (index + 1));
      [result[index], result[swap]] = [result[swap], result[index]];
    }
    return result;
  };
  const shuffledWithSeed = (values, seed) => {
    const random = seededRandom(seed);
    const result = values.slice();
    for (let index = result.length - 1; index > 0; index--) {
      const swap = Math.floor(random() * (index + 1));
      [result[index], result[swap]] = [result[swap], result[index]];
    }
    return result;
  };
  const referenceRandom = seededRandom(24681357 ^ 0x7f4a7c15);
  const referenceShuffle = values => {
    const result = values.slice();
    for (let index = result.length - 1; index > 0; index--) {
      const swap = Math.floor(referenceRandom() * (index + 1));
      [result[index], result[swap]] = [result[swap], result[index]];
    }
    return result;
  };
  reportLayoutProgress('Building legal placements', 0.2);
  const beamWidth = Math.max(4, Math.min(128, Math.floor(n(options.beamWidth) || 32)));
  const iterations = Math.max(1, Math.min(120, Math.floor(n(options.iterations) || 45)));
  const savedRefinementRounds = Math.max(0, Math.min(30, Math.floor(options.savedRefinementRounds == null ? 4 : n(options.savedRefinementRounds))));
  const refinementRounds = Math.max(0, Math.min(30, Math.floor(options.refinementRounds == null ? 8 : n(options.refinementRounds))));
  const finalistCount = Math.max(1, Math.min(64, Math.floor(n(options.finalistCount) || 8)));
  const screeningCandidateCount = Math.max(finalistCount, Math.min(128, Math.floor(
    options.screeningCandidateCount == null ? finalistCount * 4 : n(options.screeningCandidateCount)
  )));
  const moveCount = layout => jellyLayoutMoves(saved, layout).length;
  const compositionKey = layout => {
    const counts = new Array(8).fill(0);
    for (const type of Object.values(layout)) if (type >= 0 && type < counts.length) counts[type]++;
    return counts.join(',');
  };
  const compareProxy = (a, b) => b.score - a.score || keyOf(a.layout).localeCompare(keyOf(b.layout));
  const layoutScoreCache = new Map();
  const simulationCache = new Map();
  const occupancyCache = new WeakMap();
  let simulationCacheHits = 0;
  let simulationCacheMisses = 0;
  const cachedSimulateTrials = (layout, saveData, simulationOptions = {}) => {
    const cacheKey = [
      keyOf(layout),
      Math.max(0, Math.floor(n(simulationOptions.obstruction))),
      Math.floor(n(simulationOptions.fever)),
      String(simulationOptions.roidTiming ?? ''),
      String(simulationOptions.revivePolicy ?? ''),
      Math.max(1, Math.floor(n(simulationOptions.trials) || 64)),
      Math.floor(n(simulationOptions.seed) || 1),
      simulationOptions.maxCriticalSeconds == null ? '' : Math.max(0, n(simulationOptions.maxCriticalSeconds)),
      simulationOptions.cachedTotalCellLevel == null ? '' : Math.max(0, n(simulationOptions.cachedTotalCellLevel)),
      simulationOptions.secondTickOffset == null ? '' : n(simulationOptions.secondTickOffset),
      simulationOptions.openingProgressByAnchor == null ? '' : JSON.stringify(simulationOptions.openingProgressByAnchor),
      simulationOptions.useRoid === false ? 0 : 1,
      simulationOptions.includeTrials ? 1 : 0,
    ].join('|');
    if (simulationCache.has(cacheKey)) {
      simulationCacheHits++;
      return simulationCache.get(cacheKey);
    }
    simulationCacheMisses++;
    const simulation = simulateJellyTrials(layout, saveData, simulationOptions);
    simulationCache.set(cacheKey, simulation);
    return simulation;
  };
  const scoreLayout = layout => {
    const key = `${objective}|${obstruction}|${fever}|${keyOf(layout)}`;
    if (layoutScoreCache.has(key)) return layoutScoreCache.get(key);
    const score = proxyObjectiveScore(layout, S, {
      ...options,
      objective,
      fever,
      obstruction,
      assumeValid: true,
      _metricContext: metricContext,
    });
    layoutScoreCache.set(key, score);
    return score;
  };
  const liveEvidenceRank = {
    proxy: 1,
    screening: 2,
    racing: 3,
    finalist: 4,
  };
  const considerLiveCandidate = (candidate, evidence = 'proxy', source = '') => {
    if (!candidate?.layout) return;
    const score = Number(candidate.simulationScore ?? candidate.screeningScore ?? candidate.score);
    if (!Number.isFinite(score)) return;
    const rank = liveEvidenceRank[evidence] || 0;
    const currentRank = liveEvidenceRank[liveSearchUpdate?.evidence] || 0;
    const key = keyOf(candidate.layout);
    if (liveSearchUpdate && (rank < currentRank
      || (rank === currentRank && (score < liveSearchUpdate.score - 1e-12
        || (Math.abs(score - liveSearchUpdate.score) <= 1e-12 && key >= liveSearchUpdate.layoutKey))))) return;
    const baselineScore = Number.isFinite(Number(candidate.baselineScore))
      ? Number(candidate.baselineScore)
      : (evidence === 'proxy' ? savedProxyScore : null);
    liveSearchUpdate = {
      layout: { ...candidate.layout },
      layoutKey: key,
      score,
      evidence,
      source,
      moves: moveCount(candidate.layout),
      baselineScore,
      gainPercent: baselineScore
        ? 100 * (score - baselineScore) / Math.abs(baselineScore)
        : null,
    };
  };
  const savedProxyScore = scoreLayout(saved);
  considerLiveCandidate({ layout: saved, score: savedProxyScore }, 'proxy', 'Saved baseline');
  const selectDiverseBy = (candidates, limit = beamWidth, compare = compareProxy) => {
    candidates.sort(compare);
    const selected = [];
    const selectedKeys = new Set();
    const compositions = new Set();
    const diversityTarget = Math.min(limit, Math.max(4, Math.ceil(limit / 2)));
    for (const candidate of candidates) {
      const composition = compositionKey(candidate.layout);
      if (compositions.has(composition)) continue;
      compositions.add(composition);
      selected.push(candidate);
      selectedKeys.add(keyOf(candidate.layout));
      if (selected.length >= diversityTarget) break;
    }
    for (const candidate of candidates) {
      const key = keyOf(candidate.layout);
      if (selectedKeys.has(key)) continue;
      selected.push(candidate);
      selectedKeys.add(key);
      if (selected.length >= limit) break;
    }
    return selected;
  };
  const selectDiverse = (candidates, limit = beamWidth) => selectDiverseBy(candidates, limit, compareProxy);
  const virusLimit = 1 + jellyUpgradeQuantity(S, 15);
  const addWithoutReplacement = (layout, placement) => {
    if (!placement) return null;
    if (placement.type === 5) {
      let viruses = 0;
      for (const type of Object.values(layout)) if (Number(type) === 5) viruses++;
      if (viruses >= virusLimit) return null;
    }
    let occupied = occupancyCache.get(layout);
    if (!occupied) {
      occupied = jellyLayoutOccupancy(layout);
      occupancyCache.set(layout, occupied);
    }
    const slots = placement.slots || jellyFootprintSlots(placement.anchor, placement.type);
    if (!slots || slots.some(slot => !unlockedSet.has(slot) || occupied.has(slot))) return null;
    const next = { ...layout, [placement.anchor]: placement.type };
    const nextOccupied = new Map(occupied);
    for (const slot of slots) nextOccupied.set(slot, { anchor: placement.anchor, type: placement.type });
    occupancyCache.set(next, nextOccupied);
    return next;
  };
  const placeWithReplacement = (layout, placement) => {
    if (!placement) return null;
    let occupied = occupancyCache.get(layout);
    if (!occupied) {
      occupied = jellyLayoutOccupancy(layout);
      occupancyCache.set(layout, occupied);
    }
    const slots = placement.slots || jellyFootprintSlots(placement.anchor, placement.type);
    if (!slots || slots.some(slot => !unlockedSet.has(slot))) return null;
    const removedAnchors = new Set();
    for (const slot of slots) {
      const existing = occupied.get(slot);
      if (existing) removedAnchors.add(existing.anchor);
    }
    const next = { ...layout };
    for (const anchor of removedAnchors) delete next[anchor];
    next[placement.anchor] = placement.type;
    if (Object.values(next).filter(type => Number(type) === 5).length > virusLimit) return null;
    const nextOccupied = new Map();
    for (const [slot, cell] of occupied) {
      if (!removedAnchors.has(cell.anchor)) nextOccupied.set(slot, cell);
    }
    for (const slot of slots) nextOccupied.set(slot, { anchor: placement.anchor, type: placement.type });
    occupancyCache.set(next, nextOccupied);
    return next;
  };
  const oneSlotTypes = types.filter(type => cellFootprint(type).length === 1);
  const fillOpenSlots = layout => {
    let filled = { ...layout };
    const occupied = jellyLayoutOccupancy(filled);
    for (const slot of unlocked) {
      if (occupied.has(slot)) continue;
      let bestLayout = null;
      let bestScore = -Infinity;
      for (const type of oneSlotTypes) {
        const next = addWithoutReplacement(filled, { anchor: slot, type });
        if (!next) continue;
        const score = scoreLayout(next);
        if (score > bestScore) {
          bestLayout = next;
          bestScore = score;
        }
      }
      if (bestLayout) {
        filled = bestLayout;
        occupied.set(slot, { anchor: slot, type: Number(filled[slot]) });
      }
    }
    return filled;
  };
  const referenceAnchorOrders = [referenceShuffle(unlocked), referenceShuffle(unlocked), referenceShuffle(unlocked)];
  const anchorOrders = [
    unlocked,
    unlocked.slice().sort((a, b) => (PROXIMITY_ANCHORS.has(b) ? 1 : 0) - (PROXIMITY_ANCHORS.has(a) ? 1 : 0) || b % JELLY_COLS - a % JELLY_COLS || a - b),
    unlocked.slice().sort((a, b) => b % JELLY_COLS - a % JELLY_COLS || Math.abs(Math.floor(a / JELLY_COLS) - 4.5) - Math.abs(Math.floor(b / JELLY_COLS) - 4.5) || a - b),
    ...[0x243f6a88, 0x85a308d3, 0x13198a2e, 0x03707344]
      .map(seed => shuffledWithSeed(unlocked, seed)),
    ...referenceAnchorOrders,
    shuffled(unlocked),
    shuffled(unlocked),
  ];
  const packingAnchorOrders = [...anchorOrders.slice(0, 3), ...referenceAnchorOrders];
  const seedCellLimit = Math.max(1, unlocked.length);
  const greedyCompositionSeed = (typeOrder, anchors, initialLayout = {}) => {
    let layout = { ...initialLayout };
    const occupied = new Set(jellyLayoutOccupancy(layout).keys());
    let cellCount = Object.keys(layout).length;
    let viruses = Object.values(layout).filter(type => Number(type) === 5).length;
    let changed = true;
    while (changed && cellCount < seedCellLimit) {
      changed = false;
      for (const type of typeOrder) {
        if (cellCount >= seedCellLimit) break;
        if (type === 5 && viruses >= virusLimit) continue;
        for (const anchor of anchors) {
          const slots = jellyFootprintSlots(anchor, type);
          if (!slots || slots.some(slot => !unlockedSet.has(slot) || occupied.has(slot))) continue;
          layout[anchor] = type;
          for (const slot of slots) occupied.add(slot);
          cellCount++;
          if (type === 5) viruses++;
          changed = true;
          break;
        }
      }
    }
    return layout;
  };
  const packExactComposition = (counts, typeOrder, anchors) => {
    let layout = {};
    const remaining = counts.slice();
    let changed = true;
    while (changed && remaining.some(count => count > 0)) {
      changed = false;
      for (const type of typeOrder) {
        if (remaining[type] <= 0) continue;
        for (const anchor of anchors) {
          const next = addWithoutReplacement(layout, { anchor, type });
          if (!next) continue;
          layout = next;
          remaining[type]--;
          changed = true;
          break;
        }
      }
    }
    return remaining.some(count => count > 0) ? null : layout;
  };
  const standaloneOrder = types.slice().sort((a, b) => {
    const scoreA = scoreLayout(addWithoutReplacement({}, placementByType[a]?.[0]) || {});
    const scoreB = scoreLayout(addWithoutReplacement({}, placementByType[b]?.[0]) || {});
    return scoreB / Math.max(1, cellFootprint(b).length) - scoreA / Math.max(1, cellFootprint(a).length) || a - b;
  });
  const typeOrders = [
    standaloneOrder,
    types,
    types.slice().reverse(),
    ...types.map(type => [type]),
  ];
  const randomizedTypeOrders = [];
  const requestedTrialBudget = Math.max(4, Math.min(1000, Math.floor(n(options.simulationTrials) || 32)));
  const defaultRandomizedLanes = requestedTrialBudget >= 128 ? 24 : 12;
  const randomizedConstructionLanes = Math.max(4, Math.min(48, Math.floor(
    options.randomizedConstructionLanes == null ? defaultRandomizedLanes : n(options.randomizedConstructionLanes)
  )));
  for (let lane = 0; lane < randomizedConstructionLanes; lane++) {
    const laneRandom = seededRandom((0x9e3779b9 ^ Math.imul(lane + 1, 0x85ebca6b)) >>> 0);
    const weighted = [];
    for (const type of shuffledWithSeed(types, (0xc2b2ae35 ^ lane) >>> 0)) {
      const copies = 1 + Math.floor(laneRandom() * 4);
      for (let copy = 0; copy < copies; copy++) weighted.push(type);
    }
    randomizedTypeOrders.push(weighted);
  }
  const savedCounts = new Array(8).fill(0);
  for (const type of Object.values(saved)) if (type >= 0 && type < savedCounts.length) savedCounts[type]++;
  const footprintOrder = types.slice().sort((a, b) => cellFootprint(b).length - cellFootprint(a).length || a - b);
  const backtrackExactComposition = (counts, anchors, nodeBudget = 6000, resultLimit = 2) => {
    const anchorRank = new Map(anchors.map((anchor, index) => [anchor, index]));
    const items = [];
    for (const type of footprintOrder) {
      for (let count = 0; count < counts[type]; count++) items.push(type);
    }
    const orderedPlacements = placementByType.map(rows => rows.slice().sort((a, b) => (
      (anchorRank.get(a.anchor) ?? JELLY_SIZE) - (anchorRank.get(b.anchor) ?? JELLY_SIZE)
    )));
    const results = [];
    const resultKeys = new Set();
    let nodes = 0;
    const search = (layout, index, lastRankByType) => {
      if (nodes >= nodeBudget || results.length >= resultLimit) return;
      nodes++;
      if (index >= items.length) {
        const key = keyOf(layout);
        if (!resultKeys.has(key)) {
          resultKeys.add(key);
          results.push(layout);
        }
        return;
      }
      const type = items[index];
      const minimumRank = lastRankByType[type] ?? -1;
      const branchLimit = cellFootprint(type).length === 1 ? 4 : 12;
      let branches = 0;
      for (const placement of orderedPlacements[type] || []) {
        const rank = anchorRank.get(placement.anchor) ?? JELLY_SIZE;
        if (rank <= minimumRank) continue;
        const next = addWithoutReplacement(layout, placement);
        if (!next) continue;
        const nextRanks = lastRankByType.slice();
        nextRanks[type] = rank;
        search(next, index + 1, nextRanks);
        branches++;
        if (branches >= branchLimit || nodes >= nodeBudget || results.length >= resultLimit) break;
      }
    };
    search({}, 0, new Array(8).fill(-1));
    return { layouts: results, nodes };
  };
  const seedCandidates = [{ layout: {}, score: scoreLayout({}) }];
  const seedKeys = new Set([keyOf(seedCandidates[0].layout)]);
  let savedCompositionSeeds = 0;
  let backtrackingNodes = 0;
  let backtrackingSeeds = 0;
  let savedDiscoveredByCompositionRepack = false;
  let independentSavedCompositionLayouts = 0;
  reportLayoutProgress('Packing saved composition', 0.3);
  for (const anchors of packingAnchorOrders) {
    const packed = backtrackExactComposition(savedCounts, anchors);
    backtrackingNodes += packed.nodes;
    for (const layout of packed.layouts) {
      const key = keyOf(layout);
      if (seedKeys.has(key)) continue;
      seedKeys.add(key);
      seedCandidates.push({ layout, score: scoreLayout(layout), seedKind: 'saved-count-backtracking' });
      backtrackingSeeds++;
      if (key === savedKey) savedDiscoveredByCompositionRepack = true;
      else independentSavedCompositionLayouts++;
    }
  }
  savedCompositionSeeds += backtrackingSeeds;
  for (const typeOrder of [footprintOrder, standaloneOrder, types, types.slice().reverse()]) {
    for (const anchors of packingAnchorOrders) {
      const layout = packExactComposition(savedCounts, typeOrder, anchors);
      if (!layout) continue;
      const key = keyOf(layout);
      if (seedKeys.has(key)) continue;
      seedKeys.add(key);
      seedCandidates.push({ layout, score: scoreLayout(layout), seedKind: 'saved-composition' });
      savedCompositionSeeds++;
      if (key === savedKey) savedDiscoveredByCompositionRepack = true;
      else independentSavedCompositionLayouts++;
    }
  }
  reportLayoutProgress('Building composition seeds', 0.4);
  for (let orderIndex = 0; orderIndex < typeOrders.length; orderIndex++) {
    const typeOrder = typeOrders[orderIndex];
    reportLayoutProgress(
      `Building composition seeds ${orderIndex + 1}/${typeOrders.length}`,
      0.4 + 0.1 * (orderIndex + 1) / Math.max(1, typeOrders.length)
    );
    for (const anchors of anchorOrders) {
      const layout = greedyCompositionSeed(typeOrder, anchors);
      const key = keyOf(layout);
      if (seedKeys.has(key)) continue;
      seedKeys.add(key);
      seedCandidates.push({ layout, score: scoreLayout(layout) });
    }
  }
  for (let lane = 0; lane < randomizedTypeOrders.length; lane++) {
    const typeOrder = randomizedTypeOrders[lane];
    const anchors = shuffledWithSeed(unlocked, (0x27d4eb2d ^ Math.imul(lane + 1, 0x165667b1)) >>> 0);
    const layout = greedyCompositionSeed(typeOrder, anchors);
    const key = keyOf(layout);
    if (seedKeys.has(key)) continue;
    seedKeys.add(key);
    seedCandidates.push({ layout, score: scoreLayout(layout), seedKind: 'weighted-composition' });
  }
  let organelleCoverageSeeds = 0;
  let virusConditionedSeeds = 0;
  let virusStructuresEnumerated = 0;
  let virusStructureNodes = 0;
  let virusStructureComplete = true;
  const virusSearchMode = ['fast', 'balanced', 'thorough'].includes(options.virusSearchMode)
    ? options.virusSearchMode
    : 'balanced';
  const virusCountScope = Math.max(0, Math.min(
    virusLimit,
    Math.floor(n(options.virusConditionMaxCount) || ({
      fast: 1,
      balanced: Math.min(3, virusLimit),
      thorough: virusLimit,
    }[virusSearchMode]))
  ));
  const structuralSeedTrials = Math.max(4, Math.min(1000, Math.floor(n(options.simulationTrials) || 32)));
  if (structuralSeedTrials >= 16 && types.includes(0) && types.includes(1) && types.includes(3)) {
    const organellePlacements = placementByType[3] || [];
    const organelleRows = organellePlacements.map(placement => ({
      ...placement,
      slots: jellyFootprintSlots(placement.anchor, placement.type) || [],
      slotSet: new Set(jellyFootprintSlots(placement.anchor, placement.type) || []),
      reach: _organelleReachSlots(placement.anchor).filter(slot => unlockedSet.has(slot)),
    }));
    const structuresByCoverage = new Map();
    const structureCap = Math.max(6, Math.min(24, Math.floor(
      n(options.organelleStructureCap) || Math.max(6, Math.ceil(beamWidth / 2))
    )));
    const compareStructures = (a, b) => (
      b.coverage - a.coverage
      || b.connectionProfile.buffedCells - a.connectionProfile.buffedCells
      || a.connectionProfile.redundantContacts - b.connectionProfile.redundantContacts
      || keyOf(a.layout).localeCompare(keyOf(b.layout))
    );
    const addStructure = rows => {
      const reach = new Set(rows.flatMap(row => row.reach));
      const contactsByTarget = new Map();
      for (const source of rows) {
        const sourceReach = new Set(source.reach);
        for (const target of rows) {
          const contacts = target.slots.reduce((sum, slot) => sum + Number(sourceReach.has(slot)), 0);
          if (contacts) contactsByTarget.set(target.anchor, (contactsByTarget.get(target.anchor) || 0) + contacts);
        }
      }
      const contacts = Array.from(contactsByTarget.values()).reduce((sum, value) => sum + value, 0);
      const layout = Object.fromEntries(rows.map(row => [row.anchor, 3]));
      const structure = {
        layout,
        coverage: reach.size,
        connectionProfile: {
          buffedCells: contactsByTarget.size,
          redundantContacts: Math.max(0, contacts - contactsByTarget.size),
        },
      };
      const coverageRows = structuresByCoverage.get(structure.coverage) || [];
      coverageRows.push(structure);
      coverageRows.sort(compareStructures);
      if (coverageRows.length > 3) coverageRows.length = 3;
      structuresByCoverage.set(structure.coverage, coverageRows);
    };
    for (let first = 0; first < organelleRows.length; first++) {
      reportLayoutProgress(
        `Enumerating Organelle structures ${first + 1}/${organelleRows.length}`,
        0.5 + 0.4 * (first + 1) / Math.max(1, organelleRows.length)
      );
      const firstRow = organelleRows[first];
      for (let second = first + 1; second < organelleRows.length; second++) {
        const secondRow = organelleRows[second];
        if (secondRow.slots.some(slot => firstRow.slotSet.has(slot))) continue;
        for (let third = second + 1; third < organelleRows.length; third++) {
          const thirdRow = organelleRows[third];
          if (thirdRow.slots.some(slot => firstRow.slotSet.has(slot) || secondRow.slotSet.has(slot))) continue;
          addStructure([firstRow, secondRow, thirdRow]);
        }
      }
    }
    const structures = Array.from(structuresByCoverage.values()).flat()
      .sort(compareStructures)
      .slice(0, structureCap);
    const seedsPerStructure = Math.max(8, Math.ceil(144 / Math.max(1, structures.length)));
    for (const structure of structures) {
      for (let seed = 1; seed <= seedsPerStructure; seed++) {
        const anchors = shuffledWithSeed(unlocked, (0x51ed270b ^ seed) >>> 0);
        const layout = greedyCompositionSeed([0, 0, 0, 1], anchors, structure.layout);
        const key = jellyLayoutKey(layout);
        if (seedKeys.has(key)) continue;
        seedKeys.add(key);
        seedCandidates.push({ layout, score: scoreLayout(layout), seedKind: 'organelle-coverage' });
        organelleCoverageSeeds++;
      }
    }
  }
  if (structuralSeedTrials >= 16 && types.includes(5) && (placementByType[5] || []).length) {
    const virusModeDefaults = {
      fast: { structureCap: 8, countLimit: 1, nodeBudget: 20000 },
      balanced: { structureCap: Math.max(12, beamWidth), countLimit: Math.min(3, virusLimit), nodeBudget: 100000 },
      thorough: { structureCap: 64, countLimit: virusLimit, nodeBudget: 5000000 },
    }[virusSearchMode];
    const virusPlacements = placementByType[5].map(placement => ({
      ...placement,
      slotSet: new Set(placement.slots),
      reach: [
        placement.anchor - JELLY_COLS,
        placement.anchor + JELLY_COLS,
        ...(placement.anchor % JELLY_COLS > 0 ? [placement.anchor - 1] : []),
        ...(placement.anchor % JELLY_COLS < JELLY_COLS - 1 ? [placement.anchor + 1] : []),
      ].filter(slot => unlockedSet.has(slot)),
    }));
    const structureLimit = Math.max(4, Math.min(64, Math.floor(
      n(options.virusStructureCap) || virusModeDefaults.structureCap
    )));
    const virusCountLimit = Math.max(1, Math.min(
      virusLimit,
      Math.floor(n(options.virusConditionMaxCount) || virusModeDefaults.countLimit)
    ));
    const nodeBudget = Math.max(1000, Math.min(5000000, Math.floor(
      n(options.virusStructureNodeBudget) || virusModeDefaults.nodeBudget
    )));
    const infectionPotentialBySlot = new Map();
    for (const placement of placements) {
      if (placement.type === 5) continue;
      for (const slot of placement.slots) {
        infectionPotentialBySlot.set(
          slot,
          Math.max(infectionPotentialBySlot.get(slot) || 0, placement.slots.length)
        );
      }
    }
    const structuresByCount = new Map();
    const retainStructure = rows => {
      const reach = new Set(rows.flatMap(row => row.reach));
      const targetWeight = Array.from(reach)
        .reduce((sum, slot) => sum + (infectionPotentialBySlot.get(slot) || 0), 0);
      const layout = Object.fromEntries(rows.map(row => [row.anchor, 5]));
      const rowsForCount = structuresByCount.get(rows.length) || [];
      rowsForCount.push({
        layout,
        count: rows.length,
        reach: reach.size,
        targetWeight,
      });
      rowsForCount.sort((a, b) => b.targetWeight - a.targetWeight
        || b.reach - a.reach
        || jellyLayoutKey(a.layout).localeCompare(jellyLayoutKey(b.layout)));
      const perCountCap = Math.max(2, Math.ceil(structureLimit / virusCountLimit));
      if (rowsForCount.length > perCountCap) rowsForCount.length = perCountCap;
      structuresByCount.set(rows.length, rowsForCount);
      virusStructuresEnumerated++;
    };
    const enumerate = (startIndex, targetCount, rows, occupied) => {
      if (virusStructureNodes >= nodeBudget) {
        virusStructureComplete = false;
        return;
      }
      virusStructureNodes++;
      if (rows.length === targetCount) {
        retainStructure(rows);
        return;
      }
      const needed = targetCount - rows.length;
      for (let index = startIndex; index <= virusPlacements.length - needed; index++) {
        const placement = virusPlacements[index];
        if (placement.slots.some(slot => occupied.has(slot))) continue;
        const nextOccupied = new Set(occupied);
        placement.slots.forEach(slot => nextOccupied.add(slot));
        enumerate(index + 1, targetCount, [...rows, placement], nextOccupied);
        if (!virusStructureComplete) return;
      }
    };
    for (let count = 1; count <= virusCountLimit && virusStructureComplete; count++) {
      enumerate(0, count, [], new Set());
    }
    const bestStructures = Array.from(structuresByCount.values()).flat()
      .sort((a, b) => a.count - b.count
        || b.targetWeight - a.targetWeight
        || jellyLayoutKey(a.layout).localeCompare(jellyLayoutKey(b.layout)));
    const fillOrders = [
      standaloneOrder.filter(type => type !== 5),
      footprintOrder.filter(type => type !== 5),
      [0, 1, 2, 3, 4, 6, 7].filter(type => types.includes(type)),
    ];
    for (const structure of bestStructures) {
      for (let orderIndex = 0; orderIndex < fillOrders.length; orderIndex++) {
        const anchors = shuffledWithSeed(
          unlocked,
          (0xa54ff53a ^ Math.imul(orderIndex + 1, 0x9e3779b1) ^ structure.targetWeight) >>> 0
        );
        const layout = greedyCompositionSeed(fillOrders[orderIndex], anchors, structure.layout);
        const key = jellyLayoutKey(layout);
        if (seedKeys.has(key)) continue;
        seedKeys.add(key);
        seedCandidates.push({
          layout,
          score: scoreLayout(layout),
          seedKind: 'virus-conditioned',
          virusStructure: jellyLayoutKey(structure.layout),
        });
        virusConditionedSeeds++;
      }
    }
  }
  const searchArchive = new Map(seedCandidates.map(candidate => [keyOf(candidate.layout), candidate]));
  const eliteArchive = new Map();
  const diversityCompositions = new Set();
  const diversityVirusCounts = new Set();
  const diversityTypes = new Set();
  const diversitySources = new Set();
  liveDiversitySnapshot = () => ({
    layouts: searchArchive.size,
    eliteNiches: eliteArchive.size,
    compositions: diversityCompositions.size,
    virusCounts: Array.from(diversityVirusCounts).sort((a, b) => a - b),
    cellTypes: Array.from(diversityTypes).sort((a, b) => a - b),
    sources: Array.from(diversitySources).sort(),
  });
  const eliteFeatureKey = layout => {
    const metrics = jellyLayoutMetrics(layout, S, { fever, assumeValid: true, _metricContext: metricContext });
    if (!metrics.valid) return 'invalid';
    const organelleConnections = jellyOrganelleConnectionProfile(layout);
    let organelleCoverage = 0;
    let proximityCoverage = 0;
    let footprintSlots = 0;
    let travelWeighted = 0;
    let attackWeight = 0;
    let immunoids = 0;
    for (const cell of metrics.cells) {
      if (cell.organelle > 1) organelleCoverage++;
      if (cell.proximity > 1) proximityCoverage++;
      footprintSlots += cell.slots.length;
      travelWeighted += jellyProjectileHitDelay(cell.anchor, cell.type, () => 0.5) * cell.attacksPerSecond;
      attackWeight += cell.attacksPerSecond;
      if (cell.type === 4) immunoids++;
    }
    const travelBucket = Math.floor((travelWeighted / Math.max(1e-12, attackWeight)) * 4);
    const attackBucket = Math.floor(Math.log10(Math.max(1, metrics.attacksPerSecond)) * 3);
    return [
      compositionKey(layout),
      Math.floor(organelleCoverage / 2),
      Math.floor(organelleConnections.redundantContacts / 4),
      Math.floor(proximityCoverage / 2),
      Math.floor((metrics.infectedSlots || 0) / 4),
      Math.floor(footprintSlots / 8),
      travelBucket,
      attackBucket,
      immunoids,
    ].join('|');
  };
  const archiveCandidate = candidate => {
    const key = keyOf(candidate.layout);
    const current = searchArchive.get(key);
    if (!current || candidate.score > current.score) searchArchive.set(key, candidate);
    const feature = eliteFeatureKey(candidate.layout);
    const elite = eliteArchive.get(feature);
    if (!elite || candidate.score > elite.score) eliteArchive.set(feature, candidate);
    diversityCompositions.add(compositionKey(candidate.layout));
    diversityVirusCounts.add(Object.values(candidate.layout).filter(type => Number(type) === 5).length);
    for (const type of Object.values(candidate.layout)) diversityTypes.add(Number(type));
    if (candidate.seedKind) diversitySources.add(candidate.seedKind);
    else if (candidate.feedbackKind) diversitySources.add(candidate.feedbackKind);
    else diversitySources.add('search');
    considerLiveCandidate(candidate, 'proxy', candidate.seedKind || candidate.feedbackKind || 'Structural search');
  };
  for (const candidate of seedCandidates) archiveCandidate(candidate);
  const archiveTop = (candidates, limit = Math.max(24, beamWidth * 6)) => {
    const archived = [
      ...candidates.slice().sort(compareProxy).slice(0, limit),
      ...selectDiverse(candidates.slice(), Math.min(limit, candidates.length)),
    ];
    for (const candidate of archived) archiveCandidate(candidate);
  };
  const defaultSearchStarts = requestedTrialBudget >= 32 ? 4 : 2;
  const searchStarts = Math.max(1, Math.min(32, Math.floor(
    options.searchStarts == null ? defaultSearchStarts : n(options.searchStarts)
  )));
  const searchStartOffset = Math.max(0, Math.floor(n(options.searchStartOffset)));
  const layoutHash = layout => {
    let hash = 2166136261;
    for (const character of keyOf(layout)) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  };
  const islandProfiles = [
    'objective',
    'organelle',
    'virus',
    'immunoid',
    'cell-count',
    'saved-perturbation',
  ];
  const structuralStatsCache = new Map();
  const structuralStats = layout => {
    const key = keyOf(layout);
    if (structuralStatsCache.has(key)) return structuralStatsCache.get(key);
    const metrics = jellyLayoutMetrics(layout, S, { fever, assumeValid: true, _metricContext: metricContext });
    const stats = {
      cellCount: Object.keys(layout).length,
      organelleCells: metrics.cells?.filter(cell => cell.organelle > 1).length || 0,
      infectedSlots: metrics.infectedSlots || 0,
      immunoidSlots: metrics.cells?.filter(cell => cell.type === 4)
        .reduce((sum, cell) => sum + cell.slots.length, 0) || 0,
      moves: moveCount(layout),
    };
    structuralStatsCache.set(key, stats);
    return stats;
  };
  const signedLogScore = score => Math.log1p(Math.abs(score)) * Math.sign(score || 1);
  const seedLeaderLogScore = seedCandidates.reduce(
    (best, candidate) => Math.max(best, Math.abs(signedLogScore(candidate.score))),
    0
  );
  const islandBiasScale = Math.max(0.05, seedLeaderLogScore * 0.04);
  const structuralDenominator = Math.max(1, unlocked.length);
  const islandScore = (candidate, start) => {
    const globalStart = searchStartOffset + start;
    const profile = islandProfiles[globalStart % islandProfiles.length];
    const stats = structuralStats(candidate.layout);
    let normalizedBias = 0;
    if (profile === 'organelle') normalizedBias = stats.organelleCells / structuralDenominator;
    else if (profile === 'virus') normalizedBias = stats.infectedSlots / structuralDenominator;
    else if (profile === 'immunoid') normalizedBias = stats.immunoidSlots / structuralDenominator;
    else if (profile === 'cell-count') normalizedBias = stats.cellCount / structuralDenominator;
    else if (profile === 'saved-perturbation') normalizedBias = -stats.moves / structuralDenominator;
    const bias = islandBiasScale * Math.max(-1, Math.min(1, normalizedBias));
    const jitter = (((layoutHash(candidate.layout) ^ Math.imul(globalStart + 1, 0x9e3779b1)) >>> 0) / 4294967296 - 0.5)
      * islandBiasScale;
    return signedLogScore(candidate.score) + bias + jitter;
  };
  const startCompare = start => (a, b) => {
    return islandScore(b, start) - islandScore(a, start) || compareProxy(a, b);
  };
  let beams = Array.from({ length: searchStarts }, (_, start) => (
    selectDiverseBy(seedCandidates.slice(), beamWidth, startCompare(start))
  ));
  const startSeen = beams.map(rows => new Set(rows.map(candidate => keyOf(candidate.layout))));
  const islandRandoms = Array.from({ length: searchStarts }, (_, start) => seededRandom(
    (Math.floor(n(options.seed) || 1) ^ Math.imul(searchStartOffset + start + 1, 0x85ebca6b)) >>> 0
  ));
  const islandArchiveKeys = startSeen.map(set => new Set(set));
  let islandMutationCandidates = 0;
  let islandMigrations = 0;
  const additiveExpansionCache = new Map();
  const additiveExpansions = candidate => {
    const candidateKey = keyOf(candidate.layout);
    if (additiveExpansionCache.has(candidateKey)) return additiveExpansionCache.get(candidateKey);
    const expansions = [];
    for (const placement of placements) {
      const layout = addWithoutReplacement(candidate.layout, placement);
      if (!layout) continue;
      expansions.push({ layout, score: scoreLayout(layout) });
    }
    additiveExpansionCache.set(candidateKey, expansions);
    return expansions;
  };
  let evaluated = seedCandidates.length;
  const searchRounds = iterations + savedRefinementRounds + refinementRounds;
  reportLayoutProgress('Preparing search', 1);
  for (let iteration = 0; iteration < iterations; iteration++) {
    let changed = false;
    beams = beams.map((startBeam, start) => {
      const candidates = startBeam.slice();
      const islandRandom = islandRandoms[start];
      for (const candidate of startBeam) {
        for (const expansion of additiveExpansions(candidate)) {
          const key = keyOf(expansion.layout);
          if (startSeen[start].has(key)) continue;
          startSeen[start].add(key);
          islandArchiveKeys[start].add(key);
          candidates.push({ ...expansion, searchStart: start });
          evaluated++;
        }
        const replacementAttempts = Math.min(8, placements.length);
        for (let attempt = 0; attempt < replacementAttempts; attempt++) {
          const placement = placements[Math.floor(islandRandom() * placements.length)];
          const layout = placeWithReplacement(candidate.layout, placement);
          if (!layout) continue;
          const key = keyOf(layout);
          if (startSeen[start].has(key)) continue;
          startSeen[start].add(key);
          islandArchiveKeys[start].add(key);
          candidates.push({ layout, score: scoreLayout(layout), searchStart: start, islandMutation: 'replacement' });
          islandMutationCandidates++;
          evaluated++;
        }
        const anchors = Object.keys(candidate.layout).map(Number);
        const relocationAttempts = Math.min(3, anchors.length);
        for (let attempt = 0; attempt < relocationAttempts; attempt++) {
          const anchor = anchors[Math.floor(islandRandom() * anchors.length)];
          const type = Number(candidate.layout[anchor]);
          const typePlacements = placementByType[type] || [];
          if (!typePlacements.length) continue;
          const removed = jellyRemoveCell(candidate.layout, anchor);
          const placement = typePlacements[Math.floor(islandRandom() * typePlacements.length)];
          const layout = placeWithReplacement(removed, placement);
          if (!layout) continue;
          const key = keyOf(layout);
          if (startSeen[start].has(key)) continue;
          startSeen[start].add(key);
          islandArchiveKeys[start].add(key);
          candidates.push({ layout, score: scoreLayout(layout), searchStart: start, islandMutation: 'relocation' });
          islandMutationCandidates++;
          evaluated++;
        }
      }
      archiveTop(candidates);
      const next = selectDiverseBy(candidates, beamWidth, startCompare(start));
      const unchanged = next.length === startBeam.length && next.every((candidate, index) => (
        keyOf(candidate.layout) === keyOf(startBeam[index].layout)
      ));
      if (!unchanged) changed = true;
      return next;
    });
    if (searchStarts > 1 && (iteration + 1) % 4 === 0) {
      const migrants = beams.map((rows, start) => rows.slice()
        .sort(startCompare(start))
        .slice(0, Math.min(2, rows.length)));
      beams = beams.map((rows, start) => {
        const incoming = migrants[(start + searchStarts - 1) % searchStarts];
        const candidates = rows.slice();
        for (const candidate of incoming) {
          const key = keyOf(candidate.layout);
          if (startSeen[start].has(key)) continue;
          startSeen[start].add(key);
          islandArchiveKeys[start].add(key);
          candidates.push({ ...candidate, migratedFrom: (start + searchStarts - 1) % searchStarts });
          islandMigrations++;
        }
        return selectDiverseBy(candidates, beamWidth, startCompare(start));
      });
    }
    reportLayoutProgress(`Building layouts ${iteration + 1}/${iterations}`, 2 + 18 * (iteration + 1) / iterations);
    if (!changed) break;
  }
  const savedDiscoveredByConstruction = startSeen.some(seen => seen.has(savedKey));
  const blindBeam = selectDiverse(beams.flat(), Math.max(beamWidth, beamWidth * searchStarts));
  const blindKeys = new Set(blindBeam.map(candidate => keyOf(candidate.layout)));

  const savedBeamWidth = Math.max(4, Math.ceil(beamWidth / 2));
  let savedBeam = [{ layout: saved, score: scoreLayout(saved) }];
  const savedSeen = new Set([savedKey]);
  evaluated++;
  for (let refinement = 0; refinement < savedRefinementRounds; refinement++) {
    const candidates = savedBeam.slice();
    for (const candidate of savedBeam) {
      for (const placement of placements) {
        const layout = placeWithReplacement(candidate.layout, placement);
        if (!layout) continue;
        const key = keyOf(layout);
        if (savedSeen.has(key)) continue;
        savedSeen.add(key);
        candidates.push({ layout, score: scoreLayout(layout) });
        evaluated++;
      }
      for (const rawAnchor of Object.keys(candidate.layout)) {
        const anchor = Number(rawAnchor);
        const type = Number(candidate.layout[rawAnchor]);
        const removed = jellyRemoveCell(candidate.layout, anchor);
        const removedKey = keyOf(removed);
        if (!savedSeen.has(removedKey)) {
          savedSeen.add(removedKey);
          candidates.push({ layout: removed, score: scoreLayout(removed) });
          evaluated++;
        }
        for (const placement of placements) {
          if (placement.type !== type || placement.anchor === anchor) continue;
          const relocated = placeWithReplacement(removed, placement);
          if (!relocated) continue;
          const key = keyOf(relocated);
          if (savedSeen.has(key)) continue;
          savedSeen.add(key);
          candidates.push({ layout: relocated, score: scoreLayout(relocated) });
          evaluated++;
        }
      }
    }
    archiveTop(candidates);
    const next = selectDiverse(candidates, savedBeamWidth);
    const unchanged = next.length === savedBeam.length && next.every((candidate, index) => keyOf(candidate.layout) === keyOf(savedBeam[index].layout));
    savedBeam = next;
    options.onProgress?.({
      phase: `Exploring saved-board relocations ${refinement + 1}/${savedRefinementRounds}`,
      completed: iterations + refinement + 1,
      total: searchRounds + finalistCount,
      overallPercent: 20 + 8 * (refinement + 1) / Math.max(1, savedRefinementRounds),
    });
    if (unchanged) break;
  }

  let beam = selectDiverse([...blindBeam, ...savedBeam], Math.max(beamWidth, beamWidth * 2));
  const seen = new Set([...startSeen.flatMap(set => Array.from(set)), ...savedSeen]);
  for (let refinement = 0; refinement < refinementRounds; refinement++) {
    const candidates = beam.slice();
    for (const candidate of beam) {
      for (const placement of placements) {
        const layout = placeWithReplacement(candidate.layout, placement);
        if (!layout) continue;
        const key = keyOf(layout);
        if (seen.has(key)) continue;
        seen.add(key);
        candidates.push({ layout, score: scoreLayout(layout) });
        evaluated++;
      }
      for (const anchor of Object.keys(candidate.layout)) {
        const layout = jellyRemoveCell(candidate.layout, anchor);
        const key = keyOf(layout);
        if (seen.has(key)) continue;
        seen.add(key);
        candidates.push({ layout, score: scoreLayout(layout) });
        evaluated++;
      }
    }
    archiveTop(candidates);
    const next = selectDiverse(candidates);
    const unchanged = next.length === beam.length && next.every((candidate, index) => keyOf(candidate.layout) === keyOf(beam[index].layout));
    beam = next;
    reportLayoutProgress(`Refining layouts ${refinement + 1}/${refinementRounds}`, 28 + 8 * (refinement + 1) / Math.max(1, refinementRounds));
    if (unchanged) break;
  }
  if (!beam.length) beam = [{ layout: saved, score: scoreLayout(saved) }];
  const simulationTrials = Math.max(4, Math.min(1000, Math.floor(n(options.simulationTrials) || 32)));
  const screeningTrials = Math.max(4, Math.min(simulationTrials, Math.floor(
    options.screeningTrials == null ? Math.min(8, Math.max(4, Math.ceil(simulationTrials / 4))) : n(options.screeningTrials)
  )));
  const scenarioCandidates = Array.from(new Map(
    [...searchArchive.values(), ...eliteArchive.values()].map(candidate => [jellyLayoutKey(candidate.layout), candidate])
  ).values()).map(candidate => ({
    ...candidate,
    scenarioScore: jellyOperationScenarioSurrogate(candidate.layout, S, {
      ...options,
      objective,
      obstruction,
      fever,
    }).score,
  }));
  reportLayoutProgress('Ranking structural niches', 38);
  const compareScenario = (a, b) => b.scenarioScore - a.scenarioScore || compareProxy(a, b);
  let screeningPool = selectDiverseBy(scenarioCandidates, screeningCandidateCount, compareScenario);
  const eliteScreeningPool = selectDiverseBy(Array.from(eliteArchive.values()).map(candidate => ({
    ...candidate,
    scenarioScore: jellyOperationScenarioSurrogate(candidate.layout, S, {
      ...options,
      objective,
      obstruction,
      fever,
    }).score,
  })), Math.min(Math.max(4, finalistCount), eliteArchive.size), compareScenario);
  for (const candidate of eliteScreeningPool) {
    if (!screeningPool.some(existing => jellyLayoutKey(existing.layout) === jellyLayoutKey(candidate.layout))) {
      screeningPool.push(candidate);
    }
  }
  const virusConditionedPool = selectDiverse(
    seedCandidates.filter(candidate => candidate.seedKind === 'virus-conditioned'),
    Math.min(4, virusConditionedSeeds)
  );
  for (const candidate of virusConditionedPool) {
    if (!screeningPool.some(existing => jellyLayoutKey(existing.layout) === jellyLayoutKey(candidate.layout))) {
      screeningPool.push(candidate);
    }
  }
  const immunoidArchetypeCandidates = [];
  if (jellyUnitsOwned(S) > 4 && jellyUpgradeQuantity(S, 36) === 1) {
    const archetypeKeys = new Set();
    const archetypeBases = [saved, ...blindBeam.slice().sort(compareProxy).slice(0, Math.min(3, blindBeam.length)).map(candidate => candidate.layout)];
    for (const base of archetypeBases) {
      const baseImmunoids = Object.values(base).filter(type => Number(type) === 4).length;
      for (const placement of placementByType[4] || []) {
        const layout = placeWithReplacement(base, placement);
        if (!layout) continue;
        const count = Object.values(layout).filter(type => Number(type) === 4).length;
        if (count <= baseImmunoids) continue;
        const key = jellyLayoutKey(layout);
        if (archetypeKeys.has(key)) continue;
        archetypeKeys.add(key);
        immunoidArchetypeCandidates.push({ layout, score: scoreLayout(layout), seedKind: 'immunoid-archetype' });
        evaluated++;
      }
    }
    const singleImmunoids = immunoidArchetypeCandidates.slice().sort(compareProxy).slice(0, 6);
    for (const base of singleImmunoids) {
      for (const placement of placementByType[4] || []) {
        const layout = placeWithReplacement(base.layout, placement);
        if (!layout) continue;
        const count = Object.values(layout).filter(type => Number(type) === 4).length;
        if (count < 2) continue;
        const key = jellyLayoutKey(layout);
        if (archetypeKeys.has(key)) continue;
        archetypeKeys.add(key);
        immunoidArchetypeCandidates.push({ layout, score: scoreLayout(layout), seedKind: 'immunoid-archetype' });
        evaluated++;
      }
    }
  }
  const immunoidArchetypePool = immunoidArchetypeCandidates.length
    ? selectDiverse(immunoidArchetypeCandidates, Math.min(4, immunoidArchetypeCandidates.length))
    : [];
  for (const candidate of immunoidArchetypePool) {
    if (!screeningPool.some(existing => jellyLayoutKey(existing.layout) === jellyLayoutKey(candidate.layout))) {
      screeningPool.push(candidate);
    }
  }
  const archetypeCandidatesByType = new Map();
  const archetypeBases = [saved, ...blindBeam.slice().sort(compareProxy).slice(0, Math.min(3, blindBeam.length)).map(candidate => candidate.layout)];
  for (const type of types) {
    if (type === 4) {
      archetypeCandidatesByType.set(type, immunoidArchetypeCandidates);
      continue;
    }
    const candidates = [];
    const keys = new Set();
    for (const base of archetypeBases) {
      const baseCount = Object.values(base).filter(value => Number(value) === type).length;
      for (const placement of placementByType[type] || []) {
        const layout = placeWithReplacement(base, placement);
        if (!layout) continue;
        const count = Object.values(layout).filter(value => Number(value) === type).length;
        if (count <= baseCount) continue;
        const key = jellyLayoutKey(layout);
        if (keys.has(key)) continue;
        keys.add(key);
        candidates.push({ layout, score: scoreLayout(layout), seedKind: `type-${type}-archetype` });
        evaluated++;
      }
    }
    archetypeCandidatesByType.set(type, candidates);
    const pool = candidates.length ? selectDiverse(candidates, Math.min(2, candidates.length)) : [];
    for (const candidate of pool) {
      if (!screeningPool.some(existing => jellyLayoutKey(existing.layout) === jellyLayoutKey(candidate.layout))) {
        screeningPool.push(candidate);
      }
    }
  }
  for (const candidate of blindBeam.slice().sort(compareProxy).slice(0, Math.min(2, blindBeam.length))) {
    if (!screeningPool.some(existing => jellyLayoutKey(existing.layout) === jellyLayoutKey(candidate.layout))) {
      screeningPool.push(candidate);
    }
  }
  if (!screeningPool.some(candidate => jellyLayoutKey(candidate.layout) === savedKey)) {
    screeningPool.push({
      layout: saved,
      score: scoreLayout(saved),
    });
  }
  reportLayoutProgress('Preparing simulation policies', 40);
  const obstructionBands = Array.from(new Set([
    0,
    Math.floor(obstruction / 2),
    obstruction,
    Math.floor((obstruction + 71) / 2),
    71,
  ])).sort((a, b) => a - b);
  const obstructionBandCandidates = [];
  const obstructionBandKeys = new Set(screeningPool.map(candidate => jellyLayoutKey(candidate.layout)));
  for (const band of obstructionBands) {
    const bandFever = proxyFeverType(saved, S, objective, band, options.fever, expCellType);
    const bandScore = layout => proxyObjectiveScore(layout, S, {
      ...options,
      objective,
      obstruction: band,
      fever: bandFever,
    });
    const bases = Array.from(searchArchive.values())
      .map(candidate => ({ ...candidate, bandScore: bandScore(candidate.layout) }))
      .sort((a, b) => b.bandScore - a.bandScore)
      .slice(0, 2);
    for (const base of bases) {
      const local = [{ layout: base.layout, bandScore: base.bandScore }];
      const weakAnchors = jellyAnchorContributions(base.layout, S, { fever: bandFever })
        .slice().sort((a, b) => a.marginalDps - b.marginalDps).slice(0, 6);
      for (const weak of weakAnchors) {
        const anchor = weak.anchor;
        const rawAnchor = String(anchor);
        const type = Number(base.layout[rawAnchor]);
        const removed = jellyRemoveCell(base.layout, anchor);
        local.push({ layout: removed, bandScore: bandScore(removed) });
        for (const placement of placementByType[type] || []) {
          if (placement.anchor === anchor) continue;
          const relocated = placeWithReplacement(removed, placement);
          if (relocated) local.push({ layout: relocated, bandScore: bandScore(relocated) });
        }
      }
      for (const row of local.sort((a, b) => b.bandScore - a.bandScore).slice(0, 2)) {
        const key = jellyLayoutKey(row.layout);
        if (obstructionBandKeys.has(key)) continue;
        obstructionBandKeys.add(key);
        const candidate = {
          layout: row.layout,
          score: scoreLayout(row.layout),
          seedKind: `obstruction-band-${band}`,
          obstructionBand: band,
        };
        obstructionBandCandidates.push(candidate);
        screeningPool.push(candidate);
        evaluated++;
      }
    }
  }
  const screenPolicy = optimizeJellyOperationPolicy(saved, S, {
    ...options,
    obstruction,
    fever: options.fever,
    roidTiming: options.roidTiming,
    revivePolicy: options.revivePolicy,
    trials: screeningTrials,
    screeningTrials: Math.min(4, screeningTrials),
    seed: Math.floor(n(options.seed) || 1),
    _simulateTrials: cachedSimulateTrials,
  });
  const screenPolicyKey = policy => `${policy.fever}|${policy.roidTiming}|${policy.revivePolicy}`;
  const policyPortfolio = layout => {
    const policies = [];
    const keys = new Set();
    const add = policy => {
      const key = screenPolicyKey(policy);
      if (keys.has(key)) return;
      keys.add(key);
      policies.push(policy);
    };
    add({
      fever: screenPolicy.fever,
      roidTiming: screenPolicy.roidTiming,
      revivePolicy: screenPolicy.revivePolicy,
    });
    add({
      fever: proxyFeverType(layout, S, objective, obstruction, options.fever, expCellType),
      roidTiming: screenPolicy.roidTiming,
      revivePolicy: screenPolicy.revivePolicy,
    });
    if (jellyUpgradeQuantity(S, 29) >= 1) {
      add({ fever: screenPolicy.fever, roidTiming: 0, revivePolicy: screenPolicy.revivePolicy });
      add({ fever: screenPolicy.fever, roidTiming: jellyBossTime(obstruction), revivePolicy: screenPolicy.revivePolicy });
    }
    if (jellyUpgradeQuantity(S, 35) >= 1) {
      add({ fever: screenPolicy.fever, roidTiming: screenPolicy.roidTiming, revivePolicy: 'immunoid-first' });
      add({ fever: screenPolicy.fever, roidTiming: screenPolicy.roidTiming, revivePolicy: 'dps-first' });
    }
    return policies;
  };
  let screeningPoliciesEvaluated = 0;
  const screenCandidate = (candidate, trials) => {
    const policies = policyPortfolio(candidate.layout);
    const screenedPolicies = policies.map(policy => {
      const canReuseSaved = jellyLayoutKey(candidate.layout) === savedKey
        && trials === screenPolicy.trials
        && screenPolicyKey(policy) === screenPolicyKey(screenPolicy);
      const simulation = canReuseSaved
        ? screenPolicy
        : cachedSimulateTrials(candidate.layout, S, {
          ...options,
          obstruction,
          fever: policy.fever,
          roidTiming: policy.roidTiming,
          revivePolicy: policy.revivePolicy,
          trials,
          seed: Math.floor(n(options.seed) || 1),
        });
      screeningPoliciesEvaluated++;
      return {
        ...policy,
        simulation,
        score: simulatedObjectiveScore(simulation, objective, expCellType),
      };
    }).sort((a, b) => b.score - a.score || screenPolicyKey(a).localeCompare(screenPolicyKey(b)));
    const best = screenedPolicies[0];
    return {
      ...candidate,
      screening: best.simulation,
      screeningPolicies: screenedPolicies.map(row => ({
        fever: row.fever,
        roidTiming: row.roidTiming,
        revivePolicy: row.revivePolicy,
        score: row.score,
        simulation: row.simulation,
      })),
      screeningPolicy: {
        fever: best.fever,
        roidTiming: best.roidTiming,
        revivePolicy: best.revivePolicy,
      },
      screeningScore: best.score,
    };
  };
  let screened = screeningPool.map((candidate, index) => {
    options.onProgress?.({
      phase: `Screening candidate ${index + 1}/${screeningPool.length}`,
      completed: searchRounds + (index + 1) / Math.max(1, screeningPool.length),
      total: searchRounds + 2 + finalistCount,
      overallPercent: 40 + 10 * (index + 1) / Math.max(1, screeningPool.length),
    });
    return screenCandidate(candidate, screeningTrials);
  });
  screened.sort((a, b) => b.screeningScore - a.screeningScore || compareProxy(a, b));
  considerLiveCandidate(screened[0], 'screening', 'Low-trial simulation screening');
  reportLayoutProgress('Screening candidates complete', 50);
  const screenedKeys = new Set(screened.map(candidate => jellyLayoutKey(candidate.layout)));
  const proxyRank = new Map(screened.slice().sort(compareProxy).map((candidate, index) => [jellyLayoutKey(candidate.layout), index]));
  const simulationRank = new Map(screened.map((candidate, index) => [jellyLayoutKey(candidate.layout), index]));
  const compositionCorrection = new Map();
  for (const candidate of screened) {
    const correction = (proxyRank.get(jellyLayoutKey(candidate.layout)) || 0)
      - (simulationRank.get(jellyLayoutKey(candidate.layout)) || 0);
    const composition = compositionKey(candidate.layout);
    compositionCorrection.set(composition, Math.max(compositionCorrection.get(composition) ?? -Infinity, correction));
  }
  const calibratedCandidateCount = Math.min(8, Math.max(2, finalistCount));
  const calibratedCandidates = Array.from(searchArchive.values())
    .filter(candidate => !screenedKeys.has(jellyLayoutKey(candidate.layout)))
    .sort((a, b) => (
      (compositionCorrection.get(compositionKey(b.layout)) || 0) - (compositionCorrection.get(compositionKey(a.layout)) || 0)
      || compareProxy(a, b)
    ))
    .slice(0, calibratedCandidateCount);
  if (calibratedCandidates.length) {
    const calibratedScreened = calibratedCandidates.map((candidate, index) => {
      options.onProgress?.({
        phase: `Calibrating candidate ${index + 1}/${calibratedCandidates.length}`,
        completed: searchRounds + 0.9 + (index + 1) / Math.max(1, calibratedCandidates.length) / 10,
        total: searchRounds + 2 + finalistCount,
        overallPercent: 50 + 2 * (index + 1) / Math.max(1, calibratedCandidates.length),
      });
      return screenCandidate(candidate, screeningTrials);
    });
    screened.push(...calibratedScreened);
    screeningPool.push(...calibratedCandidates);
    screened.sort((a, b) => b.screeningScore - a.screeningScore || compareProxy(a, b));
  }

  const feedbackBudget = Math.max(24, beamWidth * 12);
  const feedbackCandidates = [];
  const feedbackKeys = new Set(screened.map(candidate => jellyLayoutKey(candidate.layout)));
  const feedbackLeaders = screened.slice(0, Math.min(4, screened.length));
  const savedScreenedCandidate = screened.find(candidate => jellyLayoutKey(candidate.layout) === savedKey);
  if (savedScreenedCandidate && !feedbackLeaders.some(candidate => jellyLayoutKey(candidate.layout) === savedKey)) {
    feedbackLeaders.push(savedScreenedCandidate);
  }
  let relocationFeedbackCount = 0;
  let swapFeedbackCount = 0;
  let regionFeedbackCount = 0;
  const addFeedback = (layout, kind) => {
    if (!layout) return false;
    const key = jellyLayoutKey(layout);
    if (feedbackKeys.has(key)) return false;
    feedbackKeys.add(key);
    feedbackCandidates.push({ layout, score: scoreLayout(layout), feedbackKind: kind });
    evaluated++;
    if (kind === 'relocation') relocationFeedbackCount++;
    else if (kind === 'swap') swapFeedbackCount++;
    else if (kind === 'region') regionFeedbackCount++;
    return true;
  };
  const relocationBudget = Math.ceil(feedbackBudget / 2);
  const swapBudget = Math.ceil(feedbackBudget / 4);
  const regionBudget = Math.max(1, feedbackBudget - relocationBudget - swapBudget);
  for (const leader of feedbackLeaders) {
    const weakAnchors = jellyAnchorContributions(leader.layout, S, {
      fever: leader.screeningPolicy?.fever ?? screenPolicy.fever,
    }).slice().sort((a, b) => a.marginalDps - b.marginalDps || a.anchor - b.anchor);
    for (const weak of weakAnchors) {
      const anchor = weak.anchor;
      const type = Number(leader.layout[anchor]);
      const removed = jellyRemoveCell(leader.layout, anchor);
      const relocations = [];
      for (const placement of placementByType[type] || []) {
        if (placement.anchor === anchor) continue;
        const relocated = placeWithReplacement(removed, placement);
        if (relocated) relocations.push({ layout: relocated, score: scoreLayout(relocated) });
      }
      for (const relocation of relocations.sort(compareProxy).slice(0, 4)) {
        addFeedback(relocation.layout, 'relocation');
        if (relocationFeedbackCount >= relocationBudget) break;
      }
      if (relocationFeedbackCount >= relocationBudget) break;
    }
    if (relocationFeedbackCount >= relocationBudget) break;
  }
  for (const leader of feedbackLeaders) {
    const anchors = Object.keys(leader.layout).map(Number);
    for (let first = 0; first < anchors.length; first++) {
      for (let second = first + 1; second < anchors.length; second++) {
        const firstAnchor = anchors[first];
        const secondAnchor = anchors[second];
        const firstType = Number(leader.layout[firstAnchor]);
        const secondType = Number(leader.layout[secondAnchor]);
        if (firstType === secondType) continue;
        let swapped = jellyRemoveCell(jellyRemoveCell(leader.layout, firstAnchor), secondAnchor);
        swapped = placeWithReplacement(swapped, { ...placementByType[firstType].find(row => row.anchor === secondAnchor), anchor: secondAnchor, type: firstType });
        if (!swapped) continue;
        swapped = placeWithReplacement(swapped, { ...placementByType[secondType].find(row => row.anchor === firstAnchor), anchor: firstAnchor, type: secondType });
        addFeedback(swapped, 'swap');
        if (swapFeedbackCount >= swapBudget) break;
      }
      if (swapFeedbackCount >= swapBudget) break;
    }
    if (swapFeedbackCount >= swapBudget) break;
  }
  const regionSlots = (center, size) => {
    const centerX = center % JELLY_COLS;
    const centerY = Math.floor(center / JELLY_COLS);
    const startX = Math.max(0, Math.min(JELLY_COLS - size, centerX - Math.floor(size / 2)));
    const startY = Math.max(0, Math.min(10 - size, centerY - Math.floor(size / 2)));
    const slots = new Set();
    for (let y = startY; y < startY + size; y++) {
      for (let x = startX; x < startX + size; x++) slots.add(x + JELLY_COLS * y);
    }
    return slots;
  };
  const rebuildRegion = (layout, region, typeOrder) => {
    let rebuilt = { ...layout };
    let removedCells = 0;
    for (const [rawAnchor, rawType] of Object.entries(layout)) {
      const anchor = Number(rawAnchor);
      const slots = jellyFootprintSlots(anchor, Number(rawType)) || [];
      if (!slots.some(slot => region.has(slot))) continue;
      delete rebuilt[anchor];
      removedCells++;
    }
    if (!removedCells) return null;
    const targetCells = removedCells + 2;
    let added = 0;
    let changed = true;
    while (changed && added < targetCells) {
      changed = false;
      for (const type of typeOrder) {
        for (const placement of placementByType[type] || []) {
          const slots = jellyFootprintSlots(placement.anchor, type) || [];
          if (!slots.length || !slots.every(slot => region.has(slot))) continue;
          const next = addWithoutReplacement(rebuilt, placement);
          if (!next) continue;
          rebuilt = next;
          added++;
          changed = true;
          break;
        }
        if (added >= targetCells) break;
      }
    }
    return rebuilt;
  };
  let exactRegionNodes = 0;
  let exactRegionLayouts = 0;
  let exactRegionCompleteScopes = 0;
  let exactRegionBudgetLimitedScopes = 0;
  const repackRegionExact = (layout, region, nodeBudget = 3000, resultLimit = 4) => {
    const result = enumerateJellyRegionRepairsExact(layout, S, {
      ...options,
      regionSlots: region,
      mode: 'one-substitution',
      objective,
      fever,
      obstruction,
      expCellType,
      nodeBudget,
      timeBudgetMs: Math.max(50, Math.min(1000, Math.floor(nodeBudget / 6))),
      resultLimit,
      onProgress: undefined,
      boundModel: objective === 'dps' ? 'steady-dps' : undefined,
      _scoreLayout: scoreLayout,
    });
    exactRegionNodes += result.certificate.nodesExpanded;
    exactRegionLayouts += result.candidates.length;
    if (result.certificate.complete) exactRegionCompleteScopes++;
    else exactRegionBudgetLimitedScopes++;
    return result.candidates;
  };
  for (const leader of feedbackLeaders) {
    const metrics = jellyLayoutMetrics(leader.layout, S, { fever: leader.screeningPolicy?.fever ?? screenPolicy.fever });
    const centers = [89];
    for (const cell of metrics.cells || []) if (cell.type === 3 || cell.type === 4 || cell.type === 5) centers.push(cell.anchor);
    for (const contribution of jellyAnchorContributions(leader.layout, S, {
      fever: leader.screeningPolicy?.fever ?? screenPolicy.fever,
    }).slice().sort((a, b) => a.marginalDps - b.marginalDps).slice(0, 4)) {
      centers.push(contribution.anchor);
    }
    for (const center of Array.from(new Set(centers))) {
      for (const size of [3, 4, 5]) {
        const region = regionSlots(center, size);
        for (const exact of repackRegionExact(leader.layout, region)) {
          addFeedback(exact.layout, 'region');
          if (regionFeedbackCount >= regionBudget) break;
        }
        if (regionFeedbackCount >= regionBudget) break;
        for (const typeOrder of [standaloneOrder, types.slice().reverse()]) {
          addFeedback(rebuildRegion(leader.layout, region, typeOrder), 'region');
          if (regionFeedbackCount >= regionBudget) break;
        }
        if (regionFeedbackCount >= regionBudget) break;
      }
      if (regionFeedbackCount >= regionBudget) break;
    }
    if (regionFeedbackCount >= regionBudget) break;
  }
  const feedbackPool = feedbackCandidates.length
    ? selectDiverse(feedbackCandidates, Math.min(Math.max(2, Math.ceil(finalistCount / 2)), feedbackCandidates.length))
    : [];
  screened.push(...feedbackPool.map(candidate => screenCandidate(candidate, screeningTrials)));
  reportLayoutProgress('Refining candidate neighborhoods', 56);
  screened.sort((a, b) => b.screeningScore - a.screeningScore || compareProxy(a, b));
  const immunoidCount = candidate => Object.values(candidate.layout).filter(type => Number(type) === 4).length;
  const bestImmunoidScreened = screened.find(candidate => immunoidCount(candidate) > 0);
  const screenedImmunoidCandidates = screened.filter(candidate => immunoidCount(candidate) > 0).length;
  const bestArchetypeScreened = types.map(type => screened.find(candidate => (
    Object.values(candidate.layout).some(value => Number(value) === type)
  )) || null);
  const policyNicheMap = new Map();
  for (const candidate of screened) {
    for (const policy of candidate.screeningPolicies || []) {
      const key = screenPolicyKey(policy);
      const current = policyNicheMap.get(key);
      if (!current || policy.score > current.policyScore) {
        policyNicheMap.set(key, { candidate, policyScore: policy.score });
      }
    }
  }
  const policyNicheCandidates = Array.from(policyNicheMap.values()).map(row => row.candidate);
  const countArchetypeScreened = [];
  const countArchetypeRaced = [];
  for (const type of types) {
    const byCount = new Map();
    for (const candidate of screened) {
      const count = Object.values(candidate.layout).filter(value => Number(value) === type).length;
      const current = byCount.get(count);
      if (!current || candidate.screeningScore > current.screeningScore) byCount.set(count, candidate);
    }
    countArchetypeScreened.push(...Array.from(byCount.values())
      .sort((a, b) => b.screeningScore - a.screeningScore)
      .slice(0, 3));
  }
  const racingTrials = Math.max(screeningTrials, Math.min(simulationTrials, screeningTrials * 4));
  const racingCandidateCount = Math.min(screened.length, Math.max(finalistCount, finalistCount * 2));
  let racingPool = screened.slice(0, racingCandidateCount);
  let adaptiveRacingCandidates = 0;
  if (options.adaptiveAllocation !== false && screened.length > racingPool.length) {
    const leaderBounds = operationConfidenceBounds(screened[0].screening, objective, expCellType);
    const racingKeys = new Set(racingPool.map(candidate => jellyLayoutKey(candidate.layout)));
    const adaptiveCap = Math.min(screened.length, Math.max(racingCandidateCount, finalistCount * 4));
    for (const candidate of screened.slice(racingCandidateCount)) {
      if (racingPool.length >= adaptiveCap) break;
      const bounds = operationConfidenceBounds(candidate.screening, objective, expCellType);
      if (bounds.high < leaderBounds.low) continue;
      const key = jellyLayoutKey(candidate.layout);
      if (racingKeys.has(key)) continue;
      racingKeys.add(key);
      racingPool.push(candidate);
      adaptiveRacingCandidates++;
    }
  }
  const bestBlindScreened = screened.find(candidate => blindKeys.has(jellyLayoutKey(candidate.layout)));
  if (bestBlindScreened && !racingPool.some(candidate => jellyLayoutKey(candidate.layout) === jellyLayoutKey(bestBlindScreened.layout))) {
    racingPool.push(bestBlindScreened);
  }
  if (bestImmunoidScreened && !racingPool.some(candidate => jellyLayoutKey(candidate.layout) === jellyLayoutKey(bestImmunoidScreened.layout))) {
    racingPool.push(bestImmunoidScreened);
  }
  for (const candidate of bestArchetypeScreened) {
    if (candidate && !racingPool.some(existing => jellyLayoutKey(existing.layout) === jellyLayoutKey(candidate.layout))) {
      racingPool.push(candidate);
    }
    for (const candidate of policyNicheCandidates) {
      if (candidate && !racingPool.some(existing => jellyLayoutKey(existing.layout) === jellyLayoutKey(candidate.layout))) {
        racingPool.push(candidate);
      }
      for (const candidate of countArchetypeScreened) {
        if (candidate && !racingPool.some(existing => jellyLayoutKey(existing.layout) === jellyLayoutKey(candidate.layout))) {
          racingPool.push(candidate);
        }
      }
    }
  }
  if (!racingPool.some(candidate => jellyLayoutKey(candidate.layout) === savedKey)) {
    const savedCandidate = screened.find(candidate => jellyLayoutKey(candidate.layout) === savedKey);
    if (savedCandidate) racingPool.push(savedCandidate);
  }
  if (racingTrials > screeningTrials) {
    screened = racingPool.map((candidate, index) => {
      options.onProgress?.({
        phase: `Racing candidate ${index + 1}/${racingPool.length}`,
        completed: searchRounds + 1 + (index + 1) / Math.max(1, racingPool.length),
        total: searchRounds + 2 + finalistCount,
        overallPercent: 56 + 8 * (index + 1) / Math.max(1, racingPool.length),
      });
      return screenCandidate(candidate, racingTrials);
    });
    screened.sort((a, b) => b.screeningScore - a.screeningScore || compareProxy(a, b));
    considerLiveCandidate(screened[0], 'racing', 'Adaptive simulation race');
    reportLayoutProgress('Adaptive candidate race complete', 64);
  }

  const screeningFeatureKey = candidate => {
    const metrics = jellyLayoutMetrics(candidate.layout, S, {
      fever: candidate.screeningPolicy?.fever ?? screenPolicy.fever,
      assumeValid: true,
    });
    const organelleByType = new Array(8).fill(0);
    const proximityByType = new Array(8).fill(0);
    let immunoidSlots = 0;
    for (const cell of metrics.cells || []) {
      if (cell.organelle > 1) organelleByType[cell.type]++;
      if (cell.proximity > 1) proximityByType[cell.type]++;
      if (cell.type === 4) immunoidSlots += cell.slots.length;
    }
    return `${compositionKey(candidate.layout)}|${organelleByType.join(',')}|${proximityByType.join(',')}|${metrics.infectedSlots || 0}|${immunoidSlots}`;
  };
  const finalists = [];
  const finalistKeys = new Set();
  const featureKeys = new Set();
  for (const candidate of screened) {
    const featureKey = screeningFeatureKey(candidate);
    if (featureKeys.has(featureKey)) continue;
    featureKeys.add(featureKey);
    finalists.push(candidate);
    finalistKeys.add(jellyLayoutKey(candidate.layout));
    if (finalists.length >= Math.max(1, Math.ceil(finalistCount / 2))) break;
  }
  for (const candidate of screened) {
    const key = jellyLayoutKey(candidate.layout);
    if (finalistKeys.has(key)) continue;
    finalists.push(candidate);
    finalistKeys.add(key);
    if (finalists.length >= finalistCount) break;
  }
  const bestBlindRaced = screened.find(candidate => blindKeys.has(jellyLayoutKey(candidate.layout)));
  if (bestBlindRaced && !finalistKeys.has(jellyLayoutKey(bestBlindRaced.layout))) {
    finalists.push(bestBlindRaced);
    finalistKeys.add(jellyLayoutKey(bestBlindRaced.layout));
  }
  const bestImmunoidRaced = screened.find(candidate => immunoidCount(candidate) > 0);
  if (bestImmunoidRaced && !finalistKeys.has(jellyLayoutKey(bestImmunoidRaced.layout))) {
    finalists.push(bestImmunoidRaced);
    finalistKeys.add(jellyLayoutKey(bestImmunoidRaced.layout));
  }
  const bestArchetypeRaced = types.map(type => screened.find(candidate => (
    Object.values(candidate.layout).some(value => Number(value) === type)
  )) || null);
  for (const candidate of bestArchetypeRaced) {
    if (candidate && !finalistKeys.has(jellyLayoutKey(candidate.layout))) {
      finalists.push(candidate);
      finalistKeys.add(jellyLayoutKey(candidate.layout));
    }
  }
  for (const niche of policyNicheCandidates) {
    const candidate = screened.find(row => jellyLayoutKey(row.layout) === jellyLayoutKey(niche.layout));
    if (candidate && !finalistKeys.has(jellyLayoutKey(candidate.layout))) {
      finalists.push(candidate);
      finalistKeys.add(jellyLayoutKey(candidate.layout));
    }
  }
  for (const type of types) {
    const byCount = new Map();
    for (const candidate of screened) {
      const count = Object.values(candidate.layout).filter(value => Number(value) === type).length;
      const current = byCount.get(count);
      if (!current || candidate.screeningScore > current.screeningScore) byCount.set(count, candidate);
    }
    countArchetypeRaced.push(...Array.from(byCount.values()).sort((a, b) => b.screeningScore - a.screeningScore).slice(0, 2));
  }
  for (const candidate of countArchetypeRaced.sort((a, b) => b.screeningScore - a.screeningScore).slice(0, finalistCount)) {
    const key = jellyLayoutKey(candidate.layout);
    if (!finalistKeys.has(key)) {
      finalists.push(candidate);
      finalistKeys.add(key);
    }
  }
  if (!finalistKeys.has(savedKey)) {
    finalists.push(screened.find(candidate => jellyLayoutKey(candidate.layout) === savedKey) || screenCandidate({
      layout: saved,
      score: scoreLayout(saved),
    }, racingTrials));
  }
  const normalizedFinalists = [];
  const normalizedFinalistKeys = new Set();
  for (const candidate of finalists) {
    const originalKey = jellyLayoutKey(candidate.layout);
    const layout = originalKey === savedKey ? candidate.layout : fillOpenSlots(candidate.layout);
    const key = jellyLayoutKey(layout);
    if (normalizedFinalistKeys.has(key)) continue;
    normalizedFinalistKeys.add(key);
    normalizedFinalists.push({
      ...candidate,
      layout,
      score: scoreLayout(layout),
      blindOrigin: blindKeys.has(originalKey),
    });
  }
  let reranked = normalizedFinalists.map((candidate, index) => {
    const simulation = optimizeJellyOperationPolicy(candidate.layout, S, {
      ...options,
      obstruction,
      fever: options.fever,
      roidTiming: options.roidTiming,
      revivePolicy: options.revivePolicy,
      trials: simulationTrials,
      seed: Math.floor(n(options.seed) || 1),
      _simulateTrials: cachedSimulateTrials,
      onProgress: progress => options.onProgress?.({
        phase: `Simulating finalist ${index + 1}/${normalizedFinalists.length}: ${progress.phase}`,
        completed: searchRounds + 2 + index + Number(progress.completed) / Math.max(1, Number(progress.total)),
        total: searchRounds + 2 + normalizedFinalists.length,
        overallPercent: 64 + 14 * (index + Number(progress.completed) / Math.max(1, Number(progress.total))) / Math.max(1, normalizedFinalists.length),
      }),
    });
    return { ...candidate, simulation, simulatedScore: simulatedObjectiveScore(simulation, objective, expCellType) };
  }).sort((a, b) => b.simulatedScore - a.simulatedScore
    || b.score - a.score
    || moveCount(a.layout) - moveCount(b.layout)
    || jellyLayoutKey(a.layout).localeCompare(jellyLayoutKey(b.layout)));
  const neighborhoodKeys = new Set(reranked.map(candidate => jellyLayoutKey(candidate.layout)));
  const neighborhoodCandidates = [];
  const addNeighborhood = (layout, neighborhoodPolicy = null) => {
    if (!layout) return;
    const key = jellyLayoutKey(layout);
    if (neighborhoodKeys.has(key)) return;
    neighborhoodKeys.add(key);
    neighborhoodCandidates.push({ layout, score: scoreLayout(layout), seedKind: 'winner-neighborhood', neighborhoodPolicy });
    evaluated++;
  };
  const organelleReanchorKeys = [];
  let organelleReanchorNodes = 0;
  const neighborhoodLeaderLimit = Math.max(1, Math.min(8, Math.floor(
    options.neighborhoodLeaders == null ? (simulationTrials >= 128 ? 3 : 1) : n(options.neighborhoodLeaders)
  )));
  const neighborhoodLeaders = reranked.slice(0, Math.min(neighborhoodLeaderLimit, reranked.length));
  for (const neighborhoodLeader of neighborhoodLeaders) {
    for (const rawAnchor of Object.keys(neighborhoodLeader.layout)) {
      const anchor = Number(rawAnchor);
      const type = Number(neighborhoodLeader.layout[rawAnchor]);
      const removed = jellyRemoveCell(neighborhoodLeader.layout, anchor);
      for (const placement of placementByType[type] || []) {
        if (placement.anchor === anchor) continue;
        addNeighborhood(placeWithReplacement(removed, placement), neighborhoodLeader.simulation);
      }
    }
    const leaderAnchors = Object.keys(neighborhoodLeader.layout).map(Number);
    for (let first = 0; first < leaderAnchors.length; first++) {
      for (let second = first + 1; second < leaderAnchors.length; second++) {
        const firstAnchor = leaderAnchors[first];
        const secondAnchor = leaderAnchors[second];
        const firstType = Number(neighborhoodLeader.layout[firstAnchor]);
        const secondType = Number(neighborhoodLeader.layout[secondAnchor]);
        if (firstType === secondType) continue;
        let swapped = jellyRemoveCell(jellyRemoveCell(neighborhoodLeader.layout, firstAnchor), secondAnchor);
        swapped = placeWithReplacement(swapped, { ...placementByType[firstType].find(row => row.anchor === secondAnchor), anchor: secondAnchor, type: firstType });
        if (!swapped) continue;
        addNeighborhood(placeWithReplacement(swapped, { ...placementByType[secondType].find(row => row.anchor === firstAnchor), anchor: firstAnchor, type: secondType }), neighborhoodLeader.simulation);
      }
    }
    const organelleAnchors = leaderAnchors.filter(anchor => Number(neighborhoodLeader.layout[anchor]) === 3);
    if (organelleAnchors.length >= 2) {
      const reanchored = jellyOrganelleReanchorCandidates(neighborhoodLeader.layout, S);
      organelleReanchorNodes += reanchored.nodes;
      for (const layout of reanchored.layouts) {
        organelleReanchorKeys.push(jellyLayoutKey(layout));
        addNeighborhood(layout, neighborhoodLeader.simulation);
      }
    }
  }
  const diverseNeighborhood = selectDiverse(neighborhoodCandidates, Math.min(24, neighborhoodCandidates.length));
  const neighborhoodByKey = new Map(neighborhoodCandidates.map(candidate => [jellyLayoutKey(candidate.layout), candidate]));
  const neighborhoodShortlist = diverseNeighborhood.slice();
  for (const key of organelleReanchorKeys.slice(0, 3)) {
    const candidate = neighborhoodByKey.get(key);
    if (candidate && !neighborhoodShortlist.some(row => jellyLayoutKey(row.layout) === key)) neighborhoodShortlist.push(candidate);
  }
  const neighborhoodTrials = Math.min(simulationTrials, Math.max(16, screeningTrials * 4));
  let neighborhoodPromoted = 0;
  if (neighborhoodShortlist.length && neighborhoodTrials > 0) {
    reportLayoutProgress('Checking winner neighborhood', 79);
    const neighborhoodLeader = reranked[0];
    const policy = neighborhoodLeader.simulation;
    const neighborhoodScreened = [
      {
        candidate: neighborhoodLeader,
        simulation: cachedSimulateTrials(neighborhoodLeader.layout, S, {
          ...options,
          obstruction,
          fever: policy.fever,
          roidTiming: policy.roidTiming,
          revivePolicy: policy.revivePolicy,
          trials: neighborhoodTrials,
          seed: Math.floor(n(options.seed) || 1),
        }),
      },
      ...neighborhoodShortlist.map(candidate => {
        const candidatePolicy = candidate.neighborhoodPolicy || policy;
        const originalKey = keyOf(candidate.layout);
        const normalizedLayout = originalKey === savedKey ? candidate.layout : fillOpenSlots(candidate.layout);
        return {
          candidate: {
            ...candidate,
            layout: normalizedLayout,
            score: scoreLayout(normalizedLayout),
            organelleReanchorOrigin: organelleReanchorKeys.includes(originalKey),
          },
          simulation: cachedSimulateTrials(normalizedLayout, S, {
            ...options,
            obstruction,
            fever: candidatePolicy.fever,
            roidTiming: candidatePolicy.roidTiming,
            revivePolicy: candidatePolicy.revivePolicy,
            trials: neighborhoodTrials,
            seed: Math.floor(n(options.seed) || 1),
          }),
        };
      }),
    ].map(row => ({
      ...row,
      score: simulatedObjectiveScore(row.simulation, objective, expCellType),
    })).sort((a, b) => b.score - a.score);
    const promoted = neighborhoodScreened
      .filter(row => jellyLayoutKey(row.candidate.layout) !== jellyLayoutKey(neighborhoodLeader.layout))
      .slice(0, 3);
    const mandatoryOrganelle = neighborhoodScreened.find(row => row.candidate.organelleReanchorOrigin);
    if (mandatoryOrganelle && !promoted.some(row => jellyLayoutKey(row.candidate.layout) === jellyLayoutKey(mandatoryOrganelle.candidate.layout))) {
      promoted.push(mandatoryOrganelle);
    }
    for (const row of promoted) {
      const simulation = optimizeJellyOperationPolicy(row.candidate.layout, S, {
        ...options,
        obstruction,
        fever: options.fever,
        roidTiming: options.roidTiming,
        revivePolicy: options.revivePolicy,
        trials: simulationTrials,
        seed: Math.floor(n(options.seed) || 1),
        _simulateTrials: cachedSimulateTrials,
      });
      reranked.push({
        ...row.candidate,
        simulation,
        simulatedScore: simulatedObjectiveScore(simulation, objective, expCellType),
      });
      neighborhoodPromoted++;
      reportLayoutProgress(`Promoting neighborhood challenger ${neighborhoodPromoted}/${promoted.length}`, 80 + 4 * neighborhoodPromoted / Math.max(1, promoted.length));
    }
    reranked.sort((a, b) => b.simulatedScore - a.simulatedScore
      || b.score - a.score
      || moveCount(a.layout) - moveCount(b.layout)
      || jellyLayoutKey(a.layout).localeCompare(jellyLayoutKey(b.layout)));
  }
  const adaptiveMaxTrials = Math.max(simulationTrials, Math.min(8192, Math.floor(n(options.adaptiveMaxTrials) || 2048)));
  const adaptiveTrialLadder = [512, 1000, 2048, 4096, 8192]
    .filter(trials => trials <= adaptiveMaxTrials);
  const confidenceBounds = simulation => operationConfidenceBounds(simulation, objective, expCellType);
  const baseSeed = Math.floor(n(options.seed) || 1);
  const validationSeed = (baseSeed ^ 0x6a09e667) >>> 0;
  const confirmationSeed = (baseSeed ^ 0xbb67ae85) >>> 0;
  const validationTrials = Math.min(simulationTrials, Math.max(32, Math.floor(simulationTrials / 2)));
  const heldoutValidation = simulationTrials >= 64 && options.heldoutValidation !== false;
  if (heldoutValidation) {
    reranked = reranked.map((candidate, index) => {
      reportLayoutProgress(`Validating finalist ${index + 1}/${reranked.length}`, 84 + 6 * (index + 1) / Math.max(1, reranked.length));
      const validationSimulation = cachedSimulateTrials(candidate.layout, S, {
        ...options,
        obstruction,
        fever: candidate.simulation.fever,
        roidTiming: candidate.simulation.roidTiming,
        revivePolicy: candidate.simulation.revivePolicy,
        trials: validationTrials,
        seed: validationSeed,
      });
      const validationScore = simulatedObjectiveScore(validationSimulation, objective, expCellType);
      const robustScore = Math.min(candidate.simulatedScore, validationScore) * 0.75
        + Math.max(candidate.simulatedScore, validationScore) * 0.25;
      return {
        ...candidate,
        trainingSimulation: candidate.simulation,
        validationSimulation,
        trainingScore: candidate.simulatedScore,
        validationScore,
        robustScore,
        simulatedScore: robustScore,
      };
    }).sort((a, b) => b.robustScore - a.robustScore
      || b.score - a.score
      || moveCount(a.layout) - moveCount(b.layout)
      || jellyLayoutKey(a.layout).localeCompare(jellyLayoutKey(b.layout)));
  }
  const confirmationStages = [];
  let confirmedTrials = simulationTrials;
  if (heldoutValidation && adaptiveMaxTrials >= 512 && reranked.length) {
    const leaderBounds = confidenceBounds(reranked[0].validationSimulation);
    let finalCandidates = reranked.filter(candidate => {
      const bounds = confidenceBounds(candidate.validationSimulation);
      return bounds[0] <= leaderBounds[1] && leaderBounds[0] <= bounds[1];
    });
    for (const candidate of reranked.slice(0, Math.min(2, reranked.length))) {
      if (!finalCandidates.some(row => jellyLayoutKey(row.layout) === jellyLayoutKey(candidate.layout))) {
        finalCandidates.push(candidate);
      }
    }
    const savedCandidate = reranked.find(candidate => jellyLayoutKey(candidate.layout) === savedKey);
    if (savedCandidate && !finalCandidates.some(candidate => jellyLayoutKey(candidate.layout) === savedKey)) {
      finalCandidates.push(savedCandidate);
    }
    const finalKeys = new Set(finalCandidates.map(candidate => jellyLayoutKey(candidate.layout)));
    const finalTrials = Math.min(adaptiveMaxTrials, Math.max(512, simulationTrials));
    let heldoutIndex = 0;
    reranked = reranked.map(candidate => {
      if (!finalKeys.has(jellyLayoutKey(candidate.layout))) return candidate;
      heldoutIndex++;
      reportLayoutProgress(`Confirming finalist ${heldoutIndex}/${finalCandidates.length}`, 90 + 6 * heldoutIndex / Math.max(1, finalCandidates.length));
      const simulation = cachedSimulateTrials(candidate.layout, S, {
        ...options,
        obstruction,
        fever: candidate.simulation.fever,
        roidTiming: candidate.simulation.roidTiming,
        revivePolicy: candidate.simulation.revivePolicy,
        trials: finalTrials,
        seed: confirmationSeed,
        includeTrials: true,
      });
      return {
        ...candidate,
        simulation: {
          ...simulation,
          objective,
          fever: candidate.simulation.fever,
          roidTiming: candidate.simulation.roidTiming,
          revivePolicy: candidate.simulation.revivePolicy,
          policiesEvaluated: candidate.simulation.policiesEvaluated,
          screeningTrials: candidate.simulation.screeningTrials,
        },
        simulatedScore: simulatedObjectiveScore(simulation, objective, expCellType),
        finalConfirmed: true,
      };
    }).sort((a, b) => Number(b.finalConfirmed) - Number(a.finalConfirmed)
      || b.simulatedScore - a.simulatedScore
      || b.score - a.score
      || moveCount(a.layout) - moveCount(b.layout)
      || jellyLayoutKey(a.layout).localeCompare(jellyLayoutKey(b.layout)));
    confirmationStages.push({
      trials: finalTrials,
      candidates: finalCandidates.length,
      phase: 'held-out',
      comparison: 'shared-seed-paired-difference',
    });
    confirmedTrials = finalTrials;
  }
  let overlapRound = 0;
  while (reranked.length > 1 && confirmedTrials < adaptiveMaxTrials) {
    const leader = reranked[0];
    const competitive = reranked.filter(candidate => {
      if (heldoutValidation && !candidate.finalConfirmed) return false;
      if (candidate === leader) return true;
      const confidence = pairedOperationConfidence(candidate.simulation, leader.simulation, objective, expCellType);
      return !confidence || confidence.high >= 0;
    });
    if (competitive.length <= 1) break;
    const nextTrials = adaptiveTrialLadder.find(trials => trials > confirmedTrials) || adaptiveMaxTrials;
    if (nextTrials <= confirmedTrials) break;
    const competitiveKeys = new Set(competitive.map(candidate => jellyLayoutKey(candidate.layout)));
    const overlapBase = 96 + Math.min(4, overlapRound) * 0.75;
    let overlapIndex = 0;
    reranked = reranked.map(candidate => {
      if (!competitiveKeys.has(jellyLayoutKey(candidate.layout))) return candidate;
      overlapIndex++;
      reportLayoutProgress(`Resolving close finalists ${overlapIndex}/${competitive.length}`, overlapBase + 0.75 * overlapIndex / Math.max(1, competitive.length));
      const simulation = cachedSimulateTrials(candidate.layout, S, {
        ...options,
        obstruction,
        fever: candidate.simulation.fever,
        roidTiming: candidate.simulation.roidTiming,
        revivePolicy: candidate.simulation.revivePolicy,
        trials: nextTrials,
        seed: confirmationSeed,
        includeTrials: true,
      });
      return {
        ...candidate,
        simulation: {
          ...simulation,
          objective,
          fever: candidate.simulation.fever,
          roidTiming: candidate.simulation.roidTiming,
          revivePolicy: candidate.simulation.revivePolicy,
          policiesEvaluated: candidate.simulation.policiesEvaluated,
          screeningTrials: candidate.simulation.screeningTrials,
        },
        simulatedScore: simulatedObjectiveScore(simulation, objective, expCellType),
      };
    }).sort((a, b) => Number(b.finalConfirmed) - Number(a.finalConfirmed)
      || b.simulatedScore - a.simulatedScore
      || b.score - a.score
      || moveCount(a.layout) - moveCount(b.layout)
      || jellyLayoutKey(a.layout).localeCompare(jellyLayoutKey(b.layout)));
    confirmationStages.push({
      trials: nextTrials,
      candidates: competitive.length,
      phase: 'paired-overlap',
      comparison: 'shared-seed-paired-difference',
    });
    confirmedTrials = nextTrials;
    overlapRound++;
  }
  const adaptiveConfirmation = {
    triggered: confirmationStages.length > 0,
    initialTrials: simulationTrials,
    confirmedTrials,
    candidates: confirmationStages.reduce((max, stage) => Math.max(max, stage.candidates), 0),
    stages: confirmationStages,
    validationTrials: heldoutValidation ? validationTrials : 0,
    heldoutValidation,
  };
  const savedFinalist = reranked.find(candidate => jellyLayoutKey(candidate.layout) === savedKey);
  const blindFinalist = reranked.find(candidate => candidate.blindOrigin || blindKeys.has(jellyLayoutKey(candidate.layout)));
  const immunoidFinalist = reranked.find(candidate => immunoidCount(candidate) > 0);
  const proxyOrdered = reranked.slice().sort(compareProxy);
  const proxyRanks = new Map(proxyOrdered.map((candidate, index) => [jellyLayoutKey(candidate.layout), index + 1]));
  const proxyAuditRows = reranked.map((candidate, index) => {
    const proxyRank = proxyRanks.get(jellyLayoutKey(candidate.layout)) || reranked.length;
    return {
      proxyRank,
      simulationRank: index + 1,
      rankDelta: proxyRank - (index + 1),
      composition: compositionKey(candidate.layout),
      proxyScore: candidate.score,
      simulatedScore: candidate.simulatedScore,
    };
  });
  const proxyRankCorrelation = reranked.length > 1
    ? 1 - 6 * proxyAuditRows.reduce((sum, row) => sum + row.rankDelta ** 2, 0) / (reranked.length * (reranked.length ** 2 - 1))
    : 1;
  const proxyAudit = {
    candidates: reranked.length,
    rankCorrelation: proxyRankCorrelation,
    underRanked: proxyAuditRows.slice().sort((a, b) => b.rankDelta - a.rankDelta).slice(0, 5),
  };
  const archetypeResults = types.map(type => {
    const candidate = reranked.find(row => Object.values(row.layout).some(value => Number(value) === type));
    return candidate ? {
      type,
      name: CELL_NAMES[type],
      count: Object.values(candidate.layout).filter(value => Number(value) === type).length,
      layout: candidate.layout,
      operation: candidate.simulation,
      score: candidate.simulatedScore,
    } : {
      type,
      name: CELL_NAMES[type],
      count: 0,
      layout: null,
      operation: null,
      score: null,
    };
  });
  const countArchetypeResults = [];
  for (const type of types) {
    const counts = new Set();
    for (const candidate of reranked) {
      const count = Object.values(candidate.layout).filter(value => Number(value) === type).length;
      const key = `${type}:${count}`;
      if (counts.has(key)) continue;
      counts.add(key);
      countArchetypeResults.push({
        type,
        name: CELL_NAMES[type],
        count,
        layout: candidate.layout,
        operation: candidate.simulation,
        score: candidate.simulatedScore,
      });
    }
  }
  const obstructionBandResults = obstructionBands.map(band => {
    const candidate = reranked.find(row => row.obstructionBand === band);
    return {
      obstruction: band,
      layout: candidate?.layout || null,
      operation: stripTrialResults(candidate?.simulation) || null,
      score: candidate?.simulatedScore ?? null,
    };
  });
  const eligibleFinalists = heldoutValidation
    ? reranked.filter(candidate => candidate.finalConfirmed)
    : reranked;
  const selectedLeader = eligibleFinalists[0] || reranked[0];
  let best = savedFinalist && savedFinalist.simulatedScore >= selectedLeader.simulatedScore
    ? savedFinalist
    : selectedLeader;
  const pairedClassification = confidence => {
    if (!confidence) return 'unavailable';
    if (confidence.low > 0) return 'confirmed-better';
    if (confidence.high < 0) return 'confirmed-worse';
    return 'statistically-unresolved';
  };
  const pairedVsSaved = jellyLayoutKey(best.layout) === savedKey
    ? {
      trials: best.simulation?.results?.length || 0,
      chanceBeatsBaseline: 0.5,
      meanDifference: 0,
      low: 0,
      high: 0,
      classification: 'same-layout',
    }
    : (() => {
      const confidence = pairedOperationConfidence(best.simulation, savedFinalist?.simulation, objective, expCellType);
      return confidence ? { ...confidence, classification: pairedClassification(confidence) } : null;
    })();
  const runnerUp = eligibleFinalists.find(candidate => jellyLayoutKey(candidate.layout) !== jellyLayoutKey(best.layout)) || null;
  const pairedVsRunnerUp = runnerUp
    ? (() => {
      const confidence = pairedOperationConfidence(best.simulation, runnerUp.simulation, objective, expCellType);
      return confidence ? {
        ...confidence,
        classification: pairedClassification(confidence),
        baselineLayoutKey: jellyLayoutKey(runnerUp.layout),
      } : null;
    })()
    : null;
  const pairedConfirmation = {
    available: Boolean(pairedVsSaved || pairedVsRunnerUp),
    seed: confirmationSeed,
    objective,
    vsSaved: pairedVsSaved,
    vsRunnerUp: pairedVsRunnerUp,
  };
  let simulationCacheTrialEntriesTrimmed = 0;
  let simulationCacheTrialsTrimmed = 0;
  const trimmedSimulations = new Set();
  for (const simulation of simulationCache.values()) {
    if (!simulation || trimmedSimulations.has(simulation) || !Array.isArray(simulation.results)) continue;
    trimmedSimulations.add(simulation);
    simulationCacheTrialEntriesTrimmed++;
    simulationCacheTrialsTrimmed += simulation.results.length;
    delete simulation.results;
  }
  const evaluationLedger = [
    {
      phase: 'Construction and proxy search',
      method: 'Deterministic bounded heuristic',
      candidates: evaluated,
      trials: 0,
      claim: 'best-found-only',
      evidence: 'Multiple seeded beams, islands, structural archives, and local refinements; not exhaustive.',
    },
    {
      phase: 'Exact regional repair',
      method: 'Fixed-outside exact enumeration',
      candidates: exactRegionLayouts,
      trials: 0,
      claim: exactRegionBudgetLimitedScopes > 0
        ? 'mixed-complete-and-budget-limited-scopes'
        : (exactRegionCompleteScopes > 0 ? 'declared-regional-scopes-proven' : 'not-run'),
      evidence: `${exactRegionCompleteScopes} complete scope(s), ${exactRegionBudgetLimitedScopes} budget-limited scope(s).`,
    },
    {
      phase: 'Monte Carlo screening',
      method: 'Shared deterministic seed streams',
      candidates: screeningPool.length + feedbackPool.length,
      trials: screeningTrials,
      claim: 'ranking-evidence-only',
      evidence: 'Short trial batches rank candidates; they do not prove optimality.',
    },
    {
      phase: 'Monte Carlo racing',
      method: 'Policy-aware survivor racing',
      candidates: racingPool.length,
      trials: racingTrials,
      claim: 'ranking-evidence-only',
      evidence: 'Only survivors receive the larger racing batch.',
    },
    ...(heldoutValidation ? [{
      phase: 'Held-out validation',
      method: 'Independent seed batch',
      candidates: reranked.length,
      trials: validationTrials,
      claim: 'out-of-sample-ranking-evidence',
      evidence: 'Finalists are reranked on seeds not used by construction or screening.',
    }] : []),
    ...confirmationStages.map(stage => ({
      phase: stage.phase === 'held-out' ? 'Held-out confirmation' : 'Adaptive paired confirmation',
      method: stage.comparison || 'Shared-seed paired difference',
      candidates: stage.candidates,
      trials: stage.trials,
      claim: 'statistical-comparison',
      evidence: 'Shared random streams measure paired objective differences; confidence can remain unresolved.',
    })),
    {
      phase: 'Final recommendation',
      method: 'Saved-baseline and runner-up paired comparison',
      candidates: eligibleFinalists.length,
      trials: pairedVsSaved?.trials || pairedVsRunnerUp?.trials || 0,
      claim: pairedVsSaved?.classification || 'unavailable',
      evidence: pairedVsSaved
        ? `Versus saved: ${pairedVsSaved.classification}. This is not a global-optimum proof.`
        : 'No paired saved-layout comparison was available; recommendation remains best-found only.',
    },
  ];
  let immunoidBreakpoint = null;
  if (immunoidFinalist) {
    const preferred = [];
    for (let index = 0; index < 72; index++) {
      const normalScore = proxyObjectiveScore(best.layout, S, {
        ...options,
        objective: 'clear',
        obstruction: index,
        fever: best.simulation.fever,
      });
      const immunoidScore = proxyObjectiveScore(immunoidFinalist.layout, S, {
        ...options,
        objective: 'clear',
        obstruction: index,
        fever: immunoidFinalist.simulation.fever,
      });
      if (immunoidScore > normalScore) preferred.push(index);
    }
    const ranges = [];
    for (const index of preferred) {
      const last = ranges.at(-1);
      if (last && last.end === index - 1) last.end = index;
      else ranges.push({ start: index, end: index });
    }
    immunoidBreakpoint = {
      preferredObstructions: preferred,
      ranges,
      firstPreferred: preferred[0] ?? null,
      currentPreferred: preferred.includes(obstruction),
    };
  }
  considerLiveCandidate({
    layout: best.layout,
    simulationScore: best.simulatedScore,
    baselineScore: savedFinalist?.simulatedScore,
  }, 'finalist', 'Fully simulated finalist');
  reportLayoutProgress('Layout optimization complete', 100);
  return {
    objective,
    expCellType,
    fever: best.simulation.fever,
    savedLayout: saved,
    savedMetrics: jellyLayoutMetrics(saved, S, { fever: best.simulation.fever }),
    savedUnlockedSlots: Array.from(jellyUnlockedSlots(S)),
    layout: best.layout,
    score: best.simulatedScore,
    savedScore: savedFinalist?.simulatedScore ?? null,
    proxyScore: best.score,
    metrics: jellyLayoutMetrics(best.layout, S, { fever: best.simulation.fever }),
    operation: stripTrialResults(best.simulation),
    savedOperation: stripTrialResults(savedFinalist?.simulation) || null,
    blindLayout: blindFinalist?.layout || null,
    blindOperation: stripTrialResults(blindFinalist?.simulation) || null,
    blindScore: blindFinalist?.simulatedScore ?? null,
    blindMoves: blindFinalist ? jellyLayoutMoves(saved, blindFinalist.layout) : [],
    immunoidLayout: immunoidFinalist?.layout || null,
    immunoidOperation: stripTrialResults(immunoidFinalist?.simulation) || null,
    immunoidScore: immunoidFinalist?.simulatedScore ?? null,
    immunoidBreakpoint,
    archetypeResults: archetypeResults.map(row => ({ ...row, operation: stripTrialResults(row.operation) || null })),
    countArchetypeResults: countArchetypeResults.map(row => ({ ...row, operation: stripTrialResults(row.operation) || null })),
    obstructionBandResults,
    proxyAudit,
    evaluationLedger,
    adaptiveConfirmation,
    pairedConfirmation,
    anchorContributions: jellyAnchorContributions(best.layout, S, { fever: best.simulation.fever }),
    moves: jellyLayoutMoves(saved, best.layout),
    evaluated,
    search: {
      start: 'composition-seeded-saved-and-empty',
      model: 'hybrid-multifidelity',
      staticContextReused: staticSearchContext.reused,
      staticPlacementCount: placements.length,
      constructionRounds: iterations,
      savedRefinementRounds,
      refinementRounds,
      beamWidth,
      finalists: finalists.length,
      normalizedFinalists: normalizedFinalists.length,
      screeningCandidates: screeningPool.length + feedbackPool.length,
      screeningTrials,
      racingCandidates: racingPool.length,
      racingTrials,
      adaptiveRacingCandidates,
      screeningPoliciesEvaluated,
      calibratedCandidates: calibratedCandidates.length,
      policyNiches: policyNicheMap.size,
      randomizedConstructionLanes,
      searchStarts,
      searchStartOffset,
      islandProfiles: Array.from(
        { length: searchStarts },
        (_, start) => islandProfiles[(searchStartOffset + start) % islandProfiles.length]
      ),
      islandArchiveSizes: islandArchiveKeys.map(keys => keys.size),
      islandMutationCandidates,
      islandMigrations,
      islandBiasScale,
      eliteArchiveSize: eliteArchive.size,
      diversitySummary: liveDiversitySnapshot(),
      scenarioCandidates: scenarioCandidates.length,
      eliteScreeningCandidates: eliteScreeningPool.length,
      compositionSeeds: seedCandidates.length,
      organelleCoverageSeeds,
      virusConditionedSeeds,
      virusStructuresEnumerated,
      virusStructureNodes,
      virusStructureComplete,
      virusSearchMode,
      virusCountScope: types.includes(5) ? virusCountScope : 0,
      savedCompositionSeeds,
      backtrackingSeeds,
      backtrackingNodes,
      savedDiscoveredByCompositionRepack,
      savedDiscoveredByConstruction,
      independentSavedCompositionLayouts,
      feedbackCandidates: feedbackCandidates.length,
      relocationFeedbackCandidates: relocationFeedbackCount,
      swapFeedbackCandidates: swapFeedbackCount,
      regionFeedbackCandidates: regionFeedbackCount,
      exactRegionNodes,
      exactRegionLayouts,
      exactRegionCompleteScopes,
      exactRegionBudgetLimitedScopes,
      neighborhoodCandidates: neighborhoodCandidates.length,
      neighborhoodLeaders: neighborhoodLeaders.length,
      neighborhoodShortlist: neighborhoodShortlist.length,
      neighborhoodPromoted,
      organelleReanchorNodes,
      organelleReanchorCandidates: organelleReanchorKeys.length,
      simulationCacheHits,
      simulationCacheMisses,
      simulationCacheTrialEntriesTrimmed,
      simulationCacheTrialsTrimmed,
      obstructionBands,
      obstructionBandCandidates: obstructionBandCandidates.length,
      savedScreened: screeningPool.some(candidate => jellyLayoutKey(candidate.layout) === savedKey),
      savedRaced: racingPool.some(candidate => jellyLayoutKey(candidate.layout) === savedKey),
      savedFeedbackSeeded: feedbackLeaders.some(candidate => jellyLayoutKey(candidate.layout) === savedKey),
      savedFinalist: finalists.some(candidate => jellyLayoutKey(candidate.layout) === savedKey),
      blindCandidates: blindBeam.length,
      blindFinalist: Boolean(blindFinalist),
      immunoidArchetypeCandidates: immunoidArchetypeCandidates.length,
      screenedImmunoidCandidates,
      immunoidRaced: Boolean(bestImmunoidRaced),
      immunoidFinalist: Boolean(immunoidFinalist),
      archetypeCandidatesByType: types.map(type => archetypeCandidatesByType.get(type)?.length || 0),
    },
  };
}

export function jellyAnchorContributions(layout, S, options = {}) {
  const baseline = jellyLayoutMetrics(layout, S, options);
  if (!baseline.valid) return [];
  const byAnchor = new Map(baseline.cells.map(cell => [cell.anchor, cell]));
  return Object.keys(layout || {}).map(Number).sort((a, b) => a - b).map(anchor => {
    const cell = byAnchor.get(anchor);
    const removed = jellyLayoutMetrics(jellyRemoveCell(layout, anchor), S, options);
    const marginalDps = baseline.dps - (removed.valid ? removed.dps : 0);
    return {
      anchor,
      type: Number(layout[anchor]),
      name: CELL_NAMES[Number(layout[anchor])],
      slots: cell?.slots?.length || 0,
      directDps: cell?.dps || 0,
      marginalDps,
      marginalPct: baseline.dps > 0 ? marginalDps / baseline.dps : 0,
      organelle: (cell?.organelle || 1) > 1,
      proximity: (cell?.proximity || 1) > 1,
    };
  }).sort((a, b) => b.marginalDps - a.marginalDps || a.anchor - b.anchor);
}

export function jellyLayoutMoves(before, after) {
  const moves = [];
  const anchors = new Set([...Object.keys(before || {}), ...Object.keys(after || {})].map(Number));
  for (const anchor of Array.from(anchors).sort((a, b) => a - b)) {
    const oldType = before?.[anchor];
    const newType = after?.[anchor];
    if (oldType === newType) continue;
    if (oldType != null) moves.push({ action: 'remove', anchor, type: oldType, name: CELL_NAMES[oldType] });
    if (newType != null) moves.push({ action: 'place', anchor, type: newType, name: CELL_NAMES[newType] });
  }
  return moves;
}
