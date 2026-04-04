import { LabMainBonus, NinjaInfo, JewelDesc } from '../game/customlists.js';

// ===== LAB DATA =====
// LabMainBonus: [x, y, range, inactiveVal, activeVal, name]
export const LAB_BONUS_BASE = LabMainBonus.map(b => [
  Number(b[1]), Number(b[2]), Number(b[3]), Number(b[4]), Number(b[5]), b[6]
]);
// Dynamic entries from NinjaInfo[25-28], require EmporiumBonus(8-11)
export const LAB_BONUS_DYNAMIC = [25, 26, 27, 28].map((ni, k) => {
  var b = NinjaInfo[ni];
  return [Number(b[1]), Number(b[2]), Number(b[3]), Number(b[4]), Number(b[5]), b[6], 8 + k];
});
// JewelDesc: [x, y, baseBonus, name]
export const JEWEL_DESC = JewelDesc.map(j => [
  Number(j[0]), Number(j[1]), Number(j[12]), j[11]
]);
