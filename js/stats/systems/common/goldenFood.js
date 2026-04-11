// ===== GOLDEN FOOD SYSTEM =====
// All golden food helper functions and the GfoodBonusMULTI formula.

import { node } from '../../node.js';
import { label } from '../../entity-names.js';
import { saveData } from '../../../state.js';
import {
  equipOrderData, equipQtyData, optionsListData,
  skillLvData, numCharacters, klaData, charClassData,
  cauldronInfoData, stampLvData, emmData, labData,
} from '../../../save/data.js';
import { getLOG, formulaEval } from '../../../formulas.js';
import { gbWith } from '../../../sim-math.js';
import { computeMeritocBonusz } from '../w7/meritoc.js';
import { ribbonBonusAt } from '../../../game-helpers.js';
import { computeAllTalentLVz } from './talent.js';
import { mainframeBonus } from '../w4/lab.js';
import { computeWinBonus } from '../w6/summoning.js';
import { computeShinyBonusS } from '../w4/breeding.js';
import { bubbleParams } from '../../data/w2/alchemy.js';
import { CLASS_TREES, FAMILY_BONUS_33, TALENT_144 } from '../../data/common/talent.js';
import { talentParams } from '../../data/common/talent.js';
import { companionBonus } from '../../data/common/companions.js';
import { SET_BONUS_VALUES } from '../../data/common/equipment.js';
import { starSignDropVal } from '../../data/common/starSign.js';
import votingMultiDesc from '../../defs/voting-multi.js';
import { itemUqMatch } from '../../data/common/equipment.js';
import { isFightingMap, mapKillReq } from '../../../game-data.js';
import { isBubblePrismad, getPrismaBonusMult } from '../w2/alchemy.js';
import { isExalted, computeStampDoublerSources } from '../w1/stamp.js';
import { computeSeraphMulti } from './starSign.js';
import { GOLD_FOOD_INFO, EMPORIUM_FOOD_SLOTS } from '../../data/common/goldenFood.js';
import { bribeValue } from '../../data/common/bribes.js';
import { ACHIEVE_STATUS } from '../../data/game/hardcoded.js';
import { vaultUpgPerLevel } from '../../data/common/vault.js';
import { VAULT_NO_MASTERY } from '../../data/game-constants.js';
import { sigilTiers, pristineCharmBonus } from '../../data/common/sigils.js';
import { votingBonusValue } from '../../data/common/voting.js';
import { legendPTSbonus } from '../w7/spelunking.js';
import { computeCardLv } from './cards.js';
import { GRIMOIRE_NO_MULTI } from '../../data/game-constants.js';

// AchieveStatus: game returns hardcoded tier value (5/10/20) for specific IDs, 1 for all others
var _achStatusLookup;
function _getAchStatusLookup() {
  if (_achStatusLookup) return _achStatusLookup;
  _achStatusLookup = {};
  for (var val in ACHIEVE_STATUS) {
    var ids = ACHIEVE_STATUS[val];
    for (var i = 0; i < ids.length; i++) _achStatusLookup[ids[i]] = Number(val);
  }
  return _achStatusLookup;
}

function achieveStatusTiered(idx) {
  if (saveData.achieveRegData[idx] !== -1) return 0;
  return _getAchStatusLookup()[idx] || 1;
}

export function getBribeBonus(idx) {
  var i = typeof idx === 'string' ? parseInt(idx) : Math.round(idx);
  if ((saveData.bribeStatusData[i] || 0) !== 1) return 0;
  return bribeValue(i);
}

export function pristineBon(idx) {
  if ((saveData.ninjaData[107] || [])[idx] !== 1) return 0;
  return pristineCharmBonus(idx);
}

export function sigilBonus(sigilIdx) {
  var level = Number((saveData.cauldronP2WData[4] || [])[1 + 2 * sigilIdx]) || 0;
  if (level < -0.1) return 0;
  var tiers = sigilTiers(sigilIdx);
  if (!tiers) return 0;
  var base;
  if (level < 0.5) base = tiers[0];
  else if (level < 1.5) base = tiers[1];
  else if (level < 2.5) base = tiers[2];
  else if (level < 3.5) base = tiers[3];
  else base = tiers[4] || tiers[3];
  var tier16 = Number((saveData.sailingData[3] || [])[16]) || 0;
  var artifactMulti = 1 + (tier16 === 0 ? 0 : Math.max(1, tier16));
  var meritocMulti = 1 + computeMeritocBonusz(21) / 100;
  return base * artifactMulti * meritocMulti;
}

