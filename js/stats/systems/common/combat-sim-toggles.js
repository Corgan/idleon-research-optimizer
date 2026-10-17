// ===== COMBAT SIM MECHANIC OVERRIDES (common) =====
// Curated catalog of mechanic-level combat-sim inputs that can be disabled, set
// to a specific value, or scaled relative to the saved value, plus helpers that
// turn a persisted toggle state into `buildCombatInputs` overrides.
//
// Toggle state: { [id]: { mode, value } } where mode is
//   'off'   -> the catalog's neutral value (mechanic disabled)
//   'on'    -> flag/tri kinds only (forced on)
//   'set'   -> value replaces the saved input
//   'scale' -> saved input × value (needs the unoverridden inputs for that map)
// Missing ids keep the saved/derived value. Ids prefixed with 'raw:' address any
// other scalar input key directly (Advanced list) and support 'set'/'scale'.

import { buildCombatInputs } from './combat-sim-inputs.js';
import { RANDOlist } from '../../data/game/customlists.js';

// Inputs the simulator does not read (summary-only or not yet ported), plus the
// charClass/level identity inputs. Overriding them is excluded from the Advanced list.
export const INERT_INPUT_KEYS = new Set([
  'printerSampleSize', 'talent468_2', 'marbleDropChance', 'maxCapacity', 'royalMapLen',
  'obolInvOrder', 'obolInvOwn', 'tenteyeclePct',
  'dungeonCreditBonus1', 'dungeonCreditBonus2', 'holes11Kills', 'rawSkillLevels', 'damageMin', 'weaponName',
  'sigil5', 'card51', 'selfHeal',
  'talentEnh', 'talent229_1', 'talent229_2', 'charClass', 'level',
]);

export const TOGGLE_GROUPS = ['Drops', 'Kills', 'EXP', 'Crystals', 'Giants', 'Royal', 'Zenith', 'Forms', 'Monsters', 'Player', 'Loot'];

// kind: mult (×, neutral 1) | pct (%, neutral 0) | chance (0-1 probability) |
//       count | value (no neutral) | flag (on/off) | tri (derive/on/off) | objscale (object of numbers)
// neutral: value used by 'off' (null = no Off mode).
function T(id, group, kind, label, desc, extra = {}) {
  const neutral = extra.neutral !== undefined ? extra.neutral
    : kind === 'mult' ? 1 : (kind === 'pct' || kind === 'chance' || kind === 'count') ? 0 : null;
  return Object.freeze({ id, group, kind, label, desc, keys: extra.keys || [id], neutral, ...extra, neutral });
}

