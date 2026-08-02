// ===== FULL STEALTH COMPUTATION FROM SAVE DATA =====
// Computes per-twin stealth from raw save data, no cached DNSM values.
//
// Stealth = (10 + NLbonuses(13) * sneakLv) * stealthMulti
//           * (1 + funeralPct/100) * (1 + fractalPct/100)
//           * (1 + emperorPct/100) * (1 + rogPct/100) * (1 + shhPct/100)
//
// stealthMulti = allyBonus
//   * (1 + farmRank*farmLv/100) * (1+NB(t,7)/100) * (1+compass45/100)
//   * (1+gambit11/100) * (1+NB(t,4)/100) * (1+NB(t,17)/100)
//   * (1+NB(20,-1)/100) * (1+(alchA10+starSign73)/100)
//   * (1+statue26/100) * (1+4*cardCrystal5/100) * (1+5*achieve368/100)
//   * (1+gemstone0/100) * (1+voting25/100) * (1+lamp21/100) * max(1,bUpg54)

import { NinjaUpg, NinjaInfo, HolesInfo } from '../../data/game/customlists.js';
import { NjEQ } from '../../data/game/custommaps.js';
import {
  nkBonus, charmStat, charmBonusType, isGoldCharm,
  funeralStealthBonus, parseTwinData, parseTwinEquip,
  isTwinUntied,
} from './sneaking-math.js';
import { farmRankUpgBonus } from './farmRank.js';
import { computeCompassBonus } from '../../systems/w7/compass.js';
import { achieveStatus } from '../common/achievement.js';
import { computeCardLv } from '../common/cards.js';
import { votingBonusz } from '../../systems/w2/voting.js';
import { computeEmperorBon } from './emperor.js';
import { computeStatueBonusGiven } from '../common/stats.js';
import { legendPTSbonus, computePaletteBonus } from '../../systems/w7/spelunking.js';
import { rogBonusQTY } from '../../systems/w7/sushi.js';
import { bubbleValByKey, computeVialByKey } from '../../systems/w2/alchemy.js';
import { vaultUpgBonus } from '../common/vault.js';
import { cloudBonus } from '../../../game-helpers.js';
import { computeStarSignBonus } from '../common/starSign.js';
import { createStatContext } from '../../stat-context.js';
import { maxTalentBonus } from '../common/talent.js';
import { ZenithMarket } from '../../data/game/customlists.js';
import { gambitPTSmulti } from '../w5/hole.js';
import { getLOG } from '../../../formulas.js';
import { node } from '../../node.js';

// ===== HELPERS =====

function _num(v) { return Number(v) || 0; }

// ----- NLbonuses(idx) = Ninja[103][idx] * NinjaUpg[idx][5] -----
// Special cases for idx 6,7,10,12 add mastery component, but for stealth
// we only need idx 13 (Way of Stealth) and 23 (Shh!) which are plain.
function _nlBonus(idx, ninjaData) {
  var nkLevels = ninjaData[103] || [];
  var lv = _num(nkLevels[idx]);
  var perLv = _num(NinjaUpg[idx] && NinjaUpg[idx][5]);
  return lv * perLv;
}

// ----- ItemStat for charm slot (type 2 = charm) -----
// base + bonus * (lv/(lv+50)), capped at bonus, plus bonus * (lv/(lv+900)) capped at bonus
function _charmItemStat(slotIdx, ninjaData) {
  var slot = ninjaData[slotIdx];
  if (!slot) return 0;
  var itemName = String(slot[0] || '');
  if (itemName === 'Blank' || !itemName) return 0;
  var eq = NjEQ[itemName];
  if (!eq) return 0;
  var itemType = _num(eq[0]); // 1=weapon/hat, 2=charm
  if (itemType !== 2) return 0;
  var base = _num(eq[3]);
  var bonus = _num(eq[5]);
  var lv = _num(slot[1]);
  var part1 = base + bonus * (lv / (lv + 50));
  part1 = Math.min(part1, bonus);
  var part2 = bonus * (lv / (lv + 900));
  part2 = Math.min(part2, bonus);
  return part1 + part2;
}

// ----- ItemStat for weapon/hat slot (type 1) -----
function _weaponItemStat(slotIdx, ninjaData) {
  var slot = ninjaData[slotIdx];
  if (!slot) return 0;
  var itemName = String(slot[0] || '');
  if (itemName === 'Blank' || !itemName) return 0;
  var eq = NjEQ[itemName];
  if (!eq) return 0;
  var itemType = _num(eq[0]);
  if (itemType !== 1) return 0;
  var bonusType = _num(eq[1]);
  var base = _num(eq[3]);
  var lv = _num(slot[1]);
  if (bonusType === 0) {
    // Weapon: 10 * base * (lv+10)/(lv+40)
    return 10 * base * ((lv + 10) / (lv + 40));
  }
  // Hat: base * 1.23^lv with decay
  if (lv <= 110) {
    return base * Math.pow(1.23, lv) * Math.pow(0.92, Math.max(0, lv - 80))
                 * Math.pow(0.94, Math.max(0, lv - 110));
  }
  return base * Math.pow(1.23, 110) * Math.pow(0.92, 30)
               * Math.pow(1.063704, Math.max(0, lv - 110));
}

