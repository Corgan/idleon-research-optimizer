// ===== SUSHI STATION TAB =====
// Overview, Upgrades, Currency/hr, Best Upgrade, Sushi.

import { saveData } from '../state.js';
import { MINEHEAD_BONUS_QTY } from '../stats/data/w7/minehead.js';
import { gbWith } from '../sim-math.js';
import { renderBreakdownTree } from './dash-breakdowns.js';
import { _bNode } from '../stats/node-helpers.js';
import { label } from '../stats/entity-names.js';
import { arcadeBonus } from '../stats/systems/w2/arcade.js';
import { fmtNum as _fmt } from '../renderers/format.js';
import { superBitType } from '../game-helpers.js';
import { computeButtonBonus } from '../stats/defs/helpers.js';
import {
  SUSHI_UPG, SLOT_TO_UPG, TIER_TO_KNOWLEDGE_CAT,
  KNOWLEDGE_CAT_DESC, KNOWLEDGE_CAT_VALUE, ROG_DESC, ROG_BONUS_QTY as ROG_VALUES,
  MAX_TIER, MAX_SLOTS,
} from '../stats/data/w7/sushi.js';
import {
  rogBonusQTY, currencyPerTier, fuelCostPerTier,
  upgLvReq, upgradeQTY, upgCost, slotUpgIdx,
  knowledgeBonusSpecific, knowledgeBonusTotals,
  fuelGenPerHr, fuelCapacity,
  computeOrangeFireSum, fireplaceEffectBase, slotEffectBase,
  currencyPerSlot, computeCurrencyMulti, totalBucksPerHr,
  computeOvertunedMulti, slotsOwned, countActiveSlots,
  maxCookTier, freeShakerChance, saffronHrs,
  perfectoOdds, knowledgeXPReq, knowledgeXPBase, knowledgeXPMulti,
  fireplaceEffectByType,
} from '../stats/systems/w7/sushi.js';

let _activeSubtab = 'su-overview';
let _showSpoilerUpg = false;
let _showSpoilerRoG = false;

