// ===== AFK CLAIM ACCEPTANCE =====
import { finalBubbleValByKey } from '../w2/alchemy.js';
import { getBribeBonus } from '../w3/bribe.js';
import { guild } from './guild.js';
import { computeBoxReward, computeCardBonusByType } from './stats.js';
import { goldFoodBonuses } from './goldenFood.js';
import { talent } from './talent.js';
import { superBitType } from '../../../game-helpers.js';
import { createStatContext } from '../../stat-context.js';

function _value(value) {
  const number = Number(value?.val ?? value);
  if (!Number.isFinite(number)) throw new Error('AFK acceptance input is not finite.');
  return number;
}

export function afkExpDoubleDistribution(threshold) {
  if (!Number.isFinite(threshold)) throw new Error('AFK EXP doubling threshold must be finite.');
  let successes = 0;
  for (let roll = 0; roll <= 100; roll++) if (roll < Math.min(90, threshold)) successes++;
  const chance = successes / 101;
  return { chance, expectedMultiplier: 1 + chance, outcomes: [[1, 1 - chance], [2, chance]] };
}

export function afkExpAcceptance(S, ci) {
  return afkExpDoubleDistribution(_value(finalBubbleValByKey('DubEXP', ci, S))
    + _value(getBribeBonus(7, S))
    + (_value(guild.resolve(15, { saveData: S })) + Math.min(_value(computeCardBonusByType(47, ci, S)), 20)
      + (_value(computeBoxReward(ci, '14a')) + 15 * superBitType(10, S.gamingData?.[12]))));
}

export function afkBonusTimeDistribution(seconds, bonusPct, postOfficePct) {
  if ([seconds, bonusPct, postOfficePct].some(value => !Number.isFinite(value)) || seconds < 0)
    throw new Error('AFK bonus time inputs must be finite with nonnegative seconds.');
  const chance = Math.max(0, Math.min(1, bonusPct / 100));
  const base = postOfficePct > 0 ? Math.min(.2, postOfficePct / 100) * seconds : 0;
  return { chance, expected: base + chance * seconds, minimum: base,
    outcomes: [[base, 1 - chance], [base + seconds, chance]] };
}

export function afkAccountBonusTime(S, ci, seconds, { candy = false } = {}) {
  if (!Number.isFinite(seconds) || seconds < 0) throw new Error('AFK bonus seconds must be nonnegative and finite.');
  if (candy || seconds <= 120) return {
    sailing: afkBonusTimeDistribution(0, 0, 0), gaming: afkBonusTimeDistribution(0, 0, 0),
  };
  const ctx = createStatContext({ saveData: S, charIdx: ci });
  return {
    sailing: afkBonusTimeDistribution(seconds,
      goldFoodBonuses('SailAFKz', ci, undefined, S).total + _value(finalBubbleValByKey('A3ACTIVE', ci, S)),
      _value(computeBoxReward(ci, '21a'))),
    gaming: afkBonusTimeDistribution(seconds,
      goldFoodBonuses('GamerAFKz', ci, undefined, S).total + _value(finalBubbleValByKey('W3ACTIVE', ci, S))
        + _value(talent.resolve(175, ctx)), _value(computeBoxReward(ci, '23a'))),
  };
}
