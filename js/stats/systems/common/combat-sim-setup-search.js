// ===== COMBAT SIM SETUP SEARCH (common) =====
// Pure local search over one character's swappable combat loadout (cards, card
// set, star signs, prayers, active-preset super talents) using the combat sim.
//
// The search never runs the sim itself. `createSetupSearch()` returns a job
// queue: the host hands `nextJobs()` to workers and feeds each result back via
// `record()`. Two job kinds exist:
//   { kind: 'fingerprint', setup }       -> worker builds sim inputs only and
//                                           returns { hash: stableHash(sim.inputs.values) }
//   { kind: 'sim', setup, seed }         -> worker runs the sim and returns its `done` message
// Equal fingerprints mean the sim receives identical inputs, so those setups
// are never simulated twice and no-op candidates are pruned without sims.
// Moves are raced on shared seeds (paired differences) with successive halving.
// Up to three significant finalists are re-measured on independent fresh seeds
// before one is accepted, and the final setup is only `improved` when it also
// beats the start (Δ > 2 SE) on a separate fresh confirmation batch.

import {
  readRawKey, rowValues, characterCount, readCards, readStarSigns, readPrayers, readTalents,
  readSuperTalents, readStarSignUnlocks, cardOptions, cardSetOptions, cardLevelFromRaw, cardSetValues,
  superTalentBanned, applyCombatSetup, normalizeCombatSetup, upsertPatch, cardName,
  starSignName, prayerName, talentName, prayerOptions,
} from './combat-sim-setup.js';
import { emptySetupCompareRow, addSetupCompareRun, setupCompareCell } from './combat-sim-setup-compare.js';
import { RANDOlist } from '../../data/game/customlists.js';

export const SETUP_SEARCH_DIMENSIONS = [
  ['cards', 'Cards'], ['cardSet', 'Card set'], ['signs', 'Star signs'], ['prayers', 'Prayers'], ['supers', 'Super talents'],
];

// ---------------------------------------------------------------------------
// Fingerprints
// ---------------------------------------------------------------------------

function _stable(v, seen) {
  if (v === null) return 'null';
  const t = typeof v;
  if (t === 'number') return Number.isNaN(v) ? '"NaN"' : (Number.isFinite(v) ? String(v) : (v > 0 ? '"Inf"' : '"-Inf"'));
  if (t === 'string') return JSON.stringify(v);
  if (t === 'boolean') return v ? 'true' : 'false';
  if (t === 'undefined') return 'u';
  if (t === 'function') return '"fn"';
  if (t === 'bigint') return '"' + v.toString() + 'n"';
  if (t !== 'object') return '"?"';
  if (seen.has(v)) return '"cycle"';
  seen.add(v);
  let out;
  if (Array.isArray(v) || ArrayBuffer.isView(v)) out = '[' + Array.prototype.map.call(v, x => _stable(x, seen)).join(',') + ']';
  else if (v instanceof Map) out = 'M{' + [...v.entries()].map(([k, x]) => _stable(k, seen) + ':' + _stable(x, seen)).sort().join(',') + '}';
  else if (v instanceof Set) out = 'S[' + [...v].map(x => _stable(x, seen)).sort().join(',') + ']';
  else out = '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + _stable(v[k], seen)).join(',') + '}';
  seen.delete(v);
  return out;
}

/** Deterministic key-order-independent hash (cyrb53) of any value. */
export function stableHash(value) {
  const str = _stable(value, new Set());
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}

// ---------------------------------------------------------------------------
// Slot counts and owned candidates
// ---------------------------------------------------------------------------

/** Source: card slots = round(4 + GemItemsPurchased[63]) (78515); min(8) only guards the 8-slot card layout. */
export function cardSlotCount(raw) {
  const gem = rowValues(readRawKey(raw, 'GemItemsPurchased'));
  return Math.min(8, Math.round(4 + (Number(gem[63]) || 0)));
}

/**
 * Source (Worship GenINFO[49]): prayer slots = number of RANDOlist[9] level
 * thresholds reached by the highest-level Wizard-tree character (classes
 * 32/34/35) + GemItemsPurchased[114].
 */
