// Minehead tab - Dashboard, Optimize, Rank, Path, and Play subtabs.
import { S } from '../state.js';
import { gbWith } from '../sim-math.js';
import { computeMineheadCurrSources } from '../save/external.js';
import { renderBreakdownTree, _bNode, _gbNode } from './dash-breakdowns.js';
import { hideTooltip, moveTooltip } from './tooltip.js';
import { gridCoord, RES_GRID_RAW, SHAPE_BONUS_PCT, SHAPE_NAMES } from '../game-data.js';
import { MINEHEAD_UPG, MINEHEAD_NAMES, GRID_DIMS, FLOOR_REWARD_QTY, FLOOR_REWARD_DESC } from '../minehead/game-data.js';
import {
  upgradeQTY, upgCost, upgLvReq, gridDims, totalTiles,
  maxHPYou, floorHP, minesOnFloor, baseDMG, bonusDMGperTilePCT,
  bluecrownMulti, bluecrownOdds, jackpotOdds, jackpotTiles,
  dailyTries, currencyPerHour, canBuyUpg,
  goldTilesTotal, blocksTotal, instaRevealsTotal, currentOutgoingDMG,
} from '../minehead/formulas.js';
import { monteCarloFloor, tunableStrategy, expandGrid, OPTIMIZE_GRID, evaluateTunableParams, DEFAULT_PARAMS, generateGrid, _placeGoldens } from '../minehead/sim.js';

let PLAY_RIGGED = true;

let _activeSubtab = 'mh-dashboard';

let _rankCache = null;
let _rankWorkers = null;
let _rankTrials = 10_000;
let _optCache = null;      // { floor, bestParams, bestResult, topResults }
let _optWorkers = null;    // optimizer workers (for cancellation)
let _pathCache = null;     // { floor, path, baseline, finalResult, finalLvs }
let _pathWorkers = null;   // path workers (for cancellation)

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
  if (_activeSubtab === 'mh-dashboard') _renderDashboard();
  else if (_activeSubtab === 'mh-optimize') _renderOptimize();
  else if (_activeSubtab === 'mh-rank') _renderRankTab();
  else if (_activeSubtab === 'mh-path') _renderPathTab();
  else if (_activeSubtab === 'mh-currency') _renderCurrencyTab();
  else if (_activeSubtab === 'mh-play') _renderPlayfield();
}

// ===== DASHBOARD SUBTAB =====

