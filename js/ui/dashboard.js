// ===== DASHBOARD.JS - Tooltips and dashboard rendering =====
// Extracted from app.js. Breakdown trees in dash-breakdowns.js.

import { S } from '../state.js';
import { cachedAFKRate } from '../save/data.js';
import {
  GRID_COLS,
  GRID_SIZE,
  OCC_DATA,
  RES_GRID_RAW,
  SHAPE_BONUS_PCT,
  SHAPE_COLORS,
  SHAPE_DIMS,
  SHAPE_NAMES,
  SHAPE_VERTICES,
  gridCoord,
} from '../game-data.js';
import {
  buildKalMap,
  countMagsOfType,
  gbWith,
  computeOccurrencesToBeFound,
  getKaleiMultiBase as _getKaleiMultiBasePure,
  insightExpReqAt,
  obsBaseExp,
  researchExpReq,
} from '../sim-math.js';
import { computeAFKGainsRate } from '../save/external.js';
import {
  buildSaveContext,
  computeGridPointsAvailable,
  getResearchCurrentExp,
  makeCtx,
  simTotalExp,
} from '../save/context.js';
import { sameShapeCell } from '../optimizers/shapes-geo.js';
import { fmtExact, fmtTime, fmtVal } from '../renderers/format.js';
import { moveTooltip, attachTooltip } from './tooltip.js';
import { formatDesc } from '../renderers/grid-desc.js';
import {
  buildExpBreakdownTree,
  buildAFKBreakdownTree,
  buildInsightBreakdownTree,
  renderBreakdownTree,
  resetTreeCounter,
} from './dash-breakdowns.js';


// Module-level render-cycle cache: set once at the top of renderDashboard(),
// used by private helpers that always display current S state.
let _dSaveCtx = null;
let _dCtx = null;
let _simOpts = null;

// --- Inline helpers (formerly in calculations.js → app.js, used only by dashboard) ---

function getGridBonus(idx) {
  const info = RES_GRID_RAW[idx];
  if (!info) return 0;
  const lv = _dSaveCtx.gridLevels[idx] || 0;
  return info[2] * lv;
}

function getGridBonusFinal(idx) {
  return gbWith(_dSaveCtx.gridLevels, _dSaveCtx.shapeOverlay, idx, _dCtx);
}

function buildKaleiMap() { return buildKalMap(_dSaveCtx.magData); }

function getKaleiMultiBase() {
  return _getKaleiMultiBasePure(_dSaveCtx.gridLevels, _dSaveCtx.shapeOverlay, _dCtx);
}

function _getKaleiMultiTot(obsIdx) {
  const kalMap = buildKaleiMap();
  return 1 + (kalMap[obsIdx] || 0) * getKaleiMultiBase();
}

function getResearchExpPerObs(obsIdx) {
  const count = countMagsOfType(_dSaveCtx.magData, 0, obsIdx);
  if (count === 0) return 0;
  const t = obsIdx;
  const basePerMag = (4 + (t/2 + Math.floor(t/4))) * (1 + Math.pow(t, 1 + t/15*0.4) / 10) + (Math.pow(t, 1.5) + 1.5*t);
  let rate = count * basePerMag;
  const gd101 = getGridBonusFinal(93);
  rate *= (1 + gd101 * (_dSaveCtx.insightLvs[t] || 0) / 100);
  rate *= _getKaleiMultiTot(t);
  return rate;
}

function getInsightExpPerObs(obsIdx) {
  const count = countMagsOfType(_dSaveCtx.magData, 1, obsIdx);
  if (count === 0) return 0;
  const insightBonus = getGridBonusFinal(92) + getGridBonusFinal(91);
  let rate = 3 * count * (1 + insightBonus / 100);
  rate *= _getKaleiMultiTot(obsIdx);
  return rate;
}

function getResearchExpRequired() {
  return researchExpReq(_dSaveCtx.researchLevel, _dSaveCtx.serverVarResXP);
}


