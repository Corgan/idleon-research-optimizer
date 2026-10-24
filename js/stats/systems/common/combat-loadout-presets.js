// ===== BUILT-IN LOADOUT PRESETS (COMMON) =====
import { ITEMS } from '../../data/game/items.js';
import { CardStuff, CardSets, ObolXYcoords } from '../../data/game/customlists.js';
import { COMBAT_LOADOUT_PRESETS, COMBAT_LOADOUT_PRESET_SOURCE } from '../../data/common/combat-loadout-presets.js';
import * as CS from './combat-sim-setup.js';
import { cardSlotCount, prayerSlotCount } from './combat-sim-setup-search.js';

export { COMBAT_LOADOUT_PRESETS, COMBAT_LOADOUT_PRESET_SOURCE };
export const COMBAT_PRESET_SYSTEMS = ['equipment', 'food', 'cards', 'chips', 'prayers', 'obols'];

const OBOL_TYPES = ['aObolCircle', 'aObolSquare', 'aObolHexagon', 'aObolSparkle'];
const TOOL_TYPES = ['aPick', 'aHatchet', 'aFishingRod', 'aBugNet', 'aTrap', 'aSkull', 'aDNAgun'];
const CARD_KEYS = new Map(CardStuff.flat().filter(r => r && r[1]).map(r => ['Cards' + r[1], r[0]]));

export function combatPresetChoices(id) {
  const preset = COMBAT_LOADOUT_PRESETS.find(p => p.id === id);
  if (!preset) throw new Error('Unknown built-in loadout preset: ' + id);
  return {
    preset,
    trophies: preset.trophies.slice(),
    obols: OBOL_TYPES.map(type => preset.obols.filter(key => ITEMS[key].typeGen === type)),
    cards: preset.cards.map(item => ({ item, key: CARD_KEYS.get(item) })),
  };
}

function _classGroup(id) {
  return id < 6 ? 'BEGINNER' : id < 18 ? 'WARRIOR' : id < 30 ? 'ARCHER' : id < 42 ? 'MAGE' : '';
}

