// ===== TOME SCORE COMPUTATION =====
// Computes totalTomePoints from save data instead of relying on stale extraData.
// Covers 118 Tome slots with 5 scoring modes.
// Game source: _customEvent_TomeQTY() + TomePCT/TomePTS in N.formatted.js lines 91347-91348, 71553-71650.
// All slots implemented.

import {
  optionsListData, stampLvData, cauldronInfoData, tasksW7Data,
  skillLvData, skillLvMaxData, labData, divinityData, starSignData,
  klaData, numCharacters, mapBonData, charClassData,
} from '../../../save/data.js';
import { assignState } from '../../../state.js';
import { computeCardLv } from '../common/cards.js';
import { vaultUpgBonus } from '../common/vault.js';
import { getBribeBonus } from '../w3/bribe.js';
import { companions } from '../common/companions.js';
import { sigilBonus } from '../w2/alchemy.js';
import { talent } from '../common/talent.js';
import { achieveStatus } from '../common/achievement.js';
import { computeStampBonusOfTypeX } from '../w1/stamp.js';
import { computeShinyBonusS } from './breeding.js';
import { computeFlurboShop } from '../w2/dungeon.js';
import { guildBonusParams } from '../../data/common/guild.js';
import { familyBonusParams } from '../../data/common/talent.js';
import { formulaEval, getLOG } from '../../../formulas.js';
import { DN_MOB_DATA } from '../../data/w7/deathNote.js';
import { DeathNoteMobs, Tome as TomeData, RANDOlist } from '../../data/game/customlists.js';
import { createStatContext } from '../../stat-context.js';
import { computeArcaneMapMultiBon } from '../mc/tesseract.js';

// ===== Static Tome data: [half, mode, maxPts] per slot =====
// Derived from CustomLists.Tome: each entry is [name, half, mode, maxPts, ...].
var T = TomeData.map(function(e) { return [Number(e[1]), Number(e[2]), Number(e[3])]; });

// Dungeon rank thresholds from RANDOlist[29]
var dungRankThresholds = RANDOlist[29];

// getLOG imported from formulas.js — uses game's Math.log(x)/2.30259

// ===== TomePCT scoring — 5 modes =====
export function tomePCT(qty, mode, half) {
  if (mode === 0) {
    return qty < 0 ? 0 : Math.pow(1.7 * qty / (qty + half), 0.7);
  }
  if (mode === 1) {
    var lg = getLOG(qty);
    return 2.4 * lg / (2 * lg + half);
  }
  if (mode === 2) {
    return Math.min(1, qty / half);
  }
  if (mode === 3) {
    return qty > 5 * half ? 0 : Math.pow(1.2 * (6 * half - qty) / (7 * half - qty), 5);
  }
  if (mode === 4) {
    var v = Math.min(half, qty);
    return Math.pow(2 * v / (v + half), 0.7);
  }
  return 0;
}

// ===== Helpers =====
function num(v) { return Number(v) || 0; }
function ola(idx) { return num(optionsListData && optionsListData[idx]); }
function arrSum(a) { if (!a) return 0; var s = 0; for (var i = 0; i < a.length; i++) s += num(a[i]); return s; }
function arrMax(a) { if (!a) return 0; var m = 0; for (var i = 0; i < a.length; i++) { var v = num(a[i]); if (v > m) m = v; } return m; }
function objSum(o) { if (!o) return 0; var s = 0; for (var k in o) if (k !== 'length') s += num(o[k]); return s; }

