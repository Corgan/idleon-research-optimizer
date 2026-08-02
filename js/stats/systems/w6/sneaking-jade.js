// ===== SNEAKING JADE (W6) =====
// Exact Ninja("coin") and in-game DN5 jade/hour formulas.

import { TaskShopDesc } from '../../data/game/customlists.js';
import {
  captiveTargetForFloor,
  detectionChance,
  floorJadeBase,
  itemFindExpectedFromRate,
  nkBonus,
  sneakingActionMode,
  untieReq,
} from './sneaking-math.js';
import {
  computeTwinStealth,
  computeDoorDamageDetailed,
  computeUntieProgressDetailed,
  buildDoorDamageBreakdown,
  gemstoneBonus,
  goldInventoryBonuses,
  twinCharmBonuses,
} from './sneaking-stealth.js';
import { computeMonumentROGbonus } from '../w5/hole.js';
import { pristineBon } from '../w5/pristine.js';
import { computeVialByKey, sigilBonus } from '../w2/alchemy.js';
import { computeMealBonus } from '../common/stats.js';
import { computeCardLv } from '../common/cards.js';
import { computeSlabboBonus, computeMSABonus } from '../w4/gaming.js';
import { computeStampBonusOfTypeX } from '../w1/stamp.js';
import { computeCropSC, computeExoticBonus } from './farming.js';
import { computeWinBonus } from './summoning.js';
import { arcadeBonus } from '../w2/arcade.js';
import { vaultUpgBonus } from '../common/vault.js';
import { computeStarSignBonus } from '../common/starSign.js';
import { computeKillroyBonus, computeRiftSkillBonus } from '../w4/rift.js';
import { computeCompassBonus } from '../w7/compass.js';
import { companions } from '../common/companions.js';
import { achieveStatus } from '../common/achievement.js';
import { computeMeritocBonusz } from '../w7/meritoc.js';
import { node } from '../../node.js';

function _num(value) {
  return Number(value) || 0;
}

function _defaultFloors(saveData) {
  var ninja = saveData.ninjaData || [];
  var count = (saveData.charNames && saveData.charNames.length)
    || (saveData.lv0AllData && saveData.lv0AllData.length)
    || 10;
  var floors = [];
  for (var i = 0; i < count; i++) floors.push(_num(ninja[i] && ninja[i][0]));
  return floors;
}

function _isSolo(twinIdx, floor, floors) {
  for (var i = 0; i < floors.length; i++) {
    if (i !== twinIdx && floors[i] === floor) return false;
  }
  return true;
}

export function combineJadeFactors(factors) {
  return factors.u * factors.o * factors.e * factors.g * factors.d * factors.b
    * factors.N * factors.y * factors.R * factors.A * factors.G;
}

export function computeJadeActionsPerHour(actionSpeed, detection, koTime, dodgePct) {
  var dodge = Math.min(0.9, _num(dodgePct) / 100);
  var hitChance = Math.max(0, 1 - detection);
  var koChance = detection * (1 - dodge);
  var detectionCycles = detection >= 1
    ? Infinity
    : (1 / (1 - detection) - 1) * (1 - dodge);
  if (detection >= 1) return {
    actionsPerHour: 0,
    detectionCycles: detectionCycles,
    hitChance: hitChance,
    koChance: koChance,
    dodge: dodge,
  };
  return {
    actionsPerHour: 3600 * _num(actionSpeed) / (3600 + detectionCycles * (3600 + _num(koTime))),
    detectionCycles: detectionCycles,
    hitChance: hitChance,
    koChance: koChance,
    dodge: dodge,
  };
}

// Exact runtime door throughput from the native action loop.
// Every attempt consumes 3600 progress. A detected, non-dodged attempt also
// consumes KOtime progress; detected attempts never hit, even when dodged.
export function computeDoorHitsPerHour(actionSpeed, detection, koTime, dodgePct) {
  var speed = _num(actionSpeed);
  var det = Math.max(0, Math.min(1, _num(detection)));
  var dodge = Math.min(0.9, _num(dodgePct) / 100);
  var hitChance = 1 - det;
  var koChance = det * (1 - dodge);
  var progressPerAttempt = 3600 + koChance * _num(koTime);
  var attemptsPerHour = progressPerAttempt > 0
    ? 3600 * speed / progressPerAttempt
    : 0;
  return {
    hitsPerHour: attemptsPerHour * hitChance,
    attemptsPerHour: attemptsPerHour,
    hitChance: hitChance,
    koChance: koChance,
    dodge: dodge,
    progressPerAttempt: progressPerAttempt,
  };
}

export function computeDoorClearEstimate(remainingHP, damagePerHour, hitsPerHour) {
  var hp = Math.max(0, _num(remainingHP));
  var damageRate = Math.max(0, _num(damagePerHour));
  var hitRate = Math.max(0, _num(hitsPerHour));
  if (hp <= 0) return { hours: 0, requiredHits: 0, averageDamagePerHit: 0, fluidHours: 0 };
  if (!(damageRate > 0) || !(hitRate > 0)) {
    return { hours: Infinity, requiredHits: Infinity, averageDamagePerHit: 0, fluidHours: Infinity };
  }
  var averageDamagePerHit = damageRate / hitRate;
  var requiredHits = Math.max(1, Math.ceil(hp / averageDamagePerHit));
  return {
    hours: requiredHits / hitRate,
    requiredHits: requiredHits,
    averageDamagePerHit: averageDamagePerHit,
    fluidHours: hp / damageRate,
  };
}

