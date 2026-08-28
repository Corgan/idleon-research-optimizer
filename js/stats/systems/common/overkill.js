// ===== OVERKILL TIER CALCULATION =====
// Computes OverkillStuffs("2") — the raw overkill tier (1-51).
// CurrentMap controls the exponent; AFKtarget controls monster HP.

import { DeathNoteMobs, MapAFKtarget, MapDetails, NinjaInfo, StarSigns } from '../../data/game/customlists.js';
import { MONSTERS } from '../../data/game/monsters.js';
import { holesMeasBase, holesMeasType, cosmoUpgBase } from '../../data/w5/hole.js';
import { currentMapData, afkTargetData, klaData, numCharacters, optionsListData } from '../../../save/data.js';
import { getLOG } from '../../../formulas.js';
import damageDesc from '../../defs/damage.js';
import accuracyDesc from '../../defs/accuracy.js';
import { getBuffBonus } from '../../defs/helpers.js';
import { buildTree } from '../../tree-builder.js';
import { getCatalog } from '../../registry.js';
import { achieveStatus } from './achievement.js';
import { computeCardBonusByType, computeBoxReward } from './stats.js';
import { computePositiveStarSignMultiplier, getEnabledStarSigns, isStarSignActive } from './starSign.js';
import { maxTalentBonus, talent } from './talent.js';
import { bubbleValByKey, computeVialByKey } from '../w2/alchemy.js';
import { arcadeBonus } from '../w2/arcade.js';
import { computeSaltLick } from '../w3/construction.js';
import { computePrayerReal } from '../w3/prayer.js';
import { computeChipBonus } from '../w4/lab.js';
import { computeShinyBonusS } from '../w4/breeding.js';
import { mkBase, mkTier } from '../w5/cglunko.js';
import { computeArtifactBonus } from '../w5/sailing.js';
import { deathNoteRank } from '../w7/research-math.js';
import { tomeQTY, computeTomeScore } from '../w4/tome-score.js';
import { computeCardSetBonus } from './cards.js';
import { computeStampBonusOfTypeX } from '../w1/stamp.js';
import { etcBonus } from './etcBonus.js';

function _num(value) {
  if (value && typeof value === 'object' && value.val != null) return Number(value.val) || 0;
  return Number(value) || 0;
}

function _resolverVal(resolver, id, ctx, args) {
  try { return Number(resolver.resolve(id, ctx, args).val) || 0; }
  catch(e) { return 0; }
}

function _deathNoteWorldQTY(worldIdx, saveData) {
  var riftLv = Number(saveData.riftData && saveData.riftData[0]) || 0;
  if (worldIdx === 7) {
    var ninjaMobs = NinjaInfo && NinjaInfo[30];
    var ninjaKills = saveData.ninjaData && saveData.ninjaData[105];
    var ninjaTotal = 0;
    for (var n = 0; ninjaMobs && ninjaKills && n < ninjaMobs.length; n++) {
      ninjaTotal += deathNoteRank(Math.max(0, Number(ninjaKills[n]) || 0), 7842, riftLv);
    }
    return ninjaTotal;
  }

  var mobs = DeathNoteMobs[worldIdx];
  if (!mobs) return 0;
  var charCount = numCharacters || (saveData.lv0AllData ? saveData.lv0AllData.length : 0);
  var total = 0;
  for (var mobIdx = 0; mobIdx < mobs.length; mobIdx++) {
    var mapIdx = MapAFKtarget.indexOf(mobs[mobIdx]);
    if (mapIdx < 0) continue;
    var required = Number(MapDetails[mapIdx] && MapDetails[mapIdx][0] && MapDetails[mapIdx][0][0]) || 0;
    var kills = 0;
    for (var charIdx = 0; charIdx < charCount; charIdx++) {
      var entry = klaData[charIdx] && klaData[charIdx][mapIdx];
      var remaining = Number(Array.isArray(entry) ? entry[0] : entry) || 0;
      kills += required - remaining;
    }
    total += deathNoteRank(Math.max(0, kills), 0, riftLv);
  }
  return total;
}

function _allDeathNoteQTY(saveData) {
  var total = 0;
  for (var worldIdx = 0; worldIdx < 8; worldIdx++) total += _deathNoteWorldQTY(worldIdx, saveData);
  return total;
}

