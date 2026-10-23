// ===== COMBAT SIM SETUP EDITOR (UI) =====
// DOM editor for js/stats/systems/common/combat-sim-setup.js. The page owns the
// raw save; this module only builds a setup (typed patches) and returns a
// patched clone through apply(raw). It never calls loadSaveData.
//
// Per-character patches created here carry no `ci`, so they follow the
// character currently selected on the page (setup.charIdx is synced on
// refresh/apply). "Copy from character" also produces character-following
// patches.

import * as CS from '../stats/systems/common/combat-sim-setup.js';
import { mountResearchGrid, researchGridHostHtml } from './combat-sim-research-grid.js';
import * as ST from '../stats/systems/common/combat-sim-stones.js';
import * as V from './combat-sim-visual.js';
import { ITEMS } from '../stats/data/game/items.js';
import { StarSigns, PrayerInfo, ChipDesc, CompanionDB, StatueInfo } from '../stats/data/game/customlists.js';
import { loadUiAssets, onUiAssets, iconHtml, installIconFallback, showTip, hideTip, itemCardHtml, openPicker, gameText, PICKER_CSS, systemLayout, frameUrl, iconUrl } from './combat-sim-picker.js';

import { COMBAT_DRAFT_PREFIX, combatLoadoutKey, readCombatLoadouts, readCombatDraft } from './combat-sim-loadouts.js';
const ROW_CAP = 250;

// Scope-first layout. Character tabs edit only the selected character's save
// keys; account systems are grouped by the world whose in-game menu owns them.
const isT = (p, re) => p.system === 'table' && re.test(p.table);
const CHAR_TABS = [
  { id: 'gear', label: 'Equipment', test: p => p.system === 'equipment' },
  { id: 'food', label: 'Food', test: p => p.system === 'food' || p.system === 'foodSlots' },
  { id: 'talents', label: 'Talents', test: p => /^(talent|superTalent|attackLoadout)$/.test(p.system) },
  { id: 'cards', label: 'Cards', test: p => p.system === 'card' || p.system === 'cardSet' },
  { id: 'obols', label: 'Obols', test: p => p.system === 'obol' && p.scope !== 'family' },
  { id: 'signs', label: 'Star signs & Prayers', test: p => p.system === 'starSigns' || p.system === 'prayers' },
  { id: 'bubbles', label: 'Alchemy bubbles', test: p => p.system === 'bubbles' },
  { id: 'lab', label: 'Lab', test: p => p.system === 'labPosition' || p.system === 'labChip' },
  { id: 'divinity', label: 'Divinity', test: p => p.system === 'divinity' },
  { id: 'character', label: 'Class & skills', test: p => /^(charClass|buffs)$/.test(p.system) || isT(p, /^(skillLevels|postOffice)$/) },
];
const CHAR_TAB_IDS = CHAR_TABS.map(t => t.id);

const ACCT_WORLDS = [
  { id: 'W1', label: 'W1 Blunder Hills' }, { id: 'W2', label: 'W2 Yum-Yum Desert' }, { id: 'W3', label: 'W3 Frostbite Tundra' },
  { id: 'W4', label: 'W4 Hyperion Nebula' }, { id: 'W5', label: 'W5 Smolderin\u2019 Plateau' }, { id: 'W6', label: 'W6 Spirited Valley' },
  { id: 'W7', label: 'W7 Shimmerfin Deep' }, { id: 'General', label: 'General' },
];
const GROUP_HELP = {
  Stamps: 'Stamp edits also raise StampLvM so the stamp max stays consistent.',
  Alchemy: 'Bubble, vial and sigil levels are account-wide. Each character\u2019s equipped bubbles are on its Alchemy bubbles tab.',
  Worship: 'Prayer levels are account-wide. Each character\u2019s equipped prayers are on its Star signs & Prayers tab.',
  Divinity: 'Blessing levels are account-wide. Each character\u2019s linked god and style are on its Divinity tab.',
  Breeding: 'Shiny level is derived from shiny EXP; setting a level writes the EXP that reaches it.',
};
// Account systems: one per LEVEL_TABLES group (world != Character) plus
// dedicated editors. `view` names a renderer; table systems use the default.
const ACCOUNT_SYSTEMS = (() => {
  const list = [];
  const groups = new Map();
  CS.LEVEL_TABLES.forEach(t => {
    if (t.world === 'Character') return;
    const k = t.world + '|' + t.group;
    if (!groups.has(k)) { groups.set(k, { id: 'g:' + t.group, world: t.world, label: t.group, tables: [] }); list.push(groups.get(k)); }
    groups.get(k).tables.push(t.id);
  });
  list.forEach(s => { const ids = s.tables; s.test = p => p.system === 'table' && ids.indexOf(p.table) >= 0; s.icon = ids[0]; });
  const byId = id => list.find(s => s.id === id);
  const st = byId('g:Statues');
  if (st) { st.view = 'statues'; const t0 = st.test; st.test = p => p.system === 'statue' || t0(p); }
  const rs = byId('g:Research');
  if (rs) { rs.view = 'research'; const t0 = rs.test; rs.test = p => p.system === 'researchLayout' || t0(p); }
  const w2 = list.findIndex(s => s.world === 'W2');
  list.splice(w2 < 0 ? list.length : w2 + list.filter(s => s.world === 'W2').length, 0,
    { id: 'ballot', world: 'W2', label: 'Ballot', view: 'ballot', test: p => p.system === 'vote' });
  list.push(
    { id: 'derived', world: 'General', label: 'Derived values', view: 'derived', test: () => false },
    { id: 'cardLevels', world: 'General', label: 'Card levels', view: 'cardLevels', test: p => p.system === 'cardLevel' },
    { id: 'signUnlocks', world: 'General', label: 'Star sign unlocks', view: 'signUnlocks', test: p => p.system === 'starSignUnlock' },
    { id: 'companions', world: 'General', label: 'Companions', view: 'companions', test: p => p.system === 'companion' },
    { id: 'familyObols', world: 'General', label: 'Family obols', view: 'familyObols', test: p => p.system === 'obol' && p.scope === 'family' },
    { id: 'filter', world: 'General', label: 'Item filter', view: 'filter', test: p => p.system === 'printerFilter' });
  return list;
})();
const acctSystemsOf = world => ACCOUNT_SYSTEMS.filter(s => s.world === world);
const acctSystem = id => ACCOUNT_SYSTEMS.find(s => s.id === id) || null;

/** Patch predicate behind a reset/badge id: character tab, `sys:<id>`, world, scope, raw. */
function testFor(id) {
  const ct = CHAR_TABS.find(t => t.id === id);
  if (ct) return ct.test;
  if (id === 'raw') return p => p.system === 'raw';
  if (id === 'scope:char') return p => CHAR_TABS.some(t => t.test(p));
  if (id === 'scope:acct') return p => ACCOUNT_SYSTEMS.some(s => s.test(p));
  if (/^world:/.test(id)) { const sys = acctSystemsOf(id.slice(6)); return p => sys.some(s => s.test(p)); }
  if (/^sys:/.test(id)) { const s = acctSystem(id.slice(4)); return s ? s.test : null; }
  return null;
}

const COPY_SYSTEMS = { gear: ['equipment'], food: ['food'], obols: ['obols'], cards: ['cards'], talents: ['talents', 'attackLoadout'],
  signs: ['starSigns', 'prayers'], bubbles: ['bubbles'], lab: ['labChips'], character: ['postOffice', 'buffs'] };
// Patches produced by each copyCharacterPatches system (copy replaces only these).
const COPY_TESTS = {
  equipment: p => p.system === 'equipment', food: p => p.system === 'food' || p.system === 'foodSlots',
  obols: p => p.system === 'obol' && p.scope !== 'family', cards: p => p.system === 'card' || p.system === 'cardSet',
  talents: p => p.system === 'talent' || p.system === 'superTalent', attackLoadout: p => p.system === 'attackLoadout',
  starSigns: p => p.system === 'starSigns', prayers: p => p.system === 'prayers', bubbles: p => p.system === 'bubbles',
  labChips: p => p.system === 'labChip', postOffice: p => isT(p, /^postOffice$/), buffs: p => p.system === 'buffs',
};
const STYLE_TEXT = `
.css-setup-root{font-size:13px;color:var(--text,#eee)}
.css-setup-bar{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:8px}
.css-setup-bar .css-setup-count{font-weight:600;color:var(--gold,#ffd700);margin-right:6px}
.css-setup-root button{background:var(--bg3,#0f3460);color:var(--text,#eee);border:1px solid #2b3d6b;border-radius:4px;padding:3px 9px;cursor:pointer;font-size:12px}
.css-setup-root button:hover{border-color:var(--accent,#e94560)}
.css-setup-root button.css-setup-danger{border-color:#6b2b3d}
.css-setup-root input,.css-setup-root select,.css-setup-root textarea{box-sizing:border-box;max-width:100%;background:var(--bg,#1a1a2e);color:var(--text,#eee);border:1px solid #2b3d6b;border-radius:4px;padding:2px 5px;font-size:12px}
.css-setup-root input[type=number]{width:90px}
.css-setup-root input.css-setup-item{width:260px}
.css-setup-tabs{display:flex;flex-wrap:wrap;gap:3px;border-bottom:2px solid var(--bg3,#0f3460);margin-bottom:8px}
.css-setup-tabs button{border-radius:4px 4px 0 0;border-bottom:none;background:var(--bg2,#16213e)}
.css-setup-tabs button.css-setup-active{background:var(--bg3,#0f3460);color:var(--cyan,#4dd0e1)}
.css-setup-tabs button .css-setup-badge{display:inline-block;margin-left:4px;padding:0 5px;border-radius:8px;background:var(--accent,#e94560);color:#fff;font-size:10px}
.css-setup-panel{background:var(--bg2,#16213e);border-radius:6px;padding:8px;max-height:560px;overflow:auto}
.css-setup-tools{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:6px;color:var(--text2,#c0c0d4)}
.css-setup-table{border-collapse:collapse;width:100%}
.css-setup-table th{text-align:left;color:var(--text2,#c0c0d4);font-weight:500;border-bottom:1px solid #2b3d6b;padding:3px 6px;position:sticky;top:-8px;background:var(--bg2,#16213e);z-index:1}
.css-setup-table td{padding:2px 6px;border-bottom:1px solid rgba(255,255,255,.04);vertical-align:middle}
.css-setup-table .css-setup-num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.css-setup-root button.css-setup-link{background:none;border:0;padding:0 4px 0 0;color:var(--cyan,#4dd0e1);text-decoration:underline;cursor:pointer;font-size:inherit}
.css-setup-table tr.css-setup-changed td{background:rgba(255,215,0,.07)}
.css-setup-table tr.css-setup-changed td:first-child{box-shadow:inset 3px 0 0 var(--gold,#ffd700)}
.css-setup-save{color:var(--text2,#c0c0d4);font-size:11px}
.css-setup-muted{color:var(--text2,#c0c0d4);font-size:11px}
.css-setup-h{margin:8px 0 4px;color:var(--cyan,#4dd0e1);font-size:13px;font-weight:600}
.css-setup-stats{display:flex;flex-wrap:wrap;gap:4px 10px;padding:4px 0}
.css-setup-stats label{display:flex;gap:4px;align-items:center;color:var(--text2,#c0c0d4);font-size:11px}
.css-setup-stats input[type=number]{width:70px}
.css-setup-diff{list-style:none;margin:0;padding:0}
.css-setup-diff li{display:flex;gap:6px;align-items:center;padding:2px 0;border-bottom:1px solid rgba(255,255,255,.04)}
.css-setup-diff li span{flex:1}
.css-setup-warn{color:var(--red,#f44)}
.css-setup-tip{position:fixed;z-index:10000;max-width:340px;background:#0b1430;color:var(--text,#eee);border:1px solid var(--cyan,#4dd0e1);border-radius:5px;padding:6px 8px;font-size:12px;pointer-events:none;box-shadow:0 4px 14px rgba(0,0,0,.5);display:none}
.css-setup-help{display:inline-block;width:15px;height:15px;line-height:15px;text-align:center;border-radius:50%;background:var(--bg3,#0f3460);color:var(--cyan,#4dd0e1);font-size:10px;cursor:help;margin-left:4px}
.css-setup-io{width:100%;min-height:90px;font-family:monospace}
.css-setup-check{display:inline-flex;align-items:center;gap:3px}
`;

// Layout glue for the in-game panels (VISUAL_CSS holds the shared pieces).
const EXTRA_CSS = `
.css-setup-eq-armor{grid-template-columns:64px 64px 16px 64px 64px}
.css-setup-eq-tools{grid-template-columns:repeat(4,64px)}
.css-setup-eqbox{display:inline-block;background:linear-gradient(180deg,#2b3b66,#18213f);border:2px solid #5b6fa6;border-radius:10px;padding:8px 10px}
.css-setup-eqbox .css-setup-h{margin-top:0}
.css-setup-slot .css-setup-ico-empty{opacity:.25}
.css-setup-detail .css-setup-kv{grid-template-columns:auto 52px auto 60px}
.css-setup-detail .css-setup-kv .css-setup-tot{font-weight:700;text-align:right}
.css-setup-detail .css-setup-kv .css-setup-bs{color:var(--text2,#c0c0d4);text-align:right}
.css-setup-uq{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:4px 0}
.css-setup-uq select{max-width:220px}
.css-setup-uqline{color:#9fe39f;font-weight:600}
.css-setup-stone .css-setup-ico{flex:none}
.css-setup-stone select{max-width:120px}
.css-setup-stonehead{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:8px 0 4px}
.css-setup-mode button.css-setup-active{background:var(--accent,#e94560);color:#fff}
.css-setup-slotrow{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-start}
.css-setup-slotrow .css-setup-slotwrap{width:74px}
.css-setup-slotname{font-size:10px;color:var(--text2,#c0c0d4);text-align:center;max-width:74px;line-height:1.1;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.css-setup-slotwrap .css-setup-step input[type=number]{width:46px}
.css-setup-slot.css-setup-lock{opacity:.45}
.css-setup-cardframe{display:flex;flex-wrap:wrap;gap:10px;padding:10px;background:linear-gradient(180deg,#3b2a52,#1d1430);border:2px solid #7a5ca6;border-radius:10px;width:max-content;max-width:100%}
.css-setup-cardframe .css-setup-slot{width:58px;height:74px;border-radius:5px}
.css-setup-signbar{display:flex;flex-wrap:wrap;gap:10px;padding:10px;background:radial-gradient(ellipse at center,#1d2350,#0a0d26);border:2px solid #4a4f9a;border-radius:10px;width:max-content;max-width:100%}
.css-setup-signbar .css-setup-slot{border-radius:50%}
.css-setup-praybar{display:flex;flex-wrap:wrap;gap:10px;padding:10px;background:linear-gradient(180deg,#3a3016,#221b0a);border:2px solid #8a7432;border-radius:10px;width:max-content;max-width:100%}
.css-setup-bubblebar{display:flex;flex-wrap:wrap;gap:10px;padding:10px;background:linear-gradient(180deg,#183a26,#0b2216);border:2px solid #3f8a5c;border-radius:10px;width:max-content;max-width:100%}
.css-setup-bubblebar .css-setup-slot{border-radius:50%}
.css-setup-foodbar{display:flex;flex-wrap:wrap;gap:10px;padding:10px;background:linear-gradient(180deg,#3a2316,#22140b);border:2px solid #8a5a32;border-radius:10px;width:max-content;max-width:100%}
.css-setup-gold .css-setup-slot{border-color:#d4a017}
.css-setup-statue{background:rgba(10,18,44,.55);border:1px solid #2b3d6b;border-radius:8px;padding:6px 4px}
.css-setup-statue select{font-size:11px;max-width:72px}
.css-setup-statue .css-setup-slot{cursor:default}
.css-setup-comp{cursor:pointer}
.css-setup-root button.css-setup-cmp{padding:2px;border-radius:8px;background:rgba(10,18,44,.55)}
.css-setup-root button.css-setup-cmp.css-setup-chg{border-color:var(--gold,#ffd700)}
.css-setup-comp label{font-size:10px;color:var(--text2,#c0c0d4)}
.css-setup-collapse{margin:6px 0;border:1px solid #2b3d6b;border-radius:6px}
.css-setup-root .css-setup-collapse>button.css-setup-ctitle{display:flex;width:100%;justify-content:space-between;background:rgba(15,52,96,.5);border:none;border-radius:6px 6px 0 0;color:var(--cyan,#4dd0e1);font-weight:600;padding:4px 8px;text-align:left}
.css-setup-collapse>.css-setup-cbody{padding:6px 8px}
.css-setup-talwrap{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-start}
.css-setup-tal-detail .css-setup-step{border-color:#b08a4e}
.css-setup-root .css-setup-tal-detail .css-setup-step button{background:#7a5c33;color:#fff}
.css-setup-root .css-setup-tal-detail .css-setup-step input[type=number]{background:#fff8e8;color:#2a1f14}
.css-setup-tal-ico[draggable=true]{cursor:grab}
.css-setup-barhead{display:flex;gap:8px;align-items:center;margin:10px 0 4px}
.css-setup-stage{position:relative;image-rendering:pixelated;background-size:100% 100%;background-repeat:no-repeat;flex:none}
.css-setup-stage-fb{background-color:#141b33;border:2px solid #3a4470;border-radius:6px}
.css-setup-at{position:absolute}
.css-setup-px{image-rendering:pixelated}
.css-setup-root button.css-setup-hot{position:absolute;background:transparent;border:0;padding:0;margin:0;display:flex;align-items:center;justify-content:center;cursor:pointer;border-radius:4px;color:var(--text,#eee)}
.css-setup-root button.css-setup-hot:hover,.css-setup-root button.css-setup-hot:focus-visible{outline:2px solid rgba(255,255,255,.55);outline-offset:-2px}
.css-setup-root button.css-setup-hot.css-setup-chg{outline:2px solid var(--gold,#ffd54f);outline-offset:-2px}
.css-setup-root button.css-setup-hot.css-setup-sel{outline:3px solid var(--cyan,#4dd0e1);outline-offset:-3px}
.css-setup-dim{opacity:.45}
.css-setup-hot-cap{position:absolute;right:2px;bottom:0;font-size:11px;font-weight:700;color:#fff;text-shadow:0 0 2px #000,1px 1px 0 #000;pointer-events:none}
.css-setup-super{position:absolute;left:1px;top:1px;min-width:14px;height:14px;border-radius:7px;background:var(--gold,#ffd700);color:#000;font-size:10px;font-weight:800;line-height:14px;text-align:center;pointer-events:none}
.css-setup-super.css-setup-super-off{background:#666;color:#ddd}
.css-setup-tabtxt{font-size:11px;font-weight:700;color:#fff;text-shadow:1px 1px 0 #000}
.css-setup-root button.css-setup-eqtab,.css-setup-root button.css-setup-btab{opacity:.6}
.css-setup-root button.css-setup-eqtab.css-setup-on,.css-setup-root button.css-setup-btab.css-setup-on{opacity:1;outline:2px solid var(--gold,#ffd54f);outline-offset:-2px}
.css-setup-ico-bare{background:none!important;border:0!important;box-shadow:none!important}
.css-setup-tbook{flex:none}
.css-setup-talw{width:56px;height:56px}
.css-setup-talw>button{width:56px;height:56px}
.css-setup-tallv{position:absolute;left:0;right:0;top:44px;text-align:center;font-size:12px;font-weight:700;color:#fff;text-shadow:-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000,1px 1px 0 #000;pointer-events:none}
.css-setup-talpm{position:absolute;top:-10px;left:0;right:0;display:none;justify-content:space-between;z-index:2}
.css-setup-talw:hover .css-setup-talpm,.css-setup-talw:focus-within .css-setup-talpm{display:flex}
.css-setup-root .css-setup-talpm button{width:20px;height:18px;padding:0;font-size:13px;line-height:1;border-radius:3px;background:#7a5c33;color:#fff;border:1px solid #2a1f14}
.css-setup-skillbars{display:flex;flex-direction:column;gap:6px}
.css-setup-atkrow{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.css-setup-atkw{width:56px;height:56px;flex:none}
.css-setup-atkw:not(.css-setup-at){position:relative}
.css-setup-atkw>button:first-child{width:56px;height:56px}
.css-setup-root .css-setup-atkx{position:absolute;top:-4px;right:-4px;width:18px;height:18px;padding:0;font-size:12px;line-height:1;border-radius:50%;display:none;background:#5a1d1d;color:#fff;border:1px solid #000;z-index:2}
.css-setup-atkw:hover .css-setup-atkx,.css-setup-atkw:focus-within .css-setup-atkx{display:block}
.css-setup-root .css-setup-atkarrow{padding:2px 8px}
.css-setup-slot-key{position:absolute;left:3px;top:1px;font-size:10px;color:#fff;text-shadow:1px 1px 0 #000;pointer-events:none}
.css-setup-drop{outline:3px dashed var(--cyan,#4dd0e1)!important;outline-offset:-3px}
.css-setup-tipl{margin-top:3px;line-height:1.35}
.css-setup-stt{border-collapse:collapse;font-size:12px;margin:4px 0}
.css-setup-stt th,.css-setup-stt td{padding:2px 6px;border-bottom:1px solid rgba(255,255,255,.08);text-align:right}
.css-setup-stt th:first-child,.css-setup-stt td:first-child{text-align:left}
.css-setup-pos{color:#7ee787}
.css-setup-neg{color:#ff7b72}
.css-setup-uqrow{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin:3px 0}
.css-setup-scope{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px}
.css-setup-root .css-setup-scope button{font-weight:600;padding:5px 12px;background:var(--bg2,#16213e)}
.css-setup-root .css-setup-scope button.css-setup-active{background:var(--accent,#e94560);color:#fff}
.css-setup-badge{display:inline-block;margin-left:4px;padding:0 5px;border-radius:8px;background:var(--accent,#e94560);color:#fff;font-size:10px;line-height:15px}
.css-setup-scope button.css-setup-active .css-setup-badge{background:#fff;color:var(--accent,#e94560)}
.css-setup-banner{font-size:11px;color:var(--text2,#aaa);padding:4px 8px;margin:0 0 8px;border-left:3px solid var(--cyan,#4dd0e1);background:rgba(77,208,225,.06)}
.css-setup-banner-acct{border-left-color:var(--gold,#ffd700);background:rgba(255,215,0,.06)}
.css-setup-sysrow{display:flex;flex-wrap:wrap;margin:0 0 6px}
.css-setup-sysrow button img{width:16px;height:16px;vertical-align:middle;margin-right:3px;image-rendering:pixelated}
.css-setup-choice{max-width:220px}
.css-setup-root .css-setup-gcell .css-setup-choice{width:100%;max-width:100%;font-size:10px;padding:1px 0}
.css-setup-seg{display:inline-flex;margin:4px 0;border:1px solid var(--bg3,#2a3355);border-radius:5px;overflow:hidden}
.css-setup-root .css-setup-seg button{border:0;border-radius:0;margin:0;background:var(--bg2,#16213e);color:var(--text2,#aaa)}
.css-setup-root .css-setup-seg button.css-setup-on{background:var(--accent,#e94560);color:#fff}
.css-setup-seg-wrap{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.css-setup-grid-wide{grid-template-columns:repeat(auto-fill,minmax(120px,1fr))}
.css-setup-gname{font-size:11px;color:var(--text2,#aaa);text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}
.css-setup-tiles{display:flex;flex-wrap:wrap;gap:10px}
.css-setup-tile{display:flex;flex-direction:column;align-items:center;gap:3px;width:96px;text-align:center;font-size:11px}
.css-setup-root button.css-setup-signbtn,.css-setup-root button.css-setup-bubslot,.css-setup-root button.css-setup-chipslot{width:60px;height:60px;padding:0;display:flex;align-items:center;justify-content:center;background:#10182e;border:2px solid #3a4470;border-radius:8px}
.css-setup-root button.css-setup-bubslot{border-radius:50%}
.css-setup-root button.css-setup-signbtn.css-setup-chg,.css-setup-root button.css-setup-bubslot.css-setup-chg,.css-setup-root button.css-setup-chipslot.css-setup-chg{border-color:var(--gold,#ffd54f)}
.css-setup-signstar{font-size:30px;color:var(--gold,#ffd54f);text-shadow:0 0 6px rgba(255,213,79,.6)}
.css-setup-chiprow{display:flex;flex-wrap:wrap;gap:8px}
.css-setup-tiers{display:inline-flex;gap:2px}
.css-setup-root .css-setup-tiers button{padding:1px 6px;font-size:11px;opacity:.55}
.css-setup-root .css-setup-tiers button.css-setup-on{opacity:1;outline:1px solid #fff}
.css-setup-root .css-setup-tiers .css-setup-tier0{background:#5d4a2c;color:#fff}
.css-setup-root .css-setup-tiers .css-setup-tier1{background:#b8901c;color:#fff}
.css-setup-root .css-setup-tiers .css-setup-tier2{background:#3b2a52;color:#fff}
.css-setup-root .css-setup-tiers .css-setup-tier3{background:#2c7a8c;color:#fff}
.css-setup-fgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(52px,1fr));gap:4px}
.css-setup-fcell{position:relative;width:52px;height:52px}
.css-setup-root .css-setup-fcell>button:first-child{width:52px;height:52px;padding:0;display:flex;align-items:center;justify-content:center;background:#10182e;border:1px solid #3a4470;border-radius:6px}
.css-setup-root .css-setup-revx{position:absolute;top:-4px;right:-4px;width:16px;height:16px;padding:0;font-size:10px;line-height:1;border-radius:50%}
.css-setup-fold{margin:6px 0;border:1px solid var(--bg3,#2a3355);border-radius:6px;padding:4px 8px;background:rgba(0,0,0,.12)}
.css-setup-fold summary{cursor:pointer;font-weight:600;color:var(--text,#eee);padding:2px 0}
.css-setup-cardstage{flex:none}
.css-setup-cardempty{display:block;width:56px;height:72px;border:2px dashed rgba(255,255,255,.25);border-radius:5px}
.css-setup-nopt{pointer-events:none}
.css-setup-labscroll{overflow-x:auto;max-width:100%;padding-bottom:4px}
.css-setup-labmap2{position:relative;cursor:crosshair;background:#0b1226;border:1px solid #2a3355;border-radius:6px;flex:none}
.css-setup-labdot{position:absolute;width:10px;height:10px;border-radius:50%;background:var(--gold,#ffd54f);transform:translate(-50%,-50%);box-shadow:0 0 4px #000;pointer-events:none}
.css-setup-labdot.css-setup-sel{width:16px;height:16px;background:var(--cyan,#4dd0e1);border:2px solid #fff;z-index:2}
.css-setup-labmf{position:absolute;width:12px;height:12px;background:#26a69a;transform:translate(-50%,-50%);opacity:.8;pointer-events:none}
.css-setup-labjw{position:absolute;width:10px;height:10px;background:#9c6ade;transform:translate(-50%,-50%) rotate(45deg);opacity:.8;pointer-events:none}
.css-setup-obolhot{border-radius:8px}
`;

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function fmt(v) {
  if (v == null || v === '') return '0';
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000);
}
function strip(p) { const q = Object.assign({}, p); delete q.ci; return q; }