// ===== SHAPE POLYGON =====
function computeShapePolygon(shapeIdx) {
  const pos = S.shapePositions[shapeIdx];
  if (!pos) return null;
  const verts = SHAPE_VERTICES[shapeIdx];
  const dims = SHAPE_DIMS[shapeIdx];
  if (!verts || !dims) return null;
  const cx = dims[0] / 2, cy = dims[1] / 2;
  const angle = (pos.rot || 0) * Math.PI / 180;
  const cosA = Math.cos(angle), sinA = Math.sin(angle);
  return verts.map(([vx, vy]) => {
    const dx = vx - cx, dy = vy - cy;
    return [Math.round(cx + pos.x + dx * cosA - dy * sinA),
            Math.round(cy + pos.y + dx * sinA + dy * cosA)];
  });
}


// ===== TOOLTIP HELPERS =====
export function showGridTooltip(e, idx, overlayOverride) {
  const tt = document.getElementById('tooltip');
  const info = RES_GRID_RAW[idx];
  if (!info) return;
  const lv = S.gridLevels[idx] || 0;
  const bonus = getGridBonus(idx);
  const finalBonus = getGridBonusFinal(idx);
  const ov = overlayOverride || S.shapeOverlay;
  const si = ov[idx];

  let html = '<div class="tt-name">' + gridCoord(idx) + ' - ' + info[0].replace(/_/g,' ') + '</div>';
  html += '<div class="tt-lv">Level: ' + lv + ' / ' + info[1] + '</div>';
  html += '<div class="tt-bonus">Base: ' + bonus.toFixed(1) + '</div>';
  if (si >= 0) {
    const afterShape = bonus * (1 + SHAPE_BONUS_PCT[si] / 100);
    html += '<div class="tt-shape" style="color:' + SHAPE_COLORS[si] + '">' + SHAPE_NAMES[si] + ' (+' + SHAPE_BONUS_PCT[si] + '%): ' + afterShape.toFixed(1) + '</div>';
  }
  if (S.allBonusMulti !== 1) {
    html += '<div style="color:var(--cyan)">Grid AllMulti (x' + S.allBonusMulti.toFixed(2) + '): ' + finalBonus.toFixed(1) + '</div>';
  } else if (si < 0 && bonus > 0) {
    html += '<div style="color:var(--gold)">Final: ' + finalBonus.toFixed(1) + '</div>';
  }
  html += '<div class="tt-desc">' + formatDesc(idx, undefined, _dSaveCtx) + '</div>';

  // Next level preview
  const maxLv = info[1];
  if (lv < maxLv) {
    html += '<div style="margin-top:4px;border-top:1px solid #444;padding-top:4px;color:#aaa;font-size:.9em;">';
    html += '<span style="color:var(--cyan)">LV ' + (lv+1) + ':</span> ' + formatDesc(idx, lv + 1, _dSaveCtx);
    html += '</div>';
  } else if (lv > 0) {
    html += '<div style="margin-top:4px;border-top:1px solid #444;padding-top:4px;color:#666;font-size:.9em;">Max level</div>';
  }

  tt.innerHTML = html;
  tt.style.display = 'block';
  moveTooltip(e);
}



