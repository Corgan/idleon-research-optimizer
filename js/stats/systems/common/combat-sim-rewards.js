// ===== ACTIVE COMBAT SIMULATOR — KILL REWARDS / LOOT =====
// Literal port of the kill-reward and loot side of active combat
// (src/N.new.formatted.js):
//   * _event_KILL reward middle (AE1 ~63600-63700): rockS skeles, crystal
//     chip respawn, event gate, EXP amount, giveEXP (74307), MonsterKill
//     (67147) incl. crystal / giant / plunder spawns and KLA decrement,
//     KilledMonsterType (67191) RNG, class-16 marble shard, then the
//     runLater(250) drop branch with exactly one roll-count branch.
//   * GenerateMonsterDrops (66420) with nested DropTables, merge rules and
//     printer-filter post-processing; DropOdds (66955).
//   * performETCaction("LootDropOddsReset") (74357-74382).
//   * DropSomething (69278) and the ItemDrop actor ActorEvents_44 (82110):
//     launch arc, landing/bobbing, 500 ms any-distance and 700 ms 80 px auto
//     loot, expiry, printer-filter recycle, ItemPickupInTheFirstPlace
//     inventory placement with the full-inventory 2 s retry.
//
// All random calls go through sim.rng in source order. Tables are deep copies
// held in sim.rewardsState; saveData is never mutated.

import { MonsterDrops, DropTables } from '../../data/game/custommaps.js';
import { RANDOlist, NonAFKmonsters, TalentOrder, NinjaInfo, HolesInfo } from '../../data/game/customlists.js';
import { ITEMS } from '../../data/game/items.js';
import { maxCapacityFor } from './combat-sim-inputs.js';
import { addBuff, bulletSize } from './combat-sim-player.js';

const N = (x) => Number(x) || 0;
const _clone = (v) => JSON.parse(JSON.stringify(v));
const _isRecipe = (name) => name.indexOf('SmithingRecipes') !== -1 || name.indexOf('TalentBook') !== -1;
const _isGem = (name) => name.indexOf('PremiumGem') !== -1 || name.indexOf('Timecandy') !== -1;
// RunCodeOfType("Event_BoxDrop") (src 65973).
const EVENT_BOX_DROP = 'Quest109';
const GI77_EXCLUDED = ['crabcakeB', 'shovelY', 'sheepB', 'slimeR', 'snakeY', 'filler'];

function _unmodelled(sim, key, detail) {
  if (sim.world && typeof sim.world.unmodelled === 'function') return sim.world.unmodelled(sim, key, detail);
  const u = sim.state.unmodelled || (sim.state.unmodelled = {});
  u[key] = (u[key] || 0) + 1;
  sim.emit('unmodelled', { key, detail, t: sim.timeMs });
}

function _buff(sim, id) { return N(sim.buffs?.[id]); }

// AddBuffType(id, seconds). Uses the player module's BuffsActive list when it
// is running; otherwise mirrors GetBuffBonuses(id,1/2) from talentN directly.
function _addBuff(sim, id, seconds) {
  if (Array.isArray(sim.state.buffsActive)) { addBuff(sim, id, seconds); return; }
  const tn = sim.inputs.values.talentN || {};
  sim.buffs[id] = N(tn[1]?.[id]);
  sim.buffs[id + ':2'] = N(tn[2]?.[id]);
  sim.emit('buff', { id, seconds: N(seconds), t: sim.timeMs });
}

function _tn(sim, k, id) {
  const v = sim.inputs.values;
  const t = v.talentN?.[k]?.[id];
  if (t !== undefined) return N(t);
  return N(v['talent' + id + '_' + k]);
}

function _buffRemaining(sim, id) {
  const b = (sim.state.buffsActive || []).find((e) => e[0] === id);
  return b ? N(b[1]) : 0;
}

// Form flags (src 91799 GrimoireWraith, 92324 CompassTempest, 92398
// TesseractArcanist): the form buff is active and BuffsActive[idx][1] (the
// remaining seconds) exceeds 100. Tempest/Arcanist also require
// NONdummies[67]/[68], set once at scene load when buff 420/585 >= .1.
// An explicit 0/1 input (`wraith`, `tempest`, `arcanist`) overrides this.
export function updateFormState(sim) {
  const v = sim.inputs.values;
  const st = sim.state;
  const pick = (key, derived) => (v[key] === 0 || v[key] === 1 ? v[key] : derived);
  st.wraith = pick('wraith', 1 <= _buff(sim, 195) && 100 < _buffRemaining(sim, 195) ? 1 : 0);
  st.tempest = pick('tempest', 0.1 <= _buff(sim, 420) && N(st.nd67) === 1 && 100 < _buffRemaining(sim, 420) ? 1 : 0);
  st.arcanist = pick('arcanist', 0.1 <= _buff(sim, 585) && N(st.nd68) === 1 && 100 < _buffRemaining(sim, 585) ? 1 : 0);
  applyFormStats(sim);
}

// Stat overrides while a form is active. Each source accessor checks the forms
// in its own order: DamageDealed map 43 > Wraith > Tempest > Arcanist (src
// 66085), CritChance/CritDamage Wraith > Tempest > Arcanist > map 43 (src
// 66060-66073), PlayerHPmax Wraith > Tempest (src 66212), PlayerAccTot and
// Defence Wraith > Tempest > Arcanist (src 66221), ActionWaitTime("Invuln")
// Tempest (src 66381), PlayerSpeedBonus Tempest then map 266 = 1.75 (src
// 66181). Base values are captured once and restored when the form ends.
const FORM_KEYS = ['damageMax', 'damageMastery', 'damageMin', 'critChance', 'critDamage', 'accuracy', 'hitChancePct',
  'playerSpeedBonus', 'playerSpeed', 'playerMaxHp', 'playerDefence', 'invulnSeconds'];
export function applyFormStats(sim) {
  const v = sim.inputs.values;
  const st = sim.state;
  const fs = v.formStats;
  if (!fs) return;
  const key = (st.wraith ? 'W' : '') + (st.tempest ? 'T' : '') + (st.arcanist ? 'A' : '');
  if (st.formKey === key) return;
  if (!st.formBase) {
    if (!key) { st.formKey = key; return; }
    st.formBase = {};
    for (const k of FORM_KEYS) st.formBase[k] = v[k];
    const p = sim.player;
    if (p) st.formBase.player = { hpMax: p.hpMax, defence: p.defence, invulnSeconds: p.invulnSeconds };
  }
  st.formKey = key;
  const b = st.formBase;
  const W = st.wraith ? fs.wraith : null, T = st.tempest ? fs.tempest : null, A = st.arcanist ? fs.arcanist : null;
  const first = (...xs) => xs.find((x) => x) || null;
  const atk = first(W, T, A);
  const dmgForm = N(sim.mapIdx) === 43 ? null : atk;
  v.damageMax = dmgForm ? N(dmgForm.damage) : b.damageMax;
  v.damageMastery = dmgForm ? N(dmgForm.mastery) : b.damageMastery;
  v.damageMin = dmgForm ? v.damageMax * v.damageMastery : b.damageMin;
  v.critChance = atk ? N(atk.critChance) : b.critChance;
  v.critDamage = atk ? N(atk.critDamage) : b.critDamage;
  v.accuracy = atk ? N(atk.accuracy) : b.accuracy;
  v.hitChancePct = atk ? atk.hitChancePct : b.hitChancePct;
  v.playerDefence = atk ? N(atk.defence) : b.playerDefence;
  const hpForm = first(W, T);
  v.playerMaxHp = hpForm ? N(hpForm.hp) : b.playerMaxHp;
  v.invulnSeconds = T ? N(T.invuln) : b.invulnSeconds;
  if (T && N(sim.mapIdx) !== 266) {
    v.playerSpeedBonus = Math.floor(100 * (1 + N(T.moveSpeed) / 100)) / 100;
    v.playerSpeed = 16 * Math.min(2.19, v.playerSpeedBonus);
  } else {
    v.playerSpeedBonus = b.playerSpeedBonus;
    v.playerSpeed = b.playerSpeed;
  }
  const p = sim.player;
  if (p && !b.player) b.player = { hpMax: N(b.playerMaxHp) || 1, defence: N(b.playerDefence), invulnSeconds: N(b.invulnSeconds) || 2.65 };
  if (p && b.player) {
    p.hpMax = hpForm ? N(hpForm.hp) : b.player.hpMax;
    p.defence = atk ? N(atk.defence) : b.player.defence;
    p.invulnSeconds = T ? N(T.invuln) : b.player.invulnSeconds;
  }
  sim.emit?.('formStats', { form: key, t: sim.timeMs });
}

// ---------------------------------------------------------------------------
// Form drop helpers (src 91802-91803 Grimoire, 92367-92377 Windwalker, 92409
// ArcaneType). `t` is MonsterDrops[type][0][2] (the coin amount).
// ---------------------------------------------------------------------------
export function boneType(t) {
  const f = Math.floor(t);
  if (f === 6e3 || f === 12500 || f === 22e3 || f === 35e4) return 0;
  if (f === 4e5) return 1;
  return 3700 <= t ? Math.min(Math.floor(t / 27) % 4, 3) : 740 <= t ? Math.min(Math.floor(t / 27) % 3, 2) : 190 <= t ? Math.min(Math.floor(t / 27) % 2, 1) : 0;
}
export function boneQtyBase(t) {
  const b = boneType(t);
  return 3 <= b ? Math.pow(Math.max(1, t - 3699), 0.9) : 2 <= b ? Math.pow(Math.max(1, t - 739), 0.9) : 1 <= b ? Math.pow(Math.max(1, t - 189), 0.9) : Math.pow(Math.max(1, t), 0.9);
}
export function dustType(t) {
  const f = Math.floor(t);
  if (f === 145e3 || f === 72e3 || f === 2700 || f === -1) return 0;
  if (f === 310 || f === 770 || f === 1500 || f === 29e3) return 1;
  if (f === 4e5 || f === 98500 || f === 865) return 2;
  if (f === 89e3 || f === 12500 || f === 5e4) return 3;
  return 5e3 <= t ? Math.min(Math.floor(t / 35) % 4, 3) : 1e3 <= t ? Math.min(Math.floor(t / 35) % 3, 2) : 350 <= t ? Math.min(Math.floor(t / 35) % 2, 1) : 0;
}
export function dustQtyBase(t) {
  const d = dustType(t);
  return 3 <= d ? Math.pow(Math.max(1, t - 4999) / 3, 0.9) : 2 <= d ? Math.pow(Math.max(1, t - 999) / 3, 0.9) : 1 <= d ? Math.pow(Math.max(1, t - 349) / 2, 0.9) : Math.pow(Math.max(1, t) / 2, 0.9);
}
export function tachyonType(t) {
  if (t === 5e5) return 5;
  if (t === 12500 || t === 4e5) return 4;
  if (t === 2500 || t === 1850) return 3;
  if (t === 770 || t === 1500 || t === 870 || t === 22e3 || t === 23e4) return 2;
  if (t === 6e3 || t === 2e5) return 1;
  if (t === 8500 || t === 17e3 || t === 175e3) return 0;
  return 1e4 <= t ? Math.min(Math.floor(t / 71) % 6, 5) : 4e3 <= t ? Math.min(Math.floor(t / 71) % 5, 4) : 2750 <= t ? Math.min(Math.floor(t / 35) % 4, 3)
    : 800 <= t ? Math.min(Math.floor(t / 35) % 3, 2) : 250 <= t ? Math.min(Math.floor(t / 35) % 2, 1) : 0;
}
export function tachyonQtyBase(t) {
  const y = tachyonType(t);
  if (5 <= y) return Math.pow(Math.max(1, t - 9999) / 8, 0.83);
  if (4 <= y) return Math.pow(Math.max(1, t - 3999) / 6, 0.87);
  if (3 <= y) return t === 1850 ? 40 : t === 2500 ? 80 : Math.max(5, Math.pow(Math.max(1, t - 2749) / 5, 0.9));
  if (2 <= y) return Math.max(3, Math.pow(Math.max(1, t - 799) / 3, 0.9));
  if (1 <= y) return Math.pow(Math.max(1, t - 249) / 2, 0.9);
  return Math.pow(Math.max(1, t) / 2, 0.9);
}
function _cb(v, i) { return N(v.compass?.[i]); }
// TempestAllDropBonus (src 92376). OLA[365] > 0 is the active 200x window.
export function tempestAllDropBonus(v, ola365) {
  const inner = _cb(v, 7) * Math.max(0, N(v.dropRate) - 1) + (_cb(v, 111) + (_cb(v, 115) + _cb(v, 116)));
  return N(ola365) > 0 ? 200 * (1 + inner / 100) : 1 + inner / 100;
}
export function tempestWepDrop(v, t) {
  const r = Math.floor(t / 3) % 16;
  if (5 > r) return 1 <= _cb(v, 3) ? r : -1;
  return t === 670 || t === 2500 || t === 13e4 ? 4 : t === 1850 || t === 7e3 || t === 19e3 || t === 16e4 ? 3 : -1;
}
export function tempestRingDrop(v, t) {
  const r = Math.floor(t / 2) % 42;
  if (9 > r) return 1 <= _cb(v, 12) ? r : -1;
  return t === 460 || t === 1260 || t === 2300 || t === 8500 || t === 8e4 ? 3 : -1;
}
function _tempestXtraPower(v, w) {
  return w === 0 ? 0 : w === 1 ? _cb(v, 117) : w === 2 ? _cb(v, 109) : w === 3 ? _cb(v, 114) : _cb(v, 108);
}
// PrismaBubDropChance (src 92409).
export function prismaBubDropChance(v, ola395, gi43, map) {
  if (N(v.arcane?.[3]) === 0) return 0;
  return 1 / (1e3 * Math.pow(1.27, N(ola395) + N(gi43))) * Math.max(1, (N(v.dropRate) - 1) * (N(v.arcane?.[51]) / 100))
    * Math.max(1, N(v.talent594_1) * Math.pow(1.5, Math.floor(map / 50)));
}

