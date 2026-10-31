// ===== CLASS TALENT POINT POOLS (COMMON) =====

import { charClassData, optionsListData } from '../../../save/data.js';
import { createStatContext } from '../../stat-context.js';
import { talent } from './talent.js';
import { finalBubbleValByKey, computeVialByKey, sigilBonus } from '../w2/alchemy.js';
import { computeStampBonusOfTypeX } from '../w1/stamp.js';
import { computeStarSignBonus } from './starSign.js';
import { achieveStatus } from './achievement.js';
import { computeFlurboShop } from '../w2/dungeon.js';
import { arcadeBonus } from '../w2/arcade.js';
import { computeShinyBonusS } from '../w4/breeding.js';
import { vaultUpgBonus } from './vault.js';
import { companionBonusForSave } from '../../data/common/companions.js';
import { grimoireUpgBonus } from '../mc/grimoire.js';
import { arcaneUpgBonus } from '../mc/tesseract.js';
import { computeCompassBonus } from '../w7/compass.js';
import { armoryBonus, orbletBonus } from '../w7/royal-guardian.js';
import { shopUpgBonus } from '../w7/spelunking.js';
import { jellyRewardBonus } from '../../data/w7/jelly-operator.js';
import { computeFamBonusQTYs } from './stats.js';
import { computeCardLv } from './cards.js';
import { guild } from './guild.js';
import { getBribeBonus } from '../w3/bribe.js';

function _savedNumber(value) {
  if (value == null || value === '' || !Number.isFinite(Number(value)) || Number(value) < 0)
    throw new Error('Saved talent-point inputs are missing or invalid.');
  return Number(value);
}

export function classTalentPointPools(S, charIdx, { allPools = false } = {}) {
  const levels = S.lv0AllData?.[charIdx], level = _savedNumber(levels?.[0]);
  const cls = _savedNumber(charClassData[charIdx]);
  const currency = Array.from({ length: 4 }, (_, tab) => _savedNumber(S.cyTalentPointsData?.[tab]));
  const ctx = createStatContext({ saveData: S, charIdx });
  const T = (id, tab = 1) => talent.resolve(id, ctx, { tab }).val;
  const V = key => Number(computeVialByKey(key, S, charIdx));
  const stamp = key => computeStampBonusOfTypeX(key, S);
  const achievement = id => achieveStatus(id, S);
  const shiny = id => computeShinyBonusS(id, S);
  const vault = id => vaultUpgBonus(id, S);
  const companion = companionBonusForSave(20, S), flurbo = Number(computeFlurboShop(1, S));
  let skillFull = -3, skillHalf = 0, skillFifth = 0;
  for (let skill = 1; skill <= 9; skill++) {
    const value = _savedNumber(levels?.[skill]);
    skillFull += value;
    skillHalf += Math.floor(value / 2);
    skillFifth += Math.floor(value / 5);
  }
  skillFull += Math.round(T(275));
  // These class boundaries are the native TotalTalentPoints branches, not class-family inference.
  const bubble = Number(finalBubbleValByKey(cls < 7 ? 'TalArchers'
    : cls < 19 ? 'TalWarrior' : cls < 31 ? 'TalArchers' : 'TalWiz', charIdx, S));
  const bonus = currency.map(value => value + bubble);
  const pools = [
    Math.floor(3 * (level - 1) + (skillFull + (bonus[0] + (V('Tab1Pts')
      + (computeStarSignBonus('TalPts1', charIdx, S) + (stamp('Talent1') + (5 * achievement(54)
      + (flurbo + (Number(arcadeBonus(16, S)) + (6 * achievement(216)
      + (shiny(10) + (vault(1) + (companion + _savedNumber(optionsListData[436])))))))))))))),
    Math.floor(3 * (level - 6) + (skillHalf + (bonus[1] + V('Tab2Pts')
      + (T(119) + (T(299) + (T(494) + (stamp('Talent2') + (T(44)
      + (2 * achievement(76) + 3 * achievement(78) + (flurbo + (8 * achievement(230)
      + (shiny(11) + (vault(6) + companion))))))))))))),
    Math.floor(3 * (level - 29) + (skillHalf + (bonus[2] + V('Tab3Pts')
      + (stamp('Talent3') + (5 * achievement(166) + 10 * achievement(170)
      + (flurbo + (8 * achievement(219) + (shiny(12) + (vault(40) + companion))))))))),
    cls === 4 ? Math.floor(Math.max(0, 1 + companion + T(34)
      + T(45, 2) * _savedNumber(optionsListData[158]))) : Math.floor(Math.max(0,
      3 * Math.min(level - 89, 100) + Math.max(0, 2 * (level - 189))
      + (skillFifth + (bonus[3] + (stamp('Talent4') + (flurbo
      + (Math.floor(_savedNumber(levels?.[14]) / 2) + (V('Tab4Pts')
      + (3 * _savedNumber(S.tasksGlobalData?.[2]?.[4]?.[0]) + (10 * achievement(292)
      + (10 * achievement(295) + (10 * achievement(239) + (15 * achievement(240)
      + (12 * achievement(241) + (shiny(13) + companion))))))))))))))),
  ];
  if (!allPools) return pools;
  const grimoire = id => grimoireUpgBonus(id, null, S);
  const compass = id => computeCompassBonus(id, S);
  const task = 5 * _savedNumber(S.tasksGlobalData?.[2]?.[5]?.[0]);
  let fifthBonus = _savedNumber(S.cyTalentPointsData?.[4]);
  if (cls === 14) fifthBonus += grimoire(32);
  if (cls === 29) fifthBonus += compass(56) + compass(67);
  if (cls === 40) fifthBonus += arcaneUpgBonus(33, S);
  pools.push(cls === 12 || cls === 16 ? Math.floor(Math.max(0, 1
    + (orbletBonus(S, 2) + (shopUpgBonus(62, S)
    + (50 * (_savedNumber(S.spelunkData?.[0]?.[9]) >= 1 ? 1 : 0) + (task
    + (grimoire(45) + (compass(46) + (companion + (armoryBonus(S, 46)
    + (armoryBonus(S, 47) + (armoryBonus(S, 48) + (armoryBonus(S, 49)
    + (jellyRewardBonus(S, 6) + jellyRewardBonus(S, 59)))))))))))))))
    : Math.floor(Math.max(0, 3 * (level - 249) + (skillFifth + (fifthBonus
    + (stamp('Talent5') + (flurbo + (task + (grimoire(45) + (compass(46) + companion))))))))));
  const starCurrency = _savedNumber(S.cyTalentPointsData?.[5]);
  const family = Number(computeFamBonusQTYs(charIdx, S)[64]) || 0;
  const cards = Math.min(5 * computeCardLv('w4b2', S), 50)
    + (Math.min(15 * computeCardLv('Boss2C', S), 100) + Math.min(4 * computeCardLv('fallEvent1', S), 100));
  const fractal = _savedNumber(optionsListData[184]) >= 20000 ? 1 : 0;
  pools.push(Math.floor(level - 1 + (skillFull + T(8) + (starCurrency + family
    + (T(622) + (stamp('TalentS') + (T(17) + (Math.floor(guild.resolve(11, ctx).val)
    + (flurbo + (cards + (Number(sigilBonus(9, S, charIdx)) + (10 * achievement(212)
    + (20 * achievement(289) + (20 * achievement(305) + (shiny(14)
    + (Number(getBribeBonus(32, S)) + (100 * fractal + (vault(53) + companion))))))))))))))))));
  return pools;
}
