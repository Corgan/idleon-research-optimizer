// ===== SKILL EFFICIENCY DESCRIPTOR =====
// Normal-mode SkillStats efficiency dispatch plus Spelunking's separate formula.

import { getLOG } from '../../formulas.js';
import {
  emmData,
  equipOrderData,
  fishingToolkitDataAvailable,
  klaData,
  obolFamilyMaps,
  obolFamilyNames,
  obolMapsData,
  obolNamesData,
} from '../../save/data.js';
import { AtomInfo, MapAFKtarget, MapDetails } from '../data/game/customlists.js';
import { ITEMS } from '../data/game/items.js';
import { MONSTERS } from '../data/game/monsters.js';
import { computeCalcTalent, computeFishingToolkitStat } from '../systems/common/calcTalent.js';
import { achieveStatus } from '../systems/common/achievement.js';
import { goldFoodBonuses } from '../systems/common/goldenFood.js';
import {
  computeCardBonusByType,
  computeBoxReward,
  computeStatueBonusGiven,
  computeTotalStat,
} from '../systems/common/stats.js';
import {
  computePositiveStarSignMultiplier,
  getEnabledStarSigns,
  isStarSignActive,
} from '../systems/common/starSign.js';
import { talent } from '../systems/common/talent.js';
import { etcBonus } from '../systems/common/etcBonus.js';
import { bubbleValByKey, finalBubbleValByKey, computeVialByKey } from '../systems/w2/alchemy.js';
import { votingBonusz } from '../systems/w2/voting.js';
import { getBribeBonus } from '../systems/w3/bribe.js';
import { computeOwnedItemCount } from '../systems/w3/construction.js';
import { getSetBonus } from '../systems/w3/setBonus.js';
import { computeTrapMGBonus } from '../systems/w3/trapping.js';
import { computeRiftSkillBonus } from '../systems/w4/rift.js';
import { computeMonumentROGbonus } from '../systems/w5/hole.js';
import { computeRooBonus } from '../systems/w7/sushi.js';
import { chapterBonus, shopUpgBonus } from '../systems/w7/spelunking.js';
import { computeStampBonusOfTypeX } from '../systems/w1/stamp.js';
import { createDescriptor } from './helpers.js';
import { label } from '../entity-names.js';
import {
  computeAllBaseSkillEffDetail,
  computeAllEfficienciesDetail,
  computeCachedSkillBubble,
  pctGroup,
  resolverTerm,
  rval,
  noteNum,
  sourceTerm,
  sumTerms,
} from './skill-helpers.js';

var TOOL_SLOT = {
  Mining: 0,
  Choppin: 1,
  Fishing: 2,
  Catching: 3,
  Trapping: 4,
  Worship: 5,
};

var SKILL_LEVEL_INDEX = {
  Mining: 1,
  Choppin: 3,
  Fishing: 4,
  Catching: 6,
  Trapping: 7,
  Worship: 9,
};

var SKILL_POWER = {
  Mining: { statue: 2, bubbles: ['W2', 'W7'] },
  Choppin: { statue: 6, bubbles: ['M2', 'M7'] },
  Fishing: { statue: 8, bubbles: ['W2', 'W7'] },
  Catching: { statue: 9, bubbles: ['A2', 'A8'] },
  Trapping: { bubbles: ['A2', 'A8'] },
  Worship: { bubbles: ['M2', 'M7'] },
};

var SKILL_STAR_SIGN = {
  Mining: [4, 5],
  Choppin: [5, 5],
  Fishing: [6, 5],
  Catching: [7, 5],
  Trapping: [44, 10],
  Worship: [46, 15],
};

function _num(value) {
  if (value && typeof value === 'object') {
    if (value.val != null) return Number(value.val) || 0;
    if (value.total != null) return Number(value.total) || 0;
    if (value.computed != null) return Number(value.computed) || 0;
  }
  return Number(value) || 0;
}

function _skillLevel(skillType, charIdx, saveData) {
  return Number(saveData.lv0AllData && saveData.lv0AllData[charIdx]
    && saveData.lv0AllData[charIdx][SKILL_LEVEL_INDEX[skillType]]) || 0;
}

function _toolPower(skillType, charIdx) {
  var slot = TOOL_SLOT[skillType];
  var itemName = equipOrderData[charIdx] && equipOrderData[charIdx][1]
    && equipOrderData[charIdx][1][slot];
  if (!itemName || itemName === 'Blank') return 0;
  var item = ITEMS[itemName];
  var saved = emmData[charIdx] && emmData[charIdx][1] && emmData[charIdx][1][slot];
  return (Number(item && item.Weapon_Power) || 0) + (Number(saved && saved.Weapon_Power) || 0);
}