export function prayerSlotCount(raw) {
  let best = 0;
  const n = characterCount(raw);
  for (let ci = 0; ci < n; ci++) {
    const cls = Number(readRawKey(raw, 'CharacterClass_' + ci));
    if (cls !== 32 && cls !== 34 && cls !== 35) continue;
    const lv = Number(rowValues(readRawKey(raw, 'Lv0_' + ci))[0]) || 0;
    if (lv > best) best = lv;
  }
  const thr = (RANDOlist[9] || []).slice(0, 8);
  let slots = 0;
  for (let i = 0; i < thr.length; i++) if (best >= Number(thr[i])) slots = i + 1;
  const gem = rowValues(readRawKey(raw, 'GemItemsPurchased'));
  return Math.round(slots + (Number(gem[114]) || 0));
}

function _searchContext(raw, ci, startSetup) {
  const start = normalizeCombatSetup(Object.assign({}, startSetup || {}, { charIdx: ci }));
  const patched = start.patches.length ? applyCombatSetup(raw, start) : raw;
  const notes = [];
  const sup = readSuperTalents(patched, ci);
  const cardSlots = cardSlotCount(patched);
  const eq = readCards(patched, ci);
  const cards = [];
  for (let s = 0; s < cardSlots; s++) { const k = eq.equipped[s] && eq.equipped[s].key; cards.push(k && k !== 'Blank' ? k : 'B'); }
  const signsSaved = readStarSigns(patched, ci).map(s => s.id);
  if (!signsSaved.length) notes.push('Star signs: this character has no saved sign slots, so signs are not searched.');
  else notes.push('Star signs: slot count is taken from the saved list length (' + signsSaved.length + ').');
  const prayerSlots = prayerSlotCount(patched);
  const prSaved = readPrayers(patched, ci).map(p => p.id);
  const prayers = [];
  for (let s = 0; s < prayerSlots; s++) prayers.push(prSaved[s] != null && prSaved[s] >= 0 ? prSaved[s] : -1);
  const superIds = (sup.presets[sup.activePreset] || { ids: [] }).ids.slice();
  notes.push('Super talents: only this character\'s active preset (' + (sup.activePreset + 1) + ') is searched; cross-character supers are not.');
  const state = {
    cards,
    set: eq.set ? eq.set.set : -1,
    signs: signsSaved.map(v => (v === '_' ? '_' : Number(v))),
    prayers,
    supers: superIds,
  };
  const owned = rowValues(readRawKey(patched, 'PrayOwned'));
  const levels = new Map(readTalents(patched, ci).map(t => [t.id, t.level]));
  const setValues = cardSetValues(patched);
  const candidates = {
    cards: cardOptions().filter(c => cardLevelFromRaw(patched, c.key) >= 1).map(c => c.key),
    cardSet: cardSetOptions().map(s => s.set).filter(i => (setValues[i] || 0) > 0),
    signs: readStarSignUnlocks(patched).filter(u => u.unlocked && u.index !== 33 && u.index !== 43 && u.index !== 79).map(u => u.index),
    prayers: prayerOptions().filter(p => p.id >= 0 && (Number(owned[p.id]) || 0) > 0).map(p => p.id),
    supers: [...levels.keys()].filter(id => levels.get(id) > 0 && !superTalentBanned(id) && (id < 225 || id > 239 || sup.rgAllowed)),
  };
  superIds.forEach(id => { if (!candidates.supers.includes(id)) candidates.supers.push(id); });
  const slots = { cards: cardSlots, signs: state.signs.length, prayers: prayerSlots, supers: Math.max(sup.slots, superIds.length) };
  return { start, patched, state, candidates, slots, activePreset: sup.activePreset, notes };
}

/** Search space summary for the UI: slot counts, start state, owned candidate counts, notes. */
export function setupSearchSpace(raw, ci, startSetup) {
  const c = _searchContext(raw, Number(ci) || 0, startSetup);
  return {
    slots: Object.assign({ cardSet: 1 }, c.slots),
    candidates: Object.fromEntries(Object.keys(c.candidates).map(k => [k, c.candidates[k].length])),
    state: _cloneState(c.state),
    notes: c.notes.slice(),
  };
}

// ---------------------------------------------------------------------------
// State <-> setup
// ---------------------------------------------------------------------------

