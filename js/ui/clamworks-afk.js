import { characterOptions, normalizeCombatSetup } from '../stats/systems/common/combat-sim-setup.js';
import { readCombatDraft, readCombatLoadouts } from './combat-sim-loadouts.js';
import { farmingEscape as esc, farmingFormat as fmt } from './combat-farming.js';
import { iconHtml, loadUiAssets, installIconFallback } from './combat-sim-picker.js';
import { buildClamworksAfkPlan, summarizeClamworksAfk } from '../stats/systems/w7/clamworks-combat.js';

const chance = p => p === 0 ? '0%' : p === 1 ? '100%' : p > 0.9999 ? '>99.99%' : p < 0.0001 ? '1 in ' + fmt(1 / p) : (p * 100).toFixed(2) + '%';
const quantity = n => n > 0 && n < 0.01 ? n.toExponential(2) : fmt(n);

export function mountClamworksAfk(host, { compareUpgrades = false, workerFactory = () => new Worker(new URL('../workers/combat-afk-worker.js', import.meta.url), { type: 'module' }) } = {}) {
  let raw = null, ci = 0, loadouts = [], worker = null, serial = 0, result = null, captured = null, stale = false, error = '', status = '';
  let comparisonPlan = null, records = [];
  const state = { loadout: 'imported', hours: 8, phase: 'entry' };
  host.className = 'section cw-combat';
  host.innerHTML = '<h2>' + (compareUpgrades ? 'AFK upgrade comparison' : 'AFK claim') + '</h2><div data-caf-controls></div>'
    + '<p class="cw-note">' + (compareUpgrades ? 'Compares your current loadout with each unlocked productive upgrade at +1 level, using the native AFK claim and replacement-reroll distributions. ' : '')
    + 'One ordinary AFK claim on Clamworks. Rerolls replace that claim; they do not add another payout. Time Candy cannot be used here.</p>'
    + '<div class="cw-actions"><button type="button" data-caf-run>' + (compareUpgrades ? 'Compare AFK gains' : 'Calculate claim') + '</button><button type="button" data-caf-cancel disabled>Cancel</button></div>'
    + '<div data-caf-status role="status" aria-live="polite"></div><div data-caf-result></div>';
  const controls = host.querySelector('[data-caf-controls]'), statusHost = host.querySelector('[data-caf-status]'), body = host.querySelector('[data-caf-result]');
  const runButton = host.querySelector('[data-caf-run]'), cancelButton = host.querySelector('[data-caf-cancel]');
  installIconFallback(host);
  loadUiAssets().then(() => {
    if (!result) return;
    try { renderResult(); } catch (e) { error = e.message || String(e); renderStatus(); }
  });
  function renderControls() {
    loadouts = raw ? [{ key: 'imported', name: 'Imported save', setup: null },
      { key: 'working', name: 'Working edits', setup: readCombatDraft(localStorage, ci) }, ...readCombatLoadouts(localStorage, ci)] : [];
    if (!loadouts.some(l => l.key === state.loadout)) state.loadout = 'imported';
    controls.innerHTML = '<fieldset class="cw-controls"' + (worker ? ' disabled' : '') + '>'
      + '<label>Loadout <select data-caf-field="loadout">' + loadouts.map(l => '<option value="' + esc(l.key) + '"' + (l.key === state.loadout ? ' selected' : '') + '>' + esc(l.name) + '</option>').join('') + '</select></label>'
      + '<label>Hours away <input type="number" min="0" max="55555" step="0.25" value="' + state.hours + '" data-caf-field="hours"></label>'
      + '<label>Initial drop table <select data-caf-field="phase"><option value="entry"' + (state.phase === 'entry' ? ' selected' : '') + '>Fresh login (before first scene tick)</option>'
      + '<option value="settled"' + (state.phase === 'settled' ? ' selected' : '') + '>In-session (after first scene tick)</option></select></label></fieldset>';
    runButton.disabled = !raw || !!worker;
    cancelButton.disabled = !worker;
  }
  function renderStatus() {
    statusHost.innerHTML = (error ? '<p class="cw-error" role="alert">' + esc(error) + '</p>' : esc(status))
      + (stale ? '<p class="cw-warning">Save or settings changed. These results use the captured character, loadout and claim duration.</p>' : '');
  }
  function renderResult() {
    if (compareUpgrades) { renderComparison(); return; }
    if (!result) { body.innerHTML = ''; return; }
    if (result.unavailable || !result.clamworks) throw new Error(result.reason || 'Clamworks claim result is missing');
    const c = result.clamworks;
    const card = (name, value, sub) => '<div class="card"><div class="card-title">' + name + '</div><div class="card-val">' + value + '</div><div class="card-sub">' + sub + '</div></div>';
    const dropRow = (label, row, multiplier) => '<tr><td>' + iconHtml('items', row.key, label, { size: 24 }) + ' ' + label + '</td>'
      + '<td data-label="Expected quantity">' + quantity(row.expected) + '</td><td data-label="Chance of at least one">' + chance(row.chance) + (row.guaranteed ? ' (Guaranteed)' : '') + '</td>'
      + '<td data-label="Guaranteed quantity">' + fmt(row.minimum) + '</td><td data-label="Expected pearl currency">' + quantity(row.expected * multiplier * c.value * (1 + 9 * c.luckyChance)) + '</td></tr>';
    let html = '<p class="cw-note">' + esc(captured.identity) + ' - ' + fmt(result.effectiveHours) + ' credited hours'
      + (result.effectiveHours !== captured.hours ? ' (' + fmt(captured.hours) + ' entered)' : '') + ', promotion ' + c.promotion + '.</p>'
      + '<div class="card-grid cols-3">' + card('Expected pearl currency', quantity(c.expectedPearls), 'After picking up both pearl types; Lucky Day included')
      + card('Pure Pearl chance', chance(c.pure.chance), c.pureUnlocked ? quantity(c.pure.expected) + ' expected Pure Pearls' : 'Pure Pearls upgrade is not purchased')
      + card('Reward kills', fmt(result.rewardKills), fmt(result.creditedKills) + ' credited kills; ' + chance(result.survivability / 100) + ' survivability') + '</div>'
      + '<table class="data-table cw-table"><thead><tr><th>Drop</th><th>Expected quantity</th><th>Chance of at least one</th><th>Guaranteed quantity</th><th>Expected pearl currency</th></tr></thead><tbody>'
      + dropRow('Pearls', c.regular, 1) + dropRow('Pure Pearls', c.pure, c.pureMultiplier) + '</tbody></table>'
      + '<h3>Reroll for Pure Pearls</h3><div class="card-grid cols-3">'
      + card('Reroll button chance', chance(c.offerChance), c.autoClaim ? 'Auto-claim hides the reroll button' : c.foodBlocked ? 'Native food-loss rule blocks the first reroll' : 'Calculated from your talent and guild bonus')
      + card('Replacement Pure Pearl chance', chance(c.replacement.pure.chance), 'Given an offered reroll, after waiting for the one-second scene update')
      + card('Keep Pure; reroll misses', chance(c.strategy.pureChance), quantity(c.strategy.expectedPure) + ' expected Pure Pearls; ' + quantity(c.strategy.expectedPearls) + ' expected pearl currency') + '</div>'
      + '<p class="cw-note">The policy keeps a claim with any Pure Pearls and rerolls a miss only when the native button is offered. Each replacement may offer another reroll; it cannot keep the discarded reward. '
      + 'Expected rerolls: ' + quantity(c.strategy.expectedRerolls) + '. Food is consumed only on the first claim; replacements use the remaining food and native cached combat stats. '
      + 'The Pure Pearl upgrade must be purchased. At a batch mean above two, native drop quantity is deterministic, so rerolling cannot improve that quantity.</p>'
      + '<details class="cw-note"><summary>Claim mechanics and assumptions</summary><ul>'
      + '<li>' + (c.phase === 'entry' ? 'Fresh login uses the unmodified initial pearl table. ' : 'In-session uses the scene-updated pearl table. ')
      + 'The source starts the AFK claim after 500 ms but rewrites pearl rates every second. Prior visits, server-time catch-up and frame timing are not saved; choose the matching initial table. Rerolls here assume you wait at least one second.</li>'
      + '<li>Native AFK uses the map table\'s 25 clams, not the number of live spawned clams. Promotion-scaled HP, current respawn bonuses and saved forms are included. Captured form: ' + esc(c.form) + '; Multikill: ' + fmt(c.multikillTotal) + '%.</li>'
      + '<li>Pure Pearls multiply the full normal pearl value by ' + fmt(c.pureMultiplier) + 'x and also roll Lucky Day (' + chance(c.luckyChance) + ' for 10x per pickup actor). Expected currency is not guaranteed; collect the drops in game.</li>'
      + '<li>Claim doubling and inventory/pickup losses are excluded. Reroll policy optimizes for finding any Pure Pearls, not the largest possible currency payout.</li>'
      + (c.rerollPartial ? '<li>Guild bonus data is missing; displayed reroll odds omit any unknown guild contribution.</li>' : '')
      + (c.autoClaim ? '<li>Auto-claim is enabled in this save; disable it in game to use the reroll button.</li>' : '')
      + [...new Set(result.warnings || [])].map(w => '<li>' + esc(w) + '</li>').join('') + '</ul></details>';
    if (result.partial || c.rerollPartial) html = '<p class="cw-warning">Partial projection: see the missing-data assumptions below.</p>' + html;
    if (!c.pureUnlocked) html = '<p class="cw-warning">Purchase PURE PEARLS in game before a claim or reroll can drop them.</p>' + html;
    body.innerHTML = html;
  }
  function renderComparison() {
    if (!comparisonPlan) { body.innerHTML = ''; return; }
    const rows = summarizeClamworksAfk(comparisonPlan, records);
    const sorted = [rows[0], ...rows.slice(1).sort((a, b) => (a.paybackClaims ?? Infinity) - (b.paybackClaims ?? Infinity))];
    const delta = n => n == null ? '&mdash;' : (n > 0 ? '+' : '') + quantity(n);
    let html = '<p class="cw-note">' + esc(captured.identity) + ' - ' + fmt(comparisonPlan.hours) + ' hours per claim; '
      + (comparisonPlan.phase === 'entry' ? 'fresh-login' : 'in-session') + ' initial table; promotion ' + comparisonPlan.promotion + '.</p>'
      + '<table class="data-table cw-table"><thead><tr><th>Configuration</th><th>First-claim currency</th><th>Pure chance</th>'
      + '<th>Currency with rerolls</th><th>Pure chance with rerolls</th><th>Gain/claim with rerolls</th><th>Cost</th><th>Expected-rate payback</th></tr></thead><tbody>';
    for (const row of sorted) {
      html += '<tr><td data-label="Configuration">' + esc(row.label)
        + (row.from == null ? '<small>Baseline</small>' : '<small>Lv ' + row.from + ' &rarr; ' + row.to + (!row.affordable ? ' - Not yet affordable' : '') + '</small>')
        + (row.partial ? '<small>Partial projection</small>' : '') + '</td>';
      if (!row.complete) {
        html += '<td colspan="7" data-label="Status">' + (row.error ? '<span class="cw-error">' + esc(row.error) + '</span>' : worker ? 'Pending' : 'Not calculated') + '</td></tr>';
        continue;
      }
      html += '<td data-label="First-claim currency">' + quantity(row.expectedPearls) + (row.gain == null ? '' : '<small>' + delta(row.gain) + ' vs current</small>') + '</td>'
        + '<td data-label="Pure chance">' + chance(row.pureChance) + '<small>' + quantity(row.pureExpected) + ' expected Pure Pearls</small></td>'
        + '<td data-label="Currency with rerolls">' + quantity(row.policyPearls) + '</td>'
        + '<td data-label="Pure chance with rerolls">' + chance(row.policyPureChance) + '</td>'
        + '<td data-label="Gain/claim with rerolls">' + delta(row.policyGain) + '</td>'
        + '<td data-label="Cost">' + (row.cost == null ? '&mdash;' : quantity(row.cost)) + '</td>'
        + '<td data-label="Expected-rate payback">' + (row.paybackClaims == null ? '&mdash;' : quantity(row.paybackClaims) + ' claims<small>' + quantity(row.paybackHours) + ' hours away</small>') + '</td></tr>';
    }
    html += '</tbody></table><p class="cw-note">Currency includes both pearl types and Lucky Day, assuming every drop is collected. '
      + 'With rerolls means keep any Pure Pearl claim and reroll misses only when offered; it is not best-of-N or a maximum-currency policy. '
      + 'Payback divides the purchase cost by extra expected policy currency per claim, assuming repeated identical claims at the entered interval; it is not a guaranteed waiting time. '
      + 'Replacements use settled rates and remaining food. Claim doubling and inventory losses are excluded. '
      + 'Extra-clam upgrades do not change the native 25-clam AFK count. Cost reducers remain analytical; no purchases or loadout edits are applied.</p>';
    const warnings = [...new Set([...comparisonPlan.warnings, ...rows.flatMap(row => (row.warnings || []).map(w => row.label + ': ' + w))])];
    if (warnings.length) html += '<details class="cw-note"><summary>Input assumptions and warnings (' + warnings.length + ')</summary><ul>'
      + warnings.map(w => '<li>' + esc(w) + '</li>').join('') + '</ul></details>';
    body.innerHTML = html;
  }
  function stop() { serial++; worker?.terminate(); worker = null; }
  function invalidate(clear = false) {
    stop(); status = ''; error = '';
    if (clear) { result = null; comparisonPlan = null; records = []; captured = null; stale = false; body.innerHTML = ''; }
    else if (result || comparisonPlan) stale = true;
  }
  function finish() {
    worker?.terminate(); worker = null;
    controls.querySelector('fieldset')?.removeAttribute('disabled');
    runButton.disabled = !raw; cancelButton.disabled = true; renderStatus();
  }
  runButton.addEventListener('click', () => {
    invalidate(true);
    const id = serial;
    try {
      if (!raw) throw new Error('Load a save first');
      if (!Number.isFinite(state.hours) || state.hours < 0 || state.hours * 3600 > 2e8) throw new Error('Enter AFK hours between 0 and 55,555');
      renderControls();
      const chosen = loadouts.find(l => l.key === state.loadout);
      if (!chosen) throw new Error('Selected loadout is unavailable');
      if (chosen.setup && Number(chosen.setup.charIdx) !== ci) throw new Error('This loadout belongs to another character');
      const setup = chosen.setup ? normalizeCombatSetup(structuredClone(chosen.setup)) : null;
      captured = { hours: state.hours, identity: (characterOptions(raw).find(c => c.ci === ci)?.name || 'Character') + ' - ' + chosen.name };
      if (compareUpgrades) comparisonPlan = buildClamworksAfkPlan(raw, { charIdx: ci, setup, hours: state.hours, phase: state.phase });
      const messages = compareUpgrades ? comparisonPlan.rows.map((row, index) => ({
        type: 'afk', id: id + ':' + index, charIdx: ci, mapIdx: 306, hours: state.hours, setup: row.setup, clamworksPhase: state.phase,
      })) : [{ type: 'afk', id, charIdx: ci, mapIdx: 306, hours: state.hours, setup, clamworksPhase: state.phase }];
      let index = 0;
      function dispatch() {
        worker.postMessage(messages[index]);
        status = compareUpgrades ? 'Calculating AFK upgrades: ' + index + '/' + messages.length + ' complete...' : 'Calculating native AFK claim and reroll odds...';
        renderStatus();
      }
      worker = workerFactory();
      worker.onmessage = ({ data }) => {
        if (id !== serial) return;
        try {
          if (data.type === 'loaded') { dispatch(); return; }
          if (data.id !== messages[index]?.id) return;
          if (compareUpgrades && (data.type === 'done' || data.type === 'error')) {
            records.push({ key: comparisonPlan.rows[index].key, ...(data.type === 'error' ? { error: data.error || 'AFK worker failed' } : { result: data.result }) });
            index++;
            renderResult();
            if (index < messages.length) { dispatch(); return; }
            status = 'AFK comparison complete.' + (summarizeClamworksAfk(comparisonPlan, records).some(r => !r.complete) ? ' Some configurations failed.' : '');
            finish(); return;
          }
          if (data.type === 'error') throw new Error(data.error || 'AFK worker failed');
          if (data.type !== 'done') return;
          result = data.result;
          renderResult(); status = 'Claim calculated.'; finish();
        } catch (e) { error = e.message || String(e); finish(); }
      };
      worker.onerror = event => { if (id === serial) { error = event.message || 'AFK worker failed to start'; finish(); } };
      worker.onmessageerror = () => { if (id === serial) { error = 'Unable to transfer AFK worker results'; finish(); } };
      worker.postMessage({ type: 'load', rawSave: structuredClone(raw) });
      status = 'Loading captured save...'; renderControls(); renderResult(); renderStatus();
    } catch (e) { error = e.message || String(e); finish(); }
  });
  cancelButton.addEventListener('click', () => { stop(); status = 'Cancelled.'; finish(); renderResult(); });
  controls.addEventListener('change', event => {
    const key = event.target.dataset.cafField;
    if (!key) return;
    invalidate();
    state[key] = key === 'hours' ? Number(event.target.value) : event.target.value;
    runButton.disabled = !raw; cancelButton.disabled = true; renderStatus();
  });
  return {
    setCharacter(next) {
      if (next === ci) return;
      invalidate(); ci = next; state.loadout = 'imported';
      try { renderControls(); renderStatus(); } catch (e) { error = e.message || String(e); renderStatus(); }
    },
    load(next, metadata) {
      if (metadata?.source === 'auto-refresh') { if (result || comparisonPlan || worker) stale = true; }
      else invalidate(true);
      raw = next;
      try { renderControls(); renderStatus(); } catch (e) { error = e.message || String(e); renderStatus(); }
    },
  };
}
