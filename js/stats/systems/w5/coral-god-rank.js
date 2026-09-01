// ===== CORAL KID / GOD RANK PLANNER (W5) =====

import { assignSaveData, cauldronInfoData, divinityData, optionsListData } from '../../../save/data.js';
import { bubbleValByKey } from '../w2/alchemy.js';
import { vaultUpgBonus } from '../common/vault.js';
import { mineheadBonusQTY } from '../w7/minehead.js';
import { computeDivinityBless } from './divinity.js';

var GOALS = ['divinity-points', 'divinity-exp', 'class-exp', 'minor-links', 'blessing-cap', 'daily-reef-coral', 'balanced'];

function _num(value, fallback) {
  var n = Number(value);
  return Number.isFinite(n) ? n : (fallback == null ? 0 : fallback);
}

function _arrayValue(row, index, fallback) {
  return row && row[index] != null ? _num(row[index], fallback) : (fallback == null ? 0 : fallback);
}

function _saveRow(saveData, key, imported) {
  return saveData && Object.prototype.hasOwnProperty.call(saveData, key) && saveData[key] != null ? saveData[key] : imported;
}

function _divinity(saveData) {
  return _saveRow(saveData, 'divinityData', divinityData);
}

function _options(saveData) {
  return _saveRow(saveData, 'optionsListData', optionsListData);
}

function _reefCount(saveData, options) {
  if (options && options.reefUpgradeCount != null) return Math.max(0, _num(options.reefUpgradeCount));
  var row = saveData && saveData.spelunkData && saveData.spelunkData[13];
  return (row || []).slice(0, 6).reduce(function (total, value) { return total + Math.max(0, _num(value)); }, 0);
}

export function coralKidLevel(index, saveData, options) {
  options = options || {};
  if (options.levels && options.levels[index] != null) return Math.max(0, Math.floor(_num(options.levels[index])));
  return Math.max(0, Math.floor(_arrayValue(_options(saveData), 427 + index)));
}

export function coralKidUpgradeCost(index, level) {
  var idx = Math.max(0, Math.floor(_num(index)));
  var lv = Math.max(0, Math.floor(_num(level)));
  return 1e7 * Math.pow(6, idx) * Math.pow(idx === 1 ? 1.25 : 1.1, lv);
}

export function coralKidUpgradeEffect(index, level) {
  var lv = Math.max(0, _num(level));
  switch (Math.max(0, Math.floor(_num(index)))) {
    case 0: return 10 * lv;
    case 1: return Math.round(2 * lv);
    case 2: return lv / (25 + lv) * 20;
    case 3: return Math.round(lv);
    case 4: return Math.round(2 * lv);
    case 5: return lv / (40 + lv) * 100;
    default: return 0;
  }
}

