// ===== MONSTER EXP DESCRIPTOR =====
// MonsterEXP formula from ExpMulti(e=0).
// 7-stage computation: ExpGainLUK through ExpGainLUK6, then final combine.
// Scope: character (TotalStats and talents are per-character).

import { companions, pristineBon, vaultUpgBonus, sigilBonus as sigilBonusFn,
  getSetBonus, votingBonusz, goldFoodBonuses, cardLv,
} from '../systems/common/goldenFood.js';
import { eventShopOwned, superBitType } from '../../game-helpers.js';
import { getLOG, formulaEval } from '../../formulas.js';
import { label } from '../entity-names.js';
import { grid, mainframeBonus, computePetArenaBonus } from '../systems/w4/lab.js';
import { arcadeBonus } from '../systems/w2/arcade.js';
import { achieveStatus } from '../systems/common/achievement.js';
import { legendPTSbonus, computeBigFishBonus } from '../systems/w7/spelunking.js';
import { computeCardBonusByType, computeBoxReward, computeTotalStat } from '../systems/common/stats.js';
import { isBubblePrismad, getPrismaBonusMult } from '../systems/w2/alchemy.js';
import { AlchemyDescription, DungPassiveStats2, StatueInfo,
  SaltLicks } from '../data/game/customlists.js';
import { cauldronInfoData, optionsListData, prayersPerCharData,
  numCharacters, divinityData, charClassData,
  cauldronBubblesData, currentMapData } from '../../save/data.js';
import { bubbleParams } from '../data/w2/alchemy.js';
import { prayerBaseBonus } from '../data/w3/prayer.js';
import { etcBonus } from '../systems/common/etcBonus.js';
import { guild } from '../systems/common/guild.js';
import { friend } from '../systems/common/friend.js';
import { talent } from '../systems/common/talent.js';
import { computeMeritocBonusz } from '../systems/w7/meritoc.js';
import { computeWinBonus } from '../systems/w6/summoning.js';
import { grimoireUpgBonus22, grimoire } from '../systems/mc/grimoire.js';
import { GrimoireUpg } from '../data/game/customlists.js';
import { exoticBonusQTY40 } from '../systems/w6/farming.js';
import { computeShinyBonusS } from '../systems/w4/breeding.js';
import { gambitPTSmulti } from '../systems/w5/hole.js';
import { holes } from '../systems/w5/hole.js';
import { rogBonusQTY } from '../systems/w7/sushi.js';
import { dancingCoralBase } from '../data/w7/research.js';
import { saveData } from '../../state.js';
import { computeStampBonusOfTypeX } from '../systems/w1/stamp.js';
import { computeOwlBonus } from '../systems/w1/owl.js';
import { computeExoticBonus, computeStickerBonus } from '../systems/w6/farming.js';
import { computeMSABonus } from '../systems/w4/gaming.js';
import { computeAllShimmerBonuses } from '../systems/w3/equinox.js';
import { computeStarSignBonus } from '../systems/common/starSign.js';
import { computeWorkbenchStuff as _computeWorkbenchStuff } from '../systems/common/stats.js';
import { computeCompassBonus, computeTotalTitanKills } from '../systems/w7/compass.js';
import { computeArcaneMapMultiBon } from '../systems/mc/tesseract.js';
import { bubbaRoGBonuses } from '../systems/w7/bubba.js';
import { computeButtonBonus } from './helpers.js';

// =========== Shared helpers (same as coin-multi.js) ===========

function rval(resolver, id, ctx, args) {
  try { return resolver.resolve(id, ctx, args).val || 0; }
  catch(e) { return 0; }
}

function safe(fn) {
  try {
    var args = [];
    for (var i = 1; i < arguments.length; i++) args.push(arguments[i]);
    var v = fn.apply(null, args);
    return (v !== v || v == null) ? 0 : v;
  } catch(e) { return 0; }
}

