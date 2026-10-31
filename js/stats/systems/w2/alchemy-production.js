// ===== ALCHEMY PRODUCTION (W2) =====

import { cauldronInfoData, optionsListData, skillLvData, dreamData } from '../../../save/data.js';
import { eventShopOwned } from '../../../game-helpers.js';
import { formulaEval } from '../../../formulas.js';
import { cauldronPayToWinParams } from '../../data/w2/alchemy.js';
import { companionBonusForSave } from '../../data/common/companions.js';
import { createStatContext } from '../../stat-context.js';
import { finalBubbleValByKey, computeVialByKey, sigilBonus } from './alchemy.js';
import { arcadeBonus } from './arcade.js';
import { computeStampBonusOfTypeX } from '../w1/stamp.js';
import { computeMealBonus, computeBoxReward, computeStatueBonusGiven } from '../common/stats.js';
import { computeStarSignBonus } from '../common/starSign.js';
import { talent } from '../common/talent.js';
import { guild } from '../common/guild.js';
import { mainframeBonus } from '../w4/lab.js';
import { computeRiftSkillBonus } from '../w4/rift.js';
import { computeSaltLick } from '../w3/construction.js';
import { mineheadBonusQTY } from '../w7/minehead.js';
import { legendPTSbonus, shopUpgBonus, computePaletteBonus } from '../w7/spelunking.js';
import { computeMeritocBonusz } from '../w7/meritoc.js';
import { zenithMarketPerLevel } from '../../data/w5/sailing.js';
import { computeWinBonus } from '../w6/summoning.js';
import { rogBonusQTY } from '../w7/sushi.js';
import { achieveStatus } from '../common/achievement.js';
import { vaultUpgBonus } from '../common/vault.js';
import { votingBonusz } from './voting.js';
import { talentParams } from '../../data/common/talent.js';
import { computeAllSkillxpz } from '../../defs/skill-helpers.js';
import { etcBonus } from '../common/etcBonus.js';

export function bubbleUpgradeLevelDistribution(bonus, particles = false) {
  bonus = _savedNumber(bonus, 'Processed bubble upgrade bonus');
  const counts = new Map();
  for (let roll = 1; roll <= 100; roll++) {
    const success = roll < bonus - 100 * Math.floor(bonus / 100);
    const levels = Math.max(1, Math.round(success ? 1 + Math.ceil(bonus / 100)
      : particles ? 1 + Math.floor(bonus / 100) : Math.ceil(bonus / 100)));
    counts.set(levels, (counts.get(levels) || 0) + 1);
  }

  const outcomes = [...counts].sort((a, b) => a[0] - b[0])
    .map(([levels, count]) => ({ levels, chance: count / 100 }));
  return { outcomes, minimum: outcomes[0].levels,
    mean: outcomes.reduce((sum, row) => sum + row.levels * row.chance, 0) };
}

export function alchemyActiveEffects(S, charIdx = 0, cooldownSeconds) {
  const ctx = createStatContext({ saveData: S, charIdx });
  const bonus = _savedNumber(Number(finalBubbleValByKey('AlchemyACTIVE', charIdx, S)), 'Alchemy active bonus');
  const t1 = _savedNumber(talent.resolve(490, ctx).val, 'Cauldron talent effect');
  const t2 = _savedNumber(talent.resolve(490, ctx, { tab: 2 }).val, 'Cauldron talent duration');
  const cookTime = _savedNumber(computeBoxReward(charIdx, 'CookTime').val, 'Cauldron Post Office duration');
  const reduction = 1 + (_savedNumber(talent.resolve(289, ctx).val, 'Cooldown talent')
    + _savedNumber(computeBoxReward(charIdx, 'cooldown').val, 'Post Office cooldown')) / 100;
  const cooldown = _savedNumber(cooldownSeconds, 'Base Cauldron cooldown');
  const baseCooldown = Math.ceil(cooldown / reduction);
  const actorCooldownScale = Math.max(1 - bonus / 100, .2);
  const queueCooldown = Math.ceil(baseCooldown / (1 + bonus / 100));
  return {
    secondsPerKill: t1 * (1 + bonus / 100),
    duration: (t2 + cookTime) * (1 + Math.min(bonus, 75) / 100),
    manualQueueCooldown: queueCooldown,
    manualCooldown: queueCooldown,
    autoCooldown: queueCooldown,
    actorCooldownScale,
  };
}

