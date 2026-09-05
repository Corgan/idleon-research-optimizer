// ===== SPELUNKING MAX STAMINA DESCRIPTOR =====

import { companionBonusForSave } from '../data/common/companions.js';
import { maxTalentBonusDetail } from '../systems/common/talent.js';
import { computeRiftSkillBonus } from '../systems/w4/rift.js';
import {
  chapterBonus,
  shopUpgBonus,
  computeBigFishBonus,
} from '../systems/w7/spelunking.js';
import { spelunkMaxStaminaTaskLevel } from '../data/w7/tasks.js';
import { label } from '../entity-names.js';
import { safe, createDescriptor } from './helpers.js';

function finite(value) {
  var number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function spelunkingSkillLevel(charIdx, saveData) {
  return finite(saveData && saveData.lv0AllData && saveData.lv0AllData[charIdx]
    && saveData.lv0AllData[charIdx][19]);
}

function talent236Bonus(saveData) {
  var detail = safe(maxTalentBonusDetail, 236, -1, saveData, { mode: 1 });
  return finite(detail && (detail.value != null ? detail.value : detail.val));
}

export default createDescriptor({
  id: 'spelunking-max-stamina',
  name: 'Spelunking Max Stamina',
  scope: 'character',
  category: 'stat',

  combine: function(pools, ctx) {
    var saveData = ctx.saveData || {};
    var charIdx = ctx.charIdx || 0;
    var shop61 = finite(safe(shopUpgBonus, 61, saveData));
    var taskLevel = finite(safe(spelunkMaxStaminaTaskLevel, saveData));
    var taskFlat = 20 * taskLevel;
    var glowfishBonus = finite(safe(companionBonusForSave, 148, saveData));
    var glowfishFlat = 10 * glowfishBonus;
    var skillLevel = spelunkingSkillLevel(charIdx, saveData);
    var shop4 = finite(safe(shopUpgBonus, 4, saveData));
    var shop5 = finite(safe(shopUpgBonus, 5, saveData));
    var chapter20 = finite(safe(chapterBonus, 2, 0, saveData));
    var chapter30 = finite(safe(chapterBonus, 3, 0, saveData));
    var rift18 = finite(safe(computeRiftSkillBonus, 18, 3, saveData));
    var talent236 = talent236Bonus(saveData);
    var bigFishBonus = finite(safe(computeBigFishBonus, 1, saveData));
    var base = 14 + skillLevel + shop4 * Math.floor(skillLevel / 10)
      + chapter20 + 15 * rift18 + shop5 + chapter30 + talent236;
    var bigFishMultiplier = 1 + bigFishBonus / 100;
    var glowfishMultiplier = 1 + glowfishBonus / 100;
    var preFloor = shop61 + taskFlat + glowfishFlat
      + base * bigFishMultiplier * glowfishMultiplier;
    var val = Math.floor(finite(preFloor));

    return {
      val: val,
      children: [
        { name: 'Shop Upgrade 61', val: shop61, fmt: '+' },
        { name: 'W7 Task: +20 Max Stamina per level', val: taskFlat, fmt: '+',
          note: 'Level ' + taskLevel + '; +20 per level' },
        { name: 'Glowfish Flat: +10 * Bonus', val: glowfishFlat, fmt: '+',
          note: 'Bonus ' + glowfishBonus },
        { name: 'Spelunking Max Stamina Base', val: base, fmt: 'raw', children: [
          { name: 'Constant', val: 14, fmt: 'raw' },
          { name: 'Spelunking Skill Level', val: skillLevel, fmt: 'raw' },
          { name: 'Shop Upgrade 4 per 10 Skill Levels', val: shop4 * Math.floor(skillLevel / 10), fmt: 'raw' },
          { name: 'Chapter Bonus 2,0', val: chapter20, fmt: 'raw' },
          { name: 'Rift Skill Bonus 18,3', val: 15 * rift18, fmt: 'raw' },
          { name: 'Shop Upgrade 5', val: shop5, fmt: 'raw' },
          { name: 'Chapter Bonus 3,0', val: chapter30, fmt: 'raw' },
          { name: label('Talent', 236), val: talent236, fmt: 'raw', note: 'getbonus2(1,236,-1)' },
        ]},
        { name: 'Big Fish Multiplier', val: bigFishMultiplier, fmt: 'x', note: '1 + BigFishBonuses(1) / 100' },
        { name: 'Glowfish Multiplier', val: glowfishMultiplier, fmt: 'x',
          note: '1 + Bonus / 100; Bonus ' + glowfishBonus },
        { name: 'Final Floor', val: val, fmt: 'raw', note: 'floor(total)' },
      ],
    };
  },
});