// ===== BREEDING SYSTEM (W4) =====
// Shiny pet breeding bonuses.

import { node } from '../../node.js';
import { label } from '../../entity-names.js';
import {
  PET_STATS, PET_SHINY_TYPE, PET_NAMES, SHINY_BONUS_PER_LV, SHINY_TYPE_TO_CAT,
  SHINY_CAT_NAMES, PET_BREED_ODDS, BREEDING_WORLDS, BREEDING_WORLD_UNLOCK_PET,
} from '../../data/w4/breeding.js';
import { menagerieUnlockOwned, petArenaCrucBonus } from '../w7/menagerie.js';
import { computeBUpg } from '../w5/hole.js';
import { mainframeBonus } from './lab.js';
import { computeMealBonus } from '../common/stats.js';
import { finalBubbleValByKey, computeVialByKey } from '../w2/alchemy.js';
import { achieveStatus } from '../common/achievement.js';
import { computeRiftSkillBonus } from './rift.js';
import { votingBonusz } from '../w2/voting.js';
import { legendPTSbonus } from '../w7/spelunking.js';
import { createStatContext } from '../../stat-context.js';
import { computeStampBonusOfTypeX } from '../w1/stamp.js';
import { optionsListData } from '../../../save/data.js';

function _savedNumber(value, name) {
  if (value == null || value === '' || !Number.isFinite(Number(value)) || Number(value) < 0)
    throw new Error('Saved ' + name + ' is missing or invalid.');
  return Number(value);
}

function _hatchModel(S, world, pet, charIdx, shiny) {
  if (!BREEDING_WORLDS.includes(world) || !Number.isInteger(pet) || !PET_STATS[world]?.[pet]
      || PET_STATS[world][pet][0] === '_')
    throw new Error('Choose a real Breeding species.');
  const B = S.breedingData;
  const owned = _savedNumber(B?.[1]?.[world], 'Breeding species count');
  if (pet >= owned) throw new Error('The selected Breeding species is not discovered.');
  const upgrade = id => _savedNumber(B?.[2]?.[id], 'Breeding upgrade ' + id);
  const genetic = _savedNumber(B?.[4 + world]?.[pet], 'species genetic level');
  const breedability = upgrade(3) > 0
    ? 1 + Math.log(Math.max(1, Math.pow(_savedNumber(B?.[13 + world]?.[pet], 'breedability progress') + 1, .725))) : 1;
  const rarityUnlocked = upgrade(5) > 0;
  let pastWorld = 1;
  const pastLevel = upgrade(7);
  if (pastLevel > 0 && world > 0) {
    const previous = _savedNumber(B?.[1]?.[world - 1], 'previous-world species count');
    const length = PET_STATS[world - 1].length;
    pastWorld = 1 + .1 * world + Math.max(1, Math.min(3, 1 + .15 * pastLevel))
      * Math.pow(previous / (length - length / 2), 3);
  }
  const failureUnlocked = upgrade(10) > 0;
  const odds = PET_BREED_ODDS[world][pet];
  let kitchenLevels = 0;
  for (let kitchen = 0; kitchen < 10; kitchen++) {
    const row = S.cookingData?.[kitchen];
    if (_savedNumber(row?.[0], 'kitchen state') === 0) break;
    for (const index of [6, 7, 8]) kitchenLevels += _savedNumber(row[index], 'kitchen upgrade');
  }
  const coefficient = (1 + 10 * _savedNumber(S.gemItemsData?.[119], 'Breeding Gem Shop level') / 100)
    * (1 + (Number(computeVialByKey('NewPet', S, charIdx))
      + Number(finalBubbleValByKey('NewPetRift', charIdx, S)) * _savedNumber(S.riftData?.[0], 'Rift level')) / 100)
    * (1 + computeStampBonusOfTypeX('NewPet', S) / 100)
    * (1 + computeMealBonus('Npet', S, charIdx) / 100)
    * Math.pow(Math.max(1, 1 + .02 * upgrade(9)), kitchenLevels / 100);
  const shinyUnlocked = shiny && upgrade(8) > 0;
  return (count, rarity, pity, shinyPity) => {
    const base = shiny
      ? (1 + shinyPity / 100) * (world > 1 ? Math.pow(.92, pet + 8 * (world - 1)) : 1) * (1e-6 + .002 / odds)
      : pet + 2 > count ? 1 / odds : 1;
    const rarityMulti = rarityUnlocked ? 1 + (.25 * Math.pow(rarity, 1.4) + Math.pow(rarity / 3, 6)) : 1;
    const failure = failureUnlocked ? Math.max(1, Math.pow(pity + 1, .3)) : 1;
    const rawChance = coefficient * base * (1 + Math.ceil(100 * Math.pow(genetic / 10, 1.9)) / 100)
      * breedability * rarityMulti * pastWorld * failure;
    if (!Number.isFinite(rawChance)) throw new Error('Breeding hatch chance is not finite.');
    const eligible = rarity > 0 && (shiny
      ? shinyUnlocked && (pet === PET_STATS[world].length - 1 || pet + 2 <= count)
      : pet < PET_STATS[world].length - 1 && pet + 2 > count);
    return { rawChance, chance: eligible ? Math.min(1, Math.max(0, rawChance)) : 0, eligible };
  };
}

