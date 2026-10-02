// ===== FISHING SYSTEM (W2) =====
// Source-matched AFK Fishing outcomes: catches, toolkit catch split,
// fish quantities, and Fishing EXP for every fish pool.
//
// Game chain (N.new.formatted.js):
//   HourlyKillRate("Fishing") = round(3600 / (FishingSpeed + 0.4) * clamp(afkAttackBonses("D", 4), 1, 3))
//   fish[t] = floor(hours * catches * AFKgainrates * (1 + MultiFish/100) * OreValue * Pct[t]/100)
//   EXP     = sum over Pct[t] > 0 of hours * catches * AFKgainrates * FishPools[pool][1][t] * Pct[t]/100 * ExpMulti(4)
// The AFK panel's EXP/HR instead uses MonsterDefinitions[pool].ExpGiven for every
// fish type and omits OreValue from CATCHES/HR.

import { createStatContext } from '../../stat-context.js';
import { computeSkillPowerDN, computeSkillPowerDetail } from '../../defs/skill-efficiency.js';
import { computeAllSkillProwess, computeAllSkillProwessDetail } from '../../defs/skill-exp.js';
import { resolverTerm, rval, sourceTerm, sumTerms } from '../../defs/skill-helpers.js';
import { talent } from '../common/talent.js';
import { etcBonus } from '../common/etcBonus.js';
import { computeBoxReward, computeCardBonusByType, computeStatueBonusGiven } from '../common/stats.js';
import { computeCardSetBonus } from '../common/cards.js';
import { computeStarSignBonus } from '../common/starSign.js';
import { attackLoadoutFactor } from '../common/combat-outcomes.js';
import { computeStampBonusOfTypeX } from '../w1/stamp.js';
import { bubbleValByKey } from './alchemy.js';
import { computeRiftSkillBonus } from '../w4/rift.js';
import { mainframeBonus } from '../w4/lab.js';
import { cosmoBonus } from '../w5/hole.js';
import { cavernLayerRequirement, trenchFishingEffReqs } from '../w5/motherlode.js';
import {
  afkTargetData,
  currentMapData,
  equipOrderData,
  equipQtyData,
  fishingSpotIndexData,
  fishingSpotIndexDataAvailable,
  fishingToolkitData,
  fishingToolkitDataAvailable,
  foodSlotsOwnedData,
} from '../../../save/data.js';
import { ITEMS } from '../../data/game/items.js';
import {
  FISHING_POOL_KEYS,
  fishingLocations,
  fishingPool,
  fishingRodName,
  fishingRodSpeed,
  fishingSpotDepthBonus,
  fishingToolkitOptions,
  savedFishingLocationId,
} from '../../data/w2/fishing.js';

function _num(value) {
  if (value && typeof value === 'object') {
    if (value.val != null) return Number(value.val) || 0;
    if (value.total != null) return Number(value.total) || 0;
    if (value.computed != null) return Number(value.computed) || 0;
  }
  return Number(value) || 0;
}

function _safe(fn) {
  try { return _num(fn()); } catch (e) { return 0; }
}

// Compact number text for breakdown notes.
function num4(value) {
  var v = Number(value) || 0;
  if (Math.abs(v) >= 1e6) return v.toExponential(3).replace('e+', 'e');
  return String(Math.round(v * 1e4) / 1e4);
}

// ---------- Pure formulas ----------

// FishingToolkit("D0".."D3"): toolkit + equipment depth + fishing-spot bonus.
export function fishingDepths(toolkitStats, equipmentDepth, spotBonus) {
  var tk = toolkitStats || {};
  var equip = equipmentDepth || [0, 0, 0];
  var spot = spotBonus || [0, 0, 0, 0];
  var d0 = (Number(tk.D0) || 0) + (Number(spot[0]) || 0);
  function depth(i) {
    return Math.max(0, (Number(tk['D' + i]) || 0) + (Number(equip[i - 1]) || 0)
      + (Number(spot[i]) || 0) - d0 / 3);
  }
  return { D0: d0, D1: depth(1), D2: depth(2), D3: depth(3) };
}

// FishingToolkit("Pct1".."Pct4"), including the source's floor-to-0.01 steps.
export function fishingCatchShares(efficiency, depths, effReqs) {
  var e = Number(efficiency) || 0;
  var d = depths || {};
  var req = effReqs || [Infinity, Infinity, Infinity];
  var d1 = Number(d.D1) || 0, d2 = Number(d.D2) || 0, d3 = Number(d.D3) || 0;
  var pct4 = e >= req[2]
    ? Math.floor(3 * e / (e + 800) * (4 * d3 / (d3 + 100) + 1) * 100) / 100 : 0;
  var pct3 = e >= req[1]
    ? Math.floor(100 * (2 * e / (e + 200) * 6 * (2 * d2 / (d2 + 100) + 1) - pct4 / 5)) / 100 : 0;
  var pct2 = e >= req[0]
    ? Math.floor(100 * (1.5 * e / (e + 10) * 20 * (2 * d1 / (d1 + 100) + 1) - (pct3 / 3 + pct4 / 5))) / 100 : 0;
  var pct1 = Math.floor(100 * (100 - (pct2 + (pct3 + pct4)))) / 100;
  return [pct1, pct2, pct3, pct4];
}

