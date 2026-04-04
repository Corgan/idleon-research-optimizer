// ===== STAR SIGN SYSTEM =====
// Sum of all star sign bonuses for a given type.
// All star signs are active (enabledStarSigns covers all indices).
// Applies Seraph_Cosmos multiplier: chipMulti × meritocMulti × seraphMulti.

import { node } from '../../node.js';
import { label } from '../../entity-names.js';
import { saveData } from '../../../state.js';
import { labData } from '../../../save/data.js';
import { starSignDropVal } from '../../data/common/starSign.js';
import { computeMeritocBonusz } from '../w7/meritoc.js';

// Map bonus type → sign indices and accessor
var SIGN_TABLES = {
  drop: { indices: [14, 76], val: starSignDropVal },
};


// Silkrode Nanochip = chip ID 15, key "star", value 1
var STAR_CHIP_ID = 15;

/**
 * Compute the Seraph_Cosmos multiplier for all star sign bonuses.
 * Game: chipMulti × meritocMulti × min(5, pow(1.1 + min(Arcane[40],10)/100, ceil((summonLv+1)/20)))
 * Only applies when Seraph_Cosmos is unlocked in StarSignsUnlocked.
 * @param {number} charIdx - character index (for chip lookup)
 * @returns {number} total multiplier (>= 1)
 */
export function computeSeraphMulti(charIdx) {
  if (!saveData.starSignsUnlocked || !('Seraph_Cosmos' in saveData.starSignsUnlocked)) return 1;

  var arcane40 = Number(saveData.arcaneData && saveData.arcaneData[40]) || 0;
  // Summoning level = Lv0[18] for current char (game uses Lv0, not SL_)
  var lv0 = saveData.lv0AllData && saveData.lv0AllData[charIdx];
  var summonLv = Number(lv0 && lv0[18]) || 0;
  var seraphBase = 1.1 + Math.min(arcane40, 10) / 100;
  var seraphExp = Math.ceil((summonLv + 1) / 20);
  var seraphMulti = Math.min(5, Math.pow(seraphBase, seraphExp));

  // chipBonuses("star"): Silkrode Nanochip (chip 15) equipped on this char?
  var hasStarChip = false;
  var chipSlots = labData && labData[1 + charIdx];
  if (chipSlots) {
    for (var c = 0; c < 7; c++) {
      if (Number(chipSlots[c]) === STAR_CHIP_ID) { hasStarChip = true; break; }
    }
  }
  // enabledStarSigns: rift[0]>=10 → at least 5; else 0
  // chipMulti = max(1, min(2, 1 + chipBon * floor((999+enabled)/1000)))
  var riftLv = Number(saveData.riftData && saveData.riftData[0]) || 0;
  var enabledSS = riftLv >= 10 ? 5 : 0; // base 5; ShinyBonusS(3) adds more but floor((999+5)/1000)=1 already
  var chipMulti = (hasStarChip && enabledSS >= 1) ? Math.max(1, Math.min(2, 2)) : 1;

  // MeritocBonusz(22): star sign multi from voting
  var meritoc22 = computeMeritocBonusz(22);
  var meritocMulti = 1 + meritoc22 / 100;

  return chipMulti * meritocMulti * seraphMulti;
}

export var starSign = {
  resolve: function(id, ctx) {
    var saveData = ctx.saveData;
    // id = bonus type like 'drop'
    var table = SIGN_TABLES[id];
    if (!table) return node('Star Signs', 0, null, { note: 'starSign:' + id });
    // All star signs are active — sum every sign in the table.
    var baseTotal = 0;
    var signChildren = [];
    var indices = table.indices;
    for (var i = 0; i < indices.length; i++) {
      var idx = indices[i];
      var bonus = table.val(idx);
      var name = label('Star Sign', idx);
      signChildren.push(node(name, bonus, null, { fmt: '+' }));
      baseTotal += bonus;
    }
    if (baseTotal <= 0) return node('Star Signs', 0, signChildren, { fmt: '+', note: 'starSign:' + id });

    // === Seraph_Cosmos multiplier ===
    var totalMulti = computeSeraphMulti(ctx.charIdx);

    // Extract components for display
    var arcane40 = Number(saveData.arcaneData && saveData.arcaneData[40]) || 0;
    var lv0 = saveData.lv0AllData && saveData.lv0AllData[ctx.charIdx];
    var summonLv = Number(lv0 && lv0[18]) || 0;
    var seraphBase = 1.1 + Math.min(arcane40, 10) / 100;
    var seraphPow = Math.ceil((summonLv + 1) / 20);
    var seraphMulti = Math.min(5, Math.pow(seraphBase, seraphPow));

    var total = baseTotal * totalMulti;

    var children = [node('Base Sum', baseTotal, signChildren, { fmt: 'raw' })];

    // Display chip/meritoc breakdown
    var hasStarChip = false;
    var chipSlots = labData && labData[1 + ctx.charIdx];
    if (chipSlots) { for (var c = 0; c < 7; c++) { if (Number(chipSlots[c]) === STAR_CHIP_ID) { hasStarChip = true; break; } } }
    var riftLv = Number(saveData.riftData && saveData.riftData[0]) || 0;
    var chipMulti = (hasStarChip && riftLv >= 10) ? 2 : 1;
    var meritoc22 = computeMeritocBonusz(22);
    var meritocMulti = 1 + meritoc22 / 100;

    var multiCh = [
      node('Seraph Cosmos', seraphMulti, [
        node('Astrology Cultism', arcane40, null, { fmt: 'raw', note: 'Arcane[40]' }),
        node('Summoning Level', summonLv, null, { fmt: 'raw' }),
        node('Base', seraphBase, null, { fmt: 'x' }),
        node('Power', seraphPow, null, { fmt: 'raw' }),
      ], { fmt: 'x' }),
    ];
    if (chipMulti > 1) multiCh.push(node('Silkrode Nanochip', chipMulti, null, { fmt: 'x', note: 'chip 15' }));
    if (meritoc22 > 0) multiCh.push(node('Meritoc Bonus', meritocMulti, null, { fmt: 'x', note: 'meritoc 22' }));
    children.push(node('Seraph Multiplier', totalMulti, multiCh, { fmt: 'x' }));

    return node('Star Signs', total, children, { fmt: '+', note: 'starSign:' + id });
  },
};
