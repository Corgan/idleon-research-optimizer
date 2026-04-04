// ===== LAB SYSTEM (W4) =====
// Research grid bonuses, chip bonuses, lab connectivity BFS, and mainframe bonuses.

import { node } from '../../node.js';
import { label } from '../../entity-names.js';
import { saveData } from '../../../state.js';
import {
  charClassData,
  dreamData,
  labData,
  numCharacters,
  optionsListData,
  skillLvData,
} from '../../../save/data.js';
import {
  arenaThreshold,
  SHAPE_BONUS_PCT,
} from '../../../game-data.js';
import { JEWEL_DESC, LAB_BONUS_BASE, LAB_BONUS_DYNAMIC } from '../../data/w4/lab.js';
import { labJewelUnlocked } from '../../../save/helpers.js';
import { emporiumBonus, ribbonBonusAt } from '../../../game-helpers.js';
import { computeCardLv } from '../common/cards.js';
import { computeShinyBonusS } from './breeding.js';
import { computeWinBonus } from '../w6/summoning.js';
import { hasBonusMajor } from '../w5/divinity.js';
import { computeAllTalentLVz } from '../common/talent.js';
import { companionBonus } from '../../data/common/companions.js';
import { chipBonusValue } from '../../data/w4/chips.js';
import { gridBonusPerLv } from '../../data/w7/research.js';
import { talentParams } from '../../data/common/talent.js';
import { formulaEval } from '../../../formulas.js';

function gridAllMulti(saveData) {
  var comp55 = saveData.companionIds && saveData.companionIds.has(55) ? companionBonus(55) : 0;
  var comp0 = saveData.companionIds && saveData.companionIds.has(0) ? companionBonus(0) : 0;
  var grid173Lv = saveData.gridLevels[173] || 0;
  var sum = comp55 + 5 * Math.min(1, grid173Lv * comp0);
  return { val: 1 + sum / 100, comp55: comp55, comp0: comp0, grid173Lv: grid173Lv };
}

export var grid = {
  resolve: function(id, ctx) {
    var saveData = ctx.saveData;
    var gridLv = saveData.gridLevels[id] || 0;
    if (gridLv < 1) return node(label('Grid', id), 0, null, { note: 'grid ' + id });

    var si = saveData.shapeOverlay[id];
    var shapePct = (si >= 0 && si < SHAPE_BONUS_PCT.length) ? SHAPE_BONUS_PCT[si] : 0;
    var shapeMult = 1 + shapePct / 100;
    var am = gridAllMulti(saveData);
    var allMulti = am.val;

    // Grid bonus per level from game data
    var bonusPerLv = gridBonusPerLv(id) || 25;

    var rawVal = bonusPerLv * gridLv;
    var val = rawVal * shapeMult * Math.max(1, allMulti);

    var allMultiChildren = [];
    if (am.comp55 > 0) allMultiChildren.push(node(label('Companion', 55), am.comp55, null, { fmt: 'raw', note: 'companion 55' }));
    if (am.comp0 > 0) allMultiChildren.push(node(label('Companion', 0), 5 * Math.min(1, am.grid173Lv * am.comp0), [
      node(label('Grid', 173, ' Lv'), am.grid173Lv, null, { fmt: 'raw' }),
    ], { fmt: 'raw', note: 'companion 0' }));

    // Grid 168 has special Glimbo trade logic
    if (id === 168) {
      var trades = saveData.research[12] || [];
      var totalTrades = 0;
      for (var i = 0; i < trades.length; i++) totalTrades += (Number(trades[i]) || 0);
      var tradeGroups = Math.floor(totalTrades / 100);
      var glimboVal = 1 + (val * tradeGroups) / 100;
      return node('Glimbo DR Multi', glimboVal, [
        node(label('Grid', 168, ' Level'), gridLv, null, { fmt: 'raw' }),
        node('Shape Bonus', shapeMult, null, { fmt: 'x', note: 'shape=' + si }),
        node('All Multi', allMulti, allMultiChildren.length ? allMultiChildren : null, { fmt: 'x' }),
        node('Total Trades', totalTrades, null, { fmt: 'raw', note: tradeGroups + ' groups' }),
      ], { fmt: 'x', note: 'grid 168' });
    }

    return node(label('Grid', id), val, [
      node('Grid Level', gridLv, null, { fmt: 'raw' }),
      node('Base per Level', rawVal, null, { fmt: 'raw', note: bonusPerLv + '/level' }),
      node('Shape Bonus', shapeMult, null, { fmt: 'x', note: 'shape=' + si }),
      node('All Multi', Math.max(1, allMulti), allMultiChildren.length ? allMultiChildren : null, { fmt: 'x' }),
    ], { fmt: '+', note: 'grid ' + id });
  },
};

