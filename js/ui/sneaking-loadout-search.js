import { sneakingSearchFloors, sneakingItemTargetFloors } from '../stats/systems/w6/sneaking-loadout-search.js';
import { floorDropTable } from '../stats/systems/w6/sneaking-math.js';
import { NjEQ } from '../stats/data/game/custommaps.js';
import { fmtVal } from '../renderers/format.js';
import { currentMapData, currentMapDataAvailable } from '../save/data.js';

const esc = value => String(value).replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[ch]);
const name = key => ({ NjSym: 'Any Symbol', NjTrP: 'Any Pristine charm' })[key] || NjEQ[key]?.[2]?.replace(/_/g, ' ') || 'Empty';
const imageKey = key => ['NjSym', 'NjTrP'].includes(key) ? key + '0' : key;
const pct = value => (value > 0 && value < 0.0001 ? (value * 100).toPrecision(3) : (value * 100).toFixed(1)) + '%';
const targetNum = value => value > 0 && value < 0.01 ? value.toExponential(2) : fmtVal(value);
let nextPickerId = 0;

export function createSneakingLoadoutPanel({ getSave, getActiveCharIdx }) {
  let host, rawSave, worker, pickerEvents, result, stale = false, error = '', progress = 0, phase = '';
  const pickerId = 'sneaking-target-picker-' + ++nextPickerId;
  const controls = { goal: 'items', hours: 1, itemTarget: '', minimumLevel: 0, expTarget: '', evaluationLimit: 256, trials: 128, allowUnownedCharms: false };
  function stop(message = '') {
    worker?.terminate(); worker = null;
    error = message;
  }
  function status() {
    if (!host) return;
    host.querySelector('[data-loadout-status]').innerHTML = (worker ? '<progress max="1" value="' + progress + '"></progress> ' + esc(phase) : '')
      + (error ? '<p role="alert" style="color:var(--red)">' + esc(error) + '</p>' : '')
      + (stale ? '<p class="saved-model-note">Stale snapshot: save or login context changed. Run again before following these assignments.</p>' : '');
    host.querySelector('[data-loadout-run]').disabled = !!worker;
    host.querySelector('[data-loadout-cancel]').hidden = !worker;
  }
  function metric(row) {
    if (result.goal === 'items') return targetNum(row.score / result.hours) + ' targets/h';
    if (result.goal === 'door') return row.score > 0 ? fmtVal(1 / row.score) + 'h estimated clear' : 'No door progress';
    return fmtVal(row.score) + (result.goal === 'jade' ? ' Jade/h' : result.goal === 'exp' ? ' EXP/h' : ' untie progress/h');
  }
  function gear(slot, names) {
    const label = ['','Weapon','Charm slot 1','Charm slot 2'][slot.offset];
    const symbolLevel = slot.offset > 1 ? result.symbolLevels[2 * slot.idx + slot.offset - 2] || 0 : 0;
    const symbol = slot.offset > 1 ? 'Symbol +' + 50 * symbolLevel + '%' : '';
    const item = slot.item;
    const from = !item ? '' : item.hypothetical ? 'Hypothetical charm; not an owned copy' : item.source >= 60 ? 'Inventory ' + (item.source - 59)
      : (names[Math.floor((item.source - 12) / 4)] || 'Twin') + ', ' + ['hat','weapon','charm slot 1','charm slot 2'][(item.source - 12) % 4];
    const tip = label + '\n' + (item ? name(item.key) + '\nLevel ' + item.level + '\nFrom: ' + from : 'Empty')
      + (symbol ? '\n' + symbol : '');
    return '<span class="sl-gear" tabindex="0" data-sl-gear-offset="' + slot.offset + '" data-sl-symbol="' + symbolLevel
      + '" aria-label="' + esc(tip) + '" data-tip="' + esc(tip) + '"><span class="sl-gear-heading">' + label + '</span>'
      + '<span class="lo-slot' + (!item ? ' empty' : '') + (symbolLevel ? ' sym-lv' + symbolLevel : '') + '">'
      + (item ? '<img class="sneak-item-art" src="./assets/sneaking/' + encodeURIComponent(item.key) + '.png" alt="">'
        + '<span class="lo-slot-lv">+' + fmtVal(item.level) + '</span><span class="lo-slot-name">' + esc(name(item.key)) + '</span>'
        : '<span class="lo-slot-label">Empty</span>') + '</span>'
      + (symbol ? '<span class="sl-gear-meta">' + esc(symbol) + '</span>' : '')
      + (item?.hypothetical ? '<span class="sl-gear-meta">Hypothetical</span>' : '') + '</span>';
  }
  function results() {
    const target = host?.querySelector('[data-loadout-results]');
    if (!target) return;
    if (!result) { target.innerHTML = ''; return; }
    const { winner, baseline, sameFloor, names } = result;
    let html = '<h3>' + (winner === baseline || winner.label === baseline.label && winner.score === baseline.score
      ? 'Saved loadout retained' : 'Best found: ' + esc(winner.label)) + '</h3>';
    html += '<div class="sl-comparison">';
    for (const [label, row] of [['Recommendation', winner], ['Saved floors & gear', baseline], ['Best together, saved gear', sameFloor]]) {
      if (row) html += '<div><strong>' + label + '</strong><div class="n">' + metric(row) + '</div><small>' + row.freeSlots + ' free inventory slots</small></div>';
    }
    const scope = result.goal === 'door' ? 'Current locked door: Floor ' + result.floor
      : (result.goal === 'items' ? 'Target drop floors: ' : result.goal === 'untie' ? 'Accessible captive floors: ' : 'Accessible floors: ')
        + result.targetFloors.map(floor => floor ? 'Floor ' + floor : 'Training').join(', ');
    html += '</div>';
    if (result.goal === 'items') html += '<p class="saved-model-note">' + result.hours + 'h active &middot; ' + esc(name(result.itemTarget))
      + (result.minimumLevel ? ' +' + result.minimumLevel + ' or better' : '') + ' &middot; ' + pct(winner.items.chance)
      + ' chance &middot; ' + targetNum(winner.items.kept) + ' expected kept</p>';
    if (result.allowUnownedCharms) html += '<p class="saved-model-note">Hypothetical charms at max +' + fmtVal(result.hypotheticalCharmLevel) + '.</p>';
    if (result.partial.length) html += '<p class="saved-model-note">Partial: ' + result.partial.map(esc).join('; ') + '.</p>';
    let details = '<p class="saved-model-note">' + esc(scope) + '; ' + result.evaluated
      + ' distinct floor/equipment assignments. Bounded best-found search, not a global optimum.</p>';
    if (result.search) details += '<p class="saved-model-note">' + fmtVal(result.search.orderedPairs)
      + ' ordered charm pairs screened across owned weapons and accessible floors. Diverse solo, farmer/support and mixed-floor teams are measured with the full model; local shortlists are approximate.</p>';
    if (result.allowUnownedCharms) details += '<p class="saved-model-note"><strong>Hypothetical charm search:</strong> new candidates use only max-findable-level charms (+' + result.hypotheticalCharmLevel
      + ') for changed charm slots; unchanged saved charms can stay equipped. Weapons, hats, Gold inventory charms, symbols and unlocks remain save-backed. Normal duplicate and Scroll restrictions still apply; displaced owned gear must fit in inventory.</p>';
    if (result.goal === 'items') details += '<p class="saved-model-note">' + result.hours + 'h active Sneaking; '
      + esc(name(result.itemTarget)) + ' +' + result.minimumLevel + ' or better; ' + result.trials + ' fresh finalist trials. '
      + 'Chance of a retained target ' + pct(winner.items.chance) + '; mean total kept ' + targetNum(winner.items.kept)
      + (winner.items.rareEstimated ? '' : ', auto-trashed ' + fmtVal(winner.items.trashed))
      + ', blocked by full inventory ' + fmtVal(winner.items.overflow)
      + (result.manualClearUnwanted && !winner.items.rareEstimated ? ', manually cleared ' + fmtVal(winner.items.manualCleared) : '')
      + '. Target rate standard error ' + targetNum((winner.items.se || 0) / result.hours) + '/h. Rates average this captured duration, not unlimited farming. Sampled ranking, not a confidence-certified improvement.</p>';
    if (winner.items?.rareEstimated) details += '<p class="saved-model-note">Rare-target estimates integrate Pristine/Symbol rolls and finite target capacity rather than waiting for rare sample hits. Action, ordinary drop and quality rolls are sampled; daily charm-history odds, Symbol overwrites and native auto-trash still apply. Standard error covers those sampled paths.</p>';
    if (result.goal === 'items') details += '<p class="saved-model-note">Only eligible drop floors produce the target directly. Other placements are non-farming assignments retained by the bounded joint search, not extra target-drop floors; support effects apply only on the same floor. Zero successes can still mean a support wearer, but off-target twins do not support farmers on another floor.</p>';
    const groups = new Map();
    for (const twin of winner.twins) {
      const slots = winner.layout.slots.filter(slot => slot.idx === twin.idx);
      const key = JSON.stringify([twin.floor, twin.mode, result.symbolLevels.slice(2 * twin.idx, 2 * twin.idx + 2), slots.map(slot => [slot.item?.key, slot.item?.level, !!slot.item?.hypothetical])]);
      if (!groups.has(key)) groups.set(key, { twins: [], slots, floor: twin.floor, mode: twin.mode });
      groups.get(key).twins.push(twin);
    }
    html += '<div class="sl-loadouts">';
    for (const group of groups.values()) {
      html += '<div><strong>' + group.twins.map(twin => esc(names[twin.idx])).join(', ') + '</strong><p>Floor ' + group.floor
        + ' &middot; ' + esc(group.mode) + '</p><div class="sl-gear-row">' + group.slots.map(slot => gear(slot, names)).join('') + '</div>';
      for (const twin of group.twins) html += '<small>' + esc(names[twin.idx]) + ': ' + pct(twin.hitChance) + ' success/attempt; '
        + fmtVal(twin.hitsPerHour) + ' successes/h'
        + (result.goal === 'items' ? '; ' + (!result.targetFloors.includes(twin.floor) ? 'off-target floor: no direct target drops'
          : targetNum(twin.itemRate) + ' targets/h directly') : '')
        + (twin.mode === 'door' ? '; ' + (twin.doorDamage >= result.remainingHP ? 'one-shot' : fmtVal(Math.ceil(result.remainingHP / twin.doorDamage)) + ' hits needed') : '')
        + (result.goal === 'exp' && twin.expRecipient != null ? '; EXP &rarr; ' + esc(names[twin.expRecipient]) : '') + '</small>';
      html += '</div>';
    }
    html += '</div><details data-sl-search-details><summary>Search details</summary>' + details + '</details>'
      + '<details><summary>Exact equipment moves and physical copies</summary><p class="saved-model-note">Use swaps and available inventory space; do not unequip everyone at once. Hats, symbols, fixed inventory items and tied twins stay unchanged. No items are deleted to make space.</p>';
    for (const slot of winner.layout.slots) {
      const old = baseline.layout.slots.find(other => other.idx === slot.idx && other.offset === slot.offset);
      if (old?.item?.source === slot.item?.source) continue;
      html += '<p>' + esc(names[slot.idx]) + ', ' + ['','weapon','charm 1','charm 2'][slot.offset] + ': '
        + esc(name(old?.item?.key)) + ' &rarr; ' + gear(slot, names) + '</p>';
    }
    target.innerHTML = html + '</details>';
  }
  function render() {
    if (!host) return;
    pickerEvents?.abort();
    if (!document.getElementById('sneaking-loadout-style')) {
      const style = document.createElement('style'); style.id = 'sneaking-loadout-style';
      style.textContent = '.sl-controls{display:flex;flex-wrap:wrap;align-items:end;gap:10px}.sl-controls label{display:grid;gap:4px;font-size:.85em}.sl-controls input{width:85px}.sl-controls select{max-width:100%}.sl-controls [hidden],[data-loadout-cancel][hidden]{display:none}.sl-loadouts,.sl-comparison{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:8px;margin:12px 0}.sl-loadouts>div,.sl-comparison>div{background:var(--bg3);padding:10px;border-radius:6px;min-width:0;overflow-wrap:anywhere}.sl-loadouts small{display:block;color:var(--text2);margin-top:5px}';
      style.textContent += `
        .sl-gear-row{display:flex;flex-wrap:wrap;align-items:flex-start;gap:6px;margin:8px 0}
        .sl-gear{display:inline-flex;vertical-align:top;flex-direction:column;align-items:center;gap:3px;width:60px;margin:3px 0;overflow-wrap:anywhere}
        .sl-gear-heading,.sl-gear-meta{font-size:.6rem;line-height:1.2;text-align:center;color:var(--text2);max-width:100%}
        .sl-gear .lo-slot{background:#1a1510}
        .sl-gear:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:3px}
        .sl-target-control{display:grid;gap:6px;min-width:0;max-width:100%;flex:0 1 240px}
        .sl-target-control>span{font-size:.78rem;font-weight:600;color:var(--text2)}
        #main-content button[data-loadout-target-toggle]{justify-content:flex-start;min-width:0;width:100%}
        [data-loadout-target-toggle] img{width:18px;height:18px;flex-shrink:0;object-fit:contain;image-rendering:pixelated}
        [data-loadout-target-name]{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left}
        .sl-target-arrow{width:6px;height:6px;flex-shrink:0;margin:0 3px 3px 8px;border-right:2px solid var(--text2);border-bottom:2px solid var(--text2);transform:rotate(45deg)}
        .sl-target-picker{box-sizing:border-box;min-width:0;width:min(960px,calc(100vw - 24px));inset:auto;margin:0;padding:6px 8px;max-height:min(420px,calc(100dvh - 24px));overflow:auto;overscroll-behavior:contain;border:1px solid #53688f;border-radius:8px;background:var(--bg2);color:var(--text);box-shadow:0 8px 28px #0008}
        .sl-target-row{display:grid;grid-template-columns:60px minmax(0,1fr);align-items:center;gap:6px;padding:4px 0}
        .sl-target-row+.sl-target-row{border-top:1px solid #ffffff0d}
        .sl-target-floor{font-size:.8rem;color:var(--text2)}
        .sl-target-items{display:grid;grid-template-columns:repeat(var(--sl-target-columns),minmax(0,1fr));gap:4px}
        .sl-target-item{display:flex;align-items:center;gap:5px;min-width:0;min-height:38px;padding:4px 6px;border:1px solid #4b5c7e;border-radius:5px;background:#141d34;color:var(--text);font:inherit;font-size:.78rem;text-align:left;overflow-wrap:anywhere;cursor:pointer}
        .sl-target-item img{width:18px;height:18px;flex-shrink:0;object-fit:contain;image-rendering:pixelated}
        .sl-target-item:hover{background:#263957;border-color:#92a8ce}
        .sl-target-item[aria-pressed="true"],.sl-target-item[aria-pressed="true"]:hover{background:#472438;border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent)}
        @media(max-width:1000px){.sl-target-items{grid-template-columns:repeat(4,minmax(0,1fr))}}
        @media(max-width:600px){.sl-target-control{flex:1 1 180px}.sl-target-row{grid-template-columns:50px minmax(0,1fr)}.sl-target-items{grid-template-columns:repeat(2,minmax(0,1fr))}}
      `;
      document.head.append(style);
    }
    const S = getSave(), floors = sneakingSearchFloors(S), names = S.charNames || [];
    const drops = new Map(floors.map(floor => [floor, floorDropTable(floor, Number(S.olaData?.[231]) || 0, S).filter(row => row.chance > 0)]));
    const specialGroups = [
      { label: 'Symbols', keys: ['NjSym'].filter(key => sneakingItemTargetFloors(S, key).length) },
      { label: 'Pristine', keys: ['NjTrP'].filter(key => sneakingItemTargetFloors(S, key).length) },
    ].filter(group => group.keys.length);
    const items = [...new Set([...drops.values()].flatMap(rows => rows.map(row => row.key)))];
    items.push(...specialGroups.flatMap(group => group.keys));
    if (!items.includes(controls.itemTarget)) controls.itemTarget = items.find(key => Number(NjEQ[key]?.[0]) === 2) || items[0] || '';
    host.innerHTML = '<div class="section"><h2>Goal-specific loadout search</h2><div class="sl-controls">'
      + '<label>Goal<select data-loadout-control="goal">' + [['items','Target item'],['door','Door: time to lethal hit'],['jade','Jade'],['exp','Sneaking EXP'],['untie','Untie']].map(([value,label]) => '<option value="' + value + '"' + (controls.goal === value ? ' selected' : '') + '>' + label + '</option>').join('')
      + '</select></label><div class="sl-target-control" data-sl-items' + (controls.goal !== 'items' ? ' hidden' : '') + '><span>Target item</span><button type="button" data-loadout-target-toggle popovertarget="' + pickerId + '" aria-haspopup="dialog" aria-controls="' + pickerId + '" aria-expanded="false" aria-label="' + esc('Target item: ' + name(controls.itemTarget)) + '"><img data-loadout-target-icon src="./assets/sneaking/' + encodeURIComponent(imageKey(controls.itemTarget)) + '.png" alt="" aria-hidden="true"><span data-loadout-target-name>' + esc(name(controls.itemTarget)) + '</span><span class="sl-target-arrow" aria-hidden="true"></span></button></div>'
      + '<label data-sl-items data-sl-minimum' + (controls.goal !== 'items' || controls.itemTarget.startsWith('NjSym') ? ' hidden' : '') + '>Minimum level<input type="number" min="0" step="1" value="' + controls.minimumLevel + '" data-loadout-control="minimumLevel"></label>'
      + '<label data-sl-exp' + (controls.goal !== 'exp' ? ' hidden' : '') + '>EXP recipient<select data-loadout-control="expTarget"><option value="">All twins</option>' + names.map((value,i) => '<option value="' + i + '"' + (String(controls.expTarget) === String(i) ? ' selected' : '') + '>' + esc(value) + '</option>').join('')
      + '</select></label><label class="check-control"><input type="checkbox" data-loadout-control="allowUnownedCharms"' + (controls.allowUnownedCharms ? ' checked' : '') + '>Any charms at max findable level</label>'
      + '<button type="button" data-loadout-run>' + (controls.allowUnownedCharms ? 'Search hypothetical charms' : 'Search owned gear') + '</button><button type="button" data-loadout-cancel hidden>Cancel</button></div>'
      + '<div id="' + pickerId + '" class="sl-target-picker" popover="auto" role="dialog" aria-label="Choose target item" data-sl-items' + (controls.goal !== 'items' ? ' hidden' : '') + ' style="--sl-target-columns:' + Math.max(1, ...[...drops.values()].map(rows => rows.length)) + '">'
      + floors.map(floor => {
        const label = floor ? 'Floor ' + floor : 'Training';
        return '<div class="sl-target-row" data-loadout-floor="' + floor + '" role="group" aria-label="' + label + '"><strong class="sl-target-floor">' + label + '</strong><div class="sl-target-items">'
          + drops.get(floor).map(({ key }) => '<button type="button" class="sl-target-item" data-loadout-item="' + esc(key) + '" aria-pressed="' + (controls.itemTarget === key) + '" aria-label="' + esc(name(key) + ', ' + label) + '"><img src="./assets/sneaking/' + encodeURIComponent(key) + '.png" alt="" aria-hidden="true"><span>' + esc(name(key)) + '</span></button>').join('')
          + '</div></div>';
      }).join('') + specialGroups.map(group => '<div class="sl-target-row" role="group" aria-label="' + group.label + '"><strong class="sl-target-floor">' + group.label
        + '</strong><div class="sl-target-items">' + group.keys.map(key => '<button type="button" class="sl-target-item" data-loadout-item="' + esc(key)
          + '" aria-pressed="' + (controls.itemTarget === key) + '" aria-label="' + esc(name(key) + ', all eligible charm-drop floors')
          + '"><img src="./assets/sneaking/' + encodeURIComponent(imageKey(key)) + '.png" alt="" aria-hidden="true"><span>' + esc(name(key)) + '</span></button>').join('')
        + '</div></div>').join('') + '</div>'
      + '<p class="saved-model-note">Active Sneaking with the menu open. Floors and gear are chosen automatically.</p>'
      + '<p class="saved-model-note" data-sl-items' + (controls.goal !== 'items' ? ' hidden' : '') + '>Trash new unwanted drops while farming; a full bag blocks finds.</p>'
      + '<details><summary>Advanced</summary><p class="saved-model-note">Best-found search, not exhaustive. Saved gear is preserved; hypothetical mode changes charm choices only. Rates hold bonuses fixed. Flowers use the separate simulator.</p>'
      + '<div class="sl-controls"><label data-sl-items' + (controls.goal !== 'items' ? ' hidden' : '') + '>Active simulation hours<input type="number" min=".01" max="168" step="any" value="' + controls.hours + '" data-loadout-control="hours"></label><label>Assignment budget<input type="number" min="16" max="2048" step="1" data-loadout-control="evaluationLimit" value="' + controls.evaluationLimit + '"></label><label>Final item trials<input type="number" min="16" max="512" step="1" data-loadout-control="trials" value="' + controls.trials + '"></label></div></details>'
      + '<div data-loadout-status aria-live="polite"></div><div data-loadout-results></div></div>';
    const picker = host.querySelector('.sl-target-picker'), toggle = host.querySelector('[data-loadout-target-toggle]');
    function positionPicker() {
      const rect = toggle.getBoundingClientRect(), width = Math.min(960, innerWidth - 24);
      const below = Math.max(0, innerHeight - rect.bottom - 18), above = Math.max(0, rect.top - 18);
      const down = below >= 260 || below >= above;
      picker.style.left = Math.max(12, Math.min(rect.left, innerWidth - width - 12)) + 'px';
      picker.style.top = down ? rect.bottom + 6 + 'px' : 'auto';
      picker.style.bottom = down ? 'auto' : innerHeight - rect.top + 6 + 'px';
      picker.style.maxHeight = Math.min(420, down ? below : above) + 'px';
    }
    picker.addEventListener('beforetoggle', event => {
      const open = event.newState === 'open';
      toggle.setAttribute('aria-expanded', String(open));
      pickerEvents?.abort();
      if (open) {
        positionPicker();
        pickerEvents = new AbortController();
        window.addEventListener('resize', positionPicker, { signal: pickerEvents.signal });
        window.addEventListener('scroll', positionPicker, { capture: true, signal: pickerEvents.signal });
      }
    });
    picker.addEventListener('toggle', event => {
      if (event.newState === 'open' && picker.matches(':popover-open')) {
        picker.querySelector('[aria-pressed="true"]')?.focus({ preventScroll: true });
        picker.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest' });
      }
    });
    function closePicker() {
      if (picker.matches(':popover-open')) picker.hidePopover();
      toggle.focus({ preventScroll: true });
    }
    host.onchange = event => {
      const key = event.target.dataset.loadoutControl;
      if (!key) return;
      stop(); result = null; stale = false;
      controls[key] = event.target.type === 'checkbox' ? event.target.checked
        : ['goal','expTarget'].includes(key) ? event.target.value : Number(event.target.value);
      host.querySelector('[data-loadout-run]').textContent = controls.allowUnownedCharms ? 'Search hypothetical charms' : 'Search owned gear';
      if (key === 'goal') render();
      else { status(); results(); }
    };
    host.onclick = event => {
      const item = event.target.closest('[data-loadout-item]');
      if (item) {
        if (controls.itemTarget === item.dataset.loadoutItem) { closePicker(); return; }
        stop(); result = null; stale = false;
        controls.itemTarget = item.dataset.loadoutItem;
        for (const button of host.querySelectorAll('[data-loadout-item]')) button.setAttribute('aria-pressed', String(button.dataset.loadoutItem === controls.itemTarget));
        host.querySelector('[data-loadout-target-name]').textContent = name(controls.itemTarget);
        host.querySelector('[data-loadout-target-icon]').src = './assets/sneaking/' + encodeURIComponent(imageKey(controls.itemTarget)) + '.png';
        host.querySelector('[data-sl-minimum]').hidden = controls.itemTarget.startsWith('NjSym');
        toggle.setAttribute('aria-label', 'Target item: ' + name(controls.itemTarget));
        closePicker();
        status(); results(); return;
      }
      if (event.target.closest('[data-loadout-cancel]')) { stop('Cancelled; no recommendation produced.'); status(); return; }
      if (!event.target.closest('[data-loadout-run]')) return;
      stop(); result = null; stale = false; progress = 0; phase = 'Preparing captured save'; results();
      try {
        if ([...host.querySelectorAll('input')].some(input => !input.closest('[hidden]') && !input.reportValidity())) throw new Error('Correct the search controls before running.');
        if (!rawSave) throw new Error('Load a save first.');
        const activeCharIdx = getActiveCharIdx();
        if (!currentMapDataAvailable[activeCharIdx]) throw new Error('Saved login location is unavailable; load a complete save.');
        worker = new Worker(new URL('../workers/sneaking-loadout-worker.js', import.meta.url), { type: 'module' });
        const current = worker;
        worker.onmessage = ({ data }) => {
          if (worker !== current) return;
          try {
            if (data.type === 'progress') {
              progress = Math.max(progress, Math.min(1, data.progress.completed / data.progress.total)); phase = data.progress.phase;
            } else if (data.type === 'done') {
              if (!data.result?.winner || !Number.isFinite(data.result.winner.score)) throw new Error('Search worker returned no valid result');
              result = data.result; stop(); results();
            } else if (data.type === 'error') throw new Error(data.message);
            status();
          } catch (failure) { stop(failure.message || String(failure)); result = null; status(); results(); }
        };
        worker.onerror = event => { stop('Loadout worker failed: ' + event.message); status(); };
        worker.onmessageerror = () => { stop('Loadout worker response could not be decoded.'); status(); };
        worker.postMessage({ rawSave, options: { ...controls, minimumLevel: controls.itemTarget.startsWith('NjSym') ? 0 : controls.minimumLevel,
          expTarget: controls.expTarget === '' ? null : Number(controls.expTarget),
          manualClearUnwanted: true,
          activeCharIdx, activeTown: Number(currentMapData[activeCharIdx]) === 250,
          seed: crypto.getRandomValues(new Uint32Array(1))[0] } });
      } catch (failure) { stop(failure.message || String(failure)); }
      status();
    };
    status(); results();
  }
  return {
    mount(target) { host = target; render(); },
    load(raw, metadata) {
      rawSave = raw;
      if (metadata?.source === 'auto-refresh') stale = !!worker || !!result;
      else { stop(); result = null; stale = false; }
    },
    contextChanged() { stop(); stale = !!result; status(); },
  };
}
