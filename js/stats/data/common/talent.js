// ===== TALENT / CLASS DATA =====
import { TalentDescriptions, ClassFamilyBonuses, ClassAccountBonus, ClassPromotionChoices, ClassNames } from '../game/customlists.js';

// Build CLASS_TREES from ClassPromotionChoices: each class maps to its talent tab chain
// Walk backward (child -> parent) to build the inheritance chain for each class
var _parentOf = {};
for (var _ci = 0; _ci < ClassPromotionChoices.length; _ci++) {
  var _ch = ClassPromotionChoices[_ci];
  if (!_ch || _ch[0] === 'Na') continue;
  for (var _j = 0; _j < _ch.length; _j++) _parentOf[Number(_ch[_j])] = _ci;
}
// Journeyman(2) is a hidden branch from Beginner(1), not listed in CPC
_parentOf[2] = 1;
// Detect branch basics tabs: RAGE_BASICS(6), CALM_BASICS(18), SAVVY_BASICS(30)
// These sit at branchBase-1 for each main branch listed in CPC[1]
var _branchBasics = {};
var _branchBases = ClassPromotionChoices[1] || [];
for (var _bb = 0; _bb < _branchBases.length; _bb++) {
  var _base = Number(_branchBases[_bb]);
  if (ClassNames[_base - 1] && ClassNames[_base - 1].indexOf('BASICS') !== -1) {
    _branchBasics[_base] = _base - 1;
  }
}
export var CLASS_TREES = {};
for (var _ti = 0; _ti < ClassPromotionChoices.length; _ti++) {
  var _chain = [_ti];
  var _cur = _parentOf[_ti];
  while (_cur !== undefined) { _chain.unshift(_cur); _cur = _parentOf[_cur]; }
  // Main branches replace beginner(1) with the branch basics tab
  if (_chain[0] === 1 && _chain.length > 1 && _branchBasics[_chain[1]] !== undefined) {
    _chain[0] = _branchBasics[_chain[1]];
  }
  CLASS_TREES[_ti] = _chain;
}

// Generic talent params accessor
// tab: 1 (default) reads indices [0,1,2]; tab 2 reads indices [3,4,5]
export function talentParams(idx, tab) {
  var t = TalentDescriptions[idx]?.[1];
  if (!t) return null;
  if (tab === 2) {
    return (t[3] && t[5] && t[5] !== '_') ? { x1: Number(t[3]), x2: Number(t[4]), formula: t[5] } : null;
  }
  return { x1: Number(t[0]), x2: Number(t[1]), formula: t[2] };
}

// Generic family bonus accessor
export function familyBonusParams(idx) {
  var cfb = ClassFamilyBonuses[idx];
  if (!cfb) return null;
  var cab = ClassAccountBonus[idx];
  var lvOffset = cab ? Number(cab[1]) || 0 : 0;
  return { x1: Number(cfb[1]), x2: Number(cfb[2]), formula: cfb[3], lvOffset: lvOffset };
}

// Legacy named exports
export const FAMILY_BONUS_33 = familyBonusParams(33);
export const TALENT_144 = talentParams(144);
