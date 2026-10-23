// ===== STATUE LEVELING (COMMON) =====

import { STATUE_COUNT } from '../../data/common/statues.js';
import { computeVialByKey, finalBubbleValByKey } from '../w2/alchemy.js';
import { hasRoyalGData, statueFlairLevel, statueFlairMultiplier } from '../w7/royal-guardian.js';

export function statueLevelingInputs(S, charIdx = 0) {
  const bubblePct = Math.max(0, Number(finalBubbleValByKey('StatueStartEXP', charIdx, S)));
  const costFactor = Math.max(.5, 1 - bubblePct / 100);
  const doubleChance = Math.max(0, Math.min(1, Number(computeVialByKey('StatueDouble', S, charIdx)) / 100));
  if (!Number.isFinite(bubblePct) || !Number.isFinite(doubleChance)) throw new Error('Saved statue alchemy bonuses are not finite.');
  let onyxCount = 0, zenithCount = 0;
  const tier = Number(S.olaData?.[69]) || 0;
  for (const value of S.statueGData || []) {
    if (tier >= 2 && Number(value) >= 2) onyxCount++;
    if (tier >= 3 && Number(value) >= 3) zenithCount++;
  }
  return {
    bubblePct, costFactor, retentionPct: (1 - costFactor) * 100, doubleChance,
    onyxCount, zenithCount, tierMultiplier: 1 + Math.max(0, .1 * onyxCount + .15 * zenithCount),
    flairAvailable: hasRoyalGData(S),
  };
}

function _row(S, index, charIdx) {
  return S.statueLvAllData?.[charIdx]?.[index];
}

function _validLevel(value) {
  return (typeof value === 'number' || typeof value === 'string' && value.trim() !== '')
    && Number.isSafeInteger(Number(value)) && Number(value) >= 0;
}

export function statueExpRequirement(S, index, level, charIdx = 0) {
  if (!Number.isInteger(index) || index < 0 || index >= STATUE_COUNT || !_validLevel(level)) {
    throw new Error('Statue index and level must be valid nonnegative integers.');
  }
  const gateIndex = Number(String(index)[0]);
  const gateLevel = gateIndex === index ? Number(level) : _row(S, gateIndex, charIdx)?.[0];
  if (!_validLevel(gateLevel)) throw new Error('Statue EXP rounding requires the saved level of statue ' + gateIndex + '.');
  const raw = Math.pow(Number(level), 1.17) * Math.pow(1.35, Number(level) / 10) + 1;
  if (!Number.isFinite(raw)) throw new Error('Statue level exceeds the finite EXP calculation range.');
  return Number(gateLevel) > 300 ? raw : Math.round(raw);
}

export function statueTargetCost(S, index, targetLevel, { charIdx = 0, inputs = statueLevelingInputs(S, charIdx) } = {}) {
  if (!Number.isInteger(index) || index < 0 || index >= STATUE_COUNT || !_validLevel(targetLevel)) {
    throw new Error('Statue target must be a nonnegative whole level.');
  }
  const row = _row(S, index, charIdx);
  if (!Array.isArray(row) || !_validLevel(row[0]) || row[1] == null || !Number.isFinite(Number(row[1])) || Number(row[1]) < 0) {
    return { available: false, index, missing: 'Saved statue level or EXP is missing.' };
  }
  const level = Number(row[0]), exp = Number(row[1]);
  const required = statueExpRequirement(S, index, level, charIdx);
  const flairLevel = statueFlairLevel(S, index);
  const flairMultiplier = statueFlairMultiplier(S, index);
  const baseDepositExp = inputs.tierMultiplier * flairMultiplier;
  const guaranteedExp = baseDepositExp * (inputs.doubleChance >= 1 ? 2 : 1);
  const averageExp = baseDepositExp * (1 + inputs.doubleChance);
  if (!Number.isFinite(inputs.costFactor) || inputs.costFactor < .5 || inputs.costFactor > 1
    || !Number.isFinite(guaranteedExp) || guaranteedExp <= 0 || !Number.isFinite(averageExp) || averageExp <= 0) {
    throw new Error('Statue deposit multipliers or retention are invalid.');
  }
  let consumed = 0, threshold = 0;
  for (let lv = level; lv < Number(targetLevel); lv++) {
    const requirement = statueExpRequirement(S, index, lv, charIdx);
    // Retention reduces EXP consumed, not the full bar needed to trigger a level.
    threshold = Math.max(threshold, consumed + requirement);
    consumed += requirement * inputs.costFactor;
    if (!Number.isFinite(threshold) || !Number.isFinite(consumed)) throw new Error('Statue target EXP exceeds the finite calculation range.');
  }
  const expNeeded = Math.max(0, threshold - exp);
  return {
    available: true, index, level, exp, required, targetLevel: Number(targetLevel), expNeeded,
    flairLevel, flairMultiplier, baseDepositExp, guaranteedExp, averageExp,
    statuesGuaranteed: Math.ceil(expNeeded / guaranteedExp),
    statuesAverage: Math.ceil(expNeeded / averageExp),
  };
}
