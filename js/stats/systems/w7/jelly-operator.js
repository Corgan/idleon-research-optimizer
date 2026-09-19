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
  const criticalTimes = results.map(result => result.criticalTime);
  const deaths = results.map(result => result.deaths);
  const revives = results.map(result => result.revivesUsed);
  const bestDps = results.map(result => result.bestDpsAfter);
  return {
    valid: true,
    trials,
    seed,
    successCount: successes.length,
    clearProbability: successes.length / trials,
    meanTime: mean(times),
    medianTime: quantile(times, 0.5),
    p90Time: quantile(times, 0.9),
    meanDamage: mean(damages),
    medianDamage: quantile(damages, 0.5),
    meanBloodcells: mean(bloodcells),
    medianBloodcells: quantile(bloodcells, 0.5),
    meanCellExp: mean(cellExp),
    meanCriticalTime: mean(criticalTimes),
    meanDeaths: mean(deaths),
    meanRevives: mean(revives),
    meanBestDps: mean(bestDps),
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

export function optimizeJellyOperationPolicy(layout, S, options = {}) {
  const objective = options.objective || 'clear';
  const obstruction = options.obstruction == null ? jellyProgress(S).obstruction : Math.max(0, Math.floor(n(options.obstruction)));
  const trials = Math.max(4, Math.min(256, Math.floor(n(options.trials) || 32)));
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
      score: simulatedObjectiveScore(simulation, objective),
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
      score: simulatedObjectiveScore(simulation, objective),
    };
  }).sort((a, b) => b.score - a.score || a.index - b.index);
  const best = finalists[0];
  reportProgress('Operation policy complete', progressTotal);
  return {
    ...best.simulation,
    objective,
    fever: best.fever,
    roidTiming: best.roidTiming,
    revivePolicy: best.revivePolicy,
    policiesEvaluated: screened.length,
    screeningTrials,
    note: `${best.simulation.note} Fever, Stronkroid timing, and revival policy were selected by bounded policy search.`,
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

function upgradeMarginalScore(baseline, candidate, objective) {
  if (objective === 'bloodcells') return candidate.meanBloodcells - baseline.meanBloodcells;
  if (objective === 'exp') return candidate.meanCellExp - baseline.meanCellExp;
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

export function planJellyUpgradePurchases(S, options = {}) {
  const objective = options.objective || 'clear';
  const initialLayout = options.layout || jellyLayoutFromSave(S);
  const trials = Math.max(4, Math.min(128, Math.floor(n(options.trials) || 16)));
  const purchaseLimit = Math.max(1, Math.min(50, Math.floor(n(options.purchases) || 10)));
  const respectBudget = options.respectBudget !== false;
  const analysisOptions = {
    ...options,
    objective,
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

  for (let purchaseIndex = 0; purchaseIndex < purchaseLimit; purchaseIndex++) {
    const stepOptions = {
      ...analysisOptions,
      seed: (analysisOptions.seed + Math.imul(purchaseIndex + 1, 0x9e3779b1)) >>> 0,
    };
    const baselineState = evaluateUpgradeState(workingSave, workingLayout, {
      ...stepOptions,
      onProgress: progress => options.onProgress?.({
        phase: `Purchase ${purchaseIndex + 1}: baseline ${progress.phase}`,
        completed: purchaseIndex + 0.15 * Number(progress.completed) / Math.max(1, Number(progress.total)),
        total: purchaseLimit,
      }),
    });
    if (!initialState) initialState = baselineState;
    finalState = baselineState;

    const eligibleOrders = [];
    for (let order = 0; order < 40; order++) {
      const status = jellyUpgradeStatus(workingSave, order);
      if (requestedIds && !requestedIds.has(status.id)) continue;
      if (!status.levelVisible || !status.prerequisiteMet || !status.belowMax) continue;
      if (respectBudget && !status.affordable) continue;
      eligibleOrders.push(order);
    }
    if (!eligibleOrders.length) break;

    let best = null;
    for (let eligibleIndex = 0; eligibleIndex < eligibleOrders.length; eligibleIndex++) {
      const order = eligibleOrders[eligibleIndex];
      const status = jellyUpgradeStatus(workingSave, order);
      const id = status.id;
      const cost = jellyUpgradeCost(workingSave, order);
      const upgradedSave = saveWithJellyUpgrade(workingSave, id);
      const candidateSaves = [{ save: upgradedSave, plotId: null }];
      if ((id === 8 || id === 9) && jellySlotPurchasesLeft(upgradedSave) > jellySlotPurchasesLeft(workingSave)) {
        const purchased = new Set(researchRow(upgradedSave, 18).map(value => Math.floor(n(value))));
        const rankedPlots = jellySlotPlots()
          .filter(plot => !purchased.has(plot.plotId))
          .map(plot => {
            let proximitySlots = 0;
            for (let y = 0; y < plot.height; y++) {
              for (let x = 0; x < plot.width; x++) {
                if (PROXIMITY_ANCHORS.has(plot.start + x + JELLY_COLS * y)) proximitySlots++;
              }
            }
            return { ...plot, proximitySlots };
          })
          .sort((a, b) => b.proximitySlots - a.proximitySlots || b.width * b.height - a.width * a.height || a.plotId - b.plotId)
          .slice(0, 8);
        for (const plot of rankedPlots) candidateSaves.push({ save: saveWithJellyPlot(upgradedSave, plot.plotId), plotId: plot.plotId });
      }

      let bestUpgradeState = null;
      let bestUpgradeScore = -Infinity;
      let bestPlotId = null;
      for (let candidateIndex = 0; candidateIndex < candidateSaves.length; candidateIndex++) {
        const candidate = candidateSaves[candidateIndex];
        const state = evaluateUpgradeState(candidate.save, baselineState.layout, {
          ...stepOptions,
          onProgress: progress => options.onProgress?.({
            phase: `Purchase ${purchaseIndex + 1}: ${jellyUpgradeData(id)?.name || `Upgrade ${id}`}`,
            completed: purchaseIndex + 0.15 + 0.85 * (
              eligibleIndex + (candidateIndex + Number(progress.completed) / Math.max(1, Number(progress.total))) / candidateSaves.length
            ) / eligibleOrders.length,
            total: purchaseLimit,
          }),
        });
        const score = upgradeMarginalScore(baselineState.operation, state.operation, objective);
        if (score > bestUpgradeScore) {
          bestUpgradeState = state;
          bestUpgradeScore = score;
          bestPlotId = candidate.plotId;
        }
      }
      const efficiency = cost > 0 ? bestUpgradeScore / cost : bestUpgradeScore > 0 ? Infinity : 0;
      if (!best || efficiency > best.efficiency || (
        efficiency === best.efficiency && (bestUpgradeScore > best.score || (
          bestUpgradeScore === best.score && order < best.order
        ))
      )) {
        best = {
          order,
          id,
          cost,
          score: bestUpgradeScore,
          efficiency,
          plotId: bestPlotId,
          state: bestUpgradeState,
        };
      }
    }
    if (!best) break;

    const before = jellyUpgradeDisplay(workingSave, best.id);
    workingSave = saveAfterJellyPurchase(workingSave, best.id, best.cost, best.plotId, respectBudget);
    workingLayout = best.state.layout;
    finalState = best.state;
    totalCost += best.cost;
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
    trials,
    reoptimized: analysisOptions.reoptimize,
    requestedPurchases: purchaseLimit,
    completedPurchases,
    respectBudget,
    startingBloodcells: jellyProgress(S).bloodcells,
    remainingBloodcells: jellyProgress(workingSave).bloodcells,
    totalCost,
    baselineLayout: initialState.layout,
    baseline: initialState.operation,
    finalLayout: finalState.layout,
    final: finalState.operation,
    rows,
    note: analysisOptions.reoptimize
      ? 'At each future purchase, every legal next level is compared with equal seeded trials and bounded layout re-optimization. The winning purchase is applied before evaluating the next one.'
      : 'At each future purchase, every legal next level is compared on the current layout with equal seeded trials. The winning purchase is applied before evaluating the next one.',
  };
}

function proxyObjectiveScore(layout, S, options) {
  const obstruction = options.obstruction == null ? jellyProgress(S).obstruction : options.obstruction;
  const duration = jellyBossTime(obstruction);
  const metrics = jellyLayoutMetrics(layout, S, {
    fever: options.fever,
    feverRampPct: options.fever === 0 ? duration / 2 : 0,
  });
  if (!metrics.valid) return -Infinity;
  if (options.objective === 'dps') return metrics.dps;
  const amoebaUnlocked = jellyUpgradeQuantity(S, 28) >= 1;
  const rampedDamage = totalDuration => metrics.dps * totalDuration * (
    amoebaUnlocked ? 1 + metrics.amoebaAttacksPerSecond * totalDuration / 200 : 1
  );
  const bossInterval = jellyBossAttackCooldown(obstruction) / 60;
  const footprintSlots = metrics.cells.reduce((sum, cell) => sum + cell.slots.length, 0);
  const immunoidSlots = metrics.cells.filter(cell => cell.type === 4).reduce((sum, cell) => sum + cell.slots.length, 0);
  const survivalSeconds = jellyUpgradeQuantity(S, 36) === 1
    ? bossInterval * (footprintSlots + 2 * immunoidSlots + jellyUpgradeQuantity(S, 35))
    : 0;
  const operationDuration = duration + survivalSeconds;
  if (options.objective === 'clear') {
    const hp = jellyBossHp(obstruction);
    const totalDamage = rampedDamage(operationDuration);
    return totalDamage >= hp ? 1e30 / (1 + hp / metrics.dps) + survivalSeconds : totalDamage;
  }
  if (options.objective === 'bloodcells') return rampedDamage(operationDuration) * jellyCurrencyMultiplier(S, options.fever);
  if (options.objective === 'exp') return metrics.attacksPerSecond * operationDuration * jellyCellExpMultiplier(S, options.fever);
  if (options.objective === 'survival') {
    return metrics.cells.reduce((sum, cell) => sum + cell.slots.length + (cell.type === 4 ? 2 * cell.slots.length : 0), 0);
  }
  return metrics.dps;
}

function simulatedObjectiveScore(simulation, objective) {
  if (!simulation?.valid) return -Infinity;
  if (objective === 'clear') {
    const clearTime = simulation.meanTime || 1e9;
    return simulation.clearProbability * 1e15 - clearTime * 1e6 + simulation.meanDamage;
  }
  if (objective === 'bloodcells') return simulation.meanBloodcells;
  if (objective === 'exp') return simulation.meanCellExp;
  if (objective === 'survival') return simulation.meanCriticalTime * 1e9 + simulation.meanDamage;
  return simulation.meanDamage;
}

function proxyFeverType(layout, S, objective, obstruction, requested) {
  const candidates = availableFeverTypes(S, requested);
  let best = candidates[0];
  let bestScore = -Infinity;
  for (const fever of candidates) {
    const rampPct = fever === 0 ? jellyBossTime(obstruction) / 2 : 0;
    const metrics = jellyLayoutMetrics(layout, S, { fever, feverRampPct: rampPct });
    let score = metrics.dps;
    if (objective === 'bloodcells') score *= jellyCurrencyMultiplier(S, fever);
    if (objective === 'exp') score = metrics.attacksPerSecond * jellyCellExpMultiplier(S, fever);
    if (score > bestScore) {
      best = fever;
      bestScore = score;
    }
  }
  return best;
}

export function optimizeJellyLayout(S, options = {}) {
  const objective = options.objective || 'dps';
  const obstruction = options.obstruction == null ? jellyProgress(S).obstruction : Math.max(0, Math.floor(n(options.obstruction)));
  const saved = options.layout || jellyLayoutFromSave(S);
  const fever = proxyFeverType(saved, S, objective, obstruction, options.fever);
  const types = Array.from({ length: jellyUnitsOwned(S) }, (_, type) => type);
  const unlockedSet = jellyUnlockedSlots(S);
  const unlocked = Array.from(unlockedSet).sort((a, b) => a - b);
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
    options.screeningCandidateCount == null ? finalistCount * 2 : n(options.screeningCandidateCount)
  )));
  const moveCount = layout => jellyLayoutMoves(saved, layout).length;
  const compositionKey = layout => {
    const counts = new Array(8).fill(0);
    for (const type of Object.values(layout)) if (type >= 0 && type < counts.length) counts[type]++;
    return counts.join(',');
  };
  const compareProxy = (a, b) => b.score - a.score || jellyLayoutKey(a.layout).localeCompare(jellyLayoutKey(b.layout));
  const selectDiverse = (candidates, limit = beamWidth) => {
    candidates.sort(compareProxy);
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
  const scoreLayout = layout => proxyObjectiveScore(layout, S, { ...options, objective, fever });
  const addWithoutReplacement = (layout, placement) => {
    const next = jellyPlaceCell(layout, placement.anchor, placement.type, S);
    return next && Object.keys(next).length === Object.keys(layout).length + 1 ? next : null;
  };
  const placementByType = types.map(type => placements.filter(placement => placement.type === type));
  const anchorOrders = [
    unlocked,
    unlocked.slice().sort((a, b) => (PROXIMITY_ANCHORS.has(b) ? 1 : 0) - (PROXIMITY_ANCHORS.has(a) ? 1 : 0) || b % JELLY_COLS - a % JELLY_COLS || a - b),
    unlocked.slice().sort((a, b) => b % JELLY_COLS - a % JELLY_COLS || Math.abs(Math.floor(a / JELLY_COLS) - 4.5) - Math.abs(Math.floor(b / JELLY_COLS) - 4.5) || a - b),
  ];
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
  const seedCandidates = [{ layout: {}, score: scoreLayout({}) }];
  const seedKeys = new Set([jellyLayoutKey({})]);
  for (const typeOrder of typeOrders) {
    for (const anchors of anchorOrders) {
      const layout = greedyCompositionSeed(typeOrder, anchors);
      const key = jellyLayoutKey(layout);
      if (seedKeys.has(key)) continue;
      seedKeys.add(key);
      seedCandidates.push({ layout, score: scoreLayout(layout) });
    }
  }
  let beam = selectDiverse(seedCandidates);
  const seen = new Set(seedKeys);
  let evaluated = seedCandidates.length;
  const searchRounds = iterations + savedRefinementRounds + refinementRounds;
  options.onProgress?.({ phase: 'Preparing empty-board search', completed: 0, total: searchRounds + finalistCount });
  for (let iteration = 0; iteration < iterations; iteration++) {
    const candidates = beam.slice();
    for (const candidate of beam) {
      for (const placement of placements) {
        const layout = addWithoutReplacement(candidate.layout, placement);
        if (!layout) continue;
        const key = jellyLayoutKey(layout);
        if (seen.has(key)) continue;
        seen.add(key);
        candidates.push({ layout, score: scoreLayout(layout) });
        evaluated++;
      }
    }
    const next = selectDiverse(candidates);
    const unchanged = next.length === beam.length && next.every((candidate, index) => jellyLayoutKey(candidate.layout) === jellyLayoutKey(beam[index].layout));
    beam = next;
    options.onProgress?.({ phase: `Building from empty ${iteration + 1}/${iterations}`, completed: iteration + 1, total: searchRounds + finalistCount });
    if (unchanged) break;
  }

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
    const next = selectDiverse(candidates, savedBeamWidth);
    const unchanged = next.length === savedBeam.length && next.every((candidate, index) => jellyLayoutKey(candidate.layout) === jellyLayoutKey(savedBeam[index].layout));
    savedBeam = next;
    options.onProgress?.({
      phase: `Exploring saved-board relocations ${refinement + 1}/${savedRefinementRounds}`,
      completed: iterations + refinement + 1,
      total: searchRounds + finalistCount,
    });
    if (unchanged) break;
  }

  beam = selectDiverse([...beam, ...savedBeam]);
  for (const key of savedSeen) seen.add(key);
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
    const next = selectDiverse(candidates);
    const unchanged = next.length === beam.length && next.every((candidate, index) => jellyLayoutKey(candidate.layout) === jellyLayoutKey(beam[index].layout));
    beam = next;
    options.onProgress?.({ phase: `Exhaustive local refinement ${refinement + 1}/${refinementRounds}`, completed: iterations + savedRefinementRounds + refinement + 1, total: searchRounds + finalistCount });
    if (unchanged) break;
  }
  if (!beam.length) beam = [{ layout: saved, score: scoreLayout(saved) }];
  const simulationTrials = Math.max(4, Math.min(256, Math.floor(n(options.simulationTrials) || 32)));
  const screeningTrials = Math.max(4, Math.min(simulationTrials, Math.floor(
    options.screeningTrials == null ? Math.min(8, Math.max(4, Math.ceil(simulationTrials / 4))) : n(options.screeningTrials)
  )));
  let screeningPool = selectDiverse(beam.slice(), screeningCandidateCount);
  const savedKey = jellyLayoutKey(saved);
  if (!screeningPool.some(candidate => jellyLayoutKey(candidate.layout) === savedKey)) {
    screeningPool.push({
      layout: saved,
      score: scoreLayout(saved),
    });
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
  const screenCandidate = candidate => {
    const simulation = jellyLayoutKey(candidate.layout) === savedKey
      ? screenPolicy
      : simulateJellyTrials(candidate.layout, S, {
        ...options,
        obstruction,
        fever: screenPolicy.fever,
        roidTiming: screenPolicy.roidTiming,
        revivePolicy: screenPolicy.revivePolicy,
        trials: screeningTrials,
        seed: Math.floor(n(options.seed) || 1),
      });
    return { ...candidate, screening: simulation, screeningScore: simulatedObjectiveScore(simulation, objective) };
  };
  let screened = screeningPool.map((candidate, index) => {
    options.onProgress?.({
      phase: `Screening candidate ${index + 1}/${screeningPool.length}`,
      completed: searchRounds + (index + 1) / Math.max(1, screeningPool.length),
      total: searchRounds + 2 + finalistCount,
    });
    return screenCandidate(candidate);
  });
  screened.sort((a, b) => b.screeningScore - a.screeningScore || compareProxy(a, b));

  const feedbackBudget = Math.max(24, beamWidth * 12);
  const feedbackCandidates = [];
  const feedbackKeys = new Set(screened.map(candidate => jellyLayoutKey(candidate.layout)));
  const feedbackLeaders = screened.slice(0, Math.min(4, screened.length));
  for (const leader of feedbackLeaders) {
    for (const rawAnchor of Object.keys(leader.layout)) {
      const anchor = Number(rawAnchor);
      const type = Number(leader.layout[rawAnchor]);
      const removed = jellyRemoveCell(leader.layout, anchor);
      for (const placement of placementByType[type] || []) {
        if (placement.anchor === anchor) continue;
        const relocated = jellyPlaceCell(removed, placement.anchor, type, S);
        if (!relocated) continue;
        const key = jellyLayoutKey(relocated);
        if (feedbackKeys.has(key)) continue;
        feedbackKeys.add(key);
        feedbackCandidates.push({ layout: relocated, score: scoreLayout(relocated) });
        evaluated++;
        if (feedbackCandidates.length >= feedbackBudget) break;
      }
      if (feedbackCandidates.length >= feedbackBudget) break;
    }
    if (feedbackCandidates.length >= feedbackBudget) break;
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
        if (!swapped) continue;
        const key = jellyLayoutKey(swapped);
        if (feedbackKeys.has(key)) continue;
        feedbackKeys.add(key);
        feedbackCandidates.push({ layout: swapped, score: scoreLayout(swapped) });
        evaluated++;
        if (feedbackCandidates.length >= feedbackBudget) break;
      }
      if (feedbackCandidates.length >= feedbackBudget) break;
    }
  }
  const feedbackPool = feedbackCandidates.length
    ? selectDiverse(feedbackCandidates, Math.min(Math.max(2, Math.ceil(finalistCount / 2)), feedbackCandidates.length))
    : [];
  screened.push(...feedbackPool.map(screenCandidate));
  screened.sort((a, b) => b.screeningScore - a.screeningScore || compareProxy(a, b));

  const screeningFeatureKey = candidate => {
    const metrics = jellyLayoutMetrics(candidate.layout, S, { fever: screenPolicy.fever });
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
  if (!finalistKeys.has(savedKey)) {
    finalists.push(screened.find(candidate => jellyLayoutKey(candidate.layout) === savedKey) || screenCandidate({
      layout: saved,
      score: scoreLayout(saved),
    }));
  }

  const reranked = finalists.map((candidate, index) => {
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
      }),
    });
    return { ...candidate, simulation, simulatedScore: simulatedObjectiveScore(simulation, objective) };
  }).sort((a, b) => b.simulatedScore - a.simulatedScore
    || b.score - a.score
    || moveCount(a.layout) - moveCount(b.layout)
    || jellyLayoutKey(a.layout).localeCompare(jellyLayoutKey(b.layout)));
  const savedFinalist = reranked.find(candidate => jellyLayoutKey(candidate.layout) === savedKey);
  const best = savedFinalist && savedFinalist.simulatedScore >= reranked[0].simulatedScore
    ? savedFinalist
    : reranked[0];
  options.onProgress?.({ phase: 'Layout optimization complete', completed: searchRounds + 2 + finalists.length, total: searchRounds + 2 + finalists.length });
  return {
    objective,
    fever: best.simulation.fever,
    savedLayout: saved,
    layout: best.layout,
    score: best.simulatedScore,
    proxyScore: best.score,
    metrics: jellyLayoutMetrics(best.layout, S, { fever: best.simulation.fever }),
    operation: best.simulation,
    savedOperation: savedFinalist?.simulation || null,
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
      compositionSeeds: seedCandidates.length,
      feedbackCandidates: feedbackCandidates.length,
    },
  };
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
