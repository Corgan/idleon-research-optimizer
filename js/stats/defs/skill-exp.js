// ===== SKILL EXP MULTIPLIER DESCRIPTOR =====
// Covers all skill EXP multipliers dispatched from ExpMulti(e).
// Each skill calls SkillStats("XyzEXPmulti") which uses AllSkillxpz + AllSkillxpMULTI
// plus per-skill stamps, talents, cards, etc.
// Scope: character + skill type.

import { companions, vaultUpgBonus, goldFoodBonuses, cardLv, votingBonusz, getBribeBonus } from '../systems/common/goldenFood.js';
import { label } from '../entity-names.js';
import { etcBonus } from '../systems/common/etcBonus.js';
import { talent, computeAllTalentLVz } from '../systems/common/talent.js';
import { arcadeBonus } from '../systems/w2/arcade.js';
import { computeCardBonusByType, computeBoxReward } from '../systems/common/stats.js';
import { mainframeBonus } from '../systems/w4/lab.js';
import { optionsListData, prayersPerCharData } from '../../save/data.js';
import { prayerBaseBonus } from '../data/w3/prayer.js';
import { saveData } from '../../state.js';
import { formulaEval } from '../../formulas.js';
import { skillLvData } from '../../save/data.js';
import {
  rval, safe, computePrayerReal,
  computeAllSkillxpz, computeAllSkillxpMULTI
} from './skill-helpers.js';
import { computeCalcTalent } from '../systems/common/calcTalent.js';
import { computeStampBonusOfTypeX } from '../systems/w1/stamp.js';
import { computeRiftSkillETC } from '../systems/w4/rift.js';
import { computeTrapMGBonus } from '../systems/w3/trapping.js';
import { computeMealBonus, computeStatueBonusGiven } from '../systems/common/stats.js';
import { computeVialByKey, bubbleValByKey } from '../systems/w2/alchemy.js';
import { achieveStatus } from '../systems/common/achievement.js';
import { computeRooBonus } from '../systems/w7/sushi.js';
import { computeStarSignBonus } from '../systems/common/starSign.js';

