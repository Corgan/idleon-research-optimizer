// ===== STAMP SYSTEM (W1) =====
// Stamp book bonuses through decay formula.
// Exalted stamps get ×StampExalted_double = 1 + StampDoubler/100.
// StampDoubler = 100 + 9 sources (Atom12, Pristine20, CompassBonus76,
//   EmperorSet, 20×EventShop18, Palette23, Exotic49, Spelunk[4][3], Legend36).

import { node } from '../../node.js';
import { S } from '../../../state.js';
import { stampLvData } from '../../../save/data.js';
import { formulaEval } from '../../../save/engine.js';
import { eventShopOwned } from '../../../save/helpers.js';
import { pristineBon, getSetBonus } from '../common/goldenFood.js';
import { mainframeBonus } from '../w4/lab.js';
import { legendPTSbonus } from '../../systems/w7/spelunking.js';
import {
  EXOTIC_49, PALETTE_23, COMPASS_UPG_76,
} from '../../../game-data.js';

var STAMP_DATA = {
  // StampA38 = Golden Sixes (ID=37, cat 0 index 37): "DropRate,decay,20,80,10,..."
  A38: { cat: 0, idx: 37, x1: 20, x2: 80, formula: 'decay', name: 'Drop Rate Stamp' },
};

// Number2Letter mapping for stamp key encoding: cat → letter
// Game's Number2Letter: [0]='_', [1]='a', [2]='b', [3]='c'
var N2L = '_abcdefghijklmnopqrstuvwxyz';

function stampKey(cat, idx) {
  return (N2L[cat] || '_') + idx;
}

function isExalted(cat, idx) {
  var key = stampKey(cat, idx);
  var exaltedArr = S.compassData && S.compassData[4];
  if (!exaltedArr || !Array.isArray(exaltedArr)) return false;
  return exaltedArr.indexOf(key) !== -1;
}

function computeStampDoublerSources(ctx) {
  var dnsm = ctx && ctx.dnsm;

  // Source 1: AtomBonuses(12) = Atoms[12] × perLv(1)
  var atom12 = Number(S.atomsData[12]) || 0;

  // Source 2: PristineBon(20) — Pristine Charm 20
  var prist20 = pristineBon(20);

  // Source 3: CompassBonus(76) — Compass upgrade level × perLevel
  var compassLv = (S.compassData && S.compassData[0] && Number(S.compassData[0][76])) || 0;
  var compass76 = compassLv * COMPASS_UPG_76.perLevel;

  // Source 4: GetSetBonus("EMPEROR_SET", "Bonus")
  var emperorSet = dnsm ? getSetBonus(dnsm, 'EMPEROR_SET') : 0;

  // Source 5: 20 × EventShopOwned(18)
  var evShop18 = 20 * eventShopOwned(18, S.cachedEventShopStr);

  // Source 6: PaletteBonus(23) — Honey_Yellow palette (decay type)
  // Game applies ×(1+LegendPTS_bonus(10)/100) × (1+0.5*loreFlag8) to all palette bonuses
  var paletteLv = (S.spelunkData && S.spelunkData[9] && Number(S.spelunkData[9][23])) || 0;
  var palRaw23 = paletteLv > 0
    ? paletteLv / (paletteLv + PALETTE_23.denom) * PALETTE_23.base
    : 0;
  var palLegendMulti = 1 + legendPTSbonus(10) / 100;
  var loreFlag8 = (Number((S.spelunkData && S.spelunkData[0] && S.spelunkData[0][8]) || 0) >= 1) ? 1 : 0;
  var palLoreMulti = 1 + 0.5 * loreFlag8;
  var palette23 = palRaw23 * palLegendMulti * palLoreMulti;

  // Source 7: ExoticBonusQTY(49) — EXALTED_ELDOU (decay type)
  var exoticLv = (S.farmUpgData && Number(S.farmUpgData[EXOTIC_49.farmSlot])) || 0;
  var exotic49 = exoticLv > 0
    ? EXOTIC_49.base * exoticLv / (EXOTIC_49.denom + exoticLv)
    : 0;

  // Source 8: Math.round(Spelunk[4][3])
  var spelunk43 = Math.round(Number((S.spelunkData && S.spelunkData[4] && S.spelunkData[4][3]) || 0));

  // Source 9 (additive to 100): LegendPTS_bonus(36)
  var legend36 = legendPTSbonus(36);

  var innerSum = atom12 + prist20 + compass76 + emperorSet + evShop18
    + palette23 + exotic49 + spelunk43;
  var total = 100 + innerSum + legend36;

  var children = [
    node('Base Doubler', 100, null, { fmt: 'raw' }),
    node('Atom 12 (Aluminium)', atom12, null, { fmt: '+' }),
    node('Pristine Charm 20', prist20, null, { fmt: '+' }),
    node('Compass Upg 76', compass76, compass76 > 0 ? [
      node('Compass Level', compassLv, null, { fmt: 'raw' }),
    ] : null, { fmt: '+' }),
    node('Emperor Set', emperorSet, null, { fmt: '+' }),
    node('Event Shop 18 (×20)', evShop18, null, { fmt: '+' }),
    node('Palette 23 (Honey)', palette23, paletteLv > 0 ? [
      node('Palette Level', paletteLv, null, { fmt: 'raw' }),
    ] : null, { fmt: '+' }),
    node('Exotic 49 (Eldou)', exotic49, exoticLv > 0 ? [
      node('Exotic Level', exoticLv, null, { fmt: 'raw' }),
    ] : null, { fmt: '+' }),
    node('Spelunk[4][3]', spelunk43, null, { fmt: '+' }),
    node('Legend 36', legend36, null, { fmt: '+' }),
  ];

  return { total: total, children: children };
}

