// dt-grid.js - Grid canvas, shape manipulation, and observation editor for the decision tree.
// Extracted from decision-tree.js.

import { optionsListData } from '../save/data.js';
import {
  GRID_COLS, GRID_INDICES, GRID_ROWS, GRID_SIZE, NODE_GOAL, NODE_GOAL_COLORS,
  RES_GRID_RAW, SHAPE_BONUS_PCT, SHAPE_COLORS, SHAPE_DIMS, SHAPE_NAMES, SHAPE_VERTICES,
} from '../game-data.js';
import {
  calcAllBonusMultiWith, computeMagnifiersOwnedWith,
  computeShapesOwnedAt, gridBonusMode2, simTotalExpWith,
} from '../sim-math.js';
import { makeCtx } from '../save/context.js';
import {
  getShapeCellCoverage, getShapePolygonAt, isPointInPolygon,
} from '../optimizers/shapes-geo.js';
import { growMagPoolTyped } from '../optimizers/mags.js';
import { DT, dtGetNode, dtGridPointsAvail } from './dt-state.js';
// Circular import (safe - only used inside functions at runtime, not at module parse time)
import { dtRenderModal } from './decision-tree.js';


// ===== Utility exports =====

export function dtRecalcExpHr() {
  if (!DT.editState) return;
  const s = DT.editState;
  const ctx = makeCtx(s.gl, s.saveCtx);
  s.ctx = ctx;
  s.expHr = simTotalExpWith(s.gl, s.so, s.md, s.il, s.occ, s.rLv, ctx);
}

export function dtResetGridState() {
  _dtShapeDrag = null;
  if (_dtGridTooltip) _dtGridTooltip.style.display = 'none';
}

export function dtSetGridMode(mode) {
  DT.gridMode = mode;
  document.querySelectorAll('#dt-grid-mode-pill .dt-mode-btn').forEach(b => {
    const active = b.dataset.mode === DT.gridMode;
    b.style.background = active ? (DT.gridMode === 'upgrades' ? 'var(--gold)' : 'var(--purple)') : '#222';
    b.style.color = active ? '#000' : '#888';
    b.style.fontWeight = active ? '600' : '400';
  });
  if (DT.gridMode === 'upgrades') {
    const popup = document.getElementById('dt-shape-rotate-popup');
    if (popup) popup.style.display = 'none';
  }
}

export function dtSetShapeOpacity(val) {
  DT.shapeOpacity = val;
  dtRenderGridCanvas();
}

// DT-aware version of gridBonusMode2 (reads from edit state, not globals)
function _dtGridBonusMode2(nodeIdx, curBonus, s) {
  return gridBonusMode2(nodeIdx, curBonus, s.gl[31] || 0, s.il, s.occ, s.saveCtx.cachedBoonyCount, optionsListData?.[500]);
}

// ===== UNIFIED GRID + SHAPE CANVAS =====
let _dtGridTooltip = null;
let _dtShapeDrag = null; // {shapeIdx, startX, startY, origX, origY}
let _dtHoverCell = -1;   // cell index under mouse (for tooltip + highlight)
const _DT_CELL = 30;     // px per grid cell on canvas
const _DT_GRID_PAD = 16; // canvas padding

