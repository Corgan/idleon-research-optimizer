// ===== FARMING SYSTEM (W6) =====
// Farm rank upgrades, crop SC bonuses, exotic bonuses.

import { node } from '../../node.js';
import { label } from '../../entity-names.js';
import { saveData } from '../../../state.js';
import { optionsListData } from '../../../save/data.js';
import { mainframeBonus } from '../w4/lab.js';
import { vaultUpgBonus } from '../common/goldenFood.js';
import { emporiumBonus } from '../../../game-helpers.js';
import { grimoireUpgBonus22 } from '../mc/grimoire.js';
import { exoticParams } from '../../data/w5/farming.js';
import { ninjaInfo } from '../../data/w5/farming.js';

export function exoticBonusQTY40() {
  var lv = (saveData.farmUpgData && saveData.farmUpgData[60]) || 0;
  if (lv <= 0) return 0;
  return 20 * lv / (1000 + lv);
}

// Talent helpers (for getbonus2)
import { skillLvData, numCharacters } from '../../../save/data.js';
import { formulaEval } from '../../../formulas.js';
import { computeAllTalentLVz } from '../common/talent.js';
import { talentParams } from '../../data/common/talent.js';

function getbonus2Detail(talentIdx, data, activeCharIdx) {
  var best = 0, bestCi = -1, bestBase = 0, bestBonus = 0, bestEff = 0;
  for (var ci = 0; ci < numCharacters; ci++) {
    var sl = skillLvData[ci] || {};
    var rawLv = Number(sl[talentIdx] || sl[String(talentIdx)]) || 0;
    if (rawLv <= 0) continue;
    // Game: AllTalentLVz always uses active character's context, not per-char.
    // Game passes rawLv (not talentIdx) to AllTalentLVz — this affects the
    // Spelunk super talent lookup, which checks indexOf(rawLv) in Spelunk array.
    var bonusChar = activeCharIdx != null ? activeCharIdx : ci;
    var bonus = computeAllTalentLVz(rawLv, bonusChar);
    var effLv = rawLv + bonus;
    var val = formulaEval(data.formula, data.x1, data.x2, effLv);
    if (val > best) { best = val; bestCi = ci; bestBase = rawLv; bestBonus = bonus; bestEff = effLv; }
  }
  return { val: best, ci: bestCi, baseLv: bestBase, bonusLv: bestBonus, effLv: bestEff };
}

var TAL207 = talentParams(207);