export function krukDailyBubbleLevels(S, charIdx = 0) {
  const floor = _savedNumber(S.stateR7Available ? S.stateR7?.[4] : null, 'Saved Minehead floor');
  const zenith = Math.floor(zenithMarketPerLevel(4) * (Number(S.spelunkData?.[45]?.[4]) || 0));
  return Math.floor(mineheadBonusQTY(15, floor)
    + (20 + (computeStampBonusOfTypeX('krukd', S) + (legendPTSbonus(5, S) + zenith)))
      * (1 + computeMeritocBonusz(3, S, charIdx) / 100)
      * (1 + .5 * eventShopOwned(31, S.eventShopStr))
      * (1 + (Number(finalBubbleValByKey('Y12', charIdx, S))
        + (arcadeBonus(61, S) + shopUpgBonus(47, S))) / 100));
}

function _savedNumber(value, name, minimum = 0) {
  if (value == null || value === '' || !Number.isFinite(Number(value)) || Number(value) < minimum)
    throw new Error(name + ' is missing or invalid.');
  return Number(value);
}

function _p2w(S, group, index, slot) {
  const params = cauldronPayToWinParams(group, slot);
  const stride = group === 0 ? 3 : 2;
  const at = group < 2 ? stride * index + slot : index;
  const level = _savedNumber(S.cauldronP2WData?.[group]?.[at], 'Alchemy pay-to-win level', -1);
  return Math.max(0, formulaEval(params.formula, params.x1, params.x2, level, 0, 0));
}

export function alchemyBrewSpeed(S, charIdx = 0, cauldron = null, activeCharIdx = charIdx) {
  if (cauldron !== null && (!Number.isInteger(cauldron) || cauldron < 0 || cauldron > 3))
    throw new Error('Choose a valid brewing cauldron.');
  const level = _savedNumber(S.lv0AllData?.[charIdx]?.[5], 'Character Alchemy level');
  const ctx = createStatContext({ saveData: S, charIdx: activeCharIdx });
  const wisResult = charIdx === activeCharIdx ? ctx.resolve('total-wis') : null;
  if (wisResult?.unavailable) throw new Error(wisResult.reason || 'Character Wisdom is unavailable.');
  const wis = wisResult ? wisResult.val : _savedNumber(S.statListData?.[charIdx]?.[2], 'Off-character saved Wisdom');
  const wisBonus = wis < 1000 ? (Math.pow(wis + 1, .37) - 1) / 40
    : (wis - 1000) / (wis + 2500) * .5 + .297;
  let perLevel = _p2w(S, 3, 0, 0) * level;
  if (charIdx === activeCharIdx) {
    const townSpeed = talent.resolve(269, ctx).val + computeStarSignBonus('TownSkillSpd', activeCharIdx, S);
    perLevel *= 1 + wisBonus / .6;
    perLevel *= 1 + (talent.resolve(491, ctx).val + townSpeed) / 100;
  } else {
    const rawTalent = _savedNumber(skillLvData[charIdx]?.[491], 'Off-character saved talent 491');
    perLevel *= (1 + rawTalent / 100) * (1 + wisBonus / .6);
  }
  let speed = Math.round(Math.pow(level, .8))
    * (1 + (computeStampBonusOfTypeX('AlchSpd', S) + guild.resolve(5, ctx).val
      + (Number(finalBubbleValByKey('BrewSpd', activeCharIdx, S)) + computeBoxReward(activeCharIdx, 'BrewSpeed').val)) / 100)
    * (1 + perLevel / 100) * (1 + companionBonusForSave(46, S) / 100);
  if (cauldron === null) return speed;
  const brewLevel = _savedNumber(cauldronInfoData[8]?.[cauldron]?.[0]?.[1], 'Cauldron speed-upgrade level');
  let specific = (1 + Number(computeVialByKey(
    ['OrangeBrew', 'GreenBrew', 'PurpleBrew', 'YellowBrew'][cauldron], S, activeCharIdx)) / 100)
    * (1 + _p2w(S, 0, cauldron, 0) / 100);
  const boosts = optionsListData[32];
  if (boosts == null) throw new Error('Cauldron boost selections are missing.');
  if (String(boosts).charAt(cauldron) === '1') specific = 1.5 * specific;
  specific = (1 + Math.round(5 * brewLevel) / 100) * specific;
  return speed * specific;
}

