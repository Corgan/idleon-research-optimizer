// ===== UPGRADE STONES (combat-sim setup) =====
// Pure model of the inventory drag handler that applies an upgrade stone
// (`typeGen === 'dStone'`) to an equipment instance. Source:
// `_event_InventoryItem` in src/N.new.formatted.js (~81564-81583).
//
// ItemMap / EMm entries store DELTAS on top of the item definition. A stone:
//  1. is eligible by its `ID` and the target's type (typeGen, with
//     Premiumified -> "aHelmetMTX", "RingsTempest", "BowsTempest" overrides);
//  2. requires round(map.Upgrade_Slots_Left + def.Upgrade_Slots_Left - Trigger) >= 0;
//  3. on success adds every "Stat,amt" entry of its '.'-separated `Effect`
//     (`round(map[stat] + amt)`) and then subtracts `Trigger` slots;
//  4. on failure with `Cooldown == 1` still consumes the slots (unless the
//     Compass 11 roll saves them).
// Random outcomes (Random_Stat, Mystery_Stat) are user-selected `picks`.

import { ITEMS } from '../../data/game/items.js';
import { EquiptypeGens } from '../../data/game/customlists.js';

export const BASE_STATS = ['STR', 'AGI', 'WIS', 'LUK'];
export const STONE_NUMERIC_STATS = ['STR', 'AGI', 'WIS', 'LUK', 'Defence', 'Weapon_Power', 'Reach', 'Speed',
  'UQ1val', 'UQ2val', 'Upgrade_Slots_Left'];

const STAT_LABELS = {
  STR: 'STR', AGI: 'AGI', WIS: 'WIS', LUK: 'LUK', Defence: 'Defence', Weapon_Power: 'Weapon Power',
  Reach: 'Reach', Speed: 'Speed', Power: 'Power', UQ1val: 'UQ1 value', UQ2val: 'UQ2 value',
  Upgrade_Slots_Left: 'Upgrade slots',
};
export function statLabel(stat) { return STAT_LABELS[stat] || String(stat || '').replace(/_/g, ' '); }

export const STONE_TARGET_LABELS = {
  0: 'Weapons', 1: 'Armor (helmet, shirt, pants, shoes, pendant, ring)', 2: 'Tools',
  3: 'Obols', 4: 'Helmets', 5: 'Any armor, weapon, tool or obol', 6: 'Premium (MTX) helmets',
  7: 'Tempest rings', 8: 'Tempest bows',
};

const EFFECT_LABELS = {
  Random_Stat: 'random STR/AGI/WIS/LUK', Main_Stat: 'class main stat', Misc_Bonus: 'misc bonus',
  Mystery_Stat: 'mystery stat', yayaIAmLordeYaya: 'UQ1 value',
};

function _num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function _clean(s) { return String(s == null ? '' : s).replace(/[|_]/g, ' ').replace(/\s+/g, ' ').trim(); }

function _parseEffect(effect) {
  return String(effect || '').split('.').filter(Boolean).map(part => {
    const [stat, amt] = part.split(',');
    return { stat, amount: _num(amt) };
  });
}

export const STONES = Object.entries(ITEMS)
  .filter(([, v]) => v && v.typeGen === 'dStone')
  .map(([key, v]) => ({
    key,
    name: _clean(v.displayName) || key,
    id: _num(v.ID),
    amount: _num(v.Amount),
    trigger: _num(v.Trigger),
    cooldown: _num(v.Cooldown),
    effects: _parseEffect(v.Effect),
    target: STONE_TARGET_LABELS[_num(v.ID)] || ('ID ' + v.ID),
  }));
const _BY_KEY = Object.fromEntries(STONES.map(s => [s.key, s]));

export function stoneByKey(key) { return _BY_KEY[key] || null; }

/** Main_Stat source mapping: class < 7 LUK, < 19 STR, < 31 AGI, otherwise WIS. */
export function mainStatForClass(classId) {
  const c = _num(classId);
  return c < 7 ? 'LUK' : c < 19 ? 'STR' : c < 31 ? 'AGI' : 'WIS';
}

/** Stone target type exactly as the drag handler derives `_DummyText2`. */
export function stoneTargetType(itemKey, emm) {
  const def = ITEMS[itemKey];
  if (!def) return '';
  let t = String(def.typeGen || '');
  if (emm && _num(emm.Premiumified) === 1) t = 'aHelmetMTX';
  const k = String(itemKey);
  if (k.indexOf('RingsTempest') !== -1) t = 'RingsTempest';
  if (k.indexOf('BowsTempest') !== -1) t = 'BowsTempest';
  return t;
}