export var farm = {
  resolve: function(id, ctx) {
    var saveData = ctx.saveData;

    if (id === 'rank9' || id === 'rank19') {
      var rankIdx = id === 'rank9' ? 9 : 19;
      var ninjaVal = ninjaInfo(36)[rankIdx] || 0;
      var rankLv = Number((saveData.farmRankData && saveData.farmRankData['2'] && saveData.farmRankData['2'][rankIdx]) || 0);
      var d207 = getbonus2Detail(207, TAL207, ctx.charIdx);
      var tal207 = d207.val;
      var exotic14Lv = Number((saveData.farmUpgData && saveData.farmUpgData[34]) || 0);
      var exotic14 = exotic14Lv > 0 ? 60 * exotic14Lv / (1000 + exotic14Lv) : 0;
      if (ninjaVal <= 0 || rankLv <= 0) return node(label('Farming', id), 0, null, { note: 'farm ' + id });
      var val = Math.max(1, tal207) * (1 + exotic14 / 100) * ninjaVal * rankLv;
      var talChildren = tal207 > 0 ? [
        node('Best Character', d207.ci, null, { fmt: 'raw' }),
        node('Base Level', d207.baseLv, null, { fmt: 'raw' }),
        node('Bonus Level', d207.bonusLv, null, { fmt: '+' }),
        node('Effective Level', d207.effLv, null, { fmt: 'raw' }),
      ] : null;
      return node(label('Farming', id), val, [
        node('Rank Level', rankLv, null, { fmt: 'raw' }),
        node('Ninja Base', ninjaVal, null, { fmt: 'raw' }),
        node(label('Talent', 207, ' Bonus'), Math.max(1, tal207), talChildren, { fmt: 'x', note: 'decayMulti(2,200,' + d207.effLv + ')' }),
        node(label('Exotic', 14, ' Bonus'), 1 + exotic14 / 100, null, { fmt: 'x', note: 'Level ' + exotic14Lv }),
      ], { fmt: '+', note: 'farm ' + id });
    }

    if (id === 'cropSC7') {
      var empUnlocked = emporiumBonus(38, saveData.ninjaData && saveData.ninjaData[102] && saveData.ninjaData[102][9]);
      if (!empUnlocked) return node(label('Farming', 'cropSC7'), 0, [node('Emporium not unlocked', 0, null, { fmt: 'raw' })], { note: 'farm cropSC7' });
      var cropCount = saveData.farmCropCount || 0;
      var excess = Math.max(0, cropCount - 100);
      var mf17 = mainframeBonus(17);
      var grim22 = grimoireUpgBonus22();
      var exotic40Lv = Number((saveData.farmUpgData && saveData.farmUpgData[60]) || 0);
      var exotic40 = exotic40Lv > 0 ? 20 * exotic40Lv / (1000 + exotic40Lv) : 0;
      var vault79 = vaultUpgBonus(79);
      var multi = (1 + mf17 / 100) * (1 + (grim22 + exotic40 + vault79) / 100);
      if (excess <= 0) return node(label('Farming', 'cropSC7'), 0, null, { note: 'farm cropSC7' });
      var val = excess * multi;
      return node(label('Farming', 'cropSC7'), val, [
        node('Crop Count', cropCount, null, { fmt: 'raw' }),
        node('Excess', excess, null, { fmt: 'raw', note: 'crops - 100' }),
        node('Multi', multi, [
          node(label('Mainframe', 17), mf17, null, { fmt: 'raw' }),
          node(label('Grimoire', 22), grim22, null, { fmt: 'raw' }),
          node(label('Exotic', 40), exotic40, null, { fmt: 'raw', note: 'Level ' + exotic40Lv }),
          node(label('Vault', 79), vault79, null, { fmt: 'raw' }),
        ], { fmt: 'x' }),
      ], { fmt: '+', note: 'farm cropSC7' });
    }

    if (id === 'exotic59') {
      var lv = Number((saveData.farmUpgData && saveData.farmUpgData[79]) || 0);
      if (lv <= 0) return node(label('Exotic', 59), 0, null, { note: 'farm exotic59' });
      var val = 25 * lv / (1000 + lv);
      return node(label('Exotic', 59), val, [
        node('Level', lv, null, { fmt: 'raw' }),
        node('Formula Result', val, null, { fmt: 'raw', note: '25 × lv / (1000 + lv)' }),
      ], { fmt: '+', note: 'farm exotic59' });
    }

    return node('Farm ' + id, 0, null, { note: 'farm ' + id });
  },
};

// ==================== CROP SC ====================

export function computeCropSC(idx) {
  var s = saveData;
  var ninjaData102_9 = s.ninjaData && s.ninjaData[102] && s.ninjaData[102][9];
  var emp23 = emporiumBonus(23, ninjaData102_9);
  if (!emp23) return 0;
  var cropCount = s.farmCropCount || 0;
  var mf17 = _safe(mainframeBonus, 17);
  var gub22 = _safe(grimoireUpgBonus22);
  var exo40 = _safe(exoticBonusQTY40);
  var vub79 = _safe(vaultUpgBonus, 79);
  var multi = (1 + mf17 / 100) * (1 + (gub22 + exo40 + vub79) / 100);
  var baseMap = { 4: 15, 8: 10 };
  var baseVal = baseMap[idx] || 10;
  return baseVal * cropCount * multi;
}

function _safe(fn) {
  try {
    var args = [];
    for (var i = 1; i < arguments.length; i++) args.push(arguments[i]);
    var v = fn.apply(null, args);
    return (v !== v || v == null) ? 0 : v;
  } catch(e) { return 0; }
}

// ==================== STICKER BONUS ====================

export function computeStickerBonus(stickerIdx) {
  var s = saveData;
  var stickers = s.stickerData;
  if (!stickers) return 0;
  var count = 0;
  for (var i = 0; i < stickers.length; i++) {
    if (Number(stickers[i]) === stickerIdx) count++;
  }
  return count;
}

// ==================== EXOTIC BONUS (GENERIC) ====================

export function computeExoticBonus(idx) {
  var s = saveData;
  var ex = exoticParams(idx);
  if (!ex) return 0;
  var lv = Number(s.farmUpgData && s.farmUpgData[ex.farmSlot]) || 0;
  if (lv <= 0) return 0;
  return ex.base * lv / (ex.denom + lv);
}
