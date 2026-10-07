// ===== upgrade-eval.js - Shape Tier System & Upgrade Evaluation =====
// Merged from upgrade-eval.js + shape-tiers.js (originally split from render-upgrades.js).

import { saveData } from '../state.js';
import { buildSaveContext } from '../save/context.js';
import {
  GRID_COLS,
  GRID_INDICES,
  GRID_ROWS,
  GRID_SIZE,
  NODE_GOAL,
  NODE_GOAL_COLORS,
  RES_GRID_RAW,
  SHAPE_BONUS_PCT,
  SHAPE_COLORS,
  SHAPE_DIMS,
  SHAPE_NAMES,
  SHAPE_VERTICES,
  gridCoord,
} from '../game-data.js';
import {
  sameShapeCell,
} from '../optimizers/shapes-geo.js';
import {
  computeCellValues,
  optimizeShapePlacement,
} from '../optimizers/shapes.js';
import {
  fmtVal,
} from './format.js';
import {
  cancelWorkerTask,
  runWorkerTask,
} from '../workers/worker-pool.js';
import { attachTooltip } from '../ui/tooltip.js';
import { showGridTooltip } from '../ui/dashboard.js';
import { formatDesc } from './grid-desc.js';
import { mineheadShapePriority } from '../stats/systems/w7/minehead.js';

// ===== SHAPE PRIORITY SYSTEM =====
// All non-EXP node indices that can appear in shape tier lists
export const UE_NON_EXP_NODES = (() => {
  const nodes = [];
  for (const idxStr of Object.keys(NODE_GOAL)) {
    const idx = Number(idxStr);
    if (!NODE_GOAL_COLORS[NODE_GOAL[idx]]) nodes.push(idx);
  }
  return nodes.sort((a, b) => a - b);
})();

// Tier format: { above: [idx,...], below: [idx,...] }
// 'above' = shapes always placed here alongside EXP nodes
// 'below' = shapes placed here only with leftover shapes
// Initialize with all non-EXP nodes in 'below' (pure EXP optimization default)
saveData.shapeTiers.above = []; saveData.shapeTiers.below = UE_NON_EXP_NODES.slice();

export function saveShapeTiers() {
  _dedupTiers();
  try { localStorage.setItem('idleon_shapeTiers', JSON.stringify({ above: saveData.shapeTiers.above, below: saveData.shapeTiers.below })); } catch(e) { console.warn('Failed to save shapeTiers:', e); }
}
function _loadShapeTiers() {
  try {
    const raw = JSON.parse(localStorage.getItem('idleon_shapeTiers'));
    if (raw && Array.isArray(raw.below)) {
      saveData.shapeTiers.above = raw.above || [];
      saveData.shapeTiers.below = [...(raw.below || []), ...(raw.disabled || [])];
    }
  } catch(e) { console.warn('Failed to load shapeTiers:', e); }
  _dedupTiers();
  // Reconcile: ensure every non-EXP node appears in exactly one tier
  const allTiered = new Set([...saveData.shapeTiers.above, ...saveData.shapeTiers.below]);
  for (const idx of UE_NON_EXP_NODES) {
    if (!allTiered.has(idx)) saveData.shapeTiers.below.push(idx);
  }
  // Remove stale nodes
  const validNonExp = new Set(UE_NON_EXP_NODES);
  const allNodes = new Set(GRID_INDICES);
  // Above allows any valid node (including EXP nodes for presets like Insight)
  for (let i = saveData.shapeTiers.above.length - 1; i >= 0; i--) {
    if (!allNodes.has(saveData.shapeTiers.above[i])) saveData.shapeTiers.above.splice(i, 1);
  }
  // Below only allows non-EXP nodes
  for (let i = saveData.shapeTiers.below.length - 1; i >= 0; i--) {
    if (!validNonExp.has(saveData.shapeTiers.below[i])) saveData.shapeTiers.below.splice(i, 1);
  }
}
function _dedupTiers() {
  const seen = new Set();
  for (const list of [saveData.shapeTiers.above, saveData.shapeTiers.below]) {
    for (let i = list.length - 1; i >= 0; i--) {
      if (seen.has(list[i])) list.splice(i, 1); else seen.add(list[i]);
    }
  }
}
_loadShapeTiers();

// ===== SHAPE PRESET SYSTEM =====
const SP_STORAGE_KEY = 'idleon_shapePresets';
const SP_ACTIVE_KEY = 'idleon_shapePresetActive';

