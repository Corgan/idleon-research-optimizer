// ===== SNEAKING GOAL SEARCH (W6) =====
import { NjEQ } from '../../data/game/custommaps.js';
import { emporiumBonus } from '../../../game-helpers.js';
import {
  isGoldCharm, isTwinUntied, captiveTargetForFloor, doorState, floorDropTable, floorDetectionBase,
  detectionChance, koDuration, nkBonus, nkBonusFull, maxDropLevel, sneakingActionMode, funeralStealthBonus,
} from './sneaking-math.js';
import {
  computeCoreStealthDetailed, computeActionSpeed, computeDoorDamageDetailed, computeUntieProgressDetailed,
  computeTwinStealth, computeNK11Extras, goldInventoryBonuses, twinCharmBonuses,
} from './sneaking-stealth.js';
import { computeJadeCoin, computeTeamDoorRates, computeDoorHitsPerHour } from './sneaking-jade.js';
import { computeSneakingExpPerAction, sneakingExpAccountInputs } from './sneaking-exp.js';
import { simulateSneakingFlowers, sneakingFlowerFloors } from './sneaking-flowers.js';
import { canEquipCharmPair, hypotheticalSneakingCharms } from './sneaking-optimizer.js';
import { finalBubbleValByKey } from '../w2/alchemy.js';
import { computeCompassBonus } from '../w7/compass.js';

const num = value => Number(value) || 0;
const clone = rows => rows.map(row => Array.isArray(row) ? row.slice() : row);

export function sneakingSearchFloors(S) {
  return sneakingFlowerFloors(S);
}

export function sneakingItemTargetFloors(S, key) {
  const special = /^Nj(?:TrP\d*|Sym[0-3]?)$/.test(key);
  if (!NjEQ[key] && key !== 'NjTrP' && key !== 'NjSym') return [];
  if (key.startsWith('NjSym') && (!(nkBonus(17, S.ninjaData?.[103] || []) > 0)
    || key === 'NjSym3' && !(nkBonus(29, S.ninjaData?.[103] || []) > 0))) return [];
  return sneakingSearchFloors(S).filter(floor => floorDropTable(floor, num(S.olaData?.[231]), S)
    .some(row => row.chance > 0 && (special ? num(NjEQ[row.key]?.[0]) === 2 : row.key === key)));
}

function _context(S, options) {
  if (options.allowUnownedCharms != null && typeof options.allowUnownedCharms !== 'boolean') throw new Error('Allow unowned charms must be a checkbox value');
  const nd = S.ninjaData;
  const count = S.charNames?.length || S.lv0AllData?.length || 0;
  const indices = Array.from({ length: count }, (_, i) => i).filter(i => nd?.[i] && isTwinUntied(i, nd));
  if (!indices.length) throw new Error('No untied twins available');
  const goal = options.goal || 'jade';
  if (!['jade', 'exp', 'items', 'door', 'untie'].includes(goal)) throw new Error('Unknown Sneaking objective');
  if (!Number.isFinite(options.minimumLevel ?? 0) || (options.minimumLevel ?? 0) < 0) throw new Error('Minimum item level must be nonnegative');
  const ci = options.activeCharIdx ?? 0;
  if (!Number.isInteger(ci) || ci < 0 || ci >= count) throw new Error('Invalid login context');
  if (!(Number(S.lv0AllData?.[ci]?.[16]) > 0)) throw new Error('Select a login character with Farming unlocked; native online Sneaking time requires Farming level above zero.');
  const hours = options.hours ?? 8;
  if (!Number.isFinite(hours) || hours < 0.01 || hours > 168) throw new Error('Active simulation hours must be 0.01 to 168');
  if (goal === 'items' && num(nd[102]?.[10]) < 2) throw new Error('Finish the item-finding tutorial before searching item loadouts');
  if (Array.from({ length: 39 }, (_, i) => nd[60 + i]).some(row => !Array.isArray(row) || typeof row[0] !== 'string')) throw new Error('All 39 inventory slots are required');
  if (options.expTarget != null && (!Number.isInteger(options.expTarget) || options.expTarget < 0 || options.expTarget >= count)) throw new Error('Invalid EXP recipient');
  const mastery = num(S.olaData?.[231]);
  const floors = sneakingSearchFloors(S);
  const tables = new Map(floors.map(f => [f, floorDropTable(f, mastery, S)]));
  let targetFloors = floors;
  if (goal === 'door') {
    targetFloors = floors.filter(f => doorState(f, mastery, num(S.olaData?.[232]), mastery, nd).active);
    if (!targetFloors.length) throw new Error('All doors in the current mastery are already cleared');
  } else if (goal === 'items') {
    targetFloors = sneakingItemTargetFloors(S, options.itemTarget);
    if (!targetFloors.length) throw new Error('Select an item from an accessible floor drop table');
  } else if (goal === 'untie') {
    targetFloors = floors.filter(f => f > 0 && captiveTargetForFloor(f, nd, count) >= 0);
    if (!targetFloors.length) throw new Error('No captive twins on accessible floors');
  }
  const floor = targetFloors.at(-1);
  const door = doorState(floor, mastery, num(S.olaData?.[232]), mastery, nd);
  const pool = [];
  for (const slot of [...indices.flatMap(i => [13 + 4 * i, 14 + 4 * i, 15 + 4 * i]), ...Array.from({ length: 39 }, (_, i) => 60 + i)]) {
    const row = nd[slot];
    const def = NjEQ[row?.[0]];
    if (!def || ![1, 2].includes(num(def[0])) || isGoldCharm(row[0])) continue;
    pool.push({ key: row[0], level: num(row[1]), source: slot, type: num(def[0]), bonusType: num(def[1]) });
  }
  const gold = goldInventoryBonuses(nd, S.olaData || [], S.spelunkData || [], S, ci);
  const extras = computeNK11Extras(S, ci);
  const caps = Object.fromEntries(Object.keys(NjEQ).map(key => {
    const def = NjEQ[key], type = num(def[0]);
    const cap = type === 0 || type === 2 || type === 4 ? maxDropLevel(key, nd[103] || [], mastery, extras)
      : nkBonusFull(({ 1: 12, 2: 7, 3: 6 })[num(def[1])] ?? 10, nd[103] || [], mastery, extras);
    return [key, cap];
  }));
  for (const idx of indices) {
    for (const offset of [1, 2, 3]) {
      const source = 12 + 4 * idx + offset, key = nd[source]?.[0];
      if (key && key !== 'Blank' && !pool.some(item => item.source === source)) {
        throw new Error('Unsupported equipped Sneaking item: ' + key);
      }
    }
  }
  const ownedPool = pool.slice();
  const hypothetical = options.allowUnownedCharms ? hypotheticalSneakingCharms(S, { activeCharIdx: ci, copies: 2 * indices.length }) : [];
  if (options.allowUnownedCharms) pool.splice(0, pool.length, ...ownedPool.filter(item => item.type === 1), ...hypothetical);
  const ctx = { S, nd, count, indices, pool, ownedPool, hypotheticalCharmLevel: hypothetical[0]?.level,
    floor, floors, targetFloors, goal, ci, hours, mastery, door, gold, caps, options,
    charmed: emporiumBonus(3, nd[102]?.[9]) === 1,
    expAccount: sneakingExpAccountInputs(S, ci),
    y9: num(finalBubbleValByKey('Y9ACTIVE', ci, S).val) || 1,
    compass54: computeCompassBonus(54, S),
    gemCap: nkBonusFull(6, nd[103] || [], mastery, extras),
    tables, rareTarget: /^Nj(?:TrP\d*|Sym[0-3]?)$/.test(options.itemTarget || ''),
  };
  return ctx;
}

