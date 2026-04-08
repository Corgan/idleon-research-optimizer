// ===== COIN MULTI DESCRIPTOR =====
// MonsterCash formula: 22 multiplicative groups, each (1 + bonus/100).
// Scope: character (TotalStats is per-character).

import { companions, pristineBon, vaultUpgBonus,
  getSetBonus, votingBonusz, goldFoodBonuses, cardLv,
} from '../systems/common/goldenFood.js';
import { eventShopOwned, emporiumBonus, ribbonBonusAt } from '../../game-helpers.js';
import { getLOG, formulaEval } from '../../formulas.js';
import { label } from '../entity-names.js';
import { grid, mainframeBonus, computePetArenaBonus } from '../systems/w4/lab.js';
import { arcadeBonus } from '../systems/w2/arcade.js';
import { achieveStatus } from '../systems/common/achievement.js';
import { legendPTSbonus } from '../systems/w7/spelunking.js';
import { computeCardBonusByType, computeBoxReward } from '../systems/common/stats.js';
import { isBubblePrismad, getPrismaBonusMult } from '../systems/w2/alchemy.js';
import { AlchemyDescription, MealINFO, DungPassiveStats2, GodsInfo,
  StatueInfo, ArtifactInfo, HolesInfo, ZenithMarket } from '../data/game/customlists.js';
import { cauldronInfoData, optionsListData, prayersPerCharData,
  numCharacters, klaData, divinityData, pvStatListData, charClassData,
  cauldronBubblesData, currentMapData } from '../../save/data.js';
import { bubbleParams } from '../data/w2/alchemy.js';
import { prayerBaseBonus } from '../data/w3/prayer.js';
import { etcBonus } from '../systems/common/etcBonus.js';
import { guild } from '../systems/common/guild.js';
import { friend } from '../systems/common/friend.js';
import { talent } from '../systems/common/talent.js';
import { computeMeritocBonusz } from '../systems/w7/meritoc.js';
import { computeWinBonus } from '../systems/w6/summoning.js';
import { artifactBase } from '../data/w5/sailing.js';
import { grimoireUpgBonus22 } from '../systems/mc/grimoire.js';
import { exoticBonusQTY40 } from '../systems/w6/farming.js';
import { computeShinyBonusS } from '../systems/w4/breeding.js';
import { gambitPTSmulti } from '../systems/w5/hole.js';
import { rogBonusQTY } from '../systems/w7/sushi.js';
import { computeVaultKillzTotal } from '../systems/common/vaultKillz.js';
import votingMultiDesc from './voting-multi.js';
import { saveData } from '../../state.js';

// Helper: get class family for a character (0=warrior, 1=archer, 2=mage, -1=beginner)
function classFamily(charIdx) {
  var cls = Number(charClassData && charClassData[charIdx]) || 0;
  // Classes: 1xx=warrior, 2xx=archer, 3xx=mage, 0=beginner
  // Warrior: 1,4,7,19,28,37, Archer: 2,5,8,20,29,38, Mage: 3,6,9,21,30,39
  // Simplified: (cls-1)%3 → 0=war, 1=arch, 2=mage for cls >= 1
  if (cls <= 0) return -1;
  return (cls - 1) % 3;
}

// Helper: compute bubble value by effect key (e.g. 'CashSTR')
// charIdx: required for class-specific passive multiplier (Opassz/Gpassz/Ppassz)
// Game's DNSM.AlchBubbles = BubbleBonus(cauldron, idx) × prisma × class-passz.
// Class-passz: CharacterClass > 6, idx != 16, idx < 30, key not passz/ACTIVE/AllCharz.
//   Cauldron 0 + warrior (class 7-17) → × Opassz
//   Cauldron 1 + archer (class 18-29) → × Gpassz
//   Cauldron 2 + mage (class 30-41) → × Ppassz
function bubbleValByKey(key, charIdx) {
  for (var c = 0; c < 4; c++) {
    var arr = AlchemyDescription[c];
    if (!arr) continue;
    for (var i = 0; i < arr.length; i++) {
      if (arr[i] && arr[i][15] === key) {
        var lv = Number((cauldronInfoData && cauldronInfoData[c] && cauldronInfoData[c][i]) || 0);
        if (lv <= 0) return 0;
        var baseVal = formulaEval(arr[i][3], Number(arr[i][1]), Number(arr[i][2]), lv);
        var isPrisma = isBubblePrismad(c, i);
        var prismaMult = isPrisma ? Math.max(1, getPrismaBonusMult()) : 1;
        var val = baseVal * prismaMult;
        // Apply class-passz matching game's DNSM.AlchBubbles logic
        var cls = Number(charClassData && charClassData[charIdx]) || 0;
        if (cls > 6 && i !== 16 && i < 30 &&
            key.indexOf('passz') < 0 && key.indexOf('ACTIVE') < 0 && key.indexOf('AllCharz') < 0) {
          if (c === 0 && cls < 18 && key !== 'Construction') {
            val *= Math.max(1, bubbleValByKey('Opassz'));
          } else if (c === 1 && cls >= 18 && cls < 30) {
            val *= Math.max(1, bubbleValByKey('Gpassz'));
          } else if (c === 2 && cls >= 30 && cls < 42) {
            val *= Math.max(1, bubbleValByKey('Ppassz'));
          }
        }
        return val;
      }
    }
  }
  return 0;
}

