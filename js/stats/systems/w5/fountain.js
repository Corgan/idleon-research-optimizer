// ===== FOUNTAIN CAVE SYSTEM (W5) =====
// Computation logic for The Fountain upgrades, currency, and externals.

import { cosmoUpgBase, holesBolaiaPerLv, holesMeasBase, holesMeasType } from '../../data/w5/hole.js';
import { arcadeBonus } from '../w2/arcade.js';
import { getLOG } from '../../../formulas.js';
import { tomeQTY, computeTomeScore } from '../w4/tome-score.js';
import { deathNoteRank } from '../w7/research-math.js';
import { numCharacters, klaData } from '../../../save/data.js';
import { DeathNoteMobs, MapAFKtarget, MapDetails, NinjaInfo } from '../../data/game/customlists.js';

// ========== CONSTANTS ==========
export var WATER_NAMES = ['Blue', 'Yellow', 'Green'];
export var WATER_COLORS = ['#64b5f6', '#ffe066', '#a5d6a7'];
export var WATERS_IMPLEMENTED = 3;
export var CURRENCY_NAMES = [
  'Bronze Coins', 'Silver Coins', 'Golden Coins',
  'Dollar Bills', 'Credit Bills', 'Treasury Bills',
  'Moolah Stacks', 'Shilling Stacks', 'Greane Stacks'
];
var BAR_FILL_TIMES = [7200, 36000, 90000]; // seconds: 2h, 10h, 25h

