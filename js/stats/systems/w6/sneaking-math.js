// ===== SNEAKING MATH (W6) =====
// Core formulas for Ninja Knowledge costs, bonuses, stealth, jade, EXP.

import { NinjaUpg, NinjaInfo, JadeUpg } from '../../data/game/customlists.js';
import { NjEQ } from '../../data/game/custommaps.js';
import { pristineCharmBonus } from '../../data/common/sigils.js';
import { charClassData } from '../../../save/data.js';

// ----- NinjaUpg data accessors -----
export const NK_COUNT = NinjaUpg.length; // 29

export function nkName(idx) {
  return (NinjaUpg[idx] && NinjaUpg[idx][4] || '').replace(/_/g, ' ');
}
export function nkDesc(idx) {
  return (NinjaUpg[idx] && NinjaUpg[idx][6] || '').replace(/_/g, ' ');
}
export function nkBaseCost(idx) { return Number(NinjaUpg[idx]?.[7]) || 0; }
export function nkCostScale(idx) { return Number(NinjaUpg[idx]?.[8]) || 1; }
export function nkCostDiv(idx) { return Number(NinjaUpg[idx]?.[5]) || 1; }

// ----- NinjaInfo accessors -----
export const FLOOR_COUNT = 12;

// Game init scales NinjaInfo arrays by mastery (OLA[231]):
//   NinjaInfo[3][i] = 0.01 * raw[i] * pow(raw[10], mastery), then [0] = 1
//   NinjaInfo[9][i] = 0.1  * raw[i] * pow(raw[11], mastery), then [0] = 0.01
//   NinjaInfo[10][i]= 0.1  * raw[i] * pow(raw[11], mastery)
var _DET_SCALE = Number(NinjaInfo[9]?.[11]) || 1;
var _HP_SCALE  = Number(NinjaInfo[3]?.[10]) || 1;
var _JADE_SCALE = Number(NinjaInfo[10]?.[11]) || 1;

export function doorHP(floor, mastery) {
  var raw = Number(NinjaInfo[3]?.[floor]) || 0;
  var masteryLevel = Number(mastery) || 0;
  if (masteryLevel <= 0) return raw;
  if (floor === 0) return 1; // game override
  var scale = _HP_SCALE;
  if (floor > 10) scale = 0.01 * _HP_SCALE * Math.pow(_HP_SCALE, masteryLevel);
  return 0.01 * raw * Math.pow(scale, masteryLevel);
}
export function floorLayout(floor) { return Number(NinjaInfo[6]?.[floor]) || 0; }
export function floorActions(floor) { return Number(NinjaInfo[7]?.[floor]) || 0; }
export function untieReq(twin) { return Number(NinjaInfo[8]?.[twin]) || 0; }
export function floorDetectionBase(floor, mastery) {
  var raw = Number(NinjaInfo[9]?.[floor]) || 0;
  var masteryLevel = Number(mastery) || 0;
  if (masteryLevel <= 0) return raw;
  if (floor === 0) return 0.01; // game override
  return 0.1 * raw * Math.pow(_DET_SCALE, masteryLevel);
}
export function floorJadeBase(floor, mastery) {
  var raw = Number(NinjaInfo[10]?.[floor]) || 0;
  var masteryLevel = Number(mastery) || 0;
  if (masteryLevel <= 0) return raw;
  return 0.1 * raw * Math.pow(_JADE_SCALE, masteryLevel);
}
export function floorExpMult(floor, mastery) {
  var raw = Number(NinjaInfo[11]?.[floor]) || 0;
  var masteryLevel = Number(mastery) || 0;
  if (masteryLevel <= 0) return raw;
  var scale = Number(NinjaInfo[11]?.[11]) || 1;
  return 0.1 * raw * Math.pow(scale, masteryLevel);
}

// Drop table for a floor: array of {key, chance} pairs
function _insertBeforeLastPair(row, itemKey, chance) {
  if (row.some(function(value) { return value === itemKey; })) return;
  var index = Math.max(0, row.length - 2);
  row.splice(index, 0, itemKey, String(chance));
}