export function weaponItemStat(itemKey, level) {
  var eq = NjEQ[String(itemKey || 'Blank')];
  if (!eq || _num(eq[0]) !== 1) return 0;
  var bonusType = _num(eq[1]);
  var base = _num(eq[3]);
  var itemLevel = _num(level);
  if (bonusType === 0) return 10 * base * ((itemLevel + 10) / (itemLevel + 40));
  if (itemLevel <= 110) {
    return base * Math.pow(1.23, itemLevel) * Math.pow(0.92, Math.max(0, itemLevel - 80))
      * Math.pow(0.94, Math.max(0, itemLevel - 110));
  }
  return base * Math.pow(1.23, 110) * Math.pow(0.92, 30)
    * Math.pow(1.063704, Math.max(0, itemLevel - 110));
}

// ----- SneakSymbolBon(slotLVID) -----
// = 50 * Spelunk[14][slotLVID]
function _sneakSymbolBon(slotLVID, spelunkData) {
  var symLevels = spelunkData[14] || [];
  return 50 * _num(symLevels[slotLVID]);
}

// ----- ItemIDtoSymbolLVID(slotIdx) -----
// For equipped slots (14-59): Math.round(slotIdx - 14) - 2*floor((slotIdx-14)/4)
// For inventory (60+): slotIdx - 36
function _slotToSymbolLVID(slotIdx) {
  if (slotIdx < 60) return Math.round(slotIdx - 14) - 2 * Math.floor((slotIdx - 14) / 4);
  return Math.round(slotIdx - 36);
}

// ----- GemstoneBonus(gemIdx) -----
// Reads NjGem{gemIdx} from NjEQ, OLA[233+gemIdx] for level
export function gemstoneBonus(gemIdx, olaData, saveData, activeCharIdx) {
  return _gemstoneBonus(gemIdx, olaData, saveData, activeCharIdx);
}
function _gemstoneBonus(gemIdx, olaData, saveData, activeCharIdx) {
  var gemKey = 'NjGem' + gemIdx;
  var gem = NjEQ[gemKey];
  if (!gem) return 0;
  var gemLv = _num(olaData[233 + gemIdx]);
  if (gemLv <= 0.5) return 0;
  var base = _num(gem[3]);
  var bonus = _num(gem[5]);
  var val = base + bonus * (gemLv / (1000 + gemLv));
  if (gemIdx === 5) return val; // Moissanite: no recursive multiplier
  // Other gems: multiply by (1 + gemstone5/100) * max(1, getbonus2(1,432,activeCharIdx))
  var gem5 = _gemstoneBonus(5, olaData, saveData, activeCharIdx);
  var aci = activeCharIdx != null ? activeCharIdx : -1;
  var tal432 = 0;
  try { tal432 = maxTalentBonus(432, aci, saveData) || 0; } catch(e) {}
  return val * (1 + gem5 / 100) * Math.max(1, tal432);
}

// ----- GloveSPD for twin t -----
// Slot 13+4*t, check if type=1 and bonusType=0 (weapon/glove with speed)
function _gloveSPD(twinIdx, ninjaData) {
  var slotIdx = 13 + 4 * twinIdx;
  var slot = ninjaData[slotIdx];
  if (!slot) return 0;
  var itemName = String(slot[0] || '');
  if (itemName === 'Blank' || !itemName) return 0;
  var eq = NjEQ[itemName];
  if (!eq) return 0;
  if (_num(eq[0]) === 1 && _num(eq[1]) === 0) {
    return _weaponItemStat(slotIdx, ninjaData);
  }
  return 0;
}

// ----- NinjaBonus per twin (equipped charms) -----
// Returns a map: bonusType -> total stat value for twin t
export function twinCharmBonuses(twinIdx, ninjaData, spelunkData, goldInvBonuses) {
  return _twinCharmBonuses(twinIdx, ninjaData, spelunkData, goldInvBonuses);
}
function _twinCharmBonuses(twinIdx, ninjaData, spelunkData, goldInvBonuses) {
  var map = {};
  // Gold inventory type 12 bonus (charm power) — from goldInvBonuses
  var goldType12 = _num(goldInvBonuses[12]);

  for (var e = 0; e < 2; e++) {
    var slotIdx = 14 + e + 4 * twinIdx;
    var slot = ninjaData[slotIdx];
    if (!slot) continue;
    var itemName = String(slot[0] || '');
    if (itemName === 'Blank' || !itemName) continue;
    var eq = NjEQ[itemName];
    if (!eq || _num(eq[0]) !== 2) continue; // must be charm (type 2)
    var bt = _num(eq[1]);
    var stat = _charmItemStat(slotIdx, ninjaData);
    // Multiply by (1 + goldType12/100) * (1 + symbolBon/100)
    var symLVID = _slotToSymbolLVID(slotIdx);
    var symBon = _sneakSymbolBon(symLVID, spelunkData);
    stat *= (1 + goldType12 / 100) * (1 + symBon / 100);
    map[bt] = (map[bt] || 0) + stat;
  }
  return map;
}