// ========== UPG_DATA ==========
// Format: [name, prereqIdx, xy, currencyTypeIdx, baseCost, costScale, bonPerLv, description]
export var UPG_DATA = [
  // Water 0 (Blue)
  [
    ['Yellow Water',6,'85,169',2,100000,1.10,1,'Unlock Yellow Water. Tap the Change Water button to toggle which water the Fountain is using. Also, }x Currency Value'],
    ['Currency Booster I',4,'171,145',2,1500,1.20,10,'All currencies are worth +{% more.'],
    ['Penny Lane',9,'390,86',0,1,1.06,1,'Increases the value of Bronze Coins.'],
    ['Nickel and Diming',12,'301,161',1,1,1.12,1,'You can now find Silver Coins.'],
    ['Dubloon Desires',8,'229,171',2,1,1.13,1,'You can now find Golden Coins.'],
    ["Stackin' Silver",3,'326,223',0,10,1.10,5,'Silver coins are worth }x more.'],
    ["Stackin' Gold",19,'101,232',1,15,1.10,5,'Golden coins are worth }x more.'],
    ["Stackin' Dollars",6,'24,183',2,25,1.10,5,'Dollar Bills are worth }x more.'],
    ['Money Back Guarantee',5,'260,228',1,25,1.15,1,'Currency generated while at maximum capacity auto collected at $% of their value.'],
    ['Fountain Filling',-1,'457,110',0,1,1.10,2,'Every time the fountain fills up, it creates a new coin.'],
    ['Extra Space',2,'328,63',0,5,20,1,'Coins can appear in $ different areas on the ground.'],
    ['Taller Stacks',3,'267,104',1,25,4,1,'Each area can stack up to $ coins.'],
    ['Water Bender',2,'364,147',0,10,1.30,10,'The fountain fills up $x faster while actively standing in this cavern.'],
    ['Monumental Boost',18,'698,225',2,250,2.50,1,'All Bravery Monument bonuses are }x larger.'],
    ['Cosmological Boost',9,'520,83',0,5,1.15,1,"Cosmo the Villager gains }x more EXP than normal."],
    ['Golden Bucket Boost',16,'644,78',1,25,1.10,5,'Your 1st bucket at The Well cavern is golden. Golden buckets have }x fill rate.'],
    ['Class EXP Boost',14,'581,64',0,50,1.12,1,'Boosts Class EXP gain by }x'],
    ['Treasure Boost',15,'709,112',1,100,1.20,3,'All Sailing Chests contain }x more Treasure!'],
    ['Orion Boost',17,'670,167',2,150,1.12,5,'Permanently boost Feather Generation rate at Orion by }x'],
    ['Mythril Transience',4,'159,205',2,800,1.20,1,'Bronze, silver, and gold coins are worth +{% more per POW 10 Mythril you have.'],
  ],
  // Water 1 (Yellow)
  [
    ['Green Water',1,'104,239',5,1000000,1.10,2,'Unlock Green Water. Also, }x Currency Value!'],
    ['Currency Booster II',4,'166,218',5,10000,1.20,20,'All currencies are worth +{% more.'],
    ['Dolla Dolla Bills',10,'404,145',3,1,1.13,1,'You can now find Dollar Bills.'],
    ['Credit Swisse',12,'328,140',4,1,1.14,1,'You can now find Credit Bills.'],
    ['In Gov We Trust',9,'190,160',5,1,1.15,1,'You can now find Treasury Bills.'],
    ["Stackin' Creds",3,'300,80',3,50,1.10,5,'Credit bills are worth }x more.'],
    ["Stackin' T-Bills",4,'134,146',4,100,1.10,5,'Treasury bills are worth }x more.'],
    ["Stackin' Monayy",0,'41,227',5,250,1.10,1,'Moolah Stacks are worth }x more.'],
    ['Royal Stacks',5,'238,97',3,100,1.15,1,'1 in $ chance for a currency stack to become royal when the fountain fills.'],
    ['Regal Riches',8,'249,153',4,250,1.25,10,'Royal stacks are worth $x more.'],
    ['Marble Filling',-1,'463,113',2,50000,1.10,5,'Adds a new fountain bar which when filled creates $ marble.'],
    ['Greatest Desire',9,'274,210',4,500,1.15,5,'Click and HOLD a currency to DESIRE it, making them worth }x more when collected.'],
    ['Turn and Push',2,'374,85',3,250,1.15,10,'Click a currency to IGNORE it. Also, +{% all currency'],
    ['Judicial Boost',18,'653,64',5,5000,2.50,1,'All Justice Monument bonuses are }x larger.'],
    ['Skim Reading',10,'524,98',3,25,1.20,3,"Boost Study Rate for Bolaia the Villager by }x"],
    ['Fine Tuning',16,'642,139',4,250,1.15,2,'All your Harp Strings gain }x more exp than normal'],
    ["Swingy O' Sword",14,'582,117',3,100,1.13,1,'Boosts Damage for all characters by }x'],
    ['Summoneer',15,'702,149',4,500,1.15,3,'All Summoning Essence generation is }x greater'],
    ['Better Poppy',17,'711,92',5,1500,1.10,5,'Permanently boost Fish Generation rate at Poppy by }x'],
    ['Sharp Surrogate',6,'79,157',5,10000,1.20,1,'Dollar, Credit, and Treasury bills are worth +{% more per POW 10 Sharp Notes you have.'],
  ],
  // Water 2 (Green/Red)
  [
    ['Red Water',6,'53,142',8,1000000000,1.50,3,"Unlock Red Water. Also, }x Currency Value!"],
    ['Currency Booster III',5,'154,209',6,10000000,1.70,30,'All currencies are worth +{% more.'],
    ['Moolahleluja',12,'390,151',6,5000,1.40,1,'You can now find Moolah Stacks.'],
    ['Shillin Grillin',8,'275,209',7,20000,1.60,1,'You can now find Shilling Stacks.'],
    ['Rob Greane',1,'95,230',8,100000,1.80,1,'You can now find Greane Stacks.'],
    ["Stackin' Shillin",3,'217,225',6,50000,1.30,1,'Shilling Stacks are worth }x more.'],
    ["Stackin' Gbacks",4,'33,199',7,200000,1.50,1,'Greane Stacks are worth }x more.'],
    ["Stackin' Funds",19,'121,142',8,1000000,1.70,1,'Oldmoney Stacks are worth }x more.'],
    ["Luck fo' REAL",2,'333,181',6,10000,1.50,1,'1 in $ chance for a currency to be LUCKY, multiplying its value forever!'],
    ['Skilluck',11,'364,64',8,350000,1.90,1,'Boosts bonus of each LUCKY coin to +$%.'],
    ['Lucky Ducky',11,'247,127',8,100000,1.70,1,'Boost Rubber Ducky and LUCKY coin chance by +{%'],
    ['Ducktactular',8,'309,106',7,10000,1.50,1,'Your Rubber Duckies each boost the value of all coins by }x.'],
    ['Rubber Ducky',-1,'447,117',5,10000000,10.00,5,'Adds a new fountain bar which when filled has a 1 in $ chance of giving +1 Rubber Ducky.'],
    ['Wisdom Boost',18,'640,136',7,10000,50.00,1,'All Wisdom Monument bonuses are }x larger.'],
    ["Minau's Costs",12,'505,82',6,15000,8.50,1,"Minau the Villager's upgrades are }x cheaper."],
    ['Enchanterest',17,'685,74',7,25000,4.00,1,'Your Enchant chance at The Jar is }x larger.'],
    ['Pen N Paper',14,'565,94',6,50000,20.00,1,'Boosts Research EXP gain by }x'],
    ['Cook Maxxing',16,'623,61',8,100000,6.20,1,'Boosts Cooking Mastery EXP gain by }x.'],
    ['Bubba Forever',15,'706,133',7,250000,5.40,2,'Permanently boost Meat Slice Production at Bubba by }x'],
    ['Rupie Monie',1,'185,149',7,1000000,2.50,1,'Moolah, Shilling, and Greane stacks worth +{% more per POW 10 Red Rupie.'],
  ],
];

// ========== SAVE DATA HELPERS ==========
function _h(saveData, i) {
  return saveData.holesData[i] || [];
}

export function fountainLv(saveData) {
  return Number(_h(saveData, 7)[15]) || 0;
}

export function upgLvs(saveData) {
  var raw = saveData.holesData[31];
  var out = [[], [], []];
  if (!raw) return out;
  for (var w = 0; w < 3; w++) {
    var a = raw[w] || [];
    for (var u = 0; u < 20; u++) out[w][u] = Number(a[u]) || 0;
  }
  return out;
}

export function marbleLvs(saveData) {
  var raw = saveData.holesData[32];
  var out = [[], [], []];
  if (!raw) return out;
  for (var w = 0; w < 3; w++) {
    var a = raw[w] || [];
    for (var u = 0; u < 20; u++) out[w][u] = Number(a[u]) || 0;
  }
  return out;
}

