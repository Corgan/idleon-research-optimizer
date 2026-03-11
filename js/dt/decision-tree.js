// ===== decision-tree.js - Tree UI, rendering, actions, and orchestrator =====
//
// TABLE OF CONTENTS (after split)
//   dt-state.js  - Shared state, accessors, cloneState, gridPointsAvail
//   dt-grid.js   - Unified Grid + Shape Canvas, obs editor, grid tooltip
//   dt-sim.js    - Simulation stepping, node CRUD, visibility, resim, model helpers
//   (this file)  - Tree layout/canvas, modal, pan/zoom, tooltips, actions, comparison

import {
  researchLevel,
} from '../state.js';
import {
  OCC_DATA, SHAPE_VERTICES,
} from '../game-data.js';
import {
  computeMagnifiersOwnedWith, computeOccurrencesToBeFound,
  computeShapesOwnedAt, magMaxForLevel,
} from '../sim-math.js';
import { makeCtx } from '../save/context.js';
import { optimizeMagsFor } from '../optimizers/magnifiers.js';
import { chooseMonoTargets } from '../optimizers/monos.js';
import { optimizeShapesFor } from '../sim-engine.js';
import { fmtTime, fmtTimePrecise, fmtVal } from '../renderers/format.js';
import { renderDashboard } from '../ui/dashboard.js';
import {
  _dtNodes, _dtCompareSet, DT,
  _dtGetNode, _dtGetChildren, _dtGetRoot,
  _dtCloneState, _dtGridPointsAvail,
  _DT_COL_W, _DT_ROW_H, _DT_NODE_W, _DT_NODE_H, _DT_PAD, _DT_BRANCH_COLORS,
} from './dt-state.js';
import {
  _dtRecalcExpHr, _dtResetGridState, _dtSetGridMode, _dtSetShapeOpacity,
  _dtRenderGridCanvas, _dtRenderObsEditor, _dtRebuildOverlay,
} from './dt-grid.js';
import {
  _dtBuildInitState, _dtCreateNode, _dtStepSim, _dtAdvanceAutoInsight,
  _dtIsNodeVisible, _dtVisibleParent, _dtVisibleChildren, _dtGetTotalTime,
  _dtNodeChangeSummary, _dtComputeChanges,
  _dtResimChildrenOf, _dtRebuildInsightTimelines,
} from './dt-sim.js';

// Re-export shared state for external consumers (app.js, state-io.js)
export { _dtNodes, _dtCompareSet, DT } from './dt-state.js';
export { _dtRenderGridCanvas, _dtSetGridMode, _dtSetShapeOpacity } from './dt-grid.js';

function _dtEvLabel(node) {
  const base = { 'start': '\u25B6 Start', 'decision': '\u270F\uFE0F Edit', 'level-up': '\u2B06 Lv Up', 'level+insight': '\u2B06+\uD83D\uDD2E Both' };
  if (base[node.event]) return base[node.event];
  if (node.event === 'insight-up' && node.insightObs && node.insightObs.length > 0) {
    const obs = OCC_DATA[node.insightObs[0]];
    const name = obs ? obs.name.replace(/_/g, ' ') : 'Obs ' + node.insightObs[0];
    const newLv = node.insightLvs ? node.insightLvs[node.insightObs[0]] : null;
    return '\uD83D\uDD2E ' + name + (newLv != null ? ' \u2192 LV ' + newLv : '');
  }
  return '\uD83D\uDD2E Insight';
}

