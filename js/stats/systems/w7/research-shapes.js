// ===== RESEARCH SHAPE PLACEMENT (W7) =====
// Pure, game-faithful model of dragging Research grid shapes.
//
// Source (src/N.new.formatted.js):
//   ShapesOwned        ResearchStuff "ShapesOwned"        (~92750)
//   CanRotateShapes    Lv0[20] >= 90                      (92749)
//   Grid_CanWeSelect   node selectable gate               (~92764)
//   Grid_ShapeVertices rounded rotated vertices           (92763)
//   IsPointInPolygon   even-odd ray cast                  (92905)
//   drag               per-axis bounds 10<=x, x+w<=616,
//                      20<=y, y+h<=375 (mouse delta)       (100051)
//   rotate buttons     +/-5 degrees on Research[6][4s+2]   (100134)
//   ownership pass "f" every 10 frames while dragging     (100051, 101173-101188)
//   new shape padding  random x 70..150, y 70..125         (73693)
//
// The overlay (Research[1]) is history dependent: a dragged shape only claims
// unowned selectable nodes, releases nodes it no longer covers, and a released
// node is re-offered to every owned shape on that pass and the next one.

import { GRID_COLS, GRID_SIZE, RES_GRID_RAW, SHAPE_VERTICES, SHAPE_DIMS, SHAPE_NAMES } from '../../data/w7/research.js';
import { computeShapesOwnedAt } from './research-math.js';
import { eventShopOwned } from '../../../game-helpers.js';

export const RESEARCH_SHAPE_BOUNDS = { minX: 10, maxRight: 616, minY: 20, maxBottom: 375 };
export const RESEARCH_SHAPE_ROT_STEP = 5;
export const RESEARCH_SHAPE_ROTATE_LEVEL = 90;
export const RESEARCH_SHAPE_MAX = 10;
export const RESEARCH_GRID_ORIGIN = { x: 15, y: 24, cell: 30 };
// Deterministic stand-in for the game's random padding of a newly owned shape.
export const RESEARCH_SHAPE_DEFAULT_POS = { x: 110, y: 97, rot: 0 };

const _DEG = 0.01745329251994278;

function _num(v) { return Number(v) || 0; }

export function researchShapeDims(shape) {
  const d = SHAPE_DIMS[shape];
  return d ? [_num(d[0]), _num(d[1])] : [0, 0];
}

export function researchShapeName(shape) {
  return SHAPE_NAMES[shape] || ('Shape ' + (Number(shape) + 1));
}

export function researchShapeCount() {
  return Math.min(SHAPE_VERTICES.length, SHAPE_DIMS.length);
}

/** ShapesOwned from decoded inputs (mirrors computeShapesOwnedAt). */
export function researchShapesOwned({ researchLevel = 0, eventShopStr = '', spelunkUpg7 = 0, hasComp54 = false, banM = false } = {}) {
  const evShop = [];
  evShop[36] = eventShopOwned(36, String(eventShopStr || ''));
  return computeShapesOwnedAt(_num(researchLevel), { evShop, hasComp54: !!hasComp54, spelunkyUpg7: _num(spelunkUpg7), banM: banM ? 1 : 0 });
}

export function researchCanRotateShapes(researchLevel) {
  return _num(researchLevel) >= RESEARCH_SHAPE_ROTATE_LEVEL;
}

/** Grid_CanWeSelect(t): starting nodes, leveled nodes, or real nodes next to a leveled node. */
export function researchNodeSelectable(levels, t) {
  if (t < 0 || t >= GRID_SIZE) return false;
  const lv = i => _num(levels && levels[i]);
  const col = t % GRID_COLS;
  if ((col === 9 || col === 10) && t >= 100 && t <= 140) return true;
  if (lv(t) >= 1) return true;
  if (!RES_GRID_RAW[t]) return false;
  if (t >= 20 && lv(t - 20) >= 1) return true;
  if (col !== 0 && lv(t - 1) >= 1) return true;
  if (col !== 19 && lv(t + 1) >= 1) return true;
  if (t < 220 && lv(t + 20) >= 1) return true;
  return false;
}

