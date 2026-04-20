// ===== OPTIMIZER UI - Entry point + timeline + actions for optimizer results =====

import { saveData } from '../state.js';
import { saveGlobalTime } from '../save/data.js';
import { OCC_DATA } from '../game-data.js';
import { researchExpReq } from '../sim-math.js';
import { buildSaveContext } from '../save/context.js';
import { diffPhaseConfigs } from '../phase-diff.js';
import {
  fmtExp,
  fmtTime,
  fmtVal,
} from '../renderers/format.js';
import {
  buildPhaseDetails,
  renderExpSummary,
  renderExpChart,
} from '../renderers/optimizer-render.js';
import { dtCreateNode } from '../dt/dt-sim.js';
import { dtReset, dtRenderTree } from '../dt/decision-tree.js';


// Convert sim hours-offset to a real date string, relative to now.
// Shows "X ago" / "in X" relative label + short date/time.
// Returns { text, epoch } where epoch is seconds (for live-update).
function fmtRealTime(simHrs) {
  if (!saveGlobalTime || !isFinite(simHrs)) return { text: '', epoch: 0 };
  const eventEpoch = saveGlobalTime + simHrs * 3600;
  return { text: _relTimeStr(eventEpoch), epoch: eventEpoch };
}
function _relTimeStr(eventEpoch) {
  const diffHrs = (eventEpoch - Date.now() / 1000) / 3600;
  let rel;
  if (Math.abs(diffHrs) < 1/60) rel = 'now';
  else if (diffHrs < 0) rel = fmtTime(-diffHrs) + ' ago';
  else rel = 'in ' + fmtTime(diffHrs);
  const d = new Date(eventEpoch * 1000);
  let hr = d.getHours(), ampm = hr >= 12 ? 'pm' : 'am';
  hr = hr % 12 || 12;
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${rel} (${hr}:${mm}${ampm})`;
}

// Live-update all visible real-time labels every 30s.
let _rtTimer = 0;
function _startRealTimeUpdates() {
  clearInterval(_rtTimer);
  _rtTimer = setInterval(() => {
    document.querySelectorAll('.opt-rt[data-epoch]').forEach(el => {
      el.textContent = _relTimeStr(+el.dataset.epoch);
    });
  }, 1_000);
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

  const colors = { 'start':'var(--accent)', 'level-up':'var(--gold)', 'insight-up':'var(--purple)', 'level+insight':'var(--cyan)', 'tournament':'#ff9800', 'end':'var(--green)' };

  // Build timeline bar + arrow marker container
  let html = '';
  for (let i = 0; i < phases.length - 1; i++) {
    const p = phases[i];
    const nextIdx = i + 1;
    const left = (p.time / totalTime * 100).toFixed(2);
    const width = ((phases[nextIdx].time - p.time) / totalTime * 100).toFixed(2);
    const color = colors[p.event] || 'var(--text2)';
    const tlReal = fmtRealTime(p.time).text;
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

function renderActions(sim, bestSteps) {
  const actDiv = document.getElementById('opt-actions');
  const phases = sim.phases;
  const totalTime = Math.max(sim.totalTime, 0.01);
  let html = '';

  // Synthetic "pre-optimization" config for start event diff
  const preOptConfig = {
    gl: saveData.gridLevels.slice(), so: saveData.shapeOverlay.slice(),
    md: saveData.magData.slice(0, saveData.magnifiersOwned).map(m=>({...m})),
    il: saveData.insightLvs.slice(),
    sp: saveData.shapePositions.map(s => ({...s}))
  };

  const colors = { 'start':'var(--cyan)', 'level-up':'var(--gold)', 'insight-up':'var(--purple)', 'level+insight':'var(--cyan)', 'tournament':'#ff9800', 'end':'var(--text2)' };

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
      prev = prevIdx >= 0 ? phases[prevIdx] : phases[0]; eventLabel = 'Level Up \u2192 LV ' + p.rLv; icon = '\u2b50';
    } else if (p.event === 'insight-up') {
      prev = prevIdx >= 0 ? phases[prevIdx] : phases[0];
      if (p.insightObs && p.insightObs.length > 0) {
        const obs = OCC_DATA[p.insightObs[0]];
        const obsName = obs ? obs.name.replace(/_/g, ' ') : 'Obs ' + p.insightObs[0];
        const newLv = p.insightLvs ? p.insightLvs[p.insightObs[0]] : null;
        eventLabel = obsName + (newLv != null ? ' \u2192 LV ' + newLv : ' Leveled Up');
      } else {
        eventLabel = 'Insight Level Up';
      }
      icon = '\u2b06';
    } else if (p.event === 'level+insight') {
      prev = prevIdx >= 0 ? phases[prevIdx] : phases[0]; eventLabel = 'Level \u2192 LV ' + p.rLv + ' + Insight'; icon = '\u26a1';
    } else if (p.event === 'tournament') {
      prev = prevIdx >= 0 ? phases[prevIdx] : phases[0];
      eventLabel = 'Tournament Registration';
      if (p.tournamentLeveledUp) eventLabel += ' \u2192 LV ' + p.rLv;
      icon = '\uD83C\uDFC6';
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
    const details = buildPhaseDetails(p, prev, diff);

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
        for (let lv = prevLv; lv < curLv; lv++) reqs.push(researchExpReq(lv, saveData.serverVarResXP));
        const totalReq = reqs.reduce((a,b) => a + b, 0);
        lvReqInfo = `<span style="color:var(--gold);font-size:.75em;margin-left:2px;" title="Total EXP required: ${reqs.map((r,i) => 'LV'+(prevLv+i)+'\u2192'+(prevLv+i+1)+': '+fmtExp(r)).join(', ')}">(${fmtExp(totalReq)} req)</span>`;
      }
    }

    // Tournament bonus info
    let tourneyInfo = '';
    if (p.event === 'tournament' && p.tournamentBonusExp) {
      tourneyInfo = `<span style="color:#ff9800;font-size:.75em;margin-left:2px;" title="+${p.tournamentBonusHrs}hr research time injected at ${fmtVal(p.tournamentBonusExp / p.tournamentBonusHrs)}/hr">(+${fmtExp(p.tournamentBonusExp)} bonus)</span>`;
    }

    // Header row: always visible
    const { text: realTimeStr, epoch: realEpoch } = fmtRealTime(p.time);
    html += `<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;">`;
    const timeTitle = realTimeStr ? ` title="${realTimeStr}"` : '';
    html += `<span style="color:var(--text2);min-width:48px;font-size:.85em;font-variant-numeric:tabular-nums;"${timeTitle}>${fmtTime(p.time)}</span>`;
    html += `<span style="font-size:1em;">${icon}</span>`;
    html += `<span style="font-weight:600;color:${borderColor};flex:1;">${eventLabel}</span>`;
    html += `<span style="color:var(--green);font-weight:700;font-size:.95em;">${fmtVal(displayExpHr)}/hr</span>`;
    html += deltaStr;
    html += lvReqInfo;
    html += tourneyInfo;
    html += segInfo;
    if (hasDetails) html += `<span class="action-chevron" id="chevron-${i}" style="color:var(--text2);font-size:.7em;margin-left:4px;transition:transform .2s;">\u25b6</span>`;
    html += `</div>`;

    // Collapsed goal line: always visible 2nd row
    let goalLine = '';
    if (p.grindInfo) {
      const gi = p.grindInfo;
      const permNote = gi.permGain != null && gi.rateGain > 0
        ? ` <span style="opacity:.5;" title="Permanent (102) gain only">\u2014 perm ${fmtTime(gi.grindHrs + (gi.permGain > 0 ? (gi.totalExpLost || 0) / gi.permGain : Infinity))} BE</span>`
        : '';
      goalLine = `\ud83d\udd2c Insight Grind: <span style="color:var(--purple);">${gi.obsName}</span> \u2192 LV ${gi.newInsightLv} <span style="opacity:.6;">(${fmtTime(gi.grindHrs)}, break-even ${fmtTime(gi.breakEvenHrs)})</span>${permNote}`;
    } else if (p.event !== 'end') {
      const nextP = i < phases.length - 1 ? phases[i + 1] : null;
      if (nextP) {
        if (nextP.event === 'level-up') {
          goalLine = `\ud83c\udfaf Next: Research LV ${nextP.rLv}`;
        } else if (nextP.event === 'insight-up' && nextP.insightObs && nextP.insightObs.length > 0) {
          const nObs = OCC_DATA[nextP.insightObs[0]];
          const nName = nObs ? nObs.name.replace(/_/g, ' ') : 'Obs ' + nextP.insightObs[0];
          const nLv = nextP.insightLvs ? nextP.insightLvs[nextP.insightObs[0]] : null;
          goalLine = `\ud83c\udfaf Next: ${nName}` + (nLv != null ? ` \u2192 LV ${nLv}` : ' insight level-up');
        } else if (nextP.event === 'level+insight') {
          goalLine = `\ud83c\udfaf Next: Research LV ${nextP.rLv} + insight`;
        } else if (nextP.event === 'end') {
          goalLine = `\ud83c\udfaf Running until target`;
        }
      }
    }
    const realTimeBit = realTimeStr ? `<span class="opt-rt" data-epoch="${realEpoch}" style="font-size:.9em;opacity:.55;margin-left:auto;white-space:nowrap;">${realTimeStr}</span>` : '';
    if (goalLine || realTimeStr) {
      html += `<div style="display:flex;align-items:baseline;padding:0 10px 6px 66px;font-size:.78em;color:var(--text2);"><span>${goalLine}</span>${realTimeBit}</div>`;
    }

    // Collapsible detail
    if (hasDetails) {
      html += `<div id="${detId}" style="display:none;padding:4px 10px 8px 66px;font-size:.82em;color:var(--text2);border-top:1px solid #1a1a2e;">`;
      html += details.join('');
      html += `</div>`;
    }

    html += `</div>`;
  }

  html += renderExpSummary(phases, sim, buildSaveContext(), fmtRealTime);

  if (!html) html = '<div style="color:var(--text2);text-align:center;padding:16px;">No actions needed - current config is optimal.</div>';
  actDiv.innerHTML = html;
  for (const el of actDiv.querySelectorAll('[data-phase]')) {
    el.addEventListener('click', () => {
      toggleActionDetail(Number(el.dataset.phase), Number(el.dataset.phasecount), Number(el.dataset.totaltime));
    });
  }
  _startRealTimeUpdates();
}

