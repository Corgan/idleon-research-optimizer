// ===== COOKING LADLE (W4) =====
// Source-backed Cooking ladle generation, kitchen speed, meal costs, EXP balloons,
// No Meal Left Behind, and a daily ladle meal-leveling planner.

import { createStatContext } from '../../stat-context.js';
import { klaData, numCharacters, optionsListData, dreamData, charClassData, afkTargetData, afkStartData } from '../../../save/data.js';
import { getLOG } from '../../../formulas.js';
import { eventShopOwned, emporiumBonus, cloudBonus } from '../../../game-helpers.js';
import { rval } from '../../defs/skill-helpers.js';
import { computeAllSkillProwessDetail } from '../../defs/skill-exp.js';
import { talent, maxTalentBonus } from '../common/talent.js';
import { computeMealBonus, computeBoxReward } from '../common/stats.js';
import { achieveStatus } from '../common/achievement.js';
import { vaultUpgBonus } from '../common/vault.js';
import { computeCardLv } from '../common/cards.js';
import { computeStarSignBonus } from '../common/starSign.js';
import { bubbleValByKey, computeVialByKey } from '../w2/alchemy.js';
import { arcadeBonus } from '../w2/arcade.js';
import { votingBonusz } from '../w2/voting.js';
import { computeMSABonus } from './gaming.js';
import { mainframeBonus } from './lab.js';
import { computeStampBonusOfTypeX } from '../w1/stamp.js';
import { computeMonumentROGbonus, computeLampBonus, computeBUpg } from '../w5/hole.js';
import { computeArtifactBonus } from '../w5/sailing.js';
import { computeCropSC } from '../w6/farming.js';
import { computeWinBonus } from '../w6/summoning.js';
import { computeButtonBonus } from '../w7/minehead.js';
import { itemCount } from '../w7/royal-guardian.js';
import { computePrayerReal } from '../w3/prayer.js';
import { grimoireUpgPerLevel } from '../../data/mc/grimoire.js';
import { GRIMOIRE_NO_MULTI } from '../../data/game-constants.js';
import { companionBonusForSave } from '../../data/common/companions.js';
import { CLASS_TREES } from '../../data/common/talent.js';
import { MealINFO, AtomInfo, MapAFKtarget, MapDetails } from '../../data/game/customlists.js';
import { MONSTERS } from '../../data/game/monsters.js';
import { ITEMS } from '../../data/game/items.js';

export var COOKING_SKILL_IDX = 10;
export var LADLE_ITEM = 'Ladle';
export var EXP_BALLOONS = ['ExpBalloon1', 'ExpBalloon2', 'ExpBalloon3'];
export var AFK_CLAIM_CAP_SECONDS = 36000;
var MEAL_KEYS = ['Mcook', 'zMealFarm', 'KitchenEff'];

function _num(value) {
  if (value && typeof value === 'object' && value.val != null) return Number(value.val) || 0;
  return Number(value) || 0;
}

function _safe(fn) {
  try {
    var args = [];
    for (var i = 1; i < arguments.length; i++) args.push(arguments[i]);
    return _num(fn.apply(null, args));
  } catch (e) {
    return 0;
  }
}

function _ctx(S, ci) {
  return createStatContext({ charIdx: ci || 0, saveData: S, layer1: { skillType: 'Cooking' } });
}

function _ola(S, idx) {
  var ola = S.olaData || optionsListData || [];
  return Number(ola[idx]) || 0;
}

function _grimoireBonus(idx, S) {
  var level = Number(S.grimoireData && S.grimoireData[idx]) || 0;
  if (level <= 0) return 0;
  var value = level * grimoireUpgPerLevel(idx);
  if (!GRIMOIRE_NO_MULTI.has(idx)) value *= 1 + _grimoireBonus(36, S) / 100;
  return value;
}

function _vote(idx, ctx, S) {
  var multi = 1;
  try { multi = Number(ctx.resolve('voting-multi').val) || 1; } catch (e) {}
  return _safe(votingBonusz, idx, multi, S);
}

export function mealLevels(S) {
  var raw = S.mealsData && S.mealsData[0] || [];
  var out = [];
  for (var i = 0; i < raw.length; i++) out.push(Number(raw[i]) || 0);
  return out;
}

export function mealStocks(S) {
  var raw = S.mealsData && S.mealsData[2] || [];
  var out = [];
  for (var i = 0; i < raw.length; i++) out.push(Number(raw[i]) || 0);
  return out;
}

export function mealName(idx) {
  return String(MealINFO[idx] && MealINFO[idx][0] || 'Meal ' + idx).replace(/_/g, ' ');
}

export function mealRequirement(idx) {
  return Number(MealINFO[idx] && MealINFO[idx][1]) || 0;
}

export function characterName(S, ci) {
  return String(S.charNames && S.charNames[ci] || 'Character ' + (ci + 1));
}

export function characterCount(S) {
  return Math.max(numCharacters || 0, S.charNames ? S.charNames.length : 0);
}

// ---------------- Ladle generation ----------------

// ArbitraryCode BaseLadlePerDay: 15 * floor(max((eff / 1000)^(0.25 + prowess), 1)).
export function ladlesPerDay(efficiency, prowess) {
  var exponent = 0.25 + Math.max(0, Math.min(0.1, Number(prowess) || 0));
  return 15 * Math.floor(Math.max(Math.pow((Number(efficiency) || 0) / (10 * 100), exponent), 1));
}

export function ladleBreakpoints(efficiency, prowess, count) {
  var exponent = 0.25 + Math.max(0, Math.min(0.1, Number(prowess) || 0));
  var tier = ladlesPerDay(efficiency, prowess) / 15;
  var rows = [];
  for (var n = 1; n <= (count || 3); n++) {
    var nextTier = tier + n;
    var required = 1000 * Math.pow(nextTier, 1 / exponent);
    rows.push({
      ladlesPerDay: 15 * nextTier,
      efficiency: required,
      multiplier: required / Math.max(1e-300, Number(efficiency) || 0),
    });
  }
  return rows;
}

// How ladles/day respond to efficiency. The floored tier (Ladle multi) adds +15 base ladles/day per step, so
// the next tier only matters when the tier is small; otherwise the response is effectively continuous.
export function ladleTierOutlook(efficiency, prowess) {
  var eff = Math.max(0, Number(efficiency) || 0);
  var exponent = 0.25 + Math.max(0, Math.min(0.1, Number(prowess) || 0));
  var base = ladlesPerDay(eff, prowess);
  var tier = base / 15;
  var next = ladleBreakpoints(eff, prowess, 1)[0];
  var plus10 = ladlesPerDay(eff * 1.1, prowess);
  var onePctTier = Math.ceil(tier * 1.01);
  var effFor1Pct = eff > 0 ? 1000 * Math.pow(onePctTier, 1 / exponent) / eff - 1 : Infinity;
  return {
    tier: tier,
    basePerDay: base,
    next: next,
    nextTierGainPct: 100 / tier,
    nextTierEffPct: (next.multiplier - 1) * 100,
    plus10EffGainPct: (plus10 / Math.max(1e-300, base) - 1) * 100,
    effPctForPlus1Pct: effFor1Pct * 100,
    smallTier: tier <= 100,
  };
}

// Expected integer ladles from one claim of raw value v with the Post Office 19c doubling chance.
// The claim builds floor(1 + (1000 + randInt(0,100)) / (1100 - 19c)) ladle entries, but each entry is
// assigned to AFKrewMapz.Ladle, so only the last independently rolled entry is credited.
export function ladleClaimExpectation(v, doubleChancePct) {
  var p = Math.max(0, Math.min(1, (Number(doubleChancePct) || 0) / 100));
  v = Math.max(0, Number(v) || 0);
  if (v >= 1) return (1 - p) * Math.floor(v) + p * Math.floor(2 * v);
  if (v > 0.5) return v * (1 + p) + (1 - v) * p;
  return v * (1 + p);
}

// Guaranteed ladles from one claim: no Post Office doubling, and sub-1 claims may round to nothing.
export function ladleClaimMinimum(v) {
  v = Math.max(0, Number(v) || 0);
  return v >= 1 ? Math.floor(v) : 0;
}

