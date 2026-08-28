// ===== COMBAT MAP OUTCOMES =====

import { MONSTERS } from '../../data/game/monsters.js';
import { ATTACKS } from '../../data/game/attacks.js';
import { TalentIconNames } from '../../data/game/customlists.js';
import { mapMonsterCount, mapTravelDistance } from '../../data/common/maps.js';
import {
  attackLoadoutData,
  attackLoadoutDataAvailable,
  buffsActiveData,
  combatAfkInputDataAvailable,
  equipOrderData,
  foodSlotsOwnedData,
  skillLvData,
} from '../../../save/data.js';
import { ITEMS } from '../../data/game/items.js';
import { classifyMap, selectedMapTarget } from './map-access.js';
import { talent } from './talent.js';
import { etcBonus } from './etcBonus.js';
import { bubbleValByKey } from '../w2/alchemy.js';
import { computePrayerReal } from '../w3/prayer.js';
import { computeMealBonus, computeBoxReward } from './stats.js';
import { computeStatueBonusGiven } from './stats.js';
import { computeChipBonus } from '../w4/lab.js';
import { computeBUpg } from '../w5/hole.js';
import { computeBigFishBonus } from '../w7/spelunking.js';
import { achieveStatus } from './achievement.js';
import { shrine } from '../w3/construction.js';
import { computeStarSignBonus } from './starSign.js';
import { computeStampBonusOfTypeX } from '../w1/stamp.js';
import { computeCardSetBonus } from './cards.js';
import { goldFoodBonuses } from './goldenFood.js';
import { mapIncomingAttacksPerHour } from '../../data/common/maps.js';
import { MonsterDrops } from '../../data/game/custommaps.js';

function _isCglunkoMap(saveData, charIdx, mapIdx) {
  return Number(mapIdx) === 216
    && Number(saveData?.holesData?.[0]?.[charIdx]) === 17;
}

export function combatTarget(saveData, charIdx, mapIdx, opts) {
  opts = opts || {};
  var idx = Number(mapIdx);
  var classification = classifyMap(idx);
  var cglunko = _isCglunkoMap(saveData, charIdx, idx);
  var applicable = classification.category === 'combat' || cglunko;
  var reason = '';

  if (!applicable) {
    if (classification.category === 'boss') reason = 'Boss enemy stats are runtime-only.';
    else if (classification.category === 'dungeon') reason = 'Dungeon enemy and run stats are runtime-only.';
    else if (classification.category === 'colosseum') reason = 'Colosseum enemy state is runtime-only.';
    else reason = 'The selected map is not a normal fighting context.';
  }

  var hasOverride = Object.prototype.hasOwnProperty.call(opts, 'afkTarget');
  var key = hasOverride ? String(opts.afkTarget || '') : selectedMapTarget(idx);
  if (cglunko && !hasOverride) key = 'Nothing';
  var monster = key ? MONSTERS[key] : null;
  if (applicable && !monster) {
    applicable = false;
    reason = 'The selected map has no target monster metadata.';
  }

  return {
    applicable: applicable,
    reason: reason,
    mapIdx: idx,
    classification: classification,
    cglunko: cglunko,
    key: key,
    monster: monster,
    name: monster ? String(monster.Name || key).replace(/_/g, ' ') : '',
    hp: monster ? Number(monster.MonsterHPTotal) || 0 : 0,
    defence: monster ? Number(monster.Defence) || 0 : 0,
    type: 'Monster',
  };
}

export function combatMapApplicability(ctx, opts) {
  var target = combatTarget(ctx && ctx.saveData, Number(ctx && ctx.charIdx) || 0,
    Number(ctx && ctx.mapIdx) || 0, opts);
  return target.applicable ? true : { applicable: false, reason: target.reason };
}

export function computeHitChance(accuracy, defence, targetType) {
  var ratio = (Number(accuracy) || 0) / Math.max(Number(defence) || 0, 1);
  var chance;
  if (targetType === 'Monster') {
    chance = ratio < 0.5 ? 0 : Math.min(100 * (0.95 * ratio - 0.425), 100);
  } else {
    chance = ratio < 0.25 ? 0 : Math.min(600 * (ratio - 0.174) / (ratio + 8.87), 100);
  }
  return Math.floor(Math.max(0, chance));
}

