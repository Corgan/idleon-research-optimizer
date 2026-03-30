// ===== ALCHEMY SYSTEM (W2) =====
// Alchemy bubble bonuses and sigil bonuses.

import { node } from '../../node.js';
import { cauldronInfoData, optionsListData } from '../../../save/data.js';
import { formulaEval } from '../../../save/engine.js';
import { sigilBonus as _sigilBonus } from '../common/goldenFood.js';
import { S } from '../../../state.js';
import { arcaneUpgBonus } from '../mc/tesseract.js';
import { arcadeBonus } from './arcade.js';
import { legendPTSbonus } from '../w7/spelunking.js';
import { PALETTE_28, EXOTIC_48, SIGIL_BONUS } from '../../../game-data.js';

// Number2Letter: cauldron index → letter used in prisma encoding
// Game's Number2Letter maps: 0→'_', 1→'a', 2→'b', 3→'c'
var CAULDRON_LETTER = ['_','a','b','c'];

var BUBBLE_DATA = {
  DROPPIN_LOADS: { cauldron: 3, index: 1, x1: 40, x2: 70, formula: 'decay', name: 'Droppin Loads' },
};

// Game: OptionsListAccount[384] encodes prisma'd bubbles as e.g. "d1,d5,a3,"
// Check: does the string contain letter + bubbleIndex + ","
function isBubblePrismad(cauldron, bubbleIdx) {
  var prismaStr = String(optionsListData && optionsListData[384] || '');
  var letter = CAULDRON_LETTER[cauldron] || '';
  return prismaStr.indexOf(letter + Math.round(bubbleIdx) + ',') !== -1;
}

// PrismaBonusMult: Math.min(4, 2 + (ArcaneUpg(45) + Arcade(54) + HaveW6Trophy + Palette(28)
//   + 0.2*TotalPurpleSigils + ExoticBonusQTY(48) + LegendPTS(36) + 50*Companions(88)) / 100)
function getPrismaBonusMult() {
  var arcane45 = arcaneUpgBonus(45);     // flat index → raw level value
  var arcade54 = arcadeBonus(54);
  // HaveW6Trophy: Cards[1] contains "Trophy23" → 10, else 0
  var cards1 = S.cards1Data || [];
  var hasW6Trophy = (Array.isArray(cards1) ? cards1.indexOf('Trophy23') >= 0
    : JSON.stringify(cards1).indexOf('Trophy23') >= 0) ? 10 : 0;
  // PaletteBonus(28): decay formula lv/(lv+25)*base, then ×legendMulti ×loreMulti
  var palLv = Number((S.spelunkData && S.spelunkData[9] && S.spelunkData[9][28]) || 0);
  var palRaw = palLv > 0 ? palLv / (palLv + PALETTE_28.denom) * PALETTE_28.base : 0;
  var palLegendMulti = 1 + legendPTSbonus(10) / 100;
  var loreFlag8 = Number((S.spelunkData && S.spelunkData[0] && S.spelunkData[0][8]) || 0) >= 1 ? 1 : 0;
  var palLoreMulti = 1 + 0.5 * loreFlag8;
  var palette28 = palRaw * palLegendMulti * palLoreMulti;
  // TotalPurpleSigils: count sigils at level >= 3 in CauldronP2W[4]
  var purpleSigils = 0;
  var sigArr = S.cauldronP2WData && S.cauldronP2WData[4];
  if (sigArr) {
    for (var si = 0; si < 24; si++) {
      if (Number(sigArr[1 + 2 * si]) >= 3) purpleSigils++;
    }
  }
  // ExoticBonusQTY(48): decay = base * lv / (denom + lv)
  var exLv = Number((S.farmUpgData && S.farmUpgData[EXOTIC_48.farmSlot]) || 0);
  var exotic48 = exLv > 0 ? EXOTIC_48.base * exLv / (EXOTIC_48.denom + exLv) : 0;
  // LegendPTS_bonus(36) = Spelunk[18][36] * 3
  var legend36 = legendPTSbonus(36);
  // Companions(88) = rift4 companion: +50% Prisma Bubble bonus multi
  var comp88 = S.companionIds && S.companionIds.has(88) ? 1 : 0;
  var sum = arcane45 + arcade54 + hasW6Trophy + palette28
    + 0.2 * purpleSigils + exotic48 + legend36 + 50 * comp88;
  return Math.min(4, 2 + sum / 100);
}

var SIGIL_NAMES = {
  11: 'Trove Sigil',
};

export { isBubblePrismad, getPrismaBonusMult };

