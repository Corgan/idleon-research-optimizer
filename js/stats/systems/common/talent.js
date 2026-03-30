// ===== TALENT SYSTEM =====
// Reads talent level, adds AllTalentLVz bonus, applies formula.
// Also exports computeAllTalentLVz for use by other systems and the save layer.

import { node } from '../../node.js';
import { S } from '../../../state.js';
import {
  cauldronBubblesData,
  cauldronInfoData,
  charClassData,
  divinityData,
  dreamData,
  numCharacters,
  optionsListData,
  playerStuffData,
  skillLvData,
} from '../../../save/data.js';
import { formulaEval, getLOG } from '../../../save/engine.js';
import { GODS_TYPE } from '../../../game-data.js';
import { superBitType } from '../../../save/helpers.js';
import { hasBonusMajor } from '../w5/divinity.js';

export function computeAllTalentLVz(talentIdx, slotIdx) {
  // Replicates AllTalentLVz from the game. The argument is the TALENT INDEX.
  if ((talentIdx >= 49 && talentIdx <= 59) || talentIdx === 149 || talentIdx === 374
      || talentIdx === 539 || talentIdx === 505 || talentIdx > 614) return 0;

  // Spelunk super talent
  var spelunkBonus = 0;
  if (slotIdx >= 0) {
    var preset = Number(playerStuffData[slotIdx] && playerStuffData[slotIdx][1]) || 0;
    var superArr = S.spelunkData && S.spelunkData[20 + slotIdx + 12 * preset];
    if (Array.isArray(superArr) && superArr.indexOf(talentIdx) !== -1) {
      spelunkBonus = Math.round(50 + (Number(S.spelunkData[18] && S.spelunkData[18][7]) || 0) * 10 + (Number(S.spelunkData[45] && S.spelunkData[45][5]) || 0));
    }
  }

  // Talents 149/374/539: intervalAdd(1, 20, lv) — uses active character's own level.
  // Game calls GetTalentNumber(1, x) which reads the current char's SkillLevels.
  function intervalAddForChar(talId) {
    var sl = slotIdx >= 0 ? skillLvData[slotIdx] : null;
    var lv = Number(sl && (sl[talId] || sl[String(talId)])) || 0;
    return lv > 0 ? 1 + Math.floor(lv / 20) : 0;
  }
  var tal149 = intervalAddForChar(149);
  var tal374 = intervalAddForChar(374);
  var tal539 = intervalAddForChar(539);
  var achieve291 = S.achieveRegData[291] === -1 ? 1 : 0;

  // FamBonusQTYs[68]: ClassFamilyBonuses[34], decay(20, 350, max(0, round(charLv-69)))
  var maxMageCharLv = 0;
  for (var ci = 0; ci < numCharacters; ci++) {
    var cls = charClassData[ci];
    if (cls === 34 || cls === 35) {
      var lv = S.lv0AllData[ci] && S.lv0AllData[ci][0] || 0;
      if (lv > maxMageCharLv) maxMageCharLv = lv;
    }
  }
  var famN = Math.max(0, Math.round(maxMageCharLv - 69));
  var famBonus68 = famN > 0 ? 20 * famN / (famN + 350) : 0;

  // Companions(1): Rift Slug = +25 talent levels if owned
  var comp1 = S.companionIds.has(1) ? 25 : 0;

  // Divinity minor bonus 2 (Arctis)
  var y2BubbleLv = Number(cauldronInfoData && cauldronInfoData[3] && cauldronInfoData[3][21]) || 0;
  var y2Value = y2BubbleLv > 0 ? 1 + 0.5 * y2BubbleLv / (y2BubbleLv + 60) : 0;
  var allBubblesActive = S.companionIds.has(4);
  var divMinor = 0;
  var coralKid3 = Number(optionsListData && optionsListData[430]) || 0;
  for (var ci2 = 0; ci2 < numCharacters; ci2++) {
    if (!hasBonusMajor(ci2, 2)) continue;
    var divLv = S.lv0AllData[ci2] && S.lv0AllData[ci2][14] || 0;
    if (divLv <= 0) continue;
    var y2Active = (allBubblesActive || (cauldronBubblesData && cauldronBubblesData[ci2] || []).includes('d21')) ? y2Value : 0;
    var val = Math.max(1, y2Active) * (1 + coralKid3 / 100) * divLv / (60 + divLv) * 15;
    if (val > divMinor) divMinor = val;
  }

  var dream12 = Number(dreamData && dreamData[12]) || 0;
  var ola232 = Number(optionsListData && optionsListData[232]) || 0;
  var ola232bonus = 5 * Math.floor((97 + ola232) / 100);
  var grimoire39 = Number(S.grimoireData && S.grimoireData[39]) || 0;
  var kattlekrukSet = String(optionsListData && optionsListData[379] || '').split(',').includes('KATTLEKRUK_SET') ? 5 : 0;
  var arcane57 = Math.min(5, Number(S.arcaneData && S.arcaneData[57]) || 0);

  var currentPlayerLv = (slotIdx >= 0 ? S.lv0AllData[slotIdx] && S.lv0AllData[slotIdx][0] : 0) || 0;
  var superBit47 = superBitType(47, S.gamingData[12]);
  var lvBonusTerm = superBit47 ? Math.max(0, Math.floor((currentPlayerLv - 500) / 100)) : 0;

  return Math.floor(
    spelunkBonus + tal149 + tal374 + tal539 + achieve291
    + Math.floor(famBonus68)
    + comp1
    + Math.ceil(divMinor)
    + dream12
    + ola232bonus
    + grimoire39
    + kattlekrukSet
    + arcane57
    + lvBonusTerm
  );
}