const SP_BASE_PRESETS = [
  { id: '_none',     name: 'Res EXP',   data: '|' },
  // Save-aware: currency nodes by exact shape gain, then damage nodes (static order is the no-save fallback).
  { id: '_minehead', name: 'Minehead',  data: 'J6,I5,H5,G4,F6,H4,G5|', build: _mineheadPresetData },
  { id: '_dr',       name: 'DR',        data: 'N4,M4,I4|' },
  { id: '_daily',    name: 'Daily',     data: 'K5,L5|' },
  { id: '_classexp', name: 'Class EXP', data: 'K6,L6,M6,M5|' },
  { id: '_insight',  name: 'Insight',   data: 'L8,M8|' },
];

function _mineheadPresetData() {
  if (!saveData.gridLevels || !saveData.gridLevels.some(lv => lv > 0)) return null;
  try {
    return mineheadShapePriority(saveData).map(i => gridCoord(i)).join(',') + '|';
  } catch (e) {
    console.warn('Minehead preset ranking failed:', e);
    return null;
  }
}
function _presetData(preset) {
  return (preset.build && preset.build()) || preset.data;
}

function _coordToIdx(coord) {
  const m = coord.match(/^([A-T])(\d{1,2})$/i);
  if (!m) return -1;
  const col = m[1].toUpperCase().charCodeAt(0) - 65;
  const row = GRID_ROWS - parseInt(m[2], 10);
  if (col < 0 || col >= GRID_COLS || row < 0 || row >= GRID_ROWS) return -1;
  return row * GRID_COLS + col;
}

function _tiersToString(tiers) {
  const above = tiers.above.map(i => gridCoord(i)).join(',');
  const below = tiers.below.map(i => gridCoord(i)).join(',');
  return above + '|' + below;
}

function _stringToTiers(str) {
  const parts = str.split('|');
  if (parts.length !== 2) return null;
  const nonExp = new Set(UE_NON_EXP_NODES);
  const allNodes = new Set(GRID_INDICES);
  const above = parts[0] ? parts[0].split(',').map(s => _coordToIdx(s.trim())).filter(i => i >= 0 && allNodes.has(i)) : [];
  const below = parts[1] ? parts[1].split(',').map(s => _coordToIdx(s.trim())).filter(i => i >= 0 && nonExp.has(i)) : [];
  // Add any missing non-EXP nodes to below
  const seen = new Set([...above, ...below]);
  for (const idx of UE_NON_EXP_NODES) {
    if (!seen.has(idx)) below.push(idx);
  }
  return { above, below };
}

function _loadPresets() {
  try { return JSON.parse(localStorage.getItem(SP_STORAGE_KEY)) || []; } catch(e) { console.warn('Failed to load presets:', e); return []; }
}
function _savePresets(presets) {
  try { localStorage.setItem(SP_STORAGE_KEY, JSON.stringify(presets)); } catch(e) { console.warn('Failed to save presets:', e); }
}
function _getActivePresetId() {
  return localStorage.getItem(SP_ACTIVE_KEY) || '';
}
function _setActivePresetId(id) {
  try { localStorage.setItem(SP_ACTIVE_KEY, id); } catch(e) { console.warn('Failed to save active preset:', e); }
}
function _isBasePreset(id) { return id && id.startsWith('_'); }

function _applyPreset(preset) {
  const tiers = _stringToTiers(_presetData(preset));
  if (!tiers) return;
  saveData.shapeTiers.above = tiers.above;
  saveData.shapeTiers.below = tiers.below;
  _dedupTiers();
  // Base presets don't save tiers to localStorage
  if (!_isBasePreset(preset.id)) saveShapeTiers();
}

// On load: if a base preset is active, apply it from the constant (not localStorage)
(function _applyBaseOnLoad() {
  const activeId = localStorage.getItem(SP_ACTIVE_KEY) || '';
  if (activeId && activeId.startsWith('_')) {
    const bp = SP_BASE_PRESETS.find(p => p.id === activeId);
    if (bp) {
      const tiers = _stringToTiers(_presetData(bp));
      if (tiers) { saveData.shapeTiers.above = tiers.above; saveData.shapeTiers.below = tiers.below; }
    }
  }
})();