export function marbleCurrency(saveData) {
  return Number(_h(saveData, 11)[81]) || 0;
}

export function desiredCurrency(saveData) {
  return Number(_h(saveData, 11)[82]) || 0;
}

// ========== CURRENCY IGNORE STATE ==========
// Holes[11][83] stores a string of letter codes for ignored types.
// Game uses indexOf(Number2Letter[typeIdx]): 0='_', 1='a', 2='b', ...
// If the letter is found in the string, that type is ignored.
var _NUM2LETTER = '_abcdefgh';

export function currencyIgnoreStr(saveData) {
  return String(_h(saveData, 11)[83] || '');
}

export function currencyIgnored(saveData, typeIdx) {
  var s = currencyIgnoreStr(saveData);
  var letter = _NUM2LETTER.charAt(typeIdx);
  if (!letter) return false;
  return s.indexOf(letter) !== -1;
}

export function ignoreUnlocked(uLvs, mLvs) {
  // Turn and Push = W1U12
  return (uLvs[1][12] || 0) >= 1;
}

// Active types = unlocked AND not-ignored
export function activeCurrencyTypes(saveData, uLvs, mLvs) {
  var out = [];
  for (var t = 0; t < 9; t++) {
    if (!currencyUnlocked(uLvs, mLvs, t)) continue;
    if (!currencyIgnored(saveData, t)) out.push(t);
  }
  return out;
}

export function fountCurrencyAvail(saveData, typeIdx) {
  return Number(_h(saveData, 9)[30 + typeIdx]) || 0;
}

export function fountLvCurrencyType(fLv) {
  return Math.min(9, Math.floor(fLv / 5));
}

// ========== COIN STACKS ON GROUND ==========
// Holes[29][slot] = array of coin type IDs; Holes[34][slot] = 1 if royal
export function coinStacks(saveData) {
  var raw29 = saveData.holesData[29] || [];
  var raw34 = saveData.holesData[34] || [];
  var stacks = [];
  for (var s = 0; s < raw29.length; s++) {
    var coins = raw29[s];
    if (!coins || !coins.length) continue;
    stacks.push({
      slot: s,
      coins: coins,         // array of currency type IDs
      count: coins.length,
      royal: Number(raw34[s]) >= 1,
    });
  }
  return stacks;
}

// B_UPG(95) "Size DOES Matter" — per-coin-in-stack bonus (+10% per coin)
export function _sizeMatterBonus(saveData) {
  return _bUpg(saveData, 95, 10);  // returns 10 if built, 0 if not
}

// Redeem value of a single coin stack
export function stackRedeemValue(saveData, uLvs, mLvs, stack) {
  var desired = desiredCurrency(saveData);
  var sizeBon = _sizeMatterBonus(saveData);
  var rm = royalMulti(uLvs, mLvs);
  var total = 0;
  for (var i = 0; i < stack.coins.length; i++) {
    var t = stack.coins[i];
    var cv = currencyTotalValue(saveData, uLvs, mLvs, t, desired);
    var perCoin = cv * (1 + stack.count * sizeBon / 100);
    if (stack.royal) perCoin *= rm;
    total += perCoin;
  }
  return total;
}

// Total redeem value of all stacks on the ground
export function totalRedeemValue(saveData, uLvs, mLvs) {
  var stacks = coinStacks(saveData);
  var total = 0;
  for (var i = 0; i < stacks.length; i++) {
    total += stackRedeemValue(saveData, uLvs, mLvs, stacks[i]);
  }
  return total;
}

// ========== CORE FORMULAS ==========
export function marbleBon(mLv) {
  if (mLv <= 0) return 1;
  return 1.5 + 0.5 * mLv;
}

export function bonTOT(uLvs, mLvs, w, u) {
  var lv = uLvs[w][u] || 0;
  var mLv = mLvs[w][u] || 0;
  var bonPerLv = UPG_DATA[w][u][6] || 0;
  return Math.round(marbleBon(mLv) * lv * bonPerLv);
}

export function opalCost(fLv) {
  return 100 * Math.pow(1 + fLv, 1.5) * Math.pow(4.8, fLv);
}

export function upgCost(w, u, currentLv) {
  var d = UPG_DATA[w][u];
  var baseCost = d[4];
  var costScale = d[5];
  if (baseCost === 1) return (currentLv + 1) * Math.pow(costScale, currentLv);
  return baseCost * Math.pow(costScale, currentLv);
}

export function marbleCost(w, u, mLv) {
  if (w >= 2) return 250000 * Math.pow(2 * (5 + mLv), mLv);
  if (u === 13) return 1500 * Math.pow(10 + 5 * mLv, mLv);
  return 500 * Math.pow(5 + mLv, mLv);
}

// Upgrades that cannot be marbled (from HolesInfo[76])
var _NO_MARBLE = { '0_8': 1, '0_10': 1, '0_11': 1, '1_8': 1, '1_10': 1 };
export function canMarble(w, u) { return !_NO_MARBLE[w + '_' + u]; }

export function upgUnlocked(uLvs, w, u) {
  var prereqIdx = UPG_DATA[w][u][1];
  if (prereqIdx === -1) return true;
  if (typeof prereqIdx !== 'number') return false;
  var prereqLv = uLvs[w][prereqIdx] || 0;
  if (w === 0 && (u === 2 || u === 14)) return prereqLv >= 1;
  return prereqLv >= 10;
}

