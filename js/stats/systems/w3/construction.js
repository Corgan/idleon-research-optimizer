// ===== CONSTRUCTION SYSTEM (W3) =====
// Shrine bonuses, salt lick, construction mastery, small cog bonuses,
// PlayerBuildSpd, PlayerConExp, ExtraBuildSPDmulti, ExtraFlaggyRatemulti.

import { node } from '../../node.js';
import { label } from '../../entity-names.js';
import { computeCardLv, computeCardLvDetail } from '../common/cards.js';
import { shrineBase, shrinePerLevel } from '../../data/w3/shrine.js';
import { SaltLicks, AtomInfo } from '../../data/game/customlists.js';
import { BOSS3B_CARD_PCT } from '../../data/game-constants.js';

var SHRINE_DATA = {
  4: { base: shrineBase(4), perLevel: shrinePerLevel(4) },
};

export var shrine = {
  resolve: function(id, ctx) {
    var data = SHRINE_DATA[id];
    if (!data) return node(label('Shrine', id), 0, null, { note: 'shrine ' + id });
    var name = label('Shrine', id);
    var saveData = ctx.saveData;
    var shrineArr = saveData.shrineData && saveData.shrineData[id];
    if (!shrineArr) return node(name, 0, null, { note: 'shrine ' + id });
    var shrineLv = Number(shrineArr[3]) || 0;
    if (shrineLv <= 0) return node(name, 0, null, { note: 'shrine ' + id });

    var cd = computeCardLvDetail('Boss3B');
    var boss3bLv = cd.lv;
    var cardMulti = 1 + BOSS3B_CARD_PCT * boss3bLv / 100;
    var baseBonus = (shrineLv - 1) * data.perLevel + data.base;
    var val = cardMulti * baseBonus;

    var cardChildren = boss3bLv > 0 ? [
      node('Card Qty', cd.qty, null, { fmt: 'raw' }),
      node('Card Lv', cd.lv, null, { fmt: 'raw' }),
      node('Max Stars', cd.maxStars, null, { fmt: 'raw' }),
    ] : null;

    return node(name, val, [
      node('Shrine Level ' + shrineLv, baseBonus, null, { fmt: '+', note: data.base + ' base + ' + data.perLevel + '/level' }),
      node('Boss3B Card Bonus', cardMulti, cardChildren, { fmt: 'x', note: BOSS3B_CARD_PCT + '% per level' }),
    ], { fmt: '+', note: 'shrine ' + id });
  },
};

// ==================== SHRINE BY INDEX ====================
// Simplified shrine value lookup by index (no breakdown tree).

import { saveData as _consSaveData } from '../../../state.js';
import { cardLv as _consCardLv } from '../common/goldenFood.js';

export function computeShrine(idx) {
  var shrineLv = Number(_consSaveData.shrineData && _consSaveData.shrineData[idx] && _consSaveData.shrineData[idx][3]) || 0;
  if (shrineLv <= 0) return 0;
  var base = shrineBase(idx);
  var perLv = shrinePerLevel(idx);
  var rawVal = base + perLv * (shrineLv - 1);
  var boss3bLv = _consCardLv('Boss3B') || 0;
  var boss3bMulti = 1 + BOSS3B_CARD_PCT * boss3bLv / 100;
  return rawVal * boss3bMulti;
}

// ==================== SALT LICK ====================

export function computeSaltLick(idx) {
  if (!_consSaveData.saltLickData) return 0;
  var purchased = Number(_consSaveData.saltLickData[idx]) || 0;
  if (purchased <= 0) return 0;
  if (!SaltLicks[idx]) return 0;
  var perLv = Number(SaltLicks[idx][3]) || 0;
  return purchased * perLv;
}

// ==================== CONSTRUCTION MASTERY ====================
// Game: WorkbenchStuff("ConstMasteryBonus", type, 0)
// Requires Rift[0] >= 40. Based on total tower levels.
// Thresholds: [250, 500, 750, 1000, 1250, 1500, 2500]

var MASTERY_THRESHOLDS = [250, 500, 750, 1000, 1250, 1500, 2500];