function _idFits(id, t) {
  switch (id) {
    case 0: return t === 'aWeapon';
    case 5: return (EquiptypeGens[2] || []).indexOf(t) !== -1;
    case 1: return (EquiptypeGens[0] || []).indexOf(t) !== -1;
    case 2: return (EquiptypeGens[1] || []).indexOf(t) !== -1;
    case 3: return t.indexOf('aObol') !== -1;
    case 4: return t === 'aHelmet';
    case 6: return t.indexOf('MTX') !== -1;
    case 7: return t.indexOf('RingsTempest') !== -1;
    case 8: return t.indexOf('BowsTempest') !== -1;
    default: return false;
  }
}

/** Type eligibility only (ignores remaining upgrade slots). */
export function stoneEligible(itemKey, emm, stoneKey) {
  const s = stoneByKey(stoneKey);
  if (!s) return { ok: false, reason: 'Unknown stone ' + stoneKey };
  if (!ITEMS[itemKey] || itemKey === 'Blank') return { ok: false, reason: 'No item in this slot' };
  const t = stoneTargetType(itemKey, emm);
  if (!_idFits(s.id, t)) return { ok: false, reason: s.name + ' only fits ' + s.target };
  return { ok: true, reason: '' };
}

export function stoneOptionsForItem(itemKey, emm) {
  return STONES.filter(s => stoneEligible(itemKey, emm, s.key).ok);
}

/** Total upgrade slots left on an instance (definition + EMm delta). */
export function slotsLeft(itemKey, emm) {
  const def = ITEMS[itemKey];
  return Math.round(_num(def && def.Upgrade_Slots_Left) + _num(emm && emm.Upgrade_Slots_Left));
}

/**
 * Describe each effect entry of a stone for an item: which stats it can land
 * on, the deterministic/default choice, and the legal amount range.
 * `map` is the running instance delta (needed by Misc/Mystery rules).
 */
export function stoneEffectChoices(stoneKey, ctx) {
  const s = stoneByKey(stoneKey);
  if (!s) return [];
  const o = ctx || {};
  const def = ITEMS[o.itemKey] || {};
  const map = o.map || o.emm || {};
  const main = mainStatForClass(o.classId);
  return s.effects.map(e => {
    const base = { raw: e.stat, label: EFFECT_LABELS[e.stat] || statLabel(e.stat), amount: e.amount };
    if (e.stat === 'Random_Stat') {
      return Object.assign(base, { random: true, stats: BASE_STATS.slice(), defaultStat: main, min: e.amount, max: e.amount });
    }
    // The applying character's class picks the stat; it may differ from the wearer, so any base stat is legal.
    if (e.stat === 'Main_Stat') return Object.assign(base, { stats: BASE_STATS.slice(), defaultStat: main, min: e.amount, max: e.amount });
    if (e.stat === 'yayaIAmLordeYaya') return Object.assign(base, { stats: ['UQ1val'], defaultStat: 'UQ1val', min: e.amount, max: e.amount });
    if (e.stat === 'Misc_Bonus') {
      const st = _num(def.UQ1val) !== 0 ? 'UQ1val' : 'Defence';
      return Object.assign(base, { stats: [st], defaultStat: st, min: e.amount, max: e.amount });
    }
    if (e.stat === 'Mystery_Stat') {
      const stats = ['Weapon_Power', 'STR', 'AGI', 'WIS', 'LUK'];
      if (_num(map.UQ1val) !== 0) stats.push('UQ1val');
      else if (_num(map.UQ2val) !== 0) stats.push('UQ2val');
      stats.push('Defence');
      return Object.assign(base, { random: true, mystery: true, stats, defaultStat: 'Weapon_Power', min: -e.amount, max: e.amount });
    }
    return Object.assign(base, { stats: [e.stat], defaultStat: e.stat, min: e.amount, max: e.amount });
  });
}

function _pick(picks, i) {
  if (!picks) return null;
  const p = Array.isArray(picks) ? picks[i] : picks[i];
  if (p == null || p === '') return null;
  return typeof p === 'object' ? p : { stat: String(p) };
}

/**
 * Resolve the concrete stat deltas a successful stone application adds to
 * `map` (which is mutated by callers only through the returned list).
 */
export function resolveStoneEffects(stoneKey, ctx) {
  const o = ctx || {};
  const def = ITEMS[o.itemKey] || {};
  const map = Object.assign({}, o.map || o.emm || {});
  const choices = stoneEffectChoices(stoneKey, Object.assign({}, o, { map }));
  const out = [];
  choices.forEach((c, i) => {
    const pk = _pick(o.picks, i);
    let stat = c.defaultStat;
    if (pk && pk.stat && c.stats.indexOf(pk.stat) !== -1) stat = pk.stat;
    let amount = c.amount;
    if (c.mystery) {
      const mag = (stat === 'UQ1val' || stat === 'UQ2val') ? 1 : c.amount;
      amount = pk && pk.amount != null && Number.isFinite(Number(pk.amount)) ? Math.round(Number(pk.amount)) : mag;
      amount = Math.max(-mag, Math.min(mag, amount));
      amount = Math.max(amount, -1 * (_num(def[stat]) + _num(map[stat])));
      if (amount === 0) amount = 1;
    }
    out.push({ stat, amount, raw: c.raw });
    map[stat] = Math.round(_num(map[stat]) + amount);
  });
  return out;
}

