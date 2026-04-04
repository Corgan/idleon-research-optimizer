// ===== SIM MATH - re-export shim =====
// Canonical home: stats/systems/w7/research-math.js
// This file re-exports everything for backward compatibility.

export {
  gbWith, buildKalMap, getMonoObsSet, countMagTypes, countMagsOfType,
  gridBonusMode2, getAvailableSlots,
  OBS_BASE_EXP, obsBaseExp, insightExpReqAt, insightExpRate,
  insightAffectsExp, getKaleiMultiBase,
  magMaxForLevel, isObsUsable, computeOccurrencesToBeFound,
  isGridCellUnlocked, findNewlyUnlockable,
  deathNoteRank,
  simTotalExpWith, researchExpReq, advanceResearchLevel,
  advanceInsightLevels, hrsToNextInsightLv, simForwardProjection,
  computeGridPointsEarned, computeGridPointsSpent, gridPointsAvail,
  calcAllBonusMultiWith, refreshAbm,
  computeMagnifiersOwnedWith, computeShapesOwnedAt,
} from './stats/systems/w7/research-math.js';
