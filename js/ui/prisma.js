import { initSaveLoader } from './save-loader.js';
import { prismaPlan, prismaOutcome } from '../stats/prisma.js';
import { fmtVal } from '../renderers/format.js';

const $ = id => document.getElementById(id);
const esc = value => String(value).replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const exact = value => Number(value).toLocaleString('en-US', { maximumSignificantDigits: 17 });
const number = value => value == null ? 'Unavailable' : value !== 0 && Math.abs(value) < .001
  ? value.toExponential(3) : fmtVal(value);
const signed = value => (value > 0 ? '+' : '') + number(value);
const cache = new Map(), expanded = new Set(), pages = new Map();
const PAGE_SIZE = 100, CACHE_BYTES = 32 * 1024 * 1024;
const renderedRows = new Map();
let renderedRecord, updateTimer = null, pendingUpdate;
let raw, latestRaw, charIdx = 0, cauldron = 0, worker, request = 0, active, stale = false;
let tooltipTarget;
let rankMetricIds = new Set();
const key = () => charIdx + ':' + cauldron + ':' + Number($('afk-hours').value);
const current = () => cache.get(key());

function deltaText(change) {
  if (change.absolute || change.percent === null) return signed(change.delta) + ' ' + change.name;
  const percent = change.percent;
  return (percent > 0 ? '+' : '') + (percent !== 0 && Math.abs(percent) < .001
    ? percent.toExponential(2) : percent.toLocaleString('en-US', { maximumFractionDigits: 3 })) + '% ' + change.name;
}

function tooltip(change, comparison) {
  return `${change.name}\nBefore: ${exact(change.before)}\nAfter: ${exact(change.after)}\nChange: ${exact(change.delta)}`
    + (change.percent === null ? '\nRelative change unavailable: starting value is zero.' : `\nRelative change: ${exact(change.percent)}%`)
    + (comparison === 'retained' ? '\nComparison: without this Prisma -> current save.'
      : comparison === 'added' ? '\nComparison: current save -> with this Prisma.' : '')
    + (change.partial ? '\nPartial calculation.' : '') + (change.reason ? '\n' + change.reason : '');
}

function outcomeHtml(change, compact = false, comparison) {
  const good = change.lowerIsBetter ? change.delta < 0 : change.delta > 0;
  return `<span class="outcome ${change.delta === 0 ? 'muted' : good ? 'positive' : 'negative'}" tabindex="0"
    data-tip="${esc(tooltip(change, comparison))}" data-metric="${esc(change.id)}" data-before="${change.before}" data-after="${change.after}"
    data-delta="${change.delta}">${compact ? esc(number(change.before)) + ' &rarr; ' + esc(number(change.after))
      + '<br>' + esc(deltaText({ ...change, name: '' })) : esc(deltaText(change))}${change.partial ? ' <span class="partial">Partial</span>' : ''}</span>`;
}

function breedingSequenceHtml(result, baseline) {
  const groups = new Map();
  for (const change of result.changes) {
    const match = /^(breeding-sequence:\d+:\d+:(?:new|shiny)):(keep|trash):(.+)$/.exec(change.id);
    if (!match) continue;
    if (!groups.has(match[1])) groups.set(match[1], new Map());
    groups.get(match[1]).set(match[3], change);
  }
  return [...groups].map(([id, fields]) => {
    const first = fields.values().next().value;
    const heading = first.name.split(' - ').slice(0, 2).join(' - ');
    const cells = [...fields].map(([field, change]) => {
      const label = change.name.split(' - ').at(-1);
      return `<tr><th scope="row">${esc(label)}</th>${['keep', 'trash'].map(policy => {
        const metricId = `${id}:${policy}:${field}`;
        const metric = prismaOutcome(result, baseline, metricId);
        return `<td>${metric ? outcomeHtml(metric, true, result.comparison) : '<span class="partial">Unavailable</span>'}</td>`;
      }).join('')}</tr>`;
    }).join('');
    return `<h3>${esc(heading)}</h3><p class="note">Up to 64 hatches from saved eggs and native refills.
      Expected gains cover this bounded prefix only; unfinished branches are not extrapolated.
      Breeding levels and cached multipliers remain fixed.</p><table aria-label="${esc(heading)} policy comparison">
      <thead><tr><th>Outcome</th><th>Keep successes</th><th>Trash all</th></tr></thead><tbody>${cells}</tbody></table>`;
  }).join('');
}

