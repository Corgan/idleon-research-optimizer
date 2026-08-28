// ===== SELECTED-MAP COMBAT OUTCOME DESCRIPTORS =====

import { createDescriptor } from './helpers.js';
import {
  accuracyRequiredForGuaranteedHit,
  combatMapApplicability,
  combatTarget,
  computeCombatSurvivability,
  directMonsterCardOutcome,
  computeHitChance,
  computeRawCombatKillsPerHour,
} from '../systems/common/combat-outcomes.js';
import {
  computeMultiKillBase,
  computeMultiKillPerTier,
  computeMultiKillTotal,
  computeOverkillActive,
  computeOverkillTier,
} from '../systems/common/overkill.js';
import { MonsterDrops } from '../data/game/custommaps.js';

function _target(ctx) {
  return combatTarget(ctx.saveData, Number(ctx.charIdx) || 0, Number(ctx.mapIdx) || 0);
}

function _targetChildren(target) {
  return [
    { name: 'Target', val: 0, fmt: 'raw', note: target.name + ' (' + target.key + ')' },
    { name: 'Monster HP', val: target.hp, fmt: 'raw' },
    { name: 'Monster Defence', val: target.defence, fmt: 'raw' },
  ];
}

function _statusFrom(results) {
  var reasons = [];
  for (var i = 0; i < results.length; i++) {
    var result = results[i];
    if (result && (result.partial || result.unavailable) && result.reason) reasons.push(result.reason);
  }
  return { partial: reasons.length > 0, reason: reasons.join(' ') };
}

export const hitChance = createDescriptor({
  id: 'hit-chance',
  name: 'Hit Chance',
  scope: 'character+map',
  category: 'combat',
  applies: combatMapApplicability,
  combine: function(pools, ctx) {
    var target = _target(ctx);
    var accuracy = ctx.resolve('accuracy');
    var status = _statusFrom([accuracy]);
    return {
      val: computeHitChance(accuracy.val, target.defence, target.type),
      children: [
        { name: 'Player Accuracy', val: accuracy.val, fmt: 'raw' },
        { name: 'Monster Defence', val: target.defence, fmt: 'raw' },
        { name: 'Accuracy / Defence', val: Number(accuracy.val) / Math.max(target.defence, 1), fmt: 'x' },
      ],
      partial: status.partial,
      reason: status.reason,
    };
  },
});

export const accuracyRequired = createDescriptor({
  id: 'accuracy-required',
  name: 'Accuracy Required (100% Hit)',
  scope: 'character+map',
  category: 'combat',
  applies: combatMapApplicability,
  combine: function(pools, ctx) {
    var target = _target(ctx);
    var required = accuracyRequiredForGuaranteedHit(target.defence, target.type);
    return {
      val: required,
      children: [
        { name: 'Monster Defence', val: target.defence, fmt: 'raw' },
        { name: 'Required Ratio', val: 1.5, fmt: 'x', note: 'Source gate is accuracy > 1.5 x defence.' },
        { name: 'Minimum Integer Accuracy', val: required, fmt: 'raw' },
      ],
    };
  },
});

export const overkillTier = createDescriptor({
  id: 'overkill-tier',
  name: 'Overkill Tier',
  scope: 'character+map',
  category: 'combat',
  combine: function(pools, ctx) {
    var target = _target(ctx);
    var damage = ctx.resolve('damage');
    if (damage.unavailable) {
      return { val: 1, children: null, unavailable: true, reason: damage.reason };
    }
    var opts = {
      mapIdx: target.mapIdx,
      afkTarget: target.key,
      monsterHP: target.hp,
      maxDmg: Number(damage.val) || 0,
    };
    var tier = computeOverkillTier(ctx.charIdx, ctx, opts);
    var active = computeOverkillActive(ctx.charIdx, ctx, opts);
    var exponent = tier.exponent;
    var lower = tier.tier === 1 ? target.hp : target.hp * Math.pow(exponent, tier.tier);
    var upper = target.hp * Math.pow(exponent, tier.tier + 1);
    return {
      val: tier.tier,
      children: _targetChildren(target).concat([
        { name: 'Maximum Damage', val: damage.val, fmt: 'raw' },
        { name: 'Overkill Exponent', val: exponent, fmt: 'raw' },
        { name: 'Current Tier Lower Bound', val: lower, fmt: 'raw' },
        { name: 'Next Tier Damage', val: upper, fmt: 'raw' },
        { name: 'Overkill Active', val: active.active ? 1 : 0, fmt: 'raw',
          note: active.active ? 'Damage, tower, and accuracy gates passed.' : 'One or more activation gates failed.' },
      ]),
      partial: Boolean(damage.partial),
      notApplicable: !target.applicable,
      reason: damage.partial ? damage.reason : '',
    };
  },
});

