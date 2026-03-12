// ===== render-analysis.js - Insight ROI + Observation Unlock renderers =====
// Extracted from decision-tree.js. ES module.

import { buildSaveContext } from '../save/context.js';
import {
  GRID_COLS,
  GRID_SIZE,
  OCC_DATA,
  RES_GRID_RAW,
  SHAPE_COLORS,
} from '../game-data.js';
import {
  computeOccurrencesToBeFound,
} from '../sim-math.js';
import {
  sameShapeCell,
} from '../optimizers/shapes-geo.js';
import {
  fmtExact,
  fmtExp,
  fmtTime,
  fmtVal,
} from './format.js';
import {
  runWorkerTask,
} from './worker-pool.js';

// ===== SHARED HELPERS =====

function _fmtLayoutHTML(layout, label) {
  // Aggregate layout by slot: {slot: {0:count, 1:count, 2:count}}
  const bySlot = {};
  for (const m of layout) {
    if (!bySlot[m.slot]) bySlot[m.slot] = {0:0, 1:0, 2:0};
    bySlot[m.slot][m.type]++;
  }
  const magNames = ['Mag','Mono','Kalei'];
  const magColors = ['var(--text)','var(--purple)','var(--cyan)'];
  const slots = Object.keys(bySlot).map(Number).sort((a,b) => a - b);
  if (slots.length === 0) return `<em style="color:var(--text2);">No mags placed</em>`;
  let h = `<div style="display:flex;flex-wrap:wrap;gap:4px 10px;">`;
  for (const s of slots) {
    const counts = bySlot[s];
    const oData = s >= 0 && s < OCC_DATA.length ? OCC_DATA[s] : null;
    const oName = oData ? oData.name.replace(/_/g,' ') : `Slot ${s}`;
    const parts = [];
    for (let t = 0; t < 3; t++) {
      if (counts[t] > 0) parts.push(`<span style="color:${magColors[t]};">${counts[t]}${magNames[t]}</span>`);
    }
    h += `<span style="background:rgba(255,255,255,.04);border-radius:4px;padding:1px 5px;font-size:.82em;white-space:nowrap;"><span style="color:var(--text2);">${oName}:</span> ${parts.join(' ')}</span>`;
  }
  h += '</div>';
  return h;
}

let _roiTabUid = 0;
function _roiSwitchTab(btn) {
  const bar = btn.parentElement, wrap = bar.parentElement;
  bar.querySelectorAll('.roi-tab-btn').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  const idx = parseInt(btn.dataset.idx);
  wrap.querySelectorAll('.roi-tab-panel').forEach((p, i) => {
    p.classList.toggle('active', i === idx);
  });
}
window._roiSwitchTab = _roiSwitchTab;

