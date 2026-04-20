// Minehead tab - Dashboard, Optimize, Rank, Path, and Play subtabs.
import { saveData } from '../state.js';
import { hideTooltip, moveTooltip } from './tooltip.js';
import { MINEHEAD_UPG, MINEHEAD_NAMES } from '../stats/data/w7/minehead.js';
import {
  upgradeQTY, upgCost, upgLvReq, gridDims, totalTiles,
  maxHPYou, floorHP, minesOnFloor, canBuyUpg,
} from '../stats/systems/w7/minehead.js';
import { expandGrid, OPTIMIZE_GRID, evaluateTunableParams, DEFAULT_PARAMS } from '../minehead/sim.js';
import { mhState, mineReduction, getInferredParams, loadInferred, _fmt } from './minehead-helpers.js';
import { renderDashboard, renderCurrencyTab } from './minehead-dashboard.js';
import { renderPlayfield } from './minehead-play.js';
import { rogBonusQTY } from '../stats/systems/w7/sushi.js';

let _activeSubtab = 'mh-dashboard';

let _rankCache = null;
let _rankWorkers = null;
let _rankTrials = 10_000;
let _optCache = null;      // { floor, bestParams, bestResult, topResults }
let _optWorkers = null;    // optimizer workers (for cancellation)
let _pathCache = null;     // { floor, path, baseline, finalResult, finalLvs }
let _pathWorkers = null;   // path workers (for cancellation)
let _pathStartCtx = null;  // { upgLevels, svarHP } for comparison banner

loadInferred();

// ===== public entry =====