function _offlineBatchExpectations(twins, hours, options) {
  options = options || {};
  var batchHours = Math.max(0.01, Number(hours) || 1);
  var stateLimit = Math.max(16, Math.min(512, Math.floor(Number(options.stateLimit) || 64)));
  var order = twins.map(function(twin, idx) { return idx; }).sort(function(left, right) {
    return _num(twins[left] && twins[left].idx) - _num(twins[right] && twins[right].idx);
  });
  var initialFlowers = Math.max(0, _num(options.initialFlowers));
  var funeralPerFlower = nkBonus(21, options.nkLevels || []);
  var initialFuneralMulti = 1 + initialFlowers * funeralPerFlower / 100;
  var detectionEnabled = options.detectionEnabled !== false;
  var meta = { approximate: false };

  function _cloneState(state) {
    return {
      probability: state.probability,
      progress: state.progress.slice(),
      flowers: state.flowers,
      flowerCredits: state.flowerCredits.slice(),
      itemCounts: state.itemCounts.slice(),
      doorProgress: state.doorProgress,
      captiveProgress: state.captiveProgress,
    };
  }

  function _numberKey(value) {
    if (!Number.isFinite(value)) return String(value);
    return Number(value.toPrecision(13)).toString();
  }

  function _stateKey(state) {
    return state.progress.map(_numberKey).join(',') + '|'
      + _numberKey(state.flowers) + '|'
      + state.itemCounts.map(_numberKey).join(',') + '|'
      + _numberKey(state.doorProgress) + '|'
      + _numberKey(state.captiveProgress);
  }

  function _mergeStates(states) {
    var merged = new Map();
    for (var stateIdx = 0; stateIdx < states.length; stateIdx++) {
      var state = states[stateIdx];
      if (!(state.probability > 1e-15)) continue;
      var key = _stateKey(state);
      var existing = merged.get(key);
      if (!existing) {
        merged.set(key, state);
        continue;
      }
      var combinedProbability = existing.probability + state.probability;
      for (var creditIdx = 0; creditIdx < existing.flowerCredits.length; creditIdx++) {
        existing.flowerCredits[creditIdx] = (
          existing.flowerCredits[creditIdx] * existing.probability
          + state.flowerCredits[creditIdx] * state.probability
        ) / combinedProbability;
      }
      existing.probability = combinedProbability;
    }
    var rows = Array.from(merged.values());
    if (rows.length <= stateLimit) return rows;

    meta.approximate = true;
    rows.sort(function(left, right) { return right.probability - left.probability; });
    var kept = rows.slice(0, stateLimit - 1);
    var tail = rows.slice(stateLimit - 1);
    var tailProbability = tail.reduce(function(sum, state) { return sum + state.probability; }, 0);
    var averaged = _cloneState(tail[0]);
    averaged.probability = tailProbability;
    function _weighted(field, index) {
      return tail.reduce(function(sum, state) {
        var value = index == null ? state[field] : state[field][index];
        return sum + state.probability * value;
      }, 0) / tailProbability;
    }
    for (var progressIdx = 0; progressIdx < averaged.progress.length; progressIdx++) {
      averaged.progress[progressIdx] = _weighted('progress', progressIdx);
      averaged.itemCounts[progressIdx] = _weighted('itemCounts', progressIdx);
      averaged.flowerCredits[progressIdx] = _weighted('flowerCredits', progressIdx);
    }
    averaged.flowers = _weighted('flowers');
    averaged.doorProgress = _weighted('doorProgress');
    averaged.captiveProgress = _weighted('captiveProgress');
    kept.push(averaged);
    return kept;
  }

  function _detectionAt(twinIdx, flowerCount) {
    if (!detectionEnabled) return 0;
    var twin = twins[twinIdx] || {};
    if (!Number.isFinite(Number(twin.stealth)) || initialFuneralMulti <= 0) {
      return Math.max(0, Math.min(1, _num(twin.detection)));
    }
    var stealthWithoutFlowers = Number(twin.stealth) / initialFuneralMulti;
    var stealth = stealthWithoutFlowers * (1 + Math.max(0, flowerCount) * funeralPerFlower / 100);
    return detectionChance(stealth, options.floor, options.mastery);
  }

  function _actionMode(actor, state) {
    var twin = twins[actor] || {};
    if (Number(options.floor) <= 0) return 'training';
    if (_num(twin.weaponSubtype) === 1 && options.doorMaxHP > 0
      && state.doorProgress < options.doorMaxHP) return 'door';
    // GenINFO[89] is refreshed only after the outer offline pass, so a Kunai
    // remains in Untie dispatch for the rest of this processed batch.
    if (_num(twin.weaponSubtype) === 2 && options.untieBatchActive) return 'untie';
    return 'normal';
  }

  function _successfulBranch(state, actor, multiplier) {
    var next = _cloneState(state);
    var twin = twins[actor] || {};
    var mode = _actionMode(actor, next);
    if (mode === 'normal' || mode === 'training') {
      next.itemCounts[actor] += multiplier;
    } else if (mode === 'door') {
      next.doorProgress += _num(twin.doorDamagePerHit) * multiplier;
    } else if (mode === 'untie' && next.captiveProgress < options.captiveRequirement) {
      next.captiveProgress += _num(twin.untieProgressPerHit) * multiplier;
    }
    next.progress[actor] -= 3600 * multiplier;
    return next;
  }

  function _detectedDodgeBranch(state, actor, multiplier) {
    var next = _cloneState(state);
    next.progress[actor] -= 3600 * multiplier;
    return next;
  }

  function _detectedKoBranches(state, actor, multiplier) {
    var actorTwin = twins[actor] || {};
    var target = -1;
    for (var targetOrderIdx = 0; targetOrderIdx < order.length; targetOrderIdx++) {
      var candidate = order[targetOrderIdx];
      if (candidate !== actor && twins[candidate] && twins[candidate].taunting
        && state.progress[candidate] > 0) {
        target = candidate;
        break;
      }
    }
    if (target < 0) {
      var independent = _cloneState(state);
      independent.progress[actor] -= _num(actorTwin.koTime) * multiplier;
      independent.flowers += 1;
      independent.flowerCredits[actor] += 1;
      independent.progress[actor] -= 3600 * multiplier;
      return [independent];
    }

    var targetTwin = twins[target] || {};
    var targetDodge = Math.min(0.9, _num(targetTwin.dodgePct) / 100);
    var targetKoChance = _detectionAt(target, state.flowers + 1) * (1 - targetDodge);
    var targetSafe = _cloneState(state);
    targetSafe.probability *= 1 - targetKoChance;
    targetSafe.progress[actor] += 1 - 3600 * multiplier;
    var targetSafeFlowers = Math.max(0, targetSafe.flowers + 1 - multiplier);
    targetSafe.flowerCredits[actor] += targetSafeFlowers - targetSafe.flowers;
    targetSafe.flowers = targetSafeFlowers;

    var targetKo = _cloneState(state);
    targetKo.probability *= targetKoChance;
    targetKo.progress[actor] += 1 - 3600 * multiplier;
    targetKo.progress[target] -= _num(targetTwin.koTime) * multiplier;
    targetKo.flowers += 1;
    targetKo.flowerCredits[actor] += 1;
    return [targetSafe, targetKo];
  }

  var states = [{
    probability: 1,
    progress: twins.map(function(twin) { return _num(twin.actionProgress); }),
    flowers: initialFlowers,
    flowerCredits: Array(twins.length).fill(0),
    itemCounts: Array(twins.length).fill(0),
    doorProgress: Math.max(0, _num(options.doorProgress)),
    captiveProgress: Math.max(0, _num(options.captiveProgress)),
  }];

  for (var orderIdx = 0; orderIdx < order.length; orderIdx++) {
    var actor = order[orderIdx];
    var actorTwin = twins[actor] || {};
    for (var initialStateIdx = 0; initialStateIdx < states.length; initialStateIdx++) {
      states[initialStateIdx].progress[actor] += 3600 * _num(actorTwin.actionSpeed) * batchHours;
    }
    var pending = states;
    var finished = [];
    var steps = 0;
    while (pending.length > 0) {
      if (steps++ >= 50000) {
        meta.approximate = true;
        finished = finished.concat(pending);
        break;
      }
      var nextPending = [];
      for (var pendingIdx = 0; pendingIdx < pending.length; pendingIdx++) {
        var state = pending[pendingIdx];
        if (state.progress[actor] < 3600) {
          finished.push(state);
          continue;
        }
        var multiplier = 1;
        for (var tier = 0; tier < 10; tier++) {
          if (state.progress[actor] > 360000 * Math.pow(2, tier)) multiplier = 100 * Math.pow(2, tier);
        }
        var actorDetection = _detectionAt(actor, state.flowers);
        var actorDodge = Math.min(0.9, _num(actorTwin.dodgePct) / 100);
        var successProbability = 1 - actorDetection;
        var dodgeProbability = actorDetection * actorDodge;
        var koProbability = actorDetection * (1 - actorDodge);
        if (successProbability > 0) {
          var success = _successfulBranch(state, actor, multiplier);
          success.probability *= successProbability;
          nextPending.push(success);
        }
        if (dodgeProbability > 0) {
          var dodged = _detectedDodgeBranch(state, actor, multiplier);
          dodged.probability *= dodgeProbability;
          nextPending.push(dodged);
        }
        if (koProbability > 0) {
          var koSource = _cloneState(state);
          koSource.probability *= koProbability;
          nextPending = nextPending.concat(_detectedKoBranches(koSource, actor, multiplier));
        }
      }
      pending = _mergeStates(nextPending);
      finished = _mergeStates(finished);
    }
    states = _mergeStates(finished);
    for (var clampIdx = 0; clampIdx < states.length; clampIdx++) {
      if (states[clampIdx].progress[actor] < -2 * _num(actorTwin.koTime)) {
        states[clampIdx].progress[actor] = -0.5 * _num(actorTwin.koTime);
      }
    }
  }

  var probabilityTotal = states.reduce(function(sum, state) { return sum + state.probability; }, 0) || 1;
  var rates = twins.map(function(twin, twinIdx) {
    return states.reduce(function(sum, state) {
      return sum + state.probability * state.flowerCredits[twinIdx];
    }, 0) / probabilityTotal / batchHours;
  });
  var itemStats = twins.map(function(twin, twinIdx) {
    var pmfMap = new Map();
    for (var stateIdx = 0; stateIdx < states.length; stateIdx++) {
      var count = states[stateIdx].itemCounts[twinIdx];
      var key = _numberKey(count);
      var row = pmfMap.get(key) || { count: count, probability: 0 };
      row.probability += states[stateIdx].probability / probabilityTotal;
      pmfMap.set(key, row);
    }
    var pmf = Array.from(pmfMap.values());
    var mean = pmf.reduce(function(sum, row) { return sum + row.count * row.probability; }, 0);
    var variance = pmf.reduce(function(sum, row) {
      return sum + Math.pow(row.count - mean, 2) * row.probability;
    }, 0);
    var probabilityZero = pmf.reduce(function(sum, row) {
      return sum + (row.count <= 0 ? row.probability : 0);
    }, 0);
    return { mean: mean, variance: variance, probabilityZero: probabilityZero, pmf: pmf };
  });
  rates.approximate = meta.approximate;
  rates.finalFlowers = states.reduce(function(sum, state) {
    return sum + state.probability * state.flowers;
  }, 0) / probabilityTotal;
  rates.itemStats = itemStats;
  rates.stateCount = states.length;
  rates.stateLimit = stateLimit;
  return rates;
}