function _fmtLayoutDiff(before, during, after, researchLevel, occFound) {
  // Tabbed obs grid: DT-inspired cards with colored mag dots, one phase per tab
  // Shows ALL unlocked observations, not just those with magnifiers
  const aggregate = (layout) => {
    const bySlot = {};
    for (const m of layout) {
      if (m.slot < 0) continue;
      if (!bySlot[m.slot]) bySlot[m.slot] = [0,0,0];
      bySlot[m.slot][m.type]++;
    }
    return bySlot;
  };

  const dotColors = ['#81c784','#ce93d8','#4dd0e1']; // Mag, Mono, Kalei (matches DT)

  // Get all unlocked observation indices
  const occTBF = computeOccurrencesToBeFound(researchLevel, occFound);
  const allObsIndices = [];
  for (let i = 0; i < Math.min(occTBF, OCC_DATA.length); i++) allObsIndices.push(i);

  // Render a full obs grid for one phase's mag layout (all unlocked obs)
  const renderPhaseGrid = (slots) => {
    if (allObsIndices.length === 0) return '<span style="color:var(--text2);font-size:.82em;">No observations unlocked.</span>';
    const COLS = Math.min(allObsIndices.length, 8);
    let g = `<div style="display:grid;grid-template-columns:repeat(${COLS},1fr);gap:4px;">`;
    for (const s of allObsIndices) {
      const counts = slots[s] || [0,0,0];
      const hasAny = counts[0] + counts[1] + counts[2] > 0;
      const oData = s >= 0 && s < OCC_DATA.length ? OCC_DATA[s] : null;
      let oName = oData ? oData.name.replace(/_/g,' ') : `Slot ${s}`;
      if (oName.length > 16) oName = oName.slice(0,15) + '\u2026';
      const dimStyle = hasAny ? '' : 'opacity:.45;';
      g += `<div style="background:#1a1a2e;border:1.5px solid ${hasAny ? '#555' : '#282828'};border-radius:5px;padding:4px 5px;min-width:0;${dimStyle}">`;
      g += `<div style="font-size:.7em;color:var(--text2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:3px;" title="${oData ? oData.name.replace(/_/g,' ') : ''}">${oName}</div>`;
      g += `<div style="display:flex;flex-wrap:wrap;gap:1px;align-items:center;min-height:14px;">`;
      if (hasAny) {
        for (let t = 0; t < 3; t++) {
          for (let n = 0; n < counts[t]; n++) {
            g += `<span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${dotColors[t]};border:1.5px solid #555;margin:1px;flex-shrink:0;"></span>`;
          }
        }
      } else {
        g += `<span style="font-size:.65em;color:#444;">\u2014</span>`;
      }
      g += '</div></div>';
    }
    g += '</div>';
    return g;
  };

  const bSlots = aggregate(before), dSlots = aggregate(during), aSlots = aggregate(after);
  if (allObsIndices.length === 0) return '<span style="color:var(--text2);font-size:.82em;">No observations unlocked.</span>';

  const tabs = [
    { label: 'Before', color: 'var(--text2)', slots: bSlots },
    { label: 'During Grind', color: 'var(--gold)', slots: dSlots },
    { label: 'After Grind', color: 'var(--green)', slots: aSlots },
  ];

  // Legend
  let h = '<div style="display:flex;gap:10px;align-items:center;margin:4px 0 4px;font-size:.75em;color:var(--text2);">';
  h += `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${dotColors[0]};border:1px solid #555;"></span> Mag`;
  h += `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${dotColors[1]};border:1px solid #555;margin-left:6px;"></span> Mono`;
  h += `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${dotColors[2]};border:1px solid #555;margin-left:6px;"></span> Kalei`;
  h += '</div>';

  h += '<div class="roi-tabs"><div class="roi-tab-bar">';
  for (let i = 0; i < tabs.length; i++) {
    h += `<button class="roi-tab-btn${i===0?' active':''}" data-idx="${i}" onclick="_roiSwitchTab(this)" style="color:${tabs[i].color};">${tabs[i].label}</button>`;
  }
  h += '</div>';
  for (let i = 0; i < tabs.length; i++) {
    h += `<div class="roi-tab-panel${i===0?' active':''}">${renderPhaseGrid(tabs[i].slots)}</div>`;
  }
  h += '</div>';
  return h;
}

