// ===== COMBAT SIM SETUP (raw-save patch layer) =====
// Pure, DOM-free editing layer for the active combat simulator. A setup is a
// list of typed patches applied to a deep-cloned raw save; everything the sim
// derives (loadSaveData -> buildCombatInputs) therefore reflects the edits.
//
// Encoding rules mirror js/save/loader.js + parseSaveKey: string values are
// JSON-parsed when possible, objects are used as-is, and Firebase "length
// objects" ({"0":..,"length":n}) stay length objects. Every touched key is
// re-encoded exactly as it arrived (JSON string, plain string, number, object,
// or StarSg-style char-by-char object). Untouched keys keep their original
// references, so applying an empty setup is a structural no-op.

import { ITEMS } from '../../data/game/items.js';
import { entityName } from '../../entity-names.js';
import { CardSets, CardStuff, CompanionDB, ClassNames, SkillNames, GodsInfo,
  ChipDesc, TowerInfo, TalentIconNames, StarSigns, PrayerInfo, MTXinfo, RANDOlist, MapDispName,
  NinjaInfo, SummonUPG, Research as ResearchList } from '../../data/game/customlists.js';
import { WorshipMapType } from '../../data/game/custommaps.js';
import { CARD_BASE_REQ } from '../../data/common/cards.js';
import { PET_NAMES } from '../../data/w4/breeding.js';
import { ARMORY_UPGRADES, ROYAL_STATUES } from '../../data/w7/royal-guardian.js';
import { eventShopOwned } from '../../../game-helpers.js';
import { applyStones, stoneByKey } from './combat-sim-stones.js';
import { normalizeToggleState } from './combat-sim-toggles.js';
import { normalizeTermOverrides } from '../../term-overrides.js';
import { researchShapesOwned, parseResearchShapePositions, applyResearchShapeMoves, researchShapeName,
  RESEARCH_SHAPE_MAX } from '../w7/research-shapes.js';

export const COMBAT_SETUP_VERSION = 1;

// ---------------------------------------------------------------------------
// Static labels
// ---------------------------------------------------------------------------

export const ARMOR_SLOTS = ['Helmet', 'Weapon', 'Shirt', 'Pendant', 'Pants', 'Ring 1', 'Shoes', 'Ring 2',
  'Premium Helmet', 'Keychain 1', 'Trophy', 'Keychain 2', 'Cape', 'Chat Ring', 'Nametag', 'Attire'];
export const TOOL_SLOTS = ['Pickaxe', 'Hatchet', 'Fishing Rod', 'Bug Net', 'Trap Box', 'Worship Skull', 'DNA Splicer', 'Tool 8'];
export const FOOD_SLOT_COUNT = 16;

// Item Type filters per equipment slot (lenient: premium slot accepts both helmet families).
const ARMOR_TYPES = [
  ['HELMET', 'PREMIUM_HELMET'], null, ['SHIRT'], ['PENDANT'], ['PANTS'], ['RING'], ['SHOES'], ['RING'],
  ['PREMIUM_HELMET', 'HELMET'], ['KEYCHAIN'], ['TROPHY', 'REPLICA_TROPHY'], ['KEYCHAIN'], ['CAPE'],
  ['CHAT_RING'], ['NAMETAG', 'REPLICA_NAMETAG'], ['ATTIRE'],
];
const TOOL_TYPEGEN = ['aPick', 'aHatchet', 'aFishingRod', 'aBugNet', 'aTrap', 'aSkull', 'aDNAgun', null];

const EMM_ZERO = { Defence: 0, WIS: 0, STR: 0, UQ2txt: 0, LUK: 0, Weapon_Power: 0, UQ1txt: 0, UQ2val: 0,
  AGI: 0, Reach: 0, UQ1val: 0, Upgrade_Slots_Left: 0, Power: 0, Speed: 0 };
export const EQUIP_STAT_KEYS = ['STR', 'AGI', 'WIS', 'LUK', 'Defence', 'Weapon_Power', 'Reach', 'Speed',
  'Power', 'UQ1txt', 'UQ1val', 'UQ2txt', 'UQ2val', 'Upgrade_Slots_Left'];

const CAULDRON_LETTERS = 'abcd';
export const CAULDRON_NAMES = ['Power (Orange)', 'Quicc (Green)', 'High-IQ (Purple)', 'Kazam (Yellow)'];

// Top-level wrapper keys that live beside `data` in it.json-style saves.
const TOP_LEVEL_KEYS = { companion: true, serverVars: true, charNames: true };

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function _hasOwn(o, k) { return o != null && Object.prototype.hasOwnProperty.call(o, k); }
function _clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
function _isLenObj(c) { return !!c && typeof c === 'object' && !Array.isArray(c) && _hasOwn(c, 'length'); }

export function cleanName(s) { return String(s == null ? '' : s).replace(/[|_]/g, ' ').replace(/\s+/g, ' ').trim(); }

export function itemName(key) {
  if (key == null || key === '' || key === 'Blank' || key === 'Null' || key === 0) return '(empty)';
  const d = ITEMS[key];
  return d ? cleanName(d.displayName) : String(key);
}

export function cardName(key) {
  if (!key || key === 'B' || key === 'Blank') return '(empty)';
  return entityName('Card', key) || String(key);
}

export function talentName(id) {
  const n = entityName('Talent', Number(id));
  return n || ('Talent ' + id);
}

export function starSignName(id) {
  if (id === '_' || id === '' || id == null || id === -1 || id === '-1') return '(empty)';
  return entityName('Star Sign', Number(id)) || ('Star Sign ' + id);
}

export function prayerName(id) {
  if (Number(id) < 0 || id === '' || id == null) return '(empty)';
  return entityName('Prayer', Number(id)) || ('Prayer ' + id);
}

export function chipName(id) {
  if (Number(id) < 0 || id == null || id === '') return '(empty)';
  return entityName('Chip', Number(id)) || ('Chip ' + id);
}

export function bubbleCodeName(code) {
  if (!code || code === 0 || code === '0') return '(empty)';
  const s = String(code);
  const c = CAULDRON_LETTERS.indexOf(s[0]);
  const idx = Number(s.slice(1));
  if (c >= 0 && Number.isFinite(idx)) return entityName('Bubble', [c, idx]) || s;
  return 'Bubble ' + s;
}

export function godName(id) {
  if (Number(id) < 0 || id == null || id === '') return '(none)';
  const g = GodsInfo[Number(id)];
  return g ? cleanName(g[0]) : ('God ' + id);
}

export function companionName(id) {
  return entityName('Companion', Number(id)) || ('Companion ' + id);
}

export function className(id) {
  const n = ClassNames[Number(id)];
  return n && !/^(NOPE|FILLER|\d+)$/.test(n) ? cleanName(n).replace(/\b(\w)(\w*)/g, (m, a, b) => a + b.toLowerCase()) : ('Class ' + id);
}

function _fmtVal(v) {
  if (v === undefined) return '(unset)';
  if (v === null) return 'null';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 1000) / 1000);
  if (typeof v === 'string') return v;
  const s = JSON.stringify(v);
  return s.length > 80 ? s.slice(0, 77) + '...' : s;
}

// ---------------------------------------------------------------------------
// Raw save codec
// ---------------------------------------------------------------------------

/** Returns the object holding save keys (`raw.data` for it.json wrappers, else raw). */
export function saveRoot(raw) {
  return raw && raw.data && typeof raw.data === 'object' && !Array.isArray(raw.data) ? raw.data : raw;
}

function _isCharObject(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const first = v['0'];
  if (first !== '{' && first !== '[') return false;
  const keys = Object.keys(v);
  for (let i = 0; i < keys.length; i++) {
    if (!_hasOwn(v, String(i))) return false;
    if (typeof v[i] !== 'string' || v[i].length > 1) return false;
  }
  return true;
}

/** Decode one stored raw value to `{ value, encoding }` using parseSaveKey semantics. */
export function decodeSaveValue(stored) {
  if (stored === undefined || stored === null) return { value: undefined, encoding: 'missing' };
  if (typeof stored === 'string') {
    try {
      const parsed = JSON.parse(stored);
      if (parsed && typeof parsed === 'object') return { value: parsed, encoding: 'json' };
    } catch (e) { /* plain string */ }
    return { value: stored, encoding: 'string' };
  }
  if (typeof stored === 'object') {
    if (_isCharObject(stored)) {
      const s = Object.keys(stored).sort((a, b) => Number(a) - Number(b)).map(k => stored[k]).join('');
      try { return { value: JSON.parse(s), encoding: 'chars' }; } catch (e) { return { value: stored, encoding: 'object' }; }
    }
    return { value: stored, encoding: 'object' };
  }
  return { value: stored, encoding: 'scalar' };
}

/** Encode a decoded value back to the original raw representation. */
export function encodeSaveValue(value, encoding) {
  if (encoding === 'json') return JSON.stringify(value);
  if (encoding === 'chars') {
    const s = JSON.stringify(value);
    const o = {};
    for (let i = 0; i < s.length; i++) o[i] = s[i];
    return o;
  }
  if (encoding === 'string') return (value && typeof value === 'object') ? JSON.stringify(value) : String(value == null ? '' : value);
  if (encoding === 'scalar') {
    if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
    return value;
  }
  return value; // object / missing
}

/** Read and decode a save key (or a wrapper key such as `companion`/`serverVars`). */
export function readRawKey(raw, key) {
  if (!raw) return undefined;
  const root = saveRoot(raw);
  const src = (root !== raw && TOP_LEVEL_KEYS[key]) ? raw : root;
  return decodeSaveValue(src[key]).value;
}

function _at(c, i) {
  if (c == null || typeof c !== 'object') return undefined;
  if (c[i] !== undefined) return c[i];
  return c[String(i)];
}

