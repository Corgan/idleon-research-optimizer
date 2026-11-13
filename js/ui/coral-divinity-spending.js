import { coralSpendingInputs, singularityTransmute, planCoralDivinitySpending } from '../stats/systems/w5/coral-divinity-spending.js?v=spiral-bank-7';
import { runCombatBatch } from '../workers/combat-sim-client.js';
import { combatSimMap } from '../stats/systems/common/combat-sim-maps.js';
import { combatFarmingMaps } from '../stats/systems/common/combat-farming.js';
import { rowValues } from '../stats/systems/common/combat-sim-setup.js';
import { fmtVal } from '../renderers/format.js';

const UPGRADES = ['Volcano link & Divinity EXP', 'Blessing level cap', 'God Rank Class EXP', 'Minor link scaling', 'Divinity points per Reef upgrade', 'Daily Reef Coral'];
const PURCHASE_NAMES = [...UPGRADES, 'Divinity points multiplier', 'Spiral value', 'Divinity EXP multiplier',
  'Non-Divinity hour credit', 'Lumi bonus', 'God Rank bonus'];
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = value => value == null ? 'Unavailable' : fmtVal(value);
const full = value => value == null ? 'Unavailable' : value.toLocaleString('en-US', { maximumFractionDigits: 2 });
const pct = value => value == null ? 'Unavailable' : (value * 100).toFixed(2) + '%';
const exact = value => value == null ? '' : String(value);
const cell = (value, label = '') => `<td class="num" data-value="${exact(value)}"${label ? ' data-label="' + esc(label) + '"' : ''}${value == null ? '' : ' tabindex="0"'}>${fmt(value)}</td>`;
const card = (label, value, note = '') => `<div class="card"><div class="card-title">${esc(label)}</div><div class="card-val" data-value="${exact(value)}"${value == null ? '' : ' tabindex="0"'}>${fmt(value)}</div><div class="card-sub">${esc(note)}</div></div>`;
let tooltipId = 0;
const duration = seconds => {
  seconds = Math.round(seconds);
  const hours = Math.floor(seconds / 3600), minutes = Math.floor(seconds % 3600 / 60), rest = seconds % 60;
  return [hours ? hours + 'h' : '', minutes ? minutes + 'm' : '', rest ? rest + 's' : ''].filter(Boolean).join(' ') || '0s';
};

function calculateCycle(input, rates, upgrades, signal) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../workers/coral-divinity-worker.js?v=spiral-bank-7', import.meta.url), { type: 'module' });
    const finish = (error, result) => {
      worker.terminate(); signal.removeEventListener('abort', abort);
      if (error) reject(error); else resolve(result);
    };
    const abort = () => finish(new DOMException('Timing calculation cancelled.', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) { abort(); return; }
    worker.onerror = event => finish(new Error(event.message || 'Timing worker failed.'));
    worker.onmessageerror = () => finish(new Error('Timing response could not be read.'));
    worker.onmessage = ({ data }) => {
      if (data.id !== 2) return;
      if (data.type === 'error') finish(new Error(data.error));
      else if (data.type !== 'done' || !Array.isArray(data.result?.rows) || data.result.comparisons?.length !== 2
        || data.result.best && (data.result.purchases?.rows?.length !== 12 || !data.result.curves?.length))
        finish(new Error('Timing worker returned an invalid result.'));
      else finish(null, data.result);
    };
    try { worker.postMessage({ type: 'cycle', id: 2, input, rates, upgrades }); }
    catch (error) { finish(error); }
  });
}

function bindExactTooltip(host) {
  const events = new AbortController(), tip = document.createElement('div');
  tip.id = 'coral-exact-' + ++tooltipId;
  tip.className = 'coral-exact-tooltip';
  tip.setAttribute('role', 'tooltip');
  tip.hidden = true;
  document.body.append(tip);
  let target = null;
  const hide = () => {
    target?.removeAttribute('aria-describedby');
    target = null; tip.hidden = true;
  };
  const show = event => {
    const element = event.target.closest?.('[data-value], [data-tip]');
    if (!element || !host.contains(element) || !element.dataset.value && !element.dataset.tip) return;
    if (target === element) return;
    hide(); target = element;
    tip.textContent = element.dataset.tip || 'Exact value: ' + element.dataset.value;
    tip.hidden = false;
    element.setAttribute('aria-describedby', tip.id);
    const rect = element.getBoundingClientRect();
    tip.style.left = Math.max(8, Math.min(rect.left, innerWidth - tip.offsetWidth - 8)) + 'px';
    tip.style.top = Math.max(8, Math.min(rect.bottom + 6, innerHeight - tip.offsetHeight - 8)) + 'px';
  };
  const options = { signal: events.signal };
  host.addEventListener('mouseover', show, options);
  host.addEventListener('focusin', show, options);
  for (const type of ['mouseout', 'focusout']) host.addEventListener(type, event => {
    if (target && !target.contains(event.relatedTarget)) hide();
  }, options);
  host.addEventListener('keydown', event => { if (event.key === 'Escape') hide(); }, options);
  window.addEventListener('scroll', hide, { ...options, capture: true, passive: true });
  window.addEventListener('resize', hide, options);
  return () => { hide(); events.abort(); tip.remove(); };
}

function renderScaling(input) {
  try {
    const current = singularityTransmute(input);
    const definitions = [
      { key: 'points', output: 'base', title: 'Divinity points → base', axis: 'Claimed points (log scale)',
        max: Math.max(input.points, Math.pow(10, Math.min(307, Math.max(15, Math.ceil(Math.log10(Math.max(1, input.points))) + 1)))),
        log: true, note: 'Logarithmic growth; steeper beyond the native log-12 threshold. Includes your saved Transmute value upgrade.' },
      { key: 'kills', output: 'killMulti', title: 'Active kill credit → multiplier', axis: 'Banked kill credit (log scale)',
        max: Math.max(input.kills, Math.pow(10, Math.min(307, Math.max(8, Math.ceil(Math.log10(Math.max(1, input.kills))) + 1)))),
        log: true, note: 'Growth starts above 65,536 kill credit, with additional 0.25x steps at native log-decade thresholds.' },
      { key: 'hours', output: 'timeMulti', title: 'Divinity hours → multiplier', axis: 'Banked hours',
        max: Math.max(240, input.hours > Number.MAX_VALUE / 2 ? input.hours : input.hours * 2),
        log: false, note: 'Linear through 120 banked hours (6.1x), then square-root growth. Banked hours are not elapsed wall-clock hours.' },
    ];
    return `<h2>How Singularity scales</h2>
      <p class="spend-note">Spirals = floor(base × kill multiplier × hour multiplier), capped at one billion. Each graph varies one bank, not the final payout. Gold marks your saved value.</p>
      <div class="singularity-charts">${definitions.map(d => {
        const transform = x => d.log ? Math.log10(Math.max(1, x)) : x;
        const span = transform(d.max), x = value => 56 + 346 * (transform(value) / span);
        const values = Array.from({ length: 81 }, (_, i) => d.log ? Math.pow(10, span * i / 80) : d.max * (i / 80));
        values.push(input[d.key]);
        if (d.key === 'points') values.push(Math.exp(12 * 2.30259));
        if (d.key === 'hours') values.push(120);
        if (d.key === 'kills') {
          values.push(65536);
          for (let decade = 6; decade <= Math.floor(Math.log(d.max) / 2.30259); decade++) {
            const threshold = Math.exp(decade * 2.30259);
            values.push(threshold * (1 - 1e-12), threshold * (1 + 1e-12));
          }
        }
        const rows = [...new Set(values)].filter(value => value <= d.max).sort((a, b) => a - b)
          .map(value => ({ value, result: singularityTransmute({ ...input, [d.key]: value })[d.output] }));
        const maxY = Math.max(...rows.map(row => row.result), 1) * 1.08;
        const y = value => 174 - 146 * (value / maxY);
        const tip = row => esc(`${d.axis.replace(' (log scale)', '')}: ${row.value}; ${d.output === 'base' ? 'Base' : 'Multiplier'}: ${row.result}${d.output === 'base' ? '' : 'x'}`);
        const saved = { value: input[d.key], result: current[d.output] };
        return `<div class="singularity-chart" data-scaling="${d.key}"><h3>${d.title}</h3>
          <svg viewBox="0 0 430 220" role="group" aria-label="${d.title}">
            ${[0, .5, 1].map(f => `<path d="M56 ${y(maxY * f)}H402" stroke="#41465b"/><text x="50" y="${y(maxY * f) + 4}" text-anchor="end">${fmt(maxY * f)}</text>`).join('')}
            <path d="M56 28V174H402" fill="none" stroke="#a0a0b4"/>
            <path d="${rows.map((row, i) => `${i ? 'L' : 'M'}${x(row.value)} ${y(row.result)}`).join(' ')}" fill="none" stroke="#4dd0e1" stroke-width="2"/>
            ${rows.map((row, i) => `<circle cx="${x(row.value)}" cy="${y(row.result)}" r="5" fill="transparent" ${i % 8 === 0 ? 'tabindex="0"' : ''} aria-label="${tip(row)}" data-tip="${tip(row)}"/>`).join('')}
            <path d="M${x(saved.value)} 28V174" stroke="#ffd700" stroke-dasharray="4 4"/>
            <circle cx="${x(saved.value)}" cy="${y(saved.result)}" r="5" fill="#ffd700" tabindex="0" aria-label="Saved ${tip(saved)}" data-tip="Saved ${tip(saved)}" data-value="${saved.result}"/>
            ${[0, .5, 1].map(f => `<text x="${56 + 346 * f}" y="194" text-anchor="middle">${fmt(d.log ? Math.pow(10, span * f) : d.max * f)}</text>`).join('')}
            <text x="229" y="214" text-anchor="middle">${d.axis}</text>
          </svg><p>Saved: ${fmt(saved.value)} → ${fmt(saved.result)}${d.output === 'base' ? ' base' : 'x'}</p>
          <p class="spend-note">${d.note}</p></div>`;
      }).join('')}</div>`;
  } catch (error) {
    return '<h2>How Singularity scales</h2><p class="bad" role="alert">' + esc(error.message) + '</p>';
  }
}