function _fmtShapeDiff(beforeSO, duringSO, afterSO, gridLevels) {
  // Tabbed mini research grids showing shape overlay per phase
  const allIdx = Object.keys(RES_GRID_RAW).map(Number).sort((a,b) => a - b);

  // Check if there are any changes
  let hasChanges = false;
  for (const idx of allIdx) {
    const b = beforeSO[idx] !== undefined ? beforeSO[idx] : -1;
    const d = duringSO[idx] !== undefined ? duringSO[idx] : -1;
    const a = afterSO[idx] !== undefined ? afterSO[idx] : -1;
    if (b !== d || d !== a) { hasChanges = true; break; }
  }
  if (!hasChanges) return '<span style="color:var(--text2);font-size:.82em;">No shape changes across phases.</span>';

  // Render a mini grid (slightly larger since only one shown at a time)
  const cellSize = 18;
  const COLS = GRID_COLS;

  function renderShapeGrid(overlay) {
    let g = `<div style="display:inline-grid;grid-template-columns:repeat(${COLS},${cellSize}px);gap:0;background:#111;padding:3px;border-radius:5px;">`;
    for (let i = 0; i < GRID_SIZE; i++) {
      const info = RES_GRID_RAW[i];
      const lv = gridLevels[i] || 0;
      const si = overlay[i];
      let bg = '#0a0a15';
      let bT = '1px solid #1a1a1a', bB = bT, bL = bT, bR = bT;
      if (info) {
        if (lv > 0) bg = '#1a1a2e';
        if (si >= 0) {
          const c = SHAPE_COLORS[si];
          bg = c + '22';
          const col = i % COLS;
          bT = !sameShapeCell(overlay, i, i - COLS) ? `1.5px solid ${c}` : '1px solid transparent';
          bB = !sameShapeCell(overlay, i, i + COLS) ? `1.5px solid ${c}` : '1px solid transparent';
          bL = col > 0 ? (!sameShapeCell(overlay, i, i - 1) ? `1.5px solid ${c}` : '1px solid transparent') : `1.5px solid ${c}`;
          bR = col < COLS - 1 ? (!sameShapeCell(overlay, i, i + 1) ? `1.5px solid ${c}` : '1px solid transparent') : `1.5px solid ${c}`;
        }
      }
      g += `<div style="width:${cellSize}px;height:${cellSize}px;background:${bg};border-top:${bT};border-bottom:${bB};border-left:${bL};border-right:${bR};box-sizing:border-box;"></div>`;
    }
    g += '</div>';
    return g;
  }

  const tabs = [
    { label: 'Before', color: 'var(--text2)', so: beforeSO },
    { label: 'During Grind', color: 'var(--gold)', so: duringSO },
    { label: 'After Grind', color: 'var(--green)', so: afterSO },
  ];

  let h = '<div class="roi-tabs"><div class="roi-tab-bar">';
  for (let i = 0; i < tabs.length; i++) {
    h += `<button class="roi-tab-btn${i===0?' active':''}" data-idx="${i}" onclick="_roiSwitchTab(this)" style="color:${tabs[i].color};">${tabs[i].label}</button>`;
  }
  h += '</div>';
  for (let i = 0; i < tabs.length; i++) {
    h += `<div class="roi-tab-panel${i===0?' active':''}">${renderShapeGrid(tabs[i].so)}</div>`;
  }
  h += '</div>';
  return h;
}

// ===== INSIGHT ROI =====

let _insightROISortMode = 'breakeven'; // 'grindtime' | 'rategain' | 'recoup' | 'breakeven'
let _insightROIHideFree = true;
let _insightROIPending = false;
let _insightROICachedData = null;

// Full recompute + render (called on tab switch / data change)
export async function renderInsightROI() {
  if (_insightROIPending) return;
  _insightROIPending = true;

  const summaryDiv = document.getElementById('insight-roi-summary');
  const tableDiv = document.getElementById('insight-roi-table');
  if (!summaryDiv || !tableDiv) { _insightROIPending = false; return; }

  summaryDiv.innerHTML = '<span style="color:var(--text2);">Computing insight ROI\u2026 <span id="insight-roi-progress">0/\u2026</span></span>';
  tableDiv.innerHTML = '';

  // Yield to let the browser paint the loading state
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

  let data;
  try {
    const progEl = document.getElementById('insight-roi-progress');
    data = await runWorkerTask('insightROI', 'insightROI', {}, (done, total) => {
      if (progEl) progEl.textContent = `${done}/${total} observations`;
    });
  } finally {
    _insightROIPending = false;
  }

  _insightROICachedData = data;
  _renderInsightROITable(data);
}

// Lightweight re-render using cached data (for sort/filter changes)
function _rerenderInsightROI() {
  if (_insightROICachedData) _renderInsightROITable(_insightROICachedData);
}
// Expose to global scope for inline event handlers
window._rerenderInsightROI = _rerenderInsightROI;
Object.defineProperty(window, '_insightROISortMode', {
  get() { return _insightROISortMode; },
  set(v) { _insightROISortMode = v; },
  configurable: true
});
Object.defineProperty(window, '_insightROIHideFree', {
  get() { return _insightROIHideFree; },
  set(v) { _insightROIHideFree = v; },
  configurable: true
});