// ----- Gold inventory bonuses (NinjaBonus(type, -1)) -----
// Scans Ninja[60..98] for Gold_ items, keeps first per bonus type.
// Game compares raw > storedMultiplied, so the first match always wins.
// Multiplied by (1 + gemstone3/100) * (1 + legendPts6/100) * (1 + symbolBon/100)
export function goldInventoryBonuses(ninjaData, olaData, spelunkData, saveData, activeCharIdx) {
  return _goldInventoryBonuses(ninjaData, olaData, spelunkData, saveData, activeCharIdx);
}
function _goldInventoryBonuses(ninjaData, olaData, spelunkData, saveData, activeCharIdx) {
  var gem3 = _gemstoneBonus(3, olaData, saveData, activeCharIdx);
  var legend6 = 0;
  try { legend6 = legendPTSbonus(6, saveData) || 0; } catch(e) {}
  var result = {}; // bonusType -> multiplied stat (first match wins)
  for (var i = 0; i < 39; i++) {
    var slotIdx = 60 + i;
    var slot = ninjaData[slotIdx];
    if (!slot) continue;
    var itemName = String(slot[0] || '');
    if (!itemName || itemName === 'Blank') continue;
    var eq = NjEQ[itemName];
    if (!eq) continue;
    var name = String(eq[2] || '');
    if (name.indexOf('Gold_') === -1 && name.indexOf('Gold ') === -1) continue;
    var bt = _num(eq[1]);
    var raw = _charmItemStat(slotIdx, ninjaData);
    // Game: if (raw > NJbonusPerms[bt]) store multiplied value.
    // After first match, multiplied >> raw, so first match always wins.
    if (raw > (result[bt] || 0)) {
      var symLVID = _slotToSymbolLVID(slotIdx);
      var symBon = _sneakSymbolBon(symLVID, spelunkData);
      result[bt] = raw * (1 + gem3 / 100) * (1 + legend6 / 100) * (1 + symBon / 100);
    }
  }
  return result;
}

// ----- GambitBonuses(11) -----
function _gambitBonus11(holesData, saveData) {
  // GambitPts(777) = GambitPts(99) * GambitPTSmulti
  // GambitPts(99) = sum of GambitPts(0..5)
  var h11 = holesData[11] || [];
  var totalPts = 0;
  for (var t = 0; t < 6; t++) {
    var base = _num(h11[65 + t]);
    var pts = base + 3 * Math.floor(base / 10) + 10 * Math.floor(base / 60);
    totalPts += (t === 0 ? 100 : 200) * pts;
  }
  var multi = gambitPTSmulti(saveData, saveData);
  var gambitPts777 = totalPts * multi;

  // GambitPtsREQ(11) = 2000 + 1000*(11+1)*(1+11/5) * 1.26^11
  var req11 = 2000 + 1000 * 12 * (1 + 11 / 5) * Math.pow(1.26, 11);
  if (gambitPts777 < req11) return 0;

  // HolesInfo[71][11] = "25|1|..." => [0]=25, [1]=1 means logarithmic
  var info = String(HolesInfo[71] && HolesInfo[71][11] || '0|0');
  var parts = info.split('|');
  var val = _num(parts[0]);
  var isLog = _num(parts[1]);
  if (isLog === 1) {
    return val * getLOG(gambitPts777);
  }
  return val;
}

// ----- LampBonuses(2, 1) -----
// Data pattern: "25,10,8;15,40,10;20,35,12;5,1,1;2,2,2"
// Split by ";", take row [t=2], split by ",", take col [i=1]
// Then multiply by Holes[21][4+2*t] * (1 + zenithMarket/100)
function _lampBonus(t, i, holesData, spelunkData) {
  var grid = '25,10,8;15,40,10;20,35,12;5,1,1;2,2,2';
  var rows = grid.split(';');
  var row = (rows[t] || '0,0,0').split(',');
  var cellVal = _num(row[i]);
  var h21 = holesData[21] || [];
  var lampLv = _num(h21[Math.min(11, 4 + 2 * t)]);
  // ZenithMarketBonus(2) = floor(ZenithMarket[2][4] * Spelunk[45][2])
  var zmPerLv = _num(ZenithMarket[t] && ZenithMarket[t][4]);
  var zmLv = _num(spelunkData[45] && spelunkData[45][t]);
  var zmBonus = Math.floor(zmPerLv * zmLv);
  return cellVal * lampLv * (1 + zmBonus / 100);
}

// ----- B_UPG(54) = pow(1.2, floor(log10(Holes[9][15]))) -----
// Requires Holes[13][54] > 0 (purchased)
function _bUpg54(holesData) {
  var h13 = holesData[13] || [];
  if (!_num(h13[54])) return 0;
  var h9 = holesData[9] || [];
  var val = _num(h9[15]);
  return Math.pow(1.2, Math.floor(getLOG(val)));
}

// ----- Fractal Island Bonus(6) -----
// FracIsBn[idx] = OLA[184] >= thresholds[idx] ? 1 : 0
// Thresholds: [24, 200, 750, 2500, 10000, 20000, 40000, 60000]
var _FRACTAL_THRESHOLDS = [24, 200, 750, 2500, 10000, 20000, 40000, 60000];
function _fractalIslandBonus6(saveData) {
  var olaData = saveData.olaData || [];
  var progress = _num(olaData[184]);
  return progress >= (_FRACTAL_THRESHOLDS[6] || 40000) ? 1 : 0;
}

// ----- A10AllCharz (Alchemy bubble for stealth) -----
// STEALTH_CHAPTER bubble (Kazam cauldron idx 10, key 'A10AllCharz').
// Game: bubbleVal * floor(max(0, (TomeCompletionPts - 5000) / 2000))
function _alchA10AllCharz(saveData, activeCharIdx) {
  var bubbleVal = 0;
  try { bubbleVal = Number(bubbleValByKey('A10AllCharz', activeCharIdx || 0, saveData)) || 0; } catch(e) {}
  if (bubbleVal <= 0) return 0;
  var tomeScore = _num(saveData.totalTomePoints);
  var tomeMult = Math.floor(Math.max(0, (tomeScore - 5000) / 2000));
  return bubbleVal * tomeMult;
}