export function breedingHatchOutcome(S, world, pet, charIdx = 0, { shiny = false } = {}) {
  const model = _hatchModel(S, world, pet, charIdx, shiny);
  const rarity = _savedNumber(S.breedingData?.[0]?.[0], 'front egg rarity');
  const pity = Number(S.breedingData?.[2]?.[10]) > 0
    ? _savedNumber(optionsListData[86], 'Breeding failure counter') : 0;
  const shinyPity = shiny ? _savedNumber(optionsListData[126], 'shiny failure counter') : 0;
  return model(Number(S.breedingData[1][world]), rarity, pity, shinyPity);
}

export function breedingTrashDnaDistribution(S) {
  if (_savedNumber(S.holesData?.[13]?.[52], 'DNA schematic ownership') >= 1)
    _savedNumber(S.holesData?.[9]?.[0], 'DNA schematic sediment');
  const unlock = S.menagerieData?.[2]?.[8];
  if (unlock == null) {
    if (_savedNumber(optionsListData[628], 'Crucible best round') > 0)
      throw new Error('Saved Crucible unlock ownership is missing.');
  } else if (_savedNumber(unlock, 'Crucible unlock ownership') >= 1) {
    _savedNumber(optionsListData[628], 'Crucible best round');
  }
  const bonus = computeBUpg(52, 0, S) / 100;
  const nativeOptions = { ...S, olaData: optionsListData };
  const multiplier = 1 + (petArenaCrucBonus(nativeOptions, 0) + (petArenaCrucBonus(nativeOptions, 6)
    + (petArenaCrucBonus(nativeOptions, 11) + petArenaCrucBonus(nativeOptions, 13)))) / 4;
  const outcomes = new Map();
  for (let roll = 3; roll <= 5; roll++) {
    const lo = (roll + bonus) * multiplier;
    const hi = (roll + (1 + bonus)) * multiplier;
    if (!Number.isFinite(hi) || hi < lo) throw new Error('Breeding DNA payout is not finite.');
    for (let dna = Math.floor(lo); dna < hi; dna++) {
      const probability = Math.max(0, Math.min(hi, dna + 1) - Math.max(lo, dna)) / multiplier / 3;
      if (probability) outcomes.set(dna, (outcomes.get(dna) || 0) + probability);
    }
  }
  return { outcomes: [...outcomes], expected: [...outcomes].reduce((sum, [dna, probability]) =>
    sum + dna * probability, 0) };
}

function _breedingNest(S) {
  const eggs = Array.isArray(S.breedingData?.[0])
    ? Array.from(S.breedingData[0], value => _savedNumber(value, 'egg rarity')) : null;
  if (!eggs?.length || eggs.some(value => !Number.isInteger(value)))
    throw new Error('Saved Breeding nest is missing or invalid.');
  return eggs;
}

