import { saveData } from '../state.js';
import { initSaveLoader } from './save-loader.js';
import { fmtVal } from '../renderers/format.js';
import { renderBreakdownTree } from './dash-breakdowns.js';
import { toRenderNode } from '../stats/tree-builder.js';
import { buildSpelunkInputs } from '../stats/systems/w7/spelunk-inputs.js';
import { normalizeSpelunkConfig, spelunkActiveBuffs, spelunkRewardImage, SPELUNK_REWARDS } from '../stats/systems/w7/spelunk-expedition.js?v=depth-limits-1';
import { spelunkDepthProfile } from '../stats/systems/w7/spelunk-depth.js?v=depth-limits-1';
import { SPELUNK_SPRITES } from '../stats/data/game/spelunk-sprites.js';
import { spelunkTools } from '../stats/data/w7/spelunking.js';
import { createSpelunkPlayback, spelunkReplaySample, spelunkReplayTile, spelunkReplayDrop, spelunkReplayEvents, spelunkReplayActionTime } from './spelunk-replay.js';
import { startSpelunkWorkers } from '../workers/spelunk-client.js?v=depth-limits-1';
import { spelunkSearchSpace } from '../stats/systems/w7/spelunk-planner.js?v=depth-limits-1';

const $ = id => document.getElementById(id);
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const num = n => fmtVal(Number(n));
const text = s => String(s).replace(/_/g, ' ');
const elixirNames = ['Stamina refund', 'Exit radar', 'Stamina shield', 'Amber boost', 'Power boost',
  'Adjacent breaks', 'Double Amber', 'Shadow strikes', 'Nova', 'Grand Discovery', 'Overdrive', 'Unspecified effect'];
const policyNames = { auto: 'Native Auto', dive: 'Manual depth diving', efficient: 'Stamina efficiency', clear: 'Full clear' };
const goalNames = { depth: 'Depth', amber: 'Amber / expedition', 'amber-per-stamina': 'Amber / stamina',
  'sustainable-amber': 'Amber / run + recovery hour', grand: 'Grand Discoveries / expedition' };
const storageKey = 'spelunk-configurations-v1', controlKey = 'spelunk-controls-v1';
const scopeKey = 'spelunk-search-scope-v1';
const searchSections = { party: 'Party size', modes: 'Play', clears: 'Descend', speeds: 'Auto speeds',
  elixirs: 'Belt pool', memorized: 'Memory pool', tools: 'Manual tools', entry: 'Entry' };