export function accuracyRequiredForGuaranteedHit(defence, targetType) {
  var ratio = targetType === 'Monster' ? 1.5 : 1.9828;
  return Math.floor(Math.max(0, Number(defence) || 0) * ratio) + 1;
}

function _value(result) {
  if (result && typeof result === 'object' && result.val != null) return Number(result.val) || 0;
  return Number(result) || 0;
}

function _resolverValue(resolver, id, ctx, args) {
  try { return _value(resolver.resolve(id, ctx, args)); } catch(e) { return 0; }
}

export function attackLoadoutFactor(kind, activity, charIdx, ctx, opts) {
  opts = opts || {};
  var rows = opts.loadout || attackLoadoutData[charIdx] || [];
  var levels = opts.skillLevels || skillLvData[charIdx] || {};
  var factor = 1;
  var attacks = [];

  for (var rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    var row = Array.isArray(rows[rowIdx]) ? rows[rowIdx] : [];
    for (var slotIdx = 0; slotIdx < row.length; slotIdx++) {
      var rawId = row[slotIdx];
      if (rawId == null || String(rawId).toLowerCase() === 'null') continue;
      var talentIdx = Number(rawId);
      var attackName = TalentIconNames[talentIdx];
      var attack = ATTACKS[attackName];
      if (!attack || Number(attack.AFKactivity) !== Number(activity)) continue;
      var field = Number(attack[kind]);
      if (!Number.isFinite(field) || field === 1) continue;
      var rawLevel = Number(levels[talentIdx]) || 0;
      var levelMultiplier = 1 + Math.min(1, rawLevel / (rawLevel + 100));
      var contribution = field * levelMultiplier;
      factor *= contribution;
      attacks.push({
        talentIdx: talentIdx,
        name: attackName,
        row: rowIdx,
        slot: slotIdx,
        rawLevel: rawLevel,
        base: field,
        levelMultiplier: levelMultiplier,
        contribution: contribution,
      });
    }
  }

  var sourceFactor = factor;
  if (kind === 'D') {
    var talent624 = _resolverValue(talent, 624, ctx);
    var attackAfk = Number(activity) === 0
      ? _value(bubbleValByKey('AttackAfk', charIdx, ctx.saveData)) : 0;
    var attackBonusMultiplier = 1 + (Math.min(talent624, 25) + Math.min(attackAfk, 25)) / 100;
    factor *= attackBonusMultiplier;

    var talentMultiplier = 1;
    if (Number(activity) === 0) {
      var extraTalents = _resolverValue(talent, 18, ctx, { tab: 2 })
        + _resolverValue(talent, 33, ctx)
        + _resolverValue(talent, 93, ctx)
        + _resolverValue(talent, 274, ctx)
        + _resolverValue(talent, 304, ctx);
      talentMultiplier = 1 + extraTalents / 100;
      factor *= talentMultiplier;
    }
    return {
      val: factor,
      sourceFactor: sourceFactor,
      attackBonusMultiplier: attackBonusMultiplier,
      talentMultiplier: talentMultiplier,
      attacks: attacks,
    };
  }

  return { val: factor, sourceFactor: sourceFactor, attacks: attacks };
}

export function actionWaitTimeAfk(charIdx, ctx, opts) {
  opts = opts || {};
  var saveData = ctx.saveData;
  var weaponName = opts.weaponName != null
    ? opts.weaponName
    : equipOrderData[charIdx]?.[0]?.[1];
  var weapon = ITEMS[weaponName];
  var speed = Number(opts.weaponSpeed != null ? opts.weaponSpeed : weapon && weapon.Speed) || 0;
  var level = Number(opts.characterLevel != null
    ? opts.characterLevel
    : saveData.lv0AllData?.[charIdx]?.[0]) || 0;

  if (level < 25) {
    speed = Math.min(13, speed + (75 - level) / 25 * 1.8);
  } else {
    var activeBuffs = opts.buffs || buffsActiveData[charIdx] || [];
    var hasBuff135 = activeBuffs.some(function(buff) {
      return Number(buff && (buff[0] != null ? buff[0] : buff['0'])) === 135;
    });
    if (hasBuff135) speed = Math.min(13, speed + 2);
  }

  var attackSpeedPct = _resolverValue(etcBonus, '56', ctx)
    + _value(computeMealBonus('AtkSpd', saveData, charIdx))
    + _value(computeChipBonus('atkspd', charIdx))
    + _value(bubbleValByKey('BAspd', charIdx, saveData))
    + _value(computeBoxReward(charIdx, '12b'));
  var seconds = Math.max(0.1, (1 + (10 - speed) / 5) / (1 + attackSpeedPct / 100));
  return {
    val: seconds,
    weaponName: weaponName || '',
    weaponSpeed: speed,
    attackSpeedPct: attackSpeedPct,
  };
}