// ----- StarSigns[73] (S._Tealio: +12% Ninja Twin Stealth) -----
// Active if: equipped in PVtStarSign, OR (unlocked AND infinite star signs >= 74)
// Value = 12 * seraphMulti (per activation pass — game loops twice for dual-sign chip)
function _starSign73(saveData, activeCharIdx) {
  try { return Number(computeStarSignBonus('Stealth', activeCharIdx || 0, saveData)) || 0; }
  catch(e) { return 0; }
}

function _votingBonus25(saveData, activeCharIdx) {
  if (saveData.activeVoteIdx !== 25) return 0;
  var votingMulti = 1;
  try { votingMulti = Number(createStatContext({ charIdx: activeCharIdx || 0, saveData: saveData }).resolve('voting-multi').val) || 1; }
  catch(e) {}
  return votingBonusz(25, votingMulti, saveData);
}

// ===== Internal: compute factors shared across all floors =====
// Returns { baseStealth, coreMulti, goldInv, charmMap, breakdown }
function _computeFactors(twinIdx, saveData, activeCharIdx) {
  var s = saveData;
  var nd = s.ninjaData || [];
  var olaData = s.olaData || [];
  var holesData = s.holesData || [];
  var spelunkData = s.spelunkData || [];

  // Per-character sneaking level
  var lv0All = s.lv0AllData || [];
  var sneakLv = _num(lv0All[twinIdx] && lv0All[twinIdx][17]);
  var farmCharIdx = activeCharIdx != null ? activeCharIdx : twinIdx;
  var farmLv = _num(lv0All[farmCharIdx] && lv0All[farmCharIdx][16]);

  // Gold inventory bonuses (shared across all twins)
  var goldInv = _goldInventoryBonuses(nd, olaData, spelunkData, s, activeCharIdx);

  // Per-twin charm bonuses
  var charmMap = _twinCharmBonuses(twinIdx, nd, spelunkData, goldInv);

  // Base stealth = 10 + NLbonuses(13) * sneakLv
  var nk13 = _nlBonus(13, nd);
  var baseStealth = 10 + nk13 * sneakLv;

  // ---- CORE MULTIPLIER (everything except ally and funeral) ----
  var farmRankBon = 0;
  try { farmRankBon = farmRankUpgBonus(4, farmCharIdx, s) || 0; } catch(e) {}
  var farmFactor = 1 + farmRankBon * farmLv / 100;

  var nb7 = _num(charmMap[7]);
  var factor7 = 1 + nb7 / 100;

  var compass45 = 0;
  try { compass45 = computeCompassBonus(45, s) || 0; } catch(e) {}
  var factorCompass = 1 + compass45 / 100;

  var gambit11 = _gambitBonus11(holesData, s);
  var factorGambit = 1 + gambit11 / 100;

  var nb4 = _num(charmMap[4]);
  var factor4 = 1 + nb4 / 100;

  var nb17 = _num(charmMap[17]);
  var factor17 = 1 + nb17 / 100;

  var nb20 = _num(goldInv[20]);
  var factor20 = 1 + nb20 / 100;

  var alchA10 = _alchA10AllCharz(s, farmCharIdx);
  var starSign73v = _starSign73(s, farmCharIdx);
  var factorAlchStar = 1 + (alchA10 + starSign73v) / 100;

  var statue26 = 0;
  try {
    var statResult = computeStatueBonusGiven(26, farmCharIdx, s);
    statue26 = (statResult && statResult.val) || 0;
  } catch(e) {}
  var factorStatue = 1 + statue26 / 100;

  var cardLv = 0;
  try { cardLv = computeCardLv('Crystal5', s) || 0; } catch(e) {}
  var factorCards = 1 + 4 * cardLv / 100;

  var ach368 = 0;
  try { ach368 = achieveStatus(368, s) || 0; } catch(e) {}
  var factorAchieve = 1 + 5 * ach368 / 100;

  var gem0 = _gemstoneBonus(0, olaData, s, activeCharIdx);
  var factorGemstone = 1 + gem0 / 100;

  var vote25 = 0;
  try { vote25 = _votingBonus25(s, farmCharIdx) || 0; } catch(e) {}
  var factorVoting = 1 + vote25 / 100;

  var lamp21 = _lampBonus(2, 1, holesData, spelunkData);
  var factorLamp = 1 + lamp21 / 100;

  var bUpg54v = _bUpg54(holesData);
  var factorBUpg = Math.max(1, bUpg54v);

  // Fractal Island
  var fractal6 = _fractalIslandBonus6(s);
  var fractalMulti = 1 + 2 * fractal6 * sneakLv / 100;

  // Emperor
  var emperor0 = 0;
  try { emperor0 = computeEmperorBon(0, s) || 0; } catch(e) {}
  var emperorMulti = 1 + emperor0 / 100;

  // RoG (sushi)
  var rogPct = 0;
  try { rogPct = rogBonusQTY(32, s.cachedUniqueSushi || 0) || 0; } catch(e) {}
  var rogMulti = 1 + rogPct / 100;

  // Shh! (NLbonuses 23)
  var nk23 = _nlBonus(23, nd);
  var shhMulti = 1 + nk23 / 100;

  // Companion 163 (w5b5b): 40x Ninja Stealth
  // Game: (1 + 39 * Companions(163)), CompanionDB[163][2] = 1 when owned
  var comp163 = s.companionIds && s.companionIds.has(163) ? 1 : 0;
  var comp163Multi = 1 + 39 * comp163;

  // Core multiplier: everything except ally and funeral
  var coreMulti = farmFactor * factor7 * factorCompass * factorGambit
    * factor4 * factor17 * factor20
    * factorAlchStar * factorStatue * factorCards * factorAchieve
    * factorGemstone * factorVoting * factorLamp * factorBUpg
    * fractalMulti * emperorMulti * rogMulti * shhMulti * comp163Multi;

  return {
    baseStealth: baseStealth,
    coreMulti: coreMulti,
    goldInv: goldInv,
    charmMap: charmMap,
    breakdown: {
      sneakLv, farmLv, farmRankBon, nk13, farmFactor, factor7, nb7,
      factorCompass, compass45, factorGambit, gambit11,
      factor4, factor17, factor20,
      nb4, nb17, nb20, alchA10, starSign73: starSign73v,
      factorAlchStar, factorStatue, statue26, factorCards, cardLv,
      factorAchieve, ach368, factorGemstone, gem0, factorVoting, vote25,
      factorLamp, lamp21, factorBUpg, bUpg54: bUpg54v,
      fractal6, emperor0, rogPct, nk23, comp163,
      fractalMulti, emperorMulti, rogMulti, shhMulti, comp163Multi,
    },
  };
}