export function computeConstMasteryBonus(type) {
  if (Number(_consSaveData.riftData && _consSaveData.riftData[0]) < 40) return 0;
  var totalLv = computeTotalTowerLv();
  if (type === 0) return Math.max(0, Math.floor(totalLv / 10));
  if (type === 1) return Math.max(0, 2 * Math.floor((totalLv - MASTERY_THRESHOLDS[2]) / 10));
  if (type === 2) return Math.max(0, 5 * Math.floor((totalLv - MASTERY_THRESHOLDS[4]) / 10));
  if (type === 3) return totalLv >= MASTERY_THRESHOLDS[1] ? 35 : 0;
  if (type === 4) return totalLv >= MASTERY_THRESHOLDS[3] ? 100 : 0;
  if (type === 5) return totalLv >= MASTERY_THRESHOLDS[5] ? 100 : 0;
  if (type === 6) return totalLv >= MASTERY_THRESHOLDS[6] ? 30 : 0;
  return 0;
}

export function computeTotalTowerLv() {
  var tow = _consSaveData.towerData;
  if (!tow) return 0;
  var total = 0;
  for (var i = 0; i < 27; i++) total += Number(tow[i]) || 0;
  return total;
}

// ==================== SMALL COG BONUSES ====================
// Game: ResearchStuff("SmallCogBonusTOTAL", type, 0)
// Iterates CogOrder[228..251] for small cogs (name starts with "CogSm").
// Game uses Number2Letter.indexOf(charAt(5)) for type:
//   CogSm_ → type 0 (flaggy, 2×), CogSma → type 1 (build, 4×), CogSmb → type 2 (exp, 1×)
var _SM_N2L = '_abcdefghijklmnopqrstuvwxyz';

function computeSmallCogBonus(type, level) {
  var base = (25 + 25 * level * level) * (1 + level / 5);
  if (type === 0) return Math.round(2 * base);
  if (type === 1) return Math.round(4 * base);
  return Math.round(base);
}

export function computeSmallCogBonusTOTAL(type) {
  var cogOrder = _consSaveData.cogOrderData;
  if (!cogOrder || !cogOrder.length) return 0;
  var total = 0;
  for (var s = 0; s < 24; s++) {
    var name = String(cogOrder[228 + s] || '');
    if (name.indexOf('CogSm') !== 0) continue;
    var cogType = _SM_N2L.indexOf(name.charAt(5));
    if (cogType < 0 || cogType !== type) continue;
    var cogLevel = Number(name.substring(6)) || 0;
    total += computeSmallCogBonus(cogType, cogLevel);
  }
  return Math.round(total);
}

// ==================== COG BOARD TOTALS ====================
// Sums CogMap per-slot computed bonuses into board-wide totals.
// Keys: a=flat build, b=flat exp, c=flat flaggy,
//   d=%constExp, e=%buildRate, f=%playerConstXP, g=%flaggyRate

export function computeCogBoardTotals() {
  var cogMap = _consSaveData.cogMapData;
  var result = { flatBuild: 0, flatExp: 0, flatFlaggy: 0, pctConstExp: 0, pctBuildRate: 0, pctPlayerConstXP: 0, pctFlaggyRate: 0 };
  if (!cogMap) return result;
  for (var i = 0; i < 96; i++) {
    var entry = cogMap[i];
    if (!entry) continue;
    result.flatBuild += Number(entry.a) || 0;
    result.flatExp += Number(entry.b) || 0;
    result.flatFlaggy += Number(entry.c) || 0;
    result.pctConstExp += Number(entry.d) || 0;
    result.pctBuildRate += Number(entry.e) || 0;
    result.pctPlayerConstXP += Number(entry.f) || 0;
    result.pctFlaggyRate += Number(entry.g) || 0;
  }
  return result;
}

// ==================== OWNED ITEM COUNT ====================
// Scans chest storage + refinery storage for a specific item name.
// Game's _ItemsOwnedMap includes items stored in the refinery.