// Bubble value by effect key (same as coin-multi.js)
function bubbleValByKey(key, charIdx) {
  for (var c2 = 0; c2 < 4; c2++) {
    var arr = AlchemyDescription[c2];
    if (!arr) continue;
    for (var i = 0; i < arr.length; i++) {
      if (arr[i] && arr[i][15] === key) {
        var lv = Number((cauldronInfoData && cauldronInfoData[c2] && cauldronInfoData[c2][i]) || 0);
        if (lv <= 0) return 0;
        var baseVal = formulaEval(arr[i][3], Number(arr[i][1]), Number(arr[i][2]), lv);
        var isPrisma = isBubblePrismad(c2, i);
        var prismaMult = isPrisma ? Math.max(1, getPrismaBonusMult()) : 1;
        var val = baseVal * prismaMult;
        var cls = Number(charClassData && charClassData[charIdx]) || 0;
        if (cls > 6 && i !== 16 && i < 30 &&
            key.indexOf('passz') < 0 && key.indexOf('ACTIVE') < 0 && key.indexOf('AllCharz') < 0) {
          if (c2 === 0 && cls < 18 && key !== 'Construction') {
            val *= Math.max(1, bubbleValByKey('Opassz'));
          } else if (c2 === 1 && cls >= 18 && cls < 30) {
            val *= Math.max(1, bubbleValByKey('Gpassz'));
          } else if (c2 === 2 && cls >= 30 && cls < 42) {
            val *= Math.max(1, bubbleValByKey('Ppassz'));
          }
        }
        return val;
      }
    }
  }
  return 0;
}

// Compute StatueBonusGiven for any statue index (same as coin-multi.js)
function computeStatueBonusGiven(idx) {
  var s = saveData;
  var statueLv = Number(s.statueData && s.statueData[idx]) || 0;
  if (statueLv <= 0) return 0;
  var baseBonus = Number(StatueInfo[idx] && StatueInfo[idx][3]) || 1;
  var val = statueLv * baseBonus;
  if (idx === 0 || idx === 2 || idx === 8 || idx === 7) {
    if (idx !== 7) val *= Math.max(1, 1 + rval(talent, 112, { saveData: s, charIdx: 0 }, { mode: 'max' }) / 100);
    if (idx !== 8) val *= Math.max(1, 1 + rval(talent, 127, { saveData: s, charIdx: 0 }, { mode: 'max' }) / 100);
  } else if (idx === 1 || idx === 11 || idx === 9 || idx === 14) {
    if (idx !== 14) val *= Math.max(1, 1 + rval(talent, 292, { saveData: s, charIdx: 0 }, { mode: 'max' }) / 100);
    if (idx !== 9) val *= Math.max(1, 1 + rval(talent, 307, { saveData: s, charIdx: 0 }, { mode: 'max' }) / 100);
  } else if (idx === 10 || idx === 6 || idx === 12 || idx === 13) {
    if (idx !== 13) val *= Math.max(1, 1 + rval(talent, 487, { saveData: s, charIdx: 0 }, { mode: 'max' }) / 100);
    if (idx !== 12) val *= Math.max(1, 1 + rval(talent, 472, { saveData: s, charIdx: 0 }, { mode: 'max' }) / 100);
  } else if (idx === 3 || idx === 5 || idx === 17) {
    val *= Math.max(1, 1 + rval(talent, 37, { saveData: s, charIdx: 0 }, { mode: 'max' }) / 100);
  }
  var statueG = Number(s.statueGData && s.statueGData[idx]) || 0;
  if (statueG >= 2) {
    var art30val = 0;
    var art30tier = Number(s.sailingData && s.sailingData[3] && s.sailingData[3][30]) || 0;
    if (art30tier > 0) {
      var sailArt = s.sailingData && s.sailingData[3];
      art30val = (Number(sailArt && sailArt[30]) || 0) > 0 ? 30 * Math.max(1, art30tier) : 0;
    }
    val *= Math.max(1, 1 + (100 + art30val) / 100);
  }
  if (statueG >= 3) {
    var zmLv = Number(s.spelunkData && s.spelunkData[45] && s.spelunkData[45][0]) || 0;
    var zmMulti = 1;
    try { var ZenithMarket = require('../data/game/customlists.js').ZenithMarket; zmMulti = Number(ZenithMarket[0][4]) || 1; } catch(e) {}
    var zmBonus = Math.floor(zmMulti * zmLv);
    val *= Math.max(1, 1 + (50 + zmBonus) / 100);
  }
  if (idx === 0 || idx === 1 || idx === 2 || idx === 6) {
    var vub25 = safe(vaultUpgBonus, 25);
    val *= Math.max(1, 1 + vub25 / 100);
  }
  if (idx !== 29) {
    var statue29 = computeStatueBonusGiven(29);
    val *= Math.max(1, 1 + statue29 / 100);
  }
  val *= (1 + 0.3 * eventShopOwned(19, saveData.cachedEventShopStr));
  val *= Math.max(1, 1 + rval(talent, 56, { saveData: s, charIdx: 0 }, { mode: 'max' }) / 100);
  val *= (1 + safe(computeMeritocBonusz, 26) / 100);
  return val;
}

