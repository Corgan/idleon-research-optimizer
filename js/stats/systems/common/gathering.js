// ===== MINING, CHOPPING AND CATCHING =====
import '../../registry.js';
import { equipOrderData, equipQtyData, foodSlotsOwnedData, attackLoadoutDataAvailable } from '../../../save/data.js';
import { ITEMS } from '../../data/game/items.js';
import { computeSkillPowerDN } from '../../defs/skill-efficiency.js';
import { computeAllSkillProwess } from '../../defs/skill-exp.js';
import { computeBoxReward, computeCardBonusByType } from './stats.js';
import { computeStarSignBonus } from './starSign.js';
import { finalBubbleValByKey } from '../w2/alchemy.js';
import { computeStampBonusOfTypeX } from '../w1/stamp.js';
import { computeRiftSkillBonus } from '../w4/rift.js';
import { cosmoBonus } from '../w5/hole.js';
import { motherlodeEffBase } from '../w5/motherlode.js';
import { mainframeBonus } from '../w4/lab.js';
import { computePrayerReal } from '../w3/prayer.js';
import { talent } from './talent.js';
import { etcBonus } from './etcBonus.js';
import { achieveStatus } from './achievement.js';
import { attackLoadoutFactor } from './combat-outcomes.js';
import { foodBonusAmount, foodBoostMultiplier } from './combat-sim-inputs.js';
import { combatAfkFood } from './combat-afk-food.js';
import { afkMonsterDropOutcomes } from './combat-afk.js';
import { getBuffBonus } from '../../defs/helpers.js';

const CONFIG = {
  Mining: { slot: 0, level: 1, card: 34, rift: 0, stamp: 'DoubleMin',
    bubble: 'MiningACTIVE', sign: 'MultiOre', box: 'MinProw' },
  Choppin: { slot: 1, level: 3, card: 37, rift: 2, stamp: 'DoubleChop',
    bubble: 'MultiLogACTIVE', sign: 'MultiLog', box: 'ChopProw' },
  Catching: { slot: 3, level: 6, card: 75, rift: 5, stamp: 'DoubleCatch',
    bubble: 'CatchingACTIVE', sign: 'MultiBug', box: 'CatchProw' },
};
const CAVERNS = { Motherlode: 0, Bug14: 1, MotherlodeTREE: 2 };

function _number(value, name) {
  const raw = value && typeof value === 'object' ? value.val ?? value.computed : value;
  if (value?.unavailable || value?.notApplicable || raw == null || raw === ''
    || !Number.isFinite(Number(raw))) throw new Error(name + ' is unavailable or invalid.');
  return Number(raw);
}

function _config(skill) {
  if (!CONFIG[skill]) throw new Error('Unsupported gathering skill: ' + skill);
  return CONFIG[skill];
}

export function gatheringHarvestChance(efficiency, defence) {
  efficiency = _number(efficiency, 'Efficiency');
  defence = _number(defence, 'Resource requirement');
  if (efficiency < 0 || defence <= 0) throw new Error('Invalid gathering efficiency or requirement.');
  const ratio = efficiency / defence;
  if (!Number.isFinite(ratio)) throw new Error('Gathering efficiency ratio exceeds numeric limits.');
  return ratio >= .25 ? Math.min(1.512 * (ratio - .0763) / (ratio + 5), 1) : 0;
}

export function gatheringSpeed(skill, { toolSpeed, level, speedBonus = 0, slowNetAchievement = 0 }) {
  _config(skill);
  toolSpeed = _number(toolSpeed, 'Tool speed');
  level = _number(level, 'Skill level');
  speedBonus = _number(speedBonus, 'Speed bonus');
  slowNetAchievement = _number(slowNetAchievement, 'Slow-net achievement');
  if (level < 0 || toolSpeed < 0 || speedBonus <= -100) throw new Error('Invalid gathering speed inputs.');
  const reduction = .9 * Math.pow(level, .5) / (Math.pow(level, .5) + 250) + .6 * level / (level + 40);
  const base = toolSpeed < 3 ? 5.7 + Math.pow(4 - toolSpeed, 2.2) - reduction
    : 5.7 - (.2 * Math.pow(toolSpeed, 1.3) + reduction);
  return skill === 'Catching'
    ? Math.max(base, .57) * (2 / (1 + (speedBonus + (toolSpeed < 3 ? slowNetAchievement : 0)) / 100))
    : Math.max(base / (1 + speedBonus / 100), .57);
}