export const COMBAT_TOGGLES = Object.freeze([
  // Drops
  T('dropRate', 'Drops', 'mult', 'Drop rate', 'Total Drop Rarity multiplier applied to every drop-table roll.'),
  T('monsterCash', 'Drops', 'mult', 'Coin multiplier', 'Monster coin multiplier (MonsterCash). Each coin drop is base × (random + 0.5) × this.'),
  T('cardChanceMulti', 'Drops', 'mult', 'Card drop chance multiplier', 'Multiplier on every card drop chance.'),
  T('talent29', 'Drops', 'pct', 'Rares Everywhere! bonus', 'Talent bonus that boosts rare drop-table rows.'),
  T('bribe1', 'Drops', 'pct', 'Tracking Chips bribe', 'Bribe bonus used by card drop rolls.'),
  T('bribe8', 'Drops', 'pct', 'Tagged Indicators bribe', 'Bribe bonus used by card drop rolls.'),
  T('ringDrop', 'Drops', 'pct', 'Star sign ring drop bonus', 'Star sign bonus to ring drops.'),
  T('doubleItemDropz0', 'Drops', 'pct', 'Arcanist double drop (type 0)', 'Arcanist DoubleItemDropz chance for the first item family.'),
  T('doubleItemDropz1', 'Drops', 'pct', 'Arcanist double drop (type 1)', 'Arcanist DoubleItemDropz chance for the second item family.'),
  T('legend2', 'Drops', 'pct', 'Legend statue/golden food doubling', 'Legend talent bonus that can double statue and golden food drops.'),
  T('shopUpg48', 'Drops', 'pct', 'Spelunk shop statue doubling', 'Spelunking shop bonus that can double statue drops.'),
  T('talent318_1', 'Drops', 'pct', 'Pirate Flag bonus', 'Pirate Flag talent drop bonus (first value).'),
  T('talent318_2', 'Drops', 'pct', 'Pirate Flag secondary', 'Pirate Flag talent secondary value.'),
  T('talent594_1', 'Drops', 'pct', 'Primo Prisma (Prisma bubble drops)', 'Chance bonus for Prisma bubble drops.'),
  T('compass3', 'Drops', 'flag', 'Medallions already found', 'Medallion types already found. On marks every medallion found, so none drop; Off clears the list, so every eligible medallion can drop.', {
    on: { compass3: (RANDOlist[112] || []).slice() }, off: { compass3: [] },
  }),

  // Kills
  T('killPerKill', 'Kills', 'mult', 'Kills credited per kill', 'Overrides the live KillPerKill credit (multikill, chain, overkill). Off = 1 credit per kill.'),
  T('multikillTotal', 'Kills', 'pct', 'Multikill total %', 'Overrides the live MultiKillTOTAL used while overkill is active.'),
  T('overkillActive', 'Kills', 'flag', 'Overkill active', 'Forces overkill on or off instead of comparing max damage against the AFK target.'),
  T('overkillExponent', 'Kills', 'value', 'Overkill exponent', 'Damage-to-HP ratio per overkill tier (2 normally, 5 on World 7 maps).'),
  T('multiKillPlay', 'Kills', 'pct', 'Multikill vial bonus', 'Alchemy vial bonus added to every kill credit (÷ 100).'),
  T('vault43', 'Kills', 'pct', 'Active Murdering (kill credit)', 'Vault upgrade bonus to active kill credit.'),
  T('xtraMushKillz', 'Kills', 'mult', 'Extra cave kills', 'Cavern kill-counter multiplier for cave monsters.'),

  // EXP
  T('expMulti', 'EXP', 'mult', 'EXP multiplier', 'Monster EXP multiplier (ExpMulti).'),
  T('fam40', 'EXP', 'pct', 'Family EXP bonus', 'Family bonus to monster EXP.'),
  T('card20', 'EXP', 'pct', 'Card EXP bonus', 'Card bonus to monster EXP.'),
  T('vault39', 'EXP', 'pct', 'Active Learning', 'Vault upgrade bonus to active monster EXP.'),
  T('expActive', 'EXP', 'pct', 'Star sign active EXP', 'Star sign bonus to active EXP.'),
  T('shrine6', 'EXP', 'pct', 'Crescent Shrine', 'Shrine EXP bonus (map-gated).'),

  // Crystals
  T('crystalEmbiggener', 'Crystals', 'mult', 'Crystal mob drop & EXP multiplier', 'Crystal Embiggener: max(1, Crystal Spawn ÷ cap). Multiplies crystal-mob drops, orb credit, and crystal EXP. Off = 1×.'),
  T('crystalSpawnRaw', 'Crystals', 'chance', 'Crystal spawn chance', 'Uncapped crystal spawn chance per kill, before the cap. The Embiggener is a separate input.'),
  T('crystalSpawnCap', 'Crystals', 'chance', 'Crystal spawn chance cap', 'Cap on the per-kill crystal spawn chance (0.1 in the source).', { neutral: null }),
  T('chipCrys', 'Crystals', 'pct', 'Crystal respawn chip', 'Lab chip chance for a killed crystal to respawn.'),
  T('talent41_2', 'Crystals', 'pct', 'Crystal Countdown', 'Talent value gating extra crystal behavior on crystal kills.'),

  // Giants
  T('giantMob', 'Giants', 'chance', 'Giant mob spawn chance', 'Chance per kill for a giant mob to spawn.'),
  T('giantsActive', 'Giants', 'pct', 'Giant spawn bubble', 'Alchemy bubble bonus to giant spawns.'),
  T('prayer18', 'Giants', 'pct', 'Glitterbug (giant → crystals)', 'Prayer that converts giant kills into crystal spawns.'),

  // Royal
  T('marbleDrop', 'Royal', 'chance', 'Marble drop chance', 'Royal marble drop chance before the active streak factor.'),
  T('parchmentDrop', 'Royal', 'chance', 'Parchment drop chance', 'Royal parchment drop chance per kill.'),
  T('parchmentDouble', 'Royal', 'pct', 'Parchment double chance', 'Chance for a parchment drop to double.'),
  T('royalActiveKillClear', 'Royal', 'value', 'Active kill outpost clearing', 'Royal outpost clearing from active kills (0 = locked).', { neutral: 0 }),
  T('riChance', 'Royal', 'chance', 'Regal Intervention chance', 'Chance per kill to trigger Regal Intervention.'),
  T('riMobs', 'Royal', 'count', 'Regal Intervention mobs', 'Extra mobs spawned by Regal Intervention.'),
  T('grid191', 'Royal', 'count', 'L3 Royal Rewards (orb counter)', 'Research grid bonus added to the orb kill counter per kill.'),
  T('gi77', 'Royal', 'count', 'Starting orb kill count', 'Orb kill counter at the start of the run.'),

  // Zenith
  T('zenithMarket3', 'Zenith', 'pct', 'Zenith extra cluster drops', 'Zenith Market bonus to Zenith cluster drops.'),
  T('zenithAutoExpChance', 'Zenith', 'pct', 'Zenith statue EXP chance', 'Chance, each time a Zenith Cluster forms, to add the whole statue stack as Statue EXP. The game always uses 69% because of a code bug, so EMULSION levels have no effect.'),

  // Forms
  T('wraith', 'Forms', 'tri', 'Grimoire Wraith form', 'Death Bringer Wraith form. On starts the run already in form (cast before entering the map), so its stats and drops apply; Off removes a saved form buff; Auto uses the save.'),
  T('tempest', 'Forms', 'tri', 'Compass Tempest form', 'Wind Walker Tempest form. On starts the run already in form (cast before entering the map), so its stats and drops apply; Off removes a saved form buff; Auto uses the save.'),
  T('arcanist', 'Forms', 'tri', 'Tesseract Arcanist form', 'Arcane Cultist Arcanist form. On starts the run already in form (cast before entering the map), so its stats and drops apply; Off removes a saved form buff; Auto uses the save.'),

  // Monsters
  T('monsterHpRescale', 'Monsters', 'mult', 'Monster HP scale', 'Multiplier on monster HP after all reductions.'),
  T('respawnBonusPct', 'Monsters', 'objscale', 'Respawn rate bonus', 'Per-monster respawn bonus %. Off removes every bonus; Scale multiplies each.', { neutral: 0 }),

  // Player
  T('damageMax', 'Player', 'mult', 'Max damage', 'Player max damage per hit.', { neutral: null }),
  T('critChance', 'Player', 'pct', 'Crit chance %', 'Player critical hit chance (percent; over 100 enables multi-crits).'),
  T('critDamage', 'Player', 'mult', 'Crit damage multiplier', 'Critical hit damage multiplier.'),
  T('hitChancePct', 'Player', 'pct', 'Hit chance %', 'Chance for a player hit to land.', { neutral: null }),
  T('accuracy', 'Player', 'value', 'Accuracy', 'Total accuracy (also gates overkill).'),
  T('attackSpeedPct', 'Player', 'pct', 'Attack speed %', 'Attack speed pool used by the auto-attack wait time.'),
  T('atkCooldownDec', 'Player', 'mult', 'Skill cooldown divisor', 'Attack cooldown reduction divisor.'),
  T('playerSpeed', 'Player', 'value', 'Movement speed', 'Player movement speed (pixels per frame).'),
  T('playerMaxHp', 'Player', 'value', 'Max HP', 'Player max HP.'),
  T('playerMaxMp', 'Player', 'value', 'Max MP', 'Player max MP.'),
  T('playerDefence', 'Player', 'value', 'Defence', 'Player total defence.'),
  T('bossMulti', 'Player', 'mult', 'Boss damage multiplier', 'Damage multiplier against bosses.'),
  T('autoRespawnSec', 'Player', 'value', 'Auto-respawn time (s)', 'Seconds before the player respawns after dying.'),
  T('talent627_1', 'Player', 'pct', 'Kill heal %', 'Percent of max HP healed per kill.'),
  T('arcane20', 'Player', 'flag', 'Wand hits Arcane-shielded mobs', 'Tesseract upgrade that lets wand attacks hit monsters with an Arcane status shield.'),

  // Loot
  T('autoLoot', 'Loot', 'flag', 'Auto loot', 'Auto-loot bundle pickup. Off leaves drops on the ground for the player to collect. Inventory slots still come from the saved bundle.', {
    keys: ['bunI', 'ola83'], on: { bunI: 1, ola83: 0 }, off: { ola83: 1 },
  }),
  T('inventorySlotsOwned', 'Loot', 'count', 'Inventory slots', 'Inventory slots owned (bag-full behavior).', { neutral: null }),
]);

