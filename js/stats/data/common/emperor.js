// ===== EMPEROR DATA =====
import { EmperorBon } from '../game/customlists.js';
import { EquipmentSets } from '../game/custommaps.js';

export function emperorBonVal(idx) { return Number(EmperorBon[1]?.[idx]) || 0; }
export function emperorBonType(idx) { return Number(EmperorBon[2]?.[idx]) || 0; }
export const EMPEROR_SET_BONUS_VAL = Number(EquipmentSets.EMPEROR_SET[3][2]);