export function computeOwnedItemCount(itemName) {
  var co = _consSaveData.chestOrderData;
  var cq = _consSaveData.chestQuantityData;
  var total = 0;
  if (Array.isArray(co)) {
    for (var i = 0; i < co.length; i++) {
      if (co[i] === itemName) total += Number(cq[i]) || 0;
    }
  }
  // Refinery storage: ref[1] = salt names, ref[2] = stored input quantities
  var ref = _consSaveData.refineryData;
  if (Array.isArray(ref) && Array.isArray(ref[1]) && Array.isArray(ref[2])) {
    for (var ri = 0; ri < ref[1].length; ri++) {
      if (ref[1][ri] === itemName) total += Number(ref[2][ri]) || 0;
    }
  }
  return total;
}

// ==================== PLAYER BUILD SPEED ====================
// Game: WorkbenchStuff("PlayerBuildSpd", charIdx, 0)
// Per-character build speed for construction board.

import { formulaEval, getLOG } from '../../../formulas.js';
import { bubbleValByKey, computeVialByKey } from '../w2/alchemy.js';
import { computeStampBonusOfTypeX } from '../w1/stamp.js';
import { arcadeBonus } from '../w2/arcade.js';
import { achieveStatus } from '../common/achievement.js';
import { guild } from '../common/guild.js';
import { etcBonus } from '../common/etcBonus.js';
import { votingBonusz, companions, vaultUpgBonus } from '../common/goldenFood.js';
import { computeWinBonus } from '../../systems/w6/summoning.js';
import { computeVaultKillzTotal } from '../common/vaultKillz.js';
import { computePaletteBonus } from '../../systems/w7/spelunking.js';
import { bubbaRoGBonuses } from '../../systems/w7/bubba.js';
import { talentParams } from '../../data/common/talent.js';
import { computeAllTalentLVz } from '../common/talent.js';
import { skillLvData, numCharacters, charClassData, postOfficeData, cauldronBubblesData } from '../../../save/data.js';

function _safe(fn) {
  try {
    var args = [];
    for (var i = 1; i < arguments.length; i++) args.push(arguments[i]);
    var v = fn.apply(null, args);
    return (v !== v || v == null) ? 0 : v;
  } catch (e) { return 0; }
}

function _rval(resolver, id, ctx, args) {
  try { return resolver.resolve(id, ctx, args).val || 0; } catch (e) { return 0; }
}

export function computePlayerBuildSpd(ci, opts) {
  var s = _consSaveData;
  var constLv = Number(s.lv0AllData && s.lv0AllData[ci] && s.lv0AllData[ci][8]) || 0;
  if (constLv <= 0) return 0;

  // Base: 3 * pow(constLv/2 + 0.7, 1.6)
  var base = 3 * Math.pow(constLv / 2 + 0.7, 1.6);

  // Bubble multiplier: 1 + constLv * AlchBubbles.Construction / 100
  var constBubble = _safe(bubbleValByKey, 'Construction', ci);
  var bubbleMult = 1 + constLv * constBubble / 100;

  // Additive pool
  var ctx = { charIdx: ci, saveData: s };
  var stampBuildProd = _safe(computeStampBonusOfTypeX, 'BuildProd');
  var postOffice17 = Number(postOfficeData[ci] && postOfficeData[ci][17]) || 0;
  var guildBonus5 = _rval(guild, 5, ctx);
  var etcBonus30 = _rval(etcBonus, '30', ctx);
  var ach153 = Math.min(5, 5 * _safe(achieveStatus, 153));
  var constMastery2 = computeConstMasteryBonus(2);
  var vialContspd = _safe(computeVialByKey, 'Contspd');
  var arcade44 = _safe(arcadeBonus, 44);
  var voting18 = _safe(votingBonusz, 18, 1);
  var summUpg48 = _safe(vaultUpgBonus, 48);
  var vaultKills11 = _safe(computeVaultKillzTotal, 11);
  var bubbaRoG1 = _safe(bubbaRoGBonuses, 1);

  var addPool = stampBuildProd + 0.25 * postOffice17
    + guildBonus5 + etcBonus30
    + ach153 + constMastery2
    + vialContspd + arcade44
    + voting18
    + summUpg48 * vaultKills11
    + bubbaRoG1;
  var additiveMulti = 1 + addPool / 100;

  // True multipliers
  var winBonus13 = (opts && opts.noArt32) ? _safe(computeWinBonus, 13, opts) : _safe(computeWinBonus, 13);
  var palette25 = _safe(computePaletteBonus, 25);
  var vial6turtle = _safe(computeVialByKey, '6turtle');
  var trueMulti = (1 + winBonus13 / 100) * (1 + palette25 / 100) * (1 + vial6turtle / 100);

  // Talent 131 (Redox Rates): requires Refinery1 items owned
  var talentPart = 1;
  var sl = skillLvData[ci] || {};
  var rawLv131 = Number(sl[131] || sl['131']) || 0;
  if (rawLv131 > 0) {
    var tp131 = talentParams(131);
    if (tp131 && tp131.formula) {
      // Game uses raw SkillLevels[131], NOT effective level with bonuses
      var talent131Val = formulaEval(tp131.formula, tp131.x1, tp131.x2, rawLv131);

      var atomBonus1 = (Number(s.atomsData && s.atomsData[1]) || 0) * (Number(AtomInfo[1] && AtomInfo[1][4]) || 0);
      var refinery1Count = computeOwnedItemCount('Refinery1');
      var logRef1 = getLOG(refinery1Count);

      talentPart = 1 + talent131Val * (atomBonus1 + logRef1) / 100;
    }
  }

  return base * bubbleMult * additiveMulti * trueMulti * talentPart;
}

