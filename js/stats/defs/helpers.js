// ===== SHARED DESCRIPTOR HELPERS =====

import { gbWith } from '../../sim-math.js';
import { companionBonus } from '../data/common/companions.js';
import { buffsActiveData } from '../../save/data.js';
import { talent } from '../systems/common/talent.js';

// ===== DESCRIPTOR FACTORY =====
// Creates a validated stat descriptor object.
// Two patterns supported:
//   Pool-based:    createDescriptor({ id, name, pools: {...}, combine(pools, ctx) })
//   Direct compute: createDescriptor({ id, name, combine(ctx) })
//
// When pools is omitted or empty, combine receives ({}, ctx).
// When pools is declared, buildTree resolves sources before calling combine(pools, ctx).
var VALID_SCOPES = { character: 1, account: 1, 'character+map': 1 };

export function createDescriptor(spec) {
  if (!spec || !spec.id) throw new Error('Descriptor: id is required');
  if (!spec.name) throw new Error('Descriptor ' + spec.id + ': name is required');
  if (typeof spec.combine !== 'function') throw new Error('Descriptor ' + spec.id + ': combine must be a function');
  if (spec.scope && !VALID_SCOPES[spec.scope]) throw new Error('Descriptor ' + spec.id + ': invalid scope "' + spec.scope + '"');
  return {
    id: spec.id,
    name: spec.name,
    scope: spec.scope || 'character',
    category: spec.category || null,
    pools: spec.pools || {},
    combine: spec.combine,
  };
}

export function gridBonusFinal(S, idx) {
  return gbWith(S.gridLevels, S.shapeOverlay, idx, { abm: S.allBonusMulti });
}

export function safe(fn) {
  try {
    var args = [];
    for (var i = 1; i < arguments.length; i++) args.push(arguments[i]);
    var v = fn.apply(null, args);
    return (v !== v || v == null) ? 0 : v;
  } catch(e) { return 0; }
}

export function rval(resolver, id, ctx, args) {
  try { return resolver.resolve(id, ctx, args).val || 0; }
  catch(e) { return 0; }
}

// safeTree(fn, ...args): like safe(), but always returns {val, children}.
// Normalizes any return shape: number, {val,children}, {total,...}, {computed,...}.
export function safeTree(fn) {
  try {
    var args = [];
    for (var i = 1; i < arguments.length; i++) args.push(arguments[i]);
    var v = fn.apply(null, args);
    if (v == null || v !== v) return { val: 0, children: null };
    if (typeof v === 'object') {
      var numVal = v.val != null ? Number(v.val) :
                   v.total != null ? Number(v.total) :
                   v.computed != null ? Number(v.computed) :
                   Number(v);
      return { val: numVal || 0, children: v.children || null };
    }
    return { val: Number(v) || 0, children: null };
  } catch(e) { return { val: 0, children: null }; }
}

// GetBuffBonuses(buffId, tab): checks if buff is active for character, returns talent value.
// buffsActiveData[ci] = [ {0: buffId, 1: ..., 2: ...}, ... ]
export function getBuffBonus(buffId, tab, ci, ctx) {
  var charBuffs = buffsActiveData[ci] || [];
  for (var bi = 0; bi < charBuffs.length; bi++) {
    if (Number(charBuffs[bi][0] || charBuffs[bi]['0']) === buffId) {
      return rval(talent, buffId, ctx, tab != null ? { tab: tab } : undefined);
    }
  }
  return 0;
}

// Button_Bonuses(slotIdx): presses rotate through 9 slots in groups of 5.
// Rate per slot: [2, 3, 2, 2, 4, 5, 4, 25, 5]
// MULTI = (1 + Comp(147)/100) × (1 + Grid(125)/100)
// Result = slotHits × rate[slotIdx] × MULTI
var BUTTON_RATES = [2, 3, 2, 2, 4, 5, 4, 25, 5];
export function computeButtonBonus(slotIdx, saveData) {
  var presses = Number(saveData.olaData[594]) || 0;
  if (presses <= 0) return 0;
  var fullCycles = Math.floor(presses / 45);
  var rem = presses % 45;
  var hits = fullCycles * 5 + Math.max(0, Math.min(5, rem - 5 * slotIdx));
  var comp147 = saveData.companionIds.has(147) ? companionBonus(147) : 0;
  var grid125 = gridBonusFinal(saveData, 125);
  var multi = (1 + comp147 / 100) * (1 + grid125 / 100);
  return hits * (BUTTON_RATES[slotIdx] || 0) * multi;
}

// KillroyBonuses OLA indices and formula coefficients per slot:
// KB(idx) = 1 + OLA[olaIdx] / (denom + OLA[olaIdx]) * scale  (for "multiplier" types)
// KB(idx) = OLA[olaIdx] / (denom + OLA[olaIdx]) * scale        (for "additive" types 3,6)
var KB_CONFIG = [
  { ola: 228, d: 300, s: 1 },   // 0: gfood (true mult via max(1,...))
  { ola: 229, d: 300, s: 9 },   // 1: sticker/exotic
  { ola: 230, d: 300, s: 2 },   // 2: jade
  { ola: 467, d: 200, s: 10, additive: true }, // 3: mastery loot
  { ola: 468, d: 200, s: 1.3 }, // 4: masterclass drops
  { ola: 469, d: 150, s: 0.8 }, // 5: research EXP
  { ola: 470, d: 250, s: 25, additive: true }, // 6: coral
  { ola: 471, d: 200, s: 2 },   // 7: display only
];
export function computeKillroyBonus(idx, saveData) {
  var cfg = KB_CONFIG[idx];
  if (!cfg) return 0;
  var ola = Number(saveData.olaData[cfg.ola]) || 0;
  if (ola <= 0) return 0;
  var raw = ola / (cfg.d + ola) * cfg.s;
  return cfg.additive ? raw : 1 + raw;
}