export function floorDropTable(floor, mastery, saveData) {
  var raw = NinjaInfo[12 + floor];
  if (!raw) return [];
  raw = raw.slice();
  var masteryLevel = Number(mastery) || 0;
  if (masteryLevel >= 1) {
    var masteryOne = { 1: ['NjGem0', 0.08], 3: ['NjGem1', 0.07], 5: ['NjGem2', 0.06], 8: ['NjGem3', 0.05] };
    if (masteryOne[floor]) _insertBeforeLastPair(raw, masteryOne[floor][0], masteryOne[floor][1]);
    if (charClassData.indexOf(29) !== -1) {
      if (floor === 4) _insertBeforeLastPair(raw, 'NjGem6', 0.08);
      if (floor === 9) _insertBeforeLastPair(raw, 'NjGem7', 0.08);
    }
  }
  if (masteryLevel >= 2) {
    var masteryTwo = {
      2: [['NjTr20', 0.15], ['NjGem4', 0.05]],
      3: [['NjTr24', 0.14]],
      4: [['NjTr21', 0.14]],
      6: [['NjTr22', 0.13], ['NjGem5', 0.05]],
      9: [['NjTr23', 0.12]],
    };
    var additions = masteryTwo[floor] || [];
    for (var addIdx = 0; addIdx < additions.length; addIdx++) {
      _insertBeforeLastPair(raw, additions[addIdx][0], additions[addIdx][1]);
    }
  }
  var items = [];
  var missProduct = 1;
  for (var i = 0; i + 1 < raw.length; i += 2) {
    var conditionalChance = i + 2 >= raw.length ? 1 : Number(raw[i + 1]) || 0;
    var actualChance = missProduct * conditionalChance;
    items.push({ key: raw[i], chance: actualChance, conditionalChance: conditionalChance });
    missProduct *= 1 - conditionalChance;
  }
  return items;
}

// Max charm level when found: NLbonuses(11) = Charm Collector
export function maxCharmDropLevel(nkLevels, masteryLevel, extras) {
  return nkBonusFull(11, nkLevels, masteryLevel, extras);
}

// ----- NK Bonus (NLbonuses) -----
// Game: NinjaUpg[t][5] * Ninja[103][t]
// costDiv field [5] doubles as the bonus-per-level multiplier
export function nkBonus(idx, nkLevels) {
  var lv = Number(nkLevels?.[idx]) || 0;
  var perLv = nkCostDiv(idx);
  return perLv * lv;
}

