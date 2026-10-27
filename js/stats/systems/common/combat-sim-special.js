// ===== ACTIVE COMBAT SIMULATOR — SPECIAL KILL MECHANICS =====
// Class/mode-specific kill-path mechanics of active combat, ported literally
// from src/N.new.formatted.js in source RNG order. Installed by initSpecial()
// as `sim.special`, whose hooks are called from fixed source positions:
//   * formDrops(sim, mon)       — runLater(250) drop branch (AE1, src 63689-63705):
//       Death Bringer Wraith bones (+Quest98), Wind Walker Tempest dust
//       (+Quest100), Nova dust, Tempest bows/rings/stones/medallions, and
//       Arcane Cultist Arcanist tachyons (+Quest107), Arc0 wands and rings.
//   * orbletDrops(sim, ctx)     — Royal Guardian Orb of Verisimilitude fade
//       (src 89223-89227): MultiArrow roll and floor(GenINFO[77]/1e3) Orblets.
//   * monsterKillPre(sim, mon)  — MonsterKill (src 67155-67168): Rift map 166
//       task progress, Quest74 roll and skull-status chain, cavern map 216
//       Monarch/Centurion golem kills (opals, Holes[11][26]/[55]).
//   * dungeonPickup(sim, item)  — ItemPickupInTheFirstPlace DUNGEON_EVAPORATE
//       branch (src 82463, DungeonPickup 82542-82547): bones, dust, tachyons,
//       medallions, Prisma bubbles, Clamworks pearls (ClamPearl10x RNG), temple
//       torches, Glunko shapes (Cglunko_DoublePickup RNG) and misc counters.
//   * spawnCaveGolem(sim, type) — Monarch (src 96058) / Centurion (src 96029)
//       golem creation with MonarchHP / 250 x DamageDealed("Max") (src 67146).
//   * Clamworks scene (map 306, src 158576-158590): ClamPearl1 row push, 1 s
//       pearl-rate rewrite and Clamz_HP MonsterHPTotal rewrite.
// The simulator always models the LIVE (active) branch. The AFK claim
// (src 71054) runs only killmonsterQuest per AFK kill; none of the drops,
// golems, opals, Orblets, rift skulls or evaporate pickups exist offline.
// saveData is never mutated: OptionsListAccount / Holes entries that are not
// already mirrored in sim.state are copied into sim.state.special on first use.

import { RiftStuff, RandoListo2, Spelunky, RANDOlist, HolesInfo } from '../../data/game/customlists.js';
import { ITEMS } from '../../data/game/items.js';
import * as D from '../../../save/data.js';
import { holesBolaiaPerLv } from '../../data/w5/hole.js';
import { computeBUpg } from '../w5/hole.js';
import { rogBonusQTY, computeUniqueSushi } from '../w7/sushi.js';
import { talent } from './talent.js';
import {
  dropSomething, overkillState, boneType, boneQtyBase, dustType, dustQtyBase, tachyonType, tachyonQtyBase,
  tempestAllDropBonus, tempestWepDrop, tempestRingDrop,
} from './combat-sim-rewards.js';
import { grimoireBonesDropDEC, windwalkerExtraDust, arcaneExtraTachyon } from './combat-forms.js';
import { getDef, monsters, addStatusToMonster, createMonster } from './combat-sim-world.js';

const N = (x) => Number(x) || 0;
const _num = (x) => (x && typeof x === 'object' ? N(x.val) : N(x));
const _clone = (v) => JSON.parse(JSON.stringify(v));

// Live-vs-AFK differences surfaced in summary.special.state.afkNotes.
export const LIVE_VS_AFK = [
  'AFK claim (src 71054) calls only killmonsterQuest(AFKtarget, kills): Holes[11][27]/[28] (caveB), [63] (caveC) and OptionsListAccount[668] (caveD) still accrue offline.',
  'Wraith bones, Tempest dust/equipment/stones/medallions, Arcanist tachyons/wands/rings (src 63689-63705) roll only in the live drop branch; offline Master Class currencies come from the separate AFK gain formulas.',
  'Monarch/Centurion golems (src 96029/96058) are spawned from cavern menus and only killable live; their opals and Holes[11][26]/[55] ranks never come from AFK.',
  'caveA-caveD are NonAFK/AFK-excluded targets (src 121804); The Cove (cavern 18, caveD) AFK uses Cglunko_AFKgains (src 66942) instead of HoleGshape drops, which require the live DungeonPickup (src 82547) with Cglunko_DoublePickup.',
  'Orblets (src 89223) need a live Orb of Verisimilitude cast; Rift skull chains (src 67155-67166), Clamworks pearl pickups (src 82547) and Quest94 torches exist only live.',
];

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------
// RiftStuff("Task") (src 91485): RiftStuff[4][Rift[0] mod 100].
export function riftTask(rift0) {
  const r = N(rift0);
  return N(RiftStuff[4]?.[(r - 100 * Math.floor(r / 100)) | 0]);
}
// Thingies("ClamBonuses", t, i) (src 91994). `ola(k)` reads OptionsListAccount;
// i == 1 selects Scurge upgrade t: Spelunky[28][t + 9] * Menagerie[5][t].
export function clamBonus(t, ola, multiKillTotal = 0, scurge = 0, menagerie = null) {
  if (scurge === 1) return N(Spelunky[28]?.[Math.round(t + 9)]) * N(menagerie?.[5]?.[t | 0]);
  if (t === 999) return 1;
  if (t === 3) return N(multiKillTotal) / 1e3 * N(Spelunky[28]?.[t | 0]) * N(ola(Math.round(t + 455)));
  return N(Spelunky[28]?.[t | 0]) * N(ola(Math.round(t + 455)));
}
// Thingies("ClamPearlValue") (src 91995). `menagerie` is the saved Menagerie array;
// Scurge 1 and Scurge 8 × Scurge level (Menagerie[0][8]) are separate multipliers.
export function clamPearlValue(ola, multiKillTotal = 0, menagerie = null) {
  return (1 + clamBonus(0, ola, multiKillTotal)) * (1 + clamBonus(3, ola, multiKillTotal) / 100) * (1 + clamBonus(7, ola, multiKillTotal) / 100)
    * (1 + clamBonus(1, ola, 0, 1, menagerie) / 100)
    * (1 + clamBonus(8, ola, 0, 1, menagerie) * N(menagerie?.[0]?.[8]) / 100);
}
// Thingies("Clam_BlackPearlValue") (src 91997).
export function clamBlackPearlValue(ola) { return 50 + clamBonus(5, ola); }
// Thingies("Clamz_HP") (src 92003).
export function clamHp(ola464) { return 1e16 * Math.pow(30, N(ola464)); }
// Pearl drop rates written each second by the Clamworks scene (src 158582).
export function clamPearlRates(ola) {
  const a = 1 + clamBonus(6, ola) / 100;
  const p = Math.pow(0.66, N(ola(464)));
  return { ClamPearl0: '' + 0.005 * a * p, ClamPearl1: '' + 25e-6 * a * p };
}
// OrbletMultiDrop (src 92964) = GetTalentNumber(1,234) + RoG_BonusQTY(59).
export function orbletMultiDrop(talent234, uniqueSushi) {
  return N(talent234) + rogBonusQTY(59, N(uniqueSushi));
}
// Holes("TempleExtraTorches") (src 92281) = BellBonuss(5) + StudyBolaia(14) + B_UPG(77,25).
export function templeExtraTorches(S) {
  const H = S?.holesData || [];
  const bell = N(H[17]?.[5]) * N(HolesInfo[59]?.[Math.round(2 * 5 + 1)]); // BellBonuss src 92196
  const bolaia = N(H[26]?.[14]) * holesBolaiaPerLv(14); // StudyBolaiaBonuses default branch src 92283
  return bell + (bolaia + computeBUpg(77, 25, S));
}
// Holes("Cglunko_DoublePickup") (src 92316).
export function cglunkoDoublePickup(S) {
  return Math.min((computeBUpg(101, 10, S) + (computeBUpg(103, 10, S) + computeBUpg(105, 10, S))) / 100, 3);
}
// Holes("Cglunko_upgBon", t) (src 92316).
export function cglunkoUpgBon(t, ola) {
  return N(ola(Math.round(630 + t))) * N(RandoListo2[13]?.[t | 0]);
}
// Holes("MonarchHP") (src 92219).
export function monarchHp(h11_26) { return 1e11 * Math.pow(7.5, N(h11_26)); }