/** Build editor patches only; imported saves, levels, unlocks and inventory are never modified. */
export function buildCombatLoadoutPreset(raw, ci, id, options = {}) {
  if (!CS.saveRoot(raw) || !Number.isInteger(ci) || ci < 0 || ci >= CS.characterCount(raw))
    throw new Error('Load a save and select a valid character before applying a preset');
  const choices = combatPresetChoices(id), preset = choices.preset;
  const systems = new Set(options.systems || COMBAT_PRESET_SYSTEMS);
  for (const system of systems) if (!COMBAT_PRESET_SYSTEMS.includes(system)) throw new Error('Unknown preset category: ' + system);
  let setup = CS.normalizeCombatSetup({ ...options.startSetup, charIdx: ci });
  const working = CS.applyCombatSetup(raw, setup);
  const character = CS.readCharacter(working, ci);
  const equipment = CS.readEquipment(working, ci);
  const obols = CS.readObols(working, ci);
  const patches = [], warnings = new Map();
  const warn = (group, text) => {
    if (!warnings.has(group)) warnings.set(group, new Set());
    warnings.get(group).add(text);
  };
  const pool = [
    ...equipment.armor.map(r => ({ ...r, key: r.item, source: 'current', row: 0 })),
    ...equipment.tools.map(r => ({ ...r, key: r.item, source: 'current', row: 1 })),
    ...CS.ownedItemInstances(working, ci),
  ];
  const trophy = options.trophy || choices.trophies[0];
  if (trophy && !choices.trophies.includes(trophy)) throw new Error('Trophy is not a choice in this preset');
  for (const r of pool) {
    if (r.source !== 'current') continue;
    const target = r.row === 0 ? (r.slot === 10 ? trophy : preset.armor[r.slot])
      : preset.tools.find(key => ITEMS[key].typeGen === TOOL_TYPES[r.slot]);
    const cls = ITEMS[target]?.Class;
    r.reserved = !target || target === r.key || (cls && cls !== 'ALL' && cls !== _classGroup(character.classId));
  }
  const savedEquipment = CS.readEquipment(raw, ci);
  const savedCounts = new Map();
  for (const r of [...savedEquipment.armor, ...savedEquipment.tools, ...CS.ownedItemInstances(raw, ci)]) {
    const key = r.key || r.item;
    savedCounts.set(key, (savedCounts.get(key) || 0) + 1);
  }
  const requested = new Map();
  const used = new Set();
  function copy(key, candidates, preferred) {
    const item = candidates.find(r => r.key === key && !used.has(r) && preferred(r))
      || candidates.find(r => r.key === key && !used.has(r) && !r.reserved);
    if (item) used.add(item);
    return item;
  }
  function gear(row, slot, key) {
    const def = ITEMS[key];
    if (key !== 'Blank' && !def) throw new Error('Unknown preset equipment: ' + key);
    if (def && def.Class && def.Class !== 'ALL' && def.Class !== _classGroup(character.classId)
      && !(def.Class === 'JOURNEYMAN' && _classGroup(character.classId) === 'BEGINNER')) {
      warn('Class-incompatible gear kept unchanged', CS.itemName(key) + ' requires ' + CS.cleanName(def.Class).toLowerCase());
      return;
    }
    const current = (row === 0 ? equipment.armor : equipment.tools)[slot];
    requested.set(key, (requested.get(key) || 0) + 1);
    if (key !== 'Blank' && requested.get(key) > (savedCounts.get(key) || 0))
      warn('Hypothetical equipment copies', CS.itemName(key) + ' (uses base stats unless a working copy supplies rolls)');
    const instance = copy(key, pool, r => r.source === 'current' && r.row === row && r.slot === slot);
    if (def && Number(def.lvReqToEquip) > character.level)
      warn('Equipment above this character\'s level', CS.itemName(key) + ' (Lv ' + def.lvReqToEquip + ')');
    if (current && current.item === key) return;
    patches.push({ system: 'equipment', row, slot, item: key, stats: instance ? instance.stats : null });
  }
  if (systems.has('equipment')) {
    preset.armor.forEach((key, slot) => { if (slot !== 10) gear(0, slot, key); });
    for (const key of preset.tools) {
      const slot = TOOL_TYPES.indexOf(ITEMS[key]?.typeGen);
      if (slot < 0) throw new Error('Unknown preset tool: ' + key);
      gear(1, slot, key);
    }
    if (trophy) gear(0, 10, trophy);
  }
  if (systems.has('food')) {
    const foodQuantities = new Map(), savedFoodQuantities = new Map();
    function foodStacks(order, qty, counts) {
      const quantities = CS.rowValues(qty);
      CS.rowValues(order).forEach((key, slot) => {
        const q = Number(quantities[slot]) || 0;
        if (q > (counts.get(key) || 0)) counts.set(key, q);
      });
    }
    for (const [source, counts] of [[working, foodQuantities], [raw, savedFoodQuantities]]) {
      foodStacks(CS.readRawKey(source, 'ChestOrder'), CS.readRawKey(source, 'ChestQuantity'), counts);
      for (let c = 0; c < CS.characterCount(source); c++)
        foodStacks(CS.readRawKey(source, 'InventoryOrder_' + c), CS.readRawKey(source, 'ItemQTY_' + c), counts);
    }
    const required = preset.food.length;
    if (equipment.foodSlots < required) {
      patches.push({ system: 'foodSlots', value: required });
    }
    if (savedEquipment.foodSlots < required)
      warn('Hypothetical food slots', required + ' required; save has ' + savedEquipment.foodSlots);
    for (let slot = 0; slot < Math.max(equipment.food.length, preset.food.length); slot++) {
      const key = preset.food[slot] || 'Blank';
      const existing = equipment.food.find(r => r.item === key && Number(r.qty) > 0);
      const qty = key === 'Blank' ? 0 : existing ? Number(existing.qty) : foodQuantities.get(key) || 1;
      if (key !== 'Blank' && !savedEquipment.food.some(r => r.item === key && Number(r.qty) > 0) && !savedFoodQuantities.has(key))
        warn('Hypothetical food quantities', CS.itemName(key) + ' uses ' + qty + '; edit the quantity to model your stack');
      patches.push({ system: 'food', slot, item: key, qty });
    }
  }
  if (systems.has('cards')) {
    const n = Math.max(8, CS.readCards(working, ci).equipped.length);
    for (let slot = 0; slot < n; slot++) {
      const source = preset.cards[slot], key = source ? CARD_KEYS.get(source) : 'B';
      if (!key) throw new Error('Unknown preset card: ' + source);
      if (key !== 'B' && CS.cardLevelFromRaw(working, key) === 0)
        warn('Cards with no saved bonus level', CS.cardName(key));
      patches.push({ system: 'card', slot, key });
    }
    if (cardSlotCount(working) < preset.cards.length)
      warn('Hypothetical card slots', preset.cards.length + ' required; save unlocks ' + cardSlotCount(working));
    const set = CardSets.findIndex(r => r[2] === preset.cardSet + '.png');
    if (set < 0) throw new Error('Unknown preset card set: ' + preset.cardSet);
    const value = CS.cardSetValue(working, set);
    if (!value) warn('Card set unavailable', CS.cleanName(CardSets[set][0]).replace(/[{}]/g, '') + ' has no saved levels; set bonus cleared');
    patches.push({ system: 'cardSet', set: value ? set : -1 });
  }
  if (systems.has('chips')) {
    const n = Math.max(7, CS.readLab(working, ci).chips.length);
    for (let slot = 0; slot < n; slot++) patches.push({ system: 'labChip', slot, chip: preset.chips[slot] ?? -1 });
    warn('Chip availability not verified', 'Assignments use the sheet\'s chips; chip ownership and Laboratory slot unlocks are not granted');
  }
  if (systems.has('prayers')) {
    const levels = CS.rowValues(CS.readRawKey(working, 'PrayOwned'));
    for (const id of preset.prayers) if (!(Number(levels[id]) > 0)) warn('Prayers with no saved levels', CS.prayerName(id));
    if (prayerSlotCount(working) < preset.prayers.length)
      warn('Hypothetical prayer slots', preset.prayers.length + ' required; save unlocks ' + prayerSlotCount(working));
    patches.push({ system: 'prayers', ids: preset.prayers.slice() });
  }
  if (systems.has('obols')) {
    const scopes = options.familyObols ? ['personal', 'family'] : ['personal'];
    const obolPool = scopes.flatMap(scope => obols[scope].map(r => ({ ...r, key: r.item, scope })));
    const savedObols = CS.readObols(raw, ci), savedObolCounts = new Map(), requestedObols = new Map();
    for (const scope of scopes) for (const r of savedObols[scope])
      savedObolCounts.set(r.item, (savedObolCounts.get(r.item) || 0) + 1);
    for (const r of obolPool) {
      const shape = Number(ObolXYcoords[r.scope === 'family' ? 1 : 0][r.slot]?.[2]);
      const alternatives = choices.obols[shape] || [];
      r.reserved = !alternatives.length || r.key === (options.obols?.[shape] || alternatives[0]);
    }
    const totalLevel = CS.characterOptions(working).reduce((sum, c) => sum + CS.readCharacter(working, c.ci).level, 0);
    for (const scope of scopes) {
      for (const [slot, row] of ObolXYcoords[scope === 'family' ? 1 : 0].entries()) {
        const shape = Number(row[2]);
        const alternatives = choices.obols[shape];
        if (!alternatives.length) continue;
        const key = options.obols?.[shape] || alternatives[0];
        if (!alternatives.includes(key)) throw new Error('Obol is not a choice for this shape in the preset');
        const instance = copy(key, obolPool, r => r.scope === scope && r.slot === slot);
        const current = obols[scope][slot];
        requestedObols.set(key, (requestedObols.get(key) || 0) + 1);
        if (!instance || requestedObols.get(key) > (savedObolCounts.get(key) || 0))
          warn('Hypothetical obol copies (no matched saved equipped copy)', CS.itemName(key) + ' (base stats unless working edits supply rolls)');
        const level = scope === 'family' ? totalLevel : character.level;
        if (level < Number(row[3])) warn('Hypothetical locked obol slots', scope + ' slot ' + (slot + 1) + ' requires Lv ' + row[3]);
        if (current?.item === key) continue;
        patches.push({ system: 'obol', scope, slot, item: key, stats: instance ? instance.stats : null });
      }
    }
    if (options.familyObols) warn('Account-wide change', 'Family obols affect every character in this loadout');
  }
  const onlyPreset = CS.normalizeCombatSetup({ charIdx: ci, patches });
  const diff = CS.diffCombatSetup(working, onlyPreset);
  for (const patch of patches) setup = CS.upsertPatch(setup, patch);
  setup.label = preset.name;
  const notes = [
    'Static sheet snapshot: ' + COMBAT_LOADOUT_PRESET_SOURCE.captured + '. Alternatives default to the first listed choice, not an optimizer result.',
    'Saved card/prayer levels, talents, attack bars, star signs, account upgrades and overrides are retained. Unspecified tools and trophies are retained.',
    'Matched equipment copies reuse their working/saved rolls once per preset. Inventory is not transferred; unmatched items use base stats, without invented stones or keychain rolls.',
    'Food uses the existing equipped stack or largest saved storage/inventory stack, otherwise 1. Extra equipped food, cards, chips and prayers are cleared.',
  ];
  if (preset.group === 'Sampling') notes.push('Skilling/snapshot presets configure inputs; the active-combat simulator does not simulate skilling or native cache snapshotting.');
  if (preset.id === 'trapping-xp') notes.push('The sheet also calls for Transfusion. Talent levels, buffs and attack bars are not changed by this preset.');
  if (preset.id === 'sample-fishing') notes.push('The sheet\'s separate fish-specific location, bait, line and ring table is not applied by this general Fishing loadout.');
  return {
    preset, setup, diff, notes,
    warnings: [...warnings].map(([group, entries]) => group + ': ' + [...entries].join('; ')).concat(diff.warnings || []),
  };
}