function _multiKillDescriptor(id, name, compute, note) {
  return createDescriptor({
    id: id,
    name: name,
    scope: 'character+map',
    category: 'combat',
    applies: combatMapApplicability,
    combine: function(pools, ctx) {
      var value = compute(Number(ctx.charIdx) || 0, ctx, { mapIdx: Number(ctx.mapIdx) || 0 });
      return {
        val: value,
        children: [{ name: name, val: value, fmt: 'raw', note: note }],
      };
    },
  });
}

export const multikillBase = _multiKillDescriptor(
  'multikill-base', 'Multikill Base', computeMultiKillBase,
  'Additive percentage points before the per-tier contribution.'
);

export const multikillPerTier = _multiKillDescriptor(
  'multikill-per-tier', 'Multikill Per Tier', computeMultiKillPerTier,
  'Additive percentage points granted for each Overkill tier.'
);

export const multikillTotal = createDescriptor({
  id: 'multikill-total',
  name: 'Multikill Total',
  scope: 'character+map',
  category: 'combat',
  applies: combatMapApplicability,
  combine: function(pools, ctx) {
    var overkill = ctx.resolve('overkill-tier');
    if (overkill.unavailable) {
      return { val: 0, children: null, unavailable: true, reason: overkill.reason };
    }
    var charIdx = Number(ctx.charIdx) || 0;
    var mapIdx = Number(ctx.mapIdx) || 0;
    var base = computeMultiKillBase(charIdx, ctx, { mapIdx: mapIdx });
    var perTier = computeMultiKillPerTier(charIdx, ctx, { mapIdx: mapIdx });
    var total = computeMultiKillTotal(charIdx, ctx, { mapIdx: mapIdx, tier: overkill.val });
    return {
      val: total,
      children: [
        { name: 'Base', val: base, fmt: 'raw' },
        { name: 'Per Tier', val: perTier, fmt: 'raw' },
        { name: 'Overkill Tier', val: overkill.val, fmt: 'raw' },
        { name: 'Isolated Multikill Multiplier', val: 1 + total / 100, fmt: 'x' },
      ],
      partial: Boolean(overkill.partial),
      reason: overkill.partial ? overkill.reason : '',
    };
  },
});

export const rawCombatKillsPerHour = createDescriptor({
  id: 'raw-combat-kills-per-hour',
  name: 'Raw Combat Kills/hr',
  scope: 'character+map',
  category: 'rate',
  applies: combatMapApplicability,
  combine: function(pools, ctx) {
    var result = computeRawCombatKillsPerHour(Number(ctx.charIdx) || 0, ctx);
    if (result.unavailable || result.notApplicable) return result;
    var diagnostics = result.diagnostics || {};
    return {
      val: result.val,
      children: [
        { name: 'Spawn Cap', val: diagnostics.spawnCap * 3600, fmt: 'raw', note: 'Maximum kills/hr from monster count and respawn.' },
        { name: 'Combat Cap', val: diagnostics.combatCap * 3600, fmt: 'raw', note: 'Maximum kills/hr from travel, attacks, and loadout.' },
        { name: 'Effective AFK Damage', val: diagnostics.effectiveDamage, fmt: 'raw' },
        { name: 'Effective Monster HP', val: result.hp.val, fmt: 'raw' },
        { name: 'Effective Respawn', val: result.respawn.val, fmt: 'raw', note: 'seconds' },
        { name: 'Damage Loadout Factor', val: result.loadoutDamage.val, fmt: 'x' },
        { name: 'Kill Loadout Factor', val: Math.min(Math.max(result.loadoutKill.val, 1), 2.2), fmt: 'x', note: 'capped at 2.2x' },
        { name: 'AFK Action Wait', val: result.actionWait.val, fmt: 'raw', note: 'seconds' },
        { name: 'Movement Speed', val: diagnostics.movementSpeed, fmt: 'x' },
        { name: 'Hit Chance', val: diagnostics.hitChance, fmt: 'raw' },
      ],
      partial: Boolean(result.partial),
      reason: result.reason || '',
    };
  },
});

