// ===== OPTIMIZER UI - Render optimizer results, timeline, actions, chart, mini-grid =====

import {
  gridLevels,
  insightLvs,
  magData,
  magnifiersOwned,
  serverVarResXP,
  shapeOverlay,
  shapePositions,
} from '../state.js';
import { saveGlobalTime } from '../save/data.js';
import {
  GRID_COLS,
  GRID_ROWS,
  GRID_SIZE,
  NODE_GOAL_COLORS,
  OCC_DATA,
  RES_GRID_RAW,
  SHAPE_BONUS_PCT,
  SHAPE_COLORS,
  SHAPE_DIMS,
  SHAPE_NAMES,
  SHAPE_VERTICES,
} from '../game-data.js';
import {
  isGridCellUnlocked,
  researchExpReq,
} from '../sim-math.js';
import { getResearchCurrentExp } from '../save/context.js';
import { gridCoord } from '../grid-helpers.js';
import { diffPhaseConfigs, diffMDLayouts } from '../phase-diff.js';
import { sameShapeCell } from '../optimizers/shapes-geo.js';
import {
  fmtExact,
  fmtExp,
  fmtTime,
  fmtVal,
} from '../renderers/format.js';


// Convert sim hours-offset to a real date string, relative to now.
// Shows "X ago" / "in X" relative label + short date/time.
function fmtRealTime(simHrs) {
  if (!saveGlobalTime || !isFinite(simHrs)) return '';
  const now = Date.now() / 1000; // current epoch seconds
  // Save was taken at saveGlobalTime; sim hour 0 = save time.
  // Event real time = saveGlobalTime + simHrs * 3600
  const eventEpoch = saveGlobalTime + simHrs * 3600;
  const diffSec = eventEpoch - now;
  const diffHrs = diffSec / 3600;
  // Relative label
  let rel;
  if (Math.abs(diffHrs) < 1/60) rel = 'now';
  else if (diffHrs < 0) rel = fmtTime(-diffHrs) + ' ago';
  else rel = 'in ' + fmtTime(diffHrs);
  // Short time (12hr am/pm)
  const d = new Date(eventEpoch * 1000);
  let hr = d.getHours(), ampm = hr >= 12 ? 'pm' : 'am';
  hr = hr % 12 || 12;
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${rel} (${hr}:${mm}${ampm})`;
}


// ===== RENDER: OPTIMIZER =====
let _optimizerResult = null;

export function renderOptimizerResults(result) {
  _optimizerResult = result;
  const { best, worst, paths, bestSteps } = result;

  // Show results sections
  ['opt-comparison','opt-timeline-section','opt-chart-section','opt-actions-section'].forEach(id => {
    document.getElementById(id).style.display = 'block';
  });

  // Compute per-segment EXP + avg rate for a sim result
  function simSegmentStats(sim) {
    const ph = sim.phases;
    let totalExp = 0;
    const segs = [];
    for (let i = 0; i < ph.length - 1; i++) {
      const dur = ph[i+1].time - ph[i].time;
      const rate = ph[i].expHr;
      const exp = rate * dur;
      segs.push({ dur, rate, exp });
      totalExp += exp;
    }
    const startRate = ph[0].expHr;
    const endRate = ph.length >= 2 ? ph[ph.length - 2].expHr : startRate;
    const avgRate = sim.totalTime > 0 ? totalExp / sim.totalTime : 0;
    return { segs, totalExp, startRate, endRate, avgRate };
  }

  // Strategy comparison
  const compDiv = document.getElementById('opt-comparison-body');
  const bestStats = simSegmentStats(best);
  const bestTime = best.totalTime;
  const preRate = (best.phases[0] && best.phases[0].preOptExpHr) || result.preOptRate || 0;

  let compHtml = '';
  compHtml += `<div style="display:flex;gap:16px;flex-wrap:wrap;align-items:center;margin-bottom:16px;">`;
  compHtml += `<div style="flex:1;min-width:200px;">`;
  compHtml += `<div style="margin-bottom:8px;"><span style="color:var(--text2);">Optimal result:</span> <span style="font-weight:700;color:var(--green);">${fmtTime(bestTime)}</span></div>`;
  compHtml += `<div style="font-size:.8em;color:var(--text2);margin-bottom:4px;">Avg: <span style="color:var(--green);">${fmtVal(bestStats.avgRate)}/hr</span> (${fmtVal(bestStats.startRate)} \u2192 ${fmtVal(bestStats.endRate)})</div>`;
  compHtml += `<div style="font-size:.8em;color:var(--text2);margin-bottom:2px;">Pre-optimization: ${fmtVal(preRate)}/hr</div>`;
  compHtml += `</div>`;
  if (worst && worst !== best) {
    const worstStats = simSegmentStats(worst);
    const spread = worst.totalTime - bestTime;
    const spreadPct = worst.totalTime > 0 ? (spread / worst.totalTime * 100) : 0;
    if (spread > 0.01) {
      compHtml += `<div style="padding:12px 20px;background:rgba(76,175,80,.12);border:1px solid var(--green);border-radius:8px;text-align:center;">`;
      compHtml += `<div style="font-size:.8em;color:var(--green);">Best vs Worst Combo</div>`;
      compHtml += `<div style="font-weight:700;color:var(--green);font-size:1.3em;">${fmtTime(spread)} faster</div>`;
      compHtml += `<div style="font-size:.75em;color:var(--text2);">${spreadPct.toFixed(1)}% \u2014 ${paths ? paths.length : '?'} combos tested</div>`;
      compHtml += `</div>`;
    }
  }
  compHtml += `</div>`;
  compDiv.innerHTML = compHtml;

  // Timeline
  renderTimeline(best);

  // EXP chart
  renderExpChart(best);

  // Actions
  renderActions(best, bestSteps);
}

function renderTimeline(sim) {
  const timelineDiv = document.getElementById('opt-timeline');
  const detailDiv = document.getElementById('opt-timeline-detail');
  const phases = sim.phases;
  const totalTime = Math.max(sim.totalTime, 0.01);

  const colors = { 'start':'var(--accent)', 'level-up':'var(--gold)', 'insight-up':'var(--purple)', 'level+insight':'var(--cyan)', 'end':'var(--green)' };

  // Build timeline bar + arrow marker container
  let html = '';
  for (let i = 0; i < phases.length - 1; i++) {
    const p = phases[i];
    const nextIdx = i + 1;
    const left = (p.time / totalTime * 100).toFixed(2);
    const width = ((phases[nextIdx].time - p.time) / totalTime * 100).toFixed(2);
    const color = colors[p.event] || 'var(--text2)';
    const tlReal = fmtRealTime(p.time);
    const tlRate = p.grindInfo ? p.grindInfo.grindExpHr : p.expHr;
    const tlTitle = `${p.event} at ${fmtTime(p.time)}${tlReal ? ' \u2014 ' + tlReal : ''} \u2014 ${fmtVal(tlRate)}/hr`;
    html += `<div data-phase="${i}" style="position:absolute;left:${left}%;width:${width}%;height:100%;background:${color}33;border-right:1px solid ${color};cursor:pointer;transition:background .15s;" title="${tlTitle}"></div>`;
  }
  // Arrow marker (hidden by default)
  html += `<div id="tl-arrow" style="display:none;position:absolute;top:-18px;transform:translateX(-50%);font-size:14px;color:var(--gold);pointer-events:none;text-shadow:0 0 4px rgba(0,0,0,.8);">\u25bc</div>`;
  timelineDiv.innerHTML = html;

  // Click handler: scroll to corresponding action step
  timelineDiv.onclick = (e) => {
    const el = e.target.closest('[data-phase]');
    if (!el) return;
    const pi = parseInt(el.dataset.phase);
    highlightTimelinePhase(pi, null, totalTime);
    const actionEl = document.getElementById('action-step-' + pi);
    if (actionEl) actionEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    // Auto-expand the detail
    const det = document.getElementById('action-detail-' + pi);
    if (det && det.style.display === 'none') toggleActionDetail(pi, phases.length, totalTime);
  };

  detailDiv.innerHTML = '';
}

// diffPhaseConfigs is imported from phase-diff.js

// Build HTML lines showing mag/monocle/kaleido diffs between a base layout and a grind layout
function _renderGrindLayoutDiff(baseMD, grindMD, label) {
  if (!label) label = 'grind layout';
  const gd = diffMDLayouts(baseMD, grindMD);
  const lines = [];
  const _fmtMoves = (moves) => moves.map(m => {
    const name = OCC_DATA[m.slot] ? OCC_DATA[m.slot].name.replace(/_/g,' ') : `#${m.slot}`;
    return m.delta > 0
      ? `<span style="color:var(--green);">+${m.delta}</span> \u2192 ${name}`
      : `<span style="color:var(--red);">-${-m.delta}</span> from ${name}`;
  }).join(' &nbsp; ');
  if (gd.mags.length > 0) {
    lines.push(`<div style="margin-left:8px;">Mags <span style="opacity:.6;font-size:.9em;">[${label}]</span>: ${_fmtMoves(gd.mags)}</div>`);
  }
  if (gd.kals.length > 0) {
    lines.push(`<div style="margin-left:8px;">Kaleido <span style="opacity:.6;font-size:.9em;">[${label}]</span>: ${_fmtMoves(gd.kals)}</div>`);
  }
  if (gd.monos.length > 0) {
    lines.push(`<div style="margin-left:8px;color:var(--purple);">Monocle${grindMD.filter(m=>m.type===1).length > 1 ? 's' : ''} <span style="opacity:.6;font-size:.9em;">[${label}]</span>: ${_fmtMoves(gd.monos)}</div>`);
  }
  return lines;
}

