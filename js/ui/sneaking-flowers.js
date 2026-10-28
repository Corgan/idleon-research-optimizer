import { sneakingFlowerFloors } from '../stats/systems/w6/sneaking-flowers.js';
import { NjEQ } from '../stats/data/game/custommaps.js';
import { currentMapData, currentMapDataAvailable } from '../save/data.js';

const esc = value => String(value).replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[ch]);
const num = value => value.toLocaleString(undefined, { maximumFractionDigits: 2 });

export function createSneakingFlowerPanel({ getSave, getActiveCharIdx }) {
  let host, rawSave, worker, result, error = '', stale = false, completed = 0, total = 0;
  const controls = { floor: null, hours: 1, trials: 16, allowUnownedCharms: false };
  function stop(message) {
    worker?.terminate();
    worker = null;
    if (message) error = message;
  }
  function renderStatus() {
    const target = host?.querySelector('[data-flower-status]');
    if (!target) return;
    target.innerHTML = (worker ? '<progress max="' + (total || 1) + '" value="' + completed + '"></progress> '
      + (total ? num(completed) + ' / ' + num(total) + ' trials' : controls.allowUnownedCharms ? 'Preparing hypothetical charm layouts' : 'Preparing owned-copy layouts') : '')
      + (error ? '<span role="alert" style="color:var(--red)">' + esc(error) + '</span>' : '')
      + (stale ? '<p class="saved-model-note">Stale snapshot: save or login context changed. Run again before using these results.</p>' : '');
    host.querySelector('[data-flower-run]').disabled = !!worker;
    host.querySelector('[data-flower-cancel]').hidden = !worker;
  }
  function renderResults() {
    const target = host?.querySelector('[data-flower-results]');
    if (!target) return;
    if (!result) { target.innerHTML = ''; return; }
    const rows = result.results.slice().sort((a, b) => b.mean - a.mean);
    const best = rows[0];
    const reference = rows.find(row => row.id === 'together');
    let html = '<p class="saved-model-note">Captured ' + result.twins + ' untied twins; Floor ' + result.floor + '; '
      + num(result.seconds / 3600) + 'h; ' + result.trials + ' trials each; '
      + 'active Sneaking, menu open; ' + (result.activeTown ? 'W6 town' : 'outside W6 town')
      + '. Net flowers sum all floors; negative values mean lost saved flowers. Means and observed ranges, not guarantees.</p>';
    if (result.allowUnownedCharms) html += '<p class="saved-model-note"><strong>Hypothetical charm comparison:</strong> new templates use only max-findable-level Marks and Yellow Belts (+' + result.hypotheticalCharmLevel
      + '); saved baselines keep real gear. Gloves, hats, symbols and unlocks remain save-backed. Hypothetical charms are not owned-copy move instructions.</p>';
    if (result.partial.length) html += '<p class="saved-model-note">Partial: ' + result.partial.map(esc).join('; ') + '.</p>';
    html += '<p><strong>Highest sampled yield: ' + esc(best.label) + '</strong> (' + num(best.mean) + ' net flowers; '
      + num(best.mean - reference.mean) + ' vs all-together saved gear). Bounded templates, not a proven optimum.</p>';
    html += '<div class="flower-result-list">';
    for (const row of rows) {
      html += '<details class="flower-result"><summary><strong>' + esc(row.label) + '</strong>'
        + '<span>' + num(row.mean) + ' net <small>(' + num(row.perHour) + '/h)</small></span></summary>'
        + '<p class="saved-model-note">Observed net range ' + num(row.min) + ' to ' + num(row.max)
        + '; standard error ' + (row.se == null ? 'unavailable' : num(row.se)) + '. Mean redirects ' + num(row.counters.redirects)
        + ', recipient KOs ' + num(row.counters.recipientKOs) + ', flowers lost in negative events ' + num(row.counters.losses) + '.</p>';
      if (row.assignments.length) {
        html += '<div class="flower-loadouts">';
        for (const idx of [...new Set(row.assignments.map(item => item.idx))]) {
          html += '<div><strong>' + esc(result.names[idx]) + '</strong><div>';
          for (const item of row.assignments.filter(item => item.idx === idx)) {
            const name = NjEQ[item.key]?.[2]?.replace(/_/g, ' ') || 'Empty';
            const from = item.hypothetical ? 'Hypothetical charm; not an owned copy' : item.source == null ? '' : item.source >= 60 ? 'Inventory ' + (item.source - 59)
              : result.names[Math.floor((item.source - 12) / 4)] + ', ' + ['hat','weapon','charm slot 1','charm slot 2'][(item.source - 12) % 4];
            html += '<span class="flower-gear" tabindex="0" data-tip="' + esc(name + (item.key === 'Blank' ? '' : '\nLevel ' + item.level + '\nFrom: ' + from)) + '">'
              + '<small>' + ['','Weapon','Charm slot 1','Charm slot 2'][item.offset]
              + (item.offset > 1 ? ' &middot; Symbol +' + 50 * (result.symbolLevels[2 * idx + item.offset - 2] || 0) + '%' : '') + '</small>'
              + (item.key === 'Blank' ? 'Empty' : '<img src="./assets/sneaking/' + encodeURIComponent(item.key) + '.png" alt=""> ' + esc(name) + ' +' + item.level)
              + (item.hypothetical ? ' <small>Hypothetical</small>' : '') + '</span>';
          }
          html += '</div></div>';
        }
        html += '</div>';
      } else html += '<p class="saved-model-note">Saved equipment unchanged.</p>';
      html += '</details>';
    }
    target.innerHTML = html + '</div>';
  }
  function render() {
    if (!host) return;
    if (!document.getElementById('sneaking-flower-style')) {
      const style = document.createElement('style');
      style.id = 'sneaking-flower-style';
      style.textContent = '.flower-controls{display:flex;flex-wrap:wrap;gap:12px;align-items:end}.flower-controls label{display:grid;gap:4px;font-size:.85em}.flower-controls [hidden]{display:none}.flower-controls input{width:85px}.flower-result-list{margin-top:12px;display:grid;gap:6px}.flower-result{background:var(--bg3);padding:8px;border-radius:6px}.flower-result summary{display:flex;flex-wrap:wrap;justify-content:space-between;gap:6px;cursor:pointer}.flower-result summary>span{color:var(--gold)}.flower-loadouts{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,210px),1fr));gap:8px}.flower-loadouts>div{padding:6px}.flower-gear{display:inline-flex;align-items:center;font-size:.8em;margin:4px;gap:3px}.flower-gear img{width:28px;height:28px;object-fit:contain;image-rendering:pixelated}[data-flower-cancel][hidden]{display:none}';
      style.textContent += '.flower-gear{display:flex;flex-wrap:wrap;margin:5px 0;overflow-wrap:anywhere}.flower-gear>small:first-child{flex-basis:100%;color:var(--text2)}';
      document.head.append(style);
    }
    const floors = sneakingFlowerFloors(getSave());
    if (!floors.includes(controls.floor)) {
      const saved = (getSave().ninjaData || []).slice(0, getSave().charNames?.length || getSave().lv0AllData?.length || 0);
      controls.floor = Math.max(0, ...saved.map(row => Number(row?.[0]) || 0).filter(floor => floors.includes(floor)));
    }
    host.innerHTML = '<div class="section"><h2>Funeral Flower simulation</h2>'
      + '<div class="flower-controls"><label>Floor<select data-flower-control="floor">' + floors.map(floor => '<option value="' + floor + '"' + (floor === controls.floor ? ' selected' : '') + '>' + (floor ? 'Floor ' + floor : 'Training floor') + '</option>').join('')
      + '</select></label><label>Simulation hours<input data-flower-control="hours" type="number" min=".01" max="168" step="any" value="' + controls.hours + '"></label>'
      + '<label>Trials<input data-flower-control="trials" type="number" min="1" max="256" value="' + controls.trials + '"></label>'
      + '<label class="check-control"><input type="checkbox" data-flower-control="allowUnownedCharms"' + (controls.allowUnownedCharms ? ' checked' : '') + '>Any charms at max findable level</label>'
      + '<button type="button" data-flower-run>Compare Mark setups</button><button type="button" data-flower-cancel hidden>Cancel</button></div>'
      + '<p class="saved-model-note"><strong>Active Sneaking:</strong> menu open on any map, using the login character&#39;s saved location for time accrual. Compares saved placement, all-together saved gear, and first/last-in-account Mark distributions using owned gloves, Marks and Yellow Belts'
      + ' by default. Any charms at max findable level uses only hypothetical max-level Marks and Belts in new templates (duplicate sibling charms still require Charmed, I&#39;m Sure); saved baselines stay real. Other charms are deliberately removed to avoid stealth/dodge; hats stay equipped. No save edits. Rearrangement may require inventory space.</p>'
      + '<details><summary>Simulation scope</summary><p class="saved-model-note">Uses saved starting progress and flowers, username-order processing, positive-progress Mark eligibility, strict native batch thresholds, KO refunds and recovery clamps. Flowers change detection during each run. '
      + 'Time accrues every 0.5s in W6 town and every 15s elsewhere, transfers through the one-second queue, and processes on the 91-step menu cycle (10 ms steps). Timer phases start synchronized; unsaved live phases, stalls and unrelated RNG cannot be reconstructed. No final offline batch is applied. Gear allocation is greedy; charm-slot order uses a speed/recovery proxy, not exhaustive assignment search. Stats, floors and unlocks stay fixed; EXP levels, items, doors and captivity changes are not simulated. Same trial seeds do not guarantee paired RNG after setups diverge. Results are sampled comparisons, not confidence-certified winners.</p></details>'
      + '<div data-flower-status aria-live="polite"></div><div data-flower-results></div></div>';
    host.onchange = event => {
      const key = event.target.dataset.flowerControl;
      if (!key) return;
      stop();
      result = null;
      stale = false;
      renderResults();
      if (key === 'allowUnownedCharms') {
        controls[key] = event.target.checked;
        error = '';
        renderStatus();
        return;
      }
      const value = Number(event.target.value);
      const ranges = { floor: [0, 11], hours: [0.01, 168], trials: [1, 256] };
      if (!Number.isFinite(value) || value < ranges[key][0] || value > ranges[key][1]
        || (key !== 'hours' && !Number.isInteger(value))) {
        error = 'Enter a valid ' + key + ' value.';
        renderStatus();
        return;
      }
      controls[key] = value;
      stop();
      result = null;
      error = '';
      renderStatus();
      renderResults();
    };
    host.onclick = event => {
      if (event.target.closest('[data-flower-cancel]')) { stop('Cancelled; no recommendation produced.'); renderStatus(); return; }
      if (!event.target.closest('[data-flower-run]')) return;
      stop();
      result = null; error = ''; stale = false; completed = 0; total = 0;
      renderResults();
      try {
        for (const input of host.querySelectorAll('input')) if (!input.reportValidity()) throw new Error('Correct the simulation inputs before running.');
        if (!rawSave) throw new Error('Load a save first.');
        const activeCharIdx = getActiveCharIdx();
        if (!currentMapDataAvailable[activeCharIdx]) throw new Error('Saved login location is unavailable; load a complete save.');
        const names = Array.from({ length: getSave().charNames?.length || getSave().lv0AllData?.length || 0 },
          (_, i) => getSave().charNames?.[i] || 'Twin ' + (i + 1));
        worker = new Worker(new URL('../workers/sneaking-flowers-worker.js', import.meta.url), { type: 'module' });
        const current = worker;
        worker.onmessage = ({ data }) => {
          if (worker !== current) return;
          try {
            if (data.type === 'progress') { completed = data.progress.completed; total = data.progress.total; }
            else if (data.type === 'done') {
              if (!data.result?.results?.length) throw new Error('Flower worker returned no results');
              result = { ...data.result, names };
              stop(); renderResults();
            } else if (data.type === 'error') throw new Error(data.message);
            renderStatus();
          } catch (failure) { stop(failure.message || String(failure)); result = null; renderStatus(); renderResults(); }
        };
        worker.onerror = event => { stop('Flower worker failed: ' + event.message); renderStatus(); };
        worker.onmessageerror = () => { stop('Flower worker response could not be decoded.'); renderStatus(); };
        const seed = crypto.getRandomValues(new Uint32Array(1))[0];
        worker.postMessage({ rawSave, capture: { floor: controls.floor, activeCharIdx, allowUnownedCharms: controls.allowUnownedCharms },
          options: { seconds: controls.hours * 3600, processing: 'active', activeTown: Number(currentMapData[activeCharIdx]) === 250, trials: controls.trials, seed } });
      } catch (failure) { stop(failure.message || String(failure)); }
      renderStatus();
    };
    renderStatus();
    renderResults();
  }
  return {
    mount(target) { host = target; render(); },
    load(raw, metadata) {
      rawSave = raw;
      if (metadata?.source === 'auto-refresh') stale = !!worker || !!result;
      else { stop(); result = null; stale = false; error = ''; }
    },
    contextChanged() { stop(); stale = !!result; renderStatus(); },
  };
}