export function vaultUpgBonus(idx) {
  var level = Number(saveData.vaultData[idx]) || 0;
  if (level <= 0) return 0;
  var perLv = vaultUpgPerLevel(idx);
  if (perLv == null) return 0;
  var base = level * perLv;
  // Mastery multiplier for non-whitelist indices
  if (!VAULT_NO_MASTERY.has(idx)) {
    var masteryLv = 0;
    var vd = saveData.vaultData;
    if (idx < 32)       masteryLv = Number(vd[32]) || 0;
    else if (idx <= 60) masteryLv = Number(vd[61]) || 0;
    else if (idx <= 88) masteryLv = Number(vd[89]) || 0;
    base *= 1 + masteryLv / 100;
  }
  return base;
}

export function grimoireUpgBonus(idx, grimoireGameData) {
  var level = Number(saveData.grimoireData[idx]) || 0;
  if (level <= 0) return 0;
  var perLv = (grimoireGameData && grimoireGameData[idx] && grimoireGameData[idx][5]) || 0;
  if (GRIMOIRE_NO_MULTI.has(idx)) return level * perLv;
  var multi36 = grimoireUpgBonus(36, grimoireGameData);
  return level * perLv * (1 + multi36 / 100);
}

export function votingBonusz(voteIdx, votingMulti) {
  var base = votingBonusValue(voteIdx);
  if (base === 0) return 0;
  // Voting bonuses only apply when the vote is the current server-wide winner
  if (saveData.activeVoteIdx !== voteIdx) return 0;
  var multi = votingMulti != null ? votingMulti : 1;
  return base * multi;
}

export function companions(idx) {
  if (!saveData.companionIds.has(idx)) return 0;
  return companionBonus(idx);
}

export function cardLv(cardId) {
  return computeCardLv(cardId);
}

export function getSetBonus(setName) {
  var perma = String(optionsListData[379] || '');
  if (!perma.includes(setName)) return 0;
  return SET_BONUS_VALUES[setName] || 0;
}

export function gfoodBonusMULTI(charIdx, opts) {
  var inputs = computeGFoodInputs(charIdx, opts && opts.dnsmCache);
  var setMul = 1 + getSetBonus('SECRET_SET') / 100;
  var famBonus = Math.max(inputs.famBonusQTYs66, 1);
  var votingMulti = (opts && opts.votingBonuszMulti != null) ? opts.votingBonuszMulti : inputs.votingBonuszMulti;
  var rest =
    inputs.etcBonuses8 +
    inputs.getTalentNumber1_99 +
    inputs.stampBonusGFood +
    achieveStatusTiered(37) +
    inputs.alchBubblesGFoodz +
    sigilBonus(14) +
    inputs.mealBonusZGoldFood +
    inputs.starSigns69 +
    getBribeBonus(36) +
    pristineBon(14) +
    2 * achieveStatusTiered(380) +
    3 * achieveStatusTiered(383) +
    votingBonusz(26, votingMulti) +
    inputs.getbonus2_1_209 * inputs.calcTalentMAP209 +
    companions(48) +
    legendPTSbonus(25) +
    Math.min(4 * cardLv('cropfallEvent1'), 50) +
    companions(155) +
    vaultUpgBonus(86);
  return setMul * (famBonus + rest / 100);
}

export function goldFoodBonuses(effectType, charIdx, preMulti) {
  var multi = preMulti != null ? preMulti : gfoodBonusMULTI(charIdx);
  var total = 0;
  var equippedInfo = null;
  var emporiumInfo = null;
  var foodBag = (equipOrderData[charIdx] && equipOrderData[charIdx][2]) || {};
  var qtyBag = (equipQtyData[charIdx] && equipQtyData[charIdx][2]) || {};
  for (var i = 0; i < 16; i++) {
    var itemName = foodBag[i] || 'Blank';
    if (itemName === 'Blank') continue;
    var info = GOLD_FOOD_INFO[itemName];
    if (!info || info.effect !== effectType) continue;
    var qty = Number(qtyBag[i]) || 0;
    var lg = getLOG(1 + qty);
    var val = info.amount * multi * 0.05 * lg * (1 + lg / 2.14);
    total = val;
    equippedInfo = { item: itemName, amount: info.amount, qty: qty, lg: lg, val: val };
  }
  var ninja104 = saveData.ninjaData[104];
  var empUnlocked = Array.isArray(ninja104) ? ninja104.some(function(v) { return Number(v) > 0; }) : true;
  if (empUnlocked) {
    for (var i = 0; i < EMPORIUM_FOOD_SLOTS.length; i++) {
      var itemName = EMPORIUM_FOOD_SLOTS[i];
      var info = GOLD_FOOD_INFO[itemName];
      if (!info || info.effect !== effectType) continue;
      var empLevel = Number((saveData.ninjaData[104] || [])[i]) || 0;
      if (empLevel > 0) {
        var effQty = 1000 * Math.pow(10, empLevel);
        var lg = getLOG(1 + effQty);
        var val = info.amount * multi * 0.05 * lg * (1 + lg / 2.14);
        total += val;
        emporiumInfo = { item: itemName, amount: info.amount, empLevel: empLevel, effQty: effQty, lg: lg, val: val };
      }
      break;
    }
  }
  return { total: total, equipped: equippedInfo, emporium: emporiumInfo, multi: multi };
}

