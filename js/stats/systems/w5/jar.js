// ===== JAR CAVERN SYSTEM (W5) =====
// Computation logic for The Jar: production, rupie value, chances, collectibles, upgrades.

import { getLOG } from '../../../formulas.js';
import { holesMeasBase, holesMeasType, cosmoUpgBase } from '../../data/w5/hole.js';
import { tomeQTY, computeTomeScore } from '../w4/tome-score.js';
import { deathNoteRank } from '../w7/research-math.js';
import { numCharacters, klaData } from '../../../save/data.js';
import { DeathNoteMobs, MapAFKtarget, MapDetails, NinjaInfo } from '../../data/game/customlists.js';

// ========== CONSTANTS ==========
export var JAR_TYPE_NAMES = [
  'Basic Rupie',    // 0
  'Opal',           // 1
  'Collectible',    // 2
  'Decent Rupie',   // 3
  'Enchant',        // 4
  'White Rupie',    // 5
  'Elegant Rupie',  // 6
  'Doubler',        // 7
  'Dark Rupie',     // 8
  'Master Rupie',   // 9
];

export var JAR_TYPE_CATS = [
  'rupie', 'chance', 'chance', 'rupie', 'chance',
  'rupie', 'rupie', 'doubler', 'rupie', 'rupie',
];

export var RUPIE_NAMES = [
  'Red', 'Blue', 'Green',        // 0-2  basic
  'Purple', 'Yellow', 'Orange',   // 3-5  decent
  'Cyan', 'Pink', 'Crimson',     // 6-8  elegant
  'Master',                       // 9
  'White', 'Dark',                // 10-11 (special storage)
];

export var RUPIE_COLORS = [
  '#f44', '#4488ff', '#4caf50',
  '#bb86fc', '#ffe066', '#ff9800',
  '#4dd0e1', '#f48fb1', '#e53935',
  '#ffd700',
  '#eee', '#666',
];

// Collectible data: [name, bonPerLv, effectCategory, effectDescription]
export var COLLECTIBLE_DATA = [
  ['Abnormal Rupie',     20, 'rupie-add',    '+{% rupie value'],
  ['Sapphire Droplet',   10, 'production',   '+{% jar production'],
  ['Effervescent Diamond',20,'opal',         '}x opal chance'],
  ['Tortole Rock',       25, 'rupie-mul',    '}x rupie value'],
  ['Natural Pearl',      15, 'village',      '+{% villager EXP'],
  ['Amethyst Heartstone',10, 'other',        '-{% skilling cavern req'],
  ['Amber Square',       25, 'rupie-add',    '+{% rupie value'],
  ['Verdant Thorns',     25, 'collectible',  '}x collectible chance'],
  ['Violent Violets',    20, 'other',        '}x bucket fill rate'],
  ['Blue Faberge Egg',   15, 'enchant',      '}x enchant chance'],
  ['Shadow Prism',       20, 'village',      '+{% villager EXP'],
  ['Big Beef Rock',      25, 'bell',         '}x bell ring rate'],
  ['Emerald Ore',        30, 'village',      '+{% villager EXP'],
  ['Dawn Prism',         30, 'rupie-add',    '+{% rupie value'],
  ['Swampstone',         25, 'opal',         '}x opal chance'],
  ['Frost Spirestone',   12, 'production',   '+{% jar production'],
  ['Rosemerald',         10, 'other',        '}x Bolaia study rate'],
  ['Blood Glass',        40, 'rupie-mul',    '}x rupie value'],
  ['Sunrise Diamond',    25, 'enchant',      '}x enchant chance'],
  ['Minceraft Gem',      20, 'other',        '+{% Monument AFK gain'],
  ['Crimson Spade',      20, 'other',        '}x harp notes'],
  ['Stained Glassdrop',  35, 'rupie-add',    '+{% rupie value'],
  ['Tabula Rasastone',   32, 'village',      '+{% villager EXP'],
  ['Deep Blue Square',    1, 'gambit',       '+{% Gambit PTS'],
  ['Earthbound Geode',   15, 'production',   '+{% jar production'],
  ['Inferno Droplet',    40, 'collectible',  '}x collectible chance'],
  ['Octogonal Gem',      30, 'enchant',      '}x enchant chance'],
  ['Solarfang',          32, 'opal',         '}x opal chance'],
  ['Mystic Ore',         50, 'rupie-mul',    '}x rupie value'],
  ['Arcane Prism',       38, 'village',      '+{% villager EXP'],
  ['Murky Faberge Egg',   1, 'gambit',       '+{% Gambit PTS'],
  ['Corpore Rock',        1, 'future',       'Future cavern'],
  ['Twilight Prism',      1, 'future',       'Future cavern'],
  ['Tewball Orbstone',   40, 'rupie-add',    '+{% rupie value'],
  ['Mad Muscle Rock',    40, 'enchant',      '}x enchant chance'],
  ['Sunroot Splinters',  40, 'village',      '+{% villager EXP'],
  ['Twisted Rupie',      75, 'bell',         '}x bell ring rate'],
  ['Future 37',           1, 'future',       'Future cavern'],
  ['Future 38',           1, 'future',       'Future cavern'],
  ['Future 39',           1, 'future',       'Future cavern'],
];