// Compute FlurboShop(idx): DungPassiveStats2[idx] = formulaEval(info, lv)
function computeFlurboShop(idx) {
  var s = saveData;
  var dungUpg5 = s.dungUpgData && s.dungUpgData[5];
  if (!dungUpg5) return 0;
  var lv = Number(dungUpg5[idx]) || 0;
  if (lv <= 0) return 0;
  var info = DungPassiveStats2[idx];
  if (!info) return 0;
  return formulaEval(info[3], Number(info[1]) || 0, Number(info[2]) || 0, lv);
}

// Compute SaltLick(idx)
function computeSaltLick(idx) {
  var s = saveData;
  if (!s.saltLickData) return 0;
  var lv = Number(s.saltLickData[idx]) || 0;
  if (lv <= 0) return 0;
  var info = SaltLicks[idx];
  if (!info) return 0;
  return formulaEval(info[3], Number(info[1]) || 0, Number(info[2]) || 0, lv);
}

// Compute prayersReal(prayerIdx, costIdx): 0=bonus, 1=curse
// For bonus (costIdx=0): base * max(1, 1+(lv-1)/10), equipped only
// For curse (costIdx=1): curseBase * max(1, 1+(lv-1)/10), equipped only (negative effect)
function computePrayerReal(prayerIdx, costIdx, ci) {
  var s = saveData;
  var prayerLv = Number(s.prayOwnedData && s.prayOwnedData[prayerIdx]) || 0;
  if (prayerLv <= 0) return 0;
  var equipped = false;
  try { equipped = (prayersPerCharData[ci] || []).includes(prayerIdx); } catch(e) {}
  if (!equipped) return 0;
  var base = safe(prayerBaseBonus, prayerIdx, costIdx);
  var scale = Math.max(1, 1 + (prayerLv - 1) / 10);
  return Math.round(base * scale);
}

// Shrine(idx): game uses ShrineBonusGiven logic
// For simplicity, use the shrine resolver through the registry
function computeShrine(idx, ctx) {
  var shrine;
  try { shrine = require('../systems/w3/construction.js').shrine; } catch(e) { return 0; }
  return rval(shrine, idx, ctx);
}

// Vial value by effect key
function computeVialByKey(key) {
  var vials = AlchemyDescription[4];
  if (!vials) return 0;
  for (var vi = 0; vi < vials.length; vi++) {
    if (!vials[vi] || vials[vi][11] !== key) continue;
    var vialLv = Number((cauldronInfoData && cauldronInfoData[4] && cauldronInfoData[4][vi]) || 0);
    if (vialLv <= 0) return 0;
    var rawVal = formulaEval(vials[vi][3], Number(vials[vi][1]) || 0, Number(vials[vi][2]) || 0, vialLv);
    var labMult = safe(mainframeBonus, 10) === 2 ? 2 : 1;
    var riftActive = Number(saveData.riftData && saveData.riftData[0]) > 34;
    var maxLvVials = 0;
    if (riftActive) {
      var ci4 = cauldronInfoData && cauldronInfoData[4];
      for (var rvi = 0; ci4 && rvi < ci4.length; rvi++) {
        if ((Number(ci4[rvi]) || 0) >= 13) maxLvVials++;
      }
    }
    var dNzz = (riftActive ? 2 * maxLvVials : 0) + safe(vaultUpgBonus, 42);
    var meritoc20 = safe(computeMeritocBonusz, 20);
    return labMult * (1 + dNzz / 100) * (1 + meritoc20 / 100) * rawVal;
  }
  return 0;
}

// CardSetBonuses(0, setId) — card set bonuses
function computeCardSetBonus(setId) {
  var s = saveData;
  var cset = s.cardSetData;
  if (!cset) return 0;
  return Number(cset[setId]) || 0;
}

// WorkbenchStuff("AdditionExtraEXPnDR")
// Game: if Tasks[2][1][2]>0 with world boss check
function computeWorkbenchStuff() {
  var s = saveData;
  var tasks = s.tasksGlobalData;
  if (!tasks || !tasks[2] || !tasks[2][1]) return 1;
  var wbVal = Number(tasks[2][1][2]) || 0;
  if (wbVal <= 0) return 1;
  // WorkbenchStuff returns a multiplier based on world boss completion
  return 1 + wbVal / 100;
}