// Claims before the next daily reset. Each claimer claims every `claimHours`, with the final claim
// just before reset; the earliest claim also collects `pendingHours` already accrued. The game only
// grants a claim after more than 120 seconds away, and Prayer 2 credits at most `capHours` per claim.
// When pending time would be lost to the cap, an immediate claim is added first.
export function ladleClaimPlan(claimers, windowHours, opts) {
  opts = opts || {};
  var W = Math.max(0, Number(windowHours) || 0);
  var claims = [];
  var perChar = [];
  var minTotal = 0;
  var expTotal = 0;
  for (var c = 0; c < (claimers || []).length; c++) {
    var cl = claimers[c] || {};
    var rate = Math.max(0, Number(cl.rawPerHour) || 0);
    var every = Number(cl.claimHours) > 0 ? Number(cl.claimHours) : 24;
    var cap = Number(cl.capHours) > 0 ? Number(cl.capHours) : Infinity;
    var pending = opts.ignorePending ? 0 : Math.max(0, Number(cl.pendingHours) || 0);
    var segs = [];
    if (W > 0) {
      var n = Math.max(1, Math.ceil(W / every - 1e-9));
      var first = W - (n - 1) * every;
      if (pending > 0 && pending + first > cap) {
        segs.push({ at: 0, hours: pending, now: true });
        pending = 0;
      }
      for (var k = 0; k < n; k++) {
        var end = first + k * every;
        segs.push({ at: end, hours: (k === 0 ? first + pending : every) });
      }
    } else if (pending > 0) {
      segs.push({ at: 0, hours: pending, now: true });
    }
    var row = { idx: c, charIdx: cl.charIdx, name: cl.name, claims: [], minLadles: 0, expectedLadles: 0 };
    for (var s = 0; s < segs.length; s++) {
      var seg = segs[s];
      var credited = Math.min(seg.hours, cap);
      var raw = seg.hours * 3600 > 120 ? rate * credited : 0;
      var claim = {
        claimer: c, charIdx: cl.charIdx, name: cl.name,
        atHours: seg.at, hours: seg.hours, creditedHours: credited, now: !!seg.now,
        raw: raw, min: ladleClaimMinimum(raw), expected: ladleClaimExpectation(raw, cl.doubleChance),
      };
      row.claims.push(claim);
      row.minLadles += claim.min;
      row.expectedLadles += claim.expected;
      claims.push(claim);
    }
    minTotal += row.minLadles;
    expTotal += row.expectedLadles;
    perChar.push(row);
  }
  claims.sort(function(a, b) { return a.atHours - b.atHours || a.claimer - b.claimer; });
  return { windowHours: W, claims: claims, perChar: perChar, minLadles: minTotal, expectedLadles: expTotal };
}

export function cookingExpReq(level) {
  var L = Number(level) || 0;
  return (15 + Math.pow(L, 2) + 15 * L) * Math.pow(1.225 - Math.min(0.18, 0.135 * L / (L + 50)), L) - 30;
}

export function balloonGain(balloonKey, level, expMulti) {
  var id = Number(ITEMS[balloonKey] && ITEMS[balloonKey].ID) || 0;
  return id * ((Number(level) || 0) + 1) * (Number(expMulti) || 0);
}

// Uses one balloon at a time: each use reads the current level, and overflow carries.
export function balloonsToLevel(level, exp, targetLevel, expMulti, balloonKey) {
  var L = Number(level) || 0;
  var E = Math.max(0, Number(exp) || 0);
  var target = Math.max(L, Number(targetLevel) || 0);
  var used = 0;
  var limit = 0;
  while (L < target && limit++ < 100000) {
    var req = cookingExpReq(L);
    if (E >= req) { E -= req; L++; continue; }
    var gain = balloonGain(balloonKey || 'ExpBalloon1', L, expMulti);
    if (!(gain > 0)) return { balloons: Infinity, level: L, exp: E };
    var n = Math.ceil((req - E) / gain);
    used += n;
    E += n * gain;
  }
  while (E >= cookingExpReq(L) && limit++ < 100000) { E -= cookingExpReq(L); L++; }
  return { balloons: used, level: L, exp: E };
}

function _prayerCapped(S, ci) {
  return _safe(computePrayerReal, 2, 1, ci, S) > 2;
}

// Spends up to `count` balloons one at a time and reports the resulting Cooking level.
export function levelsFromBalloons(level, exp, count, expMulti, balloonKey) {
  var L = Number(level) || 0;
  var E = Math.max(0, Number(exp) || 0);
  var left = Math.max(0, Math.floor(Number(count) || 0));
  var limit = 0;
  while (limit++ < 100000) {
    var req = cookingExpReq(L);
    if (E >= req) { E -= req; L++; continue; }
    var gain = balloonGain(balloonKey || 'ExpBalloon1', L, expMulti);
    if (!(gain > 0) || left <= 0) break;
    var need = Math.ceil((req - E) / gain);
    if (need > left) { E += left * gain; left = 0; break; }
    left -= need;
    E += need * gain;
  }
  return { level: L, exp: E, used: Math.max(0, Math.floor(Number(count) || 0)) - left, left: left };
}

// Shares `count` balloons across characters to keep Cooking levels even: each next level-up goes to the
// lowest-level character (ties: fewest balloons to its next level, then lowest index). When the
// remainder cannot buy that level, it is all given to that character as partial EXP.
export function splitBalloons(chars, count, balloonKey) {
  var left = Math.max(0, Math.floor(Number(count) || 0));
  var out = (chars || []).map(function(c) {
    if (!c) return null;
    var lv = levelsFromBalloons(c.level, c.exp, 0, c.expMulti, balloonKey);
    return { level: lv.level, exp: lv.exp, expMulti: Number(c.expMulti) || 0, used: 0, startLevel: Number(c.level) || 0, need: 0 };
  });
  function needFor(o) { return balloonsToLevel(o.level, o.exp, o.level + 1, o.expMulti, balloonKey).balloons; }
  out.forEach(function(o) { if (o) o.need = needFor(o); });
  var limit = 0;
  while (left > 0 && limit++ < 200000) {
    var pick = -1;
    for (var i = 0; i < out.length; i++) {
      var o = out[i];
      if (!o || !isFinite(o.need)) continue;
      if (pick < 0) { pick = i; continue; }
      var p = out[pick];
      if (o.level < p.level || (o.level === p.level && o.need < p.need)) pick = i;
    }
    if (pick < 0) break;
    var t = out[pick];
    var give = Math.min(left, t.need);
    var r = levelsFromBalloons(t.level, t.exp, give, t.expMulti, balloonKey);
    t.level = r.level; t.exp = r.exp; t.used += give; left -= give;
    t.need = needFor(t);
  }
  return {
    chars: out.map(function(o) { return o && { startLevel: o.startLevel, level: o.level, exp: o.exp, used: o.used }; }),
    used: Math.max(0, Math.floor(Number(count) || 0)) - left,
    left: left,
  };
}