export function alchemySigilSpeed(S, charIdx = 0) {
  if (S.olaData !== optionsListData) S = { ...S, olaData: optionsListData };
  const vote = S.activeVoteIdx === 17
    ? createStatContext({ saveData: S, charIdx }).resolve('voting-multi').val : 1;
  return (1 + (achieveStatus(112, S) + (sigilBonus(12, S, charIdx)
    + (20 * (Number(S.gemItemsData?.[110]) || 0)
      + (Number(computeVialByKey('SigSpd', S, charIdx)) + computeStampBonusOfTypeX('SigilCharge', S))))) / 100)
    * (1 + computeWinBonus(7, { charIdx, accountOptions: optionsListData }, S) / 100)
    * (1 + rogBonusQTY(41, S) / 100)
    * (1 + arcadeBonus(43, S) / 100)
    * (1 + Number(computeVialByKey('6turtle', S, charIdx)) / 100)
    * (1 + votingBonusz(17, vote, S) / 100)
    * (1 + computePaletteBonus(20, S) / 100)
    * (1 + legendPTSbonus(31, S) / 100);
}

export function alchemyResearchSpeed(S, worker, charIdx = 0) {
  if (!Number.isInteger(worker) || worker < 0) throw new Error('Choose a valid Alchemy worker.');
  const assignment = _savedNumber(S.cauldronJobsData?.[1]?.[worker], 'Saved Alchemy job', -1);
  if (!Number.isInteger(assignment)) throw new Error('Saved Alchemy job is invalid.');
  if (assignment === -1) return 0;
  if (assignment > 99.9) return Math.round(10 * alchemySigilSpeed(S, charIdx)) / 10;
  if (assignment > 3) {
    const level = _savedNumber(S.lv0AllData?.[worker]?.[5], 'Character Alchemy level');
    return Math.pow(2 * (level + 2), .65);
  }
  return alchemyBrewSpeed(S, worker, null, charIdx);
}

export function alchemyExpMultiplier(S, charIdx = 0) {
  const ctx = createStatContext({ saveData: S, charIdx });
  const assignments = S.cauldronJobsData?.[1];
  const ownJob = _savedNumber(assignments?.[charIdx], 'Saved Alchemy job', -1);
  const params = talentParams(493);
  let sharedTalent = 0;
  for (let ci = 0; ci < _accountLevels(S).length; ci++) {
    if (ci === charIdx) sharedTalent += talent.resolve(493, ctx).val;
    else if (_savedNumber(assignments?.[ci], 'Saved Alchemy job', -1) + 1 === ownJob + 1) {
      const rawLevel = _savedNumber(skillLvData[ci]?.[493], 'Off-character saved talent 493');
      sharedTalent += formulaEval(params.formula, params.x1, params.x2, rawLevel, 0, 0);
    }
  }
  return 1 + computeAllSkillxpz(charIdx, ctx) / 100
    + (_p2w(S, 3, 1, 0) + (computeStampBonusOfTypeX('AlchExp', S)
      + (talent.resolve(75, ctx).val + (computeBoxReward(charIdx, 'AlchEXP').val
        + computeStatueBonusGiven(12, charIdx, S)) + etcBonus.resolve(98, ctx).val))
      + (talent.resolve(492, ctx).val + (sharedTalent + 25 * computeRiftSkillBonus(4, 0, S)))
      + (Number(finalBubbleValByKey('ChopAlchEXP', charIdx, S))
        + (Number(finalBubbleValByKey('AlchemyACTIVE', charIdx, S)) + vaultUpgBonus(28, S)))) / 100;
}

