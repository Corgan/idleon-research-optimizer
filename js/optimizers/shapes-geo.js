// ===== SHAPE GEOMETRY - pure polygon + coverage functions =====
// Grid cell coverage, polygon intersection, LUT builder.
// No global state - all data via parameters and game-data imports.

import {
  GRID_COLS, GRID_ROWS, GRID_SIZE, RES_GRID_RAW,
  SHAPE_VERTICES, SHAPE_DIMS,
} from '../game-data.js';

/**
 * Ray-casting point-in-polygon (matches game's IsPointInPolygon).
 */
export function isPointInPolygon(px, py, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];
    if ((yi > py) !== (yj > py)) {
      const intersectX = (xj - xi) * ((py - yi) / (yj - yi)) + xi;
      if (px < intersectX) inside = !inside;
    }
  }
  return inside;
}

/**
 * Get the rotated polygon for shape shapeIdx at position (x, y) with rotation rot degrees.
 */
export function getShapePolygonAt(shapeIdx, x, y, rot) {
  const verts = SHAPE_VERTICES[shapeIdx];
  const dims = SHAPE_DIMS[shapeIdx];
  if (!verts || !dims) return null;
  const cx = dims[0] / 2, cy = dims[1] / 2;
  const angle = (rot || 0) * Math.PI / 180;
  const cosA = Math.cos(angle), sinA = Math.sin(angle);
  return verts.map(([vx, vy]) => {
    const dx = vx - cx, dy = vy - cy;
    return [cx + x + dx * cosA - dy * sinA,
            cy + y + dx * sinA + dy * cosA];
  });
}

/**
 * Returns array of grid cell indices covered by shape shapeIdx at (x, y, rot).
 * excludeCells: optional Set of cell indices to skip.
 */
export function getShapeCellCoverage(shapeIdx, x, y, rot, excludeCells) {
  const polygon = getShapePolygonAt(shapeIdx, x, y, rot);
  if (!polygon) return [];
  const covered = [];
  const cornerOffsets = [[3,3],[24,3],[3,24],[24,24]];

  for (let cellIdx = 0; cellIdx < GRID_SIZE; cellIdx++) {
    if (!RES_GRID_RAW[cellIdx]) continue;
    if (excludeCells && excludeCells.has(cellIdx)) continue;

    const col = cellIdx % GRID_COLS;
    const row = Math.floor(cellIdx / GRID_COLS);
    const cellX = 15 + 30 * col;
    const cellY = 24 + 30 * row;

    for (const [ox, oy] of cornerOffsets) {
      if (isPointInPolygon(cellX + ox, cellY + oy, polygon)) {
        covered.push(cellIdx);
        break;
      }
    }
  }
  return covered;
}

/**
 * Precompute coverage LUT for all shapes × 72 rotations × 30×30 pixel offsets.
 * Grid cells are 30×30 so coverage is periodic in (x%30, y%30).
 */
export function buildCoverageLUT(numShapes) {
  const cornerOffsets = [[3,3],[24,3],[3,24],[24,24]];
  const lut = new Array(numShapes * 72);
  for (let si = 0; si < numShapes; si++) {
    const verts = SHAPE_VERTICES[si];
    const dims = SHAPE_DIMS[si];
    if (!verts || !dims) { for (let ri = 0; ri < 72; ri++) lut[si * 72 + ri] = null; continue; }
    const cx = dims[0] / 2, cy = dims[1] / 2;
    for (let ri = 0; ri < 72; ri++) {
      const angle = ri * 5 * Math.PI / 180;
      const cosA = Math.cos(angle), sinA = Math.sin(angle);
      const basePoly = verts.map(([vx, vy]) => {
        const dx = vx - cx, dy = vy - cy;
        return [cx + dx * cosA - dy * sinA, cy + dx * sinA + dy * cosA];
      });
      let bMinX = Infinity, bMaxX = -Infinity, bMinY = Infinity, bMaxY = -Infinity;
      for (const [px, py] of basePoly) {
        if (px < bMinX) bMinX = px; if (px > bMaxX) bMaxX = px;
        if (py < bMinY) bMinY = py; if (py > bMaxY) bMaxY = py;
      }
      const dcolMin = Math.floor((bMinX - 39) / 30);
      const dcolMax = Math.floor((bMaxX + 11) / 30);
      const drowMin = Math.floor((bMinY - 48) / 30);
      const drowMax = Math.floor((bMaxY + 2) / 30);
      const allPairs = [];
      const starts = new Uint32Array(901);
      for (let s = 0; s < 30; s++) {
        for (let r = 0; r < 30; r++) {
          starts[s * 30 + r] = allPairs.length;
          for (let drow = drowMin; drow <= drowMax; drow++) {
            for (let dcol = dcolMin; dcol <= dcolMax; dcol++) {
              let hit = false;
              for (const [ox, oy] of cornerOffsets) {
                if (isPointInPolygon(15 + 30 * dcol + ox - r, 24 + 30 * drow + oy - s, basePoly)) {
                  hit = true; break;
                }
              }
              if (hit) allPairs.push(dcol, drow);
            }
          }
        }
      }
      starts[900] = allPairs.length;
      lut[si * 72 + ri] = { data: new Int8Array(allPairs), starts };
    }
  }
  return lut;
}

/**
 * Fast coverage lookup via precomputed LUT. Returns array of valid cell indices.
 */
export function lookupCoverage(lut, si, x, y, rot) {
  const ri = Math.round(((rot % 360) + 360) % 360 / 5) % 72;
  const entry = lut[si * 72 + ri];
  if (!entry) return [];
  const r = ((x % 30) + 30) % 30;
  const s = ((y % 30) + 30) % 30;
  const phaseKey = s * 30 + r;
  const start = entry.starts[phaseKey];
  const end = entry.starts[phaseKey + 1];
  const data = entry.data;
  const baseCol = (x - r) / 30;
  const baseRow = (y - s) / 30;
  const result = [];
  for (let i = start; i < end; i += 2) {
    const col = data[i] + baseCol;
    const row = data[i + 1] + baseRow;
    if (col >= 0 && col < GRID_COLS && row >= 0 && row < GRID_ROWS) {
      const idx = row * GRID_COLS + col;
      if (RES_GRID_RAW[idx]) result.push(idx);
    }
  }
  return result;
}

/**
 * Rebuild shapeOverlay array from an array of shape positions.
 * positions: Array<{x, y, rot}>  indexed by shape index.
 * numShapes: how many shapes are owned/active.
 */
export function rebuildShapeOverlay(positions, numShapes) {
  if (numShapes === 0) return new Array(GRID_SIZE).fill(-1);
  const so = new Array(GRID_SIZE).fill(-1);
  for (let si = 0; si < numShapes; si++) {
    const p = positions[si];
    if (!p || p.x == null || p.y == null) continue;
    const cells = getShapeCellCoverage(si, p.x, p.y, p.rot || 0);
    for (const c of cells) {
      if (so[c] < 0) so[c] = si;
    }
  }
  return so;
}

// Check if two grid cells are covered by the same shape.
export function sameShapeCell(overlay, i, neighbor) {
  if (neighbor < 0 || neighbor >= GRID_SIZE) return false;
  return overlay[i] >= 0 && overlay[i] === overlay[neighbor];
}