function sourceCoverageHtml(row) {
  const coverage = row.sourceCoverage;
  if (!coverage) return '';
  return `<p class="note partial">Downstream coverage is incomplete. Native references are an audit checklist, not proof that every effect is measured.</p>
    ${coverage.consumers.length ? detailShell('references', coverage.consumers.length + ' direct native reference(s)')
      : '<p class="note">No direct literal consumer found. Aliased, computed and table-driven uses are not ruled out.</p>'}`;
}

function detailShell(kind, summary) {
  return `<details data-detail="${kind}"><summary>${esc(summary)}</summary><div data-lazy="${kind}"></div></details>`;
}

function pageHost(kind) {
  return `<div data-page="${kind}"></div>`;
}

function renderPage(host, record, row) {
  const result = row && record.results.get(row.id), kind = host.dataset.page;
  const id = key() + ':' + (row?.id || 'baseline') + ':' + kind;
  const limit = pages.get(id) || PAGE_SIZE;
  let entries, html;
  if (kind === 'baseline') {
    entries = record.baseline;
    html = entries.slice(0, limit).map(metric => `<div class="result-line"><span>${esc(metric.name)}${metric.intermediate ? ' (intermediate)' : ''}</span><span class="exact">${
      metric.notApplicable ? 'Not applicable' : metric.unavailable ? 'Unavailable: ' + esc(metric.reason) : esc(number(metric.val))
        + (metric.partial ? ' (Partial: ' + esc(metric.reason) + ')' : '')}</span></div>`).join('');
  } else if (kind === 'unavailable') {
    entries = result.unavailable;
    html = entries.slice(0, limit).map(metric => `<p class="note" data-unavailable-record>${esc(metric.name)}: ${esc(metric.reason)}</p>`).join('');
  } else {
    entries = kind === 'intermediates' ? result.intermediates
      : result.changes.filter(change => !change.id.startsWith('breeding-sequence:'));
    html = entries.slice(0, limit).map(change => `<div class="result-line">${outcomeHtml(change, false, result.comparison)}${
      kind === 'outcomes' ? `<span class="exact">${esc(number(change.before))} &rarr; ${esc(number(change.after))}</span>` : ''}</div>`).join('');
  }
  host.innerHTML = html + (entries.length > limit
    ? `<p class="note">Showing ${limit} of ${entries.length} records.</p><button type="button" data-more>Show next ${Math.min(PAGE_SIZE, entries.length - limit)}</button>` : '');
}