function _renderInsightROITable(data) {
  const summaryDiv = document.getElementById('insight-roi-summary');
  const tableDiv = document.getElementById('insight-roi-table');
  if (!summaryDiv || !tableDiv) return;
  const sc = buildSaveContext();

  if (data.monoCount === 0) {
    summaryDiv.innerHTML = '<span style="color:var(--text2);">No Optical Monocles owned. Unlock grid node K5 (Optical Monocle) to use insight.</span>';
    tableDiv.innerHTML = '';
    return;
  }

  summaryDiv.innerHTML =
    `<span style="color:var(--text2);">Monocles: </span><span style="color:var(--purple);font-weight:700;">${data.monoCount}</span>` +
    `<span style="color:var(--text2);margin-left:16px;">Current Research EXP/hr: </span><span style="color:var(--green);font-weight:700;">${fmtVal(data.baseRate)} <span style="color:var(--text2);font-weight:400;font-size:.85em;">(${fmtExact(data.baseRate)})</span></span>`;

  // Sort buttons
  const sm = _insightROISortMode;
  function sortBtn(mode, label) {
    const active = sm === mode;
    return `<button onclick="_insightROISortMode='${mode}';_rerenderInsightROI();" style="padding:3px 10px;border-radius:4px;border:1px solid ${active ? 'var(--cyan)' : '#555'};background:${active ? 'rgba(0,188,212,.12)' : 'var(--bg3)'};color:${active ? 'var(--cyan)' : 'var(--text2)'};font-size:.78em;cursor:pointer;">${label}</button>`;
  }
  let ctrlHtml = '<div style="margin-bottom:8px;display:flex;gap:6px;align-items:center;"><span style="color:var(--text2);font-size:.82em;">Sort by:</span>';
  ctrlHtml += sortBtn('grindtime', 'Grind Time');
  ctrlHtml += sortBtn('rategain', 'Rate Gain');
  ctrlHtml += sortBtn('breakeven', 'Break-Even');
  ctrlHtml += sortBtn('efficiency', 'Efficiency');
  ctrlHtml += `<label style="margin-left:12px;font-size:.78em;color:var(--text2);cursor:pointer;display:flex;align-items:center;gap:4px;"><input type="checkbox" ${_insightROIHideFree ? 'checked' : ''} onchange="_insightROIHideFree=this.checked;_rerenderInsightROI();"> Hide free</label>`;
  ctrlHtml += '</div>';
  tableDiv.innerHTML = ctrlHtml;

  _renderInsightROIBody(data, tableDiv, sc);
}

