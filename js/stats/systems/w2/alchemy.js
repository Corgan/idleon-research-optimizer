// ===== ALCHEMY SYSTEM (W2) =====
// Alchemy bubble bonuses and sigil bonuses.

import { node } from '../../node.js';
import { label } from '../../entity-names.js';
import { cauldronInfoData, optionsListData, charClassData } from '../../../save/data.js';
import { formulaEval } from '../../../formulas.js';
import { sigilBonus as _sigilBonus, vaultUpgBonus } from '../common/goldenFood.js';
import { saveData } from '../../../state.js';
import { arcaneUpgBonus } from '../mc/tesseract.js';
import { computeMeritocBonusz } from '../w7/meritoc.js';
import { arcadeBonus } from './arcade.js';
import { legendPTSbonus } from '../w7/spelunking.js';
import { paletteParams } from '../../data/w4/gaming.js';
import { exoticParams } from '../../data/w5/farming.js';
import { sigilTiers } from '../../data/common/sigils.js';
import { rogBonusQTY } from '../w7/sushi.js';
import { bubbleParams } from '../../data/w2/alchemy.js';
import { companionBonus } from '../../data/common/companions.js';
import { AlchemyDescription } from '../../data/game/customlists.js';
import { mainframeBonus } from '../w4/lab.js';

// Number2Letter: cauldron index → letter used in prisma encoding
// Game's Number2Letter maps: 0→'_', 1→'a', 2→'b', 3→'c'
var CAULDRON_LETTER = ['_','a','b','c'];

// Bubble keys: cauldron/index pairs for named bubble lookups
var BUBBLE_KEYS = {
  DROPPIN_LOADS: { cauldron: 3, index: 1 },
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
  var cards1 = saveData.cards1Data || [];
  var hasW6Trophy = (Array.isArray(cards1) ? cards1.indexOf('Trophy23') >= 0
    : JSON.stringify(cards1).indexOf('Trophy23') >= 0) ? 10 : 0;
  // PaletteBonus(28): decay formula lv/(lv+25)*base, then ×legendMulti ×loreMulti
  var palLv = Number((saveData.spelunkData && saveData.spelunkData[9] && saveData.spelunkData[9][28]) || 0);
  var pal28 = paletteParams(28);
  var palRaw = palLv > 0 ? palLv / (palLv + pal28.denom) * pal28.base : 0;
  var palLegendMulti = 1 + legendPTSbonus(10) / 100;
  var loreFlag8 = Number((saveData.spelunkData && saveData.spelunkData[0] && saveData.spelunkData[0][8]) || 0) >= 1 ? 1 : 0;
  var palLoreMulti = 1 + 0.5 * loreFlag8;
  var palette28 = palRaw * palLegendMulti * palLoreMulti;
  // TotalPurpleSigils: count sigils at level >= 3 in CauldronP2W[4]
  var purpleSigils = 0;
  var sigArr = saveData.cauldronP2WData && saveData.cauldronP2WData[4];
  if (sigArr) {
    for (var si = 0; si < 24; si++) {
      if (Number(sigArr[1 + 2 * si]) >= 3) purpleSigils++;
    }
  }
  // ExoticBonusQTY(48): decay = base * lv / (denom + lv)
  var ex48 = exoticParams(48);
  var exLv = Number((saveData.farmUpgData && saveData.farmUpgData[ex48.farmSlot]) || 0);
  var exotic48 = exLv > 0 ? ex48.base * exLv / (ex48.denom + exLv) : 0;
  var legend36 = legendPTSbonus(36);
  // Companions(88) = rift4 companion: +Prisma Bubble bonus multi
  var comp88 = saveData.companionIds && saveData.companionIds.has(88) ? 1 : 0;
  // SushiStuff("RoG_BonusQTY", 23, 0)
  var sushiRoG23 = rogBonusQTY(23, saveData.cachedUniqueSushi || 0);
  var sum = arcane45 + arcade54 + sushiRoG23 + hasW6Trophy + palette28
    + 0.2 * purpleSigils + exotic48 + legend36 + 50 * comp88;
  return Math.min(4, 2 + sum / 100);
}

export { isBubblePrismad, getPrismaBonusMult };