function _cloneState(s) {
  return { cards: s.cards.slice(), set: s.set, signs: s.signs.slice(), prayers: s.prayers.slice(), supers: s.supers.slice() };
}

const _EMPTY = { cards: 'B', signs: '_', prayers: -1 };

/** Setup = start setup + patches for every slot that differs from the start state. */
export function setupSearchStateToSetup(ctx, state) {
  let s = normalizeCombatSetup(ctx.start);
  const base = ctx.state;
  state.cards.forEach((k, slot) => { if (k !== base.cards[slot]) s = upsertPatch(s, { system: 'card', slot, key: k }); });
  if (state.set !== base.set) s = upsertPatch(s, { system: 'cardSet', set: state.set });
  if (state.signs.join(',') !== base.signs.join(',')) s = upsertPatch(s, { system: 'starSigns', ids: state.signs.slice() });
  if (state.prayers.join(',') !== base.prayers.join(',')) s = upsertPatch(s, { system: 'prayers', ids: state.prayers.slice() });
  const preset = ctx.activePreset;
  base.supers.filter(id => !state.supers.includes(id)).forEach(id => { s = upsertPatch(s, { system: 'superTalent', id, preset, on: false }); });
  state.supers.filter(id => !base.supers.includes(id)).forEach(id => { s = upsertPatch(s, { system: 'superTalent', id, preset, on: true }); });
  return s;
}

function _itemName(dim, id) {
  if (dim === 'cards') return id === 'B' ? '(empty)' : cardName(id);
  if (dim === 'signs') return id === '_' ? '(empty)' : starSignName(id);
  if (dim === 'prayers') return id < 0 ? '(empty)' : prayerName(id);
  if (dim === 'supers') return talentName(id);
  if (dim === 'cardSet') { const o = cardSetOptions().find(x => x.set === id); return o ? o.name : '(none)'; }
  return String(id);
}

/** Display rows for a search state: [{ dim, label, items: [names] }] (empty slots omitted). */
export function setupSearchStateSummary(state) {
  return SETUP_SEARCH_DIMENSIONS.map(([dim, label]) => {
    let items;
    if (dim === 'cardSet') items = state.set >= 0 ? [_itemName('cardSet', state.set)] : [];
    else items = (state[dim] || []).filter(id => dim === 'supers' || id !== _EMPTY[dim]).map(id => _itemName(dim, id));
    return { dim, label, items };
  });
}