export function mountCoralDivinitySpending(host, S, rawSave, { onRecalculate } = {}) {
  let worker = null, activeController = null, advisor = null, stale = false, disposed = false;
  let capturedCadence = null, selectedGoal = 'farm', banking = null;
  const capturedRaw = structuredClone(rawSave);
  let input;
  try {
    input = coralSpendingInputs(S, { rawSave });
  } catch (error) {
    host.innerHTML = '<div class="section bad" role="alert">' + esc(error.message) + '</div>';
    return;
  }
  let now = null, conversionError = '';
  try { now = singularityTransmute(input); } catch (error) { conversionError = error.message; }
  host.innerHTML = `
    <div class="section">
      <div class="spend-heading"><h2>Singularity Spirals</h2>
      ${onRecalculate ? '<button id="divinity-recalculate" type="button">Recalculate</button>' : ''}</div>
      <div class="card-grid cols-2">
        ${card('Claimed points', input.points)}
        ${card('Transmute now', now?.spirals)}
      </div>
      <div class="spend-banks">Kill credit <span data-value="${exact(input.kills)}" tabindex="0">${fmt(input.kills)}</span> &middot; Banked hours <span data-value="${exact(input.hours)}" tabindex="0">${fmt(input.hours)}</span></div>
      ${conversionError ? '<p class="bad" role="alert">' + esc(conversionError) + '</p>' : ''}
      ${input.activated !== true || input.singularityUnlocked !== true ? '<p class="bad">Spiral amounts are formula-only: Coral activation or Singularity unlock is locked or unavailable.</p>' : ''}
    </div>
    <div class="goal-tabs" role="tablist" aria-label="Planner goal">${[['farm','Farm Spirals'],['spend','Spend'],['progress','Progress account'],['bank','Bank for a boosted week']].map(([id,name]) =>
      `<button type="button" role="tab" id="goal-${id}" data-goal="${id}" aria-selected="${id === 'farm'}" aria-controls="goal-panel-${id}">${name}</button>`).join('')}</div>
    <div id="goal-panel-farm" role="tabpanel" aria-labelledby="goal-farm">
      <div id="divinity-active" class="section"><h2>Farm Spirals</h2><p>Loading saved characters...</p></div>
      <div id="divinity-advisor" class="section" aria-live="polite"><h2>Pending claims</h2><p>Calculating...</p></div>
      <div class="section"><div id="singularity-scaling"><p>Loading saved formula inputs...</p></div></div>
    </div>
    <div id="goal-panel-spend" role="tabpanel" aria-labelledby="goal-spend" hidden>
      <div id="divinity-spend" class="section" aria-live="polite"><h2>Spend before transmuting</h2><p>Calculating...</p></div>
    </div>
    <div id="goal-panel-progress" role="tabpanel" aria-labelledby="goal-progress" hidden>
      <div class="section"><h2>Progress the account</h2>
        <div class="controls"><label>Compare benefits<select id="divinity-progress-goal"><option value="points">Divinity points</option><option value="exp">Divinity EXP</option><option value="class">Class EXP</option></select></label></div>
        <div id="divinity-progress" aria-live="polite"><p>Calculating...</p></div>
      </div>
    </div>
    <div id="goal-panel-bank" role="tabpanel" aria-labelledby="goal-bank" hidden>
      <div id="divinity-bank" class="section"><h2>Bank for a boosted week</h2><p>Loading saved candidates and clocks...</p></div>
    </div>`;
  const disposeTooltip = bindExactTooltip(host);
  const tabs = [...host.querySelectorAll('[data-goal]')];
  const showGoal = goal => {
    selectedGoal = goal;
    for (const tab of tabs) {
      const selected = tab.dataset.goal === goal;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      host.querySelector('#goal-panel-' + tab.dataset.goal).hidden = !selected;
    }
  };
  for (const tab of tabs) {
    tab.addEventListener('click', () => showGoal(tab.dataset.goal));
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      event.preventDefault();
      const index = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
        : (tabs.indexOf(tab) + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      showGoal(tabs[index].dataset.goal); tabs[index].focus();
    });
  }
  showGoal(selectedGoal);
  host.querySelector('#divinity-recalculate')?.addEventListener('click', onRecalculate);
  const spendHost = host.querySelector('#divinity-spend');
  const progressHost = host.querySelector('#divinity-progress');
  const progressGoal = host.querySelector('#divinity-progress-goal');
  const updateSpend = () => {
    if (!advisor) return;
    spendHost.innerHTML = renderSpend(advisor, capturedCadence);
  };
  progressGoal.addEventListener('change', () => { if (advisor) progressHost.innerHTML = renderProgress(advisor, progressGoal.value); });
  const advisorHost = host.querySelector('#divinity-advisor'), activeHost = host.querySelector('#divinity-active');
  const fail = error => {
    worker?.terminate(); worker = null;
    advisorHost.innerHTML = '<h2>Divinity advisor unavailable</h2><p class="bad" role="alert">' + esc(error.message || String(error)) + '</p>';
    activeHost.innerHTML = '<p class="bad">Timing requires available character inputs.</p>';
    spendHost.innerHTML = progressHost.innerHTML = '<p class="bad" role="alert">' + esc(error.message || String(error)) + '</p>';
    host.querySelector('#singularity-scaling').innerHTML = '<p class="bad" role="alert">Saved scaling inputs could not be loaded.</p>';
  };
  try {
    worker = new Worker(new URL('../workers/coral-divinity-worker.js?v=spiral-bank-7', import.meta.url), { type: 'module' });
    worker.onerror = event => fail(new Error(event.message || 'Divinity advisor worker failed.'));
    worker.onmessageerror = () => fail(new Error('Divinity advisor response could not be read.'));
    worker.onmessage = ({ data }) => {
      if (disposed || data.id !== 1) return;
      worker?.terminate(); worker = null;
      try {
        if (data.type === 'error') throw new Error(data.error);
        if (data.type !== 'done' || !data.result?.characters?.length) throw new Error('The advisor returned an empty result.');
        advisor = data.result;
        banking = mountBanking(host.querySelector('#divinity-bank'), advisor, capturedRaw, () => stale);
        input = advisor.input;
        now = advisor.now;
        const values = host.querySelectorAll('.card-val[data-value]');
        values[0].dataset.value = exact(input.points); values[0].textContent = fmt(input.points);
        values[1].dataset.value = exact(now?.spirals); values[1].textContent = fmt(now?.spirals);
        updateSpend();
        progressHost.innerHTML = renderProgress(advisor, progressGoal.value);
        advisorHost.innerHTML = (stale ? staleNotice() : '') + renderAdvisor(advisor);
        host.querySelector('#singularity-scaling').innerHTML = renderScaling(input);
        activeHost.hidden = false;
        activeHost.innerHTML = `<h2>Farm Spirals</h2>
          <div class="controls"><label>Active character<select id="divinity-active-char">${advisor.characters.map(c => `<option value="${c.ci}">${esc(c.name)}</option>`).join('')}</select></label>
          <label>Combat map<select id="divinity-active-map"></select></label>
          <label>Seconds away per claim<input id="divinity-visit-seconds" type="number" min="0" max="3600" step="1" value="0"></label>
          <button id="divinity-active-run" type="button" ${stale || input.activated !== true || input.singularityUnlocked !== true ? 'disabled' : ''}>Find claim &amp; transmute timing</button><button id="divinity-active-cancel" type="button" hidden>Cancel</button></div>
          ${input.activated !== true || input.singularityUnlocked !== true ? '<p class="bad">Active timing requires saved Coral activation and Singularity unlock.</p>' : ''}
          <p class="spend-note">Imported gear and saved activities. Visit time includes switching, claiming and returning.</p>
          <div id="divinity-active-result" aria-live="polite"><p>Estimate active kill credit to choose an interval. No active rate is stored in the save.</p></div>`;
        const run = activeHost.querySelector('#divinity-active-run'), cancel = activeHost.querySelector('#divinity-active-cancel');
        const select = activeHost.querySelector('#divinity-active-char'), mapSelect = activeHost.querySelector('#divinity-active-map');
        const visitInput = activeHost.querySelector('#divinity-visit-seconds');
        const output = activeHost.querySelector('#divinity-active-result');
        const clearTiming = () => { capturedCadence = null; output.textContent = ''; updateSpend(); };
        const updateMaps = (preserve = false) => {
          const selectedId = mapSelect.value;
          const ci = Number(select.value), raw = capturedRaw.data ?? capturedRaw;
          const decode = value => rowValues(typeof value === 'string' ? JSON.parse(value) : value);
          const savedMap = Number(raw['CurrentMap_' + ci]);
          const savedId = savedMap === 216 ? '216:' + Number(decode(decode(raw.Holes)[0])[ci]) : String(savedMap);
          const maps = combatFarmingMaps(capturedRaw, ci);
          mapSelect.innerHTML = maps.length ? maps.map(map => `<option value="${esc(map.id)}"${String(map.id) === savedId ? ' selected' : ''}>${esc(map.name)}${String(map.id) === savedId ? ' (saved)' : ''}</option>`).join('')
            : '<option value="">No accessible combat maps</option>';
          if (preserve && maps.some(map => String(map.id) === selectedId)) mapSelect.value = selectedId;
          mapSelect.disabled = !maps.length;
          run.disabled = stale || !maps.length || input.activated !== true || input.singularityUnlocked !== true;
        };
        updateMaps();
        select.addEventListener('change', () => {
          activeController?.abort();
          clearTiming();
          updateMaps();
        });
        mapSelect.addEventListener('change', () => { activeController?.abort(); clearTiming(); });
        visitInput.addEventListener('change', () => { activeController?.abort(); clearTiming(); });
        cancel.addEventListener('click', () => activeController?.abort());
        run.addEventListener('click', async () => {
          if (stale || disposed || activeController) return;
          const controller = new AbortController();
          activeController = controller;
          run.disabled = true; cancel.hidden = false; select.disabled = true; mapSelect.disabled = true; visitInput.disabled = true;
          try {
            if (input.activated !== true || input.singularityUnlocked !== true)
              throw new Error('Active timing requires saved Coral activation and Singularity unlock.');
            const ci = Number(select.value);
            const visitSeconds = Number(visitInput.value);
            if (!visitInput.value.trim() || !Number.isInteger(visitSeconds) || visitSeconds < 0 || visitSeconds > 3600)
              throw new Error('Enter zero through 3600 whole seconds away per claim.');
            const map = combatSimMap(mapSelect.value);
            if (!map || !combatFarmingMaps(capturedRaw, ci).some(m => String(m.id) === mapSelect.value))
              throw new Error('Select an accessible stationary combat map.');
            const { samples, notes } = await sampleCoralKillCredit(capturedRaw, ci, map, controller.signal,
              progress => { output.textContent = 'Measuring active kill credit: ' + Math.round(progress.fraction * 100) + '%'; });
            if (disposed) return;
            const others = advisor.characters.filter(c => c.ci !== ci);
            if (others.some(c => c.claim == null || !Number.isFinite(c.claimPointsPerHour) || c.hourMultiplier == null))
              throw new Error('Other characters have unavailable claim inputs; a complete cycle projection cannot be made.');
            const pointsPerHour = others.reduce((sum, c) => sum + c.claimPointsPerHour, 0);
            const hoursPerHour = others.reduce((sum, c) => sum + c.hourMultiplier, 0);
            const killCreditPerHour = samples.reduce((sum, value) => sum + value, 0) / samples.length;
            if (!(killCreditPerHour > 0)) throw new Error('No Coral kill credit was earned in these samples; no active timing recommendation is available.');
            output.textContent = 'Comparing claim and transmutation timing...';
            const cadence = await calculateCycle(input, { pointsPerHour, hoursPerHour, killCreditPerHour,
              visitSeconds,
              claimers: others.map(c => ({ ci: c.ci, capped: c.capped, pointsPerHour: c.claimPointsPerHour, hourMultiplier: c.hourMultiplier })) }, advisor.purchaseUpgrades, controller.signal);
            if (disposed) return;
            capturedCadence = cadence;
            output.innerHTML = `${stale ? staleNotice() : ''}${renderFarm(cadence, advisor, ci, map)}
              <p class="spend-note" tabindex="0" data-tip="Three two-minute Auto samples. Integer-second schedules up to seven days; saved activities, claim gates, whole-hour credit and prayer caps. Rotation uses equal spacing and saved character order. Free grouped visits may include intermediate ten-hour claims. Existing banks, food/level changes and evolving account progression are excluded. Recalculate after upgrades.">Fixed-rate projection · ${fmt(killCreditPerHour)} kill credit/hr · seven-day search</p>
              ${notes.length ? '<details><summary>Unavailable combat inputs</summary><pre>' + esc(JSON.stringify(notes, null, 2)) + '</pre></details>' : ''}`;
            const curveChooser = output.querySelector('#combined-claim-choice');
            const updateCurve = () => { output.querySelector('#singularity-combined').innerHTML = renderCombined(cadence, Number(curveChooser?.value ?? 0)); };
            if (cadence.best) { curveChooser?.addEventListener('change', updateCurve); updateCurve(); }
            updateSpend();
          } catch (error) {
            if (!disposed) output.innerHTML = error.name === 'AbortError' ? '<p>Timing calculation cancelled.</p>' : '<p class="bad" role="alert">' + esc(error.message) + '</p>';
          } finally {
            if (activeController === controller) activeController = null;
            cancel.hidden = true; select.disabled = false; visitInput.disabled = false; updateMaps(true);
          }
        });
      } catch (error) { fail(error); }
    };
    worker.postMessage({ type: 'evaluate', id: 1, rawSave: capturedRaw });
  } catch (error) { fail(error); }
  return {
    dispose() { disposed = true; worker?.terminate(); activeController?.abort(); banking?.dispose(); disposeTooltip(); },
    stale() {
      if (stale) return;
      stale = true;
      banking?.stale();
      host.insertAdjacentHTML('afterbegin', staleNotice());
      const run = host.querySelector('#divinity-active-run');
      if (run) run.disabled = true;
    },
  };
}

