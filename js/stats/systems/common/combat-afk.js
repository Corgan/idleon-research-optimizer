// ===== OFFLINE COMBAT CLAIMS (common) =====
import { createStatContext } from '../../stat-context.js';
import { buildCombatInputs } from './combat-sim-inputs.js';
import { lootDropOddsReset } from './combat-sim-rewards.js';
import { combatTarget, computeCombatSurvivability } from './combat-outcomes.js';
import { buildToggleOverrides, normalizeToggleState, COMBAT_TOGGLE_BY_ID } from './combat-sim-toggles.js';
import { computePrayerReal } from '../w3/prayer.js';
import { computeBoxReward } from './stats.js';
import { NonAFKmonsters } from '../../data/game/customlists.js';
import { ITEMS } from '../../data/game/items.js';
import { charClassData, buffsActiveData } from '../../../save/data.js';
import * as D from '../../../save/data.js';
import { combatAfkFood } from './combat-afk-food.js';
import { computeOverkillActive } from './overkill.js';
import { combatAfkProgress } from './combat-afk-progress.js';
import { MAP_SCENES } from '../../data/game/combat-sprites.js';

const N = x => Number(x) || 0;
const _recipe = key => /SmithingRecipes|TalentBook/.test(key);
const _gem = key => /PremiumGem|Timecandy/.test(key);
const _clamp = p => Number.isNaN(p) ? 0 : Math.max(0, Math.min(1, p));
const _zero = () => new Map([[0, 1]]);

// DropOdds uses one batch roll, capped at two until its mean is strictly > 2.
export function afkDropRollDistribution(batch, probability) {
  if (!Number.isFinite(batch) || batch < 0 || !Number.isFinite(probability) || probability < 0) throw new Error('Invalid AFK drop batch or probability.');
  if (probability * batch > 2) return [[Math.round(probability * batch), 1]];
  const p0 = Math.pow(1 - probability, batch);
  const p01 = probability * Math.pow(1 - probability, batch - 1) * batch + p0;
  const zero = _clamp(p0), one = Math.max(0, _clamp(p01) - zero);
  return [[0, zero], [1, one], [2, 1 - zero - one]].filter(([, p]) => p > 0);
}

function _add(dist, qty, probability) {
  dist.set(qty, (dist.get(qty) || 0) + probability);
}

// Retain each item's conditional distribution per DN2, including the source's
// nested-table overwrite. This preserves correlated rare-table branches.
function _mix(states) {
  const groups = new Map();
  for (const state of states) {
    if (!(state.weight > 0)) continue;
    let group = groups.get(state.batch);
    if (!group) groups.set(state.batch, group = { batch: state.batch, weight: 0, items: new Map() });
    for (const key of new Set([...group.items.keys(), ...state.items.keys()])) {
      let dist = group.items.get(key);
      if (!dist) group.items.set(key, dist = new Map([[0, group.weight]]));
      for (const [qty, p] of state.items.get(key) || _zero()) _add(dist, qty, p * state.weight);
    }
    group.weight += state.weight;
  }
  for (const group of groups.values()) for (const dist of group.items.values()) {
    for (const [qty, p] of dist) {
      if (p > 0) dist.set(qty, p / group.weight);
      else dist.delete(qty);
    }
  }
  return [...groups.values()];
}

function _ceilUniformMean(a, b) {
  if (a === b) return Math.ceil(a);
  const fa = a - Math.floor(a), fb = b - Math.floor(b);
  return (a + b) / 2 + 0.5 - ((fb * fb - fb) - (fa * fa - fa)) / (2 * (b - a));
}

function _gemAmounts(qty) {
  const end = 1.35 * qty, width = end + 0.55;
  const out = [[1, Math.min(width, 2.55) / width]];
  for (let q = 2; q < end; q++) out.push([q, (Math.min(end, q + 1) - q) / width]);
  return out;
}