function _namedRowsDetail(skillType, names, maps, label) {
  var total = 0;
  var children = [];
  for (var slot = 0; names && slot < names.length; slot++) {
    var itemName = names[slot];
    if (!itemName || itemName === 'Blank' || itemName.indexOf(skillType) === -1) continue;
    var item = ITEMS[itemName];
    var saved = maps && (maps[slot] || maps[String(slot)]);
    var power = (Number(item && item.Weapon_Power) || 0) + (Number(saved && saved.Weapon_Power) || 0);
    total += power;
    children.push({ name: _itemName(itemName), val: power, fmt: 'raw' });
  }
  return { name: label, val: total, fmt: 'raw', children: children.length ? children : null };
}

function _itemName(key) {
  var item = ITEMS[key];
  return item && item.displayName ? String(item.displayName).replace(/_/g, ' ') : key;
}

function _powerFromNamedRows(skillType, names, maps) {
  return _namedRowsDetail(skillType, names, maps, '').val;
}

function _totalSkillPowerDetail(skillType, charIdx, ctx) {
  var saveData = ctx.saveData;
  var config = SKILL_POWER[skillType];
  var toolKey = equipOrderData[charIdx] && equipOrderData[charIdx][1] && equipOrderData[charIdx][1][TOOL_SLOT[skillType]];
  var terms = [
    { name: 'Tool: ' + (toolKey && toolKey !== 'Blank' ? _itemName(toolKey) : 'none'), val: _toolPower(skillType, charIdx), fmt: 'raw' },
    _namedRowsDetail(skillType, equipOrderData[charIdx] && equipOrderData[charIdx][0],
      emmData[charIdx] && emmData[charIdx][0], 'Equipment'),
    _namedRowsDetail(skillType, obolNamesData[charIdx], obolMapsData[charIdx], 'Obols'),
    _namedRowsDetail(skillType, obolFamilyNames, obolFamilyMaps, 'Family obols'),
  ];
  if (config.statue != null) {
    var statue = computeStatueBonusGiven(config.statue, charIdx, saveData);
    terms.push({ name: label('Statue', config.statue), val: _num(statue), fmt: 'raw', children: statue && statue.children || null });
  }
  for (var i = 0; i < config.bubbles.length; i++) {
    var bubble = finalBubbleValByKey(config.bubbles[i], charIdx, saveData);
    terms.push({ name: 'Bubble: ' + (label('Bubble', config.bubbles[i]).replace(/^Bubble: /, '')), val: _num(bubble), fmt: 'raw',
      children: bubble && bubble.children || null });
  }
  // Source order: (tool + equipment) + obols + family obols + statue + bubbles.
  var total = terms[0].val + terms[1].val;
  for (var t = 2; t < terms.length; t++) total += terms[t].val;
  return { name: skillType + ' power sources', val: total, fmt: 'raw', children: terms };
}

function _totalSkillPower(skillType, charIdx, ctx) {
  return _totalSkillPowerDetail(skillType, charIdx, ctx).val;
}