/** Grid_ShapeVertices: vertices rotated about the box centre, then rounded. */
export function researchShapeVertices(shape, x, y, rot) {
  const verts = SHAPE_VERTICES[shape];
  if (!verts) return [];
  const [w, h] = researchShapeDims(shape);
  const xc = w / 2, yc = h / 2;
  const a = _DEG * _num(rot);
  const cos = Math.cos(a), sin = Math.sin(a);
  return verts.map(([vx, vy]) => [
    Math.round(xc + _num(x) + (vx - xc) * cos - (vy - yc) * sin),
    Math.round(yc + _num(y) + (vx - xc) * sin + (vy - yc) * cos),
  ]);
}

/** IsPointInPolygon: even-odd ray cast exactly as the game evaluates it. */
export function researchPointInPolygon(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const yi = poly[i][1], yj = poly[j][1];
    if ((yi > py && yj <= py) || (yj > py && yi <= py)) {
      const xi = poly[i][0], xj = poly[j][0];
      if (px < (xj - xi) * ((py - yi) / (yj - yi)) + xi) inside = !inside;
    }
  }
  return inside;
}

/** Node corner probe k (0..3) in game pixels. */
export function researchNodeCorner(n, k) {
  return [
    15 + 30 * (n % GRID_COLS) + 3 + 21 * (k % 2),
    24 + 30 * Math.floor(n / GRID_COLS) + 3 + 21 * Math.floor(k / 2),
  ];
}

// ----- in-game art placement (ResearchStuffs "a"/"b" at 101148/101151, frame loop at 100051) -----
export const RESEARCH_ART_CELL = { x: 14, y: 23, pitch: 30 };
export const RESEARCH_ART_SELECTION = { x: 9, y: 18 };

/** Node art top-left: attachImageToActor(ResSq.., 14 + 30*col, 23 + 30*row). */
export function researchCellArtPosition(n) {
  return { x: RESEARCH_ART_CELL.x + RESEARCH_ART_CELL.pitch * (n % GRID_COLS), y: RESEARCH_ART_CELL.y + RESEARCH_ART_CELL.pitch * Math.floor(n / GRID_COLS) };
}

/** ResSqSel top-left for the selected node: (9 + 30*col, 18 + 30*row). */
export function researchSelectionArtPosition(n) {
  return { x: RESEARCH_ART_SELECTION.x + RESEARCH_ART_CELL.pitch * (n % GRID_COLS), y: RESEARCH_ART_SELECTION.y + RESEARCH_ART_CELL.pitch * Math.floor(n / GRID_COLS) };
}

/** Node image: "ResSq" + Grid_MaxLV + "_" + round(level), or null (Blank.png) when Grid_CanWeSelect is 0. */
export function researchCellImageKey(levels, n) {
  if (!researchNodeSelectable(levels, n)) return null;
  const info = RES_GRID_RAW[n];
  const max = Math.round(_num(info && info[1]));
  return 'ResSq' + max + '_' + Math.round(_num(levels && levels[n]));
}

/** Shape-owner overlay image: "ResSqH" + Research[1][n] when >= 0, else Blank. */
export function researchCellHighlightKey(overlay, n) {
  const v = _num(overlay && overlay[n]);
  return overlay && overlay[n] != null && v >= 0 ? 'ResSqH' + v : null;
}

/** Shape sprite alpha: round(Research[7][1]) / 100 (null when the save has no value). */
export function researchShapeAlpha(r7v1) {
  if (r7v1 == null || r7v1 === '' || !Number.isFinite(Number(r7v1))) return null;
  return Math.round(Number(r7v1)) / 100;
}

/**
 * SVG transform for an OriginCentered ResShape sprite drawn at (0,0) with size w x h:
 * top-left at Research[6] (x, y), rotated Research[6][4s+2] degrees about pivot
 * (ox, oy) = (round(w/2), round(h/2)).
 */
export function researchShapeSpriteTransform(pos, sprite) {
  const x = _num(pos && pos.x), y = _num(pos && pos.y), rot = _num(pos && pos.rot);
  const ox = sprite && sprite.ox != null ? _num(sprite.ox) : Math.round(_num(sprite && sprite.w) / 2);
  const oy = sprite && sprite.oy != null ? _num(sprite.oy) : Math.round(_num(sprite && sprite.h) / 2);
  return 'translate(' + x + ' ' + y + ')' + (rot ? ' rotate(' + rot + ' ' + ox + ' ' + oy + ')' : '');
}

/** Clamp a drag target to the game's unrotated bounding-box limits. */
export function clampResearchShapePosition(shape, x, y) {
  const [w, h] = researchShapeDims(shape);
  const B = RESEARCH_SHAPE_BOUNDS;
  return {
    x: Math.min(Math.max(_num(x), B.minX), B.maxRight - w),
    y: Math.min(Math.max(_num(y), B.minY), B.maxBottom - h),
  };
}

