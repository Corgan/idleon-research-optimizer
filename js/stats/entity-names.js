// ===== ENTITY NAMES — Data-driven label lookups =====
// Resolves entity IDs to readable "System: Name" labels from game data.
// Falls back to "System ID" when no name is found.

import { TalentIconNames, SigilDesc, UpgradeVault, GrimoireUpg, LegendTalents,
  ArtifactInfo, MarketExoticInfo, AtomInfo, CompassUpg, AlchemyDescription,
  MineheadUPG, SushiUPG, DreamUpg, ChipDesc, GamingPalette, StarSigns,
  RegAchieves, ArcadeShopInfo, ArcaneUpg, MealINFO,
  CompanionDB, BribeDescriptions, HolesInfo,
  CosmoUpgrades, PrayerInfo, ShrineInfo, GuildBonuses,
  PostOffUpgradeInfo, SpelunkUpg, EmperorBon,
  RANDOlist, StatueInfo, SaltLicks, DungPassiveStats, DungPassiveStats2,
  AlchemyVialItems, LabMainBonus } from './data/game/customlists.js';
import { NjEQ, IDforETCbonus } from './data/game/custommaps.js';
import { ITEMS } from './data/game/items.js';
import { MONSTERS } from './data/game/monsters.js';
import { RES_GRID_RAW, gridCoord } from './data/w7/research.js';
import { JEWEL_DESC } from './data/w4/lab.js';
import { MERITOC_NAMES, WIN_BONUS_NAMES, VOTING_NAMES,
  FAMILY_NAMES, SUPER_BIT_NAMES, CARD_TYPE_NAMES, CARD_SET_NAMES,
  OLA_NAMES, TOME_NAMES, CAVERN_NAMES, SET_NAMES,
  FARMING_NAMES } from './data/common/hand-names.js';

