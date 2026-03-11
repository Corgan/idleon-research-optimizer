// ===== STATE-IO.JS - State export/import, save loading, supplements =====
// Extracted from app.js.

import {
  assignState,
  allBonusMulti,
  cachedBoonyCount,
  cachedComp0DivOk,
  cachedEvShop37,
  cachedEventShopStr,
  cachedExtPctExSticker,
  cachedFailedRolls,
  cachedResearchExp,
  cachedSpelunkyUpg7,
  cachedStickerFixed,
  comp52TrueMulti,
  companionIds,
  extBonusOverrides,
  extBonuses,
  externalResearchPct,
  gridLevels,
  insightLvs,
  insightProgress,
  magData,
  magMaxPerSlot,
  magnifiersOwned,
  occFound,
  researchLevel,
  serverVarResXP,
  shapeOverlay,
  shapePositions,
  shapeTiers,
  stateR7,
  totalTomePoints,
} from '../state.js';
import {
  assignSaveData,
  cachedAFKRate,
  loadedSaveFormat,
} from '../save/data.js';
import { GRID_SIZE } from '../game-data.js';
import { loadSaveData as _loadSaveIntoState } from '../save/loader.js';
import {
  computeAFKGainsRate,
  computeExternalBonuses,
} from '../save/external.js';
import { rebuildShapeOverlay } from '../optimizers/shapes-geo.js';
import {
  _dtReset,
  _saveShapeTiers,
  renderAll,
} from '../dt/decision-tree.js';
import { UE_NON_EXP_NODES } from '../renderers/shape-tiers.js';


// ===== STATE EXPORT / IMPORT (gzip + base64) =====
const STATE_PREFIX = 'ROv2:';

async function compressState(obj) {
  const json = JSON.stringify(obj);
  const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
  const buf = await new Response(stream).arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return STATE_PREFIX + btoa(binary);
}

async function decompressState(str) {
  if (!str.startsWith(STATE_PREFIX)) throw new Error('Invalid state string');
  const b64 = str.slice(STATE_PREFIX.length);
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  const json = await new Response(stream).text();
  return JSON.parse(json);
}

async function exportState() {
  const state = {
    _format: 'research-optimizer-state', _version: 2,
    gridLevels, shapeOverlay, occFound, insightLvs, insightProgress, magData, shapePositions,
    stateR7, researchLevel, magMaxPerSlot, magnifiersOwned,
    externalResearchPct, comp52TrueMulti, allBonusMulti, extBonuses,
    companionIds: [...companionIds], totalTomePoints, serverVarResXP,
    cachedEventShopStr, cachedResearchExp, cachedSpelunkyUpg7, cachedFailedRolls, cachedAFKRate, cachedComp0DivOk,
    cachedStickerFixed, cachedBoonyCount, cachedEvShop37, cachedExtPctExSticker,
    extBonusOverrides, loadedSaveFormat,
    shapeTiers: { above: shapeTiers.above.slice(), below: shapeTiers.below.slice() },
  };
  return await compressState(state);
}

export function toggleStateBox(mode) {
  const wrap = document.getElementById('state-box-wrap');
  const ta = document.getElementById('state-box');
  const copyBtn = document.getElementById('state-box-copy');
  const loadBtn = document.getElementById('state-box-load');
  const isVisible = wrap.style.display !== 'none';
  if (isVisible) { wrap.style.display = 'none'; return; }
  wrap.style.display = 'flex';
  if (mode === 'export') {
    copyBtn.style.display = '';
    loadBtn.style.display = 'none';
    ta.value = 'Generating...';
    ta.readOnly = true;
    exportState().then(encoded => { ta.value = encoded; ta.select(); }).catch(err => { ta.value = 'Error: ' + err.message; });
  } else {
    copyBtn.style.display = 'none';
    loadBtn.style.display = '';
    ta.value = '';
    ta.readOnly = false;
    ta.placeholder = 'Paste state string here...';
    ta.focus();
  }
}