// ===== Compute raw QTY for each Tome slot =====
export
function tomeQTY(slot, S) {
  var i, s, v, ci;
  switch (slot) {
    // --- Combat Stats ---
    case 0: // Stamp_Total_LV — sum all stamp levels across 3 tabs
      if (!stampLvData) return 0;
      var stamps = stampLvData;
      if (Array.isArray(stamps)) { s = 0; for (i = 0; i < stamps.length; i++) s += objSum(stamps[i]); return s; }
      return objSum(stamps);

    case 1: // Statue_Total_LV — sum statue levels for first char (account-wide)
      s = 0;
      var sla = S.statueLvAllData;
      if (sla && sla[0]) {
        var ca = sla[0];
        for (i = 0; i < ca.length; i++) s += num(Array.isArray(ca[i]) ? ca[i][0] : ca[i]);
      }
      return s;

    case 2: // Cards_Total_LV — sum card levels using computeCardLv
      if (!S.cards0Data) return 0;
      var c0 = S.cards0Data;
      s = 0;
      for (var ck in c0) s += computeCardLv(ck, S);
      return s;

    case 3: // Total_Talent_Max_LV — for each of ~120 skills/talents, max level across all chars
      // Game uses SkillLevelsMAX (SM_) which is the per-skill max level cap, not current levels (SL_).
      if (!skillLvMaxData || !skillLvMaxData.length) return 0;
      var maxPerSkill = {};
      for (ci = 0; ci < skillLvMaxData.length; ci++) {
        var sk = skillLvMaxData[ci];
        if (!sk) continue;
        for (var si in sk) { v = num(sk[si]); if (!maxPerSkill[si] || v > maxPerSkill[si]) maxPerSkill[si] = v; }
      }
      s = 0; for (var mk in maxPerSkill) s += maxPerSkill[mk];
      return s;

    case 4: // Unique_Quests_Completed — count unique quest keys completed across all chars
      if (!S.questCompleteData) return 0;
      var questSet = {};
      for (ci = 0; ci < S.questCompleteData.length; ci++) {
        var qc = S.questCompleteData[ci];
        if (!qc) continue;
        for (var qk in qc) { if (num(qc[qk]) === 1) questSet[qk] = 1; }
      }
      s = 0; for (var qsk in questSet) s++;
      return s;

    case 5: // Account_LV — sum Lv0[0] for all chars
      s = 0;
      if (S.lv0AllData) for (ci = 0; ci < S.lv0AllData.length; ci++) s += num(S.lv0AllData[ci] && S.lv0AllData[ci][0]);
      return s;

    case 6: // Total_Tasks_Completed — sum TaskZZ1 (= tasksGlobalData[1]) all rows, cols 0..7
      if (!S.tasksGlobalData || !S.tasksGlobalData[1]) return 0;
      s = 0;
      var t1 = S.tasksGlobalData[1];
      for (i = 0; i < t1.length; i++) {
        var row = t1[i];
        if (Array.isArray(row)) for (var j = 0; j < 8; j++) s += num(row[j]);
      }
      return s;

    case 7: // Total_Achievements_Completed — count AchieveReg[r] === -1
      if (!S.achieveRegData) return 0;
      s = 0;
      for (i = 0; i < S.achieveRegData.length; i++) if (num(S.achieveRegData[i]) === -1) s++;
      return s;

    case 8: return ola(198);   // Most Money
    case 9: return ola(208);   // Most Spore Caps

    case 10: // Trophies_Found — count Cards1 entries starting with "Trophy"
      return _countCards1(S, 'Trophy');

    case 11: // Account_Skills_LV — sum all char skills (Lv0[1..21])
      s = 0;
      if (S.lv0AllData) for (ci = 0; ci < S.lv0AllData.length; ci++) {
        var lv = S.lv0AllData[ci];
        if (lv) for (i = 1; i <= 21; i++) s += Math.max(0, num(lv[i]));
      }
      return s;

    case 12: return ola(201);  // Best Spiketrap

    case 13: // Total_AFK_Hours — Tasks[0][0][2]
      if (S.tasksGlobalData && S.tasksGlobalData[0] && S.tasksGlobalData[0][0])
        return num(S.tasksGlobalData[0][0][2]);
      return 0;

    case 14: return ola(172);  // DPS Record Shimmer

    case 15: // Star_Talent_Points — TotalTalentPoints()[5], max across all characters
      return _starTalentPoints(S, undefined, S);

    case 16: { // Crystal_Spawn_Avg_Kills — 1/OLA[202]
      var cs = ola(202);
      return cs > 0 ? 1 / cs : 0;
    }

    case 17: // Dungeon_Rank — lookup OLA[71] in RANDOlist[29] thresholds
      v = ola(71);
      s = 1;
      if (dungRankThresholds) {
        for (i = 0; i < 60; i++) {
          if (v < Number(dungRankThresholds[i])) { s = i; break; }
        }
      }
      return s;

    case 18: return ola(200);  // Highest DR Multi — game updates OLA[200] = max(liveDR, OLA[200]) at runtime; save may be stale
    case 19: // Constellations_Completed — count completed constellations from SSprog
      // SSprog is an array of [name, status] pairs; status===1 means completed.
      if (S.starSignProgData) {
        s = 0;
        for (i = 0; i < S.starSignProgData.length; i++) {
          if (S.starSignProgData[i] && S.starSignProgData[i][1] === 1) s++;
        }
        return s;
      }
      return 0;

    case 20: return ola(203);  // Gravestone DMG

    case 21: // Unique_Obols_Found
      return _countCards1(S, 'Obol');

    case 22: // Total_Bubble_LV — sum CauldronInfo[0..3]
      if (!cauldronInfoData) return 0;
      s = 0;
      for (i = 0; i < 4; i++) s += arrSum(cauldronInfoData[i]);
      return s;

    case 23: // Total_Vial_LV — sum CauldronInfo[4]
      return cauldronInfoData ? arrSum(cauldronInfoData[4]) : 0;

    case 24: // Total_Sigil_LV — sum CauldronP2W[4][1+2*r]+1
      if (!S.cauldronP2WData || !S.cauldronP2WData[4]) return 0;
      s = 0;
      var sigils = S.cauldronP2WData[4];
      for (i = 0; i < Math.ceil(sigils.length / 2); i++) s += num(sigils[1 + 2 * i]) + 1;
      return s;

    case 25: return ola(199);  // Jackpots
    case 26: // PO_Boxes_Earned — CYDeliveryBox* fields
      return Math.round(num(S.deliveryBoxComplete) + num(S.deliveryBoxStreak) + num(S.deliveryBoxMisc));

    case 27: return ola(204);  // Killroy Warrior
    case 28: return ola(205);  // Killroy Archer
    case 29: return ola(206);  // Killroy Mage
    case 30: return 1000 - ola(207); // Fastest Efaunt (lower=better)
    case 31: return ola(211);  // Oak Printer
    case 32: return ola(212);  // Copper Printer
    case 33: return ola(213);  // Spore Printer
    case 34: return ola(214);  // Goldfish Printer
    case 35: return ola(215);  // Fly Printer
    case 36: return ola(209);  // Goblin Gorefest
    case 37: // Total_Best_Worship — sum TotemInfo[0]
      return S.totemInfoData && S.totemInfoData[0] ? arrSum(S.totemInfoData[0]) : 0;

    case 38: // Deathnote_Kill_Digits — sum ceil(log10(kills)) per deathnote mob + Ninja[105]
      s = 0;
      if (DN_MOB_DATA && klaData) {
        for (var dw = 0; dw < DN_MOB_DATA.length; dw++) {
          var dnMobs = DN_MOB_DATA[dw];
          if (!dnMobs) continue;
          for (var dm = 0; dm < dnMobs.length; dm++) {
            var dkIdx = dnMobs[dm][0], dKillReq = dnMobs[dm][1];
            if (dkIdx < 0) continue;
            var dKills = 0;
            for (ci = 0; ci < (numCharacters || 0); ci++) {
              var kla = klaData[ci];
              dKills += dKillReq - (num(kla && kla[dkIdx] && kla[dkIdx][0]));
            }
            if (dKills > 0) s += Math.ceil(getLOG(dKills));
          }
        }
      }
      // Ninja[105] bonus (EmporiumBonus 7 = jade emporium upgrade)
      if (S.ninjaData && S.ninjaData[105]) {
        for (i = 0; i < S.ninjaData[105].length; i++) {
          v = num(S.ninjaData[105][i]);
          if (v > 0) s += Math.ceil(getLOG(v));
        }
      }
      return s;

    case 39: // Equinox_Clouds_Completed — count WeeklyBoss "d_" keys with value -1
      if (!S.weeklyBossData) return 0;
      s = 0;
      var wb = S.weeklyBossData;
      for (var wk in wb) { if (String(wk).indexOf('d_') === 0 && num(wb[wk]) === -1) s++; }
      return s;

    case 40: // Total_Refinery_Rank — sum Refinery[3..8][1]
      if (!S.refineryData) return 0;
      s = 0;
      for (i = 3; i <= 8; i++) s += num(S.refineryData[i] && S.refineryData[i][1]);
      return s;

    case 41: return arrSum(S.atomsData); // Total Atom Upgrade LV

    case 42: // Total_Construct_Buildings_LV — sum Tower[0..26] (=TowerInfo building levels)
      if (!S.towerData) return 0;
      s = 0;
      for (i = 0; i < 27; i++) s += num(S.towerData[i]);
      return s;

    case 43: // Most_Tottoise_in_Storage — max Critter11A in chest
      if (!S.chestOrderData || !S.chestQuantityData) return 0;
      v = 0;
      for (i = 0; i < S.chestOrderData.length; i++) {
        if (String(S.chestOrderData[i]) === 'Critter11A') { v = num(S.chestQuantityData[i]); break; }
      }
      return v;

    case 44: return ola(224);  // Greenstacks
    case 45: return S.riftData ? num(S.riftData[0]) : 0; // Rift Levels

    case 46: // Highest_Power_Mob — max pet power from Pets + PetsStored
      if (!S.petsData && !S.petsStoredData) return 0;
      v = 0;
      if (S.petsData) for (i = 0; i < S.petsData.length; i++) { var pp = num(S.petsData[i] && S.petsData[i][2]); if (pp > v) v = pp; }
      if (S.petsStoredData) for (i = 0; i < S.petsStoredData.length; i++) { var pp2 = num(S.petsStoredData[i] && S.petsStoredData[i][2]); if (pp2 > v) v = pp2; }
      return v;

    case 47: return 1000 - ola(220); // Fastest Arena Round 100

    case 48: // Total_Kitchen_Upgrade_LV — sum Cooking[r][6]+[7]+[8] for r=0..9
      if (!S.cookingData) return 0;
      s = 0;
      for (i = 0; i < 10; i++) {
        var cr = S.cookingData[i];
        if (cr) s += num(cr[6]) + num(cr[7]) + num(cr[8]);
      }
      return s;

    case 49: // Total_Shiny_Mob_LV — sum shiny passive levels from Breeding[22..30]
      s = 0;
      if (S.breedingData) {
        for (var terr = 0; terr < 9; terr++) {
          var terrBr = S.breedingData[22 + terr];
          if (!terrBr) continue;
          for (i = 0; i < terrBr.length; i++) {
            var shExp = num(terrBr[i]);
            if (shExp > 0) {
              var shLv = 1;
              for (var t = 0; t < 19; t++) {
                if (shExp > Math.floor((1 + Math.pow(t + 1, 1.6)) * Math.pow(1.7, t + 1))) shLv = t + 2;
              }
              s += shLv;
            }
          }
        }
      }
      return s;

    case 50: // Total_Cooking_Meals_LV — sum Meals[0]
      return S.mealsData && S.mealsData[0] ? arrSum(S.mealsData[0]) : 0;

    case 51: // Total_Mob_Breedability_LV — sum breedability from Breeding[13..17]
      s = 0;
      if (S.breedingData) {
        for (var bt = 0; bt < 5; bt++) {
          var brTerr = S.breedingData[13 + bt];
          if (!brTerr) continue;
          for (i = 0; i < brTerr.length; i++) {
            var brExp = num(brTerr[i]);
            if (brExp > 0) {
              var multi2 = 1 + Math.log(Math.max(1, Math.pow(brExp + 1, 0.725)));
              s += Math.min(9, Math.floor(Math.pow(multi2 - 1, 0.8)) + 1);
            }
          }
        }
      }
      return s;

    case 52: // Total_Lab_Chips — sum Lab[15]
      return labData && labData[15] ? _arrSumPositive(labData[15]) : 0;

    case 53: // Total_Colosseum_Score — FamValColosseumHighscores
      return arrSum(S.colosseumHighscores);

    case 54: return ola(217);  // Most Giants
    case 55: // Total_Onyx_Statues — count statues at Onyx tier (StuG value >= 2)
      if (!S.statueGData) return 0;
      s = 0;
      for (i = 0; i < S.statueGData.length; i++) if (num(S.statueGData[i]) >= 2) s++;
      return s;

    case 56: return 1000 - ola(218); // Fastest Tremor Wurm

    case 57: // Total_Boat_Upgrade_LV — sum Boats[r][3]+[5]
      if (!S.boatsData) return 0;
      s = 0;
      for (i = 0; i < S.boatsData.length; i++) {
        var b = S.boatsData[i];
        if (b) s += num(b[3]) + num(b[5]);
      }
      return s;

    case 58: // God_Rank_Divinity — max(0, Divinity[25]-10)
      return divinityData ? Math.max(0, num(divinityData[25]) - 10) : 0;

    case 59: // Gaming_Plants_Evolved — GamingSprout[28][1]
      return S.gamingSproutData && S.gamingSproutData[28] ? num(S.gamingSproutData[28][1]) : 0;

    case 60: // Total_Artifacts_Found — sum Sailing[3]
      return S.sailingData && S.sailingData[3] ? arrSum(S.sailingData[3]) : 0;

    case 61: // Gold_Bar_Sailing_Treasure — Sailing[1][0]
      return S.sailingData && S.sailingData[1] ? num(S.sailingData[1][0]) : 0;

    case 62: // Highest_Captain_LV — max Captains[r][3] for r<20
      if (!S.captainsData) return 0;
      v = 0;
      for (i = 0; i < Math.min(20, S.captainsData.length); i++) {
        var cl = num(S.captainsData[i] && S.captainsData[i][3]);
        if (cl > v) v = cl;
      }
      return v;

    case 63: // Highest_Immortal_Snail — max(GamingSprout[32][1], OLA[210])
      v = S.gamingSproutData && S.gamingSproutData[32] ? num(S.gamingSproutData[32][1]) : 0;
      return Math.max(v, ola(210));

    case 64: // Best_Gold_Nugget — Gaming[8]
      return S.gamingData ? num(S.gamingData[8]) : 0;

    case 65: // Items_Found — Cards1.length
      return S.cards1Data ? S.cards1Data.length : 0;

    case 66: // Most_Gaming_Bits — Gaming[0]
      return S.gamingData ? num(S.gamingData[0]) : 0;

    case 67: // Highest_Crop_OG — 2^OLA[219]
      return Math.pow(2, ola(219));

    case 68: // Total_Crops_Discovered
      return S.farmCropCount || 0;

    case 69: // Total_Golden_Food_Beanstacks — sum Ninja[104]
      return S.ninjaData && S.ninjaData[104] ? arrSum(S.ninjaData[104]) : 0;

    case 70: // Total_Summoning_Upgrades_LV — sum Summon[0]
      return S.summonData && S.summonData[0] ? arrSum(S.summonData[0]) : 0;

    case 71: // Career_Summoning_Wins — count Pets + DN mob wins + OLA[319] endless
      s = 0;
      if (S.summonData && S.summonData[1]) {
        for (i = 0; i < S.summonData[1].length; i++) {
          var mobName = String(S.summonData[1][i]);
          if (mobName.indexOf('Pet') === 0) { s++; continue; }
          for (var dw = 0; dw < DeathNoteMobs.length; dw++) {
            if (DeathNoteMobs[dw].indexOf(mobName) !== -1) { s++; break; }
          }
        }
      }
      s += Math.round(ola(319));
      return s;

    case 72: { // Ninja_Floors_Unlocked
      var olaFloors = ola(232);
      if (olaFloors > 0) return 12 * olaFloors;
      // Fallback: count from ninja data (FloorsUnlocked helper)
      return 0;
    }

    case 73: // Familiars_Owned — sum(mult * Summon[4][r]), mult starts 1 and *=r+3
      s = 0;
      if (S.summonData && S.summonData[4]) {
        var famMult = 1;
        for (i = 0; i < 9; i++) {
          s += famMult * num(S.summonData[4][i]);
          famMult *= i + 3;
        }
      }
      return s;

    case 74: // Jade_Emporium — Ninja[102][9].length
      return S.ninjaData && S.ninjaData[102] && S.ninjaData[102][9]
        ? String(S.ninjaData[102][9]).length : 0;

    case 75: // Total_Minigame_Highscore — FamValMinigameHiscores + OLA[99]
      return arrSum(S.minigameHiscores) + ola(99);

    case 76: // Total_Prayer_Upgrade_LV — sum PrayOwned
      return arrSum(S.prayOwnedData);

    case 77: // Total_Land_Rank — sum FarmRank[0]
      return S.farmRankData && S.farmRankData[0] ? arrSum(S.farmRankData[0]) : 0;

    case 78: return ola(221);  // Magic Bean Trade
    case 79: return ola(222);  // LBoFaF Balls
    case 80: return arrSum(S.arcadeUpgData); // Arcade Gold Ball Shop

    case 81: // Vault_Upgrade_bonus_LV — VaultUpgBonus(57)
      return Math.round(vaultUpgBonus(57, S));

    case 82: // Total_Gambit_Time — Holes[11][65..70]
      if (!S.holesData || !S.holesData[11]) return 0;
      var h11 = S.holesData[11];
      return num(h11[65]) + num(h11[66]) + num(h11[67]) + num(h11[68]) + num(h11[69]) + num(h11[70]);

    case 83: // Cavern_Resources_Digits — sum ceil(log(Holes[9][r]))
      if (!S.holesData || !S.holesData[9]) return 0;
      s = 0;
      for (i = 0; i < S.holesData[9].length; i++) s += Math.ceil(getLOG(num(S.holesData[9][i])));
      return s;

    case 84: // Cavern_Villager_LV — sum round(max(0, Holes[1][r]))
      if (!S.holesData || !S.holesData[1]) return 0;
      s = 0;
      for (i = 0; i < S.holesData[1].length; i++) s += Math.round(Math.max(0, num(S.holesData[1][i])));
      return s;

    case 85: return ola(262);  // Megafeathers Orion
    case 86: return ola(279);  // Megafish Poppy
    case 87: return S.holesData && S.holesData[11] ? num(S.holesData[11][73]) : 0; // Bravery Monument
    case 88: return S.holesData && S.holesData[11] ? num(S.holesData[11][74]) : 0; // Justice Monument
    case 89: return S.holesData && S.holesData[11] ? num(S.holesData[11][75]) : 0; // Wisdom Monument
    case 90: return ola(356);  // Deathbringer Wraith
    case 91: return S.holesData && S.holesData[11] ? num(S.holesData[11][8]) : 0;  // Dawg Den

    case 92: // Resource_Layers_Destroyed — sum round(max(0, Holes[11][1,3,5,7]))
      if (!S.holesData || !S.holesData[11]) return 0;
      h11 = S.holesData[11];
      return Math.round(Math.max(0, num(h11[1]))) + Math.round(Math.max(0, num(h11[3]))) +
             Math.round(Math.max(0, num(h11[5]))) + Math.round(Math.max(0, num(h11[7])));

    case 93: // Total_Opals — sum round(max(0, Holes[7][r]))
      if (!S.holesData || !S.holesData[7]) return 0;
      s = 0;
      for (i = 0; i < S.holesData[7].length; i++) s += Math.round(Math.max(0, num(S.holesData[7][i])));
      return s;

    case 94: return Math.round(Math.min(12, ola(353))) + 1; // Pure Memory Round
    case 95: return Math.round(ola(369)); // Emperor Boss Kills

    case 96: // Summoning_Boss_Stone_Wins — sum KRbest.SummzTrz0..8
      s = 0;
      if (S.krBestData) {
        for (i = 0; i < 9; i++) s += Math.round(num(S.krBestData['SummzTrz' + i]));
      }
      return s;

    case 97: // Total_Coral_Reef_Upg — sum Spelunk[13][0..5]
      if (!S.spelunkData || !S.spelunkData[13]) return 0;
      s = 0;
      for (i = 0; i < 6; i++) s += num(S.spelunkData[13][i]);
      return s;

    case 98: // Deepest_Delve — max Spelunk[1]
      return S.spelunkData && S.spelunkData[1] ? arrMax(S.spelunkData[1]) : 0;

    case 99: // Ninja_Knowledge — sum Ninja[103]
      return S.ninjaData && S.ninjaData[103] ? arrSum(S.ninjaData[103]) : 0;

    case 100: return ola(445); // Windwalker Tempest
    case 101: return ola(446); // Arcane Cultist

    case 102: // Biggest_Haul_Delve — max Spelunk[2]
      return S.spelunkData && S.spelunkData[2] ? arrMax(S.spelunkData[2]) : 0;

    case 103: // Spelunk_Shop_Upgrades — sum max(0, Spelunk[5][r])
      if (!S.spelunkData || !S.spelunkData[5]) return 0;
      s = 0;
      for (i = 0; i < S.spelunkData[5].length; i++) s += Math.max(0, num(S.spelunkData[5][i]));
      return s;

    case 104: return S.spelunkData && S.spelunkData[6] ? S.spelunkData[6].length : 0; // Discoveries

    case 105: // Highest_Spelunker — max Lv0[19] across all chars
      v = 0;
      if (S.lv0AllData) for (ci = 0; ci < S.lv0AllData.length; ci++) {
        var spLv = num(S.lv0AllData[ci] && S.lv0AllData[ci][19]);
        if (spLv > v) v = spLv;
      }
      return v;

    case 106: return ola(443); // Lava Dev Streams

    case 107: // Nametags_Found
      return _countCards1(S, 'EquipmentNametag');

    case 108: // Megaflesh_Bubba — Bubba[1][8]
      return S.bubbaData && S.bubbaData[1] ? num(S.bubbaData[1][8]) : 0;

    case 109: // Premium_Hats — Spelunk[46].length
      return S.spelunkData && S.spelunkData[46] ? S.spelunkData[46].length : 0;

    case 110: // Minehead_Opponents — Research[7][4]
      return S.research && S.research[7] ? num(S.research[7][4]) : 0;

    case 111: // Rat_King_Crowns — Research[11].length
      return S.research && S.research[11] ? S.research[11].length : 0;

    case 112: // Farming_Stickers — sum Research[9] (TotalStickers)
      if (!S.research || !S.research[9]) return 0;
      s = 0;
      for (i = 0; i < S.research[9].length; i++) s += num(S.research[9][i]);
      return Math.round(s);

    case 113: return ola(498); // Tournament Registrations

    case 114: // Research_Grid_Upgrades — sum Research[0] (Grid_PTSspent)
      if (!S.research || !S.research[0]) return 0;
      s = 0;
      for (i = 0; i < S.research[0].length; i++) s += Math.round(num(S.research[0][i]));
      return s;

    case 115: // Total_Glimbo_Trades — sum round(max(0, Research[12][r]))
      if (!S.research || !S.research[12]) return 0;
      s = 0;
      for (i = 0; i < S.research[12].length; i++) s += Math.round(Math.max(0, num(S.research[12][i])));
      return s;

    case 116: // Unique_Sushi — from sushi data
      return S.cachedUniqueSushi || 0;

    case 117: return ola(594); // Button Presses

    default: return 0;
  }
}