// MealBonus("Clexp") — sum meals with "Clexp" effect
function computeMealBonus(key) {
  var s = saveData;
  var MealINFO;
  try { MealINFO = require('../data/game/customlists.js').MealINFO; } catch(e) { return 0; }
  var meals0 = s.mealsData && s.mealsData[0];
  if (!meals0) return 0;
  var mf116 = safe(mainframeBonus, 116);
  var shinyS20 = safe(computeShinyBonusS, 20);
  var winBon26 = safe(computeWinBonus, 26);
  var cookMulti = (1 + (mf116 + shinyS20) / 100) * (1 + winBon26 / 100);
  var total = 0;
  var ribbonBonusAt;
  try { ribbonBonusAt = require('../../game-helpers.js').ribbonBonusAt; } catch(e) { return 0; }
  for (var mi = 0; mi < MealINFO.length; mi++) {
    if (!MealINFO[mi] || MealINFO[mi][5] !== key) continue;
    var mealLv = Number(meals0[mi]) || 0;
    if (mealLv <= 0) continue;
    var bonusPerLv = Number(MealINFO[mi][2]) || 0;
    var ribIdx = 28 + mi;
    var ribMeal = ribbonBonusAt(ribIdx, s.ribbonData, String(s.olaData[379] || ''));
    total += cookMulti * ribMeal * mealLv * bonusPerLv;
  }
  return total;
}

// Companions count check
function hasCompanion(id) {
  return saveData.companionIds && saveData.companionIds.has(id);
}