export function coralKidMetrics(saveData, options) {
  options = options || {};
  var levels = options.levels || [0, 1, 2, 3, 4, 5].map(function (index) { return coralKidLevel(index, saveData, options); });
  var rank = options.godRank != null ? _num(options.godRank) : _arrayValue(_divinity(saveData), 25);
  var reefCount = _reefCount(saveData, options);
  var minor = coralKidUpgradeEffect(3, levels[3]);
  var pointsBonus = coralKidUpgradeEffect(4, levels[4]);
  var classBonus = coralKidUpgradeEffect(2, levels[2]);
  var capMissing = [];
  var mineheadBonus;
  if (options.mineheadBonus != null) mineheadBonus = _num(options.mineheadBonus);
  else if (options.mineFloor != null) mineheadBonus = mineheadBonusQTY(9, _num(options.mineFloor));
  else if (saveData && saveData.stateR7 && saveData.stateR7[4] != null) mineheadBonus = mineheadBonusQTY(9, _num(saveData.stateR7[4]));
  else { mineheadBonus = 0; capMissing.push('Minehead floor/bonus'); }
  var vaultBonus;
  if (options.vault76Bonus != null) vaultBonus = _num(options.vault76Bonus);
  else if (saveData && saveData.vaultData && saveData.vaultData[76] != null) vaultBonus = vaultUpgBonus(76, saveData);
  else { vaultBonus = 0; capMissing.push('Vault 76'); }
  var result = {
    levels: levels.slice(),
    godRank: rank,
    reefUpgradeCount: reefCount,
    divinityExp: 1 + coralKidUpgradeEffect(0, levels[0]) / 100,
    classExp: Math.pow(1 + classBonus / 100, Math.max(0, rank - 10)),
    minorLinks: 1 + minor / 100,
    divinityPoints: 1 + reefCount * pointsBonus / 100,
    blessingCap: Math.round(_num(options.blessingBase, 100) + coralKidUpgradeEffect(1, levels[1]) + mineheadBonus + vaultBonus),
    dailyReefCoral: 1 + coralKidUpgradeEffect(5, levels[5]) / 100,
  };
  result.blessingCapAvailable = capMissing.length === 0;
  result.blessingCapPartial = capMissing.length > 0;
  result.blessingCapMissing = capMissing;
  result.blessingCapMetadata = { available: result.blessingCapAvailable, partial: result.blessingCapPartial, missing: capMissing.slice() };
  if (options.blessingIndex != null && options.blessingLevel != null && options.blessingInputs != null) result.blessing = _computeBlessing(saveData, options);
  return result;
}

export function offeringOdds(god, saveData, options) {
  options = options || {};
  var tier = options.tier != null ? _num(options.tier) : _arrayValue(_divinity(saveData), 26 + Math.floor(_num(god)));
  return [0.01, 0.05, 0.1, 0.25, 0.5, 1][Math.max(0, Math.min(5, Math.floor(tier)))] || 0;
}

export function offeringCost(god, saveData, options) {
  options = options || {};
  var rank = options.godRank != null ? _num(options.godRank) : _arrayValue(_divinity(saveData), 25);
  var odds = offeringOdds(god, saveData, options);
  var base = (20 * Math.pow(rank + 1.3, 2.3) * Math.pow(2.2, rank) + 60) * odds;
  if (rank >= 3) {
    if (options.divCostAfter3 == null) return { available: false, value: null, missing: ['DivCostAfter3'] };
    base *= Math.pow(Math.min(1.8, Math.max(1, 1 + _num(options.divCostAfter3) / 100)), rank - 2);
  }
  return { available: true, value: base < 1 ? 1 : (base < 1e6 ? Math.ceil(base) : base), rank: rank, odds: odds };
}

export function offeringStats(god, saveData, options) {
  options = options || {};
  var chance = offeringOdds(god, saveData, options);
  var cost = offeringCost(god, saveData, options);
  var y4 = options.y4;
  var freeChance = y4 == null ? null : Math.min(0.35, Math.max(0, _num(y4) / 100));
  var totalChance = freeChance == null ? chance : freeChance + (1 - freeChance) * chance;
  var result = { successChancePerAttempt: chance, totalSuccessChancePerAttempt: totalChance, freeCostChance: freeChance, paidCostProbability: freeChance == null ? null : 1 - freeChance, paidSuccessProbability: freeChance == null ? chance : (1 - freeChance) * chance, paidFailureProbability: freeChance == null ? 1 - chance : (1 - freeChance) * (1 - chance), paidCost: cost.value, available: cost.available, missing: cost.missing || [] };
  if (!chance || !cost.available || freeChance == null) return result;
  result.expectedSpendForOneSuccess = cost.value * (1 - freeChance) / totalChance;
  result.confidence = {};
  [0.5, 0.9, 0.95].forEach(function (confidence) {
    var attempts = totalChance === 1 ? 1 : Math.ceil(Math.log(1 - confidence) / Math.log(1 - totalChance));
    result.confidence[String(confidence * 100)] = { attempts: attempts, expectedSpend: cost.value * (1 - freeChance) * (1 - Math.pow(1 - totalChance, attempts)) / totalChance, maxPaidSpend: attempts * cost.value };
  });
  return result;
}