function renderDetails(host, record, row) {
  const result = record.results.get(row.id), kind = host.dataset.lazy;
  if (kind === 'results') {
    host.innerHTML = `<div class="results-detail">
      <p class="note">${row.status === 'already' ? 'Benefit retained: without this Prisma &rarr; current save.'
        : 'Potential gain: current save &rarr; with this Prisma.'} Every other Prisma flag stays unchanged.</p>
      <p class="note">Base bubble bonus: ${esc(number(result.bubbleBefore))} &rarr; ${esc(number(result.bubbleAfter))}.
      This bonus is not itself a downstream stat gain.</p>
      ${pageHost('outcomes')}
      ${result.changes.some(change => change.id.startsWith('breeding-sequence:'))
        ? detailShell('breeding', 'Breeding sequence policy comparisons') : ''}
      ${result.intermediates?.length ? detailShell('intermediates',
        result.intermediates.length + ' changed processed bubble bonus(es), not additional outcomes') : ''}
      ${sourceCoverageHtml(row)}
      ${result.unavailable.length ? detailShell('unavailable',
        result.unavailable.length + ' unavailable outcome/intermediate record(s)') : ''}
      </div>`;
  } else if (kind === 'coverage') host.innerHTML = sourceCoverageHtml(row);
  else if (kind === 'references') host.innerHTML = row.sourceCoverage.consumers.map(ref =>
    `<p class="note">${esc(ref.method.replace('_customBlock_', '').replace('_event_', 'Event '))}
      ${ref.mode == null ? '' : ' / ' + esc(ref.mode)} - source line ${ref.line}${ref.kind === 'base-call' ? ' (base bonus call)' : ''}</p>`).join('');
  else if (kind === 'breeding') host.innerHTML = breedingSequenceHtml(result, record.baseline);
  else host.innerHTML = pageHost(kind);
  for (const page of host.querySelectorAll('[data-page]')) renderPage(page, record, row);
  bindDetails(host, record);
}

function bindDetails(host, record) {
  for (const details of host.querySelectorAll('details[data-bubble], details[data-detail]')) {
    if (details.dataset.bound) continue;
    details.dataset.bound = 'true';
    const row = record.plan.rows.find(row => row.id === details.closest('[data-bubble-id]').dataset.bubbleId);
    const id = key() + ':' + row.id + (details.dataset.detail ? ':' + details.dataset.detail : '');
    const body = details.querySelector(':scope > [data-lazy]');
    function mount() {
      if (body && !body.dataset.mounted) {
        try {
          renderDetails(body, record, row);
          body.dataset.mounted = 'true';
          body.classList.remove('error');
        } catch (error) {
          body.textContent = 'Could not render Prisma details: ' + (error.message || String(error));
          body.classList.add('error');
          $('status').textContent = body.textContent;
          $('status').className = 'error';
        }
      }
    }
    details.open = expanded.has(id);
    if (details.open) mount();
    details.addEventListener('toggle', () => {
      if (!details.isConnected) return;
      if (details.open) { expanded.add(id); mount(); }
      else expanded.delete(id);
    });
  }
}

function estimatedBytes(value) {
  if (typeof value === 'string') return 16 + value.length * 2;
  if (!value || typeof value !== 'object') return 8;
  if (Array.isArray(value)) return 32 + value.reduce((size, entry) => size + 8 + estimatedBytes(entry), 0);
  return 64 + Object.entries(value).reduce((size, [key, entry]) => size + 32 + key.length * 2 + estimatedBytes(entry), 0);
}

function trimCache() {
  let bytes = [...cache.values()].reduce((sum, record) => sum + (record.bytes || 0), 0);
  for (const [id, record] of cache) {
    if (cache.size <= 8 && bytes <= CACHE_BYTES) break;
    if (id === key()) continue;
    cache.delete(id); bytes -= record.bytes || 0;
    for (const state of [expanded, pages]) for (const entry of state.keys())
      if (entry.startsWith(id + ':')) state.delete(entry);
  }
}

function previewHtml(result, record, selected) {
  const ranked = selected && prismaOutcome(result, record.baseline, selected);
  const changes = result.changes.filter(change => change.delta !== 0);
  const preview = ranked ? [ranked] : selected ? [] : changes.slice(0, 3);
  return preview.length ? preview.map(change => outcomeHtml(change, false, result.comparison)).join('') : `<span class="muted">${selected
    ? 'Selected outcome unavailable.' : result.intermediates?.length
      ? 'Processed bonuses change; no downstream change measured.' : 'No measured downstream change; see coverage.'}</span>`;
}

