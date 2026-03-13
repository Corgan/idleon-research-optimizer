// dt-state.js - Shared mutable state and accessors for the decision-tree module family

import { GRID_INDICES, RES_GRID_RAW } from '../game-data.js';

// Shared collections (mutated in-place via push/splice/clear - never reassigned)
export const dtNodes = [];
export const dtCompareSet = new Set();

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
export const DT_COL_W = 140, DT_ROW_H = 70;
export const DT_NODE_W = 120, DT_NODE_H = 58, DT_PAD = 30;
export const DT_BRANCH_COLORS = ['#9c27b0','#00bcd4','#ffd700','#e94560','#4caf50','#ff9800','#2196f3','#e91e63','#8bc34a','#795548'];
export const DT_EVENT_COLORS = { 'start': '#aaa', 'decision': '#ffa726', 'level-up': '#ffd700', 'insight-up': '#ce93d8', 'level+insight': '#4dd0e1' };

// Common accessors
export function dtGetNode(id) { return dtNodes.find(n => n.id === id); }
export function dtGetChildren(id) { return dtNodes.filter(n => n.parentId === id); }
export function dtGetRoot() { return dtNodes.find(n => n.parentId === null); }

// Deep-clone a sim state's arrays/objects
export function dtCloneState(src) {
  const c = {
    gl: src.gl.slice(), so: src.so.slice(),
    md: src.md.map(m => ({...m})), il: src.il.slice(),
    ip: src.ip.slice(), occ: src.occ.slice(),
    sp: src.sp.map(s => ({...s})),
  };
  if (src.spo) c.spo = src.spo.slice();
  if ('rLv' in src) { c.rLv = src.rLv; c.rExp = src.rExp; c.expHr = src.expHr; }
  if (src.saveCtx) c.saveCtx = src.saveCtx;
  return c;
}

export function dtGridPointsAvail(gl, rLv) {
  const sq50 = gl[50] || 0;
  const earned = Math.floor(rLv + Math.floor(rLv / 10) * Math.round(1 + Math.min(1, Math.floor(rLv / 60)) + sq50));
  let spent = 0;
  for (const idx of GRID_INDICES) spent += gl[idx] || 0;
  return Math.max(0, earned - spent);
}
