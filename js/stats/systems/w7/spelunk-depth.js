// ===== SPELUNKING DEPTH-LIMIT ESTIMATES (W7) =====
import { normalizeSpelunkConfig, spelunkRockStats, spelunkEntryEffects, spelunkDigPower,
  spelunkStaminaMultiplier, spelunkHitDamage } from './spelunk-expedition.js?v=depth-limits-1';

function _finite(n, name, minimum = 0) {
  if (!Number.isFinite(n) || n < minimum) throw new Error(`${name} is unavailable or invalid.`);
  return n;
}

export function spelunkRockProbabilities(cave, depth) {
  if (!Number.isInteger(depth) || depth < 0) throw new Error('Invalid zero-based rock depth.');
  const probabilities = Array(cave.rocks.length - 1).fill(0);
  let current = 0, remaining = 1;
  for (let type = 1; type < probabilities.length; type++) {
    const threshold = cave.rocks[type].depth;
    if (depth < threshold) continue;
    const chance = Math.max(0, Math.min(1, (depth - threshold) / Math.max(1, depth - threshold + 2 * threshold) * 1.5));
    probabilities[current] += remaining * (1 - chance);
    remaining *= chance;
    current = type;
  }
  probabilities[current] += remaining;
  return probabilities;
}

export function spelunkDepthProfile(input, requested, { from = 1, to = 150, tool = 'best' } = {}) {
  const config = normalizeSpelunkConfig(input, requested), cave = input.caves[config.cave];
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from || to > 10000 || to - from > 1000)
    throw new Error('Choose depths 1-10,000 spanning at most 1,001 floors.');
  const tools = tool === 'best' ? input.tools : input.tools.filter(t => t.id === tool);
  if (!tools.length) throw new Error('Choose an unlocked reference tool.');
  const effects = spelunkEntryEffects(input, config);
  const power = _finite(spelunkDigPower(input, effects), 'Entry Power', Number.MIN_VALUE);
  const multiplier = _finite(spelunkStaminaMultiplier(config, effects), 'Stamina multiplier', Number.MIN_VALUE);
  const budget = config.party.reduce((sum, id) => sum + _finite(config.stamina === 'full'
    ? input.characters[id].max : input.characters[id].stamina, 'Party stamina'), 0);
  _finite(budget, 'Party stamina', Number.MIN_VALUE);
  const refund = effects[0] > 0 ? _finite(input.elixirs[2].quantity, 'Stamina refund') / 100 : 0;
  const bonus = _finite(input.shop[18] + input.holesBonus, 'Extra exits') / 100;
  const clamp = n => Math.max(0, Math.min(1, n));
  const holes = [clamp(1 - bonus), clamp(2 - bonus) - clamp(1 - bonus), 1 - clamp(2 - bonus)];
  const rows = [];
  for (let visibleDepth = from; visibleDepth <= to; visibleDepth++) {
    const depth = visibleDepth - 1, probabilities = spelunkRockProbabilities(cave, depth);
    const objects = [];
    for (let type = 0; type < cave.rocks.length; type++) {
      const boss = type === cave.rocks.length - 1;
      const probability = boss ? Number(depth === cave.bossDepth) : probabilities[type];
      if (!probability) continue;
      const stats = spelunkRockStats(cave, type, depth);
      _finite(stats.hp, 'Object HP', Number.MIN_VALUE);
      _finite(stats.requirement, 'Object Power requirement', Number.MIN_VALUE);
      const ratio = power / stats.requirement, hitChance = Math.min(1, ratio ** .6);
      let best = null;
      for (const reference of tools) {
        const damage = _finite(spelunkHitDamage(input, reference.damage, ratio), 'Hit damage', Number.MIN_VALUE);
        const hits = Math.ceil(stats.hp / damage);
        const cost = _finite(reference.cost * multiplier, 'Tool stamina', Number.MIN_VALUE);
        const perAttempt = cost * Math.max(0, 1 - refund);
        const expected = perAttempt === 0 ? 0 : hits / hitChance * perAttempt;
        if (!best || expected < best.expected) best = { tool: reference.id, hits, cost, perAttempt, expected };
      }
      objects.push({ type, name: cave.rocks[type].name.replaceAll('_', ' ').trim(), boss, probability,
        hp: stats.hp, requirement: stats.requirement, hitChance, ...best, overBudget: best.expected > budget });
    }
    const hard = Math.min(1, objects.reduce((sum, r) => sum + (!r.boss && r.overBudget ? r.probability : 0), 0));
    // Distinct uniformly selected rocks still have independent types before the floor is generated.
    const blockedExits = holes.reduce((sum, probability, i) => sum + probability * hard ** (i + 1), 0);
    rows.push({ depth: visibleDepth, hard, blockedExits, objects });
  }
  return { config, cave: cave.name, budget, power, refund, holes, tool, rows, partial: Boolean(input.partial) };
}