// Combined talent data — merge all stat-specific tables here
// { talentIdx: { x1, x2, formula, name } }
var TALENT_DATA = {
  // DR talents
  24:  { x1: 70, x2: 100, formula: 'decay', name: 'Curse of Mr Looty Booty' },
  207: { x1: 2, x2: 200, formula: 'decayMulti', name: 'Dank Ranks' },
  279: { x1: 40, x2: 65, formula: 'decay', name: 'Robbinghood' },
  328: { x1: 6, x2: 150, formula: 'decay', name: 'Archlord of the Pirates' },
  655: { x1: 25, x2: 100, formula: 'decay', name: 'Boss Battle Spillover' },
  // LUK talents
  13:  { x1: 1, x2: 0, formula: 'add', name: 'Lucky Clover' },
  21:  { x1: 220, x2: 250, formula: 'decay', name: "F'luk'ey Fabrics" },
  23:  { x1: 1, x2: 0, formula: 'add', name: 'Lucky Horseshoe' },
  54:  { x1: 2, x2: 0, formula: 'add', name: 'Eternal LUK' },
  652: { x1: 1, x2: 0, formula: 'add', name: 'Stat Overload' },
};

// Returns { total, children } for AllTalentLVz bonus breakdown
function resolveAllTalentLVz(talentIdx, slotIdx) {
  if ((talentIdx >= 49 && talentIdx <= 59) || talentIdx === 149 || talentIdx === 374
      || talentIdx === 539 || talentIdx === 505 || talentIdx > 614)
    return { total: 0, children: [] };

  var children = [];

  // Spelunk super talent
  var spelunkBonus = 0;
  if (slotIdx >= 0) {
    var preset = Number(playerStuffData[slotIdx] && playerStuffData[slotIdx][1]) || 0;
    var superArr = S.spelunkData && S.spelunkData[20 + slotIdx + 12 * preset];
    if (Array.isArray(superArr) && superArr.indexOf(talentIdx) !== -1) {
      var baseSp = 50;
      var legend7 = (Number(S.spelunkData[18] && S.spelunkData[18][7]) || 0) * 10;
      var w7b5 = Number(S.spelunkData[45] && S.spelunkData[45][5]) || 0;
      spelunkBonus = Math.round(baseSp + legend7 + w7b5);
      children.push(node('Spelunk Super Talent', spelunkBonus, [
        node('Base', baseSp, null, { fmt: 'raw' }),
        node('Legend 7 Bonus', legend7, null, { fmt: 'raw', note: 'Spelunk[18][7] × 10' }),
        node('W7 Bonus 5', w7b5, null, { fmt: 'raw' }),
      ], { fmt: 'raw' }));
    }
  }

  // Talents 149/374/539: uses active character's own level.
  // Game calls GetTalentNumber(1, x) which reads the current char's SkillLevels.
  function intervalAddCharNode(talId, label) {
    var sl = slotIdx >= 0 ? skillLvData[slotIdx] : null;
    var lv = Number(sl && (sl[talId] || sl[String(talId)])) || 0;
    var val = lv > 0 ? 1 + Math.floor(lv / 20) : 0;
    if (val > 0) {
      children.push(node(label, val, [
        node('Char ' + slotIdx + ' Lv ' + lv, lv, null, { fmt: 'raw' }),
        node('1 + floor(' + lv + '/20)', val, null, { fmt: 'raw' }),
      ], { fmt: 'raw' }));
    }
    return val;
  }
  var tal149 = intervalAddCharNode(149, 'Talent 149');
  var tal374 = intervalAddCharNode(374, 'Talent 374');
  var tal539 = intervalAddCharNode(539, 'Talent 539');

  // Achievement 291
  var achieve291 = S.achieveRegData[291] === -1 ? 1 : 0;
  if (achieve291 > 0) children.push(node('Achievement 291', achieve291, null, { fmt: 'raw' }));

  // Family bonus 68 (mage chars)
  var maxMageCharLv = 0;
  for (var ci3 = 0; ci3 < numCharacters; ci3++) {
    var cls = charClassData[ci3];
    if (cls === 34 || cls === 35) {
      var lv3 = S.lv0AllData[ci3] && S.lv0AllData[ci3][0] || 0;
      if (lv3 > maxMageCharLv) maxMageCharLv = lv3;
    }
  }
  var famN2 = Math.max(0, Math.round(maxMageCharLv - 69));
  var famBonus682 = famN2 > 0 ? 20 * famN2 / (famN2 + 350) : 0;
  var famFloor = Math.floor(famBonus682);
  if (famFloor > 0) {
    children.push(node('Family Bonus 68 (Mage)', famFloor, [
      node('Best mage Lv', maxMageCharLv, null, { fmt: 'raw' }),
      node('N = max(0, ' + maxMageCharLv + ' - 69)', famN2, null, { fmt: 'raw' }),
    ], { fmt: 'raw' }));
  }

  // Companion 1 (Rift Slug)
  var comp1v = S.companionIds.has(1) ? 25 : 0;
  if (comp1v > 0) children.push(node('Companion: Rift Slug', comp1v, null, { fmt: 'raw' }));

  // Divinity minor 2 (Arctis)
  var y2BubbleLv2 = Number(cauldronInfoData && cauldronInfoData[3] && cauldronInfoData[3][21]) || 0;
  var y2Value2 = y2BubbleLv2 > 0 ? 1 + 0.5 * y2BubbleLv2 / (y2BubbleLv2 + 60) : 0;
  var allBubblesActive2 = S.companionIds.has(4);
  var divMinor2 = 0;
  var coralKid32 = Number(optionsListData && optionsListData[430]) || 0;
  for (var ci4 = 0; ci4 < numCharacters; ci4++) {
    if (!hasBonusMajor(ci4, 2)) continue;
    var divLv2 = S.lv0AllData[ci4] && S.lv0AllData[ci4][14] || 0;
    if (divLv2 <= 0) continue;
    var y2Active2 = (allBubblesActive2 || (cauldronBubblesData && cauldronBubblesData[ci4] || []).includes('d21')) ? y2Value2 : 0;
    var val2 = Math.max(1, y2Active2) * (1 + coralKid32 / 100) * divLv2 / (60 + divLv2) * 15;
    if (val2 > divMinor2) divMinor2 = val2;
  }
  var divCeil = Math.ceil(divMinor2);
  if (divCeil > 0) children.push(node('Divinity Minor 2 (Arctis)', divCeil, null, { fmt: 'raw' }));

  // Dream 12
  var dream12v = Number(dreamData && dreamData[12]) || 0;
  if (dream12v > 0) children.push(node('Equinox Dream 12', dream12v, null, { fmt: 'raw' }));

  // Ola 232
  var ola232v = Number(optionsListData && optionsListData[232]) || 0;
  var ola232bonus2 = 5 * Math.floor((97 + ola232v) / 100);
  if (ola232bonus2 > 0) children.push(node('Ola 232', ola232bonus2, null, { fmt: 'raw', note: 'raw=' + ola232v }));

  // Grimoire 39
  var grimoire39v = Number(S.grimoireData && S.grimoireData[39]) || 0;
  if (grimoire39v > 0) children.push(node('Grimoire 39', grimoire39v, null, { fmt: 'raw' }));

  // Kattlekruk set
  var kattlekrukSetV = String(optionsListData && optionsListData[379] || '').split(',').includes('KATTLEKRUK_SET') ? 5 : 0;
  if (kattlekrukSetV > 0) children.push(node('Kattlekruk Set', kattlekrukSetV, null, { fmt: 'raw' }));

  // Arcane 57
  var arcane57v = Math.min(5, Number(S.arcaneData && S.arcaneData[57]) || 0);
  if (arcane57v > 0) children.push(node('Arcane Map 57', arcane57v, null, { fmt: 'raw', note: 'cap 5' }));

  // SuperBit 47 level bonus
  var currentPlayerLv2 = (slotIdx >= 0 ? S.lv0AllData[slotIdx] && S.lv0AllData[slotIdx][0] : 0) || 0;
  var superBit47v = superBitType(47, S.gamingData[12]);
  var lvBonusTerm2 = superBit47v ? Math.max(0, Math.floor((currentPlayerLv2 - 500) / 100)) : 0;
  if (lvBonusTerm2 > 0) {
    children.push(node('Super Bit 47 Lv Bonus', lvBonusTerm2, [
      node('Player Level', currentPlayerLv2, null, { fmt: 'raw' }),
      node('floor((' + currentPlayerLv2 + ' - 500) / 100)', lvBonusTerm2, null, { fmt: 'raw' }),
    ], { fmt: 'raw' }));
  }

  var total = Math.floor(
    spelunkBonus + tal149 + tal374 + tal539 + achieve291
    + famFloor + comp1v + divCeil + dream12v + ola232bonus2
    + grimoire39v + kattlekrukSetV + arcane57v + lvBonusTerm2
  );

  return { total: total, children: children };
}