function _strictlyImproves(nextScore, priorScore) {
  var epsilon = 1e-12 * Math.max(1, Math.abs(nextScore), Math.abs(priorScore));
  return nextScore > priorScore + epsilon;
}

export function coralStateDominates(a, b, objectiveA, objectiveB) {
  if (_stateSignature(a) !== _stateSignature(b)) return false;
  var scoreA = _num(objectiveA);
  var scoreB = _num(objectiveB);
  var noWorse = scoreA >= scoreB && a.spent <= b.spent && a.wholePlanConfidence >= b.wholePlanConfidence;
  return noWorse && (scoreA > scoreB || a.spent < b.spent || a.wholePlanConfidence > b.wholePlanConfidence);
}

function _objective(metrics, goal, weights) {
  if (goal === 'balanced') {
    var baseline = weights && weights._baseline;
    var keys = ['divinityPoints', 'divinityExp', 'classExp', 'minorLinks', 'blessingCap', 'dailyReefCoral'];
    var total = 0;
    var totalWeight = 0;
    for (var i = 0; i < keys.length; i++) {
      var value = _num(metrics[keys[i]]);
      var prior = _num(baseline && baseline[keys[i]]);
      var weight = Math.max(0, _num(weights && weights[keys[i]], 1));
      total += weight * (prior > 0 ? value / prior : (value > 0 ? 1 : 0));
      totalWeight += weight;
    }
    return totalWeight > 0 ? total / totalWeight : 0;
  }
  var key = { 'divinity-points': 'divinityPoints', 'divinity-exp': 'divinityExp', 'class-exp': 'classExp', 'minor-links': 'minorLinks', 'blessing-cap': 'blessingCap', 'daily-reef-coral': 'dailyReefCoral' }[goal];
  return key ? metrics[key] * _num(weights && weights[key], 1) : 0;
}