// ========== EXTERNAL BONUS HELPERS ==========
function _bUpg(saveData, idx, val) {
  return (Number(_h(saveData, 13)[idx]) || 0) >= 1 ? val : 0;
}

function _cosmoBonus(saveData, t, i) {
  var base = cosmoUpgBase(t, i);
  var lv = Number(_h(saveData, 4 + t)[i]) || 0;
  return Math.floor(base * lv);
}

function _overkillQTY(saveData) {
  var nChars = numCharacters || (saveData.lv0AllData ? saveData.lv0AllData.length : 0);
  var riftLv = Number(saveData.riftData && saveData.riftData[0]) || 0;
  var sum = 0;
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

function _arcadeBonus68(saveData) {
  return +arcadeBonus(68, saveData);
}

function _bellBonus(saveData, idx) {
  var lv = Number(_h(saveData, 17)[idx]) || 0;
  var HI59_PERLV = [10, 0.5, 10, 0.3, 0.5, 2.0, 0.2];
  return lv * (HI59_PERLV[idx] || 0);
}

// Cglunko upgrade bonuses: OLA[630+t] * perLv[t]
var _CGLUNKO_PERLV = [1,20,2,10,5,1,1,3,1,10,2,1,25,3,10,100,10,100,3,1,5,150,2,1];
function _cglunkoUpgBon(saveData, t) {
  var lv = Number(saveData.olaData?.[630 + t]) || 0;
  return lv * (_CGLUNKO_PERLV[t] || 0);
}

function _lampBonus99(saveData) {
  var lampLv = Number(_h(saveData, 21)[7]) || 0;
  var zmLv = Number(saveData.spelunkData?.[45]?.[2]) || 0;
  return 25 * lampLv * (1 + zmLv / 100);
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

function _measMulti(saveData, typeIdx) {
  var qty = 0;
  switch (typeIdx) {
    case 0: { var raw = Number(_h(saveData, 11)?.[28]) || 0; qty = raw > 0 ? getLOG(raw) : 0; break; }
    case 1: { qty = (saveData.farmCropCount || 0) / 14; break; }
    case 2: { qty = tomeQTY(5, saveData) / 500; break; }
    case 3: { qty = computeTomeScore(saveData, 0, saveData) / 2500; break; }
    case 4: { var sk = tomeQTY(11, saveData); qty = sk / 5000 + Math.max(0, sk - 18000) / 1500; break; }
    case 5: { qty = 0; break; }
    case 6: { qty = _overkillQTY(saveData) / 125; break; }
    case 7: { var hi = Number((saveData.tasksGlobalData?.[0]?.[1] || [])[0]) || 0; qty = hi > 0 ? getLOG(hi) / 2 : 0; break; }
    case 8: { qty = (saveData.cards1Data?.length || 0) / 150; break; }
    case 9: { var h26 = _h(saveData, 26); var sum = 0; for (var j = 0; j < h26.length; j++) sum += Number(h26[j]) || 0; qty = sum / 6; break; }
    case 10: { var gk = Number(_h(saveData, 11)?.[63]) || 0; qty = gk > 0 ? Math.max(0, getLOG(gk) - 2) : 0; break; }
    default: qty = 0;
  }
  if (qty < 5) return 1 + 18 * qty / 100;
  return 1 + (18 * qty + 8 * (qty - 5)) / 100;
}

function _bolaiaBonus(saveData, idx) {
  return (Number(_h(saveData, 26)?.[idx]) || 0) * holesBolaiaPerLv(idx);
}

function _motherlodeLv3(saveData) {
  return Number(_h(saveData, 11)?.[7]) || 0;
}

// ========== FOUNTAIN CALCULATIONS ==========
export function barSpeed(saveData, uLvs, mLvs) {
  return (1 + bonTOT(uLvs, mLvs, 0, 9) / 100) * (1 + _arcadeBonus68(saveData) / 100);
}

export function barFillTime(saveData, uLvs, mLvs) {
  return BAR_FILL_TIMES[0] / barSpeed(saveData, uLvs, mLvs);
}

export function marbleBarFillTime() {
  return BAR_FILL_TIMES[1];
}

// Active speed multiplier: how much faster fills are when standing at fountain.
// The game runs BOTH the AFK accumulator (1x barSpeed) AND the active fill
// (activeSpdMulti x barSpeed) simultaneously, so total = 1 + activeSpdMulti.
export function activeSpeedMulti(uLvs, mLvs) {
  var b = bonTOT(uLvs, mLvs, 0, 12);
  return 1 + (1 + Math.min(4, 4 * b) + b / 100);
}

// The game's displayed "active speed" value (without the +1 AFK base).
export function activeSpeedMultiDisplay(uLvs, mLvs) {
  var b = bonTOT(uLvs, mLvs, 0, 12);
  return 1 + Math.min(4, 4 * b) + b / 100;
}

export function spacesOwned(uLvs, mLvs) {
  return Math.min(16, 1 + bonTOT(uLvs, mLvs, 0, 10));
}

export function maxStackSize(saveData, uLvs, mLvs) {
  return Math.min(50, 3 + _bUpg(saveData, 97, 3) + bonTOT(uLvs, mLvs, 0, 11) + _cosmoBonus(saveData, 0, 4));
}

export function maxCoins(saveData, uLvs, mLvs) {
  return spacesOwned(uLvs, mLvs) * maxStackSize(saveData, uLvs, mLvs);
}

export function currencyKeep(uLvs, mLvs) {
  var b = bonTOT(uLvs, mLvs, 0, 8);
  return 0.1 + b / (100 + b) * 0.5;
}

export function royalChance(uLvs, mLvs) {
  return (1 / 300) * (1 + bonTOT(uLvs, mLvs, 1, 8) / 100);
}

export function royalMulti(uLvs, mLvs) {
  return 5 + bonTOT(uLvs, mLvs, 1, 9) / 100;
}

export function desireMulti(uLvs, mLvs) {
  return 1 + bonTOT(uLvs, mLvs, 1, 11) / 100;
}

// ========== LUCKY COIN SYSTEM (Green Water) ==========
// Holes[30][t] = number of lucky coins collected for currency type t
export function luckyCoinCount(saveData, t) {
  return Math.max(0, Number((saveData.holesData[30] || [])[0 | t]) || 0);
}

// Chance of a collected currency being "lucky" (permanently boosting that type).
// 0 if Luck fo' REAL (W2U8) hasn't been bought.
// Each lucky coin of the same type makes the next 4x rarer.
export function luckyCoinChance(saveData, uLvs, mLvs, t) {
  var base = bonTOT(uLvs, mLvs, 2, 8);
  if (base === 0) return 0;
  var boost = bonTOT(uLvs, mLvs, 2, 10); // Lucky Ducky
  var count = luckyCoinCount(saveData, t);
  return 0.001 * (1 + (base + boost) / 100) * Math.pow(0.25, count);
}

// Per-lucky-coin value bonus (%).
export function luckyCoinValuePer(uLvs, mLvs) {
  return 25 + bonTOT(uLvs, mLvs, 2, 9); // Skilluck
}

// Total lucky coin multiplier for currency type t.
export function luckyCoinValue(saveData, uLvs, mLvs, t) {
  var count = luckyCoinCount(saveData, t);
  if (count <= 0) return 1;
  return 1 + count * luckyCoinValuePer(uLvs, mLvs) / 100;
}

// ========== RUBBER DUCK SYSTEM (Green Water) ==========
// OptionsListAccount[601] = number of rubber ducks owned
export function duckCount(saveData) {
  return Number(saveData.olaData?.[601]) || 0;
}

// Chance per duck bar fill of getting +1 duck.
// 0.333 base, boosted by Rubber Ducky (W2U12) + Lucky Ducky (W2U10).
// Each existing duck makes next 5x rarer.
export function duckChance(saveData, uLvs, mLvs) {
  var boost = bonTOT(uLvs, mLvs, 2, 12) + bonTOT(uLvs, mLvs, 2, 10);
  var count = duckCount(saveData);
  return (1 / 3) * (1 + boost / 100) * Math.pow(0.2, count);
}

// Format duck odds as "1 in X (Y%)" with appropriate precision.
// Shows full odds ratio and percentage to avoid rounding confusion.
export function duckOddsDisplay(chance) {
  if (chance <= 0) return { ratio: '-', pct: '-' };
  var ratio = Math.round(1 / chance);
  // Use enough decimal places to show meaningful precision (min 2 decimals)
  var pctValue = chance * 100;
  var pctStr = pctValue < 0.1 ? pctValue.toFixed(4) : pctValue.toFixed(2);
  return { ratio: ratio, pct: pctStr };
}

// Multiplier from rubber ducks on all currency value.
// Each duck: (1 + Ducktactular%/100)^duckCount
export function duckMulti(saveData, uLvs, mLvs) {
  var count = duckCount(saveData);
  if (count <= 0) return 1;
  return Math.pow(1 + bonTOT(uLvs, mLvs, 2, 11) / 100, count);
}

// Duck bar fill time (seconds) and progress.
export function duckBarFillTime() {
  return BAR_FILL_TIMES[2]; // 90000s = 25h
}

export function duckBarProgress(saveData) {
  return Number((saveData.holesData[33] || [])[2]) || 0;
}

export function currencyFountainMulti(uLvs, mLvs) {
  var w0 = bonTOT(uLvs, mLvs, 0, 0);
  var w1 = bonTOT(uLvs, mLvs, 1, 0);
  var w2 = bonTOT(uLvs, mLvs, 2, 0);
  var boosters = bonTOT(uLvs, mLvs, 0, 1) + bonTOT(uLvs, mLvs, 1, 1)
    + bonTOT(uLvs, mLvs, 2, 1) + bonTOT(uLvs, mLvs, 1, 12);
  return (1 + w0 / 100) * (1 + boosters / 100) * (1 + w1 / 100) * (1 + w2 / 100);
}

export function currencyExternalMulti(saveData, ext) {
  var cglunko14 = _cglunkoUpgBon(saveData, 14) || (ext && ext.cglunko14) || 0;
  return Math.max(1, _bUpg(saveData, 94, 1) * Math.pow(1.1, _motherlodeLv3(saveData)))
    * (1 + cglunko14 / 100)
    * (1 + 25 * _cosmoBonus(saveData, 0, 4) / 100)
    * (1 + _lampBonus99(saveData) / 400)
    * (1 + _measBonus(saveData, 16) / 100)
    * (1 + _bellBonus(saveData, 6) / 100);
}

export function currencyAllMulti(saveData, uLvs, mLvs, ext) {
  return currencyFountainMulti(uLvs, mLvs) * currencyExternalMulti(saveData, ext);
}

// Returns breakdown tree data for all multipliers
export function multiBreakdown(saveData, uLvs, mLvs) {
  var w0 = bonTOT(uLvs, mLvs, 0, 0);
  var w1 = bonTOT(uLvs, mLvs, 1, 0);
  var w2 = bonTOT(uLvs, mLvs, 2, 0);
  var b01 = bonTOT(uLvs, mLvs, 0, 1);
  var b11 = bonTOT(uLvs, mLvs, 1, 1);
  var b21 = bonTOT(uLvs, mLvs, 2, 1);
  var b112 = bonTOT(uLvs, mLvs, 1, 12);
  var boosters = b01 + b11 + b21 + b112;

  var bUpg94 = _bUpg(saveData, 94, 1);
  var ml3 = _motherlodeLv3(saveData);
  var cosmo04 = _cosmoBonus(saveData, 0, 4);
  var lamp99 = _lampBonus99(saveData);
  var meas16 = _measBonus(saveData, 16);
  var bell6 = _bellBonus(saveData, 6);
  var cglunko14 = _cglunkoUpgBon(saveData, 14);

  return {
    fountain: {
      total: currencyFountainMulti(uLvs, mLvs),
      w0: 1 + w0 / 100, w0raw: w0,
      w1: 1 + w1 / 100, w1raw: w1,
      w2: 1 + w2 / 100, w2raw: w2,
      boosters: 1 + boosters / 100,
      b01: b01, b11: b11, b21: b21, b112: b112,
    },
    external: {
      total: currencyExternalMulti(saveData),
      bUpg94: bUpg94, ml3: ml3,
      motherlode: Math.max(1, bUpg94 * Math.pow(1.1, ml3)),
      cosmo: 1 + 25 * cosmo04 / 100, cosmo04: cosmo04,
      lamp: 1 + lamp99 / 400, lamp99: lamp99,
      meas: 1 + meas16 / 100, meas16: meas16,
      bell: 1 + bell6 / 100, bell6: bell6,
      cglunko: 1 + cglunko14 / 100, cglunko14: cglunko14,
    },
    allMulti: currencyAllMulti(saveData, uLvs, mLvs),
    royal: { total: royalMulti(uLvs, mLvs), raw: bonTOT(uLvs, mLvs, 1, 9) },
    desire: { total: desireMulti(uLvs, mLvs), raw: bonTOT(uLvs, mLvs, 1, 11) },
    royalChance: { total: royalChance(uLvs, mLvs), raw: bonTOT(uLvs, mLvs, 1, 8) },
    keep: { total: currencyKeep(uLvs, mLvs), raw: bonTOT(uLvs, mLvs, 0, 8) },
    lucky: {
      valuePer: luckyCoinValuePer(uLvs, mLvs),
      counts: [0,1,2,3,4,5,6,7,8].map(function(t) { return luckyCoinCount(saveData, t); }),
    },
    duck: {
      count: duckCount(saveData),
      multi: duckMulti(saveData, uLvs, mLvs),
      chance: duckChance(saveData, uLvs, mLvs),
    },
  };
}

export function currencyBaseValue(saveData, uLvs, mLvs, t) {
  var mythrilLog = 1 + getLOG(Number(_h(saveData, 9)[3]) || 0) * bonTOT(uLvs, mLvs, 0, 19) / 100;
  var sharpLog  = 1 + getLOG(Number(_h(saveData, 9)[16]) || 0) * bonTOT(uLvs, mLvs, 1, 19) / 100;
  var rupieLog  = 1 + getLOG(Number(_h(saveData, 9)[20]) || 0) * bonTOT(uLvs, mLvs, 2, 19) / 100;
  switch (t) {
    case 0: return 1 + bonTOT(uLvs, mLvs, 0, 2) * (1 + bonTOT(uLvs, mLvs, 0, 2) / 100) * mythrilLog;
    case 1: return 1 + bonTOT(uLvs, mLvs, 0, 3) * (1 + bonTOT(uLvs, mLvs, 0, 5) / 100) * mythrilLog;
    case 2: return 1 + bonTOT(uLvs, mLvs, 0, 4) * (1 + bonTOT(uLvs, mLvs, 0, 6) / 100) * mythrilLog;
    case 3: return 1 + bonTOT(uLvs, mLvs, 1, 2) * (1 + bonTOT(uLvs, mLvs, 0, 7) / 100) * sharpLog;
    case 4: return 1 + bonTOT(uLvs, mLvs, 1, 3) * (1 + bonTOT(uLvs, mLvs, 1, 5) / 100) * sharpLog;
    case 5: return 1 + bonTOT(uLvs, mLvs, 1, 4) * (1 + bonTOT(uLvs, mLvs, 1, 6) / 100) * sharpLog;
    case 6: return 1 + bonTOT(uLvs, mLvs, 2, 2) * (1 + bonTOT(uLvs, mLvs, 1, 7) / 100) * rupieLog;
    case 7: return 1 + bonTOT(uLvs, mLvs, 2, 3) * (1 + bonTOT(uLvs, mLvs, 2, 5) / 100) * rupieLog;
    case 8: return 1 + bonTOT(uLvs, mLvs, 2, 4) * (1 + bonTOT(uLvs, mLvs, 2, 6) / 100) * rupieLog;
    default: return 1;
  }
}

export function currencyTotalValue(saveData, uLvs, mLvs, t, desired) {
  var base = currencyBaseValue(saveData, uLvs, mLvs, t);
  var allM = currencyAllMulti(saveData, uLvs, mLvs);
  var desM = desireMulti(uLvs, mLvs);
  var lucky = luckyCoinValue(saveData, uLvs, mLvs, t);
  var duck = duckMulti(saveData, uLvs, mLvs);
  if (t >= 6) {
    // Green currencies: desire always applies (inside sqrt)
    return Math.pow(desM * base * allM, 0.5) * lucky * duck;
  }
  // Blue/yellow: desire only when selected
  var desire = (t === desired) ? desM : 1;
  return desire * base * allM * lucky * duck;
}

export function currencyUnlocked(uLvs, mLvs, t) {
  switch (t) {
    case 0: return true;
    case 1: return upgUnlocked(uLvs, 0, 3);
    case 2: return upgUnlocked(uLvs, 0, 4);
    case 3: return upgUnlocked(uLvs, 1, 2);
    case 4: return upgUnlocked(uLvs, 1, 3);
    case 5: return upgUnlocked(uLvs, 1, 4);
    case 6: return upgUnlocked(uLvs, 2, 2);
    case 7: return upgUnlocked(uLvs, 2, 3);
    case 8: return upgUnlocked(uLvs, 2, 4);
    default: return false;
  }
}

export function marblePerFill(saveData, uLvs, mLvs) {
  return 100 * (1 + bonTOT(uLvs, mLvs, 1, 10) / 100)
    * (1 + _bolaiaBonus(saveData, 15) / 100)
    * (1 + 10 * _cosmoBonus(saveData, 0, 4) / 100);
}

export function watersOwned(uLvs, mLvs) {
  var n = 0;
  if (bonTOT(uLvs, mLvs, 0, 0) >= 1) n++;
  if (bonTOT(uLvs, mLvs, 1, 0) >= 1) n++;
  if (bonTOT(uLvs, mLvs, 2, 0) >= 1) n++;
  return Math.min(n, WATERS_IMPLEMENTED);
}

export function duckBarUnlocked(uLvs, mLvs) {
  return (uLvs[2][12] || 0) >= 1; // Rubber Ducky (W2U12)
}

// ========== PLANNER/OPTIMIZER HELPERS ==========

// Decompose optimal /hr into fill speed (stacks/hr) and value (per stack).
// stacksPerHr × stackValue = optimal /hr
export function optimalStacksPerHr(saveData, uLvs, mLvs) {
  var _rc = royalChance(uLvs, mLvs);
  var _ms = maxStackSize(saveData, uLvs, mLvs);
  var _fph = 3600 * activeSpeedMulti(uLvs, mLvs) / barFillTime(saveData, uLvs, mLvs);
  var _rdf = 1 - Math.pow(1 - _rc, _ms);
  var _wf = _rdf < 1 ? (1 - _rdf) / _rc : 0;
  var _fps = _ms + _wf;
  return _fph / _fps;
}

export function optimalStackValue(saveData, uLvs, mLvs, desired) {
  var _rm = royalMulti(uLvs, mLvs);
  var _sb = _sizeMatterBonus(saveData);
  var _ms = maxStackSize(saveData, uLvs, mLvs);
  var _fsm = 1 + _ms * _sb / 100;
  var _cv = currencyTotalValue(saveData, uLvs, mLvs, desired, desired);
  return _ms * _cv * _rm * _fsm;
}

export function measureGoal(saveData, goal, uLvs, mLvs, desired) {
  switch (goal) {
    case 'currency': return currencyAllMulti(saveData, uLvs, mLvs) * royalMulti(uLvs, mLvs) * desireMulti(uLvs, mLvs);
    case 'fill': return activeSpeedMulti(uLvs, mLvs) / barFillTime(saveData, uLvs, mLvs);
    case 'bronze': return currencyTotalValue(saveData, uLvs, mLvs, 0, 0) * royalMulti(uLvs, mLvs);
    case 'silver': return currencyTotalValue(saveData, uLvs, mLvs, 1, 1) * royalMulti(uLvs, mLvs);
    case 'golden': return currencyTotalValue(saveData, uLvs, mLvs, 2, 2) * royalMulti(uLvs, mLvs);
    case 'dollar': return currencyTotalValue(saveData, uLvs, mLvs, 3, 3) * royalMulti(uLvs, mLvs);
    case 'credit': return currencyTotalValue(saveData, uLvs, mLvs, 4, 4) * royalMulti(uLvs, mLvs);
    case 'treasury': return currencyTotalValue(saveData, uLvs, mLvs, 5, 5) * royalMulti(uLvs, mLvs);
    case 'royal': return royalChance(uLvs, mLvs);
    case 'monument-bravery': return bonTOT(uLvs, mLvs, 0, 13);
    case 'monument-justice': return bonTOT(uLvs, mLvs, 1, 13);
    case 'cosmo-exp': return bonTOT(uLvs, mLvs, 0, 14);
    case 'class-exp': return bonTOT(uLvs, mLvs, 0, 16);
    case 'damage': return bonTOT(uLvs, mLvs, 1, 16);
    case 'marble-per-fill': return marblePerFill(saveData, uLvs, mLvs);
    case 'marble-rate': {
      var _mhr = marblePerFill(saveData, uLvs, mLvs) * activeSpeedMulti(uLvs, mLvs) / marbleBarFillTime();
      // Asymptotic Bolaia study contribution: upgrading Skim Reading (W1U14) increases
      // study rate, which gives a permanent Bolaia level advantage of
      // ln(R'/R) / ln(1.25) levels. Each level = +5% marble per fill.
      // Only the fountain factor (1 + bonTOT(1,14)/100) matters; external factors cancel in deltas.
      var _skimBon = bonTOT(uLvs, mLvs, 1, 14);
      if (_skimBon > 0) {
        var _bolaiaFactor = 1 + _bolaiaBonus(saveData, 15) / 100;
        var _mpfNoBolaia = _bolaiaFactor > 0 ? marblePerFill(saveData, uLvs, mLvs) / _bolaiaFactor : marblePerFill(saveData, uLvs, mLvs);
        var _mFillsPerHr = activeSpeedMulti(uLvs, mLvs) / marbleBarFillTime();
        _mhr += _mpfNoBolaia * _mFillsPerHr * 0.05 * Math.log(1 + _skimBon / 100) / Math.log(1.25);
      }
      return _mhr;
    }
    case 'mbg': return currencyKeep(uLvs, mLvs);
    case 'optimal': return optimalStacksPerHr(saveData, uLvs, mLvs) * optimalStackValue(saveData, uLvs, mLvs, desired);
    default: return 0;
  }
}

export function cloneUpgLvs(uLvs) {
  return [uLvs[0].slice(), uLvs[1].slice(), uLvs[2].slice()];
}

export function cloneMarbleLvs(mLvs) {
  return [mLvs[0].slice(), mLvs[1].slice(), mLvs[2].slice()];
}

// Marble bar fill progress in seconds (0 to marbleBarFillTime)
export function marbleBarProgress(saveData) {
  return Number((saveData.holesData[33] || [])[1]) || 0;
}

// Compute earn rate per hour for each currency type (as if that type is desired)
// Returns array[9] of values per hour under active play.
export function earnRatesPerHr(saveData, uLvs, mLvs) {
  var rc = royalChance(uLvs, mLvs);
  var rm = royalMulti(uLvs, mLvs);
  var sizeBon = _sizeMatterBonus(saveData);
  var ms = maxStackSize(saveData, uLvs, mLvs);
  var fsm = 1 + ms * sizeBon / 100;
  var rdf = 1 - Math.pow(1 - rc, ms);
  var wf = rdf < 1 ? (1 - rdf) / rc : 0;
  var fps = ms + wf;
  var fph = 3600 * activeSpeedMulti(uLvs, mLvs) / barFillTime(saveData, uLvs, mLvs);
  var rates = [];
  for (var t = 0; t < 9; t++) {
    var cv = currencyTotalValue(saveData, uLvs, mLvs, t, t);
    rates[t] = (fph / fps) * ms * cv * rm * fsm;
  }
  return rates;
}

// Base currency rate: shared multiplier rate without currency-specific base value.
// Multiply by currencyBaseValue(t) to get per-currency rate.
export function baseCurrencyPerHr(saveData, uLvs, mLvs) {
  var rc = royalChance(uLvs, mLvs);
  var rm = royalMulti(uLvs, mLvs);
  var sizeBon = _sizeMatterBonus(saveData);
  var ms = maxStackSize(saveData, uLvs, mLvs);
  var fsm = 1 + ms * sizeBon / 100;
  var rdf = 1 - Math.pow(1 - rc, ms);
  var wf = rdf < 1 ? (1 - rdf) / rc : 0;
  var fps = ms + wf;
  var fph = 3600 * activeSpeedMulti(uLvs, mLvs) / barFillTime(saveData, uLvs, mLvs);
  var cam = currencyAllMulti(saveData, uLvs, mLvs);
  var dm = desireMulti(uLvs, mLvs);
  return (fph / fps) * ms * cam * dm * rm * fsm;
}

// Marble earn rate: marbles per hour under active play
export function marblePerHr(saveData, uLvs, mLvs) {
  return marblePerFill(saveData, uLvs, mLvs) * 3600 * activeSpeedMulti(uLvs, mLvs) / marbleBarFillTime();
}

// Time in seconds to collect all current stacks as royal stacks.
// This is the "flush" cost when switching currency.
// With N spaces and stack size S, you need to wait for each space to become royal.
// Uses the stacks-per-hour rate.
export function flushTime(saveData, uLvs, mLvs) {
  var sph = optimalStacksPerHr(saveData, uLvs, mLvs);
  if (sph <= 0) return Infinity;
  var spaces = spacesOwned(uLvs, mLvs);
  return spaces / sph * 3600; // seconds to collect all spaces once
}
