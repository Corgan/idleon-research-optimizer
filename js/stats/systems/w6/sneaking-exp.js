// ===== SNEAKING EXP (W6) =====

import { node } from '../../node.js';
import { label } from '../../entity-names.js';
import { createStatContext } from '../../stat-context.js';
import { arcadeBonus } from '../w2/arcade.js';
import { computeVialByKey } from '../w2/alchemy.js';
import { computeStampBonusOfTypeX } from '../w1/stamp.js';
import { votingBonusz } from '../w2/voting.js';
import { computeCardLv } from '../common/cards.js';
import { computeMealBonus } from '../common/stats.js';
import { computeStarSignBonus } from '../common/starSign.js';
import { guild } from '../common/guild.js';
import { maxTalentBonusDetail } from '../common/talent.js';
import { companions } from '../common/companions.js';
import { mainframeBonus } from '../w4/lab.js';
import { computeRiftSkillBonus } from '../w4/rift.js';
import { pristineBon } from '../w5/pristine.js';
import { computeCompassBonus } from '../w7/compass.js';
import { computeMeritocBonusz } from '../w7/meritoc.js';
import { legendPTSbonus } from '../w7/spelunking.js';
import { vaultUpgBonus } from '../common/vault.js';
import { computeWinBonus } from './summoning.js';
import { achieveStatus } from '../common/achievement.js';
import {
  floorExpMult,
  nkBonus,
} from './sneaking-math.js';
import {
  gemstoneBonus,
  goldInventoryBonuses,
  soloMultiplier,
  twinCharmBonuses,
} from './sneaking-stealth.js';

function _num(value) { return Number(value) || 0; }

function _votingBonus25(saveData, activeCharIdx) {
  if (saveData.activeVoteIdx !== 25) return 0;
  var ctx = createStatContext({ charIdx: activeCharIdx, saveData: saveData });
  var votingMulti = Number(ctx.resolve('voting-multi').val) || 1;
  return votingBonusz(25, votingMulti, saveData);
}

function _guildBonus14(ctx) {
  var result = guild.resolve(14, ctx);
  return _num(result && result.val);
}

function _expRecipientTwin(twinIdx, saveData, charm3) {
  if (!(charm3 > 0)) return twinIdx;
  var levels = saveData.lv0AllData || [];
  var exp = saveData.exp0AllData || [];
  var selected = twinIdx;
  var count = Math.max(levels.length, exp.length);
  for (var candidate = 0; candidate < count; candidate++) {
    var candidateLevel = _num(levels[candidate] && levels[candidate][17]);
    var selectedLevel = _num(levels[selected] && levels[selected][17]);
    if (candidateLevel <= selectedLevel) continue;
    var candidateExp = _num(exp[candidate] && exp[candidate][17]);
    var selectedExp = _num(exp[selected] && exp[selected][17]);
    if (candidateExp > selectedExp) selected = candidate;
  }
  return selected;
}

export function sneakingExpAccountInputs(saveData, activeCharIdx) {
  var ninjaData = saveData.ninjaData || [];
  var olaData = saveData.olaData || [];
  var spelunkData = saveData.spelunkData || [];
  var ctx = createStatContext({ charIdx: activeCharIdx, saveData: saveData, skillType: 'Sneaking' });
  var allSkillMulti = (1 + computeMeritocBonusz(10, saveData, activeCharIdx) / 100)
    * (1 + legendPTSbonus(20, saveData) / 100)
    * (1 + companions(32, saveData));
  return {
    goldBonuses: goldInventoryBonuses(ninjaData, olaData, spelunkData, saveData, activeCharIdx),
    allSkillMulti: allSkillMulti,
    arcade52: _num(arcadeBonus(52, saveData)),
    compass49: computeCompassBonus(49, saveData),
    gem4: gemstoneBonus(4, olaData, saveData, activeCharIdx),
    vial: _num(computeVialByKey('6SneakEXP', saveData, activeCharIdx)),
    meal: _num(computeMealBonus('zSneakExp', saveData, activeCharIdx)),
    rift: computeRiftSkillBonus(16, 0, saveData),
    pristine: pristineBon(7, saveData),
    cardLv: computeCardLv('w6a4', saveData),
    mainframe: mainframeBonus(16, saveData),
    stamp: _num(computeStampBonusOfTypeX('SneakExp', saveData, activeCharIdx)),
    star: _num(computeStarSignBonus('SneakExp', activeCharIdx, saveData).val),
    guild14: _guildBonus14(ctx),
    talent431Add: _num(maxTalentBonusDetail(431, activeCharIdx, saveData, { mode: 1 }).value),
    talent431Multi: Math.max(1, _num(maxTalentBonusDetail(431, activeCharIdx, saveData, { mode: 2 }).value)),
    achievement: 10 * achieveStatus(370, saveData),
    vote: _votingBonus25(saveData, activeCharIdx),
    vault: vaultUpgBonus(82, saveData),
    win: computeWinBonus(6, { charIdx: activeCharIdx }, saveData),
    companion163: companions(163, saveData),
  };
}