export function renderMineheadTab() {
  const root = document.getElementById('tab-minehead');
  if (!root) return;

  // Subtab bar
  root.innerHTML = `
    <div class="opt-subtabs" id="mh-subtabs">
      <div class="opt-subtab ${_activeSubtab === 'mh-dashboard' ? 'active' : ''}" data-mhtab="mh-dashboard">Dashboard</div>
      <div class="opt-subtab ${_activeSubtab === 'mh-optimize' ? 'active' : ''}" data-mhtab="mh-optimize">Optimize</div>
      <div class="opt-subtab ${_activeSubtab === 'mh-rank' ? 'active' : ''}" data-mhtab="mh-rank">Rank Upgrades</div>
      <div class="opt-subtab ${_activeSubtab === 'mh-path' ? 'active' : ''}" data-mhtab="mh-path">Upgrade Path</div>
      <div class="opt-subtab ${_activeSubtab === 'mh-currency' ? 'active' : ''}" data-mhtab="mh-currency">Currency</div>
      <div class="opt-subtab ${_activeSubtab === 'mh-play' ? 'active' : ''}" data-mhtab="mh-play">Play</div>
    </div>
    <div id="mh-dashboard" class="optab-content ${_activeSubtab === 'mh-dashboard' ? 'active' : ''}"></div>
    <div id="mh-optimize" class="optab-content ${_activeSubtab === 'mh-optimize' ? 'active' : ''}"></div>
    <div id="mh-rank" class="optab-content ${_activeSubtab === 'mh-rank' ? 'active' : ''}"></div>
    <div id="mh-path" class="optab-content ${_activeSubtab === 'mh-path' ? 'active' : ''}"></div>
    <div id="mh-currency" class="optab-content ${_activeSubtab === 'mh-currency' ? 'active' : ''}"></div>
    <div id="mh-play" class="optab-content ${_activeSubtab === 'mh-play' ? 'active' : ''}"></div>
  `;

  // Wire subtab switching
  root.querySelectorAll('.opt-subtab').forEach(tab => {
    tab.addEventListener('click', () => {
      _activeSubtab = tab.dataset.mhtab;
      root.querySelectorAll('.opt-subtab').forEach(t => t.classList.remove('active'));
      root.querySelectorAll('.optab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(tab.dataset.mhtab).classList.add('active');
      _renderActiveSubtab();
    });
  });

  _renderActiveSubtab();
}

function _renderActiveSubtab() {
  if (_activeSubtab === 'mh-dashboard') renderDashboard();
  else if (_activeSubtab === 'mh-optimize') _renderOptimize();
  else if (_activeSubtab === 'mh-rank') _renderRankTab();
  else if (_activeSubtab === 'mh-path') _renderPathTab();
  else if (_activeSubtab === 'mh-currency') renderCurrencyTab();
  else if (_activeSubtab === 'mh-play') renderPlayfield();
}

// ===== OPTIMIZE STRATEGY SUBTAB =====

function _renderOptimize() {
  const container = document.getElementById('mh-optimize');
  if (!container) return;

  const lvs = saveData.mineheadUpgLevels || [];
  const floor = saveData.stateR7?.[4] || 0;
  const svarHP = saveData.serverVarMineHP || 1;
  const hp = floorHP(floor, svarHP);
  const mines = minesOnFloor(floor, mineReduction());

  container.innerHTML = `
    <div style="margin-bottom:16px;">
      <h3 style="color:var(--purple);margin-bottom:8px;">Optimize Strategy - ${(MINEHEAD_NAMES[floor] || 'Boss ' + floor).replace(/_/g, ' ')}</h3>
      <p style="color:var(--text2);font-size:.9em;margin-bottom:12px;">
        Grid-searches EV-optimal strategy parameters for your current floor and upgrades.
      </p>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;margin-bottom:16px;">
        <div class="opt-card"><div style="color:var(--text2);font-size:.8em;">Boss HP</div><div style="font-size:1.3em;font-weight:700;color:var(--accent);">${Math.round(hp).toLocaleString()}</div></div>
        <div class="opt-card"><div style="color:var(--text2);font-size:.8em;">Mines</div><div style="font-size:1.3em;font-weight:700;">${mines}</div></div>
      </div>
      <div id="mh-opt-sliders" style="margin-bottom:16px;"></div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:16px;">
        <button class="btn" id="mh-opt-btn" style="background:linear-gradient(135deg,#6b1a6b,#4d0d4d);">Optimize Strategy</button>
        <button class="btn" id="mh-opt-cancel" style="background:var(--bg3);display:none;">Cancel</button>
        <span id="mh-opt-status" style="color:var(--text2);font-size:.85em;">Not yet run</span>
        <span id="mh-opt-combos" style="color:var(--text2);font-size:.82em;margin-left:auto;"></span>
      </div>
      <div id="mh-opt-progress" style="display:none;margin-bottom:12px;">
        <div style="background:#222;border-radius:4px;height:10px;width:100%;overflow:hidden;">
          <div id="mh-opt-bar" style="width:0%;height:100%;background:var(--purple);border-radius:4px;transition:width .2s;"></div>
        </div>
        <div id="mh-opt-pct" style="text-align:center;font-size:.8em;color:var(--text2);margin-top:2px;"></div>
      </div>
    </div>
    <div id="mh-opt-results"></div>
  `;

  _buildKnobSliders();

  document.getElementById('mh-opt-btn').addEventListener('click', () => {
    _runOptimize(lvs, floor, svarHP);
  });
  document.getElementById('mh-opt-cancel').addEventListener('click', _cancelOptimize);

  if (_optCache && _optCache.floor === floor) _showOptResults(_optCache);
  _showInferredCard(floor, lvs, svarHP);
}

// Show standalone "Your Strategy" card on the Optimize tab (works with or without optimizer results)
function _showInferredCard(floor, upgLevels, svarHP) {
  const resultsEl = document.getElementById('mh-opt-results');
  if (!resultsEl) return;
  const infP = getInferredParams();
  if (!infP) return;

  const infR = evaluateTunableParams({
    params: infP, floor, upgLevels, nTrials: 2000,
    seed: 42 + floor, svarHP, mineReduction: mineReduction(),
  });
  const profile = mhState.inferResult?.profile || '';
  const agreement = mhState.inferResult?.agreement ? (mhState.inferResult.agreement * 100).toFixed(1) + '% match' : '';

  let html = `<div style="margin-top:16px;padding:12px 16px;background:var(--bg2);border:1px solid var(--cyan);border-radius:8px;">`;
  html += `<h4 style="color:var(--cyan);margin:0 0 8px;">Your Strategy</h4>`;
  if (profile) html += `<div style="font-size:.85em;color:var(--purple);font-weight:600;margin-bottom:4px;">${profile}</div>`;
  if (agreement) html += `<div style="font-size:.78em;color:var(--text2);margin-bottom:8px;">${agreement} Â· ${mhState.inferResult?.totalDecisions || 0} decisions</div>`;

  // Stats row
  html += `<div style="display:flex;gap:16px;flex-wrap:wrap;font-size:.9em;margin-bottom:8px;">`;
  html += `<div>Win: <b style="color:${infR.winRate > 0.8 ? 'var(--green)' : infR.winRate > 0.4 ? 'var(--gold)' : 'var(--accent)'};">${(infR.winRate * 100).toFixed(1)}%</b></div>`;
  html += `<div>Avg Dmg: <b>${_fmt(infR.avgDmg)}</b></div>`;
  html += `<div>T1 Dmg: <b>${_fmt(infR.avgFirstTurnDmg)}</b></div>`;
  html += `<div>Turns: <b>${infR.avgTurns.toFixed(1)}</b></div>`;
  html += `<div>Dmg/Cmt: <b>${_fmt(infR.avgDmgPerCommit)}</b></div>`;
  html += `</div>`;

  // Comparison vs optimizer #1 (if available)
  if (_optCache && _optCache.floor === floor && _optCache.bestResult) {
    const br = _optCache.bestResult;
    const dmgDelta = br.avgDmg > 0 ? ((infR.avgDmg - br.avgDmg) / br.avgDmg * 100) : 0;
    const winDelta = (infR.winRate - br.winRate) * 100;
    const dColor = dmgDelta >= 0 ? 'var(--green)' : 'var(--accent)';
    const wColor = winDelta >= 0 ? 'var(--green)' : 'var(--accent)';
    html += `<div style="font-size:.85em;padding-top:6px;border-top:1px solid var(--bg3);">`;
    html += `<b>vs Optimized #1:</b> `;
    html += `Win <b style="color:${wColor};">${winDelta >= 0 ? '+' : ''}${winDelta.toFixed(1)}%</b> &nbsp; `;
    html += `Avg Dmg <b style="color:${dColor};">${dmgDelta >= 0 ? '+' : ''}${dmgDelta.toFixed(1)}%</b> `;
    html += `(${_fmt(infR.avgDmg)} vs ${_fmt(br.avgDmg)})`;
    html += `</div>`;
  }

  // Key params
  html += `<details style="margin-top:8px;font-size:.82em;">`;
  html += `<summary style="cursor:pointer;color:var(--cyan);">Your Knobs</summary>`;
  html += `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px;">`;
  html += _paramBadge('EV Mul', infP.evMultiplier, infP.evMultiplier < 1 ? 'Aggressive' : infP.evMultiplier > 1 ? 'Conservative' : 'Neutral', '');
  html += _paramBadge('Min Rev', infP.minReveal, infP.minReveal === 0 ? 'No min' : `â‰¥${infP.minReveal}`, '');
  html += _paramBadge('Mine Cap', (infP.mineCapPct * 100).toFixed(0) + '%', infP.mineCapPct < 1 ? 'Safety net' : 'No cap', '');
  html += _paramBadge('Goldens', infP.goldenMinePct < 1 ? (infP.goldenMinePct * 100).toFixed(0) + '%' : 'Last', '', '');
  html += _paramBadge('Blocks', infP.blockAggro ? 'Aggro' : 'Safe', '', '');
  html += _paramBadge('Life Agg', infP.lifeAggro ?? 1, '', '');
  html += `</div></details>`;

  html += `</div>`;

  // Append (or replace existing) inferred card
  let existing = resultsEl.querySelector('[data-inferred-card]');
  if (existing) { existing.outerHTML = `<div data-inferred-card>${html}</div>`; }
  else { resultsEl.insertAdjacentHTML('beforeend', `<div data-inferred-card>${html}</div>`); }
}

// ===== RANK UPGRADES SUBTAB =====

function _renderRankTab() {
  const container = document.getElementById('mh-rank');
  if (!container) return;

  const lvs = saveData.mineheadUpgLevels || [];
  const floor = saveData.stateR7?.[4] || 0;
  const svarHP = saveData.serverVarMineHP || 1;

  container.innerHTML = `
    <div style="margin-bottom:16px;">
      <h3 style="color:var(--green);margin-bottom:8px;">Rank Upgrades - ${(MINEHEAD_NAMES[floor] || 'Boss ' + floor).replace(/_/g, ' ')}</h3>
      <p style="color:var(--text2);font-size:.9em;margin-bottom:12px;">
        Simulates each unlocked upgrade +1 level to rank by damage improvement. Shows which are affordable.
      </p>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:16px;">
        <button class="btn" id="mh-rank-btn" style="background:linear-gradient(135deg,#1a6b3c,#0d4d2b);">Rank Upgrades (+1 each)</button>
        <select id="mh-rank-strat" style="background:var(--bg3);color:var(--text);border:1px solid var(--bg3);border-radius:4px;padding:4px 8px;font-size:.85em;">
          <option value="optimized">Optimized Strategy</option>
          <option value="yours" ${!getInferredParams() ? 'disabled title="Play 3+ games in Play tab first"' : ''}>Your Strategy</option>
        </select>
        <button class="btn" id="mh-rank-cancel" style="background:var(--bg3);display:none;">Cancel</button>
        <span id="mh-rank-status" style="color:var(--text2);font-size:.85em;"></span>
      </div>
      <div id="mh-rank-progress" style="display:none;margin-bottom:12px;">
        <div style="background:#222;border-radius:4px;height:10px;width:100%;overflow:hidden;">
          <div id="mh-rank-bar" style="width:0%;height:100%;background:var(--green);border-radius:4px;transition:width .2s;"></div>
        </div>
        <div id="mh-rank-pct" style="text-align:center;font-size:.8em;color:var(--text2);margin-top:2px;"></div>
      </div>
    </div>
    <div id="mh-rank-results"></div>
  `;

  document.getElementById('mh-rank-btn').addEventListener('click', () => {
    _runUpgradeRank(lvs, floor, svarHP);
  });
  document.getElementById('mh-rank-cancel').addEventListener('click', _cancelRank);

  if (_rankCache && _rankCache.floor === floor) _showRankResults(_rankCache);
}

// ===== UPGRADE PATH SUBTAB =====

function _renderPathTab() {
  const container = document.getElementById('mh-path');
  if (!container) return;

  const lvs = saveData.mineheadUpgLevels || [];
  const floor = saveData.stateR7?.[4] || 0;
  const svarHP = saveData.serverVarMineHP || 1;

  container.innerHTML = `
    <div style="margin-bottom:16px;">
      <h3 style="color:var(--blue);margin-bottom:8px;">Affordable Upgrade Path - ${(MINEHEAD_NAMES[floor] || 'Boss ' + floor).replace(/_/g, ' ')}</h3>
      <p style="color:var(--text2);font-size:.9em;margin-bottom:12px;">
        Spends your currency optimally: each step picks the most cost-effective affordable upgrade until you run out.
      </p>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:16px;">
        <button class="btn" id="mh-path-btn" style="background:linear-gradient(135deg,#1a3c6b,#0d2b4d);">Find Upgrade Path</button>
        <select id="mh-path-strat" style="background:var(--bg3);color:var(--text);border:1px solid var(--bg3);border-radius:4px;padding:4px 8px;font-size:.85em;">
          <option value="optimized">Optimized Strategy</option>
          <option value="yours" ${!getInferredParams() ? 'disabled title="Play 3+ games in Play tab first"' : ''}>Your Strategy</option>
        </select>
        <button class="btn" id="mh-path-cancel" style="background:var(--bg3);display:none;">Cancel</button>
        <span id="mh-path-status" style="color:var(--text2);font-size:.85em;"></span>
      </div>
      <div id="mh-path-progress" style="display:none;margin-bottom:12px;">
        <div style="background:#222;border-radius:4px;height:10px;width:100%;overflow:hidden;">
          <div id="mh-path-bar" style="width:0%;height:100%;background:var(--blue);border-radius:4px;transition:width .2s;"></div>
        </div>
        <div id="mh-path-pct" style="text-align:center;font-size:.8em;color:var(--text2);margin-top:2px;"></div>
      </div>
    </div>
    <div id="mh-path-results"></div>
  `;

  document.getElementById('mh-path-btn').addEventListener('click', () => {
    _runUpgradePath(lvs, floor, svarHP);
  });
  document.getElementById('mh-path-cancel').addEventListener('click', _cancelPath);

  if (_pathCache && _pathCache.floor === floor) _showPathResults(_pathCache);
}

// --- Run Sim (uses optimized params if available, else defaults) ---

function _getParams(floor) {
  return (_optCache && _optCache.floor === floor) ? _optCache.bestParams : DEFAULT_PARAMS;
}

// ===== STRATEGY OPTIMIZER =====

function _cancelOptimize() {
  if (_optWorkers) {
    for (const w of _optWorkers) w.terminate();
    _optWorkers = null;
  }
  const btnEl = document.getElementById('mh-opt-btn');
  const statusEl = document.getElementById('mh-opt-status');
  const progressEl = document.getElementById('mh-opt-progress');
  const cancelEl = document.getElementById('mh-opt-cancel');
  if (btnEl) btnEl.disabled = false;
  if (statusEl) { statusEl.textContent = 'Cancelled'; statusEl.style.color = 'var(--accent)'; }
  if (progressEl) progressEl.style.display = 'none';
  if (cancelEl) cancelEl.style.display = 'none';
}

// ===== KNOB SLIDER CONFIG =====

const _KNOB_DEFS = [
  { key: 'evMultiplier',  label: 'EV Multiplier',  tip: 'How much better a reveal must be vs attacking now. >1 = conservative, <1 = aggressive.',
    min: 0.4, max: 3.0, step: 0.1, fmt: v => v.toFixed(1), defaults: [0.8, 2.0] },
  { key: 'minReveal',     label: 'Min Reveals',     tip: 'Minimum safe tiles to reveal before the strategy is allowed to attack.',
    min: 0, max: 8, step: 1, fmt: v => v, defaults: [0, 3] },
  { key: 'mineCapPct',    label: 'Mine Cap %',      tip: 'Stop revealing when remaining tiles are this % mines.',
    min: 0.1, max: 1.0, step: 0.1, fmt: v => (v * 100).toFixed(0) + '%', defaults: [0.5, 1.0] },
  { key: 'goldenMinePct', label: 'Golden Trigger',   tip: 'Mine% threshold for preferring golden tiles over risky reveals. 1.0 = save for end.',
    min: 0, max: 1.0, step: 0.1, fmt: v => v < 1 ? (v * 100).toFixed(0) + '%' : 'Last', defaults: [0.3, 1.0] },
  { key: 'hpThreshold',   label: 'HP Threshold',    tip: 'Attack when damage reaches this fraction of remaining boss HP. 0 = disabled.',
    min: 0, max: 1.0, step: 0.1, fmt: v => v > 0 ? (v * 100).toFixed(0) + '%' : 'Off', defaults: [0.8, 1.0] },
  { key: 'blockAggro',    label: 'Block Aggro',     tip: 'Factor blocks into EV? ON = mine hit costs block not life. OFF = ignore blocks.',
    min: 0, max: 1, step: 1, fmt: v => v ? 'On' : 'Off', defaults: [0, 1] },
  { key: 'commitMin',     label: 'Commit Min %',    tip: "Don't attack unless damage is this % of remaining HP.",
    min: 0, max: 0.1, step: 0.01, fmt: v => v > 0 ? (v * 100).toFixed(0) + '%' : 'Off', defaults: [0, 0.02] },
  { key: 'lifeAggro',     label: 'Life Aggro',      tip: 'EV multiplier when spare lives remain. <1 = riskier with extra lives.',
    min: 0.2, max: 1.0, step: 0.1, fmt: v => v.toFixed(1), defaults: [0.6, 1.0] },
  { key: 'turn1EvMul',    label: 'Turn 1 EV',       tip: 'Separate EV multiplier for turn 1 (no invested damage). 0 = use main EV.',
    min: 0, max: 2.0, step: 0.1, fmt: v => v > 0 ? v.toFixed(1) : 'Off', defaults: [0, 0.7] },
  { key: 'crownChase',    label: 'Crown Chase',     tip: 'Reduce EV threshold when 2/3 blue crowns matched. Encourages chasing the 3-match.',
    min: 0, max: 0.8, step: 0.1, fmt: v => v > 0 ? (v * 100).toFixed(0) + '%' : 'Off', defaults: [0, 0.4] },
  { key: 'instaMode',     label: 'Insta Mode',      tip: 'Mine% threshold for using insta-reveals. 0 = always use.',
    min: 0, max: 0.6, step: 0.1, fmt: v => v > 0 ? (v * 100).toFixed(0) + '%' : 'Always', defaults: [0, 0.3] },
  // --- Human-Behavior Knobs ---
  { key: 'commitTurns',   label: 'Commit Turns',    tip: 'Force attack after N turns. 0 = no limit.',
    min: 0, max: 10, step: 1, fmt: v => v > 0 ? v : 'Off', defaults: [0, 0] },
  { key: 'postMinePanic', label: 'Post-Mine Panic', tip: 'Inflate EV threshold on the turn after a mine hit. Higher = more cautious after getting hit.',
    min: 0, max: 0.8, step: 0.1, fmt: v => v > 0 ? (v * 100).toFixed(0) + '%' : 'Off', defaults: [0, 0] },
  { key: 'lastTurnAggro', label: 'Last Turn Aggro', tip: 'Halve EV when boss is nearly dead (remainingHP/bossHP < val). Encourages finishing.',
    min: 0, max: 0.5, step: 0.1, fmt: v => v > 0 ? (v * 100).toFixed(0) + '%' : 'Off', defaults: [0, 0] },
  { key: 'targetReveals', label: 'Target Reveals',  tip: 'Soft cap on reveals per turn. Attack after this many safe reveals.',
    min: 0, max: 10, step: 1, fmt: v => v > 0 ? v : 'Off', defaults: [0, 0] },
  { key: 'goldenFirst',   label: 'Golden First',    tip: 'Always prefer golden tiles over risky reveals. ON = click goldens first.',
    min: 0, max: 1, step: 1, fmt: v => v ? 'On' : 'Off', defaults: [0, 0] },
  { key: 'crownOrDie',    label: 'Crown Or Die',    tip: 'Max mine% for reveals when 2/3 crowns matched. Keep revealing to chase the 3-match.',
    min: 0, max: 0.6, step: 0.1, fmt: v => v > 0 ? (v * 100).toFixed(0) + '%' : 'Off', defaults: [0, 0] },
  { key: 'hotStreak',     label: 'Hot Streak',      tip: 'Reduce EV threshold after 3+ safe reveals this turn. Momentum-based risk.',
    min: 0, max: 0.5, step: 0.1, fmt: v => v > 0 ? (v * 100).toFixed(0) + '%' : 'Off', defaults: [0, 0] },
  { key: 'blockHoard',    label: 'Block Hoard',     tip: 'Inflate EV threshold when blocks â‰¤ 1. More cautious when armor is low.',
    min: 0, max: 0.6, step: 0.1, fmt: v => v > 0 ? (v * 100).toFixed(0) + '%' : 'Off', defaults: [0, 0] },
  // --- Spatial Knobs ---
  { key: 'cornerBias',    label: 'Corner Bias',     tip: 'Weight multiplier for corner tiles. >1 = prefer clicking corners. 1 = random.',
    min: 0.5, max: 3.0, step: 0.5, fmt: v => v.toFixed(1) + 'Ã—', defaults: [1, 1] },
  { key: 'edgeBias',      label: 'Edge Bias',       tip: 'Weight multiplier for edge tiles. >1 = prefer clicking edges. 1 = random.',
    min: 0.5, max: 3.0, step: 0.5, fmt: v => v.toFixed(1) + 'Ã—', defaults: [1, 1] },
  { key: 'clusterBias',   label: 'Cluster Bias',    tip: 'Weight multiplier for tiles adjacent to known safe tiles. >1 = cluster near safe. 1 = random.',
    min: 0.5, max: 4.0, step: 0.5, fmt: v => v.toFixed(1) + 'Ã—', defaults: [1, 1] },
];

function _buildKnobSliders() {
  const root = document.getElementById('mh-opt-sliders');
  if (!root) return;

  // Inject dual-range CSS once
  if (!document.getElementById('mh-dualrange-css')) {
    const style = document.createElement('style');
    style.id = 'mh-dualrange-css';
    style.textContent = `
      .dr-wrap { position:relative; height:20px; flex:1; min-width:100px; }
      .dr-track { position:absolute; top:8px; left:0; right:0; height:4px; background:var(--bg3); border-radius:2px; pointer-events:none; }
      .dr-fill { position:absolute; top:8px; height:4px; background:var(--purple); border-radius:2px; pointer-events:none; }
      .dr-wrap input[type=range] { position:absolute; top:0; left:0; width:100%; height:20px; margin:0; padding:0;
        -webkit-appearance:none; appearance:none; background:transparent; pointer-events:none; }
      .dr-wrap input[type=range]::-webkit-slider-thumb { -webkit-appearance:none; height:14px; width:14px;
        border-radius:50%; background:var(--purple); border:2px solid var(--bg1); cursor:pointer; pointer-events:all; position:relative; z-index:2; margin-top:-5px; }
      .dr-wrap input[type=range]::-moz-range-thumb { height:14px; width:14px;
        border-radius:50%; background:var(--purple); border:2px solid var(--bg1); cursor:pointer; pointer-events:all; }
      .dr-wrap input[type=range]::-webkit-slider-runnable-track { height:4px; background:transparent; }
      .dr-wrap input[type=range]::-moz-range-track { height:4px; background:transparent; }
    `;
    document.head.appendChild(style);
  }

  let html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">';
  html += '<div style="color:var(--purple);font-weight:600;font-size:.9em;">Search Ranges</div>';
  html += '<button id="mh-opt-reset" style="background:none;border:1px solid var(--bg3);color:var(--text2);border-radius:4px;padding:2px 8px;font-size:.75em;cursor:pointer;">Reset</button>';
  html += '</div>';
  html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:6px 16px;">';

  for (const k of _KNOB_DEFS) {
    const [dMin, dMax] = k.defaults;
    html += `<div class="knob-row" style="display:flex;align-items:center;gap:6px;font-size:.82em;" data-tip="${k.tip.replace(/"/g, '&quot;')}">`;
    html += `<span style="color:var(--text2);min-width:90px;cursor:help;">${k.label}</span>`;
    html += `<span id="mh-k-${k.key}-lo-v" style="min-width:32px;text-align:right;color:var(--cyan);font-weight:600;font-size:.9em;">${k.fmt(dMin)}</span>`;
    html += `<div class="dr-wrap" id="mh-dr-${k.key}">`;
    html += `<div class="dr-track"></div>`;
    html += `<div class="dr-fill" id="mh-k-${k.key}-fill"></div>`;
    html += `<input type="range" id="mh-k-${k.key}-lo" min="${k.min}" max="${k.max}" step="${k.step}" value="${dMin}">`;
    html += `<input type="range" id="mh-k-${k.key}-hi" min="${k.min}" max="${k.max}" step="${k.step}" value="${dMax}">`;
    html += `</div>`;
    html += `<span id="mh-k-${k.key}-hi-v" style="min-width:32px;text-align:left;color:var(--cyan);font-weight:600;font-size:.9em;">${k.fmt(dMax)}</span>`;
    html += `</div>`;
  }
  html += '</div>';
  root.innerHTML = html;
  _wireOptTooltips(root);

  // Wire slider events + fill bar
  function updateFill(k) {
    const lo = document.getElementById(`mh-k-${k.key}-lo`);
    const hi = document.getElementById(`mh-k-${k.key}-hi`);
    const fill = document.getElementById(`mh-k-${k.key}-fill`);
    if (!lo || !hi || !fill) return;
    const range = k.max - k.min;
    const loFrac = (Number(lo.value) - k.min) / range * 100;
    const hiFrac = (Number(hi.value) - k.min) / range * 100;
    fill.style.left = loFrac + '%';
    fill.style.width = (hiFrac - loFrac) + '%';
  }

  for (const k of _KNOB_DEFS) {
    const lo = document.getElementById(`mh-k-${k.key}-lo`);
    const hi = document.getElementById(`mh-k-${k.key}-hi`);
    const loV = document.getElementById(`mh-k-${k.key}-lo-v`);
    const hiV = document.getElementById(`mh-k-${k.key}-hi-v`);
    updateFill(k);
    lo.addEventListener('input', () => {
      if (Number(lo.value) > Number(hi.value)) lo.value = hi.value;
      loV.textContent = k.fmt(Number(lo.value));
      updateFill(k);
      _updateComboCount();
    });
    hi.addEventListener('input', () => {
      if (Number(hi.value) < Number(lo.value)) hi.value = lo.value;
      hiV.textContent = k.fmt(Number(hi.value));
      updateFill(k);
      _updateComboCount();
    });
  }

  _updateComboCount();

  document.getElementById('mh-opt-reset').addEventListener('click', () => {
    for (const k of _KNOB_DEFS) {
      const lo = document.getElementById(`mh-k-${k.key}-lo`);
      const hi = document.getElementById(`mh-k-${k.key}-hi`);
      lo.value = k.defaults[0];
      hi.value = k.defaults[1];
      document.getElementById(`mh-k-${k.key}-lo-v`).textContent = k.fmt(k.defaults[0]);
      document.getElementById(`mh-k-${k.key}-hi-v`).textContent = k.fmt(k.defaults[1]);
      updateFill(k);
    }
    _updateComboCount();
  });
}

function _buildGridFromSliders() {
  const MAX_COMBOS = 50000;
  const precision = k => k.step < 0.1 ? 100 : k.step < 1 ? 10 : 1;

  // First pass: generate all step values per knob
  const allVals = {};
  for (const k of _KNOB_DEFS) {
    const lo = Number(document.getElementById(`mh-k-${k.key}-lo`)?.value ?? k.defaults[0]);
    const hi = Number(document.getElementById(`mh-k-${k.key}-hi`)?.value ?? k.defaults[1]);
    const p = precision(k);
    const vals = [];
    for (let v = lo; v <= hi + k.step * 0.01; v += k.step) {
      const r = Math.round(v * p) / p;
      if (r >= k.min && r <= k.max) vals.push(r);
    }
    if (vals.length === 0) vals.push(lo);
    allVals[k.key] = vals;
  }

  // Iteratively halve the largest dimension until product <= MAX_COMBOS
  function total() {
    let n = 1;
    for (const k of _KNOB_DEFS) n *= allVals[k.key].length;
    return n;
  }
  while (total() > MAX_COMBOS) {
    let maxKey = null, maxLen = 0;
    for (const k of _KNOB_DEFS) {
      if (allVals[k.key].length > maxLen) { maxLen = allVals[k.key].length; maxKey = k.key; }
    }
    if (maxLen <= 2) break;
    // Keep endpoints + evenly-spaced interior
    const old = allVals[maxKey];
    const newLen = Math.max(2, Math.ceil(old.length / 2));
    const sampled = [old[0]];
    for (let i = 1; i < newLen - 1; i++) {
      sampled.push(old[Math.round(i * (old.length - 1) / (newLen - 1))]);
    }
    sampled.push(old[old.length - 1]);
    allVals[maxKey] = [...new Set(sampled)].sort((a, b) => a - b);
  }

  // Convert to grid
  const grid = {};
  for (const k of _KNOB_DEFS) {
    grid[k.key] = (k.key === 'blockAggro' || k.key === 'goldenFirst')
      ? allVals[k.key].map(v => !!v)
      : allVals[k.key];
    if (grid[k.key].length === 0) grid[k.key] = [k.defaults[0]];
  }
  return grid;
}

function _updateComboCount() {
  const el = document.getElementById('mh-opt-combos');
  if (!el) return;
  // Fast: multiply step counts instead of expanding the full grid
  let count = 1;
  for (const k of _KNOB_DEFS) {
    const lo = Number(document.getElementById(`mh-k-${k.key}-lo`)?.value ?? k.defaults[0]);
    const hi = Number(document.getElementById(`mh-k-${k.key}-hi`)?.value ?? k.defaults[1]);
    const precision = k.step < 0.1 ? 100 : k.step < 1 ? 10 : 1;
    const steps = Math.max(1, Math.round((hi - lo) / k.step) + 1);
    count *= steps;
  }
  const color = count > 20000 ? 'var(--accent)' : count > 5000 ? 'var(--gold)' : 'var(--text2)';
  el.innerHTML = `<span style="color:${color};">${count.toLocaleString()} combos</span>`;
}

function _runOptimize(lvs, floor, svarHP) {
  const btnEl = document.getElementById('mh-opt-btn');
  const statusEl = document.getElementById('mh-opt-status');
  const progressEl = document.getElementById('mh-opt-progress');
  const barEl = document.getElementById('mh-opt-bar');
  const pctEl = document.getElementById('mh-opt-pct');
  const cancelEl = document.getElementById('mh-opt-cancel');

  btnEl.disabled = true;
  cancelEl.style.display = '';
  progressEl.style.display = '';
  barEl.style.width = '0%';
  statusEl.textContent = 'Optimizing...';
  statusEl.style.color = 'var(--gold)';

  const customGrid = _buildGridFromSliders();
  const combos = expandGrid(customGrid);
  const screenTrials = 200;
  const finalTrials = 2000;
  const topN = 20;
  const seed = 42 + floor;
  const hp = floorHP(floor, svarHP);

  const totalScreen = combos.length;
  const totalTotal = totalScreen + topN;
  let completed = 0;
  const screenResults = [];

  pctEl.textContent = `0 / ${totalTotal}`;

  const screenTasks = combos.map((params, i) => ({ id: `opt_${i}`, params }));
  const allTasks = [...screenTasks];
  let taskIdx = 0;
  let phase = 'screen';
  let finalTasks = [];

  const poolSize = Math.max(1, Math.min((navigator.hardwareConcurrency || 4) - 1, 8));
  const workers = [];
  _optWorkers = workers;

  function score(r) {
    return r ? r.winRate + (r.avgDmg / (hp || 1)) * 0.001 : -Infinity;
  }

  function onDone(worker, d) {
    if (!_optWorkers) return;
    completed++;
    if (phase === 'screen') {
      screenResults.push({ params: d.params, result: d.result, score: score(d.result) });
      if (completed === totalScreen) {
        phase = 'final';
        screenResults.sort((a, b) => b.score - a.score);
        finalTasks = screenResults.slice(0, topN).map((c, i) => ({ id: `opt_final_${i}`, params: c.params }));
        for (const t of finalTasks) allTasks.push(t);
        for (const w of workers) {
          if (taskIdx < allTasks.length) _dispatchOptTask(w, allTasks[taskIdx++], floor, lvs, finalTrials, seed, svarHP);
        }
      }
    } else {
      const idx = finalTasks.findIndex(t => t.id === d.id);
      if (idx >= 0 && screenResults[idx]) {
        screenResults[idx].result = d.result;
        screenResults[idx].score = score(d.result);
      }
      if (completed === totalScreen + topN) {
        _onOptComplete(screenResults.slice(0, topN), floor, lvs, svarHP);
        return;
      }
    }
    const pctVal = Math.round(completed / totalTotal * 100);
    if (barEl) barEl.style.width = pctVal + '%';
    if (pctEl) pctEl.textContent = `${completed} / ${totalTotal}`;
    if (taskIdx < allTasks.length) {
      _dispatchOptTask(worker, allTasks[taskIdx++], floor, lvs, phase === 'screen' ? screenTrials : finalTrials, seed, svarHP);
    }
  }

  for (let i = 0; i < poolSize && taskIdx < allTasks.length; i++) {
    const w = new Worker('./js/workers/minehead-worker.js', { type: 'module' });
    workers.push(w);
    w.onmessage = (ev) => {
      if (ev.data.type === 'done') onDone(w, ev.data);
      if (ev.data.type === 'error') onDone(w, { id: ev.data.id, result: null, params: {} });
    };
    w.onerror = (ev) => console.error('Worker error:', ev.message);
    _dispatchOptTask(w, allTasks[taskIdx++], floor, lvs, screenTrials, seed, svarHP);
  }
}

function _dispatchOptTask(worker, task, floor, upgLevels, nTrials, seed, svarHP) {
  worker.postMessage({ type: 'optimize', id: task.id, floor, upgLevels: [...upgLevels], params: task.params, nTrials, seed, svarHP });
}

function _onOptComplete(topResults, floor, upgLevels, svarHP) {
  if (_optWorkers) { for (const w of _optWorkers) w.terminate(); _optWorkers = null; }
  topResults.sort((a, b) => b.score - a.score);
  const best = topResults[0];
  _optCache = { floor, bestParams: best.params, bestResult: best.result, topResults, upgLevels, svarHP };
  const statusEl = document.getElementById('mh-opt-status');
  const progressEl = document.getElementById('mh-opt-progress');
  const cancelEl = document.getElementById('mh-opt-cancel');
  const btnEl = document.getElementById('mh-opt-btn');
  if (statusEl) { statusEl.textContent = 'Optimized!'; statusEl.style.color = 'var(--green)'; }
  if (progressEl) progressEl.style.display = 'none';
  if (cancelEl) cancelEl.style.display = 'none';
  if (btnEl) btnEl.disabled = false;
  _showOptResults(_optCache);
}

function _showOptResults(cache) {
  const el = document.getElementById('mh-opt-results');
  if (!el || !cache) return;
  const { bestParams: bp, bestResult: br, topResults } = cache;

  let html = `<h4 style="color:var(--purple);margin:20px 0 6px;">Optimized Strategy Parameters</h4>`;
  html += `<p style="color:var(--text2);font-size:.82em;margin-bottom:10px;">Grid search over ${expandGrid(OPTIMIZE_GRID).length} combos, refined top 20 with 2,000 trials.</p>`;
  html += `<div style="background:var(--bg2);border:1px solid var(--purple);border-radius:8px;padding:12px 16px;margin-bottom:12px;">`;
  html += `<div style="display:flex;gap:16px;flex-wrap:wrap;font-size:.9em;">`;
  html += _paramBadge('EV Multiplier', bp.evMultiplier,
    bp.evMultiplier < 1 ? 'More aggressive' : bp.evMultiplier > 1 ? 'More conservative' : 'Neutral',
    'How much better a reveal must be vs attacking now. >1 = picky (conservative), <1 = greedy (aggressive). Controls the risk/reward tradeoff on every tile click.');
  html += _paramBadge('Min Reveals', bp.minReveal,
    bp.minReveal === 0 ? 'No min' : `>= ${bp.minReveal} tiles`,
    'Minimum safe tiles to reveal before the strategy is allowed to attack. Higher = bigger combos but more mine risk.');
  html += _paramBadge('Mine Cap', (bp.mineCapPct * 100).toFixed(0) + '%',
    bp.mineCapPct < 1 ? `Stop at >= ${(bp.mineCapPct * 100).toFixed(0)}%` : 'No cap',
    'If the remaining tiles are this % mines or higher, stop revealing and attack. Safety net against bad odds.');
  html += _paramBadge('Goldens',
    bp.goldenMinePct < 1 ? (bp.goldenMinePct * 100).toFixed(0) + '%' : 'Last',
    bp.goldenMinePct < 1 ? `Use when mine% >= ${(bp.goldenMinePct * 100).toFixed(0)}%` : 'Save for end',
    'When to click golden tiles (safe, free reveals). "Last" = save for right before attacking. A % means use them when mine density gets scary.');
  html += _paramBadge('HP Threshold',
    bp.hpThreshold > 0 ? (bp.hpThreshold * 100).toFixed(0) + '%' : 'Off',
    bp.hpThreshold > 0 ? `Attack at ${(bp.hpThreshold * 100).toFixed(0)}% remaining` : 'Disabled',
    'Attack early when your current damage is this fraction of the boss HP remaining. 100% = attack only when you can kill. 80% = attack when close enough.');
  html += _paramBadge('Blocks', bp.blockAggro ? 'Aggressive' : 'Conservative',
    bp.blockAggro ? 'Factor into EV' : 'Ignore',
    'If you have blocks (absorb one mine hit), should the strategy count on them? Aggressive = a mine hit costs a block not a life, so keep revealing.');
  html += _paramBadge('Commit Min', (bp.commitMin * 100).toFixed(0) + '%',
    bp.commitMin > 0 ? `Need ${(bp.commitMin * 100).toFixed(0)}% HP to commit` : 'No minimum',
    'Don\'t bother attacking unless your damage is at least this % of remaining boss HP. Prevents wasting a turn on tiny chip damage.');
  html += _paramBadge('Life Aggro', bp.lifeAggro,
    bp.lifeAggro < 1 ? 'Riskier with spare lives' : 'No change',
    'Multiplier on the EV threshold when you have spare lives. <1 = take more risks when you can afford to lose a life.');
  html += _paramBadge('T1 EV Mul', bp.turn1EvMul || 'â€”',
    bp.turn1EvMul > 0 ? `Turn 1 EV = ${bp.turn1EvMul}` : 'Same as EV Mul',
    'Separate EV multiplier for turn 1 only (no damage invested yet). Lower = more aggressive on the opening turn since you have nothing to lose.');
  html += _paramBadge('Crown Chase', bp.crownChase || 'â€”',
    bp.crownChase > 0 ? `âˆ’${(bp.crownChase * 100).toFixed(0)}% EV at 2/3 crowns` : 'Off',
    'When you have 2 of 3 blue crowns matched, reduce the EV threshold by this %. Encourages revealing one more tile to chase the big crown multiplier.');
  html += _paramBadge('Insta Mode',
    bp.instaMode > 0 ? (bp.instaMode * 100).toFixed(0) + '%' : 'Always',
    bp.instaMode > 0 ? `Use when mine% >= ${(bp.instaMode * 100).toFixed(0)}%` : 'Use every turn',
    'When to use insta-reveals (safely reveal a mine). "Always" = use them immediately. A % = only use when mine density is high enough to be worth it.');
  html += `</div>`;
  html += `<div style="margin-top:8px;font-size:.9em;">Win: <b style="color:${br.winRate > 0.8 ? 'var(--green)' : br.winRate > 0.4 ? 'var(--gold)' : 'var(--accent)'}">${(br.winRate * 100).toFixed(1)}%</b> &nbsp; Avg Dmg: <b>${_fmt(br.avgDmg)}</b> &nbsp; T1 Dmg: <b>${_fmt(br.avgFirstTurnDmg)}</b> &nbsp; Turns: <b>${br.avgTurns.toFixed(1)}</b> &nbsp; Dmg/Commit: <b>${_fmt(br.avgDmgPerCommit)}</b></div>`;
  html += `</div>`;

  // Top results table
  html += `<div style="margin-top:10px;overflow-x:auto;">`;
  html += `<table style="width:100%;border-collapse:collapse;font-size:.8em;text-align:center;">`;
  html += `<thead><tr style="border-bottom:2px solid var(--purple);color:var(--text2);">`;
  html += `<th style="padding:4px 6px;">#</th>`;
  html += `<th style="padding:4px 6px;">Win%</th>`;
  html += `<th style="padding:4px 6px;">Avg Dmg</th>`;
  html += `<th style="padding:4px 6px;">T1 Dmg</th>`;
  html += `<th style="padding:4px 6px;">Turns</th>`;
  html += `<th style="padding:4px 6px;">Dmg/Cmt</th>`;
  html += `<th style="padding:4px 6px;color:var(--purple);cursor:help;" data-tip="EV Multiplier â€” how picky the strategy is about revealing vs attacking. >1 = conservative, <1 = aggressive.">EV Mul</th>`;
  html += `<th style="padding:4px 6px;color:var(--purple);cursor:help;" data-tip="Minimum Reveals â€” must reveal at least this many safe tiles before attacking.">Min Rev</th>`;
  html += `<th style="padding:4px 6px;color:var(--purple);cursor:help;" data-tip="Mine Cap â€” stop revealing if remaining tiles are this % mines.">Cap</th>`;
  html += `<th style="padding:4px 6px;color:var(--purple);cursor:help;" data-tip="Goldens â€” when to use golden tiles. 'Last' = save for end. A % = use when mine density reaches that level.">Goldens</th>`;
  html += `<th style="padding:4px 6px;color:var(--purple);cursor:help;" data-tip="HP Threshold â€” attack when damage reaches this % of remaining boss HP.">HP Thr</th>`;
  html += `<th style="padding:4px 6px;color:var(--purple);cursor:help;" data-tip="Block Aggro â€” 'Aggro' = factor blocks into EV (mine hit loses block, not life). 'Safe' = ignore blocks.">Blocks</th>`;
  html += `<th style="padding:4px 6px;color:var(--purple);cursor:help;" data-tip="Commit Min â€” minimum damage as % of remaining HP before bothering to attack.">Cmt Min</th>`;
  html += `<th style="padding:4px 6px;color:var(--purple);cursor:help;" data-tip="Life Aggro â€” EV multiplier when you have spare lives. &lt;1 = take more risks with extra lives.">Life Agg</th>`;
  html += `<th style="padding:4px 6px;color:var(--purple);cursor:help;" data-tip="Turn 1 EV â€” separate EV multiplier for the first turn (no invested damage yet).">T1 EV</th>`;
  html += `<th style="padding:4px 6px;color:var(--purple);cursor:help;" data-tip="Crown Chase â€” reduce EV threshold by this factor when 2/3 blue crowns are matched.">Crown</th>`;
  html += `<th style="padding:4px 6px;color:var(--purple);cursor:help;" data-tip="Insta Mode â€” mine% threshold for using insta-reveals. 'â€”' = always use.">Insta</th>`;
  html += `</tr></thead><tbody>`;
  for (let i = 0; i < topResults.length; i++) {
    const { params: p, result: r } = topResults[i];
    const bg = i === 0 ? 'background:rgba(233,69,96,.12);' : i % 2 === 0 ? 'background:var(--bg2);' : '';
    const bold = i === 0 ? 'font-weight:700;' : '';
    html += `<tr style="${bg}${bold}border-bottom:1px solid var(--bg3);">`;
    html += `<td style="padding:4px 6px;color:var(--purple);font-weight:700;">${i + 1}</td>`;
    html += `<td style="padding:4px 6px;color:${r.winRate > 0.8 ? 'var(--green)' : r.winRate > 0.4 ? 'var(--gold)' : 'var(--accent)'};">${(r.winRate * 100).toFixed(1)}%</td>`;
    html += `<td style="padding:4px 6px;">${_fmt(r.avgDmg)}</td>`;
    html += `<td style="padding:4px 6px;">${_fmt(r.avgFirstTurnDmg)}</td>`;
    html += `<td style="padding:4px 6px;">${r.avgTurns.toFixed(1)}</td>`;
    html += `<td style="padding:4px 6px;">${_fmt(r.avgDmgPerCommit)}</td>`;
    html += `<td style="padding:4px 6px;">${p.evMultiplier}</td>`;
    html += `<td style="padding:4px 6px;">${p.minReveal}</td>`;
    html += `<td style="padding:4px 6px;">${(p.mineCapPct * 100).toFixed(0)}%</td>`;
    html += `<td style="padding:4px 6px;">${p.goldenMinePct < 1 ? (p.goldenMinePct * 100).toFixed(0) + '%' : 'Last'}</td>`;
    html += `<td style="padding:4px 6px;">${p.hpThreshold > 0 ? (p.hpThreshold * 100).toFixed(0) + '%' : 'â€”'}</td>`;
    html += `<td style="padding:4px 6px;">${p.blockAggro ? 'Aggro' : 'Safe'}</td>`;
    html += `<td style="padding:4px 6px;">${p.commitMin ? (p.commitMin * 100).toFixed(0) + '%' : 'â€”'}</td>`;
    html += `<td style="padding:4px 6px;">${p.lifeAggro ?? 1}</td>`;
    html += `<td style="padding:4px 6px;">${p.turn1EvMul || 'â€”'}</td>`;
    html += `<td style="padding:4px 6px;">${p.crownChase || 'â€”'}</td>`;
    html += `<td style="padding:4px 6px;">${p.instaMode > 0 ? (p.instaMode * 100).toFixed(0) + '%' : 'â€”'}</td>`;
    html += `</tr>`;
  }

  // "Your Strategy" comparison row
  const _infP = getInferredParams();
  let _infR = null;
  const _infLvs = cache.upgLevels || saveData.mineheadUpgLevels;
  const _infSvar = cache.svarHP || saveData.serverVarMineHP || 1;
  if (_infP && _infLvs) {
    _infR = evaluateTunableParams({
      params: _infP, floor: cache.floor,
      upgLevels: _infLvs, nTrials: 2000,
      seed: 42 + cache.floor, svarHP: _infSvar,
      mineReduction: mineReduction(),
    });
    const ip = _infP, ir = _infR;
    const profile = mhState.inferResult?.profile || '';
    html += `<tr style="background:rgba(100,180,255,.15);border-top:2px solid var(--cyan);font-weight:600;">`;
    html += `<td style="padding:4px 6px;color:var(--cyan);font-size:.85em;" data-tip="${profile || 'Your inferred strategy from the Play tab'}">You</td>`;
    html += `<td style="padding:4px 6px;color:${ir.winRate > 0.8 ? 'var(--green)' : ir.winRate > 0.4 ? 'var(--gold)' : 'var(--accent)'};">${(ir.winRate * 100).toFixed(1)}%</td>`;
    html += `<td style="padding:4px 6px;">${_fmt(ir.avgDmg)}</td>`;
    html += `<td style="padding:4px 6px;">${_fmt(ir.avgFirstTurnDmg)}</td>`;
    html += `<td style="padding:4px 6px;">${ir.avgTurns.toFixed(1)}</td>`;
    html += `<td style="padding:4px 6px;">${_fmt(ir.avgDmgPerCommit)}</td>`;
    html += `<td style="padding:4px 6px;">${ip.evMultiplier}</td>`;
    html += `<td style="padding:4px 6px;">${ip.minReveal}</td>`;
    html += `<td style="padding:4px 6px;">${(ip.mineCapPct * 100).toFixed(0)}%</td>`;
    html += `<td style="padding:4px 6px;">${ip.goldenMinePct < 1 ? (ip.goldenMinePct * 100).toFixed(0) + '%' : 'Last'}</td>`;
    html += `<td style="padding:4px 6px;">${ip.hpThreshold > 0 ? (ip.hpThreshold * 100).toFixed(0) + '%' : 'â€”'}</td>`;
    html += `<td style="padding:4px 6px;">${ip.blockAggro ? 'Aggro' : 'Safe'}</td>`;
    html += `<td style="padding:4px 6px;">${ip.commitMin ? (ip.commitMin * 100).toFixed(0) + '%' : 'â€”'}</td>`;
    html += `<td style="padding:4px 6px;">${ip.lifeAggro ?? 1}</td>`;
    html += `<td style="padding:4px 6px;">${ip.turn1EvMul || 'â€”'}</td>`;
    html += `<td style="padding:4px 6px;">${ip.crownChase || 'â€”'}</td>`;
    html += `<td style="padding:4px 6px;">${ip.instaMode > 0 ? (ip.instaMode * 100).toFixed(0) + '%' : 'â€”'}</td>`;
    html += `</tr>`;
  }

  html += `</tbody></table></div>`;

  // Comparison summary panel (if inferred strategy exists)
  if (_infR) {
    const dmgDelta = br.avgDmg > 0 ? ((_infR.avgDmg - br.avgDmg) / br.avgDmg * 100) : 0;
    const winDelta = (_infR.winRate - br.winRate) * 100;
    const dColor = dmgDelta >= 0 ? 'var(--green)' : 'var(--accent)';
    const wColor = winDelta >= 0 ? 'var(--green)' : 'var(--accent)';
    html += `<div style="margin-top:10px;padding:10px 14px;background:var(--bg2);border:1px solid var(--cyan);border-radius:8px;">`;
    html += `<b style="color:var(--cyan);">Your Strategy vs #1:</b> `;
    html += `Win <b style="color:${wColor};">${winDelta >= 0 ? '+' : ''}${winDelta.toFixed(1)}%</b> &nbsp; `;
    html += `Avg Dmg <b style="color:${dColor};">${dmgDelta >= 0 ? '+' : ''}${dmgDelta.toFixed(1)}%</b> `;
    html += `(${_fmt(_infR.avgDmg)} vs ${_fmt(br.avgDmg)})`;
    if (mhState.inferResult?.profile) html += ` &nbsp; <span style="color:var(--text2);font-size:.85em;">${mhState.inferResult.profile}</span>`;
    html += `</div>`;
  }

  el.innerHTML = html;
  _wireOptTooltips(el);
}

function _paramBadge(label, value, hint, tip) {
  const t = tip ? ` data-tip="${tip.replace(/"/g, '&quot;')}"` : '';
  return `<div style="background:var(--bg3);border-radius:4px;padding:4px 8px;cursor:help;"${t}><div style="color:var(--text2);font-size:.75em;">${label}</div><div style="font-weight:700;">${value}</div><div style="color:var(--text2);font-size:.7em;">${hint}</div></div>`;
}

function _wireOptTooltips(root) {
  const tt = document.getElementById('tooltip');
  if (!tt) return;
  root.addEventListener('mouseover', (e) => {
    const src = e.target.closest('[data-tip]');
    if (!src) return;
    tt.innerHTML = '<div class="tt-desc">' + src.getAttribute('data-tip') + '</div>';
    tt.style.display = 'block';
    moveTooltip(e);
  });
  root.addEventListener('mousemove', (e) => {
    if (e.target.closest('[data-tip]')) moveTooltip(e);
  });
  root.addEventListener('mouseout', (e) => {
    const src = e.target.closest('[data-tip]');
    if (src && !src.contains(e.relatedTarget)) hideTooltip();
  });
}

// ===== UPGRADE RANKING (uses optimized params) =====

function _cancelRank() {
  if (_rankWorkers) { for (const w of _rankWorkers) w.terminate(); _rankWorkers = null; }
  const statusEl = document.getElementById('mh-rank-status');
  const progressEl = document.getElementById('mh-rank-progress');
  const cancelEl = document.getElementById('mh-rank-cancel');
  const btnEl = document.getElementById('mh-rank-btn');
  if (statusEl) { statusEl.textContent = 'Cancelled'; statusEl.style.color = 'var(--accent)'; }
  if (progressEl) progressEl.style.display = 'none';
  if (cancelEl) cancelEl.style.display = 'none';
  if (btnEl) btnEl.disabled = false;
}

function _runUpgradeRank(lvs, floor, svarHP) {
  const statusEl = document.getElementById('mh-rank-status');
  const progressEl = document.getElementById('mh-rank-progress');
  const barEl = document.getElementById('mh-rank-bar');
  const pctEl = document.getElementById('mh-rank-pct');
  const cancelEl = document.getElementById('mh-rank-cancel');
  const btnEl = document.getElementById('mh-rank-btn');

  _cancelRank();
  btnEl.disabled = true;
  cancelEl.style.display = '';
  progressEl.style.display = '';
  barEl.style.width = '0%';

  const nTrials = _rankTrials;
  const seed = 42 + floor;
  const mineCurrency = saveData.stateR7?.[5] || 0;
  const qty26 = upgradeQTY(26, lvs[26] || 0);
  const stratEl = document.getElementById('mh-rank-strat');
  const params = (stratEl?.value === 'yours' && getInferredParams()) || _getParams(floor);

  const researchLv = saveData.researchLevel || 0;
  const affordable = [];
  for (let i = 0; i < MINEHEAD_UPG.length; i++) {
    const lv = lvs[i] || 0;
    const max = MINEHEAD_UPG[i].maxLv;
    if ((lv < max || max > 998) && researchLv >= upgLvReq(i)) {
      affordable.push(i);
    }
  }

  if (affordable.length === 0) {
    statusEl.textContent = 'No unlocked upgrades to compare';
    progressEl.style.display = 'none';
    cancelEl.style.display = 'none';
    btnEl.disabled = false;
    return;
  }

  // Task list: 1 baseline + N upgrades, all with the same optimized params
  const tasks = [{ id: 'base', upgIdx: -1, upgLevels: [...lvs] }];
  for (const idx of affordable) {
    const modLvs = [...lvs];
    modLvs[idx] = (modLvs[idx] || 0) + 1;
    tasks.push({ id: `upg${idx}`, upgIdx: idx, upgLevels: modLvs });
  }

  const totalTasks = tasks.length;
  let completed = 0;
  const results = {};

  statusEl.textContent = `0 / ${totalTasks}`;
  statusEl.style.color = 'var(--gold)';

  const poolSize = Math.max(1, Math.min((navigator.hardwareConcurrency || 4) - 1, 8));
  const workers = [];
  _rankWorkers = workers;
  let taskIdx = 0;

  function onDone(worker, d) {
    if (!_rankWorkers) return;
    results[d.id] = d.result;
    completed++;
    const pctVal = Math.round(completed / totalTasks * 100);
    if (barEl) barEl.style.width = pctVal + '%';
    if (pctEl) pctEl.textContent = `${completed} / ${totalTasks}`;
    if (statusEl) statusEl.textContent = `${completed} / ${totalTasks}`;
    if (taskIdx < tasks.length) {
      _dispatchRankTask(worker, tasks[taskIdx++], floor, params, nTrials, seed, svarHP);
    } else if (completed === totalTasks) {
      _onRankComplete(results, affordable, floor, nTrials, lvs);
    }
  }

  for (let i = 0; i < poolSize && taskIdx < tasks.length; i++) {
    const w = new Worker('./js/workers/minehead-worker.js', { type: 'module' });
    workers.push(w);
    w.onmessage = (ev) => {
      if (ev.data.type === 'done') onDone(w, ev.data);
      if (ev.data.type === 'error') onDone(w, { id: ev.data.id, result: null });
    };
    w.onerror = (ev) => console.error('Worker error:', ev.message);
    _dispatchRankTask(w, tasks[taskIdx++], floor, params, nTrials, seed, svarHP);
  }
}

function _dispatchRankTask(worker, task, floor, params, nTrials, seed, svarHP) {
  worker.postMessage({ type: 'mc', id: task.id, floor, upgLevels: task.upgLevels, params, nTrials, seed, svarHP, mineReduction: mineReduction() });
}

function _onRankComplete(results, affordable, floor, nTrials, lvs) {
  if (_rankWorkers) { for (const w of _rankWorkers) w.terminate(); _rankWorkers = null; }

  const qty26 = upgradeQTY(26, lvs[26] || 0);
  const mineCurrency = saveData.stateR7?.[5] || 0;
  const svarHP = saveData.serverVarMineHP || 1;
  const svarCost = saveData.serverVarMineCost || 1;
  const _uSushi = saveData.cachedUniqueSushi || 0;
  const _rogCostPct = Math.max(rogBonusQTY(1, _uSushi), rogBonusQTY(16, _uSushi));
  const baseline = results['base'];
  const upgrades = affordable.map(idx => {
    const r = results[`upg${idx}`];
    const b = baseline;
    if (!r || !b) return { idx, name: MINEHEAD_UPG[idx].name.replace(/_/g, ' '), dmgPct: 0, winDelta: 0, result: r };
    const dmgPct = b.avgDmg > 0 ? (r.avgDmg - b.avgDmg) / b.avgDmg * 100 : 0;
    const winDelta = (r.winRate - b.winRate) * 100;
    const cost = upgCost(idx, lvs[idx] || 0, qty26, svarCost, _rogCostPct);
    const dmgInc = r.avgDmg - b.avgDmg;
    const dmgPerCost = cost > 0 ? dmgInc / cost : 0;
    const canAfford = canBuyUpg(idx, lvs[idx] || 0, mineCurrency, qty26, svarCost, _rogCostPct);
    return { idx, name: MINEHEAD_UPG[idx].name.replace(/_/g, ' '), dmgPct, winDelta, cost, dmgPerCost, canAfford, result: r, baseline: b };
  });

  upgrades.sort((a, b) => b.dmgPerCost - a.dmgPerCost);
  _rankCache = { floor, baseline, upgrades, nTrials, upgLevels: lvs, svarHP };

  const statusEl = document.getElementById('mh-rank-status');
  const progressEl = document.getElementById('mh-rank-progress');
  const cancelEl = document.getElementById('mh-rank-cancel');
  const btnEl = document.getElementById('mh-rank-btn');
  if (statusEl) { statusEl.textContent = 'Done!'; statusEl.style.color = 'var(--green)'; }
  if (progressEl) progressEl.style.display = 'none';
  if (cancelEl) cancelEl.style.display = 'none';
  if (btnEl) btnEl.disabled = false;
  _showRankResults(_rankCache);
}

function _showRankResults(cache) {
  const el = document.getElementById('mh-rank-results');
  if (!el || !cache) return;
  const { baseline: b, upgrades, nTrials } = cache;

  let html = `<h4 style="color:var(--gold);margin:20px 0 6px;">Upgrade Rankings +1 Level Each</h4>`;
  html += `<p style="color:var(--text2);font-size:.82em;margin-bottom:6px;">Baseline: <b>${_fmt(b.avgDmg)}</b> avg dmg, <b>${(b.winRate * 100).toFixed(1)}%</b> win (${nTrials.toLocaleString()} trials)</p>`;

  // Comparison banner if user has an inferred strategy and this was run with optimized
  const _rInfP = getInferredParams();
  if (_rInfP && cache.upgLevels) {
    const _rInfR = evaluateTunableParams({
      params: _rInfP, floor: cache.floor,
      upgLevels: cache.upgLevels, nTrials: 2000,
      seed: 42 + cache.floor, svarHP: cache.svarHP || 1,
      mineReduction: mineReduction(),
    });
    const dmgDelta = b.avgDmg > 0 ? ((_rInfR.avgDmg - b.avgDmg) / b.avgDmg * 100) : 0;
    const winDelta = (_rInfR.winRate - b.winRate) * 100;
    const dColor = dmgDelta >= 0 ? 'var(--green)' : 'var(--accent)';
    const wColor = winDelta >= 0 ? 'var(--green)' : 'var(--accent)';
    html += `<div style="padding:8px 12px;background:var(--bg2);border:1px solid var(--cyan);border-radius:6px;margin-bottom:10px;font-size:.85em;">`;
    html += `<b style="color:var(--cyan);">Your Strategy baseline:</b> <b>${_fmt(_rInfR.avgDmg)}</b> avg dmg, <b>${(_rInfR.winRate * 100).toFixed(1)}%</b> win &nbsp; `;
    html += `(<span style="color:${dColor};">${dmgDelta >= 0 ? '+' : ''}${dmgDelta.toFixed(1)}% dmg</span>, `;
    html += `<span style="color:${wColor};">${winDelta >= 0 ? '+' : ''}${winDelta.toFixed(1)}% win</span> vs optimized)`;
    html += `</div>`;
  }

  html += `<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:.85em;">`;
  html += `<thead><tr style="border-bottom:2px solid var(--bg3);">`;
  html += `<th style="text-align:left;padding:5px 8px;color:var(--text2);">#</th>`;
  html += `<th style="text-align:left;padding:5px 8px;color:var(--text2);">Upgrade</th>`;
  html += `<th style="text-align:center;padding:5px 8px;color:var(--text2);">Affordable</th>`;
  html += `<th style="text-align:center;padding:5px 8px;color:var(--text2);">Dmg%</th>`;
  html += `<th style="text-align:center;padding:5px 8px;color:var(--text2);">Cost</th>`;
  html += `<th style="text-align:center;padding:5px 8px;color:var(--text2);">Dmg/Cost</th>`;
  html += `<th style="text-align:center;padding:5px 8px;color:var(--text2);">Win%</th>`;
  html += `<th style="text-align:center;padding:5px 8px;color:var(--text2);">Avg Dmg</th>`;
  html += `<th style="text-align:center;padding:5px 8px;color:var(--text2);">Turns</th>`;
  html += `</tr></thead><tbody>`;

  for (let rank = 0; rank < upgrades.length; rank++) {
    const u = upgrades[rank];
    const r = u.result;
    if (!r) continue;
    const isTop = rank < 3;
    const rowBg = isTop ? 'background:rgba(0,200,100,.04);' : '';
    const dpColor = u.dmgPct > 0.01 ? 'var(--green)' : u.dmgPct < -0.01 ? 'var(--accent)' : 'var(--text2)';
    const wdColor = u.winDelta > 0.01 ? 'var(--green)' : u.winDelta < -0.01 ? 'var(--accent)' : 'var(--text2)';
    html += `<tr style="border-bottom:1px solid var(--bg3);${rowBg}">`;
    html += `<td style="padding:4px 8px;color:var(--text2);">${rank + 1}</td>`;
    html += `<td style="padding:4px 8px;font-weight:${isTop ? '700' : '400'};white-space:nowrap;${u.canAfford ? '' : 'opacity:.5;'}">${u.name}</td>`;
    html += `<td style="text-align:center;padding:4px 8px;color:${u.canAfford ? 'var(--green)' : 'var(--accent)'};">${u.canAfford ? 'Yes' : 'No'}</td>`;
    html += `<td style="text-align:center;padding:4px 8px;font-weight:700;color:${dpColor};">${u.dmgPct > 0 ? '+' : ''}${u.dmgPct.toFixed(1)}%</td>`;
    html += `<td style="text-align:center;padding:4px 8px;color:var(--text2);">${_fmt(u.cost)}</td>`;
    html += `<td style="text-align:center;padding:4px 8px;font-weight:700;color:${u.dmgPerCost > 0 ? 'var(--cyan)' : 'var(--text2)'};">${u.dmgPerCost > 0.001 ? _fmt(u.dmgPerCost) : u.dmgPerCost > 0 ? u.dmgPerCost.toExponential(1) : '0'}</td>`;
    html += `<td style="text-align:center;padding:4px 8px;color:${wdColor};">${(r.winRate * 100).toFixed(1)}%${u.winDelta !== 0 ? ` (${u.winDelta > 0 ? '+' : ''}${u.winDelta.toFixed(1)})` : ''}</td>`;
    html += `<td style="text-align:center;padding:4px 8px;">${_fmt(r.avgDmg)}</td>`;
    html += `<td style="text-align:center;padding:4px 8px;">${r.avgTurns.toFixed(1)}</td>`;
    html += `</tr>`;
  }
  html += `</tbody></table></div>`;
  el.innerHTML = html;
}

// ===== UPGRADE PATH FINDER =====

function _cancelPath() {
  if (_pathWorkers) { for (const w of _pathWorkers) w.terminate(); _pathWorkers = null; }
  const statusEl = document.getElementById('mh-path-status');
  const progressEl = document.getElementById('mh-path-progress');
  const cancelEl = document.getElementById('mh-path-cancel');
  const btnEl = document.getElementById('mh-path-btn');
  if (statusEl) { statusEl.textContent = 'Cancelled'; statusEl.style.color = 'var(--accent)'; }
  if (progressEl) progressEl.style.display = 'none';
  if (cancelEl) cancelEl.style.display = 'none';
  if (btnEl) btnEl.disabled = false;
}

function _runUpgradePath(lvs, floor, svarHP) {
  const statusEl = document.getElementById('mh-path-status');
  const progressEl = document.getElementById('mh-path-progress');
  const barEl = document.getElementById('mh-path-bar');
  const pctEl = document.getElementById('mh-path-pct');
  const cancelEl = document.getElementById('mh-path-cancel');
  const btnEl = document.getElementById('mh-path-btn');

  _cancelPath();
  btnEl.disabled = true;
  cancelEl.style.display = '';
  progressEl.style.display = '';
  barEl.style.width = '0%';
  statusEl.textContent = 'Finding path...';
  statusEl.style.color = 'var(--gold)';

  const stratEl = document.getElementById('mh-path-strat');
  const params = (stratEl?.value === 'yours' && getInferredParams()) || _getParams(floor);
  const nTrials = 2000;
  const seed = 42 + floor;
  const maxSteps = 50;
  const researchLv = saveData.researchLevel || 0;
  const hp = floorHP(floor, svarHP);
  const mineCurrency = saveData.stateR7?.[5] || 0;

  const currentLvs = [...lvs];
  const path = [];
  _pathStartCtx = { upgLevels: [...lvs], svarHP };

  const poolSize = Math.max(1, Math.min((navigator.hardwareConcurrency || 4) - 1, 8));
  const workers = [];
  _pathWorkers = workers;
  for (let i = 0; i < poolSize; i++) {
    const w = new Worker('./js/workers/minehead-worker.js', { type: 'module' });
    workers.push(w);
    w.onerror = (ev) => console.error('Worker error:', ev.message);
  }

  // Get baseline first
  const baseWorker = workers[0];
  baseWorker.onmessage = (ev) => {
    if (!_pathWorkers) return;
    const baseline = ev.data.result;
    _runPathStep(currentLvs, path, baseline, 0, maxSteps, params, nTrials, seed, svarHP, floor, hp,
      researchLv, mineCurrency, workers, statusEl, barEl, pctEl, progressEl, cancelEl, btnEl);
  };
  baseWorker.postMessage({ type: 'mc', id: 'path_base', floor, upgLevels: [...currentLvs], params, nTrials, seed, svarHP, mineReduction: mineReduction() });
}

function _runPathStep(currentLvs, path, baseline, step, steps, params, nTrials, seed, svarHP, floor, hp,
    researchLv, mineCurrency, workers, statusEl, barEl, pctEl, progressEl, cancelEl, btnEl) {
  if (!_pathWorkers) return;
  if (step >= steps) {
    // Final evaluation with more trials
    const fw = workers[0];
    fw.onmessage = (ev) => {
      if (!_pathWorkers) return;
      _pathCache = { floor, path, baseline, finalResult: ev.data.result, finalLvs: [...currentLvs] };
      for (const w of workers) w.terminate();
      _pathWorkers = null;
      if (statusEl) { statusEl.textContent = 'Done!'; statusEl.style.color = 'var(--green)'; }
      if (progressEl) progressEl.style.display = 'none';
      if (cancelEl) cancelEl.style.display = 'none';
      if (btnEl) btnEl.disabled = false;
      _showPathResults(_pathCache);
    };
    fw.postMessage({ type: 'mc', id: 'path_final', floor, upgLevels: [...currentLvs], params, nTrials: nTrials * 2, seed, svarHP, mineReduction: mineReduction() });
    return;
  }

  // Find candidates for this step
  const candidates = [];
  const qty26 = upgradeQTY(26, currentLvs[26] || 0);
  const svarCost = saveData.serverVarMineCost || 1;
  const _uSushiPath = saveData.cachedUniqueSushi || 0;
  const _rogCostPath = Math.max(rogBonusQTY(1, _uSushiPath), rogBonusQTY(16, _uSushiPath));
  for (let i = 0; i < MINEHEAD_UPG.length; i++) {
    const lv = currentLvs[i] || 0;
    const max = MINEHEAD_UPG[i].maxLv;
    if ((lv < max || max > 998) && researchLv >= upgLvReq(i)) {
      if (!canBuyUpg(i, lv, mineCurrency, qty26, svarCost, _rogCostPath)) continue;
      candidates.push(i);
    }
  }
  if (candidates.length === 0) {
    _runPathStep(currentLvs, path, baseline, steps, steps, params, nTrials, seed, svarHP, floor, hp,
      researchLv, mineCurrency, workers, statusEl, barEl, pctEl, progressEl, cancelEl, btnEl);
    return;
  }

  // Dispatch all candidate upgrades in parallel
  const candResults = {};
  let done = 0;
  const totalCands = candidates.length;

  function onCandDone(d) {
    if (!_pathWorkers) return;
    candResults[d.id] = d.result;
    done++;
    if (done === totalCands) {
      // Pick best candidate by cost efficiency (dmg increase per currency)
      let bestIdx = -1, bestScore = -Infinity, bestResult = null, bestCost = 0;
      const svarCostLocal = saveData.serverVarMineCost || 1;
      const _uSushiLocal = saveData.cachedUniqueSushi || 0;
      const _rogCostLocal = Math.max(rogBonusQTY(1, _uSushiLocal), rogBonusQTY(16, _uSushiLocal));
      const prevDmg = path.length > 0 ? path[path.length - 1].result.avgDmg : (baseline?.avgDmg || 0);
      for (const idx of candidates) {
        const r = candResults[`path_s${step}_u${idx}`];
        if (!r) continue;
        const lv = currentLvs[idx] || 0;
        const q = upgradeQTY(26, currentLvs[26] || 0);
        const c = upgCost(idx, lv, q, svarCostLocal, _rogCostLocal);
        const dmgInc = r.avgDmg - prevDmg;
        const winInc = r.winRate - (path.length > 0 ? path[path.length - 1].result.winRate : (baseline?.winRate || 0));
        // Score: damage efficiency + small win rate bonus
        const score = c > 0 ? (dmgInc / c) + winInc * 0.01 : -Infinity;
        if (score > bestScore) { bestScore = score; bestIdx = idx; bestResult = r; bestCost = c; }
      }
      if (bestIdx >= 0) {
        mineCurrency -= bestCost;
        currentLvs[bestIdx] = (currentLvs[bestIdx] || 0) + 1;
        path.push({ step: step + 1, upgIdx: bestIdx, result: bestResult, cost: bestCost });
      }
      const pctVal = steps > 0 ? Math.min(100, Math.round((step + 1) / steps * 100)) : 50;
      if (barEl) barEl.style.width = pctVal + '%';
      if (pctEl) pctEl.textContent = `Step ${step + 1} (${_fmt(mineCurrency)} left)`;
      if (statusEl) statusEl.textContent = `Step ${step + 1}: picked ${MINEHEAD_UPG[bestIdx]?.name?.replace(/_/g, ' ') || '?'}`;
      _runPathStep(currentLvs, path, baseline, step + 1, steps, params, nTrials, seed, svarHP, floor, hp,
        researchLv, mineCurrency, workers, statusEl, barEl, pctEl, progressEl, cancelEl, btnEl);
    }
  }

  let taskIdx = 0;
  const tasks = candidates.map(idx => {
    const modLvs = [...currentLvs];
    modLvs[idx] = (modLvs[idx] || 0) + 1;
    return { id: `path_s${step}_u${idx}`, upgLevels: modLvs };
  });

  function dispatch(worker) {
    if (!_pathWorkers || taskIdx >= tasks.length) return;
    const task = tasks[taskIdx++];
    worker.postMessage({ type: 'mc', id: task.id, floor, upgLevels: task.upgLevels, params, nTrials, seed, svarHP, mineReduction: mineReduction() });
  }

  for (const w of workers) {
    w.onmessage = (ev) => {
      if (ev.data.type === 'done') {
        onCandDone(ev.data);
        dispatch(w);
      }
    };
    dispatch(w);
  }
}

function _showPathResults(cache) {
  const el = document.getElementById('mh-path-results');
  if (!el || !cache) return;
  const { path, baseline, finalResult } = cache;

  const totalCost = path.reduce((s, p) => s + (p.cost || 0), 0);
  let html = `<h4 style="color:var(--blue);margin:20px 0 6px;">Cost-Effective Upgrade Path (${path.length} upgrades, ${_fmt(totalCost)} spent)</h4>`;
  html += `<p style="color:var(--text2);font-size:.82em;margin-bottom:6px;">Each step picks the single best +1 upgrade. Baseline: <b>${_fmt(baseline.avgDmg)}</b> avg dmg, <b>${(baseline.winRate * 100).toFixed(1)}%</b> win</p>`;

  // Comparison banner if user has an inferred strategy
  const _pInfP = getInferredParams();
  if (_pInfP && _pathStartCtx) {
    const _pInfR = evaluateTunableParams({
      params: _pInfP, floor: cache.floor,
      upgLevels: _pathStartCtx.upgLevels, nTrials: 2000,
      seed: 42 + cache.floor, svarHP: _pathStartCtx.svarHP || 1,
      mineReduction: mineReduction(),
    });
    const dmgDelta = baseline.avgDmg > 0 ? ((_pInfR.avgDmg - baseline.avgDmg) / baseline.avgDmg * 100) : 0;
    const winDelta = (_pInfR.winRate - baseline.winRate) * 100;
    const dColor = dmgDelta >= 0 ? 'var(--green)' : 'var(--accent)';
    const wColor = winDelta >= 0 ? 'var(--green)' : 'var(--accent)';
    html += `<div style="padding:8px 12px;background:var(--bg2);border:1px solid var(--cyan);border-radius:6px;margin-bottom:10px;font-size:.85em;">`;
    html += `<b style="color:var(--cyan);">Your Strategy baseline:</b> <b>${_fmt(_pInfR.avgDmg)}</b> avg dmg, <b>${(_pInfR.winRate * 100).toFixed(1)}%</b> win &nbsp; `;
    html += `(<span style="color:${dColor};">${dmgDelta >= 0 ? '+' : ''}${dmgDelta.toFixed(1)}% dmg</span>, `;
    html += `<span style="color:${wColor};">${winDelta >= 0 ? '+' : ''}${winDelta.toFixed(1)}% win</span> vs optimized)`;
    html += `</div>`;
  }

  html += `<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:.85em;">`;
  html += `<thead><tr style="border-bottom:2px solid var(--bg3);">`;
  html += `<th style="text-align:left;padding:5px 8px;color:var(--text2);">Step</th>`;
  html += `<th style="text-align:left;padding:5px 8px;color:var(--text2);">Buy Upgrade</th>`;
  html += `<th style="text-align:center;padding:5px 8px;color:var(--text2);">Cost</th>`;
  html += `<th style="text-align:center;padding:5px 8px;color:var(--text2);">Win%</th>`;
  html += `<th style="text-align:center;padding:5px 8px;color:var(--text2);">Avg Dmg</th>`;
  html += `<th style="text-align:center;padding:5px 8px;color:var(--text2);">Turns</th>`;
  html += `</tr></thead><tbody>`;

  for (const s of path) {
    const name = MINEHEAD_UPG[s.upgIdx].name.replace(/_/g, ' ');
    const r = s.result;
    const winColor = r.winRate > 0.8 ? 'var(--green)' : r.winRate > 0.4 ? 'var(--gold)' : 'var(--accent)';
    html += `<tr style="border-bottom:1px solid var(--bg3);">`;
    html += `<td style="padding:4px 8px;color:var(--blue);font-weight:700;">${s.step}</td>`;
    html += `<td style="padding:4px 8px;font-weight:600;">${name}</td>`;
    html += `<td style="text-align:center;padding:4px 8px;color:var(--text2);">${_fmt(s.cost || 0)}</td>`;
    html += `<td style="text-align:center;padding:4px 8px;color:${winColor};font-weight:700;">${(r.winRate * 100).toFixed(1)}%</td>`;
    html += `<td style="text-align:center;padding:4px 8px;">${_fmt(r.avgDmg)}</td>`;
    html += `<td style="text-align:center;padding:4px 8px;">${r.avgTurns.toFixed(1)}</td>`;
    html += `</tr>`;
  }
  html += `</tbody></table></div>`;

  // Final summary
  const fWin = (finalResult.winRate * 100).toFixed(1);
  const fColor = finalResult.winRate > 0.8 ? 'var(--green)' : finalResult.winRate > 0.4 ? 'var(--gold)' : 'var(--accent)';
  const bWin = (baseline.winRate * 100).toFixed(1);
  html += `<div style="margin-top:10px;padding:10px 14px;background:var(--bg2);border:1px solid var(--blue);border-radius:8px;">`;
  html += `<b style="color:var(--blue);">After ${path.length} upgrades:</b> Win <b style="color:${fColor};">${fWin}%</b> (was ${bWin}%) &nbsp; Avg Dmg <b>${_fmt(finalResult.avgDmg)}</b> (was ${_fmt(baseline.avgDmg)})`;
  html += `</div>`;

  el.innerHTML = html;
}

