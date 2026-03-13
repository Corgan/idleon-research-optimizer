// ===== OPTIMIZER RENDER - Heavy HTML builders for optimizer result display =====
// Extracted from optimizer-ui.js.

import {
  GRID_COLS, GRID_ROWS, GRID_SIZE, NODE_GOAL_COLORS, OCC_DATA,
  RES_GRID_RAW, SHAPE_BONUS_PCT, SHAPE_COLORS, SHAPE_DIMS,
  SHAPE_NAMES, SHAPE_VERTICES, gridCoord,
} from '../game-data.js';
import {
  isGridCellUnlocked,
  researchExpReq,
} from '../sim-math.js';
import { buildSaveContext, getResearchCurrentExp } from '../save/context.js';
import { S } from '../state.js';
import { diffMDLayouts } from '../phase-diff.js';
import { sameShapeCell } from '../optimizers/shapes-geo.js';
import { fmtExp, fmtTime, fmtVal } from './format.js';

// Build HTML lines showing mag/monocle/kaleido diffs between a base layout and a grind layout
export function renderGrindLayoutDiff(baseMD, grindMD) {
  const gd = diffMDLayouts(baseMD, grindMD);
  const lines = [];
  const _fmtMoves = (moves) => moves.map(m => {
    const name = OCC_DATA[m.slot] ? OCC_DATA[m.slot].name.replace(/_/g,' ') : `#${m.slot}`;
    return m.delta > 0
      ? `<span style="color:var(--green);">+${m.delta}</span> \u2192 ${name}`
      : `<span style="color:var(--red);">-${-m.delta}</span> from ${name}`;
  }).join(' &nbsp; ');
  if (gd.mags.length > 0) {
    lines.push(`<div style="margin-left:8px;">Mags: ${_fmtMoves(gd.mags)}</div>`);
  }
  if (gd.kals.length > 0) {
    lines.push(`<div style="margin-left:8px;">Kaleido: ${_fmtMoves(gd.kals)}</div>`);
  }
  if (gd.monos.length > 0) {
    lines.push(`<div style="margin-left:8px;color:var(--purple);">Monocles: ${_fmtMoves(gd.monos)}</div>`);
  }
  return lines;
}