function renderRows() {
  const record = current(), query = $('search').value.trim().toLowerCase(), selected = $('metric').value;
  $('tooltip').hidden = true;
  if (renderedRecord !== record) {
    $('rows').replaceChildren(); renderedRows.clear(); renderedRecord = record;
  }
  if (!record) return;
  const rows = record.plan.rows.filter(row => {
    const result = record.results.get(row.id);
    return (row.name + ' ' + row.reason + ' ' + [...(result?.changes || []), ...(result?.intermediates || [])].map(change => change.name).join(' ')
      + ' ' + (row.sourceCoverage?.consumers || []).map(ref => ref.mode || ref.method).join(' '))
      .toLowerCase().includes(query);
  });
  if (selected) rows.sort((a, b) => {
    const av = prismaOutcome(record.results.get(a.id), record.baseline, selected);
    const bv = prismaOutcome(record.results.get(b.id), record.baseline, selected);
    const score = metric => (metric.percent ?? metric.delta) * (metric.lowerIsBetter ? -1 : 1);
    return av && bv ? score(bv) - score(av) || a.index - b.index : av ? -1 : bv ? 1 : a.index - b.index;
  });
  const focused = document.activeElement, x = scrollX, y = scrollY;
  let cursor = $('rows').firstElementChild;
  for (const row of rows) {
    const result = record.results.get(row.id);
    const stopped = record.error || record.cancelled;
    let entry = renderedRows.get(row.id);
    if (!entry) {
      const host = document.createElement('tr');
      host.dataset.bubbleId = row.id;
      host.dataset.comparison = row.comparable ? row.status === 'already' ? 'retained' : 'added' : '';
      host.innerHTML = `<td><div class="bubble-name">${esc(row.name)}</div><div class="bubble-level">${
        row.level === null ? 'Level unavailable' : 'Level ' + number(row.level)}</div>
        ${row.status === 'already' ? '<div class="partial">Already Prisma-ed</div><div class="note">Benefit retained</div>' : ''}
        </td><td></td>`;
      entry = { host };
      renderedRows.set(row.id, entry);
    }
    if (!entry.mounted || entry.result !== result || (!result && entry.stopped !== stopped)) {
      let body;
      if (!row.comparable) body = `<span class="muted">${esc(row.reason)}</span>`;
      else if (!result) body = `<span class="muted">${record.error ? 'Not calculated - calculation failed.' : record.cancelled ? 'Not calculated - cancelled.' : 'Waiting...'}</span>`;
      else if (result.status === 'error') body = `<span class="error">${esc(result.error)}</span>`;
      else {
        const changes = result.changes.filter(change => change.delta !== 0);
        body = `<div data-preview>${previewHtml(result, record, selected)}</div>`;
        body += `<details data-bubble="${row.id}"${expanded.has(key() + ':' + row.id) ? ' open' : ''}>
          <summary>${changes.length ? changes.length + ' changed total' + (changes.length === 1 ? '' : 's') + ' & details' : 'Bubble bonus & coverage'}</summary>
          <div data-lazy="results"></div></details>`;
      }
      if (!row.comparable) body += detailShell('coverage', 'Native effect coverage');
      entry.host.dataset.state = result?.status || row.status;
      entry.host.cells[1].innerHTML = body;
      bindDetails(entry.host, record);
      entry.mounted = true; entry.result = result; entry.stopped = stopped;
    } else if (entry.selected !== selected && result?.status === 'done') {
      entry.host.querySelector('[data-preview]').innerHTML = previewHtml(result, record, selected);
    }
    entry.selected = selected;
    if (entry.host !== cursor) $('rows').insertBefore(entry.host, cursor);
    cursor = entry.host.nextElementSibling;
  }
  while (cursor) {
    const next = cursor.nextElementSibling;
    cursor.remove(); cursor = next;
  }
  if (!rows.length) $('rows').innerHTML = '<tr><td colspan="2" class="muted">No matching bubbles.</td></tr>';
  if (focused?.isConnected) {
    if (document.activeElement !== focused) focused.focus({ preventScroll: true });
    if (scrollX !== x || scrollY !== y) window.scrollTo(x, y);
  }
}