function _solveLinearSystem(matrix, values) {
  var size = values.length;
  var rows = [];
  for (var rowIdx = 0; rowIdx < size; rowIdx++) {
    rows[rowIdx] = matrix[rowIdx].slice();
    rows[rowIdx].push(values[rowIdx]);
  }
  for (var col = 0; col < size; col++) {
    var pivot = col;
    for (var candidate = col + 1; candidate < size; candidate++) {
      if (Math.abs(rows[candidate][col]) > Math.abs(rows[pivot][col])) pivot = candidate;
    }
    if (Math.abs(rows[pivot][col]) < 1e-12) return null;
    if (pivot !== col) {
      var swap = rows[col]; rows[col] = rows[pivot]; rows[pivot] = swap;
    }
    var divisor = rows[col][col];
    for (var normalize = col; normalize <= size; normalize++) rows[col][normalize] /= divisor;
    for (var eliminate = 0; eliminate < size; eliminate++) {
      if (eliminate === col) continue;
      var factor = rows[eliminate][col];
      if (factor === 0) continue;
      for (var cell = col; cell <= size; cell++) rows[eliminate][cell] -= factor * rows[col][cell];
    }
  }
  return rows.map(function(row) { return row[size]; });
}

// Team expected-progress model for the native Taunting Mark redirect loop.
// Each twin targets the first other Taunting Mark wearer on the floor. The
// resulting linear system allocates external expected KO progress to taunters.
export function computeTeamDoorRates(twins) {
  twins = twins || [];
  var count = twins.length;
  var matrix = [];
  var values = [];
  var target = [];
  var koChance = [];
  for (var i = 0; i < count; i++) {
    target[i] = -1;
    for (var other = 0; other < count; other++) {
      if (other !== i && twins[other] && twins[other].taunting) {
        target[i] = other;
        break;
      }
    }
    var detection = Math.max(0, Math.min(1, _num(twins[i] && twins[i].detection)));
    var dodge = Math.min(0.9, _num(twins[i] && twins[i].dodgePct) / 100);
    koChance[i] = detection * (1 - dodge);
    matrix[i] = Array(count).fill(0);
    matrix[i][i] = 3600 + (target[i] < 0
      ? koChance[i] * _num(twins[i] && twins[i].koTime)
      : -koChance[i]);
    values[i] = 3600 * _num(twins[i] && twins[i].actionSpeed);
  }
  for (var victim = 0; victim < count; victim++) {
    var taunter = target[victim];
    if (taunter < 0) continue;
    matrix[taunter][victim] += koChance[victim] * koChance[taunter]
      * _num(twins[taunter] && twins[taunter].koTime);
  }

  var attempts = _solveLinearSystem(matrix, values);
  if (!attempts || attempts.some(function(value) { return !Number.isFinite(value) || value < 0; })) {
    attempts = twins.map(function(twin) {
      return computeDoorHitsPerHour(twin.actionSpeed, twin.detection, twin.koTime, twin.dodgePct).attemptsPerHour;
    });
  }
  var results = twins.map(function(twin, idx) {
    var detection = Math.max(0, Math.min(1, _num(twin && twin.detection)));
    var dodge = Math.min(0.9, _num(twin && twin.dodgePct) / 100);
    var speed = _num(twin && twin.actionSpeed);
    var progressPerAttempt = attempts[idx] > 0 ? 3600 * speed / attempts[idx] : 0;
    return {
      attemptsPerHour: attempts[idx],
      hitsPerHour: attempts[idx] * (1 - detection),
      hitChance: 1 - detection,
      koChance: koChance[idx],
      detection: detection,
      dodge: dodge,
      progressPerAttempt: progressPerAttempt,
      expectedKoProgress: progressPerAttempt - 3600,
      tauntTarget: target[idx],
      taunting: !!(twin && twin.taunting),
      coupled: target[idx] >= 0 || twins.some(function(entry, entryIdx) { return target[entryIdx] === idx; }),
      flowersPerHour: 0,
    };
  });
  for (var sourceIdx = 0; sourceIdx < count; sourceIdx++) {
    var sourceTarget = target[sourceIdx];
    if (sourceTarget < 0) {
      results[sourceIdx].flowersPerHour += attempts[sourceIdx] * koChance[sourceIdx];
    } else {
      results[sourceTarget].flowersPerHour += attempts[sourceIdx] * koChance[sourceIdx] * koChance[sourceTarget];
    }
  }
  return results;
}

