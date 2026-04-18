// ===== CONSTRUCTION EXP STAT DEFINITION =====
// PlayerConExp per character — construction XP gain rate.
// Active chars get full additive pool; inactive chars get simplified formula.
// Scope: per-character.

import {
  computePlayerBuildSpd,
  computePlayerConExp,
  computeSmallCogBonusTOTAL,
  computeCogBoardTotals,
} from '../systems/w3/construction.js';
import { bubbleValByKey, computeVialByKey } from '../systems/w2/alchemy.js';
import { computeStampBonusOfTypeX } from '../systems/w1/stamp.js';
import { votingBonusz } from '../systems/w2/voting.js';
import { computeStatueBonusGiven } from '../systems/common/stats.js';
import { computeStarSignBonus } from '../systems/common/starSign.js';
import { talentParams } from '../data/common/talent.js';
import { computeAllTalentLVz } from '../systems/common/talent.js';
import { formulaEval } from '../../formulas.js';
import { label } from '../entity-names.js';
import { skillLvData, postOfficeData } from '../../save/data.js';
import { safe, createDescriptor } from './helpers.js';

function _talVal(talentIdx, ci) {
  var sl = skillLvData[ci] || {};
  var rawLv = Number(sl[talentIdx] || sl[String(talentIdx)]) || 0;
  if (rawLv <= 0) return 0;
  var tp = talentParams(talentIdx);
  if (!tp || !tp.formula) return 0;
  var bonus = computeAllTalentLVz(talentIdx, ci, ctx.saveData);
  return formulaEval(tp.formula, tp.x1, tp.x2, rawLv + bonus);
}

export default createDescriptor({
  id: 'construction-exp',
  name: 'Player Construction XP',
  scope: 'character',
  category: 'construction',

  combine: function(pools, ctx) {
    var saveData = ctx.saveData;
    var ci = ctx.charIdx;
    var isActive = ctx.isActive !== undefined ? ctx.isActive : true;
    if (!saveData) return { val: 0, children: null };

    var constLv = Number(saveData.lv0AllData && saveData.lv0AllData[ci] && saveData.lv0AllData[ci][8]) || 0;
    var buildSpd = computePlayerBuildSpd(ci, ctx.saveData);
    var basePart = Math.pow(buildSpd, 0.7) / 2 + (2 + 6 * constLv);
    var smallCogExp = computeSmallCogBonusTOTAL(2, ctx.saveData);

    var total = computePlayerConExp(ci, isActive, ctx.saveData);

    // Cog board bonuses
    var cogTotals = computeCogBoardTotals(ctx.saveData);

    // Breakdown for active char
    var conEXPbubble = safe(bubbleValByKey, 'conEXPACTIVE', ci);
    var tal132 = _talVal(132, ci);
    var tal104 = _talVal(104, ci);
    var vialConsExp = safe(computeVialByKey, 'ConsExp');
    var statue18 = safe(computeStatueBonusGiven, 18);
    var stampConstExp = safe(computeStampBonusOfTypeX, 'ConstructionExp');
    var voting18 = safe(votingBonusz, 18, 1);
    var starConstExp = safe(computeStarSignBonus, 'ConstExp', ci);
    var postOffice17 = Number(postOfficeData[ci] && postOfficeData[ci][17]) || 0;
    var poBonus = Math.max(0, 0.5 * (postOffice17 - 100));

    var addPool = conEXPbubble + tal132 + tal104 + vialConsExp + statue18
      + stampConstExp + voting18 + starConstExp + poBonus;

    var children = [
      { name: 'Build Speed', val: buildSpd, note: 'pow(buildSpd, 0.7)/2 = ' + (Math.pow(buildSpd, 0.7) / 2).toFixed(2) },
      { name: 'Base Part', val: basePart, note: 'pow(bspd,0.7)/2 + 2 + 6×' + constLv },
      { name: 'Mode', val: isActive ? 1 : 0, note: isActive ? 'Active' : 'Inactive' },
    ];

    if (isActive) {
      children.push(
        { name: 'Additive Multi', val: 1 + addPool / 100, fmt: 'x', children: [
          { name: 'Bubble: Construction EXP', val: conEXPbubble },
          { name: label('Talent', 132), val: tal132 },
          { name: label('Talent', 104), val: tal104 },
          { name: 'Vial: Construction EXP', val: vialConsExp },
          { name: label('Statue', 18), val: statue18 },
          { name: 'Stamp: Construction EXP', val: stampConstExp },
          { name: label('Voting', 18), val: voting18 },
          { name: 'Star Sign: Construction EXP', val: starConstExp },
          { name: label('Post Office', 17), val: poBonus, note: '0.5×(' + postOffice17 + '-100)' },
        ], note: 'sum=' + addPool.toFixed(1) },
        { name: 'Small Cog EXP', val: 1 + smallCogExp / 100, fmt: 'x', note: 'total=' + smallCogExp }
      );
    }

    children.push(
      { name: 'Cog Board Flat Exp/HR', val: cogTotals.flatExp },
      { name: 'Cog Board % Const EXP', val: cogTotals.pctConstExp },
      { name: 'Cog Board % Player XP', val: cogTotals.pctPlayerConstXP }
    );

    return {
      val: total,
      children: children,
      _debug: {
        constLv: constLv,
        buildSpd: buildSpd,
        basePart: basePart,
        addPool: addPool,
        smallCogExp: smallCogExp,
        isActive: isActive,
        cogBoardFlat: cogTotals.flatExp,
        cogBoardPctExp: cogTotals.pctConstExp,
        cogBoardPctXP: cogTotals.pctPlayerConstXP,
      },
    };
  },
});
