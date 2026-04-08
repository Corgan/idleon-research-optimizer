// ===== SKILL EFFICIENCY DESCRIPTOR =====
// Covers Mining/Chopping/Fishing/Catching/Trapping/Worship/Cooking/Lab/Divinity/Spelunking efficiency.
// Each skill has a specific formula, but they all share AllEfficiencies and AllBaseSkillEff.
// Scope: character + skill type.

import { companions, vaultUpgBonus, goldFoodBonuses, cardLv,
  getSetBonus, votingBonusz } from '../systems/common/goldenFood.js';
import { label } from '../entity-names.js';
import { etcBonus } from '../systems/common/etcBonus.js';
import { talent } from '../systems/common/talent.js';
import { arcadeBonus } from '../systems/w2/arcade.js';
import { computeCardBonusByType, computeBoxReward } from '../systems/common/stats.js';
import { mainframeBonus } from '../systems/w4/lab.js';
import { pvStatListData, charClassData, optionsListData } from '../../save/data.js';
import { AlchemyDescription } from '../data/game/customlists.js';
import { cauldronInfoData } from '../../save/data.js';
import { isBubblePrismad, getPrismaBonusMult } from '../systems/w2/alchemy.js';
import { formulaEval } from '../../formulas.js';
import { bubbleParams } from '../data/w2/alchemy.js';
import { saveData } from '../../state.js';
import { computeStampBonusOfTypeX } from '../systems/w1/stamp.js';
import { ITEMS } from '../data/game/items.js';
import {
  rval, safe, computePrayerReal,
  computeAllEfficiencies, computeAllBaseSkillEff
} from './skill-helpers.js';
import { computeCalcTalent } from '../systems/common/calcTalent.js';

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

// Each primary skill follows the pattern:
// SkillStatsDN = equipTool WP * (1+talent*skillLv/100) * (1+bubbleTool/100) + 4 + TotalStats(Skill_Power)
// Efficiency = (flat + (pow(SkillStatsDN, 1.3) + (pow(TotalStat^0.6) * (1+talent/100) + stamps + AllBaseSkillEff))
//   * (1+skillLv/200) * (1+boxPct+calcTalent/100) * AllEfficiencies * perSkillMultipliers)
var SKILL_CONFIG = {
  Mining: {
    toolSlot: [1, 0], stat: 'STR', statIdx: 0, flat: 12,
    toolBubble: 'ToolW', toolTalent: 103, skillLvIdx: 1,
    effTalent: 142, stampType: 'BaseMinEff',
    boxPctKey: 'MinEffPct', calcTalentRow: [43, 0],
    // Per-skill multipliers after AllEfficiencies
    perSkillMultFn: function(ci, ctx) {
      var talent85 = rval(talent, 85, ctx);
      var etc10 = rval(etcBonus, '10', ctx);
      var voting7 = safe(votingBonusz, 7, 1);
      var copperSet = safe(getSetBonus, 'COPPER_SET');
      return (1 + (talent85 + etc10 + voting7 + copperSet) / 100);
    },
  },
  Choppin: {
    toolSlot: [1, 1], stat: 'WIS', statIdx: 2, flat: 12,
    toolBubble: 'ToolA', toolTalent: 283, skillLvIdx: 3,
    effTalent: 532, stampType: 'BaseChopEff',
    boxPctKey: 'ChopEffPct', calcTalentRow: [43, 2],
    perSkillMultFn: function(ci, ctx) {
      var talent265 = rval(talent, 265, ctx);
      var etc11 = rval(etcBonus, '11', ctx);
      var voting8 = safe(votingBonusz, 8, 1);
      return (1 + (talent265 + etc11 + voting8) / 100);
    },
  },
  Fishing: {
    toolSlot: [1, 2], stat: 'STR', statIdx: 0, flat: 12,
    toolBubble: 'ToolG', toolTalent: 283, skillLvIdx: 4,
    effTalent: 142, stampType: 'BaseFishEff',
    boxPctKey: 'FishEffPct', calcTalentRow: [43, 3],
    perSkillMultFn: function(ci, ctx) {
      var talent355 = rval(talent, 355, ctx);
      var etc12 = rval(etcBonus, '12', ctx);
      var voting9 = safe(votingBonusz, 9, 1);
      return (1 + (talent355 + etc12 + voting9) / 100);
    },
  },
  Catching: {
    toolSlot: [1, 3], stat: 'AGI', statIdx: 1, flat: 10,
    toolBubble: 'ToolA', toolTalent: 283, skillLvIdx: 6,
    effTalent: 367, stampType: 'BaseCatchEff',
    boxPctKey: 'CatchEffPct', calcTalentRow: [43, 5],
    perSkillMultFn: function(ci, ctx) {
      var talent450 = rval(talent, 450, ctx);
      var etc13 = rval(etcBonus, '13', ctx);
      return (1 + (talent450 + etc13) / 100);
    },
  },
};

