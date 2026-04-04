// ===== COMPILER.JS — Compile save data into descriptor-aware contexts =====
// Single entry point for creating contexts that support both:
//   1. The descriptor system (ctx.resolve('drop-rate'))
//   2. The sim-math pipeline (ctx.abm, ctx.c52, etc.)
//
// Phase 2: compileSave() delegates to save/context.js buildSaveContext().
//          As Phase 3+ descriptors replace individual save values,
//          the delegation shrinks and save/context.js eventually dies.

import { saveData } from '../state.js';
import { createStatContext } from './stat-context.js';
import {
  buildSaveContext,
  makeSimCtx,
} from '../save/context.js';

/**
 * Compile all save-derived (Layer 1) values from global state saveData.
 * Returns a plain object safe for caching and passing to sim runs.
 *
 */
export function compileSave() {
  return buildSaveContext();
}

/**
 * Create a full stat context with descriptor resolution.
 * This is the NEW entry point — Phase 3 callers use this instead of
 * buildSaveContext() + makeSimCtx() separately.
 *
 * @param {object}  [opts]
 * @param {number}  [opts.charIdx=0]  - Character slot index
 * @param {number}  [opts.mapIdx]     - Active map index
 * @param {object}  [opts.mapBon]     - Map-specific bonuses
 * @param {object}  [opts.saveCtx]    - Pre-compiled save context (reuse across runs)
 * @param {object}  [opts.layer2]     - Sim-varying overrides { gl, il, ... }
 * @returns {object} ctx with resolve(), invalidate(), updateLayer2()
 */
export function compileContext(opts) {
  opts = opts || {};
  var saveCtx = opts.saveCtx || compileSave();

  return createStatContext({
    charIdx: opts.charIdx || 0,
    mapIdx:  opts.mapIdx,
    saveData: saveData,
    mapBon:  opts.mapBon,
    layer1:  saveCtx,
    layer2:  opts.layer2 || {},
  });
}

/**
 * Create a sim-math compatible context augmented with descriptor resolution.
 * Backward-compat bridge: returns the same flat shape that sim-math functions
 * expect ({ abm, c52, stickerFixed, ... }) but also has ctx.resolve().
 *
 * @param {Int32Array|number[]} gl       - Grid levels
 * @param {object}              saveCtx  - From compileSave() or buildSaveContext()
 * @param {object}             [opts]    - { charIdx, mapIdx, mapBon }
 * @returns {object} sim-math ctx + resolve() + invalidate()
 */
export function compileSimCtx(gl, saveCtx, opts) {
  opts = opts || {};
  var sc   = saveCtx || compileSave();
  var flat = makeSimCtx(gl);

  // Merge flat sim-math properties into a stat context.
  // The stat context gets Layer 1 from saveCtx and Layer 2 from the flat
  // sim-math ctx, so resolve() has access to everything.
  return createStatContext({
    charIdx: opts.charIdx || 0,
    mapIdx:  opts.mapIdx,
    saveData: saveData,
    mapBon:  opts.mapBon,
    layer1:  sc,
    layer2:  flat,
  });
}
