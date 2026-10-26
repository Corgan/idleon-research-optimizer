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
  jellyUpgradePerLevel,
} from '../../data/w7/jelly-operator.js';
import { SHAPE_BONUS_PCT, SHAPE_NAMES, gridBonusPerLv } from '../../data/w7/research.js';
import { gbWith } from './research-math.js';
import { computePaletteBonus, legendPTSbonus } from './spelunking.js';
import { isUpgradeDoubled } from './menagerie.js';
import { rogBonusQTY } from './sushi.js';
import { arcadeBonus } from '../w2/arcade.js';
import { fmtVal } from '../../../renderers/format.js';
import { eventShopOwned } from '../../../game-helpers.js';

const STARTING_SLOTS = [77, 95, 78, 96];
const FIRST_CLEAR_SLOTS = [76, 94];
const SECOND_CLEAR_SLOTS = [75, 93];
const PROXIMITY_ANCHORS = new Set([43, 44, 45, 46, 60, 65, 78, 83, 96, 101, 114, 119, 133, 134, 135, 136]);
const FEVER_MODE_NAMES = ['COLD', 'RASH', 'SEPSIS', 'NAUSEA', 'RABIES', 'PLAGUE'];

// CurrencyMulti innermost pool adds a flat +11% (2026-10-16 build).
export const JELLY_BASE_BLOODCELL_BONUS_PCT = 11;
// Stronkroid: GenINFO[238] is set to SteroidTimeTOT (300) and drains 0.61 per frame while > 0.
export const JELLY_ROID_TIME_TOTAL = 300;
export const JELLY_ROID_DECREMENT_PER_FRAME = 0.61;
export const JELLY_ROID_ACTIVE_FRAMES = (() => {
  let remaining = JELLY_ROID_TIME_TOTAL;
  let frames = 0;
  while (remaining > 0) {
    remaining -= JELLY_ROID_DECREMENT_PER_FRAME;
    if (remaining > 0) frames++;
  }
  return frames;
})();
export const JELLY_ROID_DURATION_SECONDS = JELLY_ROID_ACTIVE_FRAMES / 60;

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

// Menagerie Upgrade Doublers: Spelunk[53] lists Jelly upgrade indices whose quantity is doubled.
export function jellyUpgradeDoubled(S, id) {
  return isUpgradeDoubled(S, 'jelly', Math.round(n(id)));
}