export function computeSneakingExpPerAction(twinIdx, saveData, options) {
  options = options || {};
  var ninjaData = saveData.ninjaData || [];
  var nkLevels = ninjaData[103] || [];
  var olaData = saveData.olaData || [];
  var spelunkData = saveData.spelunkData || [];
  var activeCharIdx = options.activeCharIdx != null ? options.activeCharIdx : twinIdx;
  var floor = options.floor != null ? options.floor : _num(ninjaData[twinIdx] && ninjaData[twinIdx][0]);
  var mastery = options.mastery != null ? options.mastery : _num(olaData[231]);
  var playerCount = options.playerCount != null
    ? options.playerCount
    : Math.max((saveData.charNames || []).length, (saveData.lv0AllData || []).length, 1);
  var account = options.accountInputs || sneakingExpAccountInputs(saveData, activeCharIdx);
  var goldBonuses = options.goldBonuses || account.goldBonuses;
  var charmBonuses = options.charmBonuses
    || twinCharmBonuses(twinIdx, ninjaData, spelunkData, goldBonuses);

  var base = floorExpMult(floor, mastery);
  var allSkillMulti = account.allSkillMulti;
  var nk2 = nkBonus(2, nkLevels);
  var nk19 = nkBonus(19, nkLevels);
  var arcade52 = account.arcade52;
  var gold10 = _num(goldBonuses[10]);
  var compass49 = account.compass49;
  var gem4 = account.gem4;
  var vial = account.vial;
  var meal = account.meal;
  var rift = account.rift;
  var pristine = account.pristine;
  var cardLv = account.cardLv;
  var mainframe = account.mainframe;
  var stamp = account.stamp;
  var star = account.star;
  var guild14 = account.guild14;
  var talent431Add = account.talent431Add;
  var talent431Multi = account.talent431Multi;
  var achievement = account.achievement;
  var vote = account.vote;
  var vault = account.vault;
  var solo = soloMultiplier(13, twinIdx, ninjaData, playerCount);
  var charm13 = _num(charmBonuses[13]) * solo;
  var charm19 = _num(charmBonuses[19]) * solo;
  var charm3 = _num(charmBonuses[3]);
  var charm7 = _num(charmBonuses[7]);
  var charm5 = _num(charmBonuses[5]);
  var win = account.win;
  var companion163 = account.companion163;

  var sharedFactor = allSkillMulti;
  var nkFactor = (1 + nk2 / 100) * (1 + nk19 / 100);
  var simpleFactor = 1 + (vial + meal + 25 * rift + pristine + 3 * cardLv
    + mainframe + stamp + star + guild14 + talent431Add + achievement + vote + vault) / 100;
  var charmFactor = 1 + (charm13 + charm19 + charm3 + charm7) / 100;
  var noItemPenalty = Math.max(0, 1 - 100 * charm5);
  var winFactor = 1 + win / 100;
  var companionFactor = 1 + 1.5 * companion163;
  var result = base * sharedFactor * nkFactor
    * (1 + arcade52 / 100)
    * (1 + gold10 / 100)
    * (1 + compass49 / 100)
    * (1 + gem4 / 100)
    * simpleFactor * charmFactor * noItemPenalty
    * winFactor * companionFactor * talent431Multi;

  return {
    exp: result,
    base: base,
    floor: floor,
    mastery: mastery,
    recipientTwinIdx: _expRecipientTwin(twinIdx, saveData, charm3),
    factors: {
      allSkillMulti: sharedFactor,
      nk: nkFactor,
      arcade: 1 + arcade52 / 100,
      gold: 1 + gold10 / 100,
      compass: 1 + compass49 / 100,
      gemstone: 1 + gem4 / 100,
      simple: simpleFactor,
      charms: charmFactor,
      noItemPenalty: noItemPenalty,
      win: winFactor,
      companion: companionFactor,
      talent: talent431Multi,
    },
    bonuses: {
      nk2: nk2, nk19: nk19, arcade52: arcade52, gold10: gold10,
      compass49: compass49, gem4: gem4, vial: vial, meal: meal,
      rift: rift, pristine: pristine, cardLv: cardLv, mainframe: mainframe,
      stamp: stamp, star: star, guild14: guild14, talent431Add: talent431Add,
      achievement: achievement, vote: vote, vault: vault,
      charm13: charm13, charm19: charm19, charm3: charm3, charm7: charm7,
      charm5: charm5, win: win, companion163: companion163,
      talent431Multi: talent431Multi, solo: solo,
    },
  };
}

function _pctFactor(name, factor, bonusName, bonus) {
  return node(name, factor, [node(bonusName || 'Bonus', bonus, null, { fmt: '%' })], { fmt: 'x' });
}