export function effectiveMonsterHP(charIdx, ctx, target) {
  var curse = _value(computePrayerReal(0, 1, charIdx, ctx.saveData))
    + _value(computePrayerReal(7, 1, charIdx, ctx.saveData))
    + _value(computePrayerReal(8, 1, charIdx, ctx.saveData));
  return {
    val: target.hp * (1 + curse / 100),
    base: target.hp,
    prayerCursePct: curse,
  };
}

export function effectiveRespawnTime(charIdx, ctx, target, opts) {
  opts = opts || {};
  var saveData = ctx.saveData;
  var mapIdx = Number(ctx.mapIdx) || 0;
  var worldIdx = Math.floor(mapIdx / 50);
  var common = computeBUpg(44, 10, saveData)
    + _resolverValue(shrine, 7, ctx)
    + _value(computeChipBonus('resp', charIdx))
    + _resolverValue(etcBonus, '47', ctx)
    + _value(computeStarSignBonus('MobRespawn', charIdx, saveData));
  var tasks = saveData.tasksGlobalData || [];
  var worldBonus = common;
  if (worldIdx === 0) worldBonus += achieveStatus(44, saveData) + 2 * (Number(tasks[2]?.[0]?.[1]) || 0);
  else if (worldIdx === 1) worldBonus += achieveStatus(109, saveData) + 2 * (Number(tasks[2]?.[1]?.[1]) || 0);
  else if (worldIdx === 2) worldBonus += 2 * (Number(tasks[2]?.[2]?.[1]) || 0);
  else if (worldIdx === 3) worldBonus += 2 * (Number(tasks[2]?.[3]?.[1]) || 0);
  else if (worldIdx === 4) worldBonus += 2 * achieveStatus(308, saveData) + 2 * (Number(tasks[2]?.[4]?.[1]) || 0);
  else if (worldIdx === 5) worldBonus += 2 * achieveStatus(308, saveData) + (Number(tasks[2]?.[5]?.[1]) || 0);
  else if (worldIdx === 6) worldBonus = 0.65 * (common + 2 * achieveStatus(308, saveData))
    + computeBigFishBonus(0, saveData);

  var base = Number(target.monster && target.monster.RespawnTime) || 0;
  var respawn = base / (1 + worldBonus / 100);
  var portalCount = Number(opts.bossingVainPortalCount) || 0;
  var talent47 = _resolverValue(talent, 47, ctx, { tab: 2 });
  var portalMultiplier = Math.max(1, 1 + talent47 * portalCount / 100);
  respawn /= portalMultiplier;
  return {
    val: respawn,
    base: base,
    commonBonusPct: common,
    worldBonusPct: worldBonus,
    portalMultiplier: portalMultiplier,
  };
}