export function afkMonsterDropOutcomes(batch, target, values, tables) {
  if (!Array.isArray(tables.monsterDrops[target])) throw new Error('Missing AFK monster drop table: ' + target);
  const DR = N(values.dropRate), quest = values.questComplete || {};
  const pass = row => row[3] === 'N/A' || quest[String(row[3])] == 0; // eslint-disable-line eqeqeq
  const roll = (row, count, depth) => {
    const key = String(row[0]), recipe = _recipe(key), gem = _gem(key);
    if (depth === 0 && gem) {
      const chance = _clamp(N(row[1]) * Math.pow(DR, 0.2));
      return [[0, 1 - chance], ..._gemAmounts(N(row[2])).map(([q, p]) => [q, p * chance])];
    }
    const probability = depth === 0 ? N(row[1]) * DR
      : N(row[1]) * DR / Math.max(DR, 1) * (depth === 1 && !recipe && !gem ? 1 + N(values.talent29) / 100 : 1);
    let out = afkDropRollDistribution(count, probability);
    if (recipe || gem) out = out.map(([q, p]) => [Math.min(q, 1), p]);
    if (depth === 1 && gem) {
      const gate = _clamp(N(row[1]) * Math.pow(DR, 0.35));
      out = [[0, 1 - gate], ...out.map(([q, p]) => [q, p * gate])];
    }
    return out;
  };
  function advance(states, rows, depth) {
    for (const row of rows) {
      if (!pass(row)) continue;
      const key = String(row[0]), branches = [];
      for (const state of states) for (const [count, p] of roll(row, depth === 0 ? batch : state.batch, depth)) {
        if (!(p > 0)) continue;
        let next = { ...state, weight: state.weight * p };
        if (count === 0) { branches.push(next); continue; }
        let qty = depth === 0 && _gem(key) ? count : Math.round(N(row[2]) * count);
        if (depth === 0 && N(row[2]) * count > 1e9 && !_gem(key)) qty = N(row[2]) * count;
        if (key.includes('DropTable') && depth < 2) {
          next.batch = qty;
          if (!Array.isArray(tables.dropTables[key])) throw new Error('Missing AFK rare drop table: ' + key);
          branches.push(...advance([next], tables.dropTables[key], depth + 1));
        } else {
          if (_recipe(key)) qty = 1; // Native amount encodes a recipe/book ID, not a stack count.
          if (key === 'COIN' && depth === 0) {
            const cash = N(values.monsterCash);
            qty = Math.max(Number.MIN_VALUE, _ceilUniformMean(qty * cash * 0.5, qty * cash * 1.5));
          }
          const shifted = new Map();
          for (const [old, probability] of state.items.get(key) || _zero()) _add(shifted, old + qty, probability);
          next.items = new Map(state.items);
          next.items.set(key, shifted);
          branches.push(next);
        }
      }
      states = _mix(branches);
    }
    return states;
  }
  // Independent top-level rows share no DN2; only each rare table's inner rows do.
  const total = new Map();
  for (const row of tables.monsterDrops[target]) {
    const branch = advance([{ batch: 0, weight: 1, items: new Map() }], [row], 0);
    const mixed = _mix(branch.map(state => ({ ...state, batch: 0 })))[0];
    for (const [key, dist] of mixed?.items || []) {
      const combined = new Map();
      for (const [a, pa] of total.get(key) || _zero()) for (const [b, pb] of dist) _add(combined, a + b, pa * pb);
      total.set(key, combined);
    }
  }
  const filters = new Set((values.printerFilter || []).slice(0, N(values.filterSlots)));
  const sample = (tables.monsterDrops[target] || []).slice(0, 4).find(row => row[3] === 'N/A' && row[0] !== 'COIN' && !String(row[0]).includes('Cards'))?.[0];
  return [...total].filter(([key]) => !filters.has(key)).map(([key, dist]) => {
    const single = _recipe(key) || key.includes('Obol') || (key.startsWith('Cards') && values.cards0?.[ITEMS[key]?.desc_line1] == 0); // eslint-disable-line eqeqeq
    const final = new Map();
    for (let [qty, p] of dist) {
      if (single) qty = qty > 0 ? 1 : 0;
      else if (key === sample && N(values.overkillActive) === 1 && !NonAFKmonsters.includes(target)) qty = Math.floor(qty * Math.max(1, 1 + N(values.multikillTotal) / 100));
      if (key === 'COIN' && qty > 0) qty += 0.01;
      _add(final, qty, p);
    }
    const chance = _clamp(1 - (final.get(0) || 0));
    return {
      key, expected: [...final].reduce((sum, [qty, p]) => sum + qty * p, 0),
      chance, guaranteed: !(final.get(0) > 0), minimum: key === 'COIN' ? null : Math.min(...final.keys()), single,
    };
  });
}