function _saved(ctx) {
  return { floors: Array.from({ length: ctx.count }, (_, i) => num(ctx.nd[i]?.[0])),
    slots: ctx.indices.flatMap(idx => [1, 2, 3].map(offset => {
      const source = 12 + 4 * idx + offset;
      return { idx, offset, item: ctx.ownedPool.find(item => item.source === source) || null };
    })) };
}

function _copy(layout) {
  return { floors: layout.floors.slice(), slots: layout.slots.map(slot => ({ ...slot })) };
}

function _state(ctx, layout) {
  if (ctx.indices.some(idx => !ctx.floors.includes(layout.floors[idx]))) return null;
  const nd = clone(ctx.nd);
  const used = new Set();
  for (const idx of ctx.indices) nd[idx] = [layout.floors[idx], ...nd[idx].slice(1)];
  for (const slot of layout.slots) {
    if (slot.item && used.has(slot.item.source)) return null;
    if (slot.item) used.add(slot.item.source);
    nd[12 + 4 * slot.idx + slot.offset] = slot.item ? [slot.item.key, slot.item.level] : ['Blank', 0];
  }
  let scrolls = 0;
  for (const idx of ctx.indices) {
    const pair = layout.slots.filter(slot => slot.idx === idx && slot.offset > 1).map(slot => slot.item);
    if (!canEquipCharmPair(pair[0], pair[1], ctx.charmed)) return null;
    scrolls += pair.filter(item => item?.key === 'NjTr7').length;
  }
  for (let idx = 0; idx < ctx.count; idx++) {
    if (ctx.indices.includes(idx)) continue;
    scrolls += [14 + 4 * idx, 15 + 4 * idx].filter(slot => nd[slot]?.[0] === 'NjTr7').length;
  }
  if (scrolls > 1) return null;
  const movableInventory = new Set(ctx.ownedPool.filter(item => item.source >= 60).map(item => item.source));
  const free = [];
  for (let slot = 60; slot < 99; slot++) {
    if (nd[slot]?.[0] === 'Blank' || movableInventory.has(slot)) free.push(slot);
  }
  const banked = ctx.ownedPool.filter(item => !used.has(item.source));
  if (banked.length > free.length) return null;
  for (let i = 0; i < free.length; i++) nd[free[i]] = banked[i] ? [banked[i].key, banked[i].level] : ['Blank', 0];
  return { ...ctx.S, ninjaData: nd };
}