export function gfoodBonusMULTIBreakdown(charIdx, opts) {
  var inputs = computeGFoodInputs(charIdx, opts && opts.dnsmCache);
  var T = inputs._trees;
  var votingMulti = (opts && opts.votingBonuszMulti != null) ? opts.votingBonuszMulti : inputs.votingBonuszMulti;
  var votingTree = (opts && opts.votingTree) || null;
  var sigilVal = sigilBonus(14);
  var sigilLv = Number((saveData.cauldronP2WData[4] || [])[1 + 2 * 14]) || 0;
  var votingVal = votingBonusz(26, votingMulti);
  var legendVal = legendPTSbonus(25);
  var cardVal = Math.min(4 * cardLv('cropfallEvent1'), 50);
  var vaultVal = vaultUpgBonus(86);
  var vaultLv = Number(saveData.vaultData[86]) || 0;
  var brb36 = getBribeBonus(36);
  var prist14 = pristineBon(14);
  var ach37 = achieveStatusTiered(37);
  var ach380 = achieveStatusTiered(380);
  var ach383 = achieveStatusTiered(383);
  var comp48 = companions(48);
  var comp155 = companions(155);
  var tal209xMap = inputs.getbonus2_1_209 * inputs.calcTalentMAP209;

  var items = [
    { name: label('Family', 66),     val: Math.max(inputs.famBonusQTYs66, 1), tree: T.famBonusQTYs66 },
    { name: 'GFood Equip UQ',       val: inputs.etcBonuses8, tree: T.etcBonuses8 },
    { name: label('Talent', 99), val: inputs.getTalentNumber1_99, tree: T.getTalentNumber1_99 },
    { name: 'GFood Stamp',          val: inputs.stampBonusGFood, tree: T.stampBonusGFood },
    { name: label('Achievement', 37), val: ach37 },
    { name: label('Bubble', 'O18'),     val: inputs.alchBubblesGFoodz, tree: T.alchBubblesGFoodz },
    { name: label('Sigil', 14),     val: sigilVal, tree: sigilLv > 0 ? node(label('Sigil', 14), sigilVal, [
      node('Sigil Lv', sigilLv, null, { fmt: 'raw' }),
      node(label('Artifact', 16, ' \u00d7'), 1 + inputs.artifactBonus16, T.artifactBonus16 ? [T.artifactBonus16] : null, { fmt: 'x' }),
      node(label('Meritoc', 21, ' ×'), 1 + inputs.meritocBonusz21 / 100, null, { fmt: 'x' }),
    ], { fmt: 'raw' }) : null },
    { name: 'Meal (Peachring)',     val: inputs.mealBonusZGoldFood, tree: T.mealBonusZGoldFood },
    { name: label('Star Sign', 69), val: inputs.starSigns69, tree: T.starSigns69 },
    { name: label('Bribe', 36),      val: brb36 },
    { name: label('Pristine', 14),   val: prist14 },
    { name: '2×' + label('Achievement', 380), val: 2 * ach380 },
    { name: '3×' + label('Achievement', 383), val: 3 * ach383 },
    { name: label('Voting', 26),     val: votingVal, tree: votingVal > 0 ? node(label('Voting', 26), votingVal, [
      node('Base', votingBonusValue(26), null, { fmt: 'raw' }),
      node('Voting Multi ×', votingMulti, votingTree ? votingTree.children : (T.votingBonuszMulti ? T.votingBonuszMulti.children : null), { fmt: 'x' }),
    ], { fmt: 'raw' }) : null },
    { name: label('Talent', 209, ' × Maps'), val: tal209xMap, tree: tal209xMap > 0 ? node(label('Talent', 209, ' × Maps'), tal209xMap, [
      T.getbonus2_1_209 || node(label('Talent', 209), inputs.getbonus2_1_209),
      T.calcTalentMAP209 || node('1B+ Maps', inputs.calcTalentMAP209),
    ], { fmt: 'raw' }) : null },
    { name: label('Companion', 48), val: comp48, tree: comp48 > 0 ? node(label('Companion', 48), comp48) : null },
    { name: label('Legend', 25),      val: legendVal },
    { name: 'Card cropfall ×4',     val: cardVal, tree: cardVal > 0 ? node('Card cropfall', cardVal, [
      node('Card Lv', cardLv('cropfallEvent1'), null, { fmt: 'raw' }),
      node('× 4 (capped 50)', cardVal, null, { fmt: 'raw' }),
    ], { fmt: 'raw' }) : null },
    { name: label('Companion', 155), val: comp155, tree: comp155 > 0 ? node(label('Companion', 155), comp155) : null },
    { name: label('Vault', 86), val: vaultVal, tree: vaultLv > 0 ? node(label('Vault', 86), vaultVal, [
      node('Level', vaultLv, null, { fmt: 'raw' }),
    ], { fmt: 'raw' }) : null },
  ];
  var famBonus = items[0].val;
  var rest = items.reduce(function(acc, it, idx) { return idx === 0 ? acc : acc + it.val; }, 0);
  var setMul = 1 + getSetBonus('SECRET_SET') / 100;
  return { items: items, sum: famBonus + rest, setMul: setMul, result: setMul * (famBonus + rest / 100) };
}