export function cookingLadleStats(S, ci, opts) {
  opts = opts || {};
  var ctx = opts.ctx || _ctx(S, ci);
  var effNode = ctx.resolve('skill-efficiency');
  var afkNode = ctx.resolve('skill-afk');
  var expNode = ctx.resolve('skill-exp');
  var prowNode = computeAllSkillProwessDetail(ci, ctx);
  var efficiency = Number(effNode.val) || 0;
  var prowess = Number(prowNode.val) || 0;
  var afk = Number(afkNode.val) || 0;
  var expMulti = Number(expNode.val) || 0;
  var basePerDay = ladlesPerDay(efficiency, prowess);
  var ladleMulti = basePerDay / 15;
  // In-game AFK panel LADLES/DAY: CookingBaseLadlePerDay × AFKgainrates("Cooking"), before claim rolls.
  var panelPerDay = basePerDay * afk;
  var exponent = 0.25 + Math.max(0, Math.min(0.1, prowess));
  var doubleChance = _num(computeBoxReward(ci, '19c'));
  var capped = _prayerCapped(S, ci);
  var claimHours = Number(opts.claimHours) > 0 ? Number(opts.claimHours) : 24;
  var claimSeconds = claimHours * 3600;
  var effectiveSeconds = capped ? Math.min(claimSeconds, AFK_CLAIM_CAP_SECONDS) : claimSeconds;
  var rawPerClaim = basePerDay * afk * effectiveSeconds / 86400;
  var perClaim = ladleClaimExpectation(rawPerClaim, doubleChance);
  var perDay = perClaim * 24 / claimHours;
  var minPerClaim = ladleClaimMinimum(rawPerClaim);
  var rawPerHour = basePerDay * afk / 24;
  var claimCapHours = capped ? AFK_CLAIM_CAP_SECONDS / 3600 : Infinity;
  var minDay = ladleClaimPlan([{ rawPerHour: rawPerHour, doubleChance: doubleChance, capHours: claimCapHours, claimHours: claimHours }], 24);
  var cookingNow = (afkTargetData && afkTargetData[ci]) === 'Cooking';
  var afkStart = afkStartData && afkStartData[ci];
  var globalTime = Number(S.timeAwayData && S.timeAwayData.GlobalTime) || 0;
  // Pending AFK Cooking time = TimeAway.GlobalTime - TimeAway.Player (PTimeAway_X × 1000).
  var pendingHours = cookingNow && afkStart != null && globalTime > 0 ? Math.max(0, (globalTime - afkStart) / 3600) : 0;
  var level = Number(S.lv0AllData && S.lv0AllData[ci] && S.lv0AllData[ci][COOKING_SKILL_IDX]) || 0;
  var exp = Number(S.exp0AllData && S.exp0AllData[ci] && S.exp0AllData[ci][COOKING_SKILL_IDX]) || 0;
  // AFK claim: Time/3600 * AFK * 100 * ExpMulti(10).
  var expPerHourRaw = afk * 100 * expMulti;
  return {
    charIdx: ci,
    name: characterName(S, ci),
    afkTarget: afkTargetData && afkTargetData[ci] || '',
    cooking: (afkTargetData && afkTargetData[ci]) === 'Cooking',
    efficiency: efficiency,
    prowess: prowess,
    afk: afk,
    expMulti: expMulti,
    ladleMulti: ladleMulti,
    basePerDay: basePerDay,
    panelPerDay: panelPerDay,
    doubleChance: doubleChance,
    claimCapped: capped,
    claimHours: claimHours,
    effectiveClaimSeconds: effectiveSeconds,
    rawPerClaim: rawPerClaim,
    perClaim: perClaim,
    perDay: perDay,
    perHour: perDay / 24,
    minPerClaim: minPerClaim,
    minPerDay: minDay.minLadles,
    rawPerHour: rawPerHour,
    claimCapHours: claimCapHours,
    pendingHours: pendingHours,
    pendingKnown: cookingNow && afkStart != null && globalTime > 0,
    breakpoints: ladleBreakpoints(efficiency, prowess, 3),
    outlook: ladleTierOutlook(efficiency, prowess),
    level: level,
    exp: exp,
    expReq: cookingExpReq(level),
    expPerHour: expPerHourRaw,
    nextLevelBalloons: balloonsToLevel(level, exp, level + 1, expMulti, 'ExpBalloon1').balloons,
    trees: {
      efficiency: effNode, afk: afkNode, exp: expNode, prowess: prowNode,
      ladles: {
        name: 'Ladles / day (in-game AFK panel)', val: panelPerDay, fmt: 'raw', children: [
          { name: 'Base ladles / day', val: basePerDay, fmt: 'raw', note: '15 × Ladle Multi', children: [
            { name: 'Ladle Multi (Bonus Ladles from Efficiency)', val: ladleMulti, fmt: 'x',
              note: 'floor(max((eff / 1000)^(0.25 + prowess), 1))', children: [
                { name: 'Cooking efficiency', val: efficiency, fmt: 'raw' },
                { name: 'Exponent 0.25 + prowess', val: exponent, fmt: 'raw' },
              ] },
          ] },
          { name: 'AFK gain rate', val: afk, fmt: 'x' },
        ],
      },
      claims: {
        name: 'Expected ladles / day from claims', val: perDay, fmt: 'raw', children: [
          { name: 'Ladles / day (in-game AFK panel)', val: panelPerDay, fmt: 'raw' },
          { name: 'Claim window', val: effectiveSeconds / 86400, fmt: 'x', note: capped ? 'Prayer 2 caps claims at 10h' : claimHours + 'h claim' },
          { name: 'Ladles per claim', val: rawPerClaim, fmt: 'raw', note: 'floored when credited; below 1 may give nothing' },
          { name: 'Post Office 19c doubling chance', val: doubleChance, fmt: 'pct', note: 'claims above 0.5 roll a 2x; each claim then floors' },
          { name: 'Expected ladles per claim', val: perClaim, fmt: 'raw' },
          { name: 'Claims per day', val: 24 / claimHours, fmt: 'x' },
          { name: 'Guaranteed ladles / day', val: minDay.minLadles, fmt: 'raw', note: minDay.claims.length + ' claims, last one before reset' },
        ],
      },
    },
  };
}

// ---------------- CookingSPEED ----------------

// DNSM.CalcTalentMAP["49_4"]: maps where the last Blood Berserker-tree character has 100M kills.
export function bbHundredMillionKillMaps(S, activeCharIdx) {
  var dt1 = -1;
  var count = characterCount(S);
  for (var ci = 0; ci < count; ci++) {
    var tree = CLASS_TREES[Number(charClassData && charClassData[ci]) || 0] || [];
    if (tree[3] === 10) dt1 = ci;
  }
  if (dt1 < 0) return { count: 0, charIdx: -1 };
  var activeKla = klaData[activeCharIdx || 0] || [];
  var kla = klaData[dt1] || [];
  var maps = 0;
  for (var r = 0; r < MapAFKtarget.length; r++) {
    var monster = MONSTERS[MapAFKtarget[r]];
    if (!monster) continue;
    if (!(r < activeKla.length)) break;
    if (monster.AFKtype !== 'FIGHTING') continue;
    var required = Number(MapDetails[r] && MapDetails[r][0] && MapDetails[r][0][0]) || 0;
    var row = kla[r];
    var left = Number(Array.isArray(row) ? row[0] : row) || 0;
    if (required - left >= 1e8) maps++;
  }
  return { count: maps, charIdx: dt1 };
}

export function talentEnh146(S, ci) {
  var gate = _safe(maxTalentBonus, 49, ci, S);
  var maps = bbHundredMillionKillMaps(S, ci);
  return { val: gate >= 125 ? Math.pow(1.1, maps.count) : 0, gate: gate, maps: maps.count, bbCharIdx: maps.charIdx };
}

function _mealCoefficients(S, ci) {
  var coef = {};
  var levels = S.mealsData && S.mealsData[0] || [];
  for (var k = 0; k < MEAL_KEYS.length; k++) coef[MEAL_KEYS[k]] = [];
  for (var mi = 0; mi < MealINFO.length; mi++) {
    var key = MealINFO[mi] && MealINFO[mi][5];
    if (MEAL_KEYS.indexOf(key) < 0) continue;
    var single = [];
    for (var j = 0; j < Math.max(levels.length, MealINFO.length); j++) single.push(j === mi ? 1 : 0);
    var clone = Object.assign({}, S, { mealsData: [single].concat((S.mealsData || []).slice(1)) });
    var val = _safe(computeMealBonus, key, clone, ci);
    if (val) coef[key].push({ idx: mi, perLevel: val });
  }
  return coef;
}

function _mealSum(coefList, levels) {
  var total = 0;
  for (var i = 0; i < coefList.length; i++) total += coefList[i].perLevel * (levels[coefList[i].idx] || 0);
  return total;
}

function _countAtLeast(levels, min) {
  var n = 0;
  for (var i = 0; i < levels.length; i++) if (levels[i] >= min) n++;
  return n;
}

function _levelSum(levels) {
  var total = 0;
  for (var i = 0; i < levels.length; i++) total += levels[i];
  return Math.max(0, total);
}

// Builds every save-backed CookingSPEED input once so meal-level changes can be re-evaluated cheaply.
export function cookingSpeedModel(S, ci, opts) {
  opts = opts || {};
  ci = ci || 0;
  var ctx = opts.ctx || _ctx(S, ci);
  var t59Own = _safe(rval, talent, 59, ctx);
  var t59 = t59Own > 0 ? t59Own : _safe(maxTalentBonus, 59, ci, S);
  var enh = talentEnh146(S, ci);
  var farmLv = Number(S.lv0AllData && S.lv0AllData[ci] && S.lv0AllData[ci][16]) || 0;
  var holes9 = S.holesData && S.holesData[9] || [];
  var bupg56Val = Math.pow(1.3, Math.floor(getLOG(Number(holes9[2]) || 0)));
  var atomLv = Number(S.atomsData && S.atomsData[8]) || 0;
  var gems120 = Number(S.gemItemsData && S.gemItemsData[120]) || 0;
  var achTerm = Math.min(6 * _safe(computeCardLv, 'Boss4A', S)
    + (20 * _safe(achieveStatus, 225, S) + 10 * _safe(achieveStatus, 224, S)), 100);
  var model = {
    charIdx: ci,
    t59: t59,
    t59Source: t59Own > 0 ? 'logged-in character' : 'account best',
    cropSC3: _safe(computeCropSC, 3, S),
    enh146: enh,
    eventShop53: eventShopOwned(53, S.cachedEventShopStr) ? 1 : 0,
    gems120: gems120,
    vote13: _vote(13, ctx, S),
    vault54: _safe(vaultUpgBonus, 54, S),
    farmLv: farmLv,
    mealSpdzBase: _safe(bubbleValByKey, 'MealSpdz', ci, S),
    atom8PerLevel: atomLv * (Number(AtomInfo[8] && AtomInfo[8][4]) || 0),
    msa1: _safe(computeMSABonus, 1, S),
    art13: _safe(computeArtifactBonus, 13, ci, { saveData: S }),
    button7: _safe(computeButtonBonus, 7, S),
    arcade28: _safe(arcadeBonus, 28, S),
    vialTurtle: _safe(computeVialByKey, '6turtle', S, ci),
    vialMealCook: _safe(computeVialByKey, 'MealCook', S, ci),
    stampMealCook: _safe(computeStampBonusOfTypeX, 'MealCook', S, ci),
    mf114: _safe(mainframeBonus, 114, S),
    star58: _safe(computeStarSignBonus, 'CookSpd', ci, S),
    win15: _safe(computeWinBonus, 15, { charIdx: ci }, S),
    monument: _safe(computeMonumentROGbonus, 0, 2, S),
    bupg56: _safe(computeBUpg, 56, bupg56Val, S),
    cardW6c1: _safe(computeCardLv, 'w6c1', S),
    lamp: _safe(computeLampBonus, 0, 0, S),
    vialCookSpd: _safe(computeVialByKey, '6CookSpd', S, ci),
    mf100: _safe(mainframeBonus, 100, S),
    achTerm: achTerm,
    mealCoef: _mealCoefficients(S, ci),
    kitchens: [],
  };
  var rows = S.cookingData || [];
  for (var k = 0; k < rows.length; k++) {
    var row = rows[k] || [];
    model.kitchens.push({
      idx: k,
      state: Number(row[0]) || 0,
      meal: Number(row[1]),
      unlocked: (Number(row[0]) || 0) !== 0,
      dn1: gems120 > k ? 2 : 0,
      speedLv: Number(row[6]) || 0,
      fireLv: Number(row[7]) || 0,
      luckLv: Number(row[8]) || 0,
    });
  }
  return model;
}

