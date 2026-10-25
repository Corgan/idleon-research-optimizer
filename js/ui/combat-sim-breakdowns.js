import { renderBreakdownTree } from './dash-breakdowns.js';
import { toRenderNode } from '../stats/tree-builder.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const exact = value => typeof value === 'number' && Number.isFinite(value) ? String(value) : 'Unavailable';
const treeText = node => node ? [node.name, node.note, ...(node.children || []).map(treeText)].join(' ') : '';
const safeTree = node => ({ ...node, name: esc(node.name), note: esc(node.note),
  children: node.children?.map(safeTree) });

export function mountCombatStatBreakdowns(host, { capture }) {
  host.innerHTML = '<h2>Stat breakdowns</h2><div class="toolbar">'
    + '<button type="button" class="btn" data-stat-inspect>Inspect selected loadout</button>'
    + '<button type="button" class="btn secondary" data-stat-cancel hidden>Cancel</button>'
    + '<label>Context<select data-stat-context><option value="active">Active combat</option><option value="afk">AFK estimates</option></select></label>'
    + '<label>Group<select data-stat-group><option value="">All stats</option></select></label>'
    + '<label>Search<input type="search" data-stat-search placeholder="Drop rate, respawn, companion..."></label></div>'
    + '<div class="note">Uses the character, loadout and map selected above, including Imported save. Inspecting never changes working edits or runs a timed simulation. Expand a stat to see its sources; values are shown without rounding.</div>'
    + '<div data-stat-status role="status"></div><div data-stat-error class="err" role="alert"></div>'
    + '<div data-stat-results></div><div id="combat-stat-tooltip" class="exp-tooltip" role="tooltip"></div>';
  const $ = selector => host.querySelector(selector);
  let worker = null, job = null, result = null, stale = false, sequence = 0;
  const status = () => {
    $('[data-stat-status]').textContent = (job ? 'Calculating ' + job.label + '...' : result ? result.label : '')
      + (stale ? ' - Settings or save changed; these are the captured starting stats. Inspect again for current values.' : '');
  };
  function cancel() {
    worker?.terminate(); worker = null; job = null;
    $('[data-stat-cancel]').hidden = true;
  }
  function mountTree(node, container) {
    renderBreakdownTree(toRenderNode(safeTree(node)), container, { tooltipId: 'combat-stat-tooltip', openDepth: 0 });
    const tip = $('#combat-stat-tooltip'), hide = () => { tip.style.display = 'none'; };
    const show = event => {
      const row = event.target.closest('.bt-row[data-bt-note]')
        || container.querySelector('.bt-row[data-bt-note]:focus');
      if (!row) { hide(); return; }
      tip.textContent = row.dataset.btNote;
      tip.style.display = 'block';
      const rect = row.getBoundingClientRect();
      tip.style.left = Math.max(8, Math.min((event.clientX ?? rect.left) + 14, innerWidth - tip.offsetWidth - 8)) + 'px';
      tip.style.top = Math.max(8, Math.min((event.clientY ?? rect.bottom) + 14, innerHeight - tip.offsetHeight - 8)) + 'px';
    };
    container.querySelectorAll('.bt-row').forEach(row => {
      row.tabIndex = 0;
      row.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); row.click(); }
      });
    });
    container.onmouseover = container.onmousemove = show;
    container.addEventListener('focusin', show);
    container.onmouseout = event => {
      const row = event.target.closest('.bt-row');
      if (row?.contains(event.relatedTarget)) return;
      const focused = container.querySelector('.bt-row[data-bt-note]:focus');
      if (focused) show({ target: focused }); else hide();
    };
    container.addEventListener('focusout', hide);
    container.addEventListener('keydown', event => { if (event.key === 'Escape') hide(); });
  }
  function render() {
    $('#combat-stat-tooltip').style.display = 'none';
    const body = $('[data-stat-results]');
    if (!result) { body.innerHTML = ''; return; }
    const data = result.data, afk = $('[data-stat-context]').value === 'afk';
    const rows = afk ? data.afk.rows : data.active;
    const selected = $('[data-stat-group]').value;
    const groups = [...new Set(rows.map(r => r.group))];
    $('[data-stat-group]').innerHTML = '<option value="">All stats</option>' + groups.map(g =>
      '<option value="' + esc(g) + '">' + esc(g) + '</option>').join('');
    $('[data-stat-group]').value = groups.includes(selected) ? selected : '';
    const query = $('[data-stat-search]').value.trim().toLowerCase(), group = $('[data-stat-group]').value;
    let html = '<div class="note">Character ' + (data.charIdx + 1) + ', map ' + data.mapIdx
      + (data.mapIdx === 216 ? ', cavern ' + esc(data.holeCavern) : '') + '. '
      + (afk ? 'AFK uses exported buffs and the AFK gain calculator context, not active fighting rates. Hourly outcomes assume starting food; use AFK gains for finite claims and depletion.'
        : (data.savedBuffs ? 'Exported buffs kept.' : 'Map-entry buff policy: only permanent form toggles kept.')
          + ' Formula trees resolve starting inputs, not future buffs, orb stacks, changing targets or level-ups.') + '</div>';
    if (afk) html += [data.afk.reason, ...data.afk.warnings].filter(Boolean).map(w =>
      '<div class="warn">' + esc(w) + '</div>').join('');
    html += '<details><summary>Captured overrides &amp; context</summary><pre>' + esc(JSON.stringify({
      player: result.request.player || 'auto', inputOverrides: result.request.inputOverrides || {},
      mechanics: result.request.toggles ?? result.request.setup?.toggles ?? {},
      terms: result.request.termOverrides ?? result.request.setup?.termOverrides ?? {},
      forms: data.forms,
    }, null, 2)) + '</pre></details>';
    const visible = rows.map((row, index) => ({ row, index })).filter(({ row }) =>
      (!group || row.group === group) && (!query || [row.name, row.id, row.reason, treeText(row.node)].join(' ').toLowerCase().includes(query)));
    html += '<div class="combat-stat-grid">' + visible.map(({ row, index }) =>
      '<details class="combat-stat-card" data-stat-row="' + index + '"><summary><span>' + esc(row.name)
      + '</span><strong>' + (row.status === 'error' || row.status === 'unavailable' || row.status === 'not applicable'
        ? esc(row.status) : esc(exact(row.node?.val))) + '</strong></summary>'
      + '<div class="note">' + esc(row.group + ' / ' + row.id + ' / ' + row.status) + '</div>'
      + (row.reason ? '<div class="' + (row.status === 'error' ? 'err' : 'note') + '">' + esc(row.reason) + '</div>' : '')
      + '<div data-stat-tree></div></details>').join('') + '</div>';
    if (!visible.length) html += '<div class="note">No matching stats.</div>';
    if (!afk) {
      html += '<details data-stat-respawn><summary>Respawn by monster definition</summary><div data-stat-respawn-tree></div>'
        + '<div class="scroll"><table class="data-table"><thead><tr><th>Monster</th><th>Respawn seconds</th><th>Bonus %</th><th>Context</th></tr></thead><tbody>'
        + data.respawn.map((r, index) => '<tr><td>' + esc(r.type) + '</td><td>' + esc(exact(r.seconds)) + '</td><td>'
          + (r.breakdown ? '<details data-stat-def="' + index + '"><summary>' + esc(exact(r.bonusPct))
            + '% - sources</summary><div data-stat-def-tree></div></details>' : esc(exact(r.bonusPct)))
          + '</td><td>' + esc(r.note) + '</td></tr>').join('')
        + '</tbody></table></div><div class="note">These are definition timers before the live one-second respawn countdown, talent reductions and minimum delay. Dynamic spawns can have their own timers.</div></details>';
      html += '<details><summary>Player after initialization (forms &amp; final replacements)</summary><pre>'
        + esc(JSON.stringify(data.player, null, 2)) + '</pre><div class="note">Normal formula trees above can be replaced by a form. Form inputs and coefficients are in Input provenance below; a normal formula is not a form damage breakdown.</div></details>';
      const inputs = Object.entries(data.inputs).filter(([key, e]) => !query ||
        (key + ' ' + e.source + ' ' + (e.note || '')).toLowerCase().includes(query));
      html += '<details><summary>Input provenance (' + inputs.length + ')</summary>'
        + '<div class="note">Every scalar simulator input, plus form coefficients and respawn divisors. Source-only entries do not claim to have a full formula tree. Runtime defaults and unavailable inputs are labeled explicitly.</div>'
        + '<div class="scroll"><table class="data-table"><thead><tr><th>Input</th><th>Value</th><th>Status</th><th>Source / notes</th></tr></thead><tbody>'
        + inputs.map(([key, e]) => '<tr><td>' + esc(key) + '</td><td>' + (e.value != null && typeof e.value === 'object'
          ? '<details><summary>Components</summary><pre>' + esc(JSON.stringify(e.value, null, 2)) + '</pre></details>'
          : esc(typeof e.value === 'number' ? exact(e.value) : String(e.value ?? 'Unavailable')))
          + '</td><td>' + (e.overridden ? 'override' : e.unavailable ? 'unavailable' : e.notApplicable ? 'not applicable' : e.partial ? 'partial' : e.initializedReplacement ? 'player replacement' : 'resolved')
          + '</td><td>' + esc(e.source) + (e.note ? '<br>' + esc(e.note) : '') + '</td></tr>').join('')
        + '</tbody></table></div></details>';
    }
    body.innerHTML = html;
    body.querySelectorAll('[data-stat-row]').forEach(el => {
      el.addEventListener('toggle', () => {
        const tree = el.querySelector('[data-stat-tree]'), row = rows[Number(el.dataset.statRow)];
        if (el.open && row.node && !tree.childElementCount && Number.isFinite(row.node.val))
          mountTree(row.node, tree);
      });
    });
    const respawn = body.querySelector('[data-stat-respawn]');
    if (respawn) respawn.addEventListener('toggle', () => {
      const tree = respawn.querySelector('[data-stat-respawn-tree]'), node = data.inputs.respawnRescale?.breakdown;
      if (respawn.open && node && !tree.childElementCount)
        mountTree(node, tree);
    });
    body.querySelectorAll('[data-stat-def]').forEach(el => el.addEventListener('toggle', () => {
      const tree = el.querySelector('[data-stat-def-tree]'), node = data.respawn[Number(el.dataset.statDef)].breakdown;
      if (el.open && node && !tree.childElementCount) mountTree(node, tree);
    }));
  }
  function inspect(request, label) {
    cancel(); result = null; stale = false; render(); $('[data-stat-error]').textContent = '';
    try {
      if (!request.rawSave) throw new Error('Load a save before inspecting stats.');
      job = { id: ++sequence, label, request };
      status(); $('[data-stat-cancel]').hidden = false;
      worker = new Worker(new URL('../workers/combat-sim-worker.js', import.meta.url), { type: 'module' });
      worker.onmessage = ({ data: msg }) => {
        if (!job || msg.id !== job.id) return;
        if (msg.type === 'error') {
          $('[data-stat-error]').textContent = 'Stat inspection failed: ' + msg.message;
          cancel(); status(); return;
        }
        if (msg.type !== 'breakdowns') return;
        try {
          if (!msg.breakdowns?.active || !msg.breakdowns?.afk?.rows) throw new Error('Worker returned no stat breakdowns.');
          result = { label: job.label, request: job.request, data: msg.breakdowns };
          cancel(); status(); render();
        } catch (error) {
          cancel(); $('[data-stat-error]').textContent = 'Could not render stat breakdowns: ' + error.message; status();
        }
      };
      worker.onerror = error => {
        error.preventDefault(); cancel(); status();
        $('[data-stat-error]').textContent = 'Stat worker failed: ' + (error.message || 'Could not load worker.');
      };
      worker.onmessageerror = () => {
        cancel(); status(); $('[data-stat-error]').textContent = 'Stat worker response could not be decoded.';
      };
      worker.postMessage({ ...request, id: job.id, type: 'breakdowns', telemetry: false });
    } catch (error) {
      cancel(); status(); $('[data-stat-error]').textContent = error.message;
    }
  }
  $('[data-stat-inspect]').addEventListener('click', () => {
    try { const captured = capture(); inspect(captured.request, captured.label); }
    catch (error) { $('[data-stat-error]').textContent = error.message; }
  });
  $('[data-stat-cancel]').addEventListener('click', () => { cancel(); status(); $('[data-stat-error]').textContent = 'Stat inspection cancelled.'; });
  $('[data-stat-context]').addEventListener('change', render);
  $('[data-stat-group]').addEventListener('change', render);
  $('[data-stat-search]').addEventListener('input', render);
  return {
    inspect,
    changed() { if (result || job) { stale = true; status(); } },
    onSave(meta) {
      if (meta?.source !== 'auto-refresh' && job) {
        cancel(); $('[data-stat-error]').textContent = 'Stat inspection cancelled because a new save was loaded.';
      }
      if (result || job) stale = true;
      status();
    },
  };
}