export var chip = {
  resolve: function(id, ctx) {
    // id = chip bonus type (e.g., 'dr')
    var chipSlots = labData[1 + ctx.charIdx];
    if (!chipSlots) return node('Lab Chip DR', 0, null, { note: 'chip ' + id });
    var total = 0;
    var children = [];
    for (var i = 0; i < 7; i++) {
      // Chip 3 = Grounded_Processor, gives DR
      if (id === 'dr' && Number(chipSlots[i]) === 3) {
        var _chipVal = chipBonusValue(3);
        total += _chipVal;
        children.push(node('Slot ' + i + ' Grounded Processor', _chipVal, null, { fmt: '+', note: 'chip 3' }));
      }
    }
    return node('Lab Chip DR', total, children, { fmt: '+', note: 'chip ' + id });
  },
};

// ===== LAB CONNECTIVITY BFS & MAINFRAME BONUS =====

function euclidDist(x1, y1, x2, y2) {
  var dx = Math.abs(x2 - x1), dy = Math.abs(y2 - y1);
  return 0.9604339 * Math.max(dx, dy) + 0.397824735 * Math.min(dx, dy);
}

function computePetArenaBonus(idx) {
  var waves = optionsListData[89] || 0;
  var tier = 0;
  for (var s = 0; s < 16; s++) {
    if (waves >= arenaThreshold(s)) tier = s + 1;
    else break;
  }
  return tier > idx ? 1 : 0;
}

function computeBonusLineWidth(playerIdx) {
  var gemSlots = 2 * (saveData.gemItemsData[123] || 0);
  if (playerIdx >= gemSlots) return 0;
  return hasBonusMajor(playerIdx, 2) ? 30 : 0;
}

function computeChip6Count(playerIdx) {
  var chipSlots = labData && labData[1 + playerIdx];
  if (!chipSlots) return 0;
  var count = 0;
  for (var s = 0; s < 7; s++) {
    if (chipSlots[s] === 6) count++;
  }
  return count;
}

function computeCookingMealMulti() {
  var mfb116 = mainframeBonus(116);
  var shinyS20 = computeShinyBonusS(20);
  var winBon26 = computeWinBonus(26);
  return (1 + (mfb116 + shinyS20) / 100) * (1 + winBon26 / 100);
}

function computeMealBonusPxLine() {
  return ((saveData.mealsData && saveData.mealsData[0] && saveData.mealsData[0][11]) || 0) * 2 +
         ((saveData.mealsData && saveData.mealsData[0] && saveData.mealsData[0][25]) || 0) * 2;
}

function computeMealBonusLinePct() {
  var eelLv = (saveData.mealsData && saveData.mealsData[0] && saveData.mealsData[0][40]) || 0;
  if (eelLv <= 0) return 0;
  var cookMulti = computeCookingMealMulti();
  var ribbon = ribbonBonusAt(28 + 40, saveData.ribbonData, saveData.olaData[379]);
  return cookMulti * ribbon * eelLv * 1;
}