// Count Cards1 entries with a given prefix  
function _countCards1(S, prefix) {
  if (!S.cards1Data) return 0;
  var c = 0;
  for (var i = 0; i < S.cards1Data.length; i++) {
    if (String(S.cards1Data[i]).indexOf(prefix) === 0) c++;
  }
  return c;
}

// Sum positives only
function _arrSumPositive(a) {
  if (!a) return 0;
  var s = 0;
  for (var i = 0; i < a.length; i++) s += Math.max(num(a[i]), 0);
  return s;
}

// ===== Breakdown: returns { val, children } explaining how each slot's qty is composed =====
// OLA shorthand for children
function _olaNode(idx) { return { name: 'OLA[' + idx + ']', val: ola(idx), fmt: 'raw' }; }
function _n(name, val) { return { name: name, val: val, fmt: 'raw' }; }

// Per-tab sum for stamp data
function _stampTabChildren() {
  if (!stampLvData) return [];
  if (!Array.isArray(stampLvData)) return [_n('all stamps', objSum(stampLvData))];
  var ch = [];
  var names = ['Combat', 'Skills', 'Misc'];
  for (var i = 0; i < stampLvData.length; i++) {
    ch.push(_n((names[i] || 'Tab ' + i) + ' stamps', objSum(stampLvData[i])));
  }
  return ch;
}

