// ===== MINEHEAD DASHBOARD + CURRENCY SUBTABS =====
import { saveData } from '../state.js';
import { gbWith } from '../sim-math.js';
import { computeMineheadCurrSources } from '../stats/systems/w7/minehead.js';
import { renderBreakdownTree } from './dash-breakdowns.js';
import { _bNode, _gbNode as _gbNodeS } from '../stats/node-helpers.js';
import { label } from '../stats/entity-names.js';
import { gridCoord, RES_GRID_RAW, SHAPE_BONUS_PCT, SHAPE_NAMES } from '../game-data.js';
import { rogBonusQTY } from '../stats/systems/w7/sushi.js';
import { computeButtonBonus } from '../stats/defs/helpers.js';
import { MINEHEAD_UPG, MINEHEAD_NAMES, GRID_DIMS, MINEHEAD_BONUS_QTY as FLOOR_REWARD_QTY, FLOOR_REWARD_DESC } from '../stats/data/w7/minehead.js';
import {
  upgradeQTY, upgCost, upgLvReq, gridDims, totalTiles,
  maxHPYou, floorHP, minesOnFloor, baseDMG,
  dailyTries, currencyPerHour,
} from '../stats/systems/w7/minehead.js';
import { mhState, mineReduction, fmtUpgDesc, _fmt } from './minehead-helpers.js';

export function renderDashboard() {
  const container = document.getElementById('mh-dashboard');
  if (!container) return;

  const lvs = saveData.mineheadUpgLevels || [];
  const floor = saveData.stateR7?.[4] || 0;
  const mineCurrency = saveData.stateR7?.[5] || 0;
  const highestDmg = saveData.stateR7?.[6] || 0;

  const gridExp = lvs[2] || 0;
  const { cols, rows } = gridDims(gridExp);
  const tiles = totalTiles(gridExp);
  const mines = minesOnFloor(floor, mineReduction());
  const lives = maxHPYou(lvs);
  const svarHP = saveData.serverVarMineHP || 1;
  const svarCost = saveData.serverVarMineCost || 1;
  const hp = floorHP(floor, svarHP);
  const tries = dailyTries(0);

  const _gbCtx = { abm: saveData.allBonusMulti || 1 };
  const _gb = idx => gbWith(saveData.gridLevels, saveData.shapeOverlay, idx, _gbCtx);
  const sail38 = Number(saveData.sailingData?.[3]?.[38]) || 0;
  const uniqueSushi = saveData.cachedUniqueSushi || 0;
  const gb167 = _gb(167);
  const base = baseDMG(lvs, gb167, sail38);
  const gb129 = _gb(129);
  const gb148 = _gb(148);
  const gb147 = _gb(147);
  const gb166 = _gb(166);
  const bqty6 = floor > 6 ? FLOOR_REWARD_QTY[6] : 0;
  const mhSrc = computeMineheadCurrSources(saveData);
  const rogB12 = rogBonusQTY(12, uniqueSushi);
  const cph = currencyPerHour({
    gridBonus129: gb129, gridBonus148: gb148, gridBonus147: gb147, gridBonus166: gb166,
    comp143: mhSrc.comp143, bonusQTY6: bqty6, atom13: mhSrc.atom13,
    mealMineCurr: mhSrc.mealMineCurr, arcade62: mhSrc.arcade62,
    rogBonus12: rogB12, buttonBonus1: computeButtonBonus(1, saveData),
    eventShop44: mhSrc.eventShop44,
    upgLevels: lvs, highestDmg,
  });
  const rLv = saveData.researchLevel || 0;
  const rogCostPct = Math.max(rogBonusQTY(1, uniqueSushi), rogBonusQTY(16, uniqueSushi));
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
    <div style="display:flex;align-items:center;justify-content:flex-end;margin-bottom:8px;">
      <label style="font-size:.8em;color:var(--text2);cursor:pointer;user-select:none;">
        <input type="checkbox" id="mh-spoiler" ${mhState.showSpoiler ? 'checked' : ''} style="margin-right:4px;cursor:pointer;" />Show all (spoilers)
      </label>
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
            const cost = lv < u.maxLv || u.maxLv > 998 ? upgCost(i, lv, upgradeQTY(26, lvs[26] || 0), svarCost, rogCostPct) : '--';
            const reqLv = upgLvReq(i);
            const maxed = u.maxLv <= 998 && lv >= u.maxLv;
            const infinite = u.maxLv > 998;
            const locked = (saveData.researchLevel || 0) < reqLv;
            const hidden = locked && reqLv > nextUpgReq;
            const lvStr = maxed ? `${lv}/${u.maxLv} MAX` : infinite ? `${lv}` : `${lv}/${u.maxLv}`;
            const desc = fmtUpgDesc(i, lv, qty, lvs, highestDmg);
            const rowBg = maxed ? 'background:rgba(255,215,0,.08);' : locked ? 'opacity:.45;' : '';
            const lvColor = maxed ? 'var(--gold)' : locked ? 'var(--text2)' : 'var(--green)';
            const reqColor = locked ? 'var(--accent)' : 'var(--green)';
            if (hidden && !mhState.showSpoiler) return `<tr style="border-bottom:1px solid #222;opacity:.3;">
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
        if (hidden && !mhState.showSpoiler) return `<div class="opt-card" style="padding:5px 8px;opacity:.25;">
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
    saveData.serverVarMineCost = v;
    renderDashboard();
  });

  document.getElementById('mh-spoiler').addEventListener('change', (e) => {
    mhState.showSpoiler = e.target.checked;
    renderDashboard();
  });
}