// Ordered CookingSPEED factors (source line order) for one kitchen and meal-level vector.
export function cookingSpeedTerms(model, k, levels) {
  var kit = model.kitchens[k] || { dn1: 0, speedLv: 0, fireLv: 0, luckLv: 0 };
  var mcook = _mealSum(model.mealCoef.Mcook, levels);
  var zFarm = _mealSum(model.mealCoef.zMealFarm, levels);
  var kEff = _mealSum(model.mealCoef.KitchenEff, levels);
  var levelSum = _levelSum(levels);
  var meals11 = _countAtLeast(levels, 11);
  var meals30 = _countAtLeast(levels, 30);
  var upgradeSteps = Math.floor((kit.speedLv + (kit.fireLv + kit.luckLv)) / 10);
  return [
    ['Base', 10, 'raw', ''],
    ['Talent 59 Blood Marrow per total meal level', 1 + Math.pow(Math.min(1.012, 1 + model.t59 / 100), levelSum) / 100,
      'x', model.t59Source + ' ' + model.t59.toFixed(3) + '% ^ ' + levelSum + ' meal levels'],
    ['Crop Scientist 3', Math.max(1, model.cropSC3), 'x', 'max(1, CropSC 3)'],
    ['Talent 146 Apocalypse Chow (enhanced)', Math.max(1, model.enh146.val), 'x',
      'Talent 49 ' + model.enh146.gate.toFixed(1) + (model.enh146.gate >= 125 ? ' ≥ 125: 1.1^' + model.enh146.maps + ' maps with 100M kills' : ' < 125')],
    ['Event Shop 53', 1 + model.eventShop53, 'x', model.eventShop53 ? 'owned' : 'not owned'],
    ['Gem Shop kitchen doubler', 1 + kit.dn1, 'x', 'Gem item 120 = ' + model.gems120],
    ['Vote 13', 1 + model.vote13 / 100, 'x', ''],
    ['Vault 54', 1 + model.vault54 / 100, 'x', ''],
    ['Meal zMealFarm × Farming level', 1 + zFarm * Math.ceil((model.farmLv + 1) / 50) / 100, 'x',
      zFarm.toFixed(2) + ' × ceil((' + model.farmLv + ' + 1) / 50)'],
    ['Bubble MealSpdz', Math.max(1, Math.pow(model.mealSpdzBase, meals11)), 'x', model.mealSpdzBase.toFixed(4) + ' ^ ' + meals11 + ' meals Lv 11+'],
    ['Atom 8', Math.max(1, Math.pow(1 + model.atom8PerLevel / 100, meals30)), 'x', '(1 + ' + model.atom8PerLevel + '%) ^ ' + meals30 + ' meals Lv 30+'],
    ['Gaming MSA 1', 1 + model.msa1 / 100, 'x', ''],
    ['Kitchen speed level', 1 + kit.speedLv / 10, 'x', 'Lv ' + kit.speedLv],
    ['Artifact 13', 1 + model.art13 / 100, 'x', ''],
    ['Minehead button 7', 1 + model.button7 / 100, 'x', ''],
    ['Arcade 28', 1 + model.arcade28 / 100, 'x', ''],
    ['Vial 6turtle', 1 + model.vialTurtle / 100, 'x', ''],
    ['Vial MealCook', 1 + model.vialMealCook / 100, 'x', ''],
    ['Stamp MealCook + Mainframe 114', 1 + (model.stampMealCook + Math.max(0, model.mf114)) / 100, 'x', 'Jewel 114 ' + Math.max(0, model.mf114).toFixed(1) + '% (× floor(total kitchen levels / 25))'],
    ['Meal Mcook', 1 + mcook / 100, 'x', mcook.toFixed(2) + '%'],
    ['Star Sign 58', 1 + model.star58 / 100, 'x', ''],
    ['Summoning win bonus 15', 1 + model.win15 / 100, 'x', ''],
    ['Monument 0 bonus 2', 1 + model.monument / 100, 'x', ''],
    ['Cavern upgrade 56', Math.max(1, model.bupg56), 'x', ''],
    ['Card w6c1 × 5', 1 + 5 * model.cardW6c1 / 100, 'x', 'Lv ' + model.cardW6c1],
    ['Lamp 0', 1 + model.lamp / 100, 'x', ''],
    ['Vial 6CookSpd', 1 + model.vialCookSpd / 100, 'x', ''],
    ['Mainframe 100', Math.max(1, model.mf100), 'x', ''],
    ['Boss4A card + achievements 224/225', 1 + model.achTerm / 100, 'x', 'min(100, ' + model.achTerm + ')'],
    ['Meal KitchenEff × kitchen upgrades', 1 + kEff * upgradeSteps / 100, 'x', kEff.toFixed(2) + ' × floor(' + (kit.speedLv + kit.fireLv + kit.luckLv) + ' / 10)'],
  ];
}

export function cookingSpeed(model, k, levels) {
  var terms = cookingSpeedTerms(model, k, levels);
  var value = 1;
  for (var i = 0; i < terms.length; i++) value *= terms[i][1];
  return value;
}

export function cookingSpeedDetail(model, k, levels) {
  var terms = cookingSpeedTerms(model, k, levels);
  var value = 1;
  var children = [];
  for (var i = 0; i < terms.length; i++) {
    value *= terms[i][1];
    children.push({ name: terms[i][0], val: terms[i][1], fmt: terms[i][2], note: terms[i][3] || undefined });
  }
  return { name: 'Kitchen ' + (k + 1) + ' meal speed /hr', val: value, fmt: 'raw', children: children };
}

export function totalKitchenSpeed(model, levels) {
  var total = 0;
  for (var k = 0; k < model.kitchens.length; k++) {
    if (model.kitchens[k].unlocked) total += cookingSpeed(model, k, levels);
  }
  return total;
}

// Total meal speed across every unlocked kitchen, with each kitchen's exact term product as a child.
export function totalKitchenSpeedDetail(model, levels) {
  var total = 0;
  var children = [];
  for (var k = 0; k < model.kitchens.length; k++) {
    if (!model.kitchens[k].unlocked) continue;
    var detail = cookingSpeedDetail(model, k, levels);
    total += detail.val;
    children.push(detail);
  }
  return { name: 'Total kitchen meal speed /hr', val: total, fmt: 'raw', note: children.length + ' unlocked kitchen' + (children.length === 1 ? '' : 's'), children: children };
}

