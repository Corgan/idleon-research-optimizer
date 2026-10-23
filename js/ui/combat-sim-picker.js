// ===== COMBAT SIM SETUP: ICONS, TOOLTIPS, POPOVER PICKER =====
// Shared DOM helpers for the combat-sim Setup editor.
//
// Icon/geometry contract: assets/combat-sim/ui/manifest.json (written by the
// cs-assets extractor). Every system entry may be any of:
//   "talents": [0, 1, 5]                                   ids -> ui/talents/<id>.png
//   "talents": { "dir": "talents", "ext": "png", "ids": [...] }
//   "talents": { "files": { "0": "talents/0.png" } }        explicit file per id
//   "talents": { "icons": { "0": { "file": "talents/0.png", "w": 56, "h": 56 } } }
// plus optional per-system "frames" { name: file } and "layout"/"layouts"
// geometry objects, or top-level "frames"/"layouts" maps keyed by system.
// File strings containing "/" resolve against assets/combat-sim/ui/, bare file
// names against the system dir, and "assets/..." against the repo root.
// Until a file is listed, icons fall back to the existing drop-table art
// (assets/combat-sim/metadata.json "items/<key>.png") and then a text tile.

import { ITEMS } from '../stats/data/game/items.js';
import { formatUq, statLabel, slotsLeft } from '../stats/systems/common/combat-sim-stones.js';

const REPO_BASE = new URL('../../', import.meta.url).href;
const UI_BASE = REPO_BASE + 'assets/combat-sim/ui/';
const LEGACY_BASE = REPO_BASE + 'assets/combat-sim/';

const SYSTEM_ALIASES = {
  items: ['items', 'item', 'equipment'], talents: ['talents', 'talent'], cards: ['cards', 'card'], chips: ['chips', 'labChips', 'lab'],
  starSigns: ['starSigns', 'starsigns', 'signs'], prayers: ['prayers', 'prayer'], bubbles: ['bubbles', 'alchemy'], vials: ['vials'],
  statues: ['statues', 'statue'], stamps: ['stamps', 'stamp'], companions: ['companions', 'pets'], classes: ['classes', 'classIcons'],
  obols: ['obols'], food: ['food'], frames: ['frames', 'ui'],
};

let _manifest = null;
let _legacyItems = null;
let _loading = null;
const _listeners = new Set();
const _index = {};

