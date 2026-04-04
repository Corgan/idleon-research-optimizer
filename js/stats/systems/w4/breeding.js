// ===== BREEDING SYSTEM (W4) =====
// Shiny pet breeding bonuses.

import { node } from '../../node.js';
import { label } from '../../entity-names.js';
import { saveData } from '../../../state.js';
import {
  PET_SHINY_TYPE, PET_NAMES, SHINY_BONUS_PER_LV, SHINY_TYPE_TO_CAT,
  SHINY_CAT_NAMES,
} from '../../data/w4/breeding.js';

function shinyLvFromExp(exp) {
  if (exp <= 0) return 0;
  var lv = 1;
  for (var e = 0; e < 19; e++) {
    if (exp > Math.floor((1 + Math.pow(e + 1, 1.6)) * Math.pow(1.7, e + 1)))
      lv = e + 2;
  }
  return lv;
}

export function computeShinyBonusS(catKey) {
  var total = 0;
  for (var world = 0; world < 4; world++) {
    var shinyExps = saveData.breedingData[22 + world];
    var petTypes = PET_SHINY_TYPE[world];
    if (!shinyExps || !petTypes) continue;
    for (var pet = 0; pet < petTypes.length; pet++) {
      var exp = shinyExps[pet] || 0;
      if (exp <= 0) continue;
      var shinyTypeIdx = petTypes[pet];
      var cat = SHINY_TYPE_TO_CAT[shinyTypeIdx];
      if (cat !== catKey) continue;
      var shinyLv = shinyLvFromExp(exp);
      var bonusPerLv = SHINY_BONUS_PER_LV[shinyTypeIdx] || 0;
      total += Math.round(shinyLv * bonusPerLv);
    }
  }
  return total;
}

export var shiny = {
  resolve: function(id, ctx) {
    var catName = SHINY_CAT_NAMES[id] || '#' + id;
    var children = [];
    var total = 0;
    for (var world = 0; world < 4; world++) {
      var shinyExps = ctx.saveData.breedingData[22 + world];
      var petTypes = PET_SHINY_TYPE[world];
      if (!shinyExps || !petTypes) continue;
      for (var pet = 0; pet < petTypes.length; pet++) {
        var exp = shinyExps[pet] || 0;
        if (exp <= 0) continue;
        var shinyTypeIdx = petTypes[pet];
        var cat = SHINY_TYPE_TO_CAT[shinyTypeIdx];
        if (cat !== id) continue;
        var shinyLv = shinyLvFromExp(exp);
        var bonusPerLv = SHINY_BONUS_PER_LV[shinyTypeIdx] || 0;
        var val = Math.round(shinyLv * bonusPerLv);
        total += val;
        var petName = (PET_NAMES[world] && PET_NAMES[world][pet]) || 'W' + world + ' P' + pet;
        children.push(node(petName, val, [
          node('Shiny Lv', shinyLv, null, { fmt: 'raw' }),
          node('Bonus/Lv', bonusPerLv, null, { fmt: 'raw' }),
          node('Shiny EXP', exp, null, { fmt: 'raw' }),
        ], { fmt: '+' }));
      }
    }
    return node(label('Breeding', id), total, children.length ? children : null, { fmt: '+', note: 'breeding shiny ' + id });
  },
};