function _breedingExpInputs(S, charIdx) {
  const counts = S.breedingData?.[1];
  const worlds = Math.max(3, _savedNumber(optionsListData[117], 'Breeding world count'));
  if (!Array.isArray(counts) || !Number.isInteger(worlds) || worlds > counts.length)
    throw new Error('Saved Breeding world count is invalid.');
  let totalFound = 0;
  for (let world = 0; world < worlds; world++) {
    const count = _savedNumber(counts[world], 'Breeding species count');
    if (!Number.isInteger(count) || (PET_STATS[world] && count > PET_STATS[world].length))
      throw new Error('Saved Breeding species count is invalid.');
    totalFound += count;
  }
  const expMulti = createStatContext({ saveData: S, charIdx, layer1: { skillType: 'Breeding' } }).resolve('skill-exp').val;
  if (!Number.isFinite(expMulti) || expMulti <= 0) throw new Error('Breeding EXP multiplier is invalid.');
  return { worlds, totalFound, expMulti };
}

function _breedingDnaResult(S) {
  try { return { expected: breedingTrashDnaDistribution(S).expected, unavailable: '' }; }
  catch (error) { return { expected: null, unavailable: error.message || String(error) }; }
}

function _breedingEggAutoUse(eggs, { totalFound, expMulti }, payout) {
  let hatches = 0, dna = payout.unavailable ? null : 0, exp = 0;
  while (hatches < 100 && eggs[hatches] > 0) {
    if (!payout.unavailable) dna += payout.expected;
    exp += (2 + Math.pow(totalFound, 1.5) * Math.pow(1.85, eggs[hatches])) * expMulti;
    hatches++;
  }
  return { hatches, dna, dnaUnavailable: payout.unavailable, exp,
    remainingEggs: eggs.slice(hatches).concat(Array(hatches).fill(0)) };
}

export function breedingEggAutoUse(S, charIdx = 0) {
  return _breedingEggAutoUse(_breedingNest(S), _breedingExpInputs(S, charIdx), _breedingDnaResult(S));
}

export function breedingEggAutoUseDistribution(S, outcomes, charIdx = 0) {
  if (!Array.isArray(outcomes) || !outcomes.length)
    throw new Error('Breeding nest outcomes are missing.');
  let mass = 0;
  const nests = outcomes.map(row => {
    if (!row || !Number.isFinite(row.probability) || row.probability < 0)
      throw new Error('Breeding nest outcome probability is invalid.');
    mass += row.probability;
    return _breedingNest({ breedingData: [row.eggs] });
  });
  if (!Number.isFinite(mass) || Math.abs(mass - 1) > 1e-9)
    throw new Error('Breeding nest outcome probabilities do not sum to one.');
  const inputs = _breedingExpInputs(S, charIdx), payout = _breedingDnaResult(S);
  const result = { hatches: 0, dna: payout.unavailable ? null : 0, exp: 0, dnaUnavailable: payout.unavailable };
  for (let index = 0; index < outcomes.length; index++) {
    const used = _breedingEggAutoUse(nests[index], inputs, payout);
    const probability = outcomes[index].probability;
    result.hatches += probability * used.hatches;
    if (!payout.unavailable) result.dna += probability * used.dna;
    result.exp += probability * used.exp;
  }
  return result;
}

