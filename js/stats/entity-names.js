// ===== ENTITY NAMES — Data-driven label lookups =====
// Resolves entity IDs to readable "System: Name" labels.
// Two-tier: game data (primary) → hand-names fallback.
// label(system, id, suffix?) is the public API.

import { TalentIconNames, SigilDesc, UpgradeVault, GrimoireUpg, LegendTalents,
  ArtifactInfo, MarketExoticInfo, AtomInfo, CompassUpg, AlchemyDescription,
  MineheadUPG, SushiUPG, DreamUpg, ChipDesc, GamingPalette, StarSigns,
  RegAchieves, ArcadeShopInfo, ArcaneUpg, MealINFO,
  CompanionDB, BribeDescriptions, HolesInfo,
  CosmoUpgrades, PrayerInfo, ShrineInfo, GuildBonuses,
  PostOffUpgradeInfo, SpelunkUpg, EmperorBon, ZenithMarket,
  RANDOlist, StatueInfo, SaltLicks, DungPassiveStats, DungPassiveStats2,
  AlchemyVialItems, LabMainBonus } from './data/game/customlists.js';
import { NjEQ, IDforETCbonus } from './data/game/custommaps.js';
import { ITEMS } from './data/game/items.js';
import { MONSTERS } from './data/game/monsters.js';
import { RES_GRID_RAW, gridCoord } from './data/w7/research.js';
import { JEWEL_DESC } from './data/w4/lab.js';
import { ROG_DESC, KNOWLEDGE_CAT_DESC } from './data/w7/sushi.js';
import { FALLBACK_NAMES } from './data/common/hand-names.js';

function clean(s) {
  if (!s) return '';
  s = s.replace(/\u88FD.*$/, '').replace(/_/g, ' ').trim();
  var letters = s.replace(/[^A-Za-z]/g, '');
  if (letters.length > 0 && letters === letters.toUpperCase()) {
    s = s.replace(/\b[A-Za-z]+\b/g, function(w) {
      if (/^[IVXLCDM]+$/.test(w) && w.length <= 4) return w;
      if (w.length === 1) return w;
      return w[0] + w.slice(1).toLowerCase();
    });
  }
  return s;
}

// Strip leading bonus format chars: +{%, }_, etc.
function stripBonus(s) {
  if (!s) return '';
  return s.replace(/^\+?\{?%?\}?\s*/, '').replace(/_/g, ' ').trim();
}

// ===== Generic game-data lookup table =====
// Each entry: { data, field, transform? }
// Lookup: data[id] → data[id][field] (or data[id] if field is null) → clean()
// Systems not listed here use custom logic in CUSTOM below.
var GAME_DATA = {
  Talent:        { data: TalentIconNames, field: null },
  Sigil:         { data: SigilDesc, field: 0 },
  Vault:         { data: UpgradeVault, field: 0 },
  Grimoire:      { data: GrimoireUpg, field: 0 },
  Legend:         { data: LegendTalents, field: 0 },
  Artifact:       { data: ArtifactInfo, field: 0 },
  Exotic:         { data: MarketExoticInfo, field: 0 },
  Atom:           { data: AtomInfo, field: 0 },
  Compass:        { data: CompassUpg, field: 0 },
  Minehead:       { data: MineheadUPG, field: 0 },
  Sushi:          { data: SushiUPG, field: 0 },
  Dream:          { data: DreamUpg, field: 0 },
  Chip:           { data: ChipDesc, field: 0 },
  Palette:        { data: GamingPalette, field: 3 },
  'Star Sign':    { data: StarSigns, field: 0 },
  Achievement:    { data: RegAchieves, field: 0 },
  Arcane:         { data: ArcaneUpg, field: 0 },
  Meal:           { data: MealINFO, field: 0 },
  Bribe:          { data: BribeDescriptions, field: 0 },
  Prayer:         { data: PrayerInfo, field: 0 },
  Shrine:         { data: ShrineInfo, field: 0 },
  Guild:          { data: GuildBonuses, field: 0 },
  Spelunking:     { data: SpelunkUpg, field: 0 },
  Statue:         { data: StatueInfo, field: 0 },
  SaltLick:       { data: SaltLicks, field: 0 },
  Vial:           { data: AlchemyVialItems, field: null },
};

// Generic lookup: game data → fallback
function genericLookup(system, id) {
  var cfg = GAME_DATA[system];
  if (cfg) {
    var entry = cfg.data[id];
    if (entry != null) {
      var raw = cfg.field != null ? entry[cfg.field] : entry;
      var name = clean(raw);
      if (name) return name;
    }
  }
  // Fallback to hand-names
  var fb = FALLBACK_NAMES[system];
  return fb ? (fb[id] || '') : '';
}