function showObsTooltip(e, obsIdx, mags, monos, kaleis, adjKal) {
  const tt = document.getElementById('tooltip');
  const occ = OCC_DATA[obsIdx];
  const name = occ ? occ.name.replace(/_/g, ' ') : 'Obs #' + obsIdx;
  const lv = S.insightLvs[obsIdx] || 0;
  const t = obsIdx;

  const basePerMag = obsBaseExp(t);
  const gd101 = getGridBonusFinal(93);
  const gd101Multi = 1 + gd101 * lv / 100;
  const kalBase = getKaleiMultiBase();
  const kalMulti = 1 + adjKal * kalBase;
  const perMagFinal = basePerMag * gd101Multi * kalMulti;
  const totalExp = perMagFinal * mags;

  const insightBonus = getGridBonusFinal(92) + getGridBonusFinal(91);
  const monoRate = 3 * (1 + insightBonus / 100) * kalMulti;

  let html = '<div class="tt-name">' + name + ' (#' + obsIdx + ')</div>';
  html += '<div class="tt-lv">Insight LV: ' + lv + '</div>';
  html += '<div style="margin-top:4px;border-top:1px solid #555;padding-top:4px;">';
  html += '<div style="color:#aaa">Base EXP/mag: <span style="color:var(--text)">' + basePerMag.toFixed(2) + '</span></div>';
  if (gd101 > 0) html += '<div style="color:#aaa">GD101 (x' + gd101.toFixed(1) + '% x LV ' + lv + '): <span style="color:var(--text)">x' + gd101Multi.toFixed(3) + '</span></div>';
  if (adjKal > 0) html += '<div style="color:#aaa">Kalei (' + adjKal + ' adj x ' + (kalBase*100).toFixed(1) + '%): <span style="color:var(--cyan)">x' + kalMulti.toFixed(3) + '</span></div>';
  html += '<div style="color:#aaa">Per magnifier: <span style="color:var(--green)">' + perMagFinal.toFixed(2) + '</span></div>';
  const resMulti = simTotalExp(_simOpts, _dSaveCtx).multi;
  const totalFinal = totalExp * resMulti;
  if (mags > 0) {
    html += '<div style="color:var(--green);font-weight:700">Obs EXP/hr: ' + totalExp.toFixed(1) + ' (' + mags + ' mag' + (mags>1?'s':'') + ')</div>';
    html += '<div style="color:#aaa">ResearchEXPmulti: <span style="color:var(--cyan)">x' + resMulti.toFixed(2) + '</span></div>';
    html += '<div style="color:var(--green);font-weight:700">Final EXP/hr: ' + totalFinal.toFixed(1) + '</div>';
  } else html += '<div style="color:#666">No magnifiers assigned</div>';
  html += '</div>';
  if (monos > 0 || kaleis > 0) {
    html += '<div style="margin-top:4px;border-top:1px solid #555;padding-top:4px;">';
    if (monos > 0) html += '<div style="color:var(--purple)">Insight/hr: ' + (monoRate * monos).toFixed(2) + ' (' + monos + ' mono x ' + monoRate.toFixed(2) + ')</div>';
    if (kaleis > 0) html += '<div style="color:var(--cyan)">Kaleidoscopes on slot: ' + kaleis + '</div>';
    html += '</div>';
  }
  // Insight progress
  const iReq = insightExpReqAt(obsIdx, lv);
  const iProg = S.insightProgress[obsIdx] || 0;
  if (iReq > 0) {
    const pct = Math.min(100, iProg / iReq * 100);
    html += '<div style="margin-top:4px;border-top:1px solid #555;padding-top:4px;">';
    html += '<div style="color:#aaa">Insight EXP: <span style="color:var(--text)">' + iProg.toFixed(1) + ' / ' + iReq.toFixed(1) + '</span> <span style="color:#666">(' + pct.toFixed(1) + '%)</span></div>';
    const totalMonoRate = monoRate * monos;
    if (totalMonoRate > 0) {
      const hrsLeft = Math.max(0, iReq - iProg) / totalMonoRate;
      html += '<div style="color:var(--purple)">Time to LV ' + (lv+1) + ': ' + fmtTime(hrsLeft) + '</div>';
    }
    html += '</div>';
  }

  tt.innerHTML = html;
  tt.style.display = 'block';
  moveTooltip(e);
}

