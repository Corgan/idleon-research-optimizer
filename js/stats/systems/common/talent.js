// ===== TALENT SYSTEM =====
// Reads talent level, adds AllTalentLVz bonus, applies formula.
// Also exports computeAllTalentLVz for use by other systems and the save layer.

import { node } from '../../node.js';
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
import { formulaEval, getLOG } from '../../../formulas.js';
import { superBitType } from '../../../game-helpers.js';
import { hasBonusMajor } from '../w5/divinity.js';
import { label, entityName } from '../../entity-names.js';
import { talentParams, familyBonusParams } from '../../data/common/talent.js';
import { companionBonus } from '../../data/common/companions.js';
import { bubbleParams } from '../../data/w2/alchemy.js';
import { equipSetBonus } from '../../data/common/equipment.js';
import { godMinorX1 } from '../../data/w5/divinity.js';
import { DIVINITY_MINOR_DENOM } from '../../data/game-constants.js';

export function computeAllTalentLVz(talentIdx, slotIdx, opts, saveData) {
  // Replicates AllTalentLVz from the game.
  // talentIdx is normally the talent index, but game's getbonus2 passes the raw
  // talent LEVEL (SkillLevels[t]) instead — callers replicate this by passing
  // rawLv directly as talentIdx.
  // opts.contextSlot: use this slot for per-char bonus lookups (149/374/539, player level)
  var ctxSlot = (opts && opts.contextSlot !== undefined) ? opts.contextSlot : slotIdx;
  if ((talentIdx >= 49 && talentIdx <= 59) || talentIdx === 149 || talentIdx === 374
      || talentIdx === 539 || talentIdx === 505 || talentIdx > 614) return 0;

  // Spelunk super talent
  var spelunkBonus = 0;
  if (slotIdx >= 0) {
    var preset = Number(playerStuffData[slotIdx] && playerStuffData[slotIdx][1]) || 0;
    var superArr = saveData.spelunkData && saveData.spelunkData[20 + slotIdx + 12 * preset];
    if (Array.isArray(superArr) && superArr.indexOf(talentIdx) !== -1) {
      spelunkBonus = Math.round(50 + (Number(saveData.spelunkData[18] && saveData.spelunkData[18][7]) || 0) * 10 + (Number(saveData.spelunkData[45] && saveData.spelunkData[45][5]) || 0));
    }
  }

  // Talents 149/374/539: intervalAdd(1, 20, lv) — uses active character's own level.
  // Game calls GetTalentNumber(1, x) which reads the current char's SkillLevels.
  function intervalAddForChar(talId) {
    var sl = ctxSlot >= 0 ? skillLvData[ctxSlot] : null;
    var lv = Number(sl && (sl[talId] || sl[String(talId)])) || 0;
    return lv > 0 ? 1 + Math.floor(lv / 20) : 0;
  }
  var tal149 = intervalAddForChar(149);
  var tal374 = intervalAddForChar(374);
  var tal539 = intervalAddForChar(539);
  var achieve291 = saveData.achieveRegData[291] === -1 ? 1 : 0;

  // FamBonusQTYs[68]: ClassFamilyBonuses[34], decay formula with lvOffset from ClassAccountBonus
  // Game iterates family bonuses in index order: bonus 33 (→key 66) before bonus 34 (→key 68).
  // When computing bonus 66, the game reads DNSM.FamBonusQTYs[68] which is still 0.
  // opts.skipFamBonus68 replicates this ordering dependency.
  // opts.partialFamBonusMap: when computing ATL during FamBonusQTYs iteration, the game reads
  // FamBonusQTYs[68] from the partially-built map (which may be 0 if class-34 chars haven't
  // been processed yet). Pass the current result map to replicate this behavior.
  // Game also applies talent 144 multiplier to FamBonusQTYs when the active character provides
  // the max contribution: FamBonusQTYs[key] = raw * (1 + GetTalentNumber(1,144) / 100).
  var famBonus68 = 0;
  if (opts && opts.partialFamBonusMap !== undefined) {
    // During FamBonusQTYs computation: read from the partially-built map,
    // matching the game's AllTalentLVz reading DNSM.FamBonusQTYs.h[68]
    famBonus68 = Number(opts.partialFamBonusMap[68]) || 0;
  } else if (!(opts && opts.skipFamBonus68)) {
    var _fb34 = familyBonusParams(34);
    var maxMageCharLv = 0;
    var maxMageCharIdx = -1;
    for (var ci = 0; ci < numCharacters; ci++) {
      var cls = charClassData[ci];
      // Classes whose ReturnClasses tree includes 34: class 34 (mod 4) and class 38 (mod 8)
      if (cls === 34 || cls === 38) {
        var lv = saveData.lv0AllData[ci] && saveData.lv0AllData[ci][0] || 0;
        if (lv > maxMageCharLv) { maxMageCharLv = lv; maxMageCharIdx = ci; }
      }
    }
    var famN = Math.max(0, Math.round(maxMageCharLv - _fb34.lvOffset));
    famBonus68 = famN > 0 ? formulaEval(_fb34.formula, _fb34.x1, _fb34.x2, famN) : 0;
    // Talent 144 multiplier: applied only when the active char IS the max provider
    if (famBonus68 > 0 && maxMageCharIdx === ctxSlot && !(opts && opts.skipTal144FamMult)) {
      var _rawLv144 = Number(skillLvData[ctxSlot] && skillLvData[ctxSlot][144]) || 0;
      if (_rawLv144 > 0) {
        var _atlFor144 = computeAllTalentLVz(144, slotIdx, Object.assign({}, opts, { skipTal144FamMult: true }), saveData);
        var _effLv144 = _rawLv144 + _atlFor144;
        var _t144 = talentParams(144);
        var _tal144Val = formulaEval(_t144.formula, _t144.x1, _t144.x2, _effLv144);
        famBonus68 = famBonus68 * (1 + _tal144Val / 100);
      }
    }
  }

  // Companions(1): Rift Slug = +talent levels if owned
  var comp1 = saveData.companionIds.has(1) ? companionBonus(1) : 0;

  // Divinity minor bonus 2 (Arctis)
  var _y2bp = bubbleParams(3, 21);
  var y2BubbleLv = Number(cauldronInfoData && cauldronInfoData[3] && cauldronInfoData[3][21]) || 0;
  var y2Value = y2BubbleLv > 0 ? formulaEval(_y2bp.formula, _y2bp.x1, _y2bp.x2, y2BubbleLv) : 0;
  var allBubblesActive = saveData.companionIds.has(4);
  // Game: Divinity("Bonus_Minor", activeCharIdx, 2) — uses only the context character's
  // own divinity level, NOT the max across all characters.
  var divMinor = 0;
  var coralKid3 = Number(optionsListData && optionsListData[430]) || 0;
  if (ctxSlot >= 0 && hasBonusMajor(ctxSlot, 2, saveData)) {
    var divLv = saveData.lv0AllData[ctxSlot] && saveData.lv0AllData[ctxSlot][14] || 0;
    if (divLv > 0) {
      var y2Active = (allBubblesActive || (cauldronBubblesData && cauldronBubblesData[ctxSlot] || []).includes('d21')) ? y2Value : 0;
      divMinor = Math.max(1, y2Active) * (1 + coralKid3 / 100) * divLv / (DIVINITY_MINOR_DENOM + divLv) * godMinorX1(2);
    }
  }

  var dream12 = Number(dreamData && dreamData[12]) || 0;
  var ola232 = Number(optionsListData && optionsListData[232]) || 0;
  var ola232bonus = 5 * Math.floor((97 + ola232) / 100);
  var grimoire39 = Number(saveData.grimoireData && saveData.grimoireData[39]) || 0;
  var kattlekrukSet = String(optionsListData && optionsListData[379] || '').split(',').includes('KATTLEKRUK_SET') ? equipSetBonus('KATTLEKRUK_SET') : 0;
  var arcane57 = Math.min(5, Number(saveData.arcaneData && saveData.arcaneData[57]) || 0);

  var currentPlayerLv = (ctxSlot >= 0 ? saveData.lv0AllData[ctxSlot] && saveData.lv0AllData[ctxSlot][0] : 0) || 0;
  var superBit47 = superBitType(47, saveData.gamingData[12]);
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

// Dynamic talent data lookup from TalentDescriptions game data.
// No more cherry-picking — any talent index works.
// tab: 1 (default) or 2 — selects which formula set to use.
function getTalentData(id, tab) {
  var p = talentParams(id, tab);
  if (!p || !p.formula || p.formula === 'txt' || p.formula === '_') return null;
  var name = entityName('Talent', id) || ('Talent ' + id);
  return { x1: p.x1, x2: p.x2, formula: p.formula, name: name };
}

// Returns { total, children } for AllTalentLVz bonus breakdown
// talentIdx is normally the talent index, but game's getbonus2 passes the raw
// talent LEVEL (SkillLevels[t]) instead — callers replicate this by passing
// rawLv directly as talentIdx.
function resolveAllTalentLVz(talentIdx, slotIdx, opts, saveData) {
  if ((talentIdx >= 49 && talentIdx <= 59) || talentIdx === 149 || talentIdx === 374
      || talentIdx === 539 || talentIdx === 505 || talentIdx > 614)
    return { total: 0, children: [] };

  var children = [];

  // Spelunk super talent
  var spelunkBonus = 0;
  if (slotIdx >= 0) {
    var preset = Number(playerStuffData[slotIdx] && playerStuffData[slotIdx][1]) || 0;
    var superArr = saveData.spelunkData && saveData.spelunkData[20 + slotIdx + 12 * preset];
    if (Array.isArray(superArr) && superArr.indexOf(talentIdx) !== -1) {
      var baseSp = 50;
      var legend7 = (Number(saveData.spelunkData[18] && saveData.spelunkData[18][7]) || 0) * 10;
      var w7b5 = Number(saveData.spelunkData[45] && saveData.spelunkData[45][5]) || 0;
      spelunkBonus = Math.round(baseSp + legend7 + w7b5);
      children.push(node('Spelunk Super Talent', spelunkBonus, [
        node('Base', baseSp, null, { fmt: 'raw' }),
        node(label('Legend', 7), legend7, null, { fmt: 'raw', note: 'Spelunk[18][7] × 10' }),
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
var tal149 = intervalAddCharNode(149, label('Talent', 149));
    var tal374 = intervalAddCharNode(374, label('Talent', 374));
    var tal539 = intervalAddCharNode(539, label('Talent', 539));

  // Achievement 291
  var achieve291 = saveData.achieveRegData[291] === -1 ? 1 : 0;
  if (achieve291 > 0) children.push(node(label('Achievement', 291), achieve291, null, { fmt: 'raw' }));

  // Family bonus 68 (mage chars)
  var _fb342 = familyBonusParams(34);
  var maxMageCharLv = 0;
  var maxMageCharIdx2 = -1;
  for (var ci3 = 0; ci3 < numCharacters; ci3++) {
    var cls = charClassData[ci3];
    if (cls === 34 || cls === 38) {
      var lv3 = saveData.lv0AllData[ci3] && saveData.lv0AllData[ci3][0] || 0;
      if (lv3 > maxMageCharLv) { maxMageCharLv = lv3; maxMageCharIdx2 = ci3; }
    }
  }
  var famN2 = Math.max(0, Math.round(maxMageCharLv - _fb342.lvOffset));
  var famBonus682 = famN2 > 0 ? formulaEval(_fb342.formula, _fb342.x1, _fb342.x2, famN2) : 0;
  // Talent 144 multiplier: applied when context char is the max provider
  if (famBonus682 > 0 && maxMageCharIdx2 === slotIdx) {
    var _rawLv1442 = Number(skillLvData[slotIdx] && skillLvData[slotIdx][144]) || 0;
    if (_rawLv1442 > 0) {
      var _atlFor1442 = computeAllTalentLVz(144, slotIdx, { skipTal144FamMult: true }, saveData);
      var _effLv1442 = _rawLv1442 + _atlFor1442;
      var _t1442 = talentParams(144);
      var _tal144Val2 = formulaEval(_t1442.formula, _t1442.x1, _t1442.x2, _effLv1442);
      famBonus682 = famBonus682 * (1 + _tal144Val2 / 100);
    }
  }
  var famFloor = Math.floor(famBonus682);
  if (famFloor > 0) {
    children.push(node('Family Bonus 68 (Mage)', famFloor, [
      node('Best Mage Lv', maxMageCharLv, null, { fmt: 'raw' }),
      node('N = max(0, ' + maxMageCharLv + ' - 69)', famN2, null, { fmt: 'raw' }),
    ], { fmt: 'raw' }));
  }

  // Companion 1 (Rift Slug)
  var comp1v = saveData.companionIds.has(1) ? companionBonus(1) : 0;
  if (comp1v > 0) children.push(node(label('Companion', 1), comp1v, null, { fmt: 'raw' }));

  // Divinity minor 2 (Arctis)
  var _y2bp2 = bubbleParams(3, 21);
  var y2BubbleLv2 = Number(cauldronInfoData && cauldronInfoData[3] && cauldronInfoData[3][21]) || 0;
  var y2Value2 = y2BubbleLv2 > 0 ? formulaEval(_y2bp2.formula, _y2bp2.x1, _y2bp2.x2, y2BubbleLv2) : 0;
  var allBubblesActive2 = saveData.companionIds.has(4);
  // Game: Divinity("Bonus_Minor", activeCharIdx, 2) — uses only the context character.
  var divMinor2 = 0;
  var coralKid32 = Number(optionsListData && optionsListData[430]) || 0;
  if (slotIdx >= 0 && hasBonusMajor(slotIdx, 2, saveData)) {
    var divLv2 = saveData.lv0AllData[slotIdx] && saveData.lv0AllData[slotIdx][14] || 0;
    if (divLv2 > 0) {
      var y2Active2 = (allBubblesActive2 || (cauldronBubblesData && cauldronBubblesData[slotIdx] || []).includes('d21')) ? y2Value2 : 0;
      divMinor2 = Math.max(1, y2Active2) * (1 + coralKid32 / 100) * divLv2 / (DIVINITY_MINOR_DENOM + divLv2) * godMinorX1(2);
    }
  }
  var divCeil = Math.ceil(divMinor2);
  if (divCeil > 0) children.push(node('Divinity Minor 2 (Arctis)', divCeil, null, { fmt: 'raw' }));

  // Dream 12
  var dream12v = Number(dreamData && dreamData[12]) || 0;
  if (dream12v > 0) children.push(node(label('Dream', 12), dream12v, null, { fmt: 'raw' }));

  // Ola 232
  var ola232v = Number(optionsListData && optionsListData[232]) || 0;
  var ola232bonus2 = 5 * Math.floor((97 + ola232v) / 100);
  if (ola232bonus2 > 0) children.push(node('Sneaking Completions', ola232bonus2, null, { fmt: 'raw', note: 'raw=' + ola232v }));

  // Grimoire 39
  var grimoire39v = Number(saveData.grimoireData && saveData.grimoireData[39]) || 0;
  if (grimoire39v > 0) children.push(node(label('Grimoire', 39), grimoire39v, null, { fmt: 'raw' }));

  // Kattlekruk set
  var kattlekrukSetV = String(optionsListData && optionsListData[379] || '').split(',').includes('KATTLEKRUK_SET') ? equipSetBonus('KATTLEKRUK_SET') : 0;
  if (kattlekrukSetV > 0) children.push(node('Kattlekruk Set', kattlekrukSetV, null, { fmt: 'raw' }));

  // Arcane 57
  var arcane57v = Math.min(5, Number(saveData.arcaneData && saveData.arcaneData[57]) || 0);
  if (arcane57v > 0) children.push(node('Arcane Map 57', arcane57v, null, { fmt: 'raw', note: 'cap 5' }));

  // SuperBit 47 level bonus
  var currentPlayerLv2 = (slotIdx >= 0 ? saveData.lv0AllData[slotIdx] && saveData.lv0AllData[slotIdx][0] : 0) || 0;
  var superBit47v = superBitType(47, saveData.gamingData[12]);
  var lvBonusTerm2 = superBit47v ? Math.max(0, Math.floor((currentPlayerLv2 - 500) / 100)) : 0;
  if (lvBonusTerm2 > 0) {
    children.push(node(label('Super Bit', 47, ' Lv Bonus'), lvBonusTerm2, [
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
// atlIdx: override for the index passed to resolveAllTalentLVz (game's getbonus2
//   passes raw talent LEVEL instead of the talent index).
function getTalentNumber(charIdx, talentIdx, data, activeCharIdx, atlIdx, saveData) {
  var sl = skillLvData[charIdx] || {};
  var rawLv = Number(sl[talentIdx] || sl[String(talentIdx)]) || 0;
  if (rawLv <= 0) return { val: 0, rawLv: 0, effectiveLv: 0, bonusDetail: null };
  var ctxChar = activeCharIdx != null ? activeCharIdx : charIdx;
  var bd = resolveAllTalentLVz(atlIdx !== undefined ? atlIdx : talentIdx, ctxChar, undefined, saveData);
  var effectiveLv = rawLv + bd.total;
  var result = formulaEval(data.formula, data.x1, data.x2, effectiveLv);
  return { val: result, rawLv: rawLv, bonus: bd.total, effectiveLv: effectiveLv, bonusDetail: bd };
}

// Game's getbonus2 passes SkillLevels[t] (raw talent level) to AllTalentLVz
// instead of the talent index. We replicate this by passing rawLv as atlIdx.
// Game gate: AllTalentLVz is only applied when talentIdx >= 100.
// For talents < 100, getbonus2 uses raw level without ATL bonus.
function getbonus2(talentIdx, data, activeCharIdx, saveData) {
  var best = 0, bestChar = -1, bestR = null;
  for (var ci = 0; ci < numCharacters; ci++) {
    var sl = skillLvData[ci] || {};
    var rawLv = Number(sl[talentIdx] || sl[String(talentIdx)]) || 0;
    var r;
    if (talentIdx >= 100) {
      r = getTalentNumber(ci, talentIdx, data, activeCharIdx, rawLv, saveData);
    } else {
      // No ATL for talents < 100 in getbonus2
      if (rawLv <= 0) {
        r = { val: 0, rawLv: 0, effectiveLv: 0, bonusDetail: null };
      } else {
        var result = formulaEval(data.formula, data.x1, data.x2, rawLv);
        r = { val: result, rawLv: rawLv, bonus: 0, effectiveLv: rawLv,
          bonusDetail: { total: 0, children: [] } };
      }
    }
    if (r.val > best) { best = r.val; bestChar = ci; bestR = r; }
  }
  return { val: best, bestChar: bestChar, detail: bestR };
}

// Public helper: max talent value across all characters (getbonus2).
// activeCharIdx: optional — which character's AllTalentLVz context to use.
export function maxTalentBonus(talentIdx, activeCharIdx, saveData) {
  var data = getTalentData(talentIdx);
  if (!data) return 0;
  return getbonus2(talentIdx, data, activeCharIdx, saveData).val;
}

export var talent = {
  resolve: function(id, ctx, args) {
    var saveData = ctx.saveData;
    var tab = args && args.tab;
    var data = getTalentData(id, tab);
    if (!data) return node(label('Talent', id), 0, null, { note: 'talent ' + id + ' no data' });
    var name = label('Talent', id);

    // args can specify mode: 'max' = best across all chars (getbonus2)
    var mode = args && args.mode;
    var r;
    if (mode === 'max') {
      r = getbonus2(id, data, ctx.charIdx, saveData);
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
    // Game: 1 + getbonus2(1,328,-1, saveData) * log10(plunderousKills) / 100
    // Game's getbonus2(-1, saveData) still applies AllTalentLVz for talents >= 100,
    // using the active in-game character's context. We approximate this
    // with ctx.charIdx since there's no "active" character in save data.
    if (id === 328) {
      var gb = getbonus2(id, data, ctx.charIdx, saveData);
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

    r = getTalentNumber(ctx.charIdx, id, data, ctx.activeCharIdx, undefined, saveData);
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