// activeCharIdx: the character whose DR is being computed.
// In getbonus2, raw talent level comes from charIdx but AllTalentLVz
// uses the active character's context (Spelunk, talents 149/374/539).
function getTalentNumber(charIdx, talentIdx, data, activeCharIdx) {
  var sl = skillLvData[charIdx] || {};
  var rawLv = Number(sl[talentIdx] || sl[String(talentIdx)]) || 0;
  if (rawLv <= 0) return { val: 0, rawLv: 0, effectiveLv: 0, bonusDetail: null };
  var ctxChar = activeCharIdx != null ? activeCharIdx : charIdx;
  var bd = resolveAllTalentLVz(talentIdx, ctxChar);
  var effectiveLv = rawLv + bd.total;
  var result = formulaEval(data.formula, data.x1, data.x2, effectiveLv);
  return { val: result, rawLv: rawLv, bonus: bd.total, effectiveLv: effectiveLv, bonusDetail: bd };
}

function getbonus2(talentIdx, data, activeCharIdx) {
  var best = 0, bestChar = -1, bestR = null;
  for (var ci = 0; ci < numCharacters; ci++) {
    var r = getTalentNumber(ci, talentIdx, data, activeCharIdx);
    if (r.val > best) { best = r.val; bestChar = ci; bestR = r; }
  }
  return { val: best, bestChar: bestChar, detail: bestR };
}