export function optimizeCoralGodRank(saveData, goal, options) {
  options = options || {};
  goal = goal || 'balanced';
  var partial = [];
  if (GOALS.indexOf(goal) < 0) goal = 'balanced';
  var div = _divinity(saveData);
  var budget = Math.max(0, options.budget == null ? _arrayValue(div, 24) : _num(options.budget));
  var initialLevels = [0, 1, 2, 3, 4, 5].map(function (index) { return coralKidLevel(index, saveData, options); });
  var metricOptions = { reefUpgradeCount: options.reefUpgradeCount, blessingBase: options.blessingBase, mineheadBonus: options.mineheadBonus, mineFloor: options.mineFloor, vault76Bonus: options.vault76Bonus };
  var current = coralKidMetrics(saveData, Object.assign({}, metricOptions, { levels: initialLevels, godRank: options.godRank }));
  var scoreWeights = Object.assign({}, options.weights || {}, { _baseline: current });
  var beam = [{ levels: initialLevels, godRank: _num(options.godRank, current.godRank), spent: 0, wholePlanConfidence: 1, actions: [] }];
  var beamSize = Math.max(1, Math.floor(_num(options.beamSize, 250)));
  var maxLevels = Math.max(0, Math.floor(_num(options.maxLevels, 1000)));
  var dominancePruned = 0;
  for (var step = 0; step < maxLevels; step++) {
    var next = beam.slice();
    beam.forEach(function (state) {
      if (state.actions.length >= maxLevels) return;
      for (var index = 0; index < 6; index++) {
        if (!_upgradeUnlocked(index, options)) continue;
        var cost = coralKidUpgradeCost(index, state.levels[index]);
        if (state.spent + cost > budget) continue;
        var levels = state.levels.slice();
        levels[index]++;
        var coralState = { levels: levels, godRank: state.godRank, spent: state.spent + cost, wholePlanConfidence: state.wholePlanConfidence, actions: state.actions.concat([{ type: 'coral-kid', index: index, level: levels[index], cost: cost }]) };
        var priorMetrics = coralKidMetrics(saveData, Object.assign({}, metricOptions, { levels: state.levels, godRank: state.godRank }));
        var coralMetrics = coralKidMetrics(saveData, Object.assign({}, metricOptions, { levels: levels, godRank: state.godRank }));
        if (_strictlyImproves(_objective(coralMetrics, goal, scoreWeights), _objective(priorMetrics, goal, scoreWeights))) next.push(coralState);
      }
      var offer = offeringStats(options.god == null ? 0 : options.god, saveData, { godRank: state.godRank, divCostAfter3: options.divCostAfter3, y4: options.y4, tier: options.tier });
      var confidence = Math.min(0.999999, Math.max(0.5, _num(options.planningConfidence, 0.9)));
      var attempts = offer.totalSuccessChancePerAttempt === 1 ? 1 : (offer.totalSuccessChancePerAttempt > 0 ? Math.ceil(Math.log(1 - confidence) / Math.log(1 - offer.totalSuccessChancePerAttempt)) : 0);
      var row = offer.available && attempts > 0 ? { attempts: attempts, expectedSpend: offer.paidCost * (1 - (offer.freeCostChance || 0)) * (1 - Math.pow(1 - offer.totalSuccessChancePerAttempt, attempts)) / offer.totalSuccessChancePerAttempt, maxPaidSpend: attempts * offer.paidCost } : null;
        if (offer.available && options.y4 != null && row && state.godRank < 100 && state.spent + row.maxPaidSpend <= budget) {
          var rankMetrics = coralKidMetrics(saveData, Object.assign({}, metricOptions, { levels: state.levels, godRank: state.godRank + 1 }));
          var stateMetrics = coralKidMetrics(saveData, Object.assign({}, metricOptions, { levels: state.levels, godRank: state.godRank }));
          if (!_strictlyImproves(_objective(rankMetrics, goal, scoreWeights), _objective(stateMetrics, goal, scoreWeights))) return;
          var wholePlanConfidence = state.wholePlanConfidence * confidence;
          next.push({ levels: state.levels.slice(), godRank: state.godRank + 1, spent: state.spent + row.maxPaidSpend, wholePlanConfidence: wholePlanConfidence, actions: state.actions.concat([{ type: 'god-offering-rank', god: options.god == null ? 0 : options.god, fromRank: state.godRank, toRank: state.godRank + 1, attempts: row.attempts, expectedSpend: row.expectedSpend, maxPaidSpend: row.maxPaidSpend, confidence: confidence, wholePlanConfidence: wholePlanConfidence, probabilistic: true }]) });
        }
    });
    var unique = new Map();
    next.forEach(function (state) {
      var signature = _stateSignature(state);
      var prior = unique.get(signature);
      if (!prior) unique.set(signature, state);
      else {
        var stateScore = _objective(coralKidMetrics(saveData, Object.assign({}, metricOptions, { levels: state.levels, godRank: state.godRank })), goal, scoreWeights);
        var priorScore = _objective(coralKidMetrics(saveData, Object.assign({}, metricOptions, { levels: prior.levels, godRank: prior.godRank })), goal, scoreWeights);
        if (coralStateDominates(state, prior, stateScore, priorScore)) { unique.set(signature, state); dominancePruned++; }
        else if (coralStateDominates(prior, state, priorScore, stateScore)) dominancePruned++;
        else if (state.spent < prior.spent || (state.spent === prior.spent && state.wholePlanConfidence > prior.wholePlanConfidence)) unique.set(signature, state);
      }
    });
    next = Array.from(unique.values());
    next.sort(function (a, b) {
      var am = coralKidMetrics(saveData, Object.assign({}, metricOptions, { levels: a.levels, godRank: a.godRank }));
      var bm = coralKidMetrics(saveData, Object.assign({}, metricOptions, { levels: b.levels, godRank: b.godRank }));
      return _objective(bm, goal, scoreWeights) - _objective(am, goal, scoreWeights) || a.spent - b.spent || a.levels.join(',').localeCompare(b.levels.join(','));
    });
    beam = next.slice(0, beamSize);
  }
  var best = beam[0];
  var final = coralKidMetrics(saveData, Object.assign({}, metricOptions, { levels: best.levels, godRank: best.godRank }));
  if (best.godRank >= 3 && options.divCostAfter3 == null) partial.push('DivCostAfter3');
  if (options.y4 == null) partial.push('Y4');
  if (final.blessingCapPartial) final.blessingCapMissing.forEach(function (missing) { if (partial.indexOf(missing) < 0) partial.push(missing); });
  if (options.coralKidUnlocked === false || !_hasKnownUnlocks(options)) partial.push('Coral Kid unlock state');
  var unlocks = [0, 1, 2, 3, 4, 5].map(function (index) { var status = _upgradeStatus(index, options); return { index: index, unlocked: status.unlocked, known: status.known, reason: status.reason }; });
  var offeringMissing = [];
  var finalOffering = offeringStats(options.god == null ? 0 : options.god, saveData, { godRank: best.godRank, divCostAfter3: options.divCostAfter3, y4: options.y4, tier: options.tier });
  if (!finalOffering.available) offeringMissing = finalOffering.missing.slice();
  if (options.y4 == null) offeringMissing.push('Y4');
  return { goal: goal, actions: best.actions.slice(), current: current, final: final, spent: best.spent, remaining: budget - best.spent, budget: budget, partial: partial, unlocks: unlocks, offeringMissing: offeringMissing, metadata: { method: 'bounded deterministic policy search', offeringActionsIncluded: true, probabilisticOfferings: true, planningConfidence: Math.min(0.999999, Math.max(0.5, _num(options.planningConfidence, 0.9))), wholePlanConfidence: best.wholePlanConfidence, blessingAllocationExcluded: true, noGlobalOptimumClaim: true, dominancePruned: dominancePruned } };
}