const DESCRIPTORS = {
  dropRate: 'drop-rate', monsterCash: 'coin-multi', cardChanceMulti: 'card-drop-chance-multiplier',
  expMulti: 'monster-exp', killPerKill: 'kill-per-kill', damageMax: 'damage', accuracy: 'accuracy',
  critChance: 'crit-chance', critDamage: 'crit-damage', playerMaxHp: 'max-hp', playerDefence: 'defence',
  hitChancePct: 'hit-chance', multikillTotal: 'multikill-total',
};
const VALUE_OVERRIDES = new Set(['talent29', 'bribe1', 'bribe8', 'overkillActive', 'filterSlots']);

export function combatAfkGains(S, charIdx, mapIdx, hours, opts = {}) {
  if (!Number.isFinite(hours) || hours < 0 || hours * 3600 > 2e8) throw new Error('Enter AFK hours between 0 and 55,555.');
  const candy = opts.candy === true;
  if (candy && (mapIdx >= 299 || [120, 166, 200, 216].includes(mapIdx))) {
    return { unavailable: true, candy, reason: 'Time Candy cannot be used on this map in the game.', drops: [] };
  }
  if (candy && [4, 5].includes(N(charClassData[charIdx])) && (buffsActiveData[charIdx] || []).some(b => N(b[0]) === 45)) {
    return { unavailable: true, candy, reason: 'Time Candy cannot be used while the Journeyman/Maestro skilling buff is active.', drops: [] };
  }
  const holeCavern = opts.holeCavern ?? N(S.holesData?.[0]?.[charIdx]);
  const ctx = createStatContext({ saveData: S, charIdx, mapIdx, layer1: { afkClaim: true, holeCavern } });
  const target = combatTarget(S, charIdx, mapIdx, ctx);
  if (!target.applicable) return { unavailable: true, reason: target.reason, drops: [] };
  ctx.afkTarget = target.key;
  const warnings = [], toggles = normalizeToggleState(opts.toggles), descriptorOverrides = new Map(), valueToggles = {};
  for (const [id, row] of Object.entries(toggles)) {
    const key = id.startsWith('raw:') ? id.slice(4) : COMBAT_TOGGLE_BY_ID[id]?.keys[0];
    if (DESCRIPTORS[key]) descriptorOverrides.set(DESCRIPTORS[key], { id, key, row });
    else if (VALUE_OVERRIDES.has(key)) valueToggles[id] = row;
    else warnings.push('Active-only override not applied: ' + (COMBAT_TOGGLE_BY_ID[id]?.label || key || id) + '.');
  }
  const resolve = ctx.resolve, frozen = new Map();
  ctx.resolve = id => {
    if (frozen.has(id)) return frozen.get(id);
    const node = resolve(id), override = descriptorOverrides.get(id);
    if (!override) return node;
    const val = buildToggleOverrides({ [override.id]: override.row }, { [override.key]: { value: node.val } })[override.key];
    if (!Number.isFinite(val) || val < 0) throw new Error('Invalid AFK override: ' + override.key);
    return { ...node, val, children: [], unavailable: false, partial: false, reason: '' };
  };
  const survival = computeCombatSurvivability(charIdx, ctx);
  if (survival.unavailable || survival.notApplicable) return { unavailable: true, reason: survival.reason, drops: [] };
  const required = ['drop-rate', 'coin-multi', 'card-drop-chance-multiplier', 'monster-exp', 'kill-per-kill', 'multikill-total'];
  for (const id of required) {
    const node = ctx.resolve(id);
    if (node.unavailable || node.notApplicable || !Number.isFinite(node.val)) return { unavailable: true, reason: node.reason || 'AFK input unavailable: ' + id, drops: [] };
    if (node.partial && node.reason) warnings.push(node.reason);
  }
  if (survival.partial && survival.reason) warnings.push(survival.reason);
  const built = buildCombatInputs(S, charIdx, mapIdx, { rawSave: opts.rawSave, ctx, overrides: { useSavedBuffs: true } });
  const values = { ...built.values, overkillActive: computeOverkillActive(charIdx, ctx, { mapIdx, afkTarget: target.key, monsterHP: target.hp }).active ? 1 : 0 };
  Object.assign(values, buildToggleOverrides(valueToggles, built.entries));
  // The active input builder's provenance is also used for native loot-table reset.
  for (const key of ['anvilCraftStatus', 'stampLevelMax', 'invStorageUsed', 'skillLevelsMax', 'kla100', 'tasksObol', 'emporium4', 'ninja106', 'talent29', 'bribe1', 'bribe8', 'filterSlots']) {
    const entry = built.entries[key];
    if ((entry?.partial || entry?.unavailable) && entry.note) warnings.push('Drop eligibility: ' + entry.note);
  }
  let seconds = Math.round(hours * 3600);
  if (N(computePrayerReal(2, 1, charIdx, S).val) > 2) seconds = Math.min(seconds, 36000);
  if (seconds < Math.round(hours * 3600)) warnings.push('Unending Energy caps this claim at 10 hours.');
  const eligible = hours * 3600 > 120;
  if (!eligible) warnings.push('Native AFK claims require more than two minutes away.');
  // Food changes do not invalidate the native map-load damage/TotalStats cache.
  for (const id of ['damage', 'accuracy', 'crit-chance', 'crit-damage', 'defence', 'drop-rate', 'kill-per-kill', 'multikill-total']) frozen.set(id, ctx.resolve(id));
  let foodClaim = null;
  if (eligible) {
    const orderRow = D.equipOrderData[charIdx], qtyRow = D.equipQtyData[charIdx];
    const completeFoodRow = row => row && typeof row === 'object' && Number.isInteger(Number(row.length))
      && Number(row.length) >= values.foodSlots.count
      && Array.from({ length: values.foodSlots.count }, (_, slot) => Object.hasOwn(row, slot)).every(Boolean);
    if (!completeFoodRow(orderRow?.[2]) || !completeFoodRow(qtyRow?.[2])
        || !Array.isArray(values.foodSlots?.order) || !Array.isArray(values.foodSlots?.qty)
        || values.foodSlots.order.length < values.foodSlots.count || values.foodSlots.qty.length < values.foodSlots.count) {
      return { unavailable: true, candy, reason: 'Saved food slots or quantities are missing or malformed.', drops: [] };
    }
    const originalOrder = orderRow[2], originalQty = qtyRow[2];
    let lastOrder = null, lastState;
    try {
      foodClaim = combatAfkFood(seconds, values, (order, qty) => {
        orderRow[2] = order; qtyRow[2] = qty;
        const signature = JSON.stringify(order);
        if (signature === lastOrder) return lastState;
        ctx.invalidate();
        const state = computeCombatSurvivability(charIdx, ctx);
        if (state.unavailable || state.notApplicable) throw new Error(state.reason || 'AFK food phase inputs are unavailable.');
        lastOrder = signature;
        return lastState = { ...state, monsterDamage: state.monsterDamage.val, expMulti: ctx.resolve('monster-exp').val };
      });
    } finally {
      orderRow[2] = originalOrder; qtyRow[2] = originalQty; ctx.invalidate();
    }
    for (const key of ['foodNotConsume', 'healthFoodEffect', 'cFoodCap', ...(values.labFoodRefill ? ['foodStorage'] : [])]) {
      const entry = built.entries[key];
      if ((entry?.partial || entry?.unavailable) && entry.note) warnings.push('Food: ' + entry.note);
    }
  }
  const rewardKills = eligible ? foodClaim.coefficient * foodClaim.final.fightingAfkRate : 0;
  const tables = { ldorRuns: 0 };
  lootDropOddsReset({ inputs: { values }, state: { cards0: values.cards0 }, rewardsState: tables, emit() {}, timeMs: 0 });
  const drops = eligible ? afkMonsterDropOutcomes(Math.floor(rewardKills), target.key, values, tables) : [];
  let exp = rewardKills * N(target.monster.ExpGiven) * (foodClaim?.final.expMulti ?? ctx.resolve('monster-exp').val);
  if (exp < 2e9) exp = Math.floor(exp);
  let creditedKills = rewardKills * ctx.resolve('kill-per-kill').val;
  if ([4, 5].includes(N(charClassData[charIdx])) && (buffsActiveData[charIdx] || []).some(b => N(b[0]) === 45)) creditedKills = 0;
  if (creditedKills < 2e9) creditedKills = Math.floor(creditedKills);
  const coin = drops.find(row => row.key === 'COIN');
  const largeCoins = rewardKills * values.dropRate
    * N(tables.monsterDrops[target.key]?.[0]?.[1]) * N(tables.monsterDrops[target.key]?.[0]?.[2]) * values.monsterCash;
  if (coin && largeCoins > 1e8) coin.expected = (largeCoins + 0.1) * coin.chance;
  if (seconds > 129240) {
    const xpBonus = computeBoxReward(charIdx, '14b'), coinBonus = computeBoxReward(charIdx, '14c');
    const xp = N(xpBonus?.val ?? xpBonus), cash = N(coinBonus?.val ?? coinBonus);
    if (xp > 0.1) exp *= 1 + xp / 100;
    if (coin && cash > 0.1) coin.expected *= 1 + cash / 100;
  }
  const progress = combatAfkProgress(S, charIdx, mapIdx, {
    hours, candy, effectiveHours: seconds / 3600, target: target.key, creditedKills,
    sceneName: MAP_SCENES[mapIdx]?.sceneName, xtraMushKillz: values.xtraMushKillz,
  }, ctx, opts.rawSave);
  for (const bonus of progress.bonusDrops) {
    const existing = drops.find(row => row.key === bonus.key);
    if (!existing) drops.push({ ...bonus });
    else {
      existing.expected += bonus.expected;
      existing.chance = 1 - (1 - existing.chance) * (1 - bonus.chance);
      existing.guaranteed ||= bonus.guaranteed;
      if (existing.minimum !== null) existing.minimum += bonus.minimum;
      existing.single = false;
    }
  }
  warnings.push(...progress.warnings);
  return {
    hours, candy, effectiveHours: seconds / 3600, target: target.key, holeCavern: target.afkCavern ? holeCavern : null, rewardKills, dropRolls: Math.floor(rewardKills), creditedKills,
    exp, coins: coin?.expected || 0, drops, food: foodClaim, progress, afkRate: foodClaim?.final.fightingAfkRate ?? survival.fightingAfkRate, survivability: foodClaim?.final.percent ?? survival.percent,
    warnings: [...new Set(warnings)], partial: warnings.length > 0,
    notes: ['One combat AFK claim, before rerolls, AFK doublers or inventory pickup limits. Food follows the native sorted, one-pass depletion/refill batch, not repeated live consumption. Saved buffs remain snapshot-backed. Active-only crystals, giants, form currencies and temporary golem bosses/opals are excluded.',
      ...(candy ? ['Candy AFK excludes Master Class quest-item drops, TranQi Divinity EXP, Harriep procs and offline Worship/Sailing/Gaming bonus time. Ordinary loot, EXP, kill credit, food consumption, prayer limits and eligible bonus-candy rolls use the normal claim rules. Enter the time granted by one candy, not a combined stack of separate claims.'] : []),
      ...(target.afkCavern ? ['The native Hole AFK rate reads the scene’s first Motherlode actor for HP, respawn and incoming damage; the chosen cavern monster controls accuracy, kill credit, EXP and loot. This is separate from live cavern combat.'] : []),
      ...progress.notes],
  };
}