function _survivabilityChildren(result) {
  var final = result.final || {};
  return [
    { name: 'Raw Combat Kills/hr', val: result.rawKillsPerHour, fmt: 'raw' },
    { name: 'Fighting AFK Rate', val: result.fightingAfkRate, fmt: 'x' },
    { name: 'Monster Damage per Hit', val: result.monsterDamage.val, fmt: 'raw' },
    { name: 'Incoming Attacks/hr', val: result.incomingAttacksPerHour, fmt: 'raw' },
    { name: 'Damage Taken/hr', val: final.damagePerHour || 0, fmt: 'raw' },
    { name: 'Health Food Healing/hr', val: result.foodHealing.val, fmt: 'raw' },
    { name: 'Kill Healing/hr', val: final.killHealingPerHour || 0, fmt: 'raw' },
    { name: 'Max HP', val: result.maxHP, fmt: 'raw' },
    { name: 'Death Respawn', val: result.deathRespawnSeconds, fmt: 'raw', note: 'seconds' },
    { name: 'Cached Reward Kills Pass 1', val: result.cacheHistory[1], fmt: 'raw' },
    { name: 'Cached Reward Kills Pass 2', val: result.cacheHistory[2], fmt: 'raw' },
  ];
}

export const combatSurvivability = createDescriptor({
  id: 'combat-survivability',
  name: 'Combat Survivability',
  scope: 'character+map',
  category: 'combat',
  applies: combatMapApplicability,
  combine: function(pools, ctx) {
    var result = computeCombatSurvivability(Number(ctx.charIdx) || 0, ctx);
    if (result.unavailable || result.notApplicable) return result;
    return {
      val: result.percent,
      children: _survivabilityChildren(result),
      partial: Boolean(result.partial),
      reason: result.reason || '',
    };
  },
});

export const rewardRollKillsPerHour = createDescriptor({
  id: 'reward-roll-kills-per-hour',
  name: 'Reward-Roll Kills/hr',
  scope: 'character+map',
  category: 'rate',
  applies: combatMapApplicability,
  combine: function(pools, ctx) {
    var result = computeCombatSurvivability(Number(ctx.charIdx) || 0, ctx);
    if (result.unavailable || result.notApplicable) return result;
    return {
      val: result.rewardRollKillsPerHour,
      children: [
        { name: 'Raw Combat Kills/hr', val: result.rawKillsPerHour, fmt: 'raw' },
        { name: 'Fighting AFK Rate', val: result.fightingAfkRate, fmt: 'x' },
        { name: 'Survivability', val: result.percent, fmt: 'raw', note: 'percent' },
      ],
      partial: Boolean(result.partial),
      reason: result.reason || '',
    };
  },
});

export const creditedKillsPerHour = createDescriptor({
  id: 'credited-kills-per-hour',
  name: 'Credited Kills/hr',
  scope: 'character+map',
  category: 'rate',
  applies: combatMapApplicability,
  combine: function(pools, ctx) {
    var rewardKills = ctx.resolve('reward-roll-kills-per-hour');
    if (rewardKills.unavailable || rewardKills.notApplicable) return rewardKills;
    var killPerKill = ctx.resolve('kill-per-kill');
    var status = _statusFrom([rewardKills, killPerKill]);
    return {
      val: Number(rewardKills.val) * Number(killPerKill.val),
      children: [
        { name: 'Reward-Roll Kills/hr', val: rewardKills.val, fmt: 'raw' },
        { name: 'Kill Per Kill Multiplier', val: killPerKill.val, fmt: 'x',
          note: 'Applied only to credited kills, not EXP, coins, cards, or initial loot rolls.' },
      ],
      partial: status.partial,
      reason: status.reason,
    };
  },
});