function _upgradeStatus(index, options) {
  if (options.coralKidUnlocked === false || (Array.isArray(options.unlocks) && options.unlocks[index] === false)) return { unlocked: false, known: true, reason: 'Upgrade is locked' };
  if (Array.isArray(options.unlocks) && options.unlocks[index] === true) return { unlocked: true, known: true, reason: null };
  var requirements = options.unlockRequirements || options.coralKidUnlockLevels;
  if (requirements && options.totalDivinityLevels != null) return _num(options.totalDivinityLevels) >= _num(requirements[index]) ? { unlocked: true, known: true, reason: null } : { unlocked: false, known: true, reason: 'Divinity level requirement not met' };
  if (options.assumeUnlocked === true) return { unlocked: true, known: false, reason: 'Assumed unlocked' };
  return { unlocked: false, known: false, reason: 'Upgrade unlock is unknown' };
}

function _upgradeUnlocked(index, options) { return _upgradeStatus(index, options).unlocked; }
function _hasKnownUnlocks(options) { return options.coralKidUnlocked === false || Array.isArray(options.unlocks) || ((options.unlockRequirements || options.coralKidUnlockLevels) && options.totalDivinityLevels != null); }
function _stateSignature(state) { return state.levels.join(',') + '|' + state.godRank; }

function _computeBlessing(saveData, options) {
  var idx = Math.max(0, Math.floor(_num(options.blessingIndex)));
  var sourceDivinity = _divinity(saveData);
  var sourceOptions = _options(saveData);
  var clonedDivinity = Array.isArray(sourceDivinity) ? sourceDivinity.slice() : [];
  clonedDivinity[28 + idx] = _num(options.blessingLevel);
  var priorDivinity = divinityData;
  var priorOptions = optionsListData;
  try {
    assignSaveData({ divinityData: clonedDivinity, optionsListData: Array.isArray(sourceOptions) ? sourceOptions.slice() : [] });
    return computeDivinityBless(idx, Object.assign({}, saveData, { ninjaData: options.ninjaData || saveData.ninjaData }), options.blessingInputs);
  } finally {
    assignSaveData({ divinityData: priorDivinity, optionsListData: priorOptions });
  }
}