// Compute the Y13 bubble bonus (CODFREY_RULZ_OK, Kazam index 32) for GalleryBonusMulti.
// Game: AlchBubbles.Y13 = CauldronStats("BubbleBonus", 3, 32, 0)
// "Y13" is the effect key (AlchemyDescription[3][32][15]), NOT array index 13.
export function bubbleBonusY13() {
  var data = bubbleParams(3, 32);
  if (!data) return 0;
  var lv = Number((cauldronInfoData && cauldronInfoData[data.cauldron] && cauldronInfoData[data.cauldron][data.index]) || 0);
  if (lv <= 0) return 0;
  var baseVal = formulaEval(data.formula, data.x1, data.x2, lv);
  var isPrisma = isBubblePrismad(data.cauldron, data.index);
  var prismaMult = isPrisma ? Math.max(1, getPrismaBonusMult()) : 1;
  return baseVal * prismaMult;
}

export var alchemy = {
  resolve: function(id, ctx) {
    var saveData = ctx.saveData;
    var bk = BUBBLE_KEYS[id];
    if (!bk) return node(label('Bubble', id), 0, null, { note: 'bubble ' + id });
    var bubbleId = [bk.cauldron, bk.index];
    var data = bubbleParams(bk.cauldron, bk.index);
    if (!data) return node(label('Bubble', bubbleId), 0, null, { note: 'bubble ' + id });
    var lv = Number((cauldronInfoData && cauldronInfoData[data.cauldron] && cauldronInfoData[data.cauldron][data.index]) || 0);
    if (lv <= 0) return node(label('Bubble', bubbleId), 0, null, { note: 'bubble ' + id });
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
      var cards1 = saveData.cards1Data || [];
      var hasW6Trophy = (Array.isArray(cards1) ? cards1.indexOf('Trophy23') >= 0
        : JSON.stringify(cards1).indexOf('Trophy23') >= 0) ? 10 : 0;
      var palLv = Number((saveData.spelunkData && saveData.spelunkData[9] && saveData.spelunkData[9][28]) || 0);
      var _pal28 = paletteParams(28);
      var palRaw = palLv > 0 ? palLv / (palLv + _pal28.denom) * _pal28.base : 0;
      var palLegendMulti = 1 + legendPTSbonus(10) / 100;
      var loreFlag8 = Number((saveData.spelunkData && saveData.spelunkData[0] && saveData.spelunkData[0][8]) || 0) >= 1 ? 1 : 0;
      var palLoreMulti = 1 + 0.5 * loreFlag8;
      var palette28 = palRaw * palLegendMulti * palLoreMulti;
      var purpleSigils = 0;
      var sigArr = saveData.cauldronP2WData && saveData.cauldronP2WData[4];
      if (sigArr) { for (var si = 0; si < 24; si++) { if (Number(sigArr[1 + 2 * si]) >= 3) purpleSigils++; } }
      var _ex48 = exoticParams(48);
      var exLv = Number((saveData.farmUpgData && saveData.farmUpgData[_ex48.farmSlot]) || 0);
      var exotic48 = exLv > 0 ? _ex48.base * exLv / (_ex48.denom + exLv) : 0;
      var legend36 = legendPTSbonus(36);
      var comp88 = saveData.companionIds && saveData.companionIds.has(88) ? 1 : 0;

      children.push(node('Prisma Bonus', prismaMult, [
        node(label('Arcane', 45), arcane45, null, { fmt: 'raw' }),
        node(label('Arcade', 54), arcade54val, null, { fmt: 'raw' }),
        node('W6 Trophy', hasW6Trophy, null, { fmt: 'raw' }),
        node(label('Palette', 28), palette28, palLv > 0 ? [
          node('Palette Lv', palLv, null, { fmt: 'raw' }),
          node(label('Legend', 10, ' \u00d7'), palLegendMulti, null, { fmt: 'x' }),
          node('Lore ×', palLoreMulti, null, { fmt: 'x' }),
        ] : null, { fmt: 'raw' }),
        node('Purple Sigils × 0.2', 0.2 * purpleSigils, null, { fmt: 'raw', note: purpleSigils + ' sigils' }),
        node(label('Exotic', 48), exotic48, null, { fmt: 'raw', note: 'Lv ' + exLv }),
        node(label('Legend', 36), legend36, null, { fmt: 'raw' }),
        node(label('Companion', 88, ' x 50'), 50 * comp88, null, { fmt: 'raw' }),
      ], { fmt: 'x', note: 'cap 4' }));
    }
    return node(label('Bubble', bubbleId), val, children, { fmt: '+', note: 'bubble ' + id });
  },
};