// Helper: count unique collected cards
function countCardsCollected() {
  var c0 = saveData.cards0Data;
  if (!c0) return 0;
  var count = 0;
  for (var key in c0) {
    if (Number(c0[key]) >= 1) count++;
  }
  return count;
}

// Helper: safe resolve — returns .val or 0 if resolver throws
function rval(resolver, id, ctx, args) {
  try { return resolver.resolve(id, ctx, args).val || 0; }
  catch(e) { return 0; }
}

// Helper: safe function call — returns 0 on throw or NaN
function safe(fn) {
  try {
    var args = [];
    for (var i = 1; i < arguments.length; i++) args.push(arguments[i]);
    var v = fn.apply(null, args);
    return (v !== v || v == null) ? 0 : v;  // NaN check: v !== v
  } catch(e) { return 0; }
}

// Compute GambitBonuses(7): 10 * getLOG(gambitPts) if unlocked
function computeGambitBonus7() {
  var s = saveData;
  if (!s.holesData || !Array.isArray(s.holesData[11])) return 0;
  var rawPts = 0;
  for (var i = 0; i < 6; i++) {
    var score = Number(s.holesData[11][65 + i]) || 0;
    var base = score + 3 * Math.floor(score / 10) + 10 * Math.floor(score / 60);
    rawPts += (i === 0 ? 100 : 200) * base;
  }
  var multi = gambitPTSmulti(s);
  var totalPts = rawPts * multi;
  var req = 2000 + 1000 * 8 * (1 + 7 / 5) * Math.pow(1.26, 7);
  if (totalPts < req) return 0;
  var parts = String(HolesInfo[71][7]).split('|');
  var bval = Number(parts[0]) || 10;
  return bval * getLOG(totalPts);
}

// Compute MealBonus("Cash"): sum of meal bonuses with "Cash" effect key
function computeMealCashBonus() {
  var s = saveData;
  var meals0 = s.mealsData && s.mealsData[0];
  if (!meals0) return 0;
  var mf116 = safe(mainframeBonus, 116);
  var shinyS20 = safe(computeShinyBonusS, 20);
  var winBon26 = safe(computeWinBonus, 26);
  var cookMulti = (1 + (mf116 + shinyS20) / 100) * (1 + winBon26 / 100);
  var total = 0;
  for (var mi = 0; mi < MealINFO.length; mi++) {
    if (!MealINFO[mi] || MealINFO[mi][5] !== 'Cash') continue;
    var mealLv = Number(meals0[mi]) || 0;
    if (mealLv <= 0) continue;
    var bonusPerLv = Number(MealINFO[mi][2]) || 0;
    var ribIdx = 28 + mi;
    var ribMeal = ribbonBonusAt(ribIdx, s.ribbonData, String(s.olaData[379] || ''));
    total += cookMulti * ribMeal * mealLv * bonusPerLv;
  }
  return total;
}

// Compute ArtifactBonus(1): Maneki Kat - coins per highest class level
function computeArtifactBonus1() {
  var s = saveData;
  var sailing = s.sailingData;
  if (!sailing || !sailing[3]) return 0;
  var tier = Number(sailing[3][1]) || 0;
  if (tier <= 0) return 0;
  var base = artifactBase(1);
  var highestLv = 0;
  var lv0All = s.lv0AllData || [];
  for (var ci = 0; ci < lv0All.length; ci++) {
    var lv = Number(lv0All[ci] && lv0All[ci][0]) || 0;
    if (lv > highestLv) highestLv = lv;
  }
  var val = base * highestLv;
  if (tier >= 2) val *= tier;
  return val;
}

// Compute RooBonuses(6): coins from roo summoning tiers
function computeRooBonus6() {
  var ola271 = Number(optionsListData[271]) || 0;
  var tiers = Math.max(0, Math.ceil((ola271 - 6) / 7));
  if (tiers <= 0) return 0;
  var legend26 = safe(legendPTSbonus, 26);
  var comp51 = safe(companions, 51);
  var rooAll = 0;
  var megaIdxs = [1, 3, 6, 8, 11];
  for (var mi = 0; mi < megaIdxs.length; mi++) {
    var feat = Number(optionsListData[279 + megaIdxs[mi]]) || 0;
    rooAll += 50 * Math.min(1, feat);
    if (mi === 4) rooAll += 25 * Math.max(0, feat - 1);
  }
  return 3 * (1 + legend26 / 100) * (1 + comp51) * (1 + rooAll / 100) * tiers;
}