// Build the expandable detail HTML for a single action phase
export function buildPhaseDetails(p, prev, diff) {
  const details = [];
  const isStart = (p.event === 'start');

  if (diff.rLv) details.push(`<div style="color:var(--gold);">Research LV ${diff.rLv.from} \u2192 ${diff.rLv.to}</div>`);

  // \u2500\u2500\u2500 Grid upgrades - grouped by goal category \u2500\u2500\u2500
  const gridDetails = [];
  const gridGoalKeys = Object.keys(diff.grid);
  if (gridGoalKeys.length > 0) {
    const goalOrder = ['Res EXP','Res True\u00d7','Obs\u00d7Insight','Insight','Kaleido','Rolls','AFK'];
    gridGoalKeys.sort((a,b) => {
      const ai = goalOrder.indexOf(a), bi = goalOrder.indexOf(b);
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
    });
    for (const goal of gridGoalKeys) {
      const gc = NODE_GOAL_COLORS[goal] || 'var(--text2)';
      const nodes = diff.grid[goal].map(n => {
        const name = gridCoord(n.idx) + ' ' + RES_GRID_RAW[n.idx][0].replace(/_/g,' ');
        return `<span style="color:var(--gold);">${name}</span> ${n.from}\u2192${n.to}`;
      }).join(', ');
      gridDetails.push(`<div>Grid <span style="color:${gc};font-weight:600;">[${goal}]</span>: ${nodes}</div>`);
    }
  }

  // \u2500\u2500\u2500 Shape changes \u2500\u2500\u2500
  const shapeDetails = [];
  if (diff.shapes) {
    let bkHtml = '';
    const shapeKeys = Object.keys(diff.shapes.byShape).map(Number)
      .sort((a,b) => (SHAPE_BONUS_PCT[b]||0) - (SHAPE_BONUS_PCT[a]||0));
    for (const si of shapeKeys) {
      const cells = diff.shapes.byShape[si];
      const sc = SHAPE_COLORS[si] || 'var(--text2)';
      const coordStrs = cells.map(c => gridCoord(c));
      const footprint = renderShapeFootprint(cells, sc);
      bkHtml += `<div style="margin-left:8px;font-size:.9em;margin-bottom:4px;display:flex;align-items:center;gap:6px;">` +
        footprint +
        `<div><span style="color:${sc};font-weight:600;">${SHAPE_NAMES[si]}</span>` +
        ` <span style="opacity:.6;">(${SHAPE_BONUS_PCT[si]}%)</span>` +
        `<span style="opacity:.7;"> \u2192 </span>${coordStrs.join(', ')}</div></div>`;
    }
    shapeDetails.push(`<details style="margin-bottom:4px;" onclick="event.stopPropagation();"><summary style="cursor:pointer;color:var(--cyan);font-size:.85em;">Shape grid &amp; breakdown</summary><div style="margin-top:4px;">${renderMiniGrid(p.config.so, p.config.gl, p.config.sp)}</div><div style="margin-top:6px;">${bkHtml}</div></details>`);
  }

  // \u2500\u2500\u2500 Magnifier & Kaleidoscope changes \u2500\u2500\u2500
  const magDetails = [];

  if (diff.magCap) magDetails.push(`<div style="color:var(--cyan);">Max mags/slot: ${diff.magCap.from} \u2192 ${diff.magCap.to} <span style="opacity:.6;font-size:.9em;">[higher cap allows denser stacking]</span></div>`);

  if (diff.mags.moves.length > 0) {
    const magMoveHtml = diff.mags.moves.map(m => {
      const name = OCC_DATA[m.slot] ? OCC_DATA[m.slot].name.replace(/_/g,' ') : `#${m.slot}`;
      return m.delta > 0
        ? `<span style="color:var(--green);">+${m.delta}</span> \u2192 ${name}`
        : `<span style="color:var(--red);">-${-m.delta}</span> from ${name}`;
    }).join(' &nbsp; ');
    magDetails.push(`<div>Mags: ${magMoveHtml}</div>`);
  }

  if (diff.kals.moves.length > 0) {
    const kalMoveHtml = diff.kals.moves.map(m => {
      const name = OCC_DATA[m.slot] ? OCC_DATA[m.slot].name.replace(/_/g,' ') : `#${m.slot}`;
      return m.delta > 0
        ? `<span style="color:var(--green);">+${m.delta}</span> \u2192 ${name}`
        : `<span style="color:var(--red);">-${-m.delta}</span> from ${name}`;
    }).join(' &nbsp; ');
    magDetails.push(`<div>Kaleido: ${kalMoveHtml}</div>`);
  }

  // \u2500\u2500\u2500 Monocle target \u2500\u2500\u2500
  const monoDetails = [];
  if (diff.monos.changed) {
    const changes = diff.monos.moves.map(m => {
      const name = m.slot >= 0 && OCC_DATA[m.slot] ? OCC_DATA[m.slot].name.replace(/_/g,' ') : 'none';
      return m.delta > 0
        ? `<span style="color:var(--green);">+${m.delta}</span> \u2192 ${name}`
        : `<span style="color:var(--red);">-${-m.delta}</span> from ${name}`;
    });
    if (changes.length > 0) {
      monoDetails.push(`<div style="color:var(--purple);">Monocles: ${changes.join(' &nbsp; ')}</div>`);
    } else {
      const targetParts = [];
      for (const obs of Object.keys(diff.monos.curGroups).map(Number).sort((a,b) => a - b)) {
        const name = obs >= 0 && OCC_DATA[obs] ? OCC_DATA[obs].name.replace(/_/g,' ') : 'none';
        const cnt = diff.monos.curGroups[obs];
        targetParts.push(cnt > 1 ? `${cnt}\u00d7 ${name}` : name);
      }
      monoDetails.push(`<div style="color:var(--purple);">Monocles: ${targetParts.join(', ')}</div>`);
    }
  }

  // \u2500\u2500\u2500 Insight changes (informational - happens over time) \u2500\u2500\u2500
  const insightDetails = [];
  if (diff.insight.length > 0) {
    const ilChangeHtml = diff.insight.map(c => {
      const name = OCC_DATA[c.obs] ? OCC_DATA[c.obs].name.replace(/_/g,' ') : `#${c.obs}`;
      return `${name} <span style="color:var(--purple);">${c.from}\u2192${c.to}</span>`;
    });
    insightDetails.push(`<div>Insight: ${ilChangeHtml.join(', ')}</div>`);
  }

  // \u2500\u2500\u2500 Assemble details in correct dependency order \u2500\u2500\u2500
  const _stepLabel = (n, text) => `<div style="color:var(--cyan);font-weight:700;margin-top:6px;margin-bottom:2px;font-size:.9em;">\u2699 Step ${n}: ${text}</div>`;
  if (isStart) {
    let stepNum = 0;
    if (gridDetails.length) { stepNum++; details.push(_stepLabel(stepNum, 'Spend Grid Points')); details.push(...gridDetails); }
    if (p.freePoints > 0) details.push(`<div style="color:var(--green);margin-top:2px;font-size:.9em;">\u2714 ${p.freePoints} point${p.freePoints > 1 ? 's' : ''} don\u2019t affect Research EXP \u2014 spend freely on any upgrade!</div>`);
    if (shapeDetails.length) { stepNum++; details.push(_stepLabel(stepNum, 'Place Shapes')); details.push(...shapeDetails); }
    if (p.grindInfo) {
      const gi = p.grindInfo;
      const grindSetup = renderGrindLayoutDiff(prev.config.md, gi.grindMD);
      if (grindSetup.length) {
        stepNum++; details.push(_stepLabel(stepNum, `Rearrange for ${gi.obsName} grind`));
        details.push(...grindSetup);
      }
    } else {
      if (magDetails.length) { stepNum++; details.push(_stepLabel(stepNum, 'Assign Magnifiers & Kaleidoscopes')); details.push(...magDetails); }
      if (monoDetails.length) { const mc = p.config.md.filter(m=>m.type===1).length; stepNum++; details.push(_stepLabel(stepNum, mc > 1 ? 'Point Monocles' : 'Point Monocle')); details.push(...monoDetails); }
    }
    if (insightDetails.length) details.push(...insightDetails);
  } else {
    details.push(...gridDetails);
    if (p.freePoints > 0) details.push(`<div style="color:var(--green);font-size:.9em;">\u2714 ${p.freePoints} point${p.freePoints > 1 ? 's' : ''} don\u2019t affect Research EXP \u2014 spend freely!</div>`);
    if (p.grindInfo) {
      details.push(...insightDetails, ...shapeDetails);
    } else {
      details.push(...magDetails, ...monoDetails, ...insightDetails, ...shapeDetails);
    }
  }

  // Insight grind annotation
  if (p.grindInfo && !isStart) {
    const gi = p.grindInfo;
    const grindBase = prev.grindInfo ? prev.grindInfo.grindMD : prev.config.md;
    const grindMoves = renderGrindLayoutDiff(grindBase, gi.grindMD);
    if (grindMoves.length) {
      details.push(`<div style="color:#ff9800;font-weight:600;margin-top:6px;margin-bottom:2px;">Rearrange for ${gi.obsName} grind:</div>`);
      details.push(...grindMoves);
    }
  }

  // Goal summary
  if (details.length > 0 && p.event !== 'end' && p.event !== 'start') {
    const reasons = [];
    if (diff.rLv) {
      const ptsSpent = Object.values(diff.grid).reduce((s, nodes) => s + nodes.reduce((a,n) => a + n.to - n.from, 0), 0);
      reasons.push(`LV ${diff.rLv.to}` + (ptsSpent > 0 ? ` \u2192 spend ${ptsSpent} grid pt${ptsSpent>1?'s':''}` : ''));
    }
    if (diff.insight.length > 0) {
      const ilNames = diff.insight.map(c => OCC_DATA[c.obs] ? OCC_DATA[c.obs].name.replace(/_/g,' ') : `#${c.obs}`);
      reasons.push(`insight: ${ilNames.join(', ')}`);
    }
    if (diff.mags.moves.length > 0 && !diff.rLv && diff.insight.length === 0) reasons.push('redistribute mags');
    if (p.grindInfo) {
      const gi = p.grindInfo;
      reasons.push(`grind ${gi.obsName} \u2192 LV ${gi.newInsightLv} (${fmtTime(gi.breakEvenHrs)} break-even)`);
    }
    if (reasons.length > 0) {
      details.unshift(`<div style="color:var(--text);font-weight:600;margin-bottom:4px;font-size:.95em;">\ud83c\udfaf ${reasons.join('; ')}</div>`);
    }
  }

  return details;
}