export var sigil = {
  resolve: function(id, ctx) {
    var saveData = ctx.saveData;
    var name = label('Sigil', id);
    var level = Number((saveData.cauldronP2WData[4] || [])[1 + 2 * id]) || 0;
    if (level < -0.1) return node(name, 0, null, { note: 'sigil ' + id });
    var tiers = sigilTiers(id);
    if (!tiers) return node(name, 0, null, { note: 'sigil ' + id });
    var base;
    if (level < 0.5) base = tiers[0];
    else if (level < 1.5) base = tiers[1];
    else if (level < 2.5) base = tiers[2];
    else if (level < 3.5) base = tiers[3];
    else base = tiers[4] || tiers[3];
    var artifactMulti = 1 + (Number((saveData.sailingData[3] || [])[16]) || 0 ? Math.max(1, Number((saveData.sailingData[3] || [])[16])) : 0);
    var meritocMulti = 1 + (computeMeritocBonusz(21) || 0) / 100;
    var val = base * artifactMulti * meritocMulti;
    return node(name, val, [
      node('Sigil Level', level, null, { fmt: 'raw' }),
      node('Base Bonus', base, null, { fmt: 'raw' }),
      node(label('Artifact', 16, ' Bonus'), artifactMulti, null, { fmt: 'x', note: 'artifact 16' }),
      node(label('Meritoc', 21), meritocMulti, null, { fmt: 'x' }),
    ], { fmt: '+', note: 'sigil ' + id });
  },
};

// ==================== BUBBLE BY KEY ====================
// Look up a bubble by its effect key (e.g. 'expACTIVE', 'kpkACTIVE') and return its value.

export function bubbleValByKey(key, charIdx) {
  for (var c2 = 0; c2 < 4; c2++) {
    var arr = AlchemyDescription[c2];
    if (!arr) continue;
    for (var i = 0; i < arr.length; i++) {
      if (arr[i] && arr[i][15] === key) {
        var lv = Number((cauldronInfoData && cauldronInfoData[c2] && cauldronInfoData[c2][i]) || 0);
        if (lv <= 0) return 0;
        var baseVal = formulaEval(arr[i][3], Number(arr[i][1]), Number(arr[i][2]), lv);
        var isPrisma = isBubblePrismad(c2, i);
        var prismaMult = isPrisma ? Math.max(1, getPrismaBonusMult()) : 1;
        var val = baseVal * prismaMult;
        var cls = Number(charClassData && charClassData[charIdx]) || 0;
        if (cls > 6 && i !== 16 && i < 30 &&
            key.indexOf('passz') < 0 && key.indexOf('ACTIVE') < 0 && key.indexOf('AllCharz') < 0) {
          if (c2 === 0 && cls < 18 && key !== 'Construction') {
            val *= Math.max(1, bubbleValByKey('Opassz'));
          } else if (c2 === 1 && cls >= 18 && cls < 30) {
            val *= Math.max(1, bubbleValByKey('Gpassz'));
          } else if (c2 === 2 && cls >= 30 && cls < 42) {
            val *= Math.max(1, bubbleValByKey('Ppassz'));
          }
        }
        return val;
      }
    }
  }
  return 0;
}

// ==================== VIAL BY KEY ====================
// Sum of all vials matching effect key, with lab/rift/vault/meritoc multipliers.

export function computeVialByKey(effectKey) {
  var vials = AlchemyDescription[4];
  if (!vials) return 0;
  var total = 0;
  for (var vi = 0; vi < vials.length; vi++) {
    if (!vials[vi] || vials[vi][11] !== effectKey) continue;
    var vialLv = Number((cauldronInfoData && cauldronInfoData[4] && cauldronInfoData[4][vi]) || 0);
    if (vialLv <= 0) continue;
    var rawVal = formulaEval(vials[vi][3], Number(vials[vi][1]) || 0, Number(vials[vi][2]) || 0, vialLv);
    var labMult = mainframeBonus(10) === 2 ? 2 : 1;
    var riftActive = Number(saveData.riftData && saveData.riftData[0]) > 34;
    var maxLvVials = 0;
    if (riftActive) {
      var ci4 = cauldronInfoData && cauldronInfoData[4];
      for (var rvi = 0; ci4 && rvi < ci4.length; rvi++) {
        if ((Number(ci4[rvi]) || 0) >= 13) maxLvVials++;
      }
    }
    var dNzz = (riftActive ? 2 * maxLvVials : 0) + (vaultUpgBonus(42) || 0);
    var meritoc20 = computeMeritocBonusz(20) || 0;
    total += labMult * (1 + dNzz / 100) * (1 + meritoc20 / 100) * rawVal;
  }
  return total;
}