// ===== TREE LAYOUT =====
export function _dtToggleLevelUpsOnly() {
  DT.showLevelUpsOnly = !DT.showLevelUpsOnly;
  const btn = document.getElementById('dt-lvl-toggle');
  if (btn) {
    btn.style.background = DT.showLevelUpsOnly ? '#4a6a3a' : '#1a1a2e';
    btn.style.color = DT.showLevelUpsOnly ? '#c8e6c0' : '#ccc';
  }
  // If currently editing a hidden node, deselect
  if (DT.modalNodeId !== null) {
    const node = _dtGetNode(DT.modalNodeId);
    if (node && !_dtIsNodeVisible(node)) {
      _dtCloseModal();
      document.getElementById('dt-detail').style.display = 'none';
    }
  }
  _dtRenderTree();
}
export function _dtToggleAutoInsight() {
  if (DT.modalNodeId === null) return;
  const node = _dtGetNode(DT.modalNodeId);
  if (!node) return;
  node.autoInsight = !node.autoInsight;
  _dtUpdateAutoInsightBtn(node);
  // Update save button label to reflect new mode
  const saveBtn = document.getElementById('dt-save');
  if (saveBtn && _dtGetChildren(node.id).length === 0) {
    if (node.event === 'start') {
      saveBtn.innerHTML = '&#128190; New Branch';
    } else {
      saveBtn.innerHTML = node.autoInsight ? '&#128190; Save &amp; Auto-Ins' : '&#128190; Save &amp; Next';
    }
  }
  _dtRenderTree();
}
function _dtUpdateAutoInsightBtn(node) {
  const btn = document.getElementById('dt-auto-insight');
  if (!btn) return;
  const on = node && node.autoInsight;
  btn.style.background = on ? '#4a3a6a' : '#1a1a2e';
  btn.style.color = on ? '#d4b8f0' : '#ccc';
  btn.style.borderColor = on ? '#ce93d8' : '#555';
}
function _dtLayout() {
  if (_dtNodes.length === 0) return;
  const root = _dtGetRoot();
  if (!root) return;

  // Assign branch indices for coloring
  let branchCounter = 0;
  function assignBranch(node, brIdx) {
    node._branchIdx = brIdx;
    const children = _dtGetChildren(node.id);
    for (let i = 0; i < children.length; i++) {
      assignBranch(children[i], i === 0 ? brIdx : ++branchCounter);
    }
  }
  assignBranch(root, branchCounter++);

  // Compute total time for every node
  for (const n of _dtNodes) n._totalTime = _dtGetTotalTime(n);

  // Start's direct children (decision edits at t=0) get a small offset
  // so they don't overlap the start node visually.
  for (const n of _dtNodes) {
    if (n.parentId !== null && _dtGetNode(n.parentId)?.event === 'start' && n._totalTime === 0) {
      n._totalTime = -0.001; // tiny negative -> will sort right after start
    }
  }
  // Ensure start itself is the earliest
  if (root._totalTime === 0) root._totalTime = -0.002;

  // Collect all unique total-times from VISIBLE nodes and sort them to build time columns
  const visibleNodes = _dtNodes.filter(n => _dtIsNodeVisible(n));
  const timeSet = [...new Set(visibleNodes.map(n => n._totalTime))].sort((a, b) => a - b);
  const minColW = _DT_COL_W;
  const timeToX = new Map();
  let cumX = 0;
  for (let i = 0; i < timeSet.length; i++) {
    timeToX.set(timeSet[i], cumX);
    if (i < timeSet.length - 1) {
      const gap = timeSet[i + 1] - timeSet[i];
      // Synthetic gaps (start -> edit) get just minimum spacing
      if (gap < 0.01) {
        cumX += minColW;
      } else {
        // Square-root scale: compresses large gaps, preserves small ones
        // sqrt(gap_in_hours) * scale + minimum
        cumX += minColW + Math.sqrt(gap) * 50;
      }
    }
  }

  // Recursive layout: depth-first, only visible nodes get positions
  let nextLeafY = 0;
  function layout(node) {
    if (!_dtIsNodeVisible(node)) {
      // Skip hidden nodes, layout their children directly
      for (const ch of _dtGetChildren(node.id)) layout(ch);
      return;
    }
    node._x = _DT_PAD + (timeToX.get(node._totalTime) || 0);
    // Visible children = own visible children + visible descendants of hidden children
    const visChildren = _dtVisibleChildren(node.id);
    if (visChildren.length === 0) {
      node._y = _DT_PAD + nextLeafY * _DT_ROW_H;
      nextLeafY++;
    } else {
      for (const ch of visChildren) layout(ch);
      const ys = visChildren.map(c => c._y);
      node._y = (Math.min(...ys) + Math.max(...ys)) / 2;
    }
  }
  layout(root);
}

// ===== CANVAS RENDERER =====
export function _dtRenderTree() {
  const wrap = document.getElementById('dt-tree-wrap');
  const canvas = document.getElementById('dt-tree-canvas');
  if (!canvas || _dtNodes.length === 0) { wrap.style.display = 'none'; return; }
  wrap.style.display = 'block';
  _dtLayout();

  const dpr = window.devicePixelRatio || 1;
  const visNodes = _dtNodes.filter(n => _dtIsNodeVisible(n));
  const maxX = Math.max(...visNodes.map(n => n._x)) + _DT_NODE_W + _DT_PAD * 2;
  const maxY = Math.max(...visNodes.map(n => n._y)) + _DT_NODE_H + _DT_PAD * 2;
  // Bake zoom into canvas so text renders at native resolution
  const z = DT.treeZoom;
  canvas.width = maxX * z * dpr;
  canvas.height = maxY * z * dpr;
  canvas.style.width = (maxX * z) + 'px';
  canvas.style.height = (maxY * z) + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(z * dpr, z * dpr);
  ctx.clearRect(0, 0, maxX, maxY);

  // Draw connection lines (between visible nodes)
  for (const node of visNodes) {
    const vParent = _dtVisibleParent(node);
    if (!vParent) continue;
    const x1 = vParent._x + _DT_NODE_W;
    const y1 = vParent._y + _DT_NODE_H / 2;
    const x2 = node._x;
    const y2 = node._y + _DT_NODE_H / 2;
    const lineEvColors = { 'start': '#aaa', 'decision': '#ffa726', 'level-up': '#ffd700', 'insight-up': '#ce93d8', 'level+insight': '#4dd0e1' };
    ctx.strokeStyle = lineEvColors[node.event] || '#888';
    ctx.lineWidth = 2;
    ctx.beginPath();
    const cpx = (x1 + x2) / 2;
    ctx.moveTo(x1, y1);
    ctx.bezierCurveTo(cpx, y1, cpx, y2, x2, y2);
    ctx.stroke();
  }

  // Draw nodes (only visible)
  for (const node of visNodes) {
    const x = node._x, y = node._y;
    const isSelected = _dtCompareSet.has(node.id);
    const isActive = node.id === DT.modalNodeId;
    const isLeaf = _dtVisibleChildren(node.id).length === 0;
    const nodeEvColors = { 'start': '#aaa', 'decision': '#ffa726', 'level-up': '#ffd700', 'insight-up': '#ce93d8', 'level+insight': '#4dd0e1' };
    const evColor = nodeEvColors[node.event] || '#888';

    // Card background
    ctx.fillStyle = isSelected ? '#1a2a1a' : isActive ? '#1e1e3a' : '#1a1a2e';
    ctx.strokeStyle = isSelected ? '#4caf50' : isActive ? '#64b5f6' : evColor;
    ctx.lineWidth = isSelected ? 2.5 : isActive ? 2.5 : isLeaf ? 2 : 1.4;
    _dtRoundRect(ctx, x, y, _DT_NODE_W, _DT_NODE_H, 8);
    ctx.fill();
    ctx.stroke();

    // Clip text to node bounds
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, _DT_NODE_W, _DT_NODE_H);
    ctx.clip();

    // Event badge
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.fillStyle = evColor;
    ctx.fillText(_dtEvLabel(node), x + 8, y + 13);

    // Level + Exp/hr
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.fillStyle = '#eee';
    ctx.fillText('Lv ' + node.rLv, x + 8, y + 28);
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillStyle = '#81c784';
    ctx.fillText(fmtVal(node.expHr) + '/hr', x + 55, y + 28);

    // Exp/hr diff from visible parent
    const vPar = _dtVisibleParent(node);
    if (vPar) {
      if (vPar.expHr > 0) {
        const diff = node.expHr - vPar.expHr;
        if (diff !== 0) {
          const pct = ((diff / vPar.expHr) * 100).toFixed(1);
          const sign = diff >= 0 ? '+' : '';
          ctx.font = '9px system-ui, sans-serif';
          ctx.fillStyle = diff >= 0 ? '#81c784' : '#e57373';
          ctx.fillText(sign + fmtVal(diff) + ' (' + sign + pct + '%)', x + 8, y + 39);
        }
      }
    }

    // Time from start
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillStyle = '#888';
    const totalTimeFromRoot = _dtGetTotalTime(node);
    ctx.fillText(fmtTimePrecise(totalTimeFromRoot), x + 8, y + 52);

    // Grid points indicator
    const avail = _dtGridPointsAvail(node.baseState.gl, node.rLv);
    if (avail > 0) {
      ctx.font = 'bold 10px system-ui, sans-serif';
      ctx.fillStyle = '#ffd700';
      ctx.fillText('+' + avail + 'pts', x + 80, y + 52);
    }

    // Leaf indicator
    if (isLeaf) {
      ctx.font = '10px system-ui, sans-serif';
      ctx.fillStyle = evColor;
      ctx.fillText('\u25BA', x + _DT_NODE_W - 14, y + _DT_NODE_H / 2 + 3);
    }

    // Auto-insight indicator
    if (node.autoInsight) {
      ctx.font = 'bold 9px system-ui, sans-serif';
      ctx.fillStyle = '#ce93d8';
      ctx.fillText('AI\u25B8', x + _DT_NODE_W - 22, y + 13);
    }

    ctx.restore(); // end node clip
  }
}

