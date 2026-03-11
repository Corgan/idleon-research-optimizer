// ===== upgrade-eval.js - Upgrade Evaluation & Grid Description =====
// Split from render-upgrades.js.

import {
  cachedBoonyCount,
  gridLevels,
  insightLvs,
  occFound,
  shapeTiers,
} from '../state.js';
import { optionsListData } from '../save/data.js';
import {
  GRID_COLS,
  GRID_SIZE,
  RES_GRID_RAW,
  SHAPE_COLORS,
  SHAPE_DIMS,
  SHAPE_VERTICES,
} from '../game-data.js';
import {
  sameShapeCell,
} from '../optimizers/shapes-geo.js';
import {
  optimizeShapePlacement,
} from '../optimizers/shapes.js';
import {
  fmtVal,
} from './format.js';
import {
  _cancelWorkerTask,
  _runWorkerTask,
} from './worker-pool.js';
import {
  attachTooltip,
  showGridTooltip,
} from '../ui/dashboard.js';
import { gridCoord } from '../grid-helpers.js';
// Circular import (safe: all uses are inside functions, not at module parse time)
import {
  _isBasePreset, _getActivePresetId, _renderTierList,
  _renderPresetSidebar, _tierOnChange, _updateAboveWarning,
} from './shape-tiers.js';


// Compute Grid_Bonus mode 2 (total/scaled values for $ and ^ placeholders)
function _gridBonusMode2(nodeIdx, curBonus, lvOverride) {
  switch (nodeIdx) {
    case 31: return 25 * (lvOverride != null ? lvOverride : (gridLevels[31] || 0));
    case 67: case 68: case 107: return curBonus * cachedBoonyCount;
    case 94: {
      let t = 0; for (let i = 0; i < insightLvs.length; i++) t += insightLvs[i] || 0;
      return curBonus * t;
    }
    case 112: {
      let f = 0; for (let i = 0; i < occFound.length; i++) if (occFound[i] >= 1) f++;
      return curBonus * f;
    }
    case 151: return Number(optionsListData?.[500]) || 0;
    case 168: return curBonus; // Glimbo trades not tracked
    default: return curBonus;
  }
}
// Format description with all game placeholders resolved
export function _formatDesc(nodeIdx, lvOverride) {
  const info = RES_GRID_RAW[nodeIdx];
  if (!info) return '';
  const lv = lvOverride != null ? lvOverride : (gridLevels[nodeIdx] || 0);
  const bonusPerLv = info[2];
  const curBonus = bonusPerLv * lv;
  const curBonusClean = parseFloat(curBonus.toFixed(4));
  const multiStr = (1 + curBonus / 100).toFixed(2);
  const g = v => '<b style="color:var(--green)">' + v + '</b>';

  let desc = (info[3] || '').replace(/_/g, ' ');
  desc = desc.replace(/ ?@ ?/g, ' \u2014 ');
  if (nodeIdx === 173) desc = desc.replace('<', 'Arctis grid bonus');
  desc = desc.replace(/\|/g, g(lv));
  desc = desc.replace(/\{/g, g(curBonusClean));
  desc = desc.replace(/\}/g, g(multiStr));
  if (desc.includes('$')) {
    const v = _gridBonusMode2(nodeIdx, curBonus, lvOverride);
    desc = desc.replace(/\$/g, g(Math.round(v * 100) / 100));
  }
  if (desc.includes('^')) {
    const v = _gridBonusMode2(nodeIdx, curBonus, lvOverride);
    desc = desc.replace(/\^/g, g((1 + v / 100).toFixed(2)));
  }
  if (desc.includes('&')) {
    const olaVal = Number(optionsListData?.[499]) || 0;
    desc = desc.replace(/&/g, g(Math.floor(1e4 * (1 - 1 / (1 + olaVal / 100))) / 100));
  }
  return desc;
}

let _lastOpt = null; // cached optimizeShapePlacement result for current render cycle
export function getLastOpt() { return _lastOpt; }
let _pureExpTotal = 0; // EXP/hr from pure EXP-only optimization (no tiers)