// ===== RENDER: DASHBOARD =====
export function renderDashboard(saveCtx) {
  resetTreeCounter();
  _dSaveCtx = saveCtx || buildSaveContext();
  _dCtx = makeCtx(_dSaveCtx.gridLevels, _dSaveCtx);
  _simOpts = { gridLevels: _dSaveCtx.gridLevels, shapeOverlay: _dSaveCtx.shapeOverlay, magData: _dSaveCtx.magData, insightLvs: _dSaveCtx.insightLvs, occFound: _dSaveCtx.occFound, researchLevel: _dSaveCtx.researchLevel };
  // Summary
  const sumDiv = document.getElementById('dash-summary');
  const curRate = simTotalExp(_simOpts, _dSaveCtx);
  const afkRate = cachedAFKRate || computeAFKGainsRate();
  const expReq = getResearchExpRequired();
  const expCur = getResearchCurrentExp(_dSaveCtx);
  const timeToNext = curRate.total > 0 ? (expReq - expCur) / curRate.total : Infinity;
  sumDiv.innerHTML = `
    <div style="display:flex;gap:24px;flex-wrap:wrap;justify-content:center;padding:12px;">
      <div style="text-align:center;"><div style="color:var(--text2);font-size:.8em;">Research Level</div><div style="color:var(--gold);font-size:1.4em;font-weight:700;">${S.researchLevel}</div></div>
      <div style="text-align:center;"><div style="color:var(--text2);font-size:.8em;">EXP/hr</div><div style="color:var(--green);font-size:1.4em;font-weight:700;">${fmtVal(curRate.total)}</div><div style="color:var(--text2);font-size:.7em;">${fmtExact(curRate.total)}</div></div>
      <div style="text-align:center;"><div style="color:var(--text2);font-size:.8em;">Time to Next LV</div><div style="color:var(--cyan);font-size:1.4em;font-weight:700;">${fmtTime(timeToNext)}</div></div>
      <div style="text-align:center;"><div style="color:var(--text2);font-size:.8em;">AFK Rate</div><div style="color:var(--text);font-size:1.4em;font-weight:700;">${(afkRate.rate * 100).toFixed(1)}%</div></div>
      <div style="text-align:center;"><div style="color:var(--text2);font-size:.8em;">Magnifiers</div><div style="color:var(--blue);font-size:1.4em;font-weight:700;">${S.magnifiersOwned}</div></div>
      <div style="text-align:center;"><div style="color:var(--text2);font-size:.8em;">Max/Slot</div><div style="color:var(--blue);font-size:1.4em;font-weight:700;">${S.magMaxPerSlot}</div></div>
      <div style="text-align:center;"><div style="color:var(--text2);font-size:.8em;">Grid Points</div><div style="color:var(--gold);font-size:1.4em;font-weight:700;">${computeGridPointsAvailable(S.researchLevel, S.gridLevels, _dSaveCtx.cachedSpelunkyUpg7)} free</div></div>
    </div>
    <div style="max-width:420px;margin:8px auto 4px;padding:0 12px;">
      <div style="height:22px;background:#1a1a2e;border-radius:11px;overflow:hidden;border:1px solid #333;">
        <div style="height:100%;width:${expReq > 0 ? Math.min(100, expCur / expReq * 100) : 0}%;background:linear-gradient(90deg,#e0e0e0,#fff);border-radius:11px;transition:width .3s;"></div>
      </div>
      <div style="text-align:center;font-size:.8em;font-weight:600;color:#fff;margin-top:4px;">Exp ${fmtVal(expCur)} / ${fmtVal(expReq)}</div>
    </div>`;

  // Grid - DOM-based with shape overlays, coordinate names, tooltips
  const gridDiv = document.getElementById('dash-grid');
  gridDiv.innerHTML = '';

  const COLS = GRID_COLS;

  for (let i = 0; i < GRID_SIZE; i++) {
    const cell = document.createElement('div');
    cell.className = 'grid-cell';
    const info = RES_GRID_RAW[i];
    if (info) {
      const lv = S.gridLevels[i] || 0;
      const maxLv = info[1];
      cell.classList.add('active');
      if (lv >= maxLv) cell.classList.add('maxed');
      cell.innerHTML = '<div class="cell-name">' + gridCoord(i) + '</div>' +
        '<div class="cell-lv">' + lv + '/' + maxLv + '</div>';
      attachTooltip(cell, (ev) => showGridTooltip(ev, i));
    } else {
      cell.classList.add('empty');
    }

    // Shape overlay - connected borders
    const si = S.shapeOverlay[i];
    if (si >= 0) {
      const color = SHAPE_COLORS[si];
      const col = i % COLS;
      const top = !sameShapeCell(S.shapeOverlay, i, i - COLS);
      const bottom = !sameShapeCell(S.shapeOverlay, i, i + COLS);
      const left = col > 0 ? !sameShapeCell(S.shapeOverlay, i, i - 1) : true;
      const right = col < COLS - 1 ? !sameShapeCell(S.shapeOverlay, i, i + 1) : true;
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
  for (let i = 0; i < S.shapeOverlay.length; i++) {
    if (S.shapeOverlay[i] >= 0) activeShapes.add(S.shapeOverlay[i]);
  }
  if (activeShapes.size > 0) {
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.classList.add('shape-svg');
    svg.setAttribute('viewBox', '15 24 600 360');
    svg.setAttribute('preserveAspectRatio', 'none');
    // Allow pointer events on shape polygons but pass through elsewhere
    svg.style.pointerEvents = 'none';
    for (const si of activeShapes) {
      const poly = computeShapePolygon(si);
      if (!poly) continue;

      // Shape polygon (interactive)
      const points = poly.map(([x,y]) => x + ',' + y).join(' ');
      const el = document.createElementNS(svgNS, 'polygon');
      el.setAttribute('points', points);
      el.setAttribute('fill', SHAPE_COLORS[si] + '08');
      el.setAttribute('stroke', SHAPE_COLORS[si]);
      el.setAttribute('stroke-width', '2');
      el.setAttribute('stroke-linejoin', 'round');
      el.setAttribute('opacity', '0.7');
      svg.appendChild(el);
    }
    gridDiv.appendChild(svg);
  }

  // Shape legend with rasterized footprints
  // Remove previous legend if any (prevents duplication on re-render)
  const oldLegend = gridDiv.parentNode.querySelector('.shape-legend');
  if (oldLegend) oldLegend.remove();
  if (activeShapes.size > 0) {
    const legend = document.createElement('div');
    legend.className = 'shape-legend';
    legend.style.cssText = 'margin-top:6px;display:flex;flex-wrap:wrap;gap:8px 16px;';
    const sortedShapes = Array.from(activeShapes).sort((a, b) => (SHAPE_BONUS_PCT[b] || 0) - (SHAPE_BONUS_PCT[a] || 0));
    for (const si of sortedShapes) {
      // Collect cells covered by this shape
      const cells = [];
      for (let ci = 0; ci < S.shapeOverlay.length; ci++) {
        if (S.shapeOverlay[ci] === si) cells.push(ci);
      }
      if (cells.length === 0) continue;
      const sc = SHAPE_COLORS[si] || '#888';

      // Build bounding box footprint
      let minC = Infinity, maxC = -Infinity, minR = Infinity, maxR = -Infinity;
      for (const c of cells) {
        const col = c % GRID_COLS, row = Math.floor(c / GRID_COLS);
        if (col < minC) minC = col; if (col > maxC) maxC = col;
        if (row < minR) minR = row; if (row > maxR) maxR = row;
      }
      const cellSet = new Set(cells);
      const w = maxC - minC + 1;
      const sz = 6;
      let fpHtml = '<div style="display:inline-grid;grid-template-columns:repeat(' + w + ',' + sz + 'px);gap:1px;flex-shrink:0;">';
      for (let row = minR; row <= maxR; row++) {
        for (let col = minC; col <= maxC; col++) {
          fpHtml += '<div style="width:' + sz + 'px;height:' + sz + 'px;background:' +
            (cellSet.has(row * GRID_COLS + col) ? sc + '88' : '#1a1a2e') +
            ';border-radius:1px;"></div>';
        }
      }
      fpHtml += '</div>';

      const item = document.createElement('div');
      item.style.cssText = 'display:flex;align-items:center;gap:4px;font-size:.75em;white-space:nowrap;';
      const coordStr = cells.map(c => gridCoord(c)).join(', ');
      item.innerHTML = fpHtml +
        '<span style="color:' + sc + ';font-weight:600;">' + SHAPE_NAMES[si] + '</span>' +
        ' <span style="opacity:.6;">(' + SHAPE_BONUS_PCT[si] + '%)</span>' +
        '<span style="opacity:.5;"> \u2192 </span>' +
        '<span style="opacity:.7;">' + coordStr + '</span>';
      legend.appendChild(item);
    }
    gridDiv.parentNode.insertBefore(legend, gridDiv.nextSibling);
  }

  // Observations - v1-style: 8 cols, full names, text mag indicators, EXP*multi, insight rate, hover tooltip
  const obsDiv = document.getElementById('dash-obs');
  obsDiv.innerHTML = '';
  const occTBF = computeOccurrencesToBeFound(S.researchLevel, S.occFound);
  const kalMap = buildKaleiMap();
  const resMulti = simTotalExp(_simOpts, _dSaveCtx).multi;

  for (let i = 0; i < Math.min(occTBF, OCC_DATA.length); i++) {
    const cell = document.createElement('div');
    const found = S.occFound[i] >= 1;
    cell.className = 'obs-cell ' + (found ? 'found' : 'not-found');

    const name = OCC_DATA[i] ? OCC_DATA[i].name.replace(/_/g,' ') : 'Obs #' + i;
    const lv = S.insightLvs[i] || 0;

    let mags = 0, monos = 0, kaleis = 0;
    for (const m of S.magData) {
      if (m.slot === i) {
        if (m.type === 0) mags++;
        else if (m.type === 1) monos++;
        else if (m.type === 2) kaleis++;
      }
    }

    const adjKal = kalMap[i] || 0;
    const expRate = getResearchExpPerObs(i);
    const expFinal = expRate * resMulti;
    const insightRate = getInsightExpPerObs(i);

    let magStr = '';
    if (mags) magStr += '<span style="color:#81c784">M:' + mags + '</span> ';
    if (monos) magStr += '<span style="color:#ce93d8">O:' + monos + '</span> ';
    if (kaleis) magStr += '<span style="color:#4dd0e1">K:' + kaleis + '</span> ';
    if (adjKal) magStr += '<span style="color:#ff9800">Adj:' + adjKal + '</span>';

    cell.innerHTML =
      '<div class="obs-name">' + name + '</div>' +
      '<div class="obs-lv">LV ' + lv + '</div>' +
      '<div class="obs-mag">' + (magStr || '\u2014') + '</div>' +
      '<div class="obs-rate">' + (expFinal > 0 ? fmtVal(expFinal) + ' exp <span style="color:var(--text2);font-size:.85em;">(' + fmtExact(expFinal) + ')</span>' : '') + (insightRate > 0 ? ' | ' + insightRate.toFixed(2) + ' ins' : '') + '</div>';
    attachTooltip(cell, (ev) => showObsTooltip(ev, i, mags, monos, kaleis, adjKal));
    obsDiv.appendChild(cell);
  }

  // EXP Rate Breakdown - nested tree
  const expDiv = document.getElementById('dash-exp-breakdown');
  {
    const tree = buildExpBreakdownTree(_dSaveCtx, _dCtx, _simOpts);
    renderBreakdownTree(tree, expDiv);
  }

  // AFK Rate Breakdown - nested tree
  const afkDiv = document.getElementById('dash-afk');
  {
    const afkTree = buildAFKBreakdownTree();
    renderBreakdownTree(afkTree, afkDiv);
    const effDiv = document.createElement('div');
    effDiv.style.cssText = 'margin-top:6px;font-size:.85em;color:var(--text2);';
    effDiv.innerHTML = 'Effective offline EXP/hr: <b style="color:var(--green);">' + fmtVal(curRate.total * Math.min(1, afkRate.rate)) + '</b>';
    afkDiv.appendChild(effDiv);
  }

  // Insight Multiplier Breakdown - nested tree
  const insightDiv = document.getElementById('dash-insight');
  if (insightDiv) {
    const insightTree = buildInsightBreakdownTree(_dSaveCtx, _dCtx);
    renderBreakdownTree(insightTree, insightDiv);
  }
}
