import { saveData } from '../state.js';
import { initSaveLoader } from './save-loader.js';
import { fmtVal } from '../renderers/format.js';
import { renderBreakdownTree } from './dash-breakdowns.js';
import { toRenderNode } from '../stats/tree-builder.js';
import { buildSpelunkInputs } from '../stats/systems/w7/spelunk-inputs.js';
import { normalizeSpelunkConfig, spelunkActiveBuffs, spelunkRewardImage, SPELUNK_REWARDS } from '../stats/systems/w7/spelunk-expedition.js';
import { SPELUNK_SPRITES } from '../stats/data/game/spelunk-sprites.js';
import { spelunkTools } from '../stats/data/w7/spelunking.js';
import { createSpelunkPlayback, spelunkReplaySample, spelunkReplayTile, spelunkReplayDrop, spelunkReplayEvents, spelunkReplayActionTime } from './spelunk-replay.js';
import { startSpelunkWorkers } from '../workers/spelunk-client.js?v=full-belts-1';
import { spelunkSearchSpace } from '../stats/systems/w7/spelunk-planner.js?v=full-belts-1';

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
    modes: selected('modes', String), clears: selected('clears', v => v === 'true'),
    speeds: selected('speeds'), elixirs: selected('elixirs'), memorized: selected('memorized') };
}
function renderSearchScope() {
  if (!input) return;
  const settings = searchSettings || {}, capacity = input.caves[Number($('cave').value)].capacity;
  const chip = (key, value, label, tip = '', disabled = false, icon = false) => {
    const checked = settings[key] == null || settings[key].includes(value);
    return `<label class="scope-chip${icon ? ' scope-icon' : ''}"${tip ? ` data-stip="${esc(tip)}"` : ''}>
      ${icon ? label : ''}<input type="checkbox" data-scope="${key}" value="${esc(value)}"
      aria-label="${esc(icon ? tip : label)}" ${checked && !disabled ? 'checked' : ''} ${disabled ? 'disabled' : ''}>${icon ? '' : esc(label)}</label>`;
  };
  $('search-scope').innerHTML = `<div class="scope-row"><span>Party size</span><div class="scope-choices">
    <label>From <input id="search-party-min" type="number" min="1" max="${capacity}" value="${esc(settings.partyMin ?? 1)}"></label>
    <label>to <input id="search-party-max" type="number" min="1" max="${capacity}" value="${esc(settings.partyMax ?? capacity)}"></label>
    <small>members</small></div></div>
    <div class="scope-row"><span>Play</span><div class="scope-choices">
    ${chip('modes', 'auto', 'Auto', 'Search native Auto strategies.', !input.auto)}
    ${chip('modes', 'manual', 'Manual', 'Search simulated manual targeting strategies, tools and party order.')}</div></div>
    <div class="scope-row"><span>Descend</span><div class="scope-choices">
    ${chip('clears', false, 'First exit', 'Descend when an exit is revealed. Manual searches include depth-diving and damage-per-stamina targeting.')}
    ${chip('clears', true, 'Full clear', 'Clear every remaining rock before descending, for both Auto and manual strategies.')}</div></div>
    <div class="scope-row"><span>Auto speeds</span><div class="scope-choices">
    ${Array.from({ length: input.speedMax + 1 }, (_, speed) => chip('speeds', speed, speed ? String(speed) : 'Base',
      'Only checked speeds may be recommended; these choices do not affect manual strategies.', !input.auto)).join('')}</div></div>
    ${['elixirs', 'memorized'].map(key => `<div class="scope-row"><span>${key === 'elixirs' ? 'Belt pool' : 'Memory pool'}</span>
      <div class="scope-choices">${input.elixirs.slice(0, input.elixirOwned).map(e => chip(key, e.id,
        art(`CaveElix${e.id}`), `${key === 'elixirs' ? 'Allow equipped' : 'Allow memorized'}: ${elixirNames[e.id]}\n${e.description}`,
        key === 'memorized' && !input.memorySlots || key === 'elixirs' && !input.slots, true)).join('')}</div></div>`).join('')}`;
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
function selectTab(name) {
  activeTab = name;
  pause(); closePicker(false); hideTip();
  $(`${name}-status-host`).append($('job-status'));
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
function renderComparison(bundle, destination) {
  const r = bundle.result, captured = bundle.input;
  const winner = r.winner;
  $(destination).innerHTML = `<h2>${esc(goalNames[r.objective])}</h2>`
    + (winner ? `${layout(winner.config, captured)}<p><strong>Best measured: ${num(winner.score)}</strong> &middot; baseline ${num(r.baseline.score)}
      &middot; change ${r.delta >= 0 ? '+' : ''}${num(r.delta)}</p><button id="use-winner">Use recommendation in controls</button>
      <p class="muted">${esc(r.claim)}</p>` : '')
    + `<table class="comparison"><thead><tr><th>Configuration</th><th class="num">${esc(goalNames[r.objective])}</th><th class="num">Mean depth</th><th class="num">Collected Amber</th><th class="num">Settled</th><th>Inspect</th></tr></thead><tbody>`
    + r.rows.map((row, i) => `<tr><td data-label="Configuration">${row.label === 'Screened strategy' ? '' : `<small class="muted">${esc(row.label)}</small>`}${row.referenceOnly ? ' <small class="muted">(reference only)</small>' : ''}${layout(row.config, captured)}</td>
      <td class="num" data-label="${esc(goalNames[r.objective])}">${num(row.score)}</td>
      <td class="num" data-label="Mean depth">${num(row.depth)}</td><td class="num" data-label="Collected Amber">${num(row.amber)}</td>
      <td class="num" data-label="Settled">${row.settled}/${row.total}</td>
      <td data-label="Inspect"><button data-inspect="${i}" data-owner="${destination}">Runs</button></td></tr>
      <tr hidden id="${destination}-detail-${i}"><td colspan="6" data-label="Trial details">
      <p>${num(row.seconds)}s mean run &middot; ${num(row.recoveryHours)}h mean recovery &middot; SE ${num(row.se)}</p>
      <div>${row.runs.map((run, j) => `<button data-replay-row="${i}" data-replay-trial="${j}" data-owner="${destination}">Run ${j + 1}: ${esc(run.status)}</button>`).join(' ')}</div></td></tr>`).join('')
    + '</tbody></table><p class="warning">Blocked runs have zero collected Amber in these comparisons. Depth and Grand Discovery goals may include unfinished expeditions.</p>'
    + (r.scope ? `<details><summary>Search details</summary><p>${esc(r.scope)}</p>
      <p>Captured scope: party ${r.searchScope.partyMin}&ndash;${r.searchScope.partyMax};
      ${esc(r.searchScope.modes.join(' / '))}; ${esc(r.searchScope.clears.map(v => v ? 'full clear' : 'first exit').join(' / '))};
      Auto speeds ${esc(r.searchScope.speeds.map(v => v || 'Base').join(', ') || 'none')}.
      Belt: ${esc(r.searchScope.elixirs.map(id => elixirNames[id]).join(', ') || 'none')}.
      Memory: ${esc(r.searchScope.memorized.map(id => elixirNames[id]).join(', ') || 'none')}.</p>
      <p>All ${esc(BigInt(r.configurations).toLocaleString())} allowed configurations screened (${esc(BigInt(r.screened).toLocaleString())} including references) on ${bundle.workers ?? 1} workers. Descriptive paired change interval: ${num(r.interval[0])} to ${num(r.interval[1])}.</p></details>` : '');
  if (winner) $('use-winner').onclick = () => {
    try {
      const current = buildSpelunkInputs(saveData, captured.charIdx);
      const config = normalizeSpelunkConfig(current, winner.config);
      input = current; $('character').value = captured.charIdx;
      populate(config); invalidate();
    } catch (e) { error(e.message); }
  };
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
  if (target.closest('#simulate-result,#compare-result,#optimize-result') || target.dataset.checked != null || target.id === 'config-name') return;
  if (target.closest('#search-scope')) {
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
      || ['modes', 'clears', 'speeds', 'elixirs', 'memorized'].some(k => stored[k] != null && !Array.isArray(stored[k])))
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
    if (!worker) { cancel(); $('status').textContent = 'Ready.'; }
  } catch (e) {
    input = null; $('reset-elixirs').disabled = true;
    error(`Cannot initialize Spelunking: ${e.message}`); if (!refresh) cancel();
  }
} });