function _renderInsightROIBody(data, container, sc) {
  if (!container) container = document.getElementById('insight-roi-table');
  if (!container) return;

  const sm = _insightROISortMode;

  // Sort rows based on current sort mode
  const sortedRows = data.rows.slice().sort((a, b) => {
    const as = a.scenarios[0], bs = b.scenarios[0];
    if (sm === 'grindtime') return (as?.grindHrs ?? Infinity) - (bs?.grindHrs ?? Infinity);
    if (sm === 'rategain') return (bs?.rateGain ?? -Infinity) - (as?.rateGain ?? -Infinity);
    if (sm === 'efficiency') {
      const ae = as && isFinite(as.breakEvenHrs) && as.breakEvenHrs > 0 ? as.rateGain / as.breakEvenHrs : (as?.rateGain > 0 ? Infinity : -Infinity);
      const be = bs && isFinite(bs.breakEvenHrs) && bs.breakEvenHrs > 0 ? bs.rateGain / bs.breakEvenHrs : (bs?.rateGain > 0 ? Infinity : -Infinity);
      return be - ae;
    }
    return (as?.breakEvenHrs ?? Infinity) - (bs?.breakEvenHrs ?? Infinity);
  });

  // Filter out "free" observations (no EXP loss) if checkbox is on
  const displayRows = _insightROIHideFree
    ? sortedRows.filter(r => {
        const sc = r.scenarios[0];
        return sc && isFinite(sc.totalExpLost) && sc.totalExpLost > 0;
      })
    : sortedRows;

  // Triage summary
  let html = '';
  let nHigh = 0, nMid = 0, nLow = 0;
  for (const r of displayRows) {
    const sc = r.scenarios[0];
    if (!sc || sc.rateGain <= 0 || !isFinite(sc.breakEvenHrs) || sc.breakEvenHrs <= 0) { nLow++; continue; }
    const eff = sc.rateGain / sc.breakEvenHrs;
    if (eff > 10) nHigh++;
    else if (eff > 1) nMid++;
    else nLow++;
  }
  if (displayRows.length > 0) {
    html += '<div style="font-size:.82em;margin-bottom:6px;color:var(--text2);">';
    if (nHigh > 0) html += `<span style="color:var(--green);font-weight:600;">${nHigh} high-value</span> `;
    if (nMid > 0) html += `<span style="color:var(--gold);font-weight:600;">${nMid} moderate</span> `;
    if (nLow > 0) html += `<span style="opacity:.6;">${nLow} low/none</span>`;
    html += '</div>';
  }

  const NCOLS = 11;
  html += '<div style="overflow-x:auto;">';
  html += '<table style="width:100%;border-collapse:collapse;font-size:.85em;">';
  html += '<thead><tr style="border-bottom:2px solid var(--accent);color:var(--text2);">';
  html += '<th style="text-align:left;padding:8px 6px;">Observation</th>';
  html += '<th style="padding:8px 4px;">Insight LV</th>';
  html += '<th style="padding:8px 4px;">+LV</th>';
  html += '<th style="padding:8px 4px;">Insight/hr</th>';
  html += '<th style="padding:8px 4px;">Grind Time</th>';
  html += '<th style="padding:8px 4px;">EXP/hr During</th>';
  html += '<th style="padding:8px 4px;">EXP Lost</th>';
  html += '<th style="padding:8px 4px;">Rate Gain</th>';
  html += '<th style="padding:8px 4px;">Recoup</th>';
  html += '<th style="padding:8px 4px;">Break-Even</th>';
  html += '<th style="padding:8px 4px;" title="Rate gain per hour of break-even time">Efficiency</th>';
  html += '</tr></thead><tbody>';

  for (const row of displayRows) {
    const nScenarios = row.scenarios.length;
    for (let si = 0; si < nScenarios; si++) {
      const sc = row.scenarios[si];
      const isFirst = si === 0;
      // +1 for the collapsible layout row
      const rowSpan = isFirst ? ` rowspan="${nScenarios}"` : '';
      const borderTop = isFirst ? 'border-top:1px solid #333;' : '';

      html += `<tr style="${borderTop}">`;
      if (isFirst) {
        html += `<td${rowSpan} style="padding:6px;font-weight:600;color:var(--text);">${row.name}</td>`;
        html += `<td${rowSpan} style="text-align:center;padding:6px;color:var(--purple);">${row.lv}</td>`;
      }
      html += `<td style="text-align:center;padding:6px;color:var(--gold);">+${sc.lvGain}</td>`;

      html += `<td style="text-align:center;padding:6px;color:var(--purple);">${sc.insightRate.toFixed(1)}</td>`;
      html += `<td style="text-align:center;padding:6px;">${fmtTime(sc.grindHrs)}</td>`;
      html += `<td style="text-align:center;padding:6px;color:var(--text2);">${fmtVal(sc.grindRate)}</td>`;
      html += `<td style="text-align:center;padding:6px;color:#ff6b6b;">${isFinite(sc.totalExpLost) && sc.totalExpLost > 0 ? fmtExp(sc.totalExpLost) : '\u2014'}</td>`;

      const gainColor = sc.rateGain > 0 ? 'var(--green)' : sc.rateGain < 0 ? '#ff6b6b' : 'var(--text2)';
      html += `<td style="text-align:center;padding:6px;color:${gainColor};">${sc.rateGain > 0 ? '+' : ''}${fmtVal(sc.rateGain)}</td>`;
      html += `<td style="text-align:center;padding:6px;">${fmtTime(sc.recoupHrs)}</td>`;

      const beColor = sc.worth
        ? (sc.breakEvenHrs < 24 ? 'var(--green)' : sc.breakEvenHrs < 72 ? 'var(--gold)' : 'var(--text)')
        : '#ff6b6b';
      html += `<td style="text-align:center;padding:6px;color:${beColor};font-weight:600;">${fmtTime(sc.breakEvenHrs)}</td>`;

      // Efficiency: rate gain per hour of break-even time
      let effStr = '\u2014', effColor = 'var(--text2)';
      if (sc.rateGain > 0 && isFinite(sc.breakEvenHrs) && sc.breakEvenHrs > 0) {
        const eff = sc.rateGain / sc.breakEvenHrs;
        effStr = '+' + fmtVal(eff);
        effColor = eff > 10 ? 'var(--green)' : eff > 1 ? 'var(--gold)' : 'var(--text2)';
      } else if (sc.rateGain > 0 && sc.breakEvenHrs === 0) {
        effStr = '\u221e';
        effColor = 'var(--green)';
      } else if (sc.rateGain <= 0) {
        effStr = 'No gain';
        effColor = '#ff6b6b';
      }
      html += `<td style="text-align:center;padding:6px;color:${effColor};font-weight:700;" title="Permanent EXP/hr gained per hour of break-even time">${effStr}</td>`;
      html += '</tr>';
    }
    // Collapsible details row after each observation
    html += `<tr><td colspan="${NCOLS}" style="padding:0 6px 6px;">`;

    // Layout details
    html += `<details style="margin:4px 0 0;"><summary style="cursor:pointer;color:var(--accent);font-size:.82em;padding:2px 0;">Show layouts (before / during / after grind)${row.useInsightShapes ? ' <span style="color:var(--purple);">\u2728 insight-optimized shapes</span>' : ''}</summary>`;
    html += `<div style="margin-top:4px;"><strong style="color:var(--text2);font-size:.82em;">Magnifier Layout</strong>`;
    html += _fmtLayoutDiff(data.baselineLayout, row.grindLayout, row.afterLayout || data.baselineLayout, sc.researchLevel, sc.occFound);
    html += `</div>`;
    const duringSO = row.grindSO || data.baselineSO;
    const afterSO = row.afterSO || data.baselineSO;
    if (data.baselineSO) {
      html += `<div style="margin-top:8px;"><strong style="color:var(--text2);font-size:.82em;">Shape Coverage</strong><br>`;
      html += _fmtShapeDiff(data.baselineSO, duringSO, afterSO, sc.gridLevels);
      html += `</div>`;
    }
    html += '</details></td></tr>';
  }

  html += '</tbody></table></div>';
  // Append table HTML after ctrl bar
  const bodyDiv = document.createElement('div');
  bodyDiv.innerHTML = html;
  container.appendChild(bodyDiv);
}