export var CATEGORY_COLORS = {
  'rupie-add': '#ffd700',
  'rupie-mul': '#ff9800',
  'production': '#4caf50',
  'opal': '#4dd0e1',
  'collectible': '#bb86fc',
  'enchant': '#f48fb1',
  'village': '#90caf9',
  'bell': '#a5d6a7',
  'gambit': '#ef5350',
  'other': '#b0bec5',
  'future': '#555',
};

export var CATEGORY_LABELS = {
  'rupie-add': 'Rupie +%',
  'rupie-mul': 'Rupie ×',
  'production': 'Production',
  'opal': 'Opal Chance',
  'collectible': 'Collect Chance',
  'enchant': 'Enchant Chance',
  'village': 'Village EXP',
  'bell': 'Bell Rate',
  'gambit': 'Gambit PTS',
  'other': 'Other',
  'future': 'Future',
};

// B_UPG data: [index, name, effectVal, effectDesc, costCurrencyRupieIdx, costAmount]
// costCurrencyRupieIdx: which Holes[9][20+x] currency, costAmount for display
export var B_UPG_DATA = [
  [62, 'Big Jar Mach II',    1,  '+1 base rupie value',               0,   10],
  [63, 'Big Jar Mach III',   1,  '2 production slots',                1,    0],
  [64, 'Big Jar Mach IV',   50,  '+50% extra rupie chance',           2,    0],
  [65, 'Big Jar Mach V',     2,  '+2 base rupie value',               4,    0],
  [66, 'Big Jar Mach VI',    1,  '3 production slots',                5,    0],
  [67, 'Big Jar Mach VII',  30,  '-30% production requirement',       7,    0],
  [68, 'Big Jar Mach VIII',  4,  '+4 base rupie value',               9,    0],
  [69, 'Break All Button',   1,  'Enables Break All',                 1,  200],
  [70, 'Monument Days',      2,  '+2 days monument reward',           4,    0],
  [71, 'Supergiant Jars',    1,  'Jars combine into tiers',           0,   25],
  [72, 'Light Speed',       10,  '+10% prod per log10(white rupies)', 5,    0],
  [73, 'Dark Luck',          1,  '1.10x enchant per log10(dark)',     7,    0],
  [74, 'Jar Prod Line',      5,  '-5% req per log10(prev type made)', 2,    0],
  [75, 'Advanced Collection',1,  'Unlocks page 2 collectibles (16-39)',8,   0],
  [76, "Collect 'Em All",    1,  '1.02x collect per rupie digit',     3,    0],
  [77, 'Roaring Flame',     25,  '+25% double torch chance',          6,    0],
  [78, 'The Sicilian',      10,  '+10% Total Gambit Score',           5,    0],
  [79, 'Evertree Trickledown',1, 'Skill eff per Evertree trunk',     0,  400],
  [80, 'Evertree Synergy',   1,  '1.10x rupie per Evertree trunk',   0,  100],
];

var B_UPG_GROUPS = {
  'Rupie Value':  [62, 65, 68, 80],
  'Slots':        [63, 66],
  'Production':   [67, 72, 74],
  'Chances':      [73, 75, 76],
  'Utility':      [64, 69, 71],
  'Cross-System': [70, 77, 78, 79],
};
export { B_UPG_GROUPS };

// ========== SAVE DATA HELPERS ==========
function _h(saveData, i) {
  return saveData.holesData[i] || [];
}

function _bUpg(saveData, idx) {
  return (Number(_h(saveData, 13)[idx]) || 0) >= 1 ? 1 : 0;
}

