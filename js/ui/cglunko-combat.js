import { farmingEscape as esc, farmingFormat as number } from './combat-farming.js';
import { characterOptions } from '../stats/systems/common/combat-sim-setup.js';
import { readCombatDraft, readCombatLoadouts } from './combat-sim-loadouts.js';
import { buildCoveProgressionPlan } from '../stats/systems/w5/cglunko-progression.js';
import { COVE_STONE_NAMES } from '../stats/systems/w5/cglunko-combat.js';
import { upgName } from '../stats/systems/w5/cglunko.js';
import { runCoveProgression } from '../workers/cglunko-planner-client.js';

const STORAGE = 'cove-progression-v1';
const time = h => h === 0 ? 'Now' : h < 1 / 60 ? (h * 3600).toFixed(1) + 's'
  : h < 1 ? (h * 60).toFixed(1) + 'm' : h < 48 ? h.toFixed(1) + 'h' : (h / 24).toFixed(1) + 'd';
const focus = (v, color) => v ? (color ? 'Purple' : 'Blue') + ' #' + v : 'Unfocused';
const pct = (dr, start) => (dr / start >= 1 ? '+' : '') + ((dr / start - 1) * 100).toFixed(1) + '%';

export function mountCoveCombat(host) {
  let raw = null, controller = null, token = 0, workerPlan = null, result = null, stale = false, cancelled = false, identity = '';
  let error = '', status = '', loadouts = [], characters = [];
  const state = { charIdx: 0, loadout: 'imported', minutes: 10, seeds: 2,
    depth: 8, width: 6, measurements: 128, horizonHours: 168, unlimited: false, savedBuffs: false };
  host.className = 'section cw-combat cove-progression';
  host.innerHTML = '<h2>Cove progression planner</h2><div data-controls></div>'
    + '<p class="cw-note">Maximize Cove DR over the selected active-farming window. Find the next useful upgrade even when it takes longer.</p>'
    + '<div data-status role="status" aria-live="polite"></div><div data-results></div>';
  const controls = host.querySelector('[data-controls]'), output = host.querySelector('[data-results]'), statusHost = host.querySelector('[data-status]');
  function choices() {
    characters = raw ? characterOptions(raw) : [];
    loadouts = [{ key: 'imported', name: 'Imported save', setup: null }];
    if (!raw) return;
    const draft = readCombatDraft(localStorage, state.charIdx);
    if (draft.patches.length || Object.keys(draft.toggles || {}).length || Object.keys(draft.termOverrides || {}).length) {
      loadouts.push({ key: 'working', name: 'Working edits', setup: draft });
    }
    loadouts.push(...readCombatLoadouts(localStorage, state.charIdx));
    if (!loadouts.some(l => l.key === state.loadout)) state.loadout = 'imported';
  }
  const select = (key, label, options) => '<label>' + label + '<select data-field="' + key + '">'
    + options.map(o => '<option value="' + esc(o.key) + '"' + (String(state[key]) === String(o.key) ? ' selected' : '') + '>' + esc(o.name) + '</option>').join('') + '</select></label>';
  const input = (key, label, min, max) => '<label>' + label + '<input data-field="' + key + '" type="number" step="1" min="' + min + '" max="' + max + '" value="' + esc(key === 'horizonHours' ? state[key] / 24 : state[key]) + '"></label>';
  const check = (key, label) => '<label class="cw-check"><input type="checkbox" data-field="' + key + '"' + (state[key] ? ' checked' : '') + '> ' + label + '</label>';
  function renderControls() {
    const open = controls.querySelector('details')?.open;
    choices();
    controls.innerHTML = '<fieldset class="cw-controls"' + (controller ? ' disabled' : '') + '>'
      + select('charIdx', 'Character', characters.map(c => ({ key: c.ci, name: c.name + ' - ' + c.className })))
      + (loadouts.length > 1 ? select('loadout', 'Loadout', loadouts) : '')
      + input('horizonHours', 'Days ahead', 1, 365)
      + '<button type="button" data-run' + (!raw ? ' disabled' : '') + '>Grow DR</button></fieldset>'
      + '<button type="button" data-cancel' + (!controller ? ' hidden' : '') + '>Cancel</button>'
      + '<details class="cove-advanced"' + (open ? ' open' : '') + '><summary>Advanced</summary><fieldset class="cw-controls"' + (controller ? ' disabled' : '') + '>'
      + input('minutes', 'Minutes per income sample', 1, 120) + input('seeds', 'Seeds', 1, 6)
      + input('depth', 'Max purchases', 1, 24)
      + input('width', 'Search width', 1, 12) + input('measurements', 'Max measured states', 2, 512)
      + check('unlimited', 'Unlimited inventory') + check('savedBuffs', 'Keep saved buffs') + '</fieldset></details>';
  }
  function renderStatus(progress) {
    statusHost.innerHTML = (error ? '<p class="cw-error">' + esc(error) + '</p>' : '')
      + (stale ? '<p class="cw-warning">Captured save/settings are stale; rerun before following this plan.</p>' : '')
      + (progress ? '<progress max="1" value="' + progress.fraction + '"></progress> '
        + Math.floor(progress.completed) + '/' + progress.total + ' income states &middot; ' + Math.floor(progress.fraction * 100) + '%'
        : '<span class="cw-note">' + esc(status) + '</span>');
  }
  function renderResults() {
    if (!result?.initialMeasurement) { output.innerHTML = ''; return; }
    const routes = [...result.routes, result.baseline];
    const best = routes.reduce((a, b) => b.dr > a.dr || (b.dr === a.dr && b.bought <= a.bought) ? b : a);
    const later = result.nextUpgrade, laterBuy = later?.steps.find(s => s.kind === 'purchase');
    output.innerHTML = '<p class="cw-note">' + esc(identity) + ' &middot; Starting DR ' + number(result.startDR) + ' &middot; ' + time(result.horizonHours) + ' active farming'
      + (cancelled ? ' &middot; Cancelled: partial search' : '') + '</p>'
      + '<table class="data-table cw-table"><thead><tr><th>Route</th><th>Buy next / ETA</th><th>Blue focus</th><th>Purple focus</th><th>DR after ' + time(result.horizonHours) + '</th></tr></thead><tbody>'
      + routes.map((r, index) => {
        const buy = r.steps.find(s => s.kind === 'purchase'), first = r.steps[0]?.focuses || workerPlan.initial.focuses;
        const label = r.reference ? 'No purchases (saved focus)' + (!cancelled && r === best ? ' - best found' : '')
          : !cancelled && r === best ? 'Best found' : 'Alternative ' + (index + 1);
        const cell = (name, value) => '<td data-label="' + name + '">' + value + '</td>';
        return '<tr><td>' + label + '<details data-route="' + index + '"><summary>Steps &amp; DR chart</summary></details></td>'
          + cell('Buy next / ETA', buy ? esc(upgName(buy.upgrade)) + '<small>Lv ' + (buy.to - 1) + ' &rarr; ' + buy.to + ' &middot; ' + time(buy.hours) + '</small>'
            : 'Keep farming')
          + cell('Blue focus', focus(first[0], 0)) + cell('Purple focus', focus(first[1], 1))
          + cell('Projected DR', number(r.dr) + '<small>' + pct(r.dr, result.startDR) + '</small>') + '</tr>'
          + '<tr data-route-row="' + index + '" hidden><td colspan="5"><div data-route-body></div></td></tr>';
      }).join('') + '</tbody></table>'
      + (laterBuy && !cancelled ? '<p class="cw-note"><strong>Next useful upgrade beyond ' + time(result.horizonHours) + ':</strong> '
        + esc(upgName(laterBuy.upgrade)) + ' &rarr; Lv ' + laterBuy.to + ' in ' + time(later.hours) + ' &middot; '
        + focus(later.steps[0]?.focuses[0] ?? 0, 0) + ' / ' + focus(later.steps[0]?.focuses[1] ?? 0, 1)
        + ' &middot; DR ' + number(later.dr) + ' (' + pct(later.dr, later.drWithoutPurchase) + ' from purchase). '
        + 'Separate long-range estimate using starting income.</p>'
        + '<details data-route="next"><summary>Next-upgrade steps</summary></details><div data-route-row="next" hidden><div data-route-body></div></div>' : '')
      + (!cancelled && !laterBuy && !routes.some(r => r.bought && r.dr > result.baseline.dr)
        ? '<p class="cw-note">No better purchase path found. Next-upgrade ETA unavailable within the one-year estimate; unknown drops or digit losses may limit it.</p>' : '')
      + '<p class="cw-note">Expected projections, not guaranteed outcomes. ' + result.measured + ' measured states &middot; '
      + (result.limited ? 'Search budget limited. ' : '') + 'All rows include farming through ' + time(result.horizonHours) + '.</p>'
      + (result.unobserved.length ? '<p class="cw-warning">No sampled drops for ' + esc(result.unobserved.join(', ')) + '. These are unknown incomes, not proven zero; increase sample time/seeds.</p>' : '')
      + '<details class="cw-note"><summary>Sampling assumptions' + (result.warnings.length ? ' & warnings (' + result.warnings.length + ')' : '') + '</summary>'
      + '<p>All twelve stones accrue together. Purchases spend the native denomination at the current-level cost, retaining the native 0.1 exhausted balance. '
      + 'Digit/kill thresholds, daily discount resets and joint focus choices are projected; income is remeasured at retained event states. '
      + 'After each route&apos;s last measured state, its latest income is held fixed through the common horizon; no unmeasured DR scaling is invented. '
      + 'The bounded search allows up to ' + workerPlan.settings.depth + ' purchases. The separate next-upgrade estimate searches one purchase up to one year, holding initial income fixed. '
      + 'Every active sample starts from a fresh map entry, including SB Plunderous loot. The projection assumes a map/stat refresh at event states; travel time is excluded. '
      + 'Focus changes use expected pickup multipliers; rare drops and transient ramps add uncertainty. '
      + 'Food, buffs, combat levels and other account progress are not carried between samples. No AFK multiplier, imported-save changes or loadout writes. '
      + (workerPlan.keepBuffs ? 'Saved buffs retained. ' : 'Fresh-entry buffs. ') + (workerPlan.unlimitedInventory ? 'Unlimited inventory. ' : 'Real inventory limits. ')
      + workerPlan.seconds / 60 + ' minute samples, ' + workerPlan.seeds.length + ' seeds.</p>'
      + result.warnings.map(w => '<p>' + esc(w) + '</p>').join('') + '</details>';
  }
  function routeDetails(route) {
    const maxH = Math.max(1 / 3600, route.hours), top = Math.max(...route.steps.map(s => Math.max(s.dr, s.drFarm)), result.startDR) * 1.03;
    const x = h => 48 + 540 * h / maxH, y = dr => 104 - 84 * dr / top;
    const points = [[x(0), y(result.startDR)]];
    for (const step of route.steps) points.push([x(step.hours), y(step.drBefore)], [x(step.hours), y(step.drFarm)], [x(step.hours), y(step.dr)]);
    return '<svg class="cove-chart" viewBox="0 0 640 130" role="img" aria-label="Projected Cove DR over time">'
      + '<line x1="48" x2="588" y1="' + y(result.startDR) + '" y2="' + y(result.startDR) + '" stroke="var(--accent)" stroke-dasharray="4 3"/>'
      + '<polyline fill="none" stroke="var(--cyan)" stroke-width="2" points="' + points.map(p => p.join(',')).join(' ') + '"/>'
      + '<text x="2" y="16">DR</text><text x="48" y="125">Now</text><text x="550" y="125">' + time(route.hours) + '</text></svg>'
      + '<p class="cw-note">Income sampled through ' + time(route.sampledThrough ?? 0) + '; held fixed for the remaining forecast.</p>'
      + '<div class="cove-steps"><table class="data-table"><thead><tr><th>At</th><th>Farm / focus</th><th>Then</th><th>DR</th></tr></thead><tbody>'
      + route.steps.map(s => '<tr><td>' + time(s.hours) + '</td><td>' + (s.duration ? 'Farm ' + time(s.duration) + '<br>' : '')
        + focus(s.focuses[0], 0) + ' / ' + focus(s.focuses[1], 1) + '</td><td>'
        + (s.kind === 'purchase' ? 'Buy ' + esc(upgName(s.upgrade)) + ' &rarr; Lv ' + s.to + '<small>Pay ' + esc(String(s.cost)) + ' ' + COVE_STONE_NAMES[s.stone] + '</small>'
          : s.kind === 'reset' ? 'Daily discount reset' : s.kind === 'horizon' ? 'End of farming window'
            : 'DR ' + (s.kind === 'kills' ? 'kill' : 'stone-digit') + ' breakpoint / refresh')
        + '</td><td>' + number(s.dr) + '<small>' + pct(s.dr, result.startDR) + '</small></td></tr>').join('') + '</tbody></table></div>';
  }
  function stop(clear) {
    token++; controller?.abort(); controller = null;
    if (clear) { result = null; workerPlan = null; stale = false; }
    else if (result) stale = true;
  }
  async function run() {
    const current = ++token;
    error = ''; status = '';
    try {
      choices();
      if (!Number.isInteger(state.minutes) || state.minutes < 1 || state.minutes > 120 || !Number.isInteger(state.seeds) || state.seeds < 1 || state.seeds > 6) throw new Error('Use 1-120 minutes and 1-6 seeds');
      const chosen = loadouts.find(l => l.key === state.loadout), seeds = new Set();
      while (seeds.size < state.seeds) seeds.add(crypto.getRandomValues(new Uint32Array(1))[0] || 1);
      workerPlan = buildCoveProgressionPlan(raw, { ...state, setup: chosen.setup, seconds: state.minutes * 60, seeds: [...seeds],
        unlimitedInventory: state.unlimited, useSavedBuffs: state.savedBuffs });
      identity = (characters.find(c => c.ci === state.charIdx)?.name || 'Character') + ' - ' + chosen.name;
      result = null; stale = false; cancelled = false; controller = new AbortController();
      renderControls(); renderResults();
      const completed = await runCoveProgression({ plan: workerPlan, signal: controller.signal,
        concurrency: Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1)),
        onProgress: p => { if (current === token) renderStatus(p); } });
      if (current !== token) return;
      result = completed.result; cancelled = completed.cancelled;
      status = cancelled ? 'Cancelled. Completed paths retained; no recommendation.' : 'Search complete.';
    } catch (e) { if (current === token) error = e.message || String(e); }
    finally {
      if (current === token) {
        controller = null;
        renderControls(); renderStatus();
        try { renderResults(); } catch (e) { error = 'Unable to render progression paths: ' + (e.message || String(e)); renderStatus(); }
      }
    }
  }
  controls.addEventListener('change', event => {
    const field = event.target.dataset.field;
    if (!field) return;
    stop(false); error = ''; status = '';
    state[field] = event.target.type === 'checkbox' ? event.target.checked : typeof state[field] === 'number' ? Number(event.target.value) : event.target.value;
    if (field === 'horizonHours') state[field] *= 24;
    if (field === 'charIdx') state.loadout = 'imported';
    try {
      localStorage.setItem(STORAGE, JSON.stringify(state));
      if (field === 'charIdx') { renderControls(); controls.querySelector('[data-field="charIdx"]')?.focus(); }
      renderStatus();
    } catch (e) { error = e.message || String(e); renderStatus(); }
  });
  controls.addEventListener('click', event => {
    if (event.target.closest('[data-run]')) run();
    if (event.target.closest('[data-cancel]')) controller?.abort();
  });
  output.addEventListener('toggle', event => {
    const detail = event.target;
    if (!detail.hasAttribute('data-route')) return;
    try {
      const row = output.querySelector('[data-route-row="' + detail.dataset.route + '"]');
      row.hidden = !detail.open;
      if (!detail.open) return;
      const body = row.querySelector('[data-route-body]');
      if (!body.hasChildNodes()) body.innerHTML = routeDetails(detail.dataset.route === 'next'
        ? result.nextUpgrade : [...result.routes, result.baseline][Number(detail.dataset.route)]);
    } catch (e) { error = e.message || String(e); renderStatus(); }
  }, true);
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE) || '{}');
    for (const key of Object.keys(state)) if (Object.hasOwn(saved, key) && typeof saved[key] === typeof state[key]) state[key] = saved[key];
    renderControls();
  } catch (e) { error = 'Cove settings: ' + (e.message || String(e)); renderStatus(); }
  return {
    load(nextRaw, metadata = {}) {
      const auto = metadata.source === 'auto-refresh';
      raw = nextRaw;
      if (auto && workerPlan) stale = true;
      else if (!auto) { stop(true); error = ''; status = ''; }
      try {
        if (!characterOptions(raw).some(c => c.ci === state.charIdx)) { state.charIdx = 0; state.loadout = 'imported'; }
        if (!auto || !controls.querySelector('select')?.options.length) renderControls();
        if (!auto) renderResults();
        renderStatus();
      } catch (e) { error = e.message || String(e); renderStatus(); }
    },
  };
}