function _capture(ctx, layout) {
  const S = _state(ctx, layout);
  if (!S) return null;
  const nd = S.ninjaData;
  const groups = new Map();
  const twins = Array.from({ length: ctx.count }, (_, idx) => {
    const floor = layout.floors[idx];
    const detail = computeCoreStealthDetailed(idx, S, ctx.ci);
    const full = computeTwinStealth(idx, floor, layout.floors, S, ctx.ci);
    const cm = detail.charmMap;
    const active = isTwinUntied(idx, nd);
    const door = doorState(floor, ctx.mastery, num(S.olaData?.[232]), ctx.mastery, nd);
    const mode = sneakingActionMode(idx, floor, nd, { doorActive: door.active, playerCount: ctx.count });
    const row = {
      idx, floor, progress: num(nd[idx]?.[1]), acting: active, mode, cm,
      actionSpeed: computeActionSpeed(idx, S, ctx.ci),
      koTime: koDuration(nd[103] || [], cm[1] || 0, S.menagerieData?.[7]),
      baseStealth: full.coreStealth * full.allyBonus,
      floorDetection: floorDetectionBase(floor, ctx.mastery),
      detection: num(nd[100]?.[0]) >= 2 ? detectionChance(full.stealth, floor, ctx.mastery) : 0,
      dodgePct: cm[0] || 0, taunting: (cm[1] || 0) > 0,
      doorDamage: computeDoorDamageDetailed(idx, S, ctx.ci).damage,
      untie: computeUntieProgressDetailed(idx, S, ctx.ci).progress,
    };
    if (active) {
      if (!groups.has(floor)) groups.set(floor, []);
      groups.get(floor).push(row);
    }
    return row;
  });
  let jade = 0, exp = 0, doorRate = 0, untieRate = 0;
  for (const [floor, rows] of groups) {
    const rates = computeTeamDoorRates(rows, nd[103] || []);
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i], rate = rates[i];
      row.hitsPerHour = rate.hitsPerHour;
      if (row.mode === 'normal') jade += computeJadeCoin(row.idx, S, {
        activeCharIdx: ctx.ci, floor, mastery: ctx.mastery, twinFloors: layout.floors,
        detection: row.detection, charmBonuses: row.cm, goldBonuses: ctx.gold,
      }).coin * rate.hitsPerHour;
      if (row.mode === 'normal' || row.mode === 'training') {
        const detail = computeSneakingExpPerAction(row.idx, S, {
          activeCharIdx: ctx.ci, floor, mastery: ctx.mastery, charmBonuses: row.cm,
          accountInputs: ctx.expAccount, playerCount: ctx.count,
        });
        row.expRecipient = detail.recipientTwinIdx;
        if (ctx.options.expTarget == null || ctx.options.expTarget === detail.recipientTwinIdx) exp += detail.exp * rate.hitsPerHour;
      }
      if (floor === ctx.floor && row.mode === 'door' && row.doorDamage > 0) {
        doorRate += rate.hitsPerHour / Math.max(1, Math.ceil(ctx.door.remainingHP / row.doorDamage));
      }
      if (ctx.targetFloors.includes(floor) && row.mode === 'untie') untieRate += row.untie * rate.hitsPerHour;
    }
  }
  return { S, twins, jade, exp, doorRate, untieRate,
    free: nd.slice(60, 99).filter(row => row?.[0] === 'Blank').length,
    filled: layout.slots.filter(slot => slot.item).length };
}