export var alchemy = {
  resolve: function(id, ctx) {
    var data = BUBBLE_DATA[id];
    if (!data) return node('Bubble ' + id, 0, null, { note: 'bubble ' + id });
    var lv = Number((cauldronInfoData && cauldronInfoData[data.cauldron] && cauldronInfoData[data.cauldron][data.index]) || 0);
    if (lv <= 0) return node(data.name, 0, null, { note: 'bubble ' + id });
    var baseVal = formulaEval(data.formula, data.x1, data.x2, lv);
    var isPrisma = isBubblePrismad(data.cauldron, data.index);
    var prismaMult = isPrisma ? Math.max(1, getPrismaBonusMult()) : 1;
    var val = baseVal * prismaMult;
    var children = [
      node('Bubble Level', lv, null, { fmt: 'raw' }),
      node('Base Value', baseVal, null, { fmt: 'raw' }),
    ];
    if (isPrisma) {
      // Build prisma sub-breakdown
      var arcane45 = arcaneUpgBonus(45);
      var arcade54val = arcadeBonus(54);
      var cards1 = S.cards1Data || [];
      var hasW6Trophy = (Array.isArray(cards1) ? cards1.indexOf('Trophy23') >= 0
        : JSON.stringify(cards1).indexOf('Trophy23') >= 0) ? 10 : 0;
      var palLv = Number((S.spelunkData && S.spelunkData[9] && S.spelunkData[9][28]) || 0);
      var palRaw = palLv > 0 ? palLv / (palLv + PALETTE_28.denom) * PALETTE_28.base : 0;
      var palLegendMulti = 1 + legendPTSbonus(10) / 100;
      var loreFlag8 = Number((S.spelunkData && S.spelunkData[0] && S.spelunkData[0][8]) || 0) >= 1 ? 1 : 0;
      var palLoreMulti = 1 + 0.5 * loreFlag8;
      var palette28 = palRaw * palLegendMulti * palLoreMulti;
      var purpleSigils = 0;
      var sigArr = S.cauldronP2WData && S.cauldronP2WData[4];
      if (sigArr) { for (var si = 0; si < 24; si++) { if (Number(sigArr[1 + 2 * si]) >= 3) purpleSigils++; } }
      var exLv = Number((S.farmUpgData && S.farmUpgData[EXOTIC_48.farmSlot]) || 0);
      var exotic48 = exLv > 0 ? EXOTIC_48.base * exLv / (EXOTIC_48.denom + exLv) : 0;
      var legend36 = legendPTSbonus(36);
      var comp88 = S.companionIds && S.companionIds.has(88) ? 1 : 0;

      children.push(node('Prisma Bonus', prismaMult, [
        node('Arcane 45', arcane45, null, { fmt: 'raw' }),
        node('Arcade 54', arcade54val, null, { fmt: 'raw' }),
        node('W6 Trophy', hasW6Trophy, null, { fmt: 'raw' }),
        node('Palette 28', palette28, palLv > 0 ? [
          node('Palette Lv', palLv, null, { fmt: 'raw' }),
          node('Legend 10 ×', palLegendMulti, null, { fmt: 'x' }),
          node('Lore ×', palLoreMulti, null, { fmt: 'x' }),
        ] : null, { fmt: 'raw' }),
        node('Purple Sigils × 0.2', 0.2 * purpleSigils, null, { fmt: 'raw', note: purpleSigils + ' sigils' }),
        node('Exotic 48', exotic48, null, { fmt: 'raw', note: 'Lv ' + exLv }),
        node('Legend 36', legend36, null, { fmt: 'raw' }),
        node('Comp 88 × 50', 50 * comp88, null, { fmt: 'raw' }),
      ], { fmt: 'x', note: 'cap 4' }));
    }
    return node(data.name, val, children, { fmt: '+', note: 'bubble ' + id });
  },
};

export var sigil = {
  resolve: function(id, ctx) {
    var name = SIGIL_NAMES[id] || 'Sigil ' + id;
    var level = Number((S.cauldronP2WData[4] || [])[1 + 2 * id]) || 0;
    if (level < -0.1) return node(name, 0, null, { note: 'sigil ' + id });
    var tiers = SIGIL_BONUS[id];
    if (!tiers) return node(name, 0, null, { note: 'sigil ' + id });
    var base;
    if (level < 0.5) base = tiers[0];
    else if (level < 1.5) base = tiers[1];
    else if (level < 2.5) base = tiers[2];
    else if (level < 3.5) base = tiers[3];
    else base = tiers[4] || tiers[3];
    var artifactMulti = 1 + (ctx.dnsm && ctx.dnsm.artifactBonus16 || 0);
    var meritocMulti = 1 + ((ctx.dnsm && ctx.dnsm.meritocBonusz21) || 0) / 100;
    var val = base * artifactMulti * meritocMulti;
    return node(name, val, [
      node('Sigil Level', level, null, { fmt: 'raw' }),
      node('Base Bonus', base, null, { fmt: 'raw' }),
      node('Artifact 16 Bonus', artifactMulti, null, { fmt: 'x', note: 'artifact 16' }),
      node('Meritoc 21 Bonus', meritocMulti, null, { fmt: 'x', note: 'meritoc 21' }),
    ], { fmt: '+', note: 'sigil ' + id });
  },
};