export function gatheringMultiOre(skill, { power, level, stamp = 0, extra = 0,
  bubble = 0, starSign = 0, capBonus = 0 }) {
  _config(skill);
  power = _number(power, 'Power');
  level = _number(level, 'Level');
  stamp = _number(stamp, 'Stamp');
  extra = _number(extra, 'Extra multi-resource bonus');
  bubble = _number(bubble, 'Active bubble');
  starSign = _number(starSign, 'Star sign');
  capBonus = _number(capBonus, 'Cap bonus');
  if (power < 0 || level < 0 || capBonus < 0) throw new Error('Invalid gathering power, level or cap.');
  const root = Math.pow(power, .5);
  const amount = skill === 'Mining'
    ? stamp + 100 * (root / (10 * root + 50) + (.1 * level / (level + 40) + extra / 100)) + (bubble + starSign)
    : stamp + (skill === 'Choppin' ? extra : 0)
      + 100 * (root / (4 * root + 50) + .15 * level / (level + 40)) + (bubble + starSign);
  const result = Math.min((bubble < 20 ? 100 : 300) + capBonus, amount);
  if (!Number.isFinite(result) || result < 0) throw new Error('Invalid multi-resource result.');
  return result;
}

export function gatheringOutcome(skill, inputs, seconds = 3600) {
  _config(skill);
  seconds = _number(seconds, 'Claim seconds');
  if (seconds <= 120 || seconds > 2e8) throw new Error('Gathering claims require more than 120 seconds.');
  let { efficiency, defence, prowess, multiOre, speed, afkRate, expMulti, expBase,
    attackFactor = 1, chopBuff = 0, prayerCap = false } = inputs;
  efficiency = _number(efficiency, 'Efficiency');
  defence = _number(defence, 'Requirement');
  prowess = _number(prowess, 'Prowess');
  multiOre = _number(multiOre, 'Multi-resource');
  speed = _number(speed, 'Speed');
  afkRate = _number(afkRate, 'AFK rate');
  expMulti = _number(expMulti, 'EXP multiplier');
  expBase = _number(expBase, 'Base EXP');
  attackFactor = _number(attackFactor, 'Attack factor');
  chopBuff = _number(chopBuff, 'Chopping buff');
  if (speed <= 0 || afkRate < 0 || expMulti < 0 || expBase < 0 || prowess < 0
    || multiOre < -100 || chopBuff < -100) throw new Error('Invalid gathering outcome inputs.');
  const chance = gatheringHarvestChance(efficiency, defence);
  const attempts = skill === 'Mining' && chance <= .05 ? 0
    : Math.round(3600 / (speed + .4) * chance
      * (skill === 'Mining' ? Math.max(Math.min(attackFactor, 3), 1) : 1)
      / (skill === 'Catching' ? 1 : 1.15));
  const perHarvest = Math.floor(Math.max(Math.pow(efficiency / (10 * defence), .25 + prowess), 1)
    * (skill === 'Choppin' ? 1 + chopBuff / 100 : 1));
  const creditedSeconds = prayerCap ? Math.min(Math.round(seconds), 36000) : Math.round(seconds);
  const hours = creditedSeconds / 3600;
  const rawPerHour = attempts * afkRate * (1 + multiOre / 100) * perHarvest;
  const exp = hours * attempts * afkRate * expBase * expMulti;
  if (![attempts, perHarvest, rawPerHour, exp].every(Number.isFinite))
    throw new Error('Gathering outcome exceeds finite numeric limits.');
  return { chance, attempts, perHarvest, rawPerHour, itemsPerHour: Math.floor(rawPerHour),
    items: Math.floor(hours * Math.floor(rawPerHour)), exp: exp < 2e9 ? Math.floor(exp) : exp,
    expPerHour: attempts * afkRate * expBase * expMulti, hours, creditedSeconds };
}

export function gatheringClaim(skill, inputs, seconds, values, tables, options = {}) {
  const result = gatheringOutcome(skill, inputs, seconds);
  const food = combatAfkFood(result.creditedSeconds, values,
    () => ({ ...inputs, rawKillsPerHour: 0, percent: 100 }), { skill });
  // Native gathering ignores FoodUseCoeffzz and keeps the SkillStats cache.
  const dropBatch = Math.floor(result.hours * result.attempts * inputs.afkRate);
  if (options.includeDrops === false) return { ...result, dropBatch, drops: null, food };
  const drops = afkMonsterDropOutcomes(dropBatch, inputs.target, { ...values, overkillActive: 0 }, tables)
    .filter(row => row.key !== 'COIN');
  return { ...result, dropBatch, drops, food };
}

export function gatheringCavernDeposit(S, key, quantity) {
  const type = key === 'Fish14' ? 3 : CAVERNS[key];
  if (type == null) return null;
  quantity = _number(quantity, 'Picked cavern resource quantity');
  const progressBefore = _number(S.holesData?.[11]?.[2 * type], 'Saved cavern progress');
  if (quantity < 0 || progressBefore < 0) throw new Error('Invalid cavern resource deposit.');
  const progressAfter = progressBefore + quantity;
  const lifetimeBefore = type === 0
    ? _number(S.holesData?.[11]?.[32], 'Saved lifetime Motherlode collection') : null;
  const lifetimeAfter = lifetimeBefore == null ? null : lifetimeBefore + quantity;
  if (!Number.isFinite(progressAfter) || (lifetimeAfter != null && !Number.isFinite(lifetimeAfter)))
    throw new Error('Cavern resource deposit exceeds finite numeric limits.');
  return { type, quantity, progressBefore, progressAfter, lifetimeBefore, lifetimeAfter };
}

