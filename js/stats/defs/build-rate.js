// ===== BUILD RATE STAT DEFINITION =====
// PlayerBuildSpd per character — construction build speed.
// Scope: per-character.

import {
  computePlayerBuildSpd,
  computeConstMasteryBonus,
  computeSmallCogBonusTOTAL,
  computeExtraBuildSPDmulti,
  computeOwnedItemCount,
} from '../systems/w3/construction.js';
import { bubbleValByKey, computeVialByKey } from '../systems/w2/alchemy.js';
import { computeStampBonusOfTypeX } from '../systems/w1/stamp.js';
import { arcadeBonus, arcade } from '../systems/w2/arcade.js';
import { achieveStatus } from '../systems/common/achievement.js';
import { guild } from '../systems/common/guild.js';
import { etcBonus } from '../systems/common/etcBonus.js';
import { votingBonusz } from '../systems/w2/voting.js';
import { companion } from '../systems/common/companions.js';
import { winBonus, computeSummUpgBonus } from '../systems/w6/summoning.js';
import { computeVaultKillzTotal } from '../systems/common/vaultKillz.js';
import { computePaletteBonus } from '../systems/w7/spelunking.js';
import { bubbaRoGBonuses } from '../systems/w7/bubba.js';
import { talentParams } from '../data/common/talent.js';
import { computeAllTalentLVz } from '../systems/common/talent.js';
import { formulaEval, getLOG } from '../../formulas.js';
import { skillLvData, postOfficeData } from '../../save/data.js';
import { AtomInfo } from '../data/game/customlists.js';
import { label } from '../entity-names.js';
import { safe, rval, createDescriptor } from './helpers.js';

