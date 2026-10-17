// ===== COMBAT FORMS (Wraith / Tempest / Arcanist / Royal vermin) =====
// Literal ports of the custom form stat dispatchers that replace normal combat
// stats while a form buff is active (src Summoning Grimoire_*, Windwalker
// Compass_*, ArcaneType Arcane_*), plus the Royal Guardian vermin map (43)
// RatDMG/RatResp overrides. Arithmetic grouping follows the source exactly.

import { getLOG } from '../../../formulas.js';
import { GrimoireUpg, CompassUpg, ArcaneUpg } from '../../data/game/customlists.js';
import { ITEMS } from '../../data/game/items.js';
import { grimoireUpgBonus } from '../mc/grimoire.js';
import { arcaneUpgBonus } from '../mc/tesseract.js';
import { computeCompassBonus } from '../w7/compass.js';
import { armoryBonus } from '../w7/royal-guardian.js';

function _n(v) { return Number(v) || 0; }

// GrimoireUpgTotal: sum of Grimoire[i] over CustomLists.GrimoireUpg.length.
export function grimoireUpgTotal(S) {
  const g = S?.grimoireData || [];
  let t = 0;
  for (let i = 0; i < GrimoireUpg.length; i++) t += _n(g[i]);
  return t;
}

// CompassUpgTotal: sum of Compass[0][i] over CustomLists.CompassUpg.length.
export function compassUpgTotal(S) {
  const c = S?.compassData?.[0] || [];
  let t = 0;
  for (let i = 0; i < CompassUpg.length; i++) t += _n(c[i]);
  return t;
}

// ArcaneUpgTotal: sum of Arcane[i] over CustomLists.ArcaneUpg.length.
export function arcaneUpgTotal(S) {
  const a = S?.arcaneData || [];
  let t = 0;
  for (let i = 0; i < ArcaneUpg.length; i++) t += _n(a[i]);
  return t;
}

// Breeding("2ndMulti", world, idx): GenINFO[53][0] is set at Breeding actor
// init from Breeding[2][3] > 0.
function _breeding2ndMulti(S, w, i) {
  const br = S?.breedingData || [];
  if (!(_n(br[2]?.[3]) > 0)) return 1;
  return 1 + Math.log(Math.max(1, Math.pow(_n(br[w + 13]?.[i]) + 1, 0.725)));
}

// Windwalker("TotBreedzWWz"): every entry of Breeding[13..16] adds
// min(9, floor((2ndMulti - 1)^.8) + 1) when above .5, otherwise 1.
export function totBreedzWWz(S) {
  const br = S?.breedingData || [];
  let t = 0;
  for (let w = 0; w < 4; w++) {
    const row = br[13 + w] || [];
    for (let i = 0; i < row.length; i++) {
      if (0.5 < _n(row[i])) t += Math.min(9, Math.floor(Math.pow(_breeding2ndMulti(S, w, i) - 1, 0.8)) + 1);
      else t += 1;
    }
  }
  return t;
}

function _slotName(eqOrder, slot) {
  const row = eqOrder?.[0];
  if (!row) return '';
  const v = row[slot] ?? row[String(slot)];
  return v == null ? '' : String(v);
}
function _slotStat(emm, slot, key) {
  const row = emm?.[0];
  const d = row?.[slot] ?? row?.[String(slot)];
  return _n(d?.[key]);
}
function _itemStat(name, key) { return _n(ITEMS[name]?.[key]); }

// Weapon speed used by ActionWaitTime's form branches: the weapon's item Speed
// plus its EquipmentMap Speed when the weapon matches the form, otherwise 1.
export function formWeaponSpeed(eqOrder, emm, needle) {
  const name = _slotName(eqOrder, 1);
  if (name.indexOf(needle) === -1) return 1;
  return _itemStat(name, 'Speed') + _slotStat(emm, 1, 'Speed');
}

// Royal Guardian vermin map 43 (src RoyalG RatResp / RatDMG).
export function ratResp(S) {
  return Math.max(5, 60 / (1 + (armoryBonus(S, 33) + armoryBonus(S, 34)) / 100));
}
export function ratDmg(S) {
  return (10 + armoryBonus(S, 35)) * (1 + armoryBonus(S, 36) / 100);
}

/**
 * Wraith form (Death Bringer, buff 195) — Summoning Grimoire_* dispatchers.
 * deps: { tn(tab, id), ola, fishingEfficiency }
 */