function _renderDashboard() {
  const container = document.getElementById('mh-dashboard');
  if (!container) return;

  const lvs = S.mineheadUpgLevels || [];
  const floor = S.stateR7?.[4] || 0;
  const mineCurrency = S.stateR7?.[5] || 0;
  const highestDmg = S.stateR7?.[6] || 0;

  // Summary cards
  const gridExp = lvs[2] || 0;
  const { cols, rows } = gridDims(gridExp);
  const tiles = totalTiles(gridExp);
  const mines = minesOnFloor(floor);
  const lives = maxHPYou(lvs);
  const svarHP = S.serverVarMineHP || 1;
  const svarCost = S.serverVarMineCost || 1;
  const hp = floorHP(floor, svarHP);
  const base = baseDMG(lvs, 0);
  const tries = dailyTries(0);

  // Currency/hr breakdown
  const _gbCtx = { abm: S.allBonusMulti || 1 };
  const _gb = idx => gbWith(S.gridLevels, S.shapeOverlay, idx, _gbCtx);
  const gb129 = _gb(129);
  const gb148 = _gb(148);
  const gb147 = _gb(147);
  const bqty6 = floor > 6 ? FLOOR_REWARD_QTY[6] : 0;
  const mhSrc = computeMineheadCurrSources();
  const cph = currencyPerHour({
    gridBonus129: gb129, gridBonus148: gb148, gridBonus147: gb147,
    comp143: mhSrc.comp143, bonusQTY6: bqty6, atom13: mhSrc.atom13,
    mealMineCurr: mhSrc.mealMineCurr, arcade62: mhSrc.arcade62,
    upgLevels: lvs, highestDmg,
  });

  // Find the lowest req level among still-locked upgrades (the "next" unlock)
  const rLv = S.researchLevel || 0;
  let nextUpgReq = Infinity;
  for (let i = 0; i < MINEHEAD_UPG.length; i++) {
    const req = upgLvReq(i);
    if (req > rLv && req < nextUpgReq) nextUpgReq = req;
  }

  container.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px;margin-bottom:20px;">
      <div class="opt-card"><div style="color:var(--text2);font-size:.8em;">Current Boss</div><div style="font-size:1.4em;font-weight:700;color:var(--gold);">${(MINEHEAD_NAMES[floor] || 'Boss ' + floor).replace(/_/g, ' ')}</div></div>
      <div class="opt-card"><div style="color:var(--text2);font-size:.8em;">Mine Currency</div><div style="font-size:1.4em;font-weight:700;color:var(--cyan);">${_fmt(mineCurrency)}</div></div>
      <div class="opt-card"><div style="color:var(--text2);font-size:.8em;">Grid</div><div style="font-size:1.4em;font-weight:700;">${cols}x${rows} <span style="color:var(--text2);font-size:.6em;">(${tiles} tiles)</span></div></div>
      <div class="opt-card"><div style="color:var(--text2);font-size:.8em;">Lives</div><div style="font-size:1.4em;font-weight:700;color:var(--green);">${lives}</div></div>
      <div class="opt-card"><div style="color:var(--text2);font-size:.8em;">Base Damage</div><div style="font-size:1.4em;font-weight:700;">${_fmt(base)}</div></div>
      <div class="opt-card"><div style="color:var(--text2);font-size:.8em;">Boss HP</div><div style="font-size:1.4em;font-weight:700;color:var(--accent);">${Math.round(hp).toLocaleString()}</div></div>
      <div class="opt-card"><div style="color:var(--text2);font-size:.8em;">Depth Charges</div><div style="font-size:1.4em;font-weight:700;">${mines}</div></div>
      <div class="opt-card"><div style="color:var(--text2);font-size:.8em;">Daily Tries</div><div style="font-size:1.4em;font-weight:700;">${tries}</div></div>
      <div class="opt-card"><div style="color:var(--text2);font-size:.8em;">Currency/hr</div><div style="font-size:1.4em;font-weight:700;color:var(--cyan);">${_fmt(cph)}</div></div>
      <div class="opt-card">
        <div style="color:var(--text2);font-size:.8em;">A_MineCost (server var)</div>
        <input id="mh-svar-cost" type="number" step="0.01" min="1" value="${svarCost}" style="width:80px;background:var(--bg3);border:1px solid #444;border-radius:4px;color:var(--text);padding:2px 6px;font-size:1.1em;font-weight:700;"/>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start;">
    <div>
    <h3 style="color:var(--cyan);margin-bottom:10px;">Upgrades</h3>
    <div style="overflow-x:auto;">
      <table style="width:100%;border-collapse:collapse;font-size:.8em;">
        <thead>
          <tr style="text-align:left;color:var(--text2);border-bottom:1px solid #333;">
            <th style="padding:4px 6px;">Name</th>
            <th style="padding:4px 6px;">Lv</th>
            <th style="padding:4px 6px;">Description</th>
            <th style="padding:4px 6px;">Cost</th>
            <th style="padding:4px 6px;">Req</th>
          </tr>
        </thead>
        <tbody>
          ${MINEHEAD_UPG.map((u, i) => {
            const lv = lvs[i] || 0;
            const qty = upgradeQTY(i, lv);
            const cost = lv < u.maxLv || u.maxLv > 998 ? upgCost(i, lv, upgradeQTY(26, lvs[26] || 0), svarCost) : '--';
            const reqLv = upgLvReq(i);
            const maxed = u.maxLv <= 998 && lv >= u.maxLv;
            const infinite = u.maxLv > 998;
            const locked = (S.researchLevel || 0) < reqLv;
            const hidden = locked && reqLv > nextUpgReq;
            const lvStr = maxed ? `${lv}/${u.maxLv} MAX` : infinite ? `${lv}` : `${lv}/${u.maxLv}`;
            const desc = _fmtUpgDesc(i, lv, qty, lvs, highestDmg);
            const rowBg = maxed ? 'background:rgba(255,215,0,.08);' : locked ? 'opacity:.45;' : '';
            const lvColor = maxed ? 'var(--gold)' : locked ? 'var(--text2)' : 'var(--green)';
            const reqColor = locked ? 'var(--accent)' : 'var(--green)';
            if (hidden) return `<tr style="border-bottom:1px solid #222;opacity:.3;">
              <td style="padding:3px 6px;font-weight:600;">???</td>
              <td style="padding:3px 6px;">--</td>
              <td style="padding:3px 6px;color:var(--text2);font-size:.9em;">???</td>
              <td style="padding:3px 6px;">--</td>
              <td style="padding:3px 6px;color:var(--accent);text-align:center;">${reqLv}</td>
            </tr>`;
            return `<tr style="border-bottom:1px solid #222;${rowBg}">
              <td style="padding:3px 6px;font-weight:600;white-space:nowrap;">${u.name.replace(/_/g, ' ')}</td>
              <td style="padding:3px 6px;color:${lvColor};white-space:nowrap;">${lvStr}</td>
              <td style="padding:3px 6px;color:var(--text2);font-size:.9em;">${desc}</td>
              <td style="padding:3px 6px;color:var(--text2);white-space:nowrap;">${typeof cost === 'number' ? _fmt(cost) : cost}</td>
              <td style="padding:3px 6px;color:${reqColor};text-align:center;">${reqLv}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
    </div>
    <div>
    <h3 style="color:var(--gold);margin-bottom:10px;">Boss Rewards</h3>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;">
      ${FLOOR_REWARD_QTY.slice(0, 23).map((q, i) => {
        const unlocked = floor > i;
        const isNext = i === floor;
        const hidden = i > floor;
        const rDesc = FLOOR_REWARD_DESC[i]
          .replace(/\{/g, String(q))
          .replace(/\}/g, (1 + q / 100).toFixed(2));
        if (hidden) return `<div class="opt-card" style="padding:5px 8px;opacity:.25;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span style="font-weight:700;font-size:.85em;color:var(--text2)">???</span>
            <span style="color:var(--text2);">--</span>
          </div>
          <div style="color:var(--text2);font-size:.78em;margin-top:2px;">???</div>
        </div>`;
        return `<div class="opt-card" style="padding:5px 8px;${unlocked ? '' : 'opacity:.4;'}">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span style="font-weight:700;font-size:.85em;color:${unlocked ? 'var(--green)' : 'var(--text2)'}">${(MINEHEAD_NAMES[i] || 'Boss ' + (i + 1)).replace(/_/g, ' ')}</span>
            <span style="color:${unlocked ? 'var(--green)' : 'var(--text2)'};">${unlocked ? 'Yes' : '--'}</span>
          </div>
          <div style="color:var(--text2);font-size:.78em;margin-top:2px;">${rDesc}</div>
        </div>`;
      }).join('')}
    </div>
    </div>
    </div>
  `;

  document.getElementById('mh-svar-cost').addEventListener('change', (e) => {
    const v = Math.max(1, parseFloat(e.target.value) || 1);
    e.target.value = v;
    S.serverVarMineCost = v;
    _renderDashboard();
  });
}

// ===== CURRENCY BREAKDOWN SUBTAB =====

function _renderCurrencyTab() {
  const container = document.getElementById('mh-currency');
  if (!container) return;

  const lvs = S.mineheadUpgLevels || [];
  const floor = S.stateR7?.[4] || 0;
  const highestDmg = S.stateR7?.[6] || 0;

  const _gbCtx = { abm: S.allBonusMulti || 1 };
  const _gb = idx => gbWith(S.gridLevels, S.shapeOverlay, idx, _gbCtx);
  const gb129 = _gb(129);
  const gb148 = _gb(148);
  const gb147 = _gb(147);
  const bqty6 = floor > 6 ? FLOOR_REWARD_QTY[6] : 0;
  const mhSrc = computeMineheadCurrSources();
  const cph = currencyPerHour({
    gridBonus129: gb129, gridBonus148: gb148, gridBonus147: gb147,
    comp143: mhSrc.comp143, bonusQTY6: bqty6, atom13: mhSrc.atom13,
    mealMineCurr: mhSrc.mealMineCurr, arcade62: mhSrc.arcade62,
    upgLevels: lvs, highestDmg,
  });

  container.innerHTML = `
    <h3 style="color:var(--cyan);margin-bottom:12px;">Mine Currency/hr Breakdown</h3>
    <p style="color:var(--text2);font-size:.85em;margin-bottom:12px;">Total: <span style="color:var(--green);font-weight:700;">${_fmt(cph)}/hr</span></p>
    <div id="mh-curr-tree" style="max-width:600px;"></div>
  `;

  const treeEl = document.getElementById('mh-curr-tree');
  if (treeEl) {
    const tree = _buildCurrencyTree(gb129, gb148, gb147, bqty6, lvs, highestDmg, mhSrc, cph);
    renderBreakdownTree(tree, treeEl);
  }
}

function _buildCurrencyTree(gb129, gb148, gb147, bqty6, lvs, highestDmg, mhSrc, cph) {
  const logDmg = highestDmg > 0 ? Math.log10(highestDmg) : 0;
  const upg5 = upgradeQTY(5, lvs[5]);
  const upg22 = upgradeQTY(22, lvs[22]);
  const upg28raw = upgradeQTY(28, lvs[28]);
  const upg28 = upg28raw * logDmg;
  const upgAddSum = upg5 + upg22 + upg28 + mhSrc.arcade62;
  const comp143mult = Math.max(1, Math.min(2, mhSrc.comp143));
  const bqMult = Math.min(3, 1 + bqty6 / 100);
  const atomMult = 1 + mhSrc.atom13 / 100;

  // Grid 129 (base) — flat value, not a percentage; build manually
  const info129 = RES_GRID_RAW[129];
  const lv129 = S.gridLevels[129] || 0;
  const bpLv129 = info129[2];
  const base129 = bpLv129 * lv129;
  const si129 = S.shapeOverlay[129];
  const hasShape129 = si129 >= 0 && si129 < SHAPE_BONUS_PCT.length;
  const shapeMult129 = 1 + (hasShape129 ? SHAPE_BONUS_PCT[si129] : 0) / 100;
  const gb129node = _bNode('Grid ' + gridCoord(129) + ': ' + info129[0].replace(/_/g, ' '), gb129, [
    _bNode('Base', base129, [
      _bNode('Base per Lv', bpLv129, null, { note: info129[0].replace(/_/g, ' ') }),
      _bNode('Level', lv129, null, { fmt: 'x' }),
    ]),
    _bNode('Shape' + (hasShape129 ? ' (' + SHAPE_NAMES[si129] + ')' : ''), shapeMult129, null, { fmt: 'x', note: hasShape129 ? '' : 'No shape' }),
    _bNode('All Bonus Multi', S.allBonusMulti, null, { fmt: 'x' }),
  ], { fmt: '/hr' });

  // Grid 148 — percentage multiplier; use _gbNode for full decomposition
  const gb148node = _gbNode(148, 'Grid ' + gridCoord(148) + ': ' + RES_GRID_RAW[148][0].replace(/_/g, ' '));
  gb148node.val = 1 + gb148 / 100;
  gb148node.fmt = 'x';
  if (gb148node.children?.[0]) gb148node.children[0].label = 'Base';

  // Upgrade & Arcade additive group
  const upgChildren = [];
  upgChildren.push(_bNode('Miney Farmey I', upg5, null, { fmt: '%', note: `Upg 5, Lv ${lvs[5] || 0}` }));
  upgChildren.push(_bNode('Miney Farmey II', upg22, null, { fmt: '%', note: `Upg 22, Lv ${lvs[22] || 0}` }));
  upgChildren.push(_bNode('Miney Damagey Synergy', upg28, [
    _bNode('Base per Lv', upg28raw, null, { fmt: '%', note: `Upg 28, Lv ${lvs[28] || 0}` }),
    _bNode('log\u2081\u2080(Highest Dmg)', logDmg, null, { fmt: 'x', note: `Highest Dmg = ${_fmt(highestDmg)}` }),
  ], { fmt: '%' }));
  upgChildren.push(_bNode('Arcade: Minehead Currency', mhSrc.arcade62, null, {
    fmt: '%', note: `Arcade 62, Lv ${mhSrc.arcade62lv}, decay(25, 100)`,
  }));
  const upgNode = _bNode('Upgrade & Arcade Bonus', 1 + upgAddSum / 100, upgChildren, { fmt: 'x' });

  // Atom
  const atomNode = _bNode('Atom: Silicon', atomMult, null, {
    fmt: 'x', note: `Atom 13, Lv ${mhSrc.atom13}`,
  });

  // Grid 147 + Meal additive group
  const gb147node = _gbNode(147, 'Grid ' + gridCoord(147) + ': ' + RES_GRID_RAW[147][0].replace(/_/g, ' '));
  gb147node.fmt = '%';
  if (gb147node.children?.[0]) gb147node.children[0].label = 'Base';

  const mealChildren = mhSrc.mealLv > 0 ? [
    _bNode('Meal Value', 0.02 * mhSrc.mealLv, [
      _bNode('Base', 0.02, null, { fmt: '%' }),
      _bNode('Levels', mhSrc.mealLv, null, { fmt: 'x' }),
    ], { fmt: '%' }),
    _bNode('Ribbon (T' + mhSrc.mealRibT + ')', mhSrc.mealRibBon, null, { fmt: 'x' }),
    _bNode('Meal Multi', mhSrc.mealCookMulti, [
      _bNode('Cooking Multi', (1 + (mhSrc.mealMfb116 + mhSrc.mealShinyS20) / 100), [
        _bNode('Black Diamond Rhinestone', mhSrc.mealMfb116, null, { fmt: '%' }),
        _bNode('Shiny: Meal Bonus', mhSrc.mealShinyS20, null, { fmt: '%' }),
      ], { fmt: 'x' }),
      _bNode('Summoning Win Bonus', 1 + mhSrc.mealWinBon26 / 100, null, { fmt: 'x' }),
    ], { fmt: 'x' }),
  ] : null;
  const mealNode = _bNode('Meal: 2nd Wedding Cake', mhSrc.mealMineCurr, mealChildren, {
    fmt: '%', note: mhSrc.mealLv > 0 ? '' : 'Meal 73 not leveled',
  });

  const passiveSum = gb147 + mhSrc.mealMineCurr;
  const passiveNode = _bNode('Grid & Meal Bonus', 1 + passiveSum / 100, [
    gb147node, mealNode,
  ], { fmt: 'x' });

  const comp143node = _bNode('Boomy Mine (Companion)', comp143mult, null, {
    fmt: 'x', note: mhSrc.comp143 > 0 ? 'w7b2 owned \u2192 2\u00d7 Minehead Currency' : 'Not owned',
  });

  const bossNode = _bNode('Boss Reward: ' + (MINEHEAD_NAMES[6] || 'Floor 7').replace(/_/g, ' '), bqMult, null, {
    fmt: 'x', note: bqty6 > 0 ? `+${bqty6}%, capped at \u00d73.00` : 'Floor 7 not reached',
  });

  return _bNode('Mine Currency/hr', cph, [
    gb129node, gb148node, comp143node, bossNode,
    upgNode, atomNode, passiveNode,
  ], { fmt: '/hr' });
}

// ===== OPTIMIZE STRATEGY SUBTAB =====

function _renderOptimize() {
  const container = document.getElementById('mh-optimize');
  if (!container) return;

  const lvs = S.mineheadUpgLevels || [];
  const floor = S.stateR7?.[4] || 0;
  const svarHP = S.serverVarMineHP || 1;
  const hp = floorHP(floor, svarHP);
  const mines = minesOnFloor(floor);

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
}

// ===== RANK UPGRADES SUBTAB =====

function _renderRankTab() {
  const container = document.getElementById('mh-rank');
  if (!container) return;

  const lvs = S.mineheadUpgLevels || [];
  const floor = S.stateR7?.[4] || 0;
  const svarHP = S.serverVarMineHP || 1;

  container.innerHTML = `
    <div style="margin-bottom:16px;">
      <h3 style="color:var(--green);margin-bottom:8px;">Rank Upgrades - ${(MINEHEAD_NAMES[floor] || 'Boss ' + floor).replace(/_/g, ' ')}</h3>
      <p style="color:var(--text2);font-size:.9em;margin-bottom:12px;">
        Simulates each unlocked upgrade +1 level to rank by damage improvement. Shows which are affordable.
      </p>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:16px;">
        <button class="btn" id="mh-rank-btn" style="background:linear-gradient(135deg,#1a6b3c,#0d4d2b);">Rank Upgrades (+1 each)</button>
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

  const lvs = S.mineheadUpgLevels || [];
  const floor = S.stateR7?.[4] || 0;
  const svarHP = S.serverVarMineHP || 1;

  container.innerHTML = `
    <div style="margin-bottom:16px;">
      <h3 style="color:var(--blue);margin-bottom:8px;">Affordable Upgrade Path - ${(MINEHEAD_NAMES[floor] || 'Boss ' + floor).replace(/_/g, ' ')}</h3>
      <p style="color:var(--text2);font-size:.9em;margin-bottom:12px;">
        Spends your currency optimally: each step picks the most cost-effective affordable upgrade until you run out.
      </p>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:16px;">
        <button class="btn" id="mh-path-btn" style="background:linear-gradient(135deg,#1a3c6b,#0d2b4d);">Find Upgrade Path</button>
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
    grid[k.key] = k.key === 'blockAggro'
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
        _onOptComplete(screenResults.slice(0, topN), floor);
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

function _onOptComplete(topResults, floor) {
  if (_optWorkers) { for (const w of _optWorkers) w.terminate(); _optWorkers = null; }
  topResults.sort((a, b) => b.score - a.score);
  const best = topResults[0];
  _optCache = { floor, bestParams: best.params, bestResult: best.result, topResults };
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
  html += _paramBadge('T1 EV Mul', bp.turn1EvMul || '—',
    bp.turn1EvMul > 0 ? `Turn 1 EV = ${bp.turn1EvMul}` : 'Same as EV Mul',
    'Separate EV multiplier for turn 1 only (no damage invested yet). Lower = more aggressive on the opening turn since you have nothing to lose.');
  html += _paramBadge('Crown Chase', bp.crownChase || '—',
    bp.crownChase > 0 ? `−${(bp.crownChase * 100).toFixed(0)}% EV at 2/3 crowns` : 'Off',
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
  html += `<th style="padding:4px 6px;color:var(--purple);cursor:help;" data-tip="EV Multiplier — how picky the strategy is about revealing vs attacking. >1 = conservative, <1 = aggressive.">EV Mul</th>`;
  html += `<th style="padding:4px 6px;color:var(--purple);cursor:help;" data-tip="Minimum Reveals — must reveal at least this many safe tiles before attacking.">Min Rev</th>`;
  html += `<th style="padding:4px 6px;color:var(--purple);cursor:help;" data-tip="Mine Cap — stop revealing if remaining tiles are this % mines.">Cap</th>`;
  html += `<th style="padding:4px 6px;color:var(--purple);cursor:help;" data-tip="Goldens — when to use golden tiles. 'Last' = save for end. A % = use when mine density reaches that level.">Goldens</th>`;
  html += `<th style="padding:4px 6px;color:var(--purple);cursor:help;" data-tip="HP Threshold — attack when damage reaches this % of remaining boss HP.">HP Thr</th>`;
  html += `<th style="padding:4px 6px;color:var(--purple);cursor:help;" data-tip="Block Aggro — 'Aggro' = factor blocks into EV (mine hit loses block, not life). 'Safe' = ignore blocks.">Blocks</th>`;
  html += `<th style="padding:4px 6px;color:var(--purple);cursor:help;" data-tip="Commit Min — minimum damage as % of remaining HP before bothering to attack.">Cmt Min</th>`;
  html += `<th style="padding:4px 6px;color:var(--purple);cursor:help;" data-tip="Life Aggro — EV multiplier when you have spare lives. &lt;1 = take more risks with extra lives.">Life Agg</th>`;
  html += `<th style="padding:4px 6px;color:var(--purple);cursor:help;" data-tip="Turn 1 EV — separate EV multiplier for the first turn (no invested damage yet).">T1 EV</th>`;
  html += `<th style="padding:4px 6px;color:var(--purple);cursor:help;" data-tip="Crown Chase — reduce EV threshold by this factor when 2/3 blue crowns are matched.">Crown</th>`;
  html += `<th style="padding:4px 6px;color:var(--purple);cursor:help;" data-tip="Insta Mode — mine% threshold for using insta-reveals. '—' = always use.">Insta</th>`;
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
    html += `<td style="padding:4px 6px;">${p.hpThreshold > 0 ? (p.hpThreshold * 100).toFixed(0) + '%' : '—'}</td>`;
    html += `<td style="padding:4px 6px;">${p.blockAggro ? 'Aggro' : 'Safe'}</td>`;
    html += `<td style="padding:4px 6px;">${p.commitMin ? (p.commitMin * 100).toFixed(0) + '%' : '—'}</td>`;
    html += `<td style="padding:4px 6px;">${p.lifeAggro ?? 1}</td>`;
    html += `<td style="padding:4px 6px;">${p.turn1EvMul || '—'}</td>`;
    html += `<td style="padding:4px 6px;">${p.crownChase || '—'}</td>`;
    html += `<td style="padding:4px 6px;">${p.instaMode > 0 ? (p.instaMode * 100).toFixed(0) + '%' : '—'}</td>`;
    html += `</tr>`;
  }
  html += `</tbody></table></div>`;
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
  const mineCurrency = S.stateR7?.[5] || 0;
  const qty26 = upgradeQTY(26, lvs[26] || 0);
  const params = _getParams(floor);

  const researchLv = S.researchLevel || 0;
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
  worker.postMessage({ type: 'mc', id: task.id, floor, upgLevels: task.upgLevels, params, nTrials, seed, svarHP });
}

function _onRankComplete(results, affordable, floor, nTrials, lvs) {
  if (_rankWorkers) { for (const w of _rankWorkers) w.terminate(); _rankWorkers = null; }

  const qty26 = upgradeQTY(26, lvs[26] || 0);
  const mineCurrency = S.stateR7?.[5] || 0;
  const svarHP = S.serverVarMineHP || 1;
  const svarCost = S.serverVarMineCost || 1;
  const baseline = results['base'];
  const upgrades = affordable.map(idx => {
    const r = results[`upg${idx}`];
    const b = baseline;
    if (!r || !b) return { idx, name: MINEHEAD_UPG[idx].name.replace(/_/g, ' '), dmgPct: 0, winDelta: 0, result: r };
    const dmgPct = b.avgDmg > 0 ? (r.avgDmg - b.avgDmg) / b.avgDmg * 100 : 0;
    const winDelta = (r.winRate - b.winRate) * 100;
    const cost = upgCost(idx, lvs[idx] || 0, qty26, svarCost);
    const dmgInc = r.avgDmg - b.avgDmg;
    const dmgPerCost = cost > 0 ? dmgInc / cost : 0;
    const canAfford = canBuyUpg(idx, lvs[idx] || 0, mineCurrency, qty26, svarCost);
    return { idx, name: MINEHEAD_UPG[idx].name.replace(/_/g, ' '), dmgPct, winDelta, cost, dmgPerCost, canAfford, result: r, baseline: b };
  });

  upgrades.sort((a, b) => b.dmgPerCost - a.dmgPerCost);
  _rankCache = { floor, baseline, upgrades, nTrials };

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

  const params = _getParams(floor);
  const nTrials = 2000;
  const seed = 42 + floor;
  const maxSteps = 50;
  const researchLv = S.researchLevel || 0;
  const hp = floorHP(floor, svarHP);
  const mineCurrency = S.stateR7?.[5] || 0;

  const currentLvs = [...lvs];
  const path = [];

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
  baseWorker.postMessage({ type: 'mc', id: 'path_base', floor, upgLevels: [...currentLvs], params, nTrials, seed, svarHP });
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
    fw.postMessage({ type: 'mc', id: 'path_final', floor, upgLevels: [...currentLvs], params, nTrials: nTrials * 2, seed, svarHP });
    return;
  }

  // Find candidates for this step
  const candidates = [];
  const qty26 = upgradeQTY(26, currentLvs[26] || 0);
  const svarCost = S.serverVarMineCost || 1;
  for (let i = 0; i < MINEHEAD_UPG.length; i++) {
    const lv = currentLvs[i] || 0;
    const max = MINEHEAD_UPG[i].maxLv;
    if ((lv < max || max > 998) && researchLv >= upgLvReq(i)) {
      if (!canBuyUpg(i, lv, mineCurrency, qty26, svarCost)) continue;
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
      const svarCostLocal = S.serverVarMineCost || 1;
      const prevDmg = path.length > 0 ? path[path.length - 1].result.avgDmg : (baseline?.avgDmg || 0);
      for (const idx of candidates) {
        const r = candResults[`path_s${step}_u${idx}`];
        if (!r) continue;
        const lv = currentLvs[idx] || 0;
        const q = upgradeQTY(26, currentLvs[26] || 0);
        const c = upgCost(idx, lv, q, svarCostLocal);
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
    worker.postMessage({ type: 'mc', id: task.id, floor, upgLevels: task.upgLevels, params, nTrials, seed, svarHP });
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

// ===== MEME GAMEPLAY SUBTAB =====

function _renderPlayfield() {
  const container = document.getElementById('mh-play');
  if (!container) return;

  const lvs = S.mineheadUpgLevels || [];
  const floor = S.stateR7?.[4] || 0;
  const svarHP = S.serverVarMineHP || 1;
  const { cols, rows } = gridDims(lvs[2]);
  const numTiles = cols * rows;
  const mines = minesOnFloor(floor);
  const hp = floorHP(floor, svarHP);
  const maxLives = maxHPYou(lvs);
  const maxGoldens = goldTilesTotal(lvs);
  const maxBlocks = blocksTotal(lvs);
  const maxInstas = instaRevealsTotal(lvs);
  const crownOdds = bluecrownOdds(lvs);
  const jpTileCount = jackpotTiles(lvs);
  const bossName = (MINEHEAD_NAMES[floor] || 'Boss ' + floor).replace(/_/g, ' ');

  container.innerHTML = `
    <div style="text-align:center;margin-bottom:12px;">
      <h3 style="color:var(--accent);margin-bottom:4px;">Depth Charge — Floor ${floor}: ${bossName}</h3>
      <div id="mh-p-hud" style="display:flex;justify-content:center;gap:16px;flex-wrap:wrap;font-size:.88em;margin:8px 0;"></div>
      <div id="mh-p-dmg-bar" style="max-width:400px;margin:8px auto;"></div>
      <div id="mh-p-turn-info" style="color:var(--text2);font-size:.82em;margin-bottom:6px;"></div>
      <div style="display:flex;gap:8px;justify-content:center;margin-bottom:10px;">
        <button class="btn" id="mh-p-attack" style="background:var(--accent);font-weight:700;">⚔ Attack</button>
        <button class="btn" id="mh-p-insta" style="background:#1a6b1a;">⚡ Insta-Reveal</button>
        <button class="btn" id="mh-p-new" style="background:var(--bg3);">New Game</button>
      </div>
    </div>
    <div id="mh-p-grid" style="display:grid;grid-template-columns:repeat(${cols}, 48px);gap:3px;justify-content:center;"></div>
    <div id="mh-p-log" style="max-width:500px;margin:12px auto 0;max-height:160px;overflow-y:auto;font-size:.78em;color:var(--text2);"></div>
  `;

  _initPlayGame(container, cols, rows, numTiles, mines, hp, maxLives, maxGoldens, maxBlocks, maxInstas, crownOdds, jpTileCount, lvs, svarHP);
}

function _initPlayGame(container, cols, rows, numTiles, mines, bossHP, maxLives, maxGoldens, maxBlocks, maxInstas, crownOdds, jpTileCount, lvs, svarHP) {
  const gridEl = document.getElementById('mh-p-grid');
  const hudEl = document.getElementById('mh-p-hud');
  const dmgBarEl = document.getElementById('mh-p-dmg-bar');
  const turnInfoEl = document.getElementById('mh-p-turn-info');
  const logEl = document.getElementById('mh-p-log');
  const attackBtn = document.getElementById('mh-p-attack');
  const instaBtn = document.getElementById('mh-p-insta');
  const newBtn = document.getElementById('mh-p-new');

  const gridBonus167 = 0; // TODO: wire from save if available
  const gridBonus146 = 0;
  const wepPowDmgPCT = 0;

  let _rng = _makeRng();
  let lives, goldens, blocks, instas, totalDmg, turnsPlayed, totalCommits;
  let grid, crowns, goldenPos, revealed, turnValues, crownProgress, crownSets;
  let safeRevealed, gameOver, turnActive, minesFound;

  function _makeRng() {
    let s = (Date.now() ^ 0xDEADBEEF) | 0;
    return () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }

  function _log(msg, color) {
    const d = document.createElement('div');
    if (color) d.style.color = color;
    d.textContent = msg;
    logEl.prepend(d);
  }

  function _hudItem(label, val, color) {
    return `<div><span style="color:var(--text2);">${label}:</span> <b style="color:${color};">${val}</b></div>`;
  }

  function _updateHud() {
    let h = '';
    h += _hudItem('Lives', '❤'.repeat(lives) + '🖤'.repeat(Math.max(0, maxLives - lives)), 'var(--accent)');
    h += _hudItem('Blocks', blocks, 'var(--cyan)');
    h += _hudItem('Goldens', goldens, 'var(--gold)');
    h += _hudItem('Instas', instas, '#4caf50');
    h += _hudItem('Turn', turnsPlayed, 'var(--text)');
    h += _hudItem('Crowns', `${crownProgress}/3 (${crownSets} sets)`, 'var(--purple)');
    hudEl.innerHTML = h;

    const pct = Math.min(100, totalDmg / bossHP * 100);
    const turnDmg = _calcTurnDmg();
    const turnPct = Math.min(100 - pct, turnDmg / bossHP * 100);
    dmgBarEl.innerHTML = `<div style="background:var(--bg3);border-radius:4px;height:16px;overflow:hidden;position:relative;">
      <div style="width:${pct}%;height:100%;background:var(--green);position:absolute;left:0;top:0;transition:width .3s;"></div>
      <div style="width:${turnPct}%;height:100%;background:var(--gold);opacity:.6;position:absolute;left:${pct}%;top:0;transition:width .2s;"></div>
      <div style="position:absolute;width:100%;text-align:center;font-size:.72em;line-height:16px;color:#fff;font-weight:600;">${_fmt(totalDmg)} / ${_fmt(bossHP)} ${turnDmg > 0 ? '(+' + _fmt(turnDmg) + ')' : ''}</div>
    </div>`;

    const estMinesLeft = Math.max(0, mines - minesFound);
    const unrevealed = grid ? revealed.filter(r => !r).length : 0;
    const mPct = unrevealed > 0 ? (estMinesLeft / unrevealed * 100).toFixed(0) : 0;
    turnInfoEl.textContent = `Tiles: ${safeRevealed} revealed | Mines left: ~${estMinesLeft}/${unrevealed} (${mPct}%) | Turn dmg: ${_fmt(_calcTurnDmg())}`;

    attackBtn.disabled = gameOver || !turnActive || safeRevealed === 0;
    instaBtn.disabled = gameOver || !turnActive || instas <= 0;
    attackBtn.style.opacity = attackBtn.disabled ? '.4' : '1';
    instaBtn.style.opacity = instaBtn.disabled ? '.4' : '1';
  }

  function _calcTurnDmg() {
    if (turnValues.length === 0) return 0;
    return currentOutgoingDMG(turnValues, crownSets, lives <= 1, lvs, gridBonus167, gridBonus146, wepPowDmgPCT);
  }

  function _newGame() {
    _rng = _makeRng();
    lives = maxLives;
    goldens = maxGoldens;
    blocks = maxBlocks;
    instas = maxInstas;
    totalDmg = 0;
    turnsPlayed = 0;
    totalCommits = 0;
    gameOver = false;
    logEl.innerHTML = '';
    _log('Game started! Click tiles to reveal them.', 'var(--green)');
    _newTurn();
  }

  function _newTurn() {
    turnsPlayed++;
    const g = generateGrid(numTiles, mines, lvs, crownOdds, _rng);
    grid = g.grid;
    crowns = g.crowns;
    goldenPos = _placeGoldens(grid, numTiles, goldens, maxGoldens, _rng);
    // Rigged mode: every non-golden tile becomes a mine
    if (PLAY_RIGGED) {
      const goldSet = new Set(goldenPos);
      for (let i = 0; i < numTiles; i++) { if (!goldSet.has(i)) grid[i] = 0; }
    }
    revealed = new Array(numTiles).fill(false);
    turnValues = [];
    minesFound = 0;
    crownProgress = 0;
    crownSets = 0;
    safeRevealed = 0;
    turnActive = true;
    _log(`── Turn ${turnsPlayed} ──`, 'var(--purple)');
    _renderGrid();
    _updateHud();
  }

  function _tileStyle(i) {
    if (!revealed[i]) {
      const isGolden = goldenPos.includes(i);
      return isGolden
        ? 'background:linear-gradient(135deg,#8b6914,#c9a227);border-color:#daa520;color:#fff;cursor:pointer;'
        : 'background:var(--bg3);border-color:#444;color:var(--text2);cursor:pointer;';
    }
    const v = grid[i];
    if (v === 0) return 'background:rgba(233,69,96,.25);border-color:var(--accent);color:var(--accent);cursor:default;';
    if (v === 30) return 'background:rgba(255,215,0,.2);border-color:var(--gold);color:var(--gold);cursor:default;';
    if (v >= 40) return 'background:rgba(0,188,212,.15);border-color:var(--cyan);color:var(--cyan);cursor:default;';
    if (v >= 20) return 'background:rgba(156,39,176,.2);border-color:var(--purple);color:var(--purple);cursor:default;';
    return 'background:rgba(76,175,80,.15);border-color:var(--green);color:var(--green);cursor:default;';
  }

  function _tileLabel(i) {
    if (!revealed[i]) return goldenPos.includes(i) ? '★' : '?';
    const v = grid[i];
    if (v === 0) return '💣';
    if (v === 30) return '🎰';
    if (v >= 40) return '$' + (v - 39);
    if (v >= 20) return '×' + (v - 19);
    return v;
  }

  function _renderGrid() {
    gridEl.innerHTML = '';
    for (let i = 0; i < numTiles; i++) {
      const tile = document.createElement('div');
      tile.style.cssText = `width:48px;height:48px;border:2px solid;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:1.2em;font-weight:700;transition:all .15s;user-select:none;${_tileStyle(i)}`;
      tile.textContent = _tileLabel(i);
      if (crowns[i] && revealed[i] && grid[i] !== 0) {
        tile.innerHTML = _tileLabel(i) + '<span style="position:absolute;top:-2px;right:1px;font-size:.55em;">👑</span>';
        tile.style.position = 'relative';
      }
      if (!revealed[i] && turnActive && !gameOver) {
        tile.addEventListener('mouseenter', () => { tile.style.transform = 'scale(1.08)'; });
        tile.addEventListener('mouseleave', () => { tile.style.transform = ''; });
        tile.addEventListener('click', () => _onTileClick(i));
      }
      gridEl.appendChild(tile);
    }
  }

  function _revealTile(i, isInsta) {
    if (revealed[i]) return 'already';
    revealed[i] = true;

    if (crowns[i]) {
      crownProgress++;
      if (crownProgress >= 3) { crownProgress = 0; crownSets++; _log('👑 Crown 3-match! Sets: ' + crownSets, 'var(--purple)'); }
    }
    if (goldenPos.includes(i)) { goldens--; }

    const v = grid[i];
    if (v === 0) {
      minesFound++;
      if (isInsta) { _log('⚡ Insta-reveal found a mine safely!', '#4caf50'); return 'mine-insta'; }
      if (blocks > 0) { blocks--; _log('🛡 Block absorbed a mine hit!', 'var(--cyan)'); return 'mine-blocked'; }
      lives--;
      if (lives === 1 && upgradeQTY(19, lvs[19]) >= 1) { blocks = 1; _log('💀 Revival! Gained 1 block.', 'var(--gold)'); }
      _log('💣 MINE HIT! Lives: ' + lives, 'var(--accent)');
      return 'mine-hit';
    }
    if (v === 30) {
      _log('🎰 JACKPOT! Cascade-revealing tiles...', 'var(--gold)');
      let jpLeft = jpTileCount;
      for (let attempt = 0; attempt < 1000 && jpLeft > 0; attempt++) {
        const jPos = Math.floor(_rng() * numTiles);
        if (grid[jPos] !== 0 && !revealed[jPos]) { _revealTile(jPos, false); jpLeft--; }
      }
      return 'jackpot';
    }
    if (v >= 1 && v <= 29) { turnValues.push(v); safeRevealed++; }
    else if (v >= 40) { safeRevealed++; _log('💰 Currency tile +' + (v - 39), 'var(--cyan)'); }
    return 'safe';
  }

  function _onTileClick(i) {
    if (gameOver || !turnActive || revealed[i]) return;
    const result = _revealTile(i, false);

    if (result === 'mine-hit') {
      if (lives <= 0) {
        turnActive = false;
        gameOver = true;
        _log('☠ GAME OVER — All lives lost!', 'var(--accent)');
      } else {
        turnActive = false;
        _log('Turn lost — 0 damage committed.', 'var(--accent)');
        setTimeout(() => { if (!gameOver) _newTurn(); }, 1200);
      }
    } else if (result === 'mine-blocked') {
      // keep playing
    }

    // Check if all tiles revealed
    if (turnActive && revealed.every(r => r)) {
      _commitDamage();
      return;
    }

    _renderGrid();
    _updateHud();

    // Auto-win check
    if (totalDmg >= bossHP) {
      gameOver = true;
      turnActive = false;
      _log('🎉 BOSS DEFEATED! Total damage: ' + _fmt(totalDmg), 'var(--green)');
    }
  }

  function _commitDamage() {
    const dmg = _calcTurnDmg();
    if (dmg > 0) {
      totalDmg += dmg;
      totalCommits++;
      _log(`⚔ Attack! Dealt ${_fmt(dmg)} damage (${totalCommits} commits, total: ${_fmt(totalDmg)})`, 'var(--green)');
    }
    turnActive = false;

    if (totalDmg >= bossHP) {
      gameOver = true;
      _log(`🎉 BOSS DEFEATED in ${turnsPlayed} turns!`, 'var(--green)');
    } else {
      setTimeout(() => { if (!gameOver) _newTurn(); }, 800);
    }
    _renderGrid();
    _updateHud();
  }

  function _useInsta() {
    if (gameOver || !turnActive || instas <= 0) return;
    const unrevealed = [];
    for (let i = 0; i < numTiles; i++) { if (grid[i] === 0 && !revealed[i]) unrevealed.push(i); }
    if (unrevealed.length === 0) { _log('No mines left to reveal!', 'var(--text2)'); return; }
    // Lockout check
    const attempts = maxInstas - instas;
    if (_rng() < Math.min(0.7, 0.2 + 0.15 * attempts)) {
      instas = 0;
      _log('⚡ Insta-reveal locked out!', 'var(--accent)');
      _renderGrid();
      _updateHud();
      return;
    }
    instas--;
    const target = unrevealed[Math.floor(_rng() * unrevealed.length)];
    _revealTile(target, true);
    _renderGrid();
    _updateHud();
  }

  attackBtn.addEventListener('click', () => { if (turnActive && safeRevealed > 0) _commitDamage(); });
  instaBtn.addEventListener('click', _useInsta);
  newBtn.addEventListener('click', _newGame);

  _newGame();
}

// ===== helpers =====

// Format upgrade description matching game rendering logic.
// {  = raw qty (comma-formatted)
// }  = multiplier: (1 + qty/100) e.g. "7.20x"
// $  = per-upgrade computed value
const _MULTI_TILE_VALUES = [1.0,1.2,1.4,1.6,2,3,4,5,6,7,8,8,8,8];
const _ADDITIVE_PCT = [0,10,20,50,100,200,500,1000,2000,5000,10000];

function _fmtUpgDesc(i, lv, qty, lvs, highestDmg) {
  const u = MINEHEAD_UPG[i];
  let d = u.desc;

  // {  comma-formatted qty
  d = d.replace(/\{/g, qty.toLocaleString());

  // }  multiplier (1 + qty/100)
  d = d.replace(/\}/g, (1 + qty / 100).toFixed(2));

  // $  per-upgrade computed value
  if (i === 1) { // Numbahs
    if (lv >= 17) d = 'Your max possible number is 19, the MAXIMUM!';
    else d = d.replace(/\$/g, String(Math.round(1 + (qty + 1 + Math.min(1, Math.floor((qty + 1) / 9))))));
  } else if (i === 2) { // Grid Expansion
    if (lv >= 16) d = 'Your grid is 12x6, a full grid!';
    else {
      const next = GRID_DIMS[lv + 1] || GRID_DIMS[lv];
      const [nc, nr] = next.split(',');
      const cur = GRID_DIMS[lv];
      const [cc, cr] = cur.split(',');
      d = `Expands grid to ${nc}x${nr} (${nc * nr} tiles), current ${cc}x${cr}`;
    }
  } else if (i === 12) { // Multiplier Madness
    if (qty === 0) d = 'Unlocks Multiplier Tiles!';
    else d = d.replace(/\$/g, (_MULTI_TILE_VALUES[qty] || 1) + 'x');
  } else if (i === 14) { // Triple Crown Hunter
    const bcm = bluecrownMulti(lvs);
    d = d.replace(/\$/g, bcm.toFixed(2) + 'x');
  } else if (i === 17) { // Awesome Additives
    if (qty === 0) d = 'Unlocks Additive Tiles!';
    else d = d.replace(/\$/g, (_ADDITIVE_PCT[qty] || 0) + '%');
  } else if (i === 23) { // Jackpot Time
    const jo = jackpotOdds(lvs);
    if (jo === 0) d = 'Unlocks JACKPOT Tiles!';
    else d = d.replace(/\$/g, String(Math.ceil(1 / jo)));
  } else if (i === 24) { // Record Breaking Jackpots
    d = d.replace(/\$/g, String(Math.ceil(jackpotTiles(lvs))));
  } else if (i === 26) { // El Cheapo
    const disc = Math.round(1e4 * (1 - 1 / (1 + qty / 100))) / 100;
    d = d.replace(/\$/g, String(disc));
  } else if (i === 28) { // Miney Damagey Synergy
    const log10 = highestDmg > 0 ? Math.log10(highestDmg) : 0;
    const total = qty * log10;
    d = `+${qty.toLocaleString()}% Mine Currency per POW 10 of best hit, +${_fmt(total)}% total`;
  }

  return d;
}

function _fmt(n) {
  if (n === 0) return '0';
  if (typeof n !== 'number' || !isFinite(n)) return String(n);
  if (Math.abs(n) >= 1e12) return (n / 1e12).toFixed(2) + 'T';
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (Math.abs(n) >= 1e4) return (n / 1e3).toFixed(1) + 'K';
  if (Math.abs(n) >= 100) return Math.round(n).toLocaleString();
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}