// ----- NK Upgrade Cost (JadeUpgCost) -----
// Reconstructed from game's _customBlock_Ninja("JadeUpgCost", t, i)
// Common discount: bargainMulti * gemstone6 * talent430 * ninjaBonus11
// Centurion: 1 / pow(1 + NLbonuses(0)/100, floor(level/100))
// Special cases for indices 0, 1, 3, 4, 8, 13, and >16
export function nkUpgCost(idx, nkLevels, discounts) {
  var lv = Number(nkLevels?.[idx]) || 0;
  var baseCost = nkBaseCost(idx);
  var scale = nkCostScale(idx);
  var d = discounts || {};

  // Centurion discount: applied to ALL upgrades
  var centurionNL = nkBonus(0, nkLevels);
  var centurionMult = 1 / Math.pow(1 + centurionNL / 100, Math.floor(lv / 100));

  // Common bargain discount (all upgrades share this)
  var bargainNL = nkBonus(1, nkLevels);
  var gem6 = d.gemstone6 || 0;
  var talent430 = d.talent430 || 0;
  var ninjaBonus11 = d.ninjaBonus11 || 0;
  var commonDisc = (1 / (1 + ninjaBonus11 / 100))
    / ((1 + bargainNL / 100) * (1 + gem6 / 100) * (1 + talent430 / 100));

  var cost;
  if (idx > 16) {
    // High tier: pow(10, floor(2*(t-15))) * common * base * scale^lv * centurion
    cost = Math.pow(10, Math.floor(2 * (idx - 15))) * commonDisc * baseCost * Math.pow(scale, lv) * centurionMult;
  } else if (idx === 8) {
    // Currency Conduit: also has bubble Y10 discount
    var bubbleY10 = d.bubbleY10 || 0;
    cost = commonDisc * (1 / (1 + bubbleY10 / 100)) * baseCost * Math.pow(scale, lv) * centurionMult;
  } else if (idx === 0) {
    // Centurion_Lineage: starts at 1e45
    cost = Math.pow(10, 45) * commonDisc * baseCost * Math.pow(scale, lv) * centurionMult;
  } else if (idx === 13) {
    // Way_of_Stealth: Cheaper_Stealth (NL 18) slows scaling
    var cheaperStealth = nkBonus(18, nkLevels);
    var modScale = 1 + (scale - 1) / (1 + cheaperStealth / 1500);
    cost = commonDisc * baseCost * Math.pow(modScale, lv) * centurionMult;
  } else if (idx === 1) {
    // Way_of_Bargain: Cheaper_Bargain (NL 26) slows scaling
    var cheaperBargain = nkBonus(26, nkLevels);
    var modScale1 = 1 + (scale - 1) / (1 + cheaperBargain / 1500);
    cost = commonDisc * baseCost * Math.pow(modScale1, lv) * centurionMult;
  } else if (idx === 3) {
    // Mastery_Loot: Cheaper_Mastery (NL 24) discount
    var cheaperMastery = nkBonus(24, nkLevels);
    cost = commonDisc * (1 / (1 + cheaperMastery / 100)) * baseCost * Math.pow(scale, lv) * centurionMult;
  } else if (idx === 4) {
    // Way_of_Haste: Cheaper_Haste (NL 25) discount
    var cheaperHaste = nkBonus(25, nkLevels);
    cost = commonDisc * (1 / (1 + cheaperHaste / 100)) * baseCost * Math.pow(scale, lv) * centurionMult;
  } else {
    // Default: common * base * scale^lv * centurion
    cost = commonDisc * baseCost * Math.pow(scale, lv) * centurionMult;
  }

  return cost;
}

// ----- Stealth -----
// Game: (10 + NLbonuses(13) * sneakLv) * stealthMulti
//       * (1 + funeralFlowers/100)
//       * (1 + 2 * fractalIsland * sneakLv / 100)
//       * (1 + emperorBon(0)/100)
//       * (1 + rog32/100)
//       * (1 + NLbonuses(23)/100)
//   stealthMulti = many sources (statues, star signs, cards, gemstone, voting, lamp, holes)
export function stealthValue(sneakLv, nkLevels, stealthMulti, extras) {
  var ex = extras || {};
  var baseStealth = 10 + nkBonus(13, nkLevels) * sneakLv;
  var shhMulti = 1 + nkBonus(23, nkLevels) / 100;
  var funeralPct = ex.funeralPct || 0;
  var fractalPct = ex.fractalPct || 0;
  var emperorPct = ex.emperorPct || 0;
  var rog32 = ex.rog32 || 0;
  return baseStealth * stealthMulti
    * (1 + funeralPct / 100)
    * (1 + fractalPct / 100)
    * (1 + emperorPct / 100)
    * (1 + rog32 / 100)
    * shhMulti;
}

// Detection chance: max(0, min(1, 1 - 1.1 * stealth / (stealth + baseDetection)))
export function detectionChance(stealth, floor, mastery) {
  var base = floorDetectionBase(floor, mastery);
  if (base <= 0) return 0;
  return Math.max(0, Math.min(1, 1 - 1.1 * stealth / (stealth + base)));
}

// ----- Action Speed -----
// 1 + (NLbonuses(4) + NinjaBonus(t,2) + gloveSPD + NinjaBonus(24,-1)) / 100
export function actionSpeed(nkLevels, equipSpd) {
  return 1 + (nkBonus(4, nkLevels) + (equipSpd || 0)) / 100;
}

// ----- KO Duration -----
// 7200 / (1 + (NLbonuses(15) + NinjaBonus(t,1)) / 100)
export function koDuration(nkLevels, equipKO) {
  return 7200 / (1 + (nkBonus(15, nkLevels) + (equipKO || 0)) / 100);
}

// ----- Jade Emporium -----
export const JADE_UPG_COUNT = JadeUpg.length;