// Build the expandable detail HTML for a single action phase
function _buildPhaseDetails(p, prev, diff) {
  const details = [];
  const isStart = (p.event === 'start');

  if (diff.rLv) details.push(`<div style="color:var(--gold);">Research LV ${diff.rLv.from} \u2192 ${diff.rLv.to}</div>`);

  // ─── Grid upgrades - grouped by goal category ───
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

  // ─── Shape changes ───
  const shapeDetails = [];
  if (diff.shapes) {
    let bkHtml = '';
    const shapeKeys = Object.keys(diff.shapes.byShape).map(Number)
      .sort((a,b) => (SHAPE_BONUS_PCT[b]||0) - (SHAPE_BONUS_PCT[a]||0));
    for (const si of shapeKeys) {
      const cells = diff.shapes.byShape[si];
      const sc = SHAPE_COLORS[si] || 'var(--text2)';
      const coordStrs = cells.map(c => gridCoord(c));
      bkHtml += `<div style="margin-left:8px;font-size:.9em;margin-bottom:2px;">` +
        `<span style="color:${sc};font-weight:600;">${SHAPE_NAMES[si]}</span>` +
        ` <span style="opacity:.6;">(${SHAPE_BONUS_PCT[si]}%)</span>` +
        `<span style="opacity:.7;"> \u2192 </span>${coordStrs.join(', ')}</div>`;
    }
    shapeDetails.push(`<details style="margin-bottom:4px;" onclick="event.stopPropagation();"><summary style="cursor:pointer;color:var(--cyan);font-size:.85em;">Shape grid &amp; breakdown</summary><div style="margin-top:4px;">${renderMiniGrid(p.config.so, p.config.gl, p.config.sp)}</div><div style="margin-top:6px;">${bkHtml}</div></details>`);
  }

  // ─── Magnifier & Kaleidoscope changes ───
  const magDetails = [];

  if (diff.magCap) magDetails.push(`<div style="color:var(--cyan);">Max mags/slot: ${diff.magCap.from} \u2192 ${diff.magCap.to} <span style="opacity:.6;font-size:.9em;">[higher cap allows denser stacking]</span></div>`);

  if (diff.mags.moves.length > 0) {
    const magMoveHtml = diff.mags.moves.map(m => {
      const name = OCC_DATA[m.slot] ? OCC_DATA[m.slot].name.replace(/_/g,' ') : `#${m.slot}`;
      return m.delta > 0
        ? `<span style="color:var(--green);">+${m.delta}</span> \u2192 ${name}`
        : `<span style="color:var(--red);">-${-m.delta}</span> from ${name}`;
    }).join(' &nbsp; ');
    let magReason = 'maximize obs EXP rate';
    if (diff.mags.netNew > 0) magReason = `+${diff.mags.netNew} new mag${diff.mags.netNew>1?'s':''} placed for best obs EXP`;
    else if (diff.magCap) magReason = 'redistributed for higher slot cap';
    magDetails.push(`<div>Mags <span style="opacity:.6;font-size:.9em;">[${magReason}]</span>: ${magMoveHtml}</div>`);
  }

  if (diff.kals.moves.length > 0) {
    const kalMoveHtml = diff.kals.moves.map(m => {
      const name = OCC_DATA[m.slot] ? OCC_DATA[m.slot].name.replace(/_/g,' ') : `#${m.slot}`;
      return m.delta > 0
        ? `<span style="color:var(--green);">+${m.delta}</span> \u2192 ${name}`
        : `<span style="color:var(--red);">-${-m.delta}</span> from ${name}`;
    }).join(' &nbsp; ');
    let kalReason = 'best adjacency boost';
    if (diff.kals.netNew > 0) kalReason = `+${diff.kals.netNew} new kaleido for adjacency`;
    magDetails.push(`<div>Kaleido <span style="opacity:.6;font-size:.9em;">[${kalReason}]</span>: ${kalMoveHtml}</div>`);
  }

  // ─── Monocle target ───
  const monoDetails = [];
  if (diff.monos.changed) {
    const gd93m = (p.config.gl[93] || 0);
    const gd94m = (p.config.gl[94] || 0);
    const gd101name = gridCoord(93) + ' ' + (RES_GRID_RAW[93]?.[0]||'').replace(/_/g,' ');
    const gd102name = gridCoord(94) + ' ' + (RES_GRID_RAW[94]?.[0]||'').replace(/_/g,' ');
    const changes = diff.monos.moves.map(m => {
      const name = m.slot >= 0 && OCC_DATA[m.slot] ? OCC_DATA[m.slot].name.replace(/_/g,' ') : 'none';
      return m.delta > 0
        ? `<span style="color:var(--green);">+${m.delta}</span> \u2192 ${name}`
        : `<span style="color:var(--red);">-${-m.delta}</span> from ${name}`;
    });
    let monoReason = 'fastest insight level-up';
    if (p.grindInfo) {
      monoReason = 'insight grind \u2192 ' + p.grindInfo.obsName;
    } else if (diff.monos.netNew > 0) monoReason = `+${diff.monos.netNew} new monocle${diff.monos.netNew > 1 ? 's' : ''} from grid`;
    else {
      const curMonoSlots = Object.keys(diff.monos.curGroups).map(Number);
      const anyMagOnCur = curMonoSlots.some(s => s >= 0 && p.config.md.some(m => m.type === 0 && m.slot === s));
      if (anyMagOnCur && gd93m > 0) monoReason = 'boosting obs EXP via insight (' + gd101name + ')';
      else if (gd94m > 0) monoReason = 'total insight LVs \u2192 research EXP (' + gd102name + ')';
      else monoReason = 'banking insight for future ' + gd102name;
    }
    if (changes.length > 0) {
      monoDetails.push(`<div style="color:var(--purple);">Monocle${diff.monos.totalCur > 1 ? 's' : ''} <span style="opacity:.6;font-size:.9em;">[${monoReason}]</span>: ${changes.join(' &nbsp; ')}</div>`);
    } else {
      const targetParts = [];
      for (const obs of Object.keys(diff.monos.curGroups).map(Number).sort((a,b) => a - b)) {
        const name = obs >= 0 && OCC_DATA[obs] ? OCC_DATA[obs].name.replace(/_/g,' ') : 'none';
        const cnt = diff.monos.curGroups[obs];
        targetParts.push(cnt > 1 ? `${cnt}\u00d7 ${name}` : name);
      }
      monoDetails.push(`<div style="color:var(--purple);">Monocle${diff.monos.totalCur > 1 ? 's' : ''} <span style="opacity:.6;font-size:.9em;">[${monoReason}]</span>: ${targetParts.join(', ')}</div>`);
    }
  }

  // ─── Insight changes (informational - happens over time) ───
  const insightDetails = [];
  if (diff.insight.length > 0) {
    const ilChangeHtml = diff.insight.map(c => {
      const name = OCC_DATA[c.obs] ? OCC_DATA[c.obs].name.replace(/_/g,' ') : `#${c.obs}`;
      return `${name} <span style="color:var(--purple);">${c.from}\u2192${c.to}</span>`;
    });
    const gd93i = (p.config.gl[93] || 0);
    const gd94i = (p.config.gl[94] || 0);
    const impacts = [];
    if (gd93i > 0) impacts.push('obs EXP\u00d7insight via ' + gridCoord(93) + ' ' + (RES_GRID_RAW[93]?.[0]||'').replace(/_/g,' '));
    if (gd94i > 0) impacts.push('research EXP via ' + gridCoord(94) + ' ' + (RES_GRID_RAW[94]?.[0]||'').replace(/_/g,' '));
    const impactStr = impacts.length > 0 ? impacts.join(' + ') : 'banking for future upgrades';
    insightDetails.push(`<div>Insight <span style="opacity:.6;font-size:.9em;">[${impactStr}]</span>: ${ilChangeHtml.join(', ')}</div>`);
  }

  // ─── Assemble details in correct dependency order ───
  const _stepLabel = (n, text) => `<div style="color:var(--cyan);font-weight:700;margin-top:6px;margin-bottom:2px;font-size:.9em;">\u2699 Step ${n}: ${text}</div>`;
  if (isStart) {
    let stepNum = 0;
    if (gridDetails.length) { stepNum++; details.push(_stepLabel(stepNum, 'Spend Grid Points')); details.push(...gridDetails); }
    if (p.freePoints > 0) details.push(`<div style="color:var(--green);margin-top:2px;font-size:.9em;">\u2714 ${p.freePoints} point${p.freePoints > 1 ? 's' : ''} don\u2019t affect Research EXP \u2014 spend freely on any upgrade!</div>`);
    if (shapeDetails.length) { stepNum++; details.push(_stepLabel(stepNum, 'Place Shapes')); details.push(...shapeDetails); }
    if (p.grindInfo) {
      // When grinding, show grind layout setup → grind → post-grind switch
      const gi = p.grindInfo;
      const grindSetup = _renderGrindLayoutDiff(prev.config.md, gi.grindMD);
      if (grindSetup.length) {
        stepNum++; details.push(_stepLabel(stepNum, 'Set Up for Insight Grind'));
        details.push(...grindSetup);
      }
      stepNum++; details.push(_stepLabel(stepNum, 'Insight Grind'));
      details.push(`<div style="color:#ff9800;font-weight:600;margin-top:4px;margin-bottom:4px;">\ud83d\udd2c Insight Grind: <span style="color:var(--purple);">${gi.obsName}</span> \u2192 LV ${gi.newInsightLv}</div>`);
      details.push(`<div style="margin-left:8px;">Duration: <b>${fmtTime(gi.grindHrs)}</b> &nbsp; break-even: <b style="color:var(--gold);">${fmtTime(gi.breakEvenHrs)}</b></div>`);
    } else {
      if (magDetails.length) { stepNum++; details.push(_stepLabel(stepNum, 'Assign Magnifiers & Kaleidoscopes')); details.push(...magDetails); }
      if (monoDetails.length) { const mc = p.config.md.filter(m=>m.type===1).length; stepNum++; details.push(_stepLabel(stepNum, mc > 1 ? 'Point Monocles' : 'Point Monocle')); details.push(...monoDetails); }
    }
    if (insightDetails.length) details.push(...insightDetails);
  } else {
    details.push(...gridDetails);
    if (p.freePoints > 0) details.push(`<div style="color:var(--green);font-size:.9em;">\u2714 ${p.freePoints} point${p.freePoints > 1 ? 's' : ''} don\u2019t affect Research EXP \u2014 spend freely!</div>`);
    if (p.grindInfo) {
      // When grinding, skip regular mag/monocle diff - the user never enters the
      // intermediate non-grind layout.
      details.push(...insightDetails, ...shapeDetails);
    } else {
      details.push(...magDetails, ...monoDetails, ...insightDetails, ...shapeDetails);
    }
  }

  // Insight grind annotation (attached to the event that decided to grind)
  // (Start phase handles grind inline above, so skip it here)
  if (p.grindInfo && !isStart) {
    const gi = p.grindInfo;
    const grindBase = prev.grindInfo ? prev.grindInfo.grindMD : prev.config.md;
    details.push(`<div style="color:#ff9800;font-weight:600;margin-top:6px;margin-bottom:4px;">\ud83d\udd2c Insight Grind: <span style="color:var(--purple);">${gi.obsName}</span> \u2192 LV ${gi.newInsightLv}</div>`);
    details.push(..._renderGrindLayoutDiff(grindBase, gi.grindMD));
    details.push(`<div style="margin-left:8px;">Duration: <b>${fmtTime(gi.grindHrs)}</b> &nbsp; break-even: <b style="color:var(--gold);">${fmtTime(gi.breakEvenHrs)}</b></div>`);
  }

  // Goal summary - prepend a one-line explanation of WHY this phase exists
  if (details.length > 0 && p.event !== 'end') {
    let goalSummary = '';
    if (p.event === 'start' && p.grindInfo) {
      goalSummary = 'Follow steps in order, then grind insight';
    } else if (p.event === 'start') {
      goalSummary = 'Follow steps in order \u2014 each depends on the previous';
    } else {
      const reasons = [];
      if (diff.rLv) {
        const ptsSpent = Object.values(diff.grid).reduce((s, nodes) => s + nodes.reduce((a,n) => a + n.to - n.from, 0), 0);
        reasons.push(`LV ${diff.rLv.to} reached` + (ptsSpent > 0 ? ` \u2192 spent ${ptsSpent} grid pt${ptsSpent>1?'s':''}` : ''));
      }
      if (diff.insight.length > 0) reasons.push('insight leveled \u2192 EXP rates shifted');
      if (diff.mags.moves.length > 0 && !diff.rLv && diff.insight.length === 0) reasons.push('mags redistributed');
      if (p.grindInfo) {
        const gi = p.grindInfo;
        reasons.push(`grind ${gi.obsName} \u2192 LV ${gi.newInsightLv} (break-even ${fmtTime(gi.breakEvenHrs)})`);
      }
      if (reasons.length === 0) reasons.push('reconfiguring for new EXP rates');
      goalSummary = reasons.join('; ');
    }
    details.unshift(`<div style="color:var(--text);font-weight:600;margin-bottom:4px;font-size:.95em;">\ud83c\udfaf ${goalSummary}</div>`);
  }

  return details;
}