// Per-character sum helper — returns children array with per-char values
function _perCharSum(S, fn, label) {
  if (!S.lv0AllData) return [];
  var ch = [];
  for (var ci = 0; ci < S.lv0AllData.length; ci++) {
    var v = fn(S, ci);
    if (v) ch.push(_n((label || 'char') + ' ' + ci, v));
  }
  return ch;
}

export function tomeQTYBreakdown(slot, S, saveData) {
  if (!saveData) saveData = S;
  var val = tomeQTY(slot, S);
  var ch, i, s, v;

  switch (slot) {
    case 0: return { val: val, children: _stampTabChildren() };

    case 1: { // Statue LVs
      ch = [];
      var sla = S.statueLvAllData;
      if (sla && sla[0]) {
        var ca = sla[0];
        for (i = 0; i < ca.length; i++) {
          v = num(Array.isArray(ca[i]) ? ca[i][0] : ca[i]);
          if (v > 0) ch.push(_n('statue ' + i, v));
        }
      }
      return { val: val, children: ch };
    }

    case 2: { // Cards Total LV
      ch = [];
      if (S.cards0Data) {
        for (var ck in S.cards0Data) {
          v = computeCardLv(ck, saveData);
          if (v > 0) ch.push(_n(ck, v));
        }
      }
      return { val: val, children: ch };
    }

    case 3: { // Total Talent Max LV
      if (!skillLvMaxData || !skillLvMaxData.length) return { val: val, children: [] };
      var maxPS = {};
      for (var ci = 0; ci < skillLvMaxData.length; ci++) {
        var sk = skillLvMaxData[ci];
        if (!sk) continue;
        for (var si in sk) { v = num(sk[si]); if (!maxPS[si] || v > maxPS[si]) maxPS[si] = v; }
      }
      ch = [];
      for (var mk in maxPS) if (maxPS[mk] > 0) ch.push(_n('talent ' + mk, maxPS[mk]));
      return { val: val, children: ch };
    }

    case 4: { // Unique Quests Completed
      if (!S.questCompleteData) return { val: val, children: [] };
      var questSet = {};
      for (var qci = 0; qci < S.questCompleteData.length; qci++) {
        var qc = S.questCompleteData[qci];
        if (!qc) continue;
        for (var qk in qc) if (num(qc[qk]) === 1) questSet[qk] = 1;
      }
      return { val: val, children: [_n('unique quest keys', Object.keys(questSet).length)] };
    }

    case 5: // Account LV
      return { val: val, children: _perCharSum(S, function(S, ci) {
        return num(S.lv0AllData[ci] && S.lv0AllData[ci][0]);
      }, 'charLv') };

    case 6: { // Total Tasks Completed
      ch = [];
      if (S.tasksGlobalData && S.tasksGlobalData[1]) {
        var t1 = S.tasksGlobalData[1];
        for (i = 0; i < t1.length; i++) {
          var row = t1[i];
          if (Array.isArray(row)) {
            s = 0; for (var j = 0; j < 8; j++) s += num(row[j]);
            if (s > 0) ch.push(_n('task row ' + i, s));
          }
        }
      }
      return { val: val, children: ch };
    }

    case 7: // Achievements Completed
      return { val: val, children: [_n('achieveReg entries === -1', val)] };

    case 8: return { val: val, children: [_olaNode(198)] };
    case 9: return { val: val, children: [_olaNode(208)] };

    case 10: return { val: val, children: [_n('Cards1 "Trophy" prefix count', val)] };

    case 11: { // Account Skills LV
      ch = [];
      if (S.lv0AllData) for (var sci = 0; sci < S.lv0AllData.length; sci++) {
        var lv = S.lv0AllData[sci];
        if (!lv) continue;
        s = 0; for (i = 1; i <= 21; i++) s += Math.max(0, num(lv[i]));
        if (s > 0) ch.push(_n('char ' + sci + ' skills', s));
      }
      return { val: val, children: ch };
    }

    case 12: return { val: val, children: [_olaNode(201)] };

    case 13: return { val: val, children: [_n('Tasks[0][0][2]', val)] };

    case 14: return { val: val, children: [_olaNode(172)] };

    case 15: // Star Talent Points — complex, delegate to detail
      return _starTalentPointsBreakdown(S, undefined, saveData);

    case 16: return { val: val, children: [_olaNode(202), _n('1/OLA[202]', val)] };

    case 17: return { val: val, children: [_olaNode(71), _n('rank from thresholds', val)] };

    case 18: return { val: val, children: [_olaNode(200)] };

    case 19: { // Constellations Completed
      ch = [];
      if (S.starSignProgData) {
        s = 0;
        for (i = 0; i < S.starSignProgData.length; i++) {
          if (S.starSignProgData[i] && S.starSignProgData[i][1] === 1) s++;
        }
        ch.push(_n('completed constellations', s));
      }
      return { val: val, children: ch };
    }

    case 20: return { val: val, children: [_olaNode(203)] };

    case 21: return { val: val, children: [_n('Cards1 "Obol" prefix count', val)] };

    case 22: { // Total Bubble LV
      ch = [];
      if (cauldronInfoData) {
        var cauldNames = ['Power', 'Quicc', 'High-IQ', 'Kazam'];
        for (i = 0; i < 4; i++) {
          v = arrSum(cauldronInfoData[i]);
          ch.push(_n(cauldNames[i] + ' cauldron', v));
        }
      }
      return { val: val, children: ch };
    }

    case 23: return { val: val, children: [_n('sum CauldronInfo[4]', val)] };

    case 24: { // Total Sigil LV
      ch = [];
      if (S.cauldronP2WData && S.cauldronP2WData[4]) {
        var sigs = S.cauldronP2WData[4];
        for (i = 0; i < Math.ceil(sigs.length / 2); i++) {
          v = num(sigs[1 + 2 * i]) + 1;
          ch.push(_n('sigil ' + i, v));
        }
      }
      return { val: val, children: ch };
    }

    case 25: return { val: val, children: [_olaNode(199)] };

    case 26: return { val: val, children: [
      _n('deliveryBoxComplete', num(S.deliveryBoxComplete)),
      _n('deliveryBoxStreak', num(S.deliveryBoxStreak)),
      _n('deliveryBoxMisc', num(S.deliveryBoxMisc)),
    ]};

    case 27: return { val: val, children: [_olaNode(204)] };
    case 28: return { val: val, children: [_olaNode(205)] };
    case 29: return { val: val, children: [_olaNode(206)] };

    case 30: return { val: val, children: [_olaNode(207), _n('1000 - OLA[207]', val)] };

    case 31: return { val: val, children: [_olaNode(211)] };
    case 32: return { val: val, children: [_olaNode(212)] };
    case 33: return { val: val, children: [_olaNode(213)] };
    case 34: return { val: val, children: [_olaNode(214)] };
    case 35: return { val: val, children: [_olaNode(215)] };
    case 36: return { val: val, children: [_olaNode(209)] };

    case 37: return { val: val, children: [_n('sum TotemInfo[0]', val)] };

    case 38: { // Deathnote Kill Digits
      ch = [];
      var dnTotal = 0;
      if (DN_MOB_DATA && klaData) {
        for (var dw = 0; dw < DN_MOB_DATA.length; dw++) {
          var dnMobs = DN_MOB_DATA[dw];
          if (!dnMobs) continue;
          var worldDigits = 0;
          for (var dm = 0; dm < dnMobs.length; dm++) {
            var dkIdx = dnMobs[dm][0];
            if (dkIdx < 0) continue;
            var dKills = 0;
            for (var dci = 0; dci < (numCharacters || 0); dci++) {
              var kla2 = klaData[dci];
              dKills += dnMobs[dm][1] - num(kla2 && kla2[dkIdx] && kla2[dkIdx][0]);
            }
            if (dKills > 0) worldDigits += Math.ceil(getLOG(dKills));
          }
          dnTotal += worldDigits;
          ch.push(_n('DN world ' + dw + ' digits', worldDigits));
        }
      }
      // Ninja[105] bonus
      var ninjaDigits = 0;
      if (S.ninjaData && S.ninjaData[105]) {
        for (i = 0; i < S.ninjaData[105].length; i++) {
          v = num(S.ninjaData[105][i]);
          if (v > 0) ninjaDigits += Math.ceil(getLOG(v));
        }
      }
      if (ninjaDigits) ch.push(_n('Ninja[105] digits', ninjaDigits));
      return { val: val, children: ch };
    }

    case 39: return { val: val, children: [_n('WeeklyBoss "d_" keys === -1', val)] };

    case 40: { // Total Refinery Rank
      ch = [];
      if (S.refineryData) {
        var saltNames = ['Redox', 'Explosive', 'Spontite', 'Dioxide', 'Purple', 'Nullo'];
        for (i = 3; i <= 8; i++) {
          v = num(S.refineryData[i] && S.refineryData[i][1]);
          ch.push(_n((saltNames[i - 3] || 'salt ' + i) + ' rank', v));
        }
      }
      return { val: val, children: ch };
    }

    case 41: return { val: val, children: [_n('sum atomsData', val)] };

    case 42: { // Total Construct Buildings LV
      ch = [];
      if (S.towerData) {
        for (i = 0; i < 27; i++) {
          v = num(S.towerData[i]);
          if (v > 0) ch.push(_n('building ' + i, v));
        }
      }
      return { val: val, children: ch };
    }

    case 43: return { val: val, children: [_n('Critter11A in storage', val)] };
    case 44: return { val: val, children: [_olaNode(224)] };
    case 45: return { val: val, children: [_n('Rift[0]', val)] };

    case 46: { // Highest Power Mob
      ch = [];
      v = 0;
      if (S.petsData) {
        for (i = 0; i < S.petsData.length; i++) {
          var pp = num(S.petsData[i] && S.petsData[i][2]);
          if (pp > v) v = pp;
        }
        ch.push(_n('max Pets power', v));
      }
      var v2 = 0;
      if (S.petsStoredData) {
        for (i = 0; i < S.petsStoredData.length; i++) {
          var pp2 = num(S.petsStoredData[i] && S.petsStoredData[i][2]);
          if (pp2 > v2) v2 = pp2;
        }
        ch.push(_n('max PetsStored power', v2));
      }
      return { val: val, children: ch };
    }

    case 47: return { val: val, children: [_olaNode(220), _n('1000 - OLA[220]', val)] };

    case 48: { // Total Kitchen Upgrade LV
      ch = [];
      if (S.cookingData) {
        for (i = 0; i < 10; i++) {
          var cr = S.cookingData[i];
          if (!cr) continue;
          v = num(cr[6]) + num(cr[7]) + num(cr[8]);
          if (v > 0) ch.push(_n('kitchen ' + i + ' (spd+fire+luck)', v));
        }
      }
      return { val: val, children: ch };
    }

    case 49: { // Total Shiny Mob LV
      ch = [];
      if (S.breedingData) {
        for (var terr = 0; terr < 9; terr++) {
          var terrBr = S.breedingData[22 + terr];
          if (!terrBr) continue;
          var terrSum = 0;
          for (i = 0; i < terrBr.length; i++) {
            var shExp = num(terrBr[i]);
            if (shExp > 0) {
              var shLv = 1;
              for (var t = 0; t < 19; t++) {
                if (shExp > Math.floor((1 + Math.pow(t + 1, 1.6)) * Math.pow(1.7, t + 1))) shLv = t + 2;
              }
              terrSum += shLv;
            }
          }
          if (terrSum > 0) ch.push(_n('territory ' + terr + ' shiny LV', terrSum));
        }
      }
      return { val: val, children: ch };
    }

    case 50: return { val: val, children: [_n('sum Meals[0]', val)] };

    case 51: { // Total Mob Breedability LV
      ch = [];
      if (S.breedingData) {
        for (var bt = 0; bt < 5; bt++) {
          var brTerr = S.breedingData[13 + bt];
          if (!brTerr) continue;
          var bSum = 0;
          for (i = 0; i < brTerr.length; i++) {
            var brExp = num(brTerr[i]);
            if (brExp > 0) {
              var multi2 = 1 + Math.log(Math.max(1, Math.pow(brExp + 1, 0.725)));
              bSum += Math.min(9, Math.floor(Math.pow(multi2 - 1, 0.8)) + 1);
            }
          }
          if (bSum > 0) ch.push(_n('breed territory ' + bt, bSum));
        }
      }
      return { val: val, children: ch };
    }

    case 52: return { val: val, children: [_n('sum Lab[15] (positives)', val)] };
    case 53: return { val: val, children: [_n('sum colosseumHighscores', val)] };
    case 54: return { val: val, children: [_olaNode(217)] };

    case 55: { // Total Onyx Statues
      ch = [];
      if (S.statueGData) {
        for (i = 0; i < S.statueGData.length; i++) {
          if (num(S.statueGData[i]) >= 2) ch.push(_n('statue ' + i + ' (onyx+)', 1));
        }
      }
      return { val: val, children: ch };
    }

    case 56: return { val: val, children: [_olaNode(218), _n('1000 - OLA[218]', val)] };

    case 57: { // Total Boat Upgrade LV
      ch = [];
      if (S.boatsData) {
        for (i = 0; i < S.boatsData.length; i++) {
          var b = S.boatsData[i];
          if (!b) continue;
          v = num(b[3]) + num(b[5]);
          if (v > 0) ch.push(_n('boat ' + i + ' (spd+loot)', v));
        }
      }
      return { val: val, children: ch };
    }

    case 58: return { val: val, children: [_n('Divinity[25]', divinityData ? num(divinityData[25]) : 0), _n('max(0, val-10)', val)] };
    case 59: return { val: val, children: [_n('GamingSprout[28][1]', val)] };
    case 60: return { val: val, children: [_n('sum Sailing[3]', val)] };
    case 61: return { val: val, children: [_n('Sailing[1][0]', val)] };

    case 62: { // Highest Captain LV
      ch = [];
      if (S.captainsData) {
        for (i = 0; i < Math.min(20, S.captainsData.length); i++) {
          v = num(S.captainsData[i] && S.captainsData[i][3]);
          if (v > 0) ch.push(_n('captain ' + i, v));
        }
      }
      return { val: val, children: [_n('max captain LV', val)] };
    }

    case 63: return { val: val, children: [_n('GamingSprout[32][1]', S.gamingSproutData && S.gamingSproutData[32] ? num(S.gamingSproutData[32][1]) : 0), _olaNode(210)] };
    case 64: return { val: val, children: [_n('Gaming[8]', val)] };
    case 65: return { val: val, children: [_n('Cards1.length', val)] };
    case 66: return { val: val, children: [_n('Gaming[0]', val)] };
    case 67: return { val: val, children: [_olaNode(219), _n('2^OLA[219]', val)] };
    case 68: return { val: val, children: [_n('farmCropCount', val)] };
    case 69: return { val: val, children: [_n('sum Ninja[104]', val)] };
    case 70: return { val: val, children: [_n('sum Summon[0]', val)] };

    case 71: { // Career Summoning Wins
      ch = [];
      var petWins = 0, dnWins = 0;
      if (S.summonData && S.summonData[1]) {
        for (i = 0; i < S.summonData[1].length; i++) {
          var mobName = String(S.summonData[1][i]);
          if (mobName.indexOf('Pet') === 0) { petWins++; continue; }
          for (var dw = 0; dw < DeathNoteMobs.length; dw++) {
            if (DeathNoteMobs[dw].indexOf(mobName) !== -1) { dnWins++; break; }
          }
        }
      }
      ch.push(_n('Pet wins', petWins));
      ch.push(_n('DN mob wins', dnWins));
      ch.push(_n('OLA[319] endless', Math.round(ola(319))));
      return { val: val, children: ch };
    }

    case 72: return { val: val, children: [_olaNode(232), _n('12 * OLA[232]', val)] };

    case 73: { // Familiars Owned
      ch = [];
      if (S.summonData && S.summonData[4]) {
        var famMult = 1;
        for (i = 0; i < 9; i++) {
          v = famMult * num(S.summonData[4][i]);
          if (v > 0) ch.push(_n('rarity ' + i + ' (x' + famMult + ')', v));
          famMult *= i + 3;
        }
      }
      return { val: val, children: ch };
    }

    case 74: return { val: val, children: [_n('Ninja[102][9].length', val)] };

    case 75: return { val: val, children: [
      _n('sum minigameHiscores', arrSum(S.minigameHiscores)),
      _olaNode(99),
    ]};

    case 76: return { val: val, children: [_n('sum prayOwnedData', val)] };
    case 77: return { val: val, children: [_n('sum FarmRank[0]', val)] };
    case 78: return { val: val, children: [_olaNode(221)] };
    case 79: return { val: val, children: [_olaNode(222)] };
    case 80: return { val: val, children: [_n('sum arcadeUpgData', val)] };

    case 81: return { val: val, children: [_n('VaultUpgBonus(57)', val)] };

    case 82: { // Total Gambit Time
      ch = [];
      if (S.holesData && S.holesData[11]) {
        var h11 = S.holesData[11];
        for (i = 65; i <= 70; i++) ch.push(_n('Holes[11][' + i + ']', num(h11[i])));
      }
      return { val: val, children: ch };
    }

    case 83: { // Cavern Resources Digits
      ch = [];
      if (S.holesData && S.holesData[9]) {
        for (i = 0; i < S.holesData[9].length; i++) {
          v = Math.ceil(getLOG(num(S.holesData[9][i])));
          if (v > 0) ch.push(_n('resource ' + i + ' digits', v));
        }
      }
      return { val: val, children: ch };
    }

    case 84: { // Cavern Villager LV
      ch = [];
      if (S.holesData && S.holesData[1]) {
        for (i = 0; i < S.holesData[1].length; i++) {
          v = Math.round(Math.max(0, num(S.holesData[1][i])));
          if (v > 0) ch.push(_n('villager ' + i, v));
        }
      }
      return { val: val, children: ch };
    }

    case 85: return { val: val, children: [_olaNode(262)] };
    case 86: return { val: val, children: [_olaNode(279)] };
    case 87: return { val: val, children: [_n('Holes[11][73]', val)] };
    case 88: return { val: val, children: [_n('Holes[11][74]', val)] };
    case 89: return { val: val, children: [_n('Holes[11][75]', val)] };
    case 90: return { val: val, children: [_olaNode(356)] };
    case 91: return { val: val, children: [_n('Holes[11][8]', val)] };

    case 92: { // Resource Layers Destroyed
      ch = [];
      if (S.holesData && S.holesData[11]) {
        var h11b = S.holesData[11];
        ch.push(_n('Holes[11][1] Motherlode', Math.round(Math.max(0, num(h11b[1])))));
        ch.push(_n('Holes[11][3] Hive', Math.round(Math.max(0, num(h11b[3])))));
        ch.push(_n('Holes[11][5] Evertree', Math.round(Math.max(0, num(h11b[5])))));
        ch.push(_n('Holes[11][7]', Math.round(Math.max(0, num(h11b[7])))));
      }
      return { val: val, children: ch };
    }

    case 93: { // Total Opals
      ch = [];
      if (S.holesData && S.holesData[7]) {
        for (i = 0; i < S.holesData[7].length; i++) {
          v = Math.round(Math.max(0, num(S.holesData[7][i])));
          if (v > 0) ch.push(_n('opal ' + i, v));
        }
      }
      return { val: val, children: ch };
    }

    case 94: return { val: val, children: [_olaNode(353), _n('round(min(12,OLA[353]))+1', val)] };
    case 95: return { val: val, children: [_olaNode(369)] };

    case 96: { // Summoning Boss Stone Wins
      ch = [];
      if (S.krBestData) {
        for (i = 0; i < 9; i++) {
          v = Math.round(num(S.krBestData['SummzTrz' + i]));
          if (v > 0) ch.push(_n('SummzTrz' + i, v));
        }
      }
      return { val: val, children: ch };
    }

    case 97: { // Total Coral Reef Upg
      ch = [];
      if (S.spelunkData && S.spelunkData[13]) {
        for (i = 0; i < 6; i++) ch.push(_n('reef upg ' + i, num(S.spelunkData[13][i])));
      }
      return { val: val, children: ch };
    }

    case 98: return { val: val, children: [_n('max Spelunk[1]', val)] };
    case 99: return { val: val, children: [_n('sum Ninja[103]', val)] };
    case 100: return { val: val, children: [_olaNode(445)] };
    case 101: return { val: val, children: [_olaNode(446)] };
    case 102: return { val: val, children: [_n('max Spelunk[2]', val)] };

    case 103: { // Spelunk Shop Upgrades
      ch = [];
      if (S.spelunkData && S.spelunkData[5]) {
        for (i = 0; i < S.spelunkData[5].length; i++) {
          v = Math.max(0, num(S.spelunkData[5][i]));
          if (v > 0) ch.push(_n('shop upg ' + i, v));
        }
      }
      return { val: val, children: ch };
    }

    case 104: return { val: val, children: [_n('Spelunk[6].length', val)] };

    case 105: { // Highest Spelunker
      ch = [];
      if (S.lv0AllData) {
        for (var sci = 0; sci < S.lv0AllData.length; sci++) {
          v = num(S.lv0AllData[sci] && S.lv0AllData[sci][19]);
          if (v > 0) ch.push(_n('char ' + sci + ' spelunk LV', v));
        }
      }
      return { val: val, children: ch };
    }

    case 106: return { val: val, children: [_olaNode(443)] };
    case 107: return { val: val, children: [_n('Cards1 "EquipmentNametag" count', val)] };
    case 108: return { val: val, children: [_n('Bubba[1][8]', val)] };
    case 109: return { val: val, children: [_n('Spelunk[46].length', val)] };
    case 110: return { val: val, children: [_n('Research[7][4]', val)] };
    case 111: return { val: val, children: [_n('Research[11].length', val)] };
    case 112: return { val: val, children: [_n('sum Research[9]', val)] };
    case 113: return { val: val, children: [_olaNode(498)] };
    case 114: return { val: val, children: [_n('sum Research[0]', val)] };
    case 115: return { val: val, children: [_n('sum Research[12]', val)] };
    case 116: return { val: val, children: [_n('cachedUniqueSushi', val)] };
    case 117: return { val: val, children: [_olaNode(594)] };

    default: return { val: val, children: [] };
  }
}

