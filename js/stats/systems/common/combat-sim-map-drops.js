// ===== COMBAT SIM MAP DROP PROFILES =====
// Static "what can drop here" profiles for combat-sim maps, built from the same tables the
// simulator rolls: MonsterDrops rows with nested DropTables (GenerateMonsterDrops, N.js 66420)
// plus the crystal mob that a kill may spawn (kill handler, N.js 67169-67171).
//
// Chances are base per-kill chances at 1x drop rate: nested rows multiply their parent row's
// chance. Runtime table edits (silver pens, etc.) and drop-rate scaling are not applied, so use
// these profiles to answer "can this drop here, and from what", not for rates.
//
// Crystal spawn gates mirrored from the source:
//   map < 350, map not 166 or 306, killed monster not in NonAFKmonsters, not caveD / fm_rat,
//   and not temporary. Character/runtime gates (level > 19, Grimoire Wraith, Compass Tempest,
//   Tesseract Arcanist, buff 45 for classes 4/5, crystal lock) are reported separately.

import { MonsterDrops, DropTables } from '../../data/game/custommaps.js';
import { NonAFKmonsters } from '../../data/game/customlists.js';
import { SCENE_SPAWNS } from '../../data/game/scenes.js';
import { boneType, boneQtyBase, dustType, dustQtyBase, tachyonType, tachyonQtyBase } from './combat-sim-rewards.js';

export const CRYSTAL_BLOCKED_MAPS = [166, 306];
export const CRYSTAL_BLOCKED_MONSTERS = ['caveD', 'fm_rat'];
export const CRYSTAL_RUNTIME_GATES = [
  'Character level above 19',
  'Grimoire Wraith Form not active',
  'Compass Tempest Form not active',
  'Tesseract Arcanist Form not active',
  'Not a Voidwalker/Infinilyte with buff 45 active',
];

const _itemCache = new Map();

/** Every item a monster's drop table can produce, with base chance and nesting path. */
export function monsterDropItems(type) {
  if (_itemCache.has(type)) return _itemCache.get(type);
  const out = new Map();
  const walk = (rows, chance, via, quest, depth) => {
    for (const row of rows || []) {
      const key = String(row[0]);
      const c = chance * (Number(row[1]) || 0);
      const q = row[3] && row[3] !== 'N/A' ? row[3] : quest;
      if (key.indexOf('DropTable') !== -1 && DropTables[key]) {
        if (depth < 3 && via.indexOf(key) < 0) walk(DropTables[key], c, via.concat(key), q, depth + 1);
        continue;
      }
      const prev = out.get(key);
      if (!prev) out.set(key, { key, chance: c, qty: Number(row[2]) || 0, via: [via], quest: q || null });
      else { prev.chance += c; prev.via.push(via); }
    }
  };
  walk(MonsterDrops[type], 1, [], null, 0);
  _itemCache.set(type, out);
  return out;
}

/** Unique monster types placed on a map, with spawn counts. */
export function mapMonsterTypes(mapIdx) {
  const sp = SCENE_SPAWNS[Number(mapIdx)];
  const counts = {};
  for (const m of (sp && sp.mobs) || []) counts[m[0]] = (counts[m[0]] || 0) + 1;
  return Object.keys(counts).map((type) => ({ type, count: counts[type] }));
}

export function crystalTypeForMap(mapIdx) { return 'Crystal' + Math.floor(Number(mapIdx) / 50); }

/** Whether a kill on this map can spawn a crystal mob, ignoring character/runtime gates. */
export function crystalEligibility(mapIdx) {
  const map = Number(mapIdx);
  const type = crystalTypeForMap(map);
  const mobs = mapMonsterTypes(map);
  let reason = '';
  if (!(map < 350)) reason = 'Crystals never spawn on map 350 or later.';
  else if (CRYSTAL_BLOCKED_MAPS.includes(map)) reason = 'Crystals are disabled on this map.';
  else if (!MonsterDrops[type]) reason = 'No crystal monster for this world.';
  const eligibleMobs = mobs.filter((m) => !(NonAFKmonsters || []).includes(m.type) && !CRYSTAL_BLOCKED_MONSTERS.includes(m.type)).map((m) => m.type);
  if (!reason && !eligibleMobs.length) reason = 'No monster here can trigger a crystal.';
  return { eligible: !reason, crystalType: type, reason, eligibleMobs, blockedMobs: mobs.map((m) => m.type).filter((t) => eligibleMobs.indexOf(t) < 0) };
}

// Master Class form drops (AE1 drop branch, src 63689-63705). They come from the killed
// monster's coin value t = MonsterDrops[type][0][2], not from a drop table, so the type and
// base quantity per drop are static per monster. Each qualifying kill rolls 25% for 1-2 drops
// of the base quantity times the form's drop multiplier (runtime, save-dependent). Requires
// the form to be active; GenINFO[100] and the form multipliers are runtime and not applied.
// Novadust (Dust4) is a separate 1e-4 Tempest roll on any kill once Compass upgrade 33 is owned.
export const FORM_DROP_CHANCE = 0.25;
export const FORM_DROPS = [
  { form: 'wraith', label: 'Wraith Form', key: (t) => 'Bone' + boneType(t), qty: boneQtyBase, extraExcl: [], mapExcl: [] },
  { form: 'tempest', label: 'Tempest Form', key: (t) => 'Dust' + dustType(t), qty: dustQtyBase, extraExcl: ['mini', 'baba'], mapExcl: [216] },
  { form: 'arcanist', label: 'Arcanist Form', key: (t) => 'Tach' + tachyonType(t), qty: tachyonQtyBase, extraExcl: ['mini', 'baba'], mapExcl: [216] },
];
const _formCache = new Map();