/** Decode Research[6] groups of four into [{x, y, rot, unk}]. */
export function parseResearchShapePositions(r6, count) {
  const arr = Array.isArray(r6) ? r6 : [];
  const n = count != null ? count : Math.floor(arr.length / 4);
  const out = [];
  for (let s = 0; s < n; s++) {
    if (4 * s + 1 >= arr.length) { out.push(null); continue; }
    out.push({ x: _num(arr[4 * s]), y: _num(arr[4 * s + 1]), rot: _num(arr[4 * s + 2]), unk: _num(arr[4 * s + 3]) });
  }
  return out;
}

function _pos(positions, s) {
  return positions[s] || { x: 0, y: 0, rot: 0 };
}

/**
 * One "f" ownership pass (source 101173-101188) with `dragged` as GenINFO[6].
 * Mutates state.overlay and state.counters (GenINFO[11]); returns changed node count.
 */
export function researchShapeOwnershipPass(state, dragged) {
  const { levels, overlay, positions, counters } = state;
  const owned = Math.max(0, Math.min(_num(state.owned), researchShapeCount()));
  const polys = [], centres = [];
  for (let d = 0; d < owned; d++) {
    const p = _pos(positions, d);
    const [w, h] = researchShapeDims(d);
    polys.push(researchShapeVertices(d, p.x, p.y, p.rot));
    centres.push([_num(p.x) + w / 2, _num(p.y) + h / 2, Math.max(w, h) / 2 * 1.45 + 30]);
  }
  let changed = 0;
  for (let n = 0; n < GRID_SIZE; n++) {
    if (!researchNodeSelectable(levels, n)) continue;
    if (!(overlay[n] === -1 || overlay[n] === dragged)) continue;
    const before = overlay[n];
    let hit = 0;
    for (let k = 0; k < 4; k++) {
      const [px, py] = researchNodeCorner(n, k);
      for (let d = 0; d < owned;) {
        const c = centres[d];
        if ((dragged === d || counters[n] > 0)
          && (overlay[n] !== -1 || Math.hypot(px - c[0], py - c[1]) < c[2])) {
          if (researchPointInPolygon(px, py, polys[d])) {
            overlay[n] = d; hit = 1;
          } else if (hit === 0 && k === 3 && dragged === d && overlay[n] === d && counters[n] === 0) {
            overlay[n] = -1; counters[n] = 2; d = 0;
            continue;
          }
        }
        d++;
      }
    }
    counters[n] = Math.max(0, counters[n] - 1);
    if (overlay[n] !== before) changed++;
  }
  return changed;
}

/** Repeat passes for a dropped shape until the overlay and recheck counters settle. */
export function settleResearchShapeDrop(state, dragged, maxPasses = 12) {
  let passes = 0;
  for (; passes < maxPasses; passes++) {
    const changed = researchShapeOwnershipPass(state, dragged);
    if (!changed && state.counters.every(c => c === 0) && passes > 0) { passes++; break; }
  }
  return passes;
}

function _overlayArray(r1) {
  const out = new Array(GRID_SIZE).fill(-1);
  if (r1) for (let i = 0; i < GRID_SIZE; i++) {
    const v = r1[i];
    if (v != null && v !== '' && Number.isFinite(Number(v))) out[i] = Number(v);
  }
  return out;
}

/**
 * Apply drag moves [[shape, x, y, rot], ...] in order. Each move sets the shape
 * position and settles the game's ownership pass with that shape dragged.
 * `clear` starts from an empty overlay (placement-order first-come layout).
 * Returns { overlay, positions, applied, skipped }.
 */