export function breedingIncubation(S, charIdx = 0,
  { seconds = 0, phase = 'entry', maxCycles = 256, stateLimit = 32768 } = {}) {
  if (!['entry', 'online'].includes(phase) || !Number.isFinite(seconds) || seconds < 0
    || !Number.isInteger(maxCycles) || maxCycles < 1 || maxCycles > 4096
    || !Number.isInteger(stateLimit) || stateLimit < 1 || stateLimit > 131072)
    throw new Error('Breeding incubation options are invalid.');
  const eggs = _breedingNest(S);
  const upgrade = id => _savedNumber(S.breedingData?.[2]?.[id], 'Breeding upgrade ' + id);
  const capacity = Math.round(3 + (upgrade(2) + (_savedNumber(S.gemItemsData?.[119], 'Breeding Gem Shop level')
    + _savedNumber(S.tasksGlobalData?.[2]?.[3]?.[2], 'Breeding nest task'))));
  if (capacity < 1 || capacity > eggs.length) throw new Error('Saved Breeding nest capacity is invalid.');
  const eggSeconds = breedingEggSeconds(S, charIdx);
  let bank = _savedNumber(optionsListData[87], 'banked egg seconds') + seconds;
  if (!Number.isFinite(eggSeconds) || eggSeconds <= 0 || !Number.isFinite(bank))
    throw new Error('Breeding incubation time is invalid.');
  const entryCycles = bank > eggSeconds ? Math.floor(bank / eggSeconds) : 0;
  const rarityLevel = upgrade(5);
  const rarityBonus = (1 + .25 * rarityLevel) * Math.min(2, Math.max(1, 1 + .1 * achieveStatus(221, S)));
  const legend = phase === 'online' ? 1 + legendPTSbonus(32, S) / 100 : 1;
  if (!Number.isFinite(rarityBonus) || !Number.isFinite(legend) || legend < 0)
    throw new Error('Breeding incubation rarity factors are invalid.');
  let states = [{ eggs, probability: 1 }], cycles = 0;
  while (cycles < maxCycles && (phase === 'entry' ? cycles < entryCycles : bank > eggSeconds)) {
    bank -= eggSeconds;
    const next = new Map();
    const put = (nest, probability) => {
      if (!probability) return;
      const key = nest.join(',');
      const existing = next.get(key);
      if (existing) existing.probability += probability;
      else next.set(key, { eggs: nest, probability });
      if (next.size > stateLimit)
        throw new Error('Breeding incubation state limit exceeded; no states were discarded.');
    };
    for (const state of states) {
      let empty = -1;
      for (let slot = 0; slot < capacity; slot++) {
        if (state.eggs[slot] === 0 && (slot === 0 || state.eggs[slot - 1] !== 0)) { empty = slot; break; }
      }
      if (empty >= 0) {
        const nest = state.eggs.slice(); nest[empty] = 1;
        put(nest, state.probability);
      } else if (rarityLevel > 0) {
        let remaining = state.probability;
        for (let slot = 0; slot < capacity; slot++) {
          if (state.eggs[slot] <= 0) continue;
          const chance = Math.min(1, Math.max(0,
            Math.pow((phase === 'entry' ? .3 : .29) + .005 * rarityLevel, 1 + state.eggs[slot])
              * rarityBonus * legend));
          const nest = state.eggs.slice(); nest[slot] = Math.min(nest[slot] + 1, 11);
          put(nest, remaining * chance);
          remaining *= 1 - chance;
        }
        put(state.eggs, remaining);
      } else put(state.eggs, state.probability);
    }
    states = [...next.values()]; cycles++;
  }
  let addedEggs = 0, rarityGain = 0;
  const rarities = Array(12).fill(0);
  for (const state of states) {
    for (let slot = 0; slot < capacity; slot++) {
      addedEggs += state.probability * Number(eggs[slot] === 0 && state.eggs[slot] > 0);
      rarityGain += state.probability * (state.eggs[slot] - eggs[slot]);
      if (state.eggs[slot] > 0 && state.eggs[slot] <= 11)
        rarities[state.eggs[slot]] += state.probability;
    }
  }
  const complete = phase === 'entry' ? cycles >= entryCycles : bank <= eggSeconds;
  return { cycles, addedEggs, rarityGain, rarities, remainingSeconds: bank, complete, outcomes: states,
    partial: true, reason: 'Banked egg seconds plus credited time, with no hatching or pet deployment. '
      + (phase === 'entry' ? 'Native map-entry catch-up uses floor(bank / egg time), .30 rarity base and no Legend 32.'
        : 'Settled online catch-up uses strict bank > egg time, .29 rarity base and Legend 32; callback phase is not modeled.')
      + ' Levels, achievements and cached bonuses remain fixed.'
      + (S.achieveRegData?.[220] == null ? ' Egg-speed achievement data is missing; its shared neutral value is assumed.' : '')
      + (rarityLevel > 0 && S.achieveRegData?.[221] == null
        ? ' Egg-rarity achievement data is missing; its shared neutral value is assumed.' : '')
      + (phase === 'online' && rarityLevel > 0 && S.spelunkData?.[18]?.[32] == null
        ? ' Legend egg-rarity data is missing; its shared neutral value is assumed.' : '')
      + (complete ? '' : ` Only the first ${maxCycles} cycles are evaluated; remaining time is not extrapolated.`) };
}

