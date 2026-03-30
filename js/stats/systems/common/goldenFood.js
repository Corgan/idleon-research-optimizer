// ===== GOLDEN FOOD SYSTEM =====
// All golden food helper functions and the GfoodBonusMULTI formula.

import { node } from '../../node.js';
import { S } from '../../../state.js';
import { equipOrderData, equipQtyData, optionsListData } from '../../../save/data.js';
import { getLOG } from '../../../save/engine.js';
import {
  BRIBE_VALUES, ACHIEVE_SPECIAL_5, ACHIEVE_SPECIAL_20,
  VAULT_UPG_PER_LV, VAULT_UPG_SIMPLE,
  SIGIL_BONUS, PRISTINE_CHARM_BONUS, VOTING_BONUS_VALUES,
  GOLD_FOOD_INFO, EMPORIUM_FOOD_SLOTS,
} from '../../../game-data.js';
import { legendPTSbonus } from '../w7/spelunking.js';
import { computeCardLv } from './cards.js';

// AchieveStatus (FULL version: returns 1/5/10/20)
export function achieveStatus(idx) {
  if (S.achieveRegData[idx] !== -1) return 0;
  if (ACHIEVE_SPECIAL_5.has(idx)) return 5;
  if (idx === 108) return 10;
  if (ACHIEVE_SPECIAL_20.has(idx)) return 20;
  return 1;
}

export function getBribeBonus(idx) {
  var i = typeof idx === 'string' ? parseInt(idx) : Math.round(idx);
  if ((S.bribeStatusData[i] || 0) !== 1) return 0;
  return BRIBE_VALUES[i] || 0;
}

export function pristineBon(idx) {
  if ((S.ninjaData[107] || [])[idx] !== 1) return 0;
  return PRISTINE_CHARM_BONUS[idx] || 0;
}

export function sigilBonus(dnsm, sigilIdx) {
  var level = Number((S.cauldronP2WData[4] || [])[1 + 2 * sigilIdx]) || 0;
  if (level < -0.1) return 0;
  var tiers = SIGIL_BONUS[sigilIdx];
  if (!tiers) return 0;
  var base;
  if (level < 0.5) base = tiers[0];
  else if (level < 1.5) base = tiers[1];
  else if (level < 2.5) base = tiers[2];
  else if (level < 3.5) base = tiers[3];
  else base = tiers[4] || tiers[3];
  var artifactMulti = 1 + (dnsm.artifactBonus16 || 0);
  var meritocMulti = 1 + (dnsm.meritocBonusz21 || 0) / 100;
  return base * artifactMulti * meritocMulti;
}

export function vaultUpgBonus(idx) {
  var level = Number(S.vaultData[idx]) || 0;
  if (level <= 0) return 0;
  var perLv = VAULT_UPG_PER_LV[idx];
  if (perLv == null) return 0;
  return level * perLv;
}

export function grimoireUpgBonus(idx, grimoireGameData) {
  var level = Number(S.grimoireData[idx]) || 0;
  if (level <= 0) return 0;
  var perLv = (grimoireGameData && grimoireGameData[idx] && grimoireGameData[idx][5]) || 0;
  var noMultiSet = new Set([9, 11, 17, 26, 32, 36, 39, 45]);
  if (noMultiSet.has(idx)) return level * perLv;
  var multi36 = grimoireUpgBonus(36, grimoireGameData);
  return level * perLv * (1 + multi36 / 100);
}

export function votingBonusz(dnsm, voteIdx) {
  var base = VOTING_BONUS_VALUES[voteIdx] || 0;
  if (base === 0) return 0;
  // Voting bonuses only apply when the vote is the current server-wide winner
  if (S.activeVoteIdx !== voteIdx) return 0;
  var multi = dnsm.votingBonuszMulti || 1;
  var unlocked = dnsm.votingUnlocked ? (dnsm.votingUnlocked[voteIdx] != null ? dnsm.votingUnlocked[voteIdx] : true) : true;
  return unlocked ? base * multi : 0;
}