let searchSettings = null;
let raw = null, input = null, worker = null, requestId = 0, activeTab = 'simulate', loaded = false;
let revision = 0, jobRevision = null;
let configurations = [], retained = {}, replay = null, playback = null, animation = 0;
let pickerAnchor = null, pickerSelect = null, pickerEvents = null, tipTarget = null;
let dismissedTip = null;
let tipUpdatePending = false;
let caveVisualInput = null, caveVisualId = null;
const images = new Map(), checked = new Set();
const hudMarkup = new WeakMap();
const replayTools = spelunkTools();
function error(message) { $('error').textContent = message || ''; }
function option(value, label) { return `<option value="${esc(value)}">${esc(text(label))}</option>`; }
function freshSeed() { return crypto.getRandomValues(new Uint32Array(1))[0]; }
function cancel(label = 'Cancelled. No incomplete recommendation was applied.') {
  requestId++;
  if (worker) { worker.terminate(); worker = null; $('status').textContent = label; }
  $('cancel').hidden = true; $('progress').hidden = true;
  document.querySelectorAll('#run,#compare,#optimize').forEach(b => b.disabled = !input);
  $('reset-elixirs').disabled = !input;
}
function pause() {
  playback?.pause(); cancelAnimationFrame(animation); animation = 0;
  if ($('play')) $('play').textContent = 'Play';
}
function invalidate() {
  cancel('Settings changed; prior work cancelled.');
  revision++;
  Object.values(retained).forEach(bundle => { bundle.stale = true; });
  try { localStorage.setItem(controlKey, JSON.stringify({ charIdx: Number($('character').value), config: readConfig() })); }
  catch (e) { error(`Cannot persist settings: ${e.message}`); }
  updateSearchWorkload();
  if (activeTab === 'depth') renderDepthLimits();
}
function readConfig() {
  if (!input) throw new Error('Load a save first.');
  return normalizeSpelunkConfig(input, {
    cave: Number($('cave').value), manic: $('mode').value === 'true', policy: $('policy').value,
    party: [...document.querySelectorAll('[data-party]')].map(e => Number(e.value)).filter(id => id >= 0),
    elixirs: [...document.querySelectorAll('[data-elixir]')].map(e => Number(e.value)),
    memorized: [...document.querySelectorAll('[data-memory]')].map(e => Number(e.value)).filter(id => id >= 0),
    fullClear: $('full-clear').checked, speed: Number($('speed').value), stamina: $('stamina').value,
    entry: $('entry').value, tool: $('tool').value === 'adaptive' ? 'adaptive' : Number($('tool').value),
    reactionMs: Number($('reaction').value),
  });
}
function readSearchScope() {
  const selected = (key, convert = Number) => [...document.querySelectorAll(`[data-scope="${key}"]:checked`)]
    .map(e => convert(e.value));
  return { partyMin: Number($('search-party-min').value), partyMax: Number($('search-party-max').value),
    characters: selected('characters'), ignoreOrder: $('search-ignore-order').checked,
    modes: selected('modes', String), clears: selected('clears', v => v === 'true'),
    speeds: selected('speeds'), elixirs: selected('elixirs'), memorized: selected('memorized'),
    enabled: Object.fromEntries([...document.querySelectorAll('[data-scope-section]')].map(e => [e.dataset.scopeSection, e.checked])) };
}
function syncSearchSections() {
  for (const toggle of document.querySelectorAll('[data-scope-section]')) {
    const row = toggle.closest('.scope-row');
    row.querySelector('fieldset').disabled = !toggle.checked;
    row.dataset.fixed = String(!toggle.checked);
  }
}
function renderSearchScope() {
  if (!input) return;
  const settings = searchSettings || {}, capacity = input.caves[Number($('cave').value)].capacity;
  const heading = key => `<label class="scope-switch" data-stip="Include ${esc(searchSections[key])} in the search. Uncheck to keep the current expedition setting.">
    <input type="checkbox" data-scope-section="${key}" aria-label="Search ${esc(searchSections[key])}"
    ${settings.enabled?.[key] !== false ? 'checked' : ''}>${esc(searchSections[key])}</label>`;
  const chip = (key, value, label, tip = '', disabled = false, icon = false) => {
    const checked = settings[key] == null || settings[key].includes(value);
    return `<label class="scope-chip${icon ? ' scope-icon' : ''}"${tip ? ` data-stip="${esc(tip)}"` : ''}>
      ${icon ? label : ''}<input type="checkbox" data-scope="${key}" value="${esc(value)}"
      aria-label="${esc(icon ? tip : label)}" ${checked && !disabled ? 'checked' : ''} ${disabled ? 'disabled' : ''}>${icon ? '' : esc(label)}</label>`;
  };
  $('search-scope').innerHTML = `<p class="muted">Search checked sections; unchecked sections keep your current configuration. Party size uses only checked characters.</p>
    <div class="scope-row">${heading('party')}<fieldset class="scope-choices scope-party-choices" aria-label="Party size search choices">
    <label>From <input id="search-party-min" type="number" min="1" max="${capacity}" value="${esc(settings.partyMin ?? 1)}"></label>
    <label>to <input id="search-party-max" type="number" min="1" max="${capacity}" value="${esc(settings.partyMax ?? capacity)}"></label>
    <small>members</small>
    <label class="scope-chip" data-stip="Test each group once, in character-slot order. Expedition outcomes can still depend on that order.">
    <input id="search-ignore-order" type="checkbox" ${settings.ignoreOrder === true ? 'checked' : ''}>Order doesn't matter</label>
    <div class="scope-roster" role="group" aria-label="Characters to test">${input.characters.map(c =>
      chip('characters', c.id, c.name, `${c.name}: ${c.stamina} / ${c.max} stamina. Requires at least half stamina unless Full stamina is selected.`)).join('')}</div>
    </fieldset></div>
    <div class="scope-row">${heading('modes')}<fieldset class="scope-choices" aria-label="Play search choices">
    ${chip('modes', 'auto', 'Auto', 'Search native Auto strategies.', !input.auto)}
    ${chip('modes', 'manual', 'Manual', 'Search simulated manual targeting strategies.')}</fieldset></div>
    <div class="scope-row">${heading('clears')}<fieldset class="scope-choices" aria-label="Descent search choices">
    ${chip('clears', false, 'First exit', 'Descend when an exit is revealed. Manual searches include depth-diving and damage-per-stamina targeting.')}
    ${chip('clears', true, 'Full clear', 'Clear every remaining rock before descending, for both Auto and manual strategies.')}</fieldset></div>
    <div class="scope-row">${heading('speeds')}<fieldset class="scope-choices" aria-label="Auto speed search choices">
    ${Array.from({ length: input.speedMax + 1 }, (_, speed) => chip('speeds', speed, speed ? String(speed) : 'Base',
      'Only checked speeds may be recommended; these choices do not affect manual strategies.', !input.auto)).join('')}</fieldset></div>
    ${['elixirs', 'memorized'].map(key => `<div class="scope-row">${heading(key)}
      <fieldset class="scope-choices" aria-label="${esc(searchSections[key])} search choices">${input.elixirs.slice(0, input.elixirOwned).map(e => chip(key, e.id,
        art(`CaveElix${e.id}`), `${key === 'elixirs' ? 'Allow equipped' : 'Allow memorized'}: ${elixirNames[e.id]}\n${e.description}`,
        key === 'memorized' && !input.memorySlots || key === 'elixirs' && !input.slots, true)).join('')}</fieldset></div>`).join('')}
    <div class="scope-row">${heading('tools')}<fieldset class="scope-choices"><small>Adaptive and every unlocked tool (manual play only)</small></fieldset></div>
    <div class="scope-row">${heading('entry')}<fieldset class="scope-choices"><small>Surface and saved shortcut</small></fieldset></div>`;
  syncSearchSections();
  updateSearchWorkload();
}
function updateSearchWorkload() {
  if (!input) return;
  const host = $('search-workload');
  try {
    const { configurations } = spelunkSearchSpace(input, readConfig(), readSearchScope());
    const screening = Number($('screen-trials').value);
    if (!Number.isInteger(screening) || screening < 1 || screening > 8) throw new Error('Invalid screening trials.');
    const count = BigInt(configurations), trials = BigInt(screening);
    host.textContent = `${count.toLocaleString()} configurations / ${(count * trials).toLocaleString()} screening runs, plus reference and fresh finalist trials. Every combination will be tested; broad selections can take a very long time.`;
    host.dataset.configurations = String(count);
  } catch (e) {
    host.textContent = e.message;
    delete host.dataset.configurations;
  }
}
function renderParty(party) {
  closePicker(false);
  const capacity = input.caves[Number($('cave').value)].capacity;
  $('party').innerHTML = Array.from({ length: capacity }, (_, slot) => `<div class="party-member">
    <select hidden data-party="${slot}">${option(-1, 'Empty')}${input.characters.map(c => option(c.id, c.name)).join('')}</select>
    <button class="game-slot party-slot" data-slot-kind="party" data-slot="${slot}" aria-haspopup="dialog"></button>
    <span data-party-name="${slot}"></span></div>`).join('');
  document.querySelectorAll('[data-party]').forEach((e, i) => { e.value = party[i] ?? -1; });
  syncVisuals();
}
function renderElixirs(ids, memorized = input.memorized) {
  closePicker(false);
  for (const [kind, host, count, values] of [
    ['elixir', 'elixirs', input.slots, ids], ['memory', 'memorized', input.memorySlots, memorized],
  ]) {
    $(host).innerHTML = count ? Array.from({ length: count }, (_, slot) => `<div class="elixir-choice">
      <select hidden data-${kind}="${slot}" aria-label="${kind === 'memory' ? 'Memorized' : 'Equipped'} elixir ${slot + 1}">${option(-1, 'Empty')}
      ${input.elixirs.slice(0, input.elixirOwned).map(e => option(e.id, elixirNames[e.id])).join('')}</select>
      <button class="game-slot ${kind === 'memory' ? 'memory-slot' : 'belt-slot'}" data-slot-kind="${kind}" data-slot="${slot}" aria-haspopup="dialog">
      <span class="slot-number">${slot + 1}</span><img data-${kind}-art="${slot}" alt="" hidden><span class="slot-empty">+</span></button></div>`).join('')
      : '<span class="muted">Locked</span>';
    document.querySelectorAll(`[data-${kind}]`).forEach((e, i) => { e.value = values[i] ?? -1; elixirArt(e); });
  }
  syncElixirOptions();
  renderElixirHelp();
}
function syncElixirOptions() {
  const memories = [...document.querySelectorAll('[data-memory]')];
  const chosen = memories.map(e => Number(e.value)).filter(id => id >= 0);
  for (const select of memories) for (const opt of select.options)
    opt.disabled = Number(opt.value) >= 0 && opt.value !== select.value && chosen.includes(Number(opt.value));
  $('memory-count').textContent = `${chosen.length}/${input.memorySlots}`;
}
function renderElixirHelp() {
  const ids = [...new Set([...document.querySelectorAll('[data-elixir],[data-memory]')].map(e => Number(e.value)).filter(id => id >= 0))];
  $('elixir-help').hidden = !ids.length;
  $('elixir-effects').innerHTML = `<p class="muted">Memorized effects apply at entry with your saved Doublethink Memory bonus, independently of belt charges. Exit radar, Nova and the final elixir have no starting effect in the game.</p>`
    + ids.map(id => `<p><strong>${esc(elixirNames[id])}</strong> (${input.elixirs[id].charges} belt charges): ${esc(input.elixirs[id].description)}</p>`).join('');
}
function elixirArt(select) {
  const kind = select.dataset.memory != null ? 'memory' : 'elixir';
  const image = document.querySelector(`[data-${kind}-art="${select.dataset[kind]}"]`);
  image.hidden = Number(select.value) < 0;
  if (!image.hidden) image.src = `./assets/spelunking/CaveElix${select.value}.png`;
  const button = image.closest('button'), id = Number(select.value);
  button.querySelector('.slot-empty').hidden = id >= 0;
  const name = `${kind === 'memory' ? 'Memorized' : 'Equipped'} slot ${Number(select.dataset[kind]) + 1}`;
  button.setAttribute('aria-label', `${name}: ${id < 0 ? 'Empty' : elixirNames[id]}. Choose elixir.`);
  button.dataset.stip = `${name}\n${id < 0 ? 'Empty. Choose an elixir.' : elixirTip(id, kind)}`;
}
function art(name, className = '') {
  return SPELUNK_SPRITES[name] ? `<img class="${className}" src="./assets/spelunking/${name}.png" alt="">` : '';
}
function portrait(c) { return art(`ClassIcons${c.classId}`, 'portrait'); }
function characterTip(c) {
  return `${c.name}${c.level != null ? ` - Level ${c.level}` : ''}\nStamina ${num(c.stamina)} / ${num(c.max)}`;
}
function elixirTip(id, kind) {
  const elixir = input.elixirs[id];
  return `${elixirNames[id]}\n${elixir.description}\n${kind === 'memory'
    ? [1, 8, 11].includes(id) ? 'No starting effect when memorized.' : `Applied at entry ${Math.floor(1 + input.shop[58] / 100)} time(s), without using belt charges.`
    : `${elixir.charges} belt charges.`}`;
}
function syncVisuals() {
  if (!input) return;
  let total = 0;
  for (const select of document.querySelectorAll('[data-party]')) {
    const slot = select.dataset.party, c = input.characters[Number(select.value)];
    const button = document.querySelector(`[data-slot-kind="party"][data-slot="${slot}"]`);
    button.innerHTML = `<span class="slot-number">${Number(slot) + 1}</span>${c ? portrait(c) : '<span class="slot-empty">+</span>'}`;
    button.dataset.stip = c ? characterTip(c) : `Party slot ${Number(slot) + 1}\nChoose a character.`;
    button.setAttribute('aria-label', `Party slot ${Number(slot) + 1}: ${c ? c.name : 'Empty'}. Choose character.`);
    document.querySelector(`[data-party-name="${slot}"]`).textContent = c ? c.name : '';
    total += c ? ($('stamina').value === 'full' ? c.max : c.stamina) : 0;
  }
  $('party-stamina').textContent = num(total);
  if (caveVisualInput === input && caveVisualId === $('cave').value) return;
  caveVisualInput = input; caveVisualId = $('cave').value;
  $('cave-choices').innerHTML = input.caves.map(c => `<button class="cave-choice" data-cave="${c.id}"
    aria-label="${esc(c.name)}" aria-pressed="${String(c.id) === $('cave').value}"
    data-stip="${esc(`${c.name}\nNormal record: ${input.depths[c.id] ?? 'Unavailable'}\nManic record: ${input.manicDepths[c.id] ?? 'Unavailable'}\nParty capacity: ${c.capacity}`)}">
    ${art(`CaveDoor${c.id}`)}<span>${esc(c.name)}</span><small>${input.depths[c.id] ?? '-'} / ${input.manicDepths[c.id] ?? '-'}</small></button>`).join('');
}
function hideTip() {
  if (tipTarget) tipTarget.removeAttribute('aria-describedby');
  tipTarget = null;
  updateTip();
}
function showTip(target) {
  if (target === tipTarget || target === dismissedTip) return;
  if (tipTarget) tipTarget.removeAttribute('aria-describedby');
  tipTarget = target;
  target.setAttribute('aria-describedby', 'spelunk-tip');
  updateTip();
}
function updateTip() {
  if (tipUpdatePending) return;
  tipUpdatePending = true;
  // Popover focus restoration may dispatch focus events inside a show/hide operation.
  queueMicrotask(() => {
    tipUpdatePending = false;
    const tip = $('spelunk-tip');
    if (!tipTarget?.isConnected) {
      if (tip.matches(':popover-open')) tip.hidePopover();
      tip.hidden = true;
      return;
    }
    tip.textContent = tipTarget.dataset.stip; tip.hidden = false;
    if (!tip.matches(':popover-open')) tip.showPopover();
    positionTip();
  });
}
function positionTip() {
  if (!tipTarget) return;
  const tip = $('spelunk-tip'), rect = tipTarget.getBoundingClientRect();
  tip.style.left = `${Math.max(8, Math.min(innerWidth - tip.offsetWidth - 8, rect.left))}px`;
  tip.style.top = `${Math.max(8, rect.bottom + tip.offsetHeight + 12 > innerHeight ? rect.top - tip.offsetHeight - 8 : rect.bottom + 8)}px`;
}
function closePicker(restoreFocus = true) {
  const anchor = pickerAnchor;
  pickerEvents?.abort(); pickerEvents = null;
  if ($('spelunk-picker').matches(':popover-open')) $('spelunk-picker').hidePopover();
  pickerAnchor = pickerSelect = null; hideTip();
  anchor?.setAttribute('aria-expanded', 'false');
  if (restoreFocus && anchor?.isConnected) anchor.focus({ preventScroll: true });
}
function openSlot(button) {
  closePicker(false);
  const kind = button.dataset.slotKind, slot = button.dataset.slot;
  const select = document.querySelector(`[data-${kind}="${slot}"]`);
  const chosen = [...document.querySelectorAll(`[data-${kind}]`)].filter(e => e !== select).map(e => Number(e.value));
  const values = kind === 'party' ? input.characters.map(c => c.id) : input.elixirs.map(e => e.id);
  const popup = $('spelunk-picker');
  $('picker-label').textContent = kind === 'party' ? 'Party member' : kind === 'memory' ? 'Memorized elixir' : 'Elixir belt';
  $('picker-options').className = kind === 'party' ? 'roster-options' : 'palette-options';
  $('picker-options').innerHTML = [-1, ...values].map(id => {
    const c = input.characters[id], current = Number(select.value) === id;
    const blocked = id >= 0 && (kind === 'party'
      ? chosen.includes(id) || ($('stamina').value !== 'full' && c.stamina < c.max / 2)
      : id >= input.elixirOwned || (kind === 'memory' ? chosen.includes(id) : chosen.filter(v => v === id).length >= input.dupes));
    const name = id < 0 ? 'Empty' : kind === 'party' ? c.name : elixirNames[id];
    const tip = id < 0 ? 'Clear this slot.' : kind === 'party' ? characterTip(c) : elixirTip(id, kind);
    return `<button data-pick-value="${id}" aria-label="${esc(name)}" aria-pressed="${current}" aria-disabled="${blocked}"
      data-stip="${esc(tip + (blocked ? '\nUnavailable: locked, already selected, duplicate limit or insufficient saved stamina.' : ''))}">
      ${id < 0 ? '<span class="slot-empty">&times;</span>' : kind === 'party'
        ? `${portrait(c)}<span class="picker-stamina" aria-hidden="true"><i style="width:${Math.max(0, Math.min(100, c.stamina / Math.max(1, c.max) * 100))}%;background:${c.stamina < c.max / 2 ? '#e27070' : '#83c66d'}"></i></span>`
        : art(`CaveElix${id}`)}</button>`;
  }).join('');
  pickerAnchor = button; pickerSelect = select;
  button.setAttribute('aria-expanded', 'true');
  popup.showPopover();
  function position() {
    const rect = button.getBoundingClientRect();
    popup.style.left = `${Math.max(8, Math.min(innerWidth - popup.offsetWidth - 8, rect.left))}px`;
    popup.style.top = `${Math.max(8, Math.min(innerHeight - popup.offsetHeight - 8, rect.bottom + 6))}px`;
    positionTip();
  }
  position();
  pickerEvents = new AbortController();
  for (const event of ['resize', 'scroll']) window.addEventListener(event, position, { capture: true, signal: pickerEvents.signal });
  popup.querySelector('[aria-pressed="true"]')?.focus({ preventScroll: true });
}
function syncPolicy() {
  const auto = $('policy').value === 'auto';
  $('speed').disabled = $('full-clear').disabled = !auto;
  $('tool').disabled = $('reaction').disabled = auto;
}
function populate(config = null) {
  $('cave').innerHTML = input.caves.map(c => option(c.id, c.name)).join('');
  $('speed').innerHTML = Array.from({ length: input.speedMax + 1 }, (_, n) => option(n, n === 0 ? 'Base' : `Speed ${n}`)).join('');
  $('tool').innerHTML = option('adaptive', 'Adaptive') + input.tools.map(t => option(t.id, t.name)).join('');
  $('mode').querySelector('[value=true]').disabled = !input.manic;
  $('policy').querySelector('[value=auto]').disabled = !input.auto;
  const base = config || {
    cave: 0, manic: input.savedManic, policy: input.auto ? 'auto' : 'dive', speed: input.speedMax,
    fullClear: input.fullClear, party: input.characters.filter(c => c.stamina >= c.max / 2)
      .slice(0, input.caves[0].capacity).map(c => c.id), elixirs: input.savedElixirs,
  };
  $('cave').value = Math.min(input.caves.length - 1, base.cave);
  $('mode').value = String(base.manic); $('policy').value = base.policy;
  $('speed').value = Math.min(input.speedMax, base.speed); $('full-clear').checked = base.fullClear;
  for (const [id, key] of Object.entries({ stamina: 'stamina', entry: 'entry', tool: 'tool', reaction: 'reactionMs' }))
    if (base[key] != null) $(id).value = base[key];
  renderParty(base.party); renderElixirs(base.elixirs, base.memorized ?? input.memorized);
  syncPolicy(); renderInputs(); renderSearchScope();
}
function renderInputs() {
  $('partial').hidden = !input.partial;
  $('input-summary').innerHTML = `<div class="cards"><div class="card"><span>Starting Power</span><strong>${num(input.pow)}</strong></div>
    <div class="card"><span>Base Amber multiplier</span><strong>${num(input.amber)}x</strong></div>
    <div class="card"><span>Stamina regeneration</span><strong>${num(input.regen)}/hour</strong></div></div>
    <details><summary>Model scope &amp; limitations</summary>${input.notes.map(n => `<p class="muted">${esc(n)}</p>`).join('')}</details>`;
  $('trees').innerHTML = `<div class="breakdown"><h3>Spelunking Power</h3><div id="power-tree"></div></div>`
    + input.characters.map(c => `<div class="breakdown"><h3>${esc(c.name)} maximum stamina</h3><div id="stamina-tree-${c.id}"></div></div>`).join('');
  renderBreakdownTree(toRenderNode(input.powTree), $('power-tree'), { tooltipId: 'spelunk-power-tip' });
  for (const c of input.characters) renderBreakdownTree(toRenderNode(c.breakdown), $(`stamina-tree-${c.id}`), { tooltipId: `spelunk-stamina-tip-${c.id}` });
}
function configurationText(config, captured) {
  return `${captured.caves[config.cave].name} / ${config.manic ? 'Manic' : 'Normal'} / ${policyNames[config.policy]}`
    + (config.policy === 'auto' ? ` / speed ${config.speed} / ${config.fullClear ? 'full clear' : 'first exit'}` : ` / ${config.reactionMs} ms`)
    + ` / ${config.stamina === 'full' ? 'fully recovered stamina' : 'saved stamina'}`;
}
function layout(config, captured) {
  const mini = (id, slot, kind) => `<span class="mini-slot" tabindex="0"
    data-stip="${esc(`${kind} ${slot + 1}: ${id < 0 ? 'Empty' : elixirNames[id]}\n${id < 0 ? '' : captured.elixirs[id].description}`)}"
    aria-label="${esc(`${kind} ${slot + 1}: ${id < 0 ? 'Empty' : elixirNames[id]}`)}">${id < 0 ? '&middot;' : art(`CaveElix${id}`)}</span>`;
  return `<div class="strip captured"><strong>${esc(configurationText(config, captured))}</strong>
    <div class="captured-party">${config.party.map(id => `<span>${portrait(captured.characters[id])}${esc(captured.characters[id].name)}</span>`).join('<span aria-hidden="true">&rarr;</span>')}</div>
    <div class="captured-belt"><span>Belt</span>${config.elixirs.map((id, slot) => mini(id, slot, 'Equipped')).join('')}
    <span>Memory</span>${(config.memorized ?? captured.memorized).map((id, slot) => mini(id, slot, 'Memorized')).join('') || '&mdash;'}</div>
    <small>${config.policy === 'auto' ? 'Auto tools' : config.tool === 'adaptive' ? 'Adaptive tools' : esc(text(captured.tools.find(t => t.id === config.tool).name))}
    &middot; ${config.entry === 'surface' ? 'Surface' : 'Saved shortcut if unlocked'}</small></div>`;
}
function renderConfigurations() {
  $('configurations').innerHTML = configurations.length ? configurations.map((c, i) => `<div class="toolbar">
    <label class="check"><input type="checkbox" data-checked="${i}" ${checked.has(i) ? 'checked' : ''}>${esc(c.label)}</label>
    <button data-load="${i}">Load into controls</button><button data-delete="${i}">Delete</button></div>`).join('')
    : '<p class="muted">Save a configuration to compare party, tools and elixirs. Saving never changes your game save.</p>';
}
function persistConfigurations() {
  localStorage.setItem(storageKey, JSON.stringify(configurations));
  renderConfigurations();
}
let depthProfile = null, depthCave = null, depthInput = null;
const depthColors = ['#4dd0e1', '#ffb74d', '#a5d66f', '#df91f0', '#fb8299', '#82aaff', '#ffe082',
  '#80cbc4', '#dca978', '#adadff', '#e4ceff', '#91c4a0', '#f6956a', '#b6d6ee', '#ed95bb', '#fff'];