function _measurementMulti(saveData, typeIdx) {
  var qty = 0;
  if (typeIdx === 0) {
    var motherlode = Number(saveData.holesData && saveData.holesData[11] && saveData.holesData[11][28]) || 0;
    qty = motherlode > 0 ? getLOG(motherlode) : 0;
  } else if (typeIdx === 1) {
    qty = (saveData.farmCropCount || 0) / 14;
  } else if (typeIdx === 2) {
    qty = tomeQTY(5, saveData) / 500;
  } else if (typeIdx === 3) {
    qty = computeTomeScore(saveData, 0, saveData) / 2500;
  } else if (typeIdx === 4) {
    var skillLevels = tomeQTY(11, saveData);
    qty = skillLevels / 5000 + Math.max(0, skillLevels - 18000) / 1500;
  } else if (typeIdx === 6) {
    qty = _allDeathNoteQTY(saveData) / 125;
  } else if (typeIdx === 7) {
    var highestDmg = Number(saveData.tasksGlobalData && saveData.tasksGlobalData[0]
      && saveData.tasksGlobalData[0][1] && saveData.tasksGlobalData[0][1][0]) || 0;
    qty = highestDmg > 0 ? getLOG(highestDmg) / 2 : 0;
  } else if (typeIdx === 8) {
    qty = ((saveData.cards1Data && saveData.cards1Data.length) || 0) / 150;
  } else if (typeIdx === 9) {
    var studies = saveData.holesData && saveData.holesData[26] || [];
    for (var studyIdx = 0; studyIdx < studies.length; studyIdx++) qty += Number(studies[studyIdx]) || 0;
    qty /= 6;
  } else if (typeIdx === 10) {
    var golemKills = Number(saveData.holesData && saveData.holesData[11] && saveData.holesData[11][63]) || 0;
    qty = golemKills > 0 ? Math.max(0, getLOG(golemKills) - 2) : 0;
  }
  return qty < 5 ? 1 + 18 * qty / 100 : 1 + (18 * qty + 8 * (qty - 5)) / 100;
}

function _measurementBonus(saveData, measurementIdx) {
  var level = Number(saveData.holesData && saveData.holesData[22]
    && saveData.holesData[22][measurementIdx]) || 0;
  if (level <= 0) return 0;
  var cosmoLv = Number(saveData.holesData && saveData.holesData[5]
    && saveData.holesData[5][3]) || 0;
  var cosmoBonus = Math.floor(cosmoUpgBase(1, 3) * cosmoLv);
  var baseText = holesMeasBase(measurementIdx) || '0';
  var base = parseFloat(baseText) || 0;
  var baseBonus = String(baseText).indexOf('TOT') >= 0
    ? (1 + cosmoBonus / 100) * base * level / (100 + level)
    : (1 + cosmoBonus / 100) * base * level;
  return baseBonus * _measurementMulti(saveData, holesMeasType(measurementIdx));
}

function _starSignBonus(signIdx, charIdx, saveData) {
  var enabled = getEnabledStarSigns(saveData);
  if (!isStarSignActive(signIdx, charIdx, enabled, saveData)) return 0;
  var row = StarSigns[signIdx] || [];
  var match = String(row[1] || '').match(/([0-9.]+)%/);
  var base = match ? Number(match[1]) || 0 : 0;
  return base > 0 ? base * computePositiveStarSignMultiplier(charIdx, saveData) : base;
}

function _w7MultiKillScale(value) {
  if (value >= 250) return 98.14 + (value - 250) / 50;
  if (value >= 200) return 95.6 + (value - 200) / 20;
  if (value >= 150) return 90.6 + (value - 150) / 10;
  if (value >= 100) return 80.6 + (value - 100) / 5;
  if (value >= 50) return 47.3 + (value - 50) / 1.5;
  if (value >= 20) return 20 + (value - 20) / 1.1;
  return value;
}

function _isCglunkoMap(charIdx, mapIdx, saveData) {
  return mapIdx === 216
    && Number(saveData.holesData && saveData.holesData[0] && saveData.holesData[0][charIdx]) === 17;
}

