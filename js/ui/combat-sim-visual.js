// ===== COMBAT SIM SETUP — IN-GAME PANEL GEOMETRY & HELPERS =====
// Pure data/geometry helpers (no DOM access) for the setup editor's in-game
// looking panels: talent book pages, attack bars, obol boards, equipment
// slot grids, and the shared visual CSS. Geometry defaults are traced from
// src/N.new.formatted.js and can be overridden by the cs-assets manifest
// through systemLayout(system, name) in combat-sim-picker.js.

import { TalentOrder, TalentDescriptions, TalentIconNames, ClassNames, ObolXYcoords } from '../stats/data/game/customlists.js';
import { ATTACKS } from '../stats/data/game/attacks.js';
import { formulaEval } from '../formulas.js';
import { systemLayout } from './combat-sim-picker.js';

function _n(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function _clean(s) { return String(s == null ? '' : s).replace(/[|_]/g, ' ').replace(/\s+/g, ' ').trim(); }
function _title(s) { return _clean(s).toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase()); }

// ----- classes ---------------------------------------------------------------

/** Exact port of `_customBlock_ReturnClasses(e)` (source ~66229). */
export function classTabs(classId) {
  const e = Math.floor(_n(classId));
  const out = [];
  if (e < 6) {
    for (let t = 0; t < e; t++) out.push(t + 1);
    return out;
  }
  const g = 12 * Math.floor((e - 6) / 12);
  const dn = e - 6 - g;
  if (dn > 7) out.push(6 + g, 6 + (g + Math.ceil(dn / 12)), 6 + (g + Math.ceil((dn - 5) / 2)), g + (dn - 4) + 6);
  else if (dn > 3) out.push(6 + g, 6 + (g + Math.ceil(dn / 12)), 6 + (g + Math.ceil((dn - 1) / 2)));
  else if (dn > 1) out.push(6 + g, 6 + (g + Math.ceil(dn / 12)));
  else if (dn > 0) out.push(6 + g);
  out.push(e);
  return out;
}

export function classLabel(id) {
  const n = ClassNames[id];
  if (!n || /^(NOPE|FILLER|0)$/.test(n)) return 'Class ' + id;
  return _title(n);
}

// ----- talents ---------------------------------------------------------------

export const STAR_TALENT_PAGES = 5;
export const TALENT_BOOK_COLS = 5;
export const TALENT_BOOK_ROWS = 3;

/** True for real talent ids (skips FILLER/blank entries in TalentIconNames). */
export function isRealTalent(id) {
  const n = TalentIconNames[id];
  return !!n && !/^(_|Blank|FILLER|NOPE)$/i.test(n) && !/^FILLER/i.test(n);
}

/** Attack talents (usable on the attack bar) have an ATTACKS entry. */
export function isAttackTalent(id) {
  const n = TalentIconNames[id];
  return !!n && Object.prototype.hasOwnProperty.call(ATTACKS, n);
}

/**
 * Talent book pages for a class: one per ReturnClasses tab plus the five
 * star-talent pages. Page ids are stable strings ('c<classId>' / 's<page>').
 */
export function talentBookPages(classId) {
  const pages = classTabs(classId).filter(c => c > 0).map(c => ({ id: 'c' + c, kind: 'class', classId: c, label: classLabel(c) }));
  for (let p = 0; p < STAR_TALENT_PAGES; p++) pages.push({ id: 's' + p, kind: 'star', page: p, label: 'Star ' + (p + 1) });
  return pages;
}

/**
 * The 15 book slots of a page (5 columns x 3 rows, slot t at col t%5,
 * row floor(t/5)). Class page n uses TalentOrder[t + 15*(n-1)]; star page p
 * uses TalentOrder[t - floor(t/10) + 615 + 13p] for t < 14, t != 10, with
 * slot 10/14 being the page arrows.
 */
