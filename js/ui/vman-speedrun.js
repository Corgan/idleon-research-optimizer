import { initSaveLoader } from './save-loader.js';

const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[c]);
const number = value => typeof value === 'number' && Number.isFinite(value)
  ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : 'Unavailable';
const time = value => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'Unavailable';
  const tenths = Math.round(value * 10);
  return `${Math.floor(tenths / 600)}:${((tenths % 600) / 10).toFixed(1).padStart(4, '0')}`;
};
let rawSave = null, roster = [], rosterWorker = null, runWorker = null;
let requestId = 0, captured = null, result = null;

function status(text, error = false) {
  $('job-status').textContent = text;
  $('job-status').className = error ? 'error' : '';
}

function readiness() {
  $('run').disabled = !!runWorker || !!rosterWorker || !roster.some(row => row.eligible && String(row.charIdx) === $('character').value);
  $('cancel').disabled = !runWorker;
}

function stopRun() {
  runWorker?.terminate();
  runWorker = null;
  $('progress').hidden = true;
  readiness();
}

function clearResult() {
  result = null;
  captured = null;
  $('results').replaceChildren();
  $('results').hidden = true;
  $('stale').hidden = true;
}

function workerRequest(data, onMessage, onError) {
  const worker = new Worker(new URL('../workers/vman-speedrun-worker.js?v=vman-speedrun-5', import.meta.url), { type: 'module' });
  worker.onmessage = event => {
    if (event.data?.id !== data.id) return;
    try { onMessage(event.data); } catch (error) { onError(error); }
  };
  worker.onerror = event => {
    event.preventDefault();
    onError(new Error(event.message || 'Speedrun module worker failed to load.'));
  };
  worker.onmessageerror = () => onError(new Error('Speedrun worker response could not be transferred.'));
  try { worker.postMessage(data); }
  catch (error) { worker.terminate(); throw error; }
  return worker;
}

function routeAction(row) {
  const boss = row.bossId != null || row.boss;
  const admission = row.admission || row.bossEntry;
  const emperor = (row.bossId ?? admission?.bossId) === 5;
  const showdown = row.showdown ?? admission?.showdown;
  const difficulty = emperor && showdown != null ? 'Showdown ' + number(showdown + 1)
    : ['Normal', 'Chaotic', 'Nightmare'][row.difficulty];
  const outcome = row.encounter
    ? row.openingFailure ? 'Unsupported opening'
      : row.encounter.status === 'defeated' ? 'Scripted victory' : 'Unfinished encounter'
    : '';
  const paid = admission?.paymentVerified === true
    ? emperor ? 'Emperor attempt (simulated)' : `Paid ${number(admission.keyCost)} keys (simulated)` : '';
  const failedChecks = (row.bossChecks || []).filter(check => !check.available);
  return `<td data-label="Action / destination"${boss ? ' class="boss"' : ''}>`
    + `${esc(row.name || 'Unknown map')}${boss ? ' · ' + esc(difficulty || 'Boss') : ''}`
    + (outcome ? `<br><strong>${outcome}</strong>` : '')
    + (paid ? `<br><span>${esc(paid)}</span>` : '')
    + (emperor && admission?.lowerActions > 0
      ? `<br><span>Lower from Showdown ${number(admission.showdownBefore + 1)} to ${number(showdown + 1)}</span>` : '')
    + (failedChecks.length ? `<br><span>Skipped openings: ${failedChecks.map(check =>
      esc((check.showdown != null ? 'Showdown ' + number(check.showdown + 1)
        : ['Normal', 'Chaotic', 'Nightmare'][check.difficulty]) + ': ' + check.reason)).join('; ')}</span>` : '')
    + ((row.ringSwaps || []).length ? `<br><span>Equip: ${row.ringSwaps.map(r => esc(r.name)).join(', ')}</span>` : '')
    + ((row.radiusCasts || []).length ? `<br><span>Void Radius: ${row.radiusCasts.map(t => time(t)).join(', ')}</span>` : '')
    + (row.worldUnlock ? `<br><span>World ${number(row.worldUnlock)} access reopened</span>` : '')
    + `<br><span class="muted">${esc(row.reason)}</span></td>`;
}

function routeTable(route) {
  return '<div class="table-wrap"><table><thead><tr><th>Elapsed</th><th>Action / destination</th><th>Score</th><th>Kills</th></tr></thead><tbody>'
    + route.map(row => `<tr><td data-label="Elapsed">${time(row.enteredAt)}–${time(row.leftAt)}</td>`
      + routeAction(row)
      + `<td data-label="Score">${number(row.scoreBefore)} → ${number(row.scoreAfter)}</td>`
      + `<td data-label="Kills">${number(row.kills)}</td></tr>`).join('')
    + '</tbody></table></div>';
}

function stopReason(route) {
  if (route.status === 'time-expired') return 'Void Trial timer expired';
  if (route.status === 'modelled-route-exhausted')
    return 'Stopped early: planner found no modeled next move.';
  if (route.status === 'unsupported-map') return 'Stopped early: map simulation unavailable';
  if (route.status === 'boss-entry-unavailable') return 'Stopped early: boss entry unavailable';
  if (route.status === 'boss-exit-unavailable') return 'Stopped early: boss return unavailable';
  if (route.status === 'boss-opening-unavailable') return 'Stopped early: unsupported boss attack or opening';
  return route.status ? 'Stopped: ' + route.status : 'Stop reason unavailable';
}