function toggleActionDetail(phaseIdx, phaseCount, totalTime) {
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

function highlightTimelinePhase(phaseIdx, _unused, totalTime) {
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

// ===== IMPORT OPTIMIZER RESULT INTO DECISION TREE =====
export function importOptToDecisionTree() {
  if (!_optimizerResult || !_optimizerResult.best) return;
  const phases = _optimizerResult.best.phases;
  if (!phases || phases.length === 0) return;

  dtReset();

  let prevId = null;
  for (let i = 0; i < phases.length; i++) {
    const p = phases[i];
    const segTime = i > 0 ? p.time - phases[i - 1].time : 0;
    // Build DT state from phase config snapshot
    const cfg = p.grindInfo ? (p.activeConfig || p.config) : p.config;
    const state = {
      gl: cfg.gl.slice(), so: cfg.so.slice(),
      md: cfg.md.map(m => ({...m})),
      il: cfg.il.slice(), ip: cfg.ip.slice(),
      occ: cfg.occ.slice(), sp: cfg.sp.map(s => ({...s})),
      rLv: p.rLv, rExp: p.rExp,
      expHr: p.grindInfo ? p.grindInfo.grindExpHr : p.expHr,
    };
    const node = dtCreateNode(prevId, p.event, segTime, state);
    node.insightObs = p.insightObs || null;
    node.insightLvs = p.insightLvs || null;
    prevId = node.id;
  }

  // Show the tree
  document.getElementById('dt-tree-wrap').style.display = 'block';
  dtRenderTree();

  // Switch to sandbox tab
  document.querySelectorAll('.tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === 'sandbox');
  });
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.getElementById('tab-sandbox').classList.add('active');
  // Size the viewport
  const sizer = document.getElementById('dt-viewport-sizer');
  if (sizer) {
    const top = sizer.getBoundingClientRect().top;
    sizer.style.height = (window.innerHeight - top) + 'px';
  }
}