// Compute StatueBonusGiven for a given statue index (full game formula)
function computeStatueBonusGiven(idx) {
  var s = saveData;
  var statueLv = Number(s.statueData && s.statueData[idx]) || 0;
  if (statueLv <= 0) return 0;
  var baseBonus = Number(StatueInfo[idx] && StatueInfo[idx][3]) || 1;
  var val = statueLv * baseBonus;
  // Talent group multipliers
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
  // StatueG Onyx/Zenith tiers
  var statueG = Number(s.statueGData && s.statueGData[idx]) || 0;
  if (statueG >= 2) {
    var art30tier = Number(s.sailingData && s.sailingData[3] && s.sailingData[3][30]) || 0;
    var art30val = art30tier > 0 ? artifactBase(30) * Math.max(1, art30tier) : 0;
    val *= Math.max(1, 1 + (100 + art30val) / 100);
  }
  if (statueG >= 3) {
    var zmLv = Number(s.spelunkData && s.spelunkData[45] && s.spelunkData[45][0]) || 0;
    var zmMulti = Number(ZenithMarket && ZenithMarket[0] && ZenithMarket[0][4]) || 1;
    var zmBonus = Math.floor(zmMulti * zmLv);
    val *= Math.max(1, 1 + (50 + zmBonus) / 100);
  }
  // VaultUpgBonus(25) for statues 0,1,2,6 only
  if (idx === 0 || idx === 1 || idx === 2 || idx === 6) {
    var vub25 = safe(vaultUpgBonus, 25);
    val *= Math.max(1, 1 + vub25 / 100);
  }
  // Statue 29 recursion: all statues except 29 get multiplied by statue 29's bonus
  if (idx !== 29) {
    var statue29 = computeStatueBonusGiven(29);
    val *= Math.max(1, 1 + statue29 / 100);
  }
  // EventShop, getbonus2(1,56,-1), MeritocBonusz(26)
  val *= (1 + 0.3 * eventShopOwned(19, s.cachedEventShopStr));
  val *= Math.max(1, 1 + rval(talent, 56, { saveData: s, charIdx: 0 }, { mode: 'max' }) / 100);
  val *= (1 + safe(computeMeritocBonusz, 26) / 100);
  return val;
}
function computeStatueBonus19() {
  return computeStatueBonusGiven(19);
}

// Compute Divinity("Bonus_Minor", -1, 3): sum minor divine bonus for god style 3
// Game: for styles 3 and 5, ALL characters (0..numPlayers-1) contribute
// their DivMinorBonus, regardless of which god they're linked to.
// This is because the ternary condition always takes the special path for styles 3/5.
function computeDivinityMinor3() {
  var s = saveData;
  // Find the god whose style is 3 (GodsInfo[g][13] == 3)
  var style3God = -1;
  for (var g = 0; g < GodsInfo.length; g++) {
    if (GodsInfo[g] && Number(GodsInfo[g][13]) === 3) { style3God = g; break; }
  }
  if (style3God < 0) return 0;
  var godBase = Number(GodsInfo[style3God][3]) || 0;
  // Y2 bubble (BIG_P, Yellow cauldron index 21): multiplies god passive
  var _y2bp = bubbleParams(3, 21);
  var y2BubbleLv = Number(cauldronInfoData && cauldronInfoData[3] && cauldronInfoData[3][21]) || 0;
  var y2Value = (y2BubbleLv > 0 && _y2bp) ? formulaEval(_y2bp.formula, _y2bp.x1, _y2bp.x2, y2BubbleLv) : 0;
  var allBubblesActive = s.companionIds && s.companionIds.has(4);
  // CoralKidUpgBonus(3): OLA[430]
  var coralKid3 = Number(optionsListData && optionsListData[430]) || 0;
  var total = 0;
  // For style 3: all chars with divinity skill contribute
  for (var ci = 0; ci < numCharacters; ci++) {
    var divSkillLv = Number(s.lv0AllData && s.lv0AllData[ci] && s.lv0AllData[ci][14]) || 0;
    if (divSkillLv <= 0) continue;
    var y2Active = (allBubblesActive || (cauldronBubblesData && cauldronBubblesData[ci] || []).includes('d21')) ? y2Value : 0;
    total += Math.max(1, y2Active) * (1 + coralKid3 / 100) * divSkillLv / (60 + divSkillLv) * godBase;
  }
  return total;
}

// Compute CropSCbonus(4): EmporiumBonus(23) check, then 15 * cropCount * multi
function computeCropSC4() {
  var s = saveData;
  var ninjaData102_9 = s.ninjaData && s.ninjaData[102] && s.ninjaData[102][9];
  var emp23 = emporiumBonus(23, ninjaData102_9);
  if (!emp23) return 0;
  var cropCount = s.farmCropCount || 0;
  var mf17 = safe(mainframeBonus, 17);
  var gub22 = safe(grimoireUpgBonus22);
  var exo40 = safe(exoticBonusQTY40);
  var vub79 = safe(vaultUpgBonus, 79);
  var multi = (1 + mf17 / 100) * (1 + (gub22 + exo40 + vub79) / 100);
  return 15 * cropCount * multi;
}