function _dtRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ===== TREE CANVAS PAN + CLICK + ZOOM =====

export function _dtTreeMouseDown(e) {
  if (e.button !== 0) return;
  // Ignore events from UI overlays inside the wrap
  if (e.target.closest('#dt-detail, #dt-comparison, #dt-top-controls, #dt-zoom-controls')) return;
  e.preventDefault(); // prevent text selection
  DT.treeDrag = { startX: e.clientX, startY: e.clientY, panX: DT.treePan.x, panY: DT.treePan.y, moved: false };
  e.currentTarget.style.cursor = 'grabbing';
  // Pointer capture keeps events flowing to the wrap even when cursor leaves it
  e.currentTarget.setPointerCapture(e.pointerId);
}
export function _dtTreeMouseMove(e) {
  if (DT.treeDrag) {
    const dx = e.clientX - DT.treeDrag.startX;
    const dy = e.clientY - DT.treeDrag.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) DT.treeDrag.moved = true;
    DT.treePan.x = DT.treeDrag.panX + dx;
    DT.treePan.y = DT.treeDrag.panY + dy;
    const canvas = document.getElementById('dt-tree-canvas');
    if (canvas) _dtApplyTreeTransform(canvas);
    _dtHideTreeTooltip();
    return;
  }
  // Hover detection for tooltip
  const canvas = document.getElementById('dt-tree-canvas');
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const mx = (e.clientX - rect.left) / rect.width * (parseFloat(canvas.style.width) / DT.treeZoom);
  const my = (e.clientY - rect.top) / rect.height * (parseFloat(canvas.style.height) / DT.treeZoom);
  let found = null;
  for (const node of _dtNodes) {
    if (!_dtIsNodeVisible(node)) continue;
    if (mx >= node._x && mx <= node._x + _DT_NODE_W && my >= node._y && my <= node._y + _DT_NODE_H) {
      found = node; break;
    }
  }
  if (found !== DT.treeHoverNode) {
    DT.treeHoverNode = found;
    if (found) _dtShowTreeTooltip(found, e.clientX, e.clientY);
    else _dtHideTreeTooltip();
  } else if (found) {
    // Update position
    const tip = document.getElementById('dt-tree-tooltip');
    if (tip) { tip.style.left = (e.clientX + 12) + 'px'; tip.style.top = (e.clientY + 12) + 'px'; }
  }
}
export function _dtTreeMouseUp(e) {
  const wasDrag = DT.treeDrag && DT.treeDrag.moved;
  DT.treeDrag = null;
  const wrap = document.getElementById('dt-tree-wrap');
  if (wrap) {
    wrap.style.cursor = 'grab';
    if (wrap.hasPointerCapture(e.pointerId)) wrap.releasePointerCapture(e.pointerId);
  }
  if (wasDrag) return;
  // Ignore events from UI overlays inside the wrap
  if (e.target.closest('#dt-detail, #dt-comparison, #dt-top-controls, #dt-zoom-controls')) return;
  // Click - find node
  const canvas = document.getElementById('dt-tree-canvas');
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const mx = (e.clientX - rect.left) / rect.width * (parseFloat(canvas.style.width) / DT.treeZoom);
  const my = (e.clientY - rect.top) / rect.height * (parseFloat(canvas.style.height) / DT.treeZoom);
  for (const node of _dtNodes) {
    if (!_dtIsNodeVisible(node)) continue;
    if (mx >= node._x && mx <= node._x + _DT_NODE_W && my >= node._y && my <= node._y + _DT_NODE_H) {
      _dtOpenModal(node.id);
      return;
    }
  }
  // Clicked empty space - deselect
  _dtCloseModal();
  document.getElementById('dt-detail').style.display = 'none';
  _dtRenderTree();
}
export function _dtTreeMouseLeave() {
  // Only clear hover state, not drag (drag is handled globally now)
  DT.treeHoverNode = null;
  _dtHideTreeTooltip();
  if (!DT.treeDrag) {
    const wrap = document.getElementById('dt-tree-wrap');
    if (wrap) wrap.style.cursor = 'grab';
  }
}