function _pctFactorNode(name, pct, children, note) {
  var factor = 1 + _num(pct) / 100;
  return node(name, factor, children || [
    node('Bonus', pct, null, { fmt: '%' }),
  ], { fmt: 'x', note: note || '1 + bonus / 100' });
}

// ===== computeCoreStealth(twinIdx, saveData) =====
// Core stealth = everything EXCEPT ally bonus and funeral.
// Use with simStealth(core, ally, funeral) from sneaking-math.js.
export function computeCoreStealth(twinIdx, saveData, activeCharIdx) {
  var f = _computeFactors(twinIdx, saveData, activeCharIdx);
  return f.baseStealth * f.coreMulti;
}

// ===== computeCoreStealth detailed (for debugging) =====
export function computeCoreStealthDetailed(twinIdx, saveData, activeCharIdx) {
  var f = _computeFactors(twinIdx, saveData, activeCharIdx);
  return {
    coreStealth: f.baseStealth * f.coreMulti,
    baseStealth: f.baseStealth,
    coreMulti: f.coreMulti,
    charmMap: f.charmMap,
    goldInv: f.goldInv,
    breakdown: f.breakdown,
  };
}

// ===== Full stealth for a twin on a given floor =====
export function computeTwinStealth(twinIdx, floor, allTwinFloors, saveData, activeCharIdx) {
  var s = saveData;
  var nd = s.ninjaData || [];
  var nkLvs = nd[103] || [];
  var spelunkData = s.spelunkData || [];
  var flowers = spelunkData[15] || [];

  var f = _computeFactors(twinIdx, s, activeCharIdx);

  // Ally bonus: other twins on same floor contribute type 8 and 16
  var allyBonus = 1;
  for (var ot = 0; ot < (allTwinFloors.length || 0); ot++) {
    if (ot !== twinIdx && allTwinFloors[ot] === floor) {
      var otherMap = _twinCharmBonuses(ot, nd, spelunkData, f.goldInv);
      allyBonus += _num(otherMap[8]) / 100;
      allyBonus += _num(otherMap[16]) / 100;
    }
  }

  // Funeral bonus for this floor
  var flCount = _num(flowers[floor]);
  var funeralPct = funeralStealthBonus(flCount, nkLvs);
  var funeralMulti = 1 + funeralPct / 100;

  var stealth = f.baseStealth * f.coreMulti * allyBonus * funeralMulti;

  return {
    stealth: stealth,
    coreStealth: f.baseStealth * f.coreMulti,
    allyBonus: allyBonus,
    funeralPct: funeralPct,
    breakdown: f.breakdown,
  };
}

