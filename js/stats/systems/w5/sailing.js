// ===== SAILING SYSTEM (W5) =====
// Artifact bonuses from sailing.

import { charClassData } from '../../../save/data.js';
import { artifactBase } from '../../data/w5/sailing.js';
import { ArtifactInfo } from '../../data/game/customlists.js';
import { getLOG } from '../../../formulas.js';
import { divinityData } from '../../../save/data.js';
import { mainframeBonus } from '../w4/lab.js';
import { computeMeritocBonusz } from '../w7/meritoc.js';
import { vaultUpgBonus } from '../common/vault.js';
import { legendPTSbonus } from '../w7/spelunking.js';
import { computeTotalStat } from '../common/stats.js';
import { computePlayerBuildSpd } from '../w3/construction.js';

var ARTIFACT_TIER_MULTIPLIER_TEXT = {
  2: "The_artifact's_main_bonus_is_doubled!",
  3: "The_artifact's_main_bonus_is_tripled!",
  4: "The_artifact's_main_bonus_is_quadrupled!",
  5: "The_artifact's_main_bonus_is_quintupled!",
  6: "The_artifact's_main_bonus_is_sixtupled!",
};

function _highestCharacterLevel(saveData) {
  var levels = saveData.lv0AllData || [];
  var highest = 0;
  for (var ci = 0; ci < levels.length; ci++) {
    highest = Math.max(highest, Number(levels[ci] && levels[ci][0]) || 0);
  }
  return highest;
}

// ==================== ARTIFACT BONUS ====================

// Game: _customBlock_Sailing("ArtifactBonus", idx, 0)
// Precomputes SailzArtiBonusL with per-artifact scaling, then applies tier multiplier.
// Art 2,10,18,20: base * (1+MF15/100) * SlabboMulti * floor(max(0, Cards[1].length-500)/10)
// Art 8: base * LOG(sum_PlayerBuildSpd)
// Art 25: base * floor(TotalStats(primaryStat) / 100) — needs ci
// Art 27: base * LOG(Sailing[1][0])
// Art 29: base * LOG(Divinity[39])
// All others: just base