// ===== Star Talent Points breakdown — slot 15 =====
function _starTalentPointsBreakdown(S, activeCharIdx, saveData) {
  var famBonus64 = _famBonus64(S, activeCharIdx);
  var stamp = computeStampBonusOfTypeX('TalentS', saveData);
  var card1 = Math.min(5 * computeCardLv('w4b2', saveData), 50);
  var card2 = Math.min(15 * computeCardLv('Boss2C', saveData), 100);
  var card3 = Math.min(4 * computeCardLv('fallEvent1', saveData), 100);
  var ach = 10 * achieveStatus(212, saveData) + 20 * achieveStatus(289, saveData) + 20 * achieveStatus(305, saveData);
  var shiny = computeShinyBonusS(14, saveData);
  var bribe = getBribeBonus(32, saveData);
  var vub = vaultUpgBonus(53, saveData);
  var comp = companions(20, saveData);
  var flurbo = computeFlurboShop(1, saveData);
  var sigil2 = sigilBonus(9, saveData);
  var cy5 = num(saveData.cyTalentPointsData && saveData.cyTalentPointsData[5]);
  var gd = saveData.guildData;
  var guildLv = gd ? num(gd[0] && gd[0][11]) : 0;
  var gp = guildBonusParams(11);
  var guild11 = guildLv > 0 && gp ? Math.floor(formulaEval(gp.formula, gp.x1, gp.x2, guildLv)) : 0;
  var fractal = ola(184) >= 20000 ? 100 : 0;

  var best = 0, bestCI = -1, bestChildren = [];
  var lv0All = S.lv0AllData;
  if (!lv0All) return { val: 0, children: [] };
  for (var ci = 0; ci < lv0All.length; ci++) {
    var lv = lv0All[ci];
    if (!lv) continue;
    var charLv = num(lv[0]);
    var dn4 = -3;
    for (var n = 1; n <= 9; n++) dn4 += Math.max(0, num(lv[n]));
    var aCtx = activeCharIdx != null ? activeCharIdx : ci;
    var ctx = { charIdx: ci, activeCharIdx: aCtx, saveData: saveData };
    var r275val = 0;
    try { var r275 = talent.resolve(275, ctx); r275val = Math.round(r275 ? r275.val || 0 : 0); } catch (e) { }
    dn4 += r275val;
    var t8 = 0, t622 = 0, t17 = 0;
    try { t8 = talent.resolve(8, ctx).val || 0; } catch (e) { }
    try { t622 = talent.resolve(622, ctx).val || 0; } catch (e) { }
    try { t17 = talent.resolve(17, ctx).val || 0; } catch (e) { }
    var total = Math.floor(charLv - 1 + dn4 + t8 + cy5 + famBonus64 + t622 + stamp + t17 + guild11 + flurbo +
      card1 + card2 + card3 + sigil2 + ach + shiny + bribe + fractal + vub + comp);
    if (total > best) {
      best = total;
      bestCI = ci;
      bestChildren = [
        _n('charLv-1', charLv - 1),
        _n('TalentDN4 (skillPts+t275)', dn4),
        _n('talent 8', t8),
        _n('CY star pts', cy5),
        _n('famBonus64', famBonus64),
        _n('talent 622', t622),
        _n('stamp TalentS', stamp),
        _n('talent 17', t17),
        _n('guild 11', guild11),
        _n('flurbo shop', flurbo),
        _n('card w4b2', card1),
        _n('card Boss2C', card2),
        _n('card fallEvent1', card3),
        _n('sigil 9', sigil2),
        _n('achievements', ach),
        _n('shiny 14', shiny),
        _n('bribe 32', bribe),
        _n('fractal', fractal),
        _n('vault upg 53', vub),
        _n('companion 20', comp),
      ];
    }
  }
  return { val: best, children: [_n('best char: ' + bestCI, best, 'raw')].concat(bestChildren) };
}