export default {
  id: 'skill-efficiency',
  name: 'Skill Efficiency',
  scope: 'character',
  category: 'stat',

  pools: {},

  combine: function(pools, ctx) {
    var s = ctx.saveData;
    if (!s) return { val: 0, children: null };
    var ci = ctx.charIdx || 0;
    var skillType = ctx.skillType || 'Mining';

    var sk = SKILL_CONFIG[skillType];
    if (!sk) return { val: 0, children: null, note: 'Unknown skill: ' + skillType };

    // 1. Tool weapon power from equipped tool
    var wpRaw = 0;
    var equipRow = sk.toolSlot[0];
    var equipSlot = sk.toolSlot[1];
    var equipOrder = s.equipOrderData;
    var equipMap = s.equipMapData;
    if (equipOrder && equipOrder[equipRow] && equipOrder[equipRow][equipSlot] !== 'Blank') {
      var itemName = equipOrder[equipRow][equipSlot];
      if (ITEMS && ITEMS[itemName]) {
        wpRaw = Number(ITEMS[itemName].Weapon_Power) || 0;
        // Add UQ Weapon_Power from EquipmentMap
        if (equipMap && equipMap[equipRow] && equipMap[equipRow][equipSlot]) {
          wpRaw += Number(equipMap[equipRow][equipSlot].Weapon_Power) || 0;
        }
      }
    }

    // 2. Tool bubble + talent scaling
    var toolBubble = safe(bubbleValByKey, sk.toolBubble, ci);
    var skillLv = Number(s.lv0AllData && s.lv0AllData[ci] && s.lv0AllData[ci][sk.skillLvIdx]) || 0;
    var toolTalent = rval(talent, sk.toolTalent, ctx);
    var skillStatsDN = wpRaw * (1 + toolTalent * (skillLv / 10) / 100) * (1 + toolBubble / 100) + 4;

    // 3. TotalStats(Skill_Power) — In game, sums power from all equipment.
    //    wpRaw already captures the tool's Weapon_Power (main contributor).
    //    Additional power from stamps/meals/etc enters via separate multiplier pools.

    // 4. Main efficiency formula
    var totalStat = Number((pvStatListData[ci] || [])[sk.statIdx]) || 0;
    var effTalent = rval(talent, sk.effTalent, ctx);
    var stampBase = safe(computeStampBonusOfTypeX, sk.stampType);
    var allBaseEff = computeAllBaseSkillEff(ci, ctx);

    var inner = Math.pow(skillStatsDN, 1.3)
      + Math.pow(totalStat + 1, 0.6) * (1 + effTalent / 100)
      + stampBase + allBaseEff;

    var skillLvMult = 1 + skillLv / 200;
    var _brBox = safe(computeBoxReward, ci, sk.boxPctKey);
    var boxPct = (typeof _brBox === 'object' && _brBox) ? (_brBox.val || 0) : Number(_brBox) || 0;
    var calcTalent = safe(computeCalcTalent, sk.calcTalentRow[0], sk.calcTalentRow[1], ci);
    var boxCalcMult = 1 + (boxPct + calcTalent) / 100;

    // STR^0.35 scaling for mining/fishing
    var statPowMult = 1;
    if (sk.stat === 'STR' || sk.stat === 'WIS' || sk.stat === 'AGI') {
      statPowMult = 1 + Math.pow(totalStat / 100, 0.35) * (1 + effTalent / 100);
    }

    var gfMult = 1;
    try {
      var gf = goldFoodBonuses(skillType + 'Eff', ci);
      gfMult = (gf && typeof gf === 'object') ? (Number(gf.total) || 1) : (Number(gf) || 1);
    } catch(e) {}

    var allEff = computeAllEfficiencies(ci, ctx);

    var perSkillMult = sk.perSkillMultFn ? sk.perSkillMultFn(ci, ctx) : 1;

    var val = (sk.flat + inner) * skillLvMult * boxCalcMult * statPowMult
      * gfMult * allEff * perSkillMult;

    if (val !== val || val == null) val = 0;

    var children = [];
    children.push({ name: 'Tool Power (SkillStatsDN)', val: skillStatsDN, fmt: 'raw',
      note: 'WP=' + wpRaw + ' bubble=' + toolBubble.toFixed(1) });
    children.push({ name: 'Inner (DN^1.3 + stat^0.6 + base)', val: sk.flat + inner, fmt: 'raw' });
    children.push({ name: 'Skill Level /' + 200, val: skillLvMult, fmt: 'x',
      note: skillType + ' lv=' + skillLv });
    children.push({ name: 'AllEfficiencies', val: allEff, fmt: 'x' });
    children.push({ name: 'Per-skill multipliers', val: perSkillMult, fmt: 'x' });
    if (gfMult > 1) children.push({ name: 'GoldFood ' + skillType + 'Eff', val: gfMult, fmt: 'x' });

    return { val: val, children: children };
  }
};
