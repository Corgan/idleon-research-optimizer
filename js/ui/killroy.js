import { initSaveLoader } from './save-loader.js';
import { itemName } from '../stats/systems/common/combat-sim-setup.js';
import { killroyForecast, killroyUpgradeChoices, buildKillroyPlan, summarizeKillroy } from '../stats/systems/common/killroy-planner.js';
import { runCombatBatch } from '../workers/combat-sim-client.js';
import { captureKillroyReplay, storeKillroyReplay } from './killroy-replay.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = n => n == null ? '&mdash;' : n.toLocaleString('en-US', { maximumFractionDigits: 2 });
const delta = n => n == null ? '&mdash;' : (n > 0 ? '+' : '') + fmt(n);
let raw = null, roster = [], active = null, activeState = null, mode = 'baseline';
let forecast = null, selectionReady = false, resultOwner = null;
const workspaces = Object.fromEntries(['baseline', 'upgrades'].map(id => [id, {
  selected: new Map(), open: new Set(), checkedWeeks: new Set([0]), upgrades: new Set(),
  captured: null, stale: false, sort: 'skullsPicked', horizon: 12, trials: 3, savedBuffs: false, unlimited: false, queueOpen: false,
}]));
const state = () => workspaces[mode];
const selectionKey = (c, slot) => c.weekOffset + ':' + c.ci + ':' + slot;
const weekLabel = offset => offset === 0 ? 'This week' : '+' + offset + (offset === 1 ? ' week' : ' weeks');
const date = (seconds, compact = false) => new Date(seconds * 1000).toLocaleString(undefined,
  compact ? { month: 'short', day: 'numeric' } : { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

function fail(error) { $('error').textContent = error.message || String(error); }
function renderRoster() {
  const { selected, checkedWeeks, upgrades } = state();
  forecast = killroyForecast(raw, { weeks: Number($('forecast-weeks').value) });
  roster = forecast.weeks.flatMap(w => w.characters.map(c => ({ ...c, weekOffset: w.weekOffset,
    week: c.encounters })));
  for (const offset of checkedWeeks) if (offset > Number($('forecast-weeks').value)) checkedWeeks.delete(offset);
  for (const c of roster) for (const e of c.week) {
    const key = selectionKey(c, e.slot);
    if (!selected.has(key)) selected.set(key, mode === 'baseline' && e.eligible && e.used !== true);
  }
  renderForecast();
  $('upgrade-list').innerHTML = killroyUpgradeChoices(raw).map(u => '<label><input type="checkbox" data-upgrade="' + u.id + '"'
    + (upgrades.has(u.id) ? ' checked' : '') + (u.unlocked && u.level != null ? '' : ' disabled') + '> '
    + esc(u.name) + ' ' + (u.level == null ? '?' : u.level) + (u.unlocked ? '' : u.unlocked == null ? ' (availability unknown)' : ' (locked)')
    + '</label>').join('');
  renderSelection();
  $('settings').disabled = false;
}
function forecastSelectionText(w, slot) {
  const { selected, checkedWeeks } = state();
  const names = w.characters.filter(c => selected.get(selectionKey({ ...c, weekOffset: w.weekOffset }, slot))
    && c.encounters[slot].eligible).map(c => c.name);
  return names.length ? names.length + (checkedWeeks.has(w.weekOffset) ? ' queued' : ' selected') : '';
}
function renderCharacterSelector(c, e, weekOffset, showMap) {
  const { selected } = state(), key = selectionKey({ ...c, weekOffset }, e.slot);
  return '<label class="roster-row"><input type="checkbox" data-select="' + key + '"'
    + (selected.get(key) ? ' checked' : '') + '> <span>' + esc(c.name)
    + (showMap ? '<small>' + esc(e.mapName) + '</small>' : '') + '</span></label>';
}
function renderForecast() {
  const { checkedWeeks } = state();
  $('forecast').innerHTML = '<table class="data-table"><thead><tr><th>Week</th>'
    + [1, 2, 3].map(n => '<th>Encounter ' + n + '</th>').join('') + '</tr></thead><tbody>'
    + forecast.weeks.map(w => '<tr' + (checkedWeeks.has(w.weekOffset) ? ' class="winner"' : '') + '><td><label><input type="checkbox" data-week-check="'
      + w.weekOffset + '"' + (checkedWeeks.has(w.weekOffset) ? ' checked' : '') + '> ' + weekLabel(w.weekOffset)
      + '</label><small><time datetime="' + new Date(w.startsAt * 1000).toISOString() + '" aria-label="' + esc(date(w.startsAt)) + '">'
      + esc(date(w.startsAt, true)) + '</time> &ndash; <time datetime="' + new Date(w.endsAt * 1000).toISOString()
      + '" aria-label="' + esc(date(w.endsAt)) + '">' + esc(date(w.endsAt, true)) + '</time></small></td>'
      + [0, 1, 2].map(slot => {
        const entries = w.characters.map(c => ({ ...c.encounters[slot], character: c }));
        const available = entries.filter(e => e.available !== false), e = available[0] || entries[0];
        const maps = [...new Map(available.map(e => [e.mapIdx, e])).values()];
        return '<td data-label="Encounter ' + (slot + 1) + '"><strong>' + esc(e.familyName) + '</strong>'
          + (maps.length ? maps.map(m => '<small class="map-record">' + esc(m.mapName) + ' &middot; Record <span class="metric">'
            + fmt(m.best) + '</span></small>').join('') : '<small>Locked</small>')
          + (w.weekOffset === 0 && e.used ? '<small>Already used - practice only</small>' : '')
          + '<div class="week-characters">' + entries.filter(e => e.eligible)
            .map(e => renderCharacterSelector(e.character, e, w.weekOffset, maps.length > 1)).join('') + '</div>'
          + (!entries.some(e => e.eligible) ? '<small>' + esc(e.reason || 'No eligible saved character') + '</small>' : '')
          + '<small class="selection-count" data-forecast-selection="' + w.weekOffset + ':' + slot + '">' + esc(forecastSelectionText(w, slot))
          + '</small></td>';
      }).join('') + '</tr>').join('') + '</tbody></table>';
  $('forecast-stats').innerHTML = '<p class="note">Next ' + (forecast.weeks.length - 1)
    + ' weeks only; counts exclude locked or unknown encounter unlocks, and map counts exclude unavailable rooms. A character-dependent map alternative counts once per encounter, not once per character.</p>'
    + '<div class="bonus">' + forecast.familyCounts.map(f => '<span class="pill">' + esc(f.name) + ': ' + f.count + ' encounters</span>').join('') + '</div>'
    + '<table class="data-table"><thead><tr><th>Map</th><th>Encounter appearances</th></tr></thead><tbody>'
    + forecast.mapCounts.map(m => '<tr><td>' + esc(m.name) + '</td><td data-label="Appearances">' + m.count + '</td></tr>').join('')
    + '</tbody></table>';
}
function updateQueueHighlights() {
  const { checkedWeeks } = state();
  for (const input of $('forecast').querySelectorAll('[data-select]')) {
    const offset = Number(input.dataset.select.split(':')[0]);
    input.closest('.roster-row').classList.toggle('queued', input.checked && checkedWeeks.has(offset));
  }
  for (const label of $('forecast').querySelectorAll('[data-forecast-selection]')) {
    const [offset, slot] = label.dataset.forecastSelection.split(':').map(Number);
    label.textContent = forecastSelectionText(forecast.weeks[offset], slot);
    label.closest('tr').classList.toggle('winner', checkedWeeks.has(offset));
  }
}
function renderSelection() {
  const workspace = state();
  selectionReady = false;
  try {
    const horizon = Number($('forecast-weeks').value);
    if (!Number.isInteger(horizon) || horizon < 1 || horizon > 52) throw new Error('Choose 1-52 upcoming weeks');
    const trials = Number($('trials').value);
    if (!Number.isInteger(trials) || trials < 1 || trials > 20) throw new Error('Choose 1-20 trials');
    const plan = buildKillroyPlan(raw, { selections: chosenSelections(), seeds: [1], upgrades: chosenUpgrades(),
      useSavedBuffs: $('saved-buffs').checked, unlimitedInventory: $('unlimited').checked });
    if (mode === 'upgrades' && !plan.rows.some(r => r.upgrade)) throw new Error('No selected upgrades are available for these characters');
    const bases = plan.rows.filter(r => !r.upgrade), attempts = plan.jobs.length * trials;
    $('selection-preview').innerHTML = '<details id="queue-details"' + (workspace.queueOpen ? ' open' : '') + '><summary>Queue: '
      + plan.weeks.length + (plan.weeks.length === 1 ? ' week' : ' weeks') + ' &middot; ' + plan.rows.length
      + ' configurations &times; ' + trials + (trials === 1 ? ' trial' : ' trials') + '</summary><div class="queue-weeks">'
      + plan.weeks.map(w => '<div class="queue-week"><h3>' + weekLabel(w.weekOffset) + '</h3>'
        + '<table class="data-table"><thead><tr><th>Map / class</th><th>Character</th>'
        + (mode === 'upgrades' ? '<th>Configurations</th>' : '') + '</tr></thead><tbody>'
        + bases.filter(b => b.weekOffset === w.weekOffset).map(b => {
          const upgrades = plan.rows.filter(r => r.baseline === b.key && r.upgrade).map(r => '+1 ' + esc(r.upgrade.name));
          return '<tr><td>' + esc(b.encounter.mapName) + ' / ' + esc(b.encounter.familyName)
            + '<small>Encounter ' + (b.slot + 1) + (b.encounter.used ? ' (practice)' : '') + '</small></td>'
            + '<td data-label="Character">' + esc(b.label) + '</td>'
            + (mode === 'upgrades' ? '<td data-label="Configurations">' + ['Baseline reference', ...upgrades].join(' &middot; ') + '</td>' : '') + '</tr>';
        }).join('') + '</tbody></table></div>').join('') + '</div></details>';
    selectionReady = true;
    $('run').textContent = (mode === 'baseline' ? 'Simulate baseline: ' : 'Compare upgrades: ') + fmt(attempts) + ' attempts';
  } catch (error) {
    $('selection-preview').innerHTML = '<span class="note">' + esc(error.message || String(error)) + '.</span>';
    $('run').textContent = 'Select characters to simulate';
  }
  $('selection-preview').classList.toggle('ready', selectionReady);
  $('run').disabled = !!active || !selectionReady;
  workspace.horizon = Number($('forecast-weeks').value);
  workspace.trials = Number($('trials').value);
  workspace.savedBuffs = $('saved-buffs').checked;
  workspace.unlimited = $('unlimited').checked;
  updateQueueHighlights();
}
function invalidate() {
  const workspace = state();
  if (activeState === workspace) active.abort();
  if (workspace.captured) { workspace.stale = true; renderResults(); }
}
function chosenUpgrades() {
  if (mode === 'baseline') return false;
  if (!state().upgrades.size) throw new Error('Choose at least one upgrade to compare');
  return [...state().upgrades];
}
function chosenSelections() {
  const { selected, checkedWeeks } = state();
  if (!checkedWeeks.size) throw new Error('Check at least one week to simulate');
  const selections = roster.filter(c => checkedWeeks.has(c.weekOffset)).flatMap(c => c.week.flatMap(e => {
    const key = selectionKey(c, e.slot);
    if (!e.eligible || !selected.get(key)) return [];
    return [{ charIdx: c.ci, slot: e.slot, weekOffset: c.weekOffset, setup: null, label: c.name }];
  }));
  if (!selections.length) throw new Error('No eligible encounters for the selected characters in the checked weeks');
  return selections;
}
async function start() {
  if (active) return;
  $('error').textContent = '';
  try {
    const horizon = Number($('forecast-weeks').value);
    if (!Number.isInteger(horizon) || horizon < 1 || horizon > 52) throw new Error('Choose 1-52 upcoming weeks');
    const count = Number($('trials').value);
    if (!Number.isInteger(count) || count < 1 || count > 20) throw new Error('Choose 1-20 trials');
    // Fresh run family, common distinct streams for every character and upgrade.
    const first = crypto.getRandomValues(new Uint32Array(1))[0] || 1;
    const seeds = Array.from({ length: count }, (_, i) => ((first + i - 1) % 0xffffffff) + 1);
    const plan = buildKillroyPlan(raw, { selections: chosenSelections(), seeds,
      upgrades: chosenUpgrades(), useSavedBuffs: $('saved-buffs').checked, unlimitedInventory: $('unlimited').checked });
    if (mode === 'upgrades' && !plan.rows.some(r => r.upgrade)) throw new Error('No selected upgrades are available for these characters');
    const workspace = state(), label = mode === 'baseline' ? 'Baseline' : 'Upgrade comparisons';
    const controller = new AbortController(), batch = { plan, records: [], cancelled: false };
    workspace.captured = batch; active = controller; activeState = workspace; workspace.stale = false;
    $('run').disabled = true; $('progress-wrap').hidden = false;
    $('progress').value = 0; $('progress-label').textContent = label + ': starting ' + plan.jobs.length + ' attempts';
    renderResults();
    try {
      const result = await runCombatBatch({ rawSave: plan.raw, jobs: plan.jobs, signal: controller.signal,
        concurrency: Math.min(4, navigator.hardwareConcurrency || 2),
        onProgress(p) {
          if (workspace.captured !== batch) return;
          $('progress').value = p.fraction;
          $('progress-label').textContent = label + ': ' + p.completed + '/' + p.total + ' attempts';
        },
        onResult(record) { batch.records.push(record); if (state() === workspace && workspace.captured === batch) renderResults(); },
      });
      batch.cancelled = result.cancelled;
    } finally {
      if (active === controller) {
        active = null; activeState = null; $('progress-wrap').hidden = true; $('run').disabled = !selectionReady;
        if (state() === workspace && workspace.captured === batch) renderResults();
      }
    }
  } catch (error) { fail(error); }
}
function rowStatus(r, n) {
  return r.complete ? n + '/' + n : r.errors.length ? 'Failed / ' + r.runs + '/' + n : r.runs + '/' + n + ' complete';
}
function renderResultDetails(r, plan, records, cancelled, open) {
  const rewards = Object.keys(r.mean || {}).filter(k => /^(TalentPoint|DungCredits|Pearl)/.test(k));
  const notes = [...new Set([...r.warnings,
    ...r.inputIssues.map(i => (i.label || i.key) + ': ' + (i.note || i.source || i.status || 'partial'))])];
  return '<div class="attempt-details"><div class="bonus">'
    + '<span>Skulls dropped: <strong>' + fmt(r.mean?.skullsDropped) + '</strong></span>'
    + '<span>Deaths: <strong>' + fmt(r.mean?.deaths) + '</strong></span>'
    + rewards.map(k => '<span>' + esc(itemName(k)) + ': <strong>' + fmt(r.mean[k]) + '</strong></span>').join('')
    + '</div>' + (r.upgrade ? '<p class="note">' + esc(r.upgrade.effect) + '</p>' : '')
    + '<table class="data-table runs"><thead><tr><th>Trial / seed</th><th>Kills</th><th>Skulls</th><th>Replay</th></tr></thead><tbody>'
    + plan.seeds.map((seed, i) => {
      const record = records.find(x => x.job.key === r.key && x.job.seed === seed), result = record?.result;
      return '<tr><td>Trial ' + (i + 1) + '<small>' + seed + '</small></td><td data-label="Kills">' + fmt(result?.summary?.special?.killroy?.kills) + '</td>'
        + '<td data-label="Skulls">' + fmt(result?.summary?.special?.killroy?.skullsPicked) + '</td><td>'
        + (result ? '<button data-replay="' + esc(r.key) + '" data-seed="' + seed + '">Replay</button>'
          : esc(record?.error || (cancelled ? 'Cancelled' : 'Pending'))) + '</td></tr>';
    }).join('') + '</tbody></table>'
    + (notes.length ? '<details data-open="notes:' + esc(r.key) + '"' + (open.has('notes:' + r.key) ? ' open' : '') + '><summary>Input notes (' + notes.length + ')</summary><p class="note">'
      + notes.map(esc).join('<br>') + '</p></details>' : '') + '</div>';
}
function renderResults() {
  const workspace = state(), { captured, stale, sort, open } = workspace;
  if (!captured) { $('results').innerHTML = ''; resultOwner = workspace; return; }
  const { plan, records, cancelled } = captured, rows = summarizeKillroy(plan, records);
  const scroll = { x: window.scrollX, y: window.scrollY };
  const focused = resultOwner === workspace && $('results').contains(document.activeElement) ? document.activeElement : null;
  const focusSelector = focused?.id ? '#' + CSS.escape(focused.id) : focused?.dataset.replay
    ? '[data-replay="' + CSS.escape(focused.dataset.replay) + '"][data-seed="' + focused.dataset.seed + '"]'
    : focused?.dataset.resultDetails ? '[data-result-details="' + CSS.escape(focused.dataset.resultDetails) + '"]'
    : focused?.matches('summary') ? '[data-open="' + CSS.escape(focused.parentElement.dataset.open) + '"] > summary' : null;
  for (const d of resultOwner === workspace ? $('results').querySelectorAll('details[data-open]') : []) {
    if (d.open) open.add(d.dataset.open); else open.delete(d.dataset.open);
  }
  const comparing = plan.rows.some(r => r.upgrade);
  let html = '<section class="section"><div class="result-header"><h2>' + (comparing ? 'Upgrade comparison results' : 'Baseline results')
    + '</h2><label>Rank by <select id="rank-by">'
    + [['skullsPicked', 'Collected skulls'], ['kills', 'Kills']].map(([k, v]) => '<option value="' + k + '"' + (sort === k ? ' selected' : '') + '>' + v + '</option>').join('')
    + '</select></label></div>'
    + (stale ? '<p class="stale">Captured results - save or settings have changed.</p>' : '')
    + (cancelled ? '<p class="note">Cancelled. Completed attempts retained; unfinished comparisons are not ranked.</p>' : '')
    + '<p class="note">' + plan.seeds.length + (plan.seeds.length === 1 ? ' trial' : ' trials')
    + ' &middot; average per attempt &middot; imported save</p>';
  const bases = rows.filter(r => !r.upgrade);
  const outlook = '<details data-open="outlook"' + (open.has('outlook') ? ' open' : '') + '><summary>Weekly totals</summary><p class="note">Best selected baseline per encounter, ranked by '
    + (sort === 'kills' ? 'kills' : 'collected skulls') + '. Totals sum independent attempts, not a sequential weekly upgrade plan.</p>'
    + '<table class="data-table"><thead><tr><th>Week / best selected characters</th><th>Kills</th><th>Skulls picked</th></tr></thead><tbody>'
    + plan.weeks.map(w => {
      const group = bases.filter(r => r.weekOffset === w.weekOffset), ready = group.every(r => r.complete);
      const winners = ready ? [0, 1, 2].map(slot => group.filter(r => r.slot === slot)
        .reduce((a, b) => !a || b.mean[sort] > a.mean[sort] ? b : a, null)).filter(Boolean) : [];
      return '<tr><td>' + weekLabel(w.weekOffset) + '<small>' + esc(date(w.startsAt)) + '</small><small>'
        + (ready ? winners.map(r => 'Encounter ' + (r.slot + 1) + ': ' + esc(r.label)).join('<br>')
          : group.filter(r => r.complete).length + '/' + group.length + ' baselines complete')
        + '</small></td><td data-label="Kills">' + fmt(ready ? winners.reduce((n, r) => n + r.mean.kills, 0) : null)
        + '</td><td data-label="Skulls picked">' + fmt(ready ? winners.reduce((n, r) => n + r.mean.skullsPicked, 0) : null) + '</td></tr>';
    }).join('') + '</tbody></table></details>';
  const combos = new Map();
  for (const row of rows) {
    const key = row.weekOffset + ':' + row.encounter.family + ':' + row.encounter.mapIdx;
    if (!combos.has(key)) combos.set(key, []);
    combos.get(key).push(row);
  }
  for (const week of plan.weeks) {
    const weekCombos = [...combos].filter(([, group]) => group[0].weekOffset === week.weekOffset)
      .sort((a, b) => Math.min(...a[1].map(r => r.slot)) - Math.min(...b[1].map(r => r.slot)));
    const columns = comparing ? 7 : 4;
    html += '<table class="data-table weekly-results" data-comparing="' + comparing + '" data-week="' + week.weekOffset + '"><caption><strong>'
      + weekLabel(week.weekOffset) + '</strong><span>' + esc(date(week.startsAt, true)) + '</span></caption>'
      + '<colgroup>' + (comparing ? [26, 24, 12, 12, 9, 9, 8] : [46, 20, 20, 14])
        .map(width => '<col style="width:' + width + '%">').join('') + '</colgroup>'
      + '<thead><tr><th scope="col">Character</th>' + (comparing ? '<th scope="col" class="configuration">Configuration</th>' : '')
      + '<th scope="col">Kills</th><th scope="col">Skulls</th>'
      + (comparing ? '<th scope="col">Delta kills</th><th scope="col">Delta skulls</th>' : '') + '<th scope="col"></th></tr></thead>';
    for (const [comboKey, combo] of weekCombos) {
      const comboBases = combo.filter(r => !r.upgrade).sort((a, b) => {
        if (a.complete !== b.complete) return a.complete ? -1 : 1;
        return a.complete ? b.mean[sort] - a.mean[sort] : 0;
      });
      const group = comboBases.flatMap(base => combo.filter(r => r.baseline === base.key));
      const first = group[0], slots = [...new Set(group.map(r => r.slot))];
      html += '<tbody class="combo-results" data-combo="' + comboKey + '"><tr class="combo-title"><th colspan="' + columns + '">'
        + '<div class="combo-label"><span>' + esc(first.encounter.mapName) + ' <span class="family-tag">'
        + esc(first.encounter.familyName) + '</span></span><small>Record ' + fmt(first.encounter.best)
        + ' &middot; Encounter ' + slots.map(s => s + 1).join(', ') + (first.encounter.used ? ' (practice)' : '')
        + '</small></div></th></tr>';
      for (const r of group) {
        const detailKey = 'row:' + r.key, detailId = 'killroy-detail-' + r.key, expanded = open.has(detailKey);
        html += '<tr class="result-row"><td><strong>' + esc(r.label) + '</strong>'
          + (slots.length > 1 ? '<small>Encounter ' + (r.slot + 1) + '</small>' : '')
          + (r.complete ? '' : '<small class="row-status">' + rowStatus(r, plan.seeds.length) + '</small>')
          + (r.errors.length ? '<small class="error">' + r.errors.map(esc).join('<br>') + '</small>' : '') + '</td>'
          + (comparing ? '<td data-label="Configuration" class="configuration">' + esc(r.upgrade ? '+1 ' + r.upgrade.name + ' (' + r.upgrade.level + ' to ' + (r.upgrade.level + 1) + ')' : 'Baseline reference') + '</td>' : '')
          + '<td data-label="Kills">' + fmt(r.mean?.kills) + '</td><td data-label="Skulls" class="metric">' + fmt(r.mean?.skullsPicked) + '</td>'
          + (comparing ? '<td data-label="Delta kills">' + delta(r.delta?.kills) + '</td><td data-label="Delta skulls">' + delta(r.delta?.skullsPicked) + '</td>' : '')
          + '<td><button class="details-button" data-result-details="' + esc(detailKey) + '" aria-expanded="' + expanded
          + '" aria-controls="' + esc(detailId) + '" aria-label="' + esc(r.label + (r.upgrade ? ' +1 ' + r.upgrade.name : '') + ' details') + '">Details</button></td></tr>'
          + '<tr class="result-details" id="' + esc(detailId) + '"' + (expanded ? '' : ' hidden') + '><td colspan="' + columns + '">'
          + renderResultDetails(r, plan, records, cancelled, open) + '</td></tr>';
      }
      html += '</tbody>';
    }
    html += '</table>';
  }
  html += '<div class="result-summary">' + outlook
    + '<details data-open="method"' + (open.has('method') ? ' open' : '') + '><summary>Run details</summary><p class="note">'
    + (plan.rows.some(r => r.keepBuffs) ? 'Saved buffs kept' : 'Fresh map-entry buffs')
    + (plan.rows.some(r => r.unlimitedInventory) ? ' &middot; Unlimited inventory' : '')
    + '. Shared seeds; sampled differences are not confirmed wins.</p>'
    + (plan.warnings.length ? '<p class="note">' + plan.warnings.map(esc).join('<br>') + '</p>' : '') + '</details></div>';
  $('results').innerHTML = html + '</section>';
  resultOwner = workspace;
  if (focusSelector) $('results').querySelector(focusSelector)?.focus({ preventScroll: true });
  window.scrollTo(scroll.x, scroll.y);
}
$('run').addEventListener('click', start);
$('cancel').addEventListener('click', () => { if (activeState?.captured) activeState.captured.cancelled = true; active?.abort(); });
function syncWorkspace() {
  const workspace = state();
  $('forecast-weeks').value = workspace.horizon;
  $('trials').value = workspace.trials;
  $('saved-buffs').checked = workspace.savedBuffs;
  $('unlimited').checked = workspace.unlimited;
  $('upgrade-settings').hidden = mode !== 'upgrades';
  $('mode-panel').setAttribute('aria-labelledby', mode + '-tab');
  $('mode-help').textContent = mode === 'baseline'
    ? 'Imported save only. Check characters to queue their week.'
    : 'Imported save only. Choose characters and +1 upgrades to compare.';
  for (const button of document.querySelectorAll('[data-mode]')) button.setAttribute('aria-selected', String(button.dataset.mode === mode));
}
$('settings').addEventListener('click', e => {
  const button = e.target.closest('[data-mode]');
  if (!button || button.dataset.mode === mode) return;
  mode = button.dataset.mode;
  $('error').textContent = '';
  syncWorkspace();
  try { if (raw) renderRoster(); renderResults(); } catch (error) { fail(error); }
});
$('settings').addEventListener('change', e => {
  const { selected, checkedWeeks, upgrades } = state();
  try {
    if (e.target.id === 'forecast-weeks') {
      const weeks = Number(e.target.value);
      if (!Number.isInteger(weeks) || weeks < 1 || weeks > 52) throw new Error('Choose 1-52 upcoming weeks');
      for (const offset of checkedWeeks) if (offset > weeks) checkedWeeks.delete(offset);
      renderRoster();
    }
    if (e.target.dataset.weekCheck != null) {
      const offset = Number(e.target.dataset.weekCheck);
      if (e.target.checked) checkedWeeks.add(offset); else checkedWeeks.delete(offset);
    }
    if (e.target.dataset.select != null) {
      selected.set(e.target.dataset.select, e.target.checked);
      if (e.target.checked) {
        const offset = Number(e.target.dataset.select.split(':')[0]);
        checkedWeeks.add(offset);
        $('forecast').querySelector('[data-week-check="' + offset + '"]').checked = true;
      }
    }
    if (e.target.dataset.upgrade != null) {
      const id = Number(e.target.dataset.upgrade);
      if (e.target.checked) upgrades.add(id); else upgrades.delete(id);
    }
    renderSelection();
    $('error').textContent = '';
    invalidate();
  } catch (error) { fail(error); renderSelection(); }
});
$('settings').addEventListener('toggle', e => {
  if (e.target.id === 'queue-details') state().queueOpen = e.target.open;
}, true);
$('results').addEventListener('toggle', e => {
  const key = e.target.dataset.open;
  if (key) { if (e.target.open) state().open.add(key); else state().open.delete(key); }
}, true);
$('results').addEventListener('change', e => {
  if (e.target.id === 'rank-by') { state().sort = e.target.value; renderResults(); $('rank-by').focus({ preventScroll: true }); }
});
$('results').addEventListener('click', e => {
  const { captured } = state();
  const details = e.target.closest('[data-result-details]');
  if (details) {
    const expanded = details.getAttribute('aria-expanded') !== 'true', key = details.dataset.resultDetails;
    if (expanded) state().open.add(key); else state().open.delete(key);
    details.setAttribute('aria-expanded', String(expanded));
    $(details.getAttribute('aria-controls')).hidden = !expanded;
    return;
  }
  const button = e.target.closest('[data-replay]');
  if (!button || !captured) return;
  let child;
  try {
    const job = captured.plan.jobs.find(j => j.key === button.dataset.replay && j.seed === Number(button.dataset.seed));
    const row = captured.plan.rows.find(r => r.key === job.key);
    const payload = captureKillroyReplay(captured.plan.raw, job, weekLabel(row.weekOffset) + ' / ' + row.label + (row.upgrade ? ' / +1 ' + row.upgrade.name : ' / Baseline'));
    child = window.open('about:blank', '_blank');
    if (!child) throw new Error('Allow this replay tab to open, then try again.');
    const href = storeKillroyReplay(child.sessionStorage, crypto.randomUUID(), payload);
    child.opener = null;
    child.location.replace(href);
  } catch (error) { child?.close(); fail(error); }
});
initSaveLoader({
  target: '#save-area', auth: true, skipLoad: true,
  onLoad(_state, parsed, meta) {
    const preserve = meta?.source === 'auto-refresh' && Object.values(workspaces).some(w => w.captured);
    if (!preserve) {
      active?.abort();
      for (const workspace of Object.values(workspaces)) {
        workspace.captured = null; workspace.stale = false; workspace.selected.clear();
        workspace.open.clear(); workspace.upgrades.clear(); workspace.checkedWeeks.clear(); workspace.checkedWeeks.add(0);
      }
    } else for (const workspace of Object.values(workspaces)) if (workspace.captured) workspace.stale = true;
    raw = parsed; $('error').textContent = ''; $('settings').disabled = true;
    syncWorkspace();
    try { renderRoster(); renderResults(); } catch (error) { fail(error); }
  },
});
