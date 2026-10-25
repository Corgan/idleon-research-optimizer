import { characterOptions } from '../stats/systems/common/combat-sim-setup.js';
import { readCombatDraft, readCombatLoadouts } from './combat-sim-loadouts.js';
import { runCombatBatch } from '../workers/combat-sim-client.js';
import { fmtVal } from '../renderers/format.js';

export const farmingEscape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const farmingFormat = value => value == null ? 'Unavailable' : fmtVal(value);

export function farmingWarnings(plan, rows) {
  const issues = [...new Set([...plan.warnings, ...rows.flatMap(r => [
    ...r.errors.map(e => r.label + ': ' + e), ...r.warnings.map(w => r.label + ': ' + w),
    ...r.inputIssues.map(i => i.status + ': ' + i.source + (i.note ? ' - ' + i.note : '')),
  ])])];
  return issues.length ? '<details class="cw-note"><summary>Input assumptions and warnings (' + issues.length + ')</summary><ul>'
    + issues.map(i => '<li>' + farmingEscape(i) + '</li>').join('') + '</ul></details>' : '';
}

export function mountCombatFarming(host, config) {
  let raw = null, controller = null, token = 0, loadouts = [], characters = [];
  let plan = null, records = [], identity = '', stale = false, error = '', status = '';
  const state = { charIdx: 0, loadout: 'imported', minutes: 30, seeds: 3, upgrades: true, unlimited: false, savedBuffs: false, ...config.state };
  const esc = farmingEscape;
  host.className = 'section cw-combat';
  host.innerHTML = '<h2>' + esc(config.title) + '</h2><div data-cw-controls></div><p class="cw-note">' + config.intro + '</p>'
    + '<div class="cw-actions"><button type="button" data-cw-run>' + esc(config.runLabel || 'Measure farming') + '</button>'
    + '<button type="button" data-cw-cancel disabled>Cancel</button></div>'
    + '<div data-cw-status role="status" aria-live="polite"></div><div data-cw-results></div>';
  const controls = host.querySelector('[data-cw-controls]'), statusHost = host.querySelector('[data-cw-status]');
  const resultHost = host.querySelector('[data-cw-results]'), runButton = host.querySelector('[data-cw-run]'), cancelButton = host.querySelector('[data-cw-cancel]');
  const select = (field, label, choices, current) => '<label>' + esc(label) + ' <select data-cw-field="' + field + '">'
    + choices.map(c => '<option value="' + esc(c.key) + '"' + (String(c.key) === String(current) ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('') + '</select></label>';
  const checkbox = (field, label) => '<label class="cw-check"><input type="checkbox" data-cw-field="' + field + '"' + (state[field] ? ' checked' : '') + '> ' + esc(label) + '</label>';
  function renderControls() {
    characters = raw ? characterOptions(raw) : [];
    loadouts = raw ? [
      { key: 'imported', name: 'Imported save', setup: null },
      { key: 'working', name: 'Working edits', setup: readCombatDraft(localStorage, state.charIdx) },
      ...readCombatLoadouts(localStorage, state.charIdx),
    ] : [];
    if (!loadouts.some(l => l.key === state.loadout)) state.loadout = 'imported';
    controls.innerHTML = '<fieldset class="cw-controls"' + (controller ? ' disabled' : '') + '>'
      + (config.characterControl === false ? '' : select('charIdx', 'Character', characters.map(c => ({ key: String(c.ci), name: c.name + ' - ' + c.className })), state.charIdx))
      + select('loadout', 'Loadout', loadouts, state.loadout)
      + '<label>Minutes per run <input type="number" data-cw-field="minutes" min="1" max="1440" step="1" value="' + state.minutes + '"></label>'
      + '<label>Seeds <input type="number" data-cw-field="seeds" min="1" max="10" step="1" value="' + state.seeds + '"></label>'
      + (config.upgradeControl === false ? '' : checkbox('upgrades', 'Compare next upgrades'))
      + (config.extraControls ? config.extraControls({ raw, state, select, checkbox }) : '')
      + checkbox('unlimited', 'Unlimited inventory') + checkbox('savedBuffs', 'Keep saved buffs') + '</fieldset>';
    runButton.disabled = !raw || !!controller || !!error;
    cancelButton.disabled = !controller;
  }
  function renderStatus(progress) {
    statusHost.innerHTML = (error ? '<p class="cw-error">' + esc(error) + '</p>' : '')
      + (stale ? '<p class="cw-warning">Save or settings changed. Results below use their captured starting configuration.</p>' : '')
      + (progress ? '<progress max="1" value="' + progress.fraction + '"></progress> ' + progress.completed + '/' + progress.total + ' runs completed' : esc(status));
  }
  function context() { return { plan, records, identity, stale, state, running: !!controller }; }
  function renderResults() { resultHost.innerHTML = plan ? config.renderResults(context()) : ''; }
  function invalidate(clear = false) {
    token++;
    controller?.abort(); controller = null;
    if (clear) { plan = null; records = []; identity = ''; stale = false; }
    else if (plan) stale = true;
    status = '';
  }
  async function run() {
    const current = ++token;
    error = '';
    try {
      if (!Number.isInteger(state.minutes) || state.minutes < 1 || state.minutes > 1440
        || !Number.isInteger(state.seeds) || state.seeds < 1 || state.seeds > 10) throw new Error('Enter 1-1440 minutes and 1-10 seeds');
      renderControls();
      const chosen = loadouts.find(l => l.key === state.loadout);
      if (!chosen) throw new Error('Selected loadout is unavailable');
      const seeds = new Set();
      while (seeds.size < state.seeds) seeds.add(crypto.getRandomValues(new Uint32Array(1))[0] || 1);
      const nextPlan = config.buildPlan(raw, {
        ...state, charIdx: state.charIdx, setup: chosen.setup, seeds: [...seeds], seconds: state.minutes * 60,
        unlimitedInventory: state.unlimited, useSavedBuffs: state.savedBuffs,
      });
      plan = nextPlan; records = []; stale = false;
      identity = (characters.find(c => c.ci === state.charIdx)?.name || 'Character') + ' - ' + chosen.name;
      controller = new AbortController();
      renderControls(); renderResults();
      const batch = await runCombatBatch({
        rawSave: raw, jobs: plan.jobs, signal: controller.signal,
        concurrency: Math.max(1, Math.min(2, (navigator.hardwareConcurrency || 2) - 1)),
        onProgress: p => { if (current === token) renderStatus(p); },
        onResult: record => { if (current === token) { records.push(record); renderResults(); } },
      });
      if (current !== token) return;
      status = batch.cancelled ? 'Cancelled. Completed runs retained; incomplete comparisons are not ranked.' : 'Comparison complete.';
      if (records.some(r => r.error)) status += ' Some runs failed; see warnings.';
    } catch (e) {
      if (current !== token) return;
      error = e.message || String(e);
    } finally {
      if (current === token) {
        controller = null; runButton.disabled = !raw; cancelButton.disabled = true;
        controls.querySelector('fieldset')?.removeAttribute('disabled');
        renderStatus();
        try { renderResults(); }
        catch (e) { error = 'Unable to render farming results: ' + (e.message || String(e)); renderStatus(); }
      }
    }
  }
  controls.addEventListener('change', event => {
    const field = event.target.dataset.cwField;
    if (!field) return;
    invalidate(); error = '';
    state[field] = event.target.type === 'checkbox' ? event.target.checked : typeof state[field] === 'number' ? Number(event.target.value) : event.target.value;
    if (field === 'charIdx') state.loadout = 'imported';
    try {
      const focus = event.target;
      if (field === 'charIdx' || config.refreshControls?.includes(field)) {
        renderControls();
        controls.querySelector('[data-cw-field="' + focus.dataset.cwField + '"]')?.focus();
      }
      renderResults();
    } catch (e) { error = e.message || String(e); }
    runButton.disabled = !raw; cancelButton.disabled = true; renderStatus();
  });
  resultHost.addEventListener('click', event => {
    const button = event.target.closest('[data-farm-action]');
    if (!button || button.disabled || !config.onAction) return;
    try { config.onAction(button.dataset.farmAction, context(), button); }
    catch (e) { error = e.message || String(e); renderStatus(); }
  });
  runButton.addEventListener('click', run);
  cancelButton.addEventListener('click', () => controller?.abort());
  return {
    setCharacter(ci) {
      if (ci === state.charIdx) return;
      invalidate(); state.charIdx = ci; state.loadout = 'imported';
      try { renderControls(); renderResults(); renderStatus(); }
      catch (e) { error = e.message || String(e); renderStatus(); }
    },
    load(nextRaw, metadata = {}) {
      raw = nextRaw;
      if (metadata.source === 'auto-refresh') { if (plan) stale = true; }
      else { invalidate(true); error = ''; }
      try {
        if (!characterOptions(raw).some(c => c.ci === state.charIdx)) { state.charIdx = 0; state.loadout = 'imported'; }
        renderControls(); renderResults(); renderStatus();
      } catch (e) { error = e.message || String(e); runButton.disabled = true; renderStatus(); }
    },
  };
}
