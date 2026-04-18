import { CompanionDB } from '../game/customlists.js';

// ===== COMPANION DATA =====
// When adding a new companion bonus to a formula, update:
//  1. CompanionDB in data/game/customlists.js (raw game data)
//  2. The descriptor(s) that use it (defs/drop-rate.js, defs/coin-multi.js, etc.)
//     - For pool-based descs: add { system: 'companion', id: N } or { system: 'compMulti', id: N, args: [cap] }
//     - For combine-based descs: add the companion call in combine()
//  3. Any sub-system that references it (e.g. systems/w7/meritoc.js, defs/voting-multi.js)
//  4. entity-names.js if a display name is needed
export function companionBonus(idx) { return Number(CompanionDB[idx]?.[2]) || 0; }