export function talentPageSlots(page) {
  const out = [];
  for (let t = 0; t < 15; t++) {
    let id = null, arrow = null;
    if (page.kind === 'class') id = _n(TalentOrder[t + 15 * (page.classId - 1)]);
    else if (t === 10) arrow = 'left';
    else if (t === 14) arrow = 'right';
    else id = _n(TalentOrder[t - Math.floor(t / 10) + 615 + 13 * page.page]);
    if (id != null && !isRealTalent(id)) id = null;
    out.push({ slot: t, col: t % TALENT_BOOK_COLS, row: Math.floor(t / TALENT_BOOK_COLS), id, arrow });
  }
  return out;
}

/** Every talent id shown on the class's book pages (class tabs only, or with stars). */
export function classTalentIds(classId, withStars) {
  const ids = new Set();
  talentBookPages(classId).forEach(p => {
    if (p.kind === 'star' && !withStars) return;
    talentPageSlots(p).forEach(s => { if (s.id != null) ids.add(s.id); });
  });
  return ids;
}

/** Which book page shows a talent for this class (null if none). */
export function talentPageOf(classId, id) {
  for (const p of talentBookPages(classId)) {
    if (talentPageSlots(p).some(s => s.id === Number(id))) return p.id;
  }
  return null;
}

function _fmtNum(v) {
  if (!Number.isFinite(v)) return '0';
  const a = Math.abs(v);
  if (a >= 1e6) return v.toExponential(2).replace('e+', 'e');
  if (a >= 100) return String(Math.round(v * 10) / 10);
  return String(Math.round(v * 100) / 100);
}

/**
 * Talent description at a level. TalentDescriptions[id] =
 * [[text], [x1, x2, func, y1, y2, func2], [short], ...]; `{` is the first
 * formula and `}` the second, both evaluated with formulaEval.
 */
export function talentDescription(id, level) {
  const d = TalentDescriptions[id];
  if (!d) return { text: '', short: '', v1: 0, v2: 0 };
  const f = d[1] || [];
  const lv = Math.max(0, _n(level));
  const v1 = formulaEval(String(f[2] || ''), _n(f[0]), _n(f[1]), lv);
  const v2 = formulaEval(String(f[5] || ''), _n(f[3]), _n(f[4]), lv);
  const fill = s => _clean(String(s || '').replace(/\{/g, _fmtNum(v1)).replace(/\}/g, _fmtNum(v2)));
  return { text: fill(d[0] && d[0][0]), short: fill(d[2] && d[2][0]), v1, v2 };
}

// ----- obols -----------------------------------------------------------------

export const OBOL_SHAPES = ['Circle', 'Square', 'Hexagon', 'Sparkle'];
export const OBOL_TYPEGEN = ['aObolCircle', 'aObolSquare', 'aObolHexagon', 'aObolSparkle'];

/**
 * Obol board geometry from ObolXYcoords[0] (personal) / [1] (family):
 * [x, y, shape, levelReq]. Coordinates are normalized to the board origin.
 */
export function obolBoard(scope) {
  const m = systemLayout('obols', 'slots');
  const mc = m && Array.isArray(m.coords) ? m.coords[scope === 'family' ? 1 : 0] : null;
  if (Array.isArray(mc) && mc.length) {
    // Manifest coords are absolute game-screen [x, y, shape, levelReq]; the board
    // (UIObolBase, 356x394) is drawn at (252,71) and each 72px icon at (x-4, y-4).
    const slots = mc.map((r, slot) => ({ slot, x: _n(r[0]) - 256, y: _n(r[1]) - 75, shape: _n(r[2]), shapeName: OBOL_SHAPES[_n(r[2])] || 'Circle', levelReq: _n(r[3]) }));
    return { slots, width: 356, height: 394, iconPx: 72, manifest: true };
  }
  const override = systemLayout('obols', scope);
  const src = Array.isArray(override) ? override : (ObolXYcoords[scope === 'family' ? 1 : 0] || []);
  const minX = Math.min(...src.map(r => _n(r[0]))), minY = Math.min(...src.map(r => _n(r[1])));
  const slots = src.map((r, slot) => ({ slot, x: _n(r[0]) - minX, y: _n(r[1]) - minY, shape: _n(r[2]), shapeName: OBOL_SHAPES[_n(r[2])] || 'Circle', levelReq: _n(r[3]) }));
  const w = Math.max(...slots.map(s => s.x)) + 56, h = Math.max(...slots.map(s => s.y)) + 56;
  return { slots, width: w, height: h };
}

