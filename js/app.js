// ===== APP.JS - Main-thread application code =====
// Extracted from research-optimizer-v2.html inline script.
// ES module: <script type="module" src="js/app.js">.


import { researchLevel } from './state.js';
import {
  _dtAutoOptMags,
  _dtAutoOptShapes,
  _dtBranch,
  _dtCompareSet,
  _dtDeleteNode,
  _dtHideInfoTip,
  _dtMoveInfoTip,
  _dtNodes,
  _dtRenderComparison,
  _dtRenderGridCanvas,
  _dtRenderTree,
  _dtReset,
  _dtSaveChanges,
  _dtSetGridMode,
  _dtSetShapeOpacity,
  _dtShowInfoTip,
  _dtStart,
  _dtToggleAutoInsight,
  _dtToggleLevelUpsOnly,
  _dtTreeMouseDown,
  _dtTreeMouseLeave,
  _dtTreeMouseMove,
  _dtTreeMouseUp,
  _dtTreeWheel,
  _dtTreeZoomIn,
  _dtTreeZoomOut,
  _dtTreeZoomReset,
  renderAll,
  renderInsightROI,
  renderObsUnlock,
  renderUpgradeEval,
} from './dt/decision-tree.js';
import {
  _cancelOptimizer,
  _runParallelOptimizer,
} from './renderers/worker-pool.js';
import { renderOptimizerResults } from './ui/optimizer-ui.js';
import {
  applySupplements,
  copyStateBox,
  loadFromPaste,
  loadSaveData,
  loadStateBox,
  toggleStateBox,
} from './ui/state-io.js';


// ===== EVENT HANDLERS =====

// Tab switching
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
    if (tab.dataset.tab === 'insight-roi') renderInsightROI();
    if (tab.dataset.tab === 'obs-unlock') renderObsUnlock();
    if (tab.dataset.tab === 'shape-opt') renderUpgradeEval();
    if (tab.dataset.tab === 'sandbox') { _dtSizeViewport(); if (_dtNodes.length === 0) _dtStart(); }
  });
});

function _dtSizeViewport() {
  const sizer = document.getElementById('dt-viewport-sizer');
  if (!sizer) return;
  const top = sizer.getBoundingClientRect().top;
  sizer.style.height = (window.innerHeight - top) + 'px';
}
window.addEventListener('resize', () => {
  if (document.getElementById('tab-sandbox')?.classList.contains('active')) _dtSizeViewport();
});

// Optimizer mode toggle
document.getElementById('opt-mode-level')?.addEventListener('click', () => {
  document.getElementById('opt-mode-level').style.opacity = '1';
  document.getElementById('opt-mode-hours').style.opacity = '.5';
  document.getElementById('opt-target-level-wrap').style.display = '';
  document.getElementById('opt-target-hours-wrap').style.display = 'none';
});
document.getElementById('opt-mode-hours')?.addEventListener('click', () => {
  document.getElementById('opt-mode-level').style.opacity = '.5';
  document.getElementById('opt-mode-hours').style.opacity = '1';
  document.getElementById('opt-target-level-wrap').style.display = 'none';
  document.getElementById('opt-target-hours-wrap').style.display = '';
});

// Optimizer run button
let _optRunning = false;
document.getElementById('opt-run-btn')?.addEventListener('click', async () => {
  const runBtn = document.getElementById('opt-run-btn');

  // If already running, cancel
  if (_optRunning) {
    _cancelOptimizer();
    return;
  }

  const isLevelMode = document.getElementById('opt-mode-level').style.opacity === '1';
  let target;
  if (isLevelMode) {
    const val = parseInt(document.getElementById('opt-target-level')?.value || '0');
    if (!val || val <= researchLevel) {
      alert('Enter a target level above your current level (' + researchLevel + ').');
      return;
    }
    target = { type: 'level', value: val };
  } else {
    const val = parseInt(document.getElementById('opt-target-hours')?.value || '0');
    if (!val || val <= 0) { alert('Enter a valid number of hours.'); return; }
    target = { type: 'hours', value: val };
  }

  // Show progress
  const progDiv = document.getElementById('opt-progress');
  const progBar = document.getElementById('opt-progress-bar');
  const progText = document.getElementById('opt-progress-text');
  const progDetail = document.getElementById('opt-progress-detail');
  progDiv.style.display = 'block';
  progBar.style.width = '0%';
  progDetail.textContent = '';
  _optRunning = true;
  runBtn.textContent = '\u274C Cancel';
  runBtn.style.background = '#a33';

  try {
    const assumeObs = !!document.getElementById('opt-assume-obs')?.checked;
    const extendInsightLA = !!document.getElementById('opt-insight-la')?.checked;
    const result = await _runParallelOptimizer(target, (done, total, msg, detail) => {
      const frac = done / total;
      const pct = (frac * 100).toFixed(0);
      progBar.style.width = pct + '%';
      progText.textContent = msg || (pct + '%');
      progDetail.innerText = detail || '';
    }, { assumeObs, extendInsightLA });
    progBar.style.width = '100%';
    progText.textContent = result.notice || 'Done!';
    progDetail.textContent = '';
    renderOptimizerResults(result);
  } catch(e) {
    if (e.message === 'Cancelled') {
      progText.textContent = 'Cancelled.';
      progBar.style.width = '0%';
    } else {
      console.error('Optimizer error:', e);
      progText.textContent = 'Error: ' + e.message;
    }
    progDetail.textContent = '';
  } finally {
    _optRunning = false;
    runBtn.textContent = 'Run Optimizer';
    runBtn.style.background = '';
  }
});