export function breedingHatchSequence(S, world, pet, charIdx = 0,
  { shiny = false, maxHatches = 64, stateLimit = 32768 } = {}) {
  if (!Number.isInteger(maxHatches) || maxHatches < 1 || maxHatches > 256
    || !Number.isInteger(stateLimit) || stateLimit < 1 || stateLimit > 131072)
    throw new Error('Breeding sequence limits are invalid.');
  const B = S.breedingData;
  const firstModel = _hatchModel(S, world, pet, charIdx, shiny);
  const owned = Number(B[1][world]);
  if (!Number.isInteger(owned) || owned > PET_STATS[world].length)
    throw new Error('Saved Breeding species count is invalid.');
  if (!shiny && pet !== owned - 1) throw new Error('Normal sequences must start at the next undiscovered species.');
  if (shiny && !(Number(B[2][8]) > 0
    && (pet === PET_STATS[world].length - 1 || pet + 2 <= owned)))
    throw new Error('Shiny hatching is not unlocked for the selected species.');
  const eggs = _breedingNest(S);
  const { worlds, totalFound, expMulti } = _breedingExpInputs(S, charIdx);
  if (world >= worlds) throw new Error('The selected Breeding world is not unlocked.');
  const canUnlockWorld = world + 1 < worlds && Number(B[1][world + 1]) === 0;
  const capacity = 3 * Math.round(12 + 4 * _savedNumber(S.gemItemsData?.[124], 'pet storage upgrade'));
  if (!Array.isArray(S.petsStoredData) || S.petsStoredData.length < capacity)
    throw new Error('Saved pet storage slots are missing.');
  let free = 0;
  for (let slot = 0; slot < capacity; slot++) {
    if (!Array.isArray(S.petsStoredData[slot]) || typeof S.petsStoredData[slot][0] !== 'string')
      throw new Error('Saved pet storage slot is invalid.');
    if (S.petsStoredData[slot][0] === 'none') free++;
  }
  const upgrade = id => _savedNumber(B[2][id], 'Breeding upgrade');
  const cap = 10 * upgrade(10);
  const pity = _savedNumber(optionsListData[86], 'Breeding failure counter');
  const shinyPity = shiny ? _savedNumber(optionsListData[126], 'shiny failure counter') : 0;
  const refill = Math.min(1, Math.ceil(12 * Math.pow(upgrade(11), .698)) / 100);
  const level = _savedNumber(S.lv0AllData?.[charIdx]?.[11], 'Breeding level');
  const exp = _savedNumber(S.exp0AllData?.[charIdx]?.[11], 'Breeding EXP');
  const payout = _breedingDnaResult(S);
  const models = new Map([[pet, firstModel]]);
  const modelFor = selected => {
    if (!models.has(selected)) {
      const counts = B[1].slice();
      counts[world] = selected + 1;
      models.set(selected, _hatchModel({ ...S, breedingData: B.map((row, index) =>
        index === 1 ? counts : row) }, world, selected, charIdx, shiny));
    }
    return models.get(selected);
  };
  const threshold = 5 * expMulti;
  const initial = { eggs, owned, pity, shinyPity, free, rigExp: Math.min(exp, threshold), won: false, mass: 1 };
  const run = keep => {
    let states = [initial];
    const result = { hatches: 0, successes: 0, kept: 0, trashed: 0, dna: payout.unavailable ? null : 0, exp: 0,
      successChance: 0, stopped: { eggs: 0, storage: 0, complete: 0 }, tailProbability: 0 };
    const stop = (state, reason) => {
      result.stopped[reason] += state.mass;
      if (state.won) result.successChance += state.mass;
    };
    for (let step = 0; step < maxHatches && states.length; step++) {
      const next = new Map();
      const enqueue = state => {
        const reason = !state.free ? 'storage' : !state.eggs[0] ? 'eggs'
          : !shiny && state.owned >= PET_STATS[world].length ? 'complete' : null;
        if (reason) return stop(state, reason);
        const key = [state.eggs.join(','), state.owned, state.pity, state.shinyPity,
          state.free, state.rigExp, state.won].join('|');
        const existing = next.get(key);
        if (existing) existing.mass += state.mass;
        else next.set(key, state);
        if (next.size > stateLimit) throw new Error('Breeding sequence state limit exceeded; no states were discarded.');
      };
      for (const state of states) {
        const reason = !state.free ? 'storage' : !state.eggs[0] ? 'eggs'
          : !shiny && state.owned >= PET_STATS[world].length ? 'complete' : null;
        if (reason) { stop(state, reason); continue; }
        const selected = shiny ? pet : state.owned - 1;
        let chance = modelFor(selected)(state.owned, state.eggs[0], state.pity, state.shinyPity).chance;
        if (!shiny && world === 0 && selected === 0 && level === 1)
          chance = state.rigExp === 0 ? 0 : state.rigExp < threshold ? 1 : chance;
        for (const success of [false, true]) {
          const mass = state.mass * (success ? chance : 1 - chance);
          if (!mass) continue;
          const kept = keep && success;
          const found = totalFound + state.owned - owned
            + Number(canUnlockWorld && state.owned > BREEDING_WORLD_UNLOCK_PET[world] + 1);
          const gainedExp = ((success ? shiny ? 50 : 10 : 2)
            + Math.pow(found, 1.5) * Math.pow(1.85, state.eggs[0])) * expMulti;
          result.hatches += mass;
          result.successes += mass * Number(success);
          result.kept += mass * Number(kept);
          result.trashed += mass * Number(!kept);
          if (!payout.unavailable) result.dna += mass * (kept ? 0 : payout.expected);
          result.exp += mass * gainedExp;
          const shifted = state.eggs.slice(1).concat(0);
          const branch = { ...state, eggs: shifted, mass, owned: state.owned + Number(success && !shiny),
            pity: success ? 0 : Math.min(cap, state.pity + 1),
            shinyPity: shiny && success ? 0 : state.shinyPity, free: state.free - Number(kept),
            rigExp: Math.min(threshold, state.rigExp + gainedExp), won: state.won || success };
          if (shifted[0] === 0 && refill > 0) {
            if (refill < 1) enqueue({ ...branch, mass: mass * (1 - refill) });
            const refilled = shifted.slice();
            refilled[0] = refilled[1] = 1;
            enqueue({ ...branch, eggs: refilled, mass: mass * refill });
          } else enqueue(branch);
        }
      }
      states = [...next.values()];
    }
    for (const state of states) {
      result.tailProbability += state.mass;
      if (state.won) result.successChance += state.mass;
    }
    return result;
  };
  return { keep: run(true), trash: run(false), maxHatches, capacity, freeSlots: free, dnaUnavailable: payout.unavailable,
    partial: true, reason: 'Saved eggs plus native two-egg refills; normal targets advance within the selected world. '
      + 'Stops at empty nest, full storage, all species found or the hatch limit. '
      + 'Breeding levels and cached multipliers stay at the snapshot; EXP is banked without level settlement. '
      + 'No timed egg generation, world switching, pet deployment or quest/task rewards.' };
}