function staleNotice() {
  return '<p class="bad">The save refreshed. These results retain the captured snapshot; use Recalculate or reload the save to adopt it.</p>';
}

async function sampleCoralKillCredit(capturedRaw, ci, map, signal, onProgress) {
  const raw = capturedRaw.data ?? capturedRaw;
  const combatData = Object.hasOwn(raw, 'OptionsListAccount') ? { ...raw, OptLacc:raw.OptionsListAccount } : raw;
  const combatRaw = capturedRaw.data ? { ...capturedRaw, data:combatData } : combatData;
  const seeds = crypto.getRandomValues(new Uint32Array(3));
  const batch = await runCombatBatch({ rawSave:combatRaw, concurrency:3, signal, onProgress,
    jobs:Array.from(seeds,seed => ({ charIdx:ci, mapIdx:map.mapIdx, seconds:120, seed:seed || 1,
      player:'auto', inputStatus:true, inputOverrides:map.holeCavern == null ? {} : { holeCavern:map.holeCavern } })) });
  if (batch.cancelled || signal.aborted) throw new DOMException('Combat sampling cancelled.', 'AbortError');
  if (batch.results.length !== 3) throw new Error('All three combat samples must complete.');
  const samples = batch.results.map(record => {
    if (record.error) throw new Error(record.error);
    if (record.result.timeMs < 120000) throw new Error('A sample ended early; no stationary rate recommendation is available.');
    const credit = record.result.summary.progress?.coralKills;
    if (!Number.isFinite(credit) || credit < 0) throw new Error('Active Coral kill credit is unavailable.');
    return credit / (record.result.timeMs / 3600000);
  });
  if (!samples.some(rate => rate > 0)) throw new Error('No Coral kill credit was earned in these samples.');
  return { samples, notes:batch.results.flatMap(record => record.result.inputIssues ?? []) };
}