export function copyStateBox() {
  const ta = document.getElementById('state-box');
  ta.select();
  navigator.clipboard.writeText(ta.value).then(() => {
    const btn = document.getElementById('state-box-copy');
    const orig = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = orig, 1500);
  }).catch((e) => { console.warn('Clipboard write failed:', e); });
}

export async function loadStateBox() {
  const text = (document.getElementById('state-box').value || '').trim();
  if (!text) { alert('Paste a state string first.'); return; }
  try {
    const raw = await decompressState(text);
    importState(raw);
    document.getElementById('state-box-wrap').style.display = 'none';
  } catch (err) {
    console.error('State import error:', err);
    alert('Failed to import state: ' + err.message);
  }
}

function importState(raw) {
  if (raw._format !== 'research-optimizer-state') {
    alert('Not a valid optimizer state file.');
    return;
  }
  assignState({ gridLevels: raw.gridLevels || new Array(GRID_SIZE).fill(0) });
  assignState({ shapeOverlay: raw.shapeOverlay || new Array(GRID_SIZE).fill(-1) });
  assignState({ occFound: raw.occFound || new Array(80).fill(0) });
  assignState({ insightLvs: raw.insightLvs || new Array(80).fill(0) });
  assignState({ insightProgress: raw.insightProgress || new Array(80).fill(0) });
  assignState({ magData: raw.magData || [] });
  assignState({ shapePositions: raw.shapePositions || [] });
  assignState({ stateR7: raw.stateR7 || new Array(20).fill(0) });
  assignState({ researchLevel: raw.researchLevel || 0 });
  assignState({ magMaxPerSlot: raw.magMaxPerSlot || 1 });
  assignState({ magnifiersOwned: raw.magnifiersOwned || 0 });
  assignState({ externalResearchPct: raw.externalResearchPct || 0 });
  assignState({ comp52TrueMulti: raw.comp52TrueMulti || 1 });
  assignState({ allBonusMulti: raw.allBonusMulti || 1 });
  assignState({ companionIds: new Set(raw.companionIds || []) });
  assignState({ totalTomePoints: raw.totalTomePoints || 0 });
  assignState({ serverVarResXP: raw.serverVarResXP || 1.01 });
  assignState({ cachedEventShopStr: raw.cachedEventShopStr || '' });
  assignState({ cachedResearchExp: raw.cachedResearchExp || 0 });
  assignState({ cachedSpelunkyUpg7: raw.cachedSpelunkyUpg7 || 0 });
  assignState({ cachedFailedRolls: raw.cachedFailedRolls || 0 });
  assignSaveData({ cachedAFKRate: raw.cachedAFKRate || null });
  assignState({ cachedComp0DivOk: raw.cachedComp0DivOk || false });
  // Backward compat: old state exports lack sticker cache fields - derive from extBonuses
  if ('cachedStickerFixed' in raw) {
    assignState({ cachedStickerFixed: raw.cachedStickerFixed || 0 });
    assignState({ cachedBoonyCount: raw.cachedBoonyCount || 0 });
    assignState({ cachedEvShop37: raw.cachedEvShop37 || 0 });
    assignState({ cachedExtPctExSticker: raw.cachedExtPctExSticker || 0 });
  } else {
    // Old format: treat entire externalResearchPct as non-sticker (sticker stays static)
    assignState({ cachedStickerFixed: 0 });
    assignState({ cachedBoonyCount: 0 });
    assignState({ cachedEvShop37: 0 });
    assignState({ cachedExtPctExSticker: externalResearchPct });
  }
  assignState({ extBonusOverrides: raw.extBonusOverrides || {} });
  assignState({ extBonuses: raw.extBonuses || null });
  assignSaveData({ loadedSaveFormat: raw.loadedSaveFormat || 'state' });
  const defaultShapeTiers = { above: [], below: UE_NON_EXP_NODES.slice() };
  if (raw.shapeTiers && Array.isArray(raw.shapeTiers.below) && typeof raw.shapeTiers.below[0] === 'number') {
    shapeTiers.above = raw.shapeTiers.above || [];
    shapeTiers.below = [...(raw.shapeTiers.below || []), ...(raw.shapeTiers.disabled || [])];
  } else {
    shapeTiers.above = []; shapeTiers.below = defaultShapeTiers.below.slice();
  }
  _saveShapeTiers();
  // State files already store the correct overlay (preserving user placement order)
  updateSaveFormatUI();
  renderAll();
}

