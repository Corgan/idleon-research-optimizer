// dt-grid.js - Grid canvas, shape manipulation, and observation editor for the decision tree.
// Extracted from decision-tree.js.

import {
  DT, _dtGetNode, _dtGridPointsAvail,
} from './dt-state.js';
import { optionsListData } from '../save/data.js';
import { cachedBoonyCount } from '../state.js';
import {
  GRID_COLS, GRID_ROWS, GRID_SIZE, NODE_GOAL, NODE_GOAL_COLORS, OCC_DATA,
  RES_GRID_RAW, SHAPE_BONUS_PCT, SHAPE_COLORS, SHAPE_DIMS, SHAPE_NAMES, SHAPE_VERTICES,
} from '../game-data.js';
import {
  _buildKalMap, _gbWith, calcAllBonusMultiWith, computeMagnifiersOwnedWith,
  computeOccurrencesToBeFound, computeShapesOwnedAt, getKaleiMultiBase,
  isObsUsable, magMaxForLevel, obsBaseExp, simTotalExpWith,
} from '../sim-math.js';
import { eventShopOwned } from '../save/helpers.js';
import { makeCtx, simTotalExp } from '../save/context.js';
import {
  getShapeCellCoverage, getShapePolygonAt, isPointInPolygon,
} from '../optimizers/shapes-geo.js';
import { _growMagPoolTyped } from '../optimizers/mags.js';
import { hideTooltip, moveTooltip } from '../ui/dashboard.js';
// Circular import (safe - only used inside functions at runtime, not at module parse time)
import { _dtRenderModal } from './decision-tree.js';


// ===== Utility exports =====

export function _dtRecalcExpHr() {
  if (!DT.editState) return;
  const s = DT.editState;
  const ctx = makeCtx(s.gl);
  s.ctx = ctx;
  s.expHr = simTotalExpWith(s.gl, s.so, s.md, s.il, s.occ, s.rLv, ctx);
}

export function _dtResetGridState() {
  _dtShapeDrag = null;
  if (_dtGridTooltip) _dtGridTooltip.style.display = 'none';
}