// ===== Full Stealth breakdown tree =====
export function buildStealthBreakdown(twinIdx, floor, allTwinFloors, saveData, activeCharIdx) {
  var s = saveData;
  var nd = s.ninjaData || [];
  var nkLvs = nd[103] || [];
  var spelunkData = s.spelunkData || [];
  var floors = allTwinFloors || [];
  var f = _computeFactors(twinIdx, s, activeCharIdx);
  var b = f.breakdown;

  var coreChildren = [
    node('Land Rank Stealth', b.farmFactor, [
      node('Land Rank bonus per Farming level', b.farmRankBon, null, { fmt: '%' }),
      node('Login character Farming level', b.farmLv, null, { fmt: 'raw' }),
      node('Combined bonus', b.farmRankBon * b.farmLv, null, { fmt: '%' }),
    ], { fmt: 'x', note: '1 + Land Rank bonus × active login Farming level / 100' }),
    _pctFactorNode('Equipped Charm: EXP, Jade & Stealth', b.nb7),
    _pctFactorNode('Compass: Sneaking Stealth', b.compass45),
    _pctFactorNode('Gambit: Sneaking Stealth', b.gambit11),
    _pctFactorNode('Equipped Charm: Total Stealth', b.nb4),
    _pctFactorNode('Equipped Charm: Total Stealth II', b.nb17),
    _pctFactorNode('Gold Inventory: Total Stealth', b.nb20),
    node('Alchemy + Star Sign', b.factorAlchStar, [
      node('A10AllCharz bubble', b.alchA10, null, { fmt: '%' }),
      node('S. Tealio star sign', b.starSign73, null, { fmt: '%' }),
      node('Combined bonus', b.alchA10 + b.starSign73, null, { fmt: '%' }),
    ], { fmt: 'x', note: '1 + (bubble + star sign) / 100' }),
    _pctFactorNode('Sneaking Statue', b.statue26),
    node('Crystal 5 Card', b.factorCards, [
      node('Card level', b.cardLv, null, { fmt: 'raw' }),
      node('Bonus per level', 4, null, { fmt: '%' }),
      node('Combined bonus', 4 * b.cardLv, null, { fmt: '%' }),
    ], { fmt: 'x', note: '1 + 4 × card level / 100' }),
    node('Achievement 368', b.factorAchieve, [
      node('Achievement status', b.ach368, null, { fmt: 'raw' }),
      node('Combined bonus', 5 * b.ach368, null, { fmt: '%' }),
    ], { fmt: 'x' }),
    _pctFactorNode('Gemstone: Stealth', b.gem0),
    _pctFactorNode('Voting: Sneaking Stealth', b.vote25),
    _pctFactorNode('Lamp: Sneaking Stealth', b.lamp21),
    node('Holes Upgrade 54', b.factorBUpg, [
      node('Raw multiplier', b.bUpg54, null, { fmt: 'x' }),
    ], { fmt: 'x', note: 'max(1, B_UPG 54)' }),
    node('Fractal Island', b.fractalMulti, [
      node('Unlock status', b.fractal6, null, { fmt: 'raw' }),
      node('Sneaking level', b.sneakLv, null, { fmt: 'raw' }),
      node('Combined bonus', 2 * b.fractal6 * b.sneakLv, null, { fmt: '%' }),
    ], { fmt: 'x', note: '1 + 2 × unlock × Sneaking level / 100' }),
    _pctFactorNode('Emperor: Sneaking Stealth', b.emperor0),
    _pctFactorNode('RoG: Sneaking Stealth', b.rogPct),
    _pctFactorNode('Shh! Ninja Knowledge', b.nk23),
    node('Companion 163', b.comp163Multi, [
      node('Owned', b.comp163, null, { fmt: 'raw' }),
      node('Multiplier contribution', 39 * b.comp163, null, { fmt: '+' }),
    ], { fmt: 'x', note: '1 + 39 × owned' }),
  ];

  var allyBonus = 1;
  var allyChildren = [];
  for (var otherIdx = 0; otherIdx < floors.length; otherIdx++) {
    if (otherIdx === twinIdx || floors[otherIdx] !== floor) continue;
    var otherMap = _twinCharmBonuses(otherIdx, nd, spelunkData, f.goldInv);
    var type8 = _num(otherMap[8]);
    var type16 = _num(otherMap[16]);
    allyBonus += (type8 + type16) / 100;
    var otherName = (s.charNames && s.charNames[otherIdx]) || ('Twin ' + (otherIdx + 1));
    allyChildren.push(node(otherName, type8 + type16, [
      node('Floor Stealth charm', type8, null, { fmt: '%' }),
      node('Floor Stealth charm II', type16, null, { fmt: '%' }),
    ], { fmt: '%' }));
  }
  if (allyChildren.length === 0) {
    allyChildren.push(node('No other twins on this floor', 0, null, { fmt: '%' }));
  }

  var flowers = _num(spelunkData[15] && spelunkData[15][floor]);
  var funeralPerFlower = nkBonus(21, nkLvs);
  var funeralPct = funeralStealthBonus(flowers, nkLvs);
  var funeralMulti = 1 + funeralPct / 100;
  var total = f.baseStealth * f.coreMulti * allyBonus * funeralMulti;
  var twinName = (s.charNames && s.charNames[twinIdx]) || ('Twin ' + (twinIdx + 1));

  return node(twinName + ' Stealth', total, [
    node('Base Stealth', f.baseStealth, [
      node('Base', 10, null, { fmt: 'raw' }),
      node('Way of Stealth contribution', b.nk13 * b.sneakLv, [
        node('Bonus per Sneaking level', b.nk13, null, { fmt: 'raw' }),
        node('Sneaking level', b.sneakLv, null, { fmt: 'raw' }),
      ], { fmt: '+' }),
    ], { fmt: 'raw', note: '10 + Way of Stealth × Sneaking level' }),
    node('Core Multipliers', f.coreMulti, coreChildren, { fmt: 'x', note: 'Product of all listed factors' }),
    node('Ally Stealth Multiplier', allyBonus, allyChildren, { fmt: 'x', note: '1 + sum of ally floor-stealth charm bonuses / 100' }),
    node('Funeral Flowers Multiplier', funeralMulti, [
      node('Flowers on floor ' + floor, flowers, null, { fmt: 'raw' }),
      node('Bonus per flower', funeralPerFlower, null, { fmt: '%' }),
      node('Combined bonus', funeralPct, null, { fmt: '%' }),
    ], { fmt: 'x', note: '1 + flowers × bonus per flower / 100' }),
  ], { fmt: 'raw', note: 'Base Stealth × Core Multipliers × Ally Multiplier × Funeral Multiplier' });
}