function mountBanking(host, advisor, raw, isStale) {
  let worker = null, result = null, disposed = false, samplingController = null;
  const openPurchases = new Set();
  const weeks = advisor.banking;
  const candidates = (rows, id, name) => {
    const list = rows.some(row => row.id === id) ? rows : [...rows, { id, name: name + ' (not in saved candidates)' }];
    return '<option value="">Keep saved bonus</option>' + list.map(row =>
      `<option value="${row.id}"${row.id === id ? ' selected' : ''}>${esc(row.name)}</option>`).join('');
  };
  host.innerHTML = `<h2>Bank for a boosted week</h2>
    <p class="spend-note">Collection uses the claim-time bonus on the entire AFK bank. Candidates are votes, not guaranteed future winners. No automation or game claims run here.</p>
    <div class="controls">
      <label>Collect at<select id="bank-boundary"><option value="both">After both upcoming resets</option><option value="ballot">Next ballot reset</option><option value="merit">Next Merit reset</option></select></label>
      <label>Claim-time ballot<select id="bank-ballot">${candidates(weeks.ballotCandidates, 23, 'Divinity points')}</select></label>
      <label>Claim-time Merit<select id="bank-merit">${candidates(weeks.meritCandidates, 9, 'Ballot multiplier')}</select></label>
    </div>
    <p id="bank-clock" class="spend-note"></p><p id="bank-bonus-status" class="bad" hidden></p>${weeks.errors.map(error => '<p class="bad">' + esc(error) + '</p>').join('')}
    <div class="bank-characters" aria-label="Characters remaining AFK">${advisor.characters.map(c =>
      `<label><input type="checkbox" data-bank-char="${c.ci}"${c.activity === 'Divinity' || c.activity === 'Laboratory' ? ' checked' : ''}>${esc(c.name)}</label>`).join('')}</div>
    <div class="controls">
      <label>Goal<select id="bank-view"><option value="order">Boost remaining banked claims</option><option value="compare">Compare separate benefits</option><option value="future">Maximize future Spirals</option><option value="rank">Reach God Rank, then spend</option></select></label>
      <label id="bank-benefit-label">Rank by<select id="bank-benefit"><option value="pointRate">Divinity points/hr</option><option value="expRate">Divinity EXP/hr</option><option value="classFactor">Class EXP factor</option><option value="totalSpirals">Spirals retained + future</option></select></label>
      <label id="bank-rank-label">God Rank target<input id="bank-rank" type="number" min="${advisor.input.rank}" max="${advisor.input.rank + 100}" step="1" value="${advisor.input.rank + 1}"></label>
      <label id="bank-probability-label">Rank policy confidence %<input id="bank-probability" type="number" min="0.1" max="99.9999" step="any" value="95"></label>
      <button id="bank-run" type="button">Project claims &amp; compare spending</button><button id="bank-cancel" type="button" hidden>Cancel</button>
    </div>
    <div id="bank-grinding">
      <label class="bank-rank-choice"><input id="bank-grind" type="checkbox" checked>Grind kills before each conversion until another minute adds less than 1% Spirals</label>
      <div class="controls">
        <label>Active farmer<select id="bank-farmer">${advisor.characters.map(c => `<option value="${c.ci}">${esc(c.name)}</option>`).join('')}</select></label>
        <label>Combat map<select id="bank-map"></select></label>
        <label>Assumed kill credit/hr (0 = measure three two-minute samples)<input id="bank-order-rate" type="number" min="0" step="any" value="0"></label>
      </div>
      <p class="spend-note">Upcoming native multiplier jumps are checked too. If the farmer is selected above, claim that character first. Still-unclaimed characters gain AFK time during grinding. Combat rate stays fixed after purchases; current imported gear is sampled, not hypothetical future combat progression.</p>
    </div>
    <details><summary>Projection &amp; search settings</summary><div class="controls">
      <label>Future farming days<input id="bank-horizon" type="number" min="0" max="365" step="1" value="7"></label>
      <label>Seconds between rotating visits<input id="bank-gap" type="number" min="121" max="604800" step="1" value="121"></label>
      <label>Additional kill bank before collection<input id="bank-kills" type="number" min="0" step="1" value="0"></label>
      <label>Future active kill credit/hr<input id="bank-kill-rate" type="number" min="0" step="1" value="0"></label>
      <label id="bank-depth-label">Separate-benefit purchase depth<input id="bank-depth" type="number" min="0" max="6" step="1" value="3"></label>
      <label class="bank-rank-choice"><input id="bank-order-rank" type="checkbox" checked>Compare success/failure-aware God Rank attempts</label>
    </div><p class="spend-note">Redemption has no total purchase ceiling: useful affordable boosters are reconsidered after each claim and conversion. The depth control applies only to separate benefit views. Future farming settings use the same roster, zero visit overhead and fixed claim-time bonuses. No EXP settlement, new Reef levels, travel or pickup/storage losses are simulated.</p></details>
    <div id="bank-status" aria-live="polite"></div><div id="bank-result"></div>`;
  const get = id => host.querySelector('#bank-' + id);
  const output = get('result'), status = get('status'), run = get('run'), cancel = get('cancel');
  const stop = () => { samplingController?.abort(); samplingController=null; worker?.terminate(); worker = null; cancel.hidden = true; run.disabled = isStale(); status.removeAttribute('aria-busy'); };
  const updateMaps = () => {
    const maps = combatFarmingMaps(raw,Number(get('farmer').value));
    get('map').innerHTML = maps.map(map => `<option value="${esc(map.id)}">${esc(map.name)}</option>`).join('');
  };
  updateMaps();
  const bonusLabels = () => {
    const selected = new Set([...host.querySelectorAll('[data-bank-char]:checked')].map(c => Number(c.dataset.bankChar)));
    const merit = get('merit').value === '' ? null : Number(get('merit').value);
    const scenario = weeks.bonusScenarios?.find(row => row.merit === merit);
    const rows = scenario?.characters.filter(row => selected.has(row.ci)) ?? [];
    const range = (values, multiplier) => {
      if (!values.length || values.some(value => !Number.isFinite(value))) return 'Unavailable';
      const converted = values.map(value => multiplier ? 1 + value / 100 : value);
      const low = Math.min(...converted), high = Math.max(...converted);
      return low === high ? full(low) : full(low) + '-' + full(high);
    };
    const description = (name, values) => name.replace(/\{/g, range(values, false)).replace(/\}/g, range(values, true));
    for (const option of get('ballot').options) {
      if (option.value === '') continue;
      const id = Number(option.value), name = weeks.ballotCandidates.find(row => row.id === id)?.name
        ?? 'Divinity points }x; Divinity EXP +{%';
      option.textContent = description(name, rows.map(row => row.ballots.find(b => b.id === id)?.value ?? null))
        + (weeks.ballotCandidates.some(row => row.id === id) ? '' : ' (not in saved candidates)');
    }
    for (const option of get('merit').options) {
      if (option.value === '') continue;
      const id = Number(option.value), name = weeks.meritCandidates.find(row => row.id === id)?.name ?? 'Ballot bonuses }x';
      const entries = weeks.bonusScenarios?.find(row => row.merit === id)?.characters.filter(row => selected.has(row.ci)) ?? [];
      option.textContent = description(name, entries.map(row => row.meritValue))
        + (weeks.meritCandidates.some(row => row.id === id) ? '' : ' (not in saved candidates)');
    }
    const errors = [...new Set(rows.map(row => row.error).filter(Boolean))];
    if (rows.some(row => row.partial)) errors.push('Bonus values are partial: companion metadata is missing.');
    get('bonus-status').hidden = !errors.length;
    get('bonus-status').textContent = errors.join(' ');
  };
  const clock = () => {
    const boundary = get('boundary').value;
    const seconds = boundary === 'ballot' ? weeks.ballotSeconds : boundary === 'merit' ? weeks.meritSeconds
      : Math.max(weeks.ballotSeconds, weeks.meritSeconds);
    get('clock').textContent = weeks.ballotSeconds == null || weeks.meritSeconds == null ? 'Weekly timing unavailable: snapshot time is missing.'
      : `Claim in ${duration(seconds)} from the save snapshot. Next ballot: ${duration(weeks.ballotSeconds)}; next Merit: ${duration(weeks.meritSeconds)}.`;
    bonusLabels();
  };
  const display = () => {
    const order = get('view').value === 'order';
    get('benefit-label').hidden = get('view').value === 'future' || order;
    get('rank-label').hidden = get('probability-label').hidden = order && !get('order-rank').checked;
    get('order-rank').parentElement.hidden = !order;
    get('grinding').hidden = !order;
    get('depth-label').hidden = order;
    for (const id of ['farmer','map','order-rate']) get(id).disabled = !get('grind').checked;
    for (const id of ['horizon', 'gap', 'kill-rate']) get(id).parentElement.hidden = order;
    if (result) {
      for (const detail of output.querySelectorAll('[data-bank-purchases]')) {
        if (detail.open) openPurchases.add(detail.dataset.bankPurchases);
        else openPurchases.delete(detail.dataset.bankPurchases);
      }
      output.innerHTML = renderBanking(result, get('view').value, get('benefit').value, openPurchases);
      for (const detail of output.querySelectorAll('[data-bank-purchases][open]')) mountPurchases(detail);
    }
  };
  const mountPurchases = detail => {
    const body = detail.querySelector('tbody');
    if (body.childElementCount) return;
    const [from, to] = detail.dataset.bankPurchases.split(':').map(Number);
    body.innerHTML = result.redemption.best.actions.slice(from, to).map(action =>
      `<tr><td>${action.level}</td><td class="num" tabindex="0" data-value="${exact(action.cost)}">${full(action.cost)}</td></tr>`).join('');
  };
  output.addEventListener('toggle', event => {
    if (event.target.matches?.('[data-bank-purchases]') && event.target.open && output.contains(event.target))
      mountPurchases(event.target);
  }, true);
  for (const control of host.querySelectorAll('input, select')) control.addEventListener('change', () => {
    if (control === get('view') || control === get('benefit')) { display(); return; }
    const running = !!worker || !!samplingController;
    stop(); result = null; openPurchases.clear(); output.replaceChildren();
    if (control === get('farmer')) { updateMaps(); get('order-rate').value='0'; }
    if (control === get('map')) get('order-rate').value='0';
    status.textContent = running ? 'Input changed; projection cancelled.' : '';
    clock();
    display();
  });
  clock();
  display();
  cancel.addEventListener('click', () => { stop(); status.textContent = 'Banking projection cancelled.'; });
  run.disabled = isStale();
  run.addEventListener('click', async () => {
    if (worker || samplingController || disposed || isStale()) return;
    const controller = new AbortController();
    samplingController=controller;
    try {
      const numeric = id => {
        const field = get(id);
        if (!field.value.trim() || !field.checkValidity()) throw new Error('Check ' + field.parentElement.textContent.trim() + '.');
        return Number(field.value);
      };
      const boundary = get('boundary').value;
      const seconds = boundary === 'ballot' ? weeks.ballotSeconds
        : boundary === 'merit' ? weeks.meritSeconds : weeks.ballotSeconds == null || weeks.meritSeconds == null ? null
          : Math.max(weeks.ballotSeconds, weeks.meritSeconds);
      if (seconds == null) throw new Error('Weekly timing is unavailable; load a save with a snapshot time.');
      const options = { seconds, characters: [...host.querySelectorAll('[data-bank-char]:checked')].map(c => Number(c.dataset.bankChar)),
        ballot: get('ballot').value === '' ? null : Number(get('ballot').value),
        merit: get('merit').value === '' ? null : Number(get('merit').value), rankTarget: numeric('rank'),
        probability: numeric('probability') / 100, horizonHours: numeric('horizon') * 24,
        gapSeconds: numeric('gap'), killCredit: numeric('kills'), killCreditPerHour: numeric('kill-rate'), maxPurchases: numeric('depth'),
        order: true, orderRank: get('order-rank').checked, orderObjective: 'points', orderMaxPurchases:null };
      result = null; openPurchases.clear(); output.replaceChildren();
      run.disabled = true; cancel.hidden = false; status.setAttribute('aria-busy', 'true');
      if (get('view').value === 'order' && get('grind').checked) {
        options.orderFarmer = Number(get('farmer').value);
        options.orderKillCreditPerHour = numeric('order-rate');
        const map = combatSimMap(get('map').value);
        if (!map || !combatFarmingMaps(raw,options.orderFarmer).some(m => String(m.id) === get('map').value))
          throw new Error('Select an accessible stationary combat map for grinding.');
        options.orderCombatMap = map.name;
        if (!options.orderKillCreditPerHour) {
          const sample = await sampleCoralKillCredit(raw,options.orderFarmer,map,controller.signal,
            progress => { if (samplingController === controller) status.textContent =
              'Measuring redemption kill credit: ' + Math.round(progress.fraction*100) + '%'; });
          if (samplingController !== controller || disposed) return;
          options.orderKillCreditPerHour = sample.samples.reduce((sum,rate) => sum+rate,0)/sample.samples.length;
          options.orderCombatNotes = sample.notes;
          options.orderCombatMeasured = true;
        }
      }
      if (samplingController !== controller || disposed) return;
      worker = new Worker(new URL('../workers/coral-divinity-worker.js?v=spiral-bank-7', import.meta.url), { type: 'module' });
      const fail = error => { stop(); status.innerHTML = '<p class="bad" role="alert">' + esc(error.message || String(error)) + '</p>'; };
      worker.onerror = event => fail(new Error(event.message || 'Banking worker failed.'));
      worker.onmessageerror = () => fail(new Error('Banking response could not be read.'));
      worker.onmessage = ({ data }) => {
        if (disposed || data.id !== 3) return;
        stop();
        try {
          if (data.type === 'error') throw new Error(data.error);
          if (data.type !== 'done' || !data.result?.forecast?.claims?.length || !Array.isArray(data.result.rows))
            throw new Error('Banking worker returned an invalid result.');
          result = data.result;
          status.textContent = isStale() ? 'Captured projection is stale; Recalculate to adopt the refreshed save.' : '';
          display();
        } catch (error) { fail(error); }
      };
      worker.postMessage({ type: 'bank', id: 3, rawSave: raw, options });
      status.textContent = 'Rebuilding claim-time bonuses and comparing funded purchase paths...';
    } catch (error) {
      if (samplingController !== controller || disposed) return;
      stop(); status.innerHTML = '<p class="bad" role="alert">' + esc(error.message) + '</p>';
    }
  });
  return { dispose() { disposed = true; stop(); }, stale() { run.disabled = true; } };
}