// ===== GOLDEN FOOD INPUT COMPUTATION =====
// Computes the deep-chain values needed by the GFood multiplier formula.
// Moved from dnsm-context.js — this is the single source of truth.

export function createGFoodInputs(overrides) {
  return Object.assign({
    famBonusQTYs66: 0,
    etcBonuses8: 0,
    getTalentNumber1_99: 0,
    stampBonusGFood: 0,
    alchBubblesGFoodz: 0,
    mealBonusZGoldFood: 0,
    starSigns69: 0,
    getbonus2_1_209: 0,
    calcTalentMAP209: 0,
    votingBonuszMulti: 1,
    artifactBonus16: 0,
    meritocBonusz21: 0,
    emporiumBonusUnlocked: true,
    _trees: {},
  }, overrides || {});
}

export function computeGFoodInputs(charIdx, dnsmCache) {
  charIdx = charIdx || 0;
  var inputs = createGFoodInputs();
  var T = inputs._trees;
  var dc = dnsmCache || null;

  // === meritocBonusz21 ===
  inputs.meritocBonusz21 = computeMeritocBonusz(21);

  // === getTalentNumber1_99 ===
  {
    var sl = skillLvData[charIdx] || {};
    var rawLv = Number(sl[99]) || 0;
    var allTalentLv = rawLv > 0 ? computeAllTalentLVz(99, charIdx) : 0;
    var effectiveLv = rawLv + allTalentLv;
    var _t99 = talentParams(99);
    inputs.getTalentNumber1_99 = effectiveLv > 0 ? formulaEval(_t99.formula, _t99.x1, _t99.x2, effectiveLv) : 0;
    T.getTalentNumber1_99 = node(label('Talent', 99), inputs.getTalentNumber1_99, effectiveLv > 0 ? [
      node('Base Lv', rawLv, null, { fmt: 'raw' }),
      node('Bonus Lv', allTalentLv, null, { fmt: '+' }),
      node('Effective Lv', effectiveLv, null, { fmt: 'raw' }),
    ] : null, { fmt: 'raw', note: _t99.formula + '(' + _t99.x1 + ',' + _t99.x2 + ',' + effectiveLv + ')' });
  }

  // === getbonus2_1_209 ===
  // Game's getbonus2(-1) passes SkillLevels[t] (raw talent level) to AllTalentLVz
  // instead of the talent index. We replicate this by passing rawLv as talentIdx.
  {
    var maxVal = 0, bestCi = -1, bestBase = 0, bestBonus = 0, bestEff = 0;
    for (var ci = 0; ci < numCharacters; ci++) {
      var sl = skillLvData[ci] || {};
      var rawLv = Number(sl[209]) || 0;
      if (rawLv > 0) {
        var allTalentLv = computeAllTalentLVz(rawLv, ci, {
          contextSlot: charIdx
        });
        var effectiveLv = rawLv + allTalentLv;
        var _t209 = talentParams(209);
        var val = formulaEval(_t209.formula, _t209.x1, _t209.x2, effectiveLv);
        if (val > maxVal) { maxVal = val; bestCi = ci; bestBase = rawLv; bestBonus = allTalentLv; bestEff = effectiveLv; }
      }
    }
    inputs.getbonus2_1_209 = maxVal;
    T.getbonus2_1_209 = node(label('Talent', 209), maxVal, maxVal > 0 ? [
      node('Best Char', bestCi, null, { fmt: 'raw' }),
      node('Base Lv', bestBase, null, { fmt: 'raw' }),
      node('Bonus Lv', bestBonus, null, { fmt: '+' }),
      node('Effective Lv', bestEff, null, { fmt: 'raw' }),
    ] : null, { fmt: 'raw', note: 'decayMulti(2,200,' + bestEff + ')' });
  }

  // === artifactBonus16 ===
  {
    var tier = Number((saveData.sailingData[3] || [])[16]) || 0;
    inputs.artifactBonus16 = tier === 0 ? 0 : Math.max(1, tier);
    T.artifactBonus16 = node(label('Artifact', 16), inputs.artifactBonus16, tier > 0 ? [
      node('Base', 1, null, { fmt: 'raw' }),
      node('Tier', tier, null, { fmt: 'x' }),
    ] : null, { fmt: 'raw' });
  }

  // === calcTalentMAP209 ===
  if (dc && dc.calcTalentMAP209 != null) {
    inputs.calcTalentMAP209 = dc.calcTalentMAP209;
    T.calcTalentMAP209 = node('1B+ Overkill Maps', dc.calcTalentMAP209, null, { fmt: 'raw', note: 'DNSM cached' });
  } else {
    var dkIdx = -1;
    for (var ci = 0; ci < numCharacters; ci++) {
      var classId = charClassData[ci] || 0;
      var tree = CLASS_TREES[classId];
      if (tree && tree[3] === 10) dkIdx = ci;
    }
    var count = 0;
    if (dkIdx >= 0) {
      var kla = klaData[dkIdx] || [];
      for (var m = 0; m < kla.length; m++) {
        if (!isFightingMap(m)) continue;
        var arr = kla[m];
        if (!Array.isArray(arr)) continue;
        var killsDone = mapKillReq(m) - Number(arr[0]);
        if (killsDone >= 1e9) count++;
      }
    }
    inputs.calcTalentMAP209 = count;
    T.calcTalentMAP209 = node('1B+ Overkill Maps', count, dkIdx >= 0 ? [
      node('DK Character', dkIdx, null, { fmt: 'raw' }),
    ] : null, { fmt: 'raw' });
  }

  // === votingBonuszMulti (delegated to voting-multi descriptor) ===
  {
    var vr = votingMultiDesc.combine({}, { saveData });
    inputs.votingBonuszMulti = vr.val;
    T.votingBonuszMulti = node('Voting Multi', vr.val, vr.children, { fmt: 'x' });
  }

  // === stampBonusGFood ===
  {
    var stampLv = Number((stampLvData[2] || [])[6]) || 0;
    var exalted = isExalted(2, 6);
    var doublerInfo = exalted ? computeStampDoublerSources() : null;
    var exaltedMulti = exalted ? 1 + doublerInfo.total / 100 : 1;
    inputs.stampBonusGFood = stampLv * exaltedMulti;
    T.stampBonusGFood = node('GFood Stamp C7', inputs.stampBonusGFood, stampLv > 0 ? [
      node('Stamp Lv', stampLv, null, { fmt: 'raw' }),
    ].concat(exalted ? [
      node('Exalted ×', exaltedMulti, [
        node('StampDoubler', doublerInfo.total, doublerInfo.children, { fmt: 'raw' }),
      ], { fmt: 'x' }),
    ] : []) : null, { fmt: 'raw' });
  }

  // === alchBubblesGFoodz ===
  if (dc && dc.alchBubblesGFoodz != null) {
    inputs.alchBubblesGFoodz = dc.alchBubblesGFoodz;
    T.alchBubblesGFoodz = node(label('Bubble', 'O18'), dc.alchBubblesGFoodz, null, { fmt: 'raw', note: 'DNSM cached' });
  } else {
    var _shim = bubbleParams(0, 18);
    var _wr = bubbleParams(0, 1);
    var bubbleLv = Number((cauldronInfoData[0] || [])[_shim.index]) || 0;
    if (bubbleLv > 0) {
      var baseVal = formulaEval(
        _shim.formula, _shim.x1, _shim.x2, bubbleLv
      );
      var classId = charClassData[charIdx] || 0;
      var isWarrior = classId > 6 && classId < 18;
      var wrLv = Number((cauldronInfoData[0] || [])[_wr.index]) || 0;
      var opassz = 1;
      if (isWarrior && wrLv > 0) {
        var wrRaw = formulaEval(_wr.formula, _wr.x1, _wr.x2, wrLv);
        var isWrPrisma = isBubblePrismad(_wr.cauldron, _wr.index);
        var wrPrisma = isWrPrisma ? Math.max(1, getPrismaBonusMult()) : 1;
        opassz = wrRaw * wrPrisma;
      }
      var isPrisma = isBubblePrismad(_shim.cauldron, _shim.index);
      var prismaMult = isPrisma ? Math.max(1, getPrismaBonusMult()) : 1;
      inputs.alchBubblesGFoodz = baseVal * Math.max(1, opassz) * prismaMult;
    }
    var _bLv = Number((cauldronInfoData[0] || [])[_shim.index]) || 0;
    var _classId = charClassData[charIdx] || 0;
    var _isW = _classId > 6 && _classId < 18;
    T.alchBubblesGFoodz = node(label('Bubble', 'O18'), inputs.alchBubblesGFoodz, _bLv > 0 ? [
      node('Bubble Lv', _bLv, null, { fmt: 'raw' }),
      node('Base decay', formulaEval(_shim.formula, _shim.x1, _shim.x2, _bLv), null, { fmt: 'raw', note: 'decay(80,40,' + _bLv + ')' }),
    ].concat(_isW ? (function() {
      var _wrLv = Number((cauldronInfoData[0] || [])[_wr.index]) || 0;
      var _wrRaw = formulaEval(_wr.formula, _wr.x1, _wr.x2, _wrLv);
      var _wrPrisma = isBubblePrismad(_wr.cauldron, _wr.index);
      var _wrPrismaMult = _wrPrisma ? Math.max(1, getPrismaBonusMult()) : 1;
      var _opassz = _wrRaw * _wrPrismaMult;
      var _opCh = [node('WR Raw', _wrRaw, null, { fmt: 'raw', note: 'decayMulti(2,50,' + _wrLv + ')' })];
      if (_wrPrisma) _opCh.push(node('WR Prisma ×', _wrPrismaMult, null, { fmt: 'x' }));
      return [node('Opassz ×', Math.max(1, _opassz), _opCh, { fmt: 'x', note: 'Warrior class ' + _classId })];
    })() : []).concat(isBubblePrismad(_shim.cauldron, _shim.index) ? [
      node('Prisma ×', Math.max(1, getPrismaBonusMult()), null, { fmt: 'x', note: 'Super bubble' }),
    ] : []) : null, { fmt: 'raw' });
  }

  // === starSigns69 ===
  if (dc && dc.starSigns69 != null) {
    inputs.starSigns69 = dc.starSigns69;
    T.starSigns69 = node(label('Star Sign', 69), dc.starSigns69, null, { fmt: 'raw', note: 'DNSM cached' });
  } else {
    var _ss69 = starSignDropVal(69);
    var seraphMul = computeSeraphMulti(charIdx);
    var val = _ss69 * seraphMul;
    inputs.starSigns69 = val;
    T.starSigns69 = node(label('Star Sign', 69), val, seraphMul > 1 ? [
      node('Base', _ss69, null, { fmt: 'raw' }),
      node('Seraph Multi', seraphMul, null, { fmt: 'x' }),
    ] : null, { fmt: 'raw' });
  }

  // === mealBonusZGoldFood ===
  if (dc && dc.mealBonusZGoldFood != null) {
    inputs.mealBonusZGoldFood = dc.mealBonusZGoldFood;
    T.mealBonusZGoldFood = node(label('Meal', 64), dc.mealBonusZGoldFood, null, { fmt: 'raw', note: 'DNSM cached' });
  } else {
    var mealLv = Number((saveData.mealsData && saveData.mealsData[0] || [])[64]) || 0;
    if (mealLv > 0) {
      var mfb116 = mainframeBonus(116);
      var shinyS20 = computeShinyBonusS(20);
      var winBon26 = computeWinBonus(26);
      var cookMulti = (1 + (mfb116 + shinyS20) / 100) * (1 + winBon26 / 100);
      var ribbonIdx = 28 + 64;
      var ribbon = ribbonBonusAt(ribbonIdx, saveData.ribbonData, optionsListData[379], saveData.weeklyBossData);
      inputs.mealBonusZGoldFood = cookMulti * ribbon * mealLv * 2;

      var cookCh = [];
      if (mfb116 > 0) cookCh.push(node(label('Mainframe', 116), mfb116, null, { fmt: 'raw' }));
      if (shinyS20 > 0) cookCh.push(node('Shiny S20', shinyS20, null, { fmt: 'raw' }));
      if (winBon26 > 0) cookCh.push(node(label('WinBonus', 26, ' \u00d7'), 1 + winBon26 / 100, null, { fmt: 'x' }));
      T.mealBonusZGoldFood = node(label('Meal', 64), inputs.mealBonusZGoldFood, [
        node('Meal Lv', mealLv, null, { fmt: 'raw' }),
        node('Per Lv', 2, null, { fmt: 'raw' }),
        node('Ribbon ×', ribbon, null, { fmt: 'x' }),
        node('Cook Multi ×', cookMulti, cookCh.length ? cookCh : null, { fmt: 'x' }),
      ], { fmt: 'raw' });
    } else {
      T.mealBonusZGoldFood = node(label('Meal', 64), 0, null, { fmt: 'raw' });
    }
  }

  // === famBonusQTYs66 ===
  if (dc && dc.famBonusQTYs66 != null) {
    inputs.famBonusQTYs66 = dc.famBonusQTYs66;
    T.famBonusQTYs66 = node(label('Family', 66), dc.famBonusQTYs66, null, { fmt: 'raw', note: 'DNSM cached' });
  } else {
    var maxBonus = 0, bestCi = -1, bestLv = 0, bestEff = 0;
    var talent144Val = 0;
    {
      var sl144 = skillLvData[charIdx] || {};
      var rawLv144 = Number(sl144[144] || sl144['144']) || 0;
      if (rawLv144 > 0) {
        // Game iterates FamBonusQTYs per-character (not per-bonus-index).
        // Key 68 is set by chars whose CLASS_TREES includes 34.
        // If ALL such chars have index >= charIdx, FamBonusQTYs[68] is still 0
        // when the active char's key 66 is computed. Otherwise it's already set.
        var _fb68AlreadySet = false;
        for (var _ci = 0; _ci < charIdx; _ci++) {
          var _cls = charClassData[_ci] || 0;
          var _tree = CLASS_TREES[_cls];
          if (_tree && _tree.includes(34)) { _fb68AlreadySet = true; break; }
        }
        var bonus144Lv = computeAllTalentLVz(144, charIdx, { skipFamBonus68: !_fb68AlreadySet });
        var eff144 = rawLv144 + bonus144Lv;
        talent144Val = formulaEval(TALENT_144.formula, TALENT_144.x1, TALENT_144.x2, eff144);
      }
    }
    for (var ci = 0; ci < numCharacters; ci++) {
      var classId = charClassData[ci] || 0;
      var tree = CLASS_TREES[classId];
      if (!tree || !tree.includes(33)) continue;
      var charLevel = Number((saveData.lv0AllData[ci] || [])[0]) || 0;
      var effectiveLv = Math.max(0, charLevel - FAMILY_BONUS_33.lvOffset);
      var bonus = formulaEval(
        FAMILY_BONUS_33.formula, FAMILY_BONUS_33.x1, FAMILY_BONUS_33.x2, effectiveLv
      );
      if (bonus > maxBonus) {
        maxBonus = bonus;
        bestCi = ci; bestLv = charLevel; bestEff = effectiveLv;
        if (ci === charIdx && talent144Val > 0) {
          maxBonus = bonus * (1 + talent144Val / 100);
        }
      }
    }
    inputs.famBonusQTYs66 = maxBonus;
    var famChildren = maxBonus > 0 ? [
      node('Best Char', bestCi, null, { fmt: 'raw' }),
      node('Char Level', bestLv, null, { fmt: 'raw' }),
      node('Effective Lv', bestEff, null, { fmt: 'raw', note: 'lv - ' + FAMILY_BONUS_33.lvOffset }),
    ] : null;
    if (talent144Val > 0 && famChildren) {
      famChildren.push(node(label('Talent', 144, ' ×'), 1 + talent144Val / 100, [
        node('Talent Value', talent144Val, null, { fmt: 'raw' }),
      ], { fmt: 'x' }));
    }
    T.famBonusQTYs66 = node(label('Family', 66), maxBonus, famChildren, { fmt: 'raw' });
  }

  // === etcBonuses8 ===
  {
    var STAT = '%_GOLD_FOOD_EFFECT';
    var total = 0;
    var etcChildren = [];

    var sp = saveData.spelunkData || [];
    var galleryOn = (sp[16] && sp[16].length > 0) || (sp[17] && sp[17].length > 0);
    var premhatOn = sp[46] && sp[46].length > 0;

    var chipSlots = labData && labData[1 + charIdx];
    var hasPendChip = false, hasKey1Chip = false, hasTrophChip = false;
    if (chipSlots) {
      for (var ci = 0; ci < 7; ci++) {
        var cid = Number(chipSlots[ci]);
        if (cid === 18) hasPendChip = true;
        else if (cid === 17) hasKey1Chip = true;
        else if (cid === 16) hasTrophChip = true;
      }
    }

    var gridBonus172 = gbWith(saveData.gridLevels, saveData.shapeOverlay, 172, { abm: saveData.allBonusMulti || 1 });

    for (var row = 0; row < 2; row++) {
      var gear = (equipOrderData[charIdx] && equipOrderData[charIdx][row]) || {};
      var emmGear = (emmData[charIdx] && emmData[charIdx][row]) || {};
      var maxSlot = row === 0 ? 15 : 7;
      for (var slot = 0; slot <= maxSlot; slot++) {
        if (row === 0 && galleryOn && (slot === 10 || slot === 14)) continue;
        if (row === 0 && premhatOn && slot === 8) continue;
        var itemName = gear[slot] || 'Blank';
        if (itemName === 'Blank') continue;
        var emmSlot = emmGear[slot] || {};
        var itemDef = itemUqMatch(itemName, [STAT]);
        for (var uqi = 1; uqi <= 2; uqi++) {
          var uqTxtKey = 'UQ' + uqi + 'txt';
          var uqValKey = 'UQ' + uqi + 'val';
          var statName = null, val = 0;
          if (itemDef && itemDef.uq === uqi) {
            statName = STAT;
            val = itemDef.val + (Number(emmSlot[uqValKey]) || 0);
          }
          if (!statName && emmSlot[uqTxtKey] === STAT && (Number(emmSlot[uqValKey]) || 0) > 0) {
            statName = STAT;
            val = Number(emmSlot[uqValKey]) || 0;
          }
          if (statName !== STAT) continue;
          if (row === 0 && slot === 3 && hasPendChip) val *= 2;
          else if (row === 0 && slot === 9 && hasKey1Chip) val *= 2;
          else if (row === 0 && slot === 10 && hasTrophChip) val *= 2;
          else if (row === 0 && slot === 15 && gridBonus172 >= 1) val *= (1 + gridBonus172 / 100);
          total += val;
          etcChildren.push(node('R' + row + 'S' + slot + ' ' + itemName, val, null, { fmt: 'raw' }));
        }
      }
    }

    var obolData = saveData.obolData || [];
    for (var oi = 0; oi < obolData.length; oi++) {
      var ob = obolData[oi];
      if (!ob) continue;
      if (ob.stat === STAT && ob.val > 0) {
        total += ob.val;
        etcChildren.push(node('Obol ' + oi, ob.val, null, { fmt: 'raw' }));
      }
    }
    var galTrophy = saveData.galleryTrophyBon || {};
    if (galTrophy[STAT]) { total += galTrophy[STAT]; etcChildren.push(node('Trophy GF', galTrophy[STAT], null, { fmt: 'raw' })); }
    var galNametag = saveData.galleryNametagBon || {};
    if (galNametag[STAT]) { total += galNametag[STAT]; etcChildren.push(node('Nametag GF', galNametag[STAT], null, { fmt: 'raw' })); }
    var galPremhat = saveData.premHatBon || {};
    if (galPremhat[STAT]) { total += galPremhat[STAT]; etcChildren.push(node('Premhat GF', galPremhat[STAT], null, { fmt: 'raw' })); }

    inputs.etcBonuses8 = total;
    T.etcBonuses8 = node('GFood Equip UQ', total, etcChildren.length ? etcChildren : null, { fmt: 'raw' });
  }

  return inputs;
}