// ===== Exact Nunchaku door damage =====
export function computeDoorDamageDetailed(twinIdx, saveData, activeCharIdx) {
  var s = saveData;
  var nd = s.ninjaData || [];
  var olaData = s.olaData || [];
  var spelunkData = s.spelunkData || [];
  var slotIdx = 13 + 4 * twinIdx;
  var slot = nd[slotIdx] || [];
  var itemKey = String(slot[0] || 'Blank');
  var eq = NjEQ[itemKey];
  var isNunchaku = !!eq && _num(eq[0]) === 1 && _num(eq[1]) === 1;
  var weaponStat = isNunchaku ? _weaponItemStat(slotIdx, nd) : 0;
  var sneakLv = _num(s.lv0AllData && s.lv0AllData[twinIdx] && s.lv0AllData[twinIdx][17]);
  var goldInv = _goldInventoryBonuses(nd, olaData, spelunkData, s, activeCharIdx);
  var mahjong = _nlBonus(5, nd);
  var goldPerTen = _num(goldInv[22]);
  var sneakTens = Math.floor(sneakLv / 10);
  var goldDamage = _num(goldInv[18]);
  var y8 = 0;
  try { y8 = Number(bubbleValByKey('Y8', activeCharIdx || 0, s)) || 0; } catch(e) {}
  var gem2 = _gemstoneBonus(2, olaData, s, activeCharIdx);
  var trueBattering = _nlBonus(27, nd);
  var factors = {
    mahjong: 1 + mahjong / 100,
    goldPerTen: 1 + goldPerTen * sneakTens / 100,
    goldDamage: 1 + goldDamage / 100,
    y8: 1 + y8 / 100,
    gemstone: 1 + gem2 / 100,
    trueBattering: 1 + trueBattering / 100,
  };
  var damage = isNunchaku
    ? weaponStat * factors.mahjong * factors.goldPerTen * factors.goldDamage
      * factors.y8 * factors.gemstone * factors.trueBattering
    : 0;

  return {
    damage: damage,
    canHitDoor: isNunchaku,
    itemKey: itemKey,
    itemLevel: _num(slot[1]),
    weaponStat: weaponStat,
    sneakLv: sneakLv,
    sneakTens: sneakTens,
    bonuses: { mahjong: mahjong, goldPerTen: goldPerTen, goldDamage: goldDamage, y8: y8, gem2: gem2, trueBattering: trueBattering },
    factors: factors,
  };
}

export function computeUntieProgressDetailed(twinIdx, saveData, activeCharIdx) {
  var s = saveData;
  var nd = s.ninjaData || [];
  var slotIdx = 13 + 4 * twinIdx;
  var slot = nd[slotIdx] || [];
  var itemKey = String(slot[0] || 'Blank');
  var eq = NjEQ[itemKey];
  var isKunai = !!eq && _num(eq[0]) === 1 && _num(eq[1]) === 2;
  var weaponStat = isKunai ? _weaponItemStat(slotIdx, nd) : 0;
  var mahjong = _nlBonus(5, nd);
  var vial = 0;
  try { vial = Number(computeVialByKey('6Untie', s, activeCharIdx)) || 0; } catch(e) {}
  var progress = isKunai ? weaponStat * (1 + mahjong / 100) * (1 + vial / 100) : 0;
  return { progress: progress, canUntie: isKunai, itemKey: itemKey, itemLevel: _num(slot[1]), weaponStat: weaponStat, mahjong: mahjong, vial: vial };
}

export function buildDoorDamageBreakdown(twinIdx, saveData, activeCharIdx) {
  var d = computeDoorDamageDetailed(twinIdx, saveData, activeCharIdx);
  var twinName = (saveData.charNames && saveData.charNames[twinIdx]) || ('Twin ' + (twinIdx + 1));
  if (!d.canHitDoor) {
    return node(twinName + ' Door Damage / Hit', 0, [
      node('No Nunchaku equipped', 0, [
        node('Equipped weapon', 0, null, { fmt: 'raw', note: d.itemKey }),
        node('Item level', d.itemLevel, null, { fmt: 'raw' }),
      ], { fmt: 'raw', note: 'Only Nunchaku weapons use the native door attack action' }),
    ], { fmt: 'raw' });
  }
  return node(twinName + ' Door Damage / Hit', d.damage, [
    node('Nunchaku Weapon Damage', d.weaponStat, [
      node('Equipped weapon', 0, null, { fmt: 'raw', note: d.itemKey }),
      node('Item level', d.itemLevel, null, { fmt: 'raw' }),
    ], { fmt: 'raw', note: d.canHitDoor ? 'Native ItemStat for equipped Nunchaku' : 'No Nunchaku equipped; this twin does not attack doors' }),
    _pctFactorNode('Mahjong Boosters', d.bonuses.mahjong),
    node('Gold Inventory: Damage per 10 Sneaking Levels', d.factors.goldPerTen, [
      node('Bonus per 10 levels', d.bonuses.goldPerTen, null, { fmt: '%' }),
      node('Sneaking level groups', d.sneakTens, [
        node('Sneaking level', d.sneakLv, null, { fmt: 'raw' }),
      ], { fmt: 'raw' }),
      node('Combined bonus', d.bonuses.goldPerTen * d.sneakTens, null, { fmt: '%' }),
    ], { fmt: 'x' }),
    _pctFactorNode('Gold Inventory: Door Damage', d.bonuses.goldDamage),
    _pctFactorNode('Hinge Buster Bubble', d.bonuses.y8),
    _pctFactorNode('Gemstone: Door Damage', d.bonuses.gem2),
    _pctFactorNode('True Battering', d.bonuses.trueBattering),
  ], { fmt: 'raw', note: 'Only a Nunchaku wielder attacks an undefeated floor door' });
}