function _generateItem(ctx, nd, floor, random, counters, charmCount, found) {
  const empty = nd.slice(60, 99).findIndex(row => row?.[0] === 'Blank');
  if (empty < 0) { counters.overflow++; return charmCount; }
  const table = ctx.tables.get(floor) || floorDropTable(floor, ctx.mastery, ctx.S);
  let key;
  for (let index = 0; index < table.length; index++) {
    const row = table[index];
    if (index !== table.length - 1 && random() >= row.conditionalChance) continue;
    key = row.key;
    if (!isTwinUntied(1, nd)) continue;
    if (!key.includes('NjItem') || !(random() < 0.8 && found.has(key))) break;
  }
  if (!key || !NjEQ[key]) throw new Error('Unsupported Sneaking drop table entry');
  const def = NjEQ[key], type = num(def[0]);
  const roll = random();
  let level = 0, special = false, finalKey = key, targetProbability = 0;
  if (type !== 0) {
    const cap = ctx.caps[key];
    if (type === 2) {
      level = Math.round(Math.min(Math.ceil(roll ** 2 * cap), cap));
      if (counters.targetDistribution) {
        const nk = nd[103] || [];
        const symbolChance = nkBonus(17, nk) > 0 ? Math.min(1, 0.1 * Math.max(0, 2.5 - charmCount / 30)) : 0;
        const pristineChance = Math.min(1, 0.001 * Math.max(0, 1.5 - charmCount / 80) * (1 + ctx.compass54 / 100));
        if (ctx.options.itemTarget.startsWith('NjTrP')) targetProbability = pristineChance * (1 - symbolChance) / (ctx.options.itemTarget === 'NjTrP' ? 1 : 23);
        else if (ctx.options.itemTarget === 'NjSym') targetProbability = symbolChance;
        else {
          const multi = nkBonus(20, nk);
          const first = Math.min(1, 0.1 * (1 + multi / 150));
          const next = Math.min(1, 0.1 * (1 + multi / 200));
          const last = nkBonus(29, nk) > 0 ? next : 0;
          targetProbability = symbolChance * [1 - first, first * (1 - next), first * next * (1 - last), first * next * last][Number(ctx.options.itemTarget.at(-1))];
        }
        const targetLevel = ctx.options.itemTarget.startsWith('NjSym') ? 0 : level;
        if (targetLevel < (ctx.options.minimumLevel || 0)
          || num(nd[102]?.[5]) === 1 && num(ctx.S.olaData?.[535]) === 1
            && nd.slice(12, 100).some((row, i) => i + 12 !== 60 + empty && row?.[0] === key && num(row[1]) >= targetLevel)) targetProbability = 0;
      }
      if (random() < 0.001 * Math.max(0, 1.5 - charmCount / 80) * (1 + ctx.compass54 / 100)) {
        finalKey = 'NjTrP' + Math.floor(random() * 23);
        special = true;
      }
      const nk = nd[103] || [];
      if (nkBonus(17, nk) > 0 && random() < 0.1 * Math.max(0, 2.5 - charmCount / 30)) {
        const multi = nkBonus(20, nk);
        let tier = 0;
        if (random() < 0.1 * (1 + multi / 150)) {
          tier = 1;
          if (random() < 0.1 * (1 + multi / 200)) {
            tier = 2;
            if (random() < 0.1 * (1 + multi / 200) && nkBonus(29, nk) > 0) tier = 3;
          }
        }
        finalKey = 'NjSym' + tier;
        level = 0; special = true;
      }
      charmCount++;
    } else {
      const max = type === 4 ? ctx.gemCap : cap;
      level = Math.min(Math.ceil(roll ** (type === 4 ? 3 : 2) * max), max);
    }
  }
  found.add(key);
  const slot = 60 + empty;
  nd[slot] = [finalKey, level];
  const cutoff = 0.8 + num(ctx.S.lv0AllData?.[ctx.ci]?.[17]) / (300 + num(ctx.S.lv0AllData?.[ctx.ci]?.[17])) * 0.18;
  let trash = num(nd[102]?.[5]) === 1 && !special && roll < cutoff && ![0, 4, 5].includes(type);
  if (num(nd[102]?.[5]) === 1 && num(ctx.S.olaData?.[535]) === 1) {
    if (type === 0) trash = true;
    else if ([1, 2].includes(type)) {
      for (let other = 12; other < 100; other++) {
        if (other !== slot && nd[other]?.[0] === key && num(nd[other]?.[1]) >= level) { trash = true; break; }
      }
    }
  }
  if (isTwinUntied(10, nd) && String(def[2]).includes('Kunai')) trash = true;
  if (counters.targetDistribution) {
    const distribution = counters.targetDistribution;
    counters.overflow += distribution.at(-1);
    for (let count = distribution.length - 1; count > 0; count--) {
      distribution[count] = distribution[count] * (count === distribution.length - 1 ? 1 : 1 - targetProbability)
        + distribution[count - 1] * targetProbability;
    }
    distribution[0] *= 1 - targetProbability;
    nd[slot] = ['Blank', 0];
    return charmCount;
  }
  const wanted = (finalKey === ctx.options.itemTarget
    || ['NjSym', 'NjTrP'].includes(ctx.options.itemTarget) && finalKey.startsWith(ctx.options.itemTarget))
    && level >= (ctx.options.minimumLevel || 0);
  if (trash) { nd[slot] = ['Blank', 0]; counters.trashed++; }
  else if (ctx.options.manualClearUnwanted && !wanted) {
    // Calculator-side manual cleanup follows native generation and auto-trash.
    nd[slot] = ['Blank', 0]; counters.manualCleared++;
  } else { counters.kept++; if (wanted) counters.target++; }
  return charmCount;
}

function _items(ctx, captured, trials, seed) {
  let total = 0, squared = 0, any = 0, overflow = 0, kept = 0, trashed = 0, generated = 0, manualCleared = 0;
  const byTwin = Array(ctx.count).fill(0);
  const nk = captured.S.ninjaData[103] || [];
  for (let trial = 0; trial < trials; trial++) {
    const nd = clone(captured.S.ninjaData);
    const successes = new Map();
    const doors = Array.from({ length: 12 }, (_, floor) => doorState(floor, ctx.mastery,
      num(ctx.S.olaData?.[232]), ctx.mastery, nd));
    const counters = { target: 0, overflow: 0, kept: 0, trashed: 0, manualCleared: 0 };
    if (ctx.rareTarget && ctx.options.manualClearUnwanted && captured.free > 0) {
      counters.targetDistribution = Array(captured.free + 1).fill(0);
      counters.targetDistribution[0] = 1;
    }
    const found = new Set(nd[106] || []);
    let charmCount = num(ctx.S.olaData?.[402]);
    simulateSneakingFlowers({
      twins: captured.twins, flowers: Array.from({ length: 12 }, (_, i) => num(ctx.S.spelunkData?.[15]?.[i])),
      pendingSeconds: num(nd[102]?.[2]),
      flowerGain: 1 + nkBonus(30, nk) / 100, flowerStealth: nkBonus(21, nk),
      detectionEnabled: num(nd[100]?.[0]) >= 2,
    }, {
      seconds: ctx.hours * 3600, processing: 'active', activeTown: ctx.options.activeTown,
      seed: (seed + Math.imul(trial + 1, 0x9e3779b9)) >>> 0,
      onSuccess(twin, batch) {
        const row = captured.twins.find(row => row.idx === twin.idx);
        const mode = sneakingActionMode(twin.idx, twin.floor, nd, {
          doorActive: doors[twin.floor].active && num(nd[100]?.[twin.floor]) < doors[twin.floor].maxHP,
          playerCount: ctx.count,
        });
        if (mode === 'door') nd[100][twin.floor] = num(nd[100][twin.floor]) + batch * row.doorDamage;
        if (mode === 'normal' || mode === 'training') successes.set(twin.idx, (successes.get(twin.idx) || 0) + batch);
      },
      onTwinProcessed(twin, random) {
        const count = successes.get(twin.idx) || 0;
        successes.delete(twin.idx);
        if (!count || nkBonus(14, nk, ctx.S.menagerieData?.[7]) <= 0) return;
        const cm = captured.twins.find(row => row.idx === twin.idx).cm;
        const odds = 3 * count / (count + 50) * (1 + (nkBonus(14, nk, ctx.S.menagerieData?.[7]) + num(cm[5])) / 100)
          * (1 + Math.max(0, Math.min(100, 100 * (ctx.y9 - 1))) / 100);
        const quantity = Math.floor(odds + random());
        if (!Number.isSafeInteger(quantity) || quantity > 100000) throw new Error('Item claim exceeds the bounded generation limit');
        generated += quantity;
        const before = counters.targetDistribution
          ? counters.targetDistribution.reduce((sum, p, count) => sum + p * count, 0) : counters.target;
        for (let item = 0; item < quantity; item++) charmCount = _generateItem(ctx, nd, twin.floor, random, counters, charmCount, found);
        const after = counters.targetDistribution
          ? counters.targetDistribution.reduce((sum, p, count) => sum + p * count, 0) : counters.target;
        byTwin[twin.idx] += (after - before) / trials;
      },
    });
    if (counters.targetDistribution) {
      counters.target = counters.targetDistribution.reduce((sum, p, count) => sum + p * count, 0);
      counters.kept = counters.target;
    }
    total += counters.target; squared += counters.target ** 2;
    any += counters.targetDistribution ? 1 - counters.targetDistribution[0] : Number(counters.target > 0);
    overflow += counters.overflow; kept += counters.kept; trashed += counters.trashed;
    manualCleared += counters.manualCleared;
  }
  const mean = total / trials;
  return { mean, chance: any / trials, se: trials > 1 ? Math.sqrt(Math.max(0, squared / trials - mean ** 2) / (trials - 1)) : null,
    overflow: overflow / trials, kept: kept / trials,
    trashed: ctx.rareTarget && ctx.options.manualClearUnwanted ? null : trashed / trials, generated: generated / trials,
    manualCleared: ctx.rareTarget && ctx.options.manualClearUnwanted ? null : manualCleared / trials, byTwin,
    rareEstimated: ctx.rareTarget && !!ctx.options.manualClearUnwanted };
}