export function computeJadeCoin(twinIdx, saveData, options) {
  options = options || {};
  var ninja = saveData.ninjaData || [];
  var nkLevels = ninja[103] || [];
  var ola = saveData.olaData || [];
  var activeCharIdx = options.activeCharIdx != null ? options.activeCharIdx : 0;
  var floor = options.floor != null ? options.floor : _num(ninja[twinIdx] && ninja[twinIdx][0]);
  var mastery = options.mastery != null ? options.mastery : _num(ola[231]);
  var floors = options.twinFloors || _defaultFloors(saveData);
  var isSolo = options.isSolo != null ? options.isSolo : _isSolo(twinIdx, floor, floors);
  var sneakLv = _num(saveData.lv0AllData && saveData.lv0AllData[twinIdx] && saveData.lv0AllData[twinIdx][17]);

  var goldBonuses = options.goldBonuses
    || goldInventoryBonuses(ninja, ola, saveData.spelunkData || [], saveData, activeCharIdx);
  var charmBonuses = options.charmBonuses
    || twinCharmBonuses(twinIdx, ninja, saveData.spelunkData || [], goldBonuses);

  var detection = options.detection;
  if (detection == null) {
    var currentStealth = computeTwinStealth(twinIdx, floor, floors, saveData, activeCharIdx).stealth;
    detection = detectionChance(currentStealth, floor, mastery);
  }

  var bonus14 = _num(charmBonuses[14]) * (isSolo ? 3 : 1);
  var bonus19 = _num(charmBonuses[19]) * (isSolo ? 3 : 1);
  var bonus6 = _num(charmBonuses[6]) * (detection === 0 ? 2 : 1);

  var u = 1 + nkBonus(8, nkLevels) * sneakLv / 100;
  var gemShop = Math.max(1, Math.pow(2, _num(saveData.gemItemsData && saveData.gemItemsData[10])));
  var monument = computeMonumentROGbonus(2, 2, saveData);
  var pristine = pristineBon(13, saveData);
  var vial = _num(computeVialByKey('6Jade', saveData, activeCharIdx));
  var meal = _num(computeMealBonus('zJade', saveData, activeCharIdx));
  var cardLv = computeCardLv('w6b4', saveData);
  var killroy = computeKillroyBonus(2, saveData);
  var o = gemShop
    * (1 + (bonus14 + bonus19) / 100)
    * (1 + monument / 100)
    * (1 + pristine / 100)
    * (1 + nkBonus(28, nkLevels) / 100)
    * (1 + _num(goldBonuses[9]) / 100)
    * Math.max(1, killroy)
    * (1 + (vial + meal + 4 * cardLv) / 100);

  var e = 1 + (bonus6 + _num(charmBonuses[7]) + _num(charmBonuses[15])) / 100;
  var slab = computeSlabboBonus(4, saveData);
  var stamp = computeStampBonusOfTypeX('JadeCoin', saveData, activeCharIdx);
  var g = 1 + (slab + stamp) / 100;
  var crop = computeCropSC(2, saveData);
  var d = 1 + crop / 100;
  var win = computeWinBonus(1, { charIdx: activeCharIdx }, saveData);
  var b = 1 + win / 100;

  var msa = computeMSABonus(7, saveData);
  var sigil = sigilBonus(23, saveData, activeCharIdx);
  var arcade = _num(arcadeBonus(35, saveData));
  var vault = vaultUpgBonus(81, saveData);
  var star = _num(computeStarSignBonus('Jade', activeCharIdx, saveData).val);
  var taskBase = _num(TaskShopDesc[5] && TaskShopDesc[5][3] && TaskShopDesc[5][3][11]);
  var taskLv = _num(saveData.tasksGlobalData && saveData.tasksGlobalData[2]
    && saveData.tasksGlobalData[2][5] && saveData.tasksGlobalData[2][5][3]);
  var bigN = (1 + (msa + sigil + arcade + vault) / 100)
    * (1 + star / 100)
    * (1 + taskBase * taskLv / 100);

  var rift = computeRiftSkillBonus(16, 1, saveData);
  var compass = computeCompassBonus(41, saveData);
  var companion = companions(163, saveData);
  var y = (1 + 10 * rift / 100)
    * (1 + compass / 100)
    * (1 + 99 * companion);

  var bigR = 1 + (3 * achieveStatus(366, saveData)
    + 5 * achieveStatus(369, saveData)
    + 7 * achieveStatus(367, saveData)) / 100;

  var gem1 = gemstoneBonus(1, ola, saveData, activeCharIdx);
  var merit = computeMeritocBonusz(6, saveData, activeCharIdx);
  var exotic = computeExoticBonus(58, saveData);
  var bigA = (1 + gem1 / 100) * (1 + merit / 100) * (1 + exotic / 100);
  var finalG = 1 + _num(goldBonuses[23]) * Math.floor(sneakLv / 10) / 100;

  var factors = { u: u, o: o, e: e, g: g, d: d, b: b, N: bigN, y: y, R: bigR, A: bigA, G: finalG };
  var multiplier = combineJadeFactors(factors);
  var baseJade = floorJadeBase(floor, mastery);

  return {
    coin: baseJade * multiplier,
    baseJade: baseJade,
    multiplier: multiplier,
    detection: detection,
    factors: factors,
    bonuses: {
      gemShop: gemShop,
      monument: monument,
      pristine: pristine,
      vial: vial,
      meal: meal,
      cardLv: cardLv,
      killroy: killroy,
      slab: slab,
      stamp: stamp,
      crop: crop,
      win: win,
      msa: msa,
      sigil: sigil,
      arcade: arcade,
      vault: vault,
      star: star,
      task: taskBase * taskLv,
      rift: rift,
      compass: compass,
      companion: companion,
      gem1: gem1,
      merit: merit,
      exotic: exotic,
      gold9: _num(goldBonuses[9]),
      gold23: _num(goldBonuses[23]),
      charm6: bonus6,
      charm7: _num(charmBonuses[7]),
      charm14: bonus14,
      charm15: _num(charmBonuses[15]),
      charm19: bonus19,
      nk8: nkBonus(8, nkLevels),
      nk28: nkBonus(28, nkLevels),
      sneakLv: sneakLv,
      isSolo: isSolo ? 1 : 0,
      taskBase: taskBase,
      taskLv: taskLv,
    },
  };
}