// ===== Find the best active character for stealth =====
// The logged-in character affects AllTalentLVz bonuses which feed into
// gemstone and gold inventory multipliers. Returns { charIdx, charName, stealth }.
export function findBestActiveChar(saveData) {
  var names = saveData.charNames || [];
  var n = names.length || 10;
  var best = { charIdx: 0, stealth: 0 };
  for (var ci = 0; ci < n; ci++) {
    var s = computeCoreStealth(0, saveData, ci);
    if (s > best.stealth) {
      best = { charIdx: ci, stealth: s };
    }
  }
  best.charName = names[best.charIdx] || ('Char ' + best.charIdx);
  return best;
}

// ===== Get fully-multiplied charm bonuses for all twins =====
// Returns an array of { type8, type16 } per twin, using proper gold inventory
// and symbol multipliers. Used for ally calculations in the UI.
export function getTwinAllyContributions(saveData, activeCharIdx) {
  var s = saveData;
  var nd = s.ninjaData || [];
  var olaData = s.olaData || [];
  var spelunkData = s.spelunkData || [];
  var goldInv = _goldInventoryBonuses(nd, olaData, spelunkData, s, activeCharIdx);
  var result = [];
  var count = Math.min(12, (saveData.charNames && saveData.charNames.length)
    || (saveData.lv0AllData && saveData.lv0AllData.length)
    || 12);
  for (var t = 0; t < count; t++) {
    var map = _twinCharmBonuses(t, nd, spelunkData, goldInv);
    result.push({ type8: _num(map[8]), type16: _num(map[16]) });
  }
  return result;
}

// ===== Check if twin is alone on its floor =====
function _isTwinSolo(twinIdx, ninjaData, playerCount) {
  var myFloor = _num(ninjaData[twinIdx] && ninjaData[twinIdx][0]);
  var count = Math.max(0, Math.min(12, Number(playerCount) || 12));
  for (var e = 0; e < count; e++) {
    if (e === twinIdx) continue;
    if (!ninjaData[e]) continue;
    if (_num(ninjaData[e][0]) === myFloor) return false;
  }
  return true;
}

// Solo multiplier: round(2 + floor(bonusType / 13))
// type 2 → 2x, types 13/14/19 → 3x
export function soloMultiplier(bonusType, twinIdx, ninjaData, playerCount) {
  if (bonusType !== 2 && bonusType !== 13 && bonusType !== 14 && bonusType !== 19) return 1;
  return _isTwinSolo(twinIdx, ninjaData, playerCount) ? Math.round(2 + Math.floor(bonusType / 13)) : 1;
}

// ===== Compute full action speed per twin =====
// ActionSpd = 1 + (NLbonuses(4) + NB(t,2) + gloveSPD + NB(24,-1)) / 100
export function computeActionSpeed(twinIdx, saveData, activeCharIdx, options) {
  options = options || {};
  var nd = saveData.ninjaData || [];
  var olaData = saveData.olaData || [];
  var spelunkData = saveData.spelunkData || [];
  var nkLvs = nd[103] || [];
  var nk4 = _num(nkLvs[4]) * _num(NinjaUpg[4] && NinjaUpg[4][5]);
  var goldInv = _goldInventoryBonuses(nd, olaData, spelunkData, saveData, activeCharIdx);
  var charmMap = _twinCharmBonuses(twinIdx, nd, spelunkData, goldInv);
  var nb2 = _num(charmMap[2]);
  // Solo twin: 2x action speed charm bonus when alone on floor
  var playerCount = (saveData.charNames && saveData.charNames.length)
    || (saveData.lv0AllData && saveData.lv0AllData.length)
    || 12;
  var isSolo = options.isSolo != null ? !!options.isSolo : _isTwinSolo(twinIdx, nd, playerCount);
  nb2 *= isSolo ? 2 : 1;
  var gSpd = _gloveSPD(twinIdx, nd);
  var nb24 = _num(goldInv[24]);
  return 1 + (nk4 + nb2 + gSpd + nb24) / 100;
}

// ===== NK11 extras for charm max drop level =====
// Returns { ninjaBonus21, gemstone7, palette30, vault88, cloud53 }
export function computeNK11Extras(saveData, activeCharIdx) {
  var nd = saveData.ninjaData || [];
  var olaData = saveData.olaData || [];
  var spelunkData = saveData.spelunkData || [];
  var goldInv = _goldInventoryBonuses(nd, olaData, spelunkData, saveData, activeCharIdx);
  var gem7 = _gemstoneBonus(7, olaData, saveData, activeCharIdx);
  var pal30 = 0;
  try { pal30 = computePaletteBonus(30, saveData) || 0; } catch(e) {}
  var v88 = 0;
  try { v88 = vaultUpgBonus(88, saveData) || 0; } catch(e) {}
  var c53 = 0;
  try { c53 = cloudBonus(53, saveData.weeklyBossData) || 0; } catch(e) {}
  return {
    ninjaBonus21: _num(goldInv[21]),
    gemstone7: gem7,
    palette30: pal30,
    vault88: v88,
    cloud53: c53,
  };
}