export function breedingEggSeconds(saveData, charIdx = 0) {
  const votingMulti = saveData.activeVoteIdx === 16
    ? createStatContext({ saveData, charIdx }).resolve('voting-multi').val : 1;
  return 7200 / (1 + (mainframeBonus(111, saveData)
    + (computeMealBonus('TimeEgg', saveData, charIdx)
    + (Number(finalBubbleValByKey('EggInc', charIdx, saveData))
    + (10 * achieveStatus(220, saveData)
    + (15 * computeRiftSkillBonus(10, 1, saveData) + votingBonusz(16, votingMulti, saveData)))))) / 100);
}

// Source Breeding("SpecialPassives", "Lv"): 19 thresholds, +10 with Menagerie unlock 11.
export function shinyPetLevel(exp, saveData) {
  if (exp <= 0) return 0;
  var lv = 1;
  var thresholds = Math.round(19 + 10 * menagerieUnlockOwned(saveData, 11));
  for (var e = 0; e < thresholds; e++) {
    if (exp > Math.floor((1 + Math.pow(e + 1, 1.6)) * Math.pow(1.7, e + 1)))
      lv = e + 2;
  }
  return lv;
}

export function breedingLevelTotals(saveData) {
  var breeding = saveData.breedingData;
  var result = { shiny: 0, breedability: 0, worlds: [] };
  if (!breeding || !breeding.length) return result;
  var breedabilityUnlocked = Number(breeding[2] && breeding[2][3]) > 0;
  for (var world = 0; world < 5; world++) {
    var totals = { world: world, shiny: 0, breedability: 0 };
    for (var pet = 0; pet < PET_STATS[world].length; pet++) {
      if (PET_STATS[world][pet][0] === '_') continue;
      var shinyExp = Number(breeding[22 + world] && breeding[22 + world][pet]) || 0;
      var breedExp = Number(breeding[13 + world] && breeding[13 + world][pet]) || 0;
      var multi = breedabilityUnlocked ? 1 + Math.log(Math.max(1, Math.pow(breedExp + 1, .725))) : 1;
      // Native totals count level 1 even before a species gains training progress.
      totals.shiny += Math.max(1, shinyPetLevel(shinyExp, saveData));
      totals.breedability += Math.min(9, Math.floor(Math.pow(multi - 1, .8)) + 1);
    }
    if (totals.shiny) result.worlds.push(totals);
    result.shiny += totals.shiny;
    result.breedability += totals.breedability;
  }
  return result;
}