// Build the EXP verification summary bar
function _renderExpSummary(phases, sim) {
  if (phases.length < 2) return '';
  let simExpTotal = 0;
  for (let i = 0; i < phases.length - 1; i++) {
    const dur = phases[i+1].time - phases[i].time;
    const rate = phases[i].grindInfo ? phases[i].grindInfo.grindExpHr : phases[i].expHr;
    simExpTotal += rate * dur;
  }
  const startLv = phases[0].rLv;
  const endLv = sim.finalLevel;
  let expNeeded = -getResearchCurrentExp();
  for (let lv = startLv; lv < endLv; lv++) expNeeded += researchExpReq(lv, serverVarResXP);
  expNeeded += sim.finalExp;
  const avgRate = sim.totalTime > 0 ? simExpTotal / sim.totalTime : 0;
  const startRate = phases[0].grindInfo ? phases[0].grindInfo.grindExpHr : phases[0].expHr;
  let html = `<div style="margin-top:8px;padding:8px 10px;background:#0d0d1a;border-radius:6px;font-size:.8em;color:var(--text2);border:1px solid #222;">`;
  html += `<span style="color:var(--text2);">\ud83d\udcca</span> `;
  html += `EXP earned: <b style="color:var(--green);">${fmtExp(simExpTotal)}</b>`;
  html += ` &middot; Avg rate: <b style="color:var(--green);">${fmtVal(avgRate)}/hr</b>`;
  html += ` &middot; Start: ${fmtVal(startRate)}/hr \u2192 End: ${fmtVal(phases[phases.length - 2].expHr)}/hr`;
  const endReal = fmtRealTime(sim.totalTime);
  if (endReal) html += ` &middot; <span style="color:var(--text2);font-size:.95em;">Finishes: ${endReal}</span>`;
  if (Math.abs(simExpTotal - expNeeded) > simExpTotal * 0.01) {
    html += ` <span style="color:var(--red);">(mismatch: needed ${fmtExp(expNeeded)})</span>`;
  }
  html += `</div>`;
  return html;
}