// Build the EXP verification summary bar
export function renderExpSummary(phases, sim, saveCtx, fmtRealTimeFn) {
  if (phases.length < 2) return '';
  let simExpTotal = 0;
  for (let i = 0; i < phases.length - 1; i++) {
    const dur = phases[i+1].time - phases[i].time;
    const rate = phases[i].grindInfo ? phases[i].grindInfo.grindExpHr : phases[i].expHr;
    simExpTotal += rate * dur;
  }
  const startLv = phases[0].rLv;
  const endLv = sim.finalLevel;
  let expNeeded = -getResearchCurrentExp(saveCtx);
  for (let lv = startLv; lv < endLv; lv++) expNeeded += researchExpReq(lv, S.serverVarResXP);
  expNeeded += sim.finalExp;
  const avgRate = sim.totalTime > 0 ? simExpTotal / sim.totalTime : 0;
  const startRate = phases[0].grindInfo ? phases[0].grindInfo.grindExpHr : phases[0].expHr;
  let html = `<div style="margin-top:8px;padding:8px 10px;background:#0d0d1a;border-radius:6px;font-size:.8em;color:var(--text2);border:1px solid #222;">`;
  html += `<span style="color:var(--text2);">\ud83d\udcca</span> `;
  html += `EXP earned: <b style="color:var(--green);">${fmtExp(simExpTotal)}</b>`;
  html += ` &middot; Avg rate: <b style="color:var(--green);">${fmtVal(avgRate)}/hr</b>`;
  html += ` &middot; Start: ${fmtVal(startRate)}/hr \u2192 End: ${fmtVal(phases[phases.length - 2].expHr)}/hr`;
  const endReal = fmtRealTimeFn(sim.totalTime).text;
  if (endReal) html += ` &middot; <span style="color:var(--text2);font-size:.95em;">Finishes: ${endReal}</span>`;
  if (Math.abs(simExpTotal - expNeeded) > simExpTotal * 0.01) {
    html += ` <span style="color:var(--red);">(mismatch: needed ${fmtExp(expNeeded)})</span>`;
  }
  html += `</div>`;
  return html;
}

