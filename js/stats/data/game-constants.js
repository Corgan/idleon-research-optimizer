// ===== GAME LOGIC CONSTANTS =====
// Values hardcoded in game function bodies (N.formatted.js), NOT in data tables.
// When the game updates, check these against the new source.
//
// Each constant includes a comment with the game source reference.

// Owl summoning: per-owl base multiplier (OwlBonus function, 6 owls)
// Game: OwlBonus[0]=5*f, [1]=10*f, [2]=2*f, [3]=4*f, [4]=1*f, [5]=2*f
export var OWL_BASE = [5, 10, 2, 4, 1, 2];

// Divinity minor bonus denominator (decay constant in Arctis formula)
// Game: divLv / (60 + divLv) * multiplier
export var DIVINITY_MINOR_DENOM = 60;

// Arcane upgrade indices that skip the mastery multiplier (ArcaneUpgBONUS)
// Game: inline chain 3==t||7==t||8==t||...
export var ARCANE_NO_MULTI = new Set([3, 7, 8, 10, 13, 16, 20, 25, 26, 28, 33, 35, 39, 40, 43, 45, 48, 57, 58]);

// Grimoire upgrade indices that skip the mastery multiplier (GrimoireUpgBONUS)
// Game: inline chain 9==t||11==t||17==t||...
export var GRIMOIRE_NO_MULTI = new Set([9, 11, 17, 26, 32, 36, 39, 45]);

// Vault upgrade indices that return lv*perLv WITHOUT mastery (VaultUpgBONUS)
// Game: inline chain 32==t||1==t||6==t||...
export var VAULT_NO_MASTERY = new Set([32, 1, 6, 7, 8, 9, 13, 999, 33, 36, 40, 42, 43, 44, 49, 51, 52, 53, 57, 61, 89, 64, 70, 73, 74, 76, 79, 85, 86, 88]);

// Tome bonus formula parameters per tome index (TomeBonus function)
// Game: each tome has unique hardcoded base/threshold/divisor/exp
export var TOME_DATA = {
  0: { unlockType: 'always', unlockIdx: 0, threshold: 0, divisor: 100, base: 10, exp: 0.7 },
  1: { unlockType: 'ola', unlockIdx: 196, threshold: 4000, divisor: 100, base: 4, exp: 0.7 },
  2: { unlockType: 'ola', unlockIdx: 197, threshold: 8000, divisor: 100, base: 2, exp: 0.7 },
  6: { unlockType: 'eventShop', unlockIdx: 0, threshold: 0, divisor: 1000, base: 4, exp: 0.4 },
  7: { unlockType: 'eventShop', unlockIdx: 27, threshold: 0, divisor: 1000, base: 3, exp: 0.3 },
};

// Cavern upgrade multipliers (B_UPG function)
// Game: 46==t?5*Holes[11][26], 47==t?25*Holes[11][27], 48==t?10*Holes[11][28]
// For 82-84: caller passes i param (20 for DR context)
export var HOLE_MULTIPLIERS = {
  upg46:   { buildIdx: 46, dataIdx: 26, multi: 5 },
  upg82:   { buildIdx: 82, dataIdx: 55, multi: 20 },
  brass20: { buildIdx: 20, dataIdx: 14, multi: 5 },
};

// Companion flag bonus values (CompanionDB[idx][2]=1 is boolean, NOT the bonus)
// Game: each companion's actual multiplier is hardcoded at the call site
export var COMPANION_BONUS = {
  0: 15,   // 15 * Companions(0) * CosmoBonusQTY(2,0) in AllStatPCT
  27: 2,   // 2x arcade multiplier
  30: 2,   // 2x friend multiplier
  88: 50,  // 50 * Companions(88) in PrismaBonusMult
  153: 20, // 20 * Companions(153) in AFK gains
};

// Boss3B card shrine bonus: 5% per card level
// Game: (1 + 5 * CardLv("Boss3B") / 100)
export var BOSS3B_CARD_PCT = 5;

// Gallery trophy chip multiplier
// Game: 10 * chipBonuses("troph") in GalleryBonusMulti
export var GALLERY_TROPH_CHIP_MULTI = 10;

// Friend bonus formula constants for type 3 (DR)
// Game: 25 * min(1, 0.2 + min(12000, i) / (min(12000, i) + 3000))
export var FRIEND_DR = { scale: 25, base: 0.2, half: 3000, cap: 12000 };

// DR dream coefficient: flat DR% from Equinox Symbols dream level
// Game: 5 * Dream[10] in Drop_Rarity formula
export var DR_DREAM_COEFF = 5;
