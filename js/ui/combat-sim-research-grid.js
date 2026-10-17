// ===== COMBAT-SIM RESEARCH GRID (setup editor tab) =====
// In-game style Research grid: level nodes and drag/rotate/park the real shapes.
// Shape drops become one `researchLayout` setup patch whose handler replays them
// through the game's ownership pass (js/stats/systems/w7/research-shapes.js).
// The component remounts after every editor innerHTML render; transient UI state
// lives in `ui.rgrid`, and edits commit only on drop/blur so a drag never rerenders.

import { GRID_COLS, GRID_SIZE, RES_GRID_RAW, SHAPE_COLORS, SHAPE_BONUS_PCT, gridCoord } from '../stats/data/w7/research.js';
import {
  researchShapeVertices, researchShapeName, researchShapeDims, researchNodeSelectable, researchCanRotateShapes,
  applyResearchShapeMoves, clampResearchShapePosition, findResearchShapeParking, encodeResearchShapeLayout,
  decodeResearchShapeLayout, researchShapeCount, RESEARCH_SHAPE_ROT_STEP, RESEARCH_SHAPE_ROTATE_LEVEL,
  RESEARCH_SHAPE_DEFAULT_POS, RESEARCH_SHAPE_MAX, researchCellArtPosition, researchSelectionArtPosition,
  researchCellImageKey, researchCellHighlightKey, researchShapeAlpha, researchShapeSpriteTransform,
} from '../stats/systems/w7/research-shapes.js';
import { readRawKey, rowValues } from '../stats/systems/common/combat-sim-setup.js';
import { formatDesc } from '../renderers/grid-desc.js';
import { buildSaveContext } from '../save/context.js';

export const OPTIMIZER_LAYOUT_KEY = 'idleon_shapeLayout';
const SVGNS = 'http://www.w3.org/2000/svg';
const VIEW = { x: 6, y: 15, w: 616, h: 372 };
const MIN_SHAPE_ALPHA = 0.2;

// In-game art from assets/combat-sim/ui/manifest.json "research" (cs-assets extractor).
// Missing manifest entries fall back to the plain SVG drawing per element.
const ART_BASE = new URL('../../assets/combat-sim/ui/', import.meta.url).href;
const CELL_ART = 30; // manifest research.cellPx; ResSq*/ResSqH* are 30x30
// Natural sizes of the non-cell sprites (defaults match the extracted files; probed on load).
const _artSize = { ResearchBG: [960, 474], ResSqSel: [40, 40] };
let _art = null, _artLoading = null, _artFailed = false;
function _probe(key) {
  return new Promise(res => {
    const url = _artUrl(key);
    if (!url || typeof Image !== 'function') { res(); return; }
    const im = new Image();
    im.onload = () => { if (im.naturalWidth > 0) _artSize[key] = [im.naturalWidth, im.naturalHeight]; res(); };
    im.onerror = () => { if (_art && _art.files) delete _art.files[key]; res(); };
    im.src = url;
  });
}
function _loadArt() {
  if (_art || _artLoading || _artFailed || typeof fetch !== 'function') return;
  _artLoading = fetch(ART_BASE + 'manifest.json')
    .then(r => (r.ok ? r.json() : null))
    .then(m => {
      const r = m && m.research;
      _art = r && r.files ? r : null;
      if (!_art) _artFailed = true;
      return _art ? Promise.all([_probe('ResearchBG'), _probe('ResSqSel')]) : null;
    })
    .catch(() => { _artFailed = true; _art = null; })
    .then(() => {
      _artLoading = null;
      if (_art && _live && _live.host && _live.host.isConnected && !_live.dragging) mountResearchGrid(_live.host, _live.api, _live.ui);
    });
}
function _artUrl(key) {
  const f = key && _art && _art.files && _art.files[key];
  return f ? ART_BASE + f : null;
}
function _sprite(s) {
  const sp = _art && _art.shapeSprites && _art.shapeSprites[s];
  return sp && sp.file && Number(sp.w) > 0 && Number(sp.h) > 0 ? sp : null;
}