function _resolveFile(file, dir) {
  if (file == null) return null;
  const f = String(typeof file === 'object' ? (file.file || file.path || file.src || '') : file);
  if (!f) return null;
  if (/^(https?:|data:|\/)/.test(f)) return f;
  if (/^assets\//.test(f)) return REPO_BASE + f;
  if (f.indexOf('/') >= 0) return UI_BASE + f;
  return UI_BASE + (dir ? dir.replace(/\/$/, '') + '/' : '') + f;
}

function _systemEntry(system) {
  if (!_manifest) return null;
  const names = SYSTEM_ALIASES[system] || [system];
  for (const n of names) {
    if (_manifest[n] != null) return { name: n, entry: _manifest[n] };
    if (_manifest.systems && _manifest.systems[n] != null) return { name: n, entry: _manifest.systems[n] };
  }
  return null;
}

// Explicit adapters for the cs-assets manifest layout (manifest.systems.<sys>.icons.<family>).
const _sysIcons = (sys, fam) => m => (m.systems && m.systems[sys] && m.systems[sys].icons && m.systems[sys].icons[fam]) || null;
const ICON_SOURCES = {
  items: m => (Array.isArray(m.items) ? Object.fromEntries(m.items.map(k => [k, 'items/' + k + '.png'])) : null),
  talents: m => {
    if (!Array.isArray(m.talents)) return null;
    const o = Object.fromEntries(m.talents.map(k => [k, 'talents/' + k + '.png']));
    return Object.assign(o, m.talentSpecial || {});
  },
  cards: _sysIcons('cards', 'art'),
  chips: _sysIcons('lab', 'chips'),
  jewels: _sysIcons('lab', 'jewels'),
  mainframe: _sysIcons('lab', 'mainframe'),
  prayers: _sysIcons('prayers', 'icon'),
  prayersSmall: _sysIcons('prayers', 'small'),
  statues: _sysIcons('statues', 'normal'),
  statuesGold: _sysIcons('statues', 'gold'),
  statuesOnyx: _sysIcons('statues', 'onyx'),
  statuesZenith: _sysIcons('statues', 'zenith'),
  vials: _sysIcons('alchemy', 'vials'),
  sigils: _sysIcons('alchemy', 'sigils'),
  classes: _sysIcons('talentBook', 'classIcons'),
  gods: _sysIcons('divinity', 'gods'),
  meals: _sysIcons('meals', 'meals'),
  stamps: _sysIcons('stamps', 'stamps'),
  plates: _sysIcons('meals', 'plates'),
  atoms: _sysIcons('account', 'atoms'),
  vault: _sysIcons('account', 'vault'),
  arcane: _sysIcons('account', 'arcane'),
  grimoire: _sysIcons('account', 'grimoire'),
  legendTalents: _sysIcons('account', 'legendTalents'),
  guild: _sysIcons('account', 'guild'),
  construction: _sysIcons('account', 'construction'),
  bribes: _sysIcons('account', 'bribes'),
  dreams: _sysIcons('account', 'dreams'),
  saltLick: _sysIcons('account', 'saltLick'),
  bubbles: m => {
    const ic = m.systems && m.systems.alchemy && m.systems.alchemy.icons;
    if (!ic) return null;
    const o = {};
    'abcd'.split('').forEach((L, c) => { const fam = ic['bubbles' + c] || {}; Object.keys(fam).forEach(i => { o[L + i] = fam[i]; }); });
    return o;
  },
};

/** Companion sprite-sheet entry {file,across,down,fw,fh} (frame 0 is idle), or null. */
export function companionSheet(id) {
  const s = _manifest && _manifest.systems && _manifest.systems.companions && _manifest.systems.companions.sheets;
  return (s && s[String(id)]) || null;
}

function _buildIndex(system) {
  if (_index[system]) return _index[system];
  const out = new Map();
  const adapter = _manifest && ICON_SOURCES[system] && ICON_SOURCES[system](_manifest);
  if (adapter) {
    Object.keys(adapter).forEach(k => { const u = _resolveFile(adapter[k]); if (u) out.set(String(k), u); });
    _index[system] = out;
    return out;
  }
  const found = _systemEntry(system);
  if (found) {
    const e = found.entry;
    if (Array.isArray(e)) e.forEach(id => out.set(String(id), _resolveFile(String(id) + '.png', found.name)));
    else if (e && typeof e === 'object') {
      const dir = e.dir || e.path || found.name;
      const ext = e.ext || 'png';
      const ids = Array.isArray(e.ids) ? e.ids : Array.isArray(e.keys) ? e.keys : Array.isArray(e.icons) ? e.icons : null;
      if (ids) ids.forEach(id => {
        if (id && typeof id === 'object') { const k = id.id != null ? id.id : id.key; if (k != null) out.set(String(k), _resolveFile(id.file || (k + '.' + ext), dir)); }
        else out.set(String(id), _resolveFile(String(id) + '.' + ext, dir));
      });
      const map = (e.files && typeof e.files === 'object' && !Array.isArray(e.files)) ? e.files
        : (e.icons && typeof e.icons === 'object' && !Array.isArray(e.icons)) ? e.icons
          : (e.sprites && typeof e.sprites === 'object' && !Array.isArray(e.sprites)) ? e.sprites : null;
      if (map) Object.keys(map).forEach(k => { const u = _resolveFile(map[k], dir); if (u) out.set(String(k), u); });
    }
  }
  _index[system] = out;
  return out;
}

/** Load the UI manifest (once). Resolves to the manifest or null. */
export function loadUiAssets() {
  if (_loading) return _loading;
  if (typeof fetch !== 'function') { _loading = Promise.resolve(null); return _loading; }
  const getJson = url => fetch(url, { cache: 'no-cache' }).then(r => (r.ok ? r.json() : null)).catch(() => null);
  _loading = Promise.all([getJson(UI_BASE + 'manifest.json'), getJson(LEGACY_BASE + 'metadata.json')]).then(([m, legacy]) => {
    _manifest = m && typeof m === 'object' ? m : null;
    _legacyItems = new Set();
    if (legacy && legacy.files) Object.keys(legacy.files).forEach(f => { const mm = /^items\/(.+)\.png$/.exec(f); if (mm) _legacyItems.add(mm[1]); });
    Object.keys(_index).forEach(k => delete _index[k]);
    _listeners.forEach(fn => { try { fn(_manifest); } catch (e) { console.error(e); } });
    return _manifest;
  });
  return _loading;
}
export function onUiAssets(fn) { _listeners.add(fn); return () => _listeners.delete(fn); }
export function uiManifest() { return _manifest; }

/** Geometry for a system from the manifest, e.g. systemLayout('talents', 'book'). */
export function systemLayout(system, name) {
  if (!_manifest) return null;
  const found = _systemEntry(system);
  const local = found && found.entry && !Array.isArray(found.entry) ? (found.entry.layout || found.entry.layouts || found.entry.geometry) : null;
  const top = _manifest.layouts && (_manifest.layouts[system] || (found && _manifest.layouts[found.name]));
  const src = local || top;
  if (!src) return null;
  return name ? (src[name] != null ? src[name] : null) : src;
}

/** Frame/background sprite URL: manifest.frames[name] or manifest[system].frames[name]. */
export function frameUrl(system, name) {
  if (!_manifest) return null;
  const found = _systemEntry(system);
  const local = found && found.entry && !Array.isArray(found.entry) && found.entry.frames;
  if (local && local[name] != null) return _resolveFile(local[name], found.entry.dir || found.name);
  const top = _manifest.frames;
  if (top) {
    if (top[system] && typeof top[system] === 'object' && top[system][name] != null) return _resolveFile(top[system][name], system);
    if (top[name] != null && typeof top[name] !== 'object') return _resolveFile(top[name], 'frames');
  }
  return null;
}

export function iconUrl(system, id) {
  if (id == null || id === '' || id === 'Blank' || id === 'Null' || id === 'B') return null;
  const u = _buildIndex(system).get(String(id));
  if (u) return u;
  if ((system === 'items' || system === 'obols' || system === 'food') && system !== 'items') {
    const v = _buildIndex('items').get(String(id));
    if (v) return v;
  }
  if ((system === 'items' || system === 'obols' || system === 'food') && _legacyItems && _legacyItems.has(String(id))) return LEGACY_BASE + 'items/' + encodeURIComponent(String(id)) + '.png';
  return null;
}

export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
export function gameText(s) { return String(s == null ? '' : s).replace(/\|/g, ' ').replace(/_/g, ' ').replace(/\s+/g, ' ').trim(); }

function _abbr(label) {
  const words = gameText(label).replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  if (words.length === 1) return words[0].slice(0, 3);
  return words.slice(0, 3).map(w => w[0]).join('').toUpperCase();
}
function _hue(s) { let h = 0; const t = String(s); for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0; return Math.abs(h) % 360; }

/** Icon element: manifest art, legacy drop art, or a colored text tile. */
export function iconHtml(system, id, label, opts) {
  opts = opts || {};
  const size = opts.size || 36;
  const cls = 'css-setup-ico' + (opts.cls ? ' ' + opts.cls : '');
  const style = 'width:' + size + 'px;height:' + size + 'px;';
  const url = iconUrl(system, id);
  if (!url && system === 'companions') {
    const sh = companionSheet(id);
    if (sh && sh.file && sh.fw && sh.fh) {
      const k = size / Math.max(sh.fw, sh.fh);
      const bw = Math.round(sh.fw * k), bh = Math.round(sh.fh * k);
      return '<span class="' + cls + '" style="' + style + '"><span class="css-setup-sheet" style="width:' + bw + 'px;height:' + bh + 'px;background-image:url(&quot;' + esc(_resolveFile(sh.file)) + '&quot;);background-size:' + Math.round(sh.across * sh.fw * k) + 'px auto"></span></span>';
    }
  }
  if (url) return '<span class="' + cls + '" style="' + style + '"><img src="' + esc(url) + '" alt="" draggable="false" loading="lazy" data-ico-fallback="' + esc(_abbr(label || id)) + '"></span>';
  if (id == null || id === '' || id === 'Blank' || id === 'Null' || id === 'B' || id === -1 || id === '-1' || id === '_' || id === 0 && opts.zeroEmpty) return '<span class="' + cls + ' css-setup-ico-empty" style="' + style + '"></span>';
  const hue = _hue(system + ':' + id);
  return '<span class="' + cls + ' css-setup-ico-txt" style="' + style + 'font-size:' + Math.max(9, Math.round(size / 3.4)) + 'px;background:hsl(' + hue + ',45%,26%);border-color:hsl(' + hue + ',55%,45%)">' + esc(_abbr(label || id)) + '</span>';
}

/** Replace broken <img> icons with text tiles (install once per root). */
export function installIconFallback(root) {
  root.addEventListener('error', e => {
    const img = e.target;
    if (!img || img.tagName !== 'IMG' || !img.hasAttribute('data-ico-fallback')) return;
    const span = img.parentNode;
    if (!span) return;
    span.classList.add('css-setup-ico-txt');
    span.textContent = img.getAttribute('data-ico-fallback');
  }, true);
}

// ----- tooltip ---------------------------------------------------------------
let _tip = null;
function _tipEl() {
  if (_tip && document.body.contains(_tip)) return _tip;
  _tip = document.getElementById('css-setup-tip');
  if (!_tip) {
    _tip = document.createElement('div');
    _tip.id = 'css-setup-tip';
    _tip.className = 'css-setup-tip';
    document.body.appendChild(_tip);
  }
  return _tip;
}
/** Show a positioned tooltip next to `anchor`. `html` must already be escaped. */
export function showTip(anchor, html) {
  const tip = _tipEl();
  tip.innerHTML = html;
  tip.style.display = 'block';
  const r = anchor.getBoundingClientRect();
  const w = tip.offsetWidth, h = tip.offsetHeight;
  let x = r.right + 8, y = r.top - 4;
  if (x + w > window.innerWidth - 8) x = Math.max(8, r.left - w - 8);
  if (y + h > window.innerHeight - 8) y = Math.max(8, window.innerHeight - h - 8);
  tip.style.left = x + 'px';
  tip.style.top = y + 'px';
}
export function hideTip() { if (_tip) _tip.style.display = 'none'; }

// ----- item card --------------------------------------------------------------
const CARD_STATS = ['Weapon_Power', 'STR', 'AGI', 'WIS', 'LUK', 'Defence', 'Speed', 'Reach'];
function _n(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function _fmt(v) { const n = _n(v); return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100); }
function _signed(v) { const n = _n(v); return (n >= 0 ? '+' : '') + _fmt(n); }

/**
 * Item tooltip card. `inst` (optional) describes an equipped instance:
 * { added: {stat: delta}, stones: [{name, failed}], slotsLeft, slotsTotal, unattributed: {stat: delta} }.
 */
export function itemCardHtml(key, inst) {
  const def = ITEMS[key];
  if (!def) return '<div class="css-setup-card"><b>' + esc(key == null || key === 'Blank' ? '(empty)' : key) + '</b></div>';
  const lines = [];
  lines.push('<div class="css-setup-card-name">' + String(def.displayName || key).split('|').map(s => esc(gameText(s))).join('<br>') + '</div>');
  const meta = [gameText(def.Type || def.typeGen || '')];
  if (def.Class && def.Class !== 'ALL') meta.push(gameText(def.Class));
  if (_n(def.lvReqToEquip) > 0) meta.push('Lv ' + _n(def.lvReqToEquip));
  lines.push('<div class="css-setup-card-meta">' + esc(meta.filter(Boolean).join(' \u00b7 ')) + '</div>');
  if (def._type === 'equip' || def.Weapon_Power != null) {
    const added = (inst && inst.added) || {};
    let rows = '';
    CARD_STATS.forEach(s => {
      const b = _n(def[s]), a = _n(added[s]);
      if (!b && !a) return;
      rows += '<tr><td>' + esc(statLabel(s)) + '</td><td>' + _fmt(b) + '</td>' + (inst ? '<td class="' + (a ? (a > 0 ? 'css-setup-pos' : 'css-setup-neg') : '') + '">' + (a ? _signed(a) : '') + '</td><td><b>' + _fmt(b + a) + '</b></td>' : '') + '</tr>';
    });
    if (rows) lines.push('<table class="css-setup-card-stats">' + (inst ? '<tr><th></th><th>base</th><th>added</th><th>total</th></tr>' : '') + rows + '</table>');
    [1, 2].forEach(n => {
      const txtA = inst && added['UQ' + n + 'txt'];
      const txt = txtA && txtA !== '0' && txtA !== 0 ? txtA : def['UQ' + n + 'txt'];
      if (!txt || txt === '0') return;
      const bv = txtA && txtA !== def['UQ' + n + 'txt'] ? 0 : _n(def['UQ' + n + 'val']);
      const av = _n(added['UQ' + n + 'val']);
      lines.push('<div class="css-setup-card-uq">' + esc(formatUq(txt, bv + av)) + (inst && av ? ' <span class="css-setup-muted">(' + _fmt(bv) + ' base ' + _signed(av) + ')</span>' : '') + '</div>');
    });
    const total = _n(def.Upgrade_Slots_Left);
    if (inst) lines.push('<div class="css-setup-card-meta">Upgrade slots: ' + _fmt(slotsLeft(key, added)) + ' remaining (' + _fmt(total) + ' base slots)</div>');
    else if (total) lines.push('<div class="css-setup-card-meta">Upgrade slots: ' + _fmt(total) + '</div>');
    if (inst && inst.stones && inst.stones.length) lines.push('<div class="css-setup-card-meta">Stones: ' + inst.stones.map(s => esc(s.name) + (s.failed ? ' (failed)' : '')).join(', ') + '</div>');
    if (inst && inst.unattributed) {
      const u = Object.keys(inst.unattributed).filter(k => k !== 'Upgrade_Slots_Left' && _n(inst.unattributed[k]) && !/txt$/.test(k)).map(k => statLabel(k) + ' ' + _signed(inst.unattributed[k]));
      if (u.length) lines.push('<div class="css-setup-card-meta">Unattributed: ' + esc(u.join(', ')) + '</div>');
    }
  } else {
    const desc = [];
    for (let i = 1; i <= 8; i++) {
      const d = def['desc_line' + i];
      if (d && d !== 'Filler') desc.push(gameText(String(d).replace(/\[/g, _fmt(def.Amount))));
    }
    if (desc.length) lines.push('<div class="css-setup-card-desc">' + esc(desc.join(' ')) + '</div>');
  }
  lines.push('<div class="css-setup-card-key">' + esc(key) + '</div>');
  return '<div class="css-setup-card">' + lines.join('') + '</div>';
}

// ----- popover picker --------------------------------------------------------
let _open = null;

export function closePicker(restoreFocus) {
  if (!_open) return;
  const o = _open;
  _open = null;
  hideTip();
  document.removeEventListener('mousedown', o.outside, true);
  window.removeEventListener('resize', o.place);
  if (o.el.parentNode) o.el.parentNode.removeChild(o.el);
  if (restoreFocus && o.anchor && document.body.contains(o.anchor)) { try { o.anchor.focus(); } catch (e) { /* detached */ } }
  if (o.onClose) try { o.onClose(); } catch (e) { console.error(e); }
}
export function pickerOpen() { return !!_open; }

/**
 * Open a popover next to `anchor`.
 * opts: { title, items: [{ key, name, icon (html), sub, cat, search, disabled }], categories: [{id,label}],
 *         toggles: [{ id, label, checked, test(item) }], current, onPick(key, item), tipFor(item) -> html,
 *         emptyLabel (adds a "clear" tile), limit, onClose, wide }
 */
export function openPicker(anchor, opts) {
  closePicker(false);
  const o = { anchor, opts, cat: 'all', query: opts.query || '', active: 0, shown: [], toggles: {} };
  (opts.toggles || []).forEach(t => { o.toggles[t.id] = !!t.checked; });
  const el = document.createElement('div');
  el.className = 'css-setup-pop' + (opts.wide ? ' css-setup-pop-wide' : '');
  el.setAttribute('role', 'dialog');
  el.innerHTML = '<div class="css-setup-pop-head"><b>' + esc(opts.title || 'Pick') + '</b><button type="button" data-pop="close" aria-label="Close">\u00d7</button></div>' +
    '<input type="search" class="css-setup-pop-q" placeholder="Search\u2026" aria-label="Search">' +
    '<div class="css-setup-pop-cats"></div><div class="css-setup-pop-grid" role="listbox" tabindex="-1"></div><div class="css-setup-pop-foot"></div>';
  document.body.appendChild(el);
  o.el = el;
  const q = el.querySelector('.css-setup-pop-q');
  q.value = o.query;
  const grid = el.querySelector('.css-setup-pop-grid');
  const cats = el.querySelector('.css-setup-pop-cats');
  const foot = el.querySelector('.css-setup-pop-foot');
  const limit = opts.limit || 400;

  function drawCats() {
    let h = '';
    if (opts.categories && opts.categories.length) {
      h += [{ id: 'all', label: 'All' }].concat(opts.categories).map(c => '<button type="button" data-cat="' + esc(c.id) + '" class="' + (o.cat === c.id ? 'css-setup-on' : '') + '">' + esc(c.label) + '</button>').join('');
    }
    (opts.toggles || []).forEach(t => { h += '<label class="css-setup-check"><input type="checkbox" data-tog="' + esc(t.id) + '"' + (o.toggles[t.id] ? ' checked' : '') + '>' + esc(t.label) + '</label>'; });
    cats.innerHTML = h;
    cats.style.display = h ? '' : 'none';
  }
  function filter() {
    const words = o.query.toLowerCase().split(/\s+/).filter(Boolean);
    const out = [];
    if (opts.emptyLabel) out.push({ key: null, name: opts.emptyLabel, icon: '<span class="css-setup-ico css-setup-ico-empty" style="width:36px;height:36px"></span>', clear: true });
    (opts.items || []).forEach(it => {
      if (o.cat !== 'all' && it.cat !== o.cat && !(Array.isArray(it.cat) && it.cat.indexOf(o.cat) >= 0)) return;
      for (const t of (opts.toggles || [])) if (o.toggles[t.id] && !t.test(it)) return;
      if (words.length) {
        const hay = (it.search || (it.name + ' ' + it.key + ' ' + (it.sub || ''))).toLowerCase();
        for (const w of words) if (hay.indexOf(w) < 0) return;
      }
      out.push(it);
    });
    return out;
  }
  function draw() {
    const all = filter();
    o.shown = all.slice(0, limit);
    if (o.active >= o.shown.length) o.active = Math.max(0, o.shown.length - 1);
    grid.innerHTML = o.shown.map((it, i) => '<div class="css-setup-pop-item' + (i === o.active ? ' css-setup-act' : '') + (it.clear ? ' css-setup-pop-clear' : '') +
      (opts.current != null && String(opts.current) === String(it.key) ? ' css-setup-cur' : '') + (it.disabled ? ' css-setup-dis' : '') + '" role="option" data-i="' + i + '" id="css-setup-pop-o' + i + '">' +
      (it.icon || (opts.iconFor && !it.clear ? opts.iconFor(it) : '') || '') + '<span class="css-setup-pop-name">' + esc(it.name) + (it.sub ? '<small>' + esc(it.sub) + '</small>' : '') + '</span></div>').join('') ||
      '<div class="css-setup-muted" style="padding:8px">No matches</div>';
    foot.textContent = all.length > o.shown.length ? 'Showing ' + o.shown.length + ' of ' + all.length + ' \u2014 type to narrow' : all.length + ' option' + (all.length === 1 ? '' : 's');
    grid.setAttribute('aria-activedescendant', 'css-setup-pop-o' + o.active);
  }
  function setActive(i, scroll) {
    if (!o.shown.length) return;
    o.active = Math.max(0, Math.min(o.shown.length - 1, i));
    grid.querySelectorAll('.css-setup-act').forEach(n => n.classList.remove('css-setup-act'));
    const n = grid.querySelector('[data-i="' + o.active + '"]');
    if (n) {
      n.classList.add('css-setup-act');
      if (scroll) n.scrollIntoView({ block: 'nearest' });
      grid.setAttribute('aria-activedescendant', n.id);
      if (opts.tipFor && !o.shown[o.active].clear) { const html = opts.tipFor(o.shown[o.active]); if (html) showTip(n, html); else hideTip(); }
    }
  }
  function cols() {
    const items = grid.querySelectorAll('.css-setup-pop-item');
    if (items.length < 2) return 1;
    const top = items[0].offsetTop;
    let c = 0;
    for (const it of items) { if (it.offsetTop !== top) break; c++; }
    return Math.max(1, c);
  }
  function pick(i) {
    const it = o.shown[i];
    if (!it || it.disabled) return;
    const cb = opts.onPick;
    closePicker(true);
    if (cb) cb(it.clear ? null : it.key, it);
  }
  o.place = function place() {
    const r = anchor.getBoundingClientRect();
    const w = el.offsetWidth, h = el.offsetHeight;
    let x = r.left, y = r.bottom + 4;
    if (x + w > window.innerWidth - 8) x = Math.max(8, window.innerWidth - w - 8);
    if (y + h > window.innerHeight - 8) y = Math.max(8, r.top - h - 4);
    if (y < 8) y = 8;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
  };
  o.outside = function (e) { if (!el.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) closePicker(false); };
  o.onClose = opts.onClose;

  q.addEventListener('input', () => { o.query = q.value; o.active = 0; draw(); hideTip(); });
  q.addEventListener('keydown', e => {
    const k = e.key;
    if (k === 'Escape') { e.preventDefault(); closePicker(true); return; }
    if (k === 'Enter') { e.preventDefault(); pick(o.active); return; }
    if (k === 'ArrowRight') { e.preventDefault(); setActive(o.active + 1, true); }
    else if (k === 'ArrowLeft') { e.preventDefault(); setActive(o.active - 1, true); }
    else if (k === 'ArrowDown') { e.preventDefault(); setActive(o.active + cols(), true); }
    else if (k === 'ArrowUp') { e.preventDefault(); setActive(o.active - cols(), true); }
    else if (k === 'PageDown') { e.preventDefault(); setActive(o.active + cols() * 5, true); }
    else if (k === 'PageUp') { e.preventDefault(); setActive(o.active - cols() * 5, true); }
  });
  el.addEventListener('click', e => {
    if (e.target.closest('[data-pop="close"]')) { closePicker(true); return; }
    const c = e.target.closest('[data-cat]');
    if (c) { o.cat = c.getAttribute('data-cat'); o.active = 0; drawCats(); draw(); q.focus(); return; }
    const it = e.target.closest('.css-setup-pop-item');
    if (it) pick(Number(it.getAttribute('data-i')));
  });
  el.addEventListener('change', e => {
    const t = e.target.getAttribute && e.target.getAttribute('data-tog');
    if (t) { o.toggles[t] = e.target.checked; o.active = 0; draw(); q.focus(); }
  });
  grid.addEventListener('mouseover', e => {
    const it = e.target.closest('.css-setup-pop-item');
    if (!it || !opts.tipFor) return;
    const item = o.shown[Number(it.getAttribute('data-i'))];
    if (!item || item.clear) { hideTip(); return; }
    const html = opts.tipFor(item);
    if (html) showTip(it, html);
  });
  grid.addEventListener('mouseleave', hideTip);
  el.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); closePicker(true); } });

  _open = o;
  drawCats();
  if (opts.current != null) { const idx = filter().findIndex(it => String(it.key) === String(opts.current)); if (idx >= 0 && idx < limit) o.active = idx; }
  draw();
  o.place();
  window.addEventListener('resize', o.place);
  setTimeout(() => document.addEventListener('mousedown', o.outside, true), 0);
  q.focus();
  if (o.active) setActive(o.active, true);
  return { close: () => closePicker(false), el };
}