export function gatheringInputs(S, ci, resource, ctx, { boostFoodEffect } = {}) {
  const { skill, key } = resource, config = _config(skill);
  const level = _number(S.lv0AllData?.[ci]?.[config.level], 'Saved ' + skill + ' level');
  const tool = equipOrderData[ci]?.[1]?.[config.slot];
  if (tool == null) throw new Error('Saved gathering tool slot is missing.');
  const toolSpeed = tool === 'Blank' ? 0 : _number(ITEMS[tool]?.Speed, 'Saved tool speed');
  const read = (value, name) => _number(value, name);
  const slots = read(foodSlotsOwnedData[ci], 'Saved food slots');
  if (!Number.isInteger(slots) || slots < 0 || slots > 20) throw new Error('Saved food slot count is invalid.');
  for (let slot = 0; slot < slots; slot++) {
    if (equipOrderData[ci]?.[2]?.[slot] == null) throw new Error('Saved food item slot is missing.');
    const quantity = read(equipQtyData[ci]?.[2]?.[slot], 'Saved food quantity');
    if (quantity < 0) throw new Error('Saved food quantity is invalid.');
  }
  if (skill === 'Mining' && !attackLoadoutDataAvailable[ci])
    throw new Error('Saved Mining attack loadout is missing.');
  const speedBonus = foodBonusAmount(ci, skill + 'SpeedBoosts',
    read(boostFoodEffect ?? foodBoostMultiplier(S, ci, ctx), 'Boost food effect'))
    + (read(computeCardBonusByType(config.card, ci, S, {
      passive: computeRiftSkillBonus(config.rift, 2, S) > 0 }), 'Skill speed cards')
      + (read(talent.resolve(637, ctx), 'Talent 637')
        + (read(etcBonus.resolve('61', ctx), 'Equipment skill speed')
          + Math.round(read(mainframeBonus(112, S), 'Lab jewel skill speed') / 20))));
  const power = read(computeSkillPowerDN(skill, ci, ctx), 'Skill power');
  const multiOre = gatheringMultiOre(skill, {
    power, level, stamp: read(computeStampBonusOfTypeX(config.stamp, S, ci), 'Multi-resource stamp'),
    extra: skill === 'Choppin' ? read(etcBonus.resolve('6', ctx), 'Extra multi-log')
      : skill === 'Mining' ? read(talent.resolve(102, ctx), 'Mining multi-ore talent') : 0,
    bubble: read(finalBubbleValByKey(config.bubble, ci, S), 'Active gathering bubble'),
    starSign: read(computeStarSignBonus(config.sign, ci, S), 'Multi-resource star signs'),
    capBonus: read(cosmoBonus(S, 2, 2), 'Multi-resource cap'),
  });
  const box = read(computeBoxReward(ci, config.box), 'Skill prowess box');
  const cavern = CAVERNS[key];
  if (cavern != null && S.holesData?.length) {
    const depth = _number(S.holesData[11]?.[1 + 2 * cavern], 'Saved cavern depth');
    if (!Number.isInteger(depth) || depth < 0) throw new Error('Saved cavern depth is invalid.');
  }
  return {
    efficiency: read(ctx.resolve('skill-efficiency'), 'Skill efficiency'),
    defence: cavern != null && S.holesData?.length ? motherlodeEffBase(S, cavern) : resource.defence,
    prowess: box / 100 * .1 / (box / 100 + 10) + read(computeAllSkillProwess(ci, ctx), 'Shared skill prowess'),
    multiOre, speed: gatheringSpeed(skill, { toolSpeed, level, speedBonus,
      slowNetAchievement: skill === 'Catching' ? Math.min(5, 5 * read(achieveStatus(113, S), 'Achievement 113')) : 0 }),
    afkRate: read(ctx.resolve('skill-afk'), 'Skill AFK rate'),
    expMulti: read(ctx.resolve('skill-exp'), 'Skill EXP multiplier'), expBase: resource.exp,
    attackFactor: skill === 'Mining' ? read(attackLoadoutFactor('D', 1, ci, ctx), 'Mining AFK attacks') : 1,
    prayerCap: read(computePrayerReal(2, 1, ci, S), 'Prayer claim cap') > 2,
    chopBuff: skill === 'Choppin' ? read(getBuffBonus(460, 2, ci, ctx), 'Saved chopping yield buff') : 0,
    target: key,
  };
}