export var talent = {
  resolve: function(id, ctx, args) {
    var data = TALENT_DATA[id];
    if (!data) return node('Talent ' + id, 0, null, { note: 'talent ' + id });
    var name = data.name || 'Talent ' + id;

    // args can specify mode: 'max' = best across all chars (getbonus2)
    var mode = args && args.mode;
    var r;
    if (mode === 'max') {
      r = getbonus2(id, data, ctx.charIdx);
      var maxChildren = [node('Best Character ' + r.bestChar, r.val, null, { fmt: 'raw' })];
      if (r.detail && r.detail.bonusDetail) {
        maxChildren = [
          node('Base Level', r.detail.rawLv, null, { fmt: 'raw' }),
          node('Bonus Levels', r.detail.bonus,
            r.detail.bonusDetail.children.length ? r.detail.bonusDetail.children : null,
            { fmt: '+' }),
          node('Effective Level', r.detail.effectiveLv, null, { fmt: 'raw' }),
          node('Best Character ' + r.bestChar, r.val, null, { fmt: 'raw' }),
        ];
      }
      return node(name, r.val, maxChildren, { fmt: '+', note: 'talent ' + id });
    }

    // Talent 328 (Archlord of the Pirates): multiplicative DR factor
    // Game: 1 + getbonus2(1,328,-1) * log10(plunderousKills) / 100
    // The -1 means "search all chars for best" in getbonus2.
    // AllTalentLVz always uses the active character's context (Spelunk, talents, level).
    if (id === 328) {
      var gb = getbonus2(id, data, ctx.charIdx);
      var plunderKills = Number(optionsListData && optionsListData[139]) || 0;
      var logVal = plunderKills > 0 ? getLOG(plunderKills) : 0;
      if (gb.val <= 0 || plunderKills <= 0) return node(name, 1, null, { fmt: 'x', note: 'talent 328' });
      var total328 = 1 + gb.val * logVal / 100;
      var talCh = [];
      if (gb.detail) {
        talCh.push(node('Base Level', gb.detail.rawLv, null, { fmt: 'raw' }));
        talCh.push(node('Bonus Levels', gb.detail.bonus || 0,
          gb.detail.bonusDetail && gb.detail.bonusDetail.children.length ? gb.detail.bonusDetail.children : null,
          { fmt: '+' }));
        talCh.push(node('Effective Level', gb.detail.effectiveLv, null, { fmt: 'raw' }));
      }
      return node(name, total328, [
        node('Talent Value', gb.val, talCh, { fmt: 'raw', note: 'decay(6,150,' + (gb.detail ? gb.detail.effectiveLv : '?') + ')' }),
        node('Plunderous Kills', plunderKills, null, { fmt: 'raw', note: 'OLA[139]' }),
        node('log\u2081\u2080(' + plunderKills + ')', logVal, null, { fmt: 'raw' }),
      ], { fmt: 'x', note: 'talent 328' });
    }

    r = getTalentNumber(ctx.charIdx, id, data);
    if (r.val === 0) return node(name, 0, null, { note: 'talent ' + id });

    var bonusChildren = r.bonusDetail && r.bonusDetail.children.length ? r.bonusDetail.children : null;

    // Talent 655 (Boss Battle Spillover): game multiplies by OptionsListAccount[189]
    // which is the number of weekly boss skull difficulties beaten.
    if (id === 655) {
      var skulls = Number(optionsListData && optionsListData[189]) || 0;
      var perSkull = r.val;
      var total = perSkull * skulls;
      return node(name, total, [
        node('Base Level', r.rawLv, null, { fmt: 'raw' }),
        node('Bonus Levels', r.bonus || 0, bonusChildren, { fmt: '+' }),
        node('Effective Level', r.effectiveLv, null, { fmt: 'raw' }),
        node('Per Skull', perSkull, null, { fmt: 'raw' }),
        node('Skulls Beaten', skulls, null, { fmt: 'raw', note: 'OLA[189]' }),
      ], { fmt: '+', note: 'talent 655' });
    }

    return node(name, r.val, [
      node('Base Level', r.rawLv, null, { fmt: 'raw' }),
      node('Bonus Levels', r.bonus || 0, bonusChildren, { fmt: '+' }),
      node('Effective Level', r.effectiveLv, null, { fmt: 'raw' }),
    ], { fmt: '+', note: 'talent ' + id });
  },
};