export var goldenFood = {
  resolve: function(id, ctx) {
    // Prefer gfood-multi descriptor for cached multi + breakdown
    var gfm = ctx.resolve ? ctx.resolve('gfood-multi') : null;
    var multi = gfm ? gfm.val : undefined;
    var result = goldFoodBonuses(id, ctx.charIdx, multi);
    var total = result ? result.total : 0;
    if (total <= 0) return node('Golden Food: ' + id, 0);

    var children = [];

    // GFoodBonusMULTI breakdown — from descriptor or fallback
    if (gfm) {
      children.push(node('GFood Multi', gfm.val, gfm.children, { fmt: 'x' }));
    } else {
      var bd = gfoodBonusMULTIBreakdown(ctx.charIdx);
      var multiChildren = [];
      for (var i = 0; i < bd.items.length; i++) {
        var it = bd.items[i];
        if (it.val > 0) {
          if (it.tree) {
            multiChildren.push(it.tree);
          } else {
            multiChildren.push(node(it.name, it.val, null, { fmt: 'raw' }));
          }
        }
      }
      if (bd.setMul !== 1) multiChildren.push(node('Secret Set \u00d7', bd.setMul, null, { fmt: 'x' }));
      children.push(node('GFood Multi', bd.result, multiChildren.length ? multiChildren : null, { fmt: 'x' }));
    }

    // Equipped food
    if (result.equipped) {
      var e = result.equipped;
      children.push(node('Equipped: ' + e.item, e.val, [
        node('Base Amount', e.amount, null, { fmt: 'raw' }),
        node('Quantity', e.qty, null, { fmt: 'raw' }),
        node('Log Factor', e.lg, null, { fmt: 'raw' }),
      ], { fmt: 'raw' }));
    }
    // Emporium food
    if (result.emporium) {
      var em = result.emporium;
      children.push(node('Emporium: ' + em.item, em.val, [
        node('Base Amount', em.amount, null, { fmt: 'raw' }),
        node('Emporium Lv', em.empLevel, null, { fmt: 'raw' }),
        node('Eff Qty', em.effQty, null, { fmt: 'raw' }),
      ], { fmt: 'raw' }));
    }

    return node('Golden Food: ' + id, total, children, { fmt: '+' });
  },
};
