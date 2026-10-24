import { MapDispName } from '../stats/data/game/customlists.js';
import { ITEMS } from '../stats/data/game/items.js';
import { MONSTERS } from '../stats/data/game/monsters.js';
import { classifyMap, buildCharacterMapOptions, getCharacterMapEvidence } from '../stats/systems/common/map-access.js';
import { DROP_GROUPS, monsterDropItems } from '../stats/systems/common/combat-sim-map-drops.js';
import { fmtVal } from '../renderers/format.js';
import { fmtCoins } from '../renderers/coins.js';
import { iconHtml } from './combat-sim-picker.js';

const esc = text => String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const number = value => !Number.isFinite(value) ? 'Unavailable' : value === 0 ? '0'
  : Math.abs(value) < 0.1 ? String(Number(value.toPrecision(3))) : fmtVal(value);
const CAVERNS = [
  { holeCavern: 8, target: 'caveB', name: 'Grotto (Gloomie Mushrooms)' },
  { holeCavern: 14, target: 'caveC', name: 'Temple (Ancient Golems)' },
  { holeCavern: 17, target: 'caveD', name: 'The Cove (Crystal Glunkos)' },
];
const mapName = (id, cavern) => CAVERNS.find(c => id === 216 && c.holeCavern === cavern)?.name || String(MapDispName[id] || 'Map ' + id).replace(/_/g, ' ');
const mapId = map => map.holeCavern == null ? map.mapIdx : '216:' + map.holeCavern;
const parseMapId = value => value.startsWith('216:') ? value : Number(value);
const itemName = key => key.startsWith('Cards')
  ? (MONSTERS[ITEMS[key]?.desc_line1]?.Name || ITEMS[key]?.desc_line2 || key).replace(/_/g, ' ') + ' Card'
  : String(ITEMS[key]?.displayName || key).replace(/[_|]/g, ' ');
function odds(p, guaranteed) {
  if (guaranteed) return 'Guaranteed';
  if (!(p > 0)) return '0%';
  if (p > 0.9999) return '&gt;99.99%';
  return String(Number((p * 100).toPrecision(4))) + '%';
}