function _bUpgVal(saveData, idx, val) {
  return _bUpg(saveData, idx) * val;
}

// ========== MEASUREMENT HELPERS ==========
function _cosmoBonus(saveData, tier, idx) {
  var base = cosmoUpgBase(tier, idx);
  var lv = Number(_h(saveData, 4 + tier)[idx]) || 0;
  return Math.floor(base * lv);
}

function _overkillQTY(saveData) {
  var nChars = numCharacters || (saveData.lv0AllData ? saveData.lv0AllData.length : 0);
  var riftLv = Number(saveData.riftData && saveData.riftData[0]) || 0;
  var sum = 0;
  // Worlds 0-6: regular death note mobs
  var worldCount = Math.min(7, DeathNoteMobs.length);
  for (var w = 0; w < worldCount; w++) {
    var mobs = DeathNoteMobs[w];
    if (!mobs) continue;
    var worldSum = 0;
    for (var m = 0; m < mobs.length; m++) {
      var mapIdx = MapAFKtarget.indexOf(mobs[m]);
      if (mapIdx < 0) continue;
      var killReq = Number(MapDetails[mapIdx] && MapDetails[mapIdx][0] && MapDetails[mapIdx][0][0]) || 0;
      var totalKills = 0;
      for (var ci = 0; ci < nChars; ci++) {
        var kla = klaData[ci];
        var klaEntry = kla && kla[mapIdx];
        var remaining = Number(Array.isArray(klaEntry) ? klaEntry[0] : klaEntry) || 0;
        totalKills += killReq - remaining;
      }
      worldSum += deathNoteRank(Math.max(0, totalKills), 0, riftLv);
    }
    sum += worldSum;
  }
  // World 7 (Ninja): uses NinjaInfo[30] mob list and Ninja[105] kill data
  var ninjaList = NinjaInfo && NinjaInfo[30];
  var ninja105 = saveData.ninjaData && saveData.ninjaData[105];
  if (ninjaList && ninja105) {
    for (var n = 0; n < ninjaList.length; n++) {
      var nk = Number(ninja105[n]) || 0;
      sum += deathNoteRank(Math.max(0, nk), 7842, riftLv);
    }
  }
  return sum;
}

function _measMulti(saveData, typeIdx) {
  var qty = 0;
  switch (typeIdx) {
    case 0: { var raw = Number(_h(saveData, 11)[28]) || 0; qty = raw > 0 ? getLOG(raw) : 0; break; }
    case 1: { qty = (saveData.farmCropCount || 0) / 14; break; }
    case 2: { qty = tomeQTY(5, saveData) / 500; break; }
    case 3: { qty = computeTomeScore(saveData, 0, saveData) / 2500; break; }
    case 4: { var sk = tomeQTY(11, saveData); qty = sk / 5000 + Math.max(0, sk - 18000) / 1500; break; }
    case 5: { qty = 0; break; }
    case 6: { qty = _overkillQTY(saveData) / 125; break; }
    case 7: { var hi = Number((saveData.tasksGlobalData?.[0]?.[1] || [])[0]) || 0; qty = hi > 0 ? getLOG(hi) / 2 : 0; break; }
    case 8: { qty = (saveData.cards1Data?.length || 0) / 150; break; }
    case 9: { var h26 = _h(saveData, 26); var sum = 0; for (var j = 0; j < h26.length; j++) sum += Number(h26[j]) || 0; qty = sum / 6; break; }
    case 10: { var gk = Number(_h(saveData, 11)[63]) || 0; qty = gk > 0 ? Math.max(0, getLOG(gk) - 2) : 0; break; }
    default: qty = 0;
  }
  if (qty < 5) return 1 + 18 * qty / 100;
  return 1 + (18 * qty + 8 * (qty - 5)) / 100;
}

function _measBonus(saveData, idx) {
  var measLv = Number(_h(saveData, 22)?.[idx]) || 0;
  if (measLv <= 0) return 0;
  var cosmo13 = _cosmoBonus(saveData, 1, 3);
  var baseStr = holesMeasBase(idx) || '0';
  var isTOT = String(baseStr).includes('TOT');
  var baseNum = parseFloat(baseStr) || 0;
  var measBase;
  if (isTOT) {
    measBase = (1 + cosmo13 / 100) * (baseNum * measLv / (100 + measLv));
  } else {
    measBase = (1 + cosmo13 / 100) * baseNum * measLv;
  }
  var measType = holesMeasType(idx);
  return measBase * _measMulti(saveData, measType);
}