function extendRankMetrics(metrics) {
  const groups = $('metric').querySelectorAll('optgroup');
  const fragments = [document.createDocumentFragment(), document.createDocumentFragment()];
  for (const metric of metrics) {
    if (rankMetricIds.has(metric.id) || metric.unavailable || metric.notApplicable
      || !Number.isFinite(metric.val ?? metric.after)) continue;
    const option = document.createElement('option');
    option.value = metric.id; option.textContent = metric.name;
    fragments[metric.intermediate ? 1 : 0].append(option);
    rankMetricIds.add(metric.id);
  }
  fragments.forEach((fragment, i) => { if (fragment.childNodes.length) groups[i].append(fragment); });
}

function flushUpdates() {
  clearTimeout(updateTimer); updateTimer = null;
  const update = pendingUpdate; pendingUpdate = null;
  if (!update || update.record !== current()) return;
  try {
    for (const id of update.rows) {
      const result = update.record.results.get(id);
      if (result.status === 'done') extendRankMetrics([...result.changes, ...(result.intermediates || [])]);
    }
    $('progress').value = update.total ? update.completed / update.total : 1;
    $('status').textContent = `Comparing ${update.completed} / ${update.total} eligible bubbles...`;
    renderRows();
  } catch (error) { update.fail(error); }
}

function queueUpdate(record, data, fail) {
  pendingUpdate ||= { record, rows: [], completed: 0, total: data.total, fail };
  pendingUpdate.rows.push(data.result.id);
  pendingUpdate.completed = Math.max(pendingUpdate.completed, data.completed);
  if (updateTimer === null) updateTimer = setTimeout(flushUpdates, 100);
}

function renderCoverage(record) {
  if (!$('coverage').open) { $('coverage-body').replaceChildren(); return; }
  if (!record?.baseline.length) { $('coverage-body').textContent = 'Calculating...'; return; }
  const coverage = record.plan.rows[0]?.sourceCoverage;
  const references = coverage?.computedReferences || [];
  $('coverage-body').innerHTML = `<p class="note">${coverage?.unresolved || 0} computed native references still require tracing; ${
    references.filter(row => row.traced).length} are traced cache-rebuild or display paths, not extra final outcomes.
    Final game-wide numerical coverage is not certified.</p>` + pageHost('baseline');
  renderPage($('coverage-body').querySelector('[data-page]'), record);
}

function renderBaseline(record) {
  const selected = $('metric').value;
  $('metric').innerHTML = '<option value="">Bubble order</option>'
    + '<optgroup label="Downstream outcomes"></optgroup><optgroup label="Processed bonuses (intermediates)"></optgroup>';
  rankMetricIds = new Set();
  extendRankMetrics(record.baseline);
  for (const result of record.results.values())
    if (result.status === 'done') extendRankMetrics([...result.changes, ...(result.intermediates || [])]);
  if ([...$('metric').options].some(option => option.value === selected)) $('metric').value = selected;
  renderCoverage(record);
  const plan = record.plan;
  $('summary').textContent = `Prisma multiplier: ${number(record.multiplier)}x | Fragments: ${number(plan.fragments)}`
    + (plan.fragments !== null && plan.fragments < 10 ? ' - insufficient; previews are hypothetical' : '')
    + (plan.mapIdx === null ? ' | Saved map unavailable' : ' | Saved map ' + plan.mapIdx);
  if (record.multiplierPartial) $('summary').textContent += ' | Partial multiplier: companion metadata missing';
}

function cancel(message = 'Cancelled. Completed rows are retained.') {
  if (!worker && !active) return;
  flushUpdates();
  worker?.terminate(); worker = null;
  if (active) active.cancelled = true;
  active = null; request++;
  $('cancel').disabled = true; $('progress').hidden = true;
  $('status').textContent = message;
  renderRows();
}