// SkillStats("FishingOreValue"): fish per catch.
export function fishingOreValue(efficiency, effReq3, prowess) {
  var ratio = (Number(efficiency) || 0) / Math.max(Number(effReq3) || 0, 1e-9);
  return Math.floor(Math.max(Math.pow(ratio, 0.25 + (Number(prowess) || 0)), 1));
}

// SkillStats("FishingMultiOre"): Multi-Fish percentage.
export function fishingMultiFish(inputs) {
  var power = Math.max(0, Number(inputs.power) || 0);
  var level = Number(inputs.level) || 0;
  var bubble = Number(inputs.bubble) || 0;
  var raw = (Number(inputs.stamp) || 0)
    + 100 * (Math.sqrt(power) / (4 * Math.sqrt(power) + 50) + 0.15 * level / (level + 40))
    + (bubble + (Number(inputs.starSign) || 0));
  var cap = (bubble < 20 ? 100 : 300) + (Number(inputs.cosmo) || 0);
  return { value: Math.min(cap, raw), raw: raw, cap: cap };
}

// SkillStats("FishingSpeed") outside dungeons.
export function fishingSpeed(inputs) {
  var e = Number(inputs.efficiency) || 0;
  var level = Number(inputs.level) || 0;
  var rodSpeed = Number(inputs.rodSpeed) || 0;
  var base = 5.7 - (Math.min(e / (e + 300) * 1.7, 0.8) + Math.min(e / (e + 1e3) * 2, 1.7));
  var levelTerm = 0.9 * Math.pow(level, 0.5) / (Math.pow(level, 0.5) + 250) + 0.6 * level / (level + 40);
  var time = rodSpeed < 3
    ? Math.max(base + Math.pow(4 - rodSpeed, 2.2) - levelTerm, 0.57)
    : Math.max(base - (0.2 * Math.pow(rodSpeed, 1.3) + levelTerm), 0.57);
  return time * (15 / (1 + (Number(inputs.speedBonusPct) || 0) / 100));
}

// HourlyKillRate("Fishing").
export function fishingCatchesPerHour(speed, attackFactor) {
  return Math.round(3600 / ((Number(speed) || 0) + 0.4)
    * Math.max(Math.min(Number(attackFactor) || 0, 3), 1));
}

// AFK claim for one pool. `inputs` holds the toolkit-resolved character values.
export function fishingPoolOutcome(poolKey, inputs, hours) {
  var basePool = fishingPool(poolKey);
  if (!basePool) return null;
  var override = inputs.effReqOverrides && inputs.effReqOverrides[poolKey];
  var pool = override ? Object.assign({}, basePool, { effReqs: override.slice() }) : basePool;
  var h = Number(hours) > 0 ? Math.round(Number(hours) * 3600) / 3600 : 1;
  var shares = fishingCatchShares(inputs.efficiency, inputs.depths, pool.effReqs);
  var oreValue = fishingOreValue(inputs.efficiency, pool.effReqs[2], inputs.prowess);
  var catches = h * inputs.catchesPerHour * inputs.afkRate;
  var fishPerCatch = (1 + inputs.multiFish / 100) * oreValue;
  var exp = 0;
  var rolledFishTotal = 0;
  // The claim writes AFKrewMapz[itemKey] = count (not +=) for each positive
  // type, so fish types sharing an item (all four Trench fish are Fish14) keep
  // only the last positive count.
  var creditedSlot = {};
  var fish = pool.fish.map(function(f, t) {
    var share = shares[t];
    var count = Math.floor(catches * fishPerCatch * (share / 100));
    if (!(count > 0)) count = 0;
    var typeExp = share > 0 ? catches * f.expPerCatch * (share / 100) * inputs.expMulti : 0;
    exp += typeExp;
    rolledFishTotal += count;
    if (count > 0) creditedSlot[f.itemKey] = t;
    return Object.assign({}, f, {
      share: share,
      active: share > 0,
      unlocked: t === 0 || inputs.efficiency >= pool.effReqs[t - 1],
      effReq: t === 0 ? 0 : pool.effReqs[t - 1],
      count: count,
      exp: typeExp,
    });
  });
  var fishTotal = 0;
  fish.forEach(function(f) {
    f.credited = f.count > 0 && creditedSlot[f.itemKey] === f.slot;
    f.overwritten = f.count > 0 && !f.credited;
    f.creditedCount = f.credited ? f.count : 0;
    fishTotal += f.creditedCount;
  });
  if (exp < 2e9) exp = Math.floor(exp);
  var shareTotal = 0;
  for (var i = 0; i < 4; i++) if (shares[i] > 0) shareTotal += shares[i];
  var panelCatches = Math.floor(inputs.catchesPerHour * inputs.afkRate * (1 + inputs.multiFish / 100));
  var panelExp = inputs.catchesPerHour * inputs.afkRate * pool.panelExpPerCatch * inputs.expMulti;
  return {
    pool: pool,
    hours: h,
    shares: shares,
    shareTotal: shareTotal,
    oreValue: oreValue,
    catches: catches,
    fishPerCatch: fishPerCatch,
    fishTotal: fishTotal,
    rolledFishTotal: rolledFishTotal,
    overwrittenFish: rolledFishTotal - fishTotal,
    exp: exp,
    expPerCatch: catches > 0 ? exp / (catches * inputs.expMulti) : 0,
    fish: fish,
    panelCatchesPerHour: panelCatches,
    panelExpPerHour: panelExp,
    panelOreValue: Math.floor(100 * oreValue) / 100,
  };
}