function _dtApplyTreeTransform(canvas) {
  if (!canvas) canvas = document.getElementById('dt-tree-canvas');
  if (!canvas) return;
  canvas.style.transformOrigin = '0 0';
  canvas.style.transform = `translate(${DT.treePan.x}px, ${DT.treePan.y}px)`;
  // Reposition editor overlay if open
  if (DT.modalNodeId !== null) {
    const node = _dtGetNode(DT.modalNodeId);
    if (node) _dtPositionEditor(node);
  }
}

export function _dtTreeWheel(e) {
  e.preventDefault();
  const delta = e.deltaY > 0 ? -0.1 : 0.1;
  const newZoom = Math.max(0.2, Math.min(2, DT.treeZoom + delta));
  // Zoom toward mouse pointer
  const wrap = document.getElementById('dt-tree-wrap');
  if (wrap) {
    const rect = wrap.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    DT.treePan.x = mx - (mx - DT.treePan.x) * (newZoom / DT.treeZoom);
    DT.treePan.y = my - (my - DT.treePan.y) * (newZoom / DT.treeZoom);
  }
  DT.treeZoom = newZoom;
  _dtRenderTree();
  _dtApplyTreeTransform();
  _dtUpdateZoomLabel();
}

export function _dtTreeZoomIn() {
  DT.treeZoom = Math.min(2, DT.treeZoom + 0.15);
  _dtRenderTree();
  _dtApplyTreeTransform();
  _dtUpdateZoomLabel();
}

export function _dtTreeZoomOut() {
  DT.treeZoom = Math.max(0.2, DT.treeZoom - 0.15);
  _dtRenderTree();
  _dtApplyTreeTransform();
  _dtUpdateZoomLabel();
}

export function _dtTreeZoomReset() {
  DT.treeZoom = 1;
  DT.treePan = { x: 0, y: 0 };
  _dtRenderTree();
  _dtApplyTreeTransform();
  _dtUpdateZoomLabel();
}

function _dtUpdateZoomLabel() {
  const lbl = document.getElementById('dt-zoom-label');
  if (lbl) lbl.textContent = Math.round(DT.treeZoom * 100) + '%';
}

// ===== TREE NODE TOOLTIP =====
function _dtShowTreeTooltip(node, cx, cy) {
  let tip = document.getElementById('dt-tree-tooltip');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'dt-tree-tooltip';
    tip.style.cssText = 'position:fixed;z-index:9999;background:#16162a;border:1px solid #555;border-radius:6px;padding:8px 10px;font-size:12px;color:#ddd;pointer-events:none;max-width:360px;line-height:1.5;white-space:pre-wrap;max-height:60vh;overflow-y:auto;';
    document.body.appendChild(tip);
  }
  const evColors = { 'start': '#aaa', 'decision': '#ffa726', 'level-up': '#ffd700', 'insight-up': '#ce93d8', 'level+insight': '#4dd0e1' };
  const totalTime = _dtGetTotalTime(node);
  const avail = _dtGridPointsAvail(node.baseState.gl, node.rLv);

  let html = `<div style="color:${evColors[node.event] || '#aaa'};font-weight:700;margin-bottom:4px;">${_dtEvLabel(node)}</div>`;
  html += `<div><span style="color:#aaa;">Level:</span> <b style="color:#eee;">${node.rLv}</b></div>`;
  html += `<div><span style="color:#aaa;">EXP/hr:</span> <b style="color:#81c784;">${fmtVal(node.expHr)}</b>`;
  if (node.parentId !== null) {
    const parent = _dtGetNode(node.parentId);
    if (parent && parent.expHr > 0) {
      const diff = node.expHr - parent.expHr;
      if (diff !== 0) {
        const pct = ((diff / parent.expHr) * 100).toFixed(1);
        const sign = diff >= 0 ? '+' : '';
        const color = diff >= 0 ? '#81c784' : '#e57373';
        html += ` <span style="color:${color};font-size:11px;">(${sign}${fmtVal(diff)}, ${sign}${pct}%)</span>`;
      }
    }
  }
  html += `</div>`;
  html += `<div><span style="color:#aaa;">Time:</span> <b>${fmtTimePrecise(totalTime)}</b></div>`;
  if (avail > 0) html += `<div><span style="color:#aaa;">Grid pts:</span> <b style="color:#ffd700;">+${avail}</b></div>`;

  // Changes from parent
  const changes = _dtNodeChangeSummary(node);
  if (changes.length > 0) {
    html += `<div style="margin-top:5px;padding-top:5px;border-top:1px solid #333;font-size:11px;">`;
    html += `<div style="color:#aaa;margin-bottom:2px;">Changes from parent:</div>`;
    for (const ch of changes) {
      html += `<div style="color:${ch.color || '#aaa'};">${ch.text}</div>`;
    }
    html += `</div>`;
  }

  // Insight timeline (from auto-insight chain)
  if (node.insightTimeline && node.insightTimeline.length > 0) {
    html += `<div style="margin-top:5px;padding-top:5px;border-top:1px solid #555;font-size:11px;">`;
    html += `<div style="color:#ce93d8;font-weight:600;margin-bottom:3px;">Auto-Insight Timeline (${node.insightTimeline.length})</div>`;
    for (const entry of node.insightTimeline) {
      const obsName = (OCC_DATA[entry.obs] ? OCC_DATA[entry.obs].name.replace(/_/g, ' ') : 'Obs ' + entry.obs);
      const monoStr = entry.monoTargets.map(t => OCC_DATA[t] ? OCC_DATA[t].name.replace(/_/g, ' ') : 'Obs ' + t).join(', ');
      html += `<div style="color:#ddd;"><span style="color:#888;">${fmtTimePrecise(entry.time)}</span> ${obsName} Lv ${entry.prevIL} &rarr; ${entry.newIL}</div>`;
      html += `<div style="color:#ad8;margin-left:12px;font-size:10px;">Mono &rarr; ${monoStr} <span style="color:#81c784;">${fmtVal(entry.expHr)}/hr</span></div>`;
    }
    html += `</div>`;
  }

  tip.innerHTML = html;
  tip.style.left = (cx + 12) + 'px';
  tip.style.top = (cy + 12) + 'px';
  tip.style.display = 'block';
}