function renderBanking(result, view, benefit, openPurchases) {
  if (view === 'order') return renderBankRedemption(result, openPurchases);
  const { forecast, payouts, rankPlan } = result;
  const metric = view === 'future' ? 'totalSpirals' : benefit;
  const baseline = result.rows[0];
  const ranked = result.rows.map((row, index) => ({ ...row, index }))
    .filter(row => view !== 'rank' || row.rank === result.options.rankTarget)
    .sort((a, b) => (Number.isFinite(b[metric]) ? b[metric] : -Infinity) - (Number.isFinite(a[metric]) ? a[metric] : -Infinity)
      || b.retainedSpirals - a.retainedSpirals || a.index - b.index);
  const selectedRows = [baseline && { ...baseline, index: 0 }, ...ranked.filter(r => r.index !== 0).slice(0, 8)].filter(Boolean);
  const planName = row => row.index === 0 ? 'Convert all - no purchases' : [
    row.conditional ? 'God Rank ' + row.rank + ' (on success)' : '',
    row.actions.length ? 'Coral: ' + [...new Set(row.actions.map(a => a.index))].map(i =>
      UPGRADES[i] + ' +' + row.actions.filter(a => a.index === i).length).join(', ') : '',
    row.spiral ? PURCHASE_NAMES[row.spiral.index] + ' +1 after conversion' : '',
  ].filter(Boolean).join('; ');
  const details = row => `<details><summary>Exact spending order</summary>
    <p>Claim selected characters; ${row.rankBudget ? 'reserve ' + fmt(row.rankBudget) + ' points for high offerings, stop on success or each rank limit; ' : ''}
    buy Coral levels in the order below${row.rankBudget ? '; perform the bounded high offerings' : ''}; ${row.immediateSpirals > 0 ? 'transmute leftovers' : 'retain the leftover bank (no positive transmutation)'}${row.spiral ? ', then collect the new stack and buy ' + esc(PURCHASE_NAMES[row.spiral.index]) : ''}.</p>
    ${row.actions.map(a => `<p>${esc(UPGRADES[a.index])} to ${a.level}: ${fmt(a.cost)} points</p>`).join('')}
    <p>Points after spending/reserves: ${fmt(row.points)}. ${row.conditional ? 'Unused offering reserves increase the actual leftover; failure does not grant the displayed rank benefits.' : ''}</p>
    ${[...row.errors, row.futureError, row.classFactorError].filter(Boolean).map(error => '<p class="bad">' + esc(error) + '</p>').join('')}</details>`;
  return `${result.partial ? '<p class="bad">Partial: some companion or current bonus metadata is missing.</p>' : ''}
    <h3>One banked collection, before spending</h3>
    <div class="table-scroll"><table class="data-table"><thead><tr><th>Collection</th><th class="num">Generated points</th><th class="num">Total points</th><th class="num">Spirals</th></tr></thead><tbody>
      ${[['Claim now',result.claimNow],["Same wait - today's saved bonuses",result.sameBonusesLater],['Same wait - chosen bonus scenario (future winners unknown)',forecast]].map(([name,p],i) =>
        `<tr><td>${name}</td>${cell(p.generatedPoints)}${cell(p.bank.points)}${cell(payouts[i].spirals)}</tr>`).join('')}</tbody></table></div>
    ${[...new Set(payouts.map(p => p.reason).filter(Boolean))].map(reason => '<p class="bad">' + esc(reason) + '</p>').join('')}
    <p class="${forecast.lostSeconds > 0 ? 'bad' : 'spend-note'}">${duration(result.options.seconds)} additional AFK; ${fmt(forecast.creditedHours)} Singularity hour credit; ${duration(forecast.lostSeconds)} lost to prayer caps.</p>
    <details><summary>Per-character claims &amp; Divinity EXP</summary><div class="table-scroll"><table class="data-table"><thead><tr><th>Character</th><th class="num">Credited hours</th><th class="num">Points</th><th class="num">Direct EXP</th><th class="num">TranQi EXP</th><th class="num">Spiral hours</th></tr></thead><tbody>
      ${forecast.claims.map(c => `<tr><td>${esc(c.name)}</td>${cell(c.creditedSeconds == null ? null : c.creditedSeconds/3600)}${cell(c.points)}${cell(c.baseExp)}${cell(c.tranqiExp)}${cell(c.hours)}</tr>`).join('')}</tbody></table></div></details>
    ${result.curves.every(rows => rows.every(r => Number.isFinite(r.spirals))) ? renderTimingChart([
      { name: 'Saved bonuses', color: '#bb86fc', key: 'spirals', rows: result.curves[0],
        tip: r => 'Saved bonuses; additional AFK ' + duration(r.seconds) + '; points ' + exact(r.points) + '; Spirals ' + exact(r.spirals) },
      { name: 'Selected winners at collection', color: '#4dd0e1', key: 'spirals', rows: result.curves[1],
        tip: r => 'Unconfirmed claim-time winners; additional AFK ' + duration(r.seconds) + '; points ' + exact(r.points) + '; Spirals ' + exact(r.spirals) },
    ], [], 'Spirals in one banked claim versus additional AFK hours') : '<p class="bad">Banking graph unavailable: one or more banks could not be evaluated.</p>'}
    <h3>${view === 'rank' ? 'Fund the God Rank target, then compare leftovers' : view === 'future' ? 'Spirals retained + future farming' : 'Separate purchase benefits'}</h3>
    ${rankPlan ? `<p class="spend-note">God Rank ${rankPlan.target}: ${pct(rankPlan.successProbability)} success under the bounded high-offering policy; reserve ${fmt(rankPlan.budget)} points for up to ${rankPlan.attempts} attempts. Full maximum costs are funded, even if no free offering occurs. This is conservative, not the cheapest probability-aware policy.</p>
      <details><summary>Rank attempt limits</summary><p>${esc(rankPlan.policy)}</p>${rankPlan.stages.map(s =>
        `<p>Rank ${s.rank} → ${s.rank + 1}: up to ${s.attempts} attempts, ${fmt(s.budget)} points reserved, ${pct(s.chance)} success.</p>`).join('')}</details>`
      : '<p class="bad">Rank plan unavailable: ' + esc(result.rankError) + '</p>'}
    ${view === 'rank' && !ranked.length ? '<p class="bad">The selected rank probability cannot be fully funded from the projected point bank. No rank-success path is recommended.</p>' : ''}
    ${!selectedRows.length ? '<p class="bad">Spending comparisons unavailable: projected banks are incomplete.</p>' : `<div class="table-scroll"><table class="data-table bank-plans"><thead><tr><th>Plan</th><th class="num">Spirals left</th><th class="num">Spirals sacrificed</th><th class="num">Points/hr</th><th class="num">Divinity EXP/hr</th><th class="num">Class EXP factor</th><th class="num">Future Spirals</th></tr></thead><tbody>${selectedRows.map(r =>
      `<tr><td data-label="Plan">${esc(planName(r))}${details(r)}</td>${[
        ['Spirals left',r.retainedSpirals],['Spirals sacrificed',r.spiralLoss],['Points/hr',r.pointRate],['Divinity EXP/hr',r.expRate],
        ['Class EXP factor',r.classFactor],['Future Spirals',r.futureSpirals],
      ].map(([name,value]) => cell(value).replace('<td ', '<td data-label="' + name + '" ')).join('')}</tr>`).join('')}</tbody></table></div>`}
    <p class="spend-note">Rank-success rates are conditional, never guaranteed or expected returns. Leftover Spirals use the worst-case reserved bill. Class EXP is only the shared Coral/God Rank factor, not full combat EXP. Future Spirals assume the selected bonuses remain active for ${fmt(result.options.horizonHours)} hours and every rotating claim can transmute; complete laps only, no further spending or level settlement. Graphs hold the additional kill bank fixed at every wait duration.</p>
    <details><summary>Search scope</summary><p>${esc(result.scope)} Evaluated ${result.evaluated} rate variants. This is best-found, not globally optimal.</p></details>
    ${result.errors.map(error => '<p class="bad">' + esc(error) + '</p>').join('')}`;
}