function start() {
  if (!raw) return;
  cancel();
  $('status').className = '';
  let plan;
  const afkHours = Number($('afk-hours').value);
  try {
    if (!Number.isFinite(afkHours) || afkHours * 3600 <= 120 || afkHours * 3600 > 2e8)
      throw new Error('Enter AFK claim hours above 2 minutes and at most 55,555.');
    plan = prismaPlan(raw, { charIdx, cauldron });
  }
  catch (error) { $('status').textContent = error.message; $('status').className = 'error'; return; }
  const record = { plan, baseline: [], results: new Map(), cancelled: false, done: false, bytes: estimatedBytes(plan) };
  cache.set(key(), record);
  trimCache();
  active = record;
  const id = ++request;
  $('status').textContent = 'Calculating unchanged totals...';
  $('cancel').disabled = false; $('progress').hidden = false; $('progress').value = 0;
  $('coverage-body').textContent = 'Calculating...';
  renderRows();
  function fail(error) {
    if (id !== request) return;
    record.error = error.message || String(error);
    cancel('Calculation failed: ' + record.error);
    $('status').className = 'error';
  }
  try {
    worker = new Worker(new URL('../workers/prisma-worker.js?v=streamed-results-1', import.meta.url), { type: 'module' });
    worker.onerror = event => { event.preventDefault(); fail(new Error(event.message || 'Prisma worker failed.')); };
    worker.onmessageerror = () => fail(new Error('Could not read the Prisma worker response.'));
    worker.onmessage = ({ data }) => {
      if (id !== request || data.id !== id) return;
      try {
        if (data.type === 'error') { fail(new Error(data.error)); return; }
        if (data.type === 'baseline') {
          if (!Array.isArray(data.baseline) || !data.baseline.length) throw new Error('Empty Prisma baseline.');
          record.baseline = data.baseline; record.multiplier = data.multiplier;
          record.multiplierPartial = data.multiplierPartial;
          record.bytes += estimatedBytes(data.baseline);
          trimCache();
          renderBaseline(record);
          $('status').textContent = `Comparing 0 / ${data.total} eligible bubbles...`;
        } else if (data.type === 'row') {
          if (!record.plan.rows.some(row => row.comparable && row.id === data.result?.id)
            || record.results.has(data.result.id)) throw new Error('Unexpected or duplicate Prisma result.');
          record.results.set(data.result.id, data.result);
          record.bytes += estimatedBytes(data.result);
          trimCache();
          queueUpdate(record, data, fail);
        } else if (data.type === 'done') {
          const expected = record.plan.rows.filter(row => row.comparable).length;
          if (data.completed !== expected || !record.baseline.length
            || record.results.size !== expected) throw new Error('Incomplete Prisma completion.');
          flushUpdates();
          if (id !== request) return;
          record.done = true;
          worker.terminate(); worker = null; active = null;
          $('cancel').disabled = true; $('progress').hidden = true;
          const errors = [...record.results.values()].filter(row => row.status === 'error').length;
          const outcomes = record.baseline.filter(metric => !metric.intermediate).length;
          const intermediates = record.baseline.length - outcomes;
          $('status').textContent = `Compared ${record.results.size} eligible bubbles independently across ${outcomes} outcome records and ${intermediates} intermediate bonuses.`
            + (errors ? ` ${errors} failed; see their rows.` : '');
          if (errors) $('status').className = 'error';
          renderRows();
        }
      } catch (error) { fail(error); }
    };
    worker.postMessage({ id, raw, options: { charIdx, cauldron, afkHours } });
  } catch (error) { fail(error); }
}

function populateCharacters() {
  const plan = prismaPlan(raw, { charIdx, cauldron });
  $('character').innerHTML = plan.characters.map(character => `<option value="${character.ci}">${esc(character.name)} - ${esc(character.className)}</option>`).join('');
  $('character').value = charIdx;
  $('character').disabled = false; $('run').disabled = false;
}