export const classExpPerHour = createDescriptor({
  id: 'class-exp-per-hour',
  name: 'Class EXP/hr',
  scope: 'character+map',
  category: 'rate',
  applies: combatMapApplicability,
  combine: function(pools, ctx) {
    var rewardKills = ctx.resolve('reward-roll-kills-per-hour');
    if (rewardKills.unavailable || rewardKills.notApplicable) return rewardKills;
    var target = _target(ctx);
    var monsterExp = ctx.resolve('monster-exp');
    var baseExp = Number(target.monster && target.monster.ExpGiven) || 0;
    var raw = Number(rewardKills.val) * baseExp * Number(monsterExp.val);
    var displayed = raw < 1e9 ? Math.round(raw) : raw;
    var status = _statusFrom([rewardKills, monsterExp]);
    return {
      val: displayed,
      rawValue: raw,
      children: [
        { name: 'Reward-Roll Kills/hr', val: rewardKills.val, fmt: 'raw' },
        { name: 'Monster Base EXP', val: baseExp, fmt: 'raw' },
        { name: 'Monster EXP Multiplier', val: monsterExp.val, fmt: 'x' },
      ],
      partial: status.partial,
      reason: status.reason,
    };
  },
});

export const panelCoinsPerHour = createDescriptor({
  id: 'panel-coins-per-hour',
  name: 'Panel Coins/hr',
  scope: 'character+map',
  category: 'rate',
  applies: combatMapApplicability,
  combine: function(pools, ctx) {
    var rewardKills = ctx.resolve('reward-roll-kills-per-hour');
    if (rewardKills.unavailable || rewardKills.notApplicable) return rewardKills;
    var target = _target(ctx);
    var coinMulti = ctx.resolve('coin-multi');
    var coinRow = MonsterDrops[target.key] && MonsterDrops[target.key][0];
    if (!coinRow || coinRow[0] !== 'COIN') {
      return { val: 0, unavailable: true, reason: 'The selected monster has no canonical coin reward row.' };
    }
    var probability = Number(coinRow[1]) || 0;
    var quantity = Number(coinRow[2]) || 0;
    var raw = Number(rewardKills.val) * probability * quantity * Number(coinMulti.val);
    var displayed = raw <= 2e9 ? Math.round(raw) : raw;
    var status = _statusFrom([rewardKills, coinMulti]);
    return {
      val: displayed,
      rawValue: raw,
      children: [
        { name: 'Reward-Roll Kills/hr', val: rewardKills.val, fmt: 'raw' },
        { name: 'Coin Drop Probability', val: probability, fmt: 'raw' },
        { name: 'Base Coin Quantity', val: quantity, fmt: 'raw' },
        { name: 'Coin Multiplier', val: coinMulti.val, fmt: 'x' },
      ],
      partial: status.partial,
      reason: status.reason,
    };
  },
});

export const directCardAverageTime = createDescriptor({
  id: 'direct-card-average-time',
  name: 'Direct Card Average Time',
  scope: 'character+map',
  category: 'rate',
  applies: combatMapApplicability,
  combine: function(pools, ctx) {
    var rewardKills = ctx.resolve('reward-roll-kills-per-hour');
    if (rewardKills.unavailable || rewardKills.notApplicable) return rewardKills;
    var cardChance = ctx.resolve('card-drop-chance-multiplier');
    var target = _target(ctx);
    var result = directMonsterCardOutcome(
      target.key,
      ctx.saveData,
      cardChance.val,
      rewardKills.val
    );
    if (!result.applicable) {
      return { val: 0, notApplicable: true, reason: result.reason };
    }
    var status = _statusFrom([rewardKills, cardChance]);
    return {
      val: result.val,
      children: [
        { name: 'Card', val: 0, fmt: 'raw', note: result.cardId },
        { name: 'Raw Card Chance', val: result.rawChance, fmt: 'raw' },
        { name: 'First Discovery Multiplier', val: result.firstDiscoveryMultiplier, fmt: 'x',
          note: result.hasDiscoveryEntry ? 'Discovery key: ' + result.discoveryKey : 'Discovery key absent from save map' },
        { name: 'Card Drop Chance Multiplier', val: result.cardChanceMultiplier, fmt: 'x' },
        { name: 'Effective Chance per Reward Roll', val: result.effectiveChance, fmt: 'raw' },
        { name: 'Reward-Roll Kills/hr', val: result.rewardRollKillsPerHour, fmt: 'raw' },
        { name: 'Expected Cards/hr', val: result.cardsPerHour, fmt: 'raw' },
      ],
      partial: status.partial,
      reason: status.reason,
    };
  },
});