// Per-skill EXP config. Each skill's EXP multiplier formula is:
// AllSkillxpMULTI * (1 + (perSkillSources) / 100 + (AllSkillxpz + CalcTalent) / 100)
// (with some variations per skill — see game source SkillStats("XyzEXPmulti"))
var SKILL_EXP_CONFIG = {
  Mining: {
    skillLvIdx: 1,
    calcTalentRow: [42, 0],
    sources: function(ci, ctx) {
      // Game: T104 + StampMinExp + CardBonus(25) + SkillageDN(MinFishEXP) + T75 + Arcade(3)
      //   + Achieve(27) + etc55 + 25*RiftSkill(0) + Voting(7)
      var s = ctx.saveData;
      var talent104 = rval(talent, 104, ctx);
      var stampMinExp = safe(computeStampBonusOfTypeX, 'MinExp');
      var _cb25 = safe(computeCardBonusByType, 25, ci);
      var card25 = (typeof _cb25 === 'object' && _cb25) ? (_cb25.val || 0) : Number(_cb25) || 0;
      // SkillageDN: MinFishEXP bubble, doubled if mining level < fishing level
      var miningLv = Number(s.lv0AllData && s.lv0AllData[ci] && s.lv0AllData[ci][1]) || 0;
      var fishingLv = Number(s.lv0AllData && s.lv0AllData[ci] && s.lv0AllData[ci][4]) || 0;
      var minFishEXP = safe(bubbleValByKey, 'MinFishEXP', ci);
      var skillageDN = miningLv < fishingLv ? 2 * minFishEXP : minFishEXP;
      var talent75 = rval(talent, 75, ctx);
      var arcade3 = safe(arcadeBonus, 3);
      var ach27 = safe(achieveStatus, 27);
      var etc55 = rval(etcBonus, '55', ctx);
      var riftBonus0 = 25 * (safe(computeRiftSkillETC, 0) > 0 ? 1 : 0);
      var voting7 = safe(votingBonusz, 7, 1);
      return talent104 + stampMinExp + card25 + skillageDN + talent75 + arcade3
        + ach27 + etc55 + riftBonus0 + voting7;
    },
  },
  Choppin: {
    skillLvIdx: 3,
    calcTalentRow: [42, 2],
    sources: function(ci, ctx) {
      // Game: T464 + StampChopExp + AlchBubbles.ChopAlchEXP + CardBonus(28) + T75
      //   + Achieve(4) + 25*RiftSkill(2) + Voting(9)
      var talent464 = rval(talent, 464, ctx);
      var stampChopExp = safe(computeStampBonusOfTypeX, 'ChopExp');
      var chopAlchEXP = safe(bubbleValByKey, 'ChopAlchEXP', ci);
      var _cb28 = safe(computeCardBonusByType, 28, ci);
      var card28 = (typeof _cb28 === 'object' && _cb28) ? (_cb28.val || 0) : Number(_cb28) || 0;
      var talent75 = rval(talent, 75, ctx);
      var ach4 = safe(achieveStatus, 4);
      var riftBonus2 = 25 * (safe(computeRiftSkillETC, 2) > 0 ? 1 : 0);
      var voting9 = safe(votingBonusz, 9, 1);
      return talent464 + stampChopExp + chopAlchEXP + card28 + talent75
        + ach4 + riftBonus2 + voting9;
    },
  },
  Fishing: {
    skillLvIdx: 4,
    calcTalentRow: [42, 3],
    sources: function(ci, ctx) {
      // Game: FishingToolkit("EXP") + T117 + T104 + SkillageDN(MinFishEXP, 2× if fish<mine)
      //   + CardBonus(31) + StampFishExp + T75 + Arcade(4) + Achieve(117) + etc49
      //   + 25*RiftSkill(3) + 25*Bribe(29) + Roo(2) + Voting(8) + Vault(30)
      var s = ctx.saveData;
      // FishingToolkit("EXP") — runtime-only (PersonalValuesMap.FishingToolkit), not in save data
      var fishToolkitEXP = 0;
      var talent117 = rval(talent, 117, ctx);
      var talent104 = rval(talent, 104, ctx);
      // SkillageDN: MinFishEXP bubble, doubled if fishing level < mining level
      var miningLv = Number(s.lv0AllData && s.lv0AllData[ci] && s.lv0AllData[ci][1]) || 0;
      var fishingLv = Number(s.lv0AllData && s.lv0AllData[ci] && s.lv0AllData[ci][4]) || 0;
      var minFishEXP = safe(bubbleValByKey, 'MinFishEXP', ci);
      var skillageDN = fishingLv < miningLv ? 2 * minFishEXP : minFishEXP;
      var _cb31 = safe(computeCardBonusByType, 31, ci);
      var card31 = (typeof _cb31 === 'object' && _cb31) ? (_cb31.val || 0) : Number(_cb31) || 0;
      var stampFishExp = safe(computeStampBonusOfTypeX, 'FishExp');
      var talent75 = rval(talent, 75, ctx);
      var arcade4 = safe(arcadeBonus, 4);
      var ach117 = safe(achieveStatus, 117);
      var etc49 = rval(etcBonus, '49', ctx);
      var riftBonus3 = 25 * (safe(computeRiftSkillETC, 3) > 0 ? 1 : 0);
      var bribe29 = 25 * safe(getBribeBonus, '29');
      var roo2 = safe(computeRooBonus, 2);
      var voting8 = safe(votingBonusz, 8, 1);
      var vault30 = safe(vaultUpgBonus, 30);
      return fishToolkitEXP + talent117 + talent104 + skillageDN + card31 + stampFishExp
        + talent75 + arcade4 + ach117 + etc49 + riftBonus3 + bribe29 + roo2 + voting8 + vault30;
    },
  },
  Catching: {
    skillLvIdx: 6,
    calcTalentRow: [42, 5],
    sources: function(ci, ctx) {
      // Game: T265 + T297 + CardBonus(40) + StampCatchExp + T75 + Arcade(9)
      //   + Achieve(107) + 25*RiftSkill(5) + Voting(10) + Vault(29)
      var talent265 = rval(talent, 265, ctx);
      var talent297 = rval(talent, 297, ctx);
      var _cb40 = safe(computeCardBonusByType, 40, ci);
      var card40 = (typeof _cb40 === 'object' && _cb40) ? (_cb40.val || 0) : Number(_cb40) || 0;
      var stampCatchExp = safe(computeStampBonusOfTypeX, 'CatchExp');
      var talent75 = rval(talent, 75, ctx);
      var arcade9 = safe(arcadeBonus, 9);
      var ach107 = safe(achieveStatus, 107);
      var riftBonus5 = 25 * (safe(computeRiftSkillETC, 5) > 0 ? 1 : 0);
      var voting10 = safe(votingBonusz, 10, 1);
      var vault29 = safe(vaultUpgBonus, 29);
      return talent265 + talent297 + card40 + stampCatchExp + talent75
        + arcade9 + ach107 + riftBonus5 + voting10 + vault29;
    },
  },
  Smithing: {
    skillLvIdx: 2,
    calcTalentRow: [42, 1],
    // Smithing has a UNIQUE formula — NOT AllSkillxpMULTI * (1 + sources/100 + ...)
    // Game: (1+(T265+StampSmithExp+T75+25*RiftSkill(1))/100) × (1+(4*CardLv(ForgeA)+7*CardLv(ForgeB))/100)
    //     × (1+BoxSmithExp/100) + (AllSkillxpz+CalcTalent[42][1])/100
    customCombine: function(ci, ctx) {
      var s = ctx.saveData;
      var talent265 = rval(talent, 265, ctx);
      var stampSmithExp = safe(computeStampBonusOfTypeX, 'SmithExp');
      var talent75 = rval(talent, 75, ctx);
      var riftBonus1 = 25 * (safe(computeRiftSkillETC, 1) > 0 ? 1 : 0);
      var part1 = 1 + (talent265 + stampSmithExp + talent75 + riftBonus1) / 100;
      var forgeA = safe(cardLv, 'ForgeA');
      var forgeB = safe(cardLv, 'ForgeB');
      var part2 = 1 + (4 * forgeA + 7 * forgeB) / 100;
      var _brSE = safe(computeBoxReward, ci, 'SmithExp');
      var boxSmithExp = (typeof _brSE === 'object' && _brSE) ? (_brSE.val || 0) : Number(_brSE) || 0;
      var part3 = 1 + boxSmithExp / 100;
      var allSkillxpz = computeAllSkillxpz(ci, ctx);
      var calcTalent = safe(computeCalcTalent, 42, 1, ci);
      return Math.max(0.1, part1 * part2 * part3 + (allSkillxpz + calcTalent) / 100);
    },
    sources: null, // uses customCombine instead
  },
  Trapping: {
    skillLvIdx: 7,
    calcTalentRow: [42, 6],
    sources: function(ci, ctx) {
      var talent312 = rval(talent, 312, ctx);
      var talent265 = rval(talent, 265, ctx);
      var talent75 = rval(talent, 75, ctx);
      var stampTrapExp = safe(computeStampBonusOfTypeX, 'TrappingExp');
      var _cb58 = safe(computeCardBonusByType, 58, ci);
      var card58 = (typeof _cb58 === 'object' && _cb58) ? (_cb58.val || 0) : Number(_cb58) || 0;
      var _br16b = safe(computeBoxReward, ci, '16b');
      var boxTrap = (typeof _br16b === 'object' && _br16b) ? (_br16b.val || 0) : Number(_br16b) || 0;
      var trapMG0 = safe(computeTrapMGBonus, 0);
      var trapMG3 = safe(computeTrapMGBonus, 3);
      var arcade14 = safe(arcadeBonus, 14);
      var riftBonus6 = 25 * (safe(computeRiftSkillETC, 6) > 0 ? 1 : 0);
      var voting30 = safe(votingBonusz, 30, 1);
      return talent312 + talent265 + talent75 + stampTrapExp + card58
        + boxTrap + trapMG0 + trapMG3 + arcade14 + riftBonus6 + voting30;
    },
  },
  Worship: {
    skillLvIdx: 9,
    calcTalentRow: [42, 8],
    sources: function(ci, ctx) {
      // Game: Lv0[9]/3 + T477 + T464 + T75 + StarSigns.WorshExp + 25*RiftSkill(8) + Voting(30)
      var s = ctx.saveData;
      var worshipLv = Number(s.lv0AllData && s.lv0AllData[ci] && s.lv0AllData[ci][9]) || 0;
      var talent477 = rval(talent, 477, ctx);
      var talent464 = rval(talent, 464, ctx);
      var talent75 = rval(talent, 75, ctx);
      var starSignWorshExp = safe(computeStarSignBonus, 'WorshExp', ci);
      var riftBonus8 = 25 * (safe(computeRiftSkillETC, 8) > 0 ? 1 : 0);
      var voting30 = safe(votingBonusz, 30, 1);
      return worshipLv / 3 + talent477 + talent464 + talent75
        + starSignWorshExp + riftBonus8 + voting30;
    },
  },
  Cooking: {
    skillLvIdx: 10,
    calcTalentRow: [42, 9],
    // Game: max(0.1, AllSkillxpMULTI × (1+Vault(60)/100) × (
    //   min(pow(CookEff/(10×CookDef), 0.25+ProwessALL), 1)
    //   + (AllSkillxpz + CalcTalent[42][9] + MealCookExp + Box19b + Card85
    //      + TalentCalc(146) + T104 + Statue20 + 25*RiftSkill(9) + Voting(13)) / 100 ))
    // CookDef = 100 (MONSTERS.Cooking.Defence)
    // TalentCalc(146) = GetTalentNumber(1,146)*min(mobsWith1MKills, GetTalentNumber(2,146))
    customCombine: function(ci, ctx) {
      var s = ctx.saveData;
      var allSkillxpz = computeAllSkillxpz(ci, ctx);
      var allSkillxpMULTI = computeAllSkillxpMULTI();

      // Vault(60) multiplier — unique to Cooking EXP
      var vault60 = safe(vaultUpgBonus, 60);
      var vaultMult = 1 + vault60 / 100;

      // Efficiency term: min(pow(CookEff/(10*100), 0.25+Prowess), 1)
      // CookingDefence = 100, so threshold = 1000 efficiency
      // For endgame: CookingEff >> 1000, so effTerm = 1
      var effTerm = 1;

      // CalcTalent[42][9] — Journeyman's skill EXP bonus for Cooking
      var calcTalent = safe(computeCalcTalent, 42, 9, ci);

      // Per-skill sources
      var mealCookExp = safe(computeMealBonus, 'CookExp');
      var _br19b = safe(computeBoxReward, ci, '19b');
      var box19b = (typeof _br19b === 'object' && _br19b) ? (_br19b.val || 0) : Number(_br19b) || 0;
      var _cb85 = safe(computeCardBonusByType, 85, ci);
      var card85 = (typeof _cb85 === 'object' && _cb85) ? (_cb85.val || 0) : Number(_cb85) || 0;

      // TalentCalc(146): primary × min(mobsWith1MKills, secondaryCap)
      // Primary: decay(20, 100, effectiveLv) = per-mob bonus
      // Secondary: add(1, 0, effectiveLv) = mob count cap
      // For endgame players, mob count >= cap, so TalentCalc(146) ≈ primary × cap
      var talent146primary = rval(talent, 146, ctx);
      var rawLv146 = Number(skillLvData[ci] && (skillLvData[ci][146] || skillLvData[ci]['146'])) || 0;
      var allTalentBonus146 = rawLv146 > 0 ? safe(computeAllTalentLVz, 146, ci) : 0;
      var effectiveLv146 = rawLv146 + allTalentBonus146;
      var secondaryCap146 = formulaEval('add', 1, 0, effectiveLv146);
      var talentCalc146 = talent146primary * secondaryCap146;

      var talent104 = rval(talent, 104, ctx);
      var statue20 = safe(computeStatueBonusGiven, 20);
      var riftBonus9 = 25 * (safe(computeRiftSkillETC, 9) > 0 ? 1 : 0);
      var voting13 = safe(votingBonusz, 13, 1);

      var perSkill = mealCookExp + box19b + card85 + talentCalc146 + talent104
        + statue20 + riftBonus9 + voting13;

      var val = Math.max(0.1, allSkillxpMULTI * vaultMult * (
        effTerm + (allSkillxpz + calcTalent + perSkill) / 100
      ));

      if (val !== val || val == null) val = 1;

      return {
        val: val,
        children: [
          { name: 'AllSkillxpMULTI', val: allSkillxpMULTI, fmt: 'x' },
          { name: 'Vault(60) mult', val: vaultMult, fmt: 'x' },
          { name: 'EfficiencyTerm (capped 1)', val: effTerm, fmt: 'raw' },
          { name: 'Cooking sources', val: perSkill, fmt: 'raw' },
          { name: 'AllSkillxpz (shared)', val: allSkillxpz, fmt: 'raw' },
          { name: 'CalcTalent', val: calcTalent, fmt: 'raw' },
        ]
      };
    },
    sources: null,
  },
  Breeding: {
    skillLvIdx: 11,
    calcTalentRow: null, // Breeding has its own formula
    sources: function(ci, ctx) {
      var talent372 = rval(talent, 372, ctx, { mode: 'max' });
      var mf105 = safe(mainframeBonus, 105);
      var mealBrExp = safe(computeMealBonus, 'BrExp');
      var breedCount = Number(saveData.breedingData && saveData.breedingData[2] && saveData.breedingData[2][0]) || 0;
      var cardW4a2 = Math.min(5 * safe(cardLv, 'w4a2'), 50);
      var stampBreedExp = safe(computeStampBonusOfTypeX, 'BreedExp');
      var vialBreedXP = safe(computeVialByKey, 'BreedXP');
      var statue21 = safe(computeStatueBonusGiven, 21);
      var riftBonus10 = 25 * (safe(computeRiftSkillETC, 10) > 0 ? 1 : 0);
      var voting16 = safe(votingBonusz, 16, 1);
      var vault59 = safe(vaultUpgBonus, 59);
      return talent372 + mf105 + mealBrExp + 2 * breedCount + cardW4a2
        + stampBreedExp + vialBreedXP + statue21 + riftBonus10 + voting16 + vault59;
    },
  },
};