function renderBankRedemption(result, openPurchases = new Set()) {
  const plan = result.redemption;
  if (!plan) return '<p class="bad" role="alert">Redemption order unavailable: ' + esc(result.redemptionError) + '</p>';
  const { best, baseline } = plan;
  const pointsFirst = plan.objective === 'points';
  const claims = best.actions.filter(action => action.type === 'claim');
  const reference = new Map(baseline.actions.filter(action => action.type === 'claim').map(action => [action.ci, action]));
  const number = (value, unit) => `<span class="bank-number" tabindex="0" data-value="${exact(value)}"
    data-tip="${esc(full(value) + ' ' + unit)}">${fmt(value)} <span>${esc(unit)}</span></span>`;
  const step = (type, label, title, body, from, to = from + 1) =>
    `<li class="bank-step bank-step-${type}" data-action-from="${from}" data-action-to="${to}">
      <div class="bank-step-heading"><span class="bank-step-kind">${label}</span><strong>${title}</strong></div>${body}</li>`;
  const steps = [];
  for (let i = 0; i < best.actions.length; i++) {
    const action = best.actions[i];
    if (action.type === 'claim') {
      const saved = reference.get(action.ci);
      const boost = saved.points > 0 && action.points !== saved.points
        ? '<span class="bank-step-gain">' + pct(action.points / saved.points - 1) + ' more points than claiming everyone first</span>' : '';
      steps.push(step('claim', 'Claim', esc(action.name),
        '<div class="bank-step-values">' + number(action.points, 'points') + number(action.hours, 'Spiral hours') + '</div>' + boost
        + (action.lostSeconds > 0 ? '<p class="bad">' + duration(action.lostSeconds) + ' lost to the prayer cap.</p>' : ''), i));
      continue;
    }
    if (action.type === 'purchase') {
      const from = i;
      let cost = action.cost;
      while (best.actions[i + 1]?.type === 'purchase' && best.actions[i + 1].index === action.index
        && best.actions[i + 1].currency === action.currency && best.actions[i + 1].level === best.actions[i].level + 1) {
        cost += best.actions[++i].cost;
      }
      const count = i - from + 1, key = from + ':' + (i + 1);
      const currency = action.currency === 'points' ? 'Divinity points' : 'Spirals';
      steps.push(step('purchase', 'Upgrade', esc(PURCHASE_NAMES[action.index]),
        `<div class="bank-step-values"><span>Lv ${action.level - 1} → <strong>${best.actions[i].level}</strong>
          <span class="bank-step-muted">(+${count} ${count === 1 ? 'level' : 'levels'})</span></span>
          <span>Total quoted cost: ${number(cost, currency)}</span></div>
        <details data-bank-purchases="${key}"${openPurchases.has(key) ? ' open' : ''}>
          <summary>Exact costs${count > 1 ? ' for all ' + count + ' purchases' : ''}</summary>
          <div class="table-scroll"><table class="data-table"><thead><tr><th>Buy to level</th><th class="num">${currency}</th></tr></thead><tbody></tbody></table></div>
        </details>`, from, i + 1));
      continue;
    }
    if (action.type === 'grind') {
      const farmer = result.forecast.claims.find(c => c.ci === result.options.orderFarmer)?.name
        ?? 'Selected active farmer';
      steps.push(step('grind', 'Grind', duration(action.seconds),
        '<p>' + esc(farmer) + ' · ' + esc(result.options.orderCombatMap ?? 'Declared combat map') + '</p>'
        + '<div class="bank-step-values">' + number(action.kills, 'kill credit added')
        + '<span>Payout: ' + number(action.before, 'Spirals') + ' → ' + number(action.after, 'Spirals') + '</span></div>'
        + '<p class="bank-step-muted">' + (action.windowLimited ? 'Stop before the next bonus reset.'
          : 'Stop here: the next minute adds ' + pct(action.nextMinuteGain) + ' (below 1%).') + '</p>', i));
      continue;
    }
    if (action.type === 'rank') {
      steps.push(step('rank', 'Conditional', 'God Rank ' + action.target,
        '<div class="bank-step-values">Reserve ' + number(action.cost, 'points') + '</div>'
        + '<p class="bad">Continue only on success (' + pct(action.probability)
        + ' bounded-policy chance). Follow the rank attempt limits below.</p>', i));
      continue;
    }
    steps.push(step('convert', 'Convert', number(action.spirals, 'Spirals'),
      '<div class="bank-step-values">' + number(action.points, 'points') + number(action.hours, 'hours')
      + number(action.kills, 'kill credit') + '</div>'
      + '<p class="bank-step-muted">Collect this new stack into shared accessible storage before continuing.</p>', i));
  }
  return `${result.partial ? '<p class="bad">Partial: some account bonus metadata is missing.</p>' : ''}
    ${result.redemptionError ? '<p class="bad">' + esc(result.redemptionError) + '</p>' : ''}
    <h3>Best-found redemption order</h3>
    <p class="spend-note">${pointsFirst ? 'Priority: maximize total Divinity points generated; leftover Spirals break ties.' : 'Priority: maximize retained new Spirals.'}
      Follow the numbered steps. Consecutive purchases of the same upgrade are grouped; expand them for exact per-level costs.</p>
    <div class="table-scroll"><table class="data-table bank-plans"><thead><tr><th>Sequence</th><th class="num">Generated points</th><th class="num">New Spirals retained</th></tr></thead><tbody>
      <tr><td>Claim everyone first; convert once; no purchases</td>${cell(baseline.generatedPoints, 'Generated points')}${cell(baseline.retainedSpirals, 'New Spirals retained')}</tr>
      <tr><td>Interleaved claims &amp; spending${best.conditional ? ' (God Rank success required)' : ''}</td>${cell(best.generatedPoints, 'Generated points')}${cell(best.retainedSpirals, 'New Spirals retained')}</tr>
    </tbody></table></div>
    <p>${number(pointsFirst ? plan.pointsGain : plan.gain, 'more ' + (pointsFirst ? 'Divinity points generated' : 'new Spirals retained'))} after all selected banked claims and purchases.
      ${(pointsFirst ? plan.pointsGain : plan.gain) === 0 ? 'No improvement in the selected objective was found in this search scope.' : ''}</p>
    ${renderBankRankComparison(result, number)}
    ${plan.rankComparison || plan.rankComparisonError ? '<h3>No-attempt sequence</h3><p class="spend-note">The numbered steps below skip offerings. If attempting is recommended, follow the rank timing above, then recalculate from the actual saved result before continuing; expected balances are not executable amounts.</p>' : ''}
    <div class="bank-step-overview"><span>${claims.length} claims</span><span>${best.purchases} purchases${plan.maxPurchases == null ? ' (no total ceiling)' : '/' + plan.maxPurchases}</span>
      <span>${duration(best.elapsedSeconds ?? 0)} active grinding</span></div>
    <ol class="bank-redemption-steps">${steps.join('')}</ol>
    <details><summary>Per-character claim comparison</summary><div class="table-scroll"><table class="data-table"><thead><tr><th>Character</th><th class="num">Claim everyone first</th><th class="num">In this order</th><th class="num">Extra points</th></tr></thead><tbody>
      ${claims.map(action => `<tr><td>${esc(action.name)}</td>${cell(reference.get(action.ci).points)}${cell(action.points)}${cell(action.points-reference.get(action.ci).points)}</tr>`).join('')}
    </tbody></table></div></details>
    ${best.conditional && result.rankPlan ? `<details><summary>Conditional rank attempt limits</summary><p>${esc(result.rankPlan.policy)}</p>${result.rankPlan.stages.map(stage =>
      `<p>Rank ${stage.rank} → ${stage.rank+1}: at most ${stage.attempts} attempts, ${full(stage.budget)} points reserved.</p>`).join('')}</details>` : ''}
    <details><summary>Projection assumptions &amp; remaining banks</summary>
    <p class="spend-note">Both currencies can fund boosters before later characters claim. Rates are rebuilt after each purchase; earlier rewards never receive later bonuses.
      ${result.options.orderKillCreditPerHour > 0 ? 'Each conversion replenishes kills until the additional-minute gain falls below 1%, checking native multiplier jumps. Still-unclaimed characters accrue that grinding time; the farmer claims first if included. The sequence stops grinding before either bonus resets.' : 'Kill grinding is disabled for this projection.'}
      All claims use the chosen claim-time bonus scenario; future winners are unknown. ${pointsFirst ? 'Boosters may cost more Spirals than these claims repay.' : ''}</p>
    <p class="spend-note">Leftover point bank: ${number(best.points, 'points')}; hour bank: ${number(best.hours, 'hours')}.
      New stacks must be picked up and made accessible to later characters; storage capacity and item loss are not modeled. Existing Spiral stacks are not spent. Rank branches use worst-case funding, not guaranteed success. ${pointsFirst ? 'Generated points are gross claim rewards, before upgrade spending and conversion, not the ending balance.' : 'This ranks the current bank\'s retained new Spirals.'} Ongoing farming and the value of every account benefit are excluded.</p>
    </details>
    ${result.options.orderKillCreditPerHour > 0 ? `<p class="spend-note">${result.options.orderCombatMeasured ? 'Three two-minute imported-gear Auto samples' : 'Explicit assumed combat rate'}: ${number(result.options.orderKillCreditPerHour, 'kill credit/hr')}. This rate remains fixed after upgrades. Extra generated points include additional AFK time during the shown grinding; they are not all upgrade-only gains.</p>` : ''}
    ${result.options.orderCombatNotes?.length ? '<details><summary>Combat input limitations</summary><pre>' + esc(JSON.stringify(result.options.orderCombatNotes,null,2)) + '</pre></details>' : ''}
    <details><summary>Search scope</summary><p>${esc(plan.scope)} ${plan.evaluated} states, ${plan.measurements} full-loader rate variants.
      ${plan.limited ? 'Search limits/pruning were reached; this is not an exhaustive optimum.' : 'Only the declared finite action scope was searched; no whole-game optimum is claimed.'}</p></details>`;
}

function renderBankRankComparison(result, number) {
  const { rankComparison: comparison, rankComparisonError: error } = result.redemption;
  if (error) return '<section class="bank-rank-risk"><h3>God Rank risk comparison</h3><p class="bad" role="alert">'
    + esc(error) + ' No rank recommendation is available; the no-attempt sequence remains valid.</p></section>';
  if (!comparison) return '';
  const row = comparison.candidate;
  if (!row) return '<section class="bank-rank-risk"><h3>God Rank risk comparison</h3><p>No offering is affordable before a remaining claim in the compared policies. Skip attempts for this bank.</p></section>';
  const names = new Map(result.forecast.claims.map(c => [c.ci, c.name]));
  const metric = result.redemption.objective === 'points' ? 'netPoints' : 'retainedSpirals';
  return `<section class="bank-rank-risk" data-worthwhile="${comparison.worthwhile}">
    <h3>God Rank ${comparison.target}: ${comparison.worthwhile ? 'Attempting is worthwhile for this bank' : 'Skip attempts for this bank'}</h3>
    <p>Best compared attempt policy: ${row.afterClaims.length ? 'after claiming ' + esc(row.afterClaims.map(ci => names.get(ci)).join(', ')) : 'before the first claim'}, before buying boosters.
      Use the right/high offering; stop on reaching the target, the limits below, or an unaffordable displayed cost.</p>
    <p>${number(row.successProbability * 100, '% chance of reaching the target')};
      expected offering spend ${number(row.expectedSpent, 'points')};
      expected change ${number(metric === 'netPoints' ? row.netGain : row.spiralGain, metric === 'netPoints' ? 'net claim points' : 'retained Spirals')} versus the best no-attempt sequence.</p>
    <div class="table-scroll"><table class="data-table"><thead><tr><th>Policy</th><th class="num">Generated points</th><th class="num">Points after offering costs*</th><th class="num">New Spirals retained</th></tr></thead><tbody>
      <tr><td>Skip attempts; interleave boosters</td>${cell(comparison.skip.generatedPoints, 'Generated points')}${cell(comparison.skip.netPoints, 'Points after offering costs')}${cell(comparison.skip.retainedSpirals, 'New Spirals retained')}</tr>
      <tr><td>Attempt policy (probability-weighted)</td>${cell(row.generatedPoints, 'Generated points')}${cell(row.netPoints, 'Points after offering costs')}${cell(row.retainedSpirals, 'New Spirals retained')}</tr>
    </tbody></table></div>
    <p class="spend-note">*Generated claim points minus actual offering spend, not the ending bank. Both outcomes also include their own booster spending, grinding and conversions.
      ${comparison.worthwhile ? 'Higher expected return is not guaranteed; failure can leave less for boosters and Spirals.' : 'The success boost does not repay its probability-weighted opportunity cost in the selected objective.'}
      Benefits after these selected claims are not valued.</p>
    <details><summary>Success, failure &amp; stopping limits</summary>
      ${row.policy.stages.map(stage => `<p>Rank ${stage.rank} → ${stage.rank + 1}: at most ${stage.attempts} ${stage.attempts === 1 ? 'attempt' : 'attempts'}.</p>`).join('')}
      <p>Full displayed cost must be available even when an offering rolls free. Both offerings reroll after every attempt; this policy always uses the high one.</p>
      <div class="table-scroll"><table class="data-table"><thead><tr><th>Actual ending rank</th><th class="num">Chance</th><th class="num">Mean offering spend</th><th class="num">Mean net claim points</th><th class="num">Mean retained Spirals</th></tr></thead><tbody>
      ${row.branches.map(branch => `<tr><td>Rank ${branch.rank}${branch.rank === comparison.target ? ' (success)' : ' (target not reached)'}</td><td class="num" data-value="${exact(branch.probability)}">${pct(branch.probability)}</td>${cell(branch.spent, 'Mean offering spend')}${cell(branch.netPoints, 'Mean net claim points')}${cell(branch.retainedSpirals, 'Mean retained Spirals')}</tr>`).join('')}
      </tbody></table></div>
      <p class="spend-note">These conditional means across real paid/free and rerolled-offering branches are not executable balances to enter into the game. Recalculate after the actual attempt batch.</p>
    </details>
    <details><summary>Rank comparison scope</summary><p>${esc(comparison.scope)} ${comparison.compared} timing/order policies compared.</p></details>
  </section>`;
}