function _dtHideTreeTooltip() {
  const tip = document.getElementById('dt-tree-tooltip');
  if (tip) tip.style.display = 'none';
}

// Info icon tooltip
let _dtInfoTip = null;
export function _dtShowInfoTip(e) {
  if (!_dtInfoTip) {
    _dtInfoTip = document.createElement('div');
    _dtInfoTip.style.cssText = 'position:fixed;z-index:9999;background:#16162a;border:1px solid #555;border-radius:6px;padding:8px 10px;font-size:12px;color:#ddd;pointer-events:none;max-width:280px;line-height:1.5;white-space:pre-wrap;';
    document.body.appendChild(_dtInfoTip);
  }
  _dtInfoTip.innerHTML = `<div style="color:var(--purple);font-weight:700;margin-bottom:4px;">Interactive Decision Tree</div>`
    + `<div style="color:#bbb;">Step through research events one at a time. Make choices at each node, then advance to the next event.</div>`
    + `<div style="color:#bbb;margin-top:4px;">Branch from any node to explore alternative paths and compare outcomes.</div>`;
  _dtInfoTip.style.left = (e.clientX + 12) + 'px';
  _dtInfoTip.style.top = (e.clientY + 12) + 'px';
  _dtInfoTip.style.display = 'block';
}
export function _dtMoveInfoTip(e) {
  if (_dtInfoTip) { _dtInfoTip.style.left = (e.clientX + 12) + 'px'; _dtInfoTip.style.top = (e.clientY + 12) + 'px'; }
}
export function _dtHideInfoTip() {
  if (_dtInfoTip) _dtInfoTip.style.display = 'none';
}

// ===== INLINE DETAIL PANEL =====
function _dtOpenModal(nodeId) {
  const node = _dtGetNode(nodeId);
  if (!node) return;
  DT.modalNodeId = nodeId;
  DT.editState = _dtCloneState({...node.baseState, rLv: node.rLv, rExp: node.rExp, expHr: node.expHr});
  // Init shape placement order if not already present
  if (!DT.editState.spo) {
    const ctx = makeCtx(DT.editState.gl);
    const n = Math.min(computeShapesOwnedAt(DT.editState.rLv, ctx), DT.editState.sp.length, 10);
    DT.editState.spo = Array.from({length: n}, (_, i) => i);
  }
  _dtRenderModal();
  _dtRenderTree();
  const detail = document.getElementById('dt-detail');
  detail.style.display = 'block';
  _dtPositionEditor(node);
}

function _dtPositionEditor(node) {
  const wrap = document.getElementById('dt-tree-wrap');
  const detail = document.getElementById('dt-detail');
  if (!wrap || !detail || !node) return;
  const wrapRect = wrap.getBoundingClientRect();
  // Node position in screen coords (account for pan + zoom)
  const nodeScreenX = node._x * DT.treeZoom + DT.treePan.x;
  const nodeScreenY = node._y * DT.treeZoom + DT.treePan.y;
  const nodeScreenW = _DT_NODE_W * DT.treeZoom;
  const nodeScreenH = _DT_NODE_H * DT.treeZoom;
  const detailW = detail.offsetWidth;
  const detailH = detail.offsetHeight;
  const gap = 12;
  // Prefer below the node; if not enough room, put above
  let top, left;
  const spaceBelow = wrapRect.height - (nodeScreenY + nodeScreenH + gap);
  const spaceAbove = nodeScreenY - gap;
  if (spaceBelow >= detailH || spaceBelow >= spaceAbove) {
    top = nodeScreenY + nodeScreenH + gap;
  } else {
    top = nodeScreenY - detailH - gap;
  }
  // Center horizontally on the node, clamp to wrap bounds
  left = nodeScreenX + nodeScreenW / 2 - detailW / 2;
  left = Math.max(8, Math.min(left, wrapRect.width - detailW - 8));
  top = Math.max(8, Math.min(top, wrapRect.height - detailH - 8));
  detail.style.left = left + 'px';
  detail.style.top = top + 'px';
}