function _metric(ctx, captured, trials, seed) {
  const items = ctx.goal === 'items' ? _items(ctx, captured, trials, seed) : null;
  const score = items ? items.mean : ctx.goal === 'jade' ? captured.jade : ctx.goal === 'exp' ? captured.exp
    : ctx.goal === 'door' ? captured.doorRate : captured.untieRate;
  if (!Number.isFinite(score) || score < 0) throw new Error('Nonfinite Sneaking objective');
  return { score, items };
}

function _placeLoadout(ctx, layout, option, solo = false) {
  const next = _copy(layout), targets = next.slots.filter(slot => slot.idx === option.idx);
  const used = new Set(next.slots.filter(slot => slot.idx !== option.idx).map(slot => slot.item?.source));
  const items = option.items.map(item => {
    if (!item?.hypothetical) return item;
    const copy = ctx.pool.find(copy => copy.hypothetical && copy.key === item.key && !used.has(copy.source));
    if (copy) used.add(copy.source);
    return copy;
  });
  if (items.some((item, i) => option.items[i] && !item)) return null;
  const selected = new Set(items.filter(Boolean).map(item => item.source));
  const displaced = targets.map(slot => slot.item).filter(item => item && !selected.has(item.source));
  const donors = next.slots.filter(slot => slot.idx !== option.idx && selected.has(slot.item?.source));
  for (const donor of donors) donor.item = null;
  for (let i = 0; i < targets.length; i++) targets[i].item = items[i];
  for (const donor of donors) {
    const sibling = next.slots.find(slot => slot.idx === donor.idx && slot.offset > 1 && slot !== donor)?.item;
    const index = displaced.findIndex(item => item.type === (donor.offset === 1 ? 1 : 2)
      && (donor.offset === 1 || canEquipCharmPair(item, sibling, ctx.charmed)));
    if (index >= 0) donor.item = displaced.splice(index, 1)[0];
  }
  next.floors[option.idx] = option.floor;
  if (solo) {
    const alternate = ctx.floors.find(floor => floor !== option.floor);
    if (alternate == null || next.floors.some((floor, idx) => idx !== option.idx
      && !ctx.indices.includes(idx) && ctx.nd[idx] && floor === option.floor)) return null;
    for (const idx of ctx.indices) if (idx !== option.idx && next.floors[idx] === option.floor) next.floors[idx] = alternate;
  }
  return next;
}