export function computeJadeRate(twinIdx, saveData, options) {
  options = options || {};
  var coinResult = computeJadeCoin(twinIdx, saveData, options);
  var detection = options.detection != null ? options.detection : coinResult.detection;
  var actionSpeed = _num(options.actionSpeed);
  var koTime = _num(options.koTime);
  var dodgePct = _num(options.dodgePct);
  var rate = computeJadeActionsPerHour(actionSpeed, detection, koTime, dodgePct);

  return {
    coin: coinResult.coin,
    jadePerHour: coinResult.coin * rate.actionsPerHour,
    actionsPerHour: rate.actionsPerHour,
    detectionCycles: rate.detectionCycles,
    baseJade: coinResult.baseJade,
    multiplier: coinResult.multiplier,
    detection: detection,
    factors: coinResult.factors,
    bonuses: coinResult.bonuses,
    hitChance: rate.hitChance,
    koChance: rate.koChance,
    dodge: rate.dodge,
  };
}

function _pctFactorNode(name, pct, children, note) {
  return node(name, 1 + _num(pct) / 100, children || [
    node('Bonus', pct, null, { fmt: '%' }),
  ], { fmt: 'x', note: note || '1 + bonus / 100' });
}

// ===== Full Jade breakdown tree =====
export function buildJadeBreakdown(twinIdx, saveData, options) {
  options = options || {};
  var r = computeJadeRate(twinIdx, saveData, options);
  var f = r.factors;
  var b = r.bonuses;

  var factorU = node('Sneaking Level Jade', f.u, [
    node('Ninja Knowledge 8 bonus per level', b.nk8, null, { fmt: '%' }),
    node('Sneaking level', b.sneakLv, null, { fmt: 'raw' }),
    node('Combined bonus', b.nk8 * b.sneakLv, null, { fmt: '%' }),
  ], { fmt: 'x', note: '1 + NK 8 × Sneaking level / 100' });

  var charmSolo = node('Solo Jade Charms', 1 + (b.charm14 + b.charm19) / 100, [
    node('Jade charm (type 14)', b.charm14, null, { fmt: '%', note: b.isSolo ? '3× solo multiplier applied' : 'Twin is not solo' }),
    node('EXP + Jade charm (type 19)', b.charm19, null, { fmt: '%', note: b.isSolo ? '3× solo multiplier applied' : 'Twin is not solo' }),
    node('Solo status', b.isSolo, null, { fmt: 'raw' }),
  ], { fmt: 'x' });
  var vialMealCard = node('Vial + Meal + Card', 1 + (b.vial + b.meal + 4 * b.cardLv) / 100, [
    node('Jade Vial', b.vial, null, { fmt: '%' }),
    node('Jade Meal', b.meal, null, { fmt: '%' }),
    node('W6B4 Card', 4 * b.cardLv, [
      node('Card level', b.cardLv, null, { fmt: 'raw' }),
      node('Bonus per level', 4, null, { fmt: '%' }),
    ], { fmt: '%' }),
  ], { fmt: 'x' });
  var factorO = node('Primary Jade Multipliers', f.o, [
    node('Gem Shop Jade Multiplier', b.gemShop, null, { fmt: 'x' }),
    charmSolo,
    _pctFactorNode('Monument: Jade', b.monument),
    _pctFactorNode('Pristine Charm: Jade', b.pristine),
    _pctFactorNode('Ninja Knowledge 28', b.nk28),
    _pctFactorNode('Gold Inventory: Jade', b.gold9),
    node('Killroy Jade Multiplier', Math.max(1, b.killroy), null, { fmt: 'x' }),
    vialMealCard,
  ], { fmt: 'x', note: 'Product of the listed factors' });

  var factorE = node('Equipped Jade Charms', f.e, [
    node('Jade at 0% Detection (type 6)', b.charm6, null, { fmt: '%' }),
    node('EXP, Jade & Stealth (type 7)', b.charm7, null, { fmt: '%' }),
    node('Jade (type 15)', b.charm15, null, { fmt: '%' }),
  ], { fmt: 'x', note: '1 + sum / 100' });
  var factorG = node('Slab + Stamp', f.g, [
    node('Slab Bonus', b.slab, null, { fmt: '%' }),
    node('Jade Coin Stamps', b.stamp, null, { fmt: '%' }),
  ], { fmt: 'x', note: '1 + (Slab + Stamp) / 100' });
  var factorD = _pctFactorNode('Crop Scientist: Jade', b.crop);
  var factorB = _pctFactorNode('Summoning Winner: Jade', b.win);

  var accountGroup = node('MSA + Sigil + Arcade + Vault', 1 + (b.msa + b.sigil + b.arcade + b.vault) / 100, [
    node('MSA Bonus', b.msa, null, { fmt: '%' }),
    node('Sigil Bonus', b.sigil, null, { fmt: '%' }),
    node('Arcade Bonus', b.arcade, null, { fmt: '%' }),
    node('Vault Bonus', b.vault, null, { fmt: '%' }),
  ], { fmt: 'x' });
  var task = b.taskBase * b.taskLv;
  var factorN = node('Account Jade Multipliers', f.N, [
    accountGroup,
    _pctFactorNode('Jade Star Sign', b.star),
    node('Task Shop Jade', 1 + task / 100, [
      node('Bonus per level', b.taskBase, null, { fmt: '%' }),
      node('Task level', b.taskLv, null, { fmt: 'raw' }),
      node('Combined bonus', task, null, { fmt: '%' }),
    ], { fmt: 'x' }),
  ], { fmt: 'x' });

  var factorY = node('Rift + Compass + Companion', f.y, [
    node('Rift Skill Bonus', 1 + 10 * b.rift / 100, [
      node('Rift value', b.rift, null, { fmt: 'raw' }),
      node('Combined bonus', 10 * b.rift, null, { fmt: '%' }),
    ], { fmt: 'x' }),
    _pctFactorNode('Compass: Jade', b.compass),
    node('Companion 163', 1 + 99 * b.companion, [
      node('Owned', b.companion, null, { fmt: 'raw' }),
    ], { fmt: 'x' }),
  ], { fmt: 'x' });
  var factorR = node('Jade Achievements', f.R, [
    node('Achievement 366', 3 * achieveStatus(366, saveData), null, { fmt: '%' }),
    node('Achievement 369', 5 * achieveStatus(369, saveData), null, { fmt: '%' }),
    node('Achievement 367', 7 * achieveStatus(367, saveData), null, { fmt: '%' }),
  ], { fmt: 'x' });
  var factorA = node('Gemstone + Meritoc + Exotic', f.A, [
    _pctFactorNode('Jade Gemstone', b.gem1),
    _pctFactorNode('Meritoc: Jade', b.merit),
    _pctFactorNode('Exotic Crop: Jade', b.exotic),
  ], { fmt: 'x' });
  var factorFinalG = node('Gold Inventory per 10 Sneaking Levels', f.G, [
    node('Bonus per 10 levels', b.gold23, null, { fmt: '%' }),
    node('Sneaking level groups', Math.floor(b.sneakLv / 10), [
      node('Sneaking level', b.sneakLv, null, { fmt: 'raw' }),
    ], { fmt: 'raw' }),
    node('Combined bonus', b.gold23 * Math.floor(b.sneakLv / 10), null, { fmt: '%' }),
  ], { fmt: 'x' });

  var multiplierNode = node('Total Jade Multiplier', r.multiplier, [
    factorU, factorO, factorE, factorG, factorD, factorB,
    factorN, factorY, factorR, factorA, factorFinalG,
  ], { fmt: 'x', note: 'Product of all Jade multiplier groups' });
  var coinNode = node('Jade per Successful Action', r.coin, [
    node('Floor Base Jade', r.baseJade, [
      node('Floor', options.floor != null ? options.floor : 0, null, { fmt: 'raw' }),
      node('Mastery', options.mastery != null ? options.mastery : _num(saveData.olaData && saveData.olaData[231]), null, { fmt: 'raw' }),
    ], { fmt: 'raw' }),
    multiplierNode,
  ], { fmt: 'raw', note: 'Floor base Jade × total multiplier' });
  var rateNode = node('Game Display Actions per Hour', r.actionsPerHour, [
    node('Action Speed', _num(options.actionSpeed), null, { fmt: '/hr', note: 'Raw actions per hour without detection or KO' }),
    node('Action Hit Chance', 100 * r.hitChance, [
      node('Detection Chance', 100 * r.detection, null, { fmt: 'pct' }),
      node('A detected action is consumed even when dodged', 0, null, { fmt: 'raw' }),
    ], { fmt: 'pct', note: '1 - detection chance' }),
    node('KO Chance per Attempt', 100 * r.koChance, [
      node('Detection Chance', 100 * r.detection, null, { fmt: 'pct' }),
      node('Dodge Chance (capped at 90%)', 100 * r.dodge, null, { fmt: 'pct' }),
    ], { fmt: 'pct', note: 'Detection × (1 - dodge)' }),
    node('KO Duration (internal seconds)', _num(options.koTime), null, { fmt: 'raw' }),
    node('Expected KO cycles per successful action', Number.isFinite(r.detectionCycles) ? r.detectionCycles : 0, null, {
      fmt: 'raw',
      note: Number.isFinite(r.detectionCycles) ? '' : 'Infinite at 100% detection; displayed as 0 to keep the diagnostic tree finite',
    }),
  ], { fmt: '/hr', note: 'Matches the game Jade/hour display estimate; runtime door throughput is shown separately in the Door tab' });

  var twinName = (saveData.charNames && saveData.charNames[twinIdx]) || ('Twin ' + (twinIdx + 1));
  return node(twinName + ' Jade per Hour', r.jadePerHour, [coinNode, rateNode], {
    fmt: 'raw',
    note: 'Jade per successful action × successful actions per hour',
  });
}