// ========== SAVE DATA EXTRACTION ==========
// JarTypesOwned = additional types purchased above the free base jar (type 0).
// Value 0..9.  Total available types = jarTypesOwned + 1.
export function jarTypesOwned(saveData) {
  return Math.round(Number(_h(saveData, 11)[37]) || 0);
}

export function totalJarTypes(saveData) {
  return jarTypesOwned(saveData) + 1;
}

export function rupieBalance(saveData, type) {
  if (type === 10) return Number(_h(saveData, 11)[38]) || 0;  // White
  if (type === 11) return Number(_h(saveData, 11)[39]) || 0;  // Dark
  return Number(_h(saveData, 9)[20 + type]) || 0;  // 0-9 standard + master
}

export function opalsFromJars(saveData) {
  return Number(_h(saveData, 7)[10]) || 0;
}

export function doublerBonus(saveData) {
  return Number(_h(saveData, 11)[60]) || 0;
}

export function targetedEnchantIdx(saveData) {
  var v = Number(_h(saveData, 11)[62]);
  return isNaN(v) ? -1 : v;
}

export function collectibleLevel(saveData, idx) {
  return Number(_h(saveData, 24)[idx]) || 0;
}

export function collectibleLevels(saveData) {
  var out = [];
  for (var i = 0; i < 40; i++) out[i] = collectibleLevel(saveData, i);
  return out;
}

export function productionSlotType(saveData, slot) {
  return Number(_h(saveData, 25)[slot]) || 0;
}

export function productionSlotProgress(saveData, slot) {
  return Number(_h(saveData, 25)[slot + 3]) || 0;
}

export function bupgOwned(saveData, idx) {
  return _bUpg(saveData, idx);
}

export function whiteRupies(saveData) {
  return rupieBalance(saveData, 10);
}

export function darkRupies(saveData) {
  return rupieBalance(saveData, 11);
}

export function jarsProducedOfType(saveData, jarType) {
  return Number(_h(saveData, 11)[40 + jarType]) || 0;
}

export function evertreeTrunks(saveData) {
  return Number(_h(saveData, 11)[5]) || 0;
}

// ========== PRODUCTION SLOTS ==========
export function productionSlots(saveData) {
  if (_bUpg(saveData, 66)) return 3;
  if (_bUpg(saveData, 63)) return 2;
  return 1;
}

// ========== COLLECTIBLE BONUS ==========
// JarCollectibleBonus(t) = Holes[24][t] * bonPerLv(t) * (1 + LegendPTS29/100)
// For now, we read bonPerLv from COLLECTIBLE_DATA; LegendPTS bonus is an external.
export function collectibleBonus(saveData, idx, extLegendPts29) {
  var lv = collectibleLevel(saveData, idx);
  var bpl = COLLECTIBLE_DATA[idx][1];
  return lv * bpl * (1 + (extLegendPts29 || 0) / 100);
}

// Sum of collectible bonuses for a list of indices
function _cbSum(saveData, indices, extLegendPts29) {
  var sum = 0;
  for (var i = 0; i < indices.length; i++) {
    sum += collectibleBonus(saveData, indices[i], extLegendPts29);
  }
  return sum;
}

// ========== LAMP BONUS ==========
function _lampBonus99(saveData) {
  var lampLv = Number(_h(saveData, 21)[7]) || 0;
  var zmLv = Number(saveData.spelunkData?.[45]?.[2]) || 0;
  return 25 * lampLv * (1 + zmLv / 100);
}

// ========== FORMULAS ==========

// --- Rupie Value ---
export function rupieValue(saveData, ext) {
  ext = ext || {};
  var base = 1 + _bUpgVal(saveData, 62, 1) + _bUpgVal(saveData, 65, 2) + _bUpgVal(saveData, 68, 4);
  var ola355 = Math.max(1, Math.pow(1.5, ext.ola355 || 0));
  var lamp = 1 + _lampBonus99(saveData) / 400;
  var monument = 1 + (ext.monument2_1 || 0) / 100;
  var m10 = _measBonus(saveData, 10);
  var m14 = _measBonus(saveData, 14);
  var meas = 1 + (m10 + m14) / 100;
  var evertree = Math.max(1, _bUpg(saveData, 80) * Math.pow(1.1, evertreeTrunks(saveData)));
  var doubler = 1 + doublerBonus(saveData) / 100;
  var lp = ext.legendPts29 || 0;
  var cb3 = 1 + collectibleBonus(saveData, 3, lp) / 100;
  var cb17 = 1 + collectibleBonus(saveData, 17, lp) / 100;
  var cb28 = 1 + collectibleBonus(saveData, 28, lp) / 100;
  var cbAdd = 1 + _cbSum(saveData, [0, 6, 13, 21, 33], lp) / 100;
  var stamp = 1 + (ext.stampCavernRes || 0) / 100;

  return base * ola355 * lamp * monument * meas * evertree * doubler
       * cb3 * cb17 * cb28 * cbAdd * stamp;
}

