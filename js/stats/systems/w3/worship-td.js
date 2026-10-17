// ===== WORSHIP TOWER DEFENSE (W3) =====
// Source-matched Worship economy (charge, souls, EXP), Tower Defense tower
// math, trait passes, placement rules, a seeded 100 ms spatial run simulator,
// and a bounded build-plan optimizer.
//
// Game chain (N.new.formatted.js):
//   WorshipStuff: WorshipSpeed, ChargeMax, SoulRewards, ExpRewards, StartPts,
//     TotemHPtotal, NextWaveCountdown, SkullCurrency, NewTowerCost, TowerStats
//   ActorEvents_340 (_GenINFO 8/13/23/53/55/85): wave timer, spawns, kill credit
//   Wizard/tower actors: targeting, cooldowns, per-tower attacks, trait "z"
//
// Runtime details that the source leaves to animation timing are explicit,
// labeled assumptions (see TD_ASSUMPTIONS); everything else is literal.

import { createStatContext } from '../../stat-context.js';
import { resolverTerm, rval, sourceTerm, sumTerms } from '../../defs/skill-helpers.js';
import { gridBonusFinal } from '../../defs/helpers.js';
import { superBitType, cloudBonus } from '../../../game-helpers.js';
import { talent } from '../common/talent.js';
import { etcBonus } from '../common/etcBonus.js';
import {
  computeBoxReward,
  computeCardBonusByType,
  computeMealBonus,
  computeStatueBonusGiven,
} from '../common/stats.js';
import { computeCardSetBonus } from '../common/cards.js';
import { computeStarSignBonus } from '../common/starSign.js';
import { vaultUpgBonus } from '../common/vault.js';
import { computeStampBonusOfTypeX } from '../w1/stamp.js';
import { computeVialByKey, finalBubbleValByKey } from '../w2/alchemy.js';
import { arcadeBonus } from '../w2/arcade.js';
import { computeSaltLick } from './construction.js';
import { getSetBonus } from './setBonus.js';
import { bubbaRoGBonuses } from '../w7/bubba.js';
import { computeMeritocBonusz } from '../w7/meritoc.js';
import {
  charClassData,
  dreamData,
  equipOrderData,
  equipQtyData,
  foodSlotsOwnedData,
  numCharacters,
  playerStuffData,
  skillLvData,
} from '../../../save/data.js';
import { ITEMS } from '../../data/game/items.js';
import { ATTACKS } from '../../data/game/attacks.js';
import { formulaEval } from '../../../formulas.js';
import { computeAllTalentLVz } from '../common/talent.js';
import {
  TD_TOWER_BASE_COST,
  TD_TOWER_COUNT,
  TD_TRIAL_COUNT,
  tdGeometry,
  tdMob,
  tdSkull,
  tdTowerDef,
  tdTrait,
  tdTrialBase,
  tdTrialScene,
  tdTrialPath,
  tdWaveRow,
} from '../../data/w3/worship-td.js';

export var TD_ASSUMPTIONS = [
  'Wizards scan for targets on 100 ms ticks rather than the source\'s 1/60 s frame updates; after each shot the cooldown runs, then a 300 ms popup (frames 1-3) precedes the ready frame, so the firing period is ceil(cooldown / 0.1) + 3 ticks. A failed scan keeps the wizard ready.',
  'Pulse, Frozone, and Void hit when they fire; Storm bolts land 300 ms later.',
  'Fireballs land 1.8 s after firing; the second fireball lands 0.5 s later.',
  'Kraken underlings move 3 px/tick; their 200 ms, 1 s, and 2 s timers start at spawn, and the 1 s wander roll fires on a 100 ms tick boundary.',
  'Position tweens (Kraken knockback) override velocity for their 0.6 s duration, sampled on 100 ms ticks.',
  'A Kraken hit on an already-dead acquired target deals no damage but still consumes the hit and applies knockback.',
  'Sprite centers use unscaled frame sizes.',
  'The 1 s wave timer ticks on the first 100 ms tick of each second.',
  'Active buff 475 is treated as 0 in Charge Max.',
  'Souls/hr assumes charge-limited steady claiming; the multi-claim MSA bonus applies once per reset.',
  'After an upgrade the tower uses its raw cooldown until the next trait pass (source quirk).',
  'Poisonic clouds are centered on the target at NodeY - 24.',
  'The map-100 TrialType override is ignored.',
  'Each direct hit rolls its own critical, except a Pulse volley, which rolls once for all of its hits.',
  'A portal blocks placement when its endpoint node or that endpoint\'s neighbor is the placement node.',
  'Frozone fires only while its target is on the side the wizard faces; its ring then hits every mob in range.',
];

export var TD_TOWER_NAMES = ['Pulse', 'Fireball', 'Boulder', 'Frozone', 'Storm', 'Party', 'Kraken', 'Poisonic', 'Void'];

// ---------- Small helpers ----------

function _num(value) {
  if (value && typeof value === 'object') {
    if (value.val != null) return Number(value.val) || 0;
    if (value.total != null) return Number(value.total) || 0;
    if (value.computed != null) return Number(value.computed) || 0;
  }
  return Number(value) || 0;
}

function _raw(fn) {
  try { return fn(); } catch (e) { return 0; }
}

function _term(name, fn, fmt) {
  var raw = _raw(fn);
  return sourceTerm(name, raw, { val: _num(raw), fmt: fmt });
}

function _f100(x) { return Math.floor(100 * x) / 100; }

export function tdDistance(dx, dy) {
  var ax = Math.abs(dx), ay = Math.abs(dy);
  return 0.9604339 * Math.max(ax, ay) + 0.397824735 * Math.min(ax, ay);
}

