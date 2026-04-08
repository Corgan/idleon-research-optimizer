// ===== SAILING SYSTEM (W5) =====
// Artifact bonuses from sailing.

import { saveData } from '../../../state.js';
import { artifactBase } from '../../data/w5/sailing.js';

// ==================== ARTIFACT BONUS ====================

export function computeArtifactBonus(artIdx) {
  var s = saveData;
  var sailing = s.sailingData;
  if (!sailing || !sailing[3]) return 0;
  var tier = Number(sailing[3][artIdx]) || 0;
  if (tier <= 0) return 0;
  var val = artifactBase(artIdx);
  if (tier >= 2) val *= tier;
  return val;
}