export function renderExpChart(sim) {
  const chartDiv = document.getElementById('opt-chart');
  const phases = sim.phases;
  if (phases.length < 2) { chartDiv.innerHTML = ''; return; }

  const expValues = phases.map(p => p.grindInfo ? p.grindInfo.grindExpHr : p.expHr);
  const rawMin = Math.min(...expValues);
  const rawMax = Math.max(...expValues);
  const range = rawMax - rawMin || 1;
  const margin = range * 0.1;
  const yMin = Math.max(0, rawMin - margin);
  const yMax = rawMax + margin;
  const yRange = yMax - yMin;
  const totalTime = Math.max(sim.totalTime, 0.01);
  const W = chartDiv.clientWidth || 600;
  const H = 160;
  const pad = { top: 12, right: 20, bottom: 24, left: 60 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  let svg = `<svg width="100%" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block;">`;
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + plotH * (1 - i / 4);
    const val = yMin + yRange * i / 4;
    svg += `<line x1="${pad.left}" y1="${y}" x2="${W-pad.right}" y2="${y}" stroke="#333" stroke-width="1"/>`;
    svg += `<text x="${pad.left-5}" y="${y+4}" fill="#888" font-size="10" text-anchor="end">${fmtVal(val)}</text>`;
  }

  let path = '';
  for (let i = 0; i < phases.length; i++) {
    const p = phases[i];
    const x = pad.left + (p.time / totalTime) * plotW;
    const pExpHr = p.grindInfo ? p.grindInfo.grindExpHr : p.expHr;
    const y = pad.top + plotH * (1 - (pExpHr - yMin) / yRange);
    if (i === 0) path += `M ${x} ${y}`;
    else {
      const prevPExpHr = phases[i-1].grindInfo ? phases[i-1].grindInfo.grindExpHr : phases[i-1].expHr;
      const prevY = pad.top + plotH * (1 - (prevPExpHr - yMin) / yRange);
      path += ` L ${x} ${prevY} L ${x} ${y}`;
    }
  }
  svg += `<path d="${path}" fill="none" stroke="var(--green)" stroke-width="2"/>`;

  for (const p of phases) {
    if (p.event === 'start' || p.event === 'end') continue;
    const x = pad.left + (p.time / totalTime) * plotW;
    const pExpHr = p.grindInfo ? p.grindInfo.grindExpHr : p.expHr;
    const y = pad.top + plotH * (1 - (pExpHr - yMin) / yRange);
    svg += `<line x1="${x}" y1="${pad.top}" x2="${x}" y2="${pad.top+plotH}" stroke="var(--gold)" stroke-width="1" stroke-dasharray="4,4" opacity="0.5"/>`;
    svg += `<circle cx="${x}" cy="${y}" r="3" fill="var(--gold)"/>`;
  }

  const steps = [0, 0.25, 0.5, 0.75, 1];
  for (const s of steps) {
    const x = pad.left + plotW * s;
    svg += `<text x="${x}" y="${H-5}" fill="#888" font-size="10" text-anchor="middle">${fmtTime(totalTime * s)}</text>`;
  }
  svg += '</svg>';
  chartDiv.innerHTML = svg;
}