function _skillStatsDNDetail(skillType, charIdx, ctx) {
  var saveData = ctx.saveData;
  var toolPower = _toolPower(skillType, charIdx);
  var toolBubble = skillType === 'Mining' || skillType === 'Fishing' ? 'ToolW'
    : skillType === 'Choppin' || skillType === 'Worship' ? 'ToolM' : 'ToolA';
  var children = [{ name: 'Tool power', val: toolPower, fmt: 'raw' }];
  var value = toolPower;
  if (skillType === 'Mining') {
    var miningFactor = 1 + rval(talent, 103, ctx) * (_skillLevel(skillType, charIdx, saveData) / 10) / 100;
    value *= miningFactor;
    children.push({ name: label('Talent', 103) + ' (per 10 levels)', val: miningFactor, fmt: 'x' });
  }
  var toolBubbleRaw = bubbleValByKey(toolBubble, charIdx, saveData);
  var toolBubbleFactor = 1 + _num(toolBubbleRaw) / 100;
  value *= toolBubbleFactor;
  children.push({ name: 'Bubble: ' + label('Bubble', toolBubble).replace(/^Bubble: /, '') + ' (tool power)', val: toolBubbleFactor, fmt: 'x',
    children: toolBubbleRaw && toolBubbleRaw.children || null });
  var flat = skillType === 'Fishing' || skillType === 'Catching' ? 3 : 4;
  value += flat;
  children.push({ name: 'Base', val: flat, fmt: '+' });
  if (skillType === 'Fishing') {
    var toolkitPow = computeFishingToolkitStat('POW', charIdx);
    value += toolkitPow;
    children.push({ name: 'Fishing Toolkit POW (lure + line)', val: toolkitPow, fmt: '+' });
  }
  var sources = _totalSkillPowerDetail(skillType, charIdx, ctx);
  value += sources.val;
  children.push(sources);
  if (skillType === 'Fishing') {
    var highScore = Number(saveData.minigameHiscores && saveData.minigameHiscores[1]) || 0;
    var cap = rval(talent, 116, ctx, { tab: 2 });
    var minigame = Math.min(highScore, cap);
    value += minigame;
    children.push({ name: 'Fishing minigame high score', val: minigame, fmt: '+',
      note: 'min(high score ' + highScore + ', ' + label('Talent', 116) + ' cap ' + cap + ')' });
  } else if (skillType === 'Trapping') {
    var statue15 = _num(computeStatueBonusGiven(15, charIdx, saveData));
    value += statue15;
    children.push({ name: label('Statue', 15), val: statue15, fmt: '+' });
  } else if (skillType === 'Worship') {
    var statue16 = _num(computeStatueBonusGiven(16, charIdx, saveData));
    value += statue16;
    children.push({ name: label('Statue', 16), val: statue16, fmt: '+' });
  }
  return { name: skillType + ' Skill Power', val: value, fmt: 'raw', children: children };
}

function _skillStatsDN(skillType, charIdx, ctx) {
  return _skillStatsDNDetail(skillType, charIdx, ctx).val;
}

// SkillStatsDN: the skill power term used by efficiency and Multi-Fish/Ore odds.
export function computeSkillPowerDN(skillType, charIdx, ctx) {
  return _skillStatsDN(skillType, charIdx, ctx);
}

export function computeSkillPowerDetail(skillType, charIdx, ctx) {
  return _skillStatsDNDetail(skillType, charIdx, ctx);
}

function _totalStat(stat, charIdx, ctx) {
  return Number(computeTotalStat(stat, charIdx, ctx).computed) || 0;
}

function _box(charIdx, key) {
  return _num(computeBoxReward(charIdx, key));
}

function _stamp(type, charIdx, saveData) {
  return _num(computeStampBonusOfTypeX(type, saveData, charIdx));
}

function _vial(type, charIdx, saveData) {
  return _num(computeVialByKey(type, saveData, charIdx));
}

function _card(type, skillIdx, charIdx, saveData) {
  return _num(computeCardBonusByType(type, charIdx, saveData, {
    passive: computeRiftSkillBonus(skillIdx, 2, saveData) > 0,
  }));
}

function _starSign(skillType, charIdx, saveData) {
  var config = SKILL_STAR_SIGN[skillType];
  var enabled = getEnabledStarSigns(saveData);
  if (!isStarSignActive(config[0], charIdx, enabled, saveData)) return 0;
  return config[1] * computePositiveStarSignMultiplier(charIdx, saveData);
}

function _goldFoodMultiplier(effect, charIdx, saveData) {
  var result = goldFoodBonuses(effect, charIdx, undefined, saveData);
  return 1 + _num(result) / 100;
}

function _vote(voteIdx, ctx) {
  var votingMulti = 1;
  try { votingMulti = Number(ctx.resolve('voting-multi').val) || 1; } catch(e) {}
  return _num(votingBonusz(voteIdx, votingMulti, ctx.saveData));
}

function _atomBonus1(saveData) {
  return (Number(saveData.atomsData && saveData.atomsData[1]) || 0)
    * (Number(AtomInfo[1] && AtomInfo[1][4]) || 0);
}

function _resourceTalent(talentIdx, itemName, ctx) {
  var owned = computeOwnedItemCount(itemName, ctx.saveData);
  return 1 + rval(talent, talentIdx, ctx)
    * (_atomBonus1(ctx.saveData) + getLOG(owned)) / 100;
}

function _achievement(idx, saveData) {
  return Number(achieveStatus(idx, saveData)) || 0;
}