function renderActions(sim, bestSteps) {
  const actDiv = document.getElementById('opt-actions');
  const phases = sim.phases;
  const totalTime = Math.max(sim.totalTime, 0.01);
  let html = '';

  // Synthetic "pre-optimization" config for start event diff
  const preOptConfig = {
    gl: gridLevels.slice(), so: shapeOverlay.slice(),
    md: magData.slice(0, magnifiersOwned).map(m=>({...m})),
    il: insightLvs.slice(),
    sp: shapePositions.map(s => ({...s}))
  };

  const colors = { 'start':'var(--cyan)', 'level-up':'var(--gold)', 'insight-up':'var(--purple)', 'level+insight':'var(--cyan)', 'end':'var(--text2)' };

  for (let i = 0; i < phases.length; i++) {
    const p = phases[i];
    let prev, eventLabel, icon;
    const prevIdx = i - 1;
    if (p.event === 'start') {
      prev = { expHr: p.preOptExpHr || p.expHr, config: preOptConfig, rLv: p.rLv };
      eventLabel = 'Initial Optimization'; icon = '\u2699';
    } else if (p.event === 'end') {
      prev = prevIdx >= 0 ? phases[prevIdx] : phases[0];
      eventLabel = 'End State'; icon = '\u2714';
    } else if (p.event === 'level-up') {
      prev = prevIdx >= 0 ? phases[prevIdx] : phases[0]; eventLabel = 'Level Up'; icon = '\u2b50';
    } else if (p.event === 'insight-up') {
      prev = prevIdx >= 0 ? phases[prevIdx] : phases[0]; eventLabel = 'Insight Level Up'; icon = '\u2b06';
    } else if (p.event === 'level+insight') {
      prev = prevIdx >= 0 ? phases[prevIdx] : phases[0]; eventLabel = 'Level + Insight'; icon = '\u26a1';
    } else {
      prev = prevIdx >= 0 ? phases[prevIdx] : phases[0]; eventLabel = 'Event'; icon = '\u25cf';
    }
    // If the previous phase had an active grind, diff against the grind layout
    // (activeConfig) instead of the pre-grind optimized layout (config).
    if (prev && prev.activeConfig) {
      prev = { ...prev, config: prev.activeConfig };
    }

    const borderColor = colors[p.event] || 'var(--text2)';
    // When a phase has a grind, show the rate after grind layout is applied
    const displayExpHr = p.grindInfo ? p.grindInfo.grindExpHr : p.expHr;
    const prevDisplayExpHr = prev.grindInfo ? prev.grindInfo.grindExpHr : prev.expHr;
    const delta = displayExpHr - prevDisplayExpHr;
    const deltaPct = prevDisplayExpHr > 0 ? (delta / prevDisplayExpHr * 100) : 0;
    const deltaStr = Math.abs(delta) > 0.5
      ? ` <span style="color:${delta>0?'var(--green)':'var(--red)'};font-size:.85em;">${delta>0?'+':''}${fmtVal(delta)}/hr (${delta>0?'+':''}${deltaPct.toFixed(1)}%)</span>`
      : '';

    const diff = diffPhaseConfigs(prev, p);
    const details = _buildPhaseDetails(p, prev, diff);

    const detId = 'action-detail-' + i;
    const hasDetails = details.length > 0;

    // --- Render step ---
    html += `<div id="action-step-${i}" data-phase="${i}" data-phasecount="${phases.length}" data-totaltime="${totalTime}" style="margin-bottom:4px;border-radius:6px;border-left:3px solid ${borderColor};background:#111;cursor:pointer;transition:outline .15s;">`;

    // Segment EXP info: how much EXP this phase earns before the next event
    let segInfo = '';
    if (i < phases.length - 1) {
      const nextPhase = phases[i + 1];
      const segDur = nextPhase.time - p.time;
      if (segDur > 0) {
        const segExp = displayExpHr * segDur;
        segInfo = `<span style="color:var(--text2);font-size:.75em;margin-left:2px;" title="EXP earned in this segment: ${fmtExp(segExp)} over ${fmtTime(segDur)}">earns ${fmtExp(segExp)} over ${fmtTime(segDur)}</span>`;
      }
    }

    // For level-up phases, show the actual level-up EXP requirement
    let lvReqInfo = '';
    if (p.event === 'level-up' || p.event === 'level+insight') {
      // Show EXP required for each level gained
      const prevLv = prev.rLv, curLv = p.rLv;
      if (curLv > prevLv) {
        const reqs = [];
        for (let lv = prevLv; lv < curLv; lv++) reqs.push(researchExpReq(lv, serverVarResXP));
        const totalReq = reqs.reduce((a,b) => a + b, 0);
        lvReqInfo = `<span style="color:var(--gold);font-size:.75em;margin-left:2px;" title="Total EXP required: ${reqs.map((r,i) => 'LV'+(prevLv+i)+'\u2192'+(prevLv+i+1)+': '+fmtExp(r)).join(', ')}">(${fmtExp(totalReq)} req)</span>`;
      }
    }

    // Header row: always visible
    html += `<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;">`;
    const realTimeStr = fmtRealTime(p.time);
    const timeTitle = realTimeStr ? ` title="${realTimeStr}"` : '';
    html += `<span style="color:var(--text2);min-width:48px;font-size:.85em;font-variant-numeric:tabular-nums;"${timeTitle}>${fmtTime(p.time)}</span>`;
    if (realTimeStr) html += `<span style="color:var(--text2);font-size:.7em;opacity:.7;min-width:0;white-space:nowrap;">${realTimeStr}</span>`;
    html += `<span style="font-size:1em;">${icon}</span>`;
    html += `<span style="font-weight:600;color:${borderColor};flex:1;">${eventLabel}</span>`;
    html += `<span style="color:var(--green);font-weight:700;font-size:.95em;">${fmtVal(displayExpHr)}/hr</span>`;
    html += deltaStr;
    html += lvReqInfo;
    html += segInfo;
    if (hasDetails) html += `<span class="action-chevron" id="chevron-${i}" style="color:var(--text2);font-size:.7em;margin-left:4px;transition:transform .2s;">\u25b6</span>`;
    html += `</div>`;

    // Collapsible detail
    if (hasDetails) {
      html += `<div id="${detId}" style="display:none;padding:4px 10px 8px 66px;font-size:.82em;color:var(--text2);border-top:1px solid #1a1a2e;">`;
      html += details.join('');
      html += `</div>`;
    }

    html += `</div>`;
  }

  html += _renderExpSummary(phases, sim);

  if (!html) html = '<div style="color:var(--text2);text-align:center;padding:16px;">No actions needed - current config is optimal.</div>';
  actDiv.innerHTML = html;
  for (const el of actDiv.querySelectorAll('[data-phase]')) {
    el.addEventListener('click', () => {
      toggleActionDetail(Number(el.dataset.phase), Number(el.dataset.phasecount), Number(el.dataset.totaltime));
    });
  }
}

