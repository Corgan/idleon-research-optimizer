// ===== shape-tiers.js - Shape Tier Presets & Tier List Rendering =====
// Split from render-upgrades.js.

import {
  gridLevels,
  shapeOverlay,
  shapeTiers,
} from '../state.js';
import {
  GRID_COLS,
  GRID_ROWS,
  NODE_GOAL,
  NODE_GOAL_COLORS,
  RES_GRID_RAW,
  SHAPE_BONUS_PCT,
  SHAPE_COLORS,
  SHAPE_NAMES,
} from '../game-data.js';
import {
  computeCellValues,
} from '../optimizers/shapes.js';
import { gridCoord } from '../grid-helpers.js';
// Circular import (safe: all uses are inside functions, not at module parse time)
import { _formatDesc, getLastOpt, renderUpgradeEval } from './upgrade-eval.js';

// ===== UPGRADE EVAL - SHAPE PRIORITY SYSTEM =====
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
shapeTiers.above = []; shapeTiers.below = UE_NON_EXP_NODES.slice();

export function _saveShapeTiers() {
  _dedupTiers();
  try { localStorage.setItem('idleon_shapeTiers', JSON.stringify({ above: shapeTiers.above, below: shapeTiers.below })); } catch(e) { console.warn('Failed to save shapeTiers:', e); }
}
function _loadShapeTiers() {
  try {
    const raw = JSON.parse(localStorage.getItem('idleon_shapeTiers'));
    if (raw && Array.isArray(raw.below)) {
      shapeTiers.above = raw.above || [];
      shapeTiers.below = [...(raw.below || []), ...(raw.disabled || [])];
    }
  } catch(e) { console.warn('Failed to load shapeTiers:', e); }
  _dedupTiers();
  // Reconcile: ensure every non-EXP node appears in exactly one tier
  const allTiered = new Set([...shapeTiers.above, ...shapeTiers.below]);
  for (const idx of UE_NON_EXP_NODES) {
    if (!allTiered.has(idx)) shapeTiers.below.push(idx);
  }
  // Remove stale nodes
  const validNonExp = new Set(UE_NON_EXP_NODES);
  const allNodes = new Set(Object.keys(RES_GRID_RAW).map(Number));
  // Above allows any valid node (including EXP nodes for presets like Insight)
  for (let i = shapeTiers.above.length - 1; i >= 0; i--) {
    if (!allNodes.has(shapeTiers.above[i])) shapeTiers.above.splice(i, 1);
  }
  // Below only allows non-EXP nodes
  for (let i = shapeTiers.below.length - 1; i >= 0; i--) {
    if (!validNonExp.has(shapeTiers.below[i])) shapeTiers.below.splice(i, 1);
  }
}
function _dedupTiers() {
  const seen = new Set();
  for (const list of [shapeTiers.above, shapeTiers.below]) {
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
  { id: '_minehead', name: 'Minehead',  data: 'J6,G5,H5,I5,H4|' },
  { id: '_dr',       name: 'DR',        data: 'N4,M4,I4|' },
  { id: '_daily',    name: 'Daily',     data: 'K5,L5|' },
  { id: '_classexp', name: 'Class EXP', data: 'K6,L6,M6,M5|' },
  { id: '_insight',  name: 'Insight',   data: 'L8,M8|' },
];

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
  const allNodes = new Set(Object.keys(RES_GRID_RAW).map(Number));
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
export function _getActivePresetId() {
  return localStorage.getItem(SP_ACTIVE_KEY) || '';
}
function _setActivePresetId(id) {
  try { localStorage.setItem(SP_ACTIVE_KEY, id); } catch(e) { console.warn('Failed to save active preset:', e); }
}
export function _isBasePreset(id) { return id && id.startsWith('_'); }

function _applyPreset(preset) {
  const tiers = _stringToTiers(preset.data);
  if (!tiers) return;
  shapeTiers.above = tiers.above;
  shapeTiers.below = tiers.below;
  _dedupTiers();
  // Base presets don't save tiers to localStorage
  if (!_isBasePreset(preset.id)) _saveShapeTiers();
}

// On load: if a base preset is active, apply it from the constant (not localStorage)
(function _applyBaseOnLoad() {
  const activeId = localStorage.getItem(SP_ACTIVE_KEY) || '';
  if (activeId && activeId.startsWith('_')) {
    const bp = SP_BASE_PRESETS.find(p => p.id === activeId);
    if (bp) {
      const tiers = _stringToTiers(bp.data);
      if (tiers) { shapeTiers.above = tiers.above; shapeTiers.below = tiers.below; }
    }
  }
})();

export function _renderPresetSidebar() {
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
      existing.data = _tiersToString(shapeTiers);
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
      presets.push({ id, name, data: _tiersToString(shapeTiers) });
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
    ioBox.value = (name ? name + ':' : '') + _tiersToString(shapeTiers);
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
    shapeTiers.above = tiers.above;
    shapeTiers.below = tiers.below;
    _dedupTiers();
    _saveShapeTiers();
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
      presets.push({ id, name: finalName, data: _tiersToString(shapeTiers) });
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

export function _tierOnChange() {
  _saveShapeTiers();
  _updateAboveWarning();
  // Drag modified tiers - deselect any base preset since they're immutable
  const activeId = _getActivePresetId();
  if (_isBasePreset(activeId)) {
    _setActivePresetId('');
  }
  renderUpgradeEval();
}

// Build shape-bonus tooltip info for a node (uses optimized overlay)
function _shapeInfo(nodeIdx) {
  const opt = getLastOpt();
  const ov = opt ? opt.optimizedOverlay : shapeOverlay;
  const si = ov[nodeIdx];
  if (si < 0) return '';
  const info = RES_GRID_RAW[nodeIdx];
  if (!info) return '';
  const lv = gridLevels[nodeIdx] || 0;
  const baseBonus = info[2] * lv;
  const shapePct = SHAPE_BONUS_PCT[si];
  const boosted = baseBonus * (1 + shapePct / 100);
  return '<div class="tt-shape" style="color:' + SHAPE_COLORS[si] + '">' + SHAPE_NAMES[si]
    + ' (+' + shapePct + '%): ' + boosted.toFixed(1) + '</div>';
}
export function _renderTierList(containerId, tiers, onChange, opts) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const locked = opts && opts.locked;

  // Shared tooltip element
  let tierTT = document.getElementById('tier-tt');
  if (!tierTT) {
    tierTT = document.createElement('div');
    tierTT.id = 'tier-tt';
    tierTT.className = 'tier-tt';
    document.body.appendChild(tierTT);
  }

  // Collect leveled EXP nodes for the immutable mid-section, sorted by cell value (optimized order)
  const aboveSet = new Set(tiers.above);
  const expNodes = [];
  for (const idxStr of Object.keys(RES_GRID_RAW)) {
    const idx = Number(idxStr);
    if ((gridLevels[idx] || 0) < 1) continue;
    if (aboveSet.has(idx)) continue; // shown in above zone instead
    const goal = NODE_GOAL[idx] || '';
    if (NODE_GOAL_COLORS[goal]) expNodes.push(idx);
  }
  const _cv = computeCellValues();
  expNodes.sort((a, b) => (_cv[b] || 0) - (_cv[a] || 0));

  function showTierTooltip(e, nodeIdx) {
    const info = RES_GRID_RAW[nodeIdx];
    if (!info) return;
    const lv = gridLevels[nodeIdx] || 0;
    const baseBonus = info[2] * lv;
    let html = '<span class="tt-coord">' + gridCoord(nodeIdx) + '</span> ';
    html += '<span class="tt-name">' + info[0].replace(/_/g, ' ') + '</span><br>';
    html += '<span class="tt-lv">Level: ' + lv + ' / ' + info[1] + '</span>';
    html += '<div class="tt-bonus">Base bonus: ' + baseBonus.toFixed(1) + '</div>';
    html += _shapeInfo(nodeIdx);
    html += '<div class="tt-desc">' + _formatDesc(nodeIdx) + '</div>';
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

  function rebuild() {
    container.innerHTML = '';
    let dragSrc = null, dragTier = null;

    const aboveFiltered = tiers.above.filter(n => (gridLevels[n] || 0) >= 1);
    const belowFiltered = tiers.below.filter(n => (gridLevels[n] || 0) >= 1);


    function sqColor(nodeIdx) {
      const opt = getLastOpt();
      const ov = opt ? opt.optimizedOverlay : shapeOverlay;
      const si = ov[nodeIdx];
      if (si >= 0) return SHAPE_COLORS[si];
      return '#555';
    }

    function makeSq(nodeIdx, tierName) {
      const div = document.createElement('div');
      div.className = 'tier-sq';
      div.draggable = !locked && tierName !== 'exp';
      div.dataset.node = nodeIdx;
      div.dataset.tier = tierName;
      div.textContent = gridCoord(nodeIdx);
      div.style.borderColor = sqColor(nodeIdx);
      if (locked) div.style.opacity = '0.7';
      if (tierName === 'exp') {
        div.classList.add('tier-exp');
      }
      // Tooltip
      div.addEventListener('mouseenter', (e) => showTierTooltip(e, nodeIdx));
      div.addEventListener('mousemove', moveTierTT);
      div.addEventListener('mouseleave', hideTierTT);

      if (tierName === 'exp' || locked) return div;
      // Drag
      div.addEventListener('dragstart', (e) => {
        dragSrc = nodeIdx; dragTier = tierName;
        div.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      div.addEventListener('dragend', () => { div.classList.remove('dragging'); });
      div.addEventListener('dragover', (e) => {
        e.preventDefault();
        div.style.outline = '2px solid var(--accent)';
      });
      div.addEventListener('dragleave', () => { div.style.outline = ''; });
      div.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        div.style.outline = '';
        if (dragSrc === null || dragSrc === nodeIdx) return;
        tiers[dragTier].splice(tiers[dragTier].indexOf(dragSrc), 1);
        const destPos = tiers[tierName].indexOf(nodeIdx);
        tiers[tierName].splice(destPos, 0, dragSrc);
        hideTierTT();
        onChange();
        rebuild();
      });
      return div;
    }

    function makeZone(tierName, label) {
      const zone = document.createElement('div');
      zone.className = 'tier-zone';
      zone.dataset.tier = tierName;
      zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        zone.classList.add('drag-over');
      });
      zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
      zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('drag-over');
        if (dragSrc === null) return;
        if (tiers[dragTier].indexOf(dragSrc) < 0) { dragSrc = null; return; } // already handled by child
        tiers[dragTier].splice(tiers[dragTier].indexOf(dragSrc), 1);
        tiers[tierName].push(dragSrc);
        hideTierTT();
        onChange();
        rebuild();
      });
      const filtered = tierName === 'above' ? aboveFiltered : belowFiltered;
      if (filtered.length === 0) {
        const lbl = document.createElement('div');
        lbl.className = 'tier-zone-label';
        lbl.textContent = label;
        zone.appendChild(lbl);
      }
      return zone;
    }

    // Above section
    const aboveZone = makeZone('above', 'drag here to prioritize over EXP');
    aboveFiltered.forEach(n => aboveZone.appendChild(makeSq(n, 'above')));
    container.appendChild(aboveZone);

    // EXP divider + immutable squares
    const expDiv = document.createElement('div');
    expDiv.className = 'tier-divider';
    expDiv.innerHTML = '<hr><span>\u2501 Res EXP \u2501</span><hr>';
    container.appendChild(expDiv);
    if (expNodes.length > 0) {
      const expZone = document.createElement('div');
      expZone.className = 'tier-zone';

      for (const idx of expNodes) expZone.appendChild(makeSq(idx, 'exp'));
      container.appendChild(expZone);
    }

    // Below section
    const belowDiv = document.createElement('div');
    belowDiv.className = 'tier-divider';
    belowDiv.innerHTML = '<hr><span>\u2501 Below EXP \u2501</span><hr>';
    container.appendChild(belowDiv);
    const belowZone = makeZone('below', 'drag here for below EXP');
    belowFiltered.forEach(n => belowZone.appendChild(makeSq(n, 'below')));
    container.appendChild(belowZone);


  }
  rebuild();
}

export function _updateAboveWarning() {
  const warn = document.getElementById('ue-warn-above');
  if (!warn) return;
  warn.style.display = shapeTiers.above.length > 0 ? '' : 'none';
}