// ---------- Save-backed evaluator ----------

function _raw(fn) {
  try { return fn(); } catch (e) { return 0; }
}

// Source term whose value matches _safe(fn) and keeps the result's own breakdown.
function _term(name, fn, fmt) {
  var raw = _raw(fn);
  return sourceTerm(name, raw, { val: _num(raw), fmt: fmt });
}

function _itemName(key) {
  var item = ITEMS[key];
  return item && item.displayName ? String(item.displayName).replace(/_/g, ' ') : String(key);
}

function _foodSpeedDetail(charIdx, saveData, ctx) {
  var order = equipOrderData[charIdx] && equipOrderData[charIdx][2];
  var qty = equipQtyData[charIdx] && equipQtyData[charIdx][2];
  var slots = Number(foodSlotsOwnedData[charIdx]) || 0;
  var amount = 0;
  var items = [];
  for (var i = 0; order && i < slots; i++) {
    var key = order[i];
    if (!key || key === 'Blank' || !(Number(qty && qty[i]) !== 0)) continue;
    var item = ITEMS[key];
    if (item && item.Effect === 'FishingSpeedBoosts') {
      amount += Number(item.Amount) || 0;
      items.push(sourceTerm(_itemName(key) + ' (food slot ' + (i + 1) + ')', Number(item.Amount) || 0));
    }
  }
  if (amount <= 0) {
    return { name: 'Fishing speed food', val: 0, fmt: '%', note: 'No Fishing speed food equipped' };
  }
  // FoodBonuses("...BoostsEffectBonus") outside dungeons.
  var effectTerms = [
    _term('Post Office: Power Food Effect', function() { return computeBoxReward(charIdx, 'PowerFoodEffect'); }),
    _term('Statue: Food Effect', function() { return computeStatueBonusGiven(3, charIdx, saveData); }),
    resolverTerm(etcBonus, '9', ctx),
    _term('Stamps: Boost Food Effect', function() { return computeStampBonusOfTypeX('BFood', saveData, charIdx); }),
    _term('Star Signs: Food Effect', function() { return computeStarSignBonus('FoodEffect', charIdx, saveData); }),
    _term('Card Bonus: Food Effect', function() { return computeCardBonusByType(48, charIdx, saveData); }),
    _term('Card Set: Food Effect', function() { return computeCardSetBonus(charIdx, '1'); }),
    resolverTerm(talent, 631, ctx),
  ];
  var effect = 1 + sumTerms(effectTerms) / 100;
  return { name: 'Fishing speed food', val: amount * effect, fmt: '%', children: [
    { name: 'Equipped food amount', val: amount, fmt: '%', children: items },
    { name: 'Food effect multiplier', val: effect, fmt: 'x', children: effectTerms },
  ] };
}

function _foodSpeedBoost(charIdx, saveData, ctx) {
  return _foodSpeedDetail(charIdx, saveData, ctx).val;
}

function _withToolkit(charIdx, selection, fn) {
  var prevSel = fishingToolkitData[charIdx];
  var prevAvail = fishingToolkitDataAvailable[charIdx];
  fishingToolkitData[charIdx] = [selection.lure, selection.line];
  fishingToolkitDataAvailable[charIdx] = true;
  try { return fn(); } finally {
    fishingToolkitData[charIdx] = prevSel;
    fishingToolkitDataAvailable[charIdx] = prevAvail;
  }
}

function _ctx(saveData, charIdx) {
  return createStatContext({ charIdx: charIdx, saveData: saveData, layer1: { skillType: 'Fishing' } });
}

function _reason(result) {
  return result && result.partial && result.reason ? String(result.reason) : '';
}

export function toolkitStats(selection) {
  var lures = fishingToolkitOptions(0);
  var lines = fishingToolkitOptions(1);
  var lure = lures[Number(selection.lure) || 0] || lures[0];
  var line = lines[Number(selection.line) || 0] || lines[0];
  var stats = {};
  Object.keys(lure.stats).forEach(function(k) { stats[k] = lure.stats[k] + line.stats[k]; });
  return { lure: lure, line: line, stats: stats };
}