export const PICKER_CSS = `
.css-setup-pop{position:fixed;z-index:9999;width:460px;max-width:calc(100vw - 16px);max-height:min(480px,calc(100vh - 16px));display:flex;flex-direction:column;background:#0e1733;color:var(--text,#eee);border:1px solid var(--cyan,#4dd0e1);border-radius:8px;box-shadow:0 10px 30px rgba(0,0,0,.6);font-size:12px}
.css-setup-pop-wide{width:640px}
.css-setup-pop-head{display:flex;justify-content:space-between;align-items:center;padding:6px 8px;border-bottom:1px solid #2b3d6b;color:var(--gold,#ffd700)}
.css-setup-pop-head button{background:none;border:none;color:var(--text2,#c0c0d4);font-size:16px;cursor:pointer}
.css-setup-pop-q{margin:6px 8px;padding:5px 8px;background:var(--bg,#1a1a2e);color:var(--text,#eee);border:1px solid #2b3d6b;border-radius:4px}
.css-setup-pop-cats{display:flex;flex-wrap:wrap;gap:4px;padding:0 8px 6px;align-items:center}
.css-setup-pop-cats button{background:var(--bg3,#0f3460);color:var(--text,#eee);border:1px solid #2b3d6b;border-radius:10px;padding:1px 8px;cursor:pointer;font-size:11px}
.css-setup-pop-cats button.css-setup-on{border-color:var(--cyan,#4dd0e1);color:var(--cyan,#4dd0e1)}
.css-setup-pop-grid{flex:1;overflow:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:3px;padding:0 8px 6px}
.css-setup-pop-item{display:flex;gap:6px;align-items:center;padding:3px 5px;border-radius:5px;cursor:pointer;border:1px solid transparent;min-width:0}
.css-setup-pop-item:hover{background:rgba(77,208,225,.08)}
.css-setup-pop-item.css-setup-act{border-color:var(--cyan,#4dd0e1);background:rgba(77,208,225,.14)}
.css-setup-pop-item.css-setup-cur{box-shadow:inset 3px 0 0 var(--gold,#ffd700)}
.css-setup-pop-item.css-setup-dis{opacity:.45;cursor:not-allowed}
.css-setup-pop-name{overflow:hidden;text-overflow:ellipsis;line-height:1.2}
.css-setup-pop-name small{display:block;color:var(--text2,#c0c0d4);font-size:10px}
.css-setup-pop-foot{padding:4px 8px;color:var(--text2,#c0c0d4);font-size:11px;border-top:1px solid #2b3d6b}
.css-setup-ico{display:inline-flex;flex:none;align-items:center;justify-content:center;border-radius:5px;overflow:hidden;box-sizing:border-box}
.css-setup-ico img{max-width:100%;max-height:100%;image-rendering:pixelated;object-fit:contain}
.css-setup-sheet{display:block;background-repeat:no-repeat;background-position:0 0;image-rendering:pixelated}
.css-setup-ico-txt{border:1px solid;color:#fff;font-weight:700;letter-spacing:.3px;text-shadow:0 1px 1px #000;line-height:1}
.css-setup-ico-empty{border:1px dashed rgba(255,255,255,.18)}
.css-setup-card{min-width:180px}
.css-setup-card-name{color:var(--gold,#ffd700);font-weight:700;font-size:13px;line-height:1.2}
.css-setup-card-meta{color:var(--text2,#c0c0d4);font-size:11px;margin-top:2px}
.css-setup-card-stats{border-collapse:collapse;margin-top:4px;font-size:11px}
.css-setup-card-stats td,.css-setup-card-stats th{padding:0 6px 0 0;text-align:right;font-weight:400}
.css-setup-card-stats th{color:var(--text2,#c0c0d4);font-size:10px}
.css-setup-card-stats td:first-child{text-align:left;color:var(--text2,#c0c0d4)}
.css-setup-card-uq{color:var(--cyan,#4dd0e1);font-weight:600;margin-top:3px}
.css-setup-card-desc{margin-top:4px;font-size:11px}
.css-setup-card-key{color:#667;font-size:10px;margin-top:4px}
.css-setup-pos{color:#7fe07f}.css-setup-neg{color:#ff7b7b}
`;