export function jellyUpgradeQuantity(S, id) {
  const perLevel = n(jellyUpgradePerLevel(id));
  return jellyUpgradeDoubled(S, id)
    ? 2 * perLevel * jellyUpgradeLevel(S, id)
    : perLevel * jellyUpgradeLevel(S, id);
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
  const doubled = jellyUpgradeDoubled(S, id);
  const doublerMulti = doubled ? 2 : 1;
  const step = n(data.perLevel) * doublerMulti;
  let perLevelText = `+${step} per level`;
  if (data.maxLevel === 1 && data.perLevel === 1) perLevelText = 'One-time unlock';
  else if (id === 16) perLevelText = `+${step} Fever mode${step === 1 ? '' : 's'} per level`;
  else if ([8, 9, 15, 35].includes(id)) perLevelText = `+${step} use${step === 1 ? '' : 's'} per level`;
  else if (id === 17) perLevelText = `+${step} percentage point${step === 1 ? '' : 's'} per cell level`;
  else if (id === 29) perLevelText = `+${displayNumber(step / 100)}x Stronkroid speed per level, starting at 1.51x`;
  else if (id === 34) perLevelText = `+${step} cost-divisor point${step === 1 ? '' : 's'} per level; effective reduction is diminishing`;
  else if (id === 38) perLevelText = `+${step}% of best operation Bloodcells daily per level`;
  else if (data.description.includes('{') || data.description.includes('}')) perLevelText = `+${step}% per level`;
  if (doubled && perLevelText !== 'One-time unlock') perLevelText += ' (Upgrade Doubler 2x)';

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
    description = description.replace('1.01x', `${Math.round(100 + (1 + jellyUpgradeQuantity(S, 17))) / 100}x`);
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
  return { ...data, level, quantity, doubled, doublerMulti, effectText, perLevelText, description, sourceNote };
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

// Legend Talent 41 grants up to three extra plot tokens: min(3, ceil(Spelunk[18][41] / 2)).
export function jellyLegendSlotTokens(S) {
  return Math.min(3, Math.ceil(n(S?.spelunkData?.[18]?.[41]) / 2));
}

export function jellySlotPurchasesLeft(S) {
  const bundle = S?.bundlesData?.ban_j ? 1 : 0;
  return Math.round(
    jellyUpgradeQuantity(S, 9)
    + (jellyUpgradeQuantity(S, 8)
      + (jellyCompletionBonus(44, S)
        + (bundle + (jellyLegendSlotTokens(S) + 3 * eventShopOwned(57, S?.cachedEventShopStr)))))
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
  const unitsOwned = jellyUnitsOwned(S);
  const occupied = new Set();
  let viruses = 0;
  for (const [rawAnchor, rawType] of Object.entries(layout || {})) {
    const anchor = Number(rawAnchor);
    const type = Number(rawType);
    if (!Number.isInteger(anchor) || anchor < 0 || anchor >= JELLY_SIZE) return { valid: false, reason: `Invalid anchor ${rawAnchor}` };
    if (!Number.isInteger(type) || type < 0 || type >= unitsOwned) return { valid: false, reason: `Cell ${type} is locked` };
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
  return Math.max(10, 120 - Math.max(0, n(index)) / 6 * 20);
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
  if (effect === 2) return 300;
  if (effect === 1 || effect === 3) return 100;
  if (effect === 4) return part === 1 ? 25 : 50;
  if (effect === 5) return 40;
  return 0;
}

// ----- Research grid shape overrides -----
// Jelly reads three Research grid nodes. 185 and 187 are scaled by the shape covering them,
// so a player who only drags a shape onto them while actively running an operation exports a
// save that understates their real operating bonuses. 186 uses the raw purchased level and is
// deliberately shape-immune, so it is never overridable here.
export const JELLY_SHAPE_NODES = [
  { node: 185, name: 'Cellular Warfare', affects: 'Cell Damage' },
  { node: 187, name: 'Jelly Operator Linguistics', affects: 'Bloodcell gain' },
];

export function jellyShapeChoices() {
  return SHAPE_NAMES.map((name, index) => ({ index, name, bonusPct: n(SHAPE_BONUS_PCT[index]) }));
}

function _normalizeShapeIndex(raw) {
  if (raw == null) return -1;
  const idx = Math.floor(n(raw));
  return idx < 0 || idx >= SHAPE_NAMES.length ? -1 : idx;
}

export function jellySavedShape(S, node) {
  return _normalizeShapeIndex(S?.shapeOverlay?.[node]);
}

export function jellyEffectiveShape(S, node) {
  const override = S?.jellyShapeOverrides?.[node];
  return override == null ? jellySavedShape(S, node) : _normalizeShapeIndex(override);
}

// jellyLayoutMetrics can request the Cell Damage multiplier once per candidate layout, so the
// patched overlay is memoized per context instead of reallocating the grid array each call.
const _jellyOverlayCache = new WeakMap();

function jellyShapeOverlay(S) {
  const saved = S?.shapeOverlay || [];
  if (!S || typeof S !== 'object' || !S.jellyShapeOverrides) return saved;
  let signature = '';
  for (const entry of JELLY_SHAPE_NODES) signature += `${entry.node}:${jellyEffectiveShape(S, entry.node)};`;
  const cached = _jellyOverlayCache.get(S);
  if (cached && cached.signature === signature && cached.saved === saved) return cached.overlay;
  const overlay = saved.slice();
  for (const entry of JELLY_SHAPE_NODES) overlay[entry.node] = jellyEffectiveShape(S, entry.node);
  _jellyOverlayCache.set(S, { signature, saved, overlay });
  return overlay;
}

export function jellyGridBonus(S, node) {
  return gbWith(S?.gridLevels || [], jellyShapeOverlay(S), node, { abm: n(S?.allBonusMulti) || 1 });
}

export function jellyShapeSummary(S) {
  return JELLY_SHAPE_NODES.map(entry => {
    const savedShape = jellySavedShape(S, entry.node);
    const effectiveShape = jellyEffectiveShape(S, entry.node);
    const savedBonus = gbWith(S?.gridLevels || [], S?.shapeOverlay || [], entry.node, { abm: n(S?.allBonusMulti) || 1 });
    return {
      ...entry,
      level: Math.floor(n(S?.gridLevels?.[entry.node])),
      perLevelPct: n(gridBonusPerLv(entry.node)),
      savedShape,
      effectiveShape,
      overridden: effectiveShape !== savedShape,
      savedName: savedShape < 0 ? 'No shape' : SHAPE_NAMES[savedShape],
      effectiveName: effectiveShape < 0 ? 'No shape' : SHAPE_NAMES[effectiveShape],
      shapeBonusPct: effectiveShape < 0 ? 0 : n(SHAPE_BONUS_PCT[effectiveShape]),
      savedBonusPct: savedBonus,
      bonusPct: jellyGridBonus(S, entry.node),
    };
  });
}

// Legend Talent 41 Jelly damage percentage (source LegendPTS_bonus(41)).
export function jellyLegendDamageBonus(S) {
  return n(legendPTSbonus(41, S || {}));
}

// Artifact 40 (Bloodclot) reads the raw artifact tier: 1 + 10 * Sailing[3][40] / 100.
export function jellyBloodclotTier(S) {
  return n(S?.sailingData?.[3]?.[40]);
}

export function jellyCellDamageMultiplier(S, options = {}) {
  const fever = options.fever;
  const grid185 = jellyGridBonus(S, 185);
  const additive = jellyUpgradeQuantity(S, 18)
    + (jellyUpgradeQuantity(S, 19)
      + (jellyUpgradeQuantity(S, 20)
        + computePaletteBonus(1, S)));
  return (1 + additive / 100)
    * (1 + jellyLegendDamageBonus(S) / 100)
    * (1 + 10 * jellyBloodclotTier(S) / 100)
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
  const grid187 = jellyGridBonus(S, 187);
  const atom15 = n(S?.atomsData?.[15]) * n(AtomInfo?.[15]?.[4]);
  const beforeDps = (1 + (
    jellyUpgradeQuantity(S, 23)
    + (jellyUpgradeQuantity(S, 24)
      + (jellyUpgradeQuantity(S, 25)
        + (jellyUpgradeQuantity(S, 33) * totalCellLevel + JELLY_BASE_BLOODCELL_BONUS_PCT)))
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
    event56: 1 + eventShopOwned(56, S?.cachedEventShopStr),
    atom15: 1 + atom15 / 100,
  };
}

function _jellyCurrencyMultiplierFromFactors(factors, bestDps) {
  return factors.beforeDps
    * jellyBestDpsMultiplierFromValue(bestDps)
    * factors.upgrade26
    * factors.upgrade27
    * factors.event56
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
  const gridBonus = jellyGridBonus(S, 185);
  const additive = [
    { label: jellyUpgradeData(18)?.name || 'Cell Destruction I', value: jellyUpgradeQuantity(S, 18), unit: '%', unlockId: 18 },
    { label: jellyUpgradeData(19)?.name || 'Cell Destruction II', value: jellyUpgradeQuantity(S, 19), unit: '%', unlockId: 19 },
    { label: jellyUpgradeData(20)?.name || 'Cell Destruction III', value: jellyUpgradeQuantity(S, 20), unit: '%', unlockId: 20 },
    { label: 'Spelunking Palette bonus', value: computePaletteBonus(1, S), unit: '%' },
  ];
  const legendDamage = jellyLegendDamageBonus(S);
  const bloodclotTier = jellyBloodclotTier(S);
  const feverValue = jellyFeverBonus(S, 0, 0, options.feverRampPct, fever)
    + jellyFeverBonus(S, 1, 0, 0, fever)
    + jellyFeverBonus(S, 4, 0, 0, fever);
  const factors = [
    { label: 'Additive Cell Damage', value: 1 + additive.reduce((sum, row) => sum + row.value, 0) / 100, unit: 'x', children: additive },
    {
      label: 'Legend Talent 41',
      value: 1 + legendDamage / 100,
      unit: 'x',
      children: [
        { label: 'Legend 41 points', value: n(S?.spelunkData?.[18]?.[41]), unit: '' },
        { label: 'Legend bonus', value: legendDamage, unit: '%' },
      ],
    },
    {
      label: 'Bloodclot artifact',
      value: 1 + 10 * bloodclotTier / 100,
      unit: 'x',
      children: [{ label: 'Artifact 40 tier (10% per tier)', value: bloodclotTier, unit: '' }],
    },
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
  const gridBonus = jellyGridBonus(S, 187);
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
    { label: 'Base Bloodcell bonus', value: JELLY_BASE_BLOODCELL_BONUS_PCT, unit: '%' },
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
    { label: 'Big Clot', value: 1 + eventShopOwned(56, S?.cachedEventShopStr), unit: 'x' },
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
  return _jellyLayoutMetrics(layout, S, options, false);
}

function _createJellyScoreScratch() {
  const cells = [];
  const counts = new Float64Array(9);
  const rawCounts = new Float64Array(9);
  return {
    cellPool: Array.from({ length: JELLY_SIZE }, () => ({
      anchor: 0, type: 0, slots: null, organelle: 1, proximity: 1,
      damage: 0, attacksPerSecond: 0, dps: 0, survival: 1,
    })),
    infected: new Uint8Array(JELLY_SIZE),
    cadences: Array(36).fill(null),
    projectedAttacks: new Float64Array(9),
    result: { valid: true, reason: '', cells, counts, rawCounts,
      infectedSlots: 0, damagePassive: 1, speedPassive: 1, virusMultiplier: 1, dps: 0 },
  };
}

function _jellyLayoutMetrics(layout, S, options, scoreOnly) {
  if (!options.assumeValid) {
    const validation = jellyValidateLayout(layout, S);
    if (!validation.valid) return { valid: false, reason: validation.reason, dps: 0, cells: [] };
  }
  const context = options._metricContext || {};
  const scratch = scoreOnly ? context.scoreScratch || _createJellyScoreScratch() : null;
  const geometry = context.geometryFor?.(layout);
  const entries = geometry?.entries || Object.entries(layout)
    .map(([anchor, type]) => ({ anchor: Number(anchor), type: Number(type) }))
    .sort((a, b) => a.anchor - b.anchor);
  const rawCounts = scratch ? scratch.result.rawCounts : geometry ? geometry.rawCounts.slice() : new Array(9).fill(0);
  if (scratch) {
    if (geometry) rawCounts.set(geometry.rawCounts);
    else rawCounts.fill(0);
  }
  if (!geometry) for (const cell of entries) rawCounts[cell.type]++;
  const counts = scratch ? scratch.result.counts : rawCounts.slice();
  if (scratch) counts.set(rawCounts);
  const countBonusUnlocked = context.countBonusUnlocked ?? jellyUpgradeQuantity(S, 14) >= 1;
  if (countBonusUnlocked) {
    for (let type = 0; type < counts.length; type++) if (type !== 5) counts[type] += Math.floor(counts[type] / 3);
  }

  const damagePassive = (1 + 200 * counts[7] / 100) * (1 + (50 * counts[2] + 10 * counts[0]) / 100);
  const mitochondriaSpeed = 1 + 50 * counts[6] / 100;
  const organellePlasmidSpeed = 1 + (25 * counts[3] + 15 * counts[1]) / 100;
  const speedPassive = mitochondriaSpeed * organellePlasmidSpeed;
  const unitCooldownMultiplier = 1 / mitochondriaSpeed * (1 / organellePlasmidSpeed);
  const organelleReach = geometry?.organelleReach || new Set();
  if (!geometry) for (const cell of entries) {
    if (cell.type !== 3) continue;
    _organelleReachSlots(cell.anchor).forEach(slot => organelleReach.add(slot));
  }

  const virusReach = geometry?.virusReach || new Set();
  if (!geometry) for (const cell of entries) {
    if (cell.type !== 5) continue;
    const anchor = cell.anchor;
    virusReach.add(anchor - JELLY_COLS);
    virusReach.add(anchor + JELLY_COLS);
    if (anchor % JELLY_COLS > 0) virusReach.add(anchor - 1);
    if (anchor % JELLY_COLS < JELLY_COLS - 1) virusReach.add(anchor + 1);
  }

  const infectedSlots = scratch ? null : new Set();
  if (scratch) scratch.infected.fill(0);
  let infectedCount = 0;
  for (const cell of entries) {
    const slots = context.slotsFor?.(cell.anchor, cell.type) || jellyFootprintSlots(cell.anchor, cell.type) || [];
    let infected = false;
    for (const slot of slots) if (virusReach.has(slot)) { infected = true; break; }
    if (infected) for (const slot of slots) {
      if (scratch) {
        if (!scratch.infected[slot]) { scratch.infected[slot] = 1; infectedCount++; }
      } else infectedSlots.add(slot);
    }
  }
  if (!scratch) infectedCount = infectedSlots.size;
  const virusMultiplier = 1 + infectedCount / 10;
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
  const cadences = context.cadenceFor ? scratch?.cadences || [] : null;
  if (scratch && cadences) cadences.fill(null);

  const cells = scratch ? scratch.result.cells : [];
  cells.length = entries.length;
  let totalDps = 0;
  for (let index = 0; index < entries.length; index++) {
    const cell = entries[index];
    const slots = context.slotsFor?.(cell.anchor, cell.type) || jellyFootprintSlots(cell.anchor, cell.type) || [];
    let organelle = 1;
    for (const slot of slots) if (organelleReach.has(slot)) { organelle = organelleMultiplier; break; }
    const proximity = proximityLevel >= 1 && PROXIMITY_ANCHORS.has(cell.anchor) ? proximityMultiplier : 1;
    const level = Math.max(0, Math.floor(n(options.cellLevels?.[cell.type]
      ?? context.cellLevels?.[cell.type] ?? jellyCellLevel(S, cell.type))));
    const damage = CELL_BASE_DAMAGE[cell.type]
      * cellDamage
      * damagePassive
      * (1 + level * cellLevelDamage / 100)
      * (1 + n(options.amoebaStacks) / 100)
      * virusMultiplier
      * proximity;
    const cooldownProgress = CELL_BASE_COOLDOWNS[cell.type] * (1 / cellSpeed) * unitCooldownMultiplier;
    const progressPerFrame = 0.65 * roidMultiplier * organelle * proximity;
    const cadenceKey = cell.type * 4 + (organelle !== 1 ? 2 : 0) + (proximity !== 1 ? 1 : 0);
    const cadence = cadences?.[cadenceKey] || (context.cadenceFor
      ? context.cadenceFor(cell.type, cooldownProgress, progressPerFrame)
      : jellyAttackCadence(CELL_BASE_COOLDOWNS[cell.type], { cooldownProgress, progressPerFrame }));
    if (cadences) cadences[cadenceKey] = cadence;
    const dps = damage * cadence.attacksPerSecond;
    totalDps += dps;
    if (scratch) {
      const row = scratch.cellPool[index];
      row.anchor = cell.anchor;
      row.type = cell.type;
      row.slots = slots;
      row.organelle = organelle;
      row.proximity = proximity;
      row.damage = damage;
      row.attacksPerSecond = cadence.attacksPerSecond;
      row.dps = dps;
      cells[index] = row;
    } else cells[index] = {
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
      dps,
    };
  }
  if (scratch) {
    const result = scratch.result;
    result.infectedSlots = infectedCount;
    result.damagePassive = damagePassive;
    result.speedPassive = speedPassive;
    result.virusMultiplier = virusMultiplier;
    result.dps = totalDps;
    return result;
  }
  return {
    valid: true,
    reason: '',
    counts,
    rawCounts,
    infectedSlots: infectedCount,
    damagePassive,
    speedPassive,
    virusMultiplier,
    cells,
    dps: totalDps,
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

export function jellyOrganelleVirusCoupledCandidates(layout, S, options = {}) {
  const organelleAnchors = Object.keys(layout || {})
    .map(Number)
    .filter(anchor => Number(layout[anchor]) === 3);
  const virusAnchors = Object.keys(layout || {})
    .map(Number)
    .filter(anchor => Number(layout[anchor]) === 5);
  if (!organelleAnchors.length || !virusAnchors.length) return { layouts: [], nodes: 0 };
  const unlocked = jellyUnlockedSlots(S);
  const placements = type => Array.from(unlocked)
    .sort((a, b) => a - b)
    .filter(anchor => {
      const slots = jellyFootprintSlots(anchor, type);
      return slots && slots.every(slot => unlocked.has(slot));
    });
  const organellePlacements = placements(3);
  const virusPlacements = placements(5);
  const originalCount = Object.keys(layout).length;
  const nodeBudget = Math.max(1, Math.min(500000, Math.floor(n(options.nodeBudget) || 100000)));
  const retainLimit = Math.max(1, Math.min(256, Math.floor(n(options.retainLimit) || 96)));
  const candidates = [];
  const seen = new Set();
  let nodes = 0;
  const retain = candidate => {
    const key = jellyLayoutKey(candidate);
    if (seen.has(key)) return;
    seen.add(key);
    const metrics = jellyLayoutMetrics(candidate, S, { assumeValid: true });
    candidates.push({ layout: candidate, infectedSlots: metrics.infectedSlots, dps: metrics.dps, key });
    candidates.sort((a, b) => b.infectedSlots - a.infectedSlots || b.dps - a.dps || a.key.localeCompare(b.key));
    if (candidates.length > retainLimit) {
      const removed = candidates.pop();
      seen.delete(removed.key);
    }
  };
  for (const organelleAnchor of organelleAnchors) {
    const withoutOrganelle = jellyRemoveCell(layout, organelleAnchor);
    for (const organellePlacement of organellePlacements) {
      if (nodes >= nodeBudget) break;
      const delta = organellePlacement - organelleAnchor;
      const adjacentShift = Math.abs(delta) === JELLY_COLS
        || (Math.abs(delta) === 1
          && Math.floor(organellePlacement / JELLY_COLS) === Math.floor(organelleAnchor / JELLY_COLS));
      if (!adjacentShift) continue;
      const shifted = jellyPlaceCell(withoutOrganelle, organellePlacement, 3, S);
      nodes++;
      if (!shifted || Object.keys(shifted).length !== originalCount) continue;
      for (const virusAnchor of Object.keys(shifted).map(Number).filter(anchor => Number(shifted[anchor]) === 5)) {
        const withoutVirus = jellyRemoveCell(shifted, virusAnchor);
        for (const virusPlacement of virusPlacements) {
          if (nodes >= nodeBudget) break;
          if (virusPlacement === virusAnchor) continue;
          const coupled = jellyPlaceCell(withoutVirus, virusPlacement, 5, S);
          nodes++;
          if (!coupled || Object.keys(coupled).length !== originalCount) continue;
          retain(coupled);
        }
      }
    }
    if (nodes >= nodeBudget) break;
  }
  return { layouts: candidates.map(row => row.layout), nodes };
}

function seededRandom(seed, savedState) {
  let state = savedState ?? (Math.floor(n(seed)) >>> 0);
  const random = function () {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
  random.state = () => state;
  random.advance = count => {
    const next = state + 0x6D2B79F5 * count;
    if (Number.isSafeInteger(state) && Number.isSafeInteger(next)) state = next;
    else for (let index = 0; index < count; index++) state += 0x6D2B79F5;
  };
  return random;
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

const _jellyProjectileGeometryCache = new Map();
function _jellyProjectileGeometry(anchor, type) {
  const key = `${anchor}:${type}`;
  let geometry = _jellyProjectileGeometryCache.get(key);
  if (!geometry) {
    const anchorX = 171 + 37 * (anchor % JELLY_COLS);
    const anchorY = 61 + 37 * Math.floor(anchor / JELLY_COLS);
    const duration = Math.trunc(1000 * (0.6 + Math.hypot(501 - anchorX, 245 - anchorY) / 400)) / 1000;
    const visual = jellyProjectileData(type);
    const minX = Math.round(anchorX + 18 * visual.offsetX - visual.spread);
    const minY = Math.round(anchorY + 18 * visual.offsetY - visual.spread);
    const width = Math.round(anchorX + 18 * visual.offsetX + visual.spread) - minX + 1;
    const height = Math.round(anchorY + 18 * visual.offsetY + visual.spread) - minY + 1;
    const frames = Math.max(1, Math.ceil(duration * 60));
    geometry = {
      anchorX, anchorY, duration, visual, minX, minY, width, height, frames,
      delays: frames < 255 ? new Uint8Array(width * height) : null,
    };
    _setJellySearchCache(_jellyProjectileGeometryCache, key, geometry, 512);
  }
  return geometry;
}

function _jellyProjectileHitFrame(geometry, random) {
  const { anchorX, anchorY, duration, visual, delays, minX, minY, width, height, frames } = geometry;
  const startX = Math.round(anchorX + 18 * visual.offsetX + visual.spread * (2 * random() - 1));
  const startY = Math.round(anchorY + 18 * visual.offsetY + visual.spread * (2 * random() - 1));
  const xIndex = startX - minX, yIndex = startY - minY;
  const cached = delays && xIndex >= 0 && xIndex < width && yIndex >= 0 && yIndex < height;
  const index = yIndex * width + xIndex;
  if (cached && delays[index]) return delays[index] - 1;
  let arrival = 0;
  if (!(Math.abs(504 - startX) < 25 && Math.abs(243 - startY) < 25)) {
    // Back-In first moves away, then monotonically toward an endpoint inside the box.
    // A shot starting outside therefore has one false-to-true collision boundary.
    let first = 1, last = frames;
    while (first < last) {
      const frame = Math.floor((first + last) / 2);
      const eased = backIn(Math.min(1, frame / 60 / duration));
      const x = startX + (484 - startX) * eased;
      const y = startY + (228 - startY) * eased;
      if (Math.abs(504 - x) < 25 && Math.abs(243 - y) < 25) last = frame;
      else first = frame + 1;
    }
    arrival = last;
  }
  // Zero means unmeasured; a shot already inside the hit box stores one.
  if (cached) delays[index] = arrival + 1;
  return arrival;
}

export function jellyProjectileHitDelay(anchor, type, random = () => 0.5) {
  return _jellyProjectileHitFrame(_jellyProjectileGeometry(anchor, type), random) / 60;
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

function _jellyFiringPlan(cooldown, increment) {
  if (!Number.isFinite(cooldown) || !Number.isFinite(increment) || increment <= 0) return null;
  const progress = [0];
  do {
    progress.push(progress[progress.length - 1] + increment);
    if (progress.length > 4097) return null;
  } while (progress[progress.length - 1] < cooldown);
  return { increment, progress: Float64Array.from(progress), period: progress.length - 1 };
}

function _createJellyFiringCalendar(cells, plans, cellProgress, alive, firstFrame, ringSize) {
  const words = Math.ceil(cells.length / 32);
  const due = new Uint32Array(words * ringSize);
  const beganAt = new Float64Array(cells.length).fill(firstFrame);
  const initial = cellProgress.slice();
  let active = null;
  let word = 0;
  let bits = 0;
  let bucket = 0;
  const at = (index, frame) => {
    const steps = frame - beganAt[index];
    const plan = plans[index][Number(active)];
    if (!steps) return initial[index];
    if (initial[index] === 0) return plan.progress[steps];
    let progress = initial[index];
    for (let step = 0; step < steps; step++) progress += plan.increment;
    return progress;
  };
  const schedule = (index, frame) => {
    const offset = (frame % ringSize) * words + (index >>> 5);
    due[offset] |= 1 << (index & 31);
  };
  return {
    materialize(frame) {
      for (let index = 0; index < cells.length; index++) {
        if (alive[cells[index].anchor]) cellProgress[index] = at(index, frame);
      }
      return cellProgress;
    },
    begin(frame, roidActive) {
      if (active !== roidActive) {
        this.materialize(frame);
        due.fill(0);
        active = roidActive;
        for (let index = 0; index < cells.length; index++) {
          if (!alive[cells[index].anchor]) continue;
          initial[index] = cellProgress[index];
          beganAt[index] = frame;
          const plan = plans[index][Number(active)];
          let steps = plan.period;
          if (initial[index] !== 0) {
            let progress = initial[index];
            steps = 0;
            do { progress += plan.increment; steps++; } while (progress < cells[index].cooldown);
          }
          schedule(index, frame + steps - 1);
        }
      }
      bucket = (frame % ringSize) * words;
      word = 0;
      bits = 0;
    },
    next() {
      while (!bits && word < words) {
        bits = due[bucket + word];
        due[bucket + word] = 0;
        word++;
      }
      if (!bits) return cells.length;
      const bit = 31 - Math.clz32(bits & -bits);
      bits = (bits & (bits - 1)) >>> 0;
      return (word - 1) * 32 + bit;
    },
    fired(index, frame) {
      initial[index] = 0;
      beganAt[index] = frame + 1;
      schedule(index, frame + plans[index][Number(active)].period);
    },
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
  const roidSpeed = 1 + (50 + jellyUpgradeQuantity(S, 29)) / 100;
  const cells = initialMetrics.cells.map(cell => ({
    ...cell,
    cooldown: cell.cooldownProgress,
    levelFactor: 1 + levels[cell.type] * cellLevelPercent / 100,
    normalProgress: 0.65 * 1 * cell.organelle * cell.proximity,
    roidProgress: 0.65 * roidSpeed * cell.organelle * cell.proximity,
    projectileGeometry: _jellyProjectileGeometry(cell.anchor, cell.type),
  }));
  const allSlots = cells.flatMap(cell => cell.slots);
  const planCache = new Map();
  let firingRingSize = 2;
  const firingPlan = (cooldown, increment) => {
    const key = `${cooldown}|${increment}`;
    if (planCache.has(key)) return planCache.get(key);
    const plan = _jellyFiringPlan(cooldown, increment);
    if (plan) firingRingSize = Math.max(firingRingSize, plan.period + 1);
    planCache.set(key, plan);
    return plan;
  };
  const useFiringCalendar = options.runtimeFastPath !== false && options.firingCalendar !== false
    && (options.firingCalendar === true || cells.length >= 8);
  const firingPlans = !useFiringCalendar ? null
    : cells.map(cell => [
      firingPlan(cell.cooldown, cell.normalProgress),
      firingPlan(cell.cooldown, cell.roidProgress),
    ]);
  return {
    validation, progress, obstruction, fever, hp, standardTime, initialTotalCellLevel,
    levels, exp, expMultiplier, cellLevelPercent, currencyFactors, cellDamageBase, canLevel,
    criticalUnlocked, amoebaUnlocked, dpsUnlocked, roidStart, initialMetrics, cells,
    allSlots, firingRingSize, firingPlans: firingPlans?.every(pair => pair.every(Boolean)) ? firingPlans : null,
    immunoidSlots: cells.filter(cell => cell.type === 4).flatMap(cell => cell.slots),
    projectileRingSize: 1 + cells.reduce((maximum, cell) => Math.max(maximum,
      cell.projectileGeometry.frames), 1),
    cellsByAnchor: new Map(cells.map((cell, index) => [cell.anchor, index])),
    slotOwners: new Map(cells.flatMap(cell => cell.slots.map(slot => [slot, cell]))),
    revives: Math.max(0, Math.floor(jellyUpgradeQuantity(S, 35))),
  };
}

function _createJellyProjectileQueue(ringSize) {
  const queue = {
    heads: new Int32Array(ringSize).fill(-1),
    damage: new Float64Array(256),
    types: new Uint8Array(256),
    next: new Int32Array(256),
    used: 0, free: -1, pending: 0,
    push(frame, damage, type) {
      let index = this.free;
      if (index >= 0) this.free = this.next[index];
      else {
        index = this.used++;
        if (index === this.damage.length) {
          for (const key of ['damage', 'types', 'next']) {
            const grown = new this[key].constructor(this[key].length * 2);
            grown.set(this[key]);
            this[key] = grown;
          }
        }
      }
      const bucket = frame % this.heads.length;
      this.damage[index] = damage;
      this.types[index] = type;
      this.next[index] = this.heads[bucket];
      this.heads[bucket] = index;
      this.pending++;
    },
    snapshot() {
      return {
        heads: this.heads.slice(), damage: this.damage.slice(0, this.used),
        types: this.types.slice(0, this.used), next: this.next.slice(0, this.used),
        used: this.used, free: this.free, pending: this.pending,
      };
    },
    restore(saved) {
      for (const key of ['heads', 'damage', 'types', 'next']) {
        if (this[key].length < saved[key].length) this[key] = new this[key].constructor(saved[key].length);
        this[key].set(saved[key]);
      }
      this.used = saved.used;
      this.free = saved.free;
      this.pending = saved.pending;
    },
  };
  return queue;
}

function _createJellyPolicyPrefixCache(limit = 8 * 1024 * 1024) {
  const entries = new Map();
  const stats = { resumed: 0, framesReused: 0, retainedBytes: 0, evictions: 0 };
  return {
    resume(key, roidStart) {
      let best = null;
      for (const entry of entries.values()) {
        if (entry.key !== key) continue;
        const state = entry.state;
        if (state.roidUsed ? state.roidStart !== roidStart
          : state.time > roidStart && state.previousTime >= roidStart) continue;
        if (!best || state.frameIndex > best.frameIndex) best = state;
      }
      if (best) { stats.resumed++; stats.framesReused += best.frameIndex; }
      return best;
    },
    save(key, state) {
      const id = `${key}|${state.roidUsed ? state.roidStart : 'before'}|${state.frameIndex}`;
      if (entries.has(id)) return;
      const bytes = 2048 + state.cellProgress.byteLength + state.expGained.length * 8
        + Object.values(state.queue).reduce((sum, value) => sum + (value?.byteLength || 0), 0);
      entries.set(id, { key, state, bytes });
      stats.retainedBytes += bytes;
      while (stats.retainedBytes > limit || entries.size > 128) {
        const oldest = entries.keys().next().value;
        stats.retainedBytes -= entries.get(oldest).bytes;
        entries.delete(oldest);
        stats.evictions++;
      }
    },
    diagnostics: () => ({ ...stats, entries: entries.size, byteLimit: limit }),
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
  const fastRuntime = options.runtimeFastPath !== false;
  const compact = options._compactTrial === true;
  const prefixCache = compact && fastRuntime ? options._policyPrefixCache : null;
  const prefixKey = prefixCache ? JSON.stringify([
    jellyLayoutKey(layout), seed, obstruction, fever, options.cachedTotalCellLevel ?? null,
    options.secondTickOffset ?? null, options.openingProgressByAnchor ?? null,
    options.maxCriticalSeconds ?? null,
  ]) : '';
  const resumed = prefixCache?.resume(prefixKey, roidStart);
  const generatedRandom = seededRandom(seed, resumed?.randomState);
  let gameplayRandomCalls = resumed?.gameplayRandomCalls || 0;
  const random = () => {
    gameplayRandomCalls++;
    return generatedRandom();
  };
  const timerPhaseRandom = seededRandom(seed ^ 0x51ed270b);
  const frameSeconds = 1 / 60;
  const levels = compact ? prepared.levels : prepared.levels.slice();
  const exp = compact ? null : prepared.exp.slice();
  const levelsBefore = compact ? levels : levels.slice();
  const expBefore = exp?.slice();
  const expGained = resumed?.expGained.slice() || new Array(9).fill(0);
  const revivePolicy = options.revivePolicy || 'immunoid-first';
  let revivesRemaining = prepared.revives;
  let timerRemaining = resumed?.timerRemaining ?? standardTime;
  let feverSeconds = resumed?.feverSeconds || 0;
  let amoebaStacks = resumed?.amoebaStacks || 0;
  let amoebaStacksAtCriticalStart = resumed?.amoebaStacksAtCriticalStart ?? null;
  let maxAmoebaStacksAtFire = 0;
  let damageAtCriticalStart = resumed?.damageAtCriticalStart ?? null;
  let hitsAtCriticalStart = null;
  let bestDps = resumed?.bestDps ?? progress.bestDps;
  let displayedDps = resumed?.displayedDps || 0;
  let peakDisplayedDps = resumed?.peakDisplayedDps || 0;
  let damageBuckets = resumed?.damageBuckets.slice() || [0];
  let nextSecondTick = resumed?.nextSecondTick ?? (options.secondTickOffset == null ? timerPhaseRandom() : Math.max(0, n(options.secondTickOffset)));
  let roidRemaining = resumed?.roidRemaining || 0;
  let roidUsed = resumed?.roidUsed || false;
  let bossCounter = resumed?.bossCounter || 0;
  let time = resumed?.time || 0;
  let frameIndex = resumed?.frameIndex || 0;
  let previousTime = resumed?.previousTime ?? -Infinity;
  let damage = resumed?.damage || 0;
  let remainingHp = resumed?.remainingHp ?? hp;
  let bloodcells = resumed?.bloodcells || 0;
  let hits = resumed?.hits || 0;
  let shots = resumed?.shots || 0;
  let deaths = 0;
  let revivesUsed = 0;
  let bossAttacks = 0;
  let immunoidHits = 0;
  let immunoidFocusTime = resumed?.immunoidFocusTime || 0;
  let endedBy = 'running';
  const projectiles = [];
  const ringSize = prepared.projectileRingSize;
  const queue = fastRuntime ? _createJellyProjectileQueue(ringSize) : null;
  if (resumed) queue.restore(resumed.queue);
  const deathLog = [];
  const contribution = resumed?.contribution.map(row => ({ ...row }))
    || new Array(9).fill(0).map((_, type) => ({ type, name: CELL_NAMES[type], shots: 0, hits: 0, damage: 0, bloodcells: 0, exp: 0 }));

  const cells = prepared.cells;
  const cellProgress = resumed?.cellProgress.slice() || new Float64Array(cells.length);
  const cellsByAnchor = prepared.cellsByAnchor;
  for (let anchor = 0; !resumed && anchor < JELLY_SIZE; anchor++) {
    const cellIndex = cellsByAnchor.get(anchor);
    const cell = cells[cellIndex];
    if (cell) {
      const maximumOpeningProgress = Math.floor(Math.max(5, cell.cooldown - 1));
      const suppliedProgress = options.openingProgressByAnchor?.[cell.anchor];
      const sampledProgress = randomInt(random, 0, maximumOpeningProgress);
      cellProgress[cellIndex] = suppliedProgress == null
        ? sampledProgress
        : Math.max(0, Math.min(maximumOpeningProgress, Math.floor(n(suppliedProgress))));
    }
    if (fastRuntime) {
      generatedRandom.advance(1);
      gameplayRandomCalls++;
    } else randomInt(random, 0, 140);
  }
  const openingProgressByAnchor = compact ? undefined : Object.fromEntries(cells.map((cell, index) => [cell.anchor, cellProgress[index]]));
  const alive = new Uint8Array(JELLY_SIZE);
  for (const slot of allSlots) alive[slot] = 1;
  let liveCount = allSlots.length;
  const immunoidSlotOrder = prepared.immunoidSlots;
  let liveImmunoidSlots = immunoidSlotOrder.slice();
  let liveSlots = allSlots.slice();
  const slotOwners = prepared.slotOwners;
  const bossCooldown = jellyBossAttackCooldown(obstruction);
  const coldUnlocked = fever === 0 && jellyUpgradeQuantity(S, 16) >= 1;
  const damageBases = new Float64Array(CELL_BASE_DAMAGE.length);
  const damageEpochs = new Float64Array(CELL_BASE_DAMAGE.length).fill(-1);
  let currencyBestDps = bestDps;
  let currencyMultiplier = _jellyCurrencyMultiplierFromFactors(currencyFactors, bestDps);
  const sourceCriticalLimit = (3 * bossCooldown * (allSlots.length + prepared.revives + 1) + 1) / 60;
  const maxCriticalSeconds = options.maxCriticalSeconds == null
    ? sourceCriticalLimit
    : Math.max(0, n(options.maxCriticalSeconds));
  const maxTime = standardTime + maxCriticalSeconds;
  let nextPrefixTime = Math.floor(time / 5 + 1) * 5;
  let savedRevivePrefix = false;
  const firingCalendar = fastRuntime && options.firingCalendar !== false && prepared.firingPlans
    ? _createJellyFiringCalendar(cells, prepared.firingPlans, cellProgress, alive, frameIndex, prepared.firingRingSize) : null;

  while (time < maxTime && endedBy === 'running') {
    const reviveBoundary = prefixCache && criticalUnlocked && timerRemaining - frameSeconds < 0
      && bossCounter + 1 >= bossCooldown && !savedRevivePrefix;
    if (prefixCache && deaths === 0 && ((time >= nextPrefixTime && !roidUsed) || reviveBoundary)) {
      firingCalendar?.materialize(frameIndex);
      prefixCache.save(prefixKey, {
        randomState: generatedRandom.state(), gameplayRandomCalls, expGained: expGained.slice(),
        cellProgress: cellProgress.slice(), queue: queue.snapshot(),
        contribution: contribution.map(row => ({ ...row })), damageBuckets: damageBuckets.slice(),
        timerRemaining, feverSeconds, amoebaStacks, amoebaStacksAtCriticalStart,
        damageAtCriticalStart, bestDps, displayedDps, peakDisplayedDps, nextSecondTick,
        roidRemaining, roidUsed, roidStart, bossCounter, time, frameIndex, previousTime,
        damage, remainingHp, bloodcells, hits, shots, immunoidFocusTime,
      });
      nextPrefixTime = Math.floor(time / 5 + 1) * 5;
      if (reviveBoundary) savedRevivePrefix = true;
    }
    const frameEnd = time + frameSeconds;
    let dpsChanged = false;
    while (dpsUnlocked && nextSecondTick < frameEnd) {
      damageBuckets.unshift(0);
      if (damageBuckets.length >= 6) damageBuckets.splice(4, 1);
      feverSeconds++;
      nextSecondTick += 1;
      dpsChanged = true;
    }
    if (!roidUsed && time >= roidStart) {
      roidUsed = true;
      roidRemaining = JELLY_ROID_TIME_TOTAL;
    }
    roidRemaining = roidRemaining - JELLY_ROID_DECREMENT_PER_FRAME;
    const roidActive = roidRemaining > 0;
    const coldFactor = coldUnlocked ? 1 + feverSeconds / 100 : 1;
    const damageEpoch = coldUnlocked ? feverSeconds : 0;

    firingCalendar?.begin(frameIndex, roidActive);
    for (let cellIndex = firingCalendar ? firingCalendar.next() : 0; cellIndex < cells.length;
      cellIndex = firingCalendar ? firingCalendar.next() : cellIndex + 1) {
      const cell = cells[cellIndex];
      if (!alive[cell.anchor]) continue;
      if (!firingCalendar) cellProgress[cellIndex] += roidActive ? cell.roidProgress : cell.normalProgress;
      if (firingCalendar || cellProgress[cellIndex] >= cell.cooldown) {
        cellProgress[cellIndex] = 0;
        firingCalendar?.fired(cellIndex, frameIndex);
        if (!compact) maxAmoebaStacksAtFire = Math.max(maxAmoebaStacksAtFire, amoebaStacks);
        const arrivalFrame = frameIndex + _jellyProjectileHitFrame(cell.projectileGeometry, random);
        if (!fastRuntime || damageEpochs[cell.type] !== damageEpoch) {
          // Cache the source-ordered left prefix, never regroup the remaining products.
          damageBases[cell.type] = CELL_BASE_DAMAGE[cell.type]
            * (cellDamageBase * coldFactor)
            * initialMetrics.damagePassive
            * cell.levelFactor;
          damageEpochs[cell.type] = damageEpoch;
        }
        const projectileDamage = damageBases[cell.type]
            * (1 + amoebaStacks / 100)
            * initialMetrics.virusMultiplier
            * cell.proximity;
        if (fastRuntime) queue.push(Math.max(frameIndex, arrivalFrame), projectileDamage, cell.type);
        else projectiles.push({ arrivalFrame, damage: projectileDamage, type: cell.type });
        shots++;
        contribution[cell.type].shots++;
      }
    }

    const bucket = frameIndex % ringSize;
    let queuedIndex = fastRuntime ? queue.heads[bucket] : -1;
    if (fastRuntime) queue.heads[bucket] = -1;
    for (let index = fastRuntime ? queuedIndex : projectiles.length - 1; index >= 0;) {
      let hitDamage, hitType;
      if (fastRuntime) {
        hitDamage = queue.damage[index];
        hitType = queue.types[index];
        queuedIndex = queue.next[index];
        queue.next[index] = queue.free;
        queue.free = index;
        queue.pending--;
      } else {
        const projectile = projectiles[index];
        if (projectile.arrivalFrame > frameIndex) { index--; continue; }
        hitDamage = projectile.damage;
        hitType = projectile.type;
        projectiles.splice(index, 1);
      }
      damage += hitDamage;
      remainingHp -= hitDamage;
      damageBuckets[0] += hitDamage;
      if (currencyBestDps !== bestDps) {
        currencyBestDps = bestDps;
        currencyMultiplier = _jellyCurrencyMultiplierFromFactors(currencyFactors, bestDps);
      }
      const gainedBloodcells = hitDamage * currencyMultiplier;
      bloodcells += gainedBloodcells;
      hits++;
      contribution[hitType].hits++;
      contribution[hitType].damage += hitDamage;
      contribution[hitType].bloodcells += gainedBloodcells;
      if (amoebaUnlocked && hitType === 0) amoebaStacks++;
      if (canLevel) {
        if (exp) exp[hitType] += expMultiplier;
        expGained[hitType] += expMultiplier;
        contribution[hitType].exp += expMultiplier;
      }
      index = fastRuntime ? queuedIndex : index - 1;
    }

    // Buckets 1-3 change only on the second tick; hits still use the previous Best DPS.
    if ((dpsChanged || !fastRuntime) && damageBuckets.length > 3) {
      displayedDps = (damageBuckets[1] + damageBuckets[2] + damageBuckets[3]) / 3;
      peakDisplayedDps = Math.max(peakDisplayedDps, displayedDps);
      bestDps = Math.max(bestDps, displayedDps);
    }

    timerRemaining -= frameSeconds;
    previousTime = time;
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
      if (!fastRuntime) liveImmunoidSlots = immunoidSlotOrder.filter(slot => alive[slot]);
      if (liveImmunoidSlots.length) immunoidFocusTime += frameSeconds;
      if (!criticalUnlocked) {
        endedBy = 'timer';
        break;
      }
      bossCounter++;
      if (bossCounter >= bossCooldown) {
        if (!fastRuntime) liveSlots = allSlots.filter(slot => alive[slot]);
        if (!liveSlots.length) {
          endedBy = 'all-slots-dead';
          break;
        }
        const focused = liveImmunoidSlots.length > 0;
        const pool = focused ? liveImmunoidSlots : liveSlots;
        const target = pool[randomInt(random, 0, pool.length - 1)];
        alive[target] = 0;
        liveCount--;
        deaths++;
        bossAttacks++;
        if (!compact) {
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
        }
        if (focused) {
          immunoidHits++;
          bossCounter = -2 * bossCooldown;
        } else {
          bossCounter = 0;
        }
        if (revivesRemaining > 0 && revivePolicy !== 'none') {
          const deadSlots = allSlots.filter(slot => !alive[slot]);
          const revived = reviveTarget(revivePolicy, deadSlots, initialMetrics.cells);
          if (revived != null) {
            alive[revived] = 1;
            liveCount++;
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
        liveImmunoidSlots = immunoidSlotOrder.filter(slot => alive[slot]);
        liveSlots = allSlots.filter(slot => alive[slot]);
      }
    }
    if (endedBy === 'running' && timerRemaining < 0 && criticalUnlocked) {
      if (fastRuntime) {
        generatedRandom.advance(2);
        gameplayRandomCalls += 2;
      } else {
        randomInt(random, -4, 4);
        randomInt(random, -2, 2);
      }
    }
    frameIndex++;
  }

  if (endedBy === 'running') endedBy = 'simulation-cap';
  if (compact) return {
    valid: true, reason: '', success: endedBy === 'clear', time, damage, bloodcells,
    cellExp: expGained.reduce((sum, value) => sum + value, 0), expByType: expGained,
    criticalTime: Math.max(0, time - standardTime), deaths, revivesUsed,
    bestDpsAfter: bestDps, peakDps: peakDisplayedDps, damageAtCriticalStart: damageAtCriticalStart ?? damage,
    shots, hits, bossAttacks, immunoidFocusTime, liveSlots: liveCount,
    attemptDelta: (endedBy === 'clear' ? 1 : 0) - (obstruction > 1 ? 1 : 0),
    amoebaStacksAtCriticalStart: amoebaStacksAtCriticalStart ?? amoebaStacks, amoebaStacks,
    contribution,
    gameplayRandomCalls, projectilesRemaining: fastRuntime ? queue.pending : projectiles.length, endedBy,
  };
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
    projectilesRemaining: fastRuntime ? queue.pending : projectiles.length,
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
    liveSlots: liveCount,
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
    p90Bloodcells: quantile(bloodcells, 0.9),
    maxBloodcells: Math.max(...bloodcells),
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
  const batch = options._trialBatch;
  const prepared = options._preparedSimulation || batch?.prepared || prepareJellyOperation(layout, S, options);
  if (batch) batch.prepared = prepared;
  for (let index = 0; index < trials; index++) {
    if (batch?.records[index]) {
      batch.reused++;
      results.push(index === 0 ? batch.representative : batch.records[index]);
    } else {
      const result = simulateJellyOperation(layout, S, {
        ...options, seed: seed + index * 2654435761, _preparedSimulation: prepared,
        _compactTrial: index > 0 && options._compactTrials === true,
        _policyPrefixCache: index < (options._prefixTrialLimit ?? 32) ? options._policyPrefixCache : null,
      });
      results.push(result);
      if (batch) {
        batch.computed++;
        if (index === 0) batch.representative = result;
        batch.records[index] = _packJellyTrialSummary(result);
      }
    }
  }
  return summarizeJellyTrials(results, trials, seed, options.includeTrials);
}

const _jellyTrialBlockContexts = new WeakMap();
function _jellyTrialBlockContext(layout, S, options) {
  let contexts = _jellyTrialBlockContexts.get(S);
  if (!contexts) { contexts = new Map(); _jellyTrialBlockContexts.set(S, contexts); }
  const key = `${jellyLayoutKey(layout)}|${jellyTrialSimulationSignature(options)}|${options.firingCalendar ?? 'auto'}|${options.runtimeFastPath !== false}`;
  let prepared = contexts.get(key);
  if (!prepared) {
    prepared = prepareJellyOperation(layout, S, options);
    _setJellySearchCache(contexts, key, prepared, 16);
  }
  return prepared;
}

export function simulateJellyTrialBlock(layout, S, options = {}) {
  const offset = Math.max(0, Math.floor(n(options.trialOffset)));
  const count = Math.max(1, Math.min(64, Math.floor(n(options.trialCount) || 32)));
  if (offset + count > 8192) throw new Error('Jelly trial block exceeds the trial limit');
  const seed = Math.floor(n(options.seed) || 1);
  const prepared = _jellyTrialBlockContext(layout, S, options);
  const records = [];
  let representative;
  for (let index = offset; index < offset + count; index++) {
    const result = simulateJellyOperation(layout, S, {
      ...options, seed: seed + index * 2654435761, _preparedSimulation: prepared,
      _compactTrial: index > 0 && options._compactTrials === true,
    });
    if (index === 0) representative = result;
    records.push(index === 0 && options._compactTrials ? _packJellyTrialSummary(result) : result);
  }
  return { offset, count, seed, records, representative };
}

export function mergeJellyTrialBlocks(blocks, options = {}) {
  const trials = Math.max(1, Math.min(8192, Math.floor(n(options.trials) || 64)));
  const seed = Math.floor(n(options.seed) || 1);
  const results = [];
  for (const block of blocks.slice().sort((a, b) => a.offset - b.offset)) {
    if (block.seed !== seed || block.offset !== results.length || block.count !== block.records?.length) {
      throw new Error('Mismatched or incomplete Jelly trial blocks');
    }
    results.push(...block.records);
    if (block.offset === 0) {
      if (!block.representative) throw new Error('Missing Jelly trial representative');
      results[0] = block.representative;
    }
  }
  if (results.length !== trials) throw new Error('Incomplete Jelly trial measurements');
  return summarizeJellyTrials(results, trials, seed, options.includeTrials);
}

function _packJellyTrialSummary(result) {
  const packed = {};
  for (const key of [
    'valid', 'reason', 'success', 'time', 'damage', 'bloodcells', 'cellExp', 'criticalTime',
    'deaths', 'revivesUsed', 'bestDpsAfter', 'peakDps', 'damageAtCriticalStart',
    'shots', 'hits', 'bossAttacks', 'immunoidFocusTime', 'liveSlots', 'attemptDelta',
    'amoebaStacksAtCriticalStart', 'amoebaStacks',
  ]) packed[key] = result[key];
  packed.expByType = result.expByType?.slice();
  packed.contribution = result.contribution?.map(({ shots, hits, damage, bloodcells, exp }) => (
    { shots, hits, damage, bloodcells, exp }
  ));
  return packed;
}

function _createJellyTrialBatchCache(limit = 16384, entryLimit = 16) {
  const entries = new Map();
  const stats = { computed: 0, reused: 0, evictions: 0, prefixResumed: 0, prefixFramesReused: 0,
    cooperativeComputed: 0, cooperativeReused: 0 };
  const trim = family => {
    const protectedKeys = new Set(Array.from(entries.entries())
      .filter(([, batch]) => family && batch.family === family)
      .sort((a, b) => b[1].quality - a[1].quality || b[1].records.length - a[1].records.length)
      .slice(0, Math.min(8, Math.floor(entryLimit / 2))).map(([key]) => key));
    let retained = Array.from(entries.values()).reduce((sum, batch) => sum + batch.records.length, 0);
    while (entries.size > entryLimit || retained > limit) {
      const key = Array.from(entries.keys()).find(key => !protectedKeys.has(key)) ?? entries.keys().next().value;
      const batch = entries.get(key);
      retained -= batch.records.length;
      entries.delete(key);
      stats.evictions++;
    }
  };
  return {
    takePrefix(key, trials, seed) {
      const batch = entries.get(key);
      if (!batch) return null;
      entries.delete(key);
      const records = batch.records.slice(0, trials);
      return { offset: 0, count: records.length, seed, records, representative: batch.representative };
    },
    recordPrefix(key, result, reused, retain) {
      stats.cooperativeComputed += result.trials - reused;
      stats.cooperativeReused += reused;
      if (!retain || !result.valid || !Array.isArray(result.results)) return;
      entries.delete(key);
      entries.set(key, {
        records: result.results.map(_packJellyTrialSummary), representative: result.representative,
        prepared: null, computed: 0, reused: 0, quality: 0,
      });
      trim();
    },
    run(key, layout, S, options) {
      let batch = entries.get(key);
      if (!batch) batch = { records: [], representative: null, prepared: null, computed: 0, reused: 0 };
      entries.delete(key);
      entries.set(key, batch);
      const beforeComputed = batch.computed;
      const beforeReused = batch.reused;
      const prefixesBefore = options._policyPrefixCache?.diagnostics();
      const result = simulateJellyTrials(layout, S, { ...options, _trialBatch: batch });
      batch.family = options._policyCacheFamily;
      batch.quality = options._trialCacheQuality?.(result) ?? 0;
      stats.computed += batch.computed - beforeComputed;
      stats.reused += batch.reused - beforeReused;
      const prefixesAfter = options._policyPrefixCache?.diagnostics();
      stats.prefixResumed += (prefixesAfter?.resumed || 0) - (prefixesBefore?.resumed || 0);
      stats.prefixFramesReused += (prefixesAfter?.framesReused || 0) - (prefixesBefore?.framesReused || 0);
      trim(options._policyCacheFamily);
      return result;
    },
    diagnostics: () => ({
      ...stats, entries: entries.size,
      retainedTrials: Array.from(entries.values()).reduce((sum, batch) => sum + batch.records.length, 0),
      trialLimit: limit, entryLimit,
    }),
  };
}

export function createJellyMeasurementCache({ scope = '', entryLimit = 128, byteLimit = 2 * 1024 * 1024 } = {}) {
  entryLimit = Math.max(1, Math.min(128, Math.floor(n(entryLimit) || 128)));
  byteLimit = Math.max(1, Math.min(2 * 1024 * 1024, Math.floor(n(byteLimit) || 2 * 1024 * 1024)));
  const entries = new Map();
  const stats = { hits: 0, imported: 0, evictions: 0, retainedBytes: 0 };
  const set = (key, value, priority = 0) => {
    if (typeof key !== 'string' || !value || value.valid !== true || value.results != null) {
      throw new Error('Invalid Jelly aggregate measurement');
    }
    const bytes = 2 * (key.length + JSON.stringify(value).length);
    if (bytes > byteLimit) return;
    const previous = entries.get(key);
    if (previous) stats.retainedBytes -= previous.bytes;
    entries.delete(key);
    entries.set(key, { value: structuredClone(value), bytes, priority });
    stats.retainedBytes += bytes;
    while (entries.size > entryLimit || stats.retainedBytes > byteLimit) {
      const reserved = new Set(Array.from(entries).filter(([, entry]) => entry.priority > 0)
        .slice(0, Math.min(16, Math.floor(entryLimit / 4))).map(([key]) => key));
      const oldest = Array.from(entries.keys()).find(key => !reserved.has(key)) ?? entries.keys().next().value;
      stats.retainedBytes -= entries.get(oldest).bytes;
      entries.delete(oldest);
      stats.evictions++;
    }
  };
  return {
    get(key) {
      const entry = entries.get(key);
      if (!entry) return null;
      entries.delete(key);
      entries.set(key, entry);
      stats.hits++;
      return structuredClone(entry.value);
    },
    set,
    merge(payload) {
      if (payload?.schema !== 1 || payload.scope !== scope || !Array.isArray(payload.entries)
        || payload.entries.length > entryLimit) throw new Error('Incompatible Jelly measurement exchange');
      for (const [key, value, priority] of payload.entries) {
        if (entries.has(key)) continue;
        set(key, value, priority);
        stats.imported++;
      }
    },
    export: excludeKeys => ({ schema: 1, scope, entries: Array.from(entries)
      .filter(([key]) => !excludeKeys?.has(key))
      .map(([key, entry]) => [key, structuredClone(entry.value), entry.priority]) }),
    diagnostics: () => ({ ...stats, entries: entries.size, entryLimit, byteLimit }),
  };
}

export function createJellyProxyCache({ scope = '', entryLimit = 4096, byteLimit = 2 * 1024 * 1024 } = {}) {
  entryLimit = Math.max(1, Math.min(4096, Math.floor(n(entryLimit) || 4096)));
  byteLimit = Math.max(1, Math.min(2 * 1024 * 1024, Math.floor(n(byteLimit) || 2 * 1024 * 1024)));
  const entries = new Map();
  const stats = { hits: 0, imported: 0, declined: 0, retainedBytes: 0 };
  const set = (key, value) => {
    if (typeof key !== 'string' || !Number.isFinite(value)) throw new Error('Invalid Jelly proxy score');
    const bytes = 2 * key.length + 8;
    if (entries.has(key)) return;
    if (entries.size >= entryLimit || stats.retainedBytes + bytes > byteLimit) {
      stats.declined++;
      return;
    }
    entries.set(key, { value, bytes });
    stats.retainedBytes += bytes;
  };
  return {
    get(key) {
      const entry = entries.get(key);
      if (!entry) return undefined;
      stats.hits++;
      return entry.value;
    },
    set,
    merge(payload) {
      if (payload?.schema !== 1 || payload.scope !== scope || !Array.isArray(payload.entries)
        || payload.entries.length > 4096) throw new Error('Incompatible Jelly proxy exchange');
      for (const [key, value] of payload.entries) {
        if (typeof key !== 'string' || !Number.isFinite(value)) throw new Error('Invalid Jelly proxy score');
        if (entries.has(key)) continue;
        set(key, value);
        stats.imported++;
      }
    },
    export: () => ({ schema: 1, scope, entries: Array.from(entries, ([key, entry]) => [key, entry.value]) }),
    diagnostics: () => ({ ...stats, entries: entries.size, entryLimit, byteLimit }),
  };
}

function _jellyProxyOptions(options) {
  return Object.fromEntries([
    'objective', 'fever', 'obstruction', 'expCellType', 'roidTiming', 'useRoid',
    'travelScale', 'openingFraction', 'anchorAttritionBias', 'maxCriticalSeconds',
  ].filter(key => options[key] !== undefined).map(key => [key, options[key]]));
}

function _jellyProxyScorer(S, options, cache) {
  const signature = cache ? JSON.stringify(_jellyProxyOptions(options)) : '';
  return (layout, layoutKey) => {
    const key = cache ? `${signature}|${layoutKey ?? jellyLayoutKey(layout)}` : '';
    const cached = cache?.get(key);
    if (cached !== undefined) return cached;
    const score = proxyObjectiveScore(layout, S, options);
    if (Number.isFinite(score)) cache?.set(key, score);
    return score;
  };
}

function _jellyProxyMetricContext(S, options, keyOf) {
  const fever = options.fever == null ? jellyProgress(S).fever : Math.floor(n(options.fever));
  const duration = jellyBossTime(options.obstruction == null ? jellyProgress(S).obstruction : options.obstruction);
  return {
    ...(options.incrementalScoring === false ? {} : _createJellySearchMetricContext(S, keyOf)),
    countBonusUnlocked: jellyUpgradeQuantity(S, 14) >= 1,
    cellSpeed: jellyCellSpeedMultiplier(S, fever),
    proximityLevel: jellyUpgradeQuantity(S, 13),
    organelleMultiplier: 1.5 + Math.min(0.25, Math.max(0, rogBonusQTY(63, S?.cachedUniqueSushi || 0) / 100)),
    roidLevel: jellyUpgradeQuantity(S, 29),
    cellLevelDamage: 1 + jellyUpgradeQuantity(S, 17),
    scoreOnly: options.scoreOnly !== false,
    scoreScratch: options.scoreOnly === false ? null : _createJellyScoreScratch(),
    cellDamage: jellyCellDamageMultiplier(S, {
      fever, feverRampPct: options.objective === 'dps' ? 0 : fever === 0 ? duration / 2 : 0,
    }),
    amoebaUnlocked: jellyUpgradeQuantity(S, 28) >= 1,
    criticalUnlocked: jellyUpgradeQuantity(S, 36) === 1,
    revives: Math.max(0, Math.floor(jellyUpgradeQuantity(S, 35))),
    currencyMultiplier: jellyCurrencyMultiplier(S, fever),
    expMultiplier: jellyCellExpMultiplier(S, fever),
  };
}

export function createJellyPolicyCache({ scope = '', entryLimit = 64, byteLimit = 2 * 1024 * 1024 } = {}) {
  entryLimit = Math.max(1, Math.min(64, Math.floor(n(entryLimit) || 64)));
  const cache = createJellyMeasurementCache({ scope, entryLimit, byteLimit });
  const hints = new Map();
  const stats = { misses: 0, warmStarts: 0 };
  const remember = (key, result) => {
    const [version, geometry, family] = JSON.parse(key);
    if (version !== 'jelly-policy-v6' || typeof geometry !== 'string' || typeof family !== 'string') {
      throw new Error('Invalid Jelly policy cache key');
    }
    hints.delete(key);
    hints.set(key, {
      geometry, family, fever: result.fever, roidTiming: result.roidTiming, revivePolicy: result.revivePolicy,
    });
    while (hints.size > cache.diagnostics().entryLimit) hints.delete(hints.keys().next().value);
  };
  return {
    get(key) {
      const result = cache.get(key);
      if (!result) stats.misses++;
      return result;
    },
    set(key, result, priority = 0) { remember(key, result); cache.set(key, result, priority); },
    merge(payload) {
      cache.merge(payload);
      for (const [key, result] of payload.entries) remember(key, result);
    },
    export: excludeKeys => cache.export(excludeKeys),
    seeds(layout, family) {
      const geometry = jellyLayoutKey(layout);
      const cells = new Set(geometry.split('|'));
      const candidates = [];
      for (const [key, hint] of hints) {
        if (hint.family !== family) continue;
        const other = new Set(hint.geometry.split('|'));
        let shared = 0;
        for (const cell of cells) if (other.has(cell)) shared++;
        candidates.push({ key, hint, distance: 1 - shared / Math.max(1, cells.size + other.size - shared) });
      }
      candidates.sort((a, b) => a.distance - b.distance || a.key.localeCompare(b.key));
      const seen = new Set();
      const policies = [];
      for (const { hint } of candidates) {
        const key = JSON.stringify([hint.fever, hint.roidTiming, hint.revivePolicy]);
        if (seen.has(key)) continue;
        seen.add(key);
        policies.push({ fever: hint.fever, roidTiming: hint.roidTiming, revivePolicy: hint.revivePolicy });
        if (policies.length >= 4) break;
      }
      if (policies.length) stats.warmStarts++;
      return policies;
    },
    diagnostics: () => ({ ...cache.diagnostics(), ...stats, hintEntries: hints.size }),
  };
}

export function simulateJellyPolicyGroup(layout, S, options = {}) {
  if (!Array.isArray(options.policies) || !options.policies.length || options.policies.length > 8) {
    throw new Error('A Jelly policy group must contain one to eight policies');
  }
  const context = { prefixes: _createJellyPolicyPrefixCache(), batches: _createJellyTrialBatchCache(4096, 16) };
  const trials = Math.max(1, Math.min(8192, Math.floor(n(options.trials) || 4)));
  const seed = Math.floor(n(options.seed) || 1);
  const block = options.trialCount != null;
  const offset = block ? Math.floor(n(options.trialOffset)) : 0;
  const count = block ? Math.floor(n(options.trialCount)) : trials;
  if (block && (offset < 0 || count < 1 || count > 64 || offset + count > trials)) {
    throw new Error('Invalid Jelly policy trial block range');
  }
  if (block || (options._compactTrials === true && !options.includeTrials && options.policyPrefixes !== false
    && options.trialReuse !== false && options.runtimeFastPath !== false && options.policies.length * trials <= 4096)) {
    const unique = new Map();
    const rows = options.policies.map(policy => {
      const simulationOptions = { ...options, ...policy, trials, seed };
      const key = jellyTrialSimulationSignature(simulationOptions);
      if (!unique.has(key)) unique.set(key, {
        options: simulationOptions, prepared: block ? _jellyTrialBlockContext(layout, S, simulationOptions)
          : prepareJellyOperation(layout, S, simulationOptions),
        records: [], representative: null,
      });
      return unique.get(key);
    });
    // Finish each seed's policies together so bounded snapshots do not churn between seeds.
    for (let index = offset; index < offset + count; index++) for (const row of unique.values()) {
      const result = simulateJellyOperation(layout, S, {
        ...row.options, seed: seed + index * 2654435761, _preparedSimulation: row.prepared,
        _compactTrial: index > 0 && options._compactTrials === true,
        _policyPrefixCache: options.policyPrefixes === false || options.trialReuse === false
          || options.runtimeFastPath === false ? null : context.prefixes,
      });
      if (index === 0) row.representative = result;
      row.records.push(_packJellyTrialSummary(result));
    }
    if (block) return {
      seed, trials, offset, count,
      policyKeys: rows.map(row => jellyTrialSimulationSignature(row.options)),
      blocks: rows.map(row => ({
        seed, offset, count, records: row.records, representative: row.representative || undefined,
      })),
    };
    const measurements = rows.map(row => {
      const records = row.records.slice();
      records[0] = row.representative;
      return summarizeJellyTrials(records, trials, seed, false);
    });
    return { seed, trials, measurements };
  }
  const measurements = options.policies.map(policy => {
    const simulationOptions = {
      ...options, ...policy, trials, seed,
      _policyPrefixCache: options.policyPrefixes === false ? null : context.prefixes,
      _prefixTrialLimit: Math.min(32, trials),
    };
    const key = `${jellyLayoutKey(layout)}|${jellyTrialSimulationSignature(simulationOptions)}|${seed}`;
    return options.trialReuse === false
      ? simulateJellyTrials(layout, S, simulationOptions)
      : context.batches.run(key, layout, S, simulationOptions);
  });
  return { seed, trials, measurements };
}

export function mergeJellyPolicyBlocks(blocks, options = {}) {
  const policies = options.policies;
  const keys = Array.isArray(policies) ? policies.map(policy => jellyTrialSimulationSignature({ ...options, ...policy })) : [];
  if (!Array.isArray(policies) || !policies.length || policies.length > 8
    || !blocks.length || blocks.some(block => block.trials !== options.trials
      || block.policyKeys?.length !== keys.length || block.policyKeys.some((key, index) => key !== keys[index])
      || block.blocks?.length !== policies.length || block.blocks.some(row => row.seed !== block.seed
        || row.offset !== block.offset || row.count !== block.count))) {
    throw new Error('Mismatched Jelly policy trial blocks');
  }
  const measurements = policies.map((_, index) => mergeJellyTrialBlocks(
    blocks.map(block => block.blocks[index]), { ...options, includeTrials: false }
  ));
  return { seed: measurements[0].seed, trials: measurements[0].trials, measurements };
}

export function jellyMeasurementKey(layout, options = {}) {
  return JSON.stringify([
    'jelly-measurement-v1', jellyLayoutKey(layout), jellyTrialSimulationSignature(options),
    Math.max(1, Math.min(8192, Math.floor(n(options.trials) || 64))), Math.floor(n(options.seed) || 1),
  ]);
}

function _jellySavedPolicyOptions(S, options) {
  const simulationTrials = Math.max(4, Math.min(1000, Math.floor(n(options.simulationTrials) || 32)));
  const trials = Math.max(4, Math.min(simulationTrials, Math.floor(
    options.screeningTrials == null ? Math.min(8, Math.max(4, Math.ceil(simulationTrials / 4))) : n(options.screeningTrials)
  )));
  return {
    ...options,
    obstruction: options.obstruction == null ? jellyProgress(S).obstruction : Math.max(0, Math.floor(n(options.obstruction))),
    trials, screeningTrials: Math.min(4, trials), seed: Math.floor(n(options.seed) || 1),
    frameTiming: options.screenPolicyFrameTiming === true && options.frameTiming !== false,
  };
}

export function jellySavedPolicyKey(S, options = {}) {
  const request = _jellySavedPolicyOptions(S, options);
  return JSON.stringify([
    _jellyTrialRequestOptions(request), request.objective ?? 'dps', request.expCellType ?? -1,
    request.screeningTrials, request.frameTiming, request.policyWarmStart !== false,
    request.jointPolicyScreening !== false, request.policyPrefixes !== false,
  ]);
}

export function* createJellySavedPolicySearch(S, options = {}) {
  const operation = yield* createJellyPolicySearch(options.layout || jellyLayoutFromSave(S), S,
    _jellySavedPolicyOptions(S, options));
  return { key: jellySavedPolicyKey(S, options), operation };
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
  timings.push(Math.max(0, Math.floor(standardTime - JELLY_ROID_DURATION_SECONDS)), standardTime);
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

function _jellyTrialRequestOptions(options) {
  return Object.fromEntries([
    'obstruction', 'fever', 'roidTiming', 'useRoid', 'revivePolicy', 'cachedTotalCellLevel',
    'secondTickOffset', 'openingProgressByAnchor', 'maxCriticalSeconds', 'runtimeFastPath',
    'firingCalendar', 'seed', 'trials', 'includeTrials', '_compactTrials',
    'policyPrefixes', 'compactSimulation', 'trialReuse',
  ].filter(key => options[key] !== undefined).map(key => [key, options[key]]));
}

export function optimizeJellyOperationPolicy(layout, S, options = {}) {
  return _runJellySearchSync(createJellyPolicySearch(layout, S, options), S);
}

function _runJellySearchSync(search, S) {
  let step = search.next();
  while (!step.done) {
    const request = step.value;
    if (request.kind === 'discoveryWork') {
      step = search.next({ key: request.key, result: runJellyDiscoveryWork(S, request.work), reused: false });
    } else if (request.kind === 'screenBatch') {
      const batches = request.requests.map(item => {
        const measurements = [];
        for (let from = 0; from < item.policies.length; from += 8) measurements.push(
          ...simulateJellyPolicyGroup(item.layout, S, { ...item.options, policies: item.policies.slice(from, from + 8) }).measurements
        );
        return { seed: item.options.seed, trials: item.options.trials, measurements };
      });
      step = search.next({ batches });
    } else if (request.kind === 'policyScreen') {
      const measurements = [];
      for (let from = 0; from < request.policies.length; from += 8) {
        measurements.push(...simulateJellyPolicyGroup(request.layout, S, {
          ...request.options, policies: request.policies.slice(from, from + 8),
        }).measurements);
      }
      step = search.next({ seed: request.options.seed, trials: request.options.trials, measurements });
    } else step = search.next(simulateJellyTrials(request.layout, S, request.options));
  }
  return step.value;
}

export function* createJellyPolicySearch(layout, S, options = {}) {
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
  const sourceTrials = typeof options._simulateTrials !== 'function' || options._sourcePolicyTrials === true;
  const policyCache = options.policyReuse === false || options.includeTrials || !sourceTrials ? null : options._policyCache;
  const policyFamily = JSON.stringify([
    objective, expCellType, obstruction, feverTypes, roidTimings, revivePolicies,
    options.useRoid ?? null, options.cachedTotalCellLevel ?? null,
    options.secondTickOffset ?? null, options.openingProgressByAnchor ?? null, options.maxCriticalSeconds ?? null,
    options.jointPolicyScreening !== false,
  ]);
  const policyCacheKey = JSON.stringify(['jelly-policy-v6', jellyLayoutKey(layout), policyFamily, {
    trials, screeningTrials, seed: Math.floor(n(options.seed) || 1),
    frameTiming: options.frameTiming !== false, warmStart: options.policyWarmStart !== false,
  }]);
  const cachedPolicy = policyCache?.get(policyCacheKey);
  if (cachedPolicy) {
    options.onProgress?.({ phase: 'Reusing completed operation policy', completed: 1, total: 1 });
    return cachedPolicy;
  }
  const runTrials = typeof options._simulateTrials === 'function' ? options._simulateTrials : simulateJellyTrials;
  const prefixes = options.policyPrefixes === false || roidTimings.length < 2 ? null : _createJellyPolicyPrefixCache();
  const policyCacheFamily = {};
  const equivalentPolicies = new Map();
  const frameTimes = [0];
  for (let time = 1 / 60; time <= jellyBossTime(obstruction) + 1 / 60; time += 1 / 60) frameTimes.push(time);
  const physicalKey = policy => {
    const activation = roidActivationTime({ ...options, obstruction, roidTiming: policy.roidTiming });
    let first = 0, last = frameTimes.length;
    while (first < last) {
      const middle = (first + last) >>> 1;
      if (frameTimes[middle] < activation) first = middle + 1;
      else last = middle;
    }
    const revive = ['immunoid-first', 'anchor-first', 'dps-first', 'soak-first'].includes(policy.revivePolicy)
      ? 'immediate' : policy.revivePolicy;
    return `${policy.fever}|${first}|${revive}`;
  };
  const simulationKey = policy => options.policyPrefixes === false
    ? `${policy.fever}|${policy.roidTiming}|${policy.revivePolicy}` : physicalKey(policy);
  const simulate = (board, save, simulationOptions) => {
    // Revives are immediate after a single death, so all four priorities see the same sole dead slot.
    const key = `${simulationKey(simulationOptions)}|${simulationOptions.trials}`;
    if (options.policyPrefixes !== false && equivalentPolicies.has(key)) return equivalentPolicies.get(key);
    const measurementKey = jellyMeasurementKey(board, simulationOptions);
    const measurements = options.consolidateWork !== false && sourceTrials && !simulationOptions.includeTrials
      ? options._measurementCache : null;
    const result = measurements?.get(measurementKey) || runTrials(board, save, {
      ...simulationOptions,
      _compactTrials: options._compactTrials ?? (options.compactSimulation !== false && !options.includeTrials),
      _policyPrefixCache: prefixes,
      _prefixTrialLimit: Math.min(32, screeningTrials),
      _policyCacheFamily: policyCacheFamily,
      _trialCacheQuality: simulation => simulatedObjectiveScore(simulation, objective, expCellType),
    });
    if (result.valid) measurements?.set(measurementKey, result);
    equivalentPolicies.set(key, result);
    return result;
  };
  const screened = [];
  const maximumFinalists = trials >= 128 ? 8 : trials >= 32 ? 5 : 3;
  const progressTotal = Math.max(1, feverTypes.length + 2 * roidTimings.length + 18 + 54 + 4 * revivePolicies.length + maximumFinalists);
  let policyIndex = 0;
  const reportProgress = (phase, completed) => options.onProgress?.({ phase, completed, total: progressTotal });
  function* measurePolicies(policies, simulationOptions) {
    const measurements = options.consolidateWork !== false && sourceTrials && !simulationOptions.includeTrials
      ? options._measurementCache : null;
    const values = policies.map(policy => measurements?.get(
      jellyMeasurementKey(layout, { ...simulationOptions, ...policy })
    ) || null);
    const missing = policies.map((_, index) => index).filter(index => !values[index]);
    if (!missing.length) return values;
    const batch = yield {
      kind: 'policyScreen', layout, policies: missing.map(index => policies[index]).map(({ fever, roidTiming, revivePolicy }) => (
        { fever, roidTiming, revivePolicy }
      )),
      options: { ..._jellyTrialRequestOptions(simulationOptions),
        policyPrefixes: options.policyPrefixes !== false, trialReuse: options.trialReuse !== false },
    };
    if (batch?.seed !== simulationOptions.seed || batch.trials !== simulationOptions.trials
      || batch.measurements?.length !== missing.length) throw new Error('Mismatched Jelly policy screening group');
    missing.forEach((index, position) => {
      values[index] = batch.measurements[position];
      if (values[index].valid) measurements?.set(
        jellyMeasurementKey(layout, { ...simulationOptions, ...policies[index] }), values[index]
      );
    });
    return values;
  }
  function* screenMany(proposals) {
    const existing = new Set(screened.map(candidate => candidate.key));
    const pending = proposals.filter(policy => {
      policy.key = `${policy.fever}|${policy.roidTiming}|${policy.revivePolicy}`;
      if (existing.has(policy.key)) return false;
      existing.add(policy.key);
      return true;
    });
    const groups = new Map();
    for (const policy of pending) {
      const key = `${simulationKey(policy)}|${screeningTrials}`;
      if (options.policyPrefixes !== false && equivalentPolicies.has(key)) continue;
      if (!groups.has(key)) groups.set(key, policy);
    }
    const policies = Array.from(groups.values());
    const simulationOptions = {
      ...options, obstruction, trials: screeningTrials, seed: Math.floor(n(options.seed) || 1),
      _compactTrials: options._compactTrials ?? (options.compactSimulation !== false && !options.includeTrials),
    };
    if (options._cooperativeTrials && sourceTrials && options.policyScreenPooling !== false && !options.includeTrials && policies.length > 1) {
      const measurements = yield* measurePolicies(policies, simulationOptions);
      policies.forEach((policy, index) => equivalentPolicies.set(
        `${simulationKey(policy)}|${screeningTrials}`, measurements[index]
      ));
    } else {
      for (const policy of policies) simulate(layout, S, { ...simulationOptions, ...policy });
    }
    for (const policy of pending) {
      const simulation = equivalentPolicies.get(`${simulationKey(policy)}|${screeningTrials}`);
      screened.push({
        ...policy, screening: simulation, score: simulatedObjectiveScore(simulation, objective, expCellType),
        index: policyIndex++,
      });
      reportProgress('Screening operation policies', screened.length);
    }
  }
  const defaultRoid = roidTimings[0];
  const defaultRevive = revivePolicies[0];
  yield* screenMany(feverTypes.map(fever => ({ fever, roidTiming: defaultRoid, revivePolicy: defaultRevive })));
  const bestFevers = options.jointPolicyScreening === false
    ? screened.slice().sort((a, b) => b.score - a.score || a.index - b.index).slice(0, 2).map(candidate => candidate.fever)
    : feverTypes;
  yield* screenMany(bestFevers.flatMap(fever => roidTimings.map(roidTiming => ({ fever, roidTiming, revivePolicy: defaultRevive }))));
  const coarseTimingLeaders = screened.slice().sort((a, b) => b.score - a.score || a.index - b.index).slice(0, 2);
  const searchTiming = roidTimings.length > 1;
  const integerPolicies = [];
  for (const candidate of searchTiming ? coarseTimingLeaders : []) {
    if (!Number.isFinite(candidate.roidTiming)) continue;
    const start = Math.max(0, Math.floor(candidate.roidTiming) - 4);
    const end = Math.min(jellyBossTime(obstruction), Math.ceil(candidate.roidTiming) + 4);
    for (let second = start; second <= end; second++) integerPolicies.push({
      fever: candidate.fever, roidTiming: second, revivePolicy: defaultRevive,
    });
  }
  yield* screenMany(integerPolicies);
  const warmPolicies = options.policyWarmStart === false ? [] : policyCache?.seeds(layout, policyFamily) || [];
  yield* screenMany(warmPolicies.map(policy => ({ ...policy, revivePolicy: defaultRevive })));
  let frameCandidates = 0;
  if (searchTiming && options.frameTiming !== false) {
    for (const stride of [15, 3, 1]) {
      const keys = new Set();
      const leaders = screened.slice().sort((a, b) => b.score - a.score || a.index - b.index)
        .filter(candidate => {
          const key = physicalKey(candidate);
          if (keys.has(key)) return false;
          keys.add(key);
          return true;
        }).slice(0, 2);
      const framePolicies = [];
      for (const leader of leaders) {
        const center = Math.round(Number(leader.roidTiming) * 60);
        for (let delta = -4; delta <= 4; delta++) {
          const frame = center + delta * stride;
          if (frame < 0 || frame >= frameTimes.length) continue;
          framePolicies.push({ fever: leader.fever, roidTiming: frameTimes[frame], revivePolicy: defaultRevive });
        }
      }
      const before = screened.length;
      yield* screenMany(framePolicies);
      frameCandidates += screened.length - before;
    }
  }
  const bestTimings = screened.slice().sort((a, b) => b.score - a.score || a.index - b.index).slice(0, 4);
  yield* screenMany(bestTimings.flatMap(candidate => revivePolicies.map(revivePolicy => ({
    fever: candidate.fever, roidTiming: candidate.roidTiming, revivePolicy,
  }))));
  screened.sort((a, b) => b.score - a.score || a.index - b.index);
  const physicalKeys = new Set();
  const uniqueScreened = screened.filter(candidate => {
    const key = physicalKey(candidate);
    if (physicalKeys.has(key)) return false;
    physicalKeys.add(key);
    return true;
  });
  const leaderBounds = operationConfidenceBounds(uniqueScreened[0]?.screening, objective, expCellType);
  const finalistCandidates = uniqueScreened.filter(candidate => {
    const bounds = operationConfidenceBounds(candidate.screening, objective, expCellType);
    return bounds[0] <= leaderBounds[1] && leaderBounds[0] <= bounds[1];
  }).slice(0, maximumFinalists);
  for (const candidate of uniqueScreened.slice(0, Math.min(3, uniqueScreened.length))) {
    if (!finalistCandidates.includes(candidate)) finalistCandidates.push(candidate);
  }
  finalistCandidates.sort((a, b) => b.score - a.score || a.index - b.index);
  if (finalistCandidates.length > maximumFinalists) finalistCandidates.length = maximumFinalists;
  let pooledFinalists = null;
  if (options._cooperativeTrials && sourceTrials && options.policyScreenPooling !== false
    && !options.includeTrials && options.policyPrefixes !== false && options.trialReuse !== false
    && trials >= 16 && finalistCandidates.length > 1) {
    reportProgress('Confirming best policies', progressTotal - finalistCandidates.length);
    pooledFinalists = yield* measurePolicies(finalistCandidates, {
      ...options, obstruction, trials, seed: Math.floor(n(options.seed) || 1),
      _compactTrials: options._compactTrials ?? (options.compactSimulation !== false),
    });
  }
  const finalists = [];
  for (const [finalistIndex, candidate] of finalistCandidates.entries()) {
    const simulationOptions = {
      ...options,
      obstruction,
      fever: candidate.fever,
      roidTiming: candidate.roidTiming,
      revivePolicy: candidate.revivePolicy,
      trials,
      seed: Math.floor(n(options.seed) || 1),
      _compactTrials: options._compactTrials ?? (options.compactSimulation !== false && !options.includeTrials),
    };
    const simulation = pooledFinalists ? pooledFinalists[finalistIndex]
      : options._cooperativeTrials && sourceTrials && trials >= 16
        ? yield { layout, options: _jellyTrialRequestOptions(simulationOptions) }
        : simulate(layout, S, simulationOptions);
    reportProgress('Confirming best policies', progressTotal - finalistCandidates.length + finalistIndex + 1);
    finalists.push({
      ...candidate,
      simulation,
      score: simulatedObjectiveScore(simulation, objective, expCellType),
    });
  }
  finalists.sort((a, b) => b.score - a.score || a.index - b.index);
  const best = finalists[0];
  reportProgress('Operation policy complete', progressTotal);
  const result = {
    ...best.simulation,
    objective,
    expCellType,
    fever: best.fever,
    roidTiming: best.roidTiming,
    revivePolicy: best.revivePolicy,
    policiesEvaluated: screened.length,
    screeningTrials,
    policySearch: {
      uniqueScreened: uniqueScreened.length, uniqueFinalists: finalists.length, frameCandidates,
      timingFevers: bestFevers.length,
    },
    note: `${best.simulation.note} Fever, Stronkroid timing, and revival policy were selected by bounded policy search.`,
  };
  if (policyCache && result.valid) {
    const priority = jellyLayoutKey(layout) === options._policySavedLayoutKey ? 1 : 0;
    policyCache.set(policyCacheKey, result, priority);
    options._onPolicyComplete?.(policyCacheKey, result, priority);
  }
  return result;
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

function _compactJellyComparisonTrials(operation) {
  // Keep in sync with trialObjectiveValue; representative retains full diagnostics.
  if (!Array.isArray(operation.results)) return;
  for (let index = 0; index < operation.results.length; index++) {
    const { success, damage, bloodcells, cellExp, expByType, criticalTime } = operation.results[index];
    operation.results[index] = { success, damage, bloodcells, cellExp, expByType, criticalTime };
  }
}

function _setJellySearchCache(cache, key, value, limit) {
  cache.set(key, value);
  if (cache.size > limit) cache.delete(cache.keys().next().value);
}

function _createJellySearchMetricContext(S, keyOf) {
  const geometryCache = new Map();
  const parents = new WeakMap();
  const slotsCache = new Map();
  const cadenceCache = new Map();
  const travelCache = new Map();
  const stats = { geometryBuilds: 0, geometryHits: 0, incrementalUpdates: 0, cadenceHits: 0 };
  const slotsFor = (anchor, type) => {
    const key = anchor * 9 + type;
    if (!slotsCache.has(key)) slotsCache.set(key, jellyFootprintSlots(anchor, type) || []);
    return slotsCache.get(key);
  };
  const influence = (cell, counts, direction) => {
    const reach = cell.type === 3 ? _organelleReachSlots(cell.anchor)
      : [cell.anchor - JELLY_COLS, cell.anchor + JELLY_COLS,
        ...(cell.anchor % JELLY_COLS > 0 ? [cell.anchor - 1] : []),
        ...(cell.anchor % JELLY_COLS < JELLY_COLS - 1 ? [cell.anchor + 1] : [])];
    for (const slot of reach) if (slot >= 0 && slot < JELLY_SIZE) counts[slot] += direction;
  };
  const geometryFor = layout => {
    const key = keyOf(layout);
    const parent = parents.get(layout);
    parents.delete(layout);
    if (geometryCache.has(key)) {
      stats.geometryHits++;
      return geometryCache.get(key);
    }
    const previous = parent && geometryCache.get(keyOf(parent));
    const rawCounts = previous ? previous.rawCounts.slice() : Array(9).fill(0);
    const organelles = previous ? previous.organelles.slice() : new Int16Array(JELLY_SIZE);
    const viruses = previous ? previous.viruses.slice() : new Int16Array(JELLY_SIZE);
    const entries = Object.entries(layout).map(([anchor, type]) => ({ anchor: Number(anchor), type: Number(type) }))
      .sort((a, b) => a.anchor - b.anchor);
    const change = (cell, direction) => {
      rawCounts[cell.type] += direction;
      if (cell.type === 3) influence(cell, organelles, direction);
      if (cell.type === 5) influence(cell, viruses, direction);
    };
    if (previous) {
      stats.incrementalUpdates++;
      for (const cell of previous.entries) if (Number(layout[cell.anchor]) !== cell.type) change(cell, -1);
      for (const cell of entries) if (Number(parent[cell.anchor]) !== cell.type) change(cell, 1);
    } else {
      stats.geometryBuilds++;
      for (const cell of entries) change(cell, 1);
    }
    const geometry = {
      entries, rawCounts, organelles, viruses,
      organelleReach: { has: slot => organelles[slot] > 0 },
      virusReach: { has: slot => viruses[slot] > 0 },
    };
    _setJellySearchCache(geometryCache, key, geometry, 256);
    return geometry;
  };
  return {
    cellLevels: Array.from({ length: 9 }, (_, type) => jellyCellLevel(S, type)),
    geometryFor,
    slotsFor,
    inherit(next, parent) { parents.set(next, parent); return next; },
    cadenceFor(type, cooldownProgress, progressPerFrame) {
      const key = `${type}|${cooldownProgress}|${progressPerFrame}`;
      if (cadenceCache.has(key)) { stats.cadenceHits++; return cadenceCache.get(key); }
      const cadence = jellyAttackCadence(CELL_BASE_COOLDOWNS[type], { cooldownProgress, progressPerFrame });
      _setJellySearchCache(cadenceCache, key, cadence, 1024);
      return cadence;
    },
    travelFor(anchor, type) {
      const key = anchor * 9 + type;
      if (!travelCache.has(key)) travelCache.set(key, jellyProjectileHitDelay(anchor, type, () => 0.5));
      return travelCache.get(key);
    },
    diagnostics: () => ({ ...stats, geometryEntries: geometryCache.size, cadenceEntries: cadenceCache.size }),
  };
}

function _createJellyAdaptiveSearch({ random, keyOf, scoreLayout, propose, mode }) {
  const families = ['replacement', 'relocation', 'dependency-rebuild', 'swap'].map(name => ({
    name, attempts: 0, valid: 0, accepted: 0, improvements: 0, reward: 0,
    simulationSamples: 0, simulationReward: 0,
  }));
  const diagnostics = { mode, proposals: 0, accepted: 0, downhillAccepted: 0, tabuRejected: 0, restarts: 0, families };
  const tabu = new Map();
  let current = null;
  let bestScore = -Infinity;
  let stagnant = 0;
  let temperatureScale = 0;
  let scaleSamples = 0;
  const remember = candidate => {
    tabu.set(keyOf(candidate.layout), true);
    if (tabu.size > 32) tabu.delete(tabu.keys().next().value);
  };
  return {
    diagnostics,
    restart() { current = null; },
    observe(family, reward) {
      const row = families.find(row => row.name === family);
      if (!row || !Number.isFinite(reward)) return;
      row.simulationSamples++;
      row.simulationReward += Math.max(-1, Math.min(1, reward));
    },
    run(seed, budget, progress = 0) {
      if (!current || stagnant >= 96) {
        current = { ...seed, score: scoreLayout(seed.layout) };
        bestScore = current.score;
        stagnant = 0;
        diagnostics.restarts++;
        tabu.clear();
        remember(current);
      }
      const candidates = [];
      let pending = [];
      const accept = candidate => {
        diagnostics.accepted++;
        candidate.family.accepted++;
        if (candidate.score < current.score) diagnostics.downhillAccepted++;
        current = candidate;
        remember(candidate);
      };
      for (let attempt = 0; attempt < budget; attempt++) {
        const untried = families.find(row => row.attempts === 0);
        const priority = row => row.reward / Math.max(1, row.attempts)
          + row.simulationReward / Math.max(1, row.simulationSamples)
          + 0.2 * Math.sqrt(Math.log(2 + diagnostics.proposals) / Math.max(1, row.attempts));
        const family = untried || (random() < 0.15
          ? families[Math.floor(random() * families.length)]
          : families.reduce((best, row) => priority(row) > priority(best) ? row : best));
        family.attempts++;
        diagnostics.proposals++;
        stagnant++;
        const layout = propose(current.layout, family.name, random);
        if (!layout || keyOf(layout) === keyOf(current.layout)) continue;
        family.valid++;
        const score = scoreLayout(layout);
        if (!Number.isFinite(score)) continue;
        const candidate = {
          layout, score, moveFamily: family.name, searchMethod: mode,
          moveParentKey: keyOf(current.layout),
        };
        const delta = (score - current.score) / Math.max(1, Math.abs(current.score));
        const aspiration = score > bestScore;
        if (tabu.has(keyOf(layout)) && !aspiration) { diagnostics.tabuRejected++; continue; }
        candidates.push(candidate);
        if (aspiration) {
          bestScore = score;
          stagnant = 0;
          family.improvements++;
          family.reward += Math.min(1, Math.max(0, delta));
        }
        if (scaleSamples < 16) {
          temperatureScale += Math.abs(delta);
          scaleSamples++;
        }
        if (mode === 'annealing') {
          const scale = Math.max(0.001, temperatureScale / Math.max(1, scaleSamples));
          const temperature = scale * Math.pow(0.01, Math.max(0, Math.min(1, progress)));
          if (delta >= 0 || random() < Math.exp(delta / temperature)) accept({ ...candidate, family });
        } else {
          pending.push({ ...candidate, family });
          if (pending.length >= 4) {
            pending.sort((a, b) => b.score - a.score || keyOf(a.layout).localeCompare(keyOf(b.layout)));
            accept(pending[0]);
            pending = [];
          }
        }
      }
      if (pending.length) {
        pending.sort((a, b) => b.score - a.score || keyOf(a.layout).localeCompare(keyOf(b.layout)));
        accept(pending[0]);
      }
      return candidates;
    },
  };
}

function _fitJellySurrogateCorrection(samples) {
  const ordered = samples.slice().sort((a, b) => a.score - b.score);
  const ranked = samples.slice().sort((a, b) => a.observed - b.observed);
  const percentile = (rows, value, field) => {
    let less = 0;
    let equal = 0;
    for (const row of rows) {
      if (row[field] < value) less++;
      else if (row[field] === value) equal++;
    }
    return (less + equal / 2) / Math.max(1, rows.length);
  };
  const rows = ordered.map(row => ({
    ...row,
    residual: percentile(ranked, row.observed, 'observed') - percentile(ordered, row.score, 'score'),
  }));
  const predictResidual = (features, exclude = null) => {
    const neighbors = rows.filter(row => row !== exclude).map(row => ({
      row,
      distance: features.reduce((sum, value, index) => sum + (value - row.features[index]) ** 2, 0),
    })).sort((a, b) => a.distance - b.distance).slice(0, 4);
    let total = 0;
    let weight = 0;
    for (const neighbor of neighbors) {
      const w = 1 / (0.05 + neighbor.distance);
      total += w * neighbor.row.residual;
      weight += w;
    }
    return weight ? total / weight : 0;
  };
  let rawError = 0;
  let correctedError = 0;
  for (const row of rows) {
    rawError += Math.abs(row.residual);
    correctedError += Math.abs(row.residual - predictResidual(row.features, row));
  }
  const weight = rows.length >= 6 && correctedError < rawError
    ? Math.min(0.75, 1 - correctedError / Math.max(1e-12, rawError)) : 0;
  return {
    diagnostics: {
      samples: rows.length, weight,
      rawError: rawError / Math.max(1, rows.length),
      correctedError: correctedError / Math.max(1, rows.length),
    },
    rank(score, features) { return percentile(ordered, score, 'score') + weight * predictResidual(features); },
    uncertainty(features) {
      const neighbors = rows.map(row => ({
        row, distance: features.reduce((sum, value, index) => sum + (value - row.features[index]) ** 2, 0),
      })).sort((a, b) => a.distance - b.distance).slice(0, 4);
      if (!neighbors.length) return 1;
      const center = neighbors.reduce((sum, neighbor) => sum + neighbor.row.residual, 0) / neighbors.length;
      const spread = Math.sqrt(neighbors.reduce((sum, neighbor) => (
        sum + (neighbor.row.residual - center) ** 2
      ), 0) / neighbors.length);
      return Math.min(1, Math.sqrt(neighbors[0].distance) + spread + 1 / Math.sqrt(rows.length));
    },
  };
}

function _normalizeJellyCandidates(candidates, normalize, keyOf, scoreLayout) {
  const unique = new Map();
  for (const candidate of candidates) {
    const layout = normalize(candidate.layout);
    const key = keyOf(layout);
    const previous = unique.get(key);
    const sourceKeys = new Set([...(previous?.sourceKeys || []), ...(candidate.sourceKeys || [keyOf(candidate.layout)])]);
    const policies = new Map();
    for (const policy of [
      ...(previous?.neighborhoodPolicies || []), previous?.neighborhoodPolicy,
      previous?.screeningPolicy,
      ...(candidate.neighborhoodPolicies || []), candidate.neighborhoodPolicy, candidate.screeningPolicy,
    ].filter(Boolean)) {
      policies.set(`${policy.fever}|${policy.roidTiming}|${policy.revivePolicy}`, {
        fever: policy.fever, roidTiming: policy.roidTiming, revivePolicy: policy.revivePolicy,
      });
    }
    unique.set(key, {
      ...candidate, ...previous, layout, score: scoreLayout(layout),
      sourceKeys: Array.from(sourceKeys), neighborhoodPolicies: Array.from(policies.values()),
      neighborhoodPolicy: policies.values().next().value,
      blindOrigin: Boolean(previous?.blindOrigin || candidate.blindOrigin),
      operationRepairOrigin: Boolean(previous?.operationRepairOrigin || candidate.operationRepairOrigin),
    });
  }
  return Array.from(unique.values());
}

function _selectJellyAcquisition(candidates, limit, predict, keyOf) {
  const rows = candidates.map(candidate => ({ candidate, ...predict(candidate) }));
  rows.sort((a, b) => b.rank - a.rank || keyOf(a.candidate.layout).localeCompare(keyOf(b.candidate.layout)));
  const selected = [];
  const features = new WeakMap();
  const cells = layout => {
    if (!features.has(layout)) features.set(layout, new Set(Object.entries(layout).map(([a, t]) => `${a}:${t}`)));
    return features.get(layout);
  };
  const novelty = candidate => {
    const left = cells(candidate.layout);
    return selected.reduce((minimum, row) => {
      const right = cells(row.candidate.layout);
      let shared = 0;
      for (const cell of left) if (right.has(cell)) shared++;
      return Math.min(minimum, 1 - shared / Math.max(1, left.size + right.size - shared));
    }, 1);
  };
  while (rows.length && selected.length < limit) {
    let bestIndex = 0;
    if (selected.length) {
      let best = -Infinity;
      for (const [index, row] of rows.entries()) {
        const value = row.rank + 0.25 * row.uncertainty + 0.2 * novelty(row.candidate);
        if (value > best) { best = value; bestIndex = index; }
      }
    }
    selected.push(rows.splice(bestIndex, 1)[0]);
  }
  return selected.map(row => row.candidate);
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

function _jellySlotMask(slots) {
  const mask = new Uint32Array(Math.ceil(JELLY_SIZE / 32));
  for (const slot of slots) mask[slot >>> 5] |= 1 << (slot & 31);
  return mask;
}

function _jellyMasksOverlap(left, right) {
  for (let index = 0; index < left.length; index++) if (left[index] & right[index]) return true;
  return false;
}

function _jellyMaskSize(mask) {
  let size = 0;
  for (let word of mask) {
    word -= (word >>> 1) & 0x55555555;
    word = (word & 0x33333333) + ((word >>> 2) & 0x33333333);
    size += (((word + (word >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
  }
  return size;
}

function _jellyConstructionGeometry(S) {
  jellySearchStaticContext(S);
  const context = jellySearchStaticContextCache.get(S);
  if (context.construction) return context.construction;
  const targets = context.placements.filter(row => row.type !== 5)
    .sort((a, b) => b.slots.length - a.slots.length || a.anchor - b.anchor || a.type - b.type)
    .map(row => ({ ...row, mask: _jellySlotMask(row.slots) }));
  const targetsBySlot = Array.from({ length: JELLY_SIZE }, () => []);
  targets.forEach((row, index) => row.slots.forEach(slot => targetsBySlot[slot].push(index)));
  const viruses = (context.placementByType[5] || []).map(row => {
    const reach = [
      row.anchor - JELLY_COLS, row.anchor + JELLY_COLS,
      ...(row.anchor % JELLY_COLS > 0 ? [row.anchor - 1] : []),
      ...(row.anchor % JELLY_COLS < JELLY_COLS - 1 ? [row.anchor + 1] : []),
    ].filter(slot => context.unlockedSet.has(slot));
    return { ...row, reach, targets: Array.from(new Set(reach.flatMap(slot => targetsBySlot[slot]))) };
  });
  const organelles = (context.placementByType[3] || []).map(row => ({
    ...row, mask: _jellySlotMask(row.slots),
    reach: _organelleReachSlots(row.anchor).filter(slot => context.unlockedSet.has(slot)),
  }));
  for (const source of organelles) {
    source.reachMask = _jellySlotMask(source.reach);
    source.contactMask = _jellySlotMask(organelles
      .filter(target => _jellyMasksOverlap(source.reachMask, target.mask)).map(row => row.anchor));
  }
  context.construction = { targets, viruses, organelles };
  return context.construction;
}

function _jellyVirusStructures(S, options) {
  const { targets, viruses } = _jellyConstructionGeometry(S);
  const structuresByCount = new Map();
  const targetFlags = new Uint8Array(targets.length);
  const occupiedMask = _jellySlotMask([]);
  let nodes = 0, enumerated = 0, complete = true;
  const infectionSlotPotential = (rows, reach) => {
    let selected;
    if (options.fastPath === false) {
      selected = targets.filter(row => row.slots.some(slot => reach.has(slot)));
    } else {
      targetFlags.fill(0);
      const indices = [];
      for (const row of rows) for (const index of row.targets) {
        if (targetFlags[index]) continue;
        targetFlags[index] = 1;
        indices.push(index);
      }
      indices.sort((a, b) => a - b);
      selected = indices.map(index => targets[index]);
    }
    let best = 0;
    for (let offset = 0; offset < Math.min(12, Math.max(1, selected.length)); offset++) {
      const occupied = options.fastPath === false ? new Set() : null;
      if (!occupied) occupiedMask.fill(0);
      let covered = 0;
      for (let index = 0; index < selected.length; index++) {
        const row = selected[(index + offset) % selected.length];
        if (occupied ? row.slots.some(slot => occupied.has(slot)) : _jellyMasksOverlap(row.mask, occupiedMask)) continue;
        if (occupied) row.slots.forEach(slot => occupied.add(slot));
        else for (let word = 0; word < occupiedMask.length; word++) occupiedMask[word] |= row.mask[word];
        covered += row.slots.length;
      }
      best = Math.max(best, covered);
    }
    return best;
  };
  const retain = rows => {
    const reach = new Set(rows.flatMap(row => row.reach));
    const infectedVirusSlots = rows.reduce((sum, row) => sum + Number(
      rows.some(other => other.anchor !== row.anchor && other.reach.includes(row.anchor))
    ), 0);
    const candidate = {
      layout: Object.fromEntries(rows.map(row => [row.anchor, 5])),
      count: rows.length, reach: reach.size,
      targetWeight: infectionSlotPotential(rows, reach) + infectedVirusSlots,
    };
    const retained = structuresByCount.get(rows.length) || [];
    retained.push(candidate);
    retained.sort((a, b) => b.targetWeight - a.targetWeight || b.reach - a.reach
      || jellyLayoutKey(a.layout).localeCompare(jellyLayoutKey(b.layout)));
    const cap = Math.max(2, Math.ceil(options.structureLimit / options.countLimit));
    if (retained.length > cap) retained.length = cap;
    structuresByCount.set(rows.length, retained);
    enumerated++;
  };
  const enumerate = (start, count, rows, occupied) => {
    if (nodes >= options.nodeBudget) { complete = false; return; }
    nodes++;
    if (rows.length === count) { retain(rows); return; }
    const needed = count - rows.length;
    for (let index = start; index <= viruses.length - needed; index++) {
      const row = viruses[index];
      if (row.slots.some(slot => occupied.has(slot))) continue;
      const next = new Set(occupied);
      row.slots.forEach(slot => next.add(slot));
      enumerate(index + 1, count, [...rows, row], next);
      if (!complete) return;
    }
  };
  for (let count = 1; count <= options.countLimit && complete; count++) enumerate(0, count, [], new Set());
  const structures = Array.from(structuresByCount.values()).flat()
    .sort((a, b) => a.count - b.count || b.targetWeight - a.targetWeight
      || jellyLayoutKey(a.layout).localeCompare(jellyLayoutKey(b.layout)));
  return { structures, nodes, enumerated, complete };
}

function _jellyJointStructures(S, virusStructures, options, proxyCache, localScorer) {
  const { organelles } = _jellyConstructionGeometry(S);
  const scoreOptions = { ...options.scoreOptions, assumeValid: true };
  if (!localScorer) scoreOptions._metricContext = _jellyProxyMetricContext(S, scoreOptions, jellyLayoutKey);
  const scoreLayout = localScorer || _jellyProxyScorer(S, scoreOptions, proxyCache);
  const jointByCounts = new Map();
  const compare = (a, b) => b.coverage - a.coverage || b.organelleConnections - a.organelleConnections
    || b.proxyScore - a.proxyScore || jellyLayoutKey(a.layout).localeCompare(jellyLayoutKey(b.layout));
  for (const structure of virusStructures) {
    const virusLayout = { ...structure.layout };
    const virusOccupied = new Set(jellyLayoutOccupancy(virusLayout).keys());
    const virusReach = new Set();
    for (const raw of Object.keys(virusLayout)) {
      const anchor = Number(raw);
      virusReach.add(anchor - JELLY_COLS);
      virusReach.add(anchor + JELLY_COLS);
      if (anchor % JELLY_COLS > 0) virusReach.add(anchor - 1);
      if (anchor % JELLY_COLS < JELLY_COLS - 1) virusReach.add(anchor + 1);
    }
    const legal = organelles.filter(row => !row.slots.some(slot => virusOccupied.has(slot))
      && row.slots.some(slot => virusReach.has(slot)));
    const virusAnchors = Object.keys(virusLayout).map(Number);
    const virusMask = _jellySlotMask(virusAnchors);
    const fast = options.fastPath !== false;
    let beam = [{
      layout: virusLayout, occupied: fast ? null : virusOccupied, mask: fast ? _jellySlotMask(virusOccupied) : null,
      reach: fast ? null : new Set(), reachMask: fast ? _jellySlotMask([]) : null,
      contactMask: fast ? _jellySlotMask([]) : null, anchorsMask: fast ? _jellySlotMask([]) : null,
      organelleCount: 0, organelleConnections: 0, coverage: 0, proxyScore: scoreLayout(virusLayout),
    }];
    while (beam.length) {
      const candidates = new Map();
      for (const state of beam) for (const row of legal) {
        if (!fast ? row.slots.some(slot => state.occupied.has(slot))
          : _jellyMasksOverlap(row.mask, state.mask)) continue;
        const layout = { ...state.layout, [row.anchor]: 3 };
        const key = jellyLayoutKey(layout);
        if (candidates.has(key)) continue;
        const occupied = fast ? null : new Set(state.occupied);
        if (occupied) row.slots.forEach(slot => occupied.add(slot));
        const mask = fast ? state.mask.map((word, index) => word | row.mask[index]) : null;
        const reach = fast ? null : new Set(state.reach);
        if (reach) row.reach.forEach(slot => reach.add(slot));
        const reachMask = fast ? state.reachMask.map((word, index) => word | row.reachMask[index]) : null;
        const contactMask = fast ? state.contactMask.map((word, index) => word | row.contactMask[index]) : null;
        const anchorsMask = fast ? state.anchorsMask.slice() : null;
        if (fast) anchorsMask[row.anchor >>> 5] |= 1 << (row.anchor & 31);
        let connections;
        if (!fast) connections = jellyOrganelleConnectionProfile(layout).buffedCells;
        else {
          // Count distinct cells, not footprint contacts or overlapping source links.
          connections = _jellyMaskSize(reachMask.map((word, index) => (word & virusMask[index])
            | (contactMask[index] & anchorsMask[index])));
        }
        candidates.set(key, {
          layout, occupied, mask, reach, reachMask, contactMask, anchorsMask,
          organelleCount: state.organelleCount + 1, organelleConnections: connections,
          coverage: fast ? _jellyMaskSize(reachMask) : reach.size, proxyScore: scoreLayout(layout, key),
        });
      }
      if (!candidates.size) break;
      const sorted = Array.from(candidates.values()).sort(compare);
      const next = [], coverages = new Set();
      for (const candidate of sorted) {
        if (coverages.has(candidate.coverage)) continue;
        coverages.add(candidate.coverage);
        next.push(candidate);
        if (next.length >= Math.ceil(options.beamWidth / 2)) break;
      }
      for (const candidate of sorted) {
        if (next.includes(candidate)) continue;
        next.push(candidate);
        if (next.length >= options.beamWidth) break;
      }
      beam = next;
      for (const candidate of beam) {
        if (candidate.organelleCount < 3) continue;
        const key = `${virusAnchors.length}:${candidate.organelleCount}`;
        const retained = jointByCounts.get(key) || [];
        if (retained.some(row => jellyLayoutKey(row.layout) === jellyLayoutKey(candidate.layout))) continue;
        retained.push(candidate);
        retained.sort(compare);
        if (retained.length > options.retainPerCount) retained.length = options.retainPerCount;
        jointByCounts.set(key, retained);
      }
    }
  }
  return { structures: Array.from(jointByCounts.values()).flat().map(({
    layout, organelleCount, organelleConnections, coverage, proxyScore,
  }) => ({ layout, organelleCount, organelleConnections, coverage, proxyScore })) };
}

export function runJellyDiscoveryWork(S, work, proxyCache) {
  const options = work.options || {};
  if (work.kind === 'virus') return _jellyVirusStructures(S, options);
  if (work.kind === 'joint') return _jellyJointStructures(S, work.structures, options,
    options.proxySharing === false ? null : proxyCache);
  if (work.kind === 'organelle') {
    const { placementByType, unlockedSet, unlocked } = jellySearchStaticContext(S);
    const rows = (placementByType[3] || []).map(row => ({
      ...row, slotSet: new Set(row.slots),
      reach: _organelleReachSlots(row.anchor).filter(slot => unlockedSet.has(slot)),
    }));
    const structureCap = options.structureCap;
    const compare = (a, b) => b.coverage - a.coverage
      || b.connectionProfile.buffedCells - a.connectionProfile.buffedCells
      || a.connectionProfile.redundantContacts - b.connectionProfile.redundantContacts
      || jellyLayoutKey(a.layout).localeCompare(jellyLayoutKey(b.layout));
    const build = selected => {
      const reach = new Set(selected.flatMap(row => row.reach));
      const contactsByTarget = new Map();
      for (const source of selected) {
        const sourceReach = new Set(source.reach);
        for (const target of selected) {
          const contacts = target.slots.reduce((sum, slot) => sum + Number(sourceReach.has(slot)), 0);
          if (contacts) contactsByTarget.set(target.anchor, (contactsByTarget.get(target.anchor) || 0) + contacts);
        }
      }
      const contacts = Array.from(contactsByTarget.values()).reduce((sum, value) => sum + value, 0);
      return {
        layout: Object.fromEntries(selected.map(row => [row.anchor, 3])),
        coverage: reach.size,
        connectionProfile: {
          buffedCells: contactsByTarget.size,
          redundantContacts: Math.max(0, contacts - contactsByTarget.size),
        },
      };
    };
    const select = values => {
      const candidates = Array.from(values).sort(compare);
      const selected = [];
      const keys = new Set();
      const coverages = new Set();
      for (const structure of candidates) {
        if (coverages.has(structure.coverage)) continue;
        selected.push(structure);
        keys.add(jellyLayoutKey(structure.layout));
        coverages.add(structure.coverage);
        if (selected.length >= structureCap) return selected;
      }
      for (const structure of candidates) {
        const key = jellyLayoutKey(structure.layout);
        if (keys.has(key)) continue;
        selected.push(structure);
        keys.add(key);
        if (selected.length >= structureCap) break;
      }
      return selected;
    };
    const byCoverage = new Map();
    for (let first = 0; first < rows.length; first++) {
      options.onProgress?.(first + 1, rows.length);
      for (let second = first + 1; second < rows.length; second++) {
        if (rows[second].slots.some(slot => rows[first].slotSet.has(slot))) continue;
        for (let third = second + 1; third < rows.length; third++) {
          if (rows[third].slots.some(slot => rows[first].slotSet.has(slot) || rows[second].slotSet.has(slot))) continue;
          const structure = build([rows[first], rows[second], rows[third]]);
          const retained = byCoverage.get(structure.coverage) || [];
          retained.push(structure);
          retained.sort(compare);
          if (retained.length > 3) retained.length = 3;
          byCoverage.set(structure.coverage, retained);
        }
      }
    }
    const triples = select(Array.from(byCoverage.values()).flat());
    const geometricLimit = Math.floor(unlocked.length / Math.max(1, cellFootprint(3).length));
    const countLimit = Math.max(3, Math.min(geometricLimit,
      options.countLimit == null ? geometricLimit : Math.floor(n(options.countLimit))));
    const rowByAnchor = new Map(rows.map(row => [row.anchor, row]));
    const structures = triples.slice();
    let previous = triples;
    for (let target = 4; target <= countLimit && previous.length; target++) {
      const candidates = new Map();
      for (const structure of previous) {
        const selected = Object.keys(structure.layout).map(Number).map(anchor => rowByAnchor.get(anchor));
        const occupied = new Set(selected.flatMap(row => row.slots));
        for (const row of rows) {
          if (occupied.has(row.anchor) || row.slots.some(slot => occupied.has(slot))) continue;
          const candidate = build([...selected, row]);
          const key = jellyLayoutKey(candidate.layout);
          const current = candidates.get(key);
          if (!current || compare(candidate, current) < 0) candidates.set(key, candidate);
        }
      }
      previous = select(candidates.values());
      structures.push(...previous);
    }
    return { structures, countLimit };
  }
  if (!['free', 'repack'].includes(work.kind)) throw new Error('Unknown Jelly discovery work');
  const scoreOptions = { ...options.scoreOptions, assumeValid: true };
  const exactOptions = {
    ...options,
    _scoreLayout: layout => proxyObjectiveScore(layout, S, scoreOptions),
  };
  return work.kind === 'free'
    ? enumerateJellyRegionFreeExact(work.layout, S, exactOptions)
    : enumerateJellyRegionRepairsExact(work.layout, S, exactOptions);
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

function operationExpectedClearDays(operation, S) {
  const clearProbability = Math.max(0, Math.min(1, n(operation?.clearProbability)));
  const dailyTries = Math.max(0, jellyDailyTries(S));
  return clearProbability > 0 && dailyTries > 0
    ? 1 / (clearProbability * dailyTries)
    : Infinity;
}

function progressionClearProjection(baseline, candidate, S, waitDays) {
  const observedDays = operationExpectedClearDays(candidate, S);
  if (Number.isFinite(observedDays)) {
    return {
      days: Math.max(0, n(waitDays)) + observedDays,
      basis: 'observed-clear',
    };
  }
  const hp = Math.max(1, n(candidate?.representative?.hp ?? baseline?.representative?.hp));
  const beforeRatio = Math.max(0, n(baseline?.meanDamage) / hp);
  const afterRatio = Math.max(0, n(candidate?.meanDamage) / hp);
  const gain = afterRatio - beforeRatio;
  if (gain <= 0) return { days: Infinity, basis: 'no-progress' };
  const dailyTries = Math.max(1, jellyDailyTries(S));
  const purchaseCycleDays = Math.max(1 / dailyTries, Math.max(0, n(waitDays)));
  return {
    days: purchaseCycleDays * Math.max(1, (1 - beforeRatio) / gain),
    basis: 'boss-damage-projection',
  };
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
  const clearEtaStrategy = strategy.strategy === 'progression' && objective === 'clear';
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
  let stopReason = 'purchase-cap';

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
        detail: `Establishing the current-layout baseline with ${quality.screeningTrials} shared-seed trials before comparing upgrades`,
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
    if (!eligibleOrders.length) {
      stopReason = 'no-eligible-purchase';
      break;
    }

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
    if (!candidateSpecs.length) {
      stopReason = 'planning-horizon';
      break;
    }

    options.onProgress?.({
      phase: `Purchase ${purchaseIndex + 1}: screening ${candidateSpecs.length} legal upgrade state${candidateSpecs.length === 1 ? '' : 's'}`,
      detail: 'Ranking every legal upgrade and slot-section choice with the deterministic operation proxy before Monte Carlo comparison',
      completed: purchaseIndex + 0.15,
      total: purchaseLimit,
    });
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
      const stageName = stageIndex === 0
        ? 'screening'
        : (stageIndex === quality.stages.length - 1 ? 'final comparison' : 'racing');
      const stageStart = 0.15 + 0.70 * stageIndex / quality.stages.length;
      const stageSpan = 0.70 / quality.stages.length;
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
            phase: `Purchase ${purchaseIndex + 1}: ${stageName} ${jellyUpgradeData(candidate.id)?.name || `Upgrade ${candidate.id}`}`,
            detail: `Stage ${stageIndex + 1}/${quality.stages.length} · candidate ${candidateIndex + 1}/${active.length} · ${stageTrials} shared-seed trials${optimizePolicies ? ' · optimizing Fever, Stronkroid, and revival policy' : ''}`,
            completed: purchaseIndex + stageStart + stageSpan * (
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
        candidate.clearProjection = clearEtaStrategy
          ? progressionClearProjection(stageBaseline.operation, state.operation, candidate.save, candidate.waitDays)
          : null;
        candidate.confidence = pairedOperationConfidence(state.operation, stageBaseline.operation, objective, expCellType);
        candidate.simulationTrials = stageTrials;
      }
      active.sort((a, b) => {
        if (clearEtaStrategy) {
          return a.clearProjection.days - b.clearProjection.days
            || a.cost - b.cost
            || b.score - a.score
            || a.order - b.order;
        }
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
    for (let candidateIndex = 0; candidateIndex < active.length; candidateIndex++) {
      const candidate = active[candidateIndex];
      if (lookahead > 1) {
        options.onProgress?.({
          phase: `Purchase ${purchaseIndex + 1}: lookahead from ${jellyUpgradeData(candidate.id)?.name || `Upgrade ${candidate.id}`}`,
          detail: `Exploring deterministic proxy states ${lookahead - 1} purchase level${lookahead === 2 ? '' : 's'} beyond candidate ${candidateIndex + 1}/${active.length}`,
          completed: purchaseIndex + 0.85 + 0.10 * candidateIndex / Math.max(1, active.length),
          total: purchaseLimit,
        });
      }
      candidate.productiveDays = Math.max(0, remainingPlanningDays - candidate.waitDays);
      candidate.productiveAttempts = candidate.productiveDays * Math.max(0, jellyDailyTries(candidate.save));
      candidate.horizonGain = candidate.score * candidate.productiveAttempts;
      candidate.clearProjection = clearEtaStrategy
        ? progressionClearProjection(stageBaseline.operation, candidate.state.operation, candidate.save, candidate.waitDays)
        : null;
      candidate.lookaheadGain = lookahead > 1
        ? bestFutureUpgradeProxyGain(candidate.save, candidate.state.layout, {
          ...stepOptions,
          requestedIds,
          respectBudget,
        }, lookahead - 1, lookaheadMemo)
        : 0;
      const relativeFuture = candidate.lookaheadGain / Math.max(1, Math.abs(candidate.proxyScore));
      candidate.selectionScore = clearEtaStrategy
        ? -candidate.clearProjection.days
        : candidate.horizonGain * (1 + 0.25 * Math.min(3, Math.max(0, relativeFuture)));
      if (objective === 'bloodcells') candidate.selectionScore -= candidate.cost;
    }
    if (purchaseIndex === 0) initialState = stageBaseline;
    active.sort((a, b) => clearEtaStrategy
      ? a.clearProjection.days - b.clearProjection.days
        || a.cost - b.cost
        || a.waitDays - b.waitDays
        || b.score - a.score
        || a.order - b.order
      : b.selectionScore - a.selectionScore
        || a.waitDays - b.waitDays
        || b.efficiency - a.efficiency
        || b.score - a.score
        || a.order - b.order);
    const best = active[0];
    if (analysisOptions.reoptimize) {
      let reoptimizeProgress = 0;
      const reoptimized = evaluateUpgradeState(best.save, best.state.layout, {
        ...stepOptions,
        trials: quality.finalTrials,
        reoptimize: true,
        includeTrials: true,
        onProgress: progress => {
          const localProgress = Number.isFinite(Number(progress.overallPercent))
            ? Number(progress.overallPercent) / 100
            : Number(progress.completed) / Math.max(1, Number(progress.total));
          reoptimizeProgress = Math.max(reoptimizeProgress, Math.max(0, Math.min(1, localProgress)));
          options.onProgress?.({
            phase: `Purchase ${purchaseIndex + 1}: reoptimizing selected layout`,
            detail: `Running the bounded layout search and ${quality.finalTrials} final shared-seed trials for ${jellyUpgradeData(best.id)?.name || `Upgrade ${best.id}`}`,
            completed: purchaseIndex + 0.95 + 0.05 * reoptimizeProgress,
            total: purchaseLimit,
          });
        },
      });
      best.state = reoptimized;
      best.score = upgradeMarginalScore(stageBaseline.operation, reoptimized.operation, objective, expCellType);
      best.efficiency = best.cost > 0 ? best.score / best.cost : best.score > 0 ? Infinity : 0;
      best.horizonGain = best.score * best.productiveAttempts;
      best.clearProjection = clearEtaStrategy
        ? progressionClearProjection(stageBaseline.operation, reoptimized.operation, best.save, best.waitDays)
        : null;
      best.confidence = pairedOperationConfidence(reoptimized.operation, stageBaseline.operation, objective, expCellType);
    }
    if (clearEtaStrategy) {
      const currentExpectedDays = operationExpectedClearDays(stageBaseline.operation, workingSave);
      if (Number.isFinite(currentExpectedDays) && best.clearProjection.days >= currentExpectedDays - 1e-9) {
        stopReason = 'current-state-clears-sooner';
        finalState = stageBaseline;
        break;
      }
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
      projectedClearDays: finiteOrNull(best.clearProjection?.days),
      projectedClearDaysFromStart: finiteOrNull(elapsedDaysBefore + best.clearProjection?.days),
      clearProjectionBasis: best.clearProjection?.basis || null,
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
      detail: `${best.cost > 0 ? `${displayNumber(best.cost)} Bloodcells` : 'Free'}${best.waitDays > 0 ? ` · save for ${displayNumber(best.waitDays)} days` : ''} · recalculating costs, income, prerequisites, and candidate states`,
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
  const startingExpectedClearDays = finiteOrNull(operationExpectedClearDays(initialState.operation, S));
  const finalExpectedClearDays = finiteOrNull(operationExpectedClearDays(finalState.operation, workingSave));
  const projectedClearDays = finalExpectedClearDays == null
    ? sequence.at(-1)?.projectedClearDaysFromStart ?? null
    : elapsedDays + finalExpectedClearDays;
  options.onProgress?.({ phase: 'Purchase plan complete', completed: purchaseLimit, total: purchaseLimit });
  return {
    objective,
    expCellType,
    quality: quality.quality,
    qualityProfile: quality,
    strategy: strategy.strategy,
    clearEtaStrategy,
    stopReason,
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
    startingExpectedClearDays,
    finalExpectedClearDays,
    projectedClearDays: finiteOrNull(projectedClearDays),
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
    note: clearEtaStrategy
      ? `Progress now minimizes projected calendar days to the next obstruction clear, including saving time and limited daily attempts; Bloodcell cost breaks ties. It stops when another purchase would not beat attempting the obstruction now. The purchase count and planning days are safety ceilings.${analysisOptions.reoptimize ? ' The selected layout is re-optimized after each purchase.' : ' The current layout is retained.'}`
      : analysisOptions.reoptimize
        ? 'Purchases may save until an upgrade is affordable, using limited daily attempts and passive Bloodcells to estimate calendar time. Candidates are ranked by benefit delivered over the planning horizon, with proxy screening, shared-seed adaptive simulation, bounded lookahead, and final bounded layout re-optimization. Slot-token upgrades automatically select their best screened section.'
        : 'Purchases may save until an upgrade is affordable, using limited daily attempts and passive Bloodcells to estimate calendar time. Candidates are ranked by benefit delivered over the planning horizon, with proxy screening, shared-seed adaptive simulation, bounded lookahead, and the current layout. Slot-token upgrades still automatically select and fill their best screened section.',
  };
}

export function jellyOperationSurrogate(layout, S, options = {}) {
  return _jellyOperationSurrogate(layout, S, options, false);
}

function _jellyOperationSurrogate(layout, S, options, scoreOnly) {
  const obstruction = options.obstruction == null ? jellyProgress(S).obstruction : options.obstruction;
  const duration = jellyBossTime(obstruction);
  const fever = options.fever == null ? jellyProgress(S).fever : Math.floor(n(options.fever));
  const metrics = _jellyLayoutMetrics(layout, S, {
    fever,
    feverRampPct: fever === 0 ? duration / 2 : 0,
    assumeValid: options.assumeValid,
    _metricContext: options._metricContext,
  }, scoreOnly);
  if (!metrics.valid) return scoreOnly ? -Infinity : { valid: false, reason: metrics.reason, score: -Infinity };
  const hp = jellyBossHp(obstruction);
  const roidLevel = options._metricContext?.roidLevel ?? jellyUpgradeQuantity(S, 29);
  const roidStart = roidLevel >= 1 ? roidActivationTime(options) : Infinity;
  const roidEnd = roidStart + JELLY_ROID_DURATION_SECONDS;
  const roidFactor = 1 + (50 + roidLevel) / 100;
  const coldAverage = fever === 0 ? 1 + duration / 200 : 1;
  const amoebaUnlocked = options._metricContext?.amoebaUnlocked ?? jellyUpgradeQuantity(S, 28) >= 1;
  const bossInterval = jellyBossAttackCooldown(obstruction) / 60;
  const globalSpeed = (options._metricContext?.cellSpeed ?? jellyCellSpeedMultiplier(S, fever)) * metrics.speedPassive;
  const cells = metrics.cells;
  let expectedAmoebaHits = 0;
  let projectedDamage = 0;
  let aliveSlots = 0;
  let liveImmunoidSlots = 0;
  const projectedAttacksByType = scoreOnly && options._metricContext?.scoreScratch
    ? options._metricContext.scoreScratch.projectedAttacks.fill(0) : Array(9).fill(0);
  for (const cell of cells) {
    const travel = (options._metricContext?.travelFor?.(cell.anchor, cell.type)
      ?? jellyProjectileHitDelay(cell.anchor, cell.type, () => 0.5)) * Math.max(0.8, Math.min(1.2, n(options.travelScale) || 1));
    const openingFraction = options.openingFraction == null ? 0.5 : Math.max(0, Math.min(1, n(options.openingFraction)));
    const firstShot = openingFraction / Math.max(1e-12, cell.attacksPerSecond);
    const activeSeconds = Math.max(0, duration - travel - firstShot);
    const roidOverlap = Math.max(0, Math.min(duration, roidEnd) - Math.max(0, roidStart, travel + firstShot));
    const roidAttacksPerSecond = jellyAttackCadence(CELL_BASE_COOLDOWNS[cell.type], {
      globalSpeed,
      localSpeed: cell.organelle * cell.proximity * roidFactor,
    }).attacksPerSecond;
    const attacks = activeSeconds * cell.attacksPerSecond
      + roidOverlap * (roidAttacksPerSecond - cell.attacksPerSecond);
    cell.survival = 1;
    if (cell.type === 0) expectedAmoebaHits += attacks;
    projectedDamage += attacks * cell.damage * coldAverage;
    projectedAttacksByType[cell.type] += attacks;
    aliveSlots += cell.slots.length;
    if (cell.type === 4) liveImmunoidSlots += cell.slots.length;
  }
  const normalRamp = amoebaUnlocked ? 1 + expectedAmoebaHits / 200 : 1;
  projectedDamage *= normalRamp;
  let projectedAttacks = projectedAttacksByType.reduce((sum, value) => sum + value, 0);
  const criticalUnlocked = options._metricContext?.criticalUnlocked ?? jellyUpgradeQuantity(S, 36) === 1;
  let revives = options._metricContext?.revives ?? Math.max(0, Math.floor(jellyUpgradeQuantity(S, 35)));
  let criticalSeconds = 0;
  let previousEvent = 0;
  let nextEvent = bossInterval;
  let criticalEvents = 0;
  const maxCriticalSeconds = Math.max(10, n(options.maxCriticalSeconds) || 600);
  const attritionBias = Math.max(0.5, Math.min(1.5, n(options.anchorAttritionBias) || 1));
  const integrate = seconds => {
    if (seconds <= 0) return;
    let attacks = 0;
    let damage = 0;
    let amoebaHits = 0;
    for (const cell of cells) {
      const cellAttacks = cell.attacksPerSecond * cell.survival * seconds;
      attacks += cellAttacks;
      projectedAttacksByType[cell.type] += cellAttacks;
      damage += cell.dps * cell.survival;
      if (cell.type === 0) amoebaHits += cell.attacksPerSecond * cell.survival;
    }
    damage *= seconds;
    amoebaHits *= seconds;
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
  const objective = options.objective || 'dps';
  const projectedBloodcells = !scoreOnly || objective === 'bloodcells'
    ? projectedDamage * (options._metricContext?.currencyMultiplier ?? jellyCurrencyMultiplier(S, fever)) : 0;
  const expMultiplier = !scoreOnly || objective === 'exp'
    ? options._metricContext?.expMultiplier ?? jellyCellExpMultiplier(S, fever) : 0;
  const projectedExpByType = scoreOnly ? projectedAttacksByType : projectedAttacksByType.map(value => value * expMultiplier);
  if (scoreOnly) for (let type = 0; type < projectedExpByType.length; type++) projectedExpByType[type] *= expMultiplier;
  const projectedExp = projectedExpByType.reduce((sum, value) => sum + value, 0);
  const damageRatio = hp > 0 ? projectedDamage / hp : 0;
  const clearTime = projectedDamage > 0
    ? Math.min(duration + criticalSeconds, (duration + criticalSeconds) / Math.max(1e-12, damageRatio))
    : Infinity;
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
  if (scoreOnly) return score;
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
  const scoreOnly = options.scoreOnly !== false && options._metricContext?.scoreOnly !== false;
  if (options.objective === 'dps') {
    const metrics = _jellyLayoutMetrics(layout, S, {
      fever: options.fever,
      assumeValid: options.assumeValid,
      _metricContext: options._metricContext,
    }, scoreOnly);
    return metrics.valid ? metrics.dps : -Infinity;
  }
  if (scoreOnly) return _jellyOperationSurrogate(layout, S, options, true);
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
    // Recursive enumeration mutates working; identity-keyed scorers need a stable snapshot.
    const layout = { ...working };
    const score = scoreLayout(layout);
    const current = candidateMap.get(key);
    if (!current || score > current.score) candidateMap.set(key, { layout, score });
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

function _jellyGeometryDiversity(candidates) {
  const layouts = [...new Map(candidates.filter(Boolean).map(candidate => {
    const layout = candidate.layout || candidate;
    return [jellyLayoutKey(layout), layout];
  })).values()];
  const anchorSets = layouts.map(layout => new Set(Object.entries(layout).map(([anchor, type]) => `${anchor}:${type}`)));
  const occupancySets = layouts.map(layout => new Set(jellyLayoutOccupancy(layout).keys()));
  const distance = (left, right) => {
    let intersection = 0;
    for (const value of left) if (right.has(value)) intersection++;
    const union = left.size + right.size - intersection;
    return union ? 1 - intersection / union : 0;
  };
  let pairs = 0, anchorTotal = 0, occupancyTotal = 0, anchorMinimum = 1, occupancyMinimum = 1;
  for (let left = 0; left < layouts.length; left++) for (let right = left + 1; right < layouts.length; right++) {
    const anchor = distance(anchorSets[left], anchorSets[right]);
    const occupancy = distance(occupancySets[left], occupancySets[right]);
    pairs++;
    anchorTotal += anchor;
    occupancyTotal += occupancy;
    anchorMinimum = Math.min(anchorMinimum, anchor);
    occupancyMinimum = Math.min(occupancyMinimum, occupancy);
  }
  return { layouts: layouts.length, pairs, meanAnchorTypeDistance: pairs ? anchorTotal / pairs : 0,
    minimumAnchorTypeDistance: pairs ? anchorMinimum : 0, meanOccupancyDistance: pairs ? occupancyTotal / pairs : 0,
    minimumOccupancyDistance: pairs ? occupancyMinimum : 0 };
}

export function finalizeJellyLayout(S, options = {}) {
  return _runJellySearchSync(createJellyFinalistSearch(S, options), S);
}

function _jellyFinalistDiagnostics(rows, S, bands = []) {
  const proxyOrder = rows.slice().sort((a, b) => b.score - a.score
    || jellyLayoutKey(a.layout).localeCompare(jellyLayoutKey(b.layout)));
  const ranks = new Map(proxyOrder.map((row, index) => [jellyLayoutKey(row.layout), index + 1]));
  const audit = rows.map((row, index) => {
    const counts = Array(8).fill(0);
    for (const type of Object.values(row.layout)) if (type >= 0 && type < counts.length) counts[type]++;
    const proxyRank = ranks.get(jellyLayoutKey(row.layout));
    return { proxyRank, simulationRank: index + 1, rankDelta: proxyRank - index - 1,
      composition: counts.join(','), proxyScore: row.score, simulatedScore: row.simulatedScore };
  });
  const detail = (row, type, count) => ({
    type, name: CELL_NAMES[type], count, layout: row?.layout || null,
    operation: stripTrialResults(row?.simulation) || null, score: row?.simulatedScore ?? null,
  });
  const archetypeResults = [], countArchetypeResults = [];
  for (let type = 0; type < jellyUnitsOwned(S); type++) {
    const seen = new Set();
    const candidate = rows.find(row => Object.values(row.layout).includes(type));
    archetypeResults.push(detail(candidate, type, candidate
      ? Object.values(candidate.layout).filter(value => value === type).length : 0));
    for (const row of rows) {
      const count = Object.values(row.layout).filter(value => value === type).length;
      if (seen.has(count)) continue;
      seen.add(count);
      countArchetypeResults.push(detail(row, type, count));
    }
  }
  return {
    archetypeResults, countArchetypeResults,
    proxyAudit: {
      candidates: rows.length,
      rankCorrelation: rows.length > 1
        ? 1 - 6 * audit.reduce((sum, row) => sum + row.rankDelta ** 2, 0) / (rows.length * (rows.length ** 2 - 1)) : 1,
      underRanked: audit.slice().sort((a, b) => b.rankDelta - a.rankDelta).slice(0, 5),
    },
    obstructionBandResults: bands.map(obstruction => {
      const row = rows.find(row => row.obstructionBand === obstruction || row.obstructionBands?.includes(obstruction));
      return { obstruction, layout: row?.layout || null, operation: stripTrialResults(row?.simulation) || null,
        score: row?.simulatedScore ?? null };
    }),
  };
}

function _jellyImmunoidBreakpoint(best, immunoid, S, options) {
  if (!immunoid) return null;
  const preferred = [];
  for (let obstruction = 0; obstruction < 72; obstruction++) {
    const score = row => proxyObjectiveScore(row.layout, S, {
      ...options, objective: 'clear', obstruction, fever: row.simulation.fever,
    });
    if (score(immunoid) > score(best)) preferred.push(obstruction);
  }
  const ranges = [];
  for (const index of preferred) {
    const last = ranges.at(-1);
    if (last && last.end === index - 1) last.end = index;
    else ranges.push({ start: index, end: index });
  }
  return { preferredObstructions: preferred, ranges, firstPreferred: preferred[0] ?? null,
    currentPreferred: preferred.includes(options.obstruction) };
}

export function* createJellyFinalistSearch(S, options = {}) {
  const template = options.template;
  if (!template || !Array.isArray(options.discoveries) || !options.discoveries.length) {
    throw new Error('Shared Jelly finalization requires completed discovery results');
  }
  const objective = options.objective || 'clear';
  const expCellType = normalizeExpCellType(S, options.expCellType);
  const saved = template.savedLayout;
  const savedKey = jellyLayoutKey(saved);
  options = { ...options, _policySavedLayoutKey: savedKey };
  const pool = new Map();
  const leaders = new Set();
  for (const discovery of options.discoveries) {
    leaders.add(jellyLayoutKey(discovery.layout));
    for (const candidate of discovery.candidates || []) {
      const validation = jellyValidateLayout(candidate.layout, S);
      if (!validation.valid) throw new Error(`Invalid shared Jelly finalist: ${validation.reason}`);
      const key = jellyLayoutKey(candidate.layout);
      const previous = pool.get(key);
      const roles = [...new Set([...(previous?.roles || []), ...(candidate.roles || [])])];
      const best = !previous || candidate.score > previous.score ? candidate : previous;
      const obstructionBands = [...new Set([...(previous?.obstructionBands || []), ...(candidate.obstructionBands || [])])];
      pool.set(key, { ...best, roles, obstructionBands, mandatory: candidate.mandatory || previous?.mandatory });
    }
  }
  if (!pool.has(savedKey)) throw new Error('Shared Jelly finalists are missing the saved baseline');
  const ranked = [...pool.values()].sort((a, b) => b.score - a.score
    || jellyLayoutKey(a.layout).localeCompare(jellyLayoutKey(b.layout)));
  const selected = new Map();
  const add = candidate => { if (candidate) selected.set(jellyLayoutKey(candidate.layout), candidate); };
  ranked.slice(0, Math.max(1, Math.floor(n(options.finalistCount) || 8))).forEach(add);
  ranked.filter(candidate => candidate.mandatory || leaders.has(jellyLayoutKey(candidate.layout))).forEach(add);
  for (const role of new Set(ranked.flatMap(candidate => candidate.roles))) {
    add(ranked.find(candidate => candidate.roles.includes(role)));
  }
  for (let type = 0; type < jellyUnitsOwned(S); type++) {
    add(ranked.find(candidate => Object.values(candidate.layout).includes(type)));
  }
  const candidates = [...selected.values()];
  const trials = Math.max(4, Math.min(8192, Math.floor(n(options.simulationTrials) || 256)));
  const cap = Math.max(trials, Math.min(8192, Math.floor(n(options.adaptiveMaxTrials) || 2048)));
  const seed = Math.floor(n(options.seed) || 1);
  const validationSeed = (seed ^ 0x6a09e667) >>> 0;
  const confirmationSeed = (seed ^ 0xbb67ae85) >>> 0;
  const validationTrials = Math.min(trials, Math.max(32, Math.floor(trials / 2)));
  const cache = _createJellyTrialBatchCache();
  const report = (phase, percent) => options.onProgress?.({
    phase, completed: percent, total: 100, overallPercent: percent,
    detail: `${pool.size} unique discovered boards; ${candidates.length} shared finalists`,
  });
  function* measure(candidate, count, batchSeed, raw) {
    const request = {
      ...options, discoveries: undefined, template: undefined,
      fever: candidate.simulation.fever, roidTiming: candidate.simulation.roidTiming,
      revivePolicy: candidate.simulation.revivePolicy, trials: count, seed: batchSeed,
      includeTrials: raw, _compactTrials: options.compactSimulation !== false,
    };
    const key = `${jellyLayoutKey(candidate.layout)}|${jellyTrialSimulationSignature(request)}|${batchSeed}`;
    let result;
    if (!options._cooperativeTrials) {
      result = options.trialReuse === false ? simulateJellyTrials(candidate.layout, S, request)
        : cache.run(key, candidate.layout, S, request);
    } else {
      const prefix = raw && options.trialReuse !== false ? cache.takePrefix(key, count, batchSeed) : null;
      result = prefix?.count === count ? mergeJellyTrialBlocks([prefix], request)
        : yield {
          layout: candidate.layout, prefixBlock: prefix,
          options: { ..._jellyTrialRequestOptions(request), trialOffset: prefix?.count || 0 },
        };
      if (raw && options.trialReuse !== false) cache.recordPrefix(key, result, prefix?.count || 0, count < cap);
    }
    if (!result?.valid) throw new Error(`Shared Jelly measurement failed: ${result?.reason || 'missing result'}`);
    if (raw) _compactJellyComparisonTrials(result);
    return result;
  }
  for (const [index, candidate] of candidates.entries()) {
    candidate.simulation = yield* createJellyPolicySearch(candidate.layout, S, {
      ...options, discoveries: undefined, template: undefined, trials, seed,
      onProgress: progress => report(`Shared policies ${index + 1}/${candidates.length}: ${progress.phase}`,
        60 * (index + n(progress.completed) / Math.max(1, n(progress.total))) / candidates.length),
    });
    candidate.validation = yield* measure(candidate, validationTrials, validationSeed, false);
    const trainingScore = simulatedObjectiveScore(candidate.simulation, objective, expCellType);
    const validationScore = simulatedObjectiveScore(candidate.validation, objective, expCellType);
    candidate.rankScore = 0.75 * Math.min(trainingScore, validationScore)
      + 0.25 * Math.max(trainingScore, validationScore);
  }
  candidates.sort((a, b) => b.rankScore - a.rankScore
    || jellyLayoutKey(a.layout).localeCompare(jellyLayoutKey(b.layout)));
  const bounds = operationConfidenceBounds(candidates[0].validation, objective, expCellType);
  const confirmed = candidates.filter((candidate, index) => {
    const other = operationConfidenceBounds(candidate.validation, objective, expCellType);
    return index < 2 || candidate.mandatory || (other[0] <= bounds[1] && bounds[0] <= other[1]);
  });
  const stages = [];
  let count = Math.min(cap, Math.max(512, trials));
  let competitive = confirmed;
  const order = () => confirmed.sort((a, b) =>
    simulatedObjectiveScore(b.simulation, objective, expCellType)
      - simulatedObjectiveScore(a.simulation, objective, expCellType)
    || jellyLayoutKey(a.layout).localeCompare(jellyLayoutKey(b.layout)));
  while (competitive.length) {
    for (const [index, candidate] of competitive.entries()) {
      report(`Shared confirmation ${count} trials: ${index + 1}/${competitive.length}`,
        60 + 38 * Math.min(1, (count / cap) * (index + 1) / competitive.length));
      const simulation = yield* measure(candidate, count, confirmationSeed, true);
      candidate.simulation = { ...candidate.simulation, ...simulation };
    }
    stages.push({ trials: count, candidates: competitive.length, phase: 'shared-paired-confirmation' });
    order();
    if (count >= cap) break;
    const leader = confirmed[0];
    competitive = confirmed.filter(candidate => candidate === leader
      || (pairedOperationConfidence(candidate.simulation, leader.simulation, objective, expCellType)?.high ?? Infinity) > 0);
    if (competitive.length <= 1) break;
    count = [512, 1000, 2048, 4096, 8192, cap].find(next => next > count && next <= cap) || cap;
  }
  const baseline = confirmed.find(candidate => jellyLayoutKey(candidate.layout) === savedKey);
  const classification = confidence => !confidence ? 'unavailable'
    : confidence.low > 0 ? 'confirmed-better' : confidence.high < 0 ? 'confirmed-worse' : 'statistically-unresolved';
  const confidence = candidate => pairedOperationConfidence(candidate.simulation, baseline.simulation, objective, expCellType);
  const challenger = confirmed[0];
  const best = jellyLayoutKey(challenger.layout) === savedKey || classification(confidence(challenger)) !== 'confirmed-better'
    ? baseline : challenger;
  const bestKey = jellyLayoutKey(best.layout);
  const rows = [...confirmed, ...candidates.filter(candidate => !confirmed.includes(candidate))];
  const comparison = candidate => {
    const paired = pairedOperationConfidence(candidate.simulation, best.simulation, objective, expCellType);
    return paired ? { ...paired, classification: classification(paired) } : null;
  };
  const operation = candidate => candidate ? stripTrialResults(candidate.simulation) : null;
  const blind = rows.find(candidate => candidate.roles.includes('blind'));
  const immunoid = rows.find(candidate => candidate.roles.includes('immunoid'));
  const score = candidate => candidate ? simulatedObjectiveScore(candidate.simulation, objective, expCellType) : null;
  const vsSaved = best === baseline
    ? { trials: baseline.simulation.trials, chanceBeatsBaseline: 0.5, meanDifference: 0, low: 0, high: 0, classification: 'same-layout' }
    : { ...confidence(best), classification: classification(confidence(best)) };
  const runner = confirmed.find(candidate => candidate !== best);
  const runnerConfidence = runner
    ? pairedOperationConfidence(best.simulation, runner.simulation, objective, expCellType) : null;
  const diagnostics = options.consolidateWork === false ? null : _jellyFinalistDiagnostics(rows.map(row => ({
    ...row, simulatedScore: score(row), score: proxyObjectiveScore(row.layout, S, {
      ...options, fever: row.simulation.fever,
    }),
  })), S, [...new Set(rows.flatMap(row => row.obstructionBands))]);
  report('Shared finalist comparison complete', 100);
  return {
    ...template, discoveryCandidates: undefined,
    objective, expCellType, layout: best.layout, fever: best.simulation.fever,
    score: score(best), savedScore: score(baseline), proxyScore: null,
    operation: operation(best), savedOperation: operation(baseline),
    metrics: jellyLayoutMetrics(best.layout, S, { fever: best.simulation.fever }),
    savedMetrics: jellyLayoutMetrics(saved, S, { fever: best.simulation.fever }),
    moves: jellyLayoutMoves(saved, best.layout),
    anchorContributions: jellyAnchorContributions(best.layout, S, { fever: best.simulation.fever }),
    blindLayout: blind?.layout || null, blindOperation: operation(blind), blindScore: score(blind),
    blindMoves: blind ? jellyLayoutMoves(saved, blind.layout) : [],
    immunoidLayout: immunoid?.layout || null, immunoidOperation: operation(immunoid), immunoidScore: score(immunoid),
    immunoidBreakpoint: options.consolidateWork === false ? null : _jellyImmunoidBreakpoint(best, immunoid, S, options),
    countArchetypeResults: [], obstructionBandResults: [], proxyAudit: null,
    archetypeResults: Array.from({ length: jellyUnitsOwned(S) }, (_, type) => {
      const candidate = rows.find(row => Object.values(row.layout).includes(type));
      return { type, name: CELL_NAMES[type], layout: candidate?.layout || null, operation: operation(candidate),
        count: candidate ? Object.values(candidate.layout).filter(value => value === type).length : 0, score: score(candidate) };
    }),
    ...diagnostics,
    seedComparison: {
      ...template.seedComparison,
      entries: (template.seedComparison?.entries || []).map(entry => {
        const candidate = rows.find(row => jellyLayoutKey(row.layout) === entry.key);
        const filled = entry.filled && rows.find(row => jellyLayoutKey(row.layout) === entry.filled.key);
        return { ...entry, rank: candidate ? rows.indexOf(candidate) + 1 : null, simulated: Boolean(candidate),
          operation: operation(candidate), simulatedScore: score(candidate), isWinner: entry.key === bestKey,
          vsBest: candidate && entry.key !== bestKey ? comparison(candidate) : null,
          filled: filled ? { ...entry.filled, rank: rows.indexOf(filled) + 1, simulatedScore: score(filled),
            isWinner: entry.filled.key === bestKey } : null };
      }),
    },
    challengerComparison: challenger !== baseline ? {
      layout: challenger.layout, operation: operation(challenger), simulatedScore: score(challenger),
      confidence: confidence(challenger), classification: classification(confidence(challenger)), selected: best === challenger,
    } : null,
    adaptiveConfirmation: { triggered: true, initialTrials: trials, confirmedTrials: count,
      candidates: confirmed.length, stages, validationTrials, heldoutValidation: true },
    pairedConfirmation: { available: true, seed: confirmationSeed, objective, vsSaved,
      vsRunnerUp: runnerConfidence ? { ...runnerConfidence, classification: classification(runnerConfidence),
        baselineLayoutKey: jellyLayoutKey(runner.layout) } : null },
    search: { ...template.search, model: 'shared-finalization', finalists: candidates.length,
      normalizedFinalists: candidates.length,
      finalistGeometryDiversity: _jellyGeometryDiversity(candidates),
      sharedFinalization: { starts: options.discoveries.length, uniqueCandidates: pool.size,
        policyFinalists: candidates.length, confirmedCandidates: confirmed.length, stages },
      trialReuse: cache.diagnostics() },
    evaluationLedger: [
      ...(template.evaluationLedger || []).filter(row => !['Final recommendation', 'Held-out validation',
        'Held-out confirmation', 'Adaptive paired confirmation'].includes(row.phase)),
      { phase: 'Shared finalist policies', method: 'Deduplicated cross-start shortlist', candidates: candidates.length,
        trials, claim: 'best-found-only', evidence: 'Policy optimization runs once per selected geometry, after discovery starts merge.' },
      { phase: 'Shared held-out validation', method: 'Independent validation seeds', candidates: candidates.length,
        trials: validationTrials, claim: 'out-of-sample-ranking-evidence', evidence: 'Saved and submitted boards are mandatory.' },
      ...stages.map(stage => ({ phase: 'Shared paired confirmation', method: 'Shared-seed paired difference',
        candidates: stage.candidates, trials: stage.trials, claim: 'statistical-comparison',
        evidence: 'Exactly tied observed outcomes remain unresolved without repeatedly escalating the same tie.' })),
      { phase: 'Final recommendation', method: 'Saved-baseline paired comparison', candidates: confirmed.length,
        trials: best.simulation.trials, claim: vsSaved.classification, evidence: 'A fresh frozen-winner audit remains separate; no global-optimum claim.' },
    ],
  };
}

export function optimizeJellyLayout(S, options = {}) {
  return _runJellySearchSync(createJellyLayoutSearch(S, options), S);
}

export function* createJellyLayoutSearch(S, options = {}) {
  options = {
    ...options,
    _policyCache: options.policyReuse === false ? null : options._policyCache || createJellyPolicyCache(),
  };
  const discoveryPooling = options._cooperativeTrials && options.discoverySharing !== false;
  const phaseTimes = {};
  let profilePhase = 'construction';
  const discoveryNow = () => typeof performance === 'undefined' ? Date.now() : performance.now();
  let phaseStarted = discoveryNow();
  const enterPhase = phase => {
    const now = discoveryNow();
    phaseTimes[profilePhase] = (phaseTimes[profilePhase] || 0) + now - phaseStarted;
    phaseStarted = now;
    profilePhase = phase;
    options._onDiscoveryPhase?.(phase);
  };
  const discoveryWorkStats = { requests: 0, reused: 0 };
  function* discoveryWork(work) {
    discoveryWorkStats.requests++;
    if (!discoveryPooling) return runJellyDiscoveryWork(S, work, options._proxyCache);
    const key = JSON.stringify(work);
    const response = yield { kind: 'discoveryWork', work, key };
    if (response?.key !== key || !response.result) throw new Error('Mismatched Jelly discovery work');
    if (response.reused) discoveryWorkStats.reused++;
    return response.result;
  }
  let liveSearchUpdate = null;
  let liveDiversitySnapshot = () => null;
  const progressDetail = (phase) => {
    const normalized = String(phase || '').toLowerCase();
    if (normalized.includes('building legal placements')) return 'Indexing every legal cell anchor and footprint';
    if (normalized.includes('packing saved composition')) return 'Repacking the imported cell counts into alternative legal geometries';
    if (normalized.includes('building composition seeds')) return 'Building full-board seeds from balanced, specialized, and randomized cell orders';
    if (normalized.includes('enumerating organelle')) return 'Enumerating high-coverage Organelle structures before filling the remaining board';
    if (normalized.includes('constructing board-aware')) return 'Scoring the whole resulting board for every candidate cell instead of taking the first legal anchor';
    if (normalized.includes('preparing search')) return 'Seeding independent search islands and structural archives';
    if (normalized.includes('experimenting with bases')) return 'Preserving distinct base lineages while applying coarse multi-cell rebuilds';
    if (normalized.includes('refining base families')) return 'Applying granular placements and relocations within the strongest surviving base families';
    if (normalized.includes('building layouts')) return 'Expanding independent beams with placements, removals, and island mutations';
    if (normalized.includes('exploring saved-board') || normalized.includes('saved-board')) return 'Relocating cells around the imported board to cross remove/place score valleys';
    if (normalized.includes('refining layouts')) return 'Applying placement/removal refinement to the merged search leaders';
    if (normalized.includes('ranking structural niches')) return 'Ranking composition, Virus, Organelle, travel, and survival niches';
    if (normalized.includes('preparing simulation policies')) return 'Choosing the Fever, Stronkroid, and revival policies used for screening';
    if (normalized.includes('screening candidate') || normalized.includes('screening')) return 'Running short shared-seed simulations across the structural shortlist';
    if (normalized.includes('calibrating candidate') || normalized.includes('calibrating')) return 'Correcting proxy rankings with low-trial simulation evidence';
    if (normalized.includes('simulation feedback')) return 'Learning from operation results and testing distinct policy-aware repairs across several leaders';
    if (normalized.includes('refining candidate neighborhoods')) return 'Testing relocations, swaps, and exact local region rebuilds around leaders';
    if (normalized.includes('racing candidate') || normalized.includes('racing') || normalized.includes('candidate race')) return 'Giving the strongest and statistically competitive layouts more trials';
    if (normalized.includes('selecting discovery finalists')) return 'Retaining strong layouts plus saved, submitted, and structural baseline candidates';
    if (normalized.includes('checking finalist policies')) return 'Checking the full policy portfolio for each discovery finalist before the shared comparison';
    if (normalized.includes('preparing winner neighborhoods')) return 'Building legal relocations, swaps, and coupled Organelle/Virus challengers';
    if (normalized.includes('checking winner neighborhood')) return 'Exhaustively checking relocations, swaps, and coupled Organelle/Virus moves near the leader';
    if (normalized.includes('promoting neighborhood')) return 'Fully optimizing a neighborhood challenger that passed low-trial screening';
    if (normalized.includes('simulating finalist') || normalized.includes('validating finalist') || normalized.includes('final validation') || normalized.includes('validation')) return 'Fully optimizing policies and simulating the surviving layouts';
    if (normalized.includes('confirming finalist')) return 'Measuring finalists on a fresh held-out seed batch';
    if (normalized.includes('resolving close finalists')) return 'Increasing paired trials for statistically overlapping finalists';
    if (normalized.includes('layout optimization complete')) return options.deferFinalization
      ? 'Discovery shortlist ready; shared finalist comparison follows' : 'Final recommendation ready';
    if (normalized.includes('initializing')) return 'Preparing search queue';
    if (normalized.includes('enumerating exact')) return 'Enumerating exact layouts';
    if (normalized.includes('certifying')) return 'Certifying local optimality';
    if (normalized.includes('parallel search')) return 'Searching in parallel';
    return 'Working through the current search stage';
  };
  const reportLayoutProgress = (phase, overallPercent, completed = overallPercent, total = 100) => {
    options.onProgress?.({
      phase,
      detail: progressDetail(phase),
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
  const geometryDiversitySummary = _jellyGeometryDiversity;
  const savedKey = keyOf(saved);
  options._policySavedLayoutKey = savedKey;
  const seedRequests = Array.isArray(options.seedLayouts) ? options.seedLayouts : [];
  const seedEntries = [];
  const seedRejections = [];
  const seedExactKeys = new Set();
  seedRequests.forEach((request, index) => {
    const wrapped = request && typeof request === 'object' && !Array.isArray(request) && request.layout ? request : { layout: request };
    const label = wrapped.label ? String(wrapped.label) : `Seed ${index + 1}`;
    const layout = {};
    let malformed = '';
    for (const [rawAnchor, rawType] of Object.entries(wrapped.layout || {})) {
      const anchor = Number(rawAnchor);
      const type = Number(rawType);
      if (!Number.isInteger(anchor) || !Number.isInteger(type)) {
        malformed = 'Every anchor and cell type must be an integer';
        break;
      }
      layout[anchor] = type;
    }
    if (!malformed && !Object.keys(layout).length) malformed = 'The layout has no cells';
    const validation = malformed ? { valid: false, reason: malformed } : jellyValidateLayout(layout, S);
    if (!validation.valid) {
      seedRejections.push({ index, label, reason: validation.reason });
      return;
    }
    const key = keyOf(layout);
    if (seedExactKeys.has(key)) {
      seedRejections.push({ index, label, reason: 'Duplicate of an earlier seed layout' });
      return;
    }
    seedExactKeys.add(key);
    seedEntries.push({ index, label, layout, key, matchesSaved: key === savedKey });
  });
  const seedCandidateKeys = new Set(seedExactKeys);
  const fever = proxyFeverType(saved, S, objective, obstruction, options.fever, expCellType);
  const discoveryScoreOptions = Object.fromEntries([
    ...Object.entries({ objective, fever, obstruction, expCellType }),
    ...['roidTiming', 'useRoid', 'travelScale', 'openingFraction', 'anchorAttritionBias', 'maxCriticalSeconds', 'scoreOnly']
      .filter(key => options[key] !== undefined).map(key => [key, options[key]]),
  ]);
  const metricContext = _jellyProxyMetricContext(S, { ...options, objective, fever, obstruction }, keyOf);
  const staticSearchContext = jellySearchStaticContext(S);
  const { types, unlockedSet, unlocked, placements, placementByType } = staticSearchContext;
  const sharedEliteEntries = (Array.isArray(options.sharedEliteLayouts) ? options.sharedEliteLayouts : [])
    .slice(0, 6).map(row => ({ layout: { ...(row.layout || row) }, sourceStart: row.sourceStart }))
    .filter(row => jellyValidateLayout(row.layout, S).valid && keyOf(row.layout) !== savedKey);
  const searchStartOffset = Math.max(0, Math.floor(n(options.searchStartOffset)));
  const structuralStartSeed = Math.imul(searchStartOffset + 1, 0x85ebca6b);
  const searchRandom = seededRandom(
    (Math.floor(n(options.seed) || 1) ^ 0x7f4a7c15 ^ structuralStartSeed) >>> 0
  );
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
    options.screeningCandidateCount == null ? finalistCount * 8 : n(options.screeningCandidateCount)
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
  const trialBatchCache = _createJellyTrialBatchCache();
  const occupancyCache = new WeakMap();
  let simulationCacheHits = 0;
  let simulationCacheMisses = 0;
  let simulationTrialRecordsCompacted = 0;
  const searchProfile = { scoresComputed: 0, scoreCacheHits: 0, scoringMs: 0, simulationMs: 0 };
  const proxyCache = options.proxySharing === true ? options._proxyCache : null;
  const proxyStatsBefore = proxyCache?.diagnostics();
  const computeScore = _jellyProxyScorer(S, {
    ...discoveryScoreOptions, assumeValid: true, _metricContext: metricContext,
  }, proxyCache);
  const cachedSimulateTrials = (layout, saveData, simulationOptions = {}) => {
    const cacheKey = options.consolidateWork !== false && !simulationOptions.includeTrials
      ? jellyMeasurementKey(layout, simulationOptions) : JSON.stringify([
      keyOf(layout), jellyTrialSimulationSignature(simulationOptions),
      Math.max(1, Math.min(8192, Math.floor(n(simulationOptions.trials) || 64))),
      Math.floor(n(simulationOptions.seed) || 1), !!simulationOptions.includeTrials,
    ]);
    if (simulationCache.has(cacheKey)) {
      simulationCacheHits++;
      return simulationCache.get(cacheKey);
    }
    const shared = !simulationOptions.includeTrials ? options._measurementCache?.get(cacheKey) : null;
    if (shared) {
      simulationCacheHits++;
      _setJellySearchCache(simulationCache, cacheKey, shared, 256);
      return shared;
    }
    simulationCacheMisses++;
    const started = options.profileSearch ? performance.now() : 0;
    const batchKey = `${keyOf(layout)}|${jellyTrialSimulationSignature(simulationOptions)}|${Math.floor(n(simulationOptions.seed) || 1)}`;
    const runtimeOptions = { ...simulationOptions, _compactTrials: options.compactSimulation !== false };
    const simulation = options.trialReuse === false
      ? simulateJellyTrials(layout, saveData, runtimeOptions)
      : trialBatchCache.run(batchKey, layout, saveData, runtimeOptions);
    if (options.profileSearch) searchProfile.simulationMs += performance.now() - started;
    if (simulationOptions.includeTrials) {
      simulationTrialRecordsCompacted += simulation.results?.length || 0;
      _compactJellyComparisonTrials(simulation);
    } else {
      _setJellySearchCache(simulationCache, cacheKey, simulation, 256);
      if (simulation.valid) options._measurementCache?.set(cacheKey, simulation, keyOf(layout) === savedKey ? 1 : 0);
    }
    return simulation;
  };
  function* finalistTrials(layout, simulationOptions) {
    if (!options._cooperativeTrials) return cachedSimulateTrials(layout, S, simulationOptions);
    const requestOptions = _jellyTrialRequestOptions({
      ...simulationOptions, _compactTrials: options.compactSimulation !== false,
    });
    const batchKey = `${keyOf(layout)}|${jellyTrialSimulationSignature(requestOptions)}|${Math.floor(n(requestOptions.seed) || 1)}`;
    const reuse = options.trialReuse !== false && requestOptions.includeTrials;
    const prefixBlock = reuse
      ? trialBatchCache.takePrefix(batchKey, requestOptions.trials, requestOptions.seed) : null;
    const result = prefixBlock?.count === requestOptions.trials
      ? mergeJellyTrialBlocks([prefixBlock], requestOptions)
      : yield {
        layout, prefixBlock,
        options: prefixBlock ? { ...requestOptions, trialOffset: prefixBlock.count } : requestOptions,
      };
    if (reuse) trialBatchCache.recordPrefix(batchKey, result, prefixBlock?.count || 0,
      result.trials < adaptiveMaxTrials);
    if (simulationOptions.includeTrials) _compactJellyComparisonTrials(result);
    return result;
  }
  const scoreLayout = layout => {
    const key = `${objective}|${obstruction}|${fever}|${keyOf(layout)}`;
    if (layoutScoreCache.has(key)) { searchProfile.scoreCacheHits++; return layoutScoreCache.get(key); }
    const started = options.profileSearch ? performance.now() : 0;
    const score = computeScore(layout, keyOf(layout));
    _setJellySearchCache(layoutScoreCache, key, score, 4096);
    searchProfile.scoresComputed++;
    if (options.profileSearch) searchProfile.scoringMs += performance.now() - started;
    return score;
  };
  const liveEvidenceRank = {
    proxy: 1,
    screening: 2,
    racing: 3,
    finalist: 4,
  };
  const liveCandidateMetrics = (candidate, evidence) => {
    const operation = candidate.simulation || candidate.screening || candidate.operation || null;
    if (operation?.valid) {
      return {
        kind: 'simulation',
        trials: n(operation.trials),
        successCount: n(operation.successCount),
        clearProbability: n(operation.clearProbability),
        clearProbabilityLow: n(operation.clearProbabilityLow),
        clearProbabilityHigh: n(operation.clearProbabilityHigh),
        damage: n(operation.meanDamage),
        hp: n(operation.representative?.hp ?? jellyBossHp(obstruction)),
        bloodcells: n(operation.meanBloodcells),
        exp: operationExpValue(operation, expCellType),
        survival: n(operation.meanCriticalTime),
        peakDps: n(operation.meanPeakDps),
      };
    }
    const surrogate = jellyOperationSurrogate(candidate.layout, S, {
      ...options,
      objective,
      expCellType,
      fever,
      obstruction,
      assumeValid: true,
      _metricContext: metricContext,
    });
    return {
      kind: evidence === 'proxy' ? 'projection' : 'simulation',
      trials: 0,
      successCount: 0,
      clearProbability: null,
      clearProbabilityLow: null,
      clearProbabilityHigh: null,
      damage: n(surrogate.projectedDamage),
      hp: n(surrogate.hp ?? jellyBossHp(obstruction)),
      damageRatio: n(surrogate.damageRatio),
      bloodcells: n(surrogate.projectedBloodcells),
      exp: expCellType < 0
        ? n(surrogate.projectedExp)
        : n(surrogate.projectedExpByType?.[expCellType]),
      survival: n(surrogate.criticalSeconds),
      peakDps: 0,
    };
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
      objective,
      expCellType,
      metrics: liveCandidateMetrics(candidate, evidence),
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
    return metricContext.inherit ? metricContext.inherit(next, layout) : next;
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
    return metricContext.inherit ? metricContext.inherit(next, layout) : next;
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
  const normalizedLayoutCache = new Map();
  const normalizeLayout = layout => {
    const key = keyOf(layout);
    if (key === savedKey || seedExactKeys.has(key)) return layout;
    if (normalizedLayoutCache.has(key)) return normalizedLayoutCache.get(key);
    const filled = fillOpenSlots(layout);
    _setJellySearchCache(normalizedLayoutCache, key, filled, 256);
    return filled;
  };
  const normalizeCandidates = candidates => {
    const result = _normalizeJellyCandidates(candidates.map(candidate => ({
      ...candidate, blindOrigin: candidate.blindOrigin || blindKeys.has(keyOf(candidate.layout)),
    })), normalizeLayout, keyOf, scoreLayout);
    for (const candidate of result) if (candidate.blindOrigin) blindKeys.add(keyOf(candidate.layout));
    return result;
  };
  const normalizedCandidates = { screeningRaw: 0, screeningUnique: 0, neighborhoodRaw: 0, neighborhoodUnique: 0 };
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
  const virusReachSlots = anchor => {
    const reach = [anchor - JELLY_COLS, anchor + JELLY_COLS];
    if (anchor % JELLY_COLS > 0) reach.push(anchor - 1);
    if (anchor % JELLY_COLS < JELLY_COLS - 1) reach.push(anchor + 1);
    return reach.filter(slot => unlockedSet.has(slot));
  };
  const boardMaxFootprint = types.reduce(
    (best, type) => Math.max(best, (cellFootprint(type) || []).length || 1),
    1
  );
  const boardOrganelleMultiplier = metricContext.organelleMultiplier;
  // Board state summary reused by every candidate placement in one construction step.
  const boardInfluence = layout => {
    const occupied = occupancyCache.get(layout) || jellyLayoutOccupancy(layout);
    occupancyCache.set(layout, occupied);
    const virusReach = new Set();
    const organelleReach = new Set();
    let viruses = 0;
    for (const [rawAnchor, rawType] of Object.entries(layout)) {
      const anchor = Number(rawAnchor);
      const type = Number(rawType);
      if (type === 5) {
        viruses++;
        for (const slot of virusReachSlots(anchor)) virusReach.add(slot);
      } else if (type === 3) {
        for (const slot of _organelleReachSlots(anchor)) {
          if (unlockedSet.has(slot)) organelleReach.add(slot);
        }
      }
    }
    const infectedAnchors = new Set();
    const buffedAnchors = new Set();
    for (const rawAnchor of Object.keys(layout)) {
      const anchor = Number(rawAnchor);
      const slots = jellyFootprintSlots(anchor, Number(layout[anchor])) || [];
      if (slots.some(slot => virusReach.has(slot))) infectedAnchors.add(anchor);
      if (slots.some(slot => organelleReach.has(slot))) buffedAnchors.add(anchor);
    }
    return { occupied, virusReach, organelleReach, infectedAnchors, buffedAnchors, viruses };
  };
  // Cheap structural shortlist score: how much a placement interacts with the
  // existing board, used only to pick which anchors deserve a full board score.
  const placementAffinity = (influence, anchor, type, slots) => {
    let affinity = (CELL_BASE_DAMAGE[type] || 0) / Math.max(1, CELL_BASE_COOLDOWNS[type] || 1);
    if (type === 5) {
      const touched = new Map();
      let openReach = 0;
      for (const slot of virusReachSlots(anchor)) {
        const cell = influence.occupied.get(slot);
        if (cell) touched.set(cell.anchor, cell);
        else openReach++;
      }
      for (const [touchedAnchor, cell] of touched) {
        if (influence.infectedAnchors.has(touchedAnchor)) continue;
        affinity += (jellyFootprintSlots(touchedAnchor, cell.type) || []).length;
      }
      affinity += openReach * boardMaxFootprint * 0.5;
    } else {
      if (slots.some(slot => influence.virusReach.has(slot))) affinity += slots.length;
      if (slots.some(slot => influence.organelleReach.has(slot))) affinity += slots.length * 0.5;
    }
    if (type === 3) {
      let newlyBuffed = 0;
      let openReach = 0;
      for (const slot of _organelleReachSlots(anchor)) {
        if (!unlockedSet.has(slot)) continue;
        const cell = influence.occupied.get(slot);
        if (cell) {
          if (!influence.buffedAnchors.has(cell.anchor)) newlyBuffed++;
        } else openReach++;
      }
      affinity += newlyBuffed * 2 + openReach * 0.5;
    }
    if (PROXIMITY_ANCHORS.has(anchor)) affinity *= 1.5;
    return affinity;
  };
  // Forward-looking value of what a placement ENABLES rather than what it adds now.
  // Calibrated against the source: Virus damage is literally 1 + infectedSlots / 10,
  // so each open reachable slot is worth boardScore * footprint / 10 once filled.
  const enablingPotential = (influence, anchor, type, boardScore) => {
    if (!(boardScore > 0)) return 0;
    if (type === 5) {
      let openReach = 0;
      for (const slot of virusReachSlots(anchor)) if (!influence.occupied.has(slot)) openReach++;
      const potentialSlots = Math.min(openReach * boardMaxFootprint, 4 * boardMaxFootprint);
      return boardScore * potentialSlots / 10;
    }
    if (type === 3) {
      let openReach = 0;
      for (const slot of _organelleReachSlots(anchor)) {
        if (unlockedSet.has(slot) && !influence.occupied.has(slot)) openReach++;
      }
      return boardScore * (boardOrganelleMultiplier - 1) * Math.min(1, openReach / 6);
    }
    return 0;
  };
  // Beam construction that evaluates the whole resulting board for every candidate
  // placement instead of dropping each cell at the first legal anchor. Board awareness
  // decides the foundation; the cheap greedy fill finishes the leftover gaps.
  const boardAwareCompositionSeed = (initialLayout = {}, seedOptions = {}) => {
    const laneBeamWidth = Math.max(1, Math.min(12, Math.floor(n(seedOptions.beamWidth) || 4)));
    const anchorShortlist = Math.max(1, Math.min(24, Math.floor(n(seedOptions.anchorShortlist) || 6)));
    const structuralSteps = Math.max(1, Math.min(60, Math.floor(n(seedOptions.structuralSteps) || 14)));
    const discount = seedOptions.enablingDiscount == null
      ? 0.5
      : Math.max(0, Math.min(2, n(seedOptions.enablingDiscount)));
    const allowedTypes = (seedOptions.types || types).filter(type => types.includes(type));
    const random = seededRandom(Math.floor(n(seedOptions.seed) || 1) >>> 0);
    const jitter = Math.max(0, Math.min(1, n(seedOptions.jitter) || 0));
    const completionOrder = types.slice().sort(
      (a, b) => cellFootprint(b).length - cellFootprint(a).length || a - b
    );
    let beam = [{ layout: initialLayout, score: scoreLayout(initialLayout) }];
    for (let step = 0; step < structuralSteps; step++) {
      const expansions = new Map();
      for (const state of beam) {
        const influence = boardInfluence(state.layout);
        for (const type of allowedTypes) {
          if (type === 5 && influence.viruses >= virusLimit) continue;
          const ranked = [];
          for (const placement of placementByType[type] || []) {
            const slots = placement.slots || jellyFootprintSlots(placement.anchor, type);
            if (!slots || slots.some(slot => !unlockedSet.has(slot) || influence.occupied.has(slot))) continue;
            ranked.push({
              placement,
              slots,
              affinity: placementAffinity(influence, placement.anchor, type, slots),
            });
          }
          if (!ranked.length) continue;
          ranked.sort((a, b) => b.affinity - a.affinity || a.placement.anchor - b.placement.anchor);
          for (const row of ranked.slice(0, anchorShortlist)) {
            const next = addWithoutReplacement(state.layout, row.placement);
            if (!next) continue;
            const key = keyOf(next);
            if (expansions.has(key)) continue;
            const score = scoreLayout(next);
            const potential = enablingPotential(influence, row.placement.anchor, type, Math.abs(score));
            const noise = jitter > 0 ? (random() - 0.5) * jitter * Math.abs(score) : 0;
            expansions.set(key, { layout: next, score, value: score + discount * potential + noise });
          }
        }
      }
      if (!expansions.size) break;
      beam = Array.from(expansions.values())
        .sort((a, b) => b.value - a.value)
        .slice(0, laneBeamWidth);
    }
    let best = null;
    let bestScore = -Infinity;
    for (const state of beam.slice(0, 2)) {
      const completed = fillOpenSlots(greedyCompositionSeed(completionOrder, unlocked, state.layout));
      const score = scoreLayout(completed);
      if (score > bestScore) {
        best = completed;
        bestScore = score;
      }
    }
    return best || beam[0].layout;
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
  const defaultRandomizedLanes = requestedTrialBudget >= 128 ? 32 : 16;
  const randomizedConstructionLanes = Math.max(4, Math.min(48, Math.floor(
    options.randomizedConstructionLanes == null ? defaultRandomizedLanes : n(options.randomizedConstructionLanes)
  )));
  for (let lane = 0; lane < randomizedConstructionLanes; lane++) {
    const laneRandom = seededRandom(
      (0x9e3779b9 ^ Math.imul(lane + 1, 0x85ebca6b) ^ structuralStartSeed) >>> 0
    );
    const weighted = [];
    for (const type of shuffledWithSeed(types, (0xc2b2ae35 ^ lane ^ structuralStartSeed) >>> 0)) {
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
    const anchors = shuffledWithSeed(
      unlocked,
      (0x27d4eb2d ^ Math.imul(lane + 1, 0x165667b1) ^ structuralStartSeed) >>> 0
    );
    const layout = greedyCompositionSeed(typeOrder, anchors);
    const key = keyOf(layout);
    if (seedKeys.has(key)) continue;
    seedKeys.add(key);
    seedCandidates.push({ layout, score: scoreLayout(layout), seedKind: 'weighted-composition' });
  }
  let organelleCoverageSeeds = 0;
  let organelleStructureCounts = [];
  let organelleVirusJointSeeds = 0;
  let maxJointVirusOrganelleTouches = 0;
  let organelleCountLimitExplored = 0;
  let virusConditionedSeeds = 0;
  let virusStructuresEnumerated = 0;
  let virusStructureNodes = 0;
  let virusStructureComplete = true;
  let retainedVirusStructures = [];
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
    const structureCap = Math.max(6, Math.min(24, Math.floor(
      n(options.organelleStructureCap) || Math.max(12, beamWidth)
    )));
    reportLayoutProgress('Enumerating Organelle structures', 0.5);
    const { structures, countLimit } = yield* discoveryWork({
      kind: 'organelle', options: { structureCap, countLimit: options.organelleCountLimit ?? null },
    });
    organelleCountLimitExplored = countLimit;
    organelleStructureCounts = Array.from(new Set(
      structures.map(structure => Object.keys(structure.layout).length)
    )).sort((a, b) => a - b);
    const organelleFillOrders = [
      [0, 0, 0, 1],
      ...Array.from(
        { length: types.includes(5) ? virusLimit : 0 },
        (_, index) => [...Array(index + 1).fill(5), 0, 0, 0, 1]
      ),
    ];
    const seedsPerStructure = Math.max(
      organelleFillOrders.length,
      Math.ceil(256 / Math.max(1, structures.length))
    );
    for (const structure of structures) {
      for (let seed = 1; seed <= seedsPerStructure; seed++) {
        const anchors = shuffledWithSeed(
          unlocked,
          (0x51ed270b ^ seed ^ structuralStartSeed) >>> 0
        );
        const fillOrder = organelleFillOrders[(seed - 1) % organelleFillOrders.length];
        const layout = greedyCompositionSeed(fillOrder, anchors, structure.layout);
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
    const virusWork = {
      kind: 'virus', options: {
        structureLimit, countLimit: virusCountLimit, nodeBudget, fastPath: options.constructionFastPath === true,
      },
    };
    const virusResult = options.constructionSharing !== true
      ? runJellyDiscoveryWork(S, virusWork)
      : yield* discoveryWork(virusWork);
    const bestStructures = virusResult.structures;
    virusStructuresEnumerated = virusResult.enumerated;
    virusStructureNodes = virusResult.nodes;
    virusStructureComplete = virusResult.complete;
    retainedVirusStructures = bestStructures;
    const fillOrders = [
      standaloneOrder.filter(type => type !== 5),
      footprintOrder.filter(type => type !== 5),
      [0, 1, 2, 3, 4, 6, 7].filter(type => types.includes(type)),
    ];
    for (const structure of bestStructures) {
      for (let orderIndex = 0; orderIndex < fillOrders.length; orderIndex++) {
        const anchors = shuffledWithSeed(
          unlocked,
          (
            0xa54ff53a
            ^ Math.imul(orderIndex + 1, 0x9e3779b1)
            ^ structure.targetWeight
            ^ structuralStartSeed
          ) >>> 0
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
  if (structuralSeedTrials >= 16 && retainedVirusStructures.length && types.includes(3)) {
    const jointBeamWidth = Math.max(8, Math.min(48, Math.floor(
      n(options.organelleVirusJointBeamWidth) || Math.max(16, beamWidth)
    )));
    const jointRetainPerCount = Math.max(2, Math.min(16, Math.floor(
      n(options.organelleVirusJointRetain) || 8
    )));
    const jointWork = {
      kind: 'joint', structures: retainedVirusStructures,
      options: {
        beamWidth: jointBeamWidth, retainPerCount: jointRetainPerCount,
        scoreOptions: discoveryScoreOptions,
        fastPath: options.constructionFastPath === true, proxySharing: options.proxySharing === true,
      },
    };
    const jointResult = options.constructionSharing !== true
      ? _jellyJointStructures(S, retainedVirusStructures, jointWork.options, null, scoreLayout)
      : yield* discoveryWork(jointWork);
    const jointFillOrders = [
      [0, 0, 0, 1],
      standaloneOrder.filter(type => type !== 3 && type !== 5),
    ];
    for (const foundation of jointResult.structures) {
      for (let variant = 0; variant < jointFillOrders.length; variant++) {
        const virusCount = Object.values(foundation.layout).filter(type => Number(type) === 5).length;
        const anchors = shuffledWithSeed(
          unlocked,
          (
            0x94d049bb
            ^ Math.imul(variant + 1, 0x369dea0f)
            ^ Math.imul(virusCount + 1, 0x9e3779b1)
            ^ Math.imul(foundation.organelleCount + 1, 0x85ebca6b)
            ^ structuralStartSeed
          ) >>> 0
        );
        const layout = greedyCompositionSeed(jointFillOrders[variant], anchors, foundation.layout);
        const key = jellyLayoutKey(layout);
        if (seedKeys.has(key)) continue;
        seedKeys.add(key);
        seedCandidates.push({
          layout,
          score: scoreLayout(layout),
          seedKind: 'organelle-virus-joint',
          jointOrganelleCount: foundation.organelleCount,
          jointVirusCount: virusCount,
          jointVirusOrganelleTouches: foundation.organelleCount,
        });
        organelleVirusJointSeeds++;
        maxJointVirusOrganelleTouches = Math.max(
          maxJointVirusOrganelleTouches,
          foundation.organelleCount
        );
      }
    }
  }
  let boardAwareSeeds = 0;
  let boardAwareBestScore = -Infinity;
  const boardAwareKeys = new Set();
  if (structuralSeedTrials >= 16) {
    const boardAwareLaneCount = Math.max(
      0,
      Math.min(8, options.boardAwareLanes == null ? 4 : Math.floor(n(options.boardAwareLanes)))
    );
    const laneProfiles = [
      { beamWidth: 4, anchorShortlist: 6, enablingDiscount: 0.5, jitter: 0, structuralSteps: 14 },
      { beamWidth: 3, anchorShortlist: 8, enablingDiscount: 1, jitter: 0.02, structuralSteps: 18 },
      { beamWidth: 5, anchorShortlist: 5, enablingDiscount: 0, jitter: 0.03, structuralSteps: 12 },
      { beamWidth: 3, anchorShortlist: 10, enablingDiscount: 0.75, jitter: 0.05, structuralSteps: 20 },
      { beamWidth: 6, anchorShortlist: 4, enablingDiscount: 0.35, jitter: 0.04, structuralSteps: 10 },
      { beamWidth: 2, anchorShortlist: 12, enablingDiscount: 1.25, jitter: 0.06, structuralSteps: 24 },
      { beamWidth: 4, anchorShortlist: 7, enablingDiscount: 0.6, jitter: 0.08, structuralSteps: 16 },
      { beamWidth: 4, anchorShortlist: 6, enablingDiscount: 0.5, jitter: 0.12, structuralSteps: 14 },
    ];
    for (let lane = 0; lane < boardAwareLaneCount; lane++) {
      reportLayoutProgress(
        `Constructing board-aware seeds ${lane + 1}/${boardAwareLaneCount}`,
        0.9 + 0.09 * (lane + 1) / Math.max(1, boardAwareLaneCount)
      );
      const profile = laneProfiles[lane % laneProfiles.length];
      const layout = boardAwareCompositionSeed({}, {
        ...profile,
        seed: (Math.imul(lane + 1, 0x9e3779b1) ^ structuralStartSeed) >>> 0,
      });
      const key = jellyLayoutKey(layout);
      if (seedKeys.has(key)) continue;
      seedKeys.add(key);
      const score = scoreLayout(layout);
      seedCandidates.push({ layout, score, seedKind: 'board-aware' });
      boardAwareKeys.add(key);
      boardAwareSeeds++;
      boardAwareBestScore = Math.max(boardAwareBestScore, score);
    }
  }
  const greedyBestSeedScore = seedCandidates.reduce(
    (best, candidate) => candidate.seedKind === 'board-aware' ? best : Math.max(best, candidate.score),
    -Infinity
  );
  const searchArchive = new Map(seedCandidates.map(candidate => [keyOf(candidate.layout), candidate]));
  const eliteArchive = new Map();
  const diversityCompositions = new Set();
  const diversityVirusCounts = new Set();
  const diversityTypes = new Set();
  const diversitySources = new Set();
  const diversityBaseFamilies = new Set();
  const baseFamilyKey = candidate => {
    if (candidate.baseFamily) return candidate.baseFamily;
    const counts = new Array(8).fill(0);
    for (const rawType of Object.values(candidate.layout || {})) {
      const type = Number(rawType);
      if (type >= 0 && type < counts.length) counts[type]++;
    }
    const ordinaryCounts = counts.map((count, type) => type === 3 || type === 4 || type === 5 ? -1 : count);
    const dominantType = ordinaryCounts.indexOf(Math.max(...ordinaryCounts));
    const source = candidate.seedKind || candidate.feedbackKind || 'composition';
    return [
      source,
      `n${Math.floor(Object.keys(candidate.layout || {}).length / 4)}`,
      `o${counts[3]}`,
      `i${counts[4]}`,
      `v${counts[5]}`,
      `d${dominantType}`,
    ].join('|');
  };
  for (const candidate of seedCandidates) candidate.baseFamily = baseFamilyKey(candidate);
  liveDiversitySnapshot = () => ({
    layouts: searchArchive.size,
    eliteNiches: eliteArchive.size,
    compositions: diversityCompositions.size,
    virusCounts: Array.from(diversityVirusCounts).sort((a, b) => a - b),
    cellTypes: Array.from(diversityTypes).sort((a, b) => a - b),
    sources: Array.from(diversitySources).sort(),
    baseFamilies: diversityBaseFamilies.size,
  });
  const eliteFeatureCache = new Map();
  const eliteFeatureKey = layout => {
    const key = keyOf(layout);
    if (eliteFeatureCache.has(key)) return eliteFeatureCache.get(key);
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
      travelWeighted += (metricContext.travelFor?.(cell.anchor, cell.type)
        ?? jellyProjectileHitDelay(cell.anchor, cell.type, () => 0.5)) * cell.attacksPerSecond;
      attackWeight += cell.attacksPerSecond;
      if (cell.type === 4) immunoids++;
    }
    const travelBucket = Math.floor((travelWeighted / Math.max(1e-12, attackWeight)) * 4);
    const attackBucket = Math.floor(Math.log10(Math.max(1, metrics.attacksPerSecond)) * 3);
    const feature = [
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
    _setJellySearchCache(eliteFeatureCache, key, feature, 4096);
    return feature;
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
    diversityBaseFamilies.add(baseFamilyKey(candidate));
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
    _setJellySearchCache(structuralStatsCache, key, stats, 4096);
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
  const selectBaseFamiliesBy = (candidates, limit, compare) => {
    const families = new Map();
    for (const candidate of candidates) {
      candidate.baseFamily = baseFamilyKey(candidate);
      const rows = families.get(candidate.baseFamily) || [];
      rows.push(candidate);
      families.set(candidate.baseFamily, rows);
    }
    for (const rows of families.values()) rows.sort(compare);
    const familyRows = Array.from(families.entries())
      .sort((a, b) => compare(a[1][0], b[1][0]) || a[0].localeCompare(b[0]));
    const selected = [];
    const selectedKeys = new Set();
    for (let depth = 0; selected.length < limit; depth++) {
      let added = false;
      for (const [, rows] of familyRows) {
        const candidate = rows[depth];
        if (!candidate) continue;
        const key = keyOf(candidate.layout);
        if (selectedKeys.has(key)) continue;
        selected.push(candidate);
        selectedKeys.add(key);
        added = true;
        if (selected.length >= limit) break;
      }
      if (!added) break;
    }
    return selected;
  };
  let beams = Array.from({ length: searchStarts }, (_, start) => (
    selectBaseFamiliesBy(seedCandidates.slice(), beamWidth, startCompare(start))
  ));
  const startSeen = beams.map(rows => new Set(rows.map(candidate => keyOf(candidate.layout))));
  const islandRandoms = Array.from({ length: searchStarts }, (_, start) => seededRandom(
    (Math.floor(n(options.seed) || 1) ^ Math.imul(searchStartOffset + start + 1, 0x85ebca6b)) >>> 0
  ));
  const adaptiveMoves = options.adaptiveMoves !== false;
  const proposeAdaptiveMove = (layout, family, random) => {
    const anchors = Object.keys(layout).map(Number);
    if (!anchors.length || !placements.length) return null;
    const pick = rows => rows.length ? rows[Math.floor(random() * rows.length)] : null;
    if (family === 'replacement') return placeWithReplacement(layout, pick(placements));
    const anchor = pick(anchors);
    if (family === 'relocation') {
      return placeWithReplacement(jellyRemoveCell(layout, anchor), pick(placementByType[Number(layout[anchor])] || []));
    }
    if (family === 'swap') {
      const other = pick(anchors.filter(other => Number(layout[other]) !== Number(layout[anchor])));
      if (other == null) return null;
      let next = jellyRemoveCell(jellyRemoveCell(layout, anchor), other);
      const first = placementByType[Number(layout[anchor])]?.find(row => row.anchor === other);
      const second = placementByType[Number(layout[other])]?.find(row => row.anchor === anchor);
      next = addWithoutReplacement(next, first);
      return next && addWithoutReplacement(next, second);
    }
    const special = anchors.filter(anchor => [3, 4, 5].includes(Number(layout[anchor])));
    const center = special.length && random() < 0.75 ? pick(special) : anchor;
    const selected = new Set([center]);
    const limit = Math.min(anchors.length, 2 + Math.floor(random() * 5));
    const slotsFor = anchor => metricContext.slotsFor?.(anchor, Number(layout[anchor]))
      || jellyFootprintSlots(anchor, Number(layout[anchor])) || [];
    const influenceFor = anchor => Number(layout[anchor]) === 3
      ? _organelleReachSlots(anchor) : slotsFor(anchor).flatMap(slot => [
        slot - JELLY_COLS, slot + JELLY_COLS,
        ...(slot % JELLY_COLS > 0 ? [slot - 1] : []),
        ...(slot % JELLY_COLS < JELLY_COLS - 1 ? [slot + 1] : []),
      ]);
    for (const current of selected) {
      const reach = new Set(influenceFor(current));
      for (const other of anchors.slice().sort((a, b) => (
        Math.abs(a % JELLY_COLS - center % JELLY_COLS) + Math.abs(Math.floor(a / JELLY_COLS) - Math.floor(center / JELLY_COLS))
        - Math.abs(b % JELLY_COLS - center % JELLY_COLS) - Math.abs(Math.floor(b / JELLY_COLS) - Math.floor(center / JELLY_COLS))
        || a - b
      ))) {
        if (selected.has(other)) continue;
        if (slotsFor(other).some(slot => reach.has(slot))
          || influenceFor(other).some(slot => slotsFor(current).includes(slot))) selected.add(other);
        if (selected.size >= limit) break;
      }
      if (selected.size >= limit) break;
    }
    if (selected.size < 2) return null;
    const region = new Set();
    let rebuilt = { ...layout };
    for (const removed of selected) {
      for (const slot of slotsFor(removed)) region.add(slot);
      delete rebuilt[removed];
    }
    const typeOrder = types.slice();
    for (let index = typeOrder.length - 1; index > 0; index--) {
      const other = Math.floor(random() * (index + 1));
      [typeOrder[index], typeOrder[other]] = [typeOrder[other], typeOrder[index]];
    }
    for (let pass = 0; pass < region.size; pass++) {
      let added = false;
      for (const type of typeOrder) {
        const choices = placementByType[type] || [];
        const offset = Math.floor(random() * choices.length);
        for (let index = 0; index < choices.length; index++) {
          const placement = choices[(offset + index) % choices.length];
          if (!placement.slots.every(slot => region.has(slot))) continue;
          const next = addWithoutReplacement(rebuilt, placement);
          if (!next) continue;
          rebuilt = next;
          added = true;
          break;
        }
      }
      if (!added) break;
    }
    return metricContext.inherit ? metricContext.inherit(rebuilt, layout) : rebuilt;
  };
  const adaptiveChains = adaptiveMoves ? islandRandoms.map((random, start) => _createJellyAdaptiveSearch({
    random, keyOf, scoreLayout, propose: proposeAdaptiveMove,
    mode: (searchStartOffset + start) % 2 === 0 ? 'annealing' : 'tabu',
  })) : [];
  let islandMutationCandidates = 0;
  let islandMigrations = 0;
  let coarseRebuildCandidates = 0;
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
  const explorationRounds = Math.max(1, Math.min(iterations, Math.floor(
    options.explorationRounds == null ? Math.ceil(iterations / 2) : n(options.explorationRounds)
  )));
  const earlyRebuildAttempts = Math.max(0, Math.min(8, Math.floor(
    options.earlyRebuildAttempts == null ? 3 : n(options.earlyRebuildAttempts)
  )));
  const initialBaseFamilies = new Set(seedCandidates.map(candidate => candidate.baseFamily)).size;
  let explorationBaseFamilies = 0;
  const activeExactRepair = { scopes: 0, nodes: 0, completeScopes: 0, improvements: 0 };
  function* repairDuringSearch(candidate, iteration) {
    const cells = jellyLayoutMetrics(candidate.layout, S, { fever, _metricContext: metricContext }).cells || [];
    const special = cells.filter(cell => [3, 4, 5].includes(cell.type));
    const center = (special.length ? special : cells)[iteration % Math.max(1, special.length || cells.length)];
    if (!center) return [];
    const reach = new Set(center.type === 3 ? _organelleReachSlots(center.anchor)
      : center.slots.flatMap(slot => [slot - JELLY_COLS, slot + JELLY_COLS,
        ...(slot % JELLY_COLS > 0 ? [slot - 1] : []),
        ...(slot % JELLY_COLS < JELLY_COLS - 1 ? [slot + 1] : [])]));
    const connected = cells.filter(cell => cell.anchor !== center.anchor
      && cell.slots.some(slot => reach.has(slot)))
      .sort((a, b) => Math.abs(a.anchor - center.anchor) - Math.abs(b.anchor - center.anchor) || a.anchor - b.anchor);
    const region = new Set([center, ...connected.slice(0, 2)].flatMap(cell => cell.slots));
    const exactOptions = {
      regionSlots: Array.from(region).sort((a, b) => a - b), objective, fever, obstruction, expCellType,
      nodeBudget: Math.max(64, Math.min(2048, n(options.activeExactNodeBudget) || 256)),
      deterministicNodeBudget: true, resultLimit: 2,
      boundModel: objective === 'dps' ? 'steady-dps' : undefined,
    };
    const result = discoveryPooling ? yield* discoveryWork({
      kind: 'free', layout: candidate.layout, options: { ...exactOptions, scoreOptions: discoveryScoreOptions },
    }) : enumerateJellyRegionFreeExact(candidate.layout, S, { ...exactOptions, _scoreLayout: scoreLayout });
    activeExactRepair.scopes++;
    activeExactRepair.nodes += result.certificate.nodesExpanded;
    if (result.certificate.complete) activeExactRepair.completeScopes++;
    const improved = result.candidates.filter(row => row.score > candidate.score);
    activeExactRepair.improvements += improved.length;
    return improved.map(row => ({ ...row, seedKind: 'active-exact-repair', baseFamily: candidate.baseFamily }));
  }
  reportLayoutProgress('Preparing search', 1);
  for (let iteration = 0; iteration < iterations; iteration++) {
    const exploringBases = iteration < explorationRounds;
    let changed = false;
    const nextBeams = [];
    for (const [start, startBeam] of beams.entries()) {
      const candidates = startBeam.slice();
      const islandRandom = islandRandoms[start];
      for (const candidate of startBeam) {
        for (const expansion of additiveExpansions(candidate)) {
          const key = keyOf(expansion.layout);
          if (startSeen[start].has(key)) continue;
          startSeen[start].add(key);
          candidates.push({
            ...expansion,
            searchStart: start,
            baseFamily: candidate.baseFamily,
            searchPhase: exploringBases ? 'base-experimentation' : 'granular-refinement',
          });
          evaluated++;
        }
        if (adaptiveMoves) {
          const budget = Math.min(8, placements.length) + Math.min(3, Object.keys(candidate.layout).length)
            + (exploringBases ? earlyRebuildAttempts : 0);
          const adaptive = adaptiveChains[start].run(candidate, budget, iteration / Math.max(1, iterations - 1));
          for (const row of adaptive) {
            const key = keyOf(row.layout);
            if (startSeen[start].has(key)) continue;
            startSeen[start].add(key);
            candidates.push({
              ...row, searchStart: start, baseFamily: baseFamilyKey(row),
              searchPhase: exploringBases ? 'base-experimentation' : 'granular-refinement',
            });
            if (row.moveFamily === 'dependency-rebuild') coarseRebuildCandidates++;
            islandMutationCandidates++;
            evaluated++;
          }
          continue;
        }
        const replacementAttempts = Math.min(8, placements.length);
        for (let attempt = 0; attempt < replacementAttempts; attempt++) {
          const placement = placements[Math.floor(islandRandom() * placements.length)];
          const layout = placeWithReplacement(candidate.layout, placement);
          if (!layout) continue;
          const key = keyOf(layout);
          if (startSeen[start].has(key)) continue;
          startSeen[start].add(key);
          candidates.push({
            layout,
            score: scoreLayout(layout),
            searchStart: start,
            islandMutation: 'replacement',
            baseFamily: candidate.baseFamily,
            searchPhase: exploringBases ? 'base-experimentation' : 'granular-refinement',
          });
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
          candidates.push({
            layout,
            score: scoreLayout(layout),
            searchStart: start,
            islandMutation: 'relocation',
            baseFamily: candidate.baseFamily,
            searchPhase: exploringBases ? 'base-experimentation' : 'granular-refinement',
          });
          islandMutationCandidates++;
          evaluated++;
        }
        if (exploringBases && earlyRebuildAttempts > 0 && anchors.length > 1) {
          for (let rebuild = 0; rebuild < earlyRebuildAttempts; rebuild++) {
            let layout = candidate.layout;
            const shuffledAnchors = anchors.slice();
            for (let index = shuffledAnchors.length - 1; index > 0; index--) {
              const swap = Math.floor(islandRandom() * (index + 1));
              [shuffledAnchors[index], shuffledAnchors[swap]] = [shuffledAnchors[swap], shuffledAnchors[index]];
            }
            const removeCount = Math.min(
              shuffledAnchors.length,
              2 + Math.floor(islandRandom() * Math.min(3, Math.max(1, shuffledAnchors.length - 1)))
            );
            for (const anchor of shuffledAnchors.slice(0, removeCount)) {
              layout = jellyRemoveCell(layout, anchor);
            }
            const targetCount = Object.keys(candidate.layout).length;
            for (let attempt = 0; attempt < 64 && Object.keys(layout).length < targetCount; attempt++) {
              const type = types[Math.floor(islandRandom() * types.length)];
              const typePlacements = placementByType[type] || [];
              if (!typePlacements.length) continue;
              const placement = typePlacements[Math.floor(islandRandom() * typePlacements.length)];
              const next = addWithoutReplacement(layout, placement);
              if (next) layout = next;
            }
            const key = keyOf(layout);
            if (key === keyOf(candidate.layout) || startSeen[start].has(key)) continue;
            startSeen[start].add(key);
            candidates.push({
              layout,
              score: scoreLayout(layout),
              searchStart: start,
              islandMutation: 'coarse-rebuild',
              baseFamily: candidate.baseFamily,
              searchPhase: 'base-experimentation',
            });
            coarseRebuildCandidates++;
            evaluated++;
          }
        }
      }
      if (options.activeExactRepair !== false && (options.activeExactRepair === true || options.computeFocus === 'repair')
        && start === iteration % searchStarts && iteration % 4 === 0
        && candidates.length) {
        const leader = candidates.slice().sort(compareProxy)[0];
        for (const repair of yield* repairDuringSearch(leader, iteration)) {
          if (startSeen[start].has(keyOf(repair.layout))) continue;
          startSeen[start].add(keyOf(repair.layout));
          candidates.push(repair);
          evaluated++;
        }
      }
      archiveTop(candidates);
      const next = exploringBases
        ? selectBaseFamiliesBy(candidates, beamWidth, startCompare(start))
        : selectDiverseBy(candidates, beamWidth, startCompare(start));
      const unchanged = next.length === startBeam.length && next.every((candidate, index) => (
        keyOf(candidate.layout) === keyOf(startBeam[index].layout)
      ));
      if (!unchanged) changed = true;
      nextBeams.push(next);
    }
    beams = nextBeams;
    if (!exploringBases && searchStarts > 1 && (iteration + 1) % 4 === 0) {
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
          candidates.push({ ...candidate, migratedFrom: (start + searchStarts - 1) % searchStarts });
          islandMigrations++;
        }
        return selectDiverseBy(candidates, beamWidth, startCompare(start));
      });
    }
    if (iteration + 1 === explorationRounds) {
      explorationBaseFamilies = new Set(beams.flat().map(candidate => candidate.baseFamily)).size;
    }
    additiveExpansionCache.clear();
    reportLayoutProgress(
      `${exploringBases ? 'Experimenting with bases' : 'Refining base families'} ${iteration + 1}/${iterations}`,
      2 + 18 * (iteration + 1) / iterations
    );
    if (!changed && !exploringBases) break;
  }
  if (!explorationBaseFamilies) {
    explorationBaseFamilies = new Set(beams.flat().map(candidate => candidate.baseFamily)).size;
  }
  const finalBeamBaseFamilies = new Set(beams.flat().map(candidate => candidate.baseFamily)).size;
  const savedDiscoveredByConstruction = startSeen.some(seen => seen.has(savedKey));
  const blindBeam = selectDiverse(beams.flat(), Math.max(beamWidth, beamWidth * searchStarts));
  const blindKeys = new Set(blindBeam.map(candidate => keyOf(candidate.layout)));

  const savedBeamWidth = Math.max(4, Math.ceil(beamWidth / 2));
  let savedBeam = [{ layout: saved, score: scoreLayout(saved) }];
  const savedSeen = new Set([savedKey]);
  evaluated++;
  for (const elite of sharedEliteEntries) {
    const key = keyOf(elite.layout);
    if (savedSeen.has(key)) continue;
    savedSeen.add(key);
    savedBeam.push({ layout: elite.layout, score: scoreLayout(elite.layout), seedKind: 'shared-elite' });
    evaluated++;
  }
  for (const seed of seedEntries) {
    if (savedSeen.has(seed.key)) continue;
    savedSeen.add(seed.key);
    savedBeam.push({ layout: seed.layout, score: scoreLayout(seed.layout), seedOrigin: seed.label });
    evaluated++;
  }
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
      detail: 'Relocating cells around the imported board to cross remove/place score valleys',
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
    Math.min(8, virusConditionedSeeds)
  );
  for (const candidate of virusConditionedPool) {
    if (!screeningPool.some(existing => jellyLayoutKey(existing.layout) === jellyLayoutKey(candidate.layout))) {
      screeningPool.push(candidate);
    }
  }
  const coverageStatsCache = new Map();
  const coverageStats = candidate => {
    const key = jellyLayoutKey(candidate.layout);
    if (coverageStatsCache.has(key)) return coverageStatsCache.get(key);
    const metrics = jellyLayoutMetrics(candidate.layout, S, { fever, assumeValid: true });
    const organelle = jellyOrganelleConnectionProfile(candidate.layout);
    const virusReach = new Set();
    for (const [rawAnchor, rawType] of Object.entries(candidate.layout)) {
      if (Number(rawType) !== 5) continue;
      const anchor = Number(rawAnchor);
      virusReach.add(anchor - JELLY_COLS);
      virusReach.add(anchor + JELLY_COLS);
      if (anchor % JELLY_COLS > 0) virusReach.add(anchor - 1);
      if (anchor % JELLY_COLS < JELLY_COLS - 1) virusReach.add(anchor + 1);
    }
    let infectedOrganelles = 0;
    for (const [rawAnchor, rawType] of Object.entries(candidate.layout)) {
      if (Number(rawType) !== 3) continue;
      const slots = jellyFootprintSlots(Number(rawAnchor), 3) || [];
      if (slots.some(slot => virusReach.has(slot))) infectedOrganelles++;
    }
    const stats = {
      infectedSlots: metrics.infectedSlots || 0,
      organelleCells: organelle.buffedCells || 0,
      infectedOrganelles,
    };
    coverageStatsCache.set(key, stats);
    return stats;
  };
  const addCoverageCandidates = (kind, candidates, compare) => {
    const selected = candidates.slice().sort(compare).slice(0, 6);
    for (const candidate of selected) {
      candidate.coverageKind = kind;
      if (!screeningPool.some(existing => jellyLayoutKey(existing.layout) === jellyLayoutKey(candidate.layout))) {
        screeningPool.push(candidate);
      }
    }
    return selected;
  };
  const virusCoverageCandidates = types.includes(5)
    ? addCoverageCandidates(
      'virus',
      seedCandidates.filter(candidate => Object.values(candidate.layout).some(type => Number(type) === 5)),
      (a, b) => coverageStats(b).infectedSlots - coverageStats(a).infectedSlots || compareProxy(a, b)
    )
    : [];
  const organelleCoverageCandidates = types.includes(3)
    ? addCoverageCandidates(
      'organelle',
      seedCandidates.filter(candidate => Object.values(candidate.layout).some(type => Number(type) === 3)),
      (a, b) => coverageStats(b).organelleCells - coverageStats(a).organelleCells || compareProxy(a, b)
    )
    : [];
  const jointOrganelleVirusCandidates = types.includes(3) && types.includes(5)
    ? addCoverageCandidates(
      'organelle-virus',
      seedCandidates.filter(candidate => (
        Object.values(candidate.layout).some(type => Number(type) === 3)
        && Object.values(candidate.layout).some(type => Number(type) === 5)
      )),
      (a, b) => coverageStats(b).infectedOrganelles - coverageStats(a).infectedOrganelles
        || coverageStats(b).infectedSlots - coverageStats(a).infectedSlots
        || coverageStats(b).organelleCells - coverageStats(a).organelleCells
        || compareProxy(a, b)
    )
    : [];
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
  for (const seed of seedEntries) {
    if (!screeningPool.some(candidate => jellyLayoutKey(candidate.layout) === seed.key)) {
      screeningPool.push({ layout: seed.layout, score: scoreLayout(seed.layout), seedOrigin: seed.label });
    }
    const filled = fillOpenSlots(seed.layout);
    const filledKey = jellyLayoutKey(filled);
    if (filledKey === seed.key) continue;
    seedCandidateKeys.add(filledKey);
    if (!screeningPool.some(candidate => jellyLayoutKey(candidate.layout) === filledKey)) {
      screeningPool.push({ layout: filled, score: scoreLayout(filled), seedOrigin: `${seed.label} (gaps filled)` });
    }
  }
  reportLayoutProgress('Preparing simulation policies', 40);
  enterPhase('policies');
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
  normalizedCandidates.screeningRaw = screeningPool.length;
  screeningPool = normalizeCandidates(screeningPool);
  const normalizedScreeningKeys = new Set(screeningPool.map(candidate => keyOf(candidate.layout)));
  for (const candidate of scenarioCandidates.slice().sort(compareScenario)) {
    if (screeningPool.length >= normalizedCandidates.screeningRaw) break;
    const [normalized] = normalizeCandidates([candidate]);
    const key = keyOf(normalized.layout);
    if (normalizedScreeningKeys.has(key)) continue;
    normalizedScreeningKeys.add(key);
    screeningPool.push(normalized);
  }
  normalizedCandidates.screeningUnique = screeningPool.length;
  const sharedSavedPolicy = options.consolidateWork !== false && options.savedPolicy?.key === jellySavedPolicyKey(S, options)
    ? options.savedPolicy.operation : null;
  const screenPolicy = sharedSavedPolicy || (yield* createJellyPolicySearch(saved, S, {
    ...options,
    obstruction,
    fever: options.fever,
    roidTiming: options.roidTiming,
    revivePolicy: options.revivePolicy,
    trials: screeningTrials,
    screeningTrials: Math.min(4, screeningTrials),
    seed: Math.floor(n(options.seed) || 1),
    frameTiming: options.screenPolicyFrameTiming === true && options.frameTiming !== false,
    _simulateTrials: cachedSimulateTrials,
    _sourcePolicyTrials: true,
  }));
  const screenPolicyKey = policy => `${policy.fever}|${policy.roidTiming}|${policy.revivePolicy}`;
  let cheapScreeningCandidates = 0;
  let cheapScreeningPolicies = 0;
  const policyPortfolio = (layout, hints = [], fullPolicy = false) => {
    const policies = [];
    const keys = new Set();
    const fevers = availableFeverTypes(S, options.fever);
    const timings = availableRoidTimings(S, obstruction, options.roidTiming);
    const revives = availableRevivePolicies(S, options.revivePolicy);
    const legal = policy => fevers.includes(policy.fever) && revives.includes(policy.revivePolicy)
      && (timings.length > 1 || timings.includes(policy.roidTiming));
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
    if (options.cheapScreening === true && !fullPolicy) {
      const key = jellyLayoutKey(layout);
      if (key !== savedKey && !seedExactKeys.has(key)) {
        const reduced = policies.filter(legal);
        cheapScreeningCandidates++;
        cheapScreeningPolicies += reduced.length;
        return reduced;
      }
    }
    if (jellyUpgradeQuantity(S, 29) >= 1) {
      add({ fever: screenPolicy.fever, roidTiming: 0, revivePolicy: screenPolicy.revivePolicy });
      add({ fever: screenPolicy.fever, roidTiming: jellyBossTime(obstruction), revivePolicy: screenPolicy.revivePolicy });
    }
    if (jellyUpgradeQuantity(S, 35) >= 1) {
      add({ fever: screenPolicy.fever, roidTiming: screenPolicy.roidTiming, revivePolicy: 'immunoid-first' });
      add({ fever: screenPolicy.fever, roidTiming: screenPolicy.roidTiming, revivePolicy: 'dps-first' });
    }
    if (options.jointPolicyScreening !== false) {
      for (const hint of hints) {
        if (fevers.includes(hint.fever) && revives.includes(hint.revivePolicy)
          && (timings.length > 1 || timings.includes(hint.roidTiming))) add(hint);
      }
      const layoutFever = proxyFeverType(layout, S, objective, obstruction, options.fever, expCellType);
      for (const fever of fevers) add({
        fever, roidTiming: timings[0], revivePolicy: revives[0],
      });
      if (timings.length > 1) {
        const late = timings[timings.length - 1];
        for (const fever of new Set([screenPolicy.fever, layoutFever])) add({
          fever, roidTiming: late, revivePolicy: revives[0],
        });
      }
    }
    return policies.filter(legal);
  };
  let screeningPoliciesEvaluated = 0;
  let screeningPhysicalPoliciesReused = 0;
  function* screenCandidate(candidate, trials, fullPolicy = false) {
    const policies = policyPortfolio(candidate.layout, [
      ...(candidate.neighborhoodPolicies || []), candidate.screeningPolicy, candidate.neighborhoodPolicy,
    ].filter(Boolean), fullPolicy);
    const prefixes = options.policyPrefixes === false ? null : _createJellyPolicyPrefixCache();
    const policyFamily = {};
    const equivalentPolicies = new Map();
    const cooperativeMeasurements = new Map();
    if (discoveryPooling && options.policyScreenPooling !== false) {
      const missing = [];
      const keys = new Set();
      for (const policy of policies) {
        const canReuseSaved = jellyLayoutKey(candidate.layout) === savedKey
          && trials === screenPolicy.trials && screenPolicyKey(policy) === screenPolicyKey(screenPolicy);
        const simulationOptions = { ...options, obstruction, ...policy, trials, seed: Math.floor(n(options.seed) || 1) };
        const key = jellyMeasurementKey(candidate.layout, simulationOptions);
        const physicalRevive = options.policyPrefixes !== false
          && ['immunoid-first', 'anchor-first', 'dps-first', 'soak-first'].includes(policy.revivePolicy)
          ? 'immediate' : policy.revivePolicy;
        const physicalKey = `${policy.fever}|${policy.roidTiming}|${physicalRevive}`;
        if (keys.has(physicalKey)) continue;
        keys.add(physicalKey);
        if (canReuseSaved) continue;
        const cached = simulationCache.get(key) || options._measurementCache?.get(key);
        if (cached) cooperativeMeasurements.set(key, cached);
        else missing.push(policy);
      }
      if (missing.length) {
        const batch = yield {
          kind: 'policyScreen', layout: candidate.layout, policies: missing,
          options: _jellyTrialRequestOptions({
            ...options, obstruction, trials, seed: Math.floor(n(options.seed) || 1),
            _compactTrials: options.compactSimulation !== false,
          }),
        };
        if (batch.measurements?.length !== missing.length) throw new Error('Incomplete Jelly discovery screening');
        missing.forEach((policy, index) => {
          const key = jellyMeasurementKey(candidate.layout, { ...options, obstruction, ...policy, trials,
            seed: Math.floor(n(options.seed) || 1) });
          cooperativeMeasurements.set(key, batch.measurements[index]);
          _setJellySearchCache(simulationCache, key, batch.measurements[index], 256);
          options._measurementCache?.set(key, batch.measurements[index]);
        });
      }
    }
    const screenedPolicies = policies.map(policy => {
      const canReuseSaved = jellyLayoutKey(candidate.layout) === savedKey
        && trials === screenPolicy.trials
        && screenPolicyKey(policy) === screenPolicyKey(screenPolicy);
      const physicalRevive = ['immunoid-first', 'anchor-first', 'dps-first', 'soak-first'].includes(policy.revivePolicy)
        ? 'immediate' : policy.revivePolicy;
      const physicalKey = `${policy.fever}|${policy.roidTiming}|${physicalRevive}`;
      const reused = options.policyPrefixes !== false && equivalentPolicies.get(physicalKey);
      if (reused) screeningPhysicalPoliciesReused++;
      const measurementKey = jellyMeasurementKey(candidate.layout, { ...options, obstruction, ...policy, trials,
        seed: Math.floor(n(options.seed) || 1) });
      const simulation = reused || cooperativeMeasurements.get(measurementKey) || (canReuseSaved
        ? screenPolicy
        : cachedSimulateTrials(candidate.layout, S, {
          ...options,
          obstruction,
          fever: policy.fever,
          roidTiming: policy.roidTiming,
          revivePolicy: policy.revivePolicy,
          trials,
          seed: Math.floor(n(options.seed) || 1),
          _policyPrefixCache: prefixes,
          _prefixTrialLimit: Math.min(32, trials),
          _policyCacheFamily: policyFamily,
        }));
      equivalentPolicies.set(physicalKey, simulation);
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
  }
  function* screenCandidates(candidates, trials, before = () => {}, fullPolicy = false) {
    const measured = [];
    for (let from = 0; from < candidates.length; from += 32) {
      const pending = candidates.slice(from, from + 32).map((candidate, offset) => {
        before(candidate, from + offset);
        const search = screenCandidate(candidate, trials, fullPolicy);
        return { search, step: search.next() };
      });
      const waiting = pending.filter(row => !row.step.done);
      if (waiting.length) {
        const response = yield { kind: 'screenBatch', requests: waiting.map(row => row.step.value) };
        if (response?.batches?.length !== waiting.length) throw new Error('Incomplete Jelly discovery batch');
        waiting.forEach((row, index) => {
          row.step = row.search.next(response.batches[index]);
          if (!row.step.done) throw new Error('Unexpected Jelly discovery screening continuation');
        });
      }
      measured.push(...pending.map(row => row.step.value));
    }
    return measured;
  }
  enterPhase('screening');
  let screened = yield* screenCandidates(screeningPool, screeningTrials, (candidate, index) => {
    options.onProgress?.({
      phase: `Screening candidate ${index + 1}/${screeningPool.length}`,
      detail: options.cheapScreening === true
        ? `Running ${screeningTrials} shared-seed trials with reduced early policy coverage; survivors receive the full portfolio`
        : `Running ${screeningTrials} shared-seed trials across a compact Fever, Stronkroid, and revival policy portfolio`,
      completed: searchRounds + (index + 1) / Math.max(1, screeningPool.length),
      total: searchRounds + 2 + finalistCount,
      overallPercent: 40 + 10 * (index + 1) / Math.max(1, screeningPool.length),
    });
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
  const correctionFeatureCache = new Map();
  const correctionFeatures = layout => {
    const key = keyOf(layout);
    if (correctionFeatureCache.has(key)) return correctionFeatureCache.get(key);
    const metrics = jellyLayoutMetrics(layout, S, { fever, assumeValid: true, _metricContext: metricContext });
    const denominator = Math.max(1, unlocked.length);
    const cells = metrics.cells;
    const organelleByType = new Array(8).fill(0);
    const proximityByType = new Array(8).fill(0);
    const positionByType = new Array(16).fill(0);
    for (const cell of cells) {
      if (cell.organelle > 1) organelleByType[cell.type]++;
      if (cell.proximity > 1) proximityByType[cell.type]++;
      positionByType[2 * cell.type] += (cell.anchor % JELLY_COLS) / JELLY_COLS;
      positionByType[2 * cell.type + 1] += Math.floor(cell.anchor / JELLY_COLS) / 10;
    }
    const features = [
      ...metrics.rawCounts.map(count => count / denominator),
      metrics.infectedSlots / denominator,
      cells.filter(cell => cell.organelle > 1).length / denominator,
      cells.filter(cell => cell.proximity > 1).length / denominator,
      cells.reduce((sum, cell) => sum + cell.slots.length, 0) / denominator,
      cells.reduce((sum, cell) => sum + (metricContext.travelFor?.(cell.anchor, cell.type)
        ?? jellyProjectileHitDelay(cell.anchor, cell.type, () => 0.5)), 0) / Math.max(1, cells.length),
      ...organelleByType.map(count => count / denominator),
      ...proximityByType.map(count => count / denominator),
      ...positionByType.map(value => value / denominator),
    ];
    _setJellySearchCache(correctionFeatureCache, key, features, 4096);
    return features;
  };
  let surrogateCorrection = _fitJellySurrogateCorrection(options.surrogateCorrection === false ? [] : screened.filter(row => row.screening?.valid).map(row => ({
    score: row.score, observed: row.screeningScore, features: correctionFeatures(row.layout),
  })));
  const correctedRanks = new Map();
  const correctedRank = candidate => {
    if (options.surrogateCorrection === false || !surrogateCorrection.diagnostics.weight) return candidate.score;
    const key = keyOf(candidate.layout);
    if (correctedRanks.has(key)) return correctedRanks.get(key);
    const rank = surrogateCorrection.rank(candidate.score, correctionFeatures(candidate.layout));
    _setJellySearchCache(correctedRanks, key, rank, 4096);
    return rank;
  };
  for (const candidate of screened) {
    const parent = screened.find(row => keyOf(row.layout) === candidate.moveParentKey);
    const baseline = parent || screened.find(row => keyOf(row.layout) === savedKey);
    if (!baseline?.screening?.valid) continue;
    const reward = (candidate.screeningScore - baseline.screeningScore)
      / Math.max(1, Math.abs(candidate.screeningScore) + Math.abs(baseline.screeningScore));
    for (const chain of adaptiveChains) chain.observe(candidate.moveFamily, reward);
  }
  const calibratedCandidateCount = Math.min(8, Math.max(2, finalistCount));
  const calibratedCandidates = [];
  const calibratedKeys = new Set(screenedKeys);
  for (const candidate of Array.from(searchArchive.values())
    .sort((a, b) => (
      (options.surrogateCorrection === false ? 0 : correctedRank(b) - correctedRank(a))
      || (compositionCorrection.get(compositionKey(b.layout)) || 0) - (compositionCorrection.get(compositionKey(a.layout)) || 0)
      || compareProxy(a, b)
    ))) {
    const [normalized] = normalizeCandidates([candidate]);
    const key = keyOf(normalized.layout);
    if (calibratedKeys.has(key)) continue;
    calibratedKeys.add(key);
    calibratedCandidates.push(normalized);
    if (calibratedCandidates.length >= calibratedCandidateCount) break;
  }
  if (calibratedCandidates.length) {
    const calibratedScreened = yield* screenCandidates(calibratedCandidates, screeningTrials, (candidate, index) => {
      options.onProgress?.({
        phase: `Calibrating candidate ${index + 1}/${calibratedCandidates.length}`,
        detail: `Using ${screeningTrials} shared-seed trials to correct structural proxy rankings`,
        completed: searchRounds + 0.9 + (index + 1) / Math.max(1, calibratedCandidates.length) / 10,
        total: searchRounds + 2 + finalistCount,
        overallPercent: 50 + 2 * (index + 1) / Math.max(1, calibratedCandidates.length),
      });
    });
    screened.push(...calibratedScreened);
    screeningPool.push(...calibratedCandidates);
    screened.sort((a, b) => b.screeningScore - a.screeningScore || compareProxy(a, b));
  }

  enterPhase('feedback');
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
  const addFeedback = (layout, kind, metadata = {}) => {
    if (!layout) return false;
    const key = jellyLayoutKey(layout);
    if (feedbackKeys.has(key)) return false;
    feedbackKeys.add(key);
    feedbackCandidates.push({ ...metadata, layout, score: scoreLayout(layout), feedbackKind: kind });
    evaluated++;
    if (kind === 'relocation') relocationFeedbackCount++;
    else if (kind === 'swap') swapFeedbackCount++;
    else if (kind === 'region') regionFeedbackCount++;
    return true;
  };
  const adaptiveFeedbackBudget = adaptiveMoves ? Math.floor(feedbackBudget / 4) : 0;
  let adaptiveFeedbackProposals = 0;
  for (const chain of adaptiveChains) chain.restart();
  for (let index = 0; index < adaptiveFeedbackBudget; index++) {
    const leader = feedbackLeaders[index % feedbackLeaders.length];
    if (!leader) break;
    const chain = adaptiveChains[index % adaptiveChains.length];
    for (const candidate of chain.run(leader, 1, index / Math.max(1, adaptiveFeedbackBudget - 1))) {
      addFeedback(candidate.layout, 'adaptive', candidate);
    }
    adaptiveFeedbackProposals++;
  }
  const remainingFeedbackBudget = feedbackBudget - adaptiveFeedbackBudget;
  const relocationBudget = Math.ceil(remainingFeedbackBudget / 2);
  const swapBudget = Math.ceil(remainingFeedbackBudget / 4);
  const regionBudget = Math.max(1, remainingFeedbackBudget - relocationBudget - swapBudget);
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
  function* repackRegionExact(layout, region, nodeBudget = 3000, resultLimit = 4) {
    const exactOptions = {
      ...Object.fromEntries(['branchAndBound', 'shapeAwareBound', 'allowedTypes', 'deterministicNodeBudget']
        .filter(key => options[key] !== undefined).map(key => [key, options[key]])),
      regionSlots: Array.from(region).sort((a, b) => a - b),
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
    };
    const result = discoveryPooling ? yield* discoveryWork({
      kind: 'repack', layout, options: { ...exactOptions, scoreOptions: discoveryScoreOptions },
    }) : enumerateJellyRegionRepairsExact(layout, S, { ...options, ...exactOptions, _scoreLayout: scoreLayout });
    exactRegionNodes += result.certificate.nodesExpanded;
    exactRegionLayouts += result.candidates.length;
    if (result.certificate.complete) exactRegionCompleteScopes++;
    else exactRegionBudgetLimitedScopes++;
    return result.candidates;
  }
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
        for (const exact of yield* repackRegionExact(leader.layout, region)) {
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
  const measuredBeforeFeedback = new Set(screened.map(candidate => keyOf(candidate.layout)));
  const normalizedFeedback = normalizeCandidates(feedbackCandidates)
    .filter(candidate => !measuredBeforeFeedback.has(keyOf(candidate.layout)));
  const feedbackPool = normalizedFeedback.length
    ? selectDiverseBy(normalizedFeedback, Math.min(Math.max(2, Math.ceil(finalistCount / 2)), normalizedFeedback.length),
      (a, b) => correctedRank(b) - correctedRank(a) || compareProxy(a, b))
    : [];
  screened.push(...yield* screenCandidates(feedbackPool, screeningTrials));
  const simulationFeedback = { rounds: [], proposals: 0, screened: 0, repairScopes: 0, repairNodes: 0,
    repairCompleteScopes: 0, repairBudgetLimitedScopes: 0, repairsScreened: 0, repairImprovements: 0 };
  const simulationFeedbackRounds = Math.max(0, Math.min(4, Math.floor(
    options.simulationFeedbackRounds == null ? 2 : n(options.simulationFeedbackRounds)
  )));
  const feedbackRandom = seededRandom((Math.floor(n(options.seed) || 1) ^ structuralStartSeed ^ 0x51ed270b) >>> 0);
  const measuredKeys = new Set(screened.map(candidate => keyOf(candidate.layout)));
  let bestOperationRepair = null;
  const refreshCorrection = () => {
    surrogateCorrection = _fitJellySurrogateCorrection(options.surrogateCorrection === false ? []
      : screened.filter(row => row.screening?.valid).map(row => ({
        score: row.score, observed: row.screeningScore, features: correctionFeatures(row.layout),
      })));
    correctedRanks.clear();
  };
  for (let round = 0; round < simulationFeedbackRounds; round++) {
    refreshCorrection();
    const leaders = _selectJellyAcquisition(screened, Math.min(3, screened.length), candidate => ({
      rank: screened.filter(other => other.screeningScore <= candidate.screeningScore).length / screened.length,
      uncertainty: 0,
    }), keyOf);
    const proposals = [];
    const addProposal = (layout, metadata = {}) => {
      if (!layout) return;
      proposals.push({ ...metadata, layout, score: scoreLayout(layout), feedbackKind: 'simulation-feedback' });
      evaluated++;
    };
    const families = ['replacement', 'relocation', 'dependency-rebuild', 'swap'];
    const attempts = Math.max(24, Math.floor(feedbackBudget / Math.max(1, simulationFeedbackRounds)));
    for (let attempt = 0; attempt < attempts; attempt++) {
      const leader = leaders[attempt % leaders.length];
      addProposal(proposeAdaptiveMove(leader.layout, families[(attempt + round) % families.length], feedbackRandom), {
        moveParentKey: keyOf(leader.layout), neighborhoodPolicy: leader.screeningPolicy,
      });
    }
    if (options.operationRepairs !== false) {
      for (let index = 0; index < Math.min(2, leaders.length); index++) {
        const leader = leaders[(index + round) % leaders.length];
        const metrics = jellyLayoutMetrics(leader.layout, S, { fever: leader.screeningPolicy.fever });
        const expectedByType = new Array(8).fill(0);
        for (const cell of metrics.cells) expectedByType[cell.type] += cell.damage * cell.attacksPerSecond;
        const actual = leader.screening.meanCellTypeContribution || [];
        const totalExpected = Math.max(1, expectedByType.reduce((sum, value) => sum + value, 0));
        const actualField = objective === 'exp' ? 'exp' : objective === 'bloodcells' ? 'bloodcells' : 'damage';
        const totalActual = Math.max(1, actual.reduce((sum, row) => sum + n(row[actualField]), 0));
        const weak = metrics.cells.slice().sort((a, b) => {
          const ratio = cell => (n(actual[cell.type]?.[actualField]) / totalActual)
            / Math.max(1e-12, expectedByType[cell.type] / totalExpected);
          return ratio(a) - ratio(b) || a.anchor - b.anchor;
        });
        const centers = Array.from(new Set([
          ...weak.slice(0, 2).map(cell => cell.anchor),
          ...metrics.cells.filter(cell => [3, 4, 5].includes(cell.type)).map(cell => cell.anchor),
        ]));
        if (!centers.length) continue;
        const nodeBudget = Math.max(32, Math.min(10000, Math.floor(n(options.operationRepairNodeBudget) || 1500)));
        const repairAcquisition = layout => {
          const score = scoreLayout(layout);
          const features = correctionFeatures(layout);
          const rank = options.surrogateCorrection === false
            ? screened.filter(row => row.score <= score).length / screened.length
            : surrogateCorrection.rank(score, features);
          return rank + 0.15 * surrogateCorrection.uncertainty(features)
            + 0.001 * Math.sign(score) * Math.log1p(Math.abs(score));
        };
        const repair = enumerateJellyRegionFreeExact(leader.layout, S, {
          regionSlots: regionSlots(centers[(index + round) % centers.length], 3),
          objective, fever: leader.screeningPolicy.fever, obstruction, expCellType,
          nodeBudget, deterministicNodeBudget: true, resultLimit: 2, _scoreLayout: repairAcquisition,
        });
        simulationFeedback.repairScopes++;
        simulationFeedback.repairNodes += repair.certificate.nodesExpanded;
        if (repair.certificate.complete) simulationFeedback.repairCompleteScopes++;
        else simulationFeedback.repairBudgetLimitedScopes++;
        for (const candidate of repair.candidates) addProposal(candidate.layout, {
          operationRepairOrigin: true, moveParentKey: keyOf(leader.layout),
          neighborhoodPolicy: leader.screeningPolicy,
        });
        for (const order of [types, types.slice().reverse()]) addProposal(
          rebuildRegion(leader.layout, regionSlots(centers[(index + round) % centers.length], 3), order),
          { operationRepairOrigin: true, moveParentKey: keyOf(leader.layout), neighborhoodPolicy: leader.screeningPolicy }
        );
      }
    }
    const generated = normalizeCandidates(proposals).filter(candidate => !measuredKeys.has(keyOf(candidate.layout)));
    simulationFeedback.proposals += generated.length;
    const pool = normalizeCandidates([
      ...generated, ...feedbackCandidates,
      ...selectDiverseBy(Array.from(searchArchive.values())
        .filter(candidate => !measuredKeys.has(keyOf(candidate.layout))), Math.max(64, beamWidth * 8), compareProxy),
    ]).filter(candidate => !measuredKeys.has(keyOf(candidate.layout)));
    const predict = candidate => {
      const features = correctionFeatures(candidate.layout);
      return {
        rank: options.surrogateCorrection === false
          ? screened.filter(row => row.score <= candidate.score).length / screened.length
          : surrogateCorrection.rank(candidate.score, features),
        uncertainty: surrogateCorrection.uncertainty(features),
      };
    };
    const limit = Math.max(2, Math.min(8, Math.ceil(finalistCount / 2)));
    const acquired = _selectJellyAcquisition(pool, limit, predict, keyOf);
    const repairChampion = _selectJellyAcquisition(generated.filter(candidate => candidate.operationRepairOrigin), 1, predict, keyOf)[0];
    if (repairChampion && !acquired.some(candidate => keyOf(candidate.layout) === keyOf(repairChampion.layout))) {
      acquired.push(repairChampion);
    }
    if (!acquired.length) break;
    let improved = 0;
    const before = Math.max(...screened.map(candidate => candidate.screeningScore));
    for (const measured of yield* screenCandidates(acquired, screeningTrials)) {
      measuredKeys.add(keyOf(measured.layout));
      if (measured.screeningScore > before) improved++;
      if (measured.operationRepairOrigin) {
        simulationFeedback.repairsScreened++;
        const parent = screened.find(row => keyOf(row.layout) === measured.moveParentKey);
        if (parent && measured.screeningScore > parent.screeningScore) simulationFeedback.repairImprovements++;
        if (!bestOperationRepair || measured.screeningScore > bestOperationRepair.screeningScore) bestOperationRepair = measured;
      }
      screened.push(measured);
      feedbackPool.push(measured);
    }
    simulationFeedback.screened += acquired.length;
    simulationFeedback.rounds.push({
      round: round + 1, trainingLayouts: screened.length - acquired.length,
      proposed: generated.length, screened: acquired.length, improved,
      correctionWeight: surrogateCorrection.diagnostics.weight,
    });
    considerLiveCandidate(screened.slice().sort((a, b) => b.screeningScore - a.screeningScore)[0],
      'screening', 'Iterative operation simulation feedback');
    reportLayoutProgress(`Simulation feedback ${round + 1}/${simulationFeedbackRounds}`, 52 + 4 * (round + 1) / simulationFeedbackRounds);
  }
  refreshCorrection();
  reportLayoutProgress('Refining candidate neighborhoods', 56);
  screened.sort((a, b) => b.screeningScore - a.screeningScore || compareProxy(a, b));
  const immunoidCount = candidate => Object.values(candidate.layout).filter(type => Number(type) === 4).length;
  const bestImmunoidScreened = screened.find(candidate => immunoidCount(candidate) > 0);
  const bestVirusCoverageScreened = screened
    .filter(candidate => coverageStats(candidate).infectedSlots > 0)
    .sort((a, b) => coverageStats(b).infectedSlots - coverageStats(a).infectedSlots || b.screeningScore - a.screeningScore)[0];
  const bestOrganelleCoverageScreened = screened
    .filter(candidate => coverageStats(candidate).organelleCells > 0)
    .sort((a, b) => coverageStats(b).organelleCells - coverageStats(a).organelleCells || b.screeningScore - a.screeningScore)[0];
  const bestJointCoverageScreened = screened
    .filter(candidate => coverageStats(candidate).infectedOrganelles > 0)
    .sort((a, b) => coverageStats(b).infectedOrganelles - coverageStats(a).infectedOrganelles
      || coverageStats(b).infectedSlots - coverageStats(a).infectedSlots
      || b.screeningScore - a.screeningScore)[0];
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
  let adaptiveRacingRejected = 0;
  if (options.adaptiveAllocation !== false && screened.length > racingPool.length) {
    const leaderBounds = operationConfidenceBounds(screened[0].screening, objective, expCellType);
    const racingKeys = new Set(racingPool.map(candidate => jellyLayoutKey(candidate.layout)));
    const adaptiveCap = Math.min(screened.length, Math.max(racingCandidateCount, finalistCount * 4));
    for (const candidate of screened.slice(racingCandidateCount)) {
      if (racingPool.length >= adaptiveCap) break;
      const bounds = operationConfidenceBounds(candidate.screening, objective, expCellType);
      if (bounds[1] < leaderBounds[0]) {
        adaptiveRacingRejected++;
        continue;
      }
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
  for (const candidate of [bestVirusCoverageScreened, bestOrganelleCoverageScreened, bestJointCoverageScreened, bestOperationRepair]) {
    if (candidate && !racingPool.some(existing => jellyLayoutKey(existing.layout) === jellyLayoutKey(candidate.layout))) {
      racingPool.push(candidate);
    }
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
  for (const key of seedCandidateKeys) {
    if (racingPool.some(candidate => jellyLayoutKey(candidate.layout) === key)) continue;
    const seedCandidate = screened.find(candidate => jellyLayoutKey(candidate.layout) === key);
    if (seedCandidate) racingPool.push(seedCandidate);
  }
  enterPhase('racing');
  if (racingTrials > screeningTrials || options.cheapScreening === true) {
    screened = yield* screenCandidates(racingPool, racingTrials, (candidate, index) => {
      options.onProgress?.({
        phase: `Racing candidate ${index + 1}/${racingPool.length}`,
        detail: `Increasing survivors to ${racingTrials} shared-seed trials before finalist selection`,
        completed: searchRounds + 1 + (index + 1) / Math.max(1, racingPool.length),
        total: searchRounds + 2 + finalistCount,
        overallPercent: 56 + 8 * (index + 1) / Math.max(1, racingPool.length),
      });
    }, true);
    screened.sort((a, b) => b.screeningScore - a.screeningScore || compareProxy(a, b));
    considerLiveCandidate(screened[0], 'racing', 'Adaptive simulation race');
    reportLayoutProgress('Adaptive candidate race complete', 64);
  }

  reportLayoutProgress('Selecting discovery finalists', 64);
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
  const bestVirusCoverageRaced = screened
    .filter(candidate => coverageStats(candidate).infectedSlots > 0)
    .sort((a, b) => coverageStats(b).infectedSlots - coverageStats(a).infectedSlots || b.screeningScore - a.screeningScore)[0];
  const bestOrganelleCoverageRaced = screened
    .filter(candidate => coverageStats(candidate).organelleCells > 0)
    .sort((a, b) => coverageStats(b).organelleCells - coverageStats(a).organelleCells || b.screeningScore - a.screeningScore)[0];
  const bestJointCoverageRaced = screened
    .filter(candidate => coverageStats(candidate).infectedOrganelles > 0)
    .sort((a, b) => coverageStats(b).infectedOrganelles - coverageStats(a).infectedOrganelles
      || coverageStats(b).infectedSlots - coverageStats(a).infectedSlots
      || b.screeningScore - a.screeningScore)[0];
  const bestOperationRepairRaced = screened.find(candidate => candidate.operationRepairOrigin);
  for (const candidate of [bestVirusCoverageRaced, bestOrganelleCoverageRaced, bestJointCoverageRaced, bestOperationRepairRaced]) {
    const key = candidate ? jellyLayoutKey(candidate.layout) : null;
    if (candidate && !finalistKeys.has(key)) {
      finalists.push(candidate);
      finalistKeys.add(key);
    }
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
    finalists.push(screened.find(candidate => jellyLayoutKey(candidate.layout) === savedKey) || (yield* screenCandidate({
      layout: saved,
      score: scoreLayout(saved),
    }, racingTrials)));
    finalistKeys.add(savedKey);
  }
  for (const seed of seedEntries) {
    if (finalistKeys.has(seed.key)) continue;
    finalists.push(screened.find(candidate => jellyLayoutKey(candidate.layout) === seed.key) || (yield* screenCandidate({
      layout: seed.layout,
      score: scoreLayout(seed.layout),
      seedOrigin: seed.label,
    }, racingTrials)));
    finalistKeys.add(seed.key);
  }
  for (const key of seedCandidateKeys) {
    if (finalistKeys.has(key)) continue;
    const seedCandidate = screened.find(candidate => jellyLayoutKey(candidate.layout) === key);
    if (!seedCandidate) continue;
    finalists.push(seedCandidate);
    finalistKeys.add(key);
  }
  const normalizedFinalists = [];
  const normalizedFinalistKeys = new Set();
  for (const candidate of finalists) {
    const originalKey = jellyLayoutKey(candidate.layout);
    const layout = originalKey === savedKey || seedExactKeys.has(originalKey)
      ? candidate.layout
      : fillOpenSlots(candidate.layout);
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
  let reranked = [];
  enterPhase('finalists');
  for (const [index, candidate] of normalizedFinalists.entries()) {
    if (options.deferFinalization) reportLayoutProgress(
      `Checking finalist policies ${index + 1}/${normalizedFinalists.length}`,
      64 + 14 * index / Math.max(1, normalizedFinalists.length)
    );
    const measured = options.deferFinalization ? yield* screenCandidate(candidate, racingTrials, true) : null;
    const simulation = measured ? { ...measured.screening, ...measured.screeningPolicy, objective }
      : yield* createJellyPolicySearch(candidate.layout, S, {
      ...options,
      obstruction,
      fever: options.fever,
      roidTiming: options.roidTiming,
      revivePolicy: options.revivePolicy,
      trials: simulationTrials,
      seed: Math.floor(n(options.seed) || 1),
      _simulateTrials: cachedSimulateTrials,
      _sourcePolicyTrials: true,
      onProgress: progress => options.onProgress?.({
        phase: `Simulating finalist ${index + 1}/${normalizedFinalists.length}: ${progress.phase}`,
        detail: progress.detail || `Optimizing policy and running ${simulationTrials} trials for this finalist`,
        completed: searchRounds + 2 + index + Number(progress.completed) / Math.max(1, Number(progress.total)),
        total: searchRounds + 2 + normalizedFinalists.length,
        overallPercent: 64 + 14 * (index + Number(progress.completed) / Math.max(1, Number(progress.total))) / Math.max(1, normalizedFinalists.length),
      }),
    });
    reranked.push({ ...candidate, simulation, simulatedScore: simulatedObjectiveScore(simulation, objective, expCellType) });
    if (options.deferFinalization) reportLayoutProgress(
      `Checking finalist policies ${index + 1}/${normalizedFinalists.length}`,
      64 + 14 * (index + 1) / Math.max(1, normalizedFinalists.length)
    );
  }
  reranked.sort((a, b) => b.simulatedScore - a.simulatedScore
    || b.score - a.score
    || moveCount(a.layout) - moveCount(b.layout)
    || jellyLayoutKey(a.layout).localeCompare(jellyLayoutKey(b.layout)));
  enterPhase('neighborhood');
  reportLayoutProgress('Preparing winner neighborhoods', 78);
  const neighborhoodKeys = new Set(reranked.map(candidate => jellyLayoutKey(candidate.layout)));
  const neighborhoodCandidates = [];
  const addNeighborhood = (layout, neighborhoodPolicy = null) => {
    if (!layout) return null;
    const key = jellyLayoutKey(layout);
    if (neighborhoodKeys.has(key)) return null;
    neighborhoodKeys.add(key);
    neighborhoodCandidates.push({ layout, score: scoreLayout(layout), seedKind: 'winner-neighborhood', neighborhoodPolicy });
    evaluated++;
    return key;
  };
  const organelleReanchorKeys = [];
  const organelleVirusCoupledKeys = [];
  let organelleReanchorNodes = 0;
  const neighborhoodLeaderLimit = Math.max(1, Math.min(8, Math.floor(
    options.neighborhoodLeaders == null ? (simulationTrials >= 128 ? 3 : 1) : n(options.neighborhoodLeaders)
  )));
  const neighborhoodLeaders = reranked.slice(0, Math.min(neighborhoodLeaderLimit, reranked.length));
  for (const [leaderIndex, neighborhoodLeader] of neighborhoodLeaders.entries()) {
    reportLayoutProgress(
      `Preparing winner neighborhoods ${leaderIndex + 1}/${neighborhoodLeaders.length}`,
      78 + leaderIndex / Math.max(1, neighborhoodLeaders.length)
    );
    const leaderAnchors = Object.keys(neighborhoodLeader.layout).map(Number);
    for (const rawAnchor of Object.keys(neighborhoodLeader.layout)) {
      const anchor = Number(rawAnchor);
      const type = Number(neighborhoodLeader.layout[rawAnchor]);
      const removed = jellyRemoveCell(neighborhoodLeader.layout, anchor);
      for (const placement of placementByType[type] || []) {
        if (placement.anchor === anchor) continue;
        const relocated = placeWithReplacement(removed, placement);
        addNeighborhood(relocated, neighborhoodLeader.simulation);
      }
    }
    const coupled = jellyOrganelleVirusCoupledCandidates(neighborhoodLeader.layout, S, {
      nodeBudget: Math.max(1000, Math.floor(n(options.organelleVirusNodeBudget) || 100000)),
      retainLimit: Math.max(8, Math.floor(n(options.organelleVirusCandidateCap) || 96)),
    });
    for (const layout of coupled.layouts) {
      const key = addNeighborhood(layout, neighborhoodLeader.simulation);
      if (key) organelleVirusCoupledKeys.push(key);
    }
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
  normalizedCandidates.neighborhoodRaw = neighborhoodCandidates.length;
  const reanchorKeySet = new Set(organelleReanchorKeys);
  const coupledKeySet = new Set(organelleVirusCoupledKeys);
  const normalizedNeighborhood = normalizeCandidates(neighborhoodCandidates).map(candidate => ({
    ...candidate,
    organelleReanchorOrigin: candidate.sourceKeys.some(key => reanchorKeySet.has(key)),
    organelleVirusCoupledOrigin: candidate.sourceKeys.some(key => coupledKeySet.has(key)),
  })).filter(candidate => !reranked.some(row => keyOf(row.layout) === keyOf(candidate.layout)));
  normalizedCandidates.neighborhoodUnique = normalizedNeighborhood.length;
  const diverseNeighborhood = selectDiverse(normalizedNeighborhood, Math.min(24, normalizedNeighborhood.length));
  const neighborhoodShortlist = diverseNeighborhood.slice();
  for (const candidate of normalizedNeighborhood.filter(row => row.organelleReanchorOrigin).sort(compareProxy).slice(0, 3)) {
    if (!neighborhoodShortlist.some(row => keyOf(row.layout) === keyOf(candidate.layout))) neighborhoodShortlist.push(candidate);
  }
  const bestCoupled = normalizedNeighborhood.filter(row => row.organelleVirusCoupledOrigin).sort(compareProxy)[0];
  if (bestCoupled && !neighborhoodShortlist.some(row => jellyLayoutKey(row.layout) === jellyLayoutKey(bestCoupled.layout))) {
    neighborhoodShortlist.push(bestCoupled);
  }
  const neighborhoodTrials = Math.min(simulationTrials, Math.max(16, screeningTrials * 4));
  let neighborhoodPromoted = 0;
  if (neighborhoodShortlist.length && neighborhoodTrials > 0) {
    reportLayoutProgress('Checking winner neighborhood', 79);
    const neighborhoodLeader = reranked[0];
    const policy = neighborhoodLeader.simulation;
    const neighborhoodRows = [
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
    ];
    for (const [index, candidate] of neighborhoodShortlist.entries()) {
        reportLayoutProgress(
          `Checking winner neighborhood ${index + 1}/${neighborhoodShortlist.length}`,
          79 + index / Math.max(1, neighborhoodShortlist.length)
        );
        if (options.jointPolicyScreening !== false) {
          const screened = yield* screenCandidate(candidate, neighborhoodTrials, true);
          neighborhoodRows.push({ candidate, simulation: screened.screening });
          continue;
        }
        const candidatePolicy = candidate.neighborhoodPolicy || policy;
        neighborhoodRows.push({
          candidate,
          simulation: cachedSimulateTrials(candidate.layout, S, {
            ...options,
            obstruction,
            fever: candidatePolicy.fever,
            roidTiming: candidatePolicy.roidTiming,
            revivePolicy: candidatePolicy.revivePolicy,
            trials: neighborhoodTrials,
            seed: Math.floor(n(options.seed) || 1),
          }),
        });
    }
    const neighborhoodScreened = neighborhoodRows.map(row => ({
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
    const mandatoryCoupled = neighborhoodScreened.find(row => row.candidate.organelleVirusCoupledOrigin);
    if (mandatoryCoupled && !promoted.some(row => jellyLayoutKey(row.candidate.layout) === jellyLayoutKey(mandatoryCoupled.candidate.layout))) {
      promoted.push(mandatoryCoupled);
    }
    for (const row of promoted) {
      const measured = options.deferFinalization ? yield* screenCandidate(row.candidate, neighborhoodTrials, true) : null;
      const simulation = measured ? { ...measured.screening, ...measured.screeningPolicy, objective }
        : yield* createJellyPolicySearch(row.candidate.layout, S, {
        ...options,
        obstruction,
        fever: options.fever,
        roidTiming: options.roidTiming,
        revivePolicy: options.revivePolicy,
        trials: simulationTrials,
        seed: Math.floor(n(options.seed) || 1),
        _simulateTrials: cachedSimulateTrials,
        _sourcePolicyTrials: true,
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
  const heldoutValidation = !options.deferFinalization && simulationTrials >= 64 && options.heldoutValidation !== false;
  if (heldoutValidation) {
    const validated = [];
    for (const [index, candidate] of reranked.entries()) {
      reportLayoutProgress(`Validating finalist ${index + 1}/${reranked.length}`, 84 + 6 * (index + 1) / Math.max(1, reranked.length));
      const validationSimulation = yield* finalistTrials(candidate.layout, {
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
      validated.push({
        ...candidate,
        trainingSimulation: candidate.simulation,
        validationSimulation,
        trainingScore: candidate.simulatedScore,
        validationScore,
        robustScore,
        simulatedScore: robustScore,
      });
    }
    reranked = validated.sort((a, b) => b.robustScore - a.robustScore
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
    for (const key of seedCandidateKeys) {
      if (finalCandidates.some(candidate => jellyLayoutKey(candidate.layout) === key)) continue;
      const seedCandidate = reranked.find(candidate => jellyLayoutKey(candidate.layout) === key);
      if (seedCandidate) finalCandidates.push(seedCandidate);
    }
    const finalKeys = new Set(finalCandidates.map(candidate => jellyLayoutKey(candidate.layout)));
    const finalTrials = Math.min(adaptiveMaxTrials, Math.max(512, simulationTrials));
    let heldoutIndex = 0;
    const confirmed = [];
    for (const candidate of reranked) {
      if (!finalKeys.has(jellyLayoutKey(candidate.layout))) { confirmed.push(candidate); continue; }
      heldoutIndex++;
      reportLayoutProgress(`Confirming finalist ${heldoutIndex}/${finalCandidates.length}`, 90 + 6 * heldoutIndex / Math.max(1, finalCandidates.length));
      const simulation = yield* finalistTrials(candidate.layout, {
        ...options,
        obstruction,
        fever: candidate.simulation.fever,
        roidTiming: candidate.simulation.roidTiming,
        revivePolicy: candidate.simulation.revivePolicy,
        trials: finalTrials,
        seed: confirmationSeed,
        includeTrials: true,
      });
      confirmed.push({
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
      });
    }
    reranked = confirmed.sort((a, b) => Number(b.finalConfirmed) - Number(a.finalConfirmed)
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
  while (!options.deferFinalization && reranked.length > 1 && confirmedTrials < adaptiveMaxTrials) {
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
    const resolved = [];
    for (const candidate of reranked) {
      if (!competitiveKeys.has(jellyLayoutKey(candidate.layout))) { resolved.push(candidate); continue; }
      overlapIndex++;
      reportLayoutProgress(`Resolving close finalists ${overlapIndex}/${competitive.length}`, overlapBase + 0.75 * overlapIndex / Math.max(1, competitive.length));
      const simulation = yield* finalistTrials(candidate.layout, {
        ...options,
        obstruction,
        fever: candidate.simulation.fever,
        roidTiming: candidate.simulation.roidTiming,
        revivePolicy: candidate.simulation.revivePolicy,
        trials: nextTrials,
        seed: confirmationSeed,
        includeTrials: true,
      });
      resolved.push({
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
      });
    }
    reranked = resolved.sort((a, b) => Number(b.finalConfirmed) - Number(a.finalConfirmed)
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
  const reporting = !options.deferFinalization || options.consolidateWork === false;
  const { proxyAudit, archetypeResults, countArchetypeResults, obstructionBandResults } = reporting
    ? _jellyFinalistDiagnostics(reranked, S, obstructionBands)
    : { proxyAudit: null, archetypeResults: [], countArchetypeResults: [], obstructionBandResults: [] };
  const screeningGeometryDiversity = geometryDiversitySummary(screened);
  const finalistGeometryDiversity = geometryDiversitySummary(reranked);
  const eligibleFinalists = heldoutValidation
    ? reranked.filter(candidate => candidate.finalConfirmed)
    : reranked;
  const selectedLeader = eligibleFinalists[0] || reranked[0];
  const pairedClassification = confidence => {
    if (!confidence) return 'unavailable';
    if (confidence.low > 0) return 'confirmed-better';
    if (confidence.high < 0) return 'confirmed-worse';
    return 'statistically-unresolved';
  };
  const selectedLeaderKey = selectedLeader ? jellyLayoutKey(selectedLeader.layout) : '';
  const selectedLeaderVsSaved = selectedLeader && savedFinalist && selectedLeaderKey !== savedKey
    ? pairedOperationConfidence(selectedLeader.simulation, savedFinalist.simulation, objective, expCellType)
    : null;
  const selectedLeaderClassification = pairedClassification(selectedLeaderVsSaved);
  let best = selectedLeader;
  if (!options.deferFinalization && savedFinalist && (
    !selectedLeader
    || selectedLeaderKey === savedKey
    || selectedLeaderClassification !== 'confirmed-better'
  )) {
    best = savedFinalist;
  }
  const challengerComparison = selectedLeader && selectedLeaderKey !== savedKey
    ? {
      layout: selectedLeader.layout,
      operation: stripTrialResults(selectedLeader.simulation),
      simulatedScore: selectedLeader.simulatedScore,
      classification: selectedLeaderClassification,
      confidence: selectedLeaderVsSaved,
      selected: jellyLayoutKey(best.layout) === selectedLeaderKey,
    }
    : null;
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
  const bestKey = jellyLayoutKey(best.layout);
  const seedComparison = {
    requested: seedRequests.length,
    accepted: seedEntries.length,
    rejected: seedRejections,
    objective,
    entries: seedEntries.map(seed => {
      const rankOf = candidate => (candidate ? reranked.indexOf(candidate) + 1 : null);
      const exact = reranked.find(candidate => jellyLayoutKey(candidate.layout) === seed.key) || null;
      const filledLayout = fillOpenSlots(seed.layout);
      const filledKey = jellyLayoutKey(filledLayout);
      const filled = filledKey === seed.key
        ? null
        : reranked.find(candidate => jellyLayoutKey(candidate.layout) === filledKey) || null;
      const vsBest = exact && bestKey !== seed.key
        ? (() => {
          const confidence = pairedOperationConfidence(exact.simulation, best.simulation, objective, expCellType);
          return confidence ? { ...confidence, classification: pairedClassification(confidence) } : null;
        })()
        : null;
      return {
        index: seed.index,
        label: seed.label,
        key: seed.key,
        layout: seed.layout,
        cells: Object.keys(seed.layout).length,
        matchesSaved: seed.matchesSaved,
        simulated: Boolean(exact),
        rank: rankOf(exact),
        simulatedScore: exact?.simulatedScore ?? null,
        operation: stripTrialResults(exact?.simulation) || null,
        isWinner: bestKey === seed.key,
        vsBest,
        filled: filled ? {
          key: filledKey,
          layout: filledLayout,
          cells: Object.keys(filledLayout).length,
          rank: rankOf(filled),
          simulatedScore: filled.simulatedScore,
          isWinner: bestKey === filledKey,
        } : null,
      };
    }),
  };
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
      phase: 'Iterative simulation feedback',
      method: 'Novelty-aware acquisition and joint layout-policy screening',
      candidates: simulationFeedback.screened,
      trials: screeningTrials,
      claim: 'ranking-evidence-only',
      evidence: `${simulationFeedback.rounds.length} learning round(s); heuristic acquisition uncertainty is not a confidence interval.`,
    },
    {
      phase: 'Operation-guided multi-cell repairs',
      method: 'Fixed-outside free-composition proposals, source-simulated shortlists',
      candidates: simulationFeedback.repairsScreened,
      trials: screeningTrials,
      claim: 'best-found-only',
      evidence: `${simulationFeedback.repairCompleteScopes} exhausted proposal scope(s), ${simulationFeedback.repairBudgetLimitedScopes} budget-limited scope(s); no stochastic optimality claim.`,
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
  const immunoidBreakpoint = reporting
    ? _jellyImmunoidBreakpoint(best, immunoidFinalist, S, { ...options, obstruction }) : null;
  considerLiveCandidate({
    layout: best.layout,
    simulationScore: best.simulatedScore,
    simulation: best.simulation,
    baselineScore: savedFinalist?.simulatedScore,
  }, options.deferFinalization ? 'racing' : 'finalist',
  options.deferFinalization ? 'Discovery shortlist' : 'Fully simulated finalist');
  enterPhase('complete');
  reportLayoutProgress('Layout optimization complete', 100);
  return {
    objective,
    discoveryCandidates: options.deferFinalization ? reranked.map(candidate => {
      const key = jellyLayoutKey(candidate.layout);
      return {
        layout: candidate.layout,
        score: candidate.simulatedScore,
        obstructionBands: candidate.obstructionBand == null ? [] : [candidate.obstructionBand],
        mandatory: key === savedKey || seedCandidateKeys.has(key),
        roles: [
          candidate.blindOrigin || blindKeys.has(key) ? 'blind' : null,
          immunoidCount(candidate) > 0 ? 'immunoid' : null,
          key === (bestVirusCoverageRaced && keyOf(bestVirusCoverageRaced.layout)) ? 'virus-coverage' : null,
          key === (bestOrganelleCoverageRaced && keyOf(bestOrganelleCoverageRaced.layout)) ? 'organelle-coverage' : null,
          key === (bestJointCoverageRaced && keyOf(bestJointCoverageRaced.layout)) ? 'joint-coverage' : null,
          candidate.operationRepairOrigin ? 'repair' : null,
          types.every(type => Object.values(candidate.layout).includes(type)) ? 'all-types' : null,
        ].filter(Boolean),
      };
    }) : undefined,
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
    challengerComparison,
    seedComparison,
    anchorContributions: reporting ? jellyAnchorContributions(best.layout, S, { fever: best.simulation.fever }) : [],
    moves: jellyLayoutMoves(saved, best.layout),
    evaluated,
    search: {
      start: 'composition-seeded-saved-and-empty',
      model: 'hybrid-multifidelity',
      staticContextReused: staticSearchContext.reused,
      staticPlacementCount: placements.length,
      incrementalScoring: metricContext.diagnostics?.() || null,
      discoveryPhases: phaseTimes,
      discoveryWork: discoveryWorkStats,
      proxyScores: proxyCache ? {
        ...proxyCache.diagnostics(), hits: proxyCache.diagnostics().hits - proxyStatsBefore.hits,
      } : null,
      profile: options.profileSearch ? { ...searchProfile } : null,
      trialReuse: trialBatchCache.diagnostics(),
      measurements: options._measurementCache?.diagnostics() || null,
      policyReuse: options._policyCache?.diagnostics() || null,
      activeExactRepair,
      computeFocus: options.computeFocus || 'balanced',
      sharedElites: sharedEliteEntries.length,
      adaptiveMoves,
      adaptiveChains: adaptiveChains.map(chain => chain.diagnostics),
      adaptiveFeedbackProposals,
      surrogateCorrection: {
        ...surrogateCorrection.diagnostics,
        enabled: options.surrogateCorrection !== false,
      },
      jointPolicyScreening: options.jointPolicyScreening !== false,
      cheapScreening: options.cheapScreening === true,
      cheapScreeningCandidates,
      cheapScreeningPolicies,
      timingFevers: Math.min(availableFeverTypes(S, options.fever).length,
        options.jointPolicyScreening === false ? 2 : 6),
      simulationFeedback: {
        ...simulationFeedback,
        repairFinalist: Boolean(bestOperationRepairRaced && finalistKeys.has(keyOf(bestOperationRepairRaced.layout))),
      },
      constructionRounds: iterations,
      explorationRounds,
      earlyRebuildAttempts,
      coarseRebuildCandidates,
      initialBaseFamilies,
      explorationBaseFamilies,
      finalBeamBaseFamilies,
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
      adaptiveRacingRejected,
      normalizedCandidates,
      screeningPoliciesEvaluated,
      screeningPhysicalPoliciesReused,
      calibratedCandidates: calibratedCandidates.length,
      screeningGeometryDiversity,
      finalistGeometryDiversity,
      policyNiches: policyNicheMap.size,
      randomizedConstructionLanes,
      searchStarts,
      searchStartOffset,
      structuralStartSeed: structuralStartSeed >>> 0,
      organelleFillVirusCounts: Array.from(
        { length: types.includes(5) ? virusLimit + 1 : 1 },
        (_, count) => count
      ),
      islandProfiles: Array.from(
        { length: searchStarts },
        (_, start) => islandProfiles[(searchStartOffset + start) % islandProfiles.length]
      ),
      islandArchiveSizes: startSeen.map(keys => keys.size),
      islandMutationCandidates,
      islandMigrations,
      islandBiasScale,
      eliteArchiveSize: eliteArchive.size,
      diversitySummary: liveDiversitySnapshot(),
      scenarioCandidates: scenarioCandidates.length,
      eliteScreeningCandidates: eliteScreeningPool.length,
      compositionSeeds: seedCandidates.length,
      organelleCoverageSeeds,
      organelleStructureCounts,
      organelleCountLimitExplored,
      organelleVirusJointSeeds,
      boardAwareSeeds,
      boardAwareBestScore: Number.isFinite(boardAwareBestScore) ? boardAwareBestScore : null,
      greedyBestSeedScore: Number.isFinite(greedyBestSeedScore) ? greedyBestSeedScore : null,
      boardAwareFinalist: finalists.some(candidate => boardAwareKeys.has(jellyLayoutKey(candidate.layout))),
      maxJointVirusOrganelleTouches,
      virusConditionedSeeds,
      virusStructuresEnumerated,
      virusStructureNodes,
      virusStructureComplete,
      virusSearchMode,
      virusCountScope: types.includes(5) ? virusCountScope : 0,
      virusCoverageCandidates: virusCoverageCandidates.length,
      organelleCoverageCandidates: organelleCoverageCandidates.length,
      jointOrganelleVirusCandidates: jointOrganelleVirusCandidates.length,
      maxVirusInfectedSlotsScreened: bestVirusCoverageScreened ? coverageStats(bestVirusCoverageScreened).infectedSlots : 0,
      maxOrganelleCellsScreened: bestOrganelleCoverageScreened ? coverageStats(bestOrganelleCoverageScreened).organelleCells : 0,
      maxVirusInfectedOrganellesScreened: bestJointCoverageScreened ? coverageStats(bestJointCoverageScreened).infectedOrganelles : 0,
      virusCoverageFinalist: Boolean(bestVirusCoverageRaced && finalists.some(
        candidate => jellyLayoutKey(candidate.layout) === jellyLayoutKey(bestVirusCoverageRaced.layout)
      )),
      organelleCoverageFinalist: Boolean(bestOrganelleCoverageRaced && finalists.some(
        candidate => jellyLayoutKey(candidate.layout) === jellyLayoutKey(bestOrganelleCoverageRaced.layout)
      )),
      jointOrganelleVirusFinalist: Boolean(bestJointCoverageRaced && finalists.some(
        candidate => jellyLayoutKey(candidate.layout) === jellyLayoutKey(bestJointCoverageRaced.layout)
      )),
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
      organelleVirusCoupledCandidates: organelleVirusCoupledKeys.length,
      simulationCacheHits,
      simulationCacheMisses,
      layoutScoreCacheEntries: layoutScoreCache.size,
      simulationCacheEntries: simulationCache.size,
      simulationTrialRecordsCompacted,
      simulationCacheTrialEntriesTrimmed: 0,
      simulationCacheTrialsTrimmed: 0,
      obstructionBands,
      obstructionBandCandidates: obstructionBandCandidates.length,
      savedScreened: screeningPool.some(candidate => jellyLayoutKey(candidate.layout) === savedKey),
      savedRaced: racingPool.some(candidate => jellyLayoutKey(candidate.layout) === savedKey),
      savedFeedbackSeeded: feedbackLeaders.some(candidate => jellyLayoutKey(candidate.layout) === savedKey),
      savedFinalist: finalists.some(candidate => jellyLayoutKey(candidate.layout) === savedKey),
      seedLayoutsRequested: seedRequests.length,
      seedLayoutsAccepted: seedEntries.length,
      seedLayoutsRejected: seedRejections.length,
      seedLayoutsFinalist: seedEntries.filter(seed => finalistKeys.has(seed.key)).length,
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