export function _dtSetGridMode(mode) {
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

export function _dtSetShapeOpacity(val) {
  DT.shapeOpacity = val;
  _dtRenderGridCanvas();
}

// DT-aware version of _gridBonusMode2 (reads from edit state, not globals)
function _dtGridBonusMode2(nodeIdx, curBonus, s) {
  switch (nodeIdx) {
    case 31: return 25 * (s.gl[31] || 0);
    case 67: case 68: case 107: return curBonus * cachedBoonyCount;
    case 94: {
      let t = 0; for (let i = 0; i < s.il.length; i++) t += s.il[i] || 0;
      return curBonus * t;
    }
    case 112: {
      let f = 0; for (let i = 0; i < s.occ.length; i++) if (s.occ[i] >= 1) f++;
      return curBonus * f;
    }
    case 151: return Number(optionsListData?.[500]) || 0;
    case 168: return curBonus;
    default: return curBonus;
  }
}

﻿// ===== UNIFIED GRID + SHAPE CANVAS =====
let _dtGridTooltip = null;
let _dtShapeDrag = null; // {shapeIdx, startX, startY, origX, origY}
let _dtHoverCell = -1;   // cell index under mouse (for tooltip + highlight)
const _DT_CELL = 30;     // px per grid cell on canvas
const _DT_GRID_PAD = 16; // canvas padding

export function _dtRenderGridCanvas() {
  if (!DT.editState) return;
  const s = DT.editState;
  const sCtx = s.ctx || makeCtx(s.gl);
  const numOwned = Math.min(computeShapesOwnedAt(s.rLv, sCtx), s.sp.length, SHAPE_VERTICES.length, 10);
  const avail = _dtGridPointsAvail(s.gl, s.rLv);

  // Coverage summary
  const nodesInGrid = Object.keys(RES_GRID_RAW).length;
  let coveredNodes = 0;
  for (const idx of Object.keys(RES_GRID_RAW)) { if (s.so[Number(idx)] >= 0) coveredNodes++; }
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
  const ctx = s.ctx || makeCtx(s.gl);
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
      _dtRebuildOverlay();
      _dtRenderGridCanvas();
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
    _dtRenderGridCanvas();
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
    // Click without drag Ã¢â€ â€™ show rotate popup
    _dtShowShapeRotatePopup(d.shapeIdx, e.clientX, e.clientY);
  }
  if (DT.editState) {
    _dtRecalcExpHr();
    _dtRenderModal();
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
  _dtRenderGridCanvas();
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
  const _ctx = s.ctx || makeCtx(s.gl);
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
  html += `<div style="color:#888;margin-top:4px;font-size:.8em">Click +1 Ã‚Â· Right-click -1</div>`;

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
  const avail = _dtGridPointsAvail(s.gl, s.rLv);
  const unlocked = _dtIsGridCellUnlocked(idx, s.gl);
  if (!unlocked || avail <= 0 || (s.gl[idx] || 0) >= info[1]) return;
  s.gl[idx] = (s.gl[idx] || 0) + 1;
  s.ctx = makeCtx(s.gl);
  const newOwned = computeMagnifiersOwnedWith(s.gl, s.rLv, s.ctx);
  _growMagPoolTyped(s.md, s.gl, s.rLv, newOwned);
  _dtRecalcExpHr();
  _dtRenderModal();
}

function _dtGridDown(idx) {
  if (!DT.editState || DT.modalNodeId === null) return;
  const s = DT.editState;
  if ((s.gl[idx] || 0) <= 0) return;
  // Can only remove points added beyond what the parent already had
  const node = _dtGetNode(DT.modalNodeId);
  if (node && node.parentId !== null) {
    const parent = _dtGetNode(node.parentId);
    if (parent) {
      const parentLv = parent.baseState.gl[idx] || 0;
      if ((s.gl[idx] || 0) <= parentLv) return; // locked from parent
    }
  }
  s.gl[idx]--;
  s.ctx = makeCtx(s.gl);
  const newOwned = computeMagnifiersOwnedWith(s.gl, s.rLv, s.ctx);
  while (s.md.length > newOwned) {
    const unIdx = s.md.findIndex(m => m.slot < 0);
    if (unIdx >= 0) s.md.splice(unIdx, 1);
    else s.md.pop();
  }
  _dtRebuildOverlay();
  _dtRecalcExpHr();
  _dtRenderModal();
}

// --- Shape manipulation ---
function _dtShapeRotate(si, dRot) {
  if (!DT.editState) return;
  const p = DT.editState.sp[si];
  if (!p) return;
  p.rot = ((p.rot || 0) + dRot + 360) % 360;
  _dtRebuildOverlay();
  _dtRecalcExpHr();
  _dtRenderModal();
}

function _dtShapeNudge(si, dx, dy) {
  if (!DT.editState) return;
  const p = DT.editState.sp[si];
  if (!p) return;
  p.x = (p.x || 0) + dx;
  p.y = (p.y || 0) + dy;
  _dtRebuildOverlay();
  _dtRecalcExpHr();
  _dtRenderModal();
}

export function _dtRebuildOverlay() {
  if (!DT.editState) return;
  const s = DT.editState;
  const ctx = s.ctx || makeCtx(s.gl);
  const numOwned = Math.min(computeShapesOwnedAt(s.rLv, ctx), s.sp.length, SHAPE_VERTICES.length, 10);
  const so = new Array(GRID_SIZE).fill(-1);
  for (let si = 0; si < numOwned; si++) {
    const p = s.sp[si];
    if (!p || p.x == null || p.y == null) continue;
    const cells = getShapeCellCoverage(si, p.x, p.y, p.rot || 0);
    for (const c of cells) {
      if (so[c] < 0) so[c] = si;
    }
  }
  s.so = so;
}
const _DT_OBS_COLS = 8;
let _dtObsDragData = null; // {magIdx, fromSlot} or {poolType}

export function _dtRenderObsEditor() {
  if (!DT.editState) return;
  const s = DT.editState;
  const occTBF = computeOccurrencesToBeFound(s.rLv, s.occ);
  const mOwned = computeMagnifiersOwnedWith(s.gl, s.rLv, s.ctx || makeCtx(s.gl));
  const mMax = magMaxForLevel(s.rLv);

  // Pool counts
  let usedByType = [0, 0, 0];
  for (const m of s.md) { if (m.slot >= 0) usedByType[m.type]++; }
  const expectedK = Math.round((s.gl[72] || 0) + eventShopOwned(33));
  const expectedM = Math.round(s.gl[91] || 0);
  const expectedR = mOwned - expectedK - expectedM;
  const freeR = expectedR - usedByType[0];
  const freeM = expectedM - usedByType[1];
  const freeK = expectedK - usedByType[2];

  // Pool: draggable mag tokens for unplaced mags
  let poolHtml = '<div class="dt-obs-pool-row">';
  const poolTypes = [
    { type: 0, label: 'Mag', color: '#81c784', free: freeR },
    { type: 1, label: 'Mono', color: '#ce93d8', free: freeM },
    { type: 2, label: 'Kalei', color: '#4dd0e1', free: freeK },
  ];
  for (const pt of poolTypes) {
    poolHtml += `<div class="dt-obs-pool-group">`;
    poolHtml += `<span class="dt-obs-pool-label" style="color:${pt.color};">${pt.label}: ${pt.free}</span>`;
    if (pt.free > 0) {
      poolHtml += `<span class="dt-obs-mag type-${pt.type}" draggable="true" data-pool-type="${pt.type}"></span>`;
    }
    poolHtml += `</div>`;
  }
  poolHtml += `<span style="color:var(--text2);font-size:.8em;">Total: ${usedByType[0]+usedByType[1]+usedByType[2]}/${mOwned} Ã‚Â· Max/slot: ${mMax}</span>`;
  poolHtml += '</div>';
  document.getElementById('dt-obs-pool').innerHTML = poolHtml;

  // Build per-slot mag lookup & kalei map (once, not per-slot)
  const bySlot = {};
  for (let i = 0; i < s.md.length; i++) {
    const m = s.md[i];
    if (m.slot >= 0) {
      if (!bySlot[m.slot]) bySlot[m.slot] = [];
      bySlot[m.slot].push(i);
    }
  }
  const kalMap = _buildKalMap(s.md);

  // 8-col grid of obs slots
  const rows = Math.ceil(occTBF / _DT_OBS_COLS);
  let html = '<div class="dt-obs-grid">';
  for (let oi = 0; oi < rows * _DT_OBS_COLS; oi++) {
    if (oi >= 80 || oi >= occTBF) {
      html += '<div class="dt-obs-slot dt-obs-noslot"></div>';
      continue;
    }
    const usable = isObsUsable(oi, s.rLv, s.occ);
    if (!usable) {
      const name = OCC_DATA[oi] ? OCC_DATA[oi].name.replace(/_/g, ' ') : `#${oi}`;
      html += `<div class="dt-obs-slot" style="opacity:.3;"></div>`;
      continue;
    }
    const name = OCC_DATA[oi] ? OCC_DATA[oi].name.replace(/_/g, ' ') : `Slot ${oi}`;
    const slotMags = bySlot[oi] || [];
    html += `<div class="dt-obs-slot dt-obs-usable" data-obs="${oi}">`;
    html += `<span class="dt-obs-mags">`;
    for (const mi of slotMags) {
      const t = s.md[mi].type;
      html += `<span class="dt-obs-mag type-${t}" draggable="true" data-mag-idx="${mi}" title="Drag to move, right-click to remove"></span>`;
    }
    // Empty slots up to mMax
    for (let ei = slotMags.length; ei < mMax; ei++) {
      html += `<span style="width:14px;height:14px;border-radius:50%;border:1px dashed #444;opacity:.3;"></span>`;
    }
    html += `</span>`;
    html += `</div>`;
  }
  html += '</div>';
  document.getElementById('dt-obs-editor').innerHTML = html;

  // Wire up drag events + hover tooltips
  _dtObsWireDrag();
  _dtObsWireTooltips(bySlot, kalMap);
}

function _dtObsWireTooltips(bySlot, kalMap) {
  const editor = document.getElementById('dt-obs-editor');
  if (!editor || !DT.editState) return;
  const s = DT.editState;
  const tt = document.getElementById('tooltip');

  editor.querySelectorAll('.dt-obs-slot.dt-obs-usable').forEach(slot => {
    const oi = parseInt(slot.dataset.obs);
    slot.addEventListener('mouseenter', (ev) => {
      const occ = OCC_DATA[oi];
      const name = occ ? occ.name.replace(/_/g, ' ') : 'Obs #' + oi;
      const lv = s.il[oi] || 0;
      let mags = 0, monos = 0, kaleis = 0;
      const slotMags = bySlot[oi] || [];
      for (const mi of slotMags) {
        const t = s.md[mi].type;
        if (t === 0) mags++;
        else if (t === 1) monos++;
        else if (t === 2) kaleis++;
      }
      const adjKal = kalMap[oi] || 0;

      // DT-aware grid bonus: uses s.gl and s.so instead of globals
      const _ctx2 = s.ctx || makeCtx(s.gl);

      const basePerMag = obsBaseExp(oi);
      const gd101 = _gbWith(s.gl, s.so, 93, _ctx2);
      const gd101Multi = 1 + gd101 * lv / 100;
      const kalBase = getKaleiMultiBase(s.gl, s.so, _ctx2);
      const kalMulti = 1 + adjKal * kalBase;
      const perMagFinal = basePerMag * gd101Multi * kalMulti;
      const totalExp = perMagFinal * mags;
      const insightBonus = _gbWith(s.gl, s.so, 92, _ctx2) + _gbWith(s.gl, s.so, 91, _ctx2);
      const monoRate = 3 * (1 + insightBonus / 100) * kalMulti;
      const resMulti = simTotalExp({ gridLevels: s.gl, shapeOverlay: s.so, magData: s.md, insightLvs: s.il, occFound: s.occ }).multi;
      const totalFinal = totalExp * resMulti;

      let h = '<div style="color:var(--gold);font-weight:600">' + name + ' (#' + oi + ')</div>';
      h += '<div style="color:var(--text2);font-size:.9em">Insight LV: ' + lv + '</div>';
      h += '<div style="margin-top:4px;border-top:1px solid #555;padding-top:4px;">';
      h += '<div style="color:#aaa">Base EXP/mag: <span style="color:var(--text)">' + basePerMag.toFixed(2) + '</span></div>';
      if (gd101 > 0) h += '<div style="color:#aaa">GD101 (x' + gd101.toFixed(1) + '% x LV ' + lv + '): <span style="color:var(--text)">x' + gd101Multi.toFixed(3) + '</span></div>';
      if (adjKal > 0) h += '<div style="color:#aaa">Kalei (' + adjKal + ' adj x ' + (kalBase*100).toFixed(1) + '%): <span style="color:var(--cyan)">x' + kalMulti.toFixed(3) + '</span></div>';
      h += '<div style="color:#aaa">Per magnifier: <span style="color:var(--green)">' + perMagFinal.toFixed(2) + '</span></div>';
      if (mags > 0) {
        h += '<div style="color:var(--green);font-weight:700">Obs EXP/hr: ' + totalExp.toFixed(1) + ' (' + mags + ' mag' + (mags>1?'s':'') + ')</div>';
        h += '<div style="color:#aaa">ResearchEXPmulti: <span style="color:var(--cyan)">x' + resMulti.toFixed(2) + '</span></div>';
        h += '<div style="color:var(--green);font-weight:700">Final EXP/hr: ' + totalFinal.toFixed(1) + '</div>';
      } else h += '<div style="color:#666">No magnifiers assigned</div>';
      h += '</div>';
      if (monos > 0 || kaleis > 0) {
        h += '<div style="margin-top:4px;border-top:1px solid #555;padding-top:4px;">';
        if (monos > 0) h += '<div style="color:var(--purple)">Insight/hr: ' + (monoRate * monos).toFixed(2) + ' (' + monos + ' mono x ' + monoRate.toFixed(2) + ')</div>';
        if (kaleis > 0) h += '<div style="color:var(--cyan)">Kaleidoscopes on slot: ' + kaleis + '</div>';
        h += '</div>';
      }
      tt.innerHTML = h;
      tt.style.display = 'block';
      moveTooltip(ev);
    });
    slot.addEventListener('mouseleave', hideTooltip);
    slot.addEventListener('mousemove', moveTooltip);
  });
}

function _dtObsWireDrag() {
  const pool = document.getElementById('dt-obs-pool');
  const editor = document.getElementById('dt-obs-editor');
  if (!pool || !editor) return;

  // Pool mag drag start
  pool.querySelectorAll('.dt-obs-mag[data-pool-type]').forEach(el => {
    el.addEventListener('dragstart', (e) => {
      const type = parseInt(el.dataset.poolType);
      _dtObsDragData = { poolType: type };
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', 'mag');
    });
  });

  // Slot mag drag start + right-click remove
  editor.querySelectorAll('.dt-obs-mag[data-mag-idx]').forEach(el => {
    el.addEventListener('dragstart', (e) => {
      const magIdx = parseInt(el.dataset.magIdx);
      const s = DT.editState;
      _dtObsDragData = { magIdx, fromSlot: s.md[magIdx].slot };
      el.classList.add('dt-obs-mag-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', 'mag');
    });
    el.addEventListener('dragend', () => { el.classList.remove('dt-obs-mag-dragging'); _dtObsDragData = null; });
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const magIdx = parseInt(el.dataset.magIdx);
      _dtRemoveMagFromSlotDirect(magIdx);
    });
  });

  // Slot drop targets
  editor.querySelectorAll('.dt-obs-slot.dt-obs-usable').forEach(slot => {
    slot.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; slot.classList.add('dt-obs-dragover'); });
    slot.addEventListener('dragleave', () => { slot.classList.remove('dt-obs-dragover'); });
    slot.addEventListener('drop', (e) => {
      e.preventDefault();
      slot.classList.remove('dt-obs-dragover');
      const oi = parseInt(slot.dataset.obs);
      if (isNaN(oi) || !_dtObsDragData) return;
      _dtObsDrop(oi, _dtObsDragData);
      _dtObsDragData = null;
    });
  });

  // Drop on pool area = remove from slot
  pool.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });
  pool.addEventListener('drop', (e) => {
    e.preventDefault();
    if (_dtObsDragData && _dtObsDragData.magIdx != null) {
      _dtRemoveMagFromSlotDirect(_dtObsDragData.magIdx);
    }
    _dtObsDragData = null;
  });
}