export function companions(dnsm, idx) {
  if (!S.companionIds.has(idx)) return 0;
  return (dnsm.companionBon && dnsm.companionBon[idx]) || 0;
}

export function cardLv(cardId) {
  return computeCardLv(cardId);
}

export function getSetBonus(dnsm, setName) {
  var perma = String(optionsListData[379] || '');
  if (perma.includes(setName)) {
    return (dnsm.equipSetBonusValues && dnsm.equipSetBonusValues[setName]) || 0;
  }
  return 0;
}

export function gfoodBonusMULTI(dnsm) {
  var setMul = 1 + getSetBonus(dnsm, 'SECRET_SET') / 100;
  var famBonus = Math.max(dnsm.famBonusQTYs66 || 0, 1);
  var rest =
    (dnsm.etcBonuses8 || 0) +
    (dnsm.getTalentNumber1_99 || 0) +
    (dnsm.stampBonusGFood || 0) +
    achieveStatus(37) +
    (dnsm.alchBubblesGFoodz || 0) +
    sigilBonus(dnsm, 14) +
    (dnsm.mealBonusZGoldFood || 0) +
    (dnsm.starSigns69 || 0) +
    getBribeBonus(36) +
    pristineBon(14) +
    2 * achieveStatus(380) +
    3 * achieveStatus(383) +
    votingBonusz(dnsm, 26) +
    (dnsm.getbonus2_1_209 || 0) * (dnsm.calcTalentMAP209 || 0) +
    companions(dnsm, 48) +
    legendPTSbonus(25) +
    Math.min(4 * cardLv('cropfallEvent1'), 50) +
    companions(dnsm, 155) +
    vaultUpgBonus(86);
  return setMul * (famBonus + rest / 100);
}

