// ===== STAT CONTEXT — Lazy descriptor resolution with caching =====
// Creates a context object for the descriptor system (tree-builder.js).
//
// Two-layer model:
//   Layer 1 (frozen): save-derived values, computed once per save load
//   Layer 2 (mutable): sim-varying values (grid levels, etc.), change per tick
//
// ctx.resolve(id) lazily evaluates a descriptor via buildTree(), caches the
// result, and returns { name, val, children }.  Descriptors can call
// ctx.resolve() on other descriptors for recursive dependencies.
//
// ctx.invalidate() clears cached results when Layer 2 values change.

import { getDescriptor, getCatalog } from './registry.js';
import { buildTree } from './tree-builder.js';

/**
 * @param {object} opts
 * @param {number}  [opts.charIdx=0]
 * @param {number}  [opts.mapIdx]
 * @param {object}   opts.saveData   - Global state (or snapshot)
 * @param {object}  [opts.mapBon]   - Map-specific bonuses
 * @param {object}  [opts.layer1]   - Save-frozen properties (spread onto ctx)
 * @param {object}  [opts.layer2]   - Sim-varying properties (spread onto ctx)
 * @returns {object} ctx with resolve(), invalidate(), updateLayer2()
 */
export function createStatContext(opts) {
  var charIdx = opts.charIdx || 0;
  var saveData = opts.saveData;
  var mapIdx  = opts.mapIdx;
  var mapBon  = opts.mapBon;
  var layer1  = opts.layer1 || {};
  var layer2  = opts.layer2 || {};

  var _cache   = {};
  var _catalog = getCatalog();

  // Build the ctx object. Object.create(null) avoids prototype pollution.
  var ctx = Object.create(null);

  // Identity / scope
  ctx.charIdx  = charIdx;
  ctx.mapIdx   = mapIdx;
  ctx.saveData = saveData;
  ctx.mapBon   = mapBon;

  // Spread Layer 1 (save-frozen)
  var k;
  for (k in layer1) ctx[k] = layer1[k];

  // Spread Layer 2 (sim-varying)
  for (k in layer2) ctx[k] = layer2[k];

  // ----- Lazy descriptor resolution -----

  ctx.resolve = function(id) {
    if (id in _cache) return _cache[id];
    var desc = getDescriptor(id);
    if (!desc) throw new Error('Unknown descriptor: ' + id);
    // Sentinel to detect circular dependencies
    _cache[id] = null;
    var result = buildTree(desc, _catalog, ctx);
    _cache[id] = result;
    return result;
  };

  // Clear one or all cached descriptor results.
  ctx.invalidate = function(id) {
    if (id !== undefined) {
      delete _cache[id];
    } else {
      for (var ck in _cache) delete _cache[ck];
    }
  };

  // Replace Layer 2 properties and invalidate all cached descriptors.
  ctx.updateLayer2 = function(newProps) {
    for (var pk in newProps) ctx[pk] = newProps[pk];
    ctx.invalidate();
  };

  return ctx;
}