// Fast total kitchen speed: meal-dependent factors (Talent 59 total levels, zMealFarm, MealSpdz Lv 11+,
// Atom 8 Lv 30+, Mcook, KitchenEff) multiply per-kitchen constants evaluated once at zero meal levels.
export function kitchenSpeedEvaluator(model, mealCount) {
  var n = Math.max(mealCount || 0, MealINFO.length);
  var zeros = [];
  for (var i = 0; i < n; i++) zeros.push(0);
  var kitchens = [];
  for (var k = 0; k < model.kitchens.length; k++) {
    var kit = model.kitchens[k];
    if (!kit.unlocked) continue;
    kitchens.push({
      base: cookingSpeed(model, k, zeros) / 1.01,
      steps: Math.floor((kit.speedLv + (kit.fireLv + kit.luckLv)) / 10),
    });
  }
  var per = { Mcook: new Float64Array(n), zMealFarm: new Float64Array(n), KitchenEff: new Float64Array(n) };
  MEAL_KEYS.forEach(function(key) {
    (model.mealCoef[key] || []).forEach(function(c) { if (c.idx < n) per[key][c.idx] += c.perLevel; });
  });
  var t59Base = Math.min(1.012, 1 + model.t59 / 100);
  var farmMul = Math.ceil((model.farmLv + 1) / 50);
  var atomBase = 1 + model.atom8PerLevel / 100;
  function aggregate(levels) {
    var a = { sum: 0, mcook: 0, zFarm: 0, kEff: 0, m11: 0, m30: 0 };
    for (var i = 0; i < levels.length; i++) {
      var L = levels[i] || 0;
      a.sum += L;
      if (i < n) { a.mcook += per.Mcook[i] * L; a.zFarm += per.zMealFarm[i] * L; a.kEff += per.KitchenEff[i] * L; }
      if (L >= 11) a.m11++;
      if (L >= 30) a.m30++;
    }
    return a;
  }
  function shift(a, m, from, to) {
    var d = to - from;
    return {
      sum: a.sum + d,
      mcook: a.mcook + (m < n ? per.Mcook[m] * d : 0),
      zFarm: a.zFarm + (m < n ? per.zMealFarm[m] * d : 0),
      kEff: a.kEff + (m < n ? per.KitchenEff[m] * d : 0),
      m11: a.m11 + (to >= 11 ? 1 : 0) - (from >= 11 ? 1 : 0),
      m30: a.m30 + (to >= 30 ? 1 : 0) - (from >= 30 ? 1 : 0),
    };
  }
  function speed(a) {
    var shared = (1 + Math.pow(t59Base, Math.max(0, a.sum)) / 100)
      * (1 + a.zFarm * farmMul / 100)
      * Math.max(1, Math.pow(model.mealSpdzBase, a.m11))
      * Math.max(1, Math.pow(atomBase, a.m30))
      * (1 + a.mcook / 100);
    var total = 0;
    for (var k = 0; k < kitchens.length; k++) total += kitchens[k].base * (1 + a.kEff * kitchens[k].steps / 100);
    return shared * total;
  }
  return { aggregate: aggregate, shift: shift, speed: speed };
}

// ---------------- Meal costs and caps ----------------

export function mealMaxLevel(S) {
  var art17 = _safe(computeArtifactBonus, 17, 0, { saveData: S });
  var ninja = S.ninjaData && S.ninjaData[102] && S.ninjaData[102][9];
  var emp20 = _safe(emporiumBonus, 20, ninja);
  var emp21 = _safe(emporiumBonus, 21, ninja);
  var lore5 = (Number(S.spelunkData && S.spelunkData[0] && S.spelunkData[0][5]) || 0) >= 1 ? 1 : 0;
  var grim26 = _grimoireBonus(26, S);
  return Math.round(30 + (art17 + (10 * emp20 + (10 * emp21 + 30 * lore5)) + Math.min(20, grim26)));
}

export function mealCostInputs(S) {
  return {
    comp162: companionBonusForSave(162, S),
    ach233: _safe(achieveStatus, 233, S),
    cloud33: _safe(cloudBonus, 33, S.weeklyBossData),
    ola193: _ola(S, 193),
    dream11: Number(dreamData && dreamData[11]) || 0,
  };
}

// CookingR("CookingMenuMealCosts"): literal source product order.
export function mealLevelCost(level, inputs, ola193) {
  var L = Number(level) || 0;
  var discountDays = ola193 == null ? inputs.ola193 : ola193;
  return Math.max(0.001, 1 / Math.max(1, 5 * inputs.comp162))
    * Math.pow(10, 22 * Math.floor((L + 1e3) / 1111))
    * (1 / Math.min(5, Math.max(1, 1 + 10 * inputs.ach233 / 100)))
    * Math.max(0.001, Math.pow(Math.max(0.58, 0.8 - 0.22 * inputs.cloud33), Math.min(discountDays, inputs.dream11)))
    * (10 + (L + Math.pow(L, 2)))
    * Math.pow(1.2 + 0.05 * L, L)
    * Math.pow(1 + 0.4 * Math.floor((L + 1e3) / 1111), L);
}

export function ladleMultiplier(S, ci, ctx) {
  ctx = ctx || _ctx(S, ci);
  var t148 = _safe(rval, talent, 148, ctx);
  return { talent148: t148, multiplier: 1 + t148 / 100 };
}

export function mealsPerLadle(mealIdx, kitchenSpeed, ladleMulti) {
  var req = mealRequirement(mealIdx);
  return req > 0 ? kitchenSpeed * ladleMulti / req : 0;
}

export function ladlesForMealLevel(mealIdx, level, stock, kitchenSpeed, ladleMulti, inputs, ola193) {
  var cost = mealLevelCost(level, inputs, ola193);
  var perLadle = mealsPerLadle(mealIdx, kitchenSpeed, ladleMulti);
  var deficit = Math.max(0, cost - (Number(stock) || 0));
  return { cost: cost, deficit: deficit, ladles: perLadle > 0 ? deficit / perLadle : Infinity };
}

// ---------------- No Meal Left Behind ----------------

export function nmlbInfo(S) {
  var ninja = S.ninjaData && S.ninjaData[102] && S.ninjaData[102][9];
  var emp16 = _safe(emporiumBonus, 16, ninja) === 1;
  var bun = Number(S.bundlesData && S.bundlesData.bun_s) === 1;
  return { active: emp16 || bun, levels: (bun ? 2 : 0) + (emp16 ? 1 : 0), emporium16: emp16, bundle: bun };
}

// Daily reset scan: lowest eligible level, ties go to the highest index.
export function nmlbTarget(levels, maxLevel) {
  var min = 999;
  var pick = -1;
  for (var d = 0; d < levels.length; d++) {
    var L = levels[d];
    if (2 <= L && L <= min && L < maxLevel) { pick = d; min = L; }
  }
  return pick;
}

// Ladles required to raise every blocker so meal X becomes the daily NMLB target.
export function nmlbSteerPlan(S, opts) {
  opts = opts || {};
  var levels = opts.levels || mealLevels(S);
  var stocks = opts.stocks || mealStocks(S);
  var maxLevel = opts.maxLevel || mealMaxLevel(S);
  var inputs = opts.inputs || mealCostInputs(S);
  var speed = opts.kitchenSpeed;
  var ladleMulti = opts.ladleMulti || 1;
  var nmlb = opts.nmlb || nmlbInfo(S);
  var current = nmlbTarget(levels, maxLevel);
  var rows = [];
  for (var x = 0; x < levels.length; x++) {
    var Lx = levels[x];
    if (!(Lx >= 2 && Lx < maxLevel)) continue;
    var steerLadles = 0;
    var blockers = 0;
    for (var d = 0; d < levels.length; d++) {
      if (d === x) continue;
      var Ld = levels[d];
      if (!(Ld >= 2 && Ld < maxLevel)) continue;
      var need = Math.min(maxLevel, d > x ? Lx + 1 : Lx);
      if (Ld >= need) continue;
      blockers++;
      var stock = stocks[d] || 0;
      for (var L = Ld; L < need; L++) {
        var step = ladlesForMealLevel(d, L, stock, speed, ladleMulti, inputs, 0);
        steerLadles += step.ladles;
        stock = Math.max(0, stock - step.cost);
      }
    }
    var saved = 0;
    var stockX = stocks[x] || 0;
    for (var g = 0; g < nmlb.levels && Lx + g < maxLevel; g++) {
      var stepX = ladlesForMealLevel(x, Lx + g, 0, speed, ladleMulti, inputs, 0);
      saved += stepX.ladles;
    }
    var nextX = ladlesForMealLevel(x, Lx, stockX, speed, ladleMulti, inputs, 0);
    rows.push({
      meal: x,
      name: mealName(x),
      level: Lx,
      current: x === current,
      blockers: blockers,
      steerLadles: steerLadles,
      nextLevelLadles: nextX.ladles,
      dailyLadlesSaved: saved,
      netLadles: saved - steerLadles,
      valueRatio: steerLadles > 0 ? saved / steerLadles : Infinity,
    });
  }
  rows.sort(function(a, b) { return b.netLadles - a.netLadles; });
  return { current: current, rows: rows };
}