export function computeSneakingExpPerHour(twinIdx, saveData, successfulActionsPerHour, options) {
  options = options || {};
  var detail = computeSneakingExpPerAction(twinIdx, saveData, options);
  var mode = options.actionMode || 'normal';
  var awardsExp = mode === 'normal' || mode === 'training';
  return Object.assign({}, detail, {
    actionMode: mode,
    expPerHour: awardsExp ? detail.exp * Math.max(0, _num(successfulActionsPerHour)) : 0,
  });
}

export function buildSneakingExpBreakdown(twinIdx, saveData, options) {
  var result = computeSneakingExpPerAction(twinIdx, saveData, options);
  var b = result.bonuses;
  var f = result.factors;
  var twinName = (saveData.charNames && saveData.charNames[twinIdx]) || ('Twin ' + (twinIdx + 1));
  var recipientName = (saveData.charNames && saveData.charNames[result.recipientTwinIdx])
    || ('Twin ' + (result.recipientTwinIdx + 1));
  return node(twinName + ' Sneaking EXP per Successful Action', result.exp, [
    node('Floor Base EXP', result.base, [
      node('Floor', result.floor, null, { fmt: 'raw' }),
      node('Mastery', result.mastery, null, { fmt: 'raw' }),
    ], { fmt: 'raw' }),
    node('Shared Skill EXP Multiplier', f.allSkillMulti, null, { fmt: 'x' }),
    node('Ninja Knowledge', f.nk, [
      node('Sneaking EXP', b.nk2, null, { fmt: '%' }),
      node('Mastery Sneaking EXP', b.nk19, null, { fmt: '%' }),
    ], { fmt: 'x', note: '(1 + NK 2 / 100) × (1 + NK 19 / 100)' }),
    _pctFactor('Arcade', f.arcade, 'Arcade Bonus 52', b.arcade52),
    _pctFactor('Gold Inventory: Sneaking EXP', f.gold, 'Bonus', b.gold10),
    _pctFactor('Compass: Sneaking EXP', f.compass, 'Bonus', b.compass49),
    _pctFactor('Gemstone: Sneaking EXP', f.gemstone, 'Bonus', b.gem4),
    node('Additive Account Sources', f.simple, [
      node('Sneaking EXP Vial', b.vial, null, { fmt: '%' }),
      node('Sneaking EXP Meal', b.meal, null, { fmt: '%' }),
      node('Rift Skill Bonus', 25 * b.rift, null, { fmt: '%' }),
      node('Pristine Charm', b.pristine, null, { fmt: '%' }),
      node('W6A4 Card', 3 * b.cardLv, null, { fmt: '%' }),
      node('Mainframe', b.mainframe, null, { fmt: '%' }),
      node('Sneaking EXP Stamps', b.stamp, null, { fmt: '%' }),
      node('Sneaking EXP Star Sign', b.star, null, { fmt: '%' }),
      node('Guild Bonus', b.guild14, null, { fmt: '%' }),
      node(label('Talent', 431) + ' additive bonus', b.talent431Add, null, { fmt: '%' }),
      node('Achievement 370', b.achievement, null, { fmt: '%' }),
      node('Voting Bonus', b.vote, null, { fmt: '%' }),
      node('Vault Upgrade', b.vault, null, { fmt: '%' }),
    ], { fmt: 'x', note: '1 + sum / 100' }),
    node('Equipped EXP Charms', f.charms, [
      node('Solo Sneaking EXP', b.charm13, null, { fmt: '%' }),
      node('Solo EXP + Jade', b.charm19, null, { fmt: '%' }),
      node('Highest-twin EXP transfer', b.charm3, null, { fmt: '%' }),
      node('EXP, Jade & Stealth', b.charm7, null, { fmt: '%' }),
    ], { fmt: 'x', note: 'Solo bonuses include the native 3× multiplier when applicable' }),
    node('No-item-find Penalty', f.noItemPenalty, [
      node('Item Find charm value', b.charm5, null, { fmt: 'raw' }),
    ], { fmt: 'x', note: 'max(0, 1 - 100 × Item Find charm value)' }),
    _pctFactor('Summoning Winner', f.win, 'Bonus', b.win),
    node(label('Companion', 163), f.companion, [
      node('Effective companion value', b.companion163, null, { fmt: 'raw' }),
    ], { fmt: 'x', note: '1 + 1.5 × Companions(163)' }),
    node(label('Talent', 431) + ' Multiplier', f.talent, [
      node('Best tab-2 talent value', b.talent431Multi, null, { fmt: 'x' }),
    ], { fmt: 'x', note: 'max(1, getbonus2(2, 431, -1))' }),
    node('EXP Recipient: ' + recipientName, 1, null, { fmt: 'x', note: 'Charm transfer scans Sneaking level and saved Sneaking EXP in username order' }),
  ], { fmt: 'raw', note: 'Awarded only by successful normal and training-floor Sneaking actions' });
}