/** Master Class drops on a map: [{ key, form, label, monster, chance, qty, nova? }]. */
export function mapFormDrops(mapIdx) {
  const map = Number(mapIdx);
  if (_formCache.has(map)) return _formCache.get(map);
  const out = [];
  const mobs = mapMonsterTypes(map);
  for (const { type } of mobs) {
    const md = MonsterDrops[type];
    if (!md || !md[0] || md[0][0] !== 'COIN' || type.indexOf('Crystal') !== -1 || type.indexOf('Chest') !== -1) continue;
    const t = Number(md[0][2]) || 0;
    for (const f of FORM_DROPS) {
      if (f.mapExcl.includes(map) || f.extraExcl.some((s) => type.indexOf(s) !== -1)) continue;
      out.push({ key: f.key(t), form: f.form, label: f.label, monster: type, chance: FORM_DROP_CHANCE, qty: f.qty(t) });
    }
  }
  if (mobs.length) out.push({ key: 'Dust4', form: 'tempest', label: 'Tempest Form', monster: null, chance: 1e-4, qty: 1, nova: true });
  _formCache.set(map, out);
  return out;
}

const _profileCache = new Map();

/**
 * items[key] = { chance (best single-monster base chance), sources: [{ from: 'monster'|'crystal', monster, chance, via }] }
 */
export function mapDropProfile(mapIdx) {
  const map = Number(mapIdx);
  if (_profileCache.has(map)) return _profileCache.get(map);
  const mobs = mapMonsterTypes(map);
  const crystal = crystalEligibility(map);
  const items = {};
  const add = (from, monster) => {
    for (const it of monsterDropItems(monster).values()) {
      if (it.key === 'COIN' || !(it.chance > 0)) continue;
      const e = items[it.key] || (items[it.key] = { key: it.key, chance: 0, monsterChance: 0, sources: [] });
      e.sources.push({ from, monster, chance: it.chance, via: it.via[0], quest: it.quest });
      if (it.chance > e.chance) e.chance = it.chance;
      if (from === 'monster' && it.chance > e.monsterChance) e.monsterChance = it.chance;
    }
  };
  for (const m of mobs) add('monster', m.type);
  if (crystal.eligible) add('crystal', crystal.crystalType);
  for (const d of mapFormDrops(map)) {
    const e = items[d.key] || (items[d.key] = { key: d.key, chance: 0, monsterChance: 0, sources: [] });
    e.sources.push({ from: 'form', form: d.form, monster: d.monster, chance: d.chance, qty: d.qty, nova: !!d.nova, via: [] });
    if (d.chance > e.chance) e.chance = d.chance;
    if (!d.nova && !(e.formQty >= d.qty)) e.formQty = d.qty;
  }
  const profile = { mapIdx: map, mobs, crystal, items };
  _profileCache.set(map, profile);
  return profile;
}

export const DROP_GROUPS = [
  { id: 'statue', label: 'Any statue', test: (k) => /^EquipmentStatues/.test(k) },
  { id: 'card', label: 'Any card', test: (k) => /^Cards/.test(k) },
  { id: 'stamp', label: 'Any stamp', test: (k) => /^Stamp/.test(k) },
  { id: 'talentbook', label: 'Any talent book', test: (k) => /^TalentBook/.test(k) },
  { id: 'recipe', label: 'Any smithing recipe', test: (k) => /^SmithingRecipes/.test(k) },
  { id: 'obol', label: 'Any obol', test: (k) => /^Obol/.test(k) },
  { id: 'mc', label: 'Any Master Class drop', test: (k) => /^(Bone|Dust|Tach)\d$/.test(k) },
  { id: 'bone', label: 'Any bone (Wraith)', test: (k) => /^Bone\d$/.test(k) },
  { id: 'dust', label: 'Any dust (Tempest)', test: (k) => /^Dust\d$/.test(k) },
  { id: 'tachyon', label: 'Any tachyon (Arcanist)', test: (k) => /^Tach\d$/.test(k) },
];

/**
 * Maps (from mapIds) that can drop an item key or group id ('group:statue').
 * opts.source: 'any' | 'monster' | 'crystal' | 'form' (Master Class form drops)
 */
export function mapsThatDrop(mapIds, target, opts = {}) {
  const src = opts.source || 'any';
  const grp = String(target).indexOf('group:') === 0 ? DROP_GROUPS.find((g) => g.id === String(target).slice(6)) : null;
  const test = grp ? grp.test : (k) => k === target;
  const out = [];
  for (const m of mapIds) {
    const p = mapDropProfile(m);
    const hits = [];
    for (const k in p.items) {
      if (!test(k)) continue;
      const srcs = p.items[k].sources.filter((s) => src === 'any' || s.from === src);
      if (srcs.length) hits.push({ key: k, sources: srcs });
    }
    if (hits.length) out.push({ mapIdx: m, hits });
  }
  return out;
}