export function mountCombatAfk(host, options) {
  const KEY = 'combat-sim-afk-v1';
  const scopes = ['accessible', 'all', 'world', 'custom', 'drops'];
  const worlds = [1, 2, 3, 4, 5, 6, 7];
  const dropGroups = DROP_GROUPS.filter(group => !['mc', 'bone', 'dust', 'tachyon'].includes(group.id));
  let state = { hours: 8, candy: false, characters: null, loadouts: {}, maps: null, reach: true, scope: 'accessible', worlds, search: '', drop: 'group:statue' };
  let storageError = '';
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (stored) {
      const indices = value => value === null || Array.isArray(value) && value.every(id => Number.isInteger(id) && id >= 0);
      if (!Number.isFinite(stored.hours) || stored.hours < 0 || stored.hours > 55555
          || !(stored.maps === null || Array.isArray(stored.maps) && stored.maps.every(id => Number.isInteger(id) && id >= 0 || CAVERNS.some(c => id === '216:' + c.holeCavern))) || !indices(stored.characters)
          || !stored.loadouts || typeof stored.loadouts !== 'object' || Array.isArray(stored.loadouts)
          || !Object.values(stored.loadouts).every(value => Array.isArray(value) && value.every(id => typeof id === 'string'))
          || typeof stored.search !== 'string' || typeof stored.reach !== 'boolean'
          || stored.scope != null && !scopes.includes(stored.scope)
          || stored.worlds != null && (!Array.isArray(stored.worlds) || !stored.worlds.every(w => worlds.includes(w)))
          || stored.drop != null && typeof stored.drop !== 'string'
          || stored.candy != null && typeof stored.candy !== 'boolean') throw new Error('Invalid saved AFK controls.');
      state = { ...state, ...stored, scope: stored.scope ?? (stored.maps === null ? 'accessible' : 'custom') };
      delete state.world;
    }
  } catch (error) { storageError = 'Could not restore AFK controls: ' + error.message; }
  let results = [], workers = [], running = false, stale = '', runHours = null, runCandy = false, selected = null, dropped = 0;
  let chosenDrop = '', sortKey = 'exp', sortDirection = -1, renderTimer = null, finished = 0, total = 0, generation = 0;
  host.innerHTML = `<style>
    .afk-results{margin-top:12px}.afk-results button{cursor:pointer}
    .afk-drop-icon img{width:24px;height:24px;object-fit:contain;vertical-align:middle;image-rendering:pixelated}
    .afk-summary td{vertical-align:top}.afk-summary th button{background:none;color:inherit;border:0;font:inherit;padding:0}
    .afk-summary tr[data-afk-row]{cursor:pointer}.afk-summary tr[data-selected] td{background:rgba(77,208,225,.12)}
    .afk-summary tr[data-afk-row]:focus-visible{outline:2px solid var(--cyan);outline-offset:-2px}
    .afk-detail{margin-top:14px}.afk-detail .note{margin:6px 0}.afk-detail table{max-width:900px}
    @media(max-width:650px){.afk-summary thead{display:none}.afk-summary tr,.afk-summary td{display:block}.afk-summary tr{border:1px solid #42516b;border-radius:6px;margin:8px 0;padding:6px}.afk-summary td{display:flex;justify-content:space-between;gap:12px;border:0}.afk-summary td:before{content:attr(data-label);color:var(--text2)}}
  </style>
  <div class="section"><h2>AFK gains</h2>
    <div class="note">Compare one offline combat claim on one or more maps. Loadouts include gear, talents, account edits and shared component terms; active-only mechanics are identified in each result.</div>
    <div class="toolbar" style="margin:12px 0">
      <label>Hours away<input data-afk-hours type="number" min="0" max="55555" step="0.5"></label>
      <label class="chk"><input data-afk-candy type="checkbox"> Candy AFK</label>
      <button class="btn" data-afk-run disabled>Compare AFK gains</button><button class="btn secondary" data-afk-stop disabled>Cancel</button>
    </div>
    <div class="note">Candy uses the same combat rewards, food consumption and prayer cap, but does not grant Master Class quest items, TranQi EXP, Harriep procs or offline Worship/Sailing/Gaming bonuses. Native candy restrictions still apply, including no Hole or World 7 maps.</div>
    <div data-afk-loadouts></div>
    <h3>Maps</h3><div class="toolbar">
      <label>Maps<select data-afk-scope>
        <option value="accessible">Maps each character can reach</option><option value="all">Every AFK combat map</option>
        <option value="world">Choose worlds</option><option value="custom">Choose maps</option><option value="drops">Maps that can drop…</option>
      </select></label>
      <label class="chk" data-afk-reach-label><input data-afk-reach type="checkbox"> Only reachable maps</label>
    </div>
    <div class="cmp-pick-box" data-afk-picker>
      <div class="toolbar" data-afk-custom-controls>
        <label>Filter<input data-afk-search type="search" placeholder="Map name, number, or monster"></label>
        <button class="btn secondary" data-afk-reachable>Select reachable</button><button class="btn secondary" data-afk-none>Clear</button>
      </div>
      <div class="toolbar" data-afk-worlds>${worlds.map(w => `<label class="chk"><input type="checkbox" data-afk-world="${w}"${state.worlds.includes(w) ? ' checked' : ''}> World ${w}</label>`).join('')}</div>
      <div data-afk-drop-controls><label>Drop<select data-afk-target></select></label>
        <div class="note">Uses the AFK target monster's drop tables, including rare tables. Active-only crystal and form drops are excluded; saved unlocks and filters can prevent a listed drop.</div>
      </div>
      <div data-afk-maps></div>
    </div><div class="note" data-afk-count></div>
    <div class="err" role="alert" data-afk-error></div>
    <div data-afk-progress class="note" role="status" style="margin-top:10px"></div>
    <div class="afk-results" data-afk-results></div>
  </div>`;
  const $ = selector => host.querySelector(selector);
  $('[data-afk-hours]').value = state.hours;
  $('[data-afk-candy]').checked = state.candy;
  $('[data-afk-scope]').value = state.scope;
  $('[data-afk-search]').value = state.search;
  $('[data-afk-reach]').checked = state.reach;
  $('[data-afk-error]').textContent = storageError;
  const dropTargets = [...new Set(mapOptions().flatMap(map => [...monsterDropItems(map.target).keys()]))].sort((a, b) => itemName(a).localeCompare(itemName(b)));
  $('[data-afk-target]').innerHTML = '<optgroup label="Groups">'
    + dropGroups.map(group => `<option value="group:${group.id}">${esc(group.label)}</option>`).join('')
    + '</optgroup><optgroup label="Items">' + dropTargets.map(key => `<option value="${esc(key)}">${esc(itemName(key))}</option>`).join('') + '</optgroup>';
  $('[data-afk-target]').value = state.drop;
  if (!$('[data-afk-target]').value) { state.drop = 'group:statue'; $('[data-afk-target]').value = state.drop; }
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (error) { $('[data-afk-error]').textContent = 'Could not save AFK controls: ' + error.message; }
  }
  function characters() { return options.getChosen(state); }
  function mapOptions() {
    return [...MapDispName.map((_, mapIdx) => classifyMap(mapIdx)).filter(m => m.category === 'combat'),
      ...CAVERNS.map(c => ({ ...c, mapIdx: 216, world: 5 }))];
  }
  function accessible(ci) {
    const snapshot = options.getSnapshot();
    const reachable = new Set(buildCharacterMapOptions(ci, snapshot, { level: 'accessible' }).map(m => m.mapIdx));
    const holes = snapshot?.saveData?.holesData;
    const hole = getCharacterMapEvidence(ci, 216, snapshot);
    const holeAccessible = hole.accessible || hole.visited || hole.current;
    for (const c of CAVERNS) if (holeAccessible && (Number(holes?.[1]?.[0]) > c.holeCavern || Number(holes?.[0]?.[ci]) === c.holeCavern)) reachable.add(mapId(c));
    return reachable;
  }
  function selectedMaps(ci) {
    let maps = mapOptions();
    if (state.scope === 'custom') {
      const picked = new Set(state.maps || []);
      return maps.filter(map => picked.has(mapId(map)));
    }
    if (state.scope === 'accessible' || state.scope !== 'all' && state.reach) {
      const reach = accessible(ci);
      maps = maps.filter(map => reach.has(mapId(map)));
    }
    if (state.scope === 'world') maps = maps.filter(map => state.worlds.includes(map.world));
    if (state.scope === 'drops') {
      const group = dropGroups.find(group => state.drop === 'group:' + group.id);
      maps = maps.filter(map => [...monsterDropItems(map.target).keys()].some(key => group ? group.test(key) : key === state.drop));
    }
    return maps;
  }
  function jobs() {
    if (!options.getRawSave()) return [];
    return characters().flatMap(ch => {
      const maps = selectedMaps(ch.charIdx);
      return ch.choices.flatMap(choice => maps.map(map => ({
        charIdx: ch.charIdx, character: ch.label, loadout: choice.label, setup: choice.setup, mapIdx: map.mapIdx, holeCavern: map.holeCavern,
      })));
    });
  }
  function count() {
    try {
      const n = jobs().length;
      $('[data-afk-count]').textContent = n + ' character / loadout / map combinations. Map access is checked separately for each character.';
      $('[data-afk-run]').disabled = running || !n;
    } catch (error) {
      $('[data-afk-error]').textContent = error.message;
      $('[data-afk-run]').disabled = true;
    }
  }
  function filterMaps() {
    const query = state.search.trim().toLowerCase();
    $('[data-afk-maps]').querySelectorAll('label').forEach(label => {
      label.classList.toggle('hidden', !!query && !label.dataset.search.includes(query));
    });
  }
  function renderMaps() {
    const custom = state.scope === 'custom';
    $('[data-afk-reach-label]').hidden = !['world', 'drops'].includes(state.scope);
    $('[data-afk-picker]').hidden = ['accessible', 'all'].includes(state.scope);
    $('[data-afk-custom-controls]').hidden = !custom;
    $('[data-afk-worlds]').hidden = state.scope !== 'world';
    $('[data-afk-drop-controls]').hidden = state.scope !== 'drops';
    const host = $('[data-afk-maps]');
    if (!custom || !options.getRawSave()) { host.innerHTML = ''; return; }
    const all = mapOptions(), reach = accessible(options.getCurrentChar()), picked = new Set(state.maps || []);
    host.innerHTML = [...new Set(all.map(map => map.world))].map(world => {
      const maps = all.filter(map => map.world === world);
      return `<div class="cmp-world"><div class="cmp-world-head">World ${world}
        <span class="note" style="margin:0" data-afk-world-count="${world}">${maps.filter(map => picked.has(mapId(map))).length} of ${maps.length}</span>
        <button type="button" data-afk-world-all="${world}">All</button><button type="button" data-afk-world-none="${world}">None</button></div>
        <div class="cmp-map-list">${maps.map(map => `<label data-search="${esc((map.mapIdx + ' ' + map.name + ' ' + (MONSTERS[map.target]?.Name || '')).toLowerCase())}">
          <input type="checkbox" data-afk-map="${mapId(map)}"${picked.has(mapId(map)) ? ' checked' : ''}>${map.mapIdx} &middot; ${esc(map.name)}
          ${reach.has(mapId(map)) ? '' : '<span class="badge badge-red">locked</span>'}</label>`).join('')}</div></div>`;
    }).join('');
    filterMaps();
  }
  function refresh() {
    options.renderLoadouts($('[data-afk-loadouts]'), state);
    if (!options.getRawSave()) { count(); return; }
    const all = mapOptions();
    if (state.maps === null) {
      const ci = options.getCurrentChar(), access = accessible(ci), current = options.getCurrentMap();
      const initial = all.find(m => m.mapIdx === current && access.has(mapId(m))) ?? all.find(m => access.has(mapId(m)));
      state.maps = initial ? [mapId(initial)] : [];
    }
    renderMaps(); count();
  }
  function stop(message = 'Cancelled; completed combinations are retained.') {
    generation++;
    workers.forEach(worker => worker.terminate());
    workers = []; running = false;
    clearTimeout(renderTimer); renderTimer = null;
    $('[data-afk-stop]').disabled = true;
    $('[data-afk-progress]').textContent = message;
    count(); renderResults();
  }
  function invalidate(message) {
    if (running) stop('Stopped because AFK controls changed; completed combinations are retained.');
    if (results.length) stale = message;
    renderResults();
  }
  function changed() {
    invalidate('Controls or loadouts changed. Run again to update these results.');
    persist(); count();
  }
  function renderResults() {
    try { renderResultTable(); }
    catch (error) { $('[data-afk-error]').textContent = 'Could not display AFK results: ' + error.message; }
  }
  function renderResultTable() {
    const container = $('[data-afk-results]');
    if (!results.length) { container.innerHTML = ''; return; }
    const dropKeys = [...new Set(results.flatMap(row => (row.result?.drops || []).filter(d => d.key !== 'COIN').map(d => d.key)))].sort((a, b) => itemName(a).localeCompare(itemName(b)));
    if (chosenDrop && !dropKeys.includes(chosenDrop)) chosenDrop = '';
    const cellDrop = row => row.result?.drops?.find(d => d.key === chosenDrop);
    const value = row => sortKey === 'drop' ? cellDrop(row)?.expected || 0 : sortKey === 'chance' ? cellDrop(row)?.chance || 0
      : sortKey === 'map' ? mapName(row.mapIdx, row.holeCavern) : sortKey === 'character' ? row.character : sortKey === 'loadout' ? row.loadout
      : row.result?.[sortKey] ?? -Infinity;
    const ordered = [...results].sort((a, b) => {
      const av = value(a), bv = value(b);
      return sortDirection * (typeof av === 'string' ? av.localeCompare(bv) : av - bv) || a.id - b.id;
    });
    const headers = [['character', 'Character'], ['loadout', 'Loadout'], ['map', 'Map'], ['effectiveHours', 'Claim hours'], ['rewardKills', 'Reward kills'], ['creditedKills', 'Kill credit'], ['exp', 'Class EXP'], ['coins', 'Expected coins']];
    if (chosenDrop) headers.push(['drop', 'Expected ' + itemName(chosenDrop)], ['chance', 'Chance of at least one']);
    const td = (label, body) => `<td data-label="${esc(label)}">${body}</td>`;
    container.innerHTML = (stale ? `<div class="note"><strong>Stale snapshot:</strong> ${esc(stale)}</div>` : '')
      + `<div class="note">Results for ${number(runHours)} hours of ${runCandy ? 'candy AFK' : 'normal offline AFK'}, as separate alternative claims, not combined income. Expected quantities are averages, not promises. Odds cover the whole claim and follow the game's batch roll. Select a row to inspect its drops. ${finished}/${total} completed${dropped ? ' (' + dropped + ' failed)' : ''}.</div>`
      + `<div class="toolbar"><label>Compare a drop<select data-afk-drop><option value="">Choose a drop</option>${dropKeys.map(key => `<option value="${esc(key)}"${chosenDrop === key ? ' selected' : ''}>${esc(itemName(key))}</option>`).join('')}</select></label></div>`
      + `<div class="scroll"><table class="data-table afk-summary"><thead><tr>${headers.map(([key, title]) => `<th><button type="button" data-afk-sort="${key}">${esc(title)}${sortKey === key ? sortDirection < 0 ? ' \u2193' : ' \u2191' : ''}</button></th>`).join('')}</tr></thead><tbody>`
      + ordered.map(row => {
        const r = row.result, error = row.error || r?.unavailable && r.reason, drop = cellDrop(row);
        let html = td('Character', esc(row.character)) + td('Loadout', esc(row.loadout))
          + td('Map', `${esc(mapName(row.mapIdx, row.holeCavern))}${r?.partial ? ' <span class="badge badge-gold">Partial</span>' : ''}`);
        if (error) html += `<td colspan="${headers.length - 3}" data-label="Unavailable"><span class="err">${esc(error)}</span></td>`;
        else html += td('Claim hours', number(r.effectiveHours)) + td('Reward kills', number(r.rewardKills)) + td('Kill credit', number(r.creditedKills))
          + td('Class EXP', number(r.exp)) + td('Expected coins', fmtCoins(r.coins))
          + (chosenDrop ? td('Expected ' + itemName(chosenDrop), number(drop?.expected || 0)) + td('Chance of at least one', odds(drop?.chance || 0, drop?.guaranteed)) : '');
        return `<tr data-afk-row="${row.id}" tabindex="0" aria-label="${esc(row.character + ', ' + row.loadout + ', ' + mapName(row.mapIdx, row.holeCavern) + ': inspect drops')}"${selected === row.id ? ' data-selected' : ''}>${html}</tr>`;
      }).join('') + '</tbody></table></div><div class="afk-detail" data-afk-detail></div>';
    renderDetail();
  }
  function renderDetail() {
    const detail = $('[data-afk-detail]');
    if (!detail) return;
    const row = results.find(r => r.id === selected) || results.find(r => !r.error && !r.result?.unavailable);
    if (!row) { detail.innerHTML = ''; return; }
    selected = row.id;
    host.querySelectorAll('[data-afk-row]').forEach(el => el.toggleAttribute('data-selected', Number(el.dataset.afkRow) === selected));
    const r = row.result;
    if (!r || r.unavailable) { detail.textContent = row.error || r?.reason; return; }
    detail.innerHTML = `<h3>${esc(row.character)} / ${esc(row.loadout)} / ${esc(mapName(row.mapIdx, row.holeCavern))}</h3>
      <div class="note">${r.candy ? 'Candy AFK' : 'Normal offline AFK'} &middot; ${number(r.effectiveHours)} claim hours &middot; ${number(r.dropRolls)} initial drop rolls &middot; ${number(r.survivability)}% survivability</div>`
      + r.warnings.map(w => `<div class="note"><strong>Partial / limit:</strong> ${esc(w)}</div>`).join('')
      + r.notes.map(note => `<div class="note">${esc(note)}</div>`).join('')
      + (r.progress?.rows.length ? '<h4>Offline progress</h4><table class="data-table"><thead><tr><th>Progress</th><th class="num">Gained</th></tr></thead><tbody>'
        + r.progress.rows.map(progress => `<tr><td>${esc(progress.name)}</td><td class="num">${number(progress.amount)} ${esc(progress.unit)}</td></tr>`).join('') + '</tbody></table>' : '')
      + (r.food?.events.length ? '<details><summary>Food consumption and Lab refills</summary><div class="note">Native one-pass deadlines; refilled stacks are not scheduled for another depletion in the same claim.</div><table class="data-table"><thead><tr><th>Food</th><th>At</th><th>Consumed</th><th>Refilled</th><th>Remaining</th></tr></thead><tbody>'
        + r.food.events.map(event => `<tr><td>${esc(itemName(event.key))}</td><td>${number(event.atSeconds / 3600)}h</td><td>${number(event.used)}</td><td>${number(event.refilled)}</td><td>${number(event.remaining)}${event.removed ? ' (slot emptied)' : ''}</td></tr>`).join('') + '</tbody></table></details>' : '')
      + '<table class="data-table"><thead><tr><th>Drop</th><th class="num">Expected quantity</th><th class="num">Chance of at least one</th></tr></thead><tbody>'
      + [...r.drops].sort((a, b) => b.chance - a.chance || b.expected - a.expected).map(drop => `<tr><td class="afk-drop-icon">${drop.key !== 'COIN' ? iconHtml('items', drop.key, itemName(drop.key), { size: 24 }) : ''} ${esc(drop.key === 'COIN' ? 'Coins' : itemName(drop.key))}${drop.single ? ' <span class="note">(one per claim)</span>' : ''}</td><td class="num">${drop.key === 'COIN' ? fmtCoins(drop.expected) : number(drop.expected)}</td><td class="num">${odds(drop.chance, drop.guaranteed)}</td></tr>`).join('') + '</tbody></table>';
  }
  function scheduleRender() {
    if (!renderTimer) renderTimer = setTimeout(() => { renderTimer = null; renderResults(); }, 350);
  }
  function start() {
    if (running) return;
    try {
      const hours = Number($('[data-afk-hours]').value);
      const candy = $('[data-afk-candy]').checked;
      if (!Number.isFinite(hours) || hours < 0 || hours > 55555) throw new Error('Enter AFK hours between 0 and 55,555.');
      const queue = structuredClone(jobs()).map((job, id) => ({ ...job, id }));
      if (!queue.length) throw new Error('Choose at least one character, loadout and eligible map.');
      const raw = options.getRawSave(), token = ++generation;
      state.hours = hours; state.candy = candy; persist();
      results = []; stale = ''; selected = null; runHours = hours; runCandy = candy; finished = 0; total = queue.length; dropped = 0; running = true;
      $('[data-afk-error]').textContent = '';
      $('[data-afk-results]').innerHTML = '';
      $('[data-afk-stop]').disabled = false; count();
      let index = 0;
      function progress() { $('[data-afk-progress]').textContent = `${finished}/${total} AFK combinations completed`; }
      function send(worker) {
        if (token !== generation) return;
        if (index < queue.length) {
          const job = queue[index++];
          worker.job = job;
          worker.postMessage({ type: 'afk', id: job.id, charIdx: job.charIdx, mapIdx: job.mapIdx, holeCavern: job.holeCavern, setup: job.setup, hours, candy });
        } else {
          worker.job = null;
          if (finished === total) stop('Complete: ' + finished + ' AFK combinations.');
        }
      }
      for (let n = 0; n < Math.min(4, queue.length, navigator.hardwareConcurrency || 2); n++) {
        const worker = new Worker(new URL('../workers/combat-afk-worker.js', import.meta.url), { type: 'module' });
        workers.push(worker);
        worker.onerror = event => {
          if (token !== generation) return;
          $('[data-afk-error]').textContent = 'AFK worker failed: ' + (event.message || 'Unable to load worker.');
          stop('AFK comparison stopped after a worker failure.');
        };
        worker.onmessage = ({ data: msg }) => {
          if (token !== generation) return;
          if (msg.type === 'loaded') { send(worker); return; }
          if (!worker.job || msg.id !== worker.job.id) return;
          if (msg.type !== 'done' && msg.type !== 'error') return;
          if (msg.type === 'done' && !msg.result) {
            $('[data-afk-error]').textContent = 'AFK worker returned an empty result.';
            stop('AFK comparison stopped after an invalid worker response.'); return;
          }
          results.push({ ...worker.job, result: msg.result, error: msg.error });
          finished++; if (msg.type === 'error') dropped++;
          progress(); scheduleRender(); send(worker);
        };
        worker.postMessage({ type: 'load', rawSave: raw });
      }
      progress();
    } catch (error) {
      $('[data-afk-error]').textContent = error.message;
      if (running) stop('AFK comparison stopped.');
    }
  }
  host.addEventListener('click', event => {
    const t = event.target.closest('button');
    if (!t) {
      const row = event.target.closest('[data-afk-row]');
      if (row) { selected = Number(row.dataset.afkRow); renderDetail(); }
      return;
    }
    if (t.hasAttribute('data-afk-run')) start();
    else if (t.hasAttribute('data-afk-stop')) stop();
    else if (t.hasAttribute('data-afk-reachable') || t.hasAttribute('data-afk-none')
        || t.dataset.afkWorldAll != null || t.dataset.afkWorldNone != null) {
      let maps = new Set(state.maps || []);
      if (t.hasAttribute('data-afk-none')) maps.clear();
      else if (t.hasAttribute('data-afk-reachable')) {
        const reach = accessible(options.getCurrentChar());
        maps = new Set(mapOptions().filter(map => reach.has(mapId(map))).map(mapId));
      }
      else {
        const world = Number(t.dataset.afkWorldAll ?? t.dataset.afkWorldNone);
        const add = t.dataset.afkWorldAll != null;
        $('[data-afk-maps]').querySelector(`[data-afk-world-count="${world}"]`).closest('.cmp-world')
          .querySelectorAll('label:not(.hidden) input').forEach(input => {
            const id = parseMapId(input.dataset.afkMap);
            if (add) maps.add(id); else maps.delete(id);
          });
      }
      state.maps = [...maps]; renderMaps(); changed();
    } else if (t.dataset.afkSort) {
      if (sortKey === t.dataset.afkSort) sortDirection *= -1; else { sortKey = t.dataset.afkSort; sortDirection = -1; }
      renderResults();
    }
  });
  host.addEventListener('keydown', event => {
    const row = event.target.closest('[data-afk-row]');
    if (row && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault(); selected = Number(row.dataset.afkRow); renderDetail();
    }
  });
  host.addEventListener('change', event => {
    const t = event.target;
    if (t.hasAttribute('data-afk-drop')) { chosenDrop = t.value; renderResults(); return; }
    if (t.hasAttribute('data-afk-scope')) {
      state.scope = t.value;
      if (state.scope === 'custom' && state.maps === null) state.maps = [...accessible(options.getCurrentChar())];
      renderMaps();
    } else if (t.hasAttribute('data-afk-world')) {
      state.worlds = [...$('[data-afk-worlds]').querySelectorAll('input:checked')].map(el => Number(el.dataset.afkWorld));
    } else if (t.hasAttribute('data-afk-target')) state.drop = t.value;
    else if (t.hasAttribute('data-afk-reach')) state.reach = t.checked;
    else if (t.hasAttribute('data-afk-hours')) state.hours = Number(t.value);
    else if (t.hasAttribute('data-afk-candy')) state.candy = t.checked;
    else if (t.dataset.afkMap != null) {
      state.maps = [...$('[data-afk-maps]').querySelectorAll('input:checked')].map(el => parseMapId(el.dataset.afkMap));
      const group = t.closest('.cmp-world');
      group.querySelector('[data-afk-world-count]').textContent = group.querySelectorAll('input:checked').length + ' of ' + group.querySelectorAll('input').length;
    } else if (t.dataset.cmpChar != null) {
      const chars = new Set(state.characters ?? [options.getCurrentChar()]);
      if (t.checked) chars.add(Number(t.dataset.cmpChar)); else chars.delete(Number(t.dataset.cmpChar));
      state.characters = [...chars]; options.renderLoadouts($('[data-afk-loadouts]'), state);
    } else if (t.dataset.cmpLoadout) {
      const ci = Number(t.dataset.ci);
      state.loadouts[ci] = [...$('[data-afk-loadouts]').querySelectorAll('[data-cmp-loadout]:checked')].filter(el => Number(el.dataset.ci) === ci).map(el => el.dataset.cmpLoadout);
      options.renderLoadouts($('[data-afk-loadouts]'), state);
    } else return;
    changed();
  });
  $('[data-afk-search]').addEventListener('input', event => { state.search = event.target.value; filterMaps(); persist(); });
  refresh();
  return {
    refresh,
    changed() { if (results.length) stale = 'Loadouts changed since this captured comparison.'; refresh(); renderResults(); },
    onSave(meta) {
      if (running && meta?.source !== 'auto-refresh') stop('Stopped after a new save was loaded.');
      if (results.length || running) stale = 'The save changed since this captured comparison.';
      refresh(); renderResults();
    },
  };
}
