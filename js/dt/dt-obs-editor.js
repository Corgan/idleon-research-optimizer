// dt-obs-editor.js - Observation magnifier editor for the decision tree.
// Extracted from dt-grid.js.

import { OCC_DATA } from '../game-data.js';
import {
  buildKalMap, computeMagnifiersOwnedWith, computeOccurrencesToBeFound,
  gbWith, getKaleiMultiBase, isObsUsable, magMaxForLevel, obsBaseExp,
} from '../sim-math.js';
import { makeSimCtx, simTotalExp } from '../save/context.js';
import { hideTooltip, moveTooltip } from '../ui/tooltip.js';
import { DT } from './dt-state.js';
import { dtRenderModal } from './decision-tree.js';
import { dtRecalcExpHr } from './dt-grid.js';

const _DT_OBS_COLS = 8;
let _dtObsDragData = null; // {magIdx, fromSlot} or {poolType}

export function dtRenderObsEditor() {
  if (!DT.editState) return;
  const s = DT.editState;
  const occTBF = computeOccurrencesToBeFound(s.rLv, s.occ);
  const mOwned = computeMagnifiersOwnedWith(s.gl, s.rLv, s.ctx || makeSimCtx(s.gl));
  const mMax = magMaxForLevel(s.rLv);

  // Pool counts
  let usedByType = [0, 0, 0];
  for (const m of s.md) { if (m.slot >= 0) usedByType[m.type]++; }
  const expectedK = Math.round((s.gl[72] || 0) + s.saveCtx.evShop33);
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
  poolHtml += `<span style="color:var(--text2);font-size:.8em;">Total: ${usedByType[0]+usedByType[1]+usedByType[2]}/${mOwned} - Max/slot: ${mMax}</span>`;
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
  const kalMap = buildKalMap(s.md);

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
  if (!tt) return;

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
      const _ctx2 = s.ctx || makeSimCtx(s.gl);

      const basePerMag = obsBaseExp(oi);
      const gd101 = gbWith(s.gl, s.so, 93, _ctx2);
      const gd101Multi = 1 + gd101 * lv / 100;
      const kalBase = getKaleiMultiBase(s.gl, s.so, _ctx2);
      const kalMulti = 1 + adjKal * kalBase;
      const perMagFinal = basePerMag * gd101Multi * kalMulti;
      const totalExp = perMagFinal * mags;
      const insightBonus = gbWith(s.gl, s.so, 92, _ctx2) + gbWith(s.gl, s.so, 91, _ctx2);
      const emp46 = _ctx2.emp46 || 0;
      const monoRate = 3 * (1 + insightBonus / 100) * (1 + 35 * emp46 / 100) * kalMulti;
      const resMulti = simTotalExp({ gridLevels: s.gl, shapeOverlay: s.so, magData: s.md, insightLvs: s.il, occFound: s.occ, researchLevel: s.rLv }, s.saveCtx).multi;
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
  dtRecalcExpHr();
  dtRenderModal();
}

function _dtRemoveMagFromSlotDirect(magIdx) {
  if (!DT.editState) return;
  const m = DT.editState.md[magIdx];
  if (m && m.slot >= 0) {
    m.slot = -1;
    dtRecalcExpHr();
    dtRenderModal();
  }
}

function _dtCycleMagType(magIdx) {
  if (!DT.editState) return;
  const s = DT.editState;
  const m = s.md[magIdx];
  if (!m || m.slot < 0) return;
  const expectedK = Math.round((s.gl[72] || 0) + s.saveCtx.evShop33);
  const expectedM = Math.round(s.gl[91] || 0);
  const mOwned = computeMagnifiersOwnedWith(s.gl, s.rLv, s.ctx || makeSimCtx(s.gl));
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
  dtRecalcExpHr();
  dtRenderModal();
}

function _dtAddMagToSlot(slotIdx) {
  if (!DT.editState) return;
  const s = DT.editState;
  const mOwned = computeMagnifiersOwnedWith(s.gl, s.rLv, s.ctx || makeSimCtx(s.gl));
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
      dtRecalcExpHr();
      dtRenderModal();
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
      dtRecalcExpHr();
      dtRenderModal();
      return;
    }
  }
}