// ==================== PLAYER CONSTRUCTION EXP ====================
// Game: WorkbenchStuff("PlayerConExp", charIdx, 0)
// Active player version: (pow(buildSpd, 0.7)/2 + (2 + 6*constLv)) × (1 + addPool/100) × (1 + SmallCogBonusTOTAL(2)/100)
// Inactive player version: simpler formula with bubble + vial + statue + stamp

import { computeStatueBonusGiven } from '../common/stats.js';
import { computeStarSignBonus } from '../common/starSign.js';

export function computePlayerConExp(ci, isActive) {
  var s = _consSaveData;
  var constLv = Number(s.lv0AllData && s.lv0AllData[ci] && s.lv0AllData[ci][8]) || 0;
  var buildSpd = computePlayerBuildSpd(ci);
  var basePart = Math.pow(buildSpd, 0.7) / 2 + (2 + 6 * constLv);
  var smallCogExp = computeSmallCogBonusTOTAL(2);

  if (isActive) {
    // Active char: full additive pool
    var ctx = { charIdx: ci, saveData: s };
    var conEXPbubble = _safe(bubbleValByKey, 'conEXPACTIVE', ci);
    var sl = skillLvData[ci] || {};

    // GetTalentNumber(1, 132) and GetTalentNumber(1, 104) for active char
    var tal132Val = _computeTalentVal(132, ci);
    var tal104Val = _computeTalentVal(104, ci);

    var vialConsExp = _safe(computeVialByKey, 'ConsExp');
    var statue18 = _safe(computeStatueBonusGiven, 18);
    var stampConstExp = _safe(computeStampBonusOfTypeX, 'ConstructionExp');
    var voting18 = _safe(votingBonusz, 18, 1);
    var starConstExp = _safe(computeStarSignBonus, 'ConstExp', ci);
    var postOffice17 = Number(postOfficeData[ci] && postOfficeData[ci][17]) || 0;
    var poBonus = Math.max(0, 0.5 * (postOffice17 - 100));

    var addPool = conEXPbubble + tal132Val + tal104Val
      + vialConsExp + statue18 + stampConstExp
      + voting18 + starConstExp + poBonus;

    return basePart * (1 + addPool / 100) * (1 + smallCogExp / 100);
  }

  // Inactive char: simplified formula
  var cls = Number(charClassData && charClassData[ci]) || 0;
  var dn2 = 0;

  // Check if char benefits from Construction bubble
  // Game: CauldronBubbles[t] contains "_11" || Companions(4)==1
  var allBubblesActive = s.companionIds.has(4);
  var hasBub = allBubblesActive;
  if (!hasBub) {
    // Check cauldron bubbles for this char
    var cb = null;
    cb = cauldronBubblesData[ci];
    if (Array.isArray(cb) && cb.some(function(b) { return String(b).indexOf('_11') >= 0; })) hasBub = true;
  }

  if (hasBub) {
    // BubbleBonus(0, 11, 0): orange bubble #11 = construction EXP bubble
    var bubbleVal = _safe(bubbleValByKey, 'conEXPACTIVE', ci);
    if (cls < 18) {
      // Warrior: multiply by Opassz
      var opassz = _safe(bubbleValByKey, 'Opassz');
      dn2 = bubbleVal * Math.max(1, opassz) + _safe(computeVialByKey, 'ConsExp');
    } else {
      dn2 = bubbleVal + _safe(computeVialByKey, 'ConsExp');
    }
  }

  // talent 132
  dn2 += _computeTalentVal(132, ci);

  // Statue 18 raw (game uses statueLv * StatueInfo[18][3], not computeStatueBonusGiven)
  var statueLv18 = Number(s.statueData && s.statueData[18]) || 0;
  var statueBase18 = 1; // StatueInfo[18][3]
  statueBase18 = Number(StatueInfo[18] && StatueInfo[18][3]) || 1;
  dn2 += statueLv18 * statueBase18;

  dn2 += _safe(computeStampBonusOfTypeX, 'ConstructionExp');
  dn2 += _safe(votingBonusz, 18, 1);
  var postOffice17 = Number(postOfficeData[ci] && postOfficeData[ci][17]) || 0;
  dn2 += Math.max(0, 0.5 * (postOffice17 - 100));

  dn2 = (1 + dn2 / 100) * (1 + smallCogExp / 100);

  // Star sign "45" bonus
  var starSignPV = s.lv0AllData && s.lv0AllData[ci] && s.lv0AllData[ci][19];
  var personalMap = typeof starSignPV === 'object' ? starSignPV : null;
  // Check PersonalValuesMap.StarSign for "45"
  var hasStarSign45 = false;
  if (s.starSignProgData && s.starSignProgData[ci]) {
    var starArr = s.starSignProgData[ci];
    if (typeof starArr === 'string') hasStarSign45 = starArr.indexOf('45') >= 0;
    else if (Array.isArray(starArr)) hasStarSign45 = starArr.indexOf('45') >= 0 || starArr.indexOf(45) >= 0;
  }
  if (hasStarSign45) dn2 += 25;

  return basePart * dn2;
}