// Rupie value multiplier breakdown — returns array of [label, value] pairs
export function rupieValueBreakdown(saveData, ext) {
  ext = ext || {};
  var lp = ext.legendPts29 || 0;
  var parts = [];
  parts.push(['Base (1 + B62 + B65 + B68)', 1 + _bUpgVal(saveData, 62, 1) + _bUpgVal(saveData, 65, 2) + _bUpgVal(saveData, 68, 4)]);
  if (ext.ola355) parts.push(['Server Event (1.5^' + ext.ola355 + ')', Math.pow(1.5, ext.ola355)]);
  var lamp99 = _lampBonus99(saveData);
  if (lamp99) parts.push(['Lamp Wish 99 (+' + lamp99.toFixed(1) + ')', 1 + lamp99 / 400]);
  if (ext.monument2_1) parts.push(['Monument (Wisdom)', 1 + ext.monument2_1 / 100]);
  var m10 = _measBonus(saveData, 10), m14 = _measBonus(saveData, 14);
  if (m10 + m14) parts.push(['Measurements 10+14 (' + m10.toFixed(1) + '+' + m14.toFixed(1) + ')', 1 + (m10 + m14) / 100]);
  if (_bUpg(saveData, 80)) parts.push(['Evertree Synergy (1.10^' + evertreeTrunks(saveData) + ')', Math.pow(1.1, evertreeTrunks(saveData))]);
  var db = doublerBonus(saveData);
  if (db) parts.push(['Doubler Jar (+' + db + '%)', 1 + db / 100]);
  var c3 = collectibleBonus(saveData, 3, lp);
  if (c3) parts.push(['CB3 Tortole Rock', 1 + c3 / 100]);
  var c17 = collectibleBonus(saveData, 17, lp);
  if (c17) parts.push(['CB17 Blood Glass', 1 + c17 / 100]);
  var c28 = collectibleBonus(saveData, 28, lp);
  if (c28) parts.push(['CB28 Mystic Ore', 1 + c28 / 100]);
  var addSum = _cbSum(saveData, [0, 6, 13, 21, 33], lp);
  if (addSum) parts.push(['CB Additive (0,6,13,21,33)', 1 + addSum / 100]);
  if (ext.stampCavernRes) parts.push(['Stamp (CavernRes)', 1 + ext.stampCavernRes / 100]);
  return parts;
}

// --- Extra Rupie Chance ---
export function extraRupieChance(saveData, ext) {
  ext = ext || {};
  return ((ext.bell4 || 0) + (ext.cosmo0_3 || 0) + _bUpgVal(saveData, 64, 50)) / 100;
}

export function avgRupiesPerBreak(saveData, ext) {
  var chance = extraRupieChance(saveData, ext);
  return 1 + chance;  // floor(1 + chance + rand()) averages to 1+chance
}

// --- Production Per HR ---
export function productionPerHR(saveData, ext) {
  ext = ext || {};
  var lp = ext.legendPts29 || 0;
  var meas12 = _measBonus(saveData, 12);
  var cbProd = _cbSum(saveData, [1, 15, 24], lp) + meas12;
  var lightspeed = _bUpgVal(saveData, 72, 10) * getLOG(whiteRupies(saveData)) / 100;
  return 36000 * (1 + cbProd / 100) * (1 + lightspeed);
}