// ===== Door damage/hour breakdown =====
export function buildDoorRateBreakdown(twinIdx, saveData, options) {
  options = options || {};
  var activeCharIdx = options.activeCharIdx != null ? options.activeCharIdx : 0;
  var door = computeDoorDamageDetailed(twinIdx, saveData, activeCharIdx);
  var rate = options.teamRate || computeDoorHitsPerHour(
    options.actionSpeed,
    _num(options.detection),
    options.koTime,
    options.dodgePct
  );
  var doorActive = options.doorActive !== false && door.canHitDoor;
  var hitsPerHour = doorActive ? rate.hitsPerHour : 0;
  var damagePerHour = door.damage * hitsPerHour;
  var twinName = (saveData.charNames && saveData.charNames[twinIdx]) || ('Twin ' + (twinIdx + 1));
  var inactiveReason = !door.canHitDoor
    ? 'No Nunchaku equipped'
    : options.doorActive === false ? 'No active door at this floor/mastery' : '';

  return node(twinName + ' Door Damage per Hour', damagePerHour, [
    buildDoorDamageBreakdown(twinIdx, saveData, activeCharIdx),
    node('Hit Chance per Action', doorActive ? rate.hitChance : 0, [
      node('Detection Chance', 100 * _num(options.detection), null, { fmt: 'pct' }),
      node('Detected actions deal no damage, even when dodged', 0, null, { fmt: 'raw' }),
    ], { fmt: 'chance', note: inactiveReason || '1 - detection chance' }),
    node('Door Hits per Hour', hitsPerHour, [
      node('Action Speed', _num(options.actionSpeed), null, { fmt: 'rate' }),
      node('Runtime Attempts per Hour', rate.attemptsPerHour, [
        node('Base progress per attempt', 3600, null, { fmt: 'raw' }),
        node('Net KO progress per attempt', rate.expectedKoProgress != null ? rate.expectedKoProgress : rate.koChance * _num(options.koTime), [
          node('KO Chance per Attempt', 100 * rate.koChance, null, { fmt: 'pct' }),
          node('KO Duration (internal seconds)', _num(options.koTime), null, { fmt: 'raw' }),
        ], { fmt: 'raw' }),
        node('Expected progress per attempt', rate.progressPerAttempt || 3600, null, { fmt: 'raw' }),
        node('Taunting Mark coupled model', rate.coupled ? 1 : 0, null, {
          fmt: 'raw',
          note: rate.coupled ? 'Expected model: KO progress is redistributed in native first-wearer order while the mark is available' : 'No Taunting Mark coupling',
        }),
      ], { fmt: 'rate', note: rate.coupled ? 'Solved from the team expected-progress system' : '3600 × Action Speed / expected progress consumed per attempt' }),
      node('Hit Chance per Attempt', rate.hitChance, null, { fmt: 'chance' }),
      node('KO Chance per Attempt', 100 * rate.koChance, [
        node('Detection Chance', 100 * _num(options.detection), null, { fmt: 'pct' }),
        node('Dodge Chance (capped at 90%)', 100 * rate.dodge, null, { fmt: 'pct' }),
      ], { fmt: 'pct' }),
    ], { fmt: 'rate', note: inactiveReason || 'Runtime attempts per hour × hit chance' }),
  ], { fmt: 'raw', note: inactiveReason || 'Damage per hit × hits per hour' });
}