// ----- equipment ---------------------------------------------------------------

/**
 * Equipment panel cells: the eight core slots pair left/right
 * (Helmet|Weapon, Shirt|Pendant, Pants|Ring, Shoes|Ring) followed by the
 * eight premium/cosmetic slots, matching EquipOrder row 0 indices.
 */
export function equipmentGrid() {
  const o = systemLayout('equipment', 'armor');
  if (Array.isArray(o)) return o;
  const out = [];
  for (let i = 0; i < 16; i++) out.push({ slot: i, col: (i % 2) + (i >= 8 ? 2 : 0), row: Math.floor((i % 8) / 2) });
  return out;
}
export function toolGrid() {
  const o = systemLayout('equipment', 'tools');
  if (Array.isArray(o)) return o;
  const out = [];
  for (let i = 0; i < 7; i++) out.push({ slot: i, col: i % 4, row: Math.floor(i / 4) });
  return out;
}

// ----- shared CSS --------------------------------------------------------------

export const VISUAL_CSS = `
.css-setup-cardbox{background:rgba(10,18,44,.55);border:1px solid #2b3d6b;border-radius:8px;padding:8px 10px;margin:0 0 10px}
.css-setup-cardbox>.css-setup-h:first-child{margin-top:0}
.css-setup-row{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-start}
.css-setup-col{flex:1 1 300px;min-width:0}
.css-setup-step{display:inline-flex;align-items:stretch;border:1px solid #2b3d6b;border-radius:5px;overflow:hidden;vertical-align:middle}
.css-setup-root .css-setup-step button{border:none;border-radius:0;padding:0 7px;background:var(--bg3,#0f3460);font-size:13px;line-height:20px}
.css-setup-root .css-setup-step input[type=number]{border:none;border-radius:0;width:64px;text-align:center;-moz-appearance:textfield}
.css-setup-step input::-webkit-inner-spin-button,.css-setup-step input::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}
.css-setup-pill{display:inline-flex;align-items:center;gap:4px;margin-left:6px;padding:0 2px 0 7px;border-radius:10px;background:rgba(255,215,0,.12);border:1px solid rgba(255,215,0,.35);color:var(--gold,#ffd700);font-size:11px;white-space:nowrap;vertical-align:middle}
.css-setup-pill s{color:var(--text2,#c0c0d4)}
.css-setup-root .css-setup-pill button{padding:0 5px;border:none;background:none;color:var(--gold,#ffd700);font-size:12px;line-height:16px}
.css-setup-slot{position:relative;display:inline-flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;width:60px;height:60px;padding:0;background:radial-gradient(circle at 50% 40%,#1d2b55,#0b1430);border:2px solid #3a4d80;border-radius:7px;cursor:pointer;color:var(--text,#eee);box-sizing:border-box}
.css-setup-root button.css-setup-slot{padding:0;border:2px solid #3a4d80;background:radial-gradient(circle at 50% 40%,#1d2b55,#0b1430)}
.css-setup-root button.css-setup-slot:hover,.css-setup-slot:focus-visible{border-color:var(--cyan,#4dd0e1);outline:none}
.css-setup-slot.css-setup-chg,.css-setup-root button.css-setup-slot.css-setup-chg{border-color:var(--gold,#ffd700);box-shadow:0 0 6px rgba(255,215,0,.45)}
.css-setup-slot.css-setup-sel,.css-setup-root button.css-setup-slot.css-setup-sel{border-color:var(--cyan,#4dd0e1);box-shadow:0 0 0 2px rgba(77,208,225,.35)}
.css-setup-slot-lbl{font-size:9px;color:var(--text2,#c0c0d4);text-align:center;line-height:1.05;max-width:64px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.css-setup-slot-cap{position:absolute;bottom:-1px;right:2px;font-size:10px;font-weight:700;color:#fff;text-shadow:0 0 2px #000,0 0 2px #000}
.css-setup-slot-x{position:absolute;top:-7px;right:-7px;width:16px;height:16px;border-radius:50%;font-size:10px;line-height:14px;display:none}
.css-setup-root .css-setup-slot-x{padding:0;background:#3a1020;border:1px solid #6b2b3d}
.css-setup-slotwrap{position:relative;display:inline-flex;flex-direction:column;align-items:center;gap:2px}
.css-setup-slotwrap:hover .css-setup-slot-x,.css-setup-slotwrap:focus-within .css-setup-slot-x{display:block}
.css-setup-eq{display:grid;gap:6px 6px;grid-auto-rows:78px;justify-content:start}
.css-setup-eq-cell{display:flex;flex-direction:column;align-items:center;gap:2px}
.css-setup-eq-sep{width:14px}
.css-setup-detail{background:rgba(5,10,30,.6);border:1px solid #2b3d6b;border-radius:8px;padding:8px 10px}
.css-setup-detail h4{margin:0 0 6px;color:var(--gold,#ffd700);font-size:14px;display:flex;align-items:center;gap:8px}
.css-setup-kv{display:grid;grid-template-columns:auto auto auto 1fr;gap:3px 10px;align-items:center;font-size:12px}
.css-setup-kv>.css-setup-kh{color:var(--text2,#c0c0d4);font-size:10px;text-transform:uppercase;letter-spacing:.4px}
.css-setup-stone{display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:3px 0;border-bottom:1px solid rgba(255,255,255,.05)}
.css-setup-stone.css-setup-rej{color:#ff9b9b}
.css-setup-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(74px,1fr));gap:8px}
.css-setup-gcell{display:flex;flex-direction:column;align-items:center;gap:3px;text-align:center}
.css-setup-gcell .css-setup-step input[type=number]{width:44px}
.css-setup-book{background:linear-gradient(180deg,#3a2c1c,#2a1f14);border:3px solid #6b4f2a;border-radius:10px;padding:8px;box-shadow:inset 0 0 18px rgba(0,0,0,.6);display:inline-block}
.css-setup-book-tabs{display:flex;flex-wrap:wrap;gap:3px;margin-bottom:8px}
.css-setup-root .css-setup-book-tabs button{background:#4a3822;border-color:#7a5c33;color:#f3e2bf;font-size:11px;padding:2px 8px}
.css-setup-root .css-setup-book-tabs button.css-setup-active{background:#d8b56d;color:#2a1f14;border-color:#f3d48f;font-weight:700}
.css-setup-book-grid{position:relative;display:grid;grid-template-columns:repeat(5,var(--tal-w,79px));grid-auto-rows:var(--tal-h,92px);gap:0;background:#e9d3a4;border:2px solid #b08a4e;border-radius:6px;padding:6px}
.css-setup-tal{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;padding-top:4px}
.css-setup-root button.css-setup-tal-ico{position:relative;padding:0;width:52px;height:52px;border:2px solid #8a6a3a;border-radius:8px;background:#f6e7c4;display:flex;align-items:center;justify-content:center}
.css-setup-tal.css-setup-chg .css-setup-tal-ico{border-color:#d4a017;box-shadow:0 0 7px rgba(212,160,23,.9)}
.css-setup-tal.css-setup-sel .css-setup-tal-ico{border-color:#1f8ea0;box-shadow:0 0 0 2px rgba(31,142,160,.6)}
.css-setup-tal.css-setup-lock{opacity:.4}
.css-setup-tal-lv{margin-top:2px;font-size:11px;font-weight:700;color:#3a2a14;line-height:1}
.css-setup-tal-lv small{color:#7a5c33;font-weight:400}
.css-setup-tal-steps{display:flex;gap:2px;margin-top:2px}
.css-setup-root .css-setup-tal-steps button{padding:0 6px;font-size:11px;line-height:14px;background:#7a5c33;border-color:#5a4020;color:#fff}
.css-setup-tal-arrow{display:flex;align-items:center;justify-content:center;color:#7a5c33;font-size:22px}
.css-setup-tal-detail{margin-top:8px;background:#f3e2bf;color:#2a1f14;border-radius:6px;padding:6px 8px;max-width:420px}
.css-setup-tal-detail b{color:#5a3d12}
.css-setup-tal-detail .css-setup-muted{color:#6b5536}
.css-setup-tal-detail .css-setup-pill{color:#7a5300;background:rgba(122,83,0,.12);border-color:rgba(122,83,0,.4)}
.css-setup-root .css-setup-tal-detail .css-setup-pill button{color:#7a5300}
.css-setup-skillbars{display:flex;flex-direction:column;gap:6px}
.css-setup-skillbar{display:flex;align-items:center;gap:4px;padding:5px 8px;background:linear-gradient(180deg,#2b3b66,#18213f);border:2px solid #5b6fa6;border-radius:9px;width:max-content}
.css-setup-skillbar-n{width:46px;font-size:11px;color:var(--text2,#c0c0d4)}
.css-setup-skillbar .css-setup-slot{width:54px;height:54px}
.css-setup-skillbar .css-setup-slot.css-setup-drop{border-color:var(--accent,#e94560);box-shadow:0 0 8px rgba(233,69,96,.7)}
.css-setup-skillbar .css-setup-slot[draggable=true]{cursor:grab}
.css-setup-slot-key{position:absolute;top:1px;left:3px;font-size:9px;color:#9fb0e0}
.css-setup-obolboard{position:relative;background:radial-gradient(ellipse at center,#24345f,#101934);border:2px solid #44598f;border-radius:12px}
.css-setup-root button.css-setup-obol{position:absolute;width:52px;height:52px;padding:0;border:none;background:none;display:flex;align-items:center;justify-content:center}
.css-setup-obol::before{content:'';position:absolute;inset:0;background:#4a5d8f;border:none}
.css-setup-obol::after{content:'';position:absolute;inset:3px;background:#1a2547}
.css-setup-obol>*{position:relative;z-index:1}
.css-setup-obol-s0::before,.css-setup-obol-s0::after{border-radius:50%}
.css-setup-obol-s1::before,.css-setup-obol-s1::after{border-radius:6px}
.css-setup-obol-s2::before,.css-setup-obol-s2::after{clip-path:polygon(25% 3%,75% 3%,100% 50%,75% 97%,25% 97%,0 50%)}
.css-setup-obol-s3::before,.css-setup-obol-s3::after{clip-path:polygon(50% 0,63% 37%,100% 50%,63% 63%,50% 100%,37% 63%,0 50%,37% 37%)}
.css-setup-obol.css-setup-chg::before{background:var(--gold,#ffd700)}
.css-setup-obol.css-setup-sel::before{background:var(--cyan,#4dd0e1)}
.css-setup-obol.css-setup-lock{opacity:.35}
.css-setup-obol:focus-visible{outline:2px solid var(--cyan,#4dd0e1)}
.css-setup-labmap{position:relative;background:linear-gradient(180deg,#0c2a2a,#081a22);border:2px solid #2a6b6b;border-radius:8px;cursor:crosshair;overflow:hidden}
.css-setup-labdot{position:absolute;transform:translate(-50%,-50%);width:12px;height:12px;border-radius:50%;background:#4a8f8f;border:2px solid #0c2a2a;pointer-events:none}
.css-setup-labdot.css-setup-sel{background:var(--gold,#ffd700);width:16px;height:16px}
.css-setup-labdot span{position:absolute;top:13px;left:50%;transform:translateX(-50%);font-size:9px;color:#9fd;white-space:nowrap}
.css-setup-chipbar{display:flex;flex-wrap:wrap;gap:8px;padding:8px;background:linear-gradient(180deg,#123b3b,#0a2324);border:2px solid #2a6b6b;border-radius:9px;width:max-content;max-width:100%}
.css-setup-chipbar .css-setup-slot{border-radius:50%;width:58px;height:58px}
.css-setup-root .css-setup-chipbar button.css-setup-slot{border-radius:50%}
.css-setup-tier0{border-color:#3a4d80}.css-setup-tier1{border-color:#d4a017!important}.css-setup-tier2{border-color:#8a5cd6!important}.css-setup-tier3{border-color:#4dd0e1!important}
.css-setup-cmp.css-setup-off{opacity:.35;filter:grayscale(1)}
.css-setup-details>summary{cursor:pointer;color:var(--cyan,#4dd0e1);margin:8px 0 4px}
`;