export const COMBAT_TOGGLE_BY_ID = Object.freeze(Object.fromEntries(COMBAT_TOGGLES.map(t => [t.id, t])));
const CATALOG_KEYS = new Set(COMBAT_TOGGLES.flatMap(t => t.keys));

const MODES = new Set(['off', 'on', 'set', 'scale']);

/** Modes a catalog entry supports, in display order (excluding 'saved'). */
export function toggleModes(t) {
  if (!t) return ['set', 'scale'];
  if (t.kind === 'flag' || t.kind === 'tri') return ['on', 'off'];
  if (t.kind === 'objscale') return ['off', 'scale'];
  const out = [];
  if (t.neutral !== null) out.push('off');
  out.push('set', 'scale');
  return out;
}

function _num(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }

/** Drops unknown ids, invalid modes, and non-numeric set/scale values. */
export function normalizeToggleState(state) {
  const out = {};
  if (!state || typeof state !== 'object') return out;
  for (const [id, row] of Object.entries(state)) {
    if (!row || !MODES.has(row.mode)) continue;
    const isRaw = id.startsWith('raw:');
    const t = COMBAT_TOGGLE_BY_ID[id];
    if (!t && !(isRaw && id.length > 4)) continue;
    if (!toggleModes(t).includes(row.mode)) continue;
    if (row.mode === 'set' || row.mode === 'scale') {
      const n = _num(row.value);
      if (n === null) continue;
      out[id] = { mode: row.mode, value: n };
    } else out[id] = { mode: row.mode };
  }
  return out;
}