function _countMillionKillMobs(charIdx) {
  var count = 0;
  var killsByMap = klaData[charIdx] || [];
  for (var mapIdx = 0; mapIdx < MapAFKtarget.length; mapIdx++) {
    var monster = MONSTERS[MapAFKtarget[mapIdx]];
    if (!monster || monster.AFKtype !== 'FIGHTING' || mapIdx >= killsByMap.length) continue;
    var required = Number(MapDetails[mapIdx] && MapDetails[mapIdx][0]
      && MapDetails[mapIdx][0][0]) || 0;
    var row = killsByMap[mapIdx];
    var remaining = Number(Array.isArray(row) ? row[0] : row) || 0;
    if (required - remaining >= 1e6) count++;
  }
  return count;
}

function _talentCalc146(charIdx, ctx) {
  return rval(talent, 146, ctx) * Math.min(
    _countMillionKillMobs(charIdx),
    rval(talent, 146, ctx, { tab: 2 })
  );
}

function _shared(charIdx, ctx) {
  var allEfficienciesDetail = computeAllEfficienciesDetail(charIdx, ctx);
  var allBaseSkillEffDetail = computeAllBaseSkillEffDetail(charIdx, ctx);
  return {
    allEfficiencies: allEfficienciesDetail.val,
    allBaseSkillEff: allBaseSkillEffDetail.val,
    allEfficienciesDetail: allEfficienciesDetail,
    allBaseSkillEffDetail: allBaseSkillEffDetail,
  };
}

function _pctFactor(node) {
  return Object.assign({}, node, { val: 1 + node.val / 100, fmt: 'x', note: node.note || '+' + noteNum(node.val) + '%' });
}

function _mining(charIdx, ctx, shared) {
  var saveData = ctx.saveData;
  var level = _skillLevel('Mining', charIdx, saveData);
  var statsDN = _skillStatsDN('Mining', charIdx, ctx);
  var str = _totalStat('STR', charIdx, ctx);
  var talent142 = rval(talent, 142, ctx);
  var inner = Math.pow(statsDN, 1.3)
    + Math.pow(str + 1, 0.6) * (1 + talent142 / 100)
    + _stamp('BaseMinEff', charIdx, saveData) + shared.allBaseSkillEff;
  var value = 12 + inner
    * (1 + level / 200)
    * (1 + (_box(charIdx, 'MinEffPct') + computeCalcTalent(43, 0, charIdx, saveData)) / 100)
    * (1 + Math.pow(str / 100, 0.35) * (1 + talent142 / 100))
    * _goldFoodMultiplier('MiningEff', charIdx, saveData)
    * (1 + (rval(talent, 85, ctx) + rval(etcBonus, '10', ctx)
      + 10 * computeRiftSkillBonus(0, 1, saveData) + _vote(7, ctx)
      + _num(getSetBonus('COPPER_SET', charIdx))) / 100)
    * (1 + (_card(24, 0, charIdx, saveData) + _starSign('Mining', charIdx, saveData)
      + _vial('MinEff', charIdx, saveData) + computeMonumentROGbonus(0, 0, saveData)) / 100)
    * (1 + statsDN / 100)
    * (1 + computeCachedSkillBubble('MinEff', charIdx, ctx) / 100)
    * _resourceTalent(101, 'Copper', ctx)
    * shared.allEfficiencies;
  return { value: value, statsDN: statsDN, stat: str, level: level };
}

function _choppin(charIdx, ctx, shared) {
  var saveData = ctx.saveData;
  var level = _skillLevel('Choppin', charIdx, saveData);
  var statsDN = _skillStatsDN('Choppin', charIdx, ctx);
  var wis = _totalStat('WIS', charIdx, ctx);
  var talent462 = rval(talent, 462, ctx);
  var talent532 = rval(talent, 532, ctx);
  var inner = Math.pow(statsDN, 1.3)
    + Math.pow((wis + 2) * (1 + talent462 / 100) * (1 + talent532 / 100), 0.6)
    + _stamp('BaseChopEff', charIdx, saveData) + shared.allBaseSkillEff;
  var value = 8 + inner
    * (1 + level / 200)
    * (1 + (_box(charIdx, 'ChopEffPct') + computeCalcTalent(43, 2, charIdx, saveData)
      + _starSign('Choppin', charIdx, saveData)) / 100)
    * (1 + (computeCachedSkillBubble('ChopEff', charIdx, ctx)
      + computeMonumentROGbonus(2, 0, saveData)) / 100)
    * (1 + Math.pow(wis * (1 + talent462 / 100) / 100, 0.35) * (1 + talent532 / 100))
    * (1 + (rval(talent, 445, ctx) + rval(etcBonus, '11', ctx)
      + 10 * computeRiftSkillBonus(2, 1, saveData) + _vote(9, ctx)
      + _num(getSetBonus('COPPER_SET', charIdx))) / 100)
    * (1 + (_card(27, 2, charIdx, saveData) + _vial('ChopEff', charIdx, saveData)
      + 10 * _achievement(352, saveData)) / 100)
    * (1 + statsDN / 100)
    * _resourceTalent(461, 'Leaf1', ctx)
    * shared.allEfficiencies;
  return { value: value, statsDN: statsDN, stat: wis, level: level };
}

