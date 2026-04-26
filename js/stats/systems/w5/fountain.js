// ===== FOUNTAIN CAVE SYSTEM (W5) =====
// Computation logic for The Fountain upgrades, currency, and externals.

import { cosmoUpgBase, holesBolaiaPerLv, holesMeasBase, holesMeasType } from '../../data/w5/hole.js';
import { arcadeBonus } from '../w2/arcade.js';
import { getLOG } from '../../../formulas.js';

// ========== CONSTANTS ==========
export var WATER_NAMES = ['Blue', 'Yellow', 'Green'];
export var WATER_COLORS = ['#64b5f6', '#ffe066', '#a5d6a7'];
export var WATERS_IMPLEMENTED = 2;
export var CURRENCY_NAMES = [
  'Bronze Coins', 'Silver Coins', 'Golden Coins',
  'Dollar Bills', 'Credit Bills', 'Treasury Bills',
  'Moolah Stacks', 'Shilling Stacks', 'Greane Stacks'
];
var BAR_FILL_TIMES = [7200, 36000, 86400]; // seconds: 2h, 10h, 24h

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
    ["Stackin' Monayy",0,'41,227',5,250,1.10,5,'Moolah Stacks are worth }x more.'],
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
  // Water 2 (Green) — mostly placeholder
  [
    ['Black Water','?','X',8,1,1.1,3,'Unlock Black Water. Also, }x Currency Value!'],
    ['Currency Booster III','?','X',6,1,1.1,30,'All currencies are worth +{% more.'],
    ['Moolah Discovery','?','X',6,1,1.1,0,'You can now find Moolah Stacks.'],
    ['Shilling Discovery','?','X',7,1,1.1,0,'You can now find Shilling Stacks.'],
    ['Greane Discovery','?','X',8,1,1.1,0,'You can now find Greane Stacks.'],
    ["Stackin' Shillings",'?','X',6,1,1.1,0,'Shilling Stacks are worth }x more.'],
    ["Stackin' Greane",'?','X',7,1,1.1,0,'Greane Stacks are worth }x more.'],
    ["Stackin' Oldmoney",'?','X',8,1,1.1,0,'Oldmoney Stacks are worth }x more.'],
    ['Lucky Coins','?','X',7,1,1.1,0,'1 in $ chance for a currency to be LUCKY, multiplying its value forever!'],
    ['Lucky Boost','?','X',8,1,1.1,0,'Boosts the LUCKY multi by +{%.'],
    ['Rubber Ducky Chance','?','X',9,1,1.1,0,'Royal stacks boost Rubber Ducky and LUCKY coin chances by +{%'],
    ['Rubber Ducky Value','?','X',7,1,1.1,0,'Rubber Duckies multiply the value of all coins by $x.'],
    ['Ducky Bar','?','X',6,1,1.1,0,'Adds a new fountain bar which when filled has a 1 in $ chance of adding a Rubber Ducky.'],
    ['Wisdom Monument','?','X',7,1,1.1,0,'All Wisdom Monument bonuses are }x larger.'],
    ["Minau's Discount",'?','X',6,1,1.1,0,"Minau's upgrades are }x cheaper."],
    ['Jar Enchant','?','X',7,1,1.1,0,'Your Enchant chance at The Jar is }x larger.'],
    ['Research EXP','?','X',6,1,1.1,0,'Boosts Research EXP gain by }x'],
    ['Masterclass Drops','?','X',8,1,1.1,0,'All Masterclass Drops are }x larger'],
    ['Bubba Boost','?','X',7,1,1.1,0,"Permanently boost Meat Slice Production at Bubba by }x"],
    ['Red Rupie Transience','?','X',7,1,1.1,0,'Moolah, Shilling, and Greane stacks worth +{% more per POW 10 Red Rupie.'],
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
  return marbleBon(mLv) * lv * bonPerLv;
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

export function marbleCost(u, mLv) {
  if (u === 13) return 1500 * Math.pow(10 + 5 * mLv, mLv);
  return 500 * Math.pow(5 + mLv, mLv);
}

export function upgUnlocked(uLvs, w, u) {
  var prereqIdx = UPG_DATA[w][u][1];
  if (prereqIdx === -1 || prereqIdx === '?') return true;
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

function _arcadeBonus68(saveData) {
  return +arcadeBonus(68, saveData);
}

function _bellBonus(saveData, idx) {
  var lv = Number(_h(saveData, 17)[idx]) || 0;
  var HI59_PERLV = [10, 0.5, 10, 0.3, 0.5, 2.0, 0.2];
  return lv * (HI59_PERLV[idx] || 0);
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
    case 8: qty = (saveData.cards1Data?.length || 0) / 150; break;
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

export function activeSpeedMulti(uLvs, mLvs) {
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
  return 0.003333 * (1 + bonTOT(uLvs, mLvs, 1, 8) / 100);
}

export function royalMulti(uLvs, mLvs) {
  return 5 + bonTOT(uLvs, mLvs, 1, 9) / 100;
}

export function desireMulti(uLvs, mLvs) {
  return 1 + bonTOT(uLvs, mLvs, 1, 11) / 100;
}

export function currencyFountainMulti(uLvs, mLvs) {
  var w0 = bonTOT(uLvs, mLvs, 0, 0);
  var w1 = bonTOT(uLvs, mLvs, 1, 0);
  var w2 = bonTOT(uLvs, mLvs, 2, 0);
  var boosters = bonTOT(uLvs, mLvs, 0, 1) + bonTOT(uLvs, mLvs, 1, 1)
    + bonTOT(uLvs, mLvs, 2, 1) + bonTOT(uLvs, mLvs, 1, 12);
  return (1 + w0 / 100) * (1 + boosters / 100) * (1 + w1 / 100) * (1 + w2 / 100);
}

export function currencyExternalMulti(saveData) {
  return Math.max(1, _bUpg(saveData, 94, 1) * Math.pow(1.1, _motherlodeLv3(saveData)))
    * (1 + 25 * _cosmoBonus(saveData, 0, 4) / 100)
    * (1 + _lampBonus99(saveData) / 400)
    * (1 + _measBonus(saveData, 16) / 100)
    * (1 + _bellBonus(saveData, 6) / 100);
}

export function currencyAllMulti(saveData, uLvs, mLvs) {
  return currencyFountainMulti(uLvs, mLvs) * currencyExternalMulti(saveData);
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
    },
    allMulti: currencyAllMulti(saveData, uLvs, mLvs),
    royal: { total: royalMulti(uLvs, mLvs), raw: bonTOT(uLvs, mLvs, 1, 9) },
    desire: { total: desireMulti(uLvs, mLvs), raw: bonTOT(uLvs, mLvs, 1, 11) },
    royalChance: { total: royalChance(uLvs, mLvs), raw: bonTOT(uLvs, mLvs, 1, 8) },
    keep: { total: currencyKeep(uLvs, mLvs), raw: bonTOT(uLvs, mLvs, 0, 8) },
  };
}

export function currencyBaseValue(saveData, uLvs, mLvs, t) {
  var mythrilLog = 1 + getLOG(Number(_h(saveData, 9)[3]) || 0) * bonTOT(uLvs, mLvs, 0, 19) / 100;
  var sharpLog  = 1 + getLOG(Number(_h(saveData, 9)[16]) || 0) * bonTOT(uLvs, mLvs, 1, 19) / 100;
  switch (t) {
    case 0: return 1 + bonTOT(uLvs, mLvs, 0, 2) * (1 + bonTOT(uLvs, mLvs, 0, 2) / 100) * mythrilLog;
    case 1: return 1 + bonTOT(uLvs, mLvs, 0, 3) * (1 + bonTOT(uLvs, mLvs, 0, 5) / 100) * mythrilLog;
    case 2: return 1 + bonTOT(uLvs, mLvs, 0, 4) * (1 + bonTOT(uLvs, mLvs, 0, 6) / 100) * mythrilLog;
    case 3: return 1 + bonTOT(uLvs, mLvs, 1, 2) * (1 + bonTOT(uLvs, mLvs, 0, 7) / 100) * sharpLog;
    case 4: return 1 + bonTOT(uLvs, mLvs, 1, 3) * (1 + bonTOT(uLvs, mLvs, 1, 5) / 100) * sharpLog;
    case 5: return 1 + bonTOT(uLvs, mLvs, 1, 4) * (1 + bonTOT(uLvs, mLvs, 1, 6) / 100) * sharpLog;
    case 6: return 1 + bonTOT(uLvs, mLvs, 2, 2) * (1 + bonTOT(uLvs, mLvs, 1, 7) / 100);
    case 7: return 1 + bonTOT(uLvs, mLvs, 2, 3);
    case 8: return 1 + bonTOT(uLvs, mLvs, 2, 4);
    default: return 1;
  }
}

export function currencyTotalValue(saveData, uLvs, mLvs, t, desired) {
  var base = currencyBaseValue(saveData, uLvs, mLvs, t);
  var allM = currencyAllMulti(saveData, uLvs, mLvs);
  var desire = (t === desired) ? desireMulti(uLvs, mLvs) : 1;
  return base * allM * desire;
}

export function currencyUnlocked(uLvs, mLvs, t) {
  switch (t) {
    case 0: return true;
    case 1: return bonTOT(uLvs, mLvs, 0, 3) >= 1;
    case 2: return bonTOT(uLvs, mLvs, 0, 4) >= 1;
    case 3: return bonTOT(uLvs, mLvs, 1, 2) >= 1;
    case 4: return bonTOT(uLvs, mLvs, 1, 3) >= 1;
    case 5: return bonTOT(uLvs, mLvs, 1, 4) >= 1;
    case 6: return bonTOT(uLvs, mLvs, 2, 2) >= 1;
    case 7: return bonTOT(uLvs, mLvs, 2, 3) >= 1;
    case 8: return bonTOT(uLvs, mLvs, 2, 4) >= 1;
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
  return Math.min(n, WATERS_IMPLEMENTED);
}

// ========== PLANNER/OPTIMIZER HELPERS ==========
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
    case 'mbg': return currencyKeep(uLvs, mLvs);
    default: return 0;
  }
}

export function cloneUpgLvs(uLvs) {
  return [uLvs[0].slice(), uLvs[1].slice(), uLvs[2].slice()];
}

export function cloneMarbleLvs(mLvs) {
  return [mLvs[0].slice(), mLvs[1].slice(), mLvs[2].slice()];
}