// ===== Custom lookups for systems with non-standard data shapes =====
var CUSTOM = {
  'Minehead Floor': function(id) { return String(Number(id) + 1); },
  Pristine:    function(id) { var d = NjEQ['NjTrP' + id]; return d ? clean(d[2]) : ''; },
  Companion:   function(id) { var d = CompanionDB[id]; if (!d) return ''; var m = MONSTERS[d[0]]; return m ? clean(m.Name) : ''; },
  Card:        function(id) { var m = MONSTERS[id]; return m ? clean(m.Name) : ''; },
  Stamp:       function(id) { var d = ITEMS['Stamp' + id]; if (!d) return ''; return clean(d.displayName.replace(/\|.*$/, '')); },
  Item:        function(id) { var d = ITEMS[id]; if (!d) return ''; return clean(d.displayName.replace(/\|/g, ' ')); },
  Arcade:      function(id) { var d = ArcadeShopInfo[id]; return d ? stripBonus(clean(d[0])) : ''; },
  Mainframe:   function(id) {
    if (id < 100) { var d = LabMainBonus[id]; if (d) return clean(d[6]); }
    else { var j = JEWEL_DESC[id - 100]; if (j) return clean(j[3]); }
    return '';
  },
  Emperor:     function(id) { var d = EmperorBon[0] && EmperorBon[0][id]; return d ? stripBonus(d) : ''; },
  'Post Office': function(id) { var i = Array.isArray(id) ? id[0] : id; return clean(PostOffUpgradeInfo[i] && PostOffUpgradeInfo[i][0]); },
  Breeding:    function(id) { var s = RANDOlist[91] && RANDOlist[91][id]; return s ? stripBonus(s) : ''; },
  EtcBonus:    function(id) { var s = IDforETCbonus[id]; return s ? s.replace(/^[%_]+/, '').replace(/_/g, ' ').trim() : ''; },
  'Dungeon Perk': function(id) { var d = DungPassiveStats[id]; return d ? d[0].replace(/@/g, ' ') : ''; },
  'Flurbo Shop': function(id) { var d = DungPassiveStats2[id]; return d ? d[0].replace(/@/g, ' ') : ''; },
  'Zenith Market': function(id) { var d = ZenithMarket[id]; return d ? clean(d[0]) : ''; },
  RoG: function(id) {
    var d = ROG_DESC[id];
    if (!d) return '';
    return clean(d.replace(/[+{}^]/g, '').replace(/^\s*[%x]\s*/, ''));
  },
  Knowledge: function(id) {
    var d = KNOWLEDGE_CAT_DESC[id];
    if (!d) return '';
    return clean(d.replace(/[+{}^]/g, '').replace(/^\s*[%x]\s*/, ''));
  },
  Grid: function(id) {
    var d = RES_GRID_RAW[id];
    return d ? gridCoord(id) + ' ' + clean(d[0]) : '';
  },
  Gambit: function(id) {
    var e = HolesInfo[71] && HolesInfo[71][id];
    if (!e) return '';
    var parts = e.split('|');
    var s = parts[parts.length - 1];
    s = s.replace(/[\u4E00-\u9FFF\uF900-\uFAFF]+(\([^)]*\))?/g, '').replace(/^\+?\{?%?\}?\s*/, '');
    return clean(s);
  },
  Measurement: function(id) {
    var d = HolesInfo[54] && HolesInfo[54][id];
    if (!d) return '';
    return clean(d.replace(/[\u4E00-\u9FFF\uF900-\uFAFF]/g, '').replace(/\|/g, ' ').replace(/^\+?\{?%?\}?\s*/, ''));
  },
  Cosmo: function(id) {
    if (typeof id === 'string') {
      var p = id.split('/');
      var c = CosmoUpgrades[Number(p[0])];
      var u = c && c[Number(p[1])];
      return u ? clean(u[2]) : '';
    }
    return '';
  },
  Bubble: function(id) {
    var c, idx;
    if (typeof id === 'string') {
      c = 'OGPY'.indexOf(id[0]); idx = Number(id.slice(1));
    } else if (Array.isArray(id)) {
      c = id[0]; idx = id[1];
    } else return '';
    if (c < 0) return '';
    var d = AlchemyDescription[c] && AlchemyDescription[c][idx];
    return d ? clean(d[0]) : '';
  },
};

// ===== Public API =====

export function entityName(system, id) {
  // Custom lookup first (handles non-standard data shapes)
  var customFn = CUSTOM[system];
  if (customFn) {
    var result = customFn(id);
    if (result) return result;
    // Fall through to hand-names
    var fb = FALLBACK_NAMES[system];
    return fb ? (fb[id] || '') : '';
  }
  // Generic: game data → hand-names fallback
  return genericLookup(system, id);
}

export function label(system, id, suffix) {
  var name = entityName(system, id);
  if (!name) return system + ' ' + (Array.isArray(id) ? id.join(',') : id) + (suffix || '');
  return system + ': ' + name + (suffix || '');
}