function _fishing(charIdx, ctx, shared) {
  var saveData = ctx.saveData;
  var level = _skillLevel('Fishing', charIdx, saveData);
  var power = _skillStatsDNDetail('Fishing', charIdx, ctx);
  var statsDN = power.val;
  var strResult = computeTotalStat('STR', charIdx, ctx);
  var str = Number(strResult.computed) || 0;
  var strChildren = strResult.tree && strResult.tree.children || null;
  var talent142 = resolverTerm(talent, 142, ctx);
  var t142 = talent142.val;
  var stampBase = _stamp('BaseFishEff', charIdx, saveData);
  var baseTerms = [
    { name: 'Skill Power ^ 1.3', val: Math.pow(statsDN, 1.3), fmt: 'raw', children: [power] },
    { name: 'STR ^ 0.6 × Talent 142', val: Math.pow(str, 0.6) * (1 + t142 / 100), fmt: 'raw', children: [
      { name: 'Total STR', val: str, fmt: 'raw', children: strChildren },
      Object.assign({}, talent142, { val: 1 + t142 / 100, fmt: 'x' }),
    ] },
    sourceTerm('Stamp: Base Fishing Efficiency', computeStampBonusOfTypeX('BaseFishEff', saveData, charIdx), { fmt: 'raw', val: stampBase }),
    shared.allBaseSkillEffDetail,
  ];
  var inner = Math.pow(statsDN, 1.3)
    + Math.pow(str, 0.6) * (1 + t142 / 100)
    + stampBase + shared.allBaseSkillEff;
  var stampPerLv = _stamp('FishEffPerLv', charIdx, saveData);
  var statTerms = [
    Object.assign({}, talent142),
    sourceTerm('10 × Rift Skill Mastery (Fishing)', 10 * computeRiftSkillBonus(3, 1, saveData)),
    sourceTerm('Vote: Fishing Efficiency', _vote(8, ctx)),
    sourceTerm('Platinum Set', _num(getSetBonus('PLATINUM_SET', charIdx))),
    sourceTerm('15 × ' + label('Bribe', 29), 15 * _num(getBribeBonus('29', saveData))),
    sourceTerm('Stamp: Fishing Efficiency per level × ' + level, stampPerLv * level),
  ];
  var statGroup = sumTerms(statTerms);
  var box = computeBoxReward(charIdx, 'FishEffPct');
  var cardRaw = computeCardBonusByType(30, charIdx, saveData, { passive: computeRiftSkillBonus(3, 2, saveData) > 0 });
  var factors = [
    { name: 'Fishing level', val: 1 + level / 200, fmt: 'x', note: '1 + ' + level + ' / 200' },
    { name: 'STR scaling', val: 1 + Math.pow(str / 100, 0.35) * (1 + statGroup / 100), fmt: 'x',
      note: '1 + (STR / 100)^0.35 × (1 + sources / 100)', children: [
        { name: '(STR / 100) ^ 0.35', val: Math.pow(str / 100, 0.35), fmt: 'raw' },
        { name: 'STR scaling sources', val: 1 + statGroup / 100, fmt: 'x', children: statTerms },
      ] },
    { name: 'Fishing Efficiency %', val: 1 + (_box(charIdx, 'FishEffPct') + computeCalcTalent(43, 3, charIdx, saveData)) / 100, fmt: 'x',
      children: [
        sourceTerm('Post Office: Fishing Efficiency', box),
        sourceTerm('Talent bonus (Fishing)', computeCalcTalent(43, 3, charIdx, saveData)),
      ] },
    { name: 'Skill Power', val: 1 + statsDN / 100, fmt: 'x', note: '1 + ' + noteNum(statsDN) + ' / 100' },
    shared.allEfficienciesDetail,
    sourceTerm('Golden Food: Fishing Efficiency', null, { fmt: 'x', val: _goldFoodMultiplier('FishingEff', charIdx, saveData) }),
    pctGroup('Fishing Efficiency sources', [
      sourceTerm('Card Bonus: Fishing Efficiency', cardRaw),
      sourceTerm('Vial: Fishing Efficiency', computeVialByKey('FishEff', saveData, charIdx)),
      resolverTerm(etcBonus, '19', ctx),
      sourceTerm('Roo Bonus 0', computeRooBonus(0, saveData)),
    ]),
    _pctFactor(resolverTerm(talent, 85, ctx)),
    { name: 'Star Sign: Fishing Efficiency', val: 1 + _starSign('Fishing', charIdx, saveData) / 100, fmt: 'x' },
  ];
  var value = inner
    * (1 + level / 200)
    * (1 + Math.pow(str / 100, 0.35) * (1 + statGroup / 100))
    * (1 + (_box(charIdx, 'FishEffPct') + computeCalcTalent(43, 3, charIdx, saveData)) / 100)
    * (1 + statsDN / 100)
    * shared.allEfficiencies
    * _goldFoodMultiplier('FishingEff', charIdx, saveData)
    * (1 + (_card(30, 3, charIdx, saveData) + _vial('FishEff', charIdx, saveData)
      + rval(etcBonus, '19', ctx) + _num(computeRooBonus(0, saveData))) / 100)
    * (1 + rval(talent, 85, ctx) / 100)
    * (1 + _starSign('Fishing', charIdx, saveData) / 100);
  var tree = [{ name: 'Base efficiency', val: inner, fmt: 'raw', children: baseTerms }].concat(factors);
  return { value: value, statsDN: statsDN, stat: str, level: level, tree: tree };
}