// ===== FamBonusQTYs[64] — ClassFamilyBonuses[32] star talent points =====
// Game computes FamBonusQTYs by iterating all players, running ReturnClasses
// on each class, and for each class in the chain computing FamilyBonsuesREAL.
// FamBonusQTYs[64] = max across all chars whose ReturnClasses includes 32.
// Classes with 32 in ReturnClasses: 32 (WIZARD), 34, 35.
// CFB[32]: intervalAdd(1, 6, max(0, round(charLv - 29))).
// Active char with talent 144 gets a multiplicative boost.
function _famBonus64(S, activeCharIdx) {
  // Classes whose ReturnClasses() includes 32
  var FB32_CLASSES = [32, 34, 35];
  var fb = familyBonusParams(32);
  if (!fb) return 0;
  var maxVal = 0;
  for (var ci = 0; ci < numCharacters; ci++) {
    var cls = charClassData[ci];
    if (FB32_CLASSES.indexOf(cls) === -1) continue;
    var charLv = Number(S.lv0AllData[ci] && S.lv0AllData[ci][0]) || 0;
    var N = Math.max(0, Math.round(charLv - fb.lvOffset));
    var val = N > 0 ? formulaEval(fb.formula, fb.x1, fb.x2, N) : 0;
    // Active char gets talent 144 boost (game: GetTalentNumber(1,144))
    if (activeCharIdx != null && ci === activeCharIdx) {
      try {
        var t144 = talent.resolve(144, { charIdx: ci, saveData: S });
        if (t144 && t144.val > 0) val *= 1 + t144.val / 100;
      } catch (e) { }
    }
    if (val > maxVal) maxVal = val;
  }
  return maxVal;
}