export function productionPerHRBreakdown(saveData, ext) {
  ext = ext || {};
  var lp = ext.legendPts29 || 0;
  var parts = [];
  parts.push(['Base', 36000]);
  var cb1 = collectibleBonus(saveData, 1, lp);
  if (cb1) parts.push(['CB1 Sapphire Droplet', cb1]);
  var cb15 = collectibleBonus(saveData, 15, lp);
  if (cb15) parts.push(['CB15 Frost Spirestone', cb15]);
  var cb24 = collectibleBonus(saveData, 24, lp);
  if (cb24) parts.push(['CB24 Earthbound Geode', cb24]);
  var meas12 = _measBonus(saveData, 12);
  if (meas12) parts.push(['Measurement 12', meas12]);
  if (_bUpg(saveData, 72)) {
    var ls = _bUpgVal(saveData, 72, 10) * getLOG(whiteRupies(saveData));
    parts.push(['Light Speed (' + ls.toFixed(1) + '%)', ls]);
  }
  return parts;
}

// --- Production REQ ---
export function productionREQ(saveData, jarType) {
  var b67 = _bUpgVal(saveData, 67, 30);
  var prevTypeProduced = jarsProducedOfType(saveData, Math.max(0, jarType - 1));
  var b74 = _bUpgVal(saveData, 74, 5) * getLOG(prevTypeProduced);
  return (1000 + 2000 * jarType) / ((1 + b67 / 100) * (1 + b74 / 100));
}

// --- Time to tier N for a slot ---
export function timeToTier(saveData, jarType, tier, ext) {
  var req = productionREQ(saveData, jarType);
  var prodPerHr = productionPerHR(saveData, ext);
  var progressNeeded = req * Math.pow(10, tier);
  return progressNeeded / prodPerHr;  // hours
}

// --- Jar New Type Cost ---
export function newJarCost(saveData) {
  var owned = jarTypesOwned(saveData);
  return 50 * Math.pow(1 + owned, 1.5) * Math.pow(4.8, owned);
}

export function newJarCurrencyType(saveData) {
  return jarTypesOwned(saveData);  // pays with Holes[9][20+owned]
}

export function canAffordNewJar(saveData) {
  var owned = jarTypesOwned(saveData);
  if (owned >= 9) return false;
  return rupieBalance(saveData, owned) >= newJarCost(saveData);
}

// ========== CHANCE FORMULAS ==========

// --- Opal Chance ---
export function opalChance(saveData, ext) {
  ext = ext || {};
  var lp = ext.legendPts29 || 0;
  return 0.25 * Math.pow(0.43, opalsFromJars(saveData))
    * (1 + collectibleBonus(saveData, 2, lp) / 100)
    * (1 + collectibleBonus(saveData, 14, lp) / 100)
    * (1 + collectibleBonus(saveData, 27, lp) / 100);
}

// --- Collectible Chance ---
export function collectibleChance(saveData, ext) {
  ext = ext || {};
  var lp = ext.legendPts29 || 0;
  var levels = collectibleLevels(saveData);
  var found = 0;
  for (var i = 0; i < 40; i++) if (levels[i] >= 1) found++;

  // Digit count from B76
  var digitSum = 0;
  if (_bUpg(saveData, 76)) {
    for (var r = 0; r < 10; r++) {
      digitSum += Math.ceil(getLOG(rupieBalance(saveData, r)));
    }
  }

  var multi = (1 + collectibleBonus(saveData, 7, lp) / 100)
    * Math.max(1, Math.pow(1.02, digitSum))
    * (1 + collectibleBonus(saveData, 25, lp) / 100)
    * (1 + (ext.paletteBonus2 || 0) / 100)
    * (1 + (ext.exoticBonus52 || 0) / 100)
    * Math.max(1, Math.pow(1.05, ext.spelunk6Len || 0) * (ext.superBit32 || 1));

  if (found === 0) return 0.25;
  if (found < 16) return 0.2 * multi / (1 + Math.pow(found, 1.9));
  return 0.2 * multi / ((1 + Math.pow(found, 1.9)) * Math.pow(1.5, Math.max(0, found - 16)));
}

export function collectiblesFound(saveData) {
  var levels = collectibleLevels(saveData);
  var count = 0;
  for (var i = 0; i < 40; i++) if (levels[i] >= 1) count++;
  return count;
}

// --- Enchant Chance ---
export function totalEnchantLevels(saveData) {
  var levels = collectibleLevels(saveData);
  var sum = 0;
  for (var i = 0; i < 40; i++) {
    if (levels[i] >= 2) sum += levels[i] - 1;
  }
  return sum;
}