function _slotName(dim, slot) {
  return { cards: 'Card slot ', signs: 'Star sign slot ', prayers: 'Prayer slot ' }[dim] + (slot + 1);
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

const VALIDATE_FINALISTS = 3;
const DEFAULT_MIN_GAIN = 0.001;
// A gain must be both significant (Δ > 2 SE) and practically useful: near-deterministic
// metrics have tiny SEs, so without the relative floor a +0.0001% swap would be accepted.
function _meaningful(c, minGain) {
  if (!c || c.delta == null || !(c.delta > 0) || c.se == null || !(c.delta > 2 * c.se)) return false;
  return c.deltaPct == null || c.deltaPct >= minGain;
}
function _seed(base, i) { return (base + i * 2654435761) >>> 0; }

function _pick(row, seeds) {
  const runs = {};
  seeds.forEach(s => { if (row.runs[s]) runs[s] = row.runs[s]; });
  return { runs };
}

/**
 * Create a search. opts:
 *   rawSave, charIdx, startSetup      — imported save, character, editor setup to start from
 *   dims: { cards, cardSet, signs, prayers, supers } (booleans; default all)
 *   metric: 'kills' | 'klaCredit' | 'exp' | 'coins' | 'cards' | 'item:X' | 'metric:X'
 *   seeds (n0, default 3), maxRounds (default 6), confirmSeeds (default 12), seedBase,
 *   minGain (relative floor every accepted step and the confirmation must reach; default 0.001 = 0.1%)
 * Returns { nextJobs(), record(id, result), status(), result(), done() }.
 */
export function createSetupSearch(opts) {
  opts = opts || {};
  const ci = Number(opts.charIdx) || 0;
  const ctx = _searchContext(opts.rawSave, ci, opts.startSetup);
  const cfg = {
    dims: Object.assign({ cards: true, cardSet: true, signs: true, prayers: true, supers: true }, opts.dims || {}),
    metric: opts.metric || 'kills',
    n0: Math.max(2, Math.round(Number(opts.seeds) || 3)),
    maxRounds: Math.max(1, Math.round(Number(opts.maxRounds) || 6)),
    confirmSeeds: Math.max(2, Math.round(Number(opts.confirmSeeds) || 12)),
    minGain: opts.minGain != null && Number(opts.minGain) >= 0 ? Number(opts.minGain) : DEFAULT_MIN_GAIN,
    seedBase: (Number(opts.seedBase) >>> 0) || ((Math.random() * 4294967296) >>> 0),
  };
  const st = {
    phase: 'Starting', round: 0, message: '', batchDone: 0, batchTotal: 0,
    fingerprints: 0, sims: 0, cachedSims: 0, log: [], steps: [], error: null,
  };
  const fpBySig = new Map();      // setup patches JSON -> hash
  const rows = new Map();          // hash -> compare row
  let seedCounter = 0;
  let nextId = 1;
  const freshSeeds = n => { const out = []; for (let i = 0; i < n; i++) out.push(_seed(cfg.seedBase, seedCounter++)); return out; };
  const log = msg => { st.log.push(msg); if (st.log.length > 200) st.log.shift(); };

  function* fingerprints(states) {
    const setups = states.map(s => setupSearchStateToSetup(ctx, s));
    const sigs = setups.map(s => JSON.stringify(s.patches));
    const jobs = [];
    const want = new Map();
    sigs.forEach((sig, i) => {
      if (fpBySig.has(sig) || want.has(sig)) return;
      const job = { id: nextId++, kind: 'fingerprint', setup: setups[i] };
      want.set(sig, job.id);
      jobs.push(job);
    });
    if (jobs.length) {
      const res = yield jobs;
      want.forEach((id, sig) => {
        const r = res.get(id);
        if (!r || r.error || !r.hash) throw new Error('Fingerprint failed: ' + (r && r.error || 'no result'));
        fpBySig.set(sig, r.hash);
      });
      st.fingerprints += jobs.length;
    }
    return sigs.map(sig => fpBySig.get(sig));
  }

  // Runs every (state, seed) pair not already cached by fingerprint. `items` = [{ state, fp }].
  function* simulate(items, seeds) {
    const jobs = [];
    const jobFor = new Map();
    items.forEach(it => {
      if (!rows.has(it.fp)) rows.set(it.fp, emptySetupCompareRow({ id: it.fp, label: it.fp }));
      const row = rows.get(it.fp);
      seeds.forEach(seed => {
        const k = it.fp + '|' + seed;
        if (row.runs[seed] || row.errors.length || jobFor.has(k)) { if (row.runs[seed]) st.cachedSims++; return; }
        const job = { id: nextId++, kind: 'sim', setup: setupSearchStateToSetup(ctx, it.state), seed };
        jobFor.set(k, job.id);
        jobs.push(job);
      });
    });
    if (!jobs.length) return;
    const res = yield jobs;
    jobFor.forEach((id, k) => {
      const [fp, seed] = k.split('|');
      const r = res.get(id);
      const row = rows.get(fp);
      if (!r || r.error) row.errors.push(String(r && r.error || 'no result'));
      else addSetupCompareRun(row, Number(seed), r);
    });
    st.sims += jobs.length;
  }

  const cell = (fp, baseFp, seeds) => {
    const a = rows.get(fp), b = rows.get(baseFp);
    if (!a || !b || a.errors.length) return null;
    return setupCompareCell(_pick(a, seeds), _pick(b, seeds), cfg.metric);
  };

  // Relevance: candidate alone in an otherwise-empty dimension vs the empty dimension.
  function* relevance(dim) {
    const ids = ctx.candidates[dim];
    const empty = _cloneState(ctx.state);
    if (dim === 'cards') empty.cards = empty.cards.map(() => 'B');
    else if (dim === 'signs') empty.signs = empty.signs.map(() => '_');
    else if (dim === 'prayers') empty.prayers = empty.prayers.map(() => -1);
    else if (dim === 'supers') empty.supers = [];
    else if (dim === 'cardSet') empty.set = -1;
    const probes = ids.map(id => {
      const s = _cloneState(empty);
      if (dim === 'cards') s.cards[0] = id;
      else if (dim === 'signs') s.signs[0] = id;
      else if (dim === 'prayers') s.prayers[0] = id;
      else if (dim === 'supers') s.supers = [id];
      else s.set = id;
      return s;
    });
    const fps = yield* fingerprints([empty].concat(probes));
    const baseFp = fps[0];
    const groups = new Map();   // probe fp -> [ids] (interchangeable alone)
    ids.forEach((id, i) => {
      const fp = fps[i + 1];
      if (fp === baseFp) return;
      if (!groups.has(fp)) groups.set(fp, []);
      groups.get(fp).push(id);
    });
    return [...groups.values()];
  }

  function _occupied(dim, state) {
    if (dim === 'supers') return state.supers.map((id, slot) => ({ slot, id }));
    return state[dim].map((id, slot) => ({ slot, id })).filter(x => x.id !== _EMPTY[dim]);
  }
  function _contains(dim, state, id) { return dim === 'supers' ? state.supers.includes(id) : state[dim].includes(id); }
  function _withSlot(dim, state, slot, id) {
    const s = _cloneState(state);
    if (dim === 'supers') {
      if (id == null) s.supers.splice(slot, 1);
      else if (slot >= s.supers.length) s.supers.push(id);
      else s.supers[slot] = id;
    } else s[dim][slot] = id == null ? _EMPTY[dim] : id;
    return s;
  }
  function _describe(dim, before, after, slot) {
    if (dim === 'cardSet') return 'Card set: ' + _itemName('cardSet', before.set) + ' → ' + _itemName('cardSet', after.set);
    if (dim === 'supers') {
      const rem = before.supers.filter(id => !after.supers.includes(id));
      const add = after.supers.filter(id => !before.supers.includes(id));
      return 'Super talents: ' + (rem.length ? rem.map(talentName).join(', ') : '(free slot)') + ' → ' + (add.length ? add.map(talentName).join(', ') : '(none)');
    }
    return _slotName(dim, slot) + ': ' + _itemName(dim, before[dim][slot]) + ' → ' + _itemName(dim, after[dim][slot]);
  }

  function* run() {
    const dims = SETUP_SEARCH_DIMENSIONS.map(d => d[0]).filter(d => cfg.dims[d] && (d === 'cardSet' || ctx.slots[d] > 0));
    if (!dims.length) throw new Error('No searchable dimensions for this character.');
    st.phase = 'Relevance';
    st.message = 'Fingerprinting owned candidates';
    const groups = {};
    for (const d of dims) {
      groups[d] = yield* relevance(d);
      log(_dimLabel(d) + ': ' + ctx.candidates[d].length + ' owned, ' + groups[d].length + ' distinct with an effect');
    }
    const startState = _cloneState(ctx.state);
    let inc = _cloneState(startState);
    let incFp = (yield* fingerprints([inc]))[0];
    const startFp = incFp;
    const visited = new Set([incFp]);
    let stopReason = 'Reached the round limit';

    for (let round = 1; round <= cfg.maxRounds; round++) {
      st.round = round;
      const seeds = freshSeeds(cfg.n0 * 4);
      const s1 = seeds.slice(0, cfg.n0), s2 = seeds.slice(0, cfg.n0 * 2), s3 = seeds;

      // Removal variants: identical fingerprint => slot is effectively free.
      st.phase = 'Round ' + round + ': slots';
      st.message = 'Checking which equipped items matter';
      const removals = [];
      dims.filter(d => d !== 'cardSet').forEach(d => _occupied(d, inc).forEach(o => removals.push({ dim: d, slot: o.slot, state: _withSlot(d, inc, o.slot, null) })));
      const remFps = yield* fingerprints(removals.map(r => r.state));
      removals.forEach((r, i) => { r.fp = remFps[i]; r.free = r.fp === incFp; });

      const free = {}, weakest = {};
      const needWeak = [];
      dims.filter(d => d !== 'cardSet').forEach(d => {
        const empties = d === 'supers'
          ? (inc.supers.length < ctx.slots.supers ? [inc.supers.length] : [])
          : inc[d].map((id, slot) => (id === _EMPTY[d] ? slot : -1)).filter(s => s >= 0);
        const useless = removals.filter(r => r.dim === d && r.free).map(r => r.slot);
        free[d] = empties.length ? empties[0] : (useless.length ? useless[0] : null);
        if (free[d] == null) needWeak.push(d);
      });
      const weakSims = removals.filter(r => needWeak.includes(r.dim) || ((r.dim === 'prayers' || r.dim === 'signs') && !r.free));
      if (weakSims.length) {
        st.message = 'Measuring equipped items (' + weakSims.length + ' removals)';
        yield* simulate([{ state: inc, fp: incFp }].concat(weakSims.map(r => ({ state: r.state, fp: r.fp }))), s1);
        needWeak.forEach(d => {
          let best = null;
          weakSims.filter(r => r.dim === d).forEach(r => {
            const c = cell(r.fp, incFp, s1);
            const loss = c && c.delta != null ? -c.delta : Infinity;
            if (!best || loss < best.loss) best = { slot: r.slot, loss };
          });
          weakest[d] = best ? best.slot : null;
        });
      }

      // Moves.
      st.phase = 'Round ' + round + ': moves';
      st.message = 'Building candidate swaps';
      const moves = [];
      dims.forEach(d => {
        if (d === 'cardSet') {
          (groups.cardSet || []).forEach(g => { if (!g.includes(inc.set)) { const s = _cloneState(inc); s.set = g[0]; moves.push({ dim: d, slot: 0, state: s }); } });
          return;
        }
        const target = free[d] != null ? free[d] : weakest[d];
        (groups[d] || []).forEach(g => {
          const id = g.find(x => !_contains(d, inc, x));
          if (id == null || target == null) return;
          moves.push({ dim: d, slot: target, state: _withSlot(d, inc, target, id) });
        });
        if (d === 'prayers' || d === 'signs') removals.filter(r => r.dim === d && !r.free).forEach(r => moves.push({ dim: d, slot: r.slot, state: r.state, removal: true }));
      });
      const mvFps = yield* fingerprints(moves.map(m => m.state));
      const seenFp = new Set([incFp]);
      let pool = [];
      moves.forEach((m, i) => { m.fp = mvFps[i]; if (!seenFp.has(m.fp) && !visited.has(m.fp)) { seenFp.add(m.fp); pool.push(m); } });
      log('Round ' + round + ': ' + moves.length + ' moves, ' + pool.length + ' change the sim inputs');
      if (!pool.length) { stopReason = 'No remaining swap changes the sim inputs'; break; }

      // Successive halving on shared seeds.
      const stages = [s1, s2, s3];
      for (let k = 0; k < stages.length; k++) {
        st.phase = 'Round ' + round + ': race ' + (k + 1) + '/' + stages.length;
        st.message = pool.length + ' candidates × ' + stages[k].length + ' seeds';
        yield* simulate([{ state: inc, fp: incFp }].concat(pool), stages[k]);
        pool.forEach(m => { m.cell = cell(m.fp, incFp, stages[k]); });
        pool = pool.filter(m => m.cell && m.cell.delta != null).sort((a, b) => b.cell.delta - a.cell.delta);
        if (!pool.length || pool[0].cell.delta <= 0) break;
        if (k < stages.length - 1) pool = pool.slice(0, Math.max(2, Math.ceil(pool.length / 3)));
      }
      const sig = c => _meaningful(c, cfg.minGain);
      const finalists = pool.filter(m => m.cell.n >= s3.length && sig(m.cell)).slice(0, VALIDATE_FINALISTS);
      if (!finalists.length) {
        const top = pool[0];
        stopReason = !top || top.cell.delta <= 0 ? 'No swap improved the metric'
          : top.cell.se != null && top.cell.delta > 2 * top.cell.se ? 'Best swap gained less than ' + (cfg.minGain * 100) + '%'
          : 'Best swap was not significant (Δ ≤ 2 SE)';
        log('Round ' + round + ': ' + stopReason + (top ? ' — ' + _describe(top.dim, inc, top.state, top.slot) : ''));
        break;
      }
      // Picking the best of many on the same seeds overstates its gain (winner's
      // curse), so the finalists are re-measured on independent fresh seeds.
      st.phase = 'Round ' + round + ': validate';
      st.message = finalists.length + ' finalist' + (finalists.length === 1 ? '' : 's') + ' on ' + (cfg.n0 * 4) + ' fresh seeds';
      const vs = freshSeeds(cfg.n0 * 4);
      yield* simulate([{ state: inc, fp: incFp }].concat(finalists), vs);
      finalists.forEach(m => { m.vcell = cell(m.fp, incFp, vs); });
      const passed = finalists.filter(m => m.vcell && m.vcell.n >= vs.length && sig(m.vcell)).sort((a, b) => b.vcell.delta - a.vcell.delta);
      if (!passed.length) {
        stopReason = 'The best swap did not hold up on fresh seeds';
        log('Round ' + round + ': ' + stopReason + ' — ' + finalists.map(m => _describe(m.dim, inc, m.state, m.slot)).join('; '));
        break;
      }
      const best = passed[0], bc = best.vcell;
      const step = { round, dim: best.dim, label: _describe(best.dim, inc, best.state, best.slot), delta: bc.delta, se: bc.se, deltaPct: bc.deltaPct, n: bc.n, mean: bc.baseMean + bc.delta };
      st.steps.push(step);
      log('Round ' + round + ': accepted ' + step.label);
      inc = best.state; incFp = best.fp; visited.add(incFp);
    }

    // Fresh-seed confirmation of start vs final.
    let confirm = null;
    if (incFp !== startFp) {
      st.phase = 'Confirming';
      st.message = 'Start vs final on ' + cfg.confirmSeeds + ' fresh seeds';
      const cs = freshSeeds(cfg.confirmSeeds);
      yield* simulate([{ state: startState, fp: startFp }, { state: inc, fp: incFp }], cs);
      confirm = cell(incFp, startFp, cs);
    }
    st.phase = 'Done';
    st.message = stopReason;
    const changed = incFp !== startFp;
    const confirmed = !!(confirm && confirm.n >= cfg.confirmSeeds && _meaningful(confirm, cfg.minGain));
    if (changed && !confirmed) log('Confirmation: the found setup did not beat the start on fresh seeds');
    return {
      metric: cfg.metric, stopReason, notes: ctx.notes.slice(), steps: st.steps.slice(), confirm, changed, confirmed,
      start: { state: startState, setup: setupSearchStateToSetup(ctx, startState), fp: startFp },
      final: { state: inc, setup: setupSearchStateToSetup(ctx, inc), fp: incFp },
      improved: changed && confirmed, fingerprints: st.fingerprints, sims: st.sims,
    };
  }

  // Generator driver: a batch is released once and resumes when every result arrived.
  const gen = run();
  let batch = null, ids = null, got = null, handed = false, finished = false, out = null;
  function advance(input) {
    for (;;) {
      let r;
      try { r = gen.next(input); } catch (e) { st.error = String(e && e.message || e); st.phase = 'Failed'; finished = true; batch = null; return; }
      if (r.done) { out = r.value; finished = true; batch = null; return; }
      batch = r.value; ids = new Set(batch.map(j => j.id)); got = new Map(); handed = false;
      st.batchDone = 0; st.batchTotal = batch.length;
      if (batch.length) return;
      input = got;
    }
  }
  advance(undefined);
  return {
    /** Jobs ready to dispatch (each batch is returned once). */
    nextJobs() { if (finished || !batch || handed) return []; handed = true; return batch.slice(); },
    /** Feed a worker result: { hash } for fingerprints, the `done` message (or { error }) for sims. */
    record(id, result) {
      if (!batch || !ids.has(id) || got.has(id)) return;
      got.set(id, result);
      st.batchDone = got.size;
      if (got.size === batch.length) { const g = got; batch = null; advance(g); }
    },
    status() { return Object.assign({}, st, { log: st.log.slice(), steps: st.steps.slice(), done: finished, seedBase: cfg.seedBase }); },
    result() { return out; },
    done() { return finished; },
    space: { slots: Object.assign({ cardSet: 1 }, ctx.slots), notes: ctx.notes.slice() },
  };
}

function _dimLabel(d) { const x = SETUP_SEARCH_DIMENSIONS.find(e => e[0] === d); return x ? x[1] : d; }