// The Den (cavern 2): Holes("AmpDebuff", t) over Holes[12] amplifier levels.
export function ampDebuff(H12, t) {
  const h = N(H12?.[t | 0]);
  switch (t | 0) {
    case 0: return (5e3 + 800 * h) * Math.pow(1.25, h);
    case 1: return (6e3 + 4e3 * h) * Math.pow(1.3, h);
    case 2: return 5 * h;
    case 3: return (1 + h) * Math.pow(1.05, h);
    case 4: return (1 + h) * Math.pow(1.07, h);
    case 5: return 1 + h;
    case 6: return 4 * h;
    case 7: return h / 10;
    default: return 0;
  }
}
// Holes("AmpMulti"): B_UPG(23,1) bonus per 10 total amp levels plus per-amp %.
export function ampMulti(H12, bUpg23) {
  const h = (i) => N(H12?.[i]);
  let amptot = 0;
  for (let i = 0; i < 8; i++) amptot += h(i);
  return 0.5 * N(bUpg23) * Math.floor(amptot / 10)
    + (11 * h(0) + (9 * h(1) + (8 * h(2) + (10 * h(3) + (8 * h(4) + (7 * h(5) + (10 * h(6) + 7 * h(7)))))))) / 100 + 1;
}
// Holes("HoundNextOpalScoreReq") with h = Holes[7][2].
export function houndNextOpalScoreReq(h) {
  const x = N(h);
  return 12 * (150 + (30 + x) * x) * Math.pow(1.5, x);
}
export const DEN_FEAR_MAX = 50;

function _cbv(v, i) { return N(v.compass?.[i]); }
// Windwalker("TempestWeaponXtraPowerChance", w) (src 92375).
function _tempestXtraPower(v, w) {
  return w === 0 ? 0 : w === 1 ? _cbv(v, 117) : w === 2 ? _cbv(v, 109) : w === 3 ? _cbv(v, 114) : _cbv(v, 108);
}

// ---------------------------------------------------------------------------
// State helpers
// ---------------------------------------------------------------------------
function _sp(sim) { return sim.state.special; }
function _unmodelled(sim, key, detail) {
  if (sim.world && typeof sim.world.unmodelled === 'function') return sim.world.unmodelled(sim, key, detail);
  const u = sim.state.unmodelled || (sim.state.unmodelled = {});
  u[key] = (u[key] || 0) + 1;
  sim.emit('unmodelled', { key, detail, t: sim.timeMs });
}
// OptionsListAccount[k]: sim.state.ola when rewards mirrors the key, else a
// private copy seeded from the save on first use (Cglunko levels OLA[630..653]
// come from input coveUpgrades so configured levels reach the shape pickups).
function _ola(sim, k) {
  const so = sim.state.ola;
  if (so && Object.prototype.hasOwnProperty.call(so, k)) return so[k];
  const m = _sp(sim).ola;
  if (!Object.prototype.hasOwnProperty.call(m, k)) {
    const cove = sim.inputs?.values?.coveUpgrades;
    m[k] = Array.isArray(cove) && k >= 630 && k - 630 < cove.length ? N(cove[k - 630])
      : (sim.saveData?.optionsListData || D.optionsListData)?.[k] ?? 0;
  }
  return m[k];
}
function _olaSet(sim, k, val) {
  _sp(sim).olaTouched[k] = 1;
  const so = sim.state.ola;
  if (so && Object.prototype.hasOwnProperty.call(so, k)) so[k] = val;
  else _sp(sim).ola[k] = val;
}
function _holes(sim, row, k) {
  const m = _sp(sim).holes[row] || (_sp(sim).holes[row] = {});
  if (!Object.prototype.hasOwnProperty.call(m, k)) m[k] = sim.saveData?.holesData?.[row]?.[k] ?? 0;
  return m[k];
}
function _holesSet(sim, row, k, val) { (_sp(sim).holes[row] || (_sp(sim).holes[row] = {}))[k] = val; }
function _buff(sim, id) { return N(sim.buffs?.[id]); }
function _add(obj, key, n) { obj[key] = N(obj[key]) + n; }