function _overridden(sim, key) { return !!sim.inputs.entries?.[key]?.overridden; }

// OverkillStuffs("2"), OverkillStuffs("3") and MultiKillTOTAL, evaluated live
// at each call exactly like the source (no cache): DamageDealed("Max") and
// PlayerAccTot come from sim.player.damageMax / sim.player.accuracy when the
// player module exposes live values, else from the save-time inputs; the AFK
// target HP/Defence are read from the current (rescaled) definition.
export function overkillState(sim) {
  const v = sim.inputs.values;
  const p = sim.player || {};
  const maxDmg = N(p.damageMax ?? v.damageMax);
  const acc = N(p.accuracy ?? v.accuracy);
  const afk = sim.state?.afkTarget ?? v.afkTarget;
  const def = (afk && sim.world?.getDef?.(sim, afk)) || null;
  const hp = N(def?.MonsterHPTotal);
  const ex = N(v.overkillExponent) || 2;
  let tier = 1;
  let active = 0;
  if (hp > 0) {
    for (let s = 0; 50 > s && maxDmg >= hp * ex * Math.pow(ex, s + 1); s++) tier = s + 2;
    active = maxDmg >= hp * ex && 0.5 < N(v.towerInfo2) && acc > 1.5 * N(def.Defence) ? 1 : 0;
  } else active = N(v.overkillActive) === 1 ? 1 : 0;
  if (_overridden(sim, 'overkillActive')) active = N(v.overkillActive) === 1 ? 1 : 0;
  let mk = Math.floor(N(v.multiKillBase) + tier * N(v.multiKillPerTier));
  if (_overridden(sim, 'multikillTotal') || v.multiKillBase === undefined) mk = N(v.multikillTotal);
  let kpk;
  const parts = v.kpkParts;
  if (_overridden(sim, 'killPerKill') || !parts) kpk = N(v.killPerKill);
  else kpk = parts.chain * (1 + (active === 1 ? parts.addNoMK + mk : parts.addNoMK) / 100);
  const out = { active, tier, multiKillTotal: mk, killPerKill: kpk, maxDmg, accuracy: acc };
  sim.state.overkill = out;
  return out;
}

// Per-kill KLA credit unit: ArbitraryCode("KillPerKill") + MultiKillPlay/100.
export function killCreditPerKill(sim) {
  return overkillState(sim).killPerKill + N(sim.inputs.values.multiKillPlay) / 100;
}