export function computeArtifactBonus(artIdx, ci, ctx) {
  var saveData = ctx.saveData;
  var s = saveData;
  var sailing = s.sailingData;
  if (!sailing || !sailing[3]) return 0;
  var tier = Number(sailing[3][artIdx]) || 0;
  if (tier <= 0) return 0;
  var val = artifactBase(artIdx);

  // Per-artifact scaling multiplier (game logic from -1 precompute)
  if (artIdx === 2 || artIdx === 10 || artIdx === 18 || artIdx === 20) {
    // base * (1+MF15/100) * SlabboBonus_AllMulti * floor(max(0, Cards[1].length-500)/10)
    var cards1Len = (s.cards1Data && s.cards1Data.length) || 0;
    var slabItems = Math.floor(Math.max(0, cards1Len - 500) / 10);
    var mf15 = 0;
    try { mf15 = mainframeBonus(15, saveData); } catch(e) {}
    // SlabboBonus_AllMulti = (1+Meritoc23/100) * (1+LegendPTS(28)/100) * (1+VaultUpg(74)/100)
    var mer23 = 0, leg28 = 0, v74 = 0;
    try { mer23 = computeMeritocBonusz(23, saveData, ci); } catch(e) {}
    try { leg28 = legendPTSbonus(28, saveData); } catch(e) {}
    try { v74 = vaultUpgBonus(74, saveData); } catch(e) {}
    var slabboMulti = (1 + mer23/100) * (1 + leg28/100) * (1 + v74/100);
    val *= (1 + mf15/100) * slabboMulti * slabItems;
  } else if (artIdx === 1) {
    // CalcTalentMAP[620] is the highest character level cache.
    val *= _highestCharacterLevel(saveData);
  } else if (artIdx === 3 || artIdx === 5) {
    // base * Lv0[13] (sailing level)
    var sailLv = Number(s.lv0AllData && s.lv0AllData[ci >= 0 ? ci : 0] && s.lv0AllData[ci >= 0 ? ci : 0][13]) || 0;
    val *= sailLv;
  } else if (artIdx === 8) {
    // base * LOG(sum of all players' PlayerBuildSpd)
    var totalBuildRate = 0;
    if (s.lv0AllData) {
      for (var pi = 0; pi < s.lv0AllData.length; pi++) {
        try {
          totalBuildRate += computePlayerBuildSpd(pi, { noArt32: true }, saveData) || 0;
        } catch(e) {
          // fallback for chars without construction data
          var constLv = Number(s.lv0AllData[pi] && s.lv0AllData[pi][12]) || 0;
          totalBuildRate += Math.pow(10, constLv / 50);
        }
      }
    }
    if (totalBuildRate < 1) totalBuildRate = 1;
    val *= getLOG(totalBuildRate);
  } else if (artIdx === 11) {
    val *= Math.min(_highestCharacterLevel(saveData), 200 + 200 * (tier - 1));
  } else if (artIdx === 13) {
    // base * LOG(Meals[2][0]) (highest meal qty?)
    var meals2 = s.mealsData && s.mealsData[2];
    var highMeal = Number(meals2 && meals2[0]) || 1;
    val *= getLOG(highMeal);
  } else if (artIdx === 23) {
    // base * Lv0[15] (gaming level)
    var gamLv = Number(s.lv0AllData && s.lv0AllData[ci >= 0 ? ci : 0] && s.lv0AllData[ci >= 0 ? ci : 0][15]) || 0;
    val *= gamLv;
  } else if (artIdx === 25) {
    // base * floor(TotalStats(primaryStat) / 100) — needs char-specific stat
    var pStatVal = 0;
    try {
      var pStatName = _getPrimaryStatName(ci);
      var pStatR = computeTotalStat(pStatName, ci, ctx);
      pStatVal = (typeof pStatR === 'object' && pStatR) ? (pStatR.computed || 0) : Number(pStatR) || 0;
    } catch(e) {
      pStatVal = _getPrimaryStat(ci, saveData);
    }
    val *= Math.floor(pStatVal / 100);
  } else if (artIdx === 27) {
    // base * LOG(Sailing[1][0])
    var sail1 = Number(sailing[1] && sailing[1][0]) || 1;
    val *= getLOG(sail1);
  } else if (artIdx === 29) {
    // base * LOG(Divinity[39])
    var div39 = Number(divinityData && divinityData[39]) || 1;
    val *= getLOG(div39);
  }

  // Only artifacts whose tier description explicitly multiplies the main
  // bonus receive the generic 2x-6x scaling.
  if (tier >= 2 && ArtifactInfo[artIdx]
    && ArtifactInfo[artIdx][2 * tier + 1] === ARTIFACT_TIER_MULTIPLIER_TEXT[tier]) {
    val *= tier;
  }

  return val;
}

// Helper: get primary stat NAME for a character class
function _getPrimaryStatName(ci) {
  var cls = Number(charClassData && charClassData[ci]) || 0;
  if (cls <= 0) return 'STR';
  if (cls < 6) return 'LUK'; // Journeyman family
  var root = 6 + 12 * Math.floor((cls - 6) / 12);
  if (root === 18) return 'AGI';
  if (root === 30) return 'WIS';
  return 'STR'; // Warrior or fallback
}

// Helper: estimate primary stat from raw save data (without full TotalStat resolver)
function _getPrimaryStat(ci, saveData) {
  var s = saveData;
  if (ci == null || ci < 0 || !s.lv0AllData || !s.lv0AllData[ci]) return 0;
  var name = _getPrimaryStatName(ci);
  // STR=Lv0[4], AGI=Lv0[5], WIS=Lv0[6], LUK=Lv0[7]
  var statIdx = name === 'STR' ? 4 : (name === 'AGI' ? 5 : (name === 'WIS' ? 6 : 7));
  return Number(s.lv0AllData[ci][statIdx]) || 0;
}