// ===== OBS UNLOCK PRIORITY =====

let _obsUnlockPending = false;

export async function renderObsUnlock() {
  if (_obsUnlockPending) return;
  _obsUnlockPending = true;

  const summaryDiv = document.getElementById('obs-unlock-summary');
  const tableDiv = document.getElementById('obs-unlock-table');
  if (!summaryDiv || !tableDiv) { _obsUnlockPending = false; return; }
  summaryDiv.innerHTML = '<span style="color:var(--text2);">Computing observation priorities\u2026 <span id="obs-unlock-progress">0/\u2026</span></span>';
  tableDiv.innerHTML = '';
  // Yield to let the loading message paint
  await new Promise(r => setTimeout(r, 0));

  let data;
  try {
    const progEl = document.getElementById('obs-unlock-progress');
    data = await runWorkerTask('obsUnlock', 'obsUnlock', {}, (done, total) => {
      if (progEl) progEl.textContent = `${done}/${total} observations`;
    });
  } finally {
    _obsUnlockPending = false;
  }

  summaryDiv.innerHTML =
    `<span style="color:var(--text2);">Roll range: </span><span style="color:var(--gold);font-weight:700;">1\u2013${data.maxRoll}</span>` +
    (data.smartEyeLv > 0 ? `<span style="color:var(--text2);margin-left:8px;font-size:.85em;">(Smart Eye pity +${data.smartEyeLv}/fail, cap +${data.smartEyeCap})</span>` : '') +
    `<span style="color:var(--text2);margin-left:16px;">Rolls/day: </span><span style="color:var(--gold);font-weight:700;">${data.rollsPerDay}</span>` +
    `<span style="color:var(--text2);margin-left:16px;">Failed streak: </span><span style="color:var(--purple);font-weight:700;">${data.failedRolls}</span>` +
    `<span style="color:var(--text2);margin-left:16px;">Current EXP/hr: </span><span style="color:var(--green);font-weight:700;">${fmtVal(data.currentTotal)}</span>`;

  if (data.results.length === 0) {
    tableDiv.innerHTML = '<p style="color:var(--text2);">All observations discovered!</p>';
    return;
  }

  let html = '<div style="overflow-x:auto;">';
  html += '<table style="width:100%;border-collapse:collapse;font-size:.85em;">';
  html += '<thead><tr style="border-bottom:2px solid var(--accent);color:var(--text2);">';
  html += '<th style="text-align:left;padding:8px 6px;">Observation</th>';
  html += '<th style="padding:8px 4px;">Roll Req</th>';
  html += '<th style="padding:8px 4px;">Res LV Req</th>';
  html += '<th style="padding:8px 4px;">P(unlock/day)</th>';
  html += '<th style="padding:8px 4px;">E[days]</th>';
  html += '<th style="padding:8px 4px;">EXP/hr Gain</th>';
  html += '<th style="padding:8px 4px;">EXP/hr / E[day]</th>';
  html += '<th style="padding:8px 4px;">Priority</th>';
  html += '</tr></thead><tbody>';

  const maxScore = data.results.length > 0 ? Math.max(...data.results.map(r => r.score)) : 1;

  for (const row of data.results) {
    const borderTop = 'border-top:1px solid #333;';

    // Roll difficulty coloring
    let rollColor = 'var(--green)';
    if (row.pUnlockToday < 0.01) rollColor = '#ff6b6b';
    else if (row.pUnlockToday < 0.1) rollColor = 'var(--text2)';
    else if (row.pUnlockToday < 0.5) rollColor = 'var(--gold)';

    // Res LV status
    const lvOk = row.canUseNow;
    const lvColor = lvOk ? 'var(--green)' : '#ff6b6b';
    const lvNote = lvOk ? '' : ' \u26A0';

    // EXP gain
    const gainColor = row.expGain > 0 ? 'var(--green)' : 'var(--text2)';

    // Priority label
    let priority = '\u2014', prioColor = 'var(--text2)';
    if (row.score <= 0 || !row.canUseNow) {
      priority = row.canUseNow ? 'Low' : 'Wait';
      prioColor = '#ff6b6b';
    } else if (row.score >= maxScore * 0.7) {
      priority = 'Best';
      prioColor = 'var(--green)';
    } else if (row.score >= maxScore * 0.3) {
      priority = 'Good';
      prioColor = 'var(--gold)';
    } else {
      priority = 'Low';
      prioColor = 'var(--text2)';
    }

    html += `<tr style="${borderTop}">`;
    html += `<td style="padding:6px;font-weight:600;color:var(--text);">${row.name}</td>`;
    html += `<td style="text-align:center;padding:6px;color:var(--gold);">${row.rollThreshold}</td>`;
    html += `<td style="text-align:center;padding:6px;color:${lvColor};">${row.requiredRLv}${lvNote}</td>`;
    html += `<td style="text-align:center;padding:6px;color:${rollColor};">${(row.pUnlockToday * 100).toFixed(1)}%</td>`;
    html += `<td style="text-align:center;padding:6px;">${isFinite(row.expectedDays) ? row.expectedDays.toFixed(1) + 'd' : '\u2014'}</td>`;
    html += `<td style="text-align:center;padding:6px;color:${gainColor};">${row.expGain > 0 ? '+' + fmtVal(row.expGain) : '\u2014'}</td>`;
    html += `<td style="text-align:center;padding:6px;color:${row.score > 0 ? 'var(--cyan)' : 'var(--text2)'};">${row.score > 0 ? fmtVal(row.score) : '\u2014'}</td>`;
    html += `<td style="text-align:center;padding:6px;color:${prioColor};font-weight:700;">${priority}</td>`;
    html += '</tr>';
  }

  html += '</tbody></table></div>';
  tableDiv.innerHTML = html;
}