// ===== Star Talent Points (slot 15) — TotalTalentPoints()[5] =====
// Game formula: TalentDL2[5] = floor(Lv0[0]-1 + TalentDN4 + sum of ~20 bonus terms)
// TalentDN4 = -3 + sum(Lv0[1..9]) + round(GetTalentNumber(1,275))
// Per-character; we take max across all chars.
// activeCharIdx: the "active" character whose context is used for AllTalentLVz
// bonuses (Spelunk, talents 149/374/539).  Game uses the logged-in character.
function _starTalentPoints(S, activeCharIdx, saveData) {
  // Account-wide bonuses (computed once)
  var famBonus64 = _famBonus64(S, activeCharIdx);
  var stamp = computeStampBonusOfTypeX('TalentS', saveData);
  var card1 = Math.min(5 * computeCardLv('w4b2', saveData), 50);
  var card2 = Math.min(15 * computeCardLv('Boss2C', saveData), 100);
  var card3 = Math.min(4 * computeCardLv('fallEvent1', saveData), 100);
  var ach = 10 * achieveStatus(212, saveData) + 20 * achieveStatus(289, saveData) + 20 * achieveStatus(305, saveData);
  var shiny = computeShinyBonusS(14, saveData);
  var bribe = getBribeBonus(32, saveData);
  var vub = vaultUpgBonus(53, saveData);
  var comp = companions(20, saveData);
  var flurbo = computeFlurboShop(1, saveData);
  var sigil = sigilBonus(9, saveData);
  var cy5 = num(saveData.cyTalentPointsData && saveData.cyTalentPointsData[5]);
  // Guild bonus 11: Talent_Points_Star
  var gd = saveData.guildData;
  var guildLv = gd ? num(gd[0] && gd[0][11]) : 0;
  var gp = guildBonusParams(11);
  var guild11 = guildLv > 0 && gp ? Math.floor(formulaEval(gp.formula, gp.x1, gp.x2, guildLv)) : 0;
  // FractalIslandBonus[5]: OLA[184] >= 20000
  var fractal = ola(184) >= 20000 ? 100 : 0;

  var best = 0;
  var lv0All = S.lv0AllData;
  if (!lv0All) return 0;
  for (var ci = 0; ci < lv0All.length; ci++) {
    var lv = lv0All[ci];
    if (!lv) continue;
    var charLv = num(lv[0]);
    // TalentDN4 = -3 + sum(Lv0[1..9]) + round(GetTalentNumber(1,275))
    var dn4 = -3;
    for (var n = 1; n <= 9; n++) dn4 += Math.max(0, num(lv[n]));
    // Use activeCharIdx for AllTalentLVz context if provided, otherwise use ci
    var aCtx = activeCharIdx != null ? activeCharIdx : ci;
    var ctx = { charIdx: ci, activeCharIdx: aCtx, saveData: saveData };
    try { var r275 = talent.resolve(275, ctx); dn4 += Math.round(r275 ? r275.val || 0 : 0); } catch (e) { }
    // Per-char talent bonuses
    var t8 = 0, t622 = 0, t17 = 0;
    try { t8 = talent.resolve(8, ctx).val || 0; } catch (e) { }
    try { t622 = talent.resolve(622, ctx).val || 0; } catch (e) { }
    try { t17 = talent.resolve(17, ctx).val || 0; } catch (e) { }
    var total = Math.floor(charLv - 1 + dn4 + t8 + cy5 + famBonus64 + t622 + stamp + t17 + guild11 + flurbo +
      card1 + card2 + card3 + sigil + ach + shiny + bribe + fractal + vub + comp);
    if (total > best) best = total;
  }
  return best;
}