export function activeToggleCount(state) { return Object.keys(normalizeToggleState(state)).length; }

export function toggleNeedsBase(state) {
  return Object.values(normalizeToggleState(state)).some(r => r.mode === 'scale');
}

function _scaleObj(obj, f) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) out[k] = typeof v === 'number' ? v * f : v;
  return out;
}

/**
 * Converts toggle state into input overrides. `entries` are the unoverridden
 * `buildCombatInputs(...).entries` for the same character/map; scale modes are
 * skipped when they are missing.
 */
export function buildToggleOverrides(state, entries) {
  const s = normalizeToggleState(state);
  const ov = {};
  for (const [id, row] of Object.entries(s)) {
    const t = COMBAT_TOGGLE_BY_ID[id];
    const key = t ? t.keys[0] : id.slice(4);
    const base = entries?.[key]?.value;
    if (t && t.kind === 'flag') {
      if (t.on || t.off) Object.assign(ov, row.mode === 'on' ? t.on : t.off);
      else ov[key] = row.mode === 'on' ? 1 : 0;
    } else if (t && t.kind === 'tri') {
      ov[key] = row.mode === 'on' ? 1 : 0;
    } else if (t && t.kind === 'objscale') {
      if (row.mode === 'off') ov[key] = _scaleObj(base || {}, 0);
      else if (base && typeof base === 'object') ov[key] = _scaleObj(base, row.value);
    } else if (row.mode === 'off') {
      ov[key] = t.neutral;
    } else if (row.mode === 'set') {
      ov[key] = row.value;
    } else if (row.mode === 'scale') {
      if (typeof base === 'number' && Number.isFinite(base)) ov[key] = base * row.value;
    }
  }
  return ov;
}

/**
 * Resolves the final overrides for one run: toggle overrides (with scale modes
 * resolved against that map's saved inputs) plus `baseOverrides`, which win.
 */
export function resolveToggleOverrides({ saveData, charIdx, mapIdx, rawSave, toggles, baseOverrides }) {
  const s = normalizeToggleState(toggles);
  if (!Object.keys(s).length) return baseOverrides && Object.keys(baseOverrides).length ? { ...baseOverrides } : undefined;
  let entries = null;
  const needsBase = Object.entries(s).some(([id, r]) => r.mode === 'scale' || (COMBAT_TOGGLE_BY_ID[id]?.kind === 'objscale'));
  if (needsBase) entries = buildCombatInputs(saveData, charIdx, mapIdx, { rawSave, overrides: baseOverrides || {} }).entries;
  return { ...buildToggleOverrides(s, entries), ...(baseOverrides || {}) };
}

/** Short human-readable descriptions of the active toggles. */
export function describeToggleState(state, fmt = (v) => String(v), rawName = (key) => key) {
  const s = normalizeToggleState(state);
  const out = [];
  for (const [id, row] of Object.entries(s)) {
    const t = COMBAT_TOGGLE_BY_ID[id];
    const name = t ? t.label : rawName(id.slice(4));
    let what;
    if (row.mode === 'off') what = 'off';
    else if (row.mode === 'on') what = 'on';
    else if (row.mode === 'set') what = '= ' + fmt(row.value);
    else what = '× ' + fmt(row.value);
    out.push(name + ' ' + what);
  }
  return out;
}

/**
 * Advanced list: every scalar numeric input the simulator actually consumes and
 * that is not already in the curated catalog.
 */
export function scalarInputKeys(entries) {
  const out = [];
  for (const [key, e] of Object.entries(entries || {})) {
    if (INERT_INPUT_KEYS.has(key) || CATALOG_KEYS.has(key)) continue;
    if (typeof e?.value !== 'number' || !Number.isFinite(e.value)) continue;
    out.push(key);
  }
  return out.sort();
}