export function wraithStats(S, deps) {
  const tn = deps.tn, ola = deps.ola || [];
  const G = i => _n(grimoireUpgBonus(i, GrimoireUpg, S));
  const GT = grimoireUpgTotal(S);
  const fishEff = _n(deps.fishingEfficiency);
  const hp = (10 + (G(3) + (G(19) + (G(34) + G(42))))) * (1 + (G(7) + G(38)) / 100) * (1 + tn(1, 201) * (GT / 100) / 100);
  const damage = (5 + (G(0) + (G(6) + (G(16) + (G(33) + G(46)))))) * (1 + tn(1, 195) / 100) * (1 + (G(8) + (G(28) + (G(43) + G(50)))) / 100)
    * (1 + (_n(ola[334]) * G(13) + (_n(ola[335]) * G(21) + _n(ola[336]) * G(31))) / 100)
    * (1 + G(18) * getLOG(_n(ola[330])) / 100) * (1 + tn(1, 200) * (GT / 100) / 100);
  const accuracy = (2 + (G(1) + (G(12) + (G(25) + (G(37) + G(47)))))) * (1 + (G(7) + G(38)) / 100)
    * (1 + G(41) * getLOG(_n(ola[332])) / 100) * (1 + tn(1, 200) * (GT / 100) / 100);
  const defence = (G(2) + (G(15) + (G(30) + (G(40) + G(49))))) * (1 + (G(7) + G(38)) / 100)
    * (1 + G(27) * getLOG(_n(ola[331])) / 100) * (1 + tn(1, 201) * (GT / 100) / 100);
  return {
    form: 'wraith', hp, damage, accuracy, defence, mastery: 0.2,
    critChance: 10 + (G(10) + tn(1, 202) * getLOG(fishEff)),
    critDamage: 1 + (25 + G(20) + tn(2, 202) * getLOG(fishEff)) / 100,
    grimoireTotal: GT, grimoire21: G(21),
  };
}

/**
 * Tempest form (Wind Walker, buff 420) — Windwalker Compass_* dispatchers.
 * deps: { tn(tab, id), ola, etc(id), eqOrder, emm }
 */
export function tempestStats(S, deps) {
  const tn = deps.tn, ola = deps.ola || [], etc = deps.etc;
  const C = i => _n(computeCompassBonus(i, S));
  const CT = compassUpgTotal(S);
  const medallions = (S?.compassData?.[3] || []).length;
  const hp = (10 + (C(28) + C(87))) * (1 + (C(140) + (C(146) + C(92))) / 100);
  // DNSM.WWzWepAtk: slot 1 weapon, then rings (slots 5 and 7) with "Tempest".
  let wep = 0;
  const w1 = _slotName(deps.eqOrder, 1);
  if (w1.indexOf('Tempest') !== -1) wep = _itemStat(w1, 'Weapon_Power') + _slotStat(deps.emm, 1, 'Weapon_Power');
  for (let k = 0; k < 2; k++) {
    const slot = Math.round(5 + 2 * k);
    const nm = _slotName(deps.eqOrder, slot);
    if (nm.indexOf('Tempest') !== -1) wep += _itemStat(nm, 'Weapon_Power') + _slotStat(deps.emm, slot, 'Weapon_Power');
  }
  const logHp = getLOG(hp);
  const damage = 5 + (C(14) + (C(15) + (C(24) + (C(60) + C(81))))) * Math.pow(1.05, wep) * (1 + etc(86) / 100) * (1 + C(23) * getLOG(_n(ola[360])) / 100) * Math.pow(1 + C(26) / 100, _n(ola[232])) * (1 + C(6) * medallions / 100) * (1 + (C(119) + C(10) / 1 + (C(121) + (C(122) + (C(123) + (C(126) + (C(127) + (C(129) + (C(130) + (C(132) + (C(135) + (C(64) + C(78) * logHp + (C(85) + (C(94) + tn(1, 420)))))))))))))) / 100);
  const accuracy = (3 + (C(17) + (C(19) + (C(25) + C(61))))) * (1 + tn(1, 425) * (CT / 100) / 100)
    * (1 + C(22) * getLOG(_n(ola[357])) / 100) * (1 + C(6) * medallions / 100)
    * (1 + (C(120) + (C(124) + (C(125) + (C(128) + (C(131) + (C(133) + (C(134) + (C(136) + (C(147)
      + (C(84) * logHp + (C(79) + C(90)))))))))))) / 100);
  // Windwalker EffectAmount(t) / CurrentEffect (src 92386-92387): argmax over
  // elements in check order 1, 0, 2, 3; -1 unless the winner is positive.
  const effectAmounts = [0, 1, 2, 3].map((t) => _n(etc(80 + t)) * (1 + (C(8) + C(74) + tn(1, 426) * (CT / 100)) / 100));
  const currentEffect = [1, 0, 2, 3].find((t) => effectAmounts[t] > 0 && effectAmounts.every((x) => effectAmounts[t] >= x)) ?? -1;
  const defence = (1 + (C(29) + C(63))) * (1 + tn(1, 425) * (CT / 100) / 100) * (1 + C(30) * getLOG(_n(ola[358])) / 100)
    * (1 + etc(87) / 100) * (1 + (C(137) + (C(138) + (C(141) + (C(143) + (C(144) + (C(149) + (C(83) + C(91)))))))) / 100);
  return {
    form: 'tempest', hp, damage, accuracy, defence,
    mastery: Math.min(0.7, 0.2 + C(70) / 100),
    critChance: 5 + (C(16) + tn(1, 427) * Math.floor(totBreedzWWz(S) / 25)) + C(66),
    critDamage: 1 + (20 + (C(20) + C(123)) + (C(75) + etc(88))) / 100,
    atkSpdPct: C(21) + (C(69) + etc(89)),
    invuln: 2.1 + (C(37) + C(88)),
    range: C(32) + C(65),
    moveSpeed: C(35) + (C(141) + C(62)),
    multishotPct: Math.min(800, C(18) + (C(125) + C(73) + tn(2, 426) * (CT / 100))),
    weaponSpeed: formWeaponSpeed(deps.eqOrder, deps.emm, 'Tempest'),
    weaponAtk: wep, compassTotal: CT, effectAmounts, currentEffect,
  };
}