// Builds a cached evaluator for one character. evaluate() accepts a toolkit
// selection and fishing spot, and returns outcomes for every fish pool.
export function createFishingEvaluator(saveData, charIdx) {
  var ci = Number(charIdx) || 0;
  var ctx = _ctx(saveData, ci);
  var level = Number(saveData.lv0AllData && saveData.lv0AllData[ci] && saveData.lv0AllData[ci][4]) || 0;
  var rodKey = equipOrderData[ci] && equipOrderData[ci][1] && equipOrderData[ci][1][2];
  var afkResult = ctx.resolve('skill-afk');
  var attack = attackLoadoutFactor('D', 4, ci, ctx);
  var passiveCards = _safe(function() { return computeRiftSkillBonus(3, 2, saveData); }) > 0;
  var prowessAll;
  try { prowessAll = computeAllSkillProwessDetail(ci, ctx); }
  catch (e) { prowessAll = { name: 'All Skill Prowess', val: 0, fmt: 'raw' }; }
  var terms = {
    food: _foodSpeedDetail(ci, saveData, ctx),
    card45: _term('Card Bonus: Fishing Speed' + (passiveCards ? ' (passive via Rift)' : ''),
      function() { return computeCardBonusByType(45, ci, saveData, { passive: passiveCards }); }),
    talent637: resolverTerm(talent, 637, ctx),
    etc61: resolverTerm(etcBonus, '61', ctx),
    mainframe112: _term('Lab Mainframe 112', function() { return mainframeBonus(112, saveData); }, 'raw'),
    stamp: _term('Stamps: Multi-Fish', function() { return computeStampBonusOfTypeX('DoubleFish', saveData, ci); }),
    bubble: _term('Bubble: Fishing Active', function() { return bubbleValByKey('FishingACTIVE', ci, saveData); }),
    starSign: _term('Star Signs: Multi-Fish', function() { return computeStarSignBonus('MultiFish', ci, saveData); }),
    cosmo: _term('Cosmo Upgrade 2-2: Multi-Fish cap', function() { return cosmoBonus(saveData, 2, 2); }),
    fishProw: _term('Fishing Prowess box points', function() { return computeBoxReward(ci, 'FishProw'); }, 'raw'),
    prowessAll: prowessAll,
    equipment: [
      resolverTerm(etcBonus, '12', ctx, undefined, undefined, 'raw'),
      resolverTerm(etcBonus, '13', ctx, undefined, undefined, 'raw'),
      resolverTerm(etcBonus, '14', ctx, undefined, undefined, 'raw'),
    ],
  };
  var fishProw = terms.fishProw.val;
  var base = {
    charIdx: ci,
    level: level,
    rodKey: rodKey || 'Blank',
    rodName: fishingRodName(rodKey) || 'No rod',
    rodSpeed: fishingRodSpeed(rodKey),
    afkRate: Number(afkResult && afkResult.val) || 0.01,
    attackFactor: Number(attack && attack.val) || 1,
    foodSpeed: terms.food.val,
    card45: terms.card45.val,
    talent637: terms.talent637.val,
    etc61: terms.etc61.val,
    mainframe112: terms.mainframe112.val,
    stampDoubleFish: terms.stamp.val,
    bubbleFishingActive: terms.bubble.val,
    starMultiFish: terms.starSign.val,
    cosmo22: terms.cosmo.val,
    prowess: fishProw / 100 * 0.1 / (fishProw / 100 + 10) + (Number(prowessAll.val) || 0),
    equipmentDepth: terms.equipment.map(function(t) { return t.val; }),
    savedSelection: {
      lure: Number(fishingToolkitData[ci] && fishingToolkitData[ci][0]) || 0,
      line: Number(fishingToolkitData[ci] && fishingToolkitData[ci][1]) || 0,
    },
    savedSelectionAvailable: fishingToolkitDataAvailable[ci] === true,
    savedMapIdx: Number(currentMapData[ci]) || 0,
    savedSpotIdx: Number(fishingSpotIndexData[ci]) || 0,
    savedSpotAvailable: fishingSpotIndexDataAvailable[ci] === true,
    afkTarget: afkTargetData[ci] || '',
  };
  // Holes data overwrites the MotherlodeFISH requirements from the Trench depth.
  var hasHoles = Array.isArray(saveData.holesData) && saveData.holesData.length > 0;
  base.effReqOverrides = hasHoles ? { MotherlodeFISH: trenchFishingEffReqs(saveData) } : {};
  base.trench = hasHoles ? cavernLayerRequirement(saveData, 3) : null;
  var partial = [];
  if (_reason(afkResult)) partial.push(_reason(afkResult));

  var powCache = Object.create(null);
  var expCache = Object.create(null);

  function powerTerms(selection, pow) {
    if (!(pow in powCache)) {
      powCache[pow] = _withToolkit(ci, selection, function() {
        var c = _ctx(saveData, ci);
        var eff = c.resolve('skill-efficiency');
        var powerDetail = _raw(function() { return computeSkillPowerDetail('Fishing', ci, c); });
        return {
          efficiency: Number(eff && eff.val) || 0,
          power: computeSkillPowerDN('Fishing', ci, c),
          powerDetail: powerDetail && typeof powerDetail === 'object' ? powerDetail : null,
          effChildren: eff && Array.isArray(eff.children) ? eff.children : null,
          reason: _reason(eff),
        };
      });
    }
    return powCache[pow];
  }

  function expTerms(selection, exp) {
    if (!(exp in expCache)) {
      expCache[exp] = _withToolkit(ci, selection, function() {
        var result = _ctx(saveData, ci).resolve('skill-exp');
        return {
          expMulti: Number(result && result.val) || 0,
          children: result && Array.isArray(result.children) ? result.children : null,
          reason: _reason(result),
        };
      });
    }
    return expCache[exp];
  }

  function inputsFor(selection, spot) {
    var tk = toolkitStats(selection);
    var pw = powerTerms(selection, tk.stats.POW);
    var ex = expTerms(selection, tk.stats.EXP);
    var spotBonus = fishingSpotDepthBonus(spot && spot.mapIdx, spot && spot.spotIdx);
    var speedBonusPct = base.foodSpeed + tk.stats.SPEED + base.card45 + base.talent637
      + base.etc61 + Math.round(base.mainframe112 / 20);
    var speed = fishingSpeed({
      efficiency: pw.efficiency, level: base.level, rodSpeed: base.rodSpeed, speedBonusPct: speedBonusPct,
    });
    var multi = fishingMultiFish({
      stamp: base.stampDoubleFish, power: pw.power, level: base.level,
      bubble: base.bubbleFishingActive, starSign: base.starMultiFish, cosmo: base.cosmo22,
    });
    return {
      toolkit: tk,
      spotBonus: spotBonus,
      efficiency: pw.efficiency,
      power: pw.power,
      expMulti: ex.expMulti,
      depths: fishingDepths(tk.stats, base.equipmentDepth, spotBonus),
      speedBonusPct: speedBonusPct,
      speed: speed,
      catchesPerHour: fishingCatchesPerHour(speed, base.attackFactor),
      attackFactorUsed: Math.max(Math.min(base.attackFactor, 3), 1),
      afkRate: base.afkRate,
      multiFish: multi.value,
      multiFishRaw: multi.raw,
      multiFishCap: multi.cap,
      prowess: base.prowess,
      effReqOverrides: base.effReqOverrides,
      reasons: partial.concat(pw.reason ? [pw.reason] : [], ex.reason ? [ex.reason] : []),
    };
  }

  function evaluate(selection, spot, hours) {
    var inputs = inputsFor(selection, spot);
    var pools = FISHING_POOL_KEYS.map(function(key) { return fishingPoolOutcome(key, inputs, hours); });
    var reasons = inputs.reasons.filter(function(r, i, all) { return r && all.indexOf(r) === i; });
    return { inputs: inputs, pools: pools, partial: reasons.length > 0, reasons: reasons };
  }

  // Outcomes for every fishing location, each with its own pool and spot depth bonus.
  function evaluateLocations(selection, hours) {
    var reasons = [];
    var locations = fishingLocations().map(function(location) {
      var inputs = inputsFor(selection, location);
      inputs.reasons.forEach(function(r) { if (r && reasons.indexOf(r) < 0) reasons.push(r); });
      return Object.assign({}, location, {
        inputs: inputs,
        outcome: fishingPoolOutcome(location.poolKey, inputs, hours),
      });
    });
    return { locations: locations, partial: reasons.length > 0, reasons: reasons };
  }

  base.savedLocationId = savedFishingLocationId(base.savedMapIdx, base.savedSpotIdx, base.afkTarget);

  // Source breakdown trees for one toolkit and fishing location. Every node is
  // { name, val, fmt, note?, children? }; rates use a one-hour AFK claim.
  function breakdowns(selection, spot) {
    var inputs = inputsFor(selection, spot);
    var tk = inputs.toolkit;
    var pw = powerTerms(selection, tk.stats.POW);
    var ex = expTerms(selection, tk.stats.EXP);
    var e = inputs.efficiency;
    var toolkitName = tk.lure.name + ' + ' + tk.line.name;
    var spotName = spot && spot.label ? spot.label : 'Fishing spot';

    function toolkitTerm(stat, fmt) {
      return { name: 'Toolkit ' + stat, val: tk.stats[stat], fmt: fmt || 'raw', children: [
        { name: tk.lure.name + ' (lure)', val: tk.lure.stats[stat], fmt: fmt || 'raw' },
        { name: tk.line.name + ' (line)', val: tk.line.stats[stat], fmt: fmt || 'raw' },
      ] };
    }

    var efficiency = {
      name: 'Fishing Efficiency', val: e, fmt: 'raw', children: pw.effChildren,
      note: toolkitName + ' adds +' + tk.stats.POW + ' Skill Power',
    };
    var expMulti = {
      name: 'Fishing EXP multiplier', val: inputs.expMulti, fmt: 'x', children: ex.children,
      note: toolkitName + ' adds +' + tk.stats.EXP + '% Fishing EXP',
    };
    var afk = {
      name: 'AFK gains rate', val: base.afkRate, fmt: 'x',
      note: '(Base + (Skill + Shared) / 100) × ALL AFK multiplier, minimum 0.01',
      children: afkResult && Array.isArray(afkResult.children) ? afkResult.children : null,
    };

    // SkillStats("FishingSpeed") pieces, using the same arithmetic as fishingSpeed().
    var red1 = Math.min(e / (e + 300) * 1.7, 0.8);
    var red2 = Math.min(e / (e + 1e3) * 2, 1.7);
    var baseTime = 5.7 - (red1 + red2);
    var lvl = base.level;
    var levelTerm = 0.9 * Math.pow(lvl, 0.5) / (Math.pow(lvl, 0.5) + 250) + 0.6 * lvl / (lvl + 40);
    var rod = base.rodSpeed;
    var rodTerm = rod < 3 ? Math.pow(4 - rod, 2.2) : -0.2 * Math.pow(rod, 1.3);
    var rawTime = rod < 3 ? baseTime + rodTerm - levelTerm : baseTime - (-rodTerm + levelTerm);
    var clampedTime = Math.max(rawTime, 0.57);
    var speedTerms = [
      terms.food,
      toolkitTerm('SPEED', '%'),
      terms.card45,
      terms.talent637,
      terms.etc61,
      { name: 'Lab Mainframe 112 ÷ 20 (rounded)', val: Math.round(base.mainframe112 / 20), fmt: '%',
        children: [terms.mainframe112] },
    ];
    var divisor = 15 / (1 + inputs.speedBonusPct / 100);
    var catchTime = {
      name: 'Catch time (seconds)', val: inputs.speed, fmt: 'raw',
      note: 'max(base time ± rod − level, 0.57) × 15 / (1 + Speed bonus / 100)',
      children: [
        { name: 'Time before speed bonus', val: clampedTime, fmt: 'raw',
          note: rawTime < 0.57 ? 'Raised to the 0.57s minimum' : '', children: [
            { name: 'Base time from efficiency', val: baseTime, fmt: 'raw', children: [
              { name: 'Starting time', val: 5.7, fmt: 'raw' },
              { name: 'min(1.7 × E / (E + 300), 0.8)', val: -red1, fmt: 'raw' },
              { name: 'min(2 × E / (E + 1000), 1.7)', val: -red2, fmt: 'raw' },
            ] },
            { name: base.rodName + ' (rod speed ' + rod + ')', val: rodTerm, fmt: 'raw',
              note: rod < 3 ? '(4 − rod)^2.2 penalty' : '−0.2 × rod^1.3' },
            { name: 'Fishing level ' + lvl, val: -levelTerm, fmt: 'raw' },
          ] },
        { name: 'Speed bonus divisor', val: divisor, fmt: 'x', note: '15 / (1 + Speed bonus / 100)', children: [
          { name: 'Fishing Speed bonus', val: inputs.speedBonusPct, fmt: '%', children: speedTerms },
        ] },
      ],
    };
    var catchesPerHour = {
      name: 'Catches / hr (active)', val: inputs.catchesPerHour, fmt: 'raw',
      note: 'round(3600 / (catch time + 0.4) × attack factor)',
      children: [
        catchTime,
        { name: 'Attack loadout factor', val: inputs.attackFactorUsed, fmt: 'x',
          note: 'Saved ' + num4(base.attackFactor) + ', clamped to 1–3' },
      ],
    };

    var sqrtP = Math.sqrt(Math.max(0, inputs.power));
    var multiFish = {
      name: 'Multi-Fish', val: inputs.multiFish, fmt: '%',
      note: inputs.multiFishRaw > inputs.multiFishCap
        ? 'Capped: raw ' + num4(inputs.multiFishRaw) + '% exceeds ' + num4(inputs.multiFishCap) + '%' : '',
      children: [
        terms.stamp,
        { name: 'Skill Power: 100 × √P / (4√P + 50)', val: 100 * sqrtP / (4 * sqrtP + 50), fmt: '%',
          children: [Object.assign({ name: 'Fishing Skill Power', fmt: 'raw' }, pw.powerDetail || {}, { val: inputs.power })] },
        { name: 'Fishing level: 15 × L / (L + 40)', val: 100 * (0.15 * lvl / (lvl + 40)), fmt: '%' },
        terms.bubble,
        terms.starSign,
        { name: 'Multi-Fish cap', val: inputs.multiFishCap, fmt: '%', children: [
          { name: 'Base cap', val: base.bubbleFishingActive < 20 ? 100 : 300, fmt: '%',
            note: '300% once the Fishing Active bubble reaches 20' },
          terms.cosmo,
        ] },
      ],
    };

    var prowessPO = fishProw / 100 * 0.1 / (fishProw / 100 + 10);
    var prowess = {
      name: 'Fishing Prowess', val: inputs.prowess, fmt: 'raw',
      children: [
        { name: 'Post Office: Fishing Prowess', val: prowessPO, fmt: 'raw',
          note: '0.1 × (x/100) / (x/100 + 10)', children: [terms.fishProw] },
        terms.prowessAll,
      ],
    };

    var d = inputs.depths;
    var spotBonus = inputs.spotBonus || [0, 0, 0, 0];
    var depthNodes = [0, 1, 2, 3].map(function(i) {
      var children = [toolkitTerm('D' + i)];
      if (i > 0) children.push(terms.equipment[i - 1]);
      children.push({ name: spotName + ' depth bonus', val: Number(spotBonus[i]) || 0, fmt: 'raw' });
      if (i > 0) children.push({ name: '− D0 / 3', val: -d.D0 / 3, fmt: 'raw' });
      return { name: 'D' + i + (i === 0 ? ' (shallow)' : ''), val: d['D' + i], fmt: 'raw',
        note: i > 0 ? 'Minimum 0' : 'Lowers D1–D3 by D0 / 3', children: children };
    });
    var depths = { name: 'Fishing depths', val: d.D3, fmt: 'raw', note: 'D3 shown', children: depthNodes };

    var panels = [
      { id: 'efficiency', title: 'Efficiency', tree: efficiency },
      { id: 'exp', title: 'EXP multiplier', tree: expMulti },
      { id: 'afk', title: 'AFK rate', tree: afk },
      { id: 'speed', title: 'Catch speed', tree: catchesPerHour },
      { id: 'multi', title: 'Multi-Fish', tree: multiFish },
      { id: 'prowess', title: 'Prowess', tree: prowess },
      { id: 'depths', title: 'Depths', tree: depths },
    ];

    var outcome = spot && spot.poolKey ? fishingPoolOutcome(spot.poolKey, inputs, 1) : null;
    if (outcome) {
      var pool = outcome.pool;
      var req3 = pool.effReqs[2];
      var splitDepth = [null, d.D1, d.D2, d.D3];
      panels.push({ id: 'split', title: 'Catch split', tree: {
        name: 'Catch split — ' + pool.name, val: outcome.shareTotal, fmt: '%',
        note: 'Each tier requires efficiency ≥ its requirement; deeper tiers subtract from shallower ones',
        children: outcome.fish.map(function(f, t) {
          var node = { name: 'Fish ' + (t + 1) + ': ' + f.name, val: f.share, fmt: '%' };
          var parts = [];
          if (t > 0) parts.push('needs ' + num4(f.effReq) + ' efficiency' + (f.unlocked ? '' : ' (locked)'));
          if (splitDepth[t] != null) parts.push('D' + t + ' ' + num4(splitDepth[t]));
          if (parts.length) node.note = parts.join(', ');
          return node;
        }),
      } });
      var oreNode = {
        name: 'Fish per catch (ore value)', val: outcome.oreValue, fmt: 'raw',
        note: 'floor(max((E / Fish 4 requirement)^(0.25 + prowess), 1))',
        children: [
          { name: 'Efficiency', val: e, fmt: 'raw' },
          { name: 'Fish 4 efficiency requirement', val: req3, fmt: 'raw' },
          { name: 'Exponent: 0.25 + prowess', val: 0.25 + inputs.prowess, fmt: 'raw' },
        ],
      };
      var fishPerCatch = {
        name: 'Fish per AFK catch', val: outcome.fishPerCatch, fmt: 'raw', note: '(1 + Multi-Fish / 100) × ore value',
        children: [
          { name: 'Multi-Fish', val: 1 + inputs.multiFish / 100, fmt: 'x', note: '+' + num4(inputs.multiFish) + '%' },
          oreNode,
        ],
      };
      var afkCatches = {
        name: 'AFK catches / hr', val: outcome.catches, fmt: 'raw', note: 'Active catches / hr × AFK rate',
        children: [
          { name: 'Catches / hr (active)', val: inputs.catchesPerHour, fmt: 'raw' },
          { name: 'AFK gains rate', val: base.afkRate, fmt: 'x' },
        ],
      };
      panels.unshift({ id: 'totals', title: 'Fish & EXP / hr', tree: {
        name: spotName, val: outcome.fishTotal, fmt: 'raw', note: 'Fish per AFK hour',
        children: [
          { name: 'Fish / hr', val: outcome.fishTotal, fmt: 'raw',
            note: outcome.overwrittenFish > 0
              ? 'Per fish: floor(AFK catches × fish per catch × share). Types sharing one item overwrite each other in the AFK claim; only the last positive type is credited'
              : 'Per fish: floor(AFK catches × fish per catch × share)',
            children: [afkCatches, fishPerCatch].concat(outcome.fish.filter(function(f) { return f.active; })
              .map(function(f) {
                return {
                  name: 'Fish ' + (f.slot + 1) + ': ' + f.name + ' (' + num4(f.share) + '%)' + (f.overwritten ? ' — overwritten' : ''),
                  val: f.creditedCount, fmt: 'raw',
                  note: f.overwritten ? num4(f.count) + ' rolled, then replaced by a later ' + f.name + ' count in the claim' : undefined,
                };
              })) },
          { name: 'EXP / hr', val: outcome.exp, fmt: 'raw',
            note: 'Σ AFK catches × fish EXP × share × EXP multiplier (fish per catch does not add EXP)',
            children: outcome.fish.filter(function(f) { return f.active; }).map(function(f) {
              return { name: 'Fish ' + (f.slot + 1) + ': ' + f.expPerCatch + ' EXP × ' + num4(f.share) + '%', val: f.exp, fmt: 'raw' };
            }).concat([{ name: 'Fishing EXP multiplier', val: inputs.expMulti, fmt: 'x' }]) },
        ],
      } });
    }
    return { inputs: inputs, outcome: outcome, panels: panels };
  }

  // Hours to clear the current Trench depth and the next `depths - 1`, using AFK
  // fish/hr for `selection` and for the fish-maximizing lure + line at each depth
  // (skipped with opts.searchBest === false, which reports `selection` as best).
  // Each depth raises the efficiency requirement (lowering fish per catch) and
  // the fish requirement; Bolaia's Trench term grows with the projected depth.
  function trenchPlan(selection, depths, opts) {
    if (!base.trench) return null;
    var searchBest = !(opts && opts.searchBest === false);
    var count = Math.max(1, Math.min(Number(depths) || 1, 25));
    var lures = fishingToolkitOptions(0);
    var lines = fishingToolkitOptions(1);
    var spot = { mapIdx: null, spotIdx: null };
    var rows = [];
    var cumulativeSelected = 0;
    var cumulativeBest = 0;
    for (var k = 0; k < count; k++) {
      var layers = base.trench.layers + k;
      var requirement = k === 0 ? base.trench : cavernLayerRequirement(saveData, 3, layers);
      var overrides = { MotherlodeFISH: trenchFishingEffReqs(saveData, layers) };
      var outcomeFor = function(sel) {
        var inputs = Object.assign({}, inputsFor(sel, spot), { effReqOverrides: overrides });
        return fishingPoolOutcome('MotherlodeFISH', inputs, 1);
      };
      var selected = outcomeFor(selection);
      var best = { selection: selection, outcome: selected };
      for (var a = 0; searchBest && a < lures.length; a++) {
        for (var b = 0; b < lines.length; b++) {
          var sel = { lure: a, line: b };
          var outcome = outcomeFor(sel);
          if (outcome.fishTotal > best.outcome.fishTotal
            || (outcome.fishTotal === best.outcome.fishTotal && outcome.exp > best.outcome.exp)) {
            best = { selection: sel, outcome: outcome };
          }
        }
      }
      var hoursSelected = selected.fishTotal > 0 ? requirement.remaining / selected.fishTotal : Infinity;
      var hoursBest = best.outcome.fishTotal > 0 ? requirement.remaining / best.outcome.fishTotal : Infinity;
      cumulativeSelected += hoursSelected;
      cumulativeBest += hoursBest;
      rows.push({
        depth: layers + 1,
        layersCleared: layers,
        effReqs: overrides.MotherlodeFISH,
        requirement: requirement,
        selected: { outcome: selected, hours: hoursSelected, cumulativeHours: cumulativeSelected },
        best: { selection: best.selection, outcome: best.outcome, hours: hoursBest, cumulativeHours: cumulativeBest },
      });
    }
    return { trench: base.trench, rows: rows };
  }

  return { base: base, inputsFor: inputsFor, evaluate: evaluate, evaluateLocations: evaluateLocations,
    trenchPlan: trenchPlan, breakdowns: breakdowns };
}

// Ranks every lure/line pair for one pool by `objective` ('exp' or 'fish').
export function rankFishingToolkits(evaluator, poolKey, spot, objective, hours) {
  var lures = fishingToolkitOptions(0);
  var lines = fishingToolkitOptions(1);
  var rows = [];
  for (var a = 0; a < lures.length; a++) {
    for (var b = 0; b < lines.length; b++) {
      var selection = { lure: a, line: b };
      var outcome = fishingPoolOutcome(poolKey, evaluator.inputsFor(selection, spot), hours);
      rows.push({ selection: selection, outcome: outcome });
    }
  }
  var key = objective === 'fish' ? 'fishTotal' : 'exp';
  rows.sort(function(x, y) {
    return (y.outcome[key] - x.outcome[key]) || (y.outcome.exp - x.outcome.exp)
      || (y.outcome.fishTotal - x.outcome.fishTotal);
  });
  return rows;
}