/**
 * Apply an ordered stone list to an item instance.
 * @param itemKey item definition key
 * @param extra   manual/unattributed EMm delta object (may contain text fields
 *                and Premiumified); applied before the stones
 * @param stones  [{ key, picks?, failed? }]
 * @returns { stats, stoneDelta, applied, rejected, slotsUsed, slotsLeft, slotsTotal }
 */
export function applyStones(itemKey, extra, stones, opts) {
  const o = opts || {};
  const def = ITEMS[itemKey] || {};
  const map = Object.assign({}, extra || {});
  for (const k of STONE_NUMERIC_STATS) map[k] = _num(map[k]);
  const stoneDelta = {};
  const applied = [], rejected = [];
  let slotsUsed = 0;
  (Array.isArray(stones) ? stones : []).forEach((entry, index) => {
    const key = entry && (entry.key || entry);
    const s = stoneByKey(key);
    const elig = stoneEligible(itemKey, map, key);
    if (!s || !elig.ok) { rejected.push({ index, key, reason: elig.reason }); return; }
    if (Math.round(_num(map.Upgrade_Slots_Left) + _num(def.Upgrade_Slots_Left) - s.trigger) < 0) {
      rejected.push({ index, key, reason: 'No upgrade slots left for ' + s.name });
      return;
    }
    if (entry && entry.failed) {
      if (s.cooldown === 1) {
        map.Upgrade_Slots_Left = Math.round(map.Upgrade_Slots_Left - s.trigger);
        stoneDelta.Upgrade_Slots_Left = (stoneDelta.Upgrade_Slots_Left || 0) - s.trigger;
        slotsUsed += s.trigger;
      }
      applied.push({ index, key, name: s.name, failed: true, effects: [], slotCost: s.cooldown === 1 ? s.trigger : 0 });
      return;
    }
    const effects = resolveStoneEffects(key, { itemKey, classId: o.classId, picks: entry && entry.picks, map });
    for (const e of effects) {
      map[e.stat] = Math.round(_num(map[e.stat]) + e.amount);
      stoneDelta[e.stat] = (stoneDelta[e.stat] || 0) + e.amount;
    }
    map.Upgrade_Slots_Left = Math.round(map.Upgrade_Slots_Left - s.trigger);
    stoneDelta.Upgrade_Slots_Left = (stoneDelta.Upgrade_Slots_Left || 0) - s.trigger;
    slotsUsed += s.trigger;
    applied.push({ index, key, name: s.name, failed: false, effects, slotCost: s.trigger });
  });
  return {
    stats: map,
    stoneDelta,
    applied,
    rejected,
    slotsUsed,
    slotsLeft: Math.round(_num(def.Upgrade_Slots_Left) + map.Upgrade_Slots_Left),
    slotsTotal: _num(def.Upgrade_Slots_Left),
  };
}

/**
 * Remove a stone's resolved delta from an unattributed EMm delta so the total
 * stays unchanged when the user attributes existing save stats to a stone.
 */
export function attributeStone(extra, itemKey, stone, opts) {
  const before = applyStones(itemKey, extra, [], opts).stats;
  const res = applyStones(itemKey, before, [stone], opts);
  const next = Object.assign({}, extra || {});
  if (!res.applied.length) return { extra: next, ok: false, reason: res.rejected[0] ? res.rejected[0].reason : 'Not applied' };
  for (const [k, v] of Object.entries(res.stoneDelta)) next[k] = Math.round(_num(next[k]) - v);
  return { extra: next, ok: true, reason: '' };
}

/** Format an item UQ like the in-game tooltip: "%_CRIT_DAMAGE", 5 -> "+5% CRIT DAMAGE". */
export function formatUq(txt, val) {
  const t = String(txt == null ? '' : txt);
  if (!t || t === '0' || t === 'Blank') return '';
  const v = _num(val);
  const pct = t.charAt(0) === '%';
  const body = t.replace(/^[%{}$]+/, '').replace(/[{}$]/g, '').replace(/_/g, ' ').trim();
  const sign = v < 0 ? '-' : '+';
  return sign + Math.abs(v) + (pct ? '% ' : ' ') + body;
}

/** Effective UQ text for an instance, following equipment.js: definition text wins. */
export function instanceUq(itemKey, emm, n) {
  const def = ITEMS[itemKey] || {};
  const dt = def['UQ' + n + 'txt'];
  const st = emm && emm['UQ' + n + 'txt'];
  const txt = (dt && dt !== '0' && dt !== 'Blank') ? dt : (st && st !== '0' && st !== 0 ? st : '');
  return { txt, val: _num(def['UQ' + n + 'val']) + _num(emm && emm['UQ' + n + 'val']), base: _num(def['UQ' + n + 'val']), added: _num(emm && emm['UQ' + n + 'val']) };
}