/**
 * Arcanist form (Arcane Cultist, buff 585) — ArcaneType Arcane_* dispatchers.
 * deps: { tn(tab, id), ola, etc(id), eqOrder, emm, lv0 }
 */
export function arcanistStats(S, deps) {
  const tn = deps.tn, ola = deps.ola || [], etc = deps.etc;
  const A = i => _n(arcaneUpgBonus(i, S));
  const AT = arcaneUpgTotal(S);
  const w1 = _slotName(deps.eqOrder, 1);
  const wep = w1.indexOf('EquipmentWandsArc') !== -1 ? _itemStat(w1, 'Weapon_Power') + _slotStat(deps.emm, 1, 'Weapon_Power') : 0;
  const damage = (5 + (A(0) + (A(6) + (A(15) + (A(36) + A(50)))))) * (1 + tn(1, 590) * (AT / 100) / 100)
    * Math.pow(1.04, Math.max(0, wep)) * (1 + tn(1, 585) / 100)
    * (1 + (A(12) * getLOG(_n(ola[388])) + (A(4) + (A(24) + (A(31) + (A(42) + A(53)))))) / 100) * (1 + etc(93) / 100);
  const accuracy = (2 + (A(1) + (A(9) + (A(19) + (A(38) + A(52)))))) * (1 + tn(1, 591) * (AT / 100) / 100)
    * (1 + (A(22) + (A(44) + A(55))) / 100) * (1 + A(27) * getLOG(_n(ola[389])) / 100) * (1 + etc(94) / 100);
  const defence = (A(2) + (A(11) + (A(29) + A(46)))) * (1 + tn(1, 591) * (AT / 100) / 100)
    * (1 + (A(22) + (A(44) + A(55))) / 100) * (1 + A(41) * getLOG(_n(ola[391])) / 100);
  return {
    form: 'arcanist', hp: null, damage, accuracy, defence, mastery: 0.25,
    critChance: 5 + A(8) + tn(1, 592) * Math.floor(_n(deps.lv0?.[12]) / 10),
    critDamage: 1 + (20 + A(14)) / 100,
    atkSpdPct: tn(2, 590) * (AT / 100) + A(21),
    weaponSpeed: formWeaponSpeed(deps.eqOrder, deps.emm, 'EquipmentWandsArc0'),
    weaponAtk: wep, arcaneTotal: AT,
  };
}