export function enchantChance(saveData, ext) {
  ext = ext || {};
  var lp = ext.legendPts29 || 0;
  var E = totalEnchantLevels(saveData);
  var base = 0.35 / (1 + Math.pow(E, 1.23) + Math.pow(1.1, E));
  var darkLuck = Math.max(1, _bUpg(saveData, 73) * Math.pow(1.1, getLOG(darkRupies(saveData))));
  return base
    * (1 + collectibleBonus(saveData, 9, lp) / 100)
    * darkLuck
    * (1 + collectibleBonus(saveData, 18, lp) / 100)
    * (1 + (ext.bolaia10 || 0) / 100)
    * (1 + collectibleBonus(saveData, 26, lp) / 100)
    * (1 + collectibleBonus(saveData, 34, lp) / 100);
}

// --- Targeted Enchant Chance ---
export function targetedEnchantProb(saveData) {
  var found = collectiblesFound(saveData);
  if (found <= 0) return 0;
  return 5 / (found + 3);
}

// ========== DOUBLER ANALYSIS ==========
export function doublerTierValue(tier) {
  return 100 * Math.pow(3, tier);
}

export function doublerMultiplier(tier) {
  return 1 + doublerTierValue(tier) / 100;
}

// ========== RUPIE TYPE ESCALATION ==========
// Returns [minType, maxType] given the jar type and current rupie balances
export function rupieTypeRange(saveData, jarType) {
  if (jarType === 0) {
    if (rupieBalance(saveData, 1) >= 1000) return [0, 2];
    if (rupieBalance(saveData, 0) >= 100) return [0, 1];
    return [0, 0];
  }
  if (jarType === 3) {
    if (rupieBalance(saveData, 4) >= 500000) return [3, 5];
    if (rupieBalance(saveData, 3) >= 10000) return [3, 4];
    return [3, 3];
  }
  if (jarType === 5) return [10, 10];  // White rupie
  if (jarType === 6) {
    if (rupieBalance(saveData, 7) >= 50000000) return [6, 8];
    if (rupieBalance(saveData, 6) >= 6000000) return [6, 7];
    return [6, 6];
  }
  if (jarType === 8) return [11, 11];  // Dark rupie
  if (jarType === 9) return [9, 9];    // Master rupie
  return [0, 0]; // types 1,2,4,7 don't give rupies
}

// ========== ENCHANT PRIORITY ==========
// Returns array of {idx, name, level, bonus, marginalValue, category} sorted by priority
export function enchantPriority(saveData, ext) {
  ext = ext || {};
  var lp = ext.legendPts29 || 0;
  var levels = collectibleLevels(saveData);
  var items = [];
  for (var i = 0; i < 40; i++) {
    if (levels[i] < 1) continue; // not found
    var cd = COLLECTIBLE_DATA[i];
    var currentBonus = collectibleBonus(saveData, i, lp);
    // Marginal = what +1 enchant level adds
    var marginal = cd[1] * (1 + lp / 100);
    items.push({
      idx: i,
      name: cd[0],
      level: levels[i],
      enchantLevels: Math.max(0, levels[i] - 1),
      bonPerLv: cd[1],
      totalBonus: currentBonus,
      marginalValue: marginal,
      category: cd[2],
      categoryLabel: CATEGORY_LABELS[cd[2]],
      description: cd[3],
    });
  }
  // Sort: highest marginal value first; within same, lowest current enchant first
  items.sort(function(a, b) {
    if (b.marginalValue !== a.marginalValue) return b.marginalValue - a.marginalValue;
    return a.enchantLevels - b.enchantLevels;
  });
  return items;
}

// ========== EXPECTED HOURS HELPERS ==========
export function expectedBreaksToEvent(chance) {
  if (chance <= 0) return Infinity;
  if (chance >= 1) return 1;
  return 1 / chance;
}

export function expectedHoursToEvent(saveData, ext, jarType, chance) {
  if (chance <= 0) return Infinity;
  var req = productionREQ(saveData, jarType);
  var prodHr = productionPerHR(saveData, ext);
  var jarsPerHr = prodHr / req;
  var breaksNeeded = expectedBreaksToEvent(chance);
  return breaksNeeded / jarsPerHr;
}

// ========== PAGE 2 UNLOCKED ==========
export function page2Unlocked(saveData) {
  return _bUpg(saveData, 75) === 1;
}

// ========== BREAK ALL UNLOCKED ==========
export function breakAllUnlocked(saveData) {
  return _bUpg(saveData, 69) === 1;
}