function _renderPresetSidebar() {
  const sidebar = document.getElementById('sp-sidebar');
  if (!sidebar) return;
  sidebar.innerHTML = '';
  const presets = _loadPresets();
  const activeId = _getActivePresetId();

  function _clickPreset(p) {
    _applyPreset(p);
    _setActivePresetId(p.id);
    _renderPresetSidebar();
    renderUpgradeEval();
  }

  function _makeInlineInput(current, onConfirm) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;gap:2px;max-width:100%;box-sizing:border-box;';
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.value = current;
    inp.style.cssText = 'flex:1;min-width:0;font-size:.7em;padding:2px 4px;background:var(--bg3);color:var(--text);border:1px solid var(--cyan);border-radius:3px;outline:none;';
    const ok = document.createElement('button');
    ok.className = 'sp-btn';
    ok.textContent = '\u2713';
    ok.style.cssText = 'padding:2px 5px;font-size:.7em;color:var(--green);';
    const cancel = document.createElement('button');
    cancel.className = 'sp-btn';
    cancel.textContent = '\u2717';
    cancel.style.cssText = 'padding:2px 5px;font-size:.7em;color:#e74c3c;';
    ok.addEventListener('click', () => { if (inp.value.trim()) onConfirm(inp.value.trim()); });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && inp.value.trim()) onConfirm(inp.value.trim());
      if (e.key === 'Escape') _renderPresetSidebar();
    });
    cancel.addEventListener('click', () => _renderPresetSidebar());
    wrap.appendChild(inp);
    wrap.appendChild(ok);
    wrap.appendChild(cancel);
    setTimeout(() => { inp.focus(); inp.select(); }, 0);
    return wrap;
  }

  // Base presets (non-editable)
  SP_BASE_PRESETS.forEach(p => {
    const btn = document.createElement('button');
    btn.className = 'sp-preset' + (p.id === activeId ? ' sp-active' : '');
    btn.textContent = p.name;
    btn.title = p.name;
    btn.addEventListener('click', () => _clickPreset(p));
    sidebar.appendChild(btn);
  });

  // Separator between base and user presets
  if (presets.length > 0) {
    const sep = document.createElement('hr');
    sep.style.cssText = 'border:none;border-top:1px solid #444;margin:4px 0;';
    sidebar.appendChild(sep);
  }

  // User preset buttons
  presets.forEach((p, i) => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:2px;align-items:stretch;';
    const btn = document.createElement('button');
    btn.className = 'sp-preset' + (p.id === activeId ? ' sp-active' : '');
    btn.style.cssText = 'flex:1;min-width:0;';
    btn.textContent = p.name;
    btn.title = p.name;
    btn.addEventListener('click', () => _clickPreset(p));
    row.appendChild(btn);

    // Rename button
    const renBtn = document.createElement('button');
    renBtn.className = 'sp-btn';
    renBtn.textContent = '\u270E';
    renBtn.title = 'Rename';
    renBtn.style.cssText = 'padding:2px 4px;font-size:.65em;line-height:1;';
    renBtn.addEventListener('click', () => {
      row.innerHTML = '';
      row.appendChild(_makeInlineInput(p.name, (name) => {
        p.name = name;
        _savePresets(presets);
        _renderPresetSidebar();
      }));
    });
    row.appendChild(renBtn);

    // Delete button
    const delBtn = document.createElement('button');
    delBtn.className = 'sp-btn';
    delBtn.textContent = '\u2715';
    delBtn.title = 'Delete';
    delBtn.style.cssText = 'padding:2px 4px;font-size:.65em;line-height:1;color:#e74c3c;';
    delBtn.addEventListener('click', () => {
      presets.splice(i, 1);
      _savePresets(presets);
      if (activeId === p.id) _setActivePresetId('');
      _renderPresetSidebar();
    });
    row.appendChild(delBtn);

    sidebar.appendChild(row);
  });

  // Save / overwrite button
  const isUserPreset = activeId && !activeId.startsWith('_') && presets.find(p => p.id === activeId);
  if (isUserPreset) {
    const saveBtn = document.createElement('button');
    saveBtn.className = 'sp-btn';
    saveBtn.textContent = '\uD83D\uDCBE Save';
    saveBtn.title = 'Overwrite current preset';
    saveBtn.addEventListener('click', () => {
      const existing = presets.find(p => p.id === activeId);
      existing.data = _tiersToString(saveData.shapeTiers);
      _savePresets(presets);
      _renderPresetSidebar();
    });
    sidebar.appendChild(saveBtn);
  }

  // "+ Save" - inline input for name
  const newWrap = document.createElement('div');
  let newInputOpen = false;
  const newBtn = document.createElement('button');
  newBtn.className = 'sp-btn';
  newBtn.textContent = '+ Save';
  newBtn.title = 'Save current tiers as new preset';
  newBtn.addEventListener('click', () => {
    if (newInputOpen) return;
    newInputOpen = true;
    newBtn.style.display = 'none';
    const inp = _makeInlineInput('', (name) => {
      const id = Date.now().toString(36);
      presets.push({ id, name, data: _tiersToString(saveData.shapeTiers) });
      _savePresets(presets);
      _setActivePresetId(id);
      _renderPresetSidebar();
    });
    newWrap.appendChild(inp);
  });
  newWrap.appendChild(newBtn);
  sidebar.appendChild(newWrap);

  // Separator
  const sep2 = document.createElement('hr');
  sep2.style.cssText = 'border:none;border-top:1px solid #444;margin:4px 0;';
  sidebar.appendChild(sep2);

  // Import/Export
  const ioBox = document.createElement('textarea');
  ioBox.className = 'sp-io';
  ioBox.placeholder = 'Import/Export';
  ioBox.rows = 2;
  sidebar.appendChild(ioBox);

  const ioRow = document.createElement('div');
  ioRow.style.cssText = 'display:flex;gap:4px;';
  const expBtn = document.createElement('button');
  expBtn.className = 'sp-btn';
  expBtn.style.flex = '1';
  expBtn.textContent = 'Export';
  expBtn.addEventListener('click', () => {
    // Include preset name if one is active
    const aid = _getActivePresetId();
    let name = '';
    if (aid) {
      const bp = SP_BASE_PRESETS.find(p => p.id === aid);
      if (bp) name = bp.name;
      else { const up = presets.find(p => p.id === aid); if (up) name = up.name; }
    }
    ioBox.value = (name ? name + ':' : '') + _tiersToString(saveData.shapeTiers);
    ioBox.select();
  });
  const impBtn = document.createElement('button');
  impBtn.className = 'sp-btn';
  impBtn.style.flex = '1';
  impBtn.textContent = 'Import';
  impBtn.addEventListener('click', () => {
    let raw = ioBox.value.trim();
    let presetName = '';
    // Parse optional name prefix: "Name:above|below"
    const colonIdx = raw.indexOf(':');
    const pipeIdx = raw.indexOf('|');
    if (colonIdx > 0 && (pipeIdx < 0 || colonIdx < pipeIdx)) {
      presetName = raw.slice(0, colonIdx).trim();
      raw = raw.slice(colonIdx + 1);
    }
    const tiers = _stringToTiers(raw);
    if (!tiers) { ioBox.style.borderColor = '#e74c3c'; setTimeout(() => ioBox.style.borderColor = '', 1000); return; }
    saveData.shapeTiers.above = tiers.above;
    saveData.shapeTiers.below = tiers.below;
    _dedupTiers();
    saveShapeTiers();
    // Create a new user preset if name was included
    if (presetName) {
      const existingNames = new Set(presets.map(p => p.name));
      let finalName = presetName;
      if (existingNames.has(finalName) || SP_BASE_PRESETS.some(p => p.name === finalName)) {
        let suffix = 2;
        while (existingNames.has(finalName + ' ' + suffix) || SP_BASE_PRESETS.some(p => p.name === finalName + ' ' + suffix)) suffix++;
        finalName = finalName + ' ' + suffix;
      }
      const id = Date.now().toString(36);
      presets.push({ id, name: finalName, data: _tiersToString(saveData.shapeTiers) });
      _savePresets(presets);
      _setActivePresetId(id);
    } else {
      _setActivePresetId('');
    }
    _renderPresetSidebar();
    renderUpgradeEval();
  });
  ioRow.appendChild(expBtn);
  ioRow.appendChild(impBtn);
  sidebar.appendChild(ioRow);
}

