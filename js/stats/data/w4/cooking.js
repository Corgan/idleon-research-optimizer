import { RANDOlist } from '../game/customlists.js';

export function cookingSpiceRecipes() {
  return RANDOlist[49].map(Number);
}

export function cookingRecipeRollChance(slot) {
  const value = RANDOlist[50][slot];
  if (value == null || !Number.isFinite(Number(value)))
    throw new Error('Cooking recipe roll chance is unavailable.');
  return Number(value);
}