function _computeTalentVal(talentIdx, ci) {
  var sl = skillLvData[ci] || {};
  var rawLv = Number(sl[talentIdx] || sl[String(talentIdx)]) || 0;
  if (rawLv <= 0) return 0;
  var tp = talentParams(talentIdx);
  if (!tp || !tp.formula) return 0;
  var bonus = computeAllTalentLVz(talentIdx, ci);
  return formulaEval(tp.formula, tp.x1, tp.x2, rawLv + bonus);
}

// ==================== EXTRA BUILD SPEED MULTIPLIER ====================
// Game: WorkbenchStuff("ExtraBuildSPDmulti", 0, 0)
// (1 + SmallCogBonusTOTAL(1)/100) × (1 + Companions(157)/100)

export function computeExtraBuildSPDmulti() {
  var smallCogBuild = computeSmallCogBonusTOTAL(1);
  var comp157 = _safe(companions, 157);
  return (1 + smallCogBuild / 100) * (1 + comp157 / 100);
}

// ==================== EXTRA FLAGGY RATE MULTIPLIER ====================
// Game: WorkbenchStuff("ExtraFlaggyRatemulti", 0, 0)
// (1 + SmallCogBonusTOTAL(0)/100) × (1 + Grid_Bonus(89)/100) × (1 + 10*CardLv("w7b3")/100)

import { gridBonusFinal } from '../../defs/helpers.js';

export function computeExtraFlaggyRatemulti() {
  var smallCogFlaggy = computeSmallCogBonusTOTAL(0);
  var grid89 = gridBonusFinal(_consSaveData, 89);
  var cardW7b3 = _safe(computeCardLv, 'w7b3');
  return (1 + smallCogFlaggy / 100) * (1 + grid89 / 100) * (1 + 10 * cardW7b3 / 100);
}