function renderTimingChart(series, markers, label, normalized = false) {
  const rows = series.flatMap(s => s.rows);
  if (!rows.length) return '<p>No executable schedule in this window.</p>';
  const left = 58, top = 28, width = 640, height = 200;
  const maxX = Math.max(...rows.map(r => r.hours), 1);
  const maxY = normalized ? 100 : Math.max(1, ...series.flatMap(s => s.rows.map(r => r[s.key])));
  const x = hours => left + width * hours / maxX;
  const y = value => top + height * (1 - value / maxY);
  const lines = series.map(s => {
    const divisor = normalized ? Math.max(1e-300, ...s.rows.map(r => r[s.key])) / 100 : 1;
    const value = r => r[s.key] / divisor;
    const path = s.rows.map((r, i) => (i ? 'L' : 'M') + x(r.hours) + ',' + y(value(r))).join(' ');
    const visible = s.rows.filter((r, i) => i % Math.max(1, Math.ceil(s.rows.length / 32)) === 0
      || markers.some(m => m.seconds === r.seconds) || i === s.rows.length - 1);
    return `<path d="${path}" stroke="${s.color}" stroke-width="2" fill="none"/>
      ${visible.map(r => `<circle cx="${x(r.hours)}" cy="${y(value(r))}" r="3" fill="${s.color}" tabindex="0"
        data-value="${r[s.key]}" data-tip="${esc(s.tip ? s.tip(r) : s.name + ': ' + exact(r[s.key]) + '; full cycle ' + duration(r.seconds)
          + (r.points == null ? '' : '; points ' + exact(r.points) + '; kill credit ' + exact(r.kills) + '; banked hours ' + exact(r.bankedHours))
          + '; schedule Spirals/hour ' + exact(r.perHour))}"/>`).join('')}`;
  }).join('');
  return `<div class="singularity-chart">
    <div class="chart-legend">${series.map(s => `<span style="color:${s.color}">${esc(s.name)}</span>`).join('')}</div>
    <svg viewBox="0 0 740 278" role="group" aria-label="${esc(label)}">
      ${[0,.25,.5,.75,1].map(f => `<line x1="${left}" x2="${left+width}" y1="${y(f*maxY)}" y2="${y(f*maxY)}" stroke="#ffffff18"/>
        <text x="${left-8}" y="${y(f*maxY)+4}" text-anchor="end">${normalized ? f*100+'%' : fmt(f*maxY)}</text>
        <text x="${x(f*maxX)}" y="247" text-anchor="middle">${full(f*maxX)}h</text>`).join('')}
      ${lines}
      ${markers.map((m,i) => `<g tabindex="0" data-marker="${m.id}" data-value="${m.seconds}" data-tip="${esc(m.name + ': ' + duration(m.seconds))}">
        <line x1="${x(m.seconds/3600)}" x2="${x(m.seconds/3600)}" y1="${top}" y2="${top+height}" stroke="${m.color}" stroke-dasharray="${i ? '3 3' : '7 3'}" stroke-width="2"/>
        <circle cx="${x(m.seconds/3600)}" cy="${top+8+i*12}" r="5" fill="${m.color}"/></g>`).join('')}
      <text x="378" y="270" text-anchor="middle">${esc(label)}</text>
    </svg>
    <div class="chart-legend">${markers.map(m => `<span style="color:${m.color}">${esc(m.name)}: ${duration(m.seconds)}</span>`).join('')}</div>
  </div>`;
}

function renderFarm(cadence, advisor, ci, map) {
  if (!cadence.best) return '<p class="bad">No positive fresh-cycle payout within seven days.</p>';
  const best = cadence.best, rotating = cadence.strategy === 'rotating';
  const name = id => advisor.characters.find(c => c.ci === id).name;
  return `<div class="card-grid cols-3">${card('Spirals/hour', best.perHour, rotating ? 'Rotating claims' : 'Grouped claims')}
    <div class="card"><div class="card-title">${rotating ? 'Visit every' : 'Transmute every'}</div><div class="card-val" data-value="${best.gapSeconds ?? best.seconds}" tabindex="0">${duration(best.gapSeconds ?? best.seconds)}</div></div>
    ${card(rotating ? 'Spirals/full rotation' : 'Spirals/cycle', best.spirals)}</div>
    ${cadence.visitSeconds === 0 ? '<p class="bad">Idealized upper bound: visits take no time.</p>' : ''}
    <h3>Rate versus claim interval</h3>
    ${renderTimingChart(cadence.comparisons.map((c,i) => ({ name: c.strategy === 'rotating' ? 'Rotating' : 'Grouped',
      key: 'perHour', color: i ? '#4dd0e1' : '#bb86fc', rows: c.rows })),
      [{ id:'best-rate', name:'Best schedule rate', seconds:best.seconds, color:'#ffd700' }], 'Full cycle / rotation (hours)')}
    <table class="data-table"><thead><tr><th>Strategy</th><th>Full cycle</th><th>Spirals/hr</th></tr></thead><tbody>${cadence.comparisons.map(c =>
      `<tr${c.strategy === cadence.strategy ? ' class="spend-best"' : ''}><td>${c.strategy === 'rotating' ? 'One character → transmute → fight' : 'Claim everyone → transmute'}</td><td>${c.best ? duration(c.best.seconds) : 'No payout'}</td>${cell(c.best?.perHour)}</tr>`).join('')}</tbody></table>
    <h3>Repeat the best-rate schedule</h3>
    <p class="spend-note">${esc(name(ci))} · ${esc(map.name)}${rotating ? ' · fight ' + duration(best.fightSeconds) + ' between visits' : ''}.</p>
    ${rotating ? `<p>Claim → optionally spend → transmute → return to farming. Each character is revisited every ${duration(best.seconds)}.</p>
      <table class="data-table"><thead><tr><th>Claim order</th><th>Offline claim</th><th>Spirals per claim</th></tr></thead><tbody>${cadence.visits.map(v =>
        `<tr><td>${esc(name(v.ci))}</td><td>${duration(best.offlineSeconds)}</td>${cell(v.spirals)}</tr>`).join('')}</tbody></table>
      ${cadence.excludedClaimers.length ? '<p class="spend-note">Rotation skips characters producing no points; grouped claims include them.</p>' : ''}`
      : `<p>Collect these claims, optionally spend, then transmute at ${duration(best.seconds)}.</p>
        <div class="spend-claim-chips">${(cadence.claims ?? cadence.visits.map(v => ({ci:v.ci,count:1,intervalSeconds:best.offlineSeconds}))).map(c =>
          `<span class="pill">${esc(name(c.ci))}: ${c.count} × ${duration(c.intervalSeconds)}${c.finalSeconds ? ', final '+duration(c.finalSeconds) : ''}${c.unclaimedSeconds ? '; leave '+duration(c.unclaimedSeconds)+' unclaimed' : ''}</span>`).join('')}</div>`}
    <h3>Combined Spiral scaling</h3>
    ${rotating ? `<div class="controls"><label>Individual transmutation<select id="combined-claim-choice">${cadence.curves.map((c,i) =>
      `<option value="${i}">${esc(name(c.ci))}</option>`).join('')}</select></label></div>` : ''}
    <div id="singularity-combined"></div>`;
}

function renderCombined(cadence, index) {
  const curve = cadence.curves[index];
  const best = curve.rows.find(r => r.seconds === curve.bestRateSeconds);
  const largest = curve.rows.find(r => r.seconds === curve.largestClaimSeconds);
  const series = [['base','Base','#bb86fc'],['killMulti','Kill multiplier','#2196f3'],
    ['timeMulti','Hour multiplier','#4caf50'],['spirals','Spirals per claim','#ffd700']].map(([key,name,color]) => ({key,name,color,rows:curve.rows}));
  return `${renderTimingChart(series, [
    {id:'best-rate',name:'Best schedule rate',seconds:best.seconds,color:'#4dd0e1'},
    {id:'largest-claim',name:'Largest individual claim',seconds:largest.seconds,color:'#ffd700'},
  ], 'Full cycle / rotation (hours)', true)}
    <div class="card-grid cols-2">${card('Claim at best schedule rate', best.spirals, duration(best.seconds) + ' full cycle · '+fmt(best.perHour)+' Spirals/hr')}
      ${card('Largest claim within seven days', largest.spirals, duration(largest.seconds)+' full cycle · '+fmt(largest.perHour)+' schedule Spirals/hr')}</div>
    <p class="spend-note">Base × kill multiplier × hour multiplier → floored payout. Curves are independently scaled to their maxima; crossings are not optima. Dots expose exact values. ${cadence.strategy === 'rotating' ? 'Payout is for this character, not the full rotation.' : ''}</p>`;
}

function renderSpend(advisor, cadence) {
  let automatic;
  try {
    automatic = renderAutomaticPurchases(planCoralDivinitySpending(advisor.input, {
      targets: advisor.input.levels.map(level => {
        if (!Number.isInteger(level) || level < 0) throw new Error('Saved Coral levels are unavailable.');
        return level + 1000;
      }),
    }), 'No-loss spending', 'Currently claimed points only');
  } catch (error) { automatic = '<p class="bad" role="alert">' + esc(error.message) + '</p>'; }
  return `<h2>Spend before transmuting</h2><p class="spend-note">Current claimed banks, not pending claims or projected cycle income.</p>
    ${automatic}<h3>Sacrifice now versus future Spirals</h3>
    ${cadence?.purchases ? renderPurchaseComparison(cadence.purchases) : '<p>Run Farm Spirals to compare independent +1 purchases against the measured schedule.</p>'}`;
}