// Compute AlchVials.MonsterCash value (with full multiplier chain)
// Game: VialBonus = labMult * (1 + DNzz/100) * (1 + meritoc20/100) * formulaEval(...)
// labMult = mainframe10 == 2 ? 2 : 1
// DNzz = (rift[0]>34 ? 2*maxLvVials : 0) + VaultUpgBonus(42)
function computeVialMonsterCash() {
  var vials = AlchemyDescription[4];
  if (!vials) return 0;
  for (var vi = 0; vi < vials.length; vi++) {
    if (!vials[vi] || vials[vi][11] !== 'MonsterCash') continue;
    var vialLv = Number((cauldronInfoData && cauldronInfoData[4] && cauldronInfoData[4][vi]) || 0);
    if (vialLv <= 0) return 0;
    var rawVal = formulaEval(vials[vi][3], Number(vials[vi][1]) || 0, Number(vials[vi][2]) || 0, vialLv);
    // Lab mainframe 10: doubles vial bonuses when active
    var labMult = safe(mainframeBonus, 10) === 2 ? 2 : 1;
    // DNzz: rift vial bonus + VaultUpgBonus(42)
    var riftActive = Number(saveData.riftData && saveData.riftData[0]) > 34;
    var maxLvVials = 0;
    if (riftActive) {
      var ci4 = cauldronInfoData && cauldronInfoData[4];
      for (var rvi = 0; ci4 && rvi < ci4.length; rvi++) {
        if ((Number(ci4[rvi]) || 0) >= 13) maxLvVials++;
      }
    }
    var dNzz = (riftActive ? 2 * maxLvVials : 0) + safe(vaultUpgBonus, 42);
    // MeritocBonusz(20)
    var meritoc20 = safe(computeMeritocBonusz, 20);
    return labMult * (1 + dNzz / 100) * (1 + meritoc20 / 100) * rawVal;
  }
  return 0;
}

// Compute FlurboShop(4): DungPassiveStats2[4] = decay(75, 100, lv)
function computeFlurboShop4() {
  var s = saveData;
  var dungUpg5 = s.dungUpgData && s.dungUpgData[5];
  if (!dungUpg5) return 0;
  var lv = Number(dungUpg5[4]) || 0;
  if (lv <= 0) return 0;
  var info = DungPassiveStats2[4];
  if (!info) return 0;
  return formulaEval(info[3], Number(info[1]) || 0, Number(info[2]) || 0, lv);
}

