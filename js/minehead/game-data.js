// Depth Charge (Minehead) — static game data extracted from N.formatted.js
// MineheadUPG[i] = [Name, MaxLv, CostExponent, BonusPerLv, flag, Description]
// flag is always 0; MaxLv 9999 means effectively uncapped.
export const MINEHEAD_UPG = [
  /*  0 */ { name:'Base_Damage_I',            maxLv:9999,  costExp:1.10,     bonus:1,   desc:'Boosts base damage by +{' },
  /*  1 */ { name:'Numbahs',                  maxLv:17,    costExp:6,        bonus:1,   desc:'Max tile number up to $! Multi for damage' },
  /*  2 */ { name:'Grid_Expansion',            maxLv:16,    costExp:7.5,      bonus:1,   desc:'Expands the grid' },
  /*  3 */ { name:'Bettah_Numbahs',            maxLv:9999,  costExp:1.15,     bonus:10,  desc:'Bigger tile number odds }x' },
  /*  4 */ { name:'Mega_Damage_I',             maxLv:9999,  costExp:1.12,     bonus:5,   desc:'+{%  permanent damage' },
  /*  5 */ { name:'Miney_Farmey_I',            maxLv:9999,  costExp:1.10,     bonus:10,  desc:'+{%  mine currency/hr' },
  /*  6 */ { name:'Extra_Lives',               maxLv:7,     costExp:250,      bonus:1,   desc:'+1 extra life per level' },
  /*  7 */ { name:'Base_Damage_II',            maxLv:9999,  costExp:1.10,     bonus:3,   desc:'Boosts base damage by +{' },
  /*  8 */ { name:'Golden_Tiles',              maxLv:16,    costExp:8,        bonus:1,   desc:'{ guaranteed-safe tiles per game' },
  /*  9 */ { name:'Big_Hit_Combos',            maxLv:9999,  costExp:1.30,     bonus:1,   desc:'+{%  dmg per tile revealed (per turn)' },
  /* 10 */ { name:'Boom_Blocker',              maxLv:2,     costExp:1e9,      bonus:1,   desc:'+{ blocks at start' },
  /* 11 */ { name:'Final_Round_Fury',          maxLv:9999,  costExp:1.30,     bonus:2,   desc:'}x  dmg on last life' },
  /* 12 */ { name:'Multiplier_Madness',        maxLv:10,    costExp:35,       bonus:1,   desc:'Unlocks multiplier tiles, up to $' },
  /* 13 */ { name:'Moar_Multis',               maxLv:9999,  costExp:1.15,     bonus:6,   desc:'Bigger multi tile odds }x' },
  /* 14 */ { name:'Triple_Crown_Hunter',       maxLv:250,   costExp:1.16,     bonus:1,   desc:'Blue Crown tiles, triple = $x multi' },
  /* 15 */ { name:'Crown_Craze',               maxLv:100,   costExp:1.40,     bonus:1,   desc:'Blue Crown odds }x' },
  /* 16 */ { name:'Legal_Cheating',            maxLv:20,    costExp:6,        bonus:1,   desc:'{ reveal-mine uses, 25% chance to break' },
  /* 17 */ { name:'Awesome_Additives',         maxLv:10,    costExp:35,       bonus:1,   desc:'Unlocks additive tiles, up to $' },
  /* 18 */ { name:'Always_Adding',             maxLv:9999,  costExp:1.15,     bonus:5,   desc:'Bigger additive tile odds }x' },
  /* 19 */ { name:'Clutch_Overtime_Block',     maxLv:1,     costExp:1e5,      bonus:1,   desc:'+{ block on last life' },
  /* 20 */ { name:'Classic_Flags',             maxLv:8,     costExp:500,      bonus:1,   desc:'{ flags (show adjacent mine count)' },
  /* 21 */ { name:'Mega_Damage_II',            maxLv:9999,  costExp:1.10,     bonus:20,  desc:'+{%  permanent damage' },
  /* 22 */ { name:'Miney_Farmey_II',           maxLv:9999,  costExp:1.15,     bonus:15,  desc:'+{%  mine currency/hr' },
  /* 23 */ { name:'Jackpot_Time',              maxLv:9999,  costExp:1.14,     bonus:1,   desc:'Jackpot tile odds — 1 in $' },
  /* 24 */ { name:'Record_Breaking_Jackpots',  maxLv:6,     costExp:1000,     bonus:1,   desc:'Jackpots reveal $ tiles' },
  /* 25 */ { name:'Base_Damage_III',           maxLv:9999,  costExp:1.10,     bonus:12,  desc:'Boosts base damage by +{' },
  /* 26 */ { name:'El_Cheapo',                 maxLv:9999,  costExp:1.15,     bonus:1,   desc:'All upgrades $% cheaper' },
  /* 27 */ { name:'Mega_Damage_III',           maxLv:9999,  costExp:1.12,     bonus:50,  desc:'+{%  permanent damage' },
  /* 28 */ { name:'Miney_Damagey_Synergy',     maxLv:9999,  costExp:1.25,     bonus:2,   desc:'Synergy with highest damage' },
  /* 29 */ { name:'Rift_Guy',                  maxLv:0,     costExp:9999999,  bonus:1,   desc:'Rift Guy upgrade (unusable)' },
];

