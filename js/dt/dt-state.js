// dt-state.js - Shared mutable state and accessors for the decision-tree module family

import { RES_GRID_RAW } from '../game-data.js';

// Shared collections (mutated in-place via push/splice/clear - never reassigned)
export const _dtNodes = [];
export const _dtCompareSet = new Set();

// Shared mutable scalars in a single object so cross-module mutation works.
// (ES module export bindings are read-only for importers; object properties are not)
export const DT = {
  nextId: 1,
  modalNodeId: null,
  editState: null,
  showLevelUpsOnly: false,
  treePan: { x: 0, y: 0 },
  treeZoom: 1,
  treeDrag: null,
  treeHoverNode: null,
  gridMode: 'upgrades',
  shapeOpacity: 0.4,
};

// Layout constants
export const _DT_COL_W = 140, _DT_ROW_H = 70;
export const _DT_NODE_W = 120, _DT_NODE_H = 58, _DT_PAD = 30;
export const _DT_BRANCH_COLORS = ['#9c27b0','#00bcd4','#ffd700','#e94560','#4caf50','#ff9800','#2196f3','#e91e63','#8bc34a','#795548'];

// Common accessors
export function _dtGetNode(id) { return _dtNodes.find(n => n.id === id); }
export function _dtGetChildren(id) { return _dtNodes.filter(n => n.parentId === id); }
export function _dtGetRoot() { return _dtNodes.find(n => n.parentId === null); }

// Deep-clone a sim state's arrays/objects
export function _dtCloneState(src) {
  const c = {
    gl: src.gl.slice(), so: src.so.slice(),
    md: src.md.map(m => ({...m})), il: src.il.slice(),
    ip: src.ip.slice(), occ: src.occ.slice(),
    sp: src.sp.map(s => ({...s})),
  };
  if ('rLv' in src) { c.rLv = src.rLv; c.rExp = src.rExp; c.expHr = src.expHr; }
  return c;
}

export function _dtGridPointsAvail(gl, rLv) {
  const sq50 = gl[50] || 0;
  const earned = Math.floor(rLv + Math.floor(rLv / 10) * Math.round(1 + Math.min(1, Math.floor(rLv / 60)) + sq50));
  let spent = 0;
  for (const idx of Object.keys(RES_GRID_RAW)) spent += gl[Number(idx)] || 0;
  return Math.max(0, earned - spent);
}