function _talent1(sim, id) {
  const ov = sim.options?.special?.['talent' + id];
  if (ov != null) return N(ov);
  const v = sim.inputs.values;
  const t = v.talentN?.[1]?.[id];
  if (t !== undefined) return N(t);
  if (v['talent' + id + '_1'] !== undefined) return N(v['talent' + id + '_1']);
  try { return _num(talent.resolve(id, { saveData: sim.saveData, charIdx: sim.charIdx }, { tab: 1 })); } catch { return 0; }
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
export function initSpecial(sim) {
  const opts = sim.options?.special || {};
  const map = sim.scene.map;
  const S = sim.saveData || {};
  const rift0 = opts.rift0 ?? S.riftData?.[0] ?? 0;
  sim.state.special = {
    ola: {}, olaTouched: {}, holes: {},
    compass3: _clone(sim.inputs.values.compass3 || []),
    cavern: N(opts.cavern ?? sim.inputs.values.holeCavern ?? S.holesData?.[0]?.[sim.charIdx] ?? -1),
    rift: map === 166 ? { rift0: N(rift0), task: riftTask(rift0), progress: {} } : null,
    golem: { lock: 0, active: null }, // PixelHelperActor[25] GenINFO[118]
    clam: map === 306 ? { hpTotal: 0, rates: null } : null,
    orbletMultiDrop: null,
    c: {
      bonesDropped: {}, dustDropped: {}, tachyonsDropped: {},
      tempestEquipment: 0, tempestStones: 0, medallions: 0, arcaneEquipment: 0, formQuestItems: 0,
      orbletDrops: 0, orbletsDropped: 0,
      bonesCollected: 0, dustCollected: 0, tachyonsCollected: 0, medallionsCollected: 0, prismaBubblesCollected: 0,
      clamPearlsGained: 0, clamTenX: 0,
      coveKills: 0, golemsSpawned: { monarch: 0, centurion: 0 }, golemKills: { monarch: 0, centurion: 0 }, opalsFound: 0,
      holeShapesGained: 0, holeShapesByType: {}, torchesGained: 0, riftQuest74: 0, riftSkullsApplied: 0, evaporatePickups: 0,
    },
    den: null,
  };
  // The world module flags Rift kill tasks as unmodelled; this module models them.
  const partial = sim.scene.partial;
  if (Array.isArray(partial)) {
    const i = partial.indexOf('Rift kill tasks are not modelled');
    if (i !== -1) partial.splice(i, 1);
  }
  if (Array.isArray(sim.scene.partial) && map === 166) {
    sim.scene.partial.push('Rift task progress is tracked as counters only (RiftTaskProgress, src 67155)');
  }
  sim.special = {
    formDrops, orbletDrops, monsterKillPre, dungeonPickup, spawnCaveGolem,
    caveAInit: (mon) => _caveAInit(sim, mon),
    caveHound: (mon, hp) => _caveHound(sim, mon, hp),
    startDen: () => startDen(sim),
    summary: () => specialSummary(sim),
  };
  if (map === 306) _initClamworks(sim);
  if (map === 216 && sim.state.special.cavern === 2) _initDen(sim, opts.den);
  for (const g of Array.isArray(opts.golems) ? opts.golems : []) {
    sim.later(Math.max(0, N(g.atMs)), () => spawnCaveGolem(sim, g.type));
  }
}

// Clamworks scene init (src 158578-158590).
function _initClamworks(sim) {
  const MDall = sim.rewardsState?.monsterDrops;
  const ola = (k) => _ola(sim, k);
  const push = () => {
    const MD = MDall?.w7a6;
    if (MD && 5 > MD.length && 1 <= N(ola(460))) MD.push(['ClamPearl1', '0.000005', '1', 'N/A']);
    return MD;
  };
  push();
  sim.every(1e3, () => {
    const MD = push();
    if (!MD) return;
    const r = clamPearlRates(ola);
    for (let i = 0; i < MD.length; i++) {
      if (MD[i][0] === 'ClamPearl0') MD[i][1] = r.ClamPearl0;
      else if (MD[i][0] === 'ClamPearl1') MD[i][1] = r.ClamPearl1;
    }
    _sp(sim).clam.rates = r;
  });
  const setHp = () => {
    const d = getDef(sim, 'w7a6');
    if (d) d.MonsterHPTotal = clamHp(ola(464));
    _sp(sim).clam.hpTotal = d ? d.MonsterHPTotal : 0;
  };
  setHp();
  sim.every(1e3, setHp);
}

// Live form-drop multiplier (src 91805/92322/92409): static save terms from
// inputs.formDropCoef, OLA collection counters and GenINFO[125]/[132] read at
// drop time. A user override of the scalar input wins.
export function formDropMulti(sim, key, fn) {
  const inp = sim.inputs;
  if (inp.entries?.[key]?.overridden || !inp.values.formDropCoef) return N(inp.values[key]) || 1;
  const gi = sim.state.gi || {};
  return fn(inp.values.formDropCoef, {
    ola333: _ola(sim, 333), ola359: _ola(sim, 359), ola390: _ola(sim, 390), ola393: _ola(sim, 393),
    gi125: N(gi[125]), gi132: N(gi[132]),
  });
}

// ---------------------------------------------------------------------------
// Form drops (AE1 drop branch, src 63689-63705)
// ---------------------------------------------------------------------------
export function formDrops(sim, mon) {
  const v = sim.inputs.values;
  const st = sim.state;
  const sp = _sp(sim);
  const rng = sim.rng;
  const type = '' + mon.type;
  const map = sim.scene.map;
  const MD = sim.rewardsState?.monsterDrops?.[type] || [];
  const isCoin = MD[0]?.[0] === 'COIN';
  const t0 = N(MD[0]?.[2]);
  const x = mon.x + mon.offX - 18;
  const node = mon.node;
  const C = sp.c;
  const gi1 = N(st.gi1_100);
  const drop = (name, qty, itemN, itemM, src) => dropSomething(sim, name, qty, 0, itemN, itemM, node, 0, x, src);
  const gi26 = st.gi26 || (st.gi26 = {});

  // Wraith Form bones (src 63689-63691).
  if (0 < _buff(sim, 195) && st.wraith === 1 && 0.25 > rng.randomFloat() && isCoin
    && type.indexOf('Crystal') === -1 && type.indexOf('Chest') === -1 && 0 >= gi1) {
    const cnt = rng.randomInt(1, 2);
    for (let e = 0; e < cnt; e++) {
      const it = drop('Bone' + boneType(t0), boneQtyBase(t0) * formDropMulti(sim, 'bonesDropDec', grimoireBonesDropDEC), rng.randomInt(0, 4), 5, 'wraithBones');
      _add(C.bonesDropped, it.dropType, it.dropAmount);
    }
    if (0.02 > rng.randomFloat() && 0 === N(_ola(sim, 367))) { drop('Quest98', 1, rng.randomInt(0, 2), 5, 'wraithQuest'); C.formQuestItems++; }
  }

  // Tempest Form (src 63693-63698).
  if (0 < _buff(sim, 420) && st.tempest === 1) {
    if (0.25 > rng.randomFloat() && isCoin && type.indexOf('mini') === -1 && type.indexOf('baba') === -1
      && type.indexOf('Crystal') === -1 && type.indexOf('Chest') === -1 && 0 >= gi1 && 216 !== map) {
      const cnt = rng.randomInt(1, 2);
      for (let e = 0; e < cnt; e++) {
        const it = drop('Dust' + dustType(t0), dustQtyBase(t0) * formDropMulti(sim, 'extraDust', windwalkerExtraDust), rng.randomInt(0, 4), 5, 'tempestDust');
        _add(C.dustDropped, it.dropType, it.dropAmount);
      }
      if (0.05 > rng.randomFloat() && 0 === N(_ola(sim, 401))) { drop('Quest100', 1, rng.randomInt(0, 2), 5, 'tempestQuest'); C.formQuestItems++; }
    }
    const TAD = () => tempestAllDropBonus(v, _ola(sim, 365));
    // TempestNovadustChance (src 92377).
    if (rng.randomFloat() < 1e-4 * (1 + (_cbv(v, 33) + _cbv(v, 86)) / 100) && 1 <= _cbv(v, 33)) {
      const it = drop('Dust4', formDropMulti(sim, 'extraDust', windwalkerExtraDust), rng.randomInt(0, 4), 5, 'tempestNova');
      _add(C.dustDropped, it.dropType, it.dropAmount);
    }
    const w = tempestWepDrop(v, t0);
    if (w !== -1 && rng.randomFloat() < 625e-6 * TAD() * (1 + _cbv(v, 106) / 100) && 0 === N(_ola(sim, 398)) && 0 < N(gi26[20])) {
      const xp = _tempestXtraPower(v, w);
      const dm = { AwesomeStats: 1 };
      dm.Speed = Math.round(rng.randomInt(-2, 6) * Math.pow(rng.randomFloatBetween(Math.min(0.7, 0.4 + xp / 600), 1), 15));
      dm.Weapon_Power = Math.round(rng.randomInt(-5, 25) * Math.pow(rng.randomFloatBetween(Math.min(0.92, 0.8 + xp / 2e3), 1), 15) + 7 * Math.floor(map / 50));
      dm.UQ1val = Math.round(rng.randomInt(-5, 30) * Math.pow(rng.randomFloatBetween(Math.min(0.92, 0.8 + xp / 2e3), 1), 15));
      drop('EquipmentBowsTempest' + w, 1, rng.randomInt(0, 4), 5, 'tempestWeapon').droppedMap = dm;
      gi26[20] = N(gi26[20]) - 1;
      C.tempestEquipment++;
    }
    const rr = tempestRingDrop(v, t0);
    if (rr !== -1 && rng.randomFloat() < 5e-4 * TAD() * (1 + (_cbv(v, 112) + _cbv(v, 118)) / 100) && 0 === N(_ola(sim, 399)) && 0 < N(gi26[20])) {
      const dm = { AwesomeStats: 1 };
      dm.UQ1val = Math.round(rng.randomInt(-5, 25) * Math.pow(rng.randomFloatBetween(0.4, 0.999), 15));
      drop('EquipmentRingsTempest' + rr, 1, rng.randomInt(0, 4), 5, 'tempestRing').droppedMap = dm;
      gi26[20] = N(gi26[20]) - 1;
      C.tempestEquipment++;
    }
    if (rng.randomFloat() < 0.0025 * TAD() * (1 + (_cbv(v, 110) + (_cbv(v, 113) + _cbv(v, 82))) / 100) && 0 === N(_ola(sim, 400)) && 1 <= _cbv(v, 4)) {
      let name = 'StoneTempestB' + rng.randomInt(0, 2);
      if (0.5 > rng.randomFloat()) name = 'StoneTempestR' + rng.randomInt(0, 2);
      drop(name, 1, rng.randomInt(0, 4), 5, 'tempestStone').droppedMap = {};
      C.tempestStones++;
    }
    const medChance = TAD() * (1 / (5e3 * Math.pow(1 + Math.floor(map / 50), 3))) * (1 + (_cbv(v, 107) + _cbv(v, 72)) / 100) * (1 + N(v.arcade48) / 100);
    if (rng.randomFloat() < medChance && 1 <= _cbv(v, 5) && !sp.compass3.includes(type) && (RANDOlist[112] || []).includes(type)) {
      const it = drop('WWcoin', 1, rng.randomInt(0, 4), 5, 'tempestMedallion');
      it.playerDropped = 1; // ItemDropLol420 in DummyMap (src 82560)
      it.droppedMap = { ItemDropLol420: 1, CommCoinMobType: type };
      C.medallions++;
    }
    _olaSet(sim, 365, N(_ola(sim, 365)) - 1);
  }

  // Arcanist Form (src 63700-63705).
  if (0 < _buff(sim, 585) && st.arcanist === 1) {
    if (0.25 > rng.randomFloat() && isCoin && type.indexOf('mini') === -1 && type.indexOf('baba') === -1
      && type.indexOf('Crystal') === -1 && type.indexOf('Chest') === -1 && 0 >= gi1 && 216 !== map) {
      const cnt = rng.randomInt(1, 2);
      for (let e = 0; e < cnt; e++) {
        const it = drop('Tach' + tachyonType(t0), tachyonQtyBase(t0) * formDropMulti(sim, 'extraTachyon', arcaneExtraTachyon), rng.randomInt(0, 4), 5, 'arcanistTachyon');
        _add(C.tachyonsDropped, it.dropType, it.dropAmount);
      }
      if (0.02 > rng.randomFloat() && 0 === N(_ola(sim, 452))) { drop('Quest107', 1, rng.randomInt(0, 2), 5, 'arcanistQuest'); C.formQuestItems++; }
    }
    const A5 = N(v.arcane?.[5]);
    // ArcaneType("WepDropChance") / ("WepDropQuality") (src 92409).
    if (rng.randomFloat() < 1 / (300 * (1 + N(_ola(sim, 396)) / 100)) && 0 < A5 && 0 === N(_ola(sim, 598)) && 100 > N(_ola(sim, 396))) {
      _olaSet(sim, 396, N(_ola(sim, 396)) + 1);
      const Q = A5;
      const dm = { AwesomeStats: 1 };
      dm.Speed = Math.round(rng.randomInt(-2, 0 | Math.min(6, 2 + Math.floor(Q / 300))) * Math.pow(rng.randomFloatBetween(Math.min(0.7, 0.4 + Q / 6e3), 1), 15));
      dm.Weapon_Power = Math.round(rng.randomInt(-5, 15) * Math.pow(rng.randomFloatBetween(Math.min(0.92, 0.8 + Q / 2e4), 1), 15) + Math.floor(Q / 25));
      dm.UQ1val = Math.round(rng.randomInt(-10, 50) * Math.pow(rng.randomFloatBetween(Math.min(0.92, 0.8 + Q / 2e4), 1), 15) + Math.floor(Q / 20));
      dm.UQ2val = Math.round(rng.randomInt(-1, 30) * Math.pow(rng.randomFloatBetween(Math.min(0.92, 0.8 + Q / 2e4), 1), 15) + Math.floor(Q / 15));
      drop('EquipmentWandsArc0', 1, rng.randomInt(0, 4), 5, 'arcanistWand').droppedMap = dm;
      C.arcaneEquipment++;
    }
    const A23 = N(v.arcane?.[23]);
    if (rng.randomFloat() < 1 / (500 * (1 + N(_ola(sim, 397)) / 100)) && 0 < A23 && 0 === N(_ola(sim, 599)) && 100 > N(_ola(sim, 397))) {
      _olaSet(sim, 397, N(_ola(sim, 397)) + 1);
      const Q = A23;
      const dm = { AwesomeStats: 1 };
      dm.UQ1val = Math.round(rng.randomInt(-5, 40) * Math.pow(rng.randomFloatBetween(Math.min(0.92, 0.8 + Q / 2e4), 1), 15) + Math.floor(Q / 15));
      dm.UQ2val = Math.round(rng.randomInt(-1, 30) * Math.pow(rng.randomFloatBetween(Math.min(0.92, 0.8 + Q / 2e4), 1), 15) + Math.floor(Q / 10));
      drop('EquipmentRingsArc0', 1, rng.randomInt(0, 4), 5, 'arcanistRing').droppedMap = dm;
      C.arcaneEquipment++;
    }
  }
}

// ---------------------------------------------------------------------------
// Orblets (Orb of Verisimilitude fade, src 89223-89227)
// ---------------------------------------------------------------------------
export function orbletDrops(sim, ctx = {}) {
  const sp = _sp(sim);
  if (sp.orbletMultiDrop == null) {
    const ov = sim.options?.special?.orbletMultiDrop;
    sp.orbletMultiDrop = ov != null ? N(ov) : orbletMultiDrop(_talent1(sim, 234), computeUniqueSushi(sim.saveData?.sushiData));
  }
  const kills = N(ctx.kills ?? sim.state.gi?.[77]);
  const multi = Math.floor(Math.min(5, 1 + (sp.orbletMultiDrop / 100 + sim.rng.randomFloat())));
  // DummyNumber3 (CritStatus) = the player's node at cast (src 67496).
  const node = ctx.node ?? sim.player?.node ?? 0;
  const x = N(ctx.x ?? sim.player?.x);
  for (let r = 0; r < multi; r++) {
    const it = dropSomething(sim, 'Orblet', Math.floor(kills / 1e3), 0, r, multi, node, 0, x, 'orblets');
    sp.c.orbletsDropped += N(it?.dropAmount);
  }
  sp.c.orbletDrops++;
  sim.emit('orblets', { t: sim.timeMs, multi, qty: Math.floor(kills / 1e3) });
  return multi;
}

// ---------------------------------------------------------------------------
// MonsterKill rift / cavern branch (src 67155-67168) + caveD killmonsterQuest
// ---------------------------------------------------------------------------
export function monsterKillPre(sim, mon) {
  const sp = _sp(sim);
  const map = sim.scene.map;
  const rng = sim.rng;
  const st = sim.state;
  const has = (s) => mon.statusList.some((e) => e.name === s);
  if (map === 166 && sp.rift) {
    const P = sp.rift.progress;
    _add(P, 'add0', 1); _add(P, 'name14', 1); _add(P, 'name15', 1);
    if (has('StatusSkull0')) _add(P, 'name3', 1);
    const task = sp.rift.task;
    if (task === 2 && rng.randomFloat() < N(sim.player?.dropRate ?? sim.inputs.values.dropRate) / 4e3) {
      dropSomething(sim, 'Quest74', 1, 0, 0, 0, mon.node, 0, mon.x + mon.offX - 18, 'riftQuest74');
      sp.c.riftQuest74++;
    }
    if (task === 5 || task === 12 || task === 13) {
      let dummyNumber = 0;
      for (let i = 0; i < 6; i++) {
        if (!((i === 0 && mon.statusList.length === 0) || has('StatusSkull' + i))) continue;
        if (has('StatusSkull' + i)) { _add(P, 'add12', Math.round(1 + Math.floor(i / 2))); _add(P, 'add13', Math.round(1 + Math.floor(i / 2))); }
        const list = monsters(sim);
        const pick = () => list[rng.randomInt(0, list.length - 1)];
        let target = pick();
        for (let s = 0; s < 150;) {
          s++;
          target = pick();
          if (target && target.alive === 1 && target.pet === 0 && 0.1 < N(target.hp) && target.id !== mon.id) { dummyNumber = 1; break; }
        }
        if (dummyNumber === 1 && target) {
          const dur = Math.round(150 + 10 * i);
          if (mon.statusList.length === 0) {
            if (task === 5 || 0.5 > rng.randomFloat()) { addStatusToMonster(sim, target, 'StatusSkull0', dur); sp.c.riftSkullsApplied++; }
          } else if (0.45 > rng.randomFloat()) { addStatusToMonster(sim, target, 'StatusSkull' + Math.round(i + 1), dur); sp.c.riftSkullsApplied++; }
          target.hp = Math.pow(1.5, i + 1) * target.hpTot;
        }
      }
      if (has('StatusSkull6')) _add(P, 'name5', 1);
    }
  }
  if (map === 216 && mon.hp !== -69.42069) {
    if (mon.type === 'caveA') _denHoundKill(sim, mon);
    else if (mon.type === 'caveB' && mon.sizeMulti === 3.8 && mon.temp === 1) {
      if (st.holes11) st.holes11[27] = 0; // rewards adds this kill afterwards (killmonsterQuest)
      _holesSet(sim, 11, 27, 0);
      _holesSet(sim, 11, 26, Math.round(N(_holes(sim, 11, 26)) + 1));
      _holesSet(sim, 7, 8, Math.round(N(_holes(sim, 7, 8)) + 1));
      _opal(sim, mon);
      sp.c.golemKills.monarch++;
    } else if (mon.type === 'caveC' && mon.sizeMulti === 3.8 && mon.temp === 1) {
      _holesSet(sim, 11, 55, Math.round(N(_holes(sim, 11, 55)) + 1));
      _holesSet(sim, 7, 14, Math.round(N(_holes(sim, 7, 14)) + 1));
      _opal(sim, mon);
      sp.c.golemKills.centurion++;
    }
  }
  // killmonsterQuest("caveD", 1) (src 67211 → 67221): OLA[668] += 1 live.
  if (mon.type === 'caveD') {
    _olaSet(sim, 668, N(_ola(sim, 668)) + 1);
    sp.c.coveKills++;
  }
}

// Holes("createOpal", xCenter, 200) (src 92101) then GenINFO[118] = 0.
function _opal(sim, mon) {
  const sp = _sp(sim);
  sp.c.opalsFound++;
  sp.golem.lock = 0;
  sp.golem.active = null;
  sim.emit('opalFound', { t: sim.timeMs, x: mon.x + mon.width / 2, y: 200, type: mon.type });
}

// ---------------------------------------------------------------------------
// Cavern golems (src 96029 Centurion, 96058 Monarch; HP src 67146)
// ---------------------------------------------------------------------------
export function spawnCaveGolem(sim, type) {
  const sp = _sp(sim);
  if (sim.scene.map !== 216 || (type !== 'caveB' && type !== 'caveC')) { _unmodelled(sim, 'caveGolemWrongMap', type); return null; }
  if (sp.golem.lock === 1) return null; // GenINFO[118] == 1 blocks another golem
  sp.golem.lock = 1;
  const mon = createMonster(sim, type, 1, sim.rng.randomInt(99, 861));
  if (!mon) return null;
  const hp = type === 'caveB' ? monarchHp(_holes(sim, 11, 26)) : 250 * N(sim.player?.damageMax ?? sim.inputs.values.damageMax);
  mon.hp = hp; mon.hpTot = hp; mon.sizeMulti = 3.8;
  addStatusToMonster(sim, mon, 'StatusBuffDmg', 99999);
  addStatusToMonster(sim, mon, 'StatusSkull' + Math.round(Math.min(16, 6 + N(_holes(sim, 11, 26)))), 99999);
  sp.golem.active = { uid: mon.uid, type, hp };
  sp.c.golemsSpawned[type === 'caveB' ? 'monarch' : 'centurion']++;
  sim.emit('caveGolem', { t: sim.timeMs, uid: mon.uid, type, hp });
  return mon;
}

// ---------------------------------------------------------------------------
// The Den (map 216, cavern 2). GenINFO = PixelHelperActor[25] ActorEvents_670
// (sim.state.gi): 55 run state (1 active, .5 ending), 59 fear, 60 score,
// 62 spawn countdown (10 ms steps), 63 hounds spawned, 64 amped hound, 65 fear
// tokens, 66 fear flash, 97 opals this run, 130 kills, 184/185 Skull3 chain.
// ---------------------------------------------------------------------------
function _denConst(sim) {
  const sp = _sp(sim);
  if (sp.denConst) return sp.denConst;
  const S = sim.saveData || {};
  const amps = sim.inputs?.values?.denAmps;
  const H12 = Array.isArray(amps) && amps.length ? amps : (S.holesData?.[12] || []);
  const h26_2 = N(S.holesData?.[26]?.[2]);
  sp.denConst = {
    amp: [0, 1, 2, 3, 4, 5, 6, 7].map((t) => ampDebuff(H12, t)),
    ampMulti: ampMulti(H12, computeBUpg(23, 1, S)),
    sbb20: h26_2 * holesBolaiaPerLv(2), // StudyBolaiaBonuses(2, 0)
    sbb299: h26_2 >= 1 ? 1 : 0, // StudyBolaiaBonuses(2, 99)
  };
  return sp.denConst;
}
function _initDen(sim, cfg) {
  if (cfg === false) return;
  const gi = sim.state.gi;
  const tokens = [];
  gi[65] = tokens;
  _sp(sim).den = { runs: 0, houndsSpawned: 0, houndsKilled: 0, opals: 0, fearGained: 0, playerKills: 0, tokens };
  sim.sceneUpdaters.push(_denFrame);
  const at = N(cfg?.atMs);
  if (at > 0) sim.later(at, () => startDen(sim));
  else startDen(sim);
}
// Den start button (src 95914).
export function startDen(sim) {
  const den = _sp(sim).den;
  const gi = sim.state.gi;
  if (!den || N(gi[55]) !== 0) return false;
  const K = _denConst(sim);
  if (K.sbb299 === 1) gi[184] = 1;
  gi[185] = 0; gi[55] = 1; gi[130] = 0;
  gi[59] = 0; gi[60] = 0; gi[61] = 0; gi[62] = 0; gi[63] = 0;
  gi[59] = Math.min(DEN_FEAR_MAX - 1, DEN_FEAR_MAX * (K.amp[6] / 100));
  const def = getDef(sim, 'caveA');
  if (def) { def.Defence = 0.6666666666666666 * K.amp[1]; if (Array.isArray(def.Damages)) def.Damages[0] = K.amp[0]; }
  den.runs++;
  sim.emit('denStart', { t: sim.timeMs, fear: gi[59] });
  return true;
}
export function denSnapshot(sim) {
  const den = _sp(sim)?.den;
  if (!den) return null;
  const gi = sim.state.gi;
  return {
    active: N(gi[55]), fear: N(gi[59]), fearMax: DEN_FEAR_MAX,
    score: N(gi[60]), kills: N(gi[130]), wave: N(gi[63]), tokens: den.tokens.length,
    ampMulti: _denConst(sim).ampMulti, chain: N(gi[185]), runs: den.runs, opals: den.opals,
  };
}
// Holes menu actor whenUpdated _event_12 (src 96331-96357, registered 97204): runs every 10 ms step.
function _denFrame(sim) {
  const den = _sp(sim).den;
  if (!den) return;
  const gi = sim.state.gi;
  const rng = sim.rng;
  const K = _denConst(sim);
  const def = getDef(sim, 'caveA');
  if (def) { def.Defence = 0.6666666666666666 * K.amp[1]; if (Array.isArray(def.Damages)) def.Damages[0] = K.amp[0]; }
  if (N(gi[66]) > 0) gi[66] = Math.max(0, gi[66] - 9);
  if (gi[55] === 1 && N(gi[59]) >= DEN_FEAR_MAX) _denEnd(sim);
  if (gi[55] !== 1) return;
  gi[62] = N(gi[62]) - 1;
  if (!monsters(sim).some((m) => m.type === 'caveA' && N(m.hp) > 0)) gi[62] = -1;
  if (gi[62] < 0) {
    gi[64] = rng.randomFloat() < 0.1 && K.amp[3] > 1 ? 1 : 0;
    gi[63] = N(gi[63]) + 1;
    gi[62] = (gi[63] + 200) / (5 * gi[63] + 80) * 150;
    const mon = createMonster(sim, 'caveA', 1, rng.randomInt(99, 861), 'CaveHound');
    if (mon) den.houndsSpawned++;
    if (N(gi[184]) === 1) {
      if (mon) addStatusToMonster(sim, mon, 'StatusSkull3', 99999);
      gi[184] = 0;
    } else {
      if (gi[64] === 1 && mon) addStatusToMonster(sim, mon, 'StatusBuffDmg', 99999);
      if (rng.randomFloat() < 0.05 && K.amp[5] > 1 && mon) addStatusToMonster(sim, mon, 'StatusSkull5', 99999);
    }
  }
  // Fear tokens: +1 fear 345 steps (3.45 s) after creation.
  const tokens = den.tokens;
  for (let i = 0; i < tokens.length; i++) {
    const tk = tokens[i];
    tk[1]++;
    if (250 < tk[1] && tk[1] < 1e5) tk[1] = 1e5;
    if (tk[1] > 100093) {
      gi[59] = N(gi[59]) + 1;
      gi[66] = 180;
      den.fearGained++;
      tokens.splice(i, 1);
      i--;
    }
  }
}
// Fear reached FearMAX (src 96331): record score, award opals, end the run.
function _denEnd(sim) {
  const sp = _sp(sim);
  const den = sp.den;
  const gi = sim.state.gi;
  gi[55] = 0.5;
  const score = N(gi[60]);
  if (score > N(_holes(sim, 11, 8))) {
    _holesSet(sim, 11, 8, score);
    gi[97] = 0;
    while (N(_holes(sim, 11, 8)) >= houndNextOpalScoreReq(_holes(sim, 7, 2))) {
      _holesSet(sim, 7, 2, Math.round(N(_holes(sim, 7, 2)) + 1));
      gi[97]++;
    }
    const n = gi[97];
    for (let s = 0; s < n; s++) {
      sim.later(1e3 * (1 + 0.2 * s), () => {
        sp.c.opalsFound++;
        den.opals++;
        sim.emit('opalFound', { t: sim.timeMs, x: Math.round(480 - 51.5 * (n - 1) + 103 * s), y: 72, type: 'caveA', source: 'den' });
      });
    }
  }
  sim.later(7e3, () => { gi[55] = 0; });
  for (const m of monsters(sim)) if (m.type === 'caveA') m.hp = -69.42069; // removed without rewards
  den.tokens.length = 0;
  // DealDmgToPlayer(999999, "none", "none") string variant: an unconditional kill.
  sim.later(1e3, () => sim.later(2200, () => {
    if (sim.player) { sim.player.hp = 0; den.playerKills++; }
  }));
  sim.emit('denEnd', { t: sim.timeMs, score, opals: N(gi[97]) });
}
// caveA ActorEvents_1 init (src 63882-63893).
function _caveAInit(sim, mon) {
  const gi = sim.state.gi;
  mon.persNum = -10;
  mon.persNum2 = N(gi[63]);
  sim.every(100, () => {
    if (!(N(mon.hp) > 0)) return;
    const K = _denConst(sim);
    const p = Math.max(0, N(mon.persNum));
    if (p % 30 === 29 && K.amp[2] > 0) mon.hp = Math.min(mon.hpTot, mon.hp + mon.hpTot * K.amp[2] / 100);
    if (p % (50 - K.amp[7]) === Math.round(49 - 10 * K.amp[7])) {
      const count = mon.statusList.some((s) => s.name === 'StatusSkull5') ? K.amp[5] : 1;
      const tokens = _sp(sim).den?.tokens || (Array.isArray(gi[65]) ? gi[65] : (gi[65] = []));
      for (let k = 0; k < (count | 0); k++) {
        const dx = sim.rng.randomInt(-55, 55);
        const dy = sim.rng.randomInt(-40, -78);
        tokens.push([{ x: mon.x + dx, y: mon.y + dy }, 0, 1]);
      }
    }
    mon.persNum = Math.round(mon.persNum + 1);
  }, mon);
}
// CreateMonster "CaveHound" (src 67146): HP and size scale with the wave.
function _caveHound(sim, mon, hp) {
  const gi = sim.state.gi;
  const K = _denConst(sim);
  const h = N(hp) * Math.max(1, K.amp[3] * N(gi[64])) * Math.pow(1.08, N(gi[63]));
  mon.hpTot = h;
  mon.sizeMulti = Math.min(4.5, N(gi[64]) + Math.min(3.5, 2 + 0.25 * Math.floor((N(gi[63]) + sim.rng.randomInt(0, 70)) / 250)));
  return h;
}
// MonsterKill caveA branch (src 67168): score, class record, Skull3 chain.
function _denHoundKill(sim, mon) {
  const gi = sim.state.gi;
  const K = _denConst(sim);
  const p2 = N(mon.persNum2);
  gi[60] = N(gi[60]) + 10 * Math.pow(1.1, Math.floor(p2 / 100)) * (1 + 20 * p2 / (p2 + 1e3)) * Math.max(1, K.ampMulti) * (1 + N(gi[185]) * K.sbb20 / 100);
  gi[130] = N(gi[130]) + 1;
  const cls = N(sim.inputs.values.charClass);
  const slot = cls < 0 ? -1 : cls < 7 ? 33 : cls < 18 ? 34 : cls < 30 ? 35 : cls < 999 ? 36 : -1;
  if (slot !== -1 && gi[130] > N(_holes(sim, 11, slot))) _holesSet(sim, 11, slot, gi[130]);
  if (mon.statusList.some((s) => s.name === 'StatusSkull3')) {
    gi[184] = 1;
    gi[185] = N(gi[185]) + 1;
    gi[62] = 1;
  }
  const den = _sp(sim).den;
  if (den) den.houndsKilled++;
}

// ---------------------------------------------------------------------------
// DUNGEON_EVAPORATE pickup (src 82463 → DungeonPickup 82542-82547)
// ---------------------------------------------------------------------------
export function dungeonPickup(sim, item) {
  const t = item.dropType;
  const def = ITEMS[t];
  if (!def || def.Type !== 'DUNGEON_EVAPORATE') return false;
  const sp = _sp(sim);
  const C = sp.c;
  const st = sim.state;
  const rng = sim.rng;
  const S = sim.saveData;
  const DA = N(item.dropAmount);
  const map = sim.scene.map;
  const ola = (k) => _ola(sim, k);
  const olaAdd = (k, n) => _olaSet(sim, k, N(ola(k)) + n);
  item.collectedStatus = 1;
  item.pickedQty = DA;
  C.evaporatePickups++;
  let m;
  if (t === 'Quest51') {
    if (map !== 38 && map !== 17) { const gi = st.gi || (st.gi = {}); gi[79] = Math.round(N(gi[79]) + 1); }
  } else if ((m = /^Island([01])$/.exec(t))) olaAdd(161 + N(m[1]), 1);
  else if ((m = /^Bone([0-3])$/.exec(t))) { olaAdd(330 + N(m[1]), DA); olaAdd(329, DA); C.bonesCollected += DA; }
  else if ((m = /^Dust([0-4])$/.exec(t))) {
    olaAdd(357 + N(m[1]), DA);
    if (!item.droppedMap?.ItemDropLol420) olaAdd(362, DA);
    C.dustCollected += DA;
  } else if (t === 'WWcoin') {
    const mt = item.droppedMap?.CommCoinMobType;
    if (mt != null && !sp.compass3.includes(mt)) sp.compass3.push(mt);
    C.medallionsCollected++;
  } else if ((m = /^Tach([0-5])$/.exec(t))) { olaAdd(388 + N(m[1]), DA); olaAdd(394, DA); C.tachyonsCollected += DA; }
  else if (t === 'Quest99') {
    _olaSet(sim, 383, Math.round(N(ola(383)) + 1));
    _olaSet(sim, 395, Math.round(N(ola(395)) + 1));
    const g = st.gi26 || (st.gi26 = {});
    g[43] = Math.round(N(g[43]) - 1);
    C.prismaBubblesCollected++;
  } else if (t === 'ClamPearl0' || t === 'ClamPearl1') {
    const mk = overkillState(sim).multiKillTotal;
    const value = clamPearlValue(ola, mk, S?.menagerieData);
    const tenX = rng.randomFloat() < 1 - 1 / (1 + clamBonus(2, ola) / 100) ? 10 : 1; // ClamPearl10x src 91996
    if (tenX === 10) C.clamTenX++;
    const gain = t === 'ClamPearl0' ? DA * value * tenX : DA * value * tenX * clamBlackPearlValue(ola);
    olaAdd(454, gain);
    C.clamPearlsGained += gain;
  } else if (t === 'Quest94') {
    const gain = DA * Math.floor(1 + templeExtraTorches(S) / 100 + rng.randomFloat());
    _holesSet(sim, 11, 56, N(_holes(sim, 11, 56)) + gain);
    C.torchesGained += gain;
  } else if (t.indexOf('HoleGshape') === 0) {
    const n = N(def.ID);
    const DP = cglunkoDoublePickup(S);
    let gain = DA * (1 + Math.floor(rng.randomFloat() + DP));
    olaAdd(654 + n, gain);
    if (n === Math.round(N(ola(666)) - 1)) {
      const g2 = Math.max(cglunkoUpgBon(9, ola) - 1, 0) * DA * (1 + Math.floor(rng.randomFloat() + DP));
      olaAdd(654 + n, g2); gain += g2;
    } else if (n === Math.round(N(ola(667)) + 5) && 6 <= n) {
      const g2 = Math.max(cglunkoUpgBon(16, ola) - 1, 0) * DA * (1 + Math.floor(rng.randomFloat() + DP));
      olaAdd(654 + n, g2); gain += g2;
    }
    C.holeShapesGained += gain;
    _add(C.holeShapesByType, n, gain);
  } else if (t === 'Quest69') {
    olaAdd(105, 1);
    if (sim.state.killroy) sim.state.killroy.skullsPicked++;
  }
  else if (t === 'Quest74') { if (sp.rift) _add(sp.rift.progress, 'add2', 1); }
  else _unmodelled(sim, 'dungeonPickupEffect', t + ' (src 82547 dungeon-only pickup effect)');
  return true;
}

// ---------------------------------------------------------------------------
// Summary (summary.special): cumulative numeric leaves + end-of-run `state`.
// ---------------------------------------------------------------------------
export function specialSummary(sim) {
  const sp = sim.state?.special;
  if (!sp) return null;
  const C = sp.c;
  const byItem = sim.rewardsState?.ledger?.byItem || {};
  const qd = (k) => N(byItem[k]?.qtyDropped);
  const hours = sim.timeMs / 3.6e6;
  const out = {
    obolFragments: N(sim.rewardsState?.ledger?.obolFragments),
    combatProgress: { ...(sim.state.progress?.gains || {}) },
    forgeBars: { ...(sim.state.progress?.bars || {}) },
    shinyDays: Object.fromEntries((sim.state.progress?.pets || []).map(p => [p.name, p.gained])),
    bonesDropped: { ...C.bonesDropped },
    dustDropped: { ...C.dustDropped },
    tachyonsDropped: { ...C.tachyonsDropped },
    tempestEquipment: C.tempestEquipment,
    tempestStones: C.tempestStones,
    medallions: C.medallions,
    arcaneEquipment: C.arcaneEquipment,
    formQuestItems: C.formQuestItems,
    orbletsDropped: C.orbletsDropped,
    parchmentFound: qd('RGenh') + qd('RGenhB'),
    clamPearls: { dropped: qd('ClamPearl0'), black: qd('ClamPearl1'), pearlsGained: C.clamPearlsGained, tenX: C.clamTenX },
    coveKills: C.coveKills,
    holeShapesDropped: ['HoleGshape0', 'HoleGshape1', 'HoleGshape2', 'HoleGshape3', 'HoleGshape4', 'HoleGshape5'].reduce((a, k) => a + qd(k), 0),
    holeShapesGained: C.holeShapesGained,
    holeShapesByType: { ...C.holeShapesByType },
    golemsSpawned: { ...C.golemsSpawned },
    golemKills: { ...C.golemKills },
    opalsFound: C.opalsFound,
    torchesGained: C.torchesGained,
    riftQuest74: C.riftQuest74,
    riftSkullsApplied: C.riftSkullsApplied,
    den: {
      runs: N(sp.den?.runs), houndsSpawned: N(sp.den?.houndsSpawned), houndsKilled: N(sp.den?.houndsKilled),
      opals: N(sp.den?.opals), fearGained: N(sp.den?.fearGained), playerKills: N(sp.den?.playerKills),
    },
    collected: {
      bones: C.bonesCollected, dust: C.dustCollected, tachyons: C.tachyonsCollected,
      medallions: C.medallionsCollected, prismaBubbles: C.prismaBubblesCollected, evaporatePickups: C.evaporatePickups,
    },
  };
  const sum = (o) => Object.values(o).reduce((a, b) => a + N(b), 0);
  out.perHour = hours > 0 ? {
    bones: sum(C.bonesDropped) / hours, dust: sum(C.dustDropped) / hours, tachyons: sum(C.tachyonsDropped) / hours,
    orblets: C.orbletsDropped / hours, parchment: out.parchmentFound / hours, clamPearls: C.clamPearlsGained / hours,
    holeShapes: C.holeShapesGained / hours, coveKills: C.coveKills / hours,
  } : {};
  out.state = {
    obolFragments: N(sim.state.obolFragments),
    ola: Object.fromEntries([...new Set([...Object.keys(sp.ola), ...Object.keys(sp.olaTouched)])].map((k) => [k, _ola(sim, Number(k))])),
    holes: _clone(sp.holes), cavern: sp.cavern,
    rift: sp.rift ? { rift0: sp.rift.rift0, task: sp.rift.task, progress: { ...sp.rift.progress } } : null,
    golem: { ...sp.golem }, clam: sp.clam ? _clone(sp.clam) : null,
    orbletMultiDrop: sp.orbletMultiDrop, compass3Count: sp.compass3.length,
    den: denSnapshot(sim),
    afkNotes: LIVE_VS_AFK.slice(),
  };
  if (sim.state.killroy) {
    const k = sim.state.killroy;
    out.killroy = { kills: k.kills, skullsDropped: k.skullsDropped, skullsPicked: k.skullsPicked, spawned: k.spawned };
    out.state.killroy = { remaining: Math.max(0, k.remaining), duration: k.duration, queued: k.queued,
      finished: k.finished, finishedAt: k.finishedAt, talentDrops: k.talentDrops };
  }
  return out;
}