export function coralGodRankInputs(saveData, options) {
  saveData = saveData || {};
  options = options || {};
  var div = _divinity(saveData);
  var ola = _options(saveData);
  var spelunk = saveData.spelunkData;
  var stateR7 = saveData.stateR7;
  var vault = saveData.vaultData;
  var levels = [0, 1, 2, 3, 4, 5].map(function (index) { return coralKidLevel(index, saveData, options); });
  var reefRow = spelunk && spelunk[13];
  var reefAvailable = Array.isArray(reefRow);
  var stateAvailable = options.mineFloor != null || saveData.stateR7Available === true
    || saveData.stateR7Available == null && Array.isArray(stateR7) && stateR7.length > 4;
  var vaultAvailable = options.vault76Bonus != null || Array.isArray(vault) && vault[76] != null;
  var y4 = options.y4;
  var y4Available = y4 != null;
  if (!y4Available && Array.isArray(cauldronInfoData?.[3]) && cauldronInfoData[3][32] != null) {
    y4 = bubbleValByKey('Y4', options.charIdx == null ? 0 : options.charIdx, saveData, options.cacheInputs);
    y4Available = true;
  }
  var divCostAfter3Available = options.divCostAfter3 != null || saveData.serverVarDivCostAfter3Available === true;
  var divCostAfter3 = options.divCostAfter3 != null ? _num(options.divCostAfter3) : _num(saveData.serverVarDivCostAfter3, null);
  var unlocks = Array.isArray(options.unlocks) ? options.unlocks.slice(0, 6) : undefined;
  return {
    budget: options.budget != null ? _num(options.budget) : _arrayValue(div, 24),
    godRank: options.godRank != null ? _num(options.godRank) : _arrayValue(div, 25),
    tier: options.tier != null ? _num(options.tier) : _arrayValue(div, 26 + Math.floor(_num(options.god, 0))),
    god: options.god == null ? 0 : Math.floor(_num(options.god)),
    levels: levels,
    reefUpgradeCount: options.reefUpgradeCount != null ? _num(options.reefUpgradeCount) : _reefCount(saveData),
    mineFloor: options.mineFloor != null ? _num(options.mineFloor) : stateAvailable ? _arrayValue(stateR7, 4) : null,
    mineheadBonus: options.mineheadBonus != null ? _num(options.mineheadBonus) : stateAvailable ? mineheadBonusQTY(9, _arrayValue(stateR7, 4)) : null,
    vault76Bonus: options.vault76Bonus != null ? _num(options.vault76Bonus) : vaultAvailable ? vaultUpgBonus(76, saveData) : null,
    y4: y4Available ? _num(y4) : null,
    divCostAfter3: divCostAfter3Available ? divCostAfter3 : null,
    unlocks: unlocks,
    assumeUnlocked: options.assumeUnlocked === true,
    availability: {
      budget: Object.prototype.hasOwnProperty.call(div, 24), godRank: Object.prototype.hasOwnProperty.call(div, 25),
      tier: Object.prototype.hasOwnProperty.call(div, 26 + Math.floor(_num(options.god, 0))), coralKidLevels: Array.isArray(ola),
      coralKidUnlock: { known: false, reason: 'No source-backed Coral Kid unlock gate was verified' }, reefUpgradeCount: reefAvailable,
      minehead: stateAvailable, vault76: vaultAvailable, y4: y4Available, divCostAfter3: divCostAfter3Available,
    },
    unlockMetadata: { known: unlocks != null, assumeUnlocked: options.assumeUnlocked === true, reason: unlocks != null ? 'Manual unlock override' : 'Unknown source-backed unlock state' },
  };
}