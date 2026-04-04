// ===== GOLDEN FOOD DATA =====
import { ITEMS } from '../game/items.js';

// Golden foods with DR effect
export const GOLD_FOOD_DR = {};

// Emporium slot order (game UI layout, not in raw data)
export const EMPORIUM_FOOD_SLOTS = [
  'PeanutG', 'ButterBar', 'FoodG1', 'FoodG2', 'FoodG3', 'FoodG4', 'FoodG5',
  'FoodG6', 'FoodG7', 'FoodG8', 'FoodG9', 'FoodG10', 'FoodG11', 'FoodG12',
  'FoodG13', 'FoodG14', 'FoodG15',
];

// Build golden food info from item definitions
export const GOLD_FOOD_INFO = {};
for (const name of EMPORIUM_FOOD_SLOTS) {
  const item = ITEMS[name];
  if (!item) continue;
  GOLD_FOOD_INFO[name] = { effect: item.Effect, amount: item.Amount };
  if (item.Effect === 'DropRatez') GOLD_FOOD_DR[name] = item.Amount;
}
