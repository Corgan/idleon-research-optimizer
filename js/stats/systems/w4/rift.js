// ===== RIFT SYSTEM (W4) =====
// Rift skill bonuses.

import { saveData } from '../../../state.js';

// ==================== RIFT SKILL ETC ====================

export function computeRiftSkillETC(idx) {
  var s = saveData;
  var riftLv = Number(s.riftData && s.riftData[0]) || 0;
  var RIFT_THRESHOLDS = { 0: 5, 1: 10, 2: 15, 3: 20, 4: 25 };
  var threshold = RIFT_THRESHOLDS[idx];
  if (!threshold || riftLv < threshold) return 0;
  var RIFT_VALUES = { 0: 25, 1: 15, 2: 10, 3: 10, 4: 20 };
  return RIFT_VALUES[idx] || 0;
}