export default {
  id: 'monster-exp',
  name: 'Monster EXP Multiplier',
  scope: 'character',
  category: 'multiplier',

  pools: {},

  combine: function(pools, ctx) {
    var s = ctx.saveData;
    if (!s) return { val: 1, children: null };
    var ci = ctx.charIdx || 0;

    // ======= STAGE 1: ExpGainLUK = TotalStats("LUK") → piecewise transform =======
    var _lukR = computeTotalStat('LUK', ci, ctx); var totalLUK = _lukR.computed;
    var expGainLUK;
    if (totalLUK < 1000) {
      expGainLUK = (Math.pow(totalLUK + 1, 0.37) - 1) / 30;
    } else {
      expGainLUK = (totalLUK - 1000) / (totalLUK + 2500) * 0.8 + 0.3963;
    }

    // ======= STAGE 2: ExpGainLUK2 (conditional additive bonuses) =======
    var egl2 = 0;
    var charLv = Number(s.lv0AllData && s.lv0AllData[ci] && s.lv0AllData[ci][0]) || 0;

    // Highest level check: Tasks[2][0][2] > 0, and char is highest level among all
    var tasks2_0_2 = Number(s.tasksGlobalData && s.tasksGlobalData[2] && s.tasksGlobalData[2][0] &&
      s.tasksGlobalData[2][0][2]) || 0;
    if (tasks2_0_2 > 0) {
      // Check if this char has the highest class level
      var isHighest = true;
      var allUsernames = s.usernamesData || [];
      for (var ui = 0; ui < allUsernames.length; ui++) {
        if (ui === ci) continue;
        var otherLv = Number(s.lv0AllData && s.lv0AllData[ui] && s.lv0AllData[ui][0]) || 0;
        if (otherLv > charLv) { isHighest = false; break; }
      }
      if (isHighest) {
        egl2 += 3 * tasks2_0_2 + safe(vaultUpgBonus, 12);
        if (superBitType(19, s.gamingData) === 1) {
          // ExpGainLUK3 gets +50 later
        }
      }
    }

    // Level-based flat bonuses
    if (charLv < 50) egl2 += computeCardSetBonus('0');
    if (charLv < 120) egl2 += safe(computeMealBonus, 'Clexp');

    // WeeklyBoss.c bonus
    var weeklyBossC = Number(s.weeklyBossData && s.weeklyBossData.c) || 0;
    if (weeklyBossC > 0) egl2 += Math.min(150, weeklyBossC);

    // Level-based flat adds
    if (charLv < 10) egl2 += 150;
    else if (charLv < 30) egl2 += 100;
    else if (charLv < 50) egl2 += 50;

    // Divinity Minor bonus for god style 4
    egl2 += computeDivMinor(ci, 4);

    // CardSetBonuses(0, "5")
    egl2 += computeCardSetBonus('5');

    // ======= STAGE 3: ExpGainLUK3 (SuperBit + Bundle) =======
    var egl3 = 0;
    if (tasks2_0_2 > 0 && superBitType(19, s.gamingData) === 1) egl3 += 50;
    if (s.bundlesData && s.bundlesData.bun_q === 1) egl3 += 20;

    // ======= STAGE 4: ExpGainLUK4 (compass/gambit/vault/grid/grimoire) =======
    var compassBonus51 = safe(computeCompassBonus, 51);

    var holesB47 = rval(holes, 47, ctx);
    var expMulti999 = safe(computeWinBonus, 23); // ExpMulti(999) = WinBonus(23) per game source
    // GrimoireUpgBonus(24): level * perLevel * (1 + grimoire36/100)
    var grimLv24 = Number(s.grimoireData && s.grimoireData[24]) || 0;
    var grimPerLv24 = Number(GrimoireUpg[24] && GrimoireUpg[24][5]) || 0;
    var grimLv36 = Number(s.grimoireData && s.grimoireData[36]) || 0;
    var grimoireUpg24 = grimLv24 * grimPerLv24 * (1 + grimLv36 / 100);
    var vault3 = safe(vaultUpgBonus, 3);
    var vault35 = safe(vaultUpgBonus, 35);
    var ola345 = Number(optionsListData[345]) || 0;
    var holesB83 = Math.min(40, rval(holes, 83, ctx)); // B_UPG(83, 40) — capped at 40

    var egl4 = compassBonus51 + holesB47 + expMulti999 + grimoireUpg24
      + vault3 + vault35 * getLOG(ola345) + holesB83;

    // ======= STAGE 5: ExpGainLUK5 (massive multiplicative chain) =======
    // GenINFO[17] check — this is a server-side flag, use opt-in default
    var genInfo17 = 1; // Assume active (server-controlled)
    var talent429 = rval(talent, 429, ctx, { mode: 'max' });
    var egl5_talentMult = genInfo17 ? Math.max(1, talent429) : 1;

    // Companions multiplicative chain
    var comp37 = safe(companions, 37);
    var comp33 = safe(companions, 33);
    var comp160 = safe(companions, 160);
    var comp32 = safe(companions, 32);
    var comp34 = safe(companions, 34);
    var comp145 = safe(companions, 145);
    var comp50 = safe(companions, 50);
    var compMult = (1 + 9 * comp37) * (1 + comp33) * (1 + 4 * comp160)
      * (1 + comp32) * (1 + comp34) * (1 + comp145);

    // Grid bonuses 130, 131, 132, 152
    var grid130 = rval(grid, 130, ctx);
    var grid131 = rval(grid, 131, ctx);
    var grid132 = rval(grid, 132, ctx);
    var grid152 = rval(grid, 152, ctx);
    var gridMult = 1 + (grid130 + grid131 + grid132 + grid152) / 100;

    // StickerBonus(0)
    var stickerBonus0 = safe(computeStickerBonus, 0);
    // Stickers are stored in farming data

    // SuperBit(63)
    var superBit63 = superBitType(63, s.gamingData) === 1 ? 0.1 : 0;

    // ZenithMarketBonus(9)
    var zenithMarket9 = 0;
    if (s.spelunkData && s.spelunkData[45]) {
      var zmLv = Number(s.spelunkData[45][9]) || 0;
      var zmMulti = 1;
      try { var ZM = require('../data/game/customlists.js').ZenithMarket; zmMulti = Number(ZM[9] && ZM[9][4]) || 1; } catch(e) {}
      zenithMarket9 = Math.floor(zmMulti * zmLv);
    }

    // Comp50 (min 1.01 cap)
    var comp50capped = Math.max(1, Math.min(1.01, 1 + comp50 / 2500));

    var egl5_inner = egl5_talentMult * Math.max(1, compMult * gridMult
      * (1 + stickerBonus0 / 100) * (1 + superBit63) * (1 + zenithMarket9 / 100)
      * comp50capped);

    // EtcBonuses(84), CardBonusREAL(100), Arcade(60), Vials.7classexp
    var etc84 = rval(etcBonus, '84', ctx);
    var _cb100 = safe(computeCardBonusByType, 100, ci);
    var card100 = (typeof _cb100 === 'object' && _cb100) ? (_cb100.val || 0) : Number(_cb100) || 0;
    var arcade60 = safe(arcadeBonus, 60);
    var vial7classexp = safe(computeVialByKey, '7classexp');

    // Talent 434 ^ TotalTitanKills
    var talent434 = rval(talent, 434, ctx, { mode: 'max' });
    var titanKills = safe(computeTotalTitanKills);
    // Total titan kills stored in OLA
    var titanKillsPow = Math.pow(Math.max(1, talent434), titanKills);

    var egl5 = egl5_inner
      * (1 + etc84 / 100) * (1 + card100 / 100) * (1 + arcade60 / 100)
      * (1 + vial7classexp / 100) * titanKillsPow;

    // Second multiplication chain: ArcaneMapMulti(1), BigFishBonuses(4), DancingCoralBonus(3)
    // CoralKidUpgBonus(2) ^ max(0, Divinity[25]-10), CardSetBonuses(0,"12"),
    // BubbaRoG(6), RoG(15)
    var arcaneMapMulti1 = safe(computeArcaneMapMultiBon, 1, ctx);
    var bigFish4 = safe(computeBigFishBonus, 4);
    var dancingCoral3 = dancingCoralBase(3);
    var coralKid2 = Number(optionsListData[430] || 0) || 0; // CoralKidUpgBonus(2) = OLA[428+2] = OLA[430]
    var div25 = Number(s.divinityAllData && s.divinityAllData[25]) || 0;
    var coralKidPow = Math.pow(1 + coralKid2 / 100, Math.max(0, div25 - 10));
    var cardSet12 = computeCardSetBonus('12');
    var bubbaRoG6 = safe(bubbaRoGBonuses, 6); // BubbaRoG_Bonuses(6) — NOT sushi RoG
    var rog15 = rogBonusQTY(15, s.cachedUniqueSushi || 0);

    // DancingCoralBonus(3): base * max(0, tower22 - 200)
    var tower22 = Number(s.towerData && s.towerData[22]) || 0;
    var dancingCoralVal = dancingCoral3 * Math.max(0, tower22 - 200);

    egl5 *= (1 + arcaneMapMulti1 / 100) * (1 + bigFish4 / 100)
      * (1 + dancingCoralVal / 100) * coralKidPow
      * (1 + cardSet12 / 100) * (1 + bubbaRoG6 / 100) * (1 + rog15 / 100);

    // Third chain: Spelunk6.length as pow(1.03, count), SuperBit(24), MeritocBonusz(27), OLA[464]
    var spelunk6len = (s.spelunkData && s.spelunkData[6]) ? s.spelunkData[6].length : 0;
    var superBit24 = superBitType(24, s.gamingData) === 1 ? 1 : 0;
    var meritoc27 = safe(computeMeritocBonusz, 27);
    var ola464 = Number(optionsListData[464]) || 0;
    var ola464bonus = Math.max(0, 5 * (ola464 - 8));
    egl5 *= Math.max(1, Math.pow(1.03, spelunk6len) * superBit24
      * (1 + meritoc27 / 100) * (1 + ola464bonus / 100));

    // ======= STAGE 6: ExpGainLUK6 (additive pool) =======
    var cardSpringEvent1 = 2 * safe(cardLv, 'springEvent1');
    var comp3 = safe(companions, 3);
    var comp50add = safe(companions, 50);
    var shimmerOla179 = Number(optionsListData[179]) || 0;
    var shimmerBonus = safe(computeAllShimmerBonuses);
    var gfoodClassEXP = 0;
    try {
      var _gf = goldFoodBonuses('ClassEXPz', ci);
      gfoodClassEXP = (_gf && typeof _gf === 'object') ? (Number(_gf.total) || 0) : (Number(_gf) || 0);
    } catch(e) {}
    var owlBonus0 = safe(computeOwlBonus, 0);
    var voting15 = safe(votingBonusz, 15, 1); // VotingBonusz(15)
    var monumentROG16 = rval(holes, 'monument6', ctx);
    var ironSet = safe(getSetBonus, 'IRON_SET');
    var exotic50 = safe(computeExoticBonus, 50);
    var ola421 = Number(optionsListData[421]) || 0;
    var stampClassXP = safe(computeStampBonusOfTypeX, 'classxp');
    var friendStatz1 = 0; // FriendBonusStatz(1)
    try { friendStatz1 = rval(friend, 1, ctx); } catch(e) {}
    var comp47 = safe(companions, 47);
    var comp111 = safe(companions, 111);
    var bb8 = computeButtonBonus(8, saveData);

    var egl6 = cardSpringEvent1 + comp3 + comp50add
      + shimmerOla179 * shimmerBonus + gfoodClassEXP + owlBonus0 + voting15
      + monumentROG16 + egl4 + ironSet + exotic50 + ola421
      + stampClassXP + friendStatz1 + comp47 + comp111 + bb8;

    // ======= FINAL: MonsterEXP combine =======
    // WorkbenchStuff × (1+EGL3/100) × EGL5 × (1+EtcBonuses("78")/100)
    // × (EGL/1.8 × (1+talent35/100) + additivePool/100 + 1)
    var wb = safe(computeWorkbenchStuff);
    var etc78 = rval(etcBonus, '78', ctx);
    var talent35 = rval(talent, 35, ctx);

    // Additive pool
    var etc4 = rval(etcBonus, '4', ctx);
    var _br = safe(computeBoxReward, ci, 'monsterExp');
    var boxMonsterExp = (typeof _br === 'object' && _br) ? (_br.val || 0) : Number(_br) || 0;
    var totalFoodClassEXP = 0;
    try {
      var _gfCE = goldFoodBonuses('ClassEXP', ci);
      totalFoodClassEXP = (_gfCE && typeof _gfCE === 'object') ? (Number(_gfCE.total) || 0) : (Number(_gfCE) || 0);
    } catch(e) {}
    var starSignMainXP = safe(computeStarSignBonus, 'MainXP', ci);
    var vialMonsterEXP = safe(computeVialByKey, 'MonsterEXP');
    var bubbleExpActive = safe(bubbleValByKey, 'expACTIVE', ci);
    var _cb44 = safe(computeCardBonusByType, 44, ci);
    var card44 = (typeof _cb44 === 'object' && _cb44) ? (_cb44.val || 0) : Number(_cb44) || 0;
    var statue10 = safe(computeStatueBonusGiven, 10);
    var talent632 = rval(talent, 632, ctx);
    var shrine5 = computeShrine(5, ctx);
    var saltLick3val = safe(computeSaltLick, 3);
    var prayer0 = computePrayerReal(0, 0, ci);
    var prayer2 = computePrayerReal(2, 0, ci);
    var prayer9curse = computePrayerReal(9, 1, ci);
    var flurbo2 = safe(computeFlurboShop, 2);
    var ach57 = safe(achieveStatus, 57);
    var ach357 = 20 * safe(achieveStatus, 357);
    var ach61 = 3 * safe(achieveStatus, 61);
    var ach124 = 2 * safe(achieveStatus, 124);
    var ach188 = 5 * safe(achieveStatus, 188);
    var arcade12 = safe(arcadeBonus, 12);
    var sigilBonus8 = safe(sigilBonusFn, 8);
    var ach286 = 25 * safe(achieveStatus, 286);
    var shinyBonus1 = safe(computeShinyBonusS, 1);
    var gamingMSA4 = safe(computeMSABonus, 4);
    var talent55 = rval(talent, 55, ctx, { mode: 'max' });

    var additivePool = etc4 + boxMonsterExp + totalFoodClassEXP + starSignMainXP
      + vialMonsterEXP + bubbleExpActive + card44 + egl2 + statue10
      + talent632 + shrine5 + saltLick3val
      + prayer0 + prayer2 - prayer9curse + flurbo2
      + ach57 + ach357 + ach61 + ach124 + ach188
      + arcade12 + sigilBonus8 + ach286 + shinyBonus1
      + gamingMSA4 + talent55 + egl6;

    var lukContrib = expGainLUK * (1 + talent35 / 100) / 1.8;
    var val = wb * (1 + egl3 / 100) * egl5 * (1 + etc78 / 100)
      * (lukContrib + additivePool / 100 + 1);

    // NaN guard
    if (val !== val || val == null) val = 1;

    // ======= Build breakdown tree =======
    var children = [];

    children.push({ name: 'WorkbenchStuff', val: wb, fmt: 'x' });
    children.push({ name: 'SuperBit + Bundle', val: 1 + egl3 / 100, fmt: 'x',
      note: 'EGL3=' + egl3 });
    children.push({ name: 'ExpGainLUK5 (multiplicative)', val: egl5, fmt: 'x' });
    children.push({ name: 'EtcBonuses(78)', val: 1 + etc78 / 100, fmt: 'x' });

    var lukPart = { name: 'LUK contribution', val: lukContrib, fmt: 'raw',
      note: 'LUK=' + Math.round(totalLUK) + ' EGL=' + expGainLUK.toFixed(4) };

    var addCh = [];
    if (etc4 > 0) addCh.push({ name: 'EtcBonuses(4)', val: etc4, fmt: 'raw' });
    if (boxMonsterExp > 0) addCh.push({ name: 'BoxRewards(monsterExp)', val: boxMonsterExp, fmt: 'raw' });
    if (gfoodClassEXP > 0) addCh.push({ name: 'GoldFood ClassEXP', val: gfoodClassEXP, fmt: 'raw' });
    if (vialMonsterEXP > 0) addCh.push({ name: 'Vial MonsterEXP', val: vialMonsterEXP, fmt: 'raw' });
    if (bubbleExpActive > 0) addCh.push({ name: 'Bubble expACTIVE', val: bubbleExpActive, fmt: 'raw' });
    if (card44 > 0) addCh.push({ name: 'CardBonus(44)', val: card44, fmt: 'raw' });
    if (egl2 > 0) addCh.push({ name: 'EGL2 (level/boss/div bonuses)', val: egl2, fmt: 'raw' });
    if (statue10 > 0) addCh.push({ name: label('Statue', 10) + ' (Spiritus)', val: statue10, fmt: 'raw' });
    if (talent632 > 0) addCh.push({ name: label('Talent', 632), val: talent632, fmt: 'raw' });
    if (shrine5 > 0) addCh.push({ name: label('Shrine', 5), val: shrine5, fmt: 'raw' });
    if (saltLick3val > 0) addCh.push({ name: 'SaltLick(3)', val: saltLick3val, fmt: 'raw' });
    if (prayer0 + prayer2 - prayer9curse !== 0) addCh.push({ name: 'Prayers (0+2-9)',
      val: prayer0 + prayer2 - prayer9curse, fmt: 'raw' });
    if (flurbo2 > 0) addCh.push({ name: 'FlurboShop(2)', val: flurbo2, fmt: 'raw' });
    var achTotal = ach57 + ach357 + ach61 + ach124 + ach188 + ach286;
    if (achTotal > 0) addCh.push({ name: 'Achievements', val: achTotal, fmt: 'raw' });
    if (arcade12 > 0) addCh.push({ name: label('Arcade', 12), val: arcade12, fmt: 'raw' });
    if (shinyBonus1 > 0) addCh.push({ name: 'ShinyBonus(1)', val: shinyBonus1, fmt: 'raw' });
    if (talent55 > 0) addCh.push({ name: label('Talent', 55), val: talent55, fmt: 'raw' });
    if (egl6 > 0) addCh.push({ name: 'EGL6 (cards/companions/food/stamps)', val: egl6, fmt: 'raw' });

    children.push({ name: 'Base + Additive Pool', val: lukContrib + additivePool / 100 + 1, fmt: 'x',
      children: [lukPart].concat(addCh) });

    return { val: val, children: children };
  }
};