export function renderSushiTab() {
  const root = document.getElementById('tab-sushi');
  if (!root) return;

  root.innerHTML = `
    <div class="opt-subtabs" id="su-subtabs">
      <div class="opt-subtab ${_activeSubtab === 'su-overview' ? 'active' : ''}" data-sutab="su-overview">Overview</div>
      <div class="opt-subtab ${_activeSubtab === 'su-upgrades' ? 'active' : ''}" data-sutab="su-upgrades">Upgrades</div>
      <div class="opt-subtab ${_activeSubtab === 'su-currency' ? 'active' : ''}" data-sutab="su-currency">Currency/hr</div>
      <div class="opt-subtab ${_activeSubtab === 'su-best-upg' ? 'active' : ''}" data-sutab="su-best-upg">Best Upgrade</div>
      <div class="opt-subtab ${_activeSubtab === 'su-sushi' ? 'active' : ''}" data-sutab="su-sushi">Sushi</div>
    </div>
    <div id="su-overview" class="optab-content ${_activeSubtab === 'su-overview' ? 'active' : ''}"></div>
    <div id="su-upgrades" class="optab-content ${_activeSubtab === 'su-upgrades' ? 'active' : ''}"></div>
    <div id="su-currency" class="optab-content ${_activeSubtab === 'su-currency' ? 'active' : ''}"></div>
    <div id="su-best-upg" class="optab-content ${_activeSubtab === 'su-best-upg' ? 'active' : ''}"></div>
    <div id="su-sushi" class="optab-content ${_activeSubtab === 'su-sushi' ? 'active' : ''}"></div>
  `;

  root.querySelectorAll('.opt-subtab').forEach(tab => {
    tab.addEventListener('click', () => {
      _activeSubtab = tab.dataset.sutab;
      root.querySelectorAll('.opt-subtab').forEach(t => t.classList.remove('active'));
      root.querySelectorAll('.optab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(tab.dataset.sutab).classList.add('active');
      _renderActiveSubtab();
    });
  });

  _renderActiveSubtab();
}

function _renderActiveSubtab() {
  if (_activeSubtab === 'su-overview') _renderOverview();
  else if (_activeSubtab === 'su-upgrades') _renderUpgrades();
  else if (_activeSubtab === 'su-currency') _renderCurrency();
  else if (_activeSubtab === 'su-best-upg') _renderBestUpgrade();
  else if (_activeSubtab === 'su-sushi') _renderSushi();
}

// ===== HELPERS =====

function _getSushiData() {
  return saveData.sushiData || [];
}

function _getUpgLevels() {
  return _getSushiData()?.[2] || [];
}

function _getUniqueSushi() {
  return saveData.cachedUniqueSushi || 0;
}

function _getKnowledgeTotals() {
  return knowledgeBonusTotals(_getSushiData());
}

function _getExternalSources() {
  const _gbCtx = { abm: saveData.allBonusMulti || 1 };
  const _gb = idx => gbWith(saveData.gridLevels, saveData.shapeOverlay, idx, _gbCtx);
  const mineFloor = saveData.stateR7?.[4] || 0;
  return {
    gridBonus189: _gb(189),
    gridBonus188: _gb(188),
    arcade67: arcadeBonus(67, saveData),
    mineheadBonus11: mineFloor > 11 ? (MINEHEAD_BONUS_QTY[11] || 0) : 0,
    atom14: Number(saveData.atomsData?.[14]) || 0,
    sailing39: Number(saveData.sailingData?.[3]?.[39]) || 0,
    hasBundleV: saveData.bundlesData?.bon_v ? true : false,
    gamingSuperBit67: superBitType(67, saveData.gamingData?.[12]),
    buttonBonus2: computeButtonBonus(2, saveData),
  };
}

function _pct(n) { return n.toFixed(2) + '%'; }
function _mult(n) { return n.toFixed(3) + 'x'; }

/** Format a knowledge category description, replacing {, }, ^ with the bonus total. */
function _fmtKnDesc(catIdx, total, perLv) {
  const t = total || 0;
  const d = perLv || 0;
  const cv = s => `<span style="color:var(--cyan);font-weight:700;">${s}</span>`;
  const nv = s => `<span style="color:#5a9ea8;">${s}</span>`;
  return (KNOWLEDGE_CAT_DESC[catIdx] || '')
    .replace(/\{(.)/, (_, s) => cv(_fmt(t) + s) + (d > 0 ? ' ' + nv(`(+${_fmt(d)}${s})`) : ''))
    .replace(/\^(.)/, (_, s) => cv(_fmt(t) + s) + (d > 0 ? ' ' + nv(`(+${_fmt(d)}${s})`) : ''))
    .replace(/\}(.)/, (_, s) => cv((1 + t / 100).toFixed(2) + s) + (d > 0 ? ' ' + nv(`(+${(d / 100).toFixed(2)}${s})`) : ''));
}

/**
 * Process description placeholders for a sushi upgrade.
 * Game line 99690: { = UpgradeQTY, } = (1+qty/100) multiplier, $ = per-upgrade custom value.
 */
function _fmtDesc(upgIdx, sd, ul, kt) {
  let s = (SUSHI_UPG[upgIdx]?.[5] || '').replace(/_/g, ' ');
  const qty = upgradeQTY(upgIdx, ul);
  // { -> formatted QTY value
  s = s.replace('{', _fmt(qty));
  // } -> multiplier (1 + qty/100)
  s = s.replace('}', (1 + qty / 100).toFixed(2));

  // $ ' per-upgrade-index custom value (from game source)
  if (s.includes('$')) {
    const lv = Number(ul[upgIdx]) || 0;
    const sparks = Number(sd?.[4]?.[2]) || 0;
    const uniqueMultiIds = new Set([2, 3, 4, 5, 9, 10, 11, 12]);
    let val = '';
    if (uniqueMultiIds.has(upgIdx)) {
      val = (1 + lv / 100).toFixed(2);
    } else if (upgIdx === 1) {
      val = _fmt(fuelCapacity(ul, kt, false));
    } else if (upgIdx === 6) {
      val = String(Math.round(maxCookTier(ul) + 1));
    } else if (upgIdx === 8) {
      const fpBase = fireplaceEffectBase(kt, sparks);
      const orangeFire = computeOrangeFireSum(sd, fpBase);
      const fg = fuelGenPerHr(ul, sd, kt, orangeFire, false);
      const fc = fuelCapacity(ul, kt, false);
      val = _fmt(fg) + ' Fuel/hr. Max Cap is ' + _fmt(fc);
    } else if (upgIdx === 14) {
      val = (1 + 50 * slotEffectBase(kt) / 100).toFixed(2);
    } else if (upgIdx === 15) {
      // Cold slot: SlotEffect(2) = 40 * slotEffectBase
      val = (40 * slotEffectBase(kt)).toFixed(2);
    } else if (upgIdx === 16) {
      // Milktoast slot: SlotEffect(3) = 10 * slotEffectBase
      val = (10 * slotEffectBase(kt)).toFixed(2);
    } else if (upgIdx === 22) {
      val = saffronHrs(ul).toFixed(1);
    } else if (upgIdx === 25) {
      const sparkMulti = fireplaceEffectBase(kt, sparks);
      val = _fmt(sparks) + ' sparks - boosts fireplaces by ' + sparkMulti.toFixed(2) + 'x';
    } else if (upgIdx === 26) {
      val = (1 + fireplaceEffectByType(3, kt, sparks) / 100).toFixed(2);
    } else if (upgIdx === 27) {
      val = (1 + fireplaceEffectByType(1, kt, sparks) / 100).toFixed(2);
    } else if (upgIdx === 28) {
      const spa = Number(sd?.[4]?.[1]) || 0;
      const om = computeOvertunedMulti(sd);
      val = _fmt(spa) + ' overtuned - boosts Bucks by ' + (1 + om / 100).toFixed(2) + 'x';
    } else if (upgIdx === 29) {
      val = String(Math.round((_getUniqueSushi() || 0) - 6));
    } else if (upgIdx === 36) {
      val = (Math.round(1e4 * (1 - 1 / (1 + qty / 100))) / 100).toFixed(2);
    } else if (upgIdx === 37) {
      val = knowledgeXPBase(ul).toFixed(1);
    } else {
      val = _fmt(qty);
    }
    s = s.replace('$', val);
  }
  return s;
}

// ===== OVERVIEW SUBTAB =====

function _renderOverview() {
  const container = document.getElementById('su-overview');
  if (!container) return;

  const sd = _getSushiData();
  const ul = _getUpgLevels();
  const us = _getUniqueSushi();
  const kt = _getKnowledgeTotals();
  const ext = _getExternalSources();

  const slots = countActiveSlots(sd);
  const totalSlots = slotsOwned(ul);
  const cookTier = maxCookTier(ul);
  const bucksHr = totalBucksPerHr(sd, ul, us, kt, ext);
  const currMulti = computeCurrencyMulti(ul, sd, us, kt, ext);

  const fpBase = fireplaceEffectBase(kt, Number(sd?.[4]?.[2]) || 0);
  const orangeFire = computeOrangeFireSum(sd, fpBase);
  const fuelGen = fuelGenPerHr(ul, sd, kt, orangeFire, ext.hasBundleV);
  const fuelCap = fuelCapacity(ul, kt, ext.hasBundleV);
  const bucks = Number(sd?.[4]?.[3]) || 0;
  const sparks = Number(sd?.[4]?.[2]) || 0;

  const rLv = saveData.researchLevel || 0;

  // Count upgrade slots unlocked
  let upgradeSlots = 0;
  for (let slot = 0; slot < SLOT_TO_UPG.length; slot++) {
    if (rLv >= upgLvReq(slot) || (Number(ul[SLOT_TO_UPG[slot]]) || 0) > 0) upgradeSlots++;
  }

  // Highest tier
  let highestTier = 0;
  for (let s = 0; s < MAX_SLOTS; s++) {
    const t = Number(sd?.[0]?.[s]);
    if (t > highestTier) highestTier = t;
  }

  container.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px;margin-bottom:20px;">
      <div class="opt-card"><div style="color:var(--text2);font-size:.8em;">Unique Sushi</div><div style="font-size:1.4em;font-weight:700;color:var(--gold);">${us} / ${MAX_TIER + 1}</div></div>
      <div class="opt-card"><div style="color:var(--text2);font-size:.8em;">Active Slots</div><div style="font-size:1.4em;font-weight:700;">${slots}</div></div>
      <div class="opt-card"><div style="color:var(--text2);font-size:.8em;">Highest Tier</div><div style="font-size:1.4em;font-weight:700;color:var(--cyan);">T${highestTier + 1}</div></div>
      <div class="opt-card"><div style="color:var(--text2);font-size:.8em;">Max Cook Tier</div><div style="font-size:1.4em;font-weight:700;">T${cookTier + 1}</div></div>
      <div class="opt-card"><div style="color:var(--text2);font-size:.8em;">Bucks/hr</div><div style="font-size:1.4em;font-weight:700;color:var(--green);">${_fmt(bucksHr)}</div></div>
      <div class="opt-card"><div style="color:var(--text2);font-size:.8em;">Currency Multi</div><div style="font-size:1.4em;font-weight:700;">${_mult(currMulti)}</div></div>
      <div class="opt-card"><div style="color:var(--text2);font-size:.8em;">Fuel Gen/hr</div><div style="font-size:1.4em;font-weight:700;color:var(--accent);">${_fmt(fuelGen)}</div></div>
      <div class="opt-card"><div style="color:var(--text2);font-size:.8em;">Fuel Capacity</div><div style="font-size:1.4em;font-weight:700;">${_fmt(fuelCap)}</div></div>
      <div class="opt-card"><div style="color:var(--text2);font-size:.8em;">Bucks in Bank</div><div style="font-size:1.4em;font-weight:700;color:var(--green);">${_fmt(bucks)}</div></div>
      <div class="opt-card"><div style="color:var(--text2);font-size:.8em;">Sparks</div><div style="font-size:1.4em;font-weight:700;">${_fmt(sparks)}</div></div>
      <div class="opt-card"><div style="color:var(--text2);font-size:.8em;">RoG Unlocked</div><div style="font-size:1.4em;font-weight:700;color:var(--gold);">${Math.min(us, 50)} / 50</div></div>
      <div class="opt-card"><div style="color:var(--text2);font-size:.8em;">Upgrade Slots</div><div style="font-size:1.4em;font-weight:700;">${upgradeSlots} / 45</div></div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start;">
      <div>
        <div id="su-overview-table"></div>
      </div>
      <div>
        <h3 style="margin:0 0 8px;color:var(--text);">Tier Map</h3>
        <p style="color:var(--text2);font-size:.8em;margin-bottom:8px;">Green = discovered, Gold * = perfecto, Dark = undiscovered</p>
        <div id="su-overview-tiermap"></div>
      </div>
    </div>
  `;

  // Render sushi table visual into the overview
  _renderTable(document.getElementById('su-overview-table'));

  // Render tier map
  const tierMapEl = document.getElementById('su-overview-tiermap');
  if (tierMapEl) {
    const tiers = [];
    for (let t = 0; t <= MAX_TIER; t++) {
      const val = Number(sd?.[5]?.[t]);
      const discovered = !isNaN(val) && val >= 0 && t < us;
      const isPerfecto = val > 0;
      tiers.push({ tier: t, discovered, isPerfecto });
    }
    tierMapEl.innerHTML = `<div style="display:grid;grid-template-columns:repeat(15,32px);gap:3px;">
      ${tiers.map(t => {
        const bg = t.discovered ? (t.isPerfecto ? 'var(--gold)' : 'var(--green)') : '#333';
        const fg = t.discovered ? '#000' : '#666';
        return `<div style="height:28px;background:${bg};color:${fg};border-radius:3px;display:flex;align-items:center;justify-content:center;font-size:.7em;font-weight:700;" title="T${t.tier + 1}${t.isPerfecto ? ' *' : t.discovered ? '' : ' (locked)'}">${t.tier + 1}${t.isPerfecto ? '*' : ''}</div>`;
      }).join('')}
    </div>`;
  }
}

// ===== UPGRADES SUBTAB =====

function _renderUpgrades() {
  const container = document.getElementById('su-upgrades');
  if (!container) return;

  const sd = _getSushiData();
  const ul = _getUpgLevels();
  const us = _getUniqueSushi();
  const kt = _getKnowledgeTotals();
  const ext = _getExternalSources();

  // Forecast data
  const bucksHr = totalBucksPerHr(sd, ul, us, kt, ext);
  const bucks = Number(sd?.[4]?.[3]) || 0;
  const hasSaffron = upgradeQTY(19, ul) > 0;
  const saffHrsVal = saffronHrs(ul);
  const freeChance = freeShakerChance(ul, kt, ext.gridBonus188);
  const expectedUses = freeChance < 1 ? 1 / (1 - freeChance) : 100;
  const dailySaffron = hasSaffron ? bucksHr * saffHrsVal * expectedUses : 0;
  const dailyPassive = bucksHr * 24;
  const dailyTotal = dailyPassive + dailySaffron;

  // Build rows in unlock order (slot 0 first, slot 44 last)
  const rows = [];
  const rLv = saveData.researchLevel || 0;
  // Find the lowest resReq among still-locked upgrades (the "next" unlock)
  let nextUpgReq = Infinity;
  for (let slot = 0; slot < SLOT_TO_UPG.length; slot++) {
    const req = upgLvReq(slot);
    const lv = Number(ul[SLOT_TO_UPG[slot]]) || 0;
    const prevLv = slot > 0 ? (Number(ul[SLOT_TO_UPG[slot - 1]]) || 0) : 1;
    if ((req > rLv || prevLv === 0) && lv === 0 && req < nextUpgReq) nextUpgReq = req;
  }
  for (let slot = 0; slot < SLOT_TO_UPG.length; slot++) {
    const ui = SLOT_TO_UPG[slot];
    const upg = SUSHI_UPG[ui];
    if (!upg) continue;
    const lv = Number(ul[ui]) || 0;
    const resReq = upgLvReq(slot);
    const prevLv = slot > 0 ? (Number(ul[SLOT_TO_UPG[slot - 1]]) || 0) : 1;
    const unlocked = (rLv >= resReq && prevLv >= 1) || lv > 0;
    const hidden = !unlocked && resReq > nextUpgReq;
    const maxLv = upg[1];
    const bonus = upg[3] * lv;
    const maxed = lv >= maxLv && maxLv < 9999;
    const costNext = (unlocked && !maxed) ? upgCost(slot, ul, kt) : null;
    const deficit = costNext !== null ? costNext - bucks : null;
    const hoursNeeded = deficit !== null && deficit > 0 && bucksHr > 0 ? deficit / bucksHr : 0;
    const daysNeeded = deficit !== null && deficit > 0 && dailyTotal > 0 ? deficit / dailyTotal : 0;
    const affordable = deficit !== null && deficit <= 0;
    rows.push({ slot, ui, name: upg[0], lv, maxLv, resReq, unlocked, hidden, bonus, costNext, maxed, affordable, hoursNeeded, daysNeeded, desc: upg[5] });
  }

  container.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px;margin-bottom:16px;">
      <div class="opt-card"><div style="color:var(--text2);font-size:.8em;">Bucks in Bank</div><div style="font-size:1.3em;font-weight:700;color:var(--green);">${_fmt(bucks)}</div></div>
      <div class="opt-card"><div style="color:var(--text2);font-size:.8em;">Bucks/hr</div><div style="font-size:1.3em;font-weight:700;color:var(--green);">${_fmt(bucksHr)}</div></div>
      <div class="opt-card"><div style="color:var(--text2);font-size:.8em;">Daily Passive</div><div style="font-size:1.3em;font-weight:700;">${_fmt(dailyPassive)}</div></div>
      <div class="opt-card"><div style="color:var(--text2);font-size:.8em;">Daily Saffron</div><div style="font-size:1.3em;font-weight:700;color:var(--accent);">${_fmt(dailySaffron)}</div></div>
      <div class="opt-card"><div style="color:var(--text2);font-size:.8em;">Effective Daily</div><div style="font-size:1.3em;font-weight:700;color:var(--gold);">${_fmt(dailyTotal)}</div></div>
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
      <h3 style="color:var(--cyan);margin:0;">All Upgrades (Unlock Order)</h3>
      <label style="font-size:.8em;color:var(--text2);cursor:pointer;user-select:none;">
        <input type="checkbox" id="su-upg-spoiler" ${_showSpoilerUpg ? 'checked' : ''} style="margin-right:4px;cursor:pointer;" />Show all (spoilers)
      </label>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:.8em;">
      <thead>
        <tr style="text-align:left;color:var(--text2);border-bottom:1px solid #333;">
          <th style="padding:4px 6px;">Res Lv</th>
          <th style="padding:4px 6px;">Upgrade</th>
          <th style="padding:4px 6px;">Level</th>
          <th style="padding:4px 6px;">Bonus</th>
          <th style="padding:4px 6px;">Next Cost</th>
          <th style="padding:4px 6px;">Time</th>
          <th style="padding:4px 6px;">Description</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => {
          if (r.hidden && !_showSpoilerUpg) return `<tr style="border-bottom:1px solid #222;opacity:.3;">
            <td style="padding:3px 6px;color:var(--accent);">${r.resReq}</td>
            <td style="padding:3px 6px;font-weight:600;">???</td>
            <td style="padding:3px 6px;">--</td>
            <td style="padding:3px 6px;">--</td>
            <td style="padding:3px 6px;">--</td>
            <td style="padding:3px 6px;">--</td>
            <td style="padding:3px 6px;color:var(--text2);font-size:.9em;">???</td>
          </tr>`;
          const lockStyle = r.unlocked ? '' : 'opacity:0.4;';
          const lvColor = r.maxed ? 'color:var(--green);' : 'color:var(--cyan);';
          const lvStr = r.maxLv >= 9999 ? `${r.lv}` : `${r.lv}/${r.maxLv}`;
          const costStr = r.costNext !== null ? _fmt(r.costNext) : '--';
          let timeStr = '--';
          if (r.maxed) timeStr = '<span style="color:var(--green);">MAX</span>';
          else if (r.costNext !== null && r.affordable) timeStr = '<span style="color:var(--green);">Now</span>';
          else if (r.costNext !== null && r.daysNeeded > 0) timeStr = r.daysNeeded < 1 ? r.hoursNeeded.toFixed(1) + 'h' : r.daysNeeded.toFixed(1) + 'd';
          return `<tr style="border-bottom:1px solid #222;${lockStyle}${r.affordable ? 'background:rgba(80,200,80,.06);' : ''}">
            <td style="padding:3px 6px;color:var(--text2);">${r.resReq}</td>
            <td style="padding:3px 6px;font-weight:600;">${r.name}</td>
            <td style="padding:3px 6px;${lvColor}">${lvStr}</td>
            <td style="padding:3px 6px;color:var(--cyan);">${_fmt(r.bonus)}</td>
            <td style="padding:3px 6px;color:var(--text2);">${costStr}</td>
            <td style="padding:3px 6px;color:var(--text2);">${timeStr}</td>
            <td style="padding:3px 6px;color:var(--text2);font-size:.9em;">${_fmtDesc(r.ui, sd, ul, kt)}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  `;

  document.getElementById('su-upg-spoiler').addEventListener('change', (e) => {
    _showSpoilerUpg = e.target.checked;
    _renderUpgrades();
  });
}

// ===== CURRENCY/HR BREAKDOWN (Bucks + Fuel) =====

function _renderCurrency() {
  const container = document.getElementById('su-currency');
  if (!container) return;

  const sd = _getSushiData();
  const ul = _getUpgLevels();
  const us = _getUniqueSushi();
  const kt = _getKnowledgeTotals();
  const ext = _getExternalSources();

  // --- Bucks/hr ---
  const currMulti = computeCurrencyMulti(ul, sd, us, kt, ext);
  const totalBucks = totalBucksPerHr(sd, ul, us, kt, ext);

  const surcharge30 = upgradeQTY(30, ul);
  const surcharge31 = upgradeQTY(31, ul);
  const surcharge32 = upgradeQTY(32, ul);
  const surcharge33 = upgradeQTY(33, ul);
  const surcharge34 = upgradeQTY(34, ul);
  const surchargeSum = surcharge30 + surcharge31 + surcharge32 + surcharge33 + surcharge34;
  const uniqueMulti = Math.pow(1.1, us);
  const knBucks = kt[0] || 0;
  const overtunedMulti = computeOvertunedMulti(sd);
  const noTax40 = upgradeQTY(40, ul);
  const hourlyWage41 = upgradeQTY(41, ul);
  const tierVision43 = upgradeQTY(43, ul);
  const sailing39 = 100 * (ext.sailing39 || 0);

  const surchargeNode = _bNode('Customer Surcharges I-V', surchargeSum, [
    _bNode(label('Sushi', 30), surcharge30, null, { fmt: '%', note: `Lv ${Number(ul[30]) || 0}` }),
    _bNode(label('Sushi', 31), surcharge31, null, { fmt: '%', note: `Lv ${Number(ul[31]) || 0}` }),
    _bNode(label('Sushi', 32), surcharge32, null, { fmt: '%', note: `Lv ${Number(ul[32]) || 0}` }),
    _bNode(label('Sushi', 33), surcharge33, null, { fmt: '%', note: `Lv ${Number(ul[33]) || 0}` }),
    _bNode(label('Sushi', 34), surcharge34, null, { fmt: '%', note: `Lv ${Number(ul[34]) || 0}` }),
  ], { fmt: '%' });

  const addChildren = [
    surchargeNode,
    _bNode(label('Knowledge', 0), knBucks, null, { fmt: '%' }),
    _bNode(label('Grid', 189), ext.gridBonus189, null, { fmt: '%' }),
    _bNode(label('Sushi', 40), noTax40, null, { fmt: '%', note: `Lv ${Number(ul[40]) || 0}` }),
    _bNode(label('Sushi', 41), hourlyWage41, null, { fmt: '%', note: `Lv ${Number(ul[41]) || 0}` }),
    _bNode(label('Sushi', 43), tierVision43, null, { fmt: '%', note: `Lv ${Number(ul[43]) || 0}` }),
    _bNode('Overtuned Multi', overtunedMulti, null, { fmt: '%' }),
    _bNode(label('Artifact', 39), sailing39, null, { fmt: '%' }),
  ];
  const addSum = surchargeSum + knBucks + ext.gridBonus189 + noTax40 + hourlyWage41 + tierVision43 + overtunedMulti + sailing39;

  const multiTree = _bNode('Currency Multiplier', currMulti, [
    _bNode(label('Arcade', 67), 1 + ext.arcade67 / 100, null, { fmt: 'x' }),
    _bNode('1.1^UniqueSushi (' + us + ')', uniqueMulti, null, { fmt: 'x' }),
    _bNode(label('Bundle', 'V'), ext.hasBundleV ? 2 : 1, null, { fmt: 'x', note: ext.hasBundleV ? 'Owned' : 'Not owned' }),
    _bNode('Customer Surcharges', 1 + surchargeSum / 100, [
      surchargeNode,
      _bNode(label('Super Bit', 67), ext.gamingSuperBit67 * 100, null, { fmt: '%' }),
    ], { fmt: 'x' }),
    _bNode(label('Knowledge', 0), 1 + knBucks / 100, null, { fmt: 'x' }),
    _bNode(label('Grid', 189), 1 + ext.gridBonus189 / 100, null, { fmt: 'x' }),
    _bNode(label('Sushi', 40), 1 + noTax40 / 100, null, { fmt: 'x', note: `Lv ${Number(ul[40]) || 0}` }),
    _bNode(label('Minehead Floor', 11), Math.max(1, Math.min(1.25, 1 + ext.mineheadBonus11 / 100)), null, { fmt: 'x' }),
    _bNode('Hourly Wage + Tier Vision', 1 + (hourlyWage41 + tierVision43) / 100, null, { fmt: 'x' }),
    _bNode('Overtuned Multi', 1 + overtunedMulti / 100, null, { fmt: 'x' }),
    _bNode(label('Button', 2), 1 + (ext.buttonBonus2 || 0) / 100, null, { fmt: 'x' }),
    _bNode(label('Atom', 14), 1 + ext.atom14 / 100, null, { fmt: 'x' }),
    _bNode(label('Artifact', 39), 1 + sailing39 / 100, null, { fmt: 'x' }),
  ], { fmt: 'x' });

  const slotBucks = [];
  for (let s = 0; s < MAX_SLOTS; s++) {
    const b = currencyPerSlot(s, sd, currMulti, kt);
    if (b > 0) slotBucks.push({ slot: s, tier: Number(sd?.[0]?.[s]) || 0, bucks: b });
  }
  slotBucks.sort((a, b) => b.bucks - a.bucks);

  const topSlotChildren = slotBucks.slice(0, 15).map(s =>
    _bNode('#' + s.slot + ' (T' + (s.tier + 1) + ')', s.bucks, null, {
      fmt: '/hr',
      note: totalBucks > 0 ? (100 * s.bucks / totalBucks).toFixed(1) + '% of total' : '',
    })
  );
  if (slotBucks.length > 15) {
    const rest = slotBucks.slice(15).reduce((a, s) => a + s.bucks, 0);
    topSlotChildren.push(_bNode('Other (' + (slotBucks.length - 15) + ' slots)', rest, null, { fmt: '/hr' }));
  }

  const bucksTree = _bNode('Bucks/hr', totalBucks, [
    multiTree,
    _bNode('Per-Slot Totals (' + slotBucks.length + ' active)', totalBucks, topSlotChildren, { fmt: '/hr' }),
  ], { fmt: '/hr' });

  // --- Fuel ---
  const fpBase = fireplaceEffectBase(kt, Number(sd?.[4]?.[2]) || 0);
  const orangeFire = computeOrangeFireSum(sd, fpBase);
  const fuelGen = fuelGenPerHr(ul, sd, kt, orangeFire, ext.hasBundleV);
  const fuelCap = fuelCapacity(ul, kt, ext.hasBundleV);

  const fb8  = upgradeQTY(8, ul);
  const fb9  = upgradeQTY(9, ul);
  const fb10 = upgradeQTY(10, ul);
  const fb11 = upgradeQTY(11, ul);
  const fb12 = upgradeQTY(12, ul);
  const upgFuel = fb8 + fb9 + fb10 + fb11 + fb12;
  const knFuel = kt[4] || 0;
  const knSpec27 = knowledgeBonusSpecific(27, sd);
  const knSpec36 = knowledgeBonusSpecific(36, sd);
  const knSpec45 = knowledgeBonusSpecific(45, sd);
  const fbMulti9  = 1 + (Number(ul[9]) || 0) / 100;
  const fbMulti10 = 1 + (Number(ul[10]) || 0) / 100;
  const fbMulti11 = 1 + (Number(ul[11]) || 0) / 100;
  const fbMulti12 = 1 + (Number(ul[12]) || 0) / 100;
  const fbUniqueMulti = fbMulti9 * fbMulti10 * fbMulti11 * fbMulti12;

  const fc1 = upgradeQTY(1, ul);
  const fc2 = upgradeQTY(2, ul);
  const fc3 = upgradeQTY(3, ul);
  const fc4 = upgradeQTY(4, ul);
  const fc5 = upgradeQTY(5, ul);
  const upgCapSum = fc1 + fc2 + fc3 + fc4 + fc5;
  const knCap = kt[3] || 0;
  const fcMulti2 = 1 + (Number(ul[2]) || 0) / 100;
  const fcMulti3 = 1 + (Number(ul[3]) || 0) / 100;
  const fcMulti4 = 1 + (Number(ul[4]) || 0) / 100;
  const fcMulti5 = 1 + (Number(ul[5]) || 0) / 100;
  const fcUniqueMulti = fcMulti2 * fcMulti3 * fcMulti4 * fcMulti5;

  const genTree = _bNode('Fuel Gen/hr', fuelGen, [
    _bNode('Base', 50, null),
    _bNode('Fastburn Fuel I-V', 1 + upgFuel / 100, [
      _bNode(label('Sushi', 8), fb8, null, { fmt: '%', note: `Lv ${Number(ul[8]) || 0}` }),
      _bNode(label('Sushi', 9), fb9, null, { fmt: '%', note: `Lv ${Number(ul[9]) || 0}` }),
      _bNode(label('Sushi', 10), fb10, null, { fmt: '%', note: `Lv ${Number(ul[10]) || 0}` }),
      _bNode(label('Sushi', 11), fb11, null, { fmt: '%', note: `Lv ${Number(ul[11]) || 0}` }),
      _bNode(label('Sushi', 12), fb12, null, { fmt: '%', note: `Lv ${Number(ul[12]) || 0}` }),
    ], { fmt: 'x' }),
    _bNode('Orange Fire Sum', 1 + orangeFire / 100, null, { fmt: 'x', note: `+${orangeFire.toFixed(1)}% from red fireplaces` }),
    _bNode(label('Knowledge', 4), 1 + knFuel / 100, null, { fmt: 'x' }),
    _bNode('Knowledge Tier 27 (specific)', 1 + knSpec27 / 100, null, { fmt: 'x' }),
    _bNode('Knowledge Tier 36 (specific)', 1 + knSpec36 / 100, null, { fmt: 'x' }),
    _bNode('Knowledge Tier 45 (specific)', 1 + knSpec45 / 100, null, { fmt: 'x' }),
    _bNode('Fastburn II-V Unique Multi', fbUniqueMulti, [
      _bNode('FB II unique', fbMulti9, null, { fmt: 'x', note: `Lv ${Number(ul[9]) || 0}` }),
      _bNode('FB III unique', fbMulti10, null, { fmt: 'x', note: `Lv ${Number(ul[10]) || 0}` }),
      _bNode('FB IV unique', fbMulti11, null, { fmt: 'x', note: `Lv ${Number(ul[11]) || 0}` }),
      _bNode('FB V unique', fbMulti12, null, { fmt: 'x', note: `Lv ${Number(ul[12]) || 0}` }),
    ], { fmt: 'x' }),
    _bNode(label('Bundle', 'V'), ext.hasBundleV ? 2 : 1, null, { fmt: 'x', note: ext.hasBundleV ? 'Owned' : 'Not owned' }),
  ], { fmt: '/hr' });

  const capTree = _bNode('Fuel Capacity', fuelCap, [
    _bNode('Base', 200, null),
    _bNode(label('Knowledge', 3), knCap, null, { fmt: '+' }),
    _bNode('Fuel Cap I-V', 1 + upgCapSum / 100, [
      _bNode(label('Sushi', 1), fc1, null, { fmt: '%', note: `Lv ${Number(ul[1]) || 0}` }),
      _bNode(label('Sushi', 2), fc2, null, { fmt: '%', note: `Lv ${Number(ul[2]) || 0}` }),
      _bNode(label('Sushi', 3), fc3, null, { fmt: '%', note: `Lv ${Number(ul[3]) || 0}` }),
      _bNode(label('Sushi', 4), fc4, null, { fmt: '%', note: `Lv ${Number(ul[4]) || 0}` }),
      _bNode(label('Sushi', 5), fc5, null, { fmt: '%', note: `Lv ${Number(ul[5]) || 0}` }),
    ], { fmt: 'x' }),
    _bNode('Fuel Cap II-V Unique Multi', fcUniqueMulti, [
      _bNode('FC II unique', fcMulti2, null, { fmt: 'x', note: `Lv ${Number(ul[2]) || 0}` }),
      _bNode('FC III unique', fcMulti3, null, { fmt: 'x', note: `Lv ${Number(ul[3]) || 0}` }),
      _bNode('FC IV unique', fcMulti4, null, { fmt: 'x', note: `Lv ${Number(ul[4]) || 0}` }),
      _bNode('FC V unique', fcMulti5, null, { fmt: 'x', note: `Lv ${Number(ul[5]) || 0}` }),
    ], { fmt: 'x' }),
    _bNode(label('Bundle', 'V'), ext.hasBundleV ? 2 : 1, null, { fmt: 'x', note: ext.hasBundleV ? 'Owned' : 'Not owned' }),
  ]);

  const fillHrs = fuelGen > 0 ? fuelCap / fuelGen : Infinity;

  container.innerHTML = `
    <h3 style="color:var(--cyan);margin-bottom:12px;">Currency/hr Breakdown</h3>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px;margin-bottom:16px;">
      <div class="opt-card"><div style="color:var(--text2);font-size:.8em;">Bucks/hr</div><div style="font-size:1.3em;font-weight:700;color:var(--green);">${_fmt(totalBucks)}</div></div>
      <div class="opt-card"><div style="color:var(--text2);font-size:.8em;">Fuel Gen/hr</div><div style="font-size:1.3em;font-weight:700;color:var(--accent);">${_fmt(fuelGen)}</div></div>
      <div class="opt-card"><div style="color:var(--text2);font-size:.8em;">Fuel Capacity</div><div style="font-size:1.3em;font-weight:700;">${_fmt(fuelCap)}</div></div>
      <div class="opt-card"><div style="color:var(--text2);font-size:.8em;">Time to Fill</div><div style="font-size:1.3em;font-weight:700;color:var(--text2);">${fillHrs < Infinity ? fillHrs.toFixed(1) + 'h' : '--'}</div></div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;align-items:start;">
      <div>
        <h4 style="color:var(--text);margin:0 0 8px;">Bucks/hr</h4>
        <div id="su-curr-bucks-tree"></div>
      </div>
      <div>
        <h4 style="color:var(--text);margin:0 0 8px;">Fuel Generation</h4>
        <div id="su-curr-fuel-gen-tree"></div>
      </div>
      <div>
        <h4 style="color:var(--text);margin:0 0 8px;">Fuel Capacity</h4>
        <div id="su-curr-fuel-cap-tree"></div>
      </div>
    </div>
  `;

  const bEl = document.getElementById('su-curr-bucks-tree');
  if (bEl) renderBreakdownTree(bucksTree, bEl);
  const genEl = document.getElementById('su-curr-fuel-gen-tree');
  if (genEl) renderBreakdownTree(genTree, genEl);
  const capEl = document.getElementById('su-curr-fuel-cap-tree');
  if (capEl) renderBreakdownTree(capTree, capEl);
}

// ===== BEST UPGRADE (Bucks + Fuel Gen + Fuel Cap) =====

function _renderBestUpgrade() {
  const container = document.getElementById('su-best-upg');
  if (!container) return;

  const sd = _getSushiData();
  const ul = _getUpgLevels();
  const us = _getUniqueSushi();
  const kt = _getKnowledgeTotals();
  const ext = _getExternalSources();

  const currentBucks = totalBucksPerHr(sd, ul, us, kt, ext);
  const fpBase = fireplaceEffectBase(kt, Number(sd?.[4]?.[2]) || 0);
  const orangeFire = computeOrangeFireSum(sd, fpBase);
  const currentFuelGen = fuelGenPerHr(ul, sd, kt, orangeFire, ext.hasBundleV);
  const currentFuelCap = fuelCapacity(ul, kt, ext.hasBundleV);

  const fuelGenIds = new Set([8, 9, 10, 11, 12]);
  const fuelCapIds = new Set([1, 2, 3, 4, 5]);

  const bucksCandidates = [];
  const fuelCandidates = [];
  const rLv = saveData.researchLevel || 0;

  for (let slot = 0; slot < SLOT_TO_UPG.length; slot++) {
    const ui = SLOT_TO_UPG[slot];
    const upg = SUSHI_UPG[ui];
    if (!upg) continue;
    const resReq = upgLvReq(slot);
    const lv = Number(ul[ui]) || 0;
    const prevLv = slot > 0 ? (Number(ul[SLOT_TO_UPG[slot - 1]]) || 0) : 1;
    if ((rLv < resReq || prevLv === 0) && lv === 0) continue;
    const maxLv = upg[1];
    if (lv >= maxLv && maxLv < 9999) continue;

    const simUl = (ul.length ? [...ul] : []);
    while (simUl.length <= ui) simUl.push(0);
    simUl[ui] = lv + 1;
    const simKt = knowledgeBonusTotals(sd);
    const cost = upgCost(slot, ul, kt);

    // Bucks/hr gain
    const newBucks = totalBucksPerHr(sd, simUl, us, simKt, ext);
    const bucksGain = newBucks - currentBucks;
    const bucksEff = cost > 0 ? bucksGain / cost : 0;
    bucksCandidates.push({ slot, ui, name: upg[0], lv, gain: bucksGain, cost, efficiency: bucksEff });

    // Fuel gen/cap gain (only for fuel-related upgrades)
    if (fuelGenIds.has(ui) || fuelCapIds.has(ui)) {
      const simFpBase = fireplaceEffectBase(simKt, Number(sd?.[4]?.[2]) || 0);
      const simOrange = computeOrangeFireSum(sd, simFpBase);
      let gain, label;
      if (fuelCapIds.has(ui)) {
        gain = fuelCapacity(simUl, simKt, ext.hasBundleV) - currentFuelCap;
        label = 'cap';
      } else {
        gain = fuelGenPerHr(simUl, sd, simKt, simOrange, ext.hasBundleV) - currentFuelGen;
        label = 'gen';
      }
      const eff = cost > 0 ? gain / cost : 0;
      fuelCandidates.push({ slot, ui, name: upg[0], lv, gain, cost, efficiency: eff, label });
    }
  }

  bucksCandidates.sort((a, b) => b.efficiency - a.efficiency);
  const fuelGenCandidates = fuelCandidates.filter(c => c.label === 'gen').sort((a, b) => b.efficiency - a.efficiency);
  const fuelCapCandidates = fuelCandidates.filter(c => c.label === 'cap').sort((a, b) => b.efficiency - a.efficiency);

  // --- Affordable Upgrade Paths (greedy by efficiency) ---
  const bucks = Number(sd?.[4]?.[3]) || 0;

  const _computePath = (budget, filterUis, metricFn) => {
    const simUl = [];
    for (let i = 0; i < Math.max(ul.length, 45); i++) simUl[i] = Number(ul[i]) || 0;
    let remaining = budget;
    const purchases = [];

    for (let step = 0; step < 50 && remaining > 0; step++) {
      const baseline = metricFn(simUl);
      let best = null;
      for (let slot = 0; slot < SLOT_TO_UPG.length; slot++) {
        const ui = SLOT_TO_UPG[slot];
        if (filterUis && !filterUis.has(ui)) continue;
        const upg = SUSHI_UPG[ui];
        if (!upg) continue;
        const lv = simUl[ui] || 0;
        const maxLv = upg[1];
        if (lv >= maxLv && maxLv < 9999) continue;
        if (rLv < upgLvReq(slot) && lv === 0) continue;
        const prevLv = slot > 0 ? (simUl[SLOT_TO_UPG[slot - 1]] || 0) : 1;
        if (prevLv === 0 && lv === 0) continue;

        const cost = upgCost(slot, simUl, kt);
        if (cost > remaining || cost <= 0) continue;

        const simUl2 = [...simUl];
        simUl2[ui] = lv + 1;
        const gain = metricFn(simUl2) - baseline;
        if (gain <= 0) continue;
        const eff = gain / cost;
        if (!best || eff > best.eff) {
          best = { slot, ui, name: upg[0], cost, eff, newLv: lv + 1 };
        }
      }
      if (!best) break;
      remaining -= best.cost;
      simUl[best.ui] = best.newLv;
      purchases.push(best);
    }

    // Consolidate by upgrade: fromLv ' toLv
    const grouped = new Map();
    let totalSpent = 0;
    for (const p of purchases) {
      totalSpent += p.cost;
      if (!grouped.has(p.ui)) {
        grouped.set(p.ui, { name: p.name, fromLv: p.newLv - 1, toLv: p.newLv, totalCost: p.cost });
      } else {
        const g = grouped.get(p.ui);
        g.toLv = p.newLv;
        g.totalCost += p.cost;
      }
    }
    const totalGain = metricFn(simUl) - metricFn(ul);
    return { path: [...grouped.values()], totalSpent, remaining, steps: purchases.length, totalGain };
  };

  const metricBucks = (simUl) => totalBucksPerHr(sd, simUl, us, kt, ext);
  const metricFuelGen = (simUl) => fuelGenPerHr(simUl, sd, kt, orangeFire, ext.hasBundleV);
  const metricFuelCap = (simUl) => fuelCapacity(simUl, kt, ext.hasBundleV);

  const pathBucks = _computePath(bucks, null, metricBucks);
  const pathFuelGen = _computePath(bucks, fuelGenIds, metricFuelGen);
  const pathFuelCap = _computePath(bucks, fuelCapIds, metricFuelCap);

  const _pathHtml = (pr) => {
    if (pr.steps === 0) return `<div style="font-size:.75em;color:var(--text2);margin-bottom:8px;">No affordable upgrades.</div>`;
    return `<div style="background:var(--bg2);border-radius:6px;padding:6px 8px;margin-bottom:10px;">
      <div style="font-size:.72em;color:var(--text2);margin-bottom:4px;">
        Upgrade Path: <b>${pr.steps}</b> buys, <b style="color:var(--accent);">${_fmt(pr.totalSpent)}</b> spent, <b>${_fmt(pr.remaining)}</b> left
        ${pr.totalGain ? `<br>Total Gain: <b style="color:var(--green);">+${_fmt(pr.totalGain)}</b>` : ''}
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:.72em;">
        <thead><tr style="color:var(--text2);border-bottom:1px solid #333;">
          <th style="text-align:left;padding:2px 4px;">Upgrade</th>
          <th style="text-align:center;padding:2px 4px;">Level</th>
          <th style="text-align:right;padding:2px 4px;">Cost</th>
        </tr></thead>
        <tbody>${pr.path.map(p => `<tr style="border-bottom:1px solid #222;">
          <td style="padding:2px 4px;">${p.name}</td>
          <td style="text-align:center;padding:2px 4px;color:var(--cyan);">${p.fromLv} -> ${p.toLv}</td>
          <td style="text-align:right;padding:2px 4px;color:var(--text2);">${_fmt(p.totalCost)}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>`;
  };

  // --- Efficiency ranking tables ---
  const _upgTbl = (rows, gainColor) => rows.slice(0, 25).map((c, i) => `<tr style="border-bottom:1px solid #222;${i === 0 ? 'background:var(--bg3);' : ''}">
    <td style="padding:3px 4px;color:var(--text2);">${i + 1}</td>
    <td style="padding:3px 4px;font-weight:600;">${c.name}</td>
    <td style="padding:3px 4px;color:var(--cyan);">${c.lv}</td>
    <td style="padding:3px 4px;color:var(--text2);">${_fmt(c.cost)}</td>
    <td style="padding:3px 4px;color:var(${gainColor});">+${_fmt(c.gain)}</td>
    <td style="padding:3px 4px;color:var(--cyan);">${c.efficiency > 0 ? c.efficiency.toExponential(2) : '--'}</td>
  </tr>`).join('');

  const _upgHead = `<thead><tr style="text-align:left;color:var(--text2);border-bottom:1px solid #333;">
    <th style="padding:4px 4px;">#</th><th style="padding:4px 4px;">Upgrade</th><th style="padding:4px 4px;">Lvl</th>
    <th style="padding:4px 4px;">Cost</th><th style="padding:4px 4px;">Gain</th><th style="padding:4px 4px;">Eff.</th>
  </tr></thead>`;

  container.innerHTML = `
    <h3 style="color:var(--cyan);margin-bottom:12px;">Best Upgrade</h3>
    <p style="color:var(--text2);font-size:.85em;margin-bottom:16px;">
      Current: <span style="color:var(--green);font-weight:700;">${_fmt(currentBucks)} Bucks/hr</span> &nbsp;|&nbsp;
      <span style="color:var(--accent);font-weight:700;">${_fmt(currentFuelGen)} Fuel/hr</span> &nbsp;|&nbsp;
      <span style="font-weight:700;">${_fmt(currentFuelCap)} Fuel Cap</span>
      &nbsp;|&nbsp; <span style="color:var(--gold);font-weight:700;">${_fmt(bucks)} Bucks</span>
    </p>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;align-items:start;">
      <div>
        <h4 style="color:var(--text);margin:0 0 8px;">Bucks/hr</h4>
        ${_pathHtml(pathBucks)}
        <table style="width:100%;border-collapse:collapse;font-size:.8em;">${_upgHead}<tbody>${_upgTbl(bucksCandidates, '--green')}</tbody></table>
      </div>
      <div>
        <h4 style="color:var(--text);margin:0 0 8px;">Fuel/hr</h4>
        ${_pathHtml(pathFuelGen)}
        <table style="width:100%;border-collapse:collapse;font-size:.8em;">${_upgHead}<tbody>${_upgTbl(fuelGenCandidates, '--accent')}</tbody></table>
      </div>
      <div>
        <h4 style="color:var(--text);margin:0 0 8px;">Fuel Cap</h4>
        ${_pathHtml(pathFuelCap)}
        <table style="width:100%;border-collapse:collapse;font-size:.8em;">${_upgHead}<tbody>${_upgTbl(fuelCapCandidates, '--cyan')}</tbody></table>
      </div>
    </div>
  `;
}

// ===== SUSHI TAB (Knowledge + Optimizer + RoG Unlocks) =====

function _renderSushi() {
  const container = document.getElementById('su-sushi');
  if (!container) return;

  const sd = _getSushiData();
  const ul = _getUpgLevels();
  const us = _getUniqueSushi();
  const kt = _getKnowledgeTotals();

  // --- Knowledge Totals (compact) ---
  const ktHtml = `
    <div>
      <h3 style="margin:0 0 8px;color:var(--text);font-size:.95em;">Knowledge Totals</h3>
      <table style="width:100%;border-collapse:collapse;font-size:.82em;">
        <tr style="border-bottom:1px solid #444;">
          <th style="text-align:left;padding:3px 6px;">Category</th>
        </tr>
        ${kt.map((v, i) => `<tr style="border-bottom:1px solid #333;">
          <td style="padding:3px 6px;">${_fmtKnDesc(i, v)}</td>
        </tr>`).join('')}
      </table>
    </div>`;

  // --- Combined Sushi Tier Table (knowledge + RoG + perfecto chance) ---
  const tierRows = [];
  const rogLen = ROG_VALUES.length;
  const maxT = Math.max(MAX_TIER, rogLen - 1);
  for (let t = 0; t <= maxT; t++) {
    const discovered = (Number(sd?.[5]?.[t]) || 0) >= 0 && t < us;
    const knLv = Number(sd?.[7]?.[t]) || 0;
    const cat = TIER_TO_KNOWLEDGE_CAT[t];
    const knBonus = knowledgeBonusSpecific(t, sd);
    const isPerfecto = (Number(sd?.[5]?.[t]) || 0) > 0;
    const discoveryMult = Math.min(2, 1 + (Number(sd?.[5]?.[t]) || 0));
    const baseVal = KNOWLEDGE_CAT_VALUE[cat] || 0;
    const knNext = discovered ? baseVal * discoveryMult * (1 + t / 30) : 0;
    const perfChance = !isPerfecto && discovered ? perfectoOdds(t, kt) : -1;
    const rogUnlocked = us > t;
    const rogIsNext = t === us;
    const rogVal = t < rogLen ? ROG_VALUES[t] : 0;
    const rogDesc = t < rogLen
      ? (ROG_DESC[t] || '').replace('{', String(rogVal)).replace('}', (1 + rogVal / 100).toFixed(2))
      : '';
    tierRows.push({ t, discovered, knLv, cat, knBonus, knNext, isPerfecto, perfChance, rogUnlocked, rogIsNext, rogVal, rogDesc });
  }

  const tierHtml = `
    <div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <h3 style="margin:0;color:var(--text);font-size:.95em;">Sushi Tiers</h3>
        <label style="font-size:.75em;color:var(--text2);cursor:pointer;user-select:none;white-space:nowrap;">
          <input type="checkbox" id="su-rog-spoiler" ${_showSpoilerRoG ? 'checked' : ''} style="margin-right:3px;cursor:pointer;" />Show all (spoilers)
        </label>
      </div>
      <p style="color:var(--text2);font-size:.78em;margin-bottom:8px;">* = Perfecto (2x knowledge). You have <b style="color:var(--gold);">${us}</b> unique sushi.</p>
      <table style="width:100%;border-collapse:collapse;font-size:.78em;">
        <thead><tr style="border-bottom:2px solid #555;">
          <th style="text-align:left;padding:3px 4px;">Tier</th>
          <th style="text-align:right;padding:3px 4px;">Perfecto</th>
          <th style="text-align:right;padding:3px 4px;">KnLv</th>
          <th style="text-align:left;padding:3px 4px;">Kn Bonus</th>
          <th style="text-align:left;padding:3px 4px;">RoG Reward</th>
        </tr></thead>
        <tbody>
        ${tierRows.map(r => {
          const hidden = !r.rogUnlocked && !r.rogIsNext && !r.discovered;
          if (hidden && !_showSpoilerRoG) return `<tr style="border-bottom:1px solid #222;opacity:.25;">
            <td style="padding:2px 4px;color:var(--text2);">T${r.t + 1}</td>
            <td style="text-align:right;padding:2px 4px;">--</td>
            <td style="text-align:right;padding:2px 4px;">--</td>
            <td style="padding:2px 4px;">--</td>
            <td style="padding:2px 4px;">???</td>
          </tr>`;
          const rowOpacity = !r.discovered && !r.rogUnlocked ? 'opacity:.4;' : r.rogVal === 0 && !r.discovered ? 'opacity:.35;' : '';
          const perfCell = r.isPerfecto ? '<span style="color:var(--gold);">*</span>'
            : r.perfChance > 0 ? `<span style="color:var(--text2);">1 in ${Math.round(1 / r.perfChance).toLocaleString()}</span>` : '';
          return `<tr style="border-bottom:1px solid #222;${rowOpacity}">
            <td style="padding:2px 4px;color:var(--text2);font-weight:600;">T${r.t + 1}</td>
            <td style="text-align:right;padding:2px 4px;">${perfCell}</td>
            <td style="text-align:right;padding:2px 4px;">${r.discovered ? r.knLv : '--'}</td>
            <td style="padding:2px 4px;">${r.discovered ? _fmtKnDesc(r.cat, r.knBonus, r.knNext) : '--'}</td>
            <td style="padding:2px 4px;font-size:.92em;">${r.rogDesc || '--'}</td>
          </tr>`;
        }).join('')}
        </tbody>
      </table>
    </div>`;

  container.innerHTML = `
    <div style="display:grid;grid-template-columns:2fr 1fr;gap:16px;align-items:start;margin-bottom:20px;">
      ${tierHtml}
      ${ktHtml}
    </div>
  `;

  document.getElementById('su-rog-spoiler').addEventListener('change', (e) => {
    _showSpoilerRoG = e.target.checked;
    _renderSushi();
  });
}

// ===== SUSHI TABLE VISUAL =====

const _FIRE_COLORS = { 0: '#c44', 1: '#4c4', 2: '#66f', 3: '#e6e' };
const _FIRE_NAMES  = { 0: 'Red', 1: 'Green', 2: 'Blue', 3: 'Pink' };
const _GRID_COLS = 15;
const _GRID_ROWS = 8;
// Tile colors matching game SushiSlot0-3.png appearance
const _SLOT_BG = {
  0: '#2b4a2b',  // dark olive green (normal)
  1: '#5c2020',  // dark red/maroon (hot  - " +bucks)
  2: '#1f3a50',  // dark teal-blue (cold  - " knowledge XP)
  3: '#4a4020',  // dark gold/cream (milktoast  - " +fuel)
};
const _SLOT_BORDER = {
  0: '#3a6a3a',
  1: '#7a3030',
  2: '#2a5570',
  3: '#6a6030',
};
const _SLOT_NAMES = { 0: 'Normal', 1: 'Hot', 2: 'Cold', 3: 'Milktoast' };

function _renderTable(target) {
  const container = target || document.getElementById('su-table');
  if (!container) return;

  const sd = _getSushiData();
  const ul = _getUpgLevels();
  const us = _getUniqueSushi();
  const kt = _getKnowledgeTotals();
  const ext = _getExternalSources();
  const currMulti = computeCurrencyMulti(ul, sd, us, kt, ext);
  const bucksHr = totalBucksPerHr(sd, ul, us, kt, ext);
  const cook = maxCookTier(ul);

  // Build grid cells (15 cols x 8 rows = 120 slots)
  let cells = '';
  for (let r = 0; r < _GRID_ROWS; r++) {
    for (let c = 0; c < _GRID_COLS; c++) {
      const s = r * _GRID_COLS + c;
      const slotType = Number(sd?.[1]?.[s]);
      const unlocked = !isNaN(slotType) && slotType >= 0;
      const tier = Number(sd?.[0]?.[s]);
      const hasSushi = !isNaN(tier) && tier >= 0;
      const isPerfecto = hasSushi && (Number(sd?.[5]?.[tier]) || 0) > 0;

      if (!unlocked) {
        // Locked / non-existent slot  - " transparent gap
        cells += `<div style="aspect-ratio:1;"></div>`;
        continue;
      }

      // Slot tile colors based on slot type (Sushi[1][slot])
      const bg = _SLOT_BG[slotType] || _SLOT_BG[0];
      const border = _SLOT_BORDER[slotType] || _SLOT_BORDER[0];
      const typeName = _SLOT_NAMES[slotType] || 'Normal';

      // If sushi is cooking, show it brighter with tier overlay
      const bucks = hasSushi ? currencyPerSlot(s, sd, currMulti, kt) : 0;
      const brighten = hasSushi ? 'filter:brightness(1.3);' : '';
      const goldBorder = isPerfecto ? 'box-shadow:inset 0 0 0 2px #c8a83e;' : '';

      // Sushi tier overlay
      let overlay = '';
      if (hasSushi) {
        overlay = `<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;">
          <div style="font-weight:800;font-size:.85em;color:#fff;text-shadow:0 1px 2px #000;">${tier + 1}</div>
          ${isPerfecto ? '<div style="color:#c8a83e;font-size:.55em;line-height:1;">*</div>' : ''}
        </div>`;
      }

      const title = hasSushi
        ? `Slot ${s} | T${tier + 1}${isPerfecto ? ' *' : ''} | ${typeName} | ${_fmt(bucks)}/hr`
        : `Slot ${s} | ${typeName} (empty)`;

      cells += `<div style="position:relative;aspect-ratio:1;background:${bg};border:2px solid ${border};border-radius:3px;${brighten}${goldBorder}" title="${title}">${overlay}</div>`;
    }
  }

  // Fireplace row (15 columns  - " one per column)
  let fireRow = '';
  for (let c = 0; c < _GRID_COLS; c++) {
    const ft = Number(sd?.[3]?.[c]);
    const active = !isNaN(ft) && ft >= 0;
    if (active) {
      const fireCol = _FIRE_COLORS[ft] || '#c44';
      fireRow += `<div style="aspect-ratio:1;display:flex;align-items:center;justify-content:center;" title="Col ${c}: ${_FIRE_NAMES[ft] || 'Red'} fire">
        <span style="font-size:1.4em;filter:drop-shadow(0 0 3px ${fireCol});">*</span>
      </div>`;
    } else {
      fireRow += `<div style="aspect-ratio:1;"></div>`;
    }
  }

  // Legend
  const slotLeg = Object.entries(_SLOT_BG).map(([t, col]) =>
    `<span style="display:inline-flex;align-items:center;gap:3px;margin-right:10px;"><span style="display:inline-block;width:14px;height:14px;background:${col};border:1px solid ${_SLOT_BORDER[t]};border-radius:2px;"></span><span style="font-size:.75em;">${_SLOT_NAMES[t]}</span></span>`
  ).join('');
  const fireLeg = Object.entries(_FIRE_COLORS).map(([t, col]) =>
    `<span style="display:inline-flex;align-items:center;gap:3px;margin-right:10px;"><span style="display:inline-block;width:10px;height:10px;background:${col};border-radius:50%;"></span><span style="font-size:.75em;">${_FIRE_NAMES[t]}</span></span>`
  ).join('');

  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
      <h3 style="margin:0;color:var(--text);">Sushi Table</h3>
      <div style="display:flex;align-items:center;gap:16px;">
        <span style="font-size:.85em;color:var(--text2);">Max Cook Tier: <b style="color:var(--text);">${cook}</b></span>
        <span style="font-size:.85em;background:#1a3a1a;padding:3px 10px;border-radius:4px;color:var(--green);font-weight:700;">$ ${_fmt(bucksHr)}/hr</span>
      </div>
    </div>
    <div style="margin-bottom:6px;">${slotLeg}</div>
    <div style="margin-bottom:10px;">* ${fireLeg} <span style="font-size:.7em;color:var(--text2);margin-left:6px;">Gold border = Perfecto</span></div>
    <div style="background:#0d1a14;padding:12px;border-radius:8px;border:1px solid #2a4a2a;display:inline-block;">
      <div style="display:grid;grid-template-columns:repeat(${_GRID_COLS},36px);gap:2px;">
        ${cells}
      </div>
      <div style="display:grid;grid-template-columns:repeat(${_GRID_COLS},36px);gap:2px;margin-top:4px;">
        ${fireRow}
      </div>
    </div>
  `;
}


