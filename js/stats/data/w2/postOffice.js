import { PostOffUpgradeInfo } from '../game/customlists.js';

// ===== POST OFFICE DATA =====
// PostOffUpgradeInfo[box]: [name, x1_s0, x2_s0, formula_s0, stat_s0, x1_s1, x2_s1, formula_s1, stat_s1, ...]
// Slot params at offset 1 + slot * 4
export function postOfficeSlotParams(boxIdx, slot) {
  var box = PostOffUpgradeInfo[boxIdx];
  if (!box) return null;
  var offset = 1 + slot * 4;
  return { x1: Number(box[offset]) || 0, x2: Number(box[offset + 1]) || 0, formula: box[offset + 2], name: box[0].replace(/_/g, ' ') };
}