function _dtCloseModal() {
  const popup = document.getElementById('dt-shape-rotate-popup');
  if (popup) popup.style.display = 'none';
  DT.modalNodeId = null;
  DT.editState = null;
  _dtResetGridState();
}


export function _dtRenderModal() {
  if (!DT.editState || DT.modalNodeId === null) return;
  const node = _dtGetNode(DT.modalNodeId);
  const s = DT.editState;

  // Title + inline status
  document.getElementById('dt-detail-title').textContent = _dtEvLabel(node) + ' - Lv ' + s.rLv;
  const totalTime = _dtGetTotalTime(node);
  const avail = _dtGridPointsAvail(s.gl, s.rLv);
  document.getElementById('dt-detail-status').innerHTML =
    `<b style="color:var(--green);">${fmtVal(s.expHr)}/hr</b>  - ` +
    `${fmtTimePrecise(totalTime)}  - ` +
    `<span style="color:${avail > 0 ? 'var(--gold)' : 'var(--text2)'};">${avail} pts</span>  - ` +
    `${computeOccurrencesToBeFound(s.rLv, s.occ)} obs  - ` +
    `${computeMagnifiersOwnedWith(s.gl, s.rLv, s.ctx || makeCtx(s.gl))} mags`;

  // Grid pts label
  document.getElementById('dt-grid-pts').textContent = `(${avail} pts)`;

  // Unified grid + shape canvas
  _dtRenderGridCanvas();

  // Obs editor
  _dtRenderObsEditor();

  // Show/hide buttons based on node type
  const delBtn = document.getElementById('dt-delete');
  const branchBtn = document.getElementById('dt-branch');
  const saveBtn = document.getElementById('dt-save');
  const autoInsBtn = document.getElementById('dt-auto-insight');
  if (delBtn) delBtn.style.display = node.parentId === null ? 'none' : '';
  if (branchBtn) branchBtn.style.display = node.event === 'start' ? 'none' : '';
  // Show auto-insight toggle only for leaves (nodes that will advance) or nodes with auto-insight chains
  const isLeaf = _dtGetChildren(node.id).length === 0;
  const hasAutoChain = _dtGetChildren(node.id).some(c => c._autoInsightChild);
  if (autoInsBtn) autoInsBtn.style.display = (isLeaf || node.event === 'start' || hasAutoChain) ? '' : 'none';
  _dtUpdateAutoInsightBtn(node);
  if (saveBtn) {
    if (node.event === 'start') {
      saveBtn.innerHTML = '&#128190; New Branch';
    } else if (!isLeaf) {
      saveBtn.innerHTML = '&#128190; Save &amp; Resim';
    } else {
      saveBtn.innerHTML = node.autoInsight ? '&#128190; Save &amp; Auto-Ins' : '&#128190; Save &amp; Next';
    }
  }
}


// ===== SAVE CHANGES (update in-place, then advance or resim) =====
export function _dtSaveChanges() {
  if (!DT.editState || DT.modalNodeId === null) return;
  const node = _dtGetNode(DT.modalNodeId);
  if (!node) return;
  const s = DT.editState;

  // Start node: never edited in-place - always fork a new branch
  if (node.event === 'start') {
    const editState = _dtCloneState(s);
    // Decision child captures user's edits at t=0
    const decNode = _dtCreateNode(node.id, 'decision', 0, editState);
    decNode.autoInsight = node.autoInsight; // propagate toggle to decision node
    // Sim forward from that decision
    if (decNode.autoInsight) {
      const finalNode = _dtAdvanceAutoInsight(decNode);
      if (!finalNode) {
        alert('Could not advance (sim did not find a research level-up within limit).');
        _dtRenderTree();
        return;
      }
      _dtRenderTree();
      _dtOpenModal(finalNode.id);
      return;
    }
    const simState = _dtCloneState(editState);
    const result = _dtStepSim(simState);
    if (!result) {
      alert('Could not advance (sim did not find an event within limit).');
      _dtRenderTree();
      return;
    }
    const eventNode = _dtCreateNode(decNode.id, result.event, result.time, result.state);
    eventNode.insightObs = result.insightObs;
    eventNode.insightLvs = result.insightLvs;
    _dtRenderTree();
    _dtOpenModal(eventNode.id);
    return;
  }

  // Update current node's state in-place
  node.baseState = _dtCloneState(s);
  node.rLv = s.rLv;
  node.rExp = s.rExp;
  node.expHr = s.expHr;

  const children = _dtGetChildren(node.id);
  if (children.length === 0) {
    // No children yet -> auto-advance: sim to next event, create child, open it
    if (node.autoInsight) {
      // Auto-insight: loop through insight-ups, create hidden nodes, stop at research level-up
      const finalNode = _dtAdvanceAutoInsight(node);
      if (!finalNode) {
        alert('Could not advance (sim did not find a research level-up within limit).');
        _dtRenderTree();
        return;
      }
      _dtRenderTree();
      _dtOpenModal(finalNode.id);
    } else {
      const simState = _dtCloneState({...node.baseState, rLv: node.rLv, rExp: node.rExp, expHr: node.expHr});
      const result = _dtStepSim(simState);
      if (!result) {
        alert('Could not advance (sim did not find an event within limit).');
        _dtRenderTree();
        return;
      }
      const newNode = _dtCreateNode(node.id, result.event, result.time, result.state);
      newNode.insightObs = result.insightObs;
      newNode.insightLvs = result.insightLvs;
      _dtRenderTree();
      _dtOpenModal(newNode.id);
    }
  } else {
    // Has children -> re-sim all descendants
    _dtResimChildrenOf(node);
    _dtRebuildInsightTimelines();
    _dtRenderTree();
    _dtRenderModal();
  }
}