function _catching(charIdx, ctx, shared) {
  var saveData = ctx.saveData;
  var level = _skillLevel('Catching', charIdx, saveData);
  var statsDN = _skillStatsDN('Catching', charIdx, ctx);
  var agi = _totalStat('AGI', charIdx, ctx);
  var talent296 = rval(talent, 296, ctx);
  var talent367 = rval(talent, 367, ctx);
  var boostedAgi = agi * (1 + talent296 / 100);
  var inner = Math.pow(statsDN, 1.3)
    + Math.pow(boostedAgi, 0.6) * (1 + talent367 / 100)
    + _stamp('BaseCatchEff', charIdx, saveData) + shared.allBaseSkillEff;
  var value = inner
    * (1 + level / 200)
    * (1 + Math.pow(boostedAgi / 100, 0.35) * (1 + talent367 / 100))
    * (1 + (_card(32, 5, charIdx, saveData) + _vial('CatchEff', charIdx, saveData)
      + computeMonumentROGbonus(1, 0, saveData) + 10 * computeRiftSkillBonus(5, 1, saveData)
      + _vote(10, ctx) + _num(getSetBonus('PLATINUM_SET', charIdx))
      + rval(etcBonus, '18', ctx) + 10 * _achievement(351, saveData)) / 100)
    * (1 + (_box(charIdx, 'CatchEffPct') + computeCalcTalent(43, 5, charIdx, saveData)
      + _starSign('Catching', charIdx, saveData)) / 100)
    * _resourceTalent(295, 'OakTree', ctx)
    * (1 + (statsDN + Math.min(5, 5 * _achievement(74, saveData))) / 100)
    * shared.allEfficiencies
    * (1 + rval(talent, 263, ctx) / 100);
  return { value: value, statsDN: statsDN, stat: agi, level: level };
}

function _trapping(charIdx, ctx, shared) {
  var saveData = ctx.saveData;
  var level = _skillLevel('Trapping', charIdx, saveData);
  var statsDN = _skillStatsDN('Trapping', charIdx, ctx);
  var agi = _totalStat('AGI', charIdx, ctx);
  var inner = Math.pow(statsDN, 1.3)
    + Math.pow(agi + 1, 0.6) * (1 + rval(talent, 367, ctx) / 100)
    + _stamp('TrappingEff', charIdx, saveData) + shared.allBaseSkillEff;
  var value = (10 + inner
    * (1 + level / 100)
    * (1 + computeCalcTalent(43, 6, charIdx, saveData) / 100)
    * shared.allEfficiencies)
    * (1 + (_num(bubbleValByKey('TrapACTIVE', charIdx, saveData))
      + 10 * computeRiftSkillBonus(6, 1, saveData)) / 100)
    * _resourceTalent(311, 'Critter1', ctx)
    * (1 + (rval(talent, 263, ctx) + _card(57, 6, charIdx, saveData)
      + _starSign('Trapping', charIdx, saveData) + _box(charIdx, '16a')
      + computeTrapMGBonus(1, saveData) + computeTrapMGBonus(6, saveData)) / 100);
  return { value: value, statsDN: statsDN, stat: agi, level: level };
}