/** Compute WorkbenchStuff("MultiKill_base", 0, 0). */
export function computeMultiKillBase(charIdx, ctx, opts) {
  opts = opts || {};
  var saveData = ctx && ctx.saveData;
  if (!saveData) return 0;
  var mapIdx = opts.mapIdx != null ? opts.mapIdx
    : (ctx.mapIdx != null ? ctx.mapIdx : (currentMapData && currentMapData[charIdx]) || 0);
  var onyxOwned = 0;
  var statueTiers = saveData.statueGData || [];
  for (var statueIdx = 0; statueIdx < statueTiers.length; statueIdx++) {
    if ((Number(statueTiers[statueIdx]) || 0) >= 2) onyxOwned++;
  }

  var value = _starSignBonus(47, charIdx, saveData)
    + _num(computeSaltLick(8, saveData))
    + _num(computeStampBonusOfTypeX('Overkill', saveData))
    + 2 * (Number(saveData.towerData && saveData.towerData[2]) || 0)
    + _resolverVal(etcBonus, '29', ctx)
    + Math.min(5, achieveStatus(148, saveData))
    + 6 * achieveStatus(122, saveData)
    + 2 * achieveStatus(123, saveData)
    + onyxOwned * _resolverVal(talent, 654, ctx);

  if (mapIdx >= 300) value = _w7MultiKillScale(value);
  if (_isCglunkoMap(charIdx, mapIdx, saveData)) value = mkBase(saveData);
  return value;
}

/** Compute WorkbenchStuff("MultiKill_perTier", 0, 0). */
export function computeMultiKillPerTier(charIdx, ctx, opts) {
  opts = opts || {};
  var saveData = ctx && ctx.saveData;
  if (!saveData) return 0;
  var mapIdx = opts.mapIdx != null ? opts.mapIdx
    : (ctx.mapIdx != null ? ctx.mapIdx : (currentMapData && currentMapData[charIdx]) || 0);
  var worldIdx = Math.floor(mapIdx / 50);
  var box13b = computeBoxReward(charIdx, '13b');
  var card80 = computeCardBonusByType(80, charIdx, saveData);
  var cardSet11 = computeCardSetBonus(charIdx, '11');

  var value = _deathNoteWorldQTY(worldIdx, saveData)
    + _deathNoteWorldQTY(7, saveData)
    + _num(computeVialByKey('Overkill', saveData, charIdx))
    + getBuffBonus(46, 2, charIdx, ctx)
    + maxTalentBonus(58, charIdx, saveData) * Math.floor((Number(optionsListData[158]) || 0) / 5)
    + _num(arcadeBonus(8, saveData))
    + _num(computeArtifactBonus(26, charIdx, ctx))
    + getBuffBonus(469, 2, charIdx, ctx)
    + computeChipBonus('mkill', charIdx)
    + _resolverVal(etcBonus, '71', ctx)
    + _measurementBonus(saveData, 9)
    + _num(card80)
    + _starSignBonus(78, charIdx, saveData)
    + _num(computePrayerReal(16, 0, charIdx, saveData))
    + computeShinyBonusS(4, saveData)
    + _num(box13b)
    + _num(bubbleValByKey('MKtierACTIVE', charIdx, saveData))
    + _num(cardSet11);

  if (mapIdx >= 300 && !opts.skipWorld7Scale) value = _w7MultiKillScale(value);
  if (_isCglunkoMap(charIdx, mapIdx, saveData)) value = mkTier(saveData);
  return value;
}

/** Compute WorkbenchStuff("MultiKillTOTAL", 0, 0). */
export function computeMultiKillTotal(charIdx, ctx, opts) {
  opts = opts || {};
  var mapIdx = opts.mapIdx != null ? opts.mapIdx
    : (ctx && ctx.mapIdx != null ? ctx.mapIdx : (currentMapData && currentMapData[charIdx]) || 0);
  var tier = opts.tier != null ? Number(opts.tier) || 1
    : computeOverkillTier(charIdx, ctx, { mapIdx: mapIdx }).tier;
  return Math.floor(
    computeMultiKillBase(charIdx, ctx, { mapIdx: mapIdx })
    + tier * computeMultiKillPerTier(charIdx, ctx, { mapIdx: mapIdx })
  );
}