let _shapeOptGen = 0;
export async function renderUpgradeEval() {
  // Cancel any in-flight shape optimization worker
  _cancelWorkerTask('shapeOpt');
  const gen = ++_shapeOptGen;

  // Render the tier list and sidebar immediately (cheap)
  const locked = _isBasePreset(_getActivePresetId());
  _renderTierList('ue-tier-shape', shapeTiers, _tierOnChange, { locked });
  _updateAboveWarning();
  _renderPresetSidebar();

  // Show loading indicator with progress bar
  const sumEl = document.getElementById('ue-shape-summary');
  const gridDiv = document.getElementById('ue-grid');
  if (sumEl) sumEl.innerHTML =
    '<div style="padding:10px;color:var(--text2);font-size:.9em;">' +
    '<div id="shape-opt-status">Computing optimal shapes\u2026</div>' +
    '<div style="margin-top:6px;height:6px;background:#333;border-radius:3px;overflow:hidden;">' +
    '<div id="shape-opt-bar" style="height:100%;width:0%;background:var(--accent);border-radius:3px;transition:width .15s;"></div>' +
    '</div></div>';
  if (gridDiv) gridDiv.style.opacity = '0.4';

  // Yield to let the browser paint the loading state
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  if (gen !== _shapeOptGen) return; // preempted by newer call

  try {
    const statusEl = document.getElementById('shape-opt-status');
    const barEl = document.getElementById('shape-opt-bar');
    const result = await _runWorkerTask('shapeOpt', 'shapeOpt', { args: { opts: { useTiers: true }, needPure: shapeTiers.above.length > 0 } }, function(done, total, msg) {
      if (statusEl) statusEl.textContent = msg || ('Computing\u2026 ' + done + '/' + total);
      if (barEl) barEl.style.width = (total > 0 ? Math.round(done / total * 100) : 0) + '%';
    });
    if (gen !== _shapeOptGen) return; // preempted by newer call
    _lastOpt = result.primary;
    if (result.pure) {
      _pureExpTotal = result.pure.optimizedTotal;
    } else {
      _pureExpTotal = _lastOpt.phase1ExpTotal || 0;
    }
  } catch(err) {
    if (gen !== _shapeOptGen) return; // preempted - don't fallback for stale call
    console.error('Shape opt worker error:', err);
    // Fallback to synchronous computation
    _lastOpt = optimizeShapePlacement({ useTiers: true });
    if (shapeTiers.above.length > 0) {
      _pureExpTotal = optimizeShapePlacement().optimizedTotal;
    } else {
      _pureExpTotal = _lastOpt.phase1ExpTotal || 0;
    }
  }
  if (gridDiv) gridDiv.style.opacity = '';
  renderUEGrid();
}