function renderPurchaseComparison(result) {
  const name = row => PURCHASE_NAMES[row.index] + ' +1';
  const rows = result.rows.filter(row => row.unlocked).sort((a, b) =>
    (b.netSpirals ?? -Infinity) - (a.netSpirals ?? -Infinity) || a.index - b.index);
  return `<p><strong>${result.best ? esc(name(result.best)) + ': +' + full(result.best.netSpirals)
      + ' net Spirals over seven days.' : 'No measured affordable +1 purchase beats keeping the payout over seven days.'}</strong></p>
    <p class="spend-note">Independent +1 choices; complete cycles over seven days, fixed combat and account progression.</p>
    <p class="bad">Spiral purchases require this payout collected as one separate stack. Existing Spirals and guaranteed pickup/storage are excluded.</p>
    <table class="data-table spend-pending"><thead><tr><th>Purchase / when</th><th>Cost</th><th>Spirals sacrificed</th><th>Spirals/hr after</th><th>Payback / 7-day net</th></tr></thead><tbody>
      <tr><td data-label="Purchase">No purchase</td><td data-label="Cost">0</td><td data-label="Sacrifice">0</td><td data-label="Spirals/hr" data-value="${result.baselinePerHour}" tabindex="0">${fmt(result.baselinePerHour)}</td><td data-label="Net">0</td></tr>
      ${rows.map(row => `<tr${row.index === result.best?.index ? ' class="spend-best"' : ''}>
        <td data-label="Purchase">${esc(name(row))}<span class="spend-activity">${row.currency === 'points' ? 'Before transmuting' : 'After collecting Spirals'}</span>${row.reason ? '<span class="bad spend-activity">' + esc(row.reason) + '</span>' : ''}</td>
        <td data-label="Cost" data-value="${exact(row.cost)}" tabindex="0">${fmt(row.cost)} ${row.currency === 'points' ? 'points' : 'Spirals'}</td>
        <td data-label="Sacrifice" data-value="${exact(row.immediateLoss)}" tabindex="0">${fmt(row.immediateLoss)}</td>
        <td data-label="Spirals/hr" data-value="${exact(row.perHour)}" tabindex="0">${fmt(row.perHour)}${row.gainPerHour != null ? '<span class="spend-activity">' + (row.gainPerHour >= 0 ? '+' : '') + fmt(row.gainPerHour) + '/hr' + '</span>' : ''}</td>
        <td data-label="Payback / net">${row.paybackHours == null ? 'No measured payback' : row.paybackHours === 0 ? 'No Spiral loss' : time(row.paybackHours * 3600)}<span class="spend-activity" data-value="${exact(row.netSpirals)}" tabindex="0">${row.netSpirals == null ? 'Unavailable' : (row.netSpirals >= 0 ? '+' : '') + full(row.netSpirals) + ' net'}</span></td></tr>`).join('')}
    </tbody></table>
    <p class="spend-note" tabindex="0" data-tip="Seven days begins after today's conversion/purchase. Payback uses complete cycles. Future point rates rebuild, but combat is not remeasured. Spiral value applies only to future claims. EXP, Reef, Lumi and evolving God Rank are not invented Spiral returns. Recalculate after buying.">Conditional fixed-combat comparison; account benefits live in Progress account.</p>`;
}

function renderAutomaticPurchases(plan, heading, note) {
  const grouped = [];
  for (const action of plan.actions) {
    let row = grouped.find(row => row.index === action.index);
    if (!row) { row = { index: action.index, from: action.level - 1, level: action.level, count: 0 }; grouped.push(row); }
    row.level = action.level; row.count++;
  }
  return `<h3>${esc(heading)}: excess-point Coral purchases</h3>
    <div class="card-grid cols-3">${card('Keep for Spirals', plan.reserve.points)}
      ${card('Spend on Coral', plan.spent)}
      ${card('Spirals retained', plan.afterCoral.spirals)}</div>
    ${plan.warnings.map(warning => '<p class="bad">' + esc(warning) + '</p>').join('')}
    <p class="spend-note">${esc(note)}. Cheapest-first ordinary upgrades; no sequential rate rebuilding. Limited to +1,000 levels per upgrade.</p>
    ${grouped.length ? `<div class="spend-purchases">${grouped.map(row => `<div><span>${esc(UPGRADES[row.index])}</span><strong>${row.from} → ${row.level} (+${row.count})</strong></div>`).join('')}</div>
      <details><summary>Exact purchase order (${plan.actions.length}) &amp; reserve</summary>
        <label class="spend-reserve">Exact points to retain<input aria-label="${esc(heading)} exact protected points" readonly value="${exact(plan.reserve.points)}"></label>
        <div class="table-scroll"><table class="data-table"><thead><tr><th>Buy</th><th>New level</th><th>Cost</th><th>Points left</th></tr></thead><tbody>
          ${plan.actions.map(row => `<tr><td>${esc(UPGRADES[row.index])}</td><td>${row.level}</td>${cell(row.cost)}${cell(row.remaining)}</tr>`).join('')}
        </tbody></table></div></details>` : '<p>No affordable Coral levels above this reserve.</p>'}`;
}

function renderAdvisor(result) {
  return `<h2>Pending claims</h2>
    ${result.partial ? '<p class="bad">Partial: companion or current-vote metadata is missing.</p>' : ''}
    ${result.errors.map(error => '<p class="bad" role="alert">' + esc(error) + '</p>').join('')}
    <table class="data-table spend-pending"><thead><tr><th>Character / activity</th><th>Pending</th><th>Points</th><th>Hour credit</th><th>Next claim</th></tr></thead><tbody>
      ${result.characters.map(c => {
        const claim = c.claim;
        const guidance = !claim ? 'Unavailable' : c.pendingSeconds === 0 ? 'No pending claim at this snapshot'
          : c.capped && claim.creditedSeconds >= 36000 ? 'Claim now: cap reached'
          : 'Next whole hour in ' + time(claim.nextWholeHourSeconds);
        return `<tr><td data-label="Character">${esc(c.name)}<span class="spend-activity">${esc(c.activity ?? 'Unavailable')}</span></td>
          <td data-label="Pending">${time(c.pendingSeconds)}</td>
          <td data-label="Points" data-value="${exact(claim?.points)}" tabindex="0">${fmt(claim?.points)}</td>
          <td data-label="Hour credit" data-value="${exact(claim?.hours)}" tabindex="0">${fmt(claim?.hours)}</td>
          <td data-label="Next claim">${esc(guidance)}${c.errors.length ? '<span class="bad spend-activity">' + esc(c.errors.join(' ')) + '</span>' : ''}${claim?.lostSeconds > 0 ? '<span class="bad spend-activity">' + time(claim.lostSeconds) + ' lost to cap</span>' : ''}</td></tr>`;
      }).join('')}</tbody></table>
    <p class="spend-note">Snapshot-relative times. Claim on whole hours; capped characters must not exceed 10h.</p>`;
}

function renderProgress(result, goal) {
  const gain = row => goal === 'class' ? row.classFactorGain
    : result[goal === 'points' ? 'pointRate' : 'expRate'] > 0 && row[goal === 'points' ? 'pointRate' : 'expRate'] != null
      ? row[goal === 'points' ? 'pointRate' : 'expRate'] / result[goal === 'points' ? 'pointRate' : 'expRate'] - 1 : null;
  const rows = result.upgrades.filter(row => row.id === 'rank' || gain(row) == null || gain(row) !== 0)
    .sort((a,b) => (gain(b) ?? -Infinity) - (gain(a) ?? -Infinity));
  const best = rows.filter(row => row.id !== 'rank' && row.safe && row.cost > 0 && gain(row) > 0)
    .sort((a,b) => gain(b)/b.cost - gain(a)/a.cost)[0];
  const name = row => row.id === 'rank' ? 'God Rank +1 (successful outcome)' : UPGRADES[row.index] + ' +1';
  const plan = result.offeringPlan;
  return `${result.partial ? '<p class="bad">Partial: companion or current-vote metadata is missing.</p>' : ''}
    ${result.errors.map(error => '<p class="bad" role="alert">' + esc(error) + '</p>').join('')}
    <p class="spend-note">${goal === 'class' ? 'Coral / God Rank Class EXP factor, not the full combat multiplier.' : 'Saved-activity production; independent +1 changes.'}</p>
    <p><strong>${best ? esc(name(best)) + ' has the best measured gain per point among no-loss choices.' : 'No no-loss purchase improves this measured benefit.'}</strong></p>
    <div class="table-scroll"><table class="data-table"><thead><tr><th>Independent +1</th><th>Point cost</th><th>Benefit gain</th><th>No Spiral loss?</th></tr></thead><tbody>${rows.map(row =>
      `<tr${row === best ? ' class="spend-best"' : ''}><td>${esc(name(row))}${row.errors?.length || row.error ? '<span class="bad spend-activity">'+esc(row.error ?? row.errors.join(' '))+'</span>' : ''}</td>${cell(row.cost)}<td data-value="${exact(gain(row))}" tabindex="0">${pct(gain(row))}</td><td>${!row.unlocked ? 'Locked' : row.safe ? row.id === 'rank' ? 'One saved offer fits' : 'Yes' : 'No'}</td></tr>`).join('')}</tbody></table></div>
    <h3>Saved God Rank offerings</h3>
    ${plan?.offeringError ? '<p class="bad" role="alert">'+esc(plan.offeringError)+'</p>' : ''}
    ${plan?.offers?.length ? `<table class="data-table"><thead><tr><th>Offer</th><th>Point cost</th><th>Success</th><th>No Spiral loss?</th></tr></thead><tbody>${plan.offers.map(o =>
      `<tr><td>${o.slot === 0 ? 'Left' : 'Right'}</td>${cell(o.cost)}<td>${pct(o.chance)}</td><td>${o.affordable ? 'Yes' : 'No'}</td></tr>`).join('')}</tbody></table>` : '<p>Saved offerings unavailable.</p>'}
    <p class="spend-note">God Rank cost above is expected eventual spend, not a guaranteed bill. Both offers reroll after each attempt; full cost is required before any free roll. Reload after purchases or attempts.</p>`;
}

function time(seconds) {
  if (seconds == null) return 'Unavailable';
  const minutes = Math.ceil(seconds / 60);
  return minutes < 60 ? minutes + 'm' : Math.floor(minutes / 60) + 'h ' + (minutes % 60) + 'm';
}
