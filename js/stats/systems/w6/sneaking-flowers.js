// ===== SNEAKING FLOWER SIMULATION (W6) =====
import { NjEQ } from '../../data/game/custommaps.js';
import { emporiumBonus } from '../../../game-helpers.js';
import {
  nkBonus, koDuration, floorDetectionBase, doorState, charmStat, isTwinUntied, minimumGearDropMastery,
} from './sneaking-math.js';
import { computeTwinStealth, computeCoreStealthDetailed, computeActionSpeed, weaponItemStat, goldInventoryBonuses } from './sneaking-stealth.js';
import { canEquipCharmPair, hypotheticalSneakingCharms } from './sneaking-optimizer.js';

function _finite(value, label, min = 0) {
  if (!Number.isFinite(value) || value < min) throw new Error('Invalid flower simulation ' + label);
  return value;
}

function _rng(seed) {
  let state = seed >>> 0;
  return () => {
    let value = state += 0x6d2b79f5;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function* _processingPasses(options, seconds, pending) {
  if (options.processing === 'active') {
    const creditInterval = options.activeTown ? 1 : 15;
    let credited = 0;
    for (let step = 1; step <= Math.floor(seconds * 100); step += 91) {
      const available = Math.floor(Math.floor(step / 100) / creditInterval) * creditInterval;
      const elapsed = available - credited + pending;
      pending = 0;
      credited = available;
      if (elapsed > 0) yield { elapsed, time: step / 100 };
    }
  } else {
    const interval = options.intervalSeconds == null ? seconds : _finite(options.intervalSeconds, 'processing interval', 1);
    for (let time = 0; time < seconds; time += interval) {
      yield { elapsed: Math.min(interval, seconds - time), time: Math.min(seconds, time + interval) };
    }
  }
}

export function simulateSneakingFlowers(config, options = {}) {
  const seconds = _finite(options.seconds, 'seconds', 0.001);
  if (options.processing != null && !['active', 'catchup'].includes(options.processing)) throw new Error('Unknown Sneaking processing mode');
  const interval = options.processing === 'active' ? 0.91
    : options.intervalSeconds == null ? seconds : _finite(options.intervalSeconds, 'processing interval', 1);
  const flowerGain = _finite(config.flowerGain, 'flower gain');
  const flowerStealth = _finite(config.flowerStealth, 'flower stealth');
  const flowers = (config.flowers || []).map((value) => _finite(value, 'starting flowers'));
  const start = flowers.slice();
  const twins = config.twins.map(twin => {
    for (const key of ['idx', 'floor', 'actionSpeed', 'koTime', 'baseStealth', 'floorDetection', 'dodgePct']) _finite(twin[key], key);
    if (!Number.isInteger(twin.floor) || twin.floor > 11 || !Number.isInteger(twin.idx)
      || twin.actionSpeed <= 0 || !Number.isFinite(twin.progress)) throw new Error('Invalid flower twin');
    return { ...twin };
  }).sort((a, b) => a.idx - b.idx);
  if (new Set(twins.map(twin => twin.idx)).size !== twins.length) throw new Error('Duplicate flower twin');
  const random = options.random || _rng(options.seed ?? 1);
  const counters = { actions: 0, batches: 0, kos: 0, redirects: 0, recipientKOs: 0, losses: 0 };
  const perTwin = twins.map(twin => ({ idx: twin.idx, kos: 0, redirected: 0, received: 0 }));
  const timeline = [];
  const passes = Math.ceil(seconds / interval);
  if (passes * twins.length > 2000000) throw new Error('Too many processing passes; shorten the run');
  let work = 0;
  function detection(twin) {
    const stealth = twin.baseStealth * (1 + (flowers[twin.floor] || 0) * flowerStealth / 100);
    return Math.max(0, Math.min(1, 1 - 1.1 * stealth / (stealth + twin.floorDetection)));
  }
  let processedSeconds = 0, pass = 0;
  for (const { elapsed, time } of _processingPasses(options, seconds, _finite(config.pendingSeconds ?? 0, 'pending seconds'))) {
    processedSeconds += elapsed;
    for (let index = 0; index < twins.length; index++) {
      const twin = twins[index];
      if (twin.acting === false) continue;
      twin.progress += elapsed * twin.actionSpeed;
      while (twin.progress >= 3600) {
        if (++work > 2000000) throw new Error('Flower action limit reached; shorten the run');
        let batch = 1;
        for (let tier = 0; tier < 10; tier++) if (twin.progress > 100 * 3600 * 2 ** tier) batch = 100 * 2 ** tier;
        counters.actions += batch;
        counters.batches++;
        const detected = random() < detection(twin) && config.detectionEnabled;
        if (detected && random() > Math.min(0.9, twin.dodgePct / 100)) {
          const before = flowers[twin.floor] || 0;
          counters.kos++;
          perTwin[index].kos++;
          twin.progress -= twin.koTime * batch;
          flowers[twin.floor] = before + flowerGain;
          for (let other = 0; other < twins.length; other++) {
            const recipient = twins[other];
            if (other === index || !recipient.taunting || recipient.floor !== twin.floor || recipient.progress <= 0) continue;
            counters.redirects++;
            perTwin[index].redirected++;
            perTwin[other].received++;
            if (random() < detection(recipient) && random() > Math.min(0.9, recipient.dodgePct / 100)) {
              recipient.progress -= recipient.koTime * batch;
              flowers[twin.floor] += batch;
              counters.recipientKOs++;
            }
            twin.progress += twin.koTime * batch + 1;
            flowers[twin.floor] = Math.max(0, flowers[twin.floor] - batch);
            break;
          }
          counters.losses += Math.max(0, before - flowers[twin.floor]);
        }
        if (!detected) options.onSuccess?.(twin, batch);
        twin.progress -= 3600 * batch;
      }
      if (twin.progress < -2 * twin.koTime) twin.progress = -0.5 * twin.koTime;
      options.onTwinProcessed?.(twin, random);
    }
    if (++pass % Math.max(1, Math.ceil(passes / 96)) === 0) {
      timeline.push({ seconds: time, flowers: flowers.reduce((sum, value, i) => sum + value - (start[i] || 0), 0) });
    }
  }
  const gained = flowers.reduce((sum, value, index) => sum + value - (start[index] || 0), 0);
  timeline.push({ seconds, flowers: gained });
  return { seconds, flowers, gained, perHour: gained / seconds * 3600, counters, perTwin,
    processedSeconds, progress: twins.map(twin => ({ idx: twin.idx, progress: twin.progress })), timeline };
}

export function sneakingFlowerFloors(S) {
  const nd = S.ninjaData || [];
  const mastery = Number(S.olaData?.[231]) || 0;
  const highest = Number(S.olaData?.[232]) || 0;
  const door = doorState(1, mastery, highest, mastery, nd);
  const last = door.activeFloor > 0 ? door.activeFloor : 11;
  return Array.from({ length: last + 1 }, (_, floor) => floor);
}

export function buildSneakingFlowerComparison(S, { floor, activeCharIdx = 0, allowUnownedCharms = false } = {}) {
  if (typeof allowUnownedCharms !== 'boolean') throw new Error('Allow unowned charms must be a checkbox value');
  if (!Number.isInteger(floor) || !sneakingFlowerFloors(S).includes(floor)) throw new Error('Choose an accessible flower floor');
  const original = S.ninjaData || [];
  if (!(Number(original[100]?.[0]) >= 2)) throw new Error('Sneaking detection is not unlocked in this save');
  const count = S.charNames?.length || S.lv0AllData?.length || 0;
  const indices = Array.from({ length: count }, (_, i) => i).filter(i => original[i] && isTwinUntied(i, original));
  if (!indices.length) throw new Error('No untied Sneaking twins available');
  const nk = original[103] || [];
  const omni = S.menagerieData?.[7] || [];
  const flowers = Array.from({ length: 12 }, (_, i) => Number(S.spelunkData?.[15]?.[i]) || 0);
  const pool = [];
  const mastery = Number(S.olaData?.[231]) || 0;
  for (const slot of [...indices.flatMap(i => [13 + 4 * i, 14 + 4 * i, 15 + 4 * i]), ...Array.from({ length: 39 }, (_, i) => 60 + i)]) {
    const row = original[slot];
    const def = NjEQ[row?.[0]];
    if (!def || ![1, 2].includes(Number(def[0])) || String(def[2]).includes('Gold_')) continue;
    if (minimumGearDropMastery(row[0], S) > mastery) continue;
    pool.push({ key: row[0], level: Number(row[1]) || 0, slot, type: Number(def[0]), bonusType: Number(def[1]) });
  }
  const hypothetical = allowUnownedCharms ? hypotheticalSneakingCharms(S, { activeCharIdx, copies: 2 * indices.length }) : [];
  if (allowUnownedCharms) {
    for (let i = pool.length - 1; i >= 0; i--) if (pool[i].type === 2) pool.splice(i, 1);
  }
  pool.push(...hypothetical.filter(item => ['NjTr1', 'NjTr2'].includes(item.key)).map(item => ({ ...item, slot: item.source })));
  const hasCharmed = emporiumBonus(3, original[102]?.[9]) === 1;
  const gold = goldInventoryBonuses(original, S.olaData || [], S.spelunkData || [], S, activeCharIdx);
  const goldPower = 1 + (Number(gold[12]) || 0) / 100;
  function capture(nd, id, label, assignments = []) {
    const state = { ...S, ninjaData: nd };
    const floors = Array.from({ length: count }, (_, i) => Number(nd[i]?.[0]) || 0);
    const twins = Array.from({ length: count }, (_, idx) => {
      const detail = computeCoreStealthDetailed(idx, state, activeCharIdx);
      const stealth = computeTwinStealth(idx, floors[idx], floors, state, activeCharIdx);
      return {
        idx, floor: floors[idx], progress: Number(nd[idx]?.[1]) || 0, acting: isTwinUntied(idx, nd),
        actionSpeed: computeActionSpeed(idx, state, activeCharIdx),
        koTime: koDuration(nk, detail.charmMap[1] || 0, omni),
        baseStealth: stealth.coreStealth * stealth.allyBonus,
        floorDetection: floorDetectionBase(floors[idx], mastery),
        dodgePct: detail.charmMap[0] || 0, taunting: (detail.charmMap[1] || 0) > 0,
      };
    });
    return { id, label, assignments, config: { twins, flowers, pendingSeconds: Number(original[102]?.[2]) || 0,
      flowerGain: 1 + nkBonus(30, nk, omni) / 100,
      flowerStealth: nkBonus(21, nk, omni), detectionEnabled: true } };
  }
  const saved = capture(original, 'saved', 'Saved floors & equipment');
  const together = original.map(row => Array.isArray(row) ? row.slice() : row);
  for (const idx of indices) together[idx][0] = floor;
  const variants = [saved, capture(together, 'together', 'All together, saved equipment')];
  const seen = new Set();
  const maxMarks = Math.min(indices.length, pool.filter(item => item.key === 'NjTr1').length);
  for (const double of hasCharmed ? [false, true] : [false]) {
    for (let marks = 0; marks <= maxMarks; marks++) {
      if (double && marks === 0) continue;
      for (const reverse of marks > 0 && marks < indices.length ? [false, true] : [false]) {
        const order = reverse ? indices.slice().reverse() : indices;
        const recipients = new Set(order.slice(0, marks));
        const remaining = pool.slice();
        const nd = together.map(row => Array.isArray(row) ? row.slice() : row);
        const assignments = [];
        function take(test, score) {
          const candidates = remaining.filter(test).sort((a, b) => score(b) - score(a)
            || Number(!!a.hypothetical) - Number(!!b.hypothetical) || a.slot - b.slot);
          if (!candidates.length) return null;
          const selected = candidates[0];
          remaining.splice(remaining.indexOf(selected), 1);
          return selected;
        }
        function put(idx, offset, item) {
          nd[12 + idx * 4 + offset] = item ? [item.key, item.level] : ['Blank', 0];
          assignments.push({ idx, offset, key: item?.key || 'Blank', level: item?.level || 0, source: item?.slot ?? null,
            ...(item?.hypothetical ? { hypothetical: true } : {}) });
        }
        for (const idx of indices) {
          put(idx, 1, take(item => item.type === 1 && item.bonusType === 0, item => weaponItemStat(item.key, item.level)));
        }
        // Reserve one physical Mark per wearer before considering duplicate Marks.
        const first = new Map();
        for (const idx of order.filter(i => recipients.has(i))) first.set(idx, take(item => item.key === 'NjTr1', item => charmStat(item.key, item.level)));
        for (const idx of indices) {
          let one = first.get(idx) || null;
          let two = double && one ? take(item => item.key === 'NjTr1', item => charmStat(item.key, item.level)) : null;
          if (!one) one = take(item => item.key === 'NjTr2', item => charmStat(item.key, item.level));
          if (!two) two = take(item => item.key === 'NjTr2' && canEquipCharmPair(one, item, hasCharmed), item => charmStat(item.key, item.level));
          const symbol = S.spelunkData?.[14] || [];
          const firstMulti = goldPower * (1 + 50 * (Number(symbol[2 * idx]) || 0) / 100);
          const secondMulti = goldPower * (1 + 50 * (Number(symbol[2 * idx + 1]) || 0) / 100);
          const firstValue = one ? charmStat(one.key, one.level) : 0;
          const secondValue = two ? charmStat(two.key, two.level) : 0;
          const firstKO = one?.bonusType === 1 ? firstValue : 0;
          const secondKO = two?.bonusType === 1 ? secondValue : 0;
          const firstSpeed = one?.bonusType === 2 ? firstValue : 0;
          const secondSpeed = two?.bonusType === 2 ? secondValue : 0;
          nd[14 + idx * 4] = ['Blank', 0];
          nd[15 + idx * 4] = ['Blank', 0];
          const speed = computeActionSpeed(idx, { ...S, ninjaData: nd }, activeCharIdx);
          const koBase = 1 + nkBonus(15, nk, omni) / 100;
          function pairScore(a, b) {
            return (speed + (firstSpeed * a + secondSpeed * b) / 100)
              * (koBase + (firstKO * a + secondKO * b) / 100);
          }
          if (pairScore(secondMulti, firstMulti) > pairScore(firstMulti, secondMulti)) [one, two] = [two, one];
          put(idx, 2, one);
          put(idx, 3, two);
        }
        const key = JSON.stringify(assignments.map(item => [item.key, item.level, item.source]));
        if (seen.has(key)) continue;
        seen.add(key);
        const label = marks + ' Mark wearer' + (marks === 1 ? '' : 's')
          + (marks > 0 && marks < indices.length ? (reverse ? ', last twins first' : ', first twins first') : '')
          + (double ? ', extra Marks' : ', Belts');
        variants.push(capture(nd, 'marks-' + variants.length, label, assignments));
      }
    }
  }
  return { floor, activeCharIdx, allowUnownedCharms, hypotheticalCharmLevel: hypothetical[0]?.level,
    symbolLevels: Array.from({ length: 2 * count }, (_, i) => Number(S.spelunkData?.[14]?.[i]) || 0),
    accrualAvailable: Number(S.lv0AllData?.[activeCharIdx]?.[16]) > 0, twins: indices.length, variants, partial: [
    !S.companionDataAvailable ? 'Companion ownership metadata unavailable' : '',
    !S.activeVoteDataAvailable ? 'Server vote metadata unavailable' : '',
  ].filter(Boolean) };
}

export function compareSneakingFlowers(plan, options, onProgress = () => {}) {
  if (options.processing === 'active' && plan.accrualAvailable === false) throw new Error('Select a login character with Farming unlocked; native online Sneaking time requires Farming level above zero.');
  const trials = options.trials ?? 64;
  if (!Number.isInteger(trials) || trials < 1 || trials > 256) throw new Error('Flower trials must be 1 to 256');
  const total = plan.variants.length * trials;
  const passes = Math.ceil(options.seconds / (options.processing === 'active' ? 0.91 : options.intervalSeconds ?? options.seconds));
  const rows = Math.max(...plan.variants.map(variant => variant.config.twins.length));
  if (passes * rows * total > 50000000) throw new Error('Comparison too large; shorten the run or reduce trials');
  let completed = 0;
  const results = plan.variants.map(variant => {
    let mean = 0, m2 = 0, min = Infinity, max = -Infinity;
    const counters = {};
    for (let trial = 0; trial < trials; trial++) {
      const run = simulateSneakingFlowers(variant.config, { ...options, seed: ((options.seed ?? 1) + Math.imul(trial + 1, 0x9e3779b9)) >>> 0 });
      const delta = run.gained - mean;
      mean += delta / (trial + 1);
      m2 += delta * (run.gained - mean);
      min = Math.min(min, run.gained);
      max = Math.max(max, run.gained);
      for (const [key, value] of Object.entries(run.counters)) counters[key] = (counters[key] || 0) + value / trials;
      onProgress({ completed: ++completed, total, label: variant.label });
    }
    return { id: variant.id, label: variant.label, assignments: variant.assignments, mean, min, max,
      se: trials > 1 ? Math.sqrt(m2 / (trials - 1) / trials) : null,
      perHour: mean / options.seconds * 3600, counters };
  });
  return { ...options, trials, floor: plan.floor, twins: plan.twins, partial: plan.partial, results,
    allowUnownedCharms: !!plan.allowUnownedCharms, hypotheticalCharmLevel: plan.hypotheticalCharmLevel,
    symbolLevels: plan.symbolLevels };
}