function _tierOnChange() {
  saveShapeTiers();
  _updateAboveWarning();
  // Drag modified tiers - deselect any base preset since they're immutable
  const activeId = _getActivePresetId();
  if (_isBasePreset(activeId)) {
    _setActivePresetId('');
  }
  renderUpgradeEval();
}

// Build shape-bonus tooltip info for a node (uses optimized overlay)
function _shapeInfo(nodeIdx, sc) {
  const opt = getLastOpt();
  const ov = opt ? opt.optimizedOverlay : sc.shapeOverlay;
  const si = ov[nodeIdx];
  if (si < 0) return '';
  const info = RES_GRID_RAW[nodeIdx];
  if (!info) return '';
  const lv = sc.gridLevels[nodeIdx] || 0;
  const baseBonus = info[2] * lv;
  const shapePct = SHAPE_BONUS_PCT[si];
  const boosted = baseBonus * (1 + shapePct / 100);
  return '<div class="tt-shape" style="color:' + SHAPE_COLORS[si] + '">' + SHAPE_NAMES[si]
    + ' (+' + shapePct + '%): ' + boosted.toFixed(1) + '</div>';
}
function _renderTierList(containerId, tiers, onChange, opts) {
  const container = document.getElementById(containerId);
  if (!container) return;

  // Shared tooltip element
  let tierTT = document.getElementById('tier-tt');
  if (!tierTT) {
    tierTT = document.createElement('div');
    tierTT.id = 'tier-tt';
    tierTT.className = 'tier-tt';
    document.body.appendChild(tierTT);
  }

  // Leveled EXP nodes not prioritized above, sorted by cell value (optimized order)
  const _tierSc = (opts && opts.saveCtx) || buildSaveContext();
  const _cv = computeCellValues({ saveCtx: _tierSc });
  const _expNoise = Math.max(0, ..._cv) * 1e-12;
  // EXP-category nodes, plus any node whose shape bonus really changes Res EXP
  // (e.g. Boony Crowns via the Research EXP sticker); the optimizer ranks both by EXP.
  const isExpNode = (idx) => !!NODE_GOAL_COLORS[NODE_GOAL[idx] || ''] || (_cv[idx] || 0) > _expNoise;
  function collectExpNodes() {
    const aboveSet = new Set(tiers.above);
    const nodes = [];
    for (const idx of GRID_INDICES) {
      if ((_tierSc.gridLevels[idx] || 0) < 1) continue;
      if (aboveSet.has(idx)) continue; // shown in above zone instead
      if (isExpNode(idx)) nodes.push(idx);
    }
    return nodes.sort((a, b) => (_cv[b] || 0) - (_cv[a] || 0));
  }

  function showTierTooltip(e, nodeIdx) {
    const info = RES_GRID_RAW[nodeIdx];
    if (!info) return;
    const lv = _tierSc.gridLevels[nodeIdx] || 0;
    const baseBonus = info[2] * lv;
    let html = '<span class="tt-coord">' + gridCoord(nodeIdx) + '</span> ';
    html += '<span class="tt-name">' + info[0].replace(/_/g, ' ') + '</span><br>';
    html += '<span class="tt-lv">Level: ' + lv + ' / ' + info[1] + '</span>';
    html += '<div class="tt-bonus">Base bonus: ' + baseBonus.toFixed(1) + '</div>';
    html += _shapeInfo(nodeIdx, _tierSc);
    html += '<div class="tt-desc">' + formatDesc(nodeIdx, undefined, _tierSc) + '</div>';
    tierTT.innerHTML = html;
    tierTT.style.display = 'block';
    tierTT.style.left = (e.clientX + 12) + 'px';
    tierTT.style.top = (e.clientY + 12) + 'px';
  }
  function moveTierTT(e) {
    tierTT.style.left = (e.clientX + 12) + 'px';
    tierTT.style.top = (e.clientY + 12) + 'px';
  }
  function hideTierTT() { tierTT.style.display = 'none'; }

  let drag = null; // { node, from: 'above' | 'below' | 'exp' }
  let dropMark = null;

  function clearDropMark() {
    if (dropMark) dropMark.classList.remove('drop-before', 'drop-after');
    dropMark = null;
    container.querySelectorAll('.tier-zone.drag-over, .tier-zone.drag-deny').forEach(z => z.classList.remove('drag-over', 'drag-deny'));
  }

  // 'below' only holds non-EXP nodes; the EXP section only accepts EXP nodes returning from 'above'.
  function canDrop(toTier) {
    if (!drag) return false;
    if (toTier === 'below') return !isExpNode(drag.node);
    if (toTier === 'exp') return drag.from === 'above' && isExpNode(drag.node);
    return toTier === 'above';
  }

  function dropTarget(zone, e) {
    const sq = e.target.closest && e.target.closest('.tier-sq');
    if (!sq || !zone.contains(sq)) return null;
    const r = sq.getBoundingClientRect();
    return { sq, node: Number(sq.dataset.node), after: e.clientX > r.left + r.width / 2 };
  }

  function applyDrop(toTier, target) {
    const { node, from } = drag;
    if (target && target.node === node) return false;
    // EXP-valued non-EXP-category nodes stay in the stored 'below' list while shown in the EXP zone.
    for (const t of ['above', 'below']) {
      if (t !== from && !(from === 'exp' && t === 'below')) continue;
      const i = tiers[t].indexOf(node);
      if (i >= 0) tiers[t].splice(i, 1);
    }
    if (toTier !== 'exp') {
      const list = tiers[toTier];
      let pos = target ? list.indexOf(target.node) : -1;
      if (pos < 0) pos = list.length;
      else if (target.after) pos++;
      list.splice(pos, 0, node);
    }
    return true;
  }

  function rebuild() {
    container.innerHTML = '';
    clearDropMark();

    const aboveFiltered = tiers.above.filter(n => (_tierSc.gridLevels[n] || 0) >= 1);
    const belowFiltered = tiers.below.filter(n => (_tierSc.gridLevels[n] || 0) >= 1 && !isExpNode(n));
    const expNodes = collectExpNodes();


    function sqColor(nodeIdx) {
      const opt = getLastOpt();
      const ov = opt ? opt.optimizedOverlay : _tierSc.shapeOverlay;
      const si = ov[nodeIdx];
      if (si >= 0) return SHAPE_COLORS[si];
      return '#555';
    }

    function makeSq(nodeIdx, tierName) {
      const div = document.createElement('div');
      div.className = 'tier-sq';
      div.draggable = true;
      div.dataset.node = nodeIdx;
      div.dataset.tier = tierName;
      div.textContent = gridCoord(nodeIdx);
      div.style.borderColor = sqColor(nodeIdx);
      if (tierName === 'exp') {
        div.classList.add('tier-exp');
      }
      // Tooltip
      div.addEventListener('mouseenter', (e) => { if (!drag) showTierTooltip(e, nodeIdx); });
      div.addEventListener('mousemove', moveTierTT);
      div.addEventListener('mouseleave', hideTierTT);

      div.addEventListener('dragstart', (e) => {
        drag = { node: nodeIdx, from: tierName };
        div.classList.add('dragging');
        hideTierTT();
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(nodeIdx)); // required for Firefox to start the drag
      });
      div.addEventListener('dragend', () => {
        div.classList.remove('dragging');
        drag = null;
        clearDropMark();
      });
      return div;
    }

    function makeZone(tierName, label, nodes) {
      const zone = document.createElement('div');
      zone.className = 'tier-zone';
      zone.dataset.tier = tierName;
      zone.addEventListener('dragover', (e) => {
        if (!drag) return;
        e.preventDefault();
        const ok = canDrop(tierName);
        e.dataTransfer.dropEffect = ok ? 'move' : 'none';
        if (dropMark) dropMark.classList.remove('drop-before', 'drop-after');
        dropMark = null;
        zone.classList.toggle('drag-over', ok);
        zone.classList.toggle('drag-deny', !ok);
        if (!ok || tierName === 'exp') return;
        const t = dropTarget(zone, e);
        if (t && t.node !== drag.node) {
          dropMark = t.sq;
          dropMark.classList.add(t.after ? 'drop-after' : 'drop-before');
        }
      });
      zone.addEventListener('dragleave', (e) => {
        if (zone.contains(e.relatedTarget)) return;
        zone.classList.remove('drag-over', 'drag-deny');
        if (dropMark && zone.contains(dropMark)) { dropMark.classList.remove('drop-before', 'drop-after'); dropMark = null; }
      });
      zone.addEventListener('drop', (e) => {
        e.preventDefault();
        if (!drag || !canDrop(tierName)) { clearDropMark(); return; }
        const changed = applyDrop(tierName, tierName === 'exp' ? null : dropTarget(zone, e));
        drag = null;
        clearDropMark();
        if (!changed) return;
        hideTierTT();
        onChange();
        rebuild();
      });
      if (nodes.length === 0 && label) {
        const lbl = document.createElement('div');
        lbl.className = 'tier-zone-label';
        lbl.textContent = label;
        zone.appendChild(lbl);
      }
      nodes.forEach(n => zone.appendChild(makeSq(n, tierName)));
      return zone;
    }

    // Above section
    container.appendChild(makeZone('above', 'drag here to prioritize over EXP', aboveFiltered));

    // EXP divider + EXP squares (ordered by shape value; drag one up to force-prioritize it)
    const expDiv = document.createElement('div');
    expDiv.className = 'tier-divider';
    expDiv.innerHTML = '<hr><span>\u2501 Res EXP \u2501</span><hr>';
    container.appendChild(expDiv);
    container.appendChild(makeZone('exp', expNodes.length ? '' : 'drag EXP nodes here to unprioritize', expNodes));

    // Below section
    const belowDiv = document.createElement('div');
    belowDiv.className = 'tier-divider';
    belowDiv.innerHTML = '<hr><span>\u2501 Below EXP \u2501</span><hr>';
    container.appendChild(belowDiv);
    container.appendChild(makeZone('below', 'drag here for below EXP', belowFiltered));
  }
  rebuild();
}