function _injectCss() {
  if (typeof document === 'undefined' || document.getElementById('css-setup-style')) return;
  const st = document.createElement('style');
  st.id = 'css-setup-style';
  st.textContent = STYLE_TEXT + PICKER_CSS + V.VISUAL_CSS + EXTRA_CSS;
  document.head.appendChild(st);
}

function _storage() {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; }
}

/**
 * Mount the editor. Returns { apply(raw) -> raw, current() -> setup, load(setup),
 * summary() -> { changed, lines }, reset(), refresh(), derivedChanged() }.
 * opts.getDerived() -> { base, current, pending } feeds the read-only Derived values view.
 */
export function mountCombatSetup(host, opts) {
  opts = opts || {};
  const getRaw = typeof opts.getRawSave === 'function' ? opts.getRawSave : () => null;
  const getCi = typeof opts.getCharIdx === 'function' ? opts.getCharIdx : () => 0;
  const onChange = typeof opts.onChange === 'function' ? opts.onChange : () => {};
  const getDerived = typeof opts.getDerived === 'function' ? opts.getDerived : () => null;
  _injectCss();

  let setup = CS.emptyCombatSetup(Number(getCi()) || 0);
  const store = _storage();
  let storageError = '';
  try { setup = readCombatDraft(store, Number(getCi()) || 0); }
  catch (e) { storageError = 'Could not restore loadout: ' + e.message; }
  setup.charIdx = Number(getCi()) || 0;

  const ui = { tab: 'gear', lastCharTab: 'gear', world: 'W1', acctSys: {}, filters: {}, expanded: {}, copyFrom: 0, message: storageError,
    gearSel: { row: 0, slot: 1 }, obolSel: null, talPage: null, talSel: null, stoneMode: null, allBars: false };
  const cache = { raw: null, setupJson: null, ci: null, patched: null, state: null, base: null, keys: null, diff: null };
  const datalists = {};

  host.innerHTML = '';
  const root = document.createElement('div');
  root.className = 'css-setup-root';
  host.appendChild(root);
  installIconFallback(root);
  loadUiAssets();
  onUiAssets(() => { if (root.isConnected) scheduleRender(); });
  let tip = document.getElementById('css-setup-tip');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'css-setup-tip';
    tip.className = 'css-setup-tip';
    document.body.appendChild(tip);
  }
  const dlHost = document.createElement('div');
  dlHost.style.display = 'none';
  root.appendChild(dlHost);
  const view = document.createElement('div');
  root.appendChild(view);

  // ----- derived state ------------------------------------------------------
  function ci() { return Number(getCi()) || 0; }
  const drafts = new Map();
  function switchCharacter() {
    if (setup.charIdx === ci()) return;
    drafts.set(setup.charIdx, setup);
    try { setup = drafts.get(ci()) || readCombatDraft(store, ci()); }
    catch (e) { setup = CS.emptyCombatSetup(ci()); ui.message = 'Could not restore loadout: ' + e.message; }
    ui.talPage = null; ui.talSel = null; ui.obolSel = null;
    cache.raw = null;
  }
  function compute() {
    switchCharacter();
    const raw = getRaw();
    const json = JSON.stringify(setup);
    if (cache.raw === raw && cache.setupJson === json && cache.ci === ci()) return cache;
    cache.raw = raw; cache.setupJson = json; cache.ci = ci();
    if (!raw) { cache.patched = null; cache.state = null; cache.base = null; cache.keys = new Set(); cache.diff = { changed: 0, lines: [], changes: [], warnings: [] }; return cache; }
    setup.charIdx = ci();
    cache.patched = CS.applyCombatSetup(raw, setup);
    cache.state = CS.readCombatSetupState(cache.patched, ci());
    cache.base = CS.readCombatSetupState(raw, ci());
    cache.keys = new Set(setup.patches.map(p => CS.patchKey(p, ci())));
    cache.diff = CS.diffCombatSetup(raw, setup);
    return cache;
  }
  function changed(p) { return compute().keys.has(CS.patchKey(p, ci())); }

  function commit() {
    setup.charIdx = ci();
    try { if (store) store.setItem(COMBAT_DRAFT_PREFIX + ci(), JSON.stringify(setup)); }
    catch (e) { ui.message = 'Could not save working loadout: ' + e.message; }
    try { onChange(); } catch (e) { console.error(e); }
    scheduleRender();
  }
  function upsert(p) { setup = CS.upsertPatch(setup, strip(p)); commit(); }
  function remove(p) { setup = CS.removePatch(setup, CS.patchKey(strip(p), ci())); commit(); }
  function findPatch(p) { const k = CS.patchKey(strip(p), ci()); return setup.patches.find(q => CS.patchKey(q, ci()) === k) || null; }

  // ----- datalists ----------------------------------------------------------
  function datalist(id, options) {
    if (datalists[id]) return id;
    const dl = document.createElement('datalist');
    dl.id = 'css-setup-dl-' + id + '-' + Math.random().toString(36).slice(2, 7);
    dl.innerHTML = options.map(o => '<option value="' + esc(o.name + ' [' + o.key + ']') + '"></option>').join('');
    dlHost.appendChild(dl);
    datalists[id] = { el: dl, options };
    return id;
  }
  function dlId(id) { return datalists[id] ? datalists[id].el.id : ''; }
  function parsePick(id, text) {
    const t = String(text || '').trim();
    if (!t) return null;
    const m = /\[([^\]]+)\]\s*$/.exec(t);
    if (m) return m[1];
    const opts2 = datalists[id] ? datalists[id].options : [];
    const exact = opts2.find(o => String(o.key) === t) || opts2.find(o => o.name.toLowerCase() === t.toLowerCase());
    return exact ? exact.key : undefined;
  }
  function itemDl(row, slot) {
    const id = 'item-' + row + '-' + (row === 0 ? slot : (row === 1 ? slot : 'x'));
    return datalist(id, [{ key: 'Blank', name: '(empty)' }].concat(CS.itemOptionsForSlot(row, slot)));
  }

  // ----- rendering helpers --------------------------------------------------
  function pickInput(dl, key, name, attrs) {
    return '<input class="css-setup-item" list="' + esc(dlId(dl)) + '" data-dl="' + esc(dl) + '" value="' + esc(name + (key != null && key !== '' ? ' [' + key + ']' : '')) + '" ' + attrs + '>';
  }
  function num(value, attrs) { return '<input type="number" step="any" value="' + esc(fmt(value)) + '" ' + attrs + '>'; }
  function saveNote(before, after) { return String(before) === String(after) ? '' : '<span class="css-setup-save">save: ' + esc(before) + '</span>'; }
  function help(text) { return '<span class="css-setup-help" data-tip="' + esc(text) + '">?</span>'; }
  /** Toolbar: optional controls, copy-from (character tabs) and reset. `tab` is a testFor id. */
  function tools(tab, extra) {
    let h = '<div class="css-setup-tools">';
    if (extra) h += extra;
    if (COPY_SYSTEMS[tab]) {
      const raw = getRaw();
      const chars = raw ? CS.characterOptions(raw) : [];
      h += '<span>Copy from</span><select data-act="copyFrom">' + chars.map(c => '<option value="' + c.ci + '"' + (c.ci === Number(ui.copyFrom) ? ' selected' : '') + '>' + esc(c.name + ' (' + c.className + ')') + '</option>').join('') + '</select>';
      h += '<button data-act="copy" data-tab="' + tab + '">Copy</button>';
    }
    h += '<button data-act="resetTab" data-tab="' + esc(tab) + '" class="css-setup-danger">' + (/^sys:/.test(tab) ? 'Reset system' : 'Reset tab') + '</button></div>';
    return h;
  }
  /** Selected account system for the current world. */
  function curAcct() { return acctSystem(ui.acctSys[ui.world]) || acctSystemsOf(ui.world)[0] || null; }
  /** Filter key for the visible editor: a character tab id or sys:<account system id>. */
  function filterKey() { if (ui.tab === 'acct') { const s = curAcct(); return s ? 'sys:' + s.id : 'acct'; } return ui.tab; }
  function filterBox(tab, placeholder) {
    return '<input type="search" data-act="filter" data-tab="' + tab + '" placeholder="' + esc(placeholder || 'Filter') + '" value="' + esc(ui.filters[tab] || '') + '" data-fid="filter-' + tab + '">';
  }
  function match(tab, text) {
    const f = (ui.filters[tab] || '').trim().toLowerCase();
    return !f || String(text).toLowerCase().indexOf(f) >= 0;
  }
  function attrsOf(p, extra) {
    return "data-patch='" + esc(JSON.stringify(p)) + "' " + (extra || '');
  }

  function statsEditor(kind, row, slot, item, stats, fid) {
    const s = stats || {};
    const keys = CS.EQUIP_STAT_KEYS;
    let h = '<div class="css-setup-stats">';
    keys.forEach(k => {
      const isTxt = /txt$/.test(k);
      const v = s[k] == null ? (isTxt ? '' : 0) : s[k];
      h += '<label>' + esc(k.replace(/_/g, ' ')) + (isTxt
        ? '<input data-act="stat" data-kind="' + kind + '" data-row="' + row + '" data-slot="' + slot + '" data-stat="' + k + '" data-fid="' + fid + k + '" value="' + esc(v === 0 ? '' : v) + '" style="width:130px">'
        : '<input type="number" step="any" data-act="stat" data-kind="' + kind + '" data-row="' + row + '" data-slot="' + slot + '" data-stat="' + k + '" data-fid="' + fid + k + '" value="' + esc(fmt(v)) + '">') + '</label>';
    });
    return h + '</div>';
  }

  // ----- visual helpers -----------------------------------------------------
  let rtips = [];
  const GEAR_STATS = ['Weapon_Power', 'STR', 'AGI', 'WIS', 'LUK', 'Defence', 'Reach', 'Speed'];
  const TIER_SYS = ['statues', 'statuesGold', 'statuesOnyx', 'statuesZenith'];
  const TIER_NAMES = ['Normal', 'Gold', 'Onyx', 'Zenith'];
  const BUBBLE_CATS = [{ id: 'a', label: 'Power' }, { id: 'b', label: 'Quicc' }, { id: 'c', label: 'High-IQ' }, { id: 'd', label: 'Kazam' }];
  function n0(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
  function sgn(v) { return (n0(v) > 0 ? '+' : '') + fmt(n0(v)); }
  function qtyStr(v) {
    const n = n0(v), a = Math.abs(n);
    if (a >= 1e12) return (n / 1e12).toFixed(1) + 'T';
    if (a >= 1e9) return (n / 1e9).toFixed(1) + 'B';
    if (a >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (a >= 1e4) return Math.round(n / 1e3) + 'K';
    return String(Math.round(n));
  }
  function rt(fn) { rtips.push(fn); return ' data-rt="' + (rtips.length - 1) + '"'; }
  function tipHtml(title, lines) {
    return '<div class="css-setup-card"><div class="css-setup-card-name">' + esc(title) + '</div>' +
      (lines || []).filter(Boolean).map(l => '<div class="css-setup-tipl">' + l + '</div>').join('') + '</div>';
  }
  function bgStyle(u) { return u ? 'background-image:url(&quot;' + esc(u) + '&quot;);' : ''; }
  function stage(sys, frame, w, h, inner, cls, style) {
    const u = frame ? frameUrl(sys, frame) : null;
    return '<div class="css-setup-stage' + (u ? '' : ' css-setup-stage-fb') + (cls ? ' ' + cls : '') + '" style="width:' + w + 'px;height:' + h + 'px;' + bgStyle(u) + (style || '') + '">' + inner + '</div>';
  }
  function frameImg(sys, frame, w, h) {
    const u = frameUrl(sys, frame);
    return u ? '<img class="css-setup-px" src="' + esc(u) + '" alt="" draggable="false"' + (w ? ' style="width:' + w + 'px;height:' + h + 'px"' : '') + '>' : '';
  }
  function hot(x, y, w, h, attrs, inner, cls) {
    return '<button type="button" class="css-setup-hot' + (cls ? ' ' + cls : '') + '" style="left:' + x + 'px;top:' + y + 'px;width:' + w + 'px;height:' + h + 'px" ' + attrs + '>' + inner + '</button>';
  }
  function stepper(value, attrs, o) {
    o = o || {};
    const lim = (o.min != null ? ' min="' + o.min + '"' : '') + (o.max != null ? ' max="' + o.max + '"' : '');
    return '<span class="css-setup-step"><button type="button" data-act="stepBtn" data-d="-1" tabindex="-1" aria-label="Decrease">\u2212</button>' +
      '<input type="number" step="any" value="' + esc(fmt(value)) + '"' + lim + (o.width ? ' style="width:' + o.width + 'px"' : '') + (o.disabled ? ' disabled' : '') + ' ' + attrs + '>' +
      '<button type="button" data-act="stepBtn" data-d="1" tabindex="-1" aria-label="Increase">+</button></span>';
  }
  function pill(before, after, p) {
    if (String(before) === String(after)) return '';
    return '<span class="css-setup-pill">was <s>' + esc(before) + '</s>' + (p ? '<button type="button" data-act="unpatch" ' + attrsOf(p) + ' data-tip="Revert to the save value" aria-label="Revert">\u21ba</button>' : '') + '</span>';
  }
  function cardbox(title, inner, right) {
    return '<div class="css-setup-cardbox">' + (title ? '<div class="css-setup-h">' + title + (right || '') + '</div>' : '') + inner + '</div>';
  }
  function chgCls(p) { return changed(p) ? ' css-setup-chg' : ''; }
  function selAttr(obj) { return " data-sel='" + esc(JSON.stringify(obj)) + "'"; }
  function classGroup(id) { id = n0(id); return id < 6 ? 'BEGINNER' : id < 18 ? 'WARRIOR' : id < 30 ? 'ARCHER' : id < 42 ? 'MAGE' : ''; }
  const ownedCache = { raw: null, set: null };
  function ownedSet() {
    const raw = getRaw();
    if (ownedCache.raw !== raw) {
      ownedCache.raw = raw;
      try { ownedCache.set = raw ? CS.ownedItemKeys(raw) : new Set(); } catch (e) { ownedCache.set = new Set(); }
    }
    return ownedCache.set || new Set();
  }
  function itemEntry(key, name) {
    const def = ITEMS[key] || {};
    const nm = gameText(name || def.displayName || key);
    const lv = n0(def.lvReqToEquip);
    return { key, name: nm, icon: iconHtml('items', key, nm, { size: 36 }),
      sub: [def.Class && def.Class !== 'ALL' ? gameText(def.Class) : '', lv ? 'Lv ' + lv : ''].filter(Boolean).join(' \u00b7 '),
      cls: String(def.Class || ''), lv, typeGen: def.typeGen, search: nm + ' ' + key + ' ' + gameText(def.Type || '') };
  }
  const instCache = { raw: null, ci: null, list: [] };
  const INST_STAT = { Weapon_Power: 'WP', STR: 'STR', AGI: 'AGI', WIS: 'WIS', LUK: 'LUK', Defence: 'Def', Reach: 'Reach', Speed: 'Spd', Power: 'Pow' };
  function instStatText(s) {
    if (!s) return '';
    const parts = [];
    for (const k in INST_STAT) if (n0(s[k])) parts.push((n0(s[k]) > 0 ? '+' : '') + n0(s[k]) + ' ' + INST_STAT[k]);
    for (const q of [1, 2]) {
      const v = n0(s['UQ' + q + 'val']), t = s['UQ' + q + 'txt'];
      if (v && t && t !== 0 && t !== '0') parts.push('+' + v + gameText(String(t)).replace(/_/g, ' '));
    }
    return parts.join(', ');
  }
  function sameStats(a, b) {
    a = a || {}; b = b || {};
    const keys = new Set(Object.keys(a).concat(Object.keys(b)));
    for (const k of keys) if (String(a[k] == null ? 0 : a[k]) !== String(b[k] == null ? 0 : b[k])) return false;
    return true;
  }
  /** Physical owned copies (inventory, storage, other characters' gear) that fit a slot. */
  function instanceEntries(charIdx, fits) {
    const raw = getRaw();
    if (instCache.raw !== raw || instCache.ci !== charIdx) {
      instCache.raw = raw; instCache.ci = charIdx;
      instCache.list = [];
      try {
        instCache.list = (raw ? CS.ownedItemInstances(raw, charIdx) : []).map(inst => {
          const e = itemEntry(inst.key, inst.name);
          const who = inst.ci == null ? '' : CS.characterName(raw, inst.ci);
          const where = inst.source === 'storage' ? 'Storage' : inst.source === 'equipped' ? 'Equipped \u00b7 ' + who : 'Inventory \u00b7 ' + who;
          const st = instStatText(inst.stats);
          return Object.assign(e, { key: 'inst:' + inst.source + ':' + (inst.ci == null ? '' : inst.ci) + ':' + (inst.row == null ? '' : inst.row + ':') + inst.index,
            item: inst.key, inst, cat: inst.source === 'storage' ? 'storage' : inst.source === 'inventory' && inst.ci === charIdx ? 'mine' : 'others',
            sub: [where, st || 'no upgrades', e.sub].filter(Boolean).join(' \u00b7 '), search: e.search + ' ' + where + ' ' + st });
        });
      } catch (e) { instCache.list = []; }
    }
    return instCache.list.filter(it => fits.has(it.item));
  }
  function itemToggles(c, o) {
    o = o || {};
    const owned = ownedSet();
    const grp = classGroup(c.state.character.classId), lvl = n0(c.state.character.level);
    const t = [];
    if (o.cls) t.push({ id: 'cls', label: 'My class', checked: true, test: it => !grp || !it.cls || it.cls === 'ALL' || it.cls === grp || (grp === 'BEGINNER' && it.cls === 'JOURNEYMAN') });
    if (o.lv) t.push({ id: 'lv', label: 'Usable at Lv ' + lvl, checked: false, test: it => it.lv <= lvl });
    t.push({ id: 'own', label: owned.size ? 'Owned only' : 'Owned only (no inventory data)', checked: false, test: it => !!it.inst || owned.has(it.key) });
    return t;
  }
  function tableIcon(id, i, name, size) {
    const o = { size: size || 40 };
    let m = /^bubbles(\d)$/.exec(id);
    if (m) return iconHtml('bubbles', 'abcd'[Number(m[1])] + i, name, o);
    m = /^stamps([ABC])$/.exec(id);
    if (m) return iconHtml('stamps', 'Stamp' + m[1] + (Number(i) + 1), name, o);
    const sys = { vials: 'vials', sigils: 'sigils', labJewels: 'jewels', divinityBless: 'gods', prayerLevels: 'prayers', meals: 'meals', atoms: 'atoms',
      vault: 'vault', arcane: 'arcane', grimoire: 'grimoire', guild: 'guild', bribes: 'bribes', dream: 'dreams', saltLick: 'saltLick', statueTiers: 'statues' }[id];
    return iconHtml(sys || ('t-' + id), i, name, o);
  }

  /** Icon grid of a level table (replaces the old row table). */
  function tableGrid(c, tableId, o) {
    o = o || {};
    const rows = CS.readTable(c.patched, tableId, ci());
    const brows = new Map(CS.readTable(getRaw(), tableId, ci()).map(r => [r.index, r]));
    const tabFilter = o.filterTab || filterKey();
    let h = '<div class="css-setup-grid">';
    let shown = 0, total = 0;
    rows.forEach((r, i) => {
      if (o.include && !o.include(r)) return;
      if (!match(tabFilter, r.name + ' ' + r.index)) return;
      total++;
      if (shown >= ROW_CAP) return;
      shown++;
      const p = { system: 'table', table: tableId, index: r.index };
      const b = brows.has(r.index) ? brows.get(r.index).value : 0;
      const numeric = typeof r.value === 'number' || r.value == null || (typeof r.value === 'string' && r.value.trim() !== '' && Number.isFinite(Number(r.value)));
      const nm = gameText(r.name);
      const lbl = v => CS.tableValueLabel(tableId, r.index, v);
      const fid = 'data-fid="t-' + tableId + '-' + r.index + '"';
      let ctl;
      if (r.kind === 'flag') {
        ctl = '<label class="css-setup-check"><input type="checkbox" ' + attrsOf(p, 'data-act="table" ' + fid) + (Number(r.value) ? ' checked' : '') + '>' + (Number(r.value) ? 'On' : 'Off') + '</label>';
      } else if (r.kind === 'choice') {
        const opts = (r.options || []).filter(x => !/^PlayerSelect/i.test(x.label) || String(x.value) === String(r.value));
        if (!opts.some(x => String(x.value) === String(r.value))) opts.unshift({ value: r.value, label: lbl(r.value) });
        ctl = '<select class="css-setup-choice" ' + attrsOf(p, 'data-act="table" ' + fid) + '>' + opts.map(x => '<option value="' + esc(x.value) + '"' + (String(x.value) === String(r.value) ? ' selected' : '') + '>' + esc(gameText(x.label)) + '</option>').join('') + '</select>';
      } else if (r.kind === 'readonly') {
        ctl = '<span class="css-setup-muted">' + esc(fmt(r.value)) + ' (read-only)</span>';
      } else if (numeric) {
        ctl = stepper(r.value, attrsOf(p, 'data-act="table" ' + fid), { min: o.min != null ? o.min : null, max: r.max != null ? r.max : o.max });
      } else {
        ctl = '<span class="css-setup-muted">' + esc(r.value) + ' (use Raw)</span>';
      }
      h += '<div class="css-setup-gcell' + chgCls(p) + '">' +
        '<span' + rt(() => tipHtml(nm, ['#' + r.index + ' \u00b7 ' + esc(lbl(r.value)), String(b) !== String(r.value) ? 'save: ' + esc(lbl(b)) : ''])) + '>' + tableIcon(tableId, r.index, nm, 40) + '</span>' +
        '<div class="css-setup-gname">' + esc(nm) + '</div>' + ctl +
        pill(lbl(b), lbl(r.value), p) + '</div>';
    });
    h += '</div>';
    if (total > shown) h += '<div class="css-setup-muted">Showing ' + shown + ' of ' + total + '; filter to narrow.</div>';
    if (!total) h += '<div class="css-setup-muted">No entries match.</div>';
    return h;
  }
  const tableBlock = tableGrid;
  function details(key, summary, inner) {
    return '<details class="css-setup-fold" data-key="' + esc(key) + '"' + (ui.expanded[key] ? ' open' : '') + '><summary>' + summary + '</summary>' + (ui.expanded[key] ? inner() : '') + '</details>';
  }

  // ----- equipment ----------------------------------------------------------
  function equipRows(c, row) { return row === 0 ? c.state.equipment.armor : c.state.equipment.tools; }
  function baseEquipRows(c, row) { return row === 0 ? c.base.equipment.armor : c.base.equipment.tools; }
  function slotOf(list, slot) { return (list || []).find(x => x.slot === slot) || null; }
  /** Manual (unattributed) EMm delta + stone list of one equipped instance. */
  function gearInstance(c, row, slot) {
    const r = slotOf(equipRows(c, row), slot);
    const b = slotOf(baseEquipRows(c, row), slot) || {};
    const pp = findPatch({ system: 'equipment', row, slot });
    let extra, stones = [];
    if (pp && (pp.extra || pp.stones)) {
      extra = pp.extra || (pp.item === b.item ? (b.stats || {}) : {});
      stones = pp.stones || [];
    } else if (pp && pp.stats) extra = pp.stats;
    else extra = (r && r.stats) || {};
    return { r, b, item: r ? r.item : 'Blank', extra: JSON.parse(JSON.stringify(extra || {})), stones: JSON.parse(JSON.stringify(stones)) };
  }
  function gearCardInst(c, row, slot) {
    const g = gearInstance(c, row, slot);
    const res = ST.applyStones(g.item, g.extra, g.stones, { classId: c.state.character.classId });
    const un = {};
    ST.STONE_NUMERIC_STATS.forEach(k => { if (n0(g.extra[k])) un[k] = n0(g.extra[k]); });
    return { added: res.stats, stones: res.applied.map(a => ({ name: a.name, failed: a.failed })), slotsLeft: res.slotsLeft, slotsTotal: res.slotsTotal, unattributed: g.stones.length ? un : null };
  }
  function gearEdit(row, slot, fn) {
    const g = gearInstance(compute(), row, slot);
    if (!g.r || !g.item || g.item === 'Blank') return;
    fn(g.extra, g.stones);
    upsert({ system: 'equipment', row, slot, item: g.item, extra: g.extra, stones: g.stones });
  }
  function equipStage(tab, slotsHtml) {
    const tabX = [6, 66, 125], labels = ['Equips', 'Tools', 'Food'];
    let inner = '';
    for (let t = 0; t < 3; t++) {
      const art = frameImg('equipment', 'UIinventoryEquipTabs' + (t + 1));
      inner += hot(tabX[t], 9, 58, 44, 'data-act="gearTab" data-t="' + t + '" aria-label="' + labels[t] + '"' + rt(() => esc(labels[t])),
        art || '<span class="css-setup-tabtxt">' + labels[t] + '</span>', 'css-setup-eqtab' + (t === tab ? ' css-setup-on' : ''));
    }
    return stage('equipment', 'UIinventoryEquips', 203, 394, inner + slotsHtml);
  }
  function eqSlotHtml(c, row, slot, t, placeholder) {
    const x = 23 + 78 * (t % 2), y = 69 + 74 * Math.floor(t / 2);
    const r = slotOf(equipRows(c, row), slot);
    if (!r) return '<div class="css-setup-at" style="left:' + x + 'px;top:' + y + 'px">' + frameImg('equipment', 'LockedInvSpace', 72, 72) + '</div>';
    const p = { system: 'equipment', row, slot };
    const sel = ui.gearSel && ui.gearSel.row === row && ui.gearSel.slot === slot;
    const empty = !r.item || r.item === 'Blank';
    const inner = empty ? (frameImg('equipment', 'EquipmentTransparent' + placeholder, 72, 72) || '<span class="css-setup-tabtxt">' + esc(gameText(r.slotName)) + '</span>')
      : iconHtml('items', r.item, r.name, { size: 72, cls: 'css-setup-ico-bare' });
    return hot(x, y, 72, 72, 'data-pick="gear" data-row="' + row + '" data-slot="' + slot + '" data-fid="gear-' + row + '-' + slot + '"' + selAttr({ gearSel: { row, slot } }) +
      ' aria-label="' + esc(gameText(r.slotName) + ': ' + gameText(r.name)) + '"' +
      rt(() => empty ? tipHtml(gameText(r.slotName), ['(empty) \u2014 click to pick an item']) : itemCardHtml(r.item, gearCardInst(compute(), row, slot))),
      inner, chgCls(p) + (sel ? ' css-setup-sel' : ''));
  }

  // ----- tabs ---------------------------------------------------------------
  function renderGear(c) {
    const tab = ui.gearTab === 1 ? 1 : 0;
    const page = ui.gearPage === 1 ? 1 : 0;
    let slots = '';
    if (tab === 0) for (let t = 0; t < 8; t++) slots += eqSlotHtml(c, 0, t + 8 * page, t, page ? 101 + t : t + 1);
    else for (let t = 0; t < 8; t++) slots += eqSlotHtml(c, 1, t, t, 9 + t);
    let h = tools('gear', help('Click a slot to pick an item. Added stats are the save\u2019s upgrade deltas (EMm0/EMm1) on top of the item\u2019s base stats; stones add to them and consume upgrade slots.'));
    let left = equipStage(tab, slots);
    if (tab === 0) {
      left += '<div class="css-setup-seg">' + ['Core', 'Premium'].map((l, i) => '<button type="button" data-act="gearPage" data-page="' + i + '" class="' + (i === page ? 'css-setup-on' : '') + '">' + l + ' slots</button>').join('') + '</div>';
    }
    h += '<div class="css-setup-row"><div>' + left + '</div><div class="css-setup-col">' + gearDetail(c) + '</div></div>';
    return h;
  }

  function gearDetail(c) {
    const sel = ui.gearSel || { row: 0, slot: 1 };
    const row = sel.row, slot = sel.slot;
    const g = gearInstance(c, row, slot);
    const r = g.r, b = g.b;
    if (!r) return '<div class="css-setup-detail css-setup-muted">Select a slot.</div>';
    const p = { system: 'equipment', row, slot };
    const classId = c.state.character.classId;
    const empty = !r.item || r.item === 'Blank';
    let h = '<div class="css-setup-detail"><h4>' + iconHtml('items', r.item, r.name, { size: 40 }) + '<span>' + esc(gameText(r.name)) +
      '<br><small class="css-setup-muted">' + esc(gameText(r.slotName)) + '</small></span>' + pill(gameText(b.name || '(empty)'), gameText(r.name), p) + '</h4>';
    h += '<div class="css-setup-tools"><button type="button" data-pick="gear" data-row="' + row + '" data-slot="' + slot + '" data-fid="gear-d">Change item\u2026</button>' +
      (empty ? '' : '<button type="button" data-act="gearClear" data-row="' + row + '" data-slot="' + slot + '">Unequip</button>') + '</div>';
    if (empty) return h + '<div class="css-setup-muted">Empty slot. Pick an item to equip it.</div></div>';
    const def = ITEMS[r.item] || {};
    const res = ST.applyStones(r.item, g.extra, g.stones, { classId });
    const sameItem = b.item === r.item;
    const shown = GEAR_STATS.filter(s => n0(def[s]) || n0(g.extra[s]) || n0(res.stoneDelta[s]) || (ui.gearShow && ui.gearShow[s]));
    let t = '<table class="css-setup-stt"><tr><th>Stat</th><th>Base</th><th>Added</th><th>Stones</th><th>Total</th></tr>';
    shown.forEach(s => {
      const base = n0(def[s]), man = n0(g.extra[s]), st = n0(res.stoneDelta[s]);
      const total = base + n0(res.stats[s]);
      const saveTot = sameItem ? base + n0(b.stats && b.stats[s]) : null;
      t += '<tr><td>' + esc(ST.statLabel(s)) + '</td><td>' + esc(fmt(base)) + '</td><td>' + stepper(man, 'data-act="extraStat" data-stat="' + s + '" data-fid="ex-' + s + '"', { width: 52 }) + '</td>' +
        '<td class="' + (st ? (st > 0 ? 'css-setup-pos' : 'css-setup-neg') : 'css-setup-muted') + '">' + (st ? esc(sgn(st)) : '\u2014') + '</td><td><b>' + esc(fmt(total)) + '</b>' +
        (saveTot != null ? pill(fmt(saveTot), fmt(total)) : '') + '</td></tr>';
    });
    const hidden = GEAR_STATS.filter(s => shown.indexOf(s) < 0);
    if (hidden.length) t += '<tr><td colspan="5"><select data-act="extraAdd" data-fid="ex-add"><option value="">+ add stat\u2026</option>' + hidden.map(s => '<option value="' + s + '">' + esc(ST.statLabel(s)) + '</option>').join('') + '</select></td></tr>';
    t += '</table>';
    let uq = '';
    [1, 2].forEach(n => {
      const inst = ST.instanceUq(r.item, res.stats, n);
      const defTxt = def['UQ' + n + 'txt'];
      const fixed = defTxt && defTxt !== '0' && defTxt !== 'Blank';
      const label = inst.txt ? ST.formatUq(inst.txt, inst.val) : '(no bonus)';
      const sd = n0(res.stoneDelta['UQ' + n + 'val']);
      uq += '<div class="css-setup-uqrow"><span class="css-setup-kh">Bonus ' + n + '</span>' +
        (fixed ? '<b class="css-setup-uq">' + esc(label) + '</b>' : '<button type="button" data-pick="uq" data-n="' + n + '" data-fid="uq-' + n + '" class="css-setup-uq">' + esc(label) + ' \u25be</button>') +
        '<span class="css-setup-muted">base ' + esc(fmt(inst.base)) + ' + added</span>' + stepper(n0(g.extra['UQ' + n + 'val']), 'data-act="extraStat" data-stat="UQ' + n + 'val" data-fid="ex-uq' + n + '"', { width: 52 }) +
        (sd ? '<span class="css-setup-pos">stones ' + esc(sgn(sd)) + '</span>' : '') + '</div>';
    });
    const un = ST.STONE_NUMERIC_STATS.filter(k => k !== 'Upgrade_Slots_Left' && n0(g.extra[k])).map(k => sgn(g.extra[k]) + ' ' + ST.statLabel(k));
    let sl = '';
    g.stones.forEach((s, i) => {
      const st = ST.stoneByKey(s.key);
      const ap = res.applied.find(a => a.index === i), rj = res.rejected.find(a => a.index === i);
      const choices = ST.stoneEffectChoices(s.key, { itemKey: r.item, classId, map: res.stats });
      let ctl = '';
      choices.forEach((ch, e) => {
        const pk = s.picks && s.picks[e];
        const pst = pk && (typeof pk === 'object' ? pk.stat : pk);
        if (ch.stats.length > 1) ctl += '<select data-act="stonePick" data-i="' + i + '" data-e="' + e + '" data-fid="sp-' + i + '-' + e + '">' +
          ch.stats.map(x => '<option value="' + x + '"' + (x === (pst || ch.defaultStat) ? ' selected' : '') + '>' + esc(gameText(ch.label) + ' \u2192 ' + ST.statLabel(x)) + '</option>').join('') + '</select>';
        if (ch.mystery) ctl += stepper(pk && typeof pk === 'object' && pk.amount != null ? pk.amount : ch.amount, 'data-act="stoneAmt" data-i="' + i + '" data-e="' + e + '" data-fid="sa-' + i + '-' + e + '"', { min: ch.min, max: ch.max, width: 44 });
      });
      const eff = ap ? (ap.failed ? 'failed' + (ap.slotCost ? ' (slot used)' : ' (slot kept)') : ap.effects.map(x => sgn(x.amount) + ' ' + ST.statLabel(x.stat)).join(', ')) : '';
      sl += '<div class="css-setup-stone' + (rj ? ' css-setup-rej' : '') + '"><span' + rt(() => stoneTip(st)) + '>' + iconHtml('items', s.key, st ? st.name : s.key, { size: 28 }) + '</span><b>' + esc(gameText(st ? st.name : s.key)) + '</b>' +
        '<span>' + esc(rj ? rj.reason : eff) + '</span>' + ctl +
        '<label class="css-setup-check"><input type="checkbox" data-act="stoneFail" data-i="' + i + '"' + (s.failed ? ' checked' : '') + '>failed</label>' +
        '<button type="button" data-act="stoneRemove" data-i="' + i + '" aria-label="Remove stone">\u00d7</button></div>';
    });
    if (!g.stones.length) sl += '<div class="css-setup-muted">No stones recorded on this item.</div>';
    const mode = ui.stoneMode === 'attr' ? 'attr' : 'add';
    sl += '<div class="css-setup-tools"><select data-act="stoneAttrMode" data-fid="stoneMode"><option value="add"' + (mode === 'add' ? ' selected' : '') + '>Apply as a new upgrade</option>' +
      '<option value="attr"' + (mode === 'attr' ? ' selected' : '') + '>Attribute existing added stats</option></select>' +
      '<button type="button" data-pick="stoneAdd" data-fid="stoneAdd">+ Stone\u2026</button>' +
      help('New upgrade: the stone\u2019s stats are added and a slot is consumed. Attribute: the stone explains part of the save\u2019s existing added stats, so the total stays the same and the unattributed remainder shrinks.') + '</div>';
    h += cardbox('Stats', t);
    h += cardbox('Unique bonuses', uq);
    h += cardbox('Upgrade slots', '<div class="css-setup-uqrow"><b>' + res.slotsLeft + '</b> remaining (' + res.slotsTotal + ' base slots) \u00b7 recorded stones consume ' + res.slotsUsed + ' slots</div>' +
      '<div class="css-setup-uqrow">Slots before listed stones ' + stepper(ST.slotsLeft(g.item, g.extra), 'data-act="slotsBeforeStones" data-fid="ex-usl" aria-label="Upgrade slots before listed stones"', { min: 0, width: 44 }) +
      help('This includes the saved slot adjustment and any bonus slots, before applying the stones listed below. The remaining count above also subtracts slots consumed by those stones. The save keeps a change from base slots, not the remaining count itself.') + '</div>' +
      '<div class="css-setup-muted">' + (un.length ? 'Unattributed added stats: <b>' + esc(un.join(', ')) + '</b>' : 'No unattributed added stats.') + ' ' +
      help('The save stores only the summed upgrade deltas (EMm), not which stones produced them. Attribute those deltas to stones to see what remains.') + '</div>');
    h += cardbox('Stones', sl);
    return h + '</div>';
  }
  function stoneTip(st) {
    if (!st) return tipHtml('Unknown stone', []);
    return tipHtml(gameText(st.name), [
      esc(st.effects.map(e => sgn(e.amount) + ' ' + gameText(e.stat)).join(', ')),
      'Success ' + esc(fmt(st.amount)) + '% \u00b7 uses ' + st.trigger + ' slot' + (st.trigger === 1 ? '' : 's') + (st.cooldown === 1 ? ' \u00b7 failure still uses the slot' : ''),
      'Fits: ' + esc(gameText(st.target || '')),
    ]);
  }

  function renderFood(c) {
    const eq = c.state.equipment, base = c.base.equipment;
    const owned = n0(eq.foodSlots);
    const page = ui.foodPage === 1 ? 1 : 0;
    if (ui.foodSel == null) ui.foodSel = 0;
    let slots = '';
    for (let t = 0; t < 8; t++) {
      const s = t + 8 * page;
      if (s >= CS.FOOD_SLOT_COUNT) continue;
      const x = 23 + 78 * (t % 2), y = 69 + 74 * Math.floor(t / 2);
      const r = eq.food[s] || { slot: s, item: 'Blank', name: '(empty)', qty: 0 };
      const p = { system: 'food', slot: s };
      const locked = s >= owned;
      const empty = !r.item || r.item === 'Blank';
      const inner = empty ? frameImg('equipment', locked ? 'LockedInvSpace' : 'EquipmentTransparent17', 72, 72)
        : iconHtml('items', r.item, r.name, { size: 72, cls: 'css-setup-ico-bare' }) + (n0(r.qty) ? '<span class="css-setup-hot-cap">' + esc(qtyStr(r.qty)) + '</span>' : '');
      slots += hot(x, y, 72, 72, 'data-pick="food" data-slot="' + s + '" data-fid="food-' + s + '"' + selAttr({ foodSel: s }) + ' aria-label="Food slot ' + (s + 1) + '"' +
        rt(() => empty ? tipHtml('Food slot ' + (s + 1), [locked ? 'Slot not owned (FoodSlO)' : '(empty)']) : itemCardHtml(r.item) + '<div class="css-setup-tipl">Quantity ' + esc(fmt(r.qty)) + (locked ? ' \u00b7 slot not owned' : '') + '</div>'),
        inner, chgCls(p) + (ui.foodSel === s ? ' css-setup-sel' : '') + (locked ? ' css-setup-dim' : ''));
    }
    let left = equipStage(2, slots) + '<div class="css-setup-seg">' + ['Slots 1-8', 'Slots 9-16'].map((l, i) => '<button type="button" data-act="foodPage" data-page="' + i + '" class="' + (i === page ? 'css-setup-on' : '') + '">' + l + '</button>').join('') + '</div>';
    const s = ui.foodSel;
    const r = eq.food[s] || { slot: s, item: 'Blank', name: '(empty)', qty: 0 };
    const b = base.food[s] || { name: '(empty)', qty: 0 };
    const p = { system: 'food', slot: s };
    const fsP = { system: 'foodSlots' };
    let d = '<div class="css-setup-detail"><h4>' + iconHtml('items', r.item, r.name, { size: 40 }) + '<span>' + esc(gameText(r.name)) + '<br><small class="css-setup-muted">Food slot ' + (s + 1) + (s >= owned ? ' (not owned)' : '') + '</small></span>' + pill(gameText(b.name), gameText(r.name), p) + '</h4>';
    d += '<div class="css-setup-tools"><button type="button" data-pick="food" data-slot="' + s + '" data-fid="food-d">Change food\u2026</button>' +
      (r.item && r.item !== 'Blank' ? '<span>Quantity</span>' + stepper(r.qty, attrsOf(p, 'data-act="foodQty" data-fid="foodq-' + s + '"'), { min: 0, width: 90 }) + pill(qtyStr(b.qty), qtyStr(r.qty), p) : '') + '</div>';
    d += '<div class="css-setup-tools"><span>Food slots owned</span>' + stepper(eq.foodSlots, 'data-act="foodSlots" data-fid="foodSlots"', { min: 0, max: CS.FOOD_SLOT_COUNT, width: 44 }) + pill(base.foodSlots, eq.foodSlots, fsP) +
      help('FoodSlO_X: number of food slots the character owns. Golden foods are the FoodG items; their bonus scales with stack size.') + '</div></div>';
    return tools('food') + '<div class="css-setup-row"><div>' + left + '</div><div class="css-setup-col">' + d + '</div></div>';
  }

  function renderObols(c, family) {
    const scope = family ? 'family' : 'personal';
    const ob = c.state.obols, base = c.base.obols;
    const rows = ob[scope] || [], brows = base[scope] || [];
    const board = V.obolBoard(scope);
    const lvl = n0(c.state.character.level);
    if (!ui.obolSel || ui.obolSel.scope !== scope) ui.obolSel = { scope, slot: 0 };
    let inner = '';
    board.slots.forEach(s => {
      const r = rows.find(x => x.slot === s.slot);
      if (!r) return;
      const p = { system: 'obol', scope, slot: s.slot };
      const locked = scope === 'personal' && lvl < s.levelReq;
      const empty = !r.item || r.item === 'Blank';
      const sz = board.manifest ? 72 : 52;
      const ic = !empty ? iconHtml('items', r.item, r.name, { size: sz, cls: 'css-setup-ico-bare' }) : (locked && board.manifest ? frameImg('obols', 'ObolLocked' + (s.shape + 1), 72, 72) : '');
      const sel = ui.obolSel.slot === s.slot;
      const shapeName = V.OBOL_SHAPES[s.shape] || 'Any';
      const attrs = 'data-pick="obol" data-scope="' + scope + '" data-slot="' + s.slot + '" data-shape="' + s.shape + '" data-fid="obol-' + scope + '-' + s.slot + '"' + selAttr({ obolSel: { scope, slot: s.slot } }) +
        ' aria-label="' + esc(shapeName + ' obol slot ' + (s.slot + 1)) + '"' +
        rt(() => empty ? tipHtml(shapeName + ' slot', [locked ? 'Unlocks at character Lv ' + s.levelReq : '(empty)']) : itemCardHtml(r.item, { added: r.stats || {} }) + (locked ? '<div class="css-setup-tipl css-setup-neg">Locked until Lv ' + s.levelReq + '</div>' : ''));
      if (board.manifest) inner += hot(s.x, s.y, 72, 72, attrs, ic, 'css-setup-obolhot' + chgCls(p) + (sel ? ' css-setup-sel' : '') + (locked ? ' css-setup-dim' : ''));
      else inner += '<button type="button" class="css-setup-obol css-setup-obol-s' + s.shape + chgCls(p) + (sel ? ' css-setup-sel' : '') + (locked ? ' css-setup-lock' : '') + '" style="left:' + s.x + 'px;top:' + s.y + 'px" ' + attrs + '>' + ic + '</button>';
    });
    const boardHtml = board.manifest ? stage('obols', 'UIObolBase' + (scope === 'family' ? 2 : 1), board.width, board.height, inner)
      : '<div class="css-setup-obolboard" style="width:' + board.width + 'px;height:' + board.height + 'px">' + inner + '</div>';
    // detail
    const slot = ui.obolSel.slot;
    const r = rows.find(x => x.slot === slot) || { slot, item: 'Blank', name: '(empty)', stats: null };
    const b = brows.find(x => x.slot === slot) || { name: '(empty)' };
    const bs = board.slots.find(x => x.slot === slot) || { shape: 0, levelReq: 0 };
    const p = { system: 'obol', scope, slot };
    let d = '<div class="css-setup-detail"><h4>' + iconHtml('items', r.item, r.name, { size: 40 }) + '<span>' + esc(gameText(r.name)) + '<br><small class="css-setup-muted">' +
      esc((V.OBOL_SHAPES[bs.shape] || 'Any') + ' slot ' + (slot + 1) + (scope === 'personal' && bs.levelReq ? ' \u00b7 unlocks at Lv ' + bs.levelReq : '')) + '</small></span>' + pill(gameText(b.name), gameText(r.name), p) + '</h4>';
    d += '<div class="css-setup-tools"><button type="button" data-pick="obol" data-scope="' + scope + '" data-slot="' + slot + '" data-shape="' + bs.shape + '" data-fid="obol-d">Change obol\u2026</button>' +
      (r.item && r.item !== 'Blank' ? '<button type="button" data-act="obolClear" data-scope="' + scope + '" data-slot="' + slot + '">Remove</button>' : '') + '</div>';
    if (r.item && r.item !== 'Blank') {
      const def = ITEMS[r.item] || {};
      const st = r.stats || {};
      const keys = GEAR_STATS.concat(['UQ1val', 'UQ2val']);
      const shown = keys.filter(k => n0(def[k]) || n0(st[k]) || (ui.obolShow && ui.obolShow[k]));
      let t = '<table class="css-setup-stt"><tr><th>Stat</th><th>Base</th><th>Rerolled</th><th>Total</th></tr>';
      shown.forEach(k => {
        const lbl = k === 'UQ1val' || k === 'UQ2val' ? (ST.formatUq(def[k.replace('val', 'txt')], n0(def[k]) + n0(st[k])) || ST.statLabel(k)) : ST.statLabel(k);
        t += '<tr><td>' + esc(lbl) + '</td><td>' + esc(fmt(n0(def[k]))) + '</td><td>' +
          stepper(n0(st[k]), 'data-act="stat" data-kind="obol-' + scope + '" data-row="0" data-slot="' + slot + '" data-stat="' + k + '" data-fid="os-' + k + '"', { width: 52 }) +
          '</td><td><b>' + esc(fmt(n0(def[k]) + n0(st[k]))) + '</b></td></tr>';
      });
      const hidden = keys.filter(k => shown.indexOf(k) < 0);
      if (hidden.length) t += '<tr><td colspan="4"><select data-act="obolStatAdd" data-fid="os-add"><option value="">+ add stat\u2026</option>' + hidden.map(k => '<option value="' + k + '">' + esc(ST.statLabel(k)) + '</option>').join('') + '</select></td></tr>';
      d += cardbox('Stats', t + '</table>');
    }
    d += '</div>';
    const h = family
      ? tools('sys:familyObols', help('Family obols (ObolEqO1/ObolEqMAPz1) are shared by every character. Swapping an obol clears its rerolled stats.'))
      : tools('obols', help('Personal obols (ObolEqO0_X/ObolEqMAP_X) apply to this character only; family obols are under Account \u203a General. Swapping an obol clears its rerolled stats.'));
    return h + '<div class="css-setup-row"><div>' + boardHtml + '</div><div class="css-setup-col">' + d + '</div></div>';
  }

  let cardInfoCache = null;
  function cardInfo() {
    if (!cardInfoCache) { cardInfoCache = new Map(); CS.cardOptions().forEach(o => cardInfoCache.set(o.key, o)); }
    return cardInfoCache;
  }
  function cardSetIcon(set, size) {
    const list = systemLayout('cards', 'setIcons');
    const file = Array.isArray(list) ? list[set] : null;
    const nm = file ? String(file).replace(/\.png$/i, '') : 'CardSet' + set;
    const u = set >= 0 ? frameUrl('cards', nm) : null;
    return u ? '<span class="css-setup-ico" style="width:' + size + 'px;height:' + size + 'px"><img class="css-setup-px" src="' + esc(u) + '" alt="" draggable="false" style="max-width:100%;max-height:100%"></span>' : iconHtml('cardsets', set, 'Set ' + set, { size });
  }
  function cardArt(key, name, w, h) {
    if (!key || key === 'B') return frameImg('cards', 'CardsBlank', w, h) || '<span class="css-setup-cardempty" style="width:' + w + 'px;height:' + h + 'px"></span>';
    const u = iconUrl('cards', key);
    return u ? '<span class="css-setup-ico css-setup-ico-bare" style="width:' + w + 'px;height:' + h + 'px"><img class="css-setup-px" src="' + esc(u) + '" alt="" draggable="false" style="width:' + w + 'px;height:' + h + 'px" data-ico-fallback="' + esc(gameText(name).slice(0, 3)) + '"></span>' : iconHtml('cards', key, name, { size: w });
  }
  function cardTip(key, name, lv) {
    const o = cardInfo().get(key) || {};
    return tipHtml(gameText(name || o.name || key), [o.bonus ? esc(gameText(o.bonus)) : '', lv != null ? 'Card level ' + esc(lv) : '']);
  }

  function renderCards(c) {
    const cards = c.state.cards, base = c.base.cards;
    let inner = '';
    cards.equipped.forEach((r, i) => {
      const x = 10 + 68 * (i % 4), y = 8 + 90 * Math.floor(i / 4);
      const p = { system: 'card', slot: r.slot };
      const empty = !r.key || r.key === 'B';
      const lv = n0(r.level);
      const border = !empty && lv > 1 ? frameImg('cards', 'CardEquipBorder' + Math.min(6, lv - 1)) : '';
      inner += '<div class="css-setup-at" style="left:' + x + 'px;top:' + y + 'px;width:56px;height:72px">' +
        (border ? '<span class="css-setup-at css-setup-nopt" style="left:-6px;top:-4px">' + border + '</span>' : '') +
        hot(0, 0, 56, 72, 'data-pick="card" data-slot="' + r.slot + '" data-fid="card-' + r.slot + '" aria-label="Card slot ' + (r.slot + 1) + '"' + rt(() => empty ? tipHtml('Card slot ' + (r.slot + 1), ['(empty)']) : cardTip(r.key, r.name, lv)),
          cardArt(r.key, r.name, 56, 72) + (!empty && lv ? '<span class="css-setup-hot-cap">' + lv + '\u2605</span>' : ''), chgCls(p)) + '</div>';
    });
    const st = stage('cards', null, 290, 288, inner, 'css-setup-cardstage');
    const sets = CS.cardSetOptions();
    const cur = cards.set ? cards.set.set : -1;
    const curSet = sets.find(s => s.set === cur);
    const setP = { system: 'cardSet' };
    let d = '<div class="css-setup-detail"><h4>' + cardSetIcon(cur, 40) + '<span>' + esc(curSet ? gameText(curSet.name) : '(no card set)') + '<br><small class="css-setup-muted">Card set bonus</small></span>' +
      pill(base.set ? gameText(base.set.name) + ' ' + base.set.value : '(none)', cards.set ? gameText(cards.set.name) + ' ' + cards.set.value : '(none)', setP) + '</h4>';
    d += '<div class="css-setup-tools"><button type="button" data-pick="cardSet" data-fid="cardSet">Change set\u2026</button>' +
      '<span>Bonus</span><b class="n">' + esc(cards.set ? cards.set.value : 0) + '</b>' +
      help('The set bonus is derived, not chosen: round(average level of the set\u2019s cards \u00d7 set multiplier). The game recomputes it whenever the card menu opens, so raise card levels below to change it.') + '</div>';
    d += '<div class="css-setup-muted">Click a card slot to swap cards.</div></div>';
    return tools('cards') + '<div class="css-setup-row"><div>' + st + '</div><div class="css-setup-col">' + d + cardLevelsHtml(c) + '</div></div>';
  }

  /** Account-wide card levels of this character's equipped (and edited) cards. */
  function cardLevelsHtml(c) {
    const keys = [];
    c.state.cards.equipped.forEach(r => { if (r.key && r.key !== 'B' && keys.indexOf(r.key) < 0) keys.push(r.key); });
    setup.patches.forEach(p => { if (p.system === 'cardLevel' && keys.indexOf(p.key) < 0) keys.push(p.key); });
    if (!keys.length) return '';
    let g = '<div class="css-setup-grid">';
    keys.forEach(key => { g += cardLevelCell(c, key); });
    const right = help('Card levels are account-wide (Cards0 counts) and also editable for every card under Account \u203a General \u203a Card levels. Setting a level writes the smallest count that reaches it; level 0 removes the card. Max level is ' + (CS.cardLevelInfo(c.patched, keys[0]).maxLevel) + '\u2605 for this save (Rift and Spelunking raise it). Every character\u2019s equipped set bonus is re-derived from the new levels.');
    return cardbox('Card levels (account-wide)', g + '</div>', right);
  }

  function renderCardLevels(c) {
    const sets = new Map(CS.cardSetOptions().map(s => [s.set, s]));
    const bySet = new Map();
    CS.cardOptions().forEach(o => {
      if (!match('cardLevels', o.name + ' ' + o.key + ' ' + (sets.get(o.set) ? sets.get(o.set).name : ''))) return;
      if (!bySet.has(o.set)) bySet.set(o.set, []);
      bySet.get(o.set).push(o.key);
    });
    let h = tools('sys:cardLevels', filterBox('cardLevels', 'Filter cards or sets') +
      help('Card levels are account-wide (Cards0 counts). Setting a level writes the smallest count that reaches it; level 0 removes the card. Card set bonuses are derived from these levels, so they update automatically.'));
    if (!bySet.size) return h + '<div class="css-setup-muted">No cards match.</div>';
    const filtering = !!(ui.filters.cardLevels || '').trim();
    [...bySet.keys()].sort((a, b) => a - b).forEach(set => {
      const s = sets.get(set);
      const keys = bySet.get(set);
      const changedN = keys.filter(k => changed({ system: 'cardLevel', key: k })).length;
      const sum = cardSetIcon(set, 22) + ' ' + esc(s ? gameText(s.name) : 'Other cards') + ' <span class="css-setup-muted">(' + keys.length + ')</span>' + (changedN ? ' <span class="css-setup-badge">' + changedN + '</span>' : '');
      const key = 'cl-set-' + set;
      if (filtering && ui.expanded[key] === undefined) ui.expanded[key] = true;
      h += details(key, sum, () => '<div class="css-setup-grid">' + keys.map(k => cardLevelCell(c, k)).join('') + '</div>');
    });
    return h;
  }

  function cardLevelCell(c, key) {
    const raw = getRaw();
    {
      const now = CS.cardLevelInfo(c.patched, key), was = CS.cardLevelInfo(raw, key);
      const o = cardInfo().get(key) || {};
      const p = { system: 'cardLevel', key };
      const floorNote = now.floor > 0 ? '<div class="css-setup-muted">Account floor ' + now.floor + '\u2605' + (now.level < now.floor ? ' <span class="css-setup-warn">(below floor)</span>' : '') + '</div>' : '';
      return '<div class="css-setup-gcell' + chgCls(p) + '"><span' + rt(() => cardTip(key, o.name, now.level)) + '>' + cardArt(key, o.name || key, 28, 36) + '</span>' +
        '<div class="css-setup-gname">' + esc(gameText(o.name || key)) + '</div>' +
        stepper(now.level, attrsOf(p, 'data-act="cardLevel" data-fid="cl-' + esc(key) + '"'), { min: 0, max: now.maxLevel, width: 44 }) + pill(was.level, now.level, p) + floorNote + '</div>';
    }
  }

  function talentTip(id, t, b) {
    const d = V.talentDescription(id, t.level);
    return tipHtml(gameText(t.name || CS.talentName(id)), [
      'Level <b>' + esc(t.level) + '</b> / ' + esc(t.max) + (b && (b.level !== t.level || b.max !== t.max) ? ' <span class="css-setup-muted">(save ' + esc(b.level) + ' / ' + esc(b.max) + ')</span>' : ''),
      d.text ? esc(d.text) : '',
      '<span class="css-setup-muted">#' + esc(id) + '</span>',
    ]);
  }
  function talentState(c) {
    return { cur: new Map(c.state.talents.map(t => [t.id, t])), base: new Map(c.base.talents.map(t => [t.id, t])) };
  }
  function superMark(c, id) {
    const st = c.state.superTalents;
    if (!st) return null;
    const on = [0, 1].filter(pr => st.presets[pr].ids.indexOf(id) >= 0);
    if (!on.length) return null;
    const active = on.indexOf(st.activePreset) >= 0;
    return { active, label: active ? 'supered in the active preset' : 'supered in the inactive preset only' };
  }
  function superTalentHtml(c, id) {
    const st = c.state.superTalents, sb = c.base.superTalents;
    if (!st) return '';
    const banned = CS.superTalentBanned(id);
    let h = '<div class="css-setup-tools"><span>Super</span>';
    [0, 1].forEach(pr => {
      const on = st.presets[pr].ids.indexOf(id) >= 0;
      const was = sb.presets[pr].ids.indexOf(id) >= 0;
      const full = !on && st.presets[pr].used >= CS.SUPER_TALENT_SLOTS;
      const p = { system: 'superTalent', id, preset: pr };
      h += '<label class="css-setup-check' + chgCls(p) + '"><input type="checkbox" data-act="superTalent" data-id="' + id + '" data-preset="' + pr + '"' + (on ? ' checked' : '') + (banned || full ? ' disabled' : '') + '>' +
        'Preset ' + (pr + 1) + (pr === st.activePreset ? ' (active)' : '') + ' <span class="css-setup-muted">' + st.presets[pr].used + '/' + st.slots + '</span></label>' + pill(was ? 'on' : 'off', on ? 'on' : 'off', p);
    });
    h += '<span class="css-setup-muted">+' + st.bonus + ' levels</span>' +
      help('Super talents (Spelunk rows per preset) add +' + st.bonus + ' levels. This character only benefits from supers in its active preset (PlayerStuff_X[1]). Account-wide lookups that take the best character (e.g. talents that read every character\u2019s level) use that character\u2019s active-preset points plus a super from either preset. Slots: floor((level \u2212 400) / 100) plus 1 from Spelunking lore, up to 20.') + '</div>';
    const warns = [];
    if (banned) warns.push('This talent cannot be supered.');
    if (id >= 225 && id <= 239 && !st.rgAllowed) warns.push('Royal Guardian talents need Armory upgrade 56 before supers apply.');
    [0, 1].forEach(pr => { if (st.presets[pr].used > st.slots) warns.push('Preset ' + (pr + 1) + ' uses ' + st.presets[pr].used + ' supers but only ' + st.slots + ' slots are unlocked.'); });
    warns.forEach(w => { h += '<div class="css-setup-warn">' + esc(w) + '</div>'; });
    return h;
  }

  function renderTalents(c) {
    const classId = c.state.character.classId;
    const ts = talentState(c);
    const pages = V.talentBookPages(classId);
    const classPages = pages.filter(p => p.kind === 'class'), starPages = pages.filter(p => p.kind === 'star');
    if (!pages.some(p => p.id === ui.talPage)) ui.talPage = (classPages[classPages.length - 1] || pages[0]).id;
    const page = pages.find(p => p.id === ui.talPage);
    let inner = '';
    const tabDefs = classPages.slice(0, 5).map((p, t) => ({ t, page: p, img: 'UISkillTabs' + p.classId, label: p.label }));
    tabDefs.push({ t: 5, page: page.kind === 'star' ? page : starPages[0], img: 'UISkillTabs0', label: 'Star talents', star: true });
    tabDefs.forEach(td => {
      if (!td.page) return;
      const on = td.star ? page.kind === 'star' : td.page.id === page.id;
      const art = frameImg('talentBook', td.img);
      inner += hot(15 + 60 * td.t, 59, 57, 42, 'data-act="talPage" data-page="' + td.page.id + '" aria-label="' + esc(td.label) + '"' + rt(() => esc(td.label)),
        art || '<span class="css-setup-tabtxt">' + esc(td.label.slice(0, 8)) + '</span>', 'css-setup-btab' + (on ? ' css-setup-on' : ''));
    });
    V.talentPageSlots(page).forEach(s => {
      const x = 35 + 63 * s.col, y = 126 + 72 * s.row;
      if (s.arrow) {
        const idx = starPages.findIndex(p => p.id === page.id);
        const to = s.arrow === 'left' ? idx - 1 : idx + 1;
        if (to < 0 || to >= starPages.length) return;
        inner += hot(x, y, 56, 56, 'data-act="talPage" data-page="' + starPages[to].id + '" aria-label="' + (s.arrow === 'left' ? 'Previous' : 'Next') + ' star page"' + rt(() => esc(starPages[to].label)),
          iconHtml('talents', s.arrow === 'left' ? 'LEFT' : 'RIGHT', s.arrow === 'left' ? '\u25c0' : '\u25b6', { size: 56, cls: 'css-setup-ico-bare' }));
        return;
      }
      if (s.id == null) return;
      const t = ts.cur.get(s.id) || { id: s.id, name: CS.talentName(s.id), level: 0, max: 0 };
      const b = ts.base.get(s.id) || { level: 0, max: 0 };
      const p = { system: 'talent', id: s.id };
      const locked = n0(t.max) < 0;
      const sup = superMark(c, s.id);
      inner += '<div class="css-setup-at css-setup-talw" style="left:' + x + 'px;top:' + y + 'px">' +
        hot(0, 0, 56, 56, 'data-act="talSel" data-id="' + s.id + '" draggable="true" data-dragtal="' + s.id + '" data-fid="tal-' + s.id + '" aria-label="' + esc(gameText(t.name) + ' level ' + t.level + (sup ? ', ' + sup.label : '')) + '"' + rt(() => talentTip(s.id, t, b)),
          iconHtml('talents', locked ? 'Locke' : s.id, t.name, { size: 56, cls: 'css-setup-ico-bare' }) + (sup ? '<span class="css-setup-super' + (sup.active ? '' : ' css-setup-super-off') + '">S</span>' : ''), chgCls(p) + chgCls({ system: 'superTalent', id: s.id, preset: 0 }) + chgCls({ system: 'superTalent', id: s.id, preset: 1 }) + (ui.talSel === s.id ? ' css-setup-sel' : '') + (t.level > 0 ? '' : ' css-setup-dim')) +
        '<span class="css-setup-tallv">' + esc(t.level) + '/' + esc(t.max) + '</span>' +
        '<span class="css-setup-talpm"><button type="button" data-act="talStep" data-id="' + s.id + '" data-d="-1" aria-label="Level down">\u2212</button><button type="button" data-act="talStep" data-id="' + s.id + '" data-d="1" aria-label="Level up">+</button></span></div>';
    });
    const book = stage('talentBook', 'UIskills', 378, 453, inner, 'css-setup-tbook') +
      '<div class="css-setup-muted" style="margin-top:4px">' + esc(page.label) + ' \u00b7 click an icon to inspect, hover for \u2212/+ (Shift = \u00d710), drag onto the attack bar.</div>';
    // detail
    let d = '<div class="css-setup-detail">';
    const selId = ui.talSel;
    if (selId != null) {
      const t = ts.cur.get(selId) || { id: selId, name: CS.talentName(selId), level: 0, max: 0 };
      const b = ts.base.get(selId) || { level: 0, max: 0 };
      const p = { system: 'talent', id: selId };
      const dsc = V.talentDescription(selId, t.level), nxt = V.talentDescription(selId, n0(t.level) + 1);
      d += '<h4>' + iconHtml('talents', selId, t.name, { size: 48 }) + '<span>' + esc(gameText(t.name)) + '<br><small class="css-setup-muted">#' + esc(selId) + '</small></span></h4>';
      if (dsc.text) d += '<div class="css-setup-tipl">' + esc(dsc.text) + '</div>';
      if (nxt.text && nxt.text !== dsc.text) d += '<div class="css-setup-tipl css-setup-muted">Next level: ' + esc(nxt.text) + '</div>';
      d += '<div class="css-setup-tools"><span>Level</span>' + stepper(t.level, attrsOf(p, 'data-act="talentLv" data-fid="tl-' + selId + '"'), { min: 0, width: 56 }) + pill(b.level, t.level, p) +
        '<span>Max</span>' + stepper(t.max, attrsOf(p, 'data-act="talentMax" data-fid="tm-' + selId + '"'), { width: 56 }) + pill(b.max, t.max, p) + '</div>';
      d += superTalentHtml(c, selId);
    } else d += '<div class="css-setup-muted">Select a talent in the book to edit its level.</div>';
    d += '<div class="css-setup-tools"><button type="button" data-pick="talentFind" data-fid="talentFind">Find any talent\u2026</button>' +
      help('SL_X are allocated levels (all-talent-level bonuses are applied on top by the sim); SM_X are the max levels.') + '</div></div>';
    let h = tools('talents') + '<div class="css-setup-row"><div>' + book + '</div><div class="css-setup-col">' + d + attackBarsHtml(c, ts) + '</div></div>';
    // talents with levels outside this class book
    const inBook = V.classTalentIds(classId, true);
    const others = c.state.talents.filter(t => !inBook.has(t.id) && (n0(t.level) > 0 || changed({ system: 'talent', id: t.id })));
    if (others.length) {
      h += details('tal-others', 'Other leveled talents (' + others.length + ')', () => {
        let g = filterBox('talents', 'Filter talents') + '<div class="css-setup-grid">';
        others.filter(t => match('talents', t.name + ' ' + t.id)).slice(0, ROW_CAP).forEach(t => {
          const p = { system: 'talent', id: t.id };
          const b = ts.base.get(t.id) || { level: 0, max: 0 };
          g += '<div class="css-setup-gcell' + chgCls(p) + '"><span' + rt(() => talentTip(t.id, t, b)) + '>' + iconHtml('talents', t.id, t.name, { size: 40 }) + '</span><div class="css-setup-gname">' + esc(gameText(t.name)) + '</div>' +
            stepper(t.level, attrsOf(p, 'data-act="talentLv" data-fid="tlo-' + t.id + '"'), { min: 0, width: 44 }) + pill(b.level, t.level, p) + '</div>';
        });
        return g + '</div>';
      });
    }
    return h;
  }

  function attackBarsHtml(c, ts) {
    const rows = c.state.attackLoadout || [];
    if (!rows.length) return cardbox('Attack bar', '<div class="css-setup-muted">This save has no AttackLoadout for the character; picking an attack creates it.</div>');
    const cur = Math.min(Math.max(0, n0(ui.atkRow)), rows.length - 1);
    const list = ui.allBars ? rows.map((_, r) => r) : [cur];
    let h = '';
    list.forEach(r => {
      const row = rows[r] || [];
      let inner = '';
      for (let s = 0; s < 6; s++) {
        const a = row.find(x => x.slot === s) || { id: 'Null', name: '(empty)' };
        const p = { system: 'attackLoadout', row: r, slot: s };
        const empty = a.id === 'Null' || a.id == null || a.id === '';
        const t = empty ? null : (ts.cur.get(Number(a.id)) || { name: a.name, level: 0, max: 0 });
        inner += '<div class="css-setup-at css-setup-atkw" style="left:' + (14 + 61 * s) + 'px;top:5px">' +
          hot(0, 0, 56, 56, 'data-pick="attack" data-row="' + r + '" data-slot="' + s + '" data-fid="atk-' + r + '-' + s + '" draggable="true" data-drag="' + r + ':' + s + '" aria-label="Attack slot ' + (s + 1) + ': ' + esc(gameText(a.name)) + '"' +
            rt(() => empty ? tipHtml('Attack slot ' + (s + 1), ['(empty) \u2014 click to pick, or drag a talent here']) : talentTip(Number(a.id), Object.assign({}, t, { name: a.name }), ts.base.get(Number(a.id)))),
            (empty ? '' : iconHtml('talents', a.id, a.name, { size: 56, cls: 'css-setup-ico-bare' })) + '<span class="css-setup-slot-key">' + (s + 1) + '</span>', chgCls(p)) +
          (empty ? '' : '<button type="button" class="css-setup-atkx" data-act="attackClear" data-row="' + r + '" data-slot="' + s + '" aria-label="Clear slot">\u00d7</button>') + '</div>';
      }
      if (!ui.allBars) {
        inner += hot(383, 6, 23, 26, 'data-act="atkRow" data-d="-1" aria-label="Previous bar"', '\u25b2', 'css-setup-atkarrow');
        inner += hot(383, 33, 23, 26, 'data-act="atkRow" data-d="1" aria-label="Next bar"', '\u25bc', 'css-setup-atkarrow');
      }
      const u = frameUrl('attackBar', 'UImain');
      h += '<div class="css-setup-atkrow"><span class="css-setup-skillbar-n">Bar ' + (r + 1) + '</span>' +
        '<div class="css-setup-stage' + (u ? '' : ' css-setup-stage-fb') + '" style="width:410px;height:66px;' + (u ? bgStyle(u) + 'background-size:960px 66px;background-position:-540px 0;' : '') + '">' + inner + '</div>' +
        '<button type="button" data-act="attackClearBar" data-row="' + r + '">Clear bar</button></div>';
    });
    const right = ' <button type="button" data-act="allBars">' + (ui.allBars ? 'Show one bar' : 'Show all ' + rows.length + ' bars') + '</button>' +
      help('AttackLoadout_X: rows of six talent ids. The AFK damage/kill factors read every equipped attack. Drag icons between slots to swap, or drag a talent from the book onto a slot.');
    return cardbox('Attack bar', '<div class="css-setup-skillbars">' + h + '</div>', right);
  }

  function signTip(id) {
    const row = StarSigns[id];
    const name = Array.isArray(row) ? row[0] : CS.starSignOptions().find(o => o.id === id)?.name;
    const extra = Array.isArray(row) ? row.slice(1, 4).filter(x => typeof x === 'string' && x && x !== '_' && !Number.isFinite(Number(x))).map(x => esc(gameText(x))) : [];
    return tipHtml(gameText(name || id), extra);
  }
  function prayerTip(id, level) {
    const row = PrayerInfo[id];
    const extra = Array.isArray(row) ? row.slice(1, 3).filter(x => typeof x === 'string' && x && !Number.isFinite(Number(x))).map(x => esc(gameText(x))) : [];
    return tipHtml(gameText(Array.isArray(row) ? row[0] : CS.prayerOptions().find(o => o.id === id)?.name || id), extra.concat(level != null ? ['Level ' + esc(level)] : []));
  }

  function renderSigns(c) {
    const signs = c.state.starSigns, bs = c.base.starSigns;
    const pr = c.state.prayers, bp = c.base.prayers;
    let h = tools('signs', help('Equipped star signs (PVtStarSign_X) and prayers (Prayers_X) belong to this character. Which signs are unlocked is account-wide (Account \u203a General \u203a Star sign unlocks); prayer levels are account-wide (Account \u203a W3 \u203a Worship).'));
    const sp = { system: 'starSigns' };
    let tiles = '';
    const nSigns = Math.max(signs.length, 3);
    for (let s = 0; s < nSigns + 1; s++) {
      const r = signs[s] || { id: '_', name: '(empty)' };
      if (s === nSigns && !(signs[s - 1] && signs[s - 1].id !== '_')) break;
      const empty = r.id === '_' || r.id == null;
      const bname = bs[s] ? bs[s].name : '(empty)';
      tiles += '<div class="css-setup-tile"><button type="button" class="css-setup-signbtn' + (bname !== r.name ? ' css-setup-chg' : '') + '" data-pick="sign" data-slot="' + s + '" data-fid="sign-' + s + '"' +
        rt(() => empty ? tipHtml('Star sign slot ' + (s + 1), ['(empty)']) : signTip(r.id)) + '><span class="css-setup-signstar">\u2605</span><span>' + esc(empty ? '(empty)' : gameText(r.name)) + '</span></button>' +
        (bname !== r.name ? '<div class="css-setup-muted">was ' + esc(gameText(bname)) + '</div>' : '') + '</div>';
    }
    h += cardbox('Star signs', '<div class="css-setup-tiles">' + tiles + '</div>', changed(sp) ? ' <button type="button" data-act="unpatch" ' + attrsOf(sp) + '>\u21ba Revert signs</button>' : '');
    const pp = { system: 'prayers' };
    let pt = '';
    const nPr = Math.max(pr.length, 1);
    for (let s = 0; s < nPr; s++) {
      const r = pr[s] || { id: -1, name: '(empty)', level: 0 };
      const empty = !(r.id >= 0);
      const bname = bp[s] ? bp[s].name : '(empty)';
      const lp = { system: 'table', table: 'prayerLevels', index: r.id };
      pt += '<div class="css-setup-gcell' + (bname !== r.name ? ' css-setup-chg' : '') + '">' +
        '<button type="button" class="css-setup-slot" data-pick="prayer" data-slot="' + s + '" data-fid="prayer-' + s + '"' + rt(() => empty ? tipHtml('Prayer slot ' + (s + 1), ['(empty)']) : prayerTip(r.id, r.level)) + '>' +
        (empty ? frameImg('prayers', 'PrayerNone', 48, 48) || iconHtml('prayers', null, '', { size: 48 }) : iconHtml('prayers', r.id, r.name, { size: 48 })) + '</button>' +
        '<div class="css-setup-gname">' + esc(empty ? '(empty)' : gameText(r.name)) + '</div>' +
        (empty ? '' : stepper(r.level, attrsOf(lp, 'data-act="table" data-fid="pl-' + r.id + '"'), { min: 0, width: 40 })) +
        (bname !== r.name ? '<div class="css-setup-muted">was ' + esc(gameText(bname)) + '</div>' : '') + '</div>';
    }
    h += cardbox('Prayers', '<div class="css-setup-grid">' + pt + '</div>', (changed(pp) ? ' <button type="button" data-act="unpatch" ' + attrsOf(pp) + '>\u21ba Revert prayers</button>' : '') +
      help('The level stepper edits the account-wide prayer level shared by every character.'));
    return h;
  }

  function renderBubbles(c) {
    const b = c.state.bubbles, bb = c.base.bubbles;
    const p = { system: 'bubbles' };
    let h = tools('bubbles', help('CauldronBubbles[X] holds this character\u2019s equipped (active) bubbles. Bubble, vial and sigil levels are account-wide (Account \u203a W2 \u203a Alchemy).'));
    let bar = '';
    b.forEach((r, s) => {
      const bn = bb[s] ? bb[s].name : '(empty)';
      const empty = !r.code || r.code === '0' || r.code === 0;
      bar += '<div class="css-setup-gcell' + (bn !== r.name ? ' css-setup-chg' : '') + '"><button type="button" class="css-setup-slot css-setup-bubslot" data-pick="bubble" data-slot="' + s + '" data-fid="bub-' + s + '"' +
        rt(() => tipHtml(empty ? 'Bubble slot ' + (s + 1) : gameText(r.name), [empty ? '(empty)' : esc(r.code)])) + '>' + (empty ? '' : iconHtml('bubbles', r.code, r.name, { size: 48 })) + '</button>' +
        '<div class="css-setup-gname">' + esc(empty ? '(empty)' : gameText(r.name)) + '</div>' + (bn !== r.name ? '<div class="css-setup-muted">was ' + esc(gameText(bn)) + '</div>' : '') + '</div>';
    });
    h += cardbox('Equipped bubbles', '<div class="css-setup-tiles">' + bar + '</div>', changed(p) ? ' <button type="button" data-act="unpatch" ' + attrsOf(p) + '>\u21ba Revert</button>' : '');
    return h;
  }

  function labState(c) {
    let L = CS.readRawKey(c.patched, 'Lab');
    if (typeof L === 'string') { try { L = JSON.parse(L); } catch (e) { L = null; } }
    return Array.isArray(L) ? L : [];
  }
  const LAB_W = 2120, LAB_H = 474, LAB_K = 0.42;
  function chipTip(id) {
    const d = ChipDesc[id];
    if (!Array.isArray(d)) return tipHtml('(empty)', []);
    return tipHtml(gameText(d[0]), [esc(gameText(String(d[1] || '').replace(/[{}]/g, '#'))), d[2] ? esc(gameText(d[2])) : '']);
  }

  function renderLab(c) {
    const lab = c.state.lab, bl = c.base.lab;
    const pp = { system: 'labPosition' };
    let h = tools('lab', help('This character\u2019s equipped chips (Lab[1+X]) and lab-board position (Lab[0]); the loader recomputes mainframe connectivity from positions. Jewel unlocks are account-wide (Account \u203a W4 \u203a Lab).'));
    // chips
    let chips = '';
    const n = Math.max(lab.chips.length, 7);
    for (let s = 0; s < n; s++) {
      const r = lab.chips[s] || { id: -1, name: '(empty)' };
      const p = { system: 'labChip', slot: s };
      const empty = !(r.id >= 0);
      chips += '<div class="css-setup-gcell' + chgCls(p) + '"><button type="button" class="css-setup-slot css-setup-chipslot" data-pick="chip" data-slot="' + s + '" data-fid="chip-' + s + '"' + rt(() => empty ? tipHtml('Chip slot ' + (s + 1), ['(empty)']) : chipTip(r.id)) + '>' +
        (empty ? '' : iconHtml('chips', r.id, r.name, { size: 42, cls: 'css-setup-ico-bare' })) + '</button>' +
        '<div class="css-setup-gname">' + esc(empty ? '(empty)' : gameText(r.name)) + '</div>' + pill(gameText(bl.chips[s] ? bl.chips[s].name : '(empty)'), gameText(r.name), p) + '</div>';
    }
    h += cardbox('Chips', '<div class="css-setup-chiprow">' + chips + '</div>');
    // map
    const L = labState(c);
    const pos = Array.isArray(L[0]) ? L[0] : [];
    const raw = getRaw();
    const chars = raw ? CS.characterOptions(raw) : [];
    let m = '';
    const mf = systemLayout('lab', 'mainframe');
    if (mf && Array.isArray(mf.positions)) mf.positions.forEach((q, i) => {
      m += '<span class="css-setup-labmf" style="left:' + Math.round(n0(q[0]) * LAB_K) + 'px;top:' + Math.round(n0(q[1]) * LAB_K) + 'px"' + rt(() => tipHtml('Mainframe bonus ' + (i + 1), ['Connect radius ' + (mf.connectRadius || 80) + 'px'])) + '></span>';
    });
    const jw = systemLayout('lab', 'jewels');
    if (jw && Array.isArray(jw.positions)) jw.positions.forEach((q, i) => {
      m += '<span class="css-setup-labjw" style="left:' + Math.round(n0(q[0]) * LAB_K) + 'px;top:' + Math.round(n0(q[1]) * LAB_K) + 'px"' + rt(() => tipHtml('Jewel ' + (i + 1), [])) + '></span>';
    });
    chars.forEach(ch => {
      const x = n0(pos[2 * ch.ci]), y = n0(pos[2 * ch.ci + 1]);
      if (!x && !y) return;
      const me = ch.ci === ci();
      m += '<span class="css-setup-labdot' + (me ? ' css-setup-sel' : '') + '" style="left:' + Math.round(x * LAB_K) + 'px;top:' + Math.round(y * LAB_K) + 'px"' +
        rt(() => tipHtml(ch.name, [esc(ch.className) + ' \u00b7 (' + x + ', ' + y + ')'])) + '></span>';
    });
    const u = frameUrl('lab', 'LabBG');
    const mapHtml = '<div class="css-setup-labmap2" data-act="labClick" style="width:' + Math.round(LAB_W * LAB_K) + 'px;height:' + Math.round(LAB_H * LAB_K) + 'px;' +
      (u ? bgStyle(u) + 'background-size:' + Math.round(960 * LAB_K) + 'px ' + Math.round(LAB_H * LAB_K) + 'px;background-repeat:repeat-x;' : '') + '">' + m + '</div>';
    h += cardbox('Lab position', '<div class="css-setup-labscroll">' + mapHtml + '</div><div class="css-setup-tools' + chgCls(pp) + '"><span>x</span>' + stepper(lab.x, 'data-act="labX" data-fid="labX"', { min: 0, width: 60 }) +
      '<span>y</span>' + stepper(lab.y, 'data-act="labY" data-fid="labY"', { min: 0, width: 60 }) + pill(bl.x + ', ' + bl.y, lab.x + ', ' + lab.y, pp) +
      '<span class="css-setup-muted">Click the map to move this character (gold). Teal squares are mainframe bonuses, violet diamonds jewels.</span></div>');
    return h;
  }

  function renderDivinity(c) {
    const dv = c.state.divinity, bd = c.base.divinity;
    const gp = { system: 'divinity', god: 0 };
    let h = tools('divinity', help('Divinity[X] links this character to a god and sets its meditation style. Blessing levels are account-wide (Account \u203a W5 \u203a Divinity).'));
    h += cardbox('Linked god & style', '<div class="css-setup-tools"><button type="button" class="css-setup-slot" data-pick="god" data-fid="god"' + rt(() => tipHtml(CS.godName(dv.god), ['Linked god'])) + '>' + iconHtml('gods', dv.god >= 0 ? dv.god : null, CS.godName(dv.god), { size: 48 }) + '</button>' +
      '<span>' + esc(CS.godName(dv.god)) + '</span>' + pill(CS.godName(bd.god), CS.godName(dv.god), gp) +
      '<span>Style</span>' + stepper(dv.style, 'data-act="divStyle" data-fid="divStyle"', { min: 0, width: 44 }) + pill(bd.style, dv.style) + '</div>');
    return h;
  }

  function renderResearch(c) {
    return tools('sys:g:Research', help('In-game Research grid. Node levels write Research[0]; shape drops write Research[6] and re-run the game\'s first-come ownership pass into Research[1], which every shape-dependent bonus reads.')) +
      researchGridHostHtml();
  }

  function renderStatues(c) {
    const rows = c.state.statues, base = c.base.statues;
    let h = tools('sys:g:Statues', filterBox('sys:g:Statues', 'Filter statues') + help('Statue levels are written to StatueLevels_X for every character (the loader reads character 0). Tier is StuG (0 normal, 1 gold, 2 onyx, 3 zenith).'));
    h += '<div class="css-setup-grid css-setup-grid-wide">';
    rows.forEach((r, i) => {
      if (!match('sys:g:Statues', r.name)) return;
      const pl = { system: 'statue', idx: r.idx, level: 0 };
      const pt = { system: 'statue', idx: r.idx, tier: 0 };
      const b = base[i] || { level: 0, tier: 0 };
      const tier = Math.max(0, Math.min(3, n0(r.tier)));
      const info = StatueInfo[r.idx];
      const desc = Array.isArray(info) ? info.slice(1, 3).filter(x => typeof x === 'string' && x && !Number.isFinite(Number(x))).map(x => esc(gameText(x))) : [];
      h += '<div class="css-setup-gcell' + (changed(pl) || changed(pt) ? ' css-setup-chg' : '') + '"><span' + rt(() => tipHtml(gameText(r.name), desc.concat(['Level ' + esc(r.level) + ' \u00b7 ' + TIER_NAMES[tier]]))) + '>' +
        iconHtml(TIER_SYS[tier], r.idx, r.name, { size: 44 }) + '</span><div class="css-setup-gname">' + esc(gameText(r.name)) + '</div>' +
        stepper(r.level, 'data-act="statueLv" data-idx="' + r.idx + '" data-fid="sl-' + r.idx + '"', { min: 0, width: 52 }) + pill(b.level, r.level, pl) +
        '<div class="css-setup-tiers">' + TIER_NAMES.map((n, t) => '<button type="button" data-act="statueTierBtn" data-idx="' + r.idx + '" data-t="' + t + '" class="css-setup-tier' + t + (t === tier ? ' css-setup-on' : '') + '"' + rt(() => esc(n + ' tier')) + ' aria-label="' + n + ' tier">' + n[0] + '</button>').join('') + '</div>' +
        pill(TIER_NAMES[Math.max(0, Math.min(3, n0(b.tier)))], TIER_NAMES[tier], pt) + '</div>';
    });
    return h + '</div>';
  }

  function renderFilter(c) {
    const f = c.state.printerFilter, base = c.base.printerFilter;
    let h = tools('sys:filter', filterBox('sys:filter', 'Filter slots') +
      help('Filtered items are removed from the monster drop table before they spawn; any other filtered drop is recycled 300 ms after spawning. Only the first ' + f.slots + ' slots are active (Event Shop and bundle upgrades unlock up to 144).'));
    if (!f.available) h += '<div class="css-setup-warn">This save has no PrinterXtra data; filter edits create it.</div>';
    const used = f.items.slice(0, f.slots).filter(k => k !== 'Blank').length;
    h += '<div class="css-setup-tools"><b>' + used + '</b> / ' + f.slots + ' active slots used <button type="button" data-pick="filterAdd" data-fid="filterAdd">+ Filter an item\u2026</button></div>';
    h += '<div class="css-setup-fgrid">';
    for (let k = 0; k < f.slots; k++) {
      const key = f.items[k];
      const empty = !key || key === 'Blank';
      if (!match('sys:filter', CS.itemName(key) + ' ' + key)) continue;
      const p = { system: 'printerFilter', slot: k };
      const bk = base.items[k];
      h += '<div class="css-setup-fcell' + chgCls(p) + '">' +
        '<button type="button" class="css-setup-slot" data-pick="filterItem" data-slot="' + k + '" data-fid="flt-' + k + '" aria-label="Filter slot ' + (k + 1) + '"' +
        rt(() => empty ? tipHtml('Filter slot ' + (k + 1), ['(empty)', bk && bk !== 'Blank' && bk !== key ? 'save: ' + esc(gameText(CS.itemName(bk))) : '']) : itemCardHtml(key) + (bk !== key ? '<div class="css-setup-tipl">save: ' + esc(gameText(CS.itemName(bk))) + '</div>' : '')) + '>' +
        (empty ? '<span class="css-setup-muted">' + (k + 1) + '</span>' : iconHtml('items', key, CS.itemName(key), { size: 40, cls: 'css-setup-ico-bare' })) + '</button>' +
        (!empty ? '<button type="button" class="css-setup-atkx" data-act="filterClear" ' + attrsOf(p) + ' aria-label="Clear">\u00d7</button>' : '') +
        (changed(p) ? '<button type="button" class="css-setup-revx" data-act="unpatch" ' + attrsOf(p) + ' aria-label="Revert">\u21ba</button>' : '') + '</div>';
    }
    return h + '</div>';
  }

  function renderCharacter(c) {
    const ch = c.state.character, bch = c.base.character;
    const cp = { system: 'charClass' };
    let h = tools('character', filterBox('character', 'Filter levels/boxes'));
    h += cardbox('Class', '<div class="css-setup-tools"><button type="button" data-pick="charClass" data-fid="charClass" class="css-setup-uq">' + esc(ch.className) + ' \u25be</button>' +
      '<span class="css-setup-muted">Lv ' + esc(fmt(ch.level)) + '</span>' + pill(bch.className, ch.className, cp) +
      help('CharacterClass_X. Changing class changes which talents, attacks and class-gated bonuses apply; the talent book follows the class.') + '</div>');
    h += cardbox('Character & skill levels (Lv0_X)', tableGrid(c, 'skillLevels', { filterTab: 'character', min: 0 }));
    h += details('char-po', 'Post Office boxes (POu_X)', () => tableGrid(c, 'postOffice', { filterTab: 'character', min: 0 }));
    const bp = { system: 'buffs' };
    h += details('char-buffs', 'Active buffs (' + c.state.buffs.length + ')', () =>
      '<div class="css-setup-tools"><span class="css-setup-muted">' + esc(c.state.buffs.map(b => gameText(b.name)).join(', ') || '(none)') + '</span>' +
      help('BuffsActive_X entries are [talent id, value, seconds remaining]. Edit as JSON, e.g. [[94,3018,9600]].') +
      (changed(bp) ? ' <button type="button" data-act="unpatch" ' + attrsOf(bp) + '>\u21ba Revert</button>' : '') + '</div>' +
      '<textarea class="css-setup-io" style="min-height:40px" data-act="buffs" data-fid="buffs">' + esc(JSON.stringify(c.state.buffs.map(b => [b.talent].concat(b.values)))) + '</textarea>');
    h += '<div class="css-setup-muted">The attack bar is on the Talents tab.</div>';
    return h;
  }

  /** Default account view: every table of one LEVEL_TABLES group. */
  function renderTableSystem(c, sys) {
    const fk = 'sys:' + sys.id;
    let h = tools(fk, filterBox(fk, 'Filter entries') + (GROUP_HELP[sys.label] ? help(GROUP_HELP[sys.label]) : ''));
    if (sys.tables.length === 1) return h + tableGrid(c, sys.tables[0], { filterTab: fk, min: 0 });
    sys.tables.forEach(id => {
      const t = CS.levelTable(id);
      const n = setup.patches.filter(p => p.system === 'table' && p.table === id).length;
      h += details('acct-' + id, tableIcon(id, 0, t ? t.label : id, 18) + ' ' + esc(t ? t.label : id) + (n ? ' <span class="css-setup-badge">' + n + '</span>' : ''),
        () => tableGrid(c, id, { filterTab: fk, min: 0 }));
    });
    return h;
  }

  function renderBallot(c) {
    const vp = { system: 'vote' };
    const opts = CS.voteOptions();
    const cur = c.state.vote == null ? -1 : c.state.vote;
    const label = v => v == null || v < 0 ? '(none)' : '#' + v + ' ' + ((opts.find(o => o.value === v) || {}).label || '');
    let h = tools('sys:ballot', help('The server-wide winning vote (serverVars.voteCategories[0]) applies to every character. Your own ballot choice does not matter to the sim; only the winner does.'));
    h += cardbox('Winning vote bonus', '<div class="css-setup-tools"><select data-act="vote" data-fid="vote" class="css-setup-choice"><option value="-1"' + (cur < 0 ? ' selected' : '') + '>(none)</option>' +
      opts.map(o => '<option value="' + o.value + '"' + (o.value === cur ? ' selected' : '') + '>' + esc('#' + o.value + ' ' + o.label) + '</option>').join('') + '</select>' +
      pill(label(c.base.vote), label(c.state.vote), vp) + '</div>');
    return h;
  }

  function renderSignUnlocks(c) {
    const fk = 'sys:signUnlocks';
    const rows = CS.readStarSignUnlocks(c.patched);
    const base = new Map(CS.readStarSignUnlocks(getRaw()).map(r => [r.name, r.unlocked]));
    const on = rows.filter(r => r.unlocked).length;
    let h = tools(fk, filterBox(fk, 'Filter signs') + '<span class="css-setup-muted"><b>' + on + '</b> / ' + rows.length + ' unlocked</span>' +
      help('StarSg: account-wide unlocked star signs. Only unlocked signs can be equipped, and some bonuses count unlocked signs.'));
    h += '<div class="css-setup-grid css-setup-grid-wide">';
    rows.forEach(r => {
      if (!match(fk, r.label + ' ' + r.name)) return;
      const p = { system: 'starSignUnlock', name: r.name };
      const b = !!base.get(r.name);
      h += '<div class="css-setup-gcell' + chgCls(p) + (r.unlocked ? '' : ' css-setup-dim') + '"><span' + rt(() => signTip(r.index)) + '><span class="css-setup-signstar">\u2605</span></span>' +
        '<div class="css-setup-gname">' + esc(gameText(r.label)) + '</div>' +
        '<label class="css-setup-check"><input type="checkbox" data-act="signUnlock" data-name="' + esc(r.name) + '" data-fid="su-' + esc(r.name) + '"' + (r.unlocked ? ' checked' : '') + '>Unlocked</label>' +
        pill(b ? 'Unlocked' : 'Locked', r.unlocked ? 'Unlocked' : 'Locked', p) + '</div>';
    });
    return h + '</div>';
  }

  /** Read-only totals recomputed from other fields (supplied by the host page). */
  function renderDerived() {
    const d = getDerived();
    let h = tools('sys:derived', help('These values cannot be set directly: the game recomputes them from other save fields. Edit the listed sources and the current column follows once the setup is applied.'));
    if (!d || !d.current) return h + '<div class="css-setup-muted">Derived values are not available on this page.</div>';
    if (d.pending) h += '<div class="css-setup-muted">Applying the latest edits\u2026</div>';
    const base = new Map((d.base || []).map(e => [e.id, e]));
    const fmt = (e, v) => v == null ? '\u2014' : e.fmt === 'x' ? '\u00d7' + Number(v).toLocaleString() : Number(v).toLocaleString();
    const groups = [];
    d.current.forEach(e => { let g = groups.find(x => x.name === e.group); if (!g) groups.push(g = { name: e.group, rows: [] }); g.rows.push(e); });
    groups.forEach(g => {
      let t = '<table class="css-setup-table"><thead><tr><th>Value</th><th class="css-setup-num">Imported</th><th class="css-setup-num">Current</th><th>Used by</th><th>Change it via</th></tr></thead><tbody>';
      g.rows.forEach(e => {
        const b = base.get(e.id);
        const bv = b ? b.value : null;
        const diff = bv != null && bv !== e.value;
        const src = (e.sources || []).map(s => s.raw
          ? '<button type="button" class="css-setup-link" data-act="scope" data-scope="raw">' + esc(s.label) + '</button>'
          : '<button type="button" class="css-setup-link" data-act="goSys" data-world="' + esc(s.world) + '" data-id="' + esc(s.sys) + '">' + esc(s.label) + '</button>').join(' ');
        t += '<tr' + (diff ? ' class="css-setup-changed"' : '') + '><td><span' + rt(() => '<b>' + esc(e.label) + '</b><br>' + esc(e.note || '')) + ' tabindex="0">' + esc(e.label) + '</span></td>' +
          '<td class="css-setup-num">' + fmt(e, bv) + '</td><td class="css-setup-num">' + fmt(e, e.value) + (diff ? ' <span class="css-setup-badge">' + (e.value > bv ? '+' : '') + (e.value - bv).toLocaleString() + '</span>' : '') + '</td>' +
          '<td class="css-setup-muted">' + esc(e.feeds || '') + '</td><td>' + (src || '<span class="css-setup-muted">(follows above)</span>') + '</td></tr>';
      });
      h += cardbox(g.name, t + '</tbody></table>');
    });
    return h;
  }

  /** Account scope: dispatch the selected world system to its renderer. */
  function renderAccountView(c) {
    const sys = curAcct();
    if (!sys) return '<div class="css-setup-muted">No editable systems in this world.</div>';
    switch (sys.view) {
      case 'statues': return renderStatues(c);
      case 'research': return renderResearch(c);
      case 'ballot': return renderBallot(c);
      case 'cardLevels': return renderCardLevels(c);
      case 'derived': return renderDerived();
      case 'signUnlocks': return renderSignUnlocks(c);
      case 'companions': return renderCompanions(c);
      case 'familyObols': return renderObols(c, true);
      case 'filter': return renderFilter(c);
      default: return renderTableSystem(c, sys);
    }
  }

  function renderCompanions(c) {
    const comp = c.state.companions, base = new Map(c.base.companions.owned.map(o => [o.id, o]));
    const owned = new Map(comp.owned.map(o => [o.id, o]));
    let h = tools('sys:companions', filterBox('sys:companions', 'Filter companions') + ' <label class="css-setup-check"><input type="checkbox" data-act="compOwnedOnly"' + (ui.compOwnedOnly ? ' checked' : '') + '>Owned only</label>' +
      help('companion.l in the save wrapper. Click a companion to toggle ownership; tick Pet+ for the enhanced bonus. Pet Bonus Tokens (OLA[606]) still grant their companions even when unowned here.'));
    if (!comp.available) h += '<div class="css-setup-muted">This save has no companion wrapper data; editing creates it.</div>';
    h += '<div class="css-setup-grid">';
    CS.companionOptions().forEach(o => {
      const own = owned.get(o.id);
      if (ui.compOwnedOnly && !own) return;
      if (!match('sys:companions', o.name + ' ' + o.id)) return;
      const p = { system: 'companion', id: o.id };
      const b = base.get(o.id);
      const row = CompanionDB[o.id];
      const desc = Array.isArray(row) ? row.slice(1, 2).filter(x => typeof x === 'string' && x && !Number.isFinite(Number(x))).map(x => esc(gameText(x))) : [];
      const sv = b ? (b.enhanced ? 'Pet+' : 'owned') : 'not owned';
      const nv = own ? (own.enhanced ? 'Pet+' : 'owned') : 'not owned';
      h += '<div class="css-setup-gcell' + chgCls(p) + (own ? '' : ' css-setup-dim') + '"><button type="button" class="css-setup-slot" data-act="compToggle" data-id="' + o.id + '" aria-pressed="' + (own ? 'true' : 'false') + '" aria-label="' + esc(gameText(o.name)) + '"' +
        rt(() => tipHtml(gameText(o.name), desc.concat([own ? (own.enhanced ? 'Owned (Pet+)' : 'Owned') : 'Not owned', '<span class="css-setup-muted">#' + o.id + '</span>']))) + '>' +
        iconHtml('companions', o.id, o.name, { size: 44, cls: 'css-setup-ico-bare' }) + '</button><div class="css-setup-gname">' + esc(gameText(o.name)) + '</div>' +
        '<label class="css-setup-check"><input type="checkbox" data-act="compPlus" data-id="' + o.id + '"' + (own && own.enhanced ? ' checked' : '') + (own ? '' : ' disabled') + '>Pet+</label>' + pill(sv, nv, p) + '</div>';
    });
    return h + '</div>';
  }

  function renderRaw(c) {
    let h = tools('raw', help('Generic fallback for any save key. Path segments are separated by dots (e.g. key Cards0, path Boss2A; key Research, path 7.9). Use {ci} in the key for the selected character (e.g. CurrentMap_{ci}). Value is parsed as JSON when possible.'));
    h += '<div class="css-setup-tools">Key <input data-fid="rawKey" id="css-setup-raw-key" placeholder="e.g. Cards0" style="width:150px"> Path <input data-fid="rawPath" id="css-setup-raw-path" placeholder="e.g. Boss2A" style="width:150px"> Value <input data-fid="rawVal" id="css-setup-raw-val" placeholder="JSON or text" style="width:180px"> <button data-act="rawCurrent">Read current</button> <button data-act="rawAdd">Add / replace</button></div>';
    if (ui.rawPreview != null) h += '<div class="css-setup-muted">Current: ' + esc(ui.rawPreview) + '</div>';
    const raws = setup.patches.filter(p => p.system === 'raw');
    h += '<table class="css-setup-table"><tr><th>Key</th><th>Path</th><th>Value</th><th></th></tr>';
    raws.forEach(p => {
      h += '<tr class="css-setup-changed"><td>' + esc(p.key) + '</td><td>' + esc(Array.isArray(p.path) ? p.path.join('.') : (p.path || '')) + '</td><td>' + esc(p.delete ? '(delete)' : JSON.stringify(p.value)) + '</td><td><button data-act="unpatch" ' + attrsOf(p) + '>Remove</button></td></tr>';
    });
    h += '</table>';
    h += '<div class="css-setup-h">Coverage</div><div class="css-setup-muted">' + CS.COMBAT_SETUP_COVERAGE.filter(r => r.editor === 'raw').map(r => esc(r.key)).join(' \u00b7 ') + '</div>';
    return h;
  }

  function renderChanges(c) {
    const d = c.diff;
    let h = tools('changes');
    if (!d.changed && !d.warnings.length) return h + '<div class="css-setup-muted">No changes vs the loaded save.</div>';
    h += '<ul class="css-setup-diff">';
    d.changes.forEach((ch, i) => {
      h += '<li><span>' + esc(d.lines[i]) + '</span><button data-act="removeIdx" data-idx="' + ch.patchIndex + '">Remove</button></li>';
    });
    d.warnings.forEach(w => { h += '<li class="css-setup-warn"><span>' + esc(w) + '</span></li>'; });
    return h + '</ul>';
  }

  const RENDER = { gear: renderGear, food: renderFood, talents: renderTalents, cards: renderCards, obols: c => renderObols(c, false), signs: renderSigns,
    bubbles: renderBubbles, lab: renderLab, divinity: renderDivinity, character: renderCharacter,
    acct: renderAccountView, raw: renderRaw, changes: renderChanges };

  function savedNames() {
    try { return readCombatLoadouts(store, ci()); }
    catch (e) { ui.message = 'Could not read loadouts: ' + e.message; return []; }
  }

  function render() {
    rtips = [];
    lastRt = null;
    const c = compute();
    const fid = document.activeElement && root.contains(document.activeElement) ? document.activeElement.getAttribute('data-fid') : null;
    const panel = view.querySelector('.css-setup-panel');
    const scroll = panel ? panel.scrollTop : 0;
    let h = '<div class="css-setup-bar"><span class="css-setup-count">' + c.diff.changed + ' change' + (c.diff.changed === 1 ? '' : 's') + '</span>' +
      '<input data-fid="setupName" data-act="name" placeholder="Character loadout name" value="' + esc(setup.label) + '" style="width:180px">' +
      '<button data-act="saveNamed">Save loadout</button><select data-act="loadNamed" data-fid="loadNamed"><option value="">This character\'s loadouts\u2026</option>' + savedNames().map(n => '<option value="' + esc(n.key) + '">' + esc(n.name) + '</option>').join('') + '</select>' +
      '<button data-act="deleteNamed" class="css-setup-danger">Delete saved</button><button data-act="export">Export JSON</button><button data-act="import">Import JSON</button>' +
      '<button data-act="resetAll" class="css-setup-danger">Reset all</button>' + (ui.message ? '<span class="css-setup-muted">' + esc(ui.message) + '</span>' : '') + '</div>';
    if (ui.io) h += '<div style="margin-bottom:6px"><textarea class="css-setup-io" data-fid="io" id="css-setup-io">' + esc(ui.io === 'export' ? JSON.stringify(setup, null, 1) : '') + '</textarea>' +
      (ui.io === 'import' ? '<button data-act="doImport">Apply import</button> ' : '') + '<button data-act="closeIo">Close</button></div>';
    const count = id => { const f = testFor(id); return f ? setup.patches.filter(f).length : 0; };
    const badge = n => n ? '<span class="css-setup-badge">' + n + '</span>' : '';
    const scope = CHAR_TAB_IDS.indexOf(ui.tab) >= 0 ? 'char' : ui.tab;
    const chars = c.patched ? CS.characterOptions(getRaw() || c.patched) : [];
    const me = chars.find(x => x.ci === ci());
    h += '<div class="css-setup-scope">' + [['char', 'Character' + (me ? ': ' + me.name : ''), count('scope:char')], ['acct', 'Account', count('scope:acct')], ['raw', 'Raw keys', count('raw')], ['changes', 'Changes', c.diff.changed]]
      .map(s => '<button type="button" data-act="scope" data-scope="' + s[0] + '" class="' + (s[0] === scope ? 'css-setup-active' : '') + '">' + esc(s[1]) + badge(s[2]) + '</button>').join('') + '</div>';
    if (scope === 'char') {
      h += '<div class="css-setup-tabs">' + CHAR_TABS.map(t => '<button data-act="tab" data-tab="' + t.id + '" class="' + (t.id === ui.tab ? 'css-setup-active' : '') + '">' + esc(t.label) + badge(count(t.id)) + '</button>').join('') + '</div>';
      h += '<div class="css-setup-banner">Applies to <b>' + esc(me ? me.name + ' (' + me.className + ')' : 'the selected character') + '</b> only. Switch character on the page to edit another.</div>';
    } else if (scope === 'acct') {
      const sys = curAcct();
      h += '<div class="css-setup-tabs">' + ACCT_WORLDS.map(w => '<button data-act="world" data-world="' + w.id + '" class="' + (w.id === ui.world ? 'css-setup-active' : '') + '">' + esc(w.label) + badge(count('world:' + w.id)) + '</button>').join('') + '</div>';
      h += '<div class="css-setup-seg css-setup-seg-wrap css-setup-sysrow">' + acctSystemsOf(ui.world).map(s => '<button type="button" data-act="acctSys" data-id="' + esc(s.id) + '" class="' + (sys && s.id === sys.id ? 'css-setup-on' : '') + '">' +
        (s.tables && s.tables.length ? tableIcon(s.icon, 0, s.label, 18) : '') + esc(s.label) + badge(setup.patches.filter(s.test).length) + '</button>').join('') + '</div>';
      h += '<div class="css-setup-banner css-setup-banner-acct">Account-wide \u2014 affects every character.</div>';
    }
    h += '<div class="css-setup-panel">';
    if (!c.patched) h += '<div class="css-setup-muted">Load a save to edit its setup.</div>';
    else {
      try { h += RENDER[ui.tab](c); } catch (e) { console.error(e); h += '<div class="css-setup-warn">Editor failed: ' + esc(e && e.message || e) + '</div>'; }
    }
    h += '</div>';
    view.innerHTML = h;
    if (ui.tab === 'acct' && c.patched && curAcct() && curAcct().view === 'research') {
      const rh = view.querySelector('#css-rgrid-host');
      if (rh) {
        try { mountResearchGrid(rh, { compute, upsert, remove, findPatch, changed, getRaw, ci, rerender: render }, ui); } catch (e) { console.error(e); rh.innerHTML = '<div class="css-setup-warn">Research grid failed: ' + esc(e && e.message || e) + '</div>'; }
      }
    }
    const np = view.querySelector('.css-setup-panel');
    if (np) np.scrollTop = scroll;
    if (fid) {
      const el = view.querySelector('[data-fid="' + (window.CSS && CSS.escape ? CSS.escape(fid) : fid) + '"]');
      if (el) { el.focus(); if (el.select && el.type !== 'search' && el.tagName === 'INPUT') { try { el.select(); } catch (e) { /* number inputs */ } } }
    }
  }
  let pending = false;
  function scheduleRender() {
    if (pending) return;
    pending = true;
    setTimeout(() => { pending = false; render(); }, 0);
  }

  // ----- event handling -----------------------------------------------------
  function patchOf(el) { try { return JSON.parse(el.getAttribute('data-patch')); } catch (e) { return null; } }
  function numVal(el) { const n = Number(el.value); return Number.isFinite(n) ? n : 0; }
  function currentRowCodes(list, field) { return list.map(r => r[field]); }

  function onPick(el, apply) {
    const dl = el.getAttribute('data-dl');
    const key = parsePick(dl, el.value);
    if (key === undefined) { ui.message = 'No match for "' + el.value + '"'; scheduleRender(); return; }
    ui.message = '';
    apply(key);
  }

  function handleChange(e) {
    const el = e.target;
    const act = el.getAttribute && el.getAttribute('data-act');
    if (!act) return;
    const c = compute();
    const p = patchOf(el);
    switch (act) {
      case 'item': onPick(el, key => upsert(Object.assign({}, findPatch(p) || {}, p, { item: key == null ? 'Blank' : key, stats: undefined }))); break;
      case 'stat': {
        const kind = el.getAttribute('data-kind'), slot = Number(el.getAttribute('data-slot')), row = Number(el.getAttribute('data-row'));
        const stat = el.getAttribute('data-stat');
        const isTxt = /txt$/.test(stat);
        const val = isTxt ? (el.value.trim() || 0) : numVal(el);
        if (kind === 'equipment') {
          const r = (row === 0 ? c.state.equipment.armor : c.state.equipment.tools)[slot];
          const stats = Object.assign({}, r.stats || {}, { [stat]: val });
          upsert({ system: 'equipment', row, slot, item: r.item, stats });
        } else {
          const scope = kind === 'obol-family' ? 'family' : 'personal';
          const r = c.state.obols[scope][slot];
          const stats = Object.assign({}, r.stats || {}, { [stat]: val });
          upsert({ system: 'obol', scope, slot, item: r.item, stats });
        }
        break;
      }
      case 'food': onPick(el, key => { const prev = findPatch(p) || {}; upsert(Object.assign({}, prev, p, { item: key == null ? 'Blank' : key })); }); break;
      case 'foodQty': {
        const r = c.state.equipment.food[p.slot] || { item: 'Blank' };
        upsert(Object.assign({}, findPatch(p) || {}, p, { item: r.item, qty: numVal(el) }));
        break;
      }
      case 'foodSlots': upsert({ system: 'foodSlots', value: numVal(el) }); break;
      case 'obol': onPick(el, key => upsert(Object.assign({}, p, { item: key == null ? 'Blank' : key }))); break;
      case 'card': onPick(el, key => upsert(Object.assign({}, p, { key: key == null ? 'B' : key }))); break;
      case 'cardSet': upsert({ system: 'cardSet', set: Number(el.value) }); break;
      case 'cardLevel': {
        const lv = Math.max(0, Math.round(numVal(el)));
        if (lv === CS.cardLevelInfo(getRaw(), p.key).level) remove(p);
        else upsert(Object.assign({}, p, { level: lv }));
        break;
      }
      case 'superTalent': {
        const id = Number(el.getAttribute('data-id')), preset = Number(el.getAttribute('data-preset'));
        const sp = { system: 'superTalent', id, preset };
        const was = c.base.superTalents && c.base.superTalents.presets[preset].ids.indexOf(id) >= 0;
        ui.talSel = id;
        if (el.checked === !!was) remove(sp); else upsert(Object.assign({}, sp, { on: el.checked }));
        break;
      }
      case 'talentLv': case 'talentMax': {
        const t = c.state.talents.find(x => x.id === p.id) || { level: 0, max: 0 };
        upsert(Object.assign({}, p, { level: act === 'talentLv' ? numVal(el) : t.level, max: act === 'talentMax' ? numVal(el) : t.max }));
        break;
      }
      case 'addTalent': onPick(el, key => {
        if (key == null) return;
        const t = c.state.talents.find(x => x.id === Number(key));
        ui.filters.talents = CS.talentName(key);
        upsert({ system: 'talent', id: Number(key), level: t ? t.level : 0, max: t ? t.max : 0 });
      }); break;
      case 'sign': onPick(el, key => {
        const ids = currentRowCodes(c.state.starSigns, 'id');
        const s = Number(el.getAttribute('data-slot'));
        while (ids.length <= s) ids.push('_');
        ids[s] = key == null ? '_' : key;
        while (ids.length > 1 && ids[ids.length - 1] === '_' && ids.length > c.base.starSigns.length) ids.pop();
        upsert({ system: 'starSigns', ids });
      }); break;
      case 'prayer': onPick(el, key => {
        const ids = currentRowCodes(c.state.prayers, 'id');
        const s = Number(el.getAttribute('data-slot'));
        while (ids.length <= s) ids.push(-1);
        ids[s] = key == null ? -1 : Number(key);
        upsert({ system: 'prayers', ids });
      }); break;
      case 'bubble': onPick(el, key => {
        const codes = currentRowCodes(c.state.bubbles, 'code');
        codes[Number(el.getAttribute('data-slot'))] = key == null || key === '0' ? 0 : key;
        upsert({ system: 'bubbles', codes });
      }); break;
      case 'table': {
        const v = el.type === 'checkbox' ? (el.checked ? 1 : 0) : el.tagName === 'SELECT' ? (Number.isFinite(Number(el.value)) ? Number(el.value) : el.value) : numVal(el);
        const b = CS.readTable(getRaw(), p.table, ci()).find(r => r.index === p.index);
        if (b && String(b.value) === String(v)) remove(p);
        else upsert(Object.assign({}, p, { value: v }));
        break;
      }
      case 'signUnlock': {
        const name = el.getAttribute('data-name');
        const b = CS.readStarSignUnlocks(getRaw()).find(r => r.name === name);
        if (b && !!b.unlocked === el.checked) remove({ system: 'starSignUnlock', name });
        else upsert({ system: 'starSignUnlock', name, unlocked: el.checked });
        break;
      }
      case 'labX': upsert({ system: 'labPosition', x: numVal(el), y: c.state.lab.y }); break;
      case 'labY': upsert({ system: 'labPosition', x: c.state.lab.x, y: numVal(el) }); break;
      case 'chip': onPick(el, key => upsert(Object.assign({}, p, { chip: key == null ? -1 : Number(key) }))); break;
      case 'god': upsert({ system: 'divinity', god: Number(el.value) }); break;
      case 'divStyle': upsert({ system: 'divinity', style: numVal(el) }); break;
      case 'statueLv': upsert({ system: 'statue', idx: Number(el.getAttribute('data-idx')), level: numVal(el) }); break;
      case 'statueTier': upsert({ system: 'statue', idx: Number(el.getAttribute('data-idx')), tier: numVal(el) }); break;
      case 'filterItem': onPick(el, key => upsert(Object.assign({}, p, { item: key == null ? 'Blank' : key }))); break;
      case 'filterAdd': onPick(el, key => {
        if (key == null || key === 'Blank') return;
        const f = c.state.printerFilter;
        if (f.items.slice(0, f.slots).indexOf(key) >= 0) { ui.message = CS.itemName(key) + ' is already filtered'; scheduleRender(); return; }
        const slot = f.items.slice(0, f.slots).indexOf('Blank');
        if (slot < 0) { ui.message = 'All ' + f.slots + ' active filter slots are full'; scheduleRender(); return; }
        ui.message = 'Filtered ' + CS.itemName(key);
        upsert({ system: 'printerFilter', slot, item: key });
      }); break;
      case 'charClass': upsert({ system: 'charClass', value: Number(el.value) }); break;
      case 'attack': onPick(el, key => upsert(Object.assign({}, p, { talent: key == null ? 'Null' : Number(key) }))); break;
      case 'buffs': {
        try {
          const list = JSON.parse(el.value);
          if (!Array.isArray(list)) throw new Error('expected an array');
          ui.message = '';
          upsert({ system: 'buffs', list });
        } catch (err) { ui.message = 'Buffs JSON: ' + err.message; scheduleRender(); }
        break;
      }
      case 'compOwned': {
        const id = Number(el.getAttribute('data-id'));
        upsert({ system: 'companion', id, owned: el.checked, enhanced: el.checked ? undefined : undefined });
        break;
      }
      case 'compPlus': {
        const id = Number(el.getAttribute('data-id'));
        upsert({ system: 'companion', id, owned: true, enhanced: el.checked });
        break;
      }
      case 'compOwnedOnly': ui.compOwnedOnly = el.checked; scheduleRender(); break;
      case 'researchAll': ui.researchAll = el.checked; scheduleRender(); break;
      case 'vote': {
        const v = Number(el.value);
        if (v === (c.base.vote == null ? -1 : c.base.vote)) remove({ system: 'vote' });
        else upsert({ system: 'vote', idx: v });
        break;
      }      case 'copyFrom': ui.copyFrom = Number(el.value); break;
      case 'name': setup.label = el.value; commit(); break;
      case 'loadNamed': {
        const key = el.value;
        if (!key || !store) break;
        try {
          const entry = readCombatLoadouts(store, ci()).find(n => n.key === key);
          if (!entry) throw new Error('Loadout does not belong to this character');
          setup = entry.setup;
          if (!setup.label) setup.label = entry.name;
          ui.message = 'Loaded "' + entry.name + '"';
          commit();
        } catch (err) { ui.message = 'Could not load: ' + err.message; scheduleRender(); }
        break;
      }
      case 'slotsBeforeStones': {
        const sel = ui.gearSel || { row: 0, slot: 1 };
        const g = gearInstance(c, sel.row, sel.slot);
        const delta = numVal(el) - n0((ITEMS[g.item] || {}).Upgrade_Slots_Left);
        gearEdit(sel.row, sel.slot, extra => { if (delta) extra.Upgrade_Slots_Left = delta; else delete extra.Upgrade_Slots_Left; });
        break;
      }
      case 'extraStat': {
        const sel = ui.gearSel || { row: 0, slot: 1 };
        const stat = el.getAttribute('data-stat'), v = numVal(el);
        gearEdit(sel.row, sel.slot, extra => { if (v) extra[stat] = v; else delete extra[stat]; });
        break;
      }
      case 'extraAdd': if (el.value) { ui.gearShow = Object.assign({}, ui.gearShow, { [el.value]: true }); render(); } break;
      case 'obolStatAdd': if (el.value) { ui.obolShow = Object.assign({}, ui.obolShow, { [el.value]: true }); render(); } break;
      case 'stonePick': case 'stoneAmt': case 'stoneFail': {
        const sel = ui.gearSel || { row: 0, slot: 1 };
        const i = Number(el.getAttribute('data-i')), ei = Number(el.getAttribute('data-e'));
        gearEdit(sel.row, sel.slot, (extra, stones) => {
          const s = stones[i];
          if (!s) return;
          if (act === 'stoneFail') { if (el.checked) s.failed = true; else delete s.failed; return; }
          s.picks = Array.isArray(s.picks) ? s.picks : [];
          const prev = s.picks[ei] && typeof s.picks[ei] === 'object' ? s.picks[ei] : (s.picks[ei] ? { stat: String(s.picks[ei]) } : {});
          s.picks[ei] = Object.assign({}, prev, act === 'stonePick' ? { stat: el.value } : { amount: numVal(el) });
          for (let k = 0; k < s.picks.length; k++) if (s.picks[k] === undefined) s.picks[k] = null;
        });
        break;
      }
      case 'stoneAttrMode': ui.stoneMode = el.value; break;
      default: break;
    }
  }

  function handleInput(e) {
    const el = e.target;
    if (el.getAttribute && el.getAttribute('data-act') === 'filter') {
      ui.filters[el.getAttribute('data-tab')] = el.value;
      clearTimeout(handleInput._t);
      handleInput._t = setTimeout(render, 150);
    }
  }

  function handleClick(e) {
    const sm = e.target.closest ? e.target.closest('summary') : null;
    if (sm && sm.parentElement && sm.parentElement.classList.contains('css-setup-fold') && root.contains(sm)) {
      e.preventDefault();
      const k = sm.parentElement.getAttribute('data-key');
      ui.expanded[k] = !ui.expanded[k];
      render();
      return;
    }
    const pk = e.target.closest ? e.target.closest('[data-pick]') : null;
    if (pk && root.contains(pk) && !(e.target.closest('[data-act]') && pk.contains(e.target.closest('[data-act]')) && e.target.closest('[data-act]') !== pk)) {
      const fidv = pk.getAttribute('data-fid');
      const kind = pk.getAttribute('data-pick');
      const selRaw = pk.getAttribute('data-sel');
      let anchor = pk;
      if (selRaw) {
        try { Object.assign(ui, JSON.parse(selRaw)); } catch (err) { /* ignore */ }
        render();
        anchor = (fidv && view.querySelector('[data-fid="' + (window.CSS && CSS.escape ? CSS.escape(fidv) : fidv) + '"]')) || null;
      }
      if (anchor) { hideTip(); openPick(kind, anchor); }
      return;
    }
    const el = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!el || !root.contains(el)) return;
    if (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') return;
    const act = el.getAttribute('data-act');
    const raw = getRaw();
    const A = n => el.getAttribute(n);
    const mult = e.shiftKey ? 10 : 1;
    switch (act) {
      case 'stepBtn': {
        const inp = el.parentElement && el.parentElement.querySelector('input');
        if (!inp || inp.disabled) break;
        let v = numVal(inp) + Number(A('data-d')) * mult;
        if (inp.min !== '' && Number.isFinite(Number(inp.min))) v = Math.max(Number(inp.min), v);
        if (inp.max !== '' && Number.isFinite(Number(inp.max))) v = Math.min(Number(inp.max), v);
        inp.value = String(v);
        inp.dispatchEvent(new Event('change', { bubbles: true }));
        break;
      }
      case 'talPage': ui.talPage = A('data-page'); render(); break;
      case 'talSel': ui.talSel = Number(A('data-id')); render(); break;
      case 'talStep': {
        const c = compute();
        const id = Number(A('data-id'));
        const t = c.state.talents.find(x => x.id === id) || { level: 0, max: 0 };
        const b = c.base.talents.find(x => x.id === id) || { level: 0, max: 0 };
        const nl = Math.max(0, n0(t.level) + Number(A('data-d')) * mult);
        ui.talSel = id;
        if (nl === n0(b.level) && n0(t.max) === n0(b.max)) remove({ system: 'talent', id });
        else upsert({ system: 'talent', id, level: nl, max: t.max });
        break;
      }
      case 'gearTab': {
        const t = Number(A('data-t'));
        if (t === 2) ui.tab = 'food';
        else {
          ui.tab = 'gear';
          if (ui.gearTab !== t) { ui.gearTab = t; ui.gearSel = t === 1 ? { row: 1, slot: 0 } : { row: 0, slot: ui.gearPage === 1 ? 8 : 1 }; }
        }
        render();
        break;
      }
      case 'gearPage': ui.gearPage = Number(A('data-page')); ui.gearSel = { row: 0, slot: ui.gearPage === 1 ? 8 : 1 }; render(); break;
      case 'foodPage': ui.foodPage = Number(A('data-page')); ui.foodSel = 8 * ui.foodPage; render(); break;
      case 'gearClear': {
        const row = Number(A('data-row')), slot = Number(A('data-slot'));
        const b = slotOf(baseEquipRows(compute(), row), slot);
        if (b && (!b.item || b.item === 'Blank')) remove({ system: 'equipment', row, slot });
        else upsert({ system: 'equipment', row, slot, item: 'Blank' });
        break;
      }
      case 'stoneRemove': {
        const sel = ui.gearSel || { row: 0, slot: 1 };
        const i = Number(A('data-i'));
        gearEdit(sel.row, sel.slot, (extra, stones) => { stones.splice(i, 1); });
        break;
      }
      case 'obolClear': upsert({ system: 'obol', scope: A('data-scope'), slot: Number(A('data-slot')), item: 'Blank' }); break;
      case 'attackClear': setAttacks([[Number(A('data-row')), Number(A('data-slot')), 'Null']]); break;
      case 'attackClearBar': { const r = Number(A('data-row')); setAttacks([0, 1, 2, 3, 4, 5].map(s => [r, s, 'Null'])); break; }
      case 'allBars': ui.allBars = !ui.allBars; render(); break;
      case 'atkRow': {
        const n = (compute().state.attackLoadout || []).length;
        ui.atkRow = Math.max(0, Math.min(Math.max(0, n - 1), n0(ui.atkRow) + Number(A('data-d'))));
        render();
        break;
      }
      case 'compToggle': {
        const c = compute();
        const id = Number(A('data-id'));
        const own = c.state.companions.owned.find(o => o.id === id);
        const b = c.base.companions.owned.find(o => o.id === id);
        const next = !own;
        if (next === !!b && (!b || !b.enhanced)) remove({ system: 'companion', id });
        else upsert({ system: 'companion', id, owned: next });
        break;
      }
      case 'statueTierBtn': {
        const idx = Number(A('data-idx')), t = Number(A('data-t'));
        const b = compute().base.statues.find(s => s.idx === idx);
        if (b && n0(b.tier) === t) remove({ system: 'statue', idx, tier: 0 });
        else upsert({ system: 'statue', idx, tier: t });
        break;
      }
      case 'labClick': {
        if (e.target !== el && !e.target.classList.contains('css-setup-labdot')) { /* allow clicking markers too */ }
        const r = el.getBoundingClientRect();
        const x = Math.round((e.clientX - r.left) / LAB_K), y = Math.round((e.clientY - r.top) / LAB_K);
        upsert({ system: 'labPosition', x: Math.max(0, x), y: Math.max(0, y) });
        break;
      }
      case 'tab': ui.tab = el.getAttribute('data-tab'); if (CHAR_TAB_IDS.indexOf(ui.tab) >= 0) ui.lastCharTab = ui.tab; ui.message = ''; render(); break;
      case 'scope': { const s = A('data-scope'); ui.tab = s === 'char' ? ui.lastCharTab : s; ui.message = ''; render(); break; }
      case 'world': ui.world = A('data-world'); ui.message = ''; render(); break;
      case 'acctSys': ui.acctSys[ui.world] = A('data-id'); ui.message = ''; render(); break;
    case 'goSys': ui.tab = 'acct'; ui.world = A('data-world'); ui.acctSys[ui.world] = A('data-id'); ui.message = ''; render(); break;
      case 'toggle': { const k = el.getAttribute('data-key'); ui.expanded[k] = !ui.expanded[k]; render(); break; }
      case 'unpatch': { const p = patchOf(el); if (p) remove(p); break; }
      case 'filterClear': { const p = patchOf(el); if (p) upsert(Object.assign({}, p, { item: 'Blank' })); break; }
      case 'removeIdx': {
        const i = Number(el.getAttribute('data-idx'));
        if (Number.isInteger(i) && setup.patches[i]) { setup = Object.assign({}, setup, { patches: setup.patches.filter((_, j) => j !== i) }); commit(); }
        break;
      }
      case 'resetTab': {
        const f = testFor(el.getAttribute('data-tab'));
        if (el.getAttribute('data-tab') === 'changes') { setup = CS.emptyCombatSetup(ci(), setup.label); commit(); break; }
        if (f) { setup = Object.assign({}, setup, { patches: setup.patches.filter(p => !f(p)) }); commit(); }
        break;
      }
      case 'resetAll': setup = CS.emptyCombatSetup(ci(), setup.label); ui.message = 'Setup cleared'; commit(); break;
      case 'copy': {
        if (!raw) break;
        const tab = el.getAttribute('data-tab');
        const from = Number(ui.copyFrom) || 0;
        if (from === ci()) { ui.message = 'Pick a different character to copy from'; render(); break; }
        const tests = (COPY_SYSTEMS[tab] || []).map(k => COPY_TESTS[k]).filter(Boolean);
        let s = Object.assign({}, setup, { patches: setup.patches.filter(p => (p.ci != null && Number(p.ci) !== ci()) || !tests.some(f => f(p))) });
        CS.copyCharacterPatches(raw, from, ci(), COPY_SYSTEMS[tab]).forEach(p => { s = CS.upsertPatch(s, strip(p)); });
        setup = s;
        ui.message = 'Copied ' + ((CHAR_TABS.find(x => x.id === tab) || {}).label || tab) + ' from ' + CS.characterName(raw, from);
        commit();
        break;
      }
      case 'saveNamed': {
        const name = (setup.label || '').trim();
        if (!name) { ui.message = 'Enter a setup name first'; render(); break; }
        try { store.setItem(combatLoadoutKey(ci(), name), JSON.stringify(setup)); ui.message = 'Saved "' + name + '" for this character'; onChange(); } catch (err) { ui.message = 'Save failed: ' + err.message; }
        render();
        break;
      }
      case 'deleteNamed': {
        const sel = view.querySelector('[data-act="loadNamed"]');
        try {
          const entry = readCombatLoadouts(store, ci()).find(n => sel && sel.value ? n.key === sel.value : n.name === (setup.label || '').trim());
          if (entry && store) {
            store.removeItem(entry.key);
            const legacyKey = 'combat-sim-setup:' + entry.name;
            const legacy = store.getItem(legacyKey);
            if (legacy && Number(JSON.parse(legacy).charIdx) === ci()) store.removeItem(legacyKey);
            ui.message = 'Deleted "' + entry.name + '"'; onChange();
          } else ui.message = 'Select a saved loadout (or type its name) to delete';
        } catch (err) { ui.message = 'Delete failed: ' + err.message; }
        render();
        break;
      }
      case 'export': ui.io = 'export'; render(); break;
      case 'import': ui.io = 'import'; render(); break;
      case 'closeIo': ui.io = null; render(); break;
      case 'doImport': {
        const ta = view.querySelector('#css-setup-io');
        try {
          const parsed = JSON.parse(ta.value);
          if (!parsed || !Array.isArray(parsed.patches)) throw new Error('expected { version, charIdx, label, patches: [...] }');
          setup = CS.normalizeCombatSetup(parsed);
          setup.patches = setup.patches.map(p => (CS.PATCH_SYSTEMS.indexOf(p.system) >= 0 && p.ci === parsed.charIdx) ? strip(p) : p);
          ui.io = null;
          ui.message = 'Imported ' + setup.patches.length + ' patch(es)';
          commit();
        } catch (err) { ui.message = 'Import failed: ' + err.message; render(); }
        break;
      }
      case 'rawCurrent': {
        const key = view.querySelector('#css-setup-raw-key').value.trim().replace(/\{ci\}/g, String(ci()));
        const path = view.querySelector('#css-setup-raw-path').value.trim();
        let v = raw ? CS.readRawKey(compute().patched, key) : undefined;
        if (path) path.split('.').forEach(seg => { v = v == null ? undefined : v[seg]; });
        const s = v === undefined ? '(missing)' : JSON.stringify(v);
        ui.rawPreview = s.length > 400 ? s.slice(0, 397) + '...' : s;
        const vk = view.querySelector('#css-setup-raw-key').value, vp = view.querySelector('#css-setup-raw-path').value;
        render();
        view.querySelector('#css-setup-raw-key').value = vk;
        view.querySelector('#css-setup-raw-path').value = vp;
        if (v !== undefined && (v === null || typeof v !== 'object')) view.querySelector('#css-setup-raw-val').value = JSON.stringify(v);
        break;
      }
      case 'rawAdd': {
        const key = view.querySelector('#css-setup-raw-key').value.trim();
        const path = view.querySelector('#css-setup-raw-path').value.trim();
        const txt = view.querySelector('#css-setup-raw-val').value;
        if (!key) { ui.message = 'Raw patch needs a key'; render(); break; }
        let value;
        try { value = JSON.parse(txt); } catch (err) { value = txt; }
        ui.rawPreview = null;
        upsert({ system: 'raw', key, path: path ? path.split('.') : [], value });
        break;
      }
      default: break;
    }
  }

  // ----- pickers ------------------------------------------------------------
  const pickCache = {};
  function cached(k, fn) { return pickCache[k] || (pickCache[k] = fn()); }
  function setAttacks(list) {
    const c = compute();
    list.forEach(([row, slot, talent]) => {
      const brow = c.base.attackLoadout[row] || [];
      const b = brow.find(x => x.slot === slot);
      const bid = b && b.id != null && b.id !== 'Null' ? Number(b.id) : 'Null';
      const tid = talent == null || talent === 'Null' || talent === '' ? 'Null' : Number(talent);
      const p = { system: 'attackLoadout', row, slot };
      if (String(bid) === String(tid)) setup = CS.removePatch(setup, CS.patchKey(strip(p), ci()));
      else setup = CS.upsertPatch(setup, strip(Object.assign(p, { talent: tid })));
    });
    commit();
  }
  function attackId(c, row, slot) {
    const a = (c.state.attackLoadout[row] || []).find(x => x.slot === slot);
    return !a || a.id == null || a.id === 'Null' || a.id === '' ? 'Null' : Number(a.id);
  }
  function talentItems() {
    return cached('talents', () => CS.talentOptions().map(o => ({ key: o.id, name: gameText(o.name), icon: iconHtml('talents', o.id, o.name, { size: 32 }), sub: '#' + o.id, search: o.name + ' ' + o.id })));
  }
  function talentPickTip(c) {
    const ts = talentState(c);
    return it => talentTip(Number(it.key), ts.cur.get(Number(it.key)) || { name: it.name, level: 0, max: 0 }, ts.base.get(Number(it.key)));
  }
  function openPick(kind, el) {
    const c = compute();
    if (!c.patched) return;
    const A = n => el.getAttribute(n);
    const slot = Number(A('data-slot')), row = Number(A('data-row'));
    const classId = c.state.character.classId;
    let cfg = null;
    switch (kind) {
      case 'gear': {
        const r = slotOf(equipRows(c, row), slot);
        if (!r) return;
        ui.gearSel = { row, slot };
        const base = cached('gear-' + row + '-' + (row === 0 ? slot : 't' + slot), () => CS.itemOptionsForSlot(row, slot).map(o => Object.assign(itemEntry(o.key, o.name), { cat: 'base' })));
        const fits = new Set(base.map(it => it.key));
        cfg = { title: 'Equip \u2014 ' + gameText(r.slotName), wide: true, current: r.item, emptyLabel: '(empty slot)',
          items: instanceEntries(ci(), fits).concat(base),
          categories: [{ id: 'mine', label: 'This inventory' }, { id: 'storage', label: 'Storage' }, { id: 'others', label: 'Other characters' }, { id: 'base', label: 'Base items' }],
          toggles: itemToggles(c, { cls: true, lv: true }), tipFor: it => itemCardHtml(it.item || it.key, it.inst ? { added: it.inst.stats || {} } : undefined),
          onPick: (key, it) => {
            const b = slotOf(baseEquipRows(compute(), row), slot);
            if (it && it.inst) {
              const stats = Object.assign({}, it.inst.stats || {});
              if (b && b.item === it.inst.key && sameStats(b.stats, stats)) remove({ system: 'equipment', row, slot });
              else upsert({ system: 'equipment', row, slot, item: it.inst.key, stats });
              return;
            }
            const k = key == null ? 'Blank' : key;
            if (b && b.item === k) remove({ system: 'equipment', row, slot });
            else upsert({ system: 'equipment', row, slot, item: k });
          } };
        break;
      }
      case 'food': {
        ui.foodSel = slot;
        const r = c.state.equipment.food[slot] || {};
        cfg = { title: 'Food slot ' + (slot + 1), wide: true, current: r.item, emptyLabel: '(empty)',
          items: cached('food', () => CS.itemOptionsForSlot(2, 0).map(o => Object.assign(itemEntry(o.key, o.name), { cat: /^FoodG/.test(o.key) ? 'gold' : 'food' }))),
          categories: [{ id: 'food', label: 'Food' }, { id: 'gold', label: 'Golden food' }], toggles: itemToggles(c, {}), tipFor: it => itemCardHtml(it.key),
          onPick: key => {
            const p = { system: 'food', slot };
            const k = key == null ? 'Blank' : key;
            const b = compute().base.equipment.food[slot];
            if (b && b.item === k && !findPatch(p)?.qty) { remove(p); return; }
            upsert(Object.assign({}, findPatch(p) || {}, p, { item: k }));
          } };
        break;
      }
      case 'obol': {
        const scope = A('data-scope') === 'family' ? 'family' : 'personal';
        const shape = Number(A('data-shape'));
        const tg = V.OBOL_TYPEGEN[shape];
        ui.obolSel = { scope, slot };
        const r = (c.state.obols[scope] || []).find(x => x.slot === slot) || {};
        cfg = { title: (V.OBOL_SHAPES[shape] || '') + ' obol slot ' + (slot + 1), wide: true, current: r.item, emptyLabel: '(empty)',
          items: cached('obol', () => CS.itemOptionsForSlot('obol', 0).map(o => itemEntry(o.key, o.name))),
          toggles: [{ id: 'fit', label: 'Fits this ' + (V.OBOL_SHAPES[shape] || '') + ' slot', checked: !!tg, test: it => !tg || it.typeGen === tg }].concat(itemToggles(c, {})),
          tipFor: it => itemCardHtml(it.key),
          onPick: key => {
            const k = key == null ? 'Blank' : key;
            const b = (compute().base.obols[scope] || []).find(x => x.slot === slot);
            if (b && b.item === k) remove({ system: 'obol', scope, slot });
            else upsert({ system: 'obol', scope, slot, item: k });
          } };
        break;
      }
      case 'card': {
        const r = c.state.cards.equipped.find(x => x.slot === slot) || {};
        cfg = { title: 'Card slot ' + (slot + 1), wide: true, current: r.key, emptyLabel: '(empty)',
          items: cached('cards', () => CS.cardOptions().map(o => ({ key: o.key, name: gameText(o.name), icon: cardArt(o.key, o.name, 28, 36), sub: gameText(o.bonus || ''), cat: String(o.set), search: o.name + ' ' + o.key + ' ' + (o.bonus || '') }))),
          categories: cached('cardCats', () => { const seen = new Set(); return CS.cardSetOptions().filter(s => s.set >= 0 && !seen.has(String(s.set)) && seen.add(String(s.set))).map(s => ({ id: String(s.set), label: gameText(s.name).replace(/ Set$/i, '') })); }),
          tipFor: it => cardTip(it.key, it.name),
          onPick: key => {
            const k = key == null ? 'B' : key;
            const b = compute().base.cards.equipped.find(x => x.slot === slot);
            if (b && b.key === k) remove({ system: 'card', slot }); else upsert({ system: 'card', slot, key: k });
          } };
        break;
      }
      case 'cardSet': {
        cfg = { title: 'Card set bonus', current: c.state.cards.set ? c.state.cards.set.set : null, emptyLabel: '(no set)',
          items: CS.cardSetOptions().filter(s => s.set >= 0).map(s => ({ key: s.set, name: gameText(s.name), icon: cardSetIcon(s.set, 32), sub: s.mult != null ? '\u00d7' + s.mult + ' per card level' : '' })),
          onPick: key => upsert({ system: 'cardSet', set: key == null ? -1 : Number(key) }) };
        break;
      }
      case 'talentFind': {
        const mine = V.classTalentIds(classId, true);
        cfg = { title: 'Find talent', wide: true, items: talentItems(), tipFor: talentPickTip(c),
          toggles: [{ id: 'cls', label: 'My class book', checked: false, test: it => mine.has(Number(it.key)) }],
          onPick: key => {
            if (key == null) return;
            const id = Number(key);
            ui.talSel = id;
            const pg = V.talentPageOf(classId, id);
            if (pg) ui.talPage = pg;
            else ui.expanded['tal-others'] = true;
            render();
          } };
        break;
      }
      case 'attack': {
        const mine = V.classTalentIds(classId, true);
        cfg = { title: 'Attack bar ' + (row + 1) + ' \u2014 slot ' + (slot + 1), wide: true, current: attackId(c, row, slot), emptyLabel: '(empty)',
          items: cached('attacks', () => talentItems().filter(it => V.isAttackTalent(Number(it.key)))),
          toggles: [{ id: 'cls', label: 'My class', checked: true, test: it => mine.has(Number(it.key)) }], tipFor: talentPickTip(c),
          onPick: key => setAttacks([[row, slot, key == null ? 'Null' : Number(key)]]) };
        break;
      }
      case 'sign': {
        const r = c.state.starSigns[slot];
        cfg = { title: 'Star sign slot ' + (slot + 1), wide: true, current: r ? r.id : null, emptyLabel: '(empty)',
          items: cached('signs', () => CS.starSignOptions().filter(o => o.id !== '_').map(o => ({ key: o.id, name: gameText(o.name), icon: '<span class="css-setup-signstar">\u2605</span>', search: o.name + ' ' + o.id }))),
          tipFor: it => signTip(it.key),
          onPick: key => {
            const cc = compute();
            const ids = cc.state.starSigns.map(x => x.id);
            while (ids.length <= slot) ids.push('_');
            const dupS = key == null ? -1 : ids.indexOf(key);
            if (dupS >= 0 && dupS !== slot) ids[dupS] = ids[slot];
            ids[slot] = key == null ? '_' : key;
            while (ids.length > 1 && ids[ids.length - 1] === '_' && ids.length > cc.base.starSigns.length) ids.pop();
            const bids = cc.base.starSigns.map(x => x.id);
            if (JSON.stringify(ids) === JSON.stringify(bids)) remove({ system: 'starSigns' }); else upsert({ system: 'starSigns', ids });
          } };
        break;
      }
      case 'prayer': {
        const r = c.state.prayers[slot];
        cfg = { title: 'Prayer slot ' + (slot + 1), current: r ? r.id : null, emptyLabel: '(empty)',
          items: cached('prayers', () => CS.prayerOptions().filter(o => o.id >= 0).map(o => ({ key: o.id, name: gameText(o.name), icon: iconHtml('prayers', o.id, o.name, { size: 32 }) }))),
          tipFor: it => prayerTip(Number(it.key)),
          onPick: key => {
            const cc = compute();
            const ids = cc.state.prayers.map(x => x.id);
            while (ids.length <= slot) ids.push(-1);
            const dupP = key == null ? -1 : ids.indexOf(Number(key));
            if (dupP >= 0 && dupP !== slot) ids[dupP] = ids[slot];
            ids[slot] = key == null ? -1 : Number(key);
            if (JSON.stringify(ids) === JSON.stringify(cc.base.prayers.map(x => x.id))) remove({ system: 'prayers' }); else upsert({ system: 'prayers', ids });
          } };
        break;
      }
      case 'bubble': {
        const r = c.state.bubbles[slot];
        cfg = { title: 'Equipped bubble ' + (slot + 1), wide: true, current: r ? r.code : null, emptyLabel: '(empty)',
          items: cached('bubbles', () => CS.bubbleOptions().filter(o => o.code && o.code !== '0').map(o => ({ key: o.code, name: gameText(o.name), icon: iconHtml('bubbles', o.code, o.name, { size: 32 }), cat: String(o.code).charAt(0), sub: o.code }))),
          categories: BUBBLE_CATS,
          onPick: key => {
            const cc = compute();
            const codes = cc.state.bubbles.map(x => x.code);
            const dupB = key == null ? -1 : codes.indexOf(key);
            if (dupB >= 0 && dupB !== slot) codes[dupB] = codes[slot] == null ? 0 : codes[slot];
            codes[slot] = key == null ? 0 : key;
            if (JSON.stringify(codes) === JSON.stringify(cc.base.bubbles.map(x => x.code))) remove({ system: 'bubbles' }); else upsert({ system: 'bubbles', codes });
          } };
        break;
      }
      case 'chip': {
        const r = c.state.lab.chips[slot];
        cfg = { title: 'Lab chip slot ' + (slot + 1), wide: true, current: r ? r.id : null, emptyLabel: '(empty)',
          items: cached('chips', () => CS.chipOptions().filter(o => o.id >= 0).map(o => ({ key: o.id, name: gameText(o.name), icon: iconHtml('chips', o.id, o.name, { size: 32 }) }))),
          tipFor: it => chipTip(Number(it.key)),
          onPick: key => {
            const id = key == null ? -1 : Number(key);
            const b = compute().base.lab.chips[slot];
            if ((b ? b.id : -1) === id) remove({ system: 'labChip', slot }); else upsert({ system: 'labChip', slot, chip: id });
          } };
        break;
      }
      case 'god': {
        cfg = { title: 'Linked god', current: c.state.divinity.god,
          items: CS.godOptions().map(g => ({ key: g.id, name: gameText(g.name), icon: iconHtml('gods', g.id >= 0 ? g.id : null, g.name, { size: 32 }) })),
          onPick: key => {
            const id = key == null ? -1 : Number(key);
            if (compute().base.divinity.god === id) remove({ system: 'divinity', god: 0 }); else upsert({ system: 'divinity', god: id });
          } };
        break;
      }
      case 'charClass': {
        const classes = [];
        for (let i = 0; i < 60; i++) { const n = CS.className(i); if (!/^Class /.test(n)) classes.push({ key: i, name: gameText(n), sub: '#' + i }); }
        cfg = { title: 'Character class', current: classId, items: classes,
          onPick: key => { if (key == null) return; if (compute().base.character.classId === Number(key)) remove({ system: 'charClass' }); else upsert({ system: 'charClass', value: Number(key) }); } };
        break;
      }
      case 'filterAdd': case 'filterItem': {
        cfg = { title: kind === 'filterAdd' ? 'Filter an item' : 'Filter slot ' + (slot + 1), wide: true, emptyLabel: kind === 'filterItem' ? '(empty)' : null,
          current: kind === 'filterItem' ? c.state.printerFilter.items[slot] : null, limit: 300,
          items: cached('allItems', () => CS.itemOptionsForSlot('any').filter(o => !/^(Blank|null|Null|LockedInvSpace)$/.test(o.key)).map(o => itemEntry(o.key, o.name))), toggles: itemToggles(c, {}), tipFor: it => itemCardHtml(it.key),
          onPick: key => {
            const cc = compute();
            const f = cc.state.printerFilter;
            if (kind === 'filterItem') {
              const k = key == null ? 'Blank' : key;
              if (cc.base.printerFilter.items[slot] === k) remove({ system: 'printerFilter', slot }); else upsert({ system: 'printerFilter', slot, item: k });
              return;
            }
            if (key == null) return;
            if (f.items.slice(0, f.slots).indexOf(key) >= 0) { ui.message = CS.itemName(key) + ' is already filtered'; render(); return; }
            const s = f.items.slice(0, f.slots).indexOf('Blank');
            if (s < 0) { ui.message = 'All ' + f.slots + ' active filter slots are full'; render(); return; }
            ui.message = 'Filtered ' + CS.itemName(key);
            upsert({ system: 'printerFilter', slot: s, item: key });
          } };
        break;
      }
      case 'uq': {
        const n = Number(A('data-n'));
        const sel = ui.gearSel || { row: 0, slot: 1 };
        const g = gearInstance(c, sel.row, sel.slot);
        const cur = g.extra['UQ' + n + 'txt'];
        cfg = { title: 'Unique bonus ' + n + ' text', wide: true, current: cur, emptyLabel: '(no bonus)',
          items: cached('uqTexts', () => {
            const seen = new Set();
            Object.values(ITEMS).forEach(d => { ['UQ1txt', 'UQ2txt'].forEach(k => { const t = d && d[k]; if (t && t !== '0' && t !== 'Blank' && typeof t === 'string') seen.add(t); }); });
            return Array.from(seen).sort().map(t => ({ key: t, name: ST.formatUq(t, 1).replace(/^\+1/, '+#'), search: t }));
          }),
          onPick: key => gearEdit(sel.row, sel.slot, extra => { if (key == null) delete extra['UQ' + n + 'txt']; else extra['UQ' + n + 'txt'] = key; }) };
        break;
      }
      case 'stoneAdd': {
        const sel = ui.gearSel || { row: 0, slot: 1 };
        const g = gearInstance(c, sel.row, sel.slot);
        if (!g.item || g.item === 'Blank') return;
        const res = ST.applyStones(g.item, g.extra, g.stones, { classId });
        const attr = ui.stoneMode === 'attr';
        cfg = { title: attr ? 'Attribute added stats to a stone' : 'Apply a stone', wide: true,
          items: ST.STONES.map(s => {
            const el2 = ST.stoneEligible(g.item, res.stats, s.key);
            const slotsOk = Math.round(n0((ITEMS[g.item] || {}).Upgrade_Slots_Left) + n0(res.stats.Upgrade_Slots_Left) - s.trigger) >= 0;
            const reason = !el2.ok ? el2.reason : (!attr && !slotsOk ? 'No upgrade slots left' : '');
            return { key: s.key, name: gameText(s.name), icon: iconHtml('items', s.key, s.name, { size: 32 }), disabled: !!reason, fits: el2.ok,
              sub: reason || (fmt(s.amount) + '% \u00b7 ' + s.trigger + ' slot' + (s.trigger === 1 ? '' : 's')), search: s.name + ' ' + s.key };
          }),
          toggles: [{ id: 'fit', label: 'Fits this item', checked: true, test: it => it.fits }],
          tipFor: it => stoneTip(ST.stoneByKey(it.key)),
          onPick: key => {
            if (key == null) return;
            if (attr) {
              const r = ST.attributeStone(g.extra, g.item, { key }, { classId });
              if (!r.ok) { ui.message = r.reason; render(); return; }
              gearEdit(sel.row, sel.slot, (extra, stones) => { Object.keys(extra).forEach(k => delete extra[k]); Object.assign(extra, r.extra); stones.push({ key }); });
            } else gearEdit(sel.row, sel.slot, (extra, stones) => { stones.push({ key }); });
          } };
        break;
      }
      default: return;
    }
    if (cfg) openPicker(el, cfg);
  }

  let lastRt = null;
  let dragSrc = null;
  function handleOver(e) {
    const rtEl = e.target.closest ? e.target.closest('[data-rt]') : null;
    if (rtEl && root.contains(rtEl)) {
      tip.style.display = 'none';
      if (lastRt === rtEl) return;
      lastRt = rtEl;
      const fn = rtips[Number(rtEl.getAttribute('data-rt'))];
      let html = '';
      try { html = fn ? fn() : ''; } catch (err) { console.error(err); }
      if (html) showTip(rtEl, html); else hideTip();
      return;
    }
    if (lastRt) { lastRt = null; hideTip(); }
    const t = e.target.closest ? e.target.closest('[data-tip]') : null;
    if (!t || !root.contains(t)) { tip.style.display = 'none'; return; }
    tip.textContent = t.getAttribute('data-tip');
    tip.style.display = 'block';
    const r = t.getBoundingClientRect();
    const w = tip.offsetWidth, hgt = tip.offsetHeight;
    let x = r.right + 8, y = r.top - 4;
    if (x + w > window.innerWidth - 8) x = Math.max(8, r.left - w - 8);
    if (y + hgt > window.innerHeight - 8) y = Math.max(8, window.innerHeight - hgt - 8);
    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
  }

  root.addEventListener('change', handleChange);
  root.addEventListener('input', handleInput);
  root.addEventListener('click', handleClick);
  root.addEventListener('mouseover', handleOver);
  root.addEventListener('mouseleave', () => { tip.style.display = 'none'; lastRt = null; hideTip(); });
  function clearDrop() { root.querySelectorAll('.css-setup-drop').forEach(n => n.classList.remove('css-setup-drop')); }
  root.addEventListener('dragstart', e => {
    const a = e.target.closest ? e.target.closest('[data-drag],[data-dragtal]') : null;
    if (!a || !root.contains(a)) return;
    dragSrc = a.hasAttribute('data-drag') ? 'atk:' + a.getAttribute('data-drag') : 'tal:' + a.getAttribute('data-dragtal');
    try { e.dataTransfer.setData('text/plain', dragSrc); e.dataTransfer.effectAllowed = 'copyMove'; } catch (err) { /* ignore */ }
    lastRt = null; hideTip();
  });
  root.addEventListener('dragover', e => {
    const t = e.target.closest ? e.target.closest('[data-drag]') : null;
    if (!t || !dragSrc) return;
    e.preventDefault();
    if (!t.classList.contains('css-setup-drop')) { clearDrop(); t.classList.add('css-setup-drop'); }
  });
  root.addEventListener('dragleave', e => { const t = e.target.closest ? e.target.closest('[data-drag]') : null; if (t && !t.contains(e.relatedTarget)) t.classList.remove('css-setup-drop'); });
  root.addEventListener('dragend', () => { dragSrc = null; clearDrop(); });
  root.addEventListener('drop', e => {
    const t = e.target.closest ? e.target.closest('[data-drag]') : null;
    let src = dragSrc;
    try { src = e.dataTransfer.getData('text/plain') || src; } catch (err) { /* ignore */ }
    dragSrc = null; clearDrop();
    if (!t || !src) return;
    e.preventDefault();
    const [r, s] = t.getAttribute('data-drag').split(':').map(Number);
    const c = compute();
    if (src.startsWith('tal:')) setAttacks([[r, s, Number(src.slice(4))]]);
    else if (src.startsWith('atk:')) {
      const [r0, s0] = src.slice(4).split(':').map(Number);
      if (r0 === r && s0 === s) return;
      setAttacks([[r, s, attackId(c, r0, s0)], [r0, s0, attackId(c, r, s)]]);
    }
  });

  render();

  return {
    apply(raw) {
      if (!raw) return raw;
      switchCharacter();
      if (!setup.patches.length) return raw;
      return CS.applyCombatSetup(raw, setup);
    },
    current() { switchCharacter(); return JSON.parse(JSON.stringify(setup)); },
    summary() {
      const raw = getRaw();
      if (!raw) return { changed: 0, lines: [] };
      const d = compute().diff;
      return { changed: d.changed, lines: d.lines.slice() };
    },
    reset() { setup = CS.emptyCombatSetup(ci(), ''); commit(); },
    /** Replace the editor setup (e.g. a Setup search result) and persist it. */
    load(next) { setup = CS.normalizeCombatSetup(JSON.parse(JSON.stringify(next || {}))); setup.charIdx = ci(); cache.raw = null; commit(); },
    /** Re-render only when the derived-values view is showing (host calls after applying edits). */
    derivedChanged() { const s = curAcct(); if (root.isConnected && ui.tab === 'acct' && s && s.view === 'derived') render(); },
    refresh() {
      switchCharacter();
      cache.raw = null;
      if (Number(ui.copyFrom) === ci()) ui.copyFrom = ci() === 0 ? 1 : 0;
      render();
    },
  };
}