// ===== Compute highest Drop Rarity across all characters × best map =====
// Uses the descriptor system to evaluate DR per character on the map with
// the highest arcane map bonus.  Returns structured info so callers can
// detect when a new in-game highest is achievable.
// If charIdx is provided, only compute DR for that character.
var _drComputing = false;
function _computeHighestDR(S, charIdx) {
  if (_drComputing) return { bestDR: ola(200), bestChar: -1, bestMap: -1, olaValue: ola(200), isNewHighest: false };
  _drComputing = true;
  try {
    var olaVal = ola(200);
    var best = olaVal;
    var bestChar = -1, bestMap = -1;
    var nChars = numCharacters || 10;
    var mb = mapBonData;

    // Find the single map with the highest capped arcane bonus (slot 0 kills).
    // The arcane map bonus is account-wide (same for all chars on a given map).
    var topMapIdx = -1, topMapBonus = 0;
    if (mb && mb.length) {
      for (var mi = 0; mi < mb.length; mi++) {
        var bonus = computeArcaneMapMultiBon(0, { mapBon: mb, mapIdx: mi });
        if (bonus > topMapBonus) { topMapBonus = bonus; topMapIdx = mi; }
      }
    }

    // For each character, compute DR on the best map (or without map if no bonus).
    var startCI = charIdx != null ? charIdx : 0;
    var endCI = charIdx != null ? charIdx + 1 : nChars;
    for (var ci = startCI; ci < endCI; ci++) {
      try {
        var ctxOpts = { charIdx: ci, saveData: S };
        if (topMapIdx >= 0 && mb) {
          ctxOpts.mapIdx = topMapIdx;
          ctxOpts.mapBon = mb;
        }
        var ctx = createStatContext(ctxOpts);
        var result = ctx.resolve('drop-rate');
        if (result && result.val > best) {
          best = result.val;
          bestChar = ci;
          bestMap = topMapIdx;
        }
      } catch (e) { /* skip chars that error */ }
    }

    return {
      bestDR: best,
      bestChar: bestChar,
      bestMap: bestMap,
      olaValue: olaVal,
      isNewHighest: best > olaVal,
    };
  } finally {
    _drComputing = false;
  }
}

// ===== Main: compute total Tome Score from save data =====
// Two-phase: first computes with OLA[200] for slot [18], then recomputes
// slot [18] with live DR from all characters on the best map and adjusts the total.
// charIdx: optional — when provided, character-sensitive slots (star talent pts,
//          DR) use this character's context, matching the game's active-player logic.
export function computeTomeScore(S, charIdx, saveData) {
  if (!saveData) saveData = S;
  // Phase 1: compute with stale OLA[200]
  var total = 0;
  for (var i = 0; i < T.length; i++) {
    var qty = (i === 15) ? _starTalentPoints(S, charIdx, saveData) : tomeQTY(i, S);
    var td = T[i];
    total += Math.ceil(tomePCT(qty, td[1], td[0]) * td[2]);
  }
  // Set total so TomeBonus resolver can use it for DR computation
  assignState({ totalTomePoints: total });

  // Phase 2: compute live DR, update slot [18] if higher
  var td18 = T[18];
  var oldQty = tomeQTY(18, S);
  var oldPts = Math.ceil(tomePCT(oldQty, td18[1], td18[0]) * td18[2]);
  var drInfo = _computeHighestDR(S, charIdx);
  var newQty = Math.max(drInfo.bestDR, oldQty);
  var newPts = Math.ceil(tomePCT(newQty, td18[1], td18[0]) * td18[2]);
  total += newPts - oldPts;
  return total;
}

// ===== Per-slot detail for debugging =====
// Same two-phase approach: compute all slots, then fix slot [18] with live DR.
// Returns { slots, drInfo } where drInfo contains map/char info for notifications.
export function computeTomeScoreDetail(S, charIdx, saveData) {
  if (!saveData) saveData = S;
  var slots = [];
  for (var i = 0; i < T.length; i++) {
    var qty = (i === 15) ? _starTalentPoints(S, charIdx, saveData) : tomeQTY(i, S);
    var td = T[i];
    var pts = Math.ceil(tomePCT(qty, td[1], td[0]) * td[2]);
    slots.push({ slot: i, qty: qty, pts: pts, half: td[0], mode: td[1], maxPts: td[2] });
  }
  // Set total so TomeBonus resolver can use it for DR computation
  var total = 0;
  for (var j = 0; j < slots.length; j++) total += slots[j].pts;
  assignState({ totalTomePoints: total });

  // Phase 2: recompute slot [18] with live DR
  var drInfo = _computeHighestDR(S, charIdx);
  var s18 = slots[18];
  var newQty = Math.max(drInfo.bestDR, s18.qty);
  if (newQty !== s18.qty) {
    s18.qty = newQty;
    s18.pts = Math.ceil(tomePCT(newQty, s18.mode, s18.half) * s18.maxPts);
  }
  return { slots: slots, drInfo: drInfo };
}