export function goldFoodBonuses(dnsm, effectType, charIdx) {
  var multi = gfoodBonusMULTI(dnsm);
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
  var empUnlocked = dnsm.emporiumBonusUnlocked != null ? dnsm.emporiumBonusUnlocked : true;
  if (empUnlocked) {
    for (var i = 0; i < EMPORIUM_FOOD_SLOTS.length; i++) {
      var itemName = EMPORIUM_FOOD_SLOTS[i];
      var info = GOLD_FOOD_INFO[itemName];
      if (!info || info.effect !== effectType) continue;
      var empLevel = Number((S.ninjaData[104] || [])[i]) || 0;
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

export function gfoodBonusMULTIBreakdown(dnsm) {
  var T = dnsm._trees || {};
  var sigilVal = sigilBonus(dnsm, 14);
  var sigilLv = Number((S.cauldronP2WData[4] || [])[1 + 2 * 14]) || 0;
  var votingVal = votingBonusz(dnsm, 26);
  var legendVal = legendPTSbonus(25);
  var cardVal = Math.min(4 * cardLv('cropfallEvent1'), 50);
  var vaultVal = vaultUpgBonus(86);
  var vaultLv = Number(S.vaultData[86]) || 0;
  var brb36 = getBribeBonus(36);
  var prist14 = pristineBon(14);
  var ach37 = achieveStatus(37);
  var ach380 = achieveStatus(380);
  var ach383 = achieveStatus(383);
  var comp48 = companions(dnsm, 48);
  var comp155 = companions(dnsm, 155);
  var tal209xMap = (dnsm.getbonus2_1_209 || 0) * (dnsm.calcTalentMAP209 || 0);

  var items = [
    { name: 'Family 66',            val: Math.max(dnsm.famBonusQTYs66 || 0, 1), tree: T.famBonusQTYs66 },
    { name: 'GFood Equip UQ',       val: dnsm.etcBonuses8 || 0, tree: T.etcBonuses8 },
    { name: 'Talent 99',            val: dnsm.getTalentNumber1_99 || 0, tree: T.getTalentNumber1_99 },
    { name: 'GFood Stamp',          val: dnsm.stampBonusGFood || 0, tree: T.stampBonusGFood },
    { name: 'Achievement 37',       val: ach37 },
    { name: 'Shimmeron Bubble',     val: dnsm.alchBubblesGFoodz || 0, tree: T.alchBubblesGFoodz },
    { name: 'Sigil 14',             val: sigilVal, tree: sigilLv > 0 ? node('Sigil 14', sigilVal, [
      node('Sigil Lv', sigilLv, null, { fmt: 'raw' }),
      node('Artifact 16 ×', 1 + (dnsm.artifactBonus16 || 0), T.artifactBonus16 ? [T.artifactBonus16] : null, { fmt: 'x' }),
      node('Meritoc 21 ×', 1 + (dnsm.meritocBonusz21 || 0) / 100, null, { fmt: 'x' }),
    ], { fmt: 'raw' }) : null },
    { name: 'Meal (Peachring)',     val: dnsm.mealBonusZGoldFood || 0, tree: T.mealBonusZGoldFood },
    { name: 'Star Sign 69',         val: dnsm.starSigns69 || 0, tree: T.starSigns69 },
    { name: 'Bribe 36',             val: brb36 },
    { name: 'Pristine 14',          val: prist14 },
    { name: '2×Achievement 380',    val: 2 * ach380 },
    { name: '3×Achievement 383',    val: 3 * ach383 },
    { name: 'Voting 26',            val: votingVal, tree: votingVal > 0 ? node('Voting 26', votingVal, [
      node('Base', VOTING_BONUS_VALUES[26] || 0, null, { fmt: 'raw' }),
      node('Voting Multi ×', dnsm.votingBonuszMulti || 1, T.votingBonuszMulti ? T.votingBonuszMulti.children : null, { fmt: 'x' }),
    ], { fmt: 'raw' }) : null },
    { name: 'Talent 209 × Maps',    val: tal209xMap, tree: tal209xMap > 0 ? node('Tal209 × Maps', tal209xMap, [
      T.getbonus2_1_209 || node('Talent 209', dnsm.getbonus2_1_209 || 0),
      T.calcTalentMAP209 || node('1B+ Maps', dnsm.calcTalentMAP209 || 0),
    ], { fmt: 'raw' }) : null },
    { name: 'Companion 48',         val: comp48, tree: comp48 > 0 ? node('Comp 48 (mushP)', comp48) : null },
    { name: 'Legend 25',             val: legendVal },
    { name: 'Card cropfall ×4',     val: cardVal, tree: cardVal > 0 ? node('Card cropfall', cardVal, [
      node('Card Lv', cardLv('cropfallEvent1'), null, { fmt: 'raw' }),
      node('× 4 (capped 50)', cardVal, null, { fmt: 'raw' }),
    ], { fmt: 'raw' }) : null },
    { name: 'Companion 155',        val: comp155, tree: comp155 > 0 ? node('Comp 155 (w4b4b)', comp155) : null },
    { name: 'Vault 86',             val: vaultVal, tree: vaultLv > 0 ? node('Vault 86', vaultVal, [
      node('Level', vaultLv, null, { fmt: 'raw' }),
    ], { fmt: 'raw' }) : null },
  ];
  var famBonus = items[0].val;
  var rest = items.reduce(function(acc, it, idx) { return idx === 0 ? acc : acc + it.val; }, 0);
  var setMul = 1 + getSetBonus(dnsm, 'SECRET_SET') / 100;
  return { items: items, sum: famBonus + rest, setMul: setMul, result: setMul * (famBonus + rest / 100) };
}

export var goldenFood = {
  resolve: function(id, ctx) {
    var result = goldFoodBonuses(ctx.dnsm, id, ctx.charIdx);
    var total = result ? result.total : 0;
    if (total <= 0) return node('Golden Food: ' + id, 0);

    var children = [];

    // GFoodBonusMULTI breakdown
    var bd = gfoodBonusMULTIBreakdown(ctx.dnsm);
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
    if (bd.setMul !== 1) multiChildren.push(node('Secret Set ×', bd.setMul, null, { fmt: 'x' }));
    children.push(node('GFood Multi', bd.result, multiChildren.length ? multiChildren : null, { fmt: 'x' }));

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