export function jadeUpgName(idx) {
  return (JadeUpg[idx]?.[0] || '').replace(/_/g, ' ').replace(/'/g, "'");
}
export function jadeUpgDesc(idx) {
  return (JadeUpg[idx]?.[6] || '').replace(/_/g, ' ').replace(/\\'/g, "'");
}

// Emporium cost: (300 + 500*t + t^3) * 2.52^t * 3.07^max(0,t-28) * 160^max(0,t-38)
export function emporiumCost(idx) {
  return (300 + 500 * idx + Math.pow(idx, 3))
    * Math.pow(2.52, idx)
    * Math.pow(3.07, Math.max(0, idx - 28))
    * Math.pow(160, Math.max(0, idx - 38));
}

// ----- Pristine Charms -----
export const PRISTINE_COUNT = 23;

export function pristineName(idx) {
  // From NjEQ data — use the item name lookup
  var names = [
    'Sparkle Log','Fruit Rolle','Glowing Veil','Cotton Candy','Sugar Bomb',
    'Gumm Eye','Bubblegum Law','Sour Wowzer','Crystal Comb','Rock Candy',
    'Lollipop Law','Taffy Disc','Stick of Chew','Treat Sack','Gumm Stick',
    'Lolly Flower','Gumball Necklace','Liqorice Rolle','Glimmerchain',
    'Twinkle Taffy','Jellypick','Candy Cache','Mystery Fizz'
  ];
  return names[idx] || 'Charm ' + idx;
}

export function pristineBonus(idx) {
  return pristineCharmBonus(idx);
}

export function pristineDesc(idx) {
  var descs = [
    'Total DMG multi','AGI %','Artifact Find multi','Drop Rate multi',
    'STR %','LUK %','Kill per Kill multi','Sneaking EXP %',
    'Summoning Winner multi','Farming EXP %','WIS %','Overgrowth Chance multi',
    'All Essence multi','Jade Coin multi','Golden Food %',
    'Printer Output %','Money from Monsters multi','Non-Misc Stamp multi',
    'Deathbringer Bones multi','Windwalker Dust multi','Stamp Doubler %',
    'Villager EXP multi','Arcane Cultist Tachyons multi'
  ];
  return descs[idx] || '';
}

// ----- Twin data parsing -----
export function parseTwinData(ninjaData) {
  var twins = [];
  for (var i = 0; i < 12; i++) {
    var d = ninjaData?.[i];
    if (!d) { twins.push(null); continue; }
    twins.push({
      floor: Number(d[0]) || 0,
      stealth: Number(d[1]) || 0,
      field2: Number(d[2]) || 0,
      untieProgress: Number(d[3]) || 0,
    });
  }
  return twins;
}

export function isTwinUntied(twinIdx, ninjaData) {
  var progress = Number(ninjaData?.[twinIdx]?.[3]) || 0;
  var required = Number(NinjaInfo[8]?.[twinIdx]) || 0;
  return progress >= required;
}

// ----- Parse equipment per twin -----
export function parseTwinEquip(ninjaData, twinIdx) {
  var baseSlot = 12 + 4 * twinIdx;
  var equip = [];
  for (var s = 0; s < 4; s++) {
    var slot = ninjaData?.[baseSlot + s];
    if (!slot || !slot[0]) { equip.push(null); continue; }
    equip.push({ name: String(slot[0]), level: Number(slot[1]) || 0 });
  }
  return equip;
}

// ----- Format large numbers -----
export function fmtJade(n) {
  if (n == null || isNaN(n)) return '0';
  if (n >= 1e18) return (n / 1e18).toFixed(2) + 'Qi';
  if (n >= 1e15) return (n / 1e15).toFixed(2) + 'Q';
  if (n >= 1e12) return (n / 1e12).toFixed(2) + 'T';
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return Math.floor(n).toLocaleString();
}

// ----- Charm stat (ItemStat for type 2 equippable charms) -----
// part1 = min(base + max * lv/(lv+50), max),  part2 = min(max * lv/(lv+900), max)
export function charmStat(itemKey, level) {
  var data = NjEQ[itemKey];
  if (!data || Number(data[0]) !== 2) return 0;
  var base = Number(data[3]) || 0;
  var max = Number(data[5]) || 0;
  var lvl = Number(level) || 0;
  var part1 = Math.min(base + max * (lvl / (lvl + 50)), max);
  var part2 = Math.min(max * (lvl / (lvl + 900)), max);
  return part1 + part2;
}

export function charmBonusType(itemKey) {
  var data = NjEQ[itemKey];
  return data ? Number(data[1]) || 0 : -1;
}

export function charmDisplayName(itemKey) {
  var data = NjEQ[itemKey];
  if (!data) return itemKey;
  return (data[2] || '').replace(/_/g, ' ');
}

export function isGoldCharm(itemKey) {
  var data = NjEQ[itemKey];
  return data ? String(data[2] || '').indexOf('Gold ') !== -1 || String(data[2] || '').indexOf('Gold_') !== -1 : false;
}

var WEAPON_CLASS = { 0: 'Gloves', 1: 'Nunchaku', 2: 'Kunai', 3: 'Katana' };
export function equipInfo(itemKey, level) {
  var data = NjEQ[itemKey];
  if (!data) return null;
  var type = Number(data[0]) || 0;
  var bt = Number(data[1]) || 0;
  var name = (data[2] || '').replace(/_/g, ' ');
  if (type === 0) return { type: 0, name: name, label: 'Hat', desc: (data[3] || '').replace(/_/g, ' '), stat: null };
  if (type === 1) { var dmg = Number(data[3]) || 0; return { type: 1, name: name, label: WEAPON_CLASS[bt] || 'Weapon', desc: 'Damage: ' + dmg, stat: dmg }; }
  if (type === 2) {
    var sv = charmStat(itemKey, level);
    var desc = (data[4] || '').replace(/_/g, ' ').replace(/\{/g, '' + sv.toFixed(1)).replace(/\}/g, '' + (1 + sv / 100).toFixed(2));
    return { type: 2, name: name, label: CHARM_BONUS_TYPES[bt] || 'Unknown charm bonus', desc: desc, stat: sv, bonusType: bt };
  }
  return { type: type, name: name, label: 'Unknown equipment type', desc: '', stat: null };
}

// ----- Funeral stealth bonus -----
// FuneralStealthz(floor) = Spelunk[15][floor] * NLbonuses(21)
export function funeralStealthBonus(floorFlowers, nkLevels) {
  return (floorFlowers || 0) * nkBonus(21, nkLevels);
}

// ----- Stealth sim: back-compute core stealth, reapply for any floor -----

// Ally stealth bonus multiplier for a twin given who else is on the same floor.
// otherAllyPcts = array of {type8: %, type16: %} for each OTHER twin on the same floor.
export function allyStealthMulti(otherAllyPcts) {
  var bonus = 1;
  for (var i = 0; i < otherAllyPcts.length; i++) {
    bonus += (otherAllyPcts[i].type8 || 0) / 100;
    bonus += (otherAllyPcts[i].type16 || 0) / 100;
  }
  return bonus;
}

// Back-compute the twin's "core stealth" (everything except ally + funeral),
// given saved stealth, current ally multiplier, and current funeral multiplier.
export function coreStealthFromSaved(savedStealth, curAllyMulti, curFuneralPct) {
  var funeralMulti = 1 + (curFuneralPct || 0) / 100;
  return savedStealth / curAllyMulti / funeralMulti;
}

// Compute stealth for a sim scenario: twin on targetFloor with given allies.
export function simStealth(coreStealth, allyMulti, targetFuneralPct) {
  return coreStealth * allyMulti * (1 + (targetFuneralPct || 0) / 100);
}

// ----- NLbonuses with mastery (special cases for 6,7,10,11,12) -----
export function nkBonusFull(idx, nkLevels, masteryLevel, extras) {
  var base = nkBonus(idx, nkLevels);
  var masteryLoot = nkBonus(3, nkLevels);
  if (idx === 11) {
    var ex = extras || {};
    return Math.round(base + masteryLoot * (masteryLevel || 0)
      + (ex.ninjaBonus21 || 0)
      + Math.ceil(ex.gemstone7 || 0)
      + Math.floor((ex.palette30 || 0) + (ex.vault88 || 0) + 100 * (ex.cloud53 || 0)));
  }
  if (idx === 6 || idx === 7 || idx === 10 || idx === 12) {
    return base + masteryLoot * (masteryLevel || 0);
  }
  return base;
}

// ----- Max drop level per item type -----
// Hat=0 always, Charm=NK11, Gloves=NK10, Nunchaku=NK12, Kunai=NK7, Katana=NK6
export function maxDropLevel(itemKey, nkLevels, masteryLevel, extras) {
  var data = NjEQ[itemKey];
  if (!data) return 0;
  var t = Number(data[0]) || 0;
  if (t === 0) return 0; // hats always level 0
  if (t === 2) return nkBonusFull(11, nkLevels, masteryLevel, extras); // charms
  if (t === 1) {
    var sub = Number(data[1]) || 0;
    if (sub === 1) return nkBonusFull(12, nkLevels, masteryLevel, extras); // nunchaku
    if (sub === 2) return nkBonusFull(7, nkLevels, masteryLevel, extras);  // kunai
    if (sub === 3) return nkBonusFull(6, nkLevels, masteryLevel, extras);  // katana
    return nkBonusFull(10, nkLevels, masteryLevel, extras); // gloves
  }
  return 0;
}

// ----- Stealth needed for target detection chance -----
// det = max(0, min(1, 1 - 1.1 * s / (s + base)))
// Solved: s = (1 - det) * base / (0.1 + det)
export function stealthForDetection(floor, targetDet, mastery) {
  var base = floorDetectionBase(floor, mastery);
  if (base <= 0) return 0;
  var d = Math.max(0, Math.min(1, targetDet));
  return (1 - d) * base / (0.1 + d);
}

// ----- Parse inventory charms (Ninja[60..98]; native InvSpace = 39) -----
export function parseInventoryCharms(ninjaData) {
  var inv = [];
  for (var e = 0; e < 39; e++) {
    var slot = ninjaData?.[60 + e];
    if (!slot || !slot[0] || slot[0] === 'Blank') continue;
    var key = String(slot[0]);
    var data = NjEQ[key];
    if (!data) continue;
    var name = (data[2] || '').replace(/_/g, ' ');
    inv.push({
      slot: e,
      key: key,
      name: name,
      level: Number(slot[1]) || 0,
      type: Number(data[0]) || 0,
      bonusType: Number(data[1]) || 0,
      isGold: name.indexOf('Gold ') !== -1 || name.indexOf('Gold_') !== -1,
      stat: charmStat(key, Number(slot[1]) || 0),
      desc: (data[4] || '').replace(/_/g, ' '),
    });
  }
  return inv;
}

// ----- Best inventory bonus per type (Gold_ items only) -----
export function bestInventoryBonuses(ninjaData) {
  var best = {};
  var inv = parseInventoryCharms(ninjaData);
  for (var i = 0; i < inv.length; i++) {
    if (!inv[i].isGold) continue;
    var bt = inv[i].bonusType;
    if (!best[bt] || inv[i].stat > best[bt].stat) {
      best[bt] = inv[i];
    }
  }
  return best;
}

// ----- Equippable charm data from NjEQ -----
export function allEquippableCharms() {
  var charms = [];
  for (var key in NjEQ) {
    if (Number(NjEQ[key][0]) === 2) {
      charms.push({
        key: key,
        bonusType: Number(NjEQ[key][1]) || 0,
        name: (NjEQ[key][2] || '').replace(/_/g, ' '),
        base: Number(NjEQ[key][3]) || 0,
        desc: (NjEQ[key][4] || '').replace(/_/g, ' '),
        max: Number(NjEQ[key][5]) || 0,
        isGold: String(NjEQ[key][2] || '').indexOf('Gold') !== -1,
      });
    }
  }
  return charms;
}

export function expectedAtLeastOne(successRatePerHour, hours) {
  var expected = Math.max(0, Number(successRatePerHour) || 0) * Math.max(0, Number(hours) || 0);
  return 1 - Math.exp(-expected);
}

export function captiveTargetForFloor(floor, ninjaData, playerCount) {
  var count = Math.max(0, Math.min(12, Number(playerCount) || 12));
  for (var twinIdx = 0; twinIdx < count; twinIdx++) {
    if (isTwinUntied(twinIdx, ninjaData)) continue;
    if ((Number(NinjaInfo[7]?.[twinIdx]) || 0) === Number(floor)) return twinIdx;
  }
  return -1;
}

export function sneakingActionMode(twinIdx, floor, ninjaData, options) {
  options = options || {};
  if (!isTwinUntied(twinIdx, ninjaData)) return 'captive';
  if (Number(floor) <= 0) return 'training';
  var weapon = ninjaData?.[13 + 4 * twinIdx] || [];
  var data = NjEQ[String(weapon[0] || 'Blank')];
  var subtype = options.weaponSubtype != null ? Number(options.weaponSubtype) || 0 : Number(data?.[1]) || 0;
  if (subtype === 1 && options.doorActive) return 'door';
  if (subtype === 2 && captiveTargetForFloor(floor, ninjaData, options.playerCount) >= 0) return 'untie';
  return 'normal';
}

// ----- Charm bonus description by type -----
export var CHARM_BONUS_TYPES = {
  0: 'Dodge %', 1: 'KO reduction %', 2: 'Action speed %',
  3: 'EXP redirect %', 4: 'Total Stealth x', 5: 'Item Find %',
  6: 'Jade % (2x if 0% det)', 7: 'EXP+Jade+Stealth %',
  8: 'Floor Stealth %', 9: 'Inv: Jade x', 10: 'Inv: EXP %',
  11: 'Inv: NK cost -%', 12: 'Inv: Charm bonus x',
  13: 'EXP % (3x solo)', 14: 'Jade % (3x solo)',
  15: 'Jade %', 16: 'Floor Stealth %',
  17: 'Total Stealth x', 18: 'Inv: Damage %',
  19: 'EXP+Jade % (3x solo)', 20: 'Inv: Total Stealth %',
  21: 'Inv: Charm max LV +', 22: 'Inv: Dmg/10 sneak LV %',
  23: 'Inv: Jade/10 sneak LV %', 24: 'Inv: Action speed %',
};

// ----- Item find odds per action -----
// Game: 3 * actions / (actions + 50) * (1 + (NLbonuses(14) + NinjaBonus(t,5)) / 100) * bubbleY9
// bubbleY9Val = raw decayMulti value from Y9ACTIVE bubble (1 + 0.3*lv/(lv+60))
// We approximate with high action count (steady-state) → 3*a/(a+50) ≈ 3 for a >> 50
// Pass actual accumulated actions if known, otherwise defaults to steady-state
export function itemFindExpected(nkLevels, equipItemFind, successfulActions, bubbleY9Val, phase) {
  var actionCount = Math.max(0, Number(successfulActions) || 0);
  var itemFindPhase = phase == null ? 2 : Number(phase) || 0;
  if (itemFindPhase === 0) return actionCount > 0 ? 1 : 0;
  if (itemFindPhase === 1) return actionCount > 0 ? 0.4 : 0;
  if (actionCount <= 0) return 0;
  var baseChance = 3 * actionCount / (actionCount + 50);
  var nk14 = nkBonus(14, nkLevels);
  var bonus = 1 + (nk14 + (equipItemFind || 0)) / 100;
  var y9 = 1 + Math.max(0, Math.min(100, 100 * ((bubbleY9Val || 1) - 1))) / 100;
  return baseChance * bonus * y9;
}

export function itemFindExpectedFromRate(nkLevels, equipItemFind, successRatePerHour, hours, bubbleY9Val, phase, batchStats) {
  var batchHours = Math.max(0.01, Number(hours) || 1);
  var rateMean = Math.max(0, Number(successRatePerHour) || 0) * batchHours;
  var expectedSuccesses = batchStats ? Math.max(0, Number(batchStats.mean) || 0) : rateMean;
  var probabilityZero = batchStats
    ? Math.max(0, Math.min(1, Number(batchStats.probabilityZero) || 0))
    : Math.exp(-rateMean);
  var itemFindPhase = phase == null ? 2 : Number(phase) || 0;
  if (itemFindPhase === 0) return 1 - probabilityZero;
  if (itemFindPhase === 1) return 0.4 * (1 - probabilityZero);
  if (expectedSuccesses <= 0) return 0;
  var expectedFraction = 0;
  if (batchStats && Array.isArray(batchStats.pmf)) {
    expectedFraction = batchStats.pmf.reduce(function(sum, row) {
      var count = Math.max(0, Number(row.count) || 0);
      return sum + (Number(row.probability) || 0) * count / (count + 50);
    }, 0);
  } else if (batchStats) {
    var variance = Math.max(0, Number(batchStats.variance) || 0);
    var statsDenom = expectedSuccesses + 50;
    expectedFraction = expectedSuccesses / statsDenom - 50 * variance / Math.pow(statsDenom, 3);
  } else if (expectedSuccesses > 100) {
    var denom = expectedSuccesses + 50;
    expectedFraction = expectedSuccesses / denom - 50 * expectedSuccesses / Math.pow(denom, 3);
  } else {
    var probability = Math.exp(-expectedSuccesses);
    var probabilitySum = probability;
    var weightedSum = 0;
    var maxCount = Math.ceil(expectedSuccesses + 12 * Math.sqrt(expectedSuccesses) + 100);
    for (var count = 1; count <= maxCount; count++) {
      probability *= expectedSuccesses / count;
      probabilitySum += probability;
      weightedSum += probability * count / (count + 50);
    }
    expectedFraction = probabilitySum > 0 ? weightedSum / probabilitySum : 0;
  }
  var nk14 = nkBonus(14, nkLevels);
  var bonus = 1 + (nk14 + (equipItemFind || 0)) / 100;
  var y9 = 1 + Math.max(0, Math.min(100, 100 * ((bubbleY9Val || 1) - 1))) / 100;
  return 3 * Math.max(0, Math.min(1, expectedFraction)) * bonus * y9;
}

export function itemFindChance(nkLevels, equipItemFind, accumActions, bubbleY9Val) {
  return itemFindExpected(nkLevels, equipItemFind, accumActions == null ? 1 : accumActions, bubbleY9Val, 2);
}

// ----- Door effective HP at a given mastery -----
// Game: mastery < masteryMax ? 0 : scaled NinjaInfo[3][floor]
// For what-if: at max mastery doors appear, otherwise 0
export function doorEffectiveHP(floor, masteryLevel, masteryMax) {
  if (masteryLevel < masteryMax) return 0;
  return doorHP(floor, masteryLevel);
}

// Current mastery uses saved door progress and only the first uncleared door is
// actionable. Other mastery columns are what-if scenarios with a fresh door.
export function doorState(floor, masteryLevel, masteryMax, currentMastery, ninjaData) {
  if (floor <= 0) {
    return { active: false, floor: floor, maxHP: 0, progress: 0, remainingHP: 0 };
  }
  var maxHP = doorEffectiveHP(floor, masteryLevel, masteryMax);
  if (!(maxHP > 0)) {
    return { active: false, floor: floor, maxHP: 0, progress: 0, remainingHP: 0 };
  }

  if (masteryLevel !== currentMastery) {
    return { active: true, hypothetical: true, floor: floor, maxHP: maxHP, progress: 0, remainingHP: maxHP };
  }

  var progressRows = ninjaData && ninjaData[100] || [];
  var activeFloor = -1;
  for (var candidate = 1; candidate < FLOOR_COUNT; candidate++) {
    var candidateMax = doorHP(candidate, masteryLevel);
    var candidateProgress = Number(progressRows[candidate]) || 0;
    if (candidateMax > candidateProgress) {
      activeFloor = candidate;
      break;
    }
  }

  var progress = Number(progressRows[floor]) || 0;
  var remaining = Math.max(0, maxHP - progress);
  return {
    active: floor === activeFloor && remaining > 0,
    hypothetical: false,
    floor: floor,
    activeFloor: activeFloor,
    maxHP: maxHP,
    progress: progress,
    remainingHP: floor === activeFloor ? remaining : 0,
  };
}
