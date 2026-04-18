// ===== TRAPPING SYSTEM (W3) =====
// Trap minigame bonuses.

// ==================== TRAP MG BONUS ====================

export function computeTrapMGBonus(idx, saveData) {
  var s = saveData;
  var traps = s.trappingData;
  if (!traps) return 0;
  var val = Number(traps[idx]) || 0;
  return val;
}