// Splits meals by whether their next level fits in one day of kitchen time (passive hours + daily ladle hours).
// Ladleable meals are leveled directly; everything else is an NMLB target that only No Meal Left Behind raises.
export function ladleableMeals(opts) {
  var levels = opts.levels;
  var stocks = opts.stocks || [];
  var maxLevel = opts.maxLevel;
  var dayHours = Math.max(0, Number(opts.dayHours) || 0);
  var out = [];
  for (var m = 0; m < levels.length; m++) {
    var L = levels[m];
    var open = L >= 1 && L < maxLevel && mealRequirement(m) > 0;
    var next = open ? ladlesForMealLevel(m, L, stocks[m] || 0, opts.kitchenSpeed, opts.ladleMulti, opts.inputs, 0) : null;
    var hours = next ? next.ladles * opts.ladleMulti : Infinity;
    out.push({
      meal: m,
      level: L,
      open: open,
      nmlbEligible: open && L >= 2,
      nextLadles: next ? next.ladles : Infinity,
      nextHours: hours,
      ladleable: open && hours <= dayHours,
    });
  }
  return out;
}

function _nmlbPickAmong(levels, maxLevel, allowed) {
  var min = 999;
  var pick = -1;
  for (var d = 0; d < levels.length; d++) {
    if (!allowed[d]) continue;
    var L = levels[d];
    if (2 <= L && L <= min && L < maxLevel) { pick = d; min = L; }
  }
  return pick;
}

function _ladlesForLevels(m, from, to, stock, speed, ladleMulti, inputs) {
  var total = 0;
  for (var L = from; L < to; L++) {
    var step = ladlesForMealLevel(m, L, stock, speed, ladleMulti, inputs, 0);
    total += step.ladles;
    stock = Math.max(0, stock - step.cost);
  }
  return total;
}

// Floor steering: NMLB always hits the lowest eligible level. Keeping every ladleable meal above the lowest
// NMLB-target level (the floor) makes each daily NMLB hit land on an expensive meal instead.
export function nmlbFloorPlan(S, opts) {
  opts = opts || {};
  var levels = opts.levels || mealLevels(S);
  var stocks = opts.stocks || mealStocks(S);
  var maxLevel = opts.maxLevel || mealMaxLevel(S);
  var inputs = opts.inputs || mealCostInputs(S);
  var speed = opts.kitchenSpeed;
  var ladleMulti = opts.ladleMulti || 1;
  var nmlb = opts.nmlb || nmlbInfo(S);
  var dayHours = Math.max(0, Number(opts.dayHours) || 0);
  var rotationDays = Math.max(1, Math.min(365, Math.floor(Number(opts.rotationDays) || 14)));
  var classes = ladleableMeals({ levels: levels, stocks: stocks, maxLevel: maxLevel, kitchenSpeed: speed,
    ladleMulti: ladleMulti, inputs: inputs, dayHours: dayHours });
  var isTarget = classes.map(function(c) { return c.nmlbEligible && !c.ladleable; });
  var currentPick = nmlbTarget(levels, maxLevel);
  var floorMeal = _nmlbPickAmong(levels, maxLevel, isTarget);
  var gain = nmlb.active ? nmlb.levels : 0;

  function savedFor(m, from) {
    var to = Math.min(maxLevel, from + Math.max(1, gain));
    return _ladlesForLevels(m, from, to, 0, speed, ladleMulti, inputs);
  }
  function blockersFor(x) {
    var raw = _steerBlockers(levels, x, maxLevel);
    var ladleable = [];
    var expensive = [];
    var ladles = 0;
    for (var i = 0; i < raw.length; i++) {
      var d = raw[i];
      var need = Math.min(maxLevel, d > x ? levels[x] + 1 : levels[x]);
      var cost = _ladlesForLevels(d, levels[d], need, stocks[d] || 0, speed, ladleMulti, inputs);
      var row = { meal: d, name: mealName(d), level: levels[d], need: need, levels: need - levels[d], ladles: cost,
        hours: cost * ladleMulti, ladleable: !isTarget[d] };
      if (isTarget[d]) expensive.push(row); else { ladleable.push(row); ladles += cost; }
    }
    ladleable.sort(function(a, b) { return a.level - b.level || b.meal - a.meal; });
    return { ladleable: ladleable, expensive: expensive, ladles: ladles };
  }

  // Predicted rotation if the floor is held: NMLB cycles through target meals only.
  var rot = levels.slice();
  var rotation = [];
  var rotationDay = {};
  for (var day = 1; day <= rotationDays && gain > 0; day++) {
    var p = _nmlbPickAmong(rot, maxLevel, isTarget);
    if (p < 0) break;
    var to = Math.min(maxLevel, rot[p] + gain);
    rotation.push({ day: day, meal: p, name: mealName(p), from: rot[p], to: to, ladlesSaved: savedFor(p, rot[p]) });
    if (rotationDay[p] == null) rotationDay[p] = day;
    rot[p] = to;
  }

  var targets = [];
  for (var x = 0; x < levels.length; x++) {
    if (!isTarget[x]) continue;
    var b = blockersFor(x);
    targets.push({
      meal: x,
      name: mealName(x),
      level: levels[x],
      nextLadles: classes[x].nextLadles,
      ladlesSaved: savedFor(x, levels[x]),
      rotationDay: rotationDay[x] != null ? rotationDay[x] : null,
      current: x === currentPick,
      floor: x === floorMeal,
      ladleableBlockers: b.ladleable.length,
      expensiveBlockers: b.expensive.length,
      steerLadles: b.ladles,
      feasible: b.expensive.length === 0,
      fitsInDay: b.expensive.length === 0 && b.ladles * ladleMulti <= dayHours,
    });
  }
  targets.sort(function(a, b) { return b.ladlesSaved - a.ladlesSaved || a.meal - b.meal; });

  var floorBlockers = floorMeal >= 0 ? blockersFor(floorMeal) : { ladleable: [], expensive: [], ladles: 0 };
  var currentSaved = currentPick >= 0 ? savedFor(currentPick, levels[currentPick]) : 0;
  return {
    dayHours: dayHours,
    classes: classes,
    currentPick: currentPick,
    currentOnTarget: currentPick >= 0 && isTarget[currentPick],
    currentSaved: currentSaved,
    floorMeal: floorMeal,
    floorLevel: floorMeal >= 0 ? levels[floorMeal] : null,
    floorSaved: floorMeal >= 0 ? savedFor(floorMeal, levels[floorMeal]) : 0,
    blockers: floorBlockers.ladleable,
    blockerLadles: floorBlockers.ladles,
    blockerHours: floorBlockers.ladles * ladleMulti,
    fitsInDay: floorBlockers.ladles * ladleMulti <= dayHours,
    targets: targets,
    rotation: rotation,
    ladleableCount: classes.filter(function(c) { return c.ladleable; }).length,
    targetCount: targets.length,
  };
}

// ---------------- Planner ----------------

export function ladleInventory(S) {
  var out = { ladle: itemCount(S, LADLE_ITEM), balloons: {} };
  for (var i = 0; i < EXP_BALLOONS.length; i++) out.balloons[EXP_BALLOONS[i]] = itemCount(S, EXP_BALLOONS[i]);
  return out;
}