function _ledgerItem(L, name) {
  return L.byItem[name] || (L.byItem[name] = { dropped: 0, qtyDropped: 0, picked: 0, qtyPicked: 0, filtered: 0, expired: 0, lost: 0 });
}
function _ledgerSource(L, src) {
  return L.bySource[src] || (L.bySource[src] = { rolls: 0, items: 0, qty: 0 });
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
export function initRewards(sim) {
  sim.rewardsState = {
    monsterDrops: _clone(MonsterDrops),
    dropTables: _clone(DropTables),
    sampleDT: undefined, // DNSM["3dSamplDT"], persists across kills
    dn2: 0, // DummyNumber2, never reset by the spawn loop
    ldorRuns: 0,
    // Inventory mutation counter for the full-bag pickup cache. Any code that
    // changes sim.state.inventory (order/quantity) must call bumpInventoryVersion.
    invVersion: 0,
    pickupCache: true,
    pickupCacheHits: 0,
    pickupFail: new Map(),
    ledger: {
      kills: 0, killsByType: {}, expByType: {}, expTotal: 0, coins: 0, coinsPicked: 0,
      byItem: {}, bySource: {}, cards: {}, fullRetries: 0, lostRemainder: 0, overflowQty: 0, overflowByItem: {},
      inventoryFullAt: null, klaCredit: 0, firstDropAt: null, itemsCreated: 0,
    },
  };
  lootDropOddsReset(sim);
  _initOrb(sim);
  _initZenith(sim);
}

// Performance-only: a scan that placed nothing for an item with dropAmount > 0
// proves no slot holds that type below maxCap and no slot is Blank/null, so
// every item of the same type and maxCap fails identically until the
// inventory (or slot count) changes; such attempts skip the rescan. The
// failure side effects (fullRetries, 20 ms/2 s timers, event) still run.
export function bumpInventoryVersion(sim) {
  if (sim.rewardsState) sim.rewardsState.invVersion++;
}

// Current inventory version. Direct writes that skip bumpInventoryVersion are
// detected by a fingerprint of the owned slots, recomputed at most once per
// engine step (or after an explicit bump).
function _inventoryVersion(sim, inv, slots) {
  const RS = sim.rewardsState;
  if (RS.fpAt !== sim.timeMs || RS.fpVer !== RS.invVersion || RS.fpInv !== inv || RS.fpSlots !== slots) {
    let fp = '';
    for (let i = 0; i < slots; i++) fp += inv.order[i] + '\u0001' + inv.quantity[i] + '\u0002';
    if (fp !== RS.fp || RS.fpInv !== inv) { RS.invVersion++; RS.fp = fp; }
    RS.fpAt = sim.timeMs; RS.fpVer = RS.invVersion; RS.fpInv = inv; RS.fpSlots = slots;
  }
  return RS.invVersion;
}

// Zenith Cluster forming (scene 5 s runPeriodically, src 99811). Outside towns
// (CurrentMap % 50 != 0) with OLA[487] == 1, every inventory statue stack of
// >= 1e6 drops floor(q/1e6) Quest110 at the player, then
// floor(randomFloat() + ZenithMarketBonus(3)/100) extra drops (each
// randomInt(0,4) itemN, itemM 5), then one randomFloat statue-EXP roll
// (ZenithAutoEXPchance; RoyalG fallthrough = 69%), and the stack becomes
// max(1, q mod 1e6). A successful roll adds the FULL pre-reduction stack times
// zenithStatueExpMulti[id] to StatueLevels[id][1], copied to every character
// when StatueG[id] >= 1. The cluster path has no StatueDouble vial roll.
function _initZenith(sim) {
  if (typeof sim.every !== 'function') return;
  sim.every(5e3, () => {
    const st = sim.state;
    if (sim.scene.map % 50 === 0 || N(st.ola?.[487]) !== 1) return;
    const inv = st.inventory;
    if (!inv?.order) return;
    const v = sim.inputs.values;
    const p = sim.player;
    const L = sim.rewardsState.ledger;
    for (let i = 0; i < inv.order.length; i++) {
      if (String(inv.order[i]).indexOf('EquipmentStatues') !== 0 || !(1e6 <= N(inv.quantity[i]))) continue;
      const node = N(p.node) | 0;
      dropSomething(sim, 'Quest110', Math.floor(N(inv.quantity[i]) / 1e6), 0, 0, 0, node, 0, _pxc(p) - 36, 'zenithCluster');
      const extra = Math.floor(sim.rng.randomFloat() + N(v.zenithMarket3) / 100);
      for (let s = 0; s < extra; s++) {
        const q = Math.floor(N(inv.quantity[i]) / 1e6);
        const o = sim.rng.randomInt(0, 4);
        dropSomething(sim, 'Quest110', q, 0, o, 5, node, 0, _pxc(p) - 36, 'zenithCluster');
      }
      if (sim.rng.randomFloat() < N(v.zenithAutoExpChance) / 100) {
        const qty = N(inv.quantity[i]);
        const id = N(ITEMS[inv.order[i]]?.ID) | 0;
        const multi = v.zenithStatueExpMulti?.[id];
        const gain = qty * (multi == null ? 1 : N(multi));
        const shared = N(v.statueTiers?.[id]) >= 1;
        L.zenithStatueExp = (L.zenithStatueExp || 0) + 1;
        L.zenithStatueExpGain = (L.zenithStatueExpGain || 0) + gain;
        const byS = L.zenithStatueExpByItem || (L.zenithStatueExpByItem = {});
        const row = byS[inv.order[i]] || (byS[inv.order[i]] = { procs: 0, exp: 0, statueQty: 0, shared });
        row.procs++; row.exp += gain; row.statueQty += qty;
        sim.emit('zenithStatueExp', { item: inv.order[i], statue: id, qty, exp: gain, shared, t: sim.timeMs });
      }
      inv.quantity[i] = Math.max(1, N(inv.quantity[i]) - 1e6 * Math.floor(N(inv.quantity[i]) / 1e6));
      bumpInventoryVersion(sim);
      L.zenithClusters = (L.zenithClusters || 0) + 1 + extra;
    }
  });
}

// ---------------------------------------------------------------------------
// Orb of Remembrance (talent 168) / Orb of Verisimilitude (talent 228).
// The kill counter is PixelHelperActor[8]._GenINFO[77] (sim.state.gi[77]); it
// is not saved. Cast (src 67496, emitted by the player module as 'orbReset'):
// gi77 = 0, DummyNumber2 = T168 + T228, buff 168 for round(DN2 + 12) s and an
// orb actor (anim 21 with T228 > 0, else 8). The actor fades after
// max(3, DN2 - 2) s (anim 21 then drops Orblets when gi77 >= 1000) and resets
// gi77 to 0 2050 ms later (src 89036/89223). Buff 168 outlives the actor, so
// kills keep accumulating into gi77 until the next cast; gi77 > 0 keeps
// multiplying EXP (src 63654) and selecting the gi77 drop branch (src 63684).
// ---------------------------------------------------------------------------
function _initOrb(sim) {
  sim.state.orb = { kills: N(sim.state.gi?.[77]), talentId: 168, active: false, castAt: null, fadeAt: null, resetAt: null,
    expMulti: 1 + N(sim.state.gi?.[77]) / 100, dropRolls: 1 + N(sim.state.gi?.[77]) / 100, casts: 0, orbletDrops: 0 };
  if (typeof sim.on === 'function') sim.on('orbReset', () => orbCast(sim));
}

export function syncOrb(sim) {
  const o = sim.state.orb;
  if (!o) return;
  const g = N(sim.state.gi?.[77]);
  o.kills = g;
  o.expMulti = 1 + g / 100;
  o.dropRolls = 1 + g / 100; // expected (1 + floor(rand + gi77/100)) drop-list multiplier
  o.buffActive = 0 < _buff(sim, 168);
}

// Orb actor lifecycle after the player module's cast handler zeroed gi77.
export function orbCast(sim) {
  const o = sim.state.orb || (_initOrb(sim), sim.state.orb);
  const t228 = _tn(sim, 1, 228);
  const dn2 = _tn(sim, 1, 168) + t228;
  const anim = 0 < t228 ? 21 : 8;
  o.talentId = anim === 21 ? 228 : 168;
  o.active = true;
  o.casts += 1;
  o.castAt = sim.timeMs;
  // Orb actor spawns at playerX + 8 (src 67496); orblets drop at its getXCenter (src 89227).
  o.castX = N(sim.player?.x) + 8;
  o.fadeAt = sim.timeMs + 1000 * Math.max(3, dn2 - 2);
  o.resetAt = o.fadeAt + 2050;
  o.buffSeconds = Math.round(_tn(sim, 1, 168) + (t228 + 12));
  syncOrb(sim);
  const castAt = o.castAt;
  sim.later(o.fadeAt - sim.timeMs, () => {
    if (anim === 21 && 1e3 <= N(sim.state.gi[77]) && 0.1 < _tn(sim, 1, 228)) {
      o.orbletDrops += 1;
      // Orblet drops (src 89224-89227) belong to combat-sim-special.js.
      if (sim.special?.orbletDrops) sim.special.orbletDrops(sim, { kills: N(sim.state.gi[77]), x: o.castX + bulletSize('WT21').width / 2 });
      else { sim.rng.randomFloat(); _unmodelled(sim, 'orbletDrops', Math.floor(N(sim.state.gi[77]) / 1e3)); }
    }
    sim.later(2050, () => {
      sim.state.gi[77] = 0;
      if (o.castAt === castAt) o.active = false;
      syncOrb(sim);
      sim.emit('orbFade', { t: sim.timeMs, castAt });
    });
  });
}

// ---------------------------------------------------------------------------
// LootDropOddsReset (src 74357-74382). Rebuilds both tables from pristine
// copies. Runs at scene start and when a card pickup leaves its count < 3.
// ---------------------------------------------------------------------------
export function lootDropOddsReset(sim) {
  const v = sim.inputs.values;
  const st = sim.state;
  const RS = sim.rewardsState;
  const cards0 = st.cards0 || {};
  // Source gate: `0 != Cards.length` (Cards is a 3+-element array once loaded).
  if (!st.cards0) return false;
  const md = RS.monsterDrops = _clone(MonsterDrops);
  const dt = RS.dropTables = _clone(DropTables);
  const bribeMul = 1 + (N(v.bribe1) + N(v.bribe8)) / 100;
  const ccm = N(v.cardChanceMulti);
  // Loose `0 == Cards[0][desc]`: a missing key is undefined and does not match.
  const unownedCard = (name) => {
    const desc = String(ITEMS[name]?.desc_line1 ?? '');
    return Object.prototype.hasOwnProperty.call(cards0, desc) && cards0[desc] == 0; // eslint-disable-line eqeqeq
  };
  for (const key of Object.keys(md)) {
    for (const l of md[key]) {
      const nm = String(l[0]);
      if (nm.indexOf('Stamp') !== -1) l[1] = N(l[1]) * bribeMul;
      else if (nm.indexOf('Cards') !== -1) {
        if (nm.indexOf('CardsZ') === -1 && unownedCard(nm)) l[1] = 5 * N(l[1]);
        l[1] = N(l[1]) * ccm;
      }
    }
  }
  if (N(v.kla100) < 1) {
    if (md.pincermin) md.pincermin.splice(md.pincermin.length - 1, 0, ['SmithingRecipes4', 3e-6, 53, 'N/A']);
    if (md.thermostat) md.thermostat.splice(md.thermostat.length - 1, 0, ['SmithingRecipes4', 8e-7, 54, 'N/A']);
  }
  const SM = v.skillLevelsMax || [];
  const anvil = v.anvilCraftStatus || [];
  const stampMax = v.stampLevelMax || [];
  const invUsed = v.invStorageUsed || {};
  // ba.remove while iterating with an index that has already advanced: the
  // element following a removed row is skipped.
  const removePass = (list, requireNA) => {
    for (let g = 0; g < list.length;) {
      const l = list[g]; ++g;
      const nm = String(l[0]);
      let rm = false;
      if (nm.indexOf('SmithingRecipes') !== -1) {
        const tab = Math.max(0, N(nm.replace('SmithingRecipes', '')) - 1) | 0;
        rm = 0 <= N(anvil[tab]?.[N(l[2]) | 0]);
      } else if (nm.indexOf('Stamp') !== -1) {
        const id = N(ITEMS[nm]?.ID);
        rm = (!requireNA || l[3] === 'N/A') && 0 < N(stampMax[Math.floor(id / 1e3)]?.[(id - 1e3 * Math.floor(id / 1e3)) | 0]);
      } else if (nm.indexOf('InvStorage') !== -1) {
        rm = Object.prototype.hasOwnProperty.call(invUsed, String(ITEMS[nm]?.ID));
      }
      if (rm) _baRemove(list, l);
    }
  };
  const removeBook = (list, test) => {
    for (let g = 0; g < list.length;) { const l = list[g]; ++g; if (test(l)) _baRemove(list, l); }
  };
  for (const key of Object.keys(md)) {
    removePass(md[key], true);
    if (key.indexOf('Crystal') !== -1) removeBook(md[key], (l) => l[0] === 'TalentBook1' && 2 < N(SM[618]));
    if (key === 'mushG' || key === 'frogG' || key === 'beanG' || key === 'slimeG' || key === 'snakeG') {
      removeBook(md[key], (l) => l[0] === 'TalentBook1' && 2 < N(SM[657]));
    }
  }
  for (const key of Object.keys(dt)) {
    const list = dt[key];
    if (key === 'SuperDropTable1') {
      removeBook(list, (l) => (l[0] === 'TalentBook1' && N(l[2]) === 3623100 ? 2 < N(SM[623])
        : l[0] === 'TalentBook1' && N(l[2]) === 362450 && 2 < N(SM[624])));
    }
    for (const l of list) {
      const nm = String(l[0]);
      if (nm.indexOf('Stamp') !== -1) l[1] = N(l[1]) * bribeMul;
      else if (nm.indexOf('Cards') !== -1 && nm.indexOf('CardsZ') === -1 && unownedCard(nm)) l[1] = 5 * N(l[1]);
    }
    removePass(list, false);
  }
  const obol = N(v.tasksObol);
  if (0 < obol) {
    const m = 1 + obol / 20;
    for (let e = 0; e < 12; e++) {
      let row;
      if (e < 4) row = ['ObolBronze' + e, 0.0011 * m];
      else if (e < 8) row = ['ObolSilver' + Math.round(e - 4), 7e-4 * m];
      else if (e === 8) row = ['ObolSilverMoney', 0.03 * m];
      else if (e === 9) row = ['ObolSilverDamage', 0.031 * m];
      else if (e === 10) row = ['ObolGold3', 0.015 * m];
      else row = ['ObolSilverLuck', 0.025 * m];
      row.push(1, 'N/A');
      // Silver rows insert into DropTable(e+1) at DropTable(e+2).length-1.
      if (e < 4) _spliceAt(dt['DropTable' + (e + 1)], dt['DropTable' + (e + 1)]?.length - 1, row);
      else if (e < 8) _spliceAt(dt['DropTable' + (e + 1)], dt['DropTable' + (e + 2)]?.length - 1, row);
      else if (e < 10) _spliceAt(dt.SuperDropTable1, dt.SuperDropTable1?.length - 1, row);
      else _spliceAt(dt.SuperDropTable2, dt.SuperDropTable2?.length - 1, row);
    }
    for (let e = 0; e < 6; e++) {
      const name = e === 4 ? 'ObolBronzeKill' : e === 3 ? 'ObolBronzeEXP' : e === 0 ? 'ObolBronzeWorship' : e === 5 ? 'ObolBronzeDef' : e === 1 ? 'ObolBronzeTrapping' : 'ObolBronzeCons';
      const row = [name, (e < 3 ? 9e-4 : 0.029) * m, 1, 'N/A'];
      if (e < 3) _spliceAt(dt['DropTable' + (e + 14)], dt['DropTable' + (e + 14)]?.length - 1, row);
      else if (e === 4) _spliceAt(dt.SuperDropTable3, dt.SuperDropTable3?.length - 1, row);
      else if (e === 3) _spliceAt(dt.SuperDropTable1, dt.SuperDropTable1?.length - 1, row);
      else _spliceAt(dt.SuperDropTable2, dt.SuperDropTable2?.length - 1, row);
    }
  }
  if (N(v.emporium4) === 1) {
    const nj = v.ninja106 || [];
    for (let e = 0; e < 15; e++) {
      if (!nj.includes('NjItem' + e)) continue;
      const row = ['EquipmentHats' + Math.round(90 + e), e === 14 ? 4e-7 : 5e-7 * Math.pow(0.68, e), 1, 'N/A'];
      const mob = String(RANDOlist[98]?.[e]);
      _spliceAt(md[mob], md[mob]?.length - 1, row);
    }
  }
  RS.ldorRuns++;
  sim.emit('lootReset', { runs: RS.ldorRuns, t: sim.timeMs });
  return true;
}

function _baRemove(list, item) { const i = list.indexOf(item); if (i >= 0) list.splice(i, 1); }
function _spliceAt(list, idx, row) { if (Array.isArray(list)) list.splice(Number.isFinite(idx) ? idx : list.length, 0, row); }

// ---------------------------------------------------------------------------
// DropOdds(e, t) (src 66955). Always consumes exactly one randomFloat.
// ---------------------------------------------------------------------------
export function dropOdds(rng, e, t, DR) {
  const f = rng.randomFloat();
  const p = t * DR;
  if (2 < p * e) return Math.round(p * e);
  if (f < Math.pow(1 - p, e)) return 0;
  if (f < p * Math.pow(1 - p, e - 1) * e + Math.pow(1 - p, e)) return 1;
  return 2;
}

// ---------------------------------------------------------------------------
// GenerateMonsterDrops(e, table) (src 66420)
// ---------------------------------------------------------------------------
export function generateMonsterDrops(sim, e, tableName) {
  const v = sim.inputs.values;
  const rng = sim.rng;
  const RS = sim.rewardsState;
  const DR = N(v.dropRate);
  const qc = sim.state.questComplete || {};
  const pass = (row) => row[3] === 'N/A' || qc[String(row[3])] == 0; // eslint-disable-line eqeqeq
  const DO = (n, p) => dropOdds(rng, n, p, DR);
  const DL = [];
  let DN2 = 0;
  const merge = (DL2, coinTop) => {
    for (const l of DL) {
      if (DL2[0] === l[0]) {
        if (!_isRecipe(String(l[0]))) l[1] = coinTop && l[0] === 'COIN' ? N(DL2[1]) + N(l[1]) : Math.round(N(DL2[1]) + N(l[1]));
        DL2[1] = -1;
      }
    }
    if (DL2[1] !== -1) DL.push(DL2);
  };
  const rows = RS.monsterDrops[tableName];
  if (!Array.isArray(rows)) return DL;
  const t29 = N(v.talent29);
  for (const row of rows) {
    const nm = String(row[0]);
    if (!pass(row)) continue;
    let n;
    if (_isRecipe(nm)) n = Math.floor(Math.min(DO(e, N(row[1])), 1));
    else if (_isGem(nm)) n = rng.randomFloat() < N(row[1]) * Math.pow(DR, 0.2) ? 1.271001 : 0;
    else n = DO(e, N(row[1]));
    if (n === 0) continue;
    let DL2 = [row[0], Math.round(N(row[2]) * n)];
    if (1e9 < N(row[2]) * n) DL2[1] = N(row[2]) * n;
    if (n === 1.271001) DL2[1] = Math.floor(Math.max(1, rng.randomFloatBetween(-0.55, 1.35 * N(row[2]))));
    if (nm.indexOf('DropTable') !== -1) {
      DN2 = DL2[1];
      const t2 = RS.dropTables[nm] || [];
      for (const s of t2) {
        if (!pass(s)) continue;
        const sn = String(s[0]);
        let m;
        if (_isRecipe(sn)) m = Math.floor(Math.min(DO(N(DN2), N(s[1]) / Math.max(DR, 1)), 1));
        else if (_isGem(sn)) m = rng.randomFloat() < N(s[1]) * Math.pow(DR, 0.35) ? Math.floor(Math.min(1, DO(N(DN2), N(s[1]) / Math.max(DR, 1)))) : 0;
        else m = DO(N(DN2), (N(s[1]) * (1 + t29 / 100)) / Math.max(DR, 1));
        if (m === 0) continue;
        // Quantity uses the TOP-LEVEL n (MonsterDropDN was overwritten by m,
        // but the source multiplies by the current MonsterDropDN = m).
        DL2 = [s[0], Math.round(N(s[2]) * m)];
        if (sn.indexOf('DropTable') !== -1) {
          DN2 = DL2[1]; // persists for the remaining L2 rows
          const t3 = RS.dropTables[sn] || [];
          for (const u of t3) {
            if (!pass(u)) continue;
            const un = String(u[0]);
            let k;
            if (_isRecipe(un)) k = Math.floor(Math.min(DO(N(DN2), N(u[1]) / Math.max(DR, 1)), 1));
            else if (_isGem(un)) k = Math.floor(Math.min(1, DO(N(DN2), N(u[1]) / Math.max(DR, 1))));
            else k = DO(N(DN2), N(u[1]) / Math.max(DR, 1));
            if (k === 0) continue;
            merge([u[0], Math.round(N(u[2]) * k)], false);
          }
        } else merge(DL2, false);
      }
    } else {
      if (nm === 'COIN') DL2[1] = Math.ceil(N(DL2[1]) * (rng.randomFloat() + 0.5) * N(v.monsterCash));
      merge(DL2, true);
    }
  }
  for (const d of DL) {
    if (d[0] === 'COIN') d[1] = N(d[1]) + 0.01;
    else if (-10 > N(d[1])) d[1] = 1e9;
  }
  const slots = N(v.filterSlots) | 0;
  const filt = v.printerFilter || [];
  const len0 = DL.length;
  for (let r = 0; r < len0; r++) {
    const idx = len0 - (1 + r);
    const name = DL[idx]?.[0];
    for (let k = 0; k < slots; k++) {
      if (name === filt[k]) { DL.splice(idx, 1); break; }
    }
  }
  return DL.filter((d) => d);
}

// ---------------------------------------------------------------------------
// Kill middle — called by combat-sim-world _killHandler inside the reward gate.
// ---------------------------------------------------------------------------
export function onKill(sim, mon) {
  const v = sim.inputs.values;
  const st = sim.state;
  const rng = sim.rng;
  const W = sim.world;
  const def = W.getDef(sim, mon.type) || {};
  const map = sim.scene.map;
  const node = sim.scene.nodes[mon.node];
  const L = sim.rewardsState.ledger;
  if (mon.hp !== -69.42 && mon.hp !== -69.42069 && mon.type === 'rockS') {
    for (let i = 0; i < 5; i++) W.createMonster(sim, 'skele', mon.node, mon.x);
  }
  updateFormState(sim);
  const dx = mon.x + mon.offX - 18;
  if (mon.type === 'reindeer' && 0.01 <= _buff(sim, 423)) {
    // 8 copies of GenINFO[85] (last wormhole/reindeer type) around the corpse.
    st.gi[132] = N(st.gi[132]) + 1;
    st.gi[133] = 1;
    for (let s = 0; s < 8; s++) {
      const x = Math.max(N(node.x) + 25, Math.min(N(node.length) - 25, mon.x + mon.width / 2 + rng.randomInt(-200, 200)));
      const t = String(st.gi[85] ?? '');
      if (W.getDef(sim, t)) W.createMonster(sim, t, mon.node, x);
    }
  }
  if (mon.type.indexOf('Crystal') === 0 && rng.randomFloat() < N(v.chipCrys) / 100) {
    W.createMonster(sim, mon.type, mon.node, rng.randomInt(node.x | 0, node.length | 0));
    sim.emit('crystalRespawn', { from: mon.uid, type: mon.type, t: sim.timeMs }); // Chocolatey Chip (src 63654)
  }
  // Event gate (src 63655): box roll, then the always-on event quest items.
  const lv = N(v.level);
  const ola = st.ola;
  if ((map < 20 || map > 23) && !mon.worship && String(v.eventStatus) === 'On' && lv > 12 && N(ola[29]) < 50) {
    if (rng.randomInt(1, Math.max(3, 3 + Math.round(2 * Math.floor(lv / 25) + 20 * Math.floor(lv / 300))) | 0) === 1) {
      dropSomething(sim, EVENT_BOX_DROP, 1, 0, 0, 0, mon.node, 0, dx, 'eventBox');
      ola[29] = Math.round(N(ola[29]) + 1);
      if (N(ola[29]) === 50) ola[325] = Math.round(N(ola[325]) + 1);
    }
    const inv = st.inventory?.order || [];
    if (!inv.includes('Quest111')) dropSomething(sim, 'Quest111', 1, 0, 0, 0, mon.node, 0, dx, 'event');
    if (!inv.includes('Quest114')) dropSomething(sim, 'Quest114', 1, 0, 0, 0, mon.node, 0, dx, 'event');
    if (!(inv.includes('Quest119') && N(ola[615]) !== 0)) {
      dropSomething(sim, 'Quest119', 1, 0, 0, 0, mon.node, 0, dx, 'event');
      ola[615] = 1;
    }
  }
  // EXP (dummyDamageDealt chain).
  let exp = N(def.ExpGiven) * N(v.expMulti);
  exp = exp * (1 + (N(v.fam40) + (N(v.card20) + N(v.vault39))) / 100);
  exp = exp * (1 + (N(v.expActive) + N(v.shrine6)) / 100);
  exp = exp * (1 + N(st.gi[77]) / 100);
  const has = (s) => mon.statusList.some((x) => x.name === s);
  if (has('StatusExp')) exp *= 1.25;
  if (has('StatusPtyMob')) exp *= 3;
  if (has('StatusPlunder')) exp *= 1 + N(v.talent318_2) / 100;
  if (has('StatusWormhole')) {
    // ActionBlock("WormholeMob", type, 1): GenINFO[84]++ and [85] = type.
    W.wormholeMob(sim, mon.type, 1);
    st.gi[83] = N(st.gi[83]) + 1;
    exp *= 1 + (N(v.talent498_1) * st.gi[83]) / 100;
  }
  // src 63662: 1 != IsWorshipMob && -1 == Dungon() && 0 == NONdummies[46] && -1 == GenINFO[8].
  const nonDungeon = true;
  if (N(mon.worship) !== 1 && nonDungeon && st.nd46 === 0 && st.gi7_8 === -1) {
    L.expTotal += exp;
    L.expByType[mon.type] = (L.expByType[mon.type] || 0) + exp;
    sim.emit('exp', { amount: exp, type: mon.type, uid: mon.uid, t: sim.timeMs });
    if (def.Type === 'Monster') {
      st.nd3 = N(st.nd3) + 1;
      if (st.nd3 >= 4 && N(v.talent468Level) > 0) {
        st.nd3 = 0;
        _addBuff(sim, 468, _tn(sim, 2, 468));
        L.buff468 = (L.buff468 || 0) + 1;
      }
      monsterKill(sim, mon);
    }
    if (1 <= N(v.ringDrop) && rng.randomInt(1, 1e6) === 69) {
      dropSomething(sim, 'EquipmentRings15', 1, 0, 0, 0, mon.node, 0, dx, 'ring');
    }
    const sm = v.skillLevelsMax || [];
    const book = (task, a, b) => {
      if (0 < N(task) && (100 > N(sm[a]) || 100 > N(sm[b])) && 0.1 * (1 + (30 * N(task)) / 100) > rng.randomFloat()) {
        const id = 0.5 < rng.randomFloat() ? a : b;
        // src 63662: "3628" + 4*randomInt(5,25); the leading 3 is the talent-ID field width.
        dropSomething(sim, 'TalentBook1', N('3' + String(id) + 4 * rng.randomInt(5, 25)), 1, 0, 0, mon.node, 0, dx, 'talentBook');
      }
    };
    if (mon.type === 'babayaga' || mon.type === 'poopBig') book(v.tasks2_0_6, 628, 629);
    if (mon.type === 'babaHour' || mon.type === 'babaMummy') {
      if (mon.type === 'babaMummy' && !(st.inventory?.order || []).includes('Quest56')) dropSomething(sim, 'Quest56', 1, 0, 0, 0, mon.node, 0, dx, 'special');
      book(v.tasks2_1_6, 631, 632);
    }
    // GenINFO[74] is never set to 1 in the current source: BossKilledNice is unreachable.
    if (N(st.gi[74]) === 1 && (RANDOlist[81] || []).includes(mon.type)) _unmodelled(sim, 'bossKilledNice', mon.type);
    sim.later(250, () => dropBranch(sim, mon), mon);
  }
}

// ---------------------------------------------------------------------------
// MonsterKill (src 67147)
// ---------------------------------------------------------------------------
export function monsterKill(sim, mon) {
  const v = sim.inputs.values;
  const st = sim.state;
  const rng = sim.rng;
  const W = sim.world;
  const RS = sim.rewardsState;
  const L = RS.ledger;
  const map = sim.scene.map;
  const node = sim.scene.nodes[mon.node];
  const ola = st.ola;
  const has = (s) => mon.statusList.some((x) => x.name === s);
  const dx = mon.x + mon.offX - 18;
  // AFKcode("Forge", T280_2) / AFKcode("Pets", 3): instant AFK-gain grants.
  if (N(v.talent280_1) / 100 > rng.randomFloat()) { L.afkForge = (L.afkForge || 0) + 1; L.afkForgeHours = (L.afkForgeHours || 0) + _tn(sim, 2, 280); }
  if (0.5 < N(v.talent362_1) && 0.5 < N(v.talentEnh362) && 0.5 > rng.randomFloat()) { L.afkPets = (L.afkPets || 0) + 1; L.afkPetsHours = (L.afkPetsHours || 0) + 3; }
  if (0 < _buff(sim, 490)) {
    const add = N(v.talent490_1) * (1 + N(v.alchemyActive) / 100);
    st.generalInfo19 = N(st.generalInfo19) + add;
    L.afkCauldron = (L.afkCauldron || 0) + add;
  }
  if (0 < _buff(sim, 585) && st.arcanist === 1) {
    const mb = st.mapBon?.[map];
    for (let i = 0; i < 3; i++) {
      if (has('StatusArc' + i) && Array.isArray(mb) && 3 <= mb.length) mb[i] = N(mb[i]) + 1;
    }
    if (rng.randomFloat() < prismaBubDropChance(v, ola[395], st.gi26[43], map)) {
      st.gi26[43] = Math.round(N(st.gi26[43]) + 1);
      dropSomething(sim, 'Quest99', 1, 0, 0, 0, mon.node, 0, dx, 'prismaBubble');
    }
  }
  if (0 < _buff(sim, 168) && !GI77_EXCLUDED.includes(mon.type) && has('StatusRoyal')) {
    st.gi[77] = Math.floor(N(st.gi[77]) + Math.min(2, 1 + (N(v.grid191) / 100 + rng.randomFloat())));
    ola[138] = N(ola[138]) + 1;
    syncOrb(sim);
  }
  sim.special?.monsterKillPre?.(sim, mon); // src 67155-67168 rift/cave branch — combat-sim-special.js hook
  if (!(NonAFKmonsters || []).includes(mon.type) && mon.temp === 0 && N(v.level) > 19) {
    const cap = N(v.crystalSpawnCap);
    if (Math.min(cap, N(v.crystalSpawnRaw)) > rng.randomFloat() || N(ola[101]) < N(v.guaranteedCrystalMobs)) {
      const cls = N(v.charClass);
      if (st.wraith === 0 && st.tempest === 0 && st.arcanist === 0 && !((cls === 4 || cls === 5) && _buff(sim, 45) > 0)
        && st.crystalLock === 0 && mon.type !== 'caveD' && mon.type !== 'fm_rat') {
        st.crystalLock = 1;
        if (map < 350 && map !== 166 && map !== 306) {
          ola[101] = N(ola[101]) + 1;
          const cN = 'Crystal' + Math.floor(map / 50);
          const killedDef = W.getDef(sim, mon.type);
          if (RS.monsterDrops[cN]?.[0] && RS.monsterDrops[mon.type]?.[0]) {
            RS.monsterDrops[cN][0][2] = 100 * N(RS.monsterDrops[mon.type][0][2]);
          }
          const cDef = W.getDef(sim, cN);
          if (cDef && killedDef) {
            cDef.MonsterHPTotal = 15 * N(killedDef.MonsterHPTotal);
            cDef.ExpGiven = 30 * N(v.crystalEmbiggener) * N(killedDef.ExpGiven);
            cDef.Defence = 2.5 * N(killedDef.Defence);
            if (Array.isArray(cDef.Damages)) cDef.Damages[0] = 2.5 * N(killedDef.Damages?.[0]);
          }
          W.createMonster(sim, cN, mon.node, rng.randomInt(node.x | 0, node.length | 0) + 50);
          sim.emit('crystalSpawn', { from: mon.uid, type: cN, t: sim.timeMs });
        }
      }
    } else if (N(v.giantMob) > rng.randomFloat() && map !== 166 && map !== 43 && map !== 216 && map !== 306) {
      if (rng.randomFloat() >= N(v.giantsActive) / 100) ola[57] = 1 + N(ola[57]);
      W.createMonster(sim, mon.type, mon.node, rng.randomInt(node.x | 0, node.length | 0) + 50, 'BigBadGiantMonster');
      sim.emit('giantSpawn', { from: mon.uid, type: mon.type, t: sim.timeMs });
    }
    if (0 < _buff(sim, 318) && map !== 306) {
      const enh = N(v.talentEnh318);
      if (rng.randomFloat() < 0.02 + 0.02 * enh || 39 < N(st.gi[80]) || (enh === 1 && 100 <= N(st.gi[79]))) {
        if (100 <= N(st.gi[79]) && enh === 1) st.gi[79] = N(st.gi[79]) - 25;
        st.gi[80] = 0;
        const pm = W.createMonster(sim, mon.type, mon.node, mon.x + mon.width / 2, 'PiratePlunderMonster');
        if (pm) W.addStatusToMonster(sim, pm, 'StatusPlunder', 36e5);
      } else if (N(st.gi[79]) === 0) st.gi[80] = N(st.gi[80]) + 1;
    }
  }
  st.generalInfo9 = N(st.generalInfo9) + 1;
  const kpk = killCreditPerKill(sim);
  if (mon.temp === 0 && N(v.defaultExpType) === 0) {
    const credit = (1 + N(v.vault43) / 100) * kpk;
    _klaDecrement(st.kla, credit);
    L.klaCredit += credit;
  }
  // StatusPtyMob credit is gated only by DefaultExpType (not by TempMonster).
  if (has('StatusPtyMob') && N(v.defaultExpType) === 0) {
    const c2 = 5 * kpk;
    _klaDecrement(st.kla, c2);
    L.klaCredit += c2;
  }
  killedMonsterType(sim, mon);
  _monsterKillTail(sim, mon, dx);
  L.kills++;
  L.killsByType[mon.type] = (L.killsByType[mon.type] || 0) + 1;
}

// KillsLeft2Advance[map][i] -= credit. Saved rows may be [n] or n.
function _klaDecrement(kla, credit) {
  if (!Array.isArray(kla)) return;
  for (let i = 0; i < kla.length; i++) {
    const cur = Array.isArray(kla[i]) ? N(kla[i][0]) : N(kla[i]);
    kla[i] = cur - credit;
  }
}

// KilledMonsterType (src 67191): RNG-consuming and stat-relevant parts, in
// source order. Quest/achievement counters without RNG are not tracked.
export function killedMonsterType(sim, mon) {
  const v = sim.inputs.values;
  const st = sim.state;
  const rng = sim.rng;
  const qc = st.questComplete || {};
  const type = mon.type;
  const p = sim.player;
  // killmonsterQuest(type, 1) (src 67211 → 67221). caveD (OLA[668]) is
  // credited by the special module; caveB/caveC add one quest kill here,
  // before MonsterKill's separate KillPerKill-scaled counters.
  if (type === 'caveB' || type === 'caveC') {
    const h = st.holes11 || (st.holes11 = {});
    if (type === 'caveB') {
      h[27] = N(h[27]) + 1 * N(v.xtraMushKillz);
      h[28] = N(h[28]) + 1 * N(v.xtraMushKillz);
    } else h[63] = N(h[63]) + 1;
  }
  if (N(p.hp) > 0.01 && N(v.talent627_1) > 0) p.hp = Math.min(N(p.hpMax), N(p.hp) + (N(v.talent627_1) / 100) * N(p.hpMax));
  if (type === 'pincermin' && N(qc.Walupiggy4) === 0) rng.randomInt(1, 26);
  if (type === 'w5c2' && sim.scene.name === 'wLavaC2') rng.randomInt(1, 3);
  if (type === 'potato' && N(qc.Walupiggy4) === 0) rng.randomInt(1, 80);
  // Royal_Worm9 complete: the Crystal3 quest-counter branch no longer
  // pre-empts this Crystal roll.
  if (N(qc.Royal_Worm9) !== 0 && type.indexOf('Crystal') !== -1 && N(v.talent41_2) > 1) rng.randomInt(1, 9);
  if (0 < _buff(sim, 168) && !GI77_EXCLUDED.includes(type)) {
    // Breeding("crystalmob_DropMulti") src 80222 is a prefix test: 0 == indexOf("Crystal").
    const dm = type.indexOf('Crystal') === 0 ? N(v.crystalEmbiggener) : 1;
    st.gi[77] = Math.floor(N(st.gi[77]) + (dm + rng.randomFloat()));
    st.ola[138] = N(st.ola[138]) + 1;
    syncOrb(sim);
  }
  if (type === (RANDOlist[104] || [])[N(st.ola[336]) | 0]) st.gi[129] = N(st.gi[129]) - 1;
  if (type === (st.afkTarget ?? v.afkTarget)) st.gi141 = N(st.gi141) - 1;
  st.gi41 = N(st.gi41) + 1;
  const row = st.royalMapRow;
  if (N(v.royalKingdomEnabled) === 1 && N(v.royalHasOutpost) === 1 && Math.floor(sim.scene.map / 50) < N(v.royalMapWorldsUnlocked)
    && Array.isArray(row) && 0 < row.length && 2 > row.length) {
    row[0] = N(row[0]) + N(v.royalActiveKillClear);
  }
}

// Remainder of MonsterKill after KilledMonsterType (src 67168-67189), in order.
function _monsterKillTail(sim, mon, dx) {
  const v = sim.inputs.values;
  const st = sim.state;
  const rng = sim.rng;
  const qc = st.questComplete || {};
  const type = mon.type;
  const map = sim.scene.map;
  const L = sim.rewardsState.ledger;
  const drop = (name, qty, dn2 = 0) => dropSomething(sim, name, qty, dn2, 0, 0, mon.node, 0, dx, 'special');
  // caveB / caveC cavern kill counters (Holes[11][27/28/63]).
  if (type === 'caveB' || type === 'caveC') {
    const c = overkillState(sim).killPerKill + N(v.multiKillPlay) / 100;
    const h = st.holes11 || (st.holes11 = {});
    if (type === 'caveB') {
      const add = c * N(v.xtraMushKillz);
      h[27] = N(h[27]) + add; h[28] = N(h[28]) + add;
    } else h[63] = N(h[63]) + c;
  }
  if (type === 'mimicA' && N(v.npcBanditBob) > 17 && rng.randomInt(1, 100) === 1) drop('Quest45', 1);
  if (type === 'mushP' && rng.randomInt(1, 50) === 1) drop('OilBarrel2', 1);
  if (type === 'fm_rat') {
    if (N(v.charClass) === 16) {
      if (rng.randomFloat() < N(v.parchmentDrop)) drop('RGenh', Math.floor(1 + N(v.parchmentDouble)));
    } else drop('RGenhB', 1);
  }
  const rg = st.royalG;
  if (N(v.charClass) === 16 && type.indexOf('Crystal') === -1 && 1 <= N(rg?.[2]?.[41]) && N(rg?.[3]?.[1]) === 0
    && Array.isArray(st.royalMapRow) && 2 < st.royalMapRow.length
    && rng.randomFloat() < N(v.marbleDrop) * Math.max(1, 100 - N(rg[3][5]))) {
    rg[3][5] = N(rg[3][5]) + 1;
    drop('RGshard' + Math.floor(map / 50), 1);
  }
  if (type === 'penguin') {
    if (N(qc.Yondergreen4) === 0 && rng.randomInt(1, 120) === 1) drop('Quest62', 1);
  }
  if (N(qc.Picnic_Stowaway7) === 0 && map === 24) {
    // jarSand Quest10 item: no RNG; created via the item actor directly.
    if (type === 'jarSand') drop('Quest10', 1);
  } else if (type === 'ChestB1') {
    if (N(v.anvilCraftStatus?.[0]?.[38]) === -1) drop('SmithingRecipes1', 0, 38);
  } else if (map === 72) {
    if (N(st.nd58) === 2 && 2 < N(mon.sizeMulti) && type.length === 8 && type.indexOf('Crystal') !== -1) {
      const name = 0.01 > rng.randomFloat() ? 'Timecandy5' : 0.03 > rng.randomFloat() ? 'Timecandy4'
        : 0.08 > rng.randomFloat() ? 'Timecandy3' : 0.25 > rng.randomFloat() ? 'Timecandy2' : 'Timecandy1';
      drop(name, 1);
    }
  }
  const nk = (NinjaInfo[30] || []).indexOf(type);
  if (String(sim.scene.name || '').indexOf('Tutorial') === -1 && 0.5 <= N(v.emporium7) && nk !== -1) {
    const n105 = st.ninja105 || (st.ninja105 = []);
    const add = Math.floor(N(mon.persNum) + 1);
    n105[nk] = N(n105[nk]) + add;
    L.emporiumKills = N(L.emporiumKills) + add;
  }
}

// ---------------------------------------------------------------------------
// runLater(250) drop branch (src ~63700). Exactly one roll-count branch.
// ---------------------------------------------------------------------------
export function dropBranch(sim, mon) {
  const v = sim.inputs.values;
  const st = sim.state;
  const rng = sim.rng;
  const W = sim.world;
  const RS = sim.rewardsState;
  const L = RS.ledger;
  const def = W.getDef(sim, mon.type) || {};
  const map = sim.scene.map;
  const type = mon.type;
  const cmDM = type.indexOf('Crystal') === 0 ? N(v.crystalEmbiggener) : 1;
  const gmd = (e, tbl = type) => generateMonsterDrops(sim, e, tbl);
  let DL;
  let branch;
  if (def.Type === 'Monster') {
    if (mon.persNum === 177) {
      branch = 'wormhole';
      DL = gmd(Math.round(1 + Math.floor((N(v.talent498_1) * N(st.gi[83])) / 100)));
      st.ola[152] = N(st.ola[152]) + 1;
    } else if (mon.sizeMulti === 5) {
      branch = 'giant';
      DL = gmd(250);
      if (0.15 > rng.randomFloat()) for (const d of gmd(1, 'GiantMobzz69')) DL.push(d);
      for (const d of gmd(1, 'GiantMobzz69')) DL.push(d);
      if (rng.randomFloat() < N(v.prayer18) / 100) {
        const cN = 'Crystal' + Math.floor(map / 50);
        W.createMonster(sim, cN, mon.node, mon.x + rng.randomInt(-70, 70));
        W.createMonster(sim, cN, mon.node, mon.x + rng.randomInt(-70, 70));
      }
      st.ola[216] = N(st.ola[216]) + 1;
      if (N(st.ola[216]) > N(st.ola[217])) st.ola[217] = st.ola[216];
    } else if (mon.sizeMulti === 8) {
      branch = 'superGiant';
      DL = gmd(2000);
    } else if (type !== 'mini4a' && type !== 'mini3a' && type !== 'babaMummy' && type !== 'babaHour' && _buff(sim, 19) > rng.randomFloatBetween(0.05, 100)) {
      branch = 'buff19';
      DL = gmd(2);
    } else if ((sim.scene.name.indexOf('Colosseum') === -1 || 200 > map) && 0 < N(st.gi[77])) {
      branch = 'gi77';
      DL = gmd(Math.round((1 + Math.floor(rng.randomFloat() + N(st.gi[77]) / 100)) * cmDM));
    } else if (mon.persNum === 176) {
      branch = 'plunder';
      DL = gmd(Math.round((1 + Math.floor(rng.randomFloat() + N(v.talent318_2) / 100)) * cmDM));
      st.ola[139] = N(st.ola[139]) + 1;
      if (0.5 < N(v.talent319_1)) {
        _addBuff(sim, 319, v.talent319_1); // AddBuffType(319, GetTalentNumber(1,319)) before randomInt(3,8)
        const cnt = rng.randomInt(3, 8);
        for (let i = 0; i < cnt; i++) dropSomething(sim, 'Quest51', 1, 0, i, cnt, mon.node, 0, mon.x + mon.offX - 18, 'plunderQuest51');
      }
    } else {
      branch = 'normal';
      DL = gmd(Math.round(cmDM));
      if (0 < _buff(sim, 319)) {
        dropSomething(sim, 'Quest51', 1, 0, rng.randomInt(2, 4), 5, mon.node, 0, mon.x + mon.offX - 18, 'buff319');
        if (rng.randomInt(1, 4) === 1) dropSomething(sim, 'Quest51', 1, 0, rng.randomInt(0, 2), 5, mon.node, 0, mon.x + mon.offX - 18, 'buff319');
      }
      if (sim.special?.formDrops) sim.special.formDrops(sim, mon); // src 63689-63705 Wraith/Tempest/Arcanist — combat-sim-special.js hook
      else {
        if (0 < _buff(sim, 195) && st.wraith === 1) _unmodelled(sim, 'wraithBones', type);
        if (0 < _buff(sim, 420) && st.tempest === 1) _unmodelled(sim, 'tempestDust', type);
        if (0 < _buff(sim, 585) && st.arcanist === 1) _unmodelled(sim, 'arcanistDrops', type);
      }
    }
  } else {
    branch = 'nonMonster';
    DL = [];
  }
  if (type === 'caveD' && !(mon.node !== 3 && N(sim.inputs.values.holeCavern ?? sim.saveData?.holesData?.[0]?.[sim.charIdx]) === 17)) DL = [];
  const src = _ledgerSource(L, branch);
  src.rolls++;
  for (let i = 0; i < DL.length; i++) {
    const name = String(DL[i][0]);
    let DN = N(DL[i][1]);
    if (name.indexOf('SmithingRecipes') !== -1) {
      RS.dn2 = DN;
      DN = N(name.replace('SmithingRecipes', ''));
    } else if (name.indexOf('TalentBook') !== -1) {
      const dec = _decodeTalentBook(DN);
      RS.dn2 = dec.dn2; DN = dec.dn;
    } else if (ITEMS[name]?.Type === 'MONSTER_DROP' && overkillState(sim).active === 1) {
      const rows = RS.monsterDrops[type] || [];
      for (let s = 0; s < 4; s++) {
        const r = rows[s];
        if (r && r[3] === 'N/A' && r[0] !== 'COIN' && String(r[0]).indexOf('Cards') === -1) { RS.sampleDT = r[0]; break; }
      }
      if (name === RS.sampleDT) DN = Math.ceil(DN * Math.max(1, 1 + overkillState(sim).multiKillTotal / 100));
    }
    const node = sim.scene.nodes[mon.node];
    _createItem(sim, {
      name, amount: DN, dn2: RS.dn2, itemN: i, itemM: DL.length - 1, node: mon.node, spawnDelay: 0,
      x: mon.x + mon.offX - 18, y: N(node?.y) - 36, source: branch, killedType: type,
    });
  }
  sim.emit('dropRoll', { branch, type, uid: mon.uid, count: DL.length, t: sim.timeMs });
}

function _decodeTalentBook(dn) {
  const s = String(dn);
  const k = N(s.charAt(0));
  return { dn2: N(s.substring((k + 1) | 0, s.length + 1)), dn: N(TalentOrder[N(s.substring(1, (k + 1) | 0)) | 0]) };
}

// DropSomething(name, qty, dn2, itemN, itemM, node, spawnDelay, x, node) (src 69278).
export function dropSomething(sim, name, qty, dn2, itemN, itemM, node, spawnDelay, x, source = 'dropSomething') {
  let amount = qty > 2e9 && /^(Bone|Dust|Tach)/.test(name) && name.length === 5 ? qty : Math.round(Math.min(2e9, qty));
  let d2 = dn2;
  if (name.indexOf('TalentBook') !== -1) { const dec = _decodeTalentBook(amount); d2 = dec.dn2; amount = dec.dn; }
  const nd = sim.scene.nodes[node];
  return _createItem(sim, { name, amount, dn2: d2, itemN, itemM, node, spawnDelay, x, y: N(nd?.y) - 36, source });
}

// ---------------------------------------------------------------------------
// ItemDrop actor (ActorEvents_44 init, src 82110)
// ---------------------------------------------------------------------------
function _createItem(sim, o) {
  const v = sim.inputs.values;
  const st = sim.state;
  const rng = sim.rng;
  const RS = sim.rewardsState;
  const L = RS.ledger;
  const def = ITEMS[o.name];
  const item = new SimItem(sim, o);
  sim.addActor(item);
  sim.items.push(item);
  // Event registration order (AE44): 500 ms auto loot, 15 s quest pickup,
  // 30 s no-op, then init body, then the later periodic handlers.
  item._alT = sim.every(500, (task) => {
    if (_autoLootGate(sim, item)) { item.autoLooted = 1; tryPickup(sim, item, { autoLoot: true }); }
    if (item._cs !== 0 && item.autoLooted === 1) { sim.sched.park(task); item._pk |= 4; }
  }, item);
  sim.later(15e3, () => {
    const t = item.dropType;
    if (t === 'Quest79' || t === 'Quest49' || t === 'Quest39' || t === 'Quest51') { item.autoLooted = 1; tryPickup(sim, item, { autoLoot: true }); }
  }, item);
  // "Found items" list (Cards[1]).
  const c1 = st.cards1 || (st.cards1 = []);
  if (o.name !== 'COIN' && !c1.includes(o.name) && o.name.indexOf('Cards') !== 0 && o.name.indexOf('Replica') === -1
    && !(RANDOlist[103] || []).includes(o.name)) {
    c1.push(o.name);
    sim.emit('newItemFound', { name: o.name, t: sim.timeMs });
  }
  item.maxCap = def ? maxCapacityFor(v, def.typeGen) : 1;
  // src 82573: recipe/book state keys on the drop name, not typeGen.
  if (_isRecipe(o.name)) {
    item.recipeTab = o.name.indexOf('SmithingRecipes') !== -1 ? Math.round(N(o.name.replace('SmithingRecipes', '')) - 1) : N(o.amount);
    item.recipeItem = o.dn2; item.dropAmount = 1;
  } else { item.recipeItem = item.recipeTab = -1; item.dropAmount = N(o.amount); }
  if (!item.playerDropped) {
    if (o.name.indexOf('EquipmentStatues') !== -1) {
      if (rng.randomFloat() < N(v.doubleItemDropz0) / 100) item.dropAmount *= Math.round(2 + (N(v.legend2) + N(v.shopUpg48)) / 100);
      if (N(v.bonK) === 1) item.dropAmount *= 2;
    } else if (o.name.indexOf('FoodG') !== -1) {
      if (rng.randomFloat() < N(v.doubleItemDropz1) / 100) item.dropAmount *= Math.round(2 + N(v.legend2) / 100);
      if (N(v.bonK) === 1) item.dropAmount *= 2;
    }
  }
  item.sineType = rng.randomInt(0, 2);
  sim.later(6e5, () => { item.sineType = 5; }, item);
  item.yself = item.y;
  item.collectedStatus = -1;
  item.spawnDelay += 0.12 * item.itemN;
  const filt = v.printerFilter || [];
  const slots = N(v.filterSlots) | 0;
  sim.later(300, () => {
    for (let k = 0; k < slots; k++) {
      if (filt[k] === item.dropType) {
        _ledgerItem(L, item.dropType).filtered++;
        sim.emit('filtered', { uid: item.uid, name: item.dropType, t: sim.timeMs });
        sim.recycleActor(item);
        break;
      }
    }
  }, item);
  if (item.dropAmount <= 0) {
    if (item.dropType === 'COIN' && item.dropAmount < 1) item.dropAmount = 1;
    else { sim.recycleActor(item); return item; }
  }
  // Ledger: item exists on the ground.
  const li = _ledgerItem(L, item.dropType);
  li.dropped++; li.qtyDropped += item.dropAmount;
  const src = _ledgerSource(L, item.source || 'other');
  src.items++; src.qty += item.dropAmount;
  if (item.dropType === 'COIN') L.coins += item.dropAmount;
  L.itemsCreated++;
  if (L.firstDropAt == null) L.firstDropAt = sim.timeMs;
  sim.emit('drop', { uid: item.uid, name: item.dropType, qty: item.dropAmount, source: item.source, from: item.killedType, x: item.x, y: item.y, t: sim.timeMs });
  sim.later(1000 * item.spawnDelay, () => {
    const expire = () => sim.later(600, () => {
      if (item.recycled) return;
      _ledgerItem(L, item.dropType).expired++;
      sim.emit('itemExpired', { uid: item.uid, name: item.dropType, qty: item.dropAmount, t: sim.timeMs });
      sim.recycleActor(item);
    }, item);
    if (item.dropType !== 'COIN') {
      // src 82598: WWcoin and Quest99 never expire.
      if (item.dropType !== 'WWcoin' && item.dropType !== 'Quest99') sim.later(def?.typeGen === 'bCraft' ? 15e5 : 36e5, expire, item);
    }
    else sim.later(50, () => sim.later(12e5, expire, item), item);
    const M = item.itemM, n = item.itemN;
    item.vx = (6 * M - 12 * (M - n)) / 3;
    item.vy = -16;
    for (let r = 0; r < 13; r++) sim.later(50 * (r + 1), () => { item.vy += 2.25; }, item);
    _clampX(sim, item);
  }, item);
  // Periodic handlers registered after init: 700 ms proximity auto loot,
  // 600 ms PlayerMustTouch, 50 ms landing, 100 ms bobbing.
  item._pxT = sim.every(700, (task) => {
    const t = item.dropType;
    if (_autoLootGate(sim, item) && _dist(sim, item) < 80) { item.autoLooted = 1; tryPickup(sim, item, { autoLoot: true }); }
    if (t === 'Quest51' && _dist(sim, item) < 80) { item.autoLooted = 1; tryPickup(sim, item, { autoLoot: true }); }
    if (item._cs !== 0 && item.autoLooted === 1) { sim.sched.park(task); item._pk |= 8; }
  }, item);
  // _event_PlayerMustTouch (src 82400), 600 ms: quest items on maps 58/112.
  if (sim.scene.map === 58 || sim.scene.map === 112) sim.every(600, () => _playerMustTouch(sim, item), item);
  // Both handlers below park while provably a no-op (see SimItem).
  item._landT = sim.every(50, (task) => {
    const s = _sine(st, item.sineType);
    if (item.vy > 0 && item.y > item.yself - 4 + 3 * s && item.collectedStatus < 1) {
      if (item.collectedStatus === -1) sim.emit('itemLanded', { uid: item.uid, t: sim.timeMs });
      item.collectedStatus = 0;
      item.vx = 0; item.vy = 0;
      item.y = item.yself + 3 * s;
    }
    if (item.vx !== 0) _clampX(sim, item, true);
    else if (!(item.vy > 0)) { sim.sched.park(task); item._pk |= 1; }
  }, item);
  item._bobT = sim.every(100, (task) => {
    if (item.sineType < 4 && item.vy === 0) { item.y = item.yself + 3 * _sine(st, item.sineType); if (item.y === 0) item._wake(); }
    else { sim.sched.park(task); item._pk |= 2; }
  }, item);
  return item;
}

// Ground item actor. Every field is declared up front so all items share one
// hidden class. vx/vy/sineType are accessors: the 50 ms landing handler is a
// no-op exactly while vx === 0 && !(vy > 0), and the 100 ms bobbing handler
// exactly while !(sineType < 4 && vy === 0). Those handlers park themselves
// in that state and any write to a field they read wakes them, so skipped
// fires are precisely the literal no-op fires. The core step loop likewise
// drops an item once stepItem reports it static ("dormant") and re-admits it
// when vx/vy are written, collectedStatus becomes 1, or bobbing writes y to
// ±0. Every other x/y writer (_clampX, landing) also writes vx/vy first.
// The 500 ms and 700 ms auto-loot handlers are no-ops exactly while
// collectedStatus !== 0 after autoLooted has become 1 (autoLooted never
// reverts, tryPickup rejects collectedStatus !== 0 first, and the gate and
// distance reads are pure); they park then and wake when collectedStatus is
// set back to 0.
class SimItem {
  constructor(sim, o) {
    this.kind = 'item';
    this.uid = 'i' + (sim._itemSeq = (sim._itemSeq || 0) + 1);
    this.dropType = o.name; this.dropAmount = 0; this.x = o.x; this.y = o.y;
    this._vx = 0; this._vy = 0; this.width = 36; this.height = 36;
    this._cs = -1; this.yself = o.y; this._sineType = 0;
    this.itemN = N(o.itemN); this.itemM = N(o.itemM); this.node = o.node;
    this.maxCap = 1; this.source = o.source; this.killedType = o.killedType || null;
    this.autoLooted = 0; this.blockAutoLoot = o.name === 'Quest99' ? 1 : 0; this.playerDropped = 0; this.dn2 = o.dn2;
    this.spawnDelay = N(o.spawnDelay); this.createdAt = sim.timeMs; this.pickedQty = 0;
    this.recycled = false; this.recycledAt = undefined;
    this.recipeTab = undefined; this.recipeItem = undefined; this.personalNumb = undefined; this.droppedMap = undefined;
    this._sched = sim.sched; this._pk = 0; this._landT = null; this._bobT = null; this._alT = null; this._pxT = null;
    this._sim = sim; this._seq = -1; this._dormant = false;
  }
  _wake() { if (this._dormant) this._sim._wakeActor(this); }
  get vx() { return this._vx; }
  set vx(v) { this._vx = v; if (this._dormant) this._sim._wakeActor(this); if (this._pk & 1) { this._pk &= ~1; this._sched.wake(this._landT); } }
  get vy() { return this._vy; }
  set vy(v) { this._vy = v; if (this._dormant) this._sim._wakeActor(this); if (this._pk & 3) { const pk = this._pk; this._pk &= ~3; if (pk & 1) this._sched.wake(this._landT); if (pk & 2) this._sched.wake(this._bobT); } }
  get collectedStatus() { return this._cs; }
  set collectedStatus(v) {
    this._cs = v;
    if (v === 1 && this._dormant) this._sim._wakeActor(this);
    else if (v === 0 && this._pk & 12) { const pk = this._pk; this._pk &= ~12; if (pk & 4) this._sched.wake(this._alT); if (pk & 8) this._sched.wake(this._pxT); }
  }
  get sineType() { return this._sineType; }
  set sineType(v) { this._sineType = v; if (this._pk & 2) { this._pk &= ~2; this._sched.wake(this._bobT); } }
}

function _sine(st, k) {
  const s = st.sine || {};
  return k === 0 ? N(s.S0) : k === 1 ? N(s.S1) : k === 2 ? N(s.S2) : k === 4 ? N(s.S4) : 0;
}

// The launch clamp (src 82626) is unconditional; the 50 ms handler (src 82433)
// clamps each edge only while moving toward it.
function _clampX(sim, item, bySign = false) {
  const nd = sim.scene.nodes[item.node];
  if (!nd) return;
  if ((!bySign || item.vx < 0) && item.x < nd.x + 3) { item.vx = 0; item.x = nd.x; }
  if ((!bySign || item.vx > 0) && item.x > nd.length - 39) { item.vx = 0; item.x = nd.length - 36; }
}

function _autoLootGate(sim, item) {
  const v = sim.inputs.values;
  return N(v.bunI) === 1 && N(v.ola83) === 0 && item.blockAutoLoot === 0 && item.playerDropped === 0
    && item.dropType !== 'LootDice' && ITEMS[item.dropType]?.Type !== 'DUNGEON_FOOD';
}

function _pxc(p) { return typeof p.xCenter === 'function' ? p.xCenter() : N(p.x) + N(p.width) / 2; }

function _itemKick(sim, item, vx, vy) {
  item.vx = vx; item.vy = vy;
  for (let r = 0; r < 13; r++) sim.later(50 * (r + 1), () => { item.vy += 2.25; }, item);
}

// src 82400: map 58 Goldric1 (single items within 40 px are counted and
// collected); map 112 Bill_Brr4 single coins run away from a near player and
// drift toward a player standing still for 7 s. No RNG.
function _playerMustTouch(sim, item) {
  const map = sim.scene.map;
  if (!(map === 58 || map === 112) || N(item.dungItemStatus) !== 0 || item.collectedStatus !== 0) return;
  const p = sim.player;
  if (p.node !== item.node) return;
  const qc = sim.state.questComplete || {};
  const L = sim.rewardsState.ledger;
  const ixc = item.x + item.width / 2;
  if (item.dropAmount === 1 && N(qc.Goldric1) === 0 && map === 58) {
    if (40 > Math.abs(_pxc(p) - ixc)) { L.goldric1 = N(L.goldric1) + 1; item.collectedStatus = 1; }
  } else if (item.dropAmount === 1 && item.dropType === 'COIN' && N(qc.Bill_Brr4) === 0 && map === 112) {
    if (40 > Math.abs(_pxc(p) - ixc)) {
      if (N(item.personalNumb) === 0) {
        const nd = sim.scene.nodes[item.node] || {};
        _itemKick(sim, item, item.x < N(nd.x) + (N(nd.length) - N(nd.x)) / 2 ? 46 : -46, -16);
      } else { item.collectedStatus = 1; L.billBrr4 = 1; }
    } else if (N(p.vx) === 0) {
      sim.later(7e3, () => {
        if (N(p.vx) === 0) {
          item.personalNumb = 1;
          _itemKick(sim, item, item.x + item.width / 2 < _pxc(p) ? 4 : -4, -8);
          sim.later(500, () => { if (N(p.vx) !== 0) item.personalNumb = 0; }, item);
        } else item.personalNumb = 0;
      }, item);
    }
  }
}

// Item top-left to player center (source quirk: item uses getX/getY).
function _dist(sim, item) {
  const p = sim.player;
  const xc = typeof p.xCenter === 'function' ? p.xCenter() : N(p.x) + N(p.width) / 2;
  const yc = typeof p.yCenter === 'function' ? p.yCenter() : N(p.y) + N(p.height) / 2;
  const dx = item.x - xc, dy = item.y - yc;
  return Math.sqrt(dx * dx + dy * dy);
}

// ---------------------------------------------------------------------------
// ItemPickupInTheFirstPlace (AE44). Requires collectedStatus == 0 (landed).
// Returns true when the item was marked collected.
// ---------------------------------------------------------------------------
export function tryPickup(sim, item, { autoLoot = false } = {}) {
  if (!item || item.recycled || item.collectedStatus !== 0) return false;
  const v = sim.inputs.values;
  const st = sim.state;
  const L = sim.rewardsState.ledger;
  const t = item.dropType;
  if (!autoLoot && sim.player.menuOpen) return false;
  if (sim.special?.dungeonPickup?.(sim, item)) return true; // src 82463/82542-82547 DUNGEON_EVAPORATE — combat-sim-special.js hook
  if (t === 'COIN') {
    // src 82464: a 1-coin drop stays on the ground during Goldric1 (map 58) / Bill_Brr4 (map 112).
    const qc = st.questComplete || {};
    if (item.dropAmount === 1 && ((N(qc.Goldric1) === 0 && sim.scene.map === 58) || (N(qc.Bill_Brr4) === 0 && sim.scene.map === 112))) return false;
    item.collectedStatus = 1; item.pickedQty = item.dropAmount; return true;
  }
  if (t === 'Motherlode' || t === 'Bug14' || t === 'MotherlodeTREE' || t === 'Fish14') {
    // src 82465: cavern drops credit Holes[11] directly.
    const h = st.holes11 || (st.holes11 = {});
    if (t === 'Fish14') h[6] = N(h[6]) + item.dropAmount;
    else {
      const k = Math.round(2 * (HolesInfo[26] || []).indexOf(t));
      h[k] = N(h[k]) + item.dropAmount;
      if (k === 0) h[32] = N(h[32]) + item.dropAmount;
    }
    item.collectedStatus = 1; item.pickedQty = item.dropAmount; return true;
  }
  const def = ITEMS[t];
  if (t.indexOf('Obol') === 0) {
    // src 82481: page by typeGen, first "Blank" in 4*ObolInventorySlotsOwned[page].
    const tg = def?.typeGen;
    const k = tg === 'aObolCircle' ? 0 : tg === 'aObolSquare' ? 1 : tg === 'aObolHexagon' ? 2 : 3;
    const ob = st.obol || (st.obol = { order: [], own: [] });
    const page = ob.order[k] || (ob.order[k] = {});
    const n = 4 * N(ob.own[k]) | 0;
    for (let o = 0; o < n; o++) {
      if (page[o] === 'Blank') {
        page[o] = t; item.collectedStatus = 1; item.pickedQty = item.dropAmount;
        return true;
      }
      if (o === n - 1 && 0 < item.dropAmount) {
        if (v.unlimitedInventory) return _pickupOverflow(sim, item, L, t);
        sim.later(20, () => {
          item.collectedStatus = -1;
          L.fullRetries++;
          sim.later(2e3, () => { if (item.collectedStatus === -1) item.collectedStatus = 0; }, item);
        }, item);
      }
    }
    return false;
  }
  if (def?.typeGen === 'dCard' || t.indexOf('Cards') === 0) {
    const desc = String(def?.desc_line1 ?? t);
    const c0 = st.cards0 || (st.cards0 = {});
    c0[desc] = N(c0[desc]) + item.dropAmount;
    item.collectedStatus = 1; item.pickedQty = item.dropAmount;
    L.cards[desc] = (L.cards[desc] || 0) + item.dropAmount;
    sim.emit('cardFound', { name: t, monster: desc, count: c0[desc], t: sim.timeMs });
    if (c0[desc] < 3) lootDropOddsReset(sim);
    return true;
  }
  const inv = st.inventory || (st.inventory = { order: [], quantity: [] });
  const slots = N(v.inventorySlotsOwned) | 0;
  // The game's InventoryOrder always spans every owned slot; pad a short
  // supplied array with Blank. Only "Blank" is empty (src 82507).
  for (let o = inv.order.length; o < slots; o++) { inv.order[o] = 'Blank'; inv.quantity[o] = 0; }
  const maxCap = N(item.maxCap);
  const RS = sim.rewardsState;
  const ver = RS.pickupCache ? _inventoryVersion(sim, inv, slots) : -1;
  const failed = RS.pickupCache ? RS.pickupFail.get(t) : undefined;
  const unlimited = !!v.unlimitedInventory;
  if (!unlimited && failed && failed.ver === ver && failed.inv === inv && failed.slots === slots
    && (failed.maxCap === maxCap || (failed.maxCap !== failed.maxCap && maxCap !== maxCap))) {
    RS.pickupCacheHits++;
    return _pickupFull(sim, item, L, t);
  }
  const isOre = String(def?.displayName || '').indexOf('_Ore') !== -1;
  let placed = 0;
  let mutated = false;
  for (let o = 0; o < slots; o++) {
    if (inv.order[o] === t && N(inv.quantity[o]) < maxCap && item.dropAmount > 0) {
      mutated = true;
      if (!(item.dropAmount + N(inv.quantity[o]) > maxCap)) {
        inv.quantity[o] = N(inv.quantity[o]) + item.dropAmount;
        placed += item.dropAmount;
        item.dropAmount = 0;
        item.collectedStatus = 1;
        break;
      }
      const add = maxCap - N(inv.quantity[o]);
      item.dropAmount -= add;
      placed += add;
      inv.quantity[o] = maxCap;
      if (!isOre) item.collectedStatus = 1;
    }
    if (o === slots - 1 && item.dropAmount > 0) {
      for (let b = 0; b < slots && item.dropAmount > 0; b++) {
        if (inv.order[b] === 'Blank') {
          inv.order[b] = t;
          mutated = true;
          if (item.dropAmount <= maxCap) {
            inv.quantity[b] = item.dropAmount; placed += item.dropAmount; item.dropAmount = 0; item.collectedStatus = 1;
          } else {
            inv.quantity[b] = maxCap; placed += maxCap; item.dropAmount -= maxCap;
          }
        }
      }
    }
  }
  item.pickedQty += placed;
  if (mutated) bumpInventoryVersion(sim);
  if (unlimited && item.dropAmount > 0) return _pickupOverflow(sim, item, L, t);
  if (item.collectedStatus === 1) {
    if (item.dropAmount > 0) {
      L.lostRemainder += item.dropAmount;
      _ledgerItem(L, t).lost += item.dropAmount;
    }
    return true;
  }
  if (RS.pickupCache && !mutated && item.dropAmount > 0) {
    RS.pickupFail.set(t, { ver, inv, slots, maxCap });
  }
  return _pickupFull(sim, item, L, t);
}

// Calculator-only unlimited inventory: whatever the real bag/obol page could
// not hold goes to a virtual overflow store, so pickup never fails or drops a
// remainder. Real slots are still filled first so occupancy stays source-like.
function _pickupOverflow(sim, item, L, t) {
  const st = sim.state;
  const over = st.inventoryOverflow || (st.inventoryOverflow = {});
  const qty = item.dropAmount;
  over[t] = N(over[t]) + qty;
  L.overflowQty += qty;
  L.overflowByItem[t] = N(L.overflowByItem[t]) + qty;
  item.pickedQty += qty;
  item.dropAmount = 0;
  item.collectedStatus = 1;
  return true;
}

// Inventory full (no slot accepted the item): 20 ms reset to -1, 2 s retry.
function _pickupFull(sim, item, L, t) {
  L.fullRetries++;
  if (L.inventoryFullAt == null) L.inventoryFullAt = sim.timeMs;
  sim.later(20, () => {
    if (item.collectedStatus === 0) item.collectedStatus = -1;
    sim.emit('inventoryFull', { uid: item.uid, name: t, t: sim.timeMs });
    sim.later(2000, () => { if (item.collectedStatus === -1) item.collectedStatus = 0; }, item);
  }, item);
  return false;
}

// Per-step whenUpdated: collected items float up and recycle after 670 ms.
// Exact fast path for the core actor loop: same static-velocity integration
// as the generic branch, but reads SimItem's backing fields directly (accessor
// getters are not inlined in the polymorphic loop). updateItem returns
// immediately unless collectedStatus === 1, so the call is skipped otherwise.
// Returns true when the item is now static: its next step is a literal no-op
// (vx === vy === 0, x and y not ±0, collectedStatus !== 1), so the core loop
// may drop it until SimItem wakes it (see SimItem).
export function stepItem(sim, item) {
  const vx = item._vx, vy = item._vy;
  if (vx !== 0 || item.x === 0) item.x += 0.1 * vx;
  if (vy !== 0 || item.y === 0) item.y += 0.1 * vy;
  if (item._cs === 1) updateItem(sim, item);
  return item._vx === 0 && item._vy === 0 && item._cs !== 1 && item.x !== 0 && item.y !== 0;
}

// Pig (CastAttackofID1 16, src 67456): every live type-44 actor whose _DropType
// is COIN — on the ground, in flight, or already collected — has DropAmount
// multiplied and its animation re-picked with the Pig's own thresholds. Money is
// credited from DropAmount on the status 1 -> 2 transition, so only items not yet
// at status 2 change the coins earned; the ledger follows that rule.
const PIG_COIN_STEPS = [1e2, 1e4, 1e6, 1e8, 1e11, 1e14, 1e17, 1e20, 1e23];
export function multiplyGroundCoins(sim, mult) {
  const L = sim.rewardsState.ledger;
  let n = 0;
  for (const item of sim.items) {
    if (item.recycled || item.dropType !== 'COIN') continue;
    const before = item.dropAmount;
    item.dropAmount = before * mult;
    let k = 0; while (k < PIG_COIN_STEPS.length && !(item.dropAmount < PIG_COIN_STEPS[k])) k++;
    item.coinAnim = String(k + 1);
    if (item._cs !== 2) {
      const d = item.dropAmount - before;
      L.coins += d; _ledgerItem(L, 'COIN').qtyDropped += d;
      if (item._cs === 1) item.pickedQty = item.dropAmount;
    }
    n++;
  }
  sim.emit('pigCoins', { mult, count: n, t: sim.timeMs });
  return n;
}

export function updateItem(sim, item) {
  if (item.collectedStatus !== 1) return;
  item.collectedStatus = 2;
  item.vy = -4;
  const L = sim.rewardsState.ledger;
  if (item.dropType === 'COIN') { sim.state.money = N(sim.state.money) + item.dropAmount; L.coinsPicked += item.dropAmount; }
  const li = _ledgerItem(L, item.dropType);
  li.picked++; li.qtyPicked += item.pickedQty;
  sim.emit('pickup', { uid: item.uid, name: item.dropType, qty: item.pickedQty, autoLooted: item.autoLooted, t: sim.timeMs });
  sim.later(670, () => sim.recycleActor(item), item);
}

// ---------------------------------------------------------------------------
// Ledger summary
// ---------------------------------------------------------------------------
export function ledgerSummary(sim) {
  const RS = sim.rewardsState;
  if (!RS) return null;
  const L = RS.ledger;
  const onGround = {};
  let onGroundCount = 0;
  for (const it of sim.items) {
    if (it.recycled || it.collectedStatus >= 1) continue;
    onGround[it.dropType] = (onGround[it.dropType] || 0) + it.dropAmount;
    onGroundCount++;
  }
  const inv = sim.state.inventory || { order: [], quantity: [] };
  const slots = N(sim.inputs.values.inventorySlotsOwned) | 0;
  let used = 0;
  for (let i = 0; i < slots; i++) if (inv.order[i] && inv.order[i] !== 'Blank' && inv.order[i] !== 'LockedInvSpace') used++;
  return {
    kills: L.kills, killsByType: Object.assign({}, L.killsByType),
    expTotal: L.expTotal, expByType: Object.assign({}, L.expByType),
    coinsDropped: L.coins, coinsPicked: L.coinsPicked, money: N(sim.state.money),
    klaCredit: L.klaCredit, kla: _clone(sim.state.kla || []),
    byItem: _clone(L.byItem), bySource: _clone(L.bySource), cards: Object.assign({}, L.cards),
    onGround, onGroundCount, itemsCreated: L.itemsCreated,
    fullRetries: L.fullRetries, lostRemainder: L.lostRemainder, inventoryFullAt: L.inventoryFullAt,
    unlimitedInventory: !!sim.inputs.values.unlimitedInventory, overflowQty: N(L.overflowQty), overflowByItem: _clone(L.overflowByItem || {}),
    inventorySlots: slots, inventoryUsed: used, ldorRuns: RS.ldorRuns,
    counters: {
      ola: Object.assign({}, sim.state.ola), generalInfo9: sim.state.generalInfo9,
      gi: Object.assign({}, sim.state.gi), crystalLock: sim.state.crystalLock,
      gi41: sim.state.gi41, gi141: sim.state.gi141, holes11: _clone(sim.state.holes11 || {}),
      ninja105: _clone(sim.state.ninja105 || []), emporiumKills: N(L.emporiumKills),
      marbleStreak: N(sim.state.royalG?.[3]?.[5]), royalMapRow: _clone(sim.state.royalMapRow || null),
    },
    orb: sim.state.orb ? Object.assign({}, sim.state.orb) : null,
    zenith: {
      clusterEvents: N(L.zenithClusters), statueExpProcs: N(L.zenithStatueExp),
      statueExp: N(L.zenithStatueExpGain), byItem: _clone(L.zenithStatueExpByItem || {}),
    },
    overkill: sim.state.overkill ? Object.assign({}, sim.state.overkill) : null,
    unmodelled: Object.assign({}, sim.state.unmodelled),
  };
}