// Depth Charge grid dimensions per Grid_Expansion level (Research[9]).
// Index = upgrade level of upg #2 (Grid_Expansion). Value = "cols,rows".
export const GRID_DIMS = [
  '3,3','4,3','5,3','4,4','6,3','5,4','6,4','7,4',
  '6,5','7,5','8,5','9,5','10,5','9,6','10,6','11,6','12,6',
];

// Tile multipliers for "multiplier" tiles (values 20–29).
// Index = (tileValue - 20). E.g. tileValue 20 → 1.2x, 21 → 1.4x, etc.
export const TILE_MULTIPLIERS = [1.2, 1.4, 1.6, 2.0, 3, 4, 5, 6, 7, 8, 1, 1, 1, 1];

// Minehead floor-reward unlock order (Research[10]).
// Index = floor number. Value = MineheadUPG index whose reward unlocks at that floor.
export const MINEHEAD_UNLOCK_ORDER = [20,3,19,16,21,17,1,12,14,26,8,2,13,9,28,5,15,10,7,24,0,6,18,4,22,11,23,25,27,29,30,31];

// Minehead cosmetic names per head (Research[11]).
export const MINEHEAD_NAMES = [
  'Brainhead','Basshead','Goldhead','Gemhead','Baldhead','Screamhead',
  'Brainhead','Blindhead','Clownhead','Ironhead','Grosshead','Stouthead',
  'Kelphead','Maizehead','Snouthead','Ballhead','Sashimihead','Saturnhead',
  'Leopahead','Yarnhead','Bronzehead','Bleckhead','Royalhead','Chillhead',
  'Detahead','Summerhead','Threadhead','Tentahead','Purrhead','Humungohead',
  'Mr_Minehead','Boghead',
];

// Floor reward descriptions (Research[19]).
// BonusQTY(t, 99) always returns the value; BonusQTY(t, i) returns 0 if floor <= t.
export const FLOOR_REWARD_DESC = [
  '}x Total Damage and }x Drop Rate!',
  '+{%  AFK gains for Research!',
  '+{ new Research Magnifier!',
  'Increases Max LV of Blooming Axe by +{',
  '+{%  Damage per Weapon POW',
  'All Bubba upgrades }x cheaper',
  'Multiplies Minehead Currency by }x',
  'Unlock Atom for Atom Collider (minehead currency)',
  '+{ weekly Exotic Market purchases',
  '+{ Max LVs for blessing upgrades',
  '+{%  extra AFK gains for research',
  'Slime cube related',
  '+{ new Magnifier!',
  '+{ LVs for Grind Time bubble daily',
  '+{%  grand discovery chance per Spelunking LV',
  '+{ daily bubble LVs from Kattlekruk',
  'Trapping bonus from Magnesium Atom +{ extra days',
  '}x higher chance to grow Chemical Plants',
  '+{ Trimmed Construction Slot',
  '}x extra Monument AFK Hours',
  '+{ new Magnifier!',
  '+{%  Hat Rack bonus multi',
  '}x daily amber gains from Biggest Hauls',
  'Nothing... yet...',  // 23
  'Nothing... yet...',  // 24
  'Nothing... yet...',  // 25
  'Nothing... yet...',  // 26
  'Nothing... yet...',  // 27
  'Nothing... yet...',  // 28
  'Nothing... yet...',  // 29
  'Nothing... yet...',  // 30
  'Nothing... yet...',  // 31
];

// Floor reward values (Research[20]) — same data as MINEHEAD_BONUS_QTY in game-data.js.
export const FLOOR_REWARD_QTY = [10,2,1,40,1,100,50,1,2,80,3,11,1,30,2,10,20,5,1,25,1,2,50,23,24,25,26,27,28,29,30,31];

// Server variable defaults (from getServerVarLoad).
// In practice these can change server-side; 1 is the safe default.
export const SERVER_VAR_DEFAULTS = {
  A_MineCost: 1.01,
  A_MineHP:   1.01,
};