// Greedy daily simulation: kitchens are fungible, every ladle adds 1h × (1 + T148) to every kitchen.
// Each day spends passive kitchen hours plus ladle hours on the cheapest next meal level; NMLB then applies
// and the Dream 11 discount counter advances.
export function planMealLeveling(S, opts) {
  opts = opts || {};
  var ci = opts.activeCharIdx || 0;
  var model = opts.model || cookingSpeedModel(S, ci);
  var inputs = opts.inputs || mealCostInputs(S);
  var maxLevel = opts.maxLevel || mealMaxLevel(S);
  var nmlb = opts.nmlb || nmlbInfo(S);
  var ladleMulti = opts.ladleMulti != null ? opts.ladleMulti : ladleMultiplier(S, ci).multiplier;
  var days = Math.max(1, Math.min(3650, Math.floor(Number(opts.days) || 30)));
  var ladlesPerDayIn = Math.max(0, Number(opts.ladlesPerDay) || 0);
  var startLadles = Math.max(0, Number(opts.startLadles) || 0);
  var passiveHours = opts.passive === false ? 0 : 24;
  var steer = opts.steerTarget != null && opts.steerTarget >= 0 ? Number(opts.steerTarget) : -1;
  var strategy = opts.strategy === 'cheapest' ? 'cheapest' : 'speed';
  var floorGuard = opts.floorGuard !== false && steer < 0;
  var ladleableOnly = opts.ladleableOnly !== false;
  // Day 1 ends at the next daily reset (TimeAway.ShopRestock), which applies NMLB automatically.
  var hoursToReset = opts.hoursToReset != null && Number.isFinite(Number(opts.hoursToReset))
    ? Math.max(0, Math.min(24, Number(opts.hoursToReset))) : 24;
  var claimers = Array.isArray(opts.claimers) ? opts.claimers : null;
  var extraPerDay = Math.max(0, Number(opts.extraPerDay) || 0);
  function claimIncome(windowHours, firstDay) {
    if (!claimers) {
      var flat = ladlesPerDayIn * windowHours / 24;
      return { min: flat, expected: flat, claims: [], plan: null };
    }
    var plan = ladleClaimPlan(claimers, windowHours, { ignorePending: !firstDay });
    var extra = extraPerDay * windowHours / 24;
    return { min: plan.minLadles + extra, expected: plan.expectedLadles + extra, claims: plan.claims, plan: plan };
  }
  var fullDayIncome = claimIncome(24, false);
  // Guaranteed (minimum) claim income decides what is ladleable; doubling rolls are only upside.
  var classHours = passiveHours + fullDayIncome.min * ladleMulti;
  var levels = (opts.levels || mealLevels(S)).slice();
  var stocks = (opts.stocks || mealStocks(S)).slice();
  var startLevels = levels.slice();
  var ola = inputs.ola193;
  var speed = totalKitchenSpeed(model, levels);
  var timeline = [];
  var bySource = { ladle: 0, nmlb: 0 };
  var totalLadlesUsed = 0;
  var gained = levels.map(function() { return 0; });
  var steps = 0;
  var evaluator = strategy === 'speed' ? kitchenSpeedEvaluator(model, levels.length) : null;
  var thresholdPicks = { lv11: 0, lv30: 0 };

  // Kitchen hours to raise meal m from its current level to `target`, spending existing stock first.
  function bundleHours(m, target) {
    var need = 0;
    var discount = ola;
    for (var L = levels[m]; L < target; L++) { need += mealLevelCost(L, inputs, discount); discount = 0; }
    return Math.max(0, need - stocks[m]) * mealRequirement(m) / speed;
  }

  var dayClassHours = classHours;
  function ladleable(m) {
    return !ladleableOnly || bundleHours(m, levels[m] + 1) <= dayClassHours;
  }

  // Speed-ROI choice: maximize ln(kitchen speed gain) per kitchen hour, with lookahead bundles to the
  // Lv 11 (MealSpdz bubble) and Lv 30 (Atom 8) thresholds so those steps are valued before they pay off.
  function pickSpeed(steerBlockers) {
    var agg = evaluator.aggregate(levels);
    var baseLn = Math.log(evaluator.speed(agg));
    var best = { meal: -1, score: -Infinity, hours: Infinity, reason: '' };
    for (var m = 0; m < levels.length; m++) {
      if (!(levels[m] >= 1 && levels[m] < maxLevel) || !mealRequirement(m)) continue;
      if (m === steer) continue;
      if (steerBlockers && steerBlockers.length && steerBlockers.indexOf(m) < 0) continue;
      if (!ladleable(m)) continue;
      var targets = [levels[m] + 1];
      if (levels[m] < 11 && maxLevel >= 11) targets.push(11);
      if (levels[m] < 30 && maxLevel >= 30) targets.push(30);
      for (var t = 0; t < targets.length; t++) {
        var target = targets[t];
        if (t > 0 && target <= levels[m] + 1) continue;
        var h = bundleHours(m, target);
        var gain = Math.log(evaluator.speed(evaluator.shift(agg, m, levels[m], target))) - baseLn;
        var score = h <= 0 ? Infinity : gain / h;
        var firstHours = t === 0 ? h : bundleHours(m, levels[m] + 1);
        if (score > best.score || (score === best.score && firstHours < best.hours)) {
          best = { meal: m, score: score, hours: firstHours, reason: target === 11 && t > 0 ? 'lv11' : (target === 30 && t > 0 ? 'lv30' : 'next') };
        }
      }
    }
    return best;
  }

  function pickCheapest(steerBlockers) {
    var best = { meal: -1, hours: Infinity, reason: 'next' };
    for (var m = 0; m < levels.length; m++) {
      if (!(levels[m] >= 1 && levels[m] < maxLevel) || !mealRequirement(m)) continue;
      if (m === steer) continue;
      if (steerBlockers && steerBlockers.length && steerBlockers.indexOf(m) < 0) continue;
      if (!ladleable(m)) continue;
      var h = Math.max(0, mealLevelCost(levels[m], inputs, ola) - stocks[m]) * mealRequirement(m) / speed;
      if (h < best.hours) best = { meal: m, hours: h, reason: 'next' };
    }
    return best;
  }

  var speedMeal = levels.map(function() { return false; });
  MEAL_KEYS.forEach(function(key) {
    (model.mealCoef[key] || []).forEach(function(c) { if (c.idx < speedMeal.length && c.perLevel) speedMeal[c.idx] = true; });
  });
  var purchases = [];
  var perMeal = levels.map(function(L, m) {
    return { meal: m, startLevel: L, ladleLevels: 0, nmlbLevels: 0, ladles: 0, firstDay: 0, lastDay: 0, speedMeal: speedMeal[m] };
  });
  var cumLadles = 0;
  // Ladles are spent at login before kitchens cook passively, so each step draws ladle hours first and passive hours after.
  function ladlesFor(h, pool) {
    var fromLadles = Math.min(h, pool.ladle);
    pool.ladle -= fromLadles;
    return ladleMulti > 0 ? fromLadles / ladleMulti : 0;
  }

  function buy(m, h, pool, reason, dayPurchases, dayLevels, day) {
    var stepLadles = ladlesFor(h, pool);
    var paid = mealLevelCost(levels[m], inputs, ola);
    stocks[m] = Math.max(0, stocks[m] + h * speed / mealRequirement(m) - paid);
    var before = speed;
    levels[m]++;
    gained[m]++;
    bySource.ladle++;
    ola = 0;
    speed = totalKitchenSpeed(model, levels);
    dayLevels.push(m);
    cumLadles += stepLadles;
    var rec = { day: day, meal: m, fromLevel: levels[m] - 1, toLevel: levels[m], cost: paid, hours: h,
      ladles: stepLadles, cumulativeLadles: cumLadles, speedBefore: before, speedAfter: speed, reason: reason };
    purchases.push(rec);
    dayPurchases.push(rec);
    var pm = perMeal[m];
    pm.ladleLevels++;
    pm.ladles += stepLadles;
    if (!pm.firstDay) pm.firstDay = day;
    pm.lastDay = day;
    steps++;
    return h;
  }

  // Ladleable meals still below the lowest NMLB-target level, so tonight's NMLB hit lands on an expensive meal.
  function floorState() {
    var allowed = [];
    for (var m = 0; m < levels.length; m++) {
      allowed.push(levels[m] >= 2 && levels[m] < maxLevel && mealRequirement(m) > 0 && !ladleable(m));
    }
    var fm = _nmlbPickAmong(levels, maxLevel, allowed);
    if (fm < 0) return null;
    var raw = _steerBlockers(levels, fm, maxLevel);
    var blockers = [];
    var hoursNeed = 0;
    for (var i = 0; i < raw.length; i++) {
      var d = raw[i];
      if (allowed[d]) return { meal: fm, level: levels[fm], blockers: raw, hours: Infinity, expensive: true };
      var need = Math.min(maxLevel, d > fm ? levels[fm] + 1 : levels[fm]);
      blockers.push({ meal: d, need: need });
      hoursNeed += bundleHours(d, need);
    }
    return { meal: fm, level: levels[fm], blockers: blockers, hours: hoursNeed, expensive: false };
  }

  // One phase spends its ladle pool plus passive kitchen hours: unmet floor blockers first, then the strategy.
  // Hours that cannot finish the next level are banked into that meal's stock for the following phase.
  function runPhase(ph, day, floor, fs, isLast, dayLevels) {
    var hours = ph.passiveHours + ph.ladles * ladleMulti;
    var startHours = hours;
    var pool = { ladle: ph.ladles * ladleMulti };
    var phaseSteps = [];
    var saving = null;
    var guard = 0;
    function bank(m, toTarget, steered, isFloor) {
      var savedLadles = ladlesFor(hours, pool);
      stocks[m] += hours * speed / mealRequirement(m);
      var need = mealLevelCost(levels[m], inputs, ola);
      saving = { meal: m, toLevel: levels[m] + 1, hours: hours, ladles: savedLadles,
        progress: need > 0 ? Math.min(1, stocks[m] / need) : 1, target: toTarget, steered: steered, floor: isFloor };
      perMeal[m].ladles += savedLadles;
      cumLadles += savedLadles;
      hours = 0;
    }
    if (floor && floor.reachable && fs && fs.blockers.length && !floor.applied) {
      var ladlesBefore = cumLadles;
      // Raise blockers cheapest level first; speed only rises, so the reachability precheck is conservative.
      while (hours > 1e-12 && guard++ < 20000) {
        var bm = -1;
        var bh = Infinity;
        for (var bi = 0; bi < fs.blockers.length; bi++) {
          var bb = fs.blockers[bi];
          if (levels[bb.meal] >= bb.need) continue;
          var hh = bundleHours(bb.meal, levels[bb.meal] + 1);
          if (hh < bh) { bh = hh; bm = bb.meal; }
        }
        if (bm < 0) break;
        if (bh > hours) {
          if (!isLast) bank(bm, false, false, true);
          break;
        }
        hours -= buy(bm, bh, pool, 'floor', phaseSteps, dayLevels, day);
      }
      floor.applied = fs.blockers.every(function(b) { return levels[b.meal] >= b.need; });
      floor.ladles += cumLadles - ladlesBefore;
    }
    while (hours > 1e-12 && guard++ < 40000) {
      var steerBlockers = steer >= 0 ? _steerBlockers(levels, steer, maxLevel) : null;
      var pick = strategy === 'speed' ? pickSpeed(steerBlockers) : pickCheapest(steerBlockers);
      var best = pick.meal;
      var bestHours = pick.hours;
      var toTarget = false;
      if (best < 0) {
        // Nothing ladleable left: bank the remaining time toward the cheapest NMLB-target level.
        for (var tm = 0; tm < levels.length; tm++) {
          if (!(levels[tm] >= 1 && levels[tm] < maxLevel) || !mealRequirement(tm)) continue;
          var th = bundleHours(tm, levels[tm] + 1);
          if (th < bestHours || best < 0) { best = tm; bestHours = th; }
        }
        if (best < 0) break;
        toTarget = true;
      }
      if (pick.reason && pick.reason !== 'next' && !toTarget) thresholdPicks[pick.reason]++;
      if (bestHours > hours) {
        bank(best, toTarget, steer >= 0 && !!steerBlockers && steerBlockers.length > 0, false);
        break;
      }
      var reason = strategy === 'cheapest' ? 'cheapest'
        : (pick.reason !== 'next' ? pick.reason : (speedMeal[best] ? 'speed-meal' : 'total-level'));
      if (steer >= 0 && steerBlockers && steerBlockers.length) reason = 'steer';
      hours -= buy(best, bestHours, pool, reason, phaseSteps, dayLevels, day);
    }
    var ladleHoursUsed = ph.ladles * ladleMulti - pool.ladle;
    ph.steps = phaseSteps;
    ph.meals = _groupDaySteps(phaseSteps);
    ph.saving = saving;
    ph.levelsBought = phaseSteps.length;
    ph.ladlesUsed = ladleMulti > 0 ? Math.min(ph.ladles, ladleHoursUsed / ladleMulti) : 0;
    ph.passiveHoursUsed = Math.max(0, (startHours - hours) - ladleHoursUsed);
    return ph;
  }

  for (var day = 1; day <= days; day++) {
    var firstDay = day === 1;
    var windowHours = firstDay ? hoursToReset : 24;
    var income = firstDay ? claimIncome(windowHours, true) : fullDayIncome;
    var phases = [];
    if (firstDay && startLadles > 0) {
      phases.push({ kind: 'now', windowHours: 0, ladles: startLadles, expectedLadles: startLadles, claims: [], passiveHours: 0 });
    }
    phases.push({ kind: 'claim', windowHours: windowHours, ladles: income.min, expectedLadles: income.expected,
      claims: income.claims, passiveHours: passiveHours * windowHours / 24 });
    var dayHoursTotal = 0;
    for (var pi = 0; pi < phases.length; pi++) dayHoursTotal += phases[pi].passiveHours + phases[pi].ladles * ladleMulti;
    dayClassHours = classHours > 0 ? classHours : dayHoursTotal;
    var dayLevels = [];
    var floor = null;
    var fs = null;
    if (floorGuard && nmlb.active && nmlb.levels > 0) {
      fs = floorState();
      if (fs) {
        floor = { meal: fs.meal, level: fs.level, blockers: fs.blockers.length, hours: fs.hours, applied: false,
          ladles: 0, reachable: !fs.expensive && fs.hours <= dayHoursTotal };
        if (floor.reachable && !fs.blockers.length) floor.applied = true;
      }
    }
    var dayPurchases = [];
    var saving = null;
    var ladlesUsed = 0;
    var passiveUsed = 0;
    for (pi = 0; pi < phases.length; pi++) {
      var ph = runPhase(phases[pi], day, floor, fs, pi === phases.length - 1, dayLevels);
      for (var si = 0; si < ph.steps.length; si++) dayPurchases.push(ph.steps[si]);
      if (ph.saving) saving = ph.saving;
      ladlesUsed += ph.ladlesUsed;
      passiveUsed += ph.passiveHoursUsed;
    }
    totalLadlesUsed += ladlesUsed;
    var nmlbMeal = -1;
    var nmlbFrom = 0;
    var nmlbSaved = 0;
    var nmlbOnTarget = false;
    if (nmlb.active && nmlb.levels > 0) {
      nmlbMeal = nmlbTarget(levels, maxLevel);
      if (nmlbMeal >= 0) {
        nmlbFrom = levels[nmlbMeal];
        var to = Math.min(maxLevel, nmlbFrom + nmlb.levels);
        nmlbOnTarget = !ladleable(nmlbMeal);
        nmlbSaved = _ladlesForLevels(nmlbMeal, nmlbFrom, to, 0, speed, ladleMulti, inputs);
        bySource.nmlb += to - nmlbFrom;
        gained[nmlbMeal] += to - nmlbFrom;
        perMeal[nmlbMeal].nmlbLevels += to - nmlbFrom;
        levels[nmlbMeal] = to;
        speed = totalKitchenSpeed(model, levels);
      }
    }
    if (inputs.dream11 > 0) ola++;
    timeline.push({
      day: day,
      windowHours: windowHours,
      phases: phases,
      ladleIncome: income.min,
      expectedIncome: income.expected,
      purchases: _groupPurchases(dayLevels, startLevels),
      steps: dayPurchases,
      meals: _groupDaySteps(dayPurchases),
      saving: saving,
      savings: phases.map(function(x) { return x.saving; }).filter(Boolean),
      floor: floor,
      passiveHoursUsed: passiveUsed,
      levelsBought: dayLevels.length,
      ladlesUsed: ladlesUsed,
      nmlbMeal: nmlbMeal,
      nmlbFrom: nmlbFrom,
      nmlbTo: nmlbMeal >= 0 ? levels[nmlbMeal] : 0,
      nmlbSaved: nmlbSaved,
      nmlbOnTarget: nmlbOnTarget,
      kitchenSpeed: speed,
      totalLevels: _levelSum(levels),
    });
  }
  return {
    days: days,
    hoursToReset: hoursToReset,
    dailyIncome: fullDayIncome.min,
    dailyExpected: fullDayIncome.expected,
    strategy: strategy,
    thresholdPicks: thresholdPicks,
    maxLevel: maxLevel,
    ladleMultiplier: ladleMulti,
    startSpeed: totalKitchenSpeed(model, startLevels),
    endSpeed: speed,
    startLevels: startLevels,
    levels: levels,
    stocks: stocks,
    gained: gained,
    bySource: bySource,
    ladlesUsed: totalLadlesUsed,
    nextNmlb: nmlb.active ? nmlbTarget(levels, maxLevel) : -1,
    timeline: timeline,
    purchases: purchases,
    perMeal: perMeal.filter(function(r) { r.endLevel = levels[r.meal]; return r.ladleLevels || r.nmlbLevels || r.ladles > 0; }),
    steps: steps,
  };
}