export default {
  id: 'coin-multi',
  name: 'Coin Multiplier',
  scope: 'character',
  category: 'multiplier',

  pools: {},

  combine: function(pools, ctx) {
    var s = ctx.saveData;
    if (!s) return { val: 1, children: null };
    var ci = ctx.charIdx || 0;

    // ===== GROUP 1: Alchemy bubbles x floor(stat/250) =====
    var cashSTR = safe(bubbleValByKey, 'CashSTR', ci);
    var cashAGI = safe(bubbleValByKey, 'CashAGI', ci);
    var cashWIS = safe(bubbleValByKey, 'CashWIS', ci);
    // Use pre-computed stat totals from PVStatList (indices: 0=STR, 1=AGI, 2=WIS, 3=LUK)
    var pvStats = pvStatListData[ci] || [];
    var totalSTR = Number(pvStats[0]) || 0;
    var totalAGI = Number(pvStats[1]) || 0;
    var totalWIS = Number(pvStats[2]) || 0;
    var g1strPart = cashSTR * Math.floor(totalSTR / 250);
    var g1agiPart = cashAGI * Math.floor(totalAGI / 250);
    var g1wisPart = cashWIS * Math.floor(totalWIS / 250);
    var g1sum = g1strPart + g1agiPart + g1wisPart;
    var g1 = 1 + g1sum / 100;

    // ===== GROUPS 2-4: Companions (capped at 4) =====
    var comp24 = Math.min(4, safe(companions, 24));
    var comp45 = Math.min(4, safe(companions, 45));
    var comp159 = Math.min(4, safe(companions, 159));
    var g2 = 1 + comp24;
    var g3 = 1 + comp45;
    var g4 = 1 + comp159;

    // ===== GROUPS 5-6: EventShop =====
    var evStr = s.cachedEventShopStr;
    var evShop9 = eventShopOwned(9, evStr);
    var evShop20 = eventShopOwned(20, evStr);
    var g5 = 1 + 0.5 * evShop9;
    var g6 = 1 + 0.6 * evShop20;

    // ===== GROUP 7: EtcBonuses("77") = %_BONUS_MONEY =====
    var etc77 = rval(etcBonus, '77', ctx);
    var g7 = 1 + etc77 / 100;

    // ===== GROUP 8: RoG_BonusQTY(18) — Sushi bonus =====
    var rog18 = rogBonusQTY(18, s.cachedUniqueSushi || 0);
    var g8 = 1 + rog18 / 100;

    // ===== GROUP 9: RoG_BonusQTY(37) — Sushi bonus =====
    var rog37 = rogBonusQTY(37, s.cachedUniqueSushi || 0);
    var g9 = 1 + rog37 / 100;

    // ===== GROUP 10: Grid 149 + Grid 169 =====
    var grid149 = rval(grid, 149, ctx);
    var grid169 = rval(grid, 169, ctx);
    var g10 = 1 + (grid149 + grid169) / 100;

    // ===== GROUP 11: EtcBonuses("100") = %_EXTRA_MONEY =====
    var etc100 = rval(etcBonus, '100', ctx);
    var g11 = 1 + etc100 / 100;

    // ===== GROUP 12: GOLD_SET set bonus =====
    var goldSet = safe(getSetBonus, 'GOLD_SET');
    var g12 = 1 + goldSet / 100;

    // ===== GROUP 13: Gambit bonus 7 =====
    var gambit7 = safe(computeGambitBonus7);
    var g13 = 1 + gambit7 / 100;

    // ===== GROUP 14: Bundle bun_y x 250 =====
    var bunY = (s.bundlesData && s.bundlesData.bun_y === 1) ? 1 : 0;
    var g14 = 1 + 250 * bunY / 100;

    // ===== GROUP 15: getbonus2(1,433,-1) x log(OLA[362]) =====
    var chipBonus433 = rval(talent, 433, ctx, { mode: 'max' });
    var ola362 = Number(optionsListData[362]) || 0;
    var g15val = Math.max(1, chipBonus433) * getLOG(ola362);
    var g15 = 1 + g15val / 100;

    // ===== GROUP 16: Meal + Artifact + Roo + Voting(34) =====
    var votingMulti = 1;
    try { var vmResult = votingMultiDesc.combine({}, ctx); votingMulti = vmResult.val || 1; } catch(e) {}
    var voting34 = safe(votingBonusz, 34, votingMulti);
    var mealCash = safe(computeMealCashBonus);
    var artifactBonus1 = safe(computeArtifactBonus1);
    var rooBonus6 = safe(computeRooBonus6);
    var g16sum = mealCash + artifactBonus1 + rooBonus6 + voting34;
    var g16 = 1 + g16sum / 100;

    // ===== GROUP 17: PetArena + Friend + Statue(19) =====
    var friend5 = rval(friend, 5, ctx);
    var petArena5 = safe(computePetArenaBonus, 5);
    var petArena14 = safe(computePetArenaBonus, 14);
    var statue19 = safe(computeStatueBonus19);
    var g17sum = 0.5 * petArena5 + friend5 + petArena14 + statue19 / 100;
    var g17 = 1 + g17sum;

    // ===== GROUP 18: Mainframe(9) + Vault x Killz =====
    var mf9 = safe(mainframeBonus, 9);
    var vault34 = safe(vaultUpgBonus, 34);
    var vault37 = safe(vaultUpgBonus, 37);
    var killz8 = safe(computeVaultKillzTotal, 8);
    var killz9 = safe(computeVaultKillzTotal, 9);
    var g18sum = mf9 + vault34 * killz8 + vault37 * killz9;
    var g18 = 1 + g18sum / 100;

    // ===== GROUP 19: Pristine(16) =====
    var pristine16 = safe(pristineBon, 16);
    var g19 = 1 + pristine16 / 100;

    // ===== GROUP 20: Prayer(8) =====
    var prayerLv8 = Number(s.prayOwnedData && s.prayOwnedData[8]) || 0;
    var prayEquipped8 = false;
    try { prayEquipped8 = (prayersPerCharData[ci] || []).includes(8); } catch(e) {}
    var prayer8val = 0;
    var pBase8 = safe(prayerBaseBonus, 8);
    if (prayerLv8 > 0 && prayEquipped8) {
      var pScale8 = Math.max(1, 1 + (prayerLv8 - 1) / 10);
      prayer8val = Math.round(pBase8 * pScale8);
    }
    var g20 = 1 + prayer8val / 100;

    // ===== GROUP 21: Divinity Minor + CropSC(4) =====
    var divMinor = safe(computeDivinityMinor3);
    var cropSC4 = safe(computeCropSC4);
    var g21 = 1 + (divMinor + cropSC4) / 100;

    // ===== GROUP 22: Big additive group =====
    // Game uses GetTalentNumber(1,X) for talents 657,22 (per-character)
    // and TalentCalc(X) for 643,644 (per-character, with multipliers)
    // TC(643) = OverkillStuffs("2") = raw overkill tier (1-50). Requires MaxDamage + MonsterHP.
    // TC(644) = Lv0[10] / 10 = charLevel / 10 (NOT GTN * Lv0 / 10)
    var talent657 = rval(talent, 657, ctx);
    var vialMC = safe(computeVialMonsterCash);
    var etc3 = rval(etcBonus, '3', ctx);
    var _cb11 = safe(computeCardBonusByType, 11, ci);
    var cardBonus11 = (typeof _cb11 === 'object' && _cb11) ? (_cb11.val || 0) : Number(_cb11) || 0;
    var cardW5b1 = 7 * safe(cardLv, 'w5b1');
    var talent22 = rval(talent, 22, ctx);
    var flurboShop4 = safe(computeFlurboShop4);
    var arcade10 = safe(arcadeBonus, 10);
    var arcade11 = safe(arcadeBonus, 11);
    var _br13c = safe(computeBoxReward, ci, '13c');
    var boxReward13c = (typeof _br13c === 'object' && _br13c) ? (_br13c.val || 0) : Number(_br13c) || 0;
    var guild8 = rval(guild, 8, ctx);
    var mapIdx = ctx.mapIdx != null ? ctx.mapIdx : (currentMapData && currentMapData[ci]) || 0;
    var guildMapFactor = 1 + Math.floor(mapIdx / 50);
    var guildContrib = guild8 * guildMapFactor;
    var overkillTier = ctx.overkillTier || 1;
    var talentCalc643 = overkillTier;
    var lv0_10 = Number(s.lv0AllData && s.lv0AllData[ci] && s.lv0AllData[ci][10]) || 0;
    var talentCalc644 = lv0_10 / 10;
    var _gf = null;
    try { _gf = goldFoodBonuses('MonsterCash', ci); } catch(e) {}
    var gfoodMC = (_gf && typeof _gf === 'object') ? (Number(_gf.total) || 0) : (Number(_gf) || 0);
    var vault17 = safe(vaultUpgBonus, 17);
    var ola340 = Number(optionsListData[340]) || 0;
    var vaultLog = vault17 * getLOG(ola340);
    var ach235 = 5 * safe(achieveStatus, 235);
    var ach350 = 10 * safe(achieveStatus, 350);
    var ach376 = 20 * safe(achieveStatus, 376);
    var vault2 = safe(vaultUpgBonus, 2);
    var vault14 = safe(vaultUpgBonus, 14);
    var killz4 = safe(computeVaultKillzTotal, 4);
    var vault31 = safe(vaultUpgBonus, 31);
    var killz7 = safe(computeVaultKillzTotal, 7);
    var ola420 = Number(optionsListData[420]) || 0;
    var vault70 = safe(vaultUpgBonus, 70);
    var cardsCollected = safe(countCardsCollected);

    var g22sum = talent657 + vialMC + etc3 + cardBonus11 + cardW5b1
      + talent22 + flurboShop4 + arcade10 + arcade11
      + boxReward13c + guildContrib + talentCalc643 + talentCalc644
      + gfoodMC + vaultLog + ach235 + ach350 + ach376
      + vault2 + vault14 * killz4 + vault31 * killz7
      + ola420 + vault70 * cardsCollected;
    if (g22sum !== g22sum) { g22sum = 0; }
    var g22 = 1 + g22sum / 100;

    // NaN guard — clamp broken groups to 1
    var groups = [g1,g2,g3,g4,g5,g6,g7,g8,g9,g10,g11,g12,g13,g14,g15,g16,g17,g18,g19,g20,g21,g22];
    for (var gi = 0; gi < groups.length; gi++) {
      if (groups[gi] !== groups[gi] || groups[gi] == null) {
        groups[gi] = 1;
      }
    }

    // ===== Final product =====
    var val = 1;
    for (var gi = 0; gi < groups.length; gi++) val *= groups[gi];

    // ===== Build breakdown tree =====
    var children = [];

    // G1: Alchemy x Stats
    var g1ch = [];
    if (g1strPart > 0) g1ch.push({ name: 'CashSTR x floor(STR/250)', val: g1strPart, fmt: 'raw',
      note: 'STR=' + Math.round(totalSTR) + ' bubble=' + cashSTR.toFixed(1) });
    if (g1agiPart > 0) g1ch.push({ name: 'CashAGI x floor(AGI/250)', val: g1agiPart, fmt: 'raw',
      note: 'AGI=' + Math.round(totalAGI) + ' bubble=' + cashAGI.toFixed(1) });
    if (g1wisPart > 0) g1ch.push({ name: 'CashWIS x floor(WIS/250)', val: g1wisPart, fmt: 'raw',
      note: 'WIS=' + Math.round(totalWIS) + ' bubble=' + cashWIS.toFixed(1) });
    children.push({ name: 'Alchemy x Stats', val: groups[0], children: g1ch.length ? g1ch : null, fmt: 'x' });

    // G2-4: Companions
    children.push({ name: label('Companion', 24), val: groups[1], fmt: 'x', note: 'cap 4' });
    children.push({ name: label('Companion', 45), val: groups[2], fmt: 'x', note: 'cap 4' });
    children.push({ name: label('Companion', 159), val: groups[3], fmt: 'x', note: 'cap 4' });

    // G5-6: EventShop
    children.push({ name: label('EventShop', 9) + ' x0.5', val: groups[4], fmt: 'x' });
    children.push({ name: label('EventShop', 20) + ' x0.6', val: groups[5], fmt: 'x' });

    // G7: EtcBonuses 77
    children.push({ name: 'Equip Bonus Money', val: groups[6],
      children: etc77 > 0 ? [{ name: 'EtcBonuses(77)', val: etc77, fmt: 'raw' }] : null, fmt: 'x' });

    // G8-9: RoG Sushi bonuses
    children.push({ name: 'RoG Bonus 18', val: groups[7], fmt: 'x', note: rog18 + '%' });
    children.push({ name: 'RoG Bonus 37', val: groups[8], fmt: 'x', note: rog37 + '%' });

    // G10: Grid
    var g10ch = [];
    if (grid149 > 0) g10ch.push({ name: label('Grid', 149), val: grid149, fmt: 'raw' });
    if (grid169 > 0) g10ch.push({ name: label('Grid', 169), val: grid169, fmt: 'raw' });
    children.push({ name: 'Grid Bonus', val: groups[9], children: g10ch.length ? g10ch : null, fmt: 'x' });

    // G11: EtcBonuses 100
    children.push({ name: 'Equip Extra Money', val: groups[10],
      children: etc100 > 0 ? [{ name: 'EtcBonuses(100)', val: etc100, fmt: 'raw' }] : null, fmt: 'x' });

    // G12: GOLD_SET
    children.push({ name: label('SetBonus', 'GOLD_SET'), val: groups[11], fmt: 'x' });

    // G13: Gambit
    children.push({ name: label('Gambit', 7), val: groups[12], fmt: 'x',
      note: gambit7 > 0 ? gambit7.toFixed(1) + '%' : 'Not unlocked' });

    // G14: Bundle
    children.push({ name: label('Bundle', 'bun_y') + ' x250', val: groups[13], fmt: 'x' });

    // G15: Talent 433 x log
    var g15ch = [];
    if (chipBonus433 > 0) g15ch.push({ name: label('Talent', 433), val: chipBonus433, fmt: 'raw' });
    if (ola362 > 0) g15ch.push({ name: 'log(OLA[362])', val: getLOG(ola362), fmt: 'raw', note: 'raw=' + ola362 });
    children.push({ name: label('Talent', 433) + ' x log', val: groups[14], children: g15ch.length ? g15ch : null, fmt: 'x' });

    // G16: Meal + Artifact + Roo + Voting
    var g16ch = [];
    if (mealCash > 0) g16ch.push({ name: 'Meal Cash', val: mealCash, fmt: 'raw' });
    if (artifactBonus1 > 0) g16ch.push({ name: label('Artifact', 1) + ' (Maneki Kat)', val: artifactBonus1, fmt: 'raw' });
    if (rooBonus6 > 0) g16ch.push({ name: 'Roo Bonus 6', val: rooBonus6, fmt: 'raw' });
    if (voting34 > 0) g16ch.push({ name: label('Voting', 34), val: voting34, fmt: 'raw' });
    children.push({ name: 'Meal + Artifact + Roo + Voting', val: groups[15],
      children: g16ch.length ? g16ch : null, fmt: 'x' });

    // G17: PetArena + Friend + Statue
    var g17ch = [];
    if (friend5 > 0) g17ch.push({ name: label('Friend', 5), val: friend5, fmt: 'raw' });
    if (petArena5 > 0) g17ch.push({ name: 'PetArena 5 x0.5', val: 0.5 * petArena5, fmt: 'raw' });
    if (petArena14 > 0) g17ch.push({ name: 'PetArena 14', val: petArena14, fmt: 'raw' });
    if (statue19 > 0) g17ch.push({ name: label('Statue', 19) + ' (Pecunia)', val: statue19 / 100,
      fmt: 'raw', note: 'raw=' + statue19.toFixed(1) });
    children.push({ name: 'PetArena + Friend + Statue', val: groups[16],
      children: g17ch.length ? g17ch : null, fmt: 'x' });

    // G18: Mainframe + Vault x Killz
    var g18ch = [];
    if (mf9 > 0) g18ch.push({ name: label('Mainframe', 9), val: mf9, fmt: 'raw' });
    if (vault34 * killz8 > 0) g18ch.push({ name: label('Vault', 34) + ' x Killz8', val: vault34 * killz8,
      fmt: 'raw', note: 'tasks=' + killz8 });
    if (vault37 * killz9 > 0) g18ch.push({ name: label('Vault', 37) + ' x Killz9', val: vault37 * killz9,
      fmt: 'raw', note: 'bubbles=' + killz9 });
    children.push({ name: 'Mainframe + Vault x Killz', val: groups[17],
      children: g18ch.length ? g18ch : null, fmt: 'x' });

    // G19: Pristine
    children.push({ name: label('Pristine', 16), val: groups[18], fmt: 'x' });

    // G20: Prayer
    children.push({ name: label('Prayer', 8), val: groups[19],
      children: prayer8val > 0 ? [
        { name: 'Prayer Level', val: prayerLv8, fmt: 'raw' },
        { name: 'Base Bonus', val: pBase8, fmt: 'raw' },
      ] : null, fmt: 'x', note: !prayEquipped8 ? 'Not equipped' : '' });

    // G21: Divinity + CropSC
    var g21ch = [];
    if (divMinor > 0) g21ch.push({ name: 'Divinity Minor (Harriep)', val: divMinor, fmt: 'raw' });
    if (cropSC4 > 0) g21ch.push({ name: 'CropSC(4)', val: cropSC4, fmt: 'raw',
      note: s.farmCropCount + ' crops' });
    children.push({ name: 'Divinity + CropSC', val: groups[20],
      children: g21ch.length ? g21ch : null, fmt: 'x' });

    // G22: Big additive group
    var g22ch = [];
    if (talent657 > 0) g22ch.push({ name: label('Talent', 657), val: talent657, fmt: 'raw' });
    if (vialMC > 0) g22ch.push({ name: 'Vial MonsterCash', val: vialMC, fmt: 'raw' });
    if (etc3 > 0) g22ch.push({ name: 'EtcBonuses(3)', val: etc3, fmt: 'raw' });
    if (cardBonus11 > 0) g22ch.push({ name: 'CardBonus 11', val: cardBonus11, fmt: 'raw' });
    if (cardW5b1 > 0) g22ch.push({ name: '7 x CardLv(w5b1)', val: cardW5b1, fmt: 'raw' });
    if (talent22 > 0) g22ch.push({ name: label('Talent', 22), val: talent22, fmt: 'raw' });
    if (flurboShop4 > 0) g22ch.push({ name: 'FlurboShop 4', val: flurboShop4, fmt: 'raw' });
    if (arcade10 + arcade11 > 0) g22ch.push({ name: label('Arcade', '10+11'), val: arcade10 + arcade11, fmt: 'raw' });
    if (boxReward13c > 0) g22ch.push({ name: 'BoxRewards 13c', val: boxReward13c, fmt: 'raw' });
    if (guildContrib > 0) g22ch.push({ name: label('Guild', 8) + ' x map', val: guildContrib, children: [
      { name: 'Guild Base', val: guild8, fmt: 'raw' },
      { name: 'Map Factor', val: guildMapFactor, fmt: 'x', note: 'map=' + mapIdx },
    ], fmt: 'raw' });
    if (talentCalc643 > 0) g22ch.push({ name: 'OverkillTier (TC643)', val: talentCalc643, fmt: 'raw', note: 'needs MaxDmg+MonsterHP' });
    if (talentCalc644 > 0) g22ch.push({ name: 'CharLevel/10 (TC644)', val: talentCalc644, fmt: 'raw', note: 'Lv0[10]=' + lv0_10 });
    if (gfoodMC > 0) g22ch.push({ name: 'GoldFood MonsterCash', val: gfoodMC, fmt: 'raw' });
    if (vaultLog > 0) g22ch.push({ name: label('Vault', 17) + ' x log', val: vaultLog,
      fmt: 'raw', note: 'OLA[340]=' + ola340 });
    var achSum = ach235 + ach350 + ach376;
    if (achSum > 0) g22ch.push({ name: 'Achievements', val: achSum, fmt: 'raw', children: [
      { name: label('Achievement', 235) + ' x5', val: ach235, fmt: 'raw' },
      { name: label('Achievement', 350) + ' x10', val: ach350, fmt: 'raw' },
      { name: label('Achievement', 376) + ' x20', val: ach376, fmt: 'raw' },
    ] });
    if (vault2 > 0) g22ch.push({ name: label('Vault', 2), val: vault2, fmt: 'raw' });
    if (vault14 * killz4 > 0) g22ch.push({ name: label('Vault', 14) + ' x Killz4', val: vault14 * killz4, fmt: 'raw' });
    if (vault31 * killz7 > 0) g22ch.push({ name: label('Vault', 31) + ' x Killz7', val: vault31 * killz7, fmt: 'raw' });
    if (ola420 > 0) g22ch.push({ name: 'OLA[420]', val: ola420, fmt: 'raw' });
    if (vault70 * cardsCollected > 0) g22ch.push({ name: label('Vault', 70) + ' x Cards', val: vault70 * cardsCollected,
      fmt: 'raw', note: cardsCollected + ' cards' });
    children.push({ name: 'Big Additive Group', val: groups[21], children: g22ch.length ? g22ch : null, fmt: 'x' });

    return { val: val, children: children };
  },
};