export function renderCurrencyTab() {
  const container = document.getElementById('mh-currency');
  if (!container) return;

  const lvs = saveData.mineheadUpgLevels || [];
  const floor = saveData.stateR7?.[4] || 0;
  const highestDmg = saveData.stateR7?.[6] || 0;

  const _gbCtx = { abm: saveData.allBonusMulti || 1 };
  const _gb = idx => gbWith(saveData.gridLevels, saveData.shapeOverlay, idx, _gbCtx);
  const gb129 = _gb(129);
  const gb148 = _gb(148);
  const gb147 = _gb(147);
  const gb166 = _gb(166);
  const bqty6 = floor > 6 ? FLOOR_REWARD_QTY[6] : 0;
  const uniqueSushi = saveData.cachedUniqueSushi || 0;
  const rogB12 = rogBonusQTY(12, uniqueSushi);
  const mhSrc = computeMineheadCurrSources(saveData);
  const cph = currencyPerHour({
    gridBonus129: gb129, gridBonus148: gb148, gridBonus147: gb147, gridBonus166: gb166,
    comp143: mhSrc.comp143, bonusQTY6: bqty6, atom13: mhSrc.atom13,
    mealMineCurr: mhSrc.mealMineCurr, arcade62: mhSrc.arcade62,
    rogBonus12: rogB12, buttonBonus1: computeButtonBonus(1, saveData),
    eventShop44: mhSrc.eventShop44,
    upgLevels: lvs, highestDmg,
  });

  container.innerHTML = `
    <h3 style="color:var(--cyan);margin-bottom:12px;">Mine Currency/hr Breakdown</h3>
    <p style="color:var(--text2);font-size:.85em;margin-bottom:12px;">Total: <span style="color:var(--green);font-weight:700;">${_fmt(cph)}/hr</span></p>
    <div id="mh-curr-tree" style="max-width:600px;"></div>
  `;

  const treeEl = document.getElementById('mh-curr-tree');
  if (treeEl) {
    const tree = _buildCurrencyTree(gb129, gb148, gb147, gb166, bqty6, lvs, highestDmg, mhSrc, cph, rogB12);
    renderBreakdownTree(tree, treeEl);
  }
}

