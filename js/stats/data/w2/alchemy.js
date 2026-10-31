// ===== ALCHEMY DATA =====
import { AlchemyDescription, CauldronP2Wbonuses } from '../game/customlists.js';

export function cauldronPayToWinParams(group, index) {
  const row = CauldronP2Wbonuses[group]?.[index];
  if (!row) throw new Error('Unknown Alchemy pay-to-win bonus.');
  return { x1: Number(row[0]), x2: Number(row[1]), formula: row[2] };
}

export function bubbleParams(cauldron, idx) {
  var b = AlchemyDescription[cauldron]?.[idx];
  return b ? { cauldron: cauldron, index: idx, x1: Number(b[1]), x2: Number(b[2]), formula: b[3], name: b[0] } : null;
}

export function bubbleDefinitions() {
  return AlchemyDescription.slice(0, 4).flatMap((rows, cauldron) => rows.flatMap((row, index) =>
    !row || row[0] === 'BUBBLE' || row[0] === '_' || !row[3] || row[3] === '_' ? [] : [{
      cauldron, index, name: row[0], effect: row[15],
      prismaEligible: Number(row[10]) === 0,
    }]));
}

export function bubbleIngredients(cauldron, index) {
  const row = AlchemyDescription[cauldron]?.[index];
  if (!row) throw new Error('Unknown Alchemy bubble.');
  return Array.from({ length: 4 }, (_, slot) => ({
    slot, key: row[5 + slot], base: Number(row[11 + slot]),
  })).filter(ingredient => ingredient.key && ingredient.key !== 'Blank');
}
