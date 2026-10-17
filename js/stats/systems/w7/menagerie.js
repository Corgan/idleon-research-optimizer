// ===== LUMINOUS MENAGERIE SYSTEM (W7) =====
// Save data: Menagerie[0] misc (Lumi, Shell EXP, rank at [0][2], jellyfish state, Obol misc % at [0][9]),
//            [1] mission claims, [2] unlocks owned, [3] boost levels, [5] Scurge levels, [6..7] Omni-Jade.
// Missing Menagerie data (pre-CSver 34 exports) yields neutral multipliers (1) rather than the native empty-array 0,
// so older saves keep pre-patch results.
// Missing Menagerie data (pre-CSver 34 exports) yields neutral multipliers (1) instead of the native
// empty-array 0, so older saves keep pre-patch results.
// Mirrors: Spelunk[49] Black Stars, [50] Organic Labels, [51..53] Minehead/Sushi/Jelly doubled upgrades.
// Crucible: OLA[628] best hard-mode round, gated by unlock 8.

import {
  menagerieBoostPerLevel,
  menagerieMissionCount,
  arenaCrucibleThresholds,
} from '../../data/w7/menagerie.js';

function _m(S) {
  var m = S && S.menagerieData;
  return Array.isArray(m) ? m : [];
}

function _row(S, i) {
  var r = _m(S)[i];
  return Array.isArray(r) ? r : [];
}

function _ola(S, i) {
  var ola = (S && (S.olaData || S.optionsListData)) || [];
  return Number(ola[i]) || 0;
}

export function hasMenagerieData(S) {
  return _m(S).length > 0;
}

export function menagerieRank(S) {
  return Number(_row(S, 0)[2]) || 0;
}

export function menagerieUnlockOwned(S, idx) {
  if (!hasMenagerieData(S)) return 0;
  return (Number(_row(S, 2)[idx | 0]) || 0) >= 1 ? 1 : 0;
}

export function menagerieBoostLevel(S, idx) {
  return Number(_row(S, 3)[idx | 0]) || 0;
}

// Source MenagerieStuff("BoostQTY", idx)
export function menagerieBoostQTY(S, idx) {
  if (!hasMenagerieData(S)) return 0;
  return menagerieBoostPerLevel(idx | 0) * menagerieBoostLevel(S, idx);
}

export function menagerieTotalBoostLevels(S) {
  var row = _row(S, 3), total = 0;
  for (var i = 0; i < row.length; i++) total += Number(row[i]) || 0;
  return total;
}

export function hasBundle(S, key) {
  var b = S && S.bundlesData;
  if (!b) return 0;
  var v = b.h ? b.h[key] : b[key];
  return Number(v) === 1 ? 1 : 0;
}

// Source MenagerieStuff("UpgUnlocked", t). gridBonus164Level is the raw Grid_Bonus(164, 1) level;
// emporium47 is Ninja EmporiumBonus(47).
export function menagerieUpgUnlocked(S, t, opts) {
  if (!hasMenagerieData(S)) return 0;
  opts = opts || {};
  var rank = menagerieRank(S);
  if (t === 0) {
    return Math.round(Math.min(menagerieMissionCount(), 1 + (menagerieBoostQTY(S, 0)
      + ((Number(opts.grid164Level) || 0) + ((Number(opts.emporium47) || 0) + 3 * hasBundle(S, 'ban_k'))))));
  }
  if (t === 1) return Math.round(Math.min(7, rank) + Math.floor(Math.max(0, rank - 7) / 2));
  if (t === 2) return Math.round(Math.min(6, rank) + Math.floor(Math.max(0, rank - 6) / 2));
  return 0;
}

export function blackStarsOwned(S) {
  if (!hasMenagerieData(S)) return 0;
  return Math.round(menagerieBoostQTY(S, 2) + 4 * hasBundle(S, 'ban_m'));
}

export function organicLabelsOwned(S) {
  if (!hasMenagerieData(S)) return 0;
  return Math.round(menagerieBoostQTY(S, 6));
}

export function menagerieDoublersOwned(S, system) {
  if (!hasMenagerieData(S)) return 0;
  var idx = system === 'minehead' ? 8 : system === 'sushi' ? 10 : system === 'jelly' ? 12 : -1;
  if (idx < 0) return 0;
  return Math.round(menagerieBoostQTY(S, idx) + 3 * hasBundle(S, 'ban_l'));
}