export { stampKey, isExalted, computeStampDoublerSources };

export var stamp = {
  resolve: function(id, ctx) {
    var data = STAMP_DATA[id];
    if (!data) return node('Stamp ' + id, 0, null, { note: 'stamp ' + id });
    var lv = Number((stampLvData && stampLvData[data.cat] && stampLvData[data.cat][data.idx]) || 0);
    if (lv <= 0) return node(data.name, 0, null, { note: 'stamp ' + id });
    var baseVal = formulaEval(data.formula, data.x1, data.x2, lv);

    var exalted = isExalted(data.cat, data.idx);
    var doublerInfo = computeStampDoublerSources(ctx);
    var exaltedMulti = exalted ? 1 + doublerInfo.total / 100 : 1;
    var val = baseVal * exaltedMulti;

    // Post-loop multipliers from StampBonusOfTypeX (apply to non-MISC stamps: cat < 2)
    var labDouble = 1;
    var pristineMulti = 1;
    if (data.cat < 2) {
      // Certified Stamp Book (lab node 7): doubles all non-MISC stamps when connected
      if (mainframeBonus(7) === 2) labDouble = 2;
      // Pristine Charm 17 (Liquorice Rolle): ×(1 + PristineBon(17)/100)
      var prist17 = pristineBon(17);
      if (prist17 > 0) pristineMulti = 1 + prist17 / 100;
      val = val * labDouble * pristineMulti;
    }

    var stampChildren = [
      node('Stamp Level', lv, null, { fmt: 'raw' }),
      node('Formula Result', baseVal, null, { fmt: 'raw', note: data.formula + '(' + data.x1 + ',' + data.x2 + ',' + lv + ')' }),
    ];

    if (exalted) {
      stampChildren.push(
        node('Exalted ×', exaltedMulti, [
          node('StampDoubler', doublerInfo.total, doublerInfo.children, { fmt: 'raw' }),
        ], { fmt: 'x' })
      );
    } else {
      stampChildren.push(
        node('Exalted', 0, [
          node('Not exalted (Compass[4] missing key "' + stampKey(data.cat, data.idx) + '")', 0, null, { fmt: 'raw' }),
          node('StampDoubler (if exalted)', doublerInfo.total, doublerInfo.children, { fmt: 'raw' }),
        ], { fmt: 'raw', note: 'inactive' })
      );
    }

    if (data.cat < 2) {
      if (labDouble > 1) {
        stampChildren.push(node('Certified Stamp Book ×', labDouble, null, { fmt: 'x', note: 'Lab node 7' }));
      }
      if (pristineMulti > 1) {
        stampChildren.push(node('Liquorice Rolle ×', pristineMulti, null, { fmt: 'x', note: 'Pristine 17' }));
      }
    }

    return node(data.name, val, stampChildren, { fmt: '+', note: 'stamp ' + id });
  },
};
