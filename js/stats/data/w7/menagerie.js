// ===== MENAGERIE DATA (W7) =====
import { Research, RANDOlist } from '../game/customlists.js';

export var MENAGERIE_BOOST_COUNT = 25;
export var MENAGERIE_UNLOCK_COUNT = 25;

export function menagerieBoostPerLevel(idx) { return Number(Research[58]?.[idx]) || 0; }
export function menagerieBoostName(idx) { return String(Research[57]?.[idx] ?? ''); }
export function menagerieUnlockName(idx) { return String(Research[56]?.[idx] ?? ''); }
export function menagerieMissionCount() { return (Research[52] || []).length; }
export function arenaCrucibleThresholds() { return (RANDOlist[115] || []).map(function(v) { return Number(v) || 0; }); }
export function menagerieDoublerEligible(system) {
  var row = system === 'minehead' ? Research[59] : system === 'sushi' ? Research[60] : system === 'jelly' ? Research[61] : null;
  return (row || []).map(function(v) { return Number(v); });
}