var _DOUBLER_ROW = { minehead: 51, sushi: 52, jelly: 53 };

function _spelunkList(S, row) {
  var r = S && S.spelunkData && S.spelunkData[row];
  return Array.isArray(r) ? r : [];
}

function _containsNum(list, v) {
  for (var i = 0; i < list.length; i++) if (Number(list[i]) === v) return true;
  return false;
}

// Source UpgradeQTY doubling: Spelunk[51/52/53] contains the upgrade index.
export function isUpgradeDoubled(S, system, upgradeIdx) {
  var row = _DOUBLER_ROW[system];
  if (row == null) return false;
  return _containsNum(_spelunkList(S, row), Math.round(Number(upgradeIdx) || 0));
}

export function upgradeDoublerMulti(S, system, upgradeIdx) {
  return isUpgradeDoubled(S, system, upgradeIdx) ? 2 : 1;
}

export function doubledUpgrades(S, system) {
  var row = _DOUBLER_ROW[system];
  return row == null ? [] : _spelunkList(S, row).map(function(v) { return Number(v); });
}

// Exotic Market index carries an Organic Label (Spelunk[50]).
export function isExoticOrganic(S, exoticIdx) {
  return _containsNum(_spelunkList(S, 50), Number(exoticIdx));
}

// Source ObolMISCmulti
export function obolMiscMulti(S) {
  if (!hasMenagerieData(S)) return 1;
  return 1 + (Number(_row(S, 0)[9]) || 0) / 100;
}

// Source CalcTalentMAP.arenaCruc: count of reached Crucible thresholds, gated by unlock 8.
export function arenaCrucibleCount(S) {
  if (menagerieUnlockOwned(S, 8) !== 1) return 0;
  var best = _ola(S, 628), thresholds = arenaCrucibleThresholds(), count = 0;
  for (var i = 0; i < 16 && i < thresholds.length; i++) {
    if (best >= thresholds[i]) count = i + 1; else break;
  }
  return count;
}

// Source Breeding("PetArenaCrucBonus", "0", idx)
export function petArenaCrucBonus(S, idx) {
  return arenaCrucibleCount(S) > idx ? 1 : 0;
}

// Source OrionCheapener / PoppyCheapener / BubbaCheapener (ClickerCheapenerAoE = 1: only upgrade 0).
var _CHEAPENER_BOOST = { orion: 16, poppy: 18, bubba: 20 };
export function menagerieCheapener(S, kind, upgradeIdx) {
  if (!hasMenagerieData(S)) return 1;
  var b = _CHEAPENER_BOOST[kind];
  if (b == null) return 1;
  return (Number(upgradeIdx) || 0) < 1 ? 1 / (1 + menagerieBoostQTY(S, b) / 100) : 1;
}

// Source SumCostReduxMena(t) — t is the Summoning upgrade index; level from Summon[0][t].
export function summoningCostReduxMena(S, upgradeIdx) {
  if (!hasMenagerieData(S)) return 1;
  var lv = Number(S && S.summonData && S.summonData[0] && S.summonData[0][upgradeIdx | 0]) || 0;
  return 1 / Math.max(1, Math.pow(Math.min(50, 1 + menagerieBoostQTY(S, 7) / 100), Math.floor(lv / 50)));
}

// Source NightmarinerTotLV / NightmarinerBon(t)
export function nightmarinerTotalLevel(S) {
  var boats = (S && S.boatsData) || [], total = 0;
  for (var i = 0; i < 20; i++) {
    var b = boats[i] || [];
    total += Math.max(0, (Number(b[3]) || 0) + (Number(b[5]) || 0) - 600);
  }
  return total;
}

export function nightmarinerBonus(S, t) {
  if (!hasMenagerieData(S)) return 1;
  var x = nightmarinerTotalLevel(S);
  return Math.max(1, 1 + x / (x + 1e4) * (t === 0 ? 1999 : 499));
}

// Source SideJellyUnlocked(t)
export function sideJellyUnlocked(S, t) {
  var map = [3, 5, 7, 10, 12, 23];
  return map[t] != null && menagerieUnlockOwned(S, map[t]) === 1 ? 1 : 0;
}