export function mulberry32(seed) {
  var a = seed >>> 0;
  return function() {
    a = (a + 0x6D2B79F5) >>> 0;
    var t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function _randInt(rng, a, b) { return a + Math.floor(rng() * (b - a + 1)); }

// ---------- Wave / currency formulas ----------

export function nextWaveCountdown(t) {
  if (t % 10 === 0 && t !== 0) return 9999;
  if (Math.floor(t / 10) > 19) return 25 + 5 * Math.floor((t - 10) / 10);
  if (t > 9) return 25;
  if (t > 4) return 20;
  if (t > 0.5) return 15;
  return 6;
}

export function hpMulti(size, skull) {
  return Math.pow(3, size - 2) * Math.pow(3 + 0.3 * skull, skull);
}

export function mobMaxHp(trial, row) {
  var base = tdTrialBase(trial);
  return Math.ceil(base.hpBase * hpMulti(row.size, row.skull));
}

export function skullCurrency(s, waveCounter, saltLickX) {
  var W = Number(waveCounter) || 0;
  var X = saltLickX == null ? 1 : saltLickX;
  if (s >= 6) return Math.floor((250 * Math.pow(Math.round(s - 6), 1.5) + Math.floor(W)) * X);
  if (s === 5) return Math.floor((150 + W) * X);
  if (s === 4) return Math.floor((70 + W) * X);
  if (s === 3) return Math.floor((25 + Math.floor(W / 2)) * X);
  if (s === 2) return Math.round((10 + Math.floor(W / 3)) * X);
  if (s === 1) return Math.round((5 + Math.floor(W / 4)) * X);
  return Math.round((2 + Math.floor(W / 5)) * X);
}

// Points awarded for one kill (before rounding into the running total).
export function killCredit(statusSkull, size, waveCounter, inputs) {
  var mult = inputs ? inputs.killPtsMult : 1;
  var x = inputs ? inputs.saltLickX : 1;
  return Math.ceil(skullCurrency(statusSkull, waveCounter, x) * Math.max(0.34, 2 * size - Math.min(size + 1, 4)) * mult);
}

export function killExp(trial, statusSkull) {
  return (trial + 1) * (trial + 1) + (2 + 2 * (trial + 1)) * statusSkull;
}

export function skipReward(timer, wave) {
  if (!(timer > 2 && wave > 0 && wave % 10 !== 0)) return 0;
  return Math.min(999, Math.floor(timer / 4) + wave + Math.floor((wave + 1) / 10));
}

// ---------- Tower formulas ----------

function _U(type, TI) {
  var def = tdTowerDef(type);
  return 1 + (TI - 1) * def.perLvA / 100;
}

export function towerDamage(type, i, TI, M) {
  var U = _U(type, TI);
  var d;
  switch (type) {
    case 0: d = M * i * Math.pow(1.2 - 0.193 * i / (15 + i), i) * U; break;
    case 1: d = M * (2 + 1.4 * i * Math.pow(1.23 - 0.225 * i / (20 + i), i)) * U; break;
    case 2: d = 3 * M * i * Math.pow(1.13 - 0.125 * i / (30 + i), i) * U; break;
    case 3: d = 3 * M * i; break;
    case 4: d = M * (13 + 5 * i) * Math.pow(1.2 - 0.193 * i / (20 + i), i) * U; break;
    case 5: d = 0; break;
    case 6: d = 2 * M * i * Math.pow(1.2 - 0.193 * i / (20 + i), i) * U; break;
    case 7: d = M * (1 + i) * Math.pow(1.2 - 0.193 * i / (20 + i), i) * U; break;
    case 8: d = M * (8 + 2 * i) * Math.pow(1.2 - 0.193 * i / (20 + i), i); break;
    default: d = 0;
  }
  return d < 1e9 ? Math.floor(d) : d;
}

export function towerUpgradeCost(type, i, TI) {
  var f;
  switch (type) {
    case 0: f = (2 + 3 * i) * Math.pow(1.57, i); break;
    case 1: f = (3 + 3.5 * i) * Math.pow(1.58, i); break;
    case 2: f = (4 + 4 * i) * Math.pow(1.61, i); break;
    case 3: f = (4 + 3 * i) * Math.pow(1.5, i); break;
    case 4: f = (5 + 4 * i) * Math.pow(1.63, i); break;
    case 5: f = (2 + 2 * i) * Math.pow(1.55, i); break;
    case 6: f = (6 + 4.5 * i) * Math.pow(1.6, i); break;
    case 7: f = (10 + 4.8 * i) * Math.pow(1.63, i); break;
    case 8: f = (15 + 5 * i) * Math.pow(1.65, i); break;
    default: f = Infinity;
  }
  var def = tdTowerDef(type);
  return Math.floor(f * Math.max(0.05, 1 - (TI - 1) * def.perLvB / 100));
}

export function towerAtkcd(type, i, TI) {
  switch (type) {
    case 0: return _f100(Math.max(1, 4.2 - 2.65 * i / (i + 10)));
    case 1: return _f100(5.15 - 3.2 * i / (i + 7));
    case 2: return _f100(6.4 - 3.7 * i / (i + 7));
    case 3: return Math.max(1.6, _f100(7 - 3.5 * i / (i + 7)));
    case 4: case 5: case 7: return _f100(10 - 3 * i / (i + 7));
    case 6: return Math.floor((10 - 3 * i / (i + 7)) / _U(6, TI) * 100) / 100;
    case 8: return _f100(14 - 4 * i / (i + 7));
    default: return 10;
  }
}

export function towerRange(type, i, TI) {
  var def = tdTowerDef(type);
  switch (type) {
    case 0: case 1: case 2: return Math.floor(80 + 150 * i / (i + 7));
    case 3: return Math.floor(85 + 25 * i / (i + 7) + (TI - 1) * def.perLvA);
    case 4: return Math.floor(250 + 150 * i / (i + 7));
    case 5: return Math.floor(250 * _U(5, TI));
    case 6: case 7: return 275;
    case 8: return Math.floor(50 + 25 * i / (i + 7) + (TI - 1) * def.perLvA);
    default: return 0;
  }
}

export function newTowerCost(type, placedCount) {
  var n = Number(placedCount) || 0;
  return Math.floor(TD_TOWER_BASE_COST[type] * Math.ceil((n + 1) / 3) + 2 * Math.pow(1.3 + 0.03 * n, n));
}

export function atom5Bonus(towerLevels) {
  var s = 0;
  for (var t = 0; t < TD_TOWER_COUNT; t++) s += Math.max(0, (Number(towerLevels[t]) || 0) - 50);
  return 2 * s;
}

export function towerDamageMulti(inputs, firstTowerMap9, waveClock) {
  return (1 + inputs.atom5 / 100) *
    (1 + Math.max(0, inputs.dream7 * waveClock / 100)) *
    (1 + (Number(firstTowerMap9) || 0) / 100);
}

// Static per-level stats for the UI tables.
export function towerStatsAt(type, level, TI, M) {
  return {
    type: type,
    level: level,
    damage: towerDamage(type, level, TI, M == null ? 1 : M),
    atkcd: towerAtkcd(type, level, TI),
    range: towerRange(type, level, TI),
    upgradeCost: towerUpgradeCost(type, level, TI),
  };
}

// Trait "z": rebuild every tower's trait map and cooldown.
export function applyTraits(towers, towerLevels) {
  var i, j, k;
  for (i = 0; i < towers.length; i++) {
    var tw = towers[i];
    tw.map = new Array(10).fill(0);
    var tr = tdTrait(tw.type);
    for (k = 0; k < tw.traits.length; k++) {
      var side = tw.traits[k] === 'A' ? tr.A : tr.B;
      tw.map[side.key] += side.value;
    }
  }
  for (i = 0; i < towers.length; i++) {
    var src = towers[i];
    var trs = tdTrait(src.type);
    var srcRange = towerRange(src.type, src.lvl, towerLevels[src.type]) + 10;
    for (k = 0; k < src.traits.length; k++) {
      var isA = src.traits[k] === 'A';
      for (j = 0; j < towers.length; j++) {
        var dst = towers[j];
        var d = tdDistance(dst.cx - src.cx, dst.cy - src.cy);
        if (src.type === 5 && isA) {
          if (d < srcRange) dst.map[trs.A.key] += trs.A.value;
        } else if (src.type === 4 && !isA) {
          if (j !== i && d < srcRange) dst.map[trs.B.key] += trs.B.value;
        } else if ((src.type === 5 || src.type === 8) && !isA) {
          if (j !== i) dst.map[trs.B.key] += trs.B.value;
        }
      }
    }
  }
  for (i = 0; i < towers.length; i++) {
    var t2 = towers[i];
    t2.cdMax = towerAtkcd(t2.type, t2.lvl, towerLevels[t2.type]) / (1 + t2.map[0] / 100);
  }
  return towers;
}

// ---------- Geometry / placement ----------

function _node(geom, n) { return geom && geom.nodes[n]; }

function _validNode(geom, n) {
  var nd = _node(geom, n);
  if (!nd) return false;
  if (n >= geom.numberOfNodes - 1) return false;
  if (nd.length < nd.x + 60) return false;
  return true;
}

export function placeableNodes(trial) {
  var geom = tdGeometry(trial);
  var out = [];
  if (!geom) return out;
  for (var n = 0; n < geom.nodes.length; n++) if (_validNode(geom, n)) out.push(n);
  return out;
}

function _pathIndexOf(path, node) { return path.path.indexOf(node); }

export function nodeFlag(trial, node) {
  var p = tdTrialPath(trial);
  var i = _pathIndexOf(p, node);
  return i < 0 ? 0 : p.flags[i];
}

function _portalBlocks(geom, node, x) {
  var portals = geom.portals || [];
  for (var i = 0; i < portals.length; i++) {
    var pt = portals[i];
    if (Math.abs(pt[0] + 20 - x) >= 60) continue;
    var end = Number(pt[2]);
    var endNode = geom.nodes[end];
    if (end === node || (endNode && (endNode.neighbors || []).map(Number).indexOf(node) >= 0)) return true;
  }
  return false;
}

// Validate a requested tower position (with the game's clamp and snap).
export function validatePlacement(trial, towers, node, x) {
  var geom = tdGeometry(trial);
  if (!geom || !_validNode(geom, node)) return { ok: false, x: x, reason: 'Not a placeable platform' };
  var nd = geom.nodes[node];
  var lo = nd.x + 30, hi = nd.length - 30;
  var px = Math.round(Math.max(lo, Math.min(hi, x)));
  towers = towers || [];
  // Placement cursor: every same-platform tower within 61 px nudges it to 62 px on the side it is
  // strictly greater than (ties go left), in list order without stopping; then it is clamped again.
  for (var i = 0; i < towers.length; i++) {
    var o = towers[i];
    if (o.node === node && Math.abs(o.x - px) < 61) px = px > o.x ? o.x + 62 : o.x - 62;
  }
  px = Math.round(Math.max(lo, Math.min(hi, px)));
  var p = tdTrialPath(trial);
  var first = p.path[0], last = p.path[p.path.length - 1];
  var ff = p.flags[0], lf = p.flags[p.flags.length - 1];
  if (node === first && ((ff === 1 && px > nd.length - 80) || (ff === 0 && px < nd.x + 80))) {
    return { ok: false, x: px, reason: 'Too close to the mob spawn' };
  }
  if (node === last && ((lf === 0 && px > nd.length - 80) || (lf === 1 && px < nd.x + 80))) {
    return { ok: false, x: px, reason: 'Too close to the totem exit' };
  }
  for (var j = 0; j < towers.length; j++) {
    if (towers[j].node === node && Math.abs(towers[j].x - px) < 61) return { ok: false, x: px, reason: 'Overlaps another tower' };
  }
  if (_portalBlocks(geom, node, px)) return { ok: false, x: px, reason: 'Blocked by a portal' };
  return { ok: true, x: px, reason: '' };
}

// Stage-by-stage layouts as the sim places them: every initial tower, then each phase's sells and
// builds. Each request is snapped against the towers standing at that moment; illegal ones are
// returned in `rejected` instead of being drawn.
export function planPlacementLayouts(trial, plan) {
  var list = [], idx = 0, out = [], rejected = [];
  function add(t) {
    var i = idx++;
    var v = validatePlacement(trial, list, t.slot.node, t.slot.x);
    if (!v.ok) { rejected.push({ planIdx: i, type: t.type, node: t.slot.node, x: t.slot.x, reason: v.reason }); return; }
    list.push({ type: t.type, node: t.slot.node, x: v.x, reqX: t.slot.x, traits: t.traits || '', planIdx: i });
  }
  (plan.towers || []).forEach(add);
  out.push({ label: 'Initial build', towers: list.slice(), rejected: rejected.slice() });
  (plan.phases || []).forEach(function(ph) {
    var s = ph.sell || {};
    var keepTypes = s.keepTypes || [], types = s.types || [], ids = s.planIdx || [];
    list = list.filter(function(t) {
      return s.all ? keepTypes.indexOf(t.type) >= 0 : !(types.indexOf(t.type) >= 0 || ids.indexOf(t.planIdx) >= 0);
    });
    rejected = [];
    (ph.towers || []).forEach(add);
    out.push({ label: ph.label || 'Phase', towers: list.slice(), rejected: rejected });
  });
  return out;
}

// Rewrite every stage's slots so each request is exactly where the sim would place it. Initial towers
// are fitted in order; each phase then removes its sold towers and fits its own builds against the
// towers still standing. An overlapping request moves to the nearest free legal slot on its platform
// (or anywhere, failing that); towers with no legal slot are dropped and every phase's sell indices
// (global plan indices: initial towers, then each phase's towers in order) are renumbered.
export function legalizePlan(trial, plan, slots) {
  slots = slots || legalSlots(trial, 10);
  var placed = [], map = [], g = 0, kept = 0;
  function fit(t) {
    var v = validatePlacement(trial, placed, t.slot.node, t.slot.x);
    if (!v.ok) {
      var best = null, bestD = Infinity;
      for (var k = 0; k < slots.length; k++) {
        var s = slots[k];
        var d = (s.node === t.slot.node ? 0 : 1e6) + Math.abs(s.x - t.slot.x);
        if (d >= bestD) continue;
        var w = validatePlacement(trial, placed, s.node, s.x);
        if (w.ok && w.x === s.x) { best = s; bestD = d; }
      }
      if (!best) return false;
      v = { ok: true, x: best.x };
      t.slot = { node: best.node, x: best.x };
    }
    t.slot = { node: t.slot.node, x: v.x };
    return true;
  }
  function stage(list) {
    var keep = [];
    list.forEach(function(t) {
      if (fit(t)) { placed.push({ node: t.slot.node, x: t.slot.x, type: t.type, planIdx: kept }); map[g++] = kept++; keep.push(t); }
      else map[g++] = -1;
    });
    return keep;
  }
  plan.towers = stage(plan.towers);
  (plan.phases || []).forEach(function(ph) {
    var s = ph.sell || {};
    // A phase sells before queueing its own towers, so only earlier global indices are meaningful.
    if (s.planIdx) s.planIdx = s.planIdx.filter(function(j) { return j >= 0 && j < g; }).map(function(j) { return map[j]; }).filter(function(j, i, a) { return j >= 0 && a.indexOf(j) === i; });
    var keepTypes = s.keepTypes || [], types = s.types || [], ids = s.planIdx || [];
    placed = placed.filter(function(t) {
      return s.all ? keepTypes.indexOf(t.type) >= 0 : !(types.indexOf(t.type) >= 0 || ids.indexOf(t.planIdx) >= 0);
    });
    if (ph.towers) ph.towers = stage(ph.towers);
  });
  return plan;
}

export function legalSlots(trial, step) {
  step = step || 10;
  var geom = tdGeometry(trial);
  var out = [];
  placeableNodes(trial).forEach(function(n) {
    var nd = geom.nodes[n];
    for (var x = nd.x + 30; x <= nd.length - 30; x += step) {
      var v = validatePlacement(trial, [], n, x);
      if (v.ok && v.x === x) out.push({ node: n, x: x });
    }
  });
  return out;
}

export function towerCenters(trial, node, x) {
  var nd = tdGeometry(trial).nodes[node];
  return { wx: x - 5.5, wy: nd.y - 9.5, cx: x - 2, cy: nd.y - 9.5, facing: 1 - 2 * nodeFlag(trial, node) };
}

// Sampled mob path positions (for coverage heuristics and UI).
export function pathSamples(trial, spacing) {
  spacing = spacing || 20;
  var geom = tdGeometry(trial);
  var p = tdTrialPath(trial);
  var mob = tdMob(trial);
  var out = [];
  p.path.forEach(function(n, pi) {
    var nd = geom.nodes[n];
    var top = nd.y - mob.height + (mob.height - 50) / 2;
    for (var x = nd.x; x <= nd.length; x += spacing) out.push({ node: n, pi: pi, x: x, y: top + mob.frameH / 2 });
  });
  return out;
}

export function slotCoverage(trial, slot, range) {
  var c = towerCenters(trial, slot.node, slot.x);
  var samples = pathSamples(trial, 20);
  var n = 0;
  for (var i = 0; i < samples.length; i++) if (tdDistance(samples[i].x - c.wx, samples[i].y - c.wy) < range) n++;
  return n;
}

// ---------- Save-backed inputs ----------

function _ctx(saveData, charIdx) {
  return createStatContext({ charIdx: charIdx, saveData: saveData, layer1: { skillType: 'Worship' } });
}

function _itemName(key) {
  var item = ITEMS[key];
  return item && item.displayName ? String(item.displayName).replace(/_/g, ' ') : String(key);
}

function _foodDetail(effectKey, label, charIdx, saveData, ctx) {
  var order = equipOrderData[charIdx] && equipOrderData[charIdx][2];
  var qty = equipQtyData[charIdx] && equipQtyData[charIdx][2];
  var slots = Number(foodSlotsOwnedData[charIdx]) || 0;
  var amount = 0;
  var items = [];
  for (var i = 0; order && i < slots; i++) {
    var key = order[i];
    if (!key || key === 'Blank' || !(Number(qty && qty[i]) !== 0)) continue;
    var item = ITEMS[key];
    if (item && item.Effect === effectKey) {
      amount += Number(item.Amount) || 0;
      items.push(sourceTerm(_itemName(key) + ' (food slot ' + (i + 1) + ')', Number(item.Amount) || 0));
    }
  }
  if (amount <= 0) return { name: label, val: 0, fmt: '%', note: 'No ' + label.toLowerCase() + ' equipped' };
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
  return { name: label, val: amount * effect, fmt: '%', children: [
    { name: 'Equipped food amount', val: amount, fmt: '%', children: items },
    { name: 'Food effect multiplier', val: effect, fmt: 'x', children: effectTerms },
  ] };
}

function _arr(a) { return Array.isArray(a) ? a : []; }

function _talentLv(saveData, ci, id) {
  var raw = Number(skillLvData[ci] && skillLvData[ci][id]) || 0;
  if (raw <= 0) return 0;
  return raw + _num(_raw(function() { return computeAllTalentLVz(id, ci, undefined, saveData); }));
}

// Talent 303 "Stop Right There": every live mob whose top-left corner lies within
// DistanceEqn < 150 + 1.5L of the player's center gains StatusNoMove for 4 + floor(L/20) s.
// Cooldown is ceil(60 / AtkCooldownDEC); outside dungeons AtkCooldownDEC = 1 + (Talent 289 + box cooldown) / 100.
export function worshipTdRootStats(saveData, charIdx) {
  var ci = Number(charIdx) || 0;
  var lv = _talentLv(saveData, ci, 303);
  var lv289 = _talentLv(saveData, ci, 289);
  var t289 = lv289 > 0 ? formulaEval('decay', 30, 40, lv289) : 0;
  var box = _num(_raw(function() { return computeBoxReward(ci, 'cooldown'); }));
  var atk = ATTACKS.STOP_RIGHT_THERE || { cooldown: 60, castTime: 1.5 };
  var dec = 1 + (t289 + box) / 100;
  return {
    charIdx: ci,
    available: lv > 0,
    level: lv,
    radius: lv > 0 ? formulaEval('bigBase', 150, 1.5, lv) : 0,
    seconds: lv > 0 ? formulaEval('intervalAdd', 4, 20, lv) : 0,
    cooldown: Math.ceil(atk.cooldown / dec),
    castTime: atk.castTime,
  };
}

export function worshipTdInputs(saveData, charIdx) {
  var ci = Number(charIdx) || 0;
  var ctx = _ctx(saveData, ci);
  var lv0 = _arr(saveData.lv0AllData && saveData.lv0AllData[ci]);
  var level = Number(lv0[9]) || 0;
  var skullKey = equipOrderData[ci] && equipOrderData[ci][1] && equipOrderData[ci][1][5];
  var skull = tdSkull(skullKey);
  var S = skull ? skull.speed : 0;

  // WorshipSpeed (charge per hour)
  var sl = Math.sqrt(level);
  var L = 0.9 * sl / (sl + 250) + 0.6 * level / (level + 40);
  var baseSpeed = S < 3
    ? 6 / Math.max(5.7 + Math.pow(4 - S, 2.2) - L, 0.57)
    : 6 / Math.max(5.7 - (0.2 * Math.pow(S, 1.3) + L), 0.57);
  var activeBubble = _num(_raw(function() { return finalBubbleValByKey('worshipACTIVE', ci, saveData); }));
  var card54 = _term('Card Bonus 54', function() { return computeCardBonusByType(54, ci, saveData); });
  var stampCharge = _term('Stamps: Worship Charge', function() { return computeStampBonusOfTypeX('WorshipCharge', saveData, ci); });
  var t478 = resolverTerm(talent, 478, ctx, undefined, 'Talent 478', 'x');
  var activeMul = Math.max(activeBubble, 1);
  var chargePct = 1 + (card54.val + stampCharge.val) / 100;
  var t478Mul = Math.max(t478.val, 1);
  var worshipSpeed = baseSpeed * activeMul * chargePct * t478Mul;
  var speedTree = { name: 'Charge rate (per hour)', val: worshipSpeed, fmt: 'raw', note: 'Panel shows ' + Math.round(24 * worshipSpeed) + '/day', children: [
    { name: 'Skull + level base', val: baseSpeed, fmt: 'raw', note: (skull ? skull.name + ' (Speed ' + S + ')' : 'No skull') + ', Worship Lv ' + level },
    { name: 'Bubble: worshipACTIVE', val: activeMul, fmt: 'x' },
    { name: 'Charge rate bonus', val: chargePct, fmt: 'x', children: [card54, stampCharge] },
    { name: 'Talent 478', val: t478Mul, fmt: 'x', children: t478.children },
  ] };

  // ChargeMax
  var card52 = _term('Card Bonus 52', function() { return computeCardBonusByType(52, ci, saveData); });
  var box18b = _term('Post Office: 18b', function() { return computeBoxReward(ci, '18b'); });
  var stampMax = _term('Stamps: Worship Max', function() { return computeStampBonusOfTypeX('WorshipMax', saveData, ci); });
  var maxChargeBubble = _num(_raw(function() { return finalBubbleValByKey('maxCharge', ci, saveData); }));
  var skullCraft = Math.round(skull ? skull.lvReqToCraft : 0);
  var inner = (0 + (stampMax.val + maxChargeBubble * Math.floor(level / 10)) + skullCraft) * activeMul;
  var chargeMax = Math.floor(Math.max(50, card52.val + box18b.val + inner));
  var chargeMaxTree = { name: 'Charge Max', val: chargeMax, fmt: 'raw', children: [
    card52, box18b,
    { name: 'Scaled charge capacity', val: inner, fmt: 'raw', children: [
      stampMax,
      { name: 'Bubble: maxCharge x floor(Lv/10)', val: maxChargeBubble * Math.floor(level / 10), fmt: 'raw', note: maxChargeBubble + ' x ' + Math.floor(level / 10) },
      { name: 'Skull craft level', val: skullCraft, fmt: 'raw' },
      { name: 'Active buff 475 (assumed 0)', val: 0, fmt: 'raw' },
      { name: 'Bubble: worshipACTIVE', val: activeMul, fmt: 'x' },
    ] },
  ] };

  // Starting points
  var vialPts = _term('Vials: TD points', function() { return computeVialByKey('TDpts', saveData, ci); }, 'raw');
  var card55 = _term('Card Bonus 55', function() { return computeCardBonusByType(55, ci, saveData); }, 'raw');
  var arc15 = _term('Arcade 15', function() { return arcadeBonus(15, saveData); }, 'raw');
  var stampPts = _term('Stamps: Worship Pts', function() { return computeStampBonusOfTypeX('WorshipPTS', saveData, ci); }, 'raw');
  var box18c = _term('Post Office: 18c', function() { return computeBoxReward(ci, '18c'); }, 'raw');
  var cloud27 = 200 * _num(_raw(function() { return cloudBonus(27, saveData.weeklyBossData); }));
  var startPts = Math.round(vialPts.val + (card55.val + (5 + arc15.val + (stampPts.val + (box18c.val + cloud27)))));
  var startTree = { name: 'Starting TD points', val: startPts, fmt: 'raw', children: [
    { name: 'Base', val: 5, fmt: 'raw' }, vialPts, card55, arc15, stampPts, box18c,
    { name: 'Weekly cloud 27 (x200)', val: cloud27, fmt: 'raw' },
  ] };

  var sb6 = _num(_raw(function() { return superBitType(6, saveData.gamingData && saveData.gamingData[12]); }));
  var sb15 = _num(_raw(function() { return superBitType(15, saveData.gamingData && saveData.gamingData[12]); }));
  var totemHp = 5 * sb6 + 10 * sb15 + 5;
  var totemTree = { name: 'Totem HP', val: totemHp, fmt: 'raw', children: [
    { name: 'Base', val: 5, fmt: 'raw' },
    { name: 'Super Bit 6 (+5)', val: 5 * sb6, fmt: 'raw' },
    { name: 'Super Bit 15 (+10)', val: 10 * sb15, fmt: 'raw' },
  ] };

  var towerLevels = [];
  for (var t = 0; t < TD_TOWER_COUNT; t++) towerLevels.push(Number(saveData.towerData && saveData.towerData[9 + t]) || 0);
  var atom5 = atom5Bonus(towerLevels);
  var dream7 = Number(dreamData && dreamData[7]) || 0;
  var saltLick = _num(_raw(function() { return computeSaltLick(6, saveData); }));
  var saltLickX = 1 + saltLick / 100;
  var meal = _term('Meals: TD points', function() { return computeMealBonus('TDpts', saveData, ci); });
  var merit16 = _term('Meritocracy 16', function() { return computeMeritocBonusz(16, saveData, ci); });
  var killPtsMult = (1 + meal.val / 100) * (1 + merit16.val / 100);
  var killTree = { name: 'Kill point multiplier', val: killPtsMult, fmt: 'x', children: [
    { name: 'Meals', val: 1 + meal.val / 100, fmt: 'x', children: [meal] },
    { name: 'Meritocracy 16', val: 1 + merit16.val / 100, fmt: 'x', children: [merit16] },
    { name: 'Salt Lick 6 (skull currency)', val: saltLickX, fmt: 'x' },
  ] };
  var damageTree = { name: 'Tower damage multiplier (wave start)', val: 1 + atom5 / 100, fmt: 'x', children: [
    { name: 'Atom 5: 2 x levels above 50', val: 1 + atom5 / 100, fmt: 'x', note: '+' + atom5 + '%' },
    { name: 'Dream 7 per second into wave', val: dream7, fmt: '%', note: 'Grows from -10 s at wave start, cap 14400 s' },
  ] };

  // Soul rewards
  var effRes = _raw(function() { return ctx.resolve('skill-efficiency'); });
  var efficiency = _num(effRes);
  var food = _foodDetail('WorshipSoulBoosts', 'Soul food', ci, saveData, ctx);
  var dementia = _term('Dementia Set', function() { return getSetBonus('DEMENTIA_SET', ci); });
  var bubba3 = _term('Bubba RoG 3', function() { return bubbaRoGBonuses(3, saveData); });
  var t57tal = rval(talent, 57, ctx, { mode: 'max' });
  var bestSkill = 0;
  var nChar = Number(numCharacters) || 0;
  for (var c = 0; c < nChar; c++) {
    if (!((Number(charClassData[c]) || 0) < 6)) continue;
    var row = _arr(saveData.lv0AllData && saveData.lv0AllData[c]);
    bestSkill = Math.max(bestSkill, (Number(row[7]) || 0) + (Number(row[9]) || 0));
  }
  var t57 = t57tal * Math.max(0, bestSkill - 100);
  var arcade24 = _term('Arcade 24', function() { return arcadeBonus(24, saveData); });
  var vault50 = _term('Vault 50', function() { return vaultUpgBonus(50, saveData); });
  var soulAdd = food.val + dementia.val + bubba3.val;
  var soulMul = (1 + soulAdd / 100) * (1 + t57 / 100) * (1 + arcade24.val / 100) * (1 + vault50.val / 100);
  var soulTree = { name: 'Soul multiplier (excluding wave/efficiency)', val: soulMul, fmt: 'x', children: [
    { name: 'Additive soul bonus', val: 1 + soulAdd / 100, fmt: 'x', children: [food, dementia, bubba3] },
    { name: 'Talent 57', val: 1 + t57 / 100, fmt: 'x', note: t57tal + ' x max(0, ' + bestSkill + ' - 100)' },
    { name: 'Arcade 24', val: 1 + arcade24.val / 100, fmt: 'x', children: [arcade24] },
    { name: 'Vault 50', val: 1 + vault50.val / 100, fmt: 'x', children: [vault50] },
  ] };

  var expRes = _raw(function() { return ctx.resolve('skill-exp'); });
  var expMulti = _num(expRes) || 1;

  var gl170 = Number(saveData.gridLevels && saveData.gridLevels[170]) || 0;
  var ola501 = Number(saveData.optionsListData && saveData.optionsListData[501]) || 0;
  var msaBonus = gl170 >= 1 ? _num(_raw(function() { return gridBonusFinal(saveData, 170); })) : 0;
  var msa = gl170 >= 1 && ola501 === 0 ? 1 + msaBonus / 100 : 1;

  var totem = saveData.totemInfoData || [];
  var bestWaves = [], cpWaves = [], cpPts = [];
  for (var tr = 0; tr < TD_TRIAL_COUNT; tr++) {
    bestWaves.push(Number(totem[0] && totem[0][tr]) || 0);
    cpWaves.push(Number(totem[1] && totem[1][tr]) || 0);
    cpPts.push(Number(totem[2] && totem[2][tr]) || 0);
  }
  var charge = Number(playerStuffData[ci] && playerStuffData[ci][0]) || 0;

  return {
    charIdx: ci,
    level: level,
    skull: skull,
    worshipSpeed: worshipSpeed,
    chargeMax: chargeMax,
    charge: charge,
    startPts: startPts,
    totemHp: totemHp,
    towerLevels: towerLevels,
    atom5: atom5,
    dream7: dream7,
    saltLickX: saltLickX,
    killPtsMult: killPtsMult,
    efficiency: efficiency,
    soulAdd: soulAdd,
    soulMul: soulMul,
    t57: t57,
    expMulti: expMulti,
    msa: msa,
    msaBonus: msaBonus,
    msaUsed: ola501 !== 0,
    bestWaves: bestWaves,
    checkpointWaves: cpWaves,
    checkpointPts: cpPts,
    root: worshipTdRootStats(saveData, ci),
    hasData: Array.isArray(saveData.towerData) && saveData.towerData.length > 9,
    breakdowns: {
      speed: speedTree,
      chargeMax: chargeMaxTree,
      startPts: startTree,
      totemHp: totemTree,
      killPts: killTree,
      damage: damageTree,
      souls: soulTree,
      efficiency: { name: 'Worship efficiency', val: efficiency, fmt: 'raw', children: effRes && effRes.children },
      exp: { name: 'Worship EXP multiplier', val: expMulti, fmt: 'x', children: expRes && expRes.children },
    },
  };
}

// ---------- Rewards ----------

export function waveMult(best) {
  return best <= 0 ? 0 : Math.pow((5 + best) / 10, 2.6);
}

export function effBonus(efficiency, effReq) {
  return efficiency >= effReq ? Math.floor(100 * Math.pow(efficiency / (10 * effReq), 0.25)) : 0;
}

export function soulRewards(inputs, trial, best) {
  var base = tdTrialBase(trial);
  var eb = effBonus(inputs.efficiency, base.effReq);
  return Math.floor(5 * (1 + eb / 100) * waveMult(best) * inputs.soulMul);
}

export function expRewards(inputs, trial, best) {
  return Math.floor(15 * (trial + 1) * (trial + 1) * inputs.expMulti * Math.pow(waveMult(best), 0.9));
}

export function soulsPerHour(inputs, trial, best) {
  var base = tdTrialBase(trial);
  return soulRewards(inputs, trial, best) * inputs.worshipSpeed / base.charge;
}

export function expPerHour(inputs, trial, best) {
  var base = tdTrialBase(trial);
  return expRewards(inputs, trial, best) * inputs.worshipSpeed / base.charge;
}

export function claimOutcome(inputs, trial, best, charge) {
  var base = tdTrialBase(trial);
  var ch = charge == null ? inputs.charge : charge;
  var batches = Math.floor(ch / base.charge);
  var per = soulRewards(inputs, trial, best);
  return {
    batches: batches,
    single: ch >= base.charge ? per : 0,
    multi: Math.floor(per * inputs.msa * batches),
    msa: inputs.msa,
    exp: expRewards(inputs, trial, best) * batches,
  };
}

export function trialSummary(inputs, trial) {
  var base = tdTrialBase(trial);
  var best = inputs.bestWaves[trial] || 0;
  return {
    trial: trial,
    map: base.map,
    charge: base.charge,
    effReq: base.effReq,
    effBonus: effBonus(inputs.efficiency, base.effReq),
    best: best,
    checkpointWave: inputs.checkpointWaves[trial] || 0,
    checkpointPts: inputs.checkpointPts[trial] || 0,
    souls: soulRewards(inputs, trial, best),
    soulsPerHour: soulsPerHour(inputs, trial, best),
    expPerHour: expPerHour(inputs, trial, best),
    nextSoulsPerHour: [1, 5, 10, 25].map(function(d) { return { waves: d, soulsPerHour: soulsPerHour(inputs, trial, best + d) }; }),
  };
}

// ---------- Simulation ----------

function _mkTower(trial, inputs, type, node, x) {
  var c = towerCenters(trial, node, x);
  return {
    type: type, node: node, x: x, lvl: 1, traits: '', cd: 0, cdMax: towerAtkcd(type, 1, inputs.towerLevels[type]),
    // Wizard frame state: 0 cooling (attack/hold frames), 1 popup until readyAt, 2 ready (frame 4, scanning).
    state: 1, readyAt: 0, lastFire: -1, id: 0,
    refund: 0, map: new Array(10).fill(0), wx: c.wx, wy: c.wy, cx: c.cx, cy: c.cy,
    facing: c.facing, underlings: 0, shots: 0, damage: 0, planIdx: -1,
  };
}

function _normalizeTowers(list) {
  return (list || []).map(function(t) {
    return {
      type: Number(t.type) || 0,
      slot: { node: Number(t.slot && t.slot.node) || 0, x: Number(t.slot && t.slot.x) || 0 },
      weight: t.weight == null ? 1 : Math.max(0.01, Number(t.weight) || 0),
      traits: String(t.traits || ''),
      maxLevel: t.maxLevel == null ? Infinity : Number(t.maxLevel),
    };
  });
}

function _numOrNull(v) { return v == null || v === '' ? null : Number(v); }

// Phase: when every given trigger holds, sell the matching towers (refunding each tower's
// accumulated refund) and queue `towers` for placement. Phases fire in order, once each.
function _normalizePhase(ph) {
  ph = ph || {};
  var w = ph.when || {}, s = ph.sell || {};
  return {
    label: String(ph.label || ''),
    when: {
      minWave: _numOrNull(w.minWave),
      bossHold: w.bossHold == null ? null : !!w.bossHold,
      aliveMax: _numOrNull(w.aliveMax),
      bossHpFracMax: _numOrNull(w.bossHpFracMax),
      minTimeSec: _numOrNull(w.minTimeSec),
    },
    sell: {
      all: !!s.all,
      types: (s.types || []).map(Number),
      keepTypes: (s.keepTypes || []).map(Number),
      planIdx: (s.planIdx || []).map(Number),
    },
    towers: _normalizeTowers(ph.towers),
    skipRemaining: ph.skipRemaining !== false,
  };
}

function _normalizePlan(plan) {
  plan = plan || {};
  return {
    towers: _normalizeTowers(plan.towers),
    phases: (plan.phases || []).map(_normalizePhase),
    skipPolicy: TD_SKIP_POLICIES.indexOf(plan.skipPolicy) >= 0 ? plan.skipPolicy : 'never',
    roots: {
      policy: TD_ROOT_POLICIES.indexOf(plan.roots && plan.roots.policy) >= 0 ? plan.roots.policy : 'off',
      x: plan.roots && plan.roots.x != null ? Number(plan.roots.x) : null,
      y: plan.roots && plan.roots.y != null ? Number(plan.roots.y) : null,
      threshold: plan.roots && plan.roots.threshold != null ? Number(plan.roots.threshold) : 0.6,
      stats: plan.roots && plan.roots.stats ? plan.roots.stats : null,
    },
  };
}

// off: never cast; cooldown: cast whenever ready and a mob is in range;
// danger: cast when ready and a mob has passed `threshold` of the path or a boss hold is active.
export var TD_ROOT_POLICIES = ['off', 'cooldown', 'danger'];

// never: wait for countdowns; when-clear: skip once the field is empty;
// spam: press Next Wave every second until a boss hold (guide play).
export var TD_SKIP_POLICIES = ['never', 'when-clear', 'spam'];

// Simulates one Worship TD run to completion. opts: { trial, seed, start: 'fresh'|'checkpoint',
// maxWave, maxTimeSec, timeline, replay: { interval (s), maxFrames, fromWave } }.
export function simulateWorshipTdRun(inputs, plan, opts) {
  var run = createWorshipTdRun(inputs, plan, opts);
  while (!run.done) run.step(1e6);
  return run.result();
}

// Incremental run: step(n) advances n 100 ms ticks (returns false once finished), view() returns a
// plain snapshot of live mobs, wizards, projectiles, and recent effects for rendering, and result()
// finalizes (idempotently) exactly as simulateWorshipTdRun. opts.fx keeps recent visual effects.
export function createWorshipTdRun(inputs, plan, opts) {
  opts = opts || {};
  plan = _normalizePlan(plan);
  var trial = Number(opts.trial) || 0;
  var rng = mulberry32((Number(opts.seed) || 1) * 2654435761);
  var base = tdTrialBase(trial);
  var path = tdTrialPath(trial);
  var geom = tdGeometry(trial);
  var mobDef = tdMob(trial);
  var TL = inputs.towerLevels;
  var maxWave = opts.maxWave || 1000;
  var maxTicks = Math.round((opts.maxTimeSec || 4 * 3600) * 10);
  var record = opts.timeline !== false;
  var savedBest = inputs.bestWaves[trial] || 0;
  var NP = path.path.length;
  var speedDiv = base.map === 308 ? 1.2 : 1;

  var totem = inputs.totemHp;
  var G53 = 0, G13 = 6, G8 = 0, G55 = 0, G85 = 0;
  var pts = inputs.startPts;
  if (opts.start === 'checkpoint') {
    G8 = inputs.checkpointWaves[trial] || 0;
    G55 = G8;
    pts = inputs.checkpointPts[trial] || 0;
    G13 = 180;
  } else if (opts.start && typeof opts.start === 'object') {
    // Hypothetical checkpoint (e.g. a save point recorded by an earlier segment).
    G8 = Math.max(0, Math.round(Number(opts.start.wave) || 0));
    G55 = G8;
    pts = Number(opts.start.pts) || 0;
    G13 = G8 > 0 ? 180 : 6;
  }
  var startWave = G8;
  var saves = {};
  var towers = [];
  var mobs = [];
  var spawnQueue = [];
  var events = [];
  var clouds = [];
  var boulders = [];
  var krakens = [];
  var tick = 0;
  var kills = 0, exp = 0, totemDamage = 0, leaks = 0, spent = 0, skipPts = 0, killPts = 0;
  var bestCleared = 0, bestClearedTick = -1;
  var timeline = [];
  var nextPlan = 0;
  // Opt-in replay: bounded frames of live mobs, underlings, and clouds plus versioned tower sets.
  // When frames exceed maxFrames, every other frame is dropped and the interval doubles.
  var rp = opts.replay ? {
    every: Math.max(1, Math.round((Number(opts.replay.interval) || 1) * 10)),
    fromWave: Number(opts.replay.fromWave) || 0,
    maxFrames: Math.max(16, Number(opts.replay.maxFrames) || 3600),
    frames: [], towerSets: [], roots: [], leaks: [], ver: 0, setVer: -1,
  } : null;
  var mobSeq = 0, towerSeq = 0, objSeq = 0;
  // Opt-in visual effects (never read by the simulation): projectiles, rings, and damage numbers,
  // each with a start tick t and end tick end; pruned as they expire.
  var fx = opts.fx ? [] : null;
  var critFlag = false;
  var fxDmgTick = -1, fxDmgCount = 0;
  function towersChanged() { if (rp) rp.ver++; }
  var placementFails = [];
  var phaseIdx = 0, phaseLog = [], sellPts = 0;
  var endReason = 'time';
  var STALL_TICKS = Math.round((opts.stallSec == null ? 120 : opts.stallSec) * 10);
  var PUSH_TICKS = 6;
  var stallMin = Infinity, stallPts = pts, stallTotem = totem, stallTick = 0;

  function nd(n) { return geom.nodes[n]; }
  function mobCx(m) { return m.left + mobDef.frameW / 2; }
  function mobCy(m) {
    var y = nd(path.path[m.pi]).y;
    return y - mobDef.height + (mobDef.height - 50) / 2 + mobDef.frameH / 2;
  }
  function setDir(m) {
    var n = nd(path.path[m.pi]);
    var mid = (n.x + n.length) / 2;
    // Node changes set velocity from _MoveSPEED, which a root zeroes only on the mob's next 2 s tick.
    var mag = m.ms;
    m.vx = m.left > mid ? -mag : mag;
  }
  function enterNode(m) {
    var n = nd(path.path[m.pi]);
    // Source uses setXCenter(NodeX + 10) / setXCenter(NodeLength - 10).
    m.left = (path.flags[m.pi] === 0 ? n.x + 10 : n.length - 10) - mobDef.frameW / 2;
    m.push = null;
    setDir(m);
  }
  // Stencyl moveBy(dx, 0, 0.6, quadOut): the xy tween writes the absolute position every
  // frame, so velocity is ignored until it ends; a new moveBy restarts from the current x.
  function quadOut(t) { return t * (2 - t); }
  function startPush(obj, dx) { obj.push = { from: obj.left != null ? obj.left : obj.x, dx: dx, start: tick }; }
  function stepPush(obj) {
    var k = tick - obj.push.start;
    var pos = obj.push.from + obj.push.dx * quadOut(Math.min(1, k / PUSH_TICKS));
    if (k >= PUSH_TICKS) obj.push = null;
    return pos;
  }
  function trigZ() { applyTraits(towers, TL); }

  function damageMulti() {
    return towerDamageMulti(inputs, towers.length ? towers[0].map[9] : 0, G85);
  }

  function hit(m, dmg, tw) {
    var wasCrit = critFlag;
    critFlag = false;
    if (m.dead) return;
    // Source damage intake: MOD 2 counts hits in PersNum; the 6th hit is blocked and sets PersNum = -3,
    // which blocks damage until three of the mob's own 1 s ticks restore it. MOD 5 shifts the mob 10 px
    // along its velocity sign (non-positive moves left), clamped inside its node.
    if (m.mod === 2) {
      if (m.pers >= 0) {
        m.pers++;
        if (m.pers > 5) { m.pers = -3; dmg = 0; }
      } else dmg = 0;
    } else if (m.mod === 5) {
      var n5 = nd(path.path[m.pi]);
      m.left = m.vx > 0 ? Math.round(Math.min(n5.length - 10, m.left + 10)) : Math.round(Math.max(n5.x + 10, m.left - 10));
    }
    if (fx && fxDmgTick !== tick) { fxDmgTick = tick; fxDmgCount = 0; }
    if (fx && ++fxDmgCount <= 40) fx.push({ k: 'dmg', t: tick, end: tick + 8, x: mobCx(m), y: mobCy(m) - mobDef.frameH * m.size / 2, v: dmg, crit: wasCrit, blocked: dmg <= 0 });
    if (dmg <= 0) return;
    m.hp -= dmg;
    if (tw) tw.damage += Math.min(dmg, m.hp + dmg);
    if (m.hp <= 0) killMob(m);
  }

  // The flag tells the next hit() (whose argument this is) that the damage was a critical.
  function crit(tw, dmg) {
    critFlag = tw.map[1] > _randInt(rng, 0, 1000) / 10;
    return critFlag ? dmg * 1.5 : dmg;
  }

  function killMob(m) {
    m.dead = true;
    if (totem > 0.5) {
      var gain = killCredit(m.statusSkull, m.size, G8, inputs);
      var before = pts;
      pts = Math.round(pts + gain);
      killPts += pts - before;
      exp += killExp(trial, m.statusSkull);
      kills++;
    }
    var cx = mobCx(m), cy = mobCy(m);
    if (m.mod === 4) {
      towers.forEach(function(tw) {
        if (tdDistance(tw.cx - cx, tw.cy - cy) < 70 && tw.cd < 0.1 + tw.cdMax) {
          tw.cd = 4 + tw.cdMax;
          if (fx) fx.push({ k: 'stun', t: tick, end: tick + 10, x: tw.wx, y: tw.wy - 40 });
        }
      });
    }
    if (m.mod === 1) {
      mobs.forEach(function(o) {
        if (!o.dead && tdDistance(mobCx(o) - cx, mobCy(o) - cy) < 60) o.healT = 3;
      });
    }
  }

  function freeze(m, tw) {
    // Source rounds away from zero (ceil when moving right, floor when left), so a frozen mob keeps >= 1 px/tick.
    // Repeated hits compound on the current velocity. StatusFreeze (re)sets its timer to 6 + B seconds.
    var slowed = m.vx * (0.3 / (1 + tw.map[4] / 100));
    m.vx = m.vx > 0 ? Math.ceil(slowed) : Math.floor(slowed);
    m.ms = Math.abs(m.vx);
    m.freezeT = 6 + tw.map[5];
  }
  // 38x38 projectile actor 478 is created with its top-left at (round(wizXc - 19), round(wizYc - 5)).
  function projCenter(tw) { return { x: Math.round(tw.wx - 19) + 19, y: Math.round(tw.wy - 5) + 19 }; }

  function findTarget(tw, range) {
    var best = null;
    for (var i = 0; i < mobs.length; i++) {
      var m = mobs[i];
      if (m.dead) continue;
      if (tdDistance(mobCx(m) - tw.wx, mobCy(m) - tw.wy) >= range) continue;
      if (!best) { best = m; continue; }
      if (m.pi === best.pi) {
        var f = path.flags[m.pi];
        if ((f === 0 && m.left > best.left) || (f === 1 && m.left < best.left)) best = m;
      } else if (m.pi > best.pi) best = m;
    }
    return best;
  }

  function at(delay, fn) { events.push({ at: tick + delay, fn: fn }); }

  // Source fire (Wizard frame 4, L80737): a successful shot sets frame 5 and cd = atkcd; a failed
  // scan leaves the wizard ready and rescanning. Returns whether the tower fired.
  function launched(tw) {
    tw.cd = tw.cdMax;
    tw.state = 0;
    tw.shots++;
    tw.lastFire = tick;
  }
  function fire(tw) {
    var TI = TL[tw.type];
    var range = towerRange(tw.type, tw.lvl, TI);
    if (tw.type === 6) {
      // Kraken fires without a target while below its underling cap; at the cap it stays ready.
      if (tw.underlings >= Math.round(4 + tw.map[4])) return false;
      launched(tw);
      tw.underlings++;
      krakens.push({
        id: ++objSeq, tw: tw, node: tw.node, x: tw.cx, y: tw.cy, vx: _randInt(rng, 1, 2) === 1 ? -3 : 3,
        hits: 2 + tw.map[5], dmg: Math.max(1, towerDamage(6, tw.lvl, TI, damageMulti())),
        dir: tw.facing === 1 ? -1 : 1, target: null, push: null,
        next: tick + 2, clearAt: tick + 20, wanderAt: -1,
      });
      return true;
    }
    var tgt = findTarget(tw, range);
    if (!tgt) return false;
    var dmg = towerDamage(tw.type, tw.lvl, TI, damageMulti());
    var tcx = mobCx(tgt);
    var tnode = path.path[tgt.pi];
    var tn = nd(tnode);
    switch (tw.type) {
      case 0: {
        // Pulse hits on fire: roll the hit count, then one critical roll for the whole volley.
        launched(tw);
        var n = 1 + Math.floor(tw.map[3] / 100) + (tw.map[3] % 100 > _randInt(rng, 0, 100) ? 1 : 0);
        var isCrit = tw.map[1] > _randInt(rng, 0, 1000) / 10;
        var d0 = isCrit ? dmg * 1.5 : dmg;
        if (fx) fx.push({ k: 'pulse', t: tick, end: tick + 3, x0: tw.wx, y0: tw.wy - 20, x: tcx, y: mobCy(tgt), n: n });
        for (var k = 0; k < n && !tgt.dead; k++) {
          critFlag = isCrit;
          hit(tgt, d0, tw);
          if (!tgt.dead && tgt.size !== 4 && tw.map[5] > 0) {
            var nn = nd(path.path[tgt.pi]);
            tgt.left = tgt.vx > 0 ? Math.round(Math.max(nn.x + 10, tgt.left - tw.map[5])) : Math.round(Math.min(nn.length - 10, tgt.left + tw.map[5]));
          }
        }
        break;
      }
      case 1: {
        launched(tw);
        var dir = tcx + 12 * tgt.vx > tw.wx ? 1 : -1;
        var landX = Math.round(Math.max(tn.x, Math.min(tn.length, tcx + 18.3 * tgt.vx)));
        var radius = Math.round(100 + tw.map[5]) / 100 * 40;
        var blast = function(x) {
          var c = 0;
          for (var i = 0; i < mobs.length && c < 5; i++) {
            var m = mobs[i];
            if (m.dead || path.path[m.pi] !== tnode) continue;
            if (Math.abs(mobCx(m) - x) < radius) { hit(m, crit(tw, dmg), tw); c++; }
          }
          if (fx) fx.push({ k: 'boom', t: tick, end: tick + 7, x: x, y: tn.y, r: radius, dir: dir });
        };
        var ox = tw.wx - 22 + 36, oy = tn.y - 51 + 40;
        if (fx) fx.push({ k: 'fb', t: tick, end: tick + 18, x0: ox, y0: oy, x: landX, y: tn.y, dir: dir });
        at(18, function() { blast(landX); });
        if (tw.map[4] > _randInt(rng, 1, 100)) {
          var x2 = Math.round(Math.max(tn.x, Math.min(tn.length, _randInt(rng, -50, 50) + tcx + 12 * tgt.vx)));
          if (fx) fx.push({ k: 'fb', t: tick + 5, end: tick + 23, x0: ox, y0: oy, x: x2, y: tn.y, dir: dir });
          at(23, function() { blast(x2); });
        }
        break;
      }
      case 2:
        // Boulder only launches at a target on its own platform; otherwise it keeps scanning.
        if (tnode !== tw.node) return false;
        launched(tw);
        boulders.push({ id: ++objSeq, tw: tw, node: tw.node, x: tw.cx, born: tick, dir: tcx >= tw.cx ? 1 : -1, until: tick + Math.round(25 * (1 + tw.map[4] / 100)), left: 5 + tw.map[5], hit: new Set(), dmg: dmg });
        break;
      case 3: {
        // Frozone fires only while its target is on the facing side; otherwise it keeps scanning. Its
        // projectile hitscans every mob in range (either side) during creation.
        if (!((tw.wx > tcx && tw.facing === -1) || (tw.facing === 1 && tcx > tw.wx))) return false;
        launched(tw);
        var pc = projCenter(tw);
        if (fx) fx.push({ k: 'ring', t: tick, end: tick + 9, x: pc.x, y: pc.y, anim: 3, r: range - 6 });
        for (var i3 = 0; i3 < mobs.length; i3++) {
          var m3 = mobs[i3];
          if (m3.dead) continue;
          if (tdDistance(mobCx(m3) - pc.x, mobCy(m3) - pc.y) < range - 6) {
            hit(m3, crit(tw, dmg), tw);
            if (!m3.dead) freeze(m3, tw);
          }
        }
        break;
      }
      case 4: {
        // Storm: the low-HP bonus is decided on fire; the bolt lands 300 ms later.
        launched(tw);
        var ds = tgt.hp / tgt.maxHp < 0.6 ? dmg * (1 + tw.map[4] / 100) : dmg;
        if (fx) fx.push({ k: 'storm', t: tick, end: tick + 10, x: tcx, y: tn.y - 55, mob: tgt.id });
        at(3, function() {
          if (tgt.dead) return;
          hit(tgt, crit(tw, ds), tw);
        });
        break;
      }
      case 5:
        launched(tw);
        break;
      case 7: {
        launched(tw);
        var cy = tn.y - 24;
        var period = 2 / (1 + tw.map[5] / 100);
        // First damage one period after the cloud appears; the 0.7 s fade still deals damage.
        clouds.push({ id: ++objSeq, tw: tw, node: tnode, x: tcx, y: cy, born: tick, until: tick + Math.round((10 + tw.map[4]) * 10) + 8, period: period, next: tick + Math.max(1, Math.round(period * 10)), dmg: dmg });
        break;
      }
      case 8: {
        // Void hitscans range - 6 + 40 around its projectile, damages, then walks the status list. Every
        // worship mob spawns with StatusSkullN first, which Void skips while clearing the mod, so the mod
        // is always stripped and no status (Freeze, BuffHeal, NoMove) is ever shortened.
        launched(tw);
        var pv = projCenter(tw);
        if (fx) fx.push({ k: 'ring', t: tick, end: tick + 9, x: pv.x, y: pv.y, anim: 7, r: range - 6 + 40 });
        for (var i8 = 0; i8 < mobs.length; i8++) {
          var m8 = mobs[i8];
          if (m8.dead) continue;
          if (tdDistance(mobCx(m8) - pv.x, mobCy(m8) - pv.y) < range - 6 + 40) {
            hit(m8, crit(tw, dmg), tw);
            m8.mod = 0;
          }
        }
        if (_randInt(rng, 1, 100) < tw.map[4]) tw.cd = tw.cdMax / 2;
        break;
      }
    }
    return true;
  }

  // ----- Build policy -----
  function actionScores() {
    var best = null;
    if (nextPlan < plan.towers.length) {
      var p = plan.towers[nextPlan];
      if (TL[p.type] >= 1) {
        var cost = newTowerCost(p.type, towers.length);
        best = { kind: 'place', cost: cost, score: 2 * p.weight / Math.max(1, cost) };
      } else {
        placementFails.push({ planIdx: nextPlan, reason: 'Tower type locked' });
        nextPlan++;
        return actionScores();
      }
    }
    for (var i = 0; i < towers.length; i++) {
      var tw = towers[i];
      var pp = plan.towers[tw.planIdx];
      if (tw.lvl >= pp.maxLevel) continue;
      var c = towerUpgradeCost(tw.type, tw.lvl, TL[tw.type]);
      var s = pp.weight / Math.max(1, c);
      if (!best || s > best.score) best = { kind: 'upgrade', tower: tw, cost: c, score: s };
    }
    return best;
  }

  function runPolicy() {
    for (var guard = 0; guard < 200; guard++) {
      var a = actionScores();
      if (!a || pts < a.cost) return;
      if (a.kind === 'place') {
        var p = plan.towers[nextPlan];
        var v = validatePlacement(trial, towers, p.slot.node, p.slot.x);
        if (!v.ok) {
          placementFails.push({ planIdx: nextPlan, reason: v.reason });
          nextPlan++;
          continue;
        }
        var tw = _mkTower(trial, inputs, p.type, p.slot.node, v.x);
        tw.planIdx = nextPlan;
        tw.id = ++towerSeq;
        // A new wizard plays its popup (frames 1-3) before its first ready frame.
        tw.readyAt = tick + 4;
        pts -= a.cost; spent += a.cost;
        tw.refund = Math.ceil(0.6 * a.cost);
        towers.push(tw);
        nextPlan++;
        trigZ();
        towersChanged();
      } else {
        var t = a.tower;
        pts -= a.cost; spent += a.cost;
        t.refund += Math.round(0.6 * a.cost);
        t.lvl++;
        t.cdMax = towerAtkcd(t.type, t.lvl, TL[t.type]);
        towersChanged();
        var ppl = plan.towers[t.planIdx];
        if (t.lvl % 5 === 0 && t.traits.length < Math.floor(t.lvl / 5)) {
          t.traits += ppl.traits[t.traits.length] === 'B' ? 'B' : 'A';
          trigZ();
        }
      }
    }
  }

  function aliveHp() {
    var s = 0;
    for (var i = 0; i < mobs.length; i++) if (!mobs[i].dead) s += mobs[i].hp;
    return s;
  }

  // Highest HP fraction among live size-3 (boss) mobs; null when none are alive.
  function bossHpFrac() {
    var f = null;
    for (var i = 0; i < mobs.length; i++) {
      var m = mobs[i];
      if (m.dead || m.size < 3) continue;
      f = Math.max(f == null ? 0 : f, m.hp / m.maxHp);
    }
    return f;
  }

  // Source sell button: points += GenINFO[56][i][11], recycle the tower, splice it, fire "z".
  // Underlings are independent actors and keep fighting until their own hits run out.
  function checkPhases(alive) {
    while (phaseIdx < plan.phases.length) {
      var ph = plan.phases[phaseIdx], w = ph.when;
      if (w.minWave != null && G8 < w.minWave) return;
      if (w.bossHold != null && (G13 > 999) !== w.bossHold) return;
      if (w.aliveMax != null && alive > w.aliveMax) return;
      if (w.minTimeSec != null && tick < w.minTimeSec * 10) return;
      if (w.bossHpFracMax != null) {
        var bf = bossHpFrac();
        if (bf == null || bf > w.bossHpFracMax) return;
      }
      var s = ph.sell, sold = 0, refund = 0, keep = [];
      for (var i = 0; i < towers.length; i++) {
        var tw = towers[i];
        var hitSell = s.all ? s.keepTypes.indexOf(tw.type) < 0
          : (s.types.indexOf(tw.type) >= 0 || s.planIdx.indexOf(tw.planIdx) >= 0);
        if (hitSell) { refund += tw.refund; sold++; tw.sold = true; } else keep.push(tw);
      }
      if (sold) {
        towers = keep;
        pts = Math.round(pts + refund);
        sellPts += refund;
        trigZ();
        towersChanged();
      }
      var start = plan.towers.length;
      for (var k = 0; k < ph.towers.length; k++) plan.towers.push(ph.towers[k]);
      if (ph.skipRemaining) nextPlan = start;
      phaseLog.push({ phase: phaseIdx, label: ph.label, t: tick / 10, wave: G8, alive: alive, sold: sold, refund: refund, queued: ph.towers.length });
      snapshot('phase');
      phaseIdx++;
    }
  }

  function spawn(row) {
    var hp = Math.ceil(base.hpBase * hpMulti(row.size, row.skull));
    G53 -= hp;
    var n0 = nd(path.path[0]);
    var sp = mobDef.moveSpeed * (1.5 - Math.pow((row.size - 1) / 3, 0.7)) / speedDiv;
    var m = {
      pi: 0, left: path.flags[0] === 0 ? n0.x : n0.length, vx: sp, ms: sp, baseSpeed: sp, dir: 1,
      hp: hp, maxHp: hp, size: row.size, skull: row.skull, statusSkull: Math.min(row.skull, 16), mod: row.mod,
      dead: false, pers: 0, freezeT: 0, rootT: 0, healT: 0, born: tick, wave: row.wave, id: ++mobSeq,
    };
    setDir(m);
    mobs.push(m);
  }

  // Per-mob timers phased from spawn. 1 s: MOD 3 regen below half HP, else MOD 2 PersNum recovery;
  // then StatusBuffHeal +8% (ceil). 2 s (_event_Movement): first _MoveSPEED = 0 while rooted, else the
  // spawn speed unless frozen; then active status timers drop by 2 and expire at <= 0. Freeze expiry
  // restores the spawn speed in the current velocity direction (non-positive -> left), even while rooted;
  // root expiry restores the spawn speed in the node's travel direction, discarding any freeze slow.
  function mobTimers() {
    for (var i = 0; i < mobs.length; i++) {
      var m = mobs[i];
      if (m.dead) continue;
      var age = tick - m.born;
      if (age <= 0 || age % 10 !== 0) continue;
      if (m.mod === 3 && m.hp > 0 && m.hp < 0.5 * m.maxHp) m.hp = Math.min(m.maxHp, m.hp + 0.013 * m.maxHp);
      else if (m.mod === 2 && m.pers < 0) m.pers++;
      if (m.healT > 0 && m.hp > 0) m.hp = Math.ceil(Math.min(m.maxHp, m.hp + 0.08 * m.maxHp));
      if (age % 20 !== 0) continue;
      if (m.rootT > 0) m.ms = 0;
      else if (!(m.freezeT > 0)) m.ms = m.baseSpeed;
      if (m.healT > 0) m.healT -= 2;
      if (m.freezeT > 0) {
        m.freezeT -= 2;
        if (m.freezeT <= 0) { m.freezeT = 0; m.ms = m.baseSpeed; m.vx = m.vx > 0 ? m.baseSpeed : -m.baseSpeed; }
      }
      if (m.rootT > 0) {
        m.rootT -= 2;
        if (m.rootT <= 0) { m.rootT = 0; m.ms = m.baseSpeed; m.vx = path.flags[m.pi] === 0 ? m.baseSpeed : -m.baseSpeed; }
      }
    }
  }

  // Talent 303 cast: refresh/add StatusNoMove and zero velocity for live mobs whose top-left corner is
  // within the radius of the player's center.
  var rootStats = plan.roots.stats || inputs.root || { available: false };
  var rootOn = plan.roots.policy !== 'off' && rootStats.available;
  var rootReady = 0, rootCasts = 0;
  var rootPx = plan.roots.x, rootPy = plan.roots.y;
  if (rootOn && (rootPx == null || rootPy == null)) {
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (var gi = 0; gi < path.path.length; gi++) {
      var gn = nd(path.path[gi]);
      minX = Math.min(minX, gn.x); maxX = Math.max(maxX, gn.length);
      minY = Math.min(minY, gn.y); maxY = Math.max(maxY, gn.y);
    }
    if (rootPx == null) rootPx = (minX + maxX) / 2;
    if (rootPy == null) rootPy = (minY + maxY) / 2;
  }
  function mobFront(m) {
    var n = nd(path.path[m.pi]);
    var frac = (m.left + mobDef.frameW / 2 - n.x) / Math.max(1, n.length - n.x);
    if (path.flags[m.pi] === 1) frac = 1 - frac;
    return (m.pi + Math.max(0, Math.min(1, frac))) / NP;
  }
  function tryRoot() {
    if (!rootOn || tick < rootReady) return;
    var inRange = [], danger = plan.roots.policy === 'cooldown' || G13 > 999;
    for (var i = 0; i < mobs.length; i++) {
      var m = mobs[i];
      if (m.dead) continue;
      var top = mobCy(m) - mobDef.frameH / 2;
      if (tdDistance(m.left - rootPx, top - rootPy) < rootStats.radius) {
        inRange.push(m);
        if (!danger && mobFront(m) >= plan.roots.threshold) danger = true;
      }
    }
    if (!inRange.length || !danger) return;
    for (var j = 0; j < inRange.length; j++) { inRange[j].rootT = rootStats.seconds; inRange[j].vx = 0; }
    rootReady = tick + Math.round(rootStats.cooldown * 10);
    rootCasts++;
    if (rp) rp.roots.push({ t: tick / 10, n: inRange.length });
  }

  // Mob stride 6 (Int16): center x, center y, HP per mille, flags (1 frozen, 2 rooted, 4 healing,
  // 8 mod >0, mod << 4), round(size*10) << 5 | status skull, motion (1 facing left, 2 walking).
  function replayFrame() {
    if (rp.ver !== rp.setVer) {
      rp.towerSets.push(towers.map(function(t) {
        return { type: t.type, node: t.node, x: t.x, lvl: t.lvl, traits: t.traits, cx: t.cx, cy: t.cy, wx: t.wx, wy: t.wy, facing: t.facing, range: towerRange(t.type, t.lvl, TL[t.type]), planIdx: t.planIdx };
      }));
      rp.setVer = rp.ver;
    }
    var live = 0;
    for (var i = 0; i < mobs.length; i++) if (!mobs[i].dead) live++;
    var mb = new Int16Array(live * 6), k = 0;
    for (var j = 0; j < mobs.length; j++) {
      var m = mobs[j];
      if (m.dead) continue;
      var fl = (m.freezeT > 0 ? 1 : 0) | (m.rootT > 0 ? 2 : 0) | (m.healT > 0 ? 4 : 0) | (m.mod > 0 ? 8 | (m.mod << 4) : 0);
      mb[k++] = Math.round(mobCx(m)); mb[k++] = Math.round(mobCy(m));
      mb[k++] = Math.max(0, Math.min(1000, Math.round(1000 * m.hp / (m.maxHp || 1))));
      mb[k++] = fl;
      mb[k++] = (Math.round(m.size * 10) << 5) | (m.statusSkull & 31);
      if (m.vx !== 0) m.faceLeft = m.vx < 0;
      mb[k++] = (m.faceLeft ? 1 : 0) | (m.vx !== 0 ? 2 : 0);
    }
    var un = new Int16Array(krakens.length * 2);
    for (var u = 0; u < krakens.length; u++) { un[2 * u] = Math.round(krakens[u].x); un[2 * u + 1] = Math.round(krakens[u].y); }
    var cl = [];
    for (var c = 0; c < clouds.length; c++) if (clouds[c].until > tick) cl.push(Math.round(clouds[c].x), Math.round(clouds[c].y));
    rp.frames.push({ tick: tick, t: tick / 10, wave: G8, pts: pts, totem: totem, alive: live, set: rp.towerSets.length - 1, mobs: mb, unders: un, clouds: new Int16Array(cl) });
    if (rp.frames.length > rp.maxFrames) {
      rp.every *= 2;
      rp.frames = rp.frames.filter(function(f) { return f.tick % rp.every === 0; });
    }
  }
  function replayResult() {
    var used = new Map(), sets = [];
    rp.frames.forEach(function(f) {
      if (!used.has(f.set)) { used.set(f.set, sets.length); sets.push(rp.towerSets[f.set]); }
      f.set = used.get(f.set);
    });
    var scene = tdTrialScene(trial);
    return {
      interval: rp.every / 10, frames: rp.frames, towerSets: sets, roots: rp.roots, leaks: rp.leaks,
      root: rootOn ? { x: rootPx, y: rootPy, radius: rootStats.radius } : null,
      scene: scene, totem: { x: base.totemX, y: base.totemY },
      path: path.path.map(function(n) { var g = nd(n); return [g.x, g.length, g.y]; }),
      mobStride: 6,
    };
  }

  function snapshot(kind) {
    if (!record) return;
    timeline.push({ t: tick / 10, kind: kind, wave: G8, best: G55, pts: pts, totem: totem, towers: towers.length, levels: towers.reduce(function(s, t) { return s + t.lvl; }, 0) });
  }

  // Opt-in 1 s samples: alive mobs, pending HP, furthest mob progress (0..1 along the path), underlings.
  var trace = [];
  var contacts = 0;
  function traceSample(alive, pending) {
    var front = 0, frozen = 0, rooted = 0;
    for (var i = 0; i < mobs.length; i++) {
      var m = mobs[i];
      if (m.dead) continue;
      if (m.freezeT > 0) frozen++;
      if (m.rootT > 0) rooted++;
      var n = nd(path.path[m.pi]);
      var span = Math.max(1, n.length - n.x);
      var frac = (m.left + mobDef.frameW / 2 - n.x) / span;
      if (path.flags[m.pi] === 1) frac = 1 - frac;
      front = Math.max(front, (m.pi + Math.max(0, Math.min(1, frac))) / NP);
    }
    trace.push({ t: tick / 10, wave: G8, alive: alive, pending: pending, front: front, underlings: krakens.length, frozen: frozen, rooted: rooted, contacts: contacts, pts: pts, totem: totem });
    contacts = 0;
    if (typeof opts.inspect === 'function') opts.inspect({ t: tick / 10, mobs: mobs, krakens: krakens, towers: towers, path: path, geom: geom, mobDef: mobDef, G85: G85 });
  }

  var finished = false, endResult = null;
  function stepOnce() {
    // 1 s timer
    if (tick % 10 === 0) {
      G13 = Math.round(G13 - 1);
      G85 = Math.min(14400, G85 + 1);
      if (G13 < 0) {
        G8++;
        G55 = Math.max(G55, G8);
        G13 = nextWaveCountdown(G8);
        G85 = -10;
        var row = tdWaveRow(trial, G8);
        G53 += Math.round(row.count * Math.ceil(base.hpBase * hpMulti(row.size, row.skull)));
        var interval = (7 + 1.3 * Math.floor(row.count / 5)) / Math.max(row.count, 1);
        for (var s = 0; s < row.count; s++) spawnQueue.push({ at: tick + Math.round(s * interval * 10), row: row });
        if (G8 > 3) trigZ();
        snapshot('wave');
        if (G8 > maxWave) { endReason = 'max-wave'; finished = true; return; }
      }
      // regen/heal/status timers run on each mob's own 1 s and 2 s timers, phased from its spawn
      // (mobTimers, below), not on this global wave timer.
      var alive = 0;
      for (var a2 = 0; a2 < mobs.length; a2++) if (!mobs[a2].dead) alive++;
      var pending = G53 + aliveHp();
      if (opts.trace) traceSample(alive, pending);
      if (phaseIdx < plan.phases.length) checkPhases(alive);
      if (G13 > 999 && pending <= 0) G13 = 20;
      // Save window (N.js Worship save): G55 % 10 == 0, not holding a boss, totem alive, and
      // no live mobs. Saving stores G55 and pts + 1.6667 x each tower's 60% refund.
      if (G55 > startWave && G55 % 10 === 0 && G13 < 999 && alive === 0 && spawnQueue.length === 0 && totem > 0) {
        var saveVal = pts;
        for (var sv = 0; sv < towers.length; sv++) saveVal += 1.6666666666666667 * towers[sv].refund;
        if (!saves[G55] || saveVal > saves[G55].pts) saves[G55] = { wave: G55, pts: saveVal, t: tick / 10 };
      }
      if (alive === 0 && spawnQueue.length === 0 && pending <= 0.5 && Math.round(G55) > bestCleared) {
        bestCleared = Math.round(G55);
        bestClearedTick = tick;
      }
      if (G13 < 999 && (plan.skipPolicy === 'spam' || (plan.skipPolicy === 'when-clear' && alive === 0 && spawnQueue.length === 0 && pending <= 0.5))) {
        var sr = skipReward(G13, G8);
        pts += sr; skipPts += sr;
        G13 = 0;
      }
      // A boss hold with no new damage minimum, income, purchase, or leak is stationary.
      if (G13 > 999 && pending > 0.5) {
        if (pending < stallMin * (1 - 1e-12) || pts !== stallPts || totem !== stallTotem) {
          stallMin = Math.min(stallMin, pending); stallPts = pts; stallTotem = totem; stallTick = tick;
        } else if (tick - stallTick >= STALL_TICKS) { endReason = 'stalled'; finished = true; return; }
      } else {
        stallMin = Infinity; stallTick = tick;
      }
    }
    // spawns
    if (spawnQueue.length) {
      var keep = [];
      for (var q = 0; q < spawnQueue.length; q++) {
        if (spawnQueue[q].at <= tick) spawn(spawnQueue[q].row); else keep.push(spawnQueue[q]);
      }
      spawnQueue = keep;
    }
    runPolicy();
    mobTimers();
    tryRoot();
    // mob movement
    for (var i = 0; i < mobs.length; i++) {
      var m = mobs[i];
      if (m.dead) continue;
      if (m.push) m.left = stepPush(m);
      else m.left += m.vx;
      var n = nd(path.path[m.pi]);
      var cx = m.left + mobDef.frameW / 2;
      var f = path.flags[m.pi];
      if ((f === 0 && cx > n.length - 20) || (f === 1 && cx < n.x + 20)) {
        m.pi++;
        if (m.pi >= NP) {
          m.pi = 0;
          totem -= 1; totemDamage++; leaks++;
          snapshot('leak');
          if (rp) rp.leaks.push({ t: tick / 10, wave: G8 });
          if (totem <= 0) { endReason = 'totem'; finished = true; break; }
        }
        enterNode(m);
      }
    }
    if (finished) return;
    // towers
    // Source 100 ms loop: a positive cooldown ticks down and, on reaching zero, restarts the popup
    // (frames 1-3, 300 ms); the ready frame (4) fires on the next successful target scan.
    for (var ti = 0; ti < towers.length; ti++) {
      var tw = towers[ti];
      if (tw.cd > 0) {
        tw.cd -= 0.1;
        if (tw.cd <= 0) { tw.state = 1; tw.readyAt = tick + 3; }
      }
      if (tw.state === 1 && tick >= tw.readyAt) tw.state = 2;
      if (tw.state === 2) fire(tw);
    }
    // events
    if (events.length) {
      var due = [], rest = [];
      for (var e = 0; e < events.length; e++) (events[e].at <= tick ? due : rest).push(events[e]);
      events = rest;
      for (var e2 = 0; e2 < due.length; e2++) due[e2].fn();
    }
    // boulders
    if (boulders.length) {
      boulders = boulders.filter(function(b) {
        b.x += 5 * b.dir;
        for (var k = 0; k < mobs.length && b.left > 0; k++) {
          var mb = mobs[k];
          if (mb.dead || b.hit.has(mb) || path.path[mb.pi] !== b.node) continue;
          if (Math.abs(mobCx(mb) - b.x) < 35) { b.hit.add(mb); b.left--; hit(mb, crit(b.tw, b.dmg), b.tw); }
        }
        return b.left > 0 && tick < b.until;
      });
    }
    // poison clouds
    if (clouds.length) {
      clouds = clouds.filter(function(c) {
        if (tick >= c.next) {
          c.next = tick + Math.max(1, Math.round(c.period * 10));
          for (var k = 0; k < mobs.length; k++) {
            var mc = mobs[k];
            if (mc.dead || path.path[mc.pi] !== c.node) continue;
            if (Math.abs(mobCx(mc) - c.x) < 55) hit(mc, c.dmg, c.tw);
          }
        }
        return tick < c.until;
      });
    }
    // kraken underlings (source projectile 478, WeaponType 5)
    if (krakens.length) {
      krakens = krakens.filter(function(u) {
        var un = nd(u.node);
        if (u.push) u.x = stepPush(u);
        else u.x += u.vx;
        // 100 ms node clamp on the 38 px actor's left edge.
        var ul = u.x - 19;
        if (ul + u.vx > un.length) { u.vx = -3; u.x = un.length - 5 + 19; }
        else if (ul + u.vx < un.x) { u.vx = 3; u.x = un.x + 10 + 19; }
        ul = u.x - 19;
        // 2 s: drop the target, then leash to +/-140 of the tower center or wander 1 s later.
        if (tick >= u.clearAt) {
          u.clearAt = tick + 20;
          u.target = null;
          if (ul + u.vx > u.tw.cx + 140) u.vx = -3;
          else if (ul + u.vx < u.tw.cx - 140) u.vx = 3;
          else u.wanderAt = tick + 10;
        }
        if (u.wanderAt >= 0 && tick >= u.wanderAt) {
          u.wanderAt = -1;
          if (_randInt(rng, 1, 4) === 1) u.vx = _randInt(rng, 1, 2) === 1 ? -3 : 3;
          else if (_randInt(rng, 1, 4) === 1) u.vx = 0;
        }
        if (tick >= u.next) {
          u.next = tick + 2;
          if (!u.target) {
            for (var k = 0; k < mobs.length; k++) {
              var mk = mobs[k];
              if (mk.dead || path.path[mk.pi] !== u.node) continue;
              if (tdDistance(u.x - mobCx(mk), u.y - mobCy(mk)) < 250) { u.target = mk; break; }
            }
          }
          if (u.target) {
            u.vx = ul > u.target.left ? -3 : 3;
            for (var c2 = 0; c2 < mobs.length; c2++) {
              var mc2 = mobs[c2];
              if (mc2.dead || path.path[mc2.pi] !== u.node) continue;
              if (Math.abs(u.x - mobCx(mc2)) >= 20) continue;
              // Quirk: crit chance is hits left; damage lands on the previously acquired target.
              var dmgU = u.hits > _randInt(rng, 0, 1000) / 10 ? u.dmg * 1.5 : u.dmg;
              hit(u.target, dmgU, u.tw);
              u.target = mc2;
              startPush(u, -u.dir * (25 + 5 * mc2.size));
              if (!mc2.dead) startPush(mc2, u.dir * (50 / mc2.size));
              u.hits = Math.round(u.hits - 1);
              contacts++;
              break;
            }
          }
        }
        if (u.hits <= 0) { u.tw.underlings--; return false; }
        return true;
      });
    }
    if (rp && tick % rp.every === 0 && G8 >= rp.fromWave) replayFrame();
    if (tick % 50 === 0 && mobs.length > 64) mobs = mobs.filter(function(m2) { return !m2.dead; });
    if (fx && tick % 20 === 0) fx = fx.filter(function(f) { return f.end >= tick - 2; });
    tick++;
    if (tick >= maxTicks) finished = true;
  }

  function step(n) {
    for (var k = 0; k < n && !finished; k++) stepOnce();
    return !finished;
  }

  function view() {
    var ms = [];
    for (var i = 0; i < mobs.length; i++) {
      var m = mobs[i];
      if (m.dead) continue;
      var n = nd(path.path[m.pi]);
      ms.push({ id: m.id, x: mobCx(m), y: mobCy(m), hpFrac: Math.max(0, m.hp / m.maxHp), size: m.size, mod: m.mod,
        frozen: m.freezeT > 0, rooted: m.rootT > 0, healing: m.healT > 0, skull: m.statusSkull, faceLeft: m.vx < 0, walking: m.vx !== 0, node: path.path[m.pi], nodeY: n.y });
    }
    return {
      tick: tick, t: tick / 10, wave: G8, G13: G13, pts: pts, totem: totem, alive: ms.length, done: finished, endReason: finished ? endReason : null,
      mobs: ms,
      towers: towers.map(function(t) {
        return { id: t.id, type: t.type, lvl: t.lvl, traits: t.traits, node: t.node, x: t.x, cx: t.cx, cy: t.cy, wx: t.wx, wy: t.wy, facing: t.facing,
          state: t.state, lastFire: t.lastFire, readyAt: t.readyAt, cd: t.cd, cdMax: t.cdMax, range: towerRange(t.type, t.lvl, TL[t.type]) };
      }),
      boulders: boulders.map(function(b) { return { id: b.id, x: b.x, y: nd(b.node).y, dir: b.dir, born: b.born }; }),
      clouds: clouds.map(function(c) { return { id: c.id, x: c.x, y: c.y, born: c.born, until: c.until }; }),
      krakens: krakens.map(function(u) { return { id: u.id, x: u.x, y: u.y, vx: u.vx, hits: u.hits }; }),
      fx: fx ? fx.filter(function(f) { return f.end >= tick; }) : [],
    };
  }

  function result() {
    if (endResult) return endResult;
    endResult = finish();
    return endResult;
  }

  return {
    step: step,
    view: view,
    result: result,
    get done() { return finished; },
    get tick() { return tick; },
  };

  function finish() {
  if (rp && (!rp.frames.length || rp.frames[rp.frames.length - 1].tick !== tick)) replayFrame();
  if (endReason === 'time' && tick >= maxTicks) endReason = 'time';
  snapshot('end');
  var endRow = tdWaveRow(trial, Math.max(1, G55));
  var endWaveHp = Math.max(1, endRow.count * Math.ceil(base.hpBase * hpMulti(endRow.size, endRow.skull)));
  var endPendingFrac = Math.min(10, Math.max(0, (G53 + aliveHp()) / endWaveHp));

  return {
    trial: trial,
    endReason: endReason,
    rootCasts: rootCasts,
    startWave: startWave,
    saves: Object.keys(saves).map(function(k) { return saves[k]; }).sort(function(a, b) { return a.wave - b.wave; }),
    endPendingFrac: endPendingFrac,
    timeSec: tick / 10,
    waveReached: G8,
    highestWave: G55,
    bestWave: bestCleared,
    bestWaveTimeSec: bestClearedTick < 0 ? null : bestClearedTick / 10,
    newBest: bestCleared > savedBest,
    savedBest: savedBest,
    pts: pts,
    spent: spent,
    killPts: killPts,
    skipPts: skipPts,
    sellPts: sellPts,
    phases: phaseLog,
    kills: kills,
    exp: exp,
    totemDamage: totemDamage,
    totemLeft: totem,
    leaks: leaks,
    towers: towers.map(function(t) {
      return { type: t.type, name: TD_TOWER_NAMES[t.type], node: t.node, x: t.x, lvl: t.lvl, traits: t.traits, damage: t.damage, shots: t.shots, cdMax: t.cdMax, map: t.map.slice(), planIdx: t.planIdx };
    }),
    placementFails: placementFails,
    timeline: timeline,
    trace: opts.trace ? trace : undefined,
    replay: rp ? replayResult() : undefined,
  };
  }
}

export function simulateWorshipTdTrials(inputs, plan, opts, seeds) {
  var list = [];
  for (var i = 0; i < seeds.length; i++) list.push(simulateWorshipTdRun(inputs, plan, Object.assign({}, opts, { seed: seeds[i], timeline: false, replay: null })));
  var n = list.length || 1;
  var mean = function(k) { return list.reduce(function(s, r) { return s + (Number(r[k]) || 0); }, 0) / n; };
  return {
    runs: list,
    meanBestWave: mean('bestWave'),
    minBestWave: Math.min.apply(null, list.map(function(r) { return r.bestWave; })),
    maxBestWave: Math.max.apply(null, list.map(function(r) { return r.bestWave; })),
    meanHighestWave: mean('highestWave'),
    meanTimeSec: mean('timeSec'),
    meanExp: mean('exp'),
    meanKills: mean('kills'),
  };
}

// ---------- Optimizer ----------

function _unlockedTypes(inputs) {
  var out = [];
  for (var t = 0; t < TD_TOWER_COUNT; t++) if (inputs.towerLevels[t] >= 1) out.push(t);
  return out;
}

function _weightedPick(rng, items, weightFn) {
  var tot = 0, i;
  for (i = 0; i < items.length; i++) tot += weightFn(items[i]);
  var r = rng() * tot;
  for (i = 0; i < items.length; i++) { r -= weightFn(items[i]); if (r <= 0) return items[i]; }
  return items[items.length - 1];
}

function _randomTraits(rng) {
  var s = '';
  for (var i = 0; i < 12; i++) s += rng() < 0.5 ? 'A' : 'B';
  return s;
}

function _cloneTowerList(list) {
  return list.map(function(t) { return { type: t.type, slot: { node: t.slot.node, x: t.slot.x }, weight: t.weight, traits: t.traits, maxLevel: t.maxLevel }; });
}

function _clonePlan(p) {
  return {
    skipPolicy: p.skipPolicy,
    towers: _cloneTowerList(p.towers),
    roots: p.roots ? Object.assign({}, p.roots) : undefined,
    phases: (p.phases || []).map(function(ph) {
      return {
        label: ph.label,
        when: Object.assign({}, ph.when),
        sell: { all: ph.sell.all, types: ph.sell.types.slice(), keepTypes: ph.sell.keepTypes.slice(), planIdx: ph.sell.planIdx.slice() },
        towers: _cloneTowerList(ph.towers),
        skipRemaining: ph.skipRemaining,
      };
    }),
  };
}

export function heuristicPlan(inputs, trial, opts) {
  opts = opts || {};
  var types = _unlockedTypes(inputs).filter(function(t) { return t !== 5 || opts.allowParty; });
  if (!types.length) return { towers: [], skipPolicy: opts.skipPolicy || 'never' };
  var slots = legalSlots(trial, 20).map(function(s) { return { slot: s, cov: slotCoverage(trial, s, 160) }; });
  slots.sort(function(a, b) { return b.cov - a.cov; });
  var chosen = [];
  var count = opts.towerCount || 24;
  for (var i = 0; i < slots.length && chosen.length < count; i++) {
    var s = slots[i].slot;
    if (chosen.some(function(c) { return c.node === s.node && Math.abs(c.x - s.x) < 62; })) continue;
    chosen.push(s);
  }
  var preferred = [0, 4, 1, 2, 3, 6, 7, 8].filter(function(t) { return types.indexOf(t) >= 0; });
  return {
    skipPolicy: opts.skipPolicy || 'never',
    towers: chosen.map(function(s, i) {
      return { type: preferred[i % preferred.length], slot: s, weight: 1, traits: 'AAAAAAAAAAAA', maxLevel: Infinity };
    }),
  };
}

// ---------- Community guide presets ----------
// Slot coordinates transcribed from guide screenshots. The guide's DPS row keeps one Kraken;
// the simulator needs two Krakens plus the Frozone to hold 14 mobs, so the phase keeps them.
function _gt(type, node, x, traits, maxLevel, weight) {
  return { type: type, slot: { node: node, x: x }, traits: traits, maxLevel: maxLevel == null ? Infinity : maxLevel, weight: weight == null ? 1 : weight };
}

function _gublin230() {
  var row5 = 'KKFKKKFKK'.split('').map(function(c, i) {
    return c === 'K' ? _gt(6, 5, 354 + 62 * i, 'BAAAAA', 25, 1) : _gt(3, 5, 354 + 62 * i, 'AAAAAA', null, 1);
  });
  var partyTraits = ['AAABBB', 'AAABBB', 'AAABBB', 'AAABBB', 'AAAABB', 'BBBBBB', 'BBBBBB', 'BBBBBB', 'BBBBBB', 'BBBBBB', 'BBBBBB'];
  var parties = partyTraits.map(function(tr, i) { return _gt(5, 6, 106 + 62 * i, tr, null, 2); });
  var node3 = [_gt(4, 3, 663, 'BBBBBA', null, 2)].concat([725, 787, 849, 911].map(function(x) { return _gt(7, 3, x, 'ABABBB', null, 3); }));
  var towers = [_gt(8, 4, 306, 'BBBB', null, 0.3)].concat(node3, row5, parties, [_gt(7, 6, 794, 'ABABBB', null, 3)]);
  var dps = [_gt(3, 5, 850, 'AAAAAA', null, 2)]
    .concat([354, 416, 478, 540].map(function(x) { return _gt(5, 5, x, 'BBBBBB', null, 3); }))
    .concat([602, 664].map(function(x) { return _gt(7, 5, x, 'ABABBB', null, 4); }));
  return {
    skipPolicy: 'spam',
    towers: towers,
    roots: { policy: 'danger' },
    phases: [{
      label: 'Boss DPS',
      when: { minWave: 230, aliveMax: 14 },
      // Sell Void plus row-5 towers except the Kraken at 788 and Frozone at 726.
      sell: { types: [8], planIdx: [6, 7, 8, 9, 10, 11, 14] },
      towers: dps,
    }],
  };
}

export var TD_GUIDE_PRESETS = [
  { id: 'gublin-230', trial: 0, label: 'Glublin 230 hold + boss DPS', targetWave: 230, source: 'Community guide (Gublin W1 230)', build: _gublin230 },
];

export function guidePresetsForTrial(trial) {
  return TD_GUIDE_PRESETS.filter(function(p) { return p.trial === Number(trial); });
}

export function guidePresetPlan(id) {
  for (var i = 0; i < TD_GUIDE_PRESETS.length; i++) if (TD_GUIDE_PRESETS[i].id === id) return TD_GUIDE_PRESETS[i].build();
  return null;
}

// ---------- Guide hold-strategy template ----------
// Every community guide shares one shape; only placement differs per map:
// - a Kraken/Frozone wall (KKFK... pattern) from the entry end of a path platform holds mobs;
// - Void near the spawn strips mob modifiers;
// - a Storm plus Poisonic cluster covers the hold zone;
// - Parties sit where their speed aura reaches the wall and DPS (their damage aura is map-wide);
// - at the target boss wave, sell Void and most of the wall (keeping the entry-side Frozone and
//   adjacent Kraken(s)) and rebuild the freed wall slots as Frozone, Party, and Poisonic DPS.
// Waves are spam-skipped and roots are cast when mobs get dangerous.
export var TD_HOLD_DEFAULTS = {
  wallNode: null, wallCount: 9, wallOffset: 56, dpsRank: 0, poisonCount: 4,
  partyCount: 11, keepKraken: 1, phasePartyFrac: 2 / 3, targetWave: null,
};

var _legalXCache = {};
function _legalXs(trial, node) {
  var key = trial + ':' + node;
  if (_legalXCache[key]) return _legalXCache[key];
  var nd = tdGeometry(trial).nodes[node];
  var out = [];
  for (var x = nd.x + 30; x <= nd.length - 30; x++) {
    var v = validatePlacement(trial, [], node, x);
    if (v.ok && v.x === x) out.push(x);
  }
  return (_legalXCache[key] = out);
}

// Up to `count` legal positions on a platform, `gap` px apart, walking from `startX` in `dir`.
function _walkSlots(xs, startX, dir, count, gap) {
  var out = [];
  var seq = dir > 0 ? xs : xs.slice().reverse();
  var need = startX;
  for (var i = 0; i < seq.length && out.length < count; i++) {
    var x = seq[i];
    if (dir > 0 ? x < need : x > need) continue;
    out.push(x);
    need = x + dir * gap;
  }
  return out;
}

function _clash(slots, node, x) {
  for (var i = 0; i < slots.length; i++) if (slots[i].node === node && Math.abs(slots[i].x - x) < 62) return true;
  return false;
}

// Path platforms that can hold a wall, with entry side and capacity (towers at 62 px).
export function holdWallNodes(trial) {
  var p = tdTrialPath(trial);
  var placeable = placeableNodes(trial);
  var out = [];
  p.path.forEach(function(n, pi) {
    if (placeable.indexOf(n) < 0) return;
    var xs = _legalXs(trial, n);
    if (!xs.length) return;
    var dir = p.flags[pi] === 0 ? 1 : -1;
    var cap = _walkSlots(xs, dir > 0 ? xs[0] : xs[xs.length - 1], dir, 99, 62).length;
    if (cap >= 3) out.push({ node: n, pathIdx: pi, dir: dir, entryX: dir > 0 ? xs[0] : xs[xs.length - 1], capacity: cap });
  });
  // Downstream, longer walls first: the guides hold mobs on the last long platform.
  out.sort(function(a, b) { return (b.pathIdx + Math.min(b.capacity, 9) / 3) - (a.pathIdx + Math.min(a.capacity, 9) / 3); });
  return out;
}

function _holdTowerSet(towers, inputs, trial) {
  return towers.map(function(t) {
    var c = towerCenters(trial, t.slot.node, t.slot.x);
    return { type: t.type, cx: c.cx, cy: c.cy, wx: c.wx, wy: c.wy };
  });
}

// Ranked Storm+Poisonic clusters by hold-zone coverage.
function _dpsClusters(trial, inputs, size, occupied, zone) {
  var range = towerRange(7, 1, inputs.towerLevels[7] || 1);
  var out = [];
  placeableNodes(trial).forEach(function(n) {
    var xs = _legalXs(trial, n);
    if (!xs.length) return;
    for (var sx = xs[0]; sx <= xs[xs.length - 1]; sx += 31) {
      var xsl = _walkSlots(xs, sx, 1, size, 62);
      if (xsl.length < size) break;
      if (xsl.some(function(x) { return _clash(occupied, n, x); })) continue;
      var cov = 0;
      xsl.forEach(function(x) {
        var c = towerCenters(trial, n, x);
        for (var i = 0; i < zone.length; i++) if (tdDistance(zone[i].x - c.wx, zone[i].y - c.wy) < range) cov++;
      });
      out.push({ node: n, xs: xsl, cov: cov });
    }
  });
  out.sort(function(a, b) { return b.cov - a.cov || a.xs[0] - b.xs[0]; });
  var picked = [];
  out.forEach(function(c) {
    if (picked.length >= 6) return;
    if (picked.some(function(p) { return p.node === c.node && Math.abs(p.xs[0] - c.xs[0]) < 62 * Math.max(2, size / 2); })) return;
    picked.push(c);
  });
  return picked;
}

// Builds the guide hold plan for a trial. Returns { plan, params, roles } or null when the map has
// no wall platform or neither Kraken nor Frozone is unlocked.
export function holdTemplatePlan(inputs, trial, params) {
  trial = Number(trial) || 0;
  var P = Object.assign({}, TD_HOLD_DEFAULTS, params || {});
  var types = _unlockedTypes(inputs);
  var has = function(t) { return types.indexOf(t) >= 0; };
  if (!has(6) && !has(3)) return null;
  var walls = holdWallNodes(trial);
  if (!walls.length) return null;
  var W = walls.filter(function(w) { return w.node === P.wallNode; })[0] || walls[0];
  P.wallNode = W.node;
  var p = tdTrialPath(trial);
  var geom = tdGeometry(trial);
  var xs = _legalXs(trial, W.node);
  var wallXs = _walkSlots(xs, W.entryX + W.dir * Math.max(0, P.wallOffset), W.dir, Math.max(1, Math.min(P.wallCount, W.capacity)), 62);
  if (!wallXs.length) wallXs = _walkSlots(xs, W.entryX, W.dir, Math.max(1, Math.min(P.wallCount, W.capacity)), 62);
  P.wallCount = wallXs.length;
  var wall = wallXs.map(function(x, i) {
    var frz = has(3) && (!has(6) || i % 4 === 2);
    return frz ? _gt(3, W.node, x, 'AAAAAA', null, 1) : _gt(6, W.node, x, 'BAAAAA', 25, 1);
  });
  var occupied = wall.map(function(t) { return t.slot; });

  // Void a little past the spawn on the first path platform.
  var voids = [];
  if (has(8)) {
    var n0 = p.path[0], f0 = p.flags[0], xs0 = _legalXs(trial, n0);
    if (xs0.length) {
      var want = f0 === 0 ? geom.nodes[n0].x + 132 : geom.nodes[n0].length - 132;
      var vx = xs0.reduce(function(b, x) { return _clash(occupied, n0, x) ? b : (b == null || Math.abs(x - want) < Math.abs(b - want) ? x : b); }, null);
      if (vx != null) { voids.push(_gt(8, n0, vx, 'BBBB', null, 0.3)); occupied.push({ node: n0, x: vx }); }
    }
  }

  // Hold zone: the wall platform from its entry end through the wall.
  var exitMost = wallXs[wallXs.length - 1];
  var zone = pathSamples(trial, 20).filter(function(s) {
    return s.node === W.node && (W.dir > 0 ? s.x <= exitMost + 31 : s.x >= exitMost - 31);
  });
  var dps = [];
  var nPoison = has(7) ? Math.max(0, P.poisonCount) : 0;
  var size = nPoison + (has(4) ? 1 : 0);
  var clusters = size ? _dpsClusters(trial, inputs, size, occupied, zone) : [];
  P.dpsRank = Math.max(0, Math.min(P.dpsRank, Math.max(0, clusters.length - 1)));
  var cl = clusters[P.dpsRank];
  if (cl) {
    cl.xs.forEach(function(x, i) {
      if (has(4) && i === 0) dps.push(_gt(4, cl.node, x, 'BBBBBA', null, 2));
      else dps.push(_gt(7, cl.node, x, 'ABABBB', null, 3));
      occupied.push({ node: cl.node, x: x });
    });
  }

  // Parties: greedy slots whose speed aura reaches the most wall/DPS towers; off-path preferred.
  var parties = [];
  if (has(5) && P.partyCount > 0) {
    var pr = towerRange(5, 1, inputs.towerLevels[5] || 1) + 10;
    var targets = _holdTowerSet(wall.concat(dps), inputs, trial);
    var cand = [];
    placeableNodes(trial).forEach(function(n) {
      var off = p.path.indexOf(n) < 0;
      _legalXs(trial, n).forEach(function(x) {
        if ((x - _legalXs(trial, n)[0]) % 31) return;
        var c = towerCenters(trial, n, x), k = 0;
        for (var i = 0; i < targets.length; i++) if (tdDistance(targets[i].cx - c.cx, targets[i].cy - c.cy) < pr) k++;
        cand.push({ node: n, x: x, score: k + (off ? 0.5 : 0) });
      });
    });
    cand.sort(function(a, b) { return b.score - a.score || a.x - b.x; });
    var nA = Math.round(P.partyCount * 4 / 11);
    for (var ci = 0; ci < cand.length && parties.length < P.partyCount; ci++) {
      var s = cand[ci];
      if (_clash(occupied, s.node, s.x)) continue;
      var j = parties.length;
      parties.push(_gt(5, s.node, s.x, j < nA ? 'AAABBB' : j === nA ? 'AAAABB' : 'BBBBBB', null, 2));
      occupied.push({ node: s.node, x: s.x });
    }
  }

  var towers = voids.concat(dps, wall, parties);
  var wallStart = voids.length + dps.length;
  var target = P.targetWave != null ? Math.round(P.targetWave / 10) * 10
    : Math.max(10, Math.round(((inputs.bestWaves[trial] || 0) + 30) / 10) * 10);
  P.targetWave = target;

  // Boss phase: keep the entry-most Frozone and its nearest Kraken(s); rebuild the rest of the wall.
  var keep = [];
  var fi = -1;
  for (var w = 0; w < wall.length; w++) if (wall[w].type === 3) { fi = w; break; }
  if (fi >= 0) keep.push(fi);
  var kr = wall.map(function(t, i) { return i; }).filter(function(i) { return wall[i].type === 6; });
  kr.sort(function(a, b) { var ref = fi >= 0 ? fi : 0; return Math.abs(a - ref) - Math.abs(b - ref) || a - b; });
  keep = keep.concat(kr.slice(0, Math.max(0, P.keepKraken)));
  var freed = [];
  for (var w2 = 0; w2 < wall.length; w2++) if (keep.indexOf(w2) < 0) freed.push(w2);
  var phaseTowers = [];
  if (freed.length) {
    var restIdx = freed.slice();
    if (has(3)) phaseTowers.push(_gt(3, W.node, wallXs[restIdx.shift()], 'AAAAAA', null, 2));
    restIdx.reverse(); // exit side first
    var nParty = has(5) ? (has(7) ? Math.round(restIdx.length * P.phasePartyFrac) : restIdx.length) : 0;
    restIdx.forEach(function(wi, k) {
      if (k < nParty) phaseTowers.push(_gt(5, W.node, wallXs[wi], 'BBBBBB', null, 3));
      else if (has(7)) phaseTowers.push(_gt(7, W.node, wallXs[wi], 'ABABBB', null, 4));
    });
  }
  var plan = {
    skipPolicy: 'spam',
    towers: towers,
    roots: { policy: 'danger' },
    phases: freed.length ? [{
      label: 'Boss DPS',
      when: { minWave: target, aliveMax: 14 },
      sell: { types: has(8) ? [8] : [], planIdx: freed.map(function(i) { return wallStart + i; }) },
      towers: phaseTowers,
    }] : [],
  };
  plan = legalizePlan(trial, _normalizePlan(plan));
  return {
    plan: plan,
    params: P,
    roles: {
      wall: { node: W.node, xs: wallXs, pattern: wall.map(function(t) { return t.type === 3 ? 'F' : 'K'; }).join('') },
      void: voids.length ? voids[0].slot : null,
      dps: cl ? { node: cl.node, xs: cl.xs, coverage: cl.cov } : null,
      parties: parties.map(function(t) { return t.slot; }),
      dpsOptions: clusters.length,
    },
  };
}

export function randomPlan(inputs, trial, rng, opts) {
  opts = opts || {};
  var types = _unlockedTypes(inputs);
  var slots = opts.slots || legalSlots(trial, 10);
  if (!types.length || !slots.length) return { towers: [], skipPolicy: opts.skipPolicy || 'never' };
  var cov = opts.coverage || slots.map(function(s) { return slotCoverage(trial, s, 160); });
  var ctx = opts.ctx || { slots: slots, idx: slots.map(function(_, i) { return i; }), cov: cov, types: types, maxTowers: opts.maxTowers || 10, waveLo: 10, waveHi: 60 };
  var maxT = opts.maxTowers || ctx.maxTowers || 10;
  var towers = [];
  var n = 3 + Math.floor(rng() * Math.max(1, maxT - 2));
  while (towers.length < n) {
    var add = rng() < 0.5 ? _cluster(rng, ctx, n - towers.length) : [_newTower(rng, ctx)];
    towers = towers.concat(add);
  }
  var p = _normalizePlan({ towers: towers.slice(0, n), skipPolicy: opts.skipPolicy || 'never' });
  if (rng() < 0.35) _addPhase(p, rng, ctx);
  return legalizePlan(trial, p, slots);
}

// ----- Generic plan edits -----
// Plans are searched without strategy templates: edits act on single towers, same-type groups,
// whole types, and phases (sell-and-rebuild stages). Tower indices are global across stages
// (initial towers, then each phase's towers), matching the sim's plan indices used by phase sells.
var TD_LEVEL_CAPS = [Infinity, 5, 10, 15, 20, 25, 30, 40];
var TD_ALIVE_TRIGGERS = [1, 3, 7, 14, 28, 60];
var TD_BOSS_FRACS = [0.4, 0.6, 0.8];

function _pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }

function _traitRecipe(rng) {
  var n = 1 + Math.floor(rng() * 6), s = '', kind = Math.floor(rng() * 7);
  for (var i = 0; i < 12; i++) {
    if (kind === 0) s += 'A';
    else if (kind === 1) s += 'B';
    else if (kind === 2) s += i % 2 ? 'B' : 'A';
    else if (kind === 3) s += i % 2 ? 'A' : 'B';
    else if (kind === 4) s += i < n ? 'B' : 'A';
    else if (kind === 5) s += i < n ? 'A' : 'B';
    else s += rng() < 0.5 ? 'A' : 'B';
  }
  return s;
}

function _randomCap(rng) { return rng() < 0.5 ? Infinity : _pick(rng, TD_LEVEL_CAPS); }

function _randomSlot(rng, ctx) {
  var si = _weightedPick(rng, ctx.idx, function(i) { return 1 + ctx.cov[i]; });
  return { node: ctx.slots[si].node, x: ctx.slots[si].x };
}

function _newTower(rng, ctx, slot, type) {
  return { type: type == null ? _pick(rng, ctx.types) : type, slot: slot || _randomSlot(rng, ctx), weight: 0.5 + rng() * 2, traits: _traitRecipe(rng), maxLevel: _randomCap(rng) };
}

// k same-type towers in consecutive 62 px slots on one platform, sharing traits, cap, and weight.
function _cluster(rng, ctx, maxK) {
  var k = Math.max(1, Math.min(maxK || 5, 2 + Math.floor(rng() * 4)));
  var slot = _randomSlot(rng, ctx);
  var t0 = _newTower(rng, ctx, slot);
  var dir = rng() < 0.5 ? 1 : -1;
  var out = [];
  for (var i = 0; i < k; i++) out.push({ type: t0.type, slot: { node: slot.node, x: slot.x + dir * 62 * i }, weight: t0.weight, traits: t0.traits, maxLevel: t0.maxLevel });
  return out;
}

function _listAt(p, stage) { return stage < 0 ? p.towers : p.phases[stage].towers; }

function _globalStart(p, stage) {
  if (stage < 0) return 0;
  var g = p.towers.length;
  for (var q = 0; q < stage; q++) g += p.phases[q].towers.length;
  return g;
}

function _reindex(p, fn) {
  p.phases.forEach(function(ph) {
    ph.sell.planIdx = ph.sell.planIdx.map(fn).filter(function(j, i, a) { return j >= 0 && a.indexOf(j) === i; });
  });
}

function _insertTowers(p, stage, at, list) {
  var g = _globalStart(p, stage) + at, n = list.length;
  _reindex(p, function(j) { return j >= g ? j + n : j; });
  Array.prototype.splice.apply(_listAt(p, stage), [at, 0].concat(list));
}

function _removeTowers(p, stage, locals) {
  var L = _listAt(p, stage), start = _globalStart(p, stage);
  locals.slice().sort(function(a, b) { return b - a; }).forEach(function(k) {
    var g = start + k;
    _reindex(p, function(j) { return j === g ? -1 : j > g ? j - 1 : j; });
    L.splice(k, 1);
  });
}

function _groupOf(L, t) {
  var out = [];
  for (var i = 0; i < L.length; i++) if (L[i].type === t.type && L[i].slot.node === t.slot.node) out.push(i);
  return out;
}

function _allTowers(p) {
  var out = [];
  p.towers.forEach(function(t) { out.push(t); });
  p.phases.forEach(function(ph) { ph.towers.forEach(function(t) { out.push(t); }); });
  return out;
}

// Towers standing before phase `stage` sells, with their global plan indices.
function _earlierTowers(p, stage) {
  var out = [], g = 0;
  p.towers.forEach(function(t) { out.push({ t: t, g: g++ }); });
  for (var q = 0; q < stage; q++) p.phases[q].towers.forEach(function(t) { out.push({ t: t, g: g++ }); });
  return out;
}

function _randomWhen(rng, ctx) {
  var lo = Math.ceil(Math.max(10, ctx.waveLo) / 10), hi = Math.max(lo, Math.floor(ctx.waveHi / 10));
  return {
    minWave: 10 * (lo + Math.floor(rng() * (hi - lo + 1))),
    bossHold: rng() < 0.5 ? true : null,
    aliveMax: rng() < 0.35 ? _pick(rng, TD_ALIVE_TRIGGERS) : null,
    bossHpFracMax: rng() < 0.15 ? _pick(rng, TD_BOSS_FRACS) : null,
    minTimeSec: null,
  };
}

function _randomSell(p, stage, rng) {
  var prev = _earlierTowers(p, stage);
  var sell = { all: false, types: [], keepTypes: [], planIdx: [] };
  if (!prev.length) return sell;
  var present = [];
  prev.forEach(function(e) { if (present.indexOf(e.t.type) < 0) present.push(e.t.type); });
  var r = rng();
  if (r < 0.3) {
    sell.types.push(_pick(rng, present));
    if (present.length > 1 && rng() < 0.3) { var t2 = _pick(rng, present); if (sell.types.indexOf(t2) < 0) sell.types.push(t2); }
  } else if (r < 0.75) {
    var e0 = _pick(rng, prev);
    var sameType = rng() < 0.5;
    prev.forEach(function(e) {
      if (e.t.slot.node === e0.t.slot.node && (!sameType || e.t.type === e0.t.type)) sell.planIdx.push(e.g);
    });
  } else if (r < 0.9) {
    var k = 1 + Math.floor(rng() * 4);
    for (var i = 0; i < k; i++) { var g = _pick(rng, prev).g; if (sell.planIdx.indexOf(g) < 0) sell.planIdx.push(g); }
  } else {
    sell.all = true;
    sell.keepTypes.push(_pick(rng, present));
    if (present.length > 1 && rng() < 0.5) { var t3 = _pick(rng, present); if (sell.keepTypes.indexOf(t3) < 0) sell.keepTypes.push(t3); }
  }
  return sell;
}

function _soldSlots(p, stage, sell) {
  return _earlierTowers(p, stage).filter(function(e) {
    return sell.all ? sell.keepTypes.indexOf(e.t.type) < 0 : (sell.types.indexOf(e.t.type) >= 0 || sell.planIdx.indexOf(e.g) >= 0);
  }).map(function(e) { return { node: e.t.slot.node, x: e.t.slot.x }; });
}

// Phase builds either reuse the sold towers' slots with a new configuration, or add clusters elsewhere.
function _phaseTowers(p, stage, sell, rng, ctx) {
  var sold = _soldSlots(p, stage, sell);
  if (sold.length && rng() < 0.6) {
    var t0 = _newTower(rng, ctx);
    var mixed = rng() < 0.3;
    return sold.slice(0, ctx.maxTowers).map(function(s) {
      var t = mixed ? _newTower(rng, ctx, s) : { type: t0.type, slot: s, weight: t0.weight, traits: t0.traits, maxLevel: t0.maxLevel };
      t.slot = { node: s.node, x: s.x };
      return t;
    });
  }
  var out = [];
  var groups = 1 + Math.floor(rng() * 3);
  for (var i = 0; i < groups; i++) out = out.concat(rng() < 0.6 ? _cluster(rng, ctx, 5) : [_newTower(rng, ctx)]);
  return out;
}

function _addPhase(p, rng, ctx) {
  var at = rng() < 0.7 ? p.phases.length : Math.floor(rng() * (p.phases.length + 1));
  var ph = { label: 'Stage ' + (p.phases.length + 1), when: _randomWhen(rng, ctx), sell: { all: false, types: [], keepTypes: [], planIdx: [] }, towers: [], skipRemaining: true };
  p.phases.splice(at, 0, ph);
  ph.sell = _randomSell(p, at, rng);
  _insertTowers(p, at, 0, _phaseTowers(p, at, ph.sell, rng, ctx));
}

function _removePhase(p, i) {
  _removeTowers(p, i, p.phases[i].towers.map(function(_, k) { return k; }));
  p.phases.splice(i, 1);
}

function _mutateWhen(w, rng, ctx) {
  var r = rng();
  if (r < 0.4) {
    var cur = w.minWave == null ? ctx.waveLo : w.minWave;
    w.minWave = Math.max(10, Math.round((cur + (rng() < 0.5 ? -10 : 10) * (1 + Math.floor(rng() * 2))) / 10) * 10);
  } else if (r < 0.6) w.bossHold = w.bossHold ? null : true;
  else if (r < 0.85) w.aliveMax = rng() < 0.3 ? null : _pick(rng, TD_ALIVE_TRIGGERS);
  else w.bossHpFracMax = rng() < 0.4 ? null : _pick(rng, TD_BOSS_FRACS);
}

function _mutatePhase(p, rng, ctx) {
  var r = rng();
  if (!p.phases.length || (r < 0.25 && p.phases.length < 3)) { _addPhase(p, rng, ctx); return; }
  var i = Math.floor(rng() * p.phases.length), ph = p.phases[i];
  if (r < 0.37) { _removePhase(p, i); return; }
  if (r < 0.65) { _mutateWhen(ph.when, rng, ctx); return; }
  if (r < 0.85) {
    if (rng() < 0.5) { ph.sell = _randomSell(p, i, rng); return; }
    var prev = _earlierTowers(p, i);
    if (!prev.length) return;
    if (ph.sell.all) { ph.sell.keepTypes = rng() < 0.5 ? [] : [_pick(rng, prev).t.type]; return; }
    var g = _pick(rng, prev).g, at = ph.sell.planIdx.indexOf(g);
    if (at >= 0) ph.sell.planIdx.splice(at, 1); else ph.sell.planIdx.push(g);
    return;
  }
  // Rebuild the phase's towers from scratch for its current sell set.
  _removeTowers(p, i, ph.towers.map(function(_, k) { return k; }));
  _insertTowers(p, i, 0, _phaseTowers(p, i, ph.sell, rng, ctx));
}

function _mutate(plan, inputs, trial, rng, ctx) {
  return legalizePlan(trial, _mutateRaw(plan, inputs, trial, rng, ctx), ctx.slots);
}

function _mutateRaw(plan, inputs, trial, rng, ctx) {
  var p = _clonePlan(plan);
  if (!p.phases) p.phases = [];
  if (rng() < 0.15) { _mutatePhase(p, rng, ctx); return p; }
  var stage = p.phases.length && rng() < 0.3 ? Math.floor(rng() * p.phases.length) : -1;
  var L = _listAt(p, stage);
  var room = ctx.maxTowers - L.length;
  var r = rng();
  if (!L.length || r < 0.1) {
    if (room > 0) _insertTowers(p, stage, Math.floor(rng() * (L.length + 1)), [_newTower(rng, ctx)]);
    return p;
  }
  if (r < 0.2) {
    if (room > 1) _insertTowers(p, stage, Math.floor(rng() * (L.length + 1)), _cluster(rng, ctx, Math.min(5, room)));
    return p;
  }
  var k = Math.floor(rng() * L.length), t = L[k];
  if (r < 0.26) {
    if (room > 0) _insertTowers(p, stage, k + 1, [{ type: t.type, slot: { node: t.slot.node, x: t.slot.x + (rng() < 0.5 ? 62 : -62) }, weight: t.weight, traits: t.traits, maxLevel: t.maxLevel }]);
    return p;
  }
  if (r < 0.34) { if (L.length > 1 || stage >= 0) _removeTowers(p, stage, [k]); return p; }
  if (r < 0.38) { var grp = _groupOf(L, t); if (grp.length < L.length || stage >= 0) _removeTowers(p, stage, grp); return p; }
  if (r < 0.48) {
    var near = ctx.slots.filter(function(s) { return s.node === t.slot.node && Math.abs(s.x - t.slot.x) <= 60; });
    var pool = rng() < 0.6 && near.length ? near : ctx.slots;
    var s2 = _pick(rng, pool);
    t.slot = { node: s2.node, x: s2.x };
    return p;
  }
  if (r < 0.52) {
    var g2 = _groupOf(L, t);
    if (rng() < 0.5) {
      var dx = _pick(rng, [-124, -62, -31, 31, 62, 124]);
      g2.forEach(function(i) { L[i].slot = { node: L[i].slot.node, x: L[i].slot.x + dx }; });
    } else {
      var dst = _randomSlot(rng, ctx), x0 = t.slot.x;
      g2.forEach(function(i) { L[i].slot = { node: dst.node, x: dst.x + (L[i].slot.x - x0) }; });
    }
    return p;
  }
  if (r < 0.58) { t.type = _pick(rng, ctx.types); return p; }
  if (r < 0.62) { var nt = _pick(rng, ctx.types); _groupOf(L, t).forEach(function(i) { L[i].type = nt; }); return p; }
  if (r < 0.70) { t.weight = Math.max(0.05, t.weight * Math.exp((rng() - 0.5) * 1.6)); return p; }
  if (r < 0.74) {
    var f = Math.exp((rng() - 0.5) * 1.6), ty = t.type;
    _allTowers(p).forEach(function(o) { if (o.type === ty) o.weight = Math.max(0.05, o.weight * f); });
    return p;
  }
  if (r < 0.80) {
    var tr = (t.traits || '').padEnd(12, 'A').split('');
    var j = Math.floor(rng() * 8);
    tr[j] = tr[j] === 'A' ? 'B' : 'A';
    t.traits = tr.join('');
    return p;
  }
  if (r < 0.86) {
    var rec = _traitRecipe(rng);
    if (rng() < 0.5) t.traits = rec;
    else { var ty2 = t.type; _allTowers(p).forEach(function(o) { if (o.type === ty2) o.traits = rec; }); }
    return p;
  }
  if (r < 0.93) {
    var cap = _randomCap(rng);
    if (rng() < 0.5) t.maxLevel = cap;
    else { var ty3 = t.type; _allTowers(p).forEach(function(o) { if (o.type === ty3) o.maxLevel = cap; }); }
    return p;
  }
  if (L.length > 1) {
    var k2 = Math.floor(rng() * L.length), start = _globalStart(p, stage);
    var ga = start + k, gb = start + k2;
    var tmp = L[k]; L[k] = L[k2]; L[k2] = tmp;
    _reindex(p, function(j2) { return j2 === ga ? gb : j2 === gb ? ga : j2; });
  }
  return p;
}

// Latest save wave every run reached, with the smallest saved points among runs.
export function commonSavePoint(runs, afterWave) {
  if (!runs || !runs.length) return null;
  var best = null;
  (runs[0].saves || []).forEach(function(s0) {
    if (s0.wave <= (afterWave || 0)) return;
    var pts = Infinity;
    for (var i = 0; i < runs.length; i++) {
      var hit = (runs[i].saves || []).filter(function(s) { return s.wave === s0.wave; })[0];
      if (!hit) return;
      pts = Math.min(pts, hit.pts);
    }
    if (!best || s0.wave > best.wave) best = { wave: s0.wave, pts: pts };
  });
  return best;
}

// Score: max wave (or souls/hr at max(saved, wave)), then consistency, reach, how much of the
// failing wave's HP remained (long-run progress inside a plateau), points banked at the latest save,
// and time to reach it.
function _score(inputs, trial, objective, agg) {
  var w = agg.meanBestWave;
  var primary = objective === 'souls'
    ? soulsPerHour(inputs, trial, Math.max(inputs.bestWaves[trial] || 0, Math.floor(w)))
    : w;
  var n = agg.runs.length || 1;
  var meanOf = function(fn) { return agg.runs.reduce(function(s, r) { return s + fn(r); }, 0) / n; };
  return {
    primary: primary,
    wave: w,
    minWave: agg.minBestWave,
    reached: agg.meanHighestWave,
    endFrac: Math.round(meanOf(function(r) { return r.endPendingFrac || 0; }) * 100) / 100,
    savePts: meanOf(function(r) { var s = r.saves || []; return s.length ? s[s.length - 1].pts : 0; }),
    time: meanOf(function(r) { return r.bestWaveTimeSec || 0; }),
  };
}

// Recorded best needs an empty board, so mean reached wave breaks ties between plans that clear the same wave.
function _better(a, b) {
  if (!b) return true;
  if (a.primary !== b.primary) return a.primary > b.primary;
  if (a.minWave !== b.minWave) return a.minWave > b.minWave;
  if (a.reached !== b.reached) return a.reached > b.reached;
  if ((a.endFrac || 0) !== (b.endFrac || 0)) return (a.endFrac || 0) < (b.endFrac || 0);
  if ((a.savePts || 0) !== (b.savePts || 0)) return (a.savePts || 0) > (b.savePts || 0);
  return a.time < b.time;
}

// Bounded random-restart local search over build plans.
// opts: { trial, objective: 'wave'|'souls', restarts, iterations, seeds, start,
//         maxWave, maxTimeSec, skipPolicy, maxTowers, seedPlan, baseSeed }
export function optimizeWorshipTd(inputs, opts, onProgress) {
  opts = opts || {};
  var trial = Number(opts.trial) || 0;
  var objective = opts.objective === 'souls' ? 'souls' : 'wave';
  var restarts = Math.max(1, opts.restarts || 4);
  var iterations = Math.max(1, opts.iterations || 60);
  var nSeeds = Math.max(1, opts.seeds || 3);
  var baseSeed = Number(opts.baseSeed) || 12345;
  var seeds = [];
  for (var s = 0; s < nSeeds; s++) seeds.push(baseSeed + s * 7919);
  var simOpts = { trial: trial, start: opts.start || 'fresh', maxWave: opts.maxWave || 1000, maxTimeSec: opts.maxTimeSec || 4 * 3600 };
  var startWave = opts.start === 'checkpoint' ? (inputs.checkpointWaves[trial] || 0)
    : opts.start && typeof opts.start === 'object' ? Math.round(Number(opts.start.wave) || 0) : 0;
  var rng = mulberry32(baseSeed ^ 0x9e3779b9);
  var slots = legalSlots(trial, 10);
  var ctx = {
    slots: slots,
    idx: slots.map(function(_, i) { return i; }),
    cov: slots.map(function(sl) { return slotCoverage(trial, sl, 160); }),
    types: _unlockedTypes(inputs),
    maxTowers: opts.maxTowers || 30,
    // Phase triggers are drawn from boss waves between the start and well past the saved best.
    waveLo: startWave + 10,
    waveHi: Math.max(startWave, inputs.bestWaves[trial] || 0) + 40,
  };
  if (!ctx.types.length || !slots.length) return { ok: false, reason: ctx.types.length ? 'No legal tower slots' : 'No unlocked tower types' };
  var total = restarts * (iterations + 1);
  var done = 0;
  var evaluations = 0;
  var bestPlan = null, bestScore = null, bestAgg = null;
  var history = [];
  function evaluate(plan) {
    evaluations++;
    var agg = simulateWorshipTdTrials(inputs, plan, simOpts, seeds);
    return { agg: agg, score: _score(inputs, trial, objective, agg) };
  }
  for (var r = 0; r < restarts; r++) {
    var cur;
    if (r === 0 && opts.seedPlan && opts.seedPlan.towers && opts.seedPlan.towers.length) cur = _normalizePlan(opts.seedPlan);
    else if (r === 0 || (r === 1 && opts.seedPlan)) cur = _normalizePlan(heuristicPlan(inputs, trial, { skipPolicy: opts.skipPolicy }));
    else cur = randomPlan(inputs, trial, rng, { slots: slots, coverage: ctx.cov, maxTowers: ctx.maxTowers, skipPolicy: opts.skipPolicy, ctx: ctx });
    if (opts.skipPolicy) cur.skipPolicy = opts.skipPolicy;
    cur = legalizePlan(trial, cur, slots);
    var ce = evaluate(cur);
    done++;
    for (var it = 0; it < iterations; it++) {
      var cand = _mutate(cur, inputs, trial, rng, ctx);
      if (!opts.skipPolicy && rng() < 0.05) cand.skipPolicy = TD_SKIP_POLICIES[(TD_SKIP_POLICIES.indexOf(cand.skipPolicy) + 1 + Math.floor(rng() * 2)) % TD_SKIP_POLICIES.length];
      var ev = evaluate(cand);
      if (!_better(ce.score, ev.score)) { cur = cand; ce = ev; }
      done++;
      if (!bestScore || _better(ce.score, bestScore)) { bestScore = ce.score; bestPlan = _clonePlan(cur); bestAgg = ce.agg; }
      if (onProgress && (it % 2 === 0 || it === iterations - 1)) {
        onProgress({ phase: 'search', completed: done, total: total, restart: r + 1, restarts: restarts, bestWave: bestScore.wave, bestPrimary: bestScore.primary, plan: bestPlan });
      }
    }
    if (!bestScore || _better(ce.score, bestScore)) { bestScore = ce.score; bestPlan = _clonePlan(cur); bestAgg = ce.agg; }
    history.push({ restart: r + 1, wave: ce.score.wave, primary: ce.score.primary });
  }
  var detail = simulateWorshipTdRun(inputs, bestPlan, Object.assign({}, simOpts, { seed: seeds[0] }));
  var saved = inputs.bestWaves[trial] || 0;
  return {
    ok: true,
    trial: trial,
    objective: objective,
    plan: bestPlan,
    score: bestScore,
    meanBestWave: bestAgg.meanBestWave,
    minBestWave: bestAgg.minBestWave,
    maxBestWave: bestAgg.maxBestWave,
    savedBest: saved,
    soulsPerHourNow: soulsPerHour(inputs, trial, saved),
    soulsPerHourPlan: soulsPerHour(inputs, trial, Math.max(saved, Math.floor(bestAgg.meanBestWave))),
    evaluations: evaluations,
    seeds: seeds,
    history: history,
    startWave: startWave,
    saveAt: commonSavePoint(bestAgg.runs, startWave),
    detail: detail,
  };
}

// Guide-strategy layout search: the hold template is fixed, only its placement and counts are
// searched. Screens every wall platform (and the trial's guide presets), then coordinate-descends
// wall offset/length, DPS cluster, Party count, kept Krakens, boss-phase split, and target wave on
// the leader, and finally re-scores the winner with more seeds.
// opts: { trial, objective, start, seeds, finalSeeds, budget, maxWave, maxTimeSec, baseSeed, params }
export function optimizeWorshipTdLayout(inputs, opts, onProgress) {
  opts = opts || {};
  var trial = Number(opts.trial) || 0;
  var objective = opts.objective === 'souls' ? 'souls' : 'wave';
  var baseSeed = Number(opts.baseSeed) || 12345;
  var nSeeds = Math.max(1, opts.seeds || 2);
  var nFinal = Math.max(nSeeds, opts.finalSeeds || nSeeds * 2);
  var seeds = [], finalSeeds = [];
  for (var s = 0; s < nFinal; s++) { finalSeeds.push(baseSeed + s * 7919); if (s < nSeeds) seeds.push(baseSeed + s * 7919); }
  var cp = inputs.checkpointWaves[trial] || 0;
  var start = opts.start || (cp ? 'checkpoint' : 'fresh');
  var simOpts = { trial: trial, start: start, maxWave: opts.maxWave || 1000, maxTimeSec: opts.maxTimeSec || 4 * 3600 };
  var startWave = start === 'checkpoint' ? cp : start && typeof start === 'object' ? Math.round(Number(start.wave) || 0) : 0;
  var walls = holdWallNodes(trial);
  var first = holdTemplatePlan(inputs, trial, Object.assign({ wallNode: walls.length ? walls[0].node : null }, opts.params || {}));
  if (!first) return { ok: false, reason: walls.length ? 'Needs Kraken or Frozone unlocked' : 'No path platform can hold a wall' };
  var budget = Math.max(walls.length + 1, opts.budget || 30);
  var evaluations = 0;
  var cache = {};
  var screen = [];
  var best = null;
  function key(P) { return JSON.stringify([P.wallNode, P.wallCount, P.wallOffset, P.dpsRank, P.poisonCount, P.partyCount, P.keepKraken, Math.round(P.phasePartyFrac * 100), P.targetWave]); }
  function consider(e) {
    if (!best || _better(e.score, best.score)) best = e;
  }
  function report(phase) {
    if (onProgress) onProgress({ phase: phase, completed: Math.min(evaluations, budget), total: budget + 1, bestWave: best ? best.score.wave : 0, bestPrimary: best ? best.score.primary : 0, plan: best ? best.plan : null, params: best ? best.params : null, label: best ? best.label : '' });
  }
  function evalTemplate(params, label) {
    var built = holdTemplatePlan(inputs, trial, params);
    if (!built) return null;
    var k = key(built.params);
    if (cache[k]) return cache[k];
    if (evaluations >= budget) return null;
    evaluations++;
    var agg = simulateWorshipTdTrials(inputs, built.plan, simOpts, seeds);
    var e = { kind: 'template', label: label, params: built.params, roles: built.roles, plan: built.plan, agg: agg, score: _score(inputs, trial, objective, agg) };
    cache[k] = e;
    consider(e);
    report('layout');
    return e;
  }
  // 1) Screen every wall platform with default parameters, plus the trial's guide presets.
  walls.forEach(function(w) {
    var e = evalTemplate(Object.assign({}, opts.params || {}, { wallNode: w.node }), 'Wall on platform ' + w.node);
    if (e) screen.push({ label: e.label, wallNode: w.node, wave: e.score.wave, minWave: e.score.minWave });
  });
  guidePresetsForTrial(trial).forEach(function(g) {
    if (evaluations >= budget) return;
    evaluations++;
    var plan = _normalizePlan(g.build());
    var agg = simulateWorshipTdTrials(inputs, plan, simOpts, seeds);
    var e = { kind: 'preset', label: g.label, presetId: g.id, params: null, roles: null, plan: plan, agg: agg, score: _score(inputs, trial, objective, agg) };
    screen.push({ label: g.label, wallNode: null, wave: e.score.wave, minWave: e.score.minWave });
    consider(e);
    report('layout');
  });
  // 2) Coordinate descent on the best template (presets stay as fixed baselines).
  var lead = best.kind === 'template' ? best : Object.keys(cache).map(function(k) { return cache[k]; }).reduce(function(a, b) { return !a || _better(b.score, a.score) ? b : a; }, null);
  var tweaks = [
    function(P) { return [{ targetWave: P.targetWave - 10 }, { targetWave: P.targetWave + 10 }, { targetWave: P.targetWave - 20 }, { targetWave: P.targetWave + 20 }]; },
    function(P) { return [{ wallOffset: Math.max(0, P.wallOffset - 31) }, { wallOffset: P.wallOffset + 31 }]; },
    function(P) { return [{ wallCount: P.wallCount - 1 }, { wallCount: P.wallCount + 1 }, { wallCount: P.wallCount + 2 }]; },
    function(P) { return [{ dpsRank: P.dpsRank + 1 }, { dpsRank: P.dpsRank + 2 }, { dpsRank: Math.max(0, P.dpsRank - 1) }]; },
    function(P) { return [{ partyCount: Math.max(0, P.partyCount - 3) }, { partyCount: P.partyCount + 3 }]; },
    function(P) { return [{ keepKraken: P.keepKraken === 1 ? 2 : 1 }]; },
    function(P) { return [{ poisonCount: Math.max(1, P.poisonCount - 1) }, { poisonCount: P.poisonCount + 1 }]; },
    function(P) { return [{ phasePartyFrac: P.phasePartyFrac > 0.5 ? 0.34 : 2 / 3 }]; },
  ];
  var improved = true;
  while (lead && improved && evaluations < budget) {
    improved = false;
    for (var ti = 0; ti < tweaks.length && evaluations < budget; ti++) {
      var opts2 = tweaks[ti](lead.params);
      for (var oi = 0; oi < opts2.length && evaluations < budget; oi++) {
        var e2 = evalTemplate(Object.assign({}, lead.params, opts2[oi]), lead.label);
        if (e2 && _better(e2.score, lead.score)) { lead = e2; improved = true; }
      }
    }
  }
  // 3) Re-score the leaders with the final seed set.
  var finals = [best];
  if (lead && lead !== best) finals.push(lead);
  var winner = null;
  finals.forEach(function(e) {
    var agg = nFinal > nSeeds ? simulateWorshipTdTrials(inputs, e.plan, simOpts, finalSeeds) : e.agg;
    var sc = _score(inputs, trial, objective, agg);
    var f = Object.assign({}, e, { agg: agg, score: sc });
    if (!winner || _better(sc, winner.score)) winner = f;
  });
  evaluations += nFinal > nSeeds ? finals.length : 0;
  report('final');
  var detail = simulateWorshipTdRun(inputs, winner.plan, Object.assign({}, simOpts, { seed: finalSeeds[0] }));
  var saved = inputs.bestWaves[trial] || 0;
  return {
    ok: true,
    layout: true,
    trial: trial,
    objective: objective,
    kind: winner.kind,
    label: winner.label,
    presetId: winner.presetId || null,
    params: winner.params,
    roles: winner.roles,
    plan: winner.plan,
    score: winner.score,
    meanBestWave: winner.agg.meanBestWave,
    minBestWave: winner.agg.minBestWave,
    maxBestWave: winner.agg.maxBestWave,
    savedBest: saved,
    soulsPerHourNow: soulsPerHour(inputs, trial, saved),
    soulsPerHourPlan: soulsPerHour(inputs, trial, Math.max(saved, Math.floor(winner.agg.meanBestWave))),
    evaluations: evaluations,
    seeds: finalSeeds,
    screen: screen,
    startWave: startWave,
    saveAt: commonSavePoint(winner.agg.runs, startWave),
    detail: detail,
  };
}

// Campaign search over the game's save/resume checkpoints. Saving after a cleared boss wave banks
// unspent points plus 1.6667x every tower's 60% refund (about 100% of points spent), and resuming
// starts that wave with a full totem and a fresh build. Each segment therefore optimizes an
// independent build from the previous segment's latest save point common to every simulated seed,
// seeded with the previous segment's plan, and stops when no later save is reached.
// opts: optimizeWorshipTd opts plus { segments, start: 'checkpoint'|'fresh'|{wave, pts} }.
export function optimizeWorshipTdCampaign(inputs, opts, onProgress) {
  opts = opts || {};
  var trial = Number(opts.trial) || 0;
  var maxSegments = Math.max(1, opts.segments || 4);
  var cpWave = inputs.checkpointWaves[trial] || 0;
  var cur;
  if (opts.start && typeof opts.start === 'object') cur = { wave: Math.round(Number(opts.start.wave) || 0), pts: Number(opts.start.pts) || 0 };
  else if (opts.start === 'fresh' || !cpWave) cur = { wave: 0, pts: inputs.startPts };
  else cur = { wave: cpWave, pts: inputs.checkpointPts[trial] || 0 };
  var baseSeed = Number(opts.baseSeed) || 12345;
  var seedPlan = opts.seedPlan || null;
  var segments = [];
  var evaluations = 0;
  var last = null;
  for (var s = 0; s < maxSegments; s++) {
    var segIdx = s;
    var segStart = { wave: cur.wave, pts: cur.pts };
    var res = optimizeWorshipTd(inputs, Object.assign({}, opts, {
      trial: trial, objective: 'wave', start: segStart, seedPlan: seedPlan, baseSeed: baseSeed + s * 1013,
    }), function(pr) {
      if (!onProgress) return;
      onProgress(Object.assign({}, pr, {
        phase: 'campaign', segment: segIdx + 1, segments: maxSegments, segmentStart: segStart.wave,
        completed: segIdx * pr.total + pr.completed, total: maxSegments * pr.total,
      }));
    });
    if (!res.ok) { if (!segments.length) return res; break; }
    evaluations += res.evaluations;
    last = res;
    segments.push({
      index: s + 1,
      start: segStart,
      plan: res.plan,
      meanBestWave: res.meanBestWave,
      minBestWave: res.minBestWave,
      maxBestWave: res.maxBestWave,
      saveAt: res.saveAt,
      evaluations: res.evaluations,
      endReason: res.detail.endReason,
    });
    if (!res.saveAt) break;
    cur = res.saveAt;
    seedPlan = res.plan;
  }
  var lastSeg = segments[segments.length - 1];
  var finalBest = segments.reduce(function(m, g) { return Math.max(m, g.meanBestWave); }, 0);
  var saved = inputs.bestWaves[trial] || 0;
  return {
    ok: true,
    campaign: true,
    trial: trial,
    objective: 'wave',
    segments: segments,
    plan: lastSeg.plan,
    start: lastSeg.start,
    score: last.score,
    meanBestWave: finalBest,
    minBestWave: lastSeg.minBestWave,
    maxBestWave: Math.max.apply(null, segments.map(function(g) { return g.maxBestWave; })),
    savedBest: saved,
    soulsPerHourNow: soulsPerHour(inputs, trial, saved),
    soulsPerHourPlan: soulsPerHour(inputs, trial, Math.max(saved, Math.floor(finalBest))),
    evaluations: evaluations,
    seeds: last.seeds,
    detail: last.detail,
  };
}