// Decision Tree buttons
// dt-reset handler is now inline onclick on the button inside dt-tree-wrap
document.getElementById('dt-save')?.addEventListener('click', () => _dtSaveChanges());
document.getElementById('dt-branch')?.addEventListener('click', () => _dtBranch());
document.getElementById('dt-compare-clear')?.addEventListener('click', () => {
  _dtCompareSet.clear();
  _dtRenderTree();
  _dtRenderComparison();
});
document.getElementById('dt-delete')?.addEventListener('click', () => _dtDeleteNode());
document.getElementById('dt-shape-optimize')?.addEventListener('click', () => _dtAutoOptShapes());
document.getElementById('dt-mag-optimize')?.addEventListener('click', () => _dtAutoOptMags());
document.getElementById('dt-grid-mode-pill')?.addEventListener('click', (e) => {
  const btn = e.target.closest('.dt-mode-btn');
  if (!btn) return;
  _dtSetGridMode(btn.dataset.mode);
  const mode = btn.dataset.mode;
  document.querySelectorAll('#dt-grid-mode-pill .dt-mode-btn').forEach(b => {
    const active = b.dataset.mode === mode;
    b.style.background = active ? (mode === 'upgrades' ? 'var(--gold)' : 'var(--purple)') : '#222';
    b.style.color = active ? '#000' : '#888';
    b.style.fontWeight = active ? '600' : '400';
  });
  // Hide shape popup when switching to upgrades
  if (mode === 'upgrades') {
    const popup = document.getElementById('dt-shape-rotate-popup');
    if (popup) popup.style.display = 'none';
  }
});
document.getElementById('dt-shape-opacity')?.addEventListener('input', (e) => {
  _dtSetShapeOpacity(parseInt(e.target.value) / 100);
  _dtRenderGridCanvas();
});
{
  const wrap = document.getElementById('dt-tree-wrap');
  if (wrap) {
    wrap.addEventListener('pointerdown', _dtTreeMouseDown);
    wrap.addEventListener('pointermove', _dtTreeMouseMove);
    wrap.addEventListener('pointerup', _dtTreeMouseUp);
    wrap.addEventListener('pointerleave', _dtTreeMouseLeave);
    wrap.addEventListener('wheel', _dtTreeWheel, { passive: false });
  }
}


// Initial render
renderAll();

// Button handlers (migrated from inline onclick)
document.getElementById('paste-json-btn')?.addEventListener('click', () => {
  const wrap = document.getElementById('json-paste-wrap');
  wrap.style.display = wrap.style.display === 'none' ? 'flex' : 'none';
});
document.getElementById('export-state-btn')?.addEventListener('click', () => toggleStateBox('export'));
document.getElementById('import-state-btn')?.addEventListener('click', () => toggleStateBox('import'));
document.getElementById('state-box-copy')?.addEventListener('click', () => copyStateBox());
document.getElementById('state-box-load')?.addEventListener('click', () => loadStateBox());
document.getElementById('paste-load-btn')?.addEventListener('click', () => loadFromPaste());
document.getElementById('supplements-apply-btn')?.addEventListener('click', () => applySupplements());
document.getElementById('dt-lvl-toggle')?.addEventListener('click', () => _dtToggleLevelUpsOnly());
{
  const infoIcon = document.getElementById('dt-info-icon');
  if (infoIcon) {
    infoIcon.addEventListener('mouseenter', (e) => _dtShowInfoTip(e));
    infoIcon.addEventListener('mouseleave', () => _dtHideInfoTip());
    infoIcon.addEventListener('mousemove', (e) => _dtMoveInfoTip(e));
  }
}
document.getElementById('dt-reset')?.addEventListener('click', () => {
  if (_dtNodes.length > 0 && !confirm('Reset the entire decision tree?')) return;
  _dtReset();
  _dtStart();
});
document.getElementById('dt-zoom-out')?.addEventListener('click', () => _dtTreeZoomOut());
document.getElementById('dt-zoom-in')?.addEventListener('click', () => _dtTreeZoomIn());
document.getElementById('dt-zoom-reset')?.addEventListener('click', () => _dtTreeZoomReset());
document.getElementById('dt-auto-insight')?.addEventListener('click', () => _dtToggleAutoInsight());