function computeBubonicPurple(playerIdx) {
  var bcIdx = -1;
  var bestLv = 0;
  for (var ci = 0; ci < numCharacters; ci++) {
    var cls = charClassData[ci];
    if (cls !== 36 && cls !== 39) continue;
    var sl = skillLvData[ci];
    var lv = Number((sl && (sl[535] || sl['535'])) || 0);
    if (lv > bestLv) { bestLv = lv; bcIdx = ci; }
  }
  if (bcIdx < 0 || bestLv <= 0) return 0;
  var playerX = (labData && labData[0] && labData[0][2 * playerIdx]) || 0;
  var bcX = (labData && labData[0] && labData[0][2 * bcIdx]) || 0;
  if (playerX < bcX) return 0;
  var allTalent = bestLv > 0 ? computeAllTalentLVz(535, bcIdx) : 0;
  var effectiveLv = bestLv + allTalent;
  var _t535 = talentParams(535);
  return formulaEval(_t535.formula, _t535.x1, _t535.x2, effectiveLv);
}

function computePlayerDist(playerIdx) {
  var labLev = (saveData.lv0AllData[playerIdx] && saveData.lv0AllData[playerIdx][12]) || 0;
  var baseDist = 50 + 2 * labLev;
  var px = (labData && labData[0] && labData[0][2 * playerIdx]) || 0;
  var py = (labData && labData[0] && labData[0][2 * playerIdx + 1]) || 0;
  if (labJewelUnlocked(5) && euclidDist(px, py, JEWEL_DESC[5][0], JEWEL_DESC[5][1]) < 150) {
    baseDist *= 1.25;
  }
  var mealPx = computeMealBonusPxLine();
  var crystal3Lv = computeCardLv('Crystal3');
  var flat = baseDist + mealPx + Math.min(2 * crystal3Lv, 50);
  var bubonicPurple = computeBubonicPurple(playerIdx);
  var linePct = computeMealBonusLinePct();
  var chip6Pct = computeChip6Count(playerIdx) * 12;
  var arenaPct = 20 * computePetArenaBonus(13);
  var bonusLW = computeBonusLineWidth(playerIdx);
  var shinyS19 = computeShinyBonusS(19);
  var pctTotal = bubonicPurple + linePct + chip6Pct + arenaPct + bonusLW + shinyS19;
  return Math.floor(flat * (1 + pctTotal / 100));
}

function buildLabMainBonus() {
  var lmb = LAB_BONUS_BASE.map(function(e) { return e.slice(); });
  for (var i = 0; i < LAB_BONUS_DYNAMIC.length; i++) {
    var dyn = LAB_BONUS_DYNAMIC[i];
    if (emporiumBonus(dyn[6], saveData.ninjaData && saveData.ninjaData[102] && saveData.ninjaData[102][9])) {
      lmb.push([dyn[0], dyn[1], dyn[2], dyn[3], dyn[4], dyn[5]]);
    }
  }
  return lmb;
}