export default {
  id: 'skill-exp',
  name: 'Skill EXP Multiplier',
  scope: 'character',
  category: 'multiplier',

  pools: {},

  combine: function(pools, ctx) {
    var s = ctx.saveData;
    if (!s) return { val: 1, children: null };
    var ci = ctx.charIdx || 0;
    var skillType = ctx.skillType || 'Mining';

    var sk = SKILL_EXP_CONFIG[skillType];
    if (!sk) return { val: 1, children: null, note: 'Unknown skill: ' + skillType };

    // Smithing/Cooking use completely unique formulas
    if (sk.customCombine) {
      var customResult = sk.customCombine(ci, ctx);
      // customCombine may return a scalar (Smithing) or { val, children } (Cooking)
      if (typeof customResult === 'object' && customResult && 'val' in customResult) {
        return customResult;
      }
      var val = customResult;
      if (val !== val || val == null) val = 1;
      return { val: val, children: [{ name: skillType + ' (custom formula)', val: val, fmt: 'raw' }] };
    }

    var allSkillxpz = computeAllSkillxpz(ci, ctx);
    var allSkillxpMULTI = computeAllSkillxpMULTI();
    var perSkillSources = sk.sources(ci, ctx);

    // CalcTalentMAP contribution
    var calcTalent = 0;
    if (sk.calcTalentRow) {
      calcTalent = safe(computeCalcTalent, sk.calcTalentRow[0], sk.calcTalentRow[1], ci);
    }

    var val = Math.max(0.1, allSkillxpMULTI * (1 + (perSkillSources + allSkillxpz + calcTalent) / 100));

    if (val !== val || val == null) val = 1;

    var children = [];
    children.push({ name: 'AllSkillxpMULTI', val: allSkillxpMULTI, fmt: 'x' });
    children.push({ name: 'AllSkillxpz (shared)', val: allSkillxpz, fmt: 'raw' });
    children.push({ name: skillType + ' specific sources', val: perSkillSources, fmt: 'raw' });
    if (calcTalent > 0) children.push({ name: 'CalcTalent', val: calcTalent, fmt: 'raw' });

    return { val: val, children: children };
  }
};
