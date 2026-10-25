// ===== CLAMWORKS AFK CLAIMS (W7) =====
import * as CW from './clamworks.js';
import { guild } from '../common/guild.js';
import { talent } from '../common/talent.js';
import { optionsListData } from '../../../save/data.js';

export function initializeClamworksAfkDrops(tables, phase = 'settled') {
  if (!['entry', 'settled'].includes(phase)) throw new Error('Unknown Clamworks claim phase');
  if (!Array.from({ length: 10 }, (_, i) => optionsListData[455 + i]).every(v => v != null && Number.isSafeInteger(Number(v)) && Number(v) >= 0)) {
    throw new Error('Saved Clamworks upgrade levels or promotion are missing or invalid');
  }
  const rows = tables.monsterDrops.w7a6;
  if (!Array.isArray(rows)) throw new Error('Clamworks drop table is missing');
  if (CW.upgLevel(5) >= 1 && !rows.some(r => r[0] === 'ClamPearl1')) rows.push(['ClamPearl1', '0.000005', '1', 'N/A']);
  for (const row of rows) {
    if (row[0] === 'ClamPearl0') row[1] = phase === 'entry' ? '0.001' : String(CW.pearlDropRate());
    if (row[0] === 'ClamPearl1') row[1] = phase === 'entry' ? '0.000005' : String(CW.blackPearlDropRate());
  }
}

export function clamworksAfkSummary(ctx, { values, drops, rerollDrops, food, eligible, phase }) {
  const zero = key => ({ key, expected: 0, chance: 0, minimum: 0, guaranteed: false });
  const row = (list, key) => list.find(r => r.key === key) || zero(key);
  const value = CW.pearlValue({ multikillTotal: values.multikillTotal });
  const luckyChance = CW.pearl10xChance(), pureMultiplier = CW.blackPearlValue();
  function payout(list) {
    const regular = row(list, 'ClamPearl0'), pure = row(list, 'ClamPearl1');
    return { regular, pure, expectedPearls: (regular.expected + pure.expected * pureMultiplier) * value * (1 + 9 * luckyChance) };
  }
  const base = payout(drops), replacement = payout(rerollDrops);
  const talentBonus = Number(talent.resolve(27, ctx, { tab: 1 }).val);
  const guildBonus = Number(guild.resolve(15, ctx).val);
  const threshold = Math.min(Math.pow(talentBonus + guildBonus, 0.9), 40);
  const procChance = Math.max(0, Math.min(1, (threshold - 0.05) / 99.95));
  const initialCoefficient = food ? food.initial.rawKillsPerHour * food.initial.percent / 100 * (food.phases.at(-1)?.endSeconds || 0) / 3600 : 0;
  const foodBlocked = initialCoefficient / ((food?.coefficient || 0) + 0.01) > 1.2;
  const autoClaim = Number(optionsListData[527]) === 1;
  const offerChance = eligible && !foodBlocked && !autoClaim ? procChance : 0;
  // Every replacement rolls its own offer. Food is not consumed a second time.
  const failure = 1 - replacement.pure.chance;
  const repeat = offerChance * (1 - base.pure.chance) / (1 - procChance * failure);
  const strategy = {
    pureChance: base.pure.chance + repeat * replacement.pure.chance,
    expectedPure: base.pure.expected + repeat * replacement.pure.expected,
    expectedPearls: (base.regular.expected
      + offerChance * (1 - base.pure.chance) * (replacement.regular.expected - base.regular.expected)
      + (base.pure.expected + repeat * replacement.pure.expected) * pureMultiplier) * value * (1 + 9 * luckyChance),
    expectedRerolls: repeat,
  };
  if (![value, luckyChance, pureMultiplier, procChance, strategy.expectedPearls].every(Number.isFinite)) throw new Error('Clamworks AFK values are not representable');
  return {
    ...base, replacement, strategy, value, luckyChance, pureMultiplier, procChance, offerChance, foodBlocked, phase,
    pureUnlocked: CW.upgLevel(5) >= 1, promotion: CW.promotionLevel(),
    autoClaim,
    rerollPartial: ctx.saveData.guildData?.[0] == null || typeof ctx.saveData.guildData[0] !== 'object',
  };
}
