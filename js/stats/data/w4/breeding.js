import { PetStats as _PetStats, RANDOlist } from '../game/customlists.js';
import { MONSTERS } from '../game/monsters.js';

// ===== BREEDING DATA =====
// Derived from PetStats + RANDOlist[90-92] + MONSTERS

// [world][pet] = [spriteId, shinyTypeIdx]
export const PET_STATS = _PetStats.map(world =>
  world.map(p => [p[0], Number(p[5])])
);

// [world][pet] = display name
export const PET_NAMES = _PetStats.map(world =>
  world.map(p => (MONSTERS[p[0]] ? MONSTERS[p[0]].Name : p[0]).replace(/_/g, ' '))
);

// [world][pet] = shinyTypeIdx
export const PET_SHINY_TYPE = _PetStats.map(world =>
  world.map(p => Number(p[5]))
);

// RANDOlist[90]: shinyTypeIdx -> category
export const SHINY_TYPE_TO_CAT = RANDOlist[90].map(Number);

// RANDOlist[91]: shiny category display names
export const SHINY_CAT_NAMES = RANDOlist[91].map(s => s.replace(/_/g, ' '));

// RANDOlist[92]: bonus per shiny level per category
export const SHINY_CAT_BONUS_PER_LV = RANDOlist[92].map(Number);

// Derived: bonus per shiny level indexed by shinyTypeIdx
export const SHINY_BONUS_PER_LV = SHINY_TYPE_TO_CAT.map(cat => SHINY_CAT_BONUS_PER_LV[cat]);