export function loadSaveData(raw) {
    _loadSaveIntoState(raw);
    updateSaveFormatUI();
    _dtReset();
    renderAll();
}

export function loadFromPaste() {
  const ta = document.getElementById('json-paste');
  const text = (ta.value || '').trim();
  if (!text) return;
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    console.error('JSON parse error:', err);
    alert('Invalid JSON: ' + err.message);
    return;
  }
  try {
    loadSaveData(raw);
    ta.value = '';
    document.getElementById('json-paste-wrap').style.display = 'none';
  } catch (err) {
    console.error('Save load error:', err.message, '\n', err.stack);
    alert('Error loading save data: ' + err.message);
  }
}

function updateSaveFormatUI() {
  const badge = document.getElementById('save-format-badge');
  badge.style.display = 'inline';
  document.getElementById('export-state-btn').style.display = 'inline';
  if (loadedSaveFormat === 'it.json') {
    badge.textContent = 'it.json';
    badge.style.background = 'rgba(76,175,80,.2)';
    badge.style.color = 'var(--green)';
    document.getElementById('supplement-panel').style.display = 'none';
  } else if (loadedSaveFormat === 'state') {
    badge.textContent = 'state';
    badge.style.background = 'rgba(100,181,246,.2)';
    badge.style.color = 'var(--cyan)';
    document.getElementById('supplement-panel').style.display = 'none';
  } else {
    badge.textContent = 'save.json';
    badge.style.background = 'rgba(233,69,96,.15)';
    badge.style.color = 'var(--accent)';
    // Show supplement panel with current state
    const sp = document.getElementById('supplement-panel');
    sp.style.display = '';
    sp.querySelectorAll('.comp-toggle').forEach(cb => {
      cb.checked = companionIds.has(Number(cb.dataset.id));
    });
    const allCbs = sp.querySelectorAll('.comp-toggle');
    const selAll = document.getElementById('comp-select-all');
    if (selAll) selAll.checked = [...allCbs].every(cb => cb.checked);
    document.getElementById('supp-tome').value = totalTomePoints || 0;
    document.getElementById('supp-resxp').value = serverVarResXP || 1.01;
  }
}

export function applySupplements() {
  assignState({ companionIds: new Set() });
  document.querySelectorAll('.comp-toggle').forEach(cb => {
    if (cb.checked) companionIds.add(Number(cb.dataset.id));
  });
  // Sync "select all" checkbox state
  const allCbs = document.querySelectorAll('.comp-toggle');
  const allEl = document.getElementById('comp-select-all');
  if (allEl) allEl.checked = [...allCbs].every(cb => cb.checked);
  assignState({ totalTomePoints: Number(document.getElementById('supp-tome').value) || 0 });
  assignState({ serverVarResXP: Number(document.getElementById('supp-resxp').value) || 1.01 });
  // Rebuild shape overlay (companion 54 affects shapes owned count).
  // We must rebuild here because the number of active shapes changed,
  // but placement-order overlap is unknown - use index order as best approximation.
  assignState({ shapeOverlay: rebuildShapeOverlay(shapePositions) });
  // Recompute derived state (only if real save loaded, not state snapshot)
  if (loadedSaveFormat !== 'state') {
    assignState({ extBonuses: computeExternalBonuses() });
    assignState({ externalResearchPct: extBonuses._total });
    assignState({ comp52TrueMulti: 1 + (extBonuses._comp52?.val || 0) });
    assignState({ allBonusMulti: extBonuses._allMulti?.val || 1 });
    assignSaveData({ cachedAFKRate: computeAFKGainsRate() });
  }
  renderAll();
}