// Local scores shortlist whole loadouts only. Every promoted team is measured
// again with the canonical, coupled model (including Mark, inventory and RNG).
function _enumerateLoadouts(ctx, onProgress) {
  const { S } = ctx, choices = new Map();
  const stats = { orderedPairs: 0, loadouts: 0, jointCandidates: 0, rejected: 0 };
  const charmPool = ctx.pool.filter(item => item.type === 2);
  const representatives = [...new Map(charmPool.map(item => [item.key + ':' + item.level, item])).values()];
  const savedMaps = Array.from({ length: ctx.count }, (_, idx) => twinCharmBonuses(idx, ctx.nd, S.spelunkData || [], ctx.gold));
  for (let n = 0; n < ctx.indices.length; n++) {
    const idx = ctx.indices[n], nd = clone(ctx.nd), scratch = { ...S, ninjaData: nd };
    const slots = [13 + 4 * idx, 14 + 4 * idx, 15 + 4 * idx];
    nd[slots[1]] = nd[slots[2]] = ['Blank', 0];
    const core = computeCoreStealthDetailed(idx, scratch, ctx.ci).coreStealth;
    const exp = new Map(ctx.floors.map(floor => [floor, computeSneakingExpPerAction(idx, scratch, {
      activeCharIdx: ctx.ci, floor, mastery: ctx.mastery, accountInputs: ctx.expAccount,
      charmBonuses: {}, playerCount: ctx.count,
    }).exp]));
    const redirect = computeSneakingExpPerAction(idx, scratch, {
      activeCharIdx: ctx.ci, accountInputs: ctx.expAccount, charmBonuses: { 3: 1 }, playerCount: ctx.count,
    }).recipientTwinIdx;
    const jade = new Map(ctx.floors.map(floor => [floor, computeJadeCoin(idx, scratch, {
      activeCharIdx: ctx.ci, floor, mastery: ctx.mastery, charmBonuses: {}, goldBonuses: ctx.gold, detection: 0,
    }).coin]));
    const weapons = [null, ...ctx.pool.filter(item => item.type === 1)].map(item => {
      nd[slots[0]] = item ? [item.key, item.level] : ['Blank', 0];
      return { item, speed: computeActionSpeed(idx, scratch, ctx.ci, { isSolo: false }),
        damage: computeDoorDamageDetailed(idx, scratch, ctx.ci).damage,
        untie: computeUntieProgressDetailed(idx, scratch, ctx.ci).progress };
    });
    const buckets = new Map();
    function retain(role, floor, score, items) {
      if (!Number.isFinite(score) || score <= 0) return;
      const replacements = items.filter(item => item?.hypothetical).length;
      const key = floor + ':' + role + ':' + replacements, rows = buckets.get(key) || [];
      if (rows.length === 6 && score < rows.at(-1).score) return;
      const changes = items.reduce((sum, item, i) => sum + Number((item?.source ?? -1)
        !== (ctx.ownedPool.find(copy => copy.source === slots[i])?.source ?? -1)), 0);
      const pair = JSON.stringify(items.slice(1).map(item => item ? [item.key, item.level] : null));
      rows.push({ idx, floor, role, score, items, changes, pair });
      rows.sort((a, b) => b.score - a.score || a.changes - b.changes);
      const counts = new Map();
      for (let i = 0; i < rows.length;) {
        const count = (counts.get(rows[i].pair) || 0) + 1;
        counts.set(rows[i].pair, count);
        if (count > 2) rows.splice(i, 1);
        else i++;
      }
      if (rows.length > 6) rows.pop();
      buckets.set(key, rows);
    }
    // Keep distinct physical copies in owned mode; synthetic copies differ only
    // by availability, so enumerate their key/level once and allocate on placement.
    const firsts = [null, ...(ctx.options.allowUnownedCharms ? representatives : charmPool)];
    const seconds = firsts.slice();
    if (ctx.options.allowUnownedCharms) {
      for (const [pool, source] of [[firsts, slots[1]], [seconds, slots[2]]]) {
        const saved = ctx.ownedPool.find(item => item.source === source);
        if (saved) pool.push(saved);
      }
    }
    for (const first of firsts) for (let second of seconds) {
      if (first && second && first.source === second.source) {
        if (!first.hypothetical) continue;
        second = ctx.pool.find(item => item.key === first.key && item.source !== first.source);
        if (!second) continue;
      }
      if (!canEquipCharmPair(first, second, ctx.charmed)) continue;
      stats.orderedPairs++;
      nd[slots[1]] = first ? [first.key, first.level] : ['Blank', 0];
      nd[slots[2]] = second ? [second.key, second.level] : ['Blank', 0];
      const cm = twinCharmBonuses(idx, nd, S.spelunkData || [], ctx.gold);
      const stealth = core * (1 + num(cm[7]) / 100) * (1 + num(cm[4]) / 100) * (1 + num(cm[17]) / 100);
      const ko = koDuration(nd[103] || [], num(cm[1]), S.menagerieData?.[7]);
      for (const floor of ctx.floors) {
        const allied = 1 + savedMaps.reduce((sum, map, other) => sum + (other === idx ? 0 : (num(map[8]) + num(map[16])) / 100), 0);
        const funeral = 1 + funeralStealthBonus(num(S.spelunkData?.[15]?.[floor]), nd[103] || []) / 100;
        for (const weapon of weapons) {
          nd[slots[0]] = weapon.item ? [weapon.item.key, weapon.item.level] : ['Blank', 0];
          const door = doorState(floor, ctx.mastery, num(S.olaData?.[232]), ctx.mastery, nd);
          const mode = sneakingActionMode(idx, floor, nd, { doorActive: door.active, playerCount: ctx.count });
          const items = [weapon.item, first, second];
          for (const solo of [false, true]) {
            stats.loadouts++;
            const detection = num(nd[100]?.[0]) >= 2
              ? detectionChance(stealth * funeral * (solo ? 1 : allied), floor, ctx.mastery) : 0;
            const speed = weapon.speed + num(cm[2]) * (solo ? 2 : 1) / 100;
            const hits = computeDoorHitsPerHour(speed, detection, ko, cm[0]).hitsPerHour;
            let score = 0;
            if (ctx.goal === 'exp' && (mode === 'training' || mode === 'normal')) {
              const recipient = num(cm[3]) > 0 ? redirect : idx;
              if (ctx.options.expTarget == null || ctx.options.expTarget === recipient) score = exp.get(floor)
                * (1 + ((num(cm[13]) + num(cm[19])) * (solo ? 3 : 1) + num(cm[3]) + num(cm[7])) / 100)
                * Math.max(0, 1 - 100 * num(cm[5])) * hits;
            } else if (ctx.goal === 'jade' && mode === 'normal') {
              score = jade.get(floor) * (1 + (num(cm[14]) + num(cm[19])) * (solo ? 3 : 1) / 100)
                * (1 + (num(cm[6]) * (detection === 0 ? 2 : 1) + num(cm[7]) + num(cm[15])) / 100) * hits;
            } else if (ctx.goal === 'door' && floor === ctx.floor && mode === 'door' && weapon.damage > 0) {
              score = hits / Math.max(1, Math.ceil(ctx.door.remainingHP / weapon.damage));
            } else if (ctx.goal === 'untie' && ctx.targetFloors.includes(floor) && mode === 'untie') {
              score = weapon.untie * hits;
            } else if (ctx.goal === 'items' && ctx.targetFloors.includes(floor) && (mode === 'training' || mode === 'normal')) {
              score = hits * (1 + num(cm[5]) / 100);
            }
            retain(solo ? 'solo' : 'direct', floor, score, items);
          }
          retain('support', floor, num(cm[8]) + num(cm[16]), items);
          retain('mark', floor, num(cm[1]) > 0
            ? (weapon.speed + num(cm[2]) / 100) * (1 + Math.min(0.9, num(cm[0]) / 100)) / (3600 + ko) : 0, items);
        }
      }
    }
    choices.set(idx, [...buckets.values()].flat());
    onProgress({ phase: 'Enumerating legal pairs, weapons & floors', completed: n + 1, total: ctx.indices.length * 4 });
  }
  return { choices, stats };
}