function clean(s) {
  if (!s) return '';
  s = s.replace(/\u88FD.*$/, '').replace(/_/g, ' ').trim();
  // Title-case all-caps names (talents, sigils, exotics)
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

// Companion display names: CompanionDB[id][0] is a sprite ID, MONSTERS[sprite].Name is the display name

// Systems without data exports
var EVENT_SHOP_NAMES = { 18: 'Plant Evo', 23: 'Isotope Discovery', 30: 'Snail Omega' };
var CLAMWORK_NAMES = { 3: 'Bubba Boon', 7: '2nd Slice' };
var KILLROY_NAMES = { 3: 'Mastery Loot', 5: 'Research EXP' };

var LOOKUPS = {
  Talent:      function(id) { return clean(TalentIconNames[id]); },
  Sigil:       function(id) { return clean(SigilDesc[id] && SigilDesc[id][0]); },
  Vault:       function(id) { return clean(UpgradeVault[id] && UpgradeVault[id][0]); },
  Grimoire:    function(id) { return clean(GrimoireUpg[id] && GrimoireUpg[id][0]); },
  Legend:      function(id) { return clean(LegendTalents[id] && LegendTalents[id][0]); },
  Artifact:    function(id) { return clean(ArtifactInfo[id] && ArtifactInfo[id][0]); },
  Exotic:      function(id) { return clean(MarketExoticInfo[id] && MarketExoticInfo[id][0]); },
  Atom:        function(id) { return clean(AtomInfo[id] && AtomInfo[id][0]); },
  Compass:     function(id) { return clean(CompassUpg[id] && CompassUpg[id][0]); },
  Minehead:    function(id) { return clean(MineheadUPG[id] && MineheadUPG[id][0]); },
  'Minehead Floor': function(id) { return String(Number(id) + 1); },
  Sushi:       function(id) { return clean(SushiUPG[id] && SushiUPG[id][0]); },
  Dream:       function(id) { return clean(DreamUpg[id] && DreamUpg[id][0]); },
  Chip:        function(id) { return clean(ChipDesc[id] && ChipDesc[id][0]); },
  Palette:     function(id) { return clean(GamingPalette[id] && GamingPalette[id][3]); },
  'Star Sign': function(id) { return clean(StarSigns[id] && StarSigns[id][0]); },
  Achievement: function(id) { return clean(RegAchieves[id] && RegAchieves[id][0]); },
  Pristine:    function(id) { var d = NjEQ['NjTrP' + id]; return d ? clean(d[2]) : ''; },
  Companion:   function(id) { var d = CompanionDB[id]; if (!d) return ''; var m = MONSTERS[d[0]]; return m ? clean(m.Name) : ''; },
  Card:        function(id) { var m = MONSTERS[id]; return m ? clean(m.Name) : ''; },
  'Card Type': function(id) { return CARD_TYPE_NAMES[id] || ''; },
  'Card Set':  function(id) { return CARD_SET_NAMES[id] || ''; },
  Ola:         function(id) { return OLA_NAMES[id] || ''; },
  Stamp:       function(id) { var d = ITEMS['Stamp' + id]; if (!d) return ''; var n = d.displayName.replace(/\|.*$/, ''); return clean(n); },
  Item:        function(id) { var d = ITEMS[id]; if (!d) return ''; return clean(d.displayName.replace(/\|/g, ' ')); },
  Event:       function(id) { return EVENT_SHOP_NAMES[id] || ''; },
  ClamWork:    function(id) { return CLAMWORK_NAMES[id] || ''; },
  Killroy:     function(id) { return KILLROY_NAMES[id] || ''; },
  Arcade:      function(id) { var d = ArcadeShopInfo[id]; return d ? clean(d[0]).replace(/^\+?\{?%?\s*/, '') : ''; },
  Arcane:      function(id) { return clean(ArcaneUpg[id] && ArcaneUpg[id][0]); },
  Meal:        function(id) { return clean(MealINFO[id] && MealINFO[id][0]); },
  Meritoc:     function(id) { return MERITOC_NAMES[id] || ''; },
  Mainframe:   function(id) {
    if (id < 100) { var d = LabMainBonus[id]; return d ? clean(d[6]) : ''; }
    var ji = id - 100; var j = JEWEL_DESC[ji]; return j ? clean(j[3]) : '';
  },
  WinBonus:    function(id) { return WIN_BONUS_NAMES[id] || ''; },
  Voting:      function(id) { return VOTING_NAMES[id] || ''; },
  Family:      function(id) { return FAMILY_NAMES[id] || ''; },
  'Super Bit': function(id) { return SUPER_BIT_NAMES[id] || ''; },
  Bribe:       function(id) { return clean(BribeDescriptions[id] && BribeDescriptions[id][0]); },
  Prayer:      function(id) { return clean(PrayerInfo[id] && PrayerInfo[id][0]); },
  Shrine:      function(id) { return clean(ShrineInfo[id] && ShrineInfo[id][0]); },
  Guild:       function(id) { return clean(GuildBonuses[id] && GuildBonuses[id][0]); },
  'Post Office': function(id) { var i = Array.isArray(id) ? id[0] : id; return clean(PostOffUpgradeInfo[i] && PostOffUpgradeInfo[i][0]); },
  Spelunking:  function(id) { return clean(SpelunkUpg[id] && SpelunkUpg[id][0]); },
  Emperor:     function(id) { var d = EmperorBon[0] && EmperorBon[0][id]; if (!d) return ''; return d.replace(/^\+?\{?%?\}?\s*/, '').replace(/_/g, ' ').trim(); },
  Tome:        function(id) { return TOME_NAMES[id] || ''; },
  Cavern:      function(id) { return CAVERN_NAMES[id] || ''; },
  Smithing:    function(id) { return SET_NAMES[id] || ''; },
  Farming:     function(id) { return FARMING_NAMES[id] || ''; },
  Summoning:   function(id) { return WIN_BONUS_NAMES[id] || ''; },
  Breeding:    function(id) { var s = RANDOlist[91] && RANDOlist[91][id]; if (!s) return ''; return s.replace(/^\+?\{?%?\s*/, '').replace(/_/g, ' ').trim(); },
  Statue:      function(id) { var d = StatueInfo[id]; return d ? clean(d[0]) : ''; },
  SaltLick:    function(id) { var d = SaltLicks[id]; return d ? clean(d[0]) : ''; },
  EtcBonus:    function(id) { var s = IDforETCbonus[id]; if (!s) return ''; return s.replace(/^[%_]+/, '').replace(/_/g, ' ').trim(); },
  'Dungeon Perk': function(id) { var d = DungPassiveStats[id]; return d ? d[0].replace(/@/g, ' ') : ''; },
  'Flurbo Shop': function(id) { var d = DungPassiveStats2[id]; return d ? d[0].replace(/@/g, ' ') : ''; },
  Vial:        function(id) { return clean(AlchemyVialItems[id]); },
  Grid: function(id) {
    var d = RES_GRID_RAW[id];
    if (!d) return '';
    return gridCoord(id) + ' ' + clean(d[0]);
  },
  Gambit: function(id) {
    var e = HolesInfo[71] && HolesInfo[71][id];
    if (!e) return '';
    var parts = e.split('|');
    var s = parts[parts.length - 1];
    // Strip CJK chars, parenthesized text, and leading +{%_ / }_ / {_ etc
    s = s.replace(/[\u4E00-\u9FFF\uF900-\uFAFF]+(\([^)]*\))?/g, '').replace(/^\+?\{?%?\}?\s*/, '');
    return clean(s);
  },
  Measurement: function(id) {
    var d = HolesInfo[54] && HolesInfo[54][id];
    if (!d) return '';
    // Strip CJK chars, replace | with space, strip leading +{%_ / }_ etc
    var s = d.replace(/[\u4E00-\u9FFF\uF900-\uFAFF]/g, '').replace(/\|/g, ' ').replace(/^\+?\{?%?\}?\s*/, '');
    return clean(s);
  },
  Cosmo: function(id) {
    // id is 'X/Y' string for CosmoUpgrades[X][Y]
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

export function entityName(system, id) {
  var fn = LOOKUPS[system];
  return fn ? fn(id) : '';
}

export function label(system, id, suffix) {
  var name = entityName(system, id);
  if (!name) return system + ' ' + (Array.isArray(id) ? id.join(',') : id) + (suffix || '');
  return system + ': ' + name + (suffix || '');
}