function _steerBlockers(levels, x, maxLevel) {
  var Lx = levels[x];
  if (!(Lx >= 2 && Lx < maxLevel)) return [];
  var out = [];
  for (var d = 0; d < levels.length; d++) {
    if (d === x || !(levels[d] >= 2 && levels[d] < maxLevel)) continue;
    if (levels[d] < (d > x ? Lx + 1 : Lx)) out.push(d);
  }
  return out;
}

// Day steps grouped per meal in first-spend order.
function _groupDaySteps(steps) {
  var byMeal = {};
  var out = [];
  for (var i = 0; i < steps.length; i++) {
    var st = steps[i];
    var g = byMeal[st.meal];
    if (!g) {
      g = byMeal[st.meal] = { meal: st.meal, from: st.fromLevel, to: st.toLevel, levels: 0, ladles: 0, hours: 0, reasons: [] };
      out.push(g);
    }
    g.to = st.toLevel;
    g.levels++;
    g.ladles += st.ladles;
    g.hours += st.hours;
    if (g.reasons.indexOf(st.reason) < 0) g.reasons.push(st.reason);
  }
  return out;
}

function _groupPurchases(list) {
  var counts = {};
  var order = [];
  for (var i = 0; i < list.length; i++) {
    if (!counts[list[i]]) { counts[list[i]] = 0; order.push(list[i]); }
    counts[list[i]]++;
  }
  return order.map(function(m) { return { meal: m, levels: counts[m] }; });
}