function _updateAboveWarning() {
  const warn = document.getElementById('ue-warn-above');
  if (!warn) return;
  warn.style.display = saveData.shapeTiers.above.length > 0 ? '' : 'none';
}

// ===== UPGRADE EVALUATION =====

let _lastOpt = null; // cached optimizeShapePlacement result for current render cycle
export function getLastOpt() { return _lastOpt; }
let _pureExpTotal = 0; // EXP/hr from pure EXP-only optimization (no tiers)

let _shapeOptGen = 0;
export async function renderUpgradeEval(saveCtx) {
  // Cancel any in-flight shape optimization worker
  cancelWorkerTask('shapeOpt');
  const gen = ++_shapeOptGen;
  // Save-aware built-in presets re-rank against the currently loaded save.
  const activeBase = SP_BASE_PRESETS.find(p => p.id === _getActivePresetId());
  if (activeBase && activeBase.build) _applyPreset(activeBase);
  const sc = saveCtx || buildSaveContext();

  // Render the tier list and sidebar immediately (cheap)
  // Built-in presets stay editable; the first edit detaches them (see _tierOnChange).
  _renderTierList('ue-tier-shape', sc.shapeTiers, _tierOnChange, { saveCtx: sc });
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
    const result = await runWorkerTask('shapeOpt', 'shapeOpt', { args: { opts: { useTiers: true }, needPure: sc.shapeTiers.above.length > 0 } }, function(done, total, msg) {
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
    _lastOpt = optimizeShapePlacement({ useTiers: true, saveCtx: sc });
    if (sc.shapeTiers.above.length > 0) {
      _pureExpTotal = optimizeShapePlacement({ saveCtx: sc }).optimizedTotal;
    } else {
      _pureExpTotal = _lastOpt.phase1ExpTotal || 0;
    }
  }
  if (gridDiv) gridDiv.style.opacity = '';
  _refreshTierColors();
  renderUEGrid(sc);
}

// The tier list renders before the optimizer finishes; recolor its borders from the new result.
function _refreshTierColors() {
  const ov = _lastOpt && _lastOpt.optimizedOverlay;
  if (!ov) return;
  document.querySelectorAll('#ue-tier-shape .tier-sq').forEach(sq => {
    const si = ov[Number(sq.dataset.node)];
    sq.style.borderColor = si >= 0 ? SHAPE_COLORS[si] : '#555';
  });
}

function renderUEGrid(sc) {
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
      html += ' <span style="color:var(--text2);margin-left:auto;">' + opt.placements.length + ' shapes placed'
        + (opt.exactSearch && opt.exactSearch.proven
          ? ' \u00b7 <span style="color:var(--green);" title="Exhaustive search over every node set each shape can cover (' + opt.exactSearch.nodes.toLocaleString() + ' search nodes)">proven optimal</span>'
          : '')
        + '</span></div>';
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

    const lv = sc.gridLevels[i] || 0;
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
      el.dataset.shape = si;
      svg.appendChild(el);
    }
    gridDiv.appendChild(svg);
  }
  _renderShapeBreakdown(sc, opt);
}