function _overkillTarget(charIdx, opts) {
  var mapIdx = opts.mapIdx != null ? opts.mapIdx
    : (currentMapData && currentMapData[charIdx]) || 0;
  var savedTarget = afkTargetData && afkTargetData[charIdx];
  var hasTargetOverride = Object.prototype.hasOwnProperty.call(opts, 'afkTarget');
  var monsterKey = hasTargetOverride ? opts.afkTarget : (savedTarget || MapAFKtarget[mapIdx]);
  var monster = monsterKey && MONSTERS[monsterKey];
  return {
    mapIdx: mapIdx,
    monsterKey: monsterKey || '',
    monster: monster,
    monsterHP: opts.monsterHP != null ? Number(opts.monsterHP) || 0
      : (monster && Number(monster.MonsterHPTotal)) || 0,
    exponent: mapIdx >= 300 ? 5 : 2,
  };
}

function _resolveStat(id, desc, charIdx, ctx, mapIdx, override) {
  if (override != null) return Number(override) || 0;
  try {
    if (ctx && typeof ctx.resolve === 'function') return Number(ctx.resolve(id).val) || 0;
    return Number(buildTree(desc, getCatalog(), {
      charIdx: charIdx,
      mapIdx: mapIdx,
      saveData: ctx && ctx.saveData,
    }).val) || 0;
  } catch(e) {
    return 0;
  }
}

/** Compute OverkillStuffs("3"), including its damage, tower, and accuracy gates. */
export function computeOverkillActive(charIdx, ctx, opts) {
  opts = opts || {};
  var target = _overkillTarget(charIdx, opts);
  var maxDmg = _resolveStat('damage', damageDesc, charIdx, ctx, target.mapIdx, opts.maxDmg);
  var accuracy = _resolveStat('accuracy', accuracyDesc, charIdx, ctx, target.mapIdx, opts.accuracy);
  var towerLv = Number(ctx && ctx.saveData && ctx.saveData.towerData && ctx.saveData.towerData[2]) || 0;
  var monsterDefence = opts.monsterDefence != null ? Number(opts.monsterDefence) || 0
    : (target.monster && Number(target.monster.Defence)) || 0;
  var active = target.monsterHP > 0
    && maxDmg >= target.monsterHP * target.exponent
    && towerLv > 0.5
    && accuracy > 1.5 * monsterDefence;
  return {
    active: active,
    maxDmg: maxDmg,
    accuracy: accuracy,
    towerLv: towerLv,
    monsterHP: target.monsterHP,
    monsterDefence: monsterDefence,
    mapIdx: target.mapIdx,
    afkTarget: target.monsterKey,
    exponent: target.exponent,
    partial: target.monsterHP <= 0 || !target.monster,
  };
}

/**
 * Compute overkill tier for a character on their current map.
 * Game logic: OverkillStuffs("2")
 *   OverkillEXPONENT = (CurrentMap >= 300) ? 5 : 2
 *   tier = 1; for s=0..49: if maxDmg >= MonsterHP * exp * exp^(s+1) then tier = s+2
 *
 * @param {number} charIdx
 * @param {object} ctx - must include saveData
 * @param {object} [opts] - optional overrides
 * @param {number} [opts.mapIdx] - override current map index
 * @param {string} [opts.afkTarget] - override AFK target monster key
 * @param {number} [opts.monsterHP] - override target monster HP
 * @param {number} [opts.maxDmg] - override max damage
 * @returns {{ tier: number, maxDmg: number, monsterHP: number, mapIdx: number, exponent: number }}
 */
export function computeOverkillTier(charIdx, ctx, opts) {
  opts = opts || {};
  var target = _overkillTarget(charIdx, opts);
  var mapIdx = target.mapIdx;
  var monsterKey = target.monsterKey;
  var monsterHP = target.monsterHP;

  if (monsterHP <= 0) {
    return { tier: 1, maxDmg: 0, monsterHP: 0, mapIdx: mapIdx, afkTarget: monsterKey, exponent: target.exponent, partial: true };
  }

  var maxDmg = _resolveStat('damage', damageDesc, charIdx, ctx, mapIdx, opts.maxDmg);

  var okExp = target.exponent;
  var tier = 1;
  for (var s = 0; s < 50; s++) {
    var threshold = monsterHP * okExp * Math.pow(okExp, s + 1);
    if (maxDmg >= threshold) {
      tier = s + 2;
    } else {
      break;
    }
  }

  return { tier: tier, maxDmg: maxDmg, monsterHP: monsterHP, mapIdx: mapIdx, afkTarget: monsterKey, exponent: okExp, partial: false };
}