export function applyResearchShapeMoves({ levels, overlay, positions, owned }, moves, opts = {}) {
  const ownedN = Math.max(0, Math.min(_num(owned), researchShapeCount()));
  const pos = [];
  for (let s = 0; s < Math.max(ownedN, (positions || []).length); s++) {
    const p = positions && positions[s];
    pos.push(p ? { x: _num(p.x), y: _num(p.y), rot: _num(p.rot), unk: _num(p.unk) } : null);
  }
  for (let s = 0; s < ownedN; s++) if (!pos[s]) pos[s] = Object.assign({ unk: 0 }, RESEARCH_SHAPE_DEFAULT_POS);
  const state = {
    levels: levels || [],
    overlay: opts.clear ? new Array(GRID_SIZE).fill(-1) : _overlayArray(overlay),
    positions: pos,
    counters: new Array(GRID_SIZE).fill(0),
    owned: ownedN,
  };
  const applied = [], skipped = [];
  (moves || []).forEach(m => {
    const s = Math.round(_num(m && m[0]));
    if (!(s >= 0 && s < ownedN)) { skipped.push(s); return; }
    const c = clampResearchShapePosition(s, m[1], m[2]);
    pos[s] = { x: c.x, y: c.y, rot: _num(m[3]), unk: pos[s] ? pos[s].unk : 0 };
    settleResearchShapeDrop(state, s);
    applied.push(s);
  });
  return { overlay: state.overlay, positions: pos, applied, skipped };
}

/** Nodes (selectable or not) whose corner probes fall inside a placed shape. */
export function researchShapeCoveredNodes(shape, x, y, rot, filter) {
  const poly = researchShapeVertices(shape, x, y, rot);
  if (!poly.length) return [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  poly.forEach(([px, py]) => { x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py); });
  const out = [];
  for (let n = 0; n < GRID_SIZE; n++) {
    if (filter && !filter(n)) continue;
    const cx = 15 + 30 * (n % GRID_COLS), cy = 24 + 30 * Math.floor(n / GRID_COLS);
    if (cx + 27 < x0 || cx + 3 > x1 || cy + 27 < y0 || cy + 3 > y1) continue;
    for (let k = 0; k < 4; k++) {
      const [px, py] = researchNodeCorner(n, k);
      if (researchPointInPolygon(px, py, poly)) { out.push(n); break; }
    }
  }
  return out;
}

/**
 * The game has no shape tray: every owned shape is always on the board. Parking
 * finds the closest legal position (to `near`) that covers no real node, or
 * failing that no currently selectable node. Returns {x, y} or null.
 */
export function findResearchShapeParking(shape, rot, levels, near, step = 3) {
  const [w, h] = researchShapeDims(shape);
  const B = RESEARCH_SHAPE_BOUNDS;
  const target = near || { x: B.maxRight - w, y: B.maxBottom - h };
  let best = null, bestFallback = null;
  for (let y = B.minY; y <= B.maxBottom - h; y += step) {
    for (let x = B.minX; x <= B.maxRight - w; x += step) {
      const d = Math.hypot(x - target.x, y - target.y);
      if (best && d >= best.d) continue;
      const real = researchShapeCoveredNodes(shape, x, y, rot, n => !!RES_GRID_RAW[n]);
      if (!real.length) { best = { x, y, d }; continue; }
      if (bestFallback && d >= bestFallback.d) continue;
      if (!real.some(n => researchNodeSelectable(levels, n))) bestFallback = { x, y, d };
    }
  }
  const r = best || bestFallback;
  return r ? { x: r.x, y: r.y } : null;
}

/** Layout string: JSON {v:1, shapes:[[s,x,y,rot],...]} or "s:x,y,rot;..." (placement order). */
export function encodeResearchShapeLayout(moves) {
  return JSON.stringify({ v: 1, shapes: (moves || []).map(m => [Math.round(_num(m[0])), _num(m[1]), _num(m[2]), _num(m[3])]) });
}

export function decodeResearchShapeLayout(text) {
  const t = String(text == null ? '' : text).trim();
  if (!t) throw new Error('empty layout');
  let list;
  if (t[0] === '{' || t[0] === '[') {
    const j = JSON.parse(t);
    list = Array.isArray(j) ? j : (j.shapes || j.placements || j.moves);
    if (!Array.isArray(list)) throw new Error('layout JSON needs a shapes array');
    list = list.map(e => Array.isArray(e) ? e
      : [e.shape ?? e.shapeIdx ?? e.s, e.x, e.y, e.rot ?? 0]);
  } else {
    list = t.split(/[;\n]+/).map(s => s.trim()).filter(Boolean).map(s => {
      const m = /^(\d+)\s*[:=]\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*(?:,\s*(-?[\d.]+))?$/.exec(s);
      if (!m) throw new Error('bad layout entry "' + s + '"');
      return [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4] || 0)];
    });
  }
  return list.map(e => {
    const out = [Math.round(Number(e[0])), Number(e[1]), Number(e[2]), Number(e[3]) || 0];
    if (!out.slice(0, 3).every(Number.isFinite) || out[0] < 0) throw new Error('bad layout entry');
    return out;
  });
}