function renderUEGrid() {
  const gridDiv = document.getElementById('ue-grid');
  if (!gridDiv) return;
  gridDiv.innerHTML = '';

  // Use cached optimizer result (set by renderUpgradeEval before this is called)
  if (!_lastOpt) return;
  const opt = _lastOpt;
  const optOverlay = opt.optimizedOverlay || new Array(GRID_SIZE).fill(-1);
  const COLS = GRID_COLS;

  // Summary bar
  const sumEl = document.getElementById('ue-shape-summary');
  if (sumEl) {
    if (opt.placements && opt.placements.length > 0) {
      const tierCost = _pureExpTotal - opt.optimizedTotal;
      const tierCostPct = _pureExpTotal > 0 ? tierCost / _pureExpTotal * 100 : 0;
      let html = '<div style="display:flex;gap:16px;flex-wrap:wrap;align-items:center;margin-bottom:8px;padding:6px 10px;background:var(--bg2);border-radius:6px;font-size:.85em;">'
        + '<span style="color:var(--text2);">Optimized EXP/hr:</span> '
        + '<span style="color:var(--green);font-weight:700;">' + fmtVal(opt.optimizedTotal) + '</span>'
        + (opt.improvPct > 0.01 ? ' <span style="color:var(--cyan);">(+' + opt.improvPct.toFixed(2) + '% vs current)</span>' : '');
      if (tierCost > 0.01) {
        html += ' <span style="color:#e74c3c;">(\u2212' + fmtVal(tierCost) + ' / \u2212' + tierCostPct.toFixed(2) + '% vs pure EXP)</span>';
      }
      html += ' <span style="color:var(--text2);margin-left:auto;">' + opt.placements.length + ' shapes placed</span>'
        + '</div>';
      sumEl.innerHTML = html;
    } else {
      sumEl.innerHTML = '';
    }
  }

  for (let i = 0; i < GRID_SIZE; i++) {
    const cell = document.createElement('div');
    cell.className = 'grid-cell';
    const info = RES_GRID_RAW[i];

    if (!info) {
      cell.classList.add('empty');
      gridDiv.appendChild(cell);
      continue;
    }

    const lv = gridLevels[i] || 0;
    const maxLv = info[1];
    cell.classList.add('active');
    if (lv >= maxLv) cell.classList.add('maxed');
    cell.innerHTML = '<div class="cell-name">' + gridCoord(i) + '</div>'
      + '<div class="cell-lv">' + lv + '/' + maxLv + '</div>';
    attachTooltip(cell, (ev) => showGridTooltip(ev, i, optOverlay));

    // Shape overlay - connected borders (same pattern as dashboard)
    const si = optOverlay[i];
    if (si >= 0) {
      const color = SHAPE_COLORS[si];
      const col = i % COLS;
      const top = !sameShapeCell(optOverlay, i, i - COLS);
      const bottom = !sameShapeCell(optOverlay, i, i + COLS);
      const left = col > 0 ? !sameShapeCell(optOverlay, i, i - 1) : true;
      const right = col < COLS - 1 ? !sameShapeCell(optOverlay, i, i + 1) : true;
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:absolute;inset:0;pointer-events:none;opacity:.5;'
        + 'background:' + color + '22;'
        + 'border-top:' + (top ? '2px solid ' + color : 'none') + ';'
        + 'border-bottom:' + (bottom ? '2px solid ' + color : 'none') + ';'
        + 'border-left:' + (left ? '2px solid ' + color : 'none') + ';'
        + 'border-right:' + (right ? '2px solid ' + color : 'none') + ';'
        + 'border-radius:' + (top && left ? '3px' : '0') + ' ' + (top && right ? '3px' : '0') + ' ' + (bottom && right ? '3px' : '0') + ' ' + (bottom && left ? '3px' : '0') + ';';
      cell.appendChild(overlay);
    }

    gridDiv.appendChild(cell);
  }

  // SVG shape polygon overlay
  const activeShapes = new Set();
  for (let i = 0; i < optOverlay.length; i++) {
    if (optOverlay[i] >= 0) activeShapes.add(optOverlay[i]);
  }
  if (activeShapes.size > 0) {
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.classList.add('shape-svg');
    svg.setAttribute('viewBox', '15 24 600 360');
    svg.setAttribute('preserveAspectRatio', 'none');
    for (const si of activeShapes) {
      const pos = opt.optimizedPositions[si];
      if (!pos) continue;
      const verts = SHAPE_VERTICES[si];
      const dims = SHAPE_DIMS[si];
      if (!verts || !dims) continue;
      const cx = dims[0] / 2, cy = dims[1] / 2;
      const angle = (pos.rot || 0) * Math.PI / 180;
      const cosA = Math.cos(angle), sinA = Math.sin(angle);
      const polyPts = verts.map(([vx, vy]) => {
        const dx = vx - cx, dy = vy - cy;
        return [Math.round(cx + pos.x + dx * cosA - dy * sinA),
                Math.round(cy + pos.y + dx * sinA + dy * cosA)];
      });
      const points = polyPts.map(([x,y]) => x + ',' + y).join(' ');
      const el = document.createElementNS(svgNS, 'polygon');
      el.setAttribute('points', points);
      el.setAttribute('fill', 'none');
      el.setAttribute('stroke', SHAPE_COLORS[si]);
      el.setAttribute('stroke-width', '2');
      el.setAttribute('stroke-linejoin', 'round');
      el.setAttribute('opacity', '0.7');
      svg.appendChild(el);
    }
    gridDiv.appendChild(svg);
  }
}