export function rawHourlyKillRate(ctx, inputs) {
  var hitChance = Number(inputs.hitChance) || 0;
  if (hitChance <= 0) return { val: 0, diagnostics: { hitChance: hitChance } };
  var speed = Math.max(Number(inputs.movementSpeed) || 0, 0.01);
  var effectiveDamage = (Number(inputs.maxDamage) || 0)
    * ((1 + (Number(inputs.mastery) || 0)) / 2)
    * (1 + ((Number(inputs.critDamage) || 1) - 1) * (Number(inputs.critChance) || 0) / 100)
    * (hitChance / 100)
    * Math.max(Number(inputs.loadoutDamageFactor) || 1, 1);
  if (effectiveDamage <= 0) return { val: 0, diagnostics: { hitChance: hitChance, effectiveDamage: effectiveDamage } };

  var monsterCount = Number(inputs.monsterCount) || 0;
  var distance = Number(inputs.travelDistance) || 0;
  var respawn = Math.max(Number(inputs.respawnSeconds) || 0, 0);
  var killFactor = Math.min(Math.max(Number(inputs.loadoutKillFactor) || 1, 1), 2.2);
  var actionWait = Math.max(Number(inputs.actionWaitSeconds) || 0, 0.1);
  var spawnCap = monsterCount / (respawn + 0.1);
  var attacksPerKill = Math.max(((Number(inputs.monsterHP) || 0) / effectiveDamage + 0.52)
    * (100 / hitChance), 1);
  var cycleSeconds = distance / (130 * speed) + actionWait * attacksPerKill;
  var combatCap = cycleSeconds > 0 ? killFactor / cycleSeconds : 0;
  var perSecond = Math.min(spawnCap, combatCap);
  return {
    val: Math.floor(3600 * Math.max(0, perSecond)),
    diagnostics: {
      effectiveDamage: effectiveDamage,
      monsterCount: monsterCount,
      travelDistance: distance,
      respawnSeconds: respawn,
      killFactor: killFactor,
      movementSpeed: speed,
      actionWaitSeconds: actionWait,
      hitChance: hitChance,
      spawnCap: spawnCap,
      attacksPerKill: attacksPerKill,
      cycleSeconds: cycleSeconds,
      combatCap: combatCap,
      perSecond: perSecond,
    },
  };
}

export function monsterDamageTaken(baseDamage, defence, opts) {
  opts = opts || {};
  var incoming = Number(baseDamage) || 0;
  var defenceValue = Math.max(Number(defence) || 0, 0);
  var raw = (incoming - 2.5 * Math.pow(defenceValue, 0.8))
    / Math.max(1 + defenceValue / Math.max(incoming, 1)
      * Math.pow(defenceValue, 1.5) / 100, 1);
  var afterDefence = raw;
  if (opts.buff108Active) raw *= 2;
  if (opts.buff122Active) {
    raw *= Math.max(0.05, 1 - (Number(opts.talent122) || 0) / 100);
  }
  var beforeRounding = raw;
  if (raw < 0.5) raw = 0;
  var rounded = raw < 1e6 ? Math.max(Math.ceil(raw), 0) : raw;
  var talent469 = Number(opts.talent469) || 0;
  var afkDamage = talent469 > 0 ? rounded / (1 + talent469 / 100) : rounded;
  return {
    val: afkDamage,
    afterDefence: afterDefence,
    beforeRounding: beforeRounding,
    rounded: rounded,
    talent469Multiplier: 1 + talent469 / 100,
  };
}

export function autoRespawnTime(talent615, selfHeal) {
  var talentValue = Number(talent615) || 0;
  var selfHealValue = Math.max(0, Number(selfHeal) || 0);
  if (talentValue === 0) {
    return 600 / (1 + Math.min(50, selfHealValue / 100));
  }
  return Math.max(talentValue / (1 + Math.min(50, selfHealValue) / 100), 100);
}

export function survivabilityAtCachedKills(inputs, cachedRewardKills) {
  var maxHP = Math.max(Number(inputs.maxHP) || 0, 0);
  var monsterDamage = Math.max(Number(inputs.monsterDamage) || 0, 0);
  var attacksPerHour = Math.max(Number(inputs.incomingAttacksPerHour) || 0, 0);
  var foodHealing = Math.max(Number(inputs.foodHealingPerHour) || 0, 0);
  var talent627 = Math.max(Number(inputs.talent627) || 0, 0);
  var killHealing = Math.max(Number(cachedRewardKills) || 0, 0)
    * talent627 / 100 * maxHP;
  var totalHealing = foodHealing + killHealing;
  var damagePerHour = monsterDamage * attacksPerHour;
  var netDrain = damagePerHour - totalHealing;
  if (netDrain <= 0) {
    return {
      percent: 100,
      fraction: 1,
      maxHP: maxHP,
      damagePerHour: damagePerHour,
      foodHealingPerHour: foodHealing,
      killHealingPerHour: killHealing,
      totalHealingPerHour: totalHealing,
      netDrainPerHour: netDrain,
      lifeHours: Infinity,
      deathRespawnSeconds: Number(inputs.deathRespawnSeconds) || 0,
    };
  }
  var lifeHours = maxHP / netDrain;
  var deathHours = Math.max(Number(inputs.deathRespawnSeconds) || 0, 0) / 3600;
  var fraction = lifeHours / (lifeHours + deathHours);
  var percent = Math.min(Math.round(100 * fraction), 100);
  return {
    percent: percent,
    fraction: fraction,
    maxHP: maxHP,
    damagePerHour: damagePerHour,
    foodHealingPerHour: foodHealing,
    killHealingPerHour: killHealing,
    totalHealingPerHour: totalHealing,
    netDrainPerHour: netDrain,
    lifeHours: lifeHours,
    deathRespawnSeconds: Number(inputs.deathRespawnSeconds) || 0,
  };
}