// ActionWaitTime form branches (src 66370-66381). `type` is the weapon type
// string; `W` the form weapon speed; `pct` the form attack-speed percent.
export function formActionWaitTime(form, type, W, pct) {
  // Only FISTICUFF/SPEAR/BOW/WAND have form branches; other types use the
  // normal formula (with the form-overwritten WaitTimeSPD).
  const t = String(type || '');
  const melee = t === 'FISTICUFF' || t === 'SPEAR';
  if (form === 'tempest') {
    if (melee) return (0.6 + (10 - W) / 5 + 0.35) / (1 + pct / 100);
    if (t === 'BOW') return (0.7 + (10 - W) / 5 + 0.1) / (1 + pct / 100);
    if (t === 'WAND') return 0.16 + (1.2 + (10 - W) / 5) / (1 + pct / 100);
  } else if (form === 'arcanist') {
    if (melee) return 0.35 + (0.6 + (10 - W) / 5) / (1 + pct / 100);
    if (t === 'BOW') return 0.1 + (0.7 + (10 - W) / 5) / (1 + pct / 100);
    if (t === 'WAND') return 0.16 + (1.2 + (10 - W) / 5) / (1 + pct / 100);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Form-drop quantity multipliers. `c` is the static save-derived coefficient
// bundle built by combat-sim-inputs (formDropCoef); `live` carries the values
// that change during a run: OptionsListAccount collection counters (updated by
// DUNGEON_EVAPORATE pickups) and GenINFO[125]/[132] (Graveyard / Reindeer
// counters). Multiplication order and additive grouping follow the source.
// ---------------------------------------------------------------------------

// Summoning("AllMasterclassDropz") src 91804.
export function allMasterclassDropz(c) {
  return (1 + _n(c.killroy4) / 100) * (1 + _n(c.shopUpg49) / 100) * (1 + _n(c.vial7masta) / 100)
    * (1 + _n(c.button4) / 100) * (1 + _n(c.companion38)) * (1 + _n(c.etc101) / 100) * (1 + _n(c.etc106) / 100)
    * (1 + Math.min(_n(c.cardFmRat), 25) / 100);
}

// Summoning("GrimoireBonesDropDEC") src 91805.
export function grimoireBonesDropDEC(c, live = {}) {
  return (1 + _n(c.pristine18) / 100) * (1 + _n(c.lore0) / 100) * allMasterclassDropz(c)
    * (1 + _n(c.tn196) / 100) * (1 + _n(c.meritoc25) / 100) * Math.min(2, 1 + _n(c.gambit12))
    * Math.min(1.5, 1 + _n(c.etc76) / 100) * (1 + (_n(c.emperor1) + _n(c.bubbleW13)) / 100)
    * (1 + (_n(c.grimoire23) + (_n(c.grimoire48) * getLOG(_n(live.ola333)) + (_n(c.arcade40) + (_n(c.mf121) + (_n(c.palette22) + _n(c.exotic53)))))) / 100)
    * (1 + _n(live.gi125) * _n(c.tn198) / 100);
}

// Windwalker("ExtraDust") src 92322.
export function windwalkerExtraDust(c, live = {}) {
  const cb = (i) => _n(c.compass?.[i]);
  return (1 + (cb(31) + cb(34) * getLOG(_n(live.ola359)) + _n(c.exotic54)) / 100) * (1 + cb(38) / 100)
    * allMasterclassDropz(c) * (1 + _n(c.meritoc25) / 100) * (1 + _n(c.pristine19) / 100) * (1 + _n(c.lore2) / 100)
    * (1 + (_n(c.etc85) + _n(c.etc79)) / 100) * (1 + (_n(c.emperor4) + _n(c.bubbleA13)) / 100)
    * (1 + _n(live.gi132) * _n(c.tn423) / 100)
    * (1 + (cb(139) + (cb(142) + (cb(145) + (cb(148) + (cb(150) + (cb(68) + (cb(93) + (cb(89) + (_n(c.tn421) + (_n(c.arcade47) + (_n(c.mf122) + _n(c.palette4)))))))))))) / 100);
}

// ArcaneType("ExtraTachyon") src 92409; ExtraTachyonMulti = bun_x ? 1.2 : 1.
export function arcaneExtraTachyon(c, live = {}) {
  const au = (i) => _n(c.arcane?.[i]);
  return (1 + (au(17) + (_n(c.tn586) + (au(34) * getLOG(_n(live.ola390)) + (au(56) * getLOG(_n(live.ola393)) + (_n(c.etc95) + (_n(c.mf123) + (_n(c.arcade50) + (_n(c.palette29) + _n(c.exotic55))))))))) / 100)
    * (1 + (_n(c.emperor6) + _n(c.bubbleM13)) / 100) * allMasterclassDropz(c) * (1 + _n(c.meritoc25) / 100)
    * (1 + _n(c.lore6) / 100) * (1 + _n(c.pristine22) / 100) * Math.max(1, _n(c.tn599)) * (_n(c.bunX) === 1 ? 1.2 : 1);
}