export function simulateSneakingItemClaim(S, options = {}) {
  const ctx = _context(S, { ...options, goal: 'items' });
  const captured = _capture(ctx, _saved(ctx));
  if (!captured) throw new Error('Saved item loadout is not legal');
  const trials = options.trials ?? 128;
  if (!Number.isInteger(trials) || trials < 1 || trials > 512) throw new Error('Item trials must be 1 to 512');
  return _items(ctx, captured, trials, options.seed ?? 1);
}

export function optimizeSneakingLoadout(S, options = {}, onProgress = () => {}) {
  const ctx = _context(S, options);
  const limit = options.evaluationLimit ?? 256;
  const trials = options.trials ?? 128;
  if (!Number.isInteger(limit) || limit < 16 || limit > 2048) throw new Error('Search budget must be 16 to 2048 evaluations');
  if (!Number.isInteger(trials) || trials < 16 || trials > 512) throw new Error('Final item trials must be 16 to 512');
  const seed = options.seed ?? 1;
  const seen = new Map(), measured = [];
  let search;
  let evaluated = 0;
  function evaluate(layout, label, mandatory = false) {
    if (!layout) return null;
    const key = JSON.stringify([layout.floors, layout.slots.map(slot => slot.item?.hypothetical
      ? 'hypothetical:' + slot.item.key + ':' + slot.item.level : slot.item?.source ?? -1)]);
    if (seen.has(key)) return seen.get(key);
    if (!mandatory && evaluated >= limit) return null;
    const captured = _capture(ctx, layout);
    if (!captured) { seen.set(key, null); if (search) search.stats.rejected++; return null; }
    evaluated++;
    if (search) search.stats.jointCandidates++;
    const metric = _metric(ctx, captured, 8, seed);
    const row = { layout, label, ...metric, filled: captured.filled };
    seen.set(key, row); measured.push(row);
    onProgress({ phase: options.allowUnownedCharms ? 'Searching floors & hypothetical charms' : 'Searching floors & owned equipment',
      completed: search ? limit + 3 * evaluated : 0, total: 4 * (limit + 6) });
    return row;
  }
  const saved = _saved(ctx);
  const baseline = evaluate(saved, 'Saved floors & equipment', true);
  if (!baseline) throw new Error('Saved loadout cannot be represented without losing inventory or violating equipment rules');
  const togetherRows = ctx.targetFloors.map(floor => {
    const layout = _copy(saved);
    for (const idx of ctx.indices) layout.floors[idx] = floor;
    return evaluate(layout, 'All together on Floor ' + floor + ', saved equipment', true);
  });
  const rank = (a, b) => b.score - a.score || b.filled - a.filled;
  const sameFloor = togetherRows.slice().sort(rank)[0];
  const together = sameFloor.layout;
  const floorOrder = [...new Set([...togetherRows.slice().sort(rank).map(row => row.layout.floors[ctx.indices[0]]), ...ctx.floors])];
  const baselineCount = evaluated;
  search = _enumerateLoadouts(ctx, onProgress);
  const { choices } = search;
  const bestOptions = (idx, role, floor) => choices.get(idx).filter(row => row.role === role
    && (floor == null || row.floor === floor)).sort((a, b) => b.score - a.score);
  const ranked = ctx.indices.slice().sort((a, b) => Number(b === options.expTarget) - Number(a === options.expTarget)
    || (bestOptions(b, 'direct')[0]?.score || 0) - (bestOptions(a, 'direct')[0]?.score || 0) || a - b);
  // Isolating a twin is one coordinated move, not a series of losing floor moves.
  if (ctx.goal === 'jade' || ctx.goal === 'exp') {
    for (const idx of ranked) for (const floor of floorOrder) {
      if (evaluated >= baselineCount + (limit - baselineCount) * 0.25) break;
      for (const option of bestOptions(idx, 'solo', floor)) {
        if (evaluate(_placeLoadout(ctx, saved, option, true), 'Solo loadout on Floor ' + floor)) break;
      }
    }
  }
  for (const floor of floorOrder) {
    for (const farmers of [...new Set([1, Math.ceil(ranked.length / 2), ranked.length])]) {
      for (const support of ['support', 'mark']) {
        if (evaluated >= baselineCount + (limit - baselineCount) * 0.45) break;
        let layout = _copy(together);
        for (const idx of ctx.indices) layout.floors[idx] = floor;
        for (let n = 0; n < ranked.length; n++) {
          const idx = ranked[n], role = n < farmers ? 'direct' : support;
          for (const option of bestOptions(idx, role, floor)) {
            const trial = _placeLoadout(ctx, layout, option);
            if (trial && _state(ctx, trial)) { layout = trial; break; }
          }
        }
        evaluate(layout, farmers + ' farmers with ' + support + ' on Floor ' + floor);
      }
    }
  }
  function leaders() {
    const families = new Set(), rows = [];
    for (const row of measured.slice().sort(rank)) {
      const family = JSON.stringify([row.layout.floors, row.layout.slots.map(slot => slot.item?.bonusType ?? -1)]);
      if (families.has(family)) continue;
      families.add(family); rows.push(row);
      if (rows.length === 6) break;
    }
    return rows;
  }
  for (let pass = 0; pass < 3 && evaluated < limit; pass++) {
    const beam = leaders();
    const end = pass === 2 ? limit : evaluated + Math.ceil((limit - evaluated) / (3 - pass));
    for (let b = 0; b < beam.length; b++) {
      const parent = beam[b];
      const share = Math.ceil((end - evaluated) / (beam.length - b));
      const parentEnd = Math.min(end, evaluated + share);
      const order = ranked.slice(pass % ranked.length).concat(ranked.slice(0, pass % ranked.length));
      for (let alternative = 0; alternative < 9 && evaluated < parentEnd; alternative++) {
        for (const idx of order) {
          if (evaluated >= parentEnd) break;
          const role = ['direct', 'solo', 'support', 'mark'][alternative % 4];
          const options = bestOptions(idx, role);
          const option = options[Math.floor(alternative / 4)];
          if (!option) continue;
          const trial = _placeLoadout(ctx, parent.layout, option, role === 'solo');
          evaluate(trial, 'Whole-loadout & mixed-floor beam refinement');
          if (trial && alternative % 2 === 0 && evaluated < parentEnd) {
            const other = order[(order.indexOf(idx) + 1) % order.length];
            const support = bestOptions(other, 'support', option.floor)[0];
            if (other !== idx && support) evaluate(_placeLoadout(ctx, trial, support), 'Coupled farmer & support refinement');
          }
        }
      }
    }
  }
  const finalists = [...new Set([baseline, sameFloor, ...measured.slice().sort(rank).slice(0, 4)])].filter(Boolean);
  for (let i = 0; i < finalists.length; i++) {
    const row = finalists[i];
    const captured = _capture(ctx, row.layout);
    Object.assign(row, _metric(ctx, captured, trials, seed ^ 0x51ed270b));
    row.freeSlots = captured.free;
    row.twins = captured.twins.filter(twin => twin.acting).map(twin => ({
      idx: twin.idx, floor: twin.floor, mode: twin.mode, detection: twin.detection,
      hitChance: 1 - twin.detection, hitsPerHour: twin.hitsPerHour, doorDamage: twin.doorDamage, expRecipient: twin.expRecipient,
      itemRate: row.items ? row.items.byTwin[twin.idx] / ctx.hours : null,
    }));
    onProgress({ phase: 'Comparing finalists with saved baselines', completed: limit + i + 1, total: limit + finalists.length });
  }
  finalists.sort((a, b) => b.score - a.score || Number(a !== baseline) - Number(b !== baseline));
  const winner = finalists[0];
  return { goal: ctx.goal, floor: ctx.goal === 'door' ? ctx.floor : null, floors: ctx.floors.slice(),
    targetFloors: ctx.targetFloors.slice(), hours: ctx.hours, itemTarget: options.itemTarget,
    manualClearUnwanted: !!options.manualClearUnwanted,
    allowUnownedCharms: !!options.allowUnownedCharms, hypotheticalCharmLevel: ctx.hypotheticalCharmLevel,
    symbolLevels: Array.from({ length: 2 * ctx.count }, (_, i) => num(S.spelunkData?.[14]?.[i])),
    minimumLevel: options.minimumLevel || 0, expTarget: options.expTarget, activeTown: !!options.activeTown, trials, evaluated, seed,
    baseline, sameFloor, winner, finalists, search: search.stats, proven: false, remainingHP: ctx.door.remainingHP,
    partial: [
      !S.companionDataAvailable ? 'Companion metadata unavailable' : '',
      !S.activeVoteDataAvailable ? 'Server vote metadata unavailable' : '',
    ].filter(Boolean) };
}