function _worship(charIdx, ctx, shared) {
  var saveData = ctx.saveData;
  var level = _skillLevel('Worship', charIdx, saveData);
  var statsDN = _skillStatsDN('Worship', charIdx, ctx);
  var wis = _totalStat('WIS', charIdx, ctx);
  var inner = Math.pow(statsDN, 1.3)
    + Math.pow(wis + 1, 0.6) * (1 + rval(talent, 532, ctx) / 100)
    + _stamp('WorshipEff', charIdx, saveData) + shared.allBaseSkillEff;
  var value = 10 + inner
    * (1 + level / 200)
    * (1 + (10 * rval(talent, 445, ctx) * computeRiftSkillBonus(8, 1, saveData)
      + _box(charIdx, '18a') + computeCalcTalent(43, 8, charIdx, saveData)
      + _starSign('Worship', charIdx, saveData)) / 100)
    * shared.allEfficiencies
    * _resourceTalent(476, 'Soul1', ctx);
  return { value: value, statsDN: statsDN, stat: wis, level: level };
}

function _cooking(charIdx, ctx, shared) {
  var saveData = ctx.saveData;
  var strResult = computeTotalStat('STR', charIdx, ctx);
  var str = Number(strResult.computed) || 0;
  var talent142 = resolverTerm(talent, 142, ctx);
  var t142 = talent142.val;
  var tc146 = _talentCalc146(charIdx, ctx);
  var t85 = resolverTerm(talent, 85, ctx);
  var etc67 = resolverTerm(etcBonus, '67', ctx);
  var stamp = computeStampBonusOfTypeX('CookingEff', saveData, charIdx);
  var stampVal = _num(stamp);
  var etc62 = resolverTerm(etcBonus, '62', ctx);
  var rift = 10 * computeRiftSkillBonus(9, 1, saveData);
  var box19a = _box(charIdx, '19a');
  // Source grouping: 250 + (STR term + (stamp + (etc62 + rift + box)) + AllBaseSkillEff).
  var inner = 250 + (Math.pow(str, 0.6) * (1 + t142 / 100)
    + (stampVal + (etc62.val + rift + box19a)) + shared.allBaseSkillEff);
  var pct = tc146 + (t85.val + etc67.val);
  var value = shared.allEfficiencies * (1 + pct / 100) * inner;
  var tree = [
    shared.allEfficienciesDetail,
    pctGroup('Cooking Efficiency %', [
      sourceTerm(label('Talent', 146) + ' × million-kill maps', tc146, {
        note: 'Talent 146 × min(maps with 1M+ kills, tab 2 cap)',
      }),
      t85,
      etc67,
    ]),
    { name: 'Base efficiency', val: inner, fmt: 'raw', children: [
      { name: 'Base', val: 250, fmt: 'raw' },
      { name: 'STR ^ 0.6 × Talent 142', val: Math.pow(str, 0.6) * (1 + t142 / 100), fmt: 'raw', children: [
        { name: 'Total STR', val: str, fmt: 'raw', children: strResult.tree && strResult.tree.children || null },
        Object.assign({}, talent142, { val: 1 + t142 / 100, fmt: 'x' }),
      ] },
      sourceTerm('Stamp: Cooking Efficiency', stamp, { fmt: 'raw', val: stampVal }),
      Object.assign({}, etc62, { fmt: 'raw' }),
      { name: '10 × Rift Skill Mastery (Cooking)', val: rift, fmt: 'raw' },
      { name: 'Post Office: Cooking Efficiency', val: box19a, fmt: 'raw' },
      shared.allBaseSkillEffDetail,
    ] },
  ];
  return { value: value, statsDN: 0, stat: str, level: 0, tree: tree };
}

function _laboratory(charIdx, ctx, shared) {
  var saveData = ctx.saveData;
  var wis = _totalStat('WIS', charIdx, ctx);
  var value = shared.allEfficiencies
    * (200 + Math.pow(wis, 0.6) * (1 + rval(talent, 532, ctx) / 100)
      + rval(etcBonus, '63', ctx) + shared.allBaseSkillEff + _box(charIdx, '15a'))
    * (1 + (rval(talent, 538, ctx) + rval(etcBonus, '66', ctx)
      + 10 * computeRiftSkillBonus(11, 1, saveData)) / 100)
    * (1 + rval(talent, 445, ctx) / 100);
  return { value: value, statsDN: 0, stat: wis, level: 0 };
}