export function dtRenderGridCanvas() {
  if (!DT.editState) return;
  const s = DT.editState;
  const sCtx = s.ctx || makeCtx(s.gl, s.saveCtx);
  const numOwned = Math.min(computeShapesOwnedAt(s.rLv, sCtx), s.sp.length, SHAPE_VERTICES.length, 10);
  const avail = dtGridPointsAvail(s.gl, s.rLv, s.saveCtx);

  // Coverage summary
  const nodesInGrid = GRID_INDICES.length;
  let coveredNodes = 0;
  for (const idx of GRID_INDICES) { if (s.so[idx] >= 0) coveredNodes++; }
  document.getElementById('dt-shape-coverage').textContent = `(${coveredNodes}/${nodesInGrid} covered)`;

  const canvas = document.getElementById('dt-grid-canvas');
  if (!canvas) return;
  const C = _DT_CELL, P = _DT_GRID_PAD;
  const cw = P * 2 + GRID_COLS * C;
  const ch = P * 2 + GRID_ROWS * C;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = cw * dpr;
  canvas.height = ch * dpr;
  canvas.style.width = cw + 'px';
  canvas.style.height = ch + 'px';
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Canvas background: medium grey like in-game
  ctx.fillStyle = '#888898';
  ctx.fillRect(0, 0, cw, ch);

  // --- Draw grid cells ---
  for (let idx = 0; idx < GRID_SIZE; idx++) {
    const col = idx % GRID_COLS, row = Math.floor(idx / GRID_COLS);
    const cx = P + col * C, cy = P + row * C;
    const info = RES_GRID_RAW[idx];
    if (!info) continue;
    const curLv = s.gl[idx] || 0;
    const maxLv = info[1];
    const unlocked = _dtIsGridCellUnlocked(idx, s.gl);
    if (curLv === 0 && !unlocked) continue; // hide locked cells entirely
    const si = s.so[idx];
    const goalCat = NODE_GOAL[idx] || '';
    const goalColor = NODE_GOAL_COLORS[goalCat] || '#555';
    const inset = 1;
    const iw = C - inset * 2, ih = C - inset * 2;
    const x0 = cx + inset, y0 = cy + inset;

    // Cell base: light background
    ctx.fillStyle = '#707084';
    ctx.fillRect(x0, y0, iw, ih);

    // Upgrade fill: shade from edges inward (drawn before shape so shape sits on top)
    if (curLv > 0 && maxLv > 0) {
      ctx.fillStyle = '#1a1a28';
      if (maxLv === 1) {
        ctx.fillRect(x0, y0, iw, ih);
      } else if (maxLv === 2) {
        if (curLv >= 1) {
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(x0 + iw, y0);
          ctx.lineTo(x0, y0 + ih);
          ctx.closePath();
          ctx.fill();
        }
        if (curLv >= 2) {
          ctx.beginPath();
          ctx.moveTo(x0 + iw, y0);
          ctx.lineTo(x0 + iw, y0 + ih);
          ctx.lineTo(x0, y0 + ih);
          ctx.closePath();
          ctx.fill();
        }
      } else if (maxLv === 3) {
        const h3 = Math.round(ih / 3);
        if (curLv >= 1) ctx.fillRect(x0, y0, iw, h3);
        if (curLv >= 2) ctx.fillRect(x0, y0 + h3, Math.round(iw / 2), ih - h3);
        if (curLv >= 3) ctx.fillRect(x0 + Math.round(iw / 2), y0 + h3, iw - Math.round(iw / 2), ih - h3);
      } else if (maxLv === 4) {
        for (let q = 0; q < Math.min(curLv, 4); q++) {
          const qy = Math.round(ih * q / 4);
          const qh = Math.round(ih * (q + 1) / 4) - qy;
          ctx.fillRect(x0, y0 + qy, iw, qh);
        }
      } else {
        for (let q = 0; q < Math.min(curLv, maxLv); q++) {
          const qy = Math.round(ih * q / maxLv);
          const qh = Math.round(ih * (q + 1) / maxLv) - qy;
          ctx.fillRect(x0, y0 + qy, iw, qh);
        }
      }
    }

    // Shape color fill: solid miniature shape silhouette (on top of upgrade fill)
    if (si >= 0 && si < numOwned) {
      const shapeColor = SHAPE_COLORS[si] || '#888';
      const frame = 5;
      const verts = SHAPE_VERTICES[si];
      const dims = SHAPE_DIMS[si];
      ctx.fillStyle = shapeColor;
      if (verts && dims) {
        const aw = iw - frame * 2, ah = ih - frame * 2;
        const sc = Math.min(aw / dims[0], ah / dims[1]);
        const ox = x0 + frame + (aw - dims[0] * sc) / 2;
        const oy = y0 + frame + (ah - dims[1] * sc) / 2;
        ctx.beginPath();
        for (let vi = 0; vi < verts.length; vi++) {
          const px = ox + verts[vi][0] * sc;
          const py = oy + verts[vi][1] * sc;
          if (vi === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillRect(x0 + frame, y0 + frame, iw - frame * 2, ih - frame * 2);
      }
    }

    // Border: match shape color if covered, otherwise dark
    ctx.strokeStyle = (si >= 0 && si < numOwned) ? (SHAPE_COLORS[si] || '#222') : '#222';
    ctx.lineWidth = 1.6;
    ctx.strokeRect(x0, y0, iw, ih);

    // Inner shape border (1px black)
    if (si >= 0 && si < numOwned && SHAPE_VERTICES[si] && SHAPE_DIMS[si]) {
      const frame = 5;
      const verts = SHAPE_VERTICES[si];
      const dims = SHAPE_DIMS[si];
      const aw = iw - frame * 2, ah = ih - frame * 2;
      const sc = Math.min(aw / dims[0], ah / dims[1]);
      const ox = x0 + frame + (aw - dims[0] * sc) / 2;
      const oy = y0 + frame + (ah - dims[1] * sc) / 2;
      ctx.beginPath();
      for (let vi = 0; vi < verts.length; vi++) {
        const px = ox + verts[vi][0] * sc;
        const py = oy + verts[vi][1] * sc;
        if (vi === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  // Hover highlight
  if (_dtHoverCell >= 0 && RES_GRID_RAW[_dtHoverCell]) {
    const hCol = _dtHoverCell % GRID_COLS, hRow = Math.floor(_dtHoverCell / GRID_COLS);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.strokeRect(P + hCol * C, P + hRow * C, C, C);
  }

  // --- Draw shape polygons (only unlocked shapes) ---
  for (let si = 0; si < numOwned; si++) {
    const p = s.sp[si];
    if (!p || p.x == null || p.y == null) continue;
    const verts = SHAPE_VERTICES[si];
    const dims = SHAPE_DIMS[si];
    if (!verts || !dims) continue;
    const color = SHAPE_COLORS[si] || '#888';
    const cxOff = dims[0] / 2, cyOff = dims[1] / 2;
    const angle = (p.rot || 0) * Math.PI / 180;
    const cosA = Math.cos(angle), sinA = Math.sin(angle);

    ctx.beginPath();
    for (let vi = 0; vi < verts.length; vi++) {
      const dx = verts[vi][0] - cxOff, dy = verts[vi][1] - cyOff;
      const rx = cxOff + p.x + dx * cosA - dy * sinA;
      const ry = cyOff + p.y + dx * sinA + dy * cosA;
      if (vi === 0) ctx.moveTo(_dtGameToCanvasX(rx), _dtGameToCanvasY(ry));
      else ctx.lineTo(_dtGameToCanvasX(rx), _dtGameToCanvasY(ry));
    }
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.globalAlpha = DT.shapeOpacity * 0.3;
    ctx.fill();
    ctx.globalAlpha = DT.shapeOpacity;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 4.5;
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // Wire canvas events (only once)
  if (!canvas._dtWired) {
    canvas._dtWired = true;
    canvas.addEventListener('mousedown', _dtCanvasMouseDown);
    canvas.addEventListener('mousemove', _dtCanvasMouseMove);
    canvas.addEventListener('mouseup', _dtCanvasMouseUp);
    canvas.addEventListener('mouseleave', _dtCanvasMouseLeave);
    canvas.addEventListener('contextmenu', _dtCanvasRightClick);
    canvas.addEventListener('wheel', _dtCanvasWheel, { passive: false });
  }
}

// --- Coordinate transforms ---
function _dtGameToCanvasX(gx) { return _DT_GRID_PAD + (gx - 15) / 30 * _DT_CELL; }
function _dtGameToCanvasY(gy) { return _DT_GRID_PAD + (gy - 24) / 30 * _DT_CELL; }
function _dtCanvasToGameX(cx) { return 15 + (cx - _DT_GRID_PAD) / _DT_CELL * 30; }
function _dtCanvasToGameY(cy) { return 24 + (cy - _DT_GRID_PAD) / _DT_CELL * 30; }

// --- Hit testing ---
function _dtCanvasCellAt(cx, cy) {
  const col = Math.floor((cx - _DT_GRID_PAD) / _DT_CELL);
  const row = Math.floor((cy - _DT_GRID_PAD) / _DT_CELL);
  if (col < 0 || col >= GRID_COLS || row < 0 || row >= GRID_ROWS) return -1;
  return row * GRID_COLS + col;
}

function _dtShapeHitTest(canvasX, canvasY) {
  if (!DT.editState) return -1;
  const s = DT.editState;
  const ctx = s.ctx || makeCtx(s.gl, s.saveCtx);
  const numOwned = Math.min(computeShapesOwnedAt(s.rLv, ctx), s.sp.length, SHAPE_VERTICES.length, 10);
  const gx = _dtCanvasToGameX(canvasX);
  const gy = _dtCanvasToGameY(canvasY);
  for (let si = numOwned - 1; si >= 0; si--) {
    const p = s.sp[si];
    if (!p || p.x == null || p.y == null) continue;
    const polygon = getShapePolygonAt(si, p.x, p.y, p.rot || 0);
    if (polygon && isPointInPolygon(gx, gy, polygon)) return si;
  }
  return -1;
}

// --- Canvas event handlers ---
function _dtCanvasMouseDown(e) {
  if (e.button !== 0) return;
  const canvas = e.target;
  const rect = canvas.getBoundingClientRect();
  const cx = e.clientX - rect.left;
  const cy = e.clientY - rect.top;

  if (DT.gridMode === 'shapes') {
    // Check shape hit
    const si = _dtShapeHitTest(cx, cy);
    if (si >= 0) {
      const p = DT.editState.sp[si];
      _dtShapeDrag = { shapeIdx: si, startX: e.clientX, startY: e.clientY, origX: p.x || 0, origY: p.y || 0, moved: false };
      canvas.classList.add('dt-shape-dragging');
      e.preventDefault();
      return;
    }
    // Hide shape rotate popup when clicking elsewhere
    const popup = document.getElementById('dt-shape-rotate-popup');
    if (popup) popup.style.display = 'none';
  } else {
    // Upgrades mode: grid cell click = upgrade
    const idx = _dtCanvasCellAt(cx, cy);
    if (idx >= 0 && RES_GRID_RAW[idx]) {
      _dtGridUp(idx);
    }
  }
}

function _dtCanvasMouseMove(e) {
  const canvas = e.target;
  const rect = canvas.getBoundingClientRect();
  const cx = e.clientX - rect.left;
  const cy = e.clientY - rect.top;

  // Shape drag
  if (_dtShapeDrag && DT.editState) {
    const d = _dtShapeDrag;
    const dx = (e.clientX - d.startX) / _DT_CELL * 30;
    const dy = (e.clientY - d.startY) / _DT_CELL * 30;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) d.moved = true;
    const p = DT.editState.sp[d.shapeIdx];
    if (p) {
      p.x = d.origX + dx;
      p.y = d.origY + dy;
      dtRebuildOverlay();
      dtRenderGridCanvas();
    }
    return;
  }

  // Hover: tooltip for grid cells
  const idx = _dtCanvasCellAt(cx, cy);
  if (idx !== _dtHoverCell) {
    _dtHoverCell = idx;
    if (idx >= 0 && RES_GRID_RAW[idx]) {
      _dtShowGridTip(e, idx);
    } else {
      _dtHideGridTip();
    }
    dtRenderGridCanvas();
  } else if (idx >= 0 && _dtGridTooltip && _dtGridTooltip.style.display !== 'none') {
    _dtGridTooltip.style.left = (e.clientX + 14) + 'px';
    _dtGridTooltip.style.top = (e.clientY + 14) + 'px';
  }

  // Cursor
  if (DT.gridMode === 'shapes') {
    const si2 = _dtShapeHitTest(cx, cy);
    canvas.style.cursor = si2 >= 0 ? 'grab' : 'default';
  } else {
    canvas.style.cursor = (idx >= 0 && RES_GRID_RAW[idx]) ? 'pointer' : 'default';
  }
}

function _dtCanvasMouseUp(e) {
  if (!_dtShapeDrag) return;
  const d = _dtShapeDrag;
  const canvas = document.getElementById('dt-grid-canvas');
  if (canvas) canvas.classList.remove('dt-shape-dragging');
  _dtShapeDrag = null;
  if (!d.moved) {
    // Click without drag -> show rotate popup
    _dtShowShapeRotatePopup(d.shapeIdx, e.clientX, e.clientY);
  }
  if (DT.editState) {
    // Move dragged shape to end of placement order (most recently placed = lowest priority)
    if (d.moved) _dtBumpShapePlaceOrder(d.shapeIdx);
    dtRecalcExpHr();
    dtRenderModal();
  }
}

function _dtShowShapeRotatePopup(si, clientX, clientY) {
  const popup = document.getElementById('dt-shape-rotate-popup');
  if (!popup || !DT.editState) return;
  const p = DT.editState.sp[si];
  if (!p) return;
  const color = SHAPE_COLORS[si] || '#888';
  const rot = Math.round(p.rot || 0);
  popup.innerHTML =
    `<span style="display:inline-flex;align-items:center;gap:3px;">` +
    `<button class="dt-sh-btn" data-rot="-15">&#8630;15</button>` +
    `<button class="dt-sh-btn" data-rot="-5">&#8630;5</button>` +
    `<span style="color:${color};font-weight:600;min-width:32px;text-align:center;">${rot}\u00b0</span>` +
    `<button class="dt-sh-btn" data-rot="5">5&#8631;</button>` +
    `<button class="dt-sh-btn" data-rot="15">15&#8631;</button>` +
    `</span>`;
    // Wire rotate buttons (fixes module-scope function access issue with inline onclick)
  popup.querySelectorAll('.dt-sh-btn').forEach(btn => {
    btn.addEventListener('click', () => _dtShapeRotate(si, parseInt(btn.dataset.rot)));
  });
  popup.style.display = 'block';
  // Position near canvas click
  const detail = document.getElementById('dt-detail');
  const detailRect = detail.getBoundingClientRect();
  popup.style.left = Math.max(0, clientX - detailRect.left - 60) + 'px';
  popup.style.top = Math.max(0, clientY - detailRect.top + 10) + 'px';
}

function _dtCanvasMouseLeave(e) {
  _dtHoverCell = -1;
  _dtHideGridTip();
  _dtCanvasMouseUp(e);
  dtRenderGridCanvas();
}

function _dtCanvasRightClick(e) {
  e.preventDefault();
  if (DT.gridMode !== 'upgrades') return;
  const canvas = e.target;
  const rect = canvas.getBoundingClientRect();
  const cx = e.clientX - rect.left;
  const cy = e.clientY - rect.top;
  const idx = _dtCanvasCellAt(cx, cy);
  if (idx >= 0 && RES_GRID_RAW[idx]) {
    _dtGridDown(idx);
  }
}

function _dtCanvasWheel(e) {
  if (!DT.editState || DT.gridMode !== 'shapes') return;
  const canvas = e.target;
  const rect = canvas.getBoundingClientRect();
  const cx = e.clientX - rect.left;
  const cy = e.clientY - rect.top;
  const si = _dtShapeHitTest(cx, cy);
  if (si < 0) return;
  e.preventDefault();
  _dtShapeRotate(si, e.deltaY > 0 ? 5 : -5);
}

// --- Tooltip ---
function _dtShowGridTip(e, idx) {
  const info = RES_GRID_RAW[idx];
  if (!info || !DT.editState) return;
  if (!_dtGridTooltip) {
    _dtGridTooltip = document.createElement('div');
    _dtGridTooltip.className = 'dt-gv-tooltip';
    document.body.appendChild(_dtGridTooltip);
  }
  const s = DT.editState;
  const name = info[0].replace(/_/g, ' ');
  const curLv = s.gl[idx] || 0;
  const maxLv = info[1];
  const goalCat = NODE_GOAL[idx] || '';
  const bonusPer = info[2];
  const baseBonus = bonusPer * curLv;
  const si = s.so[idx];
  const col = idx % GRID_COLS, row = Math.floor(idx / GRID_COLS);
  const coord = String.fromCharCode(65 + row) + (col + 1);
  const _ctx = s.ctx || makeCtx(s.gl, s.saveCtx);
  const abm = calcAllBonusMultiWith(s.gl, _ctx.hasComp55, _ctx.hasComp0DivOk);

  let html = `<span style="color:var(--cyan);font-weight:700;font-size:1.1em">${coord}</span> `;
  html += `<span style="color:var(--gold);font-weight:600">${name}</span><br>`;
  html += `<span style="color:var(--text2);font-size:.9em">Level: ${curLv} / ${maxLv}</span>`;
  if (goalCat) html += ` <span style="color:${NODE_GOAL_COLORS[goalCat] || '#888'};">[${goalCat}]</span>`;
  html += `<div style="color:var(--green);margin-top:2px;font-size:.9em">Base bonus: ${baseBonus.toFixed(1)}</div>`;

  // Shape multi
  if (si >= 0 && si < SHAPE_BONUS_PCT.length) {
    const shapePct = SHAPE_BONUS_PCT[si];
    const boosted = baseBonus * (1 + shapePct / 100);
    html += `<div style="color:${SHAPE_COLORS[si]||'#888'};margin-top:4px;font-size:.9em">${SHAPE_NAMES[si]} (+${shapePct}%): ${boosted.toFixed(1)}</div>`;
  }

  // All multi
  if (abm > 1) {
    let finalVal = baseBonus;
    if (si >= 0 && si < SHAPE_BONUS_PCT.length) finalVal *= (1 + SHAPE_BONUS_PCT[si] / 100);
    finalVal *= abm;
    html += `<div style="color:#aaf;font-size:.85em">All multi (${abm.toFixed(2)}x): ${finalVal.toFixed(1)}</div>`;
  }

  // Description with placeholders
  html += `<div style="color:#ccc;margin-top:4px;font-size:.9em">${_dtFormatDesc(idx, s)}</div>`;
  html += `<div style="color:#888;margin-top:4px;font-size:.8em">Click +1 - Right-click -1</div>`;

  _dtGridTooltip.innerHTML = html;
  _dtGridTooltip.style.display = 'block';
  const tipW = 260, tipH = 80;
  let tx = e.clientX + 14, ty = e.clientY + 14;
  if (tx + tipW > window.innerWidth) tx = e.clientX - tipW - 10;
  if (ty + tipH > window.innerHeight) ty = e.clientY - tipH - 10;
  _dtGridTooltip.style.left = tx + 'px';
  _dtGridTooltip.style.top = ty + 'px';
}

function _dtFormatDesc(nodeIdx, s) {
  const info = RES_GRID_RAW[nodeIdx];
  if (!info) return '';
  const lv = s.gl[nodeIdx] || 0;
  const bonusPerLv = info[2];
  const curBonus = bonusPerLv * lv;
  const multiStr = (1 + curBonus / 100).toFixed(2);
  const g = v => '<b style="color:var(--green)">' + v + '</b>';

  let desc = (info[3] || '').replace(/_/g, ' ');
  desc = desc.replace(/ ?@ ?/g, ' \u2014 ');
  if (nodeIdx === 173) desc = desc.replace('<', 'Arctis grid bonus');
  desc = desc.replace(/\|/g, g(lv));
  desc = desc.replace(/\{/g, g(curBonus));
  desc = desc.replace(/\}/g, g(multiStr));
  if (desc.includes('$')) {
    const v = _dtGridBonusMode2(nodeIdx, curBonus, s);
    desc = desc.replace(/\$/g, g(Math.round(v * 100) / 100));
  }
  if (desc.includes('^')) {
    const v = _dtGridBonusMode2(nodeIdx, curBonus, s);
    desc = desc.replace(/\^/g, g((1 + v / 100).toFixed(2)));
  }
  if (desc.includes('&')) {
    const olaVal = Number(optionsListData?.[499]) || 0;
    desc = desc.replace(/&/g, g(Math.floor(1e4 * (1 - 1 / (1 + olaVal / 100))) / 100));
  }
  return desc;
}

function _dtHideGridTip() {
  if (_dtGridTooltip) _dtGridTooltip.style.display = 'none';
}

// --- Grid cell unlock / upgrade / downgrade ---
function _dtIsGridCellUnlocked(idx, gl) {
  if (!RES_GRID_RAW[idx]) return false;
  if ((gl[idx] || 0) >= 1) return true;
  const col = idx % GRID_COLS;
  if ((col === 9 || col === 10) && idx >= 100 && idx <= 140) return true;
  const neighbors = [];
  if (idx >= GRID_COLS) neighbors.push(idx - GRID_COLS);
  if (idx < GRID_SIZE - GRID_COLS) neighbors.push(idx + GRID_COLS);
  if (col > 0) neighbors.push(idx - 1);
  if (col < GRID_COLS - 1) neighbors.push(idx + 1);
  for (const ni of neighbors) {
    if ((gl[ni] || 0) >= 1) return true;
  }
  return false;
}

function _dtGridUp(idx) {
  if (!DT.editState) return;
  const s = DT.editState;
  const info = RES_GRID_RAW[idx];
  if (!info) return;
  const avail = dtGridPointsAvail(s.gl, s.rLv, s.saveCtx);
  const unlocked = _dtIsGridCellUnlocked(idx, s.gl);
  if (!unlocked || avail <= 0 || (s.gl[idx] || 0) >= info[1]) return;
  s.gl[idx] = (s.gl[idx] || 0) + 1;
  s.ctx = makeCtx(s.gl, s.saveCtx);
  const newOwned = computeMagnifiersOwnedWith(s.gl, s.rLv, s.ctx);
  growMagPoolTyped(s.md, s.gl, s.rLv, newOwned);
  dtRecalcExpHr();
  dtRenderModal();
}

function _dtGridDown(idx) {
  if (!DT.editState || DT.modalNodeId === null) return;
  const s = DT.editState;
  if ((s.gl[idx] || 0) <= 0) return;
  // Can only remove points added beyond what the parent already had
  const node = dtGetNode(DT.modalNodeId);
  if (node && node.parentId !== null) {
    const parent = dtGetNode(node.parentId);
    if (parent) {
      const parentLv = parent.baseState.gl[idx] || 0;
      if ((s.gl[idx] || 0) <= parentLv) return; // locked from parent
    }
  }
  s.gl[idx]--;
  s.ctx = makeCtx(s.gl, s.saveCtx);
  const newOwned = computeMagnifiersOwnedWith(s.gl, s.rLv, s.ctx);
  while (s.md.length > newOwned) {
    const unIdx = s.md.findIndex(m => m.slot < 0);
    if (unIdx >= 0) s.md.splice(unIdx, 1);
    else s.md.pop();
  }
  dtRebuildOverlay();
  dtRecalcExpHr();
  dtRenderModal();
}

// --- Shape manipulation ---
function _dtShapeRotate(si, dRot) {
  if (!DT.editState) return;
  const p = DT.editState.sp[si];
  if (!p) return;
  p.rot = ((p.rot || 0) + dRot + 360) % 360;
  _dtBumpShapePlaceOrder(si);
  dtRebuildOverlay();
  dtRecalcExpHr();
  dtRenderModal();
}

function _dtShapeNudge(si, dx, dy) {
  if (!DT.editState) return;
  const p = DT.editState.sp[si];
  if (!p) return;
  p.x = (p.x || 0) + dx;
  p.y = (p.y || 0) + dy;
  _dtBumpShapePlaceOrder(si);
  dtRebuildOverlay();
  dtRecalcExpHr();
  dtRenderModal();
}

/** Move shape si to the end of placement order (most recently placed = lowest priority). */
function _dtBumpShapePlaceOrder(si) {
  const s = DT.editState;
  if (!s || !s.spo) return;
  const idx = s.spo.indexOf(si);
  if (idx >= 0) s.spo.splice(idx, 1);
  s.spo.push(si);
}

export function dtRebuildOverlay() {
  if (!DT.editState) return;
  const s = DT.editState;
  const ctx = s.ctx || makeCtx(s.gl, s.saveCtx);
  const numOwned = Math.min(computeShapesOwnedAt(s.rLv, ctx), s.sp.length, SHAPE_VERTICES.length, 10);
  const so = new Array(GRID_SIZE).fill(-1);
  // Iterate in placement order: first-placed shape wins overlapping cells
  const order = s.spo || Array.from({length: numOwned}, (_, i) => i);
  for (const si of order) {
    if (si >= numOwned) continue;
    const p = s.sp[si];
    if (!p || p.x == null || p.y == null) continue;
    const cells = getShapeCellCoverage(si, p.x, p.y, p.rot || 0);
    for (const c of cells) {
      if (so[c] < 0) so[c] = si;
    }
  }
  s.so = so;
}