export function alchemyWorkerProduction(S, worker, charIdx = 0) {
  const speed = alchemyResearchSpeed(S, worker, charIdx);
  const assignment = Number(S.cauldronJobsData[1][worker]);
  return { assignment, speed, expPerHour: assignment === -1 ? 0
    : 15 * alchemyExpMultiplier(S, charIdx) * (assignment > 3 ? 2 : 1) * speed };
}

function _workers(S, cauldron, slots) {
  return Array.from({ length: slots }, (_, slot) => {
    const worker = _savedNumber(S.cauldronJobsData?.[0]?.[cauldron]?.[slot], 'Saved cauldron worker slot', -1);
    if (!Number.isInteger(worker)) throw new Error('Saved cauldron worker slot is invalid.');
    return worker;
  });
}

export function alchemyAssignedBrewPerHour(S, cauldron, charIdx = 0) {
  if (!Number.isInteger(cauldron) || cauldron < 0 || cauldron > 3)
    throw new Error('Choose a valid brewing cauldron.');
  let total = 0;
  for (const worker of _workers(S, cauldron, 8)) {
    if (worker === -1) continue;
    total += alchemyBrewSpeed(S, worker, cauldron, charIdx);
  }
  return total;
}

export function alchemyLiquidPerHour(S, liquid, charIdx = 0) {
  if (!Number.isInteger(liquid) || liquid < 0 || liquid > 3)
    throw new Error('Choose a valid Alchemy liquid.');
  const levels = _accountLevels(S);
  let base = Math.max(...levels) >= [0, 20, 35, 120][liquid]
    ? Math.round(2 * _savedNumber(cauldronInfoData[8]?.[liquid + 4]?.[3]?.[1], 'Liquid speed-upgrade level'))
      + _p2w(S, 1, liquid, 0) : 0;
  base += Number(computeVialByKey('LiquidRegen', S, charIdx));
  let workers = 0;
  for (const worker of _workers(S, liquid + 4, 4))
    if (worker !== -1) workers += alchemyResearchSpeed(S, worker, charIdx);
  const purchased = _savedNumber(S.gemItemsData?.[106], 'Liquid-cauldron Gem Shop purchases') > liquid;
  const bundle = _savedNumber(optionsListData[123], 'Liquid-cauldron bundle purchases') > liquid;
  const vote = S.activeVoteIdx === 12
    ? createStatContext({ saveData: S, charIdx }).resolve('voting-multi').val : 1;
  return (purchased ? bundle ? 1.9500000000000002 : 1.5 : 1)
    * (1 + base / 100)
    * (1 + (workers + (computeStampBonusOfTypeX('LiquidSpd', S)
      + (computeSaltLick(5, S) + (sigilBonus(20, S, charIdx) + vaultUpgBonus(38, S))))) / 100)
    * (1 - 7.5 * (mainframeBonus(6, S) - 1) / 100)
    * (1 + votingBonusz(12, vote, S) / 100);
}