function _spelunking(charIdx, ctx, shared) {
  var saveData = ctx.saveData;
  var shop56Factor = 1 + _num(shopUpgBonus(56, saveData)) / 100;
  var talent237Factor = Math.max(1, rval(talent, 237, ctx));
  var value = (10 + chapterBonus(0, 0, saveData) + chapterBonus(1, 0, saveData))
    * Math.max(1, 1 + (shared.allEfficiencies - 1) / 20)
    * (1 + 30 * computeRiftSkillBonus(18, 1, saveData) / 100)
    * shop56Factor
    * (1 + chapterBonus(0, 1, saveData) / 100)
    * talent237Factor
    * (1 + (_stamp('spelunkeff', charIdx, saveData)
      + _card(98, 18, charIdx, saveData) + _vial('7spelunkeff', charIdx, saveData)
      + _num(bubbleValByKey('A11', charIdx, saveData))) / 100);
  return {
    value: value,
    statsDN: 0,
    stat: 0,
    level: 0,
    children: [
      { name: 'Shop Upgrade 56 Multiplier', val: shop56Factor, fmt: 'x', note: 'ShopUpgBonus(56)' },
      { name: label('Talent', 237) + ' Multiplier', val: talent237Factor, fmt: 'x', note: 'max(1, GetTalentNumber(1,237))' },
    ],
  };
}

var COMPUTE = {
  Mining: _mining,
  Choppin: _choppin,
  Fishing: _fishing,
  Catching: _catching,
  Trapping: _trapping,
  Worship: _worship,
  Cooking: _cooking,
  Laboratory: _laboratory,
  Spelunking: _spelunking,
};

export default createDescriptor({
  id: 'skill-efficiency',
  name: 'Skill Efficiency',
  scope: 'character+map+skill',
  category: 'stat',
  applies: function(ctx) {
    var skillType = ctx.skillType || 'Mining';
    return skillType === 'Smithing' || skillType === 'Breeding'
      ? { applicable: false, reason: skillType + ' has no Skill Efficiency panel value.' }
      : true;
  },

  combine: function(pools, ctx) {
    var saveData = ctx.saveData;
    if (!saveData) return { val: 0, children: null };
    var charIdx = ctx.charIdx || 0;
    var skillType = ctx.skillType || 'Mining';

    if (skillType === 'Divinity') {
      return {
        val: 100,
        children: [{ name: 'Divinity Efficiency', val: 100, fmt: 'raw', note: 'SkillStats("DivinityEfficiency")' }],
      };
    }
    var compute = COMPUTE[skillType];
    if (!compute) return {
      val: 0,
      children: null,
      unavailable: true,
      reason: skillType + ' efficiency is not available.',
    };

    var shared = _shared(charIdx, ctx);
    var result = compute(charIdx, ctx, shared);
    var value = Number(result.value);
    if (!Number.isFinite(value)) value = 0;

    var children = [];
    if (result.statsDN > 0) children.push({
      name: skillType + ' Skill Power',
      val: result.statsDN,
      fmt: 'raw',
    });
    if (result.stat > 0) children.push({
      name: skillType === 'Choppin' || skillType === 'Worship' || skillType === 'Laboratory'
        ? 'Total WIS' : skillType === 'Catching' || skillType === 'Trapping' ? 'Total AGI' : 'Total STR',
      val: result.stat,
      fmt: 'raw',
    });
    if (result.level > 0) children.push({
      name: skillType + ' Level',
      val: result.level,
      fmt: 'raw',
    });
    if (result.children) children.push.apply(children, result.children);
    children.push({ name: 'All Base Skill Efficiency', val: shared.allBaseSkillEff, fmt: 'raw' });
    children.push({ name: 'All Skill Efficiencies', val: shared.allEfficiencies, fmt: 'x' });
    // Skills with a source-order factor tree replace the summary terms.
    if (result.tree) children = result.tree;
    var missingMetadata = [];
    if (saveData.companionDataAvailable === false) missingMetadata.push('companion ownership');
    if (['Mining', 'Choppin', 'Fishing', 'Catching'].indexOf(skillType) !== -1
      && saveData.activeVoteDataAvailable === false) missingMetadata.push('current server vote');
    if (skillType === 'Fishing' && !fishingToolkitDataAvailable[charIdx]) {
      missingMetadata.push('Fishing Toolkit selection');
    }
    return {
      val: value,
      children: children,
      partial: missingMetadata.length > 0,
      reason: missingMetadata.length > 0
        ? 'Partial total: the imported JSON does not include ' + missingMetadata.join(' or ') + ' metadata.'
        : '',
    };
  },
});