// ===== COMPARISON =====
function _dtToggleCompare(nodeId) {
  if (_dtCompareSet.has(nodeId)) _dtCompareSet.delete(nodeId);
  else _dtCompareSet.add(nodeId);
  _dtRenderTree();
  _dtRenderComparison();
}

export function _dtRenderComparison() {
  const panel = document.getElementById('dt-comparison');
  const body = document.getElementById('dt-comparison-body');
  if (_dtCompareSet.size < 1) { panel.style.display = 'none'; return; }
  panel.style.display = 'block';

  const nodes = [..._dtCompareSet].map(id => _dtGetNode(id)).filter(Boolean);
  let html = '<div style="display:grid;grid-template-columns:repeat(' + Math.min(nodes.length, 4) + ',1fr);gap:10px;">';
  for (const n of nodes) {
    const totalTime = _dtGetTotalTime(n);
    const brColor = _DT_BRANCH_COLORS[n._branchIdx % _DT_BRANCH_COLORS.length];
    const avail = _dtGridPointsAvail(n.baseState.gl, n.rLv);
    const changes = _dtComputeChanges(n);
    html += `<div style="background:#1a1a2e;border:2px solid ${brColor};border-radius:8px;padding:12px;">`;
    html += `<div style="color:${brColor};font-weight:700;margin-bottom:6px;">Node #${n.id} <span style="color:var(--text2);font-weight:400;font-size:.8em;">${n.event}</span></div>`;
    html += `<div style="font-size:.85em;">`;
    html += `<div style="display:flex;justify-content:space-between;"><span style="color:var(--text2);">Level</span><b style="color:var(--gold);">${n.rLv}</b></div>`;
    html += `<div style="display:flex;justify-content:space-between;"><span style="color:var(--text2);">EXP/hr</span><b style="color:var(--green);">${fmtVal(n.expHr)}</b></div>`;
    html += `<div style="display:flex;justify-content:space-between;"><span style="color:var(--text2);">Time</span><b>${fmtTimePrecise(totalTime)}</b></div>`;
    html += `<div style="display:flex;justify-content:space-between;"><span style="color:var(--text2);">Grid pts avail</span><b style="color:var(--gold);">${avail}</b></div>`;
    if (changes.length > 0) {
      html += `<div style="margin-top:6px;padding-top:6px;border-top:1px solid #333;">`;
      for (const c of changes) html += `<div style="color:#ffa726;font-size:.82em;">\u270F ${c}</div>`;
      html += `</div>`;
    }
    html += `</div>`;
    html += `<div style="display:flex;gap:4px;margin-top:8px;">`;
    html += `<button class="btn btn-sm" style="background:#335;flex:1;" data-dt-open="${n.id}">Open</button>`;
    html += `<button class="btn btn-sm" style="background:#f44336;flex:1;" data-dt-delete="${n.id}">Delete</button>`;
    html += `<button class="btn btn-sm" style="background:#444;flex:1;" data-dt-remove="${n.id}">Remove</button>`;
    html += `</div>`;
    html += `</div>`;
  }
  html += '</div>';
  body.innerHTML = html;

  // Event delegation for comparison panel buttons
  body.addEventListener('click', (e) => {
    const openBtn = e.target.closest('[data-dt-open]');
    if (openBtn) { _dtOpenModal(Number(openBtn.dataset.dtOpen)); return; }
    const delBtn = e.target.closest('[data-dt-delete]');
    if (delBtn) { _dtDeleteNode(Number(delBtn.dataset.dtDelete)); _dtRenderComparison(); return; }
    const remBtn = e.target.closest('[data-dt-remove]');
    if (remBtn) { _dtToggleCompare(Number(remBtn.dataset.dtRemove)); return; }
  });
}

// ===== DELETE NODE + DESCENDANTS =====
export function _dtDeleteNode(nodeId) {
  const targetId = nodeId != null ? nodeId : DT.modalNodeId;
  if (targetId === null) return;
  const node = _dtGetNode(targetId);
  if (!node || node.parentId === null) return; // can't delete root

  // Collect all descendant IDs
  const toDelete = new Set();
  function collect(id) {
    toDelete.add(id);
    const n = _dtGetNode(id);
    if (n) for (const cid of n.childIds) collect(cid);
  }
  collect(node.id);

  // Remove from parent's childIds
  const parent = _dtGetNode(node.parentId);
  if (parent) parent.childIds = parent.childIds.filter(cid => !toDelete.has(cid));

  // Remove from compare set
  for (const id of toDelete) _dtCompareSet.delete(id);

  // Remove from nodes array
  for (let i = _dtNodes.length - 1; i >= 0; i--) {
    if (toDelete.has(_dtNodes[i].id)) _dtNodes.splice(i, 1);
  }

  // If the deleted node was being edited, open parent instead
  if (DT.modalNodeId !== null && toDelete.has(DT.modalNodeId)) {
    _dtCloseModal();
    if (parent) _dtOpenModal(parent.id);
  }
  _dtRenderTree();
  _dtRenderComparison();
}

// ===== RE-SIM DOWNSTREAM (in dt-sim.js) =====