function _shinyBonusParts(catKey, saveData) {
  var parts = [];
  var total = 0;
  for (var world = 0; world < 4; world++) {
    var shinyExps = saveData.breedingData && saveData.breedingData[22 + world];
    var petTypes = PET_SHINY_TYPE[world];
    if (!shinyExps || !petTypes) continue;
    for (var pet = 0; pet < petTypes.length; pet++) {
      var exp = shinyExps[pet] || 0;
      if (exp <= 0) continue;
      var shinyTypeIdx = petTypes[pet];
      var cat = SHINY_TYPE_TO_CAT[shinyTypeIdx];
      if (cat !== catKey) continue;
      var shinyLv = shinyPetLevel(exp, saveData);
      var bonusPerLv = SHINY_BONUS_PER_LV[shinyTypeIdx] || 0;
      var val = Math.round(shinyLv * bonusPerLv);
      total += val;
      parts.push({ world: world, pet: pet, val: val, shinyLv: shinyLv, bonusPerLv: bonusPerLv, exp: exp });
    }
  }
  return { total: total, parts: parts };
}

export function computeShinyBonusS(catKey, saveData) {
  return _shinyBonusParts(catKey, saveData).total;
}

export var shiny = {
  resolve: function(id, ctx) {
    var catName = SHINY_CAT_NAMES[id] || '#' + id;
    var r = _shinyBonusParts(id, ctx.saveData);
    var children = [];
    for (var i = 0; i < r.parts.length; i++) {
      var p = r.parts[i];
      var petName = (PET_NAMES[p.world] && PET_NAMES[p.world][p.pet]) || 'W' + p.world + ' P' + p.pet;
      children.push(node(petName, p.val, [
        node('Shiny Lv', p.shinyLv, null, { fmt: 'raw' }),
        node('Bonus/Lv', p.bonusPerLv, null, { fmt: 'raw' }),
        node('Shiny EXP', p.exp, null, { fmt: 'raw' }),
      ], { fmt: '+' }));
    }
    return node(label('Breeding', id), r.total, children.length ? children : null, { fmt: '+', note: 'breeding shiny ' + id });
  },
};
