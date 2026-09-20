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

function offsetCoord(offset) {
  const dy = Math.round(n(offset) / JELLY_COLS);
  return { dx: n(offset) - dy * JELLY_COLS, dy };
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
  const anchorX = anchor % JELLY_COLS;
  const anchorY = Math.floor(anchor / JELLY_COLS);
  const slots = [];
  for (const offset of cellFootprint(type)) {
    const { dx, dy } = offsetCoord(offset);
    const x = anchorX + dx;
    const y = anchorY + dy;
    if (x < 0 || x >= JELLY_COLS || y < 0 || y >= JELLY_SIZE / JELLY_COLS) return null;
    slots.push(x + y * JELLY_COLS);
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
  return Math.round(2 + gbWith(S?.gridLevels || [], S?.shapeOverlay || [], 186, { abm: n(S?.allBonusMulti) || 1 }));
}

export function jellyBestDpsMultiplierFromValue(value) {
  const dps = Math.max(0, n(value));
  const log10 = Math.log(Math.max(dps, 1)) / Math.LN10;
  const log2Term = Math.min(2, Math.log2(Math.max(dps / 100, 1)) / 20);
  return 1 + log2Term + log10 / 50 * 15 / (Math.log(Math.max(dps / 50, 1)) / Math.LN10 + 20);
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
    + jellyUpgradeQuantity(S, 19)
    + jellyUpgradeQuantity(S, 20)
    + computePaletteBonus(1, S);
  return (1 + additive / 100)
    * (1 + jellyUpgradeQuantity(S, 21) / 100)
    * (1 + jellyUpgradeQuantity(S, 22) / 100)
    * (1 + grid185 / 100)
    * (1 + jellyUpgradeQuantity(S, 32) * Math.floor(n(options.totalCellLevel ?? jellyTotalCellLevel(S)) / 100) / 100)
    * (1 + (
      jellyFeverBonus(S, 0, 0, options.feverRampPct, fever)
      + jellyFeverBonus(S, 1, 0, 0, fever)
      + jellyFeverBonus(S, 4, 0, 0, fever)
    ) / 100);
}

export function jellyCellSpeedMultiplier(S, fever) {
  return 1 + (jellyFeverBonus(S, 4, 1, 0, fever) + jellyFeverBonus(S, 5, 0, 0, fever)) / 100;
}

export function jellyCellExpMultiplier(S, fever) {
  return (1 + jellyFeverBonus(S, 3, 0, 0, fever) / 100)
    * (1 + (jellyUpgradeQuantity(S, 30) + jellyUpgradeQuantity(S, 31) + jellyUpgradeQuantity(S, 10)) / 100)
    * (1 + jellyUpgradeQuantity(S, 11) / 100);
}

export function jellyCurrencyMultiplier(S, fever, options = {}) {
  const grid187 = gbWith(S?.gridLevels || [], S?.shapeOverlay || [], 187, { abm: n(S?.allBonusMulti) || 1 });
  const atom15 = n(S?.atomsData?.[15]) * n(AtomInfo?.[15]?.[4]);
  const totalCellLevel = n(options.totalCellLevel ?? jellyTotalCellLevel(S));
  const bestDps = n(options.bestDps ?? jellyProgress(S).bestDps);
  return (1 + (
    jellyUpgradeQuantity(S, 23)
    + jellyUpgradeQuantity(S, 24)
    + jellyUpgradeQuantity(S, 25)
    + jellyUpgradeQuantity(S, 33) * totalCellLevel
  ) / 100)
    * (1 + valueOf(arcadeBonus(72, S)) / 100)
    * (1 + grid187 / 100)
    * (1 + jellyFeverBonus(S, 2, 0, 0, fever) / 100)
    * (1 + (S?.bundlesData?.ban_j ? 1 : 0))
    * (1 + jellyCompletionBonus(24, S) / 100)
    * jellyBestDpsMultiplierFromValue(bestDps)
    * (1 + jellyUpgradeQuantity(S, 26) / 100)
    * (1 + jellyUpgradeQuantity(S, 27) / 100)
    * (1 + atom15 / 100);
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
  const validation = jellyValidateLayout(layout, S);
  if (!validation.valid) return { valid: false, reason: validation.reason, dps: 0, cells: [] };
  const entries = Object.entries(layout).map(([anchor, type]) => ({ anchor: Number(anchor), type: Number(type) }));
  const rawCounts = new Array(9).fill(0);
  for (const cell of entries) rawCounts[cell.type]++;
  const counts = rawCounts.slice();
  if (jellyUpgradeQuantity(S, 14) >= 1) {
    for (let type = 0; type < counts.length; type++) if (type !== 5) counts[type] += Math.floor(counts[type] / 3);
  }

  const damagePassive = (1 + 2 * counts[7]) * (1 + (0.5 * counts[2] + 0.1 * counts[0]));
  const speedPassive = (1 + 0.5 * counts[6]) * (1 + (0.25 * counts[3] + 0.15 * counts[1]));
  const organelleReach = new Set();
  for (const cell of entries) {
    if (cell.type !== 3) continue;
    const anchor = cell.anchor;
    const candidates = [anchor - 36, anchor - 19, anchor - 17, anchor + 17, anchor + 19, anchor + 36];
    if (anchor % JELLY_COLS > 1) candidates.push(anchor - 2);
    if (anchor % JELLY_COLS < 16) candidates.push(anchor + 2);
    candidates.forEach(slot => organelleReach.add(slot));
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
  const cellDamage = jellyCellDamageMultiplier(S, options);
  const cellSpeed = jellyCellSpeedMultiplier(S, options.fever);
  const proximityMultiplier = 1 + jellyUpgradeQuantity(S, 13) / 100;
  const organelleMultiplier = 1.5 + Math.min(0.25, Math.max(0, rogBonusQTY(63, S?.cachedUniqueSushi || 0) / 100));
  const roidMultiplier = options.roidActive && jellyUpgradeQuantity(S, 29) >= 1
    ? 1 + (50 + jellyUpgradeQuantity(S, 29)) / 100
    : 1;

  const cells = entries.map(cell => {
    const slots = jellyFootprintSlots(cell.anchor, cell.type) || [];
    const organelle = slots.some(slot => organelleReach.has(slot)) ? organelleMultiplier : 1;
    const proximity = jellyUpgradeQuantity(S, 13) >= 1 && PROXIMITY_ANCHORS.has(cell.anchor) ? proximityMultiplier : 1;
    const level = Math.max(0, Math.floor(n(options.cellLevels?.[cell.type] ?? jellyCellLevel(S, cell.type))));
    const damage = CELL_BASE_DAMAGE[cell.type]
      * cellDamage
      * damagePassive
      * virusMultiplier
      * (1 + level * (1 + jellyUpgradeQuantity(S, 17)) / 100)
      * (1 + n(options.amoebaStacks) / 100)
      * proximity;
    const attacksPerSecond = 39 / CELL_BASE_COOLDOWNS[cell.type]
      * cellSpeed
      * speedPassive
      * organelle
      * proximity
      * roidMultiplier;
    return {
      ...cell,
      name: CELL_NAMES[cell.type],
      slots,
      organelle,
      proximity,
      damage,
      attacksPerSecond,
      dps: damage * attacksPerSecond,
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

function axisEntryProgress(start, target, lower, upper) {
  if (start > lower && start < upper) return 0;
  if (start <= lower) return (lower - start) / (target - start);
  return (upper - start) / (target - start);
}

function projectileHitDelay(anchor, type, random) {
  const anchorX = 171 + 37 * (anchor % JELLY_COLS);
  const anchorY = 61 + 37 * Math.floor(anchor / JELLY_COLS);
  const duration = 0.6 + Math.hypot(501 - anchorX, 245 - anchorY) / 400;
  const visual = jellyProjectileData(type);
  const startX = anchorX + 18 * visual.offsetX + visual.spread * (2 * random() - 1);
  const startY = anchorY + 18 * visual.offsetY + visual.spread * (2 * random() - 1);
  const requiredEase = Math.max(
    0,
    axisEntryProgress(startX, 484, 479, 529),
    axisEntryProgress(startY, 228, 218, 268)
  );
  if (requiredEase <= 0) return 0;
  let low = 0.42;
  let high = 1;
  for (let iteration = 0; iteration < 16; iteration++) {
    const mid = (low + high) / 2;
    if (backIn(mid) >= requiredEase) high = mid;
    else low = mid;
  }
  return Math.ceil(duration * high * 60) / 60;
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

export function simulateJellyOperation(layout, S, options = {}) {
  const validation = jellyValidateLayout(layout, S);
  const obstruction = options.obstruction == null ? jellyProgress(S).obstruction : Math.max(0, Math.floor(n(options.obstruction)));
  const fever = options.fever == null ? jellyProgress(S).fever : Math.floor(n(options.fever));
  const hp = jellyBossHp(obstruction);
  const standardTime = jellyBossTime(obstruction);
  if (!validation.valid) {
    return { valid: false, reason: validation.reason, obstruction, fever, hp, standardTime, success: false, time: 0, damage: 0, damagePct: 0 };
  }

  const random = seededRandom(options.seed ?? 1);
  const frameSeconds = 1 / 60;
  const initialTotalCellLevel = jellyTotalCellLevel(S);
  const levels = Array.from({ length: 9 }, (_, type) => jellyCellLevel(S, type));
  const exp = Array.from({ length: 9 }, (_, type) => jellyCellExp(S, type));
  const expGained = new Array(9).fill(0);
  const expMultiplier = jellyCellExpMultiplier(S, fever);
  const cellLevelPercent = 1 + jellyUpgradeQuantity(S, 17);
  const currencyBaseMultiplier = jellyCurrencyMultiplier(S, fever, { bestDps: 0, totalCellLevel: initialTotalCellLevel });
  const canLevel = jellyUpgradeQuantity(S, 10) >= 1;
  const criticalUnlocked = jellyUpgradeQuantity(S, 36) === 1;
  const amoebaUnlocked = jellyUpgradeQuantity(S, 28) >= 1;
  const dpsUnlocked = jellyUpgradeQuantity(S, 12) >= 1;
  const roidUnlocked = jellyUpgradeQuantity(S, 29) >= 1;
  const roidStart = roidUnlocked ? roidActivationTime(options) : Infinity;
  const revivePolicy = options.revivePolicy || 'immunoid-first';
  let revivesRemaining = Math.max(0, Math.floor(jellyUpgradeQuantity(S, 35)));
  let levelTimer = Math.max(0, Math.floor(n(options.levelTimerFrames)));
  let feverSeconds = 0;
  let amoebaStacks = 0;
  let amoebaStacksAtCriticalStart = null;
  let maxAmoebaStacksAtFire = 0;
  let damageAtCriticalStart = null;
  let hitsAtCriticalStart = null;
  let bestDps = jellyProgress(S).bestDps;
  let displayedDps = 0;
  let damageBuckets = [0];
  let nextSecondTick = options.secondTickOffset == null ? random() : Math.max(0, n(options.secondTickOffset));
  let roidRemaining = 0;
  let roidUsed = false;
  let bossCounter = 0;
  let time = 0;
  let damage = 0;
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

  const initialMetrics = jellyLayoutMetrics(layout, S, { fever, totalCellLevel: initialTotalCellLevel });
  const cells = initialMetrics.cells.map(cell => ({
    ...cell,
    initialLevelFactor: 1 + levels[cell.type] * cellLevelPercent / 100,
    cooldown: CELL_BASE_COOLDOWNS[cell.type] / jellyCellSpeedMultiplier(S, fever) / initialMetrics.speedPassive,
    progress: randomInt(random, 0, Math.floor(Math.max(5, CELL_BASE_COOLDOWNS[cell.type] / jellyCellSpeedMultiplier(S, fever) / initialMetrics.speedPassive - 1))),
  }));
  const allSlots = cells.flatMap(cell => cell.slots);
  const alive = new Set(allSlots);
  const immunoidSlots = new Set(cells.filter(cell => cell.type === 4).flatMap(cell => cell.slots));
  const slotOwners = new Map();
  for (const cell of cells) for (const slot of cell.slots) slotOwners.set(slot, cell);
  const maxCriticalSeconds = Math.max(10, n(options.maxCriticalSeconds) || 600);
  const maxTime = standardTime + maxCriticalSeconds;

  while (time < maxTime && endedBy === 'running') {
    levelTimer--;
    if (canLevel && levelTimer <= 0) {
      for (let type = 0; type < 9; type++) {
        const requirement = 20 * 1.3 ** levels[type];
        if (exp[type] >= requirement) {
          exp[type] -= requirement;
          levels[type]++;
          levelTimer = 20;
          break;
        }
      }
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
      cell.progress += 0.65 * cell.organelle * cell.proximity * roidMultiplier;
      if (cell.progress >= cell.cooldown) {
        cell.progress = 0;
        maxAmoebaStacksAtFire = Math.max(maxAmoebaStacksAtFire, amoebaStacks);
        const levelFactor = 1 + levels[cell.type] * cellLevelPercent / 100;
        const coldFactor = fever === 0 ? 1 + feverSeconds / 100 : 1;
        const projectile = {
          arrival: time + projectileHitDelay(cell.anchor, cell.type, random),
          damage: cell.damage
            * levelFactor / cell.initialLevelFactor
            * (1 + amoebaStacks / 100)
            * coldFactor,
          type: cell.type,
          anchor: cell.anchor,
        };
        projectiles.push(projectile);
        shots++;
        contribution[cell.type].shots++;
      }
    }

    const frameEnd = time + frameSeconds;
    for (let index = projectiles.length - 1; index >= 0; index--) {
      const projectile = projectiles[index];
      if (projectile.arrival > frameEnd) continue;
      projectiles.splice(index, 1);
      damage += projectile.damage;
      damageBuckets[0] += projectile.damage;
      const currencyMultiplier = currencyBaseMultiplier * jellyBestDpsMultiplierFromValue(bestDps);
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

    while (dpsUnlocked && nextSecondTick <= frameEnd) {
      damageBuckets.unshift(0);
      if (damageBuckets.length >= 6) damageBuckets.splice(4, 1);
      feverSeconds++;
      nextSecondTick += 1;
    }
    if (dpsUnlocked && damageBuckets.length > 3) {
      displayedDps = (damageBuckets[1] + damageBuckets[2] + damageBuckets[3]) / 3;
      bestDps = Math.max(bestDps, displayedDps);
    }

    time = frameEnd;
    if (amoebaStacksAtCriticalStart == null && time >= standardTime) {
      amoebaStacksAtCriticalStart = amoebaStacks;
      damageAtCriticalStart = damage;
      hitsAtCriticalStart = hits;
    }
    if (damage >= hp) {
      endedBy = 'clear';
      break;
    }

    if (time > standardTime) {
      const liveImmunoidSlots = Array.from(immunoidSlots).filter(slot => alive.has(slot));
      if (liveImmunoidSlots.length) immunoidFocusTime += frameSeconds;
      if (!criticalUnlocked) {
        endedBy = 'timer';
        break;
      }
      bossCounter++;
      const bossCooldown = jellyBossAttackCooldown(obstruction);
      if (bossCounter >= bossCooldown) {
        const liveSlots = Array.from(alive);
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
  }

  if (endedBy === 'running') endedBy = 'simulation-cap';
  const success = endedBy === 'clear';
  const attemptSpent = obstruction > 1 ? 1 : 0;
  return {
    valid: true,
    reason: '',
    seed: Math.floor(n(options.seed ?? 1)),
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
    projectilesRemaining: projectiles.length,
    bloodcells,
    cellExp: expGained.reduce((sum, value) => sum + value, 0),
    expByType: expGained,
    expAfter: exp,
    levelsAfter: levels,
    amoebaStacks,
    amoebaStacksAtCriticalStart: amoebaStacksAtCriticalStart ?? amoebaStacks,
    maxAmoebaStacksAtFire,
    damageAtCriticalStart: damageAtCriticalStart ?? damage,
    hitsAtCriticalStart: hitsAtCriticalStart ?? hits,
    feverSeconds,
    displayedDps,
    bestDpsBefore: jellyProgress(S).bestDps,
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
    triesAfter: Math.max(0, jellyProgress(S).tries + (success ? 1 : 0) - attemptSpent),
    note: 'Seeded 60 FPS runtime simulation with opening cooldowns, projectile travel, Fever, Amoeba weakening, Stronkroid, mid-run levels, Critical Condition, Immunoid focus, footprint deaths, revives, and displayed DPS.',
  };
}

export function simulateJellyTrials(layout, S, options = {}) {
  const trials = Math.max(1, Math.min(1000, Math.floor(n(options.trials) || 64)));
  const seed = Math.floor(n(options.seed) || 1);
  const results = [];
  for (let index = 0; index < trials; index++) {
    results.push(simulateJellyOperation(layout, S, { ...options, seed: seed + index * 2654435761 }));
  }
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
    meanDeaths: mean(deaths),
    meanRevives: mean(revives),
    meanBestDps: mean(bestDps),
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
    results: options.includeTrials ? results : undefined,
    note: 'Monte Carlo aggregate of deterministic seeded runtime trials.',
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
  const trials = Math.max(4, Math.min(1000, Math.floor(n(options.trials) || 32)));
  const screeningTrials = Math.max(2, Math.min(trials, Math.floor(n(options.screeningTrials) || 4)));
  const feverTypes = availableFeverTypes(S, options.fever);
  const roidTimings = availableRoidTimings(S, obstruction, options.roidTiming);
  const revivePolicies = availableRevivePolicies(S, options.revivePolicy);
  const screened = [];
  const progressTotal = Math.max(1, feverTypes.length + 2 * roidTimings.length + 18 + 4 * revivePolicies.length + 3);
  let policyIndex = 0;
  const reportProgress = (phase, completed) => options.onProgress?.({ phase, completed, total: progressTotal });
  function screen(fever, roidTiming, revivePolicy) {
    const key = `${fever}|${roidTiming}|${revivePolicy}`;
    if (screened.some(candidate => candidate.key === key)) return;
    const simulation = simulateJellyTrials(layout, S, {
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
  const finalists = screened.slice(0, Math.min(3, screened.length)).map((candidate, finalistIndex) => {
    const simulation = simulateJellyTrials(layout, S, {
      ...options,
      obstruction,
      fever: candidate.fever,
      roidTiming: candidate.roidTiming,
      revivePolicy: candidate.revivePolicy,
      trials,
      seed: Math.floor(n(options.seed) || 1),
    });
    reportProgress('Confirming best policies', progressTotal - 3 + finalistIndex + 1);
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
  const finalTrials = Math.max(1, Math.min(1000, Math.floor(n(options.trials) || nominal[2])));
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
  const score = candidate => proxyObjectiveScore(candidate, S, options);
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

function upgradeMarginalScore(baseline, candidate, objective, expCellType) {
  if (objective === 'bloodcells') return candidate.meanBloodcells - baseline.meanBloodcells;
  if (objective === 'exp') return operationExpValue(candidate, expCellType) - operationExpValue(baseline, expCellType);
  if (objective === 'survival') return candidate.meanCriticalTime - baseline.meanCriticalTime;
  if (objective === 'damage' || objective === 'dps') return candidate.meanDamage - baseline.meanDamage;
  const probabilityGain = candidate.clearProbability - baseline.clearProbability;
  if (Math.abs(probabilityGain) > 1e-12) return probabilityGain;
  if (candidate.clearProbability > 0 && baseline.meanTime && candidate.meanTime) {
    return (baseline.meanTime - candidate.meanTime) / Math.max(1, baseline.representative.standardTime) / 100;
  }
  return (candidate.meanDamage - baseline.meanDamage) / Math.max(1, baseline.representative.hp) / 1000;
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

function jellyEligibleUpgradeOrders(S, requestedIds, respectBudget) {
  const orders = [];
  for (let order = 0; order < 40; order++) {
    const status = jellyUpgradeStatus(S, order);
    if (requestedIds && !requestedIds.has(status.id)) continue;
    if (!status.levelVisible || !status.prerequisiteMet || !status.belowMax) continue;
    if (respectBudget && !status.affordable) continue;
    orders.push(order);
  }
  return orders;
}

function bestFutureUpgradeProxyGain(S, layout, options, depth) {
  if (depth <= 0) return 0;
  const baselineScore = proxyObjectiveScore(layout, S, options);
  let bestGain = 0;
  const orders = jellyEligibleUpgradeOrders(S, options.requestedIds, options.respectBudget)
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
        const score = proxyObjectiveScore(filled, geometry.expandedSave, options);
        if (!bestPlot || score > bestPlot.score) bestPlot = { plotId: plot.plotId, layout: filled, score };
      }
      if (bestPlot) {
        selectedPlotId = bestPlot.plotId;
        candidateLayout = bestPlot.layout;
      }
    }
    candidateSave = saveAfterJellyPurchase(S, id, cost, selectedPlotId, options.respectBudget);
    const candidateScore = proxyObjectiveScore(candidateLayout, candidateSave, options);
    const immediateGain = Math.max(0, candidateScore - baselineScore);
    const futureGain = bestFutureUpgradeProxyGain(candidateSave, candidateLayout, options, depth - 1);
    bestGain = Math.max(bestGain, immediateGain + 0.5 * futureGain);
  }
  return bestGain;
}

function evaluateUpgradeStateWithPolicy(S, layout, options, policy) {
  return {
    layout,
    operation: simulateJellyTrials(layout, S, {
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
  const analysisOptions = {
    ...options,
    objective,
    expCellType,
    trials,
    seed: Math.floor(n(options.seed) || 1),
    reoptimize: options.reoptimize !== false,
    beamWidth: Math.max(1, Math.min(8, Math.floor(n(options.beamWidth) || 3))),
    iterations: Math.max(1, Math.min(30, Math.floor(n(options.iterations) || 10))),
    onProgress: undefined,
  };
  const requestedIds = Array.isArray(options.upgradeIds) ? new Set(options.upgradeIds.map(value => Math.floor(n(value)))) : null;
  let workingSave = S;
  let workingLayout = initialLayout;
  let initialState = null;
  let finalState = null;
  let totalCost = 0;
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

    const eligibleOrders = jellyEligibleUpgradeOrders(workingSave, requestedIds, respectBudget);
    if (!eligibleOrders.length) break;

    const candidateSpecs = [];
    for (let eligibleIndex = 0; eligibleIndex < eligibleOrders.length; eligibleIndex++) {
      const order = eligibleOrders[eligibleIndex];
      const status = jellyUpgradeStatus(workingSave, order);
      const id = status.id;
      const cost = jellyUpgradeCost(workingSave, order);
      const upgradedSave = saveWithJellyUpgrade(workingSave, id);
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
        candidateSaves.push({ save: upgradedSave, layout: baselineState.layout, plotId: null, geometry: null });
      }
      for (let candidateIndex = 0; candidateIndex < candidateSaves.length; candidateIndex++) {
        const candidate = candidateSaves[candidateIndex];
        const purchasedSave = saveAfterJellyPurchase(workingSave, id, cost, candidate.plotId, respectBudget);
        const proxyScore = proxyObjectiveScore(candidate.layout, purchasedSave, stepOptions);
        candidateSpecs.push({
          order,
          id,
          cost,
          plotId: candidate.plotId,
          selectedPlotIds: candidate.plotId == null ? [] : [candidate.plotId],
          save: purchasedSave,
          layout: candidate.layout,
          geometry: candidate.geometry,
          proxyScore,
        });
      }
    }

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
        candidate.state = state;
        candidate.score = score;
        candidate.efficiency = efficiency;
        candidate.confidence = pairedOperationConfidence(state.operation, stageBaseline.operation, objective, expCellType);
        candidate.simulationTrials = stageTrials;
      }
      active.sort((a, b) => {
        const rankedEfficiency = candidate => {
          if (!candidate.confidence || strategy.confidenceWeight === 0) return candidate.efficiency;
          if (strategy.confidenceWeight < 0) return candidate.confidence.low / Math.max(1e-12, candidate.cost);
          const upside = Math.max(0, candidate.confidence.high - candidate.score);
          return candidate.efficiency + 0.25 * upside / Math.max(1e-12, candidate.cost);
        };
        const aRank = rankedEfficiency(a);
        const bRank = rankedEfficiency(b);
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
      candidate.lookaheadGain = lookahead > 1
        ? bestFutureUpgradeProxyGain(candidate.save, candidate.state.layout, {
          ...stepOptions,
          requestedIds,
          respectBudget,
        }, lookahead - 1)
        : 0;
      const relativeFuture = candidate.lookaheadGain / Math.max(1, Math.abs(candidate.proxyScore));
      candidate.selectionScore = candidate.efficiency * (1 + 0.1 * Math.min(2, Math.max(0, relativeFuture)));
    }
    if (purchaseIndex === 0) initialState = stageBaseline;
    active.sort((a, b) => b.selectionScore - a.selectionScore
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
      best.confidence = pairedOperationConfidence(reoptimized.operation, stageBaseline.operation, objective, expCellType);
    }

    const before = jellyUpgradeDisplay(workingSave, best.id);
    const beforeObjective = operationObjectiveValue(stageBaseline.operation, objective, expCellType);
    const afterObjective = operationObjectiveValue(best.state.operation, objective, expCellType);
    const bloodcellGain = n(best.state.operation.meanBloodcells) - n(stageBaseline.operation.meanBloodcells);
    const paybackAttempts = bloodcellGain > 0 ? best.cost / bloodcellGain : null;
    const paybackDays = paybackAttempts == null || jellyDailyTries(best.save) <= 0
      ? null
      : paybackAttempts / jellyDailyTries(best.save);
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
      efficiency: best.efficiency,
      selectedPlotIds: best.selectedPlotIds,
      bloodcellGain,
      paybackAttempts: finiteOrNull(paybackAttempts),
      paybackDays: finiteOrNull(paybackDays),
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
  options.onProgress?.({ phase: 'Purchase plan complete', completed: purchaseLimit, total: purchaseLimit });
  return {
    objective,
    expCellType,
    quality: quality.quality,
    qualityProfile: quality,
    strategy: strategy.strategy,
    lookahead,
    trials,
    reoptimized: analysisOptions.reoptimize,
    requestedPurchases: purchaseLimit,
    completedPurchases,
    respectBudget,
    startingBloodcells: jellyProgress(S).bloodcells,
    remainingBloodcells: jellyProgress(workingSave).bloodcells,
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
      ? 'Purchases use proxy screening, shared-seed adaptive simulation, bounded lookahead, and final bounded layout re-optimization. Slot-token upgrades automatically select their best screened section.'
      : 'Purchases use proxy screening, shared-seed adaptive simulation, bounded lookahead, and the current layout. Slot-token upgrades still automatically select and fill their best screened section.',
  };
}

export function jellyOperationSurrogate(layout, S, options = {}) {
  const obstruction = options.obstruction == null ? jellyProgress(S).obstruction : options.obstruction;
  const duration = jellyBossTime(obstruction);
  const fever = options.fever == null ? jellyProgress(S).fever : Math.floor(n(options.fever));
  const metrics = jellyLayoutMetrics(layout, S, {
    fever,
    feverRampPct: fever === 0 ? duration / 2 : 0,
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
    const travel = projectileHitDelay(cell.anchor, cell.type, () => 0.5) * Math.max(0.8, Math.min(1.2, n(options.travelScale) || 1));
    const openingFraction = options.openingFraction == null ? 0.5 : Math.max(0, Math.min(1, n(options.openingFraction)));
    const firstShot = openingFraction / Math.max(1e-12, cell.attacksPerSecond);
    const activeSeconds = Math.max(0, duration - travel - firstShot);
    const roidOverlap = Math.max(0, Math.min(duration, roidEnd) - Math.max(0, roidStart, travel + firstShot));
    const attacks = activeSeconds * cell.attacksPerSecond
      + roidOverlap * cell.attacksPerSecond * (roidFactor - 1);
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
  } else if (objective === 'bloodcells') score = projectedBloodcells;
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
  const surrogate = jellyOperationSurrogate(layout, S, options);
  if (!surrogate.valid) return -Infinity;
  if (options.objective === 'dps') {
    const metrics = jellyLayoutMetrics(layout, S, { fever: options.fever });
    return metrics.valid ? metrics.dps : -Infinity;
  }
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

export function optimizeJellyLayout(S, options = {}) {
  const objective = options.objective || 'dps';
  const expCellType = normalizeExpCellType(S, options.expCellType);
  const obstruction = options.obstruction == null ? jellyProgress(S).obstruction : Math.max(0, Math.floor(n(options.obstruction)));
  const saved = options.layout || jellyLayoutFromSave(S);
  const savedKey = jellyLayoutKey(saved);
  const fever = proxyFeverType(saved, S, objective, obstruction, options.fever, expCellType);
  const types = Array.from({ length: jellyUnitsOwned(S) }, (_, type) => type);
  const unlockedSet = jellyUnlockedSlots(S);
  const unlocked = Array.from(unlockedSet).sort((a, b) => a - b);
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
  const placements = [];
  for (const anchor of unlocked) {
    for (const type of types) {
      const slots = jellyFootprintSlots(anchor, type);
      if (slots && slots.every(slot => unlockedSet.has(slot))) placements.push({ anchor, type });
    }
  }
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
  const compareProxy = (a, b) => b.score - a.score || jellyLayoutKey(a.layout).localeCompare(jellyLayoutKey(b.layout));
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
      selectedKeys.add(jellyLayoutKey(candidate.layout));
      if (selected.length >= diversityTarget) break;
    }
    for (const candidate of candidates) {
      const key = jellyLayoutKey(candidate.layout);
      if (selectedKeys.has(key)) continue;
      selected.push(candidate);
      selectedKeys.add(key);
      if (selected.length >= limit) break;
    }
    return selected;
  };
  const selectDiverse = (candidates, limit = beamWidth) => selectDiverseBy(candidates, limit, compareProxy);
  const scoreLayout = layout => proxyObjectiveScore(layout, S, { ...options, objective, fever });
  const addWithoutReplacement = (layout, placement) => {
    const next = jellyPlaceCell(layout, placement.anchor, placement.type, S);
    return next && Object.keys(next).length === Object.keys(layout).length + 1 ? next : null;
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
  const placementByType = types.map(type => placements.filter(placement => placement.type === type));
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
  const seedCellLimit = Math.max(1, Math.min(unlocked.length, Math.max(Object.keys(saved).length, iterations)));
  const greedyCompositionSeed = (typeOrder, anchors) => {
    let layout = {};
    let changed = true;
    while (changed && Object.keys(layout).length < seedCellLimit) {
      changed = false;
      for (const type of typeOrder) {
        if (Object.keys(layout).length >= seedCellLimit) break;
        for (const anchor of anchors) {
          const next = addWithoutReplacement(layout, { anchor, type });
          if (!next) continue;
          layout = next;
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
    const scoreA = scoreLayout(jellyPlaceCell({}, placementByType[a]?.[0]?.anchor, a, S) || {});
    const scoreB = scoreLayout(jellyPlaceCell({}, placementByType[b]?.[0]?.anchor, b, S) || {});
    return scoreB / Math.max(1, cellFootprint(b).length) - scoreA / Math.max(1, cellFootprint(a).length) || a - b;
  });
  const typeOrders = [
    standaloneOrder,
    types,
    types.slice().reverse(),
    ...types.map(type => [type]),
  ];
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
        const key = jellyLayoutKey(layout);
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
  const seedKeys = new Set([jellyLayoutKey({})]);
  let savedCompositionSeeds = 0;
  let backtrackingNodes = 0;
  let backtrackingSeeds = 0;
  let savedDiscoveredByCompositionRepack = false;
  let independentSavedCompositionLayouts = 0;
  for (const anchors of packingAnchorOrders) {
    const packed = backtrackExactComposition(savedCounts, anchors);
    backtrackingNodes += packed.nodes;
    for (const layout of packed.layouts) {
      const key = jellyLayoutKey(layout);
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
      const key = jellyLayoutKey(layout);
      if (seedKeys.has(key)) continue;
      seedKeys.add(key);
      seedCandidates.push({ layout, score: scoreLayout(layout), seedKind: 'saved-composition' });
      savedCompositionSeeds++;
      if (key === savedKey) savedDiscoveredByCompositionRepack = true;
      else independentSavedCompositionLayouts++;
    }
  }
  for (const typeOrder of typeOrders) {
    for (const anchors of anchorOrders) {
      const layout = greedyCompositionSeed(typeOrder, anchors);
      const key = jellyLayoutKey(layout);
      if (seedKeys.has(key)) continue;
      seedKeys.add(key);
      seedCandidates.push({ layout, score: scoreLayout(layout) });
    }
  }
  const searchArchive = new Map(seedCandidates.map(candidate => [jellyLayoutKey(candidate.layout), candidate]));
  const eliteArchive = new Map();
  const eliteFeatureKey = layout => {
    const metrics = jellyLayoutMetrics(layout, S, { fever });
    if (!metrics.valid) return 'invalid';
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
      travelWeighted += projectileHitDelay(cell.anchor, cell.type, () => 0.5) * cell.attacksPerSecond;
      attackWeight += cell.attacksPerSecond;
      if (cell.type === 4) immunoids++;
    }
    const travelBucket = Math.floor((travelWeighted / Math.max(1e-12, attackWeight)) * 4);
    const attackBucket = Math.floor(Math.log10(Math.max(1, metrics.attacksPerSecond)) * 3);
    return [
      compositionKey(layout),
      Math.floor(organelleCoverage / 2),
      Math.floor(proximityCoverage / 2),
      Math.floor((metrics.infectedSlots || 0) / 4),
      Math.floor(footprintSlots / 8),
      travelBucket,
      attackBucket,
      immunoids,
    ].join('|');
  };
  const archiveCandidate = candidate => {
    const key = jellyLayoutKey(candidate.layout);
    const current = searchArchive.get(key);
    if (!current || candidate.score > current.score) searchArchive.set(key, candidate);
    const feature = eliteFeatureKey(candidate.layout);
    const elite = eliteArchive.get(feature);
    if (!elite || candidate.score > elite.score) eliteArchive.set(feature, candidate);
  };
  for (const candidate of seedCandidates) archiveCandidate(candidate);
  const archiveTop = (candidates, limit = Math.max(24, beamWidth * 6)) => {
    const archived = [
      ...candidates.slice().sort(compareProxy).slice(0, limit),
      ...selectDiverse(candidates.slice(), Math.min(limit, candidates.length)),
    ];
    for (const candidate of archived) archiveCandidate(candidate);
  };
  const searchStarts = Math.max(1, Math.min(12, Math.floor(n(options.searchStarts) || 4)));
  const layoutHash = layout => {
    let hash = 2166136261;
    for (const character of jellyLayoutKey(layout)) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  };
  const startCompare = start => (a, b) => {
    const scoreA = Math.log1p(Math.abs(a.score)) * Math.sign(a.score || 1)
      + (((layoutHash(a.layout) ^ Math.imul(start + 1, 0x9e3779b1)) >>> 0) / 4294967296 - 0.5) * 0.35;
    const scoreB = Math.log1p(Math.abs(b.score)) * Math.sign(b.score || 1)
      + (((layoutHash(b.layout) ^ Math.imul(start + 1, 0x9e3779b1)) >>> 0) / 4294967296 - 0.5) * 0.35;
    return scoreB - scoreA || compareProxy(a, b);
  };
  let beams = Array.from({ length: searchStarts }, (_, start) => (
    selectDiverseBy(seedCandidates.slice(), beamWidth, startCompare(start))
  ));
  const startSeen = beams.map(rows => new Set(rows.map(candidate => jellyLayoutKey(candidate.layout))));
  let evaluated = seedCandidates.length;
  const searchRounds = iterations + savedRefinementRounds + refinementRounds;
  const reportLayoutProgress = (phase, overallPercent, completed = overallPercent, total = 100) => {
    options.onProgress?.({ phase, completed, total, overallPercent });
  };
  reportLayoutProgress('Preparing search', 1);
  for (let iteration = 0; iteration < iterations; iteration++) {
    let changed = false;
    beams = beams.map((startBeam, start) => {
      const candidates = startBeam.slice();
      for (const candidate of startBeam) {
        for (const placement of placements) {
          const layout = addWithoutReplacement(candidate.layout, placement);
          if (!layout) continue;
          const key = jellyLayoutKey(layout);
          if (startSeen[start].has(key)) continue;
          startSeen[start].add(key);
          candidates.push({ layout, score: scoreLayout(layout), searchStart: start });
          evaluated++;
        }
      }
      archiveTop(candidates);
      const next = selectDiverseBy(candidates, beamWidth, startCompare(start));
      const unchanged = next.length === startBeam.length && next.every((candidate, index) => (
        jellyLayoutKey(candidate.layout) === jellyLayoutKey(startBeam[index].layout)
      ));
      if (!unchanged) changed = true;
      return next;
    });
    reportLayoutProgress(`Building layouts ${iteration + 1}/${iterations}`, 2 + 18 * (iteration + 1) / iterations);
    if (!changed) break;
  }
  const savedDiscoveredByConstruction = startSeen.some(seen => seen.has(savedKey));
  const blindBeam = selectDiverse(beams.flat(), Math.max(beamWidth, beamWidth * searchStarts));
  const blindKeys = new Set(blindBeam.map(candidate => jellyLayoutKey(candidate.layout)));

  const savedBeamWidth = Math.max(4, Math.ceil(beamWidth / 2));
  let savedBeam = [{ layout: saved, score: scoreLayout(saved) }];
  const savedSeen = new Set([jellyLayoutKey(saved)]);
  evaluated++;
  for (let refinement = 0; refinement < savedRefinementRounds; refinement++) {
    const candidates = savedBeam.slice();
    for (const candidate of savedBeam) {
      for (const placement of placements) {
        const layout = jellyPlaceCell(candidate.layout, placement.anchor, placement.type, S);
        if (!layout) continue;
        const key = jellyLayoutKey(layout);
        if (savedSeen.has(key)) continue;
        savedSeen.add(key);
        candidates.push({ layout, score: scoreLayout(layout) });
        evaluated++;
      }
      for (const rawAnchor of Object.keys(candidate.layout)) {
        const anchor = Number(rawAnchor);
        const type = Number(candidate.layout[rawAnchor]);
        const removed = jellyRemoveCell(candidate.layout, anchor);
        const removedKey = jellyLayoutKey(removed);
        if (!savedSeen.has(removedKey)) {
          savedSeen.add(removedKey);
          candidates.push({ layout: removed, score: scoreLayout(removed) });
          evaluated++;
        }
        for (const placement of placements) {
          if (placement.type !== type || placement.anchor === anchor) continue;
          const relocated = jellyPlaceCell(removed, placement.anchor, type, S);
          if (!relocated) continue;
          const key = jellyLayoutKey(relocated);
          if (savedSeen.has(key)) continue;
          savedSeen.add(key);
          candidates.push({ layout: relocated, score: scoreLayout(relocated) });
          evaluated++;
        }
      }
    }
    archiveTop(candidates);
    const next = selectDiverse(candidates, savedBeamWidth);
    const unchanged = next.length === savedBeam.length && next.every((candidate, index) => jellyLayoutKey(candidate.layout) === jellyLayoutKey(savedBeam[index].layout));
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
        const layout = jellyPlaceCell(candidate.layout, placement.anchor, placement.type, S);
        if (!layout) continue;
        const key = jellyLayoutKey(layout);
        if (seen.has(key)) continue;
        seen.add(key);
        candidates.push({ layout, score: scoreLayout(layout) });
        evaluated++;
      }
      for (const anchor of Object.keys(candidate.layout)) {
        const layout = jellyRemoveCell(candidate.layout, anchor);
        const key = jellyLayoutKey(layout);
        if (seen.has(key)) continue;
        seen.add(key);
        candidates.push({ layout, score: scoreLayout(layout) });
        evaluated++;
      }
    }
    archiveTop(candidates);
    const next = selectDiverse(candidates);
    const unchanged = next.length === beam.length && next.every((candidate, index) => jellyLayoutKey(candidate.layout) === jellyLayoutKey(beam[index].layout));
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
  const immunoidArchetypeCandidates = [];
  if (jellyUnitsOwned(S) > 4 && jellyUpgradeQuantity(S, 36) === 1) {
    const archetypeKeys = new Set();
    const archetypeBases = [saved, ...blindBeam.slice().sort(compareProxy).slice(0, Math.min(3, blindBeam.length)).map(candidate => candidate.layout)];
    for (const base of archetypeBases) {
      const baseImmunoids = Object.values(base).filter(type => Number(type) === 4).length;
      for (const placement of placementByType[4] || []) {
        const layout = jellyPlaceCell(base, placement.anchor, 4, S);
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
        const layout = jellyPlaceCell(base.layout, placement.anchor, 4, S);
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
        const layout = jellyPlaceCell(base, placement.anchor, type, S);
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
    const bandFever = proxyFeverType(saved, S, objective, band, options.fever);
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
          const relocated = jellyPlaceCell(removed, placement.anchor, type, S);
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
      fever: proxyFeverType(layout, S, objective, obstruction, options.fever),
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
        : simulateJellyTrials(candidate.layout, S, {
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
        const relocated = jellyPlaceCell(removed, placement.anchor, type, S);
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
        swapped = jellyPlaceCell(swapped, secondAnchor, firstType, S);
        if (!swapped) continue;
        swapped = jellyPlaceCell(swapped, firstAnchor, secondType, S);
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
  const repackRegionExact = (layout, region, nodeBudget = 3000, resultLimit = 4) => {
    let outside = { ...layout };
    const removedTypes = [];
    for (const [rawAnchor, rawType] of Object.entries(layout)) {
      const anchor = Number(rawAnchor);
      const type = Number(rawType);
      const slots = jellyFootprintSlots(anchor, type) || [];
      if (!slots.some(slot => region.has(slot))) continue;
      delete outside[anchor];
      removedTypes.push(type);
    }
    if (!removedTypes.length) return [];
    const variants = [removedTypes.slice()];
    for (let index = 0; index < removedTypes.length && variants.length < 12; index++) {
      for (const type of types) {
        if (type === removedTypes[index]) continue;
        const variant = removedTypes.slice();
        variant[index] = type;
        variants.push(variant);
        if (variants.length >= 12) break;
      }
    }
    const resultMap = new Map();
    let nodes = 0;
    const budgetPerVariant = Math.max(100, Math.floor(nodeBudget / variants.length));
    for (const variant of variants) {
      const items = variant.slice().sort((a, b) => cellFootprint(b).length - cellFootprint(a).length || a - b);
      const localPlacements = items.map(type => (placementByType[type] || []).filter(placement => {
        const slots = jellyFootprintSlots(placement.anchor, type) || [];
        return slots.length && slots.every(slot => region.has(slot));
      }));
      const search = (working, index, sameTypeMinimum) => {
        if (nodes >= nodeBudget || index >= items.length) {
          if (index >= items.length) {
            const key = jellyLayoutKey(working);
            const score = scoreLayout(working);
            const current = resultMap.get(key);
            if (!current || score > current.score) resultMap.set(key, { layout: working, score });
          }
          return;
        }
        nodes++;
        const type = items[index];
        const previousSameType = index > 0 && items[index - 1] === type ? sameTypeMinimum : -1;
        let branches = 0;
        for (const placement of localPlacements[index]) {
          if (placement.anchor <= previousSameType) continue;
          const next = addWithoutReplacement(working, placement);
          if (!next) continue;
          search(next, index + 1, placement.anchor);
          branches++;
          if (branches >= 24 || nodes >= nodeBudget || branches >= budgetPerVariant) break;
        }
      };
      search(outside, 0, -1);
      if (nodes >= nodeBudget) break;
    }
    exactRegionNodes += nodes;
    const results = Array.from(resultMap.values()).sort(compareProxy).slice(0, resultLimit);
    exactRegionLayouts += results.length;
    return results;
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
  }

  const screeningFeatureKey = candidate => {
    const metrics = jellyLayoutMetrics(candidate.layout, S, { fever: candidate.screeningPolicy?.fever ?? screenPolicy.fever });
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
  let reranked = finalists.map((candidate, index) => {
    const simulation = optimizeJellyOperationPolicy(candidate.layout, S, {
      ...options,
      obstruction,
      fever: options.fever,
      roidTiming: options.roidTiming,
      revivePolicy: options.revivePolicy,
      trials: simulationTrials,
      seed: Math.floor(n(options.seed) || 1),
      onProgress: progress => options.onProgress?.({
        phase: `Simulating finalist ${index + 1}/${finalists.length}: ${progress.phase}`,
        completed: searchRounds + 2 + index + Number(progress.completed) / Math.max(1, Number(progress.total)),
        total: searchRounds + 2 + finalists.length,
        overallPercent: 64 + 14 * (index + Number(progress.completed) / Math.max(1, Number(progress.total))) / Math.max(1, finalists.length),
      }),
    });
    return { ...candidate, simulation, simulatedScore: simulatedObjectiveScore(simulation, objective, expCellType) };
  }).sort((a, b) => b.simulatedScore - a.simulatedScore
    || b.score - a.score
    || moveCount(a.layout) - moveCount(b.layout)
    || jellyLayoutKey(a.layout).localeCompare(jellyLayoutKey(b.layout)));
  const neighborhoodKeys = new Set(reranked.map(candidate => jellyLayoutKey(candidate.layout)));
  const neighborhoodCandidates = [];
  const addNeighborhood = layout => {
    if (!layout) return;
    const key = jellyLayoutKey(layout);
    if (neighborhoodKeys.has(key)) return;
    neighborhoodKeys.add(key);
    neighborhoodCandidates.push({ layout, score: scoreLayout(layout), seedKind: 'winner-neighborhood' });
    evaluated++;
  };
  const neighborhoodLeader = reranked[0];
  for (const rawAnchor of Object.keys(neighborhoodLeader.layout)) {
    const anchor = Number(rawAnchor);
    const type = Number(neighborhoodLeader.layout[rawAnchor]);
    const removed = jellyRemoveCell(neighborhoodLeader.layout, anchor);
    for (const placement of placementByType[type] || []) {
      if (placement.anchor === anchor) continue;
      addNeighborhood(jellyPlaceCell(removed, placement.anchor, type, S));
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
      swapped = jellyPlaceCell(swapped, secondAnchor, firstType, S);
      if (!swapped) continue;
      addNeighborhood(jellyPlaceCell(swapped, firstAnchor, secondType, S));
    }
  }
  const neighborhoodShortlist = selectDiverse(neighborhoodCandidates, Math.min(24, neighborhoodCandidates.length));
  const neighborhoodTrials = Math.min(simulationTrials, Math.max(16, screeningTrials * 4));
  let neighborhoodPromoted = 0;
  if (neighborhoodShortlist.length && neighborhoodTrials > 0) {
    reportLayoutProgress('Checking winner neighborhood', 79);
    const policy = neighborhoodLeader.simulation;
    const neighborhoodScreened = [
      {
        candidate: neighborhoodLeader,
        simulation: simulateJellyTrials(neighborhoodLeader.layout, S, {
          ...options,
          obstruction,
          fever: policy.fever,
          roidTiming: policy.roidTiming,
          revivePolicy: policy.revivePolicy,
          trials: neighborhoodTrials,
          seed: Math.floor(n(options.seed) || 1),
        }),
      },
      ...neighborhoodShortlist.map(candidate => ({
        candidate,
        simulation: simulateJellyTrials(candidate.layout, S, {
          ...options,
          obstruction,
          fever: policy.fever,
          roidTiming: policy.roidTiming,
          revivePolicy: policy.revivePolicy,
          trials: neighborhoodTrials,
          seed: Math.floor(n(options.seed) || 1),
        }),
      })),
    ].map(row => ({
      ...row,
      score: simulatedObjectiveScore(row.simulation, objective, expCellType),
    })).sort((a, b) => b.score - a.score);
    const promoted = neighborhoodScreened
      .filter(row => jellyLayoutKey(row.candidate.layout) !== jellyLayoutKey(neighborhoodLeader.layout))
      .slice(0, 3);
    for (const row of promoted) {
      const simulation = optimizeJellyOperationPolicy(row.candidate.layout, S, {
        ...options,
        obstruction,
        fever: options.fever,
        roidTiming: options.roidTiming,
        revivePolicy: options.revivePolicy,
        trials: simulationTrials,
        seed: Math.floor(n(options.seed) || 1),
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
  const adaptiveMaxTrials = Math.max(simulationTrials, Math.min(1000, Math.floor(n(options.adaptiveMaxTrials) || 1000)));
  const confidenceBounds = simulation => {
    if (objective === 'clear') return [simulation.clearProbabilityLow, simulation.clearProbabilityHigh];
    if (objective === 'bloodcells') {
      const margin = 1.96 * simulation.meanBloodcellsStandardError;
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
    if (objective === 'survival') return [simulation.meanCriticalTime, simulation.meanCriticalTime];
    const margin = 1.96 * simulation.meanDamageStandardError;
    return [simulation.meanDamage - margin, simulation.meanDamage + margin];
  };
  const baseSeed = Math.floor(n(options.seed) || 1);
  const validationSeed = (baseSeed ^ 0x6a09e667) >>> 0;
  const confirmationSeed = (baseSeed ^ 0xbb67ae85) >>> 0;
  const validationTrials = Math.min(simulationTrials, Math.max(32, Math.floor(simulationTrials / 2)));
  const heldoutValidation = simulationTrials >= 64 && options.heldoutValidation !== false;
  if (heldoutValidation) {
    reranked = reranked.map((candidate, index) => {
      reportLayoutProgress(`Validating finalist ${index + 1}/${reranked.length}`, 84 + 6 * (index + 1) / Math.max(1, reranked.length));
      const validationSimulation = simulateJellyTrials(candidate.layout, S, {
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
    const finalKeys = new Set(finalCandidates.map(candidate => jellyLayoutKey(candidate.layout)));
    const finalTrials = Math.min(adaptiveMaxTrials, Math.max(512, simulationTrials));
    let heldoutIndex = 0;
    reranked = reranked.map(candidate => {
      if (!finalKeys.has(jellyLayoutKey(candidate.layout))) return candidate;
      heldoutIndex++;
      reportLayoutProgress(`Confirming finalist ${heldoutIndex}/${finalCandidates.length}`, 90 + 6 * heldoutIndex / Math.max(1, finalCandidates.length));
      const simulation = simulateJellyTrials(candidate.layout, S, {
        ...options,
        obstruction,
        fever: candidate.simulation.fever,
        roidTiming: candidate.simulation.roidTiming,
        revivePolicy: candidate.simulation.revivePolicy,
        trials: finalTrials,
        seed: confirmationSeed,
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
    confirmationStages.push({ trials: finalTrials, candidates: finalCandidates.length, phase: 'held-out' });
    confirmedTrials = finalTrials;
  }
  let overlapRound = 0;
  while (reranked.length > 1 && confirmedTrials < adaptiveMaxTrials) {
    const leaderBounds = confidenceBounds(reranked[0].simulation);
    const competitive = reranked.filter(candidate => (!heldoutValidation || candidate.finalConfirmed) && (() => {
      const bounds = confidenceBounds(candidate.simulation);
      return bounds[0] <= leaderBounds[1] && leaderBounds[0] <= bounds[1];
    })());
    if (competitive.length <= 1) break;
    const nextTrials = Math.min(adaptiveMaxTrials, confirmedTrials < 512 ? Math.max(512, confirmedTrials * 2) : 1000);
    const competitiveKeys = new Set(competitive.map(candidate => jellyLayoutKey(candidate.layout)));
    const overlapBase = 96 + Math.min(2, overlapRound) * 1.5;
    let overlapIndex = 0;
    reranked = reranked.map(candidate => {
      if (!competitiveKeys.has(jellyLayoutKey(candidate.layout))) return candidate;
      overlapIndex++;
      reportLayoutProgress(`Resolving close finalists ${overlapIndex}/${competitive.length}`, overlapBase + 1.5 * overlapIndex / Math.max(1, competitive.length));
      const simulation = simulateJellyTrials(candidate.layout, S, {
        ...options,
        obstruction,
        fever: candidate.simulation.fever,
        roidTiming: candidate.simulation.roidTiming,
        revivePolicy: candidate.simulation.revivePolicy,
        trials: nextTrials,
        seed: confirmationSeed,
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
    }).sort((a, b) => b.simulatedScore - a.simulatedScore
      || b.score - a.score
      || moveCount(a.layout) - moveCount(b.layout)
      || jellyLayoutKey(a.layout).localeCompare(jellyLayoutKey(b.layout)));
    confirmationStages.push({ trials: nextTrials, candidates: competitive.length, phase: 'overlap' });
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
  const blindFinalist = reranked.find(candidate => blindKeys.has(jellyLayoutKey(candidate.layout)));
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
      operation: candidate?.simulation || null,
      score: candidate?.simulatedScore ?? null,
    };
  });
  let best = savedFinalist && savedFinalist.simulatedScore >= reranked[0].simulatedScore
    ? savedFinalist
    : reranked[0];
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
  if (jellyLayoutKey(best.layout) !== savedKey) {
    const filledLayout = fillOpenSlots(best.layout);
    if (jellyLayoutKey(filledLayout) !== jellyLayoutKey(best.layout)) {
      reportLayoutProgress('Filling remaining unlocked slots', 99);
      const simulation = simulateJellyTrials(filledLayout, S, {
        ...options,
        obstruction,
        fever: best.simulation.fever,
        roidTiming: best.simulation.roidTiming,
        revivePolicy: best.simulation.revivePolicy,
        trials: best.simulation.trials,
        seed: Math.floor(n(options.seed) || 1),
      });
      best = {
        ...best,
        layout: filledLayout,
        score: scoreLayout(filledLayout),
        simulation: {
          ...simulation,
          objective,
          expCellType,
          fever: best.simulation.fever,
          roidTiming: best.simulation.roidTiming,
          revivePolicy: best.simulation.revivePolicy,
          policiesEvaluated: best.simulation.policiesEvaluated,
          screeningTrials: best.simulation.screeningTrials,
        },
        simulatedScore: simulatedObjectiveScore(simulation, objective, expCellType),
      };
    }
  }
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
    proxyScore: best.score,
    metrics: jellyLayoutMetrics(best.layout, S, { fever: best.simulation.fever }),
    operation: best.simulation,
    savedOperation: savedFinalist?.simulation || null,
    blindLayout: blindFinalist?.layout || null,
    blindOperation: blindFinalist?.simulation || null,
    blindScore: blindFinalist?.simulatedScore ?? null,
    blindMoves: blindFinalist ? jellyLayoutMoves(saved, blindFinalist.layout) : [],
    immunoidLayout: immunoidFinalist?.layout || null,
    immunoidOperation: immunoidFinalist?.simulation || null,
    immunoidScore: immunoidFinalist?.simulatedScore ?? null,
    immunoidBreakpoint,
    archetypeResults,
    countArchetypeResults,
    obstructionBandResults,
    proxyAudit,
    adaptiveConfirmation,
    anchorContributions: jellyAnchorContributions(best.layout, S, { fever: best.simulation.fever }),
    moves: jellyLayoutMoves(saved, best.layout),
    evaluated,
    search: {
      start: 'composition-seeded-saved-and-empty',
      model: 'hybrid-multifidelity',
      constructionRounds: iterations,
      savedRefinementRounds,
      refinementRounds,
      beamWidth,
      finalists: finalists.length,
      screeningCandidates: screeningPool.length + feedbackPool.length,
      screeningTrials,
      racingCandidates: racingPool.length,
      racingTrials,
      screeningPoliciesEvaluated,
      calibratedCandidates: calibratedCandidates.length,
      policyNiches: policyNicheMap.size,
      randomizedConstructionLanes: 9,
      searchStarts,
      eliteArchiveSize: eliteArchive.size,
      scenarioCandidates: scenarioCandidates.length,
      eliteScreeningCandidates: eliteScreeningPool.length,
      compositionSeeds: seedCandidates.length,
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
      neighborhoodCandidates: neighborhoodCandidates.length,
      neighborhoodShortlist: neighborhoodShortlist.length,
      neighborhoodPromoted,
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