function _dtObsDrop(targetSlot, data) {
  if (!DT.editState) return;
  const s = DT.editState;
  const mMax = magMaxForLevel(s.rLv);
  // Count mags on target
  let targetCount = 0;
  for (const m of s.md) { if (m.slot === targetSlot) targetCount++; }

  if (data.magIdx != null) {
    // Moving an existing mag
    if (targetCount >= mMax) return;
    s.md[data.magIdx].slot = targetSlot;
  } else if (data.poolType != null) {
    // Placing from pool
    if (targetCount >= mMax) return;
    // Find an unassigned mag of this type
    for (const m of s.md) {
      if (m.slot < 0 && m.type === data.poolType) {
        m.slot = targetSlot;
        break;
      }
    }
  }
  _dtRecalcExpHr();
  _dtRenderModal();
}

function _dtRemoveMagFromSlotDirect(magIdx) {
  if (!DT.editState) return;
  const m = DT.editState.md[magIdx];
  if (m && m.slot >= 0) {
    m.slot = -1;
    _dtRecalcExpHr();
    _dtRenderModal();
  }
}

function _dtCycleMagType(magIdx) {
  if (!DT.editState) return;
  const s = DT.editState;
  const m = s.md[magIdx];
  if (!m || m.slot < 0) return;
  const expectedK = Math.round((s.gl[72] || 0) + eventShopOwned(33));
  const expectedM = Math.round(s.gl[91] || 0);
  const mOwned = computeMagnifiersOwnedWith(s.gl, s.rLv, s.ctx || makeCtx(s.gl));
  const expectedR = mOwned - expectedK - expectedM;
  for (let attempt = 0; attempt < 3; attempt++) {
    const nextType = (m.type + 1 + attempt) % 3;
    let used = 0;
    for (const om of s.md) { if (om !== m && om.type === nextType) used++; }
    const limit = nextType === 0 ? expectedR : nextType === 1 ? expectedM : expectedK;
    if (used < limit) {
      m.type = nextType;
      break;
    }
  }
  _dtRecalcExpHr();
  _dtRenderModal();
}

function _dtAddMagToSlot(slotIdx) {
  if (!DT.editState) return;
  const s = DT.editState;
  const mOwned = computeMagnifiersOwnedWith(s.gl, s.rLv, s.ctx || makeCtx(s.gl));
  const mMax = magMaxForLevel(s.rLv);
  let slotCount = 0, totalPlaced = 0;
  for (const m of s.md) {
    if (m.slot >= 0) totalPlaced++;
    if (m.slot === slotIdx) slotCount++;
  }
  if (slotCount >= mMax || totalPlaced >= mOwned) return;
  for (const m of s.md) {
    if (m.slot < 0) {
      m.slot = slotIdx;
      _dtRecalcExpHr();
      _dtRenderModal();
      return;
    }
  }
}

function _dtRemoveMagFromSlot(slotIdx) {
  if (!DT.editState) return;
  const s = DT.editState;
  for (let i = s.md.length - 1; i >= 0; i--) {
    if (s.md[i].slot === slotIdx) {
      s.md[i].slot = -1;
      _dtRecalcExpHr();
      _dtRenderModal();
      return;
    }
  }
}