function _buildCurrencyTree(gb129, gb148, gb147, gb166, bqty6, lvs, highestDmg, mhSrc, cph, rogB12 = 0) {
  const eventShop44 = mhSrc.eventShop44 || 0;
  const logDmg = highestDmg > 0 ? Math.log10(highestDmg) : 0;
  const upg5 = upgradeQTY(5, lvs[5]);
  const upg22 = upgradeQTY(22, lvs[22]);
  const upg28raw = upgradeQTY(28, lvs[28]);
  const upg28 = upg28raw * logDmg;
  const upgAddSum = upg5 + upg22 + upg28 + mhSrc.arcade62;
  const comp143mult = Math.max(1, Math.min(2, mhSrc.comp143));
  const bqMult = Math.min(3, 1 + bqty6 / 100);
  const atomMult = 1 + mhSrc.atom13 / 100;

  const info129 = RES_GRID_RAW[129];
  const lv129 = saveData.gridLevels[129] || 0;
  const bpLv129 = info129[2];
  const base129 = bpLv129 * lv129;
  const si129 = saveData.shapeOverlay[129];
  const hasShape129 = si129 >= 0 && si129 < SHAPE_BONUS_PCT.length;
  const shapeMult129 = 1 + (hasShape129 ? SHAPE_BONUS_PCT[si129] : 0) / 100;
  const gb129node = _bNode(label('Grid', 129), gb129, [
    _bNode('Base', base129, [
      _bNode('Base per Lv', bpLv129, null, { note: info129[0].replace(/_/g, ' ') }),
      _bNode('Level', lv129, null, { fmt: 'x' }),
    ]),
    _bNode('Shape' + (hasShape129 ? ' (' + SHAPE_NAMES[si129] + ')' : ''), shapeMult129, null, { fmt: 'x', note: hasShape129 ? '' : 'No shape' }),
    _bNode('All Bonus Multi', saveData.allBonusMulti, null, { fmt: 'x' }),
  ], { fmt: '/hr' });

  const gb148node = _gbNodeS(saveData, 148, 'Grid ' + gridCoord(148) + ': ' + RES_GRID_RAW[148][0].replace(/_/g, ' '));
  gb148node.val = 1 + gb148 / 100;
  gb148node.fmt = 'x';
  if (gb148node.children?.[0]) gb148node.children[0].label = 'Base';

  const upgChildren = [];
  upgChildren.push(_bNode(label('Minehead', 5), upg5, null, { fmt: '%', note: `Upg 5, Lv ${lvs[5] || 0}` }));
  upgChildren.push(_bNode(label('Minehead', 22), upg22, null, { fmt: '%', note: `Upg 22, Lv ${lvs[22] || 0}` }));
  upgChildren.push(_bNode(label('Minehead', 28), upg28, [
    _bNode('Base per Lv', upg28raw, null, { fmt: '%', note: `Upg 28, Lv ${lvs[28] || 0}` }),
    _bNode('log\u2081\u2080(Highest Dmg)', logDmg, null, { fmt: 'x', note: `Highest Dmg = ${_fmt(highestDmg)}` }),
  ], { fmt: '%' }));
  upgChildren.push(_bNode(label('Arcade', 62), mhSrc.arcade62, null, {
    fmt: '%', note: `Arcade 62, Lv ${mhSrc.arcade62lv}, decay(25, 100)`,
  }));
  const upgNode = _bNode('Upgrade & Arcade Bonus', 1 + upgAddSum / 100, upgChildren, { fmt: 'x' });

  const atomNode = _bNode(label('Atom', 13), atomMult, null, {
    fmt: 'x', note: `Atom 13, Lv ${mhSrc.atom13}`,
  });

  const gb147node = _gbNodeS(saveData, 147, 'Grid ' + gridCoord(147) + ': ' + RES_GRID_RAW[147][0].replace(/_/g, ' '));
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
        _bNode(label('Mainframe', 116), mhSrc.mealMfb116, null, { fmt: '%' }),
        _bNode(label('Breeding', 20), mhSrc.mealShinyS20, null, { fmt: '%' }),
      ], { fmt: 'x' }),
      _bNode(label('WinBonus', 26), 1 + mhSrc.mealWinBon26 / 100, null, { fmt: 'x' }),
    ], { fmt: 'x' }),
  ] : null;
  const mealNode = _bNode(label('Meal', 73), mhSrc.mealMineCurr, mealChildren, {
    fmt: '%', note: mhSrc.mealLv > 0 ? '' : 'Meal 73 not leveled',
  });

  const gb166node = _gbNodeS(saveData, 166, 'Grid ' + gridCoord(166) + ': ' + RES_GRID_RAW[166][0].replace(/_/g, ' '));
  gb166node.fmt = '%';
  if (gb166node.children?.[0]) gb166node.children[0].label = 'Base';

  const passiveSum = gb147 + gb166 + mhSrc.mealMineCurr;
  const passiveNode = _bNode('Grid & Meal Bonus', 1 + passiveSum / 100, [
    gb147node, gb166node, mealNode,
  ], { fmt: 'x' });

  const comp143node = _bNode(label('Companion', 143), comp143mult, null, {
    fmt: 'x', note: mhSrc.comp143 > 0 ? 'w7b2 owned \u2192 2\u00d7 Minehead Currency' : 'Not owned',
  });

  const bossNode = _bNode('Boss Reward: ' + (MINEHEAD_NAMES[6] || 'Floor 7').replace(/_/g, ' '), bqMult, null, {
    fmt: 'x', note: bqty6 > 0 ? `+${bqty6}%, capped at \u00d73.00` : 'Floor 7 not reached',
  });

  const rogMult = 1 + rogB12 / 100;
  const rogNode = _bNode(label('RoG', 12), rogMult, null, {
    fmt: 'x', note: rogB12 > 0 ? `+${rogB12}% (50% when unlocked)` : 'Not unlocked',
  });

  var bb1 = computeButtonBonus(1, saveData);
  var buttonNode = _bNode(label('Button', 1), 1 + bb1 / 100, null, { fmt: 'x' });

  const eventShopMult = 1 + 100 * eventShop44 / 100;
  const eventShopNode = _bNode('Event Shop 44', eventShopMult, null, {
    fmt: 'x', note: eventShop44 ? '2nd Wedding Cake owned' : 'Not owned',
  });

  return _bNode('Mine Currency/hr', cph, [
    gb129node, eventShopNode, gb148node, rogNode, comp143node, bossNode,
    upgNode, buttonNode, atomNode, passiveNode,
  ], { fmt: '/hr' });
}
