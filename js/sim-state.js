// ===== SIM STATE - SimState definition and pure operations =====
// SimState bundles all mutable simulation state into a single object.
// No global state references - pure functions only.
//
// SimState shape:
//   gl    : Uint8Array|Array  - grid levels (indexed by cell id)
//   so    : Int8Array|Array   - shape overlay per cell (-1 = none, 0..9 = shape idx)
//   md    : Array<{type,slot,x,y}> - magnifier data
//   il    : Array<number>     - insight levels per observation
//   ip    : Array<number>     - insight progress per observation
//   occ   : Array<number>     - occurrences found (0/1 per obs)
//   rLv   : number            - current research level
//   rExp  : number            - current research EXP within level
//   mOwned: number            - total magnifiers owned
//   mMax  : number            - max magnifiers per slot

/**
 * Deep-clone a SimState (all arrays/objects copied).
 */
export function cloneSimState(s) {
  return {
    gl: s.gl.slice(),
    so: s.so.slice(),
    md: s.md.map(function(m) { return { type: m.type, slot: m.slot, x: m.x, y: m.y }; }),
    il: s.il.slice(),
    ip: s.ip.slice(),
    occ: s.occ.slice(),
    rLv: s.rLv,
    rExp: s.rExp,
    mOwned: s.mOwned,
    mMax: s.mMax,
  };
}