export default createDescriptor({
  id: 'build-rate',
  name: 'Player Build Speed',
  scope: 'character',
  category: 'construction',

  combine: function(pools, ctx) {
    var saveData = ctx.saveData;
    var ci = ctx.charIdx;
    if (!saveData) return { val: 0, children: null };

    var constLv = Number(saveData.lv0AllData && saveData.lv0AllData[ci] && saveData.lv0AllData[ci][8]) || 0;
    if (constLv <= 0) return { val: 0, children: null };

    // Base
    var base = 3 * Math.pow(constLv / 2 + 0.7, 1.6);

    // Bubble mult
    var constBubble = safe(bubbleValByKey, 'Construction', ci, saveData);
    var bubbleMult = 1 + constLv * constBubble / 100;

    // Additive pool breakdown
    var stampBuildProd = safe(computeStampBonusOfTypeX, 'BuildProd', saveData);
    var postOffice17 = Number(postOfficeData[ci] && postOfficeData[ci][17]) || 0;
    var guildBonus5 = rval(guild, 5, ctx);
    var etcBonus30 = rval(etcBonus, '30', ctx);
    var ach153 = Math.min(5, 5 * safe(achieveStatus, 153, saveData));
    var constMastery2 = computeConstMasteryBonus(2, ctx.saveData);
    var vialContspd = safe(computeVialByKey, 'Contspd', saveData);
    var arcade44 = rval(arcade, 44, ctx);
    var voting18 = safe(votingBonusz, 18, 1, saveData);
    var summUpg48 = safe(computeSummUpgBonus, 48, saveData);
    var vaultKills11 = safe(computeVaultKillzTotal, 11, saveData);
    var bubbaRoG1 = safe(bubbaRoGBonuses, 1, saveData);

    var addPool = stampBuildProd + 0.25 * postOffice17
      + guildBonus5 + etcBonus30
      + ach153 + constMastery2
      + vialContspd + arcade44
      + voting18
      + summUpg48 * vaultKills11
      + bubbaRoG1;
    var additiveMulti = 1 + addPool / 100;

    // True multipliers
    var winBonus13 = rval(winBonus, 13, ctx);
    var palette25 = safe(computePaletteBonus, 25, saveData);
    var vial6turtle = safe(computeVialByKey, '6turtle', saveData);
    var trueMulti = (1 + winBonus13 / 100) * (1 + palette25 / 100) * (1 + vial6turtle / 100);

    // Talent 131
    var talentPart = 1;
    var talent131Val = 0;
    var atomBonus1 = 0;
    var logRef1 = 0;
    var sl = skillLvData[ci] || {};
    var rawLv131 = Number(sl[131] || sl['131']) || 0;
    if (rawLv131 > 0) {
      var tp131 = talentParams(131);
      if (tp131 && tp131.formula) {
        var bonus131 = computeAllTalentLVz(131, ci, ctx.saveData);
        var effLv131 = rawLv131 + bonus131;
        talent131Val = formulaEval(tp131.formula, tp131.x1, tp131.x2, effLv131);
        atomBonus1 = (Number(saveData.atomsData && saveData.atomsData[1]) || 0) * (Number(AtomInfo[1] && AtomInfo[1][4]) || 0);
        var refinery1Count = computeOwnedItemCount('Refinery1', ctx.saveData);
        logRef1 = getLOG(refinery1Count);
        talentPart = 1 + talent131Val * (atomBonus1 + logRef1) / 100;
      }
    }

    var total = computePlayerBuildSpd(ci, ctx.saveData);

    // Extra build speed multi (cog + companion)
    var extraBuildMulti = computeExtraBuildSPDmulti(ctx.saveData);

    var addChildren = [
      { name: 'Stamp: Build Speed', val: stampBuildProd },
      { name: label('Post Office', 17), val: 0.25 * postOffice17, note: '0.25 × ' + postOffice17 },
      { name: label('Guild', 5), val: guildBonus5 },
      { name: label('EtcBonus', 30), val: etcBonus30 },
      { name: label('Achievement', 153), val: ach153 },
      { name: 'Construction Mastery 2', val: constMastery2 },
      { name: 'Vial: Build Speed', val: vialContspd },
      { name: label('Arcade', 44), val: arcade44 },
      { name: label('Voting', 18), val: voting18 },
      { name: 'Vault Summ 48×11', val: summUpg48 * vaultKills11, note: summUpg48.toFixed(1) + ' × ' + vaultKills11 },
      { name: 'Bubba RoG: Build Speed', val: bubbaRoG1 },
    ];

    var trueChildren = [
      { name: label('WinBonus', 13), val: 1 + winBonus13 / 100, fmt: 'x' },
      { name: label('Palette', 25), val: 1 + palette25 / 100, fmt: 'x' },
      { name: 'Vial: Build Speed Multi', val: 1 + vial6turtle / 100, fmt: 'x' },
    ];

    return {
      val: total,
      children: [
        { name: 'Base (constLv ' + constLv + ')', val: base },
        { name: 'Bubble Multi', val: bubbleMult, fmt: 'x', note: 'Bubble=' + constBubble.toFixed(2) },
        { name: 'Additive Pool', val: additiveMulti, fmt: 'x', children: addChildren, note: 'sum=' + addPool.toFixed(1) },
        { name: 'True Multipliers', val: trueMulti, fmt: 'x', children: trueChildren },
        { name: label('Talent', 131), val: talentPart, fmt: 'x', note: rawLv131 > 0 ? 'val=' + talent131Val.toFixed(1) + ' atom=' + atomBonus1 + ' logRef=' + logRef1.toFixed(2) : 'no talent' },
        { name: 'Extra Build Multi', val: extraBuildMulti, fmt: 'x', note: 'SmallCog(1)=' + computeSmallCogBonusTOTAL(1, ctx.saveData) + ' comp157=' + rval(companion, 157, ctx) },
      ],
      _debug: {
        constLv: constLv,
        base: base,
        bubbleMult: bubbleMult,
        addPool: addPool,
        trueMulti: trueMulti,
        talentPart: talentPart,
        extraBuildMulti: extraBuildMulti,
        rawBuildSpd: total,
        effectiveBuildSpd: total * extraBuildMulti,
      },
    };
  },
});