/**
 * Render a compact rasterized footprint showing which grid cells a shape covers.
 * Returns an HTML string for an inline mini-grid bounded to the shape's extent.
 */
export function renderShapeFootprint(cells, color) {
  if (!cells || cells.length === 0) return '';
  const cellSet = new Set(cells);
  let minC = Infinity, maxC = -Infinity, minR = Infinity, maxR = -Infinity;
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i] % GRID_COLS, r = Math.floor(cells[i] / GRID_COLS);
    if (c < minC) minC = c; if (c > maxC) maxC = c;
    if (r < minR) minR = r; if (r > maxR) maxR = r;
  }
  const w = maxC - minC + 1, h = maxR - minR + 1;
  const sz = 8;
  let html = '<div style="display:inline-grid;grid-template-columns:repeat(' + w + ',' + sz + 'px);gap:1px;flex-shrink:0;">';
  for (let row = minR; row <= maxR; row++) {
    for (let col = minC; col <= maxC; col++) {
      const idx = row * GRID_COLS + col;
      const hit = cellSet.has(idx);
      html += '<div style="width:' + sz + 'px;height:' + sz + 'px;background:' +
        (hit ? color + '88' : '#1a1a2e') +
        ';border-radius:1px;"></div>';
    }
  }
  html += '</div>';
  return html;
}