export function computeSneakingTeamScenario(twins, saveData, options) {
  options = options || {};
  var floor = Number(options.floor) || 0;
  var mastery = Number(options.mastery) || 0;
  var activeCharIdx = options.activeCharIdx != null ? options.activeCharIdx : 0;
  var ninjaData = options.ninjaData || saveData.ninjaData || [];
  var rates = computeTeamDoorRates(twins.map(function(twin) {
    return {
      actionSpeed: twin.actionSpeed,
      detection: twin.detection,
      koTime: twin.koTime,
      dodgePct: twin.dodgePct,
      taunting: twin.taunting,
    };
  }));
  var doors = twins.map(function(twin) {
    return twin.doorDamage || computeDoorDamageDetailed(twin.idx, saveData, activeCharIdx);
  });
  var unties = twins.map(function(twin) {
    return twin.untieProgress || computeUntieProgressDetailed(twin.idx, saveData, activeCharIdx);
  });
  var modes = twins.map(function(twin, idx) {
    var canHitDoor = !!options.doorActive && floor > 0 && doors[idx].canHitDoor;
    return sneakingActionMode(twin.idx, floor, ninjaData, {
      doorActive: canHitDoor,
      weaponSubtype: twin.weaponSubtype,
      playerCount: options.playerCount,
    });
  });
  var batchTwins = twins.map(function(twin, idx) {
    return Object.assign({}, twin, {
      actionMode: modes[idx],
      weaponSubtype: twin.weaponSubtype != null ? twin.weaponSubtype
        : modes[idx] === 'door' ? 1 : modes[idx] === 'untie' ? 2 : 0,
      doorDamagePerHit: doors[idx].damage,
      untieProgressPerHit: unties[idx].progress,
    });
  });
  var hasDoorMode = modes.indexOf('door') !== -1;
  var hasUntieMode = modes.indexOf('untie') !== -1;
  var captiveIdx = captiveTargetForFloor(floor, ninjaData, options.playerCount);
  var batchOptions = {
    floor: floor,
    mastery: mastery,
    initialFlowers: options.initialFlowers,
    nkLevels: ninjaData[103] || [],
    detectionEnabled: options.detectionEnabled != null
      ? options.detectionEnabled
      : _num(ninjaData[100] && ninjaData[100][0]) >= 2,
    doorMaxHP: hasDoorMode
      ? options.doorMaxHP != null
        ? Math.max(0, Number(options.doorMaxHP) || 0)
        : Infinity
      : 0,
    doorProgress: options.doorProgress,
    untieBatchActive: hasUntieMode && captiveIdx >= 0,
    captiveRequirement: options.captiveRequirement != null
      ? Math.max(0, Number(options.captiveRequirement) || 0)
      : captiveIdx >= 0 ? untieReq(captiveIdx) : 0,
    captiveProgress: options.captiveProgress != null
      ? options.captiveProgress
      : captiveIdx >= 0 ? _num(ninjaData[captiveIdx] && ninjaData[captiveIdx][3]) : 0,
  };
  var fastBatchApprox = !!options.fastBatchApprox;
  var offlineFlowers = options.flowerMode === 'offline' && !fastBatchApprox
    ? _offlineBatchExpectations(batchTwins, options.flowerBatchHours, batchOptions)
    : null;
  var batchHours = Math.max(0.01, Number(options.itemBatchHours) || 1);
  var itemBatch = fastBatchApprox ? null
    : _offlineBatchExpectations(batchTwins, batchHours, batchOptions);
  var bubbleY9 = Number(options.bubbleY9Val) || 1;
  var itemPhase = Number(ninjaData[102] && ninjaData[102][10]) || 0;
  var nkLevels = ninjaData[103] || [];
  var total = { jadePerHour: 0, flowersPerHour: 0, itemsPerHour: 0, doorDamagePerHour: 0, doorHitsPerHour: 0, untieProgressPerHour: 0 };
  var rows = twins.map(function(twin, idx) {
    var door = doors[idx];
    var canHitDoor = !!options.doorActive && floor > 0 && door.canHitDoor;
    var mode = modes[idx];
    var normalSuccesses = mode === 'normal' || mode === 'training' ? rates[idx].hitsPerHour : 0;
    var jade = computeJadeCoin(twin.idx, saveData, {
      activeCharIdx: activeCharIdx,
      floor: floor,
      mastery: mastery,
      twinFloors: options.twinFloors,
      isSolo: twin.isSolo != null ? twin.isSolo : options.isSolo,
      detection: twin.detection,
      charmBonuses: twin.charmBonuses,
    });
    var expectedItems = nkBonus(14, nkLevels) > 0
      ? itemFindExpectedFromRate(
        nkLevels,
        twin.itemFindPct,
        normalSuccesses,
        batchHours,
        bubbleY9,
        itemPhase,
        itemBatch ? itemBatch.itemStats[idx] : null
      ) : 0;
    var untie = unties[idx];
    var displayRate = computeJadeActionsPerHour(twin.actionSpeed, twin.detection, twin.koTime, twin.dodgePct);
    var row = {
      mode: mode,
      attemptsPerHour: rates[idx].attemptsPerHour,
      successfulActionsPerHour: normalSuccesses,
      flowersPerHour: offlineFlowers ? offlineFlowers[idx] : rates[idx].flowersPerHour,
      jadePerAction: jade.coin,
      jadePerHour: mode === 'normal' ? jade.coin * normalSuccesses : 0,
      gameDisplayActionsPerHour: mode === 'normal' ? displayRate.actionsPerHour : 0,
      gameDisplayJadePerHour: mode === 'normal' ? jade.coin * displayRate.actionsPerHour : 0,
      itemsPerHour: expectedItems / batchHours,
      doorDamagePerHit: canHitDoor ? door.damage : 0,
      doorHitsPerHour: canHitDoor ? rates[idx].hitsPerHour : 0,
      doorDamagePerHour: canHitDoor ? door.damage * rates[idx].hitsPerHour : 0,
      untieProgressPerHit: mode === 'untie' ? untie.progress : 0,
      untieProgressPerHour: mode === 'untie' ? untie.progress * rates[idx].hitsPerHour : 0,
      hitChance: rates[idx].hitChance,
      koChance: rates[idx].koChance,
      coupled: rates[idx].coupled,
    };
    total.jadePerHour += row.jadePerHour;
    total.flowersPerHour += row.flowersPerHour;
    total.itemsPerHour += row.itemsPerHour;
    total.doorDamagePerHour += row.doorDamagePerHour;
    total.doorHitsPerHour += row.doorHitsPerHour;
    total.untieProgressPerHour += row.untieProgressPerHour;
    return row;
  });
  return {
    total: total,
    twins: rows,
    rates: rates,
    itemBatchHours: batchHours,
    offlineFlowerApproximate: !!(offlineFlowers && offlineFlowers.approximate),
    itemBatchApproximate: !!(itemBatch && itemBatch.approximate),
  };
}