export function twoPassCombatSurvivability(rawKillsPerHour, fightingAfkRate, inputs) {
  var rawKills = Math.max(Number(rawKillsPerHour) || 0, 0);
  var afkRate = Math.max(Number(fightingAfkRate) || 0, 0);
  var cacheHistory = [0];
  var first = survivabilityAtCachedKills(inputs, cacheHistory[0]);
  cacheHistory.push(rawKills * afkRate * first.percent / 100);
  var second = survivabilityAtCachedKills(inputs, cacheHistory[1]);
  cacheHistory.push(rawKills * afkRate * second.percent / 100);
  var final = survivabilityAtCachedKills(inputs, cacheHistory[2]);
  var rewardRollKillsPerHour = rawKills * afkRate * final.percent / 100;
  return {
    percent: final.percent,
    fraction: final.fraction,
    rewardRollKillsPerHour: rewardRollKillsPerHour,
    cacheHistory: cacheHistory,
    passes: [first, second, final],
    final: final,
  };
}

export function healthFoodHealingPerHour(charIdx, ctx, opts) {
  opts = opts || {};
  var saveData = ctx.saveData;
  var goldHealth = goldFoodBonuses('HealthFoods', charIdx, undefined, saveData);
  var box = _value(computeBoxReward(charIdx, 'HealthFoodEffect'));
  var statue = _value(computeStatueBonusGiven(3, charIdx, saveData));
  var etc9 = _resolverValue(etcBonus, '9', ctx);
  var stamp = _value(computeStampBonusOfTypeX('HFood', saveData, charIdx));
  var starSign = _value(computeStarSignBonus('FoodEffect', charIdx, saveData));
  var cardSet = _value(computeCardSetBonus(charIdx, '1'));
  var goldenFoodMultiplier = 1 + (Number(goldHealth && goldHealth.total) || 0) / 100;
  var effectMultiplier = goldenFoodMultiplier
    + (box + statue + etc9 + stamp + starSign + cardSet) / 100;
  var rows = opts.foodOrder || equipOrderData[charIdx]?.[2] || [];
  var slots = opts.foodSlots != null
    ? Number(opts.foodSlots) || 0
    : Math.max(0, Math.round(Number(foodSlotsOwnedData[charIdx]) || 0));
  var total = 0;
  var items = [];
  for (var slotIdx = 0; slotIdx < slots; slotIdx++) {
    var itemName = rows[slotIdx] || 'Blank';
    var item = ITEMS[itemName];
    if (!item || Number(item.Trigger) <= 0) continue;
    var amount = Number(item.Amount) || 0;
    var cooldown = Math.max(Number(item.Cooldown) || 0, 1);
    var healing = amount * effectMultiplier / cooldown * 3600;
    total += healing;
    items.push({
      slot: slotIdx,
      itemName: itemName,
      amount: amount,
      cooldown: cooldown,
      trigger: Number(item.Trigger) || 0,
      healingPerHour: healing,
    });
  }
  return {
    val: total,
    effectMultiplier: effectMultiplier,
    goldenFoodHealth: goldenFoodMultiplier,
    box: box,
    statue: statue,
    etc9: etc9,
    stamp: stamp,
    starSign: starSign,
    cardSet: cardSet,
    items: items,
  };
}