// ===== RESET =====
export function _dtReset() {
  _dtNodes.length = 0;
  DT.nextId = 1;
  _dtCompareSet.clear();
  _dtCloseModal();
  document.getElementById('dt-detail').style.display = 'none';
  document.getElementById('dt-tree-wrap').style.display = 'none';
  document.getElementById('dt-comparison').style.display = 'none';
  DT.treePan = { x: 0, y: 0 };
  DT.treeZoom = 1;
  const tc = document.getElementById('dt-tree-canvas');
  if (tc) _dtApplyTreeTransform(tc);
  _dtUpdateZoomLabel();
}

// ===== BRANCH =====
// Creates a sibling copy of the current node (same event, same time),
// applies the current edit state, sims forward to the next event,
// then reverts the original node and opens the sim result.
export function _dtBranch() {
  if (!DT.editState || DT.modalNodeId === null) return;
  const node = _dtGetNode(DT.modalNodeId);
  if (!node || node.parentId === null) return; // can't branch from root
  const parent = _dtGetNode(node.parentId);
  if (!parent) return;
  const s = DT.editState;

  // Create a sibling copy of the current node with the edit state applied
  const forkState = _dtCloneState(s);
  const newNode = _dtCreateNode(parent.id, node.event, node.time, forkState);
  newNode.autoInsight = node.autoInsight;

  // Sim forward from the sibling to find next event
  if (newNode.autoInsight) {
    const finalNode = _dtAdvanceAutoInsight(newNode);
    if (!finalNode) {
      alert('Could not advance (sim did not find a research level-up within limit).');
      _dtOpenModal(node.id);
      _dtRenderTree();
      _dtOpenModal(newNode.id);
      return;
    }
    _dtOpenModal(node.id);
    _dtRenderTree();
    _dtOpenModal(finalNode.id);
    return;
  }
  const simState = _dtCloneState(forkState);
  const result = _dtStepSim(simState);
  if (!result) {
    alert('Could not advance (sim did not find an event within limit).');
    _dtOpenModal(node.id);
    _dtRenderTree();
    _dtOpenModal(newNode.id);
    return;
  }
  const eventNode = _dtCreateNode(newNode.id, result.event, result.time, result.state);
  eventNode.insightObs = result.insightObs;
  eventNode.insightLvs = result.insightLvs;

  // Revert current node, render, then open the sim result
  _dtOpenModal(node.id);
  _dtRenderTree();
  _dtOpenModal(eventNode.id);
}

// ===== START =====
export function _dtStart() {
  _dtReset();
  const initState = _dtBuildInitState();
  const root = _dtCreateNode(null, 'start', 0, initState);
  _dtRenderTree();
  _dtOpenModal(root.id);
}

// Auto-optimize mags for current edit state
export async function _dtAutoOptMags() {
  if (!DT.editState) return;
  const s = DT.editState;
  const ctx = makeCtx(s.gl);
  const mOwned = computeMagnifiersOwnedWith(s.gl, s.rLv, ctx);
  const mMax = magMaxForLevel(s.rLv);
  const optimized = await optimizeMagsFor({gl: s.gl, so: s.so, md: s.md, il: s.il, occ: s.occ, rLv: s.rLv, mOwned, mMax});
  s.md = optimized;
  s.md = chooseMonoTargets({gl: s.gl, so: s.so, md: s.md, il: s.il, ip: s.ip, occ: s.occ, rLv: s.rLv, mMax}, ctx, 72);
  _dtRecalcExpHr();
  _dtRenderModal();
}

// Auto-optimize shapes for current edit state
export function _dtAutoOptShapes() {
  if (!DT.editState) return;
  const s = DT.editState;
  const result = optimizeShapesFor({gl: s.gl, so: s.so, md: s.md, il: s.il, occ: s.occ, rLv: s.rLv});
  s.so = result.overlay;
  s.sp = result.positions;
  // Ensure unplaced shapes still have a position on the board (stacked at top-left)
  const numOwned = Math.min(computeShapesOwnedAt(s.rLv, makeCtx(s.gl)), SHAPE_VERTICES.length, 10);
  for (let si = 0; si < numOwned; si++) {
    if (!s.sp[si] || s.sp[si].x == null) {
      s.sp[si] = { x: 0, y: si * 5, rot: 0 };
    }
  }
  // Reset placement order to optimizer order (index order)
  s.spo = Array.from({length: numOwned}, (_, i) => i);
  _dtRecalcExpHr();
  _dtRenderModal();
}


// Insight ROI + Obs Unlock renderers extracted to render-analysis.js
export { renderInsightROI, renderObsUnlock } from '../renderers/render-analysis.js';


// Upgrade Eval + Shape Presets (split from former render-upgrades.js)
export { _saveShapeTiers } from '../renderers/shape-tiers.js';
export { _formatDesc, renderUpgradeEval } from '../renderers/upgrade-eval.js';

// ===== MAIN RENDER =====
export function renderAll() {
  renderDashboard();
  // Re-render the currently active tab
  const activeTab = document.querySelector('.tab.active');
  if (activeTab) {
    const t = activeTab.dataset.tab;
    if (t === 'insight-roi') renderInsightROI();
    else if (t === 'obs-unlock') renderObsUnlock();
    else if (t === 'shape-opt') renderUpgradeEval();
  }
  // Set default target level for optimizer (always current + 1)
  const targetInput = document.getElementById('opt-target-level');
  if (targetInput) {
    targetInput.value = researchLevel + 1;
  }
  const sbTarget = document.getElementById('sb-target-value');
  if (sbTarget) {
    sbTarget.value = researchLevel + 1;
  }
}