function depthCost(value) { return Number.isFinite(value) ? num(value) : 'Beyond numeric range'; }
function depthPercent(value) {
  const percent = 100 * value;
  return `${percent > 0 && percent < .1 ? percent.toExponential(2) : num(percent)}%`;
}
function depthChart(profile, stamina) {
  const left = 72, right = 744, top = 18, bottom = 236;
  const first = profile.rows[0].depth, last = profile.rows.at(-1).depth;
  const x = depth => first === last ? (left + right) / 2 : left + (depth - first) / (last - first) * (right - left);
  const maximum = Math.max(1, Math.log10(1 + profile.budget),
    ...profile.rows.flatMap(row => row.objects.filter(r => Number.isFinite(r.expected)).map(r => Math.log10(1 + r.expected))));
  const y = value => bottom - (stamina ? Number.isFinite(value) ? Math.log10(1 + value) / maximum : 1 : value) * (bottom - top);
  const line = (points, color, dashed = false) => `<polyline points="${points.map(([a, b]) => `${a.toFixed(2)},${b.toFixed(2)}`).join(' ')}"
    fill="none" stroke="${color}" stroke-width="2"${dashed ? ' stroke-dasharray="6 4"' : ''}/>`
    + (points.length === 1 ? `<circle cx="${points[0][0]}" cy="${points[0][1]}" r="3" fill="${color}"/>` : '');
  const title = stamina ? 'Expected stamina per object by depth' : 'Over-budget exit risk by depth';
  let out = `<svg class="depth-chart" viewBox="0 0 760 280" role="img" aria-label="${title}">
    <title>${title}. ${stamina ? 'Logarithmic stamina scale.' : 'Per-floor probability, not cumulative run failure.'} Exact values are in the depth inspector below.</title>`;
  for (let i = 0; i <= 4; i++) {
    const fraction = i / 4, py = bottom - fraction * (bottom - top);
    out += `<path d="M${left},${py}H${right}" stroke="#ffffff25"/>
      <text x="${left - 8}" y="${py + 4}" text-anchor="end">${stamina ? num(10 ** (maximum * fraction) - 1) : `${i * 25}%`}</text>`;
    const depth = Math.round(first + (last - first) * fraction);
    if (i === 0 || depth !== Math.round(first + (last - first) * (i - 1) / 4))
      out += `<text x="${x(depth)}" y="${bottom + 20}" text-anchor="middle">${depth}</text>`;
  }
  out += `<text x="${(left + right) / 2}" y="276" text-anchor="middle">Depth (in-game)</text>`;
  if (stamina) {
    const types = [...new Set(profile.rows.flatMap(row => row.objects.map(r => r.type)))];
    for (const type of types) out += line(profile.rows.flatMap(row => {
      const object = row.objects.find(r => r.type === type);
      return object ? [[x(row.depth), y(object.expected)]] : [];
    }), depthColors[type % depthColors.length]);
    out += line([[left, y(profile.budget)], [right, y(profile.budget)]], '#fff', true);
  } else {
    out += line(profile.rows.map(row => [x(row.depth), y(row.hard)]), '#fb8299', true);
    out += line(profile.rows.map(row => [x(row.depth), y(row.blockedExits)]), '#ffb74d');
  }
  for (const row of profile.rows) {
    const tip = `Depth ${row.depth}\nAll descent holes over budget: ${depthPercent(row.blockedExits)}\nNormal rocks over budget: ${depthPercent(row.hard)}`
      + (stamina ? '\n' + row.objects.map(r => `${r.name}${r.boss ? ' (boss)' : ''}: ${depthCost(r.expected)} stamina${r.overBudget ? ' (over budget)' : ''}`).join('\n') : '');
    const a = first === last ? left : Math.max(left, x(row.depth - .5));
    const b = first === last ? right : Math.min(right, x(row.depth + .5));
    out += `<rect x="${a}" y="${top}" width="${b - a}" height="${bottom - top}" fill="transparent" data-stip="${esc(tip)}"/>`;
  }
  return out + '</svg>';
}
function renderDepthInspector() {
  if (!depthProfile) return;
  const row = depthProfile.rows.find(r => r.depth === Number($('depth-inspect').value));
  if (!row) return;
  $('depth-selected').textContent = row.depth;
  $('depth-values').innerHTML = `<p>Depth ${row.depth}: all descent holes over budget <strong>${depthPercent(row.blockedExits)}</strong>;
    normal rocks over budget ${depthPercent(row.hard)}.</p><div class="scroll"><table>
    <thead><tr><th>Object</th><th>Normal-rock share</th><th>Power requirement</th><th>Hit chance</th><th>Hits needed</th><th>Reference tool</th><th>Expected stamina</th></tr></thead>
    <tbody>${row.objects.map(r => `<tr><td>${esc(r.name)}${r.boss ? ' (boss)' : ''}</td>
      <td>${r.boss ? 'Boss floor only' : depthPercent(r.probability)}</td><td>${num(r.requirement)}</td>
      <td>${depthPercent(r.hitChance)}</td><td>${num(r.hits)}</td><td>${esc(text(input.tools.find(t => t.id === r.tool).name))}</td>
      <td class="${r.overBudget ? 'warning' : ''}">${depthCost(r.expected)}${r.overBudget ? ' (over budget)' : ''}</td></tr>`).join('')}</tbody></table></div>`;
}
function renderDepthLimits() {
  hideTip(); depthProfile = null;
  if (!input) { $('depth-graphs').textContent = 'Load a valid save to estimate depth limits.'; $('depth-values').replaceChildren(); return; }
  try {
    const config = readConfig();
    if (depthCave !== config.cave) {
      const record = (config.manic ? input.manicDepths : input.depths)[config.cave] || 0;
      $('depth-from').value = Math.max(1, record - 100);
      $('depth-to').value = Math.min(10000, Math.max(150, record + 100));
      depthCave = config.cave;
    }
    if (depthInput !== input) {
      const selected = $('depth-tool').value;
      $('depth-tool').innerHTML = option('best', 'Lowest isolated cost (optimistic)')
        + input.tools.map(t => option(t.id, text(t.name))).join('');
      $('depth-tool').value = selected === 'best' || input.tools.some(t => String(t.id) === selected) ? selected : 'best';
      depthInput = input;
    }
    depthProfile = spelunkDepthProfile(input, config, { from: Number($('depth-from').value), to: Number($('depth-to').value),
      tool: $('depth-tool').value === 'best' ? 'best' : Number($('depth-tool').value) });
    const p = depthProfile, objects = [...new Map(p.rows.flatMap(row => row.objects.map(r => [r.type, r]))).values()];
    $('depth-graphs').innerHTML = `<p><strong>${esc(p.cave)} / ${config.manic ? 'Manic' : 'Normal'}</strong>
      &middot; entry Power ${num(p.power)} &middot; ${config.stamina === 'full' ? 'Full' : 'Saved'} party stamina <strong>${num(p.budget)}</strong>
      ${p.partial ? '<span class="warning"> &middot; Partial account inputs</span>' : ''}</p>
      <h3>1. Effectively unbreakable exits</h3>${depthChart(p, false)}
      <p class="depth-legend"><span style="--series:#ffb74d">All descent holes over budget</span>
      <span style="--series:#fb8299">Normal rocks over budget (dashed)</span></p>
      <p class="muted">An object is over budget only when its expected stamina cost exceeds the entire selected party's starting stamina.
      Extra holes are included: one bad hole does not trap you if another is reachable. These are per-floor placement odds,
      not actual failure odds or cumulative risk. Bosses, full-clear requirements and Grand Discovery's descent restriction are excluded from this exit-placement probability.</p>
      <h3>2. Stamina to break each object</h3>${depthChart(p, true)}
      <p class="depth-legend">${objects.map(r => `<span style="--series:${depthColors[r.type % depthColors.length]}">${esc(r.name)}${r.boss ? ' (boss)' : ''}</span>`).join('')}
      <span style="--series:#fff">Party starting stamina (dashed)</span></p>
      <p class="muted">Logarithmic scale: log10(1 + stamina). Costs include resists, rounded successful-hit counts, damage upgrades,
      Manic's 30x cost and fixed memorized entry effects${p.refund ? `, including ${num(p.refund * 100)}% stamina refund` : ''}.
      Each object is targeted alone with the reference tool repeated throughout; this is not Native Auto's tool selection.
      No area-damage savings, Shadow/adjacent strikes, Nova, later belt drinks, Power decay or stamina-restoration procs are included.
      Tool affordability, member switches and partial final digs are not modeled. Earlier floors already spend stamina:
      the full starting budget is an optimistic reference, not remaining stamina at that depth.
      Values beyond numeric range are flagged in the inspector and capped at the chart's top.
      Expected cost is not a guarantee of success or an exact stopping depth.</p>`;
    $('depth-inspect').min = p.rows[0].depth; $('depth-inspect').max = p.rows.at(-1).depth;
    $('depth-inspect').value = Math.max(p.rows[0].depth, Math.min(p.rows.at(-1).depth, Number($('depth-inspect').value)));
    renderDepthInspector();
  } catch (e) {
    depthProfile = null;
    $('depth-graphs').innerHTML = `<p class="error" role="alert">Cannot estimate depth limits: ${esc(e.message)}</p>`;
    $('depth-values').replaceChildren();
  }
}
function selectTab(name) {
  activeTab = name;
  pause(); closePicker(false); hideTip();
  $(`${name}-status-host`).append($('job-status'));
  if (name === 'depth') renderDepthLimits();
  document.querySelectorAll('[data-tab]').forEach(b => {
    const active = b.dataset.tab === name;
    b.setAttribute('aria-selected', String(active)); b.tabIndex = active ? 0 : -1;
    $(`panel-${b.dataset.tab}`).hidden = !active;
  });
}
function renderRun(bundle) {
  pause();
  const { result: r, input: captured } = bundle;
  const recovery = Math.max(0, ...r.stamina.map(c => (c.start - c.end) / captured.regen));
  $('simulate-result').innerHTML = `<h2>${r.exit?.type === 'toll' ? 'Delve exit' : esc(r.status.replace(/-/g, ' '))} &middot; ${r.settled ? 'Collected' : 'Uncollected loot'}</h2>
    ${layout(r.config, captured)}<div class="cards" style="margin-top:12px">
    <div class="card"><span>Reached depth</span><strong>${r.depth}</strong></div>
    <div class="card"><span>${r.settled ? 'Collected' : 'Uncollected'} Amber</span><strong>${num(r.rewards[0])}</strong></div>
    <div class="card"><span>Expedition time</span><strong>${num(r.seconds)}s</strong></div>
    <div class="card"><span>Recovery to starting stamina</span><strong>${num(recovery)}h</strong></div></div>
    <p class="muted">Recovery holds current regeneration fixed and restores this party's starting stamina; it is not guaranteed daily income.</p>
    ${renderContributions(r.diagnostics, captured)}
    ${renderPartyAnalysis(r.partyAnalysis, captured)}
    ${r.exit ? `<p class="muted" tabindex="0" data-stip="${esc('Automatically takes the Delve exit once the whole party is exhausted and the floor transition ends.\nAmber keeps its exact fraction. Each other found reward keeps the whole part, then rolls its fractional remainder for one extra item.')}">Toll paid &middot; ${num(100 * r.exit.retained)}% loot retained before item rolls</p>` : ''}
    <details><summary>Rewards &amp; stamina</summary><table><thead><tr><th>Reward</th><th class="num">Gross</th><th class="num">${r.settled ? 'Collected' : 'Uncollected'}</th></tr></thead><tbody>
      ${r.rewards.map((v, i) => {
        const payout = r.exit?.items.find(item => item.reward === i);
        const tip = payout ? `${SPELUNK_REWARDS[i]}\n${r.grossRewards[i]} found\n${payout.expected} after toll\n${v} collected${payout.chance == null ? '\nAmber is not rounded.' : `\n${num(payout.chance * 100)}% chance of one extra item${payout.chance > 0 ? `: ${payout.roundedUp ? 'won' : 'missed'}` : '.'}`}` : SPELUNK_REWARDS[i];
        return v || r.grossRewards[i] ? `<tr><td><span class="reward-name" tabindex="0" data-stip="${esc(tip)}">${art(spelunkRewardImage(captured, i))}${esc(SPELUNK_REWARDS[i])}</span></td><td class="num">${num(r.grossRewards[i])}</td><td class="num">${num(v)}</td></tr>` : '';
      }).join('')}</tbody></table>
      ${r.stamina.map(c => `<p>${esc(captured.characters[c.id].name)}: ${num(c.start)} &rarr; ${num(c.end)} stamina</p>`).join('')}
      <p>${r.broken} rocks &middot; ${r.actions} actions &middot; ${r.hits} hits / ${r.misses} misses &middot; ${r.grands} Grand Discoveries</p></details>
    <details open id="replay-panel"><summary>Replay</summary>
      <div class="replay-stage"><div class="replay-hud"><div class="replay-heading"><strong id="replay-depth"></strong><span id="replay-time"></span><div id="replay-loot" class="replay-loot" aria-label="Recorded loot"></div></div>
      <div class="replay-team"><div id="replay-tools" class="replay-tools" aria-label="Recorded tool selection"></div>
      <div id="replay-party" class="replay-party" aria-label="Party stamina"></div></div><div id="replay-belt" class="replay-belt" aria-label="Equipped elixirs"></div>
      <div id="replay-buffs" class="replay-buffs" aria-label="Active elixir buffs"></div></div>
      <canvas id="replay" width="960" height="540" aria-label="Recorded expedition floor"></canvas></div>
      <div class="toolbar replay-controls"><button id="restart" aria-label="Restart replay">&larr; Start</button><button id="play">Play</button>
      <button id="previous-action" aria-label="Previous replay action">&lsaquo; Action</button><button id="next-action" aria-label="Next replay action">Action &rsaquo;</button>
      <input id="scrub" aria-label="Replay time in seconds" type="range" min="${r.frames[0].seconds}" max="${r.seconds}" step="0.01" value="${r.frames[0].seconds}">
      <label>Speed<select id="play-speed">${[.5, 1, 2, 5, 10].map(n => option(n, `${n}x`)).join('')}</select></label></div>
      </details>
    <details><summary>Events</summary><ol id="events-log" class="event-list" aria-label="Recorded expedition events">
      ${r.events.map(e => renderEvent(e, captured)).join('')}</ol></details>`;
  replay = bundle; playback = createSpelunkPlayback(r.frames); $('play-speed').value = '1'; draw();
  $('events-log').onclick = e => {
    const target = e.target.closest('[data-event-time]');
    if (!target) return;
    pause(); playback.seek(Number(target.dataset.eventTime)); draw();
  };
  $('play').onclick = () => {
    if (playback.running) pause();
    else { playback.play(); draw(); $('play').textContent = 'Pause'; animation = requestAnimationFrame(tick); }
  };
  $('restart').onclick = () => { pause(); playback.seek(r.frames[0].seconds); draw(); };
  $('scrub').oninput = () => { pause(); playback.seek(Number($('scrub').value)); draw(); };
  for (const [id, direction] of [['previous-action', -1], ['next-action', 1]]) $(id).onclick = () => {
    pause();
    const seconds = spelunkReplayActionTime(r.replayEvents || [], playback.seconds, direction);
    if (seconds != null) playback.seek(seconds);
    draw();
  };
  $('replay-panel').ontoggle = () => { if (!$('replay-panel').open) pause(); };
}
function renderEvent(event, captured) {
  const tool = captured.tools.find(t => t.id === event.tool), character = captured.characters[event.character];
  const labels = { floor: 'Entered floor', dig: tool ? text(tool.name) : 'Dig',
    elixir: elixirNames[event.id], switch: character?.name || 'Party switch',
    boss: 'Boss defeated', discovery: `Discovered ${text(event.name || 'rock')}`,
    'grand-discovery': 'Grand Discovery', 'exit-found': 'Exit revealed', descend: 'Next floor',
    exhausted: 'Stamina exhausted', blocked: 'No way down' };
  const label = labels[event.type] || text(event.type).replace(/-/g, ' ');
  const icon = event.type === 'dig' ? `CaveTool${event.tool}` : event.type === 'elixir' ? `CaveElix${event.id}`
    : event.type === 'discovery' && SPELUNK_SPRITES[event.name] ? event.name
    : ['floor', 'descend', 'exit-found'].includes(event.type) ? 'CaveRope' : 'CaveStamC';
  const time = `${Math.floor(event.time / 60)}:${(event.time % 60).toFixed(1).padStart(4, '0')}`;
  const detail = event.type === 'dig' ? `${character?.name || ''}${event.used == null ? '' : ` · ${num(event.used)} stamina`}` : '';
  return `<li class="event-row"><button data-event-time="${event.time}" aria-label="${esc(`Replay ${label} at ${time}`)}">${time}</button>
    <span class="event-depth" aria-label="Depth ${event.depth}">D${event.depth}</span>
    <span class="event-icon">${event.type === 'switch' && character ? portrait(character) : art(icon)}</span>
    <span class="event-description"><strong>${esc(label)}</strong>${detail ? `<small>${esc(detail)}</small>` : ''}</span></li>`;
}
function image(name) {
  if (!name) return null;
  if (!images.has(name)) {
    const img = new Image(); images.set(name, img);
    img.onload = draw;
    img.onerror = () => error(`Replay asset failed to load: ${name}`);
    img.src = `./assets/spelunking/${name}.png`;
  }
  return images.get(name);
}
function renderReplayHud(id, markup) {
  const host = $(id);
  if (hudMarkup.get(host) === markup) return;
  if (tipTarget && host.contains(tipTarget)) hideTip();
  host.innerHTML = markup;
  hudMarkup.set(host, markup);
}
function draw() {
  const canvas = $('replay');
  if (!canvas || !replay || !playback) return;
  const { frame, index } = spelunkReplaySample(replay.result.frames, playback.seconds);
  if (!frame) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 960, 540); ctx.imageSmoothingEnabled = false;
  const cave = replay.result.config.cave, tile = image(`CaveTile${cave}`);
  for (const s of frame.tiles) if (tile?.complete && tile.naturalWidth) {
    const p = spelunkReplayTile(frame, s, playback.seconds);
    ctx.globalAlpha = p.alpha; ctx.drawImage(tile, p.x, p.y);
  }
  for (const r of frame.rocks) {
    ctx.globalAlpha = r.alpha ?? 1;
    const img = image(r.name || (r.type === -2 ? 'CaveRope' : null));
    if (img?.complete && img.naturalWidth) ctx.drawImage(img, r.x - r.w / 2, r.y - r.h, r.w, r.h);
    if (r.type >= 0 && r.hp < r.maxHP) {
      ctx.fillStyle = '#333'; ctx.fillRect(r.x - 16, r.y - r.h - 6, 32, 3);
      ctx.fillStyle = '#6bd96b'; ctx.fillRect(r.x - 16, r.y - r.h - 6, 32 * Math.max(0, r.hp / r.maxHP), 3);
    }
  }
  ctx.globalAlpha = 1;
  if (frame.radar) { ctx.strokeStyle = '#ffd700'; ctx.beginPath(); ctx.arc(frame.radar.x, frame.radar.y, 150, 0, 2 * Math.PI); ctx.stroke(); }
  const recent = spelunkReplayEvents(replay.result.replayEvents || [], playback.seconds)
    .filter(e => e.depth === frame.depth);
  const drops = spelunkReplayEvents(replay.result.replayEvents || [], playback.seconds, 2.8)
    .filter(e => e.type === 'drop' && e.depth === frame.depth);
  for (const e of drops) {
    const p = spelunkReplayDrop(e, playback.seconds,
      frame.floorAnimation?.leavingAt == null ? null : frame.floorAnimation.leavingAt / 100), img = image(e.name);
    if (!p || !img?.complete || !img.naturalWidth) continue;
    ctx.globalAlpha = p.alpha;
    const w = img.naturalWidth * p.scale, h = img.naturalHeight * p.scale;
    ctx.drawImage(img, p.x + (img.naturalWidth - w) / 2, p.y + (img.naturalHeight - h) / 2, w, h);
    ctx.font = 'bold 12px Segoe UI'; ctx.textAlign = 'center'; ctx.lineWidth = 3;
    ctx.strokeStyle = '#151523'; ctx.fillStyle = '#ffe4ae';
    const label = `+${num(e.quantity)}`;
    ctx.strokeText(label, p.x + img.naturalWidth / 2, p.y - 3);
    ctx.fillText(label, p.x + img.naturalWidth / 2, p.y - 3);
  }
  const digs = recent.filter(e => e.type === 'dig');
  if (!replay.result.replayEvents && frame.lastAction?.type === 'dig'
    && frame.lastAction.depth === frame.depth && playback.seconds - frame.lastAction.seconds < .35) digs.push(frame.lastAction);
  for (const a of digs) {
    ctx.globalAlpha = Math.max(0, 1 - (playback.seconds - a.seconds) / .45);
    ctx.strokeStyle = '#4dd0e1'; ctx.beginPath(); ctx.arc(a.x, a.y, replay.input.tools.find(t => t.id === a.tool).radius, 0, 2 * Math.PI); ctx.stroke();
    const tool = image(`CaveTool${a.tool}`);
    if (tool?.complete && tool.naturalWidth) ctx.drawImage(tool, a.x - 13, a.y - 27);
  }
  ctx.font = 'bold 14px Segoe UI'; ctx.textAlign = 'center'; ctx.lineWidth = 3;
  for (const e of recent) {
    const age = playback.seconds - e.seconds;
    ctx.globalAlpha = Math.max(0, 1 - age / .45);
    if (e.type === 'hit' || e.type === 'miss') {
      ctx.fillStyle = e.type === 'miss' ? '#ddd' : e.source === 'dig' ? '#ffe4ae' : '#cda1ff';
      ctx.strokeStyle = '#151523'; ctx.lineWidth = 3;
      const label = e.type === 'miss' ? 'Miss' : num(e.damage);
      const y = e.y - e.h - 10 - age * 30;
      ctx.strokeText(label, e.x, y); ctx.fillText(label, e.x, y);
      if (e.source !== 'dig') {
        ctx.beginPath(); ctx.arc(e.x, e.y - e.h / 2, 12 + age * 12, 0, Math.PI * 2);
        ctx.strokeStyle = '#cda1ff'; ctx.lineWidth = 1; ctx.stroke();
      }
    } else if (e.type === 'elixir') {
      const img = image(`CaveElix${e.id}`);
      if (img?.complete && img.naturalWidth) ctx.drawImage(img, 876 - 35 * e.slot, 454 - age * 50, 32, 32);
    } else if (e.type === 'descend' || e.type === 'switch') {
      ctx.fillStyle = '#ffe4ae';
      ctx.fillText(e.type === 'descend' ? '\u2193' : replay.input.characters[e.character].name, 480, 490 - age * 20);
    }
  }
  ctx.globalAlpha = 1;
  $('replay-depth').textContent = `Depth ${frame.depth}`;
  $('replay-time').textContent = `${playback.seconds.toFixed(1)} / ${replay.result.seconds.toFixed(1)}s`;
  if ($('replay-party').dataset.frame !== String(index)) {
    $('replay-party').dataset.frame = index;
    renderReplayHud('replay-tools', replayTools.map(tool => {
      const unlocked = replay.input.tools.some(t => t.id === tool.id), selected = frame.tool === tool.id;
      const label = `${text(tool.name)}${selected ? ' (selected)' : unlocked ? '' : ' (locked)'}`;
      return `<span class="replay-tool${selected ? ' active' : ''}${unlocked ? '' : ' locked'}" tabindex="0"
        data-tool="${tool.id}" aria-current="${selected}" aria-label="${esc(label)}"
        data-stip="${esc(`${label}\n${tool.cost} stamina / ${tool.damage} damage\n${tool.radius}px radius`)}">${art(`CaveTool${tool.id}`)}</span>`;
    }).join(''));
    const collected = replay.result.settled && playback.seconds >= replay.result.seconds;
    renderReplayHud('replay-loot', (frame.rewards || []).map((quantity, i) => quantity || collected && replay.result.grossRewards[i]
      ? `<span class="replay-loot-item" tabindex="0" data-reward="${i}" data-quantity="${quantity}"
        data-stip="${esc(`${SPELUNK_REWARDS[i]}\n${quantity} ${collected ? 'collected after toll' : 'found so far (before toll)'}`)}"
        aria-label="${esc(SPELUNK_REWARDS[i])}: ${quantity}">${art(spelunkRewardImage(replay.input, i))}<b>${num(quantity)}</b></span>` : '').join(''));
    renderReplayHud('replay-party', replay.result.config.party.map((id, slot) => {
      const c = replay.input.characters[id], stamina = frame.stamina[slot];
      return `<span tabindex="0" class="replay-member ${id === frame.active ? 'active' : ''}"
        data-stip="${esc(`${c.name}\n${num(stamina)} / ${num(c.max)} stamina`)}" aria-label="${esc(c.name)}: ${num(stamina)} stamina">
        ${portrait(c)}<span>${num(stamina)}</span></span>`;
    }).join(''));
    renderReplayHud('replay-belt', replay.result.config.elixirs.map((id, slot) => id < 0 ? '' : `<span class="mini-slot" tabindex="0"
      data-stip="${esc(`${elixirNames[id]}\n${frame.charges[slot]} charges remaining`)}" aria-label="${esc(elixirNames[id])}: ${frame.charges[slot]} charges">
      ${art(`CaveElix${id}`)}<b>${frame.charges[slot]}</b></span>`).join(''));
    renderReplayHud('replay-buffs', spelunkActiveBuffs(replay.input, frame.effects).map(buff => {
      const name = buff.id === 12 ? 'Amber bags' : elixirNames[buff.id];
      const value = `${num(buff.value)}${buff.unit}`;
      return `<span class="replay-buff" tabindex="0" data-buff="${buff.id}" data-value="${buff.value}"
        data-stip="${esc(`${name}\n${value}${buff.detail ? `\n${buff.detail}` : ''}`)}" aria-label="${esc(`${name}: ${value}`)}">
        ${art(buff.id === 12 ? 'Blingbag' : `CaveElix${buff.id}`)}<span>${esc(value)}</span></span>`;
    }).join(''));
  }
  $('scrub').value = playback.seconds;
}
function tick(now) {
  if (!playback?.running || document.hidden || activeTab !== 'simulate') { pause(); return; }
  playback.advance(now, Number($('play-speed').value));
  draw();
  if (!playback.running) pause();
  else animation = requestAnimationFrame(tick);
}
function sampleRate(count, total) {
  if (!total) return 'Unavailable';
  return `${num(100 * count / total)}% (${count}/${total})`;
}
function renderContributions(diagnostics, captured, aggregate = false) {
  if (!diagnostics) return '<p class="muted">Party diagnostics unavailable for this stored result.</p>';
  const rows = diagnostics.members;
  return `<details open><summary>${aggregate ? 'Mean character activity &amp; sampled risks' : 'Character activity'}</summary>
    <p class="muted">Events belong to the character active when they resolve, including delayed effects from earlier members.
    No descent does not mean wasted: damage, broken objects and loot still count. Amber below is gross, before toll.</p>
    <table class="comparison"><thead><tr><th>Character</th><th>Stamina used</th><th>Fully resisted stamina</th>
    <th>Hits / resists</th><th>Damage / breaks</th><th>Descents / Amber</th><th>Outcome</th></tr></thead><tbody>
    ${rows.map(c => `<tr><td data-label="Character">${esc(captured.characters[c.id].name)}</td>
      <td data-label="Stamina used">${num(c.spent)}</td><td data-label="Fully resisted stamina">${num(c.resistedStamina)}</td>
      <td data-label="Hits / resists">${num(c.hits)} / ${num(c.misses)}</td>
      <td data-label="Damage / breaks">${num(c.damage)} / ${num(c.broken)}</td>
      <td data-label="Descents / Amber">${num(c.descents)} / ${num(aggregate ? c.amber : c.rewards[0])}</td>
      <td data-label="Outcome">${aggregate
        ? `Unused ${sampleRate(c.unused, c.total)}<br>No later descent ${sampleRate(c.noFurtherFloor, c.total)}<br>Resist stall ${sampleRate(c.resistStall, c.total)}`
        : c.unused ? 'Never activated' : `${c.noAdvance ? 'No descent during turn' : 'Advanced floors'}${c.noFurtherFloor ? '; party never descended again' : ''}${c.resistStall ? '; resist stall' : ''}`}</td></tr>`).join('')}
    </tbody></table><p class="muted">Resist stall = an exhausted member who attempted digs, encountered resists, and had no breaks or descents during their turn.
    Partial damage is still shown; this is not proof of an impossible object. Fully resisted stamina counts digs with no successful direct hit.
    No later descent = the whole party exhausted without going below that member's entry floor; rates use all trials, including unused members.
    A missing-exit blocked floor is separate.</p></details>`;
}
function renderPartyAnalysis(analysis, captured) {
  if (!analysis) return '';
  const recommended = analysis.rows.find(row => row.config.party.length === analysis.recommendedSize);
  return `<details open><summary>How many characters are worth sending?</summary>
    <p>${recommended ? `Smallest measured party retaining 99% of the best observed ${esc(goalNames[analysis.objective])}${analysis.objective === 'depth' ? ' gain' : ''}: <strong>${analysis.recommendedSize} character${analysis.recommendedSize === 1 ? '' : 's'}</strong>.`
      : 'No shorter prefix is eligible for recommendation in the captured search scope.'}</p>
    <p class="muted">${analysis.trials === 1 ? 'One seed only: these are outcomes, not estimated probabilities.' : `${analysis.trials} paired trials per party size; all other captured settings fixed.`}
    Ordered prefixes only, not every possible smaller team. This 1% efficiency allowance is descriptive, not proven equivalence.
    Depth compares floors gained beyond entry. The optimizer's highest-objective winner is unchanged.</p>
    <table class="comparison"><thead><tr><th>Party</th><th>${esc(goalNames[analysis.objective])}</th><th>Depth / Amber</th>
    <th>Gain from extra member</th></tr></thead><tbody>${analysis.rows.map(row => {
      const m = row.marginal;
      const otherLoot = m?.rewards.flatMap((v, i) => i && v ? [`${SPELUNK_REWARDS[i]} ${v > 0 ? '+' : ''}${num(v)}`] : []).join('; ');
      return `<tr><td data-label="Party">${row.config.party.length}: ${row.config.party.map(id => esc(captured.characters[id].name)).join(' &rarr; ')}
        ${row.allowed ? '' : '<small>(outside search scope; diagnostic only)</small>'}</td>
      <td data-label="${esc(goalNames[analysis.objective])}">${num(row.score)}</td>
      <td data-label="Depth / Amber">${num(row.depth)} / ${num(row.amber)}</td>
      <td data-label="Gain from extra member">${m ? `${num(m.objective)} objective; ${num(m.depth)} floors; ${num(m.amber)} Amber<br>
        ${analysis.trials === 1 ? `Extra depth on this seed: ${m.extraDepth ? 'yes' : 'no'}` : `Extra depth ${sampleRate(m.extraDepth, m.total)}`}
        ${m.interval ? `<br>Approx. paired 95% change interval: ${num(m.interval[0])} to ${num(m.interval[1])}` : ''}
        ${m.grands ? `<br>${num(m.grands)} Grand Discoveries` : ''}
        ${otherLoot ? `<br>${esc(otherLoot)}` : ''}` : 'First character'}</td></tr>`;
    }).join('')}</tbody></table></details>`;
}
function renderComparison(bundle, destination) {
  const r = bundle.result, captured = bundle.input;
  const winner = r.winner;
  const efficient = winner?.partyAnalysis?.rows.find(row => row.allowed
    && row.config.party.length === winner.partyAnalysis.recommendedSize
    && row.config.party.length < winner.config.party.length);
  $(destination).innerHTML = `<h2>${esc(goalNames[r.objective])}</h2>`
    + (winner ? `${layout(winner.config, captured)}<p><strong>Best measured: ${num(winner.score)}</strong> &middot; baseline ${num(r.baseline.score)}
      &middot; change ${r.delta >= 0 ? '+' : ''}${num(r.delta)}</p><button id="use-winner">Use recommendation in controls</button>
      <p class="muted">${esc(r.claim)}</p>` : '')
    + (winner ? renderPartyAnalysis(winner.partyAnalysis, captured) : '')
    + (efficient ? '<button id="use-party">Use smaller party (1% observed efficiency allowance)</button>' : '')
    + `<table class="comparison"><thead><tr><th>Configuration</th><th class="num">${esc(goalNames[r.objective])}</th><th class="num">Mean depth</th><th class="num">Collected Amber</th><th class="num">Resist stalls</th><th class="num">Unused / no descent</th><th class="num">Settled</th><th>Inspect</th></tr></thead><tbody>`
    + r.rows.map((row, i) => `<tr><td data-label="Configuration">${row.label === 'Screened strategy' ? '' : `<small class="muted">${esc(row.label)}</small>`}${row.referenceOnly ? ' <small class="muted">(reference only)</small>' : ''}${layout(row.config, captured)}</td>
      <td class="num" data-label="${esc(goalNames[r.objective])}">${num(row.score)}</td>
      <td class="num" data-label="Mean depth">${num(row.depth)}</td><td class="num" data-label="Collected Amber">${num(row.amber)}</td>
      <td class="num" data-label="Resist stalls">${row.diagnostics ? sampleRate(row.diagnostics.resistStall.count, row.total) : 'Unavailable'}</td>
      <td class="num" data-label="Unused / no descent">${row.diagnostics ? `${num(row.diagnostics.unused)} / ${num(row.diagnostics.noAdvance)}` : 'Unavailable'}</td>
      <td class="num" data-label="Settled">${row.settled}/${row.total}</td>
      <td data-label="Inspect"><button data-inspect="${i}" data-owner="${destination}">Runs</button></td></tr>
      <tr hidden id="${destination}-detail-${i}"><td colspan="8" data-label="Trial details">
      <p>${num(row.seconds)}s mean run &middot; ${num(row.recoveryHours)}h mean recovery &middot; SE ${num(row.se)}</p>
      ${row.diagnostics ? `<p>Missing-exit blocked floors: ${sampleRate(row.diagnostics.blocked.count, row.total)}</p>` : ''}
      ${renderContributions(row.diagnostics, captured, true)}
      ${renderPartyAnalysis(row.partyAnalysis, captured)}
      <div>${row.runs.map((run, j) => `<button data-replay-row="${i}" data-replay-trial="${j}" data-owner="${destination}">Run ${j + 1}: ${esc(run.status)}</button>`).join(' ')}</div></td></tr>`).join('')
    + '</tbody></table><p class="warning">Blocked runs have zero collected Amber in these comparisons. Depth and Grand Discovery goals may include unfinished expeditions.</p>'
    + (r.scope ? `<details><summary>Search details</summary><p>${esc(r.scope)}</p>
      <p>Captured scope: party ${r.searchScope.partyMin}&ndash;${r.searchScope.partyMax};
      ${esc((r.searchScope.characters ?? captured.characters.map(c => c.id)).map(id => captured.characters.find(c => c.id === id)?.name ?? `Character ${id + 1}`).join(', '))};
      ${r.searchScope.enabled?.party === false ? 'current party order (fixed)'
        : r.searchScope.ignoreOrder ? 'each group once in character-slot order' : 'all party orders'};
      ${esc(r.searchScope.modes.join(' / '))}; ${esc(r.searchScope.clears.map(v => v ? 'full clear' : 'first exit').join(' / '))};
      Auto speeds ${esc(r.searchScope.speeds.map(v => v || 'Base').join(', ') || 'none')}.
      Belt: ${esc(r.searchScope.elixirs.map(id => elixirNames[id]).join(', ') || 'none')}.
      Memory: ${esc(r.searchScope.memorized.map(id => elixirNames[id]).join(', ') || 'none')}.</p>
      ${r.searchScope.enabled ? `<p>Search sections: ${esc(Object.keys(searchSections).filter(key => r.searchScope.enabled[key] !== false).map(key => searchSections[key]).join(', ') || 'none (current configuration only)')}. Other sections fixed to captured controls.</p>` : ''}
      <p>All ${esc(BigInt(r.configurations).toLocaleString())} allowed configurations screened (${esc(BigInt(r.screened).toLocaleString())} including references) on ${bundle.workers ?? 1} workers. Descriptive paired change interval: ${num(r.interval[0])} to ${num(r.interval[1])}.</p></details>` : '');
  const apply = config => {
    try {
      const current = buildSpelunkInputs(saveData, captured.charIdx);
      config = normalizeSpelunkConfig(current, config);
      input = current; $('character').value = captured.charIdx;
      populate(config); invalidate();
    } catch (e) { error(e.message); }
  };
  if (winner) $('use-winner').onclick = () => apply(winner.config);
  if (efficient) $('use-party').onclick = () => apply(efficient.config);
}
function start(type, extra = {}) {
  try {
    if (!(extra.raw || raw) || (!input && !extra.config)) throw new Error('Load a save first.');
    error(''); cancel(); pause();
    const config = extra.config || readConfig(), id = ++requestId;
    const message = { type, id, raw, charIdx: Number($('character').value), config, seed: freshSeed(), ...extra };
    const destination = type === 'run' ? 'simulate-result' : type === 'compare' ? 'compare-result' : 'optimize-result';
    const capturedRaw = message.raw;
    const capturedStale = capturedRaw !== raw;
    jobRevision = revision;
    document.querySelectorAll('#run,#compare,#optimize').forEach(b => b.disabled = true);
    $('status').textContent = 'Preparing captured expedition inputs...'; $('progress').value = 0;
    $('progress').hidden = false; $('cancel').hidden = false;
    worker = startSpelunkWorkers(message, { onMessage: data => {
      if (data.id !== id || id !== requestId || !worker) return;
      if (data.type === 'progress') {
        $('progress').value = Math.max($('progress').value, data.fraction);
        $('status').textContent = `${data.phase} (${Math.round($('progress').value * 100)}%)`;
      } else if (data.type === 'error') { cancel(); error(data.error); $('status').textContent = 'Failed.'; }
      else if (data.type === 'done') {
        try {
          if (!data.result || !data.input) throw new Error('The expedition worker returned an empty result.');
          retained[destination] = { ...data, raw: capturedRaw, stale: capturedStale || jobRevision !== revision };
          if (type === 'run') renderRun(retained[destination]);
          else renderComparison(retained[destination], destination);
          cancel(); $('status').textContent = 'Complete.';
        } catch (e) { cancel(); error(`Cannot render expedition result: ${e.message}`); }
      }
    }, onError: e => {
      if (id !== requestId) return;
      cancel(); error(`Expedition worker failed: ${e.message}`); $('status').textContent = 'Failed.';
    } });
  } catch (e) { cancel(); error(e.message); }
}
function selectedConfigurations() {
  const selected = configurations.filter((_, i) => checked.has(i));
  if (selected.some(c => c.charIdx !== Number($('character').value)))
    throw new Error('Checked configurations must share the selected logged-in character. Load a configuration to switch its character context.');
  return selected.map(c => ({ label: c.label, config: c.config }));
}