// Helper: compute Divinity Minor bonus for a given god style
function computeDivMinor(charIdx, godStyle) {
  var s = saveData;
  var GodsInfo;
  try { GodsInfo = require('../data/game/customlists.js').GodsInfo; } catch(e) { return 0; }
  var godIdx = -1;
  for (var g = 0; g < GodsInfo.length; g++) {
    if (GodsInfo[g] && Number(GodsInfo[g][13]) === godStyle) { godIdx = g; break; }
  }
  if (godIdx < 0) return 0;
  var godBase = Number(GodsInfo[godIdx][3]) || 0;
  var _y2bp = bubbleParams(3, 21);
  var y2BubbleLv = Number(cauldronInfoData && cauldronInfoData[3] && cauldronInfoData[3][21]) || 0;
  var y2Value = (y2BubbleLv > 0 && _y2bp) ? formulaEval(_y2bp.formula, _y2bp.x1, _y2bp.x2, y2BubbleLv) : 0;
  var allBubblesActive = s.companionIds && s.companionIds.has(4);
  var coralKid3 = Number(optionsListData && optionsListData[430]) || 0;
  var total = 0;
  for (var ci2 = 0; ci2 < numCharacters; ci2++) {
    var divSkillLv = Number(s.lv0AllData && s.lv0AllData[ci2] && s.lv0AllData[ci2][14]) || 0;
    if (divSkillLv <= 0) continue;
    var y2Active = (allBubblesActive || (cauldronBubblesData && cauldronBubblesData[ci2] || []).includes('d21')) ? y2Value : 0;
    total += Math.max(1, y2Active) * (1 + coralKid3 / 100) * divSkillLv / (60 + divSkillLv) * godBase;
  }
  return total;
}