export function toggleActionDetail(phaseIdx, phaseCount, totalTime) {
  const det = document.getElementById('action-detail-' + phaseIdx);
  const chev = document.getElementById('chevron-' + phaseIdx);
  if (det) {
    const showing = det.style.display !== 'none';
    det.style.display = showing ? 'none' : 'block';
    if (chev) chev.style.transform = showing ? '' : 'rotate(90deg)';
  }
  // Highlight corresponding timeline segment
  highlightTimelinePhase(phaseIdx, null, totalTime);
}

export function highlightTimelinePhase(phaseIdx, _unused, totalTime) {
  // Position arrow above the phase segment
  const arrow = document.getElementById('tl-arrow');
  const timelineDiv = document.getElementById('opt-timeline');
  if (!arrow || !timelineDiv) return;

  // Find the clicked segment to get its position
  const seg = timelineDiv.querySelector('[data-phase="' + phaseIdx + '"]');
  if (seg) {
    const left = parseFloat(seg.style.left);
    const width = parseFloat(seg.style.width);
    arrow.style.display = 'block';
    arrow.style.left = (left + width / 2).toFixed(2) + '%';
  }

  // Outline the segment
  for (const child of timelineDiv.querySelectorAll('[data-phase]')) {
    const ci = parseInt(child.dataset.phase);
    child.style.outline = ci === phaseIdx ? '2px solid var(--gold)' : 'none';
    child.style.zIndex = ci === phaseIdx ? '2' : '0';
  }

  // Outline the action step
  const allSteps = document.querySelectorAll('[id^="action-step-"]');
  for (const s of allSteps) {
    s.style.outline = s.id === 'action-step-' + phaseIdx ? '1px solid var(--gold)' : 'none';
  }
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
  // Grid lines (4 lines)
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + plotH * (1 - i / 4);
    const val = yMin + yRange * i / 4;
    svg += `<line x1="${pad.left}" y1="${y}" x2="${W-pad.right}" y2="${y}" stroke="#333" stroke-width="1"/>`;
    svg += `<text x="${pad.left-5}" y="${y+4}" fill="#888" font-size="10" text-anchor="end">${fmtVal(val)}</text>`;
  }

  // EXP line (step function)
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

  // Phase markers
  for (const p of phases) {
    if (p.event === 'start' || p.event === 'end') continue;
    const x = pad.left + (p.time / totalTime) * plotW;
    const pExpHr = p.grindInfo ? p.grindInfo.grindExpHr : p.expHr;
    const y = pad.top + plotH * (1 - (pExpHr - yMin) / yRange);
    svg += `<line x1="${x}" y1="${pad.top}" x2="${x}" y2="${pad.top+plotH}" stroke="var(--gold)" stroke-width="1" stroke-dasharray="4,4" opacity="0.5"/>`;
    svg += `<circle cx="${x}" cy="${y}" r="3" fill="var(--gold)"/>`;
  }

  // X axis labels
  const steps = [0, 0.25, 0.5, 0.75, 1];
  for (const s of steps) {
    const x = pad.left + plotW * s;
    svg += `<text x="${x}" y="${H-5}" fill="#888" font-size="10" text-anchor="middle">${fmtTime(totalTime * s)}</text>`;
  }
  svg += '</svg>';
  chartDiv.innerHTML = svg;
}