$('run').onclick = () => start('run');
$('compare-objective').innerHTML = $('objective').innerHTML;
$('compare').onclick = () => {
  try { start('compare', { configurations: [{ label: 'Current controls', config: readConfig() }, ...selectedConfigurations()],
    options: { trials: Number($('compare-trials').value), objective: $('compare-objective').value } }); } catch (e) { error(e.message); }
};
$('optimize').onclick = () => {
  try { start('optimize', { options: { objective: $('objective').value,
    screening: Number($('screen-trials').value), trials: Number($('final-trials').value),
    scope: readSearchScope(), configurations: selectedConfigurations() } }); }
  catch (e) { error(e.message); }
};
$('cancel').onclick = () => cancel();
$('reset-elixirs').onclick = () => { renderElixirs(input.savedElixirs); invalidate(); };
$('save-config').onclick = () => {
  try {
    const label = $('config-name').value.trim();
    if (!label) throw new Error('Enter a configuration name.');
    const existing = configurations.findIndex(c => c.label === label);
    const entry = { label, charIdx: Number($('character').value), config: readConfig() };
    if (existing >= 0) configurations[existing] = entry;
    else { if (configurations.length >= 31) throw new Error('At most 31 named configurations are supported.'); configurations.push(entry); }
    persistConfigurations();
  } catch (e) { error(e.message); }
};
document.querySelectorAll('[data-tab]').forEach(b => {
  b.onclick = () => selectTab(b.dataset.tab);
  b.onkeydown = e => {
    const tabs = [...document.querySelectorAll('[data-tab]')], i = tabs.indexOf(b);
    const next = e.key === 'ArrowRight' ? (i + 1) % tabs.length : e.key === 'ArrowLeft' ? (i + tabs.length - 1) % tabs.length : -1;
    if (next >= 0) { e.preventDefault(); selectTab(tabs[next].dataset.tab); tabs[next].focus(); }
  };
});
$('main-content').addEventListener('change', e => {
  const target = e.target;
  if (target.closest('#panel-depth')) { if (target.id === 'depth-inspect') renderDepthInspector(); else renderDepthLimits(); return; }
  if (target.closest('#simulate-result,#compare-result,#optimize-result') || target.dataset.checked != null || target.id === 'config-name') return;
  if (target.closest('#search-scope')) {
    syncSearchSections();
    searchSettings = readSearchScope();
    try { localStorage.setItem(scopeKey, JSON.stringify(searchSettings)); }
    catch (e) { error(`Cannot persist search scope: ${e.message}`); }
    invalidate(); return;
  }
  if (target.id === 'character') {
    try {
      input = buildSpelunkInputs(saveData, Number(target.value));
      renderParty([...document.querySelectorAll('[data-party]')].map(e => Number(e.value)));
      renderInputs();
      renderSearchScope();
    }
    catch (e) { input = null; cancel(); error(e.message); return; }
  }
  if (target.id === 'cave') {
    renderParty([...document.querySelectorAll('[data-party]')].map(e => Number(e.value)).filter(n => n >= 0));
    renderSearchScope();
  }
  if (target.dataset.elixir != null || target.dataset.memory != null) {
    elixirArt(target); syncElixirOptions(); renderElixirHelp();
  }
  syncVisuals(); syncPolicy(); invalidate();
});
$('depth-inspect').addEventListener('input', renderDepthInspector);
$('configurations').addEventListener('change', e => {
  if (e.target.dataset.checked != null) {
    const id = Number(e.target.dataset.checked); if (e.target.checked) checked.add(id); else checked.delete(id);
    invalidate();
  }
});
$('main-content').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  try {
    if (b.dataset.slotKind != null) {
      if (!input) throw new Error('Load a valid save before editing the expedition.');
      openSlot(b);
    }
    if (b.dataset.cave != null) {
      $('cave').value = b.dataset.cave;
      $('cave').dispatchEvent(new Event('change', { bubbles: true }));
      document.querySelector(`[data-cave="${b.dataset.cave}"]`)?.focus({ preventScroll: true });
    }
    if (b.dataset.load != null) {
      const saved = configurations[Number(b.dataset.load)];
      const current = buildSpelunkInputs(saveData, saved.charIdx);
      const config = normalizeSpelunkConfig(current, saved.config);
      $('character').value = saved.charIdx; input = current; populate(config); invalidate();
    }
    if (b.dataset.delete != null) { configurations.splice(Number(b.dataset.delete), 1); checked.clear(); persistConfigurations(); invalidate(); }
    if (b.dataset.inspect != null) {
      const detail = $(`${b.dataset.owner}-detail-${b.dataset.inspect}`); detail.hidden = !detail.hidden;
    }
    if (b.dataset.replayRow != null) {
      const bundle = retained[b.dataset.owner], row = bundle.result.rows[Number(b.dataset.replayRow)];
      const run = row.runs[Number(b.dataset.replayTrial)];
      selectTab('simulate');
      start('run', { raw: bundle.raw, charIdx: bundle.input.charIdx, config: row.config, seed: run.seed });
    }
  } catch (e) { error(e.message); }
});
$('picker-close').onclick = () => closePicker();
$('picker-options').onclick = e => {
  const button = e.target.closest('[data-pick-value]');
  if (!button || button.getAttribute('aria-disabled') === 'true') return;
  const select = pickerSelect;
  select.value = button.dataset.pickValue;
  closePicker();
  select.dispatchEvent(new Event('change', { bubbles: true }));
};
$('spelunk-picker').addEventListener('toggle', e => { if (e.newState === 'closed' && pickerAnchor) closePicker(); });
$('picker-options').addEventListener('keydown', e => {
  const moves = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: pickerSelect?.dataset.party != null ? 1 : 4, ArrowUp: pickerSelect?.dataset.party != null ? -1 : -4 };
  if (!(e.key in moves)) return;
  const buttons = [...$('picker-options').querySelectorAll('button')], index = buttons.indexOf(document.activeElement);
  e.preventDefault();
  buttons[(index + moves[e.key] + buttons.length) % buttons.length].focus({ preventScroll: true });
});
document.addEventListener('pointerover', e => { const target = e.target.closest('[data-stip]'); if (target) showTip(target); });
document.addEventListener('pointerout', e => {
  if (dismissedTip && !dismissedTip.contains(e.relatedTarget)) dismissedTip = null;
  if (tipTarget && !tipTarget.contains(e.relatedTarget)) hideTip();
});
document.addEventListener('focusin', e => { const target = e.target.closest('[data-stip]'); if (target) showTip(target); });
document.addEventListener('focusout', () => { dismissedTip = null; hideTip(); });
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const target = pickerAnchor || tipTarget;
  closePicker(); dismissedTip = target; hideTip();
});
window.addEventListener('scroll', positionTip, { capture: true });
window.addEventListener('resize', positionTip);
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
try {
  const stored = JSON.parse(localStorage.getItem(storageKey) || '[]');
  if (!Array.isArray(stored) || stored.length > 31 || stored.some(c => !c || typeof c.label !== 'string' || !c.config || !Number.isInteger(c.charIdx)))
    throw new Error('Stored expedition configurations are malformed.');
  configurations = stored; renderConfigurations();
} catch (e) { error(`Could not restore configurations: ${e.message}`); }
cancel();
try {
  const stored = JSON.parse(localStorage.getItem(scopeKey) || 'null');
  if (stored) {
    if (typeof stored !== 'object' || Array.isArray(stored)
      || ['characters', 'modes', 'clears', 'speeds', 'elixirs', 'memorized'].some(k => stored[k] != null && !Array.isArray(stored[k]))
      || stored.ignoreOrder != null && typeof stored.ignoreOrder !== 'boolean'
      || stored.enabled != null && (typeof stored.enabled !== 'object' || Array.isArray(stored.enabled)
        || Object.entries(stored.enabled).some(([key, value]) => !(key in searchSections) || typeof value !== 'boolean')))
      throw new Error('Stored search selections are malformed.');
    searchSettings = stored;
  }
} catch (e) { error(`Could not restore search scope: ${e.message}`); }
initSaveLoader({ target: '#save-area', auth: true, onLoad(S, parsed, metadata) {
  const refresh = metadata?.source === 'auto-refresh' && loaded;
  revision++;
  closePicker(false); hideTip();
  raw = parsed;
  if (!refresh) {
    cancel('Save loaded.'); pause(); retained = {}; replay = null;
    for (const id of ['simulate-result', 'compare-result', 'optimize-result']) $(id).replaceChildren();
  } else {
    Object.values(retained).forEach(bundle => { bundle.stale = true; });
  }
  try {
    const prior = loaded ? Number($('character').value) : 0;
    input = buildSpelunkInputs(S, prior);
    if (!refresh || !loaded) {
      $('character').innerHTML = input.characters.map(c => option(c.id, c.name)).join(''); $('character').value = prior;
      let config = null;
      if (!loaded) {
        try {
          const stored = JSON.parse(localStorage.getItem(controlKey) || 'null');
          if (stored) {
            const restored = buildSpelunkInputs(S, stored.charIdx);
            config = normalizeSpelunkConfig(restored, stored.config);
            input = restored; $('character').value = stored.charIdx;
          }
        } catch (e) { error(`Stored controls could not be restored; using save defaults. ${e.message}`); }
      }
      populate(config);
    } else {
      renderParty([...document.querySelectorAll('[data-party]')].map(e => Number(e.value)));
      renderElixirs([...document.querySelectorAll('[data-elixir]')].map(e => Number(e.value)),
        [...document.querySelectorAll('[data-memory]')].map(e => Number(e.value)).filter(id => id >= 0));
      renderInputs();
      renderSearchScope();
    }
    loaded = true;
    if (activeTab === 'depth') renderDepthLimits();
    if (!worker) { cancel(); $('status').textContent = 'Ready.'; }
  } catch (e) {
    input = null; $('reset-elixirs').disabled = true;
    if (activeTab === 'depth') renderDepthLimits();
    error(`Cannot initialize Spelunking: ${e.message}`); if (!refresh) cancel();
  }
} });