// ===== PLACEMENT BREAKDOWN =====
// One card per placed shape in drag order. The game keeps a node with the first shape that
// covers it, so shapes must be dropped in this order for each to own the listed nodes.
// Lift dark shape colors (e.g. Maroon) toward white so they stay legible on the dark card background.
function _readableColor(hex) {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return hex;
  let h = m[1];
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  let rgb = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
  const lum = c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  if (lum(rgb) >= 110) return hex;
  for (let t = 0.1; t <= 1 && lum(rgb) < 110; t += 0.1) {
    rgb = [0, 2, 4].map(i => Math.round(parseInt(h.slice(i, i + 2), 16) * (1 - t) + 255 * t));
  }
  return 'rgb(' + rgb.join(',') + ')';
}

function _escHtml(s) {
  return String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function _shapeNodeSet(overlay, si) {
  const out = [];
  for (let i = 0; i < overlay.length; i++) if (overlay[i] === si) out.push(i);
  return out;
}

function _fmtShapePos(pos) {
  if (!pos || !Number.isFinite(Number(pos.x)) || !Number.isFinite(Number(pos.y))) return null;
  return '(' + Math.round(pos.x) + ', ' + Math.round(pos.y) + ')' + (pos.rot ? ' rot ' + pos.rot + '\u00b0' : '');
}

function _renderShapeBreakdown(sc, opt) {
  const host = document.getElementById('ue-shape-breakdown');
  if (!host) return;
  const placements = (opt && opt.placements) || [];
  if (placements.length === 0) { host.innerHTML = ''; return; }
  const current = sc.shapePositions || [];

  let html = '<div class="sb-head"><span>Placement</span>'
    + '<span class="sb-hint">Exact shape positions in game coordinates. Drop in this order; a node keeps the first shape that covers it.</span></div>'
    + '<table class="sb-table"><thead><tr><th>#</th><th>Shape</th><th>Place at</th><th>Currently</th><th>Nodes</th></tr></thead><tbody>';

  placements.forEach((p, order) => {
    const si = p.shapeIdx;
    const target = _fmtShapePos(p);
    const cur = current[si];
    const curStr = _fmtShapePos(cur);
    const same = cur && Math.round(cur.x) === Math.round(p.x) && Math.round(cur.y) === Math.round(p.y)
      && (Number(cur.rot) || 0) === (Number(p.rot) || 0);
    const owned = (p.cells || []).map(gridCoord).join(', ');
    html += '<tr class="sb-row" data-shape="' + si + '">'
      + '<td class="sb-order">' + (order + 1) + '</td>'
      + '<td><span class="sb-swatch" style="border-color:' + SHAPE_COLORS[si] + '"></span>'
      + '<span class="sb-name" style="color:' + _readableColor(SHAPE_COLORS[si]) + '">' + _escHtml(p.shapeName || SHAPE_NAMES[si]) + '</span>'
      + ' <span class="sb-lv">' + (p.bonusPct ?? SHAPE_BONUS_PCT[si]) + '%</span></td>'
      + '<td class="sb-pos">' + (target || '?') + '</td>'
      + '<td>' + (same ? '<span class="sb-same">already there</span>'
        : '<span class="sb-move">' + (curStr || 'not placed') + '</span>') + '</td>'
      + '<td class="sb-nodes">' + owned + '</td></tr>';
  });
  html += '</tbody></table>';

  const placed = new Set(placements.map(p => p.shapeIdx));
  const unused = [];
  for (let si = 0; si < SHAPE_NAMES.length; si++) {
    if (!placed.has(si) && _shapeNodeSet(sc.shapeOverlay || [], si).length > 0) unused.push(si);
  }
  if (unused.length) {
    html += '<div class="sb-filler">Not used by this layout: '
      + unused.map(si => '<span style="color:' + _readableColor(SHAPE_COLORS[si]) + '">' + _escHtml(SHAPE_NAMES[si]) + '</span>').join(', ') + '</div>';
  }
  host.innerHTML = html;

  host.querySelectorAll('.sb-row').forEach(row => {
    const si = row.dataset.shape;
    const poly = () => document.querySelector('#ue-grid .shape-svg polygon[data-shape="' + si + '"]');
    row.addEventListener('mouseenter', () => { const el = poly(); if (el) el.classList.add('sb-hl'); });
    row.addEventListener('mouseleave', () => { const el = poly(); if (el) el.classList.remove('sb-hl'); });
  });
}