export function alchemyLiquidBatch(S, liquid, charIdx = 0, seconds = 0) {
  if (!Number.isInteger(liquid) || liquid < 0 || liquid > 3)
    throw new Error('Choose a valid Alchemy liquid.');
  seconds = _savedNumber(seconds, 'Alchemy credited seconds');
  const before = _savedNumber(cauldronInfoData[6]?.[liquid], 'Saved Alchemy liquid balance');
  const capacity = _savedNumber(alchemyLiquidCapacity(S, liquid, charIdx), 'Alchemy liquid capacity');
  const rate = _savedNumber(alchemyLiquidPerHour(S, liquid, charIdx), 'Alchemy liquid generation rate');
  const generated = rate * seconds / 3600;
  const projected = before + generated;
  if (!Number.isFinite(projected)) throw new Error('Alchemy liquid batch is nonfinite.');
  const after = seconds > 0 ? Math.max(0, Math.min(capacity, projected)) : before;
  const overflow = seconds > 0 ? Math.max(0, projected - capacity) : 0;
  const unlocked = Math.max(..._accountLevels(S)) >= [0, 20, 35, 80][liquid];
  let spillProgress = 0, spillUnavailable = '';
  if (overflow > 0 && unlocked) {
    const dream = dreamData[5];
    if (dream == null || dream === '' || !Number.isFinite(Number(dream)) || Number(dream) < 0) {
      spillProgress = null;
      spillUnavailable = 'Saved Dream overflow-conversion level is missing or invalid.';
    } else {
      spillProgress = 9 * Number(dream) / 100 * (generated - capacity + before);
      if (!Number.isFinite(spillProgress)) throw new Error('Alchemy overflow progress is nonfinite.');
    }
  }
  return { before, capacity, generated, after, change: after - before, overflow,
    spillProgress, spillUnavailable,
    capacityProgress: spillProgress === null ? null : spillProgress / 2,
    speedProgress: spillProgress === null ? null : spillProgress / 2 };
}

function _accountLevels(S) {
  const count = Math.max(S.charNames?.length || 0,
    (S.lv0AllData?.findLastIndex(row => row?.length) ?? -1) + 1);
  if (!count) throw new Error('Account Alchemy levels are missing.');
  return Array.from({ length: count }, (_, ci) =>
    _savedNumber(S.lv0AllData?.[ci]?.[5], 'Character Alchemy level'));
}

export function alchemyLiquidCapacity(S, liquid, charIdx = 0) {
  if (!Number.isInteger(liquid) || liquid < 0 || liquid > 3)
    throw new Error('Choose a valid Alchemy liquid.');
  // The loader pads to ten characters even on smaller accounts.
  const levels = _accountLevels(S);
  const highest = Math.max(...levels);
  if (highest < [0, 20, 35, 80][liquid]) return 0;
  let total = 0;
  for (const level of levels) total += level;
  const upgrade = Math.round(_savedNumber(cauldronInfoData[8]?.[liquid + 4]?.[2]?.[1],
    'Liquid capacity-upgrade level'));
  const salt = computeSaltLick(5, S);
  let purchases = _savedNumber(S.gemItemsData?.[106], 'Liquid-cauldron Gem Shop purchases') > liquid
    ? .5 + salt / 100 : 0;
  if (_savedNumber(optionsListData[123], 'Liquid-cauldron bundle purchases') > liquid)
    purchases = purchases === 0 ? 1 : salt / 100 + 2;
  const bubble = Number(finalBubbleValByKey('LqdCap', charIdx, S)) * Math.max(Math.pow(total / 25, .3), 0);
  const paid = _p2w(S, 1, liquid, 1);
  const stamp = computeStampBonusOfTypeX('LiquidCap', S);
  const arcade = Math.ceil(arcadeBonus(7, S));
  const vial = liquid < 3 ? Number(computeVialByKey('Liquid' + (liquid + 1) + 'Cap', S, charIdx)) : 0;
  const multi = (1 + (purchases + (computeMealBonus(liquid < 2 ? 'Liquid12' : 'Liquid34', S, charIdx)
    + 5 * computeRiftSkillBonus(4, 1, S)) / 100)) * mainframeBonus(6, S);
  // The four native branches group their additive pools differently.
  if (liquid === 0) return multi * (10 + (upgrade + (vial + (paid + (bubble + (stamp + arcade))))));
  if (liquid === 1) return multi * (10 + upgrade + (vial + (paid + (bubble + (stamp + arcade)))));
  if (liquid === 2) return multi * (10 + upgrade + (paid + bubble + (stamp + (arcade + vial))));
  return multi * (10 + (upgrade + (paid + bubble + (stamp + arcade))));
}