function _typed(prev, v) {
  if (typeof prev === 'string' && typeof v === 'number') return String(v);
  if (typeof prev === 'number' && typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return v;
}

function _put(c, i, v, fill) {
  if (c == null || typeof c !== 'object') return;
  const n = Number(i);
  if (Array.isArray(c) && Number.isInteger(n)) {
    while (c.length < n) c.push(fill === undefined ? 0 : fill);
  }
  const prev = _at(c, i);
  c[i] = _typed(prev, v);
  if (_isLenObj(c) && Number.isInteger(n) && n >= Number(c.length)) c.length = n + 1;
}

/** Converts arrays, length objects, and numeric-key objects into a plain array (read only). */
export function rowValues(c) {
  if (Array.isArray(c)) return c;
  if (!c || typeof c !== 'object') return [];
  if (_isLenObj(c)) {
    const out = [];
    for (let i = 0; i < Number(c.length); i++) out.push(c[i]);
    return out;
  }
  const keys = Object.keys(c).filter(k => /^\d+$/.test(k)).map(Number);
  const max = keys.length ? Math.max.apply(null, keys) : -1;
  const out = [];
  for (let i = 0; i <= max; i++) out.push(c[i]);
  return out;
}

function _session(raw) {
  const root = saveRoot(raw);
  const nested = root !== raw;
  const out = { ...raw };
  const outRoot = nested ? { ...root } : out;
  if (nested) out.data = outRoot;
  const cache = new Map();
  function src(key) { return (nested && TOP_LEVEL_KEYS[key]) ? raw : root; }
  const S = {
    raw,
    has(key) { return cache.has(key) || _hasOwn(src(key), key); },
    get(key, init) {
      if (!cache.has(key)) {
        const d = decodeSaveValue(src(key)[key]);
        if (d.value === undefined && init === undefined) return undefined;
        const value = d.value === undefined ? (typeof init === 'function' ? init() : init) : _clone(d.value);
        cache.set(key, { value, encoding: d.encoding });
      }
      return cache.get(key).value;
    },
    set(key, value) {
      const d = cache.get(key) || { encoding: decodeSaveValue(src(key)[key]).encoding };
      d.value = value;
      cache.set(key, d);
    },
    /** Read-only view: the patched value when touched, otherwise the decoded save value (not cloned or re-encoded). */
    peek(key) {
      if (cache.has(key)) return cache.get(key).value;
      return decodeSaveValue(src(key)[key]).value;
    },
    finish() {
      cache.forEach((entry, key) => {
        const target = (nested && TOP_LEVEL_KEYS[key]) ? out : outRoot;
        if (entry.value === undefined) { delete target[key]; return; }
        target[key] = encodeSaveValue(entry.value, entry.encoding);
      });
      return out;
    },
  };
  return S;
}

// ---------------------------------------------------------------------------
// Character helpers
// ---------------------------------------------------------------------------

export function characterCount(raw) {
  const root = saveRoot(raw) || {};
  let n = Array.isArray(raw && raw.charNames) ? raw.charNames.length : 0;
  Object.keys(root).forEach(k => {
    const m = /^(?:Lv0|CharacterClass|EquipOrder|SL)_(\d+)$/.exec(k);
    if (m) n = Math.max(n, Number(m[1]) + 1);
  });
  return n;
}

export function characterName(raw, ci) {
  const n = raw && Array.isArray(raw.charNames) ? raw.charNames[ci] : '';
  return n ? String(n) : ('Character ' + (Number(ci) + 1));
}

export function characterOptions(raw) {
  const out = [];
  for (let ci = 0; ci < characterCount(raw); ci++) {
    out.push({ ci, name: characterName(raw, ci), className: className(readRawKey(raw, 'CharacterClass_' + ci)) });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Item option lists (for pickers)
// ---------------------------------------------------------------------------

let _itemIndex = null;
function _items() {
  if (_itemIndex) return _itemIndex;
  _itemIndex = Object.keys(ITEMS).map(key => {
    const d = ITEMS[key] || {};
    return { key, name: cleanName(d.displayName || key), type: d.Type || '', typeGen: d.typeGen || '' };
  }).filter(r => r.type !== 'ERROR');
  return _itemIndex;
}

/** Picker options for an equipment row/slot: row 0 armor, 1 tools, 2 food, 'obol'. */
export function itemOptionsForSlot(row, slot) {
  const list = _items();
  let filter;
  if (row === 0) {
    const t = ARMOR_TYPES[slot];
    filter = t ? (r => t.indexOf(r.type) >= 0) : (r => r.typeGen === 'aWeapon');
  } else if (row === 1) {
    const g = TOOL_TYPEGEN[slot];
    filter = g ? (r => r.typeGen === g) : (r => /^a(Pick|Hatchet|FishingRod|BugNet|Trap|Skull|DNAgun)$/.test(r.typeGen));
  } else if (row === 2) {
    filter = r => r.typeGen === 'cFood';
  } else if (row === 'obol') {
    filter = r => /^aObol/.test(r.typeGen);
  } else {
    filter = () => true;
  }
  return list.filter(filter).map(r => ({ key: r.key, name: r.name + (row === 'obol' ? ' (' + cleanName(r.type).toLowerCase() + ')' : '') }));
}

export function cardOptions() {
  const out = [];
  for (let s = 0; s < CardStuff.length; s++) {
    const rows = CardStuff[s] || [];
    for (let i = 0; i < rows.length; i++) {
      const key = rows[i] && rows[i][0];
      if (!key || key === 'Blank') continue;
      out.push({ key, name: cardName(key), set: s, bonus: cleanName(String(rows[i][3] || '').replace(/[{}+%]/g, '')) });
    }
  }
  return out;
}

export function cardSetOptions() {
  const out = [];
  for (let i = 0; i < CardSets.length; i++) {
    const row = CardSets[i];
    if (!row || row[0] === '_' || !CardStuff[i]) continue;
    out.push({ set: i, key: row[0], name: cleanName(String(row[0]).replace(/[{}%]/g, '')), mult: Number(row[1]) || 0 });
  }
  return out;
}

export function talentOptions() {
  const out = [];
  for (let i = 0; i < TalentIconNames.length; i++) {
    const n = TalentIconNames[i];
    if (!n || /^(_|Blank|FILLER)$/i.test(n)) continue;
    out.push({ id: i, name: talentName(i) });
  }
  return out;
}

export function bubbleOptions() {
  const out = [];
  for (let c = 0; c < 4; c++) {
    for (let i = 0; i < 40; i++) {
      const n = entityName('Bubble', [c, i]);
      if (!n) continue;
      out.push({ code: CAULDRON_LETTERS[c] + i, name: n + ' (' + CAULDRON_NAMES[c].split(' ')[0] + ')' });
    }
  }
  return out;
}

export function companionOptions() {
  const out = [];
  for (let i = 0; i < CompanionDB.length; i++) out.push({ id: i, name: companionName(i) });
  return out;
}

export function chipOptions() {
  const out = [{ id: -1, name: '(empty)' }];
  for (let i = 0; i < ChipDesc.length; i++) out.push({ id: i, name: chipName(i) });
  return out;
}

export function starSignOptions() {
  const out = [{ id: '_', name: '(empty)' }];
  for (let i = 0; i < StarSigns.length; i++) {
    const n = entityName('Star Sign', i);
    if (n) out.push({ id: i, name: n });
  }
  return out;
}

export function prayerOptions() {
  const out = [{ id: -1, name: '(empty)' }];
  for (let i = 0; i < PrayerInfo.length; i++) {
    const n = entityName('Prayer', i);
    if (n) out.push({ id: i, name: n });
  }
  return out;
}

export function godOptions() {
  const out = [{ id: -1, name: '(none)' }];
  for (let i = 0; i < GodsInfo.length; i++) out.push({ id: i, name: godName(i) });
  return out;
}

// ---------------------------------------------------------------------------
// Card levels and set values (mirror computeCardLv / card-set equip code)
// ---------------------------------------------------------------------------

function _cardLevel(key, cards0, rift, spelunk, ola) {
  // Source CardLv (66029-66030): the OLA[603]/[155] floors apply even when the card is not found.
  const qty = Number(cards0 && cards0[key]) || 0;
  let lv = 0;
  if (qty > 0) {
    lv = 1;
    const maxStars = _cardMaxStars(rift, spelunk);
    for (let s = 0; s < maxStars; s++) {
      if (qty > _cardStarThreshold(key, s)) lv = s + 2;
    }
  }
  const o155 = String((ola && ola[155]) || '').split(',');
  if (o155.indexOf(key) >= 0 && lv < 6) lv = 6;
  const o603 = String((ola && ola[603]) || '').split(',');
  if (o603.indexOf(key) >= 0 && lv < 7) lv = 7;
  return lv;
}

function _cardCtx(get) {
  return { cards0: get('Cards0') || {}, rift: get('Rift') || [], spelunk: get('Spelunk') || [], ola: rowValues(get('OptLacc')) };
}

/** Card level from a raw save (same thresholds as computeCardLv). */
export function cardLevelFromRaw(raw, key) {
  const c = _cardCtx(k => readRawKey(raw, k));
  return _cardLevel(key, c.cards0, c.rift, c.spelunk, c.ola);
}

function _cardSetValueFrom(ctx, setIdx) {
  const rows = CardStuff[setIdx] || [];
  let sum = 0, count = 0;
  for (let i = 0; i < rows.length; i++) {
    const key = rows[i] && rows[i][0];
    if (!key || key === 'Blank') continue;
    sum += _cardLevel(key, ctx.cards0, ctx.rift, ctx.spelunk, ctx.ola);
    count++;
  }
  const avg = Math.floor(sum / Math.max(count, 1));
  return Math.round(avg * (Number(CardSets[setIdx] && CardSets[setIdx][1]) || 0));
}

/** Stored CSetEq value when equipping card set `setIdx` (floor average set level × set multiplier). */
export function cardSetValue(raw, setIdx) {
  return _cardSetValueFrom(_cardCtx(k => readRawKey(raw, k)), setIdx);
}

function _cardMaxStars(rift, spelunk) {
  const rift5 = (Number(rift && rift[0]) || 0) >= 45 ? 1 : 0;
  const sp6 = (Number(spelunk && spelunk[0] && spelunk[0][2]) || 0) >= 1 ? 1 : 0;
  return Math.round(4 + rift5 + sp6);
}

function _cardStarThreshold(key, s) {
  return key === 'Boss3B'
    ? 1.5 * Math.pow(s + 1 + Math.floor(s / 3), 2)
    : (CARD_BASE_REQ[key] || 10) * Math.pow(s + 1 + Math.floor(s / 3) + 16 * Math.floor(s / 4) + 100 * Math.floor(s / 5), 2);
}

// Smallest Cards0 count that reaches `level` (0 = not found, 1 = found, n = n-1 stars).
function _cardQtyForLevel(key, level) {
  if (level <= 0) return 0;
  if (level === 1) return 1;
  return Math.floor(_cardStarThreshold(key, level - 2)) + 1;
}

function _cardFloor(key, ola) {
  if (String((ola && ola[603]) || '').split(',').indexOf(key) >= 0) return 7;
  if (String((ola && ola[155]) || '').split(',').indexOf(key) >= 0) return 6;
  return 0;
}

/** `{ level, qty, maxLevel, floor }` for one card: level from Cards0, maxLevel = max stars + 1, floor from OLA[155]/[603]. */
export function cardLevelInfo(raw, key) {
  const c = _cardCtx(k => readRawKey(raw, k));
  return {
    level: _cardLevel(key, c.cards0, c.rift, c.spelunk, c.ola),
    qty: Number(c.cards0[key]) || 0,
    maxLevel: _cardMaxStars(c.rift, c.spelunk) + 1,
    floor: _cardFloor(key, c.ola),
  };
}

/** CSetEq values for every card set, decoding the save once. */
export function cardSetValues(raw) {
  const ctx = _cardCtx(k => readRawKey(raw, k));
  return CardSets.map((_, i) => (CardStuff[i] ? _cardSetValueFrom(ctx, i) : 0));
}

// ---------------------------------------------------------------------------
// Generic level tables (account or per-character numeric arrays)
// ---------------------------------------------------------------------------

function _vialName(i) {
  const k = entityName('Vial', i);
  return k ? (ITEMS[k] ? itemName(k) + ' vial' : k) : '';
}
function _saltLickName(i) {
  const k = entityName('SaltLick', i);
  return k ? 'Salt Lick ' + (i + 1) + ' (' + itemName(k) + ')' : '';
}
// Save arrays are often longer than their game definition lists; rows without a real
// name (unused slots, `filler`/`NAME_OF_ITEM` placeholders) are skipped by readTable.
const _PLACEHOLDER_NAME = /^(filler|name of item|blank|null|undefined|z|tower defence \d+)$/i;
function _named(s) {
  const n = cleanName(s);
  return n && !_PLACEHOLDER_NAME.test(n) ? n : '';
}
let _gemNames = null;
function _gemItemName(i) {
  if (!_gemNames) {
    _gemNames = {};
    for (const page of MTXinfo || []) for (const tab of page || []) for (const r of tab || []) {
      const idx = Number(r && r[4]);
      if (Number.isInteger(idx) && idx >= 0 && !(idx in _gemNames) && _named(r[1])) _gemNames[idx] = _named(r[1]).toLowerCase().replace(/(^|\s)\S/g, ch => ch.toUpperCase());
    }
  }
  return _gemNames[i] || '';
}
function _totemName(i) {
  const trial = _named(RANDOlist[10] && RANDOlist[10][i]);
  if (trial) return trial;
  for (const m in WorshipMapType) if (Number(WorshipMapType[m]) === i) return _named(MapDispName[m]) ? _named(MapDispName[m]) + ' totem' : '';
  return '';
}
function _lv0Name(i) { return i === 0 ? 'Character level' : (/^\d+$/.test(String(SkillNames[i - 1])) ? '' : _named(SkillNames[i - 1])); }

/**
 * Table registry. `key` is a save key (or fn(ci) for per-character keys),
 * `path` addresses the numeric row inside the decoded value, and `cell`
 * optionally maps a row index to a nested path (e.g. Shrine level column).
 *
 * Editor metadata:
 * - `world`: in-game home ('W1'..'W7', 'General'); per-character tables use 'Character'.
 * - `kind`: 'level' (default stepper), 'flag' (`on`/`off` stored values),
 *   'choice' (`options` [{ value, label }] or fn(index)), or 'readonly'.
 * - `max`: number or fn(index) upper bound for steppers.
 * - `decode(raw)` / `encode(value, prev)`: map stored values to editor values
 *   (e.g. shiny pet EXP ↔ shiny level). Writing a value that already decodes
 *   from the stored one keeps the stored value untouched.
 * - `size`: minimum row count (rows exist even when the save key is missing).
 * - `indices`: explicit row indices (sparse tables such as account options).
 */
function _choices(labels) { return labels.map((label, value) => ({ value, label })); }
export const STATUE_TIER_NAMES = ['Normal', 'Gold', 'Onyx', 'Zenith'];
export const ARTIFACT_TIER_NAMES = ['Not found', 'Normal', 'Ancient', 'Eldritch', 'Sovereign', 'Omnipotent', 'Transcendent'];
let _mapOpts = null;
function _mapOptions() {
  if (!_mapOpts) {
    _mapOpts = [];
    for (let i = 0; i < MapDispName.length; i++) { const n = _named(MapDispName[i]); if (n) _mapOpts.push({ value: i, label: n }); }
  }
  return _mapOpts;
}
let _meritocOpts = null;
/** Meritocracy vote options from NinjaInfo[41] (description, base value, unused) triplets. */
export function meritocOptions() {
  if (!_meritocOpts) {
    _meritocOpts = [];
    const a = (NinjaInfo && NinjaInfo[41]) || [];
    for (let i = 0, k = 0; i + 1 < a.length; i += 3, k++) {
      const d = cleanName(a[i]).replace(/\}x/g, '\u00d7').replace(/[{}]/g, '');
      if (d) _meritocOpts.push({ value: k, label: d });
    }
  }
  return _meritocOpts;
}
let _voteOpts = null;
/** Server vote bonuses from NinjaInfo[38] (description, base value, tier) triplets. */
export function voteOptions() {
  if (!_voteOpts) {
    _voteOpts = [];
    const a = (NinjaInfo && NinjaInfo[38]) || [];
    for (let i = 0, k = 0; i + 1 < a.length; i += 3, k++) {
      const base = Number(a[i + 1]) || 0;
      const d = cleanName(a[i]).replace(/\}x/g, (1 + base / 100) + '\u00d7').replace(/\{/g, base).replace(/[{}]/g, '');
      if (d) _voteOpts.push({ value: k, label: d });
    }
  }
  return _voteOpts;
}
function _shinyThreshold(k) { return Math.floor((1 + Math.pow(k, 1.6)) * Math.pow(1.7, k)); }
/** Shiny pet level from stored breeding EXP (W4 shinyLvFromExp). */
export function shinyLevelFromExp(exp) {
  exp = Number(exp) || 0;
  if (exp <= 0) return 0;
  let lv = 1;
  for (let e = 0; e < 19; e++) if (exp > _shinyThreshold(e + 1)) lv = e + 2;
  return lv;
}
/** Minimal stored EXP that reaches shiny level `lv` (0-20). */
export function shinyExpForLevel(lv) {
  lv = Math.max(0, Math.min(20, Math.round(Number(lv) || 0)));
  if (lv <= 0) return 0;
  if (lv === 1) return 1;
  return _shinyThreshold(lv - 1) + 1;
}
const _SHINY = { kind: 'level', max: 20, decode: shinyLevelFromExp, encode: shinyExpForLevel };
function _shinyTable(w) {
  return Object.assign({ id: 'shinyPets' + w, world: 'W4', group: 'Breeding', label: 'Shiny pets (world ' + (w + 1) + ')', key: 'Breeding', path: [22 + w],
    size: (PET_NAMES[w] || []).length, name: i => _named(PET_NAMES[w] && PET_NAMES[w][i]) }, _SHINY);
}
const _ACCOUNT_OPTION_NAMES = { 369: 'Emperor fights won', 453: 'Meritocracy vote', 472: 'Meritocracy ballot cast (full bonus)' };
const _royalStatueName = i => { const s = ROYAL_STATUES[i]; return s && !/^Unreleased/.test(s.name) ? s.name : ''; };

export const LEVEL_TABLES = [
  { id: 'skillLevels', world: 'Character', group: 'Character', label: 'Character & skill levels', key: ci => 'Lv0_' + ci, perChar: true, path: [], name: _lv0Name },
  { id: 'postOffice', world: 'Character', group: 'Character', label: 'Post Office boxes', key: ci => 'POu_' + ci, perChar: true, path: [], name: i => _named(entityName('Post Office', i)) },
  { id: 'stampsA', world: 'W1', group: 'Stamps', label: 'Combat stamps', key: 'StampLv', path: [0], mirrorMax: 'StampLvM', name: i => _named(entityName('Stamp', 'A' + (i + 1))) },
  { id: 'stampsB', world: 'W1', group: 'Stamps', label: 'Skills stamps', key: 'StampLv', path: [1], mirrorMax: 'StampLvM', name: i => _named(entityName('Stamp', 'B' + (i + 1))) },
  { id: 'stampsC', world: 'W1', group: 'Stamps', label: 'Misc stamps', key: 'StampLv', path: [2], mirrorMax: 'StampLvM', name: i => _named(entityName('Stamp', 'C' + (i + 1))) },
  { id: 'statueTiers', world: 'W1', group: 'Statues', label: 'Statue tiers', key: 'StuG', path: [], kind: 'choice', options: _choices(STATUE_TIER_NAMES), name: i => _named(entityName('Statue', i)) },
  { id: 'bribes', world: 'W1', group: 'Bribes', label: 'Bribes', key: 'BribeStatus', path: [], kind: 'flag', on: 1, off: 0, name: i => _named(entityName('Bribe', i)) },
  { id: 'bubbles0', world: 'W2', group: 'Alchemy', label: 'Power bubbles', key: 'CauldronInfo', path: [0], name: i => _named(entityName('Bubble', [0, i])) },
  { id: 'bubbles1', world: 'W2', group: 'Alchemy', label: 'Quicc bubbles', key: 'CauldronInfo', path: [1], name: i => _named(entityName('Bubble', [1, i])) },
  { id: 'bubbles2', world: 'W2', group: 'Alchemy', label: 'High-IQ bubbles', key: 'CauldronInfo', path: [2], name: i => _named(entityName('Bubble', [2, i])) },
  { id: 'bubbles3', world: 'W2', group: 'Alchemy', label: 'Kazam bubbles', key: 'CauldronInfo', path: [3], name: i => _named(entityName('Bubble', [3, i])) },
  { id: 'vials', world: 'W2', group: 'Alchemy', label: 'Vials', key: 'CauldronInfo', path: [4], name: _vialName },
  { id: 'sigils', world: 'W2', group: 'Alchemy', label: 'Sigils', key: 'CauldronP2W', path: [4], stride: 2, offset: 1, name: i => _named(entityName('Sigil', i)) },
  { id: 'arcade', world: 'W2', group: 'Arcade', label: 'Arcade shop', key: 'ArcadeUpg', path: [], name: i => _named(entityName('Arcade', i)) },
  { id: 'prayerLevels', world: 'W3', group: 'Worship', label: 'Prayer levels', key: 'PrayOwned', path: [], name: i => _named(entityName('Prayer', i)) },
  { id: 'totems', world: 'W3', group: 'Worship', label: 'Totem best waves', key: 'TotemInfo', path: [0], name: _totemName },
  { id: 'tower', world: 'W3', group: 'Construction', label: 'Construction buildings', key: 'Tower', path: [], name: i => _named(TowerInfo[i] && TowerInfo[i][0]) },
  { id: 'shrineLevels', world: 'W3', group: 'Construction', label: 'Shrine levels', key: 'Shrine', path: [], cell: i => [i, 3], name: i => _named(entityName('Shrine', i)) },
  { id: 'shrineMaps', world: 'W3', group: 'Construction', label: 'Shrine map placement', key: 'Shrine', path: [], cell: i => [i, 0], kind: 'choice', options: _mapOptions, name: i => _named(entityName('Shrine', i)) },
  { id: 'saltLick', world: 'W3', group: 'Construction', label: 'Salt Lick', key: 'SaltLick', path: [], name: _saltLickName },
  { id: 'atoms', world: 'W3', group: 'Atom Collider', label: 'Atom Collider', key: 'Atoms', path: [], name: i => _named(entityName('Atom', i)) },
  { id: 'dream', world: 'W3', group: 'Equinox', label: 'Equinox dreams', key: 'Dream', path: [], name: i => _named(entityName('Dream', i)) },
  { id: 'labJewels', world: 'W4', group: 'Lab', label: 'Lab jewels', key: 'Lab', path: [14], kind: 'flag', on: 1, off: 0, name: i => _named(entityName('Mainframe', 100 + i)) },
  { id: 'meals', world: 'W4', group: 'Cooking', label: 'Meals', key: 'Meals', path: [0], name: i => _named(entityName('Meal', i)) },
  _shinyTable(0), _shinyTable(1), _shinyTable(2), _shinyTable(3),
  { id: 'artifacts', world: 'W5', group: 'Sailing', label: 'Sailing artifacts', key: 'Sailing', path: [3], kind: 'choice', options: _choices(ARTIFACT_TIER_NAMES), size: 41, name: i => _named(entityName('Artifact', i)) },
  { id: 'divinityBless', world: 'W5', group: 'Divinity', label: 'Divinity blessings', key: 'Divinity', path: [], offset: 28, name: i => (GodsInfo[i] ? 'Blessing: ' + godName(i) : '') },
  { id: 'summonUpg', world: 'W6', group: 'Summoning', label: 'Summoning upgrades', key: 'Summon', path: [0], size: SummonUPG.length,
    max: i => Number(SummonUPG[i] && SummonUPG[i][8]) || undefined, name: i => _named(SummonUPG[i] && SummonUPG[i][3]) },
  { id: 'stickers', world: 'W6', group: 'Farming', label: 'Stickers', key: 'Research', path: [9], size: 7,
    name: i => { const n = ResearchList[23] && ResearchList[23][i]; return n && !/Nonexistent/.test(n) ? _named(n) : ''; } },
  { id: 'exotics', world: 'W6', group: 'Farming', label: 'Exotic market', key: 'FarmUpg', path: [], offset: 20, size: 80, name: i => _named(entityName('Exotic', i)) },
  { id: 'emperor', world: 'W6', group: 'Emperor', label: 'Emperor', key: 'OptLacc', path: [], indices: [369], name: i => _ACCOUNT_OPTION_NAMES[i] || '' },
  { id: 'researchGrid', world: 'W7', group: 'Research', label: 'Research grid levels', key: 'Research', path: [0], name: i => _named(entityName('Grid', i)) },
  { id: 'researchShapes', world: 'W7', group: 'Research', label: 'Research shape overlay (edit with shape layout)', key: 'Research', path: [1], kind: 'readonly', name: i => _named(entityName('Grid', i)) },
  { id: 'spelunkShop', world: 'W7', group: 'Spelunking', label: 'Spelunking shop', key: 'Spelunk', path: [5], size: 68, name: i => _named(entityName('Spelunking', i)) },
  { id: 'legend', world: 'W7', group: 'Spelunking', label: 'Legend talents', key: 'Spelunk', path: [18], size: 50, name: i => _named(entityName('Legend', i)) },
  { id: 'meritoc', world: 'W7', group: 'Meritocracy', label: 'Meritocracy', key: 'OptLacc', path: [], indices: [453, 472],
    kind: i => (i === 453 ? 'choice' : 'flag'), on: 1, off: 0, options: meritocOptions, name: i => _ACCOUNT_OPTION_NAMES[i] || '' },
  { id: 'royalStatues', world: 'W7', group: 'Royal Guardian', label: 'Royal statues', key: 'RoyalG', path: [0], size: ROYAL_STATUES.length, name: _royalStatueName },
  { id: 'armory', world: 'W7', group: 'Royal Guardian', label: 'Royal Armory', key: 'RoyalG', path: [2], size: ARMORY_UPGRADES.length,
    max: i => (ARMORY_UPGRADES[i] && Number(ARMORY_UPGRADES[i].maxLevel)) || undefined, name: i => _named(ARMORY_UPGRADES[i] && ARMORY_UPGRADES[i].name) },
  { id: 'achievements', world: 'General', group: 'Achievements', label: 'Achievements', key: 'AchieveReg', path: [], kind: 'flag', on: -1, off: 0, size: 490, name: i => _named(entityName('Achievement', i)) },
  { id: 'guild', world: 'General', group: 'Guild', label: 'Guild bonuses', key: 'Guild', path: [0], name: i => _named(entityName('Guild', i)) },
  { id: 'gemShop', world: 'General', group: 'Gem shop', label: 'Gem shop purchases', key: 'GemItemsPurchased', path: [], name: _gemItemName },
  { id: 'vault', world: 'General', group: 'Upgrade Vault', label: 'Upgrade Vault', key: 'UpgVault', path: [], name: i => _named(entityName('Vault', i)) },
  { id: 'grimoire', world: 'General', group: 'Class systems', label: 'Grimoire', key: 'Grimoire', path: [], name: i => _named(entityName('Grimoire', i)) },
  { id: 'arcane', world: 'General', group: 'Class systems', label: 'Tesseract (Arcane)', key: 'Arcane', path: [], name: i => _named(entityName('Arcane', i)) },
];

const _TABLE_BY_ID = {};
LEVEL_TABLES.forEach(t => { _TABLE_BY_ID[t.id] = t; });
export function levelTable(id) { return _TABLE_BY_ID[id] || null; }

function _tableKey(t, ci) { return typeof t.key === 'function' ? t.key(ci) : t.key; }
function _walk(v, path) { let c = v; for (let i = 0; i < path.length && c != null; i++) c = _at(c, path[i]); return c; }
function _cellPath(t, index) {
  if (t.cell) return t.path.concat(t.cell(index));
  if (t.indices) return t.path.concat([index]);
  return t.path.concat([(t.offset || 0) + (t.stride || 1) * index]);
}
function _opt(v, i) { return typeof v === 'function' ? v(i) : v; }
function _tableKind(t, i) { return _opt(t.kind, i) || 'level'; }
/** Editor value for a stored cell. */
function _decodeCell(t, i, raw) {
  const kind = _tableKind(t, i);
  if (kind === 'flag') return String(raw) === String(t.on) ? 1 : 0;
  if (t.decode) return t.decode(raw);
  if (raw == null || raw === '') return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : raw;
}
function _encodeCell(t, i, value, prev) {
  const kind = _tableKind(t, i);
  if (kind === 'flag') return Number(value) ? t.on : t.off;
  return t.encode ? t.encode(value, prev) : Number(value);
}
/** Human label for an editor value (choice/flag aware). */
export function tableValueLabel(tableId, index, value) {
  const t = _TABLE_BY_ID[tableId];
  if (!t) return _fmtVal(value);
  const kind = _tableKind(t, index);
  if (kind === 'flag') return Number(value) ? 'On' : 'Off';
  if (kind === 'choice') {
    const o = (_opt(t.options, index) || []).find(x => String(x.value) === String(value));
    return o ? o.label : _fmtVal(value);
  }
  return _fmtVal(value);
}

/**
 * Rows `{ index, name, value, raw, kind, options?, max? }` for a level table.
 * `value` is the decoded editor value; `raw` is the stored cell.
 */
export function readTable(raw, tableId, ci) {
  const t = _TABLE_BY_ID[tableId];
  if (!t) return [];
  const value = readRawKey(raw, _tableKey(t, ci));
  if (value === undefined && !t.size && !t.indices) return [];
  const out = [];
  const push = (i, stored) => {
    const name = t.name(i);
    if (!name) return;
    const kind = _tableKind(t, i);
    const r = { index: i, name, value: _decodeCell(t, i, stored), raw: stored, kind };
    if (kind === 'choice') r.options = _opt(t.options, i) || [];
    const max = _opt(t.max, i);
    if (max != null) r.max = max;
    out.push(r);
  };
  if (t.indices) {
    for (const i of t.indices) push(i, _walk(value, _cellPath(t, i)));
    return out;
  }
  if (t.cell) {
    const base = rowValues(_walk(value, t.path));
    for (let i = 0; i < Math.max(base.length, t.size || 0); i++) push(i, _walk(value, _cellPath(t, i)));
    return out;
  }
  const row = rowValues(_walk(value, t.path));
  const start = t.offset || 0, stride = t.stride || 1;
  const n = Math.max(Math.ceil((row.length - start) / stride), t.size || 0);
  for (let i = 0; i < n; i++) push(i, row[start + stride * i]);
  return out;
}

/** Unlocked star signs (StarSg): `[{ name, label, unlocked }]` in StarSigns order. */
export function readStarSignUnlocks(raw) {
  const v = readRawKey(raw, 'StarSg');
  const set = v && typeof v === 'object' ? v : {};
  const out = [];
  for (let i = 0; i < StarSigns.length; i++) {
    const key = StarSigns[i] && StarSigns[i][0];
    if (!key || /^Filler|^_$/.test(key)) continue;
    const label = starSignName(i);
    if (!label || /^\d+$/.test(label)) continue;
    // Source star sign menu (78795/79595): the first sign is always unlocked.
    out.push({ index: i, name: key, label, unlocked: i === 0 || _hasOwn(set, key) });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Readers
// ---------------------------------------------------------------------------

function _emmEntry(map, slot) {
  const e = _at(map, slot);
  return e && typeof e === 'object' ? e : null;
}

export function readEquipment(raw, ci) {
  const order = readRawKey(raw, 'EquipOrder_' + ci) || [];
  const qty = readRawKey(raw, 'EquipQTY_' + ci) || [];
  const emm = [readRawKey(raw, 'EMm0_' + ci) || {}, readRawKey(raw, 'EMm1_' + ci) || {}];
  function row(r, labels, count) {
    const items = rowValues(_at(order, r));
    const q = rowValues(_at(qty, r));
    const out = [];
    for (let s = 0; s < count; s++) {
      const item = items[s] == null ? 'Blank' : items[s];
      out.push({ row: r, slot: s, slotName: labels[s] || ('Slot ' + s), item, name: itemName(item), qty: q[s], stats: r < 2 ? _emmEntry(emm[r], s) : null });
    }
    return out;
  }
  const foodSlots = Number(readRawKey(raw, 'FoodSlO_' + ci)) || 0;
  return {
    armor: row(0, ARMOR_SLOTS, 16),
    tools: row(1, TOOL_SLOTS, 7),
    food: row(2, Array.from({ length: FOOD_SLOT_COUNT }, (_, i) => 'Food ' + (i + 1)), Math.max(foodSlots, Math.min(FOOD_SLOT_COUNT, rowValues(_at(order, 2)).length))),
    foodSlots,
  };
}

export function readObols(raw, ci) {
  function list(namesKey, mapKey) {
    const names = rowValues(readRawKey(raw, namesKey));
    const map = readRawKey(raw, mapKey) || {};
    return names.map((item, slot) => ({ slot, item, name: itemName(item), stats: _emmEntry(map, slot) }));
  }
  return { personal: list('ObolEqO0_' + ci, 'ObolEqMAP_' + ci), family: list('ObolEqO1', 'ObolEqMAPz1') };
}

export function readCards(raw, ci) {
  const eq = rowValues(readRawKey(raw, 'CardEquip_' + ci));
  const cs = readRawKey(raw, 'CSetEq_' + ci) || {};
  const setKey = Object.keys(cs)[0] || null;
  const setIdx = setKey ? CardSets.findIndex(r => r && r[0] === setKey) : -1;
  const ctx = _cardCtx(k => readRawKey(raw, k));
  return {
    equipped: eq.map((key, slot) => ({ slot, key, name: cardName(key), level: key && key !== 'B' ? _cardLevel(key, ctx.cards0, ctx.rift, ctx.spelunk, ctx.ola) : 0 })),
    set: setKey ? { set: setIdx, key: setKey, name: cleanName(setKey.replace(/[{}%]/g, '')), value: cs[setKey] } : null,
  };
}

export function readTalents(raw, ci) {
  const sl = readRawKey(raw, 'SL_' + ci) || {};
  const sm = readRawKey(raw, 'SM_' + ci) || {};
  const ids = Object.keys(Object.assign({}, sm, sl)).filter(k => /^\d+$/.test(k)).map(Number).sort((a, b) => a - b);
  return ids.map(id => ({ id, name: talentName(id), level: Number(_at(sl, id)) || 0, max: Number(_at(sm, id)) || 0 }));
}

// ---------------------------------------------------------------------------
// Super talents (Spelunk[20 + ci + 12*preset], 20 slots, -1 = empty)
// ---------------------------------------------------------------------------

export const SUPER_TALENT_SLOTS = 20;

/** Source TalentBannedforAllLV: talents that can never receive All Talent Levels or a super. */
export function superTalentBanned(id) {
  const n = Number(id);
  return (n >= 49 && n <= 59) || n === 149 || n === 374 || n === 539 || n === 505 || n > 614;
}

function _superRowIdx(ci, preset) { return 20 + Number(ci) + 12 * (Number(preset) ? 1 : 0); }

function _superInfo(get, ci) {
  const sp = get('Spelunk') || [];
  const lv0 = rowValues(get('Lv0_' + ci));
  const ps = rowValues(get('PlayerStuff_' + ci));
  const roy = get('RoyalG') || [];
  const lore = (Number(_at(_at(sp, 0), 5)) || 0) >= 1 ? 1 : 0;
  const slots = Math.min(SUPER_TALENT_SLOTS, Math.floor(Math.max(0, (Number(lv0[0]) || 0) - 400) / 100) + lore);
  const bonus = Math.round(50 + (Number(_at(_at(sp, 18), 7)) || 0) * 10 + (Number(_at(_at(sp, 45), 5)) || 0));
  const presets = [0, 1].map(pr => {
    const ids = rowValues(_at(sp, _superRowIdx(ci, pr))).map(Number).filter(v => Number.isFinite(v) && v >= 0);
    return { ids, used: ids.length };
  });
  return {
    activePreset: (Number(ps[1]) || 0) ? 1 : 0,
    slots, bonus, presets,
    rgAllowed: (Number(_at(_at(roy, 2), 56)) || 0) >= 1,
  };
}

/**
 * Super-talent state for character `ci`: active preset (PlayerStuff_X[1]),
 * slot count (SuperTalentPTS_totaltospend), bonus levels (SuperTalentPTS_LVgiven),
 * per-preset supered talent IDs, and whether Royal talents 225-239 may be supered (Armory 56).
 */
export function readSuperTalents(raw, ci) {
  return _superInfo(k => readRawKey(raw, k), ci);
}

export function readStarSigns(raw, ci) {
  const s = readRawKey(raw, 'PVtStarSign_' + ci);
  const parts = String(s == null ? '' : s).split(',');
  if (parts.length && parts[parts.length - 1] === '') parts.pop();
  return parts.map((id, slot) => ({ slot, id: id === '_' ? '_' : Number(id), name: starSignName(id) }));
}

export function readPrayers(raw, ci) {
  const p = rowValues(readRawKey(raw, 'Prayers_' + ci));
  const lv = rowValues(readRawKey(raw, 'PrayOwned'));
  return p.map((id, slot) => ({ slot, id: Number(id), name: prayerName(id), level: Number(id) >= 0 ? Number(lv[id]) || 0 : 0 }));
}

export function readBubbles(raw, ci) {
  const all = readRawKey(raw, 'CauldronBubbles') || [];
  const row = rowValues(_at(all, ci));
  const out = [];
  for (let s = 0; s < Math.max(3, row.length); s++) out.push({ slot: s, code: row[s] || 0, name: bubbleCodeName(row[s]) });
  return out;
}

export function readLab(raw, ci) {
  const lab = readRawKey(raw, 'Lab') || [];
  const pos = rowValues(_at(lab, 0));
  const chips = rowValues(_at(lab, 1 + Number(ci)));
  return {
    x: Number(pos[2 * ci]) || 0,
    y: Number(pos[2 * ci + 1]) || 0,
    chips: chips.map((id, slot) => ({ slot, id: Number(id), name: chipName(id) })),
    jewels: readTable(raw, 'labJewels', ci),
  };
}

export function readStatues(raw) {
  const lv = readRawKey(raw, 'StatueLevels_0') || [];
  const tiers = rowValues(readRawKey(raw, 'StuG'));
  return rowValues(lv).map((row, idx) => ({ idx, name: entityName('Statue', idx) || ('Statue ' + idx), level: Number(Array.isArray(row) ? row[0] : _at(row, 0)) || 0, tier: Number(tiers[idx]) || 0 }));
}

export function readBuffs(raw, ci) {
  return rowValues(readRawKey(raw, 'BuffsActive_' + ci)).map((b, i) => {
    const r = rowValues(b);
    return { index: i, talent: Number(r[0]), name: talentName(r[0]), values: r.slice(1) };
  });
}

export function readAttackLoadout(raw, ci) {
  const rows = readRawKey(raw, 'AttackLoadout_' + ci) || [];
  return rowValues(rows).map((row, r) => rowValues(row).map((id, slot) => ({ row: r, slot, id, name: id === 'Null' || id == null ? '(empty)' : talentName(id) })));
}

function _companionEntries(comp) {
  const l = comp && comp.l;
  if (Array.isArray(l)) return l;
  if (l && typeof l === 'object') return Object.keys(l).sort((a, b) => Number(a) - Number(b)).map(k => l[k]);
  return [];
}

export function readCompanions(raw) {
  const comp = raw && raw.companion;
  const entries = _companionEntries(comp);
  const owned = new Map();
  entries.forEach(e => {
    const f = String(e).split(',');
    const id = Number(f[0]);
    if (Number.isInteger(id)) owned.set(id, { id, name: companionName(id), level: Number(f[3]) || 0, enhanced: (Number(f[4]) || 0) >= 1 });
  });
  return { available: entries.length > 0 || !!(comp && comp.l), owned: Array.from(owned.values()).sort((a, b) => a.id - b.id) };
}

export function readDivinity(raw, ci) {
  const d = rowValues(readRawKey(raw, 'Divinity'));
  return { style: Number(d[ci]) || 0, god: d[ci + 12] == null ? -1 : Number(d[ci + 12]) };
}

export function readCharacter(raw, ci) {
  const lv = rowValues(readRawKey(raw, 'Lv0_' + ci));
  const cls = Number(readRawKey(raw, 'CharacterClass_' + ci)) || 0;
  return { ci, name: characterName(raw, ci), level: Number(lv[0]) || 0, classId: cls, className: className(cls) };
}

/**
 * Item keys the account owns: storage (ChestOrder), every character's
 * inventory (InventoryOrder_X), equipped gear (EquipOrder_X rows), and
 * personal/family obols. Used by the editor's "owned only" filters.
 */
export function ownedItemKeys(raw) {
  const out = new Set();
  const add = v => { if (v != null && v !== '' && v !== 'Blank' && v !== 'LockedInvSpace' && v !== 'Null') out.add(String(v)); };
  rowValues(readRawKey(raw, 'ChestOrder')).forEach(add);
  rowValues(readRawKey(raw, 'ObolEqO1')).forEach(add);
  for (let i = 0; i < characterCount(raw); i++) {
    rowValues(readRawKey(raw, 'InventoryOrder_' + i)).forEach(add);
    rowValues(readRawKey(raw, 'EquipOrder_' + i)).forEach(r => rowValues(r).forEach(add));
    rowValues(readRawKey(raw, 'ObolEqO0_' + i)).forEach(add);
  }
  return out;
}

/**
 * Physical equipment copies the account holds, with each copy's saved
 * upgrade deltas: every character's inventory (InventoryOrder_X + IMm_X),
 * storage (ChestOrder + CMm), and other characters' equipped gear
 * (EquipOrder_X rows 0/1 + EMm{row}_X). Excludes `ci`'s own equipped gear.
 * Only items with an equipment typeGen are returned.
 */
export function ownedItemInstances(raw, ci) {
  const out = [];
  const skip = /^(Blank|LockedInvSpace|Null|null)$/;
  const push = (key, stats, src) => {
    if (key == null || skip.test(String(key))) return;
    const def = ITEMS[key];
    if (!def || !def.typeGen) return;
    out.push(Object.assign({ key: String(key), name: itemName(key), stats: stats ? JSON.parse(JSON.stringify(stats)) : null }, src));
  };
  const n = characterCount(raw);
  for (let i = 0; i < n; i++) {
    const map = readRawKey(raw, 'IMm_' + i) || {};
    rowValues(readRawKey(raw, 'InventoryOrder_' + i)).forEach((key, index) => push(key, _emmEntry(map, index), { source: 'inventory', ci: i, index }));
  }
  const cmm = readRawKey(raw, 'CMm') || {};
  rowValues(readRawKey(raw, 'ChestOrder')).forEach((key, index) => push(key, _emmEntry(cmm, index), { source: 'storage', ci: null, index }));
  for (let i = 0; i < n; i++) {
    if (i === Number(ci)) continue;
    const order = readRawKey(raw, 'EquipOrder_' + i) || [];
    for (let r = 0; r < 2; r++) {
      const map = readRawKey(raw, 'EMm' + r + '_' + i) || {};
      rowValues(_at(order, r)).forEach((key, slot) => push(key, _emmEntry(map, slot), { source: 'equipped', ci: i, row: r, index: slot }));
    }
  }
  return out;
}

export function readVote(raw) {
  const v = raw && raw.serverVars && raw.serverVars.voteCategories;
  return Array.isArray(v) ? Number(v[0]) : null;
}

// Item filter: PrinterXtra[120 + k] for k < Thingies("Filterslots"). The game
// splices filtered keys out of MonsterDropDL before spawning and recycles any
// other filtered drop actor 300 ms after it spawns.
export const PRINTER_FILTER_OFFSET = 120;
export const PRINTER_FILTER_MAX = 144;

/** Thingies("Filterslots"): min(144, 16*ES8 + 16*ES17 + 32*bon_f + 64). */
export function printerFilterSlotCount(raw) {
  const ola = rowValues(readRawKey(raw, 'OptLacc'));
  const es = String(_at(ola, 311) ?? '');
  const bundles = readRawKey(raw, 'BundlesReceived');
  const bonF = bundles && typeof bundles === 'object' && Number(bundles.bon_f) === 1 ? 1 : 0;
  return Math.min(PRINTER_FILTER_MAX, Math.round(16 * eventShopOwned(8, es) + 16 * eventShopOwned(17, es) + 32 * bonF + 64));
}

export function readPrinterFilter(raw) {
  const px = rowValues(readRawKey(raw, 'PrinterXtra'));
  const items = [];
  for (let k = 0; k < PRINTER_FILTER_MAX; k++) {
    const v = _at(px, PRINTER_FILTER_OFFSET + k);
    items.push(v == null || v === '' || v === 0 ? 'Blank' : String(v));
  }
  return { slots: printerFilterSlotCount(raw), items, available: px.length > 0 };
}

function _researchLevelVia(get, raw) {
  let lv = 0;
  for (let ci = 0; ci < characterCount(raw); ci++) lv = Math.max(lv, Number(_at(rowValues(get('Lv0_' + ci)), 20)) || 0);
  return lv;
}

function _researchShapesOwnedVia(get, raw) {
  const ola = rowValues(get('OptLacc'));
  let has54 = _companionEntries(get('companion')).some(e => parseInt(String(e).split(',')[0], 10) === 54);
  const tokens = String(_at(ola, 606) ?? '');
  if (!has54 && tokens && tokens !== '0') has54 = tokens.split(',').some(t => Number(t) === 54);
  const bundles = get('BundlesReceived');
  const banM = bundles && typeof bundles === 'object' && Number(bundles.h ? bundles.h.ban_m : bundles.ban_m) === 1;
  return researchShapesOwned({
    researchLevel: _researchLevelVia(get, raw),
    eventShopStr: String(_at(ola, 311) ?? ''),
    spelunkUpg7: Number(_at(_at(get('Spelunk'), 0), 7)) || 0,
    hasComp54: has54,
    banM,
  });
}

/** Account ShapesOwned derived from a raw save (Research level, Event Shop 36, Companion 54, Spelunk lore, bundle ban_m). */
export function researchShapesOwnedFromRaw(raw) {
  return _researchShapesOwnedVia(k => readRawKey(raw, k), raw);
}

/** Research grid levels, Research[1] overlay, and Research[6] shape positions. */
export function readResearchLayout(raw) {
  const R = readRawKey(raw, 'Research');
  const levels = rowValues(_at(R, 0)).map(v => Number(v) || 0);
  const r1 = rowValues(_at(R, 1));
  const overlay = [];
  for (let i = 0; i < 240; i++) { const v = r1[i]; overlay.push(v == null || v === '' ? -1 : (Number(v) || 0)); }
  const owned = researchShapesOwnedFromRaw(raw);
  const r6 = rowValues(_at(R, 6));
  return {
    available: Array.isArray(R) || (R != null && typeof R === 'object'),
    levels, overlay, owned,
    researchLevel: _researchLevelVia(k => readRawKey(raw, k), raw),
    positions: parseResearchShapePositions(r6, Math.max(Math.floor(r6.length / 4), owned)),
  };
}

/** Everything the editor shows for one character, plus account-wide singletons. */
export function readCombatSetupState(raw, ci) {
  return {
    character: readCharacter(raw, ci),
    equipment: readEquipment(raw, ci),
    obols: readObols(raw, ci),
    cards: readCards(raw, ci),
    talents: readTalents(raw, ci),
    superTalents: readSuperTalents(raw, ci),
    starSigns: readStarSigns(raw, ci),
    prayers: readPrayers(raw, ci),
    bubbles: readBubbles(raw, ci),
    lab: readLab(raw, ci),
    statues: readStatues(raw),
    buffs: readBuffs(raw, ci),
    attackLoadout: readAttackLoadout(raw, ci),
    companions: readCompanions(raw),
    divinity: readDivinity(raw, ci),
    vote: readVote(raw),
    printerFilter: readPrinterFilter(raw),
    research: readResearchLayout(raw),
  };
}

// ---------------------------------------------------------------------------
// Patch handlers
// ---------------------------------------------------------------------------

function _ci(p, setup) {
  const v = p.ci != null ? p.ci : setup.charIdx;
  return Number(v) || 0;
}

function _rowRef(container, r, fillLenObj) {
  let row = _at(container, r);
  if (row == null) {
    row = fillLenObj ? { length: 0 } : [];
    _put(container, r, row, []);
  }
  return row;
}

function _change(list, ci, system, target, before, after, key) {
  list.push({ ci, system, target, before, after, key });
}

// Compact "Defence 0, LUK 2" pair listing only the EMm fields that differ.
function _emmDiff(prev, next) {
  const a = prev || {}, b = next || {};
  const keys = Object.keys(Object.assign({}, a, b)).filter(k => String(a[k] == null ? 0 : a[k]) !== String(b[k] == null ? 0 : b[k]));
  if (!keys.length) return ['', ''];
  const f = (o, k) => k + ' ' + _fmtVal(o[k] == null ? 0 : o[k]);
  return [keys.map(k => f(a, k)).join(', '), keys.map(k => f(b, k)).join(', ')];
}

const HANDLERS = {
  equipment(S, p, ci, out) {
    const row = Number(p.row) || 0;
    const slot = Number(p.slot) || 0;
    if (row !== 0 && row !== 1) throw new Error('equipment row must be 0 (armor) or 1 (tools)');
    const labels = row === 0 ? ARMOR_SLOTS : TOOL_SLOTS;
    const slotLabel = (row === 0 ? '' : 'Tool: ') + (labels[slot] || ('Slot ' + slot));
    const orderKey = 'EquipOrder_' + ci, qtyKey = 'EquipQTY_' + ci, emmKey = 'EMm' + row + '_' + ci;
    const order = S.get(orderKey, () => []);
    const r = _rowRef(order, row, _isLenObj(_at(order, 0)));
    const prevItem = _at(r, slot);
    const itemChanged = p.item !== undefined && p.item !== prevItem;
    if (p.item !== undefined) {
      _put(r, slot, p.item);
      _change(out, ci, 'Equipment', slotLabel, itemName(prevItem), itemName(p.item), 'equipment:' + ci + ':' + row + ':' + slot);
    }
    if (p.qty !== undefined || itemChanged) {
      const qty = S.get(qtyKey, () => []);
      const qr = _rowRef(qty, row, _isLenObj(_at(qty, 0)));
      const q = p.qty !== undefined ? Number(p.qty) : ((p.item === 'Blank' || !p.item) ? 0 : 1);
      _put(qr, slot, q);
    }
    const useStones = Array.isArray(p.stones) || (p.extra && typeof p.extra === 'object');
    if (useStones) {
      const emm = S.get(emmKey, () => ({}));
      const prev = _emmEntry(emm, slot);
      const item = _at(r, slot);
      const res = applyStones(item, Object.assign({}, EMM_ZERO, p.extra || (itemChanged ? {} : prev) || {}), p.stones || [],
        { classId: Number(S.get('CharacterClass_' + ci)) || 0 });
      const next = Object.assign({}, EMM_ZERO, res.stats);
      emm[slot] = next;
      const sd = _emmDiff(prev, next);
      _change(out, ci, 'Equipment stats', slotLabel, sd[0], sd[1], 'equipmentStats:' + ci + ':' + row + ':' + slot);
      if (p.stones && p.stones.length) {
        const names = p.stones.map(s => { const st = stoneByKey(s && s.key); return (st ? st.name : String(s && s.key)) + (s && s.failed ? ' (failed)' : ''); });
        const rej = res.rejected.length ? ' — ' + res.rejected.length + ' rejected: ' + res.rejected.map(x => x.reason).join('; ') : '';
        _change(out, ci, 'Stones', slotLabel, '', names.join(', ') + rej, 'equipmentStones:' + ci + ':' + row + ':' + slot);
      }
    } else if (p.stats !== undefined || (itemChanged && !p.keepStats)) {
      const emm = S.get(emmKey, () => ({}));
      const prev = _emmEntry(emm, slot);
      const next = p.stats === null || p.stats === undefined ? Object.assign({}, EMM_ZERO) : Object.assign({}, EMM_ZERO, p.stats);
      emm[slot] = next;
      if (p.stats !== undefined) { const sd = _emmDiff(prev, next); _change(out, ci, 'Equipment stats', slotLabel, sd[0], sd[1], 'equipmentStats:' + ci + ':' + row + ':' + slot); }
    }
  },

  food(S, p, ci, out) {
    const slot = Number(p.slot) || 0;
    const order = S.get('EquipOrder_' + ci, () => []);
    const r = _rowRef(order, 2, _isLenObj(_at(order, 0)));
    const qty = S.get('EquipQTY_' + ci, () => []);
    const qr = _rowRef(qty, 2, _isLenObj(_at(qty, 0)));
    const prevItem = _at(r, slot), prevQty = _at(qr, slot);
    if (p.item !== undefined) _put(r, slot, p.item);
    const item = _at(r, slot);
    let q = p.qty;
    if (q === undefined && p.item !== undefined && p.item !== prevItem) q = (!item || item === 'Blank') ? 0 : (Number(prevQty) > 0 ? Number(prevQty) : 1);
    if (q !== undefined) _put(qr, slot, Number(q) || 0);
    _change(out, ci, 'Food', 'Food ' + (slot + 1), itemName(prevItem) + ' x' + _fmtVal(Number(prevQty) || 0), itemName(item) + ' x' + _fmtVal(Number(_at(qr, slot)) || 0), 'food:' + ci + ':' + slot);
  },

  foodSlots(S, p, ci, out) {
    const prev = S.get('FoodSlO_' + ci);
    S.set('FoodSlO_' + ci, _typed(prev, Number(p.value) || 0));
    _change(out, ci, 'Food', 'Food slots owned', _fmtVal(prev), _fmtVal(Number(p.value) || 0), 'foodSlots:' + ci);
  },

  obol(S, p, ci, out) {
    const family = p.scope === 'family';
    const namesKey = family ? 'ObolEqO1' : 'ObolEqO0_' + ci;
    const mapKey = family ? 'ObolEqMAPz1' : 'ObolEqMAP_' + ci;
    const slot = Number(p.slot) || 0;
    const names = S.get(namesKey, () => []);
    const prevItem = _at(names, slot);
    const itemChanged = p.item !== undefined && p.item !== prevItem;
    if (p.item !== undefined) _put(names, slot, p.item, 'Blank');
    const target = (family ? 'Family obol ' : 'Obol ') + (slot + 1);
    if (p.item !== undefined) _change(out, family ? null : ci, 'Obols', target, itemName(prevItem), itemName(p.item), 'obol:' + (family ? 'f' : ci) + ':' + slot);
    if (p.stats !== undefined || (itemChanged && !p.keepStats)) {
      const map = S.get(mapKey, () => ({}));
      const prev = _emmEntry(map, slot);
      if (p.stats && typeof p.stats === 'object') map[slot] = Object.assign({}, p.stats);
      else delete map[slot];
      if (p.stats !== undefined) _change(out, family ? null : ci, 'Obol stats', target, _fmtVal(prev), _fmtVal(p.stats || null), 'obolStats:' + (family ? 'f' : ci) + ':' + slot);
    }
  },

  card(S, p, ci, out) {
    const slot = Number(p.slot) || 0;
    const eq = S.get('CardEquip_' + ci, () => []);
    const prev = _at(eq, slot);
    const key = p.key || 'B';
    _put(eq, slot, key, 'B');
    _change(out, ci, 'Cards', 'Card slot ' + (slot + 1), cardName(prev), cardName(key), 'card:' + ci + ':' + slot);
  },

  cardSet(S, p, ci, out) {
    const prev = S.get('CSetEq_' + ci) || {};
    const prevKey = Object.keys(prev)[0];
    let next = {};
    let afterLabel = '(none)';
    if (p.set != null && Number(p.set) >= 0 && CardSets[Number(p.set)]) {
      // The value is always derived from card levels (the game recomputes it on equip and when the card menu opens).
      const setIdx = Number(p.set);
      const key = CardSets[setIdx][0];
      const value = _cardSetValueFrom(_cardCtx(k => S.peek(k)), setIdx);
      // Source 77877: a set whose value is 0 cannot be equipped; the click leaves the current set alone.
      if (value === 0) throw new Error(cleanName(key.replace(/[{}%]/g, '')) + ' has no levelled cards, so it cannot be equipped');
      next[key] = value;
      afterLabel = cleanName(key.replace(/[{}%]/g, '')) + ' ' + value;
    }
    S.set('CSetEq_' + ci, next);
    _change(out, ci, 'Cards', 'Card set', prevKey ? cleanName(prevKey.replace(/[{}%]/g, '')) + ' ' + prev[prevKey] : '(none)', afterLabel, 'cardSet:' + ci);
  },

  cardLevel(S, p, ci, out, warn) {
    const key = String(p.key || '');
    if (!key || key === 'B' || key === 'Blank') throw new Error('cardLevel needs a card key');
    const ctx = _cardCtx(k => S.peek(k));
    const maxLevel = _cardMaxStars(ctx.rift, ctx.spelunk) + 1;
    const level = Math.max(0, Math.min(maxLevel, Math.round(Number(p.level) || 0)));
    const before = _cardLevel(key, ctx.cards0, ctx.rift, ctx.spelunk, ctx.ola);
    const cards0 = S.get('Cards0', () => ({}));
    const qty = _cardQtyForLevel(key, level);
    if (qty <= 0) delete cards0[key];
    else cards0[key] = _typed(cards0[key], qty);
    const floor = _cardFloor(key, ctx.ola);
    if (level < floor) warn(cardName(key) + ' is held at level ' + floor + ' by an account card-level floor');
    _change(out, null, 'Cards', cardName(key) + ' level', String(before), String(Math.max(level, floor)), 'cardLevel:' + key);
  },

  superTalent(S, p, ci, out, warn) {
    const id = Number(p.id);
    const preset = Number(p.preset) ? 1 : 0;
    if (!Number.isInteger(id) || id < 0) throw new Error('superTalent needs a talent id');
    const on = p.on !== false;
    const sp = S.get('Spelunk', () => []);
    const r = _superRowIdx(ci, preset);
    let row = _at(sp, r);
    if (row == null || typeof row !== 'object') {
      row = new Array(SUPER_TALENT_SLOTS).fill(-1);
      _put(sp, r, row, []);
    }
    const vals = rowValues(row);
    const had = vals.some(v => Number(v) === id);
    if (on && !had) {
      if (superTalentBanned(id)) throw new Error(talentName(id) + ' cannot be supered');
      const pre = _superInfo(k => S.peek(k), ci);
      if (preset === pre.activePreset && pre.presets[preset].used >= pre.slots) {
        throw new Error('preset ' + (preset + 1) + ' already uses all ' + pre.slots + ' unlocked super slots');
      }
      let slot = -1;
      for (let i = 0; i < SUPER_TALENT_SLOTS; i++) {
        const v = vals[i];
        if (v == null || !(Number(v) >= 0)) { slot = i; break; }
      }
      if (slot < 0) throw new Error('preset ' + (preset + 1) + ' super slots are full (' + SUPER_TALENT_SLOTS + ')');
      _put(row, slot, id, -1);
      const info = _superInfo(k => S.peek(k), ci);
      if (preset !== info.activePreset && info.presets[preset].used > info.slots) warn('inactive preset ' + (preset + 1) + ' uses ' + info.presets[preset].used + ' supers but only ' + info.slots + ' slots are unlocked');
      if (id >= 225 && id <= 239 && !info.rgAllowed) warn(talentName(id) + ' needs Royal Armory upgrade 56 to be supered');
    } else if (!on && had) {
      vals.forEach((v, i) => { if (Number(v) === id) _put(row, i, -1); });
    }
    _change(out, ci, 'Talents', talentName(id) + ' super (preset ' + (preset + 1) + ')', had ? 'on' : 'off', on ? 'on' : 'off', 'superTalent:' + ci + ':' + id + ':' + preset);
  },

  talent(S, p, ci, out) {
    const id = String(Number(p.id));
    const sl = S.get('SL_' + ci, () => ({}));
    const prev = _at(sl, id);
    if (p.level !== undefined) {
      sl[id] = _typed(prev, Number(p.level) || 0);
      _change(out, ci, 'Talents', talentName(id), _fmtVal(Number(prev) || 0), _fmtVal(Number(p.level) || 0), 'talent:' + ci + ':' + id);
    }
    if (p.max !== undefined) {
      const sm = S.get('SM_' + ci, () => ({}));
      const pm = _at(sm, id);
      sm[id] = _typed(pm, Number(p.max) || 0);
      _change(out, ci, 'Talents', talentName(id) + ' (max)', _fmtVal(Number(pm) || 0), _fmtVal(Number(p.max) || 0), 'talentMax:' + ci + ':' + id);
    }
  },

  starSigns(S, p, ci, out, warn) {
    const key = 'PVtStarSign_' + ci;
    const prev = S.get(key);
    const ids = (p.ids || []).map(v => (v === '_' || v === '' || v == null || Number(v) < 0) ? '_' : String(Number(v)));
    const prevIds = String(prev || '').split(',').filter(x => x !== '');
    if (prevIds.length && ids.length !== prevIds.length) warn('sign list length changes from ' + prevIds.length + ' to ' + ids.length + ' slots');
    const unlocked = new Set(readStarSignUnlocks(S.peek('StarSg') == null ? {} : { StarSg: S.peek('StarSg') }).filter(u => u.unlocked).map(u => u.index));
    const seen = new Set();
    ids.forEach(v => {
      if (v === '_') return;
      const n = Number(v);
      if (seen.has(n)) warn(starSignName(v) + ' is equipped more than once');
      seen.add(n);
      if (n === 33 || n === 43 || n === 79) warn(starSignName(v) + ' cannot be equipped through the star sign menu');
      else if (!unlocked.has(n)) warn(starSignName(v) + ' is not unlocked');
    });
    const value = ids.length ? ids.join(',') + ',' : '';
    S.set(key, value);
    const fmt = s => String(s || '').split(',').filter(x => x !== '').map(starSignName).join(', ') || '(none)';
    _change(out, ci, 'Star signs', 'Equipped signs', fmt(prev), fmt(value), 'starSigns:' + ci);
  },

  prayers(S, p, ci, out) {
    const key = 'Prayers_' + ci;
    const prevArr = rowValues(S.get(key, () => []));
    const len = Math.max(prevArr.length, (p.ids || []).length);
    const next = [];
    for (let i = 0; i < len; i++) {
      const v = p.ids && p.ids[i] != null && p.ids[i] !== '' ? Number(p.ids[i]) : -1;
      next.push(Number.isFinite(v) ? v : -1);
    }
    S.set(key, next);
    const fmt = a => a.filter(v => Number(v) >= 0).map(prayerName).join(', ') || '(none)';
    _change(out, ci, 'Prayers', 'Equipped prayers', fmt(prevArr), fmt(next), 'prayers:' + ci);
  },

  bubbles(S, p, ci, out) {
    const all = S.get('CauldronBubbles', () => []);
    const prev = rowValues(_at(all, ci)).slice();
    const len = Math.max(3, prev.length, (p.codes || []).length);
    const next = [];
    for (let i = 0; i < len; i++) {
      const c = p.codes && p.codes[i];
      next.push(c ? String(c) : 0);
    }
    while (all.length < ci) all.push([0, 0, 0]);
    all[ci] = next;
    const fmt = a => a.filter(c => c && c !== '0').map(bubbleCodeName).join(', ') || '(none)';
    _change(out, ci, 'Alchemy', 'Equipped bubbles', fmt(prev), fmt(next), 'bubbles:' + ci);
  },

  labPosition(S, p, ci, out) {
    const lab = S.get('Lab', () => []);
    const pos = _rowRef(lab, 0, false);
    const px = _at(pos, 2 * ci), py = _at(pos, 2 * ci + 1);
    if (p.x !== undefined) _put(pos, 2 * ci, Number(p.x) || 0);
    if (p.y !== undefined) _put(pos, 2 * ci + 1, Number(p.y) || 0);
    _change(out, ci, 'Lab', 'Lab position', _fmtVal(px) + ', ' + _fmtVal(py), _fmtVal(_at(pos, 2 * ci)) + ', ' + _fmtVal(_at(pos, 2 * ci + 1)), 'labPosition:' + ci);
  },

  labChip(S, p, ci, out) {
    const lab = S.get('Lab', () => []);
    const row = _rowRef(lab, 1 + ci, false);
    const slot = Number(p.slot) || 0;
    const prev = _at(row, slot);
    const chip = p.chip == null || p.chip === '' ? -1 : Number(p.chip);
    _put(row, slot, chip, -1);
    _change(out, ci, 'Lab', 'Chip slot ' + (slot + 1), chipName(prev), chipName(chip), 'labChip:' + ci + ':' + slot);
  },

  statue(S, p, ci, out) {
    const idx = Number(p.idx) || 0;
    const name = entityName('Statue', idx) || ('Statue ' + idx);
    if (p.level !== undefined) {
      const n = characterCount(S.raw);
      let before;
      for (let c = 0; c < Math.max(n, 1); c++) {
        const key = 'StatueLevels_' + c;
        if (!S.has(key)) continue;
        const arr = S.get(key);
        let row = _at(arr, idx);
        if (row == null) { row = [0, 0]; _put(arr, idx, row, [0, 0]); }
        if (before === undefined) before = _at(row, 0);
        _put(row, 0, Number(p.level) || 0);
      }
      _change(out, null, 'Statues', name + ' level', _fmtVal(Number(before) || 0), _fmtVal(Number(p.level) || 0), 'statue:' + idx);
    }
    if (p.tier !== undefined) {
      const g = S.get('StuG', () => []);
      const prev = _at(g, idx);
      _put(g, idx, Number(p.tier) || 0, 0);
      _change(out, null, 'Statues', name + ' tier', _fmtVal(Number(prev) || 0), _fmtVal(Number(p.tier) || 0), 'statueTier:' + idx);
    }
  },

  buffs(S, p, ci, out) {
    const key = 'BuffsActive_' + ci;
    const prev = rowValues(S.get(key, () => []));
    const asLen = !prev.length || _isLenObj(prev[0]);
    const next = (p.list || []).map(entry => {
      const r = rowValues(entry).map(Number);
      if (!asLen) return r;
      const o = {};
      r.forEach((v, i) => { o[i] = v; });
      o.length = r.length;
      return o;
    });
    S.set(key, next);
    const fmt = a => a.map(b => talentName(rowValues(b)[0])).join(', ') || '(none)';
    _change(out, ci, 'Buffs', 'Active buffs', fmt(prev), fmt(next), 'buffs:' + ci);
  },

  attackLoadout(S, p, ci, out) {
    const key = 'AttackLoadout_' + ci;
    const rows = S.get(key, () => []);
    const r = Number(p.row) || 0, slot = Number(p.slot) || 0;
    let row = _at(rows, r);
    if (row == null) { row = ['Null', 'Null', 'Null', 'Null', 'Null', 'Null']; _put(rows, r, row, ['Null', 'Null', 'Null', 'Null', 'Null', 'Null']); }
    const prev = _at(row, slot);
    const v = p.talent == null || p.talent === '' || p.talent === 'Null' ? 'Null' : Number(p.talent);
    row[slot] = v;
    const fmt = id => id === 'Null' || id == null ? '(empty)' : talentName(id);
    _change(out, ci, 'Attack loadout', 'Bar ' + (r + 1) + ' slot ' + (slot + 1), fmt(prev), fmt(v), 'attackLoadout:' + ci + ':' + r + ':' + slot);
  },

  companion(S, p, ci, out) {
    const comp = S.get('companion', () => ({ l: [] }));
    let entries = _companionEntries(comp).slice();
    const id = Number(p.id);
    const idx = entries.findIndex(e => Number(String(e).split(',')[0]) === id);
    const before = idx >= 0 ? (Number(String(entries[idx]).split(',')[4]) >= 1 ? 'owned (Pet+)' : 'owned') : 'not owned';
    if (p.owned === false) {
      entries = entries.filter(e => Number(String(e).split(',')[0]) !== id);
    } else {
      const f = idx >= 0 ? String(entries[idx]).split(',') : [String(id), '1', '0', '0', '0'];
      while (f.length < 5) f.push('0');
      if (p.enhanced !== undefined) f[4] = p.enhanced ? '1' : '0';
      if (p.level !== undefined) f[3] = String(Number(p.level) || 0);
      if (idx >= 0) entries[idx] = f.join(','); else entries.push(f.join(','));
    }
    comp.l = entries;
    const nidx = entries.findIndex(e => Number(String(e).split(',')[0]) === id);
    const after = nidx >= 0 ? (Number(String(entries[nidx]).split(',')[4]) >= 1 ? 'owned (Pet+)' : 'owned') : 'not owned';
    _change(out, null, 'Companions', companionName(id), before, after, 'companion:' + id);
  },

  vote(S, p, ci, out) {
    const sv = S.get('serverVars', () => ({}));
    const cats = Array.isArray(sv.voteCategories) ? sv.voteCategories : (sv.voteCategories = []);
    const prev = cats[0];
    cats[0] = Number(p.idx) || 0;
    _change(out, null, 'Server', 'Winning vote bonus', _fmtVal(prev), _fmtVal(cats[0]), 'vote');
  },

  printerFilter(S, p, ci, out) {
    const slot = Number(p.slot);
    if (!Number.isInteger(slot) || slot < 0 || slot >= PRINTER_FILTER_MAX) throw new Error('filter slot must be 0..' + (PRINTER_FILTER_MAX - 1));
    const px = S.get('PrinterXtra', () => []);
    const prev = _at(px, PRINTER_FILTER_OFFSET + slot);
    const item = p.item == null || p.item === '' ? 'Blank' : String(p.item);
    _put(px, PRINTER_FILTER_OFFSET + slot, item, 'Blank');
    _change(out, null, 'Item filter', 'Filter slot ' + (slot + 1), itemName(prev), itemName(item), 'printerFilter:' + slot);
  },

  charClass(S, p, ci, out) {
    const key = 'CharacterClass_' + ci;
    const prev = S.get(key);
    S.set(key, _typed(prev, Number(p.value) || 0));
    _change(out, ci, 'Character', 'Class', className(prev), className(p.value), 'charClass:' + ci);
  },

  divinity(S, p, ci, out) {
    const d = S.get('Divinity', () => []);
    if (p.god !== undefined) {
      const prev = _at(d, ci + 12);
      _put(d, ci + 12, Number(p.god), 0);
      _change(out, ci, 'Divinity', 'Linked god', godName(prev), godName(p.god), 'divinityGod:' + ci);
    }
    if (p.style !== undefined) {
      const prev = _at(d, ci);
      _put(d, ci, Number(p.style) || 0, 0);
      _change(out, ci, 'Divinity', 'Meditation style', _fmtVal(prev), _fmtVal(Number(p.style) || 0), 'divinityStyle:' + ci);
    }
  },

  table(S, p, ci, out) {
    const t = _TABLE_BY_ID[p.table];
    if (!t) throw new Error('unknown table ' + p.table);
    const key = _tableKey(t, ci);
    const index = Number(p.index);
    if (!Number.isInteger(index) || index < 0) throw new Error('bad table index');
    if (t.indices && !t.indices.includes(index)) throw new Error('index ' + index + ' is not part of table ' + t.id);
    if (_tableKind(t, index) === 'readonly') throw new Error(t.label + ' is read-only here');
    const val = S.get(key, () => []);
    const cell = _cellPath(t, index);
    let c = val;
    for (let i = 0; i < cell.length - 1; i++) {
      let next = _at(c, cell[i]);
      if (next == null) { next = []; _put(c, cell[i], next, []); }
      c = next;
    }
    const last = cell[cell.length - 1];
    const prev = _at(c, last);
    const want = _tableKind(t, index) === 'flag' ? (Number(p.value) ? 1 : 0) : Number(p.value);
    const before = _decodeCell(t, index, prev);
    // Keep the exact stored value when it already decodes to the requested one
    // (partial achievement progress, shiny EXP inside the same level).
    const stored = prev !== undefined && String(before) === String(want) ? prev : _encodeCell(t, index, want, prev);
    _put(c, last, stored, 0);
    if (t.mirrorMax) {
      const m = S.get(t.mirrorMax);
      if (m !== undefined) {
        let mc = m;
        for (let i = 0; i < cell.length - 1 && mc != null; i++) mc = _at(mc, cell[i]);
        if (mc != null && (Number(_at(mc, last)) || 0) < Number(stored)) _put(mc, last, Number(stored), 0);
      }
    }
    _change(out, t.perChar ? ci : null, t.label, t.name(index) || ('unnamed entry ' + index), tableValueLabel(t.id, index, before),
      tableValueLabel(t.id, index, want), 'table:' + t.id + ':' + (t.perChar ? ci : '') + ':' + index);
  },

  // Star sign unlocks (StarSg): `{ name, unlocked }` adds or removes the sign key.
  starSignUnlock(S, p, ci, out) {
    const name = String(p.name || '');
    if (!name) throw new Error('starSignUnlock needs a sign name');
    const set = S.get('StarSg', () => ({}));
    const had = _hasOwn(set, name);
    if (p.unlocked) { if (!had) set[name] = 1; } else delete set[name];
    let idx = -1;
    for (let i = 0; i < StarSigns.length; i++) if (StarSigns[i] && StarSigns[i][0] === name) { idx = i; break; }
    _change(out, null, 'Star sign unlocks', idx >= 0 ? starSignName(idx) : cleanName(name), had ? 'Unlocked' : 'Locked', p.unlocked ? 'Unlocked' : 'Locked', 'starSignUnlock:' + name);
  },

  raw(S, p, ci, out) {
    const key = String(p.key || '').replace(/\{ci\}/g, String(ci));
    if (!key) throw new Error('raw patch needs a key');
    const path = Array.isArray(p.path) ? p.path : (p.path == null || p.path === '' ? [] : String(p.path).split('.'));
    const before = _walk(readRawKey(S.raw, key), path);
    if (!path.length) {
      S.set(key, p.delete ? undefined : _clone(p.value));
    } else {
      let root = S.get(key, () => (/^\d+$/.test(String(path[0])) ? [] : {}));
      let c = root;
      for (let i = 0; i < path.length - 1; i++) {
        let next = _at(c, path[i]);
        if (next == null || typeof next !== 'object') {
          next = /^\d+$/.test(String(path[i + 1])) ? [] : {};
          c[path[i]] = next;
        }
        c = next;
      }
      const last = path[path.length - 1];
      if (p.delete) { if (Array.isArray(c)) c.splice(Number(last), 1); else delete c[last]; }
      else _put(c, last, _clone(p.value));
      S.set(key, root);
    }
    _change(out, null, 'Raw', key + (path.length ? '.' + path.join('.') : ''), _fmtVal(before), p.delete ? '(deleted)' : _fmtVal(p.value), 'raw:' + key + ':' + path.join('.'));
  },

  // Research shape layout: moves [[shape, x, y, rot], ...] are replayed as in-game
  // drops (Research[6]) and Research[1] is resettled with the game's ownership pass.
  researchLayout(S, p, ci, out) {
    const moves = Array.isArray(p.moves) ? p.moves : [];
    const R = S.get('Research', () => []);
    const r0 = _rowRef(R, 0, false), r1 = _rowRef(R, 1, false);
    const r6 = _rowRef(R, 6, _isLenObj(r0));
    const levels = rowValues(r0).map(v => Number(v) || 0);
    const before = [];
    for (let n = 0; n < 240; n++) { const v = _at(r1, n); before.push(v == null || v === '' ? -1 : (Number(v) || 0)); }
    const owned = p.owned != null && p.owned !== ''
      ? Math.max(0, Math.min(RESEARCH_SHAPE_MAX, Math.round(Number(p.owned) || 0)))
      : _researchShapesOwnedVia(k => S.get(k), S.raw);
    const r6v = rowValues(r6);
    const positions = parseResearchShapePositions(r6v, Math.max(Math.floor(r6v.length / 4), owned));
    const res = applyResearchShapeMoves({ levels, overlay: before, positions, owned }, moves, { clear: !!p.clear });
    const moved = new Set(res.applied);
    moved.forEach(s => {
      const prev = positions[s], next = res.positions[s];
      for (let k = 0; k < 4; k++) {
        const prevV = _at(r6, 4 * s + k);
        const v = k === 0 ? next.x : k === 1 ? next.y : k === 2 ? next.rot : (prevV == null ? 0 : prevV);
        _put(r6, 4 * s + k, v, 0);
      }
      const txt = q => q ? q.x + ', ' + q.y + ' @ ' + q.rot + '\u00b0' : '(none)';
      _change(out, null, 'Research shapes', researchShapeName(s) + ' position', txt(prev), txt(next), 'researchShape:' + s);
    });
    for (let n = 0; n < 240; n++) {
      const next = res.overlay[n];
      if (next === before[n]) continue;
      _put(r1, n, next, -1);
      const nm = v => v < 0 ? 'None' : researchShapeName(v);
      _change(out, null, 'Research shape overlay', 'Node ' + n, nm(before[n]), nm(next), 'table:researchShapes::' + n);
    }
    if (res.skipped.length) {
      _change(out, null, 'Research shapes', 'Unowned shapes ignored', '', res.skipped.map(s => researchShapeName(s)).join(', '), 'researchShapeSkipped');
    }
  },
};

export const PATCH_SYSTEMS = Object.keys(HANDLERS);

// Per-character systems (patch.ci or setup.charIdx selects the character).
const PER_CHAR = { equipment: 1, food: 1, foodSlots: 1, card: 1, cardSet: 1, talent: 1, superTalent: 1, starSigns: 1, prayers: 1,
  bubbles: 1, labPosition: 1, labChip: 1, buffs: 1, attackLoadout: 1, charClass: 1, divinity: 1 };

/** Stable identity for upserting a patch (same target → same key). */
export function patchKey(p, defaultCi) {
  const ci = p.ci != null ? Number(p.ci) : (Number(defaultCi) || 0);
  switch (p.system) {
    case 'equipment': return 'equipment:' + ci + ':' + p.row + ':' + p.slot;
    case 'food': return 'food:' + ci + ':' + p.slot;
    case 'obol': return 'obol:' + (p.scope === 'family' ? 'f' : ci) + ':' + p.slot;
    case 'card': return 'card:' + ci + ':' + p.slot;
    case 'labChip': return 'labChip:' + ci + ':' + p.slot;
    case 'statue': return 'statue:' + p.idx + ':' + (p.level !== undefined ? 'l' : '') + (p.tier !== undefined ? 't' : '');
    case 'talent': return 'talent:' + ci + ':' + p.id;
    case 'superTalent': return 'superTalent:' + ci + ':' + p.id + ':' + (Number(p.preset) ? 1 : 0);
    case 'cardLevel': return 'cardLevel:' + p.key;
    case 'attackLoadout': return 'attackLoadout:' + ci + ':' + p.row + ':' + p.slot;
    case 'companion': return 'companion:' + p.id;
    case 'vote': return 'vote';
    case 'starSignUnlock': return 'starSignUnlock:' + p.name;
    case 'printerFilter': return 'printerFilter:' + p.slot;
    case 'divinity': return 'divinity:' + ci + ':' + (p.god !== undefined ? 'g' : '') + (p.style !== undefined ? 's' : '');
    case 'table': {
      const t = _TABLE_BY_ID[p.table];
      return 'table:' + p.table + ':' + (t && t.perChar ? ci : '') + ':' + p.index;
    }
    case 'raw': return 'raw:' + p.key + ':' + (Array.isArray(p.path) ? p.path.join('.') : (p.path || ''));
    default: return p.system + ':' + (PER_CHAR[p.system] ? ci : '');
  }
}

/** Returns a new setup with `patch` replacing any patch targeting the same thing. */
export function upsertPatch(setup, patch) {
  const s = normalizeCombatSetup(setup);
  const k = patchKey(patch, s.charIdx);
  const patches = s.patches.filter(p => patchKey(p, s.charIdx) !== k);
  patches.push(patch);
  return Object.assign({}, s, { patches });
}

export function removePatch(setup, key) {
  const s = normalizeCombatSetup(setup);
  return Object.assign({}, s, { patches: s.patches.filter(p => patchKey(p, s.charIdx) !== key) });
}

export function emptyCombatSetup(charIdx, label) {
  return { version: COMBAT_SETUP_VERSION, charIdx: Number(charIdx) || 0, label: label || '', patches: [] };
}

export function normalizeCombatSetup(setup) {
  const s = setup && typeof setup === 'object' ? setup : {};
  return {
    version: COMBAT_SETUP_VERSION,
    charIdx: Number(s.charIdx) || 0,
    label: typeof s.label === 'string' ? s.label : '',
    patches: Array.isArray(s.patches) ? s.patches.filter(p => p && typeof p === 'object' && HANDLERS[p.system]) : [],
    ...(_hasOwn(s, 'toggles') ? { toggles: normalizeToggleState(s.toggles) } : {}),
    ...(_hasOwn(s, 'termOverrides') ? { termOverrides: normalizeTermOverrides(s.termOverrides) } : {}),
  };
}

/**
 * Apply a setup and return `{ raw, changes, warnings }`. The input raw save is
 * never mutated; only touched keys are cloned and re-encoded.
 */
export function applyCombatSetupDetailed(raw, setup) {
  const s = normalizeCombatSetup(setup);
  if (!raw || typeof raw !== 'object') return { raw, changes: [], warnings: ['no raw save'] };
  if (!s.patches.length) return { raw: Object.assign({}, raw, saveRoot(raw) !== raw ? { data: Object.assign({}, saveRoot(raw)) } : {}), changes: [], warnings: [] };
  const S = _session(raw);
  const changes = [], warnings = [];
  s.patches.forEach((p, i) => {
    const start = changes.length;
    const warn = msg => warnings.push('Patch ' + (i + 1) + ' (' + p.system + '): ' + msg);
    try {
      HANDLERS[p.system](S, p, _ci(p, s), changes, warn);
    } catch (e) {
      warn(e && e.message || e);
    }
    for (let j = start; j < changes.length; j++) changes[j].patchIndex = i;
  });
  if (s.patches.some(p => p.system === 'cardSet' || p.system === 'cardLevel')) _refreshCardSetValues(S, changes);
  return { raw: S.finish(), changes, warnings };
}

// Re-derive every character's equipped card-set value from the patched card levels,
// as the game does when a set is equipped or the card menu is opened.
function _refreshCardSetValues(S, changes) {
  const ctx = _cardCtx(k => S.peek(k));
  const n = characterCount(S.raw);
  for (let ci = 0; ci < n; ci++) {
    const cs = S.peek('CSetEq_' + ci);
    const key = cs && typeof cs === 'object' ? Object.keys(cs)[0] : null;
    if (!key) continue;
    const setIdx = CardSets.findIndex(r => r && r[0] === key);
    if (setIdx < 0 || !CardStuff[setIdx]) continue;
    const value = _cardSetValueFrom(ctx, setIdx);
    if (Number(cs[key]) === value) continue;
    const label = cleanName(key.replace(/[{}%]/g, ''));
    S.set('CSetEq_' + ci, { [key]: value });
    _change(changes, ci, 'Cards', 'Card set value', label + ' ' + cs[key], label + ' ' + value, 'cardSetValue:' + ci);
  }
}

/** Apply a setup to a raw save; returns a new raw save (input untouched). */
export function applyCombatSetup(raw, setup) {
  return applyCombatSetupDetailed(raw, setup).raw;
}

/**
 * Human-readable change list vs the save. Repeated edits to one target
 * collapse to first-before → last-after; no-op edits are dropped.
 */
export function diffCombatSetup(raw, setup) {
  const res = applyCombatSetupDetailed(raw, setup);
  const byKey = new Map();
  res.changes.forEach(c => {
    const prev = byKey.get(c.key);
    if (prev) { prev.after = c.after; prev.patchIndex = c.patchIndex; }
    else byKey.set(c.key, Object.assign({}, c));
  });
  const lines = [];
  const entries = [];
  byKey.forEach(c => {
    if (c.before === c.after) return;
    const who = c.ci == null ? 'Account' : characterName(raw, c.ci);
    entries.push(c);
    lines.push(who + ' · ' + c.system + ' · ' + c.target + ': ' + c.before + ' → ' + c.after);
  });
  res.warnings.forEach(w => lines.push('Warning: ' + w));
  return { changed: entries.length, lines, changes: entries, warnings: res.warnings };
}

// ---------------------------------------------------------------------------
// Copy from character
// ---------------------------------------------------------------------------

export const COPYABLE_SYSTEMS = ['equipment', 'food', 'obols', 'cards', 'talents', 'starSigns', 'prayers', 'bubbles', 'labChips', 'postOffice', 'attackLoadout', 'buffs'];

/** Structured patches that make character `toCi` match `fromCi` for the listed systems. */
export function copyCharacterPatches(raw, fromCi, toCi, systems) {
  const list = systems && systems.length ? systems : COPYABLE_SYSTEMS;
  const patches = [];
  const has = s => list.indexOf(s) >= 0;
  if (has('equipment')) {
    const a = readEquipment(raw, fromCi), b = readEquipment(raw, toCi);
    a.armor.concat(a.tools).forEach(src => {
      const dst = (src.row === 0 ? b.armor : b.tools)[src.slot];
      if (dst && dst.item === src.item && JSON.stringify(dst.stats) === JSON.stringify(src.stats)) return;
      patches.push({ system: 'equipment', ci: toCi, row: src.row, slot: src.slot, item: src.item, qty: src.qty, stats: src.stats ? _clone(src.stats) : null });
    });
  }
  if (has('food')) {
    const a = readEquipment(raw, fromCi), b = readEquipment(raw, toCi);
    if (a.foodSlots !== b.foodSlots) patches.push({ system: 'foodSlots', ci: toCi, value: a.foodSlots });
    a.food.forEach(src => {
      const dst = b.food[src.slot];
      if (dst && dst.item === src.item && Number(dst.qty) === Number(src.qty)) return;
      patches.push({ system: 'food', ci: toCi, slot: src.slot, item: src.item, qty: Number(src.qty) || 0 });
    });
  }
  if (has('obols')) {
    const a = readObols(raw, fromCi).personal, b = readObols(raw, toCi).personal;
    a.forEach(src => {
      const dst = b[src.slot];
      if (dst && dst.item === src.item && JSON.stringify(dst.stats) === JSON.stringify(src.stats)) return;
      patches.push({ system: 'obol', scope: 'personal', ci: toCi, slot: src.slot, item: src.item, stats: src.stats ? _clone(src.stats) : null });
    });
  }
  if (has('cards')) {
    const a = readCards(raw, fromCi), b = readCards(raw, toCi);
    a.equipped.forEach(src => {
      const dst = b.equipped[src.slot];
      if (!dst || dst.key !== src.key) patches.push({ system: 'card', ci: toCi, slot: src.slot, key: src.key });
    });
    const ak = a.set ? a.set.key : '', bk = b.set ? b.set.key : '';
    if (ak !== bk) patches.push({ system: 'cardSet', ci: toCi, set: a.set ? a.set.set : -1 });
  }
  if (has('talents')) {
    const a = readTalents(raw, fromCi), b = new Map(readTalents(raw, toCi).map(t => [t.id, t]));
    a.forEach(t => {
      const d = b.get(t.id);
      if (!d || d.level !== t.level || d.max !== t.max) patches.push({ system: 'talent', ci: toCi, id: t.id, level: t.level, max: t.max });
    });
    const sa = readSuperTalents(raw, fromCi), sb = readSuperTalents(raw, toCi);
    [0, 1].forEach(preset => {
      const want = new Set(sa.presets[preset].ids), have = new Set(sb.presets[preset].ids);
      have.forEach(id => { if (!want.has(id)) patches.push({ system: 'superTalent', ci: toCi, id, preset, on: false }); });
      want.forEach(id => { if (!have.has(id)) patches.push({ system: 'superTalent', ci: toCi, id, preset, on: true }); });
    });
  }
  if (has('starSigns')) {
    const a = readStarSigns(raw, fromCi).map(s => s.id), b = readStarSigns(raw, toCi).map(s => s.id);
    if (a.join() !== b.join()) patches.push({ system: 'starSigns', ci: toCi, ids: a });
  }
  if (has('prayers')) {
    const a = readPrayers(raw, fromCi).map(s => s.id), b = readPrayers(raw, toCi).map(s => s.id);
    if (a.join() !== b.join()) patches.push({ system: 'prayers', ci: toCi, ids: a });
  }
  if (has('bubbles')) {
    const a = readBubbles(raw, fromCi).map(s => s.code), b = readBubbles(raw, toCi).map(s => s.code);
    if (a.join() !== b.join()) patches.push({ system: 'bubbles', ci: toCi, codes: a });
  }
  if (has('labChips')) {
    const a = readLab(raw, fromCi).chips, b = readLab(raw, toCi).chips;
    a.forEach(src => { if (!b[src.slot] || b[src.slot].id !== src.id) patches.push({ system: 'labChip', ci: toCi, slot: src.slot, chip: src.id }); });
  }
  if (has('postOffice')) {
    const a = readTable(raw, 'postOffice', fromCi), b = new Map(readTable(raw, 'postOffice', toCi).map(r => [r.index, r]));
    a.forEach(r => { if (!b.has(r.index) || Number(b.get(r.index).value) !== Number(r.value)) patches.push({ system: 'table', table: 'postOffice', ci: toCi, index: r.index, value: Number(r.value) || 0 }); });
  }
  if (has('attackLoadout')) {
    const a = readAttackLoadout(raw, fromCi), b = readAttackLoadout(raw, toCi);
    a.forEach((row, r) => row.forEach(src => {
      const dst = b[r] && b[r][src.slot];
      if (!dst || String(dst.id) !== String(src.id)) patches.push({ system: 'attackLoadout', ci: toCi, row: r, slot: src.slot, talent: src.id });
    }));
  }
  if (has('buffs')) {
    const a = readBuffs(raw, fromCi), b = readBuffs(raw, toCi);
    if (JSON.stringify(a) !== JSON.stringify(b)) patches.push({ system: 'buffs', ci: toCi, list: a.map(x => [x.talent].concat(x.values)) });
  }
  return patches;
}

// ---------------------------------------------------------------------------
// Coverage report: every save key the combat sim consumes and how it is editable
// ---------------------------------------------------------------------------

export const COMBAT_SETUP_COVERAGE = [
  // Structured per-character editors
  { key: 'EquipOrder_X / EquipQTY_X', editor: 'structured', system: 'equipment, food' },
  { key: 'EMm0_X / EMm1_X', editor: 'structured', system: 'equipment (upgrade stats)' },
  { key: 'FoodSlO_X', editor: 'structured', system: 'foodSlots' },
  { key: 'ObolEqO0_X / ObolEqMAP_X', editor: 'structured', system: 'obol (personal)' },
  { key: 'ObolEqO1 / ObolEqMAPz1', editor: 'structured', system: 'obol (family)' },
  { key: 'CardEquip_X', editor: 'structured', system: 'card' },
  { key: 'CSetEq_X', editor: 'structured', system: 'cardSet (value derived from card levels)' },
  { key: 'SL_X / SM_X', editor: 'structured', system: 'talent' },
  { key: 'Spelunk[20+X] / Spelunk[32+X]', editor: 'structured', system: 'superTalent (preset 1 / preset 2)' },
  { key: 'PlayerStuff_X[1]', editor: 'read-only', system: 'active talent preset (shown with superTalent)' },
  { key: 'PVtStarSign_X', editor: 'structured', system: 'starSigns' },
  { key: 'Prayers_X', editor: 'structured', system: 'prayers' },
  { key: 'CauldronBubbles', editor: 'structured', system: 'bubbles (equipped)' },
  { key: 'Lab[0] / Lab[1+X]', editor: 'structured', system: 'labPosition, labChip' },
  { key: 'BuffsActive_X', editor: 'structured', system: 'buffs' },
  { key: 'AttackLoadout_X', editor: 'structured', system: 'attackLoadout' },
  { key: 'CharacterClass_X', editor: 'structured', system: 'charClass' },
  { key: 'Divinity[X], Divinity[X+12]', editor: 'structured', system: 'divinity (style, linked god)' },
  { key: 'Lv0_X', editor: 'table', system: 'skillLevels' },
  { key: 'POu_X', editor: 'table', system: 'postOffice' },
  // Structured account editors
  { key: 'StatueLevels_X (all characters) / StuG', editor: 'structured', system: 'statue' },
  { key: 'companion.l (wrapper)', editor: 'structured', system: 'companion' },
  { key: 'serverVars.voteCategories[0]', editor: 'structured', system: 'vote' },
  { key: 'PrinterXtra[120..263]', editor: 'structured', system: 'printerFilter (item filter)' },
  { key: 'Cards0', editor: 'structured', system: 'cardLevel (card level → minimal card count)' },
  { key: 'StampLv (+StampLvM max)', editor: 'table', system: 'stampsA/B/C' },
  { key: 'CauldronInfo[0..3]', editor: 'table', system: 'bubbles0..3 (levels)' },
  { key: 'CauldronInfo[4]', editor: 'table', system: 'vials' },
  { key: 'CauldronP2W[4]', editor: 'table', system: 'sigils' },
  { key: 'PrayOwned', editor: 'table', system: 'prayerLevels' },
  { key: 'Meals[0]', editor: 'table', system: 'meals' },
  { key: 'ArcadeUpg', editor: 'table', system: 'arcade' },
  { key: 'Shrine[i][0] / Shrine[i][3]', editor: 'table', system: 'shrineMaps, shrineLevels' },
  { key: 'TotemInfo[0]', editor: 'table', system: 'totems' },
  { key: 'SaltLick', editor: 'table', system: 'saltLick' },
  { key: 'Tower', editor: 'table', system: 'tower' },
  { key: 'BribeStatus', editor: 'table', system: 'bribes (flags)' },
  { key: 'Guild[0]', editor: 'table', system: 'guild' },
  { key: 'GemItemsPurchased', editor: 'table', system: 'gemShop' },
  { key: 'UpgVault', editor: 'table', system: 'vault' },
  { key: 'Atoms', editor: 'table', system: 'atoms' },
  { key: 'Dream', editor: 'table', system: 'dream' },
  { key: 'Divinity[28+]', editor: 'table', system: 'divinityBless' },
  { key: 'Grimoire', editor: 'table', system: 'grimoire' },
  { key: 'Arcane', editor: 'table', system: 'arcane' },
  { key: 'Lab[14]', editor: 'table', system: 'labJewels (flags)' },
  { key: 'Research[0]', editor: 'table', system: 'researchGrid' },
  { key: 'Research[1]', editor: 'read-only', system: 'researchShapes (edit through researchLayout)' },
  { key: 'Research[6] + Research[1] (shape layout)', editor: 'structured', system: 'researchLayout' },
  { key: 'Breeding[22..25]', editor: 'table', system: 'shinyPets0..3 (shiny level, stored as EXP)' },
  { key: 'Sailing[3]', editor: 'table', system: 'artifacts (tier)' },
  { key: 'Summon[0]', editor: 'table', system: 'summonUpg' },
  { key: 'Research[9]', editor: 'table', system: 'stickers' },
  { key: 'FarmUpg[20+]', editor: 'table', system: 'exotics' },
  { key: 'Spelunk[5]', editor: 'table', system: 'spelunkShop' },
  { key: 'Spelunk[18]', editor: 'table', system: 'legend' },
  { key: 'RoyalG[0]', editor: 'table', system: 'royalStatues' },
  { key: 'RoyalG[2]', editor: 'table', system: 'armory' },
  { key: 'AchieveReg', editor: 'table', system: 'achievements (flags)' },
  { key: 'OptLacc[369]', editor: 'table', system: 'emperor' },
  { key: 'OptLacc[453] / OptLacc[472]', editor: 'table', system: 'meritoc (vote, ballot cast)' },
  { key: 'StarSg', editor: 'structured', system: 'starSignUnlock' },
  { key: 'OptLacc', editor: 'raw', system: 'raw (other account option flags)' },  // Raw fallback (generic { system: 'raw', key, path, value })
  ...['Exp0_X', 'PlayerStuff_X', 'KLA_X', 'AFKtarget_X', 'CurrentMap_X', 'MaxCarryCap_X', 'PVFishingToolkit_X', 'PVFishingSpotIndex_X',
    'InventoryOrder_X / ItemQTY_X', 'InvBagsUsed_X', 'AtkCD_X', 'NPCdialogue_X', 'QuestComplete_X', 'PTimeAway_X', 'SLpre_X', 'AttackLoadoutpre_X', 'CardPreset_X',
    'Cards1', 'Research[2..5], Research[7..18] (insight, magnifiers, Jelly)', 'Lab[13], Lab[15], Lab[16]', 'CauldronP2W[0..3]', 'Spelunk (other rows)', 'Sailing (other rows)', 'Boats', 'Captains', 'SailChests',
    'Holes', 'Sushi', 'Summon (other rows)', 'Ninja', 'Breeding (other rows)', 'Pets', 'PetsStored', 'Gaming', 'GamingSprout', 'Rift', 'Ribbon', 'FarmCrop', 'FarmPlot', 'FarmRank', 'FarmUpg[0..19]',
    'Cooking', 'Refinery', 'Compass', 'Bubba', 'KRbest', 'WeeklyBoss', 'DungUpg', 'CogO', 'CogM', 'FlagU', 'Territory', 'TaskZZ0..5', 'SSprog',
    'BundlesReceived', 'GreenStacks', 'ChestOrder / ChestQuantity', 'CYTalentPoints', 'ForgeLV', 'CookMaster', 'CurrenciesOwned', 'FamilyValuesMap', 'FamValColosseumHighscores',
    'FamValMinigameHiscores', 'MapBon', 'PrinterXtra[0..119] (printer)', 'AnvilCraftStatus', 'StampLvM', 'InvStorageUsed', 'ObolInvOr', 'ObolInvOwn', 'TimeAway', 'RoyalG (other rows)', 'RoyalMaps',
    'serverVars (EventActive, EventTimerBypass, DivCostAfter3)'].map(key => ({ key, editor: 'raw', system: 'raw' })),
];