export function computeLabConnectivity() {
  var lmb = buildLabMainBonus();
  var lmbLen = lmb.length;
  var jdLen = JEWEL_DESC.length;
  var totalNodes = 12 + lmbLen + jdLen;
  var bonusConn = new Array(lmbLen).fill(0);
  var jewelConn = new Array(jdLen).fill(0);

  // Local mainframeBonus that reads from in-progress connectivity arrays
  function _mfb(e) {
    if (e < 100) {
      if (e >= lmbLen) return 0;
      if (!bonusConn[e]) return lmb[e][3];
      var active = lmb[e][4];
      if (e === 13) return active;
      if (e === 8) return active + _mfb(119) / 100;
      return active;
    }
    var ji = e - 100;
    if (ji < 0 || ji >= jdLen) return 0;
    if (!jewelConn[ji]) return 0;
    var base = JEWEL_DESC[ji][2];
    if (e === 119) return base;
    return base * _mfb(8);
  }

  var playerPos = [];
  var lab0 = (labData && labData[0]) || [];
  for (var i = 0; i < 12; i++) {
    playerPos.push({ x: lab0[2 * i] || 0, y: lab0[2 * i + 1] || 0 });
  }
  var inLab = new Array(12).fill(false);
  for (var i = 0; i < Math.min(12, numCharacters); i++) {
    if (playerPos[i].x > 0 || playerPos[i].y > 0) inLab[i] = true;
  }
  var playerDist = new Array(12).fill(0);
  var taskShopLabRange = Number((saveData.tasksGlobalData && saveData.tasksGlobalData[2] && saveData.tasksGlobalData[2][3] && saveData.tasksGlobalData[2][3][4]) || 0);
  var dreamLabRange = Number((dreamData && dreamData[8]) || 0);
  var winBonus4 = computeWinBonus(4);
  var bonusGemFlat = taskShopLabRange + dreamLabRange + winBonus4;
  var bonusGemDist = 80 + bonusGemFlat;
  for (var pass = 0; pass < 10; pass++) {
    for (var i = 0; i < 12; i++) {
      if (inLab[i]) playerDist[i] = computePlayerDist(i);
    }
    bonusConn = new Array(lmbLen).fill(0);
    jewelConn = new Array(jdLen).fill(0);
    var connected = [];
    var visited = new Set();
    for (var n = 0; n < 12; n++) {
      if (!inLab[n]) continue;
      var d = euclidDist(43, 229, playerPos[n].x, playerPos[n].y);
      if (d < playerDist[n]) {
        connected.push(n);
        visited.add(n);
        break;
      }
    }
    for (var ci = 0; ci < connected.length; ci++) {
      var src = connected[ci];
      var sx = playerPos[src].x;
      var sy = playerPos[src].y;
      for (var dn = 0; dn < totalNodes; dn++) {
        if (visited.has(dn)) continue;
        if (dn < 12) {
          if (!inLab[dn]) continue;
          var d = euclidDist(sx, sy, playerPos[dn].x, playerPos[dn].y);
          if (d < playerDist[dn]) {
            connected.push(dn);
            visited.add(dn);
          }
        } else if (dn < 12 + lmbLen) {
          var bi = dn - 12;
          if (bonusConn[bi]) continue;
          var bx = lmb[bi][0];
          var by = lmb[bi][1];
          var threshold = (bi === 13 || bi === 8) ? 80 : bonusGemDist;
          var d = euclidDist(sx, sy, bx, by);
          if (d < threshold) {
            bonusConn[bi] = 1;
            visited.add(dn);
          }
        } else {
          var ji = dn - 12 - lmbLen;
          if (jewelConn[ji]) continue;
          if (!labJewelUnlocked(ji)) continue;
          var jx = JEWEL_DESC[ji][0];
          var jy = JEWEL_DESC[ji][1];
          var threshold;
          if (ji === 9 || ji === 19) threshold = 80;
          else if (ji === 21 || ji === 22 || ji === 23) threshold = 100;
          else threshold = bonusGemDist;
          var d = euclidDist(sx, sy, jx, jy);
          if (d < threshold) {
            jewelConn[ji] = 1;
            visited.add(dn);
          }
        }
      }
    }
    var newDist = Math.floor(80 * (1 + (_mfb(109) + _mfb(13)) / 100)) + bonusGemFlat;
    if (newDist === bonusGemDist && pass > 0) break;
    bonusGemDist = newDist;
  }
  return { labMainBonusFull: lmb, labBonusConnected: bonusConn, labJewelConnected: jewelConn };
}

export function mainframeBonus(e) {
  var lmbLen = saveData.labMainBonusFull.length;
  if (e < 100) {
    if (e >= lmbLen) return 0;
    if (!saveData.labBonusConnected[e]) return saveData.labMainBonusFull[e][3];
    var active = saveData.labMainBonusFull[e][4];
    if (e === 9) return active + mainframeBonus(113);
    if (e === 0) {
      var totPets = (saveData.breedingData && saveData.breedingData[1] || []).reduce(function(s, v) { return s + (Number(v) || 0); }, 0);
      return (active + mainframeBonus(101)) * totPets;
    }
    if (e === 3) return active + mainframeBonus(107);
    if (e === 11) return active + mainframeBonus(117);
    if (e === 13) return active;
    if (e === 15) return active + mainframeBonus(118);
    if (e === 17) return active + mainframeBonus(120);
    if (e === 8) return active + mainframeBonus(119) / 100;
    return active;
  }
  var ji = e - 100;
  if (ji < 0 || ji >= JEWEL_DESC.length) return 0;
  if (!saveData.labJewelConnected[ji]) return 0;
  var base = JEWEL_DESC[ji][2];
  if (e === 119) return base;
  return base * mainframeBonus(8);
}
