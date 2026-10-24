import { ChipDesc } from '../game/customlists.js';
import { GALLERY_TROPH_CHIP_MULTI } from '../game-constants.js';

// ===== CHIP DATA =====
// ChipDesc[idx][11] = bonus value for chip type idx
export function chipBonusValue(idx) { return Number(ChipDesc[idx]?.[11]) || 0; }

// The native Lab tooltip overrides the base table for chips 15/16 (AE548).
export function chipDescription(idx) {
  const row = ChipDesc[idx];
  if (!Array.isArray(row)) return null;
  const clean = value => String(value).replace(/[_|]/g, ' ').replace(/\*/g, '').replace(/\s+/g, ' ').trim();
  let description = clean(row[1].replace('{', String(chipBonusValue(idx))));
  let summary = clean(row[2]);
  if (Number(idx) === 15) {
    description = 'Doubles the bonuses of active Star Signs. With Infinite Star Signs unlocked, doubles the bonuses of all Infinite Star Signs. Can only equip 1 per player.';
    summary = 'Bolsters active and Infinite Star Signs';
  } else if (Number(idx) === 16) {
    description = 'With Gallery active: +' + (GALLERY_TROPH_CHIP_MULTI / 100).toFixed(2) +
      'x Gallery Bonus Multi (adds ' + GALLERY_TROPH_CHIP_MULTI + ' percentage points to its bonus pool), affecting Gallery trophies and nametags. ' +
      'Before Gallery: doubles MISC bonuses of the currently equipped trophy. Can only equip 1 per player.';
    summary = 'Bolsters Gallery bonuses; doubles equipped trophy MISC bonuses before Gallery';
  }
  return { name: clean(row[0]), description, summary };
}