const CSS = `
.rg-wrap{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-start}
.rg-board{position:relative;flex:1 1 100%;min-width:320px;background:radial-gradient(ellipse at center,#1c2448 0%,#10142a 80%);border:2px solid #3a3466;border-radius:8px;padding:4px;box-shadow:inset 0 0 24px rgba(0,0,0,.6)}
.rg-board:focus-within{border-color:var(--cyan,#4dd0e1)}
.rg-svg{display:block;width:100%;height:auto;margin:0 auto;touch-action:none;user-select:none;outline:none}
.rg-svg image{image-rendering:pixelated}
.css-setup-panel:has(.rg-root){max-height:none}
.rg-node{cursor:pointer}
.rg-node rect.rg-hit{fill:transparent;stroke:none}
.rg-node:hover rect.rg-hit{stroke:rgba(255,255,255,.55);stroke-width:1}
.rg-lockhint{display:none;fill:none;stroke:rgba(60,60,80,.45);stroke-dasharray:2 2;stroke-width:1}
.rg-mode-nodes .rg-lockhint{display:inline}
.rg-shape.rg-hasart polygon.rg-body{fill:transparent;stroke:none}
.rg-shape.rg-hasart.rg-sel polygon.rg-body{stroke:#fff;stroke-width:1.4;stroke-dasharray:4 3}
.rg-shape.rg-hasart:focus-visible polygon.rg-body{stroke:#000;stroke-width:2}
.rg-shape image{pointer-events:none}
.rg-node rect.rg-cell{rx:3px;stroke-width:1}
.rg-node text{pointer-events:none;font-family:Verdana,sans-serif;text-anchor:middle}
.rg-mode-nodes .rg-shape{pointer-events:none;opacity:.35}
.rg-shape{cursor:grab;outline:none}
.rg-shape.rg-drag{cursor:grabbing}
.rg-shape polygon.rg-body{stroke-width:1.6;stroke-linejoin:round}
.rg-shape.rg-sel polygon.rg-body{stroke:#fff;stroke-width:2.2;stroke-dasharray:5 3}
.rg-shape:focus-visible polygon.rg-body{stroke:#fff;stroke-width:2.6}
.rg-ghost{pointer-events:none;fill:none;stroke-width:1.2;stroke-dasharray:3 3;opacity:.8}
.rg-side{flex:1 1 100%;min-width:230px;display:flex;flex-direction:column;gap:6px}
.rg-tray{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:3px}
.rg-tray-row{display:flex;align-items:center;gap:5px;padding:3px 5px;border-radius:4px;background:rgba(255,255,255,.03);border:1px solid transparent;cursor:pointer;font-size:12px}
.rg-tray-row:hover{border-color:#2b3d6b}
.rg-tray-row.rg-sel{border-color:var(--cyan,#4dd0e1);background:rgba(77,208,225,.08)}
.rg-tray-row.rg-locked{opacity:.45;cursor:default}
.rg-tray-row .rg-sw{width:12px;height:12px;border-radius:2px;flex:none;border:2px solid}
.rg-tray-row .rg-nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rg-tray-row .rg-meta{color:var(--text2,#c0c0d4);font-size:10px;white-space:nowrap}
.rg-tray-row.rg-moved .rg-nm{color:var(--gold,#ffd700)}
.rg-bar{display:flex;flex-wrap:wrap;gap:5px;align-items:center;margin-bottom:6px}
.rg-bar .rg-seg button.rg-on{background:var(--accent,#e94560);border-color:var(--accent,#e94560)}
.rg-note{color:var(--text2,#c0c0d4);font-size:11px}
.rg-warn{color:var(--orange,#ff9800);font-size:11px}
.rg-pop{position:absolute;z-index:5;background:#0b1430;border:1px solid var(--cyan,#4dd0e1);border-radius:6px;padding:7px 9px;min-width:210px;max-width:290px;box-shadow:0 6px 18px rgba(0,0,0,.6);font-size:12px}
.rg-pop .rg-pop-h{font-weight:600;color:var(--cyan,#4dd0e1);margin-bottom:3px}
.rg-pop .rg-step{display:flex;gap:3px;align-items:center;margin:5px 0}
.rg-pop .rg-step input{width:64px}
.rg-pop .rg-desc{color:var(--text2,#c0c0d4);font-size:11px;margin-top:3px}
.rg-io{width:100%;min-height:64px;font-family:monospace;font-size:11px}
.rg-tip b{color:var(--green,#4caf50)}
.rg-tip .rg-tip-h{font-weight:600;color:var(--cyan,#4dd0e1)}
.rg-tip .rg-tip-d{color:var(--text2,#c0c0d4);margin-top:3px}
`;

let _live = null; // { api, ui, timer, pendingMove } — survives remounts

function _css() {
  if (typeof document === 'undefined' || document.getElementById('css-rgrid-style')) return;
  const st = document.createElement('style');
  st.id = 'css-rgrid-style';
  st.textContent = CSS;
  document.head.appendChild(st);
}

function _esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function _el(tag, attrs, parent) {
  const e = document.createElementNS(SVGNS, tag);
  if (attrs) Object.keys(attrs).forEach(k => e.setAttribute(k, attrs[k]));
  if (parent) parent.appendChild(e);
  return e;
}
function _posText(p) { return p ? p.x + ', ' + p.y + (p.rot ? ' @ ' + p.rot + '\u00b0' : '') : '(none)'; }
function _samePos(a, b) { return !!a && !!b && a.x === b.x && a.y === b.y && (a.rot || 0) === (b.rot || 0); }
function _store() { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; } }
function _fmtN(v) { const n = Number(v) || 0; return Math.abs(n) >= 100 ? String(Math.round(n)) : String(Math.round(n * 100) / 100); }

export function researchGridHostHtml() {
  return '<div id="css-rgrid-host" class="css-rgrid-host"></div>';
}

/** Read the optimizer's last shape placement ({v, savedAt, shapes}) from localStorage. */
export function readOptimizerShapeLayout() {
  const st = _store();
  if (!st) return null;
  try {
    const j = JSON.parse(st.getItem(OPTIMIZER_LAYOUT_KEY) || 'null');
    if (!j || !Array.isArray(j.shapes) || !j.shapes.length) return null;
    return { savedAt: Number(j.savedAt) || 0, moves: decodeResearchShapeLayout(JSON.stringify(j)) };
  } catch (e) { return null; }
}

function _tipEl() {
  let t = document.getElementById('css-rgrid-tip');
  if (!t) {
    t = document.createElement('div');
    t.id = 'css-rgrid-tip';
    t.className = 'css-setup-tip rg-tip';
    t.style.cssText = 'position:fixed;z-index:10000;max-width:340px;background:#0b1430;color:var(--text,#eee);border:1px solid var(--cyan,#4dd0e1);border-radius:5px;padding:6px 8px;font-size:12px;pointer-events:none;box-shadow:0 4px 14px rgba(0,0,0,.5);display:none';
    document.body.appendChild(t);
  }
  return t;
}
function _placeTip(tip, ev) {
  const w = tip.offsetWidth, h = tip.offsetHeight;
  let x = ev.clientX + 14, y = ev.clientY + 12;
  if (x + w > window.innerWidth - 8) x = Math.max(8, ev.clientX - w - 14);
  if (y + h > window.innerHeight - 8) y = Math.max(8, window.innerHeight - h - 8);
  tip.style.left = x + 'px';
  tip.style.top = y + 'px';
}

/**
 * Mount into `host`. `api` = { compute, upsert, remove, findPatch, getRaw, ci };
 * `ui` is the editor's persistent UI object (state lives in ui.rgrid).
 */
