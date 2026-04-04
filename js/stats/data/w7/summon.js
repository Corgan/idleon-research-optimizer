import { SummonEnemies } from '../game/customlists.js';

// ===== SUMMONING DATA =====
// SummonEnemies[9]: 40-entry endless bonus types (1-indexed)
export const SUMMON_ENDLESS_TYPE = SummonEnemies[9].map(Number);
export const SUMMON_ENDLESS_VAL  = SummonEnemies[10].map(Number);
// SummonEnemies normal wins: mob name → [bonusType(1-indexed), bonusValue]
export const SUMMON_NORMAL_BONUS = Object.fromEntries(
  SummonEnemies[0]
    .map((mob, i) => [mob, SummonEnemies[5][i], SummonEnemies[7][i]])
    .filter(([, t]) => t !== '_')
    .map(([mob, t, v]) => [mob, [Number(t), Number(v)]])
);