function _missingCombatAfkInputs(charIdx) {
  var available = combatAfkInputDataAvailable[charIdx] || {};
  var labels = {
    skillLevels: 'SL_' + charIdx,
    equipment: 'EquipOrder_' + charIdx,
    equipmentQty: 'EquipQTY_' + charIdx,
    foodSlots: 'FoodSlO_' + charIdx,
    buffs: 'BuffsActive_' + charIdx,
    postOffice: 'POu_' + charIdx,
  };
  return Object.keys(labels).filter(function(key) { return available[key] !== true; })
    .map(function(key) { return labels[key]; });
}

export function computeCombatSurvivability(charIdx, ctx, opts) {
  opts = opts || {};
  var rawKills = opts.rawKills || computeRawCombatKillsPerHour(charIdx, ctx, opts);
  if (rawKills.unavailable || rawKills.notApplicable) return rawKills;
  var missingInputs = _missingCombatAfkInputs(charIdx);
  if (missingInputs.length > 0) {
    return {
      val: 0,
      unavailable: true,
      reason: 'Missing required save keys: ' + missingInputs.join(', ') + '.',
    };
  }

  var target = rawKills.target || combatTarget(ctx.saveData, charIdx, ctx.mapIdx);
  var defence = ctx.resolve('defence');
  var maxHP = ctx.resolve('max-hp');
  var fightingAfk = ctx.resolve('fighting-afk');
  if (defence.unavailable || maxHP.unavailable || fightingAfk.unavailable) {
    return { val: 0, unavailable: true, reason: defence.reason || maxHP.reason || fightingAfk.reason || 'Required combat inputs are unavailable.' };
  }
  var buffs = buffsActiveData[charIdx] || [];
  function hasBuff(buffId) {
    return buffs.some(function(buff) {
      return Number(buff && (buff[0] != null ? buff[0] : buff['0'])) === buffId;
    });
  }
  var damage = monsterDamageTaken(
    Number(target.monster && target.monster.Damages && target.monster.Damages[0]) || 0,
    defence.val,
    {
      buff108Active: hasBuff(108),
      buff122Active: hasBuff(122),
      talent122: _resolverValue(talent, 122, ctx),
      talent469: _resolverValue(talent, 469, ctx),
    }
  );
  var foodHealing = healthFoodHealingPerHour(charIdx, ctx, opts);
  var talent615 = _resolverValue(talent, 615, ctx);
  var selfHeal = _value(computeBoxReward(charIdx, 'SelfHeal'));
  var deathRespawn = autoRespawnTime(talent615, selfHeal);
  var talent627 = _resolverValue(talent, 627, ctx);
  var inputs = {
    maxHP: maxHP.val,
    monsterDamage: damage.val,
    incomingAttacksPerHour: mapIncomingAttacksPerHour(ctx.mapIdx),
    foodHealingPerHour: foodHealing.val,
    talent627: talent627,
    deathRespawnSeconds: deathRespawn,
  };
  var result = twoPassCombatSurvivability(rawKills.val, fightingAfk.val, inputs);
  var reasons = [rawKills, defence, maxHP, fightingAfk].filter(function(value) {
    return value && value.partial && value.reason;
  }).map(function(value) { return value.reason; });
  return Object.assign({}, result, {
    val: result.percent,
    rawKillsPerHour: rawKills.val,
    fightingAfkRate: fightingAfk.val,
    monsterDamage: damage,
    incomingAttacksPerHour: inputs.incomingAttacksPerHour,
    foodHealing: foodHealing,
    maxHP: maxHP.val,
    defence: defence.val,
    talent627: talent627,
    deathRespawnSeconds: deathRespawn,
    partial: reasons.length > 0,
    reason: reasons.join(' '),
  });
}