export function renderMiniGrid(overlay, gl, positions) {
  const usedGL = gl;
  const cellSize = 24;
  const COLS = GRID_COLS;
  let html = `<div style="display:inline-grid;grid-template-columns:repeat(${COLS},${cellSize}px);gap:0;background:#111;padding:4px;border-radius:6px;position:relative;">`;
  for (let i = 0; i < GRID_SIZE; i++) {
    const info = RES_GRID_RAW[i];
    const lv = usedGL[i] || 0;
    const si = overlay[i];
    let bg = '#0a0a15', label = '', labelColor = '#333';
    let bT = '1px solid #222', bB = '1px solid #222', bL = '1px solid #222', bR = '1px solid #222';
    if (info) {
      if (lv > 0) {
        label = gridCoord(i);
        labelColor = lv >= info[1] ? '#4caf50' : '#aaa';
        bg = '#1a1a2e';
      } else if (isGridCellUnlocked(i, usedGL)) {
        label = gridCoord(i);
        labelColor = '#665522';
        bg = 'rgba(255,215,0,.08)';
        bT = '1px dashed #554400'; bB = bT; bL = bT; bR = bT;
      } else {
        label = '\u00b7';
        labelColor = '#333';
      }
      if (si >= 0) {
        const c = SHAPE_COLORS[si];
        bg = c + '22';
        if (lv > 0) labelColor = c;
        const col = i % COLS;
        bT = !sameShapeCell(overlay, i, i - COLS) ? '2px solid ' + c : '1px solid transparent';
        bB = !sameShapeCell(overlay, i, i + COLS) ? '2px solid ' + c : '1px solid transparent';
        bL = col > 0 ? (!sameShapeCell(overlay, i, i - 1) ? '2px solid ' + c : '1px solid transparent') : '2px solid ' + c;
        bR = col < COLS - 1 ? (!sameShapeCell(overlay, i, i + 1) ? '2px solid ' + c : '1px solid transparent') : '2px solid ' + c;
      }
    }
    html += `<div style="width:${cellSize}px;height:${cellSize}px;background:${bg};border-top:${bT};border-bottom:${bB};border-left:${bL};border-right:${bR};display:flex;align-items:center;justify-content:center;font-size:.4em;color:${labelColor};font-weight:600;overflow:hidden;box-sizing:border-box;" title="${info?info[0].replace(/_/g,' ')+(lv>0?' LV'+lv:isGridCellUnlocked(i,usedGL)?' (available)':''):''} ${si>=0?'Shape '+si:''}">${label}</div>`;
  }
  // SVG shape polygon overlay
  const activeShapes = new Set();
  for (let i = 0; i < overlay.length; i++) {
    if (overlay[i] >= 0) activeShapes.add(overlay[i]);
  }
  if (activeShapes.size > 0) {
    const usePos = positions;
    const gw = COLS * cellSize, gh = GRID_ROWS * cellSize;
    let svg = `<svg style="position:absolute;top:4px;left:4px;width:${gw}px;height:${gh}px;pointer-events:none;z-index:2;" viewBox="15 24 600 360" preserveAspectRatio="none">`;
    svg += `<style>
      .sh-poly { pointer-events:fill; cursor:pointer; }
    </style>`;
    for (const si of activeShapes) {
      const pos = usePos[si];
      if (!pos) continue;
      const verts = SHAPE_VERTICES[si];
      const dims = SHAPE_DIMS[si];
      if (!verts || !dims) continue;
      const cx = dims[0] / 2, cy = dims[1] / 2;
      const angle = (pos.rot || 0) * Math.PI / 180;
      const cosA = Math.cos(angle), sinA = Math.sin(angle);
      const poly = verts.map(([vx, vy]) => {
        const dx = vx - cx, dy = vy - cy;
        return [Math.round(cx + pos.x + dx * cosA - dy * sinA),
                Math.round(cy + pos.y + dx * sinA + dy * cosA)];
      });
      svg += `<polygon class="sh-poly" points="${poly.map(([x,y])=>x+','+y).join(' ')}" fill="${SHAPE_COLORS[si]}08" stroke="${SHAPE_COLORS[si]}" stroke-width="2" stroke-linejoin="round" opacity="0.7"/>`;
    }
    svg += '</svg>';
    html += svg;
  }
  html += '</div>';
  return html;
}
