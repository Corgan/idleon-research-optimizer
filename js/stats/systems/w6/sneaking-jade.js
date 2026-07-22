// ===== SNEAKING JADE (W6) =====
// Exact Ninja("coin") and in-game DN5 jade/hour formulas.

import { TaskShopDesc } from '../../data/game/customlists.js';
import { nkBonus, floorJadeBase, detectionChance } from './sneaking-math.js';
import {
  computeTwinStealth,
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
  var detectionCycles = detection >= 1
    ? Infinity
    : (1 / (1 - detection) - 1) * (1 - Math.min(0.9, _num(dodgePct) / 100));
  if (detection >= 1) return { actionsPerHour: 0, detectionCycles: detectionCycles };
  return {
    actionsPerHour: 3600 * _num(actionSpeed) / (3600 + detectionCycles * (3600 + _num(koTime))),
    detectionCycles: detectionCycles,
  };
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
  var vial = _num(computeVialByKey('6Jade', saveData));
  var meal = _num(computeMealBonus('zJade', saveData));
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
  var stamp = computeStampBonusOfTypeX('JadeCoin', saveData);
  var g = 1 + (slab + stamp) / 100;
  var crop = computeCropSC(2, saveData);
  var d = 1 + crop / 100;
  var win = computeWinBonus(1, {}, saveData);
  var b = 1 + win / 100;

  var msa = computeMSABonus(7, saveData);
  var sigil = sigilBonus(23, saveData);
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
  var merit = computeMeritocBonusz(6, saveData);
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
  };
}