export function directMonsterCardOutcome(targetKey, saveData, cardChanceMultiplier, rewardRollKillsPerHour) {
  var rows = MonsterDrops[targetKey] || [];
  var cardRow = null;
  for (var rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    if (String(rows[rowIdx] && rows[rowIdx][0] || '').indexOf('Cards') !== -1) {
      cardRow = rows[rowIdx];
      break;
    }
  }
  if (!cardRow) {
    return { val: 0, applicable: false, reason: 'The selected monster has no direct card drop.' };
  }

  var cardId = String(cardRow[0]);
  var rawChance = Number(cardRow[1]) || 0;
  var discoveryKey = String(ITEMS[cardId] && ITEMS[cardId].desc_line1 || '');
  var hasDiscoveryEntry = discoveryKey
    && Object.prototype.hasOwnProperty.call(saveData.cards0Data || {}, discoveryKey);
  var discoveredQty = hasDiscoveryEntry ? Number(saveData.cards0Data[discoveryKey]) || 0 : null;
  var firstDiscoveryMultiplier = cardId.indexOf('CardsZ') === -1
    && hasDiscoveryEntry && discoveredQty === 0 ? 5 : 1;
  var effectiveChance = rawChance * firstDiscoveryMultiplier * (Number(cardChanceMultiplier) || 0);
  var cardsPerHour = effectiveChance * Math.max(Number(rewardRollKillsPerHour) || 0, 0);
  var hours = cardsPerHour > 0 ? Math.max(1, 1 / cardsPerHour) : Infinity;
  return {
    val: Number.isFinite(hours) ? hours : 0,
    applicable: cardsPerHour > 0,
    reason: cardsPerHour > 0 ? '' : 'The selected monster card has zero effective drop rate.',
    cardId: cardId,
    discoveryKey: discoveryKey,
    hasDiscoveryEntry: Boolean(hasDiscoveryEntry),
    discoveredQty: discoveredQty,
    rawChance: rawChance,
    firstDiscoveryMultiplier: firstDiscoveryMultiplier,
    cardChanceMultiplier: Number(cardChanceMultiplier) || 0,
    effectiveChance: effectiveChance,
    rewardRollKillsPerHour: Number(rewardRollKillsPerHour) || 0,
    cardsPerHour: cardsPerHour,
  };
}

export function computeRawCombatKillsPerHour(charIdx, ctx, opts) {
  opts = opts || {};
  var target = combatTarget(ctx.saveData, charIdx, ctx.mapIdx);
  if (!target.applicable) return { val: 0, notApplicable: true, reason: target.reason };
  if (target.cglunko || target.key === 'w7a6' || target.classification.category === 'feature') {
    return { val: 0, unavailable: true, reason: 'This map uses a special HP or respawn branch not represented by normal AFK combat.' };
  }
  if (attackLoadoutDataAvailable[charIdx] === false && !opts.loadout) {
    return { val: 0, unavailable: true, reason: 'AttackLoadout_' + charIdx + ' is missing from the imported save.' };
  }
  var damage = ctx.resolve('damage');
  var hit = ctx.resolve('hit-chance');
  var critChance = ctx.resolve('crit-chance');
  var critDamage = ctx.resolve('crit-damage');
  var movement = ctx.resolve('movement-speed');
  var hp = effectiveMonsterHP(charIdx, ctx, target);
  var respawn = effectiveRespawnTime(charIdx, ctx, target, opts);
  var loadoutDamage = attackLoadoutFactor('D', 0, charIdx, ctx, opts);
  var loadoutKill = attackLoadoutFactor('K', 0, charIdx, ctx, opts);
  var actionWait = actionWaitTimeAfk(charIdx, ctx, opts);
  var raw = rawHourlyKillRate(ctx, {
    hitChance: hit.val,
    maxDamage: damage.val,
    mastery: damage.mastery,
    critDamage: critDamage.val,
    critChance: critChance.val,
    loadoutDamageFactor: loadoutDamage.val,
    movementSpeed: movement.val,
    monsterHP: hp.val,
    monsterCount: mapMonsterCount(ctx.mapIdx),
    travelDistance: mapTravelDistance(ctx.mapIdx),
    respawnSeconds: respawn.val,
    loadoutKillFactor: loadoutKill.val,
    actionWaitSeconds: actionWait.val,
  });
  return Object.assign({}, raw, {
    target: target,
    hp: hp,
    respawn: respawn,
    loadoutDamage: loadoutDamage,
    loadoutKill: loadoutKill,
    actionWait: actionWait,
    partial: Boolean(damage.partial || hit.partial),
    reason: damage.reason || hit.reason || '',
  });
}