function show() {
  const record = current();
  if (record?.done) {
    cancel();
    renderBaseline(record); renderRows();
    cache.delete(key()); cache.set(key(), record);
    const errors = [...record.results.values()].filter(row => row.status === 'error').length;
    $('status').className = errors ? 'error' : '';
    $('status').textContent = `Compared ${record.results.size} eligible bubbles.`
      + (errors ? ` ${errors} failed; see their rows.` : '');
  } else start();
}

$('character').addEventListener('change', () => { charIdx = Number($('character').value); show(); });
$('afk-hours').addEventListener('change', () => { if (raw) show(); });
document.querySelectorAll('[data-cauldron]').forEach(button => button.addEventListener('click', () => {
  cauldron = Number(button.dataset.cauldron);
  document.querySelectorAll('[data-cauldron]').forEach(tab => tab.setAttribute('aria-pressed', String(tab === button)));
  if (raw) show();
}));
$('metric').addEventListener('change', renderRows);
$('search').addEventListener('input', renderRows);
$('coverage').addEventListener('toggle', () => renderCoverage(current()));
for (const host of [$('rows'), $('coverage-body')]) host.addEventListener('click', event => {
  const button = event.target.closest('[data-more]');
  if (!button) return;
  const page = button.closest('[data-page]'), record = current();
  const row = record.plan.rows.find(row => row.id === page.closest('[data-bubble-id]')?.dataset.bubbleId);
  const id = key() + ':' + (row?.id || 'baseline') + ':' + page.dataset.page;
  pages.set(id, (pages.get(id) || PAGE_SIZE) + PAGE_SIZE);
  renderPage(page, record, row);
  const focus = page.querySelector('[data-more]') || page;
  if (focus === page) page.tabIndex = -1;
  focus.focus({ preventScroll: true });
});
$('cancel').addEventListener('click', () => cancel());
$('run').addEventListener('click', () => {
  if (stale) {
    cancel(); raw = latestRaw; cache.clear(); expanded.clear(); pages.clear(); stale = false; $('stale').hidden = true;
    populateCharacters();
  }
  start();
});

function showTooltip(target) {
  if (!target) return;
  tooltipTarget = target;
  const tip = $('tooltip');
  tip.textContent = target.dataset.tip; tip.hidden = false;
  const rect = target.getBoundingClientRect();
  tip.style.left = Math.max(10, Math.min(rect.left, innerWidth - tip.offsetWidth - 10)) + 'px';
  tip.style.top = Math.max(10, Math.min(rect.bottom + 5, innerHeight - tip.offsetHeight - 10)) + 'px';
}
document.addEventListener('pointerover', event => showTooltip(event.target.closest('[data-tip]')));
document.addEventListener('focusin', event => showTooltip(event.target.closest('[data-tip]')));
document.addEventListener('pointerout', event => { if (event.target.closest('[data-tip]') === tooltipTarget) $('tooltip').hidden = true; });
document.addEventListener('focusout', () => { $('tooltip').hidden = true; });
document.addEventListener('keydown', event => { if (event.key === 'Escape') $('tooltip').hidden = true; });
window.addEventListener('scroll', () => {
  if (!$('tooltip').hidden && document.activeElement === tooltipTarget) showTooltip(tooltipTarget);
  else $('tooltip').hidden = true;
}, true);
window.addEventListener('pagehide', () => cancel());

initSaveLoader({ target: '#save-area', auth: true, onLoad(_save, imported, metadata) {
  latestRaw = imported;
  if (raw && metadata?.source === 'auto-refresh') {
    stale = true; $('stale').hidden = false; return;
  }
  cancel(); raw = imported; cache.clear(); expanded.clear(); pages.clear();
  stale = false; $('stale').hidden = true; charIdx = 0;
  populateCharacters(); start();
} });