export function mountResearchGrid(host, api, ui) {
  if (!host || typeof document === 'undefined') return;
  _css();
  const S = ui.rgrid || (ui.rgrid = { mode: 'shapes', sel: null, ghost: true, pop: null, io: null, msg: '', ignoreRot: false });
  if (!_live || _live.ui !== ui) _live = { api, ui, timer: null, pendingMove: null };
  _live.api = api;
  _live.host = host;
  _live.dragging = false;
  _loadArt();
  const art = _art && _art.files && _art.files.ResearchBG ? _art : null;
  const tip = _tipEl();
  tip.style.display = 'none';

  const c = api.compute();
  const st = c.state && c.state.research, base = c.base && c.base.research;
  if (!st || !st.available || !st.levels.length) { host.innerHTML = '<div class="css-setup-muted">This save has no Research data.</div>'; return; }
  const patch = api.findPatch({ system: 'researchLayout' });
  const owned = patch && patch.owned != null ? Math.max(0, Math.min(RESEARCH_SHAPE_MAX, Number(patch.owned) || 0)) : st.owned;
  const levels = st.levels, overlay = st.overlay.slice();
  const baseLevels = base.levels, baseOverlay = base.overlay;
  const total = researchShapeCount();
  const positions = [];
  for (let s = 0; s < total; s++) {
    const p = st.positions[s];
    positions.push(p ? { x: p.x, y: p.y, rot: p.rot } : (s < owned ? Object.assign({}, RESEARCH_SHAPE_DEFAULT_POS) : null));
  }
  if (_live.pendingMove) { const m = _live.pendingMove; positions[m[0]] = { x: m[1], y: m[2], rot: m[3] }; }
  const canRotate = researchCanRotateShapes(st.researchLevel) || S.ignoreRot;
  if (S.sel != null && !(S.sel < owned)) S.sel = null;
  const nodesOwned = s => overlay.reduce((n, v) => n + (v === s ? 1 : 0), 0);
  const moveCount = patch && Array.isArray(patch.moves) ? patch.moves.length : 0;
  const overlayChanged = overlay.reduce((n, v, i) => n + (v !== baseOverlay[i] ? 1 : 0), 0);
  let lvChanged = 0;
  for (let i = 0; i < GRID_SIZE; i++) if ((levels[i] || 0) !== (baseLevels[i] || 0)) lvChanged++;
  const opt = readOptimizerShapeLayout();
  let shapeAlpha = null;
  try {
    const r7 = rowValues(rowValues(readRawKey(api.getRaw(), 'Research'))[7]);
    shapeAlpha = researchShapeAlpha(r7[1]);
  } catch (e) { shapeAlpha = null; }
  const drawAlpha = shapeAlpha == null ? 1 : Math.max(MIN_SHAPE_ALPHA, Math.min(1, shapeAlpha));

  // ----- static HTML: toolbar, board, side panel --------------------------------
  let h = '<div class="rg-bar">' +
    '<span class="rg-seg"><button type="button" data-rg="mode" data-v="shapes" class="' + (S.mode === 'shapes' ? 'rg-on' : '') + '" title="Drag, rotate and park shapes (in-game shape mode)">Shapes</button>' +
    '<button type="button" data-rg="mode" data-v="nodes" class="' + (S.mode === 'nodes' ? 'rg-on' : '') + '" title="Click nodes to set levels">Nodes</button></span>' +
    '<button type="button" data-rg="rot" data-v="-1"' + (S.sel == null || !canRotate ? ' disabled' : '') + ' title="Rotate -5\u00b0 (Shift+R / wheel)">\u27f2 -5\u00b0</button>' +
    '<button type="button" data-rg="rot" data-v="1"' + (S.sel == null || !canRotate ? ' disabled' : '') + ' title="Rotate +5\u00b0 (R / wheel)">\u27f3 +5\u00b0</button>' +
    '<button type="button" data-rg="park"' + (S.sel == null ? ' disabled' : '') + ' title="Move the selected shape to the nearest spot covering no nodes (Delete)">Return to tray</button>' +
    '<label class="css-setup-check"><input type="checkbox" data-rg="ghost"' + (S.ghost ? ' checked' : '') + '>Saved outlines</label>' +
    '<button type="button" data-rg="undo"' + (moveCount ? '' : ' disabled') + '>Undo drop</button>' +
    '<button type="button" data-rg="reset" class="css-setup-danger"' + (patch ? '' : ' disabled') + '>Reset shapes to save</button>' +
    '<button type="button" data-rg="opt"' + (opt ? '' : ' disabled') + ' title="' + _esc(opt ? 'Research optimizer layout from ' + new Date(opt.savedAt).toLocaleString() + ' (' + opt.moves.length + ' shapes, dropped in its order)' : 'Run the Shape Optimizer in research-optimizer-v2.html first') + '">Copy layout from Research optimizer</button>' +
    '<button type="button" data-rg="export">Export layout</button><button type="button" data-rg="import">Import layout</button>' +
    '</div>';
  h += '<div class="rg-note">Shapes owned: <select data-rg="owned">' +
    Array.from({ length: total + 1 }, (_, n) => '<option value="' + n + '"' + (n === owned ? ' selected' : '') + '>' + n + (n === st.owned ? ' (save)' : '') + '</option>').join('') +
    '</select> \u00b7 Research Lv ' + st.researchLevel + (researchCanRotateShapes(st.researchLevel) ? '' : ' \u00b7 <span class="rg-warn">rotation unlocks at Lv ' + RESEARCH_SHAPE_ROTATE_LEVEL + '</span> <label class="css-setup-check"><input type="checkbox" data-rg="ignoreRot"' + (S.ignoreRot ? ' checked' : '') + '>allow anyway</label>') +
    ' \u00b7 ' + moveCount + ' drop' + (moveCount === 1 ? '' : 's') + (patch && patch.clear ? ' (replayed on an empty overlay)' : '') + ', ' + overlayChanged + ' node' + (overlayChanged === 1 ? '' : 's') + ' changed shape, ' + lvChanged + ' level edit' + (lvChanged === 1 ? '' : 's') +
    (art && shapeAlpha != null && shapeAlpha < MIN_SHAPE_ALPHA ? ' \u00b7 shape sprites drawn at ' + Math.round(MIN_SHAPE_ALPHA * 100) + '% (save opacity ' + Math.round(shapeAlpha * 100) + '%)' : '') +
    (S.msg ? ' \u00b7 <span class="rg-warn">' + _esc(S.msg) + '</span>' : '') + '</div>';
  if (S.io) {
    h += '<div style="margin:4px 0"><textarea class="rg-io" data-rg="iotext" placeholder=\'{"v":1,"shapes":[[shape,x,y,rot],...]}  or  0:120,60,0; 3:300,90,15\'>' +
      _esc(S.io === 'export' ? _exportText(positions, overlay, owned) : (S.ioText || '')) + '</textarea>' +
      (S.io === 'import' ? '<button type="button" data-rg="doImport">Apply (drops in listed order on an empty overlay)</button> ' : '') +
      '<button type="button" data-rg="closeIo">Close</button></div>';
  }
  h += '<div class="rg-wrap"><div class="rg-board' + (S.mode === 'nodes' ? ' rg-mode-nodes' : '') + (art ? ' rg-art' : '') + '"></div><div class="rg-side"><div class="css-setup-h" style="margin-top:0">Shapes</div><div class="rg-tray"></div>' +
    '<div class="rg-note">Shapes mode: drag a shape (pointer delta at game-pixel resolution, clamped to the board like in-game), R / Shift+R or the wheel rotate \u00b15\u00b0, arrows nudge 1px (Shift 10), Delete returns it to the tray. Nodes are claimed first-come; a drop never steals a node another shape already owns. Nodes mode: click a node to set its level.</div></div></div>';
  host.innerHTML = '<div class="rg-root"></div>';
  const root = host.firstChild;
  root.innerHTML = h;
  const board = root.querySelector('.rg-board');
  const tray = root.querySelector('.rg-tray');

  // ----- SVG board ---------------------------------------------------------------
  const svg = _el('svg', { class: 'rg-svg', viewBox: VIEW.x + ' ' + VIEW.y + ' ' + VIEW.w + ' ' + VIEW.h, tabindex: '0', role: 'application', 'aria-label': 'Research grid' });
  board.appendChild(svg);
  // Integer scaling keeps the pixel art crisp: k game px -> k CSS px (fractional only below 1x).
  function fitSvg() {
    const avail = board.clientWidth - 8;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 0;
    let k = Math.floor(avail / VIEW.w);
    if (vh > 0) k = Math.min(k, Math.max(1, Math.floor((vh - 140) / VIEW.h)));
    if (k >= 1) { svg.style.width = (VIEW.w * k) + 'px'; svg.style.height = (VIEW.h * k) + 'px'; }
    else { svg.style.width = '100%'; svg.style.height = 'auto'; }
  }
  fitSvg();
  if (_live.ro) _live.ro.disconnect();
  if (typeof ResizeObserver === 'function') { _live.ro = new ResizeObserver(() => { if (svg.isConnected) fitSvg(); }); _live.ro.observe(board); }
  if (art) {
    const bg = _artUrl('ResearchBG');
    const bx = Number(art.background && art.background.x) || 0, by = Number(art.background && art.background.y) || 0;
    _el('image', { href: bg, x: bx, y: by, width: _artSize.ResearchBG[0], height: _artSize.ResearchBG[1], preserveAspectRatio: 'none', 'pointer-events': 'none' }, svg);
  }
  const gNodes = _el('g', null, svg), gSelBox = _el('g', { 'pointer-events': 'none' }, svg), gGhost = _el('g', null, svg), gShapes = _el('g', null, svg);
  const nodeEls = [];
  for (let n = 0; n < GRID_SIZE; n++) {
    const info = RES_GRID_RAW[n];
    const x = 15 + 30 * (n % GRID_COLS), y = 24 + 30 * Math.floor(n / GRID_COLS);
    if (!info) { if (!art) _el('rect', { x: x + 11, y: y + 11, width: 5, height: 5, rx: 1, fill: 'rgba(255,255,255,.05)' }, gNodes); nodeEls.push(null); continue; }
    const g = _el('g', { class: 'rg-node', 'data-n': n }, gNodes);
    const e = { g, n };
    if (art) {
      // Source art: ResSq<max>_<lv> then ResSqH<owner> at (14+30c, 23+30r), 30x30 (N.js 101148/101151).
      const ap = researchCellArtPosition(n);
      e.ap = ap;
      e.img = _el('image', { x: ap.x, y: ap.y, width: CELL_ART, height: CELL_ART, preserveAspectRatio: 'none', display: 'none' }, g);
      e.hi = _el('image', { x: ap.x, y: ap.y, width: CELL_ART, height: CELL_ART, preserveAspectRatio: 'none', display: 'none' }, g);
      e.hint = _el('rect', { class: 'rg-lockhint', x: ap.x + 1.5, y: ap.y + 1.5, width: CELL_ART - 3, height: CELL_ART - 3 }, g);
      e.mark = _el('path', { d: 'M' + (ap.x + CELL_ART - 7) + ' ' + (ap.y + 1) + 'h6v6z', fill: 'var(--gold,#ffd700)', stroke: '#000', 'stroke-width': 0.5, display: 'none' }, g);
      e.hit = _el('rect', { class: 'rg-hit', x: ap.x, y: ap.y, width: CELL_ART, height: CELL_ART }, g);
    } else {
      _drawFallbackNode(e, x, y);
    }
    nodeEls.push(e);
  }
  function _drawFallbackNode(e, x, y) {
    e.rect = _el('rect', { class: 'rg-cell', x, y, width: 27, height: 27 }, e.g);
    e.lab = _el('text', { x: x + 13.5, y: y + 10, 'font-size': 6.5 }, e.g);
    e.lab.textContent = gridCoord(e.n);
    e.lvT = _el('text', { x: x + 13.5, y: y + 22, 'font-size': 8, 'font-weight': 700 }, e.g);
    if (!e.mark) e.mark = _el('path', { d: 'M' + (x + 21) + ' ' + y + 'h6v6z', fill: 'var(--gold,#ffd700)', display: 'none' }, e.g);
    if (e.hit) e.g.appendChild(e.hit);
  }
  function paintNodes(ov) {
    for (let n = 0; n < GRID_SIZE; n++) {
      const e = nodeEls[n];
      if (!e) continue;
      const info = RES_GRID_RAW[n], lv = levels[n] || 0, max = Number(info[1]) || 0;
      const sel = researchNodeSelectable(levels, n);
      const si = ov[n];
      e.mark.setAttribute('display', lv !== (baseLevels[n] || 0) ? '' : 'none');
      if (e.img) {
        const key = researchCellImageKey(levels, n);
        const url = key ? _artUrl(key) : null;
        if (key && !url) {
          // Level/max combination without an extracted image: draw this cell the plain way.
          e.img.remove(); e.hi.remove(); e.img = e.hi = null;
          if (e.hint) { e.hint.remove(); e.hint = null; }
          _drawFallbackNode(e, 15 + 30 * (n % GRID_COLS), 24 + 30 * Math.floor(n / GRID_COLS));
        } else {
          if (url) { e.img.setAttribute('href', url); e.img.setAttribute('display', ''); } else e.img.setAttribute('display', 'none');
          e.hint.setAttribute('display', key ? 'none' : '');
          const hk = researchCellHighlightKey(ov, n), hu = _artUrl(hk);
          if (hu) { e.hi.setAttribute('href', hu); e.hi.setAttribute('display', ''); } else e.hi.setAttribute('display', 'none');
          continue;
        }
      }
      let fill = lv > 0 ? '#2b3c6e' : sel ? '#1b2547' : '#121628';
      let stroke = lv >= max && max > 0 ? '#e8c24a' : lv > 0 ? '#5a74b8' : sel ? '#3a4a7a' : '#20263f';
      if (si >= 0) { fill = SHAPE_COLORS[si] + (lv > 0 ? '70' : '48'); stroke = SHAPE_COLORS[si]; }
      e.rect.setAttribute('fill', fill);
      e.rect.setAttribute('stroke', stroke);
      e.rect.setAttribute('stroke-width', si >= 0 ? 1.6 : 1);
      e.g.setAttribute('opacity', sel ? 1 : 0.42);
      e.lab.setAttribute('fill', lv > 0 ? '#c9d6ff' : '#7d88aa');
      e.lvT.setAttribute('fill', lv >= max && max > 0 ? '#ffd76a' : lv > 0 ? '#ffffff' : '#6c7899');
      e.lvT.textContent = sel ? lv + '/' + max : '\ud83d\udd12';
    }
  }
  paintNodes(overlay);
  // ResSqSel box around the selected (popover) node at (9+30c, 18+30r), N.js 100051.
  function paintSelBox() {
    while (gSelBox.firstChild) gSelBox.firstChild.remove();
    const n = S.pop;
    if (n == null || !RES_GRID_RAW[n]) return;
    const url = art && _artUrl('ResSqSel');
    if (url) {
      const sp = researchSelectionArtPosition(n);
      _el('image', { href: url, x: sp.x, y: sp.y, width: _artSize.ResSqSel[0], height: _artSize.ResSqSel[1], preserveAspectRatio: 'none' }, gSelBox);
    } else {
      _el('rect', { x: 15 + 30 * (n % GRID_COLS) - 2, y: 24 + 30 * Math.floor(n / GRID_COLS) - 2, width: 31, height: 31, fill: 'none', stroke: '#fff', 'stroke-width': 1.5, rx: 2 }, gSelBox);
    }
  }

  if (S.ghost) {
    for (let s = 0; s < owned; s++) {
      const bp = base.positions[s];
      if (!bp || _samePos(bp, positions[s])) continue;
      _el('polygon', { class: 'rg-ghost', points: researchShapeVertices(s, bp.x, bp.y, bp.rot).map(p => p.join(',')).join(' '), stroke: SHAPE_COLORS[s] }, gGhost);
    }
  }
  const shapeEls = [];
  for (let s = 0; s < owned; s++) {
    const p = positions[s];
    const sp = art ? _sprite(s) : null;
    const g = _el('g', { class: 'rg-shape' + (sp ? ' rg-hasart' : '') + (S.sel === s ? ' rg-sel' : ''), 'data-s': s, tabindex: S.mode === 'shapes' ? '0' : '-1', role: 'button',
      'aria-label': researchShapeName(s) + ' at ' + _posText(p) }, gShapes);
    // ResShape<s> is OriginCentered: top-left at Research[6] (x, y), rotated about its pivot,
    // alpha round(Research[7][1])/100 (N.js 100046/100051). The polygon stays the hit target.
    const img = sp ? _el('image', { href: ART_BASE + sp.file, x: 0, y: 0, width: sp.w, height: sp.h, preserveAspectRatio: 'none', opacity: drawAlpha }, g) : null;
    const poly = _el('polygon', { class: 'rg-body', fill: SHAPE_COLORS[s] + '38', stroke: SHAPE_COLORS[s] }, g);
    shapeEls[s] = { g, poly, img, sp };
    drawShape(s, p);
  }
  function drawShape(s, p) {
    const e = shapeEls[s];
    if (!e || !p) return;
    e.poly.setAttribute('points', researchShapeVertices(s, p.x, p.y, p.rot).map(q => q.join(',')).join(' '));
    if (e.img) e.img.setAttribute('transform', researchShapeSpriteTransform(p, e.sp));
  }
  // Keep the selected shape on top like the game's drag order.
  if (S.sel != null && shapeEls[S.sel]) gShapes.appendChild(shapeEls[S.sel].g);

  // ----- tray -----------------------------------------------------------------------
  let th = '';
  for (let s = 0; s < total; s++) {
    const isOwned = s < owned;
    const p = positions[s], bp = base.positions[s];
    const moved = isOwned && bp && !_samePos(bp, p);
    th += '<div class="rg-tray-row' + (isOwned ? '' : ' rg-locked') + (S.sel === s ? ' rg-sel' : '') + (moved ? ' rg-moved' : '') + '" data-rg="pick" data-v="' + s + '"' +
      (isOwned ? ' tabindex="0" role="button"' : '') + ' title="' + _esc(isOwned ? (moved ? 'Save: ' + _posText(bp) + '. ' : '') + 'Click to select' : 'Not owned yet') + '">' +
      '<span class="rg-sw" style="border-color:' + SHAPE_COLORS[s] + ';background:' + SHAPE_COLORS[s] + '55"></span>' +
      '<span class="rg-nm">' + _esc(researchShapeName(s)) + ' <span class="rg-meta">+' + (SHAPE_BONUS_PCT[s] || 0) + '%</span></span>' +
      '<span class="rg-meta">' + (isOwned ? nodesOwned(s) + ' nodes \u00b7 ' + _posText(p) : 'locked') + '</span></div>';
  }
  tray.innerHTML = th;

  // ----- popover ---------------------------------------------------------------------
  function popHtml(n) {
    const info = RES_GRID_RAW[n];
    const lv = levels[n] || 0, max = Number(info[1]) || 0, bl = baseLevels[n] || 0;
    const si = overlay[n];
    return '<div class="rg-pop-h">' + _esc(gridCoord(n) + ' \u2013 ' + String(info[0]).replace(/_/g, ' ')) + '</div>' +
      '<div class="rg-step"><button type="button" data-rg="lv" data-v="0" title="Level 0">0</button><button type="button" data-rg="lvd" data-v="-1">\u2212</button>' +
      '<input type="number" min="0" max="' + max + '" value="' + lv + '" data-rg="lvin" data-fid="rgrid-lv" aria-label="Level">' +
      '<button type="button" data-rg="lvd" data-v="1">+</button><button type="button" data-rg="lv" data-v="' + max + '">Max</button>' +
      '<span class="rg-note">/ ' + max + (bl !== lv ? ' (save ' + bl + ')' : '') + '</span></div>' +
      (si >= 0 ? '<div style="color:' + SHAPE_COLORS[si] + '">' + _esc(researchShapeName(si)) + ' +' + (SHAPE_BONUS_PCT[si] || 0) + '%</div>' : '<div class="rg-note">No shape</div>') +
      (researchNodeSelectable(levels, n) ? '' : '<div class="rg-warn">Locked: level a neighbouring node first (Grid_CanWeSelect).</div>') +
      '<div class="rg-desc">' + descHtml(n, lv) + '</div>' +
      '<div style="margin-top:5px;text-align:right">' + (bl !== lv ? '<button type="button" data-rg="lv" data-v="' + bl + '">Undo</button> ' : '') + '<button type="button" data-rg="closePop">Close</button></div>';
  }
  let popEl = null;
  function openPop(n) {
    S.pop = n;
    if (!popEl) { popEl = document.createElement('div'); popEl.className = 'rg-pop'; board.appendChild(popEl); }
    popEl.innerHTML = popHtml(n);
    // Place next to the node using the rendered SVG box (integer-scaled and centred in the board).
    const br = board.getBoundingClientRect(), sr = svg.getBoundingClientRect();
    const scale = sr.width / VIEW.w || 1, bw = board.clientWidth;
    const cx = sr.left - br.left + (15 + 30 * (n % GRID_COLS) + 30 - VIEW.x) * scale + 4;
    const cy = sr.top - br.top + (24 + 30 * Math.floor(n / GRID_COLS) - VIEW.y) * scale + 4;
    popEl.style.left = Math.max(4, Math.min(cx, bw - 300)) + 'px';
    popEl.style.top = Math.max(4, cy) + 'px';
    paintSelBox();
  }
  function closePop() { S.pop = null; if (popEl) { popEl.remove(); popEl = null; } paintSelBox(); }
  if (S.pop != null && RES_GRID_RAW[S.pop]) openPop(S.pop);

  // ----- descriptions ------------------------------------------------------------------
  let sc = null;
  function descHtml(n, lv) {
    try {
      if (!sc) {
        let b = {};
        try { b = buildSaveContext() || {}; } catch (e) { b = {}; }
        sc = Object.assign({}, b, { gridLevels: levels, shapeOverlay: overlay });
      }
      return formatDesc(n, lv, sc);
    } catch (e) {
      return _esc(String((RES_GRID_RAW[n] || [])[3] || '').replace(/_/g, ' '));
    }
  }
  function nodeTip(n) {
    const info = RES_GRID_RAW[n];
    const lv = levels[n] || 0, max = Number(info[1]) || 0, bl = baseLevels[n] || 0;
    const per = Number(info[2]) || 0, si = overlay[n], bsi = baseOverlay[n];
    let t = '<div class="rg-tip-h">' + _esc(gridCoord(n) + ' \u2013 ' + String(info[0]).replace(/_/g, ' ')) + ' <span style="color:#888">#' + n + '</span></div>' +
      '<div>Level ' + lv + ' / ' + max + (bl !== lv ? ' <span style="color:var(--gold,#ffd700)">(save ' + bl + ')</span>' : '') + (researchNodeSelectable(levels, n) ? '' : ' \u00b7 <span style="color:#f99">locked</span>') + '</div>' +
      '<div>Bonus: ' + _fmtN(per * lv) + (bl !== lv ? ' (save ' + _fmtN(per * bl) + ')' : '') + '</div>';
    if (si >= 0) t += '<div style="color:' + SHAPE_COLORS[si] + '">' + _esc(researchShapeName(si)) + ' +' + (SHAPE_BONUS_PCT[si] || 0) + '% \u2192 ' + _fmtN(per * lv * (1 + (SHAPE_BONUS_PCT[si] || 0) / 100)) + '</div>';
    else t += '<div style="color:#888">No shape</div>';
    if (bsi !== si) t += '<div style="color:var(--gold,#ffd700)">Save: ' + (bsi >= 0 ? _esc(researchShapeName(bsi)) : 'no shape') + '</div>';
    t += '<div class="rg-tip-d">' + descHtml(n, lv) + '</div>';
    if (lv < max) t += '<div class="rg-tip-d">Lv ' + (lv + 1) + ': ' + descHtml(n, lv + 1) + '</div>';
    return t;
  }
  function shapeTip(s) {
    const p = positions[s], bp = base.positions[s];
    return '<div class="rg-tip-h" style="color:' + SHAPE_COLORS[s] + '">' + _esc(researchShapeName(s)) + ' +' + (SHAPE_BONUS_PCT[s] || 0) + '%</div>' +
      '<div>Position ' + _posText(p) + (bp && !_samePos(bp, p) ? ' <span style="color:var(--gold,#ffd700)">(save ' + _posText(bp) + ')</span>' : '') + '</div>' +
      '<div>' + nodesOwned(s) + ' nodes owned \u00b7 ' + researchShapeDims(s).join('\u00d7') + ' px</div>';
  }

  // ----- commits -------------------------------------------------------------------------
  function patchBase() {
    const prev = api.findPatch({ system: 'researchLayout' });
    const p = { system: 'researchLayout', moves: prev && Array.isArray(prev.moves) ? prev.moves.map(m => m.slice()) : [] };
    if (prev && prev.clear) p.clear = true;
    if (prev && prev.owned != null) p.owned = prev.owned;
    return p;
  }
  function commitMove(m) {
    clearTimeout(_live.timer);
    _live.timer = null;
    _live.pendingMove = null;
    const p = patchBase();
    // Consecutive drops of one shape collapse into its final drop.
    if (p.moves.length && p.moves[p.moves.length - 1][0] === m[0]) p.moves[p.moves.length - 1] = m;
    else p.moves.push(m);
    S.msg = '';
    _live.api.upsert(p);
  }
  function stage(s, x, y, rot, delay) {
    const c2 = clampResearchShapePosition(s, x, y);
    const m = [s, Math.round(c2.x), Math.round(c2.y), Number(rot) || 0];
    positions[s] = { x: m[1], y: m[2], rot: m[3] };
    drawShape(s, positions[s]);
    previewOverlay(m);
    if (!delay) { commitMove(m); return; }
    _live.pendingMove = m;
    clearTimeout(_live.timer);
    _live.timer = setTimeout(() => commitMove(m), delay);
  }
  let pvFrame = 0, pvMove = null;
  function previewOverlay(m) {
    pvMove = m;
    if (pvFrame) return;
    pvFrame = requestAnimationFrame(() => {
      pvFrame = 0;
      const res = applyResearchShapeMoves({ levels, overlay, positions: st.positions, owned }, [pvMove]);
      paintNodes(res.overlay);
    });
  }
  function select(s, focus) {
    S.sel = s;
    shapeEls.forEach((e, i) => e && e.g.classList.toggle('rg-sel', i === s));
    if (s != null && shapeEls[s]) { gShapes.appendChild(shapeEls[s].g); if (focus) shapeEls[s].g.focus({ preventScroll: true }); }
    tray.querySelectorAll('.rg-tray-row').forEach(r => r.classList.toggle('rg-sel', Number(r.getAttribute('data-v')) === s));
    root.querySelectorAll('[data-rg="rot"]').forEach(b => { b.disabled = s == null || !canRotate; });
    const pk = root.querySelector('[data-rg="park"]');
    if (pk) pk.disabled = s == null;
  }
  function rotate(dir) {
    const s = S.sel;
    if (s == null || !(s < owned)) return;
    if (!canRotate) { S.msg = 'Rotation unlocks at Research Lv ' + RESEARCH_SHAPE_ROTATE_LEVEL; return; }
    const p = positions[s];
    stage(s, p.x, p.y, (Number(p.rot) || 0) + dir * RESEARCH_SHAPE_ROT_STEP, 450);
  }
  function park() {
    const s = S.sel;
    if (s == null || !(s < owned)) return;
    const p = positions[s];
    const spot = findResearchShapeParking(s, p.rot, levels, { x: p.x, y: p.y });
    if (!spot) { S.msg = 'No free spot found for ' + researchShapeName(s); return; }
    stage(s, spot.x, spot.y, p.rot, 0);
  }

  // ----- pointer drag (game: per-axis mouse delta, bounds-checked, no snap) ----------------
  function svgPoint(ev) {
    const m = svg.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = ev.clientX; pt.y = ev.clientY;
    const r = pt.matrixTransform(m.inverse());
    return { x: r.x, y: r.y };
  }
  let drag = null;
  svg.addEventListener('pointerdown', ev => {
    if (ev.button !== 0) return;
    const g = ev.target.closest && ev.target.closest('.rg-shape');
    if (g && S.mode === 'shapes') {
      const s = Number(g.getAttribute('data-s'));
      select(s, false);
      const p = positions[s];
      drag = { s, start: svgPoint(ev), x0: p.x, y0: p.y, rot: p.rot, moved: false, id: ev.pointerId, g };
      _live.dragging = true;
      try { svg.setPointerCapture(ev.pointerId); } catch (e) { /* synthetic */ }
      g.classList.add('rg-drag');
      tip.style.display = 'none';
      ev.preventDefault();
      return;
    }
    const nd = ev.target.closest && ev.target.closest('.rg-node');
    if (nd) { ev.preventDefault(); openPop(Number(nd.getAttribute('data-n'))); const inp = popEl && popEl.querySelector('[data-rg="lvin"]'); if (inp) inp.focus(); return; }
    if (!ev.target.closest('.rg-pop')) closePop();
  });
  svg.addEventListener('pointermove', ev => {
    if (drag && ev.pointerId === drag.id) {
      const q = svgPoint(ev);
      const dx = Math.round(q.x - drag.start.x), dy = Math.round(q.y - drag.start.y);
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 1) return;
      drag.moved = true;
      const c2 = clampResearchShapePosition(drag.s, drag.x0 + dx, drag.y0 + dy);
      positions[drag.s] = { x: c2.x, y: c2.y, rot: drag.rot };
      drawShape(drag.s, positions[drag.s]);
      previewOverlay([drag.s, c2.x, c2.y, drag.rot]);
      return;
    }
    const t = ev.target.closest && (ev.target.closest('.rg-node') || ev.target.closest('.rg-shape'));
    if (!t) { tip.style.display = 'none'; return; }
    tip.innerHTML = t.classList.contains('rg-node') ? nodeTip(Number(t.getAttribute('data-n'))) : shapeTip(Number(t.getAttribute('data-s')));
    tip.style.display = 'block';
    _placeTip(tip, ev);
  });
  function endDrag(ev, cancel) {
    if (!drag || (ev && ev.pointerId !== drag.id)) return;
    const d = drag;
    drag = null;
    _live.dragging = false;
    d.g.classList.remove('rg-drag');
    try { svg.releasePointerCapture(d.id); } catch (e) { /* ignore */ }
    if (!d.moved) { svg.focus({ preventScroll: true }); return; }
    if (cancel) { positions[d.s] = { x: d.x0, y: d.y0, rot: d.rot }; drawShape(d.s, positions[d.s]); paintNodes(overlay); return; }
    const p = positions[d.s];
    stage(d.s, p.x, p.y, p.rot, 0);
  }
  svg.addEventListener('pointerup', ev => endDrag(ev, false));
  svg.addEventListener('pointercancel', ev => endDrag(ev, true));
  svg.addEventListener('pointerleave', () => { if (!drag) tip.style.display = 'none'; });
  svg.addEventListener('wheel', ev => {
    if (S.mode !== 'shapes' || S.sel == null || drag) return;
    const g = ev.target.closest && ev.target.closest('.rg-shape');
    if (!g || Number(g.getAttribute('data-s')) !== S.sel) return;
    ev.preventDefault();
    rotate(ev.deltaY > 0 ? 1 : -1);
  }, { passive: false });
  svg.addEventListener('focusin', ev => {
    const g = ev.target.closest && ev.target.closest('.rg-shape');
    if (g && S.sel !== Number(g.getAttribute('data-s'))) select(Number(g.getAttribute('data-s')), false);
  });
  svg.addEventListener('keydown', ev => {
    if (S.mode !== 'shapes') return;
    const k = ev.key;
    if (k === 'Escape') { if (drag) endDrag({ pointerId: drag.id }, true); else select(null); return; }
    if (S.sel == null) return;
    const p = positions[S.sel], step = ev.shiftKey ? 10 : 1;
    const nudge = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[k];
    if (nudge) { ev.preventDefault(); S.kbd = true; stage(S.sel, p.x + nudge[0], p.y + nudge[1], p.rot, 450); return; }
    if (k === 'r' || k === 'R') { ev.preventDefault(); S.kbd = true; rotate(ev.shiftKey ? -1 : 1); return; }
    if (k === 'Delete' || k === 'Backspace') { ev.preventDefault(); S.kbd = true; park(); }
  });

  // ----- toolbar / tray / popover controls ------------------------------------------------
  function setLevel(n, v) {
    const max = Number(RES_GRID_RAW[n][1]) || 0;
    const val = Math.max(0, Math.min(max, Math.round(Number(v) || 0)));
    const p = { system: 'table', table: 'researchGrid', index: n };
    if (val === (baseLevels[n] || 0)) { if (api.findPatch(p)) api.remove(p); else openPop(n); return; }
    api.upsert(Object.assign(p, { value: val }));
  }
  root.addEventListener('click', ev => {
    const b = ev.target.closest && ev.target.closest('[data-rg]');
    if (!b || !root.contains(b) || b.tagName === 'INPUT' || b.tagName === 'SELECT' || b.tagName === 'TEXTAREA') return;
    const a = b.getAttribute('data-rg'), v = b.getAttribute('data-v');
    switch (a) {
      case 'mode': S.mode = v; closePop(); _rerender(); break;
      case 'rot': rotate(Number(v)); break;
      case 'park': park(); break;
      case 'pick': { const s = Number(v); if (s < owned) { S.mode = 'shapes'; board.classList.remove('rg-mode-nodes'); select(s, true); } break; }
      case 'undo': {
        const p = patchBase();
        p.moves.pop();
        if (!p.moves.length && p.owned == null) api.remove({ system: 'researchLayout' }); else api.upsert(p);
        break;
      }
      case 'reset': clearTimeout(_live.timer); _live.pendingMove = null; S.msg = ''; api.remove({ system: 'researchLayout' }); break;
      case 'opt': {
        const o = readOptimizerShapeLayout();
        if (!o) break;
        const p = { system: 'researchLayout', clear: true, moves: o.moves };
        const prev = api.findPatch({ system: 'researchLayout' });
        if (prev && prev.owned != null) p.owned = prev.owned;
        S.msg = o.moves.some(m => m[0] >= owned) ? 'Optimizer layout uses shapes you do not own; those drops are ignored' : '';
        api.upsert(p);
        break;
      }
      case 'export': S.io = 'export'; _rerender(); break;
      case 'import': S.io = 'import'; S.ioText = ''; _rerender(); break;
      case 'closeIo': S.io = null; _rerender(); break;
      case 'doImport': {
        const ta = root.querySelector('[data-rg="iotext"]');
        try {
          const moves = decodeResearchShapeLayout(ta ? ta.value : '');
          const p = { system: 'researchLayout', clear: true, moves };
          const prev = api.findPatch({ system: 'researchLayout' });
          if (prev && prev.owned != null) p.owned = prev.owned;
          S.io = null;
          S.msg = moves.some(m => m[0] >= owned) ? 'Some imported shapes are not owned and were ignored' : '';
          api.upsert(p);
        } catch (err) { S.ioText = ta ? ta.value : ''; S.msg = 'Import failed: ' + err.message; _rerender(); }
        break;
      }
      case 'lv': if (S.pop != null) setLevel(S.pop, v); break;
      case 'lvd': if (S.pop != null) setLevel(S.pop, (levels[S.pop] || 0) + Number(v)); break;
      case 'closePop': closePop(); svg.focus({ preventScroll: true }); break;
      default: break;
    }
  });
  root.addEventListener('keydown', ev => {
    const row = ev.target.closest && ev.target.closest('.rg-tray-row');
    if (row && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); row.click(); return; }
    if (ev.key === 'Escape' && S.pop != null && ev.target.closest && ev.target.closest('.rg-pop')) { closePop(); svg.focus({ preventScroll: true }); }
  });
  root.addEventListener('change', ev => {
    const el = ev.target, a = el.getAttribute && el.getAttribute('data-rg');
    if (!a) return;
    if (a === 'ghost') { S.ghost = el.checked; _rerender(); }
    else if (a === 'ignoreRot') { S.ignoreRot = el.checked; _rerender(); }
    else if (a === 'lvin') { if (S.pop != null) setLevel(S.pop, el.value); }
    else if (a === 'owned') {
      const p = patchBase();
      const n = Number(el.value);
      if (n === st.owned) delete p.owned; else p.owned = n;
      if (!p.moves.length && p.owned == null) api.remove({ system: 'researchLayout' }); else api.upsert(p);
    }
  });
  root.addEventListener('mouseleave', () => { tip.style.display = 'none'; });

  function _rerender() { mountResearchGrid(host, api, ui); }

  if (S.kbd && S.sel != null && shapeEls[S.sel]) { shapeEls[S.sel].g.focus({ preventScroll: true }); S.kbd = false; }
}

function _exportText(positions, overlay, owned) {
  // Largest node footprint first, matching the optimizer's "drop in this order" advice.
  const counts = [];
  for (let s = 0; s < owned; s++) counts.push([s, overlay.reduce((n, v) => n + (v === s ? 1 : 0), 0)]);
  counts.sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  return encodeResearchShapeLayout(counts.filter(([s]) => positions[s]).map(([s]) => [s, positions[s].x, positions[s].y, positions[s].rot || 0]));
}