function renderResult() {
  const host = $('results');
  host.innerHTML = `<h2>${esc(captured.name)} · Route</h2>`
    + `<p data-stop-reason="${esc(result.status)}"><strong>${esc(stopReason(result))}</strong></p>`
    + '<div class="stats">'
    + [['Score', result.score], ['Boss points', result.bossPoints], ['Saved highest score', result.highestScore]]
      .map(([label, value]) => `<div class="stat"><span>${label}</span><strong>${number(value)}</strong></div>`).join('')
    + `<div class="stat"><span>Modeled elapsed / total time</span><strong>${time(result.seconds)} / ${time(result.durationSeconds)}</strong></div>`
    + `<div class="stat" data-remaining-seconds="${esc(result.remainingSeconds)}"><span>Time remaining</span><strong>${time(result.remainingSeconds)}</strong></div></div>`
    + routeTable(result.route)
    + '<details><summary>Alternative policies</summary>'
    + ((result.candidates || []).map((candidate, i) => `<details><summary>Policy ${i + 1} · Score ${number(candidate.score)} · ${time(candidate.seconds)} / ${time(candidate.durationSeconds)} · ${time(candidate.remainingSeconds)} remaining</summary><p>${esc(stopReason(candidate))}</p>${routeTable(candidate.route || [])}</details>`).join('') || '<p>No completed alternative policies reported.</p>')
    + '</details>';
  host.hidden = false;
}

function loadRoster(raw) {
  rosterWorker?.terminate();
  rosterWorker = null;
  roster = [];
  $('character').disabled = true;
  $('roster-status').textContent = 'Reading saved characters…';
  const selected = $('character').value;
  const id = ++requestId;
  const fail = error => {
    if (!rosterWorker) return;
    rosterWorker.terminate();
    rosterWorker = null;
    $('roster-status').textContent = 'Character data unavailable: ' + error.message;
    $('roster-status').className = 'error';
    readiness();
  };
  try {
    rosterWorker = workerRequest({ type: 'roster', id, rawSave: raw }, message => {
      if (message.type === 'error') { fail(new Error(message.error)); return; }
      if (message.type !== 'roster' || !Array.isArray(message.roster)) throw new Error('Invalid character roster response.');
      roster = message.roster;
      rosterWorker.terminate();
      rosterWorker = null;
      $('character').replaceChildren();
      for (const row of roster.filter(row => row.eligible)) {
        const option = document.createElement('option');
        option.value = String(row.charIdx);
        option.textContent = row.name;
        $('character').append(option);
      }
      if ([...$('character').options].some(option => option.value === selected)) $('character').value = selected;
      $('character').disabled = !$('character').options.length;
      if (!$('character').options.length) $('character').add(new Option('No eligible saved character', ''));
      $('roster-status').className = 'muted';
      $('roster-status').textContent = roster.some(row => row.eligible) ? '' : 'No eligible saved Voidwalker or Virtuoso.';
      readiness();
    }, fail);
  } catch (error) {
    $('roster-status').textContent = 'Character data unavailable: ' + error.message;
    $('roster-status').className = 'error';
  }
  readiness();
}

$('run').addEventListener('click', () => {
  stopRun();
  clearResult();
  try {
    const routeBudget = Number($('route-budget').value);
    if (!Number.isInteger(routeBudget) || routeBudget < 1 || routeBudget > 32) throw new Error('Routing policies must be an integer from 1 to 32.');
    const character = roster.find(row => row.eligible && String(row.charIdx) === $('character').value);
    if (!rawSave || !character) throw new Error('Load a save with an eligible Voidwalker or Virtuoso.');
    const seed = crypto.getRandomValues(new Uint32Array(1))[0];
    captured = { name: character.name, routeBudget };
    const id = ++requestId;
    status('Starting route comparison…');
    $('progress').value = 0;
    $('progress').hidden = false;
    const fail = error => {
      if (!runWorker) return;
      stopRun();
      status('Calculation failed: ' + error.message, true);
    };
    runWorker = workerRequest({ type: 'run', id, rawSave, charIdx: character.charIdx, routeBudget, seed }, message => {
      if (message.type === 'error') { fail(new Error(message.error)); return; }
      if (message.type === 'progress') {
        const p = message.progress || {};
        const fraction = Number.isFinite(p.fraction) ? p.fraction : p.total > 0 ? p.completed / p.total : 0;
        $('progress').value = Math.max($('progress').value, Math.min(1, Math.max(0, fraction)));
        status(`${p.phase || 'Comparing routes'}${Number.isFinite(p.completed) && Number.isFinite(p.total) ? ` · ${p.completed}/${p.total}` : ''}`);
      } else if (message.type === 'done') {
        if (!message.result || !Array.isArray(message.result.route)) throw new Error('Invalid speedrun result.');
        result = message.result;
        renderResult();
        stopRun();
        status(result.status === 'time-expired' ? 'Finished.' : stopReason(result));
      } else throw new Error('Unexpected speedrun worker response.');
    }, fail);
  } catch (error) {
    stopRun();
    status('Calculation failed: ' + error.message, true);
  }
  readiness();
});
$('cancel').addEventListener('click', () => {
  stopRun();
  status('Cancelled. No completed policy results were retained.');
});
for (const id of ['character', 'route-budget']) $(id).addEventListener('change', () => {
  stopRun();
  clearResult();
  status('Settings changed. Find a new route.');
});

initSaveLoader({
  target: '#save-area', auth: true, skipLoad: true,
  onLoad(_state, raw, metadata) {
    rawSave = raw;
    if (metadata?.source === 'auto-refresh' && (runWorker || result)) {
      $('stale').hidden = false;
    } else {
      stopRun();
      clearResult();
      status('Choose a saved character and find a route.');
    }
    loadRoster(raw);
  },
});