export function renderMiniGrid(overlay, gl, positions) {
  const usedGL = gl || gridLevels;
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
        // Unlocked but not yet leveled - highlight as available
        label = gridCoord(i);
        labelColor = '#665522';
        bg = 'rgba(255,215,0,.08)';
        bT = '1px dashed #554400'; bB = bT; bL = bT; bR = bT;
      } else {
        label = '\u00b7';
        labelColor = '#333';
      }
      // Shape overlay (connected borders) on all nodes
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
  // SVG shape polygon overlay - use provided positions if available, else global
  const activeShapes = new Set();
  for (let i = 0; i < overlay.length; i++) {
    if (overlay[i] >= 0) activeShapes.add(overlay[i]);
  }
  if (activeShapes.size > 0) {
    const usePos = positions || shapePositions;
    const gw = COLS * cellSize, gh = GRID_ROWS * cellSize;
    let svg = `<svg style="position:absolute;top:4px;left:4px;width:${gw}px;height:${gh}px;pointer-events:none;z-index:2;" viewBox="15 24 600 360" preserveAspectRatio="none">`;
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
      svg += `<polygon points="${poly.map(([x,y])=>x+','+y).join(' ')}" fill="none" stroke="${SHAPE_COLORS[si]}" stroke-width="2" stroke-linejoin="round" opacity="0.7"/>`;
    }
    svg += '</svg>';
    html += svg;
  }
  html += '</div>';
  return html;
}
